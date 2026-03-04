/**
 * Teste de API OpenRouter
 * Testando múltiplos modelos gratuitos
 */

const OPENROUTER_API_KEY = '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';

// Testar modelos diferentes
const MODELS_TO_TEST = [
  'meta-llama/llama-3.3-70b-instruct:free',
  'google/gemma-2-9b-it:free',
  'mistralai/mistral-7b-instruct:free',
  'openai/gpt-oss-20b:free',
  'openai/gpt-oss-20b'
];

async function testOpenRouter() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE DE API OPENROUTER');
  console.log('═══════════════════════════════════════════════════════════');
  console.log(`🔑 API Key: ${OPENROUTER_API_KEY.substring(0, 25)}...`);
  console.log('');

  const messages = [
    {
      role: 'system',
      content: 'Você é um assistente útil. Responda em português.'
    },
    {
      role: 'user',
      content: 'Diga apenas: OpenRouter OK'
    }
  ];

  for (const MODEL of MODELS_TO_TEST) {
    console.log(`\n📦 Testando: ${MODEL}`);

    const startTime = Date.now();

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agentezap.online',
          'X-Title': 'AgenteZap'
        },
        body: JSON.stringify({
          model: MODEL,
          messages: messages,
          max_tokens: 50,
          temperature: 0.3
        })
      });

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        const errorText = await response.text();
        console.log(`   ❌ Status ${response.status}: ${errorText.substring(0, 100)}`);
        continue;
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log(`   ✅ OK em ${elapsed}ms`);
      console.log(`   💬 ${content.substring(0, 80)}`);
      
      // Se encontrou modelo funcionando, testar pergunta real
      if (content) {
        console.log('\n🎉 MODELO FUNCIONANDO! Testando pergunta real...');
        
        const response2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': 'https://agentezap.online',
            'X-Title': 'AgenteZap'
          },
          body: JSON.stringify({
            model: MODEL,
            messages: [
              { role: 'system', content: 'Você é Rodrigo da AgenteZap. Seja simpático e breve.' },
              { role: 'user', content: 'Olá, quais os preços?' }
            ],
            max_tokens: 150,
            temperature: 0.3
          })
        });

        if (response2.ok) {
          const data2 = await response2.json();
          console.log(`   💬 Resposta: ${data2.choices?.[0]?.message?.content?.substring(0, 150) || 'N/A'}`);
        }
        
        console.log('\n═══════════════════════════════════════════════════════════');
        console.log(`✅ MODELO RECOMENDADO: ${MODEL}`);
        console.log('═══════════════════════════════════════════════════════════');
        return MODEL;
      }

    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
  }
  
  console.log('\n❌ Nenhum modelo funcionou. Verifique sua conta OpenRouter.');
  return null;
}

testOpenRouter().then(model => {
  if (model) {
    console.log(`\n📋 Para usar no sistema, configure:`);
    console.log(`   llm_provider = 'openrouter'`);
    console.log(`   openrouter_api_key = '${OPENROUTER_API_KEY}'`);
    console.log(`   openrouter_model = '${model}'`);
  }
});
