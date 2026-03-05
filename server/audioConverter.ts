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

  const normalizedMime = (inputMimeType || '').toLowerCase();

  // Só pular conversão se o CONTAINER já for OGG.
  // Não pode usar "includes('opus')" aqui porque MediaRecorder costuma gerar WebM/Opus
  // (audio/webm;codecs=opus) — e WhatsApp exige OGG/Opus para PTT.
  const isOggContainer =
    normalizedMime.includes('audio/ogg') ||
    normalizedMime.includes('application/ogg') ||
    normalizedMime.startsWith('audio/ogg');
  const isOggDataUrl =
    base64Data.startsWith('data:audio/ogg') ||
    base64Data.startsWith('data:application/ogg');

  if (isOggContainer || isOggDataUrl) {
    console.log('[AudioConverter] ✅ Áudio já está em OGG, sem conversão necessária');
    return { data: base64Data, mimeType: 'audio/ogg; codecs=opus' };
  }

  const tempId = randomUUID();

  const inputExt = normalizedMime.includes('webm')
    ? 'webm'
    : normalizedMime.includes('mpeg') || normalizedMime.includes('mp3')
      ? 'mp3'
      : normalizedMime.includes('mp4')
        ? 'mp4'
        : normalizedMime.includes('wav')
          ? 'wav'
          : normalizedMime.includes('ogg')
            ? 'ogg'
            : 'bin';

  const inputPath = join(tmpdir(), `audio_input_${tempId}.${inputExt}`);
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
    // Baseado na solução do Baileys issue #1833 e #2181:
    // https://github.com/WhiskeySockets/Baileys/issues/1833
    // https://github.com/WhiskeySockets/Baileys/issues/2181
    // -y: sobrescrever output
    // -fflags +genpts: gerar timestamps corretos (importante para WebM gravado)
    // -i: input file
    // -avoid_negative_ts make_zero: evitar timestamps negativos que causam erro no WhatsApp
    // -c:a libopus: usar codec opus
    // -b:a 64k: bitrate de 64kbps (bom para voz)
    // -vbr on: variable bitrate (melhor qualidade)
    // -vn: sem vídeo
    // -ar 48000: sample rate 48kHz (padrão opus para WhatsApp)
    // -ac 1: mono (melhor para voz e menor tamanho)
    // -application voip: otimizado para voz (recomendado para PTT)
    // -f ogg: forçar formato OGG de saída com headers corretos
    const ffmpegCmd = `ffmpeg -y -fflags +genpts -i "${inputPath}" -avoid_negative_ts make_zero -c:a libopus -b:a 64k -vbr on -vn -ar 48000 -ac 1 -application voip -f ogg "${outputPath}"`;
    
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

    // Em caso de erro, NÃO forçar mimeType incorreto.
    // Melhor retornar o original para que o chamador possa falhar corretamente.
    console.log('[AudioConverter] ⚠️ Fallback: usando áudio original sem conversão');
    return { data: base64Data, mimeType: inputMimeType || 'application/octet-stream' };
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
