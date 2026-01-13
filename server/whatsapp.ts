import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
  downloadMediaMessage,
  jidNormalizedUser,
  jidDecode,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import { storage } from "./storage";
import WebSocket from "ws";
import { generateAIResponse, type AIResponseResult, type AIResponseOptions } from "./aiAgent";
import { executeMediaActions, downloadMediaAsBuffer } from "./mediaService";
import { registerFollowUpCallback, registerScheduledContactCallback, followUpService } from "./followUpService";
import { userFollowUpService } from "./userFollowUpService";
import { supabase } from "./supabaseAuth";
import { messageQueueService, applyMessageVariation } from "./messageQueueService";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq } from "drizzle-orm";

// ═══════════════════════════════════════════════════════════════════════
// 🛡️ SAFE MODE: Proteção Anti-Bloqueio para Clientes
// ═══════════════════════════════════════════════════════════════════════
// Esta funcionalidade é ativada pelo admin quando um cliente tomou bloqueio
// do WhatsApp e está reconectando. Ao reconectar com Safe Mode ativo:
// 1. Zera a fila de mensagens pendentes
// 2. Desativa todos os follow-ups programados
// 3. Começa do zero para evitar novo bloqueio
// ═══════════════════════════════════════════════════════════════════════

/**
 * Executa limpeza completa quando um cliente reconecta com Safe Mode ativo
 * Chamado automaticamente quando conn === "open" e safeModeEnabled === true
 */
async function executeSafeModeCleanup(userId: string, connectionId: string): Promise<{
  success: boolean;
  messagesCleared: number;
  followupsCleared: number;
  error?: string;
}> {
  console.log(`\n🛡️ ═══════════════════════════════════════════════════════════════`);
  console.log(`🛡️ [SAFE MODE] Iniciando limpeza para usuário ${userId.substring(0, 8)}...`);
  console.log(`🛡️ ═══════════════════════════════════════════════════════════════\n`);

  let messagesCleared = 0;
  let followupsCleared = 0;

  try {
    // 1. Limpar fila de mensagens pendentes
    const queueResult = messageQueueService.clearUserQueue(userId);
    messagesCleared = queueResult.cleared;
    console.log(`🛡️ [SAFE MODE] ✅ Fila de mensagens: ${messagesCleared} mensagens removidas`);

    // 2. Desativar follow-ups de todas as conversas deste usuário
    // Atualizar todas as conversas para: followupActive = false, nextFollowupAt = null
    const followupResult = await db
      .update(conversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupStage: 0,
        followupDisabledReason: 'Safe Mode - limpeza após bloqueio do WhatsApp',
        updatedAt: new Date(),
      })
      .where(eq(conversations.connectionId, connectionId))
      .returning({ id: conversations.id });

    followupsCleared = followupResult.length;
    console.log(`🛡️ [SAFE MODE] ✅ Follow-ups: ${followupsCleared} conversas com follow-up desativado`);

    // 3. Registrar data/hora da última limpeza
    await storage.updateConnection(connectionId, {
      safeModeLastCleanupAt: new Date(),
    });

    console.log(`\n🛡️ [SAFE MODE] ✅ Limpeza concluída com sucesso!`);
    console.log(`🛡️ [SAFE MODE] 📊 Resumo:`);
    console.log(`🛡️   - Mensagens removidas da fila: ${messagesCleared}`);
    console.log(`🛡️   - Follow-ups desativados: ${followupsCleared}`);
    console.log(`🛡️   - Cliente pode usar o WhatsApp normalmente agora`);
    console.log(`🛡️ ═══════════════════════════════════════════════════════════════\n`);

    return {
      success: true,
      messagesCleared,
      followupsCleared,
    };
  } catch (error: any) {
    console.error(`🛡️ [SAFE MODE] ❌ Erro na limpeza:`, error);
    return {
      success: false,
      messagesCleared,
      followupsCleared,
      error: error.message,
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🗂️ FUNÇÃO PARA UPLOAD DE MÍDIA NO SUPABASE STORAGE
// Ao invés de salvar base64 no banco (limite ~1MB), faz upload no Storage
// ═══════════════════════════════════════════════════════════════════════
// Cache para evitar chamadas repetidas de createBucket
let whatsappMediaBucketChecked = false;

async function uploadMediaToStorage(
  buffer: Buffer, 
  mimeType: string, 
  originalFileName?: string
): Promise<string | null> {
  try {
    const timestamp = Date.now();
    const extension = mimeType.split('/')[1]?.split(';')[0] || 'bin';
    const safeFileName = originalFileName 
      ? originalFileName.replace(/[^a-zA-Z0-9.-]/g, '_')
      : `media_${timestamp}`;
    const storagePath = `whatsapp-media/${timestamp}_${safeFileName}.${extension}`;

    // Verificar bucket apenas uma vez por sessão do servidor
    if (!whatsappMediaBucketChecked) {
      const { error: bucketError } = await supabase.storage.createBucket('whatsapp-media', {
        public: true,
        fileSizeLimit: 104857600 // 100MB
      });
      
      if (bucketError && !bucketError.message?.includes('already exists')) {
        console.log(`ℹ️ [STORAGE] Bucket info: ${bucketError.message}`);
      }
      whatsappMediaBucketChecked = true;
    }

    // Upload do arquivo
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('whatsapp-media')
      .upload(storagePath, buffer, {
        contentType: mimeType,
        upsert: true
      });

    if (uploadError) {
      console.error("❌ [STORAGE] Erro no upload:", uploadError);
      return null;
    }

    // Obter URL pública
    const { data: urlData } = supabase.storage
      .from('whatsapp-media')
      .getPublicUrl(storagePath);

    console.log(`✅ [STORAGE] Upload concluído: ${urlData.publicUrl}`);
    return urlData.publicUrl;
  } catch (error) {
    console.error("❌ [STORAGE] Erro ao fazer upload:", error);
    return null;
  }
}

// Cache manual de contatos para mapear @lid → phoneNumber
interface Contact {
  id: string;
  lid?: string;
  phoneNumber?: string;
  name?: string;
}

interface WhatsAppSession {
  socket: WASocket | null;
  userId: string;
  connectionId: string;
  phoneNumber?: string;
  contactsCache: Map<string, Contact>;
}

interface AdminWhatsAppSession {
  socket: WASocket | null;
  adminId: string;
  phoneNumber?: string;
  contactsCache: Map<string, Contact>;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  adminId?: string;
}

const sessions = new Map<string, WhatsAppSession>();
const adminSessions = new Map<string, AdminWhatsAppSession>();
const wsClients = new Map<string, Set<AuthenticatedWebSocket>>();
const adminWsClients = new Map<string, Set<AuthenticatedWebSocket>>();

const DEFAULT_JID_SUFFIX = "s.whatsapp.net";

// 🚫 Set para rastrear IDs de mensagens enviadas pelo agente/usuário via sendMessage
// Evita duplicatas quando Baileys dispara evento fromMe após socket.sendMessage()
const agentMessageIds = new Set<string>();

// 🔧 Função exportada para registrar messageIds de mídias enviadas pelo agente
// Usado pelo mediaService para evitar que handleOutgoingMessage pause a IA incorretamente
export function registerAgentMessageId(messageId: string): void {
  if (messageId) {
    agentMessageIds.add(messageId);
    console.log(`📌 [AGENT MSG] Registrado messageId do agente: ${messageId}`);
  }
}

// 🔒 Map para rastrear solicitações de código de pareamento em andamento
// Evita múltiplas solicitações simultâneas para o mesmo usuário
const pendingPairingRequests = new Map<string, Promise<string | null>>();

// 🔒 Map para rastrear conexões em andamento
// Evita múltiplas tentativas de conexão simultâneas para o mesmo usuário
const pendingConnections = new Map<string, Promise<void>>();

// 🔄 Map para rastrear tentativas de reconexão e evitar loops infinitos
interface ReconnectAttempt {
  count: number;
  lastAttempt: number;
}
const reconnectAttempts = new Map<string, ReconnectAttempt>();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_COOLDOWN_MS = 30000; // 30 segundos entre ciclos de reconexão

// 🚫 MODO DESENVOLVIMENTO: Desabilita processamento de mensagens em localhost
// Útil quando Railway está rodando em produção e você quer desenvolver sem conflitos
// Defina DISABLE_WHATSAPP_PROCESSING=true no .env para ativar
const DISABLE_MESSAGE_PROCESSING = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';

if (DISABLE_MESSAGE_PROCESSING) {
  console.log(`\n🚫 [DEV MODE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
  console.log(`🚫 [DEV MODE] PROCESSAMENTO DE MENSAGENS WHATSAPP DESABILITADO`);
  console.log(`🚫 [DEV MODE] Isso evita conflitos com servidor de produção (Railway)`);
  console.log(`🚫 [DEV MODE] Para reativar, remova DISABLE_WHATSAPP_PROCESSING do .env`);
  console.log(`🚫 [DEV MODE] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
}

// 🎯 SISTEMA DE ACUMULAÇÃO DE MENSAGENS
// Rastreia timeouts pendentes e mensagens acumuladas por conversa
interface PendingResponse {
  timeout: NodeJS.Timeout;
  messages: string[];
  conversationId: string;
  userId: string;
  contactNumber: string;
  jidSuffix: string;
  startTime: number;
  isProcessing?: boolean; // 🔒 FLAG ANTI-DUPLICAÇÃO
}
const pendingResponses = new Map<string, PendingResponse>(); // key: conversationId

// 🔒 ANTI-DUPLICAÇÃO: Set para rastrear conversas em processamento
// Evita que múltiplos timeouts processem a mesma conversa simultaneamente
const conversationsBeingProcessed = new Set<string>();

// 🔒 ANTI-DUPLICAÇÃO: Cache de mensagens recentes enviadas (últimos 5 minutos)
// Evita enviar mensagens idênticas em sequência
const recentlySentMessages = new Map<string, { text: string; timestamp: number }[]>();

// Limpar cache de mensagens enviadas a cada 5 minutos
setInterval(() => {
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [convId, messages] of recentlySentMessages.entries()) {
    const filtered = messages.filter(m => m.timestamp > fiveMinutesAgo);
    if (filtered.length === 0) {
      recentlySentMessages.delete(convId);
    } else {
      recentlySentMessages.set(convId, filtered);
    }
  }
}, 60 * 1000);

// 🔒 Função para verificar se mensagem é duplicata recente
function isRecentDuplicate(conversationId: string, text: string): boolean {
  const recent = recentlySentMessages.get(conversationId) || [];
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  
  for (const msg of recent) {
    if (msg.timestamp > twoMinutesAgo && msg.text === text) {
      return true;
    }
  }
  return false;
}

// 🔒 Função para registrar mensagem enviada
function registerSentMessageCache(conversationId: string, text: string): void {
  const recent = recentlySentMessages.get(conversationId) || [];
  recent.push({ text, timestamp: Date.now() });
  // Manter apenas últimas 10 mensagens
  if (recent.length > 10) recent.shift();
  recentlySentMessages.set(conversationId, recent);
}

// 🎯 SISTEMA DE ACUMULAÇÃO (ADMIN AUTO-ATENDIMENTO)
interface PendingAdminResponse {
  timeout: NodeJS.Timeout | null;
  messages: string[];
  remoteJid: string;
  contactNumber: string;
  generation: number;
  startTime: number;
  conversationId?: string;
  lastKnownPresence?: string;
  lastPresenceUpdate?: number;
}
const pendingAdminResponses = new Map<string, PendingAdminResponse>(); // key: contactNumber

// 🔄 Set para rastrear conversas já verificadas na sessão atual (evita reprocessamento)
const checkedConversationsThisSession = new Set<string>();

// ═══════════════════════════════════════════════════════════════════════
// �️ SISTEMA ANTI-BLOQUEIO - Registro do Callback de Envio Real
// ═══════════════════════════════════════════════════════════════════════
// Esta função é chamada pelo messageQueueService para enviar mensagens reais
// O callback permite que a fila controle o timing entre mensagens
async function internalSendMessageRaw(
  userId: string, 
  jid: string, 
  text: string, 
  options?: { isFromAgent?: boolean }
): Promise<string | null> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp not connected");
  }

  const sentMessage = await session.socket.sendMessage(jid, { text });
  
  if (sentMessage?.key.id) {
    agentMessageIds.add(sentMessage.key.id);
    console.log(`🛡️ [ANTI-BLOCK] ✅ Mensagem enviada - ID: ${sentMessage.key.id}`);
  }

  return sentMessage?.key.id || null;
}

// Registrar callback no messageQueueService
messageQueueService.registerSendCallback(internalSendMessageRaw);

// ═══════════════════════════════════════════════════════════════════════
// �🔄 VERIFICAÇÃO DE MENSAGENS NÃO RESPONDIDAS AO RECONECTAR
// ═══════════════════════════════════════════════════════════════════════
// Quando o WhatsApp reconecta (após desconexão/restart), verificamos se há
// clientes que mandaram mensagem nas últimas 24h e não foram respondidos.
// Isso resolve o problema de mensagens perdidas durante desconexões.
// ═══════════════════════════════════════════════════════════════════════
async function checkUnrespondedMessages(session: WhatsAppSession): Promise<void> {
  const { userId, connectionId } = session;
  
  console.log(`\n🔍 [UNRESPONDED CHECK] Iniciando verificação de mensagens não respondidas...`);
  console.log(`   👤 Usuário: ${userId}`);
  
  try {
    // 1. Verificar se o agente está ativo
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) {
      console.log(`⏹️ [UNRESPONDED CHECK] Agente inativo, pulando verificação`);
      return;
    }
    
    // 2. Buscar todas as conversas deste usuário
    const allConversations = await storage.getConversationsByConnectionId(connectionId);
    
    // 3. Filtrar conversas das últimas 24 horas
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentConversations = allConversations.filter(conv => {
      if (!conv.lastMessageTime) return false;
      const lastMsgTime = new Date(conv.lastMessageTime);
      return lastMsgTime >= twentyFourHoursAgo;
    });
    
    console.log(`📊 [UNRESPONDED CHECK] ${recentConversations.length} conversas nas últimas 24h`);
    
    let unrespondedCount = 0;
    let processedCount = 0;
    
    for (const conversation of recentConversations) {
      // Evitar reprocessar na mesma sessão
      if (checkedConversationsThisSession.has(conversation.id)) {
        continue;
      }
      checkedConversationsThisSession.add(conversation.id);
      
      // 4. Verificar se agente está pausado para esta conversa
      const isDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (isDisabled) {
        continue;
      }
      
      // 5. Buscar mensagens desta conversa
      const messages = await storage.getMessagesByConversationId(conversation.id);
      if (messages.length === 0) continue;
      
      // 6. Verificar última mensagem
      const lastMessage = messages[messages.length - 1];
      
      // Se última mensagem é do cliente (não é fromMe), precisa responder
      if (!lastMessage.fromMe) {
        unrespondedCount++;
        
        // 7. Verificar se já tem resposta pendente
        if (pendingResponses.has(conversation.id)) {
          console.log(`⏳ [UNRESPONDED CHECK] ${conversation.contactNumber} - Já tem resposta pendente`);
          continue;
        }
        
        console.log(`📨 [UNRESPONDED CHECK] ${conversation.contactNumber} - Última mensagem do cliente SEM RESPOSTA`);
        console.log(`   💬 Mensagem: "${(lastMessage.text || '[mídia]').substring(0, 50)}..."`);
        console.log(`   🕐 Enviada em: ${lastMessage.timestamp}`);
        
        // 8. Agendar resposta com delay para não sobrecarregar
        const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
        const delayForThisMessage = (processedCount * 5000) + (responseDelaySeconds * 1000); // 5s entre cada + delay normal
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages: [lastMessage.text || '[mídia recebida]'],
          conversationId: conversation.id,
          userId,
          contactNumber: conversation.contactNumber,
          jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now(),
        };
        
        pending.timeout = setTimeout(async () => {
          console.log(`🚀 [UNRESPONDED CHECK] Processando resposta atrasada para ${conversation.contactNumber}`);
          await processAccumulatedMessages(pending);
        }, delayForThisMessage);
        
        pendingResponses.set(conversation.id, pending);
        processedCount++;
        
        console.log(`⏱️ [UNRESPONDED CHECK] Resposta agendada em ${Math.round(delayForThisMessage/1000)}s`);
      }
    }
    
    console.log(`\n✅ [UNRESPONDED CHECK] Verificação concluída:`);
    console.log(`   📊 Total conversas 24h: ${recentConversations.length}`);
    console.log(`   ❓ Não respondidas: ${unrespondedCount}`);
    console.log(`   🚀 Respostas agendadas: ${processedCount}\n`);
    
  } catch (error) {
    console.error(`❌ [UNRESPONDED CHECK] Erro na verificação:`, error);
  }
}

function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function randomBetween(minMs: number, maxMs: number): number {
  if (maxMs <= minMs) return minMs;
  return minMs + Math.floor(Math.random() * (maxMs - minMs));
}

async function getAdminAgentRuntimeConfig(): Promise<{
  responseDelayMs: number;
  messageSplitChars: number;
  typingDelayMinMs: number;
  typingDelayMaxMs: number;
  messageIntervalMinMs: number;
  messageIntervalMaxMs: number;
}> {
  try {
    const [splitChars, responseDelay, typingMin, typingMax, intervalMin, intervalMax, promptStyle] = await Promise.all([
      storage.getSystemConfig("admin_agent_message_split_chars"),
      storage.getSystemConfig("admin_agent_response_delay_seconds"),
      storage.getSystemConfig("admin_agent_typing_delay_min"),
      storage.getSystemConfig("admin_agent_typing_delay_max"),
      storage.getSystemConfig("admin_agent_message_interval_min"),
      storage.getSystemConfig("admin_agent_message_interval_max"),
      storage.getSystemConfig("admin_agent_prompt_style"),
    ]);

    const messageSplitChars = clampInt(parseInt(splitChars?.valor || "400", 10) || 400, 0, 5000);
    // Alterado padrão de 30s para 6s conforme solicitação
    let responseDelaySeconds = clampInt(parseInt(responseDelay?.valor || "6", 10) || 6, 1, 180);
    const typingDelayMin = clampInt(parseInt(typingMin?.valor || "2", 10) || 2, 0, 60);
    const typingDelayMax = clampInt(parseInt(typingMax?.valor || "5", 10) || 5, typingDelayMin, 120);
    const messageIntervalMin = clampInt(parseInt(intervalMin?.valor || "3", 10) || 3, 0, 120);
    const messageIntervalMax = clampInt(parseInt(intervalMax?.valor || "8", 10) || 8, messageIntervalMin, 240);

    // Se o estilo for "human", forçar um delay menor para parecer mais natural (se estiver alto)
    const style = promptStyle?.valor || "nuclear";
    if (style === "human" && responseDelaySeconds > 10) {
      console.log(`⚡ [ADMIN AGENT] Estilo Human detectado: Reduzindo delay de ${responseDelaySeconds}s para 6s`);
      responseDelaySeconds = 6;
    }

    return {
      responseDelayMs: responseDelaySeconds * 1000,
      messageSplitChars,
      typingDelayMinMs: typingDelayMin * 1000,
      typingDelayMaxMs: typingDelayMax * 1000,
      messageIntervalMinMs: messageIntervalMin * 1000,
      messageIntervalMaxMs: messageIntervalMax * 1000,
    };
  } catch (error) {
    console.error("[ADMIN AGENT] Failed to load runtime config, using defaults", error);
    return {
      responseDelayMs: 6000, // Default 6s
      messageSplitChars: 400,
      typingDelayMinMs: 2000,
      typingDelayMaxMs: 5000,
      messageIntervalMinMs: 3000,
      messageIntervalMaxMs: 8000,
    };
  }
}

async function scheduleAdminAccumulatedResponse(params: {
  socket: WASocket;
  remoteJid: string;
  contactNumber: string;
  messageText: string;
  conversationId?: string;
}): Promise<void> {
  const { socket, remoteJid, contactNumber, messageText, conversationId } = params;
  const config = await getAdminAgentRuntimeConfig();
  const key = contactNumber;

  console.log(`\n📥 [ADMIN AGENT] Mensagem recebida de ${contactNumber}`);
  console.log(`   ⏱️ Delay configurado: ${config.responseDelayMs}ms (${config.responseDelayMs/1000}s)`);

  // 🔔 FIX: Inscrever-se explicitamente para receber atualizações de presença (digitando/pausado)
  // Sem isso, o Baileys pode não receber os eventos 'presence.update'
  try {
    const normalizedJid = jidNormalizedUser(remoteJid);
    await socket.presenceSubscribe(normalizedJid);
    await socket.sendPresenceUpdate('available'); // Forçar status online
    console.log(`   👀 [PRESENCE] Inscrito para atualizações de: ${normalizedJid}`);
  } catch (err) {
    console.error(`   ❌ [PRESENCE] Falha ao inscrever:`, err);
  }

  const existing = pendingAdminResponses.get(key);
  if (existing) {
    if (existing.timeout) {
      clearTimeout(existing.timeout);
    }
    existing.messages.push(messageText);
    existing.generation += 1;
    console.log(`   📝 Acumulando msg ${existing.messages.length}. Reset do timer para ${config.responseDelayMs}ms`);
    existing.timeout = setTimeout(() => {
      void processAdminAccumulatedMessages({ socket, key, generation: existing.generation });
    }, config.responseDelayMs);
    return;
  }

  // Verificar se conversa já existe no banco
  const existingConversation = conversationId ? await storage.getAdminConversation(conversationId) : null;
  const isNewConversation = !existingConversation;

  const pending: PendingAdminResponse = {
    timeout: null,
    messages: [messageText],
    remoteJid,
    contactNumber,
    generation: 1,
    startTime: Date.now(),
    conversationId,
  };

  if (isNewConversation) {
    console.log(`   🆕 Nova conversa. Timer de ${config.responseDelayMs}ms iniciado`);
  } else {
    console.log(`   🔄 Conversa existente. Timer de ${config.responseDelayMs}ms iniciado`);
  }
  
  pending.timeout = setTimeout(() => {
    void processAdminAccumulatedMessages({ socket, key, generation: pending.generation });
  }, config.responseDelayMs);

  pendingAdminResponses.set(key, pending);
}

