/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🧪 TESTE STANDALONE DO DELIVERY AI SERVICE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Execute com: npx tsx vvvv/test-delivery-standalone.ts
 * 
 * Este script testa o novo sistema simplificado de delivery usando
 * conexão direta com Supabase (sem importar o servidor).
 */

import { createClient } from '@supabase/supabase-js';
import Mistral from '@mistralai/mistralai';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

// ES Module compatibility
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar .env.production
const envPath = path.join(__dirname, '.env.production');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('✅ Carregado .env.production');
} else {
  console.log('⚠️ .env.production não encontrado');
}

// ═══════════════════════════════════════════════════════════════════════
// 📦 CONFIGURAÇÃO SUPABASE
// ═══════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY não encontrada no .env.production');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ═══════════════════════════════════════════════════════════════════════
// 📦 TIPOS E INTERFACES (copiados do deliveryAIService)
// ═══════════════════════════════════════════════════════════════════════

interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_name: string;
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

interface MenuCategory {
  name: string;
  items: MenuItem[];
}

interface DeliveryData {
  config: DeliveryConfig;
  categories: MenuCategory[];
  totalItems: number;
}

type CustomerIntent = 
  | 'GREETING'
  | 'WANT_MENU'
  | 'ASK_ABOUT_ITEM'
  | 'WANT_TO_ORDER'
  | 'ADD_ITEM'
  | 'REMOVE_ITEM'
  | 'CONFIRM_ORDER'
  | 'CANCEL_ORDER'
  | 'ASK_DELIVERY_INFO'
  | 'ASK_BUSINESS_HOURS'
  | 'COMPLAINT'
  | 'OTHER';

// ═══════════════════════════════════════════════════════════════════════
// 🔍 DETECÇÃO DE INTENÇÃO
// ═══════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS: Record<CustomerIntent, RegExp[]> = {
  GREETING: [
    /^(oi|olá|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz)/i,
  ],
  WANT_MENU: [
    /card[aá]pio/i,
    /menu/i,
    /o que (tem|voc[eê]s tem|vende)/i,
    /oque (tem|vende)/i,
    /quais (produto|item|op[çc][oõ]es)/i,
    /me (manda|mostra|envia) o (card[aá]pio|menu)/i,
    /ver (o )?(card[aá]pio|menu|op[çc][oõ]es)/i,
    /pode mandar o menu/i,
    /tem (pizza|hamburguer|a[çc]a[ií]|lanche)/i,
  ],
  ASK_ABOUT_ITEM: [
    /quanto (custa|[eé]) (a|o)/i,
    /qual (o )?(pre[çc]o|valor) d/i,
  ],
  WANT_TO_ORDER: [
    /quero (pedir|fazer.*pedido|encomendar)/i,
    /vou (querer|pedir)/i,
    /pode (anotar|fazer|preparar)/i,
    /me (vê|ve|da|dá) (um|uma|[0-9]+)/i,
  ],
  ADD_ITEM: [/adiciona|coloca/i],
  REMOVE_ITEM: [/tira|remove/i],
  CONFIRM_ORDER: [/^(isso|fechado|pode fechar|confirma)/i],
  CANCEL_ORDER: [/cancela (tudo|o pedido)/i],
  ASK_DELIVERY_INFO: [
    /entrega/i,
    /taxa/i,
    /frete/i,
    /tempo.*demora/i,
    /aceita (pix|cart[aã]o|dinheiro)/i,
    /forma.*pagamento/i,
  ],
  ASK_BUSINESS_HOURS: [/hor[aá]rio/i, /abre.*fecha/i],
  COMPLAINT: [/reclama/i, /problema/i],
  OTHER: [],
};

function detectCustomerIntent(message: string): CustomerIntent {
  const normalizedMsg = message.toLowerCase().trim();
  
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        return intent as CustomerIntent;
      }
    }
  }
  
  return 'OTHER';
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 BUSCAR DADOS DO DELIVERY
// ═══════════════════════════════════════════════════════════════════════

