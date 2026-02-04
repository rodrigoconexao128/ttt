/**
 * Agent Media Service
 * 
 * Gerencia biblioteca de mídias dos agentes e envio via WhatsApp (w-api ou Baileys).
 * O Mistral decide qual mídia enviar baseado nas descrições no prompt.
 * 
 * ⚠️ IMPORTANTE: Todos os envios passam pelo sistema anti-ban centralizado!
 */

import { db } from "./db";
import { agentMediaLibrary, messages, type AgentMedia, type InsertAgentMedia, mistralResponseSchema, type MistralResponse } from "@shared/schema";
import { eq, and, asc, or, sql } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";
import { registerAgentMessageId } from "./whatsapp";
import { messageQueueService } from "./messageQueueService";
import { centralizedMessageSender } from "./centralizedMessageSender";
import { antiBanProtectionService, simulateTyping, ANTI_BAN_CONFIG } from "./antiBanProtectionService";

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

╔══════════════════════════════════════════════════════════════════════════════╗
║  🚨🚨🚨 PRIORIDADE MÁXIMA - SISTEMA DE MÍDIAS 🚨🚨🚨                         ║
║  VOCÊ TEM ARQUIVOS DE ÁUDIO/VÍDEO/IMAGEM PARA ENVIAR!                        ║
║  ENVIAR MÍDIAS É MAIS IMPORTANTE QUE TEXTO LONGO!                            ║
╚══════════════════════════════════════════════════════════════════════════════╝

⚠️⚠️⚠️ INSTRUÇÃO CRÍTICA - LEIA E OBEDEÇA! ⚠️⚠️⚠️

VOCÊ TEM ARQUIVOS PRONTOS PARA ENVIAR! Use-os SEMPRE que aplicável.
Um áudio/vídeo vale mais que mil palavras de texto.

🎯 QUANDO VER UM GATILHO ABAIXO, ENVIE A MÍDIA IMEDIATAMENTE!
🎯 Não fique só falando - ENVIE o arquivo usando a tag!
🎯 A tag DEVE estar na sua resposta: [MEDIA:NOME] ou [ENVIAR_MIDIA:NOME]

📁 SEUS ARQUIVOS DISPONÍVEIS:
`;

  // Lista cada mídia com gatilhos explícitos extraídos do whenToUse
  for (let i = 0; i < activeMedias.length; i++) {
    const media = activeMedias[i];
    const whenToUse = media.whenToUse || 'quando solicitado';
    const mediaType = media.mediaType === 'audio' ? '🎤 ÁUDIO' :
                      media.mediaType === 'video' ? '🎥 VÍDEO' :
                      media.mediaType === 'image' ? '🖼️ IMAGEM' : '📄 DOCUMENTO/PDF';
    
    // Extrair palavras-chave do whenToUse para criar gatilhos explícitos
    const keywordsRaw = whenToUse.toLowerCase()
      .replace(/enviar apenas quando:|não enviar:|quando:/gi, '')
      .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
      .split(/[,\s]+/)
      .filter(k => k.length > 3);
    
    const keywords = [...new Set(keywordsRaw)].slice(0, 8);
    
    mediaBlock += `
┌─────────────────────────────────────────────────────────────────────────────┐
│ ${mediaType}: ${media.name.padEnd(58)}│
├─────────────────────────────────────────────────────────────────────────────┤
│ 🎯 GATILHO: ${whenToUse.substring(0, 60).padEnd(60)}│
│ 🔑 KEYWORDS: ${(keywords.length > 0 ? keywords.join(', ') : media.name.toLowerCase().replace(/_/g, ', ')).substring(0, 58).padEnd(58)}│
│                                                                             │
│ ✅ PARA ENVIAR ESTE ARQUIVO, INCLUA NA SUA RESPOSTA:                        │
│    [MEDIA:${media.name}] ou [ENVIAR_MIDIA:${media.name}]${' '.repeat(Math.max(0, 30 - media.name.length))}│
│                                                                             │
│ 📝 EXEMPLO: "Vou te enviar agora! [MEDIA:${media.name}]"${' '.repeat(Math.max(0, 22 - media.name.length))}│
└─────────────────────────────────────────────────────────────────────────────┘
`;
  }

  mediaBlock += `
