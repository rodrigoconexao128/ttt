/**
 * 📲 Serviço para envio de mensagens WhatsApp do sistema
 * Usado para notificações automatizadas (delivery, agendamentos, etc.)
 * 
 * ⚠️ IMPORTANTE: Agora usa o sistema centralizado anti-ban!
 */

import { storage } from './storage';
import { centralizedMessageSender, MessageOrigin } from './centralizedMessageSender';

// Map de sessões ativas por userId
const activeSessions = new Map<string, any>();

/**
 * Registra uma sessão WhatsApp ativa para um usuário
 */
export function registerWhatsAppSession(userId: string, socket: any) {
  activeSessions.set(userId, socket);
  console.log(`📲 [WhatsApp Sender] Sessão registrada para userId: ${userId}`);
}

/**
 * Remove a sessão WhatsApp de um usuário
 */
export function unregisterWhatsAppSession(userId: string) {
  activeSessions.delete(userId);
  console.log(`📲 [WhatsApp Sender] Sessão removida para userId: ${userId}`);
}

/**
 * Verifica se um usuário tem sessão WhatsApp ativa
 */
export function hasActiveWhatsAppSession(userId: string): boolean {
  return activeSessions.has(userId);
}

/**
 * Envia uma mensagem WhatsApp para um número específico em nome de um usuário
 * ⚠️ USA SISTEMA ANTI-BAN CENTRALIZADO
 * @param userId ID do usuário dono da sessão
 * @param phoneNumber Número de telefone (apenas números, com código do país)
 * @param message Texto da mensagem
 * @param origin Origem da mensagem (para logs e estatísticas)
 */
export async function sendWhatsAppMessageFromUser(
  userId: string, 
  phoneNumber: string, 
  message: string,
  origin: MessageOrigin = 'whatsapp_sender'
): Promise<boolean> {
  try {
    const socket = activeSessions.get(userId);
    
    if (!socket) {
      console.log(`⚠️ [WhatsApp Sender] Nenhuma sessão ativa para userId: ${userId}`);
      return false;
    }
    
    // Formatar JID
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;
    
    // 🛡️ USAR SISTEMA ANTI-BAN CENTRALIZADO
    const result = await centralizedMessageSender.sendText(
      userId,
      jid,
      message,
      socket,
      origin
    );
    
    if (result.success) {
      console.log(`✅ [WhatsApp Sender] Mensagem enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0)/1000)}s)`);
    } else {
      console.error(`❌ [WhatsApp Sender] Falha no envio: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar mensagem:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com mídia
 * ⚠️ USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppMediaFromUser(
  userId: string, 
  phoneNumber: string, 
  mediaUrl: string,
  caption?: string,
  mimeType?: string,
  origin: MessageOrigin = 'whatsapp_sender'
): Promise<boolean> {
  try {
    const socket = activeSessions.get(userId);
    
    if (!socket) {
      console.log(`⚠️ [WhatsApp Sender] Nenhuma sessão ativa para userId: ${userId}`);
      return false;
    }
    
    // Formatar JID
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;
    
    // Determinar tipo de mídia e usar sistema anti-ban
    const isImage = mimeType?.startsWith('image/') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isVideo = mimeType?.startsWith('video/') || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
    const isAudio = mimeType?.startsWith('audio/') || mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i);
    
    let result;
    
    // 🛡️ USAR SISTEMA ANTI-BAN CENTRALIZADO PARA TODAS AS MÍDIAS
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
      // Documento genérico
      result = await centralizedMessageSender.sendDocument(
        userId,
        jid,
        mediaUrl,
        mediaUrl.split('/').pop() || 'arquivo',
        mimeType || 'application/octet-stream',
        socket,
        origin
      );
    }
    
    if (result.success) {
      console.log(`✅ [WhatsApp Sender] Mídia enviada para ${cleanNumber} via sistema anti-ban (aguardou ${Math.ceil((result.waitedMs || 0)/1000)}s)`);
    } else {
      console.error(`❌ [WhatsApp Sender] Falha no envio de mídia: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar mídia:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com botões interativos
 * ⚠️ USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppButtonsFromUser(
  userId: string,
  phoneNumber: string,
  payload: {
    body: string;
    buttons: Array<{
      type: 'reply';
      reply: { id: string; title: string };
    }>;
    header?: { type: 'text'; text: string };
    footer?: { text: string };
  },
  origin: MessageOrigin = 'chatbot_flow'
): Promise<boolean> {
  try {
    const socket = activeSessions.get(userId);
    
    if (!socket) {
      console.log(`⚠️ [WhatsApp Sender] Nenhuma sessão ativa para userId: ${userId}`);
      return false;
    }
    
    // Formatar JID
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;
    
    // 🛡️ USAR SISTEMA ANTI-BAN CENTRALIZADO
    const result = await centralizedMessageSender.sendButtons(
      userId,
      jid,
      payload,
      socket,
      origin
    );
    
    if (result.success) {
      console.log(`✅ [WhatsApp Sender] Botões enviados para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`❌ [WhatsApp Sender] Falha no envio de botões: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar botões:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com lista interativa
 * ⚠️ USA SISTEMA ANTI-BAN CENTRALIZADO
 */
export async function sendWhatsAppListFromUser(
  userId: string,
  phoneNumber: string,
  payload: {
    body: string;
    buttonText: string;
    sections: Array<{
      title: string;
      rows: Array<{
        id: string;
        title: string;
        description?: string;
      }>;
    }>;
    header?: { type: 'text'; text: string };
    footer?: { text: string };
  },
  origin: MessageOrigin = 'chatbot_flow'
): Promise<boolean> {
  try {
    const socket = activeSessions.get(userId);
    
    if (!socket) {
      console.log(`⚠️ [WhatsApp Sender] Nenhuma sessão ativa para userId: ${userId}`);
      return false;
    }
    
    // Formatar JID
    const cleanNumber = phoneNumber.replace(/\D/g, '');
    const jid = `${cleanNumber}@s.whatsapp.net`;
    
    // 🛡️ USAR SISTEMA ANTI-BAN CENTRALIZADO
    const result = await centralizedMessageSender.sendList(
      userId,
      jid,
      payload,
      socket,
      origin
    );
    
    if (result.success) {
      console.log(`✅ [WhatsApp Sender] Lista enviada para ${cleanNumber} via sistema anti-ban`);
    } else {
      console.error(`❌ [WhatsApp Sender] Falha no envio de lista: ${result.error}`);
    }
    
    return result.success;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar lista:`, error);
    return false;
  }
}

