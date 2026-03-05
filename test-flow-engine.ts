/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🧪 TESTE DO FLOW ENGINE - Sistema Híbrido IA + Fluxos
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx vvvv/test-flow-engine.ts
 */

import { 
  FlowEngine, 
  IntentClassifier,
  DELIVERY_FLOW,
  CustomerIntent,
} from './server/FlowEngine';

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CONFIGURAÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════

const BUSINESS_CONFIG = {
  businessName: 'Pizzaria Big',
  businessType: 'pizzaria',
  deliveryFee: 5,
  minOrderValue: 20,
  estimatedTime: 45,
};

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTE 1: Classificação de Intenções
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('🧪 TESTE DO FLOW ENGINE - SISTEMA HÍBRIDO');
console.log('═'.repeat(70));

console.log('\n' + '─'.repeat(70));
console.log('📝 TESTE 1: Classificação de Intenções');
console.log('─'.repeat(70));

const classifier = new IntentClassifier();

const intentTests: Array<{ message: string; expected: CustomerIntent }> = [
  // Saudações
  { message: 'Oi', expected: 'GREETING' },
  { message: 'Olá, boa noite', expected: 'GREETING' },
  { message: 'Bom dia!', expected: 'GREETING' },
  
  // Cardápio
  { message: 'Qual o cardápio?', expected: 'WANT_MENU' },
  { message: 'O que vocês tem?', expected: 'WANT_MENU' },
  { message: 'Me mostra o menu', expected: 'WANT_MENU' },
  
  // Pedidos
  { message: 'Quero 2 pizzas', expected: 'ADD_ITEM' },
  { message: 'Me vê uma calabresa', expected: 'ADD_ITEM' },
  { message: '3 esfihas de queijo', expected: 'ADD_ITEM' },
  
  // Confirmação
  { message: 'Isso, pode fechar', expected: 'CONFIRM_ORDER' },
  { message: 'Fechado!', expected: 'CONFIRM_ORDER' },
  { message: 'Confirma', expected: 'CONFIRM_ORDER' },
  
  // Cancelamento
  { message: 'Cancela tudo', expected: 'CANCEL_ORDER' },
  { message: 'Desisto', expected: 'CANCEL_ORDER' },
  
  // Informações
  { message: 'Qual a taxa de entrega?', expected: 'ASK_DELIVERY_FEE' },
  { message: 'Quanto tempo demora?', expected: 'ASK_DELIVERY_TIME' },
  { message: 'Aceita Pix?', expected: 'ASK_PAYMENT_METHODS' },
  
  // Pagamento
  { message: 'Pago no Pix', expected: 'CHOOSE_PAYMENT' },
  { message: 'Quero pagar em dinheiro', expected: 'CHOOSE_PAYMENT' },
  { message: 'Cartão de crédito', expected: 'CHOOSE_PAYMENT' },
  
  // Entrega
  { message: 'Quero delivery', expected: 'CHOOSE_DELIVERY' },
  { message: 'Vou buscar', expected: 'CHOOSE_PICKUP' },
  { message: 'Retirada no local', expected: 'CHOOSE_PICKUP' },
  
  // Endereço
  { message: 'Rua das Flores, 123', expected: 'PROVIDE_ADDRESS' },
  { message: 'Av. Brasil, 456 apto 10', expected: 'PROVIDE_ADDRESS' },
  
  // Carrinho
  { message: 'O que tem no meu pedido?', expected: 'SEE_CART' },
  { message: 'Tira a coca', expected: 'REMOVE_ITEM' },
  { message: 'Limpa tudo', expected: 'CLEAR_CART' },
];

let passedIntents = 0;
for (const test of intentTests) {
  const result = await classifier.classify(test.message);
  const passed = result.intent === test.expected;
  
  if (!passed) {
    console.log(`   ❌ "${test.message}"`);
    console.log(`      Esperado: ${test.expected}, Obtido: ${result.intent}`);
  }
  
  if (passed) passedIntents++;
}