async function processAdminAccumulatedMessages(params: {
  socket: WASocket;
  key: string;
  generation: number;
}): Promise<void> {
  const { socket, key, generation } = params;
  const pending = pendingAdminResponses.get(key);
  if (!pending) return;
  if (pending.generation !== generation) return;

  // Mark timer as consumed
  pending.timeout = null;

  const config = await getAdminAgentRuntimeConfig();
  const combinedText = pending.messages.join("\n\n");

  const waitSeconds = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\n🤖 [ADMIN AGENT] =========== PROCESSANDO RESPOSTA ==========`);
  console.log(`   ⏱️ Aguardou ${waitSeconds}s | ${pending.messages.length} msg(s) acumulada(s)`);
  console.log(`   📱 Cliente: ${pending.contactNumber}`);
  console.log(`   📊 Config carregada:`);
  console.log(`      - Tempo resposta: ${config.responseDelayMs}ms`);
  console.log(`      - Typing delay: ${config.typingDelayMinMs}-${config.typingDelayMaxMs}ms`);
  console.log(`      - Split chars: ${config.messageSplitChars}`);
  console.log(`      - Intervalo blocos: ${config.messageIntervalMinMs}-${config.messageIntervalMaxMs}ms`);

  try {
    // 🔒 RE-VERIFICAR STATUS DO AGENTE (Double Check)
    // Isso previne que mensagens acumuladas sejam enviadas se o agente foi desativado durante o delay
    // ou se a verificação inicial falhou.
    if (pending.conversationId) {
        const isEnabled = await storage.isAdminAgentEnabledForConversation(pending.conversationId);
        if (!isEnabled) {
            console.log(`⏸️ [ADMIN AGENT] Agente desativado durante acumulação para ${pending.contactNumber}. Cancelando envio.`);
            pendingAdminResponses.delete(key);
            return;
        }
    } else {
        // Fallback: Tentar buscar conversa pelo número se não tiver ID salvo no pending
        try {
            const admins = await storage.getAllAdmins();
            if (admins.length > 0) {
                const conv = await storage.getAdminConversationByContact(admins[0].id, pending.contactNumber);
                if (conv && !conv.isAgentEnabled) {
                    console.log(`⏸️ [ADMIN AGENT] Agente desativado (verificação tardia) para ${pending.contactNumber}. Cancelando envio.`);
                    pendingAdminResponses.delete(key);
                    return;
                }
            }
        } catch (err) {
            console.error("Erro na verificação tardia de status:", err);
        }
    }

    const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");

    // skipTriggerCheck = false para aplicar validação de frases gatilho no WhatsApp real
    const response = await processAdminMessage(pending.contactNumber, combinedText, undefined, undefined, false);

    // Se response é null, significa que não passou na validação de frase gatilho
    if (response === null) {
      console.log(`⏸️ [ADMIN AGENT] Mensagem ignorada - sem frase gatilho`);
      pendingAdminResponses.delete(key);
      return;
    }

    // Se novas mensagens chegaram enquanto a IA processava, cancela este envio
    const stillCurrent = pendingAdminResponses.get(key);
    if (!stillCurrent || stillCurrent.generation !== generation) {
      console.log(`🔄 [ADMIN AGENT] Nova mensagem chegou durante processamento; descartando resposta antiga`);
      return;
    }

    // Delay de digitação humanizada
    const typingDelay = randomBetween(config.typingDelayMinMs, config.typingDelayMaxMs);
    await new Promise((r) => setTimeout(r, typingDelay));

    // 🔒 CHECK FINAL DE PRESENÇA (Double Check)
    // Se o usuário começou a digitar durante o delay de digitação, abortar envio
    let checkPresence = pendingAdminResponses.get(key);
    
    // Lógica de Retry para "Composing" travado (Solicitado pelo usuário: "logica profunda")
    // Se estiver digitando, vamos aguardar um pouco e verificar novamente
    // Isso resolve casos onde a conexão cai e não recebemos o "paused"
    let retryCount = 0;
    const maxRetries = 3;
    
    while (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing') && retryCount < maxRetries) {
        console.log(`✋ [ADMIN AGENT] Usuário digitando (check final). Aguardando confirmação... (${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 5000)); // Espera 5s
        checkPresence = pendingAdminResponses.get(key);
        retryCount++;
    }

    if (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing')) {
        // Se ainda estiver digitando após retries, verificar se o status é antigo (stale)
        const lastUpdate = checkPresence.lastPresenceUpdate || 0;
        const timeSinceUpdate = Date.now() - lastUpdate;
        const STALE_THRESHOLD = 45000; // 45 segundos

        if (timeSinceUpdate > STALE_THRESHOLD) {
             console.log(`⚠️ [ADMIN AGENT] Status 'composing' parece travado (${Math.floor(timeSinceUpdate/1000)}s). Ignorando e enviando.`);
             // Prossegue para envio...
        } else {
             console.log(`✋ [ADMIN AGENT] Usuário voltou a digitar (check final). Abortando envio.`);
             return;
        }
    }

    // Quebrar mensagem longa em partes
    const parts = splitMessageHumanLike(response.text || "", config.messageSplitChars);

    for (let i = 0; i < parts.length; i++) {
      const current = pendingAdminResponses.get(key);
      if (!current || current.generation !== generation) {
        console.log(`🔄 [ADMIN AGENT] Cancelando envio (mensagens novas chegaram)`);
        return;
      }

      // 🔒 CHECK DE PRESENÇA NO LOOP
      if (current.timeout !== null || current.lastKnownPresence === 'composing') {
          // Verificar se é stale
          const lastUpdate = current.lastPresenceUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;
          
          if (timeSinceUpdate > 45000) {
              console.log(`⚠️ [ADMIN AGENT] Status 'composing' travado durante envio. Ignorando.`);
          } else {
              console.log(`✋ [ADMIN AGENT] Usuário voltou a digitar durante envio. Abortando.`);
              return;
          }
      }

      if (i > 0) {
        const interval = randomBetween(config.messageIntervalMinMs, config.messageIntervalMaxMs);
        await new Promise((r) => setTimeout(r, interval));
      }

      await socket.sendMessage(pending.remoteJid, { text: parts[i] });
    }

    console.log(`✅ [ADMIN AGENT] Resposta enviada para ${pending.contactNumber}`);

    // 💾 Salvar resposta do agente no banco de dados
    if (pending.conversationId && response.text) {
      try {
        await storage.createAdminMessage({
          conversationId: pending.conversationId,
          messageId: `agent_${Date.now()}`,
          fromMe: true,
          text: response.text,
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });
        
        // Atualizar última mensagem da conversa
        await storage.updateAdminConversation(pending.conversationId, {
          lastMessageText: response.text.substring(0, 255),
          lastMessageTime: new Date(),
        });
        
        console.log(`💾 [ADMIN AGENT] Resposta salva na conversa ${pending.conversationId}`);
      } catch (dbError) {
        console.error(`❌ [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
      }
    }

    // Notificação de pagamento
    if (response.actions?.notifyOwner) {
      const ownerNumber = await getOwnerNotificationNumber();
      const ownerJid = `${ownerNumber}@s.whatsapp.net`;
      const notificationText = `💰 *NOTIFICAÇÃO DE PAGAMENTO*\n\n📱 Cliente: ${pending.contactNumber}\n⏰ ${new Date().toLocaleString("pt-BR")}\n\n⚠️ Verificar comprovante e liberar conta`;
      await socket.sendMessage(ownerJid, { text: notificationText });
      console.log(`📢 [ADMIN AGENT] Notificação enviada para ${ownerNumber}`);
    }

    // 📁 Enviar mídias se houver
    if (response.mediaActions && response.mediaActions.length > 0) {
      console.log(`📁 [ADMIN AGENT] Enviando ${response.mediaActions.length} mídia(s)...`);
      
      for (const action of response.mediaActions) {
        if (action.mediaData) {
          try {
            const media = action.mediaData;
            console.log(`📁 [ADMIN AGENT] Enviando mídia: ${media.name} (${media.mediaType})`);
            
            // Baixar mídia da URL
            const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
            
            if (mediaBuffer) {
              switch (media.mediaType) {
                case 'image':
                  await socket.sendMessage(pending.remoteJid, {
                    image: mediaBuffer,
                    caption: media.caption || undefined,
                  });
                  break;
                case 'audio':
                  await socket.sendMessage(pending.remoteJid, {
                    audio: mediaBuffer,
                    mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                    ptt: true, // Voice message
                  });
                  break;
                case 'video':
                  await socket.sendMessage(pending.remoteJid, {
                    video: mediaBuffer,
                    caption: media.caption || undefined,
                  });
                  break;
                case 'document':
                  await socket.sendMessage(pending.remoteJid, {
                    document: mediaBuffer,
                    fileName: media.fileName || 'document',
                    mimetype: media.mimeType || 'application/octet-stream',
                  });
                  break;
              }
              console.log(`✅ [ADMIN AGENT] Mídia ${media.name} enviada com sucesso`);
            } else {
              console.error(`❌ [ADMIN AGENT] Falha ao baixar mídia: ${media.storageUrl}`);
            }
          } catch (mediaError) {
            console.error(`❌ [ADMIN AGENT] Erro ao enviar mídia ${action.media_name}:`, mediaError);
          }
          
          // Pequeno delay entre mídias
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // 🔌 Desconectar WhatsApp se solicitado
    if (response.actions?.disconnectWhatsApp) {
      try {
        const { getClientSession } = await import("./adminAgentService");
        const clientSession = getClientSession(pending.contactNumber);
        
        if (clientSession?.userId) {
          console.log(`🔌 [ADMIN AGENT] Desconectando WhatsApp do usuário ${clientSession.userId}...`);
          await disconnectWhatsApp(clientSession.userId);
          await socket.sendMessage(pending.remoteJid, { text: "Pronto! 🔌 Seu WhatsApp foi desconectado. Quando quiser reconectar, é só me avisar!" });
          console.log(`✅ [ADMIN AGENT] WhatsApp desconectado para ${clientSession.userId}`);
        } else {
          await socket.sendMessage(pending.remoteJid, { text: "Não encontrei uma conexão ativa para desconectar. Você já está desconectado!" });
        }
      } catch (disconnectError) {
        console.error("❌ [ADMIN AGENT] Erro ao desconectar WhatsApp:", disconnectError);
        await socket.sendMessage(pending.remoteJid, { text: "Tive um problema ao tentar desconectar. Pode tentar de novo?" });
      }
    }

    // 📲 Enviar código de pareamento se solicitado
    if (response.actions?.connectWhatsApp) {
      console.log(`📲 [ADMIN AGENT] Ação connectWhatsApp (código pareamento) detectada!`);
      try {
        // Buscar userId da sessão do cliente
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensurePairingCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`📲 [ADMIN AGENT] Sessão do cliente para pareamento:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "não encontrada");
        
        // 🔄 BUSCAR NO BANCO SE NÃO TEM userId NA SESSÃO
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`📲 [ADMIN AGENT] Buscando usuário no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`📲 [ADMIN AGENT] Usuário encontrado no banco: ${existingUser.id}`);
            // Atualizar sessão com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se não tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`📲 [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar código...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sessão atualizada
            console.log(`✅ [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensurePairingCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            requestPairingCode: requestClientPairingCode,
            sendText: (text) => socket.sendMessage(pending.remoteJid, { text }).then(() => undefined),
          });
        } else {
          await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
        }
      } catch (codeError) {
        console.error("❌ [ADMIN AGENT] Erro ao gerar código de pareamento:", codeError);
        const errorMsg = (codeError as Error).message || String(codeError);
        console.error("❌ [ADMIN AGENT] Detalhes do erro:", errorMsg);
        await socket.sendMessage(pending.remoteJid, {
          text: "Desculpa, tive um problema técnico ao gerar o código agora. Eu continuo tentando e te envio automaticamente assim que sair.\n\nSe preferir, também posso conectar por QR Code.",
        });
      }
    }

    // 📷 Enviar QR Code como imagem se solicitado
    if (response.actions?.sendQrCode) {
      console.log(`📷 [ADMIN AGENT] Ação sendQrCode detectada! Iniciando processo...`);
      try {
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensureQrCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`📷 [ADMIN AGENT] Sessão do cliente:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "não encontrada");
        
        // 🔄 BUSCAR NO BANCO SE NÃO TEM userId NA SESSÃO
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`📷 [ADMIN AGENT] Buscando usuário no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`📷 [ADMIN AGENT] Usuário encontrado no banco: ${existingUser.id}`);
            // Atualizar sessão com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se não tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`📷 [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar QR Code...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sessão atualizada
            console.log(`✅ [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensureQrCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            connectWhatsApp,
            sendText: (text) => socket.sendMessage(pending.remoteJid, { text }).then(() => undefined),
            sendImage: (image, caption) =>
              socket.sendMessage(pending.remoteJid, { image, caption }).then(() => undefined),
          });
        } else {
          await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
        }
      } catch (qrError) {
        console.error("❌ [ADMIN AGENT] Erro ao enviar QR Code:", qrError);
        await socket.sendMessage(pending.remoteJid, {
          text: "Desculpa, tive um problema pra gerar o QR Code agora. Eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, também posso conectar pelo código de 8 dígitos.",
        });
      }
    }

    // Limpar fila (somente se ainda for a geração atual)
    const current = pendingAdminResponses.get(key);
    if (current && current.generation === generation) {
      pendingAdminResponses.delete(key);
    }
  } catch (error) {
    console.error("❌ [ADMIN AGENT] Erro ao processar mensagens acumuladas:", error);
  }
}

// 🤖 HUMANIZAÇÃO: Quebra mensagem longa em partes menores
// Best practices: WhatsApp, Intercom, Drift quebram a cada 2-3 parágrafos ou 300-500 chars
// Fonte: https://www.drift.com/blog/conversational-marketing-best-practices/
// CORREÇÃO 2025: Não corta palavras nem frases no meio - divide corretamente respeitando limites naturais
// EXPORTADA para uso no simulador (/api/agent/test) - garante consistência entre simulador e WhatsApp real
export function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  // Se maxChars = 0, retorna mensagem completa sem divisão
  if (maxChars === 0) {
    return [message];
  }
  
  // Mensagem pequena - retorna diretamente
  if (message.length <= maxChars) {
    return [message];
  }
  
  const MAX_CHARS = maxChars;
  const finalParts: string[] = [];
  
  // FASE 1: Dividir por parágrafos duplos (quebras de seção)
  const sections = message.split('\n\n').filter(s => s.trim());
  
  // FASE 2: Processar cada seção, quebrando em partes menores se necessário
  for (const section of sections) {
    const sectionParts = splitSectionIntoChunks(section, MAX_CHARS);
    finalParts.push(...sectionParts);
  }
  
  // FASE 3: Agrupar partes pequenas respeitando o limite
  const optimizedParts: string[] = [];
  let currentBuffer = '';
  
  for (const part of finalParts) {
    const separator = currentBuffer ? '\n\n' : '';
    const combined = currentBuffer + separator + part;
    
    if (combined.length <= MAX_CHARS) {
      currentBuffer = combined;
    } else {
      if (currentBuffer.trim()) {
        optimizedParts.push(currentBuffer.trim());
      }
      currentBuffer = part;
    }
  }
  
  // Adicionar último buffer
  if (currentBuffer.trim()) {
    optimizedParts.push(currentBuffer.trim());
  }
  
  console.log(`📝 [SPLIT] Mensagem dividida em ${optimizedParts.length} partes (limite: ${MAX_CHARS} chars)`);
  optimizedParts.forEach((p, i) => {
    console.log(`   Parte ${i+1}/${optimizedParts.length}: ${p.length} chars`);
  });
  
  return optimizedParts.length > 0 ? optimizedParts : [message];
}

// Função auxiliar para dividir uma seção em chunks menores sem cortar palavras/frases
function splitSectionIntoChunks(section: string, maxChars: number): string[] {
  // Se a seção cabe no limite, retorna direto
  if (section.length <= maxChars) {
    return [section];
  }
  
  const chunks: string[] = [];
  
  // ESTRATÉGIA 1: Tentar dividir por quebras de linha simples
  const lines = section.split('\n').filter(l => l.trim());
  if (lines.length > 1) {
    let currentChunk = '';
    for (const line of lines) {
      const separator = currentChunk ? '\n' : '';
      if ((currentChunk + separator + line).length <= maxChars) {
        currentChunk = currentChunk + separator + line;
      } else {
        if (currentChunk.trim()) {
          chunks.push(currentChunk.trim());
        }
        // Se a linha individual é maior que o limite, processa ela recursivamente
        if (line.length > maxChars) {
          const subChunks = splitTextBySentences(line, maxChars);
          chunks.push(...subChunks);
          currentChunk = '';
        } else {
          currentChunk = line;
        }
      }
    }
    if (currentChunk.trim()) {
      chunks.push(currentChunk.trim());
    }
    return chunks;
  }
  
  // ESTRATÉGIA 2: Dividir por frases (pontuação)
  return splitTextBySentences(section, maxChars);
}

// Divide texto por frases, garantindo que não corte palavras ou URLs
function splitTextBySentences(text: string, maxChars: number): string[] {
  // PROTEÇÃO DE URLs: Substituir pontos em URLs por placeholder temporário
  // para evitar que a regex de frases corte no meio de URLs
  const urlPlaceholder = '‹URL_DOT›';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  // Substituir URLs por placeholders numerados
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    // Substituir pontos dentro da URL por placeholder
    return `‹URL_${index}›`;
  });
  
  // Regex para encontrar frases (terminadas em . ! ? seguidos de espaço/fim)
  // IMPORTANTE: Removido o hífen (-) como delimitador de frase para não cortar
  // palavras compostas como "segunda-feira", "terça-feira", etc.
  const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences = protectedText.match(sentencePattern) || [protectedText];
  
  // Restaurar URLs nos resultados
  const restoredSentences = sentences.map(sentence => {
    let restored = sentence;
    protectedUrls.forEach((url, index) => {
      restored = restored.replace(`‹URL_${index}›`, url);
    });
    return restored;
  });
  
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const sentence of restoredSentences) {
    const trimmedSentence = sentence.trim();
    if (!trimmedSentence) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + trimmedSentence : trimmedSentence;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      // Salvar chunk atual se existir
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // Se a frase individual é maior que o limite, divide por palavras
      if (trimmedSentence.length > maxChars) {
        const wordChunks = splitByWords(trimmedSentence, maxChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedSentence;
      }
    }
  }
  
  // Adicionar último chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Última estratégia: divide por palavras (nunca corta uma palavra no meio, PROTEGE URLs)
function splitByWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const chunks: string[] = [];
  let currentChunk = '';
  
  for (const word of words) {
    if (!word) continue;
    
    const combined = currentChunk ? currentChunk + ' ' + word : word;
    
    if (combined.length <= maxChars) {
      currentChunk = combined;
    } else {
      // Salvar chunk atual
      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim());
      }
      
      // Se a palavra individual é maior que o limite
      if (word.length > maxChars) {
        // PROTEÇÃO: Se for uma URL, NUNCA quebrar - coloca inteira mesmo que ultrapasse o limite
        if (word.match(/^https?:\/\//i)) {
          console.log(`🔗 [SPLIT] URL protegida (não será cortada): ${word.substring(0, 50)}...`);
          currentChunk = word; // URL fica inteira, mesmo que ultrapasse o limite
        } else {
          // Último recurso para palavras não-URL: quebra caractere por caractere
          console.log(`⚠️ [SPLIT] Palavra muito longa sendo quebrada: ${word.substring(0, 30)}...`);
          let remaining = word;
          while (remaining.length > maxChars) {
            chunks.push(remaining.substring(0, maxChars));
            remaining = remaining.substring(maxChars);
          }
          currentChunk = remaining;
        }
      } else {
        currentChunk = word;
      }
    }
  }
  
  // Adicionar último chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// Base directory for storing Baileys multi-file auth state.
// Defaults to current working directory (backwards compatible with ./auth_*)
// You can set SESSIONS_DIR (e.g., "/data/whatsapp-sessions" on Railway volumes)
// to persist sessions between deploys and avoid baking them into the image.
const SESSIONS_BASE = process.env.SESSIONS_DIR || "./";

async function ensureDirExists(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    console.error(`[WHATSAPP] Failed to ensure sessions directory exists: ${dirPath}`, error);
  }
}

// Best-effort: ensure the base dir exists when configured via env.
// This helps confirm Railway volumes are mounted and writable.
if (process.env.SESSIONS_DIR) {
  console.log(`[WHATSAPP] Using SESSIONS_DIR=${SESSIONS_BASE}`);
  void ensureDirExists(SESSIONS_BASE);
} else {
  console.log(`[WHATSAPP] Using default sessions dir (ephemeral): ${SESSIONS_BASE}`);
}

function cleanContactNumber(input?: string | null): string {
  return (input?.split(":")[0] || "").replace(/\D/g, "");
}

async function parseRemoteJid(remoteJid: string, contactsCache?: Map<string, Contact>, connectionId?: string) {
  const decoded = jidDecode(remoteJid);
  const rawUser = decoded?.user || remoteJid.split("@")[0] || "";
  let jidSuffix = decoded?.server || remoteJid.split("@")[1]?.split(":")[0] || DEFAULT_JID_SUFFIX;

  console.log(`\n🔍 [parseRemoteJid] ========== DEBUG START ==========`);
  console.log(`   Input remoteJid: ${remoteJid}`);
  console.log(`   Decoded user: ${rawUser}`);
  console.log(`   Decoded server: ${jidSuffix}`);
  console.log(`   Is @lid?: ${remoteJid.includes("@lid")}`);
  console.log(`   Cache size: ${contactsCache?.size || 0}`);
  console.log(`   ConnectionId provided: ${connectionId || "N/A"}`);

  // FIX LID 2025: Para @lid, retornar o próprio LID (sem tentar converter)
  let contactNumber = cleanContactNumber(rawUser);
  
  if (remoteJid.includes("@lid")) {
    console.log(`   🔎 [LID DETECTED] Instagram/Facebook Business contact`);
    console.log(`      LID: ${remoteJid}`);
    console.log(`      ℹ️ LIDs são IDs do Meta, não números WhatsApp`);
    console.log(`      ✅ Usando LID diretamente (comportamento correto)`);
  }  const normalizedJid = contactNumber
    ? jidNormalizedUser(`${contactNumber}@${jidSuffix}`)
    : jidNormalizedUser(remoteJid);

  console.log(`   📤 [parseRemoteJid] Resultado final:`);
  console.log(`      contactNumber: ${contactNumber}`);
  console.log(`      jidSuffix: ${jidSuffix}`);
  console.log(`      normalizedJid: ${normalizedJid}`);
  console.log(`   ========== DEBUG END ==========\n`);

  return { contactNumber, jidSuffix, normalizedJid };
}

function buildSendJid(conversation: { contactNumber?: string; remoteJid?: string | null; jidSuffix?: string | null }) {
  if (conversation.remoteJid) {
    return jidNormalizedUser(conversation.remoteJid);
  }

  const suffix = conversation.jidSuffix || DEFAULT_JID_SUFFIX;
  const number = cleanContactNumber(conversation.contactNumber || "");
  return jidNormalizedUser(`${number}@${suffix}`);
}

export function addWebSocketClient(ws: AuthenticatedWebSocket, userId: string) {
  if (!wsClients.has(userId)) {
    wsClients.set(userId, new Set());
  }
  wsClients.get(userId)!.add(ws);

  ws.on("close", () => {
    const userClients = wsClients.get(userId);
    if (userClients) {
      userClients.delete(ws);
      if (userClients.size === 0) {
        wsClients.delete(userId);
      }
    }
  });
}

export function addAdminWebSocketClient(ws: AuthenticatedWebSocket, adminId: string) {
  if (!adminWsClients.has(adminId)) {
    adminWsClients.set(adminId, new Set());
  }
  adminWsClients.get(adminId)!.add(ws);

  ws.on("close", () => {
    const adminClients = adminWsClients.get(adminId);
    if (adminClients) {
      adminClients.delete(ws);
      if (adminClients.size === 0) {
        adminWsClients.delete(adminId);
      }
    }
  });
}

export function broadcastToUser(userId: string, data: any) {
  const userClients = wsClients.get(userId);
  if (!userClients) {
    console.log(`[BROADCAST] No WebSocket clients found for user ${userId}`);
    return;
  }

  let sentCount = 0;
  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
      sentCount++;
    }
  });
  console.log(`[BROADCAST] Sent message to ${sentCount}/${userClients.size} clients for user ${userId}, type: ${data.type}`);
}

function broadcastToAdmin(adminId: string, data: any) {
  const adminClients = adminWsClients.get(adminId);
  if (!adminClients) {
    return;
  }

  adminClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

// FunÃ§Ã£o para limpar arquivos de autenticaÃ§Ã£o
async function clearAuthFiles(authPath: string): Promise<void> {
  try {
    const exists = await fs.access(authPath).then(() => true).catch(() => false);
    if (exists) {
      await fs.rm(authPath, { recursive: true, force: true });
      console.log(`Cleared auth files at: ${authPath}`);
    }
  } catch (error) {
    console.error(`Error clearing auth files at ${authPath}:`, error);
  }
}

// Força reconexão limpando sessão existente na memória (sem apagar arquivos de auth)
export async function forceReconnectWhatsApp(userId: string): Promise<void> {
  console.log(`[FORCE RECONNECT] Starting force reconnection for user ${userId}...`);
  
  // Limpar sessão existente na memória (se houver)
  const existingSession = sessions.get(userId);
  if (existingSession?.socket) {
    console.log(`[FORCE RECONNECT] Found existing session in memory, closing it...`);
    try {
      // Fechar socket sem fazer logout (preserva credenciais)
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RECONNECT] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(userId);
  }
  
  // Limpar pending connections e tentativas de reconexão
  pendingConnections.delete(userId);
  reconnectAttempts.delete(userId);
  
  // Agora chamar connectWhatsApp normalmente
  await connectWhatsApp(userId);
}

// Força reset COMPLETO - apaga arquivos de autenticação (força novo QR Code)
export async function forceResetWhatsApp(userId: string): Promise<void> {
  console.log(`[FORCE RESET] Starting complete reset for user ${userId}...`);
  
  // Limpar sessão existente na memória (se houver)
  const existingSession = sessions.get(userId);
  if (existingSession?.socket) {
    console.log(`[FORCE RESET] Found existing session in memory, closing it...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RESET] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(userId);
  }
  
  // Limpar pending connections e tentativas de reconexão
  pendingConnections.delete(userId);
  reconnectAttempts.delete(userId);
  
  // APAGAR arquivos de autenticação (força novo QR Code)
  const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
  await clearAuthFiles(userAuthPath);
  console.log(`[FORCE RESET] Auth files cleared for user ${userId}`);
  
  // Atualizar banco de dados
  const connection = await storage.getConnectionByUserId(userId);
  if (connection) {
    await storage.updateConnection(connection.id, {
      isConnected: false,
      qrCode: null,
    });
  }
  
  console.log(`[FORCE RESET] Complete reset done for user ${userId}. User will need to scan new QR code.`);
}

export async function connectWhatsApp(userId: string): Promise<void> {
  // �️ MODO DESENVOLVIMENTO: Bloquear conexões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n⚠️ [DEV MODE] Conexão WhatsApp bloqueada para user ${userId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   💡 Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
  // �🔒 Verificar se já existe uma conexão em andamento
  const existingPendingConnection = pendingConnections.get(userId);
  if (existingPendingConnection) {
    console.log(`[CONNECT] Connection already in progress for user ${userId}, waiting for it to complete...`);
    return existingPendingConnection;
  }

  // 🔄 Resetar contador de tentativas de reconexão quando usuário inicia conexão manualmente
  // Isso permite novas tentativas após o usuário clicar em "Conectar"
  reconnectAttempts.delete(userId);

  // 🔒 CRÍTICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
  // A promise deve ser registrada ANTES de qualquer código async para garantir
  // que múltiplas chamadas simultâneas retornem a mesma promise
  let resolveConnection: () => void;
  let rejectConnection: (error: Error) => void;
  
  const connectionPromise = new Promise<void>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });
  
  // Registrar ANTES de qualquer operação async
  pendingConnections.set(userId, connectionPromise);
  console.log(`[CONNECT] Registered pending connection for user ${userId}`);

  // Agora executar a lógica de conexão
  (async () => {
    try {
      console.log(`[CONNECT] Starting connection for user ${userId}...`);
      
      // Verificar se já existe uma sessão ativa
      const existingSession = sessions.get(userId);
      if (existingSession?.socket) {
        // Verificar se o socket está realmente conectado
        const isSocketConnected = existingSession.socket.user !== undefined;
        if (isSocketConnected) {
          console.log(`[CONNECT] User ${userId} already has an active connected session, using existing one`);
          return;
        } else {
          // Sessão existe mas não está conectada - limpar e recriar
          console.log(`[CONNECT] User ${userId} has stale session (not connected), cleaning up...`);
          try {
            existingSession.socket.end(undefined);
          } catch (e) {
            console.log(`[CONNECT] Error closing stale socket:`, e);
          }
          sessions.delete(userId);
        }
      }

      let connection = await storage.getConnectionByUserId(userId);
    
    if (!connection) {
      console.log(`[CONNECT] No connection record found, creating new one for ${userId}`);
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    } else {
      console.log(`[CONNECT] Found existing connection record for ${userId}: isConnected=${connection.isConnected}`);
    }

    const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    await ensureDirExists(userAuthPath);
    
    // Check if auth files exist
    try {
      const authFiles = await fs.readdir(userAuthPath);
      console.log(`[CONNECT] Auth files for ${userId}: ${authFiles.length > 0 ? authFiles.join(', ') : 'NONE (will show QR)'}`);
    } catch (e) {
      console.log(`[CONNECT] Auth directory empty or inaccessible for ${userId}, will show QR`);
    }
    
    const { state, saveCreds } = await useMultiFileAuthState(userAuthPath);

    // FIX LID 2025: Cache manual para mapear @lid → phone number
    const contactsCache = new Map<string, Contact>();

    console.log(`[CONNECT] Creating WASocket for ${userId}...`);
    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
    });

    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
      contactsCache,
    };

    sessions.set(userId, session);

    // ======================================================================
    // FIX LID 2025 - CACHE WARMING (Carregar contatos do DB para memória)
    // ======================================================================
    // Previne race condition: mensagens @lid chegam antes de contacts.upsert
    try {
      const dbContacts = await storage.getContactsByConnectionId(connection.id);
      console.log(`[CACHE WARMING] Loading ${dbContacts.length} contacts from DB...`);
      
      for (const dbContact of dbContacts) {
        const contact: Contact = {
          id: dbContact.contactId,
          lid: dbContact.lid || undefined,
          phoneNumber: dbContact.phoneNumber || undefined,
          name: dbContact.name || undefined,
        };
        
        contactsCache.set(dbContact.contactId, contact);
        if (dbContact.lid) {
          contactsCache.set(dbContact.lid, contact);
        }
      }
      
      console.log(`[CACHE WARMING] ✅ Loaded ${dbContacts.length} contacts into memory`);
    } catch (error) {
      console.error(`[CACHE WARMING] ❌ Failed to load contacts:`, error);
    }

    // ======================================================================
    // FIX LID 2025 - SALVAR CONTATOS NO DB SUPABASE (Híbrido: Cache + DB)
    // ======================================================================
    sock.ev.on("contacts.upsert", async (contacts) => {
      console.log(`\n========================================`);
      console.log(`[CONTACTS SYNC] ⚡ Baileys emitiu ${contacts.length} contatos`);
      console.log(`[CONTACTS SYNC] Connection ID: ${connection.id}`);
      console.log(`========================================\n`);
      
      for (const contact of contacts) {
        // 🔍 DEBUG EXTREMO: Mostrar TUDO sobre o contato
        console.log(`\n🔍 [CONTACT DEBUG] Processando contato:`);
        console.log(`   - ID: ${contact.id}`);
        console.log(`   - LID: ${contact.lid || "N/A"}`);
        console.log(`   - phoneNumber: ${contact.phoneNumber || "N/A"}`);
        console.log(`   - name: ${contact.name || "N/A"}`);
        console.log(`   - imgUrl: ${contact.imgUrl ? "Presente" : "N/A"}`);
        console.log(`   - Raw contact object:`, JSON.stringify(contact, null, 2));
        
        // 1. Atualizar cache em memória (performance)
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
          console.log(`   ✅ Adicionado ao cache com LID: ${contact.lid}`);
        }
        
        // 2. Salvar no banco Supabase (persistência)
        try {
          const savedContact = await storage.upsertContact({
            connectionId: connection.id,
            contactId: contact.id,
            lid: contact.lid || null,
            phoneNumber: contact.phoneNumber || null,
            name: contact.name || null,
            imgUrl: contact.imgUrl || null,
          });
          
          console.log(`   ✅ [DB SAVE] Salvo no Supabase com sucesso!`);
          console.log(`   📊 Dados salvos:`, JSON.stringify(savedContact, null, 2));
        } catch (error) {
          console.error(`[DB SAVE] ❌ Failed to save contact ${contact.id}:`, error);
        }
      }
      
      console.log(`[CONTACTS SYNC] ✅ Processed ${contacts.length} contacts (cache + DB)`);
    });

    sock.ev.on("creds.update", saveCreds);

    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect, qr } = update;
      
      console.log(`[CONNECTION UPDATE] User ${userId} - connection: ${conn}, hasQR: ${!!qr}, hasLastDisconnect: ${!!lastDisconnect}`);

      if (qr) {
        console.log(`[QR CODE] Generating QR Code for user ${userId}...`);
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          console.log(`[QR CODE] QR Code generated successfully for user ${userId}, length: ${qrCodeDataURL.length}`);

          // Broadcast immediately so the client sees the QR without waiting
          // for the database write. Persist the QR asynchronously to avoid
          // making the user wait on potentially slow DB operations.
          try {
            broadcastToUser(userId, { type: "qr", qr: qrCodeDataURL });
            console.log(`[QR CODE] QR Code broadcasted to user ${userId}`);
          } catch (bErr) {
            console.error(`[QR CODE ERROR] Failed to broadcast QR code for user ${userId}:`, bErr);
          }

          const saveStart = Date.now();
          storage
            .updateConnection(session.connectionId, { qrCode: qrCodeDataURL })
            .then(() => {
              console.log(`[QR CODE] QR Code saved to database for user ${userId} (took ${Date.now() - saveStart}ms)`);
            })
            .catch((dbErr) => {
              console.error(`[QR CODE ERROR] Failed to save QR code for user ${userId}:`, dbErr);
            });
        } catch (err) {
          console.error(`[QR CODE ERROR] Failed to generate/send QR code for user ${userId}:`, err);
        }
      }

      // Estado "connecting" - quando o QR Code foi escaneado e estÃ¡ conectando
      if (conn === "connecting") {
        console.log(`User ${userId} is connecting...`);
        broadcastToUser(userId, { type: "connecting" });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // Sempre deletar a sessão primeiro
        sessions.delete(userId);
        pendingConnections.delete(userId); // Limpar da lista de pendentes

        // Atualizar banco de dados
        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        // Verificar limite de tentativas de reconexão para evitar loop infinito
        const now = Date.now();
        let attempt = reconnectAttempts.get(userId) || { count: 0, lastAttempt: 0 };
        
        // Se passou mais de 30 segundos desde o último ciclo, resetar contador
        if (now - attempt.lastAttempt > RECONNECT_COOLDOWN_MS) {
          attempt = { count: 0, lastAttempt: now };
        }

        if (shouldReconnect) {
          attempt.count++;
          attempt.lastAttempt = now;
          reconnectAttempts.set(userId, attempt);

          if (attempt.count <= MAX_RECONNECT_ATTEMPTS) {
            console.log(`User ${userId} WhatsApp disconnected temporarily, reconnecting in 5 seconds... (attempt ${attempt.count}/${MAX_RECONNECT_ATTEMPTS})`);
            // Enviar evento disconnected apenas na primeira tentativa para evitar spam
            if (attempt.count === 1) {
              broadcastToUser(userId, { type: "disconnected" });
            }
            setTimeout(() => connectWhatsApp(userId), 5000);
          } else {
            console.log(`User ${userId} WhatsApp disconnected - max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Waiting for user action.`);
            broadcastToUser(userId, { type: "disconnected", reason: "max_attempts" });
            // Resetar contador após atingir o limite (usuário precisará clicar em conectar novamente)
            reconnectAttempts.delete(userId);
            // Limpar QR code do banco para evitar exibição de QR expirado
            await storage.updateConnection(session.connectionId, {
              qrCode: null,
            });
          }
        } else {
          // Foi logout (desconectado pelo celular), limpar TUDO
          console.log(`User ${userId} logged out from device, clearing all auth files...`);
          
          const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
          await clearAuthFiles(userAuthPath);

          broadcastToUser(userId, { type: "disconnected", reason: "logout" });
          
          // Resetar tentativas de reconexão
          reconnectAttempts.delete(userId);

          // NÃO reconectar automaticamente após logout - o usuário deve clicar em "Conectar" novamente
          console.log(`User ${userId} needs to click Connect again to generate new QR code.`);
        }
      } else if (conn === "open") {
        // Conexão estabelecida com sucesso - resetar tentativas de reconexão e limpar pendentes
        reconnectAttempts.delete(userId);
        pendingConnections.delete(userId);
        
        const phoneNumber = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNumber;

        await storage.updateConnection(session.connectionId, {
          isConnected: true,
          phoneNumber,
          qrCode: null,
        });

        broadcastToUser(userId, { type: "connected", phoneNumber });

        // ======================================================================
        // 🛡️ SAFE MODE: Verificar se o cliente está em modo seguro anti-bloqueio
        // ======================================================================
        // Se o admin ativou o Safe Mode para este cliente (pós-bloqueio),
        // executar limpeza completa antes de permitir qualquer envio
        try {
          const currentConnection = await storage.getConnectionByUserId(userId);
          if (currentConnection?.safeModeEnabled) {
            console.log(`🛡️ [SAFE MODE] Cliente ${userId.substring(0, 8)}... está em modo seguro - executando limpeza!`);
            
            const cleanupResult = await executeSafeModeCleanup(userId, session.connectionId);
            
            if (cleanupResult.success) {
              // Notificar o cliente sobre a limpeza
              broadcastToUser(userId, { 
                type: "safe_mode_cleanup",
                messagesCleared: cleanupResult.messagesCleared,
                followupsCleared: cleanupResult.followupsCleared,
              });
            } else {
              console.error(`🛡️ [SAFE MODE] Erro na limpeza:`, cleanupResult.error);
            }
          }
        } catch (safeModeError) {
          console.error(`🛡️ [SAFE MODE] Erro ao verificar modo seguro:`, safeModeError);
        }

        // ======================================================================
        // FIX LID 2025 - WORKAROUND: Contatos serão populados ao receber mensagens
        // ======================================================================
        // Baileys 7.0.0-rc.6 não tem makeInMemoryStore e não emite contacts.upsert
        // em sessões restauradas. Os contatos serão populados quando:
        // 1. Primeira mensagem de cada contato chegar (contacts.upsert dispara)
        // 2. Usuário enviar mensagem (parseRemoteJid salva no DB via fallback)
        
        console.log(`\n⚠️ [CONTACTS INFO] Aguardando contatos do Baileys...`);
        console.log(`   Contatos serão sincronizados automaticamente quando:`);
        console.log(`   1. Evento contacts.upsert do Baileys disparar`);
        console.log(`   2. Mensagens forem recebidas/enviadas`);
        console.log(`   Cache warming carregou ${contactsCache.size} contatos do DB\n`);
        
        // ======================================================================
        // 🔄 VERIFICAÇÃO DE MENSAGENS NÃO RESPONDIDAS (24H)
        // ======================================================================
        // Aguardar 10s para socket estabilizar, depois verificar se há clientes
        // que mandaram mensagem nas últimas 24h e não foram respondidos
        // (resolve problema de mensagens perdidas durante desconexões)
        setTimeout(async () => {
          try {
            await checkUnrespondedMessages(session);
          } catch (error) {
            console.error(`❌ [UNRESPONDED CHECK] Erro ao verificar mensagens:`, error);
          }
        }, 10000); // 10 segundos após conexão
        
        // ======================================================================
        // 🔄 FOLLOW-UP: Reativar follow-ups que estavam aguardando conexão
        // ======================================================================
        // Quando o WhatsApp reconecta, os follow-ups que foram pausados por falta
        // de conexão devem ser reagendados para processar em breve
        // ⚠️ IMPORTANTE: NÃO reativar se Safe Mode está ativo (cliente pós-bloqueio)
        setTimeout(async () => {
          try {
            // Verificar se Safe Mode está ativo - se sim, NÃO reativar follow-ups
            const connCheck = await storage.getConnectionByUserId(userId);
            if (connCheck?.safeModeEnabled) {
              console.log(`🛡️ [SAFE MODE] Pulando reativação de follow-ups - modo seguro ativo`);
              return;
            }
            
            await userFollowUpService.clearConnectionWaitingStatus(session.connectionId);
            console.log(`✅ [FOLLOW-UP] Status de aguardo de conexão limpo para ${userId}`);
          } catch (error) {
            console.error(`❌ [FOLLOW-UP] Erro ao limpar status de aguardo:`, error);
          }
        }, 5000); // 5 segundos após conexão
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // � IMPORTANTE: Ignorar mensagens de sincronização/histórico
      // m.type === "notify" = mensagem NOVA (em tempo real)
      // m.type === "append" = sincronização de histórico (ao abrir conversa)
      // Só processar mensagens novas para evitar pausar IA ao entrar na conversa!
      if (m.type !== "notify") {
        console.log(`📱 [SYNC] Ignorando mensagem de sincronização (type: ${m.type})`);
        return;
      }
      
      // �🔄 NOVA LÓGICA: Capturar mensagens enviadas pelo próprio usuário (fromMe: true)
      if (message.key.fromMe) {
        console.log(`📱 [FROM ME] Mensagem enviada pelo dono no WhatsApp detectada`);
        try {
          await handleOutgoingMessage(session, message);
        } catch (err) {
          console.error("Error handling outgoing message:", err);
        }
        return;
      }
      
      // VerificaÃ§Ã£o extra: ignorar se o remoteJid Ã© o prÃ³prio nÃºmero
      if (message.key.remoteJid && session.phoneNumber) {
        const remoteNumber = cleanContactNumber(message.key.remoteJid);
        const myNumber = cleanContactNumber(session.phoneNumber);
        if (remoteNumber && myNumber && remoteNumber === myNumber) {
          console.log(`Ignoring echo message from own number: ${remoteNumber}`);
          return;
        }
      }

      try {
        await handleIncomingMessage(session, message);
      } catch (err) {
        console.error("Error handling incoming message:", err);
      }
    });

    // Socket inicializado com sucesso - resolver a promise
    // NOTA: A conexão ainda não está "open", apenas o socket foi criado
    // O pendingConnections será limpo quando a conexão abrir (conn === "open")
    // ou quando houver erro de conexão (conn === "close")
    console.log(`[CONNECT] WhatsApp socket initialized for user ${userId}, waiting for connection events...`);
    resolveConnection!();

    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      pendingConnections.delete(userId);
      rejectConnection!(error as Error);
    }
  })();

  // Retornar a promise (já foi registrada no mapa antes de iniciar a async)
  return connectionPromise;
}

