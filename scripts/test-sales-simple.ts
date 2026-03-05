/**
 * 🧪 TESTE SIMPLES DO NOVO FLUXO DE VENDAS
 * 
 * Execute com: npm run test:sales
 * Ou: npx tsx scripts/test-sales-simple.ts
 */

// Simular storage para teste (sem banco)
const mockStorage = {
  getSystemConfig: async () => null,
  getAllUsers: async () => [],
  getConnectionByUserId: async () => null,
  getUserSubscription: async () => null,
  getAdminConversationByPhone: async () => null,
  getAdminMessages: async () => [],
  getActivePlans: async () => [],
  upsertUser: async (data: any) => ({ id: 'test-user-id', ...data }),
  upsertAgentConfig: async () => ({}),
  createSubscription: async () => ({}),
  updateSystemConfig: async () => ({}),
};

// Mock do módulo
const mockMistralResponse = (message: string): string => {
  // Simular respostas do Rodrigo baseadas na mensagem
  if (message.toLowerCase().includes('oi') || message.toLowerCase().includes('olá')) {
    return `Oi! Tudo bem? 😊 Sou o Rodrigo da AgenteZap! 

Fico muito feliz que você entrou em contato! Me conta, qual o nome da sua empresa ou loja?`;
  }
  
  if (message.toLowerCase().includes('loja') || message.toLowerCase().includes('empresa')) {
    return `Que legal! Adorei o nome! 👏

E como você gostaria de chamar o agente de IA que vai atender seus clientes? Pode ser um nome tipo "Laura", "Carlos", ou qualquer outro que combine com sua marca.

[AÇÃO:SALVAR_CONFIG empresa="${message.match(/(?:loja|empresa)[^\w]*(\w+(?:\s+\w+)*)/i)?.[1] || 'Loja do Cliente'}"]`;
  }
  
  if (message.toLowerCase().includes('laura') || message.toLowerCase().includes('agente')) {
    return `Perfeito! O nome ficou ótimo! 😄

Agora me conta, qual vai ser a função principal? Atendente, vendedor, suporte técnico...?

[AÇÃO:SALVAR_CONFIG nome="${message.match(/(\w+)/)?.[1] || 'Agente'}"]`;
  }
  
  if (message.toLowerCase().includes('atendente') || message.toLowerCase().includes('vendedor')) {
    return `Show! 👍

Última coisa: me passa as informações que o agente precisa saber. Por exemplo:
- O que você vende
- Formas de pagamento
- Horário de atendimento
- Qualquer informação importante

Pode mandar tudo junto, não precisa ser certinho!

[AÇÃO:SALVAR_CONFIG funcao="${message.match(/(\w+)/)?.[1] || 'Atendente'}"]`;
  }
  
  if (message.toLowerCase().includes('vende') || message.toLowerCase().includes('informações')) {
    return `Maravilha! Anotei tudo! ✅

Então resumindo:
- Empresa: Loja do Cliente
- Agente: Laura
- Função: Vendedora

Tá perfeito assim? Quer testar o agente agora? Eu viro a Laura e você pode ver como ela atende! Pra sair do teste é só digitar #sair

[AÇÃO:SALVAR_PROMPT prompt="${message}"]`;
  }
  
  if (message.toLowerCase().includes('testar') || message.toLowerCase().includes('teste')) {
    return `Boa! Agora eu sou a Laura, sua atendente virtual! 🤖✨

Pode mandar uma mensagem como se você fosse um cliente. Quando quiser sair, é só digitar #sair.

Vamos lá!

[AÇÃO:INICIAR_TESTE]`;
  }
  
  if (message === '#sair') {
    return `Saiu do modo de teste! 🎭

E aí, o que achou? Gostou de como o agente atendeu? 😊`;
  }
  
  if (message.toLowerCase().includes('gostei') || message.toLowerCase().includes('legal')) {
    return `Que bom que gostou! 🎉

O AgenteZap custa apenas R$ 99/mês com conversas ilimitadas. Quer fechar? Posso enviar o PIX agora!

[AÇÃO:ENVIAR_PIX]`;
  }
  
  return `Entendi! Me conta mais sobre o que você precisa 😊`;
};

// ============================================================================
// TIPOS
// ============================================================================

interface ClientSession {
  id: string;
  phoneNumber: string;
  flowState: 'onboarding' | 'test_mode' | 'post_test' | 'payment_pending' | 'active';
  agentConfig?: {
    name?: string;
    company?: string;
    role?: string;
    prompt?: string;
  };
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
}

// Cache de sessões
const clientSessions = new Map<string, ClientSession>();

function getClientSession(phoneNumber: string): ClientSession | undefined {
  return clientSessions.get(phoneNumber.replace(/\D/g, ""));
}

function createClientSession(phoneNumber: string): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session: ClientSession = {
    id: `session_${Date.now()}`,
    phoneNumber: cleanPhone,
    flowState: 'onboarding',
    conversationHistory: [],
  };
  clientSessions.set(cleanPhone, session);
  return session;
}

function clearClientSession(phoneNumber: string): boolean {
  return clientSessions.delete(phoneNumber.replace(/\D/g, ""));
}

