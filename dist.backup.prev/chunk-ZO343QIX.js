import {
  schema_exports
} from "./chunk-P6ABBBKG.js";

// server/db.ts
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?"
  );
}
var rawDbUrl = process.env.DATABASE_URL;
var directDbUrl = process.env.DATABASE_URL_DIRECT;
var dbUrl = directDbUrl || rawDbUrl;
var isPoolerConnection = dbUrl.includes("pooler.supabase.com");
if (isPoolerConnection && dbUrl.includes(":5432")) {
  dbUrl = dbUrl.replace(":5432", ":6543");
  console.log("[DB] \u26A0\uFE0F Porta alterada de 5432 (Session) para 6543 (Transaction) para evitar MaxClientsInSessionMode");
}
console.log(
  `[DB] Modo de conex\xE3o: ${isPoolerConnection ? "Supabase Pooler (PgBouncer)" : "Direct Connection"}`
);
var poolConfig = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool CONSERVADOR - PgBouncer Transaction mode libera conexão após cada query
  max: isPoolerConnection ? 3 : 7,
  // 3 para pooler (transaction mode libera rápido)
  min: 0,
  // Não manter conexões ociosas em transaction mode
  idleTimeoutMillis: isPoolerConnection ? 1e4 : 6e4,
  // Libera rápido em pooler
  connectionTimeoutMillis: 3e4,
  statement_timeout: 3e4,
  allowExitOnIdle: true,
  // Permite liberar conexões quando ocioso
  // Retry com backoff exponencial
  retryStrategy: (times) => {
    if (times > 5) {
      console.log(`[DB] Max retries (5) atingido, desistindo`);
      return false;
    }
    const delay = Math.min(times * 2e3, 15e3);
    console.log(`\u23F3 [DB] Retry #${times} ap\xF3s ${delay}ms`);
    return delay;
  }
};
var pool = new Pool(poolConfig);
pool.on("connect", () => {
  console.log("\u2705 [DB Pool] Nova conex\xE3o ESTABELECIDA");
});
pool.on("error", (err) => {
  console.error("\u274C [DB Pool] ERRO:", err.message, "| Code:", err.code);
});
pool.on("remove", () => {
  console.log("\u{1F50C} [DB Pool] Conex\xE3o REMOVIDA");
});
var gracefulShutdown = async (signal) => {
  console.log(`
\u{1F6D1} [DB] Recebido ${signal}, encerrando pool de conex\xF5es...`);
  try {
    await pool.end();
    console.log("\u2705 [DB] Pool encerrado com sucesso");
  } catch (err) {
    console.error("\u274C [DB] Erro ao encerrar pool:", err.message);
  }
  process.exit(0);
};
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
setTimeout(async () => {
  try {
    const start = Date.now();
    const result = await pool.query("SELECT current_user, current_database()");
    console.log(`\u2705 [DB] Autentica\xE7\xE3o OK em ${Date.now() - start}ms | User: ${result.rows[0].current_user} | DB: ${result.rows[0].current_database}`);
  } catch (error) {
    console.error("\u274C [DB] Falha na autentica\xE7\xE3o:", error.message, "| Code:", error.code);
  }
}, 2e3);
async function withRetry(operation, maxRetries = 3, delayMs = 1e3) {
  let lastError;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      const isRetryable = error.message?.includes("Connection terminated") || error.message?.includes("timeout") || error.message?.includes("ECONNRESET") || error.message?.includes("DbHandler exited") || error.message?.includes("unexpectedly") || error.code === "ECONNRESET" || error.code === "ETIMEDOUT" || error.code === "57P01" || error.code === "XX000";
      if (isRetryable && attempt < maxRetries) {
        const waitTime = delayMs * attempt;
        console.warn(`\u26A0\uFE0F [DB] Query falhou (tentativa ${attempt}/${maxRetries}), retry em ${waitTime}ms: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}
setTimeout(async () => {
  console.log("[DB] Verificando tabelas necess\xE1rias...");
  try {
    const client = await pool.connect();
    const checkTable = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'contact_lists'
      );
    `);
    if (!checkTable.rows[0].exists) {
      console.log("[DB] Tabela contact_lists n\xE3o existe, criando...");
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
      console.log("\u2705 [DB] Tabela contact_lists criada com sucesso!");
    } else {
      console.log("\u2705 [DB] Tabela contact_lists j\xE1 existe");
    }
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
    console.log("\u2705 [DB] Tabela admin_broadcast_messages garantida");
    client.release();
  } catch (error) {
    console.error("\u274C [DB] Erro ao verificar/criar tabelas:", error.message);
  }
}, 5e3);
setTimeout(async () => {
  try {
    const client = await pool.connect();
    const checkConstraint = await client.query(`
      SELECT pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conrelid = 'payment_receipts'::regclass
      AND conname = 'payment_receipts_status_check'
    `);
    const constraintDef = checkConstraint.rows[0]?.definition || "";
    if (constraintDef && !constraintDef.includes("cancelled")) {
      console.log("[DB] Atualizando constraint de status em payment_receipts...");
      await client.query(`ALTER TABLE payment_receipts DROP CONSTRAINT payment_receipts_status_check`);
      await client.query(`
        ALTER TABLE payment_receipts 
        ADD CONSTRAINT payment_receipts_status_check 
        CHECK (status::text = ANY (ARRAY['pending'::varchar, 'approved'::varchar, 'rejected'::varchar, 'cancelled'::varchar]::text[]))
      `);
      console.log("\u2705 [DB] Constraint de status em payment_receipts atualizada!");
    }
    client.release();
  } catch (error) {
    if (!error.message?.includes("does not exist")) {
      console.error("\u274C [DB] Erro ao atualizar constraint payment_receipts:", error.message);
    }
  }
}, 6e3);
var db = drizzle({
  client: pool,
  schema: schema_exports,
  logger: process.env.NODE_ENV !== "production",
  ...isPoolerConnection ? { casing: void 0 } : {}
});

export {
  pool,
  withRetry,
  db
};
