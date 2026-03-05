const { Pool } = require('pg');
require('dotenv').config();

async function checkCoupons() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  try {
    // Verificar estrutura da tabela
    const structure = await pool.query(`
      SELECT column_name, data_type, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'coupons' 
      ORDER BY ordinal_position
    `);
    console.log('=== Estrutura da tabela coupons ===');
    structure.rows.forEach(r => console.log(r.column_name, ':', r.data_type, r.is_nullable === 'YES' ? '(nullable)' : '(required)'));
    
    // Verificar cupons existentes
    const existing = await pool.query('SELECT * FROM coupons');
    console.log('\n=== Cupons existentes ===');
    existing.rows.forEach(r => console.log(r.code, 'R$' + r.final_price, 'ativo:', r.is_active, 'planos:', r.applicable_plans));
    
    // Testar inserção simples
    console.log('\n=== Testando inserção ===');
    const testCode = 'TESTCOUPON' + Date.now();
    try {
      const insert = await pool.query(`
        INSERT INTO coupons (code, discount_type, discount_value, final_price, is_active, current_uses)
        VALUES ($1, 'fixed_price', 0, 29, true, 0)
        RETURNING *
      `, [testCode]);
      console.log('✅ Inserido com sucesso:', insert.rows[0].code);
      
      // Deletar teste
      await pool.query('DELETE FROM coupons WHERE code = $1', [testCode]);
      console.log('✅ Teste removido');
    } catch (insertErr) {
      console.error('❌ Erro na inserção:', insertErr.message);
    }
    
  } catch (error) {
    console.error('ERRO:', error.message);
  } finally {
    await pool.end();
  }
}

checkCoupons();
