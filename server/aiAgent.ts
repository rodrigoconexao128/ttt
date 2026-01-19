import { storage } from "./storage";
import type { Message, MistralResponse } from "@shared/schema";
import { getMistralClient } from "./mistralClient";
import { supabase } from "./supabaseAuth";
// NOTA: generateSystemPrompt, detectJailbreak, detectOffTopic foram removidos
// pois o sistema ADVANCED foi desativado para garantir determinismo nas respostas
import crypto from "crypto";
import { validateAgentResponse } from "./agentValidation";
// 🚀 UNIFIED FLOW ENGINE - Sistema híbrido (IA interpreta, Sistema executa)
import { shouldUseFlowEngine, processWithFlowEngine, FlowStorage } from "./flowIntegration";
// 🛡️ BLINDAGEM UNIVERSAL V3.1 - Sistema de hardening de prompts (inclui pré-blindagem anti-alucinação)
import { analyzeUserPrompt, generateUniversalBlindagem, generatePreBlindagem, validateResponse, extractBusinessName } from "./promptBlindagem";

// ═══════════════════════════════════════════════════════════════════════
// 🤖 SISTEMA ANTI-BOT - DETECTA E IGNORA MENSAGENS DE BOTS
// ═══════════════════════════════════════════════════════════════════════
const BOT_PATTERNS = [
  // Bots educacionais
  /anhanguera/i,
  /unopar/i,
  /unip/i,
  /estácio/i,
  /kroton/i,
  // Bots de serviços
  /serasa/i,
  /spc brasil/i,
  /correios/i,
  /sedex/i,
  // Bots de bancos
  /nubank/i,
  // ⚠️ IMPORTANT: não usar /inter/i pois bate em palavras comuns como "interesse"
  /\binter\b/i,
  /c6 bank/i,
  /banco do brasil/i,
  /caixa econômica/i,
  /bradesco/i,
  /itaú/i,
  /santander/i,
  // Bots de delivery
  /ifood/i,
  /rappi/i,
  /uber eats/i,
  /99 food/i,
  // Bots genéricos
  /não responda este número/i,
  /mensagem automática/i,
  /canal oficial/i,
  /mensagem gerada automaticamente/i,
  /este é um aviso automático/i,
  /this is an automated/i,
  /do not reply/i,
  /não responda/i,
  /nao responda/i,
  /verificação de conta/i,
  /código de verificação/i,
  /seu código é/i,
  /your code is/i,
  /^\d{4,8}$/,  // Apenas números (códigos de verificação)
];

// Padrões de mensagens automatizadas
const AUTOMATED_MESSAGE_PATTERNS = [
  /^(olá|oi)[,!]?\s+(sou|eu sou|aqui é)\s+(o|a)?\s*bot/i,
  /atendimento (automático|automatizado)/i,
  /^(sua|seu)\s+(fatura|boleto|conta)/i,
  /vence (hoje|amanhã|em \d+ dias)/i,
  /clique (no link|aqui) para/i,
  /acesse o link/i,
  /pix copia e cola/i,
];

function isMessageFromBot(text: string, contactName?: string): { isBot: boolean; reason: string } {
  if (!text) return { isBot: false, reason: '' };
  
  const textLower = text.toLowerCase();
  const nameLower = (contactName || '').toLowerCase();
  
  // Verificar nome do contato
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(nameLower)) {
      return { isBot: true, reason: `Nome do contato match: ${pattern}` };
    }
  }
  
  // Verificar conteúdo da mensagem
  for (const pattern of BOT_PATTERNS) {
    if (pattern.test(textLower)) {
      return { isBot: true, reason: `Conteúdo match: ${pattern}` };
    }
  }
  
  // Verificar padrões de mensagem automatizada
  for (const pattern of AUTOMATED_MESSAGE_PATTERNS) {
    if (pattern.test(textLower)) {
      return { isBot: true, reason: `Mensagem automatizada: ${pattern}` };
    }
  }
  
  return { isBot: false, reason: '' };
}



// ═══════════════════════════════════════════════════════════════════════
// 🔄 DEDUPLICAÇÃO DE RESPOSTAS - EVITA LOOPS
// ═══════════════════════════════════════════════════════════════════════
const responseHashCache = new Map<string, { hash: string; timestamp: number; count: number }>();

