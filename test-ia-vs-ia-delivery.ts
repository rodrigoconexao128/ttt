/**
 * 🧪 TESTE IA CLIENTE vs IA AGENTE - 10 CENÁRIOS DE DELIVERY
 * 
 * Este script simula conversas reais entre:
 * - IA CLIENTE: Simula perguntas de clientes reais
 * - IA AGENTE: O agente real do sistema (via API)
 * 
 * Execute: npx ts-node vvvv/test-ia-vs-ia-delivery.ts
 */

import fetch from 'node-fetch';

// Configurações
const API_URL = process.env.API_URL || 'http://localhost:5000';
const USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384'; // bigacaicuiaba@gmail.com
const ADMIN_EMAIL = 'admin@agentezap.com';
const ADMIN_PASS = 'agentezap123';

// Cores para console
const c = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

function log(emoji: string, message: string, color = c.reset) {
  console.log(`${color}${emoji} ${message}${c.reset}`);
}

function separator(char = '═', length = 70) {
  console.log(c.cyan + char.repeat(length) + c.reset);
}

// ═══════════════════════════════════════════════════════════════════
// 10 CENÁRIOS DE TESTE - CLIENTE SEM SCRIPT PREDEFINIDO
// ═══════════════════════════════════════════════════════════════════
const SCENARIOS = [
  {
    name: "Cliente quer ver o cardápio",
    messages: [
      "oi boa noite",
      "quero ver o cardápio",
      "quais os sabores de pizza vocês tem?"
    ],
    expects: ["cardápio", "pizza", "R$", "preço"]
  },
  {
    name: "Cliente pergunta sobre preços",
    messages: [
      "olá",
      "quanto é a pizza de calabresa?",
      "e a de frango com catupiry?"
    ],
    expects: ["R$", "reais", "preço", "valor"]
  },
  {
    name: "Cliente faz pedido simples",
    messages: [
      "boa noite!",
      "quero 1 pizza de mussarela grande",
      "meu nome é João e o endereço é Rua das Flores 123",
      "quero pagar no pix"
    ],
    expects: ["pedido", "confirmado", "total", "R$"]
  },
  {
    name: "Cliente pergunta sobre bebidas",
    messages: [
      "oi",
      "vocês tem refrigerante? quais?",
      "quanto é a coca-cola?"
    ],
    expects: ["coca", "refrigerante", "bebida", "R$"]
  },
  {
    name: "Cliente faz pedido com observação",
    messages: [
      "boa tarde",
      "quero uma pizza de calabresa SEM CEBOLA",
      "pode ser grande",
      "meu nome é Maria, endereço Av Brasil 500, pix"
    ],
    expects: ["sem cebola", "calabresa", "pedido"]
  },
  {
    name: "Cliente pergunta tempo de entrega",
    messages: [
      "oi",
      "quanto tempo demora a entrega?",
      "e qual a taxa de entrega?"
    ],
    expects: ["minuto", "tempo", "taxa", "entrega", "R$"]
  },
  {
    name: "Cliente quer retirar no local",
    messages: [
      "olá!",
      "quero fazer um pedido para retirar",
      "1 pizza portuguesa grande",
      "meu nome é Carlos, vou retirar, cartão"
    ],
    expects: ["retirar", "retirada", "pedido"]
  },
  {
    name: "Cliente indeciso pergunta sugestões",
    messages: [
      "boa noite",
      "não sei o que pedir, o que vocês mais vendem?",
      "tem alguma promoção?"
    ],
    expects: ["pizza", "sugest", "popular", "promo"]
  },
  {
    name: "Cliente muda o pedido",
    messages: [
      "oi",
      "quero 2 pizzas de calabresa",
      "na verdade, troca uma por frango com catupiry",
      "confirma o pedido: Ana, Rua Nova 200, dinheiro"
    ],
    expects: ["pedido", "frango", "catupiry", "total"]
  },
  {
    name: "Cliente pergunta sobre esfihas",
    messages: [
      "boa tarde!",
      "vocês vendem esfiha?",
      "quais sabores tem?",
      "quanto é cada uma?"
    ],
    expects: ["esfiha", "sabor", "R$"]
  }
];

// ═══════════════════════════════════════════════════════════════════
// FUNÇÃO: Login como Admin (SIMPLIFICADO - usa endpoint público de teste)
// ═══════════════════════════════════════════════════════════════════
let authCookie = '';