// ═══════════════════════════════════════════════════════════════════════
// 📱 NOVA FUNÇÃO: Processar mensagens enviadas pelo DONO no WhatsApp
// ═══════════════════════════════════════════════════════════════════════
// Quando o dono responde direto no WhatsApp (fromMe: true),
// precisamos salvar essa mensagem no sistema para evitar "buracos"
// na conversa quando a IA voltar a responder.
// ═══════════════════════════════════════════════════════════════════════
async function handleOutgoingMessage(session: WhatsAppSession, waMessage: WAMessage) {
  // 🚫 MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`🚫 [DEV MODE] Ignorando mensagem enviada (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;

  // 🚫 FIX BUG DUPLICATA: Ignorar mensagens enviadas pelo agente IA
  // Quando IA envia via socket.sendMessage(), Baileys dispara evento fromMe:true
  // MAS a mensagem já foi salva no createMessage() do setTimeout do agente.
  // Se salvar novamente aqui = DUPLICATA!
  const messageId = waMessage.key.id;
  if (messageId && agentMessageIds.has(messageId)) {
    console.log(`⚠️ [FROM ME] Ignorando mensagem do agente (já salva): ${messageId}`);
    agentMessageIds.delete(messageId); // Limpar após verificar
    return;
  }

  // Filtrar grupos e status
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`📱 [FROM ME] Ignoring group/status message`);
    return;
  }

  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`📱 [FROM ME] Ignoring non-individual message`);
    return;
  }

  // Resolver contactNumber usando mesma lógica do handleIncomingMessage
  let contactNumber: string;
  let normalizedJid: string;

  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    contactNumber = cleanContactNumber(realJid);
    normalizedJid = realJid;
    console.log(`📱 [FROM ME] LID resolvido: ${remoteJid} → ${realJid}`);
  } else {
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    normalizedJid = parsed.normalizedJid;
  }

  if (!contactNumber) {
    console.log(`📱 [FROM ME] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }

  // Extrair texto da mensagem E MÍDIA (incluindo áudio para transcrição)
  const msg = waMessage.message;
  let messageText = "";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;

  if (msg?.conversation) {
    messageText = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    messageText = msg.extendedTextMessage.text;
    
    // 🚫 FIX BUG DUPLICATA: Baileys as vezes envia texto 2x no mesmo campo
    // Exemplo: "Texto\nTexto" (repetido separado por \n)
    // Detectar e remover duplicação
    const lines = messageText.split('\n');
    const halfLength = Math.floor(lines.length / 2);
    if (lines.length > 2 && lines.length % 2 === 0) {
      const firstHalf = lines.slice(0, halfLength).join('\n');
      const secondHalf = lines.slice(halfLength).join('\n');
      if (firstHalf === secondHalf) {
        console.log(`⚠️ [FROM ME] Texto duplicado detectado, usando apenas primeira metade`);
        messageText = firstHalf;
      }
    }
  } else if (msg?.imageMessage?.caption) {
    messageText = msg.imageMessage.caption;
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    // 🖼️ IMAGEM DO DONO: Baixar para exibir no chat
    try {
      console.log(`🖼️ [FROM ME] Baixando imagem do dono com caption...`);
      console.log(`🖼️ [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`🖼️ [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Imagem do dono baixada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.imageMessage) {
    messageText = "[Imagem enviada]";
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    // 🖼️ IMAGEM DO DONO: Baixar para exibir no chat
    try {
      console.log(`🖼️ [FROM ME] Baixando imagem do dono sem caption...`);
      console.log(`🖼️ [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`🖼️ [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Imagem do dono baixada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.videoMessage?.caption) {
    messageText = msg.videoMessage.caption;
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    // 🎥 VÍDEO DO DONO: Baixar para exibir no chat
    try {
      console.log(`🎥 [FROM ME] Baixando vídeo do dono com caption...`);
      console.log(`🎥 [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`🎥 [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`🎥 [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Vídeo do dono baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar vídeo:", error?.message || error);
      console.error("❌ [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.videoMessage) {
    messageText = "[Vídeo enviado]";
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    // 🎥 VÍDEO DO DONO: Baixar para exibir no chat
    try {
      console.log(`🎥 [FROM ME] Baixando vídeo do dono sem caption...`);
      console.log(`🎥 [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`🎥 [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`🎥 [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Vídeo do dono baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar vídeo:", error?.message || error);
      console.error("❌ [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.audioMessage) {
    // 🎤 ÁUDIO DO DONO: Baixar e preparar para transcrição (igual cliente)
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    messageText = "[Áudio enviado]"; // Texto placeholder, será substituído pela transcrição
    
    try {
      console.log(`🎤 [FROM ME] Baixando áudio do dono para transcrição...`);
      console.log(`🎤 [FROM ME] mediaKey presente:`, !!msg.audioMessage.mediaKey);
      console.log(`🎤 [FROM ME] directPath presente:`, !!msg.audioMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Áudio do dono baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar áudio:", error?.message || error);
      mediaUrl = null;
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // 📄 DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - FROM ME
  // ═══════════════════════════════════════════════════════════════════════
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    messageText = docMsg.caption || `📄 ${docMsg.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    // 📄 DOCUMENTO DO DONO (COM CAPTION): Baixar para exibir/download no chat
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono (com caption): ${docMsg.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Documento do dono (com caption) baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento (com caption):", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage?.caption) {
    messageText = msg.documentMessage.caption;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    // 📄 DOCUMENTO DO DONO: Baixar para exibir/download no chat
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono com caption: ${msg.documentMessage.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
      console.log(`✅ [FROM ME] Documento do dono baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage) {
    messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    // 📄 DOCUMENTO DO DONO: Baixar para exibir/download no chat
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono: ${msg.documentMessage.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      console.log(`✅ [FROM ME] Documento do dono baixado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else {
    console.log(`📱 [FROM ME] Unsupported message type, skipping`);
    return;
  }

  // Buscar/criar conversa
  let conversation = await storage.getConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  if (!conversation) {
    console.log(`📱 [FROM ME] Creating new conversation for ${contactNumber}`);
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber,
      remoteJid: normalizedJid,
      jidSuffix: "s.whatsapp.net",
      contactName: contactNumber,
      contactAvatar: null,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: 0,
    });
  }

  // 🔍 VERIFICAÇÃO DE DUPLICATA: Antes de salvar, verificar se a mensagem já existe no banco
  // Isso resolve race conditions onde o agente pode salvar antes ou depois deste handler
  let existingMessage = await storage.getMessageByMessageId(waMessage.key.id!);
  
  // 🔄 RACE CONDITION FIX: Se não existe, esperar 500ms e verificar novamente
  // O agente pode estar salvando a mensagem neste exato momento
  if (!existingMessage) {
    await new Promise(resolve => setTimeout(resolve, 500));
    existingMessage = await storage.getMessageByMessageId(waMessage.key.id!);
  }
  
  if (existingMessage) {
    console.log(`⚠️ [FROM ME] Mensagem já existe no banco (messageId: ${waMessage.key.id}), ignorando duplicata`);
    
    // Se a mensagem existente é do agente, NÃO pausar a IA e sair
    if (existingMessage.isFromAgent) {
      console.log(`✅ [FROM ME] Mensagem é do agente - NÃO pausar IA`);
      return;
    }
    
    // Se não é do agente mas já existe, apenas atualizar conversa e sair (evita duplicata)
    await storage.updateConversation(conversation.id, {
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: 0,
    });
    return;
  }
  
  // Mensagem realmente nova do dono - salvar e processar auto-pause
  try {
    await storage.createMessage({
      conversationId: conversation.id,
      messageId: waMessage.key.id!,
      fromMe: true,
      text: messageText,
      timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
      isFromAgent: false,
      mediaType,
      mediaUrl,        // 🎤 Incluir URL do áudio para transcrição automática
      mediaMimeType,   // 🎤 Tipo MIME do áudio
    });
  } catch (createError: any) {
    // Se erro for de duplicata (constraint unique), verificar se é do agente
    if (createError?.message?.includes('unique') || createError?.code === '23505') {
      console.log(`⚠️ [FROM ME] Erro de duplicata ao salvar - mensagem já existe (messageId: ${waMessage.key.id})`);
      
      // Re-verificar se é do agente
      const recheck = await storage.getMessageByMessageId(waMessage.key.id!);
      if (recheck?.isFromAgent) {
        console.log(`✅ [FROM ME] Confirmado: mensagem é do agente - NÃO pausar IA`);
        return;
      }
    } else {
      console.error(`❌ [FROM ME] Erro ao salvar mensagem:`, createError);
    }
    return;
  }

  // Atualizar conversa
  await storage.updateConversation(conversation.id, {
    lastMessageText: messageText,
    lastMessageTime: new Date(),
    unreadCount: 0, // Mensagens do dono não geram unread
  });

  // 🚀 FOLLOW-UP: Se admin enviou mensagem, agendar follow-up inicial
  try {
    await followUpService.scheduleInitialFollowUp(conversation.id);
  } catch (error) {
    console.error("Erro ao agendar follow-up:", error);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // 🛑 AUTO-PAUSE IA: Quando o dono responde manualmente, PAUSA a IA
  // A IA só volta a responder quando o usuário reativar em /conversas
  // CONFIGURÁVEL: Só pausa se pauseOnManualReply estiver ativado (padrão: true)
  // NOVO: Suporta auto-reativação após timer configurável
  // ═══════════════════════════════════════════════════════════════════════
  try {
    // Verificar configuração do agente para pauseOnManualReply
    const agentConfig = await storage.getAgentConfig(session.userId);
    const shouldPauseOnManualReply = agentConfig?.pauseOnManualReply !== false; // Padrão: true
    const autoReactivateMinutes = (agentConfig as any)?.autoReactivateMinutes ?? null; // NULL = nunca
    
    if (shouldPauseOnManualReply) {
      const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (!isAlreadyDisabled) {
        // Pausar com timer de auto-reativação (se configurado)
        await storage.disableAgentForConversation(conversation.id, autoReactivateMinutes);
        console.log(`🛑 [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversation.id} - dono respondeu manualmente` + 
          (autoReactivateMinutes ? ` (reativa em ${autoReactivateMinutes}min)` : ' (manual only)'));
        
        // Cancelar qualquer resposta pendente do agente para esta conversa
        const pendingResponse = pendingResponses.get(conversation.id);
        if (pendingResponse) {
          clearTimeout(pendingResponse.timeout);
          pendingResponses.delete(conversation.id);
          console.log(`🛑 [AUTO-PAUSE] Resposta pendente do agente cancelada para ${contactNumber}`);
        }
        
        // 🔔 Notificar que a IA foi pausada para esta conversa (APENAS quando realmente pausar)
        broadcastToUser(session.userId, {
          type: "agent_auto_paused",
          conversationId: conversation.id,
          reason: "manual_reply",
          autoReactivateMinutes,
        });
      } else {
        // Já estava pausada, apenas atualizar timestamp do dono (reset timer)
        await storage.updateDisabledConversationOwnerReply(conversation.id);
        console.log(`🔄 [AUTO-PAUSE] Timer resetado para conversa ${conversation.id} - dono respondeu novamente`);
      }
    } else {
      console.log(`✅ [AUTO-PAUSE DESATIVADO] Dono respondeu manualmente mas pauseOnManualReply está desativado - IA continua ativa`);
      
      // Ainda cancelar resposta pendente para evitar duplicação
      const pendingResponse = pendingResponses.get(conversation.id);
      if (pendingResponse) {
        clearTimeout(pendingResponse.timeout);
        pendingResponses.delete(conversation.id);
        console.log(`✅ [AUTO-PAUSE DESATIVADO] Resposta pendente cancelada (dono respondeu primeiro) para ${contactNumber}`);
      }
    }
  } catch (error) {
    console.error("Erro ao verificar pauseOnManualReply:", error);
  }

  // Broadcast para atualizar UI em tempo real
  broadcastToUser(session.userId, {
    type: "new_message",
    conversationId: conversation.id,
    message: messageText,
    mediaType,
  });

  console.log(`📱 [FROM ME] Mensagem sincronizada: ${contactNumber} - "${messageText}"`);
}

async function handleIncomingMessage(session: WhatsAppSession, waMessage: WAMessage) {
  // 🚫 MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`🚫 [DEV MODE] Ignorando mensagem recebida (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;

  // Filtrar grupos e status - aceitar apenas conversas individuais
  // @g.us = grupos, @broadcast = status/listas de transmissão
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`Ignoring group/status message from: ${remoteJid}`);
    return;
  }

  // Aceitar apenas mensagens de números individuais (@s.whatsapp.net ou @lid)
  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`Ignoring non-individual message from: ${remoteJid}`);
    return;
  }

  // ╔═══════════════════════════════════════════════════════════════════════╗
  // ║  🚨 ATENÇÃO: CÓDIGO CRÍTICO - NÃO ALTERAR SEM APROVAÇÃO! 🚨          ║
  // ╠═══════════════════════════════════════════════════════════════════════╣
  // ║  FIX LID 2025 - RESOLUÇÃO DE CONTATOS INSTAGRAM/FACEBOOK             ║
  // ║                                                                       ║
  // ║  PROBLEMA RESOLVIDO:                                                  ║
  // ║  • Contatos do Instagram/Facebook vêm com @lid ao invés de número    ║
  // ║  • Exemplo: "254635809968349@lid" (ID interno do Meta)               ║
  // ║                                                                       ║
  // ║  SOLUÇÃO IMPLEMENTADA (TESTADA E FUNCIONANDO):                        ║
  // ║  • message.key.remoteJidAlt contém o número REAL do WhatsApp         ║
  // ║  • Exemplo: "5517991956944@s.whatsapp.net"                           ║
  // ║                                                                       ║
  // ║  FLUXO CORRETO (MANTER SEMPRE ASSIM):                                 ║
  // ║  1. Extrair número real de remoteJidAlt                              ║
  // ║  2. Usar número real em contactNumber (exibição no CRM)              ║
  // ║  3. Usar número real em normalizedJid (envio de mensagens)           ║
  // ║  4. Salvar mapeamento LID → número no whatsapp_contacts              ║
  // ║                                                                       ║
  // ║  ⚠️  NUNCA MAIS USAR remoteJid DIRETAMENTE PARA @lid!                ║
  // ║  ⚠️  SEMPRE USAR remoteJidAlt COMO FONTE DA VERDADE!                 ║
  // ║                                                                       ║
  // ║  Data: 2025-11-22                                                     ║
  // ║  Testado: ✅ Produção Railway                                         ║
  // ║  Status: ✅ 100% FUNCIONAL                                            ║
  // ╚═══════════════════════════════════════════════════════════════════════╝
  
  console.log(`\n🔍 [MESSAGE KEY DEBUG]`);
  console.log(`   remoteJid: ${remoteJid}`);
  console.log(`   remoteJidAlt: ${(waMessage.key as any).remoteJidAlt || "N/A"}`);
  console.log(`   pushName: ${waMessage.pushName || "N/A"}`);
  console.log(`   participantPn: ${(waMessage.key as any).participantPn || "N/A"}`);
  
  let contactNumber: string;
  let jidSuffix: string;
  let normalizedJid: string;
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🎯 SOLUÇÃO DEFINITIVA: Usar remoteJidAlt (número real para @lid)
  // ═══════════════════════════════════════════════════════════════════════
  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    const realNumber = cleanContactNumber(realJid);
    
    console.log(`\n✅ [LID RESOLVIDO] Número real encontrado via remoteJidAlt!`);
    console.log(`   LID: ${remoteJid}`);
    console.log(`   JID WhatsApp REAL: ${realJid}`);
    console.log(`   Número limpo: ${realNumber}`);
    console.log(`   Nome: ${waMessage.pushName || "N/A"}\n`);
    
    // ⚠️  CRÍTICO: Usar número REAL em todos os lugares, NUNCA o LID!
    contactNumber = realNumber;              // ✅ Para exibição (5517991956944)
    jidSuffix = "s.whatsapp.net";           // ✅ Suffix WhatsApp normal
    normalizedJid = realJid;                // ✅ Para enviar mensagens
    
    // 💾 SALVAR NO DB: Mapeamento LID → número para cache persistente
    // Isso garante que mesmo após restart, o número real será usado
    try {
      await storage.upsertContact({
        connectionId: session.connectionId,
        contactId: remoteJid,    // LID original (254635809968349@lid)
        lid: remoteJid,          // Marcar como LID
        phoneNumber: realJid,    // Número real (5517991956944@s.whatsapp.net)
        name: waMessage.pushName || null,
        imgUrl: null,
      });
      console.log(`💾 [DB] Mapeamento LID → phoneNumber salvo: ${remoteJid} → ${realJid}`);
    } catch (error) {
      console.error("❌ [DB] Erro ao salvar mapeamento LID:", error);
    }
  } else {
    // Fallback: Contatos normais do WhatsApp (@s.whatsapp.net)
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    jidSuffix = parsed.jidSuffix;
    normalizedJid = parsed.normalizedJid;
  }
  // ═══════════════════════════════════════════════════════════════════════
  
  if (!contactNumber) {
    console.log(`[WhatsApp] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }

  // BAILEYS 2025 OFICIAL: jidNormalizedUser() retorna JID limpo sem :device
  console.log(`[WhatsApp] Original JID: ${remoteJid}`);
  console.log(`[WhatsApp] Normalized JID: ${normalizedJid}`);
  console.log(`[WhatsApp] Clean number: ${contactNumber}`);
  
  // Ignorar mensagens do próprio número conectado
  if (session.phoneNumber && contactNumber === session.phoneNumber) {
    console.log(`Ignoring message from own number: ${contactNumber}`);
    return;
  }
  
  // Extract message data including media
  let messageText = "";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;
  let mediaDuration: number | null = null;
  let mediaCaption: string | null = null;

  const msg = waMessage.message;

  // Check for text messages
  if (msg?.conversation) {
    messageText = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    messageText = msg.extendedTextMessage.text;
  }
  // Check for image
  else if (msg?.imageMessage) {
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    mediaCaption = msg.imageMessage.caption || null;
    messageText = mediaCaption || "ðŸ“· Imagem";
    
    try {
      console.log(`🖼️ [CLIENT] Baixando imagem...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`🖼️ [CLIENT] Imagem baixada: ${buffer.length} bytes`);
      // Upload para Supabase Storage ao invés de base64
      mediaUrl = await uploadMediaToStorage(buffer, mediaMimeType, "imagem");
      if (!mediaUrl && buffer.length < 500000) {
        mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      }
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar imagem:", error);
      mediaUrl = null;
    }
  }
  // Check for audio
  else if (msg?.audioMessage) {
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    mediaDuration = msg.audioMessage.seconds || null;
    messageText = "ðŸŽµ Ãudio";
    
    try {
      console.log(`🎵 [CLIENT] Baixando áudio...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`🎵 [CLIENT] Áudio baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaToStorage(buffer, mediaMimeType, "audio");
      if (!mediaUrl && buffer.length < 1000000) {
        mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
      }
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar áudio:", error);
      mediaUrl = null;
    }
  }
  // Check for video
  else if (msg?.videoMessage) {
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    mediaCaption = msg.videoMessage.caption || null;
    mediaDuration = msg.videoMessage.seconds || null;
    messageText = mediaCaption || "ðŸŽ¥ VÃ­deo";
    
    try {
      console.log(`🎥 [CLIENT] Baixando vídeo...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`🎥 [CLIENT] Vídeo baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (vídeos são sempre grandes)
      mediaUrl = await uploadMediaToStorage(buffer, mediaMimeType, "video");
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar vídeo:", error);
      mediaUrl = null;
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // 📄 DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - WRAPPER DO WHATSAPP
  // Documentos com legenda chegam em: msg.documentWithCaptionMessage.message.documentMessage
  // ═══════════════════════════════════════════════════════════════════════
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    mediaCaption = docMsg.caption || null;
    const fileName = docMsg.fileName || "Documento";
    messageText = mediaCaption || `📄 ${fileName}`;
    
    // 📄 DOCUMENTO DO CLIENTE (COM CAPTION): Baixar e upload para Supabase Storage
    try {
      console.log(`📄 [CLIENT] Baixando documento (com caption): ${fileName}...`);
      console.log(`📄 [CLIENT] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`📄 [CLIENT] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`📄 [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaToStorage(buffer, mediaMimeType, fileName);
      console.log(`✅ [CLIENT] Documento (com caption) processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar documento (com caption):", error);
      mediaUrl = null;
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  // 📄 DOCUMENTO SIMPLES (documentMessage) - SEM WRAPPER
  // ═══════════════════════════════════════════════════════════════════════
  else if (msg?.documentMessage) {
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    mediaCaption = msg.documentMessage.caption || null;
    const fileName = msg.documentMessage.fileName || "Documento";
    messageText = mediaCaption || `📄 ${fileName}`;
    
    // 📄 DOCUMENTO DO CLIENTE: Baixar e upload para Supabase Storage
    try {
      console.log(`📄 [CLIENT] Baixando documento: ${fileName}...`);
      console.log(`📄 [CLIENT] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`📄 [CLIENT] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`📄 [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaToStorage(buffer, mediaMimeType, fileName);
      console.log(`✅ [CLIENT] Documento processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("❌ [CLIENT] Erro ao baixar documento:", error);
      mediaUrl = null;
    }
  }
    // Ignorar mensagens de tipos nÃ£o suportados (reaÃ§Ãµes, status, etc)
  else {
    console.log(`Ignoring unsupported message type from ${contactNumber}:`, Object.keys(msg || {}));
    return; // NÃ£o processar mensagens nÃ£o suportadas
  }

  // 🖼️ BUSCAR FOTO DE PERFIL DO CONTATO
  let contactAvatar: string | null = null;
  try {
    if (session.socket) {
      const profilePicUrl = await session.socket.profilePictureUrl(normalizedJid, "image");
      if (profilePicUrl) {
        contactAvatar = profilePicUrl;
        console.log(`🖼️ [AVATAR] Foto de perfil obtida para ${contactNumber}`);
      }
    }
  } catch (error) {
    // Contato sem foto de perfil (normal, não é erro)
    console.log(`ℹ️ [AVATAR] Sem foto de perfil para ${contactNumber}`);
  }

  // EXATAMENTE como no backup - buscar/criar/atualizar com contactNumber
  let conversation = await storage.getConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber, // Número LIMPO para exibir no CRM
      remoteJid: normalizedJid, // JID normalizado para enviar mensagens
      jidSuffix,
      contactName: waMessage.pushName,
      contactAvatar, // 🖼️ Foto de perfil
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: 1,
    });
  } else {
    await storage.updateConversation(conversation.id, {
      remoteJid: normalizedJid, // Atualizar JID (pode mudar)
      jidSuffix,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: (conversation.unreadCount || 0) + 1,
      contactName: waMessage.pushName || conversation.contactName,
      contactAvatar: contactAvatar || conversation.contactAvatar, // Atualizar foto se disponível
    });
  }

  // � FOLLOW-UP USUÁRIOS: Resetar ciclo quando cliente responde
  // O sistema de follow-up para usuários usa a tabela "conversations" (não admin_conversations)
  try {
    await userFollowUpService.resetFollowUpCycle(conversation.id, "Cliente respondeu");
  } catch (error) {
    console.error("Erro ao resetar follow-up do usuário:", error);
  }

    const savedMessage = await storage.createMessage({
      conversationId: conversation.id,
      messageId: waMessage.key.id!,
      fromMe: false,
      text: messageText,
    timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
    isFromAgent: false,
    mediaType,
      mediaUrl,
      mediaMimeType,
      mediaDuration,
      mediaCaption,
    });

    // 🎤 FIX CRÍTICO: savedMessage.text pode conter transcrição de áudio!
    // createMessage() transcreve automaticamente áudios ANTES de retornar.
    // Por isso SEMPRE usamos savedMessage.text (e não messageText original).
    const effectiveText = savedMessage.text || messageText;

    // Se a mensagem de mídia (ex: áudio) tiver sido transcrita ao salvar,
    // garantimos que o último texto da conversa use essa transcrição.
    if (effectiveText !== messageText) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: effectiveText,
        lastMessageTime: new Date(),
      });
    }

    broadcastToUser(session.userId, {
      type: "new_message",
      conversationId: conversation.id,
      message: effectiveText, // ✅ Usar texto transcrito (se for áudio)
      mediaType,
  });

  // 🎯 AI Agent Auto-Response com SISTEMA DE ACUMULAÇÃO DE MENSAGENS
  try {
    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    // 🚫 LISTA DE EXCLUSÃO: Verificar se o número está na lista de exclusão
    const isExcluded = await storage.isNumberExcluded(session.userId, contactNumber);
    if (isExcluded) {
      console.log(`🚫 [AI AGENT] Número ${contactNumber} está na LISTA DE EXCLUSÃO - não responder automaticamente`);
      return;
    }
    
    // ⚠️ CRÍTICO: Verificar se última mensagem foi do cliente (não do agente)
    // Se última mensagem for do agente, NÃO responder (evita loop)
    const recentMessages = await storage.getMessagesByConversationId(conversation.id);
    const lastMessage = recentMessages[recentMessages.length - 1];
    
    if (lastMessage && lastMessage.fromMe) {
      console.log(`⏸️ [AI AGENT] Última mensagem foi do agente, não respondendo (evita loop)`);
      return;
    }
    
    // 📬 AUTO-REATIVAÇÃO: Se IA está pausada, marcar que cliente tem mensagem pendente
    // Isso permite que o sistema de auto-reativação saiba que deve responder
    if (isAgentDisabled) {
      try {
        await storage.markClientPendingMessage(conversation.id);
        console.log(`📬 [AUTO-REATIVATE] Cliente enviou mensagem enquanto IA pausada - marcado como pendente`);
      } catch (err) {
        console.error("Erro ao marcar mensagem pendente:", err);
      }
    }
    
    if (!isAgentDisabled) {
      const userId = session.userId;
      const conversationId = conversation.id;
      const targetNumber = contactNumber;
      const finalText = effectiveText;
      
      // 🎯 SISTEMA DE ACUMULAÇÃO: Buscar delay configurado
      const agentConfig = await storage.getAgentConfig(userId);
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      const responseDelayMs = responseDelaySeconds * 1000;
      
      // Verificar se já existe um timeout pendente para esta conversa
      const existingPending = pendingResponses.get(conversationId);
      
      if (existingPending) {
        // ✅ ACUMULAÇÃO: Nova mensagem chegou - cancelar timeout anterior e acumular
        clearTimeout(existingPending.timeout);
        existingPending.messages.push(finalText);
        console.log(`🔄 [AI AGENT] Mensagem acumulada (${existingPending.messages.length} mensagens) para ${targetNumber}`);
        console.log(`📝 [AI AGENT] Mensagens acumuladas: ${existingPending.messages.map(m => `"${m.substring(0, 30)}..."`).join(' | ')}`);
        
        // Criar novo timeout com as mensagens acumuladas
        existingPending.timeout = setTimeout(async () => {
          await processAccumulatedMessages(existingPending);
        }, responseDelayMs);
        
        console.log(`⏱️ [AI AGENT] Timer reiniciado: ${responseDelaySeconds}s para ${targetNumber}`);
      } else {
        // Nova conversa - criar entrada de acumulação
        console.log(`⏱️ [AI AGENT] Novo timer de ${responseDelaySeconds}s para ${targetNumber}...`);
        console.log(`📝 [AI AGENT] Primeira mensagem: "${finalText}"`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages: [finalText],
          conversationId,
          userId,
          contactNumber: targetNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now(),
        };
        
        pending.timeout = setTimeout(async () => {
          await processAccumulatedMessages(pending);
        }, responseDelayMs);
        
        pendingResponses.set(conversationId, pending);
      }
    }
  } catch (error) {
    console.error("Error scheduling AI response:", error);
  }
}

// 🎯 FUNÇÃO PARA PROCESSAR MENSAGENS ACUMULADAS
async function processAccumulatedMessages(pending: PendingResponse): Promise<void> {
  const { conversationId, userId, contactNumber, jidSuffix, messages } = pending;
  
  // 🔒 ANTI-DUPLICAÇÃO: Verificar se já está processando esta conversa
  if (conversationsBeingProcessed.has(conversationId)) {
    console.log(`🔒 [AI AGENT] ⚠️ Conversa ${conversationId} já está sendo processada, IGNORANDO duplicata`);
    return;
  }
  
  // 🔒 Marcar como em processamento ANTES de qualquer coisa
  conversationsBeingProcessed.add(conversationId);
  
  // Remover da fila de pendentes
  pendingResponses.delete(conversationId);
  
  const totalWaitTime = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\n🤖 [AI AGENT] =========== PROCESSANDO RESPOSTA ===========`);
  console.log(`   📊 Aguardou ${totalWaitTime}s | ${messages.length} mensagem(s) acumulada(s)`);
  console.log(`   📱 Contato: ${contactNumber}`);
  
  try {
    const currentSession = sessions.get(userId);
    if (!currentSession?.socket) {
      console.log(`[AI Agent] Session not available for user ${userId}, skipping response`);
      return;
    }
    
    // 🔒 CHECK DE LIMITE DE MENSAGENS PARA USUÁRIOS SEM PLANO PAGO
    const FREE_TRIAL_LIMIT = 25;
    const connection = await storage.getConnectionByUserId(userId);
    if (connection) {
      const subscription = await storage.getUserSubscription(userId);
      // Apenas status 'active' (plano pago) é ilimitado
      const hasActiveSubscription = subscription?.status === 'active';
      
      if (!hasActiveSubscription) {
        const agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
        
        if (agentMessagesCount >= FREE_TRIAL_LIMIT) {
          console.log(`🚫 [AI AGENT] Limite de ${FREE_TRIAL_LIMIT} mensagens atingido (${agentMessagesCount}/${FREE_TRIAL_LIMIT}). Usuário precisa assinar plano.`);
          // Não enviar resposta - limite atingido
          return;
        }
        
        console.log(`📊 [AI AGENT] Uso: ${agentMessagesCount + 1}/${FREE_TRIAL_LIMIT} mensagens`);
      } else {
        console.log(`✅ [AI AGENT] Usuário tem plano pago ativo: ${subscription.plan?.nome || 'Plano'}`);
      }
    }
    
    // Combinar todas as mensagens acumuladas
    const combinedText = messages.join('\n\n');
    console.log(`   📝 Texto combinado: "${combinedText.substring(0, 150)}..."`);

    // 📜 BUSCAR HISTÓRICO DE CONVERSAS
    let conversationHistory = await storage.getMessagesByConversationId(conversationId);
    
    // 👤 BUSCAR NOME DO CLIENTE DA CONVERSA
    const conversation = await storage.getConversation(conversationId);
    const contactName = conversation?.contactName || undefined;
    console.log(`👤 [AI AGENT] Nome do cliente: ${contactName || 'Não identificado'}`);
    
    // 📁 BUSCAR MÍDIAS JÁ ENVIADAS NESTA CONVERSA (para evitar repetição)
    const sentMedias: string[] = [];
    for (const msg of conversationHistory) {
      if (msg.fromMe && msg.isFromAgent) {
        // Método 1: Detectar tags de mídia no texto das mensagens
        if (msg.text) {
          const mediaMatches = msg.text.match(/\[MEDIA:([A-Z0-9_]+)\]/gi);
          if (mediaMatches) {
            for (const match of mediaMatches) {
              const mediaName = match.replace(/\[MEDIA:|]/gi, '').toUpperCase();
              if (!sentMedias.includes(mediaName)) {
                sentMedias.push(mediaName);
              }
            }
          }
        }
        
        // Método 2: Detectar tags no campo mediaCaption (novo formato)
        if (msg.mediaCaption) {
          const captionMatches = msg.mediaCaption.match(/\[MEDIA:([A-Z0-9_]+)\]/gi);
          if (captionMatches) {
            for (const match of captionMatches) {
              const mediaName = match.replace(/\[MEDIA:|]/gi, '').toUpperCase();
              if (!sentMedias.includes(mediaName)) {
                sentMedias.push(mediaName);
              }
            }
          }
        }
      }
    }
    console.log(`📁 [AI AGENT] Mídias já enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // Verificar se modo histórico está ativo
    const agentConfig = await storage.getAgentConfig(userId);
    
    if (agentConfig?.fetchHistoryOnFirstResponse) {
      console.log(`📜 [AI AGENT] Modo histórico ATIVO - ${conversationHistory.length} mensagens disponíveis para contexto`);
      
      if (conversationHistory.length > 40) {
        console.log(`📜 [AI AGENT] Histórico grande - será usado sistema de resumo inteligente`);
      }
    }

    const aiResult = await generateAIResponse(
      userId,
      conversationHistory,
      combinedText, // ✅ Todas as mensagens combinadas
      {
        contactName, // ✅ Nome do cliente para personalização
        contactPhone: contactNumber, // ✅ Telefone do cliente para agendamento
        sentMedias,  // ✅ Mídias já enviadas para evitar repetição
      }
    );

    // 📁 Extrair texto e ações de mídia da resposta
    const aiResponse = aiResult?.text || null;
    const mediaActions = aiResult?.mediaActions || [];

    // 🔔 NOTIFICATION SYSTEM UNIVERSAL (AI + Manual + Resposta do Agente)
    const businessConfig = await storage.getBusinessAgentConfig(userId);
    let shouldNotify = false;
    let notifyReason = "";
    let keywordSource = ""; // Para tracking de onde veio o gatilho
    
    // Check AI notification (tag [NOTIFY:] na resposta)
    if (aiResult?.notification?.shouldNotify) {
      shouldNotify = true;
      notifyReason = aiResult.notification.reason;
      keywordSource = "IA";
      console.log(`🔔 [AI Agent] AI detected notification trigger: ${notifyReason}`);
    }
    
    // Check Manual keyword notification (if mode is "manual" or "both")
    if (businessConfig?.notificationEnabled && 
        businessConfig?.notificationManualKeywords &&
        (businessConfig.notificationMode === "manual" || businessConfig.notificationMode === "both")) {
      
      const keywords = businessConfig.notificationManualKeywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      
      // 🆕 VERIFICAR TANTO NA MENSAGEM DO CLIENTE QUANTO NA RESPOSTA DO AGENTE
      const clientMessage = combinedText.toLowerCase();
      const agentMessage = (aiResponse || "").toLowerCase();
      
      for (const keyword of keywords) {
        // Verificar na mensagem do cliente
        if (clientMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "cliente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (cliente)` : "Manual (cliente)";
          console.log(`🔔 [AI Agent] Manual keyword in CLIENT message: "${keyword}"`);
          break;
        }
        
        // 🆕 Verificar na resposta do agente (NOVO!)
        if (agentMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "agente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (agente)` : "Manual (agente)";
          console.log(`🔔 [AI Agent] Manual keyword in AGENT response: "${keyword}"`);
          break;
        }
      }
    }
    
    // Log completo da detecção
    if (shouldNotify) {
      console.log(`🔔 [AI Agent] NOTIFICATION TRIGGERED via: ${keywordSource}`);
    }
    
    // Send notification if triggered
    if (shouldNotify && businessConfig?.notificationPhoneNumber) {
      const notifyNumber = businessConfig.notificationPhoneNumber.replace(/\D/g, '');
      const notifyJid = `${notifyNumber}@s.whatsapp.net`;
      
      // 🆕 Mensagem de notificação melhorada com contexto
      const notifyMessage = `🔔 *NOTIFICAÇÃO DO AGENTE*\n\n` +
        `📋 *Motivo:* ${notifyReason}\n` +
        `📱 *Fonte:* ${keywordSource}\n\n` +
        `👤 *Cliente:* ${contactNumber}\n` +
        `💬 *Mensagem do cliente:* "${combinedText.substring(0, 200)}${combinedText.length > 200 ? '...' : ''}"\n` +
        (aiResponse ? `🤖 *Resposta do agente:* "${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}"` : '');
      
      try {
        await currentSession.socket.sendMessage(notifyJid, { text: notifyMessage });
        console.log(`🔔 [AI Agent] Notification sent to ${notifyNumber}`);
      } catch (error) {
        console.error(`❌ [AI Agent] Failed to send notification to ${notifyNumber}:`, error);
      }
    }

    console.log(`🔍 [AI Agent] generateAIResponse retornou: ${aiResponse ? `"${aiResponse.substring(0, 100)}..."` : 'NULL'}`);
    if (mediaActions.length > 0) {
      console.log(`📁 [AI Agent] ${mediaActions.length} ações de mídia: ${mediaActions.map(a => a.media_name).join(', ')}`);
    }

    if (aiResponse) {
      // Buscar remoteJid original do banco
      const conversationData = await storage.getConversation(conversationId);
      const jid = conversationData
        ? buildSendJid(conversationData)
        : `${contactNumber}@${jidSuffix || DEFAULT_JID_SUFFIX}`;
      
      // 🔒 ANTI-DUPLICAÇÃO: Verificar se resposta já foi enviada recentemente
      if (isRecentDuplicate(conversationId, aiResponse)) {
        console.log(`🔒 [AI AGENT] ⚠️ Resposta IDÊNTICA já enviada nos últimos 2 minutos, IGNORANDO duplicata`);
        console.log(`   📝 Texto: "${aiResponse.substring(0, 100)}..."`);
        return;
      }
      
      // 🔒 Registrar resposta no cache anti-duplicação
      registerSentMessageCache(conversationId, aiResponse);
      
      // 🤖 HUMANIZAÇÃO: Quebrar mensagens longas em múltiplas
      const agentConfig = await storage.getAgentConfig(userId);
      const maxChars = agentConfig?.messageSplitChars ?? 400;
      const messageParts = splitMessageHumanLike(aiResponse, maxChars);
      
      console.log(`[AI Agent] Sending to original JID: ${jid} (${messageParts.length} parts)`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const isLast = i === messageParts.length - 1;
        
        // 🛡️ ANTI-BLOQUEIO: Usar fila de mensagens para garantir delay entre envios
        // Cada WhatsApp tem sua própria fila - múltiplos usuários podem enviar ao mesmo tempo
        // ✅ Texto enviado EXATAMENTE como gerado pela IA (variação REMOVIDA do sistema)
        const queueResult = await messageQueueService.enqueue(userId, jid, part, {
          isFromAgent: true,
          priority: 'high', // Respostas da IA = prioridade alta
        });

        const messageId = queueResult.messageId || `${Date.now()}-${i}`;

        await storage.createMessage({
          conversationId: conversationId,
          messageId,
          fromMe: true,
          text: part, // ✅ Texto original sem variação
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });

        // Só atualizar conversa na última parte
        if (isLast) {
          await storage.updateConversation(conversationId, {
            lastMessageText: finalPart,
            lastMessageTime: new Date(),
          });

          broadcastToUser(userId, {
            type: "agent_response",
            conversationId: conversationId,
            message: aiResponse,
          });
        }

        console.log(`[AI Agent] Part ${i+1}/${messageParts.length} SENT to WhatsApp ${contactNumber}`);
      }
      
      // 📁 EXECUTAR AÇÕES DE MÍDIA (enviar áudios, imagens, vídeos)
      if (mediaActions.length > 0) {
        console.log(`📁 [AI Agent] Executando ${mediaActions.length} ações de mídia...`);
        
        const conversationDataForMedia = await storage.getConversation(conversationId);
        const mediaJid = conversationDataForMedia
          ? buildSendJid(conversationDataForMedia)
          : jid;
        
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        await executeMediaActions({
          userId,
          jid: mediaJid,
          conversationId, // Passar conversationId para salvar mensagens de mídia
          actions: mediaActions,
          socket: currentSession.socket,
        });
        
        console.log(`📁 [AI Agent] Mídias enviadas com sucesso!`);
      }

      // 🚀 FOLLOW-UP: Se agente enviou mensagem, agendar follow-up inicial
      try {
        await followUpService.scheduleInitialFollowUp(conversationId);
      } catch (error) {
        console.error("Erro ao agendar follow-up:", error);
      }
    } else {
      console.log(`[AI Agent] No response generated (trigger phrase check or agent inactive)`);
    }
  } catch (error) {
    console.error("Error generating AI response:", error);
  } finally {
    // 🔒 ANTI-DUPLICAÇÃO: Remover da lista de conversas em processamento
    conversationsBeingProcessed.delete(conversationId);
    console.log(`🔓 [AI AGENT] Conversa ${conversationId} liberada para próximo processamento`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 TRIGGER RESPONSE ON AI RE-ENABLE
// ═══════════════════════════════════════════════════════════════════════════
// Quando o usuário reativa a IA para uma conversa, verificamos se há mensagens
// pendentes do cliente que ainda não foram respondidas e disparamos a resposta.
// 
// Parâmetro forceRespond: Quando true (chamado pelo botão "Responder com IA"),
// ignora a verificação de "última mensagem é do dono" e responde mesmo assim.
// ═══════════════════════════════════════════════════════════════════════════
export async function triggerAgentResponseForConversation(
  userId: string,
  conversationId: string,
  forceRespond: boolean = false
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n🔄 [TRIGGER] Verificando mensagens para conversa ${conversationId}... (force: ${forceRespond})`);
  
  try {
    // 1. Buscar a sessão do usuário
    const session = sessions.get(userId);
    if (!session?.socket) {
      // Verificar se estamos em modo dev sem WhatsApp
      const skipRestore = process.env.SKIP_WHATSAPP_RESTORE === 'true';
      console.log(`⚠️ [TRIGGER] Sessão WhatsApp não disponível para usuário ${userId} (SKIP_WHATSAPP_RESTORE: ${skipRestore})`);
      
      if (skipRestore) {
        return { triggered: false, reason: "Modo desenvolvimento: WhatsApp não conectado localmente. Em produção, a sessão será restaurada automaticamente." };
      }
      return { triggered: false, reason: "WhatsApp não conectado. Verifique a conexão em 'Conexão'." };
    }
    
    // 2. Verificar se o agente está ativo globalmente
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) {
      console.log(`⚠️ [TRIGGER] Agente globalmente inativo para usuário ${userId}`);
      return { triggered: false, reason: "Ative o agente em 'Meu Agente IA' primeiro." };
    }
    
    // 3. Buscar dados da conversa
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.log(`⚠️ [TRIGGER] Conversa ${conversationId} não encontrada`);
      return { triggered: false, reason: "Conversa não encontrada." };
    }
    
    // 4. Buscar mensagens da conversa
    const messages = await storage.getMessagesByConversationId(conversationId);
    if (messages.length === 0) {
      console.log(`ℹ️ [TRIGGER] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa para responder." };
    }
    
    // 5. Verificar última mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se última mensagem é do agente/dono, só responder se forceRespond=true
    if (lastMessage.fromMe && !forceRespond) {
      console.log(`ℹ️ [TRIGGER] Última mensagem é do agente/dono - não precisa responder`);
      return { triggered: false, reason: "Última mensagem já foi respondida." };
    }
    
    // Se forceRespond mas última é do agente, precisamos de contexto anterior
    let messagesToProcess: string[] = [];
    
    if (lastMessage.fromMe && forceRespond) {
      // Forçar resposta: usar últimas mensagens do cliente como contexto
      console.log(`🔄 [TRIGGER] Forçando resposta - buscando contexto anterior...`);
      
      // Buscar últimas mensagens do cliente (não do agente)
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg.fromMe && msg.text) {
          messagesToProcess.unshift(msg.text);
          if (messagesToProcess.length >= 3) break; // Últimas 3 mensagens do cliente
        }
      }
      
      if (messagesToProcess.length === 0) {
        return { triggered: false, reason: "Não há mensagens do cliente para processar." };
      }
    } else {
      // Comportamento normal: coletar mensagens não respondidas do cliente
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (msg.fromMe) break; // Parar quando encontrar mensagem do agente/dono
        if (msg.text) {
          messagesToProcess.unshift(msg.text);
        }
      }
      
      if (messagesToProcess.length === 0) {
        messagesToProcess.push('[mensagem recebida]');
      }
    }
    
    // 6. Verificar se já tem resposta pendente
    if (pendingResponses.has(conversationId)) {
      console.log(`⏳ [TRIGGER] Já existe resposta pendente para esta conversa`);
      return { triggered: false, reason: "Resposta já em processamento. Aguarde." };
    }
    
    console.log(`📨 [TRIGGER] ${messagesToProcess.length} mensagem(s) para processar`);
    console.log(`   👤 Cliente: ${conversation.contactNumber}`);
    
    // 7. Criar resposta pendente com delay mínimo (1s quando forçado, senão 3s)
    const responseDelaySeconds = forceRespond ? 1 : Math.max(agentConfig?.responseDelaySeconds ?? 3, 3);
    
    const pending: PendingResponse = {
      timeout: null as any,
      messages: messagesToProcess,
      conversationId,
      userId,
      contactNumber: conversation.contactNumber,
      jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
      startTime: Date.now(),
    };
    
    pending.timeout = setTimeout(async () => {
      console.log(`🚀 [TRIGGER] Processando resposta para ${conversation.contactNumber}`);
      await processAccumulatedMessages(pending);
    }, responseDelaySeconds * 1000);
    
    pendingResponses.set(conversationId, pending);
    
    console.log(`✅ [TRIGGER] Resposta agendada em ${responseDelaySeconds}s`);
    
    return { triggered: true, reason: `Resposta da IA agendada! Processando ${messagesToProcess.length} mensagem(s)...` };
    
  } catch (error) {
    console.error(`❌ [TRIGGER] Erro:`, error);
    return { triggered: false, reason: "Erro ao processar. Tente novamente." };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔄 TRIGGER RESPONSE ON ADMIN AI RE-ENABLE
// ═══════════════════════════════════════════════════════════════════════════
// Para conversas do ADMIN (sistema de vendas AgenteZap) - quando a IA é 
// reativada, verifica se há mensagens do cliente sem resposta e dispara.
// ═══════════════════════════════════════════════════════════════════════════
export async function triggerAdminAgentResponseForConversation(
  conversationId: string
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n🔄 [ADMIN TRIGGER ON ENABLE] Verificando mensagens pendentes para conversa admin ${conversationId}...`);
  
  try {
    // 1. Buscar dados da conversa admin
    const conversation = await storage.getAdminConversation(conversationId);
    if (!conversation) {
      console.log(`⚠️ [ADMIN TRIGGER ON ENABLE] Conversa ${conversationId} não encontrada`);
      return { triggered: false, reason: "Conversa não encontrada" };
    }
    
    // 2. Verificar se há sessão admin ativa
    const adminSession = adminSessions.values().next().value;
    if (!adminSession?.socket) {
      console.log(`⚠️ [ADMIN TRIGGER ON ENABLE] Sessão admin WhatsApp não disponível`);
      return { triggered: false, reason: "WhatsApp admin não conectado" };
    }
    
    // 3. Buscar mensagens da conversa admin
    const messages = await storage.getAdminMessages(conversationId);
    if (messages.length === 0) {
      console.log(`ℹ️ [ADMIN TRIGGER ON ENABLE] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa" };
    }
    
    // 4. Verificar última mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se última mensagem é do admin/agente (fromMe = true), não precisa responder
    if (lastMessage.fromMe) {
      console.log(`ℹ️ [ADMIN TRIGGER ON ENABLE] Última mensagem é do agente - não precisa responder`);
      return { triggered: false, reason: "Última mensagem já foi respondida" };
    }
    
    // 5. Verificar se já tem resposta pendente
    const contactNumber = conversation.contactNumber;
    if (pendingAdminResponses.has(contactNumber)) {
      console.log(`⏳ [ADMIN TRIGGER ON ENABLE] Já existe resposta pendente para este contato`);
      return { triggered: false, reason: "Resposta já em processamento" };
    }
    
    console.log(`📨 [ADMIN TRIGGER ON ENABLE] Mensagem do cliente sem resposta encontrada!`);
    console.log(`   👤 Cliente: ${contactNumber}`);
    console.log(`   💬 Última mensagem: "${(lastMessage.text || '[mídia]').substring(0, 50)}..."`);
    console.log(`   🕐 Enviada em: ${lastMessage.timestamp}`);
    
    // 6. Coletar todas as mensagens do cliente desde a última do agente
    const clientMessagesBuffer: string[] = [];
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.fromMe) break;
      if (msg.text) {
        clientMessagesBuffer.unshift(msg.text);
      }
    }
    
    if (clientMessagesBuffer.length === 0) {
      clientMessagesBuffer.push('[mensagem recebida]');
    }
    
    console.log(`📝 [ADMIN TRIGGER ON ENABLE] ${clientMessagesBuffer.length} mensagem(s) do cliente para processar`);
    
    // 7. Agendar resposta usando o sistema de acumulação existente
    const config = await getAdminAgentRuntimeConfig();
    const responseDelayMs = Math.max(config.responseDelayMs, 3000); // Mínimo 3 segundos
    
    const pending: PendingAdminResponse = {
      timeout: null,
      messages: clientMessagesBuffer,
      remoteJid: conversation.remoteJid || `${contactNumber}@s.whatsapp.net`,
      contactNumber,
      generation: 1,
      startTime: Date.now(),
      conversationId,
    };
    
    pending.timeout = setTimeout(() => {
      console.log(`🚀 [ADMIN TRIGGER ON ENABLE] Processando resposta para ${contactNumber}`);
      void processAdminAccumulatedMessages({ socket: adminSession.socket!, key: contactNumber, generation: 1 });
    }, responseDelayMs);
    
    pendingAdminResponses.set(contactNumber, pending);
    
    console.log(`✅ [ADMIN TRIGGER ON ENABLE] Resposta agendada em ${responseDelayMs/1000}s para ${contactNumber}`);
    
    return { triggered: true, reason: `Resposta agendada para ${clientMessagesBuffer.length} mensagem(s) pendente(s)` };
    
  } catch (error) {
    console.error(`❌ [ADMIN TRIGGER ON ENABLE] Erro:`, error);
    return { triggered: false, reason: "Erro ao processar" };
  }
}

export async function sendMessage(
  userId: string, 
  conversationId: string, 
  text: string,
  options?: { isFromAgent?: boolean }
): Promise<void> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp not connected");
  }

  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Verify ownership
  const connection = await storage.getConnectionByUserId(userId);
  if (!connection || conversation.connectionId !== connection.id) {
    throw new Error("Unauthorized access to conversation");
  }

  // 🔒 ANTI-DUPLICAÇÃO: Verificar se mensagem já foi enviada recentemente (para follow-up)
  if (options?.isFromAgent) {
    if (isRecentDuplicate(conversationId, text)) {
      console.log(`🔒 [sendMessage] ⚠️ Mensagem IDÊNTICA já enviada recentemente, IGNORANDO duplicata`);
      console.log(`   📝 Texto: "${text.substring(0, 80)}..."`);
      return; // Silenciosamente ignorar duplicata
    }
    // Registrar mensagem no cache
    registerSentMessageCache(conversationId, text);
  }

  // Usar remoteJid normalizado do banco (suporta @lid, @s.whatsapp.net, etc)
  const jid = buildSendJid(conversation);
  
  console.log(`[sendMessage] Sending to: ${jid}${options?.isFromAgent ? ' (from agent/follow-up)' : ''}`);
  
  // 🛡️ ANTI-BLOQUEIO: Usar fila de mensagens para garantir delay entre envios
  // Cada WhatsApp tem sua própria fila - múltiplos usuários podem enviar ao mesmo tempo
  // ✅ Texto enviado EXATAMENTE como recebido (variação REMOVIDA do sistema)
  const queueResult = await messageQueueService.enqueue(userId, jid, text, {
    isFromAgent: options?.isFromAgent,
    priority: options?.isFromAgent ? 'normal' : 'high', // Mensagens manuais do dono = prioridade alta
  });

  const messageId = queueResult.messageId || Date.now().toString();

  await storage.createMessage({
    conversationId,
    messageId,
    fromMe: true,
    text: text, // ✅ Texto original sem variação
    timestamp: new Date(),
    status: "sent",
    // 🔧 FIX: Marcar mensagens de follow-up como isFromAgent para que a IA
    // saiba que foi ela quem enviou quando retomar a conversa
    isFromAgent: options?.isFromAgent ?? false,
  });

  // 🚀 FOLLOW-UP ADMIN: Continua usando sistema antigo para admin_conversations
  try {
    await followUpService.scheduleInitialFollowUp(conversationId);
  } catch (error) {
    console.error("Erro ao agendar follow-up admin:", error);
  }

  // 🚀 FOLLOW-UP USUÁRIOS: Ativar follow-up para conversas de usuários
  try {
    await userFollowUpService.enableFollowUp(conversationId);
  } catch (error) {
    console.error("Erro ao ativar follow-up do usuário:", error);
  }

  // 🔧 FIX: Quando o dono envia mensagem, resetar unreadCount para 0
  await storage.updateConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: new Date(),
    unreadCount: 0,
  });

  broadcastToUser(userId, {
    type: "message_sent",
    conversationId,
    message: text,
  });
}

