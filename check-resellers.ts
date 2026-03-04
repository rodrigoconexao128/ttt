import { pool } from './server/db';

async function main() {
  // Verificar estrutura da tabela resellers
  console.log('=== ESTRUTURA DA TABELA RESELLERS ===');
  const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'resellers' ORDER BY ordinal_position");
  cols.rows.forEach((r: any) => console.log(`  ${r.column_name}: ${r.data_type}`));
  
  // Listar revendedores
  console.log('\n=== REVENDEDORES CADASTRADOS ===');
  const resellers = await pool.query("SELECT r.id, r.user_id, u.email FROM resellers r LEFT JOIN users u ON r.user_id::text = u.id::text LIMIT 5");
  resellers.rows.forEach((r: any) => console.log(`  ${r.email || 'N/A'} - user_id: ${r.user_id}`));
  
  // Verificar se rodrigo4 é revendedor
  console.log('\n=== VERIFICANDO RODRIGO4 ===');
  const rodrigo = await pool.query("SELECT id, email FROM users WHERE email = 'rodrigo4@gmail.com'");
  if (rodrigo.rows.length > 0) {
    const userId = rodrigo.rows[0].id;
    console.log(`  User ID: ${userId}`);
    
    const isReseller = await pool.query("SELECT * FROM resellers WHERE user_id::text = $1::text", [userId]);
    console.log(`  É revendedor: ${isReseller.rows.length > 0 ? 'SIM' : 'NÃO'}`);
    
    if (isReseller.rows.length === 0) {
      console.log('\n=== CRIANDO PERFIL DE REVENDEDOR PARA TESTE ===');
      // Criar perfil de revendedor para teste
      await pool.query(`
        INSERT INTO resellers (user_id, brand_name, is_active, created_at)
        VALUES ($1, 'Revenda Teste', true, NOW())
        ON CONFLICT (user_id) DO NOTHING
      `, [userId]);
      console.log('  Perfil de revendedor criado!');
    }
  }
  
  process.exit(0);
}

main().catch(console.error);
