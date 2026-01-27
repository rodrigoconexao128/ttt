/**
 * Script de teste automático do simulador
 * Executa 3 testes completos para validar funcionamento
 */

async function testSimulator() {
  const baseUrl = 'http://localhost:3456';
  
  console.log('🧪 TESTE 1: Verificar se servidor está rodando...\n');
  
  try {
    const response = await fetch(baseUrl);
    if (response.ok) {
      console.log('✅ TESTE 1 PASSOU: Servidor respondeu\n');
    } else {
      console.error('❌ TESTE 1 FALHOU: Servidor retornou', response.status);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ TESTE 1 FALHOU:', error.message);
    process.exit(1);
  }

  console.log('🧪 TESTE 2: Buscar lista de negócios...\n');
  
  try {
    const response = await fetch(`${baseUrl}/api/businesses`);
    const businesses = await response.json();
    
    if (businesses.length >= 2) {
      console.log('✅ TESTE 2 PASSOU: Encontrados', businesses.length, 'negócios');
      businesses.forEach(b => console.log(`   - ${b.name}`));
      console.log('');
    } else {
      console.error('❌ TESTE 2 FALHOU: Esperava 2 negócios, encontrou', businesses.length);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ TESTE 2 FALHOU:', error.message);
    process.exit(1);
  }

  console.log('🧪 TESTE 3: Testar modelos com mensagem real...\n');
  
  try {
    const response = await fetch(`${baseUrl}/api/test-models`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        business: 'rodrigo4@gmail.com',
        userMessage: 'Qual o preço?',
        history: []
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error('❌ TESTE 3 FALHOU: API retornou erro', response.status);
      console.error('Erro:', error);
      process.exit(1);
    }

    const results = await response.json();
    
    if (results.length === 7) {
      console.log('✅ TESTE 3 PASSOU: Todos os 7 modelos testados com sucesso!\n');
      
      console.log('📊 Resultados:');
      results.forEach((r, i) => {
        const emoji = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
        console.log(`${emoji} ${r.modelName}: ${r.score}% | ${r.elapsed}ms | ${r.hallucinations} alucinações`);
      });
      console.log('');
    } else {
      console.error('❌ TESTE 3 FALHOU: Esperava 7 modelos, recebeu', results.length);
      process.exit(1);
    }
  } catch (error) {
    console.error('❌ TESTE 3 FALHOU:', error.message);
    process.exit(1);
  }

  console.log('\n🎉 TODOS OS TESTES PASSARAM! Simulador está funcionando perfeitamente.\n');
  console.log('Acesse: http://localhost:3456\n');
}

// Aguardar um pouco antes de testar
setTimeout(() => {
  testSimulator().catch(error => {
    console.error('Erro geral:', error);
    process.exit(1);
  });
}, 2000);
