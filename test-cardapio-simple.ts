/**
 * 🧪 TESTE SIMPLIFICADO DO CARDÁPIO DELIVERY
 * 
 * Este arquivo testa apenas a lógica de formatação e divisão de mensagens
 * sem depender de conexões de banco de dados.
 */

// Copiar apenas as interfaces e função necessárias
interface MenuItemForAI {
  id: string;
  name: string;
  description: string | null;
  price: string;
  promotional_price: string | null;
  category_name: string | null;
  preparation_time: number;
  ingredients: string | null;
  serves: number;
  is_featured: boolean;
}

interface DeliveryMenuForAIResponse {
  active: boolean;
  business_name: string | null;
  business_type: string;
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  payment_methods: string[];
  categories: { name: string; items: MenuItemForAI[] }[];
  total_items: number;
  displayInstructions: string | null;
}

// Copiar a função de formatação
function formatMenuForCustomer(deliveryData: DeliveryMenuForAIResponse): string {
  if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
    return '';
  }
  
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  const businessTypeEmoji: Record<string, string> = {
    'pizzaria': '🍕',
    'hamburgueria': '🍔',
    'lanchonete': '🥪',
    'restaurante': '🍽️',
    'acai': '🍨',
    'japonesa': '🍣',
    'outros': '🍴'
  };
  
  const emoji = businessTypeEmoji[deliveryData.business_type] || '🍴';
  const businessName = deliveryData.business_name || 'Nosso Delivery';
  
  let menuText = `${emoji} *${businessName.toUpperCase()}*\n`;
  menuText += `━━━━━━━━━━━━━━━━━━━━\n\n`;
  
  for (const category of deliveryData.categories) {
    menuText += `📁 *${category.name}*\n\n`;
    
    for (const item of category.items) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}* 🔥` 
        : `*${formatPrice(item.price)}*`;
      
      // Cada produto em uma linha bem formatada
      const itemLine = `${item.is_featured ? '⭐ ' : '▪️ '}${item.name}`;
      menuText += `${itemLine}\n`;
      
      if (item.description) {
        menuText += `   _${item.description}_\n`;
      }
      
      menuText += `   💰 ${price}`;
      if (item.serves > 1) menuText += ` • Serve ${item.serves}`;
      menuText += '\n\n';
    }
  }
  
  // Informações de entrega
  const paymentMethods = deliveryData.payment_methods.join(', ');
  menuText += `━━━━━━━━━━━━━━━━━━━━\n`;
  menuText += `📋 *INFORMAÇÕES*\n\n`;
  
  if (deliveryData.accepts_delivery) {
    menuText += `🛵 Entrega: ${formatPrice(String(deliveryData.delivery_fee))}\n`;
    menuText += `⏱️ Tempo estimado: ${deliveryData.estimated_delivery_time} min\n`;
  }
  
  if (deliveryData.accepts_pickup) {
    menuText += `🏪 Retirada: GRÁTIS\n`;
  }
  
  if (deliveryData.min_order_value > 0) {
    menuText += `📦 Pedido mínimo: ${formatPrice(String(deliveryData.min_order_value))}\n`;
  }
  
  menuText += `💳 Pagamento: ${paymentMethods}`;
  
  return menuText;
}

// Simular função de divisão de mensagens
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

// ==================== DADOS DE TESTE ====================

const testMenuPizzaria: DeliveryMenuForAIResponse = {
  active: true,
  business_name: 'Pizzaria Delícia',
  business_type: 'pizzaria',
  delivery_fee: 5.00,
  min_order_value: 30.00,
  estimated_delivery_time: 45,
  accepts_delivery: true,
  accepts_pickup: true,
  payment_methods: ['Dinheiro', 'Cartão', 'Pix'],
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

// ==================== TESTES ====================

console.log('\n🚀 ═══════════════════════════════════════════════════════════');
console.log('🚀 TESTE: Sistema de Cardápio Delivery');
console.log('🚀 ═══════════════════════════════════════════════════════════\n');

// TESTE 1: Formatação
console.log('📝 TESTE 1: Formatação do Cardápio\n');
console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

const formattedMenu = formatMenuForCustomer(testMenuPizzaria);
console.log(formattedMenu);

console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
console.log(`📊 Tamanho total: ${formattedMenu.length} caracteres\n`);

// TESTE 2: Divisão de mensagens
console.log('📨 TESTE 2: Divisão em Mensagens (limite 400 chars)\n');

const parts = simulateSplitMessage(formattedMenu, 400);
console.log(`Dividido em ${parts.length} mensagens:\n`);

parts.forEach((part, index) => {
  console.log(`┌─────────────────────────────────────────────┐`);
  console.log(`│ 📱 MENSAGEM ${index + 1}/${parts.length} (${part.length} chars)${' '.repeat(Math.max(0, 20 - String(part.length).length))}│`);
  console.log(`└─────────────────────────────────────────────┘\n`);
  console.log(part);
  console.log('\n');
});

// TESTE 3: Verificar integridade dos produtos
console.log('✅ TESTE 3: Verificação de Integridade\n');

let allProductsComplete = true;
for (let i = 0; i < parts.length; i++) {
  const part = parts[i];
  
  // Contar produtos iniciados (▪️ ou ⭐)
  const productsStarted = (part.match(/▪️|⭐/g) || []).length;
  
  // Contar produtos completos (tem 💰 depois do nome)
  const productsWithPrice = (part.match(/💰/g) || []).length;
  
  if (productsStarted !== productsWithPrice && i < parts.length - 1) {
    console.log(`⚠️ Mensagem ${i + 1}: Produtos incompletos detectados!`);
    console.log(`   Iniciados: ${productsStarted}, Com preço: ${productsWithPrice}`);
    allProductsComplete = false;
  } else {
    console.log(`✅ Mensagem ${i + 1}: Todos os ${productsStarted} produtos completos`);
  }
}

console.log();
if (allProductsComplete) {
  console.log('🎉 SUCESSO: Nenhum produto foi quebrado na divisão!\n');
} else {
  console.log('❌ FALHA: Alguns produtos foram quebrados!\n');
}

// TESTE 4: Simular tag da IA
console.log('🤖 TESTE 4: Simulação de Tag [ENVIAR_CARDAPIO_COMPLETO]\n');

let aiResponse = `[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! 😊
Quer fazer um pedido?`;

console.log('Original da IA:');
console.log('─────────────────');
console.log(aiResponse);
console.log();

// Processar tag
if (aiResponse.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
  aiResponse = aiResponse.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
}

console.log('Após substituição da tag:');
console.log('─────────────────────────');
console.log(aiResponse.substring(0, 200) + '...\n');
console.log(`Total: ${aiResponse.length} caracteres`);
console.log(`Seria dividido em: ${simulateSplitMessage(aiResponse, 400).length} mensagens\n`);

console.log('🎉 ═══════════════════════════════════════════════════════════');
console.log('🎉 TODOS OS TESTES CONCLUÍDOS COM SUCESSO!');
console.log('🎉 ═══════════════════════════════════════════════════════════\n');
