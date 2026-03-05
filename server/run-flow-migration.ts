#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🚀 MIGRATION - Flow Definitions (Sistema Chatbot Determinístico)
 * ═══════════════════════════════════════════════════════════════════════
 *
 * Executa a migration para criar as tabelas de fluxos determinísticos.
 * Este sistema garante que a IA NUNCA tome decisões sozinha.
 *
 * CONCEITO:
 * - IA interpreta intenção do usuário
 * - Sistema de fluxo toma TODAS as decisões
 * - IA apenas humaniza a resposta final
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import { Pool } from "pg";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { fileURLToPath } from "url";

// Obter __dirname no ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function runMigration() {
  console.log("\n🚀 Iniciando migration: Flow Definitions");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // Ler arquivo SQL
    const sqlPath = path.join(__dirname, "../migrations/create_flow_definitions.sql");
    const sql = fs.readFileSync(sqlPath, "utf-8");

    console.log("📄 Lendo arquivo SQL...");
    console.log(`   Arquivo: ${sqlPath}`);
    console.log(`   Tamanho: ${sql.length} caracteres\n`);

    // Executar migration
    console.log("⚡ Executando SQL no banco de dados...\n");
    await pool.query(sql);

    console.log("✅ Migration executada com sucesso!\n");
    console.log("📊 Tabelas criadas:");
    console.log("   • flow_definitions - Armazena fluxos determinísticos");
    console.log("   • flow_executions - Rastreia execuções de fluxos");
    console.log("   • user_active_modules (VIEW) - Determina módulo ativo por usuário\n");

    // Verificar se as tabelas foram criadas
    const { rows } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('flow_definitions', 'flow_executions')
      ORDER BY table_name
    `);

    console.log("🔍 Verificando tabelas criadas:");
    for (const row of rows) {
      console.log(`   ✓ ${row.table_name}`);
    }

    // Contar registros
    const { rows: countRows } = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM flow_definitions) as flow_defs,
        (SELECT COUNT(*) FROM flow_executions) as flow_execs
    `);

    console.log("\n📈 Estado inicial:");
    console.log(`   • flow_definitions: ${countRows[0].flow_defs} registros`);
    console.log(`   • flow_executions: ${countRows[0].flow_execs} registros`);

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✨ Migration concluída com sucesso!");
    console.log("═══════════════════════════════════════════════════════════\n");

  } catch (error: any) {
    console.error("\n❌ Erro ao executar migration:");
    console.error(error.message);
    if (error.detail) console.error("   Detalhe:", error.detail);
    if (error.hint) console.error("   Dica:", error.hint);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
