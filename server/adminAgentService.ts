/**
 * ðŸ¤– SERVIÃ‡O DE VENDAS AUTOMATIZADO DO ADMIN (RODRIGO) - NOVA VERSÃƒO
 * 
 * FLUXO PRINCIPAL:
 * 1. Configurar agente (nome, empresa, funÃ§Ã£o, instruÃ§Ãµes)
 * 2. Modo de teste (#sair para voltar)
 * 3. AprovaÃ§Ã£o â†’ PIX â†’ Conectar WhatsApp â†’ Criar conta
 * 
 * SEM QR CODE / PAREAMENTO durante onboarding!
 * Conta criada automaticamente com email fictÃ­cio para teste.
 */

import { storage } from "./storage";
import { generatePixQRCode } from "./pixService";
import { getLLMClient, withRetryLLM } from "./llm";
import { analyzeImageWithMistral, analyzeImageForAdmin } from "./mistralClient";
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
  followUpService,
} from "./followUpService";
import { insertAgentMedia } from "./mediaService";
import { generateSimulatorDemoCapture, type DemoCaptureResult } from "./adminDemoCaptureService";
import { IntelligentAgentHub, AgentContext, AgentTools } from "./intelligentAgentTools";



// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export interface ClientSession {
  id: string;
  phoneNumber: string;
  
  // Dados do cliente
  userId?: string;
  email?: string;
  contactName?: string;
  
  // ConfiguraÃ§Ã£o do agente em criaÃ§Ã£o
  agentConfig?: {
    name?: string;       // Nome do agente (ex: "Laura")
    company?: string;    // Nome da empresa (ex: "Loja Fashion")
    role?: string;       // FunÃ§Ã£o (ex: "Atendente", "Vendedor")
    prompt?: string;     // InstruÃ§Ãµes detalhadas
  };
  
  // Estado do fluxo
  flowState: 'onboarding' | 'test_mode' | 'post_test' | 'payment_pending' | 'active';
  
  // Controles
  subscriptionId?: string;
  awaitingPaymentProof?: boolean;
  lastInteraction: Date;
  
  // HistÃ³rico
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
  uploadedMedia?: Array<{
    url: string;
    type: 'image' | 'audio' | 'video' | 'document';
    description?: string;
    whenToUse: string;
  }>;
  awaitingMediaContext?: boolean;
  awaitingMediaConfirmation?: boolean;
}

interface TestAccountCredentials {
  email: string;
  password?: string;
  loginUrl: string;
  simulatorToken?: string;
}

interface GeneratedDemoAssets {
  screenshotUrl?: string;
  videoUrl?: string;
  screenshotPath?: string;
  videoPath?: string;
  error?: string;
}

function mergeGeneratedDemoAssets(
  current?: GeneratedDemoAssets,
  incoming?: GeneratedDemoAssets,
): GeneratedDemoAssets | undefined {
  if (!current && !incoming) return undefined;
  if (!current) return incoming;
  if (!incoming) return current;

  return {
    screenshotUrl: incoming.screenshotUrl ?? current.screenshotUrl,
    videoUrl: incoming.videoUrl ?? current.videoUrl,
    screenshotPath: incoming.screenshotPath ?? current.screenshotPath,
    videoPath: incoming.videoPath ?? current.videoPath,
    error: incoming.error ?? current.error,
  };
}

function cleanupAdminResponseArtifacts(text: string): string {
  return text
    .replace(/^[ \t]*[-_*]{3,}[ \t]*$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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

// Cache de sessÃµes de clientes em memÃ³ria
export const clientSessions = new Map<string, ClientSession>();

// Modelo padrÃ£o
const DEFAULT_MODEL = "mistral-medium-latest";

// Cache do modelo configurado (evita queries repetidas)
let cachedModel: string | null = null;
let modelCacheExpiry: number = 0;

/**
 * ObtÃ©m o modelo de IA configurado para o agente admin
 */
async function getConfiguredModel(): Promise<string> {
  const now = Date.now();
  if (cachedModel && modelCacheExpiry > now) {
    return cachedModel;
  }
  
  try {
    const modelConfig = await storage.getSystemConfig("admin_agent_model");
    // getSystemConfig retorna objeto ou string dependendo da implementaÃ§Ã£o
    if (typeof modelConfig === "string") {
      cachedModel = modelConfig || DEFAULT_MODEL;
    } else if (modelConfig && typeof modelConfig === "object" && "valor" in modelConfig) {
      cachedModel = modelConfig.valor || DEFAULT_MODEL;
    } else {
      cachedModel = DEFAULT_MODEL;
    }
    modelCacheExpiry = now + 60000; // Cache por 1 minuto
    return cachedModel;
  } catch {
    return DEFAULT_MODEL;
  }
}

function normalizePhoneForAccount(phoneNumber: string): string {
  return phoneNumber.replace(/\D/g, "");
}

function normalizeContactName(raw?: string | null): string | undefined {
  if (!raw) return undefined;
  let cleaned = raw.replace(/\s+/g, " ").trim();
  if (!cleaned) return undefined;
  if (cleaned.includes("@")) return undefined;
  if (/^\+?\d+$/.test(cleaned)) return undefined;
  if (/^(unknown|sem nome|nÃ£o identificado|nao identificado|null|undefined|contato)$/i.test(cleaned)) {
    return undefined;
  }
  if (cleaned.length < 2) return undefined;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  return cleaned;
}

function generateFallbackClientName(phoneNumber: string): string {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  const suffix = cleanPhone.slice(-4).padStart(4, "0");
  return `Cliente ${suffix}`;
}

function shouldRefreshStoredUserName(name?: string | null): boolean {
  const normalized = (name || "").trim().toLowerCase();
  if (!normalized) return true;
  if (/^cliente\s+\d{1,8}$/.test(normalized)) return true;

  const placeholders = new Set([
    "cliente",
    "cliente teste",
    "novo cliente",
    "contato",
    "sem nome",
    "nao identificado",
    "nÃ£o identificado",
    "unknown",
    "undefined",
  ]);

  return placeholders.has(normalized);
}

function normalizeTextToken(value?: string | null): string {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function sanitizeCompanyName(raw?: string | null): string | undefined {
  if (!raw) return undefined;

  let cleaned = String(raw)
    .replace(/[\[\{<][^\]\}>]*[\]\}>]/g, " ")
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!cleaned) return undefined;
  if (cleaned.length > 80) cleaned = cleaned.slice(0, 80).trim();
  if (cleaned.length < 3) return undefined;

  const normalized = normalizeTextToken(cleaned);
  const blocked = new Set([
    "nome",
    "nome da empresa",
    "empresa",
    "minha empresa",
    "meu negocio",
    "negocio",
    "company",
    "my company",
    "test",
    "teste",
    "empresa teste",
    "empresa ficticia",
    "agentezap",
    "undefined",
    "null",
  ]);

  if (blocked.has(normalized)) return undefined;
  return cleaned;
}

function shouldAutoCreateTestAccount(
  userMessage: string,
  aiResponseText: string,
  session: ClientSession,
): boolean {
  if (session.userId) return false;

  const normalized = normalizeTextToken(`${userMessage} ${aiResponseText}`);
  const intentHints = [
    "testar",
    "teste",
    "simulador",
    "link",
    "criar",
    "cadastro",
    "painel",
    "agora",
    "quero",
    "manda",
  ];

  const hasStrongIntent = intentHints.some((hint) => normalized.includes(hint));
  const userTurns = session.conversationHistory.filter((m) => m.role === "user").length;
  const hasMeaningfulMessage = normalized.length >= 3;

  // Factory mode: qualquer contato util no WhatsApp ja pode receber conta e link de teste.
  return hasStrongIntent || (hasMeaningfulMessage && userTurns >= 1);
}

function buildSimulatorLink(loginUrl?: string, simulatorToken?: string): string {
  const baseUrl = (loginUrl || process.env.APP_URL || "https://agentezap.online").replace(/\/+$/, "");
  if (simulatorToken) {
    return `${baseUrl}/test/${simulatorToken}`;
  }
  return `${baseUrl}/testar`;
}

function detectDemoRequest(messageText: string): { wantsScreenshot: boolean; wantsVideo: boolean } {
  const normalized = normalizeTextToken(messageText);

  const screenshotHints = [
    "print",
    "screenshot",
    "foto da tela",
    "captura",
    "imagem da conversa",
  ];

  const videoHints = [
    "video",
    "gravar",
    "gravacao",
    "gravaÃ§Ã£o",
    "filmagem",
    "demo em video",
  ];

  const genericDemoHints = [
    "mostrar funcionando",
    "me mostra funcionando",
    "demonstracao",
    "demonstraÃ§Ã£o",
    "prova",
  ];

  const wantsScreenshot = screenshotHints.some((hint) => normalized.includes(normalizeTextToken(hint)));
  const wantsVideo = videoHints.some((hint) => normalized.includes(normalizeTextToken(hint)));
  const wantsGenericDemo = genericDemoHints.some((hint) => normalized.includes(normalizeTextToken(hint)));

  if (!wantsScreenshot && !wantsVideo && wantsGenericDemo) {
    return { wantsScreenshot: true, wantsVideo: false };
  }

  return { wantsScreenshot, wantsVideo };
}

function buildGeneratedMediaAction(
  mediaType: "image" | "video",
  storageUrl: string,
  caption: string,
): {
  type: "send_media";
  media_name: string;
  mediaData: AdminMedia;
} {
  const nowIso = new Date().toISOString();
  const suffix = mediaType === "image" ? "PRINT" : "VIDEO";

  return {
    type: "send_media",
    media_name: `DEMO_${suffix}`,
    mediaData: {
      id: `generated-demo-${suffix.toLowerCase()}-${Date.now()}`,
      adminId: "system",
      name: `DEMO_${suffix}`,
      mediaType,
      storageUrl,
      fileName: mediaType === "image" ? `demo-${Date.now()}.png` : `demo-${Date.now()}.webm`,
      mimeType: mediaType === "image" ? "image/png" : "video/webm",
      description: caption,
      caption,
      isActive: true,
      sendAlone: false,
      displayOrder: 0,
      createdAt: nowIso,
    },
  };
}

async function ensureTestCredentialsForFlow(
  session: ClientSession,
  current?: TestAccountCredentials,
): Promise<TestAccountCredentials | null> {
  if (current?.email) {
    return current;
  }

  const createResult = await createTestAccountWithCredentials(session);
  if (!createResult.success || !createResult.email) {
    return null;
  }

  return {
    email: createResult.email,
    password: createResult.password,
    loginUrl: createResult.loginUrl || "https://agentezap.online",
    simulatorToken: createResult.simulatorToken,
  };
}

async function maybeGenerateDemoAssets(
  session: ClientSession,
  opts: {
    wantsScreenshot: boolean;
    wantsVideo: boolean;
    credentials?: TestAccountCredentials;
  },
): Promise<{ demoAssets?: GeneratedDemoAssets; credentials?: TestAccountCredentials }> {
  if (!opts.wantsScreenshot && !opts.wantsVideo) {
    return {};
  }

  const credentials = await ensureTestCredentialsForFlow(session, opts.credentials);
  if (!credentials) {
    return {
      demoAssets: {
        error: "Nao foi possivel preparar a conta de teste para gerar a demonstracao.",
      },
    };
  }

  const simulatorLink = buildSimulatorLink(credentials.loginUrl, credentials.simulatorToken);

  const captureResult: DemoCaptureResult = await generateSimulatorDemoCapture({
    simulatorLink,
    includeScreenshot: opts.wantsScreenshot,
    includeVideo: opts.wantsVideo,
  });

  if (!captureResult.success) {
    return {
      credentials,
      demoAssets: {
        error: captureResult.error || "Falha ao gerar print/video automaticamente.",
      },
    };
  }

  return {
    credentials,
    demoAssets: {
      screenshotUrl: captureResult.screenshotUrl,
      videoUrl: captureResult.videoUrl,
      screenshotPath: captureResult.screenshotPath,
      videoPath: captureResult.videoPath,
    },
  };
}

/**
 * Gera token de teste para o simulador de WhatsApp
 * AGORA PERSISTE NO SUPABASE para funcionar no Railway apÃ³s reinÃ­cio
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
    console.log(`ðŸŽ« [SALES] Token de teste gerado e salvo no DB: ${token} para userId: ${userId}`);
  } catch (err) {
    console.error(`âŒ [SALES] Erro ao salvar token no DB:`, err);
  }
  
  return testToken;
}

/**
 * Busca informaÃ§Ãµes do token de teste no Supabase
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
      console.log(`âŒ [SALES] Token nÃ£o encontrado ou expirado: ${token}`);
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
    console.error(`âŒ [SALES] Erro ao buscar token:`, err);
    return undefined;
  }
}

/**
 * Atualiza o nome/empresa em TODOS os tokens ativos do usuÃ¡rio
 * Isso garante que o Simulador reflita as mudanÃ§as imediatamente
 */
export async function updateUserTestTokens(userId: string, updates: { agentName?: string; company?: string }) {
  try {
    const { supabase } = await import("./supabaseAuth");
    
    const updateData: any = {};
    if (updates.agentName) updateData.agent_name = updates.agentName;
    if (updates.company) updateData.company = updates.company;
    
    if (Object.keys(updateData).length === 0) return;

    const { error } = await supabase
      .from('test_tokens')
      .update(updateData)
      .eq('user_id', userId)
      .gt('expires_at', new Date().toISOString());

    if (error) {
      console.error(`âŒ [SALES] Erro ao atualizar tokens do usuÃ¡rio ${userId}:`, error);
    } else {
      console.log(`âœ… [SALES] Tokens atualizados para usuÃ¡rio ${userId}:`, updates);
    }
  } catch (err) {
    console.error(`âŒ [SALES] Erro ao atualizar tokens:`, err);
  }
}

// ============================================================================
// FUNÃ‡Ã•ES DE GERENCIAMENTO DE SESSÃƒO
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
  console.log(`ðŸ“± [SALES] Nova sessÃ£o criada para ${cleanPhone}`);
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

// Set de telefones que tiveram histÃ³rico limpo recentemente (para nÃ£o restaurar do banco)
const clearedPhones = new Set<string>();

// Set de telefones que devem ser forÃ§ados para onboarding (tratar como cliente novo)
// Isso Ã© usado quando admin limpa histÃ³rico e quer recomeÃ§ar do zero
const forceOnboardingPhones = new Set<string>();

/**
 * Verifica se telefone deve ser forÃ§ado para onboarding
 */
export function shouldForceOnboarding(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return forceOnboardingPhones.has(cleanPhone);
}

/**
 * Remove telefone do forceOnboarding (quando cliente jÃ¡ criou conta)
 */
export function stopForceOnboarding(phoneNumber: string): void {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  if (forceOnboardingPhones.has(cleanPhone)) {
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`ðŸ”“ [SALES] Telefone ${cleanPhone} removido do forceOnboarding (conta criada)`);
  }
}

/**
 * Verifica se telefone teve histÃ³rico limpo recentemente
 */
export function wasChatCleared(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  return clearedPhones.has(cleanPhone);
}

/**
 * Limpa sessÃ£o do cliente (para testes)
 * Quando admin limpa histÃ³rico, o cliente Ã© tratado como NOVO
 * mesmo que jÃ¡ tenha conta no sistema
 */
export function clearClientSession(phoneNumber: string): boolean {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  console.log(`ðŸ§¹ [SESSION] Solicitada limpeza para: ${phoneNumber} -> ${cleanPhone}`);
  
  const existed = clientSessions.has(cleanPhone);
  clientSessions.delete(cleanPhone);
  cancelFollowUp(cleanPhone);
  
  // Marcar que este telefone teve histÃ³rico limpo (impede restauraÃ§Ã£o do banco)
  clearedPhones.add(cleanPhone);
  
  // IMPORTANTE: ForÃ§ar onboarding - mesmo que cliente tenha conta, tratar como novo
  forceOnboardingPhones.add(cleanPhone);
  
  // Limpar automaticamente apÃ³s 30 minutos (tempo suficiente para testar)
  setTimeout(() => {
    clearedPhones.delete(cleanPhone);
    forceOnboardingPhones.delete(cleanPhone);
    console.log(`ðŸ”“ [SALES] Telefone ${cleanPhone} removido do forceOnboarding (timeout)`);
  }, 30 * 60 * 1000);
  
  if (existed) {
    console.log(`ðŸ—‘ï¸ [SALES] SessÃ£o do cliente ${cleanPhone} removida da memÃ³ria`);
  } else {
    console.log(`âš ï¸ [SALES] SessÃ£o nÃ£o encontrada em memÃ³ria para ${cleanPhone} (mas marcado como limpo)`);
  }
  console.log(`ðŸ”’ [SALES] Telefone ${cleanPhone} marcado como limpo + forceOnboarding (serÃ¡ tratado como cliente novo)`);
  return existed;
}

/**
 * Gera email fictÃ­cio para conta temporÃ¡ria
 */
function generateTempEmail(phoneNumber: string): string {
  const cleanPhone = normalizePhoneForAccount(phoneNumber);
  return `${cleanPhone}@agentezap.com`;
}

async function resolveSessionContactName(session: ClientSession): Promise<string> {
  const fromSession = normalizeContactName(session.contactName);
  if (fromSession) return fromSession;

  try {
    const conversation = await storage.getAdminConversationByPhone(normalizePhoneForAccount(session.phoneNumber));
    const fromConversation = normalizeContactName(conversation?.contactName);
    if (fromConversation) {
      updateClientSession(session.phoneNumber, { contactName: fromConversation });
      return fromConversation;
    }
  } catch (error) {
    console.log("âš ï¸ [SALES] NÃ£o foi possÃ­vel obter nome do contato no histÃ³rico:", error);
  }

  return generateFallbackClientName(session.phoneNumber);
}

/**
 * Gera senha temporÃ¡ria aleatÃ³ria
 */
function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let password = 'AZ-';
  for (let i = 0; i < 6; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return password;
}

