/**
 * 🎤 Serviço de Áudio para Respostas da IA
 * 
 * Gera áudio TTS automaticamente quando o agente responde,
 * respeitando o limite diário de 30 mensagens por cliente.
 */

import { storage } from "./storage";
import { generateWithEdgeTTS } from "./ttsService";
import { messageQueueService } from "./messageQueueService";
import fs from "fs/promises";
import path from "path";

// Mapeamento de vozes
const VOICE_MAP = {
  female: "pt-BR-FranciscaNeural",
  male: "pt-BR-AntonioNeural",
};

// Diretório temporário para arquivos de áudio
const TMP_DIR = path.join(process.cwd(), "tmp", "tts-responses");

// Garantir que o diretório existe
async function ensureTmpDir(): Promise<void> {
  try {
    await fs.mkdir(TMP_DIR, { recursive: true });
  } catch (e) {
    // Ignorar se já existe
  }
}

/**
 * Remove URLs do texto antes de converter em áudio
 * Evita que o TTS fale links longos e sem sentido
 * 
 * Exemplos removidos:
 * - https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e
 * - http://example.com
 * - www.site.com.br
 * 
 * @param text - Texto original
 * @returns Texto sem URLs
 */
function removeUrlsFromText(text: string): string {
  if (!text) return text;

  // Regex para detectar URLs completas (http/https/www)
  // Match: http://, https://, www.
  const urlRegex = /(?:https?:\/\/|www\.)[^\s]+/gi;
  
  // Remover URLs e espaços duplos resultantes
  const cleanedText = text
    .replace(urlRegex, '') // Remove URLs
    .replace(/\s{2,}/g, ' ') // Remove espaços duplos
    .trim(); // Remove espaços nas bordas

  // Log para debug
  if (text !== cleanedText) {
    console.log(`🔗 [TTS-RESPONSE] URLs removidas do texto para áudio`);
    console.log(`   Original: "${text.substring(0, 100)}..."`);
    console.log(`   Limpo: "${cleanedText.substring(0, 100)}..."`);
  }

  return cleanedText;
}

/**
 * Verifica se deve gerar áudio TTS para a resposta da IA
 * @param userId - ID do usuário
 * @returns Configuração de áudio ou null se desabilitado/sem cota
 */
export async function shouldGenerateAudioResponse(userId: string): Promise<{
  shouldGenerate: boolean;
  voice: string;
  speed: string;
  rate: string;
} | null> {
  try {
    // 1. Verificar se o usuário tem TTS habilitado
    const config = await storage.getAudioConfig(userId);
    
    if (!config || !config.isEnabled) {
      console.log(`🔇 [TTS-RESPONSE] Áudio desabilitado para usuário ${userId.substring(0, 8)}...`);
      return null;
    }

    // 2. Verificar se ainda tem cota diária
    const usage = await storage.canSendAudio(userId);
    
    if (!usage.canSend) {
      console.log(`⚠️ [TTS-RESPONSE] Limite diário atingido para usuário ${userId.substring(0, 8)}... (${usage.limit}/${usage.limit})`);
      return null;
    }

    // 3. Preparar configurações
    const voice = VOICE_MAP[config.voiceType as keyof typeof VOICE_MAP] || VOICE_MAP.female;
    const speedNum = parseFloat(config.speed as unknown as string);
    const ratePercent = Math.round((speedNum - 1) * 100);
    const rate = ratePercent >= 0 ? `+${ratePercent}%` : `${ratePercent}%`;

    console.log(`🎤 [TTS-RESPONSE] Áudio habilitado - Voice: ${voice}, Speed: ${speedNum}x, Restante: ${usage.remaining}/${usage.limit}`);

    return {
      shouldGenerate: true,
      voice,
      speed: config.speed as unknown as string,
      rate,
    };
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao verificar config:", error);
    return null;
  }
}

/**
 * Gera áudio TTS da resposta da IA
 * IMPORTANTE: Remove URLs do texto antes de converter
 * @param text - Texto para converter em áudio
 * @param voice - Voz do Edge TTS
 * @param rate - Taxa de velocidade (ex: "+0%", "-20%")
 * @returns Buffer do áudio MP3 ou null se falhar
 */
export async function generateAudioForResponse(
  text: string,
  voice: string,
  rate: string
): Promise<Buffer | null> {
  try {
    // 1. REMOVER URLs do texto (SEMPRE antes de gerar áudio)
    const textWithoutUrls = removeUrlsFromText(text);

    if (!textWithoutUrls || textWithoutUrls.trim().length === 0) {
      console.log(`⚠️ [TTS-RESPONSE] Texto vazio após remover URLs, pulando geração de áudio`);
      return null;
    }

    // 2. Limitar texto muito longo (evitar áudios muito longos)
    const maxLength = 500;
    const trimmedText = textWithoutUrls.length > maxLength 
      ? textWithoutUrls.substring(0, maxLength) + "..." 
      : textWithoutUrls;

    console.log(`🎙️ [TTS-RESPONSE] Gerando áudio para: "${trimmedText.substring(0, 50)}..."`);

    // 3. Gerar áudio com Edge TTS
    const audioBuffer = await generateWithEdgeTTS(trimmedText, voice, rate);

    if (!audioBuffer || audioBuffer.length < 1000) {
      console.error("[TTS-RESPONSE] Áudio gerado muito pequeno ou vazio");
      return null;
    }

    console.log(`✅ [TTS-RESPONSE] Áudio gerado: ${audioBuffer.length} bytes`);
    return audioBuffer;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao gerar áudio:", error);
    return null;
  }
}

