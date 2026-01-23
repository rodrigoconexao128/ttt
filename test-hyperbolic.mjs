/**
 * Teste do OpenRouter API com provider Hyperbolic
 * Modelo: openai/gpt-oss-20b (pago, ~$0.04/M tokens)
 */

const OPENROUTER_API_KEY = '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';
const MODEL = 'openai/gpt-oss-20b';

async function testHyperbolicProvider() {
  console.log('🔬 Testando OpenRouter com provider Hyperbolic...\n');
  console.log(`📦 Modelo: ${MODEL}`);
  console.log(`🏢 Provider forçado: hyperbolic`);
  console.log('');
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap Test'
      },
      body: JSON.stringify({
        model: MODEL,
        messages: [
          { role: 'user', content: 'Diga "Olá! Hyperbolic funcionando!" em uma linha' }
        ],
        max_tokens: 100,
        temperature: 0.7,
        provider: {
          order: ['hyperbolic'],
          allow_fallbacks: true
        }
      })
    });
    
    console.log(`📡 Status: ${response.status}`);
    
    const data = await response.json();
    
    if (response.ok) {
      console.log('\n✅ SUCESSO!\n');
      console.log('📝 Resposta:', data.choices?.[0]?.message?.content);
      console.log('\n📊 Detalhes:');
      console.log(`   - Modelo usado: ${data.model}`);
      console.log(`   - Provider: ${data.provider || 'não informado'}`);
      console.log(`   - ID: ${data.id}`);
      console.log(`   - Tokens prompt: ${data.usage?.prompt_tokens || 'N/A'}`);
      console.log(`   - Tokens completion: ${data.usage?.completion_tokens || 'N/A'}`);
      console.log(`   - Total tokens: ${data.usage?.total_tokens || 'N/A'}`);
      
      // Calcular custo estimado (Hyperbolic: $0.04/M input, $0.04/M output)
      if (data.usage) {
        const inputCost = (data.usage.prompt_tokens / 1000000) * 0.04;
        const outputCost = (data.usage.completion_tokens / 1000000) * 0.04;
        const totalCost = inputCost + outputCost;
        console.log(`\n💰 Custo estimado (Hyperbolic):`);
        console.log(`   - Input: $${inputCost.toFixed(8)}`);
        console.log(`   - Output: $${outputCost.toFixed(8)}`);
        console.log(`   - Total: $${totalCost.toFixed(8)}`);
      }
    } else {
      console.log('\n❌ ERRO!\n');
      console.log('Erro:', JSON.stringify(data, null, 2));
    }
    
  } catch (error) {
    console.error('\n💥 Erro na requisição:', error.message);
  }
}

// Executar teste
testHyperbolicProvider();
