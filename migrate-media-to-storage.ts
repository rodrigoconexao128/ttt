/**
 * 🔄 SCRIPT DE MIGRAÇÃO DE MÍDIA BASE64 → SUPABASE STORAGE
 * 
 * Este script migra todas as mídias armazenadas como base64 no banco
 * para o Supabase Storage, reduzindo drasticamente o Egress.
 * 
 * COMO USAR:
 * npx tsx migrate-media-to-storage.ts
 * 
 * IMPORTANTE:
 * - Execute em horário de baixo tráfego
 * - O script processa em lotes para não sobrecarregar
 * - Backup dos dados é recomendado antes de executar
 */

import { supabase } from "./server/supabaseAuth";
import { db } from "./server/db";
import { messages } from "@shared/schema";
import { eq, like, sql, and, isNotNull } from "drizzle-orm";
import { uploadMediaToStorage, isBase64Url } from "./server/mediaStorageService";

const BUCKET_NAME = "whatsapp-media";
const BATCH_SIZE = 50; // Processar 50 mensagens por vez
const DELAY_BETWEEN_BATCHES_MS = 2000; // 2 segundos entre lotes

interface MigrationStats {
  total: number;
  migrated: number;
  failed: number;
  skipped: number;
  bytesSaved: number;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function migrateMessage(message: any): Promise<{ success: boolean; bytesSaved: number }> {
  try {
    const mediaUrl = message.mediaUrl;
    
    if (!mediaUrl || !isBase64Url(mediaUrl)) {
      return { success: true, bytesSaved: 0 }; // Já está ok
    }

    // Extrair dados do base64
    const matches = mediaUrl.match(/^data:([^;]+);base64,(.+)$/);
    if (!matches) {
      console.error(`  ❌ Formato base64 inválido para message ${message.id}`);
      return { success: false, bytesSaved: 0 };
    }

    const [, mimeType, base64Data] = matches;
    const buffer = Buffer.from(base64Data, "base64");
    const originalSize = mediaUrl.length;

    // Descobrir userId via conversation -> connection
    const { data: conversation } = await supabase
      .from("conversations")
      .select("connection_id")
      .eq("id", message.conversationId)
      .single();

    if (!conversation) {
      console.error(`  ❌ Conversa não encontrada: ${message.conversationId}`);
      return { success: false, bytesSaved: 0 };
    }

    const { data: connection } = await supabase
      .from("whatsapp_connections")
      .select("user_id")
      .eq("id", conversation.connection_id)
      .single();

    if (!connection) {
      console.error(`  ❌ Conexão não encontrada: ${conversation.connection_id}`);
      return { success: false, bytesSaved: 0 };
    }

    const userId = connection.user_id;

    // Upload para Storage
    const result = await uploadMediaToStorage(buffer, mimeType, userId, message.conversationId);
    if (!result) {
      console.error(`  ❌ Falha no upload para message ${message.id}`);
      return { success: false, bytesSaved: 0 };
    }

    // Atualizar banco com nova URL
    const { error: updateError } = await supabase
      .from("messages")
      .update({ media_url: result.url })
      .eq("id", message.id);

    if (updateError) {
      console.error(`  ❌ Falha ao atualizar message ${message.id}:`, updateError.message);
      return { success: false, bytesSaved: 0 };
    }

    // Calcular bytes economizados (base64 é ~33% maior que binário)
    const bytesSaved = originalSize - result.url.length;
    console.log(`  ✅ Message ${message.id}: ${(buffer.length/1024).toFixed(1)}KB migrado, ${(bytesSaved/1024).toFixed(1)}KB economizado`);
    
    return { success: true, bytesSaved };
  } catch (error) {
    console.error(`  ❌ Erro ao migrar message ${message.id}:`, error);
    return { success: false, bytesSaved: 0 };
  }
}

async function getMessagesWithBase64(offset: number, limit: number): Promise<any[]> {
  const { data, error } = await supabase
    .from("messages")
    .select("id, conversation_id, media_url, media_type")
    .like("media_url", "data:%")
    .order("created_at", { ascending: true })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("Erro ao buscar mensagens:", error);
    return [];
  }