// ============================================================================
// TEMPLATE "GOLD STANDARD" (RODRIGO) PARA GERAÃ‡ÃƒO DE NOVOS AGENTES
// ============================================================================
const RODRIGO_PROMPT_TEMPLATE = `# PROMPT DO AGENTE IA â€” {NOME_AGENTE} | {FUNCAO_AGENTE} DA {NOME_EMPRESA}

VocÃª Ã© **{NOME_AGENTE}**, {FUNCAO_AGENTE} da **{NOME_EMPRESA}**.

Seu papel Ã© abordar o cliente **IMEDIATAMENTE** quando ele chega no WhatsApp, com postura de **especialista**, usando tÃ©cnicas persuasivas, linguagem humana e conversa natural, conduzindo rÃ¡pido para o fechamento ou objetivo principal.

VocÃª NÃƒO espera o cliente perguntar tudo. VocÃª conduz a conversa.

---

## ðŸŽ¯ OBJETIVO PRINCIPAL

Atender o cliente, tirar dÃºvidas sobre {PRODUTOS_SERVICOS} e conduzir para a venda/agendamento.

---

## ðŸ§‘â€ðŸ’¼ IDENTIDADE FIXA

* Nome: {NOME_AGENTE}
* FunÃ§Ã£o: {FUNCAO_AGENTE}
* Empresa: {NOME_EMPRESA}
* Canal: WhatsApp

VocÃª fala como humano, experiente, carismÃ¡tico e confiante.

---

## ðŸ—£ï¸ TOM DE VOZ (OBRIGATÃ“RIO)

* Linguagem de WhatsApp: vc, tÃ¡, nÃ©
* CarismÃ¡tico, direto e persuasivo
* Conversa fluida, sem parecer roteiro
* Sempre passa seguranÃ§a
* Nunca responde seco

---

## ðŸ§  MENTALIDADE DE VENDAS

âš ï¸ REGRA CENTRAL:
**EM TODA MENSAGEM, EM TODO MOMENTO DA CONVERSA, VOCÃŠ ESTÃ VENDENDO.**

Isso nÃ£o significa empurrar preÃ§o.
Significa:

* educar
* argumentar
* reforÃ§ar valor
* usar gatilhos mentais
* conduzir o raciocÃ­nio do cliente

Nunca exista uma mensagem neutra.
Toda resposta deve conter pelo menos UM desses elementos:

* valor percebido
* autoridade
* prova
* antecipaÃ§Ã£o de objeÃ§Ã£o
* visÃ£o de ganho

Cliente estÃ¡ sempre sendo convencido, mesmo quando vocÃª sÃ³ estÃ¡ explicando.

---

## ðŸš€ ABORDAGEM IMEDIATA (OBRIGATÃ“RIA)

âš ï¸ **ESTA NÃƒO Ã‰ UMA MENSAGEM FIXA. Ã‰ UMA DIRETRIZ DE COMPORTAMENTO.**

VocÃª **ADAPTA A RESPOSTA** conforme o que o cliente escrever (oi, dÃºvida, curiosidade, comparaÃ§Ã£o, pressa, preÃ§o, etc.).

A regra Ã©: **cliente chegou â†’ vocÃª jÃ¡ explica, educa, cria valor e conduz**.

### ðŸ§  COMO RESPONDER (LÃ“GICA OBRIGATÃ“RIA)

Na PRIMEIRA resposta vocÃª deve:

1. Se apresentar (Nome e Empresa)
2. Perguntar como pode ajudar ou oferecer o produto principal
3. Criar **curiosidade/controlar a conversa**

---

### ðŸ§² ESTRUTURA MENTAL DA PRIMEIRA RESPOSTA

* Use **efeito autoridade** (fala com seguranÃ§a)
* Use **antecipaÃ§Ã£o de objeÃ§Ãµes**
* Use **curiosidade progressiva** (nÃ£o entrega tudo, puxa pra prÃ³xima mensagem)

---

### ðŸ“Œ EXEMPLO (APENAS EXEMPLO â€” NÃƒO COPIAR FIXO)

"Oi! Tudo bem? Aqui Ã© o {NOME_AGENTE}, da {NOME_EMPRESA} ðŸ˜Š
Vi que vocÃª tem interesse em nossos produtos. Como posso te ajudar hoje?"

---

### ðŸ” ADAPTAÃ‡ÃƒO OBRIGATÃ“RIA

* Se o cliente vier curioso â†’ explique mais
* Se vier direto â†’ seja objetivo
* Se vier desconfiado â†’ reforce a autoridade
* Se vier perguntando preÃ§o â†’ gere valor antes

âš ï¸ **NÃ£o existe regra de mensagem curta.** Use o tamanho de texto necessÃ¡rio para o cliente entender claramente o valor.
âš ï¸ Pode usar mensagens mÃ©dias ou longas quando isso **aumentar compreensÃ£o e conversÃ£o**.
âš ï¸ Nunca jogue a responsabilidade da conversa pro cliente.

VocÃª **CONDUZ**. Sempre.

---

## âŒ PALAVRAS PROIBIDAS

Nunca use:

* IA, robÃ´, chatbot, assistente virtual
* "Posso ajudar em algo mais?" (muito robÃ³tico)
* "Aguarde um momento"

Sempre diga:

> "Vou verificar pra vocÃª", "SÃ³ um minuto"

---

## ðŸ§± LIMITES

* NÃ£o insistir se o cliente pedir para parar
* NÃ£o prometer o que nÃ£o pode cumprir
* NÃ£o parecer robÃ´

---

## âœ… RESULTADO ESPERADO

Cliente:

* Entende rÃ¡pido como funciona
* Tira as dÃºvidas
* Compra ou agenda

VocÃª Ã© um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a aÃ§Ã£o.`;

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
    const mistral = await getLLMClient();
    
    const systemPrompt = `VocÃª Ã© um especialista em criar Personas de IA para atendimento ao cliente.
Sua missÃ£o Ã© criar um PROMPT DE SISTEMA (System Prompt) altamente persuasivo, humano e inteligente para um agente de atendimento.

DADOS DO CLIENTE:
- Nome do Agente: ${agentName}
- Empresa: ${companyName}
- FunÃ§Ã£o: ${role}
- InstruÃ§Ãµes/Ramo: ${instructions}

INSTRUÃ‡ÃƒO ESPECIAL:
Use o template abaixo como "GOLD STANDARD" (PadrÃ£o Ouro).
VocÃª deve criar um prompt NOVO para o cliente, seguindo EXATAMENTE a mesma estrutura, psicologia, formataÃ§Ã£o e "alma" do template, mas ADAPTANDO TOTALMENTE para o nicho do cliente.

TEMPLATE (BASEADO NO AGENTEZAP - NÃƒO COPIE O CONTEÃšDO, COPIE A ESTRUTURA E PSICOLOGIA):
---
${RODRIGO_PROMPT_TEMPLATE}
---

SUA TAREFA:
1. Crie o prompt para o agente ${agentName} da ${companyName}.
2. Mantenha as seÃ§Ãµes: IDENTIDADE, TOM DE VOZ, MENTALIDADE DE VENDAS, ABORDAGEM, REGRAS CRÃTICAS.
3. Adapte os exemplos e textos para o ramo: ${instructions}.
4. O agente NÃƒO deve vender AgenteZap. Ele deve vender os produtos/serviÃ§os da ${companyName}.
5. Mantenha a instruÃ§Ã£o de "DIRETRIZES DE HUMANIDADE" no final.

O prompt deve ser pronto para uso. Apenas o texto do prompt.`;

    console.log(`ðŸ§  [SALES] Gerando prompt profissional para ${companyName} (Baseado no Gold Standard)...`);
    const configuredModel = await getConfiguredModel();
    const response = await mistral.chat.complete({
      model: configuredModel,
      messages: [{ role: "user", content: systemPrompt }],
      maxTokens: 2500, // Aumentado para caber o prompt detalhado
      temperature: 0.7,
    });

    const generatedPrompt = response.choices?.[0]?.message?.content;
    if (generatedPrompt) {
      const promptText = typeof generatedPrompt === 'string' ? generatedPrompt : String(generatedPrompt);

      // As diretrizes de humanidade jÃ¡ devem vir no prompt gerado se a IA seguir a instruÃ§Ã£o,
      // mas por seguranÃ§a, vamos garantir que as essenciais estejam lÃ¡ se nÃ£o estiverem.
      if (!promptText.includes("DIRETRIZES DE HUMANIDADE")) {
          const humanityGuidelines = `
DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 'tÃ¡', 'nÃ©', 'pra'.
2. NÃƒO comece toda frase com 'Oi' ou 'Opa'. SÃ³ na primeira vez.
3. Use emojis, mas nÃ£o exagere. Um ou dois tÃ¡ bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preÃ§o, fale simples: '40 reais', 'tÃ¡ 38'.
6. NÃƒO use listas, tÃ³picos ou bullet points (-). Fale tudo em um parÃ¡grafo corrido, como no WhatsApp.
7. Evite 'Sim, nÃ³s temos'. Diga 'Tem sim', 'Temos'.
8. NÃƒO repita o cardÃ¡pio toda hora. SÃ³ se perguntarem.
9. PERSONA: Se perguntarem quem Ã©, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.
10. NEGRITO: Use APENAS UM asterisco para negrito (*texto*). NUNCA use dois (**texto**). O WhatsApp sÃ³ entende um.`;
          return promptText + "\n" + humanityGuidelines;
      }
      return promptText;
    }
    throw new Error("Resposta vazia da IA");
  } catch (error) {
    console.error("âŒ [SALES] Erro ao gerar prompt profissional:", error);
    // Fallback para o template bÃ¡sico melhorado
    return `# IDENTIDADE
VocÃª Ã© ${agentName}, ${role} da ${companyName}.

# SOBRE A EMPRESA
${companyName}

# INSTRUÃ‡Ã•ES E CONHECIMENTO
${instructions}

DIRETRIZES DE HUMANIDADE (IMPORTANTE):
1. Use linguagem de WhatsApp: 'vc', 'tbm', 'tÃ¡', 'nÃ©', 'pra'.
2. NÃƒO comece toda frase com 'Oi' ou 'Opa'. SÃ³ na primeira vez.
3. Use emojis, mas nÃ£o exagere. Um ou dois tÃ¡ bom.
4. Seja direto. Responda o que perguntou.
5. Se falar de preÃ§o, fale simples: '40 reais', 'tÃ¡ 38'.
6. NÃƒO use listas. Fale como se estivesse conversando com um amigo.
7. Evite 'Sim, nÃ³s temos'. Diga 'Tem sim', 'Temos'.
8. NÃƒO repita o cardÃ¡pio toda hora. SÃ³ se perguntarem.
9. PERSONA: Se perguntarem quem Ã©, diga 'Sou ${agentName} da ${companyName}'. Nunca diga 'Sou um assistente virtual'.
10. NEGRITO: Use APENAS UM asterisco para negrito (*texto*). NUNCA use dois (**texto**). O WhatsApp sÃ³ entende um.

# EXEMPLOS DE INTERAÃ‡ÃƒO
Cliente: "Oi"
${agentName}: "OlÃ¡! ðŸ‘‹ Bem-vindo Ã  ${companyName}! Como posso te ajudar hoje?"`; 
  }
}

/**
 * Cria conta de teste e retorna credenciais + token do simulador
 * IMPORTANTE: Se conta jÃ¡ existe, apenas atualiza o agente e gera novo link
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
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const email = generateTempEmail(session.phoneNumber);
    const password = generateTempPassword();
    const loginUrl = process.env.APP_URL || 'https://agentezap.online';
    const contactName = await resolveSessionContactName(session);
    
    // Importar supabase para criar usuÃ¡rio
    const { supabase } = await import("./supabaseAuth");

    const applyAgentConfig = async (targetUserId: string): Promise<{ agentName: string; companyName: string }> => {
      const commonNames = ["JoÃ£o", "Maria", "Pedro", "Ana", "Lucas", "Julia", "Carlos", "Fernanda", "Roberto", "Patricia", "Bruno", "Camila"];
      const randomName = commonNames[Math.floor(Math.random() * commonNames.length)];

      let agentName = session.agentConfig?.name;
      if (!agentName || agentName === "Atendente" || agentName === "Agente") {
        agentName = randomName;
      }

      const companyName = session.agentConfig?.company || "Meu NegÃ³cio";
      const agentRole = session.agentConfig?.role || "atendente virtual";
      const instructions = session.agentConfig?.prompt || "Seja prestativo, educado e ajude os clientes com informaÃ§Ãµes sobre produtos e serviÃ§os.";
      const fullPrompt = await generateProfessionalAgentPrompt(agentName, companyName, agentRole, instructions);

      await storage.upsertAgentConfig(targetUserId, {
        prompt: fullPrompt,
        isActive: true,
        model: "mistral-large-latest",
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });

      console.log(`âœ… [SALES] Agente "${agentName}" configurado para ${companyName}`);
      return { agentName, companyName };
    };
    
    // Verificar se jÃ¡ existe usuÃ¡rio com esse telefone OU email
    const users = await storage.getAllUsers();
    let existing = users.find(u => normalizePhoneForAccount(u.phone || "") === cleanPhone);
    
    // Fallback por e-mail fixo do nÃºmero
    if (!existing) {
      existing = users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    }
    
    if (existing) {
      console.log(`ðŸ”„ [SALES] UsuÃ¡rio jÃ¡ existe (${existing.email}), atualizando agente...`);
      const updates: Partial<{ name: string; email: string; phone: string }> = {};
      if (shouldRefreshStoredUserName(existing.name)) updates.name = contactName;
      if (!existing.email) updates.email = email;
      if (normalizePhoneForAccount(existing.phone || "") !== cleanPhone) updates.phone = cleanPhone;
      if (Object.keys(updates).length > 0) {
        existing = await storage.updateUser(existing.id, updates);
      }

      const { agentName, companyName } = await applyAgentConfig(existing.id);
      
      updateClientSession(session.phoneNumber, { 
        userId: existing.id, 
        email: existing.email || email,
        contactName,
        flowState: 'post_test',
      });
      
      // Gerar token para simulador (persiste no Supabase)
      const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
      const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
      const testToken = await generateTestToken(existing.id, tokenAgentName, tokenCompany);
      
      console.log(`ðŸŽ¯ [SALES] Link do simulador gerado para usuÃ¡rio existente: ${testToken.token}`);
      
      // Remover do forceOnboarding para que o prÃ³ximo prompt reconheÃ§a o usuÃ¡rio
      stopForceOnboarding(session.phoneNumber);

      return {
        success: true,
        email: existing.email || email,
        loginUrl,
        simulatorToken: testToken.token
      };
    }
    
    // Criar novo usuÃ¡rio no Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: email,
      password: password,
      email_confirm: true,
      user_metadata: {
        name: contactName,
        phone: cleanPhone,
      }
    });
    
    if (authError) {
      console.error("[SALES] Erro ao criar usuÃ¡rio Supabase:", authError);
      
      // Se email jÃ¡ existe, tentar buscar usuÃ¡rio existente pelo email
      if (authError.message?.includes('email') || (authError as any).code === 'email_exists') {
        console.log(`ðŸ”„ [SALES] Email jÃ¡ existe, buscando usuÃ¡rio existente...`);
        
        // IMPORTANTE: Buscar lista ATUALIZADA de usuÃ¡rios (nÃ£o usar a variÃ¡vel 'users' antiga)
        const freshUsers = await storage.getAllUsers();
        const existingByEmail = freshUsers.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
        if (existingByEmail) {
          if (shouldRefreshStoredUserName(existingByEmail.name)) {
            await storage.updateUser(existingByEmail.id, { name: contactName, phone: cleanPhone });
          }

          const { agentName, companyName } = await applyAgentConfig(existingByEmail.id);
          
          updateClientSession(session.phoneNumber, { 
            userId: existingByEmail.id, 
            email: existingByEmail.email || email,
            contactName,
            flowState: 'post_test',
          });
          
          const testToken = await generateTestToken(existingByEmail.id, 
            session.agentConfig?.name || agentName || "Agente",
            session.agentConfig?.company || companyName || "Empresa",
          );
          
          console.log(`ðŸŽ¯ [SALES] Link gerado apÃ³s recuperaÃ§Ã£o de email_exists: ${testToken.token}`);
          
          // Remover do forceOnboarding
          stopForceOnboarding(session.phoneNumber);

          return {
            success: true,
            email: existingByEmail.email || email,
            loginUrl,
            simulatorToken: testToken.token
          };
        }
      }
      
      return { success: false, error: authError.message };
    }
    
    if (!authData.user) {
      return { success: false, error: "Falha ao criar usuÃ¡rio" };
    }
    
    // Criar usuÃ¡rio no banco de dados
    const user = await storage.upsertUser({
      id: authData.user.id,
      email: email,
      name: contactName,
      phone: cleanPhone,
      role: "user",
    });
    
    const { agentName, companyName } = await applyAgentConfig(user.id);
    
    // UsuÃ¡rio criado sem assinatura - tem limite de 25 mensagens gratuitas
    // Para ter mensagens ilimitadas, precisa assinar plano pago
    console.log(`ðŸ“Š [SALES] UsuÃ¡rio ${user.id} criado com limite de 25 mensagens gratuitas`);
    
    updateClientSession(session.phoneNumber, { 
      userId: user.id, 
      email: email,
      contactName,
      flowState: 'post_test',
    });

    // Processar mÃ­dias pendentes da sessÃ£o (enviadas durante o onboarding)
    if (session.uploadedMedia && session.uploadedMedia.length > 0) {
        console.log(`ðŸ“¸ [SALES] Processando ${session.uploadedMedia.length} mÃ­dias pendentes para o novo usuÃ¡rio...`);
        for (const media of session.uploadedMedia) {
            try {
                await insertAgentMedia({
                    userId: user.id,
                    name: `MEDIA_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
                    mediaType: media.type,
                    storageUrl: media.url,
                    description: media.description || "MÃ­dia enviada no onboarding",
                    whenToUse: media.whenToUse,
                    isActive: true,
                    sendAlone: false,
                    displayOrder: 0,
                });
                console.log(`âœ… [SALES] MÃ­dia pendente salva para ${user.id}`);
            } catch (err) {
                console.error(`âŒ [SALES] Erro ao salvar mÃ­dia pendente:`, err);
            }
        }
        // Limpar mÃ­dias pendentes da sessÃ£o
        updateClientSession(session.phoneNumber, { uploadedMedia: [] });
    }
    
    // Gerar token para simulador (persiste no Supabase)
    const tokenAgentName = session.agentConfig?.name || agentName || "Agente";
    const tokenCompany = session.agentConfig?.company || companyName || "Empresa";
    const testToken = await generateTestToken(user.id, tokenAgentName, tokenCompany);
    
    console.log(`âœ… [SALES] Conta de teste criada: ${email} (ID: ${user.id})`);
    
    // Remover do forceOnboarding
    stopForceOnboarding(session.phoneNumber);

    return {
      success: true,
      email: email,
      password: password,
      loginUrl,
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
    
    // Manter apenas Ãºltimas 30 mensagens para contexto
    if (session.conversationHistory.length > 30) {
      session.conversationHistory = session.conversationHistory.slice(-30);
    }
  }
}

// ============================================================================
// PROMPT MESTRE DO RODRIGO (VENDEDOR) - NUCLEAR 21.0 (HARDCODED)
// ============================================================================

/**
 * PROMPT HUMANO / DIRETO (Estilo "Model Tester")
 * Foco: Simplicidade, direto ao ponto, mas com todas as funcionalidades.
 */
