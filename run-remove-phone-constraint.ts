import { Pool } from 'pg';
import 'dotenv/config';

async function removePhoneUniqueConstraint() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔧 Removendo constraint unique do telefone...');
    
    await pool.query(`
      ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_key;
    `);
    
    console.log('✅ Constraint users_phone_key removida com sucesso!');
    console.log('✅ Agora múltiplos usuários podem ter o mesmo telefone.');
    
  } catch (error) {
    console.error('❌ Erro ao remover constraint:', error);
  } finally {
    await pool.end();
  }
}

removePhoneUniqueConstraint();