export async function sendAdminConversationMessage(adminId: string, conversationId: string, text: string): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Resolver JID para envio (preferir número real)
  let jid = conversation.remoteJid;
  
  // Se for LID, tentar resolver para número real
  if (jid && jid.includes("@lid")) {
    // 1. Tentar cache
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else {
      // 2. Tentar construir do contactNumber se disponível
      if (conversation.contactNumber) {
         jid = `${conversation.contactNumber}@s.whatsapp.net`;
      }
    }
  }
  
  // Fallback se não tiver remoteJid mas tiver contactNumber
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendAdminConversationMessage] Sending to: ${jid} (Original: ${conversation.remoteJid})`);
  const sentMessage = await session.socket.sendMessage(jid, { text });

  // Salvar mensagem
  await storage.createAdminMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text,
    timestamp: new Date(),
    status: "sent",
    isFromAgent: false,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: new Date(),
  });
}

export async function sendAdminDirectMessage(adminId: string, phoneNumber: string, text: string): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  // Clean phone number
  const cleanPhone = phoneNumber.replace(/\D/g, '');
  const jid = `${cleanPhone}@s.whatsapp.net`;
  
  console.log(`[sendAdminDirectMessage] Sending to: ${jid}`);
  
  await session.socket.sendMessage(jid, { text });
}

// ==================== ADMIN MEDIA MESSAGE ====================

interface AdminMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean; // push to talk (voice note)
  seconds?: number;
}

export async function sendAdminMediaMessage(
  adminId: string, 
  conversationId: string, 
  media: AdminMediaPayload
): Promise<void> {
  const session = adminSessions.get(adminId);
  if (!session?.socket) {
    throw new Error("Admin WhatsApp not connected");
  }

  const conversation = await storage.getAdminConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Resolver JID
  let jid = conversation.remoteJid;
  
  if (jid && jid.includes("@lid")) {
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else if (conversation.contactNumber) {
      jid = `${conversation.contactNumber}@s.whatsapp.net`;
    }
  }
  
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendAdminMediaMessage] Sending ${media.type} to: ${jid}`);

  // Converter base64 para buffer se necessário
  let mediaBuffer: Buffer;
  if (media.data.startsWith('data:')) {
    const base64Data = media.data.split(',')[1];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    mediaBuffer = Buffer.from(media.data, 'base64');
  }

  let messageContent: any;
  let mediaTypeForStorage = media.type;

  switch (media.type) {
    case 'audio':
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype || 'audio/ogg; codecs=opus',
        ptt: media.ptt !== false, // Default to true for voice notes
        seconds: media.seconds,
      };
      break;
      
    case 'image':
      messageContent = {
        image: mediaBuffer,
        mimetype: media.mimetype || 'image/jpeg',
        caption: media.caption,
      };
      break;
      
    case 'video':
      messageContent = {
        video: mediaBuffer,
        mimetype: media.mimetype || 'video/mp4',
        caption: media.caption,
      };
      break;
      
    case 'document':
      messageContent = {
        document: mediaBuffer,
        mimetype: media.mimetype || 'application/pdf',
        fileName: media.filename || 'document',
        caption: media.caption,
      };
      break;
      
    default:
      throw new Error(`Unsupported media type: ${media.type}`);
  }

  const sentMessage = await session.socket.sendMessage(jid, messageContent);

  // Salvar mensagem no banco
  await storage.createAdminMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)} enviado]`,
    timestamp: new Date(),
    status: "sent",
    isFromAgent: false,
    mediaType: mediaTypeForStorage,
    mediaUrl: media.data, // Guardar base64 para exibição
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateAdminConversation(conversationId, {
    lastMessageText: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`,
    lastMessageTime: new Date(),
  });
}

