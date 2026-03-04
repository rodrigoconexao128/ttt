import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function checkSchema() {
  let client;
  try {
    client = await pool.connect();
    
    console.log('Verificando colunas da tabela reseller_invoice_items...\n');
    
    const result = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'reseller_invoice_items'
      ORDER BY ordinal_position
    `);
    
    console.log('Colunas encontradas:');
    console.table(result.rows);
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

checkSchema();
