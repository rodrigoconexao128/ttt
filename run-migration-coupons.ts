import pg from 'pg';
import * as dotenv from 'dotenv';

dotenv.config();

async function run() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  
  try {
    // Criar tabela de cupons
    await client.query(`
      CREATE TABLE IF NOT EXISTS coupons (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        code VARCHAR(50) UNIQUE NOT NULL,
        discount_price DECIMAL(10, 2) NOT NULL,
        description TEXT,
        max_uses INTEGER DEFAULT 0,
        used_count INTEGER DEFAULT 0 NOT NULL,
        valid_until TIMESTAMP,
        ativo BOOLEAN DEFAULT true NOT NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Tabela coupons criada com sucesso!');
    
    // Inserir cupons padrão
    await client.query(`
      INSERT INTO coupons (code, discount_price, description, ativo)
      VALUES 
        ('PROMO29', 29.00, 'Cupom promocional - R$ 29/mês', true),
        ('PROMO49', 49.00, 'Cupom promocional - R$ 49/mês', true)
      ON CONFLICT (code) DO NOTHING;
    `);
    console.log('✅ Cupons padrão inseridos!');
    
    // Verificar
    const result = await client.query('SELECT * FROM coupons');
    console.log('📋 Cupons no banco:');
    console.table(result.rows);
  } catch (err) {
    console.error('❌ Erro:', err);
  } finally {
    await client.end();
  }
}

run();
