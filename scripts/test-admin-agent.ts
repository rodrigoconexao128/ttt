/**
 * Script de Teste do Agente Admin (Rodrigo)
 * 
 * Este script testa:
 * 1. Configuração do auto-atendimento
 * 2. Geração de respostas IA
 * 3. Criação de contas
 * 4. Fluxo completo de onboarding
 */

const BASE_URL = process.env.TEST_URL || "http://localhost:5000";

interface TestResult {
  name: string;
  passed: boolean;
  message: string;
  duration: number;
}

const results: TestResult[] = [];

async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const start = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      message: "OK",
      duration: Date.now() - start,
    });
    console.log(`✅ ${name}`);
  } catch (error: any) {
    results.push({
      name,
      passed: false,
      message: error.message,
      duration: Date.now() - start,
    });
    console.log(`❌ ${name}: ${error.message}`);
  }
}

async function fetchJSON(url: string, options?: RequestInit): Promise<any> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${await response.text()}`);
  }
  
  return response.json();
}

// ================== TESTES ==================

async function testHealthCheck() {
  const response = await fetch(`${BASE_URL}/`);
  if (!response.ok) throw new Error("Server not running");
}

async function testAdminLogin() {
  const response = await fetchJSON(`${BASE_URL}/api/admin/login`, {
    method: "POST",
    body: JSON.stringify({
      email: "rodrigoconexao128@gmail.com",
      password: "Ibira2019!",
    }),
  });
  
  if (!response.success && !response.authenticated) {
    throw new Error("Login failed: " + JSON.stringify(response));
  }
}

async function testGetAutoAtendimentoConfig() {
  const response = await fetchJSON(`${BASE_URL}/api/admin/auto-atendimento/config`);
  
  if (typeof response.enabled !== "boolean") {
    throw new Error("enabled should be boolean");
  }
  
  console.log(`   - Enabled: ${response.enabled}`);
  console.log(`   - Prompt length: ${response.prompt?.length || 0} chars`);
  console.log(`   - Notification number: ${response.ownerNotificationNumber}`);
}

async function testSetAutoAtendimentoEnabled() {
  // Ativar
  await fetchJSON(`${BASE_URL}/api/admin/auto-atendimento/config`, {
    method: "POST",
    body: JSON.stringify({ enabled: true }),
  });
  
  // Verificar
  const response = await fetchJSON(`${BASE_URL}/api/admin/auto-atendimento/config`);
  
  if (response.enabled !== true) {
    throw new Error("Failed to enable auto-atendimento");
  }
}

async function testSetAutoAtendimentoPrompt() {
  const testPrompt = "Você é o Rodrigo, atendente da AgenteZap. Seja simpático e ajude os clientes.";
  
  await fetchJSON(`${BASE_URL}/api/admin/auto-atendimento/config`, {
    method: "POST",
    body: JSON.stringify({ prompt: testPrompt }),
  });
  
  const response = await fetchJSON(`${BASE_URL}/api/admin/auto-atendimento/config`);
  
  if (response.prompt !== testPrompt) {
    throw new Error("Failed to save prompt");
  }
}

async function testAdminAgentProcess() {
  // Este teste simula o processamento de uma mensagem
  // Precisa importar o serviço diretamente ou usar uma rota de teste
  
  const response = await fetchJSON(`${BASE_URL}/api/admin/agent/test`, {
    method: "POST",
    body: JSON.stringify({ message: "Olá, quero saber mais sobre o AgenteZap" }),
  });
  
  if (!response.response || response.response.length < 10) {
    throw new Error("AI response too short or empty");
  }
  
  console.log(`   - AI Response: "${response.response.substring(0, 100)}..."`);
}

async function testCreateAccountFlow() {
  // Simular fluxo de criação de conta via processamento de mensagens
  const testPhone = "5511999999999";
  
  // 1. Primeira mensagem
  const response1 = await fetchJSON(`${BASE_URL}/api/admin/agent/test`, {
    method: "POST",
    body: JSON.stringify({ 
      message: "Oi, quero criar uma conta",
      phoneNumber: testPhone,
    }),
  });
  
  if (!response1.response) {
    throw new Error("No response for create account request");
  }
  
  console.log(`   - Step 1 (greeting): "${response1.response.substring(0, 80)}..."`);
  
  // 2. Enviar email
  const response2 = await fetchJSON(`${BASE_URL}/api/admin/agent/test`, {
    method: "POST",
    body: JSON.stringify({ 
      message: "teste@exemplo.com",
      phoneNumber: testPhone,
    }),
  });
  
  console.log(`   - Step 2 (email): "${response2.response?.substring(0, 80) || 'No response'}..."`);
}

async function testDatabaseConnection() {
  const response = await fetchJSON(`${BASE_URL}/api/admin/stats`);
  
  if (typeof response.totalUsers !== "number") {
    throw new Error("Failed to get stats from database");
  }
  
  console.log(`   - Total users: ${response.totalUsers}`);
  console.log(`   - Active subscriptions: ${response.activeSubscriptions}`);
}

async function testPlansExist() {
  const response = await fetchJSON(`${BASE_URL}/api/admin/plans`);
  
  if (!Array.isArray(response) || response.length === 0) {
    throw new Error("No plans found in database");
  }
  
  console.log(`   - Found ${response.length} plan(s)`);
  response.forEach((plan: any) => {
    console.log(`   - ${plan.nome}: R$ ${plan.preco}`);
  });
}

// ================== RUNNER ==================

async function runAllTests() {
  console.log("\n🧪 INICIANDO TESTES DO AGENTE ADMIN\n");
  console.log("=".repeat(50));
  
  await runTest("1. Health Check", testHealthCheck);
  await runTest("2. Admin Login", testAdminLogin);
  await runTest("3. Get Auto-Atendimento Config", testGetAutoAtendimentoConfig);
  await runTest("4. Set Auto-Atendimento Enabled", testSetAutoAtendimentoEnabled);
  await runTest("5. Set Auto-Atendimento Prompt", testSetAutoAtendimentoPrompt);
  await runTest("6. Database Connection", testDatabaseConnection);
  await runTest("7. Plans Exist", testPlansExist);
  await runTest("8. Admin Agent Process", testAdminAgentProcess);
  await runTest("9. Create Account Flow", testCreateAccountFlow);
  
  console.log("\n" + "=".repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n📊 RESULTADOS: ${passed} passaram, ${failed} falharam`);
  
  if (failed > 0) {
    console.log("\n❌ Testes que falharam:");
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}: ${r.message}`);
    });
  }
  
  console.log("\n");
  
  return failed === 0;
}

// Executar
runAllTests().then(success => {
  process.exit(success ? 0 : 1);
}).catch(error => {
  console.error("Fatal error:", error);
  process.exit(1);
});
