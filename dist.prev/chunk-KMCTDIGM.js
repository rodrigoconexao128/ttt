import {
  db
} from "./chunk-FNECUBN2.js";
import {
  systemConfig
} from "./chunk-AL6AHIWW.js";

// server/mistralClient.ts
import { Mistral } from "@mistralai/mistralai";
import { eq } from "drizzle-orm";
var apiKeyCache = null;
var API_KEY_CACHE_TTL_MS = 5 * 60 * 1e3;
function invalidateMistralKeyCache() {
  apiKeyCache = null;
  console.log(`[Mistral] Cache da API key invalidado`);
}
function sanitizeApiKey(key) {
  return key.trim().replace(/[\r\n\t\s]/g, "");
}
async function resolveApiKey() {
  if (apiKeyCache && Date.now() - apiKeyCache.timestamp < API_KEY_CACHE_TTL_MS) {
    return apiKeyCache.key;
  }
  try {
    const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, "mistral_api_key")).limit(1);
    const fromDb = config[0]?.valor;
    if (fromDb && fromDb.length >= 32) {
      const cleanKey = sanitizeApiKey(fromDb);
      console.log(`[Mistral] Using API key from DATABASE (${cleanKey.length} chars)`);
      apiKeyCache = { key: cleanKey, timestamp: Date.now() };
      return cleanKey;
    } else if (fromDb) {
      console.warn(`[Mistral] DB key exists but seems invalid (${fromDb.length} chars), trying environment...`);
    }
  } catch (error) {
    console.warn("[Mistral] Failed to fetch API key from DB, trying environment...");
  }
  if (process.env.MISTRAL_API_KEY) {
    const envKey = sanitizeApiKey(process.env.MISTRAL_API_KEY);
    if (envKey.length >= 32) {
      console.log(`[Mistral] Using API key from ENVIRONMENT (${envKey.length} chars)`);
      apiKeyCache = { key: envKey, timestamp: Date.now() };
      return envKey;
    } else {
      console.warn(`[Mistral] Environment key seems invalid (${envKey.length} chars)`);
    }
  }
  if (globalMockClient) return "mock-key";
  throw new Error("Mistral API Key not configured or invalid (must be at least 32 chars)");
}
var globalMockClient = null;
function setMockMistralClient(mock) {
  globalMockClient = mock;
}
async function getMistralClient() {
  if (globalMockClient) return globalMockClient;
  const apiKey = await resolveApiKey();
  return new Mistral({ apiKey });
}
async function transcribeAudioWithMistral(audioBuffer, options) {
  try {
    const mistral = await getMistralClient();
    const model = options?.model || process.env.MISTRAL_TRANSCRIPTION_MODEL || "voxtral-mini-latest";
    const response = await mistral.audio.transcriptions.complete({
      model,
      file: {
        fileName: options?.fileName || "audio.ogg",
        content: audioBuffer
      },
      language: options?.language ?? void 0
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
async function analyzeImageWithMistral(imageUrl, prompt = "Descreva esta imagem detalhadamente para que eu possa entender o que \xE9 (ex: card\xE1pio, produto, tabela de pre\xE7os, etc).") {
  try {
    if (globalMockClient && globalMockClient.analyzeImageWithMistral) {
      return globalMockClient.analyzeImageWithMistral(imageUrl);
    }
    const mistral = await getMistralClient();
    const model = "pixtral-12b-2409";
    const response = await mistral.chat.complete({
      model,
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: prompt },
            { type: "image_url", imageUrl }
          ]
        }
      ]
    });
    if (!response || !response.choices || response.choices.length === 0) {
      return null;
    }
    return response.choices[0].message.content;
  } catch (error) {
    console.error("Error analyzing image with Mistral:", error);
    return null;
  }
}
async function analyzeImageForAdmin(imageUrl) {
  try {
    if (globalMockClient && globalMockClient.analyzeImageForAdmin) {
      return globalMockClient.analyzeImageForAdmin(imageUrl);
    }
    const mistral = await getMistralClient();
    const model = "pixtral-12b-2409";
    const userPrompt = `Por favor, analise a imagem fornecida e responda em JSON com duas chaves: "summary" (uma etiqueta curta, 2-4 palavras, sem pontua\xE7\xE3o, ex: cardapio, foto_produto, logo) e "description" (uma frase curta descrevendo o conte\xFAdo, em portugu\xEAs). Responda apenas o JSON.`;
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
      temperature: 0
    });
    const raw = response?.choices?.[0]?.message?.content;
    if (!raw || typeof raw !== "string") return null;
    const jsonTextMatch = raw.match(/\{[\s\S]*\}/);
    const jsonText = jsonTextMatch ? jsonTextMatch[0] : raw;
    try {
      const parsed = JSON.parse(jsonText);
      return {
        summary: String(parsed.summary || parsed.tag || "").trim(),
        description: String(parsed.description || parsed.desc || "").trim()
      };
    } catch (e) {
      const description = raw.trim();
      const summary = description.split(/[.,;\n]/)[0].split(" ").slice(0, 3).join("_").toLowerCase();
      return { summary, description };
    }
  } catch (error) {
    console.error("Error analyzing image for admin with Mistral:", error);
    return null;
  }
}
async function classifyMediaWithAI(input) {
  const startTime = Date.now();
  try {
    console.log(`
\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
    console.log(`\u{1F916} [MEDIA AI] Iniciando classifica\xE7\xE3o de m\xEDdia com IA...`);
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [] } = input;
    const availableMedia = mediaLibrary.filter((m) => {
      const alreadySent = sentMedias.some((sent) => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    if (availableMedia.length === 0) {
      console.log(`\u{1F916} [MEDIA AI] \u274C Nenhuma m\xEDdia dispon\xEDvel`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Nenhuma m\xEDdia dispon\xEDvel" };
    }
    const clientMsgCount = conversationHistory.filter((m) => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    const recentHistory = conversationHistory.slice(-10).map((m) => `${m.fromMe ? "Agente" : "Cliente"}: ${m.text || "(sem texto)"}`).join("\n");
    const mediaListForAI = availableMedia.map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || "n\xE3o especificado"}`).join("\n");
    const systemPrompt = `Voc\xEA \xE9 um sistema de classifica\xE7\xE3o de m\xEDdia para um chatbot de WhatsApp.
Sua tarefa \xE9 analisar a conversa e decidir SE e QUAL m\xEDdia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. Se for PRIMEIRA MENSAGEM do cliente (sauda\xE7\xE3o como "oi", "ol\xE1", "bom dia"), procure por m\xEDdia de boas-vindas/in\xEDcio
2. Apenas recomende m\xEDdia se for CLARAMENTE RELEVANTE para o contexto
3. N\xC3O recomende m\xEDdia se o cliente estiver fazendo perguntas espec\xEDficas que n\xE3o precisam de m\xEDdia
4. Leia o campo "QUANDO USAR" de cada m\xEDdia para entender quando \xE9 apropriado enviar
5. Se nenhuma m\xEDdia for claramente apropriada, responda com NO_MEDIA
6. Confian\xE7a deve ser entre 0-100 (apenas envie se > 60)

## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explica\xE7\xE3o breve"}`;
    const userPrompt = `## CONTEXTO:
\xC9 a primeira mensagem do cliente? ${isFirstMessage ? "SIM" : "N\xC3O"}
Mensagem atual do cliente: "${clientMessage}"

## HIST\xD3RICO RECENTE:
${recentHistory || "(primeira intera\xE7\xE3o)"}

## M\xCDDIAS DISPON\xCDVEIS:
${mediaListForAI}

## M\xCDDIAS J\xC1 ENVIADAS (n\xE3o repetir):
${sentMedias.join(", ") || "nenhuma"}

Analise e decida se alguma m\xEDdia deve ser enviada. Responda APENAS o JSON.`;
    const mistral = await getMistralClient();
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1
      // Baixa para decisões mais consistentes
    });
    const elapsedMs = Date.now() - startTime;
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`\u{1F916} [MEDIA AI] \u274C Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Sem resposta da API" };
    }
    const rawResponse = response.choices[0].message.content;
    console.log(`\u{1F916} [MEDIA AI] \u{1F4E5} Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`\u{1F916} [MEDIA AI] \u26A0\uFE0F N\xE3o conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Resposta n\xE3o \xE9 JSON v\xE1lido" };
    }
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const result = {
        shouldSend: parsed.decision === "SEND" && parsed.confidence >= 60,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || "Sem raz\xE3o especificada"
      };
      console.log(`\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
      if (result.shouldSend) {
        console.log(`\u{1F916} [MEDIA AI] \u2705 DECIS\xC3O: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`\u{1F916} [MEDIA AI] \u274C DECIS\xC3O: N\xC3O ENVIAR`);
      }
      console.log(`\u{1F916} [MEDIA AI] \u{1F4CA} Confian\xE7a: ${result.confidence}%`);
      console.log(`\u{1F916} [MEDIA AI] \u{1F4A1} Raz\xE3o: ${result.reason}`);
      console.log(`\u{1F916} [MEDIA AI] \u23F1\uFE0F Tempo: ${elapsedMs}ms`);
      console.log(`\u{1F916} [MEDIA AI] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
      return result;
    } catch (parseError) {
      console.log(`\u{1F916} [MEDIA AI] \u26A0\uFE0F Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: "Erro ao parsear resposta" };
    }
  } catch (error) {
    console.error(`\u{1F916} [MEDIA AI] \u274C ERRO: ${error.message}`);
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}
async function generateWithMistral(systemPrompt, userMessage, options) {
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
      temperature: options?.temperature ?? 0.7
    });
    if (!response || !response.choices || response.choices.length === 0) {
      throw new Error("No response from Mistral");
    }
    return response.choices[0].message.content || "";
  } catch (error) {
    console.error("Error generating text with Mistral:", error);
    throw new Error(`Failed to generate text: ${error.message}`);
  }
}

export {
  invalidateMistralKeyCache,
  resolveApiKey,
  setMockMistralClient,
  getMistralClient,
  transcribeAudioWithMistral,
  analyzeImageWithMistral,
  analyzeImageForAdmin,
  classifyMediaWithAI,
  generateWithMistral
};
