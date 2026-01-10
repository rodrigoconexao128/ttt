import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function fixSchema() {
  let client;
  try {
    client = await pool.connect();
    
    console.log('Removendo coluna antiga client_id...');
    
    await client.query(`
      ALTER TABLE reseller_invoice_items 
      DROP COLUMN IF EXISTS client_id
    `);
    
    console.log('✓ Coluna client_id removida!');
    console.log('✓ Schema corrigido!');
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

fixSchema();
