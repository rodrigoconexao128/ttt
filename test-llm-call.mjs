// Script para testar chamada LLM e verificar logs
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { inArray } from 'drizzle-orm';

async function testLLMCall() {
  console.log('\n🔍 VERIFICANDO CONFIGURAÇÃO E TESTANDO CHAMADA LLM...\n');
  
  // 1. Ler configuração do banco
  const keys = ['openrouter_model', 'openrouter_provider', 'llm_provider', 'openrouter_api_key'];
  const results = await db.select().from(systemConfig).where(inArray(systemConfig.chave, keys));
  
  const provider = results.find(r => r.chave === 'llm_provider')?.valor;
  const model = results.find(r => r.chave === 'openrouter_model')?.valor;
  const openrouterProvider = results.find(r => r.chave === 'openrouter_provider')?.valor;
  const apiKey = results.find(r => r.chave === 'openrouter_api_key')?.valor;
  
  console.log('CONFIGURAÇÃO NO BANCO:');
  console.log(`  - llm_provider: ${provider}`);
  console.log(`  - openrouter_model: ${model}`);
  console.log(`  - openrouter_provider: ${openrouterProvider}`);
  console.log(`  - openrouter_api_key: ${apiKey ? '[PRESENTE]' : '[VAZIO]'}\n`);
  
  if (provider !== 'openrouter' || !apiKey) {
    console.log('❌ OpenRouter não está configurado como provider ou API key está vazia');
    process.exit(1);
  }
  
  // 2. Fazer chamada direta ao OpenRouter
  console.log('📡 FAZENDO CHAMADA DIRETA AO OPENROUTER...\n');
  
  try {
    // Para modelos :free, NÃO especificamos provider
    const isFreeModel = model?.endsWith(':free');
    
    const requestBody = {
      model: model,
      messages: [
        { role: 'user', content: 'Responda apenas: "Teste OK - modelo funcionando"' }
      ],
      temperature: 0.7,
      max_tokens: 50
    };
    
    // Só adiciona provider se NÃO for modelo :free e NÃO for 'auto'
    if (!isFreeModel && openrouterProvider && openrouterProvider !== 'auto') {
      requestBody.provider = {
        order: [openrouterProvider],
        allow_fallbacks: false
      };
    }
    
    console.log(`(Provider: ${isFreeModel || openrouterProvider === 'auto' ? 'auto - OpenRouter escolhe' : openrouterProvider})`);
    
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap'
      },
      body: JSON.stringify(requestBody),
    });
    
    console.log(`HTTP Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`\n❌ ERRO NA RESPOSTA:`);
      console.log(errorText);
      process.exit(1);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('\n✅ RESPOSTA DO OPENROUTER:');
    console.log(`  - Modelo usado: ${data.model || model}`);
    console.log(`  - Provider: ${openrouterProvider}`);
    console.log(`  - Resposta: "${content}"`);
    console.log(`  - Tokens usados: ${data.usage?.total_tokens || 'N/A'}`);
    
    // Verificar custo se disponível
    if (data.usage) {
      console.log('\n📊 USO DE TOKENS:');
      console.log(`  - Input: ${data.usage.prompt_tokens}`);
      console.log(`  - Output: ${data.usage.completion_tokens}`);
    }
    
    console.log('\n🎉 TESTE CONCLUÍDO COM SUCESSO!');
    console.log('O modelo google/gemma-3n-e4b-it via Chutes está funcionando!\n');
    
  } catch (error) {
    console.error('\n❌ ERRO NA CHAMADA:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

testLLMCall();
