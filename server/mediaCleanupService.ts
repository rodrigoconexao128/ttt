/**
 * 🗑️ MEDIA CLEANUP SERVICE
 * 
 * Serviço de limpeza automática de mídias do Supabase Storage.
 * 
 * ESTRATÉGIA DE ECONOMIA DE EGRESS:
 * - Mídias são armazenadas temporariamente (1 hora por padrão)
 * - Após processamento pela IA (transcrição, visão), são deletadas
 * - Cliente pode re-baixar sob demanda apertando botão
 * - Metadados (tipo, tamanho, nome) são preservados no banco
 * 
 * ECONOMIA ESTIMADA: ~95% do egress de mídias
 * 
 * FLUXO:
 * 1. Mídia chega do WhatsApp → Upload temporário no Storage
 * 2. IA processa (transcreve áudio, analisa imagem)
 * 3. Após 1h → Serviço deleta do Storage
 * 4. Cliente quer ver → Botão re-baixa do WhatsApp (se conectado)
 */

import { supabase } from "./supabaseAuth";
import { db } from "./db";
import { messages } from "@shared/schema";
import { isNotNull, and, lt, like, or, eq, isNull } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";

// Configuração
const BUCKET_NAME = "whatsapp-media";
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000; // Rodar a cada 15 minutos
const MEDIA_TTL_MINUTES = 30; // Tempo de vida das mídias (30 minutos)
const BATCH_SIZE = 100; // Quantos arquivos deletar por lote

interface CleanupStats {
  totalFiles: number;
  deletedFiles: number;
  freedBytes: number;
  errors: number;
  duration: number;
}

// Estado do serviço
let cleanupInterval: NodeJS.Timeout | null = null;
let isRunning = false;

/**
 * Inicia o serviço de limpeza automática
 */
export function startMediaCleanupService(): void {
  if (cleanupInterval) {
    console.log(`⚠️ [MEDIA CLEANUP] Serviço já está rodando`);
    return;
  }

  console.log(`\n🗑️ ═══════════════════════════════════════════════════════════════`);
  console.log(`🗑️ [MEDIA CLEANUP] Iniciando serviço de limpeza automática`);
  console.log(`🗑️ [MEDIA CLEANUP] Intervalo: ${CLEANUP_INTERVAL_MS / 60000} minutos`);
  console.log(`🗑️ [MEDIA CLEANUP] TTL das mídias: ${MEDIA_TTL_MINUTES} minutos`);
  console.log(`🗑️ ═══════════════════════════════════════════════════════════════\n`);

  // 🔥 CRÍTICO: Executar primeira limpeza IMEDIATAMENTE (após 30 segundos)
  setTimeout(() => {
    console.log(`🚀 [MEDIA CLEANUP] Executando primeira limpeza...`);
    void runCleanup();
  }, 30 * 1000); // 30 segundos ao invés de 5 minutos

  // Agendar limpezas periódicas
  cleanupInterval = setInterval(() => {
    void runCleanup();
  }, CLEANUP_INTERVAL_MS);
}

/**
 * Para o serviço de limpeza
 */
export function stopMediaCleanupService(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
    console.log(`🛑 [MEDIA CLEANUP] Serviço parado`);
  }
}

/**
 * Executa uma rodada de limpeza de mídias antigas
 */
