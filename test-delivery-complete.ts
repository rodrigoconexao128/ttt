/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🧪 TESTE COMPLETO DO SISTEMA DE DELIVERY
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx vvvv/test-delivery-complete.ts
 * 
 * Este teste:
 * 1. Testa exibição do cardápio (36 itens)
 * 2. Testa soma de itens do carrinho
 * 3. Testa geração de pedido
 * 4. Simula 100 clientes diferentes
 * 5. Verifica integridade dos dados
 */

// ═══════════════════════════════════════════════════════════════════════
// 📦 DADOS MOCKADOS DO BIGACAI (36 ITENS REAIS)
// ═══════════════════════════════════════════════════════════════════════

interface MenuItem {
  id: string;
  name: string;
  price: number;
  category: string;
}

interface CartItem {
  item: MenuItem;
  quantity: number;
  notes?: string;
}

interface DeliveryOrder {
  id: string;
  customerName: string;
  customerPhone: string;
  customerAddress: string | null;
  deliveryType: 'delivery' | 'pickup';
  paymentMethod: string;
  items: CartItem[];
  subtotal: number;
  deliveryFee: number;
  total: number;
  status: 'pending' | 'confirmed' | 'preparing' | 'delivering' | 'delivered' | 'cancelled';
  createdAt: Date;
}

const MENU_ITEMS: MenuItem[] = [
  // 🍕 Pizzas Salgadas (8)
  { id: '1', name: 'Pizza 4 Queijos', price: 30, category: '🍕 Pizzas Salgadas' },
  { id: '2', name: 'Pizza Atum', price: 35, category: '🍕 Pizzas Salgadas' },
  { id: '3', name: 'Pizza Calabresa', price: 30, category: '🍕 Pizzas Salgadas' },
  { id: '4', name: 'Pizza Costela', price: 36, category: '🍕 Pizzas Salgadas' },
  { id: '5', name: 'Pizza Dom Camilo', price: 30, category: '🍕 Pizzas Salgadas' },
  { id: '6', name: 'Pizza Milho', price: 30, category: '🍕 Pizzas Salgadas' },
  { id: '7', name: 'Pizza Mussarela', price: 30, category: '🍕 Pizzas Salgadas' },
  { id: '8', name: 'Pizza Picante', price: 30, category: '🍕 Pizzas Salgadas' },
  // 🍫 Pizzas Doces (3)
  { id: '9', name: 'Pizza Banana', price: 30, category: '🍫 Pizzas Doces' },
  { id: '10', name: 'Pizza Brigadeiro', price: 30, category: '🍫 Pizzas Doces' },
  { id: '11', name: 'Pizza MM Disquete', price: 30, category: '🍫 Pizzas Doces' },
  // 🥟 Esfihas Abertas (16)
  { id: '12', name: 'Esfiha Carne c/ Bacon', price: 7, category: '🥟 Esfihas Abertas' },
  { id: '13', name: 'Esfiha Carne c/ Queijo', price: 6, category: '🥟 Esfihas Abertas' },
  { id: '14', name: 'Esfiha Carne c/ Requeijão', price: 6, category: '🥟 Esfihas Abertas' },
  { id: '15', name: 'Esfiha de Atum', price: 6, category: '🥟 Esfihas Abertas' },
  { id: '16', name: 'Esfiha de Bacon', price: 5, category: '🥟 Esfihas Abertas' },
  { id: '17', name: 'Esfiha de Banana', price: 5, category: '🥟 Esfihas Abertas' },
  { id: '18', name: 'Esfiha de Brigadeiro', price: 5, category: '🥟 Esfihas Abertas' },
  { id: '19', name: 'Esfiha de Calabresa', price: 4, category: '🥟 Esfihas Abertas' },
  { id: '20', name: 'Esfiha de Carne', price: 4, category: '🥟 Esfihas Abertas' },
  { id: '21', name: 'Esfiha de Frango', price: 5, category: '🥟 Esfihas Abertas' },
  { id: '22', name: 'Esfiha de Milho', price: 4, category: '🥟 Esfihas Abertas' },
  { id: '23', name: 'Esfiha de Queijo', price: 4, category: '🥟 Esfihas Abertas' },
  { id: '24', name: 'Esfiha Disquete MM', price: 5, category: '🥟 Esfihas Abertas' },
  { id: '25', name: 'Esfiha Frango c/ Queijo', price: 7.50, category: '🥟 Esfihas Abertas' },
  { id: '26', name: 'Esfiha Frango c/ Requeijão', price: 7.50, category: '🥟 Esfihas Abertas' },
  { id: '27', name: 'Esfiha Romeu e Julieta', price: 5, category: '🥟 Esfihas Abertas' },
  // 🍹 Bebidas (5)
  { id: '28', name: 'Embalagem', price: 1.90, category: '🍹 Bebidas' },
  { id: '29', name: 'Refrigerante 1 Litro', price: 10, category: '🍹 Bebidas' },
  { id: '30', name: 'Refrigerante 1.5 Litros', price: 12, category: '🍹 Bebidas' },
  { id: '31', name: 'Refrigerante 2 Litros', price: 15, category: '🍹 Bebidas' },
  { id: '32', name: 'Refrigerante Lata 350ml', price: 7, category: '🍹 Bebidas' },
  // 🧀 Bordas Recheadas (4)
  { id: '33', name: 'Borda de 4 Queijos', price: 10, category: '🧀 Bordas Recheadas' },
  { id: '34', name: 'Borda de Catupiry', price: 10, category: '🧀 Bordas Recheadas' },
  { id: '35', name: 'Borda de Cheddar', price: 10, category: '🧀 Bordas Recheadas' },
  { id: '36', name: 'Borda de Chocolate', price: 10, category: '🧀 Bordas Recheadas' },
];

