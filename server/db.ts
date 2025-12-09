import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  },
  // Configurações para Supabase Pooler (PgBouncer)
  max: 10, // Máximo de conexões no pool
  idleTimeoutMillis: 30000, // Fechar conexões idle após 30s
  connectionTimeoutMillis: 10000, // Timeout para nova conexão
  allowExitOnIdle: false, // Manter pool ativo
});

// Tratamento de erros do pool para evitar crash do servidor
pool.on('error', (err) => {
  console.error('❌ [DB Pool] Erro inesperado na conexão idle:', err.message);
  // Não deixar o erro propagar e crashar o servidor
});

// Log de conexão para debug
pool.on('connect', () => {
  console.log('🔗 [DB Pool] Nova conexão estabelecida');
});

export const db = drizzle({ client: pool, schema });
