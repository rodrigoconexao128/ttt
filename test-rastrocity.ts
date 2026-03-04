/**
 * 🧪 TESTE DO AGENTE RASTRO CITY
 * 
 * Execute com: npx tsx test-rastrocity.ts
 */

import 'dotenv/config';
import { getMistralClient } from "./server/mistralClient";
import { pool } from "./server/db";

const USER_EMAIL = "rastrocitygps@gmail.com";

async function getAgentConfig() {
  const result = await pool.query(
    `SELECT a.* FROM ai_agent_config a 
     JOIN users u ON a.user_id = u.id 
     WHERE u.email = $1`,
    [USER_EMAIL]
  );
  return result.rows[0];
}

async function testAgent(message: string, conversationHistory: Array<{role: string, content: string}> = []) {
  const config = await getAgentConfig();
  
  if (!config) {
    console.error("❌ Agente não encontrado!");
    return;
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("📱 CLIENTE:", message);
  console.log("=".repeat(60));
  
  const mistral = await getMistralClient();
  
  const messages = [
    { role: "system" as const, content: config.prompt },
    ...conversationHistory.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
    { role: "user" as const, content: message }
  ];
  
  const response = await mistral.chat.complete({
    model: config.model || "mistral-small-latest",
    messages,
    temperature: 0.7,
  });
  
  const reply = response.choices?.[0]?.message?.content || "";
  
  console.log("\n🤖 AGENTE (Edson):");
  console.log("-".repeat(60));
  console.log(reply);
  console.log("-".repeat(60));
  
  return reply;
}

async function runConversation() {
  console.log("\n🛰️ TESTE DO AGENTE RASTRO CITY 🛰️\n");
  
  const config = await getAgentConfig();
  console.log("📋 Modelo:", config?.model);
  console.log("📝 Prompt atual (primeiras 500 chars):");
  console.log(config?.prompt?.substring(0, 500) + "...\n");
  
  const history: Array<{role: string, content: string}> = [];
  
  // Teste 1: Primeira mensagem
  const test1 = await testAgent("Oi, quero saber sobre rastreador");
  if (test1) history.push({ role: "user", content: "Oi, quero saber sobre rastreador" }, { role: "assistant", content: test1 });
  
  // Teste 2: Resposta do cliente
  const test2 = await testAgent("Moto", history);
  if (test2) history.push({ role: "user", content: "Moto" }, { role: "assistant", content: test2 });
  
  // Teste 3: Pergunta sobre preço
  const test3 = await testAgent("Quanto custa?", history);
  if (test3) history.push({ role: "user", content: "Quanto custa?" }, { role: "assistant", content: test3 });
  
  // Teste 4: Escolher plano
  const test4 = await testAgent("Quero o plano padrão", history);
  if (test4) history.push({ role: "user", content: "Quero o plano padrão" }, { role: "assistant", content: test4 });
  
  // Teste 5: Agendar instalação
  const test5 = await testAgent("Como faço pra agendar a instalação?", history);
  
  await pool.end();
}

// Testes adicionais de cenários
async function runTestScenarios() {
  console.log("\n🧪 TESTES DE CENÁRIOS DIVERSOS 🧪\n");
  
  const scenarios = [
    { name: "Cliente direto ao ponto", messages: ["Oi", "Carro", "Qual o mais barato?"] },
    { name: "Cliente indeciso", messages: ["Olá boa tarde", "Queria saber sobre rastreador", "É pra carro e moto?"] },
    { name: "Cliente perguntando se é robô", messages: ["Oi", "Você é um robô?"] },
    { name: "Cliente querendo suporte", messages: ["Oi", "Já sou cliente, preciso de suporte"] },
    { name: "Cliente perguntando cobertura", messages: ["Oi", "Funciona em Manaus?"] },
  ];
  
  for (const scenario of scenarios) {
    console.log("\n" + "═".repeat(60));
    console.log(`📋 CENÁRIO: ${scenario.name}`);
    console.log("═".repeat(60));
    
    const history: Array<{role: string, content: string}> = [];
    
    for (const msg of scenario.messages) {
      const reply = await testAgent(msg, history);
      if (reply) {
        history.push({ role: "user", content: msg }, { role: "assistant", content: reply });
      }
    }
  }
  
  await pool.end();
}

// Se chamado diretamente com argumento
const args = process.argv.slice(2);
if (args.length > 0) {
  if (args[0] === "--scenarios") {
    runTestScenarios();
  } else {
    testAgent(args.join(" ")).then(() => pool.end());
  }
} else {
  runConversation();
}