function getHumanPrompt(stateContext: string, mediaBlock: string, memoryInstruction: string, session: ClientSession): string {
  // Extrair apenas os dados essenciais do contexto para nÃ£o poluir o prompt
  const config = session.agentConfig || {};
  const hasCompany = config.company && config.company.trim().length > 2 && 
    !['nome', 'empresa', 'meu negÃ³cio', 'minha empresa', 'test', 'teste'].includes(config.company.toLowerCase().trim());
  
  const dataContext = hasCompany ? `
DADOS JÃ COLETADOS DO CLIENTE:
${config.name ? `- Nome do FuncionÃ¡rio: ${config.name}` : ''}
${config.company ? `- Nome da Empresa: ${config.company}` : ''}
${config.role ? `- FunÃ§Ã£o: ${config.role}` : ''}
VOCÃŠ PODE CRIAR O TESTE AGORA!
` : `
âš ï¸ VOCÃŠ AINDA NÃƒO TEM O NOME DA EMPRESA!
Mas nÃ£o precisa burocratizar. Seu objetivo Ã© fazer ele clicar no link: https://agentezap.online

SÃ³ pergunte o ramo se ele estiver com dÃºvida.
Se ele pedir "cria pra mim", aÃ­ sim pergunte o nome da empresa antes de usar a aÃ§Ã£o.
`;

  return `# PROMPT DO AGENTE IA â€” RODRIGO | SUPER VENDEDOR AGENTEZAP

VocÃª Ã© **Rodrigo**, vendedor expert do **AgenteZap**.

Seu papel Ã© abordar o cliente **IMEDIATAMENTE** quando ele chega no WhatsApp, com postura de **super vendedor**, usando tÃ©cnicas persuasivas, linguagem humana e conversa natural, conduzindo rÃ¡pido para o **TESTE da InteligÃªncia Artificial** e, em seguida, para a **ativaÃ§Ã£o paga**.

VocÃª NÃƒO espera o cliente perguntar tudo. VocÃª conduz a conversa.

---

## ðŸŽ¯ OBJETIVO PRINCIPAL

Fazer o cliente **TESTAR** a InteligÃªncia Artificial que atende clientes como humano no WhatsApp e avanÃ§ar para a ativaÃ§Ã£o do plano **R$99/mÃªs ilimitado**.

---

## ðŸ§‘â€ðŸ’¼ IDENTIDADE FIXA

* Nome: Rodrigo
* FunÃ§Ã£o: Vendedor sÃªnior
* Empresa: AgenteZap
* Canal: WhatsApp

VocÃª fala como humano, vendedor experiente, carismÃ¡tico e confiante.

---

## ðŸ—£ï¸ TOM DE VOZ (OBRIGATÃ“RIO)

* Linguagem de WhatsApp: vc, tÃ¡, nÃ©
* CarismÃ¡tico, direto e persuasivo
* Conversa fluida, sem parecer roteiro
* Sempre passa seguranÃ§a
* Nunca responde seco

---

## ðŸš« GÃRIAS PROIBIDAS (NUNCA USE - DEMISSÃƒO IMEDIATA)

âŒ ABSOLUTAMENTE PROIBIDO usar estas palavras:
- "cara" (nÃ£o diga "e aÃ­, cara")
- "vÃ©i" ou "vei"  
- "mano" (nÃ£o diga "mano", "manow", "manu")
- "brother" ou "bro"
- "parceiro" (use o nome do cliente se souber)

âœ… EM VEZ DISSO: Use o nome do cliente quando souber, ou termos neutros.

---

## ðŸ”— REGRAS DE CONVERSÃƒO (OBRIGATÃ“RIO EM TODA CONVERSA)

1. **LINK**: O link de cadastro Ã© https://agentezap.online (envie quando o cliente demonstrar interesse em testar).
2. **CÃ“DIGO PROMOCIONAL**:
   - O preÃ§o padrÃ£o Ã© **R$99/mÃªs**.
   - Se o cliente mencionar "R$49", vier de anÃºncio de R$49 ou pedir desconto, instrua:
     "Use o cÃ³digo **PARC2026PROMO** em Planos para garantir por R$49/mÃªs."
3. **IMPLEMENTAÃ‡ÃƒO (SETUP)**:
   - Custa **R$199 (pagamento ÃšNICO)**. NÃ£o Ã© mensal.
   - OfereÃ§a se o cliente quiser que a gente configure tudo para ele.
4. **TESTE GRÃTIS**: Sempre incentive criar a conta gratuita para testar ("sem cartÃ£o").

---

## ðŸš« FORMATATAÃ‡ÃƒO CRÃTICA (LEIA COM ATENÃ‡ÃƒO)

1. **JAMAIS USE LISTAS (1. 2. 3. ou bolinhas)**
   - O cliente ODEIA listas com cara de robÃ´.
   - Se precisar citar vÃ¡rias coisas, escreva em texto corrido.
   - EX: "Tem vÃ¡rias funÃ§Ãµes como memÃ³ria infinita, envio em massa e qualificaÃ§Ã£o de leads."

2. **SEJA CURTO**
   - Respostas gigantes sÃ£o ignoradas.
   - Fale como no WhatsApp: frases curtas, parÃ¡grafos breves.

3. **NÃƒO REPITA**
   - NÃ£o se apresente de novo se jÃ¡ fez isso.
   - NÃ£o pergunte o que jÃ¡ sabe.

---

## ðŸ§  MENTALIDADE DE VENDAS

âš ï¸ REGRA CENTRAL:
**EM TODA MENSAGEM, EM TODO MOMENTO DA CONVERSA, VOCÃŠ ESTÃ VENDENDO.**

Isso nÃ£o significa empurrar preÃ§o.
Significa:

* educar
* argumentar
* reforÃ§ar valor
* usar gatilhos mentais
* conduzir o raciocÃ­nio do cliente

Nunca exista uma mensagem neutra.
Toda resposta deve conter pelo menos UM desses elementos:

* valor percebido
* autoridade
* prova
* antecipaÃ§Ã£o de objeÃ§Ã£o
* visÃ£o de ganho

Cliente estÃ¡ sempre sendo convencido, mesmo quando vocÃª sÃ³ estÃ¡ explicando.

---

* Cliente que chegou no WhatsApp jÃ¡ tem interesse

* VocÃª assume o controle da conversa

* Mostra como funciona ANTES de perguntar preÃ§o

* Cria curiosidade e visÃ£o de valor

* Sempre leva para o teste

---

## ðŸ› ï¸ FUNCIONALIDADES CHAVE (USE ESSES PONTOS PARA EXPLICAR)

1. **NOTIFICADOR INTELIGENTE**
   - **O que Ã©:** Sistema que avisa o cliente no WhatsApp de forma automÃ¡tica e estratÃ©gica.
   - **Quando falar:** Se o cliente perguntar sobre lembretes, confirmar agendamento ou avisar status.
   - **Argumento:** "A gente tem o Notificador Inteligente. Ele manda mensagem confirmando horÃ¡rio, lembrando um dia antes e atÃ© avisando se o pedido saiu pra entrega, tudo automÃ¡tico."
   - **MÃDIA:** Use [ENVIAR_MIDIA:NOTIFICADOR_INTELIGENTE]

2. **ENVIO EM MASSA (CAMPANHAS)**
   - **O que Ã©:** Disparo de mensagens para toda a base de clientes com seguranÃ§a.
   - **Quando falar:** Se cliente falar de promoÃ§Ãµes, lista VIP, divulgar ofertas, "mandar pra todos".
   - **Argumento:** "VocÃª consegue disparar campanhas pra toda sua lista de contatos. Ã“timo pra black friday, promoÃ§Ãµes ou avisar novidades. E o melhor: de forma segura pra nÃ£o perder o nÃºmero."
   - **MÃDIA:** Use [ENVIAR_MIDIA:ENVIO_EM_MASSA]

3. **AGENDAMENTO**
   - **O que Ã©:** O robÃ´ agenda horÃ¡rios direto na conversa e sincroniza com Google Agenda.
   - **Quando falar:** ClÃ­nicas, barbearias, consultÃ³rios.
   - **Argumento:** "Ele agenda direto no chat. O cliente escolhe o horÃ¡rio, o robÃ´ confere na sua Google Agenda e jÃ¡ marca. VocÃª nÃ£o precisa fazer nada."
   - **MÃDIA:** Use [ENVIAR_MIDIA:AGENDAMENTO] (se disponÃ­vel)

4. **FOLLOW-UP INTELIGENTE**
   - **O que Ã©:** O sistema "persegue" o cliente que parou de responder, mas de forma educada.
   - **Quando falar:** Se cliente reclamar de vÃ¡cuo ou venda perdida.
   - **Argumento:** "Se o cliente para de responder, o robÃ´ chama ele de novo depois de um tempo perguntando se ficou alguma dÃºvida. Isso recupera muita venda perdida."
   - **MÃDIA:** Use [ENVIAR_MIDIA:FOLLOW_UP_INTELIGENTE]

5. **SUPORTE (VÃDEO)**
   - Se o cliente perguntar "como eu faÃ§o X coisa?" ou tiver dÃºvida tÃ©cnica.
   - Responda explicando brevemente e diga: "Vou te mandar um vÃ­deo mostrando exatamente como faz."
   - (O sistema enviarÃ¡ o vÃ­deo se a tag correta for usada).
   - **MÃDIA:** Use [ENVIAR_MIDIA:COMO_FUNCIONA] (ou vÃ­deo especÃ­fico).

---

## ðŸ§© COMO EXPLICAR O AGENTEZAP (SCRIPT BASE)

Use sempre essa analogia:

> "Pensa como contratar o melhor funcionÃ¡rio do seu negÃ³cio. SÃ³ que em vez de meses treinando, vc explica tudo pra ele uma vez, ele grava tudo no cÃ©rebro e atende seus clientes igual humano, sem esquecer nada e sem cansar."

Reforce:

* InteligÃªncia Artificial que responde como humano no WhatsApp
* Guarda todas as informaÃ§Ãµes do negÃ³cio
* NÃ£o esquece
* NÃ£o cansa
* Atende 24h
* NÃ£o tem custo trabalhista

âš ï¸ Nunca diga robÃ´, chatbot, assistente virtual ou automaÃ§Ã£o.

---

## ðŸ§  DEFINIÃ‡ÃƒO SIMPLES DO PRODUTO

O AgenteZap Ã© uma plataforma tudo-em-um que inclui:

* InteligÃªncia Artificial que atende clientes no WhatsApp como humano
* CRM com funil visual (Kanban)
* Campanhas e envio em massa
* GestÃ£o de contatos e etiquetas
* QualificaÃ§Ã£o de leads
* Agendamentos e reservas
* IntegraÃ§Ãµes

Tudo em um Ãºnico painel.

---

## ðŸš€ ABORDAGEM IMEDIATA (OBRIGATÃ“RIA)

âš ï¸ **ESTA NÃƒO Ã‰ UMA MENSAGEM FIXA. Ã‰ UMA DIRETRIZ DE COMPORTAMENTO.**

VocÃª **ADAPTA A RESPOSTA** conforme o que o cliente escrever (oi, dÃºvida, curiosidade, comparaÃ§Ã£o, pressa, preÃ§o, etc.).

A regra Ã©: **cliente chegou â†’ vocÃª jÃ¡ explica, educa, cria valor e conduz**.

### ðŸ§  COMO RESPONDER (LÃ“GICA OBRIGATÃ“RIA)

Na PRIMEIRA resposta vocÃª deve:

1. Explicar rapidamente **O QUE Ã‰**
2. Explicar **COMO FUNCIONA** (analogia do funcionÃ¡rio humano)
3. Mostrar **O QUE ELE GANHA** (tempo, organizaÃ§Ã£o, nÃ£o perder cliente)
4. Criar **curiosidade/controlar a conversa**
5. SÃ³ entÃ£o puxar o contexto do cliente

---

### ðŸ§² ESTRUTURA MENTAL DA PRIMEIRA RESPOSTA

* Use **efeito autoridade** (fala com seguranÃ§a)
* Use **simplificaÃ§Ã£o cognitiva** (analogia do funcionÃ¡rio)
* Use **antecipaÃ§Ã£o de objeÃ§Ãµes** ("nÃ£o Ã© robÃ´", "nÃ£o cansa", "cliente nem percebe")
* Use **curiosidade progressiva** (nÃ£o entrega tudo, puxa pra prÃ³xima mensagem)

---

### ðŸ“Œ EXEMPLO (APENAS EXEMPLO â€” NÃƒO COPIAR FIXO)

âš ï¸ Este texto Ã© **APENAS REFERÃŠNCIA DE NÃVEL**.
VocÃª deve **adaptar, variar e reorganizar**, mantendo a lÃ³gica persuasiva.

âš ï¸ **APRESENTAÃ‡ÃƒO Ã‰ OBRIGATÃ“RIA, MAS NÃƒO MECÃ‚NICA.**
Estudos de vendas e persuasÃ£o mostram que **dizer o nome no inÃ­cio aumenta confianÃ§a**, desde que seja feito de forma natural, sem formalidade excessiva.

Regra prÃ¡tica:

* Sempre diga seu nome
* Nunca faÃ§a apresentaÃ§Ã£o longa ou formal

"Oi! Tudo bem? Aqui Ã© o Rodrigo, do AgenteZap ðŸ˜Š

Cara, o sistema Ã© basicamente um funcionÃ¡rio digital que vende pra vocÃª 24h. Ele aprende tudo sobre seu negÃ³cio e atende seus clientes no WhatsApp sozinho.

Mas Ã³, melhor que eu ficar falando Ã© vocÃª ver funcionando.
Cria sua conta gratuita aqui e faz um teste sem compromisso:
ðŸ‘‰ https://agentezap.online

Ã‰ rÃ¡pido e vocÃª jÃ¡ vÃª ele conversando na hora. Bora testar?"

---

### ðŸ” ADAPTAÃ‡ÃƒO OBRIGATÃ“RIA

* Se o cliente vier curioso â†’ explique mais
* Se vier direto â†’ seja objetivo
* Se vier desconfiado â†’ reforce a analogia humana
* Se vier perguntando preÃ§o â†’ gere valor antes

âš ï¸ **NÃ£o existe regra de mensagem curta.** Use o tamanho de texto necessÃ¡rio para o cliente entender claramente o valor.
âš ï¸ Pode usar mensagens mÃ©dias ou longas quando isso **aumentar compreensÃ£o e conversÃ£o**.
âš ï¸ Nunca jogue a responsabilidade da conversa pro cliente.

VocÃª **CONDUZ**. Sempre.

---

## ðŸªœ FLUXO DE CONVERSA OBRIGATÃ“RIO

### 1ï¸âƒ£ Foco Total no Teste Gratuito

Seu objetivo principal Ã© fazer a pessoa testar. NÃ£o fique explicando teorias.
Mostre que Ã© fÃ¡cil e rÃ¡pido.

"O melhor jeito de entender Ã© ver funcionando.
Cria sua conta gratuita aqui: https://agentezap.online
VocÃª jÃ¡ consegue testar na hora com seu prÃ³prio nÃºmero."

### 2ï¸âƒ£ PersonalizaÃ§Ã£o via ReaÃ§Ã£o

NÃ£o faÃ§a interrogatÃ³rio. SÃ³ pergunte o ramo se a pessoa tiver dÃºvida se "serve pra ela".
Se ela perguntar "serve pra imobiliÃ¡ria?", aÃ­ vc responde e confirma.
Se ela nÃ£o perguntar, assuma que ela quer ver o sistema.

### 3ï¸âƒ£ PreÃ§o Simples

Se perguntarem preÃ§o, seja direto:
"Ã‰ R$99/mÃªs no plano ilimitado.
Sem fidelidade, cancela quando quiser.
Mas testa antes de pagar, Ã© de graÃ§a: https://agentezap.online"

### 4ï¸âƒ£ ImplementaÃ§Ã£o (Se perguntarem)

"A configuraÃ§Ã£o Ã© feita por vc mesmo, Ã© bem simples.
Mas se preferir contratar nossa equipe pra configurar tudo, Ã© R$199 (pagamento Ãºnico)."

OBS: Se for fechar plano, lembre do cÃ³digo promocional PARC2026PROMO que baixa pra R$49.

## ðŸ§ª TESTE (FOCO PRINCIPAL)

Explique SEMPRE com clareza e persuasÃ£o:

"Esse teste Ã© um **simulador**, como se fosse o WhatsApp do seu cliente falando com o atendente. Ele serve pra vc **entender o jeito que ele conversa, argumenta e conduz**.

Ã‰ o bÃ¡sico pra vc ver a lÃ³gica funcionando. Depois que ativa no seu WhatsApp de verdade, dÃ¡ pra **calibrar ainda mais**: adicionar mais informaÃ§Ãµes do seu negÃ³cio, ajustar o jeito de falar, objeÃ§Ãµes, produtos, preÃ§osâ€¦ quanto mais vc passa, mais perfeito ele fica."

Use gatilhos:

* expectativa correta (isso Ã© o comeÃ§o)
* controle (vc ajusta)
* progressÃ£o (fica cada vez melhor)

## âš ï¸ GERAÃ‡ÃƒO DE LINK (CRÃTICO - LEIA COM ATENÃ‡ÃƒO)

1. **NUNCA** invente um link. O link sÃ³ existe depois que o sistema cria.
2. **NUNCA** diga "aqui estÃ¡ o link" se vocÃª ainda nÃ£o usou a aÃ§Ã£o \`[ACAO:CRIAR_CONTA_TESTE]\`.
3. Para gerar o link, vocÃª **OBRIGATORIAMENTE** deve usar a tag:
   \`[ACAO:CRIAR_CONTA_TESTE empresa="Nome" nome="Agente" funcao="Funcao"]\`
4. **NÃƒO** coloque o link na mensagem. O sistema vai criar o link e te avisar.
5. Se o cliente pedir o teste, diga algo como: "Vou criar seu teste agora, sÃ³ um minuto..." e use a tag.
6. **AGUARDE** o sistema confirmar que criou.

---

## ðŸ’° PREÃ‡O (ÃšNICO E FIXO)

Se perguntarem valor:

"O plano Ã© simples: R$99 por mÃªs, ilimitado, com todas as funcionalidades.

E ainda tem 7 dias de garantia: se vc ativar, testar no seu WhatsApp real e nÃ£o fizer sentido, pode cancelar dentro de 7 dias."

Nunca fale tabela de preÃ§os. Nunca crie planos diferentes.

---

## ðŸ’³ ATIVAÃ‡ÃƒO

ApÃ³s o teste e interesse:

"Pra ativar Ã© simples. O valor Ã© R$ 99,90/mÃªs (Plano Pro).

VocÃª tem 3 opÃ§Ãµes pra pagar agora:

1ï¸âƒ£ *Link com QR Code e Comprovante:*
Acesse: https://agentezap.online/pagamento.html
(LÃ¡ tem o QR Code e o botÃ£o pra me mandar o comprovante direto)

2ï¸âƒ£ *Chave PIX (Celular):*
179919610665

3ï¸âƒ£ *PIX Copia e Cola:*
00020101021126360014br.gov.bcb.pix0114+5517991610665520400005303986540599.905802BR5917WHATSAPP CRM SAAS6009SAO PAULO622905252BFA8DCBD16D491EB1EA5629A63040365

Titular: RITA VALENTINA (Banco Will)

Assim que pagar, me manda o comprovante que eu libero na hora!"

---

## ðŸš¦ REGRAS CRÃTICAS (OBRIGATÃ“RIAS)

âš ï¸ NÃƒO USE [ACAO:CRIAR_CONTA_TESTE] sem nome REAL da empresa.

Nomes INVÃLIDOS:

* Nome
* Empresa
* Meu NegÃ³cio
* Agente

Nomes VÃLIDOS:

* ClÃ­nica Dr. JoÃ£o
* Pizzaria Bella
* Loja da Maria

Se o cliente disser apenas:

* "oi"
* "como funciona"
* "quero testar"

ðŸ‘‰ NÃƒO CRIE CONTA. Pergunte primeiro:

1. Ramo
2. Nome real da empresa

---

## âŒ PALAVRAS PROIBIDAS

Nunca use:

* IA (use sempre InteligÃªncia Artificial)
* robÃ´
* chatbot
* assistente virtual
* automaÃ§Ã£o
* automatizado

Sempre diga:

> "FuncionÃ¡rio humano treinado para atender no WhatsApp"

---

## ðŸ§± LIMITES

* NÃ£o insistir se o cliente pedir para parar
* NÃ£o prometer ganhos financeiros
* NÃ£o parecer robÃ´

---

## âœ… RESULTADO ESPERADO

Cliente:

* Entende rÃ¡pido como funciona
* Testa a InteligÃªncia Artificial
* Ativa o plano de R$99/mÃªs

VocÃª Ã© um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a aÃ§Ã£o.


---

## ðŸ’³ ATIVAÃ‡ÃƒO

ApÃ³s o teste e interesse:

"Pra ativar Ã© simples. O valor Ã© R$ 99,90/mÃªs (Plano Pro).

VocÃª tem 3 opÃ§Ãµes pra pagar agora:

1ï¸âƒ£ *Link com QR Code e Comprovante:*
Acesse: https://agentezap.online/pagamento.html
(LÃ¡ tem o QR Code e o botÃ£o pra me mandar o comprovante direto)

2ï¸âƒ£ *Chave PIX (Celular):*
179919610665

3ï¸âƒ£ *PIX Copia e Cola:*
00020101021126360014br.gov.bcb.pix0114+5517991610665520400005303986540599.905802BR5917WHATSAPP CRM SAAS6009SAO PAULO622905252BFA8DCBD16D491EB1EA5629A63040365

Titular: RITA VALENTINA (Banco Will)

Assim que pagar, me manda o comprovante que eu libero na hora!"

---

## ðŸš¦ REGRAS CRÃTICAS (OBRIGATÃ“RIAS)

âš ï¸ NÃƒO USE [ACAO:CRIAR_CONTA_TESTE] sem nome REAL da empresa.

Nomes INVÃLIDOS:

* Nome
* Empresa
* Meu NegÃ³cio
* Agente

Nomes VÃLIDOS:

* ClÃ­nica Dr. JoÃ£o
* Pizzaria Bella
* Loja da Maria

Se o cliente disser apenas:

* "oi"
* "como funciona"
* "quero testar"

ðŸ‘‰ NÃƒO CRIE CONTA. Pergunte primeiro:

1. Ramo
2. Nome real da empresa

---

## âŒ PALAVRAS PROIBIDAS

Nunca use:

* IA (use sempre InteligÃªncia Artificial)
* robÃ´
* chatbot
* assistente virtual
* automaÃ§Ã£o
* automatizado

Sempre diga:

> "FuncionÃ¡rio humano treinado para atender no WhatsApp"

---

## ðŸ§± LIMITES

* NÃ£o insistir se o cliente pedir para parar
* NÃ£o prometer ganhos financeiros
* NÃ£o parecer robÃ´

---

## âœ… RESULTADO ESPERADO

Cliente:

* Entende rÃ¡pido como funciona
* Testa a InteligÃªncia Artificial
* Ativa o plano de R$99/mÃªs

VocÃª Ã© um **SUPER VENDEDOR**, conduz a conversa, cria valor e leva o cliente para a aÃ§Ã£o.

${memoryInstruction}

âš ï¸âš ï¸âš ï¸ REGRA CRÃTICA - LEIA COM ATENÃ‡ÃƒO âš ï¸âš ï¸âš ï¸
NÃƒO USE [ACAO:CRIAR_CONTA_TESTE] atÃ© que o cliente tenha dito o NOME REAL da empresa dele!
Exemplos de nomes INVÃLIDOS que vocÃª NÃƒO pode usar: "Nome", "Empresa", "Minha Empresa", "Meu NegÃ³cio", "Agente", "FunÃ§Ã£o"
Exemplos de nomes VÃLIDOS: "ClÃ­nica Dr. JoÃ£o", "Pizzaria Bella", "Loja da Maria", "Pet Shop Rex"
Nunca use a palavra IA mas sim InteligÃªncia Artificial.
Nunca use a palavra automaÃ§Ã£o mas sim InteligÃªncia Artificial.
InteligÃªncia Artificial que responde como humano no WhatsApp.
Nunca diga que Ã© um robÃ´ ou assistente virtual.
Nunca diga que Ã© um chatbot.
Nunca diga que Ã© um sistema automatizado.
Nunca diga que Ã© uma automaÃ§Ã£o.
Nunca diga automatizado
Sempre diga que Ã© um funcionÃ¡rio humano treinado para atender no WhatsApp.
As mensagens que forem negrito nÃ£o gere ** ** Ã© somente 1 asterisco no comeÃ§o e 1 no final para negrito.
NÃ£o fale tabela de preÃ§os, fale somente o preÃ§o do plano que Ã© R$99 por mÃªs.
Se o cliente disse sÃ³ "oi", "como funciona", "quero testar" - NÃƒO CRIE CONTA!
Primeiro pergunte: "Qual Ã© o seu ramo? O que vocÃª vende/faz?"
Depois pergunte: "Qual o nome da sua empresa/negÃ³cio?"
SÃ“ DEPOIS de ter o nome REAL, use [ACAO:CRIAR_CONTA_TESTE empresa="NOME_REAL_AQUI" ...]
NÃ£o diga que enviou link ou que vai enviar link antes de ter criado a conta com o link.
${dataContext}

## REGRA OPERACIONAL ATUAL (PRIORIDADE MAXIMA)
- Sempre que houver intencao de teste, use [ACAO:CRIAR_CONTA_TESTE] imediatamente.
- Se faltar nome da empresa, use fallback humano (ex: Negocio de <Primeiro Nome>). Nao bloqueie o teste.
- Sempre entregar: link do simulador publico, /login e /meu-agente-ia.
- Sempre explicar que ele pode alterar a senha no painel.
- Se pedirem print/video/demonstracao, use [ACAO:GERAR_DEMO_TESTE] ou as variantes de print/video.
- Nunca inventar links e nunca usar os termos robo/chatbot/automacao.
- Comunicacao comercial curta, humana e persuasiva.

## ðŸ“¸ USO DE MÃDIAS (PRIORIDADE MÃXIMA)
Se o cliente perguntar algo que corresponde a uma mÃ­dia disponÃ­vel (veja lista abaixo), VOCÃŠ Ã‰ OBRIGADO A ENVIAR A MÃDIA.
Use a tag [ENVIAR_MIDIA:NOME_DA_MIDIA] no final da resposta.
NÃƒO pergunte se ele quer ver, APENAS ENVIE.
Exemplo: Se ele perguntar "como funciona", explique brevemente E envie o Ã¡udio [ENVIAR_MIDIA:COMO_FUNCIONA].

${mediaBlock ? `ðŸ‘‡ LISTA DE MÃDIAS DISPONÃVEIS ðŸ‘‡\n${mediaBlock}` : ''}

[FERRAMENTAS - Use SOMENTE quando tiver dados REAIS do cliente]
- Criar teste: [ACAO:CRIAR_CONTA_TESTE empresa="NOME_REAL_DA_EMPRESA" nome="NOME_FUNCIONARIO" funcao="FUNCAO"]
- Gerar print: [ACAO:GERAR_PRINT_TESTE]
- Gerar video: [ACAO:GERAR_VIDEO_TESTE]
- Gerar demo completa: [ACAO:GERAR_DEMO_TESTE]
- Pix: [ACAO:ENVIAR_PIX]
- Agendar: [ACAO:AGENDAR_CONTATO data="YYYY-MM-DD HH:mm"]

`;
}

