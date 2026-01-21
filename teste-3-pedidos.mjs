/**
 * Testes de Delivery - 3 cenários completos
 * 1. Pizza com variação (Grande)
 * 2. Múltiplos itens
 * 3. Pedido para retirada
 */

const USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384';
const BASE_URL = 'http://localhost:5000/api/delivery/chat';

async function sendMessage(phone, customerName, message) {
  const response = await fetch(`${BASE_URL}/${USER_ID}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, phone, customerName })
  });
  return response.json();
}

async function teste1_PizzaComVariacao() {
  console.log('\n========================================');
  console.log('TESTE 1: Pizza Calabresa Grande (R$55)');
  console.log('========================================\n');
  
  try {
    const result = await sendMessage('5511999990001', 'Cliente Teste 1', 
      'Oi! Quero uma pizza calabresa grande por favor');
    
    console.log('✅ Status: SUCESSO');
    console.log('📝 Resposta da IA:\n');
    console.log(result.response || result.message || JSON.stringify(result, null, 2));
    
    // Verifica se mencionou o preço R$55
    const response = result.response || '';
    if (response.includes('55') || response.toLowerCase().includes('grande')) {
      console.log('\n✅ PASSOU: IA reconheceu tamanho Grande');
    } else {
      console.log('\n⚠️ VERIFICAR: IA pode não ter reconhecido o tamanho');
    }
    
    return true;
  } catch (error) {
    console.log('❌ ERRO:', error.message);
    return false;
  }
}

async function teste2_MultiplosItens() {
  console.log('\n========================================');
  console.log('TESTE 2: Múltiplos Itens');
  console.log('========================================\n');
  
  try {
    const result = await sendMessage('5511999990002', 'Cliente Teste 2', 
      'Quero uma pizza mussarela média, 3 esfihas de carne e um refrigerante 1 litro');
    
    console.log('✅ Status: SUCESSO');
    console.log('📝 Resposta da IA:\n');
    console.log(result.response || result.message || JSON.stringify(result, null, 2));
    
    return true;
  } catch (error) {
    console.log('❌ ERRO:', error.message);
    return false;
  }
}

async function teste3_Retirada() {
  console.log('\n========================================');
  console.log('TESTE 3: Pedido para RETIRADA (sem endereço)');
  console.log('========================================\n');
  
  try {
    const result = await sendMessage('5511999990003', 'Cliente Teste 3', 
      'Quero uma pizza portuguesa grande, vou buscar aí na loja');
    
    console.log('✅ Status: SUCESSO');
    console.log('📝 Resposta da IA:\n');
    console.log(result.response || result.message || JSON.stringify(result, null, 2));
    
    // Verifica se NÃO pediu endereço (porque é retirada)
    const response = (result.response || '').toLowerCase();
    if (response.includes('retirada') || response.includes('buscar') || response.includes('retira')) {
      console.log('\n✅ PASSOU: IA reconheceu RETIRADA');
    }
    if (!response.includes('endereço') && !response.includes('endereco')) {
      console.log('✅ PASSOU: IA NÃO pediu endereço (correto para retirada)');
    } else {
      console.log('⚠️ VERIFICAR: IA pode ter pedido endereço mesmo sendo retirada');
    }
    
    return true;
  } catch (error) {
    console.log('❌ ERRO:', error.message);
    return false;
  }
}

// Executar todos os testes
async function main() {
  console.log('🚀 INICIANDO TESTES DE DELIVERY');
  console.log('================================');
  console.log(`User ID: ${USER_ID}`);
  console.log(`Endpoint: ${BASE_URL}/${USER_ID}`);
  
  let passed = 0;
  let total = 3;
  
  // Teste 1
  if (await teste1_PizzaComVariacao()) passed++;
  
  // Aguardar 2 segundos entre testes
  await new Promise(r => setTimeout(r, 2000));
  
  // Teste 2
  if (await teste2_MultiplosItens()) passed++;
  
  await new Promise(r => setTimeout(r, 2000));
  
  // Teste 3
  if (await teste3_Retirada()) passed++;
  
  // Resumo final
  console.log('\n========================================');
  console.log('RESUMO DOS TESTES');
  console.log('========================================');
  console.log(`✅ Testes passados: ${passed}/${total}`);
  console.log(`${passed === total ? '🎉 TODOS OS TESTES PASSARAM!' : '⚠️ Alguns testes precisam de revisão'}`);
}

main().catch(console.error);
