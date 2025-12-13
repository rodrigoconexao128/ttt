import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Detectar se está usando Supabase Pooler (porta 6543)
const rawDbUrl = process.env.DATABASE_URL;
const directDbUrl = process.env.DATABASE_URL_DIRECT;

const shouldPreferDirect =
  process.env.SUPABASE_PREFER_DIRECT === 'true' ||
  (process.env.NODE_ENV === 'production' && process.env.SUPABASE_PREFER_DIRECT !== 'false');

function buildDirectSupabaseUrlFromPooler(url: string): string | null {
  try {
    const parsed = new URL(url);

    const username = decodeURIComponent(parsed.username);
    const match = username.match(/^postgres\.([a-z0-9]+)$/i);
    const projectRef = match?.[1];
    if (!projectRef) return null;

    parsed.hostname = `db.${projectRef}.supabase.co`;
    parsed.port = '5432';
    return parsed.toString();
  } catch {
    return null;
  }
}

const isPoolerConnection = rawDbUrl.includes(':6543') || rawDbUrl.includes('pooler.supabase.com');
const derivedDirectDbUrl = isPoolerConnection ? buildDirectSupabaseUrlFromPooler(rawDbUrl) : null;
const dbUrl = (shouldPreferDirect && (directDbUrl || derivedDirectDbUrl)) ? (directDbUrl || derivedDirectDbUrl)! : rawDbUrl;
const usingDerivedDirect = shouldPreferDirect && !directDbUrl && !!derivedDirectDbUrl;

console.log(
  `[DB] Modo de conexão: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'}${usingDerivedDirect ? ' (derived direct URL)' : ''}`,
);

// Configurações otimizadas para Supabase
// IMPORTANTE: PgBouncer (porta 6543) tem limitações com prepared statements
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool configurado para funcionar com PgBouncer
  // Em produção o painel faz várias requisições em paralelo.
  // Com max=1 essas requisições ficam na fila e estouram connectionTimeoutMillis (erro: "timeout exceeded when trying to connect").
  max: isPoolerConnection ? 3 : 5,
  min: 0,
  idleTimeoutMillis: isPoolerConnection ? 10000 : 30000,
  connectionTimeoutMillis: isPoolerConnection ? 120000 : 30000,
  allowExitOnIdle: true,
};

export const pool = new Pool(poolConfig);

// PgBouncer (transaction pooling) pode falhar com prepared statements.
// Forçamos o protocolo "simple" quando estiver usando o pooler, para reduzir "DbHandler exited" e instabilidade.
if (isPoolerConnection) {
  const originalQuery = pool.query.bind(pool);

  (pool as any).query = (queryTextOrConfig: any, valuesOrCallback?: any, callback?: any) => {
    // pg suporta overloads: query(text, values?, cb?) e query(config, cb?)
    if (typeof queryTextOrConfig === 'string') {
      const values = Array.isArray(valuesOrCallback) ? valuesOrCallback : undefined;
      const cb = typeof valuesOrCallback === 'function' ? valuesOrCallback : callback;
      return originalQuery({ text: queryTextOrConfig, values, queryMode: 'simple' } as any, cb);
    }

    if (queryTextOrConfig && typeof queryTextOrConfig === 'object' && typeof queryTextOrConfig.text === 'string') {
      const cb = typeof valuesOrCallback === 'function' ? valuesOrCallback : callback;
      return originalQuery({ ...queryTextOrConfig, queryMode: 'simple' } as any, cb);
    }

    return originalQuery(queryTextOrConfig as any, valuesOrCallback as any, callback as any);
  };
}

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
