/**
 * 🧪 TESTE END-TO-END DO NOVO SISTEMA DE DELIVERY COM SUPABASE
 * 
 * Execute com: npx tsx vvvv/test-delivery-e2e.ts
 * 
 * Este teste:
 * 1. Conecta no Supabase real
 * 2. Busca dados do BigAcai
 * 3. Testa detecção de intenção
 * 4. Testa formatação em bolhas
 * 5. Simula processamento de mensagens
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Carregar variáveis de ambiente
dotenv.config({ path: '.env.production' });

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;

if (!SUPABASE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY não encontrada no .env.production');
  console.log('');
  console.log('💡 Adicione ao arquivo .env.production:');
  console.log('   SUPABASE_SERVICE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ═══════════════════════════════════════════════════════════════════════
// 📋 COPIAR FUNÇÕES DO deliveryAIService.ts PARA TESTE STANDALONE
// ═══════════════════════════════════════════════════════════════════════

type CustomerIntent = 'GREETING' | 'WANT_MENU' | 'ASK_DELIVERY_INFO' | 'OTHER';

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
    is_active: boolean;
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

async function getDeliveryData(userId: string): Promise<DeliveryData | null> {
  // Buscar config
  const { data: config, error: configError } = await supabase
    .from('delivery_config')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  
  if (configError || !config) {
    console.log(`   ❌ Config não encontrada: ${configError?.message}`);
    return null;
  }
  
  // Buscar itens com categorias
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select(`
      id,
      name,
      description,
      price,
      is_highlight,
      is_available,
      menu_categories!inner(name, display_order)
    `)
    .eq('user_id', userId)
    .eq('is_available', true)
    .order('display_order', { ascending: true });
  
  if (itemsError) {
    console.log(`   ❌ Itens não encontrados: ${itemsError.message}`);
    return null;
  }
  
  // Agrupar por categoria
  const categoriesMap = new Map<string, any[]>();
  
  for (const item of items || []) {
    const catData = item.menu_categories as any;
    const catName = catData?.name || 'Outros';
    
    if (!categoriesMap.has(catName)) {
      categoriesMap.set(catName, []);
    }
    categoriesMap.get(catName)!.push({
      name: item.name,
      description: item.description,
      price: Number(item.price),
      is_highlight: item.is_highlight,
    });
  }
  
  const categories = Array.from(categoriesMap.entries()).map(([name, items]) => ({
    name,
    items,
  }));
  
  return {
    config: {
      business_name: config.business_name,
      business_type: config.business_type,
      delivery_fee: Number(config.delivery_fee) || 0,
      min_order_value: Number(config.min_order_value) || 0,
      estimated_delivery_time: Number(config.estimated_delivery_time) || 45,
      accepts_delivery: config.accepts_delivery ?? true,
      accepts_pickup: config.accepts_pickup ?? true,
      payment_methods: config.payment_methods || ['Dinheiro', 'Cartão', 'Pix'],
      is_active: true,
    },
    categories,
    totalItems: items?.length || 0,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 EXECUTAR TESTES
// ═══════════════════════════════════════════════════════════════════════

async function runTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 TESTE E2E DO NOVO SISTEMA DE DELIVERY');
  console.log('═'.repeat(60));
  console.log(`📡 Conectando ao Supabase: ${SUPABASE_URL}`);
  
  const BIGACAI_USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384';
  
  // Teste 1: Buscar dados do Supabase
  console.log('\n' + '─'.repeat(60));
  console.log('📊 TESTE 1: Buscar dados reais do BigAcai no Supabase');
  console.log('─'.repeat(60));
  
  const deliveryData = await getDeliveryData(BIGACAI_USER_ID);
  
  if (!deliveryData) {
    console.log('❌ Falha ao buscar dados do delivery');
    process.exit(1);
  }
  
  console.log(`✅ Dados obtidos com sucesso!`);
  console.log(`   📍 Negócio: ${deliveryData.config.business_name}`);
  console.log(`   📦 Total de itens: ${deliveryData.totalItems}`);
  console.log(`   📁 Categorias: ${deliveryData.categories.length}`);
  
  deliveryData.categories.forEach(cat => {
    console.log(`      - ${cat.name}: ${cat.items.length} itens`);
  });
  
  // Teste 2: Formatação em bolhas
  console.log('\n' + '─'.repeat(60));
  console.log('🎨 TESTE 2: Formatação em bolhas');
  console.log('─'.repeat(60));
  
  const bubbles = formatMenuAsBubbles(deliveryData);
  
  console.log(`✅ Cardápio formatado em ${bubbles.length} bolha(s)`);
  
  let totalItems = 0;
  bubbles.forEach((bubble, i) => {
    const items = (bubble.match(/•/g) || []).length;
    totalItems += items;
    console.log(`   📱 Bolha ${i + 1}: ${bubble.length} chars, ${items} itens`);
  });
  
  console.log(`\n📊 Total de itens nas bolhas: ${totalItems}`);
  
  // Teste 3: Verificar itens críticos
  console.log('\n' + '─'.repeat(60));
  console.log('🔍 TESTE 3: Verificar itens que estavam FALTANDO');
  console.log('─'.repeat(60));
  
  const allText = bubbles.join('\n');
  const hasCalabresa = allText.includes('Calabresa');
  const hasEsfihas = allText.includes('Esfiha');
  const hasBordas = allText.includes('Borda');
  const hasRefri1L = allText.includes('1 Litro');
  const hasRefri2L = allText.includes('2 Litros');
  
  console.log(`   ${hasCalabresa ? '✅' : '❌'} Pizza Calabresa`);
  console.log(`   ${hasEsfihas ? '✅' : '❌'} Esfihas`);
  console.log(`   ${hasBordas ? '✅' : '❌'} Bordas Recheadas`);
  console.log(`   ${hasRefri1L ? '✅' : '❌'} Refrigerante 1 Litro`);
  console.log(`   ${hasRefri2L ? '✅' : '❌'} Refrigerante 2 Litros`);
  
  // Teste 4: Simulação de mensagens
  console.log('\n' + '─'.repeat(60));
  console.log('💬 TESTE 4: Simulação de mensagens de cliente');
  console.log('─'.repeat(60));
  
  const testMessages = [
    { msg: 'Oi', expectedIntent: 'GREETING' },
    { msg: 'Qual o cardápio?', expectedIntent: 'WANT_MENU' },
    { msg: 'Me manda o menu', expectedIntent: 'WANT_MENU' },
    { msg: 'O que vocês tem?', expectedIntent: 'WANT_MENU' },
    { msg: 'Quais os produtos?', expectedIntent: 'WANT_MENU' },
    { msg: 'Qual a taxa de entrega?', expectedIntent: 'ASK_DELIVERY_INFO' },
    { msg: 'Aceita pix?', expectedIntent: 'ASK_DELIVERY_INFO' },
  ];
  
  let passed = 0;
  for (const test of testMessages) {
    const intent = detectCustomerIntent(test.msg);
    const ok = intent === test.expectedIntent;
    if (ok) passed++;
    console.log(`   ${ok ? '✅' : '❌'} "${test.msg}" → ${intent} ${ok ? '' : `(esperado: ${test.expectedIntent})`}`);
  }
  console.log(`\n   📊 ${passed}/${testMessages.length} mensagens detectadas corretamente`);
  
  // Resumo final
  console.log('\n' + '═'.repeat(60));
  console.log('📊 RESUMO FINAL');
  console.log('═'.repeat(60));
  
  const allPassed = 
    deliveryData.totalItems >= 30 && // Tem pelo menos 30 itens
    totalItems === deliveryData.totalItems && // Todos itens nas bolhas
    hasCalabresa && hasEsfihas && hasBordas && // Itens críticos presentes
    passed === testMessages.length; // Todas detecções corretas
  
  if (allPassed) {
    console.log('🎉 TODOS OS TESTES PASSARAM!');
    console.log('');
    console.log('✅ Dados reais carregados do Supabase');
    console.log('✅ Cardápio com todos os itens formatado');
    console.log('✅ Itens críticos presentes (Calabresa, Esfihas, etc)');
    console.log('✅ Detecção de intenção funcionando');
    console.log('');
    console.log('🚀 O sistema está PRONTO para uso no WhatsApp!');
  } else {
    console.log('❌ ALGUNS TESTES FALHARAM');
    console.log('Verifique os erros acima.');
  }
  console.log('═'.repeat(60) + '\n');
  
  process.exit(allPassed ? 0 : 1);
}

runTests().catch(console.error);