async function loginAsAdmin(): Promise<boolean> {
  // Para o simulador, não precisamos de autenticação especial
  log('✅', 'Usando endpoint público do simulador', c.green);
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÃO: Enviar mensagem para o simulador
// ═══════════════════════════════════════════════════════════════════
async function sendToSimulator(
  message: string, 
  conversationHistory: Array<{ role: string; content: string }>
): Promise<{ 
  response: string | null; 
  deliveryOrderCreated?: any; 
  error?: string 
}> {
  try {
    const response = await fetch(`${API_URL}/api/test-agent/message`, {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: USER_ID,
        message,
        history: conversationHistory,
        sentMedias: []
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      return { response: null, error: `HTTP ${response.status}: ${errorText}` };
    }
    
    const data = await response.json() as any;
    
    return { 
      response: data.response || data.text || null,
      deliveryOrderCreated: data.deliveryOrderCreated
    };
  } catch (error: any) {
    return { response: null, error: error.message };
  }
}

// ═══════════════════════════════════════════════════════════════════
// FUNÇÃO: Executar um cenário de teste
// ═══════════════════════════════════════════════════════════════════
async function runScenario(scenario: typeof SCENARIOS[0], index: number): Promise<{
  passed: boolean;
  details: string[];
  ordersCreated: number;
}> {
  separator('═');
  console.log(`${c.bold}${c.magenta}🧪 CENÁRIO ${index + 1}: ${scenario.name}${c.reset}`);
  separator('─');
  
  const conversationHistory: Array<{ role: string; content: string }> = [];
  const details: string[] = [];
  let ordersCreated = 0;
  let foundExpected = 0;
  
  for (const clientMessage of scenario.messages) {
    // Cliente envia mensagem
    console.log(`\n${c.blue}👤 CLIENTE: ${clientMessage}${c.reset}`);
    
    conversationHistory.push({ role: 'user', content: clientMessage });
    
    // Agente responde
    const result = await sendToSimulator(clientMessage, conversationHistory);
    
    if (result.error) {
      console.log(`${c.red}❌ ERRO: ${result.error}${c.reset}`);
      details.push(`ERRO: ${result.error}`);
      continue;
    }
    
    if (!result.response) {
      console.log(`${c.yellow}⚠️ Sem resposta${c.reset}`);
      details.push('Sem resposta da IA');
      continue;
    }
    
    // Mostrar resposta (truncada se muito longa)
    const displayResponse = result.response.length > 500 
      ? result.response.substring(0, 500) + '...' 
      : result.response;
    console.log(`${c.green}🤖 AGENTE: ${displayResponse}${c.reset}`);
    
    conversationHistory.push({ role: 'assistant', content: result.response });
    
    // Verificar se pedido foi criado
    if (result.deliveryOrderCreated) {
      console.log(`${c.cyan}🍕 PEDIDO CRIADO: #${result.deliveryOrderCreated.id}${c.reset}`);
      ordersCreated++;
    }
    
    // Verificar se contém palavras esperadas
    const responseLC = result.response.toLowerCase();
    for (const expected of scenario.expects) {
      if (responseLC.includes(expected.toLowerCase())) {
        foundExpected++;
        break; // Pelo menos uma palavra foi encontrada nesta resposta
      }
    }
    
    // Pequena pausa entre mensagens
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Avaliar resultado
  const passed = foundExpected >= Math.min(2, scenario.messages.length - 1);
  
  console.log(`\n${c.bold}📊 RESULTADO: ${passed ? c.green + '✅ PASSOU' : c.red + '❌ FALHOU'}${c.reset}`);
  console.log(`   Palavras-chave encontradas: ${foundExpected}/${scenario.expects.length}`);
  console.log(`   Pedidos criados: ${ordersCreated}`);
  
  return { passed, details, ordersCreated };
}

// ═══════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n');
  separator('═');
  console.log(`${c.bold}${c.cyan}   🧪 TESTE IA CLIENTE vs IA AGENTE - DELIVERY${c.reset}`);
  console.log(`${c.cyan}   10 Cenários de Conversação Real${c.reset}`);
  separator('═');
  console.log(`\n📍 API: ${API_URL}`);
  console.log(`👤 Usuário: bigacaicuiaba@gmail.com (${USER_ID})\n`);
  
  // Login
  const loggedIn = await loginAsAdmin();
  if (!loggedIn) {
    log('❌', 'Não foi possível fazer login. Abortando.', c.red);
    process.exit(1);
  }
  
  const results: Array<{ name: string; passed: boolean; ordersCreated: number }> = [];
  
  // Executar cada cenário
  for (let i = 0; i < SCENARIOS.length; i++) {
    const result = await runScenario(SCENARIOS[i], i);
    results.push({
      name: SCENARIOS[i].name,
      passed: result.passed,
      ordersCreated: result.ordersCreated
    });
    
    // Pausa entre cenários
    console.log('\n');
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  // Resumo final
  separator('═');
  console.log(`${c.bold}${c.cyan}   📊 RESUMO FINAL${c.reset}`);
  separator('═');
  
  const passed = results.filter(r => r.passed).length;
  const totalOrders = results.reduce((sum, r) => sum + r.ordersCreated, 0);
  
  console.log(`\n📋 CENÁRIOS:`);
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    const orderInfo = result.ordersCreated > 0 ? ` (🍕 ${result.ordersCreated} pedido(s))` : '';
    console.log(`   ${icon} ${result.name}${orderInfo}`);
  }
  
  console.log(`\n${c.bold}📈 ESTATÍSTICAS:${c.reset}`);
  console.log(`   Cenários que passaram: ${passed}/${SCENARIOS.length} (${Math.round(passed/SCENARIOS.length*100)}%)`);
  console.log(`   Total de pedidos criados: ${totalOrders}`);
  
  if (passed === SCENARIOS.length) {
    console.log(`\n${c.green}${c.bold}🎉 TODOS OS TESTES PASSARAM!${c.reset}`);
  } else if (passed >= SCENARIOS.length * 0.7) {
    console.log(`\n${c.yellow}${c.bold}⚠️ MAIORIA DOS TESTES PASSOU - Alguns ajustes podem ser necessários${c.reset}`);
  } else {
    console.log(`\n${c.red}${c.bold}❌ MUITOS TESTES FALHARAM - Revisão necessária${c.reset}`);
  }
  
  separator('═');
  console.log('\n');
}

main().catch(console.error);
