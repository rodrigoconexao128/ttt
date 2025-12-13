import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configurações otimizadas para Supabase Pooler (PgBouncer) no Railway
// IMPORTANTE: Supabase usa PgBouncer em modo "transaction" que requer configurações especiais
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool muito conservador para evitar problemas com PgBouncer
  max: 3, // Reduzido ainda mais - PgBouncer já faz pooling
  min: 0, // Não manter conexões mínimas - deixar PgBouncer gerenciar
  idleTimeoutMillis: 10000, // Fechar conexões idle rapidamente (10s)
  connectionTimeoutMillis: 30000, // Timeout generoso de 30s para conexão
  allowExitOnIdle: true, // Permitir fechar quando idle
  // Keep-alive para evitar drops de conexão
  keepAlive: true,
  keepAliveInitialDelayMillis: 5000,
  // Query timeout - importante para PgBouncer
  query_timeout: 30000,
  statement_timeout: 30000,
};

export const pool = new Pool(poolConfig);

// Tratamento de erros do pool - NÃO crashar o servidor
pool.on('error', (err) => {
  console.error('❌ [DB Pool] Erro na conexão idle:', err.message);
  // Não propagar o erro - deixar o pool se recuperar sozinho
});

// Log de conexão para debug
pool.on('connect', (_client: PoolClient) => {
  console.log('🔗 [DB Pool] Nova conexão estabelecida');
});

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Conexão removida do pool');
});

// Função helper para executar query com retry automático
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 5,
  delayMs: number = 2000
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
        error.message?.includes('connection timeout') ||
        error.message?.includes('Query read timeout') ||
        error.message?.includes('unexpectedly') ||
        error.code === 'ECONNRESET' ||
        error.code === 'ETIMEDOUT' ||
        error.code === '57P01'; // admin_shutdown
      
      if (isRetryable && attempt < maxRetries) {
        const waitTime = delayMs * attempt; // Linear backoff (2s, 4s, 6s, 8s)
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
    // Não crashar - o app pode se recuperar depois
  }
}, 1000);

export const db = drizzle({ client: pool, schema });
