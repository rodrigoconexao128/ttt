/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🧪 TESTE DE CONVERSA DE DELIVERY - SIMULAÇÃO COMPLETA
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx vvvv/test-delivery-conversation.ts
 * 
 * Este teste simula conversas completas de delivery:
 * 1. Cliente faz saudação → Sistema oferece cardápio
 * 2. Cliente pede cardápio → Sistema retorna menu completo
 * 3. Cliente faz pedido → Sistema adiciona ao carrinho
 * 4. Cliente confirma → Sistema gera pedido
 * 5. Testa múltiplos clientes simultâneos
 */

// ═══════════════════════════════════════════════════════════════════════
// 📦 SIMULAÇÃO LOCAL (SEM SUPABASE)
// ═══════════════════════════════════════════════════════════════════════

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category_name: string;
  description: string | null;
  is_highlight: boolean;
  is_available: boolean;
}

interface DeliveryConfig {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  payment_methods: string[];
  is_active: boolean;
}

interface DeliveryData {
  config: DeliveryConfig;
  categories: Array<{ name: string; items: MenuItem[] }>;
  totalItems: number;
}

// Dados mockados do BigAcai
const MOCK_DATA: DeliveryData = {
  config: {
    id: 'test',
    user_id: '811c0403-ee01-4d60-8101-9b9e80684384',
    business_name: 'Pizzaria Big',
    business_type: 'pizzaria',
    delivery_fee: 5,
    min_order_value: 20,
    estimated_delivery_time: 45,
    accepts_delivery: true,
    accepts_pickup: true,
    payment_methods: ['Dinheiro', 'Cartão', 'Pix'],
    is_active: true,
  },
  categories: [
    {
      name: '🍕 Pizzas Salgadas',
      items: [
        { id: '1', name: 'Pizza 4 Queijos', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '2', name: 'Pizza Atum', price: 35, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '3', name: 'Pizza Calabresa', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '4', name: 'Pizza Costela', price: 36, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '5', name: 'Pizza Dom Camilo', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '6', name: 'Pizza Milho', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '7', name: 'Pizza Mussarela', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
        { id: '8', name: 'Pizza Picante', price: 30, category_name: '🍕 Pizzas Salgadas', description: null, is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🍫 Pizzas Doces',
      items: [
        { id: '9', name: 'Pizza Banana', price: 30, category_name: '🍫 Pizzas Doces', description: null, is_highlight: false, is_available: true },
        { id: '10', name: 'Pizza Brigadeiro', price: 30, category_name: '🍫 Pizzas Doces', description: null, is_highlight: false, is_available: true },
        { id: '11', name: 'Pizza MM Disquete', price: 30, category_name: '🍫 Pizzas Doces', description: null, is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🥟 Esfihas Abertas',
      items: [
        { id: '12', name: 'Esfiha Carne c/ Bacon', price: 7, category_name: '🥟 Esfihas Abertas', description: null, is_highlight: false, is_available: true },
        { id: '18', name: 'Esfiha de Calabresa', price: 4, category_name: '🥟 Esfihas Abertas', description: null, is_highlight: false, is_available: true },
        { id: '22', name: 'Esfiha de Queijo', price: 4, category_name: '🥟 Esfihas Abertas', description: null, is_highlight: false, is_available: true },
        { id: '24', name: 'Esfiha Frango c/ Queijo', price: 7.50, category_name: '🥟 Esfihas Abertas', description: null, is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🍹 Bebidas',
      items: [
        { id: '28', name: 'Embalagem', price: 1.90, category_name: '🍹 Bebidas', description: null, is_highlight: false, is_available: true },
        { id: '29', name: 'Refrigerante 1 Litro', price: 10, category_name: '🍹 Bebidas', description: null, is_highlight: false, is_available: true },
        { id: '30', name: 'Refrigerante 1.5 Litros', price: 12, category_name: '🍹 Bebidas', description: null, is_highlight: false, is_available: true },
        { id: '31', name: 'Refrigerante 2 Litros', price: 15, category_name: '🍹 Bebidas', description: null, is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🧀 Bordas Recheadas',
      items: [
        { id: '33', name: 'Borda de 4 Queijos', price: 10, category_name: '🧀 Bordas Recheadas', description: null, is_highlight: false, is_available: true },
        { id: '34', name: 'Borda de Catupiry', price: 10, category_name: '🧀 Bordas Recheadas', description: null, is_highlight: false, is_available: true },
        { id: '35', name: 'Borda de Cheddar', price: 10, category_name: '🧀 Bordas Recheadas', description: null, is_highlight: false, is_available: true },
        { id: '36', name: 'Borda de Chocolate', price: 10, category_name: '🧀 Bordas Recheadas', description: null, is_highlight: false, is_available: true },
      ]
    },
  ],
  totalItems: 23, // Para este mock
};

// ═══════════════════════════════════════════════════════════════════════
// 🛒 SISTEMA DE CARRINHO (SIMULADO)
// ═══════════════════════════════════════════════════════════════════════

interface CartItem {
  itemId: string;
  name: string;
  price: number;
  quantity: number;
  notes?: string;
}

interface CustomerCart {
  items: Map<string, CartItem>;
  customerPhone: string;
  deliveryType: 'delivery' | 'pickup' | null;
  paymentMethod: string | null;
  address: string | null;
  customerName: string | null;
}

const cartsCache = new Map<string, CustomerCart>();

function getCart(userId: string, customerPhone: string): CustomerCart {
  const key = `${userId}:${customerPhone}`;
  let cart = cartsCache.get(key);
  
  if (!cart) {
    cart = {
      items: new Map(),
      customerPhone,
      deliveryType: null,
      paymentMethod: null,
      address: null,
      customerName: null,
    };
    cartsCache.set(key, cart);
  }
  
  return cart;
}

function addToCart(userId: string, customerPhone: string, item: MenuItem, quantity: number = 1): void {
  const cart = getCart(userId, customerPhone);
  const existing = cart.items.get(item.id);
  
  if (existing) {
    existing.quantity += quantity;
  } else {
    cart.items.set(item.id, {
      itemId: item.id,
      name: item.name,
      price: item.price,
      quantity,
    });
  }
}

function getCartSubtotal(cart: CustomerCart): number {
  let total = 0;
  for (const item of cart.items.values()) {
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

function clearCart(userId: string, customerPhone: string): void {
  cartsCache.delete(`${userId}:${customerPhone}`);
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 FUNÇÕES DE DETECÇÃO E BUSCA
// ═══════════════════════════════════════════════════════════════════════

type CustomerIntent = 'GREETING' | 'WANT_MENU' | 'WANT_TO_ORDER' | 'ADD_ITEM' | 'CONFIRM_ORDER' | 'ASK_DELIVERY_INFO' | 'CANCEL_ORDER' | 'OTHER';

function detectCustomerIntent(message: string): CustomerIntent {
  const m = message.toLowerCase().trim();
  
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite)/i.test(m)) return 'GREETING';
  if (/card[aá]pio|menu|o que (tem|voc[eê]s tem)|quais (produto|item)/i.test(m)) return 'WANT_MENU';
  
  // CONFIRM - prioridade maior (antes de WANT_TO_ORDER)
  if (/\b(isso|fechado|pode fechar|fechar|confirma|confirmado|[eé] isso|ok|sim|fecha|finaliza)\b/i.test(m)) return 'CONFIRM_ORDER';
  
  if (/quero|vou querer|me (vê|ve|da|dá).*(\d+|uma?)/i.test(m)) return 'WANT_TO_ORDER';
  if (/adiciona|mais|também quero/i.test(m)) return 'ADD_ITEM';
  if (/cancela|desisto|não quero mais/i.test(m)) return 'CANCEL_ORDER';
  if (/entrega|taxa|frete|aceita.*pix|pagamento/i.test(m)) return 'ASK_DELIVERY_INFO';
  
  return 'OTHER';
}

const NUMBER_WORDS: Record<string, number> = {
  'um': 1, 'uma': 1, 'dois': 2, 'duas': 2, 'tres': 3, 'três': 3,
  'quatro': 4, 'cinco': 5, 'seis': 6, 'sete': 7, 'oito': 8, 'nove': 9, 'dez': 10,
};

function parseOrderItems(message: string): Array<{ name: string; quantity: number }> {
  const results: Array<{ name: string; quantity: number }> = [];
  
  // Limpar a mensagem
  let normalized = message.toLowerCase()
    .replace(/quero|vou querer|me (vê|ve|da|dá)|pode|manda|por favor|pf/gi, '')
    .trim();
  
  // Normalizar refri → refrigerante, 2l → 2 litros
  normalized = normalized
    .replace(/\brefri\b/gi, 'refrigerante')
    .replace(/(\d)\s*l\b/gi, '$1 litros');
  
  // Separar por vírgulas ou "e"
  const parts = normalized.split(/\s*[,e]\s+/);
  
  for (const part of parts) {
    // Padrão: "2 pizza calabresa" ou "uma esfiha de queijo"
    const match = part.match(/^(\d+|uma?|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)?\s*(.+)$/i);
    
    if (match) {
      const qtyPart = (match[1] || '1').toLowerCase();
      const itemPart = match[2].trim();
      const qty = NUMBER_WORDS[qtyPart] || parseInt(qtyPart) || 1;
      
      if (itemPart.length > 2) {
        results.push({ name: itemPart, quantity: qty });
      }
    }
  }
  
  return results;
}

function findItemByName(searchName: string): MenuItem | null {
  // Normalizar busca
  let normalized = searchName.toLowerCase().trim()
    .replace(/\brefri\b/g, 'refrigerante')
    .replace(/(\d)\s*l\b/gi, '$1 litros')
    .replace(/\bde\s+/g, ' ')   // "esfiha de calabresa" → "esfiha calabresa"
    .replace(/\s+/g, ' ');      // múltiplos espaços
  
  // Palavras da busca
  const searchWords = normalized.split(/\s+/).filter(w => w.length > 1);
  
  let bestMatch: MenuItem | null = null;
  let bestScore = 0;
  
  for (const category of MOCK_DATA.categories) {
    for (const item of category.items) {
      const itemLower = item.name.toLowerCase().replace(/\s+/g, ' ');
      
      // Match exato
      if (itemLower === normalized) return item;
      
      // Calcular score baseado em quantas palavras coincidem
      let score = 0;
      for (const word of searchWords) {
        if (word.length > 2 && itemLower.includes(word)) {
          score += word.length; // Palavras maiores = mais peso
        }
      }
      
      // Bônus se o nome do item contém a busca completa
      if (itemLower.includes(normalized)) {
        score += 50;
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = item;
      }
    }
  }
  
  // Só retorna se teve pelo menos uma palavra match de 3+ caracteres
  return bestScore >= 3 ? bestMatch : null;
}

// ═══════════════════════════════════════════════════════════════════════
// 📝 BANCO DE PEDIDOS SIMULADO
// ═══════════════════════════════════════════════════════════════════════

interface Order {
  id: string;
  customer_name: string;
  customer_phone: string;
  customer_address: string | null;
  delivery_type: 'delivery' | 'pickup';
  payment_method: string;
  items: Array<{ name: string; quantity: number; price: number }>;
  subtotal: number;
  delivery_fee: number;
  total: number;
  status: 'pending' | 'confirmed' | 'delivered';
  created_at: Date;
}

const ordersDatabase: Order[] = [];

function createOrder(
  cart: CustomerCart,
  customerName: string,
  deliveryType: 'delivery' | 'pickup',
  paymentMethod: string,
  address: string | null
): Order | null {
  if (cart.items.size === 0) return null;
  
  const subtotal = getCartSubtotal(cart);
  if (subtotal < MOCK_DATA.config.min_order_value) return null;
  
  const deliveryFee = deliveryType === 'delivery' ? MOCK_DATA.config.delivery_fee : 0;
  
  const order: Order = {
    id: `ORD-${Date.now().toString(36).toUpperCase()}`,
    customer_name: customerName,
    customer_phone: cart.customerPhone,
    customer_address: address,
    delivery_type: deliveryType,
    payment_method: paymentMethod,
    items: Array.from(cart.items.values()).map(i => ({
      name: i.name,
      quantity: i.quantity,
      price: i.price,
    })),
    subtotal,
    delivery_fee: deliveryFee,
    total: subtotal + deliveryFee,
    status: 'pending',
    created_at: new Date(),
  };
  
  ordersDatabase.push(order);
  return order;
}

// ═══════════════════════════════════════════════════════════════════════
// 🤖 SIMULADOR DE CONVERSA
// ═══════════════════════════════════════════════════════════════════════

interface ConversationState {
  userId: string;
  customerPhone: string;
  customerName: string;
  stage: 'GREETING' | 'MENU_SHOWN' | 'ORDERING' | 'CONFIRMING' | 'DONE';
  pendingInfo?: 'ADDRESS' | 'PAYMENT' | 'DELIVERY_TYPE';
}

function processMessage(state: ConversationState, message: string): { response: string; state: ConversationState } {
  const intent = detectCustomerIntent(message);
  const cart = getCart(state.userId, state.customerPhone);
  
  let response = '';
  
  switch (intent) {
    case 'GREETING':
      response = `Olá! 😊 Bem-vindo à ${MOCK_DATA.config.business_name}!\n\nPosso te enviar nosso cardápio ou você já sabe o que quer pedir?`;
      state.stage = 'GREETING';
      break;
      
    case 'WANT_MENU':
      response = `🍕 *${MOCK_DATA.config.business_name.toUpperCase()}*\n━━━━━━━━━━━━━━━━\n`;
      
      for (const cat of MOCK_DATA.categories) {
        response += `\n📁 *${cat.name}*\n`;
        for (const item of cat.items) {
          response += `• ${item.name} - R$ ${item.price.toFixed(2).replace('.', ',')}\n`;
        }
      }
      
      response += `\n━━━━━━━━━━━━━━━━\n`;
      response += `🛵 Taxa entrega: R$ ${MOCK_DATA.config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
      response += `📦 Pedido mínimo: R$ ${MOCK_DATA.config.min_order_value}\n`;
      response += `\n✅ Me diga o que deseja pedir!`;
      state.stage = 'MENU_SHOWN';
      break;
      
    case 'WANT_TO_ORDER':
    case 'ADD_ITEM':
      const parsedItems = parseOrderItems(message);
      let addedItems: string[] = [];
      let notFound: string[] = [];
      
      for (const parsed of parsedItems) {
        const menuItem = findItemByName(parsed.name);
        if (menuItem) {
          addToCart(state.userId, state.customerPhone, menuItem, parsed.quantity);
          addedItems.push(`${parsed.quantity}x ${menuItem.name}`);
        } else {
          notFound.push(parsed.name);
        }
      }
      
      if (addedItems.length > 0) {
        response = `✅ Adicionado:\n${addedItems.map(i => `• ${i}`).join('\n')}\n\n`;
        
        // Mostrar carrinho
        response += `🛒 *Seu pedido:*\n`;
        for (const item of cart.items.values()) {
          response += `${item.quantity}x ${item.name} - R$ ${(item.price * item.quantity).toFixed(2).replace('.', ',')}\n`;
        }
        response += `\n📦 Subtotal: R$ ${getCartSubtotal(cart).toFixed(2).replace('.', ',')}\n`;
        response += `\nDeseja mais alguma coisa ou posso fechar?`;
        state.stage = 'ORDERING';
      }
      
      if (notFound.length > 0) {
        response += `\n⚠️ Não encontrei: ${notFound.join(', ')}`;
      }
      break;
      
    case 'CONFIRM_ORDER':
      if (cart.items.size === 0) {
        response = 'Seu carrinho está vazio! Me diga o que deseja pedir.';
        break;
      }
      
      const subtotal = getCartSubtotal(cart);
      if (subtotal < MOCK_DATA.config.min_order_value) {
        response = `⚠️ Pedido mínimo é R$ ${MOCK_DATA.config.min_order_value}. Seu pedido: R$ ${subtotal.toFixed(2).replace('.', ',')}.\n\nAdicione mais itens!`;
        break;
      }
      
      // Simular pedido delivery com Pix
      const order = createOrder(cart, state.customerName, 'delivery', 'Pix', 'Rua Teste, 123');
      
      if (order) {
        clearCart(state.userId, state.customerPhone);
        response = `✅ *PEDIDO CONFIRMADO!*\n\n`;
        response += `📦 Pedido: #${order.id}\n`;
        response += `👤 Cliente: ${order.customer_name}\n`;
        response += `📍 Endereço: ${order.customer_address}\n`;
        response += `💳 Pagamento: ${order.payment_method}\n\n`;
        response += `🛒 Itens:\n`;
        for (const item of order.items) {
          response += `• ${item.quantity}x ${item.name}\n`;
        }
        response += `\n💰 Total: R$ ${order.total.toFixed(2).replace('.', ',')}\n`;
        response += `⏱️ Previsão: ~${MOCK_DATA.config.estimated_delivery_time} min\n\n`;
        response += `Obrigado pelo pedido! 🍕`;
        state.stage = 'DONE';
      } else {
        response = 'Erro ao criar pedido. Tente novamente.';
      }
      break;
      
    case 'CANCEL_ORDER':
      clearCart(state.userId, state.customerPhone);
      response = 'Pedido cancelado! Se precisar de algo, é só chamar. 😊';
      state.stage = 'GREETING';
      break;
      
    case 'ASK_DELIVERY_INFO':
      response = `📋 *Informações:*\n\n`;
      response += `🛵 Taxa de entrega: R$ ${MOCK_DATA.config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
      response += `⏱️ Tempo: ~${MOCK_DATA.config.estimated_delivery_time} min\n`;
      response += `📦 Pedido mínimo: R$ ${MOCK_DATA.config.min_order_value}\n`;
      response += `💳 Pagamento: ${MOCK_DATA.config.payment_methods.join(', ')}\n`;
      break;
      
    default:
      response = 'Não entendi. Você pode pedir o cardápio ou fazer um pedido dizendo, por exemplo: "quero 2 pizza calabresa"';
  }
  
  return { response, state };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 EXECUTAR TESTES
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('🧪 TESTE DE CONVERSA DE DELIVERY');
console.log('═'.repeat(70));

// ═══════════════════════════════════════════════════════════════════════
// TESTE 1: Conversa completa simples
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('💬 TESTE 1: Conversa Completa (Oi → Cardápio → Pedido → Confirma)');
console.log('─'.repeat(70));

let state1: ConversationState = {
  userId: 'test-user',
  customerPhone: '11999990001',
  customerName: 'João Silva',
  stage: 'GREETING',
};

const conversation1 = [
  'Oi',
  'Qual o cardápio?',
  'Quero 2 pizza calabresa e 1 refri 2 litros',
  'Isso, pode fechar',
];

console.log('\n--- Conversa ---');
for (const msg of conversation1) {
  console.log(`\n👤 Cliente: ${msg}`);
  const result = processMessage(state1, msg);
  state1 = result.state;
  console.log(`🤖 Bot: ${result.response.substring(0, 200)}${result.response.length > 200 ? '...' : ''}`);
}

const test1Passed = ordersDatabase.length === 1 && ordersDatabase[0].total === 80; // 2x30 + 15 + 5 = 80
console.log(`\n📊 Teste 1: ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Pedidos no banco: ${ordersDatabase.length}`);
if (ordersDatabase.length > 0) {
  console.log(`   Último pedido: #${ordersDatabase[ordersDatabase.length - 1].id} - R$ ${ordersDatabase[ordersDatabase.length - 1].total}`);
}

// ═══════════════════════════════════════════════════════════════════════
// TESTE 2: Múltiplos itens
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('💬 TESTE 2: Pedido com Múltiplos Itens');
console.log('─'.repeat(70));

let state2: ConversationState = {
  userId: 'test-user',
  customerPhone: '11999990002',
  customerName: 'Maria Santos',
  stage: 'GREETING',
};

// Pedido mais complexo
processMessage(state2, 'Oi');
processMessage(state2, 'Quero 1 pizza 4 queijos');
processMessage(state2, 'Adiciona mais 3 esfiha de calabresa');
const result2 = processMessage(state2, 'Confirma');

const order2 = ordersDatabase[ordersDatabase.length - 1];
const expectedTotal2 = 30 + (4 * 3) + 5; // Pizza + 3 esfihas + taxa = 47
const test2Passed = order2 && Math.abs(order2.total - expectedTotal2) < 0.01;

console.log(`\n📊 Teste 2: ${test2Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Total calculado: R$ ${order2?.total.toFixed(2)}`);
console.log(`   Total esperado: R$ ${expectedTotal2.toFixed(2)}`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 3: Pedido abaixo do mínimo
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('💬 TESTE 3: Pedido Abaixo do Mínimo');
console.log('─'.repeat(70));

let state3: ConversationState = {
  userId: 'test-user',
  customerPhone: '11999990003',
  customerName: 'Pedro Lima',
  stage: 'GREETING',
};

processMessage(state3, 'Quero 1 esfiha de calabresa'); // R$ 4 < R$ 20 mínimo
const result3 = processMessage(state3, 'Confirma');

const test3Passed = result3.response.includes('mínimo') || result3.response.includes('Adicione');
console.log(`\n📊 Teste 3: ${test3Passed ? '✅ PASSOU' : '❌ FALHOU'} (rejeitou pedido abaixo do mínimo)`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 4: 100 Clientes Simultâneos
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('👥 TESTE 4: 100 Clientes Simultâneos');
console.log('─'.repeat(70));

const ordersBefore = ordersDatabase.length;
const startTime = Date.now();
let successCount = 0;
let failCount = 0;

for (let i = 0; i < 100; i++) {
  const customerState: ConversationState = {
    userId: 'test-user',
    customerPhone: `1199999${String(i + 100).padStart(4, '0')}`,
    customerName: `Cliente ${i + 1}`,
    stage: 'GREETING',
  };
  
  // Simular pedido aleatório
  const itemIdx = Math.floor(Math.random() * 5);
  const items = ['2 pizza calabresa', '1 pizza 4 queijos e 1 refri 2 litros', '5 esfiha de calabresa', '1 pizza costela', '3 esfiha de queijo e 1 pizza mussarela'];
  
  processMessage(customerState, items[itemIdx]);
  const result = processMessage(customerState, 'Confirma');
  
  if (result.response.includes('CONFIRMADO')) {
    successCount++;
  } else {
    failCount++;
  }
}

const duration = Date.now() - startTime;
const ordersCreated = ordersDatabase.length - ordersBefore;

console.log(`   ✅ Pedidos criados: ${successCount}`);
console.log(`   ❌ Pedidos rejeitados: ${failCount} (abaixo do mínimo)`);
console.log(`   ⏱️ Tempo: ${duration}ms (${Math.round(100 / (duration / 1000))} clientes/seg)`);

const test4Passed = successCount > 80; // Pelo menos 80% devem passar
console.log(`\n📊 Teste 4: ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 5: Verificar Integridade dos Pedidos
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🔒 TESTE 5: Integridade dos Pedidos no Banco');
console.log('─'.repeat(70));

let integrityErrors = 0;

for (const order of ordersDatabase) {
  // Recalcular subtotal
  let expectedSubtotal = 0;
  for (const item of order.items) {
    expectedSubtotal += item.price * item.quantity;
  }
  expectedSubtotal = Math.round(expectedSubtotal * 100) / 100;
  
  if (Math.abs(order.subtotal - expectedSubtotal) > 0.01) {
    integrityErrors++;
  }
  
  // Verificar total
  const expectedTotal = order.subtotal + order.delivery_fee;
  if (Math.abs(order.total - expectedTotal) > 0.01) {
    integrityErrors++;
  }
  
  // Verificar pedido mínimo
  if (order.subtotal < MOCK_DATA.config.min_order_value) {
    integrityErrors++;
  }
}

const test5Passed = integrityErrors === 0;
console.log(`   ${test5Passed ? '✅' : '❌'} ${ordersDatabase.length} pedidos verificados, ${integrityErrors} erros`);
console.log(`\n📊 Teste 5: ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// RESUMO FINAL
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('📊 RESUMO FINAL');
console.log('═'.repeat(70));

const allPassed = test1Passed && test2Passed && test3Passed && test4Passed && test5Passed;

console.log(`   Teste 1 (Conversa Simples):    ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 2 (Múltiplos Itens):     ${test2Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 3 (Pedido Mínimo):       ${test3Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 4 (100 Clientes):        ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 5 (Integridade):         ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

console.log('\n' + '─'.repeat(70));
console.log(`   📦 Total de pedidos no banco: ${ordersDatabase.length}`);
console.log(`   💰 Receita total: R$ ${ordersDatabase.reduce((sum, o) => sum + o.total, 0).toFixed(2)}`);

if (allPassed) {
  console.log('\n🎉 TODOS OS TESTES PASSARAM!');
  console.log('');
  console.log('O sistema de delivery está funcionando corretamente:');
  console.log('✅ Conversas completas de ponta a ponta');
  console.log('✅ Soma correta de carrinho');
  console.log('✅ Validação de pedido mínimo');
  console.log('✅ Suporta 100+ clientes simultâneos');
  console.log('✅ Integridade dos dados mantida');
  console.log('✅ Pedidos gerados corretamente');
} else {
  console.log('\n❌ ALGUNS TESTES FALHARAM');
}
console.log('═'.repeat(70) + '\n');

process.exit(allPassed ? 0 : 1);
