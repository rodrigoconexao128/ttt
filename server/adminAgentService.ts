/**
 * 🤖 SERVIÇO DE ATENDIMENTO AUTOMATIZADO DO ADMIN (RODRIGO)
 * 
 * Este serviço gerencia todo o atendimento automatizado pelo WhatsApp do admin,
 * incluindo:
 * - Criação de contas de clientes
 * - Configuração de agentes IA
 * - Conexão do WhatsApp do cliente (via QR Code ou Pairing Code)
 * - Processamento de pagamentos PIX
 * - Alterações de configuração via WhatsApp
 * 
 * O agente atende como "Rodrigo" de forma humanizada.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getMistralClient } from "./mistralClient";
import { v4 as uuidv4 } from "uuid";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type ClientState = 
  | "novo"                     // Primeiro contato, ainda não sabemos o que quer
  | "menu_principal"           // Aguardando escolha no menu
  | "aguardando_email"         // Pedimos o email para criar conta
  | "confirmando_email"        // Confirmando o email digitado
  | "configurando_nome_agente" // Definindo nome do agente
  | "configurando_empresa"     // Definindo nome da empresa
  | "configurando_funcao"      // Definindo função do agente
  | "configurando_prompt"      // Cliente digitando prompt/instruções
  | "aguardando_conexao_tipo"  // Escolher QR Code ou Pairing Code
  | "aguardando_pairing"       // Aguardando código de pareamento
  | "aguardando_pagamento"     // PIX enviado, aguardando comprovante
  | "cliente_ativo"            // Cliente com conta ativa
  | "editando_agente"          // Cliente editando configurações
  | "suporte"                  // Precisa de ajuda humana
  ;

export interface ClientSession {
  id: string;
  phoneNumber: string;           // Número do cliente (sem @s.whatsapp.net)
  state: ClientState;
  userId?: string;               // ID do usuário no sistema (se já tem conta)
  email?: string;                // Email do cliente
  agentConfig?: {
    name?: string;               // Nome do agente (ex: "Laura")
    company?: string;            // Nome da empresa
    role?: string;               // Função do agente
    prompt?: string;             // Prompt/instruções
  };
  subscriptionId?: string;       // ID da assinatura pendente
  lastInteraction: Date;
  conversationHistory: Array<{
    role: "user" | "assistant";
    content: string;
    timestamp: Date;
  }>;
  metadata?: Record<string, any>;
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
    state: "novo",
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
    
    // Manter apenas últimas 20 mensagens
    if (session.conversationHistory.length > 20) {
      session.conversationHistory = session.conversationHistory.slice(-20);
    }
  }
}

// ============================================================================
// PROMPT DO AGENTE RODRIGO (CONFIGURÁVEL PELO ADMIN)
// ============================================================================

export async function getAdminAgentPrompt(): Promise<string> {
  // Buscar prompt configurado no admin
  const configPrompt = await storage.getSystemConfig("admin_agent_prompt");
  
  if (configPrompt?.valor) {
    return configPrompt.valor;
  }
  
  // Prompt padrão se não configurado
  return `Você é o Rodrigo, atendente humano da AgenteZap.

SOBRE A AGENTEZAP:
- Somos uma plataforma de automação de WhatsApp com Inteligência Artificial
- Criamos agentes de IA personalizados que atendem clientes 24/7
- O cliente configura as instruções do agente e nós conectamos no WhatsApp dele
- Plano: R$ 99/mês (mensal) - Conversas ilimitadas, 1 agente IA

COMO VOCÊ DEVE ATENDER:
1. Seja natural, simpático e profissional
2. Use linguagem informal mas respeitosa
3. Responda de forma curta e objetiva (2-5 linhas por vez)
4. Não use formatação de markdown (sem ** ou ##)
5. Use emojis com moderação (1-2 por mensagem no máximo)
6. Nunca diga que é uma IA ou robô - você é o Rodrigo

FLUXO DE ATENDIMENTO:
1. Cumprimentar e perguntar como pode ajudar
2. Se quer criar conta: pedir email
3. Depois configurar o agente: nome do agente, empresa, função e instruções
4. Explicar as opções de conexão (QR Code ou código de pareamento)
5. Falar sobre o plano (R$ 99/mês) e enviar PIX

SE O CLIENTE JÁ TEM CONTA:
- Verificar se o número está cadastrado
- Ajudar a alterar configurações do agente
- Ajudar com problemas de conexão
- Processar pagamentos

INFORMAÇÕES IMPORTANTES:
- Trial: 24 horas grátis para testar
- Após 24h, precisa pagar para continuar
- Aceitamos apenas PIX
- Chave PIX: rodrigoconexao128@gmail.com`;
}

// ============================================================================
// GERADOR DE RESPOSTA COM IA
// ============================================================================

export async function generateAdminAgentResponse(
  session: ClientSession,
  userMessage: string,
  context?: string
): Promise<string> {
  try {
    const systemPrompt = await getAdminAgentPrompt();
    const mistral = await getMistralClient();
    
    // Construir contexto da conversa
    const messages: Array<{ role: string; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar contexto extra se fornecido
    if (context) {
      messages.push({ role: "system", content: `[CONTEXTO ATUAL]\n${context}` });
    }
    
    // Adicionar estado atual
    const stateContext = getStateContext(session);
    if (stateContext) {
      messages.push({ role: "system", content: `[ESTADO DO CLIENTE]\n${stateContext}` });
    }
    
    // Adicionar histórico
    for (const msg of session.conversationHistory.slice(-10)) {
      messages.push({
        role: msg.role === "user" ? "user" : "assistant",
        content: msg.content,
      });
    }
    
    // Adicionar mensagem atual
    messages.push({ role: "user", content: userMessage });
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: messages as any,
      maxTokens: 500,
      temperature: 0.7,
    });
    
    const responseText = response.choices?.[0]?.message?.content || 
      "Desculpe, tive um problema aqui. Pode repetir?";
    
    return typeof responseText === 'string' ? responseText : String(responseText);
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao gerar resposta:", error);
    return "Opa, deu um probleminha aqui. Pode mandar de novo?";
  }
}

function getStateContext(session: ClientSession): string {
  const contexts: Record<ClientState, string> = {
    novo: "Cliente novo, primeiro contato. Cumprimente e pergunte como pode ajudar.",
    menu_principal: "Cliente no menu principal. Ofereça: 1) Criar conta 2) Já tenho conta 3) Dúvidas",
    aguardando_email: "Você pediu o email do cliente para criar a conta. Aguarde ele digitar o email.",
    confirmando_email: `Email informado: ${session.email}. Peça confirmação se está correto.`,
    configurando_nome_agente: "Peça o nome que o agente IA vai usar (ex: Laura, João, Maria).",
    configurando_empresa: `Agente: ${session.agentConfig?.name}. Agora peça o nome da empresa do cliente.`,
    configurando_funcao: `Empresa: ${session.agentConfig?.company}. Peça a função do agente (ex: atendente, vendedor).`,
    configurando_prompt: "Peça as instruções/prompt do agente. O que ele deve saber, como atender, etc.",
    aguardando_conexao_tipo: "Pergunte se prefere conectar por QR Code (computador) ou código de pareamento (celular).",
    aguardando_pairing: "Cliente vai receber um código de 8 dígitos no WhatsApp. Peça para enviar esse código.",
    aguardando_pagamento: `PIX enviado. Aguardando comprovante. Valor: R$ 99,00. Após 24h de teste, precisa pagar.`,
    cliente_ativo: `Cliente ativo com conta. ID: ${session.userId}. Pergunte como pode ajudar.`,
    editando_agente: "Cliente quer editar configurações do agente. Pergunte o que deseja alterar.",
    suporte: "Cliente precisa de suporte especial. Diga que vai verificar e resolver.",
  };
  
  return contexts[session.state] || "";
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
  };
}

export async function processAdminMessage(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string
): Promise<AdminAgentResponse> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // Obter ou criar sessão
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }
  
  // Adicionar mensagem ao histórico
  addToConversationHistory(cleanPhone, "user", messageText);
  
  // Verificar se é comprovante de pagamento (imagem)
  if (mediaType === "image" && session.state === "aguardando_pagamento") {
    return await handlePaymentProof(session, mediaUrl);
  }
  
  // Processar baseado no estado atual
  let response: AdminAgentResponse;
  
  switch (session.state) {
    case "novo":
      response = await handleNewClient(session, messageText);
      break;
      
    case "aguardando_email":
      response = await handleEmailInput(session, messageText);
      break;
      
    case "confirmando_email":
      response = await handleEmailConfirmation(session, messageText);
      break;
      
    case "configurando_nome_agente":
      response = await handleAgentName(session, messageText);
      break;
      
    case "configurando_empresa":
      response = await handleCompanyName(session, messageText);
      break;
      
    case "configurando_funcao":
      response = await handleAgentRole(session, messageText);
      break;
      
    case "configurando_prompt":
      response = await handleAgentPrompt(session, messageText);
      break;
      
    case "aguardando_conexao_tipo":
      response = await handleConnectionType(session, messageText);
      break;
      
    case "aguardando_pairing":
      response = await handlePairingCode(session, messageText);
      break;
      
    case "aguardando_pagamento":
      response = await handlePaymentStatus(session, messageText);
      break;
      
    case "cliente_ativo":
      response = await handleActiveClient(session, messageText);
      break;
      
    case "editando_agente":
      response = await handleAgentEdit(session, messageText);
      break;
      
    default:
      response = await handleGenericMessage(session, messageText);
  }
  
  // Adicionar resposta ao histórico
  addToConversationHistory(cleanPhone, "assistant", response.text);
  
  return response;
}

// ============================================================================
// HANDLERS DE ESTADO
// ============================================================================

async function handleNewClient(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const lowerMessage = message.toLowerCase();
  
  // Verificar se já tem conta pelo número
  const existingUser = await findUserByPhone(session.phoneNumber);
  
  if (existingUser) {
    updateClientSession(session.phoneNumber, { 
      state: "cliente_ativo",
      userId: existingUser.id,
    });
    
    return {
      text: `Opa! Você já tem conta conosco 😊\n\nVi aqui que seu email é ${existingUser.email}.\n\nComo posso te ajudar hoje? Quer alterar algo no seu agente ou precisa de suporte?`,
    };
  }
  
  // Verificar intenção
  if (lowerMessage.includes("criar") || lowerMessage.includes("conta") || 
      lowerMessage.includes("começar") || lowerMessage.includes("assinar") ||
      lowerMessage.includes("quero") || lowerMessage.includes("interesse")) {
    updateClientSession(session.phoneNumber, { state: "aguardando_email" });
    
    return {
      text: `Que legal! Vou te ajudar a criar sua conta e configurar seu agente IA 🚀\n\nPra começar, me passa seu email por favor?`,
    };
  }
  
  // Saudação ou primeira mensagem genérica
  return {
    text: `Olá! Eu sou o Rodrigo da AgenteZap 👋\n\nAqui a gente cria agentes de IA personalizados que atendem seus clientes no WhatsApp 24 horas por dia!\n\nVocê quer criar sua conta e testar grátis por 24h?`,
  };
}

async function handleEmailInput(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  // Validar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const email = message.trim().toLowerCase();
  
  if (!emailRegex.test(email)) {
    return {
      text: `Hmm, esse email não parece estar correto 🤔\n\nPode digitar novamente? Precisa ser no formato: seuemail@exemplo.com`,
    };
  }
  
  // Verificar se email já existe
  const existingUser = await findUserByEmail(email);
  if (existingUser) {
    return {
      text: `Esse email já está cadastrado no sistema!\n\nSe for você, me confirma: esse é seu número de WhatsApp mesmo?\n\nOu você quer usar outro email?`,
    };
  }
  
  updateClientSession(session.phoneNumber, { 
    state: "confirmando_email",
    email: email,
  });
  
  return {
    text: `Beleza! Vou cadastrar com o email:\n\n📧 ${email}\n\nTá certo isso? Responde SIM pra confirmar ou digita o email correto.`,
  };
}

async function handleEmailConfirmation(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const lowerMessage = message.toLowerCase().trim();
  
  if (lowerMessage === "sim" || lowerMessage === "s" || lowerMessage === "confirmo" || lowerMessage === "correto") {
    updateClientSession(session.phoneNumber, { state: "configurando_nome_agente" });
    
    return {
      text: `Perfeito! Email confirmado ✅\n\nAgora vamos configurar seu agente IA!\n\nQual nome você quer dar pro seu agente? (Exemplo: Laura, João, Maria, Ana...)`,
    };
  }
  
  // Se não confirmou, voltou a digitar email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (emailRegex.test(message.trim())) {
    updateClientSession(session.phoneNumber, { email: message.trim().toLowerCase() });
    
    return {
      text: `Ok, atualizei para:\n\n📧 ${message.trim().toLowerCase()}\n\nAgora sim, tá certo? Responde SIM pra confirmar.`,
    };
  }
  
  return {
    text: `Não entendi 🤔 Responde SIM se o email tá certo, ou digita o email correto.`,
  };
}

async function handleAgentName(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const agentName = message.trim();
  
  if (agentName.length < 2 || agentName.length > 30) {
    return {
      text: `O nome precisa ter entre 2 e 30 caracteres. Qual vai ser o nome do seu agente?`,
    };
  }
  
  updateClientSession(session.phoneNumber, { 
    state: "configurando_empresa",
    agentConfig: { ...session.agentConfig, name: agentName },
  });
  
  return {
    text: `Ótimo! O agente vai se chamar *${agentName}* 😊\n\nAgora me fala: qual o nome da sua empresa ou negócio?`,
  };
}

async function handleCompanyName(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const company = message.trim();
  
  if (company.length < 2) {
    return {
      text: `O nome da empresa tá muito curto. Pode digitar novamente?`,
    };
  }
  
  updateClientSession(session.phoneNumber, { 
    state: "configurando_funcao",
    agentConfig: { ...session.agentConfig, company: company },
  });
  
  return {
    text: `Perfeito! *${company}* 📋\n\nE qual vai ser a função do ${session.agentConfig?.name}?\n\nPor exemplo: Atendente, Vendedor(a), Consultor(a), Suporte...`,
  };
}

async function handleAgentRole(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const role = message.trim();
  
  updateClientSession(session.phoneNumber, { 
    state: "configurando_prompt",
    agentConfig: { ...session.agentConfig, role: role },
  });
  
  const config = session.agentConfig!;
  
  return {
    text: `Show! Então o *${config.name}* vai ser *${role}* da *${config.company}* ✨\n\nAgora a parte mais importante: me explica o que o ${config.name} precisa saber pra atender seus clientes.\n\nPode mandar:\n- O que sua empresa faz/vende\n- Preços e condições\n- Horário de funcionamento\n- Como deve atender\n- Qualquer informação importante\n\nPode escrever à vontade que eu configuro certinho!`,
  };
}

async function handleAgentPrompt(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const prompt = message.trim();
  
  if (prompt.length < 20) {
    return {
      text: `Preciso de mais informações pra configurar bem o agente 😅\n\nMe conta mais sobre o que sua empresa faz, preços, como o agente deve atender...`,
    };
  }
  
  // Criar o prompt completo
  const config = session.agentConfig!;
  const fullPrompt = `Você é ${config.name}, ${config.role} da ${config.company}.

${prompt}

REGRAS DE ATENDIMENTO:
- Seja sempre educado e prestativo
- Responda de forma curta e objetiva
- Use linguagem natural e amigável
- Não invente informações que não foram fornecidas
- Se não souber algo, diga que vai verificar`;

  updateClientSession(session.phoneNumber, { 
    state: "aguardando_conexao_tipo",
    agentConfig: { ...session.agentConfig, prompt: fullPrompt },
  });
  
  return {
    text: `Pronto! Configurei o *${config.name}* certinho! 🎉\n\nAgora preciso conectar seu WhatsApp.\n\nVocê está acessando por:\n\n1️⃣ *Computador* - Vou gerar um QR Code\n2️⃣ *Celular* - Vou enviar um código de 8 dígitos\n\nQual prefere? Responde 1 ou 2`,
  };
}

async function handleConnectionType(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const choice = message.trim();
  
  if (choice === "1" || choice.toLowerCase().includes("computador") || choice.toLowerCase().includes("qr")) {
    // TODO: Gerar link para página de QR Code
    return {
      text: `Perfeito! Acesse esse link no seu computador:\n\n🔗 https://agentezap.online/conexao\n\nFaça login com seu email *${session.email}* e escaneie o QR Code com seu WhatsApp!\n\nSe precisar de ajuda, me chama aqui 😊`,
    };
  }
  
  if (choice === "2" || choice.toLowerCase().includes("celular") || choice.toLowerCase().includes("código") || choice.toLowerCase().includes("codigo")) {
    updateClientSession(session.phoneNumber, { state: "aguardando_pairing" });
    
    return {
      text: `Ótimo! Vou te enviar um código de 8 dígitos 📱\n\nQuando aparecer no seu WhatsApp, me manda ele aqui que eu conecto pra você!\n\n⏳ Aguarda um momento que estou gerando...`,
      actions: { connectWhatsApp: true },
    };
  }
  
  return {
    text: `Não entendi 🤔\n\nResponde:\n1️⃣ Para QR Code (computador)\n2️⃣ Para código de 8 dígitos (celular)`,
  };
}

async function handlePairingCode(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  // Validar código de pareamento (8 dígitos, pode ter hífen)
  const code = message.replace(/\D/g, "");
  
  if (code.length !== 8) {
    return {
      text: `O código precisa ter 8 números 🔢\n\nQuando aparecer a mensagem no seu WhatsApp com o código, me manda ele aqui!`,
    };
  }
  
  // TODO: Implementar conexão via pairing code
  // Isso precisa ser integrado com o Baileys no backend
  
  return {
    text: `Recebi o código *${code.slice(0,4)}-${code.slice(4)}* ✅\n\n⏳ Conectando seu WhatsApp...\n\nIsso leva alguns segundos. Já volto com a confirmação!`,
  };
}

async function handlePaymentStatus(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes("paguei") || lowerMessage.includes("pago") || 
      lowerMessage.includes("transferi") || lowerMessage.includes("fiz")) {
    return {
      text: `Ótimo! Me manda o comprovante aqui (print ou foto da tela) que eu verifico rapidinho! 📸`,
    };
  }
  
  if (lowerMessage.includes("pix") || lowerMessage.includes("chave") || 
      lowerMessage.includes("dados") || lowerMessage.includes("como")) {
    return {
      text: `Aqui estão os dados do PIX:\n\n💰 *Valor:* R$ 99,00\n📧 *Chave PIX:* rodrigoconexao128@gmail.com\n👤 *Nome:* Rodrigo\n\nApós pagar, me manda o comprovante aqui! ✅`,
    };
  }
  
  return {
    text: `Você tem 24 horas de teste grátis! ⏰\n\nDepois disso, pra continuar usando o agente é R$ 99/mês.\n\n💰 Chave PIX: rodrigoconexao128@gmail.com\n\nQuer os dados completos do PIX?`,
  };
}

async function handlePaymentProof(session: ClientSession, mediaUrl?: string): Promise<AdminAgentResponse> {
  // Notificar o dono do sistema
  const ownerNumber = await getOwnerNotificationNumber();
  
  updateClientSession(session.phoneNumber, { state: "cliente_ativo" });
  
  return {
    text: `Recebi seu comprovante! 🎉\n\nVou verificar o pagamento e já libero sua conta.\n\nIsso leva no máximo 1 hora em horário comercial. Qualquer coisa te aviso por aqui!\n\nObrigado por escolher a AgenteZap! 💚`,
    actions: { notifyOwner: true },
  };
}

async function handleActiveClient(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage.includes("alterar") || lowerMessage.includes("mudar") || 
      lowerMessage.includes("editar") || lowerMessage.includes("configurar")) {
    updateClientSession(session.phoneNumber, { state: "editando_agente" });
    
    return {
      text: `Claro! O que você quer alterar no seu agente?\n\n1️⃣ Nome do agente\n2️⃣ Instruções/Prompt\n3️⃣ Adicionar mídia (áudio, imagem)\n4️⃣ Desconectar WhatsApp\n\nMe fala o número ou o que precisa!`,
    };
  }
  
  // Usar IA para responder perguntas gerais
  const aiResponse = await generateAdminAgentResponse(session, message);
  return { text: aiResponse };
}

async function handleAgentEdit(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  const lowerMessage = message.toLowerCase();
  
  if (lowerMessage === "1" || lowerMessage.includes("nome")) {
    updateClientSession(session.phoneNumber, { state: "configurando_nome_agente" });
    return {
      text: `Qual vai ser o novo nome do seu agente?`,
    };
  }
  
  if (lowerMessage === "2" || lowerMessage.includes("instrução") || lowerMessage.includes("prompt")) {
    updateClientSession(session.phoneNumber, { state: "configurando_prompt" });
    return {
      text: `Me manda as novas instruções pro seu agente.\n\nPode mandar tudo de uma vez: o que sua empresa faz, preços, como atender, etc.`,
    };
  }
  
  if (lowerMessage === "3" || lowerMessage.includes("mídia") || lowerMessage.includes("audio") || lowerMessage.includes("imagem")) {
    return {
      text: `Pra adicionar mídias, acesse:\n\n🔗 https://agentezap.online/meu-agente-ia\n\nLá você pode fazer upload de áudios, imagens e vídeos pro seu agente usar!\n\nQuer que eu te explique como funciona?`,
    };
  }
  
  if (lowerMessage === "4" || lowerMessage.includes("desconectar")) {
    return {
      text: `Tem certeza que quer desconectar o WhatsApp?\n\nSeu agente vai parar de atender até reconectar.\n\nResponde SIM pra confirmar.`,
    };
  }
  
  updateClientSession(session.phoneNumber, { state: "cliente_ativo" });
  return {
    text: `Não entendi 🤔 O que você precisa?\n\n- Alterar configurações do agente\n- Adicionar mídias\n- Suporte técnico\n\nMe conta como posso ajudar!`,
  };
}

async function handleGenericMessage(session: ClientSession, message: string): Promise<AdminAgentResponse> {
  // Usar IA para responder qualquer outra coisa
  const aiResponse = await generateAdminAgentResponse(session, message);
  return { text: aiResponse };
}

// ============================================================================
// FUNÇÕES AUXILIARES
// ============================================================================

async function findUserByPhone(phone: string): Promise<any | undefined> {
  try {
    const cleanPhone = phone.replace(/\D/g, "");
    // Buscar usuário pelo telefone
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
    
    const bcrypt = await import("bcryptjs");
    
    // Gerar senha aleatória (cliente vai usar "esqueci minha senha" depois se quiser)
    const tempPassword = Math.random().toString(36).slice(-8);
    const passwordHash = await bcrypt.hash(tempPassword, 10);
    
    // Criar usuário
    const user = await storage.upsertUser({
      email: session.email,
      name: session.agentConfig?.company || "Cliente",
      phone: session.phoneNumber,
      role: "user",
    });
    
    // Criar configuração do agente
    if (session.agentConfig?.prompt) {
      await storage.upsertAgentConfig(user.id, {
        prompt: session.agentConfig.prompt,
        isActive: true,
        model: "mistral-small-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // Criar assinatura de teste (24h)
    const plans = await storage.getActivePlans();
    const basicPlan = plans[0]; // Pega o primeiro plano ativo
    
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
    
    updateClientSession(session.phoneNumber, { 
      userId: user.id,
      state: "aguardando_conexao_tipo",
    });
    
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
    
    const message = `💰 *NOVO PAGAMENTO RECEBIDO*

📱 Cliente: ${session.phoneNumber}
📧 Email: ${session.email || "N/A"}
🤖 Agente: ${session.agentConfig?.name || "N/A"}
🏢 Empresa: ${session.agentConfig?.company || "N/A"}

⏰ ${new Date().toLocaleString("pt-BR")}

${comprovante ? "📸 Comprovante anexado" : "⚠️ Verificar pagamento manualmente"}`;
    
    console.log(`📢 [ADMIN AGENT] Notificação de pagamento para ${ownerNumber}:\n${message}`);
    
    // TODO: Enviar mensagem via WhatsApp admin
  } catch (error) {
    console.error("[ADMIN AGENT] Erro ao notificar dono:", error);
  }
}
