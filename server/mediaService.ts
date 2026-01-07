/**
 * Agent Media Service
 * 
 * Gerencia biblioteca de mídias dos agentes e envio via WhatsApp (w-api ou Baileys).
 * O Mistral decide qual mídia enviar baseado nas descrições no prompt.
 */

import { db } from "./db";
import { agentMediaLibrary, messages, type AgentMedia, type InsertAgentMedia, mistralResponseSchema, type MistralResponse } from "@shared/schema";
import { eq, and, asc, or, sql } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";
import { registerAgentMessageId } from "./whatsapp";

// =============================================================================
// MEDIA LIBRARY CRUD
// =============================================================================

/**
 * Busca todas as mídias ativas de um usuário
 */
export async function getAgentMediaLibrary(userId: string): Promise<AgentMedia[]> {
  try {
    const media = await db
      .select()
      .from(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.userId, userId),
        eq(agentMediaLibrary.isActive, true)
      ))
      .orderBy(asc(agentMediaLibrary.displayOrder));
    
    return media;
  } catch (error) {
    console.error(`[MediaService] Error fetching media library for user ${userId}:`, error);
    return [];
  }
}

/**
 * Gera um nome único para mídia adicionando sufixo _2, _3, etc se necessário
 */
async function generateUniqueMediaName(userId: string, baseName: string): Promise<string> {
  const normalizedBaseName = baseName.toUpperCase().replace(/\s+/g, '_');
  
  // Verifica se o nome base já existe
  const existing = await getMediaByName(userId, normalizedBaseName);
  if (!existing) {
    return normalizedBaseName;
  }
  
  // Busca todos os nomes similares (CARDAPIO, CARDAPIO_2, CARDAPIO_3, etc)
  const allMedia = await db
    .select({ name: agentMediaLibrary.name })
    .from(agentMediaLibrary)
    .where(eq(agentMediaLibrary.userId, userId));
  
  const pattern = new RegExp(`^${normalizedBaseName}(_\\d+)?$`);
  const similarNames = allMedia
    .map(m => m.name)
    .filter(name => pattern.test(name));
  
  // Encontra o maior sufixo numérico
  let maxSuffix = 1;
  for (const name of similarNames) {
    const match = name.match(/_(\d+)$/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxSuffix) maxSuffix = num;
    }
  }
  
  // Retorna próximo número disponível
  return `${normalizedBaseName}_${maxSuffix + 1}`;
}

/**
 * Busca uma mídia pelo nome
 */
export async function getMediaByName(userId: string, name: string): Promise<AgentMedia | null> {
  try {
    const [media] = await db
      .select()
      .from(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.userId, userId),
        eq(agentMediaLibrary.name, name.toUpperCase())
      ))
      .limit(1);
    
    return media || null;
  } catch (error) {
    console.error(`[MediaService] Error fetching media ${name} for user ${userId}:`, error);
    return null;
  }
}

/**
 * Cria ou atualiza uma mídia na biblioteca
 */
/**
 * Cria uma nova mídia (sempre insere, nunca atualiza)
 * Se o nome já existir, adiciona sufixo _2, _3, etc automaticamente
 */
export async function insertAgentMedia(data: InsertAgentMedia): Promise<AgentMedia | null> {
  try {
    // Gera nome único (adiciona _2, _3 se necessário)
    const uniqueName = await generateUniqueMediaName(data.userId, data.name);
    
    const normalizedData = {
      ...data,
      name: uniqueName,
    };

    const [inserted] = await db
      .insert(agentMediaLibrary)
      .values(normalizedData)
      .returning();
    
    console.log(`[MediaService] Created media ${uniqueName} for user ${data.userId}`);
    return inserted;
  } catch (error) {
    console.error(`[MediaService] Error inserting media:`, error);
    return null;
  }
}

/**
 * Atualiza uma mídia existente
 * Se mudar o nome e já existir, retorna erro
 */
export async function updateAgentMedia(mediaId: string, userId: string, data: Partial<InsertAgentMedia>): Promise<AgentMedia | null> {
  try {
    // Se está mudando o nome, normaliza e valida
    if (data.name) {
      const normalizedName = data.name.toUpperCase().replace(/\s+/g, '_');
      
      // Verifica se o novo nome já existe em outra mídia
      const existing = await getMediaByName(userId, normalizedName);
      if (existing && existing.id !== mediaId) {
        console.error(`[MediaService] Name conflict: ${normalizedName} already exists`);
        throw new Error(`Nome ${normalizedName} já existe em outra mídia`);
      }
      
      data.name = normalizedName;
    }

    const [updated] = await db
      .update(agentMediaLibrary)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(and(
        eq(agentMediaLibrary.id, mediaId),
        eq(agentMediaLibrary.userId, userId)
      ))
      .returning();
    
    if (!updated) {
      console.error(`[MediaService] Media ${mediaId} not found for user ${userId}`);
      return null;
    }
    
    console.log(`[MediaService] Updated media ${updated.name} for user ${userId}`);
    return updated;
  } catch (error) {
    console.error(`[MediaService] Error updating media:`, error);
    throw error; // Re-throw para capturar no route
  }
}

