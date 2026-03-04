/**
 * FIX MISTRAL KEY - Diagnóstico e Correção
 * 
 * Este script verifica e corrige problemas com a chave Mistral salva no banco
 */

import { db } from "./server/db";
import { systemConfig } from "./shared/schema";
import { eq } from "drizzle-orm";
import { Mistral } from "@mistralai/mistralai";

async function diagnoseAndFix() {
  console.log("🔍 DIAGNÓSTICO DA CHAVE MISTRAL\n");
  console.log("=".repeat(50));

  try {
    // 1. Buscar chave do banco
    console.log("\n📊 1. Buscando chave no banco de dados...");
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, "mistral_api_key"))
      .limit(1);

    if (!config || config.length === 0) {
      console.log("❌ Chave não encontrada no banco!");
      return;
    }

    const dbKey = config[0].valor;
    console.log(`✅ Chave encontrada no banco`);
    console.log(`   Comprimento: ${dbKey?.length ?? 0} caracteres`);

    if (!dbKey) {
      console.log("❌ Chave está vazia!");
      return;
    }

    // 2. Análise detalhada da chave
    console.log("\n📋 2. Análise detalhada da chave:");
    
    // Verificar espaços
    const hasLeadingSpace = dbKey.startsWith(" ");
    const hasTrailingSpace = dbKey.endsWith(" ");
    const hasNewline = dbKey.includes("\n") || dbKey.includes("\r");
    const hasTab = dbKey.includes("\t");
    
    console.log(`   Espaço no início: ${hasLeadingSpace ? "❌ SIM" : "✅ Não"}`);
    console.log(`   Espaço no final:  ${hasTrailingSpace ? "❌ SIM" : "✅ Não"}`);
    console.log(`   Quebra de linha:  ${hasNewline ? "❌ SIM" : "✅ Não"}`);
    console.log(`   Tab:              ${hasTab ? "❌ SIM" : "✅ Não"}`);

    // Mostrar primeiros e últimos caracteres (escondendo o meio)
    const first4 = dbKey.substring(0, 4);
    const last4 = dbKey.substring(dbKey.length - 4);
    console.log(`   Preview: ${first4}...${last4}`);

    // 3. Limpar a chave
    const cleanKey = dbKey.trim().replace(/[\r\n\t]/g, "");
    const needsClean = cleanKey !== dbKey;
    
    console.log(`\n🧹 3. Chave precisa limpeza: ${needsClean ? "⚠️ SIM" : "✅ Não"}`);
    
    if (needsClean) {
      console.log(`   Comprimento original: ${dbKey.length}`);
      console.log(`   Comprimento limpo:    ${cleanKey.length}`);
    }

    // 4. Testar a chave limpa
    console.log("\n🧪 4. Testando chave...");
    const testKey = cleanKey;
    
    try {
      const mistral = new Mistral({ apiKey: testKey });
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: "Say OK" }],
        maxTokens: 5,
      });
      
      if (response.choices && response.choices.length > 0) {
        console.log("✅ CHAVE FUNCIONANDO!");
        
        // 5. Se precisava limpeza, atualizar no banco
        if (needsClean) {
          console.log("\n🔧 5. Atualizando chave limpa no banco...");
          await db
            .update(systemConfig)
            .set({ valor: cleanKey })
            .where(eq(systemConfig.chave, "mistral_api_key"));
          console.log("✅ Chave atualizada com sucesso!");
        }
      } else {
        console.log("❌ Resposta inválida da API");
      }
    } catch (apiError: any) {
      console.log(`❌ Erro na API: ${apiError.message}`);
      
      if (apiError.message?.includes("401")) {
        console.log("\n⚠️  A chave é INVÁLIDA ou está expirada.");
        console.log("   Por favor, gere uma nova chave em: https://console.mistral.ai/api-keys");
      }
    }

    // 6. Verificar variável de ambiente
    console.log("\n🌍 6. Verificando variável de ambiente:");
    if (process.env.MISTRAL_API_KEY) {
      console.log(`   MISTRAL_API_KEY definida (${process.env.MISTRAL_API_KEY.length} chars)`);
      console.log("   ⚠️  A variável de ambiente tem prioridade sobre o banco!");
    } else {
      console.log("   MISTRAL_API_KEY não definida - usando valor do banco");
    }

  } catch (error) {
    console.error("❌ Erro:", error);
  }

  console.log("\n" + "=".repeat(50));
  console.log("Diagnóstico concluído!\n");
  process.exit(0);
}

diagnoseAndFix();
