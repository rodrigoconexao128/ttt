/**
 * 🔍 DEBUG: Identificar por que há variação entre Simulador e WhatsApp
 * 
 * Este script testa a mesma chamada múltiplas vezes para detectar variações
 */

import { getMistralClient } from "./server/mistralClient";

async function testDeterminism() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🔍 TESTE DE DETERMINISMO - SIMULADOR vs WHATSAPP");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const mistral = await getMistralClient();
  
  // Prompt simples e fixo para testar
  const systemPrompt = `Você é Rodrigo, vendedor da AgenteZap. 
Responda de forma natural e persuasiva.
Plano ilimitado: R$49/mês por número.
Para criar conta: https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e`;

  const userMessage = "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.";

  const results: string[] = [];
  
  console.log("📝 System Prompt:", systemPrompt.substring(0, 100) + "...");
  console.log("💬 User Message:", userMessage);
  console.log("\n");

  // Testar 5 vezes com EXATAMENTE os mesmos parâmetros
  for (let i = 1; i <= 5; i++) {
    console.log(`\n🔄 Teste #${i}...`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.0,  // ZERO = determinístico
        randomSeed: 42,    // Seed fixo
        // SEM maxTokens - deixar o modelo decidir
      });

      const text = response.choices?.[0]?.message?.content;
      const result = typeof text === 'string' ? text : JSON.stringify(text);
      results.push(result);
      
      console.log(`   ✅ Resposta: ${result.substring(0, 100)}...`);
      console.log(`   📏 Tamanho: ${result.length} chars`);
      
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      results.push(`ERROR: ${error.message}`);
    }
    
    // Pequeno delay entre chamadas
    await new Promise(r => setTimeout(r, 500));
  }

  // Análise de variação
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 ANÁLISE DE VARIAÇÃO");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  const uniqueResults = [...new Set(results)];
  
  if (uniqueResults.length === 1) {
    console.log("✅ TODAS AS RESPOSTAS SÃO IDÊNTICAS!");
    console.log("   O modelo está sendo determinístico com temperature=0.0 e randomSeed=42");
  } else {
    console.log(`⚠️ VARIAÇÃO DETECTADA: ${uniqueResults.length} respostas diferentes de ${results.length} testes`);
    console.log("\n📋 Respostas únicas:");
    uniqueResults.forEach((r, i) => {
      console.log(`\n--- Resposta ${i + 1} (${r.length} chars) ---`);
      console.log(r);
    });
  }

  // Mostrar diferenças de tamanho
  console.log("\n📏 Tamanhos das respostas:");
  results.forEach((r, i) => {
    console.log(`   Teste #${i + 1}: ${r.length} chars`);
  });

  // Testar agora COM maxTokens para ver se isso causa variação
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("🔬 TESTE COM maxTokens (pode causar truncamento)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const resultsWithMax: string[] = [];
  
  for (let i = 1; i <= 3; i++) {
    console.log(`🔄 Teste com maxTokens #${i}...`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage }
        ],
        temperature: 0.0,
        randomSeed: 42,
        maxTokens: 500, // Limitado
      });

      const text = response.choices?.[0]?.message?.content;
      const result = typeof text === 'string' ? text : JSON.stringify(text);
      resultsWithMax.push(result);
      
      console.log(`   📏 Tamanho: ${result.length} chars`);
      
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }

  const uniqueWithMax = [...new Set(resultsWithMax)];
  console.log(`\n📊 Com maxTokens: ${uniqueWithMax.length} respostas diferentes de ${resultsWithMax.length}`);
}

testDeterminism().catch(console.error);