function isDuplicateResponse(conversationKey: string, responseText: string): boolean {
  const hash = crypto.createHash('md5').update(responseText.substring(0, 200)).digest('hex');
  const entry = responseHashCache.get(conversationKey);
  
  if (entry && entry.hash === hash) {
    entry.count++;
    entry.timestamp = Date.now();
    
    if (entry.count >= 3) {
      console.log(`🔄 [Anti-Loop] Mesma resposta detectada ${entry.count}x para ${conversationKey}`);
      return true;
    }
  } else {
    responseHashCache.set(conversationKey, { hash, timestamp: Date.now(), count: 1 });
  }
  
  // Limpar cache antigo (mais de 5 minutos)
  const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
  for (const [key, val] of responseHashCache.entries()) {
    if (val.timestamp < fiveMinutesAgo) responseHashCache.delete(key);
  }
  
  return false;
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CACHE DE RESPOSTAS POR PERGUNTA - GARANTE DETERMINISMO
// ═══════════════════════════════════════════════════════════════════════
// O Mistral API pode ter pequenas variações mesmo com temperature=0
// Este cache garante que a MESMA pergunta sempre retorne a MESMA resposta
// TTL: 30 minutos - suficiente para conversas ativas, limpa memória depois
// ═══════════════════════════════════════════════════════════════════════
interface CachedResponse {
  response: string;
  timestamp: number;
  promptHash: string; // Hash do prompt + mensagem para invalidar se prompt mudar
}

const questionResponseCache = new Map<string, CachedResponse>();
const CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutos

function getCachedResponse(userId: string, messageText: string, promptHash: string): string | null {
  // Gerar chave de cache: userId + hash da mensagem normalizada
  const normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
  const messageHash = crypto.createHash('md5').update(normalizedMessage).digest('hex');
  const cacheKey = `${userId}:${messageHash}`;
  
  const cached = questionResponseCache.get(cacheKey);
  
  if (cached) {
    // Verificar se não expirou
    if (Date.now() - cached.timestamp > CACHE_TTL_MS) {
      questionResponseCache.delete(cacheKey);
      console.log(`🗑️ [Response Cache] Cache expirado para key ${cacheKey.substring(0, 30)}...`);
      return null;
    }
    
    // Verificar se o prompt mudou (invalidar cache se mudou)
    if (cached.promptHash !== promptHash) {
      questionResponseCache.delete(cacheKey);
      console.log(`🔄 [Response Cache] Prompt mudou, invalidando cache para key ${cacheKey.substring(0, 30)}...`);
      return null;
    }
    
    console.log(`✅ [Response Cache] HIT! Retornando resposta cacheada para "${normalizedMessage.substring(0, 40)}..."`);
    return cached.response;
  }
  
  return null;
}

function setCachedResponse(userId: string, messageText: string, promptHash: string, response: string): void {
  // Não cachear respostas muito curtas (podem ser erros)
  if (response.length < 20) return;
  
  const normalizedMessage = messageText.toLowerCase().trim().replace(/\s+/g, ' ');
  const messageHash = crypto.createHash('md5').update(normalizedMessage).digest('hex');
  const cacheKey = `${userId}:${messageHash}`;
  
  questionResponseCache.set(cacheKey, {
    response,
    timestamp: Date.now(),
    promptHash,
  });
  
  console.log(`💾 [Response Cache] Resposta salva no cache para "${normalizedMessage.substring(0, 40)}..." (${response.length} chars)`);
  
  // Limpar cache antigo periodicamente
  if (questionResponseCache.size > 500) {
    const now = Date.now();
    for (const [key, val] of questionResponseCache.entries()) {
      if (now - val.timestamp > CACHE_TTL_MS) {
        questionResponseCache.delete(key);
      }
    }
    console.log(`🧹 [Response Cache] Limpeza executada, ${questionResponseCache.size} entradas restantes`);
  }
}

// ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
// Imports comentados - não usar mais:
// import {
//   humanizeResponse,
//   detectEmotion,
//   adjustToneForEmotion,
//   type HumanizationOptions,
// } from "./humanization";
import {
  getAgentMediaLibrary,
  generateMediaPromptBlock,
  parseMistralResponse,
  executeMediaActions,
  forceMediaDetection,
} from "./mediaService";
import { processResponsePlaceholders } from "./textUtils";
import {
  generateSchedulingPromptBlock,
  processSchedulingTags,
  detectSchedulingIntent,
  getNextAvailableSlots,
  formatAvailableSlotsForAI,
} from "./schedulingService";
import {
  processDeliveryOrderTags,
} from "./deliveryService";
import {
  processDeliveryMessage,
  detectCustomerIntent,
  validatePriceInResponse,
  getDeliveryData,
} from "./deliveryAIService";

// ═══════════════════════════════════════════════════════════════════════
// � SISTEMA DE CATÁLOGO DE PRODUTOS - INTEGRAÇÃO COM IA
// ═══════════════════════════════════════════════════════════════════════
interface ProductForAI {
  name: string;
  price: string | null;
  stock: number;
  description: string | null;
  category: string | null;
  link: string | null;
  sku: string | null;
  unit: string;
}

interface ProductsForAIResponse {
  active: boolean;
  instructions: string | null;
  displayInstructions: string | null;
  products: ProductForAI[];
  count: number;
}

async function getProductsForAI(userId: string): Promise<ProductsForAIResponse | null> {
  try {
    // Verifica se o módulo está ativo
    const { data: config, error: configError } = await supabase
      .from('products_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`📦 [Products] Error fetching config:`, configError);
      return null;
    }
    
    const menuAllowed = config ? config.send_to_ai !== false : true;
    const deliveryActive = !!config?.is_active;
    if (!menuAllowed) {
      return null;
    }
    
    // Busca produtos ativos
    const { data: products, error } = await supabase
      .from('products')
      .select('name, price, stock, description, category, link, sku, unit')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('name', { ascending: true });
    
    if (error) {
      console.error(`📦 [Products] Error fetching products:`, error);
      return null;
    }
    
    if (!products || products.length === 0) {
      return null;
    }
    
    console.log(`📦 [Products] Found ${products.length} active products for user ${userId}`);
    
    return {
      active: menuAllowed && items.length > 0,
      business_name: config?.business_name ?? null,
      business_type: config?.business_type ?? 'outros',
      delivery_fee: deliveryActive ? (parseFloat(config?.delivery_fee) || 0) : 0,
      min_order_value: deliveryActive ? (parseFloat(config?.min_order_value) || 0) : 0,
      estimated_delivery_time: deliveryActive ? (config?.estimated_delivery_time || 45) : 45,
      accepts_delivery: deliveryActive ? (config?.accepts_delivery ?? true) : false,
      accepts_pickup: deliveryActive ? (config?.accepts_pickup ?? true) : false,
      payment_methods: config?.payment_methods || ['Dinheiro', 'Cart?o', 'Pix'],
      categories: categoryList,
      total_items: items.length,
      displayInstructions: config?.display_instructions ?? null
    };
  } catch (error) {
    console.error(`📦 [Products] Unexpected error:`, error);
    return null;
  }
}

function generateProductsPromptBlock(productsData: ProductsForAIResponse): string {
  if (!productsData || !productsData.products || productsData.products.length === 0) {
    return '';
  }
  
  // Formata preço em BRL
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  // Agrupa por categoria se houver categorias
  const byCategory = new Map<string, ProductForAI[]>();
  const uncategorized: ProductForAI[] = [];
  
  for (const product of productsData.products) {
    if (product.category) {
      const list = byCategory.get(product.category) || [];
      list.push(product);
      byCategory.set(product.category, list);
    } else {
      uncategorized.push(product);
    }
  }
  
  let productsList = '';
  
  // Lista produtos por categoria
  for (const [category, products] of byCategory) {
    productsList += `\n📁 *${category}*:\n`;
    for (const p of products) {
      productsList += `  • ${p.name} - ${formatPrice(p.price)}`;
      if (p.stock > 0) productsList += ` (${p.stock} ${p.unit} em estoque)`;
      productsList += '\n';
    }
  }
  
  // Lista produtos sem categoria
  if (uncategorized.length > 0) {
    if (byCategory.size > 0) productsList += '\n📁 *Outros*:\n';
    for (const p of uncategorized) {
      productsList += `  • ${p.name} - ${formatPrice(p.price)}`;
      if (p.stock > 0) productsList += ` (${p.stock} ${p.unit} em estoque)`;
      productsList += '\n';
    }
  }
  
  // Instruções customizadas do usuário (comportamento)
  const customInstructions = productsData.instructions 
    ? `\n**INSTRUÇÕES ESPECIAIS DO ADMINISTRADOR:**\n${productsData.instructions}\n` 
    : '';
  
  // Instruções de exibição (formato de listagem)
  const displayInstructions = productsData.displayInstructions
    ? `\n**FORMATO DE APRESENTAÇÃO:**\n${productsData.displayInstructions}\n`
    : '\n**FORMATO DE APRESENTAÇÃO:**\nQuando o cliente pedir a lista, mostre cada produto em uma linha com nome e preço.\n';
  
  return `
═══════════════════════════════════════════════════════════════════════
📦 CATÁLOGO DE PRODUTOS/SERVIÇOS (${productsData.count} itens)
═══════════════════════════════════════════════════════════════════════

${productsList}
${customInstructions}
${displayInstructions}

**INSTRUÇÕES PARA USO DO CATÁLOGO:**
1. Use APENAS os produtos listados acima ao responder sobre preços, disponibilidade e detalhes
2. Se o cliente perguntar algo que não está na lista, diga que não tem essa informação
3. Informe preços exatamente como estão listados
4. Se o estoque estiver zerado ou não informado, diga "consultar disponibilidade"
5. NUNCA invente produtos, preços ou informações que não estão na lista
6. Se houver link do produto, pode mencionar que "pode enviar o link" se relevante

═══════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════
// 🍕 SISTEMA DE DELIVERY - INTEGRAÇÃO COM IA PARA PEDIDOS
// ═══════════════════════════════════════════════════════════════════════
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

export interface DeliveryMenuForAIResponse {
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

async function getDeliveryMenuForAI(userId: string): Promise<DeliveryMenuForAIResponse | null> {
  try {
    // Verifica se o módulo de delivery está ativo
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`🍕 [Delivery] Error fetching config:`, configError);
      return null;
    }
    
    const menuAllowed = config ? config.send_to_ai !== false : true;
    const deliveryActive = !!config?.is_active;
    if (!menuAllowed) {
      return null;
    }
    
    // Busca categorias ativas
    const { data: categories, error: catError } = await supabase
      .from('menu_categories')
      .select('id, name')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });
    
    if (catError) {
      console.error(`🍕 [Delivery] Error fetching categories:`, catError);
    }
    
    // Busca itens do cardápio disponíveis
    const { data: items, error: itemsError } = await supabase
      .from('menu_items')
      .select(`
        id, name, description, price, promotional_price, 
        category_id, preparation_time, ingredients, serves, is_featured,
        menu_categories(name)
      `)
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('display_order', { ascending: true });
    
    if (itemsError) {
      console.error(`🍕 [Delivery] Error fetching items:`, itemsError);
      return null;
    }
    
    if (!items || items.length === 0) {
      return null;
    }
    
    // Agrupa itens por categoria
    const categoriesMap = new Map<string, MenuItemForAI[]>();
    
    for (const item of items) {
      const menuItem: MenuItemForAI = {
        id: item.id,
        name: item.name,
        description: item.description,
        price: item.price,
        promotional_price: item.promotional_price,
        category_name: (item.menu_categories as any)?.name || null,
        preparation_time: item.preparation_time,
        ingredients: item.ingredients,
        serves: item.serves,
        is_featured: item.is_featured,
      };
      
      const categoryName = (item.menu_categories as any)?.name || 'Outros';
      const list = categoriesMap.get(categoryName) || [];
      list.push(menuItem);
      categoriesMap.set(categoryName, list);
    }
    
    // Converte para array de categorias ordenado
    const categoryList = Array.from(categoriesMap.entries()).map(([name, items]) => ({
      name,
      items
    }));
    
    console.log(`🍕 [Delivery] Found ${items.length} menu items for user ${userId}`);
    if (!deliveryActive) {
      console.log(`?? [Delivery] Delivery inativo, enviando card?pio em modo menu-only.`);
    }

    return {
      active: menuAllowed && items.length > 0,
      business_name: config?.business_name ?? null,
      business_type: config?.business_type ?? 'outros',
      delivery_fee: deliveryActive ? (parseFloat(config?.delivery_fee) || 0) : 0,
      min_order_value: deliveryActive ? (parseFloat(config?.min_order_value) || 0) : 0,
      estimated_delivery_time: deliveryActive ? (config?.estimated_delivery_time || 45) : 45,
      accepts_delivery: deliveryActive ? (config?.accepts_delivery ?? true) : false,
      accepts_pickup: deliveryActive ? (config?.accepts_pickup ?? true) : false,
      payment_methods: config?.payment_methods || ['Dinheiro', 'Cart?o', 'Pix'],
      categories: categoryList,
      total_items: items.length,
      displayInstructions: config?.display_instructions ?? null
    };
  } catch (error) {
    console.error(`🍕 [Delivery] Unexpected error:`, error);
    return null;
  }
}

// 🎨 FUNÇÃO AUXILIAR: Formata cardápio bonito para envio ao cliente
export function formatMenuForCustomer(deliveryData: DeliveryMenuForAIResponse): string {
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
      const itemLine = `${item.is_featured ? '⭐ ' : '▪️ '}${item.name}`;
      let itemText = `${itemLine}\n`;
      
      if (item.description) {
        itemText += `   _${item.description}_\n`;
      }
      
      itemText += `   💰 ${price}`;
      if (item.serves > 1) itemText += ` • Serve ${item.serves}`;
      itemText += '\n\n';
      
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

function generateDeliveryPromptBlock(deliveryData: DeliveryMenuForAIResponse): string {
  if (!deliveryData || !deliveryData.categories || deliveryData.categories.length === 0) {
    return '';
  }
  
  // Formata preço em BRL
  const formatPrice = (price: string | null): string => {
    if (!price) return 'Consultar';
    const num = parseFloat(price);
    if (isNaN(num)) return price;
    return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  // Tipos de negócio com emoji
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
  
  // Monta o cardápio para o prompt da IA (formato compacto)
  let menuText = '';
  
  for (const category of deliveryData.categories) {
    menuText += `\n📁 *${category.name}*:\n`;
    for (const item of category.items) {
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
  
  // Formas de pagamento
  const paymentMethods = deliveryData.payment_methods.join(', ');

  // Montar instrução de apresentação
  const displayInstructionsText = deliveryData.displayInstructions 
    ? deliveryData.displayInstructions.trim()
    : '';
  
  // Se as instruções pedem para perguntar primeiro, não usar tag ENVIAR_CARDAPIO_COMPLETO automaticamente
  const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
  const shouldAskFirst = askFirstKeywords.some(kw => displayInstructionsText.toLowerCase().includes(kw));
  
  // Gerar lista de categorias para referência
  const categoryList = deliveryData.categories
    .filter(c => c.items && c.items.length > 0)
    .map(c => `${c.name} (${c.items.length} itens)`)
    .join(', ');

  return `
═══════════════════════════════════════════════════════════════════════
${emoji} CARDÁPIO - ${businessName.toUpperCase()} (${deliveryData.total_items} itens)
═══════════════════════════════════════════════════════════════════════

📁 **CATEGORIAS DISPONÍVEIS:** ${categoryList}

${menuText}

📋 *INFORMAÇÕES DO DELIVERY:*
${deliveryData.accepts_delivery ? `• Entrega: Taxa de ${formatPrice(String(deliveryData.delivery_fee))} | Tempo estimado: ~${deliveryData.estimated_delivery_time} min` : ''}
${deliveryData.accepts_pickup ? '• Retirada no local: GRÁTIS' : ''}
${deliveryData.min_order_value > 0 ? `• Pedido mínimo: ${formatPrice(String(deliveryData.min_order_value))}` : ''}
• Formas de pagamento: ${paymentMethods}

${displayInstructionsText ? `
**📝 INSTRUÇÕES DE APRESENTAÇÃO (SIGA ESTAS REGRAS OBRIGATORIAMENTE):**
${displayInstructionsText}
` : ''}

═══════════════════════════════════════════════════════════════════════
${shouldAskFirst ? `
🎯🎯🎯 **MODO: PERGUNTAR PRIMEIRO - SIGA ESTAS REGRAS!** 🎯🎯🎯
═══════════════════════════════════════════════════════════════════════

⚠️ **REGRA OBRIGATÓRIA:** NÃO envie o cardápio completo de primeira!

Quando o cliente perguntar sobre cardápio/menu/produtos, siga este fluxo:

**PASSO 1 - PERGUNTE A CATEGORIA:**
Responda perguntando qual categoria o cliente quer ver:
"Olá! 😊 Temos ${categoryList}. Qual você gostaria de ver?"

**PASSO 2 - ENVIE APENAS A CATEGORIA ESCOLHIDA:**
Quando ele responder (ex: "pizzas", "esfihas", etc), use a tag:
[ENVIAR_CATEGORIA: nome_da_categoria]

Exemplo: Se o cliente quer ver pizzas, responda:
"Aqui estão nossas pizzas! 🍕
[ENVIAR_CATEGORIA: Pizzas]"

**PASSO 3 - CARDÁPIO COMPLETO (APENAS SE PEDIR):**
Se o cliente pedir explicitamente o cardápio COMPLETO, aí sim use:
[ENVIAR_CARDAPIO_COMPLETO]

⛔ PROIBIDO: Enviar cardápio completo automaticamente
⛔ PROIBIDO: Listar itens manualmente - use as tags!
✅ SEMPRE pergunte a categoria primeiro
✅ Use [ENVIAR_CATEGORIA: X] para mostrar só uma categoria
` : `
🚨🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA E OBRIGATÓRIA 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════

QUANDO O CLIENTE PERGUNTAR SOBRE CARDÁPIO, MENU OU PRODUTOS:
- "Qual o cardápio?" / "O que tem?" / "Me manda o menu" / "Quais produtos?" / etc.

⚠️ VOCÊ É OBRIGADO A RESPONDER COM ESTA TAG NO INÍCIO:
[ENVIAR_CARDAPIO_COMPLETO]

EXEMPLO CORRETO (COPIE ESTE FORMATO):
---
[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! Me avise se quiser fazer um pedido 😊
---

⛔ PROIBIDO: Listar itens/preços manualmente. O sistema inserirá o cardápio completo automaticamente.
⛔ PROIBIDO: Inventar ou resumir o cardápio. Use APENAS a tag.
⛔ PROIBIDO: Citar bebidas, pizzas ou qualquer item sem usar a tag primeiro.

✅ A TAG [ENVIAR_CARDAPIO_COMPLETO] será substituída pelo cardápio formatado bonitinho automaticamente.
`}

**INSTRUÇÕES PARA ATENDIMENTO DE PEDIDOS:**
1. Seja SIMPÁTICO e NATURAL como um atendente humano de ${deliveryData.business_type}
2. 🔴 **REGRA OBRIGATÓRIA - PRIMEIRA MENSAGEM:** Se o cliente NÃO se apresentou com nome, você DEVE perguntar "Qual é o seu nome?" ou "Como você prefere que eu te chame?" ANTES de mostrar cardápio ou falar de produtos. NÃO use "Visitante" - peça o nome real!
3. ${shouldAskFirst ? '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** PERGUNTE qual categoria quer ver primeiro!' : '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** Use a tag [ENVIAR_CARDAPIO_COMPLETO] OBRIGATORIAMENTE'}
4. Quando o cliente quiser fazer pedido, pergunte DE FORMA CONVERSACIONAL:
   - O que deseja pedir (pode sugerir destaques ⭐)
   - Quantidade de cada item
   - Alguma observação (ex: "sem cebola", "bem passado")
5. SEMPRE confirme o pedido completo antes de finalizar:
   - Liste todos os itens com quantidades e preços
   - Mostre o subtotal e taxa de entrega
   - Mostre o TOTAL FINAL
6. Para FINALIZAR o pedido, peça (se ainda não tiver):
   - Nome completo (SE AINDA NÃO PEDIU NO INÍCIO!)
   - Endereço de entrega OU "vou retirar"
   - Forma de pagamento
7. Use emojis de comida de forma moderada para deixar a conversa agradável
8. Se o cliente perguntar sobre item que não existe, sugira algo similar do cardápio
9. Seja PROATIVO: "Gostaria de adicionar uma bebida?" ou "Temos promoção de X!"
10. NUNCA invente preços ou itens que não estão no cardápio - USE O CARDÁPIO ACIMA

**🚨 AÇÃO OBRIGATÓRIA - CRIAR PEDIDO NO SISTEMA:**
Quando o cliente CONFIRMAR o pedido (após você listar os itens e ele aprovar), você DEVE incluir a seguinte tag NO FINAL da sua mensagem para registrar o pedido automaticamente:

[PEDIDO_DELIVERY: CLIENTE=Nome do Cliente, ENDERECO=Endereço completo, TIPO=delivery, PAGAMENTO=forma de pagamento, ITENS=1x Nome do Item;2x Outro Item]

REGRAS DA TAG:
- CLIENTE: Nome completo do cliente (obrigatório)
- ENDERECO: Endereço de entrega (obrigatório se TIPO=delivery, deixar vazio se retirada)
- TIPO: "delivery" para entrega ou "retirada" para retirar no local (obrigatório)
- PAGAMENTO: PIX, Dinheiro, Cartão de Crédito, Cartão de Débito (obrigatório)
- ITENS: Lista de itens no formato "QTDx Nome do Item" separados por ponto-e-vírgula (obrigatório)
         Se tiver observação: "1x Pizza Calabresa (sem cebola);2x Coca-Cola"
- OBS: Observações gerais do pedido (opcional)

EXEMPLO 1 - Delivery:
"Perfeito! Seu pedido está confirmado 🛵

📋 *Resumo:*
• 1x Pizza Calabresa Grande - R$45,00
• 2x Coca-Cola Lata - R$10,00
• Subtotal: R$55,00
• Taxa de entrega: R$5,00
• *Total: R$60,00*

Tempo estimado: ~40 minutos
Pagamento: PIX

Em breve você receberá atualizações! 🍕

[PEDIDO_DELIVERY: CLIENTE=João Silva, ENDERECO=Rua das Flores 123 Apto 45, TIPO=delivery, PAGAMENTO=PIX, ITENS=1x Pizza Calabresa Grande;2x Coca-Cola Lata]"

EXEMPLO 2 - Retirada:
"Pedido confirmado para retirada! 🍕

📋 *Resumo:*
• 2x X-Burguer (sem cebola) - R$36,00
• *Total: R$36,00*

Estará pronto em ~20 minutos
Pagamento: Cartão na retirada

[PEDIDO_DELIVERY: CLIENTE=Maria Santos, ENDERECO=, TIPO=retirada, PAGAMENTO=Cartão de Crédito, ITENS=2x X-Burguer (sem cebola)]"

IMPORTANTE:
- A tag deve ficar NO FINAL da mensagem e será removida automaticamente
- NUNCA mostre a tag ao cliente ou mencione que ela existe
- Use EXATAMENTE o nome dos itens como estão no cardápio
- Só inclua a tag APÓS o cliente CONFIRMAR o pedido
- Se o cliente ainda está escolhendo, NÃO inclua a tag

═══════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════
// � FUNÇÕES AUXILIARES PARA MÓDULO DE CURSO/INFOPRODUTO
// ═══════════════════════════════════════════════════════════════════════

interface CourseConfigForAI {
  active: boolean;
  send_to_ai: boolean;
  course_name: string | null;
  course_description: string | null;
  course_type: string | null;
  target_audience: string | null;
  not_for_audience: string | null;
  learning_outcomes: string[];
  modules: Array<{ id: string; name: string; description: string; duration_minutes: number; lessons: string[]; order: number }>;
  total_hours: number;
  total_lessons: number;
  access_period: string | null;
  has_certificate: boolean;
  certificate_description: string | null;
  guarantee_days: number;
  guarantee_description: string | null;
  price_full: number | null;
  price_promotional: number | null;
  price_installments: number;
  price_installment_value: number | null;
  checkout_link: string | null;
  payment_methods: string[];
  bonus_items: Array<{ id: string; name: string; description: string; value: number }>;
  support_description: string | null;
  community_info: string | null;
  testimonials: Array<{ id: string; name: string; text: string; result: string }>;
  results_description: string | null;
  active_coupons: Array<{ id: string; code: string; discount_percent?: number; discount_value?: number; description: string }>;
  ai_instructions: string | null;
  lead_nurture_message: string | null;
  enrollment_cta: string | null;
}

async function getCourseConfigForAI(userId: string): Promise<CourseConfigForAI | null> {
  try {
    const { data: config, error: configError } = await supabase
      .from('course_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (configError && configError.code !== 'PGRST116') {
      console.error(`📚 [Course] Error fetching config:`, configError);
      return null;
    }
    
    if (!config) {
      return null;
    }
    
    const courseAllowed = config.send_to_ai !== false;
    const courseActive = !!config.is_active;
    
    if (!courseAllowed || !courseActive) {
      return null;
    }
    
    console.log(`📚 [Course] Found course config for user ${userId}: ${config.course_name}`);
    
    return {
      active: courseActive && courseAllowed,
      send_to_ai: courseAllowed,
      course_name: config.course_name,
      course_description: config.course_description,
      course_type: config.course_type || 'curso_online',
      target_audience: config.target_audience,
      not_for_audience: config.not_for_audience,
      learning_outcomes: config.learning_outcomes || [],
      modules: config.modules || [],
      total_hours: parseFloat(config.total_hours) || 0,
      total_lessons: config.total_lessons || 0,
      access_period: config.access_period || 'vitalício',
      has_certificate: config.has_certificate ?? true,
      certificate_description: config.certificate_description,
      guarantee_days: config.guarantee_days || 7,
      guarantee_description: config.guarantee_description,
      price_full: config.price_full ? parseFloat(config.price_full) : null,
      price_promotional: config.price_promotional ? parseFloat(config.price_promotional) : null,
      price_installments: config.price_installments || 12,
      price_installment_value: config.price_installment_value ? parseFloat(config.price_installment_value) : null,
      checkout_link: config.checkout_link,
      payment_methods: config.payment_methods || ['pix', 'cartao_credito', 'boleto'],
      bonus_items: config.bonus_items || [],
      support_description: config.support_description,
      community_info: config.community_info,
      testimonials: config.testimonials || [],
      results_description: config.results_description,
      active_coupons: config.active_coupons || [],
      ai_instructions: config.ai_instructions,
      lead_nurture_message: config.lead_nurture_message,
      enrollment_cta: config.enrollment_cta,
    };
  } catch (error) {
    console.error(`📚 [Course] Unexpected error:`, error);
    return null;
  }
}

function generateCoursePromptBlock(courseData: CourseConfigForAI): string {
  if (!courseData || !courseData.active) {
    return '';
  }
  
  const formatPrice = (price: number | null): string => {
    if (!price) return 'Consultar';
    return price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };
  
  const courseName = courseData.course_name || 'Curso';
  
  // Formatar módulos
  let modulesText = '';
  if (courseData.modules && courseData.modules.length > 0) {
    modulesText = courseData.modules.map((m, i) => 
      `  ${i + 1}. ${m.name}${m.description ? ` - ${m.description}` : ''}`
    ).join('\n');
  }
  
  // Formatar bônus
  let bonusText = '';
  if (courseData.bonus_items && courseData.bonus_items.length > 0) {
    bonusText = courseData.bonus_items.map(b => 
      `  🎁 ${b.name}${b.value ? ` (valor: ${formatPrice(b.value)})` : ''}`
    ).join('\n');
  }
  
  // Formatar depoimentos (máx 3)
  let testimonialsText = '';
  if (courseData.testimonials && courseData.testimonials.length > 0) {
    testimonialsText = courseData.testimonials.slice(0, 3).map(t => 
      `  ⭐ "${t.text}" - ${t.name}${t.result ? ` (${t.result})` : ''}`
    ).join('\n\n');
  }
  
  // Formatar cupons
  let couponsText = '';
  if (courseData.active_coupons && courseData.active_coupons.length > 0) {
    couponsText = courseData.active_coupons.map(c => 
      `  🎟️ ${c.code}: ${c.discount_percent ? c.discount_percent + '% OFF' : formatPrice(c.discount_value || 0) + ' OFF'}`
    ).join('\n');
  }
  
  // Preço formatado
  const priceInfo = courseData.price_promotional && courseData.price_promotional < (courseData.price_full || 0)
    ? `~${formatPrice(courseData.price_full)}~ *${formatPrice(courseData.price_promotional)}* 🔥 PROMOÇÃO!`
    : formatPrice(courseData.price_full);
  
  const installmentInfo = courseData.price_installment_value 
    ? `ou ${courseData.price_installments}x de ${formatPrice(courseData.price_installment_value)}`
    : courseData.price_full 
      ? `ou em até ${courseData.price_installments}x`
      : '';

  return `
═══════════════════════════════════════════════════════════════════════
📚 INFORMAÇÕES DO CURSO: ${courseName.toUpperCase()}
═══════════════════════════════════════════════════════════════════════

📝 *DESCRIÇÃO:*
${courseData.course_description || 'Curso completo para transformar seu conhecimento.'}

🎯 *PARA QUEM É ESTE CURSO:*
${courseData.target_audience || 'Pessoas interessadas em aprender e evoluir.'}

${courseData.not_for_audience ? `❌ *PARA QUEM NÃO É:*\n${courseData.not_for_audience}\n` : ''}

📖 *CONTEÚDO DO CURSO:*
${courseData.total_hours > 0 ? `• ${courseData.total_hours} horas de conteúdo` : ''}
${courseData.total_lessons > 0 ? `• ${courseData.total_lessons} aulas` : ''}
${modulesText ? `\n*Módulos:*\n${modulesText}` : ''}

💰 *INVESTIMENTO:*
• ${priceInfo}
${installmentInfo ? `• ${installmentInfo}` : ''}
• Formas de pagamento: ${courseData.payment_methods.map(p => p.replace('_', ' ')).join(', ')}

✅ *GARANTIA: ${courseData.guarantee_days} dias*
${courseData.guarantee_description || 'Garantia incondicional de satisfação. Se não gostar, devolvemos seu dinheiro.'}

📱 *ACESSO:*
• Período: ${courseData.access_period || 'Vitalício'}
${courseData.has_certificate ? `• 🎓 Inclui Certificado${courseData.certificate_description ? `: ${courseData.certificate_description}` : ''}` : ''}

${bonusText ? `🎁 *BÔNUS INCLUSOS:*\n${bonusText}\n` : ''}

${courseData.support_description ? `💬 *SUPORTE:*\n${courseData.support_description}\n` : ''}
${courseData.community_info ? `👥 *COMUNIDADE:*\n${courseData.community_info}\n` : ''}

${testimonialsText ? `⭐ *DEPOIMENTOS DE ALUNOS:*\n${testimonialsText}\n` : ''}

${courseData.results_description ? `📈 *RESULTADOS:*\n${courseData.results_description}\n` : ''}

${couponsText ? `🎟️ *CUPONS ATIVOS:*\n${couponsText}\n` : ''}

${courseData.checkout_link ? `🔗 *LINK DE INSCRIÇÃO:* ${courseData.checkout_link}` : ''}

═══════════════════════════════════════════════════════════════════════
🚨 INSTRUÇÕES PARA ATENDIMENTO DE VENDA DE CURSO 🚨
═══════════════════════════════════════════════════════════════════════

${courseData.ai_instructions || 'Você é um especialista em vendas de infoprodutos. Seja empático, mostre o valor do curso e sempre mencione a garantia.'}

**REGRAS ABSOLUTAMENTE OBRIGATÓRIAS:**

1. 🔴 **NUNCA INVENTE INFORMAÇÕES!**
   - NUNCA invente preços diferentes dos listados acima
   - NUNCA invente depoimentos ou resultados de alunos
   - NUNCA invente módulos ou conteúdo que não exista
   - Se não souber algo, diga: "Vou confirmar essa informação e te retorno" ou "Posso transferir para um atendente humano"

2. ✅ **SEMPRE MENCIONE A GARANTIA JUNTO COM O PREÇO:**
   Quando falar de preço, SEMPRE lembre: "E você tem ${courseData.guarantee_days} dias de garantia. Se não gostar, devolvemos seu dinheiro."

3. 🎯 **QUALIFIQUE O LEAD:**
   - Entenda a situação atual do cliente
   - Identifique a dor/problema
   - Mostre como o curso resolve
   - Use perguntas: "O que te atraiu no curso?" / "Qual resultado você busca?"

4. 💰 **TRATE OBJEÇÕES COM EMPATIA:**
   - "Está caro" → Mostre o valor + garantia + parcelamento
   - "Preciso pensar" → "Claro! Qual ponto te deixou em dúvida?" + ${courseData.lead_nurture_message || 'Quando estiver pronto(a), é só me chamar!'}
   - "Não tenho tempo" → Mostre flexibilidade do acesso ${courseData.access_period || 'vitalício'}

5. 🛒 **PARA FECHAR A VENDA:**
   ${courseData.enrollment_cta || 'Garanta sua vaga com desconto especial!'}
   ${courseData.checkout_link ? `Link: ${courseData.checkout_link}` : 'Posso enviar o link de pagamento para você?'}

6. 📞 **SE O CLIENTE INSISTIR EM FALAR COM HUMANO:**
   Respeite e diga: "Sem problemas! Vou encaminhar para nossa equipe de atendimento."

**FLUXO IDEAL DE CONVERSA:**
INÍCIO → QUALIFICAÇÃO → FAQ/EXPLICAÇÃO → PREÇOS → TRATAMENTO OBJEÇÕES → FECHAMENTO

**NUNCA:**
- Force a venda se o cliente não estiver pronto
- Minta sobre resultados
- Ignore objeções legítimas
- Seja agressivo ou insistente demais

═══════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════
// �🚫 VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
// ═══════════════════════════════════════════════════════════════════════
async function checkUserSuspension(userId: string): Promise<boolean> {
  try {
    const suspensionStatus = await storage.isUserSuspended(userId);
    if (suspensionStatus.suspended) {
      console.log(`🚫 [AI Agent] Usuário ${userId} está SUSPENSO - IA desativada (${suspensionStatus.data?.type})`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`⚠️ [AI Agent] Erro ao verificar suspensão do usuário ${userId}:`, error);
    return false; // Em caso de erro, permitir funcionamento normal
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🌅 FUNÇÃO DE SAUDAÇÃO BASEADA NO HORÁRIO DO BRASIL
// ═══════════════════════════════════════════════════════════════════════
function getBrazilGreeting(): { greeting: string; period: string } {
  // Usar fuso horário do Brasil (America/Sao_Paulo = UTC-3)
  const now = new Date();
  const brazilOffset = -3 * 60; // UTC-3 em minutos
  const localOffset = now.getTimezoneOffset();
  const brazilTime = new Date(now.getTime() + (localOffset + brazilOffset) * 60 * 1000);
  const hour = brazilTime.getHours();
  
  if (hour >= 5 && hour < 12) {
    return { greeting: "Bom dia", period: "manhã" };
  } else if (hour >= 12 && hour < 18) {
    return { greeting: "Boa tarde", period: "tarde" };
  } else {
    return { greeting: "Boa noite", period: "noite" };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 SISTEMA ANTI-AMNÉSIA GLOBAL (FUNCIONA PARA TODOS OS CLIENTES)
// ═══════════════════════════════════════════════════════════════════════
// Este sistema analisa TODO o histórico da conversa e gera um resumo de 
// memória para que a IA NUNCA esqueça o que já foi discutido.
// É injetado automaticamente para TODOS os prompts de usuários.
// ═══════════════════════════════════════════════════════════════════════

interface ConversationMemory {
  hasGreeted: boolean;           // Já cumprimentou?
  greetingCount: number;         // Quantas vezes cumprimentamos?
  hasAskedName: boolean;         // Já perguntou o nome?
  nameQuestionCount: number;     // Quantas vezes perguntamos o nome?
  hasExplainedProduct: boolean;  // Já explicou o produto/serviço?
  hasAskedBusiness: boolean;     // Já perguntou sobre o negócio do cliente?
  businessQuestionCount: number; // Quantas vezes perguntamos sobre negócio?
  hasSentMedia: string[];        // Quais mídias foram enviadas?
  hasPromisedToSend: string[];   // Prometeu enviar algo?
  hasAnsweredQuestions: string[]; // Quais perguntas já respondeu?
  clientQuestions: string[];     // O que o cliente perguntou?
  clientInfo: {                  // Informações coletadas sobre o cliente
    name?: string;
    business?: string;
    interests?: string[];
    objections?: string[];
    stage?: string;
  };
  lastTopics: string[];          // Últimos assuntos discutidos
  pendingActions: string[];      // Ações prometidas mas não cumpridas
  loopDetected: boolean;         // Detectado padrão de loop?
  loopReason: string;            // Razão do loop detectado
}

export function analyzeConversationHistory(
  conversationHistory: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null; isFromAgent?: boolean }>,
  contactName?: string
): ConversationMemory {
  const memory: ConversationMemory = {
    hasGreeted: false,
    greetingCount: 0,
    hasAskedName: false,
    nameQuestionCount: 0,
    hasExplainedProduct: false,
    hasAskedBusiness: false,
    businessQuestionCount: 0,
    hasSentMedia: [],
    hasPromisedToSend: [],
    hasAnsweredQuestions: [],
    clientQuestions: [],
    clientInfo: { name: contactName },
    lastTopics: [],
    pendingActions: [],
    loopDetected: false,
    loopReason: '',
  };

  if (!conversationHistory || conversationHistory.length === 0) {
    return memory;
  }

  // Padrões de detecção
  const greetingPatterns = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e aí|eae|hey|hello|fala|salve)/i;
  const nameQuestionPatterns = /(qual (é |seu |o seu )?nome|como (você |vc |tu )?(se )?chama|posso te chamar de)/i;
  const businessQuestionPatterns = /(qual (é |seu |o seu )?(negócio|ramo|área|empresa|trabalho)|o que (você |vc )?(faz|vende)|que tipo de|qual seu segmento)/i;
  // Promessas explícitas ("Vou te enviar...")
  const promisePatterns = /(vou (te )?(enviar|mandar|mostrar)|deixa eu (enviar|mandar)|te (envio|mando)|já já (envio|mando)|segue (o|a) |vou te enviar|aqui está|veja o)/i;
  // Ofertas/Perguntas ("Posso te enviar?", "Quer ver?", "Topico te mostrar")
  const offerPatterns = /(posso (te )?(enviar|mandar|mostrar)|quer (ver|que eu envie|que eu mostre)|topa (ver|conhecer)|gostaria de (ver|receber)|topico te (mostrar|enviar)|qual opção você prefere)/i;
  // Aceite do cliente ("Sim", "Pode", "Aguardo", "Quero") - MAIS ABRANGENTE
  const acceptancePatterns = /^(sim|pode|claro|com certeza|quero|manda|envia|aguardo|estou aguardando|ok|blz|tá bom|pode ser|beleza|show|perfeito|ótimo|otimo|bora|vamos|fechou|combinado|certo|isso|exato|manda aí|manda ai|por favor|please|yes|yep|yeah)/i;

  const questionPatterns = /\?$/;
  const mediaPatterns = /(vídeo|video|foto|imagem|áudio|audio|documento|pdf|arquivo|demonstração|demo)/i;
  const pricePatterns = /(preço|valor|quanto custa|R\$|\d+,\d{2}|\d+\.\d{2})/i;
  const featurePatterns = /(funcionalidade|recurso|função|como funciona|o que faz|benefício)/i;

  let lastOfferContent: string | null = null; // O que foi oferecido por último?

  for (const msg of conversationHistory) {
    if (!msg.text) continue;
    const text = msg.text.toLowerCase();
    
    // 🛡️ CORREÇÃO CRÍTICA: Só considerar como "nossa mensagem" se foi do AGENTE (IA)
    // Mensagens manuais do dono (fromMe=true, isFromAgent=false) NÃO devem ser analisadas
    // como se fossem do agente, pois podem conter assuntos diferentes (ex: vendendo AgenteZap)
    const isFromAgent = msg.isFromAgent === true;
    const isFromOwner = msg.fromMe === true && msg.isFromAgent === false;
    const isFromClient = msg.fromMe === false;

    // Ignorar mensagens manuais do dono para análise de memória
    if (isFromOwner) {
      continue;
    }

    if (isFromAgent) {
      // Análise das mensagens DO AGENTE (IA)
      if (greetingPatterns.test(text)) {
        memory.hasGreeted = true;
        memory.greetingCount++;
      }
      if (nameQuestionPatterns.test(text)) {
        memory.hasAskedName = true;
        memory.nameQuestionCount++;
      }
      if (businessQuestionPatterns.test(text)) {
        memory.hasAskedBusiness = true;
        memory.businessQuestionCount++;
      }
      if (pricePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("preço/valor");
      }
      if (featurePatterns.test(text)) {
        memory.hasExplainedProduct = true;
        memory.hasAnsweredQuestions.push("funcionalidades");
      }

      // Detectar promessas de envio
      if (promisePatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) {
          memory.hasPromisedToSend.push(mediaMatch[0]);
        }
      }

      // Detectar OFERTAS de envio (possível pendência se cliente aceitar)
      if (offerPatterns.test(text)) {
        const mediaMatch = text.match(mediaPatterns);
        if (mediaMatch) {
          lastOfferContent = mediaMatch[0]; // Guardar o que foi oferecido (ex: "vídeo")
        } else if (text.includes("como funciona") || text.includes("demonstra")) {
          lastOfferContent = "explicação/vídeo";
        }
      } else {
        // Se falamos outra coisa que não é oferta, limpamos a oferta pendente?
        // Não necessariamente, o cliente pode responder a oferta depois.
        // Mas vamos manter simples: só a última oferta conta.
      }

      // Detectar mídias enviadas
      if (text.includes("[vídeo") || text.includes("[video") || 
          text.includes("enviando vídeo") || text.includes("veja o vídeo") || text.includes("segue o vídeo")) {
        memory.hasSentMedia.push("vídeo");
        // Se enviamos, removemos da lista de promessas e ofertas
        lastOfferContent = null; 
      }
      if (text.includes("[imagem") || text.includes("[foto") || 
          text.includes("enviando imagem") || text.includes("veja a imagem")) {
        memory.hasSentMedia.push("imagem");
        lastOfferContent = null;
      }
      if (text.includes("[áudio") || text.includes("[audio")) {
        memory.hasSentMedia.push("áudio");
      }

    } else if (isFromClient) {
      // Análise das mensagens do cliente
      // 🚨 CRÍTICO: Se cliente aceitou oferta ou disse "aguardo"
      if (lastOfferContent && acceptancePatterns.test(text)) {
        memory.pendingActions.push(`CLIENTE ACEITOU SUA OFERTA! Envie agora: ${lastOfferContent}`);
        memory.hasPromisedToSend.push(lastOfferContent); // Tratar como promessa agora
        lastOfferContent = null; // Oferta aceita e processada
      }
      
      // Se cliente disse "aguardo" ou similar, SEMPRE adicionar ação pendente
      if (text.match(/aguardo|esperando|fico no aguardo|estou esperando|esperarei|pode mandar|pode enviar|manda aí|manda ai/i)) {
         // Procurar no histórico o que foi prometido (APENAS do agente, não do dono)
         const lastAgentMessages = conversationHistory.filter(m => m.isFromAgent === true).slice(-5);
         let promisedItem = "o que foi prometido";
         for (const msg of lastAgentMessages) {
            if (msg.text && msg.text.match(/vídeo|video|áudio|audio|imagem|foto|explicar|mostrar|demonstr/i)) {
               const match = msg.text.match(/(vídeo|video|áudio|audio|imagem|foto)/i);

               if (match) promisedItem = match[0];
               break;
            }
         }
         memory.pendingActions.push(`CLIENTE DISSE "${text.substring(0, 20)}"! ENVIE AGORA: ${promisedItem}. NÃO PERGUNTE NADA, APENAS ENVIE!`);
      }

      if (questionPatterns.test(text)) {
        // Extrair o assunto da pergunta
        if (pricePatterns.test(text)) {
          memory.clientQuestions.push("preço");
        }
        if (featurePatterns.test(text)) {
          memory.clientQuestions.push("funcionalidades");
        }
        if (text.includes("como")) {
          memory.clientQuestions.push("como funciona");
        }
      }

      // Detectar informações do cliente
      if (text.match(/trabalho com|tenho (uma |um )?(loja|empresa|negócio)|meu (negócio|ramo)/i)) {
        memory.clientInfo.business = text;
      }

      // Detectar interesses
      if (text.match(/me interessa|quero saber|gostaria de|preciso de/i)) {
        memory.clientInfo.interests = memory.clientInfo.interests || [];
        memory.clientInfo.interests.push(text.substring(0, 50));
      }

      // Detectar objeções
      if (text.match(/caro|não sei|vou pensar|depois|agora não|muito|difícil/i)) {
        memory.clientInfo.objections = memory.clientInfo.objections || [];
        memory.clientInfo.objections.push(text.substring(0, 50));
      }
    }
  }

  // Verificar promessas não cumpridas
  for (const promised of memory.hasPromisedToSend) {
    if (!memory.hasSentMedia.includes(promised)) {
      memory.pendingActions.push(`Enviar ${promised} que foi prometido`);
    }
  }

  // Extrair últimos tópicos (das últimas 5 mensagens)
  const recentMessages = conversationHistory.slice(-5);
  for (const msg of recentMessages) {
    if (msg.text) {
      if (pricePatterns.test(msg.text)) memory.lastTopics.push("preço");
      if (featurePatterns.test(msg.text)) memory.lastTopics.push("funcionalidades");
      if (mediaPatterns.test(msg.text)) memory.lastTopics.push("mídia/demonstração");
    }
  }

  // 🚨 DETECÇÃO DE LOOPS - Padrões repetitivos que indicam problema
  if (memory.greetingCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Saudação repetida ${memory.greetingCount}x`;
  }
  if (memory.nameQuestionCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Pergunta de nome repetida ${memory.nameQuestionCount}x`;
  }
  if (memory.businessQuestionCount >= 2) {
    memory.loopDetected = true;
    memory.loopReason = `Pergunta de negócio repetida ${memory.businessQuestionCount}x`;
  }

  // Detectar mensagens idênticas do agente
  const agentMessages = conversationHistory.filter(m => m.fromMe).map(m => m.text?.substring(0, 100) || '');
  const messageFrequency = new Map<string, number>();
  for (const msg of agentMessages) {
    if (msg.length > 20) { // Ignorar msgs muito curtas
      const count = (messageFrequency.get(msg) || 0) + 1;
      messageFrequency.set(msg, count);
      if (count >= 3) {
        memory.loopDetected = true;
        memory.loopReason = `Mensagem repetida ${count}x: "${msg.substring(0, 30)}..."`;
      }
    }
  }

  return memory;
}

function generateMemoryContextBlock(
  memory: ConversationMemory,
  contactName?: string
): string {
  const sections: string[] = [];

  // Nome do cliente - SEMPRE usar se disponível
  const clientName = contactName && contactName.trim() && !contactName.match(/^\d+$/) 
    ? contactName.trim() 
    : null;

  sections.push(`
═══════════════════════════════════════════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA (NUNCA ESQUEÇA - ANTI-AMNÉSIA)
═══════════════════════════════════════════════════════════════════════════════`);

  // 🚨 ALERTA DE LOOP DETECTADO - PRIORIDADE MÁXIMA
  if (memory.loopDetected) {
    sections.push(`
🚨🚨🚨 ALERTA CRÍTICO: LOOP DETECTADO! 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════════════
PROBLEMA: ${memory.loopReason}

VOCÊ ESTÁ REPETINDO AS MESMAS COISAS!
ISSO FAZ VOCÊ PARECER UM ROBÔ BURRO E AFASTA CLIENTES!

INSTRUÇÕES OBRIGATÓRIAS:
1. NÃO cumprimente de novo (você já cumprimentou ${memory.greetingCount}x!)
2. NÃO pergunte o nome de novo (você já perguntou ${memory.nameQuestionCount}x!)
3. NÃO pergunte sobre negócio de novo (você já perguntou ${memory.businessQuestionCount}x!)
4. AVANCE a conversa - pergunte algo NOVO ou ofereça algo NOVO
5. Se não sabe o que fazer, pergunte: "Tem mais alguma dúvida?"

SE CONTINUAR REPETINDO = CLIENTE PERDIDO!
═══════════════════════════════════════════════════════════════════════════════`);
  }

  // 1. Nome do cliente - TÉCNICA DE VENDAS: Usar o nome gera rapport
  if (clientName) {
    sections.push(`
👤 NOME DO CLIENTE: ${clientName}
   → Use o nome ${clientName} naturalmente na conversa (técnica de rapport)
   → Exemplo: "Entendi, ${clientName}..." ou "${clientName}, vou te explicar..."
   → NÃO chame de "cara", "véi", "mano" - seja profissional mas acolhedor`);
  } else {
    sections.push(`
👤 NOME DO CLIENTE: Não identificado
   → Trate como "você" de forma respeitosa
   → Se apropriado, pergunte o nome UMA VEZ para personalizar o atendimento`);
  }

  // 2. Status da conversa
  if (memory.hasGreeted) {
    sections.push(`
🚫 CUMPRIMENTO: JÁ FOI FEITO!
   → NÃO cumprimente novamente (sem "Oi", "Olá", "Bom dia")
   → NÃO se apresente de novo
   → Vá DIRETO ao assunto - continue a conversa naturalmente`);
  }

  // 3. Informações já coletadas
  if (memory.hasAskedName) {
    sections.push(`
✅ JÁ PERGUNTOU O NOME: Não pergunte novamente`);
  }
  if (memory.hasAskedBusiness) {
    sections.push(`
✅ JÁ PERGUNTOU SOBRE O NEGÓCIO: Não pergunte novamente`);
  }
  if (memory.hasExplainedProduct) {
    sections.push(`
✅ JÁ EXPLICOU PRODUTO/SERVIÇO: Não repita explicações básicas`);
  }

  // 4. Perguntas já respondidas
  if (memory.hasAnsweredQuestions.length > 0) {
    sections.push(`
📝 PERGUNTAS JÁ RESPONDIDAS (não repita):
   → ${[...new Set(memory.hasAnsweredQuestions)].join(", ")}`);
  }

  // 5. Mídias enviadas
  if (memory.hasSentMedia.length > 0) {
    sections.push(`
📁 MÍDIAS JÁ ENVIADAS (não repita):
   → ${[...new Set(memory.hasSentMedia)].join(", ")}`);
  }

  // 6. AÇÕES PENDENTES - CRÍTICO!
  if (memory.pendingActions.length > 0) {
    sections.push(`
🚨 URGENTE: AÇÃO PENDENTE DETECTADA (PRIORIDADE MÁXIMA) 🚨
═══════════════════════════════════════════════════════════════════════════════
O cliente está AGUARDANDO uma ação que você prometeu ou uma resposta específica.
IGNORE saudações. IGNORE apresentações. NÃO pergunte "como posso ajudar".
VOCÊ JÁ SABE O QUE FAZER. EXECUTE A AÇÃO ABAIXO IMEDIATAMENTE:

   → ${memory.pendingActions.join("\n   → ")}

⚠️ REGRA DE OURO: Se a ação é mandar um vídeo/áudio, MANDE AGORA. Não fale que vai mandar, MANDE.`);
  }

  // 7. Contexto do cliente
  if (memory.clientInfo.business) {
    sections.push(`
🏢 NEGÓCIO DO CLIENTE: ${memory.clientInfo.business.substring(0, 100)}
   → Personalize suas respostas para este segmento`);
  }
  if (memory.clientInfo.interests && memory.clientInfo.interests.length > 0) {
    sections.push(`
💡 INTERESSES DO CLIENTE:
   → ${memory.clientInfo.interests.slice(0, 3).join("\n   → ")}`);
  }
  if (memory.clientInfo.objections && memory.clientInfo.objections.length > 0) {
    sections.push(`
🤔 OBJEÇÕES/PREOCUPAÇÕES DO CLIENTE:
   → ${memory.clientInfo.objections.slice(0, 3).join("\n   → ")}
   → Trabalhe essas objeções com empatia`);
  }

  // 8. Últimos tópicos
  if (memory.lastTopics.length > 0) {
    sections.push(`
📌 ÚLTIMOS ASSUNTOS DISCUTIDOS:
   → ${[...new Set(memory.lastTopics)].join(", ")}
   → Continue nesses tópicos ou avance naturalmente`);
  }

  sections.push(`
═══════════════════════════════════════════════════════════════════════════════
🎯 REGRAS UNIVERSAIS DE VENDAS (TÉCNICAS PROFISSIONAIS)
═══════════════════════════════════════════════════════════════════════════════

1. PERSONALIZAÇÃO (Rapport):
   → Use o nome do cliente naturalmente (gera confiança)
   → Referencie informações que ele já compartilhou
   → Mostre que você LEMBRA da conversa anterior

2. CONSISTÊNCIA:
   → Se prometeu algo, CUMPRA
   → Se explicou algo, não repita do zero
   → Se fez uma pergunta, ESPERE a resposta antes de perguntar outra

3. ESCUTA ATIVA:
   → Responda EXATAMENTE o que foi perguntado
   → Não mude de assunto sem motivo
   → Reconheça objeções antes de contorná-las

4. PROGRESSÃO:
   → Cada mensagem deve AVANÇAR a conversa
   → Não fique em loops repetindo as mesmas informações
   → Tenha um objetivo claro (demo, venda, agendamento)

5. HUMANIZAÇÃO (sem gírias excessivas):
   → Seja profissional mas acolhedor
   → Use emojis com moderação (1-2 por mensagem)
   → Frases curtas e diretas (máx 4-5 linhas por mensagem)
   → NÃO use: "cara", "véi", "mano", "brother" - use o NOME do cliente

═══════════════════════════════════════════════════════════════════════════════`);

  return sections.join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 FUNÇÃO PARA GERAR BLOCO DE CONTEXTO DINÂMICO (NOME, HORÁRIO, ETC)
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: Passar APENAS informações para a IA decidir como usar.
// A IA lê o prompt do cliente e decide: se tem {{nome}}, substitui.
// Se tem gíria no prompt, usa gíria. Se tem formalidade, usa formalidade.
// NÃO IMPOR REGRAS - apenas INFORMAR contexto.
// ═══════════════════════════════════════════════════════════════════════
function generateDynamicContextBlock(contactName?: string, sentMedias?: string[], conversationHistory?: Array<{ fromMe?: boolean; text?: string | null; timestamp?: Date | null }>): string {
  // 🔧 FIX DETERMINISM v2: REMOVIDO getBrazilGreeting() completamente
  // A hora do dia NÃO deve afetar a resposta da IA para garantir determinismo
  // O cliente pode escolher usar saudações no prompt dele se quiser
  
  const formattedName = contactName && contactName.trim() && !contactName.match(/^\d+$/) 
    ? contactName.trim() 
    : "";
  
  const sentMediasList = sentMedias && sentMedias.length > 0 
    ? sentMedias.join(", ") 
    : "nenhuma ainda";
  
  // 🔧 FIX DETERMINISM v2: REMOVIDO hora e data completamente do contexto
  // Essas variáveis causavam variação nas respostas entre chamadas
  // A IA não precisa saber a hora exata para responder bem
  
  // 🔄 DETECTAR SE JÁ HOUVE CONVERSA HOJE
  // Se já temos histórico de conversa hoje, a IA NÃO deve cumprimentar novamente
  let alreadyTalkedToday = false;
  let hasFollowUpMessage = false;
  
  if (conversationHistory && conversationHistory.length > 0) {
    const today = new Date().toDateString();
    alreadyTalkedToday = conversationHistory.some(msg => {
      if (!msg.timestamp) return false;
      const msgDate = new Date(msg.timestamp).toDateString();
      return msgDate === today && msg.fromMe === true; // Nós já enviamos msg hoje
    });
    
    // Detectar se última msg nossa foi follow-up (mensagem de reengajamento)
    const lastOurMessage = conversationHistory.filter(m => m.fromMe).slice(-1)[0];
    if (lastOurMessage?.text) {
      const followUpPatterns = [
        'lembrei de você',
        'passando pra ver',
        'conseguiu pensar',
        'ficou alguma dúvida',
        'como combinamos',
        'retomando'
      ];
      hasFollowUpMessage = followUpPatterns.some(p => 
        lastOurMessage.text?.toLowerCase().includes(p)
      );
    }
  }
  
  // 🔧 FIX DETERMINISM v3: REMOVIDO period/hora completamente
  // A hora do dia causava variação nas respostas - removido para garantir determinismo
  
  // CONTEXTO SIMPLES - IA interpreta conforme prompt do cliente
  // 🔧 FIX DETERMINISM v3: SEM hora, data ou período - garantir determinismo absoluto
  let contextBlock = `
═══════════════════════════════════════════════════════════════════════════════
📋 INFORMAÇÕES DO CLIENTE (use conforme seu prompt)
═══════════════════════════════════════════════════════════════════════════════

👤 Nome do cliente: ${formattedName || "(não identificado - use 'você' se precisar)"}
📁 Mídias já enviadas nesta conversa: ${sentMediasList}

INSTRUÇÕES IMPORTANTES:
- Se seu prompt usa variáveis como {{nome}}, {nome}, [nome], [cliente] etc → substitua por "${formattedName || 'você'}"
- Se seu prompt pede para usar o nome do cliente → use "${formattedName || 'você'}"
- Não repita mídias que já foram enviadas
- SIGA O ESTILO DO SEU PROMPT (gírias, formalidade, etc)`;

  // 🚨 INSTRUÇÕES CRÍTICAS SOBRE CUMPRIMENTOS
  if (alreadyTalkedToday) {
    contextBlock += `

⚠️ ATENÇÃO - CONTINUAÇÃO DE CONVERSA:
- JÁ CONVERSAMOS COM ESTE CLIENTE HOJE!
- NÃO cumprimente novamente (sem "Bom dia", "Oi", "Olá", "Boa tarde")
- NÃO se apresente de novo (sem "Sou X da empresa Y")
- CONTINUE a conversa naturalmente de onde parou
- Responda diretamente ao que o cliente perguntou/disse`;
  }
  
  if (hasFollowUpMessage) {
    contextBlock += `

🔄 RETOMADA APÓS FOLLOW-UP:
- A última mensagem foi um follow-up de reengajamento
- O cliente está VOLTANDO a conversar - seja receptivo!
- NÃO repita o que já foi dito no follow-up
- Avance a conversa para o próximo passo`;
  }

  contextBlock += `
═══════════════════════════════════════════════════════════════════════════════
`;
  
  return contextBlock;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔄 FUNÇÃO PARA LIMPAR PLACEHOLDERS QUE A IA NÃO SUBSTITUIU
// ═══════════════════════════════════════════════════════════════════════
// FILOSOFIA: A IA deve substituir as variáveis. Esta função é apenas
// uma rede de segurança para limpar qualquer {{nome}} ou {nome} que
// escapou. NÃO força saudações - respeita 100% o estilo do prompt.
// ═══════════════════════════════════════════════════════════════════════


// � FUNÇÃO DE RETRY AUTOMÁTICO PARA CHAMADAS DE API
// Implementa exponential backoff para lidar com rate limits e erros temporários
async function withRetry<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  initialDelayMs: number = 1000,
  operationName: string = "API call"
): Promise<T> {
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      lastError = error;
      
      // Verificar se é um erro que vale a pena tentar novamente
      const isRetryable = 
        error?.statusCode === 429 || // Rate limit
        error?.statusCode === 500 || // Server error
        error?.statusCode === 502 || // Bad gateway
        error?.statusCode === 503 || // Service unavailable
        error?.statusCode === 504 || // Gateway timeout
        error?.code === 'ECONNRESET' ||
        error?.code === 'ETIMEDOUT' ||
        error?.code === 'ENOTFOUND' ||
        error?.message?.includes('rate limit') ||
        error?.message?.includes('timeout') ||
        error?.message?.includes('connection');
      
      if (!isRetryable || attempt === maxRetries) {
        console.error(`❌ [AI Agent] ${operationName} falhou após ${attempt} tentativa(s):`, error?.message || error);
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s...
      const delay = initialDelayMs * Math.pow(2, attempt - 1);
      console.log(`⚠️ [AI Agent] ${operationName} falhou (tentativa ${attempt}/${maxRetries}). Retry em ${delay}ms... Erro: ${error?.message || 'Unknown'}`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError || new Error(`${operationName} falhou após ${maxRetries} tentativas`);
}

// 🔔 FUNÇÃO PARA GERAR PROMPT DE NOTIFICAÇÃO DINÂMICO E UNIVERSAL
// Suporta detecção em mensagens do cliente E respostas do agente
function getNotificationPrompt(trigger: string | null | undefined, manualKeywords?: string): string {
  // Proteção contra trigger undefined ou null
  if (!trigger) {
    console.warn('⚠️ [getNotificationPrompt] trigger está undefined/null - retornando string vazia');
    return '';
  }
  const triggerLower = trigger.toLowerCase();
  
  // Combinar palavras-chave predefinidas + manuais
  let keywords: string[] = [];
  let actionDesc = "";
  
  // Palavras-chave baseadas no tipo de gatilho
  if (triggerLower.includes("agendar") || triggerLower.includes("horário") || triggerLower.includes("marcar")) {
    keywords.push("agendar", "agenda", "marcar", "marca", "reservar", "reserva", "tem vaga", "tem horário", "horário disponível", "me encaixa", "encaixe");
    actionDesc = "agendamento";
  } 
  if (triggerLower.includes("reembolso") || triggerLower.includes("devolver") || triggerLower.includes("devolução")) {
    keywords.push("reembolso", "devolver", "devolução", "quero meu dinheiro", "cancelar pedido", "estornar", "estorno");
    actionDesc = actionDesc || "reembolso";
  }
  if (triggerLower.includes("humano") || triggerLower.includes("atendente") || triggerLower.includes("pessoa")) {
    keywords.push("falar com humano", "atendente", "pessoa real", "falar com alguém", "quero um humano", "passa pra alguém");
    actionDesc = actionDesc || "atendente humano";
  }
  if (triggerLower.includes("preço") || triggerLower.includes("valor") || triggerLower.includes("quanto custa")) {
    keywords.push("preço", "valor", "quanto custa", "quanto é", "qual o preço", "tabela de preço");
    actionDesc = actionDesc || "preço";
  }
  if (triggerLower.includes("reclama") || triggerLower.includes("problema") || triggerLower.includes("insatisf")) {
    keywords.push("reclamação", "problema", "insatisfeito", "não funcionou", "com defeito", "quebrou", "errado");
    actionDesc = actionDesc || "reclamação";
  }
  if (triggerLower.includes("comprar") || triggerLower.includes("pedido") || triggerLower.includes("encomendar")) {
    keywords.push("comprar", "quero comprar", "fazer pedido", "encomendar", "pedir", "quero pedir");
    actionDesc = actionDesc || "compra";
  }
  
  // Detectar gatilhos de FINALIZAÇÃO de coleta (universal para qualquer negócio)
  if (triggerLower.includes("finalizar") || triggerLower.includes("encaminhar") || triggerLower.includes("equipe") || triggerLower.includes("informações") || triggerLower.includes("coleta")) {
    keywords.push(
      "encaminhar agora", "vou encaminhar", "já encaminho", "encaminhando",
      "nossa equipe", "equipe analisar", "equipe vai",
      "já recebi", "recebi as fotos", "recebi as informações", "informações completas",
      "vou passar", "já passo", "passando para",
      "aguarde", "fique no aguardo", "retornamos", "entraremos em contato",
      "atendimento vai continuar", "humano vai assumir", "atendente vai"
    );
    actionDesc = actionDesc || "coleta finalizada";
  }
  
  // Se não detectou tipo específico, extrair keywords do trigger + manuais
  if (keywords.length === 0) {
    const extractedKeywords = trigger
      .replace(/me notifique quando o cliente|quiser|quer|pedir|mencionar|falar sobre|ou quando|atendimento automático|finalizar|coleta|informações iniciais/gi, "")
      .trim();
    if (extractedKeywords) {
      keywords.push(...extractedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0));
    }
    actionDesc = "gatilho personalizado";
  }
  
  // Adicionar palavras-chave manuais se fornecidas
  if (manualKeywords) {
    const manualList = manualKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    keywords.push(...manualList);
  }
  
  // Remover duplicatas (compatível com ES5)
  const uniqueKeywords = keywords.filter((value, index, self) => self.indexOf(value) === index);
  
  return `
### REGRA DE NOTIFICACAO INTELIGENTE ###

PALAVRAS-GATILHO: ${uniqueKeywords.join(', ')}

## INSTRUÇÃO CRÍTICA ##
Adicione a tag [NOTIFY: ${actionDesc}] quando QUALQUER uma das condições for verdadeira:

1. **MENSAGEM DO CLIENTE** contém uma palavra-gatilho
2. **SUA PRÓPRIA RESPOSTA** indica que a tarefa/coleta foi concluída
3. **VOCÊ VAI ENCAMINHAR** para equipe humana ou outra área
4. **O ATENDIMENTO AUTOMÁTICO** atingiu seu objetivo

## EXEMPLOS DE QUANDO NOTIFICAR ##

### Cliente solicita algo:
- "Quero agendar" -> [NOTIFY: ${actionDesc}]
- "Tem vaga amanhã?" -> [NOTIFY: ${actionDesc}]

### Você (agente) finaliza coleta de informações:
- "Recebi as fotos e o bairro, vou encaminhar para nossa equipe" -> [NOTIFY: ${actionDesc}]
- "Perfeito! Já tenho tudo que preciso, vou passar para o atendimento" -> [NOTIFY: ${actionDesc}]
- "Informações completas! Aguarde que nossa equipe vai analisar" -> [NOTIFY: ${actionDesc}]

### Você vai transferir para humano:
- "Vou encaminhar agora para nossa equipe analisar" -> [NOTIFY: ${actionDesc}]
- "Nossa equipe já vai te retornar" -> [NOTIFY: ${actionDesc}]

## QUANDO NÃO NOTIFICAR ##
- Cliente apenas perguntou algo genérico
- Conversa ainda está em andamento sem gatilho específico
- Você está apenas explicando algo ou respondendo dúvidas

IMPORTANTE: A tag [NOTIFY: ${actionDesc}] deve estar NO FINAL da sua resposta.
`;
}

// Tipo de retorno expandido para incluir ações de mídia
export interface AIResponseResult {
  text: string | null;
  mediaActions?: MistralResponse['actions'];
  notification?: {
    shouldNotify: boolean;
    reason: string;
  };
  appointmentCreated?: any;
  deliveryOrderCreated?: any;
}

// 📝 Converter formatação Markdown para WhatsApp
// WhatsApp usa: *negrito* _itálico_ ~tachado~ ```mono```
// Mistral retorna: **negrito** *itálico* ~~tachado~~ `mono`
function convertMarkdownToWhatsApp(text: string): string {
  let converted = text;
  
  // 1. Negrito: **texto** → *texto*
  // Regex: Match **...** mas não pegar ***... (que seria bold+italic)
  converted = converted.replace(/\*\*(?!\*)(.+?)\*\*(?!\*)/g, '*$1*');
  
  // 2. Tachado: ~~texto~~ → ~texto~
  converted = converted.replace(/~~(.+?)~~/g, '~$1~');
  
  // 3. Mono (code inline): `texto` → ```texto``` (WhatsApp prefere triplo)
  // Mas preservar blocos de código que já são ```...```
  converted = converted.replace(/(?<!`)\`(?!``)(.+?)\`(?!`)/g, '```$1```');
  
  return converted;
}