  return data || [];
}

async function countMessagesWithBase64(): Promise<number> {
  const { count, error } = await supabase
    .from("messages")
    .select("*", { count: "exact", head: true })
    .like("media_url", "data:%");

  if (error) {
    console.error("Erro ao contar mensagens:", error);
    return 0;
  }

  return count || 0;
}

async function runMigration(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════");
  console.log("🔄 MIGRAÇÃO DE MÍDIA BASE64 → SUPABASE STORAGE");
  console.log("═══════════════════════════════════════════════════════════");

  // Contar total de mensagens para migrar
  const totalToMigrate = await countMessagesWithBase64();
  console.log(`\n📊 Total de mensagens com base64: ${totalToMigrate}`);

  if (totalToMigrate === 0) {
    console.log("✅ Nenhuma mensagem para migrar!");
    return;
  }

  const stats: MigrationStats = {
    total: totalToMigrate,
    migrated: 0,
    failed: 0,
    skipped: 0,
    bytesSaved: 0,
  };

  let offset = 0;
  let batchNumber = 0;

  while (offset < totalToMigrate) {
    batchNumber++;
    console.log(`\n📦 Processando lote ${batchNumber} (${offset + 1} - ${Math.min(offset + BATCH_SIZE, totalToMigrate)} de ${totalToMigrate})`);

    const batch = await getMessagesWithBase64(offset, BATCH_SIZE);
    
    if (batch.length === 0) {
      console.log("  Nenhuma mensagem no lote, avançando...");
      offset += BATCH_SIZE;
      continue;
    }

    for (const message of batch) {
      const result = await migrateMessage(message);
      
      if (result.success) {
        if (result.bytesSaved > 0) {
          stats.migrated++;
          stats.bytesSaved += result.bytesSaved;
        } else {
          stats.skipped++;
        }
      } else {
        stats.failed++;
      }
    }

    // Progresso
    const progress = ((offset + batch.length) / totalToMigrate * 100).toFixed(1);
    console.log(`\n📈 Progresso: ${progress}% | Migrados: ${stats.migrated} | Falhas: ${stats.failed} | Economizado: ${(stats.bytesSaved / 1024 / 1024).toFixed(2)} MB`);

    offset += BATCH_SIZE;

    // Delay entre lotes para não sobrecarregar
    if (offset < totalToMigrate) {
      console.log(`⏳ Aguardando ${DELAY_BETWEEN_BATCHES_MS / 1000}s antes do próximo lote...`);
      await sleep(DELAY_BETWEEN_BATCHES_MS);
    }
  }

  console.log("\n═══════════════════════════════════════════════════════════");
  console.log("📊 RESULTADO FINAL DA MIGRAÇÃO");
  console.log("═══════════════════════════════════════════════════════════");
  console.log(`Total processado: ${stats.total}`);
  console.log(`Migrados com sucesso: ${stats.migrated}`);
  console.log(`Já estavam OK: ${stats.skipped}`);
  console.log(`Falhas: ${stats.failed}`);
  console.log(`Espaço economizado: ${(stats.bytesSaved / 1024 / 1024).toFixed(2)} MB`);
  console.log("═══════════════════════════════════════════════════════════");

  if (stats.migrated > 0) {
    console.log("\n⚠️ PRÓXIMO PASSO: Execute VACUUM FULL na tabela messages para liberar espaço:");
    console.log("   VACUUM FULL public.messages;");
    console.log("   REINDEX TABLE public.messages;");
  }
}

// Executar migração
runMigration()
  .then(() => {
    console.log("\n✅ Migração concluída!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Erro fatal na migração:", error);
    process.exit(1);
  });
