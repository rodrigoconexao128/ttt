import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detectar se está usando Supabase Pooler (porta 6543)
// NOTA: NÃO derivamos automaticamente a URL direta porque:
// 1) O Supabase direct (db.<ref>.supabase.co) resolve para IPv6, que o Railway não alcança (ENETUNREACH)
// 2) O Pooler (pooler.supabase.com:6543) funciona bem e resolve IPv4
// Se você quiser forçar conexão direta, defina DATABASE_URL_DIRECT no Railway.
const rawDbUrl = process.env.DATABASE_URL;
const directDbUrl = process.env.DATABASE_URL_DIRECT;

// Só usa direct se explicitamente fornecido via DATABASE_URL_DIRECT
const dbUrl = directDbUrl || rawDbUrl;
const isPoolerConnection = dbUrl.includes(':6543') || dbUrl.includes('pooler.supabase.com');

console.log(
  `[DB] Modo de conexão: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'}`,
);

// 🔥 CONFIGURAÇÃO COM LOGS DETALHADOS E RETRY (Debug circuit breaker)
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool CONSERVADOR para diagnóstico
  max: isPoolerConnection ? 5 : 7,  // Reduzido de 10/15 para diagnóstico
  min: 1,  // Mantém 1 conexão pronta
  idleTimeoutMillis: isPoolerConnection ? 30000 : 60000,
  connectionTimeoutMillis: 45000,  // 45s para dar tempo
  statement_timeout: 30000,
  allowExitOnIdle: false,
  
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

// 🔍 LOGS DETALHADOS PARA DIAGNÓSTICO
pool.on('connect', () => {
  console.log('✅ [DB Pool] Nova conexão ESTABELECIDA');
});

pool.on('acquire', () => {
  console.log('🔗 [DB Pool] Conexão ADQUIRIDA do pool');
});

pool.on('error', (err: any) => {
  console.error('❌ [DB Pool] ERRO:', err.message);
  console.error('   Code:', err.code);
  console.error('   Severity:', err.severity);
});

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Conexão REMOVIDA');
});

// 🧪 Teste de autenticação inicial COM LOGS DETALHADOS
setTimeout(async () => {
  console.log('🔍 [DB] === TESTE DE AUTENTICAÇÃO INICIAL ===');
  try {
    const start = Date.now();
    console.log('[DB] 1. Tentando conectar...');
    
    const client = await pool.connect();
    const connectTime = Date.now() - start;
    console.log(`✅ [DB] 2. Conectado em ${connectTime}ms`);
    
    console.log('[DB] 3. Executando query de teste...');
    const result = await client.query('SELECT current_user, current_database(), version()');
    const queryTime = Date.now() - start;
    
    console.log(`✅ [DB] 4. Query executada em ${queryTime - connectTime}ms`);
    console.log('[DB] === AUTENTICAÇÃO OK ===');
    console.log('   User:', result.rows[0].current_user);
    console.log('   Database:', result.rows[0].current_database);
    console.log('   Version:', result.rows[0].version.substring(0, 50) + '...');
    
    client.release();
    console.log('[DB] 5. Conexão liberada de volta ao pool');
  } catch (error: any) {
    console.error('❌ [DB] === FALHA NA AUTENTICAÇÃO ===');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Severity:', error.severity);
    console.error('   Detail:', error.detail);
    console.error('   Hint:', error.hint);
    console.error('===================================');
  }
}, 3000);

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

// Teste de conexão inicial (não-bloqueante)
setTimeout(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ [DB] Conexão inicial com o banco de dados OK');
  } catch (error: any) {
    console.error('❌ [DB] Falha na conexão inicial:', error.message);
  }
}, 1000);

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

// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer
// PgBouncer em modo "transaction" não suporta prepared statements
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: process.env.NODE_ENV !== 'production',
});
