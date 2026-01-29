import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
  downloadMediaMessage,
  jidNormalizedUser,
  jidDecode,
  makeCacheableSignalKeyStore,
  Browsers,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import { registerWhatsAppSession, unregisterWhatsAppSession } from "./whatsappSender";
import { storage } from "./storage";
import WebSocket from "ws";
import { generateAIResponse, type AIResponseResult, type AIResponseOptions } from "./aiAgent";
import { executeMediaActions, downloadMediaAsBuffer } from "./mediaService";
import { registerFollowUpCallback, registerScheduledContactCallback, followUpService } from "./followUpService";
import { userFollowUpService } from "./userFollowUpService";
import { supabase } from "./supabaseAuth";
import { messageQueueService } from "./messageQueueService";
import { db } from "./db";
import { conversations } from "@shared/schema";
import { eq } from "drizzle-orm";
import { uploadMediaToStorage } from "./mediaStorageService";
import { processAudioResponseForAgent } from "./audioResponseService";
// 🆕 ANTI-REENVIO: Importar serviço de deduplicação para proteção contra instabilidade
import { canProcessIncomingMessage, canSendMessage, getDeduplicationStats, MessageType, MessageSource } from "./messageDeduplicationService";
// 🆕 v4.0 ANTI-BAN: Serviço de proteção contra bloqueio (rate limiting, safe mode, etc)
import { antiBanProtectionService } from "./antiBanProtectionService";

// 🚨 SISTEMA DE RECUPERAÇÃO DE MENSAGENS PENDENTES
// Resolve problema de mensagens perdidas durante instabilidade/deploys Railway
import { 
  pendingMessageRecoveryService,
  saveIncomingMessage,
  markMessageAsProcessed,
  markMessageAsFailed,
  startMessageRecovery,
  logConnectionDisconnection,
  getRecoveryStats,
  registerMessageProcessor 
} from "./pendingMessageRecoveryService";

// -----------------------------------------------------------------------
// ?? SISTEMA DE CACHE DE MENSAGENS PARA RETRY (FIX "AGUARDANDO MENSAGEM")
// -----------------------------------------------------------------------
// O WhatsApp mostra "Aguardando para carregar mensagem" quando:
// 1. A mensagem falhou na decripta��o
// 2. O Baileys precisa reenviar a mensagem mas n�o tem o conte�do original
// 
// SOLU��O: Armazenar mensagens enviadas em cache para que o Baileys possa
// recuper�-las via getMessage() quando precisar fazer retry.
// 
// Cache TTL: 24 horas (mensagens mais antigas s�o removidas automaticamente)
// -----------------------------------------------------------------------
interface CachedMessage {
  message: proto.IMessage;
  timestamp: number;
}

// Cache global de mensagens por userId
const messageCache = new Map<string, Map<string, CachedMessage>>();

// TTL do cache: 24 horas
const MESSAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Fun��o para obter o cache de um usu�rio espec�fico
function getUserMessageCache(userId: string): Map<string, CachedMessage> {
  let cache = messageCache.get(userId);
  if (!cache) {
    cache = new Map<string, CachedMessage>();
    messageCache.set(userId, cache);
  }
  return cache;
}

// Fun��o para armazenar mensagem no cache
function cacheMessage(userId: string, messageId: string, message: proto.IMessage): void {
  const cache = getUserMessageCache(userId);
  cache.set(messageId, {
    message,
    timestamp: Date.now(),
  });
  console.log(`?? [MSG CACHE] Armazenada mensagem ${messageId} para user ${userId.substring(0, 8)}... (cache size: ${cache.size})`);
}

// Fun��o para recuperar mensagem do cache
function getCachedMessage(userId: string, messageId: string): proto.IMessage | undefined {
  const cache = getUserMessageCache(userId);
  const cached = cache.get(messageId);
  
  if (!cached) {
    console.log(`?? [MSG CACHE] Mensagem ${messageId} N�O encontrada no cache para user ${userId.substring(0, 8)}...`);
    return undefined;
  }
  
  // Verificar se expirou
  if (Date.now() - cached.timestamp > MESSAGE_CACHE_TTL_MS) {
    cache.delete(messageId);
    console.log(`? [MSG CACHE] Mensagem ${messageId} expirada e removida do cache`);
    return undefined;
  }
  
  console.log(`? [MSG CACHE] Mensagem ${messageId} recuperada do cache para retry`);
  return cached.message;
}

// Limpar mensagens expiradas do cache periodicamente (a cada 30 minutos)
setInterval(() => {
  const now = Date.now();
  let totalCleaned = 0;
  
  for (const [userId, cache] of messageCache.entries()) {
    for (const [msgId, cached] of cache.entries()) {
      if (now - cached.timestamp > MESSAGE_CACHE_TTL_MS) {
        cache.delete(msgId);
        totalCleaned++;
      }
    }
    // Remover caches vazios
    if (cache.size === 0) {
      messageCache.delete(userId);
    }
  }
  
  if (totalCleaned > 0) {
    console.log(`📦 [MSG CACHE] Limpeza periódica: ${totalCleaned} mensagens expiradas removidas`);
  }
}, 30 * 60 * 1000);

// -----------------------------------------------------------------------
// 🔄 SISTEMA DE VERIFICAÇÃO DE MENSAGENS NÃO PROCESSADAS
// -----------------------------------------------------------------------
// NOTA: A implementação real está mais abaixo no arquivo, após as declarações
// de pendingResponses, conversationsBeingProcessed, etc.
// -----------------------------------------------------------------------

// Map para rastrear última verificação por userId (evita spam)
const lastMissedMessageCheck = new Map<string, number>();

// Map para rastrear mensagens já detectadas como faltantes (evita reprocessar)
const detectedMissedMessages = new Set<string>(); // key: conversationId_messageId

// Placeholder - será substituído pela função real mais abaixo
let checkForMissedMessages: (session: WhatsAppSession) => Promise<void> = async () => {};

// Flag para controlar se o polling foi iniciado
let missedMessagePollingStarted = false;

// Função para iniciar o polling (será chamada depois que sessions for declarado)
function startMissedMessagePolling() {
  // ?? MODO DEV: Pular polling de missed messages se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`⏸️ [MISSED MSG] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (missedMessagePollingStarted) return;
  missedMessagePollingStarted = true;
  
  // Iniciar polling de mensagens não processadas a cada 45 segundos
  setInterval(async () => {
    // Verificar se sessions está disponível
    if (typeof sessions === 'undefined') return;
    
    for (const [userId, session] of sessions.entries()) {
      if (session.isConnected && session.socket) {
        try {
          await checkForMissedMessages(session);
        } catch (error) {
          // Silenciar erros individuais
        }
      }
    }
  }, 45 * 1000);
  
  console.log(`🔄 [MISSED MSG] Polling de mensagens não processadas iniciado (a cada 45s)`);
}

// -----------------------------------------------------------------------
// ✅ UPLOAD DE MÍDIA PARA STORAGE (Economia de Egress)
// -----------------------------------------------------------------------
// Em vez de salvar base64 no banco (que consome muito egress),
// fazemos upload para o Supabase Storage (usa cached egress via CDN).
// 
// Economia estimada: ~90% de redu��o no egress de m�dia
// -----------------------------------------------------------------------

/**
 * Faz upload de m�dia para Storage ou cria URL base64 como fallback
 * @param buffer Buffer da m�dia
 * @param mimeType Tipo MIME (ex: image/jpeg, audio/ogg)
 * @param userId ID do usu�rio
 * @param conversationId ID da conversa (opcional)
 * @returns URL do storage ou data URL base64
 */
async function uploadMediaOrFallback(
  buffer: Buffer,
  mimeType: string,
  userId: string,
  conversationId?: string
): Promise<string | null> {
  try {
    const result = await uploadMediaToStorage(buffer, mimeType, userId, conversationId);
    if (result && result.url) {
      console.log(`📤 [STORAGE] Mídia enviada para Storage: ${result.url.substring(0, 80)}...`);
      return result.url;
    } else {
      console.warn(`⚠️ [STORAGE] Upload retornou resultado inválido:`, result);
    }
  } catch (error) {
    console.error(`❌ [STORAGE] Erro ao enviar para Storage:`, error);
  }
  
  // SEM fallback base64 para evitar egress excessivo!
  console.warn(`⚠️ [STORAGE] Upload falhou, mídia não será salva (sem fallback base64)`);
  return null;
}

// -----------------------------------------------------------------------
// ???? SAFE MODE: Prote��o Anti-Bloqueio para Clientes
// -----------------------------------------------------------------------
// Esta funcionalidade � ativada pelo admin quando um cliente tomou bloqueio
// do WhatsApp e est� reconectando. Ao reconectar com Safe Mode ativo:
// 1. Zera a fila de mensagens pendentes
// 2. Desativa todos os follow-ups programados
// 3. Come�a do zero para evitar novo bloqueio
// -----------------------------------------------------------------------

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
  console.log(`\n??? ---------------------------------------------------------------`);
  console.log(`??? [SAFE MODE] Iniciando limpeza para usu�rio ${userId.substring(0, 8)}...`);
  console.log(`??? ---------------------------------------------------------------\n`);

  let messagesCleared = 0;
  let followupsCleared = 0;

  try {
    // 1. Limpar fila de mensagens pendentes
    const queueResult = messageQueueService.clearUserQueue(userId);
    messagesCleared = queueResult.cleared;
    console.log(`??? [SAFE MODE] ? Fila de mensagens: ${messagesCleared} mensagens removidas`);

    // 2. Desativar follow-ups de todas as conversas deste usu�rio
    // Atualizar todas as conversas para: followupActive = false, nextFollowupAt = null
    const followupResult = await db
      .update(conversations)
      .set({
        followupActive: false,
        nextFollowupAt: null,
        followupStage: 0,
        followupDisabledReason: 'Safe Mode - limpeza ap�s bloqueio do WhatsApp',
        updatedAt: new Date(),
      })
      .where(eq(conversations.connectionId, connectionId))
      .returning({ id: conversations.id });

    followupsCleared = followupResult.length;
    console.log(`??? [SAFE MODE] ? Follow-ups: ${followupsCleared} conversas com follow-up desativado`);

    // 3. Registrar data/hora da �ltima limpeza
    await storage.updateConnection(connectionId, {
      safeModeLastCleanupAt: new Date(),
    });

    console.log(`\n??? [SAFE MODE] ? Limpeza conclu�da com sucesso!`);
    console.log(`??? [SAFE MODE] ?? Resumo:`);
    console.log(`???   - Mensagens removidas da fila: ${messagesCleared}`);
    console.log(`???   - Follow-ups desativados: ${followupsCleared}`);
    console.log(`???   - Cliente pode usar o WhatsApp normalmente agora`);
    console.log(`??? ---------------------------------------------------------------\n`);

    return {
      success: true,
      messagesCleared,
      followupsCleared,
    };
  } catch (error: any) {
    console.error(`??? [SAFE MODE] ? Erro na limpeza:`, error);
    return {
      success: false,
      messagesCleared,
      followupsCleared,
      error: error.message,
    };
  }
}

// -----------------------------------------------------------------------
// 🔄 WRAPPER: uploadMediaSimple - Compatibilidade com código legado
// A função importada uploadMediaToStorage de mediaStorageService.ts retorna 
// { url, path, size } e precisa de (buffer, mimeType, userId, conversationId?)
// Esta wrapper aceita (buffer, mimeType, fileName) e retorna apenas a URL
// -----------------------------------------------------------------------
async function uploadMediaSimple(
  buffer: Buffer, 
  mimeType: string, 
  fileName?: string
): Promise<string | null> {
  try {
    // Usar "system" como userId genérico para uploads sem contexto de usuário
    const result = await uploadMediaToStorage(buffer, mimeType, "system");
    if (result && result.url) {
      console.log(`✅ [STORAGE] Upload concluído: ${result.url.substring(0, 80)}...`);
      return result.url;
    }
    console.warn(`⚠️ [STORAGE] Upload retornou sem URL`);
    return null;
  } catch (error) {
    console.error(`❌ [STORAGE] Erro no upload:`, error);
    return null;
  }
}

// Cache manual de contatos para mapear @lid ? phoneNumber
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

// ?? Set para rastrear IDs de mensagens enviadas pelo agente/usu�rio via sendMessage
// Evita duplicatas quando Baileys dispara evento fromMe ap�s socket.sendMessage()
const agentMessageIds = new Set<string>();

// ?? Fun��o exportada para registrar messageIds de m�dias enviadas pelo agente
// Usado pelo mediaService para evitar que handleOutgoingMessage pause a IA incorretamente
export function registerAgentMessageId(messageId: string): void {
  if (messageId) {
    agentMessageIds.add(messageId);
    console.log(`?? [AGENT MSG] Registrado messageId do agente: ${messageId}`);
  }
}

// ?? Map para rastrear solicita��es de c�digo de pareamento em andamento
// Evita m�ltiplas solicita��es simult�neas para o mesmo usu�rio
const pendingPairingRequests = new Map<string, Promise<string | null>>();

// ?? Map para rastrear conex�es em andamento
// Evita m�ltiplas tentativas de conex�o simult�neas para o mesmo usu�rio
const pendingConnections = new Map<string, Promise<void>>();

// ?? Map para rastrear tentativas de reconex�o e evitar loops infinitos
interface ReconnectAttempt {
  count: number;
  lastAttempt: number;
}
const reconnectAttempts = new Map<string, ReconnectAttempt>();
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_COOLDOWN_MS = 30000; // 30 segundos entre ciclos de reconexão

// 🔄 Iniciar polling de mensagens não processadas
// (variáveis necessárias já foram declaradas acima)
startMissedMessagePolling();

// 🚨 SISTEMA DE RECUPERAÇÃO: Registrar callback de processamento
// Este callback será usado pelo pendingMessageRecoveryService para reprocessar
// mensagens que não foram processadas durante instabilidade/deploys
// NOTA: O registerMessageProcessor já foi importado no topo do arquivo junto
// com outras funções do pendingMessageRecoveryService.
// A função handleIncomingMessage precisa estar definida primeiro
// O registro é feito no final do arquivo via setTimeout para garantir ordem

// -----------------------------------------------------------------------
// 📇 CACHE DE AGENDA - OTIMIZAÇÃO PARA ENVIO EM MASSA
// -----------------------------------------------------------------------
// Contatos do WhatsApp s�o armazenados APENAS em mem�ria (n�o no banco)
// Isso evita crescimento exponencial do Supabase e otimiza Egress/Disk IO
// Cliente sincroniza sob demanda quando precisa usar Envio em Massa
// -----------------------------------------------------------------------
interface AgendaContact {
  id: string;
  phoneNumber: string;
  name: string;
  lid?: string;
}

interface AgendaCacheEntry {
  contacts: AgendaContact[];
  syncedAt: Date;
  expiresAt: Date;
  status: 'syncing' | 'ready' | 'error';
  error?: string;
}

// Cache global de contatos da agenda (expira em 2 HORAS)
// N�o deixa o site lento - � apenas um Map em mem�ria
// Impacto: ~1KB por 1000 contatos (muito leve)
const agendaContactsCache = new Map<string, AgendaCacheEntry>();
const AGENDA_CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 HORAS (antes era 30 min)

// Exportar fun��o para obter contatos da agenda do cache
export function getAgendaContacts(userId: string): AgendaCacheEntry | undefined {
  const cached = agendaContactsCache.get(userId);
  if (cached && cached.expiresAt > new Date()) {
    return cached;
  }
  // Cache expirado, remover
  if (cached) {
    agendaContactsCache.delete(userId);
  }
  return undefined;
}

// Fun��o para salvar contatos no cache (chamada quando contacts.upsert dispara)
function saveAgendaToCache(userId: string, contacts: AgendaContact[]): void {
  const now = new Date();
  agendaContactsCache.set(userId, {
    contacts,
    syncedAt: now,
    expiresAt: new Date(now.getTime() + AGENDA_CACHE_TTL_MS),
    status: 'ready',
  });
  console.log(`?? [AGENDA CACHE] Salvou ${contacts.length} contatos para user ${userId} (expira em 2 HORAS)`);
}

// Fun��o para marcar sync como iniciado
export function markAgendaSyncing(userId: string): void {
  agendaContactsCache.set(userId, {
    contacts: [],
    syncedAt: new Date(),
    expiresAt: new Date(Date.now() + AGENDA_CACHE_TTL_MS),
    status: 'syncing',
  });
}

// Fun��o para marcar sync como erro
export function markAgendaError(userId: string, error: string): void {
  agendaContactsCache.set(userId, {
    contacts: [],
    syncedAt: new Date(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 min em caso de erro
    status: 'error',
    error,
  });
}

// ===== NOVA: Fun��o para popular agenda do cache da sess�o =====
// Chamada quando usu�rio clica em "Sincronizar Agenda" e n�o tem cache
// Busca contatos do contactsCache da sess�o (j� carregados do WhatsApp)
export function syncAgendaFromSessionCache(userId: string): { success: boolean; count: number; message: string } {
  const session = sessions.get(userId);
  
  if (!session) {
    return {
      success: false,
      count: 0,
      message: '? WhatsApp n�o est� conectado. Conecte primeiro para sincronizar a agenda.',
    };
  }
  
  if (!session.contactsCache || session.contactsCache.size === 0) {
    // Cache vazio - salvar com 0 contatos e status ready
    // Isso evita ficar eternamente em 'syncing'
    saveAgendaToCache(userId, []);
    console.log(`?? [AGENDA SYNC] Cache da sess�o est� vazio - salvou cache com 0 contatos`);
    return {
      success: true,
      count: 0,
      message: '?? Nenhum contato encontrado no momento. Os contatos ser�o carregados automaticamente quando chegarem do WhatsApp.',
    };
  }
  
  console.log(`?? [AGENDA SYNC DEBUG] session.contactsCache tem ${session.contactsCache.size} entradas`);
  
  // Converter contactsCache para AgendaContact[]
  const agendaContacts: AgendaContact[] = [];
  const seenPhones = new Set<string>();
  let skippedCount = 0;
  
  session.contactsCache.forEach((contact, key) => {
    // Extrair phoneNumber do contact ou do key
    let phoneNumber = contact.phoneNumber || null;
    
    // Se n�o tem phoneNumber, tentar extrair do contact.id
    if (!phoneNumber && contact.id) {
      // Tentar formato: 5511999887766@s.whatsapp.net
      const match1 = contact.id.match(/^(\d{8,15})@s\.whatsapp\.net$/);
      if (match1) {
        phoneNumber = match1[1];
      } else {
        // Tentar formato gen�rico: n�meros@qualquercoisa
        const match2 = contact.id.match(/^(\d+)@/);
        if (match2 && match2[1].length >= 8) {
          phoneNumber = match2[1];
        }
      }
    }
    
    // Se ainda n�o tem, tentar extrair da key do Map
    if (!phoneNumber && key) {
      const match1 = key.match(/^(\d{8,15})@s\.whatsapp\.net$/);
      if (match1) {
        phoneNumber = match1[1];
      } else {
        const match2 = key.match(/^(\d+)@/);
        if (match2 && match2[1].length >= 8) {
          phoneNumber = match2[1];
        }
      }
    }
    
    // Evitar duplicatas e validar n�mero
    if (phoneNumber && phoneNumber.length >= 8 && !seenPhones.has(phoneNumber)) {
      seenPhones.add(phoneNumber);
      agendaContacts.push({
        id: contact.id || key,
        phoneNumber: phoneNumber,
        name: contact.name || '',
        lid: contact.lid,
      });
    } else {
      skippedCount++;
      if (skippedCount <= 5) {
        console.log(`?? [AGENDA SYNC DEBUG] Pulou contato - id: ${contact.id}, key: ${key}, phoneNumber: ${contact.phoneNumber}, name: ${contact.name}`);
      }
    }
  });
  
  console.log(`?? [AGENDA SYNC DEBUG] Processou ${agendaContacts.length} contatos, pulou ${skippedCount}`);
  
  // SEMPRE salvar no cache, mesmo que vazio - isso evita ficar preso em 'syncing'
  saveAgendaToCache(userId, agendaContacts);
  
  if (agendaContacts.length > 0) {
    console.log(`?? [AGENDA SYNC] Populou cache com ${agendaContacts.length} contatos da sess�o`);
    return {
      success: true,
      count: agendaContacts.length,
      message: `? ${agendaContacts.length} contatos carregados da agenda!`,
    };
  }
  
  // Se processou mas n�o encontrou nenhum, retornar ready com 0 contatos
  console.log(`?? [AGENDA SYNC] Nenhum contato encontrado no cache da sess�o (size: ${session.contactsCache.size})`);
  return {
    success: true,
    count: 0,
    message: '?? Nenhum contato encontrado. Os contatos ser�o carregados automaticamente quando chegarem do WhatsApp.',
  };
}

// ?? MODO DESENVOLVIMENTO: Desabilita processamento de mensagens em localhost
// �til quando Railway est� rodando em produ��o e voc� quer desenvolver sem conflitos
// Defina DISABLE_WHATSAPP_PROCESSING=true no .env para ativar
const DISABLE_MESSAGE_PROCESSING = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';

if (DISABLE_MESSAGE_PROCESSING) {
  console.log(`\n?? [DEV MODE] ?????????????????????????????????????????????????????`);
  console.log(`?? [DEV MODE] PROCESSAMENTO DE MENSAGENS WHATSAPP DESABILITADO`);
  console.log(`?? [DEV MODE] Isso evita conflitos com servidor de produ��o (Railway)`);
  console.log(`?? [DEV MODE] Para reativar, remova DISABLE_WHATSAPP_PROCESSING do .env`);
  console.log(`?? [DEV MODE] ?????????????????????????????????????????????????????\n`);
}

// ?? SISTEMA DE ACUMULA��O DE MENSAGENS
// Rastreia timeouts pendentes e mensagens acumuladas por conversa
interface PendingResponse {
  timeout: NodeJS.Timeout;
  messages: string[];
  conversationId: string;
  userId: string;
  contactNumber: string;
  jidSuffix: string;
  startTime: number;
  isProcessing?: boolean; // ?? FLAG ANTI-DUPLICA��O
}
const pendingResponses = new Map<string, PendingResponse>(); // key: conversationId

// 🔴 ANTI-DUPLICAÇÃO: Set para rastrear conversas em processamento
// Evita que múltiplos timeouts processem a mesma conversa simultaneamente
const conversationsBeingProcessed = new Set<string>();

// -----------------------------------------------------------------------
// 🔄 IMPLEMENTAÇÃO REAL: checkForMissedMessages
// -----------------------------------------------------------------------
// Agora que pendingResponses e conversationsBeingProcessed foram declarados,
// podemos implementar a função real.
// -----------------------------------------------------------------------
checkForMissedMessages = async function(session: WhatsAppSession): Promise<void> {
  if (!session.socket || !session.isConnected) return;
  
  const { userId, connectionId } = session;
  
  // Rate limit: verificar apenas a cada 45 segundos por sessão
  const lastCheck = lastMissedMessageCheck.get(userId) || 0;
  if (Date.now() - lastCheck < 45000) return;
  lastMissedMessageCheck.set(userId, Date.now());
  
  try {
    // 1. Buscar conversas com mensagens recentes (últimos 5 minutos)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const { pool } = await import("./db");
    const result = await pool.query(`
      SELECT 
        c.id as conversation_id,
        c.contact_number,
        c.jid_suffix,
        m.id as message_id,
        m.text,
        m.timestamp,
        m.from_me
      FROM conversations c
      JOIN messages m ON m.conversation_id = c.id
      WHERE c.connection_id = $1
        AND m.timestamp > $2
        AND m.from_me = false
        AND NOT EXISTS (
          SELECT 1 FROM messages m2 
          WHERE m2.conversation_id = c.id 
            AND m2.from_me = true 
            AND m2.timestamp > m.timestamp
        )
        AND NOT EXISTS (
          SELECT 1 FROM agent_disabled_conversations adc
          WHERE adc.conversation_id = c.id
        )
      ORDER BY m.timestamp DESC
      LIMIT 10
    `, [connectionId, fiveMinutesAgo.toISOString()]);
    
    if (result.rows.length === 0) return;
    
    // 2. Verificar config do agente
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) return;
    
    // 3. Processar mensagens não respondidas
    for (const row of result.rows) {
      const cacheKey = `${row.conversation_id}_${row.message_id}`;
      
      // Evitar reprocessar mensagens já detectadas
      if (detectedMissedMessages.has(cacheKey)) continue;
      detectedMissedMessages.add(cacheKey);
      
      // Limpar cache antigo (manter últimas 1000 entradas)
      if (detectedMissedMessages.size > 1000) {
        const entries = Array.from(detectedMissedMessages);
        entries.slice(0, 500).forEach(e => detectedMissedMessages.delete(e));
      }
      
      // Verificar se já tem resposta pendente
      if (pendingResponses.has(row.conversation_id)) {
        console.log(`🔄 [MISSED MSG] ${row.contact_number} - Já tem resposta pendente`);
        continue;
      }
      
      // Verificar se está sendo processada
      if (conversationsBeingProcessed.has(row.conversation_id)) {
        console.log(`🔄 [MISSED MSG] ${row.contact_number} - Em processamento`);
        continue;
      }
      
      console.log(`\n🚨 [MISSED MSG] MENSAGEM NÃO PROCESSADA DETECTADA!`);
      console.log(`   📱 Contato: ${row.contact_number}`);
      console.log(`   💬 Mensagem: "${(row.text || '[mídia]').substring(0, 50)}..."`);
      console.log(`   ⏰ Enviada em: ${row.timestamp}`);
      console.log(`   🔄 Triggando resposta da IA...`);
      
      // Agendar resposta com delay
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      
      const pending: PendingResponse = {
        timeout: null as any,
        messages: [row.text || '[mídia recebida]'],
        conversationId: row.conversation_id,
        userId,
        contactNumber: row.contact_number,
        jidSuffix: row.jid_suffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
      };
      
      pending.timeout = setTimeout(async () => {
        console.log(`🚀 [MISSED MSG] Processando resposta para ${row.contact_number}`);
        await processAccumulatedMessages(pending);
      }, responseDelaySeconds * 1000);
      
      pendingResponses.set(row.conversation_id, pending);
      console.log(`   ✅ Resposta agendada em ${responseDelaySeconds}s\n`);
    }
    
  } catch (error) {
    // Silenciar erros para não poluir logs
    if ((error as any).code !== 'ECONNREFUSED') {
      console.error(`❌ [MISSED MSG] Erro na verificação:`, error);
    }
  }
};

// 🔴 ANTI-DUPLICAÇÃO: Cache de mensagens recentes enviadas (últimos 5 minutos)
// Evita enviar mensagens id�nticas em sequ�ncia
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

// ?? Fun��o para verificar se mensagem � duplicata recente
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

// ?? Fun��o para registrar mensagem enviada
function registerSentMessageCache(conversationId: string, text: string): void {
  const recent = recentlySentMessages.get(conversationId) || [];
  recent.push({ text, timestamp: Date.now() });
  // Manter apenas �ltimas 10 mensagens
  if (recent.length > 10) recent.shift();
  recentlySentMessages.set(conversationId, recent);
}

// ?? SISTEMA DE ACUMULA��O (ADMIN AUTO-ATENDIMENTO)
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

// ?? Set para rastrear conversas j� verificadas na sess�o atual (evita reprocessamento)
const checkedConversationsThisSession = new Set<string>();

// -----------------------------------------------------------------------
// 🛡️ SISTEMA ANTI-BLOQUEIO v4.0 - Registro do Callback de Envio Real
// -----------------------------------------------------------------------
// Esta função é chamada pelo messageQueueService para enviar mensagens reais
// O callback permite que a fila controle o timing entre mensagens
// 🆕 v4.0: Agora simula "digitando..." antes de enviar para parecer mais humano
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

  // 🆕 v4.0 ANTI-BAN: Simular "digitando..." antes de enviar
  // Isso faz a conversa parecer mais natural e humana
  try {
    const typingDuration = antiBanProtectionService.calculateTypingDuration(text.length);
    
    // Enviar status "composing" (digitando)
    await session.socket.sendPresenceUpdate('composing', jid);
    console.log(`🛡️ [ANTI-BAN] ⌨️ Simulando digitação por ${Math.round(typingDuration/1000)}s...`);
    
    // Aguardar tempo proporcional ao tamanho da mensagem
    await new Promise(resolve => setTimeout(resolve, typingDuration));
    
    // Enviar status "paused" (parou de digitar) antes de enviar
    await session.socket.sendPresenceUpdate('paused', jid);
    
    // Pequeno delay antes do envio real (0.5-1.5s)
    const finalDelay = 500 + Math.random() * 1000;
    await new Promise(resolve => setTimeout(resolve, finalDelay));
  } catch (err) {
    // Não falhar se não conseguir enviar status de digitação
    console.log(`🛡️ [ANTI-BAN] ⚠️ Não foi possível enviar status de digitação:`, err);
  }

  const sentMessage = await session.socket.sendMessage(jid, { text });
  
  if (sentMessage?.key.id) {
    agentMessageIds.add(sentMessage.key.id);
    
    // -----------------------------------------------------------------------
    // 🔑 CACHEAR MENSAGEM PARA getMessage() - FIX "AGUARDANDO MENSAGEM"
    // -----------------------------------------------------------------------
    // Armazenar mensagem no cache para que Baileys possa recuperar
    // em caso de falha na decriptação e necessidade de retry
    if (sentMessage.message) {
      cacheMessage(userId, sentMessage.key.id, sentMessage.message);
    } else {
      // Se por algum motivo sentMessage.message estiver undefined, criar uma estrutura simples
      cacheMessage(userId, sentMessage.key.id, { conversation: text });
    }
    
    console.log(`🛡️ [ANTI-BLOCK] ✅ Mensagem enviada - ID: ${sentMessage.key.id}`);
  }

  return sentMessage?.key.id || null;
}

// Registrar callback no messageQueueService
messageQueueService.registerSendCallback(internalSendMessageRaw);

// -----------------------------------------------------------------------
// ??? WRAPPER UNIVERSAL PARA ENVIO COM DELAY ANTI-BLOQUEIO
// -----------------------------------------------------------------------
// Esta fun��o DEVE ser usada para TODOS os envios de mensagem!
// Garante delay de 5-10s entre mensagens do MESMO WhatsApp.

/**
 * Envia qualquer tipo de mensagem respeitando a fila anti-bloqueio
 * @param queueId - ID da fila (userId para usu�rios, "admin_" + adminId para admins)
 * @param description - Descri��o do envio para logs
 * @param sendFn - Fun��o que faz o envio real
 */
async function sendWithQueue<T>(
  queueId: string,
  description: string,
  sendFn: () => Promise<T>
): Promise<T> {
  return messageQueueService.executeWithDelay(queueId, description, sendFn);
}