/**
 * Envia áudio como mensagem de voz (PTT) via WhatsApp
 * FLUXO OTIMIZADO: Gerar → Salvar temp → Enviar → APAGAR IMEDIATAMENTE
 * Arquivos são sempre apagados, mesmo em caso de erro
 * 
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param audioBuffer - Buffer do áudio MP3
 * @param socket - Socket do WhatsApp
 */
export async function sendAudioAsVoiceMessage(
  userId: string,
  jid: string,
  audioBuffer: Buffer,
  socket: any
): Promise<boolean> {
  let tmpFile: string | null = null;
  
  try {
    await ensureTmpDir();
    
    // Salvar temporariamente - APENAS no sistema de arquivos local (Railway)
    // NÃO usa Supabase Storage para evitar acúmulo de arquivos
    tmpFile = path.join(TMP_DIR, `tts-${Date.now()}-${Math.random().toString(36).substring(7)}.mp3`);
    await fs.writeFile(tmpFile, audioBuffer);

    console.log(`📤 [TTS-RESPONSE] Enviando áudio como mensagem de voz para ${jid} (arquivo: ${tmpFile})`);

    // Enviar como PTT (Push to Talk / Mensagem de voz)
    await socket.sendMessage(jid, {
      audio: { url: tmpFile },
      mimetype: "audio/mpeg",
      ptt: true, // Push-to-talk = aparece como mensagem de voz gravada
    });

    // Incrementar contador de uso
    const counterResult = await storage.incrementAudioMessageCounter(userId);
    console.log(`📊 [TTS-RESPONSE] Contador atualizado: ${counterResult.count}/${counterResult.limit}`);

    console.log(`✅ [TTS-RESPONSE] Áudio enviado com sucesso!`);
    return true;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro ao enviar áudio:", error);
    return false;
  } finally {
    // SEMPRE apagar arquivo temporário, mesmo em caso de erro
    // Isso garante que não fique acumulando arquivos no servidor
    if (tmpFile) {
      try {
        await fs.unlink(tmpFile);
        console.log(`🗑️ [TTS-RESPONSE] Arquivo temporário apagado: ${tmpFile}`);
      } catch (unlinkError) {
        // Ignorar erro ao apagar (arquivo pode já não existir)
        console.warn(`⚠️ [TTS-RESPONSE] Erro ao apagar arquivo temporário:`, unlinkError);
      }
    }
  }
}

/**
 * Processa e envia áudio TTS para uma resposta da IA
 * Esta é a função principal a ser chamada após o agente gerar uma resposta
 * 
 * @param userId - ID do usuário
 * @param jid - JID do destinatário
 * @param responseText - Texto da resposta da IA
 * @param socket - Socket do WhatsApp
 * @returns true se áudio foi enviado, false caso contrário
 */
export async function processAudioResponseForAgent(
  userId: string,
  jid: string,
  responseText: string,
  socket: any
): Promise<boolean> {
  try {
    // 1. Verificar se deve gerar áudio
    const audioConfig = await shouldGenerateAudioResponse(userId);
    
    if (!audioConfig || !audioConfig.shouldGenerate) {
      return false;
    }

    // 2. Gerar áudio
    const audioBuffer = await generateAudioForResponse(
      responseText,
      audioConfig.voice,
      audioConfig.rate
    );

    if (!audioBuffer) {
      console.warn("[TTS-RESPONSE] Falha ao gerar áudio, continuando sem ele");
      return false;
    }

    // 3. Pequeno delay antes de enviar o áudio (mais natural)
    await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 500));

    // 4. Enviar áudio
    const sent = await sendAudioAsVoiceMessage(userId, jid, audioBuffer, socket);

    return sent;
  } catch (error) {
    console.error("[TTS-RESPONSE] Erro no processamento:", error);
    return false;
  }
}

// Limpar arquivos temporários antigos (executar periodicamente)
// OTIMIZAÇÃO: Limpa a cada 5 minutos, remove arquivos > 5 minutos
// Isso garante que não fique acumulando arquivos no Railway
export async function cleanupOldTTSFiles(): Promise<number> {
  try {
    await ensureTmpDir();
    const files = await fs.readdir(TMP_DIR);
    const now = Date.now();
    let cleaned = 0;

    for (const file of files) {
      const filePath = path.join(TMP_DIR, file);
      try {
        const stats = await fs.stat(filePath);
        const ageMinutes = (now - stats.mtime.getTime()) / 1000 / 60;

        // Remover arquivos mais antigos que 5 minutos (bem mais agressivo)
        if (ageMinutes > 5) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch (e) {
        // Arquivo pode ter sido removido por outro processo
      }
    }

    if (cleaned > 0) {
      console.log(`🧹 [TTS-RESPONSE] Limpeza: ${cleaned} arquivos temporários removidos`);
    }

    return cleaned;
  } catch (e) {
    return 0;
  }
}

// Agendar limpeza a cada 5 minutos (mais frequente para não acumular)
setInterval(cleanupOldTTSFiles, 5 * 60 * 1000);

// Executar limpeza imediatamente ao iniciar
cleanupOldTTSFiles();
