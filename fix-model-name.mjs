// Script para corrigir o nome do modelo no banco
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function fixModelName() {
  console.log('\n🔧 CORRIGINDO NOME DO MODELO...\n');
  
  const correctModel = 'google/gemma-3n-e4b-it:free';
  
  // Atualizar o modelo no banco
  await db
    .update(systemConfig)
    .set({ valor: correctModel, updatedAt: new Date() })
    .where(eq(systemConfig.chave, 'openrouter_model'));
  
  console.log(`✅ Modelo atualizado para: ${correctModel}`);
  
  // Verificar se foi salvo
  const result = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_model'));
  
  console.log(`Valor no banco agora: ${result[0]?.valor}`);
  
  // Agora testar a chamada
  console.log('\n📡 TESTANDO CHAMADA COM MODELO CORRIGIDO...\n');
  
  const apiKeyResult = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_api_key'));
  
  const apiKey = apiKeyResult[0]?.valor;
  
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
        model: correctModel,
        messages: [
          { role: 'system', content: 'Você é um assistente amigável.' },
          { role: 'user', content: 'Responda apenas: "OK - modelo Gemma funcionando!"' }
        ],
        temperature: 0.7,
        max_tokens: 50,
        provider: {
          order: ['chutes'],
          allow_fallbacks: false
        }
      }),
    });
    
    console.log(`HTTP Status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.log(`\n❌ ERRO:`);
      console.log(errorText);
      process.exit(1);
    }
    
    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    console.log('\n✅ RESPOSTA DO OPENROUTER:');
    console.log(`  - Modelo: ${data.model || correctModel}`);
    console.log(`  - Resposta: "${content}"`);
    console.log(`  - Tokens: ${data.usage?.total_tokens || 'N/A'}`);
    
    console.log('\n🎉 MODELO CORRIGIDO E FUNCIONANDO!\n');
    
  } catch (error) {
    console.error('\n❌ ERRO:', error);
    process.exit(1);
  }
  
  process.exit(0);
}

fixModelName();
