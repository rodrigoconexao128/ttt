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
      
      // Atualizar configuração do agente com as novas informações
      if (session.agentConfig?.prompt || session.agentConfig?.name) {
        const agentName = session.agentConfig.name || "Atendente";
        const companyName = session.agentConfig.company || "Empresa";
        const agentRole = session.agentConfig.role || "atendente";
        const instructions = session.agentConfig.prompt || "Atenda os clientes de forma educada e prestativa.";
        
        // Prompt profissional e personalizado para o agente do CLIENTE
        const fullPrompt = `# IDENTIDADE
Você é ${agentName}, ${agentRole} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRUÇÕES E CONHECIMENTO
${instructions}

# REGRAS DE COMPORTAMENTO
1. Você é ${agentName} da ${companyName} - NUNCA se confunda com outro agente
2. Responda APENAS sobre assuntos relacionados à ${companyName}
3. Se não souber algo, diga que vai verificar ou peça para aguardar
4. Seja educado, prestativo e objetivo
5. Use linguagem natural e amigável
6. Respostas curtas (2-4 linhas por mensagem)
7. Use emojis com moderação 😊
8. NUNCA invente informações que não estão nas instruções acima
9. Se perguntarem algo fora do seu escopo, redirecione educadamente

# EXEMPLOS DE INTERAÇÃO
Cliente: "Oi"
${agentName}: "Olá! 👋 Bem-vindo à ${companyName}! Como posso te ajudar hoje?"

Cliente: "Vocês têm X?"
${agentName}: [Responda baseado nas instruções acima]

Cliente: "Qual o preço?"
${agentName}: [Se tiver preço nas instruções, informe. Se não, diga que vai verificar]`;

        await storage.upsertAgentConfig(existing.id, {
          prompt: fullPrompt,
          isActive: true,
          model: "mistral-small-latest",
          triggerPhrases: [],
          messageSplitChars: 400,
          responseDelaySeconds: 30,
        });
        
        console.log(`✅ [SALES] Agente "${agentName}" ATUALIZADO para ${companyName}`);
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
        
        // Buscar usuário pelo email gerado
        const existingByEmail = users.find(u => u.email === email);
        if (existingByEmail) {
          // Atualizar agente e gerar link
          if (session.agentConfig?.prompt || session.agentConfig?.name) {
            const agentName = session.agentConfig.name || "Atendente";
            const companyName = session.agentConfig.company || "Empresa";
            const agentRole = session.agentConfig.role || "atendente";
            const instructions = session.agentConfig.prompt || "Atenda os clientes de forma educada e prestativa.";
            
            const fullPrompt = `# IDENTIDADE
Você é ${agentName}, ${agentRole} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRUÇÕES E CONHECIMENTO
${instructions}

# REGRAS DE COMPORTAMENTO
1. Você é ${agentName} da ${companyName} - NUNCA se confunda com outro agente
2. Responda APENAS sobre assuntos relacionados à ${companyName}
3. Se não souber algo, diga que vai verificar ou peça para aguardar
4. Seja educado, prestativo e objetivo
5. Use linguagem natural e amigável
6. Respostas curtas (2-4 linhas por mensagem)
7. Use emojis com moderação 😊
8. NUNCA invente informações que não estão nas instruções acima
9. Se perguntarem algo fora do seu escopo, redirecione educadamente

# EXEMPLOS DE INTERAÇÃO
Cliente: "Oi"
${agentName}: "Olá! 👋 Bem-vindo à ${companyName}! Como posso te ajudar hoje?"`;

            await storage.upsertAgentConfig(existingByEmail.id, {
              prompt: fullPrompt,
              isActive: true,
              model: "mistral-small-latest",
              triggerPhrases: [],
              messageSplitChars: 400,
              responseDelaySeconds: 30,
            });
            
            console.log(`✅ [SALES] Agente "${agentName}" ATUALIZADO (após email_exists)`);
          }
          
          updateClientSession(session.phoneNumber, { 
            userId: existingByEmail.id, 
            email: existingByEmail.email,
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
    
    // Criar config do agente se tiver
    if (session.agentConfig?.prompt || session.agentConfig?.name) {
      const agentName = session.agentConfig.name || "Atendente";
      const companyName = session.agentConfig.company || "Empresa";
      const agentRole = session.agentConfig.role || "atendente";
      const instructions = session.agentConfig.prompt || "Atenda os clientes de forma educada e prestativa.";
      
      // Prompt profissional e personalizado para o agente do CLIENTE
      const fullPrompt = `# IDENTIDADE
Você é ${agentName}, ${agentRole} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRUÇÕES E CONHECIMENTO
${instructions}

# REGRAS DE COMPORTAMENTO
1. Você é ${agentName} da ${companyName} - NUNCA se confunda com outro agente
2. Responda APENAS sobre assuntos relacionados à ${companyName}
3. Se não souber algo, diga que vai verificar ou peça para aguardar
4. Seja educado, prestativo e objetivo
5. Use linguagem natural e amigável
6. Respostas curtas (2-4 linhas por mensagem)
7. Use emojis com moderação 😊
8. NUNCA invente informações que não estão nas instruções acima
9. Se perguntarem algo fora do seu escopo, redirecione educadamente

# EXEMPLOS DE INTERAÇÃO
Cliente: "Oi"
${agentName}: "Olá! 👋 Bem-vindo à ${companyName}! Como posso te ajudar hoje?"

Cliente: "Vocês têm X?"
${agentName}: [Responda baseado nas instruções acima]

Cliente: "Qual o preço?"
${agentName}: [Se tiver preço nas instruções, informe. Se não, diga que vai verificar]`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
      
      console.log(`✅ [SALES] Agente "${agentName}" criado para ${companyName} (prompt: ${fullPrompt.length} chars)`);
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
// PROMPT MESTRE DO RODRIGO (VENDEDOR) - NUCLEAR 21.0 (HARDCODED)
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // NUCLEAR 21.0: Prompt fixo no código, não busca mais do banco
  // Isso garante que a calibração 100% seja mantida e não seja alterada via admin
  
  // VERIFICAR SE ADMIN LIMPOU HISTÓRICO - Se sim, SEMPRE tratar como cliente novo
  const forceNew = shouldForceOnboarding(session.phoneNumber);
  if (forceNew) {
    console.log(`🔄 [SALES] Telefone ${session.phoneNumber} em forceOnboarding - tratando como cliente NOVO`);
    // Não buscar usuário existente, ir direto para onboarding
  }
  
  // Verificar se cliente já existe pelo telefone (APENAS se não está em forceOnboarding)
  const existingUser = forceNew ? null : await findUserByPhone(session.phoneNumber);
  
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
  
  return `🚨 DIRETRIZ SUPREMA DE VENDAS - NUCLEAR 21.0 🚨

VOCÊ É O RODRIGO, O MELHOR VENDEDOR DA AGENTEZAP.
SUA MISSÃO: Coletar as informações necessárias e depois criar o teste.

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRA CRÍTICA: QUANDO CRIAR A CONTA DE TESTE
═══════════════════════════════════════════════════════════════════════════════

⛔ SÓ CRIE A CONTA ([ACAO:CRIAR_CONTA_TESTE]) QUANDO TIVER ESTAS 3 INFORMAÇÕES:
   1. ✅ TIPO DE NEGÓCIO (loja, restaurante, clínica, etc.)
   2. ✅ NOME DO AGENTE (Laura, Pedro, Bia, etc.) ou empresa
   3. ✅ O QUE O AGENTE PRECISA SABER (produtos, preços, regras)

Se faltar QUALQUER uma dessas informações → PERGUNTE ANTES de criar!

═══════════════════════════════════════════════════════════════════════════════
📝 FLUXO CORRETO DE CONVERSA
═══════════════════════════════════════════════════════════════════════════════

PASSO 1 - DESCOBERTA (se não sabe o negócio):
"Oi! Tudo certo? 😊 Me conta rapidinho: qual seu negócio, o que você vende/faz, e qual sua maior dor no atendimento hoje?"
ou: "Se preferir, manda um áudio explicando tudo! 🎤"

PASSO 2 - COLETA DE DADOS (se sabe o negócio mas falta nome/instruções):
"Entendi! Pra criar seu agente, me manda:
📍 Nome que quer dar pro agente (ex: Laura, Pedro, Bia...)
📝 O que ele precisa saber (preços, produtos, horários, regras...)
Pode mandar foto do catálogo também! 📸"

PASSO 3 - CRIAR TESTE (SÓ quando tiver as 3 informações):
"Perfeito! Vou criar seu agente [NOME] pra [EMPRESA]! 🚀
[ACAO:CRIAR_CONTA_TESTE]"

═══════════════════════════════════════════════════════════════════════════════
⚠️ ERROS QUE VOCÊ NÃO PODE COMETER
═══════════════════════════════════════════════════════════════════════════════

❌ ERRADO: Criar conta na primeira mensagem sem saber nada
❌ ERRADO: Criar conta só porque o cliente disse "oi" ou "quero testar"
❌ ERRADO: Criar conta sem saber o tipo de negócio
❌ ERRADO: Criar conta sem saber o nome do agente ou empresa
❌ ERRADO: Criar conta com prompt genérico que não serve pro cliente

✅ CERTO: Perguntar o negócio primeiro
✅ CERTO: Perguntar nome do agente e instruções
✅ CERTO: Só criar quando tiver informações específicas

═══════════════════════════════════════════════════════════════════════════════
🏷️ USO DA TAG [ACAO:CRIAR_CONTA_TESTE]
═══════════════════════════════════════════════════════════════════════════════

NUNCA escreva links inventados. A ÚNICA forma de criar o link é: [ACAO:CRIAR_CONTA_TESTE]

Use a tag APENAS quando tiver coletado as 3 informações.

═══════════════════════════════════════════════════════════════════════════════
⏰ FOLLOW-UP INTELIGENTE
═══════════════════════════════════════════════════════════════════════════════

Se você achar que precisa fazer follow-up depois, inclua no final da resposta:
[FOLLOWUP:tempo="X minutos" motivo="breve descrição"]

Exemplos:
- Cliente interessado mas ocupado → [FOLLOWUP:tempo="2 horas" motivo="retomar conversa"]
- Cliente pediu pra voltar depois → [FOLLOWUP:tempo="1 dia" motivo="cliente pediu"]
- Cliente sumiu no meio → [FOLLOWUP:tempo="30 minutos" motivo="continuar coleta"]

NÃO precisa sempre colocar follow-up. Só quando faz sentido.

═══════════════════════════════════════════════════════════════════════════════
📝 EXEMPLOS DE CONVERSA CORRETA
═══════════════════════════════════════════════════════════════════════════════

EXEMPLO 1 - Cliente novo:
Cliente: "Oi agentezap"
Rodrigo: "Oi! Tudo certo por aqui! 😊 Me conta rapidinho: qual seu negócio, o que você vende/faz, e qual sua maior dor no atendimento hoje? Se preferir, manda um áudio explicando tudo! 🎤"

EXEMPLO 2 - Cliente deu tipo de negócio:
Cliente: "Tenho uma loja de calçados"
Rodrigo: "Legal! Loja de calçados! 👟 Pra criar seu agente, me manda essas infos:
📍 Nome da sua empresa
🤖 Nome que quer dar pro agente (ex: Laura, Pedro, Bia...)
📝 O que ele precisa saber (preços, produtos, horários, regras...)
Pode mandar foto do catálogo também! 📸"

EXEMPLO 3 - Cliente deu TODAS as informações:
Cliente: "É a Calçados Fashion, quero um agente chamado Laura, ela precisa saber que temos tênis de R$99 a R$299, atendemos de seg a sab das 9h às 18h"
Rodrigo: "Perfeito! Vou criar a Laura pra Calçados Fashion agora! 🚀
[ACAO:CRIAR_CONTA_TESTE]"

EXEMPLO 4 - Cliente com pressa mas sem dados:
Cliente: "Quero testar agora"
Rodrigo: "Bora! 🚀 Me conta rapidinho: qual seu negócio e o que você vende? Assim eu já crio um agente personalizado pra você!"

${stateContext}

${mediaBlock}
`;
}

/**
 * Contexto para clientes novos (onboarding/vendas)
 */
function getOnboardingContext(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  // Verificar quais dados já foram coletados
  const hasName = !!(config.name);
  const hasCompany = !!(config.company);
  const hasPrompt = !!(config.prompt);
  
  // Determinar o que falta
  const missingItems: string[] = [];
  if (!hasCompany) missingItems.push("tipo/nome do negócio");
  if (!hasName) missingItems.push("nome do agente");
  if (!hasPrompt) missingItems.push("instruções/informações do negócio");
  
  let configStatus = "";
  if (hasName) configStatus += `✅ Nome do agente: ${config.name}\n`;
  if (hasCompany) configStatus += `✅ Empresa/Negócio: ${config.company}\n`;
  if (config.role) configStatus += `✅ Função: ${config.role}\n`;
  if (hasPrompt) configStatus += `✅ Instruções: configuradas (${config.prompt.length} chars)\n`;
  
  const hasAllConfig = hasName && hasCompany && hasPrompt;
  const readyToCreate = hasAllConfig;
  
  return `
═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO ATUAL: COLETA DE DADOS PARA CRIAR AGENTE
═══════════════════════════════════════════════════════════════════════════════

Telefone: ${session.phoneNumber}

📊 DADOS COLETADOS:
${configStatus || "🆕 NENHUM DADO COLETADO AINDA"}

${missingItems.length > 0 ? `
❌ FALTA COLETAR:
${missingItems.map(item => `   • ${item}`).join('\n')}

⚠️ VOCÊ NÃO PODE CRIAR A CONTA AINDA!
Pergunte ao cliente os dados que faltam antes de usar [ACAO:CRIAR_CONTA_TESTE]
` : `
✅ TODOS OS DADOS COLETADOS! PODE CRIAR A CONTA!
Use [ACAO:CRIAR_CONTA_TESTE] para gerar o acesso de teste.
`}

═══════════════════════════════════════════════════════════════════════════════
💡 O QUE PERGUNTAR AGORA
═══════════════════════════════════════════════════════════════════════════════

${!hasCompany ? `
👉 PRIMEIRO: Descubra o tipo de negócio/empresa
Pergunte: "Me conta qual seu negócio, o que você vende/faz?"
` : ''}
${hasCompany && !hasName ? `
👉 AGORA: Descubra o nome do agente
Pergunte: "Qual nome você quer dar pro seu agente? (ex: Laura, Pedro, Bia...)"
` : ''}
${hasCompany && hasName && !hasPrompt ? `
👉 AGORA: Colete as informações do negócio
Pergunte: "O que o ${config.name} precisa saber? (preços, produtos, horários, regras...)"
` : ''}
${hasAllConfig ? `
👉 PRONTO! Crie a conta agora:
Diga: "Perfeito! Vou criar o ${config.name} pra ${config.company} agora! 🚀"
E use: [ACAO:CRIAR_CONTA_TESTE]
` : ''}

═══════════════════════════════════════════════════════════════════════════════
🔗 O QUE ACONTECE APÓS CRIAR A CONTA
═══════════════════════════════════════════════════════════════════════════════

1. Sistema gera email + senha + link do simulador
2. Cliente acessa o link do SIMULADOR
3. No simulador, cliente conversa com SEU AGENTE (não com você!)
4. O agente usa o prompt personalizado com as informações coletadas
5. Cliente testa e dá feedback

IMPORTANTE: O agente no simulador deve se comportar como agente DO CLIENTE
(ex: atendente de loja de calçados, não vendedor do AgenteZap)`;
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
    
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
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
  
  // Montar texto final - incluir credenciais se houver
  let finalText = cleanText;
  
  if (actionResults.testAccountCredentials) {
    const { loginUrl, simulatorToken } = actionResults.testAccountCredentials;
    
    // Montar link do simulador de WhatsApp com token
    const baseUrl = loginUrl || process.env.APP_URL || 'https://agentezap.online';
    const simulatorLink = simulatorToken 
      ? `${baseUrl}/test/${simulatorToken}` 
      : `${baseUrl}/testar`;
    
    // APENAS o link do simulador - sem credenciais de login
    const credentialsBlock = `

📱 *TESTE SEU AGENTE AGORA!*

🔗 *SIMULADOR:* ${simulatorLink}

👆 Clica no link acima! Lá tem um SIMULADOR de WhatsApp igualzinho ao real!
Você conversa com SEU AGENTE e vê como ele responde! 📱

⏰ Teste GRÁTIS por 24 horas!

Testa lá e me fala o que achou! 🚀`;
    
    finalText = finalText + credentialsBlock;
    console.log(`🎉 [SALES] Link do simulador inserido na resposta`);
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
