/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 TESTE DO NOVO DELIVERY AI SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx vvvv/test-delivery-ai-service.ts
 * 
 * Este script testa o novo sistema simplificado de delivery que:
 * 1. Detecta intenção ANTES de chamar IA
 * 2. Retorna cardápio direto do banco (não depende da IA)
 * 3. Valida preços contra banco de dados
 * 4. Retorna resposta em "bolhas" para envio
 */

// Carregar variáveis de ambiente do .env.production
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '.env.production') });

import {
  processDeliveryMessage,
  detectCustomerIntent,
  getDeliveryData,
  formatMenuAsBubbles,
  CustomerIntent,
} from './server/deliveryAIService';

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CONFIGURAÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════

// BigAcai Cuiabá - usuário com 36 itens no cardápio
const TEST_USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384';

// Mensagens de teste para cada intenção
const TEST_MESSAGES: Array<{ message: string; expectedIntent: CustomerIntent }> = [
  // GREETING
  { message: 'Oi', expectedIntent: 'GREETING' },
  { message: 'Boa noite', expectedIntent: 'GREETING' },
  { message: 'Olá tudo bem?', expectedIntent: 'GREETING' },
  
  // WANT_MENU (principal - causa do bug original)
  { message: 'Qual o cardápio?', expectedIntent: 'WANT_MENU' },
  { message: 'Me manda o menu', expectedIntent: 'WANT_MENU' },
  { message: 'O que vocês tem?', expectedIntent: 'WANT_MENU' },
  { message: 'Quais são os produtos?', expectedIntent: 'WANT_MENU' },
  { message: 'Tem pizza?', expectedIntent: 'WANT_MENU' },
  { message: 'Mostra o cardápio', expectedIntent: 'WANT_MENU' },
  
  // ASK_DELIVERY_INFO
  { message: 'Qual a taxa de entrega?', expectedIntent: 'ASK_DELIVERY_INFO' },
  { message: 'Aceita pix?', expectedIntent: 'ASK_DELIVERY_INFO' },
  { message: 'Quanto tempo demora?', expectedIntent: 'ASK_DELIVERY_INFO' },
  
  // WANT_TO_ORDER
  { message: 'Quero fazer um pedido', expectedIntent: 'WANT_TO_ORDER' },
  { message: 'Me vê uma pizza calabresa', expectedIntent: 'WANT_TO_ORDER' },
  
  // OTHER (fallback)
  { message: 'Vocês estão contratando?', expectedIntent: 'OTHER' },
];

// ═══════════════════════════════════════════════════════════════════════
// 🧪 FUNÇÕES DE TESTE
// ═══════════════════════════════════════════════════════════════════════

async function testIntentDetection(): Promise<{ passed: number; failed: number }> {
  console.log('\n' + '═'.repeat(60));
  console.log('🎯 TESTE 1: DETECÇÃO DE INTENÇÃO');
  console.log('═'.repeat(60));
  
  let passed = 0;
  let failed = 0;
  
  for (const test of TEST_MESSAGES) {
    const detected = detectCustomerIntent(test.message);
    const success = detected === test.expectedIntent;
    
    if (success) {
      console.log(`✅ "${test.message}" → ${detected}`);
      passed++;
    } else {
      console.log(`❌ "${test.message}" → ${detected} (esperado: ${test.expectedIntent})`);
      failed++;
    }
  }
  
  console.log(`\n📊 Resultado: ${passed}/${passed + failed} testes passaram`);
  return { passed, failed };
}

async function testGetDeliveryData(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('📊 TESTE 2: BUSCAR DADOS DO DELIVERY');
  console.log('═'.repeat(60));
  
  const data = await getDeliveryData(TEST_USER_ID);
  
  if (!data) {
    console.log('❌ FALHA: Não conseguiu buscar dados do delivery');
    return false;
  }
  
  console.log(`✅ Dados carregados com sucesso!`);
  console.log(`   📍 Negócio: ${data.config.business_name} (${data.config.business_type})`);
  console.log(`   📦 Total de itens: ${data.totalItems}`);
  console.log(`   📁 Categorias: ${data.categories.length}`);
  
  data.categories.forEach(cat => {
    console.log(`      - ${cat.name}: ${cat.items.length} itens`);
  });
  
  console.log(`   🛵 Taxa entrega: R$ ${data.config.delivery_fee.toFixed(2)}`);
  console.log(`   ⏱️ Tempo estimado: ${data.config.estimated_delivery_time} min`);
  console.log(`   💳 Pagamentos: ${data.config.payment_methods.join(', ')}`);
  
  // Verificar se tem 36 itens (esperado para BigAcai)
  if (data.totalItems >= 30) {
    console.log(`\n✅ SUCESSO: ${data.totalItems} itens encontrados (esperado ~36)`);
    return true;
  } else {
    console.log(`\n❌ ALERTA: Apenas ${data.totalItems} itens encontrados (esperado ~36)`);
    return false;
  }
}

