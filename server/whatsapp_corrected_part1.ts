import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  WASocket,
  proto,
  WAMessage,
  downloadMediaMessage,
  jidNormalizedUser,
  jidDecode,
  makeInMemoryStore,
} from "@whiskeysockets/baileys";
import QRCode from "qrcode";
import pino from "pino";
import path from "path";
import fs from "fs/promises";
import { storage } from "./storage";
import WebSocket from "ws";
import { generateAIResponse } from "./aiAgent";

interface WhatsAppSession {
  socket: WASocket | null;
  userId: string;
  connectionId: string;
  phoneNumber?: string;
  store?: ReturnType<typeof makeInMemoryStore>;
}

interface AdminWhatsAppSession {
  socket: WASocket | null;
  adminId: string;
  phoneNumber?: string;
  store?: ReturnType<typeof makeInMemoryStore>;
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

function parseRemoteJid(remoteJid: string, store?: ReturnType<typeof makeInMemoryStore>) {
  const decoded = jidDecode(remoteJid);
  const rawUser = decoded?.user || remoteJid.split("@")[0] || "";
  let jidSuffix = decoded?.server || remoteJid.split("@")[1]?.split(":")[0] || DEFAULT_JID_SUFFIX;

  // FIX LID 2025 CORRIGIDO: Se for @lid, buscar phoneNumber (NÃO jid) via store.contacts
  let contactNumber = cleanContactNumber(rawUser);
  
  if (remoteJid.includes("@lid") && store) {
    const contact = store.contacts[remoteJid];
    if (contact?.phoneNumber) {
      // âœ… CORREÃÃO CRÃTICA: usar contact.phoneNumber (campo correto do Baileys)
      const realNumber = cleanContactNumber(contact.phoneNumber.split("@")[0]);
      if (realNumber) {
        console.log([LID FIX] Mapped  â†'  ());
        contactNumber = realNumber;
        // âœ… FORÃAR uso do nÃºmero real (nÃ£o continuar com @lid)
        jidSuffix = "s.whatsapp.net";
      }
    } else {
      console.log([LID WARNING] No phoneNumber mapping found for );
    }
  }

  const normalizedJid = contactNumber
    ? jidNormalizedUser(${contactNumber}@)
    : jidNormalizedUser(remoteJid);

  return { contactNumber, jidSuffix, normalizedJid };
}
