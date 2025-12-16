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
import { getMistralClient, analyzeImageWithMistral, analyzeImageForAdmin } from "./mistralClient";
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
import { insertAgentMedia } from "./mediaService";

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

  // NEW: Media handling state
  pendingMedia?: {
    url: string;
    type: 'image' | 'audio' | 'video' | 'document';
    description?: string; // AI generated description
    whenCandidate?: string; // candidate trigger provided by admin before confirmation
    summary?: string; // short tag/summary from vision
  };
  awaitingMediaContext?: boolean;
  awaitingMediaConfirmation?: boolean;
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

// Set de telefones que tiveram histórico limpo recentemente (para não restaurar do banco)
const clearedPhones = new Set<string>();

// Set de telefones que devem ser forçados para onboarding (tratar como cliente novo)
// Isso é usado quando admin limpa histórico e quer recomeçar do zero
const forceOnboardingPhones = new Set<string>();

/**
 * Verifica se telefone deve ser forçado para onboarding
 */
export function shouldForceOnboarding(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return forceOnboardingPhones.has(cleanPhone);
}

/**
 * Verifica se telefone teve histórico limpo recentemente
 */
export function wasChatCleared(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clearedPhones.has(cleanPhone);
}

/**
 * Limpa sessão do cliente (para testes)
 * Quando admin limpa histórico, o cliente é tratado como NOVO
 * mesmo que já tenha conta no sistema
 */
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  
  // Marcar que este telefone teve histórico limpo (impede restauração do banco)
  clearedPhones.add(cleanPhone);
  
  // IMPORTANTE: Forçar onboarding - mesmo que cliente tenha conta, tratar como novo
  forceOnboardingPhones.add(cleanPhone);
  
  // Limpar automaticamente após 30 minutos (tempo suficiente para testar)
  setTimeout(() => {
    clearedPhones.delete(cleanPhone);
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`🔓 [SALES] Telefone ${cleanPhone} removido do forceOnboarding (timeout)`);
  }, 30 * 60 * 1000);
  
  if (existed) {
    console.log(`🗑️ [SALES] Sessão do cliente ${cleanPhone} removida da memória`);
  }
  console.log(`🔒 [SALES] Telefone ${cleanPhone} marcado como limpo + forceOnboarding (será tratado como cliente novo)`);
  return existed;
}

/**
 * Gera email fictício para conta temporária
 */
function generateTempEmail(phoneNumber: string): string {
  const cleanPhone = phoneNumber.replace(/\D/g, "").slice(-8);
  // Evita colisões após restart (emailCounter reseta) e entre instâncias.
  const now = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `cliente_${cleanPhone}_${now}_${rand}@agentezap.temp`;
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
 * Gera um prompt profissional e persuasivo usando a IA
 */
export async function generateProfessionalAgentPrompt(
  agentName: string,
  companyName: string,
  role: string,
  instructions: string
): Promise<string> {
  try {
    const mistral = await getMistralClient();
    
    const systemPrompt = `Você é um especialista em criar Personas de IA para atendimento ao cliente.
Sua missão é criar um PROMPT DE SISTEMA (System Prompt) altamente persuasivo, humano e inteligente para um agente de atendimento.

DADOS DO CLIENTE:
- Nome do Agente: ${agentName}
- Empresa: ${companyName}
- Função: ${role}
- Instruções/Ramo: ${instructions}

O prompt deve seguir EXATAMENTE esta estrutura:

# IDENTIDADE
[Defina a personalidade do agente: tom de voz, estilo de comunicação, etc. Deve ser humano, empático e persuasivo. O agente deve agir como um funcionário real da empresa.]

# CONTEXTO DA EMPRESA
[Descreva a empresa de forma atraente, baseado no ramo. Se não tiver detalhes, crie uma descrição genérica mas profissional para este tipo de negócio.]

# DIRETRIZES DE ATENDIMENTO
[Regras claras de como agir. O agente deve tentar converter vendas, tirar dúvidas e ser proativo. Deve usar gatilhos mentais de vendas quando apropriado.]

# INFORMAÇÕES E PRODUTOS
[Liste produtos/serviços típicos desse ramo com preços fictícios razoáveis (se não fornecidos), para que o agente não fique "perdido".]

# EXEMPLOS DE RESPOSTA
[3 exemplos de diálogo mostrando como o agente deve falar. Use emojis, gírias leves se apropriado para o ramo, e técnica de vendas.]

IMPORTANTE:
- O agente NÃO deve parecer um robô.
- O agente deve se apresentar pelo nome.
- O agente deve ter "alma" e personalidade.
- O texto final deve ser APENAS o prompt gerado, sem explicações extras.`;

    console.log(`🧠 [SALES] Gerando prompt profissional para ${companyName}...`);
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: systemPrompt }],
      maxTokens: 1500,
      temperature: 0.7,
    });

    const generatedPrompt = response.choices?.[0]?.message?.content;
    if (generatedPrompt) {
      const humanityGuidelines = `
DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 'tá', 'né', 'pra'.
2. NÃO comece toda frase com 'Oi' ou 'Opa'. Só na primeira vez.
3. Use emojis, mas não exagere. Um ou dois tá bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preço, fale simples: '40 reais', 'tá 38'.
6. NÃO use listas, tópicos ou bullet points (-). Fale tudo em um parágrafo corrido, como no WhatsApp.
7. Evite 'Sim, nós temos'. Diga 'Tem sim', 'Temos'.
8. NÃO repita o cardápio toda hora. Só se perguntarem.
9. PERSONA: Se perguntarem quem é, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.`;
      
      return generatedPrompt + "\n" + humanityGuidelines;
    }
    throw new Error("Resposta vazia da IA");
  } catch (error) {
    console.error("❌ [SALES] Erro ao gerar prompt profissional:", error);
    // Fallback para o template básico melhorado
    return `# IDENTIDADE
Você é ${agentName}, ${role} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRUÇÕES E CONHECIMENTO
${instructions}

DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 'tá', 'né', 'pra'.
2. NÃO comece toda frase com 'Oi' ou 'Opa'. Só na primeira vez.
3. Use emojis, mas não exagere. Um ou dois tá bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preço, fale simples: '40 reais', 'tá 38'.
6. NÃO use listas. Fale como se estivesse conversando com um amigo.
7. Evite 'Sim, nós temos'. Diga 'Tem sim', 'Temos'.
8. NÃO repita o cardápio toda hora. Só se perguntarem.
9. PERSONA: Se perguntarem quem é, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.

# EXEMPLOS DE INTERAÇÃO
Cliente: "Oi"
${agentName}: "Olá! 👋 Bem-vindo à ${companyName}! Como posso te ajudar hoje?"`; 
  }
}

