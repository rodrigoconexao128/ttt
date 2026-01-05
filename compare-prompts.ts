/**
 * Verificar se o prompt foi corrompido ou se o problema é no código
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Verificar prompts dos dois usuários
    const result = await client.query(`
      SELECT u.email, length(ac.prompt) as len, ac.message_split_chars
      FROM ai_agent_config ac
      JOIN users u ON ac.user_id = u.id
      WHERE u.email IN ('rodrigo4@gmail.com', 'rodrigo7777@teste.com')
    `);
    
    console.log('📊 Comparação de prompts:');
    console.log(result.rows);
    
    // Buscar prompt problemático e verificar as linhas com problemas
    const promptResult = await client.query(`
      SELECT prompt FROM ai_agent_config ac
      JOIN users u ON ac.user_id = u.id
      WHERE u.email = 'rodrigo4@gmail.com'
    `);
    
    const prompt = promptResult.rows[0]?.prompt || '';
    
    // Analisar problemas específicos
    console.log('\n🔍 Análise de problemas no prompt:');
    
    // Verificar "online/."
    const onlineCount = (prompt.match(/online\/\./g) || []).length;
    console.log(`   "online/." aparece ${onlineCount}x (deveria ser 0)`);
    
    // Verificar texto cortado
    const incompleteCount = (prompt.match(/ique algum detalhe/g) || []).length;
    console.log(`   "ique algum detalhe" (frase cortada) aparece ${incompleteCount}x`);
    
    // Verificar duplicações
    const duplicateLinks = (prompt.match(/https:\/\/agentezap\.online/g) || []).length;
    console.log(`   Links completos: ${duplicateLinks}x`);
    
    // Mostrar linhas problemáticas
    console.log('\n📜 Linhas com problemas:');
    const lines = prompt.split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('online/.') || line.includes('online/)') || line.includes('ique algum')) {
        console.log(`   Linha ${idx + 1}: "${line.substring(0, 100)}..."`);
      }
    });
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
