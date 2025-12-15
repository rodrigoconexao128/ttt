/**
 * 🤖 SERVIÇO DE VENDAS AUTOMATIZADO DO ADMIN (RODRIGO) - NOVA VERSÃO
 * 
 * FLUXO PRINCIPAL:
 * 1. Configurar agente (nome, empresa, função, instruções)
 * 2. Modo de teste (#sair para voltar)
 * 3. Aprovação → PIX → Conectar WhatsApp → Criar conta
 * 
 * SEM QR CODE / PAREAMENTO durante onboarding!
 * Conta criada automaticamente com email fictício para teste.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getMistralClient } from "./mistralClient";
import { v4 as uuidv4 } from "uuid";
import { 
  generateAdminMediaPromptBlock, 
  parseAdminMediaTags, 
  getAdminMediaByName,
  type AdminMedia 
} from "./adminMediaStore";
import {
  scheduleAutoFollowUp,
  cancelFollowUp,
  scheduleContact,
  parseScheduleFromText,
} from "./followUpService";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  
  // Dados do cliente
  userId?: string;
  email?: string;
  
  // Configuração do agente em criação
  agentConfig?: {
    name?: string;       // Nome do agente (ex: "Laura")
    company?: string;    // Nome da empresa (ex: "Loja Fashion")
    role?: string;       // Função (ex: "Atendente", "Vendedor")
    prompt?: string;     // Instruções detalhadas
  };
  
  // Estado do fluxo
  flowState: 'onboarding' | 'test_mode' | 'post_test' | 'payment_pending' | 'active';
  
  // Controles
  subscriptionId?: string;
  awaitingPaymentProof?: boolean;
  lastInteraction: Date;
  
  // Histórico
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
}

// Token de teste para simulador
interface TestToken {
  token: string;
  userId: string;
  agentName: string;
  company: string;
  createdAt: Date;
  expiresAt: Date;
}

// Cache de sessões de clientes em memória
const clientSessions = new Map<string, ClientSession>();

// Contador para emails fictícios
let emailCounter = 1000;

/**
 * Gera token de teste para o simulador de WhatsApp
 * AGORA PERSISTE NO SUPABASE para funcionar no Railway após reinício
 */
export async function generateTestToken(userId: string, agentName: string, company: string): Promise<TestToken> {
  const token = uuidv4().replace(/-/g, '').substring(0, 16);
  
  const testToken: TestToken = {
    token,
    userId,
    agentName,
    company,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
  };
  
  // Persistir no Supabase
  try {
    const { supabase } = await import("./supabaseAuth");
    await supabase.from('test_tokens').insert({
      token: testToken.token,
      user_id: testToken.userId,
      agent_name: testToken.agentName,
      company: testToken.company,
      expires_at: testToken.expiresAt.toISOString(),
    });
    console.log(`🎫 [SALES] Token de teste gerado e salvo no DB: ${token} para userId: ${userId}`);
  } catch (err) {
    console.error(`❌ [SALES] Erro ao salvar token no DB:`, err);
  }
  
  return testToken;
}

/**
 * Busca informações do token de teste no Supabase
 */
export async function getTestToken(token: string): Promise<TestToken | undefined> {
  try {
    const { supabase } = await import("./supabaseAuth");
    
    const { data, error } = await supabase
      .from('test_tokens')
      .select('*')
      .eq('token', token)
      .gt('expires_at', new Date().toISOString())
      .single();
    
    if (error || !data) {
      console.log(`❌ [SALES] Token não encontrado ou expirado: ${token}`);
      return undefined;
    }
    
    return {
      token: data.token,
      userId: data.user_id,
      agentName: data.agent_name,
      company: data.company,
      createdAt: new Date(data.created_at),
      expiresAt: new Date(data.expires_at),
    };
  } catch (err) {
    console.error(`❌ [SALES] Erro ao buscar token:`, err);
    return undefined;
  }
}

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
    flowState: 'onboarding',
    lastInteraction: new Date(),
    conversationHistory: [],
  };
  
  clientSessions.set(cleanPhone, session);
  console.log(`📱 [SALES] Nova sessão criada para ${cleanPhone}`);
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

/**
 * Limpa sessão do cliente (para testes)
 * Comandos: #limpar, #reset, #novo
 */
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  
  if (existed) {
    console.log(`🗑️ [SALES] Sessão do cliente ${cleanPhone} removida da memória`);
  }
  return existed;
}