// ==================== USER MEDIA SEND (SaaS Users) ====================

export interface UserMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean; // push to talk (voice note)
  seconds?: number;
}

export async function sendUserMediaMessage(
  userId: string, 
  conversationId: string, 
  media: UserMediaPayload
): Promise<void> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp not connected");
  }

  const conversation = await storage.getConversation(conversationId);
  if (!conversation) {
    throw new Error("Conversation not found");
  }

  // Resolver JID
  let jid = conversation.remoteJid;
  
  if (jid && jid.includes("@lid")) {
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else if (conversation.contactNumber) {
      jid = `${conversation.contactNumber}@s.whatsapp.net`;
    }
  }
  
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendUserMediaMessage] Sending ${media.type} to: ${jid}`);

  // Converter base64 para buffer se necessário
  let mediaBuffer: Buffer;
  if (media.data.startsWith('data:')) {
    const base64Data = media.data.split(',')[1];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    mediaBuffer = Buffer.from(media.data, 'base64');
  }

  console.log(`[sendUserMediaMessage] 📦 Buffer size: ${mediaBuffer.length} bytes, mimetype: ${media.mimetype}`);

  let messageContent: any;
  let mediaTypeForStorage = media.type;

  switch (media.type) {
    case 'audio':
      // Para áudio PTT (nota de voz), usar o mimetype fornecido
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype || 'audio/ogg; codecs=opus',
        ptt: media.ptt !== false, // Default to true for voice notes
        seconds: media.seconds,
      };
      console.log(`[sendUserMediaMessage] 🎤 Audio prepared:`, {
        size: mediaBuffer.length,
        mimetype: messageContent.mimetype,
        ptt: messageContent.ptt,
        seconds: messageContent.seconds
      });
      break;
      
    case 'image':
      messageContent = {
        image: mediaBuffer,
        mimetype: media.mimetype || 'image/jpeg',
        caption: media.caption,
      };
      break;
      
    case 'video':
      messageContent = {
        video: mediaBuffer,
        mimetype: media.mimetype || 'video/mp4',
        caption: media.caption,
      };
      break;
      
    case 'document':
      messageContent = {
        document: mediaBuffer,
        mimetype: media.mimetype || 'application/pdf',
        fileName: media.filename || 'document',
        caption: media.caption,
      };
      break;
      
    default:
      throw new Error(`Unsupported media type: ${media.type}`);
  }

  console.log(`[sendUserMediaMessage] 📤 Sending to WhatsApp...`);
  const sentMessage = await session.socket.sendMessage(jid, messageContent);
  console.log(`[sendUserMediaMessage] ✅ Message sent! ID: ${sentMessage?.key?.id}`);

  // Salvar mensagem no banco
  await storage.createMessage({
    conversationId,
    messageId: sentMessage?.key?.id || Date.now().toString(),
    fromMe: true,
    text: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)} enviado]`,
    timestamp: new Date(),
    status: "sent",
    isFromAgent: false,
    mediaType: mediaTypeForStorage,
    mediaUrl: media.data, // Guardar base64 para exibição
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateConversation(conversationId, {
    lastMessageText: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`,
    lastMessageTime: new Date(),
  });

  // 🛑 AUTO-PAUSE IA: Quando o dono envia mídia pelo sistema, PAUSA a IA
  try {
    const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
    if (!isAlreadyDisabled) {
      await storage.disableAgentForConversation(conversationId);
      console.log(`🛑 [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou mídia pelo sistema`);
    }
  } catch (pauseError) {
    console.error("Erro ao pausar IA automaticamente:", pauseError);
  }
}

// ==================== BULK SEND / ENVIO EM MASSA ====================
export async function sendBulkMessages(
  userId: string, 
  phones: string[], 
  message: string
): Promise<{ sent: number; failed: number; errors: string[] }> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp não conectado");
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  console.log(`[BULK SEND] 🛡️ Iniciando envio ANTI-BLOQUEIO para ${phones.length} números`);

  for (const phone of phones) {
    try {
      // Formatar número para JID
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Adicionar código do país se necessário (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      console.log(`[BULK SEND] Enviando para: ${jid}`);
      
      // 🛡️ ANTI-BLOQUEIO: Usar fila de mensagens com delay automático de 5-10s
      // ✅ Texto enviado EXATAMENTE como recebido (variação REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, message, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa (respostas de IA passam na frente)
      });
      
      if (queueResult.success) {
        sent++;
        console.log(`[BULK SEND] ✅ Enviado para ${phone}`);
      } else {
        failed++;
        errors.push(`${phone}: ${queueResult.error || 'Sem ID de mensagem retornado'}`);
        console.log(`[BULK SEND] ❌ Falha ao enviar para ${phone}: ${queueResult.error}`);
      }
      
      // 🛡️ A fila já controla o delay - não precisa de delay extra aqui
      
    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${phone}: ${errorMsg}`);
      console.log(`[BULK SEND] ❌ Erro ao enviar para ${phone}: ${errorMsg}`);
      
      // Delay extra em caso de erro (pode ser rate limit)
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`[BULK SEND] Concluído: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors };
}

// ==================== BULK SEND ADVANCED - COM [nome] E IA ====================
export async function sendBulkMessagesAdvanced(
  userId: string, 
  contacts: { phone: string; name: string }[], 
  messageTemplate: string,
  options: {
    delayMin?: number;
    delayMax?: number;
    useAI?: boolean;
    onProgress?: (sent: number, failed: number) => Promise<void>;
  } = {}
): Promise<{ 
  sent: number; 
  failed: number; 
  errors: string[];
  details: {
    sent: { phone: string; name?: string; timestamp: string; message: string }[];
    failed: { phone: string; name?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp não conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const useAI = options.useAI || false;
  const onProgress = options.onProgress;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { phone: string; name?: string; timestamp: string; message: string }[],
    failed: [] as { phone: string; name?: string; error: string; timestamp: string }[],
  };

  console.log(`[BULK SEND ADVANCED] Iniciando envio para ${contacts.length} contatos`);
  console.log(`[BULK SEND ADVANCED] Delay: ${delayMin/1000}-${delayMax/1000}s, IA: ${useAI}`);

  // Função para aplicar template [nome]
  const applyTemplate = (template: string, name: string): string => {
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  // Função para gerar variação com IA (paráfrase e sinônimos)
  const generateVariation = async (message: string, contactIndex: number): Promise<string> => {
    if (!useAI) return message;
    
    try {
      // Sinônimos comuns em português
      const synonyms: Record<string, string[]> = {
        'olá': ['oi', 'eae', 'e aí', 'hey'],
        'oi': ['olá', 'eae', 'e aí', 'hey'],
        'tudo bem': ['como vai', 'tudo certo', 'tudo ok', 'como você está'],
        'como vai': ['tudo bem', 'tudo certo', 'como está', 'tudo ok'],
        'obrigado': ['valeu', 'grato', 'agradeço', 'muito obrigado'],
        'obrigada': ['valeu', 'grata', 'agradeço', 'muito obrigada'],
        'por favor': ['poderia', 'seria possível', 'gentilmente', 'se possível'],
        'aqui': ['por aqui', 'neste momento', 'agora'],
        'agora': ['neste momento', 'atualmente', 'no momento'],
        'hoje': ['neste dia', 'agora', 'no dia de hoje'],
        'gostaria': ['queria', 'preciso', 'necessito', 'adoraria'],
        'pode': ['consegue', 'seria possível', 'poderia', 'daria para'],
        'grande': ['enorme', 'imenso', 'vasto', 'extenso'],
        'pequeno': ['menor', 'reduzido', 'compacto', 'mínimo'],
        'bom': ['ótimo', 'excelente', 'legal', 'incrível'],
        'bonito': ['lindo', 'maravilhoso', 'belo', 'encantador'],
        'rápido': ['veloz', 'ágil', 'ligeiro', 'imediato'],
        'ajudar': ['auxiliar', 'apoiar', 'assistir', 'dar uma força'],
        'entrar em contato': ['falar com você', 'te contatar', 'enviar mensagem', 'me comunicar'],
        'informações': ['detalhes', 'dados', 'informes', 'esclarecimentos'],
        'produto': ['item', 'mercadoria', 'artigo', 'oferta'],
        'serviço': ['atendimento', 'solução', 'suporte', 'trabalho'],
        'empresa': ['companhia', 'negócio', 'organização', 'firma'],
        'cliente': ['consumidor', 'comprador', 'parceiro', 'usuário'],
        'qualidade': ['excelência', 'padrão', 'nível', 'categoria'],
        'preço': ['valor', 'custo', 'investimento', 'oferta'],
        'desconto': ['promoção', 'oferta especial', 'condição especial', 'vantagem'],
        'interessado': ['curioso', 'interessando', 'querendo saber', 'buscando'],
      };
      
      // Prefixos variados para humanizar
      const prefixes = ['', '', '', '🙂 ', '😊 ', '👋 ', '💬 ', 'Hey, ', 'Ei, '];
      // Sufixos variados
      const suffixes = ['', '', '', ' 😊', ' 🙏', ' ✨', '!', '.', ' Abraços!', ' Att.'];
      // Estruturas de abertura alternativas
      const openings: Record<string, string[]> = {
        'olá [nome]': ['Oi [nome]', 'E aí [nome]', 'Ei [nome]', '[nome], tudo bem?', 'Fala [nome]'],
        'oi [nome]': ['Olá [nome]', 'E aí [nome]', 'Ei [nome]', '[nome], como vai?', 'Fala [nome]'],
        'bom dia': ['Bom dia!', 'Dia!', 'Bom diaa', 'Ótimo dia'],
        'boa tarde': ['Boa tarde!', 'Tarde!', 'Boa tardee', 'Ótima tarde'],
        'boa noite': ['Boa noite!', 'Noite!', 'Boa noitee', 'Ótima noite'],
      };
      
      let varied = message;
      
      // 1. Aplicar substituições de abertura
      for (const [pattern, replacements] of Object.entries(openings)) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(varied)) {
          const randomReplacement = replacements[Math.floor(Math.random() * replacements.length)];
          varied = varied.replace(regex, randomReplacement);
          break; // Só substitui uma abertura
        }
      }
      
      // 2. Aplicar 1-3 substituições de sinônimos aleatoriamente
      const wordsToReplace = Math.floor(Math.random() * 3) + 1;
      let replacedCount = 0;
      
      for (const [word, syns] of Object.entries(synonyms)) {
        if (replacedCount >= wordsToReplace) break;
        const regex = new RegExp(`\\b${word}\\b`, 'gi');
        if (regex.test(varied)) {
          const randomSyn = syns[Math.floor(Math.random() * syns.length)];
          varied = varied.replace(regex, randomSyn);
          replacedCount++;
        }
      }
      
      // 3. Adicionar variação de pontuação
      if (Math.random() > 0.7) {
        varied = varied.replace(/\!$/g, '.');
      } else if (Math.random() > 0.8) {
        varied = varied.replace(/\.$/g, '!');
      }
      
      // 4. Usar índice para variar prefixo/sufixo de forma distribuída
      const prefixIndex = (contactIndex + Math.floor(Math.random() * 3)) % prefixes.length;
      const suffixIndex = (contactIndex + Math.floor(Math.random() * 3)) % suffixes.length;
      
      // Não adicionar prefixo/sufixo se já começar com emoji ou terminar com emoji
      // Usa regex sem flag 'u' para compatibilidade com ES5
      const emojiPattern = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
      const startsWithEmoji = emojiPattern.test(varied.slice(0, 2));
      const endsWithEmoji = emojiPattern.test(varied.slice(-2));
      
      if (!startsWithEmoji && prefixes[prefixIndex]) {
        varied = prefixes[prefixIndex] + varied;
      }
      if (!endsWithEmoji && suffixes[suffixIndex] && !varied.endsWith(suffixes[suffixIndex])) {
        // Remover pontuação final antes de adicionar sufixo
        if (suffixes[suffixIndex].match(/^[.!?]/) || suffixes[suffixIndex].match(/^\s*[A-Za-z]/)) {
          varied = varied.replace(/[.!?]+$/, '');
        }
        varied = varied + suffixes[suffixIndex];
      }
      
      console.log(`[BULK SEND AI] Variação #${contactIndex + 1}: "${varied.substring(0, 60)}..."`);
      return varied;
    } catch (error) {
      console.error('[BULK SEND] Erro ao gerar variação IA:', error);
      return message;
    }
  };

  let contactIndex = 0;
  for (const contact of contacts) {
    try {
      // Formatar número para JID
      const cleanPhone = contact.phone.replace(/\D/g, '');
      
      // Adicionar código do país se necessário (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      // Aplicar template [nome] e variação IA
      let finalMessage = applyTemplate(messageTemplate, contact.name);
      if (useAI) {
        finalMessage = await generateVariation(finalMessage, contactIndex);
      }
      
      console.log(`[BULK SEND ADVANCED] Enviando para: ${contact.name || contact.phone} (${jid})`);
      console.log(`[BULK SEND ADVANCED] Mensagem: ${finalMessage.substring(0, 50)}...`);
      
      // 🛡️ ANTI-BLOQUEIO: Usar fila de mensagens com delay automático de 5-10s
      // ✅ Texto enviado EXATAMENTE como recebido (variação REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, finalMessage, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa
      });
      
      if (queueResult.success) {
        sent++;
        details.sent.push({
          phone: contact.phone,
          name: contact.name,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[BULK SEND ADVANCED] ✅ Enviado para ${contact.name || contact.phone}`);
        
        // 📊 Atualizar progresso em tempo real
        if (onProgress) {
          try {
            await onProgress(sent, failed);
          } catch (progressError) {
            console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
          }
        }
      } else {
        failed++;
        const errorMsg = queueResult.error || 'Sem ID de mensagem retornado';
        errors.push(`${contact.phone}: ${errorMsg}`);
        details.failed.push({
          phone: contact.phone,
          name: contact.name,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[BULK SEND ADVANCED] ❌ Falha: ${contact.phone}`);
        
        // 📊 Atualizar progresso em tempo real (também para falhas)
        if (onProgress) {
          try {
            await onProgress(sent, failed);
          } catch (progressError) {
            console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
          }
        }
      }

      // 🛡️ A fila já controla o delay de 5-10s - não precisa de delay extra aqui
      
    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${contact.phone}: ${errorMsg}`);
      details.failed.push({
        phone: contact.phone,
        name: contact.name,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.log(`[BULK SEND ADVANCED] ❌ Erro: ${contact.phone} - ${errorMsg}`);
      
      // 📊 Atualizar progresso em tempo real (também para erros)
      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
        }
      };
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    contactIndex++;
  }

  console.log(`[BULK SEND ADVANCED] Concluído: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// ==================== GRUPOS / GROUPS ====================

interface WhatsAppGroup {
  id: string;
  name: string;
  participantsCount: number;
  description?: string;
  owner?: string;
  createdAt?: number;
  isAdmin?: boolean;
}

/**
 * Busca todos os grupos que o usuário participa
 * Usa groupFetchAllParticipating do Baileys
 */
export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp não conectado");
  }

  try {
    console.log(`[GROUPS] Buscando grupos para usuário ${userId}...`);
    
    // Buscar todos os grupos participantes via Baileys
    const groups = await session.socket.groupFetchAllParticipating();
    
    const groupList: WhatsAppGroup[] = [];
    
    for (const [jid, metadata] of Object.entries(groups)) {
      // Verificar se o usuário é admin do grupo
      const meJid = session.socket.user?.id;
      const meParticipant = metadata.participants?.find(p => 
        p.id === meJid || p.id?.includes(session.phoneNumber || '')
      );
      const isAdmin = meParticipant?.admin === 'admin' || meParticipant?.admin === 'superadmin';
      
      groupList.push({
        id: jid,
        name: metadata.subject || 'Grupo sem nome',
        participantsCount: metadata.participants?.length || metadata.size || 0,
        description: metadata.desc || undefined,
        owner: metadata.owner || undefined,
        createdAt: metadata.creation,
        isAdmin,
      });
    }
    
    console.log(`[GROUPS] Encontrados ${groupList.length} grupos`);
    return groupList;
    
  } catch (error: any) {
    console.error(`[GROUPS] Erro ao buscar grupos:`, error);
    throw new Error(`Falha ao buscar grupos: ${error.message}`);
  }
}

