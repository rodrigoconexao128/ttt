import dotenv from 'dotenv';
dotenv.config();

import OpenAI from 'openai';

async function testMistralAPI() {
  const apiKey = process.env.MISTRAL_API_KEY;
  
  console.log('🧪 TESTE: API do Mistral\n');
  console.log(`🔑 Key: ${apiKey?.substring(0, 10)}...${apiKey?.substring(apiKey.length - 5)}`);
  console.log(`📏 Length: ${apiKey?.length} characters\n`);
  
  const client = new OpenAI({
    apiKey: apiKey,
    baseURL: "https://api.mistral.ai/v1"
  });
  
  try {
    console.log('📤 Fazendo requisição para Mistral...\n');
    
    const response = await client.chat.completions.create({
      model: "mistral-small-latest",
      messages: [
        { role: "user", content: "Responda apenas: OK" }
      ],
      max_tokens: 10
    });
    
    console.log('✅ SUCESSO!\n');
    console.log('📄 Resposta:', response.choices[0]?.message?.content);
    console.log('\n🎉 A chave do Mistral está funcionando corretamente!');
    
  } catch (error: any) {
    console.log('❌ ERRO!\n');
    console.log('Status:', error.status);
    console.log('Mensagem:', error.message);
    console.log('\nDetalhes do erro:', JSON.stringify(error, null, 2));
    
    if (error.status === 401) {
      console.log('\n⚠️  ERRO 401: Chave de API inválida!');
      console.log('Verifique se a chave está correta no arquivo .env e no banco de dados.');
    }
  }
}

testMistralAPI();