// -----------------------------------------------------------------------
// ?? VERIFICA��O DE MENSAGENS N�O RESPONDIDAS AO RECONECTAR
// -----------------------------------------------------------------------
// Quando o WhatsApp reconecta (ap�s desconex�o/restart), verificamos se h�
// clientes que mandaram mensagem nas �ltimas 24h e n�o foram respondidos.
// Isso resolve o problema de mensagens perdidas durante desconex�es.
// -----------------------------------------------------------------------
async function checkUnrespondedMessages(session: WhatsAppSession): Promise<void> {
  const { userId, connectionId } = session;
  
  console.log(`\n?? [UNRESPONDED CHECK] Iniciando verifica��o de mensagens n�o respondidas...`);
  console.log(`   ?? Usu�rio: ${userId}`);
  
  try {
    // 1. Verificar se o agente est� ativo
    const agentConfig = await storage.getAgentConfig(userId);
    if (!agentConfig?.isActive) {
      console.log(`?? [UNRESPONDED CHECK] Agente inativo, pulando verifica��o`);
      return;
    }
    
    // 2. Buscar todas as conversas deste usu�rio
    const allConversations = await storage.getConversationsByConnectionId(connectionId);
    
    // 3. Filtrar conversas das �ltimas 24 horas
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    const recentConversations = allConversations.filter(conv => {
      if (!conv.lastMessageTime) return false;
      const lastMsgTime = new Date(conv.lastMessageTime);
      return lastMsgTime >= twentyFourHoursAgo;
    });
    
    console.log(`?? [UNRESPONDED CHECK] ${recentConversations.length} conversas nas �ltimas 24h`);
    
    let unrespondedCount = 0;
    let processedCount = 0;
    
    for (const conversation of recentConversations) {
      // Evitar reprocessar na mesma sess�o
      if (checkedConversationsThisSession.has(conversation.id)) {
        continue;
      }
      checkedConversationsThisSession.add(conversation.id);
      
      // 4. Verificar se agente est� pausado para esta conversa
      const isDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (isDisabled) {
        continue;
      }
      
      // 5. Buscar mensagens desta conversa
      const messages = await storage.getMessagesByConversationId(conversation.id);
      if (messages.length === 0) continue;
      
      // 6. Verificar �ltima mensagem
      const lastMessage = messages[messages.length - 1];
      
      // Se �ltima mensagem � do cliente (n�o � fromMe), precisa responder
      if (!lastMessage.fromMe) {
        unrespondedCount++;
        
        // 7. Verificar se j� tem resposta pendente
        if (pendingResponses.has(conversation.id)) {
          console.log(`? [UNRESPONDED CHECK] ${conversation.contactNumber} - J� tem resposta pendente`);
          continue;
        }
        
        console.log(`?? [UNRESPONDED CHECK] ${conversation.contactNumber} - �ltima mensagem do cliente SEM RESPOSTA`);
        console.log(`   ?? Mensagem: "${(lastMessage.text || '[m�dia]').substring(0, 50)}..."`);
        console.log(`   ?? Enviada em: ${lastMessage.timestamp}`);
        
        // 8. Agendar resposta com delay para n�o sobrecarregar
        const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
        const delayForThisMessage = (processedCount * 5000) + (responseDelaySeconds * 1000); // 5s entre cada + delay normal
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages: [lastMessage.text || '[m�dia recebida]'],
          conversationId: conversation.id,
          userId,
          contactNumber: conversation.contactNumber,
          jidSuffix: conversation.jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now(),
        };
        
        pending.timeout = setTimeout(async () => {
          console.log(`?? [UNRESPONDED CHECK] Processando resposta atrasada para ${conversation.contactNumber}`);
          await processAccumulatedMessages(pending);
        }, delayForThisMessage);
        
        pendingResponses.set(conversation.id, pending);
        processedCount++;
        
        console.log(`?? [UNRESPONDED CHECK] Resposta agendada em ${Math.round(delayForThisMessage/1000)}s`);
      }
    }
    
    console.log(`\n? [UNRESPONDED CHECK] Verifica��o conclu�da:`);
    console.log(`   ?? Total conversas 24h: ${recentConversations.length}`);
    console.log(`   ? N�o respondidas: ${unrespondedCount}`);
    console.log(`   ?? Respostas agendadas: ${processedCount}\n`);
    
  } catch (error) {
    console.error(`? [UNRESPONDED CHECK] Erro na verifica��o:`, error);
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
    // Alterado padr�o de 30s para 6s conforme solicita��o
    let responseDelaySeconds = clampInt(parseInt(responseDelay?.valor || "6", 10) || 6, 1, 180);
    const typingDelayMin = clampInt(parseInt(typingMin?.valor || "2", 10) || 2, 0, 60);
    const typingDelayMax = clampInt(parseInt(typingMax?.valor || "5", 10) || 5, typingDelayMin, 120);
    const messageIntervalMin = clampInt(parseInt(intervalMin?.valor || "3", 10) || 3, 0, 120);
    const messageIntervalMax = clampInt(parseInt(intervalMax?.valor || "8", 10) || 8, messageIntervalMin, 240);

    // Se o estilo for "human", for�ar um delay menor para parecer mais natural (se estiver alto)
    const style = promptStyle?.valor || "nuclear";
    if (style === "human" && responseDelaySeconds > 10) {
      console.log(`? [ADMIN AGENT] Estilo Human detectado: Reduzindo delay de ${responseDelaySeconds}s para 6s`);
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

  console.log(`\n?? [ADMIN AGENT] Mensagem recebida de ${contactNumber}`);
  console.log(`   ?? Delay configurado: ${config.responseDelayMs}ms (${config.responseDelayMs/1000}s)`);

  // ?? FIX: Inscrever-se explicitamente para receber atualiza��es de presen�a (digitando/pausado)
  // Sem isso, o Baileys pode n�o receber os eventos 'presence.update'
  try {
    const normalizedJid = jidNormalizedUser(remoteJid);
    await socket.presenceSubscribe(normalizedJid);
    await socket.sendPresenceUpdate('available'); // For�ar status online
    console.log(`   ?? [PRESENCE] Inscrito para atualiza��es de: ${normalizedJid}`);
  } catch (err) {
    console.error(`   ? [PRESENCE] Falha ao inscrever:`, err);
  }

  const existing = pendingAdminResponses.get(key);
  if (existing) {
    if (existing.timeout) {
      clearTimeout(existing.timeout);
    }
    existing.messages.push(messageText);
    existing.generation += 1;
    console.log(`   ?? Acumulando msg ${existing.messages.length}. Reset do timer para ${config.responseDelayMs}ms`);
    existing.timeout = setTimeout(() => {
      void processAdminAccumulatedMessages({ socket, key, generation: existing.generation });
    }, config.responseDelayMs);
    return;
  }

  // Verificar se conversa j� existe no banco
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
    console.log(`   ?? Nova conversa. Timer de ${config.responseDelayMs}ms iniciado`);
  } else {
    console.log(`   ?? Conversa existente. Timer de ${config.responseDelayMs}ms iniciado`);
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
  console.log(`\n?? [ADMIN AGENT] =========== PROCESSANDO RESPOSTA ==========`);
  console.log(`   ?? Aguardou ${waitSeconds}s | ${pending.messages.length} msg(s) acumulada(s)`);
  console.log(`   ?? Cliente: ${pending.contactNumber}`);
  console.log(`   ?? Config carregada:`);
  console.log(`      - Tempo resposta: ${config.responseDelayMs}ms`);
  console.log(`      - Typing delay: ${config.typingDelayMinMs}-${config.typingDelayMaxMs}ms`);
  console.log(`      - Split chars: ${config.messageSplitChars}`);
  console.log(`      - Intervalo blocos: ${config.messageIntervalMinMs}-${config.messageIntervalMaxMs}ms`);

  try {
    // ?? RE-VERIFICAR STATUS DO AGENTE (Double Check)
    // Isso previne que mensagens acumuladas sejam enviadas se o agente foi desativado durante o delay
    // ou se a verifica��o inicial falhou.
    if (pending.conversationId) {
        const isEnabled = await storage.isAdminAgentEnabledForConversation(pending.conversationId);
        if (!isEnabled) {
            console.log(`?? [ADMIN AGENT] Agente desativado durante acumula��o para ${pending.contactNumber}. Cancelando envio.`);
            pendingAdminResponses.delete(key);
            return;
        }
    } else {
        // Fallback: Tentar buscar conversa pelo n�mero se n�o tiver ID salvo no pending
        try {
            const admins = await storage.getAllAdmins();
            if (admins.length > 0) {
                const conv = await storage.getAdminConversationByContact(admins[0].id, pending.contactNumber);
                if (conv && !conv.isAgentEnabled) {
                    console.log(`?? [ADMIN AGENT] Agente desativado (verifica��o tardia) para ${pending.contactNumber}. Cancelando envio.`);
                    pendingAdminResponses.delete(key);
                    return;
                }
            }
        } catch (err) {
            console.error("Erro na verifica��o tardia de status:", err);
        }
    }

    const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");

    // skipTriggerCheck = false para aplicar valida��o de frases gatilho no WhatsApp real
    const response = await processAdminMessage(pending.contactNumber, combinedText, undefined, undefined, false);

    // Se response � null, significa que n�o passou na valida��o de frase gatilho
    if (response === null) {
      console.log(`?? [ADMIN AGENT] Mensagem ignorada - sem frase gatilho`);
      pendingAdminResponses.delete(key);
      return;
    }

    // Se novas mensagens chegaram enquanto a IA processava, cancela este envio
    const stillCurrent = pendingAdminResponses.get(key);
    if (!stillCurrent || stillCurrent.generation !== generation) {
      console.log(`?? [ADMIN AGENT] Nova mensagem chegou durante processamento; descartando resposta antiga`);
      return;
    }

    // Delay de digita��o humanizada
    const typingDelay = randomBetween(config.typingDelayMinMs, config.typingDelayMaxMs);
    await new Promise((r) => setTimeout(r, typingDelay));

    // ?? CHECK FINAL DE PRESEN�A (Double Check)
    // Se o usu�rio come�ou a digitar durante o delay de digita��o, abortar envio
    let checkPresence = pendingAdminResponses.get(key);
    
    // L�gica de Retry para "Composing" travado (Solicitado pelo usu�rio: "logica profunda")
    // Se estiver digitando, vamos aguardar um pouco e verificar novamente
    // Isso resolve casos onde a conex�o cai e n�o recebemos o "paused"
    let retryCount = 0;
    const maxRetries = 3;
    
    while (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing') && retryCount < maxRetries) {
        console.log(`? [ADMIN AGENT] Usu�rio digitando (check final). Aguardando confirma��o... (${retryCount + 1}/${maxRetries})`);
        await new Promise(r => setTimeout(r, 5000)); // Espera 5s
        checkPresence = pendingAdminResponses.get(key);
        retryCount++;
    }

    if (checkPresence && (checkPresence.timeout !== null || checkPresence.lastKnownPresence === 'composing')) {
        // Se ainda estiver digitando ap�s retries, verificar se o status � antigo (stale)
        const lastUpdate = checkPresence.lastPresenceUpdate || 0;
        const timeSinceUpdate = Date.now() - lastUpdate;
        const STALE_THRESHOLD = 45000; // 45 segundos

        if (timeSinceUpdate > STALE_THRESHOLD) {
             console.log(`?? [ADMIN AGENT] Status 'composing' parece travado (${Math.floor(timeSinceUpdate/1000)}s). Ignorando e enviando.`);
             // Prossegue para envio...
        } else {
             console.log(`? [ADMIN AGENT] Usu�rio voltou a digitar (check final). Abortando envio.`);
             return;
        }
    }

    // Quebrar mensagem longa em partes
    const parts = splitMessageHumanLike(response.text || "", config.messageSplitChars);

    for (let i = 0; i < parts.length; i++) {
      const current = pendingAdminResponses.get(key);
      if (!current || current.generation !== generation) {
        console.log(`?? [ADMIN AGENT] Cancelando envio (mensagens novas chegaram)`);
        return;
      }

      // ?? CHECK DE PRESEN�A NO LOOP
      if (current.timeout !== null || current.lastKnownPresence === 'composing') {
          // Verificar se � stale
          const lastUpdate = current.lastPresenceUpdate || 0;
          const timeSinceUpdate = Date.now() - lastUpdate;
          
          if (timeSinceUpdate > 45000) {
              console.log(`?? [ADMIN AGENT] Status 'composing' travado durante envio. Ignorando.`);
          } else {
              console.log(`? [ADMIN AGENT] Usu�rio voltou a digitar durante envio. Abortando.`);
              return;
          }
      }

      if (i > 0) {
        const interval = randomBetween(config.messageIntervalMinMs, config.messageIntervalMaxMs);
        await new Promise((r) => setTimeout(r, interval));
      }

      // ??? ANTI-BLOQUEIO: Usar fila do Admin Agent
      await sendWithQueue('ADMIN_AGENT', `admin resposta parte ${i+1}`, async () => {
        await socket.sendMessage(pending.remoteJid, { text: parts[i] });
      });
    }

    console.log(`? [ADMIN AGENT] Resposta enviada para ${pending.contactNumber}`);

    // ?? Salvar resposta do agente no banco de dados
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
        
        // Atualizar �ltima mensagem da conversa
        await storage.updateAdminConversation(pending.conversationId, {
          lastMessageText: response.text.substring(0, 255),
          lastMessageTime: new Date(),
        });
        
        console.log(`?? [ADMIN AGENT] Resposta salva na conversa ${pending.conversationId}`);
      } catch (dbError) {
        console.error(`? [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
      }
    }

    // Notifica��o de pagamento
    if (response.actions?.notifyOwner) {
      const ownerNumber = await getOwnerNotificationNumber();
      const ownerJid = `${ownerNumber}@s.whatsapp.net`;
      const notificationText = `?? *NOTIFICA��O DE PAGAMENTO*\n\n?? Cliente: ${pending.contactNumber}\n? ${new Date().toLocaleString("pt-BR")}\n\n?? Verificar comprovante e liberar conta`;
      // ??? ANTI-BLOQUEIO
      await sendWithQueue('ADMIN_AGENT', 'notifica��o pagamento', async () => {
        await socket.sendMessage(ownerJid, { text: notificationText });
      });
      console.log(`?? [ADMIN AGENT] Notifica��o enviada para ${ownerNumber}`);
    }

    // ?? Enviar m�dias se houver
    if (response.mediaActions && response.mediaActions.length > 0) {
      console.log(`?? [ADMIN AGENT] Enviando ${response.mediaActions.length} m�dia(s)...`);
      
      for (const action of response.mediaActions) {
        if (action.mediaData) {
          try {
            const media = action.mediaData;
            console.log(`?? [ADMIN AGENT] Enviando m�dia: ${media.name} (${media.mediaType})`);
            
            // Baixar m�dia da URL
            const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
            
            if (mediaBuffer) {
              switch (media.mediaType) {
                case 'image':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm�dia imagem', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      image: mediaBuffer,
                      caption: media.caption || undefined,
                    });
                  });
                  break;
                case 'audio':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm�dia �udio', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      audio: mediaBuffer,
                      mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                      ptt: true, // Voice message
                    });
                  });
                  break;
                case 'video':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm�dia v�deo', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      video: mediaBuffer,
                      caption: media.caption || undefined,
                    });
                  });
                  break;
                case 'document':
                  // ??? ANTI-BLOQUEIO
                  await sendWithQueue('ADMIN_AGENT', 'm�dia documento', async () => {
                    await socket.sendMessage(pending.remoteJid, {
                      document: mediaBuffer,
                      fileName: media.fileName || 'document',
                      mimetype: media.mimeType || 'application/octet-stream',
                    });
                  });
                  break;
              }
              console.log(`? [ADMIN AGENT] M�dia ${media.name} enviada com sucesso`);
            } else {
              console.error(`? [ADMIN AGENT] Falha ao baixar m�dia: ${media.storageUrl}`);
            }
          } catch (mediaError) {
            console.error(`? [ADMIN AGENT] Erro ao enviar m�dia ${action.media_name}:`, mediaError);
          }
          
          // Pequeno delay entre m�dias
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    // ?? Desconectar WhatsApp se solicitado
    if (response.actions?.disconnectWhatsApp) {
      try {
        const { getClientSession } = await import("./adminAgentService");
        const clientSession = getClientSession(pending.contactNumber);
        
        if (clientSession?.userId) {
          console.log(`?? [ADMIN AGENT] Desconectando WhatsApp do usu�rio ${clientSession.userId}...`);
          await disconnectWhatsApp(clientSession.userId);
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'desconex�o confirma��o', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Pronto! ?? Seu WhatsApp foi desconectado. Quando quiser reconectar, � s� me avisar!" });
          });
          console.log(`? [ADMIN AGENT] WhatsApp desconectado para ${clientSession.userId}`);
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'desconex�o n�o encontrada', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "N�o encontrei uma conex�o ativa para desconectar. Voc� j� est� desconectado!" });
          });
        }
      } catch (disconnectError) {
        console.error("? [ADMIN AGENT] Erro ao desconectar WhatsApp:", disconnectError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'desconex�o erro', async () => {
          await socket.sendMessage(pending.remoteJid, { text: "Tive um problema ao tentar desconectar. Pode tentar de novo?" });
        });
      }
    }

    // ?? Enviar c�digo de pareamento se solicitado
    if (response.actions?.connectWhatsApp) {
      console.log(`?? [ADMIN AGENT] A��o connectWhatsApp (c�digo pareamento) detectada!`);
      try {
        // Buscar userId da sess�o do cliente
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensurePairingCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`?? [ADMIN AGENT] Sess�o do cliente para pareamento:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "n�o encontrada");
        
        // ?? BUSCAR NO BANCO SE N�O TEM userId NA SESS�O
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`?? [ADMIN AGENT] Buscando usu�rio no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`?? [ADMIN AGENT] Usu�rio encontrado no banco: ${existingUser.id}`);
            // Atualizar sess�o com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se n�o tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`?? [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar c�digo...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sess�o atualizada
            console.log(`? [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensurePairingCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            requestPairingCode: requestClientPairingCode,
            // ??? ANTI-BLOQUEIO: Enviar via fila
            sendText: (text) => sendWithQueue('ADMIN_AGENT', 'pareamento c�digo', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'pareamento email', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (codeError) {
        console.error("? [ADMIN AGENT] Erro ao gerar c�digo de pareamento:", codeError);
        const errorMsg = (codeError as Error).message || String(codeError);
        console.error("? [ADMIN AGENT] Detalhes do erro:", errorMsg);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'pareamento erro', async () => {
          await socket.sendMessage(pending.remoteJid, {
            text: "Desculpa, tive um problema t�cnico ao gerar o c�digo agora. Eu continuo tentando e te envio automaticamente assim que sair.\n\nSe preferir, tamb�m posso conectar por QR Code.",
          });
        });
      }
    }

    // ?? Enviar QR Code como imagem se solicitado
    if (response.actions?.sendQrCode) {
      console.log(`?? [ADMIN AGENT] A��o sendQrCode detectada! Iniciando processo...`);
      try {
        const { getClientSession, createClientAccount, updateClientSession } = await import("./adminAgentService");
        const { ensureQrCodeSentToClient } = await import("./adminConnectionFlows");
        let clientSession = getClientSession(pending.contactNumber);
        console.log(`?? [ADMIN AGENT] Sess�o do cliente:`, clientSession ? `userId=${clientSession.userId}, email=${clientSession.email}` : "n�o encontrada");
        
        // ?? BUSCAR NO BANCO SE N�O TEM userId NA SESS�O
        if (!clientSession?.userId) {
          const cleanPhone = "+" + pending.contactNumber.replace(/\D/g, "");
          console.log(`?? [ADMIN AGENT] Buscando usu�rio no banco pelo telefone: ${cleanPhone}`);
          const existingUser = await storage.getUserByPhone(cleanPhone);
          if (existingUser) {
            console.log(`?? [ADMIN AGENT] Usu�rio encontrado no banco: ${existingUser.id}`);
            // Atualizar sess�o com userId do banco
            updateClientSession(pending.contactNumber, { userId: existingUser.id, email: existingUser.email || undefined });
            clientSession = getClientSession(pending.contactNumber);
          }
        }
        
        // Se n�o tem userId mas tem email, criar conta automaticamente
        if (!clientSession?.userId && clientSession?.email) {
          console.log(`?? [ADMIN AGENT] Criando conta para ${clientSession.email} antes de gerar QR Code...`);
          const result = await createClientAccount(clientSession);
          if (result.success) {
            clientSession = getClientSession(pending.contactNumber); // Recarregar sess�o atualizada
            console.log(`? [ADMIN AGENT] Conta criada com ID: ${result.userId}`);
          }
        }
        
        if (clientSession?.userId) {
          await ensureQrCodeSentToClient({
            userId: clientSession.userId,
            contactNumber: pending.contactNumber,
            getConnectionByUserId: (userId) => storage.getConnectionByUserId(userId),
            connectWhatsApp,
            // ??? ANTI-BLOQUEIO: Enviar via fila
            sendText: (text) => sendWithQueue('ADMIN_AGENT', 'QR c�digo texto', async () => {
              await socket.sendMessage(pending.remoteJid, { text });
            }).then(() => undefined),
            sendImage: (image, caption) => sendWithQueue('ADMIN_AGENT', 'QR c�digo imagem', async () => {
              await socket.sendMessage(pending.remoteJid, { image, caption });
            }).then(() => undefined),
          });
        } else {
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'QR email pedido', async () => {
            await socket.sendMessage(pending.remoteJid, { text: "Antes de conectar, preciso criar sua conta. Me passa seu email?" });
          });
        }
      } catch (qrError) {
        console.error("? [ADMIN AGENT] Erro ao enviar QR Code:", qrError);
        // ??? ANTI-BLOQUEIO
        await sendWithQueue('ADMIN_AGENT', 'QR erro', async () => {
          await socket.sendMessage(pending.remoteJid, {
            text: "Desculpa, tive um problema pra gerar o QR Code agora. Eu continuo tentando e te envio automaticamente assim que aparecer.\n\nSe preferir, tamb�m posso conectar pelo c�digo de 8 d�gitos.",
          });
        });
      }
    }

    // Limpar fila (somente se ainda for a gera��o atual)
    const current = pendingAdminResponses.get(key);
    if (current && current.generation === generation) {
      pendingAdminResponses.delete(key);
    }
  } catch (error) {
    console.error("? [ADMIN AGENT] Erro ao processar mensagens acumuladas:", error);
  }
}

// ?? HUMANIZA��O: Quebra mensagem longa em partes menores
// Best practices: WhatsApp, Intercom, Drift quebram a cada 2-3 par�grafos ou 300-500 chars
// Fonte: https://www.drift.com/blog/conversational-marketing-best-practices/
// CORRE��O 2025: N�o corta palavras nem frases no meio - divide corretamente respeitando limites naturais
// EXPORTADA para uso no simulador (/api/agent/test) - garante consist�ncia entre simulador e WhatsApp real
export function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  // Se maxChars = 0, retorna mensagem completa sem divis�o
  if (maxChars === 0) {
    return [message];
  }
  
  // Mensagem pequena - retorna diretamente
  if (message.length <= maxChars) {
    return [message];
  }
  
  const MAX_CHARS = maxChars;
  const finalParts: string[] = [];
  
  // FASE 1: Dividir por par�grafos duplos (quebras de se��o)
  const sections = message.split('\n\n').filter(s => s.trim());
  
  // FASE 2: Processar cada se��o, quebrando em partes menores se necess�rio
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
  
  // Adicionar �ltimo buffer
  if (currentBuffer.trim()) {
    optimizedParts.push(currentBuffer.trim());
  }
  
  console.log(`?? [SPLIT] Mensagem dividida em ${optimizedParts.length} partes (limite: ${MAX_CHARS} chars)`);
  optimizedParts.forEach((p, i) => {
    console.log(`   Parte ${i+1}/${optimizedParts.length}: ${p.length} chars`);
  });
  
  return optimizedParts.length > 0 ? optimizedParts : [message];
}

// Fun��o auxiliar para dividir uma se��o em chunks menores sem cortar palavras/frases
function splitSectionIntoChunks(section: string, maxChars: number): string[] {
  // Se a se��o cabe no limite, retorna direto
  if (section.length <= maxChars) {
    return [section];
  }
  
  const chunks: string[] = [];
  
  // ESTRAT�GIA 1: Tentar dividir por quebras de linha simples
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
        // Se a linha individual � maior que o limite, processa ela recursivamente
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
  
  // ESTRAT�GIA 2: Dividir por frases (pontua��o)
  return splitTextBySentences(section, maxChars);
}

// Divide texto por frases, garantindo que n�o corte palavras ou URLs
function splitTextBySentences(text: string, maxChars: number): string[] {
  // PROTE��O DE URLs: Substituir pontos em URLs por placeholder tempor�rio
  // para evitar que a regex de frases corte no meio de URLs
  const urlPlaceholder = '�URL_DOT�';
  const urlRegex = /(https?:\/\/[^\s]+)/g;
  const protectedUrls: string[] = [];
  
  // Substituir URLs por placeholders numerados
  let protectedText = text.replace(urlRegex, (match) => {
    const index = protectedUrls.length;
    protectedUrls.push(match);
    // Substituir pontos dentro da URL por placeholder
    return `�URL_${index}�`;
  });
  
  // Regex para encontrar frases (terminadas em . ! ? seguidos de espa�o/fim)
  // IMPORTANTE: Removido o h�fen (-) como delimitador de frase para n�o cortar
  // palavras compostas como "segunda-feira", "ter�a-feira", etc.
  const sentencePattern = /[^.!?]+[.!?]+(?:\s|$)|[^.!?]+$/g;
  const sentences = protectedText.match(sentencePattern) || [protectedText];
  
  // Restaurar URLs nos resultados
  const restoredSentences = sentences.map(sentence => {
    let restored = sentence;
    protectedUrls.forEach((url, index) => {
      restored = restored.replace(`�URL_${index}�`, url);
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
      
      // Se a frase individual � maior que o limite, divide por palavras
      if (trimmedSentence.length > maxChars) {
        const wordChunks = splitByWords(trimmedSentence, maxChars);
        chunks.push(...wordChunks);
        currentChunk = '';
      } else {
        currentChunk = trimmedSentence;
      }
    }
  }
  
  // Adicionar �ltimo chunk
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks.length > 0 ? chunks : [text];
}

// �ltima estrat�gia: divide por palavras (nunca corta uma palavra no meio, PROTEGE URLs)
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
      
      // Se a palavra individual � maior que o limite
      if (word.length > maxChars) {
        // PROTE��O: Se for uma URL, NUNCA quebrar - coloca inteira mesmo que ultrapasse o limite
        if (word.match(/^https?:\/\//i)) {
          console.log(`?? [SPLIT] URL protegida (n�o ser� cortada): ${word.substring(0, 50)}...`);
          currentChunk = word; // URL fica inteira, mesmo que ultrapasse o limite
        } else {
          // �ltimo recurso para palavras n�o-URL: quebra caractere por caractere
          console.log(`?? [SPLIT] Palavra muito longa sendo quebrada: ${word.substring(0, 30)}...`);
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
  
  // Adicionar �ltimo chunk
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

  console.log(`\n?? [parseRemoteJid] ========== DEBUG START ==========`);
  console.log(`   Input remoteJid: ${remoteJid}`);
  console.log(`   Decoded user: ${rawUser}`);
  console.log(`   Decoded server: ${jidSuffix}`);
  console.log(`   Is @lid?: ${remoteJid.includes("@lid")}`);
  console.log(`   Cache size: ${contactsCache?.size || 0}`);
  console.log(`   ConnectionId provided: ${connectionId || "N/A"}`);

  // FIX LID 2025: Para @lid, retornar o pr�prio LID (sem tentar converter)
  let contactNumber = cleanContactNumber(rawUser);
  
  if (remoteJid.includes("@lid")) {
    console.log(`   ?? [LID DETECTED] Instagram/Facebook Business contact`);
    console.log(`      LID: ${remoteJid}`);
    console.log(`      ?? LIDs s�o IDs do Meta, n�o n�meros WhatsApp`);
    console.log(`      ? Usando LID diretamente (comportamento correto)`);
  }  const normalizedJid = contactNumber
    ? jidNormalizedUser(`${contactNumber}@${jidSuffix}`)
    : jidNormalizedUser(remoteJid);

  console.log(`   ?? [parseRemoteJid] Resultado final:`);
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

// Função para limpar arquivos de autenticação
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
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear reconexões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n🛡️ [DEV MODE] forceReconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ✅ Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
  console.log(`[FORCE RECONNECT] Starting force reconnection for user ${userId}...`);
  
  // Limpar sess�o existente na mem�ria (se houver)
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
    unregisterWhatsAppSession(userId);
  }
  
  // Limpar pending connections e tentativas de reconex�o
  pendingConnections.delete(userId);
  reconnectAttempts.delete(userId);
  
  // Agora chamar connectWhatsApp normalmente
  await connectWhatsApp(userId);
}

// Força reset COMPLETO - apaga arquivos de autenticação (força novo QR Code)
export async function forceResetWhatsApp(userId: string): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear reset para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n🛡️ [DEV MODE] forceResetWhatsApp bloqueado para user ${userId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ✅ Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
  console.log(`[FORCE RESET] Starting complete reset for user ${userId}...`);
  
  // Limpar sess�o existente na mem�ria (se houver)
  const existingSession = sessions.get(userId);
  if (existingSession?.socket) {
    console.log(`[FORCE RESET] Found existing session in memory, closing it...`);
    try {
      existingSession.socket.end(undefined);
    } catch (e) {
      console.log(`[FORCE RESET] Error closing existing socket (ignoring):`, e);
    }
    sessions.delete(userId);
    unregisterWhatsAppSession(userId);
  }
  
  // Limpar pending connections e tentativas de reconex�o
  pendingConnections.delete(userId);
  reconnectAttempts.delete(userId);
  
  // APAGAR arquivos de autentica��o (for�a novo QR Code)
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
  // ?? MODO DESENVOLVIMENTO: Bloquear conex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n?? [DEV MODE] Conex�o WhatsApp bloqueada para user ${userId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ?? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  // ??? Verificar se j� existe uma conex�o em andamento
  const existingPendingConnection = pendingConnections.get(userId);
  if (existingPendingConnection) {
    console.log(`[CONNECT] Connection already in progress for user ${userId}, waiting for it to complete...`);
    return existingPendingConnection;
  }

  // ?? Resetar contador de tentativas de reconex�o quando usu�rio inicia conex�o manualmente
  // Isso permite novas tentativas ap�s o usu�rio clicar em "Conectar"
  reconnectAttempts.delete(userId);

  // ?? CR�TICO: Criar e registrar a promise IMEDIATAMENTE para evitar race conditions
  // A promise deve ser registrada ANTES de qualquer c�digo async para garantir
  // que m�ltiplas chamadas simult�neas retornem a mesma promise
  let resolveConnection: () => void;
  let rejectConnection: (error: Error) => void;
  
  const connectionPromise = new Promise<void>((resolve, reject) => {
    resolveConnection = resolve;
    rejectConnection = reject;
  });
  
  // Registrar ANTES de qualquer opera��o async
  pendingConnections.set(userId, connectionPromise);
  console.log(`[CONNECT] Registered pending connection for user ${userId}`);

  // Agora executar a l�gica de conex�o
  (async () => {
    try {
      console.log(`[CONNECT] Starting connection for user ${userId}...`);
      
      // Verificar se j� existe uma sess�o ativa
      const existingSession = sessions.get(userId);
      if (existingSession?.socket) {
        // Verificar se o socket est� realmente conectado
        const isSocketConnected = existingSession.socket.user !== undefined;
        if (isSocketConnected) {
          console.log(`[CONNECT] User ${userId} already has an active connected session, using existing one`);
          return;
        } else {
          // Sess�o existe mas n�o est� conectada - limpar e recriar
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

    // FIX LID 2025: Cache manual para mapear @lid ? phone number
    const contactsCache = new Map<string, Contact>();

    console.log(`[CONNECT] Creating WASocket for ${userId}...`);
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
      // ======================================================================
      // 📱 FIX 2025: SINCRONIZAÇÃO COMPLETA DE CONTATOS DA AGENDA
      // ======================================================================
      // IMPORTANTE: Estas configurações fazem o Baileys receber TODOS os
      // contatos da agenda do WhatsApp na PRIMEIRA conexão após scan do QR.
      //
      // 1. browser: Browsers.macOS('Desktop') - Emula conexão desktop para
      //    receber histórico completo (mais contatos e mensagens)
      // 2. syncFullHistory: true - Habilita sync completo de contatos e histórico
      //
      // O evento contacts.upsert será disparado com TODOS os contatos logo
      // após o QR Code ser escaneado e conexão estabelecida.
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/266
      // ======================================================================
      browser: Browsers.macOS('Desktop'),
      syncFullHistory: true,
      // -----------------------------------------------------------------------
      // ?? FIX "AGUARDANDO PARA CARREGAR MENSAGEM" (WAITING FOR MESSAGE)
      // -----------------------------------------------------------------------
      // Esta fun��o � chamada pelo Baileys quando precisa reenviar uma mensagem
      // que falhou na decripta��o. Sem ela, o WhatsApp mostra "Aguardando..."
      // 
      // Ref: https://github.com/WhiskeySockets/Baileys/issues/1767
      // -----------------------------------------------------------------------
      getMessage: async (key) => {
        if (!key.id) return undefined;
        
        console.log(`?? [getMessage] Baileys solicitou mensagem ${key.id} para retry`);
        
        // Tentar recuperar do cache em mem�ria
        const cached = getCachedMessage(userId, key.id);
        if (cached) {
          return cached;
        }
        
        // Fallback: tentar buscar do banco de dados
        try {
          const dbMessage = await storage.getMessageByMessageId(key.id);
          if (dbMessage && dbMessage.text) {
            console.log(`?? [getMessage] Mensagem ${key.id} recuperada do banco de dados`);
            return { conversation: dbMessage.text };
          }
        } catch (err) {
          console.error(`? [getMessage] Erro ao buscar mensagem do banco:`, err);
        }
        
        console.log(`?? [getMessage] Mensagem ${key.id} n�o encontrada em nenhum cache`);
        return undefined;
      },
    });

    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
      contactsCache,
    };

    sessions.set(userId, session);
    
    // 📲 Registrar sessão no serviço de envio para notificações do sistema (delivery, etc)
    registerWhatsAppSession(userId, sock);

    // ======================================================================
    // FIX LID 2025 - CACHE WARMING (Carregar contatos do DB para mem�ria)
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
      
      console.log(`[CACHE WARMING] ? Loaded ${dbContacts.length} contacts into memory`);
    } catch (error) {
      console.error(`[CACHE WARMING] ? Failed to load contacts:`, error);
    }

    // ======================================================================
    // 📱 CONTACTS SYNC - SINCRONIZAÇÃO COMPLETA DA AGENDA DO WHATSAPP
    // ======================================================================
    // IMPORTANTE: Este evento é disparado pelo Baileys com TODOS os contatos
    // da agenda do WhatsApp na PRIMEIRA conexão após scan do QR Code.
    //
    // Com a configuração browser: Browsers.macOS('Desktop') + syncFullHistory: true,
    // o Baileys emula uma conexão desktop que recebe histórico completo.
    //
    // Ref: https://github.com/WhiskeySockets/Baileys/issues/266
    // "After scanning the QR code and establishing the first connection,
    // 'contacts.upsert' transmits the entire contact list once."
    // ======================================================================
    sock.ev.on("contacts.upsert", async (contacts) => {
      console.log(`\n========================================`);
      console.log(`📱 [CONTACTS.UPSERT] Baileys emitiu ${contacts.length} contatos`);
      console.log(`📱 [CONTACTS.UPSERT] User ID: ${userId}`);
      console.log(`📱 [CONTACTS.UPSERT] Primeiro contato: ${contacts[0]?.id || 'N/A'}`);
      console.log(`📱 [CONTACTS.UPSERT] Último contato: ${contacts[contacts.length - 1]?.id || 'N/A'}`);
      console.log(`========================================\n`);

      // Array para novos contatos desta batch
      const newAgendaContacts: AgendaContact[] = [];

      for (const contact of contacts) {
        // Extrair número do contact.id quando phoneNumber não vem preenchido
        let phoneNumber = contact.phoneNumber || null;
        if (!phoneNumber && contact.id) {
          const match = contact.id.match(/^(\d+)@/);
          if (match) {
            phoneNumber = match[1];
          }
        }

        // 1. Atualizar cache em memória da sessão (para resolver @lid)
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }

        // 2. Adicionar ao array de agenda (se tiver número válido)
        if (phoneNumber && phoneNumber.length >= 8) {
          newAgendaContacts.push({
            id: contact.id,
            phoneNumber: phoneNumber,
            name: contact.name || contact.notify || '',
            lid: contact.lid,
          });
        }
      }

      // 3. IMPORTANTE: Mesclar com contatos existentes no cache (acumula múltiplas batches)
      // O Baileys pode emitir contacts.upsert múltiplas vezes durante a sincronização inicial
      const existingCache = getAgendaContacts(userId);
      const existingContacts = existingCache?.contacts || [];
      const existingPhones = new Set(existingContacts.map(c => c.phoneNumber));

      // Filtrar apenas contatos novos (evitar duplicatas)
      const uniqueNewContacts = newAgendaContacts.filter(c => !existingPhones.has(c.phoneNumber));
      const mergedContacts = [...existingContacts, ...uniqueNewContacts];

      if (mergedContacts.length > 0) {
        saveAgendaToCache(userId, mergedContacts);

        // Broadcast para o frontend informando que os contatos estão prontos
        broadcastToUser(userId, {
          type: "agenda_synced",
          count: mergedContacts.length,
          status: "ready",
          message: `📱 ${mergedContacts.length} contatos sincronizados da agenda!`
        });

        console.log(`📱 [CONTACTS.UPSERT] ✅ Novos: ${uniqueNewContacts.length} | Total no cache: ${mergedContacts.length}`);
      } else {
        console.log(`📱 [CONTACTS.UPSERT] ⚠️ Nenhum contato válido encontrado nesta batch`);
      }
    });

    // ======================================================================
    // 📚 HISTORY SYNC - BUSCA TODOS OS CONTATOS DO HISTÓRICO DO WHATSAPP
    // ======================================================================
    // Este evento é disparado durante o sync inicial e traz TODOS os contatos
    // do histórico do WhatsApp (chats, contacts, messages)
    // Ref: https://baileys.wiki/docs/socket/history-sync/
    // ======================================================================
    sock.ev.on("messaging-history.set", async ({ chats, contacts, messages, isLatest }) => {
      console.log(`\n========================================`);
      console.log(`[HISTORY SYNC] 📚 Baileys emitiu messaging-history.set`);
      console.log(`[HISTORY SYNC] User ID: ${userId}`);
      console.log(`[HISTORY SYNC] Chats: ${chats?.length || 0}`);
      console.log(`[HISTORY SYNC] Contacts: ${contacts?.length || 0}`);
      console.log(`[HISTORY SYNC] Messages: ${messages?.length || 0}`);
      console.log(`[HISTORY SYNC] isLatest: ${isLatest}`);
      console.log(`========================================\n`);

      // Processar contatos do histórico
      if (contacts && contacts.length > 0) {
        const agendaContacts: AgendaContact[] = [];

        for (const contact of contacts) {
          // Extrair número do contact.id
          let phoneNumber: string | null = null;

          // Tentar pegar do phoneNumber primeiro
          if (contact.id) {
            const match = contact.id.match(/^(\d+)@/);
            if (match && match[1].length >= 8) {
              phoneNumber = match[1];
            }
          }

          if (phoneNumber) {
            // Adicionar ao cache da sessão
            contactsCache.set(contact.id, contact);

            // Adicionar ao array de agenda
            agendaContacts.push({
              id: contact.id,
              phoneNumber: phoneNumber,
              name: contact.name || contact.notify || '',
              lid: undefined,
            });
          }
        }

        // Merge com contatos existentes no cache
        const existingCache = getAgendaContacts(userId);
        const existingContacts = existingCache?.contacts || [];
        const existingPhones = new Set(existingContacts.map(c => c.phoneNumber));

        // Adicionar novos contatos (sem duplicatas)
        const newContacts = agendaContacts.filter(c => !existingPhones.has(c.phoneNumber));
        const mergedContacts = [...existingContacts, ...newContacts];

        if (mergedContacts.length > 0) {
          saveAgendaToCache(userId, mergedContacts);

          console.log(`[HISTORY SYNC] ✅ ${newContacts.length} novos contatos adicionados`);
          console.log(`[HISTORY SYNC] 📊 Total no cache: ${mergedContacts.length} contatos`);

          // Broadcast para o frontend
          broadcastToUser(userId, {
            type: "agenda_synced",
            count: mergedContacts.length,
            status: "ready",
            message: `📚 ${mergedContacts.length} contatos sincronizados do histórico!`
          });
        }
      }

      // Processar chats para extrair contatos adicionais
      if (chats && chats.length > 0) {
        const chatContacts: AgendaContact[] = [];

        for (const chat of chats) {
          // Ignorar grupos
          if (chat.id?.endsWith('@g.us')) continue;

          // Extrair número do chat.id
          const match = chat.id?.match(/^(\d+)@/);
          if (match && match[1].length >= 8) {
            const phoneNumber = match[1];

            // Verificar se já não está no cache
            const existingCache = getAgendaContacts(userId);
            const existingPhones = new Set((existingCache?.contacts || []).map(c => c.phoneNumber));

            if (!existingPhones.has(phoneNumber)) {
              chatContacts.push({
                id: chat.id,
                phoneNumber: phoneNumber,
                name: chat.name || '',
                lid: undefined,
              });
            }
          }
        }

        if (chatContacts.length > 0) {
          const existingCache = getAgendaContacts(userId);
          const existingContacts = existingCache?.contacts || [];
          const mergedContacts = [...existingContacts, ...chatContacts];

          saveAgendaToCache(userId, mergedContacts);

          console.log(`[HISTORY SYNC] 💬 ${chatContacts.length} contatos adicionados dos chats`);
          console.log(`[HISTORY SYNC] 📊 Total no cache: ${mergedContacts.length} contatos`);

          // Broadcast atualizado
          broadcastToUser(userId, {
            type: "agenda_synced",
            count: mergedContacts.length,
            status: "ready",
            message: `📚 ${mergedContacts.length} contatos sincronizados!`
          });
        }
      }
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

      // Estado "connecting" - quando o QR Code foi escaneado e está conectando
      if (conn === "connecting") {
        console.log(`User ${userId} is connecting...`);
        broadcastToUser(userId, { type: "connecting" });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        // -----------------------------------------------------------------------
        // 🚨 SISTEMA DE RECUPERAÇÃO: Registrar desconexão
        // -----------------------------------------------------------------------
        // Salvar evento de desconexão para diagnóstico e recuperação
        try {
          const disconnectReason = (lastDisconnect?.error as any)?.message || 
                                   `statusCode: ${statusCode}`;
          await logConnectionDisconnection(userId, session.connectionId, disconnectReason);
        } catch (logErr) {
          console.error(`🚨 [RECOVERY] Erro ao logar desconexão:`, logErr);
        }

        // Sempre deletar a sess�o primeiro
        sessions.delete(userId);
        pendingConnections.delete(userId); // Limpar da lista de pendentes

        // Atualizar banco de dados
        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        // Verificar limite de tentativas de reconex�o para evitar loop infinito
        const now = Date.now();
        let attempt = reconnectAttempts.get(userId) || { count: 0, lastAttempt: 0 };
        
        // Se passou mais de 30 segundos desde o �ltimo ciclo, resetar contador
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
            // Resetar contador ap�s atingir o limite (usu�rio precisar� clicar em conectar novamente)
            reconnectAttempts.delete(userId);
            // Limpar QR code do banco para evitar exibi��o de QR expirado
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
          
          // Resetar tentativas de reconex�o
          reconnectAttempts.delete(userId);

          // N�O reconectar automaticamente ap�s logout - o usu�rio deve clicar em "Conectar" novamente
          console.log(`User ${userId} needs to click Connect again to generate new QR code.`);
        }
      } else if (conn === "open") {
        // Conex�o estabelecida com sucesso - resetar tentativas de reconex�o e limpar pendentes
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
        // ??? SAFE MODE: Verificar se o cliente est� em modo seguro anti-bloqueio
        // ======================================================================
        // Se o admin ativou o Safe Mode para este cliente (p�s-bloqueio),
        // executar limpeza completa antes de permitir qualquer envio
        try {
          const currentConnection = await storage.getConnectionByUserId(userId);
          if (currentConnection?.safeModeEnabled) {
            console.log(`??? [SAFE MODE] Cliente ${userId.substring(0, 8)}... est� em modo seguro - executando limpeza!`);
            
            const cleanupResult = await executeSafeModeCleanup(userId, session.connectionId);
            
            if (cleanupResult.success) {
              // Notificar o cliente sobre a limpeza
              broadcastToUser(userId, { 
                type: "safe_mode_cleanup",
                messagesCleared: cleanupResult.messagesCleared,
                followupsCleared: cleanupResult.followupsCleared,
              });
            } else {
              console.error(`??? [SAFE MODE] Erro na limpeza:`, cleanupResult.error);
            }
          }
        } catch (safeModeError) {
          console.error(`??? [SAFE MODE] Erro ao verificar modo seguro:`, safeModeError);
        }

        // ======================================================================
        // FIX LID 2025 - WORKAROUND: Contatos ser�o populados ao receber mensagens
        // ======================================================================
        // Baileys 7.0.0-rc.6 n�o tem makeInMemoryStore e n�o emite contacts.upsert
        // em sess�es restauradas. Os contatos ser�o populados quando:
        // 1. Primeira mensagem de cada contato chegar (contacts.upsert dispara)
        // 2. Usu�rio enviar mensagem (parseRemoteJid salva no DB via fallback)
        
        console.log(`\n?? [CONTACTS INFO] Aguardando contatos do Baileys...`);
        console.log(`   Contatos ser�o sincronizados automaticamente quando:`);
        console.log(`   1. Evento contacts.upsert do Baileys disparar`);
        console.log(`   2. Mensagens forem recebidas/enviadas`);
        console.log(`   Cache warming carregou ${contactsCache.size} contatos do DB\n`);
        
        // ======================================================================
        // ?? VERIFICA��O DE MENSAGENS N�O RESPONDIDAS (24H)
        // ======================================================================
        // Aguardar 10s para socket estabilizar, depois verificar se h� clientes
        // que mandaram mensagem nas �ltimas 24h e n�o foram respondidos
        // (resolve problema de mensagens perdidas durante desconex�es)
        setTimeout(async () => {
          try {
            await checkUnrespondedMessages(session);
          } catch (error) {
            console.error(`? [UNRESPONDED CHECK] Erro ao verificar mensagens:`, error);
          }
        }, 10000); // 10 segundos ap�s conex�o
        
        // ======================================================================
        // 🚨 SISTEMA DE RECUPERAÇÃO: Processar mensagens pendentes
        // ======================================================================
        // Quando a conexão estabiliza, verificar se há mensagens que chegaram
        // durante instabilidade/deploy e não foram processadas
        // ======================================================================
        try {
          console.log(`🚨 [RECOVERY] Iniciando recuperação de mensagens pendentes para ${userId.substring(0, 8)}...`);
          await startMessageRecovery(userId, session.connectionId);
        } catch (recoveryError) {
          console.error(`🚨 [RECOVERY] Erro ao iniciar recuperação:`, recoveryError);
        }
        
        // ======================================================================
        // ?? FOLLOW-UP: Reativar follow-ups que estavam aguardando conex�o
        // ======================================================================
        // Quando o WhatsApp reconecta, os follow-ups que foram pausados por falta
        // de conex�o devem ser reagendados para processar em breve
        // ?? IMPORTANTE: N�O reativar se Safe Mode est� ativo (cliente p�s-bloqueio)
        setTimeout(async () => {
          try {
            // Verificar se Safe Mode est� ativo - se sim, N�O reativar follow-ups
            const connCheck = await storage.getConnectionByUserId(userId);
            if (connCheck?.safeModeEnabled) {
              console.log(`??? [SAFE MODE] Pulando reativa��o de follow-ups - modo seguro ativo`);
              return;
            }
            
            await userFollowUpService.clearConnectionWaitingStatus(session.connectionId);
            console.log(`? [FOLLOW-UP] Status de aguardo de conex�o limpo para ${userId}`);
          } catch (error) {
            console.error(`? [FOLLOW-UP] Erro ao limpar status de aguardo:`, error);
          }
        }, 5000); // 5 segundos ap�s conex�o
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // -----------------------------------------------------------------------
      // ?? CACHEAR TODAS AS MENSAGENS PARA getMessage() - FIX "AGUARDANDO MENSAGEM"
      // -----------------------------------------------------------------------
      // Armazenar mensagem no cache assim que ela chegar, independente do tipo
      // Isso permite que Baileys recupere a mensagem se precisar fazer retry
      if (message.key.id && message.message) {
        cacheMessage(userId, message.key.id, message.message);
      }
      
      // -----------------------------------------------------------------------
      // 🚨 SISTEMA DE RECUPERAÇÃO: Salvar mensagem IMEDIATAMENTE
      // -----------------------------------------------------------------------
      // Salva mensagem na tabela pending_incoming_messages ANTES de processar
      // Isso garante que se houver crash/desconexão, a mensagem será recuperada
      // -----------------------------------------------------------------------
      if (m.type === "notify" && !message.key.fromMe && message.key.remoteJid) {
        const remoteJid = message.key.remoteJid;
        // Só salvar mensagens individuais (não grupos)
        if (!remoteJid.includes("@g.us") && !remoteJid.includes("@broadcast")) {
          try {
            // Extrair conteúdo textual básico para log
            const msg = message.message;
            let textContent: string | null = null;
            let msgType = "text";
            
            if (msg?.conversation) {
              textContent = msg.conversation;
            } else if (msg?.extendedTextMessage?.text) {
              textContent = msg.extendedTextMessage.text;
            } else if (msg?.imageMessage) {
              textContent = msg.imageMessage.caption || "📷 Imagem";
              msgType = "image";
            } else if (msg?.audioMessage) {
              textContent = "🎵 Áudio";
              msgType = "audio";
            } else if (msg?.videoMessage) {
              textContent = msg.videoMessage.caption || "🎬 Vídeo";
              msgType = "video";
            } else if (msg?.documentMessage) {
              textContent = msg.documentMessage.fileName || "📄 Documento";
              msgType = "document";
            } else if (msg?.stickerMessage) {
              textContent = "🎨 Sticker";
              msgType = "sticker";
            }
            
            await saveIncomingMessage({
              userId: userId,
              connectionId: session.connectionId,
              waMessage: message,
              messageContent: textContent,
              messageType: msgType,
            });
          } catch (saveErr) {
            console.error(`🚨 [RECOVERY] Erro ao salvar mensagem pendente:`, saveErr);
            // Não bloqueia processamento se salvar falhar
          }
        }
      }
      
      // ?? IMPORTANTE: Ignorar mensagens de sincroniza��o/hist�rico
      // m.type === "notify" = mensagem NOVA (em tempo real)
      // m.type === "append" = sincroniza��o de hist�rico (ao abrir conversa)
      // S� processar mensagens novas para evitar pausar IA ao entrar na conversa!
      if (m.type !== "notify") {
        console.log(`?? [SYNC] Ignorando mensagem de sincroniza��o (type: ${m.type})`);
        return;
      }
      
      // ?? NOVA L�GICA: Capturar mensagens enviadas pelo pr�prio usu�rio (fromMe: true)
      if (message.key.fromMe) {
        console.log(`?? [FROM ME] Mensagem enviada pelo dono no WhatsApp detectada`);
        try {
          await handleOutgoingMessage(session, message);
        } catch (err) {
          console.error("Error handling outgoing message:", err);
        }
        return;
      }
      
      // Verificação extra: ignorar se o remoteJid é o próprio número
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
    // NOTA: A conex�o ainda n�o est� "open", apenas o socket foi criado
    // O pendingConnections ser� limpo quando a conex�o abrir (conn === "open")
    // ou quando houver erro de conex�o (conn === "close")
    console.log(`[CONNECT] WhatsApp socket initialized for user ${userId}, waiting for connection events...`);
    resolveConnection!();

    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      pendingConnections.delete(userId);
      rejectConnection!(error as Error);
    }
  })();

  // Retornar a promise (j� foi registrada no mapa antes de iniciar a async)
  return connectionPromise;
}

// -----------------------------------------------------------------------
// ?? NOVA FUN��O: Processar mensagens enviadas pelo DONO no WhatsApp
// -----------------------------------------------------------------------
// Quando o dono responde direto no WhatsApp (fromMe: true),
// precisamos salvar essa mensagem no sistema para evitar "buracos"
// na conversa quando a IA voltar a responder.
// -----------------------------------------------------------------------
async function handleOutgoingMessage(session: WhatsAppSession, waMessage: WAMessage) {
  // ?? MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`?? [DEV MODE] Ignorando mensagem enviada (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;

  // ?? FIX BUG DUPLICATA: Ignorar mensagens enviadas pelo agente IA
  // Quando IA envia via socket.sendMessage(), Baileys dispara evento fromMe:true
  // MAS a mensagem j� foi salva no createMessage() do setTimeout do agente.
  // Se salvar novamente aqui = DUPLICATA!
  const messageId = waMessage.key.id;
  if (messageId && agentMessageIds.has(messageId)) {
    console.log(`?? [FROM ME] Ignorando mensagem do agente (j� salva): ${messageId}`);
    agentMessageIds.delete(messageId); // Limpar ap�s verificar
    return;
  }

  // Filtrar grupos e status
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`?? [FROM ME] Ignoring group/status message`);
    return;
  }

  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`?? [FROM ME] Ignoring non-individual message`);
    return;
  }

  // Resolver contactNumber usando mesma l�gica do handleIncomingMessage
  let contactNumber: string;
  let normalizedJid: string;

  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    contactNumber = cleanContactNumber(realJid);
    normalizedJid = realJid;
    console.log(`?? [FROM ME] LID resolvido: ${remoteJid} ? ${realJid}`);
  } else {
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    normalizedJid = parsed.normalizedJid;
  }

  if (!contactNumber) {
    console.log(`?? [FROM ME] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }
  
  // 🆕 v4.0 ANTI-BAN CRÍTICO: Registrar mensagem MANUAL do dono no sistema de proteção
  // Isso faz com que o bot ESPERE antes de enviar qualquer mensagem para evitar
  // padrão de "bot enviando imediatamente após humano" que a Meta detecta como spam
  const msg = waMessage.message;
  let messageType: 'text' | 'media' | 'audio' = 'text';
  if (msg?.audioMessage) {
    messageType = 'audio';
  } else if (msg?.imageMessage || msg?.videoMessage || msg?.documentMessage || msg?.documentWithCaptionMessage) {
    messageType = 'media';
  }
  
  antiBanProtectionService.registerOwnerManualMessage(session.userId, contactNumber, messageType);
  console.log(`🛡️ [ANTI-BAN v4.0] 👤 Mensagem MANUAL do DONO registrada - Bot aguardará antes de responder`);
  
  // Extrair texto da mensagem E MÍDIA (incluindo áudio para transcrição)
  let messageText = "";
  let mediaType: string | null = null;
  let mediaUrl: string | null = null;
  let mediaMimeType: string | null = null;
  
  // 🔑 METADADOS PARA RE-DOWNLOAD DE MÍDIA (igual handleIncomingMessage)
  // Esses campos permitem baixar a mídia novamente do WhatsApp
  let mediaKey: string | null = null;
  let directPath: string | null = null;
  let mediaUrlOriginal: string | null = null;

  if (msg?.conversation) {
    messageText = msg.conversation;
  } else if (msg?.extendedTextMessage?.text) {
    messageText = msg.extendedTextMessage.text;
    
    // ?? FIX BUG DUPLICATA: Baileys as vezes envia texto 2x no mesmo campo
    // Exemplo: "Texto\nTexto" (repetido separado por \n)
    // Detectar e remover duplica��o
    const lines = messageText.split('\n');
    const halfLength = Math.floor(lines.length / 2);
    if (lines.length > 2 && lines.length % 2 === 0) {
      const firstHalf = lines.slice(0, halfLength).join('\n');
      const secondHalf = lines.slice(halfLength).join('\n');
      if (firstHalf === secondHalf) {
        console.log(`?? [FROM ME] Texto duplicado detectado, usando apenas primeira metade`);
        messageText = firstHalf;
      }
    }
  } else if (msg?.imageMessage?.caption) {
    messageText = msg.imageMessage.caption;
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    // 🖼️ IMAGEM DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`🖼️ [FROM ME] Baixando imagem do dono com caption...`);
      console.log(`🖼️ [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`🖼️ [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Imagem do dono processada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.imageMessage) {
    messageText = "[Imagem enviada]";
    mediaType = "image";
    mediaMimeType = msg.imageMessage.mimetype || "image/jpeg";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    // 🖼️ IMAGEM DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`🖼️ [FROM ME] Baixando imagem do dono sem caption...`);
      console.log(`🖼️ [FROM ME] mediaKey presente:`, !!msg.imageMessage.mediaKey);
      console.log(`🖼️ [FROM ME] directPath presente:`, !!msg.imageMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Imagem do dono processada: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar imagem:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.videoMessage?.caption) {
    messageText = msg.videoMessage.caption;
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // 🎬 VÍDEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`🎬 [FROM ME] Baixando vídeo do dono com caption...`);
      console.log(`🎬 [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`🎬 [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`🎬 [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Vídeo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar vídeo:", error?.message || error);
      console.error("❌ [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.videoMessage) {
    messageText = "[Vídeo enviado]";
    mediaType = "video";
    mediaMimeType = msg.videoMessage.mimetype || "video/mp4";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    // 🎬 VÍDEO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`🎬 [FROM ME] Baixando vídeo do dono sem caption...`);
      console.log(`🎬 [FROM ME] waMessage.key:`, JSON.stringify(waMessage.key));
      console.log(`🎬 [FROM ME] mediaKey presente:`, !!msg.videoMessage.mediaKey);
      console.log(`🎬 [FROM ME] directPath presente:`, !!msg.videoMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Vídeo do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar vídeo:", error?.message || error);
      console.error("❌ [FROM ME] Erro completo:", JSON.stringify(error, Object.getOwnPropertyNames(error)));
      mediaUrl = null;
    }
  } else if (msg?.audioMessage) {
    // 🎵 ÁUDIO DO DONO: Baixar e preparar para transcrição (igual cliente)
    mediaType = "audio";
    mediaMimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
    messageText = "[Áudio enviado]"; // Texto placeholder, será substituído pela transcrição
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`🎵 [FROM ME] Baixando áudio do dono para transcrição...`);
      console.log(`🎵 [FROM ME] mediaKey presente:`, !!msg.audioMessage.mediaKey);
      console.log(`🎵 [FROM ME] directPath presente:`, !!msg.audioMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      // ✅ FIX: Usar session.userId em vez de userId (que não existe neste escopo)
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Áudio do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("? [FROM ME] Erro ao baixar �udio:", error?.message || error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // 📄 DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - FROM ME
  // -----------------------------------------------------------------------
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    messageText = docMsg.caption || `📄 ${docMsg.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    
    // 🔑 Extrair metadados para re-download posterior
    if (docMsg.mediaKey) {
      mediaKey = Buffer.from(docMsg.mediaKey).toString("base64");
    }
    directPath = docMsg.directPath || null;
    mediaUrlOriginal = docMsg.url || null;
    
    // 📄 DOCUMENTO DO DONO (COM CAPTION): Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono (com caption): ${docMsg.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Documento do dono (com caption) processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento (com caption):", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage?.caption) {
    messageText = msg.documentMessage.caption;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // 📄 DOCUMENTO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono com caption: ${msg.documentMessage.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
      console.log(`✅ [FROM ME] Documento do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else if (msg?.documentMessage) {
    messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // 📄 DOCUMENTO DO DONO: Baixar e fazer upload para Storage (economiza egress!)
    try {
      console.log(`📄 [FROM ME] Baixando documento do dono: ${msg.documentMessage.fileName}...`);
      console.log(`📄 [FROM ME] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`📄 [FROM ME] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      // 🔼 Upload para Storage em vez de base64 para economizar egress
      mediaUrl = await uploadMediaOrFallback(buffer, mediaMimeType, session.userId);
      console.log(`✅ [FROM ME] Documento do dono processado: ${buffer.length} bytes`);
    } catch (error: any) {
      console.error("❌ [FROM ME] Erro ao baixar documento:", error?.message || error);
      mediaUrl = null;
    }
  } else {
    console.log(`📭 [FROM ME] Unsupported message type, skipping`);
    return;
  }

  // Buscar/criar conversa
  let conversation = await storage.getConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  if (!conversation) {
    console.log(`?? [FROM ME] Creating new conversation for ${contactNumber}`);
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber,
      remoteJid: normalizedJid,
      jidSuffix: "s.whatsapp.net",
      contactName: contactNumber,
      contactAvatar: null,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
      unreadCount: 0,
    });
  }

  // ?? VERIFICA��O DE DUPLICATA: Antes de salvar, verificar se a mensagem j� existe no banco
  // Isso resolve race conditions onde o agente pode salvar antes ou depois deste handler
  let existingMessage = await storage.getMessageByMessageId(waMessage.key.id!);
  
  // ?? RACE CONDITION FIX: Se n�o existe, esperar 500ms e verificar novamente
  // O agente pode estar salvando a mensagem neste exato momento
  if (!existingMessage) {
    await new Promise(resolve => setTimeout(resolve, 500));
    existingMessage = await storage.getMessageByMessageId(waMessage.key.id!);
  }
  
  if (existingMessage) {
    console.log(`?? [FROM ME] Mensagem j� existe no banco (messageId: ${waMessage.key.id}), ignorando duplicata`);
    
    // Se a mensagem existente � do agente, N�O pausar a IA e sair
    if (existingMessage.isFromAgent) {
      console.log(`? [FROM ME] Mensagem � do agente - N�O pausar IA`);
      return;
    }
    
    // Se n�o � do agente mas j� existe, apenas atualizar conversa e sair (evita duplicata)
    await storage.updateConversation(conversation.id, {
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
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
      mediaUrl,        // 🎵 Incluir URL do áudio para transcrição automática
      mediaMimeType,   // 🎵 Tipo MIME do áudio
      // 🔑 Metadados para re-download de mídia do WhatsApp (igual handleIncomingMessage)
      mediaKey,
      directPath,
      mediaUrlOriginal,
    });
  } catch (createError: any) {
    // Se erro for de duplicata (constraint unique), verificar se � do agente
    if (createError?.message?.includes('unique') || createError?.code === '23505') {
      console.log(`?? [FROM ME] Erro de duplicata ao salvar - mensagem j� existe (messageId: ${waMessage.key.id})`);
      
      // Re-verificar se � do agente
      const recheck = await storage.getMessageByMessageId(waMessage.key.id!);
      if (recheck?.isFromAgent) {
        console.log(`? [FROM ME] Confirmado: mensagem � do agente - N�O pausar IA`);
        return;
      }
    } else {
      console.error(`? [FROM ME] Erro ao salvar mensagem:`, createError);
    }
    return;
  }

  // Atualizar conversa
  await storage.updateConversation(conversation.id, {
    lastMessageText: messageText,
    lastMessageTime: new Date(),
    lastMessageFromMe: true, // Mensagem enviada pelo usuário
    hasReplied: true, // Marca como respondida
    unreadCount: 0, // Mensagens do dono não geram unread
  });

  // ?? FOLLOW-UP: Se admin enviou mensagem, agendar follow-up inicial
  try {
    await followUpService.scheduleInitialFollowUp(conversation.id);
  } catch (error) {
    console.error("Erro ao agendar follow-up:", error);
  }

  // -----------------------------------------------------------------------
  // ?? AUTO-PAUSE IA: Quando o dono responde manualmente, PAUSA a IA
  // A IA s� volta a responder quando o usu�rio reativar em /conversas
  // CONFIGUR�VEL: S� pausa se pauseOnManualReply estiver ativado (padr�o: true)
  // NOVO: Suporta auto-reativa��o ap�s timer configur�vel
  // -----------------------------------------------------------------------
  try {
    // Verificar configura��o do agente para pauseOnManualReply
    const agentConfig = await storage.getAgentConfig(session.userId);
    const shouldPauseOnManualReply = agentConfig?.pauseOnManualReply !== false; // Padr�o: true
    const autoReactivateMinutes = (agentConfig as any)?.autoReactivateMinutes ?? null; // NULL = nunca
    
    if (shouldPauseOnManualReply) {
      const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversation.id);
      if (!isAlreadyDisabled) {
        // Pausar com timer de auto-reativa��o (se configurado)
        await storage.disableAgentForConversation(conversation.id, autoReactivateMinutes);
        console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversation.id} - dono respondeu manualmente` + 
          (autoReactivateMinutes ? ` (reativa em ${autoReactivateMinutes}min)` : ' (manual only)'));
        
        // Cancelar qualquer resposta pendente do agente para esta conversa
        const pendingResponse = pendingResponses.get(conversation.id);
        if (pendingResponse) {
          clearTimeout(pendingResponse.timeout);
          pendingResponses.delete(conversation.id);
          console.log(`?? [AUTO-PAUSE] Resposta pendente do agente cancelada para ${contactNumber}`);
        }
        
        // ?? Notificar que a IA foi pausada para esta conversa (APENAS quando realmente pausar)
        broadcastToUser(session.userId, {
          type: "agent_auto_paused",
          conversationId: conversation.id,
          reason: "manual_reply",
          autoReactivateMinutes,
        });
      } else {
        // J� estava pausada, apenas atualizar timestamp do dono (reset timer)
        await storage.updateDisabledConversationOwnerReply(conversation.id);
        console.log(`?? [AUTO-PAUSE] Timer resetado para conversa ${conversation.id} - dono respondeu novamente`);
      }
    } else {
      console.log(`? [AUTO-PAUSE DESATIVADO] Dono respondeu manualmente mas pauseOnManualReply est� desativado - IA continua ativa`);
      
      // Ainda cancelar resposta pendente para evitar duplica��o
      const pendingResponse = pendingResponses.get(conversation.id);
      if (pendingResponse) {
        clearTimeout(pendingResponse.timeout);
        pendingResponses.delete(conversation.id);
        console.log(`? [AUTO-PAUSE DESATIVADO] Resposta pendente cancelada (dono respondeu primeiro) para ${contactNumber}`);
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

  console.log(`?? [FROM ME] Mensagem sincronizada: ${contactNumber} - "${messageText}"`);
}

async function handleIncomingMessage(session: WhatsAppSession, waMessage: WAMessage) {
  // ?? MODO DEV: Pular processamento se DISABLE_WHATSAPP_PROCESSING=true
  if (DISABLE_MESSAGE_PROCESSING) {
    console.log(`?? [DEV MODE] Ignorando mensagem recebida (processamento desabilitado)`);
    return;
  }

  const remoteJid = waMessage.key.remoteJid;
  if (!remoteJid) return;

  // ┌───────────────────────────────────────────────────────────────────────┐
  // │  🛡️ ANTI-REENVIO: VERIFICAÇÃO DE DEDUPLICAÇÃO DE MENSAGENS          │
  // │  Protege contra reprocessamento após instabilidade/restart           │
  // └───────────────────────────────────────────────────────────────────────┘
  const whatsappMessageId = waMessage.key.id;
  if (whatsappMessageId) {
    const contactNumber = remoteJid.replace('@s.whatsapp.net', '').replace('@lid', '').replace('@g.us', '');
    const conversationId = `${session.connectionId}:${contactNumber}`;
    
    // 🐛 FIX: Usar session.userId ao invés de session.connectionId
    // O incoming_message_log precisa do userId real para que o sistema
    // encontre o ai_agent_config correto ao processar mensagens
    const canProcess = await canProcessIncomingMessage({
      whatsappMessageId,
      userId: session.userId,  // CORRIGIDO: Era session.connectionId (bug que impedia respostas)
      conversationId,
      contactNumber,
    });
    
    if (!canProcess) {
      console.log(`🛡️ [ANTI-REENVIO] 🚫 Mensagem recebida BLOQUEADA (já processada)!`);
      console.log(`   📧 De: ${remoteJid.substring(0, 20)}...`);
      console.log(`   🆔 WhatsApp ID: ${whatsappMessageId}`);
      console.log(`   ⚠️ Proteção anti-reenvio após instabilidade/restart`);
      return;
    }
  }

  // Filtrar grupos e status - aceitar apenas conversas individuais
  // @g.us = grupos, @broadcast = status/listas de transmiss�o
  if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
    console.log(`Ignoring group/status message from: ${remoteJid}`);
    return;
  }

  // Aceitar apenas mensagens de n�meros individuais (@s.whatsapp.net ou @lid)
  const isIndividualJid =
    remoteJid.includes("@s.whatsapp.net") || remoteJid.includes("@lid");

  if (!isIndividualJid) {
    console.log(`Ignoring non-individual message from: ${remoteJid}`);
    return;
  }

  // +-----------------------------------------------------------------------+
  // �  ?? ATEN��O: C�DIGO CR�TICO - N�O ALTERAR SEM APROVA��O! ??          �
  // �-----------------------------------------------------------------------�
  // �  FIX LID 2025 - RESOLU��O DE CONTATOS INSTAGRAM/FACEBOOK             �
  // �                                                                       �
  // �  PROBLEMA RESOLVIDO:                                                  �
  // �  � Contatos do Instagram/Facebook v�m com @lid ao inv�s de n�mero    �
  // �  � Exemplo: "254635809968349@lid" (ID interno do Meta)               �
  // �                                                                       �
  // �  SOLU��O IMPLEMENTADA (TESTADA E FUNCIONANDO):                        �
  // �  � message.key.remoteJidAlt cont�m o n�mero REAL do WhatsApp         �
  // �  � Exemplo: "5517991956944@s.whatsapp.net"                           �
  // �                                                                       �
  // �  FLUXO CORRETO (MANTER SEMPRE ASSIM):                                 �
  // �  1. Extrair n�mero real de remoteJidAlt                              �
  // �  2. Usar n�mero real em contactNumber (exibi��o no CRM)              �
  // �  3. Usar n�mero real em normalizedJid (envio de mensagens)           �
  // �  4. Salvar mapeamento LID ? n�mero no whatsapp_contacts              �
  // �                                                                       �
  // �  ??  NUNCA MAIS USAR remoteJid DIRETAMENTE PARA @lid!                �
  // �  ??  SEMPRE USAR remoteJidAlt COMO FONTE DA VERDADE!                 �
  // �                                                                       �
  // �  Data: 2025-11-22                                                     �
  // �  Testado: ? Produ��o Railway                                         �
  // �  Status: ? 100% FUNCIONAL                                            �
  // +-----------------------------------------------------------------------+
  
  console.log(`\n?? [MESSAGE KEY DEBUG]`);
  console.log(`   remoteJid: ${remoteJid}`);
  console.log(`   remoteJidAlt: ${(waMessage.key as any).remoteJidAlt || "N/A"}`);
  console.log(`   pushName: ${waMessage.pushName || "N/A"}`);
  console.log(`   participantPn: ${(waMessage.key as any).participantPn || "N/A"}`);
  
  let contactNumber: string;
  let jidSuffix: string;
  let normalizedJid: string;
  
  // -----------------------------------------------------------------------
  // ?? SOLU��O DEFINITIVA: Usar remoteJidAlt (n�mero real para @lid)
  // -----------------------------------------------------------------------
  if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
    const realJid = (waMessage.key as any).remoteJidAlt;
    const realNumber = cleanContactNumber(realJid);
    
    console.log(`\n? [LID RESOLVIDO] N�mero real encontrado via remoteJidAlt!`);
    console.log(`   LID: ${remoteJid}`);
    console.log(`   JID WhatsApp REAL: ${realJid}`);
    console.log(`   N�mero limpo: ${realNumber}`);
    console.log(`   Nome: ${waMessage.pushName || "N/A"}\n`);
    
    // ??  CR�TICO: Usar n�mero REAL em todos os lugares, NUNCA o LID!
    contactNumber = realNumber;              // ? Para exibi��o (5517991956944)
    jidSuffix = "s.whatsapp.net";           // ? Suffix WhatsApp normal
    normalizedJid = realJid;                // ? Para enviar mensagens
    
    // ?? SALVAR NO CACHE EM MEM�RIA: Mapeamento LID ? n�mero
    // N�O salva mais no banco para economizar Egress/Disk IO
    // O cache de sess�o � suficiente para resolver @lid durante a sess�o
    session.contactsCache.set(remoteJid, {
      id: remoteJid,
      lid: remoteJid,
      phoneNumber: realJid,
      name: waMessage.pushName || undefined,
    });
    console.log(`?? [CACHE] Mapeamento LID ? phoneNumber salvo em mem�ria: ${remoteJid} ? ${realJid}`);
  } else {
    // Fallback: Contatos normais do WhatsApp (@s.whatsapp.net)
    const parsed = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
    contactNumber = parsed.contactNumber;
    jidSuffix = parsed.jidSuffix;
    normalizedJid = parsed.normalizedJid;
  }
  // -----------------------------------------------------------------------
  
  if (!contactNumber) {
    console.log(`[WhatsApp] Could not extract contact number from JID: ${remoteJid}`);
    return;
  }

  // BAILEYS 2025 OFICIAL: jidNormalizedUser() retorna JID limpo sem :device
  console.log(`[WhatsApp] Original JID: ${remoteJid}`);
  console.log(`[WhatsApp] Normalized JID: ${normalizedJid}`);
  console.log(`[WhatsApp] Clean number: ${contactNumber}`);
  
  // Ignorar mensagens do pr�prio n�mero conectado
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
  
  // ?? METADADOS PARA RE-DOWNLOAD DE M�DIA
  // Esses campos permitem baixar a m�dia novamente do WhatsApp enquanto ainda estiver dispon�vel
  let mediaKey: string | null = null;      // Chave de descriptografia (base64)
  let directPath: string | null = null;    // Caminho no servidor WhatsApp
  let mediaUrlOriginal: string | null = null; // URL original do WhatsApp

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
    messageText = mediaCaption || "📷 Imagem";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.imageMessage.mediaKey) {
      mediaKey = Buffer.from(msg.imageMessage.mediaKey).toString("base64");
    }
    directPath = msg.imageMessage.directPath || null;
    mediaUrlOriginal = msg.imageMessage.url || null;
    
    try {
      console.log(`📷 [CLIENT] Baixando imagem...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`📷 [CLIENT] Imagem baixada: ${buffer.length} bytes`);
      // Upload para Supabase Storage (SEM fallback base64 para evitar egress!)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "imagem");
      if (!mediaUrl) {
        console.warn(`⚠️ [CLIENT] Falha no upload de imagem, não será salva`);
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
    messageText = "🎵 Áudio";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.audioMessage.mediaKey) {
      mediaKey = Buffer.from(msg.audioMessage.mediaKey).toString("base64");
    }
    directPath = msg.audioMessage.directPath || null;
    mediaUrlOriginal = msg.audioMessage.url || null;
    
    try {
      console.log(`🎙️ [CLIENT] Baixando áudio...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`🎙️ [CLIENT] Áudio baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (SEM fallback base64 para evitar egress!)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "audio");
      if (!mediaUrl) {
        console.warn(`⚠️ [CLIENT] Falha no upload de áudio, não será salvo`);
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
    messageText = mediaCaption || "🎥 Vídeo";
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.videoMessage.mediaKey) {
      mediaKey = Buffer.from(msg.videoMessage.mediaKey).toString("base64");
    }
    directPath = msg.videoMessage.directPath || null;
    mediaUrlOriginal = msg.videoMessage.url || null;
    
    try {
      console.log(`?? [CLIENT] Baixando v�deo...`);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] V�deo baixado: ${buffer.length} bytes`);
      // Upload para Supabase Storage (v�deos s�o sempre grandes)
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, "video");
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar v�deo:", error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // ?? DOCUMENTO COM LEGENDA (documentWithCaptionMessage) - WRAPPER DO WHATSAPP
  // Documentos com legenda chegam em: msg.documentWithCaptionMessage.message.documentMessage
  // -----------------------------------------------------------------------
  else if (msg?.documentWithCaptionMessage?.message?.documentMessage) {
    const docMsg = msg.documentWithCaptionMessage.message.documentMessage;
    mediaType = "document";
    mediaMimeType = docMsg.mimetype || "application/octet-stream";
    mediaCaption = docMsg.caption || null;
    const fileName = docMsg.fileName || "Documento";
    messageText = mediaCaption || `📄 ${fileName}`;
    
    // 🔑 Extrair metadados para re-download posterior
    if (docMsg.mediaKey) {
      mediaKey = Buffer.from(docMsg.mediaKey).toString("base64");
    }
    directPath = docMsg.directPath || null;
    mediaUrlOriginal = docMsg.url || null;
    
    // 📄 DOCUMENTO DO CLIENTE (COM CAPTION): Baixar e upload para Supabase Storage
    try {
      console.log(`?? [CLIENT] Baixando documento (com caption): ${fileName}...`);
      console.log(`?? [CLIENT] mediaKey presente:`, !!docMsg.mediaKey);
      console.log(`?? [CLIENT] directPath presente:`, !!docMsg.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, fileName);
      console.log(`? [CLIENT] Documento (com caption) processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar documento (com caption):", error);
      mediaUrl = null;
    }
  }
  // -----------------------------------------------------------------------
  // ?? DOCUMENTO SIMPLES (documentMessage) - SEM WRAPPER
  // -----------------------------------------------------------------------
  else if (msg?.documentMessage) {
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    mediaCaption = msg.documentMessage.caption || null;
    const fileName = msg.documentMessage.fileName || "Documento";
    messageText = mediaCaption || `📄 ${fileName}`;
    
    // 🔑 Extrair metadados para re-download posterior
    if (msg.documentMessage.mediaKey) {
      mediaKey = Buffer.from(msg.documentMessage.mediaKey).toString("base64");
    }
    directPath = msg.documentMessage.directPath || null;
    mediaUrlOriginal = msg.documentMessage.url || null;
    
    // 📄 DOCUMENTO DO CLIENTE: Baixar e upload para Supabase Storage
    try {
      console.log(`?? [CLIENT] Baixando documento: ${fileName}...`);
      console.log(`?? [CLIENT] mediaKey presente:`, !!msg.documentMessage.mediaKey);
      console.log(`?? [CLIENT] directPath presente:`, !!msg.documentMessage.directPath);
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      console.log(`?? [CLIENT] Documento baixado: ${buffer.length} bytes, fazendo upload...`);
      // Upload para Supabase Storage
      mediaUrl = await uploadMediaSimple(buffer, mediaMimeType, fileName);
      console.log(`? [CLIENT] Documento processado: ${mediaUrl ? 'URL gerada' : 'falhou'}`);
    } catch (error) {
      console.error("? [CLIENT] Erro ao baixar documento:", error);
      mediaUrl = null;
    }
  }
    // Ignorar mensagens de tipos não suportados (reações, status, etc)
  else {
    console.log(`Ignoring unsupported message type from ${contactNumber}:`, Object.keys(msg || {}));
    return; // Não processar mensagens não suportadas
  }

  // ??? BUSCAR FOTO DE PERFIL DO CONTATO
  let contactAvatar: string | null = null;
  try {
    if (session.socket) {
      const profilePicUrl = await session.socket.profilePictureUrl(normalizedJid, "image");
      if (profilePicUrl) {
        contactAvatar = profilePicUrl;
        console.log(`??? [AVATAR] Foto de perfil obtida para ${contactNumber}`);
      }
    }
  } catch (error) {
    // Contato sem foto de perfil (normal, n�o � erro)
    console.log(`?? [AVATAR] Sem foto de perfil para ${contactNumber}`);
  }

  // EXATAMENTE como no backup - buscar/criar/atualizar com contactNumber
  let conversation = await storage.getConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber, // N�mero LIMPO para exibir no CRM
      remoteJid: normalizedJid, // JID normalizado para enviar mensagens
      jidSuffix,
      contactName: waMessage.pushName,
      contactAvatar, // ??? Foto de perfil
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
      unreadCount: 1,
    });
  } else {
    await storage.updateConversation(conversation.id, {
      remoteJid: normalizedJid, // Atualizar JID (pode mudar)
      jidSuffix,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      lastMessageFromMe: false,
      unreadCount: (conversation.unreadCount || 0) + 1,
      contactName: waMessage.pushName || conversation.contactName,
      contactAvatar: contactAvatar || conversation.contactAvatar, // Atualizar foto se dispon�vel
    });
  }

  // ? FOLLOW-UP USU�RIOS: Resetar ciclo quando cliente responde
  // O sistema de follow-up para usu�rios usa a tabela "conversations" (n�o admin_conversations)
  try {
    await userFollowUpService.resetFollowUpCycle(conversation.id, "Cliente respondeu");
  } catch (error) {
    console.error("Erro ao resetar follow-up do usu�rio:", error);
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
      // 🔑 Metadados para re-download de mídia do WhatsApp
      mediaKey,
      directPath,
      mediaUrlOriginal,
    });
    
    // -----------------------------------------------------------------------
    // 🚨 SISTEMA DE RECUPERAÇÃO: Marcar mensagem como PROCESSADA com sucesso
    // -----------------------------------------------------------------------
    // Se chegou até aqui, a mensagem foi salva no banco de dados
    // Podemos marcar como processada na tabela pending_incoming_messages
    // -----------------------------------------------------------------------
    if (waMessage.key.id) {
      try {
        await markMessageAsProcessed(waMessage.key.id);
      } catch (markErr) {
        console.error(`🚨 [RECOVERY] Erro ao marcar como processada:`, markErr);
        // Não bloqueia - mensagem já foi salva no banco principal
      }
    }

    // ?? FIX CR�TICO: savedMessage.text pode conter transcri��o de �udio!
    // createMessage() transcreve automaticamente �udios ANTES de retornar.
    // Por isso SEMPRE usamos savedMessage.text (e n�o messageText original).
    const effectiveText = savedMessage.text || messageText;

    // Se a mensagem de m�dia (ex: �udio) tiver sido transcrita ao salvar,
    // garantimos que o �ltimo texto da conversa use essa transcri��o.
    if (effectiveText !== messageText) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: effectiveText,
        lastMessageTime: new Date(),
      });
    }

    broadcastToUser(session.userId, {
      type: "new_message",
      conversationId: conversation.id,
      message: effectiveText, // ? Usar texto transcrito (se for �udio)
      mediaType,
  });

  // 🤖 AI Agent/Chatbot Auto-Response com SISTEMA DE ACUMULAÇÃO DE MENSAGENS
  // ⚠️ IMPORTANTE: O check de "isAgentDisabled" se aplica TANTO à IA quanto ao CHATBOT/FLUXO!
  // Quando o dono responde manualmente, AMBOS os sistemas são pausados.
  try {
    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    // 🚫 LISTA DE EXCLUSÃO: Verificar se o número está na lista de exclusão
    const isExcluded = await storage.isNumberExcluded(session.userId, contactNumber);
    if (isExcluded) {
      console.log(`🚫 [AI AGENT] Número ${contactNumber} está na LISTA DE EXCLUSÃO - não responder automaticamente`);
      return;
    }
    
    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ 🔴 FIX CRÍTICO: Verificar se AMBOS (IA E CHATBOT) estão pausados       │
    // │ Quando dono responde manualmente, o sistema inteiro pausa, não só IA!  │
    // │ Data: 2025-01-XX - Sincronização Flow Builder + IA Agent               │
    // └─────────────────────────────────────────────────────────────────────────┘
    if (isAgentDisabled) {
      console.log(`⏸️ [AUTO-PAUSE ATIVO] IA/Chatbot pausados para conversa ${conversation.id}`);
      console.log(`   📱 Contato: ${contactNumber} | Motivo: dono respondeu manualmente ou transferência`);
      
      // Marcar que cliente tem mensagem pendente (para auto-reativação responder depois)
      try {
        await storage.markClientPendingMessage(conversation.id);
        console.log(`📌 [AUTO-REATIVATE] Cliente enviou mensagem enquanto pausado - marcado como pendente`);
      } catch (err) {
        console.error("Erro ao marcar mensagem pendente:", err);
      }
      
      // ⚠️ NÃO processar nem pelo chatbot nem pela IA enquanto pausado!
      return;
    }
    
    // ✅ Agente/Chatbot NÃO está pausado - processar normalmente
    
    // 🤖 CHATBOT DE FLUXO: Verificar se o usuário tem chatbot ativo ANTES da IA
    // O chatbot tem prioridade sobre a IA quando ambos estão configurados
    const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
    const isFirstContact = await isNewContact(conversation.id);
    const chatbotResult = await tryProcessChatbotMessage(
      session.userId,
      conversation.id,
      contactNumber,
      effectiveText,
      isFirstContact
    );
    
    if (chatbotResult.handled) {
      console.log(`🤖 [CHATBOT] Mensagem processada pelo chatbot de fluxo`);
      if (chatbotResult.transferToHuman) {
        console.log(`🤖 [CHATBOT] Conversa transferida para humano - IA/Chatbot desativados para esta conversa`);
      }
      return; // Chatbot já processou, não precisa da IA
    }
    
    // 🔴 CRÍTICO: Verificar se última mensagem foi do cliente (não do agente)
    // Se última mensagem for do agente, NÃO responder (evita loop)
    const recentMessages = await storage.getMessagesByConversationId(conversation.id);
    const lastMessage = recentMessages[recentMessages.length - 1];
    
    if (lastMessage && lastMessage.fromMe) {
      console.log(`🔴 [AI AGENT] Última mensagem foi do agente, não respondendo (evita loop)`);
      return;
    }
    
    // ✅ IA pode responder (não está pausada e chatbot não processou)
    {
      const userId = session.userId;
      const conversationId = conversation.id;
      const targetNumber = contactNumber;
      const finalText = effectiveText;
      
      // ?? SISTEMA DE ACUMULA��O: Buscar delay configurado
      const agentConfig = await storage.getAgentConfig(userId);
      const responseDelaySeconds = agentConfig?.responseDelaySeconds ?? 30;
      const responseDelayMs = responseDelaySeconds * 1000;
      
      // Verificar se j� existe um timeout pendente para esta conversa
      const existingPending = pendingResponses.get(conversationId);
      
      if (existingPending) {
        // ✅ ACUMULAÇÃO: Nova mensagem chegou - cancelar timeout anterior e acumular
        clearTimeout(existingPending.timeout);
        existingPending.messages.push(finalText);
        console.log(`📨 [AI AGENT] Mensagem acumulada (${existingPending.messages.length} mensagens) para ${targetNumber}`);
        console.log(`📝 [AI AGENT] Mensagens acumuladas: ${existingPending.messages.map(m => `"${m.substring(0, 30)}..."`).join(' | ')}`);
        
        const executeAt = new Date(Date.now() + responseDelayMs);
        
        // Criar novo timeout com as mensagens acumuladas
        existingPending.timeout = setTimeout(async () => {
          await processAccumulatedMessages(existingPending);
        }, responseDelayMs);
        
        console.log(`🔄 [AI AGENT] Timer reiniciado: ${responseDelaySeconds}s para ${targetNumber}`);
        
        // 💾 PERSISTENT TIMER: Atualizar no banco
        try {
          await storage.updatePendingAIResponseMessages(conversationId, existingPending.messages, executeAt);
          console.log(`💾 [AI AGENT] Timer atualizado no banco - ${existingPending.messages.length} msgs - executa às ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`⚠️ [AI AGENT] Erro ao atualizar timer no banco (não crítico):`, dbError);
        }
      } else {
        // Nova conversa - criar entrada de acumulação
        console.log(`🕐 [AI AGENT] Novo timer de ${responseDelaySeconds}s para ${targetNumber}...`);
        console.log(`📝 [AI AGENT] Primeira mensagem: "${finalText}"`);
        
        const executeAt = new Date(Date.now() + responseDelayMs);
        
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
        
        // 💾 PERSISTENT TIMER: Salvar no banco para sobreviver a restarts
        try {
          await storage.savePendingAIResponse({
            conversationId,
            userId,
            contactNumber: targetNumber,
            jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
            messages: [finalText],
            executeAt,
          });
          console.log(`💾 [AI AGENT] Timer persistido no banco - executa às ${executeAt.toISOString()}`);
        } catch (dbError) {
          console.error(`⚠️ [AI AGENT] Erro ao persistir timer (não crítico):`, dbError);
        }
      }
    }
  } catch (error) {
    console.error("Error scheduling AI response:", error);
  }
}

// 🔄 FUNÇÃO PARA PROCESSAR MENSAGENS ACUMULADAS
async function processAccumulatedMessages(pending: PendingResponse): Promise<void> {
  const { conversationId, userId, contactNumber, jidSuffix, messages } = pending;
  
  // 🔒 ANTI-DUPLICAÇÃO: Verificar se já está processando esta conversa
  if (conversationsBeingProcessed.has(conversationId)) {
    console.log(`🔒 [AI AGENT] ⚠️ Conversa ${conversationId} já está sendo processada, IGNORANDO duplicata`);
    return;
  }
  
  // 🔒 Marcar como em processamento ANTES de qualquer coisa
  conversationsBeingProcessed.add(conversationId);
  
  // 🚨 CRÍTICO: Verificar se IA foi desativada ANTES de processar timer
  // Bug: Timer criado quando IA ativa pode executar depois que IA foi desativada
  const isAgentDisabled = await storage.isAgentDisabledForConversation(conversationId);
  if (isAgentDisabled) {
    console.log(`\n${'!'.repeat(60)}`);
    console.log(`🚫 [AI AGENT] IA DESATIVADA - Timer cancelado`);
    console.log(`   conversationId: ${conversationId}`);
    console.log(`   contactNumber: ${contactNumber}`);
    console.log(`   👉 IA foi desativada entre criação e execução do timer`);
    console.log(`${'!'.repeat(60)}\n`);
    
    // Marcar timer como completed (cancelado) para não reprocessar
    await storage.markPendingAIResponseCompleted(conversationId);
    conversationsBeingProcessed.delete(conversationId);
    pendingResponses.delete(conversationId);
    return;
  }
  
  // Remover da fila de pendentes
  pendingResponses.delete(conversationId);
  
  const totalWaitTime = ((Date.now() - pending.startTime) / 1000).toFixed(1);
  console.log(`\n🔄 [AI AGENT] =========== PROCESSANDO RESPOSTA ===========`);
  console.log(`   ⏱️ Aguardou ${totalWaitTime}s | ${messages.length} mensagem(s) acumulada(s)`);
  console.log(`   📞 Contato: ${contactNumber}`);
  
  // 🎯 FLAG DE SUCESSO: Só marca completed se a mensagem foi REALMENTE enviada
  let responseSuccessful = false;
  
  try {
    const currentSession = sessions.get(userId);
    if (!currentSession?.socket) {
      console.log(`\n${'!'.repeat(60)}`);
      console.log(`⚠️ [AI Agent] BLOQUEIO: Session/socket não disponível`);
      console.log(`   userId: ${userId}`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   👉 WhatsApp provavelmente desconectado`);
      console.log(`${'!'.repeat(60)}\n`);
      
      // 🔄 FIX: Reagendar para tentar novamente em 30 segundos
      // Timer ficará "pending" no banco e será reprocessado
      console.log(`🔄 [AI AGENT] Reagendando timer para ${contactNumber} em 30s (sessão indisponível)...`);
      
      const retryPending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        contactNumber,
        jidSuffix,
        startTime: pending.startTime, // Manter tempo original
      };
      
      retryPending.timeout = setTimeout(async () => {
        console.log(`🔄 [AI AGENT] Retry: Tentando processar ${contactNumber} novamente...`);
        await processAccumulatedMessages(retryPending);
      }, 30000); // 30 segundos
      
      pendingResponses.set(conversationId, retryPending);
      
      // Atualizar execute_at no banco para refletir o novo horário
      const newExecuteAt = new Date(Date.now() + 30000);
      try {
        await storage.updatePendingAIResponseMessages(conversationId, messages, newExecuteAt);
        console.log(`💾 [AI AGENT] Timer reagendado no banco para ${newExecuteAt.toISOString()}`);
      } catch (dbErr) {
        console.error(`⚠️ [AI AGENT] Erro ao reagendar no banco:`, dbErr);
      }
      
      // Remover do processamento para permitir retry
      conversationsBeingProcessed.delete(conversationId);
      return;
    }
    
    // 🔒 CHECK DE LIMITE DE MENSAGENS E PLANO VENCIDO
    const FREE_TRIAL_LIMIT = 25;
    const connection = await storage.getConnectionByUserId(userId);
    if (connection) {
      const subscription = await storage.getUserSubscription(userId);
      
      // ✅ CORREÇÃO: Verificar status E se o plano está vencido por data
      let hasActiveSubscription = subscription?.status === 'active';
      let isSubscriptionExpired = false;
      
      // 🔍 Verificar se o plano está vencido pela data_fim
      if (subscription?.dataFim) {
        const endDate = new Date(subscription.dataFim);
        const now = new Date();
        if (now > endDate) {
          isSubscriptionExpired = true;
          hasActiveSubscription = false;
          console.log(`🚫 [AI AGENT] PLANO VENCIDO! data_fim: ${endDate.toISOString()} < agora: ${now.toISOString()}`);
        }
      }
      
      // 🔍 Verificar também pelo next_payment_date (para assinaturas recorrentes)
      if (subscription?.nextPaymentDate && !isSubscriptionExpired) {
        const nextPayment = new Date(subscription.nextPaymentDate);
        const now = new Date();
        // Considerar vencido se passou mais de 5 dias da data de pagamento
        const daysOverdue = Math.floor((now.getTime() - nextPayment.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 5) {
          isSubscriptionExpired = true;
          hasActiveSubscription = false;
          console.log(`🚫 [AI AGENT] PAGAMENTO EM ATRASO! ${daysOverdue} dias - nextPaymentDate: ${nextPayment.toISOString()}`);
        }
      }
      
      if (!hasActiveSubscription) {
        const agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
        
        // 🚫 Se plano venceu, também volta pro limite de 25 mensagens (plano de teste)
        if (isSubscriptionExpired) {
          console.log(`🚫 [AI AGENT] Plano vencido! Cliente volta ao limite de ${FREE_TRIAL_LIMIT} mensagens de teste.`);
          console.log(`   📊 Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
          
          // Se já usou as mensagens de teste, bloqueia completamente
          if (agentMessagesCount >= FREE_TRIAL_LIMIT) {
            console.log(`\n${'!'.repeat(60)}`);
            console.log(`🚫 [AI AGENT] BLOQUEIO: Plano vencido E limite de teste atingido`);
            console.log(`   userId: ${userId}`);
            console.log(`   contactNumber: ${contactNumber}`);
            console.log(`   Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
            console.log(`   👉 IA PAUSADA para este cliente - precisa renovar assinatura`);
            console.log(`${'!'.repeat(60)}\n`);
            return;
          }
        }
        
        if (agentMessagesCount >= FREE_TRIAL_LIMIT) {
          console.log(`\n${'!'.repeat(60)}`);
          console.log(`🚫 [AI AGENT] BLOQUEIO: Limite de ${FREE_TRIAL_LIMIT} mensagens atingido`);
          console.log(`   userId: ${userId}`);
          console.log(`   contactNumber: ${contactNumber}`);
          console.log(`   Mensagens usadas: ${agentMessagesCount}/${FREE_TRIAL_LIMIT}`);
          console.log(`   👉 Usuário precisa assinar plano`);
          console.log(`${'!'.repeat(60)}\n`);
          // Não enviar resposta - limite atingido
          return;
        }
        
        console.log(`📊 [AI AGENT] Uso: ${agentMessagesCount + 1}/${FREE_TRIAL_LIMIT} mensagens`);
      } else {
        console.log(`✅ [AI AGENT] Usuário tem plano pago ativo e válido: ${subscription?.plan?.nome || 'Plano'}`);
      }
    }
    
    // Combinar todas as mensagens acumuladas
    const combinedText = messages.join('\n\n');
    console.log(`   ?? Texto combinado: "${combinedText.substring(0, 150)}..."`);

    // ?? BUSCAR HIST�RICO DE CONVERSAS
    let conversationHistory = await storage.getMessagesByConversationId(conversationId);
    
    // ?? BUSCAR NOME DO CLIENTE DA CONVERSA
    const conversation = await storage.getConversation(conversationId);
    const contactName = conversation?.contactName || undefined;
    console.log(`?? [AI AGENT] Nome do cliente: ${contactName || 'N�o identificado'}`);
    
    // ?? BUSCAR M�DIAS J� ENVIADAS NESTA CONVERSA (para evitar repeti��o)
    const sentMedias: string[] = [];
    for (const msg of conversationHistory) {
      if (msg.fromMe && msg.isFromAgent) {
        // M�todo 1: Detectar tags de m�dia no texto das mensagens
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
        
        // M�todo 2: Detectar tags no campo mediaCaption (novo formato)
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
    console.log(`?? [AI AGENT] M�dias j� enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // Verificar se modo hist�rico est� ativo
    const agentConfig = await storage.getAgentConfig(userId);
    
    if (agentConfig?.fetchHistoryOnFirstResponse) {
      console.log(`?? [AI AGENT] Modo hist�rico ATIVO - ${conversationHistory.length} mensagens dispon�veis para contexto`);
      
      if (conversationHistory.length > 40) {
        console.log(`?? [AI AGENT] Hist�rico grande - ser� usado sistema de resumo inteligente`);
      }
    }

    const aiResult = await generateAIResponse(
      userId,
      conversationHistory,
      combinedText, // ? Todas as mensagens combinadas
      {
        contactName, // ? Nome do cliente para personaliza��o
        contactPhone: contactNumber, // ? Telefone do cliente para agendamento
        sentMedias,  // ? M�dias j� enviadas para evitar repeti��o
        conversationId, // 🍕 ID da conversa para vincular pedidos de delivery
      }
    );

    // ?? Extrair texto e a��es de m�dia da resposta
    const aiResponse = aiResult?.text || null;
    const mediaActions = aiResult?.mediaActions || [];

    // 📢 NOTIFICATION SYSTEM UNIVERSAL (AI + Manual + Resposta do Agente)
    const businessConfig = await storage.getBusinessAgentConfig(userId);
    
    // 🔍 DEBUG: Log detalhado do businessConfig para diagnóstico
    console.log(`🔔 [NOTIFICATION DEBUG] userId: ${userId}`);
    console.log(`🔔 [NOTIFICATION DEBUG] businessConfig exists: ${!!businessConfig}`);
    if (businessConfig) {
      console.log(`🔔 [NOTIFICATION DEBUG] notificationEnabled: ${businessConfig.notificationEnabled}`);
      console.log(`🔔 [NOTIFICATION DEBUG] notificationMode: ${businessConfig.notificationMode}`);
      console.log(`🔔 [NOTIFICATION DEBUG] notificationManualKeywords: ${businessConfig.notificationManualKeywords}`);
      console.log(`🔔 [NOTIFICATION DEBUG] notificationPhoneNumber: ${businessConfig.notificationPhoneNumber}`);
    }
    console.log(`🔔 [NOTIFICATION DEBUG] clientMessage (combinedText): "${combinedText?.substring(0, 100)}"`);
    console.log(`🔔 [NOTIFICATION DEBUG] aiResponse: "${aiResponse?.substring(0, 100) || 'null'}"`);
    
    let shouldNotify = false;
    let notifyReason = "";
    let keywordSource = ""; // Para tracking de onde veio o gatilho
    
    // Check AI notification (tag [NOTIFY:] na resposta)
    if (aiResult?.notification?.shouldNotify) {
      shouldNotify = true;
      notifyReason = aiResult.notification.reason;
      keywordSource = "IA";
      console.log(`📢 [AI Agent] AI detected notification trigger: ${notifyReason}`);
    }
    
    // Check Manual keyword notification (if mode is "manual" or "both")
    // 🔍 DEBUG: Log da condição de verificação
    const conditionCheck = {
      notificationEnabled: !!businessConfig?.notificationEnabled,
      notificationManualKeywords: !!businessConfig?.notificationManualKeywords,
      notificationMode: businessConfig?.notificationMode,
      modeMatches: businessConfig?.notificationMode === "manual" || businessConfig?.notificationMode === "both"
    };
    console.log(`🔔 [NOTIFICATION DEBUG] Keyword check condition: ${JSON.stringify(conditionCheck)}`);
    
    if (businessConfig?.notificationEnabled && 
        businessConfig?.notificationManualKeywords &&
        (businessConfig.notificationMode === "manual" || businessConfig.notificationMode === "both")) {
      
      console.log(`🔔 [NOTIFICATION DEBUG] ✅ Entering keyword check block!`);
      
      const keywords = businessConfig.notificationManualKeywords
        .split(',')
        .map(k => k.trim().toLowerCase())
        .filter(k => k.length > 0);
      
      console.log(`🔔 [NOTIFICATION DEBUG] Keywords to check: ${JSON.stringify(keywords)}`);
      
      // 📢 VERIFICAR TANTO NA MENSAGEM DO CLIENTE QUANTO NA RESPOSTA DO AGENTE
      const clientMessage = combinedText.toLowerCase();
      const agentMessage = (aiResponse || "").toLowerCase();
      
      console.log(`🔔 [NOTIFICATION DEBUG] clientMessage: "${clientMessage.substring(0, 100)}"`);
      console.log(`🔔 [NOTIFICATION DEBUG] agentMessage: "${agentMessage.substring(0, 100)}"`);
      
      for (const keyword of keywords) {
        console.log(`🔔 [NOTIFICATION DEBUG] Checking keyword: "${keyword}"`);
        console.log(`🔔 [NOTIFICATION DEBUG] Client includes "${keyword}": ${clientMessage.includes(keyword)}`);
        console.log(`🔔 [NOTIFICATION DEBUG] Agent includes "${keyword}": ${agentMessage.includes(keyword)}`);
        
        // Verificar na mensagem do cliente
        if (clientMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "cliente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (cliente)` : "Manual (cliente)";
          console.log(`📢 [AI Agent] Manual keyword in CLIENT message: "${keyword}"`);
          break;
        }
        
        // 📢 Verificar na resposta do agente (NOVO!)
        if (agentMessage.includes(keyword)) {
          shouldNotify = true;
          const source = "agente";
          notifyReason = notifyReason 
            ? `${notifyReason} + Palavra-chave (${source}): "${keyword}"` 
            : `Palavra-chave detectada (${source}): "${keyword}"`;
          keywordSource = keywordSource ? `${keywordSource} + Manual (agente)` : "Manual (agente)";
          console.log(`📢 [AI Agent] Manual keyword in AGENT response: "${keyword}"`);
          break;
        }
      }
    } else {
      console.log(`🔔 [NOTIFICATION DEBUG] ❌ Skipping keyword check - conditions not met`);
    }
    
    // Log completo da detecção
    if (shouldNotify) {
      console.log(`📢 [AI Agent] NOTIFICATION TRIGGERED via: ${keywordSource}`);
    }
    
    // Send notification if triggered
    if (shouldNotify && businessConfig?.notificationPhoneNumber) {
      const notifyNumber = businessConfig.notificationPhoneNumber.replace(/\D/g, '');
      const notifyJid = `${notifyNumber}@s.whatsapp.net`;
      
      // 📢 Mensagem de notificação melhorada com contexto
      const notifyMessage = `📢 *NOTIFICAÇÃO DO AGENTE*\n\n` +
        `?? *Motivo:* ${notifyReason}\n` +
        `?? *Fonte:* ${keywordSource}\n\n` +
        `?? *Cliente:* ${contactNumber}\n` +
        `?? *Mensagem do cliente:* "${combinedText.substring(0, 200)}${combinedText.length > 200 ? '...' : ''}"\n` +
        (aiResponse ? `?? *Resposta do agente:* "${aiResponse.substring(0, 200)}${aiResponse.length > 200 ? '...' : ''}"` : '');
      
      try {
        // ??? ANTI-BLOQUEIO: Usar fila do usu�rio para notifica��o
        await sendWithQueue(userId, 'notifica��o NOTIFY', async () => {
          await currentSession.socket.sendMessage(notifyJid, { text: notifyMessage });
        });
        console.log(`?? [AI Agent] Notification sent to ${notifyNumber}`);
      } catch (error) {
        console.error(`? [AI Agent] Failed to send notification to ${notifyNumber}:`, error);
      }
    }

    console.log(`?? [AI Agent] generateAIResponse retornou: ${aiResponse ? `"${aiResponse.substring(0, 100)}..."` : 'NULL'}`);
    if (mediaActions.length > 0) {
      console.log(`?? [AI Agent] ${mediaActions.length} a��es de m�dia: ${mediaActions.map(a => a.media_name).join(', ')}`);
    }

    if (aiResponse) {
      // Buscar remoteJid original do banco
      const conversationData = await storage.getConversation(conversationId);
      const jid = conversationData
        ? buildSendJid(conversationData)
        : `${contactNumber}@${jidSuffix || DEFAULT_JID_SUFFIX}`;
      
      // ?? ANTI-DUPLICA��O: Verificar se resposta j� foi enviada recentemente
      if (isRecentDuplicate(conversationId, aiResponse)) {
        console.log(`?? [AI AGENT] ?? Resposta ID�NTICA j� enviada nos �ltimos 2 minutos, IGNORANDO duplicata`);
        console.log(`   ?? Texto: "${aiResponse.substring(0, 100)}..."`);
        return;
      }
      
      // ?? Registrar resposta no cache anti-duplica��o
      registerSentMessageCache(conversationId, aiResponse);
      
      // ?? HUMANIZA��O: Quebrar mensagens longas em m�ltiplas
      const agentConfig = await storage.getAgentConfig(userId);
      const maxChars = agentConfig?.messageSplitChars ?? 400;
      const messageParts = splitMessageHumanLike(aiResponse, maxChars);
      
      console.log(`[AI Agent] Sending to original JID: ${jid} (${messageParts.length} parts)`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const isLast = i === messageParts.length - 1;
        
        // ??? ANTI-BLOQUEIO: Usar fila de mensagens para garantir delay entre envios
        // Cada WhatsApp tem sua pr�pria fila - m�ltiplos usu�rios podem enviar ao mesmo tempo
        // ? Texto enviado EXATAMENTE como gerado pela IA (varia��o REMOVIDA do sistema)
        const queueResult = await messageQueueService.enqueue(userId, jid, part, {
          isFromAgent: true,
          priority: 'high', // Respostas da IA = prioridade alta
        });

        const messageId = queueResult.messageId || `${Date.now()}-${i}`;

        await storage.createMessage({
          conversationId: conversationId,
          messageId,
          fromMe: true,
          text: part, // ? Texto original sem varia��o
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });

        // Só atualizar conversa na última parte
        if (isLast) {
          await storage.updateConversation(conversationId, {
            lastMessageText: part,
            lastMessageTime: new Date(),
            // 🔧 FIX: Marcar que a conversa foi respondida (IA também conta!)
            hasReplied: true,
            lastMessageFromMe: true,
          });

          broadcastToUser(userId, {
            type: "agent_response",
            conversationId: conversationId,
            message: aiResponse,
          });
        }

        console.log(`[AI Agent] Part ${i+1}/${messageParts.length} SENT to WhatsApp ${contactNumber}`);
      }
      
      // 🎤 TTS: Gerar e enviar áudio da resposta (se configurado)
      try {
        const audioSent = await processAudioResponseForAgent(
          userId,
          jid,
          aiResponse,
          currentSession.socket
        );
        if (audioSent) {
          console.log(`🎤 [AI Agent] Áudio TTS enviado junto com a resposta`);
        }
      } catch (audioError) {
        console.error(`⚠️ [AI Agent] Erro ao processar áudio TTS (não crítico):`, audioError);
        // Continuar mesmo se falhar - o texto já foi enviado
      }
      
      // 🎬 EXECUTAR AÇÕES DE MÍDIA (enviar áudios, imagens, vídeos)
      if (mediaActions.length > 0) {
        console.log(`🎬 [AI Agent] Executando ${mediaActions.length} ações de mídia...`);
        
        const conversationDataForMedia = await storage.getConversation(conversationId);
        const mediaJid = conversationDataForMedia
          ? buildSendJid(conversationDataForMedia)
          : jid;
        
        await new Promise(resolve => setTimeout(resolve, 1500 + Math.random() * 1000));
        
        await executeMediaActions({
          userId,
          jid: mediaJid,
          conversationId, // Passar conversationId para salvar mensagens de m�dia
          actions: mediaActions,
          socket: currentSession.socket,
        });
        
        console.log(`?? [AI Agent] M�dias enviadas com sucesso!`);
      }

      // 🔄 FOLLOW-UP: Se agente enviou mensagem, agendar follow-up inicial
      try {
        await followUpService.scheduleInitialFollowUp(conversationId);
      } catch (error) {
        console.error("Erro ao agendar follow-up:", error);
      }
      
      // ✅ MARCAR COMO SUCESSO - A resposta foi enviada
      responseSuccessful = true;
      console.log(`✅ [AI AGENT] Resposta enviada com sucesso para ${contactNumber}`);
    } else {
      console.log(`\n${'='.repeat(60)}`);
      console.log(`⚠️ [AI Agent] RESPOSTA NULL - Nenhuma resposta gerada!`);
      console.log(`   conversationId: ${conversationId}`);
      console.log(`   contactNumber: ${contactNumber}`);
      console.log(`   Possíveis causas (verifique logs acima para "RETURN NULL"):`);
      console.log(`   1. Usuário SUSPENSO`);
      console.log(`   2. Mensagem de BOT detectada`);
      console.log(`   3. agentConfig não encontrado ou isActive=false`);
      console.log(`   4. Trigger phrases configuradas mas nenhuma encontrada`);
      console.log(`   5. Erro na API de LLM (timeout, rate limit)`);
      console.log(`${'='.repeat(60)}\n`);
      
      // ❌ NÃO marcar responseSuccessful - timer será mantido como pending para retry
    }
  } catch (error) {
    console.error("❌ [AI AGENT] RETURN NULL #6: Exceção capturada no catch externo:", error);
  } finally {
    // 🔒 ANTI-DUPLICAÇÃO: Remover da lista de conversas em processamento
    conversationsBeingProcessed.delete(conversationId);
    
    // 💾 PERSISTENT TIMER: Marcar como completed APENAS se resposta foi enviada com sucesso
    if (responseSuccessful) {
      try {
        await storage.markPendingAIResponseCompleted(conversationId);
        console.log(`✅ [AI AGENT] Timer marcado como completed - resposta enviada com sucesso!`);
      } catch (dbError) {
        console.error(`⚠️ [AI AGENT] Erro ao marcar timer como completed (não crítico):`, dbError);
      }
    } else {
      // 🔄 FIX: Reagendar timer para retry em 15 segundos
      // Isso evita processamento imediato em loop quando há erros temporários
      try {
        await storage.resetPendingAIResponseForRetry(conversationId);
        console.warn(`🔄 [AI AGENT] Timer reagendado para retry em 30s - resposta falhou (conversationId: ${conversationId})`);
      } catch (dbError) {
        console.error(`⚠️ [AI AGENT] Erro ao reagendar timer para retry:`, dbError);
      }
    }
    
    console.log(`🔓 [AI AGENT] Conversa ${conversationId} liberada para próximo processamento`);
  }
}

// ---------------------------------------------------------------------------
// ?? TRIGGER RESPONSE ON AI RE-ENABLE
// ---------------------------------------------------------------------------
// Quando o usu�rio reativa a IA para uma conversa, verificamos se h� mensagens
// pendentes do cliente que ainda n�o foram respondidas e disparamos a resposta.
// 
// Par�metro forceRespond: Quando true (chamado pelo bot�o "Responder com IA"),
// ignora a verifica��o de "�ltima mensagem � do dono" e responde mesmo assim.
// ---------------------------------------------------------------------------
export async function triggerAgentResponseForConversation(
  userId: string,
  conversationId: string,
  forceRespond: boolean = false
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[TRIGGER] FUNÇÃO INICIADA - ${new Date().toISOString()}`);
  console.log(`[TRIGGER] userId: ${userId}`);
  console.log(`[TRIGGER] conversationId: ${conversationId}`);
  console.log(`[TRIGGER] forceRespond: ${forceRespond}`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // 1. Buscar a sessão do usuário
    console.log(`[TRIGGER] Verificando sessão no Map sessions...`);
    console.log(`[TRIGGER] Total de sessões no Map: ${sessions.size}`);
    
    // Debug: listar todas as chaves do Map
    const sessionKeys = Array.from(sessions.keys());
    console.log(`[TRIGGER] Chaves no Map sessions: [${sessionKeys.join(', ')}]`);
    
    const session = sessions.get(userId);
    console.log(`[TRIGGER] Sessão encontrada para userId ${userId}: ${session ? 'SIM' : 'NÃO'}`);
    
    if (!session?.socket) {
      // Verificar se estamos em modo dev sem WhatsApp
      const skipRestore = process.env.SKIP_WHATSAPP_RESTORE === 'true';
      console.log(`[TRIGGER] FALHA: Sessão WhatsApp não disponível (socket: ${session?.socket ? 'existe' : 'undefined'})`);
      console.log(`[TRIGGER] SKIP_WHATSAPP_RESTORE: ${skipRestore}`);
      
      if (skipRestore) {
        return { triggered: false, reason: "Modo desenvolvimento: WhatsApp não conectado localmente. Em produção, a sessão será restaurada automaticamente." };
      }
      return { triggered: false, reason: "WhatsApp não conectado. Verifique a conexão em 'Conexão'." };
    }
    console.log(`[TRIGGER] Sessão WhatsApp OK - socket existe`);
    
    // 2. Verificar se o agente está ativo globalmente
    console.log(`[TRIGGER] Verificando agentConfig...`);
    const agentConfig = await storage.getAgentConfig(userId);
    console.log(`[TRIGGER] agentConfig encontrado: ${agentConfig ? 'SIM' : 'NÃO'}`);
    console.log(`[TRIGGER] agentConfig.isActive: ${agentConfig?.isActive}`);
    
    if (!agentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: Agente globalmente inativo`);
      return { triggered: false, reason: "Ative o agente em 'Meu Agente IA' primeiro." };
    }
    console.log(`[TRIGGER] Agente está ATIVO`);
    
    // 2.5 🐛 FIX: Verificar também businessAgentConfig (toggle "IA ON" em /agent-config)
    console.log(`[TRIGGER] Verificando businessAgentConfig...`);
    const businessAgentConfig = await storage.getBusinessAgentConfig(userId);
    console.log(`[TRIGGER] businessAgentConfig encontrado: ${businessAgentConfig ? 'SIM' : 'NÃO'}`);
    console.log(`[TRIGGER] businessAgentConfig.isActive: ${businessAgentConfig?.isActive}`);
    
    if (!businessAgentConfig?.isActive) {
      console.log(`[TRIGGER] FALHA: IA desativada globalmente em businessAgentConfig`);
      return { triggered: false, reason: "A IA está desativada globalmente. Ative em 'Configurações' primeiro." };
    }
    console.log(`[TRIGGER] businessAgentConfig ATIVO`);
    
    // 3. Buscar dados da conversa
    console.log(`[TRIGGER] Buscando conversa...`);
    const conversation = await storage.getConversation(conversationId);
    if (!conversation) {
      console.log(`[TRIGGER] FALHA: Conversa não encontrada`);
      return { triggered: false, reason: "Conversa não encontrada." };
    }
    console.log(`[TRIGGER] Conversa encontrada: ${conversation.contactName || conversation.contactNumber}`);
    
    // 4. Buscar mensagens da conversa
    const messages = await storage.getMessagesByConversationId(conversationId);
    if (messages.length === 0) {
      console.log(`?? [TRIGGER] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa para responder." };
    }
    
    // 5. Verificar �ltima mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se �ltima mensagem � do agente/dono, s� responder se forceRespond=true
    if (lastMessage.fromMe && !forceRespond) {
      console.log(`?? [TRIGGER] �ltima mensagem � do agente/dono - n�o precisa responder`);
      return { triggered: false, reason: "�ltima mensagem j� foi respondida." };
    }
    
    // Se forceRespond mas �ltima � do agente, precisamos de contexto anterior
    let messagesToProcess: string[] = [];
    
    if (lastMessage.fromMe && forceRespond) {
      // For�ar resposta: usar �ltimas mensagens do cliente como contexto
      console.log(`?? [TRIGGER] For�ando resposta - buscando contexto anterior...`);
      
      // Buscar �ltimas mensagens do cliente (n�o do agente)
      for (let i = messages.length - 1; i >= 0; i--) {
        const msg = messages[i];
        if (!msg.fromMe && msg.text) {
          messagesToProcess.unshift(msg.text);
          if (messagesToProcess.length >= 3) break; // �ltimas 3 mensagens do cliente
        }
      }
      
      if (messagesToProcess.length === 0) {
        return { triggered: false, reason: "N�o h� mensagens do cliente para processar." };
      }
    } else {
      // Comportamento normal: coletar mensagens n�o respondidas do cliente
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
      console.log(`⚠️ [TRIGGER] Já existe resposta pendente para esta conversa`);
      return { triggered: false, reason: "Resposta já em processamento. Aguarde." };
    }
    
    console.log(`📋 [TRIGGER] ${messagesToProcess.length} mensagem(s) para processar`);
    console.log(`   📞 Cliente: ${conversation.contactNumber}`);
    
    // ┌─────────────────────────────────────────────────────────────────────────┐
    // │ 🤖 FIX: Tentar CHATBOT primeiro antes de usar IA                       │
    // │ Quando auto-reativação ocorre, precisamos respeitar a prioridade:      │
    // │ 1º CHATBOT/FLOW (se ativo)                                             │
    // │ 2º IA AGENT (se chatbot não processou)                                 │
    // │ Data: 2025-01-XX - Sincronização Flow Builder + IA Agent               │
    // └─────────────────────────────────────────────────────────────────────────┘
    try {
      const { tryProcessChatbotMessage, isNewContact } = await import("./chatbotIntegration");
      const isFirstContact = await isNewContact(conversationId);
      const combinedText = messagesToProcess.join('\n\n');
      
      console.log(`🤖 [TRIGGER] Tentando processar via CHATBOT primeiro...`);
      const chatbotResult = await tryProcessChatbotMessage(
        userId,
        conversationId,
        conversation.contactNumber,
        combinedText,
        isFirstContact
      );
      
      if (chatbotResult.handled) {
        console.log(`✅ [TRIGGER] Mensagem processada pelo CHATBOT de fluxo!`);
        if (chatbotResult.transferToHuman) {
          console.log(`🤖 [TRIGGER] Conversa transferida para humano - IA/Chatbot desativados`);
        }
        return { triggered: true, reason: "Resposta processada pelo chatbot de fluxo!" };
      }
      
      console.log(`📋 [TRIGGER] Chatbot não processou (inativo ou sem match), delegando para IA...`);
    } catch (chatbotError) {
      console.error(`⚠️ [TRIGGER] Erro ao tentar chatbot (continuando com IA):`, chatbotError);
    }
    
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
      console.log(`?? [TRIGGER] Processando resposta para ${conversation.contactNumber}`);
      await processAccumulatedMessages(pending);
    }, responseDelaySeconds * 1000);
    
    pendingResponses.set(conversationId, pending);
    
    console.log(`? [TRIGGER] Resposta agendada em ${responseDelaySeconds}s`);
    
    return { triggered: true, reason: `Resposta da IA agendada! Processando ${messagesToProcess.length} mensagem(s)...` };
    
  } catch (error) {
    console.error(`? [TRIGGER] Erro:`, error);
    return { triggered: false, reason: "Erro ao processar. Tente novamente." };
  }
}

// ---------------------------------------------------------------------------
// ?? TRIGGER RESPONSE ON ADMIN AI RE-ENABLE
// ---------------------------------------------------------------------------
// Para conversas do ADMIN (sistema de vendas AgenteZap) - quando a IA � 
// reativada, verifica se h� mensagens do cliente sem resposta e dispara.
// ---------------------------------------------------------------------------
export async function triggerAdminAgentResponseForConversation(
  conversationId: string
): Promise<{ triggered: boolean; reason: string }> {
  console.log(`\n?? [ADMIN TRIGGER ON ENABLE] Verificando mensagens pendentes para conversa admin ${conversationId}...`);
  
  try {
    // 1. Buscar dados da conversa admin
    const conversation = await storage.getAdminConversation(conversationId);
    if (!conversation) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Conversa ${conversationId} n�o encontrada`);
      return { triggered: false, reason: "Conversa n�o encontrada" };
    }
    
    // 2. Verificar se h� sess�o admin ativa
    const adminSession = adminSessions.values().next().value;
    if (!adminSession?.socket) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Sess�o admin WhatsApp n�o dispon�vel`);
      return { triggered: false, reason: "WhatsApp admin n�o conectado" };
    }
    
    // 3. Buscar mensagens da conversa admin
    const messages = await storage.getAdminMessages(conversationId);
    if (messages.length === 0) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Nenhuma mensagem na conversa`);
      return { triggered: false, reason: "Nenhuma mensagem na conversa" };
    }
    
    // 4. Verificar �ltima mensagem
    const lastMessage = messages[messages.length - 1];
    
    // Se �ltima mensagem � do admin/agente (fromMe = true), n�o precisa responder
    if (lastMessage.fromMe) {
      console.log(`?? [ADMIN TRIGGER ON ENABLE] �ltima mensagem � do agente - n�o precisa responder`);
      return { triggered: false, reason: "�ltima mensagem j� foi respondida" };
    }
    
    // 5. Verificar se j� tem resposta pendente
    const contactNumber = conversation.contactNumber;
    if (pendingAdminResponses.has(contactNumber)) {
      console.log(`? [ADMIN TRIGGER ON ENABLE] J� existe resposta pendente para este contato`);
      return { triggered: false, reason: "Resposta j� em processamento" };
    }
    
    console.log(`?? [ADMIN TRIGGER ON ENABLE] Mensagem do cliente sem resposta encontrada!`);
    console.log(`   ?? Cliente: ${contactNumber}`);
    console.log(`   ?? �ltima mensagem: "${(lastMessage.text || '[m�dia]').substring(0, 50)}..."`);
    console.log(`   ?? Enviada em: ${lastMessage.timestamp}`);
    
    // 6. Coletar todas as mensagens do cliente desde a �ltima do agente
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
    
    console.log(`?? [ADMIN TRIGGER ON ENABLE] ${clientMessagesBuffer.length} mensagem(s) do cliente para processar`);
    
    // 7. Agendar resposta usando o sistema de acumula��o existente
    const config = await getAdminAgentRuntimeConfig();
    const responseDelayMs = Math.max(config.responseDelayMs, 3000); // M�nimo 3 segundos
    
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
      console.log(`?? [ADMIN TRIGGER ON ENABLE] Processando resposta para ${contactNumber}`);
      void processAdminAccumulatedMessages({ socket: adminSession.socket!, key: contactNumber, generation: 1 });
    }, responseDelayMs);
    
    pendingAdminResponses.set(contactNumber, pending);
    
    console.log(`? [ADMIN TRIGGER ON ENABLE] Resposta agendada em ${responseDelayMs/1000}s para ${contactNumber}`);
    
    return { triggered: true, reason: `Resposta agendada para ${clientMessagesBuffer.length} mensagem(s) pendente(s)` };
    
  } catch (error) {
    console.error(`? [ADMIN TRIGGER ON ENABLE] Erro:`, error);
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

  // ?? ANTI-DUPLICA��O: Verificar se mensagem j� foi enviada recentemente (para follow-up)
  if (options?.isFromAgent) {
    if (isRecentDuplicate(conversationId, text)) {
      console.log(`?? [sendMessage] ?? Mensagem ID�NTICA j� enviada recentemente, IGNORANDO duplicata`);
      console.log(`   ?? Texto: "${text.substring(0, 80)}..."`);
      return; // Silenciosamente ignorar duplicata
    }
    // Registrar mensagem no cache
    registerSentMessageCache(conversationId, text);
  }

  // Usar remoteJid normalizado do banco (suporta @lid, @s.whatsapp.net, etc)
  const jid = buildSendJid(conversation);
  
  console.log(`[sendMessage] Sending to: ${jid}${options?.isFromAgent ? ' (from agent/follow-up)' : ''}`);
  
  // ??? ANTI-BLOQUEIO: Usar fila de mensagens para garantir delay entre envios
  // Cada WhatsApp tem sua pr�pria fila - m�ltiplos usu�rios podem enviar ao mesmo tempo
  // ? Texto enviado EXATAMENTE como recebido (varia��o REMOVIDA do sistema)
  const queueResult = await messageQueueService.enqueue(userId, jid, text, {
    isFromAgent: options?.isFromAgent,
    priority: options?.isFromAgent ? 'normal' : 'high', // Mensagens manuais do dono = prioridade alta
  });

  const messageId = queueResult.messageId || Date.now().toString();

  await storage.createMessage({
    conversationId,
    messageId,
    fromMe: true,
    text: text, // ? Texto original sem varia��o
    timestamp: new Date(),
    status: "sent",
    // ?? FIX: Marcar mensagens de follow-up como isFromAgent para que a IA
    // saiba que foi ela quem enviou quando retomar a conversa
    isFromAgent: options?.isFromAgent ?? false,
  });

  // ?? FOLLOW-UP ADMIN: Continua usando sistema antigo para admin_conversations
  try {
    await followUpService.scheduleInitialFollowUp(conversationId);
  } catch (error) {
    console.error("Erro ao agendar follow-up admin:", error);
  }

  // ?? FOLLOW-UP USU�RIOS: Ativar follow-up para conversas de usu�rios
  try {
    await userFollowUpService.enableFollowUp(conversationId);
  } catch (error) {
    console.error("Erro ao ativar follow-up do usu�rio:", error);
  }

  // ?? FIX: Quando o dono envia mensagem, resetar unreadCount para 0
  await storage.updateConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: new Date(),
    lastMessageFromMe: true,
    hasReplied: true,
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

  // Resolver JID para envio (preferir n�mero real)
  let jid = conversation.remoteJid;
  
  // Se for LID, tentar resolver para n�mero real
  if (jid && jid.includes("@lid")) {
    // 1. Tentar cache
    const cached = session.contactsCache.get(jid);
    if (cached && cached.phoneNumber) {
      jid = cached.phoneNumber;
    } else {
      // 2. Tentar construir do contactNumber se dispon�vel
      if (conversation.contactNumber) {
         jid = `${conversation.contactNumber}@s.whatsapp.net`;
      }
    }
  }
  
  // Fallback se n�o tiver remoteJid mas tiver contactNumber
  if (!jid && conversation.contactNumber) {
    jid = `${conversation.contactNumber}@s.whatsapp.net`;
  }
  
  if (!jid) {
    throw new Error("Could not determine destination JID");
  }

  console.log(`[sendAdminConversationMessage] Sending to: ${jid} (Original: ${conversation.remoteJid})`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do admin
  const sentMessage = await sendWithQueue(`admin_${adminId}`, 'admin conversa msg', async () => {
    return await session.socket.sendMessage(jid, { text });
  });

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
  
  // ??? ANTI-BLOQUEIO: Usar fila do admin
  await sendWithQueue(`admin_${adminId}`, 'admin msg direta', async () => {
    await session.socket.sendMessage(jid, { text });
  });
}

// ==================== ADMIN NOTIFICATION MESSAGE ====================
// Para envio de notificações automáticas (lembretes de pagamento, check-ins, etc)
// NÃO é para chatbot - apenas envio de mensagens informativas
export async function sendAdminNotification(
  adminId: string, 
  phoneNumber: string, 
  message: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const session = adminSessions.get(adminId);
    if (!session?.socket) {
      console.log(`[sendAdminNotification] ❌ Admin ${adminId} não conectado`);
      return { success: false, error: "Admin WhatsApp not connected" };
    }

    // Clean phone number - remover tudo exceto números
    let cleanPhone = phoneNumber.replace(/\D/g, '');
    
    // Garantir que tem o DDI 55 do Brasil
    if (!cleanPhone.startsWith('55') && cleanPhone.length <= 11) {
      cleanPhone = '55' + cleanPhone;
    }
    
    // Verificar formato válido: 55 + DDD (2) + número (8-9)
    if (cleanPhone.length < 12 || cleanPhone.length > 13) {
      console.log(`[sendAdminNotification] ❌ Número inválido: ${phoneNumber} -> ${cleanPhone} (length: ${cleanPhone.length})`);
      return { success: false, error: `Número inválido: ${phoneNumber}` };
    }
    
    // ✅ CORREÇÃO: Testar múltiplas variações do número
    // Alguns números podem estar cadastrados com 9 extra ou faltando o 9
    const phoneVariations: string[] = [cleanPhone];
    
    // Se tem 13 dígitos (55 + DDD + 9 + 8 dígitos), criar variação sem o 9
    if (cleanPhone.length === 13 && cleanPhone[4] === '9') {
      const withoutNine = cleanPhone.slice(0, 4) + cleanPhone.slice(5);
      phoneVariations.push(withoutNine);
      console.log(`[sendAdminNotification] 📱 Variação sem 9: ${withoutNine}`);
    }
    
    // Se tem 12 dígitos (55 + DDD + 8 dígitos), criar variação com o 9
    if (cleanPhone.length === 12) {
      const withNine = cleanPhone.slice(0, 4) + '9' + cleanPhone.slice(4);
      phoneVariations.push(withNine);
      console.log(`[sendAdminNotification] 📱 Variação com 9: ${withNine}`);
    }
    
    console.log(`[sendAdminNotification] 📤 Verificando variações: ${phoneVariations.join(', ')}`);
    
    // ✅ Verificar qual variação existe no WhatsApp
    let validPhone: string | null = null;
    
    for (const phone of phoneVariations) {
      try {
        const [result] = await session.socket.onWhatsApp(phone);
        if (result?.exists === true) {
          validPhone = phone;
          console.log(`[sendAdminNotification] ✅ Número encontrado: ${phone}`);
          break;
        } else {
          console.log(`[sendAdminNotification] ❌ ${phone} não existe no WhatsApp`);
        }
      } catch (checkError) {
        console.log(`[sendAdminNotification] ⚠️ Erro ao verificar ${phone}:`, checkError);
      }
    }
    
    // Se nenhuma variação foi encontrada, retornar erro
    if (!validPhone) {
      console.log(`[sendAdminNotification] ❌ Nenhuma variação do número existe no WhatsApp: ${phoneVariations.join(', ')}`);
      return { success: false, error: `Número não existe no WhatsApp: ${phoneNumber} (testado: ${phoneVariations.join(', ')})` };
    }
    
    const jid = `${validPhone}@s.whatsapp.net`;
    console.log(`[sendAdminNotification] 📤 Enviando para: ${jid}`);
    
    // Enviar mensagem usando a fila anti-banimento
    let sendSuccess = false;
    let sendError: string | undefined;
    
    await sendWithQueue(`admin_${adminId}`, 'admin notification', async () => {
      try {
        const result = await session.socket.sendMessage(jid, { text: message });
        
        if (result?.key?.id) {
          sendSuccess = true;
          console.log(`[sendAdminNotification] ✅ Mensagem enviada com sucesso para ${validPhone} (msgId: ${result.key.id})`);
        } else {
          sendError = 'Nenhum ID de mensagem retornado';
          console.log(`[sendAdminNotification] ⚠️ Envio sem confirmação para ${validPhone}`);
        }
      } catch (sendErr) {
        sendError = sendErr instanceof Error ? sendErr.message : 'Erro desconhecido';
        console.error(`[sendAdminNotification] ❌ Erro ao enviar para ${validPhone}:`, sendErr);
        throw sendErr; // Re-throw para que sendWithQueue capture
      }
    });

    if (sendSuccess) {
      return { success: true, validatedPhone: validPhone, originalPhone: phoneNumber };
    } else {
      return { success: false, error: sendError || 'Falha no envio', validatedPhone: validPhone, originalPhone: phoneNumber };
    }
  } catch (error) {
    console.error('[sendAdminNotification] ❌ Erro geral:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
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

  // Converter base64 para buffer se necess�rio
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

  // ??? ANTI-BLOQUEIO: Usar fila do admin
  const sentMessage = await sendWithQueue(`admin_${adminId}`, `admin m�dia ${media.type}`, async () => {
    return await session.socket.sendMessage(jid, messageContent);
  });

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
    mediaUrl: media.data, // Guardar base64 para exibi��o
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

  // Converter base64 para buffer se necess�rio (ANTES da fila para n�o ocupar tempo na fila)
  let mediaBuffer: Buffer;
  if (media.data.startsWith('data:')) {
    const base64Data = media.data.split(',')[1];
    mediaBuffer = Buffer.from(base64Data, 'base64');
  } else {
    mediaBuffer = Buffer.from(media.data, 'base64');
  }

  console.log(`[sendUserMediaMessage] ?? Buffer size: ${mediaBuffer.length} bytes, mimetype: ${media.mimetype}`);

  let messageContent: any;
  let mediaTypeForStorage = media.type;

  switch (media.type) {
    case 'audio':
      // Para �udio PTT (nota de voz), usar o mimetype fornecido
      messageContent = {
        audio: mediaBuffer,
        mimetype: media.mimetype || 'audio/ogg; codecs=opus',
        ptt: media.ptt !== false, // Default to true for voice notes
        seconds: media.seconds,
      };
      console.log(`[sendUserMediaMessage] ?? Audio prepared:`, {
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

  console.log(`[sendUserMediaMessage] ?? Sending to WhatsApp...`);
  
  // ??? ANTI-BLOQUEIO: Usar fila do usu�rio
  const sentMessage = await sendWithQueue(userId, `usu�rio m�dia ${media.type}`, async () => {
    return await session.socket.sendMessage(jid, messageContent);
  });
  console.log(`[sendUserMediaMessage] ? Message sent! ID: ${sentMessage?.key?.id}`);

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
    mediaUrl: media.data, // Guardar base64 para exibi��o
    mediaMimeType: media.mimetype,
    mediaCaption: media.caption,
  });

  await storage.updateConversation(conversationId, {
    lastMessageText: media.caption || `[${media.type.charAt(0).toUpperCase() + media.type.slice(1)}]`,
    lastMessageTime: new Date(),
  });

  // ?? AUTO-PAUSE IA: Quando o dono envia m�dia pelo sistema, PAUSA a IA
  try {
    const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
    if (!isAlreadyDisabled) {
      await storage.disableAgentForConversation(conversationId);
      console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou m�dia pelo sistema`);
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
    throw new Error("WhatsApp n�o conectado");
  }

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];

  console.log(`[BULK SEND] ??? Iniciando envio ANTI-BLOQUEIO para ${phones.length} n�meros`);

  for (const phone of phones) {
    try {
      // Formatar n�mero para JID
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Adicionar c�digo do pa�s se necess�rio (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      console.log(`[BULK SEND] Enviando para: ${jid}`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom�tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia��o REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, message, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa (respostas de IA passam na frente)
      });
      
      if (queueResult.success) {
        sent++;
        console.log(`[BULK SEND] ? Enviado para ${phone}`);
      } else {
        failed++;
        errors.push(`${phone}: ${queueResult.error || 'Sem ID de mensagem retornado'}`);
        console.log(`[BULK SEND] ? Falha ao enviar para ${phone}: ${queueResult.error}`);
      }
      
      // ??? A fila j� controla o delay - n�o precisa de delay extra aqui
      
    } catch (error: any) {
      failed++;
      const errorMsg = error.message || 'Erro desconhecido';
      errors.push(`${phone}: ${errorMsg}`);
      console.log(`[BULK SEND] ? Erro ao enviar para ${phone}: ${errorMsg}`);
      
      // Delay extra em caso de erro (pode ser rate limit)
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }

  console.log(`[BULK SEND] Conclu�do: ${sent} enviados, ${failed} falharam`);
  
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
    throw new Error("WhatsApp n�o conectado");
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

  // Fun��o para aplicar template [nome]
  const applyTemplate = (template: string, name: string): string => {
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  // Fun��o para gerar varia��o com IA (par�frase e sin�nimos)
  const generateVariation = async (message: string, contactIndex: number): Promise<string> => {
    if (!useAI) return message;
    
    try {
      // Sin�nimos comuns em portugu�s
      const synonyms: Record<string, string[]> = {
        'ol�': ['oi', 'eae', 'e a�', 'hey'],
        'oi': ['ol�', 'eae', 'e a�', 'hey'],
        'tudo bem': ['como vai', 'tudo certo', 'tudo ok', 'como voc� est�'],
        'como vai': ['tudo bem', 'tudo certo', 'como est�', 'tudo ok'],
        'obrigado': ['valeu', 'grato', 'agrade�o', 'muito obrigado'],
        'obrigada': ['valeu', 'grata', 'agrade�o', 'muito obrigada'],
        'por favor': ['poderia', 'seria poss�vel', 'gentilmente', 'se poss�vel'],
        'aqui': ['por aqui', 'neste momento', 'agora'],
        'agora': ['neste momento', 'atualmente', 'no momento'],
        'hoje': ['neste dia', 'agora', 'no dia de hoje'],
        'gostaria': ['queria', 'preciso', 'necessito', 'adoraria'],
        'pode': ['consegue', 'seria poss�vel', 'poderia', 'daria para'],
        'grande': ['enorme', 'imenso', 'vasto', 'extenso'],
        'pequeno': ['menor', 'reduzido', 'compacto', 'm�nimo'],
        'bom': ['�timo', 'excelente', 'legal', 'incr�vel'],
        'bonito': ['lindo', 'maravilhoso', 'belo', 'encantador'],
        'r�pido': ['veloz', '�gil', 'ligeiro', 'imediato'],
        'ajudar': ['auxiliar', 'apoiar', 'assistir', 'dar uma for�a'],
        'entrar em contato': ['falar com voc�', 'te contatar', 'enviar mensagem', 'me comunicar'],
        'informa��es': ['detalhes', 'dados', 'informes', 'esclarecimentos'],
        'produto': ['item', 'mercadoria', 'artigo', 'oferta'],
        'servi�o': ['atendimento', 'solu��o', 'suporte', 'trabalho'],
        'empresa': ['companhia', 'neg�cio', 'organiza��o', 'firma'],
        'cliente': ['consumidor', 'comprador', 'parceiro', 'usu�rio'],
        'qualidade': ['excel�ncia', 'padr�o', 'n�vel', 'categoria'],
        'pre�o': ['valor', 'custo', 'investimento', 'oferta'],
        'desconto': ['promo��o', 'oferta especial', 'condi��o especial', 'vantagem'],
        'interessado': ['curioso', 'interessando', 'querendo saber', 'buscando'],
      };
      
      // Prefixos variados para humanizar
      const prefixes = ['', '', '', '?? ', '?? ', '?? ', '?? ', 'Hey, ', 'Ei, '];
      // Sufixos variados
      const suffixes = ['', '', '', ' ??', ' ??', ' ?', '!', '.', ' Abra�os!', ' Att.'];
      // Estruturas de abertura alternativas
      const openings: Record<string, string[]> = {
        'ol� [nome]': ['Oi [nome]', 'E a� [nome]', 'Ei [nome]', '[nome], tudo bem?', 'Fala [nome]'],
        'oi [nome]': ['Ol� [nome]', 'E a� [nome]', 'Ei [nome]', '[nome], como vai?', 'Fala [nome]'],
        'bom dia': ['Bom dia!', 'Dia!', 'Bom diaa', '�timo dia'],
        'boa tarde': ['Boa tarde!', 'Tarde!', 'Boa tardee', '�tima tarde'],
        'boa noite': ['Boa noite!', 'Noite!', 'Boa noitee', '�tima noite'],
      };
      
      let varied = message;
      
      // 1. Aplicar substitui��es de abertura
      for (const [pattern, replacements] of Object.entries(openings)) {
        const regex = new RegExp(pattern, 'gi');
        if (regex.test(varied)) {
          const randomReplacement = replacements[Math.floor(Math.random() * replacements.length)];
          varied = varied.replace(regex, randomReplacement);
          break; // S� substitui uma abertura
        }
      }
      
      // 2. Aplicar 1-3 substitui��es de sin�nimos aleatoriamente
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
      
      // 3. Adicionar varia��o de pontua��o
      if (Math.random() > 0.7) {
        varied = varied.replace(/\!$/g, '.');
      } else if (Math.random() > 0.8) {
        varied = varied.replace(/\.$/g, '!');
      }
      
      // 4. Usar �ndice para variar prefixo/sufixo de forma distribu�da
      const prefixIndex = (contactIndex + Math.floor(Math.random() * 3)) % prefixes.length;
      const suffixIndex = (contactIndex + Math.floor(Math.random() * 3)) % suffixes.length;
      
      // N�o adicionar prefixo/sufixo se j� come�ar com emoji ou terminar com emoji
      // Usa regex sem flag 'u' para compatibilidade com ES5
      const emojiPattern = /[\uD83C-\uDBFF][\uDC00-\uDFFF]/;
      const startsWithEmoji = emojiPattern.test(varied.slice(0, 2));
      const endsWithEmoji = emojiPattern.test(varied.slice(-2));
      
      if (!startsWithEmoji && prefixes[prefixIndex]) {
        varied = prefixes[prefixIndex] + varied;
      }
      if (!endsWithEmoji && suffixes[suffixIndex] && !varied.endsWith(suffixes[suffixIndex])) {
        // Remover pontua��o final antes de adicionar sufixo
        if (suffixes[suffixIndex].match(/^[.!?]/) || suffixes[suffixIndex].match(/^\s*[A-Za-z]/)) {
          varied = varied.replace(/[.!?]+$/, '');
        }
        varied = varied + suffixes[suffixIndex];
      }
      
      console.log(`[BULK SEND AI] Varia��o #${contactIndex + 1}: "${varied.substring(0, 60)}..."`);
      return varied;
    } catch (error) {
      console.error('[BULK SEND] Erro ao gerar varia��o IA:', error);
      return message;
    }
  };

  let contactIndex = 0;
  for (const contact of contacts) {
    try {
      // Formatar n�mero para JID
      const cleanPhone = contact.phone.replace(/\D/g, '');
      
      // Adicionar c�digo do pa�s se necess�rio (Brasil = 55)
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      
      const jid = `${formattedPhone}@s.whatsapp.net`;
      
      // Aplicar template [nome] e varia��o IA
      let finalMessage = applyTemplate(messageTemplate, contact.name);
      if (useAI) {
        finalMessage = await generateVariation(finalMessage, contactIndex);
      }
      
      const sendStartTime = Date.now();
      console.log(`[BULK SEND ADVANCED] [${contactIndex + 1}/${contacts.length}] Enviando para: ${contact.name || contact.phone} (${jid})`);
      console.log(`[BULK SEND ADVANCED] Mensagem: ${finalMessage.substring(0, 50)}...`);
      console.log(`[BULK SEND ADVANCED] Timestamp in�cio: ${new Date(sendStartTime).toISOString()}`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom�tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia��o REMOVIDA do sistema)
      const queueResult = await messageQueueService.enqueue(userId, jid, finalMessage, {
        isFromAgent: true,
        priority: 'low', // Bulk = prioridade baixa
      });
      
      const queueEndTime = Date.now();
      console.log(`[BULK SEND ADVANCED] Queue processada em ${((queueEndTime - sendStartTime) / 1000).toFixed(2)}s`);
      
      if (queueResult.success) {
        sent++;
        details.sent.push({
          phone: contact.phone,
          name: contact.name,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[BULK SEND ADVANCED] ? Enviado para ${contact.name || contact.phone}`);
        
        // ?? Atualizar progresso em tempo real
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
        console.log(`[BULK SEND ADVANCED] ? Falha: ${contact.phone}`);
        
        // ?? Atualizar progresso em tempo real (tamb�m para falhas)
        if (onProgress) {
          try {
            await onProgress(sent, failed);
          } catch (progressError) {
            console.error('[BULK SEND] Erro ao atualizar progresso:', progressError);
          }
        }
      }

      // ??? DELAY COMPLETO CONFIGURADO PELO USU�RIO
      // A fila tem delay base de 5-10s, MAS para envio em massa queremos o delay configurado COMPLETO
      // Para garantir, aplicamos o delay configurado AP�S o enqueue retornar
      // Isso garante que mesmo com varia��es da fila, teremos pelo menos o delay configurado
      if (contactIndex < contacts.length - 1) {
        const configuredDelay = delayMin + Math.random() * (delayMax - delayMin);
        console.log(`??? [BULK SEND] Delay configurado: ${(configuredDelay/1000).toFixed(1)}s (perfil: ${delayMin/1000}-${delayMax/1000}s)`);
        await new Promise(resolve => setTimeout(resolve, configuredDelay));
      }
      
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
      console.log(`[BULK SEND ADVANCED] ? Erro: ${contact.phone} - ${errorMsg}`);
      
      // ?? Atualizar progresso em tempo real (tamb�m para erros)
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

  console.log(`[BULK SEND ADVANCED] Conclu�do: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// ==================== BULK SEND WITH MEDIA / ENVIO EM MASSA COM M�DIA ====================

export interface BulkMediaPayload {
  type: 'audio' | 'image' | 'video' | 'document';
  data: string; // base64 data URL or URL
  mimetype: string;
  filename?: string;
  caption?: string;
  ptt?: boolean;
}

/**
 * Envia mensagem com m�dia em massa para m�ltiplos contatos
 * Suporta: imagem, v�deo, �udio e documento
 */
export async function sendBulkMediaMessages(
  userId: string,
  contacts: { phone: string; name: string }[],
  messageTemplate: string,
  media: BulkMediaPayload,
  options: {
    delayMin?: number;
    delayMax?: number;
    onProgress?: (sent: number, failed: number) => Promise<void>;
  } = {}
): Promise<{
  sent: number;
  failed: number;
  errors: string[];
  details: {
    sent: { phone: string; name?: string; timestamp: string }[];
    failed: { phone: string; name?: string; error: string; timestamp: string }[];
  };
}> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n�o conectado");
  }

  const delayMin = options.delayMin || 5000;
  const delayMax = options.delayMax || 15000;
  const { onProgress } = options;

  let sent = 0;
  let failed = 0;
  const errors: string[] = [];
  const details = {
    sent: [] as { phone: string; name?: string; timestamp: string }[],
    failed: [] as { phone: string; name?: string; error: string; timestamp: string }[],
  };

  console.log(`[BULK MEDIA SEND] ??? Iniciando envio de ${media.type} para ${contacts.length} contatos`);
  console.log(`[BULK MEDIA SEND] Delay: ${delayMin/1000}-${delayMax/1000}s`);

  // Converter base64 para buffer UMA VEZ (performance)
  let mediaBuffer: Buffer;
  try {
    if (media.data.startsWith('data:')) {
      const base64Data = media.data.split(',')[1];
      mediaBuffer = Buffer.from(base64Data, 'base64');
    } else {
      mediaBuffer = Buffer.from(media.data, 'base64');
    }
    console.log(`[BULK MEDIA SEND] ?? Buffer preparado: ${mediaBuffer.length} bytes`);
  } catch (bufferError: any) {
    throw new Error(`Erro ao processar m�dia: ${bufferError.message}`);
  }

  // Fun��o para aplicar template [nome]
  const applyTemplate = (template: string, name: string): string => {
    if (!template) return '';
    return template.replace(/\[nome\]/gi, name || 'Cliente');
  };

  let contactIndex = 0;
  for (const contact of contacts) {
    try {
      // Formatar n�mero para JID
      const cleanPhone = contact.phone.replace(/\D/g, '');
      let formattedPhone = cleanPhone;
      if (cleanPhone.length === 10 || cleanPhone.length === 11) {
        formattedPhone = '55' + cleanPhone;
      }
      const jid = `${formattedPhone}@s.whatsapp.net`;

      // Aplicar template na legenda
      const finalCaption = applyTemplate(messageTemplate, contact.name);

      console.log(`[BULK MEDIA SEND] [${contactIndex + 1}/${contacts.length}] Enviando ${media.type} para: ${contact.name || contact.phone}`);

      // Preparar conte�do de m�dia
      let messageContent: any;

      switch (media.type) {
        case 'audio':
          messageContent = {
            audio: mediaBuffer,
            mimetype: media.mimetype || 'audio/ogg; codecs=opus',
            ptt: media.ptt !== false,
          };
          break;

        case 'image':
          messageContent = {
            image: mediaBuffer,
            mimetype: media.mimetype || 'image/jpeg',
            caption: finalCaption || undefined,
          };
          break;

        case 'video':
          messageContent = {
            video: mediaBuffer,
            mimetype: media.mimetype || 'video/mp4',
            caption: finalCaption || undefined,
          };
          break;

        case 'document':
          messageContent = {
            document: mediaBuffer,
            mimetype: media.mimetype || 'application/pdf',
            fileName: media.filename || 'document',
            caption: finalCaption || undefined,
          };
          break;

        default:
          throw new Error(`Tipo de m�dia n�o suportado: ${media.type}`);
      }

      // Enviar m�dia via socket (n�o usar fila para m�dia - enviamos diretamente)
      const sendStartTime = Date.now();
      const sentMessage = await session.socket.sendMessage(jid, messageContent);
      const sendEndTime = Date.now();

      console.log(`[BULK MEDIA SEND] ? Enviado para ${contact.name || contact.phone} em ${sendEndTime - sendStartTime}ms`);

      sent++;
      details.sent.push({
        phone: contact.phone,
        name: contact.name,
        timestamp: new Date().toISOString(),
      });

      // Atualizar progresso
      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK MEDIA SEND] Erro ao atualizar progresso:', progressError);
        }
      }

      // Delay entre envios (mais conservador para m�dia)
      if (contactIndex < contacts.length - 1) {
        const configuredDelay = delayMin + Math.random() * (delayMax - delayMin);
        console.log(`??? [BULK MEDIA SEND] Delay: ${(configuredDelay/1000).toFixed(1)}s`);
        await new Promise(resolve => setTimeout(resolve, configuredDelay));
      }

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
      console.log(`[BULK MEDIA SEND] ? Erro: ${contact.phone} - ${errorMsg}`);

      if (onProgress) {
        try {
          await onProgress(sent, failed);
        } catch (progressError) {
          console.error('[BULK MEDIA SEND] Erro ao atualizar progresso:', progressError);
        }
      }

      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    contactIndex++;
  }

  console.log(`[BULK MEDIA SEND] Conclu�do: ${sent} enviados, ${failed} falharam`);
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
 * Busca todos os grupos que o usu�rio participa
 * Usa groupFetchAllParticipating do Baileys
 */
export async function fetchUserGroups(userId: string): Promise<WhatsAppGroup[]> {
  const session = sessions.get(userId);
  if (!session?.socket) {
    throw new Error("WhatsApp n�o conectado");
  }

  try {
    console.log(`[GROUPS] Buscando grupos para usu�rio ${userId}...`);
    
    // Buscar todos os grupos participantes via Baileys
    const groups = await session.socket.groupFetchAllParticipating();
    
    const groupList: WhatsAppGroup[] = [];
    
    for (const [jid, metadata] of Object.entries(groups)) {
      // Verificar se o usu�rio � admin do grupo
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
    throw new Error("WhatsApp n�o conectado");
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
    console.warn('[GROUP SEND] N�o foi poss�vel buscar metadados dos grupos');
  }

  // Fun��o para gerar varia��o b�sica com IA
  const generateGroupVariation = (baseMessage: string, groupIndex: number): string => {
    if (!useAI) return baseMessage;
    
    // Varia��es simples de prefixo/sufixo
    const prefixes = ['', '', '?? ', '?? ', '?? ', '?? '];
    const suffixes = ['', '', '', ' ??', ' ?', '!'];
    
    const prefixIndex = groupIndex % prefixes.length;
    const suffixIndex = groupIndex % suffixes.length;
    
    let varied = baseMessage;
    
    // Adicionar varia��o se n�o come�ar/terminar com emoji
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
      // Verificar se � um JID de grupo v�lido
      const jid = groupId.includes('@g.us') ? groupId : `${groupId}@g.us`;
      const groupName = groupsMetadata[jid]?.subject || groupId;
      
      // Aplicar varia��o se IA estiver ativada
      const finalMessage = useAI ? generateGroupVariation(message, groupIndex) : message;
      
      console.log(`[GROUP SEND] Enviando para grupo: ${groupName} (${jid})`);
      console.log(`[GROUP SEND] Mensagem: ${finalMessage.substring(0, 50)}...`);
      
      // ??? ANTI-BLOQUEIO: Usar fila de mensagens com delay autom�tico de 5-10s
      // ? Texto enviado EXATAMENTE como recebido (varia��o REMOVIDA do sistema)
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
        console.log(`[GROUP SEND] ? Enviado para ${groupName}`);
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
        console.log(`[GROUP SEND] ? Falha: ${groupName}`);
      }

      // ??? A fila j� controla o delay de 5-10s - n�o precisa de delay extra aqui
      
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
      console.log(`[GROUP SEND] ? Erro: ${groupName} - ${errorMsg}`);
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    groupIndex++;
  }

  console.log(`[GROUP SEND] Conclu�do: ${sent} enviados, ${failed} falharam`);
  
  return { sent, failed, errors, details };
}

// Função auxiliar para obter sessões (usado em rotas de debug)
export function getSessions(): Map<string, WhatsAppSession> {
  return sessions;
}

export async function disconnectWhatsApp(userId: string): Promise<void> {
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear desconexões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n🛡️ [DEV MODE] disconnectWhatsApp bloqueado para user ${userId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ✅ Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
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

  // Limpar arquivos de autenticação para permitir nova conexão
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
  // ??? MODO DESENVOLVIMENTO: Bloquear conex�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n?? [DEV MODE] Conex�o Admin WhatsApp bloqueada para admin ${adminId}`);
    console.log(`   ?? SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ?? Sess�es do WhatsApp em produ��o n�o ser�o afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sess�es em produ��o.');
  }
  
  try {
    // Verificar se j� existe uma sess�o ativa
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

    // FIX LID 2025: Cache manual para mapear @lid ? phone number
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
                
                // Se tivermos o LID salvo em algum lugar (remoteJidAlt?), mapear tamb�m
                // Por enquanto, mapeamos o remoteJid normal
                contactsCache.set(conv.remoteJid, contact);
                contactsCache.set(conv.contactNumber, contact); // Mapear pelo n�mero tamb�m
                
                // Tentar inferir LID se poss�vel ou se tivermos salvo
                // (Futuramente salvar o LID na tabela admin_conversations seria ideal)
            }
        }
        console.log(`[ADMIN CACHE] Pr�-carregados ${conversations.length} contatos do hist�rico`);
    } catch (err) {
        console.error("[ADMIN CACHE] Erro ao pr�-carregar contatos:", err);
    }

    const socket = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      // -----------------------------------------------------------------------
      // ?? FIX "AGUARDANDO PARA CARREGAR MENSAGEM" (WAITING FOR MESSAGE) - ADMIN
      // -----------------------------------------------------------------------
      getMessage: async (key) => {
        if (!key.id) return undefined;
        
        console.log(`?? [getMessage ADMIN] Baileys solicitou mensagem ${key.id} para retry`);
        
        // Tentar recuperar do cache em mem�ria
        const cached = getCachedMessage(`admin_${adminId}`, key.id);
        if (cached) {
          return cached;
        }
        
        console.log(`?? [getMessage ADMIN] Mensagem ${key.id} n�o encontrada no cache`);
        return undefined;
      },
    });

    adminSessions.set(adminId, {
      socket,
      adminId,
      contactsCache,
    });

    // Verificar se j� est� conectado ao criar o socket (sess�o restaurada)
    if (socket.user) {
      const phoneNumber = socket.user.id.split(':')[0];
      console.log(`? [ADMIN] Socket criado j� conectado (sess�o restaurada): ${phoneNumber}`);
      
      // For�ar presen�a dispon�vel para receber updates de outros usu�rios
      setTimeout(() => {
        socket.sendPresenceUpdate('available').catch(err => console.error("Erro ao enviar presen�a inicial:", err));
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

    // -----------------------------------------------------------------------
    // 🎤 FUNÇÃO: Processar mensagens enviadas pelo ADMIN no WhatsApp
    // -----------------------------------------------------------------------
    // Quando o admin responde direto no WhatsApp (fromMe: true),
    // precisamos salvar essa mensagem no sistema E transcrever áudios
    // -----------------------------------------------------------------------
    async function handleAdminOutgoingMessage(adminId: string, waMessage: WAMessage) {
      const remoteJid = waMessage.key.remoteJid;
      if (!remoteJid) return;
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`📤 [ADMIN FROM ME] Ignorando mensagem de grupo/status`);
        return;
      }
      
      // Resolver contactNumber
      let contactNumber: string;
      let realRemoteJid = remoteJid;
      
      if (remoteJid.includes("@lid") && (waMessage.key as any).remoteJidAlt) {
        const realJid = (waMessage.key as any).remoteJidAlt;
        contactNumber = cleanContactNumber(realJid);
        realRemoteJid = realJid;
        console.log(`📤 [ADMIN FROM ME] LID resolvido: ${remoteJid} → ${realJid}`);
      } else {
        contactNumber = cleanContactNumber(remoteJid);
      }
      
      if (!contactNumber) {
        console.log(`⚠️ [ADMIN FROM ME] Não foi possível extrair número de: ${remoteJid}`);
        return;
      }
      
      // Extrair texto e mídia
      let messageText = "";
      let mediaType: string | undefined;
      let mediaUrl: string | undefined;
      let mediaMimeType: string | undefined;
      
      const msg = waMessage.message;
      
      if (msg?.conversation) {
        messageText = msg.conversation;
      } else if (msg?.extendedTextMessage?.text) {
        messageText = msg.extendedTextMessage.text;
      } else if (msg?.imageMessage) {
        mediaType = "image";
        messageText = msg.imageMessage.caption || "📷 Imagem";
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimetype = msg.imageMessage.mimetype || "image/jpeg";
          const result = await uploadMediaToStorage(buffer, mimetype, adminId);
          if (result?.url) {
            mediaUrl = result.url;
            console.log(`✅ [ADMIN FROM ME] Imagem salva: ${result.url}`);
          }
        } catch (err) {
          console.error("❌ [ADMIN FROM ME] Erro ao baixar imagem:", err);
        }
      } else if (msg?.audioMessage) {
        mediaType = "audio";
        messageText = "🎤 Áudio"; // Será substituído pela transcrição
        try {
          const buffer = await downloadMediaMessage(waMessage, "buffer", {});
          const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
          const result = await uploadMediaToStorage(buffer, mimeType, adminId);
          if (result?.url) {
            mediaUrl = result.url;
            mediaMimeType = mimeType;
            console.log(`✅ [ADMIN FROM ME] Áudio salvo: ${buffer.length} bytes (${mimeType})`);
          }
        } catch (err) {
          console.error("❌ [ADMIN FROM ME] Erro ao baixar áudio:", err);
        }
      } else if (msg?.videoMessage) {
        mediaType = "video";
        messageText = msg.videoMessage.caption || "🎬 Vídeo";
      } else if (msg?.documentMessage) {
        mediaType = "document";
        messageText = `📄 ${msg.documentMessage.fileName || "Documento"}`;
      } else {
        // Tipo não suportado
        const msgTypes = Object.keys(msg || {});
        if (!msgTypes.includes("protocolMessage")) {
          console.log(`⚠️ [ADMIN FROM ME] Tipo de mensagem não suportado:`, msgTypes);
        }
        return;
      }
      
      console.log(`📤 [ADMIN FROM ME] Salvando mensagem do admin: ${messageText.substring(0, 50)}...`);
      
      // Buscar/criar conversa
      let conversation;
      try {
        conversation = await storage.getOrCreateAdminConversation(
          adminId,
          contactNumber,
          realRemoteJid,
          waMessage.pushName || undefined
        );
        
        // Salvar mensagem (transcrição de áudio acontece automaticamente em createAdminMessage)
        const savedMessage = await storage.createAdminMessage({
          conversationId: conversation.id,
          messageId: waMessage.key.id || `msg_${Date.now()}`,
          fromMe: true,
          text: messageText,
          timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
          status: "sent",
          isFromAgent: false,
          mediaType,
          mediaUrl,
          mediaMimeType,
        });
        
        // Se foi áudio e temos transcrição, usar o texto transcrito
        if (savedMessage?.text && savedMessage.text !== messageText) {
          console.log(`🎤 [ADMIN FROM ME] Texto atualizado com transcrição: ${savedMessage.text.substring(0, 100)}...`);
          messageText = savedMessage.text;
        }
        
        // Atualizar última mensagem da conversa
        await storage.updateAdminConversation(conversation.id, {
          lastMessageText: messageText.substring(0, 255),
          lastMessageTime: new Date(),
        });
        
        console.log(`✅ [ADMIN FROM ME] Mensagem salva na conversa ${conversation.id}`);
      } catch (error) {
        console.error(`❌ [ADMIN FROM ME] Erro ao salvar mensagem:`, error);
      }
    }

    // -----------------------------------------------------------------------
    // 👁️ HANDLER DE PRESENÇA (TYPING/PAUSED) - DETECÇÃO DE DIGITAÇÃO
    // -----------------------------------------------------------------------
    socket.ev.on("presence.update", async (update) => {
      const { id, presences } = update;
      
      // LOG DE DEBUG PARA DIAGN�STICO (ATIVADO)
      if (!id.includes("@g.us") && !id.includes("@broadcast")) {
         console.log(`??? [PRESENCE RAW] ID: ${id} | Presences: ${JSON.stringify(presences)}`);
      }

      // Verificar se � um chat individual
      if (id.includes("@g.us") || id.includes("@broadcast")) return;

      // Verificar se temos uma resposta pendente para este chat
      // FIX: O ID que vem no presence.update pode ser um LID (ex: 254635809968349@lid)
      // Precisamos mapear esse LID para o n�mero de telefone real (contactNumber)
      // O pendingAdminResponses usa o contactNumber como chave (ex: 5517991956944)
      
      let contactNumber = cleanContactNumber(id);
      
      // Se for LID, tentar encontrar o n�mero real no cache de contatos
      if (id.includes("@lid")) {
         const contact = contactsCache.get(id);
         if (contact && contact.phoneNumber) {
             contactNumber = cleanContactNumber(contact.phoneNumber);
             console.log(`??? [PRESENCE MAP] Mapeado LID ${id} -> ${contactNumber}`);
         } else {
             // Se n�o achou no cache, tentar buscar no banco (fallback)
             // Mas como � async, talvez n�o d� tempo. Vamos tentar varrer o pendingAdminResponses
             // para ver se algum remoteJid bate com esse LID? N�o, remoteJid geralmente � s.whatsapp.net
             
             // TENTATIVA DE RECUPERA��O:
             // Se o ID for LID, e n�o achamos o contactNumber, vamos tentar ver se existe
             // alguma resposta pendente onde o remoteJidAlt seja esse LID
             // OU se s� existe UMA resposta pendente no sistema, assumimos que � ela (para testes)
             
             if (pendingAdminResponses.size === 1) {
                 contactNumber = pendingAdminResponses.keys().next().value || "";
                 console.log(`??? [PRESENCE GUESS] LID desconhecido ${id}, mas s� h� 1 pendente: ${contactNumber}. Assumindo match.`);
             } else {
                 console.log(`?? [PRESENCE FAIL] N�o foi poss�vel mapear LID ${id} para um n�mero de telefone.`);
             }
         }
      }

      if (!contactNumber) return;

      const pending = pendingAdminResponses.get(contactNumber);
      
      // Se n�o tiver resposta pendente, n�o precisamos fazer nada (n�o estamos esperando para responder)
      if (!pending) return;

      console.log(`??? [PRESENCE MATCH] Update para ${contactNumber} (tem resposta pendente)`);
      console.log(`   Dados: ${JSON.stringify(presences)}`);

      // Encontrar o participante correto (o cliente)
      // Em chats privados, a chave deve conter o n�mero do cliente
      const participantKey = Object.keys(presences).find(key => key.includes(contactNumber));
      
      // FIX: Se n�o encontrar pelo n�mero, pode ser que a chave seja o JID completo ou diferente
      // Vamos tentar pegar qualquer chave que N�O seja o nosso pr�prio n�mero
      let finalKey = participantKey;
      
      if (!finalKey) {
        const myNumber = cleanContactNumber(socket.user?.id);
        const otherKeys = Object.keys(presences).filter(k => !k.includes(myNumber));
        
        if (otherKeys.length > 0) {
          finalKey = otherKeys[0];
        }
      }

      if (!finalKey) {
         console.log(`   ?? [PRESENCE] N�o foi poss�vel identificar o participante alvo. Chaves: ${Object.keys(presences)}`);
         return;
      }

      const presence = presences[finalKey]?.lastKnownPresence;
      
      if (!presence) return;

      // Atualizar presen�a conhecida
      pending.lastKnownPresence = presence;
      pending.lastPresenceUpdate = Date.now();

      console.log(`   ??? [PRESENCE DETECTED] Status: ${presence} | User: ${finalKey}`);

      if (presence === 'composing') {
        console.log(`?? [ADMIN AGENT] Usu�rio ${contactNumber} est� digitando... Estendendo espera.`);
        
        // Se estiver digitando, estender o timeout para aguardar
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Adicionar 25 segundos de "buffer de digita��o"
        // Isso evita responder enquanto o usu�rio ainda est� escrevendo
        const typingBuffer = 25000; // 25s
        
        pending.timeout = setTimeout(() => {
          console.log(`? [ADMIN AGENT] Timeout de digita��o (25s) expirou para ${contactNumber}. Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, typingBuffer);
        
      } else if (presence === 'paused') {
        console.log(`? [ADMIN AGENT] Usu�rio ${contactNumber} parou de digitar. Retomando espera padr�o (6s).`);
        
        if (pending.timeout) {
          clearTimeout(pending.timeout);
        }
        
        // Voltar para o delay padr�o de 6s
        // Importante: Dar um pequeno delay extra (ex: 6s) para garantir que n�o � apenas uma pausa breve
        const standardDelay = 6000; 
        
        pending.timeout = setTimeout(() => {
          console.log(`? [ADMIN AGENT] Timeout padr�o (6s) expirou para ${contactNumber} (ap�s pausa). Processando...`);
          void processAdminAccumulatedMessages({ 
            socket, 
            key: contactNumber, 
            generation: pending.generation 
          });
        }, standardDelay);
      } else {
        // Logar outros estados de presen�a para debug (ex: available, unavailable)
        console.log(`?? [ADMIN AGENT] Presen�a atualizada para ${contactNumber}: ${presence}`);
      }
    });

    // -----------------------------------------------------------------------
    // ?? HANDLER DE MENSAGENS DO ADMIN - ATENDIMENTO AUTOMATIZADO
    // -----------------------------------------------------------------------
    socket.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // -----------------------------------------------------------------------
      // ?? CACHEAR MENSAGEM PARA getMessage() - FIX "AGUARDANDO MENSAGEM" ADMIN
      // -----------------------------------------------------------------------
      if (message.key.id && message.message) {
        cacheMessage(`admin_${adminId}`, message.key.id, message.message);
      }
      
      // 🎤 FIX TRANSCRIÇÃO: Capturar mensagens enviadas pelo próprio admin (fromMe: true)
      // para salvar no banco e transcrever áudios
      if (message.key.fromMe) {
        console.log(`📤 [ADMIN] Mensagem enviada pelo admin detectada`);
        try {
          await handleAdminOutgoingMessage(adminId, message);
        } catch (err) {
          console.error("❌ [ADMIN] Erro ao processar mensagem do admin:", err);
        }
        return; // Não processar como mensagem recebida
      }
      
      const remoteJid = message.key.remoteJid;
      if (!remoteJid) return;
      
      // Filtrar grupos e status
      if (remoteJid.includes("@g.us") || remoteJid.includes("@broadcast")) {
        console.log(`?? [ADMIN] Ignorando mensagem de grupo/status`);
        return;
      }
      
      try {
        // Importar dinamicamente para evitar circular dependency
        const { processAdminMessage, getOwnerNotificationNumber } = await import("./adminAgentService");
        
        // -----------------------------------------------------------------------
        // ?? FIX LID 2025: Resolver @lid para n�mero real usando remoteJidAlt
        // -----------------------------------------------------------------------
        let contactNumber: string;
        let realRemoteJid = remoteJid;  // JID real para envio de mensagens
        
        if (remoteJid.includes("@lid") && (message.key as any).remoteJidAlt) {
          const realJid = (message.key as any).remoteJidAlt;
          contactNumber = cleanContactNumber(realJid);
          realRemoteJid = realJid;
          
          console.log(`\n? [ADMIN LID RESOLVIDO] N�mero real encontrado via remoteJidAlt!`);
          console.log(`   LID: ${remoteJid}`);
          console.log(`   JID WhatsApp REAL: ${realJid}`);
          console.log(`   N�mero limpo: ${contactNumber}\n`);
          
          // Salvar mapeamento LID ? n�mero no cache do admin
          contactsCache.set(remoteJid, {
            id: remoteJid,
            name: message.pushName || undefined,
            phoneNumber: realJid,
          });
        } else {
          contactNumber = cleanContactNumber(remoteJid);
        }
        
        if (!contactNumber) {
          console.log(`?? [ADMIN] N�o foi poss�vel extrair n�mero de: ${remoteJid}`);
          return;
        }
        
        // Extrair texto e m�dia da mensagem
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
            const mimetype = msg.imageMessage.mimetype || "image/jpeg";
            // 🚀 Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimetype, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`✅ [ADMIN] Imagem salva no Storage: ${result.url}`);
            } else {
              console.warn(`⚠️ [ADMIN] Falha no upload, imagem não salva`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar imagem:", err);
          }
        } else if (msg?.audioMessage) {
          mediaType = "audio";
          messageText = "🎤 Áudio"; // Texto inicial, será substituído pela transcrição
          // 🎙️ Baixar áudio para transcrição (será transcrito em createAdminMessage)
          try {
            const buffer = await downloadMediaMessage(message, "buffer", {});
            const mimeType = msg.audioMessage.mimetype || "audio/ogg; codecs=opus";
            // 🚀 Usar Storage em vez de base64 para reduzir egress
            const result = await uploadMediaToStorage(buffer, mimeType, adminId);
            if (result?.url) {
              mediaUrl = result.url;
              console.log(`✅ [ADMIN] Áudio salvo no Storage: ${buffer.length} bytes (${mimeType})`);
            } else {
              console.warn(`⚠️ [ADMIN] Falha no upload de áudio`);
            }
          } catch (err) {
            console.error("[ADMIN] Erro ao baixar áudio:", err);
          }
        } else if (msg?.videoMessage) {
          mediaType = "video";
          messageText = msg.videoMessage.caption || "?? V�deo";
        } else if (msg?.documentMessage) {
          mediaType = "document";
          messageText = `?? ${msg.documentMessage.fileName || "Documento"}`;
        } else {
          // Suprimir logs de protocolMessage (system messages) para evitar spam
          const msgTypes = Object.keys(msg || {});
          if (!msgTypes.includes("protocolMessage")) {
            console.log(`?? [ADMIN] Tipo de mensagem n�o suportado:`, msgTypes);
          }
          return;
        }
        
        console.log(`\n?? [ADMIN AGENT] ========================================`);
        console.log(`   ?? De: ${contactNumber}`);
        console.log(`   ?? Mensagem: ${messageText.substring(0, 100)}...`);
        console.log(`   ??? M�dia: ${mediaType || "nenhuma"}`);
        console.log(`   ========================================\n`);
        
        // -----------------------------------------------------------------------
        // ?? SALVAR CONVERSA E MENSAGEM NO BANCO DE DADOS
        // -----------------------------------------------------------------------
        let conversation;
        let savedMessage: any = null;
        try {
          // IMPORTANTE: Usar realRemoteJid (n�mero real) para envio de respostas
          conversation = await storage.getOrCreateAdminConversation(
            adminId, 
            contactNumber, 
            realRemoteJid, 
            message.pushName || undefined
          );

          // ?? Tentar buscar foto de perfil se n�o tiver (ass�ncrono para n�o bloquear)
          if (!conversation.contactAvatar) {
             socket.profilePictureUrl(realRemoteJid, 'image')
               .then(url => {
                 if (url) {
                   storage.updateAdminConversation(conversation.id, { contactAvatar: url })
                     .catch(err => console.error(`? [ADMIN] Erro ao salvar avatar:`, err));
                 }
               })
               .catch(() => {}); // Ignorar erro (sem foto/privado)
          }
          
          // Salvar a mensagem recebida (transcri��o de �udio acontece dentro)
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
          
          // ?? Se foi �udio e temos transcri��o, usar o texto transcrito
          if (savedMessage?.text && savedMessage.text !== messageText) {
            console.log(`[ADMIN] ?? Texto atualizado com transcri��o: ${savedMessage.text.substring(0, 100)}...`);
            messageText = savedMessage.text;
          }
          
          // Atualizar �ltima mensagem da conversa
          await storage.updateAdminConversation(conversation.id, {
            lastMessageText: messageText.substring(0, 255),
            lastMessageTime: new Date(),
          });
          
          console.log(`?? [ADMIN] Mensagem salva na conversa ${conversation.id}`);
        } catch (dbError) {
          console.error(`? [ADMIN] Erro ao salvar mensagem no banco:`, dbError);
          // Continuar processamento mesmo com erro no banco
        }
        
        // -----------------------------------------------------------------------
        // ?? VERIFICAR SE AGENTE EST� HABILITADO PARA ESTA CONVERSA
        // -----------------------------------------------------------------------
        if (conversation) {
          const isAgentEnabled = await storage.isAdminAgentEnabledForConversation(conversation.id);
          console.log(`?? [ADMIN] Status do agente para ${contactNumber}: ${isAgentEnabled ? '? ATIVO' : '? DESATIVADO'}`);
          
          if (!isAgentEnabled) {
            console.log(`?? [ADMIN] Agente pausado para conversa ${conversation.id} (${contactNumber}) - Ignorando mensagem.`);
            return;
          }
        } else {
          console.warn(`?? [ADMIN] Objeto 'conversation' indefinido para ${contactNumber}. Verifica��o de status ignorada (Risco de resposta indesejada).`);
        }
        
        // Verificar se � mensagem para atendimento automatizado
        const adminAgentEnabled = await storage.getSystemConfig("admin_agent_enabled");
        
        if (adminAgentEnabled?.valor !== "true") {
          console.log(`?? [ADMIN] Agente admin desativado, n�o processando`);
          return;
        }
        
        // Para m�dias (ex: comprovante) processar imediatamente.
        // Para textos (inclusive v�rias mensagens em linhas separadas), acumular e responder uma vez.
        // �UDIOS: Tratar como TEXTO pois s�o transcritos - mesmas regras de acumula��o, delay, trigger
        // IMAGENS: Processar imediatamente pois podem ser comprovantes de pagamento
        const shouldAccumulate = !mediaType || mediaType === 'audio';
        
        if (shouldAccumulate) {
          // �udios e textos usam o sistema de acumula��o
          // Isso garante: tempo de resposta, delay humanizado, verifica��o de trigger
          await scheduleAdminAccumulatedResponse({
            socket,
            remoteJid: realRemoteJid,  // IMPORTANTE: Usar JID real para envio
            contactNumber,
            messageText,  // Para �udios, j� � o texto transcrito
            conversationId: conversation?.id,
          });
          return;
        }

        // Para IMAGENS APENAS:
        // - N�o acumular (processar imediatamente)
        // - N�o verificar trigger (podem ser comprovantes)
        console.log(`?? [ADMIN] M�dia ${mediaType} - processamento imediato (poss�vel comprovante)`);
        
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
            // ??? ANTI-BLOQUEIO: Usar fila do Admin
            await sendWithQueue('ADMIN_AGENT', `m�dia resposta parte ${i+1}`, async () => {
              await socket.sendMessage(realRemoteJid, { text: parts[i] });  // IMPORTANTE: Usar JID real
            });
          }
          console.log(`? [ADMIN AGENT] Resposta enviada para ${contactNumber}`);
          
          // ?? Salvar resposta do agente no banco de dados
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
              
              console.log(`?? [ADMIN AGENT] Resposta (m�dia) salva na conversa ${conversation.id}`);
            } catch (dbError) {
              console.error(`? [ADMIN AGENT] Erro ao salvar resposta no banco:`, dbError);
            }
          }
        }

        if (response && response.actions?.notifyOwner) {
          const ownerNumber = await getOwnerNotificationNumber();
          const ownerJid = `${ownerNumber}@s.whatsapp.net`;

          const notificationText = `?? *NOTIFICA��O DE PAGAMENTO*\n\n?? Cliente: ${contactNumber}\n? ${new Date().toLocaleString("pt-BR")}\n\n?? Verificar comprovante e liberar conta`;
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'notifica��o pagamento m�dia', async () => {
            await socket.sendMessage(ownerJid, { text: notificationText });
          });
          console.log(`?? [ADMIN AGENT] Notifica��o enviada para ${ownerNumber}`);

          if (mediaType === "image" && mediaUrl) {
            try {
              const base64Data = mediaUrl.split(",")[1];
              const buffer = Buffer.from(base64Data, "base64");
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'comprovante imagem', async () => {
                await socket.sendMessage(ownerJid, {
                  image: buffer,
                  caption: `?? Comprovante do cliente ${contactNumber}`,
                });
              });
            } catch (err) {
              console.error("[ADMIN AGENT] Erro ao encaminhar comprovante:", err);
            }
          }
        }
        
        // ?? Enviar m�dias se houver (para handler de m�dia)
        if (response && response.mediaActions && response.mediaActions.length > 0) {
          console.log(`?? [ADMIN AGENT MEDIA] Enviando ${response.mediaActions.length} m�dia(s)...`);
          console.log(`?? [ADMIN AGENT MEDIA] JID de destino: ${realRemoteJid}`);
          
          for (const action of response.mediaActions) {
            if (action.mediaData) {
              try {
                const media = action.mediaData;
                console.log(`?? [ADMIN AGENT MEDIA] ========================================`);
                console.log(`?? [ADMIN AGENT MEDIA] Preparando envio de m�dia:`);
                console.log(`   - Nome: ${media.name}`);
                console.log(`   - Tipo: ${media.mediaType}`);
                console.log(`   - MimeType: ${media.mimeType}`);
                console.log(`   - URL: ${media.storageUrl}`);
                
                const mediaBuffer = await downloadMediaAsBuffer(media.storageUrl);
                
                if (mediaBuffer) {
                  console.log(`?? [ADMIN AGENT MEDIA] Buffer baixado: ${mediaBuffer.length} bytes`);
                  
                  let sendResult: any;
                  
                  switch (media.mediaType) {
                    case 'image':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como IMAGEM...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm�dia handler imagem', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          image: mediaBuffer,
                          caption: media.caption || undefined,
                        });
                      });
                      break;
                    case 'audio':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como �UDIO PTT...`);
                      // ??? ANTI-BLOQUEIO
                      try {
                        sendResult = await sendWithQueue('ADMIN_AGENT', 'm�dia handler �udio', async () => {
                          return await socket.sendMessage(realRemoteJid, {
                            audio: mediaBuffer,
                            mimetype: media.mimeType || 'audio/ogg; codecs=opus',
                            ptt: true,
                          });
                        });
                      } catch (audioErr: any) {
                        console.log(`?? [ADMIN AGENT MEDIA] Erro ao enviar como PTT, tentando como audio normal...`);
                        console.log(`   Erro: ${audioErr.message}`);
                        // ??? ANTI-BLOQUEIO
                        sendResult = await sendWithQueue('ADMIN_AGENT', 'm�dia handler �udio fallback', async () => {
                          return await socket.sendMessage(realRemoteJid, {
                            audio: mediaBuffer,
                            mimetype: 'audio/mpeg',
                          });
                        });
                      }
                      break;
                    case 'video':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como V�DEO...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm�dia handler v�deo', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          video: mediaBuffer,
                          caption: media.caption || undefined,
                        });
                      });
                      break;
                    case 'document':
                      console.log(`?? [ADMIN AGENT MEDIA] Enviando como DOCUMENTO...`);
                      // ??? ANTI-BLOQUEIO
                      sendResult = await sendWithQueue('ADMIN_AGENT', 'm�dia handler documento', async () => {
                        return await socket.sendMessage(realRemoteJid, {
                          document: mediaBuffer,
                          fileName: media.fileName || media.name || 'document',
                          mimetype: media.mimeType || 'application/octet-stream',
                        });
                      });
                      break;
                    default:
                      console.log(`?? [ADMIN AGENT MEDIA] Tipo de m�dia n�o suportado: ${media.mediaType}`);
                  }
                  
                  if (sendResult) {
                    console.log(`? [ADMIN AGENT MEDIA] M�dia ${media.name} enviada com sucesso!`);
                    console.log(`   - Message ID: ${sendResult.key?.id || 'N/A'}`);
                    console.log(`   - Status: ${sendResult.status || 'N/A'}`);
                  } else {
                    console.log(`?? [ADMIN AGENT MEDIA] sendMessage retornou null/undefined para ${media.name}`);
                  }
                } else {
                  console.log(`? [ADMIN AGENT MEDIA] Falha ao baixar m�dia: buffer vazio`);
                }
              } catch (mediaError: any) {
                console.error(`? [ADMIN AGENT MEDIA] Erro ao enviar m�dia ${action.media_name}:`);
                console.error(`   - Mensagem: ${mediaError.message}`);
                console.error(`   - Stack: ${mediaError.stack?.substring(0, 300)}`);
              }
              await new Promise(r => setTimeout(r, 500));
            } else {
              console.log(`?? [ADMIN AGENT MEDIA] action.mediaData � null para ${action.media_name}`);
            }
          }
          console.log(`?? [ADMIN AGENT MEDIA] ========================================`);
        }

        // ?? Desconectar WhatsApp se solicitado (para handler de m�dia)
        if (response && response.actions?.disconnectWhatsApp) {
          try {
            const { getClientSession } = await import("./adminAgentService");
            const clientSession = getClientSession(contactNumber);
            
            if (clientSession?.userId) {
              console.log(`?? [ADMIN AGENT MEDIA] Desconectando WhatsApp do usu�rio ${clientSession.userId}...`);
              await disconnectWhatsApp(clientSession.userId);
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'desconex�o m�dia', async () => {
                await socket.sendMessage(realRemoteJid, { text: "Pronto! ?? Seu WhatsApp foi desconectado. Quando quiser reconectar, � s� me avisar!" });
              });
            } else {
              // ??? ANTI-BLOQUEIO
              await sendWithQueue('ADMIN_AGENT', 'desconex�o n�o encontrada m�dia', async () => {
                await socket.sendMessage(realRemoteJid, { text: "N�o encontrei uma conex�o ativa para desconectar." });
              });
            }
          } catch (disconnectError) {
            console.error("? [ADMIN AGENT MEDIA] Erro ao desconectar WhatsApp:", disconnectError);
          }
        }
        
      } catch (error) {
        console.error(`? [ADMIN AGENT] Erro ao processar mensagem:`, error);
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

      // Estado "connecting" - quando o QR Code foi escaneado e está conectando
      if (connStatus === "connecting") {
        console.log(`Admin ${adminId} is connecting...`);
        broadcastToAdmin(adminId, { type: "connecting" });
      }

      if (connStatus === "open") {
        const phoneNumber = socket.user?.id.split(":")[0];
        console.log(`? [ADMIN] WhatsApp conectado: ${phoneNumber}`);
        
        // For�ar presen�a dispon�vel para receber updates de outros usu�rios
        socket.sendPresenceUpdate('available').catch(err => console.error("Erro ao enviar presen�a:", err));
        
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

        // Sempre deletar a sessão primeiro
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
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear desconexões para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n🛡️ [DEV MODE] disconnectAdminWhatsApp bloqueado para admin ${adminId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ✅ Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp Admin desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
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

  // Limpar arquivos de autenticação para permitir nova conexão
  const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${adminId}`);
  await clearAuthFiles(adminAuthPath);

  broadcastToAdmin(adminId, { type: "disconnected" });
}