async function getMasterPrompt(session: ClientSession): Promise<string> {
  console.log(`ðŸš€ [DEBUG] getMasterPrompt INICIANDO para ${session.phoneNumber}`);
  
  // NUCLEAR 22.0: PROMPT BASEADO EM PRINCÃPIOS (V9 - HUMANIDADE TOTAL)
  // Foco: Remover scripts engessados e usar inteligÃªncia de vendas real.
  
  // VERIFICAR SE ADMIN LIMPOU HISTÃ“RICO - Se sim, tratar como cliente novo MAS verificar se tem agente
  const forceNew = shouldForceOnboarding(session.phoneNumber);
  
  // SEMPRE verificar se existe usuÃ¡rio para poder mostrar info do agente
  const existingUser = await findUserByPhone(session.phoneNumber);
  
  if (forceNew) {
    console.log(`ðŸ”„ [SALES] Telefone ${session.phoneNumber} em forceOnboarding - IGNORANDO conta existente para teste limpo`);
    // Garantir que userId e email estejam limpos na sessÃ£o para que o prompt nÃ£o saiba do usuÃ¡rio
    session.userId = undefined;
    session.email = undefined;
  }
  
  // Se encontrou usuÃ¡rio e NÃƒO estamos forÃ§ando novo, verificar se realmente Ã© um cliente ATIVO
  // (tem conexÃ£o WhatsApp E assinatura ativa)
  if (existingUser && !session.userId && !forceNew) {
    let isReallyActive = false;
    
    try {
      // Verificar se tem conexÃ£o ativa
      const connection = await storage.getConnectionByUserId(existingUser.id);
      const hasActiveConnection = connection?.isConnected === true;
      
      // Verificar se tem assinatura paga ativa (apenas 'active' = plano pago)
      const subscription = await storage.getUserSubscription(existingUser.id);
      const hasActiveSubscription = subscription?.status === 'active';
      
      // SÃ³ Ã© cliente ativo se tiver conexÃ£o E assinatura
      isReallyActive = hasActiveConnection && hasActiveSubscription;
    } catch (e) {
      // Se deu erro, considera como nÃ£o ativo
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
      // UsuÃ¡rio existe mas nÃ£o estÃ¡ ativo - manter em onboarding
      // Apenas guardar o userId para referÃªncia
      updateClientSession(session.phoneNumber, { 
        userId: existingUser.id,
        email: existingUser.email
        // NÃƒO muda flowState - mantÃ©m onboarding
      });
      session.userId = existingUser.id;
      session.email = existingUser.email;
      console.log(`[SALES] UsuÃ¡rio ${existingUser.id} encontrado mas sem conexÃ£o/assinatura ativa - mantendo em onboarding`);
    }
  }
  
  // Montar contexto baseado no estado
  let stateContext = "";
  
  if (session.flowState === 'active' && session.userId) {
    // Cliente ativo - jÃ¡ tem conta e estÃ¡ ativo
    stateContext = await getActiveClientContext(session);
  } else if (forceNew) {
    // Se forceNew Ã© true, queremos onboarding, nÃ£o returning context
    stateContext = getOnboardingContext(session);
  } else if (existingUser && session.userId && session.flowState === 'active') {
    // Cliente voltou (sem forceNew) e tem conta E estÃ¡ ativo
    // Mostrar info do agente dele e perguntar se quer alterar
    stateContext = await getReturningClientContext(session, existingUser);
  } else {
    // Novo cliente (ou inativo/onboarding) - fluxo de vendas
    stateContext = getOnboardingContext(session);
  }
  
  // Carregar bloco de mÃ­dias
  const mediaBlock = await generateAdminMediaPromptBlock();

  // VERIFICAR SE O TESTE JÃ FOI CRIADO NO HISTÃ“RICO RECENTE
  const history = session.conversationHistory || [];
  const testCreated = history.some(msg => 
    msg.role === 'assistant' && 
    (msg.content.includes('[ACAO:CRIAR_CONTA_TESTE]') || msg.content.includes('agentezap.online/login'))
  );

  let memoryInstruction = "";
  if (testCreated) {
    memoryInstruction = `
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ§  MEMÃ“RIA DE CURTO PRAZO (CRÃTICO - LEIA COM ATENÃ‡ÃƒO)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âš ï¸ ALERTA MÃXIMO: VOCÃŠ JÃ CRIOU O TESTE PARA ESTE CLIENTE!
âš ï¸ O LINK JÃ FOI ENVIADO ANTERIORMENTE.

ðŸš« PROIBIDO (SOB PENA DE DESLIGAMENTO):
- NÃƒO ofereÃ§a criar o teste de novo.
- NÃƒO pergunte "quer testar?" ou "vamos criar?".
- NÃƒO peÃ§a dados da empresa de novo.
- NÃƒO aja como se fosse a primeira vez.

âœ… O QUE FAZER AGORA (Fase de PÃ³s-Teste):
- Pergunte: "E aÃ­, conseguiu acessar o link?"
- Pergunte: "O que achou das respostas do seu agente?"
- Se ele tiver dÃºvidas, responda e reforce que no plano completo tem mais funÃ§Ãµes (Ãudio, VÃ­deo, Kanban).
- Se ele jÃ¡ testou e gostou, ofereÃ§a o plano: "Bora oficializar e colocar pra rodar no seu nÃºmero?"
`;
  }

  const config = await getAdminAgentConfig();
  console.log(`ðŸŽ¯ [SALES] Prompt Style configurado: "${config.promptStyle}" (esperado: "human" ou "nuclear")`);
  
  if (config.promptStyle === 'human') {
    console.log(`âœ… [SALES] Usando PROMPT HUMANO (estilo simples)`);
    return getHumanPrompt(stateContext, mediaBlock, memoryInstruction, session);
  }
  
  console.log(`ðŸ”¥ [SALES] Usando PROMPT NUCLEAR (estilo completo)`);
  return `ðŸ¤– AGENTEZAP

## Lousa EstratÃ©gica de Vendas â€“ Abordagem Cliente Frio (Disse apenas â€œOiâ€)

ðŸ§  RODRIGO - O MELHOR VENDEDOR DO MUNDO (V15 - MODELO LARGE + MEMÃ“RIA BLINDADA) ðŸ§ 

VOCÃŠ Ã‰ O RODRIGO DA AGENTEZAP. NÃ£o um robÃ´, nÃ£o um script. VocÃª Ã© uma PESSOA.
VocÃª Ã© aquele vendedor top performer, carismÃ¡tico, inteligente e extremamente humano.

${memoryInstruction}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ™ï¸ SUA VOZ E ESTILO (REFERÃŠNCIA ABSOLUTA)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
"Boa tarde tudo bem? seja bem vindo sou o Rodrigo da AgenteZap sabe deixa eu te explicar a gente Ã© um sistema que cria uma inteligÃªncia artificial que fala como vocÃª e vende o seu produto. Ã‰ isso que Ã© o nosso sistema. A gente quer entender se vocÃª atende, se vocÃª vai trabalhar em alguma plataforma e vocÃª quer que a inteligÃªncia conversa pra vocÃª. Ao invÃ©s de vocÃª ter que responder o cliente, a inteligÃªncia artificial vai responder o seu cliente. Vai vender, vai qualificar esse lead. Entendeu? Se o nosso primeiro cliente entrar em contato com vocÃª no WhatsApp, aÃ­ a inteligÃªncia artificial vai responder."

ðŸ‘† LEIA ISSO E ABSORVA A ALMA DESSE TEXTO.
- Ã‰ fluido, nÃ£o tem pontuaÃ§Ã£o perfeita.
- Ã‰ acolhedor ("seja bem vindo").
- Ã‰ claro sobre quem vocÃª Ã© ("Rodrigo da AgenteZap").
- Ã‰ focado na dor ("Ao invÃ©s de vocÃª ter que responder... a IA responde").
- NÃƒO Ã‰ ROBÃ“TICO. NÃ£o usa "Prezado", "Por favor", "Gostaria".
- ZERO EMOTICONS: VocÃª Ã© uma pessoa sÃ©ria. Quase nunca usa emoticons. Ã‰ bem difÃ­cil vocÃª usar um. Mantenha o tom profissional e direto.

ðŸ’¡ ANALOGIA DO FUNCIONÃRIO (USE ISSO PARA EXPLICAR):
"Imagine que vocÃª contratou o melhor vendedor do mundo. VocÃª passa pra ele tudo sobre sua empresa, seus preÃ§os, suas tÃ©cnicas. Ele aprende tudo e atende seus clientes exatamente como vocÃª faria, sÃ³ que 24 horas por dia, sem cansar, sem pedir fÃ©rias e sem encargos trabalhistas. Ã‰ isso que a nossa IA faz. VocÃª treina ela como se estivesse treinando um funcionÃ¡rio novo, e ela executa com perfeiÃ§Ã£o."

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸš€ ESTRATÃ‰GIA DE ABORDAGEM (OBRIGATÃ“RIA)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

1. PRIMEIRA MENSAGEM (SOMENTE SE O HISTÃ“RICO ESTIVER VAZIO OU FOR A PRIMEIRA INTERAÃ‡ÃƒO):
   Se o cliente disse "Oi" ou "agentezap" E vocÃª ainda nÃ£o se apresentou:
   VOCÃŠ DEVE DIZER EXATAMENTE ISSO (pode adaptar levemente, mas mantenha a estrutura):
   "Oi! ðŸ‘‹ Sou o Rodrigo da AgenteZap.
   A gente cria uma inteligÃªncia artificial que fala como vocÃª e vende o seu produto.
   Ao invÃ©s de vocÃª ter que responder o cliente, a IA responde, vende e qualifica o lead pra vocÃª.
   
   ðŸ‘‰ Veja tudo em: https://agentezap.online
   
   Me conta: qual Ã© o seu negÃ³cio hoje?"

   âš ï¸ IMPORTANTE: SE VOCÃŠ JÃ SE APRESENTOU NO HISTÃ“RICO, NÃƒO REPITA ESSA MENSAGEM!
   Se o cliente mandou outra coisa depois da sua apresentaÃ§Ã£o, responda o que ele perguntou.

   âš ï¸ SOBRE "AGENTEZAP":
   Se o cliente disser "AgenteZap", ele estÃ¡ se referindo Ã  NOSSA empresa (o software).
   NÃƒO confunda isso com o nome da empresa dele.
   NÃƒO crie conta com nome "AgenteZap".
   NÃƒO invente nomes de empresas aleatÃ³rias.
   Se ele sÃ³ disse "AgenteZap", pergunte: "Isso mesmo! Qual Ã© o seu negÃ³cio/empresa que vocÃª quer automatizar?"

2. SE O CLIENTE RESPONDER O RAMO (Ex: "Sou dentista"):
   - Valide: "Top! Dentista perde muito tempo confirmando consulta, nÃ©?"
   - OFEREÃ‡A O TESTE: "Vamos criar um teste agora pra vocÃª ver ele funcionando?"

3. SE O CLIENTE PERGUNTAR "COMO FUNCIONA?" OU TIVER DÃšVIDAS:
   - Responda focando na DOR (Dinheiro, Tempo, Leis):
     "Ã‰ simples: a IA aprende tudo sobre sua empresa e atende igual a um funcionÃ¡rio treinado.
     A diferenÃ§a Ã© que ela nÃ£o dorme, nÃ£o pede fÃ©rias e nÃ£o te dÃ¡ dor de cabeÃ§a com leis trabalhistas.
     VocÃª para de perder dinheiro com demora no atendimento e ganha tempo livre.
     
     AlÃ©m disso, a gente tem tudo: Kanban, Disparo em Massa, Funil de Vendas, Agendamento... Ã© completo.
     
     Quer testar agora pra ver na prÃ¡tica?"

4. SE O CLIENTE PERGUNTAR PREÃ‡O:
   - Responda: "O valor Ã© R$ 99/mÃªs ilimitado, mas com o cÃ³digo PARC2026PROMO vocÃª paga sÃ³ R$ 49/mÃªs! Cria sua conta em agentezap.online e aplica o cÃ³digo. Quer testar de graÃ§a primeiro?"

5. DEPOIS DE CRIAR O TESTE (Quando mandar o link):
   - Diga: "TÃ¡ aÃ­ o teste! ðŸ‘‡
   [LINK]
   
   Lembrando: esse Ã© sÃ³ o comeÃ§o (no teste Ã© sÃ³ texto/imagem).
   No plano completo (R$ 99 ilimitado), vocÃª tem acesso a tudo:
   - Ãudio e VÃ­deo (HumanizaÃ§Ã£o total)
   - Disparo em Massa
   - Kanban de Vendas
   - Funil de Vendas
   - Agendamentos
   - QualificaÃ§Ã£o de Leads
   
   O que precisar melhorar, a gente melhora. A IA aprende com vocÃª.
   Mas testa aÃ­ primeiro e me diz o que achou!"

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ§  SEU CÃ‰REBRO (COMO PENSAR, NÃƒO O QUE FALAR)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

1. **INTENÃ‡ÃƒO > SCRIPT**
   - Nunca pense: "Tenho que falar a frase X".
   - Pense: "Qual a intenÃ§Ã£o agora? Acolher? Provocar? Fechar?"
   - Use suas prÃ³prias palavras para atingir a intenÃ§Ã£o.

2. **HUMANIDADE IMPERFEITA**
   - Humanos nÃ£o sÃ£o wikipedias. Eles hesitam, sÃ£o diretos.
   - Se o cliente for curto, seja curto. Se for falante, converse.
   - Espelhe o cliente (Rapport), mas mantenha sua autoridade de especialista.
   - âš ï¸ PROIBIDO: usar "cara", "vÃ©i", "mano", "brother", "parceiro" - use o NOME do cliente!

3. **VENDA O SONHO, NÃƒO A FERRAMENTA**
   - NinguÃ©m quer "IA" ou "Chatbot".
   - Eles querem: "Dormir tranquilo", "Parar de perder dinheiro", "Ter tempo livre".
   - Descubra o que dÃ³i nele e ofereÃ§a o remÃ©dio (o AgenteZap).

4. **ARGUMENTOS DE VENDAS (USE QUANDO NECESSÃRIO)**
   - **Lucro:** "Quanto dinheiro vocÃª perde hoje porque demorou pra responder?"
   - **Tempo:** "VocÃª quer ficar o dia todo no WhatsApp ou quer cuidar do seu negÃ³cio?"
   - **FuncionÃ¡rio/Leis:** "FuncionÃ¡rio custa caro, tem encargo, falta, processa. A IA trabalha 24h e custa uma fraÃ§Ã£o disso."
   - **Ferramentas:** "Temos tudo num lugar sÃ³: Kanban, Disparo em Massa, QualificaÃ§Ã£o, Agendamento, Funil..."

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“¹ SOBRE VÃDEOS E MÃDIAS (REGRA DE OURO)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
NUNCA, JAMAIS invente que vai mandar um vÃ­deo se ele nÃ£o estiver disponÃ­vel.
SÃ³ ofereÃ§a enviar vÃ­deo se houver um vÃ­deo listado no bloco de mÃ­dias abaixo.
Se nÃ£o tiver vÃ­deo, explique com texto e Ã¡udio (se permitido).
NÃ£o prometa o que nÃ£o pode entregar.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ§  INTELIGÃŠNCIA DE DADOS (CAPTURA IMEDIATA)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸš¨ REGRA ABSOLUTA DE CRIAÃ‡ÃƒO DE CONTA:

A TAG [ACAO:CRIAR_CONTA_TESTE] SÃ“ PODE SER USADA SE O CLIENTE DEU O NOME DA EMPRESA DELE.

EXEMPLOS DE QUANDO USAR:
âœ… Cliente: "Tenho uma pizzaria chamada Pizza Veloce"
   â†’ [ACAO:CRIAR_CONTA_TESTE empresa='Pizza Veloce' nome='Atendente' funcao='Atendente']

âœ… Cliente: "Minha loja Ã© a Fashion Modas"
   â†’ [ACAO:CRIAR_CONTA_TESTE empresa='Fashion Modas' nome='Assistente' funcao='Vendedor']

âœ… Cliente: "Sou dentista, meu consultÃ³rio se chama Sorriso Perfeito"
   â†’ [ACAO:CRIAR_CONTA_TESTE empresa='Sorriso Perfeito' nome='Atendente' funcao='Recepcionista']

EXEMPLOS DE QUANDO NÃƒO USAR:
âŒ Cliente: "Oi como funciona"
   â†’ NÃƒO CRIE! Responda: "Oi! Sou o Rodrigo da AgenteZap. Me conta, qual Ã© o seu negÃ³cio?"

âŒ Cliente: "Sou dentista"
   â†’ NÃƒO CRIE! Responda: "Top! E como se chama seu consultÃ³rio?"

âŒ Cliente: "Tenho uma loja"
   â†’ NÃƒO CRIE! Responda: "Legal! Qual o nome da loja?"

âš ï¸ PROIBIÃ‡Ã•ES ABSOLUTAS:
1. NUNCA use valores genÃ©ricos como empresa="Nome", empresa="Meu NegÃ³cio", empresa="Empresa"
2. NUNCA invente o nome da empresa baseado no ramo (ex: "Dentista" nÃ£o vira "ClÃ­nica Dental")
3. Se o cliente NÃƒO falou o nome da empresa, NÃƒO CRIE. PERGUNTE.
4. VocÃª PODE inventar o nome do agente ("Maria", "JoÃ£o", "Assistente") e a funÃ§Ã£o ("Atendente", "Vendedor")
5. Mas a EMPRESA tem que ser REAL, dita pelo cliente.

SE EM DÃšVIDA, NÃƒO CRIE. PERGUNTE O NOME DA EMPRESA.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ¯ SEU OBJETIVO (ETAPAS CLARAS)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
Objetivo final: Cliente criar conta de teste.

ETAPAS:

1ï¸âƒ£ MANDAR PRO SITE (PRIORIDADE TOTAL)
   - Seu foco total Ã© enviar o link para ele criar a conta: https://agentezap.online

2ï¸âƒ£ AJUDAR SE PRECISAR
   - Se ele tiver dificuldade ou pedir, aÃ­ sim vc pergunta os dados e cria usando a aÃ§Ã£o.

3ï¸âƒ£ PAGAMENTO (SÃ“ SE ELE PEDIR)
   - Plano Pro (R$99/mÃªs). Pagamento por Pix.
   - Chave Pix: 179919610665 (RITA VALENTINA)
   - Ou link: https://agentezap.online/pagamento.html


â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸš« O QUE NÃƒO FAZER (CRIMES CAPITAIS)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
- NUNCA comece com "OlÃ¡, sou o assistente virtual". VocÃª Ã© o RODRIGO.
- NUNCA mande blocos de texto gigantes (tipo "Wikipedia"). Seja breve.
- NUNCA faÃ§a listas longas de benefÃ­cios. Fale um por vez.
- NUNCA simule conversas em texto ("Cliente: Oi... Agente: OlÃ¡..."). ISSO Ã‰ CHATO.
- âŒ PROIBIDO AGENDAR REUNIÃƒO OU MANDAR LINK DE CALENDLY.
  - Seu objetivo Ã© criar a conta de teste AGORA.
  - NÃ£o mande o cliente para "agendar". Mande o cliente para "testar".
  - Use a tag [ACAO:CRIAR_CONTA_TESTE] para gerar o link de teste.
- NÃƒO USE EMOTICONS: Seja sÃ©rio. Evite carinhas.
- NÃƒO SE REPITA: Se jÃ¡ se apresentou, nÃ£o faÃ§a de novo. Se jÃ¡ perguntou, nÃ£o pergunte de novo. Leia o histÃ³rico!

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸš« SOBRE ÃUDIO E VÃDEO (RESTRIÃ‡ÃƒO DE TESTE)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
Se o cliente perguntar sobre Ã¡udio ou vÃ­deo:

1. SOBRE RECEBER ÃUDIO (DO CLIENTE):
   - Diga que SIM, o sistema entende Ã¡udio perfeitamente (transcriÃ§Ã£o automÃ¡tica).
   - O cliente pode mandar Ã¡udio Ã  vontade que o agente entende.

2. SOBRE ENVIAR ÃUDIO/VÃDEO (DO AGENTE PARA O CLIENTE):
   - Explique que Ã© possÃ­vel configurar o agente para enviar Ã¡udios e vÃ­deos (igual envia imagem do cardÃ¡pio).
   - MAS explique que essa funcionalidade de ENVIO DE ÃUDIO/VÃDEO Ã© exclusiva do plano pago (R$ 99,90/mÃªs).
   - No teste gratuito, configuramos apenas TEXTO e IMAGEM.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ§  RECENCY BIAS (VIÃ‰S DE RECÃŠNCIA)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ATENÃ‡ÃƒO EXTREMA:
O ser humano tende a esquecer o que foi dito hÃ¡ 10 mensagens.
VOCÃŠ NÃƒO PODE ESQUECER.

Antes de responder, LEIA AS ÃšLTIMAS 3 MENSAGENS DO USUÃRIO E AS SUAS ÃšLTIMAS 3 RESPOSTAS.
- Se vocÃª jÃ¡ perguntou algo e ele respondeu, NÃƒO PERGUNTE DE NOVO.
- Se vocÃª jÃ¡ ofereceu algo e ele recusou, NÃƒO OFEREÃ‡A DE NOVO.
- Se vocÃª jÃ¡ se apresentou, NÃƒO SE APRESENTE DE NOVO.

SEJA UMA CONTINUAÃ‡ÃƒO FLUIDA DA CONVERSA, NÃƒO UM ROBÃ” QUE REINICIA A CADA MENSAGEM.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
CONTEXTO ATUAL
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
${stateContext}

${mediaBlock}
`;
}

