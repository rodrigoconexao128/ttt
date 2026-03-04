// Script para testar Gemma 3n 4B PAGO com provider Together
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function testGemmaPaid() {
  console.log('\n🔍 TESTANDO GEMMA 3N 4B PAGO COM PROVIDER TOGETHER...\n');
  
  const apiKeyResult = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_api_key'));
  
  const apiKey = apiKeyResult[0]?.valor;
  
  // Modelo PAGO (sem :free) - $0.02/M input, $0.04/M output
  const model = 'google/gemma-3n-e4b-it';
  const provider = 'Together';  // Provider disponível na screenshot
  
  console.log(`Modelo: ${model}`);
  console.log(`Provider: ${provider}`);
  console.log(`Preço: $0.02/M input | $0.04/M output\n`);
  
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap'
      },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: 'Você é um assistente de atendimento da Loja XYZ. Responda sempre em português de forma educada e breve.' },
          { role: 'user', content: 'Olá, qual o horário de funcionamento?' }
        ],
        temperature: 0.7,
        max_tokens: 100,
        provider: {
          order: [provider],
          allow_fallbacks: false
        }
      }),
    });
    
    console.log(`HTTP Status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;
      
      console.log('\n✅ FUNCIONA COM SYSTEM MESSAGE!');
      console.log(`\nResposta: "${content}"`);
      console.log(`\nTokens: ${data.usage?.total_tokens || 'N/A'}`);
      
      // Atualizar o modelo no banco
      console.log('\n🔧 Atualizando configuração no banco...');
      
      await db
        .update(systemConfig)
        .set({ valor: model, updatedAt: new Date() })
        .where(eq(systemConfig.chave, 'openrouter_model'));
      
      await db
        .update(systemConfig)
        .set({ valor: provider.toLowerCase(), updatedAt: new Date() })
        .where(eq(systemConfig.chave, 'openrouter_provider'));
      
      console.log(`✅ Modelo: ${model}`);
      console.log(`✅ Provider: ${provider}`);
      
    } else {
      const errorText = await response.text();
      console.log('\n❌ ERRO:');
      console.log(errorText);
      
      // Tentar sem especificar provider
      console.log('\n📡 Tentando SEM especificar provider...');
      
      const response2 = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://agentezap.online',
          'X-Title': 'AgenteZap'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: 'Você é um assistente. Responda em português.' },
            { role: 'user', content: 'Diga apenas: OK funcionando' }
          ],
          temperature: 0.7,
          max_tokens: 50
        }),
      });
      
      console.log(`HTTP Status: ${response2.status}`);
      
      if (response2.ok) {
        const data2 = await response2.json();
        console.log('\n✅ FUNCIONA SEM PROVIDER ESPECÍFICO!');
        console.log(`Resposta: "${data2.choices?.[0]?.message?.content}"`);
        
        // Atualizar o modelo no banco
        await db
          .update(systemConfig)
          .set({ valor: model, updatedAt: new Date() })
          .where(eq(systemConfig.chave, 'openrouter_model'));
        
        await db
          .update(systemConfig)
          .set({ valor: 'auto', updatedAt: new Date() })
          .where(eq(systemConfig.chave, 'openrouter_provider'));
        
        console.log(`\n✅ Modelo configurado: ${model}`);
        console.log(`✅ Provider: auto`);
      } else {
        const errorText2 = await response2.text();
        console.log('\n❌ ERRO:');
        console.log(errorText2);
      }
    }
  } catch (error) {
    console.error('\n❌ ERRO:', error);
  }
  
  process.exit(0);
}

testGemmaPaid();