╔══════════════════════════════════════════════════════════════════════════════╗
║  🔴🔴🔴 REGRAS OBRIGATÓRIAS - CUMPRA OU O CLIENTE NÃO RECEBE! 🔴🔴🔴        ║
╚══════════════════════════════════════════════════════════════════════════════╝

🔴 REGRA #1 - TAG É OBRIGATÓRIA PARA ENVIAR:
   → Inclua [MEDIA:NOME] ou [ENVIAR_MIDIA:NOME] na sua resposta
   → Sem a tag = arquivo NÃO é enviado = cliente não recebe nada!
   → Dizer "vou enviar" sem a tag = MENTIRA (nada é enviado)

🔴 REGRA #2 - PRIORIZE ENVIAR MÍDIA SOBRE TEXTO:
   → Se o gatilho for detectado, ENVIE A MÍDIA primeiro!
   → Um áudio de 30s explica melhor que 5 parágrafos de texto
   → Cliente prefere receber conteúdo visual/áudio do que ler texto longo

🔴 REGRA #3 - UMA MÍDIA POR VEZ:
   → Envie 1 mídia por resposta (máx 2 se relacionadas)
   → Não bombardeie com vários arquivos

🔴 REGRA #4 - NÃO REPITA MÍDIAS JÁ ENVIADAS:
   → Verifique se já enviou na conversa
   → Se sim, diga "já enviei acima" ou pergunte se recebeu

⚡ FORMATO ACEITO PARA TAGS:
   [MEDIA:NOME_DA_MIDIA]  ← funciona
   [ENVIAR_MIDIA:NOME]    ← funciona
   [MIDIA:NOME]           ← funciona

💡 EXEMPLO DE RESPOSTA CORRETA:
   "Opa! Deixa eu te mostrar como funciona na prática! [MEDIA:VIDEO_DEMO]"

❌ EXEMPLO DE RESPOSTA ERRADA (NÃO FUNCIONA):
   "Vou te enviar um vídeo mostrando..." (FALTA A TAG! NADA É ENVIADO!)