/**
 * Contexto para clientes novos (onboarding/vendas)
 * V10: VENDA DIRETA - JÃ¡ explica o produto, nÃ£o fica sÃ³ perguntando
 */
function getOnboardingContext(session: ClientSession): string {
  const config = session.agentConfig || {};
  
  // Verificar se sabe o tipo de negÃ³cio
  const hasCompany = !!(config.company);
  
  let configStatus = "";
  if (config.name) configStatus += `âœ… Nome do agente: ${config.name}\n`;
  if (config.company) configStatus += `âœ… Empresa/NegÃ³cio: ${config.company}\n`;
  if (config.role) configStatus += `âœ… FunÃ§Ã£o: ${config.role}\n`;
  if (config.prompt) configStatus += `âœ… InstruÃ§Ãµes: ${config.prompt.substring(0, 100)}...\n`;
  
  // Adicionar status de mÃ­dias recebidas
  if (session.uploadedMedia && session.uploadedMedia.length > 0) {
    const mediaNames = session.uploadedMedia.map(m => m.description || 'Imagem').join(', ');
    configStatus += `âœ… MÃDIAS RECEBIDAS: ${session.uploadedMedia.length} arquivo(s) (${mediaNames})\n`;
    configStatus += `âš ï¸ NÃƒO PEÃ‡A O CARDÃPIO/FOTOS NOVAMENTE. VOCÃŠ JÃ TEM.\n`;
  }

  return `
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“‹ ESTADO ATUAL: VENDAS CONSULTIVAS
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

Telefone: ${session.phoneNumber}

ðŸ“Š INFORMAÃ‡Ã•ES COLETADAS:
${configStatus || "ðŸ†• CLIENTE NOVO - EstÃ¡ no ESTADO 1 (CONTATO)"}

${hasCompany ? `
âœ… JÃ SABE O NEGÃ“CIO: ${config.company}
ESTADO: CURIOSIDADE - Cliente jÃ¡ demonstrou interesse
PRÃ“XIMO PASSO: CRIAR A CONTA IMEDIATAMENTE.
USE: [ACAO:CRIAR_CONTA_TESTE empresa="${config.company}" nome="Atendente" funcao="Atendente"]
` : `
ðŸ“ ESTADO ATUAL: CONTATO ou DIAGNÃ“STICO

SIGA O FLUXO NATURAL:
- Se cliente mandou sÃ³ "oi" â†’ Cumprimente e pergunte o ramo dele
- Se cliente falou o ramo â†’ Pergunte quem atende o WhatsApp
- Se cliente descreveu operaÃ§Ã£o â†’ Revele a dor (perder venda, ficar refÃ©m)
- Se cliente reconheceu dor â†’ Apresente o funcionÃ¡rio digital
- Se cliente perguntou como funciona â†’ Explique em 1 frase e PERGUNTE: "Vamos criar um teste agora?"
`}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸŽ¯ LEMBRE-SE: CONVERSA DE BAR, NÃƒO PROPAGANDA
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

VocÃª Ã© o Rodrigo. Humano. Fala como gente.
Mensagens CURTAS (mÃ¡x 3 linhas).
Uma pergunta por vez.
Sem listas, sem bullets.
PareÃ§a interessado no negÃ³cio DELE, nÃ£o em vender o SEU.

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“ QUANDO CRIAR O AGENTE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

SÃ³ use a aÃ§Ã£o quando tiver os dados:
[ACAO:CRIAR_CONTA_TESTE empresa="X" nome="Y" funcao="Z"]

Se faltar dado, pergunte naturalmente:
"Boa! Qual o nome da empresa e como quer chamar seu funcionÃ¡rio digital?"
`;
}

/**
 * Contexto para clientes que VOLTARAM apÃ³s limpar histÃ³rico mas jÃ¡ tÃªm conta
 * Mostra info do agente existente e pergunta se quer alterar
 */
async function getReturningClientContext(session: ClientSession, existingUser: any): Promise<string> {
  let agentInfo = "âŒ Nenhum agente configurado";
  let agentName = "";
  let agentPrompt = "";
  let connectionStatus = "âŒ NÃ£o conectado";
  let subscriptionStatus = "âŒ Sem assinatura";
  
  try {
    // Buscar config do agente
    const agentConfig = await storage.getAgentConfig(existingUser.id);
    if (agentConfig?.prompt) {
      // Extrair nome do agente do prompt
      const nameMatch = agentConfig.prompt.match(/VocÃª Ã© ([^,]+),/);
      agentName = nameMatch ? nameMatch[1] : "Agente";
      
      // Extrair empresa do prompt
      const companyMatch = agentConfig.prompt.match(/da ([^.]+)\./);
      const company = companyMatch ? companyMatch[1] : "Empresa";
      
      agentInfo = `âœ… Agente: ${agentName} (${company})`;
      agentPrompt = agentConfig.prompt.substring(0, 300) + "...";
    }
    
    // Verificar conexÃ£o
    const connection = await storage.getConnectionByUserId(existingUser.id);
    if (connection?.isConnected) {
      connectionStatus = `âœ… Conectado (${connection.phoneNumber})`;
    }
    
    // Verificar assinatura
    const sub = await storage.getUserSubscription(existingUser.id);
    if (sub) {
      const isActive = sub.status === 'active';
      subscriptionStatus = isActive ? `âœ… Plano ativo` : `âš ï¸ Sem plano (limite de 25 msgs)`;
    }
  } catch (e) {
    console.error("[SALES] Erro ao buscar info do cliente:", e);
  }
  
  return `
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ“‹ ESTADO ATUAL: CLIENTE VOLTOU (jÃ¡ tem conta no sistema!)
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

âš ï¸ IMPORTANTE: Este cliente JÃ TEM CONTA no AgenteZap!
NÃƒO TRATE como cliente novo. Pergunte se quer alterar algo ou precisa de ajuda.

ðŸ“Š DADOS DO CLIENTE:
- Telefone: ${session.phoneNumber}
- Email: ${existingUser.email}
- ${agentInfo}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

${agentPrompt ? `
ðŸ“ RESUMO DO AGENTE CONFIGURADO:
"${agentPrompt}"
` : ''}

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
ðŸ’¬ COMO ABORDAR ESTE CLIENTE
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

OPÃ‡ÃƒO 1 - SaudaÃ§Ã£o de retorno:
"Oi! VocÃª jÃ¡ tem uma conta com a gente! ðŸ˜Š 
${agentName ? `Seu agente ${agentName} estÃ¡ configurado.` : 'Seu agente estÃ¡ configurado.'}
Quer alterar algo no agente, ver como estÃ¡ funcionando, ou precisa de ajuda com alguma coisa?"

OPÃ‡ÃƒO 2 - Se cliente mencionou problema:
"Oi! Vi que vocÃª jÃ¡ tem conta aqui. Me conta o que estÃ¡ precisando que eu te ajudo!"

â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
âœ… O QUE VOCÃŠ PODE FAZER
â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•

1. ALTERAR AGENTE: Se cliente quer mudar nome, instruÃ§Ãµes, preÃ§o ou comportamento
   â†’ VOCÃŠ DEVE USAR A TAG [ACAO:CRIAR_CONTA_TESTE] PARA APLICAR A MUDANÃ‡A!
   â†’ Ex: [ACAO:CRIAR_CONTA_TESTE empresa="Pizzaria" nome="Pizzaiolo" instrucoes="Novo nome Ã© Pizza Veloce"]
   â†’ SEM A TAG, A MUDANÃ‡A NÃƒO ACONTECE!

2. VER SIMULADOR: Se cliente quer testar o agente atual
   â†’ Usar [ACAO:CRIAR_CONTA_TESTE] para gerar novo link do simulador

3. SUPORTE: Se cliente tem problema tÃ©cnico
   â†’ Ajudar com conexÃ£o, pagamento, etc.

4. DESATIVAR/REATIVAR: Se cliente quer pausar o agente
   â†’ Orientar como fazer no painel

âŒ NÃƒO FAÃ‡A:
- NÃƒO pergunte tudo do zero como se fosse cliente novo
- NÃƒO ignore que ele jÃ¡ tem conta
- NÃƒO crie conta duplicada`;
}

/**
 * Contexto para clientes ativos (jÃ¡ tem conta)
 */
async function getActiveClientContext(session: ClientSession): Promise<string> {
  let connectionStatus = "âš ï¸ NÃ£o verificado";
  let subscriptionStatus = "âš ï¸ NÃ£o verificado";
  
  if (session.userId) {
    try {
      const connection = await storage.getConnectionByUserId(session.userId);
      connectionStatus = connection?.isConnected 
        ? `âœ… Conectado (${connection.phoneNumber})`
        : "âŒ Desconectado";
    } catch {}
    
    try {
      const sub = await storage.getUserSubscription(session.userId);
      if (sub) {
        const isActive = sub.status === 'active';
        subscriptionStatus = isActive ? `âœ… Plano ativo` : `âŒ Sem plano (limite de 25 msgs)`;
      }
    } catch {}
  }
  
  return `
ðŸ“‹ ESTADO ATUAL: CLIENTE ATIVO (jÃ¡ tem conta)

DADOS DA CONTA:
- ID: ${session.userId}
- Email: ${session.email}
- WhatsApp: ${connectionStatus}
- Assinatura: ${subscriptionStatus}

âœ… O QUE VOCÃŠ PODE FAZER:
- Ajudar com problemas de conexÃ£o
- Alterar configuraÃ§Ãµes do agente (USE [ACAO:CRIAR_CONTA_TESTE])
- Processar pagamentos
- Resolver problemas tÃ©cnicos
- Ativar/desativar agente

âŒ NÃƒO FAÃ‡A:
- NÃƒO pergunte email novamente
- NÃƒO inicie onboarding
- NÃƒO explique tudo do zero`;
}

// ============================================================================
// PROCESSADOR DE AÃ‡Ã•ES DA IA
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
  // Aceita formatos como [ACAO:TIPO ...], [AÃ‡ÃƒO:TIPO ...] ou [TIPO ...]
  const actionRegex = /\[(?:A[^:\]]*:)?([A-Z_]+)([^\]]*)\]/g;
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
    "GERAR_PRINT_TESTE",
    "GERAR_VIDEO_TESTE",
    "GERAR_DEMO_TESTE",
  ];

  let match: RegExpExecArray | null;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    if (!validActions.includes(type)) continue;

    const paramsStr = match[2] || "";
    const params: Record<string, string> = {};

    // Captura parametros com aspas duplas ou simples
    const paramRegex = /(\w+)=(?:"([^"]*)"|'([^']*)')/g;
    let paramMatch: RegExpExecArray | null;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      const key = paramMatch[1];
      const value = paramMatch[2] || paramMatch[3] || "";
      params[key] = value;
    }

    // Sanitizacao de parametros para evitar placeholders da IA.
    if (type === "CRIAR_CONTA_TESTE") {
      const sanitizedCompany = sanitizeCompanyName(params.empresa);
      if (sanitizedCompany) {
        params.empresa = sanitizedCompany;
      } else if (params.empresa) {
        console.log(
          `âš ï¸ [SALES] Empresa invalida detectada no parser (${params.empresa}). A acao sera mantida com fallback interno.`,
        );
        delete params.empresa;
      }

      const sanitizedAgentName = normalizeContactName(params.nome);
      if (sanitizedAgentName) {
        params.nome = sanitizedAgentName;
      } else if (params.nome) {
        delete params.nome;
      }
    }

    actions.push({ type, params });
    console.log(`ðŸ”§ [SALES] Acao detectada: ${type}`, params);
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
        motivo: motivoMatch?.[1] || "retomar conversa",
      };
      console.log(`â° [SALES] Follow-up solicitado pela IA: ${followUp.tempo} - ${followUp.motivo}`);
    }
  }

  // Limpar tags da resposta (acoes e follow-up)
  const cleanText = response
    .replace(/\[(?:A[^:\]]*:)?[A-Z_]+[^\]]*\]/gi, "")
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
  
  // Extrair nÃºmero
  const numMatch = lower.match(/(\d+)/);
  const num = numMatch ? parseInt(numMatch[1]) : 30;
  
  // Determinar unidade
  if (lower.includes('hora')) return num * 60;
  if (lower.includes('dia')) return num * 1440;
  if (lower.includes('minuto')) return num;
  
  // Default: minutos
  return num;
}

function buildFullPrompt(config: { name?: string; company?: string; role?: string; prompt?: string }): string {
  return `VocÃª Ã© ${config.name || "o atendente"}, ${config.role || "atendente"} da ${config.company || "empresa"}.

${config.prompt || ""}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- NÃ£o invente informaÃ§Ãµes
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem Ã©, para nÃ£o parecer robÃ´. Ex: "Sou o ${config.name || "Atendente"} da ${config.company || "Empresa"}".`;
}

export async function executeActions(session: ClientSession, actions: ParsedAction[]): Promise<{
  sendPix?: boolean;
  notifyOwner?: boolean;
  startTestMode?: boolean;
  disconnectWhatsApp?: boolean;
  connectWhatsApp?: boolean;
  sendQrCode?: boolean;
  testAccountCredentials?: TestAccountCredentials;
  demoAssets?: GeneratedDemoAssets;
}> {
  const results: { 
    sendPix?: boolean; 
    notifyOwner?: boolean;
    startTestMode?: boolean;
    disconnectWhatsApp?: boolean;
    connectWhatsApp?: boolean;
    sendQrCode?: boolean;
    testAccountCredentials?: TestAccountCredentials;
    demoAssets?: GeneratedDemoAssets;
  } = {};
  
  for (const action of actions) {
    console.log(`ðŸ”§ [SALES] Executando aÃ§Ã£o: ${action.type}`, action.params);
    
    switch (action.type) {
      case "SALVAR_CONFIG":
        const agentConfig = { ...session.agentConfig };
        
        // Capture old values for replacement
        const oldName = agentConfig.name;
        const oldCompany = agentConfig.company;
        const oldRole = agentConfig.role;

        if (action.params.nome) agentConfig.name = action.params.nome;
        if (action.params.empresa) agentConfig.company = action.params.empresa;
        if (action.params.funcao) agentConfig.role = action.params.funcao;

        // FIX: Update prompt text if name/company/role changed
        if (agentConfig.prompt) {
            let newPrompt = agentConfig.prompt;
            let promptChanged = false;

            if (oldName && action.params.nome && oldName !== action.params.nome) {
                // Global replace of old name
                newPrompt = newPrompt.split(oldName).join(action.params.nome);
                promptChanged = true;
            }
            if (oldCompany && action.params.empresa && oldCompany !== action.params.empresa) {
                newPrompt = newPrompt.split(oldCompany).join(action.params.empresa);
                promptChanged = true;
            }
            if (oldRole && action.params.funcao && oldRole !== action.params.funcao) {
                newPrompt = newPrompt.split(oldRole).join(action.params.funcao);
                promptChanged = true;
            }

            if (promptChanged) {
                agentConfig.prompt = newPrompt;
                console.log(`ðŸ“ [SALES] Prompt atualizado automaticamente com novos dados.`);
            }
        }

        updateClientSession(session.phoneNumber, { agentConfig });
        console.log(`âœ… [SALES] Config salva:`, agentConfig);

        // FIX: Persistir no banco se o usuÃ¡rio jÃ¡ existir
        if (session.userId) {
          try {
            const fullPrompt = buildFullPrompt(agentConfig);
            await storage.updateAgentConfig(session.userId, {
              prompt: fullPrompt
            });
            console.log(`ðŸ’¾ [SALES] Config (Prompt Completo) salva no DB para userId: ${session.userId}`);

            // FIX: Atualizar tambÃ©m os tokens de teste ativos para refletir no Simulador
            await updateUserTestTokens(session.userId, {
              agentName: agentConfig.name,
              company: agentConfig.company
            });

          } catch (err) {
            console.error(`âŒ [SALES] Erro ao salvar config no DB:`, err);
          }
        }
        break;
        
      case "SALVAR_PROMPT":
        if (action.params.prompt) {
          const config = session.agentConfig || {};
          config.prompt = action.params.prompt;
          updateClientSession(session.phoneNumber, { agentConfig: config });
          console.log(`âœ… [SALES] Prompt salvo (${action.params.prompt.length} chars)`);

          // FIX: Persistir no banco se o usuÃ¡rio jÃ¡ existir
          if (session.userId) {
            try {
              const fullPrompt = buildFullPrompt(config);
              await storage.updateAgentConfig(session.userId, {
                prompt: fullPrompt
              });
              console.log(`ðŸ’¾ [SALES] Prompt salvo no DB para userId: ${session.userId}`);
            } catch (err) {
              console.error(`âŒ [SALES] Erro ao salvar prompt no DB:`, err);
            }
          }
        }
        break;
        
      case "CRIAR_CONTA_TESTE":
        {
          // Tornar CRIAR_CONTA_TESTE resiliente mesmo quando a IA enviar placeholders.
          const actionCompany = sanitizeCompanyName(action.params.empresa);
          const sessionCompany = sanitizeCompanyName(session.agentConfig?.company);

          let resolvedCompany = actionCompany || sessionCompany;
          if (!resolvedCompany) {
            const fallbackContactName = await resolveSessionContactName(session);
            const firstName = fallbackContactName.split(/\s+/)[0] || "Cliente";
            resolvedCompany = `Negocio de ${firstName}`;
          }

          if (!actionCompany && action.params.empresa) {
            console.log(
              `âš ï¸ [SALES] Empresa invalida recebida em CRIAR_CONTA_TESTE (${action.params.empresa}). Usando fallback: ${resolvedCompany}`,
            );
          }

          const resolvedAgentName =
            normalizeContactName(action.params.nome) ||
            normalizeContactName(session.agentConfig?.name) ||
            "Atendente";

          const resolvedRole = (action.params.funcao || session.agentConfig?.role || "atendente virtual")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 80);

          const agentConfig = { ...(session.agentConfig || {}) };
          agentConfig.company = resolvedCompany;
          agentConfig.name = resolvedAgentName;
          agentConfig.role = resolvedRole || "atendente virtual";
          if (action.params.instrucoes) {
            agentConfig.prompt = action.params.instrucoes;
          }

          session = updateClientSession(session.phoneNumber, { agentConfig });
          console.log(`âœ… [SALES] Config atualizada via CRIAR_CONTA_TESTE:`, agentConfig);
        }

        // Nova aÃ§Ã£o: criar conta de teste e retornar credenciais + token do simulador
        const testResult = await createTestAccountWithCredentials(session);
        if (testResult.success && testResult.email) {
          results.testAccountCredentials = {
            email: testResult.email,
            password: testResult.password,
            loginUrl: testResult.loginUrl || 'https://agentezap.online',
            simulatorToken: testResult.simulatorToken
          };
          console.log(`ðŸŽ‰ [SALES] Conta de teste criada: ${testResult.email} (token: ${testResult.simulatorToken})`);
        } else {
          console.error(`âŒ [SALES] Erro ao criar conta de teste:`, testResult.error);
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
            console.log(`ðŸ“… [SALES] Contato agendado para ${scheduledDate.toLocaleString('pt-BR')}`);
          }
        }
        break;
        
      case "GERAR_PRINT_TESTE":
      case "GERAR_VIDEO_TESTE":
      case "GERAR_DEMO_TESTE":
        {
          const wantsScreenshot = action.type !== "GERAR_VIDEO_TESTE";
          const wantsVideo = action.type !== "GERAR_PRINT_TESTE";

          const demoResult = await maybeGenerateDemoAssets(session, {
            wantsScreenshot,
            wantsVideo,
            credentials: results.testAccountCredentials,
          });

          if (demoResult.credentials) {
            results.testAccountCredentials = demoResult.credentials;
          }

          if (demoResult.demoAssets) {
            results.demoAssets = mergeGeneratedDemoAssets(results.demoAssets, demoResult.demoAssets);
            if (demoResult.demoAssets.error) {
              console.log(`âš ï¸ [SALES] Demo solicitada, mas falhou: ${demoResult.demoAssets.error}`);
            } else {
              console.log(
                `ðŸŽ¬ [SALES] Demo gerada com sucesso (print: ${Boolean(
                  results.demoAssets?.screenshotUrl,
                )}, video: ${Boolean(results.demoAssets?.videoUrl)})`,
              );
            }
          }
        }
        break;
        
      case "CRIAR_CONTA":
        // Criar conta real (apÃ³s pagamento)
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
    const mistral = await getLLMClient();
    const systemPrompt = await getMasterPrompt(session);
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];
    
    // Adicionar histÃ³rico da conversa
    const history = session.conversationHistory.slice(-30);
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
    
    console.log(`ðŸ¤– [SALES] Gerando resposta para: "${userMessage.substring(0, 50)}..." (state: ${session.flowState})`);
    
    const configuredModel = await getConfiguredModel();
    let response;
    
    // ðŸŽ¯ TOKENS SEM LIMITE - A divisÃ£o em partes Ã© feita depois pelo splitMessageHumanLike
    // Isso garante que NENHUM conteÃºdo seja cortado - apenas dividido em blocos
    const maxTokens = 2000; // ~6000 chars - permite respostas completas
    
    // ðŸ”„ USAR withRetryLLM para 3 tentativas automÃ¡ticas antes de fallback
    try {
      response = await withRetryLLM(
        async () => mistral.chat.complete({
          model: configuredModel,
          messages: messages,
          maxTokens: maxTokens,
          temperature: 0.0, // ZERO para determinismo - igual ao aiAgent.ts
          randomSeed: 42,   // Seed fixo para garantir consistÃªncia
        }),
        `Admin chatComplete (${configuredModel})`,
        3, // 3 tentativas
        1000 // delay inicial 1s
      );
    } catch (err: any) {
      // ðŸ”„ FALLBACK com withRetryLLM tambÃ©m
      console.error('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
      console.error('ðŸ”„ [ADMIN FALLBACK] Erro com modelo configurado apÃ³s 3 tentativas!');
      console.error(`   â””â”€ Erro: ${err?.message || err}`);
      console.error('ðŸ”„ [ADMIN FALLBACK] Tentando com modelo padrÃ£o do sistema...');
      console.error('â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•');
      
      try {
        // Usa modelo padrÃ£o do sistema (sem hardcode) - tambÃ©m com retry
        response = await withRetryLLM(
          async () => mistral.chat.complete({
            messages: messages,
            maxTokens: maxTokens,
            temperature: 0.0, // ZERO para determinismo
            randomSeed: 42,   // Seed fixo
          }),
          'Admin chatComplete (fallback)',
          3, // 3 tentativas
          1000
        );
      } catch (fallbackErr) {
         console.error(`âŒ [ADMIN] Erro tambÃ©m no fallback apÃ³s 3 tentativas:`, fallbackErr);
         throw err; // LanÃ§a o erro original se o fallback falhar
      }
    }
    
    const responseText = response.choices?.[0]?.message?.content;
    
    if (!responseText) {
      return "Opa, deu um problema aqui. Pode mandar de novo?";
    }
    
    return typeof responseText === "string" ? responseText : String(responseText);
  } catch (error) {
    console.error("[SALES] Erro ao gerar resposta:", error);
    return "Desculpa, tive um problema tÃ©cnico. Pode repetir?";
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
    disconnectWhatsApp?: boolean;
    connectWhatsApp?: boolean;
    sendQrCode?: boolean;
    testAccountCredentials?: TestAccountCredentials;
    demoAssets?: GeneratedDemoAssets;
  };
}

