/**
 * 🧪 SCRIPT DE TESTE LOCAL - NOVO FLUXO DE VENDAS
 * 
 * Testa todo o fluxo:
 * 1. Onboarding (configurar agente)
 * 2. Modo de teste (#sair para voltar)
 * 3. Follow-ups
 * 4. Limpar sessão (#limpar)
 * 
 * Execute com: npx ts-node scripts/test-sales-flow.ts
 */

import {
  processAdminMessage,
  getClientSession,
  clearClientSession,
  createClientSession,
  type AdminAgentResponse,
} from "../server/adminAgentService.js";
import {
  scheduleAutoFollowUp,
  cancelFollowUp,
  getAllPendingFollowUps,
  getAllScheduledContacts,
} from "../server/followUpService.js";

// Simular readline para conversa interativa
import * as readline from "readline";

const TEST_PHONE = "5517999991234"; // Número fictício para teste

// ============================================================================
// HELPERS
// ============================================================================

function printDivider(title?: string) {
  console.log("\n" + "═".repeat(60));
  if (title) console.log(`  ${title}`);
  console.log("═".repeat(60) + "\n");
}

function printResponse(response: AdminAgentResponse | null) {
  if (!response) {
    console.log("📭 [SISTEMA] Resposta nula (sem trigger ou filtrado)\n");
    return;
  }
  
  console.log("\n🤖 RODRIGO:");
  console.log(`"${response.text}"`);
  
  if (response.mediaActions?.length) {
    console.log("\n📷 Mídias a enviar:");
    for (const media of response.mediaActions) {
      console.log(`  - ${media.media_name} (${media.mediaData?.mediaType || 'desconhecido'})`);
    }
  }
  
  if (response.actions) {
    console.log("\n⚙️ Ações executadas:");
    if (response.actions.sendPix) console.log("  - Enviar PIX");
    if (response.actions.notifyOwner) console.log("  - Notificar dono");
    if (response.actions.startTestMode) console.log("  - MODO DE TESTE ATIVADO 🧪");
  }
  console.log("");
}

function printSessionState() {
  const session = getClientSession(TEST_PHONE);
  if (!session) {
    console.log("📋 [SESSÃO] Nenhuma sessão ativa\n");
    return;
  }
  
  console.log("📋 [SESSÃO]");
  console.log(`  Estado: ${session.flowState}`);
  console.log(`  Config: ${JSON.stringify(session.agentConfig || {})}`);
  console.log(`  Histórico: ${session.conversationHistory.length} mensagens`);
  console.log("");
}

async function simulateMessage(userText: string): Promise<void> {
  console.log(`\n👤 CLIENTE: "${userText}"`);
  
  try {
    const response = await processAdminMessage(
      TEST_PHONE,
      userText,
      undefined,
      undefined,
      true // skipTriggerCheck para teste
    );
    
    printResponse(response);
    printSessionState();
  } catch (error) {
    console.error("❌ ERRO:", error);
  }
}

// ============================================================================
// TESTES AUTOMATIZADOS
// ============================================================================

