/**
 * Debug completo do fluxo de resolução da chave Mistral
 */

import { Mistral } from "@mistralai/mistralai";

async function debugMistralFlow() {
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("🔍 DEBUG: Fluxo de Resolução da Chave Mistral");
  console.log("═══════════════════════════════════════════════════════════════════════\n");
  
  // 1. Verificar variável de ambiente
  console.log("1️⃣ VARIÁVEL DE AMBIENTE:");
  const envKey = process.env.MISTRAL_API_KEY;
  if (envKey) {
    console.log(`   ✅ MISTRAL_API_KEY definida: ${envKey.substring(0, 8)}...${envKey.substring(envKey.length - 4)}`);
    console.log(`   Tamanho: ${envKey.length} caracteres`);
  } else {
    console.log("   ❌ MISTRAL_API_KEY NÃO está definida no ambiente");
  }
  
  // 2. Tentar conectar ao banco
  console.log("\n2️⃣ BANCO DE DADOS:");
  let dbKey: string | null = null;
  try {
    // Importar dinamicamente para evitar erro se DB não estiver acessível
    const { db } = await import("./server/db");
    const { systemConfig } = await import("./shared/schema");
    const { eq } = await import("drizzle-orm");
    
    const config = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, "mistral_api_key"))
      .limit(1);
    
    dbKey = config[0]?.valor || null;
    
    if (dbKey) {
      console.log(`   ✅ Chave no DB: ${dbKey.substring(0, 8)}...${dbKey.substring(dbKey.length - 4)}`);
      console.log(`   Tamanho: ${dbKey.length} caracteres`);
    } else {
      console.log("   ❌ Chave NÃO encontrada no banco de dados");
    }
  } catch (error: any) {
    console.log(`   ⚠️ Erro ao acessar banco: ${error.message}`);
  }
  
  // 3. Qual chave será usada?
  console.log("\n3️⃣ CHAVE QUE SERÁ USADA:");
  const finalKey = envKey || dbKey;
  if (finalKey) {
    console.log(`   🔑 ${finalKey.substring(0, 8)}...${finalKey.substring(finalKey.length - 4)}`);
    console.log(`   Fonte: ${envKey ? "Variável de Ambiente" : "Banco de Dados"}`);
  } else {
    console.log("   ❌ NENHUMA CHAVE DISPONÍVEL!");
    return;
  }
  
  // 4. Testar a chave
  console.log("\n4️⃣ TESTANDO A CHAVE:");
  try {
    const mistral = new Mistral({ apiKey: finalKey });
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: "Responda: OK" }],
      maxTokens: 5,
    });
    
    if (response.choices && response.choices.length > 0) {
      console.log(`   ✅ SUCESSO! Resposta: "${response.choices[0]?.message?.content}"`);
    }
  } catch (error: any) {
    console.log(`   ❌ ERRO: ${error.message}`);
    
    // Análise detalhada do erro
    if (error.message?.includes("401")) {
      console.log("\n   🔎 ANÁLISE DO ERRO 401:");
      console.log("      - A chave pode estar expirada");
      console.log("      - A chave pode estar mal formatada");
      console.log("      - Há espaços em branco na chave?");
      
      // Verificar espaços
      if (finalKey !== finalKey.trim()) {
        console.log("      ⚠️ ENCONTRADOS ESPAÇOS EM BRANCO NA CHAVE!");
      }
      
      // Verificar caracteres estranhos
      if (/[^a-zA-Z0-9]/.test(finalKey)) {
        console.log("      ⚠️ Caracteres não-alfanuméricos encontrados!");
        console.log(`         Chave limpa: ${finalKey.replace(/[^a-zA-Z0-9]/g, '')}`);
      }
    }
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════════════");
}

debugMistralFlow();
