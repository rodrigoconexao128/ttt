import "./chunk-KFQGP6VL.js";

// server/audioConverter.ts
import { exec } from "child_process";
import { promisify } from "util";
import { writeFile, unlink, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { randomUUID } from "crypto";
var execAsync = promisify(exec);
async function convertToWhatsAppAudio(base64Data, inputMimeType) {
  const normalizedMime = (inputMimeType || "").toLowerCase();
  const isOggContainer = normalizedMime.includes("audio/ogg") || normalizedMime.includes("application/ogg") || normalizedMime.startsWith("audio/ogg");
  const isOggDataUrl = base64Data.startsWith("data:audio/ogg") || base64Data.startsWith("data:application/ogg");
  if (isOggContainer || isOggDataUrl) {
    console.log("[AudioConverter] \u2705 \xC1udio j\xE1 est\xE1 em OGG, sem convers\xE3o necess\xE1ria");
    return { data: base64Data, mimeType: "audio/ogg; codecs=opus" };
  }
  const tempId = randomUUID();
  const inputExt = normalizedMime.includes("webm") ? "webm" : normalizedMime.includes("mpeg") || normalizedMime.includes("mp3") ? "mp3" : normalizedMime.includes("mp4") ? "mp4" : normalizedMime.includes("wav") ? "wav" : normalizedMime.includes("ogg") ? "ogg" : "bin";
  const inputPath = join(tmpdir(), `audio_input_${tempId}.${inputExt}`);
  const outputPath = join(tmpdir(), `audio_output_${tempId}.ogg`);
  try {
    console.log("[AudioConverter] \u{1F504} Iniciando convers\xE3o de", inputMimeType, "para OGG/Opus");
    let pureBase64 = base64Data;
    if (base64Data.startsWith("data:")) {
      pureBase64 = base64Data.split(",")[1];
    }
    const inputBuffer = Buffer.from(pureBase64, "base64");
    await writeFile(inputPath, inputBuffer);
    console.log("[AudioConverter] \u{1F4DD} Arquivo de entrada criado:", inputBuffer.length, "bytes");
    const ffmpegCmd = `ffmpeg -y -fflags +genpts -i "${inputPath}" -avoid_negative_ts make_zero -c:a libopus -b:a 64k -vbr on -vn -ar 48000 -ac 1 -application voip -f ogg "${outputPath}"`;
    console.log("[AudioConverter] \u{1F3AC} Executando FFmpeg...");
    try {
      await execAsync(ffmpegCmd, { timeout: 3e4 });
    } catch (ffmpegError) {
      console.log("[AudioConverter] \u26A0\uFE0F FFmpeg stderr (pode ser normal):", ffmpegError.stderr?.slice(0, 200));
    }
    const outputBuffer = await readFile(outputPath);
    console.log("[AudioConverter] \u2705 Convers\xE3o conclu\xEDda:", outputBuffer.length, "bytes");
    const outputBase64 = outputBuffer.toString("base64");
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {
        }),
        unlink(outputPath).catch(() => {
        })
      ]);
    } catch {
    }
    return {
      data: outputBase64,
      mimeType: "audio/ogg; codecs=opus"
    };
  } catch (error) {
    console.error("[AudioConverter] \u274C Erro na convers\xE3o:", error.message);
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {
        }),
        unlink(outputPath).catch(() => {
        })
      ]);
    } catch {
    }
    console.log("[AudioConverter] \u26A0\uFE0F Fallback: usando \xE1udio original sem convers\xE3o");
    return { data: base64Data, mimeType: inputMimeType || "application/octet-stream" };
  }
}
async function checkFFmpegAvailable() {
  try {
    await execAsync("ffmpeg -version");
    console.log("[AudioConverter] \u2705 FFmpeg dispon\xEDvel");
    return true;
  } catch {
    console.log("[AudioConverter] \u26A0\uFE0F FFmpeg n\xE3o dispon\xEDvel");
    return false;
  }
}
export {
  checkFFmpegAvailable,
  convertToWhatsAppAudio
};