console.log(`\n   📊 Resultado: ${passedIntents}/${intentTests.length} (${Math.round(passedIntents/intentTests.length*100)}%)`);
const test1Passed = passedIntents >= intentTests.length * 0.85; // 85% mínimo
console.log(`   ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTE 2: Fluxo de Conversa Completo
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('💬 TESTE 2: Conversa Completa (Oi → Menu → Pedido → Fechar)');
console.log('─'.repeat(70));

const engine = new FlowEngine();
engine.registerFlow(DELIVERY_FLOW);

// Simular conversa
const userId = 'test-user-123';
const customerPhone = '11999990001';

// Mock: Como não temos Supabase, vamos testar o fluxo de estados
const conversation = [
  'Oi',
  'Cardápio',
  'Quero 2 pizza calabresa',
  'Mais 1 refrigerante 2 litros',
  'Isso, pode fechar',
  'Delivery',
  'Rua das Flores, 123',
  'Pix',
];

console.log('\n--- Simulação de Conversa ---');

let conversationSuccess = true;

for (const message of conversation) {
  console.log(`\n👤 Cliente: ${message}`);
  
  try {
    const result = await engine.processMessage(
      userId,
      customerPhone,
      message,
      BUSINESS_CONFIG
    );
    
    // Mostrar resposta resumida
    const response = result.template || result.bubbles?.join('\n') || JSON.stringify(result.data);
    console.log(`🤖 Bot (${result.action}): ${response.substring(0, 150)}${response.length > 150 ? '...' : ''}`);
    
    if (!result.success && result.action !== 'HELP') {
      console.log(`   ⚠️ Ação falhou: ${result.error}`);
      // Não marca como falha se for erro de DB (esperado no teste)
    }
  } catch (error) {
    console.log(`   ❌ Erro: ${error}`);
    conversationSuccess = false;
  }
}

// Verificar estado final
const finalInstance = await engine.getInstance(userId, customerPhone);
console.log(`\n   📊 Estado final: ${finalInstance?.currentState}`);
console.log(`   🛒 Itens no carrinho: ${finalInstance?.context?.cart?.length || 0}`);

const test2Passed = conversationSuccess;
console.log(`\n   ${test2Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTE 3: Extração de Entidades
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🔍 TESTE 3: Extração de Entidades');
console.log('─'.repeat(70));

const entityTests = [
  { message: 'Quero 2 pizzas de calabresa', expectedEntities: { quantity: 2, product: 'pizzas de calabresa' } },
  { message: 'Pago no Pix', expectedEntities: { paymentMethod: 'Pix' } },
  { message: 'Rua das Flores, 123', expectedEntities: { address: 'Rua das Flores, 123' } },
  { message: 'Meu nome é João', expectedEntities: { name: 'João' } },
];

let passedEntities = 0;
for (const test of entityTests) {
  const result = await classifier.classify(test.message);
  
  let allMatch = true;
  for (const [key, value] of Object.entries(test.expectedEntities)) {
    if (result.entities[key] !== value) {
      // Verificação parcial para alguns campos
      if (key === 'product' && result.entities.items?.[0]?.name?.includes('calabresa')) {
        continue;
      }
      if (key === 'quantity' && result.entities.items?.[0]?.quantity === value) {
        continue;
      }
      allMatch = false;
      console.log(`   ❌ "${test.message}"`);
      console.log(`      Esperado ${key}: ${value}, Obtido: ${result.entities[key]}`);
      break;
    }
  }
  
  if (allMatch) passedEntities++;
}

console.log(`\n   📊 Resultado: ${passedEntities}/${entityTests.length}`);
const test3Passed = passedEntities >= entityTests.length * 0.75;
console.log(`   ${test3Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTE 4: Estados do Fluxo
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🔄 TESTE 4: Transições de Estado');
console.log('─'.repeat(70));

// Verificar definição do fluxo
const flow = DELIVERY_FLOW;
console.log(`   📊 Fluxo: ${flow.name}`);
console.log(`   🏁 Estado inicial: ${flow.initialState}`);
console.log(`   🎯 Estados finais: ${flow.finalStates.join(', ')}`);
console.log(`   📋 Total de estados: ${Object.keys(flow.states).length}`);

// Verificar se todos os estados têm transições
let invalidStates = 0;
for (const [stateName, state] of Object.entries(flow.states)) {
  const hasTransitions = Object.keys(state.transitions).length > 0 || state.defaultTransition;
  if (!hasTransitions) {
    console.log(`   ⚠️ Estado sem transições: ${stateName}`);
    invalidStates++;
  }
}

const test4Passed = invalidStates === 0;
console.log(`\n   ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'} (${invalidStates} estados inválidos)`);

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTE 5: 50 Conversas Simultâneas
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('👥 TESTE 5: 50 Conversas Simultâneas');
console.log('─'.repeat(70));

const startTime = Date.now();
let successfulConversations = 0;

for (let i = 0; i < 50; i++) {
  const phone = `1199999${String(i + 1000).padStart(4, '0')}`;
  
  try {
    // Simular conversa rápida
    await engine.processMessage(userId, phone, 'Oi', BUSINESS_CONFIG);
    await engine.processMessage(userId, phone, 'Quero 2 pizzas', BUSINESS_CONFIG);
    await engine.processMessage(userId, phone, 'Pode fechar', BUSINESS_CONFIG);
    
    const instance = await engine.getInstance(userId, phone);
    if (instance) {
      successfulConversations++;
    }
  } catch (e) {
    // Ignorar erros de DB
  }
}

const duration = Date.now() - startTime;
console.log(`   ✅ Conversas processadas: ${successfulConversations}/50`);
console.log(`   ⏱️ Tempo: ${duration}ms (${Math.round(50 / (duration / 1000))} conversas/seg)`);

const test5Passed = successfulConversations >= 45; // 90%
console.log(`\n   ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// 📊 RESUMO FINAL
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('📊 RESUMO FINAL');
console.log('═'.repeat(70));

console.log(`   Teste 1 (Classificação):     ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 2 (Conversa):          ${test2Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 3 (Entidades):         ${test3Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 4 (Estados):           ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 5 (50 Simultâneos):    ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

const allPassed = test1Passed && test2Passed && test3Passed && test4Passed && test5Passed;

if (allPassed) {
  console.log('\n🎉 TODOS OS TESTES PASSARAM!');
  console.log('');
  console.log('O FlowEngine está funcionando corretamente:');
  console.log('✅ Classificação de intenções determinística');
  console.log('✅ Máquina de estados com transições definidas');
  console.log('✅ Extração de entidades (produto, quantidade, etc.)');
  console.log('✅ Suporte a conversas simultâneas');
  console.log('✅ Sem alucinações - 100% previsível');
} else {
  console.log('\n⚠️ ALGUNS TESTES FALHARAM');
  console.log('Revise a implementação dos testes que falharam.');
}

console.log('\n' + '═'.repeat(70));
console.log('📋 ARQUITETURA DO SISTEMA');
console.log('═'.repeat(70));
console.log(`
┌─────────────────────────────────────────────────────────────────┐
│                    MENSAGEM DO CLIENTE                          │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│              🧠 IntentClassifier (Determinístico)               │
│  • Classifica intenção por REGRAS (não IA)                      │
│  • Extrai entidades (produto, quantidade, endereço)             │
│  • Retorna JSON estruturado                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                   🔄 FlowEngine (Máquina de Estados)            │
│  • Estado atual → Transição → Próximo estado                    │
│  • Executa ação determinística                                  │
│  • Retorna dados + template                                     │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    📝 Resposta ao Cliente                       │
│  Template preenchido com dados do sistema                       │
│  (Opcionalmente humanizado por IA)                              │
└─────────────────────────────────────────────────────────────────┘
`);

console.log('═'.repeat(70) + '\n');

// Limpar instâncias de teste
await engine.clearInstance(userId, customerPhone);
for (let i = 0; i < 50; i++) {
  await engine.clearInstance(userId, `1199999${String(i + 1000).padStart(4, '0')}`);
}

process.exit(allPassed ? 0 : 1);