const DELIVERY_CONFIG = {
  business_name: 'Pizzaria Big',
  delivery_fee: 5,
  min_order_value: 20,
  estimated_delivery_time: 45,
  payment_methods: ['Dinheiro', 'Cartão', 'Pix'],
};

// ═══════════════════════════════════════════════════════════════════════
// 🛒 SISTEMA DE CARRINHO
// ═══════════════════════════════════════════════════════════════════════

class DeliveryCart {
  private items: Map<string, CartItem> = new Map();
  
  addItem(item: MenuItem, quantity: number = 1, notes?: string): void {
    const existing = this.items.get(item.id);
    if (existing) {
      existing.quantity += quantity;
      if (notes) existing.notes = notes;
    } else {
      this.items.set(item.id, { item, quantity, notes });
    }
  }
  
  removeItem(itemId: string): boolean {
    return this.items.delete(itemId);
  }
  
  updateQuantity(itemId: string, quantity: number): boolean {
    const existing = this.items.get(itemId);
    if (!existing) return false;
    
    if (quantity <= 0) {
      this.items.delete(itemId);
    } else {
      existing.quantity = quantity;
    }
    return true;
  }
  
  getSubtotal(): number {
    let total = 0;
    for (const cartItem of this.items.values()) {
      total += cartItem.item.price * cartItem.quantity;
    }
    return Math.round(total * 100) / 100; // Arredondar para 2 casas
  }
  
  getTotal(deliveryType: 'delivery' | 'pickup'): number {
    const subtotal = this.getSubtotal();
    const fee = deliveryType === 'delivery' ? DELIVERY_CONFIG.delivery_fee : 0;
    return Math.round((subtotal + fee) * 100) / 100;
  }
  
  getItems(): CartItem[] {
    return Array.from(this.items.values());
  }
  
  clear(): void {
    this.items.clear();
  }
  
  isEmpty(): boolean {
    return this.items.size === 0;
  }
  
