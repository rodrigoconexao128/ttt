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
async function reloadCache(adminId?: string): Promise<void> {
  const now = Date.now();
  const cacheKey = adminId || 'default';
  const lastUpdate = lastCacheUpdate.get(cacheKey) || 0;
  
  // Se cache ainda é válido, não recarregar
  if (now - lastUpdate < CACHE_TTL && adminMediaCache.size > 0) {
    return;
  }

  try {
    // Sistema single-admin: busca todas as mídias ativas
    const mediaList = await storage.getActiveAdminMedia();
    
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
    
    lastCacheUpdate.set(cacheKey, now);
    console.log(`📁 [AdminMediaStore] Cache recarregado: ${mediaList.length} mídias`);
  } catch (error) {
    console.error("📁 [AdminMediaStore] Erro ao recarregar cache:", error);
  }
}

/**
 * Obtém todas as mídias ativas do admin (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 */
export async function getAdminMediaList(adminId?: string): Promise<AdminMedia[]> {
  await reloadCache(adminId);
  return Array.from(adminMediaCache.values()).filter(m => m.isActive);
}

/**
 * Obtém uma mídia por nome (com cache)
 * @param adminId - ID do admin (opcional para sistema single-admin)
 * @param name - Nome da mídia
 */
export async function getAdminMediaByName(adminId: string | undefined, name: string): Promise<AdminMedia | undefined> {
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
export async function getAdminMediasByPattern(adminId: string | undefined, pattern: string): Promise<AdminMedia[]> {
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
 * COPIADO DO mediaService.ts QUE FUNCIONA CORRETAMENTE
 */
export async function generateAdminMediaPromptBlock(adminId?: string): Promise<string> {
  const mediaList = await getAdminMediaList(adminId);
  
  if (mediaList.length === 0) {
    return '';
  }

  const allMediaNames = mediaList.map(m => m.name);

// Definição dos gatilhos padrão (Exportado para uso no fallback)
export const defaultTriggers = [
  { keywords: ["como funciona", "funciona assim", "deixa eu explicar", "vou te explicar", "te explico", "vale a pena"], mediaName: "COMO_FUNCIONA" },
  { keywords: ["vídeo", "demonstra", "ver na prática", "te mostro"], mediaName: "VIDEO_DEMONSTRACAO" },
  { keywords: ["preço", "quanto custa", "valor", "investimento", "tabela"], mediaName: "TABELA_PRECOS" },
  { keywords: ["contrato", "termos", "documento"], mediaName: "PDF_CONTRATO" }
];

/**
 * Obtém os gatilhos ativos baseados nas mídias disponíveis
 */
export async function getActiveTriggers(adminId?: string) {
  const mediaList = await getAdminMediaList(adminId);
  const allMediaNames = mediaList.map(m => m.name);
  return defaultTriggers.filter(t => allMediaNames.includes(t.mediaName));
}

/**
 * Gera o bloco de prompt para as mídias do admin
 * COPIADO DO mediaService.ts QUE FUNCIONA CORRETAMENTE
 */
export async function generateAdminMediaPromptBlock(adminId?: string): Promise<string> {
  const mediaList = await getAdminMediaList(adminId);
  
  if (mediaList.length === 0) {
    return '';
  }

  // Filtrar gatilhos para mídias que realmente existem
  const activeTriggers = await getActiveTriggers(adminId);

  let mediaBlock = `
═══════════════════════════════════════════════════════════════════════════════
📁 MÍDIAS DISPONÍVEIS E REGRAS DE ENVIO
═══════════════════════════════════════════════════════════════════════════════
`;

  if (activeTriggers.length > 0) {
    mediaBlock += `
🚨 GATILHOS OBRIGATÓRIOS (Se falar isso, TEM que enviar a mídia):
`;
    for (const trigger of activeTriggers) {
      mediaBlock += `• Se falar "${trigger.keywords[0]}" ou similar → Use [ENVIAR_MIDIA:${trigger.mediaName}]\n`;
    }
  }

  mediaBlock += `
📋 LISTA COMPLETA DE MÍDIAS (Use quando o contexto pedir):
`;

  for (const media of mediaList) {
    const tipo = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
                 media.mediaType === 'video' ? '🎥 VÍDEO' :
                 media.mediaType === 'image' ? '🖼️ IMAGEM' : '📄 DOC';
    
    mediaBlock += `
${tipo}: ${media.name}
   📝 Descrição: ${media.description || 'Sem descrição'}
   🎯 Quando usar: ${media.whenToUse || 'Quando relevante'}
   👉 Tag para enviar: [ENVIAR_MIDIA:${media.name}]
`;
  }

  mediaBlock += `
⚠️ REGRA FINAL:
1. Se o cliente perguntar algo que bate com "Quando usar", ENVIE A MÍDIA.
2. Coloque a tag [ENVIAR_MIDIA:NOME] no final da resposta.
3. Você PODE enviar mídia junto com a explicação.
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
  // Regex mais permissivo para pegar tags com espaços ou variações
  const mediaTagRegex = /\[ENVIAR_MIDIA:\s*([A-Z0-9_]+)\s*\]/gi;
  const mediaActions: { type: 'send_media'; media_name: string }[] = [];
  
  let match: RegExpExecArray | null;
  while ((match = mediaTagRegex.exec(responseText)) !== null) {
    const mediaName = match[1].toUpperCase().trim();
    mediaActions.push({
      type: 'send_media',
      media_name: mediaName,
    });
    console.log(`📁 [AdminMediaStore] Tag de mídia detectada: ${mediaName}`);
  }
  
  // Remover as tags do texto final (usando a mesma regex permissiva)
  const cleanText = responseText.replace(/\[ENVIAR_MIDIA:\s*[A-Z0-9_]+\s*\]/gi, '').trim();
  
  return { cleanText, mediaActions };
}
