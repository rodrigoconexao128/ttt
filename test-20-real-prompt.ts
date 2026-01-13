import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";

dotenv.config();

const mistral = new Mistral({
  apiKey: process.env.MISTRAL_API_KEY,
});

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

async function getPromptFromDB(): Promise<string> {
  // Tabela correta é ai_agent_config e coluna é prompt
  const { data: agent, error } = await supabase
    .from("ai_agent_config")
    .select("prompt, user_id")
    .not("prompt", "is", null)
    .limit(1)
    .single();
  
  if (error) {
    console.log("Erro ai_agent_config:", error.message);
    
    // Tenta business_agent_configs
    const { data: business, error: err2 } = await supabase
      .from("business_agent_configs")
      .select("*")
      .limit(1)
      .single();
    
    if (business) {
      console.log("Usando business_agent_configs:", business.user_id);
      // Constrói um prompt baseado na config
      return `Você é ${business.agent_name || "atendente"}, ${business.agent_role || "atendente"} da empresa ${business.company_name || "AgenteZap"}.

${business.company_description || ""}

Seja ${business.personality || "profissional e prestativo"}.`;
    }
  }
  
  console.log("Agente user_id:", agent?.user_id);
  return agent?.prompt || "";
}

async function runTest(systemPrompt: string, testNumber: number): Promise<string> {
  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Oi" }
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
  console.log("🧪 TESTE COM PROMPT REAL DO BANCO - 20 EXECUÇÕES");
  console.log("   Config: temperature=0.0, randomSeed=42");
  console.log("═══════════════════════════════════════════════════════════════\n");

  console.log("📥 Buscando prompt do banco de dados...");
  const systemPrompt = await getPromptFromDB();
  console.log(`✅ Prompt carregado (${systemPrompt.length} caracteres)`);
  console.log(`Primeiros 300 chars:\n"${systemPrompt.substring(0, 300)}..."\n`);

  if (systemPrompt.length < 50) {
    console.log("❌ Prompt muito curto ou não encontrado!");
    return;
  }

  const results: string[] = [];
  
  for (let i = 1; i <= 20; i++) {
    process.stdout.write(`Teste ${i}/20... `);
    const result = await runTest(systemPrompt, i);
    results.push(result);
    console.log("✓");
    
    await new Promise(r => setTimeout(r, 300));
  }

  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 RESULTADOS:");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const uniqueResponses = new Map<string, number[]>();
  
  results.forEach((result, index) => {
    const key = result.trim();
    if (!uniqueResponses.has(key)) {
      uniqueResponses.set(key, []);
    }
    uniqueResponses.get(key)!.push(index + 1);
  });

  console.log(`Total de variações únicas: ${uniqueResponses.size}\n`);

  let varNum = 1;
  uniqueResponses.forEach((indices, response) => {
    console.log(`\n📝 VARIAÇÃO ${varNum} (apareceu em ${indices.length} testes: ${indices.join(", ")}):`);
    console.log(`"${response.substring(0, 250)}..."`);
    varNum++;
  });

  console.log("\n═══════════════════════════════════════════════════════════════");
  if (uniqueResponses.size === 1) {
    console.log("✅ DETERMINÍSTICO! Todas as 20 respostas são IDÊNTICAS!");
  } else {
    console.log(`❌ VARIAÇÃO DETECTADA! ${uniqueResponses.size} respostas diferentes em 20 testes`);
  }
  console.log("═══════════════════════════════════════════════════════════════");

  console.log("\n\n📋 PRIMEIRAS 3 RESPOSTAS COMPLETAS:");
  for (let i = 0; i < Math.min(3, results.length); i++) {
    console.log(`\n--- Teste ${i + 1} ---`);
    console.log(results[i]);
  }
}

main();
