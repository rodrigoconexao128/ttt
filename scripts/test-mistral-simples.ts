/**
 * TESTE SIMPLES - MISTRAL API
 * Verifica se a API está funcionando corretamente
 */

import { Mistral } from '@mistralai/mistralai';

const API_KEY = 'Qd1y6DSDi8SmVs4xnqYRTv77xg6eRBR4';
const MODEL = 'mistral-medium-latest';

async function main() {
  console.log('🧪 Iniciando teste simples da API Mistral...\n');
  console.log(`📝 API Key: ${API_KEY.substring(0, 8)}...***`);
  console.log(`🤖 Modelo: ${MODEL}\n`);
  
  const client = new Mistral({ apiKey: API_KEY });
  
  let attempt = 0;
  const maxAttempts = 50;
  
  while (attempt < maxAttempts) {
    attempt++;
    console.log(`\n--- Tentativa ${attempt}/${maxAttempts} ---`);
    
    try {
      const response = await client.chat.complete({
        model: MODEL,
        messages: [
          { role: 'user', content: 'Responda apenas: OK' }
        ],
        maxTokens: 10,
      });
      
      const text = response.choices?.[0]?.message?.content;
      console.log(`✅ Resposta: ${text}`);
      console.log('\n🎉 API Mistral funcionando corretamente!');
      process.exit(0);
      
    } catch (error: any) {
      const status = error?.status || error?.statusCode;
      const msg = error?.message || String(error);
      
      console.log(`❌ Erro: ${msg}`);
      console.log(`   Status: ${status}`);
      
      if (status === 429 || msg.includes('429') || msg.toLowerCase().includes('rate limit')) {
        console.log('⏳ Rate limit - aguardando 30 segundos...');
        await new Promise(r => setTimeout(r, 30000));
      } else if (status === 503 || msg.includes('503')) {
        console.log('⏳ Serviço indisponível - aguardando 20 segundos...');
        await new Promise(r => setTimeout(r, 20000));
      } else {
        console.log('⏳ Aguardando 10 segundos antes de tentar novamente...');
        await new Promise(r => setTimeout(r, 10000));
      }
    }
  }
  
  console.log(`\n❌ Falhou após ${maxAttempts} tentativas`);
  process.exit(1);
}

main().catch(e => {
  console.error('Erro fatal:', e);
  process.exit(1);
});
