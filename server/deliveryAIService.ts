/**
 * ═══════════════════════════════════════════════════════════════════════════════
 * 🍕 DELIVERY AI SERVICE - SISTEMA SIMPLIFICADO E DETERMINÍSTICO
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * ARQUITETURA NOVA (2025):
 * 1. Sistema detecta intenção do cliente ANTES de chamar a IA
 * 2. Dados do cardápio são injetados AUTOMATICAMENTE pelo sistema
 * 3. IA recebe APENAS o contexto necessário (não prompt gigante)
 * 4. Validação de preços/produtos contra banco de dados
 * 5. Retorno estruturado em JSON com "bolhas" de mensagem
 * 
 * PROBLEMAS RESOLVIDOS:
 * - IA ignorando instruções de tag [ENVIAR_CARDAPIO_COMPLETO]
 * - IA inventando preços/produtos
 * - Cardápio incompleto (3 itens vs 36)
 * - Respostas inconsistentes
 */

import { supabase } from "./supabaseAuth";
import { getMistralClient } from "./mistralClient";

// ═══════════════════════════════════════════════════════════════════════
// 📦 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_name: string;
  is_highlight: boolean;
  is_available: boolean;
}

export interface DeliveryConfig {
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

export interface MenuCategory {
  name: string;
  items: MenuItem[];
}

export interface DeliveryData {
  config: DeliveryConfig;
  categories: MenuCategory[];
  totalItems: number;
}

// Tipos de intenção do cliente
export type CustomerIntent = 
  | 'GREETING'              // Oi, olá, etc
  | 'WANT_MENU'             // Quer ver cardápio
  | 'ASK_ABOUT_ITEM'        // Pergunta sobre item específico
  | 'WANT_TO_ORDER'         // Quer fazer pedido
  | 'ADD_ITEM'              // Adicionar item ao pedido
  | 'REMOVE_ITEM'           // Remover item
  | 'CONFIRM_ORDER'         // Confirmar pedido
  | 'CANCEL_ORDER'          // Cancelar pedido
  | 'ASK_DELIVERY_INFO'     // Perguntas sobre entrega/pagamento
  | 'ASK_BUSINESS_HOURS'    // Horário de funcionamento
  | 'COMPLAINT'             // Reclamação
  | 'OTHER';                // Outros assuntos

// ═══════════════════════════════════════════════════════════════════════
// 🛒 SISTEMA DE CARRINHO (EM MEMÓRIA)
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
  createdAt: Date;
  lastUpdated: Date;
}

// Armazena carrinhos por chave: "userId:customerPhone"
const cartsCache = new Map<string, CustomerCart>();

// Limpar carrinhos antigos (mais de 2 horas)
const CART_EXPIRY_MS = 2 * 60 * 60 * 1000;

function cleanOldCarts(): void {
  const now = Date.now();
  for (const [key, cart] of cartsCache.entries()) {
    if (now - cart.lastUpdated.getTime() > CART_EXPIRY_MS) {
      cartsCache.delete(key);
      console.log(`🛒 [Cart] Carrinho expirado removido: ${key}`);
    }
  }
}

// Limpar a cada 30 minutos
setInterval(cleanOldCarts, 30 * 60 * 1000);

export function getCart(userId: string, customerPhone: string): CustomerCart {
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
      createdAt: new Date(),
      lastUpdated: new Date(),
    };
    cartsCache.set(key, cart);
    console.log(`🛒 [Cart] Novo carrinho criado: ${key}`);
  }
  
  return cart;
}

export function addToCart(
  userId: string, 
  customerPhone: string, 
  item: MenuItem, 
  quantity: number = 1,
  notes?: string
): CustomerCart {
  const cart = getCart(userId, customerPhone);
  
  const existing = cart.items.get(item.id);
  if (existing) {
    existing.quantity += quantity;
    if (notes) existing.notes = notes;
    console.log(`🛒 [Cart] Item atualizado: ${item.name} x${existing.quantity}`);
  } else {
    cart.items.set(item.id, {
      itemId: item.id,
      name: item.name,
      price: item.price,
      quantity,
      notes,
    });
    console.log(`🛒 [Cart] Item adicionado: ${item.name} x${quantity}`);
  }
  
  cart.lastUpdated = new Date();
  return cart;
}