/**
 * Remove uma mídia da biblioteca
 */
export async function deleteAgentMedia(userId: string, mediaId: string): Promise<boolean> {
  try {
    await db
      .delete(agentMediaLibrary)
      .where(and(
        eq(agentMediaLibrary.id, mediaId),
        eq(agentMediaLibrary.userId, userId)
      ));
    
    console.log(`[MediaService] Deleted media ${mediaId} for user ${userId}`);
    return true;
  } catch (error) {
    console.error(`[MediaService] Error deleting media:`, error);
    return false;
  }
}

/**
 * @deprecated Use insertAgentMedia para criar ou updateAgentMedia para atualizar
 * Mantido apenas para compatibilidade com testes antigos
 */
export async function upsertAgentMedia(data: InsertAgentMedia): Promise<AgentMedia | null> {
  console.warn('[MediaService] upsertAgentMedia is deprecated. Use insertAgentMedia or updateAgentMedia instead.');
  return insertAgentMedia(data);
}

// =============================================================================
// PROMPT GENERATION FOR MISTRAL
// =============================================================================

/**
 * Gera o bloco de mídias para incluir no prompt do Mistral
 * 
 * NOVA ABORDAGEM: O sistema de mídias funciona INDEPENDENTE do prompt do cliente
 * 
 * O cliente configura apenas:
 * - Tom de voz, estilo, informações do negócio
 * 
 * As mídias são enviadas AUTOMATICAMENTE baseadas no campo "when_to_use"
 * O cliente NÃO precisa colocar instruções de mídia no prompt
 * 
 * Este bloco é adicionado AUTOMATICAMENTE pelo sistema e a IA deve seguir
 */
export function generateMediaPromptBlock(mediaList: AgentMedia[]): string {
  if (!mediaList || mediaList.length === 0) {
    return '';
  }

  // Filtrar apenas mídias ativas
  const activeMedias = mediaList.filter(m => m.isActive !== false);
  
  if (activeMedias.length === 0) {
    return '';
  }

  let mediaBlock = `

═══════════════════════════════════════════════════════════════════════════════
🎯 SISTEMA DE MÍDIAS AUTOMÁTICO (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════════════════════

VOCÊ DEVE enviar mídias quando a mensagem do cliente corresponder às condições.
Analise a mensagem do cliente e compare com cada condição abaixo.

📁 MÍDIAS E SUAS CONDIÇÕES DE ENVIO:
`;

  // Lista cada mídia com seu gatilho - mais direto
  for (let i = 0; i < activeMedias.length; i++) {
    const media = activeMedias[i];
    const whenToUse = media.whenToUse || 'quando solicitado';
    
    mediaBlock += `
▸ ${media.name}
  CONDIÇÃO: ${whenToUse}
  COMO USAR: Adicione [MEDIA:${media.name}] no final da sua resposta
`;
  }

  mediaBlock += `
═══════════════════════════════════════════════════════════════════════════════
📝 INSTRUÇÕES OBRIGATÓRIAS DE MÍDIA:
═══════════════════════════════════════════════════════════════════════════════

⚠️ REGRA CRÍTICA: VOCÊ DEVE ENVIAR **TODAS** AS MÍDIAS ACIMA CUJAS CONDIÇÕES SE APLICAM!
⚠️ NÃO escolha apenas uma - se 3 condições batem, envie 3 tags!

PROCESSO OBRIGATÓRIO:
1. Leia a mensagem do cliente
2. Para CADA mídia acima, verifique se a CONDIÇÃO se aplica
3. Se a condição de uma mídia bate → ADICIONE a tag [MEDIA:NOME]
4. Se a condição de outra mídia também bate → ADICIONE essa tag também
5. Continue até verificar TODAS as mídias

FORMATO CORRETO (MÚLTIPLAS MÍDIAS):
Cliente: "Oi, boa tarde!"
Resposta: "Oi! Tudo bem? [MEDIA:AUDIO_BOAS_VINDAS][MEDIA:BANNER][MEDIA:VIDEO_APRESENTACAO]"

⚠️ NÃO repita mídias já enviadas nesta conversa
⚠️ NÃO mencione que está enviando áudio/vídeo/imagem
⚠️ Se nenhuma condição corresponder, NÃO envie mídia

═══════════════════════════════════════════════════════════════════════════════
`;

  return mediaBlock;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parseia a resposta do Mistral e extrai ações de mídia
 * NOVA ABORDAGEM: Detecta tags [ENVIAR_MIDIA:NOME] no texto
 */
export function parseMistralResponse(responseText: string): MistralResponse | null {
  try {
    // Detectar tags [MEDIA:NOME] no texto (formato simplificado)
    const mediaTagRegex = /\[MEDIA:([A-Z0-9_]+)\]/gi;
    
    const actions: MistralResponse['actions'] = [];
    let match: RegExpExecArray | null;
    
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
      const mediaName = match[1].toUpperCase();
      actions.push({
        type: 'send_media',
        media_name: mediaName,
      });
      console.log(`📁 [MediaService] Tag de mídia detectada: ${mediaName}`);
    }
    
    // Remover as tags do texto final (o cliente não precisa ver)
    const cleanText = responseText.replace(/\[MEDIA:[A-Z0-9_]+\]/gi, '').trim();
    
    if (actions.length > 0) {
      console.log(`📁 [MediaService] Total de ${actions.length} mídia(s) para enviar: ${actions.map(a => a.media_name).join(', ')}`);
    }
    
    return {
      messages: [{ type: "text", content: cleanText }],
      actions,
    };
  } catch (error) {
    console.error(`[MediaService] Error parsing Mistral response:`, error);
    return {
      messages: [{ type: "text", content: responseText }],
      actions: [],
    };
  }
}

