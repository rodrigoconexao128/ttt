/**
 * 🧪 TESTE DO AGENTE IGNOA/FACOP
 * 
 * Este script testa o agente configurado para o cliente Roberto (IGNOA)
 * Testa cenários de clínica e cursos de pós-graduação
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
  console.log("🏥 TESTE COMPLETO DO AGENTE IGNOA/FACOP");
  console.log("🏥 ═══════════════════════════════════════════════════════════════");

  try {
    // 1. Verificar configuração
    console.log("\n📋 Verificando configuração do agente...");
    const config = await storage.getAgentConfig(IGNOA_USER_ID);
    
    if (!config) {
      console.error("❌ Agente não configurado para o usuário!");
      process.exit(1);
    }
    
    console.log("✅ Configuração encontrada:");
    console.log(`   - Ativo: ${config.isActive}`);
    console.log(`   - Modelo: ${config.model}`);
    console.log(`   - Prompt: ${config.prompt?.length || 0} caracteres`);
    console.log(`   - Preview: "${config.prompt?.substring(0, 100)}..."`);

    // ========================================
    // TESTE 1: PRIMEIRO CONTATO
    // ========================================
    await testAgente(
      "TESTE 1: PRIMEIRO CONTATO (deve perguntar se é clínica ou curso)",
      [
        "Oi, bom dia"
      ],
      IGNOA_USER_ID
    );

    // ========================================
    // TESTE 2: CLIENTE QUER ATENDIMENTO CLÍNICO
    // ========================================
    await testAgente(
      "TESTE 2: ATENDIMENTO CLÍNICO",
      [
        "Olá",
        "Quero marcar uma consulta",
        "Qual o horário de vocês?",
        "Vocês fazem limpeza?"
      ],
      IGNOA_USER_ID
    );

    // ========================================
    // TESTE 3: CLIENTE QUER CURSO DE PÓS
    // ========================================
    await testAgente(
      "TESTE 3: INTERESSE EM CURSO",
      [
        "Oi boa tarde",
        "Quero saber sobre os cursos",
        "Ortodontia",
        "É reconhecido pelo MEC?",
        "Qual o valor?",
        "Dá pra parcelar em mais vezes?"
      ],
      IGNOA_USER_ID
    );

    // ========================================
    // TESTE 4: CLIENTE PERGUNTA SOBRE ENDODONTIA
    // ========================================
    await testAgente(
      "TESTE 4: ENDODONTIA - COMO NOS PRINTS",
      [
        "Olá bom dia",
        "Curso de pós",
        "Endodontia",
        "O certificado é de pós mesmo?",
        "Minha colega já entrou pq queria orto",
        "Eu quero endo mesmo",
        "Você gostaria de parcela em quantas vezes"
      ],
      IGNOA_USER_ID
    );

    // ========================================
    // TESTE 5: CENÁRIO DOS PRINTS
    // ========================================
    await testAgente(
      "TESTE 5: SIMULANDO CONVERSA DOS PRINTS",
      [
        "Olá Bom dia",
        "Você teria interesse em Ortodontia?",
        "A pós né",
        "Sim",
        "Qual o valor das 2?",
        "Vdd"
      ],
      IGNOA_USER_ID
    );

    console.log("\n\n✅ ═══════════════════════════════════════════════════════════════");
    console.log("✅ TODOS OS TESTES FINALIZADOS!");
    console.log("✅ ═══════════════════════════════════════════════════════════════\n");

  } catch (error) {
    console.error("\n❌ Erro no teste:", error);
    process.exit(1);
  }
}

main().catch(console.error);