export function removeFromCart(userId: string, customerPhone: string, itemId: string): boolean {
  const cart = getCart(userId, customerPhone);
  const removed = cart.items.delete(itemId);
  cart.lastUpdated = new Date();
  return removed;
}

export function clearCart(userId: string, customerPhone: string): void {
  const key = `${userId}:${customerPhone}`;
  cartsCache.delete(key);
  console.log(`🛒 [Cart] Carrinho limpo: ${key}`);
}

export function getCartSubtotal(cart: CustomerCart): number {
  let total = 0;
  for (const item of cart.items.values()) {
    total += item.price * item.quantity;
  }
  return Math.round(total * 100) / 100;
}

export function getCartTotal(cart: CustomerCart, deliveryFee: number): number {
  const subtotal = getCartSubtotal(cart);
  const fee = cart.deliveryType === 'delivery' ? deliveryFee : 0;
  return Math.round((subtotal + fee) * 100) / 100;
}

export function formatCartSummary(cart: CustomerCart, deliveryFee: number): string {
  if (cart.items.size === 0) {
    return 'Seu carrinho está vazio. 🛒\n\nMe diga o que deseja pedir!';
  }
  
  let text = `🛒 *SEU PEDIDO*\n`;
  text += `───────────────\n`;
  
  for (const item of cart.items.values()) {
    const itemTotal = item.price * item.quantity;
    text += `${item.quantity}x ${item.name} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
    if (item.notes) {
      text += `   _Obs: ${item.notes}_\n`;
    }
  }
  
  const subtotal = getCartSubtotal(cart);
  text += `───────────────\n`;
  text += `📦 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}\n`;
  
  if (cart.deliveryType === 'delivery') {
    text += `🛵 Taxa entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}\n`;
    text += `💰 *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*\n`;
  } else if (cart.deliveryType === 'pickup') {
    text += `🏪 Retirada: GRÁTIS\n`;
    text += `💰 *Total: R$ ${subtotal.toFixed(2).replace('.', ',')}*\n`;
  }
  
  return text;
}

// Estrutura de resposta com bolhas
export interface DeliveryAIResponse {
  intent: CustomerIntent;
  bubbles: string[];           // Mensagens separadas para envio
  orderData?: {                // Dados do pedido se houver
    items: Array<{
      name: string;
      quantity: number;
      price: number;
      notes?: string;
    }>;
    subtotal: number;
    deliveryFee: number;
    total: number;
    status: 'BUILDING' | 'CONFIRMED' | 'CANCELLED';
  };
  requiresInput?: string;      // O que o sistema precisa perguntar
  metadata?: {
    itemMentioned?: string;    // Item mencionado pelo cliente
    priceAsked?: number;       // Preço perguntado
    validatedPrice?: number;   // Preço validado do banco
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 DETECÇÃO DE INTENÇÃO (PRÉ-IA)
// ═══════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS: Record<CustomerIntent, RegExp[]> = {
  GREETING: [
    /^(oi+e?|olá|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)$/i,
    /^(oi+e?|olá|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)\s*[!?.,]*$/i,
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
    /tem (.+)\?/i,
    /como [eé] (a|o) (.+)\?/i,
    /o que vem n(a|o) (.+)/i,
  ],
  WANT_TO_ORDER: [
    /quero (pedir|fazer.*pedido|encomendar)/i,
    /vou (querer|pedir)/i,
    /pode (anotar|fazer|preparar)/i,
    /faz (a[ií]|para mim)/i,
    /manda (pra|para) mim/i,
    /me (vê|ve|da|dá) (um|uma|[0-9]+)/i,
  ],
  ADD_ITEM: [
    /adiciona|coloca|p[oõ]e|bota/i,
    /mais (um|uma|[0-9]+)/i,
    /tamb[eé]m quero/i,
  ],
  REMOVE_ITEM: [
    /tira|remove|retira/i,
    /n[aã]o quero mais/i,
    /cancela (o|a) (.+)/i,
  ],
  CONFIRM_ORDER: [
    /^(isso|fechado|pode fechar|confirma|confirmado|[eé] isso|t[aá] certo|perfeito|ok|sim)/i,
    /pode (mandar|enviar|preparar)/i,
    /fecha o pedido/i,
  ],
  CANCEL_ORDER: [
    /cancela (tudo|o pedido)/i,
    /desisto/i,
    /n[aã]o quero mais/i,
    /esquece/i,
  ],
  ASK_DELIVERY_INFO: [
    /entrega/i,
    /taxa/i,
    /frete/i,
    /tempo.*demora/i,
    /demora quanto/i,
    /aceita (pix|cart[aã]o|dinheiro)/i,
    /forma.*pagamento/i,
    /paga como/i,
  ],
  ASK_BUSINESS_HOURS: [
    /hor[aá]rio/i,
    /abre.*fecha/i,
    /funciona (at[eé]|que horas)/i,
    /aberto/i,
    /fechado/i,
  ],
  COMPLAINT: [
    /reclama/i,
    /problema/i,
    /errado/i,
    /demor/i,
    /p[eé]ssimo/i,
    /ruim/i,
  ],
  OTHER: [], // Fallback
};

export function detectCustomerIntent(message: string): CustomerIntent {
  const normalizedMsg = message.toLowerCase().trim();
  
  // Verificar cada padrão em ordem de prioridade
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    for (const pattern of patterns) {
      if (pattern.test(normalizedMsg)) {
        console.log(`🎯 [DeliveryAI] Intent detected: ${intent} (pattern: ${pattern})`);
        return intent as CustomerIntent;
      }
    }
  }
  
  return 'OTHER';
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 BUSCAR DADOS DO DELIVERY (BANCO DE DADOS)
// ═══════════════════════════════════════════════════════════════════════

export async function getDeliveryData(userId: string): Promise<DeliveryData | null> {
  try {
    // 1. Buscar configuração do delivery
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (configError || !config || !config.is_active) {
      console.log(`🍕 [DeliveryAI] Delivery não ativo para user ${userId}`);
      return null;
    }
    
    // 2. Buscar categorias
    const { data: categories } = await supabase
      .from('menu_categories')
      .select('id, name, display_order')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    
    // 3. Buscar itens do menu
    const { data: items } = await supabase
      .from('menu_items')
      .select('id, name, description, price, category_id, is_featured, is_available')
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('display_order', { ascending: true });
    
    if (!items || items.length === 0) {
      console.log(`🍕 [DeliveryAI] Nenhum item encontrado para user ${userId}`);
      return null;
    }
    
    // 4. Organizar por categoria
    const categoryMap = new Map<string, { name: string; items: MenuItem[] }>();
    
    // Criar map de category_id -> name
    const categoryIdToName = new Map<string, string>();
    categories?.forEach(cat => categoryIdToName.set(cat.id, cat.name));
    
    // Agrupar itens por categoria
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
        is_highlight: item.is_featured || false,
        is_available: item.is_available,
      });
    });
    
    const result: DeliveryData = {
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
    
    console.log(`🍕 [DeliveryAI] Dados carregados: ${result.totalItems} itens em ${result.categories.length} categorias`);
    result.categories.forEach(cat => {
      console.log(`   📁 ${cat.name}: ${cat.items.length} itens`);
    });
    
    return result;
    
  } catch (error) {
    console.error(`🍕 [DeliveryAI] Erro ao buscar dados:`, error);
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

const MAX_CHARS_PER_BUBBLE = 1500; // WhatsApp suporta ~4096, mas melhor dividir

export function formatMenuAsBubbles(data: DeliveryData): string[] {
  const bubbles: string[] = [];
  const emoji = EMOJI_BY_TYPE[data.config.business_type] || '🍴';
  
  // Header (primeira bolha)
  let header = `${emoji} *${data.config.business_name.toUpperCase()}*\n`;
  header += `━━━━━━━━━━━━━━━━━━━━\n`;
  header += `📋 Cardápio completo (${data.totalItems} itens)\n\n`;
  
  // Adicionar informações de entrega no header
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
  
  // Cada categoria pode virar uma ou mais bolhas
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
      
      // Se adicionar este item ultrapassar o limite, criar nova bolha
      if ((categoryBubble + itemLine).length > MAX_CHARS_PER_BUBBLE) {
        bubbles.push(categoryBubble.trim());
        categoryBubble = `📁 *${category.name.toUpperCase()} (cont.)*\n`;
        categoryBubble += `───────────────\n`;
      }
      
      categoryBubble += itemLine;
    }
    
    bubbles.push(categoryBubble.trim());
  }
  
  // Footer (última bolha)
  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n✅ Pronto para pedir? Me avise! 😊`;
  
  // Adicionar footer à última bolha ou criar nova
  const lastBubble = bubbles[bubbles.length - 1];
  if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
    bubbles[bubbles.length - 1] = lastBubble + footer;
  } else {
    bubbles.push(footer.trim());
  }
  
  console.log(`🍕 [DeliveryAI] Cardápio formatado em ${bubbles.length} bolhas`);
  return bubbles;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 VALIDAR PREÇO DE ITEM (CONTRA BANCO DE DADOS)
