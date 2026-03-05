/**
 * Teste de Contexto do Agente Admin
 * 
 * Este script testa se a IA mantém contexto correto sobre clientes existentes
 * e não se perde quando o cliente troca de método de conexão.
 */

const API_BASE = "http://localhost:5000/api";

// Número de teste simulando cliente existente
const EXISTING_CLIENT_PHONE = "5517981679818"; // Este número já tem conta

interface TestResult {
  scenario: string;
  passed: boolean;
  message: string;
  aiResponse?: string;
  actions?: any;
}

async function sendTestMessage(from: string, message: string): Promise<any> {
  const response = await fetch(`${API_BASE}/dev/admin-agent/test`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ 
      phoneNumber: from, 
      message, 
      testTrigger: false // Skip trigger check para testes
    }),
  });
  return response.json();
}

async function clearSession(phone: string): Promise<void> {
  // Endpoint para limpar sessão (se existir)
  try {
    await fetch(`${API_BASE}/admin-whatsapp/clear-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
  } catch (e) {
    // Ignora se não existir
  }
}

const tests: Array<() => Promise<TestResult>> = [];

// ============================================================================
// TESTE 1: Cliente existente pede conexão por celular
// ============================================================================
tests.push(async () => {
  const result = await sendTestMessage(EXISTING_CLIENT_PHONE, "Oi, quero conectar meu whatsapp pelo celular");
  const response = result.response?.toLowerCase() || "";
  const actions = result.actions || {};
  
  const hasEmailQuestion = response.includes("email") || response.includes("e-mail");
  const hasNewAccountOffer = response.includes("criar") && response.includes("conta");
  const hasPairingAction = actions.connectWhatsApp === true;
  
  return {
    scenario: "Cliente existente pede conexão por celular",
    passed: !hasEmailQuestion && !hasNewAccountOffer && hasPairingAction,
    message: hasEmailQuestion 
      ? "❌ FALHA: IA pediu email para cliente que já tem conta!"
      : hasNewAccountOffer 
        ? "❌ FALHA: IA ofereceu criar conta nova!"
        : hasPairingAction 
          ? "✅ PASSOU: IA reconheceu cliente e acionou código de pareamento"
          : "⚠️ PARCIAL: IA reconheceu cliente mas não acionou pareamento",
    aiResponse: result.response?.substring(0, 200),
    actions,
  };
});

// ============================================================================
// TESTE 2: Mesmo cliente agora pede QR Code
// ============================================================================
tests.push(async () => {
  const result = await sendTestMessage(EXISTING_CLIENT_PHONE, "Agora eu prefiro conectar pelo computador, pode me mandar o QR Code?");
  const response = result.response?.toLowerCase() || "";
  const actions = result.actions || {};
  
  const hasEmailQuestion = response.includes("email") || response.includes("e-mail");
  const hasNewAccountOffer = response.includes("criar") && response.includes("conta");
  const hasQrAction = actions.sendQrCode === true;
  
  return {
    scenario: "Mesmo cliente troca para QR Code",
    passed: !hasEmailQuestion && !hasNewAccountOffer && hasQrAction,
    message: hasEmailQuestion 
      ? "❌ FALHA: IA pediu email novamente!"
      : hasNewAccountOffer 
        ? "❌ FALHA: IA ofereceu criar conta nova!"
        : hasQrAction 
          ? "✅ PASSOU: IA entendeu troca e acionou QR Code"
          : "⚠️ PARCIAL: IA não se perdeu mas não acionou QR Code",
    aiResponse: result.response?.substring(0, 200),
    actions,
  };
});

// ============================================================================
// TESTE 3: Cliente volta a pedir código de celular
// ============================================================================
tests.push(async () => {
  const result = await sendTestMessage(EXISTING_CLIENT_PHONE, "Mudei de ideia, manda o código de 8 dígitos mesmo");
  const response = result.response?.toLowerCase() || "";
  const actions = result.actions || {};
  
  const hasEmailQuestion = response.includes("email") || response.includes("e-mail");
  const hasOnboardingStart = response.includes("bem-vindo") || response.includes("criar conta");
  const hasPairingAction = actions.connectWhatsApp === true;
  
  return {
    scenario: "Cliente muda de ideia e pede código de celular",
    passed: !hasEmailQuestion && !hasOnboardingStart && hasPairingAction,
    message: hasPairingAction 
      ? "✅ PASSOU: IA entendeu a troca novamente"
      : "⚠️ PARCIAL: IA manteve contexto mas não acionou pareamento",
    aiResponse: result.response?.substring(0, 200),
    actions,
  };
});

// ============================================================================
// TESTE 4: Cliente pergunta sobre pagamento
// ============================================================================
tests.push(async () => {
  const result = await sendTestMessage(EXISTING_CLIENT_PHONE, "Como faço pra pagar?");
  const response = result.response?.toLowerCase() || "";
  const actions = result.actions || {};
  
  const hasPixInfo = response.includes("pix") || response.includes("99") || response.includes("rodrigo");
  const hasEmailQuestion = response.includes("email");
  
  return {
    scenario: "Cliente pergunta sobre pagamento",
    passed: hasPixInfo && !hasEmailQuestion,
    message: hasPixInfo 
      ? "✅ PASSOU: IA informou sobre pagamento sem reiniciar fluxo"
      : "❌ FALHA: IA não informou sobre pagamento corretamente",
    aiResponse: result.response?.substring(0, 200),
    actions,
  };
});

// ============================================================================
// TESTE 5: Verificar se IA sabe o status da conexão
// ============================================================================
tests.push(async () => {
  const result = await sendTestMessage(EXISTING_CLIENT_PHONE, "Meu whatsapp está conectado?");
  const response = result.response?.toLowerCase() || "";
  
  const mentionsStatus = response.includes("conectado") || response.includes("desconectado") || 
                         response.includes("conexão") || response.includes("status");
  const hasEmailQuestion = response.includes("email");
  
  return {
    scenario: "Cliente pergunta status da conexão",
    passed: mentionsStatus && !hasEmailQuestion,
    message: mentionsStatus 
      ? "✅ PASSOU: IA informou sobre status da conexão"
      : "⚠️ PARCIAL: IA deveria mencionar status da conexão",
    aiResponse: result.response?.substring(0, 200),
  };
});

// ============================================================================
// EXECUTAR TODOS OS TESTES
// ============================================================================
async function runTests() {
  console.log("=".repeat(80));
  console.log("🧪 TESTE DE CONTEXTO DO AGENTE ADMIN");
  console.log("=".repeat(80));
  console.log(`📱 Testando com número de cliente existente: ${EXISTING_CLIENT_PHONE}`);
  console.log("");
  
  let passed = 0;
  let failed = 0;
  
  for (let i = 0; i < tests.length; i++) {
    console.log(`\n--- Teste ${i + 1}: ---`);
    
    try {
      const result = await tests[i]();
      
      console.log(`📋 Cenário: ${result.scenario}`);
      console.log(`📊 Resultado: ${result.message}`);
      if (result.aiResponse) {
        console.log(`🤖 Resposta IA: "${result.aiResponse}..."`);
      }
      if (result.actions && Object.keys(result.actions).length > 0) {
        console.log(`⚡ Ações: ${JSON.stringify(result.actions)}`);
      }
      
      if (result.passed) {
        passed++;
      } else {
        failed++;
      }
      
      // Pequena pausa entre testes
      await new Promise(r => setTimeout(r, 1000));
    } catch (error: any) {
      console.log(`❌ ERRO no teste: ${error.message}`);
      failed++;
    }
  }
  
  console.log("\n" + "=".repeat(80));
  console.log(`📊 RESULTADO FINAL: ${passed}/${tests.length} testes passaram`);
  if (failed > 0) {
    console.log(`⚠️  ${failed} teste(s) falharam - a IA ainda pode estar se perdendo`);
  } else {
    console.log(`✅ TODOS OS TESTES PASSARAM! A IA mantém contexto corretamente.`);
  }
  console.log("=".repeat(80));
}

runTests().catch(console.error);
