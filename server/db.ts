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

// 🔥 CONFIGURAÇÕES OTIMIZADAS PARA ALTA CARGA (200+ msgs/min)
// CORREÇÃO: Circuit breaker error XX000 devido a pool subdimensionado
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool dimensionado para alta carga (3x maior que antes)
  max: isPoolerConnection ? 10 : 15,  // ✅ Aumentado de 3/5 para 10/15
  min: 2,  // ✅ Mantém 2 conexões sempre prontas (antes era 0)
  // Timeouts relaxados para evitar falhas prematuras
  idleTimeoutMillis: isPoolerConnection ? 20000 : 60000,  // ✅ 20s/60s (antes 5s/30s)
  connectionTimeoutMillis: 30000,  // ✅ 30s (antes 15s)
  statement_timeout: 30000,  // ✅ 30s por query (antes 10s)
  allowExitOnIdle: false,
  // Retry automático em caso de falha
  retryStrategy: () => 5000,
};

export const pool = new Pool(poolConfig);

// Tratamento de erros do pool - NÃO crashar o servidor
pool.on('error', (err) => {
  console.error('❌ [DB Pool] Erro na conexão:', err.message);
});

// Log de conexão para debug (apenas em dev)
if (process.env.NODE_ENV !== 'production') {
  pool.on('connect', (_client: PoolClient) => {
    console.log('🔗 [DB Pool] Nova conexão estabelecida');
  });

  pool.on('remove', () => {
    console.log('🔌 [DB Pool] Conexão removida do pool');
  });
}

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

// Configurar drizzle SEM prepared statements para compatibilidade com PgBouncer
// PgBouncer em modo "transaction" não suporta prepared statements
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: process.env.NODE_ENV !== 'production',
});
