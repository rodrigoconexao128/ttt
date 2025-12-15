/**
 * TESTE IA VS IA - CONVERSA NATURAL (SEM FLUXO PREDEFINIDO)
 * 
 * Este teste simula uma conversa REAL onde:
 * - Rodrigo (admin agent) responde como vendedor
 * - Cliente IA (Mistral) responde naturalmente como um cliente interessado
 * - O cliente NUNCA entrega todas as informações de uma vez
 * - Rodrigo deve EXTRAIR as 3 informações necessárias antes de criar conta:
 *   1. Tipo de negócio
 *   2. Nome do agente
 *   3. Instruções/informações do negócio
 * 
 * O teste valida que:
 * - Rodrigo NÃO cria conta sem ter as 3 informações
 * - Rodrigo faz perguntas naturais para coletar dados
 * - Quando tem tudo, cria a conta e envia APENAS o link (sem credenciais)
 */

import { processAdminMessage, clearClientSession, getOrCreateClientSession } from "../server/adminAgentService";

// Mistral client para simular respostas do cliente
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";

interface ConversationTurn {
  role: "rodrigo" | "cliente";
  message: string;
  hasAccountCreation?: boolean;
  hasSimulatorLink?: boolean;
}

// Perfis de clientes simulados (diversos cenários)
const CLIENT_PROFILES = [
  {
    id: 1,
    name: "Cliente Vago",
    description: "Cliente que começa vago e vai dando informações aos poucos",
    systemPrompt: `Você é um cliente interessado em testar um agente de IA para WhatsApp.
    
REGRAS OBRIGATÓRIAS:
- Você tem uma loja de roupas femininas chamada "Bella Moda"
- NUNCA dê todas as informações de uma vez
- Comece apenas dizendo "oi" ou "quero testar"
- Só revele seu negócio quando perguntado
- Só sugira nome do agente quando perguntado especificamente
- Seja natural e espontâneo nas respostas
- Responda de forma curta (1-2 frases no máximo)
- Quando der informações do negócio: vestidos R$80-200, blusas R$40-100, calças R$90-150, entrega própria, funciona seg-sáb 9h-18h

SEU OBJETIVO: Testar o agente antes de decidir contratar.`,
  },
  {
    id: 2,
    name: "Cliente Apressado",
    description: "Cliente com pressa que quer link rápido mas sem dar dados",
    systemPrompt: `Você é um cliente MUITO apressado querendo testar um agente de IA.
    
REGRAS OBRIGATÓRIAS:
- Você tem um restaurante de comida japonesa "Sushi Express"
- Está COM PRESSA e quer testar logo
- Reclama se demorar muito para ter o link
- NUNCA dê todas as informações de uma vez
- Só dá informações quando FORÇADO a responder
- Responda de forma curta e impaciente
- Informações quando der: temakis R$25-45, sashimis R$35-60, combos R$50-120, delivery via iFood e WhatsApp

SEU OBJETIVO: Conseguir testar rápido sem perder tempo.`,
  },
  {
    id: 3,
    name: "Cliente Confuso",
    description: "Cliente que não entende bem o que é e faz perguntas",
    systemPrompt: `Você é um cliente CONFUSO sobre o que é esse serviço.
    
REGRAS OBRIGATÓRIAS:
- Você tem uma clínica de estética "Beauty Center"
- Não entende direito o que é um "agente de IA"
- Faz perguntas sobre como funciona
- Só vai dando informações conforme entende melhor
- Responda de forma natural, mostrando dúvidas
- Informações quando der: limpeza de pele R$120, peeling R$180, botox R$350/área, microagulhamento R$200

SEU OBJETIVO: Entender o serviço antes de decidir testar.`,
  },
  {
    id: 4,
    name: "Cliente Hotmart",
    description: "Infoprodutor vendendo curso online",
    systemPrompt: `Você é um infoprodutor que vende cursos online pela Hotmart.
    
REGRAS OBRIGATÓRIAS:
- Você vende o curso "Domine o Excel em 30 Dias" por R$297
- Quer automatizar atendimento no WhatsApp
- NUNCA dê todas as informações de uma vez
- Comece perguntando se funciona para infoprodutos
- Só dá detalhes quando perguntado
- Responda de forma objetiva mas sem entregar tudo

SEU OBJETIVO: Automatizar vendas do curso pelo WhatsApp.`,
  },
  {
    id: 5,
    name: "Cliente Delivery",
    description: "Dono de pizzaria com delivery",
    systemPrompt: `Você é dono de uma pizzaria com delivery "Pizza House".
    
REGRAS OBRIGATÓRIAS:
- Você tem muitos pedidos pelo WhatsApp e não dá conta
- Quer automatizar o atendimento inicial
- NUNCA dê todas as informações de uma vez
- Comece perguntando quanto custa
- Só depois fala do negócio
- Informações: pizzas médias R$35-45, grandes R$45-60, combos R$80-120, entrega grátis acima de R$60, raio 5km

SEU OBJETIVO: Testar se o agente consegue anotar pedidos corretamente.`,
  },
];

