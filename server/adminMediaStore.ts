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

  // Organizar mídias por tipo
  const audioMidias = mediaList.filter(m => m.mediaType === 'audio');
  const imageMidias = mediaList.filter(m => m.mediaType === 'image');
  const videoMidias = mediaList.filter(m => m.mediaType === 'video');
  const documentMidias = mediaList.filter(m => m.mediaType === 'document');

  // Construir lista de mídias disponíveis
  const allMediaNames = mediaList.map(m => m.name).join(', ');

  let mediaBlock = `

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE ENVIO DE MÍDIAS - INSTRUÇÕES OBRIGATÓRIAS
═══════════════════════════════════════════════════════════════════════════════

🔴🔴🔴 REGRA MAIS IMPORTANTE 🔴🔴🔴
Quando cliente perguntar "como funciona", "me explica", "quero saber mais":
→ SEMPRE inclua [ENVIAR_MIDIA:COMO_FUNCIONA] na resposta!
→ Esta tag ENVIA o áudio explicativo automaticamente!

⚠️⚠️⚠️ REGRA ABSOLUTA - LEIA COM ATENÇÃO ⚠️⚠️⚠️

VOCÊ SÓ PODE USAR ESTAS MÍDIAS (e NENHUMA outra):
${allMediaNames}

🚫 PROIBIDO INVENTAR MÍDIAS! 
- NÃO existe QR_CODE como mídia (QR Code é uma AÇÃO: [AÇÃO:ENVIAR_QRCODE])
- NÃO existe nenhuma mídia que não esteja listada acima
- Se o nome não está na lista, NÃO USE!

⚠️ DIFERENÇA IMPORTANTE:
- [ENVIAR_MIDIA:...] = Arquivos pré-gravados (imagens, áudios, vídeos, PDFs)
- [AÇÃO:...] = Funcionalidades do sistema (criar conta, gerar QR Code, etc)

Para QR CODE DO WHATSAPP: Use [AÇÃO:ENVIAR_QRCODE] (É UMA AÇÃO, NÃO MÍDIA!)
Para CÓDIGO DE 8 DÍGITOS: Use [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO]

`;

  if (imageMidias.length > 0) {
    mediaBlock += `🖼️ IMAGENS DISPONÍVEIS:
`;
    for (const m of imageMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Imagem'}
     Enviar quando: ${m.whenToUse || 'cliente pedir catálogo, foto, imagem'}
`;
    }
    mediaBlock += '\n';
  }

  if (audioMidias.length > 0) {
    mediaBlock += `🎵 ÁUDIOS DISPONÍVEIS:
`;
    for (const m of audioMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Áudio'}
     Enviar quando: ${m.whenToUse || 'cliente pedir áudio, explicação por voz'}
`;
    }
    mediaBlock += '\n';
  }

  if (videoMidias.length > 0) {
    mediaBlock += `🎬 VÍDEOS DISPONÍVEIS:
`;
    for (const m of videoMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Vídeo'}
     Enviar quando: ${m.whenToUse || 'cliente pedir vídeo, demonstração'}
`;
    }
    mediaBlock += '\n';
  }

  if (documentMidias.length > 0) {
    mediaBlock += `📄 DOCUMENTOS DISPONÍVEIS:
`;
    for (const m of documentMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Documento'}
     Enviar quando: ${m.whenToUse || 'cliente pedir documento, PDF, contrato'}
`;
    }
    mediaBlock += '\n';
  }

  mediaBlock += `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRA CRÍTICA: COMO ENVIAR MÍDIA (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════════════════════

Quando o cliente pedir uma mídia ou o assunto combinar, você DEVE:
1. Responder confirmando o envio
2. ADICIONAR A TAG NO FINAL: [ENVIAR_MIDIA:NOME_EXATO_DA_MIDIA]

EXEMPLOS OBRIGATÓRIOS (copie este formato):

CLIENTE: "como funciona o sistema?"
SUA RESPOSTA: "Vou te explicar como funciona! [ENVIAR_MIDIA:COMO_FUNCIONA]"

CLIENTE: "me explica melhor"  
SUA RESPOSTA: "Claro! Vou te enviar uma explicação. [ENVIAR_MIDIA:COMO_FUNCIONA]"

CLIENTE: "manda um áudio"
SUA RESPOSTA: "Vou te enviar o áudio agora! [ENVIAR_MIDIA:COMO_FUNCIONA]"

CLIENTE: "quero saber mais"
SUA RESPOSTA: "Vou te mostrar! [ENVIAR_MIDIA:COMO_FUNCIONA]"

═══════════════════════════════════════════════════════════════════════════════
❌ QUANDO NÃO ENVIAR (apenas responda normalmente SEM tag):
═══════════════════════════════════════════════════════════════════════════════
- "Oi", "Bom dia" → responder saudação SEM mídia
- "Obrigado" → responder agradecimento SEM mídia  
- "Ok", "Fechado" → confirmar SEM mídia

═══════════════════════════════════════════════════════════════════════════════
🎯 MAPEAMENTO DE PALAVRAS → MÍDIAS:
═══════════════════════════════════════════════════════════════════════════════
`;

  // Lista DETALHADA de cada mídia com INSTRUÇÕES para a IA decidir
  mediaBlock += `
📋 BIBLIOTECA DE MÍDIAS DISPONÍVEIS:
`;

  // Listar TODAS as mídias com suas INSTRUÇÕES (descrição e quando usar)
  for (const media of mediaList) {
    const tipo = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
                 media.mediaType === 'video' ? '🎥 VÍDEO' :
                 media.mediaType === 'image' ? '🖼️ IMAGEM' : '📄 DOCUMENTO';
    
    const podeComOutras = media.sendAlone ? '⚠️ ENVIAR SOZINHA (não combinar)' : '✅ Pode combinar com outras';
    
    mediaBlock += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${tipo} → Para enviar use: [ENVIAR_MIDIA:${media.name}]
📝 DESCRIÇÃO: ${media.description || 'Sem descrição'}
🎯 QUANDO USAR: ${media.whenToUse || 'Quando for relevante ao contexto'}
${podeComOutras}
`;
  }

  mediaBlock += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📌 INSTRUÇÕES DE USO:

1. LEIA a pergunta do cliente
2. COMPARE com o campo "QUANDO USAR" de cada mídia acima
3. Se a mídia é relevante → INCLUA a tag [ENVIAR_MIDIA:NOME] na resposta
4. Se várias mídias são relevantes E podem ser combinadas → ENVIE TODAS!
5. Se a mídia tem "ENVIAR SOZINHA" → NÃO combine com outras

🔑 REGRA PRINCIPAL:
Analise o "QUANDO USAR" de cada mídia. Se a pergunta do cliente COMBINA 
com a instrução, ENVIE essa mídia. Você pode enviar MÚLTIPLAS se fizer sentido!

⚠️ Tags [ENVIAR_MIDIA:NOME] sempre NO FINAL da resposta!

🚫🚫🚫 NUNCA INVENTE MÍDIAS 🚫🚫🚫
Mídias válidas: ${allMediaNames}
Se não está na lista acima, NÃO USE!
QR CODE = [AÇÃO:ENVIAR_QRCODE] (é ação, não mídia!)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
