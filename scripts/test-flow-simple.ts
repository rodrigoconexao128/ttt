/**
 * Teste Simples do Fluxo de Vendas
 * 
 * Execute: npx tsx scripts/test-flow-simple.ts
 */

import { processAdminMessage, clearClientSession, getClientSession } from "../server/adminAgentService";

const TEST_PHONE = "5517999999999";

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testNewClientFlow(): Promise<void> {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: Fluxo de Novo Cliente");
  console.log("══════════════════════════════════════════════════════════\n");
  
  // Limpar sessão
  console.log("1️⃣ Limpando sessão...");
  clearClientSession(TEST_PHONE);
  
  // Verificar que não tem sessão
  const session1 = getClientSession(TEST_PHONE);
  console.log(`   Sessão após limpar: ${session1 ? 'EXISTE (❌ ERRO)' : 'null (✅ OK)'}`);
  
  await delay(500);
  
  // Simular primeira mensagem
  console.log("\n2️⃣ Enviando primeira mensagem: 'Oi, quero saber mais'");
  const response1 = await processAdminMessage(TEST_PHONE, "Oi, quero saber mais", undefined, undefined, true);
  
  if (response1) {
    console.log(`   ✅ Resposta recebida (${response1.text.length} chars)`);
    console.log(`   Prévia: ${response1.text.substring(0, 150)}...`);
    
    // Verificar se NÃO pergunta sobre conexão
    if (response1.text.toLowerCase().includes('desconectado') || 
        response1.text.toLowerCase().includes('conexão') ||
        response1.text.toLowerCase().includes('whatsapp')) {
      console.log(`   ⚠️ ALERTA: Resposta menciona conexão/WhatsApp (pode ser problema de flowState)`);
    } else {
      console.log(`   ✅ Resposta não menciona conexão (correto para novo cliente)`);
    }
  } else {
    console.log("   ❌ Nenhuma resposta!");
  }
  
  // Verificar estado da sessão
  const session2 = getClientSession(TEST_PHONE);
  console.log(`\n   Estado da sessão: flowState = ${session2?.flowState || 'undefined'}`);
  console.log(`   userId = ${session2?.userId || 'null'}`);
  
  await delay(500);
  
  // Simular conversa completa
  console.log("\n3️⃣ Informando dados do negócio...");
  await processAdminMessage(TEST_PHONE, "Tenho uma loja de roupas chamada Fashion Store", undefined, undefined, true);
  
  await delay(500);
  
  console.log("4️⃣ Informando nome do agente...");
  await processAdminMessage(TEST_PHONE, "A atendente vai se chamar Julia e vai ser vendedora", undefined, undefined, true);
  
  await delay(500);
  
  console.log("5️⃣ Informando instruções...");
  const response5 = await processAdminMessage(TEST_PHONE, "Vendemos vestidos de R$100 a R$500, blusas de R$50 a R$150. Aceitamos pix e cartão.", undefined, undefined, true);
  
  // Verificar config coletada
  const session3 = getClientSession(TEST_PHONE);
  console.log(`\n   Config coletada:`);
  console.log(`   - empresa: ${session3?.agentConfig?.company || 'null'}`);
  console.log(`   - nome: ${session3?.agentConfig?.name || 'null'}`);
  console.log(`   - função: ${session3?.agentConfig?.role || 'null'}`);
  console.log(`   - prompt: ${session3?.agentConfig?.prompt ? 'SIM' : 'null'}`);
  
  await delay(500);
  
  // Pedir para testar
  console.log("\n6️⃣ Pedindo para testar...");
  const response6 = await processAdminMessage(TEST_PHONE, "Quero testar agora!", undefined, undefined, true);
  
  if (response6) {
    console.log(`   Resposta (${response6.text.length} chars):`);
    console.log(`   ${response6.text.substring(0, 300)}...`);
    
    // Verificar se criou conta de teste
    if (response6.actions?.testAccountCredentials) {
      console.log("\n   ✅ CONTA DE TESTE CRIADA!");
      console.log(`   Email: ${response6.actions.testAccountCredentials.email}`);
      console.log(`   Senha: ${response6.actions.testAccountCredentials.password}`);
      console.log(`   URL: ${response6.actions.testAccountCredentials.loginUrl}`);
    } else {
      console.log("\n   ⚠️ Conta de teste NÃO foi criada automaticamente");
      console.log("   (Pode ser que a IA ainda não usou a ação)");
    }
    
    // Verificar se menciona simular no WhatsApp (comportamento errado)
    if (response6.text.includes("virar") || response6.text.includes("Eu vou agir") || response6.text.includes("#sair")) {
      console.log("\n   ❌ ERRO: IA está tentando SIMULAR no WhatsApp!");
    }
    
    // Verificar se menciona criar conta/credenciais (comportamento correto)
    if (response6.text.includes("conta") || response6.text.includes("email") || response6.text.includes("senha") || response6.text.includes("painel")) {
      console.log("\n   ✅ IA está falando sobre criar conta/credenciais (correto!)");
    }
  }
  
  // Limpar sessão após teste
  clearClientSession(TEST_PHONE);
  
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("✅ TESTE CONCLUÍDO");
  console.log("══════════════════════════════════════════════════════════\n");
}

// Executar
testNewClientFlow().catch(console.error);
