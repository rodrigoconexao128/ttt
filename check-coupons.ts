import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  try {
    // Ver estrutura atual da tabela
    const res = await client.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'coupons'
    `);
    console.log('📋 Estrutura atual da tabela coupons:');
    console.table(res.rows);
    
    // Ver dados atuais
    const data = await client.query('SELECT * FROM coupons');
    console.log('\n📋 Dados atuais:');
    console.table(data.rows);
  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await client.end();
  }
}

run();