╚══════════════════════════════════════════════════════════════════════════════╝
`;

  return mediaBlock;
}

// =============================================================================
// RESPONSE PARSING
// =============================================================================

/**
 * Parseia a resposta do Mistral e extrai ações de mídia
 * 
 * SUPORTA MÚLTIPLOS FORMATOS DE TAG:
 * - [MEDIA:NOME] - formato simplificado
 * - [ENVIAR_MIDIA:NOME] - formato legacy/antigo
 * - [MIDIA:NOME] - formato alternativo
 * 
 * A IA pode usar qualquer um destes formatos e o sistema detectará corretamente.
 */
export function parseMistralResponse(responseText: string): MistralResponse | null {
  try {
    // 🔥 REGEX UNIFICADO: Aceita TODOS os formatos de tag de mídia
    // [MEDIA:NOME], [ENVIAR_MIDIA:NOME], [MIDIA:NOME]
    const mediaTagRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):([A-Z0-9_]+)\]/gi;
    
    const actions: MistralResponse['actions'] = [];
    let match: RegExpExecArray | null;
    const detectedNames = new Set<string>(); // Evitar duplicatas
    
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
      const tagType = match[1].toUpperCase(); // MEDIA, ENVIAR_MIDIA ou MIDIA
      const mediaName = match[2].toUpperCase();
      
      // Evitar adicionar a mesma mídia duas vezes
      if (!detectedNames.has(mediaName)) {
        detectedNames.add(mediaName);
        actions.push({
          type: 'send_media',
          media_name: mediaName,
        });
        console.log(`📁 [MediaService] Tag de mídia detectada [${tagType}]: ${mediaName}`);
      }
    }
    
    // 🧹 Remover TODAS as variantes de tags do texto final
    const cleanText = responseText
      .replace(/\[(MEDIA|ENVIAR_MIDIA|MIDIA):[A-Z0-9_]+\]/gi, '')
      .replace(/\s{2,}/g, ' ') // Remover espaços duplicados
      .trim();
    
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
// 🚨 FORÇAR ENVIO DE MÍDIA - SISTEMA AUTOMÁTICO COM IA
// =============================================================================
// Este sistema usa uma CHAMADA DE IA DEDICADA para decidir qual mídia enviar.
// Funciona para QUALQUER conta, independente de keywords hardcoded!
// A IA analisa: mensagem, histórico, biblioteca de mídia e campo whenToUse.
// =============================================================================

import { classifyMediaWithLLM } from "./llm";

interface ForceMediaResult {
  shouldSendMedia: boolean;
  mediaToSend: AgentMedia | null;
  matchedKeywords: string[];
  reason: string;
}

/**
 * 🚨 FORÇA o envio de mídia baseado em classificação da IA
 * 
 * NOVA VERSÃO: Usa uma chamada de IA dedicada para decidir qual mídia enviar.
 * 
 * Esta função:
 * 1. Recebe a mensagem do cliente e histórico
 * 2. Chama a IA com a biblioteca de mídias e descrições whenToUse
 * 3. A IA decide de forma INTELIGENTE se deve enviar mídia e qual
 * 
 * VANTAGENS:
 * - Funciona para QUALQUER conta com QUALQUER biblioteca de mídia
 * - Entende semântica, não apenas keywords
 * - Não envia mídia aleatoriamente
 * - Respeita o contexto da conversa
 */
export async function forceMediaDetection(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[],
  sentMedias: string[] = []
): Promise<ForceMediaResult> {
  console.log(`\n🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
  console.log(`🚨 [FORCE MEDIA] Iniciando classificação com IA...`);
  console.log(`🚨 [FORCE MEDIA] Mensagem: "${clientMessage.substring(0, 100)}..."`);
  console.log(`🚨 [FORCE MEDIA] Mídias disponíveis: ${mediaLibrary.length}`);
  console.log(`🚨 [FORCE MEDIA] Mídias já enviadas: ${sentMedias.join(', ') || 'nenhuma'}`);
  
  if (!mediaLibrary || mediaLibrary.length === 0) {
    console.log(`🚨 [FORCE MEDIA] ❌ Nenhuma mídia disponível`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhuma mídia disponível' };
  }
  
  // 🔧 FIX: Filtrar mídias já enviadas ANTES de processar
  const availableMedias = mediaLibrary.filter(m => {
    const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
    return !alreadySent && m.isActive !== false;
  });
  
  if (availableMedias.length === 0) {
    console.log(`🚨 [FORCE MEDIA] ❌ Todas as mídias já foram enviadas`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Todas as mídias já foram enviadas' };
  }
  
  try {
    // Chamar IA para classificação (usa Groq ou Mistral conforme configuração do admin)
    const aiResult = await classifyMediaWithLLM({
      clientMessage,
      conversationHistory,
      mediaLibrary: availableMedias.map(m => ({
        name: m.name,
        type: m.type,
        whenToUse: m.whenToUse,
        isActive: m.isActive
      })),
      sentMedias
    });
    
    if (aiResult.shouldSend && aiResult.mediaName) {
      // Encontrar a mídia correspondente
      const mediaToSend = availableMedias.find(m => 
        m.name.toUpperCase() === aiResult.mediaName!.toUpperCase()
      );
      
      if (mediaToSend) {
        console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
        console.log(`🚨 [FORCE MEDIA] 🏆 IA DECIDIU ENVIAR: ${mediaToSend.name}`);
        console.log(`🚨 [FORCE MEDIA] 📊 Confiança: ${aiResult.confidence}%`);
        console.log(`🚨 [FORCE MEDIA] 💡 Razão: ${aiResult.reason}`);
        console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
        
        return {
          shouldSendMedia: true,
          mediaToSend,
          matchedKeywords: ['IA_DECISION'],
          reason: aiResult.reason
        };
      }
    }
    
    // 🔧 FIX v2: FALLBACK apenas quando IA falhou (JSON inválido, erro, etc)
    // NÃO fazer fallback quando IA decidiu NO_MEDIA com alta confiança
    const aiConfidentlyDecidedNoMedia = 
      !aiResult.shouldSend && 
      aiResult.confidence >= 60 && 
      aiResult.reason && 
      !aiResult.reason.includes('JSON') && 
      !aiResult.reason.includes('Erro');
    
    if (aiConfidentlyDecidedNoMedia) {
      // IA decidiu explicitamente não enviar - respeitar a decisão
      console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
      console.log(`🚨 [FORCE MEDIA] ❌ IA decidiu NÃO enviar mídia`);
      console.log(`🚨 [FORCE MEDIA] 💡 Razão: ${aiResult.reason}`);
      console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
      return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult.reason };
    }
    
    // Fallback: IA não conseguiu decidir (JSON inválido, erro, baixa confiança)
    console.log(`🚨 [FORCE MEDIA] ⚠️ IA não decidiu - tentando FALLBACK por keywords...`);
    const fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
    
    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
      console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
      console.log(`🚨 [FORCE MEDIA] 🔄 FALLBACK FUNCIONOU: ${fallbackResult.mediaToSend.name}`);
      console.log(`🚨 [FORCE MEDIA] 🔑 Keywords: ${fallbackResult.matchedKeywords.join(', ')}`);
      console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
      return fallbackResult;
    }
    
    console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
    console.log(`🚨 [FORCE MEDIA] ❌ Sem mídia para enviar`);
    console.log(`🚨 [FORCE MEDIA] 💡 Razão: ${aiResult.reason || 'Nenhum match'}`);
    console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
    
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: aiResult.reason };
    
  } catch (error: any) {
    console.error(`🚨 [FORCE MEDIA] ❌ ERRO na classificação IA: ${error.message}`);
    
    // 🔧 FIX: FALLBACK por keywords quando IA falha completamente
    console.log(`🚨 [FORCE MEDIA] 🔄 Tentando FALLBACK por keywords após erro...`);
    const fallbackResult = keywordBasedMediaFallback(clientMessage, conversationHistory, availableMedias);
    
    if (fallbackResult.shouldSendMedia && fallbackResult.mediaToSend) {
      console.log(`🚨 [FORCE MEDIA] ✅ FALLBACK SALVOU: ${fallbackResult.mediaToSend.name}`);
      return fallbackResult;
    }
    
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: `Erro: ${error.message}` };
  }
}

