// Script para testar Llama 3.3 com system message
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function testLlamaWithSystem() {
  console.log('\n🔍 TESTANDO LLAMA 3.3 COM SYSTEM MESSAGE...\n');
  
  const apiKeyResult = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_api_key'));
  
  const apiKey = apiKeyResult[0]?.valor;
  const model = 'meta-llama/llama-3.3-70b-instruct:free';
  
  console.log(`Modelo: ${model}\n`);
  
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
          { role: 'system', content: 'Você é um assistente de atendimento da Loja XYZ. Responda sempre em português de forma educada.' },
          { role: 'user', content: 'Olá, qual o horário de funcionamento?' }
        ],
        temperature: 0.7,
        max_tokens: 100
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
      console.log('\n🔧 Atualizando modelo no banco para llama-3.3-70b-instruct:free...');
      
      await db
        .update(systemConfig)
        .set({ valor: model, updatedAt: new Date() })
        .where(eq(systemConfig.chave, 'openrouter_model'));
      
      console.log('✅ Modelo atualizado!');
      
    } else {
      const errorText = await response.text();
      console.log('\n❌ ERRO:');
      console.log(errorText);
    }
  } catch (error) {
    console.error('\n❌ ERRO:', error);
  }
  
  process.exit(0);
}

testLlamaWithSystem();
