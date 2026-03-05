/**
 * Script simples para executar APENAS a migration do DEFAULT false
 * SEM iniciar o servidor
 */

import "dotenv/config";
import pg from "pg";

const { Pool } = pg;

async function runMigration() {
  // Usar a DATABASE_URL diretamente
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error("❌ DATABASE_URL não encontrada no .env");
    process.exit(1);
  }

  console.log("🔧 Conectando ao banco de dados...");
  
  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes('sslmode=require') ? { rejectUnauthorized: false } : undefined,
    max: 1
  });

  try {
    // Alterar o DEFAULT
    console.log("📝 Alterando DEFAULT de is_enabled para FALSE...");
    await pool.query(`
      ALTER TABLE scheduling_config 
      ALTER COLUMN is_enabled SET DEFAULT false;
    `);
    console.log("✅ DEFAULT alterado com sucesso!");

    // Verificar a alteração
    const result = await pool.query(`
      SELECT column_name, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'scheduling_config' AND column_name = 'is_enabled';
    `);
    console.log("\n📊 Configuração atual da coluna:");
    console.log(result.rows);

    // Contar estatísticas
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total, 
        SUM(CASE WHEN is_enabled = true THEN 1 ELSE 0 END) as enabled,
        SUM(CASE WHEN is_enabled = false THEN 1 ELSE 0 END) as disabled
      FROM scheduling_config;
    `);
    console.log("\n📈 Estatísticas atuais:");
    console.log(stats.rows[0]);

    console.log("\n✅ Migration executada com sucesso!");
    console.log("📌 Novos usuários agora começarão com agendamento DESATIVADO por padrão.");
    
  } catch (error) {
    console.error("❌ Erro ao executar migration:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
