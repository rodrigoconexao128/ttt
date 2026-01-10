import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function getResellerClients() {
  let client;
  try {
    client = await pool.connect();
    
    const resellerId = '022e9e72-265f-473c-8bf4-d4658051b5ee';
    
    console.log('Buscando clientes do revendedor:', resellerId);
    console.log('');
    
    const result = await client.query(`
      SELECT rc.id, rc.saas_status, rc.status, rc.monthly_cost, u.name, u.email
      FROM reseller_clients rc
      LEFT JOIN users u ON u.id = rc.user_id
      WHERE rc.reseller_id = $1
      ORDER BY rc.created_at DESC
      LIMIT 10
    `, [resellerId]);
    
    if (result.rows.length === 0) {
      console.log('❌ Nenhum cliente encontrado');
    } else {
      console.log(`✓ ${result.rows.length} clientes encontrados:`);
      console.table(result.rows);
      
      if (result.rows.length > 0) {
        console.log('\nURL para testar:');
        console.log(`http://localhost:5000/revenda/clientes/${result.rows[0].id}`);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

getResellerClients();
