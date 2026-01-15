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
import { isNotNull, and, lt, like, or, eq } from "drizzle-orm";

// Configuração
const BUCKET_NAME = "whatsapp-media";
const CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // Rodar a cada 30 minutos
const MEDIA_TTL_HOURS = 1; // Tempo de vida das mídias (1 hora)
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
  console.log(`🗑️ [MEDIA CLEANUP] TTL das mídias: ${MEDIA_TTL_HOURS} hora(s)`);
  console.log(`🗑️ ═══════════════════════════════════════════════════════════════\n`);

  // Executar primeira limpeza após 5 minutos (dar tempo do servidor estabilizar)
  setTimeout(() => {
    void runCleanup();
  }, 5 * 60 * 1000);

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
    // Calcular cutoff (arquivos mais antigos que X horas)
    const cutoffDate = new Date(Date.now() - MEDIA_TTL_HOURS * 60 * 60 * 1000);
    console.log(`🗑️ [MEDIA CLEANUP] Deletando arquivos criados antes de: ${cutoffDate.toISOString()}`);

    // Listar arquivos do bucket whatsapp-media
    const { data: files, error: listError } = await supabase.storage
      .from(BUCKET_NAME)
      .list("", {
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

    console.log(`🎯 [MEDIA CLEANUP] ${oldFiles.length} arquivos com mais de ${MEDIA_TTL_HOURS}h`);

    if (oldFiles.length === 0) {
      console.log(`✅ [MEDIA CLEANUP] Todos os arquivos são recentes, nada para limpar`);
      return stats;
    }

    // Deletar em lotes
    const filePaths = oldFiles.map(f => f.name);
    
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

    const cutoffDate = new Date(Date.now() - MEDIA_TTL_HOURS * 60 * 60 * 1000);
    
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
