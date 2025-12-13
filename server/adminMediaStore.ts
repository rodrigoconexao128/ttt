/**
 * 📁 STORE DE MÍDIAS DO ADMIN AGENT
 * Gerencia as mídias disponíveis para o agente admin usar nas respostas
 * IMPORTANTE: As mídias agora são persistidas no banco de dados Supabase
 */

import { storage } from "./storage";

export interface AdminMedia {
  id: string;
  adminId: string;
  name: string;
  mediaType: "audio" | "image" | "video" | "document";
  storageUrl: string;
  fileName?: string;
  fileSize?: number;
  mimeType?: string;
  durationSeconds?: number;
  description: string;
  whenToUse?: string;
  caption?: string;
  transcription?: string;
  isActive: boolean;
  sendAlone: boolean;
  displayOrder: number;
  createdAt: string;
}

// Cache em memória para performance (recarregado do banco)
const adminMediaCache: Map<string, AdminMedia> = new Map();
const lastCacheUpdate: Map<string, number> = new Map();
const CACHE_TTL = 60000; // 1 minuto

/**
 * Recarrega o cache do banco de dados
 */
async function reloadCache(adminId: string): Promise<void> {
  const now = Date.now();
  const lastUpdate = lastCacheUpdate.get(adminId) || 0;
  
  // Se cache ainda é válido, não recarregar
  if (now - lastUpdate < CACHE_TTL && adminMediaCache.size > 0) {
    return;
  }

  try {
    const mediaList = await storage.getActiveAdminMedia(adminId);
    
    for (const media of mediaList) {
      adminMediaCache.set(media.id!, {
        id: media.id!,
        adminId: media.adminId,
        name: media.name,
        mediaType: media.mediaType as "audio" | "image" | "video" | "document",
        storageUrl: media.storageUrl,
        fileName: media.fileName || undefined,
        fileSize: media.fileSize || undefined,
        mimeType: media.mimeType || undefined,
        durationSeconds: media.durationSeconds || undefined,
        description: media.description,
        whenToUse: media.whenToUse || undefined,
        caption: media.caption || undefined,
        transcription: media.transcription || undefined,
        isActive: media.isActive,
        sendAlone: media.sendAlone,
        displayOrder: media.displayOrder,
        createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
      });
    }
    
    lastCacheUpdate.set(adminId, now);
    console.log(`📁 [AdminMediaStore] Cache recarregado: ${mediaList.length} mídias`);
  } catch (error) {
    console.error("📁 [AdminMediaStore] Erro ao recarregar cache:", error);
  }
}

/**
 * Obtém todas as mídias ativas do admin (com cache)
 */
export async function getAdminMediaList(adminId: string): Promise<AdminMedia[]> {
  await reloadCache(adminId);
  return Array.from(adminMediaCache.values()).filter(m => m.isActive);
}

/**
 * Obtém uma mídia por nome (com cache)
 */
export async function getAdminMediaByName(adminId: string, name: string): Promise<AdminMedia | undefined> {
  await reloadCache(adminId);
  
  const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
  const values = Array.from(adminMediaCache.values());
  
  for (const media of values) {
    if (media.name.toUpperCase() === normalizedName && media.isActive) {
      return media;
    }
  }
  return undefined;
}

/**
 * Obtém mídias que correspondem a um padrão de nome
 */
export async function getAdminMediasByPattern(adminId: string, pattern: string): Promise<AdminMedia[]> {
  await reloadCache(adminId);
  
  const normalizedPattern = pattern.toUpperCase().replace(/\s+/g, '_');
  const results: AdminMedia[] = [];
  const values = Array.from(adminMediaCache.values());
  
  for (const media of values) {
    if (media.adminId === adminId && media.isActive && media.name.toUpperCase().includes(normalizedPattern)) {
      results.push(media);
    }
  }
  return results;
}

/**
 * Adiciona uma mídia ao store e banco de dados
 */
