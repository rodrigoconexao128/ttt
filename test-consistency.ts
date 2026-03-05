/**
 * TESTE: Verificar consistência das respostas após correção
 */

import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getUserId(email: string): Promise<string | null> {
  const client = await pool.connect();
  try {
    const result = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    return result.rows[0]?.id || null;
  } finally {
    client.release();
  }
}

async function main() {
  const { testAgentResponse } = await import('./server/aiAgent.js');
  
  const userId = await getUserId('rodrigo7777@teste.com');
  if (!userId) {
    console.log('❌ Usuário não encontrado');
    process.exit(1);
  }
  
  console.log('🧪 TESTE: Consistência de Respostas (Temperature 0.3)');
  console.log('═'.repeat(60));
  
  const testMessage = 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.';
  
  console.log(`\n📝 Mensagem de teste: "${testMessage}"`);
  console.log('\n🔄 Executando 3 chamadas consecutivas...\n');
  
  const responses: string[] = [];
  
  for (let i = 1; i <= 3; i++) {
    console.log(`--- Chamada ${i} ---`);
    
    const result = await testAgentResponse(
      userId,
      testMessage,
      undefined, // customPrompt
      [], // conversationHistory
      [], // sentMedias
      "Cliente Teste" // contactName
    );
    
    const response = result?.text?.substring(0, 100) || 'Sem resposta';
    responses.push(response);
    console.log(`Resposta ${i}: ${response}...\n`);
    
    // Pequena pausa entre chamadas
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Comparar respostas
  console.log('═'.repeat(60));
  console.log('📊 ANÁLISE DE CONSISTÊNCIA:');
  
  const areAllSimilar = responses.every((r, i, arr) => {
    if (i === 0) return true;
    // Comparar primeiras 50 caracteres
    return r.substring(0, 50) === arr[0].substring(0, 50);
  });
  
  if (areAllSimilar) {
    console.log('✅ CONSISTENTE: Todas as respostas têm início similar!');
  } else {
    console.log('⚠️ VARIAÇÃO: Respostas diferem (normal com IA, mas reduzido com temp=0.3)');
  }
  
  console.log('\n💡 Com temperature=0.3, as respostas devem ser muito similares.');
  console.log('   Pequenas variações são normais, mas a estrutura deve ser igual.');
  
  await pool.end();
}

main().catch(console.error);
