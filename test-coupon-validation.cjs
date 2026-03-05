const { Pool } = require('pg');
require('dotenv').config();

async function testCouponValidation() {
  const pool = new Pool({ 
    connectionString: process.env.DATABASE_URL, 
    ssl: { rejectUnauthorized: false } 
  });
  
  try {
    console.log('=== Testando validação de cupom ===');
    
    // Buscar cupom AGENTEZAP29
    const result = await pool.query(`
      SELECT * FROM coupons WHERE UPPER(code) = 'AGENTEZAP29'
    `);
    
    if (result.rows.length === 0) {
      console.log('❌ Cupom AGENTEZAP29 não encontrado!');
      return;
    }
    
    const coupon = result.rows[0];
    console.log('✅ Cupom encontrado:');
    console.log('  - code:', coupon.code);
    console.log('  - final_price:', coupon.final_price);
    console.log('  - is_active:', coupon.is_active);
    console.log('  - max_uses:', coupon.max_uses);
    console.log('  - current_uses:', coupon.current_uses);
    console.log('  - valid_until:', coupon.valid_until);
    console.log('  - applicable_plans:', coupon.applicable_plans);
    
    // Simular validação
    if (!coupon.is_active) {
      console.log('❌ Cupom inativo');
    } else if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
      console.log('❌ Cupom esgotado');
    } else if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
      console.log('❌ Cupom expirado');
    } else {
      console.log('✅ Cupom válido!');
    }
    
  } catch (error) {
    console.error('ERRO:', error.message);
  } finally {
    await pool.end();
  }
}

testCouponValidation();