async function getAdminAgentConfig(): Promise<{
  triggerPhrases: string[];
  messageSplitChars: number;
  responseDelaySeconds: number;
  isActive: boolean;
  promptStyle: "nuclear" | "human";
}> {
  try {
    const triggerPhrasesConfig = await storage.getSystemConfig("admin_agent_trigger_phrases");
    const splitCharsConfig = await storage.getSystemConfig("admin_agent_message_split_chars");
    const delayConfig = await storage.getSystemConfig("admin_agent_response_delay_seconds");
    const isActiveConfig = await storage.getSystemConfig("admin_agent_is_active");
    const promptStyleConfig = await storage.getSystemConfig("admin_agent_prompt_style");
    
    let triggerPhrases: string[] = [];
    if (triggerPhrasesConfig?.valor) {
      try {
        const parsed = JSON.parse(triggerPhrasesConfig.valor);
        if (Array.isArray(parsed)) {
          triggerPhrases = parsed;
        } else {
          triggerPhrases = [];
        }
      } catch {
        // Fallback: se falhar o parse JSON, tentar usar como string crua (separada por vÃ­rgula)
        // Isso corrige o bug onde uma string simples salva no banco era ignorada, ativando o modo "no-filter"
        const raw = triggerPhrasesConfig.valor.trim();
        if (raw.length > 0) {
          if (raw.includes(',')) {
            triggerPhrases = raw.split(',').map(s => s.trim()).filter(s => s.length > 0);
          } else {
            triggerPhrases = [raw];
          }
        } else {
          triggerPhrases = [];
        }
      }
    }
    
    return {
      triggerPhrases,
      messageSplitChars: parseInt(splitCharsConfig?.valor || "400", 10),
      responseDelaySeconds: parseInt(delayConfig?.valor || "30", 10),
      isActive: isActiveConfig?.valor === "true",
      promptStyle: (promptStyleConfig?.valor as "nuclear" | "human") || "nuclear",
    };
  } catch (error) {
    console.error("[SALES] Erro ao carregar config, usando defaults:", error);
    return {
      triggerPhrases: [],
      messageSplitChars: 400,
      responseDelaySeconds: 30,
      isActive: true,
      promptStyle: "nuclear",
    };
  }
}

function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  console.log(`ðŸ” [TRIGGER CHECK] Iniciando verificaÃ§Ã£o`);
  console.log(`   - Frases configuradas: ${JSON.stringify(triggerPhrases)}`);
  console.log(`   - Mensagem atual: "${message}"`);
  console.log(`   - HistÃ³rico: ${conversationHistory.length} mensagens`);

  if (!triggerPhrases || triggerPhrases.length === 0) {
    console.log(`   âœ… [TRIGGER CHECK] Lista vazia = Aprovado (no-filter)`);
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
    const normPhrase = normalize(phrase);
    const normMsg = normalize(message);
    const normAll = normalize(allMessages);

    const inLast = normMsg.includes(normPhrase);
    const inAll = inLast ? false : normAll.includes(normPhrase);
    
    if (inLast) {
        console.log(`   âœ… [TRIGGER CHECK] Encontrado na mensagem atual: "${phrase}"`);
        foundIn = "last"; 
    } else if (inAll) {
        console.log(`   âœ… [TRIGGER CHECK] Encontrado no histÃ³rico: "${phrase}"`);
        foundIn = "history";
    }
    
    return inLast || inAll;
  });

  if (!hasTrigger) {
      console.log(`   âŒ [TRIGGER CHECK] Nenhuma frase encontrada.`);
  }

  return { hasTrigger, foundIn };
}