export async function sendWelcomeMessage(userPhone: string): Promise<void> {
  try {
    console.log(`[WELCOME] Iniciando envio de mensagem de boas-vindas para ${userPhone}`);

    // Obter configuração de mensagem de boas-vindas
    const enabledConfig = await storage.getSystemConfig('welcome_message_enabled');
    const messageConfig = await storage.getSystemConfig('welcome_message_text');

    if (!enabledConfig || enabledConfig.valor !== 'true') {
      console.log('[WELCOME] Mensagem de boas-vindas desabilitada');
      return;
    }

    if (!messageConfig || !messageConfig.valor) {
      console.log('[WELCOME] Mensagem de boas-vindas não configurada');
      return;
    }

    console.log('[WELCOME] Configuração encontrada, procurando admin...');

    // Obter admin (assumindo que há apenas um admin owner)
    const allAdmins = await storage.getAllAdmins();
    const adminUser = allAdmins.find(a => a.role === 'owner');

    if (!adminUser) {
      console.log('[WELCOME] Admin não encontrado');
      return;
    }

    console.log(`[WELCOME] Admin encontrado: ${adminUser.id}`);

    // Verificar se admin tem WhatsApp conectado
    const adminConnection = await storage.getAdminWhatsappConnection(adminUser.id);

    if (!adminConnection || !adminConnection.isConnected) {
      console.log('[WELCOME] Admin WhatsApp não conectado');
      return;
    }

    console.log('[WELCOME] Admin WhatsApp conectado, procurando sessão...');

    let adminSession = adminSessions.get(adminUser.id);

    // Se a sessão não existe, tentar restaurá-la
    if (!adminSession || !adminSession.socket) {
      console.log('[WELCOME] Admin WhatsApp session não encontrada, tentando restaurar...');
      try {
        await connectAdminWhatsApp(adminUser.id);
        adminSession = adminSessions.get(adminUser.id);

        if (!adminSession || !adminSession.socket) {
          console.log('[WELCOME] Falha ao restaurar sessão do admin');
          return;
        }

        console.log('[WELCOME] Sessão do admin restaurada com sucesso');
      } catch (restoreError) {
        console.error('[WELCOME] Erro ao restaurar sessão do admin:', restoreError);
        return;
      }
    }

    console.log('[WELCOME] Sessão encontrada, enviando mensagem...');

    // Formatar número para envio (remover + e adicionar @s.whatsapp.net)
    const formattedNumber = `${cleanContactNumber(userPhone) || userPhone.replace('+', '')}@${DEFAULT_JID_SUFFIX}`;

    // ??? ANTI-BLOQUEIO: Enviar via fila
    await sendWithQueue('ADMIN_AGENT', 'credenciais welcome', async () => {
      await adminSession!.socket!.sendMessage(formattedNumber, {
        text: messageConfig.valor,
      });
    });

    console.log(`[WELCOME] ✅ Mensagem de boas-vindas enviada com sucesso para ${userPhone}`);
  } catch (error) {
    console.error('[WELCOME] ❌ Erro ao enviar mensagem de boas-vindas:', error);
    // Não lança erro para não bloquear o cadastro
  }
}