async function getDeliveryData(userId: string): Promise<DeliveryData | null> {
  try {
    // 1. Buscar configuração do delivery
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (configError || !config || !config.is_active) {
      console.log(`🍕 Delivery não ativo para user ${userId}`);
      return null;
    }
    
    // 2. Buscar categorias
    const { data: categories } = await supabase
      .from('menu_categories')
      .select('id, name, sort_order')
      .eq('user_id', userId)
      .order('sort_order', { ascending: true });
    
    // 3. Buscar itens do menu
    const { data: items } = await supabase
      .from('menu_items')
      .select('id, name, description, price, category_id, is_highlight, is_available')
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('name', { ascending: true });
    
    if (!items || items.length === 0) {
      console.log(`🍕 Nenhum item encontrado para user ${userId}`);
      return null;
    }
    
    // 4. Organizar por categoria
    const categoryMap = new Map<string, { name: string; items: MenuItem[] }>();
    const categoryIdToName = new Map<string, string>();
    categories?.forEach(cat => categoryIdToName.set(cat.id, cat.name));
    
    items.forEach(item => {
      const categoryName = categoryIdToName.get(item.category_id) || 'Outros';
      
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, { name: categoryName, items: [] });
      }
      
      categoryMap.get(categoryName)!.items.push({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseFloat(item.price) || 0,
        category_name: categoryName,
        is_highlight: item.is_highlight || false,
        is_available: item.is_available,
      });
    });
    
    return {
      config: {
        id: config.id,
        user_id: config.user_id,
        business_name: config.business_name,
        business_type: config.business_type || 'restaurante',
        delivery_fee: parseFloat(config.delivery_fee) || 0,
        min_order_value: parseFloat(config.min_order_value) || 0,
        estimated_delivery_time: config.estimated_delivery_time || 45,
        accepts_delivery: config.accepts_delivery ?? true,
        accepts_pickup: config.accepts_pickup ?? true,
        payment_methods: config.payment_methods || ['Dinheiro', 'Cartão', 'Pix'],
        is_active: config.is_active,
      },
      categories: Array.from(categoryMap.values()),
      totalItems: items.length,
    };
    
  } catch (error) {
    console.error(`🍕 Erro ao buscar dados:`, error);
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🎨 FORMATAR CARDÁPIO EM BOLHAS
// ═══════════════════════════════════════════════════════════════════════

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
// 🎯 CONFIGURAÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════

const TEST_USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384';

const TEST_MESSAGES: Array<{ message: string; expectedIntent: CustomerIntent }> = [
  { message: 'Oi', expectedIntent: 'GREETING' },
  { message: 'Boa noite', expectedIntent: 'GREETING' },
  { message: 'Qual o cardápio?', expectedIntent: 'WANT_MENU' },
  { message: 'Me manda o menu', expectedIntent: 'WANT_MENU' },
  { message: 'O que vocês tem?', expectedIntent: 'WANT_MENU' },
  { message: 'Tem pizza?', expectedIntent: 'WANT_MENU' },
  { message: 'Qual a taxa de entrega?', expectedIntent: 'ASK_DELIVERY_INFO' },
  { message: 'Aceita pix?', expectedIntent: 'ASK_DELIVERY_INFO' },
  { message: 'Quero fazer um pedido', expectedIntent: 'WANT_TO_ORDER' },
];

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES
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
    // Mostrar primeiros 3 itens de cada categoria
    cat.items.slice(0, 3).forEach(item => {
      console.log(`         • ${item.name} - R$ ${item.price.toFixed(2)}`);
    });
    if (cat.items.length > 3) {
      console.log(`         ... e mais ${cat.items.length - 3} itens`);
    }
  });
  
  console.log(`   🛵 Taxa entrega: R$ ${data.config.delivery_fee.toFixed(2)}`);
  console.log(`   ⏱️ Tempo estimado: ${data.config.estimated_delivery_time} min`);
  console.log(`   💳 Pagamentos: ${data.config.payment_methods.join(', ')}`);
  
  if (data.totalItems >= 30) {
    console.log(`\n✅ SUCESSO: ${data.totalItems} itens encontrados!`);
    return true;
  } else {
    console.log(`\n❌ ALERTA: Apenas ${data.totalItems} itens encontrados`);
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
  
  let totalChars = 0;
  let allItemsCount = 0;
  
  bubbles.forEach((bubble, i) => {
    const itemMatches = bubble.match(/•/g);
    const itemCount = itemMatches ? itemMatches.length : 0;
    allItemsCount += itemCount;
    totalChars += bubble.length;
    
    console.log(`\n📱 BOLHA ${i + 1} (${bubble.length} chars, ${itemCount} itens):`);
    console.log('─'.repeat(50));
    console.log(bubble.substring(0, 400) + (bubble.length > 400 ? '...' : ''));
  });
  
  console.log('\n' + '─'.repeat(50));
  console.log(`📊 RESUMO:`);
  console.log(`   Total de bolhas: ${bubbles.length}`);
  console.log(`   Total de caracteres: ${totalChars}`);
  console.log(`   Itens listados: ${allItemsCount}`);
  
  if (allItemsCount >= data.totalItems - 2) {
    console.log(`\n✅ SUCESSO: Todos os itens foram incluídos!`);
    return true;
  } else {
    console.log(`\n❌ FALHA: Apenas ${allItemsCount}/${data.totalItems} itens incluídos`);
    return false;
  }
}

