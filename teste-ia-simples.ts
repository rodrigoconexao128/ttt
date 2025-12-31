import { Mistral } from "@mistralai/mistralai";

// Criar cliente standalone (sem dependências do servidor)
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

const mistral = new Mistral({
  apiKey: MISTRAL_API_KEY,
});

interface TestScenario {
  title: string;
  context: string;
  agentIdentity: {
    name: string;
    company: string;
    role: string;
    products: string[];
  };
  conversationHistory: Array<{
    sender: string;
    message: string;
  }>;
  expectedDecision: "ENVIAR" | "ESPERAR" | "ABORTAR";
  expectedReasons: string[];
}

// 🧪 Cenários de teste baseados em casos REAIS
const testScenarios: TestScenario[] = [
  {
    title: "✋ Cliente Interessado mas Ocupado",
    context:
      "Cliente demonstrou interesse mas disse que está ocupado. NÃO deve enviar imediatamente.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Oi! Sou Rodrigo da AgentZap. Posso te mostrar como automatizar seu WhatsApp?" },
      { sender: "client", message: "Interessante! Mas estou no meio de uma reunião agora" },
      { sender: "agent", message: "Sem problema! Quando tiver um tempinho, posso te mandar um vídeo rápido de 2min?" },
      { sender: "client", message: "Depois eu vejo" },
    ],
    expectedDecision: "ESPERAR",
    expectedReasons: [
      "Cliente está ocupado (em reunião)",
      "Já oferecemos vídeo",
      "Precisa aguardar cliente ter disponibilidade",
    ],
  },

  {
    title: "🚫 Cliente Reclamou de Repetição",
    context:
      "Cliente reclamou que já respondeu. NUNCA repetir a mesma pergunta.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Oi! Posso te mostrar nosso sistema?" },
      { sender: "client", message: "Já disse que não tenho interesse agora" },
      { sender: "agent", message: "Entendido! Posso te adicionar para futuras novidades?" },
      { sender: "client", message: "Não precisa, já falei" },
    ],
    expectedDecision: "ABORTAR",
    expectedReasons: [
      "Cliente demonstrou desinteresse claro",
      "Cliente se irritou com repetição",
      "Não insistir mais",
    ],
  },

  {
    title: "📅 Cliente Marcou Data Específica",
    context:
      "Cliente pediu para retornar em data específica. Respeitar o agendamento.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Oi! Gostaria de conhecer nosso sistema de automação?" },
      { sender: "client", message: "Interessante! Mas só posso conversar semana que vem" },
      { sender: "agent", message: "Perfeito! Te chamo na segunda-feira então?" },
      { sender: "client", message: "Pode ser, segunda eu estou livre" },
    ],
    expectedDecision: "ESPERAR",
    expectedReasons: [
      "Data agendada (segunda-feira)",
      "Cliente pediu para esperar",
      "Não enviar antes do combinado",
    ],
  },

  {
    title: "🎯 Cliente Muito Interessado - CONTINUAR",
    context:
      "Cliente demonstrou alto interesse e pediu próximo passo. Enviar continuação.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Oi! Gostaria de conhecer nosso sistema?" },
      { sender: "client", message: "Sim! Parece exatamente o que preciso" },
      { sender: "agent", message: "Ótimo! Posso te mandar um vídeo demonstrativo?" },
      { sender: "client", message: "Pode sim! E como faço para contratar?" },
    ],
    expectedDecision: "ENVIAR",
    expectedReasons: [
      "Alto interesse",
      "Cliente perguntou sobre contratação",
      "Precisa continuar a venda",
    ],
  },

  {
    title: "❓ Cliente Aguardando Resposta",
    context:
      "Cliente pediu informação e ainda não recebeu. Enviar resposta com a informação.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "client", message: "Olá! Vocês têm integração com Mercado Livre?" },
      { sender: "agent", message: "Deixa eu verificar com nosso time técnico e já te retorno!" },
      { sender: "client", message: "Ok, aguardo" },
    ],
    expectedDecision: "ENVIAR",
    expectedReasons: [
      "Cliente aguardando resposta",
      "Prometemos retornar",
      "Tempo passou, precisa responder",
    ],
  },
];

