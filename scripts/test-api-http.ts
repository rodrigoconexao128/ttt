/**
 * Teste via HTTP da API de vendas
 * 
 * Execute: npx tsx scripts/test-api-http.ts
 */

const BASE_URL = "http://localhost:5000";
const TEST_PHONE = "5517999888777";

interface ApiResponse {
  response: string | null;
  skipped?: boolean;
  reason?: string;
  actions?: {
    testAccountCredentials?: {
      email: string;
      password: string;
      loginUrl: string;
    };
  };
}

async function sendMessage(phone: string, message: string): Promise<ApiResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/admin-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, skipTrigger: true }),
    });
    
    if (!response.ok) {
      console.log(`   ❌ Erro HTTP: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.log(`   ❌ Erro de conexão: ${error}`);
    return null;
  }
}

async function clearSession(phone: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/clear-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runTest(): Promise<void> {
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("🧪 TESTE HTTP: Fluxo de Novo Cliente");
  console.log("══════════════════════════════════════════════════════════\n");
  
  // 1. Limpar sessão
  console.log("1️⃣ Limpando sessão...");
  const cleared = await clearSession(TEST_PHONE);
  console.log(`   ${cleared ? '✅ Sessão limpa' : '⚠️ Erro ao limpar'}`);
  
  await delay(1000);
  
  // 2. Primeira mensagem
  console.log("\n2️⃣ Enviando: 'Oi, quero saber mais sobre o agente'");
  const r1 = await sendMessage(TEST_PHONE, "Oi, quero saber mais sobre o agente");
  
  if (r1) {
    if (r1.skipped || !r1.response) {
      console.log(`   ⚠️ Resposta pulada: ${r1.reason}`);
    } else {
      console.log(`   ✅ Resposta (${r1.response.length} chars):`);
      console.log(`   ${r1.response.substring(0, 200)}...`);
      
      // Verificar se pergunta sobre conexão (comportamento errado)
      if (r1.response.toLowerCase().includes('desconectado')) {
        console.log("\n   ❌ ERRO: Perguntou sobre desconexão! FlowState provavelmente errado.");
      }
    }
  }
  
  await delay(2000);
  
  // 3. Informar empresa
  console.log("\n3️⃣ Enviando: 'Tenho uma loja de roupas chamada Moda Feminina'");
  const r2 = await sendMessage(TEST_PHONE, "Tenho uma loja de roupas chamada Moda Feminina");
  if (r2 && r2.response) {
    console.log(`   ✅ Resposta: ${r2.response.substring(0, 150)}...`);
  }
  
  await delay(2000);
  
  // 4. Nome e função
  console.log("\n4️⃣ Enviando: 'A agente vai se chamar Julia e vai ser atendente'");
  const r3 = await sendMessage(TEST_PHONE, "A agente vai se chamar Julia e vai ser atendente");
  if (r3 && r3.response) {
    console.log(`   ✅ Resposta: ${r3.response.substring(0, 150)}...`);
  }
  
  await delay(2000);
  
  // 5. Instruções
  console.log("\n5️⃣ Enviando instruções...");
  const r4 = await sendMessage(TEST_PHONE, "Vendemos vestidos de R$100 a R$500, blusas de R$50 a R$150, aceitamos pix e cartão, funcionamos das 9h às 18h");
  if (r4 && r4.response) {
    console.log(`   ✅ Resposta: ${r4.response.substring(0, 150)}...`);
  }
  
  await delay(2000);
  
  // 6. Pedir teste
  console.log("\n6️⃣ Enviando: 'Quero testar agora!'");
  const r5 = await sendMessage(TEST_PHONE, "Quero testar agora!");
  
  if (r5) {
    if (r5.response) {
      console.log(`   Resposta completa:\n`);
      console.log(`   ${r5.response}`);
      
      // Verificar comportamento errado
      if (r5.response.includes("#sair") || r5.response.includes("virar")) {
        console.log("\n   ❌ ERRO: IA tentou simular no WhatsApp (comportamento antigo)");
      }
    }
    
    // Verificar credenciais
    if (r5.actions?.testAccountCredentials) {
      console.log("\n   ═══════════════════════════════════════════════");
      console.log("   ✅ SUCESSO! Credenciais de teste geradas:");
      console.log(`   📧 Email: ${r5.actions.testAccountCredentials.email}`);
      console.log(`   🔑 Senha: ${r5.actions.testAccountCredentials.password}`);
      console.log(`   🔗 URL: ${r5.actions.testAccountCredentials.loginUrl}`);
      console.log("   ═══════════════════════════════════════════════");
    } else {
      console.log("\n   ⚠️ Credenciais não foram geradas automaticamente");
    }
  }
  
  // Limpar
  await clearSession(TEST_PHONE);
  
  console.log("\n══════════════════════════════════════════════════════════");
  console.log("✅ TESTE CONCLUÍDO");
  console.log("══════════════════════════════════════════════════════════\n");
}

// Executar
runTest().catch(console.error);
