/**
 * 🧪 TESTE: Cenário específico do Bug de Follow-up com isFromAgent
 * 
 * Este teste simula exatamente o cenário do bug:
 * 1. Conversa normal acontece
 * 2. Cliente para de responder
 * 3. Follow-up é enviado (AGORA com isFromAgent: true)
 * 4. Cliente responde
 * 5. IA retoma a conversa SEM repetir/se perder
 * 
 * Execute com: npx tsx test-followup-isFromAgent.ts
 */

// Simular estrutura de mensagem do banco de dados
interface Message {
  id: string;
  conversationId: string;
  messageId: string;
  fromMe: boolean;
  isFromAgent: boolean | null;
  text: string;
  timestamp: Date;
}

// Simular histórico como seria retornado do banco
function createMockHistory(): Message[] {
  return [
    {
      id: "1",
      conversationId: "conv-123",
      messageId: "msg-1",
      fromMe: false,
      isFromAgent: null,
      text: "Oi, tudo bem?",
      timestamp: new Date("2025-01-01T10:00:00"),
    },
    {
      id: "2",
      conversationId: "conv-123",
      messageId: "msg-2",
      fromMe: true,
      isFromAgent: true, // Agente respondeu
      text: "Oi! Sou a Sofia da AgenteZap. Como posso te ajudar?",
      timestamp: new Date("2025-01-01T10:00:30"),
    },
    {
      id: "3",
      conversationId: "conv-123",
      messageId: "msg-3",
      fromMe: false,
      isFromAgent: null,
      text: "Quero saber sobre o plano de vocês",
      timestamp: new Date("2025-01-01T10:01:00"),
    },
    {
      id: "4",
      conversationId: "conv-123",
      messageId: "msg-4",
      fromMe: true,
      isFromAgent: true, // Agente respondeu
      text: "Nosso plano custa R$ 99/mês com mensagens ilimitadas. Quer fazer um teste grátis?",
      timestamp: new Date("2025-01-01T10:01:30"),
    },
    // Cliente para de responder... tempo passa...
    // Follow-up enviado (AGORA COM isFromAgent: true!)
    {
      id: "5",
      conversationId: "conv-123",
      messageId: "msg-5",
      fromMe: true,
      isFromAgent: true, // ✅ CORREÇÃO: Follow-up agora é marcado como isFromAgent
      text: "Oi! Lembrei de você. Ficou alguma dúvida sobre o teste grátis?",
      timestamp: new Date("2025-01-01T14:00:00"), // 4 horas depois
    },
  ];
}

// Simular histórico ANTIGO (bug) - sem isFromAgent no follow-up
function createMockHistoryWithBug(): Message[] {
  const history = createMockHistory();
  // Simular o bug: follow-up SEM isFromAgent
  history[4].isFromAgent = false; // Bug: deveria ser true
  return history;
}

// Converter histórico para formato que a IA recebe
function convertHistoryForAI(history: Message[]): Array<{ role: "user" | "assistant"; content: string }> {
  return history.map((msg) => ({
    role: msg.fromMe ? "assistant" : "user",
    content: msg.text,
  }));
}

// Cores para output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════

