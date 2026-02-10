import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detectar se está usando Supabase Pooler
// NOTA: NÃO derivamos automaticamente a URL direta porque:
// 1) O Supabase direct (db.<ref>.supabase.co) resolve para IPv6, que o Railway não alcança (ENETUNREACH)
// 2) O Pooler (pooler.supabase.com:6543) funciona bem e resolve IPv4
// Se você quiser forçar conexão direta, defina DATABASE_URL_DIRECT no Railway.
const rawDbUrl = process.env.DATABASE_URL;
const directDbUrl = process.env.DATABASE_URL_DIRECT;

// Força porta 6543 (Transaction mode) se estiver usando porta 5432 (Session mode)
// Session mode tem limite severo de clientes = pool_size do servidor
let dbUrl = directDbUrl || rawDbUrl;
const isPoolerConnection = dbUrl.includes('pooler.supabase.com');
if (isPoolerConnection && dbUrl.includes(':5432')) {
  dbUrl = dbUrl.replace(':5432', ':6543');
  console.log('[DB] ⚠️ Porta alterada de 5432 (Session) para 6543 (Transaction) para evitar MaxClientsInSessionMode');
}

console.log(
  `[DB] Modo de conexão: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'}`,
);

// 🔥 CONFIGURAÇÃO OTIMIZADA PARA PGBOUNCER TRANSACTION MODE
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool CONSERVADOR - PgBouncer Transaction mode libera conexão após cada query
  max: isPoolerConnection ? 3 : 7,  // 3 para pooler (transaction mode libera rápido)
  min: 0,  // Não manter conexões ociosas em transaction mode
  idleTimeoutMillis: isPoolerConnection ? 10000 : 60000,  // Libera rápido em pooler
  connectionTimeoutMillis: 30000,
  statement_timeout: 30000,
  allowExitOnIdle: true,  // Permite liberar conexões quando ocioso
  
  // Retry com backoff exponencial
  retryStrategy: (times: number) => {
    if (times > 5) {
      console.log(`[DB] Max retries (5) atingido, desistindo`);
      return false;
    }
    const delay = Math.min(times * 2000, 15000);
    console.log(`⏳ [DB] Retry #${times} após ${delay}ms`);
    return delay;
  },
};

export const pool = new Pool(poolConfig);

// Logs de diagnóstico (reduzidos para produção)
pool.on('connect', () => {
  console.log('✅ [DB Pool] Nova conexão ESTABELECIDA');
});

pool.on('error', (err: any) => {
  console.error('❌ [DB Pool] ERRO:', err.message, '| Code:', err.code);
});

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Conexão REMOVIDA');
});

// 🔄 Graceful shutdown - libera conexões no PgBouncer
const gracefulShutdown = async (signal: string) => {
  console.log(`\n🛑 [DB] Recebido ${signal}, encerrando pool de conexões...`);
  try {
    await pool.end();
    console.log('✅ [DB] Pool encerrado com sucesso');
  } catch (err: any) {
    console.error('❌ [DB] Erro ao encerrar pool:', err.message);
  }
  process.exit(0);
};
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// 🧪 Teste de autenticação inicial único
setTimeout(async () => {
  try {
    const start = Date.now();
    const result = await pool.query('SELECT current_user, current_database()');
    console.log(`✅ [DB] Autenticação OK em ${Date.now() - start}ms | User: ${result.rows[0].current_user} | DB: ${result.rows[0].current_database}`);
  } catch (error: any) {
    console.error('❌ [DB] Falha na autenticação:', error.message, '| Code:', error.code);
  }
}, 2000);

// Função helper para executar query com retry automático
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      const isRetryable = 
        error.message?.includes('Connection terminated') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET') ||
        error.message?.includes('DbHandler exited') ||
        error.message?.includes('unexpectedly') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01' ||
        error.code === 'XX000'; // DbHandler exited
      
      if (isRetryable && attempt < maxRetries) {
        const waitTime = delayMs * attempt;
        console.warn(`⚠️ [DB] Query falhou (tentativa ${attempt}/${maxRetries}), retry em ${waitTime}ms: ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue;
      }
      
      throw error;
    }
  }
  
  throw lastError;
}

// Teste de conexão removido - já temos o teste de autenticação acima

// ============================================================================
// AUTO-MIGRATION: Criar tabelas que podem não existir ainda
// ============================================================================
setTimeout(async () => {
  console.log('[DB] Verificando tabelas necessárias...');
  try {
    const client = await pool.connect();

    // Verificar se tabela contact_lists existe
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'contact_lists'
      );
    `);

    if (!checkTable.rows[0].exists) {
      console.log('[DB] Tabela contact_lists não existe, criando...');

      await client.query(`
        CREATE TABLE IF NOT EXISTS contact_lists (
          id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name VARCHAR(255) NOT NULL,
          description TEXT,
          contacts JSONB DEFAULT '[]'::jsonb,
          contact_count INTEGER DEFAULT 0 NOT NULL,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON contact_lists(user_id);
        CREATE INDEX IF NOT EXISTS idx_contact_lists_created ON contact_lists(created_at);
      `);

      console.log('✅ [DB] Tabela contact_lists criada com sucesso!');
    } else {
      console.log('✅ [DB] Tabela contact_lists já existe');
    }

    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao verificar/criar tabelas:', error.message);
  }
}, 5000);

// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer Transaction mode
// PgBouncer em modo "transaction" não suporta prepared statements
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: process.env.NODE_ENV !== 'production',
  ...(isPoolerConnection ? { casing: undefined } : {}),
});
