/**
 * Agent Media Service
 * 
 * Gerencia biblioteca de mídias dos agentes e envio via WhatsApp (w-api ou Baileys).
 * O Mistral decide qual mídia enviar baseado nas descrições no prompt.
 */

import { db } from "./db";
import { agentMediaLibrary, type AgentMedia, type InsertAgentMedia, mistralResponseSchema, type MistralResponse } from "@shared/schema";
import { eq, and, asc, or, sql } from "drizzle-orm";

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
 * O Mistral vai usar essas descrições para decidir quando enviar cada mídia
 * SISTEMA UNIVERSAL - Funciona para QUALQUER tipo de negócio
 */
export function generateMediaPromptBlock(mediaList: AgentMedia[]): string {
  if (!mediaList || mediaList.length === 0) {
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

Você tem as seguintes mídias disponíveis para enviar: ${allMediaNames}

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

Quando o cliente pedir uma mídia, você DEVE:
1. Responder confirmando o envio
2. ADICIONAR A TAG NO FINAL: [ENVIAR_MIDIA:NOME_EXATO_DA_MIDIA]

EXEMPLOS OBRIGATÓRIOS (copie este formato):

CLIENTE: "me manda o catálogo"
SUA RESPOSTA: "Claro! Segue o catálogo. [ENVIAR_MIDIA:CATALOGO_PRODUTOS]"

CLIENTE: "envia o contrato"  
SUA RESPOSTA: "Certo! Segue o contrato em PDF. [ENVIAR_MIDIA:PDF_CONTRATO]"

CLIENTE: "manda um áudio explicando"
SUA RESPOSTA: "Vou te enviar o áudio agora! [ENVIAR_MIDIA:AUDIO_EXPLICACAO]"

CLIENTE: "tem vídeo?"
SUA RESPOSTA: "Tenho sim! Vou enviar. [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]"

CLIENTE: "manda o cardápio"
SUA RESPOSTA: "Aqui está nosso cardápio! [ENVIAR_MIDIA:CARDAPIO]"

═══════════════════════════════════════════════════════════════════════════════
❌ QUANDO NÃO ENVIAR (apenas responda normalmente SEM tag):
═══════════════════════════════════════════════════════════════════════════════
- "Oi", "Bom dia" → responder saudação SEM mídia
- "Obrigado" → responder agradecimento SEM mídia  
- "Qual horário?" → responder pergunta SEM mídia
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
    
    const podeComOutras = (media as any).sendAlone ? '⚠️ ENVIAR SOZINHA (não combinar)' : '✅ Pode combinar com outras';
    
    mediaBlock += `
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
${tipo} → Para enviar use: [ENVIAR_MIDIA:${media.name}]
📝 DESCRIÇÃO: ${media.description || 'Sem descrição'}
🎯 QUANDO USAR: ${media.triggerPhrase || media.whenToUse || 'Quando for relevante ao contexto'}
${podeComOutras}
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

💡 EXEMPLO:
Se o cliente perguntar "como é o restaurante?" e existirem:
- Um VÍDEO com "QUANDO USAR: quando perguntarem do restaurante"
- Um ÁUDIO com "QUANDO USAR: explicar como é o restaurante"  
- Uma IMAGEM com "QUANDO USAR: mostrar o restaurante"

Você deve ENVIAR AS 3 MÍDIAS:
"Vou te mostrar como é nosso restaurante! [ENVIAR_MIDIA:VIDEO] [ENVIAR_MIDIA:AUDIO] [ENVIAR_MIDIA:IMAGEM]"

⚠️ Tags [ENVIAR_MIDIA:NOME] sempre NO FINAL da resposta!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
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
    // Detectar tags [ENVIAR_MIDIA:NOME] no texto
    const mediaTagRegex = /\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/gi;
    
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
    const cleanText = responseText.replace(/\[ENVIAR_MIDIA:[A-Z0-9_]+\]/gi, '').trim();
    
    return {
      messages: [{ type: "text", content: cleanText }],
      actions,
    };
  } catch (error) {
    console.error(`[MediaService] Error parsing Mistral response:`, error);
    // Fallback: trata como texto puro sem ações
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
async function downloadMediaAsBuffer(url: string): Promise<Buffer> {
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
  actions: MistralResponse['actions'];
  socket?: any; // WASocket do Baileys
  wapiConfig?: WApiConfig; // Configuração W-API
}

/**
 * Executa as ações de mídia retornadas pelo Mistral
 * 
 * Suporta enviar múltiplas mídias quando elas compartilham a mesma tag
 * (ex: vídeo + áudio + imagem para "restaurante")
 */
export async function executeMediaActions(
  params: ExecuteMediaActionsParams
): Promise<void> {
  const { userId, jid, actions, socket, wapiConfig } = params;

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

        // Tenta enviar via W-API primeiro, depois Baileys
        if (wapiConfig) {
          await sendMediaViaWApi(wapiConfig, {
            to: jid.split('@')[0],
            mediaType: media.mediaType as any,
            mediaUrl: media.storageUrl,
            caption: media.mediaType !== 'audio' ? (media.caption || undefined) : undefined,
            fileName: media.fileName || undefined,
            isPtt: media.isPtt !== false, // PTT por padrão para áudio
          });
        } else if (socket) {
          await sendMediaViaBaileys(socket, jid, media);
        } else {
          console.error(`[MediaService] ❌ Nenhum transporte disponível para enviar mídia ${media.name}`);
          continue;
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
