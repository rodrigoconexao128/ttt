import { exec } from 'child_process';
import { promisify } from 'util';
import { writeFile, unlink, readFile } from 'fs/promises';
import { join } from 'path';
import { tmpdir } from 'os';
import { randomUUID } from 'crypto';

const execAsync = promisify(exec);

/**
 * Converte áudio Base64 de WebM para OGG/Opus para compatibilidade com WhatsApp PTT
 * @param base64Data - Dados do áudio em base64 (pode ter prefixo data:audio/...)
 * @param inputMimeType - Tipo MIME de entrada (ex: audio/webm;codecs=opus)
 * @returns Base64 do áudio convertido em OGG/Opus
 */
export async function convertToWhatsAppAudio(
  base64Data: string,
  inputMimeType: string
): Promise<{ data: string; mimeType: string }> {
  
  // Se já for OGG/Opus, retorna como está
  if (inputMimeType.includes('ogg') || inputMimeType.includes('opus')) {
    console.log('[AudioConverter] ✅ Áudio já está em formato OGG/Opus, sem conversão necessária');
    return { data: base64Data, mimeType: 'audio/ogg; codecs=opus' };
  }

  const tempId = randomUUID();
  const inputPath = join(tmpdir(), `audio_input_${tempId}.webm`);
  const outputPath = join(tmpdir(), `audio_output_${tempId}.ogg`);

  try {
    console.log('[AudioConverter] 🔄 Iniciando conversão de', inputMimeType, 'para OGG/Opus');

    // Extrair base64 puro (remover prefixo data: se existir)
    let pureBase64 = base64Data;
    if (base64Data.startsWith('data:')) {
      pureBase64 = base64Data.split(',')[1];
    }

    // Escrever arquivo temporário de entrada
    const inputBuffer = Buffer.from(pureBase64, 'base64');
    await writeFile(inputPath, inputBuffer);
    console.log('[AudioConverter] 📝 Arquivo de entrada criado:', inputBuffer.length, 'bytes');

    // Comando FFmpeg para converter para OGG/Opus
    // -y: sobrescrever output
    // -i: input file
    // -c:a libopus: usar codec opus
    // -b:a 64k: bitrate de 64kbps (bom para voz)
    // -vn: sem vídeo
    // -ar 48000: sample rate 48kHz (padrão opus)
    // -ac 1: mono (melhor para voz e menor tamanho)
    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -c:a libopus -b:a 64k -vn -ar 48000 -ac 1 "${outputPath}"`;
    
    console.log('[AudioConverter] 🎬 Executando FFmpeg...');
    
    try {
      await execAsync(ffmpegCmd, { timeout: 30000 }); // 30s timeout
    } catch (ffmpegError: any) {
      // FFmpeg às vezes retorna código de saída não-zero mas ainda funciona
      console.log('[AudioConverter] ⚠️ FFmpeg stderr (pode ser normal):', ffmpegError.stderr?.slice(0, 200));
    }

    // Ler arquivo convertido
    const outputBuffer = await readFile(outputPath);
    console.log('[AudioConverter] ✅ Conversão concluída:', outputBuffer.length, 'bytes');

    // Converter para base64
    const outputBase64 = outputBuffer.toString('base64');

    // Limpar arquivos temporários
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {}),
        unlink(outputPath).catch(() => {})
      ]);
    } catch {
      // Ignorar erros de cleanup
    }

    return {
      data: outputBase64,
      mimeType: 'audio/ogg; codecs=opus'
    };

  } catch (error: any) {
    console.error('[AudioConverter] ❌ Erro na conversão:', error.message);
    
    // Cleanup em caso de erro
    try {
      await Promise.all([
        unlink(inputPath).catch(() => {}),
        unlink(outputPath).catch(() => {})
      ]);
    } catch {
      // Ignorar
    }

    // Em caso de erro, retornar áudio original com mimeType forçado
    // O Baileys pode tentar processar mesmo assim
    console.log('[AudioConverter] ⚠️ Fallback: usando áudio original sem conversão');
    return { data: base64Data, mimeType: 'audio/ogg; codecs=opus' };
  }
}

/**
 * Verifica se FFmpeg está disponível no sistema
 */
export async function checkFFmpegAvailable(): Promise<boolean> {
  try {
    await execAsync('ffmpeg -version');
    console.log('[AudioConverter] ✅ FFmpeg disponível');
    return true;
  } catch {
    console.log('[AudioConverter] ⚠️ FFmpeg não disponível');
    return false;
  }
}
