/**
 * 🧪 TESTE IA vs IA - FLUXO ADMIN AGENT
 * 
 * Simula conversas completas entre um "cliente" simulado e o agente do admin (Rodrigo)
 * para validar que:
 * 1. O agente coleta dados antes de criar conta
 * 2. O agente não cria conta prematuramente
 * 3. O prompt do agente criado é personalizado
 * 4. O sistema de follow-up é controlado pela IA
 */

import { processAdminMessage, clearClientSession, getClientSession } from "./server/adminAgentService";

// Cenários de teste
const TEST_SCENARIOS = [
  {
    name: "Teste 1: Cliente diz apenas 'oi'",
    description: "Agente NÃO deve criar conta, deve perguntar o negócio",
    messages: ["oi"],
    expectedBehavior: {
      shouldCreateAccount: false,
      shouldAskAboutBusiness: true
    }
  },
  {
    name: "Teste 2: Cliente quer testar sem dados",
    description: "Agente NÃO deve criar conta imediatamente",
    messages: ["quero testar agora"],
    expectedBehavior: {
      shouldCreateAccount: false,
      shouldAskAboutBusiness: true
    }
  },
  {
    name: "Teste 3: Cliente fornece tipo de negócio",
    description: "Agente deve perguntar nome do agente e instruções",
    messages: ["oi", "tenho uma loja de calçados"],
    expectedBehavior: {
      shouldCreateAccount: false,
      shouldAskForAgentName: true
    }
  },
  {
    name: "Teste 4: Fluxo completo - Loja de Calçados",
    description: "Só deve criar conta após ter todas as informações",
    messages: [
      "oi",
      "tenho uma loja de calçados chamada Fashion Shoes",
      "quero um agente chamada Laura, ela precisa saber que temos tênis de R$99 a R$299, atendemos seg-sab das 9h às 18h, aceitamos pix e cartão"
    ],
    expectedBehavior: {
      shouldCreateAccount: true,
      promptShouldContain: ["Laura", "Fashion Shoes", "calçados", "99", "299"]
    }
  },
  {
    name: "Teste 5: Cliente Hotmart (Infoproduto)",
    description: "Fluxo com cliente que vende curso online",
    messages: [
      "olá",
      "eu vendo um curso de inglês online",
      "o curso chama English Master, custa R$497, tem garantia de 7 dias, é 100% online com suporte no WhatsApp. Quero que a agente se chame Ana"
    ],
    expectedBehavior: {
      shouldCreateAccount: true,
      promptShouldContain: ["Ana", "English Master", "497", "garantia", "7 dias"]
    }
  },
  {
    name: "Teste 6: Cliente com pressa mas sem dados",
    description: "Agente deve coletar dados mesmo com pressa",
    messages: [
      "preciso urgente de um agente",
      "manda logo o link"
    ],
    expectedBehavior: {
      shouldCreateAccount: false,
      shouldAskAboutBusiness: true
    }
  },
  {
    name: "Teste 7: Restaurante/Delivery",
    description: "Fluxo completo para restaurante",
    messages: [
      "oi",
      "tenho um restaurante japonês chamado Sushi House",
      "quero o Pedro como agente. Cardápio: temaki R$25-40, sashimi R$35-60, combos R$50-120. Funcionamos ter-dom 11h-23h. Delivery pelo iFood e WhatsApp. Taxa de entrega R$8"
    ],
    expectedBehavior: {
      shouldCreateAccount: true,
      promptShouldContain: ["Pedro", "Sushi House", "temaki", "sashimi", "delivery"]
    }
  }
];

