// server/ttsService.ts
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { exec } from "child_process";
import { promisify } from "util";
import say from "say";
import * as googleTTS from "google-tts-api";
var execPromise = promisify(exec);
async function generateWithEdgeTTS(text, voice = "pt-BR-FranciscaNeural", rate = "+0%", pitch = "+0Hz") {
  console.log("\u{1F399}\uFE0F [EDGE-TTS] Gerando \xE1udio com Microsoft Edge TTS (CLI Python)...");
  console.log("\u{1F4DD} Texto:", text.substring(0, 80) + (text.length > 80 ? "..." : ""));
  console.log("\u{1F50A} Voz:", voice, "| Rate:", rate, "| Pitch:", pitch);
  try {
    const tmpDir = path.join(process.cwd(), "tmp");
    await fs.mkdir(tmpDir, { recursive: true });
    const tmpFile = path.join(tmpDir, `tts-${Date.now()}.mp3`);
    const escapedText = text.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/'/g, "'\\''").replace(/\$/g, "\\$").replace(/`/g, "\\`");
    const command = `python3 -m edge_tts --voice "${voice}" --rate="${rate}" --pitch="${pitch}" --text "${escapedText}" --write-media "${tmpFile}"`;
    console.log("\u{1F527} [EDGE-TTS] Executando comando Python...");
    console.log("\u{1F4E6} Comando:", command.substring(0, 150) + "...");
    const { stdout, stderr } = await execPromise(command, {
      timeout: 3e4,
      maxBuffer: 10 * 1024 * 1024
      // 10MB buffer
    });
    if (stderr && !stderr.includes("INFO")) {
      console.warn("\u26A0\uFE0F [EDGE-TTS] STDERR:", stderr);
    }
    try {
      await fs.access(tmpFile);
    } catch {
      throw new Error("Arquivo de \xE1udio n\xE3o foi gerado");
    }
    const buffer = await fs.readFile(tmpFile);
    if (!buffer || buffer.length < 1e3) {
      throw new Error(`\xC1udio gerado muito pequeno: ${buffer?.length || 0} bytes`);
    }
    await fs.unlink(tmpFile).catch(() => {
    });
    console.log(`\u2705 [EDGE-TTS] \xC1udio gerado com sucesso: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error("\u274C [EDGE-TTS] Erro completo:", error);
    throw new Error(`Edge TTS falhou: ${error.message}`);
  }
}
async function generateWithPuterTTS(options) {
  const {
    text,
    provider = "aws-polly",
    voice = "Camila",
    // Voz brasileira da AWS Polly
    engine = "neural",
    language = "pt-BR",
    model
  } = options;
  console.log("\u{1F399}\uFE0F [PUTER-TTS] Gerando \xE1udio com Puter.js API...");
  console.log("\u{1F4DD} Texto:", text.substring(0, 80) + (text.length > 80 ? "..." : ""));
  console.log("\u{1F50A} Provider:", provider, "| Voice:", voice, "| Engine:", engine);
  try {
    const puterApiUrl = "https://api.puter.com/ai/txt2speech";
    const requestBody = {
      text: text.substring(0, 3e3)
      // Limite de 3000 caracteres
    };
    if (provider === "aws-polly") {
      requestBody.provider = "aws-polly";
      requestBody.voice = voice;
      requestBody.engine = engine;
      requestBody.language = language;
    } else if (provider === "openai") {
      requestBody.provider = "openai";
      requestBody.model = model || "gpt-4o-mini-tts";
      requestBody.voice = voice || "alloy";
      requestBody.response_format = "mp3";
    } else if (provider === "elevenlabs") {
      requestBody.provider = "elevenlabs";
      requestBody.model = model || "eleven_multilingual_v2";
      requestBody.voice = voice || "21m00Tcm4TlvDq8ikWAM";
    }
    const response = await fetch(puterApiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Accept": "audio/mpeg"
      },
      body: JSON.stringify(requestBody)
    });
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Puter API error: ${response.status} - ${errorText}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    console.log(`\u2705 [PUTER-TTS] \xC1udio gerado: ${buffer.length} bytes`);
    return buffer;
  } catch (error) {
    console.error("\u274C [PUTER-TTS] Erro:", error.message);
    throw error;
  }
}
async function generateWithPuterBrazilian(text) {
  return generateWithPuterTTS({
    text,
    provider: "aws-polly",
    voice: "Camila",
    engine: "neural",
    language: "pt-BR"
  });
}
async function generateWithPuterOpenAI(text, voice = "nova") {
  return generateWithPuterTTS({
    text,
    provider: "openai",
    voice,
    model: "gpt-4o-mini-tts"
  });
}
async function generateWithPuterElevenLabs(text) {
  return generateWithPuterTTS({
    text,
    provider: "elevenlabs",
    model: "eleven_multilingual_v2"
  });
}
var __filename = fileURLToPath(import.meta.url);
var __dirname = path.dirname(__filename);
var TEMP_AUDIO_DIR = path.join(__dirname, "../temp_audio");
async function ensureTempDir() {
  try {
    await fs.mkdir(TEMP_AUDIO_DIR, { recursive: true });
  } catch (error) {
  }
}
async function generateWithWindowsTTS(text, speed = 1) {
  await ensureTempDir();
  const timestamp = Date.now();
  const outputFile = path.join(TEMP_AUDIO_DIR, `windows_tts_${timestamp}.wav`);
  console.log("\u{1F399}\uFE0F [WINDOWS-TTS] Gerando \xE1udio com TTS nativo do Windows...");
  console.log("\u{1F4DD} Texto:", text.substring(0, 80) + (text.length > 80 ? "..." : ""));
  return new Promise((resolve, reject) => {
    say.export(text, null, speed, outputFile, (err) => {
      if (err) {
        console.error("\u274C [WINDOWS-TTS] Erro:", err);
        reject(err);
        return;
      }
      fs.readFile(outputFile).then((buffer) => {
        console.log(`\u2705 [WINDOWS-TTS] \xC1udio gerado: ${buffer.length} bytes`);
        fs.unlink(outputFile).catch(() => {
        });
        resolve(buffer);
      }).catch(reject);
    });
  });
}
async function generateWithGoogleTTS(text, lang = "pt-BR") {
  console.log("\u{1F399}\uFE0F [GOOGLE-TTS] Gerando \xE1udio com Google Translate TTS...");
  console.log("\u{1F4DD} Texto:", text.substring(0, 80) + (text.length > 80 ? "..." : ""));
  const normalizedLang = lang.split("-")[0];
  console.log("\u{1F310} Idioma:", normalizedLang);
  try {
    if (text.length <= 200) {
      const base64 = await googleTTS.getAudioBase64(text, {
        lang: normalizedLang,
        slow: false,
        host: "https://translate.google.com",
        timeout: 1e4
      });
      const buffer = Buffer.from(base64, "base64");
      console.log(`\u2705 [GOOGLE-TTS] \xC1udio gerado: ${buffer.length} bytes`);
      return buffer;
    }
    const results = await googleTTS.getAllAudioBase64(text, {
      lang: normalizedLang,
      slow: false,
      host: "https://translate.google.com",
      timeout: 1e4,
      splitPunct: ".,!?;:"
    });
    const buffers = results.map((r) => Buffer.from(r.base64, "base64"));
    const finalBuffer = Buffer.concat(buffers);
    console.log(`\u2705 [GOOGLE-TTS] \xC1udio gerado (${results.length} partes): ${finalBuffer.length} bytes`);
    return finalBuffer;
  } catch (error) {
    console.error("\u274C [GOOGLE-TTS] Erro:", error.message);
    throw error;
  }
}
async function generateTTS(options) {
  const { text, provider = "auto", speed = 1, lang = "pt-BR" } = options;
  if (!text || text.trim().length === 0) {
    throw new Error("Texto vazio");
  }
  console.log(`
\u{1F3A4} [TTS] Iniciando gera\xE7\xE3o de \xE1udio...`);
  console.log(`\u{1F4CB} Provider: ${provider}`);
  console.log(`\u{1F4DD} Texto (${text.length} chars): "${text.substring(0, 50)}..."`);
  if (provider === "edge") {
    const audio = await generateWithEdgeTTS(text, "pt-BR-FranciscaNeural");
    return { audio, provider: "Edge TTS (Francisca Neural)", format: "mp3" };
  }
  if (provider === "edge-antonio") {
    const audio = await generateWithEdgeTTS(text, "pt-BR-AntonioNeural");
    return { audio, provider: "Edge TTS (Antonio Neural)", format: "mp3" };
  }
  if (provider === "windows") {
    const audio = await generateWithWindowsTTS(text, speed);
    return { audio, provider: "Windows TTS", format: "wav" };
  }
  if (provider === "google") {
    const audio = await generateWithGoogleTTS(text, lang);
    return { audio, provider: "Google TTS", format: "mp3" };
  }
  if (provider === "puter") {
    const audio = await generateWithPuterBrazilian(text);
    return { audio, provider: "Puter (AWS Polly Neural)", format: "mp3" };
  }
  if (provider === "puter-openai") {
    const audio = await generateWithPuterOpenAI(text);
    return { audio, provider: "Puter (OpenAI TTS)", format: "mp3" };
  }
  if (provider === "puter-elevenlabs") {
    const audio = await generateWithPuterElevenLabs(text);
    return { audio, provider: "Puter (ElevenLabs)", format: "mp3" };
  }
  const providers = [
    { name: "Edge TTS (Francisca Neural)", fn: () => generateWithEdgeTTS(text, "pt-BR-FranciscaNeural"), format: "mp3" }
  ];
  let lastError = null;
  for (const prov of providers) {
    try {
      console.log(`\u{1F504} [TTS] Tentando ${prov.name}...`);
      const audio = await prov.fn();
      if (audio && audio.length > 1e3) {
        console.log(`\u2705 [TTS] Sucesso com ${prov.name}! Tamanho: ${audio.length} bytes`);
        return {
          audio,
          provider: prov.name,
          format: prov.format
        };
      } else {
        console.warn(`\u26A0\uFE0F [TTS] ${prov.name} gerou \xE1udio muito pequeno: ${audio?.length || 0} bytes`);
      }
    } catch (error) {
      console.warn(`\u26A0\uFE0F [TTS] ${prov.name} falhou:`, error.message);
      lastError = error;
    }
  }
  throw lastError || new Error("Nenhum provider de TTS conseguiu gerar o \xE1udio");
}
function listWindowsVoices() {
  return new Promise((resolve, reject) => {
    say.getInstalledVoices((err, voices) => {
      if (err) {
        reject(err);
      } else {
        resolve(voices);
      }
    });
  });
}
async function cleanupTempFiles(maxAgeMinutes = 60) {
  try {
    await ensureTempDir();
    const files = await fs.readdir(TEMP_AUDIO_DIR);
    const now = Date.now();
    let deleted = 0;
    for (const file of files) {
      const filePath = path.join(TEMP_AUDIO_DIR, file);
      const stats = await fs.stat(filePath);
      const ageMinutes = (now - stats.mtime.getTime()) / 1e3 / 60;
      if (ageMinutes > maxAgeMinutes) {
        await fs.unlink(filePath);
        deleted++;
      }
    }
    return deleted;
  } catch {
    return 0;
  }
}

export {
  generateWithEdgeTTS,
  generateWithPuterBrazilian,
  generateWithPuterOpenAI,
  generateWithPuterElevenLabs,
  generateWithWindowsTTS,
  generateWithGoogleTTS,
  generateTTS,
  listWindowsVoices,
  cleanupTempFiles
};
