const { Pool } = require('pg');

// Use Railway DATABASE_URL
const connectionString = process.env.RAILWAY_DATABASE_URL || process.env.DATABASE_URL;

async function checkRailwayDB() {
  console.log("Connecting to:", connectionString ? "Database found" : "No DATABASE_URL");
  
  const pool = new Pool({ 
    connectionString, 
    ssl: { rejectUnauthorized: false } 
  });
  
  try {
    // Verificar estrutura da tabela coupons
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
    if (existing.rows.length === 0) {
      console.log('Nenhum cupom encontrado!');
    } else {
      existing.rows.forEach(r => console.log(r.code, 'R$' + r.final_price, 'ativo:', r.is_active));
    }
    
  } catch (error) {
    console.error('ERRO:', error.message);
    console.error('Detalhes:', error);
  } finally {
    await pool.end();
  }
}

checkRailwayDB();
