/**
 * 🧪 TESTE DEFINITIVO: ENCONTRAR VARIAÇÃO ENTRE SIMULADOR E WHATSAPP
 * 
 * Este script simula EXATAMENTE o fluxo de ambos os caminhos para encontrar
 * onde está a diferença nas respostas.
 */

import dotenv from "dotenv";
dotenv.config();

import { storage } from "./server/storage";
import { generateAIResponse, testAgentResponse } from "./server/aiAgent";
import type { Message } from "@shared/schema";

// Configuração de teste
const TEST_USER_ID = "test-user-debug-123";
const TEST_MESSAGE = "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.";
const TEST_CONTACT_NAME = "Cliente Teste";
const NUM_TESTS = 3;

// Criar histórico de conversação vazio (simula primeira mensagem)
const EMPTY_HISTORY: Message[] = [];

async function testGenerateAIResponse(): Promise<string[]> {
  console.log("\n" + "═".repeat(70));
  console.log("🔬 TESTE 1: Chamada direta generateAIResponse()");
  console.log("═".repeat(70));
  
  const responses: string[] = [];
  
  for (let i = 1; i <= NUM_TESTS; i++) {
    console.log(`\n📞 Chamada ${i}/${NUM_TESTS}...`);
    
    try {
      const result = await generateAIResponse(
        TEST_USER_ID,
        EMPTY_HISTORY,
        TEST_MESSAGE,
        {
          contactName: TEST_CONTACT_NAME,
          contactPhone: "5511999999999",
          sentMedias: [],
        }
      );
      
      if (result?.text) {
        responses.push(result.text);
        console.log(`   ✅ Resposta (${result.text.length} chars):`);
        console.log(`   "${result.text.substring(0, 150)}..."`);
      } else {
        console.log(`   ❌ Sem resposta`);
        responses.push("");
      }
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      responses.push("ERROR: " + error.message);
    }
    
    // Delay entre chamadas
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return responses;
}

async function testTestAgentResponse(): Promise<string[]> {
  console.log("\n" + "═".repeat(70));
  console.log("🔬 TESTE 2: Chamada via testAgentResponse() (SIMULADOR)");
  console.log("═".repeat(70));
  
  const responses: string[] = [];
  
  for (let i = 1; i <= NUM_TESTS; i++) {
    console.log(`\n📞 Chamada ${i}/${NUM_TESTS}...`);
    
    try {
      const result = await testAgentResponse(
        TEST_USER_ID,
        TEST_MESSAGE,
        undefined, // customPrompt
        [], // conversationHistory
        [], // sentMedias
        TEST_CONTACT_NAME
      );
      
      if (result?.text) {
        responses.push(result.text);
        console.log(`   ✅ Resposta (${result.text.length} chars):`);
        console.log(`   "${result.text.substring(0, 150)}..."`);
      } else {
        console.log(`   ❌ Sem resposta`);
        responses.push("");
      }
    } catch (error: any) {
      console.error(`   ❌ Erro: ${error.message}`);
      responses.push("ERROR: " + error.message);
    }
    
    // Delay entre chamadas
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return responses;
}

function compareResponses(direct: string[], simulator: string[]) {
  console.log("\n" + "═".repeat(70));
  console.log("📊 COMPARAÇÃO DE RESULTADOS");
  console.log("═".repeat(70));
  
  // Verificar consistência interna do generateAIResponse
  const directConsistent = direct.every(r => r === direct[0]);
  console.log(`\n1️⃣ generateAIResponse() consistência interna: ${directConsistent ? '✅ CONSISTENTE' : '❌ VARIANDO'}`);
  if (!directConsistent) {
    console.log("   Respostas diferentes:");
    direct.forEach((r, i) => {
      console.log(`   ${i + 1}. (${r.length} chars): "${r.substring(0, 100)}..."`);
    });
  }
  
  // Verificar consistência interna do testAgentResponse
  const simulatorConsistent = simulator.every(r => r === simulator[0]);
  console.log(`\n2️⃣ testAgentResponse() consistência interna: ${simulatorConsistent ? '✅ CONSISTENTE' : '❌ VARIANDO'}`);
  if (!simulatorConsistent) {
    console.log("   Respostas diferentes:");
    simulator.forEach((r, i) => {
      console.log(`   ${i + 1}. (${r.length} chars): "${r.substring(0, 100)}..."`);
    });
  }
  
  // Verificar se os dois métodos dão a MESMA resposta
  const crossConsistent = direct[0] === simulator[0];
  console.log(`\n3️⃣ CRUZADO (Direct vs Simulator): ${crossConsistent ? '✅ IDÊNTICOS' : '❌ DIFERENTES'}`);
  if (!crossConsistent && direct[0] && simulator[0]) {
    console.log("\n   ⚠️ DIFERENÇA ENCONTRADA!");
    console.log(`   Direct (${direct[0].length} chars):`);
    console.log(`   "${direct[0]}"`);
    console.log(`   \n   Simulator (${simulator[0].length} chars):`);
    console.log(`   "${simulator[0]}"`);
    
    // Encontrar onde diverge
    let divergeIndex = 0;
    for (let i = 0; i < Math.max(direct[0].length, simulator[0].length); i++) {
      if (direct[0][i] !== simulator[0][i]) {
        divergeIndex = i;
        break;
      }
    }
    console.log(`   \n   Divergência começa no caractere ${divergeIndex}:`);
    console.log(`   Direct: "...${direct[0].substring(Math.max(0, divergeIndex - 20), divergeIndex + 30)}..."`);
    console.log(`   Simulator: "...${simulator[0].substring(Math.max(0, divergeIndex - 20), divergeIndex + 30)}..."`);
  }
}

async function main() {
  console.log("🚀 INICIANDO TESTES DE VARIAÇÃO SIMULADOR vs WHATSAPP\n");
  console.log(`📝 Mensagem de teste: "${TEST_MESSAGE}"`);
  console.log(`👤 Nome do contato: "${TEST_CONTACT_NAME}"`);
  console.log(`🔢 Número de testes por método: ${NUM_TESTS}`);
  
  // Verificar se há configuração de agente
  console.log("\n🔍 Verificando configuração do agente de teste...");
  try {
    const config = await storage.getAgentConfig(TEST_USER_ID);
    if (!config) {
      console.log("⚠️ Agente não configurado. Criando configuração de teste...");
      await storage.upsertAgentConfig(TEST_USER_ID, {
        isActive: true,
        prompt: `Você é Rodrigo, vendedor da AgenteZap.

REGRAS:
- Tom: Natural, amigável, persuasivo
- Plano: R$49/mês ilimitado
- Link: https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e

RESPONDA DE FORMA CURTA E DIRETA.`,
        model: "mistral-small-latest",
        messageSplitChars: 400,
      });
      console.log("✅ Configuração criada!");
    } else {
      console.log(`✅ Configuração encontrada (prompt: ${config.prompt?.length} chars)`);
    }
  } catch (error: any) {
    console.error(`❌ Erro ao verificar/criar config: ${error.message}`);
    // Continuar mesmo assim para testar
  }
  
  // Executar testes
  const directResponses = await testGenerateAIResponse();
  const simulatorResponses = await testTestAgentResponse();
  
  // Comparar resultados
  compareResponses(directResponses, simulatorResponses);
  
  console.log("\n" + "═".repeat(70));
  console.log("✅ TESTES CONCLUÍDOS");
  console.log("═".repeat(70));
  
  // Recomendações baseadas nos resultados
  const directConsistent = directResponses.every(r => r === directResponses[0]);
  const simulatorConsistent = simulatorResponses.every(r => r === simulatorResponses[0]);
  const crossConsistent = directResponses[0] === simulatorResponses[0];
  
  console.log("\n📋 DIAGNÓSTICO:");
  
  if (!directConsistent) {
    console.log("❌ A função generateAIResponse() está gerando respostas diferentes!");
    console.log("   → Verificar se temperature e randomSeed estão sendo aplicados corretamente");
    console.log("   → Verificar se há pós-processamento que adiciona variação");
  }
  
  if (!simulatorConsistent) {
    console.log("❌ O testAgentResponse() (simulador) está gerando respostas diferentes!");
    console.log("   → Verificar se o histórico está sendo tratado igualmente");
    console.log("   → Verificar pós-processamento específico do simulador");
  }
  
  if (directConsistent && simulatorConsistent && !crossConsistent) {
    console.log("⚠️ Os dois métodos são internamente consistentes, MAS retornam respostas DIFERENTES!");
    console.log("   → Verificar se há diferença nos parâmetros passados (contactName, etc)");
    console.log("   → Verificar se há pós-processamento diferente");
    console.log("   → Verificar se o contexto dinâmico (hora, nome) está diferente");
  }
  
  if (directConsistent && simulatorConsistent && crossConsistent) {
    console.log("✅ PERFEITO! Ambos os métodos estão consistentes e idênticos!");
    console.log("   → Se ainda houver variação no WhatsApp real, o problema está no fluxo de envio");
    console.log("   → Verificar messageQueueService, splitMessageHumanLike, etc.");
  }
}

main().catch(console.error);
