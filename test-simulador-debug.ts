/**
 * 🧪 TESTE DE DEBUG DO SIMULADOR
 * 
 * Este script testa se o simulador consegue usar a mesma lógica do WhatsApp
 * chamando diretamente as funções internas.
 */

import dotenv from "dotenv";
dotenv.config();

import { testAgentResponse } from "./server/aiAgent";
import { storage } from "./server/storage";

async function testSimulador() {
  console.log("\n🧪 ═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE DEBUG DO SIMULADOR");
  console.log("🧪 ═══════════════════════════════════════════════════════════════\n");

  try {
    // 1. Verificar se há usuário no banco
    console.log("📋 1. Verificando usuário no banco...");
    // Usando um usuário que SABEMOS que tem agente configurado
    const userId = "8b13ae5e-b999-4dea-8945-2b289cac3a91"; // testeagente2025s@teste.com
    
    console.log(`   UserId: ${userId}`);
    
    // 2. Verificar config do agente
    console.log("\n📋 2. Verificando config do agente...");
    const config = await storage.getAgentConfig(userId);
    
    if (!config) {
      console.error("❌ Config não encontrado!");
      return;
    }
    
    console.log("✅ Config encontrado:");
    console.log("   - isActive:", config.isActive);
    console.log("   - model:", config.model);
    console.log("   - prompt length:", config.prompt?.length || 0, "chars");
    console.log("   - prompt preview:", config.prompt?.substring(0, 100) || "N/A");
    
    // 3. Testar chamada simples (sem histórico)
    console.log("\n📋 3. Testando chamada simples (sem histórico)...");
    const testMessage = "Oi";
    
    console.log(`   Mensagem de teste: "${testMessage}"`);
    
    const result = await testAgentResponse(
      userId,
      testMessage,
      undefined, // customPrompt
      [], // conversationHistory vazia
      [] // sentMedias vazia
    );
    
    console.log("\n✅ Resultado:");
    console.log("   - text:", result.text ? `"${result.text.substring(0, 150)}..."` : "NULL");
    console.log("   - mediaActions:", result.mediaActions?.length || 0);
    
    // 4. Testar com histórico
    console.log("\n📋 4. Testando com histórico de conversa...");
    
    const conversationHistory = [
      {
        id: "1",
        chatId: "simulator",
        text: "Oi",
        fromMe: false,
        timestamp: new Date(Date.now() - 60000),
        isFromAgent: false,
      },
      {
        id: "2",
        chatId: "simulator",
        text: "Olá! Como posso ajudar?",
        fromMe: true,
        timestamp: new Date(Date.now() - 50000),
        isFromAgent: true,
      }
    ];
    
    const result2 = await testAgentResponse(
      userId,
      "Quanto custa?",
      undefined,
      conversationHistory,
      []
    );
    
    console.log("\n✅ Resultado com histórico:");
    console.log("   - text:", result2.text ? `"${result2.text.substring(0, 150)}..."` : "NULL");
    console.log("   - mediaActions:", result2.mediaActions?.length || 0);
    
    console.log("\n🎉 ═══════════════════════════════════════════════════════════════");
    console.log("🎉 TESTE CONCLUÍDO COM SUCESSO!");
    console.log("🎉 ═══════════════════════════════════════════════════════════════\n");
    
  } catch (error: any) {
    console.error("\n❌ ═══════════════════════════════════════════════════════════════");
    console.error("❌ ERRO NO TESTE:");
    console.error("❌ ═══════════════════════════════════════════════════════════════");
    console.error(error);
    console.error("\nStack trace:", error.stack);
  } finally {
    process.exit(0);
  }
}

// Executar teste
testSimulador();
