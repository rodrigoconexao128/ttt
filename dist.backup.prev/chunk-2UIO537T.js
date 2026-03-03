import {
  centralizedMessageSender
} from "./chunk-ONE52B4D.js";

// server/whatsappSender.ts
var activeSessions = /* @__PURE__ */ new Map();
function registerWhatsAppSession(userId, socket) {
  activeSessions.set(userId, socket);
  console.log(`\u{1F4F2} [WhatsApp Sender] Sess\xE3o registrada para userId: ${userId}`);
}
function unregisterWhatsAppSession(userId) {
  activeSessions.delete(userId);
  console.log(`\u{1F4F2} [WhatsApp Sender] Sess\xE3o removida para userId: ${userId}`);
}
function hasActiveWhatsAppSession(userId) {
  return activeSessions.has(userId);
}
async function sendWhatsAppMessageFromUser(userId, phoneNumber, message, origin = "whatsapp_sender") {
  try {
    const socket = activeSessions.get(userId);
    if (!socket) {
      console.log(`\u26A0\uFE0F [WhatsApp Sender] Nenhuma sess\xE3o ativa para userId: ${userId}`);
      return false;
    }
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;
    const result = await centralizedMessageSender.sendText(
      userId,
      jid,
      message,
      socket,
      origin
    );
    if (result.success) {
      console.log(`\u2705 [WhatsApp Sender] Mensagem enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0) / 1e3)}s)`);
    } else {
      console.error(`\u274C [WhatsApp Sender] Falha no envio: ${result.error}`);
    }
    return result.success;
  } catch (error) {
    console.error(`\u274C [WhatsApp Sender] Erro ao enviar mensagem:`, error);
    return false;
  }
}
async function sendWhatsAppMediaFromUser(userId, phoneNumber, mediaUrl, caption, mimeType, origin = "whatsapp_sender") {
  try {
    const socket = activeSessions.get(userId);
    if (!socket) {
      console.log(`\u26A0\uFE0F [WhatsApp Sender] Nenhuma sess\xE3o ativa para userId: ${userId}`);
      return false;
    }
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;
    const isImage = mimeType?.startsWith("image/") || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isVideo = mimeType?.startsWith("video/") || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
    const isAudio = mimeType?.startsWith("audio/") || mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i);
    let result;
    if (isImage) {
      result = await centralizedMessageSender.sendImage(
        userId,
        jid,
        mediaUrl,
        caption,
        socket,
        origin
      );
    } else if (isVideo) {
      result = await centralizedMessageSender.sendVideo(
        userId,
        jid,
        mediaUrl,
        caption,
        socket,
        origin
      );
    } else if (isAudio) {
      result = await centralizedMessageSender.sendAudio(
        userId,
        jid,
        mediaUrl,
        false,
        socket,
        origin
      );
    } else {
      result = await centralizedMessageSender.sendDocument(
        userId,
        jid,
        mediaUrl,
        mediaUrl.split("/").pop() || "arquivo",
        mimeType || "application/octet-stream",
        socket,
        origin
      );
    }
    if (result.success) {
      console.log(`\u2705 [WhatsApp Sender] M\xEDdia enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0) / 1e3)}s)`);
    } else {
      console.error(`\u274C [WhatsApp Sender] Falha no envio de m\xEDdia: ${result.error}`);
    }
    return result.success;
  } catch (error) {
    console.error(`\u274C [WhatsApp Sender] Erro ao enviar m\xEDdia:`, error);
    return false;
  }
}
async function sendWhatsAppButtonsFromUser(userId, phoneNumber, payload, origin = "chatbot_flow") {
  try {
    const socket = activeSessions.get(userId);
    if (!socket) {
      console.log(`\u26A0\uFE0F [WhatsApp Sender] Nenhuma sess\xE3o ativa para userId: ${userId}`);
      return false;
    }
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;
    const result = await centralizedMessageSender.sendButtons(
      userId,
      jid,
      payload,
      socket,
      origin
    );
    if (result.success) {
      console.log(`\u2705 [WhatsApp Sender] Bot\xF5es enviados para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`\u274C [WhatsApp Sender] Falha no envio de bot\xF5es: ${result.error}`);
    }
    return result.success;
  } catch (error) {
    console.error(`\u274C [WhatsApp Sender] Erro ao enviar bot\xF5es:`, error);
    return false;
  }
}
async function sendWhatsAppListFromUser(userId, phoneNumber, payload, origin = "chatbot_flow") {
  try {
    const socket = activeSessions.get(userId);
    if (!socket) {
      console.log(`\u26A0\uFE0F [WhatsApp Sender] Nenhuma sess\xE3o ativa para userId: ${userId}`);
      return false;
    }
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const jid = `${cleanNumber}@s.whatsapp.net`;
    const result = await centralizedMessageSender.sendList(
      userId,
      jid,
      payload,
      socket,
      origin
    );
    if (result.success) {
      console.log(`\u2705 [WhatsApp Sender] Lista enviada para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`\u274C [WhatsApp Sender] Falha no envio de lista: ${result.error}`);
    }
    return result.success;
  } catch (error) {
    console.error(`\u274C [WhatsApp Sender] Erro ao enviar lista:`, error);
    return false;
  }
}

export {
  registerWhatsAppSession,
  unregisterWhatsAppSession,
  hasActiveWhatsAppSession,
  sendWhatsAppMessageFromUser,
  sendWhatsAppMediaFromUser,
  sendWhatsAppButtonsFromUser,
  sendWhatsAppListFromUser
};
