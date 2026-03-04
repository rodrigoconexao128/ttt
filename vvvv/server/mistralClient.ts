import { Mistral } from "@mistralai/mistralai";
import { db } from "./db";
import { systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

// ============================================================================
// 🚀 CACHE DA API KEY PARA REDUZIR QUERIES NO DB
// ============================================================================
interface ApiKeyCache {
  key: string;
  timestamp: number;
}
let apiKeyCache: ApiKeyCache | null = null;
let openRouterKeyCache: ApiKeyCache | null = null;
const API_KEY_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/**
 * Invalida o cache da API key (usar quando a key for atualizada)
 */
export function invalidateMistralKeyCache(): void {
  apiKeyCache = null;
  openRouterKeyCache = null;
  console.log(`[Mistral] Cache da API key invalidado`);
}

/**
 * Limpa a chave removendo espaços, quebras de linha e caracteres invisíveis
 */
function sanitizeApiKey(key: string): string {
  return key.trim().replace(/[\r\n\t\s]/g, "");
}

export async function resolveApiKey(): Promise<string> {
  // 🚀 CACHE: Verificar se já temos a key em cache
  if (apiKeyCache && (Date.now() - apiKeyCache.timestamp < API_KEY_CACHE_TTL_MS)) {
    return apiKeyCache.key;
  }
  
  // 🔧 PRIORIDADE: Banco de dados PRIMEIRO, depois ambiente
  // Isso permite que o admin altere a chave sem precisar redeploy
  
  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, "mistral_api_key"))
      .limit(1);

    const fromDb = config[0]?.valor;
    if (fromDb && fromDb.length >= 32) {
      const cleanKey = sanitizeApiKey(fromDb);
      console.log(`[Mistral] Using API key from DATABASE (${cleanKey.length} chars)`);
      // 🚀 Salvar no cache
      apiKeyCache = { key: cleanKey, timestamp: Date.now() };
      return cleanKey;
    } else if (fromDb) {
      console.warn(`[Mistral] DB key exists but seems invalid (${fromDb.length} chars), trying environment...`);
    }
  } catch (error) {
    console.warn("[Mistral] Failed to fetch API key from DB, trying environment...");
  }

  // 2. Fallback para variável de ambiente
  if (process.env.MISTRAL_API_KEY) {
    const envKey = sanitizeApiKey(process.env.MISTRAL_API_KEY);
    if (envKey.length >= 32) {
      console.log(`[Mistral] Using API key from ENVIRONMENT (${envKey.length} chars)`);
      // 🚀 Salvar no cache
      apiKeyCache = { key: envKey, timestamp: Date.now() };
      return envKey;
    } else {
      console.warn(`[Mistral] Environment key seems invalid (${envKey.length} chars)`);
    }
  }

  // Allow empty key for testing if mock is set
  if (globalMockClient) return "mock-key";
  
  throw new Error("Mistral API Key not configured or invalid (must be at least 32 chars)");
}

async function resolveConfigValue(key: string): Promise<string | null> {
  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, key))
      .limit(1);

    return config[0]?.valor ? String(config[0].valor) : null;
  } catch {
    return null;
  }
}

async function resolveOpenRouterKey(): Promise<string | null> {
  if (openRouterKeyCache && (Date.now() - openRouterKeyCache.timestamp < API_KEY_CACHE_TTL_MS)) {
    return openRouterKeyCache.key;
  }

  const fromDb = await resolveConfigValue("openrouter_api_key");
  if (fromDb && fromDb.length > 20) {
    const cleanKey = sanitizeApiKey(fromDb);
    openRouterKeyCache = { key: cleanKey, timestamp: Date.now() };
    console.log(`[OpenRouter] Using API key from DATABASE (${cleanKey.length} chars)`);
    return cleanKey;
  }

  if (process.env.OPENROUTER_API_KEY && process.env.OPENROUTER_API_KEY.length > 20) {
    const envKey = sanitizeApiKey(process.env.OPENROUTER_API_KEY);
    openRouterKeyCache = { key: envKey, timestamp: Date.now() };
    console.log(`[OpenRouter] Using API key from ENVIRONMENT (${envKey.length} chars)`);
    return envKey;
  }

  return null;
}