// Função para construir o prompt da IA (igual ao sistema real)
function buildFollowUpPrompt(scenario: TestScenario): string {
  const { agentIdentity, conversationHistory } = scenario;

  const historyText = conversationHistory
    .map((msg) => `${msg.sender === "agent" ? "Você" : "Cliente"}: ${msg.message}`)
    .join("\n");

  return `## 🎯 SUA IDENTIDADE (MEMORIZE!)
- Você é: ${agentIdentity.name}
- Empresa: ${agentIdentity.company}
- Seu cargo: ${agentIdentity.role}

PRODUTOS/SERVIÇOS:
${agentIdentity.products.map((p) => `- ${p}`).join("\n")}

## 📚 TÉCNICAS DE FOLLOW-UP PROFISSIONAL

1. **CONTINUAR A CONVERSA:** Sua mensagem deve ser CONTINUAÇÃO NATURAL do que já foi falado
2. **AGREGAR VALOR NOVO:** Traga informação que ainda não mencionamos
3. **NÃO INSISTIR:** Se cliente ocupado/desinteressado, ESPERAR ou ABORTAR
4. **PERSONALIZAR:** Use referências da conversa anterior
5. **SER ÚTIL:** Ajuda genuína, não só empurrar venda

## ❌ COMPORTAMENTOS PROIBIDOS:

- ❌ Repetir mesma frase/pergunta anterior
- ❌ Ignorar último comentário do cliente
- ❌ Usar colchetes [], barras / ou símbolos especiais
- ❌ Enviar mensagem se respondemos há menos de 2 horas
- ❌ Mensagens genéricas tipo "Oi, tudo bem?"
- ❌ Começar conversa do zero como se não conhecesse o cliente

## ✅ COMPORTAMENTOS OBRIGATÓRIOS:

- ✅ LEIA TODO histórico e CONTINUE de onde parou
- ✅ Se cliente fez pergunta, RESPONDA
- ✅ Se oferecemos algo e cliente aceitou, CONCRETIZE
- ✅ Mensagem CURTA (2-3 frases no máximo)
- ✅ Tom profissional mas humano

## 🔍 ANÁLISE DO CONTEXTO ATUAL:

**Histórico da Conversa:**
${historyText}

**Última mensagem do cliente:**
${conversationHistory[conversationHistory.length - 1]?.message || "Sem mensagens"}

## 🎯 SUA DECISÃO:

Analise profundamente o contexto e responda em JSON:

{
  "decision": "ENVIAR" | "ESPERAR" | "ABORTAR",
  "message": "Mensagem de follow-up (se ENVIAR) ou null",
  "reasoning": "Explique sua decisão em 2-3 frases"
}

REGRAS:
- ENVIAR: Quando faz sentido continuar conversa de forma natural (cliente interessado, aguardando resposta)
- ESPERAR: Cliente ocupado, pediu pra esperar, ou conversa muito recente (menos de 2h)
- ABORTAR: Recusa clara, cliente irritado, ou não há mais o que oferecer`;
}