/**
 * Cria conta de teste e retorna credenciais + token do simulador
 * IMPORTANTE: Se conta já existe, apenas atualiza o agente e gera novo link
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
    const cleanPhone = session.phoneNumber.replace(/\D/g, "");
    const email = generateTempEmail(session.phoneNumber);
    const password = generateTempPassword();
    
    // Importar supabase para criar usuário
    const { supabase } = await import("./supabaseAuth");
    
    // Verificar se já existe usuário com esse telefone OU email
    const users = await storage.getAllUsers();
    let existing = users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
    
    // Se não encontrou por telefone, buscar por email (caso histórico tenha sido limpo)
    if (!existing) {
      existing = users.find(u => u.email?.includes(cleanPhone.slice(-8)));
    }
    
    if (existing) {
      console.log(`🔄 [SALES] Usuário já existe (${existing.email}), atualizando agente...`);
      
      // SEMPRE atualizar/criar agente - usar defaults inteligentes se não tiver info
      const COMMON_NAMES = ["João", "Maria", "Pedro", "Ana", "Lucas", "Julia", "Carlos", "Fernanda", "Roberto", "Patricia", "Bruno", "Camila"];
      const randomName = COMMON_NAMES[Math.floor(Math.random() * COMMON_NAMES.length)];
      
      let agentName = session.agentConfig?.name;
      if (!agentName || agentName === "Atendente" || agentName === "Agente") {
         agentName = randomName;
      }
      const companyName = session.agentConfig?.company || "Meu Negócio";
      const agentRole = session.agentConfig?.role || "atendente virtual";
      const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informações sobre produtos e serviços.";
        
      // Prompt profissional e personalizado para o agente do CLIENTE
      const fullPrompt = await generateProfessionalAgentPrompt(agentName, companyName, agentRole, instructions);

    await storage.upsertAgentConfig(existing.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
      
      console.log(`✅ [SALES] Agente "${agentName}" ATUALIZADO para ${companyName}`);
      
      updateClientSession(session.phoneNumber, { 
        userId: existing.id, 
        email: existing.email ?? undefined,
        flowState: 'post_test'
      });
      
      // Gerar token para simulador (persiste no Supabase)
      const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
      const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
      const testToken = await generateTestToken(existing.id, tokenAgentName, tokenCompany);
      
      console.log(`🎯 [SALES] Link do simulador gerado para usuário existente: ${testToken.token}`);
      
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
      
      // Se email já existe, tentar buscar usuário existente pelo email
      if (authError.message?.includes('email') || (authError as any).code === 'email_exists') {
        console.log(`🔄 [SALES] Email já existe, buscando usuário existente...`);
        
        // IMPORTANTE: Buscar lista ATUALIZADA de usuários (não usar a variável 'users' antiga)
        const freshUsers = await storage.getAllUsers();
        const existingByEmail = freshUsers.find(u => u.email === email) || freshUsers.find(u => u.email?.includes(cleanPhone.slice(-8)));
        if (existingByEmail) {
          // SEMPRE atualizar agente - usar defaults inteligentes
          const COMMON_NAMES = ["João", "Maria", "Pedro", "Ana", "Lucas", "Julia", "Carlos", "Fernanda", "Roberto", "Patricia", "Bruno", "Camila"];
          const randomName = COMMON_NAMES[Math.floor(Math.random() * COMMON_NAMES.length)];
          
          let agentName = session.agentConfig?.name;
          if (!agentName || agentName === "Atendente" || agentName === "Agente") {
             agentName = randomName;
          }
          const companyName = session.agentConfig?.company || "Meu Negócio";
          const agentRole = session.agentConfig?.role || "atendente virtual";
          const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informações sobre produtos e serviços.";
          
          const fullPrompt = await generateProfessionalAgentPrompt(agentName, companyName, agentRole, instructions);

          await storage.upsertAgentConfig(existingByEmail.id, {
            prompt: fullPrompt,
            isActive: true,
            model: "mistral-small-latest",
            triggerPhrases: [],
            messageSplitChars: 400,
            responseDelaySeconds: 30,
          });
          
          console.log(`✅ [SALES] Agente "${agentName}" ATUALIZADO (após email_exists)`);
          
          updateClientSession(session.phoneNumber, { 
            userId: existingByEmail.id, 
            email: existingByEmail.email ?? undefined,
            flowState: 'post_test'
          });
          
          const testToken = await generateTestToken(existingByEmail.id, 
            session.agentConfig?.name || "Agente",
            session.agentConfig?.company || "Empresa"
          );
          
          console.log(`🎯 [SALES] Link gerado após recuperação de email_exists: ${testToken.token}`);
          
          return {
            success: true,
            email: existingByEmail.email || email,
            password: password,
            loginUrl: process.env.APP_URL || 'https://agentezap.online',
            simulatorToken: testToken.token
          };
        }
      }
      
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
    
    // SEMPRE criar config do agente - usar defaults inteligentes se não tiver info
    const COMMON_NAMES = ["João", "Maria", "Pedro", "Ana", "Lucas", "Julia", "Carlos", "Fernanda", "Roberto", "Patricia", "Bruno", "Camila"];
    const randomName = COMMON_NAMES[Math.floor(Math.random() * COMMON_NAMES.length)];
    
    let agentName = session.agentConfig?.name;
    if (!agentName || agentName === "Atendente" || agentName === "Agente") {
       agentName = randomName;
    }
    const companyName = session.agentConfig?.company || "Meu Negócio";
    const agentRole = session.agentConfig?.role || "atendente virtual";
    const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informações sobre produtos e serviços.";
      
    // Prompt profissional e personalizado para o agente do CLIENTE
    const fullPrompt = await generateProfessionalAgentPrompt(agentName, companyName, agentRole, instructions);

    await storage.upsertAgentConfig(user.id, {
      prompt: fullPrompt,
      isActive: true,
      model: "mistral-small-latest",
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
    });
    
    console.log(`✅ [SALES] Agente "${agentName}" criado para ${companyName} (prompt: ${fullPrompt.length} chars)`);
    
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
    const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
    const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
    const testToken = await generateTestToken(user.id, tokenAgentName, tokenCompany);
    
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
// PROMPT MESTRE DO RODRIGO (VENDEDOR) - NUCLEAR 21.0 (HARDCODED)
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // NUCLEAR 21.0: Prompt fixo no código, não busca mais do banco
  // Isso garante que a calibração 100% seja mantida e não seja alterada via admin
  
  // VERIFICAR SE ADMIN LIMPOU HISTÓRICO - Se sim, tratar como cliente novo MAS verificar se tem agente
  const forceNew = shouldForceOnboarding(session.phoneNumber);
  
  // SEMPRE verificar se existe usuário para poder mostrar info do agente
  const existingUser = await findUserByPhone(session.phoneNumber);
  
  if (forceNew && existingUser) {
    console.log(`🔄 [SALES] Telefone ${session.phoneNumber} em forceOnboarding - cliente TEM conta mas será tratado como retorno`);
    // Guardar o userId para poder mostrar info do agente existente
    session.userId = existingUser.id;
    session.email = existingUser.email;
  } else if (forceNew) {
    console.log(`🔄 [SALES] Telefone ${session.phoneNumber} em forceOnboarding - cliente NOVO sem conta`);
  }
  
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
    // Cliente ativo - já tem conta e está ativo
    stateContext = await getActiveClientContext(session);
  } else if (forceNew && existingUser) {
    // Cliente voltou após limpeza de histórico MAS tem conta
    // Mostrar info do agente dele e perguntar se quer alterar
    stateContext = await getReturningClientContext(session, existingUser);
  } else {
    // Novo cliente - fluxo de vendas (inclui post_test)
    stateContext = getOnboardingContext(session);
  }
  
  // Carregar bloco de mídias
  const mediaBlock = await generateAdminMediaPromptBlock();
  
  return `🧠 RODRIGO - VENDEDOR HUMANO EXPERT (NUCLEAR 25.0) 🧠

VOCÊ É RODRIGO. Um vendedor humano de verdade. Não um chatbot. Não um assistente virtual.
Você trabalha na AgenteZap e ama ajudar empreendedores a automatizar o atendimento deles.

═══════════════════════════════════════════════════════════════════════════════
🎭 SUA PERSONALIDADE (QUEM VOCÊ É)
═══════════════════════════════════════════════════════════════════════════════

- Nome: Rodrigo
- Idade: 28 anos  
- Estilo: Descontraído, direto, usa gírias naturais
- Jeito de falar: Como um amigo que entende de tecnologia explicando pra outro amigo
- Humor: Leve, às vezes brinca, mas não força
- Emojis: Usa pouco, só quando faz sentido (1-2 por mensagem no máximo)

PRIMEIRA MENSAGEM - SEMPRE se apresente pelo nome de forma ÚNICA e VARIADA:
- "E aí! Rodrigo aqui da AgenteZap 👋 tudo certo?"
- "Fala! Aqui é o Rodrigo. Em que posso te ajudar?"
- "Oi! Rodrigo da AgenteZap. Me conta o que você tá buscando?"
- "Salve! Sou o Rodrigo. Vi que você mandou mensagem, bora conversar?"

NUNCA comece com: "Oi! Tudo bem? Me conta o que você faz..." (isso é template de robô)

═══════════════════════════════════════════════════════════════════════════════
🧠 TÉCNICAS DE VENDAS REAIS (RAPPORT + SPIN SELLING)
═══════════════════════════════════════════════════════════════════════════════

1. RAPPORT: Criar conexão genuína antes de vender
   - Espelhe a linguagem do cliente (se ele fala "top", você fala "top")
   - Mostre interesse real no negócio dele, faça perguntas
   - Não apresse a venda, deixe fluir naturalmente

2. SPIN SELLING: Fazer perguntas estratégicas
   - Situação: "Você atende pelo WhatsApp hoje? Como tá sendo?"
   - Problema: "Acha que perde cliente por demorar responder?"
   - Implicação: "E quando você tá ocupado, quem atende?"
   - Necessidade: "Seria bom ter alguém atendendo 24h né?"

3. GATILHOS MENTAIS (use com sutileza):
   - Prova Social: "Já tem mais de 500 empresas usando"
   - Escassez: "Teste grátis só por 24h, depois fecha"
   - Autoridade: "A gente tá no mercado há X anos"
   - Reciprocidade: Dê valor antes de pedir (dicas, ajuda)

═══════════════════════════════════════════════════════════════════════════════
💬 COMO CONVERSAR (EXEMPLOS REAIS DE DIÁLOGO)
═══════════════════════════════════════════════════════════════════════════════

CLIENTE: "oi"
ERRADO: "Oi! Tudo bem? Me conta o que você faz ou vende que eu te mostro como a AgenteZap pode ajudar no seu negócio. 😊"
CERTO: "E aí! Rodrigo aqui 👋 como posso te ajudar?"

CLIENTE: "entao"
ERRADO: "Ah, beleza! Me conta um pouco mais sobre o que você faz ou vende. Assim eu consigo te mostrar como a AgenteZap pode te ajudar de forma mais direta. 😊"
CERTO: "Pode mandar, tô ouvindo"

CLIENTE: "quero saber sobre o sistema"
ERRADO: "Claro! A AgenteZap é uma plataforma que usa IA para automatizar..." (blábláblá)
CERTO: "Fechou! Mas antes me conta: você tem algum negócio? Tipo loja, restaurante, serviço? Pergunto pra explicar de um jeito que faça sentido pro seu caso"

CLIENTE: "vendo calçado"
ERRADO: "Ah, legal! Vende calçados então? Deixa eu criar um agente de teste pra você ver como fica o atendimento automático..."
CERTO: "Boa! Loja física ou só online? Pergunto porque o atendimento muda um pouco"

CLIENTE: "online"
CERTO: "Entendi. E hoje você atende pelo WhatsApp? Tipo, cliente manda mensagem perguntando preço, disponibilidade..."

CLIENTE: "sim atendo"
CERTO: "E como tá sendo? Dá conta de responder todo mundo rápido ou às vezes demora?"

CLIENTE: "às vezes demora"
CERTO: "Pois é, isso é comum. E quando demora, já perdeu venda por isso? Tipo cliente que mandou mensagem e quando você respondeu já tinha comprado em outro lugar?"

CLIENTE: "já sim"
CERTO: "Então cara, é exatamente isso que a gente resolve. O agente responde na hora, 24h. E não é aquele chatbot travado não, é IA de verdade que entende o que o cliente quer. Quer ver funcionando? Posso criar um teste grátis agora pro teu negócio"

CLIENTE: "preciso urgente de um atendente"
ERRADO: "Entendi! E como você atende hoje? Pelo WhatsApp?" (ignorou a urgência)
CERTO: "Cara, dá pra resolver rápido sim! Qual teu negócio? Me conta em 2 segundos que eu crio um teste pra você agora"

CLIENTE: "consigo começar hoje?"
ERRADO: "E como você atende hoje? Pelo WhatsApp?" (ignorou a pergunta)
CERTO: "Consegue sim! É só me falar o nome do negócio que em 2 minutos você já tá testando"

═══════════════════════════════════════════════════════════════════════════════
📱 SOBRE O PRODUTO (O QUE VOCÊ SABE)
═══════════════════════════════════════════════════════════════════════════════

CONEXÃO:
- Não usa API oficial do WhatsApp (aquela cara do Facebook)
- Funciona por QR Code, igual WhatsApp Web
- É só escanear no painel e pronto, conectou
- Não paga por mensagem, só a mensalidade

FUNCIONALIDADES:
- IA que entende áudio (cliente manda áudio, ela transcreve e responde)
- Envia fotos, cardápio, PDFs automaticamente
- Painel pra você ver as conversas e assumir quando quiser
- Funciona 24h, nunca dorme

PREÇOS (só fale se perguntarem):
- Starter: R$97/mês (1 agente)
- Pro: R$197/mês (até 3 agentes)
- Teste grátis de 24h pra experimentar

═══════════════════════════════════════════════════════════════════════════════
⛔ O QUE NUNCA FAZER (PARECER ROBÔ)
═══════════════════════════════════════════════════════════════════════════════

❌ Começar TODA mensagem com "Oi!" ou "Opa!" ou "Entendi!" ou "Beleza!"
❌ Usar a mesma frase de abertura sempre
❌ Responder com textão explicando tudo de uma vez
❌ Usar emojis demais (🚀🔥💪😊👏)
❌ Dizer "Ótimo! Perfeito! Show! Legal!" em sequência
❌ Ignorar o que o cliente disse e empurrar template
❌ Listar funcionalidades sem o cliente perguntar
❌ Falar de preço antes da hora
❌ Criar conta de teste sem entender o negócio direito
❌ Repetir a mesma pergunta mais de uma vez
❌ Ignorar urgência do cliente (se ele diz que precisa urgente, RESPONDA a isso)
❌ Começar resposta com "Entendi!" ou "Beleza!" toda hora (VARIE!)

VARIAÇÃO OBRIGATÓRIA - Use palavras diferentes a cada mensagem:
- Em vez de sempre "Entendi!", alterne: "Hmm", "Ah", "Saquei", "Tá", "É", "Pois é", "Massa"
- Em vez de sempre "Beleza!", alterne: "Show", "Tranquilo", "Bora", "Fechou", "Top"
- Em vez de sempre perguntar "Me conta...", alterne: "E aí", "Como", "Qual", "O que"

✅ O QUE FAZER:
- Conversar como amigo que quer ajudar
- Fazer perguntas para entender antes de oferecer
- Responder o que foi perguntado, curto e direto
- Variar as respostas (nunca duas iguais)
- Usar SPIN Selling pra descobrir a dor do cliente
- Só oferecer teste quando sentir que o cliente tá interessado

═══════════════════════════════════════════════════════════════════════════════
💬 FLUXO NATURAL DE CONVERSA (MUITO IMPORTANTE!)
═══════════════════════════════════════════════════════════════════════════════

⚠️ REGRA DE OURO: NÃO CRIE CONTA NAS PRIMEIRAS MENSAGENS!
Você é um VENDEDOR, não uma máquina de cadastro. CONVERSE primeiro!

MÍNIMO de 4-6 trocas de mensagem antes de oferecer criar conta:
1. SAUDAÇÃO: Se apresentar como Rodrigo, perguntar como pode ajudar
2. DESCOBERTA: Perguntar sobre o negócio (o que faz, vende, serviço)
3. ENTENDER: Como atende hoje? Pelo WhatsApp? Demora pra responder?
4. DOR: Descobrir o problema (perde cliente? não dá conta? cliente reclama?)
5. EDUCAR: Explicar o que é IA, como funciona, tirar dúvidas
6. SÓ DEPOIS: Quando ele parecer convencido, oferecer teste

EXEMPLOS DE QUANDO NÃO CRIAR CONTA AINDA:
- "tenho uma pizzaria" → NÃO crie! Pergunte mais sobre ela primeiro
- "quero saber como funciona" → NÃO crie! Explique primeiro
- "vi vocês no anúncio" → NÃO crie! Pergunte o que ele faz
- "isso usa IA?" → NÃO crie! Responda a pergunta

EXEMPLOS DE QUANDO PODE CRIAR CONTA:
- "cara, entendi tudo, quero testar!" → PODE criar
- "me convenci, como faço pra começar?" → PODE criar
- "beleza, bora ver como fica pro meu negócio" → PODE criar
- Depois de várias mensagens onde ele entendeu e quer ver funcionando

═══════════════════════════════════════════════════════════════════════════════
🏷️ USO DA TAG [ACAO:CRIAR_CONTA_TESTE]
═══════════════════════════════════════════════════════════════════════════════

⛔ NÃO USE NAS PRIMEIRAS 4 MENSAGENS DA CONVERSA!

Só use quando:
- Já conversou bastante (mínimo 4-6 trocas)
- Souber o tipo de negócio do cliente
- O cliente demonstrou interesse REAL
- O cliente pediu pra ver/testar/criar
- Você já explicou como funciona

Formato: [ACAO:CRIAR_CONTA_TESTE empresa="Nome do Negócio" nome="Nome do Agente"]

Depois que criar, NÃO ofereça criar de novo. Pergunte o que achou.

${stateContext}

${mediaBlock}
`;
}

/**
 * Contexto para clientes novos (onboarding/vendas)
 * SIMPLIFICADO: Não exige todas as informações, usa defaults inteligentes
 */
