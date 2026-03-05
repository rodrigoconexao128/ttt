import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import { storage } from "./storage";
import WebSocket from "ws";
import { generateAIResponse } from "./aiAgent";

interface WhatsAppSession {
  socket: WASocket | null;
  userId: string;
  connectionId: string;
  phoneNumber?: string;
}

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
}

const sessions = new Map<string, WhatsAppSession>();
const wsClients = new Map<string, Set<AuthenticatedWebSocket>>();

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

function broadcastToUser(userId: string, data: any) {
  const userClients = wsClients.get(userId);
  if (!userClients) return;

  userClients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify(data));
    }
  });
}

export async function connectWhatsApp(userId: string): Promise<void> {
  try {
    let connection = await storage.getConnectionByUserId(userId);
    
    if (!connection) {
      connection = await storage.createConnection({
        userId,
        isConnected: false,
      });
    }

    const { state, saveCreds } = await useMultiFileAuthState(`./auth_${userId}`);

    const sock = makeWASocket({
      auth: state,
      logger: pino({ level: "silent" }),
      printQRInTerminal: false,
    });

    const session: WhatsAppSession = {
      socket: sock,
      userId,
      connectionId: connection.id,
    };

    sessions.set(userId, session);

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

      if (conn === "close") {
        const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
        
        await storage.updateConnection(session.connectionId, {
          isConnected: false,
          qrCode: null,
        });

        broadcastToUser(userId, { type: "disconnected" });
        sessions.delete(userId);

        if (shouldReconnect) {
          console.log("Reconnecting...");
          setTimeout(() => connectWhatsApp(userId), 3000);
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
      if (!message.message || message.key.fromMe) return;

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

  const contactNumber = remoteJid.split("@")[0];
  const messageText = waMessage.message?.conversation || 
                     waMessage.message?.extendedTextMessage?.text || 
                     "[Media]";

  let conversation = await storage.getConversationByContactNumber(
    session.connectionId,
    contactNumber
  );

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: session.connectionId,
      contactNumber,
      contactName: waMessage.pushName,
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: 1,
    });
  } else {
    await storage.updateConversation(conversation.id, {
      lastMessageText: messageText,
      lastMessageTime: new Date(),
      unreadCount: (conversation.unreadCount || 0) + 1,
      contactName: waMessage.pushName || conversation.contactName,
    });
  }

  await storage.createMessage({
    conversationId: conversation.id,
    messageId: waMessage.key.id!,
    fromMe: false,
    text: messageText,
    timestamp: new Date(Number(waMessage.messageTimestamp) * 1000),
    isFromAgent: false,
  });

  broadcastToUser(session.userId, {
    type: "new_message",
    conversationId: conversation.id,
    message: messageText,
  });

  // AI Agent Auto-Response
  try {
    const isAgentDisabled = await storage.isAgentDisabledForConversation(conversation.id);
    
    if (!isAgentDisabled) {
      const conversationHistory = await storage.getMessagesByConversationId(conversation.id);
      const aiResponse = await generateAIResponse(
        session.userId,
        conversationHistory,
        messageText
      );

      if (aiResponse && session.socket) {
        const jid = `${contactNumber}@s.whatsapp.net`;
        const sentMessage = await session.socket.sendMessage(jid, { text: aiResponse });

        await storage.createMessage({
          conversationId: conversation.id,
          messageId: sentMessage?.key.id || Date.now().toString(),
          fromMe: true,
          text: aiResponse,
          timestamp: new Date(),
          status: "sent",
          isFromAgent: true,
        });

        await storage.updateConversation(conversation.id, {
          lastMessageText: aiResponse,
          lastMessageTime: new Date(),
        });

        broadcastToUser(session.userId, {
          type: "agent_response",
          conversationId: conversation.id,
          message: aiResponse,
        });

        console.log(`AI Agent responded to ${contactNumber}: ${aiResponse}`);
      }
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

  const jid = `${conversation.contactNumber}@s.whatsapp.net`;
  
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

  broadcastToUser(userId, { type: "disconnected" });
}

export function getSession(userId: string): WhatsAppSession | undefined {
  return sessions.get(userId);
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