async function analyzeImageWithOpenRouter(imageUrl: string, prompt: string): Promise<string | null> {
  const apiKey = await resolveOpenRouterKey();
  if (!apiKey) {
    return null;
  }

  const candidateModels = [
    "google/gemma-3-4b-it:free",
    "qwen/qwen2.5-vl-72b-instruct:free",
  ];

  for (const model of candidateModels) {
    try {
      console.log(`[OpenRouter] Trying vision fallback with model: ${model}`);

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://agentezap.online",
          "X-Title": "AgenteZap",
        },
        body: JSON.stringify({
          model,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: prompt },
                {
                  type: "image_url",
                  image_url: {
                    url: imageUrl,
                  },
                },
              ],
            },
          ],
          temperature: 0.0,
          max_tokens: 300,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenRouter] Vision fallback failed on ${model}: ${response.status} - ${errorText}`);
        continue;
      }

      const data = await response.json();
      const content = data?.choices?.[0]?.message?.content;
      if (typeof content === "string" && content.trim().length > 0) {
        console.log(`[OpenRouter] Vision fallback succeeded with model: ${model}`);
        return content.trim();
      }
    } catch (error) {
      console.error(`[OpenRouter] Vision fallback exception on ${model}:`, error);
    }
  }

  return null;
}

let globalMockClient: any = null;

export function setMockMistralClient(mock: any) {
  globalMockClient = mock;
}

export async function getMistralClient(): Promise<Mistral> {
  if (globalMockClient) return globalMockClient as unknown as Mistral;
  const apiKey = await resolveApiKey();
  return new Mistral({ apiKey });
}

export async function transcribeAudioWithMistral(
  audioBuffer: Uint8Array,
  options?: { fileName?: string; language?: string; model?: string },
): Promise<string | null> {
  try {
    const mistral = await getMistralClient();

    // 🎤 TRANSCRIÇÃO DE ÁUDIO - Voxtral Mini Transcribe
    // Documentação: https://docs.mistral.ai/capabilities/audio_transcription
    // Modelo: voxtral-mini-latest (via audio/transcriptions endpoint)
    // NÃO confundir com modelos de chat (mistral-small-latest, voxtral-small-latest)
    const model =
      options?.model ||
      process.env.MISTRAL_TRANSCRIPTION_MODEL ||
      "voxtral-mini-latest"; // ✅ Modelo correto para transcrição

    const response = await mistral.audio.transcriptions.complete({
      model,
      file: {
        fileName: options?.fileName || "audio.ogg",
        content: audioBuffer,
      },
      language: options?.language ?? undefined,
    });

    if (!response || typeof response.text !== "string") {
      return null;
    }

    return response.text.trim();
  } catch (error) {
    console.error("Error transcribing audio with Mistral:", error);
    return null;
  }
}

export async function analyzeImageWithMistral(
  imageUrl: string,
  prompt: string = "Descreva esta imagem detalhadamente para que eu possa entender o que é (ex: cardápio, produto, tabela de preços, etc)."
): Promise<string | null> {
  try {
    if (globalMockClient && globalMockClient.analyzeImageWithMistral) {
        return globalMockClient.analyzeImageWithMistral(imageUrl);
    }
    const mistral = await getMistralClient();
    
    // Pixtral (Vision)
    const model = "pixtral-12b-2409";

    const response = await mistral.chat.complete({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", imageUrl: imageUrl }
          ]
        }
      ]
    });

    if (!response || !response.choices || response.choices.length === 0) {
      return null;
    }

    return response.choices[0].message.content as string;
  } catch (error) {
    console.error("Error analyzing image with Mistral:", error);
    return await analyzeImageWithOpenRouter(imageUrl, prompt);
  }
}

// Retorna resumo curto (uma etiqueta) e descrição detalhada para uso na conversa com o admin
export async function analyzeImageForAdmin(
  imageUrl: string
): Promise<{ summary: string; description: string } | null> {
  try {
    if (globalMockClient && globalMockClient.analyzeImageForAdmin) {
        return globalMockClient.analyzeImageForAdmin(imageUrl);
    }
    // Shortcut for data URLs (local base64) to avoid external API call in tests
    // REMOVIDO: O usuário quer que o Vision funcione mesmo em testes locais/base64
    // if (typeof imageUrl === 'string' && imageUrl.startsWith('data:')) {
    //   return { summary: 'imagem_base64', description: 'Imagem enviada via WhatsApp (base64).'};
    // }
    const mistral = await getMistralClient();
    const model = "pixtral-12b-2409";

    // Pedir duas saídas: uma etiqueta curta e uma descrição mais completa
    const userPrompt = `Por favor, analise a imagem fornecida e responda em JSON com duas chaves: ` +
      `"summary" (uma etiqueta curta, 2-4 palavras, sem pontuação, ex: cardapio, foto_produto, logo) e ` +
      `"description" (uma frase curta descrevendo o conteúdo, em português). Responda apenas o JSON.`;

    const response = await mistral.chat.complete({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt },
            { type: "image_url", imageUrl }
          ]
        }
      ],
      maxTokens: 200,
      temperature: 0.0,
    });

    const raw = response?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== 'string') return null;

    // Tentar extrair JSON do texto retornado
    const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
    try {
      const parsed = JSON.parse(jsonText);
      return {
        summary: String(parsed.summary || parsed.tag || '').trim(),
        description: String(parsed.description || parsed.desc || '').trim(),
      };
    } catch (e) {
      // Fallback: usar o texto todo como description e gerar um summary simples
      const description = raw.trim();
      const summary = description.split(/[.,;\n]/)[0].split(' ').slice(0,3).join('_').toLowerCase();
      return { summary, description };
    }
  } catch (error) {
    console.error('Error analyzing image for admin with Mistral:', error);
    const fallbackRaw = await analyzeImageWithOpenRouter(
      imageUrl,
      `Analise a imagem e responda em JSON com {"summary":"etiqueta_curta","description":"frase curta em portugues"}. Responda apenas o JSON.`,
    );
    if (!fallbackRaw) return null;

    const jsonTextMatch = fallbackRaw.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : fallbackRaw;
    try {
      const parsed = JSON.parse(jsonText);
      return {
        summary: String(parsed.summary || parsed.tag || '').trim(),
        description: String(parsed.description || parsed.desc || '').trim(),
      };
    } catch {
      const description = fallbackRaw.trim();
      const summary = description.split(/[.,;\n]/)[0].split(' ').slice(0,3).join('_').toLowerCase();
      return { summary, description };
    }
  }
}

// ==================== MEDIA CLASSIFICATION WITH AI ====================

/**
 * 🎯 CLASSIFICAÇÃO DE MÍDIA COM IA
 * 
 * Esta função usa uma chamada de IA DEDICADA para analisar:
 * 1. A mensagem atual do cliente
 * 2. O histórico recente da conversa
 * 3. A biblioteca de mídias disponíveis (com descrições whenToUse)
 * 
 * E decide de forma INTELIGENTE se deve enviar mídia e qual.
 * 
 * FUNCIONA PARA QUALQUER CONTA - independente de keywords hardcoded!
 */

interface MediaClassificationInput {
  clientMessage: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  mediaLibrary: Array<{ 
    name: string; 
    type: string; 
    whenToUse: string | null;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
}

interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number; // 0-100
  reason: string;
}

export async function classifyMediaWithAI(
  input: MediaClassificationInput
): Promise<MediaClassificationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🤖 [MEDIA AI] ════════════════════════════════════════════════`);
    console.log(`🤖 [MEDIA AI] Iniciando classificação de mídia com IA...`);
    
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [] } = input;
    
    // Filtrar mídias já enviadas e inativas
    const availableMedia = mediaLibrary.filter(m => {
      const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    
    if (availableMedia.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Nenhuma mídia disponível`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' };
    }
    
    // Detectar se é primeira mensagem
    const clientMsgCount = conversationHistory.filter(m => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    
    // Formatar histórico recente (últimas 5 mensagens)
    const recentHistory = conversationHistory
      .slice(-10)
      .map(m => `${m.fromMe ? 'Agente' : 'Cliente'}: ${m.text || '(sem texto)'}`)
      .join('\n');
    
    // Formatar biblioteca de mídia
    const mediaListForAI = availableMedia
      .map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || 'não especificado'}`)
      .join('\n');
    
    // Prompt de classificação
    const systemPrompt = `Você é um sistema de classificação de mídia para um chatbot de WhatsApp.
Sua tarefa é analisar a conversa e decidir SE e QUAL mídia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. Se for PRIMEIRA MENSAGEM do cliente (saudação como "oi", "olá", "bom dia"), procure por mídia de boas-vindas/início
2. Apenas recomende mídia se for CLARAMENTE RELEVANTE para o contexto
3. NÃO recomende mídia se o cliente estiver fazendo perguntas específicas que não precisam de mídia
4. Leia o campo "QUANDO USAR" de cada mídia para entender quando é apropriado enviar
5. Se nenhuma mídia for claramente apropriada, responda com NO_MEDIA
6. Confiança deve ser entre 0-100 (apenas envie se > 60)

## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explicação breve"}`;

    const userPrompt = `## CONTEXTO:
É a primeira mensagem do cliente? ${isFirstMessage ? 'SIM' : 'NÃO'}
Mensagem atual do cliente: "${clientMessage}"

## HISTÓRICO RECENTE:
${recentHistory || '(primeira interação)'}

## MÍDIAS DISPONÍVEIS:
${mediaListForAI}

## MÍDIAS JÁ ENVIADAS (não repetir):
${sentMedias.join(', ') || 'nenhuma'}

Analise e decida se alguma mídia deve ser enviada. Responda APENAS o JSON.`;

    const mistral = await getMistralClient();
    
    // Usar modelo rápido e barato para classificação
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1, // Baixa para decisões mais consistentes
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' };
    }
    
    const rawResponse = response.choices[0].message.content as string;
    console.log(`🤖 [MEDIA AI] 📥 Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    
    // Tentar extrair JSON
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`🤖 [MEDIA AI] ⚠️ Não conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' };
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const result: MediaClassificationResult = {
        shouldSend: parsed.decision === 'SEND' && parsed.confidence >= 60,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || 'Sem razão especificada'
      };
      
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════`);
      if (result.shouldSend) {
        console.log(`🤖 [MEDIA AI] ✅ DECISÃO: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`🤖 [MEDIA AI] ❌ DECISÃO: NÃO ENVIAR`);
      }
      console.log(`🤖 [MEDIA AI] 📊 Confiança: ${result.confidence}%`);
      console.log(`🤖 [MEDIA AI] 💡 Razão: ${result.reason}`);
      console.log(`🤖 [MEDIA AI] ⏱️ Tempo: ${elapsedMs}ms`);
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════\n`);
      
      return result;
    } catch (parseError) {
      console.log(`🤖 [MEDIA AI] ⚠️ Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Erro ao parsear resposta' };
    }
    
  } catch (error: any) {
    console.error(`🤖 [MEDIA AI] ❌ ERRO: ${error.message}`);
    // Em caso de erro, retorna "não enviar" para não quebrar o fluxo
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}

// ==================== TEXT GENERATION ====================

/**
 * Gera texto usando a API Mistral
 * Útil para geração de mensagens, respostas rápidas, etc.
 */
export async function generateWithMistral(
  systemPrompt: string,
  userMessage: string,
  options?: {
    model?: string;
    maxTokens?: number;
    temperature?: number;
  }
): Promise<string> {
  try {
    const mistral = await getMistralClient();
    
    const model = options?.model || "mistral-small-latest";
    
    const response = await mistral.chat.complete({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage }
      ],
      maxTokens: options?.maxTokens || 500,
      temperature: options?.temperature ?? 0.7,
    });
    
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("No response from Mistral");
    }
    
    return (response.choices[0].message.content as string) || "";
  } catch (error: any) {
    console.error("Error generating text with Mistral:", error);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}

