// Script para testar modelos disponíveis no OpenRouter
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function testModels() {
  console.log('\n🔍 TESTANDO MODELOS DISPONÍVEIS NO OPENROUTER...\n');
  
  const apiKeyResult = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_api_key'));
  
  const apiKey = apiKeyResult[0]?.valor;
  
  // Lista de modelos para testar
  const modelsToTest = [
    'google/gemma-3n-e4b-it:free',
    'google/gemma-3n-e4b-it',
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free',
    'meta-llama/llama-3.2-3b-instruct:free'
  ];
  
  for (const model of modelsToTest) {
    console.log(`\n📡 Testando: ${model}`);
    
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
            { role: 'user', content: 'Say only: OK' }
          ],
          temperature: 0.1,
          max_tokens: 10
          // SEM provider específico para testar disponibilidade geral
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ DISPONÍVEL - Resposta: ${data.choices?.[0]?.message?.content?.substring(0, 50)}`);
      } else {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          console.log(`   ❌ Erro ${response.status}: ${errorJson.error?.message || errorText}`);
        } catch {
          console.log(`   ❌ Erro ${response.status}`);
        }
      }
    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
    
    // Pequeno delay para evitar rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Testar modelo com provider Chutes
  console.log('\n\n📡 TESTANDO MODELO COM PROVIDER CHUTES:');
  
  const testWithChutes = async (model) => {
    console.log(`   Modelo: ${model} via Chutes`);
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
          messages: [{ role: 'user', content: 'Say OK' }],
          temperature: 0.1,
          max_tokens: 10,
          provider: { order: ['chutes'], allow_fallbacks: false }
        }),
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log(`   ✅ FUNCIONA com Chutes! Resposta: ${data.choices?.[0]?.message?.content}`);
        return true;
      } else {
        const errorText = await response.text();
        try {
          const errorJson = JSON.parse(errorText);
          console.log(`   ❌ Erro: ${errorJson.error?.message}`);
        } catch {
          console.log(`   ❌ Erro ${response.status}`);
        }
        return false;
      }
    } catch (error) {
      console.log(`   ❌ Erro: ${error.message}`);
      return false;
    }
  };
  
  // Testar com modelo llama que provavelmente funciona
  await testWithChutes('meta-llama/llama-3.3-70b-instruct:free');
  await new Promise(r => setTimeout(r, 1000));
  await testWithChutes('meta-llama/llama-3.2-3b-instruct:free');
  
  process.exit(0);
}

testModels();
