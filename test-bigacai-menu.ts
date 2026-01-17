// Dados reais do banco de dados BigAçaí
const menuItemsFromDB = [
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Calabresa', price: '30.00', is_available: true, display_order: 1},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Mussarela', price: '30.00', is_available: true, display_order: 2},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Atum', price: '35.00', is_available: true, display_order: 3},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Picante', price: '30.00', is_available: true, display_order: 4},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Costela', price: '36.00', is_available: true, display_order: 5},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza 4 Queijos', price: '30.00', is_available: true, display_order: 6},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Milho', price: '30.00', is_available: true, display_order: 7},
  {category_name: '🍕 Pizzas Salgadas', item_name: 'Pizza Dom Camilo', price: '30.00', is_available: true, display_order: 8},
  {category_name: '🍫 Pizzas Doces', item_name: 'Pizza Brigadeiro', price: '30.00', is_available: true, display_order: 1},
  {category_name: '🍫 Pizzas Doces', item_name: 'Pizza MM Disquete', price: '30.00', is_available: true, display_order: 2},
  {category_name: '🍫 Pizzas Doces', item_name: 'Pizza Banana', price: '30.00', is_available: true, display_order: 3},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Carne', price: '4.00', is_available: true, display_order: 1},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Queijo', price: '4.00', is_available: true, display_order: 2},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Calabresa', price: '4.00', is_available: true, display_order: 3},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Milho', price: '4.00', is_available: true, display_order: 4},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Bacon', price: '5.00', is_available: true, display_order: 5},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Frango', price: '5.00', is_available: true, display_order: 6},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Atum', price: '6.00', is_available: true, display_order: 7},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Carne c/ Queijo', price: '6.00', is_available: true, display_order: 8},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Carne c/ Requeijão', price: '6.00', is_available: true, display_order: 9},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Carne c/ Bacon', price: '7.00', is_available: true, display_order: 10},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Frango c/ Queijo', price: '7.50', is_available: true, display_order: 11},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Frango c/ Requeijão', price: '7.50', is_available: true, display_order: 12},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Banana', price: '5.00', is_available: true, display_order: 13},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha de Brigadeiro', price: '5.00', is_available: true, display_order: 14},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Disquete MM', price: '5.00', is_available: true, display_order: 15},
  {category_name: '🥟 Esfihas Abertas', item_name: 'Esfiha Romeu e Julieta', price: '5.00', is_available: true, display_order: 16},
  {category_name: '🍹 Bebidas', item_name: 'Refrigerante Lata 350ml', price: '7.00', is_available: true, display_order: 1},
  {category_name: '🍹 Bebidas', item_name: 'Refrigerante 1 Litro', price: '10.00', is_available: true, display_order: 2},
  {category_name: '🍹 Bebidas', item_name: 'Refrigerante 1.5 Litros', price: '12.00', is_available: true, display_order: 3},
  {category_name: '🍹 Bebidas', item_name: 'Refrigerante 2 Litros', price: '15.00', is_available: true, display_order: 4},
  {category_name: '🍹 Bebidas', item_name: 'Embalagem', price: '1.90', is_available: true, display_order: 5},
  {category_name: '🧀 Bordas Recheadas', item_name: 'Borda de Catupiry', price: '10.00', is_available: true, display_order: 1},
  {category_name: '🧀 Bordas Recheadas', item_name: 'Borda de Cheddar', price: '10.00', is_available: true, display_order: 2},
  {category_name: '🧀 Bordas Recheadas', item_name: 'Borda de Chocolate', price: '10.00', is_available: true, display_order: 3},
  {category_name: '🧀 Bordas Recheadas', item_name: 'Borda de 4 Queijos', price: '10.00', is_available: true, display_order: 4}
];

interface MenuCategory {
  name: string;
  items: Array<{
    name: string;
    description?: string;
    price: number;
    promotional_price?: number;
  }>;
}

interface DeliveryMenuForAI {
  business_name: string;
  business_type: string;
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  payment_methods: string[];
  categories: MenuCategory[];
  total_items: number;
}

