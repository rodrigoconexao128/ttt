/**
 * 🧪 TESTE FINAL: top_p=0 para máximo determinismo
 * 
 * Testando combinação de temperature=0, randomSeed e top_p
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from 'dotenv';

dotenv.config();

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY! });

const SYSTEM = `Você é Rodrigo da AgenteZap. Seja direto e pergunte o ramo do cliente.`;
const USER = "Oi";

async function test(name: string, opts: any, runs: number = 15) {
  console.log(`\n🧪 ${name}`);
  const responses: string[] = [];
  
  for (let i = 0; i < runs; i++) {
    const r = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: USER }
      ],
      maxTokens: 80,
      ...opts
    });
    responses.push((r.choices?.[0]?.message?.content as string).trim());
    process.stdout.write(".");
  }
  
  const unique = new Set(responses);
  console.log(`\n   ${unique.size}/${runs} únicas - ${unique.size === 1 ? "✅ OK" : "❌ VARIOU"}`);
  
  if (unique.size > 1) {
    let i = 1;
    for (const u of unique) {
      console.log(`   [${i++}] "${u.substring(0, 60)}..."`);
    }
  }
  
  return unique.size === 1;
}

async function main() {
  console.log("🔬 TESTE DE PARÂMETROS MISTRAL PARA DETERMINISMO\n");
  
  const results = [];
  
  // Config atual
  results.push(["temp=0.3 (atual)", await test("temp=0.3", { temperature: 0.3 })]);
  
  // temperature=0
  results.push(["temp=0", await test("temp=0", { temperature: 0 })]);
  
  // temperature=0 + seed
  results.push(["temp=0+seed", await test("temp=0+seed=42", { temperature: 0, randomSeed: 42 })]);
  
  // NOVO: top_p muito baixo (greedy)
  results.push(["temp=0+top_p=0.01", await test("temp=0+top_p=0.01", { temperature: 0, topP: 0.01 })]);
  
  // COMBO: seed + top_p
  results.push(["temp=0+seed+top_p", await test("temp=0+seed=42+top_p=0.01", { 
    temperature: 0, 
    randomSeed: 42,
    topP: 0.01 
  })]);
  
  console.log("\n" + "=".repeat(50));
  console.log("📊 RESULTADO FINAL:");
  for (const [name, ok] of results) {
    console.log(`   ${ok ? "✅" : "❌"} ${name}`);
  }
  
  const winner = results.find(([_, ok]) => ok);
  if (winner) {
    console.log(`\n🏆 USAR: ${winner[0]}`);
  }
}

main();
