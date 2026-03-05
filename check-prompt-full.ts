/**
 * Ver prompt completo do usuário
 */

import pkg from 'pg';
const { Pool } = pkg;
import * as fs from 'fs';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  
  try {
    const result = await client.query(`
      SELECT ac.prompt
      FROM ai_agent_config ac
      JOIN users u ON ac.user_id = u.id
      WHERE u.email = 'rodrigo4@gmail.com'
    `);
    
    const prompt = result.rows[0]?.prompt;
    
    if (!prompt) {
      console.log('❌ Prompt não encontrado');
      return;
    }
    
    // Salvar em arquivo para análise
    fs.writeFileSync('prompt-rodrigo4.txt', prompt);
    console.log('✅ Prompt salvo em prompt-rodrigo4.txt');
    console.log(`📊 Tamanho: ${prompt.length} caracteres`);
    
    // Encontrar problemas específicos
    console.log('\n🔍 PROBLEMAS ENCONTRADOS:');
    
    // 1. Links quebrados
    const onlineDot = (prompt.match(/online\/\./g) || []).length;
    const onlineParen = (prompt.match(/online\/\)/g) || []).length;
    console.log(`\n1. "online/." aparece ${onlineDot} vezes`);
    console.log(`2. "online/)" aparece ${onlineParen} vezes`);
    
    // 2. Texto cortado
    const cortado1 = prompt.includes('Combinado?ique');
    const cortado2 = prompt.includes('**te virtual');
    console.log(`3. "Combinado?ique" (texto cortado): ${cortado1 ? '⚠️ SIM' : '✅ NÃO'}`);
    console.log(`4. "**te virtual" (texto cortado): ${cortado2 ? '⚠️ SIM' : '✅ NÃO'}`);
    
    // 3. Mostrar contexto dos problemas
    if (onlineDot > 0) {
      console.log('\n📍 Contexto de "online/." no prompt:');
      const lines = prompt.split('\n');
      lines.forEach((line, i) => {
        if (line.includes('online/.')) {
          console.log(`  Linha ${i+1}: ...${line.substring(Math.max(0, line.indexOf('online/.') - 30), line.indexOf('online/.') + 40)}...`);
        }
      });
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