export async function restoreExistingSessions(): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: N�o restaurar sess�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("\n?? [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restaura��o de sess�es WhatsApp");
    console.log("   ?? Isso evita conflitos com sess�es ativas no Railway/produ��o");
    console.log("   ?? Para conectar WhatsApp em dev, remova SKIP_WHATSAPP_RESTORE do .env\n");
    return;
  }
  
  try {
    console.log("Checking for existing WhatsApp connections...");
    const connections = await storage.getAllConnections();

    for (const connection of connections) {
      // Tenta restaurar se:
      // 1. Estava marcada como conectada no banco, OU
      // 2. Tem arquivos de autentica��o salvos (sess�o persistida)
      if (connection.userId) {
        const userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(userAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diret�rio n�o existe ou erro ao ler
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
  // ??? MODO DESENVOLVIMENTO: N�o restaurar sess�es para evitar conflito com produ��o
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("?? [DEV MODE] SKIP_WHATSAPP_RESTORE=true - Pulando restaura��o de sess�es Admin WhatsApp");
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
          console.log(`✅ Admin WhatsApp session restored for ${admin.id}`);
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

// -----------------------------------------------------------------------
// ?? CONEX�O VIA PAIRING CODE (SEM QR CODE)
// -----------------------------------------------------------------------
// Baileys suporta conex�o via c�digo de pareamento de 8 d�gitos
// Isso permite conectar pelo celular sem precisar escanear QR Code
// -----------------------------------------------------------------------

export async function requestClientPairingCode(userId: string, phoneNumber: string): Promise<string | null> {
  // 🛡️ MODO DESENVOLVIMENTO: Bloquear pairing para evitar conflito com produção
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log(`\n🛡️ [DEV MODE] requestClientPairingCode bloqueado para user ${userId}`);
    console.log(`   💡 SKIP_WHATSAPP_RESTORE=true - Modo desenvolvimento ativo`);
    console.log(`   ✅ Sessões do WhatsApp em produção não serão afetadas\n`);
    throw new Error('WhatsApp desabilitado em modo desenvolvimento (SKIP_WHATSAPP_RESTORE=true). Isso protege suas sessões em produção.');
  }
  
  // Verificar se já há uma solicitação em andamento para este usuário
  const existingRequest = pendingPairingRequests.get(userId);
  if (existingRequest) {
    console.log(`? [PAIRING] J� existe solicita��o em andamento para ${userId}, aguardando...`);
    return existingRequest;
  }
  
  // Criar Promise da solicita��o
  const requestPromise = (async () => {
    try {
      console.log(`?? [PAIRING] Solicitando c�digo para ${phoneNumber} (user: ${userId})`);
      
      // Limpar sess�o anterior se existir
      const existingSession = sessions.get(userId);
      if (existingSession?.socket) {
        try {
          console.log(`?? [PAIRING] Limpando sess�o anterior...`);
          await existingSession.socket.logout();
        } catch (e) {
          console.log(`?? [PAIRING] Erro ao fazer logout da sess�o anterior (ignorando):`, e);
        }
        sessions.delete(userId);
      }
    
    // Criar/obter conex�o
    let connection = await storage.getConnectionByUserId(userId);
    
    if (!connection) {
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    }
    
    const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    
    // Limpar auth anterior para come�ar do zero
    await clearAuthFiles(userAuthPath);

    // Recriar a pasta para o multi-file auth state
    await ensureDirExists(userAuthPath);
    
    const { state, saveCreds } = await useMultiFileAuthState(userAuthPath);
    
    const sock = makeWASocket({
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      printQRInTerminal: false,
      logger: pino({ level: "silent" }),
      // -----------------------------------------------------------------------
      // ?? FIX "AGUARDANDO PARA CARREGAR MENSAGEM" (WAITING FOR MESSAGE) - PAIRING
      // -----------------------------------------------------------------------
      getMessage: async (key) => {
        if (!key.id) return undefined;
        
        console.log(`?? [getMessage PAIRING] Baileys solicitou mensagem ${key.id} para retry`);
        
        // Tentar recuperar do cache em mem�ria
        const cached = getCachedMessage(userId, key.id);
        if (cached) {
          return cached;
        }
        
        // Fallback: tentar buscar do banco de dados
        try {
          const dbMessage = await storage.getMessageByMessageId(key.id);
          if (dbMessage && dbMessage.text) {
            console.log(`?? [getMessage PAIRING] Mensagem ${key.id} recuperada do banco de dados`);
            return { conversation: dbMessage.text };
          }
        } catch (err) {
          console.error(`? [getMessage PAIRING] Erro ao buscar mensagem do banco:`, err);
        }
        
        console.log(`?? [getMessage PAIRING] Mensagem ${key.id} n�o encontrada em nenhum cache`);
        return undefined;
      },
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
    
    // Handler de conex�o
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
        
        console.log(`? [PAIRING] WhatsApp conectado: ${phoneNum}`);
        broadcastToUser(userId, { type: "connected", phoneNumber: phoneNum });
      }
      
      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode;
        if (statusCode !== DisconnectReason.loggedOut) {
          console.log(`?? [PAIRING] Desconectado temporariamente, aguardando...`);
        }
      }
    });
    
    // Handler de mensagens
    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      if (!message.message) return;
      
      // -----------------------------------------------------------------------
      // ?? CACHEAR MENSAGEM PARA getMessage() - FIX "AGUARDANDO MENSAGEM" PAIRING
      // -----------------------------------------------------------------------
      if (message.key.id && message.message) {
        cacheMessage(userId, message.key.id, message.message);
      }
      
      // ?? IMPORTANTE: Ignorar mensagens de sincroniza��o/hist�rico
      // m.type === "notify" = mensagem NOVA (em tempo real)
      // m.type === "append" = sincroniza��o de hist�rico (ao abrir conversa)
      if (m.type !== "notify") {
        console.log(`?? [SYNC] Ignorando mensagem de sincroniza��o (type: ${m.type})`);
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
    
    // Formatar n�mero para pairing (sem + e sem @)
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    console.log(`?? [PAIRING] N�mero formatado para pareamento: ${cleanNumber}`);
    
    // Solicitar c�digo de pareamento
    // O c�digo ser� enviado via WhatsApp para o n�mero informado
    try {
      const code = await sock.requestPairingCode(cleanNumber);
      
      console.log(`? [PAIRING] C�digo gerado com sucesso: ${code}`);
      
      // Aguardar um pouco para garantir que o c�digo foi processado
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      return code;
    } catch (pairingError) {
      console.error(`? [PAIRING] Erro ao chamar requestPairingCode:`, pairingError);
      console.error(`? [PAIRING] Stack trace:`, (pairingError as Error).stack);
      throw pairingError;
    }
  } catch (error) {
    console.error(`?? [PAIRING] Erro geral ao solicitar c�digo:`, error);
    console.error(`?? [PAIRING] Tipo de erro:`, typeof error);
    console.error(`?? [PAIRING] Mensagem:`, (error as Error).message);
    
    // Limpar sess�o em caso de erro
    sessions.delete(userId);
    
    return null;
  } finally {
    // Remover da fila de pendentes
    pendingPairingRequests.delete(userId);
  }
  })();
  
  // Adicionar � fila de pendentes
  pendingPairingRequests.set(userId, requestPromise);
  
  return requestPromise;
}

// -----------------------------------------------------------------------
// ?? ENVIAR MENSAGEM VIA WHATSAPP DO ADMIN
// -----------------------------------------------------------------------

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
      console.error("[ADMIN MSG] Admin n�o encontrado");
      return false;
    }
    
    const adminSession = adminSessions.get(adminUser.id);
    
    if (!adminSession?.socket) {
      console.error("[ADMIN MSG] Sess�o do admin n�o encontrada");
      return false;
    }
    
    const cleanNumber = toNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@${DEFAULT_JID_SUFFIX}`;
    
    if (media) {
      // Enviar m�dia com delay anti-bloqueio
      switch (media.type) {
        case "image":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg imagem', async () => {
            await adminSession.socket!.sendMessage(jid, {
              image: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "audio":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg �udio', async () => {
            await adminSession.socket!.sendMessage(jid, {
              audio: media.buffer,
              mimetype: media.mimetype,
              ptt: true, // Enviar como �udio de voz
            });
          });
          break;
        case "video":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg v�deo', async () => {
            await adminSession.socket!.sendMessage(jid, {
              video: media.buffer,
              caption: media.caption || text,
              mimetype: media.mimetype,
            });
          });
          break;
        case "document":
          // ??? ANTI-BLOQUEIO
          await sendWithQueue('ADMIN_AGENT', 'admin msg documento', async () => {
            await adminSession.socket!.sendMessage(jid, {
              document: media.buffer,
              fileName: media.filename || "documento",
              mimetype: media.mimetype,
            });
          });
          break;
      }
    } else {
      // ??? ANTI-BLOQUEIO: Enviar apenas texto
      await sendWithQueue('ADMIN_AGENT', 'admin msg texto', async () => {
        await adminSession.socket!.sendMessage(jid, { text });
      });
    }
    
    console.log(`? [ADMIN MSG] Mensagem enviada para ${cleanNumber}`);
    return true;
  } catch (error) {
    console.error("[ADMIN MSG] Erro ao enviar mensagem:", error);
    return false;
  }
}

// -----------------------------------------------------------------------
// ?? INTEGRA��O: FOLLOW-UPS / AGENDAMENTOS ? ENVIO PELO WHATSAPP DO ADMIN
// -----------------------------------------------------------------------

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

// -------------------------------------------------------------------------------
// ?? HEALTH CHECK MONITOR - RECONEX�O AUTOM�TICA DE SESS�ES
// -------------------------------------------------------------------------------
// Este sistema verifica periodicamente se as conex�es do WhatsApp est�o saud�veis.
// Se detectar que uma conex�o est� marcada como "conectada" no banco mas n�o tem
// socket ativo na mem�ria, tenta reconectar automaticamente.
//
// Intervalo: A cada 5 minutos (300.000ms)
// Isso resolve problemas de:
// - Desconex�es silenciosas por timeout de rede
// - Perda de conex�o durante restarts do container
// - Sess�es "zumbis" no banco de dados
// -------------------------------------------------------------------------------

const HEALTH_CHECK_INTERVAL_MS = 5 * 60 * 1000; // 5 minutos
let healthCheckInterval: NodeJS.Timeout | null = null;

async function connectionHealthCheck(): Promise<void> {
  // ??? MODO DESENVOLVIMENTO: N�o executar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    return;
  }
  
  console.log(`\n?? [HEALTH CHECK] -------------------------------------------`);
  console.log(`?? [HEALTH CHECK] Iniciando verifica��o de conex�es...`);
  console.log(`?? [HEALTH CHECK] Timestamp: ${new Date().toISOString()}`);
  
  try {
    // 1. Verificar conex�es de usu�rios
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
        // ?? Conex�o "zumbi" detectada - DB diz conectado mas n�o tem socket
        console.log(`?? [HEALTH CHECK] Conex�o zumbi detectada: ${connection.userId}`);
        console.log(`   ?? DB: isConnected=${isDbConnected}, Socket: ${hasActiveSocket ? 'ATIVO' : 'INATIVO'}`);
        
        // Verificar se h� arquivos de auth para restaurar
        const userAuthPath = path.join(SESSIONS_BASE, `auth_${connection.userId}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(userAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diret�rio n�o existe
        }
        
        if (hasAuthFiles) {
          console.log(`?? [HEALTH CHECK] Tentando reconectar ${connection.userId}...`);
          try {
            await connectWhatsApp(connection.userId);
            reconnectedUsers++;
            console.log(`? [HEALTH CHECK] ${connection.userId} reconectado com sucesso!`);
          } catch (error) {
            console.error(`? [HEALTH CHECK] Falha ao reconectar ${connection.userId}:`, error);
            // Marcar como desconectado no banco para evitar loops
            await storage.updateConnection(connection.id, {
              isConnected: false,
              qrCode: null,
            });
            disconnectedUsers++;
          }
        } else {
          console.log(`?? [HEALTH CHECK] ${connection.userId} sem arquivos de auth - marcando como desconectado`);
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
    
    // 2. Verificar conex�es de admin
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
        console.log(`?? [HEALTH CHECK] Admin conex�o zumbi: ${admin.id}`);
        
        const adminAuthPath = path.join(SESSIONS_BASE, `auth_admin_${admin.id}`);
        let hasAuthFiles = false;
        
        try {
          const authFiles = await fs.readdir(adminAuthPath);
          hasAuthFiles = authFiles.length > 0;
        } catch (e) {
          // Diret�rio n�o existe
        }
        
        if (hasAuthFiles) {
          console.log(`?? [HEALTH CHECK] Tentando reconectar admin ${admin.id}...`);
          try {
            await connectAdminWhatsApp(admin.id);
            reconnectedAdmins++;
            console.log(`? [HEALTH CHECK] Admin ${admin.id} reconectado!`);
          } catch (error) {
            console.error(`? [HEALTH CHECK] Falha ao reconectar admin ${admin.id}:`, error);
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
    
    console.log(`\n?? [HEALTH CHECK] Resumo:`);
    console.log(`   ?? Usu�rios: ${healthyUsers} saud�veis, ${reconnectedUsers} reconectados, ${disconnectedUsers} desconectados`);
    console.log(`   ?? Admins: ${healthyAdmins} saud�veis, ${reconnectedAdmins} reconectados`);
    console.log(`?? [HEALTH CHECK] -------------------------------------------\n`);
    
  } catch (error) {
    console.error(`? [HEALTH CHECK] Erro no health check:`, error);
  }
}

export function startConnectionHealthCheck(): void {
  // ??? MODO DESENVOLVIMENTO: N�o iniciar health check
  if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
    console.log("?? [HEALTH CHECK] Desabilitado em modo desenvolvimento");
    return;
  }
  
  if (healthCheckInterval) {
    console.log("?? [HEALTH CHECK] J� est� rodando");
    return;
  }
  
  console.log(`\n?? [HEALTH CHECK] Iniciando monitor de conex�es...`);
  console.log(`   ?? Intervalo: ${HEALTH_CHECK_INTERVAL_MS / 1000 / 60} minutos`);
  
  // Executar primeiro check ap�s 30 segundos (dar tempo para restaura��es iniciais)
  setTimeout(() => {
    connectionHealthCheck();
  }, 30000);
  
  // Agendar checks peri�dicos
  healthCheckInterval = setInterval(() => {
    connectionHealthCheck();
  }, HEALTH_CHECK_INTERVAL_MS);
  
  console.log(`? [HEALTH CHECK] Monitor iniciado com sucesso!\n`);
}

export function stopConnectionHealthCheck(): void {
  if (healthCheckInterval) {
    clearInterval(healthCheckInterval);
    healthCheckInterval = null;
    console.log("🛑 [HEALTH CHECK] Monitor parado");
  }
}

// Exportar função para check manual (útil para debug)
export { connectionHealthCheck };

// ==================== RESTORE PENDING AI TIMERS ====================
// 💾 Restaura timers de resposta da IA que estavam pendentes antes do restart
// Isso garante que mensagens não sejam perdidas em deploys/crashes
export async function restorePendingAITimers(): Promise<void> {
  // ?? MODO DEV: Pular restauração de timers se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`⏸️ [RESTORE TIMERS] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log(`💾 [RESTORE TIMERS] Iniciando restauração de timers pendentes...`);
  console.log(`${'='.repeat(60)}`);
  
  try {
    // Buscar todos os timers pendentes do banco
    const pendingTimers = await storage.getPendingAIResponsesForRestore();
    
    if (pendingTimers.length === 0) {
      console.log(`✅ [RESTORE TIMERS] Nenhum timer pendente para restaurar`);
      return;
    }
    
    console.log(`📋 [RESTORE TIMERS] Encontrados ${pendingTimers.length} timers para restaurar`);
    
    let restored = 0;
    let skipped = 0;
    let processed = 0;
    
    for (const timer of pendingTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages, executeAt } = timer;
      
      // Verificar se já tem timer em memória
      if (pendingResponses.has(conversationId)) {
        console.log(`⏭️ [RESTORE TIMERS] ${contactNumber} - Já tem timer em memória, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se já está sendo processada
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`⏭️ [RESTORE TIMERS] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Calcular tempo restante até execução
      const now = Date.now();
      const executeTime = executeAt.getTime();
      const remainingMs = executeTime - now;
      
      // Se o tempo já passou, processar imediatamente (com pequeno delay)
      if (remainingMs <= 0) {
        console.log(`🚀 [RESTORE TIMERS] ${contactNumber} - Timer expirado, processando AGORA`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages,
          conversationId,
          userId,
          contactNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now() - Math.abs(remainingMs), // Tempo original
        };
        
        // Processar com delay escalonado para não sobrecarregar
        const delayMs = processed * 3000; // 3s entre cada
        pending.timeout = setTimeout(async () => {
          console.log(`🔄 [RESTORE TIMERS] Processando timer restaurado para ${contactNumber}`);
          await processAccumulatedMessages(pending);
        }, delayMs + 1000); // Mínimo 1s
        
        pendingResponses.set(conversationId, pending);
        processed++;
        restored++;
        
      } else {
        // Timer ainda não expirou, re-agendar normalmente
        console.log(`⏰ [RESTORE TIMERS] ${contactNumber} - Reagendando em ${Math.round(remainingMs/1000)}s`);
        
        const pending: PendingResponse = {
          timeout: null as any,
          messages,
          conversationId,
          userId,
          contactNumber,
          jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
          startTime: Date.now() - (executeTime - now), // Calcular tempo original
        };
        
        pending.timeout = setTimeout(async () => {
          console.log(`🔄 [RESTORE TIMERS] Executando timer restaurado para ${contactNumber}`);
          await processAccumulatedMessages(pending);
        }, remainingMs);
        
        pendingResponses.set(conversationId, pending);
        restored++;
      }
    }
    
    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ [RESTORE TIMERS] Restauração concluída!`);
    console.log(`   📊 Total encontrados: ${pendingTimers.length}`);
    console.log(`   ✅ Restaurados: ${restored}`);
    console.log(`   ⏭️ Pulados: ${skipped}`);
    console.log(`   🚀 Processados imediatamente: ${processed}`);
    console.log(`${'='.repeat(60)}\n`);
    
  } catch (error) {
    console.error(`❌ [RESTORE TIMERS] Erro na restauração:`, error);
  }
}

// ==================== CRON JOB: RETRY TIMERS PENDENTES ====================
// Verifica a cada 15 segundos se há timers pendentes "órfãos" e os processa
// Isso garante que nenhuma mensagem fique sem resposta, mesmo após instabilidades
let pendingTimersCronInterval: NodeJS.Timeout | null = null;

export function startPendingTimersCron(): void {
  // ?? MODO DEV: Pular cron de timers pendentes se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`⏸️ [PENDING CRON] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (pendingTimersCronInterval) {
    console.log(`🔄 [PENDING CRON] Cron já está rodando`);
    return;
  }
  
  console.log(`🔄 [PENDING CRON] Iniciando cron de retry de timers pendentes (intervalo: 15s, 25/ciclo)`);
  
  // Executar a cada 15 segundos para maior responsividade
  pendingTimersCronInterval = setInterval(async () => {
    await processPendingTimersCron();
  }, 15 * 1000); // 15 segundos (era 30)
  
  // Primeira execução após 10 segundos (dar tempo para sessões conectarem)
  setTimeout(async () => {
    await processPendingTimersCron();
  }, 10 * 1000);
}

async function processPendingTimersCron(): Promise<void> {
  try {
    // Buscar timers pendentes que já expiraram (execute_at no passado)
    const pendingTimers = await storage.getPendingAIResponsesForRestore();
    
    if (pendingTimers.length === 0) {
      return; // Nada para processar
    }
    
    // Filtrar apenas os que já expiraram e não estão em memória
    const expiredTimers = pendingTimers.filter(timer => {
      const isExpired = timer.executeAt.getTime() < Date.now();
      const isInMemory = pendingResponses.has(timer.conversationId);
      const isBeingProcessed = conversationsBeingProcessed.has(timer.conversationId);
      
      // 🔍 DEBUG: Logar por que alguns timers são filtrados
      if (isExpired && (isInMemory || isBeingProcessed)) {
        console.log(`⏸️ [PENDING CRON] ${timer.contactNumber} - Filtrado: inMemory=${isInMemory}, beingProcessed=${isBeingProcessed}`);
      }
      
      return isExpired && !isInMemory && !isBeingProcessed;
    });
    
    if (expiredTimers.length === 0) {
      // 🔍 DEBUG: Logar quando todos foram filtrados
      console.log(`🔄 [PENDING CRON] Ciclo: ${pendingTimers.length} timers encontrados, todos filtrados (em memória ou processando)`);
      return;
    }
    
    console.log(`\n🔄 [PENDING CRON] =========================================`);
    console.log(`🔄 [PENDING CRON] Encontrados ${expiredTimers.length} timers órfãos para processar`);
    console.log(`🔄 [PENDING CRON] Sessões ativas: ${sessions.size}`);
    
    let processed = 0;
    let skipped = 0;
    
    for (const timer of expiredTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // Verificar se a sessão do usuário está disponível
      const session = sessions.get(userId);
      if (!session?.socket) {
        console.log(`⏭️ [PENDING CRON] ${contactNumber} - Sessão indisponível, pulando`);
        skipped++;
        continue;
      }
      
      // Calcular quanto tempo desde que deveria ter executado
      const timeSinceExecute = Date.now() - timer.executeAt.getTime();
      
      // 🔧 FIX: NÃO MAIS RESETAR TIMERS ANTIGOS - PROCESSAR IMEDIATAMENTE!
      // O bug anterior resetava e pulava, criando loop infinito
      // Agora processamos independente da idade do timer
      if (timeSinceExecute > 30 * 60 * 1000) {
        console.log(`⚠️ [PENDING CRON] ${contactNumber} - Timer MUITO antigo (${Math.round(timeSinceExecute/60000)}min), PROCESSANDO AGORA mesmo assim!`);
      }
      
      console.log(`🚀 [PENDING CRON] Processando ${contactNumber} (timer órfão há ${Math.round(timeSinceExecute/1000)}s)`);
      
      // Criar objeto PendingResponse e processar
      const pending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        contactNumber,
        jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: timer.scheduledAt.getTime(),
      };
      
      // Processar com delay escalonado por USUÁRIO (canal)
      // Delay de 1.5s entre mensagens do mesmo canal evita ban
      // Mas canais diferentes podem processar em paralelo!
      const delayMs = processed * 1500; // 1.5s entre cada (era 3s)
      setTimeout(async () => {
        await processAccumulatedMessages(pending);
      }, delayMs);
      
      processed++;
      
      // Limitar a 25 por ciclo para processar mais rápido (era 15)
      if (processed >= 25) {
        console.log(`🔄 [PENDING CRON] Limite de 25 por ciclo atingido, continuará no próximo ciclo`);
        break;
      }
    }
    
    console.log(`🔄 [PENDING CRON] Ciclo concluído: ${processed} processados, ${skipped} pulados`);
    console.log(`🔄 [PENDING CRON] =========================================\n`);
    
  } catch (error) {
    console.error(`❌ [PENDING CRON] Erro no cron:`, error);
  }
}

export function stopPendingTimersCron(): void {
  if (pendingTimersCronInterval) {
    clearInterval(pendingTimersCronInterval);
    pendingTimersCronInterval = null;
    console.log(`🛑 [PENDING CRON] Cron parado`);
  }
}

// ==================== CRON JOB: AUTO-RECUPERAÇÃO DE RESPOSTAS FALHADAS ====================
// Verifica a cada 5 minutos se há timers "completed" que na verdade não receberam resposta
// Isso é um "safety net" para garantir que nenhum cliente fique sem resposta
let autoRecoveryCronInterval: NodeJS.Timeout | null = null;

export function startAutoRecoveryCron(): void {
  // ?? MODO DEV: Pular cron de auto-recovery se DISABLE_WHATSAPP_PROCESSING=true
  if (process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {
    console.log(`⏸️ [AUTO-RECOVERY] DESABILITADO - DISABLE_WHATSAPP_PROCESSING=true`);
    return;
  }
  
  if (autoRecoveryCronInterval) {
    console.log(`🚨 [AUTO-RECOVERY] Cron já está rodando`);
    return;
  }
  
  console.log(`🚨 [AUTO-RECOVERY] Iniciando cron de auto-recuperação (intervalo: 5min)`);
  
  // Executar a cada 5 minutos
  autoRecoveryCronInterval = setInterval(async () => {
    await processAutoRecovery();
  }, 5 * 60 * 1000); // 5 minutos
  
  // Primeira execução após 2 minutos
  setTimeout(async () => {
    await processAutoRecovery();
  }, 2 * 60 * 1000);
}

async function processAutoRecovery(): Promise<void> {
  try {
    // Buscar timers "completed" que não têm resposta real
    const failedTimers = await storage.getCompletedTimersWithoutResponse();
    
    if (failedTimers.length === 0) {
      return; // Nada para recuperar
    }
    
    console.log(`\n🚨 [AUTO-RECOVERY] =========================================`);
    console.log(`🚨 [AUTO-RECOVERY] Encontrados ${failedTimers.length} timers para recuperar`);
    
    let recovered = 0;
    let skipped = 0;
    
    for (const timer of failedTimers) {
      const { conversationId, userId, contactNumber, jidSuffix, messages } = timer;
      
      // Verificar se já está em processamento
      if (conversationsBeingProcessed.has(conversationId)) {
        console.log(`⏭️ [AUTO-RECOVERY] ${contactNumber} - Em processamento, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se já tem timer em memória
      if (pendingResponses.has(conversationId)) {
        console.log(`⏭️ [AUTO-RECOVERY] ${contactNumber} - Já tem timer ativo, pulando`);
        skipped++;
        continue;
      }
      
      // Verificar se a sessão do usuário está disponível
      const session = sessions.get(userId);
      if (!session?.socket) {
        console.log(`⏭️ [AUTO-RECOVERY] ${contactNumber} - Sessão ${userId.substring(0,8)}... indisponível, pulando`);
        skipped++;
        continue;
      }
      
      console.log(`🔄 [AUTO-RECOVERY] Recuperando resposta para ${contactNumber} (user: ${userId.substring(0,8)}..., ${messages.length} msgs)`);
      
      // Resetar o timer para pending
      await storage.resetPendingAIResponseForRetry(conversationId);
      
      // Criar objeto PendingResponse
      // NOTA: Cada WhatsApp (userId) tem sua PRÓPRIA fila no messageQueueService
      // Não precisamos escalonar aqui - a fila anti-ban cuida de tudo
      const pending: PendingResponse = {
        timeout: null as any,
        messages,
        conversationId,
        userId,
        contactNumber,
        jidSuffix: jidSuffix || DEFAULT_JID_SUFFIX,
        startTime: Date.now(),
      };
      
      // Processar imediatamente - a fila do messageQueueService vai organizar
      // Cada userId tem sua própria fila, então múltiplos WhatsApps podem processar em paralelo
      processAccumulatedMessages(pending).catch(err => {
        console.error(`❌ [AUTO-RECOVERY] Erro ao processar ${contactNumber}:`, err);
      });
      
      recovered++;
      
      // Limitar quantidade por ciclo para não sobrecarregar o servidor
      if (recovered >= 10) {
        console.log(`🚨 [AUTO-RECOVERY] Limite de 10 por ciclo atingido, continuará no próximo`);
        break;
      }
    }
    
    console.log(`🚨 [AUTO-RECOVERY] Ciclo concluído: ${recovered} enviados para fila, ${skipped} pulados`);
    console.log(`🚨 [AUTO-RECOVERY] =========================================\n`);
    
  } catch (error) {
    console.error(`❌ [AUTO-RECOVERY] Erro no cron:`, error);
  }
}

export function stopAutoRecoveryCron(): void {
  if (autoRecoveryCronInterval) {
    clearInterval(autoRecoveryCronInterval);
    autoRecoveryCronInterval = null;
    console.log(`🛑 [AUTO-RECOVERY] Cron parado`);
  }
}

// ==================== RE-DOWNLOAD DE MÍDIA ====================
// Função para tentar re-baixar mídia do WhatsApp usando metadados salvos
export async function redownloadMedia(
  connectionId: string,
  mediaKeyBase64: string,
  directPath: string,
  originalUrl: string | undefined,
  mediaType: string,
  mediaMimeType: string
): Promise<{ success: boolean; mediaUrl?: string; error?: string }> {
  try {
    console.log(`🔄 [REDOWNLOAD] Tentando re-baixar mídia...`);
    console.log(`🔄 [REDOWNLOAD] connectionId: ${connectionId}`);
    console.log(`🔄 [REDOWNLOAD] mediaType: ${mediaType}`);
    console.log(`🔄 [REDOWNLOAD] directPath: ${directPath?.substring(0, 50)}...`);

    // Encontrar a sessão ativa para esta conexão
    const session = Array.from(sessions.values()).find(s => s.connectionId === connectionId);
    
    if (!session || !session.socket) {
      return { 
        success: false, 
        error: "WhatsApp não conectado. Conecte-se primeiro para re-baixar mídias." 
      };
    }

    // Importar downloadContentFromMessage do Baileys
    const { downloadContentFromMessage, MediaType } = await import("@whiskeysockets/baileys");

    // Converter mediaKey de base64 para Uint8Array
    const mediaKey = Buffer.from(mediaKeyBase64, "base64");

    // Mapear tipo de mídia para MediaType do Baileys
    const mediaTypeMap: { [key: string]: string } = {
      image: "image",
      audio: "audio",
      video: "video",
      document: "document",
      sticker: "sticker",
    };
    const baileysMediaType = mediaTypeMap[mediaType] || "document";

    // Tentar re-baixar usando downloadContentFromMessage
    console.log(`🔄 [REDOWNLOAD] Chamando downloadContentFromMessage...`);
    
    const stream = await downloadContentFromMessage(
      { 
        mediaKey: mediaKey, 
        directPath: directPath, 
        url: originalUrl 
      },
      baileysMediaType as any
    );

    // Ler o stream para buffer
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    console.log(`✅ [REDOWNLOAD] Mídia re-baixada: ${buffer.length} bytes`);

    if (buffer.length === 0) {
      return { success: false, error: "Mídia vazia - pode ter expirado no WhatsApp" };
    }

    // Upload para Supabase Storage (função já está definida no topo deste arquivo)
    // A função uploadMediaSimple recebe: (buffer, mimeType, originalFileName?)
    const filename = `redownloaded_${Date.now()}.${mediaType}`;
    const newMediaUrl = await uploadMediaSimple(buffer, mediaMimeType, filename);

    if (!newMediaUrl) {
      // SEM fallback para base64 - evitar egress!
      console.warn(`⚠️ [REDOWNLOAD] Falha no upload, mídia não será salva`);
      return { success: false, error: "Erro ao fazer upload da mídia re-baixada" };
    }

    console.log(`✅ [REDOWNLOAD] Nova URL gerada com sucesso!`);
    return { success: true, mediaUrl: newMediaUrl };

  } catch (error: any) {
    console.error(`❌ [REDOWNLOAD] Erro ao re-baixar mídia:`, error);
    
    // Erros comuns do WhatsApp
    if (error.message?.includes("gone") || error.message?.includes("404") || error.message?.includes("expired")) {
      return { success: false, error: "Mídia expirada - não está mais disponível no WhatsApp" };
    }
    if (error.message?.includes("decrypt")) {
      return { success: false, error: "Erro de descriptografia - chave pode estar corrompida" };
    }
    
    return { success: false, error: error.message || "Erro desconhecido ao re-baixar mídia" };
  }
}


// ═══════════════════════════════════════════════════════════════════════════════
// 🚨 SISTEMA DE RECUPERAÇÃO: Registrar processador de mensagens pendentes
// ═══════════════════════════════════════════════════════════════════════════════
// Este callback permite que o pendingMessageRecoveryService reprocesse mensagens
// que chegaram durante instabilidade/deploys do Railway
// 
// IMPORTANTE: Este código deve ficar no FINAL do arquivo para garantir que
// todas as funções necessárias já foram definidas
// ═══════════════════════════════════════════════════════════════════════════════

setTimeout(() => {
  try {
    registerMessageProcessor(async (userId: string, waMessage: WAMessage) => {
      // Buscar sessão ativa
      const session = sessions.get(userId);
      
      if (!session?.socket) {
        console.log(`🚨 [RECOVERY] Sessão não encontrada para ${userId.substring(0, 8)}... - pulando`);
        throw new Error('Sessão não disponível');
      }
      
      // Usar a função handleIncomingMessage existente
      await handleIncomingMessage(session, waMessage);
    });
    
    console.log(`🚨 [RECOVERY] ✅ Message processor registrado com sucesso!`);
  } catch (err) {
    console.error(`🚨 [RECOVERY] ❌ Erro ao registrar message processor:`, err);
  }
}, 1000); // Aguardar 1 segundo para garantir que tudo foi inicializado
