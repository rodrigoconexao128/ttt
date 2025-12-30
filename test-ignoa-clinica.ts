/**
 * 🧪 TESTE EXTRA DO AGENTE IGNOA/FACOP - CENÁRIO CLÍNICA
 * 
 * Este script testa especificamente o cenário de atendimento clínico
 */

import dotenv from "dotenv";
dotenv.config();

import { testAgentResponse } from "./server/aiAgent";
import { storage } from "./server/storage";

const IGNOA_USER_ID = "9833fb4b-c51a-44ee-8618-8ddd6a999bb3";

interface Message {
  id: string;
  chatId: string;
  text: string;
  fromMe: boolean;
  timestamp: Date;
}

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testAgente(
  titulo: string,
  mensagens: string[],
  userId: string
) {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 ${titulo}`);
  console.log(`${"═".repeat(70)}\n`);

  const conversationHistory: Message[] = [];
  
  for (let i = 0; i < mensagens.length; i++) {
    const mensagem = mensagens[i];
    console.log(`\n👤 Cliente: "${mensagem}"`);
    
    const result = await testAgentResponse(
      userId,
      mensagem,
      undefined,
      conversationHistory,
      []
    );
    
    console.log(`🤖 Rita: "${result.text}"`);
    
    // Adicionar ao histórico
    conversationHistory.push({
      id: `msg_cliente_${i}`,
      chatId: "test",
      text: mensagem,
      fromMe: false,
      timestamp: new Date(Date.now() - (mensagens.length - i) * 60000)
    });
    
    conversationHistory.push({
      id: `msg_agente_${i}`,
      chatId: "test",
      text: result.text || "",
      fromMe: true,
      timestamp: new Date(Date.now() - (mensagens.length - i) * 59000)
    });
    
    await delay(1000);
  }
}

async function main() {
  console.log("\n🏥 ═══════════════════════════════════════════════════════════════");
  console.log("🏥 TESTE CENÁRIO CLÍNICA - IGNOA/FACOP");
  console.log("🏥 ═══════════════════════════════════════════════════════════════");

  try {
    // ========================================
    // TESTE CLÍNICA 1: Marcação de consulta
    // ========================================
    await testAgente(
      "CENÁRIO CLÍNICA 1: Marcação de consulta",
      [
        "Boa tarde",
        "É clínica",
        "Quero marcar uma consulta",
        "Tenho um dente doendo muito",
        "Qual horário vocês têm disponível?"
      ],
      IGNOA_USER_ID
    );

    // ========================================
    // TESTE CLÍNICA 2: Pergunta sobre valores
    // ========================================
    await testAgente(
      "CENÁRIO CLÍNICA 2: Perguntas sobre atendimento",
      [
        "Olá",
        "Atendimento clínico",
        "Vocês fazem limpeza?",
        "Quanto custa a consulta?",
        "Funciona sábado?"
      ],
      IGNOA_USER_ID
    );

    console.log("\n\n✅ ═══════════════════════════════════════════════════════════════");
    console.log("✅ TESTES DE CLÍNICA FINALIZADOS!");
    console.log("✅ ═══════════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ Erro no teste:", error);
    process.exit(1);
  }
}

main().catch(console.error);