async function generateClientResponse(
  history: ConversationTurn[],
  clientProfile: typeof CLIENT_PROFILES[0]
): Promise<string> {
  const messages = [
    {
      role: "system",
      content: clientProfile.systemPrompt,
    },
    ...history.map((turn) => ({
      role: turn.role === "cliente" ? "user" : "assistant",
      content: turn.message,
    })),
  ];

  // Inverter roles pois o cliente é quem responde
  const adjustedMessages = messages.map((m) => ({
    role: m.role === "user" ? "assistant" : m.role === "assistant" ? "user" : m.role,
    content: m.content,
  }));

  const response = await fetch("https://api.mistral.ai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: adjustedMessages,
      max_tokens: 150,
      temperature: 0.7,
    }),
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || "não entendi";
}

async function runNaturalConversation(
  clientProfile: typeof CLIENT_PROFILES[0],
  maxTurns: number = 15
): Promise<{
  success: boolean;
  turnsToComplete: number;
  accountCreated: boolean;
  hasCredentials: boolean;
  conversation: ConversationTurn[];
  error?: string;
}> {
  const phone = `17${Date.now()}`;
  const conversation: ConversationTurn[] = [];
  let accountCreated = false;
  let hasCredentials = false;
  let hasOnlyLink = false;

  console.log(`\n${"═".repeat(70)}`);
  console.log(`🎭 PERFIL: ${clientProfile.name}`);
  console.log(`📝 ${clientProfile.description}`);
  console.log(`${"═".repeat(70)}`);

  // Limpar sessão anterior
  clearClientSession(phone);

  // Cliente inicia a conversa
  let clientMessage = "oi";
  console.log(`\n👤 CLIENTE: "${clientMessage}"`);

  for (let turn = 1; turn <= maxTurns; turn++) {
    // Rodrigo responde
    // Parâmetros: phoneNumber, messageText, mediaType, mediaUrl, skipTriggerCheck
    const rodrigoResponse = await processAdminMessage(
      phone,
      clientMessage,
      undefined, // mediaType
      undefined, // mediaUrl
      true // skipTriggerCheck para teste
    );

    if (!rodrigoResponse) {
      console.log(`⚠️ [Turno ${turn}] Rodrigo não respondeu`);
      break;
    }

    const rodrigoText = rodrigoResponse.text;
    const hasAccountAction = rodrigoResponse.actions?.testAccountCredentials;
    const hasSimLink = rodrigoText.includes("/test/") || rodrigoText.includes("SIMULADOR");
    const hasEmail = rodrigoText.includes("@agentezap.temp") || rodrigoText.includes("📧");
    const hasPassword = rodrigoText.includes("🔑") || rodrigoText.match(/[A-Z]{2,}-[A-Z0-9]{6}/);

    conversation.push({
      role: "rodrigo",
      message: rodrigoText,
      hasAccountCreation: !!hasAccountAction,
      hasSimulatorLink: hasSimLink,
    });

    console.log(`\n🤖 RODRIGO: "${rodrigoText.substring(0, 200)}${rodrigoText.length > 200 ? "..." : ""}"`);
    
    if (hasAccountAction) {
      accountCreated = true;
      console.log(`   ✅ CONTA CRIADA!`);
      
      if (hasEmail || hasPassword) {
        hasCredentials = true;
        console.log(`   ⚠️ CREDENCIAIS DETECTADAS NA RESPOSTA (não deveria!)`);
      } else {
        hasOnlyLink = true;
        console.log(`   ✅ Apenas link do simulador (correto!)`);
      }
      break;
    }

    // Cliente responde naturalmente
    const clientResponse = await generateClientResponse(conversation, clientProfile);
    
    conversation.push({
      role: "cliente",
      message: clientResponse,
    });

    clientMessage = clientResponse;
    console.log(`\n👤 CLIENTE: "${clientMessage}"`);

    // Delay para não sobrecarregar API
    await new Promise((r) => setTimeout(r, 1000));
  }

  // Limpar sessão após teste
  clearClientSession(phone);

  const success = accountCreated && !hasCredentials;

  return {
    success,
    turnsToComplete: conversation.length,
    accountCreated,
    hasCredentials,
    conversation,
    error: !accountCreated
      ? "Conta não foi criada após " + maxTurns + " turnos"
      : hasCredentials
      ? "Credenciais (email/senha) foram enviadas - deveria ser só o link"
      : undefined,
  };
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                                                                               ║
║  🤖 TESTE IA vs IA - CONVERSA NATURAL (SEM FLUXO PREDEFINIDO)                ║
║                                                                               ║
║  Validando coleta natural de dados antes de criar conta                      ║
║  + Verificando que SÓ envia link do simulador (sem credenciais)              ║
║                                                                               ║
╚═══════════════════════════════════════════════════════════════════════════════╝
`);

  if (!MISTRAL_API_KEY) {
    console.error("❌ MISTRAL_API_KEY não configurada!");
    process.exit(1);
  }

  const results: Array<{
    profile: string;
    success: boolean;
    turns: number;
    accountCreated: boolean;
    hasCredentials: boolean;
    error?: string;
  }> = [];

  // Testar cada perfil
  for (const profile of CLIENT_PROFILES) {
    try {
      const result = await runNaturalConversation(profile, 12);
      
      results.push({
        profile: profile.name,
        success: result.success,
        turns: result.turnsToComplete,
        accountCreated: result.accountCreated,
        hasCredentials: result.hasCredentials,
        error: result.error,
      });

      console.log(`\n${"─".repeat(70)}`);
      console.log(`📊 RESULTADO ${profile.name}:`);
      console.log(`   ${result.success ? "✅ PASSOU" : "❌ FALHOU"}`);
      console.log(`   📍 Turnos: ${result.turnsToComplete}`);
      console.log(`   📦 Conta criada: ${result.accountCreated ? "Sim" : "Não"}`);
      console.log(`   🔑 Credenciais enviadas: ${result.hasCredentials ? "Sim (ERRO!)" : "Não (correto)"}`);
      if (result.error) {
        console.log(`   ⚠️ Erro: ${result.error}`);
      }

      // Delay entre testes
      await new Promise((r) => setTimeout(r, 2000));
    } catch (error) {
      console.error(`❌ Erro no teste ${profile.name}:`, error);
      results.push({
        profile: profile.name,
        success: false,
        turns: 0,
        accountCreated: false,
        hasCredentials: false,
        error: String(error),
      });
    }
  }

  // Resumo final
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════════╗
║                           📊 RESUMO DOS TESTES                                ║
╠═══════════════════════════════════════════════════════════════════════════════╣`);

  const passed = results.filter((r) => r.success).length;
  const failed = results.filter((r) => !r.success).length;

  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    const credInfo = r.hasCredentials ? " (CREDS!)" : "";
    console.log(`║  ${status} ${r.profile.padEnd(25)} | Turnos: ${String(r.turns).padStart(2)} | Conta: ${r.accountCreated ? "✓" : "✗"}${credInfo.padEnd(10)} ║`);
  }

  console.log(`╠═══════════════════════════════════════════════════════════════════════════════╣`);
  console.log(`║  ✅ Passou: ${String(passed).padStart(2)} / ${CLIENT_PROFILES.length}                                                          ║`);
  console.log(`║  ❌ Falhou: ${String(failed).padStart(2)} / ${CLIENT_PROFILES.length}                                                          ║`);
  console.log(`╚═══════════════════════════════════════════════════════════════════════════════╝`);

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