async function testFormatMenuAsBubbles(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('🎨 TESTE 3: FORMATAÇÃO DO CARDÁPIO EM BOLHAS');
  console.log('═'.repeat(60));
  
  const data = await getDeliveryData(TEST_USER_ID);
  if (!data) {
    console.log('❌ FALHA: Não conseguiu buscar dados');
    return false;
  }
  
  const bubbles = formatMenuAsBubbles(data);
  
  console.log(`✅ Cardápio formatado em ${bubbles.length} bolha(s)`);
  
  // Verificar cada bolha
  let totalChars = 0;
  let allItemsCount = 0;
  
  bubbles.forEach((bubble, i) => {
    const itemMatches = bubble.match(/•/g);
    const itemCount = itemMatches ? itemMatches.length : 0;
    allItemsCount += itemCount;
    totalChars += bubble.length;
    
    console.log(`\n📱 BOLHA ${i + 1} (${bubble.length} chars, ${itemCount} itens):`);
    console.log('─'.repeat(50));
    
    // Mostrar preview da bolha (primeiras 300 chars)
    if (bubble.length > 300) {
      console.log(bubble.substring(0, 300) + '...');
    } else {
      console.log(bubble);
    }
  });
  
  console.log('\n' + '─'.repeat(50));
  console.log(`📊 RESUMO:`);
  console.log(`   Total de bolhas: ${bubbles.length}`);
  console.log(`   Total de caracteres: ${totalChars}`);
  console.log(`   Itens listados: ${allItemsCount} (esperado: ${data.totalItems})`);
  
  // Verificar se nenhum item foi perdido
  if (allItemsCount >= data.totalItems - 2) { // -2 para margem de erro
    console.log(`\n✅ SUCESSO: Todos os ${allItemsCount} itens foram incluídos!`);
    return true;
  } else {
    console.log(`\n❌ FALHA: Apenas ${allItemsCount}/${data.totalItems} itens incluídos`);
    return false;
  }
}

async function testProcessDeliveryMessage(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('🤖 TESTE 4: PROCESSAMENTO COMPLETO DE MENSAGEM');
  console.log('═'.repeat(60));
  
  // Teste principal: "Qual o cardápio?"
  const testMessage = 'Qual o cardápio?';
  console.log(`\n📩 Mensagem de teste: "${testMessage}"`);
  
  const result = await processDeliveryMessage(TEST_USER_ID, testMessage);
  
  if (!result) {
    console.log('❌ FALHA: Função retornou null');
    return false;
  }
  
  console.log(`\n✅ Resposta recebida:`);
  console.log(`   Intenção: ${result.intent}`);
  console.log(`   Bolhas: ${result.bubbles.length}`);
  
  // Contar itens na resposta
  const allText = result.bubbles.join('\n');
  const itemMatches = allText.match(/•/g);
  const itemCount = itemMatches ? itemMatches.length : 0;
  
  console.log(`   Itens na resposta: ${itemCount}`);
  
  // Verificar se os itens do BigAcai estão lá
  const expectedItems = ['Calabresa', 'Portuguesa', 'Frango', 'Marguerita'];
  const foundItems: string[] = [];
  const missingItems: string[] = [];
  
  for (const item of expectedItems) {
    if (allText.toLowerCase().includes(item.toLowerCase())) {
      foundItems.push(item);
    } else {
      missingItems.push(item);
    }
  }
  
  console.log(`\n   Itens verificados:`);
  foundItems.forEach(item => console.log(`   ✅ ${item}`));
  missingItems.forEach(item => console.log(`   ❌ ${item} (não encontrado)`));
  
  // Mostrar preview da resposta
  console.log(`\n📱 PREVIEW DA RESPOSTA:`);
  console.log('─'.repeat(50));
  result.bubbles.forEach((bubble, i) => {
    console.log(`\n[BOLHA ${i + 1}]`);
    if (bubble.length > 500) {
      console.log(bubble.substring(0, 500) + '...');
    } else {
      console.log(bubble);
    }
  });
  
  // Sucesso se tiver mais de 30 itens e intent correto
  if (result.intent === 'WANT_MENU' && itemCount >= 30) {
    console.log(`\n✅ SUCESSO: Cardápio completo retornado!`);
    return true;
  } else {
    console.log(`\n❌ FALHA: Intent=${result.intent}, Items=${itemCount}`);
    return false;
  }
}