export function formatMenuForCustomer(deliveryData: DeliveryMenuForAI): string {
  if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
    return '';
  }
  
  const formatPrice = (price: string | number | null): string => {
    if (!price) return 'Consultar';
    const num = typeof price === 'string' ? parseFloat(price) : price;
    if (isNaN(num)) return String(price);
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
  
  const MAX_SECTION_CHARS = 350; // Limite para evitar seções muito grandes (margem de segurança)
  
  for (const category of deliveryData.categories) {
    menuText += `📁 *${category.name}*\n\n`;
    
    let currentSection = '';
    let itemCount = 0;
    
    for (const item of category.items) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}* 🔥` 
        : `*${formatPrice(item.price)}*`;
      
      // Cada produto em uma linha bem formatada
      const itemLine = `▪️ ${item.name}`;
      let itemText = `${itemLine}\n`;
      
      if (item.description) {
        itemText += `   _${item.description}_\n`;
      }
      
      itemText += `   💰 ${price}\n\n`;
      
      // Se adicionar este item ultrapassar o limite, fecha a seção atual
      if (currentSection.length + itemText.length > MAX_SECTION_CHARS && currentSection.length > 0) {
        menuText += currentSection;
        menuText += '\n'; // Quebra dupla para separar sub-seções da mesma categoria
        currentSection = itemText;
      } else {
        currentSection += itemText;
      }
      
      itemCount++;
    }
    
    // Adiciona o restante da seção
    if (currentSection) {
      menuText += currentSection;
    }
    
    // Quebra dupla entre categorias
    if (deliveryData.categories.indexOf(category) < deliveryData.categories.length - 1) {
      menuText += '\n';
    }
  }
  
  // Informações de entrega
  const paymentMethods = deliveryData.payment_methods.join(', ');
  menuText += `━━━━━━━━━━━━━━━━━━━━\n`;
  menuText += `📋 *INFORMAÇÕES*\n\n`;
  
  if (deliveryData.accepts_delivery) {
    menuText += `🛵 Entrega: ${formatPrice(deliveryData.delivery_fee)}\n`;
    menuText += `⏱️ Tempo estimado: ${deliveryData.estimated_delivery_time} min\n`;
  }
  
  if (deliveryData.accepts_pickup) {
    menuText += `🏪 Retirada: GRÁTIS\n`;
  }
  
  if (deliveryData.min_order_value > 0) {
    menuText += `📦 Pedido mínimo: ${formatPrice(deliveryData.min_order_value)}\n`;
  }
  
  menuText += `💳 Pagamento: ${paymentMethods}`;
  
  return menuText;
}

function testBigAcaiMenu() {
  console.log('🔍 Testando cardápio do BigAçaí (Everton Fernandes)...\n');
  console.log(`✅ Total de itens disponíveis: ${menuItemsFromDB.length}\n`);


  // Agrupa por categoria
  const categoriesMap = new Map<string, MenuCategory>();

  menuItemsFromDB.forEach((item) => {
    const categoryName = item.category_name || '📦 Outros';
    
    if (!categoriesMap.has(categoryName)) {
      categoriesMap.set(categoryName, {
        name: categoryName,
        items: []
      });
    }

    categoriesMap.get(categoryName)!.items.push({
      name: item.item_name,
      price: parseFloat(item.price)
    });
  });

  const deliveryMenu: DeliveryMenuForAI = {
    business_name: 'Pizzaria Big',
    business_type: 'pizzaria',
    delivery_fee: 5,
    min_order_value: 20,
    estimated_delivery_time: 45,
    accepts_delivery: true,
    accepts_pickup: true,
    payment_methods: ['Dinheiro', 'Cartão', 'Pix'],
    categories: Array.from(categoriesMap.values()),
    total_items: menuItemsFromDB.length
  };

  console.log('📊 Categorias encontradas:');
  deliveryMenu.categories.forEach(cat => {
    console.log(`  - ${cat.name}: ${cat.items.length} itens`);
  });
  console.log('');

  // Formata o cardápio
  const formattedMenu = formatMenuForCustomer(deliveryMenu);

  console.log('📋 CARDÁPIO FORMATADO:\n');
  console.log(formattedMenu);
  console.log('\n');

  // Testa a divisão de mensagens
  const maxChars = 400;
  const parts = formattedMenu.split('\n\n');
  
  console.log('📨 DIVISÃO DE MENSAGENS (max 400 chars):\n');
  
  let currentMessage = '';
  let messageCount = 0;
  let brokenProducts = 0;

  parts.forEach((part, index) => {
    const isCategory = part.includes('━━━');
    
    if (currentMessage.length + part.length + 4 > maxChars) {
      // Precisa dividir
      if (currentMessage.trim()) {
        messageCount++;
        console.log(`📤 Mensagem ${messageCount} (${currentMessage.length} chars):`);
        console.log(currentMessage);
        console.log('─'.repeat(50));
        console.log('');
      }
      currentMessage = part + '\n\n';
    } else {
      currentMessage += part + '\n\n';
    }

    // Verifica se quebrou produto (tem número seguido de ponto no meio da parte)
    if (isCategory && index < parts.length - 1) {
      const nextPart = parts[index + 1];
      if (nextPart && /^\d+\./.test(nextPart)) {
        // OK, produto completo
      } else if (currentMessage.length > maxChars) {
        brokenProducts++;
      }
    }
  });

  // Última mensagem
  if (currentMessage.trim()) {
    messageCount++;
    console.log(`📤 Mensagem ${messageCount} (${currentMessage.length} chars):`);
    console.log(currentMessage);
    console.log('─'.repeat(50));
  }

  console.log('\n');
  console.log('📊 ESTATÍSTICAS:');
  console.log(`  - Total de mensagens: ${messageCount}`);
  console.log(`  - Total de caracteres: ${formattedMenu.length}`);
  console.log(`  - Produtos quebrados: ${brokenProducts}`);
  console.log(`  - Status: ${brokenProducts === 0 ? '✅ PERFEITO' : '❌ PRECISA AJUSTES'}`);
}

testBigAcaiMenu();