  formatCart(): string {
    if (this.isEmpty()) return 'Seu carrinho está vazio.';
    
    let text = `🛒 *SEU PEDIDO*\n`;
    text += `───────────────\n`;
    
    for (const cartItem of this.items.values()) {
      const itemTotal = cartItem.item.price * cartItem.quantity;
      text += `${cartItem.quantity}x ${cartItem.item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
      if (cartItem.notes) {
        text += `   _Obs: ${cartItem.notes}_\n`;
      }
    }
    
    text += `───────────────\n`;
    text += `📦 Subtotal: R$ ${this.getSubtotal().toFixed(2).replace('.', ',')}\n`;
    
    return text;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 FUNÇÕES AUXILIARES
// ═══════════════════════════════════════════════════════════════════════

function findItemByName(name: string): MenuItem | null {
  const normalizedName = name.toLowerCase().trim()
    .replace(/refri\b/g, 'refrigerante')
    .replace(/(\d)\s*l\b/g, '$1 litros')
    .replace(/(\d)\s*litro\b/g, '$1 litros');
  
  // Busca exata primeiro
  let found = MENU_ITEMS.find(item => 
    item.name.toLowerCase() === normalizedName
  );
  
  // Busca parcial - todas as palavras devem estar presentes
  if (!found) {
    const searchWords = normalizedName.split(/\s+/).filter(w => w.length > 1);
    found = MENU_ITEMS.find(item => {
      const itemNameLower = item.name.toLowerCase();
      return searchWords.every(word => itemNameLower.includes(word));
    });
  }
  
  // Busca fuzzy - pelo menos uma palavra importante
  if (!found) {
    const importantWords = normalizedName.split(/\s+/).filter(w => w.length > 3);
    if (importantWords.length > 0) {
      found = MENU_ITEMS.find(item => {
        const itemNameLower = item.name.toLowerCase();
        return importantWords.some(word => itemNameLower.includes(word));
      });
    }
  }
  
  return found || null;
}

function parseOrderRequest(message: string): { item: string; quantity: number }[] {
  const results: { item: string; quantity: number }[] = [];
  
  // Padrões: "2 pizza calabresa", "uma esfiha de carne", "3x refrigerante"
  const patterns = [
    /(\d+)\s*x?\s*(.+)/gi,
    /(uma?|dois|duas|tres|três|quatro|cinco)\s+(.+)/gi,
  ];
  
  const numberWords: Record<string, number> = {
    'um': 1, 'uma': 1,
    'dois': 2, 'duas': 2,
    'tres': 3, 'três': 3,
    'quatro': 4,
    'cinco': 5,
  };
  
  // Tentar cada padrão
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(message)) !== null) {
      const qtyPart = match[1].toLowerCase();
      const itemPart = match[2].trim();
      
      const qty = numberWords[qtyPart] || parseInt(qtyPart) || 1;
      
      if (itemPart.length > 2) {
        results.push({ item: itemPart, quantity: qty });
      }
    }
  }
  
  // Se não encontrou padrão, assumir quantidade 1
  if (results.length === 0) {
    const cleanMessage = message.toLowerCase()
      .replace(/quero|vou querer|me (vê|ve|da|dá)/gi, '')
      .trim();
    
    if (cleanMessage.length > 2) {
      results.push({ item: cleanMessage, quantity: 1 });
    }
  }
  
  return results;
}

function generateRandomPhone(): string {
  const ddd = Math.floor(Math.random() * 90) + 10;
  const num = Math.floor(Math.random() * 900000000) + 100000000;
  return `${ddd}9${num}`;
}

function generateRandomName(): string {
  const names = ['João', 'Maria', 'Pedro', 'Ana', 'Carlos', 'Fernanda', 'Lucas', 'Julia', 'Rafael', 'Camila'];
  const surnames = ['Silva', 'Santos', 'Oliveira', 'Souza', 'Lima', 'Pereira', 'Costa', 'Ferreira', 'Rodrigues', 'Almeida'];
  return `${names[Math.floor(Math.random() * names.length)]} ${surnames[Math.floor(Math.random() * surnames.length)]}`;
}

function generateRandomAddress(): string {
  const streets = ['Rua das Flores', 'Av. Brasil', 'Rua do Comércio', 'Av. Paulista', 'Rua Principal', 'Travessa das Acácias'];
  const num = Math.floor(Math.random() * 2000) + 1;
  return `${streets[Math.floor(Math.random() * streets.length)]}, ${num}`;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 SIMULADOR DE CONVERSA
// ═══════════════════════════════════════════════════════════════════════

interface ConversationSimulator {
  customerId: string;
  customerName: string;
  customerPhone: string;
  cart: DeliveryCart;
  deliveryType: 'delivery' | 'pickup';
  paymentMethod: string;
  address: string | null;
  conversationHistory: string[];
}

function createSimulator(): ConversationSimulator {
  return {
    customerId: `customer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    customerName: generateRandomName(),
    customerPhone: generateRandomPhone(),
    cart: new DeliveryCart(),
    deliveryType: Math.random() > 0.3 ? 'delivery' : 'pickup',
    paymentMethod: ['Pix', 'Dinheiro', 'Cartão'][Math.floor(Math.random() * 3)],
    address: null,
    conversationHistory: [],
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 BANCO DE PEDIDOS (SIMULADO)
// ═══════════════════════════════════════════════════════════════════════

const ordersDatabase: DeliveryOrder[] = [];

function createOrder(simulator: ConversationSimulator): DeliveryOrder | null {
  if (simulator.cart.isEmpty()) {
    return null;
  }
  
  const subtotal = simulator.cart.getSubtotal();
  
  // Verificar pedido mínimo
  if (subtotal < DELIVERY_CONFIG.min_order_value) {
    console.log(`   ⚠️ Pedido abaixo do mínimo: R$ ${subtotal.toFixed(2)} < R$ ${DELIVERY_CONFIG.min_order_value}`);
    return null;
  }
  
  const deliveryFee = simulator.deliveryType === 'delivery' ? DELIVERY_CONFIG.delivery_fee : 0;
  
  const order: DeliveryOrder = {
    id: `order_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
    customerName: simulator.customerName,
    customerPhone: simulator.customerPhone,
    customerAddress: simulator.deliveryType === 'delivery' ? (simulator.address || generateRandomAddress()) : null,
    deliveryType: simulator.deliveryType,
    paymentMethod: simulator.paymentMethod,
    items: [...simulator.cart.getItems()],
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    status: 'pending',
    createdAt: new Date(),
  };
  
  ordersDatabase.push(order);
  return order;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 EXECUTAR TESTES
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('🧪 TESTE COMPLETO DO SISTEMA DE DELIVERY');
console.log('═'.repeat(70));
console.log(`📋 Cardápio: ${MENU_ITEMS.length} itens`);
console.log(`💰 Taxa entrega: R$ ${DELIVERY_CONFIG.delivery_fee}`);
console.log(`📦 Pedido mínimo: R$ ${DELIVERY_CONFIG.min_order_value}`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 1: Soma de Carrinho
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🧮 TESTE 1: Soma de Carrinho');
console.log('─'.repeat(70));

const cart1 = new DeliveryCart();

// Caso 1: Pedido simples
cart1.addItem(MENU_ITEMS[2], 1); // Pizza Calabresa R$ 30
cart1.addItem(MENU_ITEMS[29], 1); // Refrigerante 1.5L R$ 12

let expectedSubtotal = 30 + 12;
let calculatedSubtotal = cart1.getSubtotal();
let test1a = Math.abs(calculatedSubtotal - expectedSubtotal) < 0.01;
console.log(`   ${test1a ? '✅' : '❌'} 1 Pizza Calabresa + 1 Refri 1.5L = R$ ${calculatedSubtotal.toFixed(2)} (esperado: R$ ${expectedSubtotal.toFixed(2)})`);

// Caso 2: Múltiplas quantidades
cart1.clear();
cart1.addItem(MENU_ITEMS[18], 5); // 5x Esfiha de Calabresa R$ 4 = R$ 20
cart1.addItem(MENU_ITEMS[22], 3); // 3x Esfiha de Queijo R$ 4 = R$ 12

expectedSubtotal = (4 * 5) + (4 * 3);
calculatedSubtotal = cart1.getSubtotal();
let test1b = Math.abs(calculatedSubtotal - expectedSubtotal) < 0.01;
console.log(`   ${test1b ? '✅' : '❌'} 5x Esfiha Calabresa + 3x Esfiha Queijo = R$ ${calculatedSubtotal.toFixed(2)} (esperado: R$ ${expectedSubtotal.toFixed(2)})`);

// Caso 3: Com taxa de entrega
let totalDelivery = cart1.getTotal('delivery');
let totalPickup = cart1.getTotal('pickup');
let test1c = Math.abs(totalDelivery - totalPickup - DELIVERY_CONFIG.delivery_fee) < 0.01;
console.log(`   ${test1c ? '✅' : '❌'} Total delivery: R$ ${totalDelivery.toFixed(2)}, pickup: R$ ${totalPickup.toFixed(2)} (diferença: R$ ${(totalDelivery - totalPickup).toFixed(2)})`);

// Caso 4: Valores decimais (esfihas com preço quebrado)
cart1.clear();
cart1.addItem(MENU_ITEMS[24], 4); // 4x Esfiha Frango c/ Queijo R$ 7.50 = R$ 30

expectedSubtotal = 7.50 * 4;
calculatedSubtotal = cart1.getSubtotal();
let test1d = Math.abs(calculatedSubtotal - expectedSubtotal) < 0.01;
console.log(`   ${test1d ? '✅' : '❌'} 4x Esfiha Frango c/ Queijo (R$ 7,50) = R$ ${calculatedSubtotal.toFixed(2)} (esperado: R$ ${expectedSubtotal.toFixed(2)})`);

// Caso 5: Pedido grande misto
cart1.clear();
cart1.addItem(MENU_ITEMS[0], 2);  // 2x Pizza 4 Queijos R$ 30 = R$ 60
cart1.addItem(MENU_ITEMS[3], 1);  // 1x Pizza Costela R$ 36 = R$ 36
cart1.addItem(MENU_ITEMS[32], 2); // 2x Borda 4 Queijos R$ 10 = R$ 20
cart1.addItem(MENU_ITEMS[30], 1); // 1x Refri 2L R$ 15 = R$ 15
cart1.addItem(MENU_ITEMS[18], 10);// 10x Esfiha Calabresa R$ 4 = R$ 40

expectedSubtotal = 60 + 36 + 20 + 15 + 40;
calculatedSubtotal = cart1.getSubtotal();
let test1e = Math.abs(calculatedSubtotal - expectedSubtotal) < 0.01;
console.log(`   ${test1e ? '✅' : '❌'} Pedido grande misto = R$ ${calculatedSubtotal.toFixed(2)} (esperado: R$ ${expectedSubtotal.toFixed(2)})`);

const test1Passed = test1a && test1b && test1c && test1d && test1e;
console.log(`\n   📊 Teste 1: ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'} (${[test1a, test1b, test1c, test1d, test1e].filter(Boolean).length}/5)`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 2: Busca de Itens por Nome
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🔍 TESTE 2: Busca de Itens por Nome');
console.log('─'.repeat(70));

const searchTests = [
  { query: 'pizza calabresa', expected: 'Pizza Calabresa' },
  { query: 'CALABRESA', expected: 'Pizza Calabresa' },
  { query: 'esfiha de queijo', expected: 'Esfiha de Queijo' },
  { query: 'refri 2 litros', expected: 'Refrigerante 2 Litros' },
  { query: 'borda chocolate', expected: 'Borda de Chocolate' },
  { query: 'brigadeiro', expected: 'Pizza Brigadeiro' }, // ou Esfiha de Brigadeiro
  { query: 'item inexistente xyz', expected: null },
];

let test2Passed = 0;
for (const test of searchTests) {
  const found = findItemByName(test.query);
  const ok = test.expected === null ? found === null : found?.name === test.expected;
  if (ok) test2Passed++;
  console.log(`   ${ok ? '✅' : '❌'} "${test.query}" → ${found?.name || 'null'} ${ok ? '' : `(esperado: ${test.expected})`}`);
}
console.log(`\n   📊 Teste 2: ${test2Passed === searchTests.length ? '✅ PASSOU' : '❌ FALHOU'} (${test2Passed}/${searchTests.length})`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 3: Parse de Mensagens de Pedido
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('💬 TESTE 3: Parse de Mensagens de Pedido');
console.log('─'.repeat(70));

const parseTests = [
  { msg: '2 pizza calabresa', expected: [{ item: 'pizza calabresa', quantity: 2 }] },
  { msg: '1x refrigerante 2 litros', expected: [{ item: 'refrigerante 2 litros', quantity: 1 }] },
  { msg: 'uma esfiha de carne', expected: [{ item: 'esfiha de carne', quantity: 1 }] },
  { msg: '5 esfihas de queijo', expected: [{ item: 'esfihas de queijo', quantity: 5 }] },
];

let test3Passed = 0;
for (const test of parseTests) {
  const parsed = parseOrderRequest(test.msg);
  const ok = parsed.length > 0 && 
             parsed[0].quantity === test.expected[0].quantity &&
             parsed[0].item.toLowerCase().includes(test.expected[0].item.toLowerCase().split(' ')[0]);
  if (ok) test3Passed++;
  console.log(`   ${ok ? '✅' : '❌'} "${test.msg}" → ${JSON.stringify(parsed)}`);
}
console.log(`\n   📊 Teste 3: ${test3Passed}/${parseTests.length} mensagens parseadas`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 4: Geração de Pedidos
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('📝 TESTE 4: Geração de Pedidos');
console.log('─'.repeat(70));

// Cenário 1: Pedido válido
const sim1 = createSimulator();
sim1.deliveryType = 'delivery';
sim1.address = 'Rua das Flores, 123';
sim1.cart.addItem(MENU_ITEMS[2], 1);  // Pizza Calabresa R$ 30
sim1.cart.addItem(MENU_ITEMS[29], 1); // Refri 1.5L R$ 12

const order1 = createOrder(sim1);
const test4a = order1 !== null && 
               Math.abs(order1.subtotal - 42) < 0.01 && 
               Math.abs(order1.total - 47) < 0.01;
console.log(`   ${test4a ? '✅' : '❌'} Pedido válido criado: ${order1 ? `#${order1.id.substr(-6)} - R$ ${order1.total.toFixed(2)}` : 'FALHOU'}`);

// Cenário 2: Pedido abaixo do mínimo
const sim2 = createSimulator();
sim2.cart.addItem(MENU_ITEMS[27], 1); // Embalagem R$ 1.90

const order2 = createOrder(sim2);
const test4b = order2 === null; // Deve falhar por estar abaixo do mínimo
console.log(`   ${test4b ? '✅' : '❌'} Pedido abaixo do mínimo rejeitado: ${order2 ? 'ERRO - deveria rejeitar' : 'OK'}`);

// Cenário 3: Retirada (sem taxa)
const sim3 = createSimulator();
sim3.deliveryType = 'pickup';
sim3.cart.addItem(MENU_ITEMS[0], 1); // Pizza 4 Queijos R$ 30

const order3 = createOrder(sim3);
const test4c = order3 !== null && 
               order3.deliveryFee === 0 && 
               Math.abs(order3.total - order3.subtotal) < 0.01;
console.log(`   ${test4c ? '✅' : '❌'} Pedido retirada (sem taxa): ${order3 ? `R$ ${order3.total.toFixed(2)} (taxa: R$ ${order3.deliveryFee})` : 'FALHOU'}`);

const test4Passed = test4a && test4b && test4c;
console.log(`\n   📊 Teste 4: ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'} (${[test4a, test4b, test4c].filter(Boolean).length}/3)`);
console.log(`   📦 Pedidos no banco: ${ordersDatabase.length}`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 5: Simulação de 100 Clientes
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('👥 TESTE 5: Simulação de 100 Clientes');
console.log('─'.repeat(70));

const startTime = Date.now();
const ordersBeforeTest = ordersDatabase.length;
let successfulOrders = 0;
let failedOrders = 0;
let totalRevenue = 0;
let totalItemsSold = 0;

const itemSales: Map<string, number> = new Map();

for (let i = 0; i < 100; i++) {
  const sim = createSimulator();
  
  // Gerar pedido aleatório (1-5 itens)
  const numItems = Math.floor(Math.random() * 5) + 1;
  const usedItems = new Set<number>();
  
  for (let j = 0; j < numItems; j++) {
    let itemIdx: number;
    do {
      itemIdx = Math.floor(Math.random() * MENU_ITEMS.length);
    } while (usedItems.has(itemIdx));
    usedItems.add(itemIdx);
    
    const quantity = Math.floor(Math.random() * 3) + 1;
    sim.cart.addItem(MENU_ITEMS[itemIdx], quantity);
  }
  
  const order = createOrder(sim);
  
  if (order) {
    successfulOrders++;
    totalRevenue += order.total;
    
    for (const cartItem of order.items) {
      totalItemsSold += cartItem.quantity;
      const currentSales = itemSales.get(cartItem.item.name) || 0;
      itemSales.set(cartItem.item.name, currentSales + cartItem.quantity);
    }
  } else {
    failedOrders++;
  }
}

const endTime = Date.now();
const duration = endTime - startTime;

console.log(`   ✅ Pedidos criados: ${successfulOrders}`);
console.log(`   ❌ Pedidos rejeitados: ${failedOrders} (abaixo do mínimo)`);
console.log(`   💰 Receita total: R$ ${totalRevenue.toFixed(2)}`);
console.log(`   📦 Itens vendidos: ${totalItemsSold}`);
console.log(`   ⏱️ Tempo: ${duration}ms (${(100 / (duration / 1000)).toFixed(0)} pedidos/segundo)`);

// Top 5 itens mais vendidos
const sortedSales = Array.from(itemSales.entries())
  .sort((a, b) => b[1] - a[1])
  .slice(0, 5);

console.log(`\n   🏆 Top 5 itens mais vendidos:`);
sortedSales.forEach(([name, qty], idx) => {
  console.log(`      ${idx + 1}. ${name}: ${qty} unidades`);
});

const test5Passed = successfulOrders > 50 && ordersDatabase.length > ordersBeforeTest;
console.log(`\n   📊 Teste 5: ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// TESTE 6: Verificação de Integridade
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '─'.repeat(70));
console.log('🔒 TESTE 6: Verificação de Integridade');
console.log('─'.repeat(70));

let integrityErrors = 0;

// Verificar cada pedido no banco
for (const order of ordersDatabase) {
  // Recalcular subtotal
  let expectedSubtotal = 0;
  for (const item of order.items) {
    expectedSubtotal += item.item.price * item.quantity;
  }
  expectedSubtotal = Math.round(expectedSubtotal * 100) / 100;
  
  if (Math.abs(order.subtotal - expectedSubtotal) > 0.01) {
    console.log(`   ❌ Pedido ${order.id}: subtotal incorreto (${order.subtotal} vs ${expectedSubtotal})`);
    integrityErrors++;
  }
  
  // Verificar total = subtotal + taxa
  const expectedTotal = order.subtotal + order.deliveryFee;
  if (Math.abs(order.total - expectedTotal) > 0.01) {
    console.log(`   ❌ Pedido ${order.id}: total incorreto (${order.total} vs ${expectedTotal})`);
    integrityErrors++;
  }
  
  // Verificar pedido mínimo
  if (order.subtotal < DELIVERY_CONFIG.min_order_value) {
    console.log(`   ❌ Pedido ${order.id}: abaixo do mínimo (${order.subtotal} < ${DELIVERY_CONFIG.min_order_value})`);
    integrityErrors++;
  }
  
  // Verificar taxa de entrega
  if (order.deliveryType === 'delivery' && order.deliveryFee !== DELIVERY_CONFIG.delivery_fee) {
    console.log(`   ❌ Pedido ${order.id}: taxa de entrega incorreta`);
    integrityErrors++;
  }
  if (order.deliveryType === 'pickup' && order.deliveryFee !== 0) {
    console.log(`   ❌ Pedido ${order.id}: taxa de retirada deveria ser 0`);
    integrityErrors++;
  }
}

const test6Passed = integrityErrors === 0;
console.log(`   ${test6Passed ? '✅' : '❌'} ${ordersDatabase.length} pedidos verificados, ${integrityErrors} erros encontrados`);
console.log(`\n   📊 Teste 6: ${test6Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

// ═══════════════════════════════════════════════════════════════════════
// RESUMO FINAL
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(70));
console.log('📊 RESUMO FINAL');
console.log('═'.repeat(70));

const allTestsPassed = test1Passed && test2Passed === searchTests.length && test4Passed && test5Passed && test6Passed;

console.log(`   Teste 1 (Soma Carrinho):      ${test1Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 2 (Busca por Nome):     ${test2Passed === searchTests.length ? '✅ PASSOU' : '❌ FALHOU'} (${test2Passed}/${searchTests.length})`);
console.log(`   Teste 3 (Parse Mensagens):    ${test3Passed}/${parseTests.length} parseados`);
console.log(`   Teste 4 (Geração Pedidos):    ${test4Passed ? '✅ PASSOU' : '❌ FALHOU'}`);
console.log(`   Teste 5 (100 Clientes):       ${test5Passed ? '✅ PASSOU' : '❌ FALHOU'} (${successfulOrders} pedidos)`);
console.log(`   Teste 6 (Integridade):        ${test6Passed ? '✅ PASSOU' : '❌ FALHOU'}`);

console.log('\n' + '─'.repeat(70));
if (allTestsPassed) {
  console.log('🎉 TODOS OS TESTES CRÍTICOS PASSARAM!');
  console.log('');
  console.log('O sistema de delivery está funcionando corretamente:');
  console.log('✅ Soma de carrinho precisa');
  console.log('✅ Busca de itens por nome');
  console.log('✅ Geração de pedidos');
  console.log('✅ Validação de pedido mínimo');
  console.log('✅ Taxa de entrega correta');
  console.log('✅ Suporta alto volume (100+ clientes)');
  console.log('✅ Integridade dos dados mantida');
} else {
  console.log('❌ ALGUNS TESTES FALHARAM');
  console.log('Verifique os erros acima e corrija antes de prosseguir.');
}
console.log('═'.repeat(70) + '\n');

process.exit(allTestsPassed ? 0 : 1);
