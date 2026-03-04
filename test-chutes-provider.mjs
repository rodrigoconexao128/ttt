/**
 * 🧪 Teste do Provider Chutes no OpenRouter (FORÇADO)
 * 
 * Verifica se a configuração do provider Chutes está funcionando corretamente
 * para o modelo openai/gpt-oss-20b COM FALLBACKS DESABILITADOS
 */

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

if (!OPENROUTER_API_KEY) {
  console.error('❌ ERRO: Variável OPENROUTER_API_KEY não definida!');
  console.log('   Execute: $env:OPENROUTER_API_KEY = "sua-chave-aqui"');
  process.exit(1);
}

async function testChutesProviderForced() {
  console.log('🧪 Testando OpenRouter com provider Chutes (FORÇADO - sem fallbacks)...\n');
  
  const startTime = Date.now();
  
  try {
    const requestBody = {
      model: 'openai/gpt-oss-20b',
      messages: [
        { role: 'user', content: 'Diga apenas: Chutes funcionando!' }
      ],
      max_tokens: 50,
      temperature: 0.1,
      provider: {
        order: ['chutes'],      // ⚠️ FORÇAR APENAS Chutes
        allow_fallbacks: false  // 🚫 NÃO permitir outros providers!
      }
    };
    
    console.log('📤 Request Body:');
    console.log(JSON.stringify(requestBody, null, 2));
    console.log('\n');
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap Test'
      },
      body: JSON.stringify(requestBody)
    });

    const elapsed = Date.now() - startTime;
    const data = await response.json();

    if (!response.ok) {
      console.error('❌ ERRO na API:');
      console.error(`   Status: ${response.status}`);
      console.error(`   Mensagem: ${data.error?.message || JSON.stringify(data)}`);
      console.error('\n   ⚠️ Se o erro for sobre provider indisponível, o Chutes pode estar offline.');
      return;
    }

    const content = data.choices?.[0]?.message?.content || '';
    const usage = data.usage || {};
    
    console.log('✅ SUCESSO!\n');
    console.log('📊 Detalhes da Resposta:');
    console.log(`   📝 Conteúdo: ${content}`);
    console.log(`   ⏱️  Tempo: ${elapsed}ms`);
    console.log(`   📥 Tokens Input: ${usage.prompt_tokens || 'N/A'}`);
    console.log(`   📤 Tokens Output: ${usage.completion_tokens || 'N/A'}`);
    console.log(`   📊 Total Tokens: ${usage.total_tokens || 'N/A'}`);
    
    // Verificar qual provider foi usado (via response headers ou metadata)
    console.log('\n🔍 Verificação do Provider:');
    console.log(`   ID: ${data.id || 'N/A'}`);
    console.log(`   Modelo: ${data.model || 'N/A'}`);
    
    // Calcular custo estimado para Chutes (bf16)
    if (usage.prompt_tokens && usage.completion_tokens) {
      const inputCost = (usage.prompt_tokens / 1000000) * 0.02;  // $0.02/M para Chutes
      const outputCost = (usage.completion_tokens / 1000000) * 0.10;  // $0.10/M para Chutes
      const totalCost = inputCost + outputCost;
      
      console.log(`\n💰 Custo Estimado (Chutes bf16):`);
      console.log(`   Input ($0.02/M):  $${inputCost.toFixed(8)}`);
      console.log(`   Output ($0.10/M): $${outputCost.toFixed(8)}`);
      console.log(`   Total:            $${totalCost.toFixed(8)}`);
      
      // Comparar com outros providers
      const hyperbolicInput = (usage.prompt_tokens / 1000000) * 0.04;
      const hyperbolicOutput = (usage.completion_tokens / 1000000) * 0.04;
      const hyperbolicTotal = hyperbolicInput + hyperbolicOutput;
      
      const deepinfraInput = (usage.prompt_tokens / 1000000) * 0.03;
      const deepinfraOutput = (usage.completion_tokens / 1000000) * 0.14;
      const deepinfraTotal = deepinfraInput + deepinfraOutput;
      
      console.log(`\n📈 Comparação de Custos:`);
      console.log(`   Chutes (atual):   $${totalCost.toFixed(8)} ✅`);
      console.log(`   Hyperbolic:       $${hyperbolicTotal.toFixed(8)}`);
      console.log(`   DeepInfra:        $${deepinfraTotal.toFixed(8)}`);
      console.log(`   Economia vs Hyperbolic: ${((1 - totalCost/hyperbolicTotal) * 100).toFixed(1)}%`);
    }

    console.log('\n✅ Configuração do provider Chutes FORÇADO está funcionando!');
    console.log('   allow_fallbacks: false (outros providers NÃO serão usados)');
    
  } catch (error) {
    console.error('❌ Erro de conexão:', error.message);
  }
}

testChutesProviderForced();
