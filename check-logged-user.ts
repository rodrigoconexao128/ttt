import { Pool } from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 1,
});

async function checkUser() {
  let client;
  try {
    client = await pool.connect();
    
    const email = 'rodrigo4@gmail.com';
    
    console.log('Verificando usuário:', email);
    console.log('');
    
    const userResult = await client.query(`
      SELECT id, name, email FROM users
      WHERE email = $1
    `, [email]);
    
    if (userResult.rows.length === 0) {
      console.log('❌ Usuário não encontrado');
    } else {
      console.log('✓ Usuário encontrado:');
      console.table(userResult.rows[0]);
      
      const userId = userResult.rows[0].id;
      
      // Verificar se é revendedor
      const resellerResult = await client.query(`
        SELECT * FROM resellers
        WHERE user_id = $1
      `, [userId]);
      
      if (resellerResult.rows.length === 0) {
        console.log('\n❌ Usuário NÃO é revendedor');
      } else {
        console.log('\n✓ Revendedor encontrado:');
        console.table(resellerResult.rows[0]);
      }
    }
    
  } catch (error) {
    console.error('Erro:', error);
  } finally {
    if (client) client.release();
    await pool.end();
  }
}

checkUser();
