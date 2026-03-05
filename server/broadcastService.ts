import { and, desc, eq } from "drizzle-orm";

import { broadcastCampaigns, whatsappConnections } from "../shared/schema";
import { db } from "./db";
import { storage } from "./storage";
import { getSession } from "./whatsapp";

const BROADCAST_MIN_DELAY_MS = 60_000;
const BROADCAST_MAX_DELAY_MS = 90_000;
const BROADCAST_BATCH_SIZE = 10;
const BROADCAST_BATCH_PAUSE_MS = 600_000;
const SOCKET_WAIT_TIMEOUT_MS = 300_000;
const SOCKET_POLL_INTERVAL_MS = 30_000;

type CampaignContact = {
  id?: string;
  phone: string;
  name?: string;
};

type CampaignResult = {
  phone: string;
  name: string;
  status: "sent" | "failed";
  error?: string;
  sentAt?: string;
};

type MediaType = "image" | "video" | "audio" | "document";

type CreateCampaignPayload = {
  contacts: CampaignContact[];
  messageTemplate: string;
  useAi?: boolean;
  mediaUrl?: string;
  mediaType?: MediaType | string;
  connectionId?: string;
  name?: string;
  delayMinMs?: number;
  delayMaxMs?: number;
  scheduledAt?: string | Date | null;
};

function clampDelayMin(delayMinMs?: number) {
  return Math.max(BROADCAST_MIN_DELAY_MS, Number(delayMinMs || 0));
}

function clampDelayMax(delayMaxMs?: number, delayMinMs?: number) {
  const min = clampDelayMin(delayMinMs);
  return Math.max(BROADCAST_MAX_DELAY_MS, Number(delayMaxMs || 0), min);
}

function applyTemplate(template: string, name?: string) {
  const safeName = String(name || "Cliente").trim() || "Cliente";
  return template.replace(/\[nome\]/gi, safeName);
}

function formatPhoneToJid(phone: string) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (!cleanPhone) {
    throw new Error("Numero de telefone invalido");
  }

  let formattedPhone = cleanPhone;
  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    formattedPhone = `55${cleanPhone}`;
  }

  return `${formattedPhone}@s.whatsapp.net`;
}

function normalizePhone(phone: string) {
  const cleanPhone = String(phone || "").replace(/\D/g, "");
  if (!cleanPhone) {
    throw new Error("Numero de telefone invalido");
  }

  if (cleanPhone.length === 10 || cleanPhone.length === 11) {
    return `55${cleanPhone}`;
  }

  return cleanPhone;
}

function getJidSuffix(jid: string) {
  return jid.split("@")[1]?.split(":")[0] || "s.whatsapp.net";
}

function getMediaFallbackText(mediaType?: string | null) {
  switch (mediaType) {
    case "image":
      return "[Imagem enviada]";
    case "video":
      return "[Video enviado]";
    case "audio":
      return "[Audio enviado]";
    case "document":
      return "[Documento enviado]";
    default:
      return "[Mensagem enviada]";
  }
}

function getPersistedMessageText(messageText: string, mediaType?: string | null) {
  const trimmed = messageText.trim();
  if (trimmed) {
    return trimmed;
  }

  return getMediaFallbackText(mediaType);
}