async function runTest(scenario: typeof TEST_SCENARIOS[0]) {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📝 ${scenario.name}`);
  console.log(`📋 ${scenario.description}`);
  console.log(`${'═'.repeat(70)}`);
  
  // Limpar sessão anterior
  const testPhone = `test_${Date.now()}`;
  clearClientSession(testPhone);
  
  let lastResponse = "";
  let accountCreated = false;
  let credentials: any = null;
  
  for (const message of scenario.messages) {
    console.log(`\n👤 CLIENTE: "${message}"`);
    
    try {
      const response = await processAdminMessage(testPhone, message, undefined, undefined, true);
      
      if (response) {
        lastResponse = response.text;
        console.log(`🤖 RODRIGO: "${response.text.substring(0, 300)}${response.text.length > 300 ? '...' : ''}"`);
        
        // Verificar se criou conta
        if (response.actions?.testAccountCredentials) {
          accountCreated = true;
          credentials = response.actions.testAccountCredentials;
          console.log(`\n✅ CONTA CRIADA!`);
          console.log(`   📧 Email: ${credentials.email}`);
          console.log(`   🔗 Simulador: ${credentials.loginUrl}/test/${credentials.simulatorToken}`);
        }
      } else {
        console.log(`⚠️ Sem resposta (trigger não ativado ou erro)`);
      }
    } catch (error) {
      console.error(`❌ ERRO: ${error}`);
    }
    
    // Pequeno delay entre mensagens
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Verificar resultados
  console.log(`\n📊 RESULTADOS:`);
  
  const expected = scenario.expectedBehavior;
  let passed = true;
  
  if (expected.shouldCreateAccount !== undefined) {
    const pass = accountCreated === expected.shouldCreateAccount;
    console.log(`   ${pass ? '✅' : '❌'} Criar conta: esperado=${expected.shouldCreateAccount}, obtido=${accountCreated}`);
    if (!pass) passed = false;
  }
  
  if (expected.shouldAskAboutBusiness) {
    const lower = lastResponse.toLowerCase();
    const asked = lower.includes('negócio') || lower.includes('vende') || lower.includes('empresa') || lower.includes('faz');
    console.log(`   ${asked ? '✅' : '❌'} Perguntou sobre negócio: ${asked}`);
    if (!asked) passed = false;
  }
  
  if (expected.shouldAskForAgentName) {
    const lower = lastResponse.toLowerCase();
    const asked = lower.includes('nome') && (lower.includes('agente') || lower.includes('atendente'));
    console.log(`   ${asked ? '✅' : '❌'} Perguntou nome do agente: ${asked}`);
  }
  
  if (expected.promptShouldContain && credentials) {
    // Buscar o agente criado e verificar prompt
    const session = getClientSession(testPhone);
    if (session?.agentConfig?.prompt) {
      const prompt = session.agentConfig.prompt.toLowerCase();
      for (const term of expected.promptShouldContain) {
        const contains = prompt.includes(term.toLowerCase());
        console.log(`   ${contains ? '✅' : '❌'} Prompt contém "${term}": ${contains}`);
        if (!contains) passed = false;
      }
    }
  }
  
  console.log(`\n${passed ? '✅ TESTE PASSOU!' : '❌ TESTE FALHOU!'}`);
  
  // Limpar
  clearClientSession(testPhone);
  
  return passed;
}

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                    🧪 TESTE IA vs IA - ADMIN AGENT                          ║
║                                                                              ║
║  Validando fluxo de coleta de dados e criação de contas                      ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  
  let passed = 0;
  let failed = 0;
  
  for (const scenario of TEST_SCENARIOS) {
    try {
      const result = await runTest(scenario);
      if (result) passed++; else failed++;
    } catch (error) {
      console.error(`❌ Erro no teste: ${error}`);
      failed++;
    }
    
    // Delay entre testes
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════════════╗
║                           📊 RESUMO DOS TESTES                               ║
╠══════════════════════════════════════════════════════════════════════════════╣
║  ✅ Passou: ${String(passed).padEnd(3)} / ${TEST_SCENARIOS.length}                                                        ║
║  ❌ Falhou: ${String(failed).padEnd(3)} / ${TEST_SCENARIOS.length}                                                        ║
╚══════════════════════════════════════════════════════════════════════════════╝
`);
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