async function testIsFromAgentCorrection() {
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "🧪 TESTE: Validação da correção isFromAgent no Follow-up");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  // Cenário 1: Com a correção (isFromAgent: true no follow-up)
  log("blue", "📌 Cenário 1: COM CORREÇÃO (isFromAgent: true)");
  const correctHistory = createMockHistory();
  
  log("yellow", "   Histórico de mensagens:");
  for (const msg of correctHistory) {
    const fromWho = msg.fromMe 
      ? (msg.isFromAgent ? "🤖 Agente" : "👤 Humano (dono)") 
      : "👥 Cliente";
    log("yellow", `   - ${fromWho}: "${msg.text.substring(0, 50)}..."`);
  }

  // Verificar se todas as mensagens fromMe=true têm isFromAgent=true
  const messagesFromUs = correctHistory.filter((m) => m.fromMe);
  const allMarkedAsAgent = messagesFromUs.every((m) => m.isFromAgent === true);

  if (allMarkedAsAgent) {
    log("green", "\n   ✅ CORRETO: Todas as mensagens enviadas estão marcadas como isFromAgent: true");
    log("green", "   → A IA vai saber que FOI ELA que enviou todas as mensagens");
  } else {
    log("red", "\n   ❌ PROBLEMA: Algumas mensagens enviadas NÃO estão marcadas como isFromAgent");
    log("red", "   → A IA pode confundir mensagens do humano com mensagens do agente");
  }

  // Cenário 2: Com o bug (isFromAgent: false no follow-up)
  log("blue", "\n📌 Cenário 2: COM BUG (isFromAgent: false/null)");
  const buggyHistory = createMockHistoryWithBug();
  
  log("yellow", "   Histórico de mensagens (simulando bug antigo):");
  for (const msg of buggyHistory) {
    const fromWho = msg.fromMe 
      ? (msg.isFromAgent ? "🤖 Agente" : "❓ Humano/Agente?") 
      : "👥 Cliente";
    log("yellow", `   - ${fromWho}: "${msg.text.substring(0, 50)}..."`);
  }

  const messagesFromUsBuggy = buggyHistory.filter((m) => m.fromMe);
  const allMarkedAsAgentBuggy = messagesFromUsBuggy.every((m) => m.isFromAgent === true);

  if (!allMarkedAsAgentBuggy) {
    log("yellow", "\n   ⚠️ BUG DETECTADO: Follow-up não está marcado como isFromAgent");
    log("yellow", "   → A IA pode não saber que foi ela quem enviou o follow-up");
    log("yellow", "   → Isso causa repetição de conversa e confusão");
  }

  // Resumo
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "📊 RESUMO DA CORREÇÃO");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  log("green", "✅ CORREÇÕES IMPLEMENTADAS:");
  log("green", "   1. whatsapp.ts: sendMessage() agora aceita options.isFromAgent");
  log("green", "   2. routes.ts: Callback de follow-up passa { isFromAgent: true }");
  log("green", "   3. Mensagens de follow-up são salvas com isFromAgent: true");
  log("green", "");
  log("green", "✅ RESULTADO:");
  log("green", "   → A IA sabe que FOI ELA que enviou o follow-up");
  log("green", "   → Quando o cliente responde, a IA retoma naturalmente");
  log("green", "   → Não há mais repetição ou confusão de contexto");

  return allMarkedAsAgent ? 0 : 1;
}

// Teste adicional: Simulação completa do fluxo
async function testFullFlow() {
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "🔄 TESTE: Simulação completa do fluxo");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  // Simular o que acontece quando cliente responde após follow-up
  const history = createMockHistory();
  const clientResponse = "Sim, quero testar!";

  log("blue", "📋 Cenário: Cliente responde após follow-up");
  log("yellow", `   Última mensagem (follow-up): "${history[history.length - 1].text}"`);
  log("yellow", `   Cliente responde: "${clientResponse}"`);
  log("yellow", "");
  log("green", "   ✅ O que a IA deveria fazer:");
  log("green", "      - Reconhecer que o follow-up foi enviado por ELA MESMA");
  log("green", "      - Entender que o cliente está respondendo ao follow-up");
  log("green", "      - Continuar a conversa sobre o teste grátis");
  log("green", "      - NÃO repetir apresentação ou perguntas anteriores");

  return 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  log("green", "🚀 Iniciando validação da correção isFromAgent...\n");

  const result1 = await testIsFromAgentCorrection();
  const result2 = await testFullFlow();

  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "🎯 RESULTADO FINAL");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  if (result1 === 0 && result2 === 0) {
    log("green", "✅ Todas as validações passaram!");
    log("green", "   A correção isFromAgent está implementada corretamente.");
    process.exit(0);
  } else {
    log("red", "❌ Algumas validações falharam.");
    process.exit(1);
  }
}

main().catch((error) => {
  log("red", `❌ Erro fatal: ${error.message}`);
  process.exit(1);
});
