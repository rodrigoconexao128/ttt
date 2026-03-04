
import 'dotenv/config';
import { getMistralClient } from "./server/mistralClient";

// ============================================================================
// CONFIGURAÇÃO DOS CENÁRIOS
// ============================================================================

const SCENARIOS = [
  {
    type: "Pizzaria",
    businessName: "Pizza Veloce",
    agentName: "João",
    instructions: "Vender pizzas. Cardápio: Calabresa (40), Mussarela (38). Entrega grátis > 50.",
    clientPersona: "Cliente com fome, quer pedir rápido, pergunta preço e entrega."
  },
  {
    type: "Loja de Roupas",
    businessName: "Style Modas",
    agentName: "Ana",
    instructions: "Vender roupas femininas. Vestidos a partir de 99,90. Enviamos para todo Brasil.",
    clientPersona: "Cliente indecisa, quer ver fotos, pergunta sobre troca e frete."
  },
  {
    type: "Clínica Dentária",
    businessName: "Sorriso Top",
    agentName: "Dra. Carla",
    instructions: "Agendar avaliações. Limpeza R$ 150. Clareamento R$ 500. Atendemos convênio Amil.",
    clientPersona: "Cliente com dor de dente, quer horário pra hoje, pergunta se aceita convênio."
  },
  {
    type: "Imobiliária",
    businessName: "Lar Doce Lar",
    agentName: "Roberto",
    instructions: "Vender apartamentos na planta. Entrada facilitada. Financiamento Caixa.",
    clientPersona: "Investidor, quer saber retorno, localização e valor do m2."
  }
];

// ============================================================================
// SIMULAÇÃO DO ADMIN AGENT (GERADOR DE PROMPT)
// ============================================================================

// Esta função simula exatamente o que o Admin Agent faz ao criar a conta
// Ela pega as instruções brutas e aplica o "Template de Humanização" que definimos
function generateFinalAgentPrompt(scenario: any) {
  const basePrompt = `Você é ${scenario.agentName}, atendente da ${scenario.businessName}.
${scenario.instructions}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- Não invente informações
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem é, para não parecer robô. Ex: "Sou o ${scenario.agentName} da ${scenario.businessName}".`;

  // AQUI ESTÁ A "MÁGICA" QUE QUEREMOS TESTAR E MELHORAR
  // Estas são as diretrizes que o Admin Agent injeta no prompt do cliente
  const humanityGuidelines = `
DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 'tá', 'né', 'pra'.
2. NÃO comece toda frase com 'Oi' ou 'Opa'. Só na primeira vez.
3. Use emojis, mas não exagere. Um ou dois tá bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preço, fale simples: '40 reais', 'tá 38'.
6. NÃO use listas. Fale como se estivesse conversando com um amigo.
7. Evite 'Sim, nós temos'. Diga 'Tem sim', 'Temos'.
8. NÃO repita o cardápio toda hora. Só se perguntarem.
9. PERSONA: Se perguntarem quem é, diga 'Sou o ${scenario.agentName} da ${scenario.businessName}'. Nunca diga 'Sou um assistente virtual'.`;

  return basePrompt + "\n" + humanityGuidelines;
}

// ============================================================================
// MOTORES DE IA
// ============================================================================

async function runAgentTurn(agentPrompt: string, conversationHistory: any[]) {
  try {
    const mistral = await getMistralClient();
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: agentPrompt },
        ...conversationHistory
      ],
      temperature: 0.7,
    });
    return response.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("❌ Erro no Agente:", error);
    return "ERRO";
  }
}

async function runClientTurn(persona: string, conversationHistory: any[]) {
  try {
    const mistral = await getMistralClient();
    
    // Inverter papéis para o Cliente Simulado
    // O que era "user" (Cliente) vira "assistant" (o modelo falando)
    // O que era "assistant" (Agente) vira "user" (o interlocutor)
    const invertedHistory = conversationHistory.map(msg => ({
      role: msg.role === 'user' ? 'assistant' : 'user',
      content: msg.content
    }));

    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: `Você é um cliente no WhatsApp. Persona: ${persona}. Seja breve, natural e aja como um humano conversando no chat. Não use linguagem formal.` },
        ...invertedHistory
      ],
      temperature: 0.8,
    });
    return response.choices?.[0]?.message?.content || "";
  } catch (error) {
    console.error("❌ Erro no Cliente:", error);
    return "ERRO";
  }
}

