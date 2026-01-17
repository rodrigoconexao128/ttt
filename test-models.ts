/**
 * 🔍 DEBUG: Testar diferentes modelos Mistral para encontrar o mais determinístico
 */

import { getMistralClient } from "./server/mistralClient";

async function testModels() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🔍 TESTE DE MODELOS MISTRAL - BUSCANDO DETERMINISMO");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const mistral = await getMistralClient();
  
  const systemPrompt = `Você é Rodrigo, vendedor da AgenteZap. 
Responda de forma natural e persuasiva.
Plano ilimitado: R$49/mês por número.
Para criar conta: https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e

IMPORTANTE: Sempre responda exatamente da mesma forma para a mesma pergunta.`;

  const userMessage = "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.";

  // Lista de modelos para testar
  const models = [
    "mistral-small-latest",
    "mistral-small-2503",    // Versão específica - pode ser mais estável
    "open-mistral-7b",       // Modelo menor - pode ser mais estável
    "mistral-tiny",          // Modelo mais simples
  ];

  for (const model of models) {
    console.log(`\n📦 Testando modelo: ${model}`);
    console.log("─".repeat(60));
    
    const results: string[] = [];
    let errors = 0;
    
    for (let i = 1; i <= 5; i++) {
      try {
        const response = await mistral.chat.complete({
          model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: userMessage }
          ],
          temperature: 0.0,
          randomSeed: 42,
        });

        const text = response.choices?.[0]?.message?.content;
        const result = typeof text === 'string' ? text : "";
        results.push(result);
        
        process.stdout.write(`  #${i}: ${result.length} chars | `);
        
      } catch (error: any) {
        errors++;
        process.stdout.write(`  #${i}: ERROR | `);
        results.push("ERROR");
      }
      
      await new Promise(r => setTimeout(r, 300));
    }
    
    const uniqueResults = [...new Set(results.filter(r => r !== "ERROR"))];
    const variationPct = ((uniqueResults.length - 1) / Math.max(results.length - errors, 1)) * 100;
    
    console.log(`\n  📊 Resultado: ${uniqueResults.length} respostas únicas | Variação: ${variationPct.toFixed(0)}%`);
    
    if (uniqueResults.length === 1) {
      console.log(`  ✅ MODELO DETERMINÍSTICO!`);
    } else {
      console.log(`  ⚠️ Modelo tem variação`);
    }
  }

  // Testar com prefilled response (técnica avançada)
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: Prefilled Response (força início fixo)");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const prefilledResults: string[] = [];
  
  for (let i = 1; i <= 5; i++) {
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userMessage },
          // Prefill: força o início da resposta
          { role: "assistant", content: "Opa" }
        ],
        temperature: 0.0,
        randomSeed: 42,
      });

      const text = response.choices?.[0]?.message?.content;
      const result = typeof text === 'string' ? text : "";
      prefilledResults.push(result);
      
      console.log(`  #${i}: ${result.length} chars`);
      
    } catch (error: any) {
      console.log(`  #${i}: ERROR - ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 300));
  }
  
  const uniquePrefilled = [...new Set(prefilledResults)];
  console.log(`\n  📊 Com Prefill: ${uniquePrefilled.length} respostas únicas de ${prefilledResults.length}`);
}

testModels().catch(console.error);