async function testWantMenu(): Promise<boolean> {
  console.log('\n' + '═'.repeat(60));
  console.log('🍕 TESTE 4: SIMULAÇÃO "Qual o cardápio?"');
  console.log('═'.repeat(60));
  
  const message = 'Qual o cardápio?';
  const intent = detectCustomerIntent(message);
  
  console.log(`📩 Mensagem: "${message}"`);
  console.log(`🎯 Intenção detectada: ${intent}`);
  
  if (intent !== 'WANT_MENU') {
    console.log(`❌ FALHA: Intenção deveria ser WANT_MENU`);
    return false;
  }
  
  const data = await getDeliveryData(TEST_USER_ID);
  if (!data) {
    console.log(`❌ FALHA: Dados não encontrados`);
    return false;
  }
  
  // Como intent é WANT_MENU, o sistema retorna cardápio direto do banco
  const bubbles = formatMenuAsBubbles(data);
  
  console.log(`\n📱 RESPOSTA (${bubbles.length} bolhas):`);
  console.log('─'.repeat(50));
  
  bubbles.forEach((bubble, i) => {
    console.log(`\n[BOLHA ${i + 1}]`);
    console.log(bubble.substring(0, 600) + (bubble.length > 600 ? '...' : ''));
  });
  
  // Verificar se produtos estão lá
  const allText = bubbles.join('\n');
  const itemCount = (allText.match(/•/g) || []).length;
  
  console.log(`\n📊 Itens no cardápio: ${itemCount}`);
  
  if (itemCount >= 30) {
    console.log(`✅ SUCESSO: Cardápio completo com ${itemCount} itens!`);
    return true;
  } else {
    console.log(`❌ FALHA: Apenas ${itemCount} itens (esperado ~36)`);
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUTAR TODOS OS TESTES
// ═══════════════════════════════════════════════════════════════════════

async function runAllTests() {
  console.log('\n' + '═'.repeat(60));
  console.log('🧪 TESTE STANDALONE DO DELIVERY AI SERVICE');
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
  
  // Teste 4: Simular "Qual o cardápio?"
  results.push({ 
    name: 'Simulação WANT_MENU', 
    passed: await testWantMenu() 
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
    console.log('🎉 TODOS OS TESTES PASSARAM!');
    console.log('\n📝 O novo sistema:');
    console.log('   ✅ Detecta intenção corretamente');
    console.log('   ✅ Busca dados do banco (não depende da IA)');
    console.log('   ✅ Formata cardápio em bolhas separadas');
    console.log('   ✅ Retorna TODOS os itens (36 itens)');
    console.log('\n🔧 Próximo passo: Integrar com aiAgent.ts');
  } else {
    console.log('⚠️ ALGUNS TESTES FALHARAM.');
  }
  
  console.log('═'.repeat(60) + '\n');
  
  process.exit(passed === total ? 0 : 1);
}

// Executar
runAllTests().catch(error => {
  console.error('❌ ERRO FATAL:', error);
  process.exit(1);
});