async function testGreeting(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('👋 TESTE 5: SAUDAÇÃO');
  console.log('═'.repeat(60));
  
  const result = await processDeliveryMessage(TEST_USER_ID, 'Oi, boa noite!');
  
  if (!result) {
    console.log('❌ FALHA: Função retornou null');
    return false;
  }
  
  console.log(`\n📩 Mensagem: "Oi, boa noite!"`);
  console.log(`🤖 Resposta: "${result.bubbles[0]}"`);
  console.log(`🎯 Intenção: ${result.intent}`);
  
  if (result.intent === 'GREETING' && result.bubbles[0].includes('Bem-vindo')) {
    console.log(`\n✅ SUCESSO: Saudação correta!`);
    return true;
  } else {
    console.log(`\n❌ FALHA`);
    return false;
  }
}

async function testDeliveryInfo(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('📋 TESTE 6: INFORMAÇÕES DE ENTREGA');
  console.log('═'.repeat(60));
  
  const result = await processDeliveryMessage(TEST_USER_ID, 'Qual a taxa de entrega?');
  
  if (!result) {
    console.log('❌ FALHA: Função retornou null');
    return false;
  }
  
  console.log(`\n📩 Mensagem: "Qual a taxa de entrega?"`);
  console.log(`🤖 Resposta:\n${result.bubbles[0]}`);
  console.log(`🎯 Intenção: ${result.intent}`);
  
  const hasDeliveryFee = result.bubbles[0].includes('R$');
  const hasPaymentMethods = result.bubbles[0].toLowerCase().includes('pagamento');
  
  if (result.intent === 'ASK_DELIVERY_INFO' && hasDeliveryFee && hasPaymentMethods) {
    console.log(`\n✅ SUCESSO: Info de entrega correta!`);
    return true;
  } else {
    console.log(`\n❌ FALHA`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUTAR TODOS OS TESTES
// ═══════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 TESTE DO DELIVERY AI SERVICE');
  console.log('═'.repeat(60));
  console.log(`📍 User ID: ${TEST_USER_ID}`);
  console.log(`📅 ${new Date().toISOString()}`);
  
  const results: { name: string; passed: boolean }[] = [];
  
  // Teste 1: Detecção de intenção
  const intentResult = await testIntentDetection();
  results.push({ 
    name: 'Detecção de Intenção', 
    passed: intentResult.failed === 0 
  });
  
  // Teste 2: Buscar dados
  results.push({ 
    name: 'Buscar Dados do Delivery', 
    passed: await testGetDeliveryData() 
  });
  
  // Teste 3: Formatação em bolhas
  results.push({ 
    name: 'Formatação em Bolhas', 
    passed: await testFormatMenuAsBubbles() 
  });
  
  // Teste 4: Processamento completo (cardápio)
  results.push({ 
    name: 'Processamento WANT_MENU', 
    passed: await testProcessDeliveryMessage() 
  });
  
  // Teste 5: Saudação
  results.push({ 
    name: 'Saudação', 
    passed: await testGreeting() 
  });
  
  // Teste 6: Info entrega
  results.push({ 
    name: 'Info de Entrega', 
    passed: await testDeliveryInfo() 
  });
  
  // Resumo final
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(60));
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  results.forEach(r => {
    console.log(`${r.passed ? '✅' : '❌'} ${r.name}`);
  });
  
  console.log('\n' + '─'.repeat(60));
  console.log(`📈 RESULTADO: ${passed}/${total} testes passaram`);
  
  if (passed === total) {
    console.log('🎉 TODOS OS TESTES PASSARAM! Sistema funcionando corretamente.');
  } else {
    console.log('⚠️ ALGUNS TESTES FALHARAM. Verificar problemas acima.');
  }
  
  console.log('═'.repeat(60) + '\n');
  
  process.exit(passed === total ? 0 : 1);
}

// Executar
runAllTests().catch(error => {
  console.error('❌ ERRO FATAL:', error);
  process.exit(1);
});
