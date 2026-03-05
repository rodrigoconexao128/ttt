/**
 * INVESTIGAÇÃO: Verificar prompt do agente
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  try {
    // Buscar config do agente do rodrigo4@gmail.com
    const result = await client.query(`
      SELECT ac.prompt, ac.message_split_chars
      FROM ai_agent_config ac
      JOIN users u ON ac.user_id = u.id
      WHERE u.email = 'rodrigo4@gmail.com'
    `);
    
    const prompt = result.rows[0]?.prompt;
    const splitChars = result.rows[0]?.message_split_chars;
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📋 CONFIGURAÇÃO DO AGENTE (rodrigo4@gmail.com)');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    console.log(`📏 message_split_chars: ${splitChars}`);
    console.log(`📝 Tamanho do prompt: ${prompt?.length || 0} chars\n`);
    
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📜 PROMPT COMPLETO');
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log(prompt);
    
    // Verificar ocorrências problemáticas
    if (prompt) {
      console.log('\n═══════════════════════════════════════════════════════════');
      console.log('🔍 ANÁLISE DE PADRÕES PROBLEMÁTICOS');
      console.log('═══════════════════════════════════════════════════════════\n');
      
      // Verificar online/
      const onlineMatches = prompt.match(/online[^\s\n]*/g);
      console.log('Padrões com "online":');
      console.log(onlineMatches);
      
      // Verificar se tem links quebrados
      const brokenLinks = prompt.match(/\.(com|online|net|br)[^a-zA-Z]/g);
      console.log('\nPossíveis links quebrados:');
      console.log(brokenLinks);
      
      // Verificar se tem ). ou /. 
      if (prompt.includes('online/.') || prompt.includes('online/)')) {
        console.log('\n⚠️ PROBLEMA ENCONTRADO: prompt contém "online/." ou "online/)"');
      }
      
      // Verificar texto "(mensagem de voz)"
      if (prompt.includes('mensagem de voz')) {
        console.log('\n⚠️ ATENÇÃO: prompt contém "mensagem de voz"');
        const lines = prompt.split('\n').filter(l => l.includes('mensagem de voz'));
        lines.forEach(l => console.log(`   Linha: "${l.substring(0, 100)}..."`));
      }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
