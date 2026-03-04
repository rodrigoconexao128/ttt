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
 * 🧹 Sanitiza texto para TTS - Remove TUDO que não faz sentido em áudio falado
 * 
 * O Edge TTS (e qualquer TTS) tropeça em:
 * - Emojis (lê o nome Unicode: "rosto sorridente com olhos sorridentes")
 * - Formatação WhatsApp/Markdown (*negrito*, _itálico_, ~tachado~, `código`)
 * - Aspas de todos os tipos (" " ' ' « »)
 * - URLs, e-mails
 * - Símbolos especiais (@, #, $, %, &, =, +, <, >, ^, |)
 * - Separadores visuais (═══, ━━━, ---, ___) 
 * - Caracteres de seta (→, ←, ⇒, ➜)
 * - Caracteres box-drawing e decorativos
 * 
 * O resultado deve ser APENAS texto natural, como se alguém fosse ler em voz alta.
 * 
 * @param text - Texto original com formatação
 * @returns Texto limpo, natural para ser falado
 */
function sanitizeTextForTTS(text: string): string {
  if (!text) return text;

  let cleanedText = text;

  // ═══════════════════════════════════════════
  // 1. REMOVER URLS E E-MAILS
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/(?:https?:\/\/|www\.)[^\s]+/gi, '');
  cleanedText = cleanedText.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '');

  // ═══════════════════════════════════════════
  // 2. REMOVER TODOS OS EMOJIS
  // TTS lê o nome Unicode do emoji, ex: "😊" vira "rosto sorridente"
  // Isso quebra completamente a fala natural
  // ═══════════════════════════════════════════
  
  // Regex abrangente para emojis Unicode (inclui todos os blocos de emoji)
  cleanedText = cleanedText.replace(/[\u{1F600}-\u{1F64F}]/gu, ''); // Emoticons
  cleanedText = cleanedText.replace(/[\u{1F300}-\u{1F5FF}]/gu, ''); // Misc Symbols & Pictographs
  cleanedText = cleanedText.replace(/[\u{1F680}-\u{1F6FF}]/gu, ''); // Transport & Map
  cleanedText = cleanedText.replace(/[\u{1F1E0}-\u{1F1FF}]/gu, ''); // Flags
  cleanedText = cleanedText.replace(/[\u{2600}-\u{26FF}]/gu, '');   // Misc symbols (☀️, ⚡, etc)
  cleanedText = cleanedText.replace(/[\u{2700}-\u{27BF}]/gu, '');   // Dingbats (✅, ❌, ✨, etc)
  cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation Selectors
  cleanedText = cleanedText.replace(/[\u{1F900}-\u{1F9FF}]/gu, ''); // Supplemental Symbols
  cleanedText = cleanedText.replace(/[\u{1FA00}-\u{1FA6F}]/gu, ''); // Chess, extended-A
  cleanedText = cleanedText.replace(/[\u{1FA70}-\u{1FAFF}]/gu, ''); // Symbols extended-A
  cleanedText = cleanedText.replace(/[\u{200D}]/gu, '');            // Zero-width joiner (combina emojis)
  cleanedText = cleanedText.replace(/[\u{20E3}]/gu, '');            // Combining enclosing keycap
  cleanedText = cleanedText.replace(/[\u{E0020}-\u{E007F}]/gu, ''); // Tags (flag sequences)
  cleanedText = cleanedText.replace(/[\u{2300}-\u{23FF}]/gu, '');   // Misc Technical (⏰, ⏳, etc)
  cleanedText = cleanedText.replace(/[\u{2B05}-\u{2B55}]/gu, '');   // Arrows & shapes (⬅️, ⭐, etc)
  cleanedText = cleanedText.replace(/[\u{FE00}-\u{FE0F}]/gu, '');   // Variation selectors
  cleanedText = cleanedText.replace(/[\u{200B}-\u{200F}]/gu, '');   // Zero-width spaces
  cleanedText = cleanedText.replace(/[\u{2028}-\u{2029}]/gu, '');   // Line/paragraph separators

  // ═══════════════════════════════════════════
  // 3. REMOVER FORMATAÇÃO MARKDOWN/WHATSAPP
  // ═══════════════════════════════════════════
  
  // Blocos de código primeiro (podem conter outros marcadores)
  cleanedText = cleanedText.replace(/```[\s\S]*?```/g, '');
  
  // Asteriscos (negrito): *texto* → texto  /  **texto** → texto
  cleanedText = cleanedText.replace(/\*{1,3}([^*]+)\*{1,3}/g, '$1');
  cleanedText = cleanedText.replace(/\*/g, '');

  // Underlines (itálico): _texto_ → texto
  cleanedText = cleanedText.replace(/_+([^_]+)_+/g, '$1');
  cleanedText = cleanedText.replace(/_/g, ' ');

  // Til (tachado): ~texto~ → texto
  cleanedText = cleanedText.replace(/~+([^~]+)~+/g, '$1');
  cleanedText = cleanedText.replace(/~/g, '');

  // Código inline: `código` → código
  cleanedText = cleanedText.replace(/`+([^`]+)`+/g, '$1');
  cleanedText = cleanedText.replace(/`/g, '');

  // ═══════════════════════════════════════════
  // 4. REMOVER ASPAS DE TODOS OS TIPOS
  // TTS pode ler "abre aspas" / "fecha aspas" que soa horrível
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/[""\u201C\u201D\u201E\u201F\u2033\u2036]/g, ''); // Aspas duplas
  cleanedText = cleanedText.replace(/[''\u2018\u2019\u201A\u201B\u2032\u2035]/g, ''); // Aspas simples
  cleanedText = cleanedText.replace(/[«»\u2039\u203A]/g, ''); // Aspas angulares/francesas
  cleanedText = cleanedText.replace(/'/g, '');  // Apóstrofo simples
  cleanedText = cleanedText.replace(/"/g, '');  // Aspas simples ASCII

  // ═══════════════════════════════════════════
  // 5. REMOVER SEPARADORES VISUAIS E LINHAS DECORATIVAS
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/[═━─—–╔╗╚╝╠╣╦╩╬║├┤┬┴┼┌┐└┘│▔▁▂▃▄▅▆▇█▉▊▋▌▍▎▏░▒▓]/g, '');
  cleanedText = cleanedText.replace(/-{3,}/g, '');  // --- ou mais
  cleanedText = cleanedText.replace(/_{3,}/g, '');   // ___ ou mais

  // ═══════════════════════════════════════════
  // 6. REMOVER/SUBSTITUIR SETAS E SÍMBOLOS ESPECIAIS
  // ═══════════════════════════════════════════
  
  // Setas Unicode → remover
  cleanedText = cleanedText.replace(/[→←↑↓↔↕⇒⇐⇑⇓⇔➜➤➡➔➝➞➠►▶◀◁▷◆◇▸▹▻●○•]/g, '');
  
  // Símbolos que TTS pode tentar ler
  cleanedText = cleanedText.replace(/@/g, '');     // arroba
  cleanedText = cleanedText.replace(/#(?!\d)/g, ''); // hashtag (preserva #123 = número)
  cleanedText = cleanedText.replace(/\^/g, '');
  cleanedText = cleanedText.replace(/\|/g, '');
  cleanedText = cleanedText.replace(/[<>]/g, '');
  cleanedText = cleanedText.replace(/[=+]/g, '');
  cleanedText = cleanedText.replace(/&(?!(\w+;))/g, 'e'); // & → "e" (mas preserva &nbsp; etc)
  
  // Colchetes: [texto] → texto
  cleanedText = cleanedText.replace(/\[([^\]]*)\]/g, '$1');
  
  // Chaves: {texto} → texto
  cleanedText = cleanedText.replace(/\{([^}]*)\}/g, '$1');

  // Parênteses: manter se contêm texto curto, remover se vazios ou decorativos
  cleanedText = cleanedText.replace(/\(\s*\)/g, ''); // () vazio
  cleanedText = cleanedText.replace(/\(\(([^)]*)\)\)/g, '$1'); // ((texto)) → texto

  // ═══════════════════════════════════════════
  // 7. SUBSTITUIÇÕES INTELIGENTES (R$, %, etc)
  // ═══════════════════════════════════════════
  
  // R$ 100 → 100 reais (TTS já lê "R$" como "reais" geralmente, mas melhor garantir)
  cleanedText = cleanedText.replace(/R\$\s*(\d)/g, '$1');
  
  // Citação Markdown: > texto → texto  
  cleanedText = cleanedText.replace(/^>\s*/gm, '');
  
  // Bullets e marcadores no início de linhas
  cleanedText = cleanedText.replace(/^[-•]\s*/gm, '');
  
  // Hashtags como cabeçalho: ## Título → Título
  cleanedText = cleanedText.replace(/^#+\s+/gm, '');

  // ═══════════════════════════════════════════
  // 8. LIMPAR PONTUAÇÃO EXCESSIVA
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\.{4,}/g, '...');   // ...... → ...
  cleanedText = cleanedText.replace(/!{2,}/g, '!');       // !!!!! → !
  cleanedText = cleanedText.replace(/\?{2,}/g, '?');      // ????? → ?
  cleanedText = cleanedText.replace(/,{2,}/g, ',');        // ,,,, → ,
  cleanedText = cleanedText.replace(/;{2,}/g, ';');        // ;;;; → ;
  cleanedText = cleanedText.replace(/:{2,}/g, ':');        // :::: → :

  // ═══════════════════════════════════════════
  // 9. LIMPAR ESCAPE CHARACTERS E HTML ENTITIES
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\\[nrtfvb]/g, ' ');
  cleanedText = cleanedText.replace(/\\/g, '');
  cleanedText = cleanedText.replace(/&nbsp;/gi, ' ');
  cleanedText = cleanedText.replace(/&amp;/gi, 'e');
  cleanedText = cleanedText.replace(/&lt;/gi, '');
  cleanedText = cleanedText.replace(/&gt;/gi, '');
  cleanedText = cleanedText.replace(/&quot;/gi, '');
  cleanedText = cleanedText.replace(/&#\d+;/g, '');       // &#123; entities numéricas
  cleanedText = cleanedText.replace(/&\w+;/g, '');         // Qualquer entity restante

  // ═══════════════════════════════════════════
  // 10. NORMALIZAR ESPAÇOS E QUEBRAS DE LINHA
  // ═══════════════════════════════════════════
  cleanedText = cleanedText.replace(/\n{3,}/g, '\n\n');   // Max 2 quebras de linha
  cleanedText = cleanedText.replace(/[ \t]{2,}/g, ' ');   // Espaços múltiplos → um
  cleanedText = cleanedText.replace(/\s+([.,!?;:])/g, '$1'); // Espaço antes de pontuação
  cleanedText = cleanedText.replace(/^\s+$/gm, '');        // Linhas só com espaço
  cleanedText = cleanedText.trim();

  // ═══════════════════════════════════════════
  // 11. LOG PARA DEBUG
  // ═══════════════════════════════════════════
  if (text.length !== cleanedText.length) {
    const removed = text.length - cleanedText.length;
    console.log(`[TTS-SANITIZE] Texto sanitizado para audio:`);
    console.log(`   Original (${text.length} chars): "${text.substring(0, 80)}..."`);
    console.log(`   Limpo (${cleanedText.length} chars): "${cleanedText.substring(0, 80)}..."`);
    console.log(`   Removidos: ${removed} caracteres de formatacao`);
  }

  return cleanedText;
}

/**
 * @deprecated Use sanitizeTextForTTS() - mantido para compatibilidade
 */
function removeUrlsFromText(text: string): string {
  return sanitizeTextForTTS(text);
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
 * IMPORTANTE: Sanitiza texto (remove URLs, formatação, etc) antes de converter
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
    // 1. SANITIZAR TEXTO COMPLETAMENTE (URLs, formatação, símbolos especiais)
    const sanitizedText = sanitizeTextForTTS(text);

    if (!sanitizedText || sanitizedText.trim().length === 0) {
      console.log(`⚠️ [TTS-RESPONSE] Texto vazio após sanitização, pulando geração de áudio`);
      return null;
    }

    // 2. Limitar texto muito longo (evitar áudios muito longos)
    const maxLength = 500;
    const trimmedText = sanitizedText.length > maxLength 
      ? sanitizedText.substring(0, maxLength) + "..." 
      : sanitizedText;

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
