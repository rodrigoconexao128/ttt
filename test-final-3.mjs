/**
 * TESTE FINAL - 3 CONTAS COM VERIFICAÇÃO CORRETA
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const { Client } = pg;

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
    
    return await response.json();
  } catch (error) {
    return { error: error.message };
  }
}

async function runTests() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('🧪 TESTE FINAL DO SIMULADOR - VERIFICAÇÃO CORRETA');
    console.log('═══════════════════════════════════════════════════════════════════\n');
    
    // Contas específicas para testar
    const testCases = [
      { 
        email: 'contato@toldoseldorado.com.br',
        expectedKeywords: ['tendas', 'eldorado', 'tenda', 'rio preto'],
        businessName: 'TENDAS ELDORADO'
      },
      {
        email: 'fabrizioamfa@gmail.com', 
        expectedKeywords: ['fabrizio', 'pontos', 'equilíbrio'],
        businessName: 'Pontos de Equilíbrio'
      },
      {
        email: 'marcelomarquesterapeuta@gmail.com',
        expectedKeywords: ['alessandra', 'marcelo', 'terapeuta'],
        businessName: 'Terapeuta Marcelo'
      }
    ];
    
    let passed = 0;
    let failed = 0;
    
    for (const testCase of testCases) {
      console.log(`\n${'─'.repeat(60)}`);
      console.log(`🏢 ${testCase.businessName}`);
      console.log(`📧 ${testCase.email}`);
      
      // Buscar user_id
      const userResult = await client.query(
        `SELECT id FROM auth.users WHERE email = $1`,
        [testCase.email]
      );
      
      if (userResult.rows.length === 0) {
        console.log(`❌ Usuário não encontrado`);
        failed++;
        continue;
      }
      
      const userId = userResult.rows[0].id;
      
      // Testar via API
      console.log(`🔄 Enviando mensagem "oi"...`);
      const result = await testViaAPI(userId, 'oi');
      
      if (result.error) {
        console.log(`❌ ERRO: ${result.error}`);
        failed++;
        continue;
      }
      
      const response = (result.response || result.text || '').toLowerCase();
      console.log(`\n📩 Resposta: "${response.substring(0, 150)}..."`);
      
      // Verificar keywords
      const found = testCase.expectedKeywords.filter(k => response.includes(k.toLowerCase()));
      
      if (found.length > 0) {
        console.log(`\n✅ PASSOU - Contém: ${found.join(', ')}`);
        passed++;
      } else {
        console.log(`\n❌ FALHOU - Esperado: ${testCase.expectedKeywords.join(', ')}`);
        failed++;
      }
    }
    
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📊 RESULTADO FINAL: ${passed}/${testCases.length} testes passaram`);
    console.log(`${'═'.repeat(60)}`);
    
    if (failed === 0) {
      console.log('\n🎉 TODOS OS 3 TESTES PASSARAM! SISTEMA 100% OK!');
    } else {
      console.log(`\n⚠️ ${failed} teste(s) falharam - necessário debug`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

runTests();