export async function runCleanup(): Promise<CleanupStats> {
  if (isRunning) {
    console.log(`⏳ [MEDIA CLEANUP] Limpeza já em andamento, pulando...`);
    return { totalFiles: 0, deletedFiles: 0, freedBytes: 0, errors: 0, duration: 0 };
  }

  isRunning = true;
  const startTime = Date.now();
  
  console.log(`\n🗑️ [MEDIA CLEANUP] Iniciando limpeza de mídias antigas...`);
  
  const stats: CleanupStats = {
    totalFiles: 0,
    deletedFiles: 0,
    freedBytes: 0,
    errors: 0,
    duration: 0,
  };

  try {
    // 🎤 CRÍTICO: Transcrever áudios pendentes ANTES de deletar arquivos
    await transcribePendingAudios();
    
    // Calcular cutoff (arquivos mais antigos que X minutos)
    const cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
    console.log(`🗑️ [MEDIA CLEANUP] Deletando arquivos criados antes de: ${cutoffDate.toISOString()}`);

    // 🔥 CRÍTICO: Listar arquivos dentro da pasta "whatsapp-media"
    // Os arquivos estão em whatsapp-media/1768...ogg, não na raiz!
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list("whatsapp-media", { // ← CORRIGIDO: listar pasta whatsapp-media
        limit: 1000,
        sortBy: { column: "created_at", order: "asc" },
      });

    if (listError) {
      console.error(`❌ [MEDIA CLEANUP] Erro ao listar arquivos:`, listError);
      stats.errors++;
      return stats;
    }

    if (!files || files.length === 0) {
      console.log(`✅ [MEDIA CLEANUP] Nenhum arquivo para limpar`);
      return stats;
    }

    stats.totalFiles = files.length;
    console.log(`📊 [MEDIA CLEANUP] Encontrados ${files.length} arquivos no bucket`);

    // Filtrar arquivos antigos
    // O Supabase retorna created_at como string ISO
    const oldFiles = files.filter(file => {
      if (!file.created_at) return false;
      const fileDate = new Date(file.created_at);
      return fileDate < cutoffDate;
    });

    console.log(`🎯 [MEDIA CLEANUP] ${oldFiles.length} arquivos com mais de ${MEDIA_TTL_MINUTES} minutos`);

    if (oldFiles.length === 0) {
      console.log(`✅ [MEDIA CLEANUP] Todos os arquivos são recentes, nada para limpar`);
      return stats;
    }

    // 🔥 CRÍTICO: Adicionar prefixo "whatsapp-media/" ao caminho dos arquivos
    const filePaths = oldFiles.map(f => `whatsapp-media/${f.name}`);
    
    for (let i = 0; i < filePaths.length; i += BATCH_SIZE) {
      const batch = filePaths.slice(i, i + BATCH_SIZE);
      
      console.log(`🗑️ [MEDIA CLEANUP] Deletando lote ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(filePaths.length / BATCH_SIZE)} (${batch.length} arquivos)...`);
      
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(batch);

      if (deleteError) {
        console.error(`❌ [MEDIA CLEANUP] Erro ao deletar lote:`, deleteError);
        stats.errors++;
      } else {
        stats.deletedFiles += batch.length;
        
        // Estimar bytes liberados (usando metadata se disponível)
        for (const file of oldFiles.slice(i, i + BATCH_SIZE)) {
          if (file.metadata?.size) {
            stats.freedBytes += Number(file.metadata.size);
          }
        }
      }

      // Pequeno delay entre lotes para não sobrecarregar
      if (i + BATCH_SIZE < filePaths.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    }

    // Também limpar arquivos dentro de subpastas (user_id/...)
    await cleanupSubfolders(cutoffDate, stats);

    // Atualizar URLs no banco para indicar que mídia expirou
    await markExpiredMediaInDatabase(cutoffDate);

  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro inesperado:`, error);
    stats.errors++;
  } finally {
    isRunning = false;
    stats.duration = Date.now() - startTime;
    
    console.log(`\n✅ [MEDIA CLEANUP] Limpeza concluída!`);
    console.log(`📊 [MEDIA CLEANUP] Estatísticas:`);
    console.log(`   - Arquivos verificados: ${stats.totalFiles}`);
    console.log(`   - Arquivos deletados: ${stats.deletedFiles}`);
    console.log(`   - Espaço liberado: ${formatBytes(stats.freedBytes)}`);
    console.log(`   - Erros: ${stats.errors}`);
    console.log(`   - Duração: ${stats.duration}ms\n`);
  }

  return stats;
}

/**
 * Limpa arquivos em subpastas (organizados por user_id)
 */
async function cleanupSubfolders(cutoffDate: Date, stats: CleanupStats): Promise<void> {
  try {
    // Listar subpastas (cada user tem uma pasta)
    const { data: folders, error: foldersError } = await supabase.storage
      .from(BUCKET_NAME)
      .list("", {
        limit: 1000,
      });

    if (foldersError || !folders) return;

    // Filtrar apenas pastas (não arquivos)
    const userFolders = folders.filter(f => f.id === null); // Pastas não tem id

    for (const folder of userFolders) {
      if (!folder.name) continue;

      // Listar arquivos dentro da pasta do usuário
      const { data: userFiles, error: userFilesError } = await supabase.storage
        .from(BUCKET_NAME)
        .list(folder.name, {
          limit: 1000,
          sortBy: { column: "created_at", order: "asc" },
        });

      if (userFilesError || !userFiles) continue;

      // Filtrar arquivos antigos
      const oldUserFiles = userFiles.filter(file => {
        if (!file.created_at) return false;
        const fileDate = new Date(file.created_at);
        return fileDate < cutoffDate;
      });

      if (oldUserFiles.length === 0) continue;

      // Deletar arquivos antigos desta pasta
      const filePaths = oldUserFiles.map(f => `${folder.name}/${f.name}`);
      
      console.log(`🗑️ [MEDIA CLEANUP] Deletando ${filePaths.length} arquivos da pasta ${folder.name}...`);
      
      const { error: deleteError } = await supabase.storage
        .from(BUCKET_NAME)
        .remove(filePaths);

      if (deleteError) {
        console.error(`❌ [MEDIA CLEANUP] Erro ao deletar arquivos de ${folder.name}:`, deleteError);
        stats.errors++;
      } else {
        stats.deletedFiles += filePaths.length;
        
        for (const file of oldUserFiles) {
          if (file.metadata?.size) {
            stats.freedBytes += Number(file.metadata.size);
          }
        }
      }
    }
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao limpar subpastas:`, error);
    stats.errors++;
  }
}