async function runAutomatedTests() {
  printDivider("🧪 TESTES AUTOMATIZADOS - NOVO FLUXO DE VENDAS");
  
  // Limpar sessão anterior
  clearClientSession(TEST_PHONE);
  console.log("✅ Sessão limpa\n");
  
  // TESTE 1: Primeira mensagem
  printDivider("TESTE 1: Primeira mensagem - Onboarding");
  await simulateMessage("Oi, vi sobre vocês no instagram");
  
  // TESTE 2: Informar empresa
  printDivider("TESTE 2: Informar nome da empresa");
  await simulateMessage("Minha loja se chama Fashion Store");
  
  // TESTE 3: Nome do agente
  printDivider("TESTE 3: Informar nome do agente");
  await simulateMessage("Pode ser Laura");
  
  // TESTE 4: Função
  printDivider("TESTE 4: Informar função");
  await simulateMessage("Ela vai ser vendedora, ajudar com dúvidas sobre produtos");
  
  // TESTE 5: Instruções
  printDivider("TESTE 5: Informar instruções");
  await simulateMessage("A Laura deve saber que vendemos roupas femininas, temos entrega grátis acima de R$200 e parcelamos em até 6x");
  
  // TESTE 6: Confirmar e pedir teste
  printDivider("TESTE 6: Confirmar configuração");
  await simulateMessage("Tá perfeito! Quero testar");
  
  // Verificar se entrou em modo de teste
  const session = getClientSession(TEST_PHONE);
  if (session?.flowState === 'test_mode') {
    console.log("✅ MODO DE TESTE ATIVADO COM SUCESSO!\n");
    
    // TESTE 7: Conversar no modo de teste
    printDivider("TESTE 7: Conversa no modo de teste");
    await simulateMessage("Oi, quero comprar uma blusa");
    
    // TESTE 8: Mais conversa no modo de teste
    printDivider("TESTE 8: Mais conversa no modo de teste");
    await simulateMessage("Qual o valor do frete?");
    
    // TESTE 9: Sair do modo de teste
    printDivider("TESTE 9: Sair do modo de teste (#sair)");
    await simulateMessage("#sair");
    
    // TESTE 10: Feedback após teste
    printDivider("TESTE 10: Feedback após teste");
    await simulateMessage("Gostei muito! Ficou bem natural");
  } else {
    console.log("⚠️ Modo de teste não foi ativado automaticamente\n");
  }
  
  // TESTE 11: Verificar follow-ups
  printDivider("TESTE 11: Verificar Follow-ups");
  const followUps = getAllPendingFollowUps();
  console.log(`Follow-ups pendentes: ${followUps.length}`);
  for (const fu of followUps) {
    console.log(`  - ${fu.phoneNumber}: ${fu.type} em ${fu.scheduledAt.toLocaleString('pt-BR')}`);
  }
  
  // TESTE 12: Limpar sessão
  printDivider("TESTE 12: Comando #limpar");
  await simulateMessage("#limpar");
  
  // Verificar se limpou
  const sessionAfterClear = getClientSession(TEST_PHONE);
  if (!sessionAfterClear) {
    console.log("✅ Sessão limpa com sucesso!\n");
  } else {
    console.log("⚠️ Sessão ainda existe após #limpar\n");
  }
  
  printDivider("🏁 TESTES FINALIZADOS");
}

// ============================================================================
// MODO INTERATIVO
// ============================================================================

async function runInteractiveMode() {
  printDivider("🎮 MODO INTERATIVO - NOVO FLUXO DE VENDAS");
  console.log("Comandos especiais:");
  console.log("  #limpar - Limpar sessão e começar de novo");
  console.log("  #sair   - Sair do modo de teste");
  console.log("  /status - Ver estado da sessão");
  console.log("  /exit   - Encerrar programa");
  console.log("");
  
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  
  const askQuestion = () => {
    rl.question("👤 Você: ", async (input) => {
      const trimmed = input.trim();
      
      if (!trimmed) {
        askQuestion();
        return;
      }
      
      if (trimmed === "/exit") {
        console.log("\n👋 Até mais!\n");
        rl.close();
        process.exit(0);
      }
      
      if (trimmed === "/status") {
        printSessionState();
        const followUps = getAllPendingFollowUps();
        const scheduled = getAllScheduledContacts();
        console.log(`📅 Follow-ups pendentes: ${followUps.length}`);
        console.log(`📅 Agendamentos: ${scheduled.length}`);
        askQuestion();
        return;
      }
      
      await simulateMessage(trimmed);
      askQuestion();
    });
  };
  
  askQuestion();
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes("--auto") || args.includes("-a")) {
    await runAutomatedTests();
  } else {
    await runInteractiveMode();
  }
}

main().catch(console.error);
