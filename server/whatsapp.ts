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
import { generateAIResponse } from "./aiAgent";

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

// Base directory for storing Baileys multi-file auth state.
// Defaults to current working directory (backwards compatible with ./auth_*)
// You can set SESSIONS_DIR (e.g., "/data/whatsapp-sessions" on Railway volumes)
// to persist sessions between deploys and avoid baking them into the image.
const SESSIONS_BASE = process.env.SESSIONS_DIR || "./";

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

  // FIX LID 2025: Se for @lid, tentar buscar número real via contactsCache
  let contactNumber = cleanContactNumber(rawUser);
  
  if (remoteJid.includes("@lid") && contactsCache) {
    console.log(`   🚨 DETECTADO @LID - Iniciando resolução...`);
    
    // Tentativa 1: Buscar no cache em memória (rápido)
    let contact = contactsCache.get(remoteJid);
    console.log(`   [Tentativa 1] Cache lookup para "${remoteJid}":`, contact ? "✅ ENCONTRADO" : "❌ NÃO ENCONTRADO");
    
    // Tentativa 2: Se cache miss, buscar no banco Supabase (fallback)
    if (!contact?.phoneNumber && connectionId) {
      console.log(`   [Tentativa 2] Cache miss - Buscando no Supabase...`);
      console.log(`      Query: getContactByLid("${remoteJid}", "${connectionId}")`);
      try {
        const dbContact = await storage.getContactByLid(remoteJid, connectionId);
        console.log(`      Resultado DB:`, dbContact ? JSON.stringify(dbContact, null, 2) : "❌ NULL");
        
        if (dbContact?.phoneNumber) {
          // Encontrou no DB! Atualizar cache para próxima vez
          contact = {
            id: dbContact.contactId,
            lid: dbContact.lid || undefined,
            phoneNumber: dbContact.phoneNumber,
            name: dbContact.name || undefined,
          };
          contactsCache.set(remoteJid, contact);
          contactsCache.set(dbContact.contactId, contact);
          console.log(`   ✅ [LID FALLBACK] SUCESSO: ${remoteJid} → ${dbContact.phoneNumber}`);
          console.log(`      Cache atualizado com o resultado do DB`);
        } else {
          console.log(`   ❌ [LID FALLBACK] NÃO ENCONTRADO NO DB: ${remoteJid}`);
          console.log(`      ⚠️ Verificar se tabela whatsapp_contacts existe e tem dados`);
        }
      } catch (error) {
        console.error(`   ❌ [LID FALLBACK] ERRO na query DB:`, error);
      }
    }
    
    if (contact?.phoneNumber) {
      // Encontrou mapeamento LID → Phone Number!
      const realNumber = cleanContactNumber(contact.phoneNumber.split("@")[0]);
      console.log(`   [Tentativa 3] Extraindo número real de phoneNumber: ${contact.phoneNumber}`);
      console.log(`      Número limpo: ${realNumber}`);
      
      if (realNumber) {
        console.log(`   🎯 [LID FIX] SUCESSO! Mapeamento encontrado:`);
        console.log(`      LID: ${remoteJid}`);
        console.log(`      → phoneNumber: ${contact.phoneNumber}`);
        console.log(`      → Número limpo: ${realNumber}`);
        contactNumber = realNumber;
        // ✅ FORÇAR uso do número real (não continuar com @lid)
        jidSuffix = "s.whatsapp.net";
      }
    } else {
      console.log(`   ⚠️ [LID WARNING] NENHUM MAPEAMENTO ENCONTRADO!`);
      console.log(`      Tentativas: Cache (❌) + DB (❌)`);
      console.log(`      O sistema vai usar o LID diretamente (comportamento incorreto)`);
    }
  }

  const normalizedJid = contactNumber
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
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

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
      }
    });

    sock.ev.on("messages.upsert", async (m) => {
      const message = m.messages[0];
      
      // Ignorar mensagens enviadas por mim
      if (!message.message || message.key.fromMe) return;
      
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

  // FIX LID 2025: Passar contactsCache + connectionId para resolver @lid → phone number (com fallback DB)
  const { contactNumber, jidSuffix, normalizedJid } = await parseRemoteJid(remoteJid, session.contactsCache, session.connectionId);
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

    const effectiveText = savedMessage.text || messageText;

    // Se a mensagem de mídia (ex: áudio) tiver sido transcrita ao salvar,
    // garantimos que o último texto da conversa use essa transcrição.
    if (effectiveText !== messageText) {
      await storage.updateConversation(conversation.id, {
        lastMessageText: effectiveText,
        lastMessageTime: new Date(),
      });
      messageText = effectiveText;
    }

    broadcastToUser(session.userId, {
      type: "new_message",
      conversationId: conversation.id,
      message: messageText,
      mediaType,
  });

  // AI Agent Auto-Response com delay de 30 segundos
  try {
    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    if (!isAgentDisabled) {
      const userId = session.userId; // Salva userId antes do setTimeout
      const conversationId = conversation.id; // Salva conversationId
      const targetNumber = contactNumber; // CRÍTICO: Salva o número do contato para evitar closure incorreto
      console.log(`Scheduling AI response for ${targetNumber} in 30 seconds...`);
      
      // Aguardar 30 segundos antes de responder
      setTimeout(async () => {
        try {
          // IMPORTANTE: Busca sessão atualizada no momento do envio
          const currentSession = sessions.get(userId);
          if (!currentSession?.socket) {
            console.log(`[AI Agent] Session not available for user ${userId}, skipping response`);
            return;
          }

          const conversationHistory = await storage.getMessagesByConversationId(conversationId);
          const aiResponse = await generateAIResponse(
            userId,
            conversationHistory,
            messageText
          );

          if (aiResponse) {
            // Buscar remoteJid original do banco
            const conversationData = await storage.getConversation(conversationId);
            const jid = conversationData
              ? buildSendJid(conversationData)
              : `${targetNumber}@${jidSuffix || DEFAULT_JID_SUFFIX}`;
            
            console.log(`[AI Agent] Sending to original JID: ${jid}`);
            const sentMessage = await currentSession.socket.sendMessage(jid, { text: aiResponse });

            await storage.createMessage({
              conversationId: conversationId,
              messageId: sentMessage?.key.id || Date.now().toString(),
              fromMe: true,
              text: aiResponse,
              timestamp: new Date(),
              status: "sent",
              isFromAgent: true,
            });

            await storage.updateConversation(conversationId, {
              lastMessageText: aiResponse,
              lastMessageTime: new Date(),
            });

            broadcastToUser(userId, {
              type: "agent_response",
              conversationId: conversationId,
              message: aiResponse,
            });

            console.log(`[AI Agent] Message SENT to WhatsApp ${targetNumber}: ${aiResponse}`);
          } else {
            console.log(`[AI Agent] No response generated (trigger phrase check or agent inactive)`);
          }
        } catch (error) {
          console.error("Error generating delayed AI response:", error);
        }
      }, 30000); // 30 segundos = 30000 milissegundos
    }
  } catch (error) {
    console.error("Error scheduling AI response:", error);
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

    // Listener para cachear contatos quando Baileys emitir contacts.upsert
    socket.ev.on("contacts.upsert", (contacts) => {
      for (const contact of contacts) {
        contactsCache.set(contact.id, contact);
        if (contact.lid) {
          contactsCache.set(contact.lid, contact);
        }
        console.log(`[ADMIN CONTACT CACHE] Added: ${contact.id}${contact.phoneNumber ? ` (phoneNumber: ${contact.phoneNumber})` : ""}`);
      }
    });

    socket.ev.on("creds.update", saveCreds);

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
        console.log(`Admin ${adminId} WhatsApp connected: ${phoneNumber}`);
      }

      if (connStatus === "close") {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

        // Sempre deletar a sessÃ£o primeiro
        adminSessions.delete(adminId);

        // Atualizar banco de dados
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: false,
          qrCode: null,
        });

        if (shouldReconnect) {
          console.log(`Admin ${adminId} WhatsApp disconnected temporarily, reconnecting...`);
          broadcastToAdmin(adminId, { type: "disconnected" });
          setTimeout(() => connectAdminWhatsApp(adminId), 3000);
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



