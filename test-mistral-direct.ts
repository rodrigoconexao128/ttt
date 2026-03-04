/**
 * Teste direto da API Mistral (sem banco de dados)
 */

import { Mistral } from "@mistralai/mistralai";

const API_KEY = "ZgYFI0WS48O4PqlSRP7jvS9TsfPbiyqL";

async function testDirect() {
  console.log("🧪 Testando chave Mistral diretamente...");
  console.log(`   Chave: ${API_KEY.substring(0, 8)}...${API_KEY.substring(API_KEY.length - 4)}`);
  
  try {
    const mistral = new Mistral({ apiKey: API_KEY });
    
    console.log("\n📡 Fazendo chamada à API...");
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: "Responda apenas: OK" }],
      maxTokens: 10,
    });
    
    if (response.choices && response.choices.length > 0) {
      const content = response.choices[0]?.message?.content;
      console.log(`\n✅ API funcionando! Resposta: "${content}"`);
      console.log("🎉 Chave Mistral VÁLIDA!");
    } else {
      console.log("\n❌ Resposta vazia da API");
    }
    
  } catch (error: any) {
    console.log("\n❌ ERRO:");
    console.log(`   ${error.message}`);
    console.log(`   Status: ${error.status || 'N/A'}`);
  }
}

testDirect();
