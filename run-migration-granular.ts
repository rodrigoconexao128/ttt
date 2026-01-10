/**
 * Execute Migration: Reseller Granular Billing
 * Run with: npx tsx run-migration-granular.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error("❌ DATABASE_URL não encontrada no .env");
    process.exit(1);
  }
  
  const pool = new Pool({ connectionString });
  
  try {
    console.log("🔄 Conectando ao banco de dados...");
    
    // Read migration file
    const migrationPath = path.join(__dirname, 'migrations', '0012_reseller_granular_billing.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');
    
    console.log("📝 Executando migration: Reseller Granular Billing...");
    
    await pool.query(migrationSQL);
    
    console.log("✅ Migration executada com sucesso!");
    
    // Verify tables
    const tablesResult = await pool.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name = 'reseller_invoice_items'
    `);
    
    if (tablesResult.rows.length > 0) {
      console.log("✅ Tabela reseller_invoice_items criada!");
    }
    
    // Verify columns
    const columnsResult = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'reseller_clients' AND column_name IN ('saas_paid_until', 'saas_status')
    `);
    
    console.log(`✅ Colunas adicionadas: ${columnsResult.rows.map(r => r.column_name).join(', ')}`);
    
  } catch (error: any) {
    console.error("❌ Erro ao executar migration:", error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