/**
 * Marca mensagens com mídia expirada no banco de dados
 * Preserva os metadados mas indica que o arquivo não está mais disponível
 */
async function markExpiredMediaInDatabase(cutoffDate: Date): Promise<void> {
  try {
    // Buscar mensagens com media_url do Storage que são antigas
    const result = await db
      .update(messages)
      .set({
        mediaUrl: null, // Remove URL (arquivo não existe mais)
        // mediaType, mediaMimeType são PRESERVADOS para re-download
      })
      .where(
        and(
          isNotNull(messages.mediaUrl),
          // Apenas URLs do Supabase Storage (não base64)
          or(
            like(messages.mediaUrl, '%supabase.co/storage%'),
            like(messages.mediaUrl, '%/storage/v1/object/%')
          ),
          // Mensagens mais antigas que o cutoff
          lt(messages.createdAt, cutoffDate)
        )
      )
      .returning({ id: messages.id });

    if (result.length > 0) {
      console.log(`📝 [MEDIA CLEANUP] ${result.length} mensagens marcadas como mídia expirada`);
    }
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao atualizar banco:`, error);
  }
}

/**
 * Força limpeza imediata de todas as mídias antigas
 * Útil para chamada manual via API admin
 */
export async function forceCleanup(): Promise<CleanupStats> {
  console.log(`🚀 [MEDIA CLEANUP] Limpeza forçada solicitada!`);
  return runCleanup();
}

/**
 * Retorna estatísticas atuais do storage
 */
export async function getStorageStats(): Promise<{
  totalFiles: number;
  totalSize: string;
  oldFiles: number;
  oldSize: string;
}> {
  try {
    const { data: files } = await supabase.storage
      .from(BUCKET_NAME)
      .list("", { limit: 10000 });

    if (!files) {
      return { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" };
    }

    const cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
    
    let totalSize = 0;
    let oldSize = 0;
    let oldCount = 0;

    for (const file of files) {
      const size = file.metadata?.size ? Number(file.metadata.size) : 0;
      totalSize += size;
      
      if (file.created_at && new Date(file.created_at) < cutoffDate) {
        oldCount++;
        oldSize += size;
      }
    }

    return {
      totalFiles: files.length,
      totalSize: formatBytes(totalSize),
      oldFiles: oldCount,
      oldSize: formatBytes(oldSize),
    };
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao obter estatísticas:`, error);
    return { totalFiles: 0, totalSize: "0 B", oldFiles: 0, oldSize: "0 B" };
  }
}

