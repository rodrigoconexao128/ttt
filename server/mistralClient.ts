import { Mistral } from "@mistralai/mistralai";
import { db } from "./db";
import { systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

/**
 * Limpa a chave removendo espaços, quebras de linha e caracteres invisíveis
 */
function sanitizeApiKey(key: string): string {
  return key.trim().replace(/[\r\n\t\s]/g, "");
}

export async function resolveApiKey(): Promise<string> {
  // 1. Check environment variable first (avoids DB call if set)
  if (process.env.MISTRAL_API_KEY) {
    const envKey = sanitizeApiKey(process.env.MISTRAL_API_KEY);
    console.log(`[Mistral] Using API key from environment (${envKey.length} chars)`);
    return envKey;
  }

  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, "mistral_api_key"))
      .limit(1);

    const fromDb = config[0]?.valor;
    if (fromDb) {
      const cleanKey = sanitizeApiKey(fromDb);
      console.log(`[Mistral] Using API key from database (${cleanKey.length} chars, original: ${fromDb.length} chars)`);
      return cleanKey;
    }
  } catch (error) {
    console.warn("[Mistral] Failed to fetch API key from DB, falling back to env/mock");
  }

  // Allow empty key for testing if mock is set
  if (globalMockClient) return "mock-key";
  
  throw new Error("Mistral API Key not configured");
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
    return null;
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
    return null;
  }
}

