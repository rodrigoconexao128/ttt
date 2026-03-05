import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function addColumns() {
  const client = await pool.connect();
  try {
    console.log('Adicionando colunas PIX...');
    
    await client.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_holder_name VARCHAR(255)`);
    console.log('✅ pix_holder_name adicionada');
    
    await client.query(`ALTER TABLE resellers ADD COLUMN IF NOT EXISTS pix_bank_name VARCHAR(100)`);
    console.log('✅ pix_bank_name adicionada');
    
    console.log('✅ Colunas adicionadas com sucesso!');
  } catch (e: any) {
    if (e.code === '42701') {
      console.log('ℹ️ Colunas já existem');
    } else {
      console.error('❌ Erro:', e.message);
    }
  } finally {
    client.release();
    await pool.end();
  }
}

addColumns();
