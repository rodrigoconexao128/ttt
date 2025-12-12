/**
 * 🤖 SERVIÇO DE ATENDIMENTO AUTOMATIZADO DO ADMIN (RODRIGO) - 100% IA
 * 
 * Este serviço usa IA REAL para atender de forma natural e inteligente.
 * A IA analisa cada mensagem e decide:
 * - O que responder
 * - Quais ações executar (criar conta, configurar agente, etc.)
 * 
 * NÃO é um chatbot com fluxos fixos - é IA conversacional.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getMistralClient } from "./mistralClient";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  userId?: string;
  email?: string;
  agentConfig?: {
    name?: string;
    company?: string;
    role?: string;
    prompt?: string;
  };
  subscriptionId?: string;
  pairingCodeRequested?: boolean;
  awaitingPaymentProof?: boolean;
  lastInteraction: Date;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
}

// Cache de sessões de clientes em memória
const clientSessions = new Map<string, ClientSession>();

// ============================================================================
// FUNÇÕES DE GERENCIAMENTO DE SESSÃO
// ============================================================================

export function getClientSession(phoneNumber: string): ClientSession | undefined {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clientSessions.get(cleanPhone);
}

export function createClientSession(phoneNumber: string): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  const session: ClientSession = {
    id: uuidv4(),
    phoneNumber: cleanPhone,
    lastInteraction: new Date(),
    conversationHistory: [],
  };
  
  clientSessions.set(cleanPhone, session);
  console.log(`📱 [ADMIN AGENT] Nova sessão criada para ${cleanPhone}`);
  return session;
}

export function updateClientSession(phoneNumber: string, updates: Partial<ClientSession>): ClientSession {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  let session = clientSessions.get(cleanPhone);
  
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  Object.assign(session, updates, { lastInteraction: new Date() });
  clientSessions.set(cleanPhone, session);
  return session;
}

export function addToConversationHistory(phoneNumber: string, role: "user" | "assistant", content: string) {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const session = clientSessions.get(cleanPhone);
  
  if (session) {
    session.conversationHistory.push({
      role,
      content,
      timestamp: new Date(),
    });
    
    // Manter apenas últimas 30 mensagens para contexto
    if (session.conversationHistory.length > 30) {
      session.conversationHistory = session.conversationHistory.slice(-30);
    }
  }
}

// ============================================================================
// PROMPT MESTRE DO AGENTE RODRIGO
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // Buscar prompt configurado no admin (se existir)
  const configPrompt = await storage.getSystemConfig("admin_agent_prompt");
  const customInstructions = configPrompt?.valor || "";
  
  // Verificar se cliente já existe
  let clientInfo = "";
  if (session.userId) {
    clientInfo = `
CLIENTE EXISTENTE:
- ID: ${session.userId}
- Email: ${session.email || "não informado"}
- Este cliente já tem conta no sistema.`;
  } else if (session.email) {
    clientInfo = `
DADOS COLETADOS ATÉ AGORA:
- Email: ${session.email}
- Nome do agente: ${session.agentConfig?.name || "não definido"}
- Empresa: ${session.agentConfig?.company || "não definida"}
- Função: ${session.agentConfig?.role || "não definida"}
- Instruções: ${session.agentConfig?.prompt ? "já configuradas" : "não configuradas"}`;
  }

  // Buscar se usuário existe pelo telefone
  const existingUser = await findUserByPhone(session.phoneNumber);
  if (existingUser && !session.userId) {
    updateClientSession(session.phoneNumber, { 
      userId: existingUser.id,
      email: existingUser.email 
    });
    clientInfo = `
CLIENTE ENCONTRADO NO SISTEMA:
- ID: ${existingUser.id}
- Email: ${existingUser.email}
- Nome: ${existingUser.name || "não informado"}
- Este cliente já é cadastrado! Pode ajudar com alterações, suporte ou pagamentos.`;
  }

  return `Você é o Rodrigo, atendente HUMANO da AgenteZap. Você NÃO é um robô ou IA - você é uma pessoa real atendendo pelo WhatsApp.

${customInstructions ? `INSTRUÇÕES PERSONALIZADAS:\n${customInstructions}\n\n` : ""}

SOBRE A AGENTEZAP:
- Plataforma de automação de WhatsApp com Inteligência Artificial
- Criamos agentes de IA personalizados que atendem clientes 24/7
- Plano: R$ 99/mês - Conversas ilimitadas, 1 agente IA
- Trial: 24 horas GRÁTIS para testar
- Pagamento: PIX para rodrigoconexao128@gmail.com

COMO VOCÊ ATENDE:
1. Fale de forma natural, como um humano no WhatsApp
2. Use linguagem informal mas respeitosa (você/vc, tá/está, pra/para)
3. Respostas CURTAS (2-4 linhas), como mensagem de WhatsApp
4. Use emojis com moderação (1-2 por mensagem)
5. NUNCA use markdown (**, ##, etc.) - isso não funciona no WhatsApp
6. NUNCA diga que é IA/robô/assistente virtual
7. Faça UMA pergunta por vez, não várias
8. Seja paciente e ajude clientes que não entendem de tecnologia
${clientInfo}

FLUXO NATURAL DE ATENDIMENTO:
- Se novo cliente quer criar conta: peça email primeiro
- Depois do email confirmado: pergunte nome do agente IA
- Depois: pergunte nome da empresa
- Depois: pergunte a função do agente (atendente, vendedor, etc)
- Depois: peça as instruções/informações que o agente precisa saber
- Por fim: ofereça conectar o WhatsApp (QR Code ou código de 8 dígitos)
- Mencione o trial de 24h grátis e o pagamento de R$ 99/mês

SE CLIENTE JÁ TEM CONTA:
- Ajude a alterar configurações do agente
- Ajude com problemas de conexão
- Processe pagamentos (peça comprovante)

AÇÕES DISPONÍVEIS (use quando necessário):
Quando quiser executar uma ação, inclua no final da sua resposta em uma linha separada:
[AÇÃO:CRIAR_CONTA email="email@exemplo.com"]
[AÇÃO:SALVAR_CONFIG nome="Laura" empresa="Loja X" funcao="Atendente"]
[AÇÃO:SALVAR_PROMPT prompt="texto das instruções"]
[AÇÃO:SOLICITAR_CODIGO_PAREAMENTO]
[AÇÃO:ENVIAR_PIX]
[AÇÃO:NOTIFICAR_PAGAMENTO]

Essas ações são processadas automaticamente - não mencione elas para o cliente.

INFORMAÇÕES DO PIX:
- Valor: R$ 99,00
- Chave PIX (email): rodrigoconexao128@gmail.com
- Nome: Rodrigo

IMPORTANTE: Responda como se estivesse digitando no WhatsApp, de forma natural e humana.`;
}

// ============================================================================
// PROCESSADOR DE AÇÕES DA IA
// ============================================================================

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[AÇÃO:(\w+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    
    // Parse params like email="value" nome="value"
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
  }
  
  // Remove action tags from text
  const cleanText = response.replace(/\[AÇÃO:[^\]]+\]/g, "").trim();
  
  return { cleanText, actions };
}

async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  notifyOwner?: boolean;
  connectWhatsApp?: boolean;
  sendPix?: boolean;
  sendQrCode?: boolean;
  pairingCode?: string;
}> {
  const results: { 
    notifyOwner?: boolean; 
    connectWhatsApp?: boolean; 
    sendPix?: boolean;
    sendQrCode?: boolean;
    pairingCode?: string;
  } = {};
  
  for (const action of actions) {
    console.log(`🔧 [ADMIN AGENT] Executando ação: ${action.type}`, action.params);
    
    switch (action.type) {
      case "CRIAR_CONTA":
        if (action.params.email) {
          updateClientSession(session.phoneNumber, { email: action.params.email });
          // Criar conta será feito quando tiver todas as informações
        }
        break;
        
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;
        updateClientSession(session.phoneNumber, { agentConfig });
        break;
        
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          
          // Se tem todos os dados, criar a conta
          if (session.email && config.name && config.company) {
            await createClientAccount(session);
          }
        }
        break;
        
      case "SOLICITAR_CODIGO_PAREAMENTO":
        updateClientSession(session.phoneNumber, { pairingCodeRequested: true });
        results.connectWhatsApp = true;
        // O código será gerado e enviado pelo whatsapp.ts
        break;
        
      case "ENVIAR_QRCODE":
        results.sendQrCode = true;
        // O QR Code será gerado e enviado como imagem pelo whatsapp.ts
        break;
        
      case "ENVIAR_PIX":
        updateClientSession(session.phoneNumber, { awaitingPaymentProof: true });
        results.sendPix = true;
        break;
        
      case "NOTIFICAR_PAGAMENTO":
        results.notifyOwner = true;
        break;
    }
  }
  
  return results;
}

// ============================================================================
// GERADOR DE RESPOSTA COM IA REAL
// ============================================================================

export async function generateAIResponse(session: ClientSession, userMessage: string): Promise<string> {
  try {
    const mistral = await getMistralClient();
    const systemPrompt = await getMasterPrompt(session);
    
    // Construir mensagens para a IA
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar histórico da conversa (últimas 15 mensagens)
    for (const msg of session.conversationHistory.slice(-15)) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    // Adicionar mensagem atual
    messages.push({ role: "user", content: userMessage });
    
    console.log(`🤖 [ADMIN AGENT] Gerando resposta IA para: "${userMessage.substring(0, 50)}..."`);
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: messages,
      maxTokens: 400,
      temperature: 0.8, // Mais criatividade para parecer humano
    });
    
    const responseText = response.choices?.[0]?.message?.content;
    
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao gerar resposta IA:", error);
    return "Desculpa, tive um problema técnico aqui. Pode repetir?";
  }
}

// ============================================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================================

export interface AdminAgentResponse {
  text: string;
  media?: {
    type: "image" | "audio" | "video" | "document";
    url: string;
    caption?: string;
  };
  actions?: {
    createUser?: boolean;
    sendPix?: boolean;
    connectWhatsApp?: boolean;
    notifyOwner?: boolean;
    sendQrCode?: boolean;
    pairingCode?: string;
  };
}

// Função auxiliar para buscar configurações do admin agent
async function getAdminAgentConfig(): Promise<{
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  isActive: boolean;
}> {
  try {
    const triggerPhrasesConfig = await storage.getSystemConfig("admin_agent_trigger_phrases");
    const splitCharsConfig = await storage.getSystemConfig("admin_agent_message_split_chars");
    const delayConfig = await storage.getSystemConfig("admin_agent_response_delay_seconds");
    const isActiveConfig = await storage.getSystemConfig("admin_agent_is_active");
    
    let triggerPhrases: string[] = [];
    if (triggerPhrasesConfig?.valor) {
      try {
        triggerPhrases = JSON.parse(triggerPhrasesConfig.valor);
      } catch {
        triggerPhrases = [];
      }
    }
    
    return {
      triggerPhrases,
      messageSplitChars: parseInt(splitCharsConfig?.valor || "400", 10),
      responseDelaySeconds: parseInt(delayConfig?.valor || "30", 10),
      isActive: isActiveConfig?.valor === "true",
    };
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar config:", error);
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
    };
  }
}

// Função para verificar se mensagem contém frase gatilho (mesma lógica do aiAgent.ts)
function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  if (!triggerPhrases || triggerPhrases.length === 0) {
    // Se não há frases gatilho configuradas, responde a tudo
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  // Normalizador: lower, remove acentos, colapsa espaços
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, " ")
    .trim();

  const includesNormalized = (haystack: string, needle: string) => {
    const h = normalize(haystack);
    const n = normalize(needle);
    if (!n) return false;
    // também tolera ausência/presença de espaços
    const hNoSpace = h.replace(/\s+/g, "");
    const nNoSpace = n.replace(/\s+/g, "");
    return h.includes(n) || hNoSpace.includes(nNoSpace);
  };

  console.log(`🔍 [ADMIN AGENT] Verificando trigger phrases (${triggerPhrases.length} configuradas)`);
  console.log(`   Trigger phrases: ${triggerPhrases.join(', ')}`);

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  // Checa primeiro só a última mensagem, depois o histórico completo
  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const inLast = includesNormalized(message, phrase);
    const inAll = inLast ? false : includesNormalized(allMessages, phrase);
    if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
    console.log(`   Procurando "${phrase}" → last:${inLast ? '✅' : '❌'} | history:${inAll ? '✅' : '❌'}`);
    return inLast || inAll;
  });

  return { hasTrigger, foundIn };
}

export async function processAdminMessage(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  skipTriggerCheck: boolean = false
): Promise<AdminAgentResponse | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // Obter ou criar sessão
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // Buscar configurações do admin agent
  const adminConfig = await getAdminAgentConfig();
  
  // Verificar frases gatilho (a menos que seja skipTriggerCheck para testes)
  if (!skipTriggerCheck) {
    const triggerResult = checkTriggerPhrases(
      messageText,
      session.conversationHistory,
      adminConfig.triggerPhrases
    );
    
    if (!triggerResult.hasTrigger) {
      console.log(`⏸️ [ADMIN AGENT] Skipping response - no trigger phrase found for ${cleanPhone}`);
      // Ainda adiciona ao histórico mas não responde
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
    
    console.log(`✅ [ADMIN AGENT] Trigger phrase detected (${triggerResult.foundIn}) for ${cleanPhone}`);
  }
  
  // Adicionar mensagem ao histórico
  addToConversationHistory(cleanPhone, "user", messageText);
  
  // Se é imagem e está aguardando comprovante
  if (mediaType === "image" && session.awaitingPaymentProof) {
    const text = "Recebi seu comprovante! 🎉 Vou verificar o pagamento e liberar sua conta. Isso leva no máximo 1 hora em horário comercial!";
    addToConversationHistory(cleanPhone, "assistant", text);
    updateClientSession(cleanPhone, { awaitingPaymentProof: false });
    
    return {
      text,
      actions: { notifyOwner: true },
    };
  }
  
  // Gerar resposta com IA
  const aiResponse = await generateAIResponse(session, messageText);
  
  // Parse ações da resposta
  const { cleanText, actions } = parseActions(aiResponse);
  
  // Executar ações
  const actionResults = await executeActions(session, actions);
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", cleanText);
  
  // Atualizar sessão
  session = getClientSession(cleanPhone)!;
  
  return {
    text: cleanText,
    actions: actionResults,
  };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

async function findUserByPhone(phone: string): Promise<any | undefined> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    const users = await storage.getAllUsers();
    return users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar usuário por telefone:", error);
    return undefined;
  }
}

async function findUserByEmail(email: string): Promise<any | undefined> {
  try {
    const users = await storage.getAllUsers();
    return users.find(u => u.email?.toLowerCase() === email.toLowerCase());
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao buscar usuário por email:", error);
    return undefined;
  }
}

export async function getOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}

export async function setOwnerNotificationNumber(number: string): Promise<void> {
  await storage.updateSystemConfig("owner_notification_number", number);
}

// ============================================================================
// CRIAR CONTA DO CLIENTE
// ============================================================================

export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    if (!session.email) {
      return { userId: "", success: false, error: "Email não informado" };
    }
    
    // Verificar se já existe
    const existing = await findUserByEmail(session.email);
    if (existing) {
      updateClientSession(session.phoneNumber, { userId: existing.id });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuário
    const user = await storage.upsertUser({
      email: session.email,
      name: session.agentConfig?.company || "Cliente",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar configuração do agente se tiver prompt
    if (session.agentConfig?.prompt) {
      const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS DE ATENDIMENTO:
- Seja sempre educado e prestativo
- Responda de forma curta e objetiva
- Use linguagem natural e amigável
- Não invente informações que não foram fornecidas
- Se não souber algo, diga que vai verificar`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar assinatura de teste (24h)
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0];
    
    if (basicPlan) {
      const trialEnd = new Date();
      trialEnd.setHours(trialEnd.getHours() + 24);
      
      const subscription = await storage.createSubscription({
        userId: user.id,
        planId: basicPlan.id,
        status: "active",
        dataInicio: new Date(),
        dataFim: trialEnd,
      });
      
      updateClientSession(session.phoneNumber, { subscriptionId: subscription.id });
    }
    
    updateClientSession(session.phoneNumber, { userId: user.id });
    
    console.log(`✅ [ADMIN AGENT] Conta criada para ${session.email} (ID: ${user.id})`);
    
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}

// ============================================================================
// NOTIFICAR DONO SOBRE PAGAMENTO
// ============================================================================

export async function notifyOwnerAboutPayment(
  session: ClientSession,
  comprovante?: string
): Promise<void> {
  try {
    const ownerNumber = await getOwnerNotificationNumber();
    
    const message = `💰 NOVO PAGAMENTO RECEBIDO

📱 Cliente: ${session.phoneNumber}
📧 Email: ${session.email || "N/A"}
🤖 Agente: ${session.agentConfig?.name || "N/A"}
🏢 Empresa: ${session.agentConfig?.company || "N/A"}

⏰ ${new Date().toLocaleString("pt-BR")}

${comprovante ? "📸 Comprovante anexado" : "⚠️ Verificar pagamento manualmente"}`;
    
    console.log(`📢 [ADMIN AGENT] Notificação de pagamento para ${ownerNumber}:\n${message}`);
    
    // A notificação é enviada pelo whatsapp.ts
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao notificar dono:", error);
  }
}
