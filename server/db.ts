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

    // Ensure admin_broadcast_messages table exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_broadcast_messages (
        id TEXT PRIMARY KEY,
        broadcast_id TEXT NOT NULL,
        admin_id TEXT NOT NULL,
        user_id TEXT,
        recipient_phone TEXT NOT NULL,
        recipient_name TEXT NOT NULL DEFAULT 'Cliente',
        message_original TEXT,
        message_sent TEXT NOT NULL,
        ai_varied BOOLEAN DEFAULT false,
        status TEXT DEFAULT 'sent',
        error_message TEXT,
        sent_at TIMESTAMP DEFAULT now()
      )
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id 
      ON admin_broadcast_messages(broadcast_id)
    `);
    console.log('✅ [DB] Tabela admin_broadcast_messages garantida');

    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao verificar/criar tabelas:', error.message);
  }
}, 5000);

// ============================================================================
// AUTO-MIGRATION: Corrigir constraint de status em payment_receipts
// ============================================================================
setTimeout(async () => {
  try {
    const client = await pool.connect();

    // Verificar se a constraint já inclui 'cancelled'
    const checkConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'payment_receipts'::regclass
      AND conname = 'payment_receipts_status_check'
    `);

    const constraintDef = checkConstraint.rows[0]?.definition || '';
    if (constraintDef && !constraintDef.includes('cancelled')) {
      console.log('[DB] Atualizando constraint de status em payment_receipts...');
      await client.query(`ALTER TABLE payment_receipts DROP CONSTRAINT payment_receipts_status_check`);
      await client.query(`
        ALTER TABLE payment_receipts 
        ADD CONSTRAINT payment_receipts_status_check 
        CHECK (status::text = ANY (ARRAY['pending'::varchar, 'approved'::varchar, 'rejected'::varchar, 'cancelled'::varchar]::text[]))
      `);
      console.log('✅ [DB] Constraint de status em payment_receipts atualizada!');
    }

    client.release();
  } catch (error: any) {
    // Pode falhar se a tabela não existir ainda - não é crítico
    if (!error.message?.includes('does not exist')) {
      console.error('❌ [DB] Erro ao atualizar constraint payment_receipts:', error.message);
    }
  }
}, 6000);

// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer Transaction mode
// PgBouncer em modo "transaction" não suporta prepared statements
// V13: Disable verbose SQL query logging (was polluting stdout with multi-KB query dumps)
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: false,
  ...(isPoolerConnection ? { casing: undefined } : {}),
});

// ============================================================================
// AUTO-MIGRATION: Garantir tabela admin_autologin_tokens
// ============================================================================
setTimeout(async () => {
  try {
    const client = await pool.connect();

    await client.query(`
      CREATE TABLE IF NOT EXISTS admin_autologin_tokens (
        token TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        expires_at TIMESTAMPTZ NOT NULL,
        used_at TIMESTAMPTZ,
        redirect_to TEXT NOT NULL DEFAULT '/conexao'
      );
      CREATE INDEX IF NOT EXISTS idx_autologin_user_id ON admin_autologin_tokens(user_id);
      CREATE INDEX IF NOT EXISTS idx_autologin_expires ON admin_autologin_tokens(expires_at);
      -- Migration: add redirect_to column if table already exists without it
      ALTER TABLE admin_autologin_tokens ADD COLUMN IF NOT EXISTS redirect_to TEXT NOT NULL DEFAULT '/conexao';
    `);

    console.log('✅ [DB] Tabela admin_autologin_tokens garantida');

    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Erro ao garantir tabela admin_autologin_tokens:', error.message || error);
  }
}, 7000);
