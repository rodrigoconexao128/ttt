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
import { generateAIResponse, type AIResponseResult } from "./aiAgent";
import { executeMediaActions, downloadMediaAsBuffer } from "./mediaService";
import { registerFollowUpCallback, registerScheduledContactCallback } from "./followUpService";

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

// 🔒 Map para rastrear solicitações de código de pareamento em andamento
// Evita múltiplas solicitações simultâneas para o mesmo usuário
const pendingPairingRequests = new Map<string, Promise<string | null>>();

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
}
const pendingResponses = new Map<string, PendingResponse>(); // key: conversationId

// 🎯 SISTEMA DE ACUMULAÇÃO (ADMIN AUTO-ATENDIMENTO)
interface PendingAdminResponse {
  timeout: NodeJS.Timeout | null;
  messages: string[];
  remoteJid: string;
  contactNumber: string;
  generation: number;
  startTime: number;
  conversationId?: string;
}
const pendingAdminResponses = new Map<string, PendingAdminResponse>(); // key: contactNumber

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
    const [splitChars, responseDelay, typingMin, typingMax, intervalMin, intervalMax] = await Promise.all([
      storage.getSystemConfig("admin_agent_message_split_chars"),
      storage.getSystemConfig("admin_agent_response_delay_seconds"),
      storage.getSystemConfig("admin_agent_typing_delay_min"),
      storage.getSystemConfig("admin_agent_typing_delay_max"),
      storage.getSystemConfig("admin_agent_message_interval_min"),
      storage.getSystemConfig("admin_agent_message_interval_max"),
    ]);

    const messageSplitChars = clampInt(parseInt(splitChars?.valor || "400", 10) || 400, 0, 5000);
    const responseDelaySeconds = clampInt(parseInt(responseDelay?.valor || "30", 10) || 30, 1, 180);
    const typingDelayMin = clampInt(parseInt(typingMin?.valor || "2", 10) || 2, 0, 60);
    const typingDelayMax = clampInt(parseInt(typingMax?.valor || "5", 10) || 5, typingDelayMin, 120);
    const messageIntervalMin = clampInt(parseInt(intervalMin?.valor || "3", 10) || 3, 0, 120);
    const messageIntervalMax = clampInt(parseInt(intervalMax?.valor || "8", 10) || 8, messageIntervalMin, 240);

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
      responseDelayMs: 30000,
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

    // Quebrar mensagem longa em partes
    const parts = splitMessageHumanLike(response.text || "", config.messageSplitChars);

    for (let i = 0; i < parts.length; i++) {
      const current = pendingAdminResponses.get(key);
      if (!current || current.generation !== generation) {
        console.log(`🔄 [ADMIN AGENT] Cancelando envio (mensagens novas chegaram)`);
        return;
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
function splitMessageHumanLike(message: string, maxChars: number = 400): string[] {
  // Se maxChars = 0, retorna mensagem completa sem divisão
  if (maxChars === 0) {
    return [message];
  }
  
  const MAX_CHARS_PER_MESSAGE = maxChars;
  const parts: string[] = [];
  
  // Dividir por parágrafos duplos (quebras de seção)
  const sections = message.split('\n\n').filter(s => s.trim());
  
  let currentPart = '';
  
  for (const section of sections) {
    // Se adicionar esta seção ultrapassar o limite, salva parte atual e inicia nova
    if (currentPart && (currentPart + '\n\n' + section).length > MAX_CHARS_PER_MESSAGE) {
      parts.push(currentPart.trim());
      currentPart = section;
    } else {
      currentPart = currentPart ? currentPart + '\n\n' + section : section;
    }
  }
  
  // Adicionar última parte
  if (currentPart) {
    parts.push(currentPart.trim());
  }
  
  // Se mensagem muito longa sem parágrafos, quebra por frases
  if (parts.length === 1 && parts[0].length > MAX_CHARS_PER_MESSAGE) {
    const sentences = parts[0].match(/[^.!?]+[.!?]+/g) || [parts[0]];
    parts.length = 0;
    currentPart = '';
    
    for (const sentence of sentences) {
      if (currentPart && (currentPart + sentence).length > MAX_CHARS_PER_MESSAGE) {
        parts.push(currentPart.trim());
        currentPart = sentence;
      } else {
        currentPart += sentence;
      }
    }
    
    if (currentPart) {
      parts.push(currentPart.trim());
    }
  }
  
  return parts.length > 0 ? parts : [message];
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

function broadcastToUser(userId: string, data: any) {
  const userClients = wsClients.get(userId);
  if (!userClients) return;

  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
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

export async function connectWhatsApp(userId: string): Promise<void> {
  try {
    // Verificar se jÃ¡ existe uma sessÃ£o ativa
    const existingSession = sessions.get(userId);
    if (existingSession?.socket) {
      console.log(`User ${userId} already has an active session, using existing one`);
      return;
    }

    let connection = await storage.getConnectionByUserId(userId);
    
    if (!connection) {
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    }

    const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
    await ensureDirExists(userAuthPath);
    const { state, saveCreds } = await useMultiFileAuthState(userAuthPath);

    // FIX LID 2025: Cache manual para mapear @lid → phone number
    const contactsCache = new Map<string, Contact>();

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

      if (qr) {
        try {
          const qrCodeDataURL = await QRCode.toDataURL(qr);
          await storage.updateConnection(session.connectionId, { qrCode: qrCodeDataURL });
          broadcastToUser(userId, { type: "qr", qr: qrCodeDataURL });
        } catch (err) {
          console.error("Error generating QR code:", err);
        }
      }

      // Estado "connecting" - quando o QR Code foi escaneado e estÃ¡ conectando
      if (conn === "connecting") {
        console.log(`User ${userId} is connecting...`);
        broadcastToUser(userId, { type: "connecting" });
      }

      if (conn === "close") {
        const statusCode = (lastDisconnect?.error as any)?.output?.statusCode; const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        // Sempre deletar a sessÃ£o primeiro
        sessions.delete(userId);

        // Atualizar banco de dados
        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        if (shouldReconnect) {
          console.log(`User ${userId} WhatsApp disconnected temporarily, reconnecting...`);
          broadcastToUser(userId, { type: "disconnected" });
          setTimeout(() => connectWhatsApp(userId), 3000);
        } else {
          // Foi logout (desconectado pelo celular), limpar TUDO
          console.log(`User ${userId} logged out from device, clearing all auth files...`);
          
          const userAuthPath = path.join(SESSIONS_BASE, `auth_${userId}`);
          await clearAuthFiles(userAuthPath);

          broadcastToUser(userId, { type: "disconnected", reason: "logout" });

          // IMPORTANTE: após logout, as credenciais foram apagadas.
          // Para gerar um novo QR Code automaticamente, reiniciar a conexão.
          setTimeout(() => {
            connectWhatsApp(userId).catch((err) => {
              console.error(`Error reconnecting WhatsApp after logout for ${userId}:`, err);
            });
          }, 1500);
        }
      } else if (conn === "open") {
        const phoneNumber = sock.user?.id?.split(":")[0] || "";
        session.phoneNumber = phoneNumber;

        await storage.updateConnection(session.connectionId, {
          isConnected: true,
          phoneNumber,
          qrCode: null,
        });

        broadcastToUser(userId, { type: "connected", phoneNumber });

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
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      if (!message.message) return;
      
      // 🔄 NOVA LÓGICA: Capturar mensagens enviadas pelo próprio usuário (fromMe: true)
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

  } catch (error) {
    console.error("Error connecting WhatsApp:", error);
    throw error;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📱 NOVA FUNÇÃO: Processar mensagens enviadas pelo DONO no WhatsApp
// ═══════════════════════════════════════════════════════════════════════
// Quando o dono responde direto no WhatsApp (fromMe: true),
// precisamos salvar essa mensagem no sistema para evitar "buracos"
// na conversa quando a IA voltar a responder.
// ═══════════════════════════════════════════════════════════════════════
async function handleOutgoingMessage(session: WhatsAppSession, waMessage: WAMessage) {
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

  // Extrair texto da mensagem
  const msg = waMessage.message;
  let messageText = "";
  let mediaType: string | null = null;

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
  } else if (msg?.videoMessage?.caption) {
    messageText = msg.videoMessage.caption;
    mediaType = "video";
  } else if (msg?.audioMessage) {
    messageText = "🎤 Áudio";
    mediaType = "audio";
  } else if (msg?.documentMessage?.caption) {
    messageText = msg.documentMessage.caption;
    mediaType = "document";
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

  // Salvar mensagem como fromMe: true
  await storage.createMessage({
    conversationId: conversation.id,
    messageId: waMessage.key.id!,
    fromMe: true,
    text: messageText,
    timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
    isFromAgent: false,
    mediaType,
  });

  // Atualizar conversa
  await storage.updateConversation(conversation.id, {
    lastMessageText: messageText,
    lastMessageTime: new Date(),
    unreadCount: 0, // Mensagens do dono não geram unread
  });

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
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.error("Error downloading image:", error);
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
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.error("Error downloading audio:", error);
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
      const buffer = await downloadMediaMessage(waMessage, "buffer", {});
      mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;
    } catch (error) {
      console.error("Error downloading video:", error);
      mediaUrl = null;
    }
  }
  // Check for document
  else if (msg?.documentMessage) {
    mediaType = "document";
    mediaMimeType = msg.documentMessage.mimetype || "application/octet-stream";
    messageText = `ðŸ“„ ${msg.documentMessage.fileName || "Documento"}`;
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
    
    // ⚠️ CRÍTICO: Verificar se última mensagem foi do cliente (não do agente)
    // Se última mensagem for do agente, NÃO responder (evita loop)
    const recentMessages = await storage.getMessagesByConversationId(conversation.id);
    const lastMessage = recentMessages[recentMessages.length - 1];
    
    if (lastMessage && lastMessage.fromMe) {
      console.log(`⏸️ [AI AGENT] Última mensagem foi do agente, não respondendo (evita loop)`);
      return;
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
    
    // Combinar todas as mensagens acumuladas
    const combinedText = messages.join('\n\n');
    console.log(`   📝 Texto combinado: "${combinedText.substring(0, 150)}..."`);

    const conversationHistory = await storage.getMessagesByConversationId(conversationId);
    const aiResult = await generateAIResponse(
      userId,
      conversationHistory,
      combinedText // ✅ Todas as mensagens combinadas
    );

    // 📁 Extrair texto e ações de mídia da resposta
    const aiResponse = aiResult?.text || null;
    const mediaActions = aiResult?.mediaActions || [];

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
      
      // 🤖 HUMANIZAÇÃO: Quebrar mensagens longas em múltiplas
      const agentConfig = await storage.getAgentConfig(userId);
      const maxChars = agentConfig?.messageSplitChars ?? 400;
      const messageParts = splitMessageHumanLike(aiResponse, maxChars);
      
      console.log(`[AI Agent] Sending to original JID: ${jid} (${messageParts.length} parts)`);
      
      for (let i = 0; i < messageParts.length; i++) {
        const part = messageParts[i];
        const isLast = i === messageParts.length - 1;
        
        // Delay entre mensagens (2-4 segundos) para simular digitação
        if (i > 0) {
          await new Promise(resolve => setTimeout(resolve, 2500 + Math.random() * 1500));
        }
        
        const sentMessage = await currentSession.socket.sendMessage(jid, { text: part });

        // ⚠️ IMPORTANTE: Registrar messageId para evitar duplicata em handleOutgoingMessage
        if (sentMessage?.key.id) {
          agentMessageIds.add(sentMessage.key.id);
          console.log(`🔒 [AI Agent] MessageId registrado (parte ${i+1}/${messageParts.length}): ${sentMessage.key.id}`);
        }

        await storage.createMessage({
          conversationId: conversationId,
          messageId: sentMessage?.key.id || `${Date.now()}-${i}`,
          fromMe: true,
          text: part,
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });

        // Só atualizar conversa na última parte
        if (isLast) {
          await storage.updateConversation(conversationId, {
            lastMessageText: part,
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
          actions: mediaActions,
          socket: currentSession.socket,
        });
        
        console.log(`📁 [AI Agent] Mídias enviadas com sucesso!`);
      }
    } else {
      console.log(`[AI Agent] No response generated (trigger phrase check or agent inactive)`);
    }
  } catch (error) {
    console.error("Error generating AI response:", error);
  }
}

export async function sendMessage(userId: string, conversationId: string, text: string): Promise<void> {
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

  // Usar remoteJid normalizado do banco (suporta @lid, @s.whatsapp.net, etc)
  const jid = buildSendJid(conversation);
  
  console.log(`[sendMessage] Sending to: ${jid}`);
  const sentMessage = await session.socket.sendMessage(jid, { text });

  // ⚠️ IMPORTANTE: Registrar messageId para evitar duplicata em handleOutgoingMessage
  if (sentMessage?.key.id) {
    agentMessageIds.add(sentMessage.key.id);
    console.log(`🔒 [sendMessage] MessageId registrado: ${sentMessage.key.id}`);
  }

  await storage.createMessage({
    conversationId,
    messageId: sentMessage?.key.id || Date.now().toString(),
    fromMe: true,
    text,
    timestamp: new Date(),
    status: "sent",
  });

  await storage.updateConversation(conversationId, {
    lastMessageText: text,
    lastMessageTime: new Date(),
  });

  broadcastToUser(userId, {
    type: "message_sent",
    conversationId,
    message: text,
  });
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

  console.log(`[BULK SEND] Iniciando envio para ${phones.length} números`);

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
      
      // Enviar mensagem
      const sentMessage = await session.socket.sendMessage(jid, { text: message });
      
      if (sentMessage?.key.id) {
        // Registrar messageId para evitar duplicatas
        agentMessageIds.add(sentMessage.key.id);
        sent++;
        console.log(`[BULK SEND] ✅ Enviado para ${phone} - MessageId: ${sentMessage.key.id}`);
      } else {
        failed++;
        errors.push(`${phone}: Sem ID de mensagem retornado`);
        console.log(`[BULK SEND] ❌ Falha ao enviar para ${phone}: Sem ID`);
      }

      // Delay entre mensagens para evitar bloqueio (2-5 segundos aleatório)
      const delay = 2000 + Math.random() * 3000;
      await new Promise(resolve => setTimeout(resolve, delay));
      
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
      
      // Enviar mensagem
      const sentMessage = await session.socket.sendMessage(jid, { text: finalMessage });
      
      if (sentMessage?.key.id) {
        // Registrar messageId para evitar duplicatas
        agentMessageIds.add(sentMessage.key.id);
        sent++;
        details.sent.push({
          phone: contact.phone,
          name: contact.name,
          timestamp: new Date().toISOString(),
          message: finalMessage,
        });
        console.log(`[BULK SEND ADVANCED] ✅ Enviado para ${contact.name || contact.phone}`);
      } else {
        failed++;
        const errorMsg = 'Sem ID de mensagem retornado';
        errors.push(`${contact.phone}: ${errorMsg}`);
        details.failed.push({
          phone: contact.phone,
          name: contact.name,
          error: errorMsg,
          timestamp: new Date().toISOString(),
        });
        console.log(`[BULK SEND ADVANCED] ❌ Falha: ${contact.phone}`);
      }

      // Delay humanizado entre mensagens
      const delay = delayMin + Math.random() * (delayMax - delayMin);
      console.log(`[BULK SEND ADVANCED] Aguardando ${(delay/1000).toFixed(1)}s...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      
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
      
      // Delay extra em caso de erro
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    contactIndex++;
  }

  console.log(`[BULK SEND ADVANCED] Concluído: ${sent} enviados, ${failed} falharam`);
  
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
  try {
    // Verificar se jÃ¡ existe uma sessÃ£o ativa
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
    const contactsCache = new Map<string, Contact>();

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
          conversation = await storage.getOrCreateAdminConversation(adminId, contactNumber, realRemoteJid);
          
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
          if (!isAgentEnabled) {
            console.log(`⏸️ [ADMIN] Agente pausado para conversa ${conversation.id} (${contactNumber})`);
            return;
          }
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

        if (shouldReconnect) {
          if (statusCode !== 428 && statusCode !== 401) { console.log(`Admin ${adminId} WhatsApp disconnected (code: ${statusCode}), reconnecting...`); }
          broadcastToAdmin(adminId, { type: "disconnected" });
          setTimeout(() => connectAdminWhatsApp(adminId), 5000);
        } else {
          // Foi logout (desconectado pelo celular), limpar TUDO
          console.log(`Admin ${adminId} logged out from device, clearing all auth files...`);
          
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
  try {
    console.log("Checking for existing WhatsApp connections...");
    const connections = await storage.getAllConnections();

    for (const connection of connections) {
      if (connection.isConnected && connection.userId) {
        console.log(`Restoring WhatsApp session for user ${connection.userId}...`);
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
    console.log("Session restoration complete");
  } catch (error) {
    console.error("Error restoring sessions:", error);
  }
}

export async function restoreAdminSessions(): Promise<void> {
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
    if (!text?.trim()) return;
    await sendAdminMessage(phoneNumber, text);
  } catch (error) {
    console.error("[FOLLOW-UP] Erro ao executar callback de follow-up:", error);
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


