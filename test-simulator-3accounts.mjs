/**
 * TESTE DIRETO DO SIMULADOR - Verifica 3 contas diferentes
 * Usa a mesma função que o simulador do frontend usa
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const { Client } = pg;

// Teste via API do servidor (mesma que o frontend usa)
async function testViaAPI(userId, message) {
  try {
    const response = await fetch('http://localhost:5000/api/test-agent/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, message, conversationHistory: [] })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data;
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🧪 TESTE DO SIMULADOR - 3 CONTAS DIFERENTES');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    // Buscar 3 contas com negócios diferentes
    const result = await client.query(`
      SELECT DISTINCT ON (LEFT(a.prompt, 50))
        u.id as user_id,
        u.email,
        b.company_name,
        LEFT(a.prompt, 100) as prompt_preview
      FROM auth.users u
      JOIN ai_agent_config a ON a.user_id = u.id::text
      LEFT JOIN business_agent_configs b ON b.user_id = u.id::text
      WHERE a.prompt IS NOT NULL 
        AND a.prompt != ''
        AND a.is_active = true
        AND (b.company_name IS NOT NULL OR a.prompt LIKE '%Tendas%' OR a.prompt LIKE '%Pizza%')
      ORDER BY LEFT(a.prompt, 50), u.created_at DESC
      LIMIT 3
    `);
    
    console.log(`📋 Testando ${result.rows.length} contas:\n`);
    
    let passed = 0;
    let failed = 0;
    
    for (const row of result.rows) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🏢 ${row.company_name || 'N/A'}`);
      console.log(`📧 ${row.email}`);
      console.log(`📝 Prompt: ${(row.prompt_preview || '').substring(0, 80)}...`);
      
      // Testar via API
      console.log(`\n🔄 Enviando mensagem "oi" via API...`);
      const testResult = await testViaAPI(row.user_id, 'oi');
      
      if (testResult.error) {
        console.log(`❌ ERRO: ${testResult.error}`);
        failed++;
        continue;
      }
      
      const response = testResult.response || testResult.text || '';
      console.log(`\n📩 Resposta do agente:`);
      console.log(`   "${response.substring(0, 200)}..."`);
      
      // Verificar se resposta contém algo do prompt
      const promptLower = (row.prompt_preview || '').toLowerCase();
      const responseLower = response.toLowerCase();
      
      // Extrair palavras-chave do prompt
      const keywords = [];
      if (promptLower.includes('tendas')) keywords.push('tendas', 'eldorado', 'tenda');
      if (promptLower.includes('pizza')) keywords.push('pizza', 'sabor', 'pizzaria');
      if (promptLower.includes('agentezap')) keywords.push('agentezap', 'rodrigo');
      if (row.company_name) keywords.push(row.company_name.toLowerCase());
      
      const foundKeywords = keywords.filter(k => responseLower.includes(k));
      
      if (foundKeywords.length > 0) {
        console.log(`\n✅ PASSOU - Resposta contém: ${foundKeywords.join(', ')}`);
        passed++;
      } else {
        console.log(`\n⚠️ ALERTA - Nenhuma palavra-chave encontrada na resposta`);
        console.log(`   Esperado: ${keywords.join(', ')}`);
        failed++;
      }
    }
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADO: ${passed}/${result.rows.length} testes passaram`);
    console.log(`${'═'.repeat(60)}`);
    
    if (failed === 0) {
      console.log('\n🎉 TODOS OS TESTES PASSARAM!');
    } else {
      console.log(`\n⚠️ ${failed} teste(s) falharam`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

runTests();
