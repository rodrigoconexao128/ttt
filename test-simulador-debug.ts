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
    // rodrigo4@gmail.com - TEM 2 ÁUDIOS NA BIBLIOTECA
    const userId = "cb9213c3-fde3-479e-a4aa-344171c59735";
    
    console.log(`   UserId: ${userId}`);
    console.log(`   Email: rodrigo4@gmail.com`);
    
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
    console.log("\n📋 3. Testando chamada simples (primeira mensagem)...");
    const testMessage = "Oi, tudo bem?";
    
    console.log(`   Mensagem de teste: "${testMessage}"`);
    console.log(`   Esperado: Agente deve enviar o áudio MENSAGEM_DE_INICIO`);
    
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
    
    if (result.mediaActions && result.mediaActions.length > 0) {
      console.log("\n📁 Mídias detectadas:");
      for (const action of result.mediaActions) {
        console.log(`      • ${action.media_name} (${action.type})`);
      }
    } else {
      console.log("\n⚠️  NENHUMA MÍDIA DETECTADA!");
    }
    
    // 4. Testar com histórico (solicitar segundo áudio)
    console.log("\n📋 4. Testando segunda mensagem (cliente responde sobre trabalho)...");
    
    const conversationHistory = [
      {
        id: "1",
        chatId: "simulator",
        text: "Oi, tudo bem?",
        fromMe: false,
        timestamp: new Date(Date.now() - 120000),
        isFromAgent: false,
      },
      {
        id: "2",
        chatId: "simulator",
        text: result.text || "Resposta do agente",
        fromMe: true,
        timestamp: new Date(Date.now() - 60000),
        isFromAgent: true,
      }
    ];
    
    const testMessage2 = "Trabalho com vendas e atendimento";
    console.log(`   Mensagem: "${testMessage2}"`);
    console.log(`   Esperado: Agente deve enviar o áudio COMO_FUNCIONA`);
    
    const result2 = await testAgentResponse(
      userId,
      testMessage2,
      undefined,
      conversationHistory,
      result.mediaActions?.map(a => a.media_name) || [] // Mídias já enviadas
    );
    
    console.log("\n✅ Resultado com histórico:");
    console.log("   - text:", result2.text ? `"${result2.text.substring(0, 150)}..."` : "NULL");
    console.log("   - mediaActions:", result2.mediaActions?.length || 0);
    
    if (result2.mediaActions && result2.mediaActions.length > 0) {
      console.log("\n📁 Mídias detectadas:");
      for (const action of result2.mediaActions) {
        console.log(`      • ${action.media_name} (${action.type})`);
      }
    } else {
      console.log("\n⚠️  NENHUMA MÍDIA DETECTADA!");
    }
    
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