async function analyzeConversation(conversation: any[]) {
  const mistral = await getMistralClient();
  const transcript = conversation.map(m => `${m.role === 'user' ? 'Cliente' : 'Agente'}: ${m.content}`).join("\n");
  
  const prompt = `
  Analise a conversa abaixo entre um Cliente e um Agente (Vendedor).
  Foque EXCLUSIVAMENTE nas respostas do AGENTE.
  
  CONVERSA:
  ${transcript}
  
  TAREFA:
  Identifique se o Agente pareceu ROBÓTICO em algum momento.
  Sinais de robô:
  - Repetir muito o nome do cliente ou frases feitas.
  - Usar listas com bolinhas (bullet points).
  - Falar "Posso ajudar em algo mais?" toda hora.
  - Usar "Olá", "Prezado", "Compreendo" (muito formal).
  - Explicar coisas óbvias demais.
  
  SAÍDA (JSON):
  {
    "score": (0 a 100, onde 100 é perfeitamente humano),
    "verdict": "HUMANO" ou "ROBÓTICO",
    "critique": "Explique onde ele errou, se errou. Seja chato e exigente."
  }
  `;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    responseFormat: { type: "json_object" }
  });

  return JSON.parse(response.choices?.[0]?.message?.content || "{}");
}

// ============================================================================
// EXECUÇÃO
// ============================================================================

async function runFullTest() {
  console.log("🧪 INICIANDO TESTE MULTI-CENÁRIO DE HUMANIDADE\n");
  
  let totalScore = 0;
  
  for (const scenario of SCENARIOS) {
    console.log(`\n════════════════════════════════════════════════════════════════`);
    console.log(`🏢 CENÁRIO: ${scenario.type} (${scenario.businessName})`);
    console.log(`👤 Persona Cliente: ${scenario.clientPersona}`);
    console.log(`════════════════════════════════════════════════════════════════`);
    
    const agentPrompt = generateFinalAgentPrompt(scenario);
    const history: any[] = [];
    
    // Turno 1: Cliente começa
    const clientMsg1 = await runClientTurn(scenario.clientPersona, []);
    console.log(`👤 Cliente: ${clientMsg1}`);
    history.push({ role: "user", content: clientMsg1 });
    
    // Turno 1: Agente responde
    const agentMsg1 = await runAgentTurn(agentPrompt, history);
    console.log(`🤖 Agente: ${agentMsg1}`);
    history.push({ role: "assistant", content: agentMsg1 });
    
    // Turno 2: Cliente responde
    const clientMsg2 = await runClientTurn(scenario.clientPersona, history);
    console.log(`👤 Cliente: ${clientMsg2}`);
    history.push({ role: "user", content: clientMsg2 });
    
    // Turno 2: Agente responde
    const agentMsg2 = await runAgentTurn(agentPrompt, history);
    console.log(`🤖 Agente: ${agentMsg2}`);
    history.push({ role: "assistant", content: agentMsg2 });

    // Turno 3: Cliente pergunta quem é (Teste de Persona)
    const clientMsg3 = "quem é vc?";
    console.log(`👤 Cliente: ${clientMsg3}`);
    history.push({ role: "user", content: clientMsg3 });

    // Turno 3: Agente responde
    const agentMsg3 = await runAgentTurn(agentPrompt, history);
    console.log(`🤖 Agente: ${agentMsg3}`);
    history.push({ role: "assistant", content: agentMsg3 });
    
    // Análise
    console.log(`\n🔍 ANALISANDO...`);
    const analysis = await analyzeConversation(history);
    console.log(`📊 Score: ${analysis.score}% | ${analysis.verdict}`);
    console.log(`💡 Crítica: ${analysis.critique}`);
    
    totalScore += analysis.score;
  }
  
  const avg = Math.round(totalScore / SCENARIOS.length);
  console.log(`\n🏁 MÉDIA GERAL: ${avg}%`);
  
  if (avg < 95) {
    console.log("⚠️ AINDA HÁ FALHAS. REVISAR PROMPT.");
    process.exit(1);
  } else {
    console.log("✅ SUCESSO TOTAL. AGENTES 100% HUMANOS.");
  }
}

runFullTest().catch(console.error);
