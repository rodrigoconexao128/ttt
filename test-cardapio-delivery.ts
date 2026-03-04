/**
 * 🧪 TESTE DO SISTEMA DE CARDÁPIO DELIVERY
 * 
 * Este arquivo demonstra como testar o novo sistema de envio de cardápio
 * que garante formatação bonita e divisão inteligente de mensagens.
 */

import { formatMenuForCustomer, DeliveryMenuForAIResponse } from './server/aiAgent';

// Exemplo de cardápio de teste (pizzaria)
const testMenuPizzaria: DeliveryMenuForAIResponse = {
  active: true,
  business_name: 'Pizzaria Delícia',
  business_type: 'pizzaria',
  delivery_fee: 5.00,
  min_order_value: 30.00,
  estimated_delivery_time: 45,
  accepts_delivery: true,
  accepts_pickup: true,
  payment_methods: ['Dinheiro', 'Cartão de Crédito', 'Cartão de Débito', 'Pix'],
  total_items: 8,
  displayInstructions: null,
  categories: [
    {
      name: 'Pizzas Tradicionais',
      items: [
        {
          id: '1',
          name: 'Pizza Calabresa',
          description: 'Calabresa, queijo, cebola e azeitonas',
          price: '50.00',
          promotional_price: '45.00',
          category_name: 'Pizzas Tradicionais',
          preparation_time: 30,
          ingredients: 'Calabresa, mussarela, cebola, azeitonas',
          serves: 2,
          is_featured: true,
        },
        {
          id: '2',
          name: 'Pizza Margherita',
          description: 'Molho de tomate, queijo e manjericão fresco',
          price: '40.00',
          promotional_price: null,
          category_name: 'Pizzas Tradicionais',
          preparation_time: 30,
          ingredients: 'Molho de tomate, mussarela, manjericão',
          serves: 2,
          is_featured: false,
        },
        {
          id: '3',
          name: 'Pizza Portuguesa',
          description: 'Presunto, ovos, cebola, azeitonas e ervilha',
          price: '48.00',
          promotional_price: null,
          category_name: 'Pizzas Tradicionais',
          preparation_time: 30,
          ingredients: 'Presunto, ovos, mussarela, cebola, azeitonas, ervilha',
          serves: 2,
          is_featured: false,
        },
      ]
    },
    {
      name: 'Pizzas Especiais',
      items: [
        {
          id: '4',
          name: 'Pizza 4 Queijos',
          description: 'Mussarela, provolone, parmesão e gorgonzola',
          price: '52.00',
          promotional_price: null,
          category_name: 'Pizzas Especiais',
          preparation_time: 35,
          ingredients: 'Mussarela, provolone, parmesão, gorgonzola',
          serves: 2,
          is_featured: true,
        },
        {
          id: '5',
          name: 'Pizza Frango com Catupiry',
          description: 'Frango desfiado com catupiry original',
          price: '48.00',
          promotional_price: null,
          category_name: 'Pizzas Especiais',
          preparation_time: 35,
          ingredients: 'Frango, catupiry, mussarela',
          serves: 2,
          is_featured: false,
        },
      ]
    },
    {
      name: 'Bebidas',
      items: [
        {
          id: '6',
          name: 'Coca-Cola Lata 350ml',
          description: null,
          price: '5.00',
          promotional_price: null,
          category_name: 'Bebidas',
          preparation_time: 0,
          ingredients: null,
          serves: 1,
          is_featured: false,
        },
        {
          id: '7',
          name: 'Coca-Cola 2L',
          description: null,
          price: '12.00',
          promotional_price: '10.00',
          category_name: 'Bebidas',
          preparation_time: 0,
          ingredients: null,
          serves: 1,
          is_featured: false,
        },
        {
          id: '8',
          name: 'Suco Natural Laranja 500ml',
          description: 'Suco natural de laranja sem açúcar',
          price: '8.00',
          promotional_price: null,
          category_name: 'Bebidas',
          preparation_time: 5,
          ingredients: 'Laranja',
          serves: 1,
          is_featured: false,
        },
      ]
    }
  ]
};

// Exemplo de cardápio menor (hamburgueria)
const testMenuHamburgueria: DeliveryMenuForAIResponse = {
  active: true,
  business_name: 'Burger House',
  business_type: 'hamburgueria',
  delivery_fee: 3.50,
  min_order_value: 20.00,
  estimated_delivery_time: 30,
  accepts_delivery: true,
  accepts_pickup: true,
  payment_methods: ['Dinheiro', 'Pix'],
  total_items: 3,
  displayInstructions: null,
  categories: [
    {
      name: 'Hambúrgueres',
      items: [
        {
          id: '1',
          name: 'X-Burguer',
          description: 'Hambúrguer, queijo, alface, tomate',
          price: '18.00',
          promotional_price: null,
          category_name: 'Hambúrgueres',
          preparation_time: 15,
          ingredients: 'Pão, hambúrguer, queijo, alface, tomate',
          serves: 1,
          is_featured: true,
        },
        {
          id: '2',
          name: 'X-Bacon',
          description: 'Hambúrguer, queijo, bacon crocante',
          price: '22.00',
          promotional_price: '20.00',
          category_name: 'Hambúrgueres',
          preparation_time: 15,
          ingredients: 'Pão, hambúrguer, queijo, bacon',
          serves: 1,
          is_featured: false,
        },
        {
          id: '3',
          name: 'X-Tudo',
          description: 'Tudo que você imaginar',
          price: '28.00',
          promotional_price: null,
          category_name: 'Hambúrgueres',
          preparation_time: 20,
          ingredients: 'Pão, 2 hambúrgueres, queijo, bacon, ovo, presunto, alface, tomate',
          serves: 1,
          is_featured: false,
        },
      ]
    }
  ]
};