// Função para testar um cenário
async function testScenario(scenario: TestScenario, index: number) {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 TESTE ${index + 1}/5: ${scenario.title}`);
  console.log("=".repeat(80));
  console.log(`\n📝 ${scenario.context}\n`);

  console.log("💬 Histórico da Conversa:");
  scenario.conversationHistory.forEach((msg) => {
    const emoji = msg.sender === "agent" ? "🤖" : "👤";
    const label = msg.sender === "agent" ? "Agente" : "Cliente";
    console.log(`  ${emoji} ${label}: "${msg.message}"`);
  });

  console.log("\n🤖 Enviando para IA Mistral...");

  const prompt = buildFollowUpPrompt(scenario);

  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      temperature: 0.7,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const aiResponse = response.choices?.[0]?.message?.content || "";
    
    // Tentar extrair JSON da resposta
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);

      console.log("\n📊 DECISÃO DA IA:");
      console.log(`   ⚡ Ação: ${decision.decision}`);
      console.log(`   💭 Raciocínio: ${decision.reasoning}`);
      if (decision.message) {
        console.log(`   💬 Mensagem gerada: "${decision.message}"`);
      }

      // Validação
      const decisionCorrect = decision.decision === scenario.expectedDecision;
      const statusEmoji = decisionCorrect ? "✅" : "❌";
      
      console.log("\n🎯 VALIDAÇÃO:");
      console.log(`   ${statusEmoji} Decisão ${decisionCorrect ? "CORRETA" : "INCORRETA"}`);
      console.log(`   📌 Esperado: ${scenario.expectedDecision} | Obtido: ${decision.decision}`);

      // Verificar se não está repetindo mensagem
      if (decision.message) {
        const lastAgentMsg = scenario.conversationHistory
          .filter(m => m.sender === "agent")
          .pop()?.message || "";
        
        const similarity = calculateSimilarity(decision.message, lastAgentMsg);
        const isRepetitive = similarity > 40;

        console.log(`   🔍 Similaridade com última msg: ${similarity.toFixed(1)}%`);
        console.log(`   ${isRepetitive ? "❌ REPETIÇÃO DETECTADA" : "✅ Mensagem única"}`);
      }

      return {
        scenario: scenario.title,
        expected: scenario.expectedDecision,
        actual: decision.decision,
        correct: decisionCorrect,
        message: decision.message,
        reasoning: decision.reasoning,
      };
    } else {
      console.error("❌ Não foi possível extrair JSON da resposta da IA");
      console.log("Resposta completa:", aiResponse);
      return null;
    }
  } catch (error: any) {
    console.error("❌ Erro ao processar cenário:", error.message);
    return null;
  }
}

// Função simples para calcular similaridade
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = str1.toLowerCase().split(/\s+/);
  const words2 = str2.toLowerCase().split(/\s+/);
  
  const set1 = new Set(words1);
  const set2 = new Set(words2);
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return (intersection.size / union.size) * 100;
}

// Executar todos os testes
async function runAllTests() {
  console.log("\n");
  console.log("🚀".repeat(40));
  console.log("🚀 TESTE COMPLETO DO SISTEMA DE FOLLOW-UP COM IA");
  console.log("🚀".repeat(40));
  console.log("\n📋 Total de cenários a testar: " + testScenarios.length);
  console.log("🎯 Objetivo: Validar se a IA toma decisões corretas para cada situação");
  console.log("\n⏳ Iniciando testes...\n");

  const results = [];

  for (let i = 0; i < testScenarios.length; i++) {
    const result = await testScenario(testScenarios[i], i);
    if (result) results.push(result);

    // Aguardar entre chamadas para não sobrecarregar API
    if (i < testScenarios.length - 1) {
      console.log("\n⏳ Aguardando 2 segundos antes do próximo teste...");
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  // Resumo final
  console.log("\n" + "=".repeat(80));
  console.log("📊 RESUMO FINAL DOS TESTES");
  console.log("=".repeat(80));

  const correctCount = results.filter((r) => r.correct).length;
  const totalCount = results.length;
  const successRate = ((correctCount / totalCount) * 100).toFixed(1);

  console.log(`\n✅ Acertos: ${correctCount}/${totalCount} (${successRate}%)`);

  console.log("\n📋 Detalhamento por teste:");
  results.forEach((result, i) => {
    const status = result.correct ? "✅" : "❌";
    console.log(`\n   ${status} ${i + 1}. ${result.scenario}`);
    console.log(`      🎯 Esperado: ${result.expected} | Obtido: ${result.actual}`);
    console.log(`      💭 "${result.reasoning}"`);
    if (result.message) {
      console.log(`      💬 Mensagem: "${result.message.substring(0, 80)}${result.message.length > 80 ? '...' : ''}"`);
    }
  });

  console.log("\n" + "=".repeat(80));
  if (successRate === "100.0") {
    console.log("🎉 PERFEITO! Todos os testes passaram!");
    console.log("✅ A IA está tomando decisões corretas em todos os cenários");
  } else {
    console.log(`⚠️ ${totalCount - correctCount} teste(s) falharam. Revisar lógica da IA.`);
  }
  console.log("=".repeat(80) + "\n");
}

// Executar
runAllTests().catch(console.error);
