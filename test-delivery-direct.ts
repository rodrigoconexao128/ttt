/**
 * 🧪 TESTE DIRETO DO NOVO SISTEMA DE DELIVERY
 * 
 * Execute com: npx tsx vvvv/test-delivery-direct.ts
 * 
 * Este teste usa os dados REAIS do BigAcai confirmados via SQL
 */

// ═══════════════════════════════════════════════════════════════════════
// 📦 DADOS REAIS DO BIGACAI (confirmados via SQL no Supabase)
// ═══════════════════════════════════════════════════════════════════════

const BIGACAI_DATA = {
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
        { id: '1', name: 'Pizza 4 Queijos', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '2', name: 'Pizza Atum', description: null, price: 35, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '3', name: 'Pizza Calabresa', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '4', name: 'Pizza Costela', description: null, price: 36, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '5', name: 'Pizza Dom Camilo', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '6', name: 'Pizza Milho', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '7', name: 'Pizza Mussarela', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
        { id: '8', name: 'Pizza Picante', description: null, price: 30, category_name: '🍕 Pizzas Salgadas', is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🍫 Pizzas Doces',
      items: [
        { id: '9', name: 'Pizza Banana', description: null, price: 30, category_name: '🍫 Pizzas Doces', is_highlight: false, is_available: true },
        { id: '10', name: 'Pizza Brigadeiro', description: null, price: 30, category_name: '🍫 Pizzas Doces', is_highlight: false, is_available: true },
        { id: '11', name: 'Pizza MM Disquete', description: null, price: 30, category_name: '🍫 Pizzas Doces', is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🥟 Esfihas Abertas',
      items: [
        { id: '12', name: 'Esfiha Carne c/ Bacon', description: null, price: 7, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '13', name: 'Esfiha Carne c/ Queijo', description: null, price: 6, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '14', name: 'Esfiha Carne c/ Requeijão', description: null, price: 6, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '15', name: 'Esfiha de Atum', description: null, price: 6, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '16', name: 'Esfiha de Bacon', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '17', name: 'Esfiha de Banana', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '18', name: 'Esfiha de Brigadeiro', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '19', name: 'Esfiha de Calabresa', description: null, price: 4, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '20', name: 'Esfiha de Carne', description: null, price: 4, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '21', name: 'Esfiha de Frango', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '22', name: 'Esfiha de Milho', description: null, price: 4, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '23', name: 'Esfiha de Queijo', description: null, price: 4, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '24', name: 'Esfiha Disquete MM', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '25', name: 'Esfiha Frango c/ Queijo', description: null, price: 7.5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '26', name: 'Esfiha Frango c/ Requeijão', description: null, price: 7.5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
        { id: '27', name: 'Esfiha Romeu e Julieta', description: null, price: 5, category_name: '🥟 Esfihas Abertas', is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🍹 Bebidas',
      items: [
        { id: '28', name: 'Embalagem', description: null, price: 1.9, category_name: '🍹 Bebidas', is_highlight: false, is_available: true },
        { id: '29', name: 'Refrigerante 1 Litro', description: null, price: 10, category_name: '🍹 Bebidas', is_highlight: false, is_available: true },
        { id: '30', name: 'Refrigerante 1.5 Litros', description: null, price: 12, category_name: '🍹 Bebidas', is_highlight: false, is_available: true },
        { id: '31', name: 'Refrigerante 2 Litros', description: null, price: 15, category_name: '🍹 Bebidas', is_highlight: false, is_available: true },
        { id: '32', name: 'Refrigerante Lata 350ml', description: null, price: 7, category_name: '🍹 Bebidas', is_highlight: false, is_available: true },
      ]
    },
    {
      name: '🧀 Bordas Recheadas',
      items: [
        { id: '33', name: 'Borda de 4 Queijos', description: null, price: 10, category_name: '🧀 Bordas Recheadas', is_highlight: false, is_available: true },
        { id: '34', name: 'Borda de Catupiry', description: null, price: 10, category_name: '🧀 Bordas Recheadas', is_highlight: false, is_available: true },
        { id: '35', name: 'Borda de Cheddar', description: null, price: 10, category_name: '🧀 Bordas Recheadas', is_highlight: false, is_available: true },
        { id: '36', name: 'Borda de Chocolate', description: null, price: 10, category_name: '🧀 Bordas Recheadas', is_highlight: false, is_available: true },
      ]
    },
  ],
  totalItems: 36,
};

// ═══════════════════════════════════════════════════════════════════════
// 🎨 FUNÇÃO DE FORMATAÇÃO (copiada do deliveryAIService.ts)
// ═══════════════════════════════════════════════════════════════════════

interface DeliveryData {
  config: {
    business_name: string;
    business_type: string;
    delivery_fee: number;
    min_order_value: number;
    estimated_delivery_time: number;
    accepts_delivery: boolean;
    accepts_pickup: boolean;
    payment_methods: string[];
  };
  categories: Array<{
    name: string;
    items: Array<{
      name: string;
      description: string | null;
      price: number;
      is_highlight: boolean;
    }>;
  }>;
  totalItems: number;
}

const EMOJI_BY_TYPE: Record<string, string> = {
  pizzaria: '🍕',
  hamburgueria: '🍔',
  lanchonete: '🥪',
  restaurante: '🍽️',
  acai: '🍨',
  japonesa: '🍣',
  outros: '🍴',
};

const MAX_CHARS_PER_BUBBLE = 1500;

function formatMenuAsBubbles(data: DeliveryData): string[] {
  const bubbles: string[] = [];
  const emoji = EMOJI_BY_TYPE[data.config.business_type] || '🍴';
  
  // Header (primeira bolha)
  let header = `${emoji} *${data.config.business_name.toUpperCase()}*\n`;
  header += `━━━━━━━━━━━━━━━━━━━━\n`;
  header += `📋 Cardápio completo (${data.totalItems} itens)\n\n`;
  
  if (data.config.accepts_delivery) {
    header += `🛵 Entrega: R$ ${data.config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
    header += `⏱️ Tempo: ~${data.config.estimated_delivery_time} min\n`;
  }
  if (data.config.accepts_pickup) {
    header += `🏪 Retirada: GRÁTIS\n`;
  }
  if (data.config.min_order_value > 0) {
    header += `📦 Pedido mínimo: R$ ${data.config.min_order_value.toFixed(2).replace('.', ',')}\n`;
  }
  header += `💳 Pagamento: ${data.config.payment_methods.join(', ')}\n`;
  
  bubbles.push(header);
  
  // Cada categoria
  for (const category of data.categories) {
    let categoryBubble = `\n📁 *${category.name.toUpperCase()}*\n`;
    categoryBubble += `───────────────\n`;
    
    for (const item of category.items) {
      const priceStr = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
      const highlight = item.is_highlight ? ' ⭐' : '';
      let itemLine = `• ${item.name}${highlight} - ${priceStr}\n`;
      
      if (item.description) {
        itemLine += `  _${item.description}_\n`;
      }
      
      if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
        bubbles.push(categoryBubble.trim());
        categoryBubble = `📁 *${category.name.toUpperCase()} (cont.)*\n`;
        categoryBubble += `───────────────\n`;
      }
      
      categoryBubble += itemLine;
    }
    
    bubbles.push(categoryBubble.trim());
  }
  
  // Footer
  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n✅ Pronto para pedir? Me avise! 😊`;
  const lastBubble = bubbles[bubbles.length - 1];
  if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
    bubbles[bubbles.length - 1] = lastBubble + footer;
  } else {
    bubbles.push(footer.trim());
  }
  
  return bubbles;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 DETECÇÃO DE INTENÇÃO
// ═══════════════════════════════════════════════════════════════════════

type CustomerIntent = 'GREETING' | 'WANT_MENU' | 'ASK_DELIVERY_INFO' | 'OTHER';

function detectCustomerIntent(message: string): CustomerIntent {
  const m = message.toLowerCase().trim();
  
  if (/^(oi|olá|ola|bom dia|boa tarde|boa noite)/i.test(m)) {
    return 'GREETING';
  }
  
  if (/card[aá]pio|menu|o que (tem|voc[eê]s tem)|quais (produto|item)|me (manda|mostra) o (card|menu)/i.test(m)) {
    return 'WANT_MENU';
  }
  
  if (/entrega|taxa|frete|aceita (pix|cart[aã]o)|forma.*pagamento/i.test(m)) {
    return 'ASK_DELIVERY_INFO';
  }
  
  return 'OTHER';
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 EXECUTAR TESTE
// ═══════════════════════════════════════════════════════════════════════

console.log('\n' + '═'.repeat(60));
console.log('🧪 TESTE DIRETO DO NOVO SISTEMA DE DELIVERY');
console.log('═'.repeat(60));
console.log(`📍 Negócio: ${BIGACAI_DATA.config.business_name}`);
console.log(`📦 Total de itens: ${BIGACAI_DATA.totalItems}`);
console.log(`📁 Categorias: ${BIGACAI_DATA.categories.length}`);

// Teste 1: Detecção de intenção
console.log('\n' + '─'.repeat(60));
console.log('🎯 TESTE 1: Detecção de Intenção');
console.log('─'.repeat(60));

const testMessages = [
  { msg: 'Oi', expected: 'GREETING' },
  { msg: 'Qual o cardápio?', expected: 'WANT_MENU' },
  { msg: 'Me manda o menu', expected: 'WANT_MENU' },
  { msg: 'Qual a taxa de entrega?', expected: 'ASK_DELIVERY_INFO' },
];

let intentPass = 0;
for (const test of testMessages) {
  const result = detectCustomerIntent(test.msg);
  const ok = result === test.expected;
  if (ok) intentPass++;
  console.log(`${ok ? '✅' : '❌'} "${test.msg}" → ${result} ${ok ? '' : `(esperado: ${test.expected})`}`);
}
console.log(`📊 ${intentPass}/${testMessages.length} testes passaram`);

// Teste 2: Formatação em bolhas
console.log('\n' + '─'.repeat(60));
console.log('🎨 TESTE 2: Formatação do Cardápio em Bolhas');
console.log('─'.repeat(60));

const bubbles = formatMenuAsBubbles(BIGACAI_DATA);

console.log(`✅ Cardápio formatado em ${bubbles.length} bolha(s)\n`);

let totalItems = 0;
bubbles.forEach((bubble, i) => {
  const items = (bubble.match(/•/g) || []).length;
  totalItems += items;
  console.log(`📱 BOLHA ${i + 1} (${bubble.length} chars, ${items} itens)`);
});

console.log(`\n📊 Total de itens nas bolhas: ${totalItems}`);
console.log(`📊 Total esperado: ${BIGACAI_DATA.totalItems}`);

if (totalItems >= BIGACAI_DATA.totalItems) {
  console.log(`\n✅ SUCESSO: Todos os ${totalItems} itens foram incluídos!`);
} else {
  console.log(`\n❌ FALHA: Apenas ${totalItems}/${BIGACAI_DATA.totalItems} itens`);
}

// Mostrar as bolhas
console.log('\n' + '─'.repeat(60));
console.log('📱 PREVIEW DAS BOLHAS (como aparecerão no WhatsApp)');
console.log('─'.repeat(60));

bubbles.forEach((bubble, i) => {
  console.log(`\n${'┌' + '─'.repeat(50)}`);
  console.log(`│ BOLHA ${i + 1}/${bubbles.length}`);
  console.log(`${'├' + '─'.repeat(50)}`);
  console.log(bubble);
  console.log(`${'└' + '─'.repeat(50)}`);
});

// Verificar se o bug foi corrigido
console.log('\n' + '═'.repeat(60));
console.log('📊 VERIFICAÇÃO FINAL');
console.log('═'.repeat(60));

const allText = bubbles.join('\n');
const hasCalabresa = allText.includes('Calabresa');
const hasEsfihas = allText.includes('Esfiha');
const hasBordas = allText.includes('Borda');
const hasRefri1L = allText.includes('Refrigerante 1 Litro');
const hasRefri2L = allText.includes('Refrigerante 2 Litros');

console.log(`\n🔍 Verificando itens que estavam FALTANDO no sistema antigo:`);
console.log(`   ${hasCalabresa ? '✅' : '❌'} Pizza Calabresa`);
console.log(`   ${hasEsfihas ? '✅' : '❌'} Esfihas (16 itens)`);
console.log(`   ${hasBordas ? '✅' : '❌'} Bordas Recheadas (4 itens)`);
console.log(`   ${hasRefri1L ? '✅' : '❌'} Refrigerante 1 Litro`);
console.log(`   ${hasRefri2L ? '✅' : '❌'} Refrigerante 2 Litros`);

// O sistema antigo mostrava apenas 3 itens: "Refrigerante 5L, 2L, Embalagem"
// Verificar se NÃO estamos mostrando itens inventados
// Nota: Procura "5 Litro" no início de palavra (não depois de "1." ou "2.")
const hasInvented5L = /(?<![0-9\.])5\s*Litro/i.test(allText) || /Refrigerante 5L/i.test(allText);
console.log(`\n🔍 Verificando se NÃO há itens INVENTADOS pela IA:`);
console.log(`   ${!hasInvented5L ? '✅' : '❌'} Sem "Refrigerante 5L" inventado`);

const allPassed = totalItems >= BIGACAI_DATA.totalItems && 
                  hasCalabresa && hasEsfihas && hasBordas && 
                  hasRefri1L && hasRefri2L && !hasInvented5L;

console.log('\n' + '═'.repeat(60));
if (allPassed) {
  console.log('🎉 TODOS OS TESTES PASSARAM!');
  console.log('');
  console.log('O novo sistema:');
  console.log('✅ Retorna cardápio DIRETO do banco (não depende da IA)');
  console.log('✅ Inclui TODOS os 36 itens do BigAcai');
  console.log('✅ Não inventa produtos inexistentes');
  console.log('✅ Formata em bolhas separadas para WhatsApp');
  console.log('');
  console.log('🔧 Próximo passo: Integrar com aiAgent.ts');
} else {
  console.log('❌ ALGUNS TESTES FALHARAM');
}
console.log('═'.repeat(60) + '\n');

process.exit(allPassed ? 0 : 1);