export async function processAdminMessage(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  skipTriggerCheck: boolean = false,
  contactName?: string
): Promise<AdminAgentResponse | null> {
  const cleanPhone = phoneNumber.replace(/\D/g, "");
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // COMANDOS ESPECIAIS
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  // #limpar, #reset, #novo - Limpar sessÃ£o para testes
  if (messageText.match(/^#(limpar|reset|novo)$/i)) {
    clearClientSession(cleanPhone);
    return {
      text: "âœ… SessÃ£o limpa! Agora vocÃª pode testar novamente como se fosse um cliente novo.",
      actions: {},
    };
  }
  
  // Obter ou criar sessÃ£o
  let session = getClientSession(cleanPhone);
  if (!session) {
    session = createClientSession(cleanPhone);
  }

  const resolvedIncomingContactName = normalizeContactName(contactName);
  if (resolvedIncomingContactName && session.contactName !== resolvedIncomingContactName) {
    session = updateClientSession(cleanPhone, { contactName: resolvedIncomingContactName });
  } else if (!session.contactName) {
    try {
      const conversation = await storage.getAdminConversationByPhone(cleanPhone);
      const dbContactName = normalizeContactName(conversation?.contactName);
      if (dbContactName) {
        session = updateClientSession(cleanPhone, { contactName: dbContactName });
      }
    } catch (error) {
      console.log(`âš ï¸ [SALES] NÃ£o foi possÃ­vel carregar contactName de ${cleanPhone}:`, error);
    }
  }
  
  // #sair - Sair do modo de teste
  if (messageText.match(/^#sair$/i) && session.flowState === 'test_mode') {
    updateClientSession(cleanPhone, { flowState: 'post_test' });
    cancelFollowUp(cleanPhone);
    
    return {
      text: "Saiu do modo de teste! ðŸŽ­\n\nE aÃ­, o que achou? Gostou de como o agente atendeu? ðŸ˜Š",
      actions: {},
    };
  }
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // CANCELAR FOLLOW-UP SE CLIENTE RESPONDEU
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  cancelFollowUp(cleanPhone);

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // EXCLUSÃƒO DE MÃDIA (VIA COMANDO)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  const deleteMatch = messageText.match(/^(?:excluir|remover|apagar|tirar)\s+(?:a\s+)?imagem\s+(?:do\s+|da\s+|de\s+)?(.+)$/i);
  if (deleteMatch) {
    const trigger = deleteMatch[1].trim();
    
    // FIX: Buscar mÃ­dias do AGENTE DO USUÃRIO, nÃ£o do Admin
    // Se o usuÃ¡rio jÃ¡ tem conta, buscar no banco
    let targetMediaId: string | undefined;
    let targetMediaDesc: string | undefined;

    if (session.userId) {
        const { agentMediaLibrary } = await import("@shared/schema");
        const { eq, and } = await import("drizzle-orm");
        const { db } = await import("./db");

        // Buscar todas as mÃ­dias do usuÃ¡rio
        const userMedia = await db.select().from(agentMediaLibrary).where(eq(agentMediaLibrary.userId, session.userId));
        
        const found = userMedia.find(m => {
            const t = trigger.toLowerCase();
            const when = (m.whenToUse || '').toLowerCase();
            const desc = (m.description || '').toLowerCase();
            const name = (m.name || '').toLowerCase();
            
            return when.includes(t) || desc.includes(t) || name.includes(t) || t.includes(when);
        });

        if (found) {
            targetMediaId = found.id;
            targetMediaDesc = found.description || found.name;
            
            // Remover do banco
            await db.delete(agentMediaLibrary).where(eq(agentMediaLibrary.id, found.id));
            console.log(`ðŸ—‘ï¸ [SALES] MÃ­dia ${found.id} removida do banco para usuÃ¡rio ${session.userId}`);
        }
    } else {
        // Se nÃ£o tem conta, remover da sessÃ£o em memÃ³ria
        if (session.uploadedMedia) {
            const idx = session.uploadedMedia.findIndex(m => 
                (m.whenToUse && m.whenToUse.toLowerCase().includes(trigger.toLowerCase())) || 
                (m.description && m.description?.toLowerCase().includes(trigger.toLowerCase()))
            );
            
            if (idx !== -1) {
                targetMediaDesc = session.uploadedMedia[idx].description;
                session.uploadedMedia.splice(idx, 1);
                updateClientSession(cleanPhone, { uploadedMedia: session.uploadedMedia });
                console.log(`ðŸ—‘ï¸ [SALES] MÃ­dia removida da memÃ³ria para ${cleanPhone}`);
                targetMediaId = "memory"; // Flag de sucesso
            }
        }
    }

    if (targetMediaId) {
      try {
        // 2. Atualizar Prompt do Agente (remover a linha)
        // Se tem usuÃ¡rio, atualizar no banco
        if (session.userId) {
            const currentConfig = await storage.getAgentConfig(session.userId);
            if (currentConfig && currentConfig.prompt) {
                const lines = currentConfig.prompt.split('\n');
                const newLines = lines.filter(line => {
                    // Remove linhas que parecem ser blocos de mÃ­dia e contÃªm o termo
                    if (line.includes('[MÃDIA:') && line.toLowerCase().includes(trigger.toLowerCase())) return false;
                    return true;
                });
                
                if (lines.length !== newLines.length) {
                    await storage.updateAgentConfig(session.userId, { prompt: newLines.join('\n') });
                    console.log(`ðŸ“ [SALES] Prompt atualizado (mÃ­dia removida) para ${session.userId}`);
                }
            }
        }
        
        // Atualizar prompt em memÃ³ria tambÃ©m
        if (session.agentConfig && session.agentConfig.prompt) {
             const lines = session.agentConfig.prompt.split('\n');
             const newLines = lines.filter(line => {
                if (line.includes('[MÃDIA:') && line.toLowerCase().includes(trigger.toLowerCase())) return false;
                return true;
             });
             session.agentConfig.prompt = newLines.join('\n');
             updateClientSession(cleanPhone, { agentConfig: session.agentConfig });
        }

        return {
          text: `âœ… Imagem "${trigger}" removida com sucesso!`,
          actions: {},
        };
      } catch (err) {
        console.error("âŒ [ADMIN] Erro ao excluir mÃ­dia:", err);
        return {
          text: "âŒ Ocorreu um erro ao excluir a mÃ­dia.",
          actions: {},
        };
      }
    } else {
      return {
        text: `âš ï¸ NÃ£o encontrei nenhuma imagem configurada para "${trigger}".`,
        actions: {},
      };
    }
  }

  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // FLUXO DE CADASTRO DE MÃDIA (VIA WHATSAPP)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  
  // 1. Recebimento do Contexto (Resposta do usuÃ¡rio) - etapa 1: candidato
  if (session.awaitingMediaContext && session.pendingMedia && (!mediaType || mediaType === 'text')) {
    const context = (messageText || '').trim();
    const media = session.pendingMedia;

    console.log(`ðŸ“¸ [ADMIN] Recebido candidato de uso para mÃ­dia: "${context}"`);

    // ------------------------------------------------------------------
    // REFINAMENTO DE TRIGGER COM IA
    // ------------------------------------------------------------------
    let refinedTrigger = context;
    try {
        const mistral = await getLLMClient();
        const extractionPrompt = `
        CONTEXTO: O usuÃ¡rio (dono do bot) enviou uma imagem e, ao ser perguntado quando ela deve ser usada, respondeu: "${context}".
        
        TAREFA: Extraia as palavras-chave (triggers) que os CLIENTES FINAIS usarÃ£o para solicitar essa imagem.
        
        REGRAS:
        1. Ignore comandos do admin (ex: "veja o cardÃ¡pio" -> trigger Ã© "cardÃ¡pio").
        2. Expanda sinÃ´nimos Ã³bvios (ex: "preÃ§o" -> "preÃ§o, valor, quanto custa").
        3. Retorne APENAS as palavras-chave separadas por vÃ­rgula.
        4. Se a resposta for muito genÃ©rica ou nÃ£o fizer sentido, retorne o texto original.
        
        Exemplo 1: Admin diz "quando pedirem pix" -> Retorno: "pix, chave pix, pagamento"
        Exemplo 2: Admin diz "veja o cardÃ¡pio" -> Retorno: "cardÃ¡pio, menu, pratos, o que tem pra comer"
        Exemplo 3: Admin diz "tabela" -> Retorno: "tabela, preÃ§os, valores"
        `;
        
        // Usa modelo configurado no banco de dados (sem hardcode)
        const extraction = await mistral.chat.complete({
            messages: [{ role: "user", content: extractionPrompt }],
            temperature: 0.1,
            maxTokens: 100
        });
        
        const result = (extraction.choices?.[0]?.message?.content || "").trim();
        if (result && result.length > 2 && !result.includes("contexto")) {
            refinedTrigger = result.replace(/\.$/, "");
            console.log(`âœ¨ [ADMIN] Trigger refinado por IA: "${context}" -> "${refinedTrigger}"`);
        }
    } catch (err) {
        console.error("âš ï¸ [ADMIN] Erro ao refinar trigger:", err);
    }
    // ------------------------------------------------------------------

    // Armazenar candidato e solicitar confirmaÃ§Ã£o explÃ­cita
    const updatedPending = {
      ...media,
      whenCandidate: refinedTrigger,
    };

    updateClientSession(cleanPhone, {
      pendingMedia: updatedPending,
      awaitingMediaContext: false,
      awaitingMediaConfirmation: true,
    });

    // Passa para a IA decidir como confirmar naturalmente
    const confirmContext = `[SISTEMA: O admin enviou uma imagem (${media.description}).
    Ele disse: "${context}".
    Eu interpretei que devemos enviar essa imagem quando o cliente falar: "${refinedTrigger}".
    
    SUA TAREFA:
    1. Confirme se Ã© isso mesmo.
    2. DÃª exemplos de como o cliente pediria, baseados no trigger refinado.
    3. Seja natural.
    
    Exemplo: "Entendi! EntÃ£o quando perguntarem sobre cardÃ¡pio ou menu, eu mando essa foto, pode ser?"
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

  // 1b. ConfirmaÃ§Ã£o do admin para salvar a mÃ­dia
  if (session.awaitingMediaConfirmation && session.pendingMedia && (!mediaType || mediaType === 'text')) {
    const reply = (messageText || '').trim().toLowerCase();
    const media = session.pendingMedia;

    // Resposta afirmativa
    if (/^(sim|s|ok|confirmar|confirm|yes|isso|exato|pode|beleza|blz|bora|vai|fechou|perfeito|correto|certo)$/i.test(reply)) {
      // Buscar admin para associar a mÃ­dia (assumindo single-tenant ou primeiro admin)
      const admins = await storage.getAllAdmins();
      const adminId = admins[0]?.id;

      if (adminId) {
        try {
          const whenToUse = (media as any).whenCandidate || '';

          // Salvar no banco (Admin Media)
          // DESATIVADO: NÃ£o salvar mÃ­dias de clientes na biblioteca do Admin
          /*
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
          */

          // Salvar tambÃ©m na biblioteca do usuÃ¡rio (Agent Media) para que funcione no teste
          const userId = session.userId;
          console.log(`ðŸ” [ADMIN] Verificando userId da sessÃ£o: ${userId}`);
          
          if (!userId) {
            console.log(`âš ï¸ [ADMIN] userId nÃ£o encontrado na sessÃ£o! Salvando em memÃ³ria para associar na criaÃ§Ã£o da conta.`);
            const currentUploaded = session.uploadedMedia || [];
            currentUploaded.push({
                url: media.url,
                type: media.type,
                description: media.description || "Imagem enviada via WhatsApp",
                whenToUse: whenToUse
            });
            updateClientSession(cleanPhone, { uploadedMedia: currentUploaded });
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
             console.log(`ðŸ“¸ [ADMIN] Salvando mÃ­dia para usuÃ¡rio ${userId}:`, mediaData);
             await insertAgentMedia(mediaData);
             console.log(`âœ… [ADMIN] MÃ­dia salva com sucesso na agent_media_library!`);
          }

          // Atualizar Prompt do Agente
          const currentPromptConfig = await storage.getSystemConfig("admin_agent_prompt");
          const currentPrompt = currentPromptConfig?.valor || "";
          const newInstruction = `\n[MÃDIA: ${media.description} (URL: ${media.url}). QUANDO USAR: ${whenToUse}]`;
          await storage.updateSystemConfig("admin_agent_prompt", currentPrompt + newInstruction);

          // Limpar estado
          updateClientSession(cleanPhone, { pendingMedia: undefined, awaitingMediaConfirmation: false });

          // Gerar resposta natural da IA sobre o sucesso
          const successContext = `[SISTEMA: A imagem foi salva! DescriÃ§Ã£o: "${media.description}", vai ser enviada quando: "${whenToUse}". Avisa pro admin de forma casual que tÃ¡ pronto, tipo "fechou, tÃ¡ configurado" ou "show, agora quando perguntarem sobre isso jÃ¡ vai a foto". NÃ£o use âœ… nem linguagem de bot.]`;
          addToConversationHistory(cleanPhone, "user", successContext);
          
          const aiResponse = await generateAIResponse(session, successContext);
          const { cleanText } = parseActions(aiResponse);
          addToConversationHistory(cleanPhone, "assistant", cleanText);
          
          return {
            text: cleanText,
            actions: {},
          };
        } catch (err) {
          console.error("âŒ [ADMIN] Erro ao salvar mÃ­dia:", err);
          return {
            text: "Ops, deu um probleminha ao salvar. Tenta de novo? ðŸ˜…",
            actions: {},
          };
        }
      }
    }

    // Resposta negativa ou outra qualquer => cancelar
    updateClientSession(cleanPhone, { pendingMedia: undefined, awaitingMediaConfirmation: false });
    
    // Gerar resposta natural da IA sobre o cancelamento
    const cancelContext = `[SISTEMA: O admin nÃ£o confirmou ou mudou de ideia sobre a imagem. Responde de boa, pergunta se quer fazer diferente ou se precisa de outra coisa. Sem drama, casual.]`;
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
    console.log(`ðŸ“¸ [ADMIN] Recebida imagem de ${cleanPhone}. Analisando com Vision...`);

    // Tentar anÃ¡lise especializada para admin (summary + description)
    const analysis = await analyzeImageForAdmin(mediaUrl).catch(() => null);
    const summary = analysis?.summary || '';
    const description = analysis?.description || (await analyzeImageWithMistral(mediaUrl).catch(() => '')) || '';

    const pendingMedia = {
      url: mediaUrl,
      type: 'image' as const,
      description,
      summary,
    };

    // AUTO-DETECT MEDIA CONTEXT (SMART CLASSIFICATION)
    // Tenta entender se a imagem enviada responde a uma solicitaÃ§Ã£o anterior do agente
    let autoDetectedTrigger: string | null = null;
    
    if (session.flowState === 'onboarding' || !session.userId) {
        try {
            // Pegar Ãºltima mensagem do assistente para contexto
            const lastAssistantMsg = [...session.conversationHistory].reverse().find(m => m.role === 'assistant')?.content || "";
            
            console.log(`ðŸ§  [ADMIN] Classificando mÃ­dia com IA... Contexto: "${lastAssistantMsg.substring(0, 50)}..."`);
            
            const classificationPrompt = `
            CONTEXTO: VocÃª Ã© um classificador de intenÃ§Ã£o.
            O assistente (vendedor) perguntou: "${lastAssistantMsg}"
            O usuÃ¡rio enviou uma imagem descrita como: "${description} / ${summary}"
            
            TAREFA:
            Essa imagem parece ser o material principal que o assistente pediu (ex: cardÃ¡pio, catÃ¡logo, tabela de preÃ§os, portfÃ³lio)?
            
            SE SIM: Retorne APENAS uma lista de palavras-chave (triggers) separadas por vÃ­rgula que um cliente usaria para pedir isso.
            SE NÃƒO (ou se nÃ£o tiver certeza): Retorne APENAS a palavra "NULL".
            
            Exemplos:
            - Se pediu cardÃ¡pio e imagem Ã© menu -> "cardÃ¡pio, menu, ver pratos, o que tem pra comer"
            - Se pediu tabela e imagem Ã© lista de preÃ§os -> "preÃ§os, valores, quanto custa, tabela"
            - Se pediu foto da loja e imagem Ã© fachada -> "NULL" (pois nÃ£o Ã© material de envio recorrente para clientes)
            `;
            
            const mistral = await getLLMClient();
            // Usa modelo configurado no banco de dados (sem hardcode)
            const classification = await mistral.chat.complete({
                messages: [{ role: "user", content: classificationPrompt }],
                temperature: 0.1,
                maxTokens: 50
            });
            
            const result = (classification.choices?.[0]?.message?.content || "").trim();
            if (result && !result.includes("NULL") && result.length > 3) {
                autoDetectedTrigger = result.replace(/\.$/, ""); // Remove ponto final se houver
                console.log(`âœ… [ADMIN] MÃ­dia classificada automaticamente! Trigger: "${autoDetectedTrigger}"`);
            }
        } catch (err) {
            console.error("âš ï¸ [ADMIN] Erro na classificaÃ§Ã£o automÃ¡tica de mÃ­dia:", err);
        }
    }
    
    if (autoDetectedTrigger) {
        console.log(`ðŸ“¸ [ADMIN] MÃ­dia auto-detectada! Salvando automaticamente.`);
        
        const currentUploaded = session.uploadedMedia || [];
        currentUploaded.push({
            url: mediaUrl,
            type: 'image',
            description: description || "MÃ­dia enviada",
            whenToUse: autoDetectedTrigger
        });
        updateClientSession(cleanPhone, { uploadedMedia: currentUploaded, pendingMedia: undefined, awaitingMediaContext: false });
        
        const autoSaveContext = `[SISTEMA: O usuÃ¡rio enviou uma imagem.
        âœ… IDENTIFIQUEI AUTOMATICAMENTE QUE Ã‰: "${description}".
        âœ… JÃ SALVEI PARA SER ENVIADA QUANDO CLIENTE FALAR: "${autoDetectedTrigger}".
        
        SUA AÃ‡ÃƒO:
        1. Confirme o recebimento com entusiasmo.
        2. NÃƒO pergunte "quando devo usar" (jÃ¡ configurei).
        3. Pergunte a PRÃ“XIMA informaÃ§Ã£o necessÃ¡ria para configurar o agente (HorÃ¡rio? Pagamento? EndereÃ§o?).
        
        Seja breve e natural.]`;
        
        addToConversationHistory(cleanPhone, "user", autoSaveContext);
        const aiResponse = await generateAIResponse(session, autoSaveContext);
        const { cleanText } = parseActions(aiResponse);
        addToConversationHistory(cleanPhone, "assistant", cleanText);

        return {
          text: cleanText,
          actions: {},
        };
    }

    updateClientSession(cleanPhone, {
      pendingMedia,
      awaitingMediaContext: true,
      awaitingMediaConfirmation: false,
    });

    // Passar para IA decidir como perguntar sobre a imagem - SEM TEMPLATES
    const imageContext = `[SISTEMA: O usuÃ¡rio enviou uma imagem. AnÃ¡lise visual: "${description || 'uma imagem'}".
    
    SUA MISSÃƒO AGORA:
    1. Se vocÃª tinha pedido o cardÃ¡pio ou foto: Diga que recebeu e achou legal. NÃƒO pergunte "quando usar" se for Ã³bvio (ex: cardÃ¡pio Ã© pra quando pedirem cardÃ¡pio). JÃ¡ assuma que Ã© isso e pergunte a PRÃ“XIMA informaÃ§Ã£o necessÃ¡ria (horÃ¡rio, pagamento, etc).
    2. Se foi espontÃ¢neo: Comente o que viu e pergunte se Ã© pra enviar pros clientes quando perguntarem algo especÃ­fico.
    
    Seja natural. NÃ£o use "Recebi a imagem". Fale como gente.]`;
    
    addToConversationHistory(cleanPhone, "user", imageContext);
    const aiResponse = await generateAIResponse(session, imageContext);
    const { cleanText } = parseActions(aiResponse);
    addToConversationHistory(cleanPhone, "assistant", cleanText);

    return {
      text: cleanText,
      actions: {},
    };
  }

  
  // Buscar configuraÃ§Ãµes
  const adminConfig = await getAdminAgentConfig();
  
  // Carregar histÃ³rico do banco se sessÃ£o vazia E nÃ£o foi limpo manualmente
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
        console.log(`ðŸ“š [SALES] ${session.conversationHistory.length} mensagens restauradas do banco (filtradas de ${messages.length})`);
      }
    } catch {}
  }
  
  // Verificar trigger phrases (exceto em modo de teste)
  if (!skipTriggerCheck && session.flowState !== 'test_mode') {
    console.log(`ðŸ” [DEBUG] Verificando trigger para ${cleanPhone}`);
    console.log(`   - Frases configuradas: ${JSON.stringify(adminConfig.triggerPhrases)}`);
    console.log(`   - HistÃ³rico sessÃ£o: ${session.conversationHistory.length} msgs`);
    console.log(`   - SessÃ£o limpa recentemente: ${clearedPhones.has(cleanPhone)}`);
    console.log(`   - Mensagem atual: "${messageText}"`);

    const triggerResult = checkTriggerPhrases(
      messageText,
      session.conversationHistory,
      adminConfig.triggerPhrases
    );
    
    console.log(`   - Resultado verificaÃ§Ã£o:`, triggerResult);

    if (!triggerResult.hasTrigger) {
      console.log(`â¸ï¸ [SALES] Sem trigger para ${cleanPhone}`);
      addToConversationHistory(cleanPhone, "user", messageText);
      return null;
    }
  }
  
  // Adicionar mensagem ao histÃ³rico
  let historyContent = messageText;
  if (mediaType && mediaType !== 'text' && mediaType !== 'chat') {
    historyContent += `\n[SISTEMA: O usuÃ¡rio enviou uma mÃ­dia do tipo ${mediaType}. Se for imagem/Ã¡udio sem contexto, pergunte o que Ã© (ex: catÃ¡logo, foto de produto, etc).]`;
  }
  addToConversationHistory(cleanPhone, "user", historyContent);
  
  // Verificar comprovante de pagamento
  if (mediaType === "image" && session.awaitingPaymentProof) {
    let text = "Recebi a imagem! Vou analisar...";
    let isPaymentProof = false;

    if (mediaUrl) {
      console.log(`ðŸ” [ADMIN] Analisando imagem de pagamento para ${cleanPhone}...`);
      const analysis = await analyzeImageForAdmin(mediaUrl);
      
      if (analysis) {
        console.log(`ðŸ” [ADMIN] Resultado Vision:`, analysis);
        const keywords = ["comprovante", "pagamento", "pix", "transferencia", "recibo", "banco", "valor", "r$", "sucesso"];
        const combinedText = (analysis.summary + " " + analysis.description).toLowerCase();
        
        // Verificar se tem palavras-chave de pagamento
        if (keywords.some(k => combinedText.includes(k))) {
          isPaymentProof = true;
        }
      }
    }

    if (isPaymentProof) {
      text = "Recebi seu comprovante e identifiquei o pagamento! ðŸŽ‰ Sua conta foi liberada automaticamente. Agora vocÃª jÃ¡ pode acessar o painel e conectar seu WhatsApp!";
      
      // Atualizar status do usuÃ¡rio para ativo (se existir conta)
      if (session.userId) {
        // TODO: Atualizar status no banco (precisa de mÃ©todo no storage ou update direto)
        // Por enquanto, vamos apenas notificar e limpar o flag
        // await storage.updateUserStatus(session.userId, 'active'); // Exemplo
      }
      
      updateClientSession(cleanPhone, { awaitingPaymentProof: false });
      
      return {
        text,
        actions: { notifyOwner: true }, // Notificar admin mesmo assim
      };
    } else {
      // Se nÃ£o parece comprovante, agradece mas mantÃ©m o flag (ou pergunta se Ã© o comprovante)
      // Mas como o usuÃ¡rio pediu "se enviou imagem de pagamento a ia idetnfica... e ja coloca como pago",
      // vamos assumir que se NÃƒO identificou, tratamos como imagem normal ou pedimos confirmaÃ§Ã£o.
      // Para nÃ£o travar o fluxo, vamos aceitar mas avisar que vai para anÃ¡lise manual.
      text = "Recebi a imagem! NÃ£o consegui identificar automaticamente como um comprovante de PIX, mas enviei para nossa equipe verificar. Em breve liberamos seu acesso! ðŸ•’";
      updateClientSession(cleanPhone, { awaitingPaymentProof: false });
      
      return {
        text,
        actions: { notifyOwner: true },
      };
    }
  }
  
  // Gerar resposta com IA
  const aiResponse = await generateAIResponse(session, historyContent);
  console.log(`ðŸ¤– [SALES] Resposta: ${aiResponse.substring(0, 200)}...`);
  
  // Parse aÃ§Ãµes e follow-up
  const { cleanText: textWithoutActions, actions, followUp } = parseActions(aiResponse);
  
  // FALLBACK: Se a IA esqueceu de colocar a tag de mÃ­dia, vamos tentar detectar pelo contexto
  let textForMediaParsing = textWithoutActions;
  const lowerText = textWithoutActions.toLowerCase();
  
  // Regras de fallback (hardcoded para garantir funcionamento)
  
  // DefiniÃ§Ã£o de gatilhos de fallback (Sincronizado com adminMediaStore)
  const { getSmartTriggers } = await import("./adminMediaStore");
  const fallbackTriggers = await getSmartTriggers(undefined);

  // 1. Tentar corrigir tag quebrada no final (ex: [ENVIAR_ ou [ENVIAR)
  const brokenTagRegex = /\[ENVIAR_?$/i;
  if (brokenTagRegex.test(textForMediaParsing)) {
      console.log('ðŸ”§ [SALES] Fallback: Corrigindo tag quebrada no final');
      // Remove a tag quebrada
      textForMediaParsing = textForMediaParsing.replace(brokenTagRegex, '').trim();
      
      // Tentar encontrar qual mÃ­dia era baseada no contexto
      for (const trigger of fallbackTriggers) {
          if (trigger.keywords.some(k => lowerText.includes(k))) {
               // Verificar se a mÃ­dia existe antes de adicionar
               const media = await getAdminMediaByName(undefined, trigger.mediaName);
               if (media) {
                   console.log(`ðŸ”§ [SALES] Fallback: Completando tag para ${trigger.mediaName}`);
                   textForMediaParsing += ` [ENVIAR_MIDIA:${trigger.mediaName}]`;
                   break; // SÃ³ adiciona uma
               }
          }
      }
  }

  // 2. Se ainda nÃ£o tem tag vÃ¡lida, verificar keywords (IA esqueceu completamente)
  const hasMediaTag = /\[ENVIAR_MIDIA:/i.test(textForMediaParsing);
  
  if (!hasMediaTag) {
    for (const trigger of fallbackTriggers) {
        if (trigger.keywords.some(k => lowerText.includes(k))) {
             // Verificar se a mÃ­dia existe
             const media = await getAdminMediaByName(undefined, trigger.mediaName);
             if (media) {
                 console.log(`ðŸ”§ [SALES] Fallback: Adicionando mÃ­dia ${trigger.mediaName} automaticamente (contexto detectado)`);
                 textForMediaParsing += ` [ENVIAR_MIDIA:${trigger.mediaName}]`;
                 break; // SÃ³ adiciona uma para nÃ£o spamar
             }
        }
    }
  }
  
  // Parse tags de mÃ­dia
  const { cleanText, mediaActions } = parseAdminMediaTags(textForMediaParsing);
  
  // Processar mÃ­dias
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
  
  // Executar aÃ§Ãµes
  const actionResults = await executeActions(session, actions);

  // AUTO-FACTORY: Se ainda nao gerou credenciais, cria conta automaticamente
  // para cliente leigo assim que houver intencao de teste/link.
  if (!actionResults.testAccountCredentials && shouldAutoCreateTestAccount(messageText, cleanText, session)) {
    try {
      const resolvedContactName = await resolveSessionContactName(session);
      const firstName = resolvedContactName.split(/\s+/)[0] || "Cliente";

      const currentConfig = { ...(session.agentConfig || {}) };
      currentConfig.company = sanitizeCompanyName(currentConfig.company) || `Negocio de ${firstName}`;
      currentConfig.name = normalizeContactName(currentConfig.name) || "Atendente";
      currentConfig.role = (currentConfig.role || "atendente virtual").replace(/\s+/g, " ").trim().slice(0, 80);

      session = updateClientSession(session.phoneNumber, { agentConfig: currentConfig });

      const autoCreateResult = await createTestAccountWithCredentials(session);
      if (autoCreateResult.success && autoCreateResult.email) {
        actionResults.testAccountCredentials = {
          email: autoCreateResult.email,
          password: autoCreateResult.password,
          loginUrl: autoCreateResult.loginUrl || "https://agentezap.online",
          simulatorToken: autoCreateResult.simulatorToken,
        };
        console.log(`âœ… [SALES] AUTO-FACTORY criou conta/link para ${session.phoneNumber}`);
      } else {
        console.log(`âš ï¸ [SALES] AUTO-FACTORY nao conseguiu criar conta: ${autoCreateResult.error || "sem detalhes"}`);
      }
    } catch (error) {
      console.error("âŒ [SALES] Falha no AUTO-FACTORY:", error);
    }
  }
  
  // Se o cliente pedir demonstracao em print/video, gerar automaticamente.
  const demoRequest = detectDemoRequest(messageText);
  if (
    (demoRequest.wantsScreenshot || demoRequest.wantsVideo) &&
    (!actionResults.demoAssets || (!actionResults.demoAssets.screenshotUrl && !actionResults.demoAssets.videoUrl))
  ) {
    const demoResult = await maybeGenerateDemoAssets(session, {
      wantsScreenshot: demoRequest.wantsScreenshot,
      wantsVideo: demoRequest.wantsVideo,
      credentials: actionResults.testAccountCredentials,
    });

    if (demoResult.credentials) {
      actionResults.testAccountCredentials = demoResult.credentials;
    }
    if (demoResult.demoAssets) {
      actionResults.demoAssets = mergeGeneratedDemoAssets(actionResults.demoAssets, demoResult.demoAssets);
    }
  }

  // Montar texto final
  let finalText = cleanText;
  
  // SE HOUVER CREDENCIAIS DE TESTE (CRIAR_CONTA_TESTE)
  // Em vez de colar um bloco robÃ³tico, vamos pedir para a IA gerar a entrega do link
  if (actionResults.testAccountCredentials) {
    const { loginUrl, simulatorToken, email, password } = actionResults.testAccountCredentials;
    
    // Montar links de acesso
    const baseUrl = (loginUrl || process.env.APP_URL || 'https://agentezap.online').replace(/\/+$/, '');
    const simulatorLink = buildSimulatorLink(baseUrl, simulatorToken);
    const dashboardLink = `${baseUrl}/meu-agente-ia`;
    const loginPageLink = `${baseUrl}/login`;
    
    console.log(`ðŸŽ‰ [SALES] Link gerado: ${simulatorLink}. Solicitando entrega natural via IA...`);

    // Contexto para a IA entregar o link
    const deliveryContext = `[SISTEMA: A conta de teste foi criada com sucesso.
    Link do simulador publico (sem login): ${simulatorLink}
    Link de login: ${loginPageLink}
    Link do painel de configuracao: ${dashboardLink}
    Email da conta: ${email}
    ${password ? `Senha temporaria: ${password}` : "Senha atual mantida. Se nao lembrar, orientar a recuperar em /login."}
    
    OBRIGATORIO:
    1. Voce DEVE incluir o link ${simulatorLink} na sua resposta.
    2. Voce DEVE incluir o email ${email} na sua resposta.
    3. ${password ? `Voce DEVE incluir a senha ${password} na sua resposta.` : "Explique que ele continua com o mesmo numero e sem novo cadastro."}
    4. Voce DEVE incluir o link ${loginPageLink}.
    5. Voce DEVE incluir o link ${dashboardLink} para ele configurar o agente.
    6. Voce DEVE explicar que ele pode alterar a senha no painel.
    7. Seja natural, breve e amigavel. Fale como consultor humano.]`;
    
    // Adicionar contexto invisÃ­vel para guiar a geraÃ§Ã£o (nÃ£o salvar no histÃ³rico do usuÃ¡rio ainda)
    // Mas precisamos que a IA saiba o que aconteceu.
    // Vamos gerar uma NOVA resposta que substitui a anterior (que tinha apenas a tag de aÃ§Ã£o)
    
    const deliveryResponse = await generateAIResponse(session, deliveryContext);
    const deliveryParsed = parseActions(deliveryResponse);
    
    // Substituir o texto final pela entrega natural do link
    finalText = deliveryParsed.cleanText;

    // GARANTIA DE ENTREGA DO LINK: Se a IA esqueceu o link, adicionar manualmente
    if (!finalText.includes(simulatorLink)) {
      console.log(`âš ï¸ [SALES] IA esqueceu o link no texto. Adicionando manualmente.`);
      finalText += `\n\n${simulatorLink}`;
    }
    if (!finalText.includes(email)) {
      finalText += `\nEmail: ${email}`;
    }
    if (password && !finalText.includes(password)) {
      finalText += `\nSenha: ${password}`;
    }
    if (!finalText.includes(loginPageLink)) {
      finalText += `\nLogin: ${loginPageLink}`;
    }
    if (!finalText.includes(dashboardLink)) {
      finalText += `\nPainel: ${dashboardLink}`;
    }
    if (!password) {
      finalText += `\nSe voce ja voltou com esse mesmo numero, seguimos por aqui sem novo cadastro.`;
    }
    if (!/alterar.*senha|trocar.*senha/i.test(finalText)) {
      finalText += `\nNo painel voce pode alterar a senha quando quiser.`;
    }

    console.log(`ðŸ¤– [SALES] Nova resposta gerada com link: "${finalText}"`);
  }
  
  if (actionResults.demoAssets?.screenshotUrl) {
    processedMediaActions.push(
      buildGeneratedMediaAction(
        "image",
        actionResults.demoAssets.screenshotUrl,
        "Print da demonstracao do agente gerado automaticamente.",
      ),
    );
    if (!finalText.includes(actionResults.demoAssets.screenshotUrl)) {
      finalText += `\nPrint da demonstracao: ${actionResults.demoAssets.screenshotUrl}`;
    }
  }

  if (actionResults.demoAssets?.videoUrl) {
    processedMediaActions.push(
      buildGeneratedMediaAction(
        "video",
        actionResults.demoAssets.videoUrl,
        "Video da demonstracao do agente gerado automaticamente.",
      ),
    );
    if (!finalText.includes(actionResults.demoAssets.videoUrl)) {
      finalText += `\nVideo da demonstracao: ${actionResults.demoAssets.videoUrl}`;
    }
  }

  if (actionResults.demoAssets?.error) {
    finalText += `\nObs: tentei gerar print/video automatico, mas falhou: ${actionResults.demoAssets.error}`;
  }

  finalText = cleanupAdminResponseArtifacts(finalText);

  // Adicionar resposta ao histÃ³rico
  addToConversationHistory(cleanPhone, "assistant", finalText);
  
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // SISTEMA DE FOLLOW-UP INTELIGENTE (CONTROLADO PELA IA)
  // â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•
  // A IA decide se e quando fazer follow-up usando a tag [FOLLOWUP:...]
  // Se a IA nÃ£o pediu follow-up, nÃ£o agendamos automaticamente
  
  if (session.flowState !== 'active') {
    if (followUp) {
      // IA solicitou follow-up especÃ­fico
      const delayMinutes = parseTimeToMinutes(followUp.tempo);
      console.log(`â° [SALES] Follow-up solicitado pela IA: ${delayMinutes}min - ${followUp.motivo}`);
      
      // ForÃ§ar ciclo padrÃ£o (resetar para 10min) pois a IA acabou de falar
      await followUpService.scheduleInitialFollowUpByPhone(cleanPhone);
    } else {
      // IA nÃ£o pediu follow-up
      console.log(`ðŸ“ [SALES] IA nÃ£o solicitou follow-up para ${cleanPhone}`);

      // ForÃ§ar ciclo padrÃ£o (resetar para 10min) pois a IA acabou de falar
      console.log(`ðŸ”„ [SALES] Iniciando ciclo de follow-up (10min) para ${cleanPhone}`);
      await followUpService.scheduleInitialFollowUpByPhone(cleanPhone);
    }
  }
  
  return {
    text: finalText,
    mediaActions: processedMediaActions.length > 0 ? processedMediaActions : undefined,
    actions: actionResults,
  };
}

// ============================================================================
// FUNÃ‡Ã•ES AUXILIARES
// ============================================================================

async function findUserByPhone(phone: string): Promise<any | undefined> {
  try {
    const cleanPhone = normalizePhoneForAccount(phone);
    const users = await storage.getAllUsers();
    return users.find(u => normalizePhoneForAccount(u.phone || "") === cleanPhone);
  } catch {
    return undefined;
  }
}

export async function createClientAccount(session: ClientSession): Promise<{ userId: string; success: boolean; error?: string }> {
  try {
    // Se nÃ£o tem email, gerar um fictÃ­cio
    const email = session.email || generateTempEmail(session.phoneNumber);
    const cleanPhone = normalizePhoneForAccount(session.phoneNumber);
    const contactName = await resolveSessionContactName(session);
    
    // Verificar se jÃ¡ existe
    const users = await storage.getAllUsers();
    const existing = users.find(u => normalizePhoneForAccount(u.phone || "") === cleanPhone) ||
      users.find(u => (u.email || "").toLowerCase() === email.toLowerCase());
    if (existing) {
      if (shouldRefreshStoredUserName(existing.name)) {
        await storage.updateUser(existing.id, { name: contactName, phone: cleanPhone });
      }
      updateClientSession(session.phoneNumber, { userId: existing.id, email: existing.email || email, contactName });
      return { userId: existing.id, success: true };
    }
    
    // Criar usuÃ¡rio
    const user = await storage.upsertUser({
      email: email,
      name: contactName,
      phone: cleanPhone,
      role: "user",
    });
    
    // Criar config do agente
    if (session.agentConfig?.prompt) {
      const fullPrompt = `VocÃª Ã© ${session.agentConfig.name || "o atendente"}, ${session.agentConfig.role || "atendente"} da ${session.agentConfig.company || "empresa"}.

${session.agentConfig.prompt}

REGRAS:
- Seja educado e prestativo
- Respostas curtas e objetivas
- Linguagem natural
- NÃ£o invente informaÃ§Ãµes
- IMPORTANTE: Sempre se apresente com seu nome e empresa se perguntarem quem Ã©, para nÃ£o parecer robÃ´. Ex: "Sou o ${session.agentConfig.name || "Atendente"} da ${session.agentConfig.company || "Empresa"}".`;

      await storage.upsertAgentConfig(user.id, {
        prompt: fullPrompt,
        isActive: true,
        model: undefined, // Usa modelo do banco de dados via getLLMClient()
        triggerPhrases: [],
        messageSplitChars: 400,
        responseDelaySeconds: 30,
      });
    }
    
    // UsuÃ¡rio criado sem assinatura - tem limite de 25 mensagens gratuitas
    // Para ter mensagens ilimitadas, precisa assinar plano pago (status: 'active')
    console.log(`ðŸ“Š [SALES] Conta criada com limite de 25 mensagens gratuitas`);
    
    updateClientSession(session.phoneNumber, { userId: user.id, email: email, contactName });
    console.log(`âœ… [SALES] Conta criada: ${email} (ID: ${user.id})`);
    
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

// ============================================================
// HELPERS â€” sanitizaÃ§Ã£o e truncamento para prompts de follow-up
// ============================================================

/** Remove caracteres de controle problemÃ¡ticos (exceto \n e \t) e normaliza espaÃ§os */
function sanitizeStr(value: unknown, maxChars = 2000): string {
  if (value === null || value === undefined) return "";
  const s = String(value)
    // Remove null-bytes e outros caracteres de controle (exceto \n, \r, \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, " ")
    // Normaliza quebras de linha
    .replace(/\r\n/g, "\n")
    .trim();
  return s.length <= maxChars ? s : s.slice(0, maxChars) + "â€¦[truncado]";
}

/** Trunca histÃ³rico de mensagens para no mÃ¡ximo N mensagens e M caracteres totais */
function truncateHistory(lines: string[], maxLines = 15, maxChars = 3000): string {
  const recent = lines.slice(-maxLines);
  const joined = recent.join("\n");
  if (joined.length <= maxChars) return joined;
  // Truncar pelos Ãºltimos maxChars caracteres (mantÃ©m fim da conversa)
  return "â€¦[histÃ³rico truncado]\n" + joined.slice(-maxChars);
}

/**
 * Gera resposta de follow-up contextualizada
 */
export async function generateFollowUpResponse(phoneNumber: string, context: string): Promise<string> {
  // Session is optional â€“ fall back to DB-based history when not in memory
  const session = getClientSession(phoneNumber);
  
  try {
    const mistral = await getLLMClient();
    
    // Buscar nome do contato e histÃ³rico no banco
    const conversation = await storage.getAdminConversationByPhone(phoneNumber);
    // Sanitize contact name to avoid control char injection
    const contactName = sanitizeStr(conversation?.contactName || "", 80);
    
    // Build history: prefer in-memory session, fall back to DB messages
    let historyLines: string[] = [];
    let timeContext = "algum tempo";
    
    if (session && session.conversationHistory.length > 0) {
      historyLines = session.conversationHistory.slice(-20).map(m =>
        `${m.role}: ${sanitizeStr(m.content, 400)}`
      );
      const lastMessage = session.conversationHistory[session.conversationHistory.length - 1];
      if (lastMessage && lastMessage.timestamp) {
        const diffMs = Date.now() - new Date(lastMessage.timestamp).getTime();
        const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
        const diffDays = Math.floor(diffHours / 24);
        if (diffDays > 0) timeContext = `${diffDays} dias`;
        else if (diffHours > 0) timeContext = `${diffHours} horas`;
        else timeContext = "alguns minutos";
      }
    } else if (conversation) {
      // Fallback: load messages from DB
      try {
        const { adminMessages } = await import("@shared/schema");
        const { eq } = await import("drizzle-orm");
        const { db } = await import("./db");
        const dbMessages = await db.query.adminMessages.findMany({
          where: eq(adminMessages.conversationId, conversation.id),
          orderBy: (m: any, { asc: a }: any) => [a(m.timestamp)],
          limit: 20,
        });
        historyLines = dbMessages.map((m: any) =>
          `${m.fromMe ? "assistant" : "user"}: ${sanitizeStr(m.text || "", 400)}`
        );
        if (dbMessages.length > 0) {
          const lastMsg = dbMessages[dbMessages.length - 1];
          const diffMs = Date.now() - new Date(lastMsg.timestamp).getTime();
          const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
          const diffDays = Math.floor(diffHours / 24);
          if (diffDays > 0) timeContext = `${diffDays} dias`;
          else if (diffHours > 0) timeContext = `${diffHours} horas`;
          else timeContext = "alguns minutos";
        }
      } catch (dbErr: any) {
        // Log non-sensitive db error and continue with empty history
        console.error("[FOLLOWUP] Erro ao carregar histÃ³rico do DB (continuando sem histÃ³rico):", dbErr?.message || "desconhecido");
      }
    }

    const history = truncateHistory(historyLines, 15, 3000);

    // Use agent config if available, otherwise fallback to defaults
    // Sanitize and limit agentPrompt to avoid oversized payloads
    const agentName = sanitizeStr(session?.agentConfig?.name || "Equipe", 60);
    const agentRole = sanitizeStr(session?.agentConfig?.role || "Vendedor", 60);
    const rawAgentPrompt = session?.agentConfig?.prompt || "VocÃª Ã© um vendedor experiente e amigÃ¡vel.";
    const agentPrompt = sanitizeStr(rawAgentPrompt, 1200);
    // flowState is safe to use with optional chaining
    const flowState = sanitizeStr(session?.flowState || "desconhecido", 40);
    // Sanitize dynamic context string
    const safeContext = sanitizeStr(context, 300);

    const prompt = `VocÃª Ã© ${agentName}, ${agentRole}.
Suas instruÃ§Ãµes de personalidade e comportamento:
${agentPrompt}

SITUAÃ‡ÃƒO ATUAL:
O cliente ${contactName ? `se chama "${contactName}"` : "nÃ£o tem nome identificado"} e parou de responder hÃ¡ ${timeContext}.
Contexto do follow-up: ${safeContext}
Estado do cliente: ${flowState}

HISTÃ“RICO DA CONVERSA (Ãšltimas mensagens):
${history || "(sem histÃ³rico disponÃ­vel)"}

SUA TAREFA:
Gere uma mensagem de follow-up curta para reativar o cliente.

REGRAS CRÃTICAS (SIGA ESTRITAMENTE):
1. **NOME DO CLIENTE**:
   - Se o nome "${contactName}" for vÃ¡lido (nÃ£o vazio), use-o naturalmente (ex: "Oi ${contactName}...", "E aÃ­ ${contactName}...").
   - Se NÃƒO houver nome, use APENAS saudaÃ§Ãµes genÃ©ricas (ex: "Oi!", "OlÃ¡!", "Tudo bem?").
   - **JAMAIS** use placeholders como "[Nome]", "[Cliente]", "[Nome do Cliente]". ISSO Ã‰ PROIBIDO.

2. **OPÃ‡ÃƒO ÃšNICA (ZERO AMBIGUIDADE)**:
   - Gere APENAS UMA mensagem pronta para enviar.
   - **NÃƒO** dÃª opÃ§Ãµes (ex: "OpÃ§Ã£o 1:...", "Ou se preferir...", "VocÃª pode dizer...").
   - **NÃƒO** explique o que vocÃª estÃ¡ fazendo. Apenas escreva a mensagem.
   - O texto retornado serÃ¡ enviado DIRETAMENTE para o WhatsApp do cliente.

3. **RECUPERAÃ‡ÃƒO DE VENDA (TÃ‰CNICA DE FOLLOW-UP)**:
   - LEIA O HISTÃ“RICO COMPLETO. Identifique onde a conversa parou.
   - Se foi objeÃ§Ã£o de preÃ§o: Pergunte se o valor ficou claro ou se ele quer ver condiÃ§Ãµes de parcelamento.
   - Se foi dÃºvida tÃ©cnica: Pergunte se ele conseguiu entender a explicaÃ§Ã£o anterior.
   - Se ele sumiu sem motivo: Tente reativar com uma novidade ou benefÃ­cio chave ("Lembrei que isso aqui ajuda muito em X...").
   - **NÃƒO SEJA CHATO**: NÃ£o cobre resposta ("E aÃ­?", "Viu?"). OfereÃ§a valor ("Pensei nisso aqui pra vocÃª...").

4. **ESTILO**:
   - Curto (mÃ¡ximo 2 frases).
   - Tom de conversa no WhatsApp (pode usar 1 emoji se fizer sentido, mas sem exageros).
   - NÃ£o pareÃ§a desesperado. Apenas um "lembrete amigo".

5. **PROIBIDO**:
   - NÃ£o use [AÃ‡ÃƒO:...].
   - NÃ£o use aspas na resposta.
   - NÃ£o repita a Ãºltima mensagem que vocÃª jÃ¡ enviou. Tente uma abordagem diferente.`;

    const configuredModel = await getConfiguredModel();
    // â±ï¸ Timeout de 20s para evitar hang em histÃ³ricos longos ou modelo sobrecarregado
    const FOLLOWUP_TIMEOUT_MS = 20_000;
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("FOLLOWUP_TIMEOUT")), FOLLOWUP_TIMEOUT_MS)
    );
    const response = await Promise.race([
      mistral.chat.complete({
        model: configuredModel,
        messages: [{ role: "user", content: prompt }],
        maxTokens: 150,
        temperature: 0.6,
      }),
      timeoutPromise,
    ]);
    
    let content = response.choices?.[0]?.message?.content?.toString() || "";
    
    // Limpeza de seguranÃ§a final â€” remover placeholders vazios
    content = content.replace(/\[Nome\]/gi, "").replace(/\[Cliente\]/gi, "").trim();
    
    // Remover prefixos comuns de "opÃ§Ãµes" que a IA Ã s vezes gera
    content = content.replace(/^(OpÃ§Ã£o \d:|SugestÃ£o:|Mensagem:)\s*/i, "");
    
    // ðŸ”§ FIX 2026-02-26: Remover padrÃµes de traÃ§os que parecem IA/GPT
    content = content.replace(/\-{2,}/g, '');                    // traÃ§os consecutivos
    content = content.replace(/^[\s]*-\s+/gm, 'â€¢ ');           // bullet dash â†’ bullet point
    content = content.replace(/\s*â€”\s*/g, ', ');                // em-dash â†’ vÃ­rgula
    content = content.replace(/\s*â€“\s*/g, ', ');                // en-dash â†’ vÃ­rgula
    content = content.replace(/(?<=[a-zÃ¡Ã©Ã­Ã³ÃºÃ Ã¢ÃªÃ´Ã£Ãµ\s])\s+-\s+(?=[a-zÃ¡Ã©Ã­Ã³ÃºÃ Ã¢ÃªÃ´Ã£ÃµA-Z])/g, ', '); // traÃ§o separador
    content = content.replace(/^[\s]*[â”â•â”€_*]{3,}[\s]*$/gm, ''); // separadores decorativos
    content = content.replace(/,\s*,/g, ',');                    // vÃ­rgulas duplas
    content = content.replace(/^\s*,\s*/gm, '');                 // vÃ­rgula no inÃ­cio de linha
    content = content.replace(/\s+/g, ' ').trim();               // espaÃ§os extras
    
    // Remover aspas se a IA colocar
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    
    // Se a IA gerar "Ou..." no meio do texto (indicando duas opÃ§Ãµes), cortar tudo depois do "Ou"
    const splitOptions = content.split(/\n\s*(?:Ou|ou|Ou se preferir|OpÃ§Ã£o 2)\b/);
    if (splitOptions.length > 1) {
      content = splitOptions[0].trim();
    }

    // Safety: if empty after cleanup, use safe fallback
    if (!content || content.length < 3) {
      console.warn("[FOLLOWUP] Resposta IA vazia apÃ³s limpeza â€” usando fallback");
      return "Oi! Tudo bem? Fico Ã  disposiÃ§Ã£o se quiser continuar. ðŸ˜Š";
    }
    
    return content;
  } catch (error: any) {
    // Log structured error without leaking sensitive data
    const isTimeout = error?.message === "FOLLOWUP_TIMEOUT";
    console.error("[FOLLOWUP] Erro ao gerar follow-up:", {
      type: isTimeout ? "timeout" : "error",
      message: isTimeout ? "Timeout de 20s excedido (histÃ³rico muito longo ou modelo sobrecarregado)" : (error?.message || "desconhecido"),
      code: error?.code,
      status: error?.status,
    });
    return "Oi! Tudo bem? SÃ³ passando para saber se ficou alguma dÃºvida! ðŸ˜Š";
  }
}

/**
 * Gera resposta para contato agendado
 */
export async function generateScheduledContactResponse(phoneNumber: string, reason: string): Promise<string> {
  const session = getClientSession(phoneNumber);
  
  try {
    const mistral = await getLLMClient();
    
    // Buscar nome do contato no banco
    const conversation = await storage.getAdminConversationByPhone(phoneNumber);
    const contactName = conversation?.contactName || "";

    const prompt = `VocÃª Ã© o RODRIGO (V9 - PRINCÃPIOS PUROS).
VocÃª agendou de entrar em contato com o cliente hoje.
Motivo do agendamento: ${reason}
Estado do cliente: ${session?.flowState || 'desconhecido'}
Nome do cliente: ${contactName || "NÃ£o identificado"}

Gere uma mensagem de retorno NATURAL e AMIGÃVEL.

REGRAS:
1. Se tiver o nome "${contactName}", use-o (ex: "Fala ${contactName}, tudo bom?").
2. Se NÃƒO tiver nome, use apenas "Fala! Tudo bom?".
3. JAMAIS use [Nome] ou placeholders.
4. Sem formalidades.
5. NÃƒO use aÃ§Ãµes [AÃ‡ÃƒO:...]. Apenas texto natural.`;

    const configuredModel = await getConfiguredModel();
    const response = await mistral.chat.complete({
      model: configuredModel,
      messages: [{ role: "user", content: prompt }],
      maxTokens: 150,
      temperature: 0.7,
    });
    
    let content = response.choices?.[0]?.message?.content?.toString() || "Fala! Fiquei de te chamar hoje, tudo certo por aÃ­?";
    
    // Limpeza de seguranÃ§a
    content = content.replace(/\[Nome\]/gi, "").replace(/\[Cliente\]/gi, "").trim();
    if (content.startsWith('"') && content.endsWith('"')) {
      content = content.slice(1, -1);
    }
    
    return content;
  } catch {
    return "Fala! Fiquei de te chamar hoje, tudo certo por aÃ­? ðŸ‘";
  }


// ============================================================================
// 🧠 SISTEMA INTELIGENTE (OpenClaw-style)
// ============================================================================

/**
 * Verifica se o modo inteligente está ativado
 */
async function isIntelligentModeEnabled(): Promise<boolean> {
  try {
    const config = await storage.getSystemConfig("admin_agent_intelligent_mode");
    return config?.valor === "true";
  } catch {
    return false; // Desativado por padrão
  }
}

/**
 * Processa mensagem com o sistema inteligente OpenClaw-style
 */
async function processWithIntelligentAgent(
  phoneNumber: string,
  messageText: string,
  mediaType?: string,
  mediaUrl?: string,
  contactName?: string
): Promise<AdminAgentResponse> {
  try {
    console.log(`🧠 [INTELLIGENT] Processando mensagem de ${phoneNumber}`);

    // 1. Buscar ou criar contexto da sessão
    let session = getClientSession(phoneNumber);
    if (!session) {
      session = createClientSession(phoneNumber);
    }

    // Atualizar nome do contato se fornecido
    if (contactName) {
      const normalized = normalizeContactName(contactName);
      if (normalized) {
        session = updateClientSession(phoneNumber, { contactName: normalized });
      }
    }

    // 2. Montar contexto para o agente inteligente
    const context: AgentContext = {
      userId: session.userId,
      email: session.email,
      phoneNumber,
      contactName: session.contactName,
      conversationHistory: session.conversationHistory,
      currentState: session.flowState as any,
      metadata: {
        agentConfig: session.agentConfig,
        awaitingPaymentProof: session.awaitingPaymentProof
      }
    };

    // 3. Processar com o hub inteligente
    const decision = await IntelligentAgentHub.processMessage(
      context,
      messageText,
      mediaType,
      mediaUrl
    );

    console.log(`🎯 [INTELLIGENT] Decisão: ${decision.intent} (${decision.toolsToExecute.length} ferramentas executadas)`);

    // 4. Atualizar sessão com novo estado
    if (decision.nextState) {
      updateClientSession(phoneNumber, { flowState: decision.nextState });
    }

    // 5. Adicionar ao histórico
    addToConversationHistory(phoneNumber, "user", messageText);
    addToConversationHistory(phoneNumber, "assistant", decision.responseTemplate);

    // 6. Extrair dados das ferramentas executadas para ações
    const actions: any = {};
    
    for (const tool of decision.toolsToExecute) {
      if (tool.result) {
        // Adicionar dados relevantes às ações
        if (tool.toolName === "createClientAccount" && tool.result.userId) {
          // Atualizar sessão com userId criado
          updateClientSession(phoneNumber, { 
            userId: tool.result.userId,
            email: tool.result.email
          });
        }
        
        if (tool.toolName === "generateConnectionLink" && tool.result.link) {
          // Nada extra necessário, link já está na resposta
        }
        
        if (tool.toolName === "generatePlanLink" && tool.result.link) {
          // Nada extra necessário, link já está na resposta
        }
      }
    }

    return {
      text: decision.responseTemplate,
      actions
    };

  } catch (error) {
    console.error("❌ [INTELLIGENT] Erro ao processar:", error);
    
    // Fallback: resposta de erro amigável
    return {
      text: "Desculpe, tive um problema ao processar sua mensagem. Pode repetir? 😅",
      actions: {}
    };
  }
}

/**
 * Busca informações do usuário por telefone
 */
async function findUserByPhone(phoneNumber: string): Promise<any | null> {
  try {
    const cleanPhone = phoneNumber.replace(/\D/g, "");
    const users = await storage.getAllUsers();
    return users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone) || null;
  } catch (error) {
    console.error("❌ Erro ao buscar usuário:", error);
    return null;
  }
}

}

