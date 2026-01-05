import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./server/db.js";

async function runMigration() {
  console.log("🚀 Executando migração: Lista de Exclusão...");

  try {
    // Criar tabela exclusion_list
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "exclusion_list" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
        "phone_number" varchar(20) NOT NULL,
        "contact_name" varchar(255),
        "reason" text,
        "exclude_from_followup" boolean NOT NULL DEFAULT true,
        "is_active" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);
    console.log("✅ Tabela exclusion_list criada");

    // Criar tabela exclusion_config
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS "exclusion_config" (
        "id" varchar PRIMARY KEY DEFAULT gen_random_uuid(),
        "user_id" varchar NOT NULL UNIQUE REFERENCES "users"("id") ON DELETE CASCADE,
        "is_enabled" boolean NOT NULL DEFAULT true,
        "followup_exclusion_enabled" boolean NOT NULL DEFAULT true,
        "created_at" timestamp DEFAULT now(),
        "updated_at" timestamp DEFAULT now()
      )
    `);
    console.log("✅ Tabela exclusion_config criada");

    // Criar índices
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_exclusion_list_user" ON "exclusion_list" ("user_id")`);
    await db.execute(sql`CREATE INDEX IF NOT EXISTS "idx_exclusion_list_phone" ON "exclusion_list" ("phone_number")`);
    console.log("✅ Índices criados");

    console.log("🎉 Migração concluída com sucesso!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro na migração:", error);
    process.exit(1);
  }
}

runMigration();