// =============================================================================
// W-API MEDIA SENDING
// =============================================================================

interface WApiConfig {
  apiUrl: string;
  apiKey: string;
  instanceId: string;
}

interface SendMediaParams {
  to: string; // Número do destinatário (ex: 5511999999999)
  mediaType: 'audio' | 'image' | 'video' | 'document';
  mediaUrl: string; // URL pública da mídia
  caption?: string; // Legenda (para imagem/vídeo/documento)
  fileName?: string; // Nome do arquivo (para documento)
  isPtt?: boolean; // Push-to-talk (áudio gravado) - default: true para áudio
}

/**
 * Envia mídia via W-API
 * Referência: https://www.postman.com/w-api/w-api-api-do-whatsapp/
 */
export async function sendMediaViaWApi(
  config: WApiConfig,
  params: SendMediaParams
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    const { apiUrl, apiKey, instanceId } = config;
    const { to, mediaType, mediaUrl, caption, fileName, isPtt } = params;

    // Formata número para formato WhatsApp
    const formattedNumber = to.replace(/\D/g, '');
    const chatId = formattedNumber.includes('@') ? formattedNumber : `${formattedNumber}@s.whatsapp.net`;

    // Endpoint baseado no tipo de mídia
    const endpoints: Record<string, string> = {
      audio: '/message/sendMedia',
      image: '/message/sendMedia',
      video: '/message/sendMedia',
      document: '/message/sendMedia',
    };

    const endpoint = `${apiUrl}${endpoints[mediaType]}`;

    // Payload para W-API
    const payload: Record<string, any> = {
      chatId,
      mediatype: mediaType,
      media: mediaUrl,
    };

    if (caption) {
      payload.caption = caption;
    }

    if (fileName && mediaType === 'document') {
      payload.fileName = fileName;
    }
    
    // Para áudio, incluir flag PTT (push-to-talk = mensagem de voz gravada)
    if (mediaType === 'audio') {
      payload.ptt = isPtt !== false; // PTT por padrão
    }

    console.log(`[MediaService] Sending ${mediaType} to ${chatId} via W-API`);

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
        'x-instance-id': instanceId,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (response.ok && result.key?.id) {
      console.log(`[MediaService] Media sent successfully. MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id };
    } else {
      console.error(`[MediaService] W-API error:`, result);
      return { success: false, error: result.message || 'Unknown error' };
    }
  } catch (error) {
    console.error(`[MediaService] Error sending media via W-API:`, error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// BAILEYS MEDIA SENDING (Fallback)
// =============================================================================

/**
 * Baixa arquivo da URL e retorna como Buffer
 * Essencial para enviar áudio PTT que precisa de buffer, não URL
 */
export async function downloadMediaAsBuffer(url: string): Promise<Buffer> {
  console.log(`[MediaService] Downloading media from: ${url}`);
  const response = await fetch(url);
  
  if (!response.ok) {
    throw new Error(`Failed to download media: ${response.status} ${response.statusText}`);
  }
  
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  console.log(`[MediaService] Downloaded ${buffer.length} bytes`);
  
  // Validação básica
  if (buffer.length === 0) {
    throw new Error('Downloaded buffer is empty');
  }
  
  return buffer;
}

/**
 * Envia mídia via Baileys (socket WhatsApp direto)
 * Usado como fallback se W-API não estiver configurada
 * 
 * IMPORTANTE: Para áudio PTT, precisamos baixar o arquivo como Buffer
 * porque Baileys tem problemas com URLs para áudio PTT
 */
export async function sendMediaViaBaileys(
  socket: any, // WASocket do Baileys
  jid: string,
  media: AgentMedia
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!socket) {
      return { success: false, error: 'Socket not connected' };
    }

    console.log(`[MediaService] Sending ${media.mediaType} to ${jid} via Baileys`);
    console.log(`[MediaService] Media URL: ${media.storageUrl}`);
    console.log(`[MediaService] Media MimeType: ${media.mimeType}`);

    let messageContent: any;

    switch (media.mediaType) {
      case 'audio': {
        // IMPORTANTE: Baileys é MUITO específico com áudio
        // Use estratégia com fallback (PTT e mimetypes diferentes)
        try {
          const audioBuffer = await downloadMediaAsBuffer(media.storageUrl);
          console.log(`[MediaService] Audio buffer downloaded: ${audioBuffer.length} bytes`);

          // IMPORTANTE: Baileys E2E tests usam audio/mp4 para PTT, não ogg/opus!
          // Veja: https://github.com/WhiskeySockets/Baileys/blob/main/src/__tests__/e2e/send-receive-message.test-e2e.ts#L212
          const isPtt = media.isPtt !== false;
          // FORÇAR audio/mp4 porque é o que funciona nos testes oficiais do Baileys
          const mimeType = 'audio/mp4';

          console.log(`[MediaService] 🎵 Audio config:`);
          console.log(`    - Buffer size: ${audioBuffer.length} bytes`);
          console.log(`    - MimeType: ${mimeType}`);
          console.log(`    - isPtt (gravado): ${isPtt}`);

          // Tenta enviar com fallback inteligente (PTT -> sem PTT -> outros mimetypes)
          const audioResult = await sendAudioWithFallback(socket, jid, audioBuffer, media.storageUrl, mimeType, isPtt);
          return audioResult;
        } catch (downloadError) {
          console.error(`[MediaService] ❌ Failed to download audio:`, downloadError);
          return { success: false, error: `Failed to download audio: ${String(downloadError)}` };
        }
      }
      break;

      case 'image':
        // Imagens funcionam bem com URL, mas vamos tentar buffer também para consistência
        try {
          const imageBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            image: imageBuffer,
            caption: media.caption || undefined, // Usa caption (não description)
            mimetype: media.mimeType || 'image/jpeg',
          };
        } catch (downloadError) {
          // Fallback para URL se download falhar
          console.warn(`[MediaService] Image download failed, trying URL: ${downloadError}`);
          messageContent = {
            image: { url: media.storageUrl },
            caption: media.caption || undefined, // Usa caption (não description)
            mimetype: media.mimeType || 'image/jpeg',
          };
        }
        break;

      case 'video':
        // Vídeos podem ser grandes, tentar URL primeiro
        try {
          const videoBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            video: videoBuffer,
            caption: media.caption || undefined, // Usa caption (não description)
            mimetype: media.mimeType || 'video/mp4',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Video download failed, trying URL: ${downloadError}`);
          messageContent = {
            video: { url: media.storageUrl },
            caption: media.caption || undefined, // Usa caption (não description)
            mimetype: media.mimeType || 'video/mp4',
          };
        }
        break;

      case 'document':
        // Documentos precisam de buffer para manter o fileName
        try {
          const docBuffer = await downloadMediaAsBuffer(media.storageUrl);
          messageContent = {
            document: docBuffer,
            mimetype: media.mimeType || 'application/pdf',
            fileName: media.fileName || 'document',
          };
        } catch (downloadError) {
          console.warn(`[MediaService] Document download failed, trying URL: ${downloadError}`);
          messageContent = {
            document: { url: media.storageUrl },
            mimetype: media.mimeType || 'application/pdf',
            fileName: media.fileName || 'document',
          };
        }
        break;

      default:
        return { success: false, error: `Unknown media type: ${media.mediaType}` };
    }

    console.log(`[MediaService] Sending message to Baileys...`);
    let result = await socket.sendMessage(jid, messageContent);

    if (result?.key?.id) {
      console.log(`[MediaService] ✅ Media sent via Baileys. MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id };
    } else {
      console.error(`[MediaService] ❌ No message ID returned from Baileys`);
      return { success: false, error: 'No message ID returned' };
    }
  } catch (error) {
    console.error(`[MediaService] ❌ Error sending media via Baileys:`, error);
    return { success: false, error: String(error) };
  }
}

// =============================================================================
// AUDIO VALIDATION & CONVERSION
// =============================================================================

/**
 * Valida o formato do áudio e retorna informações de diagnóstico
 * Ajuda a identificar problemas com o arquivo de áudio
 */
export async function validateAudioBuffer(buffer: Buffer, mimeType: string): Promise<{
  isValid: boolean;
  format: string;
  hasHeader: boolean;
  size: number;
  issues: string[];
}> {
  const issues: string[] = [];
  let format = 'unknown';
  let hasHeader = false;

  // Verificar tamanho
  if (buffer.length === 0) {
    issues.push('Buffer vazio');
    return { isValid: false, format, hasHeader, size: 0, issues };
  }

  if (buffer.length < 100) {
    issues.push('Buffer muito pequeno (< 100 bytes) - pode estar corrompido');
  }

  // Verificar headers conhecidos
  const header = buffer.slice(0, 4).toString('hex').toUpperCase();
  
  // OGG header
  if (header.startsWith('4F6767')) {
    format = 'OGG';
    hasHeader = true;
  }
  // OPUS header (OggS)
  else if (buffer.slice(0, 4).toString() === 'OggS') {
    format = 'OGG-OPUS';
    hasHeader = true;
  }
  // MP3 header
  else if ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || header.startsWith('ID3')) {
    format = 'MP3';
    hasHeader = true;
  }
  // WAV header
  else if (header === '52494646') { // RIFF
    format = 'WAV';
    hasHeader = true;
  }
  // M4A header
  else if (header.slice(4) === '66747970') { // ftyp
    format = 'M4A';
    hasHeader = true;
  }
  else {
    issues.push(`Formato desconhecido (header: ${header})`);
    issues.push('Arquivo pode estar em formato Opus puro sem container OGG');
  }

  const isValid = hasHeader && issues.length === 0;

  console.log(`[MediaService] 🔍 Audio validation:`, {
    format,
    mimeType,
    hasHeader,
    size: buffer.length,
    isValid,
    issues
  });

  return { isValid, format, hasHeader, size: buffer.length, issues };
}

/**
 * Gera um áudio WAV de teste (beep de 1s) em runtime para diagnóstico
 * Útil para validar se o problema é o arquivo ou o envio Baileys
 */
export function generateTestWavBuffer(durationMs: number = 1000, freq: number = 440): Buffer {
  const sampleRate = 16000;
  const numSamples = Math.floor(sampleRate * (durationMs / 1000));
  const amplitude = 0.2; // 20% da escala máxima

  // WAV header (16-bit PCM, mono)
  const headerSize = 44;
  const dataSize = numSamples * 2; // 16-bit = 2 bytes
  const buffer = Buffer.alloc(headerSize + dataSize);

  // Escrever header RIFF/WAVE
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4); // chunk size
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // subchunk1 size (PCM)
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(1, 22); // mono
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buffer.writeUInt16LE(2, 32); // block align
  buffer.writeUInt16LE(16, 34); // bits per sample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  // Dados PCM (senoide)
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const sample = Math.sin(2 * Math.PI * freq * t) * amplitude;
    const intSample = Math.max(-1, Math.min(1, sample));
    buffer.writeInt16LE(intSample * 32767, headerSize + i * 2);
  }

  return buffer;
}

/**
 * Tenta diferentes estratégias de envio de áudio para Baileys
 * Se uma falhar, tenta outra
 */
async function sendAudioWithFallback(
  socket: any,
  jid: string,
  audioBuffer: Buffer,
  storageUrl: string,
  mimeType: string,
  isPtt: boolean
): Promise<{ success: boolean; messageId?: string; error?: string; strategy?: string }> {
  
  // Validar buffer
  const validation = await validateAudioBuffer(audioBuffer, mimeType);
  
  // Estratégia 1: Enviar como está (com validação)
  console.log(`[MediaService] 📋 Estratégia 1: Enviar ${isPtt ? 'COM' : 'SEM'} PTT (${mimeType})`);
  
  try {
    const result = await socket.sendMessage(jid, {
      audio: audioBuffer,
      mimetype: mimeType,
      ptt: isPtt,
    });

    if (result?.key?.id) {
      console.log(`[MediaService] ✅ Estratégia 1 funcionou! MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id, strategy: `Env com ${isPtt ? 'PTT' : 'sem PTT'}` };
    }
  } catch (e) {
    console.warn(`[MediaService] ❌ Estratégia 1 falhou:`, e);
  }

  // Estratégia 2: Se falhou com PTT, tentar SEM PTT
  if (isPtt) {
    console.log(`[MediaService] 📋 Estratégia 2: Tentar SEM PTT`);
    try {
      const result = await socket.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mimeType,
        ptt: false,
      });

      if (result?.key?.id) {
        console.log(`[MediaService] ✅ Estratégia 2 funcionou (sem PTT)! MessageId: ${result.key.id}`);
        return { success: true, messageId: result.key.id, strategy: 'Enviado sem PTT (fallback)' };
      }
    } catch (e) {
      console.warn(`[MediaService] ❌ Estratégia 2 falhou:`, e);
    }
  }

  // Estratégia 3: Tentar com diferentes mimetypes (baseado nos testes do Baileys)
  // audio/mp4 é o padrão usado em E2E tests: https://github.com/WhiskeySockets/Baileys/blob/main/src/__tests__/e2e/send-receive-message.test-e2e.ts#L212
  const mimetypeOptions = ['audio/mp4', 'audio/ogg; codecs=opus', 'audio/mpeg', 'audio/ogg'];
  for (const mt of mimetypeOptions) {
    if (mt === mimeType) continue; // Já tentamos
    
    console.log(`[MediaService] 📋 Estratégia 3: Tentar com mimetype ${mt}`);
    try {
      const result = await socket.sendMessage(jid, {
        audio: audioBuffer,
        mimetype: mt,
        ptt: false,
      });

      if (result?.key?.id) {
        console.log(`[MediaService] ✅ Estratégia 3 funcionou (${mt})! MessageId: ${result.key.id}`);
        return { success: true, messageId: result.key.id, strategy: `Enviado com mimetype ${mt}` };
      }
    } catch (e) {
      console.warn(`[MediaService] ❌ Estratégia 3 falhou com ${mt}:`, e);
    }
  }

  // Estratégia 4: Tentar via URL (alguns cenários de Baileys preferem streaming)
  console.log(`[MediaService] 📋 Estratégia 4: Enviar via URL direta (sem buffer)`);
  try {
    const result = await socket.sendMessage(jid, {
      audio: { url: storageUrl },
      mimetype: mimeType,
      ptt: isPtt,
    });

    if (result?.key?.id) {
      console.log(`[MediaService] ✅ Estratégia 4 funcionou (URL)! MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id, strategy: 'Enviado via URL' };
    }
  } catch (e) {
    console.warn(`[MediaService] ❌ Estratégia 4 falhou (URL):`, e);
  }

  return {
    success: false,
    error: `Todas as estratégias falharam. Validation: ${JSON.stringify(validation)}`,
    strategy: 'Nenhuma estratégia funcionou'
  };
}

// =============================================================================
// AUDIO TRANSCRIPTION
// =============================================================================

/**
 * Transcreve áudio usando Mistral (voxtral-mini-latest)
 * Usado para transcrever áudios recebidos do usuário
 */
export async function transcribeAudio(
  audioUrl: string,
  mimeType: string = 'audio/ogg'
): Promise<string | null> {
  try {
    // Import dinâmico do cliente Mistral
    const { getMistralClient } = await import('./mistralClient');
    const mistral = await getMistralClient();

    if (!mistral) {
      console.error('[MediaService] Mistral client not available for transcription');
      return null;
    }

    // Baixa o áudio
    const audioResponse = await fetch(audioUrl);
    const audioBuffer = await audioResponse.arrayBuffer();
    const base64Audio = Buffer.from(audioBuffer).toString('base64');

    // Chama a API de transcrição do Mistral
    // Modelo: voxtral-mini-latest (ou whisper via OpenAI se preferir)
    const result = await (mistral as any).audio?.transcriptions?.create?.({
      model: process.env.MISTRAL_TRANSCRIPTION_MODEL || 'voxtral-mini-latest',
      file: {
        name: 'audio.ogg',
        type: mimeType,
        data: base64Audio,
      },
    });

    if (result?.text) {
      console.log(`[MediaService] Audio transcribed: ${result.text.substring(0, 100)}...`);
      return result.text;
    }

    return null;
  } catch (error) {
    console.error('[MediaService] Error transcribing audio:', error);
    return null;
  }
}

// =============================================================================
// EXECUTE MEDIA ACTIONS
// =============================================================================

interface ExecuteMediaActionsParams {
  userId: string;
  jid: string; // WhatsApp JID do destinatário
  conversationId: string; // ID da conversa para salvar mensagens
  actions: MistralResponse['actions'];
  socket?: any; // WASocket do Baileys
  wapiConfig?: WApiConfig; // Configuração W-API
}

/**
 * Executa as ações de mídia retornadas pelo Mistral
 * 
 * Suporta enviar múltiplas mídias quando elas compartilham a mesma tag
 * (ex: vídeo + áudio + imagem para "restaurante")
 * 
 * NOVO: Salva as mensagens de mídia no banco de dados e transcreve áudios
 */
export async function executeMediaActions(
  params: ExecuteMediaActionsParams
): Promise<void> {
  const { userId, jid, conversationId, actions, socket, wapiConfig } = params;

  if (!actions || actions.length === 0) {
    return;
  }

  // Agrupar ações por media_name para enviar mídias relacionadas juntas
  const groupedActions = new Map<string, typeof actions>();
  
  for (const action of actions) {
    if (action.type === 'send_media') {
      if (!groupedActions.has(action.media_name)) {
        groupedActions.set(action.media_name, []);
      }
      groupedActions.get(action.media_name)!.push(action);
    }
  }

  // Processa cada grupo de mídias
  for (const [mediaName, mediaActions] of Array.from(groupedActions.entries())) {
    console.log(`📁 [MediaService] Processando mídia: ${mediaName} (${mediaActions.length} ações)`);
    
    // Busca TODAS as mídias com esse nome de diferentes tipos
    // Exemplo: RESTAURANTE pode ter image, video, audio, document
    const allMediasForName = await getMediasByNamePattern(userId, mediaName);
    
    if (allMediasForName.length === 0) {
      console.warn(`[MediaService] Nenhuma mídia encontrada para: ${mediaName} para user ${userId}`);
      continue;
    }

    console.log(`📁 [MediaService] Encontradas ${allMediasForName.length} mídias para "${mediaName}": ${allMediasForName.map(m => `${m.mediaType}(${m.name})`).join(', ')}`);

    // Enviar todas as mídias relacionadas
    for (const media of allMediasForName) {
      try {
        // Delay opcional antes de enviar (com verificação de undefined)
        const delaySeconds = mediaActions[0]?.delay_seconds;
        if (delaySeconds && delaySeconds > 0) {
          console.log(`⏳ [MediaService] Aguardando ${delaySeconds}s antes de enviar ${media.mediaType}...`);
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }

        console.log(`📤 [MediaService] Enviando ${media.mediaType} "${media.name}" para ${jid}...`);

        let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };

        // Tenta enviar via W-API primeiro, depois Baileys
        if (wapiConfig) {
          sendResult = await sendMediaViaWApi(wapiConfig, {
            to: jid.split('@')[0],
            mediaType: media.mediaType as any,
            mediaUrl: media.storageUrl,
            caption: media.mediaType !== 'audio' ? (media.caption || undefined) : undefined,
            fileName: media.fileName || undefined,
            isPtt: media.isPtt !== false, // PTT por padrão para áudio
          });
        } else if (socket) {
          sendResult = await sendMediaViaBaileys(socket, jid, media);
        } else {
          console.error(`[MediaService] ❌ Nenhum transporte disponível para enviar mídia ${media.name}`);
          continue;
        }

        // � CRÍTICO: Registrar messageId para evitar que handleOutgoingMessage pause a IA
        // Quando Baileys envia mídia, dispara evento fromMe:true que pode ser confundido com mensagem manual
        if (sendResult.success && sendResult.messageId) {
          registerAgentMessageId(sendResult.messageId);
        }

        // �📝 SALVAR MENSAGEM DE MÍDIA NO BANCO DE DADOS
        if (sendResult.success && conversationId) {
          try {
            let transcriptionText: string | null = null;
            
            // 🎤 Se for áudio, transcrever para manter contexto na conversa
            if (media.mediaType === 'audio') {
              console.log(`🎤 [MediaService] Transcrevendo áudio enviado "${media.name}"...`);
              
              // Primeiro verificar se já temos transcrição salva na mídia
              if (media.transcription) {
                transcriptionText = media.transcription;
                console.log(`🎤 [MediaService] Usando transcrição existente da mídia`);
              } else {
                // Transcrever o áudio
                try {
                  const audioBuffer = await downloadMediaAsBuffer(media.storageUrl);
                  transcriptionText = await transcribeAudioWithMistral(audioBuffer, {
                    fileName: media.fileName || 'agent-audio.ogg',
                  });
                  
                  if (transcriptionText) {
                    console.log(`🎤 [MediaService] Áudio transcrito: "${transcriptionText.substring(0, 100)}..."`);
                    
                    // Atualizar a mídia com a transcrição para uso futuro
                    await db
                      .update(agentMediaLibrary)
                      .set({ transcription: transcriptionText, updatedAt: new Date() })
                      .where(eq(agentMediaLibrary.id, media.id));
                  }
                } catch (transcribeError) {
                  console.error(`🎤 [MediaService] Erro ao transcrever áudio:`, transcribeError);
                }
              }
            }

            // Gerar texto descritivo da mensagem
            // IMPORTANTE: Usar formato SIMPLES que NÃO confunde a IA quando volta no contexto
            // A IA estava copiando o formato "[Áudio enviado: ...]" na resposta
            // MAS precisamos salvar o NOME da mídia para detectar repetições
            let messageText = '';
            if (media.mediaType === 'audio') {
              // Salvar apenas "*Áudio*" - formato simples que IA não imita
              messageText = '*Áudio*';
            } else if (media.mediaType === 'image') {
              messageText = media.caption || '*Imagem*';
            } else if (media.mediaType === 'video') {
              messageText = media.caption || '*Vídeo*';
            } else if (media.mediaType === 'document') {
              messageText = '*Documento*';
            }

            // Salvar mensagem no banco
            // IMPORTANTE: Salvar o NOME da mídia no media_caption para detectar repetições
            const messageId = sendResult.messageId || `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            
            await db.insert(messages).values({
              conversationId: conversationId,
              messageId: messageId,
              fromMe: true,
              text: messageText,
              timestamp: new Date(),
              status: 'sent',
              isFromAgent: true,
              mediaType: media.mediaType,
              mediaUrl: media.storageUrl,
              mediaMimeType: media.mimeType || undefined,
              mediaDuration: media.durationSeconds || undefined,
              // 🛡️ CRÍTICO: Salvar nome da mídia para detectar repetições
              mediaCaption: `[MEDIA:${media.name}]`,
            });

            console.log(`📝 [MediaService] Mensagem de mídia salva no banco (conversationId: ${conversationId}, type: ${media.mediaType})`);
          } catch (saveError) {
            console.error(`📝 [MediaService] Erro ao salvar mensagem de mídia:`, saveError);
          }
        }

        // Pequeno delay entre envios para não sobrecarregar
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (error) {
        console.error(`[MediaService] ❌ Erro ao enviar ${media.mediaType} "${media.name}":`, error);
      }
    }
  }
}