function getConversationPreviewText(messageText: string, mediaType?: string | null) {
  const trimmed = messageText.trim();
  if (trimmed) {
    return trimmed;
  }

  return mediaType ? getMediaFallbackText(mediaType).replace("enviado", "").trim() : "[Mensagem]";
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function sleepRange(minMs: number, maxMs: number) {
  const delay = minMs >= maxMs ? minMs : Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
  await sleep(delay);
}

function parseDataUrl(dataUrl: string) {
  const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
  if (!match) {
    return null;
  }

  return {
    mimeType: match[1],
    buffer: Buffer.from(match[2], "base64"),
  };
}

function guessMimeTypeFromUrl(url: string, mediaType: MediaType) {
  const lowerUrl = url.toLowerCase();

  if (mediaType === "image") {
    if (lowerUrl.endsWith(".png")) return "image/png";
    if (lowerUrl.endsWith(".webp")) return "image/webp";
    return "image/jpeg";
  }

  if (mediaType === "video") {
    if (lowerUrl.endsWith(".webm")) return "video/webm";
    if (lowerUrl.endsWith(".mov")) return "video/quicktime";
    return "video/mp4";
  }

  if (mediaType === "audio") {
    if (lowerUrl.endsWith(".mp3")) return "audio/mpeg";
    if (lowerUrl.endsWith(".wav")) return "audio/wav";
    if (lowerUrl.endsWith(".m4a")) return "audio/mp4";
    return "audio/ogg; codecs=opus";
  }

  if (lowerUrl.endsWith(".pdf")) return "application/pdf";
  if (lowerUrl.endsWith(".doc")) return "application/msword";
  if (lowerUrl.endsWith(".docx")) {
    return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  }
  if (lowerUrl.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }

  return "application/octet-stream";
}

async function resolveMediaSource(mediaUrl: string, mediaType: MediaType) {
  const parsed = parseDataUrl(mediaUrl);
  if (parsed) {
    return parsed;
  }

  if (/^https?:\/\//i.test(mediaUrl)) {
    const response = await fetch(mediaUrl);
    if (!response.ok) {
      throw new Error(`Falha ao baixar midia: HTTP ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return {
      mimeType: response.headers.get("content-type") || guessMimeTypeFromUrl(mediaUrl, mediaType),
      buffer: Buffer.from(arrayBuffer),
    };
  }

  return {
    mimeType: guessMimeTypeFromUrl(mediaUrl, mediaType),
    buffer: Buffer.from(mediaUrl, "base64"),
  };
}

async function buildMessageContent(
  messageText: string,
  mediaUrl?: string | null,
  mediaType?: string | null,
) {
  if (!mediaUrl || !mediaType) {
    return { text: messageText };
  }

  const normalizedMediaType = mediaType as MediaType;
  const { buffer, mimeType } = await resolveMediaSource(mediaUrl, normalizedMediaType);
  const caption = messageText.trim() || undefined;

  switch (normalizedMediaType) {
    case "image":
      return {
        image: buffer,
        mimetype: mimeType || "image/jpeg",
        caption,
      };
    case "video":
      return {
        video: buffer,
        mimetype: mimeType || "video/mp4",
        caption,
      };
    case "audio":
      return {
        audio: buffer,
        mimetype: mimeType || "audio/ogg; codecs=opus",
        ptt: false,
      };
    case "document":
      return {
        document: buffer,
        mimetype: mimeType || "application/octet-stream",
        fileName: `broadcast-${Date.now()}`,
        caption,
      };
    default:
      throw new Error(`Tipo de midia nao suportado: ${mediaType}`);
  }
}

function applyAiVariation(message: string, index: number) {
  const synonyms: Record<string, string[]> = {
    "ola": ["oi", "e ai", "hey"],
    "oi": ["ola", "e ai", "hey"],
    "tudo bem": ["como vai", "tudo certo", "tudo ok"],
    "obrigado": ["valeu", "agradeco", "muito obrigado"],
    "obrigada": ["valeu", "agradeco", "muito obrigada"],
    "gostaria": ["queria", "preciso", "adoraria"],
    "pode": ["consegue", "poderia", "daria para"],
    "produto": ["item", "artigo", "oferta"],
    "servico": ["atendimento", "solucao", "suporte"],
    "desconto": ["promocao", "oferta especial", "vantagem"],
  };

  const prefixes = ["", "", "", "Oi, ", "Hey, "];
  const suffixes = ["", "", ".", "!", " Abraco!"];

  let varied = message;
  let replacements = 0;
  const maxReplacements = Math.floor(Math.random() * 2) + 1;

  for (const [source, targets] of Object.entries(synonyms)) {
    if (replacements >= maxReplacements) {
      break;
    }

    const regex = new RegExp(`\\b${source}\\b`, "i");
    if (regex.test(varied)) {
      const replacement = targets[Math.floor(Math.random() * targets.length)];
      varied = varied.replace(regex, replacement);
      replacements += 1;
    }
  }

  const prefix = prefixes[index % prefixes.length];
  const suffix = suffixes[(index + 1) % suffixes.length];

  if (prefix && !varied.startsWith(prefix)) {
    varied = `${prefix}${varied}`;
  }

  if (suffix && !varied.endsWith(suffix)) {
    varied = varied.replace(/[.!?]+$/g, "");
    varied = `${varied}${suffix}`;
  }

  return varied;
}

async function resolveActiveConnection(userId: string, preferredConnectionId?: string | null) {
  if (preferredConnectionId) {
    const [specificConnection] = await db
      .select()
      .from(whatsappConnections)
      .where(
        and(
          eq(whatsappConnections.id, preferredConnectionId),
          eq(whatsappConnections.userId, userId),
          eq(whatsappConnections.isConnected, true),
        ),
      )
      .limit(1);

    if (specificConnection) {
      return specificConnection;
    }
  }

  const [primaryConnected] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true),
        eq(whatsappConnections.isPrimary, true),
      ),
    )
    .orderBy(desc(whatsappConnections.updatedAt))
    .limit(1);

  if (primaryConnected) {
    return primaryConnected;
  }

  const [fallbackConnected] = await db
    .select()
    .from(whatsappConnections)
    .where(
      and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true),
      ),
    )
    .orderBy(desc(whatsappConnections.updatedAt))
    .limit(1);

  return fallbackConnected || null;
}

async function resolveSocket(userId: string, preferredConnectionId?: string | null) {
  const connection = await resolveActiveConnection(userId, preferredConnectionId);
  if (!connection) {
    return { connectionId: null, socket: null };
  }

  const session = getSession(connection.id);
  return {
    connectionId: connection.id,
    socket: session?.socket || null,
  };
}

async function waitForSocket(userId: string, preferredConnectionId?: string | null) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SOCKET_WAIT_TIMEOUT_MS) {
    const resolved = await resolveSocket(userId, preferredConnectionId);
    if (resolved.socket) {
      return resolved;
    }

    await sleep(SOCKET_POLL_INTERVAL_MS);
  }

  return { connectionId: null, socket: null };
}

async function persistBroadcastHistory(params: {
  campaignConnectionId?: string | null;
  contact: CampaignContact;
  jid: string;
  messageId: string;
  messageText: string;
  sentAt: Date;
  mediaUrl?: string | null;
  mediaType?: string | null;
}) {
  if (!params.campaignConnectionId) {
    throw new Error("ConnectionId indisponivel para persistir historico do broadcast");
  }

  const normalizedPhone = normalizePhone(params.contact.phone);
  const previewText = getConversationPreviewText(params.messageText, params.mediaType);
  const persistedText = getPersistedMessageText(params.messageText, params.mediaType);
  const jidSuffix = getJidSuffix(params.jid);

  let conversation = await storage.getActiveConversationByContactNumber(
    params.campaignConnectionId,
    normalizedPhone,
  );

  if (!conversation) {
    conversation = await storage.createConversation({
      connectionId: params.campaignConnectionId,
      contactNumber: normalizedPhone,
      remoteJid: params.jid,
      jidSuffix,
      contactName: params.contact.name || normalizedPhone,
      contactAvatar: null,
      lastMessageText: previewText,
      lastMessageTime: params.sentAt,
      lastMessageFromMe: true,
      unreadCount: 0,
      hasReplied: true,
    });
  }

  const existingMessage = await storage.getMessageByMessageId(params.messageId);
  if (!existingMessage) {
    await storage.createMessage({
      conversationId: conversation.id,
      messageId: params.messageId,
      fromMe: true,
      text: persistedText,
      timestamp: params.sentAt,
      status: "sent",
      isFromAgent: false,
      mediaType: params.mediaType || null,
      mediaUrl: params.mediaUrl || null,
      mediaCaption: params.mediaType ? params.messageText.trim() || null : null,
    });
  }

  await storage.updateConversation(conversation.id, {
    remoteJid: params.jid,
    jidSuffix,
    contactName: params.contact.name || conversation.contactName || normalizedPhone,
    lastMessageText: previewText,
    lastMessageTime: params.sentAt,
    lastMessageFromMe: true,
    unreadCount: 0,
    hasReplied: true,
  });
}

async function isCampaignCancelled(campaignId: string) {
  const [campaign] = await db
    .select({ status: broadcastCampaigns.status })
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.id, campaignId))
    .limit(1);

  return campaign?.status === "cancelled";
}

async function persistProgress(
  campaignId: string,
  values: Record<string, unknown>,
) {
  await db
    .update(broadcastCampaigns)
    .set(({
      ...values,
      updatedAt: new Date(),
    } as unknown) as any)
    .where(eq(broadcastCampaigns.id, campaignId));
}

export async function createAndRunCampaign(userId: string, payload: CreateCampaignPayload) {
  const normalizedDelayMinMs = clampDelayMin(payload.delayMinMs);
  const normalizedDelayMaxMs = clampDelayMax(payload.delayMaxMs, payload.delayMinMs);

  const [insertedCampaign] = await db
    .insert(broadcastCampaigns)
    .values(({
      userId,
      connectionId: payload.connectionId || null,
      name: payload.name || `Campanha ${new Date().toLocaleString("pt-BR")}`,
      status: "pending",
      messageTemplate: payload.messageTemplate,
      mediaUrl: payload.mediaUrl || null,
      mediaType: (payload.mediaType as string) || null,
      totalContacts: payload.contacts.length,
      sentCount: 0,
      failedCount: 0,
      useAi: Boolean(payload.useAi),
      delayMinMs: normalizedDelayMinMs,
      delayMaxMs: normalizedDelayMaxMs,
      batchSize: BROADCAST_BATCH_SIZE,
      batchPauseMs: BROADCAST_BATCH_PAUSE_MS,
      contactsJson: payload.contacts.map((contact) => ({
        id: contact.id || `${Date.now()}-${Math.random()}`,
        phone: contact.phone,
        name: contact.name || "Cliente",
      })),
      resultsJson: [],
      scheduledAt: payload.scheduledAt ? new Date(payload.scheduledAt) : null,
    } as unknown) as any)
    .returning({ id: broadcastCampaigns.id });

  const campaignId = insertedCampaign.id;

  void executeCampaign(campaignId).catch(async (error) => {
    await persistProgress(campaignId, {
      status: "error",
      errorMessage: error instanceof Error ? error.message : String(error),
      completedAt: new Date(),
    }).catch(() => undefined);
  });

  return { campaignId };
}

async function executeCampaign(campaignId: string) {
  const [campaign] = await db
    .select()
    .from(broadcastCampaigns)
    .where(eq(broadcastCampaigns.id, campaignId))
    .limit(1);

  if (!campaign) {
    return;
  }

  if (campaign.status === "cancelled") {
    return;
  }

  const contacts = Array.isArray(campaign.contactsJson) ? [...campaign.contactsJson] : [];
  const results: CampaignResult[] = [];
  let sentCount = 0;
  let failedCount = 0;

  await persistProgress(campaignId, {
    status: "running",
    startedAt: campaign.startedAt || new Date(),
  });

  for (let index = 0; index < contacts.length; index += 1) {
    if (await isCampaignCancelled(campaignId)) {
      await persistProgress(campaignId, {
        completedAt: new Date(),
      });
      return;
    }

    const contact = contacts[index];
    let resolved = await resolveSocket(campaign.userId, campaign.connectionId);

    if (!resolved.socket) {
      resolved = await waitForSocket(campaign.userId, campaign.connectionId);
    }

    if (resolved.connectionId && resolved.connectionId !== campaign.connectionId) {
      await persistProgress(campaignId, {
        connectionId: resolved.connectionId,
      });
      campaign.connectionId = resolved.connectionId;
    }

    if (!resolved.socket) {
      failedCount += 1;
      results.push({
        phone: contact.phone,
        name: contact.name || "Cliente",
        status: "failed",
        error: "Socket indisponivel apos aguardar reconexao por 5 minutos",
      });

      await persistProgress(campaignId, {
        failedCount,
        resultsJson: results,
      });
    } else {
      try {
        const jid = formatPhoneToJid(contact.phone);
        let messageText = applyTemplate(campaign.messageTemplate, contact.name);

        if (campaign.useAi) {
          messageText = applyAiVariation(messageText, index);
        }

        const messageContent = await buildMessageContent(messageText, campaign.mediaUrl, campaign.mediaType);
        const sentMessage = await resolved.socket.sendMessage(jid, messageContent);
        const sentAt = new Date();
        const messageId = sentMessage?.key?.id || `broadcast_${campaignId}_${index}_${sentAt.getTime()}`;

        await persistBroadcastHistory({
          campaignConnectionId: resolved.connectionId || campaign.connectionId,
          contact,
          jid,
          messageId,
          messageText,
          sentAt,
          mediaUrl: campaign.mediaUrl,
          mediaType: campaign.mediaType,
        }).catch((error) => {
          console.warn("[BROADCAST] Falha ao persistir historico da mensagem enviada:", error);
        });

        sentCount += 1;
        results.push({
          phone: contact.phone,
          name: contact.name || "Cliente",
          status: "sent",
          sentAt: sentAt.toISOString(),
        });

        await persistProgress(campaignId, {
          connectionId: resolved.connectionId || campaign.connectionId,
          sentCount,
          failedCount,
          resultsJson: results,
        });
      } catch (error) {
        failedCount += 1;
        results.push({
          phone: contact.phone,
          name: contact.name || "Cliente",
          status: "failed",
          error: error instanceof Error ? error.message : "Erro desconhecido",
        });

        await persistProgress(campaignId, {
          connectionId: resolved.connectionId || campaign.connectionId,
          sentCount,
          failedCount,
          resultsJson: results,
        });
      }
    }

    const isLastContact = index === contacts.length - 1;
    if (isLastContact) {
      continue;
    }

    const processedCount = index + 1;
    if (processedCount % BROADCAST_BATCH_SIZE === 0) {
      await sleep(BROADCAST_BATCH_PAUSE_MS);
      continue;
    }

    await sleepRange(campaign.delayMinMs, campaign.delayMaxMs);
  }

  if (await isCampaignCancelled(campaignId)) {
    await persistProgress(campaignId, {
      completedAt: new Date(),
    });
    return;
  }

  await persistProgress(campaignId, {
    status: "completed",
    sentCount,
    failedCount,
    resultsJson: results,
    completedAt: new Date(),
    errorMessage: null,
  });
}

export async function getCampaignStatus(campaignId: string, userId: string) {
  const [campaign] = await db
    .select()
    .from(broadcastCampaigns)
    .where(and(eq(broadcastCampaigns.id, campaignId), eq(broadcastCampaigns.userId, userId)))
    .limit(1);

  return campaign || null;
}

export async function cancelCampaign(campaignId: string, userId: string) {
  const cancelled = await db
    .update(broadcastCampaigns)
    .set(({
      status: "cancelled",
      completedAt: new Date(),
      updatedAt: new Date(),
    } as unknown) as any)
    .where(and(eq(broadcastCampaigns.id, campaignId), eq(broadcastCampaigns.userId, userId)))
    .returning({ id: broadcastCampaigns.id });

  return cancelled.length > 0;
}

export default {
  createAndRunCampaign,
  getCampaignStatus,
  cancelCampaign,
};
