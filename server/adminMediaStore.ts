/**
 * 📁 STORE DE MÍDIAS DO ADMIN AGENT
 * Gerencia as mídias disponíveis para o agente admin usar nas respostas
 */

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

// Store global de mídias do admin
const adminMediaLibrary: Map<string, AdminMedia> = new Map();

/**
 * Obtém todas as mídias do admin
 */
export function getAdminMediaList(): AdminMedia[] {
  return Array.from(adminMediaLibrary.values()).filter(m => m.isActive);
}

/**
 * Obtém uma mídia por nome
 */
export function getAdminMediaByName(name: string): AdminMedia | undefined {
  const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
  const values = Array.from(adminMediaLibrary.values());
  
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
export function getAdminMediasByPattern(pattern: string): AdminMedia[] {
  const normalizedPattern = pattern.toUpperCase().replace(/\s+/g, '_');
  const results: AdminMedia[] = [];
  const values = Array.from(adminMediaLibrary.values());
  
  for (const media of values) {
    if (media.isActive && media.name.toUpperCase().includes(normalizedPattern)) {
      results.push(media);
    }
  }
  return results;
}

/**
 * Adiciona uma mídia ao store
 */
export function addAdminMedia(media: AdminMedia): void {
  adminMediaLibrary.set(media.id, media);
  console.log(`📁 [AdminMediaStore] Mídia adicionada: ${media.name} (${media.mediaType})`);
}

/**
 * Atualiza uma mídia existente
 */
export function updateAdminMedia(id: string, updates: Partial<AdminMedia>): AdminMedia | null {
  const existing = adminMediaLibrary.get(id);
  if (!existing) return null;
  
  const updated = { ...existing, ...updates };
  adminMediaLibrary.set(id, updated);
  return updated;
}

/**
 * Remove uma mídia do store
 */
export function deleteAdminMedia(id: string): boolean {
  return adminMediaLibrary.delete(id);
}

/**
 * Verifica se mídia existe
 */
export function hasAdminMedia(id: string): boolean {
  return adminMediaLibrary.has(id);
}

/**
 * Obtém mídia por ID
 */
export function getAdminMediaById(id: string): AdminMedia | undefined {
  return adminMediaLibrary.get(id);
}

/**
 * Retorna o tamanho do store
 */
export function getAdminMediaCount(): number {
  return adminMediaLibrary.size;
}

/**
 * Gera o bloco de prompt para as mídias do admin
 * Similar ao generateMediaPromptBlock do mediaService
 */
export function generateAdminMediaPromptBlock(): string {
  const mediaList = getAdminMediaList();
  
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