/**
 * Busca TODAS as mídias que correspondem a um padrão de nome
 * Exemplo: "RESTAURANTE" retorna image/RESTAURANTE + video/RESTAURANTE + audio/RESTAURANTE
 * Se não encontrar, tenta buscar por nome exato como fallback
 */
async function getMediasByNamePattern(userId: string, pattern: string): Promise<AgentMedia[]> {
  try {
    // Primeiro tenta buscar por padrão (todas as mídias com esse nome)
    const medias = await db
      .select()
      .from(agentMediaLibrary)
      .where(
        and(
          eq(agentMediaLibrary.userId, userId),
          or(
            // Match exato do name
            eq(agentMediaLibrary.name, pattern),
            // Match case-insensitive
            sql`LOWER(${agentMediaLibrary.name}) = LOWER(${pattern})`
          )
        )
      );

    if (medias.length > 0) {
      return medias as AgentMedia[];
    }

    // Se não encontrar com padrão, tenta buscar por nome exato (fallback)
    console.warn(`[MediaService] Padrão "${pattern}" não encontrado, tentando busca exata...`);
    const exactMedia = await db
      .select()
      .from(agentMediaLibrary)
      .where(
        and(
          eq(agentMediaLibrary.userId, userId),
          eq(agentMediaLibrary.name, pattern)
        )
      )
      .limit(1);

    return exactMedia as AgentMedia[];
  } catch (error) {
    console.error(`[MediaService] Erro ao buscar mídias para padrão "${pattern}":`, error);
    return [];
  }
}