/**
 * Testa formatação do cardápio
 */
function testFormatMenu() {
  console.log('\n🧪 ═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE 1: Formatação de Cardápio - Pizzaria (8 itens)');
  console.log('🧪 ═══════════════════════════════════════════════════════════\n');
  
  const formatted = formatMenuForCustomer(testMenuPizzaria);
  console.log(formatted);
  console.log(`\n📊 Tamanho: ${formatted.length} caracteres`);
  
  // Verificar se tem produtos completos (não quebrados)
  const products = formatted.match(/▪️|⭐/g);
  console.log(`📦 Produtos encontrados: ${products?.length || 0}`);
  
  console.log('\n🧪 ═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE 2: Formatação de Cardápio - Hamburgueria (3 itens)');
  console.log('🧪 ═══════════════════════════════════════════════════════════\n');
  
  const formatted2 = formatMenuForCustomer(testMenuHamburgueria);
  console.log(formatted2);
  console.log(`\n📊 Tamanho: ${formatted2.length} caracteres`);
}

/**
 * Simula divisão de mensagem (função do whatsapp.ts)
 */
function simulateSplitMessage(message: string, maxChars: number = 400): string[] {
  if (message.length <= maxChars) {
    return [message];
  }
  
  const parts: string[] = [];
  const sections = message.split('\n\n').filter(s => s.trim());
  
  let currentPart = '';
  for (const section of sections) {
    const combined = currentPart ? currentPart + '\n\n' + section : section;
    
    if (combined.length <= maxChars) {
      currentPart = combined;
    } else {
      if (currentPart) {
        parts.push(currentPart);
      }
      currentPart = section;
    }
  }
  
  if (currentPart) {
    parts.push(currentPart);
  }
  
  return parts;
}

/**
 * Testa divisão de mensagens longas
 */
function testMessageSplitting() {
  console.log('\n🧪 ═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE 3: Divisão de Mensagens (limite 400 chars)');
  console.log('🧪 ═══════════════════════════════════════════════════════════\n');
  
  const formattedMenu = formatMenuForCustomer(testMenuPizzaria);
  const parts = simulateSplitMessage(formattedMenu, 400);
  
  console.log(`📨 Mensagem dividida em ${parts.length} partes\n`);
  
  parts.forEach((part, index) => {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📱 MENSAGEM ${index + 1}/${parts.length} (${part.length} chars)`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);
    console.log(part);
    console.log('\n');
    
    // Verificar se produtos foram quebrados (não deve acontecer!)
    const hasIncompleteProduct = part.includes('▪️') && !part.match(/💰.*\n/);
    if (hasIncompleteProduct) {
      console.log('⚠️ ALERTA: Produto pode estar incompleto!');
    } else {
      console.log('✅ Todos os produtos estão completos');
    }
  });
}

/**
 * Testa simulação de resposta da IA com tag
 */
function testAIResponse() {
  console.log('\n🧪 ═══════════════════════════════════════════════════════════');
  console.log('🧪 TESTE 4: Simulação de Resposta da IA com Tag');
  console.log('🧪 ═══════════════════════════════════════════════════════════\n');
  
  // Simular resposta da IA
  let aiResponse = `[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! 😊

Temos pizzas deliciosas saindo do forno! 🍕

Quer fazer um pedido?`;
  
  console.log('🤖 Resposta original da IA:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(aiResponse);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  // Simular processamento (o que acontece no aiAgent.ts)
  if (aiResponse.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
    const formattedMenu = formatMenuForCustomer(testMenuPizzaria);
    aiResponse = aiResponse.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
  }
  
  console.log('📱 Mensagem final enviada ao cliente:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(aiResponse);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`📊 Tamanho final: ${aiResponse.length} caracteres\n`);
  
  // Verificar se seria dividido
  if (aiResponse.length > 400) {
    const parts = simulateSplitMessage(aiResponse, 400);
    console.log(`📨 Seria dividido em ${parts.length} mensagens WhatsApp`);
  } else {
    console.log('📨 Cabe em uma única mensagem WhatsApp');
  }
}

/**
 * Executa todos os testes
 */
function runAllTests() {
  console.log('\n');
  console.log('🚀 ═══════════════════════════════════════════════════════════');
  console.log('🚀 INICIANDO TESTES DO SISTEMA DE CARDÁPIO DELIVERY');
  console.log('🚀 ═══════════════════════════════════════════════════════════');
  
  testFormatMenu();
  testMessageSplitting();
  testAIResponse();
  
  console.log('\n🎉 ═══════════════════════════════════════════════════════════');
  console.log('🎉 TODOS OS TESTES CONCLUÍDOS!');
  console.log('🎉 ═══════════════════════════════════════════════════════════\n');
}

// Executar testes se rodado diretamente
if (require.main === module) {
  runAllTests();
}

export { testFormatMenu, testMessageSplitting, testAIResponse, runAllTests };
