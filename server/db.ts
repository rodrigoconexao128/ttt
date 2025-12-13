import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

// Configurações otimizadas para Supabase Pooler (PgBouncer) no Railway
const poolConfig = {
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool otimizado para PgBouncer/Supabase
  max: 5, // Reduzido para evitar sobrecarregar o PgBouncer
  min: 1, // Manter pelo menos 1 conexão ativa
  idleTimeoutMillis: 20000, // Fechar conexões idle após 20s
  connectionTimeoutMillis: 15000, // Timeout mais generoso para conexão
  allowExitOnIdle: false, // Manter pool ativo
  // Retry de conexão
  keepAlive: true,
  keepAliveInitialDelayMillis: 10000,
};

export const pool = new Pool(poolConfig);

// Contador de reconexões
let reconnectCount = 0;
const MAX_RECONNECTS = 5;

// Tratamento de erros do pool para evitar crash do servidor
pool.on('error', async (err) => {
  console.error('❌ [DB Pool] Erro inesperado na conexão idle:', err.message);
  
  // Tentar reconectar se for erro de conexão
  if (err.message.includes('Connection terminated') || err.message.includes('timeout')) {
    if (reconnectCount < MAX_RECONNECTS) {
      reconnectCount++;
      console.log(`🔄 [DB Pool] Tentando reconectar (${reconnectCount}/${MAX_RECONNECTS})...`);
      
      // Aguarda um pouco antes de reconectar
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      try {
        // Tenta obter uma nova conexão para testar
        const client = await pool.connect();
        await client.query('SELECT 1');
        client.release();
        console.log('✅ [DB Pool] Reconexão bem sucedida!');
        reconnectCount = 0; // Reset contador
      } catch (reconnectError: any) {
        console.error('❌ [DB Pool] Falha na reconexão:', reconnectError.message);
      }
    }
  }
});

// Log de conexão para debug
pool.on('connect', (client: PoolClient) => {
  reconnectCount = 0; // Reset ao conectar com sucesso
  console.log('🔗 [DB Pool] Nova conexão estabelecida');
});

// Função de query com retry automático
export async function executeWithRetry<T>(
  queryFn: () => Promise<T>,
  retries: number = 3
): Promise<T> {
  let lastError: any;
  
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await queryFn();
    } catch (error: any) {
      lastError = error;
      const isConnectionError = 
        error.message?.includes('Connection terminated') ||
        error.message?.includes('timeout') ||
        error.message?.includes('ECONNRESET') ||
        error.code === 'ECONNRESET';
      
      if (isConnectionError && attempt < retries) {
        console.warn(`⚠️ [DB] Query falhou (tentativa ${attempt}/${retries}): ${error.message}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Backoff exponencial
        continue;
      }
      throw error;
    }
  }
  
  throw lastError;
}

// Teste de conexão inicial
(async () => {
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    console.log('✅ [DB] Conexão inicial com o banco de dados OK');
  } catch (error: any) {
    console.error('❌ [DB] Falha na conexão inicial:', error.message);
  }
})();

export const db = drizzle({ client: pool, schema });
