/**
 * Debug: Testa formatMenuForCustomer com os dados REAIS do BigAcai do Supabase
 */

// Interface baseada no código do aiAgent.ts
interface MenuItemForAI {
  id: string;
  name: string;
  description: string | null;
  price: string;
  promotional_price: string | null;
  category_name: string | null;
  preparation_time: number | null;
  ingredients: string[] | null;
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

// Função copiada EXATAMENTE do server/aiAgent.ts
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
  
  const MAX_SECTION_CHARS = 350;
  
  for (const category of deliveryData.categories) {
    menuText += `📁 *${category.name}*\n\n`;
    
    let currentSection = '';
    let itemCount = 0;
    
    for (const item of category.items) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}* 🔥` 
        : `*${formatPrice(item.price)}*`;
      
      const itemLine = `${item.is_featured ? '⭐ ' : '▪️ '}${item.name}`;
      let itemText = `${itemLine}\n`;
      
      if (item.description) {
        itemText += `   _${item.description}_\n`;
      }
      
      itemText += `   💰 ${price}`;
      if (item.serves > 1) itemText += ` • Serve ${item.serves}`;
      itemText += '\n\n';
      
      if (currentSection.length + itemText.length > MAX_SECTION_CHARS && currentSection.length > 0) {
        menuText += currentSection;
        menuText += '\n';
        currentSection = itemText;
      } else {
        currentSection += itemText;
      }
      
      itemCount++;
    }
    
    if (currentSection) {
      menuText += currentSection;
    }
    
    if (deliveryData.categories.indexOf(category) < deliveryData.categories.length - 1) {
      menuText += '\n';
    }
  }
  
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

// DADOS REAIS DO BANCO SUPABASE (36 itens confirmados)
const realMenu: DeliveryMenuForAIResponse = {
  active: true,
  business_name: "Pizzaria Big",
  business_type: "pizzaria",
  delivery_fee: 5,
  min_order_value: 20,
  estimated_delivery_time: 45,
  accepts_delivery: true,
  accepts_pickup: true,
  payment_methods: ["Dinheiro", "Cartão", "Pix"],
  displayInstructions: null,
  total_items: 36,
  categories: [
    {
      name: "🍕 Pizzas Salgadas",
      items: [
        { id: "1", name: "Pizza Calabresa", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "2", name: "Pizza Mussarela", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "3", name: "Pizza Atum", description: null, price: "35.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "4", name: "Pizza Picante", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "5", name: "Pizza Costela", description: null, price: "36.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "6", name: "Pizza 4 Queijos", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "7", name: "Pizza Milho", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "8", name: "Pizza Dom Camilo", description: null, price: "30.00", promotional_price: null, category_name: "🍕 Pizzas Salgadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
      ]
    },
    {
      name: "🍫 Pizzas Doces",
      items: [
        { id: "9", name: "Pizza Brigadeiro", description: null, price: "30.00", promotional_price: null, category_name: "🍫 Pizzas Doces", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "10", name: "Pizza MM Disquete", description: null, price: "30.00", promotional_price: null, category_name: "🍫 Pizzas Doces", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "11", name: "Pizza Banana", description: null, price: "30.00", promotional_price: null, category_name: "🍫 Pizzas Doces", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
      ]
    },
    {
      name: "🥟 Esfihas Abertas",
      items: [
        { id: "12", name: "Esfiha de Carne", description: null, price: "4.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "13", name: "Esfiha de Queijo", description: null, price: "4.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "14", name: "Esfiha de Calabresa", description: null, price: "4.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "15", name: "Esfiha de Milho", description: null, price: "4.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "16", name: "Esfiha de Bacon", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "17", name: "Esfiha de Frango", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "18", name: "Esfiha de Atum", description: null, price: "6.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "19", name: "Esfiha Carne c/ Queijo", description: null, price: "6.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "20", name: "Esfiha Carne c/ Requeijão", description: null, price: "6.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "21", name: "Esfiha Carne c/ Bacon", description: null, price: "7.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "22", name: "Esfiha Frango c/ Queijo", description: null, price: "7.50", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "23", name: "Esfiha Frango c/ Requeijão", description: null, price: "7.50", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "24", name: "Esfiha de Banana", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "25", name: "Esfiha de Brigadeiro", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "26", name: "Esfiha Disquete MM", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "27", name: "Esfiha Romeu e Julieta", description: null, price: "5.00", promotional_price: null, category_name: "🥟 Esfihas Abertas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
      ]
    },
    {
      name: "🍹 Bebidas",
      items: [
        { id: "28", name: "Refrigerante Lata 350ml", description: null, price: "7.00", promotional_price: null, category_name: "🍹 Bebidas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "29", name: "Refrigerante 1 Litro", description: null, price: "10.00", promotional_price: null, category_name: "🍹 Bebidas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "30", name: "Refrigerante 1.5 Litros", description: null, price: "12.00", promotional_price: null, category_name: "🍹 Bebidas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "31", name: "Refrigerante 2 Litros", description: null, price: "15.00", promotional_price: null, category_name: "🍹 Bebidas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "32", name: "Embalagem", description: null, price: "1.90", promotional_price: null, category_name: "🍹 Bebidas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
      ]
    },
    {
      name: "🧀 Bordas Recheadas",
      items: [
        { id: "33", name: "Borda de Catupiry", description: null, price: "10.00", promotional_price: null, category_name: "🧀 Bordas Recheadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "34", name: "Borda de Cheddar", description: null, price: "10.00", promotional_price: null, category_name: "🧀 Bordas Recheadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "35", name: "Borda de Chocolate", description: null, price: "10.00", promotional_price: null, category_name: "🧀 Bordas Recheadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
        { id: "36", name: "Borda de 4 Queijos", description: null, price: "10.00", promotional_price: null, category_name: "🧀 Bordas Recheadas", preparation_time: null, ingredients: null, serves: 1, is_featured: false },
      ]
    }
  ]
};

// ==================== EXECUTAR TESTE ====================

console.log('╔═══════════════════════════════════════════════════════════════╗');
console.log('║ 🧪 DEBUG: formatMenuForCustomer com dados REAIS do BigAcai   ║');
console.log('╚═══════════════════════════════════════════════════════════════╝\n');

const menu = formatMenuForCustomer(realMenu);

console.log('📊 ESTATÍSTICAS:');
console.log(`   Total de itens: ${realMenu.total_items}`);
console.log(`   Categorias: ${realMenu.categories.length}`);
realMenu.categories.forEach(cat => {
  console.log(`   - ${cat.name}: ${cat.items.length} itens`);
});
console.log(`   Cardápio formatado: ${menu.length} caracteres\n`);

console.log('═══════════════════════════════════════════════════════════════');
console.log('📋 CARDÁPIO FORMATADO:');
console.log('═══════════════════════════════════════════════════════════════\n');

console.log(menu);

console.log('\n═══════════════════════════════════════════════════════════════');
console.log('📊 VERIFICAÇÃO DE ITENS:');
console.log('═══════════════════════════════════════════════════════════════\n');

// Verificar se todos os itens estão no output
const allItems = realMenu.categories.flatMap(cat => cat.items);
let foundCount = 0;
const missingItems: string[] = [];

for (const item of allItems) {
  if (menu.includes(item.name)) {
    foundCount++;
  } else {
    missingItems.push(item.name);
  }
}

console.log(`✅ Itens encontrados: ${foundCount}/${allItems.length}`);

if (missingItems.length > 0) {
  console.log(`\n❌ ITENS FALTANDO (${missingItems.length}):`);
  missingItems.forEach(item => console.log(`   - ${item}`));
} else {
  console.log('\n🎉 TODOS OS 36 ITENS ESTÃO NO CARDÁPIO!');
}

// Verificar se tem "5 Litros" (bug reportado)
if (menu.includes('5 Litros') && !menu.includes('1.5 Litros')) {
  console.log('\n⚠️ BUG DETECTADO: "5 Litros" existe mas deveria ser "1.5 Litros"!');
} else {
  console.log('\n✅ Formatação correta: "Refrigerante 1.5 Litros" está presente.');
}
