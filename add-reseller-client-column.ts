import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('DATABASE_URL não encontrada');
  process.exit(1);
}

const pool = new Pool({
  connectionString: databaseUrl,
  max: 1,
});

async function addColumn() {
  let client;
  try {
    client = await pool.connect();
    console.log('Adicionando coluna reseller_client_id...');
    
    await client.query(`
      ALTER TABLE reseller_invoice_items 
      ADD COLUMN IF NOT EXISTS reseller_client_id VARCHAR(255) 
      REFERENCES reseller_clients(id) ON DELETE SET NULL
    `);
    
    console.log('✓ Coluna adicionada com sucesso!');
    
    console.log('Criando índice...');
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_reseller_invoice_items_client 
      ON reseller_invoice_items(reseller_client_id)
    `);
    
    console.log('✓ Índice criado com sucesso!');
    console.log('✓ Migration concluída!');
    
  } catch (error) {
    console.error('Erro ao executar migration:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

addColumn();
