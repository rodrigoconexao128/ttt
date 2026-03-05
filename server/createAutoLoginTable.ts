/**
 * Script para criar tabela auto_login_tokens no banco
 * Executar via Node.js para garantir compatibilidade
 */
import 'dotenv/config';
import { pool } from './db';

async function createAutoLoginTokensTable() {
  try {
    console.log('🔧 [MIGRATION] Criando tabela auto_login_tokens...');
    
    await pool.query(`
      CREATE TABLE IF NOT EXISTS auto_login_tokens (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        token VARCHAR(255) UNIQUE NOT NULL,
        user_id VARCHAR(255) NOT NULL,
        purpose VARCHAR(50) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        used_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    
    console.log('✅ [MIGRATION] Tabela auto_login_tokens criada com sucesso!');
    
    // Criar índices
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_login_tokens_token ON auto_login_tokens(token);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_login_tokens_user ON auto_login_tokens(user_id);
    `);
    
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_auto_login_tokens_expires ON auto_login_tokens(expires_at);
    `);
    
    console.log('✅ [MIGRATION] Índices criados com sucesso!');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ [MIGRATION] Erro:', error);
    process.exit(1);
  }
}

createAutoLoginTokensTable();
