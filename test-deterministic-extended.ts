/**
 * 🧪 TESTE EXTENSO DE DETERMINISMO MISTRAL
 * 
 * Executa 10 testes para cada configuração para detectar variações sutis
 * 
 * Uso: npx tsx test-deterministic-extended.ts
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from 'dotenv';

dotenv.config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error("❌ MISTRAL_API_KEY não encontrada no .env");
  process.exit(1);
}

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

// Prompt simples para teste
const SYSTEM_PROMPT = `Você é um assistente de vendas chamado Rodrigo da AgenteZap.
Seja simpático, use linguagem informal e pergunte sobre o negócio do cliente.
Responda de forma curta e direta.`;

const USER_MESSAGE = "Oi";

async function testConfig(config: { temperature: number; randomSeed?: number }, runs: number = 10) {
  const configName = `temp=${config.temperature}${config.randomSeed ? `, seed=${config.randomSeed}` : ''}`;
  console.log(`\n🧪 Testando: ${configName} (${runs} execuções)`);
  console.log("─".repeat(50));

  const responses: string[] = [];
  const uniqueResponses = new Set<string>();

  for (let i = 1; i <= runs; i++) {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_MESSAGE }
      ],
      maxTokens: 100,
      temperature: config.temperature,
      ...(config.randomSeed !== undefined && { randomSeed: config.randomSeed })
    });

    const text = (response.choices?.[0]?.message?.content as string).trim();
    responses.push(text);
    uniqueResponses.add(text);
    
    process.stdout.write(`  [${i}] `);
  }

  console.log(`\n\n📊 Resultado: ${uniqueResponses.size} respostas únicas de ${runs}`);
  
  if (uniqueResponses.size > 1) {
    console.log("❌ VARIAÇÃO DETECTADA:");
    let idx = 1;
    for (const unique of uniqueResponses) {
      const count = responses.filter(r => r === unique).length;
      console.log(`   [${idx}] (${count}x): "${unique.substring(0, 70)}..."`);
      idx++;
    }
  } else {
    console.log("✅ TODAS IDÊNTICAS:");
    console.log(`   "${[...uniqueResponses][0].substring(0, 100)}..."`);
  }

  return {
    configName,
    uniqueCount: uniqueResponses.size,
    totalRuns: runs,
    isConsistent: uniqueResponses.size === 1
  };
}

async function main() {
  console.log("🚀 TESTE EXTENSO DE DETERMINISMO MISTRAL");
  console.log("=========================================");
  console.log("Executando 10 chamadas por configuração...\n");

  const results = [];

  // Teste com temperature=0.3 (atual)
  results.push(await testConfig({ temperature: 0.3 }, 10));

  // Teste com temperature=0 
  results.push(await testConfig({ temperature: 0 }, 10));

  // Teste com temperature=0 + seed
  results.push(await testConfig({ temperature: 0, randomSeed: 42 }, 10));

  // Resumo
  console.log("\n\n" + "=".repeat(50));
  console.log("📋 RESUMO FINAL");
  console.log("=".repeat(50));
  
  for (const r of results) {
    const status = r.isConsistent ? "✅" : "❌";
    console.log(`${status} ${r.configName}: ${r.uniqueCount}/${r.totalRuns} únicas`);
  }

  const best = results.find(r => r.isConsistent);
  if (best) {
    console.log(`\n🏆 CONFIGURAÇÃO RECOMENDADA: ${best.configName}`);
  } else {
    console.log(`\n⚠️ Nenhuma config foi 100% consistente. Usar temperature=0 + seed para minimizar.`);
  }
}

main().catch(console.error);
