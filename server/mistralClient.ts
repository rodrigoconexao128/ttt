import { Mistral } from "@mistralai/mistralai";
import { db } from "./db";
import { systemConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

export async function resolveApiKey(): Promise<string> {
  const config = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, "mistral_api_key"))
    .limit(1);

  const fromDb = config[0]?.valor;
  const fromEnv = process.env.MISTRAL_API_KEY || "";

  const apiKey = fromDb || fromEnv;
  if (!apiKey) {
    throw new Error("Mistral API Key not configured");
  }

  return apiKey;
}

export async function getMistralClient(): Promise<Mistral> {
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

