/**
 * 📲 Serviço para envio de mensagens WhatsApp do sistema
 * Usado para notificações automatizadas (delivery, agendamentos, etc.)
 */

import { storage } from './storage';

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
 * @param userId ID do usuário dono da sessão
 * @param phoneNumber Número de telefone (apenas números, com código do país)
 * @param message Texto da mensagem
 */
export async function sendWhatsAppMessageFromUser(
  userId: string, 
  phoneNumber: string, 
  message: string
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
    
    // Enviar mensagem
    await socket.sendMessage(jid, { text: message });
    console.log(`✅ [WhatsApp Sender] Mensagem enviada para ${cleanNumber} (userId: ${userId})`);
    
    return true;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar mensagem:`, error);
    return false;
  }
}

/**
 * Envia uma mensagem WhatsApp com mídia
 */
export async function sendWhatsAppMediaFromUser(
  userId: string, 
  phoneNumber: string, 
  mediaUrl: string,
  caption?: string,
  mimeType?: string
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
    
    // Determinar tipo de mídia
    const isImage = mimeType?.startsWith('image/') || mediaUrl.match(/\.(jpg|jpeg|png|gif|webp)$/i);
    const isVideo = mimeType?.startsWith('video/') || mediaUrl.match(/\.(mp4|mov|avi|webm)$/i);
    const isAudio = mimeType?.startsWith('audio/') || mediaUrl.match(/\.(mp3|ogg|wav|m4a)$/i);
    
    if (isImage) {
      await socket.sendMessage(jid, { image: { url: mediaUrl }, caption });
    } else if (isVideo) {
      await socket.sendMessage(jid, { video: { url: mediaUrl }, caption });
    } else if (isAudio) {
      await socket.sendMessage(jid, { audio: { url: mediaUrl }, mimetype: mimeType || 'audio/mp4' });
    } else {
      // Documento genérico
      await socket.sendMessage(jid, { 
        document: { url: mediaUrl }, 
        mimetype: mimeType || 'application/octet-stream',
        fileName: mediaUrl.split('/').pop() || 'arquivo'
      });
    }
    
    console.log(`✅ [WhatsApp Sender] Mídia enviada para ${cleanNumber} (userId: ${userId})`);
    return true;
  } catch (error) {
    console.error(`❌ [WhatsApp Sender] Erro ao enviar mídia:`, error);
    return false;
  }
}