/**
 * 🔧 FALLBACK: Sistema de detecção por keywords
 * Usado quando a IA não consegue classificar ou falha
 * Analisa o campo whenToUse de cada mídia e busca keywords na mensagem
 */
function keywordBasedMediaFallback(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[]
): ForceMediaResult {
  const msgLower = clientMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Detectar primeira mensagem (saudação)
  const clientMsgCount = conversationHistory.filter(m => !m.fromMe).length;
  const isFirstMessage = clientMsgCount <= 1;
  const isSaudacao = /^(oi|ola|olá|bom dia|boa tarde|boa noite|eai|e ai|hey|hello|hi)[\s!?.,]*$/i.test(clientMessage.trim());
  
  interface MediaScore {
    media: AgentMedia;
    score: number;
    keywords: string[];
    reason: string;
  }
  
  const mediaScores: MediaScore[] = [];
  
  for (const media of mediaLibrary) {
    let score = 0;
    const matchedKeywords: string[] = [];
    let reason = '';
    
    // Extrair keywords do nome da mídia
    const mediaNameWords = media.name.toLowerCase().replace(/_/g, ' ').split(/\s+/);
    
    // Extrair keywords do whenToUse
    const whenToUse = (media.whenToUse || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    
    // Verificar se é mídia de primeira mensagem/saudação
    const mediaNameLower = media.name.toLowerCase();
    const isWelcomeMedia = /primeira|inicio|comeco|oi|ola|saudacao|boas.?vindas|bem.?vindo|mensagem.?inicio|cliente.?vem.?conversar|welcome|greeting/.test(whenToUse) ||
                          /inicio|welcome|greeting|saudacao|primeira|mensagem.*inicio|cliente.*vem.*conversar/.test(mediaNameLower);
    
    if ((isFirstMessage || isSaudacao) && isWelcomeMedia) {
      score += 100; // 🔧 FIX: Score mais alto para garantir que primeira mensagem tenha prioridade
      matchedKeywords.push('PRIMEIRA_MENSAGEM');
      reason = 'Primeira mensagem do cliente - mídia de boas-vindas';
    }
    
    // Verificar keywords do nome da mídia na mensagem
    for (const word of mediaNameWords) {
      if (word.length > 3 && msgLower.includes(word)) {
        score += 15;
        matchedKeywords.push(word);
      }
    }
    
    // Verificar keywords do whenToUse na mensagem
    const whenToUseWords = whenToUse
      .replace(/enviar apenas quando:|nao enviar:|quando:/gi, '')
      .replace(/quando|se|ou|e|o|a|cliente|solicitar|pedir|enviar|quiser|falar|mencionar|perguntar|sobre|apenas|somente/gi, ' ')
      .split(/[,\s]+/)
      .filter(k => k.length > 3);
    
    for (const word of whenToUseWords) {
      if (msgLower.includes(word)) {
        score += 10;
        if (!matchedKeywords.includes(word)) {
          matchedKeywords.push(word);
        }
      }
    }
    
    // Keywords comuns para tipos de mídia
    const commonKeywords: Record<string, string[]> = {
      'video': ['mostrar', 'ver', 'demonstracao', 'demo', 'como funciona', 'funcionamento'],
      'audio': ['ouvir', 'escutar', 'audio', 'voz'],
      'image': ['foto', 'imagem', 'ver', 'mostra'],
      'document': ['documento', 'pdf', 'arquivo', 'baixar']
    };
    
    const typeKeywords = commonKeywords[media.mediaType] || [];
    for (const kw of typeKeywords) {
      if (msgLower.includes(kw)) {
        score += 5;
        if (!matchedKeywords.includes(kw)) {
          matchedKeywords.push(kw);
        }
      }
    }
    
    if (score > 0) {
      mediaScores.push({
        media,
        score,
        keywords: matchedKeywords,
        reason: reason || `Keywords encontradas: ${matchedKeywords.join(', ')}`
      });
    }
  }
  
  // Ordenar por score e retornar o melhor
  mediaScores.sort((a, b) => b.score - a.score);
  
  if (mediaScores.length > 0 && mediaScores[0].score >= 10) {
    const winner = mediaScores[0];
    return {
      shouldSendMedia: true,
      mediaToSend: winner.media,
      matchedKeywords: winner.keywords,
      reason: `FALLBACK: ${winner.reason} (score: ${winner.score})`
    };
  }
  
  return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhum match significativo (fallback)' };
}

// Manter a versão sync para compatibilidade (usa a função async internamente via wrapper)
// DEPRECATED: Use a versão async diretamente
export function forceMediaDetectionSync(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[],
  sentMedias: string[] = []
): ForceMediaResult {
  console.warn(`⚠️ [FORCE MEDIA] forceMediaDetectionSync está DEPRECATED - use forceMediaDetection (async)`);
  // Retorna resultado vazio para não quebrar código antigo
  return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Use async version' };
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
 * 
 * 🛡️ ANTI-BLOQUEIO: Agora passa pelo sistema de fila para respeitar
 * delay de 5-10s entre mensagens do mesmo WhatsApp
 */
export async function sendMediaViaBaileys(
  socket: any, // WASocket do Baileys
  jid: string,
  media: AgentMedia,
  userId?: string // Para aplicar delay anti-bloqueio
): Promise<{ success: boolean; messageId?: string; error?: string }> {
  try {
    if (!socket) {
      return { success: false, error: 'Socket not connected' };
    }

    // 🛡️ ANTI-BLOQUEIO: Aguardar vez na fila antes de enviar mídia
    if (userId) {
      await messageQueueService.waitForTurn(userId, `mídia ${media.mediaType}: ${media.name}`);
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
          // 🛡️ ANTI-BLOQUEIO: Marcar como enviado após fallback de áudio
          if (userId) {
            messageQueueService.markMediaSent(userId);
          }
          return audioResult;
        } catch (downloadError) {
          // 🛡️ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro
          if (userId) {
            messageQueueService.markMediaSent(userId);
          }
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

    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado para liberar próximo
    if (userId) {
      messageQueueService.markMediaSent(userId);
    }

    if (result?.key?.id) {
      console.log(`[MediaService] ✅ Media sent via Baileys. MessageId: ${result.key.id}`);
      return { success: true, messageId: result.key.id };
    } else {
      console.error(`[MediaService] ❌ No message ID returned from Baileys`);
      return { success: false, error: 'No message ID returned' };
    }
  } catch (error) {
    // 🛡️ ANTI-BLOQUEIO: Marcar como enviado mesmo em erro para liberar fila
    if (userId) {
      messageQueueService.markMediaSent(userId);
    }
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
  
  // 🛡️ Helper para micro-delay entre retries (2-3s para não spammar)
  const microDelay = () => new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
  
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

  // 🛡️ Micro-delay entre retries
  await microDelay();

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
    
    // 🛡️ Micro-delay entre retries
    await microDelay();
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
    
    // 🛡️ Micro-delay entre retries de mimetype
    await microDelay();
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
    // Import dinâmico do cliente LLM
    const { getLLMClient } = await import('./llm');
    const mistral = await getLLMClient();

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

  const urlActions = actions.filter(action => action.type === 'send_media_url') as Array<{
    type: 'send_media_url';
    media_url: string;
    media_type: 'audio' | 'image' | 'video' | 'document';
    caption?: string;
    file_name?: string;
    delay_seconds?: number;
  }>;

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

  // Enviar mídias diretas por URL (sem biblioteca)
  for (const action of urlActions) {
    try {
      if (action.delay_seconds && action.delay_seconds > 0) {
        await new Promise(resolve => setTimeout(resolve, action.delay_seconds * 1000));
      }

      let sendResult: { success: boolean; messageId?: string; error?: string } = { success: false };

      if (wapiConfig) {
        sendResult = await sendMediaViaWApi(wapiConfig, {
          to: jid.split('@')[0],
          mediaType: action.media_type,
          mediaUrl: action.media_url,
          caption: action.caption || undefined,
          fileName: action.file_name || undefined,
          isPtt: action.media_type === 'audio',
        });
      } else if (socket) {
        const payload: Record<string, any> = {};
        if (action.media_type === 'image') {
          payload.image = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
        } else if (action.media_type === 'video') {
          payload.video = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
        } else if (action.media_type === 'document') {
          payload.document = { url: action.media_url };
          if (action.caption) payload.caption = action.caption;
          if (action.file_name) payload.fileName = action.file_name;
        } else if (action.media_type === 'audio') {
          payload.audio = { url: action.media_url };
          payload.ptt = true;
        }

        const result = await socket.sendMessage(jid, payload);
        sendResult = {
          success: true,
          messageId: result?.key?.id,
        };
      }

      if (sendResult.success && sendResult.messageId) {
        registerAgentMessageId(sendResult.messageId);
      }

      if (sendResult.success && conversationId) {
        try {
          const messageId = sendResult.messageId || `media-url-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
          const messageText = action.caption || (action.media_type === 'image' ? '*Imagem*' : '*Mídia*');

          await db.insert(messages).values({
            conversationId,
            messageId,
            fromMe: true,
            text: messageText,
            timestamp: new Date(),
            status: 'sent',
            isFromAgent: true,
            mediaType: action.media_type,
            mediaUrl: action.media_url,
            mediaCaption: '[MEDIA:URL]',
          });
        } catch (saveError) {
          console.error('[MediaService] Erro ao salvar mensagem de mídia URL:', saveError);
        }
      }

      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[MediaService] Erro ao enviar mídia por URL:', error);
    }
  }

  // Processa cada grupo de mídias
  for (const [mediaName, mediaActions] of Array.from(groupedActions.entries())) {
    console.log(`\n📁 [MediaService] ════════════════════════════════════════════════`);
    console.log(`📁 [MediaService] Processando mídia: ${mediaName} (${mediaActions.length} ações)`);
    
    // Busca TODAS as mídias com esse nome de diferentes tipos
    // Exemplo: RESTAURANTE pode ter image, video, audio, document
    const allMediasForName = await getMediasByNamePattern(userId, mediaName);
    
    if (allMediasForName.length === 0) {
      console.error(`📁 [MediaService] ❌ ERRO CRÍTICO: Nenhuma mídia encontrada para: "${mediaName}" (userId: ${userId})`);
      console.error(`📁 [MediaService] 💡 Verifique se a mídia existe no banco de dados`);
      continue;
    }

    console.log(`📁 [MediaService] ✅ Encontradas ${allMediasForName.length} mídias para "${mediaName}":`);
    allMediasForName.forEach(m => {
      console.log(`   - ${m.mediaType}: ${m.name} | URL: ${m.storageUrl?.substring(0, 60)}...`);
    });

    // Enviar todas as mídias relacionadas
    for (const media of allMediasForName) {
      let retryCount = 0;
      const maxRetries = 2;
      let sendSuccess = false;
      
      while (retryCount <= maxRetries && !sendSuccess) {
        try {
          // Delay opcional antes de enviar (com verificação de undefined)
          const delaySeconds = mediaActions[0]?.delay_seconds;
          if (delaySeconds && delaySeconds > 0 && retryCount === 0) {
            console.log(`⏳ [MediaService] Aguardando ${delaySeconds}s antes de enviar ${media.mediaType}...`);
            await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
          }
          
          // Retry delay
          if (retryCount > 0) {
            console.log(`🔄 [MediaService] Retry ${retryCount}/${maxRetries} para ${media.name}...`);
            await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
          }

          console.log(`📤 [MediaService] Enviando ${media.mediaType} "${media.name}" para ${jid}...`);
          
          // Validar URL antes de enviar
          if (!media.storageUrl || media.storageUrl.length < 10) {
            console.error(`📁 [MediaService] ❌ URL inválida para mídia ${media.name}: "${media.storageUrl}"`);
            break; // Não faz retry para URL inválida
          }

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
            sendResult = await sendMediaViaBaileys(socket, jid, media, userId);
          } else {
            console.error(`[MediaService] ❌ Nenhum transporte disponível para enviar mídia ${media.name}`);
            break;
          }

          if (sendResult.success) {
            sendSuccess = true;
            console.log(`📁 [MediaService] ✅ MÍDIA ENVIADA COM SUCESSO: ${media.name}`);
            
            // Registrar messageId para evitar que handleOutgoingMessage pause a IA
            if (sendResult.messageId) {
              registerAgentMessageId(sendResult.messageId);
            }
          } else {
            console.error(`📁 [MediaService] ❌ Falha ao enviar ${media.name}: ${sendResult.error}`);
            retryCount++;
          }
        } catch (error: any) {
          console.error(`📁 [MediaService] ❌ Exceção ao enviar ${media.name}: ${error.message}`);
          retryCount++;
        }
      }
      
      if (!sendSuccess) {
        console.error(`📁 [MediaService] ❌ FALHA DEFINITIVA após ${maxRetries} retries para: ${media.name}`);
      }

      // 📝 SALVAR MENSAGEM DE MÍDIA NO BANCO DE DADOS
      if (sendSuccess && conversationId) {
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
          let messageText = '';
          if (media.mediaType === 'audio') {
            messageText = '*Áudio*';
          } else if (media.mediaType === 'image') {
            messageText = media.caption || '*Imagem*';
          } else if (media.mediaType === 'video') {
            messageText = media.caption || '*Vídeo*';
          } else if (media.mediaType === 'document') {
            messageText = '*Documento*';
          }

          // Salvar mensagem no banco
          const messageId = `media-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
          
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
            mediaCaption: `[MEDIA:${media.name}]`,
          });

          console.log(`📝 [MediaService] Mensagem de mídia salva no banco (conversationId: ${conversationId}, type: ${media.mediaType})`);
        } catch (saveError) {
          console.error(`📝 [MediaService] Erro ao salvar mensagem de mídia:`, saveError);
        }
      }

      // Pequeno delay entre envios para não sobrecarregar
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  
  console.log(`📁 [MediaService] ════════════════════════════════════════════════\n`);
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
