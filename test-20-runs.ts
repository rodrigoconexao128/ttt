import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";

dotenv.config();

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

// Prompt real do banco de dados (resumido para teste)
const systemPrompt = `Você é um agente virtual especializado...
EMPRESA: AgenteZap - IA para WhatsApp
OBJETIVO: Capturar leads e agendar demonstrações`;

const userMessage = "Oi";

async function runTest(testNumber: number): Promise<string> {
  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      maxTokens: 300,
      temperature: 0.0,  // ZERO - determinístico
      randomSeed: 42,    // SEED FIXO
    });

    const content = response.choices?.[0]?.message?.content;
    return typeof content === "string" ? content : "ERROR";
  } catch (error) {
    return `ERROR: ${error}`;
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE DETERMINISMO - 20 EXECUÇÕES");
  console.log("   Config: temperature=0.0, randomSeed=42");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const results: string[] = [];
  
  for (let i = 1; i <= 20; i++) {
    console.log(`Teste ${i}/20...`);
    const result = await runTest(i);
    results.push(result);
    
    // Pequeno delay para não sobrecarregar API
    await new Promise(r => setTimeout(r, 500));
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 RESULTADOS:");
  console.log("═══════════════════════════════════════════════════════════════\n");

  // Contar variações únicas
  const uniqueResponses = new Map<string, number[]>();
  
  results.forEach((result, index) => {
    const key = result.substring(0, 100); // Primeiros 100 chars para comparar
    if (!uniqueResponses.has(key)) {
      uniqueResponses.set(key, []);
    }
    uniqueResponses.get(key)!.push(index + 1);
  });

  console.log(`Total de variações únicas: ${uniqueResponses.size}\n`);

  let varNum = 1;
  uniqueResponses.forEach((indices, response) => {
    console.log(`\n📝 VARIAÇÃO ${varNum} (apareceu em ${indices.length} testes: ${indices.join(", ")}):`);
    console.log(`"${response}..."`);
    varNum++;
  });

  console.log("\n═══════════════════════════════════════════════════════════════");
  if (uniqueResponses.size === 1) {
    console.log("✅ DETERMINÍSTICO! Todas as 20 respostas são IDÊNTICAS!");
  } else {
    console.log(`❌ VARIAÇÃO DETECTADA! ${uniqueResponses.size} respostas diferentes em 20 testes`);
  }
  console.log("═══════════════════════════════════════════════════════════════");

  // Mostrar todas as respostas completas
  console.log("\n\n📋 TODAS AS RESPOSTAS COMPLETAS:");
  results.forEach((r, i) => {
    console.log(`\n--- Teste ${i + 1} ---`);
    console.log(r);
  });
}

main();
