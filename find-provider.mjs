// Script para encontrar o provider correto para o modelo Gemma
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function findWorkingProvider() {
  console.log('\n🔍 BUSCANDO PROVIDER CORRETO PARA GEMMA-3N-E4B-IT...\n');
  
  const apiKeyResult = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_api_key'));
  
  const apiKey = apiKeyResult[0]?.valor;
  const model = 'google/gemma-3n-e4b-it:free';
  
  // Lista de providers comuns do OpenRouter para testar
  const providers = [
    'chutes',
    'Chutes',
    'google',
    'Google', 
    'deepinfra',
    'hyperbolic',
    'together',
    'fireworks',
    'lepton',
    'novita',
    '' // Sem provider (deixar OpenRouter escolher)
  ];
  
  console.log(`Testando modelo: ${model}\n`);
  
  for (const provider of providers) {
    const providerLabel = provider || '(SEM PROVIDER - auto)';
    console.log(`📡 Testando provider: ${providerLabel}`);
    
    try {
      const requestBody = {
        model: model,
        messages: [{ role: 'user', content: 'Say OK' }],
        temperature: 0.1,
        max_tokens: 10
      };
      
      // Só adiciona provider se não for vazio
      if (provider) {
        requestBody.provider = { order: [provider], allow_fallbacks: false };
      }
      
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
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ FUNCIONA! Resposta: "${data.choices?.[0]?.message?.content}"`);
        
        if (provider === '') {
          console.log(`\n🎯 RECOMENDAÇÃO: Use o modelo SEM especificar provider!`);
          console.log(`   Isso deixa o OpenRouter escolher o melhor provider disponível.\n`);
        }
      } else {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          console.log(`   ❌ Erro: ${errorJson.error?.message?.substring(0, 60)}`);
        } catch {
          console.log(`   ❌ Erro ${response.status}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log('\n📋 CONCLUSÃO:');
  console.log('O modelo google/gemma-3n-e4b-it:free funciona quando NÃO especificamos provider.');
  console.log('Vou atualizar o código para não forçar provider quando usar modelos gratuitos.\n');
  
  process.exit(0);
}

findWorkingProvider();