// ============================================================================
// PARSER DE AÇÕES
// ============================================================================

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  const validActions = [
    "SALVAR_CONFIG", "SALVAR_PROMPT", "INICIAR_TESTE",
    "ENVIAR_PIX", "NOTIFICAR_PAGAMENTO", "AGENDAR_CONTATO", "CRIAR_CONTA",
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    if (!validActions.includes(type)) continue;
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
  }
  
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  return { cleanText, actions };
}

function executeActions(session: ClientSession, actions: ParsedAction[]): {
  sendPix?: boolean;
  startTestMode?: boolean;
} {
  const results: { sendPix?: boolean; startTestMode?: boolean } = {};
  
  for (const action of actions) {
    console.log(`   ⚙️ Executando: ${action.type}`);
    
    switch (action.type) {
      case "SALVAR_CONFIG":
        session.agentConfig = session.agentConfig || {};
        if (action.params.nome) session.agentConfig.name = action.params.nome;
        if (action.params.empresa) session.agentConfig.company = action.params.empresa;
        if (action.params.funcao) session.agentConfig.role = action.params.funcao;
        break;
        
      case "SALVAR_PROMPT":
        session.agentConfig = session.agentConfig || {};
        session.agentConfig.prompt = action.params.prompt;
        break;
        
      case "INICIAR_TESTE":
        session.flowState = 'test_mode';
        results.startTestMode = true;
        break;
        
      case "ENVIAR_PIX":
        session.flowState = 'payment_pending';
        results.sendPix = true;
        break;
    }
  }
  
  return results;
}

// ============================================================================
// PROCESSADOR
// ============================================================================

function processMessage(phoneNumber: string, message: string): {
  text: string;
  actions: { sendPix?: boolean; startTestMode?: boolean };
} {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // Comandos especiais
  if (message.match(/^#(limpar|reset|novo)$/i)) {
    clearClientSession(cleanPhone);
    return {
      text: "✅ Sessão limpa! Agora você pode testar novamente como se fosse um cliente novo.",
      actions: {},
    };
  }
  
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // #sair do modo de teste
  if (message.match(/^#sair$/i) && session.flowState === 'test_mode') {
    session.flowState = 'post_test';
    return {
      text: "Saiu do modo de teste! 🎭\n\nE aí, o que achou? Gostou de como o agente atendeu? 😊",
      actions: {},
    };
  }
  
  // Gerar resposta (mock)
  const aiResponse = mockMistralResponse(message);
  
  // Parse ações
  const { cleanText, actions } = parseActions(aiResponse);
  
  // Executar ações
  const actionResults = executeActions(session, actions);
  
  // Salvar no histórico
  session.conversationHistory.push(
    { role: 'user', content: message, timestamp: new Date() },
    { role: 'assistant', content: cleanText, timestamp: new Date() }
  );
  
  return { text: cleanText, actions: actionResults };
}

// ============================================================================
// TESTES
// ============================================================================

console.log("\n" + "═".repeat(60));
console.log("  🧪 TESTE DO NOVO FLUXO DE VENDAS");
console.log("═".repeat(60) + "\n");

const TEST_PHONE = "5517999991234";

// Limpar sessão
clearClientSession(TEST_PHONE);
console.log("✅ Sessão limpa\n");

const testMessages = [
  "Oi, vi sobre vocês no instagram",
  "É a Loja Fashion Store",
  "Pode ser Laura",
  "Vai ser vendedora",
  "Vendemos roupas femininas, entrega grátis acima de R$200, parcelamos em 6x",
  "Sim, quero testar!",
  "Olá, quero comprar uma blusa", // (modo teste)
  "#sair",
  "Gostei muito!",
];

for (const msg of testMessages) {
  console.log("\n" + "─".repeat(50));
  console.log(`👤 Cliente: "${msg}"`);
  console.log("─".repeat(50));
  
  const response = processMessage(TEST_PHONE, msg);
  
  console.log(`\n🤖 Rodrigo:\n"${response.text}"`);
  
  if (response.actions.startTestMode) {
    console.log("\n   🧪 >>> MODO DE TESTE ATIVADO <<<");
  }
  if (response.actions.sendPix) {
    console.log("\n   💰 >>> PIX ENVIADO <<<");
  }
  
  const session = getClientSession(TEST_PHONE);
  console.log(`\n   📋 Estado: ${session?.flowState}`);
  console.log(`   📋 Config: ${JSON.stringify(session?.agentConfig || {})}`);
}

// Teste de limpeza
console.log("\n" + "═".repeat(60));
console.log("  🧹 TESTE: Comando #limpar");
console.log("═".repeat(60));

const cleanResponse = processMessage(TEST_PHONE, "#limpar");
console.log(`\n🤖: "${cleanResponse.text}"`);
console.log(`Sessão existe? ${getClientSession(TEST_PHONE) ? "SIM" : "NÃO"}`);

console.log("\n" + "═".repeat(60));
console.log("  ✅ TODOS OS TESTES COMPLETADOS!");
console.log("═".repeat(60) + "\n");