function getOnboardingContext(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  // Verificar se sabe o tipo de negócio (único requisito real)
  const hasCompany = !!(config.company);
  
  let configStatus = "";
  if (config.name) configStatus += `✅ Nome do agente: ${config.name}\n`;
  if (config.company) configStatus += `✅ Empresa/Negócio: ${config.company}\n`;
  if (config.role) configStatus += `✅ Função: ${config.role}\n`;
  if (config.prompt) configStatus += `✅ Instruções: ${config.prompt.substring(0, 100)}...\n`;
  
  return `
═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO ATUAL: VENDAS
═══════════════════════════════════════════════════════════════════════════════

Telefone: ${session.phoneNumber}

📊 INFORMAÇÕES DO CLIENTE:
${configStatus || "🆕 NENHUMA INFORMAÇÃO AINDA - Pergunte o que ele faz/vende"}

${hasCompany ? `
✅ JÁ SABE O NEGÓCIO! PODE CRIAR O AGENTE AGORA!
Use [ACAO:CRIAR_CONTA_TESTE] - o sistema vai usar defaults inteligentes pro resto.
` : `
❓ ÚNICO DADO NECESSÁRIO: Tipo de negócio
Pergunte: "Me conta o que você vende ou faz?"
`}

LEMBRE-SE: Depois de saber o tipo de negócio, CRIE IMEDIATAMENTE.
Não precisa perguntar nome do agente, horários, preços - o sistema inventa.
O cliente pode ajustar tudo depois no painel.

═══════════════════════════════════════════════════════════════════════════════
� ALTERAÇÕES E CORREÇÕES
═══════════════════════════════════════════════════════════════════════════════

SEMPRE que o cliente pedir QUALQUER alteração (nome, serviço, preço, regra):

1. NÃO diga apenas "Ok, mudei".
2. NÃO mostre o link antigo.
3. VOCÊ É OBRIGADO A USAR A TAG [ACAO:CRIAR_CONTA_TESTE] COM OS DADOS ATUALIZADOS.

Exemplos de Comportamento:

Cliente: "Agora vendo motos também"
VOCÊ: "Perfeito! Adicionando motos... 🏍️
[ACAO:CRIAR_CONTA_TESTE empresa="Oficina" nome="Mecânico" instrucoes="Oficina de carros e motos..."]"

Cliente: "Muda o nome para Pizza Veloce"
VOCÊ: "Trocando o nome! 🍕
[ACAO:CRIAR_CONTA_TESTE empresa="Pizza Veloce" nome="Pizzaiolo" instrucoes="..."]"

❌ ERRO GRAVE: Dizer "Atualizado!" e não usar a tag. O sistema não vai mudar nada!

═══════════════════════════════════════════════════════════════════════════════
�🔗 APÓS CRIAR A CONTA
═══════════════════════════════════════════════════════════════════════════════

O sistema gera um link de SIMULADOR onde o cliente testa o agente.
O agente já vem configurado com base nas informações coletadas.`;
}