/**
 * Gera email fictício para conta temporária
 */
function generateTempEmail(phoneNumber: string): string {
  emailCounter++;
  const cleanPhone = phoneNumber.replace(/\D/g, "").slice(-8);
  return `cliente_${cleanPhone}_${emailCounter}@agentezap.temp`;
}

/**
 * Gera senha temporária aleatória
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'AZ-';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

/**
 * Cria conta de teste e retorna credenciais + token do simulador
 */
export async function createTestAccountWithCredentials(session: ClientSession): Promise<{
  success: boolean;
  email?: string;
  password?: string;
  loginUrl?: string;
  simulatorToken?: string;
  error?: string;
}> {
  try {
    const email = generateTempEmail(session.phoneNumber);
    const password = generateTempPassword();
    
    // Importar supabase para criar usuário
    const { supabase } = await import("./supabaseAuth");
    
    // Verificar se já existe usuário com esse telefone
    const users = await storage.getAllUsers();
    const existing = users.find(u => u.phone?.replace(/\D/g, "") === session.phoneNumber.replace(/\D/g, ""));
    
    if (existing) {
      // Usuário já existe, gerar nova senha
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password: password
      });
      
      if (updateError) {
        console.error("[SALES] Erro ao atualizar senha:", updateError);
        // Continuar mesmo assim, pode ser que a conta funcione
      }
      
      updateClientSession(session.phoneNumber, { 
        userId: existing.id, 
        email: existing.email,
        flowState: 'post_test'
      });
      
      // Gerar token para simulador (persiste no Supabase)
      const agentName = session.agentConfig?.name || "Agente";
      const company = session.agentConfig?.company || "Empresa";
      const testToken = await generateTestToken(existing.id, agentName, company);
      
      return {
        success: true,
        email: existing.email || email,
        password: password,
        loginUrl: process.env.APP_URL || 'https://agentezap.online',
        simulatorToken: testToken.token
      };
    }
    
    // Criar novo usuário no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: session.agentConfig?.company || "Cliente Teste",
        phone: session.phoneNumber,
      }
    });
    
    if (authError) {
      console.error("[SALES] Erro ao criar usuário Supabase:", authError);
      return { success: false, error: authError.message };
    }
    
    if (!authData.user) {
      return { success: false, error: "Falha ao criar usuário" };
    }
    
    // Criar usuário no banco de dados
    const user = await storage.upsertUser({
      id: authData.user.id,
      email: email,
      name: session.agentConfig?.company || "Cliente Teste",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar config do agente se tiver
    if (session.agentConfig?.prompt || session.agentConfig?.name) {
      const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt || "Atenda os clientes de forma educada e prestativa."}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- Não invente informações`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar trial de 24h
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0];
    
    if (basicPlan) {
      const trialEnd = new Date();
      trialEnd.setHours(trialEnd.getHours() + 24);
      
      await storage.createSubscription({
        userId: user.id,
        planId: basicPlan.id,
        status: "trialing",
        dataInicio: new Date(),
        dataFim: trialEnd,
      });
    }
    
    updateClientSession(session.phoneNumber, { 
      userId: user.id, 
      email: email,
      flowState: 'post_test'
    });
    
    // Gerar token para simulador (persiste no Supabase)
    const agentName = session.agentConfig?.name || "Agente";
    const company = session.agentConfig?.company || "Empresa";
    const testToken = await generateTestToken(user.id, agentName, company);
    
    console.log(`✅ [SALES] Conta de teste criada: ${email} (ID: ${user.id})`);
    
    return {
      success: true,
      email: email,
      password: password,
      loginUrl: process.env.APP_URL || 'https://agentezap.online',
      simulatorToken: testToken.token
    };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta de teste:", error);
    return { success: false, error: String(error) };
  }
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
// PROMPT MESTRE DO RODRIGO (VENDEDOR) - NUCLEAR 20.0 (HARDCODED)
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // NUCLEAR 20.0: Prompt fixo no código, não busca mais do banco
  // Isso garante que a calibração 100% seja mantida e não seja alterada via admin
  
  // Verificar se cliente já existe pelo telefone
  const existingUser = await findUserByPhone(session.phoneNumber);
  
  // Se encontrou usuário, verificar se realmente é um cliente ATIVO
  // (tem conexão WhatsApp E assinatura ativa)
  if (existingUser && !session.userId) {
    let isReallyActive = false;
    
    try {
      // Verificar se tem conexão ativa
      const connection = await storage.getConnectionByUserId(existingUser.id);
      const hasActiveConnection = connection?.isConnected === true;
      
      // Verificar se tem assinatura ativa
      const subscription = await storage.getUserSubscription(existingUser.id);
      const hasActiveSubscription = subscription?.status === 'active' || subscription?.status === 'trialing';
      
      // Só é cliente ativo se tiver conexão E assinatura
      isReallyActive = hasActiveConnection && hasActiveSubscription;
    } catch (e) {
      // Se deu erro, considera como não ativo
      isReallyActive = false;
    }
    
    if (isReallyActive) {
      updateClientSession(session.phoneNumber, { 
        userId: existingUser.id,
        email: existingUser.email,
        flowState: 'active'
      });
      session.userId = existingUser.id;
      session.email = existingUser.email;
      session.flowState = 'active';
    } else {
      // Usuário existe mas não está ativo - manter em onboarding
      // Apenas guardar o userId para referência
      updateClientSession(session.phoneNumber, { 
        userId: existingUser.id,
        email: existingUser.email
        // NÃO muda flowState - mantém onboarding
      });
      session.userId = existingUser.id;
      session.email = existingUser.email;
      console.log(`[SALES] Usuário ${existingUser.id} encontrado mas sem conexão/assinatura ativa - mantendo em onboarding`);
    }
  }
  
  // Montar contexto baseado no estado
  let stateContext = "";
  
  // REMOVIDO: test_mode - agora usamos CRIAR_CONTA_TESTE que gera credenciais
  // O cliente testa no painel web, não no WhatsApp
  
  if (session.flowState === 'active' && session.userId) {
    // Cliente ativo - já tem conta
    stateContext = await getActiveClientContext(session);
  } else {
    // Novo cliente - fluxo de vendas (inclui post_test)
    stateContext = getOnboardingContext(session);
  }
  
  // Carregar bloco de mídias
  const mediaBlock = await generateAdminMediaPromptBlock();
  
  return `🚨 DIRETRIZ SUPREMA DE VENDAS - NUCLEAR 20.0 🚨

VOCÊ É O RODRIGO, O MELHOR VENDEDOR DA AGENTEZAP.
SUA MISSÃO É UMA SÓ: FAZER O CLIENTE TESTAR A FERRAMENTA AGORA.

REGRAS ABSOLUTAS DE EXECUÇÃO (NUCLEAR 20.0):

1. 🚫 PROIBIDO ALUCINAR LINKS:
   - NUNCA escreva "[link de teste]", "agentezap.com", "seu link".
   - NUNCA diga "Vou criar... um minuto".
   - A ÚNICA forma de criar o link é usando a tag: [ACAO:CRIAR_CONTA_TESTE]

2. ⚡ EXECUÇÃO IMEDIATA:
   - Se o cliente disse "Quero testar", "Pode criar", "Manda o link":
   - NÃO FALE "Vou criar".
   - NÃO FALE "Um momento".
   - FALE "Aqui está seu acesso:" e COLOQUE A TAG IMEDIATAMENTE.

3. 🏷️ A TAG É OBRIGATÓRIA:
   - Se você disser que o teste está pronto, a tag [ACAO:CRIAR_CONTA_TESTE] TEM QUE ESTAR NA MENSAGEM.
   - Se o cliente disser "Não recebi", mande a tag de novo.

4. 🛡️ DEFESA CONTRA OBJEÇÕES (PREÇO/SOBRINHO/CHATGPT):
   - Cliente: "Tá caro" / "Meu sobrinho faz" / "ChatGPT é grátis".
   - Rodrigo: "Entendo! Mas o nosso é especializado em vendas. Teste de graça e compare os resultados:"
   - [ACAO:CRIAR_CONTA_TESTE]
   - (NÃO CALCULE ROI. NÃO DISCUTA. APENAS MANDE O TESTE).

5. 💍 DEFESA "VOU VER COM ESPOSA/SÓCIO":
   - Rodrigo: "Melhor ainda! Cria a conta (é grátis) e mostra pra ela funcionando. É mais fácil aprovar vendo:"
   - [ACAO:CRIAR_CONTA_TESTE]

6. 📝 DADOS INCOMPLETOS? NÃO IMPORTA:
   - Se o cliente deu o Nome e Nicho, NÃO PEÇA O PREÇO.
   - Se o cliente deu o Email, NÃO PEÇA O NOME.
   - ASSUMA O RESTO E GERE A TAG. O cliente completa depois.

EXEMPLOS CORRETOS:

Cliente: "Quero testar"
Rodrigo: "Aqui está seu acesso: [ACAO:CRIAR_CONTA_TESTE]"

Cliente: "Sou João da Pizzaria"
Rodrigo: "Show João! Criei pro seu delivery: [ACAO:CRIAR_CONTA_TESTE]"

Cliente: "Manda o link"
Rodrigo: "Tá na mão: [ACAO:CRIAR_CONTA_TESTE]"

Cliente: "Vou pensar"
Rodrigo: "Testa sem compromisso antes de decidir: [ACAO:CRIAR_CONTA_TESTE]"

AGORA VÁ E GERE A TAG: [ACAO:CRIAR_CONTA_TESTE]

${stateContext}

${mediaBlock}
`;
}

/**
 * Contexto para clientes novos (onboarding/vendas)
 */
function getOnboardingContext(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  let configStatus = "";
  if (config.name) configStatus += `✅ Nome do agente: ${config.name}\n`;
  if (config.company) configStatus += `✅ Empresa: ${config.company}\n`;
  if (config.role) configStatus += `✅ Função: ${config.role}\n`;
  if (config.prompt) configStatus += `✅ Instruções: configuradas\n`;
  
  const hasAllConfig = config.name && config.company && config.role && config.prompt;
  
  return `
═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO ATUAL: NOVO CLIENTE (Onboarding)
═══════════════════════════════════════════════════════════════════════════════

Telefone: ${session.phoneNumber}
${configStatus ? `\nDADOS JÁ COLETADOS:\n${configStatus}` : "\n🆕 NENHUM DADO COLETADO AINDA"}

═══════════════════════════════════════════════════════════════════════════════
🎯 FLUXO DE VENDAS (RÁPIDO E HUMANO!)
═══════════════════════════════════════════════════════════════════════════════

⚡ SEJA RÁPIDO! Pergunte TUDO DE UMA VEZ quando possível!

PASSO 1 - DESCOBERTA RÁPIDA
👉 Faça UMA pergunta que pega TUDO:
"Me conta rapidinho: qual seu negócio, o que você vende/faz, e qual sua maior dor no atendimento hoje?"

Ou se ele já disse o negócio:
"Legal! Me manda aí: nome da empresa, o que vocês vendem/fazem, e pode mandar foto do cardápio/catálogo se tiver! 📸"

🎤 AVISE QUE ACEITA ÁUDIO:
"Se preferir, manda um áudio explicando tudo! Fica mais fácil e eu já entendo direitinho 🎤"

PASSO 2 - CONFIGURAÇÃO RÁPIDA (TUDO DE UMA VEZ!)
👉 Em vez de perguntar UM POR VEZ, pergunte TUDO JUNTO:

"Pra criar seu agente, me manda essas infos (pode ser tudo junto ou manda um áudio!):
📍 Nome da sua empresa
🤖 Nome que quer dar pro agente (ex: Laura, Pedro, Bia...)
📝 O que ele precisa saber (preços, produtos, horários, regras...)

Pode mandar foto do cardápio/catálogo também! 📸"

Se o cliente mandar tudo junto → VOCÊ EXTRAI as informações da resposta
Se faltar algo → Pergunte só o que falta

PASSO 3 - CRIAR E TESTAR
👉 Quando tiver as infos, crie a conta:

"Show! Vou criar seu agente agora mesmo! 🚀

[AÇÃO:CRIAR_CONTA_TESTE]

Você vai receber um link pra testar. Lá tem um SIMULADOR de WhatsApp igualzinho ao real - você conversa com SEU agente e vê como ele responde! 📱

Testa lá e me fala o que achou! Qualquer ajuste a gente faz na hora!"

🔗 O QUE ACONTECE APÓS CRIAR A CONTA:
1. Sistema gera email + senha
2. Cliente acessa o link
3. No painel tem um SIMULADOR de WhatsApp
4. Cliente conversa com o AGENTE DELE (não comigo!)
5. Ele vê o agente funcionando na prática

PASSO 4 - AJUSTES
👉 Se o cliente voltar com feedback:
• "O agente não soube responder X" → Ajuste as instruções
• "Precisa falar sobre Y também" → Adicione no prompt
• "Tá perfeito!" → Ofereça o plano pago

${hasAllConfig ? `
╔═══════════════════════════════════════════════════════════════════════════╗
║ ✅ CONFIGURAÇÃO COMPLETA! Agora CRIE A CONTA DE TESTE!                   ║
║                                                                           ║
║ Diga algo como:                                                           ║
║ "Perfeito! Tá tudo configurado! 🎉                                       ║
║ Vou criar sua conta de teste agora para você experimentar!"              ║
║                                                                           ║
║ Use [AÇÃO:CRIAR_CONTA_TESTE] para gerar as credenciais de acesso.        ║
║                                                                           ║
║ O sistema vai inserir automaticamente o email, senha e link de acesso.   ║
║ Após isso, o cliente acessa o painel web, conecta o WhatsApp dele e      ║
║ testa o agente funcionando DE VERDADE!                                   ║
╚═══════════════════════════════════════════════════════════════════════════╝
` : ""}

═══════════════════════════════════════════════════════════════════════════════
💡 OBJEÇÕES COMUNS
═══════════════════════════════════════════════════════════════════════════════

Se o cliente tiver dúvidas, responda de forma curta e direcione para o teste.
O foco é SEMPRE o teste.

═══════════════════════════════════════════════════════════════════════════════

═══════════════════════════════════════════════════════════════════════════════
⏰ FOLLOW-UP INTELIGENTE
═══════════════════════════════════════════════════════════════════════════════

Se o cliente pedir pra retornar depois, agende:
[AÇÃO:AGENDAR_CONTATO data="amanhã 14h" motivo="retornar contato"]

Se ele parar de responder, o sistema agenda automaticamente um lembrete.`;
}

/**
 * Contexto para clientes ativos (já tem conta)
 */
async function getActiveClientContext(session: ClientSession): Promise<string> {
  let connectionStatus = "⚠️ Não verificado";
  let subscriptionStatus = "⚠️ Não verificado";
  
  if (session.userId) {
    try {
      const connection = await storage.getConnectionByUserId(session.userId);
      connectionStatus = connection?.isConnected 
        ? `✅ Conectado (${connection.phoneNumber})`
        : "❌ Desconectado";
    } catch {}
    
    try {
      const sub = await storage.getUserSubscription(session.userId);
      if (sub) {
        const isActive = sub.status === 'active' || sub.status === 'trialing';
        subscriptionStatus = isActive ? `✅ ${sub.status}` : `❌ ${sub.status}`;
      }
    } catch {}
  }
  
  return `
📋 ESTADO ATUAL: CLIENTE ATIVO (já tem conta)

DADOS DA CONTA:
- ID: ${session.userId}
- Email: ${session.email}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

✅ O QUE VOCÊ PODE FAZER:
- Ajudar com problemas de conexão
- Alterar configurações do agente
- Processar pagamentos
- Resolver problemas técnicos
- Ativar/desativar agente

❌ NÃO FAÇA:
- NÃO pergunte email novamente
- NÃO inicie onboarding
- NÃO explique tudo do zero`;
}

// ============================================================================
// PROCESSADOR DE AÇÕES DA IA
// ============================================================================

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  const validActions = [
    "SALVAR_CONFIG",
    "SALVAR_PROMPT",
    "CRIAR_CONTA_TESTE",
    "ENVIAR_PIX",
    "NOTIFICAR_PAGAMENTO",
    "AGENDAR_CONTATO",
    "CRIAR_CONTA",
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
    console.log(`🔧 [SALES] Ação detectada: ${type}`, params);
  }
  
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  
  return { cleanText, actions };
}

async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  sendPix?: boolean;
  notifyOwner?: boolean;
  startTestMode?: boolean;
  testAccountCredentials?: { email: string; password: string; loginUrl: string };
}> {
  const results: { 
    sendPix?: boolean; 
    notifyOwner?: boolean;
    startTestMode?: boolean;
    testAccountCredentials?: { email: string; password: string; loginUrl: string };
  } = {};
  
  for (const action of actions) {
    console.log(`🔧 [SALES] Executando ação: ${action.type}`, action.params);
    
    switch (action.type) {
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;
        updateClientSession(session.phoneNumber, { agentConfig });
        console.log(`✅ [SALES] Config salva:`, agentConfig);
        break;
        
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          console.log(`✅ [SALES] Prompt salvo (${action.params.prompt.length} chars)`);
        }
        break;
        
      case "CRIAR_CONTA_TESTE":
        // Nova ação: criar conta de teste e retornar credenciais + token do simulador
        const testResult = await createTestAccountWithCredentials(session);
        if (testResult.success && testResult.email && testResult.password) {
          results.testAccountCredentials = {
            email: testResult.email,
            password: testResult.password,
            loginUrl: testResult.loginUrl || 'https://agentezap.online',
            simulatorToken: testResult.simulatorToken
          };
          console.log(`🎉 [SALES] Conta de teste criada: ${testResult.email} (token: ${testResult.simulatorToken})`);
        } else {
          console.error(`❌ [SALES] Erro ao criar conta de teste:`, testResult.error);
        }
        break;
        
      case "ENVIAR_PIX":
        updateClientSession(session.phoneNumber, { 
          awaitingPaymentProof: true,
          flowState: 'payment_pending'
        });
        results.sendPix = true;
        break;
        
      case "NOTIFICAR_PAGAMENTO":
        results.notifyOwner = true;
        break;
        
      case "AGENDAR_CONTATO":
        if (action.params.data) {
          const scheduledDate = parseScheduleFromText(action.params.data);
          if (scheduledDate) {
            scheduleContact(session.phoneNumber, scheduledDate, action.params.motivo || 'Retorno agendado');
            console.log(`📅 [SALES] Contato agendado para ${scheduledDate.toLocaleString('pt-BR')}`);
          }
        }
        break;
        
      case "CRIAR_CONTA":
        // Criar conta real (após pagamento)
        if (action.params.email) {
          updateClientSession(session.phoneNumber, { email: action.params.email });
        }
        const result = await createClientAccount(session);
        if (result.success) {
          updateClientSession(session.phoneNumber, { 
            userId: result.userId,
            flowState: 'active'
          });
        }
        break;
    }
  }
  
  return results;
}

// ============================================================================
// GERADOR DE RESPOSTA COM IA
// ============================================================================

export async function generateAIResponse(session: ClientSession, userMessage: string): Promise<string> {
  try {
    const mistral = await getMistralClient();
    const systemPrompt = await getMasterPrompt(session);
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar histórico da conversa
    for (const msg of session.conversationHistory.slice(-15)) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    messages.push({ role: "user", content: userMessage });
    
    console.log(`🤖 [SALES] Gerando resposta para: "${userMessage.substring(0, 50)}..." (state: ${session.flowState})`);
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: messages,
      maxTokens: 600,
      temperature: 0.85,
    });
    
    const responseText = response.choices?.[0]?.message?.content;
    
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[SALES] Erro ao gerar resposta:", error);
    return "Desculpa, tive um problema técnico. Pode repetir?";
  }
}

// ============================================================================
// PROCESSADOR PRINCIPAL DE MENSAGENS
// ============================================================================

export interface AdminAgentResponse {
  text: string;
  mediaActions?: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }>;
  actions?: {
    sendPix?: boolean;
    notifyOwner?: boolean;
    startTestMode?: boolean;
    testAccountCredentials?: { email: string; password: string; loginUrl: string };
  };
}

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
  } catch {
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
    };
  }
}

function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  if (!triggerPhrases || triggerPhrases.length === 0) {
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const inLast = normalize(message).includes(normalize(phrase));
    const inAll = inLast ? false : normalize(allMessages).includes(normalize(phrase));
    if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
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
  
  // ═══════════════════════════════════════════════════════════════════════════
  // COMANDOS ESPECIAIS
  // ═══════════════════════════════════════════════════════════════════════════
  
  // #limpar, #reset, #novo - Limpar sessão para testes
  if (messageText.match(/^#(limpar|reset|novo)$/i)) {
    clearClientSession(cleanPhone);
    return {
      text: "✅ Sessão limpa! Agora você pode testar novamente como se fosse um cliente novo.",
      actions: {},
    };
  }
  
  // Obter ou criar sessão
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // #sair - Sair do modo de teste
  if (messageText.match(/^#sair$/i) && session.flowState === 'test_mode') {
    updateClientSession(cleanPhone, { flowState: 'post_test' });
    cancelFollowUp(cleanPhone);
    
    return {
      text: "Saiu do modo de teste! 🎭\n\nE aí, o que achou? Gostou de como o agente atendeu? 😊",
      actions: {},
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // CANCELAR FOLLOW-UP SE CLIENTE RESPONDEU
  // ═══════════════════════════════════════════════════════════════════════════
  cancelFollowUp(cleanPhone);
  
  // Buscar configurações
  const adminConfig = await getAdminAgentConfig();
  
  // Carregar histórico do banco se sessão vazia
  if (session.conversationHistory.length === 0) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      if (conversation) {
        const messages = await storage.getAdminMessages(conversation.id);
        session.conversationHistory = messages.slice(-30).map((msg: any) => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
          timestamp: msg.timestamp || new Date(),
        }));
        console.log(`📚 [SALES] ${session.conversationHistory.length} mensagens restauradas do banco`);
      }
    } catch {}
  }
  
  // Verificar trigger phrases (exceto em modo de teste)
  if (!skipTriggerCheck && session.flowState !== 'test_mode') {
    const triggerResult = checkTriggerPhrases(
      messageText,
      session.conversationHistory,
      adminConfig.triggerPhrases
    );
    
    if (!triggerResult.hasTrigger) {
      console.log(`⏸️ [SALES] Sem trigger para ${cleanPhone}`);
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
  }
  
  // Adicionar mensagem ao histórico
  addToConversationHistory(cleanPhone, "user", messageText);
  
  // Verificar comprovante de pagamento
  if (mediaType === "image" && session.awaitingPaymentProof) {
    const text = "Recebi seu comprovante! 🎉 Vou verificar e liberar sua conta. Isso leva no máximo 1 hora em horário comercial!";
    addToConversationHistory(cleanPhone, "assistant", text);
    updateClientSession(cleanPhone, { awaitingPaymentProof: false });
    
    return {
      text,
      actions: { notifyOwner: true },
    };
  }
  
  // Gerar resposta com IA
  const aiResponse = await generateAIResponse(session, messageText);
  console.log(`🤖 [SALES] Resposta: ${aiResponse.substring(0, 200)}...`);
  
  // Parse ações
  const { cleanText: textWithoutActions, actions } = parseActions(aiResponse);
  
  // Parse tags de mídia
  const { cleanText, mediaActions } = parseAdminMediaTags(textWithoutActions);
  
  // Processar mídias
  const processedMediaActions: Array<{
    type: 'send_media';
    media_name: string;
    mediaData?: AdminMedia;
  }> = [];
  
  for (const action of mediaActions) {
    const mediaData = await getAdminMediaByName(undefined, action.media_name);
    if (mediaData) {
      processedMediaActions.push({
        type: 'send_media',
        media_name: action.media_name,
        mediaData,
      });
    }
  }
  
  // Executar ações
  const actionResults = await executeActions(session, actions);
  
  // Montar texto final - incluir credenciais se houver
  let finalText = cleanText;
  
  if (actionResults.testAccountCredentials) {
    const { email, password, loginUrl, simulatorToken } = actionResults.testAccountCredentials;
    
    // Montar link do simulador de WhatsApp com token
    const baseUrl = loginUrl || process.env.APP_URL || 'https://agentezap.online';
    const simulatorLink = simulatorToken 
      ? `${baseUrl}/test/${simulatorToken}` 
      : `${baseUrl}/testar`;
    
    const credentialsBlock = `

📱 *TESTE SEU AGENTE AGORA!*

🔗 *SIMULADOR:* ${simulatorLink}

👆 Clica no link acima! Lá tem um SIMULADOR de WhatsApp igualzinho ao real!
Você conversa com SEU AGENTE e vê como ele responde! 📱

━━━━━━━━━━━━━━━━━━━━━━━━
📋 *Para acessar o painel completo:*
🔗 ${baseUrl}/login
📧 ${email}
🔑 ${password}
━━━━━━━━━━━━━━━━━━━━━━━━

⏰ Teste GRÁTIS por 24 horas!

Testa lá e me fala o que achou! 🚀`;
    
    finalText = finalText + credentialsBlock;
    console.log(`🎉 [SALES] Link do simulador + credenciais inseridos na resposta`);
  }
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", finalText);
  
  // Agendar follow-up automático (60 minutos, não 10)
  // Só agendar se não for cliente ativo
  if (session.flowState !== 'active') {
    scheduleAutoFollowUp(cleanPhone, 60, `Cliente estava em: ${session.flowState}`);
  }
  
  return {
    text: finalText,
    mediaActions: processedMediaActions.length > 0 ? processedMediaActions : undefined,
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
  } catch {
    return undefined;
  }
}

export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    // Se não tem email, gerar um fictício
    const email = session.email || generateTempEmail(session.phoneNumber);
    
    // Verificar se já existe
    const users = await storage.getAllUsers();
    const existing = users.find(u => u.email?.toLowerCase() === email.toLowerCase());
    if (existing) {
      updateClientSession(session.phoneNumber, { userId: existing.id });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuário
    const user = await storage.upsertUser({
      email: email,
      name: session.agentConfig?.company || "Cliente",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar config do agente
    if (session.agentConfig?.prompt) {
      const fullPrompt = `Você é ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- Não invente informações`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar trial de 24h
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0];
    
    if (basicPlan) {
      const trialEnd = new Date();
      trialEnd.setHours(trialEnd.getHours() + 24);
      
      await storage.createSubscription({
        userId: user.id,
        planId: basicPlan.id,
        status: "trialing",
        dataInicio: new Date(),
        dataFim: trialEnd,
      });
    }
    
    updateClientSession(session.phoneNumber, { userId: user.id, email: email });
    console.log(`✅ [SALES] Conta criada: ${email} (ID: ${user.id})`);
    
    return { userId: user.id, success: true };
  } catch (error) {
    console.error("[SALES] Erro ao criar conta:", error);
    return { userId: "", success: false, error: String(error) };
  }
}

export async function getOwnerNotificationNumber(): Promise<string> {
  const config = await storage.getSystemConfig("owner_notification_number");
  return config?.valor || "5517991956944";
}

export async function setOwnerNotificationNumber(number: string): Promise<void> {
  await storage.updateSystemConfig("owner_notification_number", number);
}

/**
 * Gera resposta de follow-up contextualizada
 */
export async function generateFollowUpResponse(phoneNumber: string, context: string): Promise<string> {
  const session = getClientSession(phoneNumber);
  if (!session) return "";
  
  try {
    const mistral = await getMistralClient();
    
    const prompt = `Você é o Rodrigo, vendedor humano da AgenteZap.
O cliente parou de responder há alguns minutos.
Contexto: ${context}
Estado do cliente: ${session.flowState}
Config coletada: ${JSON.stringify(session.agentConfig || {})}

Gere uma mensagem de follow-up CURTA e NATURAL para retomar a conversa.
Não seja insistente. Seja amigável e mostre que está disponível.
NÃO use ações [AÇÃO:...]. Apenas texto natural.`;

    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.9,
    });
    
    return response.choices?.[0]?.message?.content?.toString() || "";
  } catch {
    return "Oi! Ainda tá por aí? 😊";
  }
}

/**
 * Gera resposta para contato agendado
 */
export async function generateScheduledContactResponse(phoneNumber: string, reason: string): Promise<string> {
  const session = getClientSession(phoneNumber);
  
  try {
    const mistral = await getMistralClient();
    
    const prompt = `Você é o Rodrigo, vendedor humano da AgenteZap.
Você agendou de entrar em contato com o cliente hoje.
Motivo do agendamento: ${reason}
Estado do cliente: ${session?.flowState || 'desconhecido'}

Gere uma mensagem de retorno NATURAL e AMIGÁVEL.
Mencione que você prometeu retornar.
NÃO use ações [AÇÃO:...]. Apenas texto natural.`;

    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.9,
    });
    
    return response.choices?.[0]?.message?.content?.toString() || "Oi! Voltando como combinado 😊";
  } catch {
    return "Oi! Voltando como combinado. Tudo bem? 😊";
  }
}
