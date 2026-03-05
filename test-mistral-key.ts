/**
 * Teste rápido da chave Mistral
 * Uso: npx tsx test-mistral-key.ts
 */

import { Mistral } from "@mistralai/mistralai";
import { db } from "./server/db";
import { systemConfig } from "./shared/schema";
import { eq } from "drizzle-orm";
import * as fs from "fs";

async function testMistralKey() {
  const log = (msg: string) => {
    console.log(msg);
    fs.appendFileSync("mistral-test-result.txt", msg + "\n");
  };
  
  fs.writeFileSync("mistral-test-result.txt", "=== TESTE MISTRAL KEY ===\n\n");
  
  log("🔍 Buscando chave Mistral do banco de dados...");
  
  try {
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, "mistral_api_key"))
      .limit(1);
    
    const apiKey = config[0]?.valor;
    
    if (!apiKey) {
      log("❌ Chave Mistral NÃO encontrada no banco!");
      process.exit(1);
    }
    
    // Mostrar primeiros e últimos caracteres (para verificação segura)
    const maskedKey = apiKey.substring(0, 8) + "..." + apiKey.substring(apiKey.length - 4);
    log(`✅ Chave encontrada: ${maskedKey}`);
    log(`   Tamanho: ${apiKey.length} caracteres`);
    
    log("\n🧪 Testando conexão com a API Mistral...");
    
    const mistral = new Mistral({ apiKey });
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: "Responda apenas: OK" }],
      maxTokens: 10,
    });
    
    if (response.choices && response.choices.length > 0) {
      const content = response.choices[0]?.message?.content;
      log(`✅ API funcionando! Resposta: "${content}"`);
      log("🎉 Chave Mistral VÁLIDA e funcionando!");
    } else {
      log("❌ Resposta vazia da API");
    }
    
  } catch (error: any) {
    log("\n❌ ERRO ao testar chave Mistral:");
    log(`   Mensagem: ${error.message}`);
    log(`   Stack: ${error.stack?.substring(0, 500)}`);
    
    if (error.message?.includes("401")) {
      log("\n⚠️  DIAGNÓSTICO: Chave inválida ou expirada!");
      log("   Acesse https://console.mistral.ai/ para gerar uma nova chave.");
    } else if (error.message?.includes("403")) {
      log("\n⚠️  DIAGNÓSTICO: Acesso negado - verifique permissões da chave.");
    }
  }
  
  log("\n=== FIM DO TESTE ===");
  process.exit(0);
}

testMistralKey();
