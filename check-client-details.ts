import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function checkClient() {
  let client;
  try {
    client = await pool.connect();
    
    const clientId = '9336b852-77dd-4471-94ef-a8269a7b52c0';
    
    console.log('Verificando cliente:', clientId);
    console.log('');
    
    // Verificar se cliente existe
    const clientResult = await client.query(`
      SELECT * FROM reseller_clients
      WHERE id = $1
    `, [clientId]);
    
    if (clientResult.rows.length === 0) {
      console.log('❌ Cliente não encontrado na tabela reseller_clients');
    } else {
      console.log('✓ Cliente encontrado:');
      console.table(clientResult.rows[0]);
      
      // Verificar reseller
      const resellerId = clientResult.rows[0].reseller_id;
      const resellerResult = await client.query(`
        SELECT * FROM resellers
        WHERE id = $1
      `, [resellerId]);
      
      if (resellerResult.rows.length > 0) {
        console.log('\n✓ Revendedor:');
        console.table(resellerResult.rows[0]);
      }
      
      // Verificar user
      const userId = clientResult.rows[0].user_id;
      const userResult = await client.query(`
        SELECT id, name, email, phone FROM users
        WHERE id = $1
      `, [userId]);
      
      if (userResult.rows.length > 0) {
        console.log('\n✓ Usuário:');
        console.table(userResult.rows[0]);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

checkClient();
