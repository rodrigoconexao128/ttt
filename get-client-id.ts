import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function getClientId() {
  let client;
  try {
    client = await pool.connect();
    
    const result = await client.query(`
      SELECT *
      FROM reseller_clients
      LIMIT 1
    `);
    
    if (result.rows.length > 0) {
      console.log('Cliente encontrado:');
      console.log('ID:', result.rows[0].id);
      console.log('Nome:', result.rows[0].name);
      console.log('Email:', result.rows[0].email);
      console.log('Telefone:', result.rows[0].phone);
      console.log('\nURL para testar:', `http://localhost:5000/revenda/clientes/${result.rows[0].id}`);
    } else {
      console.log('Nenhum cliente encontrado');
    }
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

getClientId();
