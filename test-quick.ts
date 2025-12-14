/**
 * 🧪 TESTE RÁPIDO DO ADMIN AGENT - 10 CENÁRIOS
 * Script simplificado para testar rapidamente o fluxo
 */

import * as dotenv from "dotenv";
dotenv.config();

import { 
  processAdminMessage, 
  getClientSession, 
  clearClientSession,
  generateFollowUpResponse
} from "./server/adminAgentService";

const SCENARIOS = [
  { id: 1, type: "Pizzaria", name: "Pizza Express", agent: "Marcos", role: "Atendente", prompt: "Pizzas de 45 a 70 reais, entrega em 40min" },
  { id: 2, type: "Salão", name: "Beauty Hair", agent: "Patrícia", role: "Recepcionista", prompt: "Corte R$50, escova R$40, agendamento" },
  { id: 3, type: "Pet Shop", name: "Pet Amigo", agent: "Beto", role: "Vendedor", prompt: "Banho R$50, tosa R$30" },
  { id: 4, type: "Oficina", name: "Auto Center", agent: "Zé", role: "Atendente", prompt: "Troca de óleo, freios, suspensão" },
  { id: 5, type: "Loja Roupas", name: "Loja Estilo", agent: "Julia", role: "Vendedora", prompt: "Roupas femininas, 50 a 200 reais" },
];

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testScenario(scenario: typeof SCENARIOS[0]) {
  const phone = `551199999${scenario.id.toString().padStart(4, '0')}`;
  
  try {
    // Limpar
    clearClientSession(phone);
    
    console.log(`\n📋 [${scenario.id}] ${scenario.type}...`);
    
    // 1. Abertura
    const r1 = await processAdminMessage(phone, "oi quero um agente");
    console.log(`  └─ Abertura: ${r1.text?.substring(0, 60) || 'VAZIO'}...`);
    await sleep(100);
    
    // 2. Empresa
    const r2 = await processAdminMessage(phone, scenario.name);
    console.log(`  └─ Empresa: ${r2.text?.substring(0, 60) || 'VAZIO'}...`);
    await sleep(100);
    
    // 3. Nome agente
    const r3 = await processAdminMessage(phone, `quero chamar de ${scenario.agent}`);
    console.log(`  └─ Agente: ${r3.text?.substring(0, 60) || 'VAZIO'}...`);
    await sleep(100);
    
    // 4. Função
    const r4 = await processAdminMessage(phone, scenario.role);
    console.log(`  └─ Função: ${r4.text?.substring(0, 60) || 'VAZIO'}...`);
    await sleep(100);
    
    // 5. Instruções
    const r5 = await processAdminMessage(phone, scenario.prompt);
    console.log(`  └─ Instruções: ${r5.text?.substring(0, 60) || 'VAZIO'}...`);
    await sleep(100);
    
    // 6. Teste
    const r6 = await processAdminMessage(phone, "sim, quero testar");
    console.log(`  └─ Testar: ${r6.text?.substring(0, 60) || 'VAZIO'}...`);
    
    // Verificar estado
    const session = getClientSession(phone);
    const inTestMode = session?.flowState === 'test_mode';
    console.log(`  └─ Estado: ${session?.flowState || 'NENHUM'} ${inTestMode ? '✅' : '⚠️'}`);
    
    if (inTestMode) {
      await sleep(100);
      // Testar
      const testMsg = await processAdminMessage(phone, "quanto custa?");
      console.log(`  └─ [TESTE] ${testMsg.text?.substring(0, 60) || 'VAZIO'}...`);
      
      // Sair
      await sleep(100);
      const exitMsg = await processAdminMessage(phone, "#sair");
      console.log(`  └─ #sair: ${exitMsg.text?.substring(0, 60) || 'VAZIO'}...`);
    }
    
    return true;
  } catch (error: any) {
    console.log(`  └─ ❌ ERRO: ${error.message}`);
    return false;
  }
}

async function testHumanMessages() {
  console.log("\n" + "═".repeat(50));
  console.log("💬 TESTANDO MENSAGENS HUMANAS...");
  console.log("═".repeat(50));
  
  const messages = ["opa blz?", "oii", "e ae", "bom dia!", "funciona?"];
  const phone = "5511777777777";
  
  for (const msg of messages) {
    clearClientSession(phone);
    try {
      const result = await processAdminMessage(phone, msg);
      console.log(`  "${msg}" → ${result.text?.substring(0, 50) || 'VAZIO'}...`);
    } catch (e: any) {
      console.log(`  "${msg}" → ❌ ${e.message}`);
    }
    await sleep(100);
  }
}

async function testClearSession() {
  console.log("\n" + "═".repeat(50));
  console.log("🗑️ TESTANDO LIMPAR SESSÃO...");
  console.log("═".repeat(50));
  
  const phone = "5511666666666";
  
  // Criar
  await processAdminMessage(phone, "oi");
  console.log("  └─ Sessão criada");
  
  // Limpar
  const existed = clearClientSession(phone);
  console.log(`  └─ Limpou: ${existed}`);
  
  // Verificar
  const session = getClientSession(phone);
  console.log(`  └─ Existe após limpar: ${!!session} ${!session ? '✅' : '❌'}`);
}

async function testFollowUp() {
  console.log("\n" + "═".repeat(50));
  console.log("📅 TESTANDO FOLLOW-UP...");
  console.log("═".repeat(50));
  
  const phone = "5511555555555";
  clearClientSession(phone);
  
  // Configurar parcialmente
  await processAdminMessage(phone, "oi");
  await processAdminMessage(phone, "Loja Teste");
  await processAdminMessage(phone, "Ana");
  await processAdminMessage(phone, "Vendedora");
  console.log("  └─ Config parcial feita");
  
  // Follow-up
  try {
    const followUp = await generateFollowUpResponse(phone, {
      type: 'no_response',
      lastMessage: 'ofereceu teste',
      minutesSinceLastInteraction: 60
    });
    console.log(`  └─ Follow-up: ${followUp?.substring(0, 60) || 'NENHUM'}...`);
  } catch (e: any) {
    console.log(`  └─ Follow-up erro: ${e.message}`);
  }
}

async function main() {
  console.log("\n" + "═".repeat(50));
  console.log("🧪 TESTE RÁPIDO DO ADMIN AGENT");
  console.log("═".repeat(50));
  
  let success = 0;
  let fail = 0;
  
  // Testar cenários de negócio
  for (const scenario of SCENARIOS) {
    const ok = await testScenario(scenario);
    if (ok) success++; else fail++;
    await sleep(200);
  }
  
  // Testar mensagens humanas
  await testHumanMessages();
  
  // Testar limpar sessão
  await testClearSession();
  
  // Testar follow-up
  await testFollowUp();
  
  // Resumo
  console.log("\n" + "═".repeat(50));
  console.log("📊 RESUMO");
  console.log("═".repeat(50));
  console.log(`  ✅ Cenários OK: ${success}/${SCENARIOS.length}`);
  console.log(`  ❌ Cenários FALHA: ${fail}/${SCENARIOS.length}`);
  console.log("");
  
  process.exit(0);
}

main().catch(err => {
  console.error("ERRO FATAL:", err);
  process.exit(1);
});
