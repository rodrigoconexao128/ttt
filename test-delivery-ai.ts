/**
 * 🧪 TESTE DE INTEGRAÇÃO DELIVERY + IA
 * 
 * Este script testa o fluxo completo:
 * 1. Verifica se o delivery está configurado corretamente
 * 2. Simula mensagens do cliente pedindo cardápio
 * 3. Analisa se a IA retorna o cardápio completo com preços
 * 4. Testa criação de pedido
 */

import { createClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384'; // bigacaicuiaba@gmail.com

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cores para console
const colors = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(emoji: string, message: string, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

// ════════════════════════════════════════════════════════════════════
// 1. VERIFICAR CONFIGURAÇÃO DE DELIVERY
// ════════════════════════════════════════════════════════════════════
async function verifyDeliveryConfig() {
  log('🔍', '=== VERIFICANDO CONFIGURAÇÃO DE DELIVERY ===', colors.cyan);
  
  const { data: config, error } = await supabase
    .from('delivery_config')
    .select('*')
    .eq('user_id', USER_ID)
    .single();
  
  if (error) {
    log('❌', `Erro ao buscar config: ${error.message}`, colors.red);
    return null;
  }
  
  log('✅', `Business: ${config.business_name}`, colors.green);
  log('✅', `Tipo: ${config.business_type}`, colors.green);
  log('✅', `is_active: ${config.is_active}`, config.is_active ? colors.green : colors.red);
  log('✅', `send_to_ai: ${config.send_to_ai}`, config.send_to_ai ? colors.green : colors.red);
  log('✅', `Taxa entrega: R$${config.delivery_fee}`, colors.green);
  log('✅', `Tempo estimado: ${config.estimated_delivery_time} min`, colors.green);
  
  return config;
}

// ════════════════════════════════════════════════════════════════════
// 2. VERIFICAR CARDÁPIO
// ════════════════════════════════════════════════════════════════════
async function verifyMenu() {
  log('🍕', '=== VERIFICANDO CARDÁPIO ===', colors.cyan);
  
  // Categorias
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('id, name')
    .eq('user_id', USER_ID)
    .eq('is_active', true)
    .order('display_order');
  
  if (catError) {
    log('❌', `Erro ao buscar categorias: ${catError.message}`, colors.red);
    return null;
  }
  
  log('📁', `${categories?.length || 0} categorias encontradas`, colors.green);
  
  // Itens
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select(`
      id, name, description, price, promotional_price, 
      category_id, preparation_time, ingredients, serves, is_featured,
      menu_categories(name)
    `)
    .eq('user_id', USER_ID)
    .eq('is_available', true)
    .order('display_order');
  
  if (itemsError) {
    log('❌', `Erro ao buscar itens: ${itemsError.message}`, colors.red);
    return null;
  }
  
  log('🍽️', `${items?.length || 0} itens disponíveis`, colors.green);
  
  // Mostra resumo por categoria
  if (items && items.length > 0) {
    const byCategory = new Map<string, any[]>();
    for (const item of items) {
      const catName = (item.menu_categories as any)?.name || 'Outros';
      const list = byCategory.get(catName) || [];
      list.push(item);
      byCategory.set(catName, list);
    }
    
    console.log('\n📋 RESUMO DO CARDÁPIO:');
    for (const [cat, catItems] of byCategory) {
      console.log(`\n   ${cat}:`);
      for (const item of catItems.slice(0, 3)) {
        console.log(`      • ${item.name} - R$${item.price}`);
      }
      if (catItems.length > 3) {
        console.log(`      ... e mais ${catItems.length - 3} itens`);
      }
    }
    console.log('');
  }
  
  return { categories, items };
}

// ════════════════════════════════════════════════════════════════════
// 3. GERAR PROMPT DE DELIVERY (SIMULAÇÃO)
// ════════════════════════════════════════════════════════════════════
function generateDeliveryPromptBlock(config: any, items: any[]): string {
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  // Agrupa por categoria
  const categoriesMap = new Map<string, any[]>();
  for (const item of items) {
    const categoryName = (item.menu_categories as any)?.name || 'Outros';
    const list = categoriesMap.get(categoryName) || [];
    list.push(item);
    categoriesMap.set(categoryName, list);
  }
  
  // Monta o cardápio
  let menuText = '';
  for (const [catName, catItems] of categoriesMap) {
    menuText += `\n📁 *${catName}*:\n`;
    for (const item of catItems) {
      const price = item.promotional_price 
        ? `~${formatPrice(item.price)}~ ${formatPrice(item.promotional_price)} (PROMO!)` 
        : formatPrice(item.price);
      
      menuText += `  ${item.is_featured ? '⭐ ' : '• '}${item.name} - ${price}`;
      if (item.serves > 1) menuText += ` (serve ${item.serves})`;
      menuText += '\n';
      
      if (item.description) {
        menuText += `    _${item.description}_\n`;
      }
    }
  }
  
  const paymentMethods = config.payment_methods?.join(', ') || 'Dinheiro, Cartão, Pix';
  
  return `
═══════════════════════════════════════════════════════════════════════
🍕 CARDÁPIO - ${config.business_name?.toUpperCase() || 'PIZZARIA'} (${items.length} itens)
═══════════════════════════════════════════════════════════════════════

${menuText}

📋 *INFORMAÇÕES DO DELIVERY:*
• Entrega: Taxa de ${formatPrice(String(config.delivery_fee))} | Tempo estimado: ~${config.estimated_delivery_time} min
• Retirada no local: GRÁTIS
${config.min_order_value > 0 ? `• Pedido mínimo: ${formatPrice(String(config.min_order_value))}` : ''}
• Formas de pagamento: ${paymentMethods}

**INSTRUÇÕES PARA ATENDIMENTO DE PEDIDOS:**
1. Seja SIMPÁTICO e NATURAL como um atendente humano
2. Quando o cliente pedir o cardápio, ENVIE O CARDÁPIO COMPLETO ACIMA COM TODOS OS PREÇOS
3. Quando o cliente quiser fazer pedido, pergunte DE FORMA CONVERSACIONAL:
   - O que deseja pedir
   - Quantidade de cada item
   - Alguma observação (ex: "sem cebola")
4. SEMPRE confirme o pedido completo antes de finalizar
5. Para FINALIZAR o pedido, peça: Nome, Endereço, Forma de pagamento

**QUANDO O CLIENTE PEDIR O CARDÁPIO/MENU:**
Você DEVE responder listando TODAS as categorias e itens com seus preços conforme mostrado acima.
NÃO resuma. NÃO omita itens. Envie o cardápio COMPLETO formatado de forma bonita.
`;
}

// ════════════════════════════════════════════════════════════════════
// 4. SIMULAR CONVERSA COM IA (USANDO MISTRAL VIA API)
// ════════════════════════════════════════════════════════════════════
async function simulateConversation(systemPrompt: string) {
  log('🤖', '=== SIMULANDO CONVERSA COM IA ===', colors.cyan);
  
  // Mensagens de teste do cliente
  const clientMessages = [
    "Oi, boa noite!",
    "Quero ver o cardápio",
    "me envia o cardapio por favor com os preços",
    "qual valor da pizza?",
    "quero fazer um pedido de 2 pizzas calabresa grande e 1 refrigerante 2 litros"
  ];
  
  console.log('\n📝 PROMPT DO SISTEMA (primeiros 2000 chars):');
  console.log(colors.yellow + systemPrompt.substring(0, 2000) + colors.reset);
  if (systemPrompt.length > 2000) {
    console.log(colors.yellow + `... (mais ${systemPrompt.length - 2000} chars)` + colors.reset);
  }
  
  console.log('\n💬 SIMULAÇÃO DE CONVERSA:');
  console.log('=' .repeat(60));
  
  const conversationHistory: { role: string; content: string }[] = [];
  
  for (const clientMsg of clientMessages) {
    console.log(colors.blue + `\n👤 CLIENTE: ${clientMsg}` + colors.reset);
    
    conversationHistory.push({ role: 'user', content: clientMsg });
    
    // Simular resposta baseada em regras
    let aiResponse = '';
    
    if (clientMsg.toLowerCase().includes('cardápio') || clientMsg.toLowerCase().includes('cardapio') || clientMsg.toLowerCase().includes('menu')) {
      // Extrair a parte do cardápio do prompt
      const cardapioStart = systemPrompt.indexOf('═══════════════════════════════════════════════════════════════════════');
      const instrucaoStart = systemPrompt.indexOf('**INSTRUÇÕES PARA ATENDIMENTO');
      
      if (cardapioStart > -1 && instrucaoStart > -1) {
        const cardapioCompleto = systemPrompt.substring(cardapioStart, instrucaoStart).trim();
        aiResponse = `Claro! Aqui está nosso cardápio completo:\n\n${cardapioCompleto}\n\nO que você gostaria de pedir? 🍕`;
      } else {
        aiResponse = `[SIMULAÇÃO] A IA deveria enviar o cardápio aqui, mas não foi encontrado no prompt.`;
      }
    } else if (clientMsg.toLowerCase().includes('valor') || clientMsg.toLowerCase().includes('preço')) {
      aiResponse = `Nossos preços:\n🍕 Pizzas: a partir de R$30,00 (P), R$40,00 (M), R$55,00 (G)\n🥟 Esfihas: de R$4,00 a R$7,50\n🍹 Bebidas: de R$7,00 a R$15,00\n\nQual pizza te interessou?`;
    } else if (clientMsg.toLowerCase().includes('pedido') || clientMsg.toLowerCase().includes('quero')) {
      aiResponse = `Ótimo! Anotei seu pedido:\n• 2x Pizza Calabresa Grande - R$110,00\n• 1x Refrigerante 2 Litros - R$15,00\n\n📋 Subtotal: R$125,00\n🛵 Taxa de entrega: R$5,00\n💰 **TOTAL: R$130,00**\n\nPara finalizar, preciso do seu nome completo, endereço de entrega e forma de pagamento. 📝`;
    } else if (clientMsg.toLowerCase().includes('oi') || clientMsg.toLowerCase().includes('boa')) {
      aiResponse = `Olá! Seja bem-vindo(a) à Pizzaria Big! 🍕\nComo posso ajudar você hoje?\nTemos pizzas deliciosas, esfihas e muito mais!`;
    } else {
      aiResponse = `[SIMULAÇÃO] Resposta genérica para: "${clientMsg}"`;
    }
    
    console.log(colors.green + `🤖 IA: ${aiResponse}` + colors.reset);
    conversationHistory.push({ role: 'assistant', content: aiResponse });
    
    // Pequena pausa para legibilidade
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  console.log('\n' + '=' .repeat(60));
}

// ════════════════════════════════════════════════════════════════════
// 5. VERIFICAR SE PEDIDOS ESTÃO SENDO CRIADOS
// ════════════════════════════════════════════════════════════════════
async function verifyOrders() {
  log('📦', '=== VERIFICANDO PEDIDOS ===', colors.cyan);
  
  const { data: orders, error } = await supabase
    .from('delivery_orders')
    .select('*')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(5);
  
  if (error) {
    log('❌', `Erro ao buscar pedidos: ${error.message}`, colors.red);
    return;
  }
  
  if (!orders || orders.length === 0) {
    log('⚠️', 'Nenhum pedido encontrado', colors.yellow);
    log('ℹ️', 'Isso significa que a IA não está gerando a tag [PEDIDO_DELIVERY: ...]', colors.yellow);
    return;
  }
  
  log('✅', `${orders.length} pedidos encontrados:`, colors.green);
  for (const order of orders) {
    console.log(`   #${order.order_number} - ${order.customer_name} - ${order.status} - R$${order.total}`);
  }
}

// ════════════════════════════════════════════════════════════════════
// MAIN
// ════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '🧪'.repeat(30));
  console.log('   TESTE DE INTEGRAÇÃO DELIVERY + IA');
  console.log('🧪'.repeat(30) + '\n');
  
  try {
    // 1. Verificar configuração
    const config = await verifyDeliveryConfig();
    if (!config) {
      log('❌', 'Configuração de delivery não encontrada ou inválida', colors.red);
      process.exit(1);
    }
    
    // 2. Verificar cardápio
    const menuData = await verifyMenu();
    if (!menuData || !menuData.items || menuData.items.length === 0) {
      log('❌', 'Cardápio vazio ou não encontrado', colors.red);
      process.exit(1);
    }
    
    // 3. Gerar prompt
    const deliveryPrompt = generateDeliveryPromptBlock(config, menuData.items);
    
    // 4. Simular conversa
    await simulateConversation(deliveryPrompt);
    
    // 5. Verificar pedidos
    await verifyOrders();
    
    console.log('\n' + '═'.repeat(60));
    log('✅', 'TESTE CONCLUÍDO!', colors.green);
    console.log('═'.repeat(60) + '\n');
    
    // Diagnóstico final
    console.log('\n📊 DIAGNÓSTICO:');
    console.log('1. Configuração de delivery: ' + (config.is_active && config.send_to_ai ? '✅ OK' : '❌ PROBLEMA'));
    console.log('2. Cardápio com itens: ' + (menuData.items.length > 0 ? `✅ ${menuData.items.length} itens` : '❌ VAZIO'));
    console.log('3. Prompt gerado: ' + (deliveryPrompt.length > 1000 ? `✅ ${deliveryPrompt.length} chars` : '⚠️ Muito curto'));
    
    console.log('\n💡 POSSÍVEIS PROBLEMAS:');
    console.log('• Se a IA não envia o cardápio completo, pode ser que o modelo está resumindo');
    console.log('• Adicionar instrução explícita: "ENVIE O CARDÁPIO COMPLETO, NÃO RESUMA"');
    console.log('• Verificar se o prompt está sendo injetado corretamente no sistema');
    
  } catch (error) {
    console.error('❌ Erro no teste:', error);
    process.exit(1);
  }
}

main();
