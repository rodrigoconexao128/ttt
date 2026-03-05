import 'dotenv/config';
import { Pool } from 'pg';

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    console.log('🔄 Executando migration 0023...');
    
    await pool.query(`
      ALTER TABLE ai_agent_config 
      ADD COLUMN IF NOT EXISTS pause_on_manual_reply BOOLEAN DEFAULT TRUE NOT NULL;
    `);
    
    console.log('✅ Coluna pause_on_manual_reply adicionada com sucesso!');
    
    // Verificar se a coluna existe agora
    const result = await pool.query(`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'ai_agent_config' AND column_name = 'pause_on_manual_reply'
    `);
    
    if (result.rows.length > 0) {
      console.log('📋 Coluna verificada:', result.rows[0]);
    }
    
  } catch (error) {
    console.error('❌ Erro na migration:', error);
    process.exit(1);
  } finally {
    await pool.end();
    process.exit(0);
  }
}

runMigration();