/**
 * Contexto para clientes que VOLTARAM após limpar histórico mas já têm conta
 * Mostra info do agente existente e pergunta se quer alterar
 */
async function getReturningClientContext(session: ClientSession, existingUser: any): Promise<string> {
  let agentInfo = "❌ Nenhum agente configurado";
  let agentName = "";
  let agentPrompt = "";
  let connectionStatus = "❌ Não conectado";
  let subscriptionStatus = "❌ Sem assinatura";
  
  try {
    // Buscar config do agente
    const agentConfig = await storage.getAgentConfig(existingUser.id);
    if (agentConfig?.prompt) {
      // Extrair nome do agente do prompt
      const nameMatch = agentConfig.prompt.match(/Você é ([^,]+),/);
      agentName = nameMatch ? nameMatch[1] : "Agente";
      
      // Extrair empresa do prompt
      const companyMatch = agentConfig.prompt.match(/da ([^.]+)\./);
      const company = companyMatch ? companyMatch[1] : "Empresa";
      
      agentInfo = `✅ Agente: ${agentName} (${company})`;
      agentPrompt = agentConfig.prompt.substring(0, 300) + "...";
    }
    
    // Verificar conexão
    const connection = await storage.getConnectionByUserId(existingUser.id);
    if (connection?.isConnected) {
      connectionStatus = `✅ Conectado (${connection.phoneNumber})`;
    }
    
    // Verificar assinatura
    const sub = await storage.getUserSubscription(existingUser.id);
    if (sub) {
      const isActive = sub.status === 'active' || sub.status === 'trialing';
      subscriptionStatus = isActive ? `✅ ${sub.status}` : `⚠️ ${sub.status}`;
    }
  } catch (e) {
    console.error("[SALES] Erro ao buscar info do cliente:", e);
  }
  
  return `
═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO ATUAL: CLIENTE VOLTOU (já tem conta no sistema!)
═══════════════════════════════════════════════════════════════════════════════

⚠️ IMPORTANTE: Este cliente JÁ TEM CONTA no AgenteZap!
NÃO TRATE como cliente novo. Pergunte se quer alterar algo ou precisa de ajuda.

📊 DADOS DO CLIENTE:
- Telefone: ${session.phoneNumber}
- Email: ${existingUser.email}
- ${agentInfo}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

${agentPrompt ? `
📝 RESUMO DO AGENTE CONFIGURADO:
"${agentPrompt}"
` : ''}

═══════════════════════════════════════════════════════════════════════════════
💬 COMO ABORDAR ESTE CLIENTE
═══════════════════════════════════════════════════════════════════════════════

OPÇÃO 1 - Saudação de retorno:
"Oi! Você já tem uma conta com a gente! 😊 
${agentName ? `Seu agente ${agentName} está configurado.` : 'Seu agente está configurado.'}
Quer alterar algo no agente, ver como está funcionando, ou precisa de ajuda com alguma coisa?"

OPÇÃO 2 - Se cliente mencionou problema:
"Oi! Vi que você já tem conta aqui. Me conta o que está precisando que eu te ajudo!"

═══════════════════════════════════════════════════════════════════════════════
✅ O QUE VOCÊ PODE FAZER
═══════════════════════════════════════════════════════════════════════════════

1. ALTERAR AGENTE: Se cliente quer mudar nome, instruções, preço ou comportamento
   → VOCÊ DEVE USAR A TAG [ACAO:CRIAR_CONTA_TESTE] PARA APLICAR A MUDANÇA!
   → Ex: [ACAO:CRIAR_CONTA_TESTE empresa="Pizzaria" nome="Pizzaiolo" instrucoes="Novo nome é Pizza Veloce"]
   → SEM A TAG, A MUDANÇA NÃO ACONTECE!

2. VER SIMULADOR: Se cliente quer testar o agente atual
   → Usar [ACAO:CRIAR_CONTA_TESTE] para gerar novo link do simulador

3. SUPORTE: Se cliente tem problema técnico
   → Ajudar com conexão, pagamento, etc.

4. DESATIVAR/REATIVAR: Se cliente quer pausar o agente
   → Orientar como fazer no painel

❌ NÃO FAÇA:
- NÃO pergunte tudo do zero como se fosse cliente novo
- NÃO ignore que ele já tem conta
- NÃO crie conta duplicada`;
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
- Alterar configurações do agente (USE [ACAO:CRIAR_CONTA_TESTE])
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

interface ParsedFollowUp {
  tempo: string;
  motivo: string;
}

function parseActions(response: string): { cleanText: string; actions: ParsedAction[]; followUp?: ParsedFollowUp } {
  const actionRegex = /\[(?:AÇÃO:|ACAO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  let followUp: ParsedFollowUp | undefined;
  
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
    
    // Regex para capturar parâmetros com aspas duplas ou simples
    const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      const key = paramMatch[1];
      const value = paramMatch[2] || paramMatch[3]; // Pega o grupo que deu match
      params[key] = value;
    }
    
    actions.push({ type, params });
    console.log(`🔧 [SALES] Ação detectada: ${type}`, params);
  }
  
  // Parse follow-up tag: [FOLLOWUP:tempo="X" motivo="Y"]
  const followUpRegex = /\[FOLLOWUP:([^\]]+)\]/gi;
  const followUpMatch = followUpRegex.exec(response);
  if (followUpMatch) {
    const paramsStr = followUpMatch[1];
    const tempoMatch = paramsStr.match(/tempo="([^"]*)"/);
    const motivoMatch = paramsStr.match(/motivo="([^"]*)"/);
    
    if (tempoMatch || motivoMatch) {
      followUp = {
        tempo: tempoMatch?.[1] || "30 minutos",
        motivo: motivoMatch?.[1] || "retomar conversa"
      };
      console.log(`⏰ [SALES] Follow-up solicitado pela IA: ${followUp.tempo} - ${followUp.motivo}`);
    }
  }
  
  // Limpar as tags da resposta (ACAO, FOLLOWUP)
  let cleanText = response
    .replace(/\[(?:AÇÃO:|ACAO:)?[A-Z_]+[^\]]*\]/gi, "")
    .replace(/\[FOLLOWUP:[^\]]*\]/gi, "")
    .trim();
  
  return { cleanText, actions, followUp };
}