/**
 * Envia mensagem para um ou mais grupos
 */
export async function sendMessageToGroups(
  userId: string,
  groupIds: string[],
  message: string,
  options: {
    delayMin?: number;
    delayMax?: number;
    useAI?: boolean;
  } = {}
): Promise<{
  sent: number;
  failed: number;
  errors: string[];
  details: {
    sent: { groupId: string; groupName?: string; timestamp: string; message: string }[];
    failed: { groupId: string; groupName?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp não conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const useAI = options.useAI || false;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { groupId: string; groupName?: string; timestamp: string; message: string }[],
    failed: [] as { groupId: string; groupName?: string; error: string; timestamp: string }[],
  };

  console.log(`[GROUP SEND] Iniciando envio para ${groupIds.length} grupos`);
  console.log(`[GROUP SEND] Delay: ${delayMin/1000}-${delayMax/1000}s, IA: ${useAI}`);

  // Buscar metadados dos grupos para obter nomes
  let groupsMetadata: Record<string, any> = {};
  try {
    groupsMetadata = await session.socket.groupFetchAllParticipating();
  } catch (e) {
    console.warn('[GROUP SEND] Não foi possível buscar metadados dos grupos');
  }

  // Função para gerar variação básica com IA
  const generateGroupVariation = (baseMessage: string, groupIndex: number): string => {
    if (!useAI) return baseMessage;
    
    // Variações simples de prefixo/sufixo
    const prefixes = ['', '', '📢 ', '💬 ', '📣 ', '👋 '];
    const suffixes = ['', '', '', ' 🙏', ' ✨', '!'];
    
    const prefixIndex = groupIndex % prefixes.length;
    const suffixIndex = groupIndex % suffixes.length;
    
    let varied = baseMessage;
    
    // Adicionar variação se não começar/terminar com emoji
    const emojiPattern = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
    const startsWithEmoji = emojiPattern.test(varied.slice(0, 2));
    const endsWithEmoji = emojiPattern.test(varied.slice(-2));
    
    if (!startsWithEmoji && prefixes[prefixIndex]) {
      varied = prefixes[prefixIndex] + varied;
    }
    if (!endsWithEmoji && suffixes[suffixIndex]) {
      varied = varied.replace(/[.!?]+$/, '') + suffixes[suffixIndex];
    }
    
    return varied;
  };

  let groupIndex = 0;
  for (const groupId of groupIds) {
    try {
      // Verificar se é um JID de grupo válido
      const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
      const groupName = groupsMetadata[jid]?.subject || groupId;
      
      // Aplicar variação se IA estiver ativada
      const finalMessage = useAI ? generateGroupVariation(message, groupIndex) : message;
      
      console.log(`[GROUP SEND] Enviando para grupo: ${groupName} (${jid})`);
      console.log(`[GROUP SEND] Mensagem: ${finalMessage.substring(0, 50)}...`);
      
      // 🛡️ ANTI-BLOQUEIO: Usar fila de mensagens com delay automático de 5-10s
      // ✅ Texto enviado EXATAMENTE como recebido (variação REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, finalMessage, {
        isFromAgent: true,
        priority: 'low', // Grupos = prioridade baixa
      });
      
      if (queueResult.success) {
        sent++;
        details.sent.push({
          groupId: jid,
          groupName,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[GROUP SEND] ✅ Enviado para ${groupName}`);
      } else {
        failed++;
        const errorMsg = queueResult.error || 'Sem ID de mensagem retornado';
        errors.push(`${groupName}: ${errorMsg}`);
        details.failed.push({
          groupId: jid,
          groupName,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[GROUP SEND] ❌ Falha: ${groupName}`);
      }

      // 🛡️ A fila já controla o delay de 5-10s - não precisa de delay extra aqui
      
    } catch (error: any) {
      const groupName = groupsMetadata[groupId]?.subject || groupId;
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${groupName}: ${errorMsg}`);
      details.failed.push({
        groupId,
        groupName,
        error: errorMsg,
        timestamp: new Date().toISOString(),
      });
      console.log(`[GROUP SEND] ❌ Erro: ${groupName} - ${errorMsg}`);
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    groupIndex++;
  }

  console.log(`[GROUP SEND] Concluído: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// Função auxiliar para obter sessões (usado em rotas de debug)
export function getSessions(): Map<string, WhatsAppSession> {
  return sessions;
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  const session = sessions.get(userId);
  if (session?.socket) {
    await session.socket.logout();
    sessions.delete(userId);
  }

  const connection = await storage.getConnectionByUserId(userId);
  if (connection) {
    await storage.updateConnection(connection.id, {
      isConnected: false,
      qrCode: null,
    });
  }

  // Limpar arquivos de autenticaÃ§Ã£o para permitir nova conexÃ£o
  const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
  await clearAuthFiles(userAuthPath);

  broadcastToUser(userId, { type: "disconnected" });
}

export function getSession(userId: string): WhatsAppSession | undefined {
  return sessions.get(userId);
}

export function getAdminSession(adminId: string): AdminWhatsAppSession | undefined {
  return adminSessions.get(adminId);
}

export async function connectAdminWhatsApp(adminId: string): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear conexões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n⚠️ [DEV MODE] Conexão Admin WhatsApp bloqueada para admin ${adminId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   💡 Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
  try {
    // Verificar se já existe uma sessão ativa
    const existingSession = adminSessions.get(adminId);
    if (existingSession?.socket) {
      console.log(`Admin ${adminId} already has an active session, using existing one`);
      return;
    }

    let connection = await storage.getAdminWhatsappConnection(adminId);

    if (!connection) {
      connection = await storage.createAdminWhatsappConnection({
        adminId,
        isConnected: false,
      });
    }

    const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
    await ensureDirExists(adminAuthPath);
    const { state, saveCreds } = await useMultiFileAuthState(adminAuthPath);

    // FIX LID 2025: Cache manual para mapear @lid → phone number
    // Tentar carregar do banco de dados ao iniciar
    const contactsCache = new Map<string, Contact>();
    
    try {
        // Carregar conversas existentes para popular o cache LID -> Phone
        const conversations = await storage.getAdminConversations(adminId);
        for (const conv of conversations) {
            if (conv.remoteJid && conv.contactNumber) {
                const contact: Contact = {
                    id: conv.remoteJid,
                    phoneNumber: conv.contactNumber,
                    name: conv.contactName || undefined
                };
                
                // Se tivermos o LID salvo em algum lugar (remoteJidAlt?), mapear também
                // Por enquanto, mapeamos o remoteJid normal
                contactsCache.set(conv.remoteJid, contact);
                contactsCache.set(conv.contactNumber, contact); // Mapear pelo número também
                
                // Tentar inferir LID se possível ou se tivermos salvo
                // (Futuramente salvar o LID na tabela admin_conversations seria ideal)
            }
        }
        console.log(`[ADMIN CACHE] Pré-carregados ${conversations.length} contatos do histórico`);
    } catch (err) {
        console.error("[ADMIN CACHE] Erro ao pré-carregar contatos:", err);
    }

    const socket = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
    });

    adminSessions.set(adminId, {
      socket,
      adminId,
      contactsCache,
    });

    // Verificar se já está conectado ao criar o socket (sessão restaurada)
    if (socket.user) {
      const phoneNumber = socket.user.id.split(':')[0];
      console.log(`✅ [ADMIN] Socket criado já conectado (sessão restaurada): ${phoneNumber}`);
      
      // Forçar presença disponível para receber updates de outros usuários
      setTimeout(() => {
        socket.sendPresenceUpdate('available').catch(err => console.error("Erro ao enviar presença inicial:", err));
      }, 2000);

      await storage.updateAdminWhatsappConnection(adminId, {
        isConnected: true,
        phoneNumber,
        qrCode: null,
      });
      broadcastToAdmin(adminId, { type: "connected", phoneNumber });
    }

    // Listener para cachear contatos quando Baileys emitir contacts.upsert
    let contactCacheCount = 0;
    socket.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }
        // Log apenas primeiros 50 contatos para evitar rate limit
        if (contactCacheCount < 50) {
          console.log(`[ADMIN CONTACT CACHE] Added: ${contact.id}`);
          contactCacheCount++;
        }
      }
      // Log resumo final
      if (contacts.length > 0 && contactCacheCount >= 50) {
        console.log(`[ADMIN CONTACT CACHE] Total cached: ${contactsCache.size} contacts (logs suppressed after 50)`);
        contactCacheCount = 51; // Prevenir log repetido
      }
    });

    socket.ev.on("creds.update", saveCreds);

    // ═══════════════════════════════════════════════════════════════════════
    // 🕵️ HANDLER DE PRESENÇA (TYPING/PAUSED) - DETECÇÃO DE DIGITAÇÃO
    // ═══════════════════════════════════════════════════════════════════════
    socket.ev.on("presence.update", async (update) => {
      const { id, presences } = update;
      
      // LOG DE DEBUG PARA DIAGNÓSTICO (ATIVADO)
      if (!id.includes("@g.us") && !id.includes("@broadcast")) {
         console.log(`🕵️ [PRESENCE RAW] ID: ${id} | Presences: ${JSON.stringify(presences)}`);
      }

      // Verificar se é um chat individual
      if (id.includes("@g.us") || id.includes("@broadcast")) return;

      // Verificar se temos uma resposta pendente para este chat
      // FIX: O ID que vem no presence.update pode ser um LID (ex: 254635809968349@lid)
      // Precisamos mapear esse LID para o número de telefone real (contactNumber)
      // O pendingAdminResponses usa o contactNumber como chave (ex: 5517991956944)
      
      let contactNumber = cleanContactNumber(id);
      
      // Se for LID, tentar encontrar o número real no cache de contatos
      if (id.includes("@lid")) {
         const contact = contactsCache.get(id);
         if (contact && contact.phoneNumber) {
             contactNumber = cleanContactNumber(contact.phoneNumber);
             console.log(`🕵️ [PRESENCE MAP] Mapeado LID ${id} -> ${contactNumber}`);
         } else {
             // Se não achou no cache, tentar buscar no banco (fallback)
             // Mas como é async, talvez não dê tempo. Vamos tentar varrer o pendingAdminResponses
             // para ver se algum remoteJid bate com esse LID? Não, remoteJid geralmente é s.whatsapp.net
             
             // TENTATIVA DE RECUPERAÇÃO:
             // Se o ID for LID, e não achamos o contactNumber, vamos tentar ver se existe
             // alguma resposta pendente onde o remoteJidAlt seja esse LID
             // OU se só existe UMA resposta pendente no sistema, assumimos que é ela (para testes)
             
             if (pendingAdminResponses.size === 1) {
                 contactNumber = pendingAdminResponses.keys().next().value || "";
                 console.log(`🕵️ [PRESENCE GUESS] LID desconhecido ${id}, mas só há 1 pendente: ${contactNumber}. Assumindo match.`);
             } else {
                 console.log(`⚠️ [PRESENCE FAIL] Não foi possível mapear LID ${id} para um número de telefone.`);
             }
         }
      }

      if (!contactNumber) return;

      const pending = pendingAdminResponses.get(contactNumber);
      
      // Se não tiver resposta pendente, não precisamos fazer nada (não estamos esperando para responder)
      if (!pending) return;

      console.log(`🕵️ [PRESENCE MATCH] Update para ${contactNumber} (tem resposta pendente)`);
      console.log(`   Dados: ${JSON.stringify(presences)}`);

      // Encontrar o participante correto (o cliente)
      // Em chats privados, a chave deve conter o número do cliente
      const participantKey = Object.keys(presences).find(key => key.includes(contactNumber));
      
      // FIX: Se não encontrar pelo número, pode ser que a chave seja o JID completo ou diferente
      // Vamos tentar pegar qualquer chave que NÃO seja o nosso próprio número
      let finalKey = participantKey;
      
      if (!finalKey) {
        const myNumber = cleanContactNumber(socket.user?.id);
        const otherKeys = Object.keys(presences).filter(k => !k.includes(myNumber));
        
        if (otherKeys.length > 0) {
          finalKey = otherKeys[0];
        }
      }

      if (!finalKey) {
         console.log(`   ⚠️ [PRESENCE] Não foi possível identificar o participante alvo. Chaves: ${Object.keys(presences)}`);
         return;
      }

      const presence = presences[finalKey]?.lastKnownPresence;
      
      if (!presence) return;

      // Atualizar presença conhecida
      pending.lastKnownPresence = presence;
      pending.lastPresenceUpdate = Date.now();

      console.log(`   🕵️ [PRESENCE DETECTED] Status: ${presence} | User: ${finalKey}`);

      if (presence === 'composing') {
        console.log(`✍️ [ADMIN AGENT] Usuário ${contactNumber} está digitando... Estendendo espera.`);
        
        // Se estiver digitando, estender o timeout para aguardar
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Adicionar 25 segundos de "buffer de digitação"
        // Isso evita responder enquanto o usuário ainda está escrevendo
        const typingBuffer = 25000; // 25s
        
        pending.timeout = setTimeout(() => {
          console.log(`⏰ [ADMIN AGENT] Timeout de digitação (25s) expirou para ${contactNumber}. Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, typingBuffer);
        
      } else if (presence === 'paused') {
        console.log(`✋ [ADMIN AGENT] Usuário ${contactNumber} parou de digitar. Retomando espera padrão (6s).`);
        
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Voltar para o delay padrão de 6s
        // Importante: Dar um pequeno delay extra (ex: 6s) para garantir que não é apenas uma pausa breve
        const standardDelay = 6000; 
        
        pending.timeout = setTimeout(() => {
          console.log(`⏰ [ADMIN AGENT] Timeout padrão (6s) expirou para ${contactNumber} (após pausa). Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, standardDelay);
      } else {
        // Logar outros estados de presença para debug (ex: available, unavailable)
        console.log(`ℹ️ [ADMIN AGENT] Presença atualizada para ${contactNumber}: ${presence}`);
      }
    });

    // ═══════════════════════════════════════════════════════════════════════
    // 🤖 HANDLER DE MENSAGENS DO ADMIN - ATENDIMENTO AUTOMATIZADO
    // ═══════════════════════════════════════════════════════════════════════
    socket.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // Ignorar mensagens enviadas pelo próprio admin (fromMe: true)
      if (message.key.fromMe) {
        console.log(`📱 [ADMIN] Mensagem enviada pelo admin, ignorando processamento automático`);
        return;
      }
      
      const remoteJid = message.key.remoteJid;
      if (!remoteJid) return;
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`📱 [ADMIN] Ignorando mensagem de grupo/status`);
        return;
      }
      
      try {
        // Importar dinamicamente para evitar circular dependency
        const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");
        
        // ═══════════════════════════════════════════════════════════════════════
        // 🎯 FIX LID 2025: Resolver @lid para número real usando remoteJidAlt
        // ═══════════════════════════════════════════════════════════════════════
        let contactNumber: string;
        let realRemoteJid = remoteJid;  // JID real para envio de mensagens
        
        if (remoteJid.includes("@lid") && (message.key as any).remoteJidAlt) {
          const realJid = (message.key as any).remoteJidAlt;
          contactNumber = cleanContactNumber(realJid);
          realRemoteJid = realJid;
          
          console.log(`\n✅ [ADMIN LID RESOLVIDO] Número real encontrado via remoteJidAlt!`);
          console.log(`   LID: ${remoteJid}`);
          console.log(`   JID WhatsApp REAL: ${realJid}`);
          console.log(`   Número limpo: ${contactNumber}\n`);
          
          // Salvar mapeamento LID → número no cache do admin
          contactsCache.set(remoteJid, {
            id: remoteJid,
            name: message.pushName || undefined,
            phoneNumber: realJid,
          });
        } else {
          contactNumber = cleanContactNumber(remoteJid);
        }
        
        if (!contactNumber) {
          console.log(`📱 [ADMIN] Não foi possível extrair número de: ${remoteJid}`);
          return;
        }
        
        // Extrair texto e mídia da mensagem
        let messageText = "";
        let mediaType: string | undefined;
        let mediaUrl: string | undefined;
        
        const msg = message.message;
        
        if (msg?.conversation) {
          messageText = msg.conversation;
        } else if (msg?.extendedTextMessage?.text) {
          messageText = msg.extendedTextMessage.text;
        } else if (msg?.imageMessage) {
          mediaType = "image";
          messageText = msg.imageMessage.caption || "📷 Imagem";
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            mediaUrl = `data:${msg.imageMessage.mimetype || "image/jpeg"};base64,${buffer.toString("base64")}`;
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar imagem:", err);
          }
        } else if (msg?.audioMessage) {
          mediaType = "audio";
          messageText = "🎵 Áudio"; // Texto inicial, será substituído pela transcrição
          // 🎤 Baixar áudio para transcrição (será transcrito em createAdminMessage)
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
            mediaUrl = `data:${mimeType};base64,${buffer.toString("base64")}`;
            console.log(`[ADMIN] Áudio baixado: ${buffer.length} bytes (${mimeType})`);
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar áudio:", err);
          }
        } else if (msg?.videoMessage) {
          mediaType = "video";
          messageText = msg.videoMessage.caption || "🎥 Vídeo";
        } else if (msg?.documentMessage) {
          mediaType = "document";
          messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
        } else {
          // Suprimir logs de protocolMessage (system messages) para evitar spam
          const msgTypes = Object.keys(msg || {});
          if (!msgTypes.includes("protocolMessage")) {
            console.log(`📱 [ADMIN] Tipo de mensagem não suportado:`, msgTypes);
          }
          return;
        }
        
        console.log(`\n🤖 [ADMIN AGENT] ========================================`);
        console.log(`   📱 De: ${contactNumber}`);
        console.log(`   💬 Mensagem: ${messageText.substring(0, 100)}...`);
        console.log(`   🖼️ Mídia: ${mediaType || "nenhuma"}`);
        console.log(`   ========================================\n`);
        
        // ═══════════════════════════════════════════════════════════════════════
        // 💾 SALVAR CONVERSA E MENSAGEM NO BANCO DE DADOS
        // ═══════════════════════════════════════════════════════════════════════
        let conversation;
        let savedMessage: any = null;
        try {
          // IMPORTANTE: Usar realRemoteJid (número real) para envio de respostas
          conversation = await storage.getOrCreateAdminConversation(
            adminId, 
            contactNumber, 
            realRemoteJid, 
            message.pushName || undefined
          );

          // 📸 Tentar buscar foto de perfil se não tiver (assíncrono para não bloquear)
          if (!conversation.contactAvatar) {
             socket.profilePictureUrl(realRemoteJid, 'image')
               .then(url => {
                 if (url) {
                   storage.updateAdminConversation(conversation.id, { contactAvatar: url })
                     .catch(err => console.error(`❌ [ADMIN] Erro ao salvar avatar:`, err));
                 }
               })
               .catch(() => {}); // Ignorar erro (sem foto/privado)
          }
          
          // Salvar a mensagem recebida (transcrição de áudio acontece dentro)
          savedMessage = await storage.createAdminMessage({
            conversationId: conversation.id,
            messageId: message.key.id || `msg_${Date.now()}`,
            fromMe: false,
            text: messageText,
            timestamp: new Date(),
            status: "received",
            isFromAgent: false,
            mediaType,
            mediaUrl,
          });
          
          // 🎤 Se foi áudio e temos transcrição, usar o texto transcrito
          if (savedMessage?.text && savedMessage.text !== messageText) {
            console.log(`[ADMIN] 🎤 Texto atualizado com transcrição: ${savedMessage.text.substring(0, 100)}...`);
            messageText = savedMessage.text;
          }
          
          // Atualizar última mensagem da conversa
          await storage.updateAdminConversation(conversation.id, {
            lastMessageText: messageText.substring(0, 255),
            lastMessageTime: new Date(),
          });
          
          console.log(`💾 [ADMIN] Mensagem salva na conversa ${conversation.id}`);
        } catch (dbError) {
          console.error(`❌ [ADMIN] Erro ao salvar mensagem no banco:`, dbError);
          // Continuar processamento mesmo com erro no banco
        }
        
        // ═══════════════════════════════════════════════════════════════════════
        // 🔒 VERIFICAR SE AGENTE ESTÁ HABILITADO PARA ESTA CONVERSA
        // ═══════════════════════════════════════════════════════════════════════
        if (conversation) {
          const isAgentEnabled = await storage.isAdminAgentEnabledForConversation(conversation.id);
          console.log(`🔒 [ADMIN] Status do agente para ${contactNumber}: ${isAgentEnabled ? '✅ ATIVO' : '❌ DESATIVADO'}`);
          
          if (!isAgentEnabled) {
            console.log(`⏸️ [ADMIN] Agente pausado para conversa ${conversation.id} (${contactNumber}) - Ignorando mensagem.`);
            return;
          }
        } else {
          console.warn(`⚠️ [ADMIN] Objeto 'conversation' indefinido para ${contactNumber}. Verificação de status ignorada (Risco de resposta indesejada).`);
        }
        
        // Verificar se é mensagem para atendimento automatizado
        const adminAgentEnabled = await storage.getSystemConfig("admin_agent_enabled");
        
        if (adminAgentEnabled?.valor !== "true") {
          console.log(`📱 [ADMIN] Agente admin desativado, não processando`);
          return;
        }
        
        // Para mídias (ex: comprovante) processar imediatamente.
        // Para textos (inclusive várias mensagens em linhas separadas), acumular e responder uma vez.
        // ÁUDIOS: Tratar como TEXTO pois são transcritos - mesmas regras de acumulação, delay, trigger
        // IMAGENS: Processar imediatamente pois podem ser comprovantes de pagamento
        const shouldAccumulate = !mediaType || mediaType === 'audio';
        
        if (shouldAccumulate) {
          // Áudios e textos usam o sistema de acumulação
          // Isso garante: tempo de resposta, delay humanizado, verificação de trigger
          await scheduleAdminAccumulatedResponse({
            socket,
            remoteJid: realRemoteJid,  // IMPORTANTE: Usar JID real para envio
            contactNumber,
            messageText,  // Para áudios, já é o texto transcrito
            conversationId: conversation?.id,
          });
          return;
        }

        // Para IMAGENS APENAS:
        // - Não acumular (processar imediatamente)
        // - Não verificar trigger (podem ser comprovantes)
        console.log(`📁 [ADMIN] Mídia ${mediaType} - processamento imediato (possível comprovante)`);
        
        const response = await processAdminMessage(contactNumber, messageText, mediaType, mediaUrl, true);

        if (response && response.text) {
          const cfg = await getAdminAgentRuntimeConfig();
          const typingDelay = randomBetween(cfg.typingDelayMinMs, cfg.typingDelayMaxMs);
          await new Promise(resolve => setTimeout(resolve, typingDelay));

          const parts = splitMessageHumanLike(response.text, cfg.messageSplitChars);
          for (let i = 0; i < parts.length; i++) {
            if (i > 0) {
              const interval = randomBetween(cfg.messageIntervalMinMs, cfg.messageIntervalMaxMs);
              await new Promise(resolve => setTimeout(resolve, interval));
            }
            await socket.sendMessage(realRemoteJid, { text: parts[i] });  // IMPORTANTE: Usar JID real
          }
          console.log(`✅ [ADMIN AGENT] Resposta enviada para ${contactNumber}`);
          
          // 💾 Salvar resposta do agente no banco de dados
          if (conversation?.id) {
            try {
              await storage.createAdminMessage({
                conversationId: conversation.id,
                messageId: `agent_media_${Date.now()}`,
                fromMe: true,
                text: response.text,
                timestamp: new Date(),
                status: "sent",
                isFromAgent: true,
              });
              
              await storage.updateAdminConversation(conversation.id, {
                lastMessageText: response.text.substring(0, 255),
                lastMessageTime: new Date(),
              });
              
              console.log(`💾 [ADMIN AGENT] Resposta (mídia) salva na conversa ${conversation.id}`);
            } catch (dbError) {
              console.error(`❌ [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
            }
          }
        }

        if (response && response.actions?.notifyOwner) {
          const ownerNumber = await getOwnerNotificationNumber();
          const ownerJid = `${ownerNumber}@s.whatsapp.net`;

          const notificationText = `💰 *NOTIFICAÇÃO DE PAGAMENTO*\n\n📱 Cliente: ${contactNumber}\n⏰ ${new Date().toLocaleString("pt-BR")}\n\n⚠️ Verificar comprovante e liberar conta`;
          await socket.sendMessage(ownerJid, { text: notificationText });
          console.log(`📢 [ADMIN AGENT] Notificação enviada para ${ownerNumber}`);

          if (mediaType === "image" && mediaUrl) {
            try {
              const base64Data = mediaUrl.split(",")[1];
              const buffer = Buffer.from(base64Data, "base64");
              await socket.sendMessage(ownerJid, {
                image: buffer,
                caption: `📸 Comprovante do cliente ${contactNumber}`,
              });
            } catch (err) {
              console.error("[ADMIN AGENT] Erro ao encaminhar comprovante:", err);
            }
          }
        }
        
        // 📁 Enviar mídias se houver (para handler de mídia)
        if (response && response.mediaActions && response.mediaActions.length > 0) {
          console.log(`📁 [ADMIN AGENT MEDIA] Enviando ${response.mediaActions.length} mídia(s)...`);
          console.log(`📁 [ADMIN AGENT MEDIA] JID de destino: ${realRemoteJid}`);
          
          for (const action of response.mediaActions) {
            if (action.mediaData) {
              try {
                const media = action.mediaData;
                console.log(`📁 [ADMIN AGENT MEDIA] ========================================`);
                console.log(`📁 [ADMIN AGENT MEDIA] Preparando envio de mídia:`);
                console.log(`   - Nome: ${media.name}`);
                console.log(`   - Tipo: ${media.mediaType}`);
                console.log(`   - MimeType: ${media.mimeType}`);
                console.log(`   - URL: ${media.storageUrl}`);
                
                const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
                
                if (mediaBuffer) {
                  console.log(`📁 [ADMIN AGENT MEDIA] Buffer baixado: ${mediaBuffer.length} bytes`);
                  
                  let sendResult: any;
                  
                  switch (media.mediaType) {
                    case 'image':
                      console.log(`📁 [ADMIN AGENT MEDIA] Enviando como IMAGEM...`);
                      sendResult = await socket.sendMessage(realRemoteJid, {
                        image: mediaBuffer,
                        caption: media.caption || undefined,
                      });
                      break;
                    case 'audio':
                      console.log(`📁 [ADMIN AGENT MEDIA] Enviando como ÁUDIO PTT...`);
                      // Tentar enviar como áudio com diferentes formatos
                      try {
                        sendResult = await socket.sendMessage(realRemoteJid, {
                          audio: mediaBuffer,
                          mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                          ptt: true,
                        });
                      } catch (audioErr: any) {
                        console.log(`⚠️ [ADMIN AGENT MEDIA] Erro ao enviar como PTT, tentando como audio normal...`);
                        console.log(`   Erro: ${audioErr.message}`);
                        // Tentar sem PTT
                        sendResult = await socket.sendMessage(realRemoteJid, {
                          audio: mediaBuffer,
                          mimetype: 'audio/mpeg',
                        });
                      }
                      break;
                    case 'video':
                      console.log(`📁 [ADMIN AGENT MEDIA] Enviando como VÍDEO...`);
                      sendResult = await socket.sendMessage(realRemoteJid, {
                        video: mediaBuffer,
                        caption: media.caption || undefined,
                      });
                      break;
                    case 'document':
                      console.log(`📁 [ADMIN AGENT MEDIA] Enviando como DOCUMENTO...`);
                      sendResult = await socket.sendMessage(realRemoteJid, {
                        document: mediaBuffer,
                        fileName: media.fileName || media.name || 'document',
                        mimetype: media.mimeType || 'application/octet-stream',
                      });
                      break;
                    default:
                      console.log(`⚠️ [ADMIN AGENT MEDIA] Tipo de mídia não suportado: ${media.mediaType}`);
                  }
                  
                  if (sendResult) {
                    console.log(`✅ [ADMIN AGENT MEDIA] Mídia ${media.name} enviada com sucesso!`);
                    console.log(`   - Message ID: ${sendResult.key?.id || 'N/A'}`);
                    console.log(`   - Status: ${sendResult.status || 'N/A'}`);
                  } else {
                    console.log(`⚠️ [ADMIN AGENT MEDIA] sendMessage retornou null/undefined para ${media.name}`);
                  }
                } else {
                  console.log(`❌ [ADMIN AGENT MEDIA] Falha ao baixar mídia: buffer vazio`);
                }
              } catch (mediaError: any) {
                console.error(`❌ [ADMIN AGENT MEDIA] Erro ao enviar mídia ${action.media_name}:`);
                console.error(`   - Mensagem: ${mediaError.message}`);
                console.error(`   - Stack: ${mediaError.stack?.substring(0, 300)}`);
              }
              await new Promise(r => setTimeout(r, 500));
            } else {
              console.log(`⚠️ [ADMIN AGENT MEDIA] action.mediaData é null para ${action.media_name}`);
            }
          }
          console.log(`📁 [ADMIN AGENT MEDIA] ========================================`);
        }

        // 🔌 Desconectar WhatsApp se solicitado (para handler de mídia)
        if (response && response.actions?.disconnectWhatsApp) {
          try {
            const { getClientSession } = await import("./adminAgentService");
            const clientSession = getClientSession(contactNumber);
            
            if (clientSession?.userId) {
              console.log(`🔌 [ADMIN AGENT MEDIA] Desconectando WhatsApp do usuário ${clientSession.userId}...`);
              await disconnectWhatsApp(clientSession.userId);
              await socket.sendMessage(realRemoteJid, { text: "Pronto! 🔌 Seu WhatsApp foi desconectado. Quando quiser reconectar, é só me avisar!" });
            } else {
              await socket.sendMessage(realRemoteJid, { text: "Não encontrei uma conexão ativa para desconectar." });
            }
          } catch (disconnectError) {
            console.error("❌ [ADMIN AGENT MEDIA] Erro ao desconectar WhatsApp:", disconnectError);
          }
        }
        
      } catch (error) {
        console.error(`❌ [ADMIN AGENT] Erro ao processar mensagem:`, error);
      }
    });

    socket.ev.on("connection.update", async (update) => {
      const { connection: connStatus, lastDisconnect, qr } = update;

      if (qr) {
        const qrCodeDataUrl = await QRCode.toDataURL(qr);
        await storage.updateAdminWhatsappConnection(adminId, {
          qrCode: qrCodeDataUrl,
        });
        broadcastToAdmin(adminId, { type: "qr", qr: qrCodeDataUrl });
      }

      // Estado "connecting" - quando o QR Code foi escaneado e estÃ¡ conectando
      if (connStatus === "connecting") {
        console.log(`Admin ${adminId} is connecting...`);
        broadcastToAdmin(adminId, { type: "connecting" });
      }

      if (connStatus === "open") {
        const phoneNumber = socket.user?.id.split(":")[0];
        console.log(`✅ [ADMIN] WhatsApp conectado: ${phoneNumber}`);
        
        // Forçar presença disponível para receber updates de outros usuários
        socket.sendPresenceUpdate('available').catch(err => console.error("Erro ao enviar presença:", err));
        
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: true,
          phoneNumber,
          qrCode: null,
        });

        const session = adminSessions.get(adminId);
        if (session) {
          session.phoneNumber = phoneNumber;
        }

        broadcastToAdmin(adminId, { type: "connected", phoneNumber });
      }

      if (connStatus === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode; const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // Sempre deletar a sessÃ£o primeiro
        adminSessions.delete(adminId);

        // Atualizar banco de dados
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: false,
          qrCode: null,
        });
        
        console.log(`[ADMIN DISCONNECT] Admin ${adminId} disconnected. StatusCode: ${statusCode}, Reason: ${lastDisconnect?.error}`);

        if (shouldReconnect) {
          if (statusCode !== 428 && statusCode !== 401) { console.log(`Admin ${adminId} WhatsApp disconnected (code: ${statusCode}), reconnecting...`); }
          broadcastToAdmin(adminId, { type: "disconnected" });
          setTimeout(() => connectAdminWhatsApp(adminId), 5000);
        } else {
          // Foi logout (desconectado pelo celular), limpar TUDO
          console.log(`Admin ${adminId} logged out from device (Code ${statusCode}), clearing all auth files...`);
          
          const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
          await clearAuthFiles(adminAuthPath);

          broadcastToAdmin(adminId, { type: "disconnected", reason: "logout" });
        }
      }
    });
  } catch (error) {
    console.error(`Error connecting admin ${adminId} WhatsApp:`, error);
    throw error;
  }
}

export async function disconnectAdminWhatsApp(adminId: string): Promise<void> {
  const session = adminSessions.get(adminId);
  if (session?.socket) {
    await session.socket.logout();
    adminSessions.delete(adminId);
  }

  const connection = await storage.getAdminWhatsappConnection(adminId);
  if (connection) {
    await storage.updateAdminWhatsappConnection(adminId, {
      isConnected: false,
      qrCode: null,
    });
  }

  // Limpar arquivos de autenticaÃ§Ã£o para permitir nova conexÃ£o
  const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
  await clearAuthFiles(adminAuthPath);

  broadcastToAdmin(adminId, { type: "disconnected" });
}

export async function sendWelcomeMessage(userPhone: string): Promise<void> {
  try {
    console.log(`[WELCOME] Iniciando envio de mensagem de boas-vindas para ${userPhone}`);

    // Obter configuraÃ§Ã£o de mensagem de boas-vindas
    const enabledConfig = await storage.getSystemConfig('welcome_message_enabled');
    const messageConfig = await storage.getSystemConfig('welcome_message_text');

    if (!enabledConfig || enabledConfig.valor !== 'true') {
      console.log('[WELCOME] Mensagem de boas-vindas desabilitada');
      return;
    }

    if (!messageConfig || !messageConfig.valor) {
      console.log('[WELCOME] Mensagem de boas-vindas nÃ£o configurada');
      return;
    }

    console.log('[WELCOME] ConfiguraÃ§Ã£o encontrada, procurando admin...');

    // Obter admin (assumindo que hÃ¡ apenas um admin owner)
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');

    if (!adminUser) {
      console.log('[WELCOME] Admin nÃ£o encontrado');
      return;
    }

    console.log(`[WELCOME] Admin encontrado: ${adminUser.id}`);

    // Verificar se admin tem WhatsApp conectado
    const adminConnection = await storage.getAdminWhatsappConnection(adminUser.id);

    if (!adminConnection || !adminConnection.isConnected) {
      console.log('[WELCOME] Admin WhatsApp nÃ£o conectado');
      return;
    }

    console.log('[WELCOME] Admin WhatsApp conectado, procurando sessÃ£o...');

    let adminSession = adminSessions.get(adminUser.id);

    // Se a sessÃ£o nÃ£o existe, tentar restaurÃ¡-la
    if (!adminSession || !adminSession.socket) {
      console.log('[WELCOME] Admin WhatsApp session nÃ£o encontrada, tentando restaurar...');
      try {
        await connectAdminWhatsApp(adminUser.id);
        adminSession = adminSessions.get(adminUser.id);

        if (!adminSession || !adminSession.socket) {
          console.log('[WELCOME] Falha ao restaurar sessÃ£o do admin');
          return;
        }

        console.log('[WELCOME] SessÃ£o do admin restaurada com sucesso');
      } catch (restoreError) {
        console.error('[WELCOME] Erro ao restaurar sessÃ£o do admin:', restoreError);
        return;
      }
    }

    console.log('[WELCOME] SessÃ£o encontrada, enviando mensagem...');

    // Formatar nÃºmero para envio (remover + e adicionar @s.whatsapp.net)
    const formattedNumber = `${cleanContactNumber(userPhone) || userPhone.replace('+', '')}@${DEFAULT_JID_SUFFIX}`;

    // Enviar mensagem
    await adminSession.socket.sendMessage(formattedNumber, {
      text: messageConfig.valor,
    });

    console.log(`[WELCOME] âœ… Mensagem de boas-vindas enviada com sucesso para ${userPhone}`);
  } catch (error) {
    console.error('[WELCOME] âŒ Erro ao enviar mensagem de boas-vindas:', error);
    // NÃ£o lanÃ§a erro para nÃ£o bloquear o cadastro
  }
}

export async function restoreExistingSessions(): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Não restaurar sessões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("\n⚠️ [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restauração de sessões WhatsApp");
    console.log("   💡 Isso evita conflitos com sessões ativas no Railway/produção");
    console.log("   💡 Para conectar WhatsApp em dev, remova SKIP_WHATSAPP_RESTORE do .env\n");
    return;
  }
  
  try {
    console.log("Checking for existing WhatsApp connections...");
    const connections = await storage.getAllConnections();

    for (const connection of connections) {
      // Tenta restaurar se:
      // 1. Estava marcada como conectada no banco, OU
      // 2. Tem arquivos de autenticação salvos (sessão persistida)
      if (connection.userId) {
        const userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(userAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diretório não existe ou erro ao ler
        }
        
        if (connection.isConnected || hasAuthFiles) {
          console.log(`Restoring WhatsApp session for user ${connection.userId}... (wasConnected: ${connection.isConnected}, hasAuthFiles: ${hasAuthFiles})`);
          try {
            await connectWhatsApp(connection.userId);
          } catch (error) {
            console.error(`Failed to restore session for user ${connection.userId}:`, error);
            await storage.updateConnection(connection.id, {
              isConnected: false,
              qrCode: null,
            });
          }
        }
      }
    }
    console.log("Session restoration complete");
  } catch (error) {
    console.error("Error restoring sessions:", error);
  }
}

export async function restoreAdminSessions(): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Não restaurar sessões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("⚠️ [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restauração de sessões Admin WhatsApp");
    return;
  }
  
  try {
    console.log("Checking for existing admin WhatsApp connections...");
    const allAdmins = await storage.getAllAdmins();

    for (const admin of allAdmins) {
      const adminConnection = await storage.getAdminWhatsappConnection(admin.id);

      if (adminConnection && adminConnection.isConnected) {
        console.log(`Restoring admin WhatsApp session for admin ${admin.id}...`);
        try {
          await connectAdminWhatsApp(admin.id);
          console.log(`âœ… Admin WhatsApp session restored for ${admin.id}`);
        } catch (error) {
          console.error(`Failed to restore admin session for ${admin.id}:`, error);
          await storage.updateAdminWhatsappConnection(admin.id, {
            isConnected: false,
            qrCode: null,
          });
        }
      }
    }
    console.log("Admin session restoration complete");
  } catch (error) {
    console.error("Error restoring admin sessions:", error);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📲 CONEXÃO VIA PAIRING CODE (SEM QR CODE)
// ═══════════════════════════════════════════════════════════════════════
// Baileys suporta conexão via código de pareamento de 8 dígitos
// Isso permite conectar pelo celular sem precisar escanear QR Code
// ═══════════════════════════════════════════════════════════════════════

export async function requestClientPairingCode(userId: string, phoneNumber: string): Promise<string | null> {
  // Verificar se já há uma solicitação em andamento para este usuário
  const existingRequest = pendingPairingRequests.get(userId);
  if (existingRequest) {
    console.log(`⏳ [PAIRING] Já existe solicitação em andamento para ${userId}, aguardando...`);
    return existingRequest;
  }
  
  // Criar Promise da solicitação
  const requestPromise = (async () => {
    try {
      console.log(`📲 [PAIRING] Solicitando código para ${phoneNumber} (user: ${userId})`);
      
      // Limpar sessão anterior se existir
      const existingSession = sessions.get(userId);
      if (existingSession?.socket) {
        try {
          console.log(`🔄 [PAIRING] Limpando sessão anterior...`);
          await existingSession.socket.logout();
        } catch (e) {
          console.log(`⚠️ [PAIRING] Erro ao fazer logout da sessão anterior (ignorando):`, e);
        }
        sessions.delete(userId);
      }
    
    // Criar/obter conexão
    let connection = await storage.getConnectionByUserId(userId);
    
    if (!connection) {
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    }
    
    const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    
    // Limpar auth anterior para começar do zero
    await clearAuthFiles(userAuthPath);

    // Recriar a pasta para o multi-file auth state
    await ensureDirExists(userAuthPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(userAuthPath);
    
    const sock = makeWASocket({
      auth: state,
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
    });
    
    const contactsCache = new Map<string, Contact>();
    
    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
      contactsCache,
    };
    
    sessions.set(userId, session);
    
    sock.ev.on("creds.update", saveCreds);
    
    // Handler de conexão
    sock.ev.on("connection.update", async (update) => {
      const { connection: conn, lastDisconnect } = update;
      
      if (conn === "open") {
        const phoneNum = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNum;
        
        await storage.updateConnection(session.connectionId, {
          isConnected: true,
          phoneNumber: phoneNum,
          qrCode: null,
        });
        
        console.log(`✅ [PAIRING] WhatsApp conectado: ${phoneNum}`);
        broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum });
      }
      
      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log(`📲 [PAIRING] Desconectado temporariamente, aguardando...`);
        }
      }
    });
    
    // Handler de mensagens
    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      if (!message.message) return;
      
      // 🚫 IMPORTANTE: Ignorar mensagens de sincronização/histórico
      // m.type === "notify" = mensagem NOVA (em tempo real)
      // m.type === "append" = sincronização de histórico (ao abrir conversa)
      if (m.type !== "notify") {
        console.log(`📱 [SYNC] Ignorando mensagem de sincronização (type: ${m.type})`);
        return;
      }
      
      if (message.key.fromMe) {
        try {
          await handleOutgoingMessage(session, message);
        } catch (err) {
          console.error("Error handling outgoing message:", err);
        }
        return;
      }
      
      try {
        await handleIncomingMessage(session, message);
      } catch (err) {
        console.error("Error handling incoming message:", err);
      }
    });
    
    // Formatar número para pairing (sem + e sem @)
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    console.log(`📲 [PAIRING] Número formatado para pareamento: ${cleanNumber}`);
    
    // Solicitar código de pareamento
    // O código será enviado via WhatsApp para o número informado
    try {
      const code = await sock.requestPairingCode(cleanNumber);
      
      console.log(`✅ [PAIRING] Código gerado com sucesso: ${code}`);
      
      // Aguardar um pouco para garantir que o código foi processado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return code;
    } catch (pairingError) {
      console.error(`❌ [PAIRING] Erro ao chamar requestPairingCode:`, pairingError);
      console.error(`❌ [PAIRING] Stack trace:`, (pairingError as Error).stack);
      throw pairingError;
    }
  } catch (error) {
    console.error(`📲 [PAIRING] Erro geral ao solicitar código:`, error);
    console.error(`📲 [PAIRING] Tipo de erro:`, typeof error);
    console.error(`📲 [PAIRING] Mensagem:`, (error as Error).message);
    
    // Limpar sessão em caso de erro
    sessions.delete(userId);
    
    return null;
  } finally {
    // Remover da fila de pendentes
    pendingPairingRequests.delete(userId);
  }
  })();
  
  // Adicionar à fila de pendentes
  pendingPairingRequests.set(userId, requestPromise);
  
  return requestPromise;
}

// ═══════════════════════════════════════════════════════════════════════
// 📤 ENVIAR MENSAGEM VIA WHATSAPP DO ADMIN
// ═══════════════════════════════════════════════════════════════════════

export async function sendAdminMessage(
  toNumber: string, 
  text: string,
  media?: {
    type: "image" | "audio" | "video" | "document";
    buffer: Buffer;
    mimetype: string;
    filename?: string;
    caption?: string;
  }
): Promise<boolean> {
  try {
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');
    
    if (!adminUser) {
      console.error("[ADMIN MSG] Admin não encontrado");
      return false;
    }
    
    const adminSession = adminSessions.get(adminUser.id);
    
    if (!adminSession?.socket) {
      console.error("[ADMIN MSG] Sessão do admin não encontrada");
      return false;
    }
    
    const cleanNumber = toNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@${DEFAULT_JID_SUFFIX}`;
    
    if (media) {
      // Enviar mídia
      switch (media.type) {
        case "image":
          await adminSession.socket.sendMessage(jid, {
            image: media.buffer,
            caption: media.caption || text,
            mimetype: media.mimetype,
          });
          break;
        case "audio":
          await adminSession.socket.sendMessage(jid, {
            audio: media.buffer,
            mimetype: media.mimetype,
            ptt: true, // Enviar como áudio de voz
          });
          break;
        case "video":
          await adminSession.socket.sendMessage(jid, {
            video: media.buffer,
            caption: media.caption || text,
            mimetype: media.mimetype,
          });
          break;
        case "document":
          await adminSession.socket.sendMessage(jid, {
            document: media.buffer,
            fileName: media.filename || "documento",
            mimetype: media.mimetype,
          });
          break;
      }
    } else {
      // Enviar apenas texto
      await adminSession.socket.sendMessage(jid, { text });
    }
    
    console.log(`✅ [ADMIN MSG] Mensagem enviada para ${cleanNumber}`);
    return true;
  } catch (error) {
    console.error("[ADMIN MSG] Erro ao enviar mensagem:", error);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔁 INTEGRAÇÃO: FOLLOW-UPS / AGENDAMENTOS → ENVIO PELO WHATSAPP DO ADMIN
// ═══════════════════════════════════════════════════════════════════════

registerFollowUpCallback(async (phoneNumber: string, context: string) => {
  try {
    const { generateFollowUpResponse } = await import("./adminAgentService");
    const text = await generateFollowUpResponse(phoneNumber, context);
    if (!text?.trim()) return { success: false, error: "Mensagem vazia gerada" };
    await sendAdminMessage(phoneNumber, text);
    return { success: true, message: text };
  } catch (error) {
    console.error("[FOLLOW-UP] Erro ao executar callback de follow-up:", error);
    return { success: false, error: String(error) };
  }
});

registerScheduledContactCallback(async (phoneNumber: string, reason: string) => {
  try {
    const { generateScheduledContactResponse } = await import("./adminAgentService");
    const text = await generateScheduledContactResponse(phoneNumber, reason);
    if (!text?.trim()) return;
    await sendAdminMessage(phoneNumber, text);
  } catch (error) {
    console.error("[AGENDAMENTO] Erro ao executar callback de agendamento:", error);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
// 🔄 HEALTH CHECK MONITOR - RECONEXÃO AUTOMÁTICA DE SESSÕES
// ═══════════════════════════════════════════════════════════════════════════════
// Este sistema verifica periodicamente se as conexões do WhatsApp estão saudáveis.
// Se detectar que uma conexão está marcada como "conectada" no banco mas não tem
// socket ativo na memória, tenta reconectar automaticamente.
//
// Intervalo: A cada 5 minutos (300.000ms)
// Isso resolve problemas de:
// - Desconexões silenciosas por timeout de rede
// - Perda de conexão durante restarts do container
// - Sessões "zumbis" no banco de dados
// ═══════════════════════════════════════════════════════════════════════════════

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
let healthCheckInterval: NodeJS.Timeout | null = null;

async function connectionHealthCheck(): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Não executar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    return;
  }
  
  console.log(`\n🔍 [HEALTH CHECK] ═══════════════════════════════════════════`);
  console.log(`🔍 [HEALTH CHECK] Iniciando verificação de conexões...`);
  console.log(`🔍 [HEALTH CHECK] Timestamp: ${new Date().toISOString()}`);
  
  try {
    // 1. Verificar conexões de usuários
    const connections = await storage.getAllConnections();
    let reconnectedUsers = 0;
    let healthyUsers = 0;
    let disconnectedUsers = 0;
    
    for (const connection of connections) {
      if (!connection.userId) continue;
      
      const isDbConnected = connection.isConnected;
      const session = sessions.get(connection.userId);
      const hasActiveSocket = session?.socket?.user !== undefined;
      
      if (isDbConnected && !hasActiveSocket) {
        // 🚨 Conexão "zumbi" detectada - DB diz conectado mas não tem socket
        console.log(`⚠️ [HEALTH CHECK] Conexão zumbi detectada: ${connection.userId}`);
        console.log(`   📊 DB: isConnected=${isDbConnected}, Socket: ${hasActiveSocket ? 'ATIVO' : 'INATIVO'}`);
        
        // Verificar se há arquivos de auth para restaurar
        const userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(userAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diretório não existe
        }
        
        if (hasAuthFiles) {
          console.log(`🔄 [HEALTH CHECK] Tentando reconectar ${connection.userId}...`);
          try {
            await connectWhatsApp(connection.userId);
            reconnectedUsers++;
            console.log(`✅ [HEALTH CHECK] ${connection.userId} reconectado com sucesso!`);
          } catch (error) {
            console.error(`❌ [HEALTH CHECK] Falha ao reconectar ${connection.userId}:`, error);
            // Marcar como desconectado no banco para evitar loops
            await storage.updateConnection(connection.id, {
              isConnected: false,
              qrCode: null,
            });
            disconnectedUsers++;
          }
        } else {
          console.log(`⏹️ [HEALTH CHECK] ${connection.userId} sem arquivos de auth - marcando como desconectado`);
          await storage.updateConnection(connection.id, {
            isConnected: false,
            qrCode: null,
          });
          disconnectedUsers++;
        }
      } else if (isDbConnected && hasActiveSocket) {
        healthyUsers++;
      }
    }
    
    // 2. Verificar conexões de admin
    const allAdmins = await storage.getAllAdmins();
    let reconnectedAdmins = 0;
    let healthyAdmins = 0;
    
    for (const admin of allAdmins) {
      const adminConnection = await storage.getAdminWhatsappConnection(admin.id);
      if (!adminConnection) continue;
      
      const isDbConnected = adminConnection.isConnected;
      const adminSession = adminSessions.get(admin.id);
      const hasActiveSocket = adminSession?.socket?.user !== undefined;
      
      if (isDbConnected && !hasActiveSocket) {
        console.log(`⚠️ [HEALTH CHECK] Admin conexão zumbi: ${admin.id}`);
        
        const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${admin.id}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(adminAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diretório não existe
        }
        
        if (hasAuthFiles) {
          console.log(`🔄 [HEALTH CHECK] Tentando reconectar admin ${admin.id}...`);
          try {
            await connectAdminWhatsApp(admin.id);
            reconnectedAdmins++;
            console.log(`✅ [HEALTH CHECK] Admin ${admin.id} reconectado!`);
          } catch (error) {
            console.error(`❌ [HEALTH CHECK] Falha ao reconectar admin ${admin.id}:`, error);
            await storage.updateAdminWhatsappConnection(admin.id, {
              isConnected: false,
              qrCode: null,
            });
          }
        } else {
          await storage.updateAdminWhatsappConnection(admin.id, {
            isConnected: false,
            qrCode: null,
          });
        }
      } else if (isDbConnected && hasActiveSocket) {
        healthyAdmins++;
      }
    }
    
    console.log(`\n📊 [HEALTH CHECK] Resumo:`);
    console.log(`   👥 Usuários: ${healthyUsers} saudáveis, ${reconnectedUsers} reconectados, ${disconnectedUsers} desconectados`);
    console.log(`   👤 Admins: ${healthyAdmins} saudáveis, ${reconnectedAdmins} reconectados`);
    console.log(`🔍 [HEALTH CHECK] ═══════════════════════════════════════════\n`);
    
  } catch (error) {
    console.error(`❌ [HEALTH CHECK] Erro no health check:`, error);
  }
}

export function startConnectionHealthCheck(): void {
  // 🛡️ MODO DESENVOLVIMENTO: Não iniciar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("⚠️ [HEALTH CHECK] Desabilitado em modo desenvolvimento");
    return;
  }
  
  if (healthCheckInterval) {
    console.log("⚠️ [HEALTH CHECK] Já está rodando");
    return;
  }
  
  console.log(`\n🔄 [HEALTH CHECK] Iniciando monitor de conexões...`);
  console.log(`   ⏱️ Intervalo: ${HEALTH_CHECK_INTERVAL_MS / 1000 / 60} minutos`);
  
  // Executar primeiro check após 30 segundos (dar tempo para restaurações iniciais)
  setTimeout(() => {
    connectionHealthCheck();
  }, 30000);
  
  // Agendar checks periódicos
  healthCheckInterval = setInterval(() => {
    connectionHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
  
  console.log(`✅ [HEALTH CHECK] Monitor iniciado com sucesso!\n`);
}

export function stopConnectionHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("⏹️ [HEALTH CHECK] Monitor parado");
  }
}

// Exportar função para check manual (útil para debug)
export { connectionHealthCheck };