// ═══════════════════════════════════════════════════════════════════════

export function findItemInMenu(
  data: DeliveryData, 
  itemName: string
): MenuItem | null {
  const normalizedName = itemName.toLowerCase().trim();
  
  for (const category of data.categories) {
    for (const item of category.items) {
      // Match exato
      if (item.name.toLowerCase() === normalizedName) {
        return item;
      }
      // Match parcial (contém)
      if (item.name.toLowerCase().includes(normalizedName) || 
          normalizedName.includes(item.name.toLowerCase())) {
        return item;
      }
    }
  }
  
  return null;
}

export function validatePriceInResponse(
  response: string,
  data: DeliveryData
): { valid: boolean; errors: string[]; corrected: string } {
  const errors: string[] = [];
  let corrected = response;
  
  // Regex para encontrar preços no formato R$ XX,XX ou R$XX
  const pricePattern = /R\$\s*(\d+)[,.](\d{2})/g;
  const matches = [...response.matchAll(pricePattern)];
  
  for (const match of matches) {
    const foundPrice = parseFloat(`${match[1]}.${match[2]}`);
    
    // Tentar encontrar qual item está sendo mencionado
    // (buscar nome de item próximo ao preço no texto)
    const nearbyText = response.substring(
      Math.max(0, match.index! - 50), 
      Math.min(response.length, match.index! + 50)
    );
    
    // Verificar se algum item do menu está mencionado
    let itemFound = false;
    for (const category of data.categories) {
      for (const item of category.items) {
        if (nearbyText.toLowerCase().includes(item.name.toLowerCase())) {
          if (Math.abs(item.price - foundPrice) > 0.01) {
            errors.push(`Preço incorreto para ${item.name}: R$ ${foundPrice.toFixed(2)} (correto: R$ ${item.price.toFixed(2)})`);
            // Corrigir o preço
            corrected = corrected.replace(
              match[0],
              `R$ ${item.price.toFixed(2).replace('.', ',')}`
            );
          }
          itemFound = true;
          break;
        }
      }
      if (itemFound) break;
    }
  }
  
  return {
    valid: errors.length === 0,
    errors,
    corrected,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🤖 GERAR RESPOSTA COM IA (CONTEXTO MÍNIMO)
// ═══════════════════════════════════════════════════════════════════════

export async function generateDeliveryResponse(
  userId: string,
  message: string,
  intent: CustomerIntent,
  deliveryData: DeliveryData,
  conversationContext?: string
): Promise<DeliveryAIResponse> {
  
  console.log(`🔥🔥🔥 [DEPLOY V2] generateDeliveryResponse iniciada - Intent: ${intent}`);
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: CARDÁPIO - NÃO CHAMA IA, RETORNA DADOS DO BANCO
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'WANT_MENU') {
    console.log(`🍕 [DeliveryAI] Intent WANT_MENU - retornando cardápio do banco direto (${deliveryData.totalItems} itens)`);
    
    const menuBubbles = formatMenuAsBubbles(deliveryData);
    
    return {
      intent: 'WANT_MENU',
      bubbles: menuBubbles,
      metadata: {
        itemMentioned: undefined,
      },
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: SAUDAÇÃO - JÁ ENVIA CARDÁPIO AUTOMATICAMENTE
  // O usuário solicitou que no delivery, ao receber "oi", já envie o cardápio
  // sem precisar o cliente pedir. Isso acelera o fluxo de pedidos.
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'GREETING') {
    const greeting = getTimeBasedGreeting();
    console.log(`🍕 [DeliveryAI] GREETING detectado - enviando cardápio automaticamente`);
    
    // Buscar cardápio formatado em bolhas
    const menuBubbles = formatMenuAsBubbles(deliveryData);
    
    // Primeira bolha: Saudação
    // Depois: Cardápio completo
    // Última: Chamada para ação
    return {
      intent: 'GREETING',
      bubbles: [
        `${greeting}! 😊 Bem-vindo(a) ao *${deliveryData.config.business_name}*!`,
        ...menuBubbles,
        `Me avise quando quiser fazer seu pedido! 🛵`
      ],
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: INFO DELIVERY - Resposta do banco
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'ASK_DELIVERY_INFO') {
    const config = deliveryData.config;
    let response = `📋 *Informações de Entrega*\n\n`;
    
    if (config.accepts_delivery) {
      response += `🛵 *Entrega:* R$ ${config.delivery_fee.toFixed(2).replace('.', ',')}\n`;
      response += `⏱️ *Tempo estimado:* ~${config.estimated_delivery_time} minutos\n`;
    }
    if (config.accepts_pickup) {
      response += `🏪 *Retirada no local:* GRÁTIS\n`;
    }
    if (config.min_order_value > 0) {
      response += `📦 *Pedido mínimo:* R$ ${config.min_order_value.toFixed(2).replace('.', ',')}\n`;
    }
    response += `\n💳 *Formas de pagamento:*\n`;
    config.payment_methods.forEach(method => {
      response += `• ${method}\n`;
    });
    
    return {
      intent: 'ASK_DELIVERY_INFO',
      bubbles: [response],
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: PEDIDO - Processa com preços REAIS do banco
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'WANT_TO_ORDER' || intent === 'ADD_ITEM') {
    console.log(`🍕 [DeliveryAI] Intent ${intent} - processando pedido com preços do banco`);
    
    // Parse os itens da mensagem e processa com preços reais
    const parsedItems = parseOrderItems(message);
    
    if (parsedItems.length === 0) {
      return {
        intent,
        bubbles: ['O que você gostaria de pedir? Pode me dizer o nome do item e a quantidade! 😊'],
      };
    }
    
    const addedItems: Array<{ name: string; quantity: number; price: number; total: number }> = [];
    const notFoundItems: string[] = [];
    
    for (const parsed of parsedItems) {
      const menuItem = findItemByNameFuzzy(deliveryData, parsed.name);
      
      if (menuItem) {
        addedItems.push({
          name: menuItem.name,
          quantity: parsed.quantity,
          price: menuItem.price,
          total: menuItem.price * parsed.quantity
        });
      } else {
        notFoundItems.push(parsed.name);
      }
    }
    
    if (addedItems.length === 0) {
      return {
        intent,
        bubbles: [`Hmm, não encontrei "${parsedItems[0]?.name || ''}" no cardápio 🤔 Quer ver as opções?`],
      };
    }
    
    // Calcular totais
    const subtotal = addedItems.reduce((sum, item) => sum + item.total, 0);
    const deliveryFee = deliveryData.config.delivery_fee;
    const total = subtotal + deliveryFee;
    
    // Formatar resposta com preços CORRETOS
    let response = `✅ Ótimo! Seu pedido:\n\n`;
    for (const item of addedItems) {
      response += `• ${item.quantity}x ${item.name} - R$ ${item.total.toFixed(2).replace('.', ',')}\n`;
    }
    
    if (notFoundItems.length > 0) {
      response += `\n⚠️ Não encontrei: ${notFoundItems.join(', ')}\n`;
    }
    
    response += `\n💰 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
    response += `\n🛵 Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
    response += `\n\n💵 *Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
    response += `\n\nPara finalizar, me diz:\n📝 Nome\n📍 Endereço\n💳 Forma de pagamento`;
    
    return {
      intent,
      bubbles: [response],
      metadata: {
        orderItems: addedItems,
        subtotal,
        deliveryFee,
        total
      }
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // OUTROS CASOS: USA IA COM CONTEXTO MÍNIMO
  // ═══════════════════════════════════════════════════════════════════════
  
  const mistral = await getMistralClient();
  if (!mistral) {
    console.error(`🍕 [DeliveryAI] Mistral client not available`);
    return {
      intent,
      bubbles: ['Desculpe, estou com um problema técnico. Tente novamente em alguns instantes.'],
    };
  }
  
  // Criar lista resumida dos itens (só nomes e preços)
  const itemList = deliveryData.categories
    .flatMap(cat => cat.items.map(item => `${item.name}: R$ ${item.price.toFixed(2)}`))
    .join('\n');
  
  const systemPrompt = `Você é um atendente simpático da ${deliveryData.config.business_name}.
REGRAS IMPORTANTES:
1. Seja breve e direto (máximo 2-3 frases)
2. NUNCA invente preços - use APENAS os preços abaixo
3. Se não souber algo, pergunte ou consulte o cardápio
4. Use emojis com moderação

PREÇOS CORRETOS (USE APENAS ESTES):
${itemList}

Taxa de entrega: R$ ${deliveryData.config.delivery_fee.toFixed(2)}
Pedido mínimo: R$ ${deliveryData.config.min_order_value.toFixed(2)}
Tempo de entrega: ~${deliveryData.config.estimated_delivery_time} min
Pagamento: ${deliveryData.config.payment_methods.join(', ')}`;

  try {
    const response = await mistral.chat.complete({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.3, // Baixa para ser mais determinístico
      maxTokens: 300,   // Respostas curtas
    });
    
    let aiResponse = response.choices?.[0]?.message?.content || '';
    if (typeof aiResponse !== 'string') {
      aiResponse = String(aiResponse);
    }
    
    // Validar preços na resposta
    const validation = validatePriceInResponse(aiResponse, deliveryData);
    if (!validation.valid) {
      console.log(`⚠️ [DeliveryAI] Preços incorretos detectados e corrigidos:`, validation.errors);
      aiResponse = validation.corrected;
    }
    
    return {
      intent,
      bubbles: [aiResponse],
      metadata: {
        validatedPrice: validation.valid ? undefined : 0,
      },
    };
    
  } catch (error) {
    console.error(`🍕 [DeliveryAI] Erro na IA:`, error);
    return {
      intent,
      bubbles: ['Desculpe, tive um problema. Pode repetir sua mensagem?'],
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🌅 HELPER: SAUDAÇÃO BASEADA NO HORÁRIO
// ═══════════════════════════════════════════════════════════════════════

function getTimeBasedGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return 'Bom dia';
  if (hour >= 12 && hour < 18) return 'Boa tarde';
  return 'Boa noite';
}

// ═══════════════════════════════════════════════════════════════════════
// 🎯 FUNÇÃO PRINCIPAL - PROCESSADOR DE DELIVERY
// ═══════════════════════════════════════════════════════════════════════
// 💬 PARSE DE ITENS DO PEDIDO (DA MENSAGEM DO CLIENTE)
// ═══════════════════════════════════════════════════════════════════════

const NUMBER_WORDS: Record<string, number> = {
  'um': 1, 'uma': 1,
  'dois': 2, 'duas': 2,
  'tres': 3, 'três': 3,
  'quatro': 4,
  'cinco': 5,
  'seis': 6,
  'sete': 7,
  'oito': 8,
  'nove': 9,
  'dez': 10,
};

export function parseOrderItems(message: string): Array<{ name: string; quantity: number }> {
  const results: Array<{ name: string; quantity: number }> = [];
  const normalizedMsg = message.toLowerCase()
    .replace(/quero|vou querer|me (vê|ve|da|dá)|pode|manda/gi, '')
    .trim();
  
  // Padrões: "2 pizza calabresa", "uma esfiha de carne", "3x refrigerante"
  const patterns = [
    /(\d+)\s*x?\s+(.+?)(?:,|e\s+\d|$)/gi,
    /(uma?|dois|duas|tres|três|quatro|cinco|seis|sete|oito|nove|dez)\s+(.+?)(?:,|e\s+(?:um|uma|\d)|$)/gi,
  ];
  
  for (const pattern of patterns) {
    let match;
    pattern.lastIndex = 0; // Reset regex state
    while ((match = pattern.exec(normalizedMsg)) !== null) {
      const qtyPart = match[1].toLowerCase();
      let itemPart = match[2].trim()
        .replace(/^\s*(de|da|do)\s+/i, '')  // Remove "de", "da", "do" no início
        .replace(/,\s*$/, '');              // Remove vírgula no final
      
      const qty = NUMBER_WORDS[qtyPart] || parseInt(qtyPart) || 1;
      
      if (itemPart.length > 2) {
        results.push({ name: itemPart, quantity: qty });
      }
    }
  }
  
  // Se não encontrou padrão específico, tenta extrair item único
  if (results.length === 0 && normalizedMsg.length > 2) {
    results.push({ name: normalizedMsg, quantity: 1 });
  }
  
  console.log(`🔍 [DeliveryAI] Itens parseados da mensagem: ${JSON.stringify(results)}`);
  return results;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 BUSCAR ITEM NO MENU (COM MATCHING FUZZY)
// ═══════════════════════════════════════════════════════════════════════

export function findItemByNameFuzzy(
  data: DeliveryData, 
  searchName: string
): MenuItem | null {
  const normalized = searchName.toLowerCase().trim()
    .replace(/refri\b/g, 'refrigerante')
    .replace(/(\d)\s*l\b/gi, '$1 litros')
    .replace(/(\d)\s*litro\b/gi, '$1 litros');
  
  // 1. Busca exata
  for (const category of data.categories) {
    for (const item of category.items) {
      if (item.name.toLowerCase() === normalized) {
        return item;
      }
    }
  }
  
  // 2. Busca por todas as palavras presentes
  const searchWords = normalized.split(/\s+/).filter(w => w.length > 1);
  if (searchWords.length > 0) {
    for (const category of data.categories) {
      for (const item of category.items) {
        const itemNameLower = item.name.toLowerCase();
        if (searchWords.every(word => itemNameLower.includes(word))) {
          return item;
        }
      }
    }
  }
  
  // 3. Busca fuzzy - pelo menos uma palavra importante
  const importantWords = normalized.split(/\s+/).filter(w => w.length > 3);
  if (importantWords.length > 0) {
    for (const category of data.categories) {
      for (const item of category.items) {
        const itemNameLower = item.name.toLowerCase();
        if (importantWords.some(word => itemNameLower.includes(word))) {
          return item;
        }
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 📝 PROCESSAR PEDIDO COMPLETO (ADICIONA AO CARRINHO)
// ═══════════════════════════════════════════════════════════════════════

export interface ProcessOrderResult {
  success: boolean;
  addedItems: Array<{ name: string; quantity: number; price: number }>;
  notFoundItems: string[];
  cart: CustomerCart;
  message: string;
}

export function processOrderFromMessage(
  userId: string,
  customerPhone: string,
  message: string,
  deliveryData: DeliveryData
): ProcessOrderResult {
  const parsedItems = parseOrderItems(message);
  const addedItems: Array<{ name: string; quantity: number; price: number }> = [];
  const notFoundItems: string[] = [];
  
  for (const parsed of parsedItems) {
    const menuItem = findItemByNameFuzzy(deliveryData, parsed.name);
    
    if (menuItem) {
      addToCart(userId, customerPhone, menuItem, parsed.quantity);
      addedItems.push({
        name: menuItem.name,
        quantity: parsed.quantity,
        price: menuItem.price,
      });
    } else {
      notFoundItems.push(parsed.name);
    }
  }
  
  const cart = getCart(userId, customerPhone);
  
  let message_response = '';
  if (addedItems.length > 0) {
    message_response = `✅ Adicionado ao pedido:\n`;
    for (const item of addedItems) {
      const total = item.price * item.quantity;
      message_response += `• ${item.quantity}x ${item.name} - R$ ${total.toFixed(2).replace('.', ',')}\n`;
    }
  }
  
  if (notFoundItems.length > 0) {
    message_response += `\n⚠️ Não encontrei: ${notFoundItems.join(', ')}\n`;
    message_response += `Por favor, verifique o cardápio ou escreva o nome do item.`;
  }
  
  if (addedItems.length > 0) {
    message_response += `\n\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
    message_response += `\n\nDeseja mais alguma coisa ou posso fechar o pedido?`;
  }
  
  return {
    success: addedItems.length > 0,
    addedItems,
    notFoundItems,
    cart,
    message: message_response,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 CONFIRMAR E CRIAR PEDIDO NO BANCO
// ═══════════════════════════════════════════════════════════════════════

export interface CreateOrderResult {
  success: boolean;
  orderId?: string;
  total?: number;
  error?: string;
}

export async function confirmAndCreateOrder(
  userId: string,
  customerPhone: string,
  customerName: string,
  deliveryType: 'delivery' | 'pickup',
  paymentMethod: string,
  address: string | null,
  deliveryData: DeliveryData,
  conversationId?: string
): Promise<CreateOrderResult> {
  const cart = getCart(userId, customerPhone);
  
  if (cart.items.size === 0) {
    return { success: false, error: 'Carrinho vazio' };
  }
  
  const subtotal = getCartSubtotal(cart);
  const minOrder = deliveryData.config.min_order_value;
  
  if (subtotal < minOrder) {
    return { 
      success: false, 
      error: `Pedido mínimo é R$ ${minOrder.toFixed(2).replace('.', ',')}. Seu pedido: R$ ${subtotal.toFixed(2).replace('.', ',')}`
    };
  }
  
  if (deliveryType === 'delivery' && !address) {
    return { success: false, error: 'Endereço obrigatório para entrega' };
  }
  
  const deliveryFee = deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  
  try {
    // Converter itens do carrinho para formato do banco
    const items = Array.from(cart.items.values()).map(item => ({
      name: item.name,
      quantity: item.quantity,
      notes: item.notes,
    }));
    
    // Criar pedido no banco usando a função existente do deliveryService
    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        user_id: userId,
        conversation_id: conversationId,
        customer_name: customerName,
        customer_phone: customerPhone,
        customer_address: address,
        delivery_type: deliveryType,
        payment_method: paymentMethod,
        status: 'pending',
        subtotal: subtotal,
        delivery_fee: deliveryFee,
        total: total,
        estimated_time: deliveryData.config.estimated_delivery_time,
        notes: null,
      })
      .select()
      .single();
    
    if (orderError || !order) {
      console.error(`🍕 [DeliveryAI] Erro ao criar pedido:`, orderError);
      return { success: false, error: 'Erro ao criar pedido' };
    }
    
    console.log(`✅ [DeliveryAI] Pedido #${order.id} criado com sucesso!`);
    
    // Inserir itens do pedido
    const orderItems = Array.from(cart.items.values()).map(item => ({
      order_id: order.id,
      menu_item_id: item.itemId,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      notes: item.notes,
    }));
    
    const { error: itemsError } = await supabase
      .from('order_items')
      .insert(orderItems);
    
    if (itemsError) {
      console.error(`🍕 [DeliveryAI] Erro ao inserir itens:`, itemsError);
      // Não falha o pedido
    }
    
    // Limpar carrinho após sucesso
    clearCart(userId, customerPhone);
    
    return {
      success: true,
      orderId: order.id,
      total: total,
    };
    
  } catch (error) {
    console.error(`🍕 [DeliveryAI] Erro interno:`, error);
    return { success: false, error: 'Erro interno ao criar pedido' };
  }
}

// ═══════════════════════════════════════════════════════════════════════

export async function processDeliveryMessage(
  userId: string,
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<DeliveryAIResponse | null> {
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🍕 [DeliveryAI] Processando mensagem: "${message.substring(0, 50)}..."`);
  
  // 1. Buscar dados do delivery no banco
  const deliveryData = await getDeliveryData(userId);
  if (!deliveryData) {
    console.log(`🍕 [DeliveryAI] Delivery não ativo para este usuário`);
    return null; // Retorna null para indicar que deve usar fluxo normal
  }
  
  // 2. Detectar intenção
  const intent = detectCustomerIntent(message);
  console.log(`🍕 [DeliveryAI] Intenção detectada: ${intent}`);
  
  // 3. Gerar resposta baseada na intenção
  const response = await generateDeliveryResponse(
    userId,
    message,
    intent,
    deliveryData,
    conversationHistory?.map(m => `${m.fromMe ? 'Você' : 'Cliente'}: ${m.text}`).join('\n')
  );
  
  console.log(`🍕 [DeliveryAI] Resposta gerada: ${response.bubbles.length} bolha(s)`);
  response.bubbles.forEach((b, i) => {
    console.log(`   Bolha ${i + 1}: ${b.substring(0, 80)}...`);
  });
  console.log(`${'═'.repeat(60)}\n`);
  
  return response;
}

// ═══════════════════════════════════════════════════════════════════════
// 📤 EXPORT
// ═══════════════════════════════════════════════════════════════════════

export default {
  processDeliveryMessage,
  detectCustomerIntent,
  getDeliveryData,
  formatMenuAsBubbles,
  findItemInMenu,
  findItemByNameFuzzy,
  validatePriceInResponse,
  // Carrinho
  getCart,
  addToCart,
  removeFromCart,
  clearCart,
  getCartSubtotal,
  getCartTotal,
  formatCartSummary,
  // Parse e pedidos
  parseOrderItems,
  processOrderFromMessage,
  confirmAndCreateOrder,
};