/**
 * Formata bytes para exibição legível
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}
/**
 * 🎤 TRANSCRIÇÃO PREVENTIVA: Transcreve áudios que ainda não foram transcritos
 * ANTES de expirar a mídia.
 * 
 * Isso garante que:
 * 1. Áudios do CLIENTE são transcritos antes de deletar
 * 2. Áudios do DONO (fromMe=true) também são transcritos
 * 3. A transcrição fica salva mesmo depois da mídia expirar
 */
async function transcribePendingAudios(): Promise<void> {
  try {
    const cutoffDate = new Date(Date.now() - MEDIA_TTL_MINUTES * 60 * 1000);
    
    // Buscar áudios que:
    // 1. Tem mediaUrl (ainda não expirou)
    // 2. Não tem transcrição (text é emoji ou vazio)
    // 3. São mais antigos que cutoff (vão ser deletados em breve)
    const pendingAudios = await db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.mediaType, "audio"),
          isNotNull(messages.mediaUrl),
          // Mensagens que vão expirar em breve
          lt(messages.createdAt, new Date(Date.now() - (MEDIA_TTL_MINUTES - 5) * 60 * 1000))
        )
      )
      .limit(20); // Processar no máximo 20 por vez para não sobrecarregar

    if (pendingAudios.length === 0) {
      return;
    }

    console.log(`🎤 [MEDIA CLEANUP] ${pendingAudios.length} áudios pendentes de transcrição antes de expirar`);

    for (const audio of pendingAudios) {
      // Verificar se já tem transcrição real (não emoji)
      const hasRealTranscription = audio.text && 
        !audio.text.startsWith('🎵') && 
        !audio.text.startsWith('🎤') &&
        !audio.text.startsWith('[Áudio') &&
        audio.text.length > 20; // Transcrições reais tem mais de 20 chars

      if (hasRealTranscription) {
        continue; // Já transcrito
      }

      if (!audio.mediaUrl) {
        continue; // Sem URL
      }

      try {
        console.log(`🎤 [MEDIA CLEANUP] Transcrevendo áudio ${audio.id} antes de expirar...`);
        
        let audioBuffer: Buffer | null = null;

        // Baixar áudio da URL
        if (audio.mediaUrl.startsWith("data:")) {
          const base64Part = audio.mediaUrl.split(",")[1];
          if (base64Part) {
            audioBuffer = Buffer.from(base64Part, "base64");
          }
        } else if (audio.mediaUrl.startsWith("http")) {
          const response = await fetch(audio.mediaUrl);
          if (response.ok) {
            const arrayBuffer = await response.arrayBuffer();
            audioBuffer = Buffer.from(arrayBuffer);
          }
        }

        if (!audioBuffer || audioBuffer.length === 0) {
          console.log(`⚠️ [MEDIA CLEANUP] Não foi possível baixar áudio ${audio.id}`);
          continue;
        }

        // Transcrever com Mistral
        const transcription = await transcribeAudioWithMistral(audioBuffer, {
          fileName: "whatsapp-audio.ogg",
        });

        if (transcription && transcription.length > 0) {
          // Atualizar texto da mensagem com transcrição
          await db
            .update(messages)
            .set({ text: transcription })
            .where(eq(messages.id, audio.id));
          
          console.log(`✅ [MEDIA CLEANUP] Áudio ${audio.id} transcrito: "${transcription.substring(0, 50)}..."`);
        }

        // Delay entre transcrições para não sobrecarregar API
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (error) {
        console.error(`❌ [MEDIA CLEANUP] Erro ao transcrever áudio ${audio.id}:`, error);
      }
    }
  } catch (error) {
    console.error(`❌ [MEDIA CLEANUP] Erro ao buscar áudios pendentes:`, error);
  }
}

/**
 * Força execução imediata de limpeza (usado por endpoint admin)
 */
export async function forceMediaCleanup(): Promise<CleanupStats> {
  console.log(`🚀 [MEDIA CLEANUP] Limpeza FORÇADA iniciada pelo admin`);
  return await runCleanup();
}