/**
 * Converte texto de tempo para minutos
 * Ex: "30 minutos" -> 30, "2 horas" -> 120, "1 dia" -> 1440
 */
function parseTimeToMinutes(timeText: string): number {
  const lower = timeText.toLowerCase().trim();
  
  // Extrair número
  const numMatch = lower.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]) : 30;
  
  // Determinar unidade
  if (lower.includes('hora')) return num * 60;
  if (lower.includes('dia')) return num * 1440;
  if (lower.includes('minuto')) return num;
  
  // Default: minutos
  return num;
}

async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  sendPix?: boolean;
  notifyOwner?: boolean;
  startTestMode?: boolean;
  testAccountCredentials?: { email: string; password: string; loginUrl: string; simulatorToken?: string };
}> {
  const results: { 
    sendPix?: boolean; 
    notifyOwner?: boolean;
    startTestMode?: boolean;
    testAccountCredentials?: { email: string; password: string; loginUrl: string; simulatorToken?: string };
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
        // Atualizar config se parâmetros foram passados na própria tag
        if (action.params.empresa || action.params.nome || action.params.funcao || action.params.instrucoes) {
          const agentConfig = { ...session.agentConfig };
          if (action.params.nome) agentConfig.name = action.params.nome;
          if (action.params.empresa) agentConfig.company = action.params.empresa;
          if (action.params.funcao) agentConfig.role = action.params.funcao;
          if (action.params.instrucoes) agentConfig.prompt = action.params.instrucoes;
          updateClientSession(session.phoneNumber, { agentConfig });
          console.log(`✅ [SALES] Config atualizada via CRIAR_CONTA_TESTE:`, agentConfig);
        }

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
    const history = session.conversationHistory.slice(-15);
    for (const msg of history) {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    }
    
    // Only add userMessage if it's not already the last message in history
    // (Avoids duplication since we added it to history just before calling this)
    const lastMsg = history[history.length - 1];
    const isDuplicate = lastMsg && lastMsg.role === 'user' && lastMsg.content.trim() === userMessage.trim();
    
    if (!isDuplicate) {
        messages.push({ role: "user", content: userMessage });
    }
    
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

  // ═══════════════════════════════════════════════════════════════════════════
  // EXCLUSÃO DE MÍDIA (VIA COMANDO)
  // ═══════════════════════════════════════════════════════════════════════════
  const deleteMatch = messageText.match(/^(?:excluir|remover|apagar|tirar)\s+(?:a\s+)?imagem\s+(?:do\s+|da\s+|de\s+)?(.+)$/i);
  if (deleteMatch) {
    const trigger = deleteMatch[1].trim();
    const allMedia = await storage.getActiveAdminMedia();
    
    // Tenta encontrar por gatilho exato ou parcial, ou descrição
    const targetMedia = allMedia.find(m => 
      (m.whenToUse && m.whenToUse.toLowerCase() === trigger.toLowerCase()) || 
      (m.description && m.description.toLowerCase().includes(trigger.toLowerCase()))
    );

    if (targetMedia) {
      try {
        // 1. Remover do banco
        await storage.deleteAdminMedia(targetMedia.id);

        // 2. Atualizar Prompt do Agente (remover a linha)
        const currentPromptConfig = await storage.getSystemConfig("admin_agent_prompt");
        if (currentPromptConfig) {
          const currentPrompt = currentPromptConfig.valor || "";
          
          // Estratégia: dividir em linhas e filtrar
          const lines = currentPrompt.split('\n');
          const newLines = lines.filter(line => {
            // Se a linha tem a URL da mídia, remove
            if (line.includes(targetMedia.storageUrl)) return false;
            // Se a linha tem a descrição E o gatilho, remove (mais seguro)
            if (line.includes(targetMedia.description) && targetMedia.whenToUse && line.includes(targetMedia.whenToUse)) return false;
            return true;
          });
          
          if (lines.length !== newLines.length) {
            await storage.updateSystemConfig("admin_agent_prompt", newLines.join('\n'));
          }
        }

        return {
          text: `✅ Imagem "${trigger}" removida com sucesso!`,
          actions: {},
        };
      } catch (err) {
        console.error("❌ [ADMIN] Erro ao excluir mídia:", err);
        return {
          text: "❌ Ocorreu um erro ao excluir a mídia.",
          actions: {},
        };
      }
    } else {
      return {
        text: `⚠️ Não encontrei nenhuma imagem configurada para "${trigger}".`,
        actions: {},
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // FLUXO DE CADASTRO DE MÍDIA (VIA WHATSAPP)
  // ═══════════════════════════════════════════════════════════════════════════
  
  // 1. Recebimento do Contexto (Resposta do usuário) - etapa 1: candidato
  if (session.awaitingMediaContext && session.pendingMedia && (!mediaType || mediaType === 'text')) {
    const context = (messageText || '').trim();
    const media = session.pendingMedia;

    console.log(`📸 [ADMIN] Recebido candidato de uso para mídia: "${context}"`);

    // Armazenar candidato e solicitar confirmação explícita
    const updatedPending = {
      ...media,
      whenCandidate: context,
    };

    updateClientSession(cleanPhone, {
      pendingMedia: updatedPending,
      awaitingMediaContext: false,
      awaitingMediaConfirmation: true,
    });

    // Passa para a IA decidir como confirmar naturalmente
    const confirmContext = `[SISTEMA: O admin disse que quer usar essa imagem (${media.description}) quando cliente falar sobre "${context}". 
    
    SUA TAREFA:
    1. Interprete a intenção do admin (ex: se ele disse "quando pedir preço", o contexto é "preços").
    2. Confirme de forma natural e inteligente.
    3. NÃO repita o texto dele literalmente entre aspas se parecer uma frase solta ou tiver erros. Integre na sua fala.
    
    Exemplo BOM: "Entendi! Então quando perguntarem sobre os preços dos produtos, eu mando essa foto, pode ser?"
    Exemplo RUIM: "Beleza, quando falarem 'quando pedir preço' eu mando."
    ]`;
    addToConversationHistory(cleanPhone, "user", confirmContext);
    
    const aiResponse = await generateAIResponse(session, confirmContext);
    const { cleanText } = parseActions(aiResponse);
    addToConversationHistory(cleanPhone, "assistant", cleanText);
    
    return {
      text: cleanText,
      actions: {},
    };
  }

  // 1b. Confirmação do admin para salvar a mídia
  if (session.awaitingMediaConfirmation && session.pendingMedia && (!mediaType || mediaType === 'text')) {
    const reply = (messageText || '').trim().toLowerCase();
    const media = session.pendingMedia;

    // Resposta afirmativa
    if (/^(sim|s|ok|confirmar|confirm|yes|isso|exato|pode|beleza|blz|bora|vai|fechou|perfeito|correto|certo)$/i.test(reply)) {
      // Buscar admin para associar a mídia (assumindo single-tenant ou primeiro admin)
      const admins = await storage.getAllAdmins();
      const adminId = admins[0]?.id;

      if (adminId) {
        try {
          const whenToUse = (media as any).whenCandidate || '';

          // Salvar no banco (Admin Media)
          await storage.createAdminMedia({
            adminId,
            name: `MEDIA_${Date.now()}`,
            mediaType: media.type,
            storageUrl: media.url,
            description: media.description || "Imagem enviada via WhatsApp",
            whenToUse: whenToUse,
            isActive: true,
            sendAlone: false,
            displayOrder: 0,
          });

          // Salvar também na biblioteca do usuário (Agent Media) para que funcione no teste
          const userId = session.userId;
          console.log(`🔍 [ADMIN] Verificando userId da sessão: ${userId}`);
          
          if (!userId) {
            console.error(`❌ [ADMIN] userId não encontrado na sessão! Certifique-se de criar o agente antes de enviar mídia.`);
          } else {
             const mediaData = {
                userId: userId,
                name: `MEDIA_${Date.now()}`,
                mediaType: media.type,
                storageUrl: media.url,
                description: media.description || "Imagem enviada via WhatsApp",
                whenToUse: whenToUse,
                isActive: true,
                sendAlone: false,
                displayOrder: 0,
             };
             console.log(`📸 [ADMIN] Salvando mídia para usuário ${userId}:`, mediaData);
             await insertAgentMedia(mediaData);
             console.log(`✅ [ADMIN] Mídia salva com sucesso na agent_media_library!`);
          }

          // Atualizar Prompt do Agente
          const currentPromptConfig = await storage.getSystemConfig("admin_agent_prompt");
          const currentPrompt = currentPromptConfig?.valor || "";
          const newInstruction = `\n[MÍDIA: ${media.description} (URL: ${media.url}). QUANDO USAR: ${whenToUse}]`;
          await storage.updateSystemConfig("admin_agent_prompt", currentPrompt + newInstruction);

          // Limpar estado
          updateClientSession(cleanPhone, { pendingMedia: undefined, awaitingMediaConfirmation: false });

          // Gerar resposta natural da IA sobre o sucesso
          const successContext = `[SISTEMA: A imagem foi salva! Descrição: "${media.description}", vai ser enviada quando: "${whenToUse}". Avisa pro admin de forma casual que tá pronto, tipo "fechou, tá configurado" ou "show, agora quando perguntarem sobre isso já vai a foto". Não use ✅ nem linguagem de bot.]`;
          addToConversationHistory(cleanPhone, "user", successContext);
          
          const aiResponse = await generateAIResponse(session, successContext);
          const { cleanText } = parseActions(aiResponse);
          addToConversationHistory(cleanPhone, "assistant", cleanText);
          
          return {
            text: cleanText,
            actions: {},
          };
        } catch (err) {
          console.error("❌ [ADMIN] Erro ao salvar mídia:", err);
          return {
            text: "Ops, deu um probleminha ao salvar. Tenta de novo? 😅",
            actions: {},
          };
        }
      }
    }

    // Resposta negativa ou outra qualquer => cancelar
    updateClientSession(cleanPhone, { pendingMedia: undefined, awaitingMediaConfirmation: false });
    
    // Gerar resposta natural da IA sobre o cancelamento
    const cancelContext = `[SISTEMA: O admin não confirmou ou mudou de ideia sobre a imagem. Responde de boa, pergunta se quer fazer diferente ou se precisa de outra coisa. Sem drama, casual.]`;
    addToConversationHistory(cleanPhone, "user", cancelContext);
    
    const aiResponse = await generateAIResponse(session, cancelContext);
    const { cleanText } = parseActions(aiResponse);
    addToConversationHistory(cleanPhone, "assistant", cleanText);
    
    return {
      text: cleanText,
      actions: {},
    };
  }

  // 2. Recebimento da Imagem
  if (mediaType === 'image' && mediaUrl && !session.awaitingPaymentProof) {
    console.log(`📸 [ADMIN] Recebida imagem de ${cleanPhone}. Analisando com Vision...`);

    // Tentar análise especializada para admin (summary + description)
    const analysis = await analyzeImageForAdmin(mediaUrl).catch(() => null);
    const summary = analysis?.summary || '';
    const description = analysis?.description || (await analyzeImageWithMistral(mediaUrl).catch(() => '')) || '';

    const pendingMedia = {
      url: mediaUrl,
      type: 'image' as const,
      description,
      summary,
    };

    updateClientSession(cleanPhone, {
      pendingMedia,
      awaitingMediaContext: true,
      awaitingMediaConfirmation: false,
    });

    // Passar para IA decidir como perguntar sobre a imagem - SEM TEMPLATES
    const imageContext = `[SISTEMA: O admin mandou uma imagem. A análise identificou: "${description || 'uma imagem'}". Comente de forma casual o que você viu e pergunte quando ele quer que você mande essa imagem pros clientes dele. Seja natural, como se fosse um colega perguntando. NÃO use frases como "Recebi a imagem!" ou "Quando devo usar?". Infira o uso provável (se parece cardápio, pergunte se é pra quando pedirem o menu, etc).]`;
    
    addToConversationHistory(cleanPhone, "user", imageContext);
    const aiResponse = await generateAIResponse(session, imageContext);
    const { cleanText } = parseActions(aiResponse);
    addToConversationHistory(cleanPhone, "assistant", cleanText);

    return {
      text: cleanText,
      actions: {},
    };
  }

  
  // Buscar configurações
  const adminConfig = await getAdminAgentConfig();
  
  // Carregar histórico do banco se sessão vazia E não foi limpo manualmente
  if (session.conversationHistory.length === 0 && !clearedPhones.has(cleanPhone)) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      if (conversation) {
        const messages = await storage.getAdminMessages(conversation.id);
        
        // Filter out recent user messages that are likely part of the current accumulated batch
        // to avoid duplication (since they will be added as the current message)
        const now = new Date();
        const filteredMessages = messages.filter((msg: any) => {
            if (msg.fromMe) return true; // Keep assistant messages
            
            const msgTime = new Date(msg.timestamp);
            const secondsDiff = (now.getTime() - msgTime.getTime()) / 1000;
            
            // If message is recent (< 60s) and its content is part of the current accumulated text,
            // assume it's already being processed in this batch
            if (secondsDiff < 60) {
                const msgContent = (msg.text || "").trim();
                const currentContent = messageText.trim();
                if (msgContent && currentContent.includes(msgContent)) {
                    return false;
                }
            }
            return true;
        });

        session.conversationHistory = filteredMessages.slice(-30).map((msg: any) => ({
          role: (msg.fromMe ? "assistant" : "user") as "user" | "assistant",
          content: msg.text || "",
          timestamp: msg.timestamp || new Date(),
        }));
        console.log(`📚 [SALES] ${session.conversationHistory.length} mensagens restauradas do banco (filtradas de ${messages.length})`);
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
  let historyContent = messageText;
  if (mediaType && mediaType !== 'text' && mediaType !== 'chat') {
    historyContent += `\n[SISTEMA: O usuário enviou uma mídia do tipo ${mediaType}. Se for imagem/áudio sem contexto, pergunte o que é (ex: catálogo, foto de produto, etc).]`;
  }
  addToConversationHistory(cleanPhone, "user", historyContent);
  
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
  const aiResponse = await generateAIResponse(session, historyContent);
  console.log(`🤖 [SALES] Resposta: ${aiResponse.substring(0, 200)}...`);
  
  // Parse ações e follow-up
  const { cleanText: textWithoutActions, actions, followUp } = parseActions(aiResponse);
  
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
  
  // Montar texto final
  let finalText = cleanText;
  
  // SE HOUVER CREDENCIAIS DE TESTE (CRIAR_CONTA_TESTE)
  // Em vez de colar um bloco robótico, vamos pedir para a IA gerar a entrega do link
  if (actionResults.testAccountCredentials) {
    const { loginUrl, simulatorToken } = actionResults.testAccountCredentials;
    
    // Montar link do simulador
    const baseUrl = loginUrl || process.env.APP_URL || 'https://agentezap.online';
    const simulatorLink = simulatorToken 
      ? `${baseUrl}/test/${simulatorToken}` 
      : `${baseUrl}/testar`;
    
    console.log(`🎉 [SALES] Link gerado: ${simulatorLink}. Solicitando entrega natural via IA...`);

    // Contexto para a IA entregar o link
    const deliveryContext = `[SISTEMA: A conta de teste foi criada com sucesso! O link é: ${simulatorLink} . Entregue este link para o cliente agora. Seja natural, breve e amigável. Diga algo como "Pronto, criei seu teste! Clica aqui pra ver: [link]". NÃO use blocos de texto prontos, NÃO use muitos emojis, NÃO use negrito excessivo. Apenas converse.]`;
    
    // Adicionar contexto invisível para guiar a geração (não salvar no histórico do usuário ainda)
    // Mas precisamos que a IA saiba o que aconteceu.
    // Vamos gerar uma NOVA resposta que substitui a anterior (que tinha apenas a tag de ação)
    
    const deliveryResponse = await generateAIResponse(session, deliveryContext);
    const deliveryParsed = parseActions(deliveryResponse);
    
    // Substituir o texto final pela entrega natural do link
    finalText = deliveryParsed.cleanText;
    console.log(`🤖 [SALES] Nova resposta gerada com link: "${finalText}"`);
  }
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", finalText);
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE FOLLOW-UP INTELIGENTE (CONTROLADO PELA IA)
  // ═══════════════════════════════════════════════════════════════════════════
  // A IA decide se e quando fazer follow-up usando a tag [FOLLOWUP:...]
  // Se a IA não pediu follow-up, não agendamos automaticamente
  
  if (session.flowState !== 'active') {
    if (followUp) {
      // IA solicitou follow-up específico
      const delayMinutes = parseTimeToMinutes(followUp.tempo);
      scheduleAutoFollowUp(cleanPhone, delayMinutes, `IA: ${followUp.motivo}`);
      console.log(`⏰ [SALES] Follow-up agendado pela IA: ${delayMinutes}min - ${followUp.motivo}`);
    } else {
      // IA não pediu follow-up - não agendar automaticamente
      // Isso evita spam e dá controle à IA
      console.log(`📝 [SALES] IA não solicitou follow-up para ${cleanPhone}`);
    }
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
- Não invente informações
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem é, para não parecer robô. Ex: "Sou o ${session.agentConfig.name || "Atendente"} da ${session.agentConfig.company || "Empresa"}".`;

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
