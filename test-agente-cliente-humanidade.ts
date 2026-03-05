
import 'dotenv/config';
import { getMistralClient } from "./server/mistralClient";

// Mock storage to avoid DB dependency in test
const mockStorage = {
  getSystemConfig: async (key: string) => {
    if (key === "mistral_api_key") return { valor: process.env.MISTRAL_API_KEY };
    return null;
  }
};

// Mock session
const mockSession = {
  agentConfig: {
    name: "Atendente",
    company: "Empresa Teste",
    role: "Vendedor",
    prompt: "Atenda os clientes da pizzaria. Temos pizza de calabresa (R$40) e mussarela (R$38). Entrega grátis acima de R$50."
  }
};

// Function to generate response from the "Client Agent" (the one being tested)
async function generateClientAgentResponse(userMessage: string, systemPrompt: string) {
  const mistral = await getMistralClient();
  
  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage }
    ],
    temperature: 0.7,
  });

  return response.choices?.[0]?.message?.content || "";
}

// Function to score humanity (using another AI instance as judge)
async function scoreHumanity(response: string, context: string) {
  const mistral = await getMistralClient();
  
  const prompt = `
  Analise a seguinte resposta de um atendente de WhatsApp e diga se parece 100% humana ou se tem traços robóticos.
  
  Contexto: ${context}
  Resposta do Atendente: "${response}"
  
  Regras para ser humano:
  - Não usa "Entendi!", "Compreendi", "Olá, sou o assistente virtual".
  - Não usa listas com bolinhas (bullet points) a menos que seja uma lista de preços muito longa.
  - Usa linguagem casual, direta.
  - Pode usar emojis, mas poucos.
  - Não repete o que o cliente disse de forma robótica.
  
  Saída esperada: APENAS um JSON.
  {
    "score": (0 a 100),
    "reason": "Explicação breve",
    "is_robotic": true/false
  }
  `;

  const analysis = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    responseFormat: { type: "json_object" }
  });

  try {
    return JSON.parse(analysis.choices?.[0]?.message?.content || "{}");
  } catch {
    return { score: 0, reason: "Erro ao analisar JSON", is_robotic: true };
  }
}

async function runTest() {
  console.log("🧪 INICIANDO TESTE DE HUMANIDADE DO AGENTE CLIENTE\n");

  // 1. Define the prompt that the Admin Agent generates for the Client Agent
  // This is what we want to optimize. Currently, it's hardcoded in adminAgentService.ts
  const clientAgentPrompt = `Você é o atendente da Pizzaria.
Seu objetivo é vender pizzas e tirar dúvidas.
Cardápio: Calabresa (40), Mussarela (38). Entrega grátis > 50.

DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: "vc", "tbm", "tá", "né", "pra".
2. NÃO comece toda frase com "Oi" ou "Opa". Só na primeira vez.
3. Use emojis, mas não exagere. Um ou dois tá bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preço, fale simples: "40 reais", "tá 38".
6. NÃO use listas. Fale como se estivesse conversando com um amigo.
7. Evite "Sim, nós temos". Diga "Tem sim", "Temos".
8. NÃO repita o cardápio toda hora. Só se perguntarem "quais sabores tem?".`;

  console.log("📝 Prompt do Agente (Simulado):");
  console.log(clientAgentPrompt);
  console.log("\n--------------------------------------------------\n");

  const scenarios = [
    { msg: "oi, tem pizza?", context: "Cliente perguntando se tem pizza" },
    { msg: "quanto custa a de calabresa?", context: "Cliente perguntando preço" },
    { msg: "entrega aqui na rua 2?", context: "Cliente perguntando sobre entrega" }
  ];

  let totalScore = 0;

  for (const scenario of scenarios) {
    console.log(`👤 Cliente: ${scenario.msg}`);
    
    const response = await generateClientAgentResponse(scenario.msg, clientAgentPrompt);
    console.log(`🤖 Agente: ${response}`);
    
    const analysis = await scoreHumanity(response, scenario.context);
    console.log(`📊 Score: ${analysis.score}% | ${analysis.is_robotic ? "🤖 ROBÓTICO" : "✅ HUMANO"}`);
    console.log(`💡 Motivo: ${analysis.reason}\n`);
    
    totalScore += analysis.score;
  }

  const avgScore = Math.round(totalScore / scenarios.length);
  console.log(`\n🏁 MÉDIA FINAL: ${avgScore}%`);
  
  if (avgScore < 100) {
    console.log("❌ FALHOU: O agente ainda tem traços robóticos. Precisamos melhorar o prompt gerador.");
    process.exit(1);
  } else {
    console.log("✅ SUCESSO: O agente está se comportando como humano!");
  }
}

runTest().catch(console.error);
