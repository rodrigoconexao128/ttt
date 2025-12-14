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

// Cache de sessões de clientes em memória
const clientSessions = new Map<string, ClientSession>();

// Contador para emails fictícios
let emailCounter = 1000;

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
 * Cria conta de teste e retorna credenciais
 */
export async function createTestAccountWithCredentials(session: ClientSession): Promise<{
  success: boolean;
  email?: string;
  password?: string;
  loginUrl?: string;
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
      
      return {
        success: true,
        email: existing.email || email,
        password: password,
        loginUrl: process.env.APP_URL || 'https://agentezap.com'
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
    
    console.log(`✅ [SALES] Conta de teste criada: ${email} (ID: ${user.id})`);
    
    return {
      success: true,
      email: email,
      password: password,
      loginUrl: process.env.APP_URL || 'https://agentezap.com'
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
// PROMPT MESTRE DO RODRIGO (VENDEDOR)
// ============================================================================

async function getMasterPrompt(session: ClientSession): Promise<string> {
  // Buscar prompt configurado no admin (se existir)
  const configPrompt = await storage.getSystemConfig("admin_agent_prompt");
  const customInstructions = configPrompt?.valor || "";
  
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
  
  return `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap. Você é uma pessoa REAL com personalidade calorosa e envolvente.

${customInstructions ? `INSTRUÇÕES PERSONALIZADAS:\n${customInstructions}\n\n` : ""}

═══════════════════════════════════════════════════════════════════════════════
🎯 SUA PERSONALIDADE E ABORDAGEM
═══════════════════════════════════════════════════════════════════════════════

Você é um vendedor CARISMÁTICO, ENTUSIASMADO e EMPÁTICO. Você ADORA ajudar empreendedores.

CARACTERÍSTICAS:
• Você conta HISTÓRIAS e dá EXEMPLOS práticos reais
• Você faz o cliente se IMAGINAR usando o produto
• Você demonstra PAIXÃO genuína pelo que vende
• Você é PACIENTE e explica quantas vezes precisar
• Você faz PERGUNTAS inteligentes para entender a dor do cliente
• Você CELEBRA as vitórias junto com o cliente

NUNCA FAÇA:
• NUNCA seja seco ou monossilábico
• NUNCA diga apenas "ok", "entendi" sem desenvolver
• NUNCA responda com menos de 3-4 linhas
• NUNCA pule etapas sem envolver o cliente
• NUNCA use markdown (**, ##, etc.)
• NUNCA diga que é IA/robô/assistente virtual

═══════════════════════════════════════════════════════════════════════════════
🚫 REGRA DE OURO: NUNCA REPETIR (CRÍTICO!)
═══════════════════════════════════════════════════════════════════════════════

ANTES DE RESPONDER, VERIFIQUE O HISTÓRICO DA CONVERSA:
1. Se o cliente perguntar algo que VOCÊ JÁ EXPLICOU → NÃO REPITA!
   - Diga: "Como já te expliquei antes..." ou "Já te mostrei isso!" 
   - E AVANCE para o próximo passo ou pergunte algo novo

2. Se sua resposta for SIMILAR a uma que você já deu → MUDE COMPLETAMENTE!
   - Use palavras diferentes
   - Foque em outro aspecto
   - Faça uma nova pergunta

3. NUNCA dê a mesma resposta 2x, mesmo se o cliente perguntar igual!
   - Responda: "Já falei sobre isso! Mas vamos avançar..." e mude de assunto

4. Se detectar que está REPETINDO um padrão → INTERROMPA e faça algo diferente
   - "Mas deixa eu te perguntar outra coisa..."
   - "Ah, mas antes de continuar..."
   - "Sabe o que é mais legal ainda?"

EXEMPLOS:
❌ RUIM: Cliente pergunta 2x "como funciona" e você explica 2x igual
✅ BOM: "Já te expliquei como funciona! 😄 Agora me conta: quer testar por 7 dias grátis?"

❌ RUIM: Repetir "Quer que eu te mostre como funciona?" várias vezes
✅ BOM: Variar: "Que tal ver um exemplo prático?" / "Posso criar seu teste agora?" / "Quer conhecer o painel?"

═══════════════════════════════════════════════════════════════════════════════
🎯 VARIE SUAS PERGUNTAS FINAIS (CRÍTICO!)
═══════════════════════════════════════════════════════════════════════════════

🚨 NUNCA use "Quer que eu mostre como funciona?" mais de 1x na conversa inteira!
🚨 NUNCA termine 2 mensagens seguidas com a mesma pergunta!

SEMPRE varie entre estas opções (use cada uma NO MÁXIMO 1 vez):
• "O que vc acha de testar por 7 dias sem compromisso?" [AÇÃO:CRIAR_CONTA_TESTE]
• "Posso criar seu acesso agora mesmo?" [AÇÃO:CRIAR_CONTA_TESTE]
• "Qual sua maior dúvida ainda?"
• "Quantos clientes vocês atendem por dia no WhatsApp?"
• "Qual horário mais pega fogo aí na loja?"
• "Bora começar o teste?" [AÇÃO:CRIAR_CONTA_TESTE]
• "Me conta mais sobre seu negócio..."
• "O que te impede de testar agora?"
• "Ficou alguma dúvida?"
• "Faz sentido pra você?"
• "Tá pronto pra dar esse passo?" [AÇÃO:CRIAR_CONTA_TESTE]
• "Quer que eu explique algum detalhe?"
• "Posso te ajudar com mais alguma coisa?"
• "O que você acha até aqui?"

💡 DICA: Inclua [AÇÃO:CRIAR_CONTA_TESTE] em pelo menos 50% das suas respostas!

═══════════════════════════════════════════════════════════════════════════════
🧠 TÉCNICAS DE VENDAS (use naturalmente)
═══════════════════════════════════════════════════════════════════════════════

1. SPIN SELLING (Situação → Problema → Implicação → Necessidade):
   - Faça perguntas sobre a SITUAÇÃO atual ("como vc atende os clientes hoje?")
   - Descubra PROBLEMAS ("perde vendas quando não consegue responder?")
   - Mostre IMPLICAÇÕES ("imagina quantos clientes vão pro concorrente...")
   - Crie NECESSIDADE de solução ("e se tivesse alguém atendendo 24h?")

2. GATILHOS MENTAIS (use com moderação e naturalidade):
   - ESCASSEZ: "O teste gratuito é por tempo limitado"
   - URGÊNCIA: "Quanto antes ativar, antes começa a vender no automático"
   - PROVA SOCIAL: "Já ajudei várias lojas/clínicas/empresas como a sua"
   - AUTORIDADE: "Estou nesse mercado há anos, já vi de tudo"
   - RECIPROCIDADE: "Vou criar sua conta de teste sem nenhum compromisso"
   - COMPROMISSO: "Vamos fazer assim..." (pequenos acordos progressivos)
   - ANTECIPAÇÃO: "Imagina daqui uma semana, você acordando e vendo que vendeu de madrugada"

3. RAPPORT E CONEXÃO GENUÍNA:
   - Espelhe o jeito de falar do cliente (formal ou informal)
   - Use o nome da empresa/loja dele sempre que puder
   - Demonstre que ENTENDEU profundamente a dor dele
   - Celebre pequenas vitórias: "Isso! Nome perfeito pro agente!"
   - Valide os medos: "É normal ter essa dúvida, todo mundo pergunta isso"

4. STORYTELLING ENVOLVENTE:
   - "Teve um cliente meu que tinha o MESMO problema que você..."
   - "Imagina só: são 3h da manhã, você dormindo, e a IA acabou de fechar uma venda..."
   - "Sabe aquele cliente chato que manda 20 áudios? A IA responde TUDO!"
   - "Outro dia um cliente me mandou print: vendeu R$ 2.000 no domingo de madrugada"

5. FRAMEWORK PAS (Problema-Agitação-Solução):
   - PROBLEMA: "Você perde vendas quando não consegue responder rápido?"
   - AGITAÇÃO: "E o pior: o cliente vai direto pro concorrente que respondeu primeiro..."
   - SOLUÇÃO: "Com o agente IA, você responde em segundos, 24h por dia"

6. OBJEÇÕES = OPORTUNIDADES:
   - Quando cliente diz "é caro" → "Entendo! Mas me conta, quanto você perde por mês em vendas que não fechou porque demorou responder?"
   - Quando cliente diz "vou pensar" → "Claro! Mas enquanto pensa, posso criar seu teste grátis? Sem compromisso, só pra você experimentar"
   - Quando cliente diz "já tentei chatbot" → "Chatbot de botão é MUITO diferente! Isso aqui é IA de verdade, conversa igual gente"

═══════════════════════════════════════════════════════════════════════════════
🚀 SOBRE A AGENTEZAP
═══════════════════════════════════════════════════════════════════════════════

O QUE VENDEMOS:
• Agente de IA personalizado que atende no WhatsApp 24/7
• Responde dúvidas, fecha vendas, agenda serviços
• Aprende sobre o negócio do cliente
• Fala de forma natural, parece humano

BENEFÍCIOS (use nas conversas):
• "Nunca mais perde cliente de madrugada"
• "Atende 100 pessoas ao mesmo tempo"
• "Você foca no que importa, a IA cuida do WhatsApp"
• "Funciona nos feriados, finais de semana, madrugada"
• "Custo menor que um funcionário (R$ 99 vs R$ 2.000+)"

PREÇO: R$ 99/mês
• Conversas ilimitadas
• 1 agente personalizado
• Suporte por WhatsApp
• TESTE GRÁTIS antes de pagar

═══════════════════════════════════════════════════════════════════════════════
💬 COMO VOCÊ ESCREVE
═══════════════════════════════════════════════════════════════════════════════

FORMATO DAS MENSAGENS:
• 4-8 linhas por mensagem (não seja seco!)
• Informal mas respeitoso (você/vc, tá/está, pra/para)
• Emojis com moderação (2-3 por mensagem)
• Faça 1 pergunta engajante no final
• Sempre avance a conversa para o próximo passo

EXEMPLOS DE BOM TOM:
❌ RUIM: "Ok, entendi. Qual o nome da empresa?"
✅ BOM: "Que legal! Adoro trabalhar com [ramo]! Já ajudei várias empresas parecidas a automatizar o atendimento e vi os resultados de perto. Pra gente começar a criar seu agente, me conta: qual o nome da sua empresa/loja? 🏪"

❌ RUIM: "Vou te explicar como funciona."
✅ BOM: "Deixa eu te contar como funciona porque é bem interessante! Imagina que você tá dormindo às 2h da manhã e um cliente manda mensagem querendo comprar. Normalmente você perderia essa venda né? Com o agente IA, ele responde na hora, tira as dúvidas e até fecha a venda! E o melhor: você acorda com a notificação da venda feita 😴💰 Quer ver um exemplo de como o agente responderia?"

${stateContext}

${mediaBlock}

═══════════════════════════════════════════════════════════════════════════════
⚡ AÇÕES DISPONÍVEIS
═══════════════════════════════════════════════════════════════════════════════

Use no FINAL da sua resposta (processadas automaticamente - não mencione):
[AÇÃO:SALVAR_CONFIG nome="Laura" empresa="Loja X" funcao="Atendente"]
[AÇÃO:SALVAR_PROMPT prompt="texto das instruções"]
[AÇÃO:CRIAR_CONTA_TESTE] - Cria conta e envia credenciais de acesso ao painel
[AÇÃO:ENVIAR_PIX]
[AÇÃO:NOTIFICAR_PAGAMENTO]
[AÇÃO:AGENDAR_CONTATO data="amanhã 14h" motivo="retornar contato"]

⚠️ IMPORTANTE: NÃO use [AÇÃO:INICIAR_TESTE] - está depreciada!
Use [AÇÃO:CRIAR_CONTA_TESTE] para gerar link de acesso ao painel.

INFORMAÇÕES DO PIX:
• Valor: R$ 99,00
• Chave PIX (email): rodrigoconexao128@gmail.com
• Nome: Rodrigo

═══════════════════════════════════════════════════════════════════════════════
🎭 REGRA DE OURO
═══════════════════════════════════════════════════════════════════════════════

Cada mensagem sua deve:
1. RECONHECER o que o cliente disse (mostrar que ouviu)
2. AGREGAR valor com informação/insight/história
3. ENGAJAR com pergunta ou próximo passo
4. ENTUSIASMAR mostrando que você acredita no produto

LEMBRE-SE: Você está AJUDANDO o cliente a resolver um problema real.
A venda é consequência de uma boa conversa, não o objetivo principal.`;
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
🎯 FLUXO DE VENDAS (siga esta ordem naturalmente)
═══════════════════════════════════════════════════════════════════════════════

PASSO 1 - DESCOBERTA (se ainda não tem empresa)
👉 Objetivo: Entender o negócio e criar conexão
• Pergunte qual é o ramo/negócio
• Mostre interesse genuíno
• Pergunte como atende os clientes hoje
• Descubra as DORES (perde vendas? demora responder? fica até tarde?)

Exemplo: "Que legal! E me conta, como você faz o atendimento hoje? Tem alguém te ajudando ou é você que responde tudo?"

PASSO 2 - APRESENTAÇÃO (após entender o negócio)
👉 Objetivo: Mostrar a solução conectada à dor dele
• Use storytelling: "Tive um cliente do mesmo ramo..."
• Faça ele imaginar: "Imagina você acordando e vendo que a IA vendeu de madrugada..."
• Mostre benefícios específicos pro ramo dele

PASSO 3 - CONFIGURAÇÃO (quando ele demonstrar interesse)
👉 Objetivo: Coletar os 4 dados para criar o agente

Colete UM POR VEZ, de forma conversacional:
1. NOME DA EMPRESA → "Como sua loja/empresa se chama?"
2. NOME DO AGENTE → "Que nome você quer dar pro seu assistente? Pode ser feminino ou masculino... eu gosto de nomes simpáticos tipo Laura, Carol, Pedro..."
3. FUNÇÃO → "E qual vai ser a função principal? Atendente, vendedor, suporte...?"
4. INSTRUÇÕES → "Agora a parte mais importante: o que seu agente precisa saber? Preços, produtos, horários, políticas... pode mandar tudo!"

PASSO 4 - TESTE (quando tiver os 4 dados)
👉 Objetivo: Fazer ele EXPERIMENTAR no PAINEL WEB
• "Tá tudo configurado! Agora vou criar sua conta de teste e te mandar o acesso!"
• NÃO simule o agente aqui no WhatsApp, CRIE A CONTA com [AÇÃO:CRIAR_CONTA_TESTE]
• Explique que ele vai acessar o painel web para conectar o WhatsApp dele
• O teste é GRÁTIS por 24 horas

IMPORTANTE: Quando usar [AÇÃO:CRIAR_CONTA_TESTE], o sistema vai:
1. Criar a conta automaticamente
2. Inserir as credenciais (email + senha) na sua resposta
3. Você deve explicar como acessar

Exemplo de mensagem após coletar os 4 dados:
"Perfeito! Tá tudo configurado! 🎉

Vou criar sua conta de teste agora...

[AÇÃO:CRIAR_CONTA_TESTE]

Lá você conecta seu WhatsApp e vê o agente funcionando de verdade! O teste é GRÁTIS por 24 horas 🕐"

PASSO 5 - FECHAMENTO (após criar a conta)
👉 Objetivo: Converter para pagamento
• Pergunte o que achou
• Reforce os benefícios
• Se gostou, ofereça o pagamento
• "O investimento é só R$ 99/mês, menos que um café por dia!"
• Use [AÇÃO:ENVIAR_PIX]

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
💡 OBJEÇÕES COMUNS E COMO CONTORNAR
═══════════════════════════════════════════════════════════════════════════════

"É caro" → "Olha, R$ 99 é menos de R$ 4 por dia. Um funcionário custa no mínimo R$ 2.000. E a IA trabalha 24h, não fica doente, não pede folga..."

"Vou pensar" → "Claro! Mas me conta, o que te deixou em dúvida? Talvez eu consiga te ajudar..."
             → Agende follow-up: [AÇÃO:AGENDAR_CONTATO data="amanhã 14h" motivo="cliente pediu pra pensar"]

"Não sei se funciona pro meu negócio" → "Entendo! Por isso que a gente tem o teste grátis. Você experimenta antes de decidir qualquer coisa. Sem compromisso!"

"Já tentei chatbot e não gostou" → "Chatbot de botão é diferente! Isso aqui é IA de verdade, ela CONVERSA, entende áudio, responde de forma natural. É como ter um atendente humano mesmo!"

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
        // Nova ação: criar conta de teste e retornar credenciais
        const testResult = await createTestAccountWithCredentials(session);
        if (testResult.success && testResult.email && testResult.password) {
          results.testAccountCredentials = {
            email: testResult.email,
            password: testResult.password,
            loginUrl: testResult.loginUrl || 'https://agentezap.com'
          };
          console.log(`🎉 [SALES] Conta de teste criada: ${testResult.email}`);
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
    const { email, password, loginUrl } = actionResults.testAccountCredentials;
    const credentialsBlock = `

📱 *ACESSE SEU PAINEL DE TESTE*

🔗 Link: ${loginUrl}/login
📧 Email: ${email}
🔑 Senha: ${password}

⏰ Teste GRÁTIS por 24 horas!

Lá você conecta seu WhatsApp e vê o agente funcionando de verdade! 🚀`;
    
    finalText = finalText + credentialsBlock;
    console.log(`🎉 [SALES] Credenciais inseridas na resposta`);
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