// Opções extras para contexto dinâmico
export interface AIResponseOptions {
  contactName?: string;  // Nome do cliente (pushName do WhatsApp)
  contactPhone?: string; // Telefone do cliente (para agendamento)
  sentMedias?: string[]; // Lista de mídias já enviadas nesta conversa
  conversationId?: string; // ID da conversa (para vincular pedidos de delivery)
}

// ═══════════════════════════════════════════════════════════════════════
// 🧹 FUNÇÃO PARA LIMPAR VAZAMENTOS DE INSTRUÇÕES NA RESPOSTA DA IA
// Remove instruções técnicas que a IA às vezes copia do prompt para a resposta
// Ex: "Use exatamente o texto abaixo..." não deve aparecer na mensagem ao cliente
// ═══════════════════════════════════════════════════════════════════════
function cleanInstructionLeaks(responseText: string): string {
  const originalText = responseText;
  let cleanedText = responseText;
  
  // Padrões de instruções técnicas que vazam na resposta
  const instructionPatterns = [
    // "Use exatamente o texto abaixo..." e variações
    /^\s*\*?\*?\s*use\s+\*?exatamente\*?\s+o\s+texto\s+abaixo[^"]*?:\s*/i,
    /^\s*use\s+o\s+(?:modelo|texto)\s+abaixo[^"]*?:\s*/i,
    // "Envie apenas o texto:" e variações
    /envie\s+\*?\*?apenas\*?\*?\s*o\s+texto:?\s*/i,
    // "sem exibir instruções ou notas técnicas"
    /,?\s*sem\s+exibir\s+instru[cç][oõ]es\s+ou\s+notas\s+t[eé]cnicas[^"]*?[:.]?\s*/i,
    // "(ex: "Use exatamente...")"
    /\s*\(ex:?\s*[""][^""]+[""]\.?\)\s*\.?\s*/gi,
    // "mantendo o tom natural e direto:"
    /,?\s*mantendo\s+o\s+tom\s+natural\s+(?:e\s+)?direto:?\s*/i,
    // "sem alterar nome, estrutura ou tom:"
    /,?\s*sem\s+alterar\s+nome,?\s+estrutura\s+ou\s+tom:?\s*/i,
    // Remover asteriscos soltos no início
    /^\s*\*+\s*/,
  ];
  
  // Aplicar cada padrão de limpeza
  for (const pattern of instructionPatterns) {
    cleanedText = cleanedText.replace(pattern, '');
  }
  
  // Se a resposta começa com aspas duplas, provavelmente é o texto entre aspas que queremos
  // Extrair o conteúdo entre as primeiras aspas
  const quotedTextMatch = cleanedText.match(/^[""]([^""]+)[""]$/);
  if (quotedTextMatch) {
    cleanedText = quotedTextMatch[1];
  }
  
  // Se ainda tem aspas no início (sem fechar), remover
  cleanedText = cleanedText.replace(/^[""]/, '').replace(/[""]$/, '');
  
  // Limpar espaços extras
  cleanedText = cleanedText.trim();
  
  // Se limpamos algo significativo, logar
  if (cleanedText !== originalText) {
    console.log(`🧹 [AI Agent] Limpeza de instruções vazadas:`);
    console.log(`   Original (${originalText.length} chars): "${originalText.substring(0, 100)}..."`);
    console.log(`   Limpo (${cleanedText.length} chars): "${cleanedText.substring(0, 100)}..."`);
  }
  
  return cleanedText;
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 FUNÇÃO PARA DETECTAR PEDIDOS DE FORMATAÇÃO LINHA POR LINHA NO CHAT
// Detecta quando o cliente pede que a resposta seja formatada com quebras de linha
// Exemplos: "cada frase em uma linha", "linha por linha", "separado por linha"
// ═══════════════════════════════════════════════════════════════════════
interface FormattingRequest {
  detected: boolean;
  type: 'line-by-line' | 'compact' | null;
  matchedPhrase: string | null;
}

function detectFormattingRequest(conversationHistory: Array<{text?: string | null, fromMe?: boolean}>, newMessageText: string): FormattingRequest {
  // Juntar todas as mensagens do cliente (não as do agente)
  const clientMessages = conversationHistory
    .filter(m => !m.fromMe)
    .map(m => m.text || '')
    .concat([newMessageText || ''])
    .join(' ')
    .toLowerCase();
  
  // Padrões que indicam pedido de formatação LINHA POR LINHA
  const lineByLinePatterns = [
    // Padrões mais genéricos (colocados primeiro para máxima captura)
    /cada\s+um\s+(?:em\s+)?(?:uma\s+)?linha/i,                        // "cada um em uma linha"
    /um\s+(?:em\s+)?cada\s+linha/i,                                    // "um em cada linha"  
    /em\s+(?:uma\s+)?linha\s+(?:separada|diferente|própria)/i,        // "em uma linha separada"
    /(?:cada|um)\s+(?:em\s+)?(?:sua\s+)?(?:própria\s+)?linha/i,       // "cada em sua própria linha"
    // Padrões específicos
    /cada\s+(?:frase|item|bene?f[íi]cio|coisa)\s+(?:em\s+)?(?:uma\s+)?linha/i,
    /linha\s+por\s+linha/i,
    /separad[oa]\s+por\s+linha/i,
    /uma\s+(?:frase|coisa|item)\s+(?:por|em\s+cada)\s+linha/i,
    /em\s+linhas\s+separadas/i,
    /cada\s+linha\s+(?:separada|individual)/i,
    /formata(?:r|do|ção)?\s+(?:com\s+)?(?:quebras?\s+de\s+)?linha/i,
    /(?:pode|quero|gostaria)\s+(?:que\s+)?(?:cada|as)\s+(?:frase|linha)/i,
    /(?:envia|manda)\s+(?:cada|em)\s+linha/i,
    /um\s+(?:item|bene?f[íi]cio)\s+por\s+(?:mensagem|linha)/i,
    /quebra(?:s)?\s+de\s+linha/i,
    /coloca(?:r)?\s+(?:cada\s+)?(?:um|uma)\s+(?:em\s+)?(?:cada\s+)?linha/i,
    /linha\s+separada/i,
  ];
  
  // Padrões que indicam pedido de formatação COMPACTA (tudo junto)
  const compactPatterns = [
    /tudo\s+junto/i,
    /sem\s+quebra/i,
    /texto\s+corrido/i,
    /parágrafo\s+único/i,
    /não\s+precisa\s+(?:de\s+)?linha/i,
  ];
  
  // Verificar padrões de linha por linha
  for (const pattern of lineByLinePatterns) {
    const match = clientMessages.match(pattern);
    if (match) {
      console.log(`🎯 [AI Agent] PEDIDO DE FORMATAÇÃO DETECTADO: linha-por-linha`);
      console.log(`   Frase detectada: "${match[0]}"`);
      return { detected: true, type: 'line-by-line', matchedPhrase: match[0] };
    }
  }
  
  // Verificar padrões de compacto
  for (const pattern of compactPatterns) {
    const match = clientMessages.match(pattern);
    if (match) {
      console.log(`🎯 [AI Agent] PEDIDO DE FORMATAÇÃO DETECTADO: compacto`);
      console.log(`   Frase detectada: "${match[0]}"`);
      return { detected: true, type: 'compact', matchedPhrase: match[0] };
    }
  }
  
  return { detected: false, type: null, matchedPhrase: null };
}

// Gerar instrução de formatação para injetar no prompt
function generateFormattingInstruction(formattingRequest: FormattingRequest): string {
  if (!formattingRequest.detected) return '';
  
  if (formattingRequest.type === 'line-by-line') {
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 INSTRUÇÃO CRÍTICA DE FORMATAÇÃO (O CLIENTE PEDIU EXPLICITAMENTE!)
═══════════════════════════════════════════════════════════════════════════════

O cliente PEDIU para você formatar com CADA FRASE EM UMA LINHA SEPARADA.
Frase detectada: "${formattingRequest.matchedPhrase}"

OBRIGATÓRIO:
- Coloque CADA item, benefício ou informação em SUA PRÓPRIA LINHA
- Use quebra de linha entre cada item
- NÃO coloque múltiplos itens na mesma linha
- Emojis devem aparecer NO INÍCIO de cada linha

EXEMPLO CORRETO:
🎹 Produza mais rápido
🎹 +1000 livrarias de piano
🇧🇷 Timbres brasileiros
🔥 Acesso vitalício

EXEMPLO ERRADO (NÃO FAÇA ISSO):
🎹 Produza mais rápido 🎹 +1000 livrarias 🇧🇷 Timbres brasileiros 🔥 Acesso vitalício

SIGA A PREFERÊNCIA DO CLIENTE!
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  if (formattingRequest.type === 'compact') {
    return `
═══════════════════════════════════════════════════════════════════════════════
🎯 INSTRUÇÃO DE FORMATAÇÃO (O CLIENTE PEDIU TEXTO COMPACTO)
═══════════════════════════════════════════════════════════════════════════════

O cliente PEDIU para você enviar texto mais compacto, sem quebras de linha excessivas.
Frase detectada: "${formattingRequest.matchedPhrase}"

OBRIGATÓRIO:
- Mantenha o texto em formato de parágrafo corrido
- Evite quebras de linha entre itens
- Use vírgulas ou pontos para separar itens

SIGA A PREFERÊNCIA DO CLIENTE!
═══════════════════════════════════════════════════════════════════════════════
`;
  }
  
  return '';
}

export async function generateAIResponse(
  userId: string,
  conversationHistory: Message[],
  newMessageText: string,
  options?: AIResponseOptions,
  testDependencies?: {
    getBusinessAgentConfig?: (id: string) => Promise<any>,
    getAgentConfig?: (id: string) => Promise<any>,
    getAgentMediaLibrary?: (id: string) => Promise<any>
  }
): Promise<AIResponseResult | null> {
  try {
    // 🚫 VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
    // Usuários suspensos não podem usar a IA
    const isSuspended = await checkUserSuspension(userId);
    if (isSuspended) {
      console.log(`🚫 [AI Agent] Usuário ${userId} está SUSPENSO - não respondendo`);
      return null;
    }

    // 🌅 EXTRAIR CONTEXTO DINÂMICO
    const contactName = options?.contactName;
    const sentMedias = options?.sentMedias || [];
    const contactPhone = options?.contactPhone || '';
    
    // 🤖 VERIFICAÇÃO ANTI-BOT - Não responder bots de empresas
    const botCheck = isMessageFromBot(newMessageText, contactName);
    if (botCheck.isBot) {
      console.log(`🤖 [AI Agent] Mensagem de BOT detectada - IGNORANDO`);
      console.log(`   Razão: ${botCheck.reason}`);
      console.log(`   Contato: ${contactName || 'N/A'}`);
      console.log(`   Mensagem: ${newMessageText.substring(0, 50)}...`);
      return null;
    }
    
    console.log(`👤 [AI Agent] Nome do cliente: ${contactName || 'Não identificado'}`);
    console.log(`📁 [AI Agent] Mídias já enviadas: ${sentMedias.length > 0 ? sentMedias.join(', ') : 'nenhuma'}`);
    
    // 🆕 TENTAR BUSCAR BUSINESS CONFIG PRIMEIRO (novo sistema)
    // Usar dependência injetada se existir (para testes)
    let businessConfig;
    if (testDependencies?.getBusinessAgentConfig) {
      businessConfig = await testDependencies.getBusinessAgentConfig(userId);
    } else {
      businessConfig = await storage.getBusinessAgentConfig?.(userId);
    }
    
    // 🔄 FALLBACK: Buscar config legado se novo não existir
    let agentConfig;
    if (testDependencies?.getAgentConfig) {
      agentConfig = await testDependencies.getAgentConfig(userId);
    } else {
      agentConfig = await storage.getAgentConfig(userId);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 DEBUG: Mostrar status das configurações
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`\n🔍 [AI Agent] Verificando configurações para user ${userId}:`);
    console.log(`   📊 Legacy (ai_agent_config): ${agentConfig ? `exists, isActive=${agentConfig.isActive}` : 'NOT FOUND'}`);
    console.log(`   📊 Business (business_agent_configs): ${businessConfig ? `exists, isActive=${businessConfig.isActive}` : 'NOT FOUND'}`);

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 VERIFICAR SE HISTÓRICO ESTÁ ATIVO (busca SEMPRE, não só primeira vez)
    // ═══════════════════════════════════════════════════════════════════════
    const isHistoryModeActive = agentConfig?.fetchHistoryOnFirstResponse === true;
    
    if (isHistoryModeActive) {
      console.log(`📜 [AI Agent] MODO HISTÓRICO ATIVO - ${conversationHistory.length} mensagens serão analisadas com sistema inteligente`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 LÓGICA DE ATIVAÇÃO DO AGENTE:
    // 
    // O `ai_agent_config.isActive` (página /meu-agente-ia) é o PRINCIPAL.
    // Ele controla se o agente responde ou não.
    // 
    // O `business_agent_configs.isActive` controla apenas se usa o "modo
    // avançado" com features extras (jailbreak detection, off-topic, etc.)
    // ═══════════════════════════════════════════════════════════════════════

    if (!agentConfig || !agentConfig.isActive) {
      console.log(`   ❌ [AI Agent] Legacy config not found or inactive - agent DISABLED`);
      return null;
    }
    
    console.log(`   ✅ [AI Agent] Agent ENABLED (legacy isActive=true), processing response...`);
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🔗 INTEGRAÇÃO COM FLOW ENGINE
    // 
    // ARQUITETURA HÍBRIDA:
    // IA INTERPRETA → FLUXO EXECUTA → IA HUMANIZA
    //
    // Quando um fluxo está definido para esse usuário, o sistema:
    // 1. IA interpreta a intenção da mensagem
    // 2. Fluxo executa ações determinísticas (não inventa)
    // 3. IA humaniza a resposta do fluxo
    //
    // Isso previne variação de respostas pois o "core" é determinístico
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const useFlowEngine = await shouldUseFlowEngine(userId);
      if (useFlowEngine) {
        console.log(`\n🔗 [AI Agent] Detectado FlowEngine ativo - usando arquitetura IA+Fluxo`);
        console.log(`   → IA INTERPRETA a intenção`);
        console.log(`   → FLUXO EXECUTA ações determinísticas`);
        console.log(`   → IA HUMANIZA a resposta\n`);
        
        // Obter chave da API para humanização
        const mistralKey = process.env.MISTRAL_API_KEY;
        if (!mistralKey) {
          console.log(`⚠️ [Flow Engine] Sem API key Mistral, usando sistema legado`);
        } else {
          // Gerar ID de conversa persistente
          const conversationId = options?.conversationId || 
            `real-${userId}-${Math.floor(Date.now() / 60000)}`; // Muda a cada minuto
          
          const flowResult = await processWithFlowEngine(
            userId,
            conversationId,
            newMessageText,
            mistralKey,
            {
              contactName,
              history: conversationHistory.map(m => ({ 
                fromMe: m.fromMe, 
                text: m.text || '' 
              }))
            }
          );
          
          if (flowResult) {
            console.log(`✅ [Flow Engine] Resposta gerada com sucesso`);
            return {
              text: flowResult.text,
              mediaActions: flowResult.mediaActions || [],
              notification: undefined,
              appointmentCreated: undefined,
              deliveryOrderCreated: undefined
            };
          } else {
            console.log(`⚠️ [Flow Engine] Sem resposta, usando sistema legado`);
          }
        }
      }
    } catch (flowError) {
      console.error(`⚠️ [Flow Engine] Erro:`, flowError);
      // Continua com sistema legado
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🍕 INTERCEPTAÇÃO DE DELIVERY - NOVO SISTEMA DETERMINÍSTICO (2025)
    // 
    // SE o delivery está ativo e a intenção do cliente é ver o cardápio,
    // retornamos os dados DIRETAMENTE do banco, sem chamar a IA.
    // Isso resolve os problemas:
    // - IA ignorando [ENVIAR_CARDAPIO_COMPLETO]
    // - IA inventando preços/produtos
    // - Cardápio incompleto (3 itens vs 36)
    // ═══════════════════════════════════════════════════════════════════════
    try {
      const deliveryIntent = detectCustomerIntent(newMessageText);
      console.log(`🍕 [AI Agent] Intenção delivery detectada: ${deliveryIntent}`);
      
      // Somente intercepta se for pedido de cardápio/menu
      if (deliveryIntent === 'WANT_MENU' || deliveryIntent === 'GREETING') {
        console.log(`🍕 [AI Agent] Tentando usar novo sistema de delivery...`);
        
        const deliveryResponse = await processDeliveryMessage(
          userId,
          newMessageText,
          conversationHistory?.filter(m => m.text !== null).map(m => ({ fromMe: m.fromMe, text: m.text as string }))
        );
        
        if (deliveryResponse && deliveryResponse.bubbles.length > 0) {
          console.log(`🍕 [AI Agent] ✅ Sistema de delivery retornou ${deliveryResponse.bubbles.length} bolha(s)`);
          console.log(`🍕 [AI Agent] Intent: ${deliveryResponse.intent}`);
          
          // 🎯 Para WANT_MENU: retorna cardápio direto do banco (bypass total da IA)
          // Para GREETING: combina saudação + oferta de cardápio
          
          // Combinar bolhas em uma resposta (o sistema de envio vai dividir)
          const combinedResponse = deliveryResponse.bubbles.join('\n\n');
          
          // Log da resposta para debug
          console.log(`🍕 [AI Agent] Preview: ${combinedResponse.substring(0, 200)}...`);
          console.log(`🍕 [AI Agent] Total chars: ${combinedResponse.length}`);
          
          return {
            text: combinedResponse,
            mediaActions: [],
            notification: undefined,
            appointmentCreated: undefined,
            deliveryOrderCreated: undefined,
          };
        } else {
          console.log(`🍕 [AI Agent] Delivery não ativo ou sem dados - continuando fluxo normal`);
        }
      }
    } catch (deliveryError) {
      console.error(`🍕 [AI Agent] Erro no sistema de delivery:`, deliveryError);
      console.log(`🍕 [AI Agent] Continuando com fluxo normal...`);
    }
    // ═══════════════════════════════════════════════════════════════════════
    
    // 📁 BUSCAR BIBLIOTECA DE MÍDIAS DO AGENTE
    let mediaLibrary;
    if (testDependencies?.getAgentMediaLibrary) {
      mediaLibrary = await testDependencies.getAgentMediaLibrary(userId);
    } else {
      mediaLibrary = await getAgentMediaLibrary(userId);
    }
    const hasMedia = mediaLibrary.length > 0;
    
    if (hasMedia) {
      console.log(`📁 [AI Agent] Found ${mediaLibrary.length} media items for user ${userId}`);
    }
    
    // 🎯 SISTEMA ÚNICO: SEMPRE USA O SISTEMA LEGACY (DETERMINÍSTICO)
    // O sistema ADVANCED foi removido pois causava variação nas respostas
    // devido ao tamanho do prompt (15000+ chars) que prejudica determinismo da Mistral
    const useAdvancedSystem = false; // FORÇADO FALSE - LEGACY APENAS
    
    console.log(`📝 [AI Agent] Using LEGACY system (deterministic) for user ${userId}`);

    // 📝 DEBUG: Log do config do agente para verificar se prompt está correto
    console.log(`\n🤖 [AI Agent] ═══════════════════════════════════════════════════`);
    console.log(`🤖 [AI Agent] Config para user ${userId} respondendo cliente:`);
    console.log(`   Model: ${agentConfig.model}`);
    console.log(`   Active: ${agentConfig.isActive}`);
    console.log(`   Trigger phrases: ${agentConfig.triggerPhrases?.length || 0}`);
    console.log(`   Prompt length: ${agentConfig.prompt?.length || 0} chars`);
    console.log(`   Prompt (primeiros 150 chars): ${agentConfig.prompt?.substring(0, 150) || 'N/A'}...`);
    console.log(`   Prompt (MD5 para debug): ${crypto.createHash('md5').update(agentConfig.prompt || '').digest('hex').substring(0, 8)}`);
    console.log(`🤖 [AI Agent] ═══════════════════════════════════════════════════\n`);

    // NOTA: Detecção de jailbreak foi removida (era apenas para sistema ADVANCED)

    // Validação de trigger phrases: se configuradas, verifica com normalização robusta
    const triggerPhrases = agentConfig.triggerPhrases; // LEGACY apenas
      
    if (triggerPhrases && triggerPhrases.length > 0) {
      // Normalizador: lower, remove acentos, colapsa espaços
      const normalize = (s: string) => (s || "")
        .toLowerCase()
        .normalize("NFD").replace(/\p{Diacritic}/gu, "")
        .replace(/\s+/g, " ")
        .trim();

      const includesNormalized = (haystack: string, needle: string) => {
        const h = normalize(haystack);
        const n = normalize(needle);
        if (!n) return false;
        // também tolera ausência/presença de espaços (ex: "interesse no" vs "interesseno")
        const hNoSpace = h.replace(/\s+/g, "");
        const nNoSpace = n.replace(/\s+/g, "");
        return h.includes(n) || hNoSpace.includes(nNoSpace);
      };

      console.log(`🔍 [AI Agent] Verificando trigger phrases (${triggerPhrases.length} configuradas)`);
      console.log(`   Trigger phrases: ${triggerPhrases.join(', ')}`);

      const lastText = newMessageText || "";
      const allMessages = [
        ...conversationHistory.map(m => m.text || ""),
        lastText
      ].join(" ");

      // Checa primeiro só a última mensagem, depois o histórico completo
      let foundIn = "none";
      const hasTrigger = triggerPhrases.some(phrase => {
        const inLast = includesNormalized(lastText, phrase);
        const inAll = inLast ? false : includesNormalized(allMessages, phrase);
        if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
        console.log(`   Procurando "${phrase}" → last:${inLast ? '✅' : '❌'} | history:${inAll ? '✅' : '❌'}`);
        return inLast || inAll;
      });

      if (!hasTrigger) {
        console.log(`⏸️ [AI Agent] Skipping response - no trigger phrase found for user ${userId}`);
        return null;
      }

      console.log(`✅ [AI Agent] Trigger phrase detected (${foundIn}) for user ${userId}, proceeding with response`);
    }
    
    // NOTA: Detecção Off-Topic foi removida (era apenas para sistema ADVANCED)

     // 🎨 GERAR SYSTEM PROMPT (LEGACY APENAS)
     let systemPrompt: string;
     
     // 📁 GERAR BLOCO DE MÍDIAS SE DISPONÍVEL
     const mediaPromptBlock = hasMedia ? generateMediaPromptBlock(mediaLibrary) : '';
     
     // 🌅 GERAR BLOCO DE CONTEXTO DINÂMICO (NOME, HORÁRIO, MÍDIAS JÁ ENVIADAS)
     const dynamicContextBlock = generateDynamicContextBlock(contactName, sentMedias, conversationHistory);
     
     // 🧠 SISTEMA ANTI-AMNÉSIA GLOBAL (para TODOS os clientes)
     const conversationMemory = analyzeConversationHistory(conversationHistory, contactName);
     const memoryContextBlock = generateMemoryContextBlock(conversationMemory, contactName);
     console.log(`🧠 [AI Agent] Memory analysis: greeted=${conversationMemory.hasGreeted}, pendingActions=${conversationMemory.pendingActions.length}, sentMedia=${conversationMemory.hasSentMedia.length}`);
     
     // �️ BLINDAGEM UNIVERSAL V3 - Sistema de hardening de prompts
     // Analisa o prompt do usuário para extrair contexto e gerar blindagem personalizada
     const promptAnalysis = analyzeUserPrompt(agentConfig.prompt);
     const preBlindagem = generatePreBlindagem(promptAnalysis); // NOVA: Vai no INÍCIO do prompt
     const blindagemUniversal = generateUniversalBlindagem(promptAnalysis);
     const nomeNegocio = promptAnalysis.businessName;
     
     console.log(`🛡️ [Blindagem V3] Análise do prompt: negócio="${nomeNegocio}", tipo="${promptAnalysis.businessType}"`);
     
     systemPrompt = preBlindagem + agentConfig.prompt + `

  ---
  
  ${dynamicContextBlock}
  
  ${blindagemUniversal}
  
  ═══════════════════════════════════════════════════════════════════════════════════
  📋 REGRAS ESPECÍFICAS DO SISTEMA (COMPLEMENTARES)
  ═══════════════════════════════════════════════════════════════════════════════════

  🎤 REGRA SOBRE ÁUDIOS:
  - Você ENTENDE mensagens de voz (são transcritas automaticamente)
  - NUNCA diga "não consigo ouvir áudios" - PROIBIDO
  - Se não transcreveu: "Desculpa, não entendi bem. Pode repetir?"

  🖼️ REGRA SOBRE IMAGENS:
  - Você VÊ imagens (são analisadas automaticamente)
  - Use a descrição fornecida "(Cliente enviou imagem: ...)"
  - NUNCA diga "não consigo ver imagens" - PROIBIDO

  📋 REGRA DE FORMATAÇÃO VERBATIM:
  - Se o prompt diz "envie EXATAMENTE" → COPIE LITERALMENTE
  - PRESERVE quebras de linha, * (negrito), _ (itálico), emojis

  🍕 REGRA PARA CARDÁPIO/MENU:
  - Quando pedirem cardápio/menu/lista de produtos:
    → USE A TAG: [ENVIAR_CARDAPIO_COMPLETO]
    → NUNCA liste produtos manualmente
    → Exemplo: "[ENVIAR_CARDAPIO_COMPLETO]\\n\\nAqui está! 😊 O que vai querer?"
  `;

     // 🔔 INJETAR SISTEMA DE NOTIFICAÇÃO SE CONFIGURADO
     if (businessConfig?.notificationEnabled && businessConfig?.notificationTrigger) {
       console.log(`🔔 [AI Agent] Notification system ACTIVE - Trigger: "${businessConfig.notificationTrigger.substring(0, 50)}..."`);
       const notificationSection = getNotificationPrompt(
         businessConfig.notificationTrigger,
         businessConfig.notificationManualKeywords || undefined
       );
       systemPrompt += notificationSection;
       console.log(`🔔 [AI Agent] Added notification system to prompt`);
     }

     // 📅 INJETAR SISTEMA DE AGENDAMENTO
     try {
       const schedulingPromptBlock = await generateSchedulingPromptBlock(userId);
       if (schedulingPromptBlock) {
         systemPrompt += schedulingPromptBlock;
         console.log(`📅 [AI Agent] Scheduling system ACTIVE - prompt injected`);
       }
     } catch (schedError) {
       console.error(`📅 [AI Agent] Error loading scheduling config:`, schedError);
     }

     // 📦 INJETAR CATÁLOGO DE PRODUTOS (se ativo)
     try {
       const productsData = await getProductsForAI(userId);
       if (productsData && productsData.active && productsData.count > 0) {
         const productsPromptBlock = generateProductsPromptBlock(productsData);
         systemPrompt += '\n\n' + productsPromptBlock;
         console.log(`📦 [AI Agent] Products catalog ACTIVE - ${productsData.count} products injected into prompt`);
       }
     } catch (prodError) {
       console.error(`📦 [AI Agent] Error loading products:`, prodError);
     }

     // 🍕 INJETAR CARDÁPIO DE DELIVERY (se ativo)
     try {
       const deliveryData = await getDeliveryMenuForAI(userId);
       if (deliveryData && deliveryData.active && deliveryData.total_items > 0) {
         const deliveryPromptBlock = generateDeliveryPromptBlock(deliveryData);
         systemPrompt += '\n\n' + deliveryPromptBlock;
         console.log(`🍕 [AI Agent] Delivery menu ACTIVE - ${deliveryData.total_items} items injected into prompt`);
       }
     } catch (deliveryError) {
       console.error(`🍕 [AI Agent] Error loading delivery menu:`, deliveryError);
     }

     // 📚 INJETAR CONTEXTO DE CURSO/INFOPRODUTO (se ativo)
     try {
       const courseData = await getCourseConfigForAI(userId);
       if (courseData && courseData.active) {
         const coursePromptBlock = generateCoursePromptBlock(courseData);
         systemPrompt += '\n\n' + coursePromptBlock;
         console.log(`📚 [AI Agent] Course config ACTIVE - ${courseData.course_name} injected into prompt`);
       }
     } catch (courseError) {
       console.error(`📚 [AI Agent] Error loading course config:`, courseError);
     }

     // 🧠 ADICIONAR SISTEMA ANTI-AMNÉSIA
     systemPrompt += memoryContextBlock;
     
     // 📁 ADICIONAR BLOCO DE MÍDIAS AO PROMPT (PRIORIDADE MÁXIMA - DEVE SER O ÚLTIMO ANTES DAS MENSAGENS)
     // Motivo: Instruções de mídia precisam estar "frescas" na memória do modelo
     // Se ficarem no meio do prompt, são diluídas por outras regras
     if (mediaPromptBlock) {
       systemPrompt += '\n\n' + mediaPromptBlock;
       console.log(`📁 [AI Agent] Added media block to prompt (${mediaPromptBlock.length} chars) - POSITIONED AT END FOR MAXIMUM PRIORITY`);
     }

     console.log(`📝 [AI Agent] Using LEGACY prompt (${systemPrompt.length} chars) - DETERMINISTIC MODE`);
     
     const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: systemPrompt,
      },
     ];

    // ═══════════════════════════════════════════════════════════════════════
    // 🎯 DETECTAR PEDIDO DE FORMATAÇÃO DO CLIENTE (linha por linha, compacto, etc)
    // ═══════════════════════════════════════════════════════════════════════
    const formattingRequest = detectFormattingRequest(conversationHistory, newMessageText);
    if (formattingRequest.detected) {
      const formattingInstruction = generateFormattingInstruction(formattingRequest);
      messages.push({
        role: "system",
        content: formattingInstruction,
      });
      console.log(`🎯 [AI Agent] Instrução de formatação "${formattingRequest.type}" injetada no prompt`);
    }

    // 📜 INSTRUÇÃO ESPECIAL QUANDO MODO HISTÓRICO ESTÁ ATIVO
    // Ajuda a IA a entender que deve analisar o contexto completo da conversa
    if (isHistoryModeActive && conversationHistory.length > 0) {
      // Verificar se a IA já respondeu antes
      const hasAgentResponded = conversationHistory.some(m => m.isFromAgent);
      
      const historyContext = hasAgentResponded 
        ? `
[📜 CONTEXTO DE HISTÓRICO ATIVO]

Esta conversa tem histórico ativo. Você já interagiu com este cliente antes.
ANALISE o histórico completo para manter consistência e continuidade.
NÃO repita informações já fornecidas. Continue de onde parou.
`
        : `
[📜 CONTEXTO IMPORTANTE - ASSUMINDO ATENDIMENTO]

Você está ASSUMINDO o atendimento de um cliente que JÁ CONVERSOU anteriormente.
O histórico abaixo mostra todas as interações anteriores (possivelmente com humano).

INSTRUÇÕES CRÍTICAS:
1. ANALISE todo o histórico para entender o contexto
2. IDENTIFIQUE o que o cliente já perguntou/comprou/quer
3. CONTINUE a conversa de forma natural, sem repetir informações já dadas
4. NÃO se apresente como se fosse a primeira vez - o cliente já conhece a empresa
5. Se houve algum pedido/solicitação anterior, REFERENCIE isso naturalmente
6. Seja CONSISTENTE com qualquer promessa ou informação dada anteriormente

O cliente NÃO SABE que você é uma IA assumindo. Mantenha a continuidade!
`;
      
      messages.push({
        role: "system",
        content: historyContext
      });
      console.log(`📜 [AI Agent] Instrução de histórico adicionada (já respondeu: ${hasAgentResponded})`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🧠 SISTEMA DE MEMÓRIA INTELIGENTE (ConversationSummaryBufferMemory)
    // 
    // Baseado em pesquisa: https://www.pinecone.io/learn/series/langchain/langchain-conversational-memory/
    // 
    // ESTRATÉGIA:
    // 1. Se histórico <= 40 msgs: enviar tudo na íntegra
    // 2. Se histórico > 40 msgs: 
    //    - Últimas 30 mensagens: enviar na íntegra (contexto recente detalhado)
    //    - Mensagens antigas: criar RESUMO compacto (economia de tokens)
    // 
    // Isso permite:
    // - Conversas longas sem explodir tokens
    // - Manter contexto completo do histórico
    // - IA entende todo o relacionamento com o cliente
    // ═══════════════════════════════════════════════════════════════════════
    
    const RECENT_MESSAGES_COUNT = 30; // Quantas mensagens recentes manter na íntegra
    const MAX_MESSAGES_BEFORE_SUMMARY = 40; // Quando começar a resumir
    
    let recentMessages: Message[] = [];
    let historySummary: string | null = null;
    
    if (isHistoryModeActive && conversationHistory.length > MAX_MESSAGES_BEFORE_SUMMARY) {
      // 📚 MODO RESUMO: Histórico grande - criar resumo das antigas + recentes na íntegra
      const oldMessages = conversationHistory.slice(0, -RECENT_MESSAGES_COUNT);
      recentMessages = conversationHistory.slice(-RECENT_MESSAGES_COUNT);
      
      // Criar resumo inteligente das mensagens antigas
      // Agrupa por tópicos/intenções detectadas
      const clientMessages = oldMessages.filter(m => !m.fromMe).map(m => m.text || '');
      const agentMessages = oldMessages.filter(m => m.fromMe).map(m => m.text || '');
      
      // Extrair tópicos principais (primeiras palavras de cada mensagem do cliente)
      const topics = clientMessages
        .map(text => text.substring(0, 60).replace(/[^\w\sáàãâéèêíìîóòõôúùûç]/gi, ''))
        .filter(t => t.length > 5)
        .slice(0, 10); // Max 10 tópicos
      
      // Detectar intenções comuns
      const intentKeywords = {
        preco: ['preço', 'valor', 'quanto', 'custa', 'custo'],
        agendamento: ['agendar', 'marcar', 'horário', 'agenda', 'disponível'],
        duvida: ['dúvida', 'pergunta', 'como', 'funciona', 'pode'],
        problema: ['problema', 'erro', 'não funciona', 'ajuda', 'urgente'],
        compra: ['comprar', 'adquirir', 'pedido', 'encomendar', 'quero'],
        informacao: ['informação', 'saber', 'qual', 'onde', 'quando']
      };
      
      const detectedIntents: string[] = [];
      const allClientText = clientMessages.join(' ').toLowerCase();
      
      for (const [intent, keywords] of Object.entries(intentKeywords)) {
        if (keywords.some(kw => allClientText.includes(kw))) {
          detectedIntents.push(intent);
        }
      }
      
      historySummary = `
[📜 RESUMO DO HISTÓRICO ANTERIOR - ${oldMessages.length} mensagens]

👤 CLIENTE já interagiu ${clientMessages.length}x. Tópicos abordados:
${topics.length > 0 ? topics.map(t => `• ${t}`).join('\n') : '• Conversas gerais'}

🎯 INTENÇÕES DETECTADAS: ${detectedIntents.length > 0 ? detectedIntents.join(', ') : 'conversação geral'}

🤖 VOCÊ já respondeu ${agentMessages.length}x nesta conversa.

⚠️ IMPORTANTE: Use este contexto para entender o relacionamento com o cliente. Não repita informações já dadas. Continue de onde parou.
`;
      
      console.log(`📚 [AI Agent] Histórico grande (${conversationHistory.length} msgs) - Resumindo ${oldMessages.length} antigas + ${recentMessages.length} recentes na íntegra`);
      console.log(`📚 [AI Agent] Intenções detectadas: ${detectedIntents.join(', ') || 'nenhuma específica'}`);
      
    } else if (isHistoryModeActive) {
      // 📋 MODO COMPLETO: Histórico pequeno - enviar tudo na íntegra
      recentMessages = conversationHistory.slice(-100); // Limite de segurança
      console.log(`📋 [AI Agent] Histórico pequeno (${conversationHistory.length} msgs) - Enviando tudo na íntegra`);
      
    } else {
      // 📝 MODO PADRÃO: Sem histórico ativo - comportamento original
      recentMessages = conversationHistory.slice(-100);
    }
    
    // Adicionar resumo do histórico se existir
    if (historySummary) {
      messages.push({
        role: "system",
        content: historySummary
      });
    }

    // 🛡️ ANTI-AMNESIA PROMPT INJECTION
    // Adicionar instrução explícita para não se repetir se já houver histórico
    // ATIVADO SEMPRE QUE HÁ HISTÓRICO (independente de fetchHistoryOnFirstResponse)
    if (conversationHistory.length > 1) {
        // Detectar se cliente está mandando saudação repetida no meio da conversa
        const lastMessages = conversationHistory.slice(-4);
        const clientMessages = lastMessages.filter(m => !m.fromMe);
        const agentMessages = lastMessages.filter(m => m.fromMe);
        
        // Verificar se já temos respostas do agente (conversa em andamento)
        const hasAgentReplies = agentMessages.length > 0;
        
        // Verificar se nova mensagem é uma saudação simples
        const isSaudacao = /^(oi+e?|oie+|olá|ola|bom dia|boa tarde|boa noite|ei|e ai|eai|fala|tudo bem|td bem|blz|beleza)[\s\?!\.]*$/i.test((newMessageText || '').trim());
        
        // Detectar se a mensagem atual já contém informações do negócio do cliente
        const msgLower = (newMessageText || '').toLowerCase();
        const jaDisseOQueTrabalha = /trabalho|faço|vendo|sou|tenho|minha|empresa|loja|negócio|vendas|atendimento|clientes/i.test(msgLower);
        const jaPediuAjuda = /preciso|quero|gostaria|ajuda|ajudar|responder|automatizar|atender/i.test(msgLower);
        
        // Detectar se o agente já interagiu anteriormente
        const jaInteragiu = agentMessages.length > 0;

        // Gerar resumo do contexto para a IA
        const contextSummary = hasAgentReplies 
          ? `O cliente já disse: ${clientMessages.map(m => `"${(m.text || '').substring(0, 50)}"`).join(', ')}`
          : '';
        
        const antiAmnesiaPrompt = `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS DE CONTINUIDADE (OBRIGATÓRIO - SEMPRE SIGA)
═══════════════════════════════════════════════════════════════════════════════

Esta é uma CONVERSA EM ANDAMENTO com ${conversationHistory.length} mensagens.
${contextSummary}

🚫 PROIBIDO (vai fazer você parecer um robô burro):
   ❌ Perguntar "o que você faz?" de novo se cliente JÁ RESPONDEU (inclusive na msg atual!)
   ${jaInteragiu ? '❌ Se apresentar novamente (dizer Nome, Cargo ou Empresa) - O CLIENTE JÁ TE CONHECE!' : ''}
   ${jaInteragiu ? '❌ Repetir a mesma pergunta feita anteriormente - verifique o histórico!' : ''}
   ❌ Ignorar o contexto e recomeçar a conversa do zero
   ❌ Dar a mesma saudação inicial para um novo "oi" no meio da conversa
   ❌ Escrever a palavra "Áudio", "Audio", "Imagem", "Vídeo" SOLTA no texto
   ❌ Repetir o nome do cliente mais de 1x na mesma resposta
   ❌ Concatenar múltiplas respostas em uma só (uma resposta por vez!)
   ❌ SIMULAR O CLIENTE (Nunca escreva "Cliente:", "Rodrigo:", ou invente a resposta dele)
   ❌ RESPONDER A SI MESMO (Nunca faça uma pergunta e responda na mesma mensagem)

✅ OBRIGATÓRIO:
   ✅ Se cliente manda "oi/olá/tudo bem" de novo → responda a saudação de forma BREVE e retome o assunto (no idioma da conversa)
   ✅ Se cliente repete uma pergunta → responda brevemente ("como eu disse, ...")
   ✅ Se cliente responde "sim/não" → entenda o contexto da pergunta anterior
   ✅ Continue de onde parou naturalmente
   ✅ LEIA A MENSAGEM ATUAL INTEIRA - se o cliente já diz o que trabalha/precisa NA PRÓPRIA MENSAGEM, não pergunte de novo!
   ✅ Use o nome do cliente NO MÁXIMO 1 vez por mensagem
   ✅ Responda de forma NATURAL e CURTA (máx 2-3 frases)
   ✅ PARE DE ESCREVER assim que terminar sua vez. AGUARDE o cliente.

${isSaudacao ? `
🎯 ATENÇÃO: O cliente acabou de mandar "${newMessageText}" que é uma SAUDAÇÃO REPETIDA.
   INSTRUÇÃO: Responda a saudação de forma BREVE e pergunte como ajudar, mantendo o idioma e o tom da conversa.
   EXEMPLO (PT): "Oi! Em que posso ajudar?"
   EXEMPLO (EN): "Hi! How can I help?"
   🚫 NÃO se apresente novamente.
   🚫 NÃO repita a pergunta de qualificação ("o que você faz?") se já foi feita.
` : ''}
${jaDisseOQueTrabalha || jaPediuAjuda ? `
🎯 ATENÇÃO: A mensagem ATUAL do cliente JÁ CONTÉM informações importantes!
   O cliente disse: "${newMessageText.substring(0, 100)}"
   ${jaDisseOQueTrabalha ? '→ ELE JÁ DISSE O QUE FAZ/TRABALHA - NÃO PERGUNTE DE NOVO!' : ''}
   ${jaPediuAjuda ? '→ ELE JÁ DISSE O QUE PRECISA - responda a necessidade dele!' : ''}
` : ''}
═══════════════════════════════════════════════════════════════════════════════
`;
        
        messages.push({
            role: "system",
            content: antiAmnesiaPrompt
        });
        
        console.log(`🛡️ [AI Agent] Anti-amnesia prompt injetado (${conversationHistory.length} msgs, saudação=${isSaudacao}, hasReplies=${hasAgentReplies}, jaDisseNegocio=${jaDisseOQueTrabalha})`);
    }
    
    // 🧹 REMOVER DUPLICATAS: Mensagens idênticas confundem a IA
    // MELHORADO: Remove duplicatas adjacentes, mas permite repetição se houver intervalo
    const uniqueMessages: Message[] = [];
    
    for (let i = 0; i < recentMessages.length; i++) {
      const current = recentMessages[i];
      const prev = uniqueMessages.length > 0 ? uniqueMessages[uniqueMessages.length - 1] : null;
      
      // Se for mensagem do mesmo autor com mesmo texto da anterior, ignora (spam)
      if (prev && prev.fromMe === current.fromMe && prev.text === current.text) {
         console.log(`⚠️ [AI Agent] Mensagem duplicada ADJACENTE removida: ${(current.text || '').substring(0, 30)}...`);
         continue;
      }
      
      uniqueMessages.push(current);
    }
    
    console.log(`📋 [AI Agent] Enviando ${uniqueMessages.length} mensagens de contexto (${recentMessages.length - uniqueMessages.length} duplicatas removidas):`);
    
    // Adicionar mensagens do histórico (exceto a última se for do user com mesmo texto que newMessageText)
    for (let i = 0; i < uniqueMessages.length; i++) {
      const msg = uniqueMessages[i];
      
      // 🛡️ CORREÇÃO CRÍTICA: Distinguir mensagens do AGENTE vs mensagens do DONO
      // - isFromAgent=true → A IA enviou esta mensagem → role="assistant"
      // - fromMe=true, isFromAgent=false → O DONO enviou manualmente → NÃO é assistant!
      // - fromMe=false → Cliente enviou → role="user"
      // 
      // BUG ANTERIOR: Mensagens manuais do dono (ex: vendendo AgenteZap) eram tratadas como
      // "assistant", fazendo a IA ALUCINAR e continuar o assunto errado!
      let role: "assistant" | "user" | "system";
      
      if (msg.isFromAgent === true) {
        // A IA realmente enviou esta mensagem
        role = "assistant";
      } else if (msg.fromMe === true && msg.isFromAgent === false) {
        // O DONO enviou manualmente - NÃO INCLUIR como assistant!
        // Opção 1: Pular completamente (dono pode falar coisas fora do escopo)
        // Opção 2: Incluir como contexto de "sistema" (menos confuso para IA)
        // Vamos pular para evitar que IA copie mensagens do dono
        console.log(`   ${i + 1}. [DONO] ${(msg.text || "").substring(0, 50)}... (IGNORADA - msg manual do dono)`);
        continue;
      } else {
        // Cliente enviou
        role = "user";
      }
      
      const isLastMessage = i === uniqueMessages.length - 1;
      
      // Se última mensagem do histórico for do user com mesmo texto que newMessageText, pular (evitar duplicação)
      if (isLastMessage && !msg.fromMe && msg.text === newMessageText) {
        console.log(`   ${i + 1}. [${role}] ${(msg.text || "").substring(0, 50)}... (PULADA - duplicata da nova mensagem)`);
        continue;
      }
      
      const preview = (msg.text || "").substring(0, 50);
      console.log(`   ${i + 1}. [${role}] ${preview}...`);
      
      // 🛡️ FIX: Mistral API rejects empty content. Ensure content is never empty.
      let content = msg.text || "";
      if (!content.trim()) {
        if (msg.mediaType) {
          content = `[Arquivo de ${msg.mediaType}]`;
        } else {
          content = "[Mensagem vazia]";
        }
      }
      
      // 🛡️ FIX: Limpar TODOS os marcadores internos de mídia que não devem aparecer no contexto da IA
      // Isso evita que a IA "aprenda" a repetir esses textos problemáticos
      
      // 1. Limpar padrões de mídia sincronizada do WhatsApp (🎤 Áudio, 🎵 Áudio, 📷 Imagem, etc.)
      // CRÍTICO: Esses textos são salvos quando mídias são sincronizadas do WhatsApp
      // 🎤 FIX 2025: Adicionar TODOS os padrões encontrados no banco de dados
      const audioPatterns = [
        '🎤 Áudio', '🎤 Audio', '🎤Áudio', '🎤Audio',
        '🎵 Áudio', '🎵 Audio', '🎵Áudio', '🎵Audio',  // 🎵 é usado também pelo WhatsApp!
        '[Áudio recebido]', '[Audio recebido]',
        '[Áudio enviado]', '[Audio enviado]',
        '*Áudio*', '*Audio*',
        'Áudio', 'Audio'  // Fallback para casos simples
      ];
      
      // Verificar se a mensagem é APENAS um marcador de áudio (sem transcrição)
      const trimmedContent = content.trim();
      const isAudioMarker = audioPatterns.some(pattern => 
        trimmedContent === pattern || 
        trimmedContent.toLowerCase() === pattern.toLowerCase()
      );
      
      if (isAudioMarker) {
        // Se a mensagem é APENAS o marcador de áudio, indicar que foi mensagem de voz
        // MAS instruir a IA a pedir que repita de forma educada (não dizer que não entende)
        content = '(o cliente enviou uma mensagem de voz que não pôde ser transcrita - peça educadamente que ele repita ou envie por texto)';
      } else if (/^[🎤🎵]\s*[ÁáAa]udio\s+/i.test(content)) {
        // PROBLEMA CRÍTICO: A IA está gerando texto que começa com "🎤 Áudio" ou "🎵 Áudio"
        // Remover esse prefixo para evitar que a IA aprenda este padrão
        content = content.replace(/^[🎤🎵]\s*[ÁáAa]udio\s*/i, '');
      }
      
      // 🖼️ TRATAMENTO DE IMAGENS ANALISADAS
      // Se a imagem foi analisada pelo Vision, manter a descrição para a IA entender
      if (content.includes('[IMAGEM ANALISADA:')) {
        // Manter o conteúdo da análise - a IA precisa saber o que tem na imagem!
        // Apenas reformatar para ficar mais claro
        const match = content.match(/\[IMAGEM ANALISADA:\s*(.*?)\]/s);
        if (match && match[1]) {
          content = `(Cliente enviou uma imagem: ${match[1].trim()})`;
        }
      } else if (content === '📷 Imagem' || content === '🖼️ Imagem' || content === '*Imagem*') {
        // Imagem não foi analisada (fallback)
        content = '(cliente enviou uma imagem que não pôde ser analisada - pergunte educadamente sobre o que se trata)';
      }
      
      if (content === '🎥 Vídeo' || content === '🎬 Vídeo') {
        content = '(vídeo enviado)';
      }
      if (content === '📄 Documento' || content === '📎 Documento') {
        content = '(documento enviado)';
      }
      
      // 2. Limpar padrões internos de mídia enviada pelo agente
      // CRÍTICO: Remover completamente este texto para não confundir a IA
      if (content.includes('[ÁUDIO ENVIADO PELO AGENTE]')) {
        content = content.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]:[^]*/gi, '');
        content = content.replace(/\[ÁUDIO ENVIADO PELO AGENTE\]/gi, '');
      }
      // Limpar formato antigo [Áudio enviado: ...] - IA estava copiando isso na resposta
      if (content.includes('[Áudio enviado:')) {
        content = content.replace(/\[Áudio enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[Imagem enviada:')) {
        content = content.replace(/\[Imagem enviada:[^\]]*\]/gi, '');
      }
      if (content.includes('[Vídeo enviado:')) {
        content = content.replace(/\[Vídeo enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[Documento enviado:')) {
        content = content.replace(/\[Documento enviado:[^\]]*\]/gi, '');
      }
      if (content.includes('[IMAGEM ENVIADA:')) {
        content = content.replace(/\[IMAGEM ENVIADA:[^\]]*\]/gi, '');
      }
      if (content.includes('[VÍDEO ENVIADO:')) {
        content = content.replace(/\[VÍDEO ENVIADO:[^\]]*\]/gi, '');
      }
      if (content.includes('[DOCUMENTO ENVIADO:')) {
        content = content.replace(/\[DOCUMENTO ENVIADO:[^\]]*\]/gi, '');
      }
      
      // 🛡️ LIMPEZA EXTRA: Remover qualquer menção a "Áudio" ou "Audio" isolada
      content = content.replace(/\*[ÁáAa]udio\*/gi, '');
      content = content.replace(/\[[ÁáAa]udio[^\]]*\]/gi, '');
      content = content.replace(/\s+[ÁáAa]udio\s+/gi, ' ');
      
      // 3. Limpar qualquer texto vazio resultante
      content = content.trim();
      if (!content) {
        // Se após limpar ficou vazio, marcar que foi mídia (sem usar a palavra Áudio/Audio)
        if (msg.mediaType) {
          content = msg.mediaType === 'audio' ? '(mensagem de voz)' : 
                    msg.mediaType === 'image' ? '(imagem)' : 
                    msg.mediaType === 'video' ? '(vídeo)' : '(arquivo)';
        } else {
          content = '(mensagem de mídia)';
        }
      }
      
      messages.push({
        role,
        content,
      });
    }

    // ✅ SEMPRE adicionar a nova mensagem do user como última (Mistral exige que última seja user)
    console.log(`   ${uniqueMessages.length + 1}. [user] ${newMessageText.substring(0, 50)}... (NOVA MENSAGEM)`);
    
    // 🛡️ FIX: Ensure newMessageText is not empty
    let finalUserMessage = newMessageText.trim() || "[Mensagem vazia]";
    
    // 🛡️ ANTI-AMNÉSIA FORÇADO: Se é saudação repetida com histórico, FORÇAR instrução na mensagem
    const isSaudacaoSimples = /^(oi+e?|oie+|olá|ola|bom dia|boa tarde|boa noite|ei|e ai|eai|fala|tudo bem|td bem|blz|beleza|hey|hello|hi)[\s\?!\.]*$/i.test(finalUserMessage);
    const hasAgentRepliesInHistory = uniqueMessages.some(m => m.fromMe);
    
    if (isSaudacaoSimples && hasAgentRepliesInHistory && uniqueMessages.length >= 2) {
      console.log(`🛡️ [AI Agent] SAUDAÇÃO REPETIDA DETECTADA! Forçando instrução anti-repetição na mensagem.`);
      
      // Pegar a última resposta do agente para contexto
      const lastAgentMsg = [...uniqueMessages].reverse().find(m => m.fromMe);
      const lastAgentText = lastAgentMsg?.text?.substring(0, 80) || '';
      
      // Adicionar instrução JUNTO com a mensagem do usuário
      finalUserMessage = `[INSTRUÇÃO CRÍTICA PARA O ASSISTENTE: O cliente mandou "${finalUserMessage}" de novo. Esta é uma SAUDAÇÃO REPETIDA em uma conversa já iniciada. Sua última resposta foi: "${lastAgentText}...". NÃO se apresente novamente. NÃO pergunte o que ele faz de novo. Responda apenas uma saudação curta e pergunte como ajudar (no idioma da conversa).]

Mensagem do cliente: ${newMessageText.trim()}`;
    }
    
    messages.push({
      role: "user",
      content: finalUserMessage,
    });

    const mistral = await getMistralClient();
    
    // ════════════════════════════════════════════════════════════════════════════
    // 🎯 TOKENS SEM LIMITE ARTIFICIAL - Deixar a IA responder naturalmente
    // A divisão em partes menores é feita DEPOIS pelo splitMessageHumanLike
    // Isso garante que NENHUM conteúdo seja cortado - apenas dividido em blocos
    // ════════════════════════════════════════════════════════════════════════════
    
    // Perguntas curtas = respostas proporcionais, mas SEM corte forçado
    const questionLength = newMessageText.length;
    
    // Base generosa para permitir respostas completas
    // 1 token ≈ 3-4 caracteres em português
    // 2000 tokens ≈ 6000-8000 chars (mensagens bem longas)
    // 🔧 FIX: Aumentado mínimo de 600 para 1200 tokens para evitar corte de respostas sobre preços/planos
    const baseMaxTokens = questionLength < 20 ? 1200 : questionLength < 50 ? 1500 : 2000;
    
    // 🆕 Se usar sistema avançado, respeitar maxResponseLength configurado
    // Usar MAX ao invés de MIN para garantir que resposta não seja cortada
    const configMaxTokens = useAdvancedSystem && businessConfig?.maxResponseLength
      ? Math.ceil(businessConfig.maxResponseLength / 3) // aprox 3 chars por token
      : baseMaxTokens;
    
    // Usar o MAIOR valor para garantir resposta completa
    // O splitMessageHumanLike cuida da divisão em partes menores depois
    const maxTokens = Math.max(configMaxTokens, baseMaxTokens);
    
    console.log(`🎯 [AI Agent] Pergunta: ${questionLength} chars → maxTokens: ${maxTokens} (SEM LIMITE - divisão em partes é depois)`);
    
    // Determinar modelo (usar config do business ou legacy)
    const model = useAdvancedSystem && businessConfig?.model 
      ? businessConfig.model 
      : agentConfig.model;
    
    // ════════════════════════════════════════════════════════════════════════════
    // 🎯 CACHE DE RESPOSTAS: Garante que mesma pergunta = mesma resposta SEMPRE
    // O Mistral API tem variação mesmo com temperature=0, então usamos cache
    // para garantir determinismo absoluto entre Simulador e WhatsApp
    // ════════════════════════════════════════════════════════════════════════════
    
    // Gerar hash do prompt para validar cache (se prompt mudar, cache é invalidado)
    const promptHash = crypto.createHash('md5')
      .update((agentConfig?.prompt || '').substring(0, 500))
      .digest('hex')
      .substring(0, 8);
    
    // ⚠️ CACHE DESATIVADO TEMPORARIAMENTE
    // Motivo: O cache estava causando problemas porque a resposta precisa considerar
    // o contexto da conversa (histórico), não apenas a mensagem atual.
    // Uma mesma mensagem "oi" pode ter respostas diferentes dependendo do histórico.
    // TODO: Implementar cache mais inteligente que considere o contexto
    /*
    // Verificar se temos resposta cacheada para esta pergunta
    const cachedResponse = getCachedResponse(userId, newMessageText, promptHash);
    if (cachedResponse) {
      console.log(`✅ [CACHE HIT] Usando resposta cacheada para evitar variação do Mistral`);
      // Retornar resposta cacheada diretamente (pular chamada do Mistral)
      const processedCached = processResponsePlaceholders(cachedResponse, contactName, contactPhone);
      return {
        text: processedCached,
        mediaActions: [],
        notification: undefined,
      };
    }
    */
    
    // 🔄 CHAMADA COM RETRY AUTOMÁTICO PARA ERROS DE API (rate limit, timeout, etc)
    // 🎯 TEMPERATURE 0.0 + SEED FIXO: Respostas 100% DETERMINÍSTICAS
    // REMOVIDA VARIAÇÃO: Usuário solicitou remover variação do simulador e WhatsApp debug
    // randomSeed: Garante que mesma pergunta = mesma resposta SEMPRE
    console.log(`🔧 [AI-CONFIG] DETERMINISM: temperature=0.0, randomSeed=42, model=${model}`);
    const chatResponse = await withRetry(
      async () => {
        return await mistral.chat.complete({
          model,
          messages: messages as any,
          maxTokens, // Dinâmico baseado na pergunta e config
          temperature: 0.0, // ZERO: Resposta determinística
          randomSeed: 42, // SEED FIXO: Garante determinismo absoluto
        });
      },
      3, // 3 tentativas
      1500, // Delay inicial de 1.5s
      `Mistral API (${model})`
    );

    const content = chatResponse.choices?.[0]?.message?.content;
    let responseText = typeof content === 'string' ? content : null;
    let notification: { shouldNotify: boolean; reason: string; } | undefined;
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🧠 FILOSOFIA: DEIXAR A IA PROCESSAR NATURALMENTE
    // A IA lê o prompt do cliente e gera a resposta seguindo as instruções.
    // NÃO FAZEMOS tratamento especial - a IA é inteligente o suficiente.
    // ═══════════════════════════════════════════════════════════════════════
    
    if (responseText) {
      // 🚫 FIX: Detectar e remover duplicação na resposta do Mistral
      // As vezes a API retorna texto 2x separado por \n\n
      const paragraphs = responseText.split('\n\n');
      const halfLength = Math.floor(paragraphs.length / 2);
      
      if (paragraphs.length > 2 && paragraphs.length % 2 === 0) {
        const firstHalf = paragraphs.slice(0, halfLength).join('\n\n');
        const secondHalf = paragraphs.slice(halfLength).join('\n\n');
        
        if (firstHalf === secondHalf) {
          console.log(`⚠️ [AI Agent] Resposta duplicada detectada do Mistral, usando apenas primeira metade`);
          console.log(`   Original length: ${responseText.length} chars`);
          responseText = firstHalf;
          console.log(`   Fixed length: ${responseText.length} chars`);
        }
      }
      
      // 📝 FIX: Converter formatação Markdown para WhatsApp
      // WhatsApp: *negrito* _itálico_ ~tachado~ ```mono```
      // Markdown:  **negrito** *itálico* ~~tachado~~ `mono`
      responseText = convertMarkdownToWhatsApp(responseText);

      // 🔔 NOTIFICATION SYSTEM: Check for [NOTIFY: ...] tag
      console.log(`🔔 [AI Agent] Checking for NOTIFY tag in response...`);
      console.log(`   Response snippet (last 100 chars): "${responseText.slice(-100)}"`);
      
      const notifyMatch = responseText.match(/\[NOTIFY: (.*?)\]/);
      if (notifyMatch) {
        notification = {
          shouldNotify: true,
          reason: notifyMatch[1].trim()
        };
        // Remove tag from response
        responseText = responseText.replace(/\[NOTIFY: .*?\]/g, '').trim();
        console.log(`🔔 [AI Agent] ✅ Notification trigger detected: ${notification.reason}`);
      } else {
        console.log(`🔔 [AI Agent] ❌ No NOTIFY tag found in response`);
      }
      
      // 🛡️ SEGURANÇA: Remover qualquer vazamento de texto de notificação que a IA possa ter gerado
      // Isso evita que a IA "invente" notificações no formato errado
      if (responseText.includes('🔔 NOTIFICAÇÃO') || responseText.includes('NOTIFICAÇÃO DO AGENTE')) {
        console.log(`⚠️ [AI Agent] Detectado vazamento de template de notificação! Limpando...`);
        // Remover bloco de notificação que pode ter vazado
        responseText = responseText.replace(/🔔\s*\*?NOTIFICAÇÃO[^]*?(Cliente:|Última mensagem:)[^"]*"[^"]*"/gi, '').trim();
        responseText = responseText.replace(/🔔[^]*?Motivo:[^\n]*/gi, '').trim();
      }
      
      // �️ FIX: Remover "[Mensagem vazia]" que pode aparecer quando histórico tinha mídia sem texto
      if (responseText.includes('[Mensagem vazia]')) {
        responseText = responseText.replace(/\[Mensagem vazia\]\s*/g, '').trim();
        console.log(`⚠️ [AI Agent] Removido "[Mensagem vazia]" da resposta`);
      }
      
      // �🚨 POST-PROCESSING: Detectar e limpar possíveis vazamentos de instruções do prompt
      // CUIDADO: Não truncar agressivamente - apenas limpar padrões específicos problemáticos
      
      // 🆕 FIX: Remover instruções técnicas que vazam na resposta da IA
      // Padrões como "Use exatamente o texto abaixo..." são instruções, não respostas
      responseText = cleanInstructionLeaks(responseText);
      
      // 1. Detectar se tem texto que parece ser do prompt (padrões de instrução)
      // 🔧 FIX 2025-01: DESABILITADA lógica agressiva de prompt leak
      // Essa lógica estava cortando respostas legítimas sobre preços/planos
      // Ex: "1. R$49,99/mês por número (total de R$199,96/mês) 2." era cortada incorretamente
      // A função cleanInstructionLeaks já faz a limpeza necessária sem cortar conteúdo válido
      const hasPromptLeak = false; // Desabilitado - era muito agressivo
      
      if (hasPromptLeak) {
        console.log(`⚠️ [AI Agent] Detectado vazamento de prompt! Limpando...`);
        const originalLength = responseText.length;
        
        // Tentar cortar no primeiro ponto final após conteúdo válido
        const sentences = responseText.split(/\.\s+/);
        let cleanedResponse = '';
        
        for (const sentence of sentences) {
          // Parar se encontrar texto que parece instrução
          if (sentence.includes('online/cadastro') ||
              sentence.includes('Depois de logado') ||
              sentence.includes('clica em Ilimitado') ||
              sentence.includes('no menu do lado esquerdo')) {
            break;
          }
          cleanedResponse += sentence + '. ';
        }
        
        // Se conseguiu extrair algo válido, usar
        if (cleanedResponse.trim().length > 50) {
          responseText = cleanedResponse.trim();
          console.log(`✂️ [AI Agent] Resposta limpa de ${originalLength} para ${responseText.length} chars`);
        }
      }
      
      // 🛡️ VALIDAÇÃO DE RESPOSTA (apenas no sistema avançado)
      if (useAdvancedSystem && businessConfig) {
        const validation = validateAgentResponse(responseText, businessConfig);
        
        if (!validation.isValid) {
          console.log(`⚠️ [AI Agent] Response validation FAILED:`);
          console.log(`   Maintains identity: ${validation.maintainsIdentity}`);
          console.log(`   Stays in scope: ${validation.staysInScope}`);
          console.log(`   Issues: ${validation.issues.join(', ')}`);
          
          // Se violou identidade, rejeitar resposta e retornar fallback
          if (!validation.maintainsIdentity) {
            console.log(`🚨 [AI Agent] CRITICAL: Response breaks identity! Using fallback.`);
            return {
              text: `Desculpe, tive um problema ao processar sua mensagem. Sou ${businessConfig.agentName} da ${businessConfig.companyName}. Como posso te ajudar com ${businessConfig.allowedTopics?.[0] || "nossos serviços"}?`,
              mediaActions: [],
            };
          }
          
          // Se saiu do escopo mas mantém identidade, apenas logar
          if (!validation.staysInScope) {
            console.log(`⚠️ [AI Agent] WARNING: Response may be out of scope. Proceeding anyway.`);
          }
        } else {
          console.log(`✅ [AI Agent] Response validation PASSED`);
        }
        
        // ⚠️ HUMANIZAÇÃO REMOVIDA - Estava corrompendo respostas do agente
        // A IA já gera respostas naturais no prompt, não precisa de pós-processamento
        // que adiciona saudações/emojis indesejados
        // 
        // Código removido:
        // - detectEmotion() / adjustToneForEmotion()
        // - humanizeResponse() com saudações/conectores/emojis
        //
        // A resposta da Mistral agora é usada EXATAMENTE como gerada
        console.log(`✅ [AI Agent] Usando resposta original da IA (sem humanização extra)`);
      }
      
      console.log(`✅ [AI Agent] Resposta gerada: ${responseText.substring(0, 100)}...`);
    }
    
    // 🍕 PROCESSAR TAG DE CARDÁPIO: [ENVIAR_CARDAPIO_COMPLETO]
    if (responseText && responseText.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
      console.log(`🍕 [AI Agent] Tag [ENVIAR_CARDAPIO_COMPLETO] detectada! Buscando cardápio para userId=${userId}...`);
      
      const deliveryMenu = await getDeliveryMenuForAI(userId);
      console.log(`🍕 [AI Agent] DEBUG getDeliveryMenuForAI retornou: ${deliveryMenu ? `active=${deliveryMenu.active}, items=${deliveryMenu.total_items}` : 'NULL'}`);
      
      if (deliveryMenu && deliveryMenu.active) {
        console.log(`🍕 [AI Agent] Cardápio obtido: ${deliveryMenu.total_items} itens, ${deliveryMenu.categories.length} categorias`);
        deliveryMenu.categories.forEach(cat => {
          console.log(`   - ${cat.name}: ${cat.items.length} itens`);
        });
        
        const formattedMenu = formatMenuForCustomer(deliveryMenu);
        console.log(`🍕 [AI Agent] DEBUG formattedMenu length=${formattedMenu.length}`);
        
        // Substituir a tag pelo cardápio formatado
        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, formattedMenu);
        console.log(`🍕 [AI Agent] ✅ Cardápio formatado inserido (${formattedMenu.length} chars)`);
        console.log(`🍕 [AI Agent] Preview: ${formattedMenu.substring(0, 200)}...`);
      } else {
        // Se não tem cardápio ativo, remover a tag e deixar a mensagem da IA
        responseText = responseText.replace(/\[ENVIAR_CARDAPIO_COMPLETO\]/g, '');
        console.log(`⚠️ [AI Agent] Cardápio não disponível - tag removida. deliveryMenu=${JSON.stringify(deliveryMenu)?.substring(0, 200)}`);
      }
    } else {
      console.log(`⚠️ [AI Agent] TAG NÃO DETECTADA! Response: ${responseText?.substring(0, 300)}`);
      
      // 🛡️ FALLBACK: Se a pergunta do cliente pediu cardápio/menu mas a IA não usou a tag,
      // verificar se devemos injetar o cardápio mesmo assim
      const perguntaPediuCardapio = /cardápio|cardapio|menu|o que tem|oque tem|quais produto|quais os produto|me manda o menu|mostra o menu|ver o cardápio|ver cardápio/i.test(newMessageText || '');
      const respostaTemPrecos = /R\$\s*\d+|reais|\d+,\d{2}/i.test(responseText || '');
      
      if (perguntaPediuCardapio && respostaTemPrecos) {
        console.log(`🛡️ [AI Agent] FALLBACK: Cliente pediu cardápio mas IA listou preços manualmente! Substituindo...`);
        const deliveryMenu = await getDeliveryMenuForAI(userId);
        if (deliveryMenu && deliveryMenu.active && deliveryMenu.total_items > 0) {
          const formattedMenu = formatMenuForCustomer(deliveryMenu);
          // Substituir a resposta inteira pelo cardápio formatado + mensagem amigável
          responseText = `${formattedMenu}\n\nAqui está nosso cardápio completo! 😊 Quer fazer um pedido?`;
          console.log(`🛡️ [AI Agent] ✅ FALLBACK aplicado - cardápio completo injetado (${formattedMenu.length} chars)`);
        }
      }
    }
    
    // 📁 PROCESSAR TAG DE CATEGORIA: [ENVIAR_CATEGORIA: nome_categoria]
    // Esta tag permite enviar apenas uma categoria específica do cardápio
    const categoryTagRegex = /\[ENVIAR_CATEGORIA:\s*([^\]]+)\]/gi;
    let categoryMatch;
    while ((categoryMatch = categoryTagRegex.exec(responseText || '')) !== null) {
      const [fullTag, categoryName] = categoryMatch;
      console.log(`📁 [AI Agent] Tag [ENVIAR_CATEGORIA: ${categoryName}] detectada!`);
      
      const deliveryMenu = await getDeliveryMenuForAI(userId);
      if (deliveryMenu && deliveryMenu.active) {
        // Encontrar a categoria pelo nome (busca parcial, case-insensitive)
        const normalizedSearch = categoryName.toLowerCase().trim();
        const matchingCategory = deliveryMenu.categories.find(cat => 
          cat.name.toLowerCase().includes(normalizedSearch) ||
          normalizedSearch.includes(cat.name.toLowerCase().replace(/[🍕🍫🥟🍹🧀]/g, '').trim())
        );
        
        if (matchingCategory && matchingCategory.items.length > 0) {
          console.log(`📁 [AI Agent] Categoria encontrada: ${matchingCategory.name} com ${matchingCategory.items.length} itens`);
          
          // Formatar apenas essa categoria
          const formatPrice = (price: string | null): string => {
            if (!price) return 'Consultar';
            const num = parseFloat(price);
            if (isNaN(num)) return price;
            return `R$ ${num.toFixed(2).replace('.', ',')}`;
          };
          
          let categoryText = `*${matchingCategory.name}*\n`;
          for (const item of matchingCategory.items) {
            const priceText = item.promotional_price 
              ? `~${formatPrice(item.price)}~ *${formatPrice(item.promotional_price)}*`
              : formatPrice(item.price);
            categoryText += `• ${item.name} - ${priceText}\n`;
            if (item.description) {
              categoryText += `  _${item.description}_\n`;
            }
          }
          
          responseText = responseText!.replace(fullTag, categoryText);
          console.log(`📁 [AI Agent] ✅ Categoria "${matchingCategory.name}" inserida (${categoryText.length} chars)`);
        } else {
          console.log(`⚠️ [AI Agent] Categoria "${categoryName}" não encontrada`);
          responseText = responseText!.replace(fullTag, `(Categoria "${categoryName}" não encontrada)`);
        }
      } else {
        responseText = responseText!.replace(fullTag, '');
      }
    }
    
    // 📁 PROCESSAR MÍDIAS: Detectar tags [ENVIAR_MIDIA:NOME] na resposta
    let mediaActions: MistralResponse['actions'] = [];
    
    if (hasMedia && responseText) {
      const parsedResponse = parseMistralResponse(responseText);
      
      if (parsedResponse) {
        // Extrair ações de mídia detectadas pelas tags
        mediaActions = parsedResponse.actions || [];
        
        // Usar o texto limpo (sem as tags de mídia)
        if (parsedResponse.messages && parsedResponse.messages.length > 0) {
          responseText = parsedResponse.messages.map(m => m.content).join('\n\n');
          // Limpar espaços HORIZONTAIS extras que podem sobrar (preservar quebras de linha!)
          responseText = responseText.replace(/[ \t]+/g, ' ').trim();
        }
        
        if (mediaActions.length > 0) {
          console.log(`📁 [AI Agent] Tags de mídia detectadas: ${mediaActions.map(a => a.media_name).join(', ')}`);
          
          // 🛡️ FILTRAR MÍDIAS JÁ ENVIADAS (nunca repetir)
          const originalCount = mediaActions.length;
          mediaActions = mediaActions.filter(action => {
            const mediaName = action.media_name?.toUpperCase();
            const alreadySent = sentMedias.some(sent => sent.toUpperCase() === mediaName);
            if (alreadySent) {
              console.log(`⚠️ [AI Agent] Mídia ${mediaName} já foi enviada - REMOVIDA para eviar duplicação`);
            }
            return !alreadySent;
          });
          
          if (mediaActions.length < originalCount) {
            console.log(`📁 [AI Agent] ${originalCount - mediaActions.length} mídia(s) removida(s) por já terem sido enviadas`);
          }
        }
      }
    }
    
    // 🚨🚨🚨 FORÇAR ENVIO DE MÍDIA - SISTEMA AUTOMÁTICO COM IA 🚨🚨🚨
    // Se a IA NÃO incluiu tag de mídia na resposta, mas deveria ter,
    // este sistema usa uma SEGUNDA CHAMADA DE IA para decidir qual mídia enviar.
    // FUNCIONA PARA TODOS OS AGENTES - INDEPENDENTE DO PROMPT!
    // A IA analisa: mensagem, histórico, biblioteca e campo whenToUse.
    if (hasMedia && mediaActions.length === 0) {
      console.log(`\n🚨 [AI Agent] IA principal não detectou mídia - CONSULTANDO IA DE CLASSIFICAÇÃO...`);
      
      const forceResult = await forceMediaDetection(
        newMessageText,
        conversationHistory,
        mediaLibrary,
        sentMedias
      );
      
      if (forceResult.shouldSendMedia && forceResult.mediaToSend) {
        console.log(`🚨 [AI Agent] 🎯 IA DECIDIU ENVIAR MÍDIA: ${forceResult.mediaToSend.name}`);
        console.log(`🚨 [AI Agent] 💡 Razão: ${forceResult.reason}`);
        
        // Adicionar a mídia forçada às ações
        mediaActions.push({
          type: 'send_media',
          media_name: forceResult.mediaToSend.name,
        });
        
        console.log(`🚨 [AI Agent] ✅ Mídia ${forceResult.mediaToSend.name} ADICIONADA às ações!`);
      } else {
        console.log(`🚨 [AI Agent] ❌ IA de classificação decidiu NÃO enviar mídia`);
        console.log(`🚨 [AI Agent] 💡 Razão: ${forceResult.reason}`);
      }
    }
    
    // 🔄 PROCESSAR PLACEHOLDERS NA RESPOSTA FINAL ({{nome}}, saudações)
    if (responseText) {
      responseText = processResponsePlaceholders(responseText, contactName);
      console.log(`🔄 [AI Agent] Placeholders processados na resposta`);
    }
    
    // 📅 PROCESSAR TAGS DE AGENDAMENTO [AGENDAR: DATA=..., HORA=..., NOME=...]
    let appointmentCreated: any = undefined;
    if (responseText && options?.contactPhone) {
      try {
        const schedulingResult = await processSchedulingTags(responseText, userId, options.contactPhone);
        responseText = schedulingResult.text;
        if (schedulingResult.appointmentCreated) {
          appointmentCreated = schedulingResult.appointmentCreated;
          console.log(`📅 [AI Agent] Appointment created: ${appointmentCreated.id} for ${appointmentCreated.client_name}`);
        }
      } catch (schedError) {
        console.error(`📅 [AI Agent] Error processing scheduling tags:`, schedError);
      }
    }

    // 🍕 PROCESSAR TAGS DE PEDIDO DE DELIVERY [PEDIDO_DELIVERY: ...]
    let deliveryOrderCreated: any = undefined;
    if (responseText && options?.contactPhone) {
      try {
        const deliveryResult = await processDeliveryOrderTags(
          responseText, 
          userId, 
          options.contactPhone,
          options.conversationId
        );
        responseText = deliveryResult.text;
        if (deliveryResult.orderCreated) {
          deliveryOrderCreated = deliveryResult.orderCreated;
          console.log(`🍕 [AI Agent] Delivery order created: #${deliveryOrderCreated.id} for ${deliveryOrderCreated.customer_name}`);
        }
      } catch (deliveryError) {
        console.error(`🍕 [AI Agent] Error processing delivery order tags:`, deliveryError);
      }
    }
    
    // 🔄 VERIFICAÇÃO ANTI-LOOP - Não enviar mesma resposta repetidamente
    if (responseText) {
      const conversationKey = `${userId}:${options?.contactPhone || options?.contactName || 'unknown'}`;
      if (isDuplicateResponse(conversationKey, responseText)) {
        console.log(`🔄 [AI Agent] Resposta duplicada detectada - BLOQUEANDO para evitar loop`);
        console.log(`   Resposta: ${responseText.substring(0, 80)}...`);
        return null;
      }
    }

    // 🍕 VALIDAÇÃO CRÍTICA DE PREÇOS - Impede IA de inventar preços de delivery
    // Esta validação ocorre em TODAS as respostas quando o delivery está ativo
    if (responseText) {
      try {
        const deliveryData = await getDeliveryData(userId);
        if (deliveryData && deliveryData.totalItems > 0) {
          // Verificar se a resposta contém preços (R$ XX,XX)
          const hasPrice = /R\$\s*\d+[.,]\d{2}/i.test(responseText);

          if (hasPrice) {
            console.log(`🍕 [AI Agent] Resposta contém preços - validando contra cardápio...`);

            const validation = validatePriceInResponse(responseText, deliveryData);

            if (!validation.valid) {
              console.log(`⚠️ [AI Agent] PREÇOS INCORRETOS DETECTADOS E CORRIGIDOS:`);
              validation.errors.forEach(err => console.log(`   - ${err}`));
              responseText = validation.corrected;
              console.log(`✅ [AI Agent] Resposta corrigida aplicada`);
            } else {
              console.log(`✅ [AI Agent] Preços validados - todos corretos`);
            }
          }
        }
      } catch (priceValidationError) {
        console.error(`⚠️ [AI Agent] Erro na validação de preços (continuando):`, priceValidationError);
      }
    }

    return {
      text: responseText,
      mediaActions,
      notification,
      appointmentCreated,
      deliveryOrderCreated,
    };
  } catch (error: any) {
    console.error("Error generating AI response:", error);
    
    // 🔍 DEBUG: Tentar extrair detalhes do erro da API
    if (error?.body && typeof error.body.pipe === 'function') {
      console.error("⚠️ [AI Agent] API Error Body is a stream, cannot read directly.");
    } else if (error?.response) {
      try {
        const errorBody = await error.response.text();
        console.error(`⚠️ [AI Agent] API Error Details: ${errorBody}`);
      } catch (e) {
        console.error("⚠️ [AI Agent] Could not read API error body");
      }
    } else if (error?.message) {
      console.error(`⚠️ [AI Agent] Error message: ${error.message}`);
    }
    
    return null;
  }
}

/**
 * 🧪 SIMULADOR UNIFICADO - USA EXATAMENTE O MESMO FLUXO DO WHATSAPP
 * 
 * Esta função agora chama generateAIResponse internamente para garantir
 * que o simulador se comporta IDENTICAMENTE ao agente real.
 * 
 * Diferenças controladas:
 * - conversationHistory: vem do parâmetro (simulador mantém em memória)
 * - contactName: configurável (default "Visitante")
 * - sentMedias: rastreado pelo simulador
 * - appointmentCreated: retorna agendamento criado (se houver)
 */
export async function testAgentResponse(
  userId: string,
  testMessage: string,
  customPrompt?: string,
  conversationHistory?: Message[],
  sentMedias?: string[],
  contactName: string = "Visitante"
): Promise<{ text: string | null; mediaActions: MistralResponse['actions']; appointmentCreated?: any; deliveryOrderCreated?: any }> {
  try {
    console.log(`\n🧪 ═══════════════════════════════════════════════════════════════`);
    console.log(`🧪 [SIMULADOR] Nome do contato: ${contactName}`);
    console.log(`🧪 ═══════════════════════════════════════════════════════════════`);
    
    const agentConfig = await storage.getAgentConfig(userId);

    if (!agentConfig) {
      throw new Error("Agent not configured");
    }
    
    // Preparar histórico de conversação (converter formato simples para Message[])
    const history: Message[] = conversationHistory || [];
    
    console.log(`🧪 [SIMULADOR] Histórico: ${history.length} mensagens`);
    console.log(`🧪 [SIMULADOR] Mídias já enviadas: ${sentMedias?.length || 0}`);
    
    // 🚀 VERIFICAR SE DEVE USAR FLOW ENGINE (Sistema Híbrido)
    // Se customPrompt foi fornecido, NÃO usar FlowEngine (teste de prompt não salvo)
    const useFlowEngine = !customPrompt && await shouldUseFlowEngine(userId);
    
    if (useFlowEngine) {
      console.log(`🧪 [SIMULADOR] 🚀 Usando FLOW ENGINE (Sistema Híbrido)`);
      console.log(`🧪 [SIMULADOR] IA → Interpreta intenção`);
      console.log(`🧪 [SIMULADOR] Sistema → Executa ação (determinístico)`);
      console.log(`🧪 [SIMULADOR] IA → Humaniza resposta`);
      
      // Buscar API key
      const apiKeyResult = await getMistralClient(userId);
      if (!apiKeyResult) {
        throw new Error("API key not configured");
      }
      
      // Gerar ID de conversa simulada (persistente por sessão do simulador)
      // Usa hash do userId + data para manter estado durante uma sessão de teste
      const today = new Date().toISOString().split('T')[0];
      const simulatorConversationId = `simulator-${userId}-${today}`;
      
      const flowResult = await processWithFlowEngine(
        userId,
        simulatorConversationId,
        testMessage,
        apiKeyResult.apiKey,
        {
          contactName,
          history: history.map(m => ({ fromMe: m.fromMe, text: m.text || '' }))
        }
      );
      
      if (flowResult) {
        console.log(`🧪 [SIMULADOR] ✅ FlowEngine respondeu: "${flowResult.text?.substring(0, 80)}..."`);
        console.log(`🧪 ═══════════════════════════════════════════════════════════════\n`);
        
        return {
          text: flowResult.text,
          mediaActions: flowResult.mediaActions || [],
          appointmentCreated: undefined,
          deliveryOrderCreated: undefined
        };
      }
      
      console.log(`🧪 [SIMULADOR] ⚠️ FlowEngine sem resposta, fallback para sistema legado`);
    } else {
      console.log(`🧪 [SIMULADOR] 📋 Usando sistema LEGADO (IA livre)`);
      if (customPrompt) {
        console.log(`🧪 [SIMULADOR] 📝 customPrompt fornecido - testando prompt não salvo`);
      }
    }
    
    // 🎯 FALLBACK: CHAMAR generateAIResponse - SISTEMA LEGADO
    // Isso é usado quando:
    // - Não há FlowDefinition para o usuário
    // - customPrompt foi fornecido (teste de prompt não salvo)
    // - FlowEngine não conseguiu processar a mensagem
    
    const result = await generateAIResponse(
      userId,
      history,
      testMessage,
      {
        contactName,
        contactPhone: "5511999999999",
        sentMedias: sentMedias || [],
      },
      customPrompt ? {
        getAgentConfig: async () => ({
          ...agentConfig,
          prompt: customPrompt,
        }),
      } : undefined
    );
    
    if (!result) {
      console.log(`🧪 [SIMULADOR] ⚠️ Sem resposta do generateAIResponse`);
      return { text: null, mediaActions: [], appointmentCreated: undefined, deliveryOrderCreated: undefined };
    }
    
    console.log(`🧪 [SIMULADOR] ✅ Resposta gerada: ${result.text?.substring(0, 80)}...`);
    console.log(`🧪 [SIMULADOR] 📁 Mídias na resposta: ${result.mediaActions?.length || 0}`);
    if (result.appointmentCreated) {
      console.log(`🧪 [SIMULADOR] 📅 Agendamento criado: ${result.appointmentCreated.id}`);
    }
    if (result.deliveryOrderCreated) {
      console.log(`🧪 [SIMULADOR] 🍕 Pedido de delivery criado: #${result.deliveryOrderCreated.id}`);
    }
    console.log(`🧪 ═══════════════════════════════════════════════════════════════\n`);
    
    return { 
      text: result.text, 
      mediaActions: result.mediaActions || [],
      appointmentCreated: result.appointmentCreated,
      deliveryOrderCreated: result.deliveryOrderCreated
    };
  } catch (error) {
    console.error("🧪 [SIMULADOR] Error:", error);
    throw error;
  }
}