export async function addAdminMedia(media: Omit<AdminMedia, 'id' | 'createdAt'>): Promise<AdminMedia> {
  const saved = await storage.createAdminMedia(media);
  
  const adminMedia: AdminMedia = {
    id: saved.id!,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || undefined,
    fileSize: saved.fileSize || undefined,
    mimeType: saved.mimeType || undefined,
    durationSeconds: saved.durationSeconds || undefined,
    description: saved.description,
    whenToUse: saved.whenToUse || undefined,
    caption: saved.caption || undefined,
    transcription: saved.transcription || undefined,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(saved.id!, adminMedia);
  lastCacheUpdate.set(media.adminId, Date.now());
  console.log(`📁 [AdminMediaStore] Mídia adicionada ao banco: ${media.name} (${media.mediaType})`);
  return adminMedia;
}

/**
 * Atualiza uma mídia existente no banco e cache
 */
export async function updateAdminMedia(id: string, updates: Partial<AdminMedia>): Promise<AdminMedia | null> {
  const saved = await storage.updateAdminMedia(id, updates);
  
  if (!saved) return null;
  
  const adminMedia: AdminMedia = {
    id: saved.id!,
    adminId: saved.adminId,
    name: saved.name,
    mediaType: saved.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: saved.storageUrl,
    fileName: saved.fileName || undefined,
    fileSize: saved.fileSize || undefined,
    mimeType: saved.mimeType || undefined,
    durationSeconds: saved.durationSeconds || undefined,
    description: saved.description,
    whenToUse: saved.whenToUse || undefined,
    caption: saved.caption || undefined,
    transcription: saved.transcription || undefined,
    isActive: saved.isActive,
    sendAlone: saved.sendAlone,
    displayOrder: saved.displayOrder,
    createdAt: saved.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(id, adminMedia);
  if (saved.adminId) {
    lastCacheUpdate.set(saved.adminId, Date.now());
  }
  return adminMedia;
}

/**
 * Remove uma mídia do store e banco de dados
 */
export async function deleteAdminMedia(id: string, adminId: string): Promise<boolean> {
  const success = await storage.deleteAdminMedia(id);
  if (success) {
    adminMediaCache.delete(id);
    lastCacheUpdate.set(adminId, Date.now());
  }
  return success;
}

/**
 * Verifica se mídia existe (busca em cache primeiro, depois banco)
 */
export async function hasAdminMedia(id: string, adminId: string): Promise<boolean> {
  if (adminMediaCache.has(id)) return true;
  
  const media = await storage.getAdminMediaById(id);
  if (media) {
    const adminMedia: AdminMedia = {
      id: media.id!,
      adminId: media.adminId,
      name: media.name,
      mediaType: media.mediaType as "audio" | "image" | "video" | "document",
      storageUrl: media.storageUrl,
      fileName: media.fileName || undefined,
      fileSize: media.fileSize || undefined,
      mimeType: media.mimeType || undefined,
      durationSeconds: media.durationSeconds || undefined,
      description: media.description,
      whenToUse: media.whenToUse || undefined,
      caption: media.caption || undefined,
      transcription: media.transcription || undefined,
      isActive: media.isActive,
      sendAlone: media.sendAlone,
      displayOrder: media.displayOrder,
      createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
    };
    adminMediaCache.set(id, adminMedia);
    return true;
  }
  return false;
}

/**
 * Obtém mídia por ID (busca em cache primeiro, depois banco)
 */
export async function getAdminMediaById(id: string): Promise<AdminMedia | undefined> {
  if (adminMediaCache.has(id)) {
    return adminMediaCache.get(id);
  }
  
  const media = await storage.getAdminMediaById(id);
  if (!media) return undefined;
  
  const adminMedia: AdminMedia = {
    id: media.id!,
    adminId: media.adminId,
    name: media.name,
    mediaType: media.mediaType as "audio" | "image" | "video" | "document",
    storageUrl: media.storageUrl,
    fileName: media.fileName || undefined,
    fileSize: media.fileSize || undefined,
    mimeType: media.mimeType || undefined,
    durationSeconds: media.durationSeconds || undefined,
    description: media.description,
    whenToUse: media.whenToUse || undefined,
    caption: media.caption || undefined,
    transcription: media.transcription || undefined,
    isActive: media.isActive,
    sendAlone: media.sendAlone,
    displayOrder: media.displayOrder,
    createdAt: media.createdAt?.toISOString() || new Date().toISOString(),
  };
  
  adminMediaCache.set(id, adminMedia);
  return adminMedia;
}

/**
 * Retorna o tamanho do store (conta mídias no cache)
 */
export function getAdminMediaCount(): number {
  return adminMediaCache.size;
}

/**
 * Força recarga do cache para um admin específico
 */
export async function forceReloadCache(adminId: string): Promise<void> {
  lastCacheUpdate.delete(adminId);
  await reloadCache(adminId);
}

/**
 * Gera o bloco de prompt para as mídias do admin
 * Similar ao generateMediaPromptBlock do mediaService
 */
export async function generateAdminMediaPromptBlock(adminId: string): Promise<string> {
  const mediaList = await getAdminMediaList(adminId);
  
  if (mediaList.length === 0) {
    return '';
  }

  const audioMidias = mediaList.filter(m => m.mediaType === 'audio');
  const imageMidias = mediaList.filter(m => m.mediaType === 'image');
  const videoMidias = mediaList.filter(m => m.mediaType === 'video');
  const documentMidias = mediaList.filter(m => m.mediaType === 'document');
  
  const allMediaNames = mediaList.map(m => m.name).join(', ');

  let mediaBlock = `

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE ENVIO DE MÍDIAS - VOCÊ TEM ARQUIVOS DISPONÍVEIS!
═══════════════════════════════════════════════════════════════════════════════

Mídias disponíveis para enviar: ${allMediaNames}

`;

  if (imageMidias.length > 0) {
    mediaBlock += `🖼️ IMAGENS:\n`;
    for (const m of imageMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Imagem'}\n     Enviar quando: ${m.whenToUse || 'cliente pedir'}\n`;
    }
    mediaBlock += '\n';
  }

  if (audioMidias.length > 0) {
    mediaBlock += `🎵 ÁUDIOS:\n`;
    for (const m of audioMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Áudio'}\n     Enviar quando: ${m.whenToUse || 'cliente pedir'}\n`;
    }
    mediaBlock += '\n';
  }

  if (videoMidias.length > 0) {
    mediaBlock += `🎬 VÍDEOS:\n`;
    for (const m of videoMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Vídeo'}\n     Enviar quando: ${m.whenToUse || 'cliente pedir'}\n`;
    }
    mediaBlock += '\n';
  }

  if (documentMidias.length > 0) {
    mediaBlock += `📄 DOCUMENTOS:\n`;
    for (const m of documentMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Documento'}\n     Enviar quando: ${m.whenToUse || 'cliente pedir'}\n`;
    }
    mediaBlock += '\n';
  }

  mediaBlock += `
═══════════════════════════════════════════════════════════════════════════════
📌 COMO ENVIAR MÍDIA - MUITO IMPORTANTE!
═══════════════════════════════════════════════════════════════════════════════

Quando quiser enviar uma mídia, ADICIONE A TAG no final da sua resposta:

[ENVIAR_MIDIA:NOME_DA_MIDIA]

EXEMPLOS:
- Cliente pede foto: "Claro! Vou te mandar! [ENVIAR_MIDIA:FOTO_PRODUTO]"
- Cliente pede áudio: "Segue o áudio! [ENVIAR_MIDIA:AUDIO_EXPLICACAO]"
- Cliente pede vídeo: "Vou enviar o vídeo! [ENVIAR_MIDIA:VIDEO_DEMO]"

⚠️ REGRAS:
- Use o NOME EXATO da mídia listada acima
- A tag deve estar NO FINAL da mensagem
- Pode enviar MÚLTIPLAS mídias: [ENVIAR_MIDIA:X] [ENVIAR_MIDIA:Y]
- NÃO mencione a tag para o cliente, ela é processada automaticamente
═══════════════════════════════════════════════════════════════════════════════
`;

  return mediaBlock;
}

/**
 * Parseia a resposta e extrai tags de mídia
 */
export function parseAdminMediaTags(responseText: string): {
  cleanText: string;
  mediaActions: { type: 'send_media'; media_name: string }[];
} {
  const mediaTagRegex = /\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/gi;
  const mediaActions: { type: 'send_media'; media_name: string }[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = mediaTagRegex.exec(responseText)) !== null) {
    const mediaName = match[1].toUpperCase();
    mediaActions.push({
      type: 'send_media',
      media_name: mediaName,
    });
    console.log(`📁 [AdminMediaStore] Tag de mídia detectada: ${mediaName}`);
  }
  
  // Remover as tags do texto final
  const cleanText = responseText.replace(/\[ENVIAR_MIDIA:[A-Z0-9_]+\]/gi, '').trim();
  
  return { cleanText, mediaActions };
}
