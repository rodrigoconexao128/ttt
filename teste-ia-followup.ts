import { getMistralClient } from "./server/mistralClient";

// Cliente de teste
const mistral = getMistralClient();

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

// Cenários de teste baseados em casos reais
const testScenarios: TestScenario[] = [
  {
    title: "Cliente Interessado mas Ocupado",
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
    title: "Cliente Reclamou de Repetição",
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
    title: "Cliente Marcou Data Específica",
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
    title: "Recusa Clara - Não Insistir",
    context:
      "Cliente deu recusa clara e educada. Respeitar e não incomodar mais.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Olá! Conhece nosso sistema de automação?" },
      { sender: "client", message: "Oi! Já uso outro sistema e estou satisfeito" },
      { sender: "agent", message: "Que bom! Qualquer coisa estamos por aqui 😊" },
      { sender: "client", message: "Obrigado!" },
    ],
    expectedDecision: "ABORTAR",
    expectedReasons: [
      "Cliente já tem solução",
      "Não demonstrou interesse",
      "Conversa encerrada educadamente",
    ],
  },

  {
    title: "Conversa Ativa - Não Interromper",
    context:
      "Cliente está conversando ativamente. NÃO enviar follow-up no meio da conversa.",
    agentIdentity: {
      name: "Rodrigo",
      company: "AgentZap",
      role: "Consultor de Vendas",
      products: ["Plano Básico (R$ 99/mês)", "Plano Pro (R$ 199/mês)"],
    },
    conversationHistory: [
      { sender: "agent", message: "Oi! Como posso ajudar?" },
      { sender: "client", message: "Quero saber mais sobre os planos" },
      { sender: "agent", message: "Temos 2 planos: Básico (R$99) e Pro (R$199). Qual te interessa?" },
      { sender: "client", message: "Qual a diferença?" },
      { sender: "agent", message: "O Pro inclui follow-up automático além do atendimento" },
    ],
    expectedDecision: "ESPERAR",
    expectedReasons: [
      "Conversa em andamento",
      "Cliente fazendo perguntas",
      "Aguardar resposta do cliente",
    ],
  },

  {
    title: "Cliente Aguardando Informação",
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

  {
    title: "Cliente Muito Interessado",
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

1. **CONTINUAR A CONVERSA:** Sua mensagem deve ser CONTINUAÇÃO NATURAL
2. **AGREGAR VALOR NOVO:** Traga informação que ainda não mencionamos
3. **NÃO INSISTIR:** Se cliente ocupado/desinteressado, ESPERAR ou ABORTAR
4. **PERSONALIZAR:** Use nome do cliente e referências da conversa
5. **SER ÚTIL:** Ajuda genuína, não só empurrar venda

## ❌ COMPORTAMENTOS PROIBIDOS:

- Repetir mesma frase/pergunta anterior
- Ignorar último comentário do cliente
- Usar colchetes [], barras / ou símbolos especiais
- Enviar mensagem se respondemos há menos de 2 horas
- Mensagens genéricas tipo "Oi, tudo bem?"

## ✅ COMPORTAMENTOS OBRIGATÓRIOS:

- LEIA TODO histórico e CONTINUE de onde parou
- Se cliente fez pergunta, RESPONDA
- Se oferecemos algo e cliente aceitou, CONCRETIZE
- Mensagem CURTA (2-3 frases no máximo)
- Tom configurável: consultivo/vendedor/humano/técnico

## 🔍 ANÁLISE DO CONTEXTO ATUAL:

**Histórico da Conversa:**
${historyText}

**Última mensagem do cliente:**
${conversationHistory[conversationHistory.length - 1]?.message || "Sem mensagens"}

## 🎯 SUA DECISÃO:

Analise profundamente e responda em JSON:

{
  "decision": "ENVIAR" | "ESPERAR" | "ABORTAR",
  "message": "Mensagem de follow-up (se ENVIAR) ou null",
  "reasoning": "Explique sua decisão em 2-3 frases"
}

REGRAS:
- ENVIAR: Quando faz sentido continuar conversa de forma natural
- ESPERAR: Cliente ocupado, pediu pra esperar, ou conversa muito recente
- ABORTAR: Recusa clara, cliente irritado, ou não há mais o que oferecer`;
}

// Função para testar um cenário
async function testScenario(scenario: TestScenario, index: number) {
  console.log("\n" + "=".repeat(80));
  console.log(`🧪 TESTE ${index + 1}: ${scenario.title}`);
  console.log("=".repeat(80));
  console.log(`\n📝 Contexto: ${scenario.context}\n`);

  console.log("💬 Histórico da Conversa:");
  scenario.conversationHistory.forEach((msg, i) => {
    const emoji = msg.sender === "agent" ? "🤖" : "👤";
    console.log(`  ${emoji} ${msg.sender === "agent" ? "Agente" : "Cliente"}: ${msg.message}`);
  });

  console.log("\n🤖 Chamando IA Mistral...");

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
    console.log("\n📥 Resposta da IA:");
    console.log(aiResponse);

    // Tentar extrair JSON da resposta
    const jsonMatch = aiResponse.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const decision = JSON.parse(jsonMatch[0]);

      console.log("\n📊 Decisão Estruturada:");
      console.log(`   Ação: ${decision.decision}`);
      console.log(`   Raciocínio: ${decision.reasoning}`);
      if (decision.message) {
        console.log(`   Mensagem: "${decision.message}"`);
      }

      // Validação
      console.log("\n✅ Validação:");
      const decisionCorrect = decision.decision === scenario.expectedDecision;
      console.log(
        `   Decisão ${decisionCorrect ? "✅ CORRETA" : "❌ INCORRETA"} (Esperado: ${scenario.expectedDecision})`
      );

      // Verificar se não está repetindo mensagem
      if (decision.message) {
        const lastMessages = scenario.conversationHistory.slice(-2).map((m) => m.message);
        const isRepetitive = lastMessages.some((msg) =>
          msg.toLowerCase().includes(decision.message.toLowerCase().slice(0, 20))
        );

        console.log(`   Repetição: ${isRepetitive ? "❌ DETECTADA" : "✅ NÃO REPETIU"}`);
      }

      return {
        scenario: scenario.title,
        expected: scenario.expectedDecision,
        actual: decision.decision,
        correct: decisionCorrect,
        message: decision.message,
        reasoning: decision.reasoning,
      };
    }
  } catch (error: any) {
    console.error("❌ Erro ao processar cenário:", error.message);
    return {
      scenario: scenario.title,
      expected: scenario.expectedDecision,
      actual: "ERRO",
      correct: false,
      error: error.message,
    };
  }
}

// Executar todos os testes
async function runAllTests() {
  console.log("🚀 INICIANDO TESTES DE FOLLOW-UP COM IA\n");
  console.log("📋 Total de cenários: " + testScenarios.length);

  const results = [];

  for (let i = 0; i < testScenarios.length; i++) {
    const result = await testScenario(testScenarios[i], i);
    if (result) results.push(result);

    // Aguardar 2 segundos entre chamadas para não sobrecarregar API
    if (i < testScenarios.length - 1) {
      console.log("\n⏳ Aguardando 2 segundos...");
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

  console.log("\n📋 Detalhes por teste:");
  results.forEach((result, i) => {
    const status = result.correct ? "✅" : "❌";
    console.log(`   ${status} ${i + 1}. ${result.scenario}`);
    console.log(`      Esperado: ${result.expected} | Obtido: ${result.actual}`);
    if (result.reasoning) {
      console.log(`      Motivo: ${result.reasoning}`);
    }
  });

  console.log("\n" + "=".repeat(80));
  console.log(
    successRate === "100.0"
      ? "🎉 PERFEITO! Todos os testes passaram!"
      : "⚠️ Alguns testes falharam. Revisar lógica da IA."
  );
  console.log("=".repeat(80));
}

// Executar
runAllTests().catch(console.error);
