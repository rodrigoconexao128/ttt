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

// Configurações otimizadas para Supabase com Disk IO limitado
// IMPORTANTE: PgBouncer (porta 6543) tem limitações com prepared statements
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool configurado para funcionar com PgBouncer + economia de recursos
  // OTIMIZAÇÃO: Aumentamos max para evitar filas, mas com timeout agressivo
  max: isPoolerConnection ? 3 : 5, // 3 conexões max para balancear throughput vs recursos
  min: 0, // Não manter conexões ociosas
  idleTimeoutMillis: isPoolerConnection ? 5000 : 30000, // Liberar conexões ociosas rápido
  connectionTimeoutMillis: 15000, // Timeout de 15s (reduzido para falhar rápido)
  // Timeout para queries individuais (evita queries longas travarem o pool)
  statement_timeout: 10000, // 10 segundos max por query
  // IMPORTANTE: allowExitOnIdle: false para manter o servidor rodando
  allowExitOnIdle: false,
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
