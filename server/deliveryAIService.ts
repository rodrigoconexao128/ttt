/**
 * DELIVERY AI SERVICE - SIMPLIFIED AND DETERMINISTIC
 *
 * ARCHITECTURE (2025):
 * 1. Detects intent before calling the LLM
 * 2. Menu data is injected by the system
 * 3. LLM receives only necessary context
 * 4. Prices/products validated against database
 * 5. Structured JSON responses with message bubbles
 */

import { supabase } from "./supabaseAuth";
import { getLLMClient } from "./llm";
import type { MistralResponse } from "@shared/schema";

// TYPES AND INTERFACES

export interface MenuItemOption {
  name: string; // "Size", "Crust", etc
  type: "single" | "multiple";
  required: boolean;
  options: Array<{
    name: string; // "Small", "Medium", "Large"
    price: number; // Price for this option
  }>;
}

export interface MenuItem {
  id: string;
  name: string;
  description: string | null;
  price: number;
  category_name: string;
  is_highlight: boolean;
  is_available: boolean;
  options?: MenuItemOption[]; // Product variations
}

export interface DeliveryConfig {
  id: string;
  user_id: string;
  business_name: string;
  business_type: string;
  menu_send_mode?: 'text' | 'image' | 'image_text';
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_cancellation: boolean; // Allows customer cancellation
  payment_methods: string[];
  is_active: boolean;
  opening_hours?: Record<string, { enabled: boolean; open: string; close: string }>;
  welcome_message?: string;
  order_confirmation_message?: string;
  order_ready_message?: string;
  out_for_delivery_message?: string;
  closed_message?: string;
  humanize_responses?: boolean;
  use_customer_name?: boolean;
  response_variation?: boolean;
  response_delay_min?: number;
  response_delay_max?: number;
}

// Interface para horário de funcionamento
interface OpeningHoursDay {
  enabled: boolean;
  open: string;
  close: string;
}

// Verifica se o estabelecimento está aberto agora (horário do Brasil)
export function isBusinessOpen(openingHours?: Record<string, OpeningHoursDay>): {
  isOpen: boolean;
  currentDay: string;
  currentTime: string;
  todayHours?: OpeningHoursDay;
  message: string;
} {
  // Horário do Brasil (UTC-3)
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo',
    monday: 'segunda-feira',
    tuesday: 'terça-feira',
    wednesday: 'quarta-feira',
    thursday: 'quinta-feira',
    friday: 'sexta-feira',
    saturday: 'sábado'
  };

  const currentDay = dayNames[brazilTime.getDay()];
  const currentHour = brazilTime.getHours().toString().padStart(2, '0');
  const currentMinute = brazilTime.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMinute}`;

  // Se não tem horários configurados, assume aberto
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return {
      isOpen: true,
      currentDay,
      currentTime,
      message: ''
    };
  }

  const todayHours = openingHours[currentDay];
  
  // Se não tem configuração para hoje ou está desabilitado
  if (!todayHours || !todayHours.enabled) {
    // Encontrar próximo dia aberto
    const nextOpenDay = findNextOpenDay(openingHours, currentDay);
    return {
      isOpen: false,
      currentDay,
      currentTime,
      todayHours,
      message: `Estamos fechados hoje (${dayNamesPt[currentDay]}). ${nextOpenDay ? `Abrimos ${nextOpenDay}.` : 'Confira nossos horários!'}`
    };
  }
  
  // Verificar se está no horário
  const openTime = todayHours.open || '00:00';
  const closeTime = todayHours.close || '23:59';
  
  // Converter para minutos para comparação
  const currentMinutes = parseInt(currentHour) * 60 + parseInt(currentMinute);
  const openMinutes = parseInt(openTime.split(':')[0]) * 60 + parseInt(openTime.split(':')[1] || '0');
  const closeMinutes = parseInt(closeTime.split(':')[0]) * 60 + parseInt(closeTime.split(':')[1] || '0');
  
  // Caso especial: fechamento após meia-noite (ex: 18:00 - 02:00)
  let isOpen = false;
  if (closeMinutes < openMinutes) {
    // Horário atravessa meia-noite
    isOpen = currentMinutes >= openMinutes || currentMinutes < closeMinutes;
  } else {
    isOpen = currentMinutes >= openMinutes && currentMinutes < closeMinutes;
  }
  
  if (isOpen) {
    return {
      isOpen: true,
      currentDay,
      currentTime,
      todayHours,
      message: ''
    };
  } else {
    // Está fechado - antes de abrir ou depois de fechar
    if (currentMinutes < openMinutes) {
      return {
        isOpen: false,
        currentDay,
        currentTime,
        todayHours,
        message: `Ainda não abrimos hoje! Nosso horário é das ${openTime} às ${closeTime}.`
      };
    } else {
      return {
        isOpen: false,
        currentDay,
        currentTime,
        todayHours,
        message: `Já encerramos o atendimento hoje. Nosso horário é das ${openTime} às ${closeTime}. Volte amanhã! 😊`
      };
    }
  }
}

function formatBusinessHours(openingHours?: Record<string, OpeningHoursDay>): string {
  if (!openingHours || Object.keys(openingHours).length === 0) {
    return 'Horários não informados.';
  }

  const dayNamesPt: Record<string, string> = {
    monday: 'Segunda',
    tuesday: 'Terça',
    wednesday: 'Quarta',
    thursday: 'Quinta',
    friday: 'Sexta',
    saturday: 'Sábado',
    sunday: 'Domingo'
  };
  const dayOrder: Array<keyof typeof dayNamesPt> = [
    'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'
  ];

  let text = '📅 *Nossos horários:*\n';
  for (const day of dayOrder) {
    const dayConfig = openingHours[day];
    if (dayConfig && dayConfig.enabled) {
      text += `• ${dayNamesPt[day]}: ${dayConfig.open} às ${dayConfig.close}\n`;
    }
  }

  return text.trim();
}

function interpolateDeliveryMessage(
  template: string,
  variables: Record<string, string>
): string {
  let result = template || '';
  const replacements: Record<string, string> = {
    cliente_nome: variables.cliente_nome || variables.nome || variables.name || 'Cliente',
    nome: variables.nome || variables.cliente_nome || variables.name || 'Cliente',
    name: variables.name || variables.cliente_nome || variables.nome || 'Cliente',
    horarios: variables.horarios || '',
    status: variables.status || '',
    pedido_numero: variables.pedido_numero || '',
    total: variables.total || '',
    tempo_estimado: variables.tempo_estimado || '',
  };

  Object.entries(replacements).forEach(([key, value]) => {
    const safeValue = value || '';
    result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), safeValue);
  });

  result = result.replace(/\{\{name\}\}/g, replacements.name || 'Cliente');

  return result;
}

function getCustomerNameFromHistory(
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): string | null {
  if (!conversationHistory || conversationHistory.length === 0) return null;

  const namePatterns = [
    /\bmeu nome (?:e|é)\s+([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
    /\bme chamo\s+([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
    /\beu sou\s+([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
    /\bsou\s+(?:o|a)?\s*([a-záàâãéèêíïóôõöúçñ\s]{2,50})/i,
  ];

  for (let i = conversationHistory.length - 1; i >= 0; i--) {
    const entry = conversationHistory[i];
    if (entry.fromMe) continue;
    const text = entry.text?.trim();
    if (!text) continue;

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match?.[1]) {
        return match[1].trim();
      }
    }

    const looksLikeName = /^[a-záàâãéèêíïóôõöúçñ\s]{2,50}$/i.test(text);
    if (looksLikeName && !/\d/.test(text)) {
      return text.trim();
    }
  }

  return null;
}

function applyHumanization(
  text: string,
  config: DeliveryConfig,
  allowVariation = true
): string {
  if (!config?.humanize_responses) return text;

  const trimmed = text.trim();
  if (!trimmed) return text;

  if (config.response_variation && allowVariation && trimmed.length < 900) {
    const suffixes = [
      'Se precisar de algo, estou por aqui! 😊',
      'Qualquer coisa, é só me chamar! 😉',
      'Fico à disposição! 😊'
    ];
    const suffix = suffixes[Math.floor(Math.random() * suffixes.length)];
    if (!trimmed.endsWith('😊') && !trimmed.endsWith('😉')) {
      return `${trimmed}\n\n${suffix}`;
    }
  }

  return trimmed;
}

// Encontra o próximo dia aberto
function findNextOpenDay(openingHours: Record<string, OpeningHoursDay>, currentDay: string): string | null {
  const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const dayNamesPt: Record<string, string> = {
    sunday: 'domingo',
    monday: 'segunda-feira',
    tuesday: 'terça-feira',
    wednesday: 'quarta-feira',
    thursday: 'quinta-feira',
    friday: 'sexta-feira',
    saturday: 'sábado'
  };
  
  const currentIndex = dayNames.indexOf(currentDay);
  
  for (let i = 1; i <= 7; i++) {
    const nextIndex = (currentIndex + i) % 7;
    const nextDay = dayNames[nextIndex];
    const nextDayHours = openingHours[nextDay];
    
    if (nextDayHours && nextDayHours.enabled) {
      if (i === 1) {
        return `amanhã (${dayNamesPt[nextDay]}) às ${nextDayHours.open}`;
      }
      return `${dayNamesPt[nextDay]} às ${nextDayHours.open}`;
    }
  }
  
  return null;
}

export interface MenuCategory {
  name: string;
  image_url?: string | null;
  items: MenuItem[];
}

export interface DeliveryData {
  config: DeliveryConfig;
  categories: MenuCategory[];
  totalItems: number;
}

export interface DeliveryAIResponse {
  intent: CustomerIntent;
  bubbles: string[];
  metadata?: Record<string, any>;
  mediaActions?: MistralResponse['actions'];
}

// Tipos de intenção do cliente
export type CustomerIntent = 
  | 'GREETING'              // Oi, olá, etc
  | 'WANT_MENU'             // Quer ver cardápio completo
  | 'WANT_CATEGORY'         // Quer ver categoria específica (pizza, bebidas, etc)
  | 'ASK_ABOUT_ITEM'        // Pergunta sobre item específico
  | 'WANT_TO_ORDER'         // Quer fazer pedido
  | 'ADD_ITEM'              // Adicionar item ao pedido
  | 'REMOVE_ITEM'           // Remover item
  | 'CONFIRM_ORDER'         // Confirmar pedido
  | 'PROVIDE_CUSTOMER_INFO' // Cliente forneceu nome/endereço/pagamento
  | 'FINALIZE_ORDER'        // Criar pedido no banco de dados
  | 'CANCEL_ORDER'          // Cancelar pedido
  | 'ASK_DELIVERY_INFO'     // Perguntas sobre entrega/pagamento
  | 'ASK_BUSINESS_HOURS'    // Horário de funcionamento
  | 'COMPLAINT'             // Reclamação
  | 'HALF_HALF'             // Pedido meio a meio (pizza)
  | 'OTHER';                // Outros assuntos

// Mapeamento de palavras para categorias
export const CATEGORY_KEYWORDS: Record<string, string[]> = {
  'pizza': ['pizza', 'pizzas'],
  'esfirra': ['esfirra', 'esfiha', 'esfirras', 'esfihas', 'sfiha'],
  'bebida': ['bebida', 'bebidas', 'refrigerante', 'refri', 'suco', 'água', 'agua'],
  'açaí': ['açaí', 'acai', 'açai'],
  'borda': ['borda', 'bordas', 'borda recheada', 'bordas recheadas'],
  'hamburguer': ['hamburguer', 'hamburger', 'burger', 'lanche', 'lanches'],
  'doce': ['doce', 'doces', 'sobremesa', 'sobremesas'],
  'salgado': ['salgado', 'salgados'],
};

function normalizeCategoryText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[🍕🍔🥪🍽️🍨🍣🍴🥟🍫]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeMenuSendMode(value?: string | null): string {
  return String(value || 'text').trim().toLowerCase();
}

// ═══════════════════════════════════════════════════════════════════════
// 🛒 SISTEMA DE CARRINHO (EM MEMÓRIA)
// ═══════════════════════════════════════════════════════════════════════

interface CartItemOption {
  group: string;
  option: string;
  price: number;
}

interface CartItem {
  itemId: string; // chave interna do carrinho
  menuItemId?: string | null; // id real do menu (quando existir)
  name: string;
  price: number;
  quantity: number;
  notes?: string;
  optionsSelected?: CartItemOption[];
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
  options?: {
    displayName?: string;
    priceOverride?: number;
    notes?: string;
    optionsSelected?: CartItemOption[];
    itemKeySuffix?: string;
  }
): CustomerCart {
  const cart = getCart(userId, customerPhone);
  const itemKey = options?.itemKeySuffix ? `${item.id}:${options.itemKeySuffix}` : item.id;
  const displayName = options?.displayName || item.name;
  const unitPrice = options?.priceOverride ?? item.price;
  const notes = options?.notes;
  const optionsSelected = options?.optionsSelected;
  
  const existing = cart.items.get(itemKey);
  if (existing) {
    existing.quantity += quantity;
    if (notes) existing.notes = notes;
    if (optionsSelected) existing.optionsSelected = optionsSelected;
    console.log(`🛒 [Cart] Item atualizado: ${displayName} x${existing.quantity}`);
  } else {
    cart.items.set(itemKey, {
      itemId: itemKey,
      menuItemId: item.id,
      name: displayName,
      price: unitPrice,
      quantity,
      notes,
      optionsSelected,
    });
    console.log(`🛒 [Cart] Item adicionado: ${displayName} x${quantity}`);
  }
  
  cart.lastUpdated = new Date();
  return cart;
}

export function addCustomItemToCart(
  userId: string,
  customerPhone: string,
  customItem: {
    itemId: string;
    name: string;
    price: number;
    quantity?: number;
    notes?: string;
    optionsSelected?: CartItemOption[];
    menuItemId?: string | null;
  }
): CustomerCart {
  const cart = getCart(userId, customerPhone);
  const quantity = customItem.quantity ?? 1;
  const existing = cart.items.get(customItem.itemId);
  if (existing) {
    existing.quantity += quantity;
    if (customItem.notes) existing.notes = customItem.notes;
    if (customItem.optionsSelected) existing.optionsSelected = customItem.optionsSelected;
    console.log(`🛒 [Cart] Item custom atualizado: ${customItem.name} x${existing.quantity}`);
  } else {
    cart.items.set(customItem.itemId, {
      itemId: customItem.itemId,
      menuItemId: customItem.menuItemId ?? null,
      name: customItem.name,
      price: customItem.price,
      quantity,
      notes: customItem.notes,
      optionsSelected: customItem.optionsSelected,
    });
    console.log(`🛒 [Cart] Item custom adicionado: ${customItem.name} x${quantity}`);
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
    const addOns = item.optionsSelected?.filter(opt => !/tamanho|size/i.test(opt.group)) || [];
    if (addOns.length > 0) {
      text += `   _Adicionais: ${addOns.map(opt => opt.option).join(', ')}_\n`;
    }
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
    categoryRequested?: string; // Categoria específica solicitada
    halfHalfItems?: Array<{ name: string; price: number }>; // Itens do meio a meio
    halfHalfPrice?: number;    // Preço do meio a meio
    orderItems?: Array<{ name: string; quantity: number; price: number }>; // Itens do pedido
    subtotal?: number;         // Subtotal do pedido
    deliveryFee?: number;      // Taxa de entrega
    total?: number;            // Total do pedido
    cancelled?: boolean;       // Se o pedido foi cancelado
    reason?: string;           // Motivo de erro/ação
  };
}

// ═══════════════════════════════════════════════════════════════════════
// � EXTRAÇÃO DE INFORMAÇÕES DO CLIENTE
// ═══════════════════════════════════════════════════════════════════════

interface CustomerInfo {
  customerName?: string;
  customerAddress?: string;
  deliveryType?: 'delivery' | 'pickup';
  paymentMethod?: string;
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 IDENTIFICADOR DE TIPO DE DADO
// Analisa uma string e determina se é nome, endereço, ou outro dado
// ═══════════════════════════════════════════════════════════════════════

function identifyDataType(text: string): 'name' | 'address' | 'payment' | 'delivery_type' | 'unknown' {
  const lowerText = text.toLowerCase().trim();
  
  // Palavras que indicam ENDEREÇO (rua, avenida, número, bairro, etc)
  const addressIndicators = [
    /\b(rua|av|avenida|alameda|travessa|estrada|rodovia|praça|praca)\b/i,
    /\b(bairro|centro|vila|jardim|parque)\b/i,
    /\d{2,}/,  // Números de 2+ dígitos (número da casa)
    /,\s*\d+/,  // Vírgula seguida de número
    /n[°º]?\s*\d+/i,  // nº 123, n 123
  ];
  
  // Palavras que indicam FORMA DE PAGAMENTO
  const paymentIndicators = [
    /^(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|cartão|cartao)$/i,
    /\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|cartão|cartao)\b/i,
  ];
  
  // Palavras que indicam TIPO DE ENTREGA
  const deliveryTypeIndicators = [
    /^(entrega|delivery|entregar)$/i,
    /^(retirada|retirar|buscar|pegar)$/i,
    /vou (retirar|buscar|pegar)/i,
    /para entrega/i,
  ];
  
  // Verifica se é tipo de entrega (prioridade alta)
  if (deliveryTypeIndicators.some(p => p.test(lowerText))) {
    return 'delivery_type';
  }
  
  // Verifica se é pagamento (prioridade alta)
  if (paymentIndicators.some(p => p.test(lowerText))) {
    return 'payment';
  }
  
  // Verifica se é endereço
  const hasAddressIndicator = addressIndicators.some(p => p.test(lowerText));
  if (hasAddressIndicator) {
    return 'address';
  }
  
  // Se tem NÚMEROS e texto, provavelmente é endereço
  if (/\d+/.test(text) && /[a-záàâãéèêíïóôõöúçñ]/i.test(text)) {
    return 'address';
  }
  
  // Se é só texto sem números e parece nome de pessoa (2+ palavras, sem termos estranhos)
  const words = text.trim().split(/\s+/);
  if (words.length >= 1 && words.length <= 4) {
    const looksLikeName = words.every(w => 
      /^[a-záàâãéèêíïóôõöúçñ]{2,}$/i.test(w) && 
      !/^(rua|av|avenida|bairro|centro|pix|cartao|cartão|dinheiro|entrega|delivery|retirada)$/i.test(w)
    );
    if (looksLikeName && !/\d/.test(text)) {
      return 'name';
    }
  }
  
  return 'unknown';
}

function extractCustomerInfo(message: string, context: string = '', existingInfo: CustomerInfo = {}): CustomerInfo {
  const info: CustomerInfo = { ...existingInfo };
  const fullText = `${context} ${message}`.toLowerCase();
  const messageLower = message.toLowerCase();
  
  console.log(`📝 [extractCustomerInfo] Analisando: "${message}"`);
  console.log(`📝 [extractCustomerInfo] Contexto: "${context.substring(0, 100)}..."`);
  console.log(`📝 [extractCustomerInfo] Info existente:`, existingInfo);
  
  // ═══════════════════════════════════════════════════════════════════════════════
  // NOVO: Detectar formato "Nome, Endereço, Pagamento" (tudo junto)
  // Exemplo: "João Silva, Rua das Flores 123, pago no PIX"
  // ═══════════════════════════════════════════════════════════════════════════════
  const hasComma = message.includes(',');
  const hasAddress = /\b(rua|av|avenida|alameda|travessa|estrada|praça|praca)\b/i.test(message) || /[,\s]\d+[,\s]/i.test(message);
  const hasPayment = /\b(pix|dinheiro|cart[aã]o|cartao)\b/i.test(message);
  const hasNumber = /\d/.test(message);
  
  if (hasComma && hasAddress && (hasPayment || hasNumber)) {
    console.log(`📝 [extractCustomerInfo] 🎯 Detectou formato multi-dados (Nome, Endereço, Pagamento)`);
    
    // Dividir por vírgula e analisar cada parte
    const parts = message.split(',').map(p => p.trim()).filter(p => p.length > 0);
    
    for (const part of parts) {
      const partLower = part.toLowerCase();
      
      // Verificar se é pagamento
      const paymentMatch = part.match(/\b(pix|dinheiro|cart[aã]o|cartao|credito|débito|debito)\b/i);
      if (paymentMatch && !info.paymentMethod) {
        const paymentMap: Record<string, string> = {
          'pix': 'Pix', 'dinheiro': 'Dinheiro', 'cartao': 'Cartao', 'cartão': 'Cartao',
          'debito': 'Cartao', 'débito': 'Cartao', 'credito': 'Cartao', 'crédito': 'Cartao',
        };
        info.paymentMethod = paymentMap[paymentMatch[1].toLowerCase()] || 'Dinheiro';
        console.log(`📝 [extractCustomerInfo] Multi-dados - Pagamento: ${info.paymentMethod}`);
        continue;
      }
      
      // Verificar se é endereço (tem palavra de logradouro OU número)
      const isAddressPart = /\b(rua|av|avenida|alameda|travessa|estrada|praça|praca)\b/i.test(partLower) || 
                           (/\d+/.test(part) && /[a-záàâãéèêíïóôõöúç]/i.test(part));
      if (isAddressPart && !info.customerAddress) {
        info.customerAddress = part;
        console.log(`📝 [extractCustomerInfo] Multi-dados - Endereço: ${part}`);
        // Assume delivery se tem endereço
        if (!info.deliveryType) info.deliveryType = 'delivery';
        continue;
      }
      
      // Se não é pagamento nem endereço, provavelmente é nome (só texto, sem números significativos)
      // Usa regex que aceita caracteres acentuados e espaços, exclui se tem números
      const hasNoNumbers = !/\d/.test(part);
      const hasLetters = /[a-záàâãéèêíïóôõöúçñ]/i.test(part);
      const notShortWord = part.split(/\s+/).filter(w => w.length > 1).length >= 1;
      const notAddress = !/\b(rua|av|avenida|alameda|travessa|estrada|praça|praca)\b/i.test(partLower);
      const isLikelyName = hasNoNumbers && hasLetters && notShortWord && notAddress;
      
      if (isLikelyName && !info.customerName && !paymentMatch) {
        // Capitalizar cada palavra
        info.customerName = part.trim().split(/\s+/).map(w => 
          w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
        ).join(' ');
        console.log(`📝 [extractCustomerInfo] Multi-dados - Nome: ${info.customerName}`);
        continue;
      }
    }
    
    // Se encontrou dados, retorna (priorizar multi-dados)
    if (info.customerName || info.customerAddress || info.paymentMethod) {
      console.log(`📝 [extractCustomerInfo] ✅ Multi-dados extraídos:`, info);
      return info;
    }
  }
  
  // PRIMEIRO: Priorizar tipo de entrega explícito na mensagem atual
  const messageHasPickup = /\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aí|vou la|vou lá|passo ai|passo aí|passo la|passo lá|balc[aã]o)\b/i.test(messageLower);
  const messageHasDelivery = /\b(delivery|entreg|mandar|enviar|levar)\b/i.test(messageLower);
  if (messageHasPickup) {
    info.deliveryType = 'pickup';
    console.log(`📝 [extractCustomerInfo] Detectou pickup (mensagem)`);
  } else if (messageHasDelivery) {
    info.deliveryType = 'delivery';
    console.log(`📝 [extractCustomerInfo] Detectou delivery (mensagem)`);
  }
  
  // SEGUNDO: Detectar tipo de entrega no fullText (contexto + mensagem)
  if (!info.deliveryType) {
    if (fullText.match(/\b(delivery|entreg|mandar|enviar|levar)\b/i)) {
      info.deliveryType = 'delivery';
      console.log(`📝 [extractCustomerInfo] Detectou delivery`);
    } else if (fullText.match(/\b(retirar|retiro|buscar|busco|pegar|pego|retira|retirada|no local|vou ai|vou aí|vou la|vou lá|passo ai|passo aí|passo la|passo lá|balc[aã]o)\b/i)) {
      info.deliveryType = 'pickup';
      console.log(`📝 [extractCustomerInfo] Detectou pickup`);
    }
  }
  
  // TERCEIRO: Extrair forma de pagamento da mensagem atual (prioridade)
  const messagePaymentMatch = message.match(/\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|cartão|cartao)\b/i);
  if (messagePaymentMatch) {
    const paymentMap: Record<string, string> = {
      'pix': 'Pix',
      'dinheiro': 'Dinheiro',
      'cartao': 'Cartao',
      'cartão': 'Cartao',
      'debito': 'Cartao',
      'débito': 'Cartao',
      'credito': 'Cartao',
      'crédito': 'Cartao',
    };
    info.paymentMethod = paymentMap[messagePaymentMatch[1].toLowerCase()] || 'Dinheiro';
    console.log(`📝 [extractCustomerInfo] Detectou pagamento (mensagem): ${info.paymentMethod}`);
  }
  
  // QUARTO: Extrair forma de pagamento do contexto se ainda não tiver
  if (!info.paymentMethod) {
    const paymentMatch = message.match(/\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|cartão|cartao)\b/i);
    if (paymentMatch) {
      const paymentMap: Record<string, string> = {
        'pix': 'Pix',
        'dinheiro': 'Dinheiro',
        'cartao': 'Cartao',
        'cartão': 'Cartao',
        'debito': 'Cartao',
        'débito': 'Cartao',
        'credito': 'Cartao',
        'crédito': 'Cartao',
      };
      info.paymentMethod = paymentMap[paymentMatch[1].toLowerCase()] || 'Dinheiro';
      console.log(`📝 [extractCustomerInfo] Detectou pagamento: ${info.paymentMethod}`);
    }
  }
  
  // TERCEIRO: Identificar o que a mensagem atual representa
  const messageType = identifyDataType(message);
  console.log(`📝 [extractCustomerInfo] Tipo da mensagem: ${messageType}`);
  
  // CORREÇÃO: Extrair endereço MESMO se messageType for payment/delivery_type
  // (quando a mensagem contém múltiplos dados como "entrega pix avenida x, 123")
  if (!info.customerAddress) {
    const hasAddressIndicator = /\b(rua|av|avenida|alameda|travessa|estrada|praça|praca)\b/i.test(message) ||
                                /[a-záàâãéèêíïóôõöúç\s]+,\s*\d+/i.test(message);
    const hasNumber = /\d/.test(message);
    
    if (hasAddressIndicator && hasNumber) {
      // Remove palavras de pagamento/tipo de entrega da mensagem
      let address = message
        .replace(/\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|delivery|entrega|retirada|retirar)\b/gi, '')
        .trim()
        .replace(/^[\s,]+|[\s,]+$/g, ''); // Remove espaços e vírgulas nas pontas
      
      if (address.length >= 5) {
        info.customerAddress = address;
        console.log(`📝 [extractCustomerInfo] Endereço extraído (multi-dados): ${info.customerAddress}`);
      }
    }
  }
  
  // Se a mensagem parece ser endereço puro e não temos endereço ainda
  if (messageType === 'address' && !info.customerAddress) {
    // Remove palavras de pagamento/tipo de entrega da mensagem
    let address = message
      .replace(/\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|delivery|entrega|retirada)\b/gi, '')
      .trim();
    
    // Se começa com prefixo de rua, usa direto
    if (/^(rua|av|avenida|alameda|travessa)/i.test(address)) {
      info.customerAddress = address;
    } else {
      // Adiciona "Rua" se parece endereço mas não tem prefixo
      info.customerAddress = address;
    }
    console.log(`📝 [extractCustomerInfo] Endereço extraído: ${info.customerAddress}`);
  }
  
  // Se a mensagem parece ser nome e não temos nome ainda
  if (messageType === 'name' && !info.customerName) {
    const name = message.trim();
    // Capitalizar cada palavra
    info.customerName = name.split(/\s+/).map(w => 
      w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
    ).join(' ');
    console.log(`📝 [extractCustomerInfo] Nome extraído: ${info.customerName}`);
  }
  
  // QUARTO: Tentar extrair nome de padrões explícitos
  if (!info.customerName) {
    const namePatterns = [
      /(?:meu nome (?:é|e)|nome:|sou o?|me chamo)\s+([a-záàâãéèêíïóôõöúçñ\s]{3,50})/i,
      /(?:^|\s)nome\s*[:=]\s*([a-záàâãéèêíïóôõöúçñ\s]{3,50})/i,
    ];
    
    for (const pattern of namePatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim();
        // Filtrar se for endereço ou pagamento
        if (identifyDataType(name) === 'name' || identifyDataType(name) === 'unknown') {
          info.customerName = name.split(/\s+/).map(w => 
            w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()
          ).join(' ');
          console.log(`📝 [extractCustomerInfo] Nome por padrão: ${info.customerName}`);
          break;
        }
      }
    }
  }
  
  // QUINTO: Tentar extrair endereço de padrões explícitos
  if (!info.customerAddress && info.deliveryType === 'delivery') {
    const addressPatterns = [
      /(?:rua|av|avenida|alameda|travessa|estrada)\s+([a-záàâãéèêíïóôõöúçñ\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro|cart[aã]o))/i,
      /endere[çc]o\s*[:=]\s*([a-záàâãéèêíïóôõöúçñ\s\d,.-]+?)(?:\s*$|\s+(?:pix|dinheiro))/i,
    ];
    
    for (const pattern of addressPatterns) {
      const match = fullText.match(pattern);
      if (match && match[1]) {
        info.customerAddress = match[1].trim();
        console.log(`📝 [extractCustomerInfo] Endereço por padrão: ${info.customerAddress}`);
        break;
      }
    }
  }
  
  console.log(`📝 [extractCustomerInfo] Resultado final:`, info);
  return info;
}

// ═══════════════════════════════════════════════════════════════════════
// 💾 CRIAR PEDIDO NO BANCO DE DADOS
// ═══════════════════════════════════════════════════════════════════════

async function createDeliveryOrder(
  userId: string,
  conversationId: string | undefined,
  customerInfo: CustomerInfo,
  deliveryData: DeliveryData
): Promise<string> {
  // Calcular totais (por enquanto fixo - depois adicionar itens reais do carrinho)
  const subtotal = 30; // Pizza meio a meio
  const deliveryFee = customerInfo.deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0;
  const total = subtotal + deliveryFee;
  
  // Se conversation_id é do simulador (começa com "sim-"), usar null
  // para evitar erro de foreign key
  const validConversationId = conversationId && !conversationId.startsWith('sim-') 
    ? conversationId 
    : null;
  
  // Inserir pedido usando Supabase
  const { data: order, error } = await supabase
    .from('delivery_orders')
    .insert({
      user_id: userId,
      conversation_id: validConversationId,
      customer_name: customerInfo.customerName,
      customer_address: customerInfo.customerAddress,
      delivery_type: customerInfo.deliveryType,
      payment_method: customerInfo.paymentMethod,
      subtotal: subtotal,
      delivery_fee: deliveryFee,
      total: total,
      status: 'pending',
      payment_status: 'pending',
      created_by_ai: true,
      estimated_time: deliveryData.config.estimated_delivery_time,
      confirmed_at: new Date().toISOString(),
    })
    .select('id, order_number')
    .single();
  
  if (error) {
    console.error(`❌ [DeliveryAI] Erro ao inserir pedido no Supabase:`, error);
    throw new Error(`Erro ao criar pedido: ${error.message}`);
  }
  
  console.log(`✅ [DeliveryAI] Pedido criado: ID=${order.id}, Number=${order.order_number}`);
  
  // TODO: Adicionar itens do carrinho na tabela order_items
  
  return order.order_number?.toString() || order.id.substring(0, 8).toUpperCase();
}

// ═══════════════════════════════════════════════════════════════════════
// �🔍 DETECÇÃO DE INTENÇÃO (PRÉ-IA)
// ═══════════════════════════════════════════════════════════════════════

const INTENT_PATTERNS: Record<CustomerIntent, RegExp[]> = {
  GREETING: [
    /^(oi+e?|olá|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)$/i,
    /^(oi+e?|olá|ola|eai|e ai|hey|opa|bom dia|boa tarde|boa noite|tudo bem|td bem|blz|oie+)\s*[!?.,]*$/i,
  ],
  // WANT_CATEGORY: quando cliente menciona apenas o nome de uma categoria
  WANT_CATEGORY: [
    /^(pizza|pizzas)$/i,
    /^(esfirra|esfiha|esfirras|esfihas|sfiha)s?$/i,
    /^(bebida|bebidas|refrigerante|refri)s?$/i,
    /^(a[çc]a[ií])$/i,
    /^(hamburguer|hamburger|burger|lanche)s?$/i,
    /^(doce|sobremesa)s?$/i,
    /^(salgado)s?$/i,
    /quero ver (as )?(pizza|esfirra|bebida|a[çc]a[ií]|lanche|doce|salgado)s?/i,
    /mostra (as )?(pizza|esfirra|bebida|a[çc]a[ií]|lanche|doce|salgado)s?/i,
    /ver (as )?(pizza|esfirra|bebida|a[çc]a[ií]|lanche|doce|salgado)s?/i,
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
  ],
  HALF_HALF: [
    /meio a meio/i,
    /meia.*meia/i,
    /metade.*metade/i,
    /duas metades/i,
    /dividid[ao]/i,
    /\d\/\d/i,  // 1/2, etc
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
    /quero (um|uma|o|a|uns|umas|\d+)/i,           // 🆕 "quero uma pizza", "quero 2 esfihas"
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
  PROVIDE_CUSTOMER_INFO: [
    /(?:meu nome (?:é|e)|nome:|sou|me chamo)\s+/i,
    /(?:rua|av|avenida|travessa)\s+/i,
    /endere[çc]o:\s+/i,
    /(?:dinheiro|cart[aã]o|pix|d[eé]bito|cr[eé]dito)\s*$/i,
    /(?:delivery|retirar|retiro|buscar|pegar|no local)/i,
  ],
  FINALIZE_ORDER: [],  // Intent automático após coletar todos os dados
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

// Detectar qual categoria o cliente quer
export function detectCategoryFromMessage(message: string): string | null {
  const normalizedMsg = normalizeCategoryText(message);
  if (!normalizedMsg) return null;
  
  for (const [category, keywords] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const keyword of keywords) {
      const normalizedKeyword = normalizeCategoryText(keyword);
      if (!normalizedKeyword) continue;
      if (normalizedMsg === normalizedKeyword || normalizedMsg.includes(normalizedKeyword)) {
        console.log(`🎯 [DeliveryAI] Categoria detectada: ${category} (keyword: ${keyword})`);
        return category;
      }
    }
  }
  return null;
}

// Detectar se o cliente mencionou um tamanho na mensagem
export function detectSizeFromMessage(message: string): string | null {
  const normalizedMsg = message.toLowerCase().trim();
  
  // Padrões de tamanho
  const sizePatterns = [
    { pattern: /\b(grande|g)\b/i, size: 'G' },
    { pattern: /\b(m[eé]dia?|m)\b/i, size: 'M' },
    { pattern: /\b(pequena?|p)\b/i, size: 'P' },
    { pattern: /\b(300\s*ml)\b/i, size: '300ml' },
    { pattern: /\b(500\s*ml)\b/i, size: '500ml' },
    { pattern: /\b(700\s*ml)\b/i, size: '700ml' },
    { pattern: /\b(1\s*l(?:itro)?|litro)\b/i, size: '1L' },
    { pattern: /\b(1[,.]5\s*l)\b/i, size: '1.5L' },
    { pattern: /\b(2\s*l(?:itros)?)\b/i, size: '2L' },
    { pattern: /\b(simples)\b/i, size: 'simples' },
    { pattern: /\b(duplo)\b/i, size: 'duplo' },
    { pattern: /\b(triplo)\b/i, size: 'triplo' },
  ];
  
  for (const { pattern, size } of sizePatterns) {
    if (pattern.test(normalizedMsg)) {
      console.log(`📐 [DeliveryAI] Tamanho detectado na mensagem: ${size}`);
      return size;
    }
  }
  
  return null;
}

function normalizeTextForMatch(text: string): string {
  return (text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[ -]/g, '')
    .replace(/\p{Diacritic}/gu, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function resolveMenuItemOptions(menuItem: MenuItem, message: string): {
  unitPrice: number;
  displayName: string;
  notes?: string;
  optionsSelected: CartItemOption[];
  needsSize: boolean;
  sizeOptions?: Array<{ name: string; price: number }>;
} {
  const normalizedMsg = normalizeTextForMatch(message);
  const optionsSelected: CartItemOption[] = [];
  let unitPrice = menuItem.price;
  let sizeLabel: string | null = null;

  const sizeGroup = menuItem.options?.find(opt =>
    opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
  );
  const sizeFromMessage = detectSizeFromMessage(message);

  if (sizeGroup && sizeGroup.options?.length) {
    if (!sizeFromMessage) {
      return {
        unitPrice: menuItem.price,
        displayName: menuItem.name,
        optionsSelected: [],
        needsSize: true,
        sizeOptions: sizeGroup.options.map(opt => ({ name: opt.name, price: opt.price })),
      };
    }

    const selectedSize = sizeGroup.options.find(opt => {
      const optNormalized = normalizeTextForMatch(opt.name);
      return optNormalized.includes(normalizeTextForMatch(sizeFromMessage)) ||
        (sizeFromMessage.toLowerCase() === 'p' && optNormalized.includes('pequen')) ||
        (sizeFromMessage.toLowerCase() === 'm' && optNormalized.includes('med')) ||
        (sizeFromMessage.toLowerCase() === 'g' && optNormalized.includes('grand'));
    });

    if (selectedSize) {
      unitPrice = selectedSize.price;
      sizeLabel = selectedSize.name;
      optionsSelected.push({ group: sizeGroup.name, option: selectedSize.name, price: selectedSize.price });
    }
  }

  const hasNoAddons = /\bsem\s+(borda|adicional|extra|recheio)\b/i.test(message);
  if (menuItem.options && !hasNoAddons) {
    for (const group of menuItem.options) {
      const isSizeGroup = sizeGroup && group.name === sizeGroup.name;
      if (isSizeGroup) continue;
      for (const opt of group.options || []) {
        const optNormalized = normalizeTextForMatch(opt.name);
        if (optNormalized && normalizedMsg.includes(optNormalized)) {
          optionsSelected.push({ group: group.name, option: opt.name, price: opt.price });
          unitPrice += opt.price;
        }
      }
    }
  }

  const notesParts: string[] = [];
  if (sizeLabel) notesParts.push(`Tamanho: ${sizeLabel}`);
  const addOns = optionsSelected.filter(opt => !/tamanho|size/i.test(opt.group));
  if (addOns.length > 0) {
    notesParts.push(`Adicionais: ${addOns.map(opt => opt.option).join(', ')}`);
  }

  return {
    unitPrice,
    displayName: sizeLabel ? `${menuItem.name} (${sizeLabel})` : menuItem.name,
    notes: notesParts.length > 0 ? notesParts.join(' | ') : undefined,
    optionsSelected,
    needsSize: false,
  };
}

export function detectCustomerIntent(message: string): CustomerIntent {
  const normalizedMsg = message.toLowerCase().trim();
  
  // PRIORIDADE 1: Verificar se é pedido meio a meio
  for (const pattern of INTENT_PATTERNS.HALF_HALF) {
    if (pattern.test(normalizedMsg)) {
      console.log(`🎯 [DeliveryAI] Intent detected: HALF_HALF`);
      return 'HALF_HALF';
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🆕 PRIORIDADE 2: Verificar se contém pedido ANTES de verificar saudação
  // "Oi, quero uma pizza calabresa" = WANT_TO_ORDER (não GREETING)
  // ═══════════════════════════════════════════════════════════════════════
  for (const pattern of INTENT_PATTERNS.WANT_TO_ORDER) {
    if (pattern.test(normalizedMsg)) {
      console.log(`🎯 [DeliveryAI] Intent detected: WANT_TO_ORDER (pattern: ${pattern})`);
      return 'WANT_TO_ORDER';
    }
  }
  
  // PRIORIDADE 3: Verificar se é seleção de categoria específica
  // Ex: "pizza", "bebidas", "açaí" - sem mais nada
  for (const pattern of INTENT_PATTERNS.WANT_CATEGORY) {
    if (pattern.test(normalizedMsg)) {
      console.log(`🎯 [DeliveryAI] Intent detected: WANT_CATEGORY (pattern: ${pattern})`);
      return 'WANT_CATEGORY';
    }
  }
  
  // Verificar cada padrão em ordem de prioridade
  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    if (intent === 'WANT_CATEGORY' || intent === 'HALF_HALF' || intent === 'WANT_TO_ORDER') continue; // Já verificamos
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
// 🤖 DETECÇÃO DE INTENÇÃO COM IA (CONSIDERA CONTEXTO)
// ═══════════════════════════════════════════════════════════════════════

export async function detectIntentWithAI(
  message: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  deliveryData?: DeliveryData | null
): Promise<CustomerIntent> {
  
  // Se não tem histórico, usa detecção simples por regex
  if (!conversationHistory || conversationHistory.length < 2) {
    return detectCustomerIntent(message);
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🆕 VERIFICAR SE ESTÁ AGUARDANDO TAMANHO (contexto pendente)
  // Se a última mensagem do bot perguntou "Qual tamanho?", então
  // a resposta do cliente é uma seleção de tamanho, não nova busca
  // ═══════════════════════════════════════════════════════════════════════
  const lastBotMessage = conversationHistory.filter(m => m.fromMe).slice(-1)[0];
  if (lastBotMessage) {
    const botMsgLower = lastBotMessage.text.toLowerCase();
    const isAwaitingSize = botMsgLower.includes('qual tamanho') || 
                           botMsgLower.includes('qual o tamanho') ||
                           botMsgLower.includes('me diz o tamanho') ||
                           (botMsgLower.includes('tamanho') && 
                            (botMsgLower.includes('pequena (p)') || 
                             botMsgLower.includes('média (m)') || 
                             botMsgLower.includes('grande (g)')));
    
    if (isAwaitingSize) {
      // O cliente está respondendo com o tamanho
      const sizeDetected = detectSizeFromMessage(message);
      if (sizeDetected) {
        console.log(`🤖 [DeliveryAI] Contexto AWAITING_SIZE detectado! Cliente escolheu: ${sizeDetected}`);
        return 'ADD_ITEM'; // Usar ADD_ITEM para continuar o pedido com o tamanho
      }
    }

    // 🆕 VERIFICAR SE ESTÁ AGUARDANDO SABORES MEIO A MEIO
    const isAwaitingHalfHalfFlavors = botMsgLower.includes('meio a meio') &&
      (botMsgLower.includes('quais dois sabores') || botMsgLower.includes('exemplo: "calabresa e mussarela"'));
    if (isAwaitingHalfHalfFlavors) {
      const hasTwoFlavors = /\b(.+?)\s+(e|com|\/)\s+(.+?)\b/i.test(message) ||
        /(meia\s+.+?\s+meia\s+.+)/i.test(message);
      if (hasTwoFlavors) {
        console.log(`🤖 [DeliveryAI] Contexto AWAITING_HALF_HALF detectado! Cliente informou sabores.`);
        return 'HALF_HALF';
      }
    }
  }
  // ═══════════════════════════════════════════════════════════════════════
  
  const mistral = await getLLMClient();
  if (!mistral) {
    console.log(`🤖 [DeliveryAI] Mistral indisponível, usando regex`);
    return detectCustomerIntent(message);
  }
  
  // Verificar contexto: já tem pedido em andamento?
  const hasOrderInProgress = conversationHistory.some(m => 
    m.fromMe && (
      m.text.toLowerCase().includes('seu pedido:') ||
      m.text.toLowerCase().includes('resumo do pedido') ||
      m.text.toLowerCase().includes('para finalizar')
    )
  );
  
  // Se é uma saudação simples mas já tem pedido, não é GREETING
  const isSimpleGreeting = /^(oi+e?|olá|ola|eai|hey|opa)\s*[!?.,]*$/i.test(message.trim());
  if (isSimpleGreeting && hasOrderInProgress) {
    console.log(`🤖 [DeliveryAI] Saudação com pedido em andamento -> tratando como CONTINUE_ORDER`);
    return 'OTHER'; // Vai cair no fluxo de IA contextual
  }
  
  // Montar contexto resumido
  const recentHistory = conversationHistory.slice(-6).map(m => 
    `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text.substring(0, 100)}`
  ).join('\n');
  
  const systemPrompt = `Você analisa intenções de clientes em delivery.
Baseado no CONTEXTO da conversa, classifique a intenção da última mensagem.

INTENÇÕES POSSÍVEIS:
- GREETING: Primeira saudação (oi, olá) SEM pedido em andamento
- WANT_MENU: Quer ver cardápio completo
- WANT_CATEGORY: Quer ver apenas uma categoria (pizza, esfirra, bebida)
- HALF_HALF: Pedido meio a meio (meia X e meia Y)
- WANT_TO_ORDER: Quer fazer pedido ou adicionar item
- ADD_ITEM: Quer adicionar mais itens ao pedido existente
- REMOVE_ITEM: Quer remover item
- CONFIRM_ORDER: Confirma pedido (sim, confirmo, pode mandar, ok, fechado)
- PROVIDE_CUSTOMER_INFO: Fornece dados pessoais (nome, endereço, telefone, pagamento)
- CANCEL_ORDER: Cancela pedido
- ASK_DELIVERY_INFO: Pergunta sobre entrega, taxa, tempo
- OTHER: Outras perguntas ou continuação de conversa

REGRAS IMPORTANTES:
1. "sim", "confirmo", "ok", "pode mandar", "fechado" = CONFIRM_ORDER
2. "meia X e meia Y" = HALF_HALF (sempre, mesmo sem dizer "meio a meio")
3. Se já tem pedido em andamento e cliente manda saudação simples, é OTHER ou CONFIRM_ORDER
4. Se menciona apenas UMA categoria (pizza, esfirra) = WANT_CATEGORY
5. Se fornece nome, endereço, forma de pagamento = PROVIDE_CUSTOMER_INFO

Responda APENAS com o nome da intenção, nada mais.`;

  try {
    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `CONTEXTO DA CONVERSA:\n${recentHistory}\n\nÚLTIMA MENSAGEM DO CLIENTE: "${message}"\n\nQual a intenção?` }
      ],
      temperature: 0.1,
      maxTokens: 20,
    });
    
    const intentStr = (response.choices?.[0]?.message?.content || 'OTHER').toString().trim().toUpperCase();
    const validIntents: CustomerIntent[] = ['GREETING', 'WANT_MENU', 'WANT_CATEGORY', 'HALF_HALF', 'ASK_ABOUT_ITEM', 'WANT_TO_ORDER', 'ADD_ITEM', 'REMOVE_ITEM', 'CONFIRM_ORDER', 'PROVIDE_CUSTOMER_INFO', 'FINALIZE_ORDER', 'CANCEL_ORDER', 'ASK_DELIVERY_INFO', 'ASK_BUSINESS_HOURS', 'COMPLAINT', 'OTHER'];
    
    const detectedIntent = validIntents.find(i => intentStr.includes(i)) || 'OTHER';
    console.log(`🤖 [DeliveryAI] IA detectou intent: ${detectedIntent} (resposta: ${intentStr})`);
    
    return detectedIntent;
  } catch (error) {
    console.error(`🤖 [DeliveryAI] Erro na detecção IA:`, error);
    return detectCustomerIntent(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 BUSCAR DADOS DO DELIVERY (BANCO DE DADOS)
// ═══════════════════════════════════════════════════════════════════════

export async function isDeliveryEnabled(userId: string): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from('delivery_config')
      .select('is_active')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      return false;
    }

    return data.is_active === true;
  } catch {
    return false;
  }
}

export async function getDeliveryData(userId: string): Promise<DeliveryData | null> {
  try {
    // 1. Buscar configuração do delivery
    const { data: config, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    console.log(`🍕 [DeliveryAI] DEBUG getDeliveryData: userId=${userId}`);
    console.log(`🍕 [DeliveryAI] DEBUG config: ${JSON.stringify(config)}`);
    console.log(`🍕 [DeliveryAI] DEBUG configError: ${configError ? JSON.stringify(configError) : 'null'}`);
    console.log(`🍕 [DeliveryAI] DEBUG is_active value: ${config?.is_active} (type: ${typeof config?.is_active})`);
    
    if (configError || !config || !config.is_active) {
      console.log(`🍕 [DeliveryAI] Delivery não ativo para user ${userId}`);
      console.log(`🍕 [DeliveryAI] Motivo: configError=${!!configError}, config=${!!config}, is_active=${config?.is_active}`);
      return null;
    }
    
    // 2. Buscar categorias
    const { data: categories } = await supabase
      .from('menu_categories')
      .select('id, name, image_url, display_order')
      .eq('user_id', userId)
      .order('display_order', { ascending: true });
    
    // 3. Buscar itens do menu (incluindo options para variações)
    const { data: items } = await supabase
      .from('menu_items')
      .select('id, name, description, price, category_id, is_featured, is_available, options')
      .eq('user_id', userId)
      .eq('is_available', true)
      .order('display_order', { ascending: true });
    
    if (!items || items.length === 0) {
      console.log(`🍕 [DeliveryAI] Nenhum item encontrado para user ${userId}`);
      return null;
    }
    
    // 4. Organizar por categoria
    const categoryMap = new Map<string, { name: string; image_url?: string | null; items: MenuItem[] }>();

    // Criar map de category_id -> meta
    const categoryIdToMeta = new Map<string, { name: string; image_url?: string | null }>();
    categories?.forEach(cat => categoryIdToMeta.set(cat.id, { name: cat.name, image_url: cat.image_url }));
    
    // Agrupar itens por categoria
    items.forEach(item => {
      const categoryMeta = categoryIdToMeta.get(item.category_id);
      const categoryName = categoryMeta?.name || 'Outros';
      
      if (!categoryMap.has(categoryName)) {
        categoryMap.set(categoryName, { name: categoryName, image_url: categoryMeta?.image_url || null, items: [] });
      }
      
      // Parsear options (variações) se existir
      let parsedOptions: MenuItemOption[] | undefined;
      if (item.options && Array.isArray(item.options) && item.options.length > 0) {
        parsedOptions = item.options as MenuItemOption[];
      }
      
      categoryMap.get(categoryName)!.items.push({
        id: item.id,
        name: item.name,
        description: item.description,
        price: parseFloat(item.price) || 0,
        category_name: categoryName,
        is_highlight: item.is_featured || false,
        is_available: item.is_available,
        options: parsedOptions,
      });
    });
    
    const result: DeliveryData = {
      config: {
        id: config.id,
        user_id: config.user_id,
        business_name: config.business_name,
        business_type: config.business_type || 'restaurante',
        menu_send_mode: config.menu_send_mode || 'text',
        delivery_fee: parseFloat(config.delivery_fee) || 0,
        min_order_value: parseFloat(config.min_order_value) || 0,
        estimated_delivery_time: config.estimated_delivery_time || 45,
        accepts_delivery: config.accepts_delivery ?? true,
        accepts_pickup: config.accepts_pickup ?? true,
        accepts_cancellation: config.accepts_cancellation ?? false,  // Default: não permite cancelamento
        payment_methods: config.payment_methods || ['Dinheiro', 'Cartão', 'Pix'],
        is_active: config.is_active,
        opening_hours: config.opening_hours || {},  // Horários de funcionamento
        welcome_message: config.welcome_message || null,
        order_confirmation_message: config.order_confirmation_message || null,
        order_ready_message: config.order_ready_message || null,
        out_for_delivery_message: config.out_for_delivery_message || null,
        closed_message: config.closed_message || null,
        humanize_responses: config.humanize_responses ?? true,
        use_customer_name: config.use_customer_name ?? true,
        response_variation: config.response_variation ?? true,
        response_delay_min: config.response_delay_min ?? 2,
        response_delay_max: config.response_delay_max ?? 5,
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
      const highlight = item.is_highlight ? ' ⭐' : '';
      
      // Verificar se tem variações de tamanho
      const sizeOption = item.options?.find(opt => 
        opt.name.toLowerCase().includes('tamanho') || 
        opt.name.toLowerCase().includes('size')
      );
      
      let itemLine = '';
      if (sizeOption && sizeOption.options.length > 0) {
        // Mostrar item com variações de tamanho
        const prices = sizeOption.options.map(opt => 
          `${opt.name}: R$ ${opt.price.toFixed(2).replace('.', ',')}`
        ).join(' | ');
        itemLine = `• ${item.name}${highlight}\n  ${prices}\n`;
      } else {
        // Item sem variações - preço único
        const priceStr = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
        itemLine = `• ${item.name}${highlight} - ${priceStr}\n`;
      }
      
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

function buildMenuMediaActions(
  data: DeliveryData,
  intent: CustomerIntent,
  metadata?: Record<string, any>
): MistralResponse['actions'] {
  if (intent !== 'WANT_MENU' && intent !== 'WANT_CATEGORY' && intent !== 'GREETING') {
    return [];
  }

  if (metadata?.categoryImageUrl) {
    return [
      {
        type: 'send_media_url',
        media_url: metadata.categoryImageUrl,
        media_type: 'image',
        caption: metadata.categoryName || metadata.categoryRequested,
      }
    ];
  }

  const categoriesWithImages = data.categories.filter(cat => !!cat.image_url);
  if (categoriesWithImages.length === 0) return [];

  const requested = String(metadata?.categoryRequested || '').toLowerCase().trim();
  if (requested) {
    const normalizedRequested = normalizeCategoryText(requested);
    const keywordCandidates = new Set<string>([requested]);
    if (CATEGORY_KEYWORDS[requested]) {
      CATEGORY_KEYWORDS[requested].forEach(k => keywordCandidates.add(k));
    }
    const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
      CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedRequested)
    );
    if (matchingKey) {
      keywordCandidates.add(matchingKey);
      CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
    }

    const match = categoriesWithImages.find(cat => {
      const normalizedName = normalizeCategoryText(cat.name);
      for (const candidate of keywordCandidates) {
        const normalizedCandidate = normalizeCategoryText(candidate);
        if (!normalizedCandidate) continue;
        if (normalizedName.includes(normalizedCandidate) || normalizedCandidate.includes(normalizedName)) {
          return true;
        }
      }
      return false;
    });
    if (!match?.image_url) return [];
    return [
      {
        type: 'send_media_url',
        media_url: match.image_url,
        media_type: 'image',
        caption: match.name,
      }
    ];
  }

  if (intent === 'WANT_CATEGORY') {
    return [];
  }

  return [];
}

// ═══════════════════════════════════════════════════════════════════════
// 🎨 FORMATAR CATEGORIA ESPECÍFICA (QUANDO CLIENTE ESCOLHE UMA CATEGORIA)
// ═══════════════════════════════════════════════════════════════════════

function findMatchingCategory(
  data: DeliveryData,
  categoryKeyword: string
): MenuCategory | null {
  const normalizedKeyword = normalizeCategoryText(categoryKeyword);
  const keywordCandidates = new Set<string>([categoryKeyword]);
  if (CATEGORY_KEYWORDS[categoryKeyword]) {
    CATEGORY_KEYWORDS[categoryKeyword].forEach(k => keywordCandidates.add(k));
  }
  const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
    CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedKeyword)
  );
  if (matchingKey) {
    keywordCandidates.add(matchingKey);
    CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
  }

  const match = data.categories.find(cat => {
    const catNameNormalized = normalizeCategoryText(cat.name);
    if (!catNameNormalized) return false;
    for (const candidate of keywordCandidates) {
      const normalizedCandidate = normalizeCategoryText(candidate);
      if (!normalizedCandidate) continue;
      if (catNameNormalized.includes(normalizedCandidate) || normalizedCandidate.includes(catNameNormalized)) {
        return true;
      }
    }
    return false;
  });

  return match || null;
}

export function formatCategoryAsBubbles(
  data: DeliveryData, 
  categoryKeyword: string
): string[] {
  const bubbles: string[] = [];
  const emoji = EMOJI_BY_TYPE[data.config.business_type] || '🍴';

  const normalizedKeyword = normalizeCategoryText(categoryKeyword);
  const keywordCandidates = new Set<string>([categoryKeyword]);
  if (CATEGORY_KEYWORDS[categoryKeyword]) {
    CATEGORY_KEYWORDS[categoryKeyword].forEach(k => keywordCandidates.add(k));
  }
  const matchingKey = Object.keys(CATEGORY_KEYWORDS).find(key =>
    CATEGORY_KEYWORDS[key].some(k => normalizeCategoryText(k) === normalizedKeyword)
  );
  if (matchingKey) {
    keywordCandidates.add(matchingKey);
    CATEGORY_KEYWORDS[matchingKey].forEach(k => keywordCandidates.add(k));
  }
  
  // Encontrar categorias que correspondem ao keyword
  const matchingCategories = data.categories.filter(cat => {
    const catNameNormalized = normalizeCategoryText(cat.name);
    if (!catNameNormalized) return false;

    if (catNameNormalized.includes(normalizedKeyword) || normalizedKeyword.includes(catNameNormalized)) {
      return true;
    }

    for (const candidate of keywordCandidates) {
      const normalizedCandidate = normalizeCategoryText(candidate);
      if (!normalizedCandidate) continue;
      if (catNameNormalized.includes(normalizedCandidate) || normalizedCandidate.includes(catNameNormalized)) {
        return true;
      }
    }

    return false;
  });
  
  if (matchingCategories.length === 0) {
    // Não encontrou a categoria, retorna mensagem amigável
    return [`Não encontrei essa categoria no cardápio. 🤔\n\nTemos:\n${data.categories.map(c => `• ${c.name}`).join('\n')}\n\nQual você gostaria de ver?`];
  }
  
  // Conta total de itens nas categorias encontradas
  const totalItems = matchingCategories.reduce((sum, cat) => sum + cat.items.length, 0);
  
  // Header
  let header = `${emoji} *${data.config.business_name.toUpperCase()}*\n`;
  header += `━━━━━━━━━━━━━━━━━━━━\n`;
  header += `📋 ${matchingCategories.map(c => c.name).join(', ')} (${totalItems} opções)\n`;
  
  bubbles.push(header);
  
  // Formatar cada categoria encontrada
  for (const category of matchingCategories) {
    let categoryBubble = `\n📁 *${category.name.toUpperCase()}*\n`;
    categoryBubble += `───────────────\n`;
    
    for (const item of category.items) {
      const highlight = item.is_highlight ? ' ⭐' : '';
      
      // Verificar se tem variações de tamanho
      const sizeOption = item.options?.find(opt => 
        opt.name.toLowerCase().includes('tamanho') || 
        opt.name.toLowerCase().includes('size')
      );
      
      let itemLine = '';
      if (sizeOption && sizeOption.options.length > 0) {
        // Mostrar item com variações de tamanho
        const prices = sizeOption.options.map(opt => 
          `${opt.name}: R$ ${opt.price.toFixed(2).replace('.', ',')}`
        ).join(' | ');
        itemLine = `• ${item.name}${highlight}\n  ${prices}\n`;
      } else {
        // Item sem variações - preço único
        const priceStr = `R$ ${item.price.toFixed(2).replace('.', ',')}`;
        itemLine = `• ${item.name}${highlight} - ${priceStr}\n`;
      }
      
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
  
  // Footer
  const footer = `\n━━━━━━━━━━━━━━━━━━━━\n✅ Qual você quer? É só me dizer! 😊`;
  
  // Adicionar footer à última bolha ou criar nova
  const lastBubble = bubbles[bubbles.length - 1];
  if ((lastBubble + footer).length <= MAX_CHARS_PER_BUBBLE) {
    bubbles[bubbles.length - 1] = lastBubble + footer;
  } else {
    bubbles.push(footer.trim());
  }
  
  console.log(`🍕 [DeliveryAI] Categoria "${categoryKeyword}" formatada em ${bubbles.length} bolhas (${totalItems} itens)`);
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
      Math.max(0, match.index! - 100), 
      Math.min(response.length, match.index! + 100)
    );
    const nearbyTextLower = nearbyText.toLowerCase();
    
    // Verificar se algum item do menu está mencionado
    let itemFound = false;
    for (const category of data.categories) {
      for (const item of category.items) {
        if (nearbyTextLower.includes(item.name.toLowerCase())) {
          // Coletar todos os preços válidos: preço base + variações
          const validPrices: number[] = [item.price];
          
          // Adicionar preços das variações (tamanhos como P, M, G)
          if (item.options && Array.isArray(item.options)) {
            for (const optionGroup of item.options) {
              if (optionGroup.options && Array.isArray(optionGroup.options)) {
                for (const opt of optionGroup.options) {
                  if (typeof opt.price === 'number' && opt.price > 0) {
                    validPrices.push(opt.price);
                  }
                }
              }
            }
          }
          
          // Verificar se o preço encontrado está na lista de preços válidos
          const isValidPrice = validPrices.some(vp => Math.abs(vp - foundPrice) < 0.01);
          
          if (!isValidPrice) {
            // Só reporta erro se o preço NÃO está em nenhuma variação
            errors.push(`Preço incorreto para ${item.name}: R$ ${foundPrice.toFixed(2)} (preços válidos: R$ ${validPrices.map(p => p.toFixed(2)).join(', R$ ')})`);
            // NÃO corrigir automaticamente - pode ser um tamanho diferente
            // O preço base só é usado se não há variações detectadas
            if (validPrices.length === 1) {
              corrected = corrected.replace(
                match[0],
                `R$ ${item.price.toFixed(2).replace('.', ',')}`
              );
            }
          } else {
            console.log(`✅ [PriceValidation] Preço R$ ${foundPrice.toFixed(2)} válido para ${item.name} (variação encontrada)`);
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
  conversationContext?: string,
  customerPhone?: string,
  conversationId?: string,
  conversationHistory?: Array<{ fromMe: boolean; text: string }>
): Promise<DeliveryAIResponse> {
  
  console.log(`🔥🔥🔥 [DEPLOY V2] generateDeliveryResponse iniciada - Intent: ${intent}`);
  
  // 🆕 LIMPAR CARRINHO SE FOR PRIMEIRA MENSAGEM DO CLIENTE (SEM HISTÓRICO)
  if (customerPhone && (!conversationHistory || conversationHistory.length === 0)) {
    console.log(`🛒 [DeliveryAI] Primeira mensagem detectada - limpando carrinho antigo`);
    clearCart(userId, customerPhone);
  }
  
  // Gerar conversationId único para o pedido (usado na criação do pedido)
  const effectiveConversationId = conversationId || `sim-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: CATEGORIA ESPECÍFICA (pizza, bebidas, etc)
  // Quando cliente diz apenas "pizza", mostra só as pizzas!
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'WANT_CATEGORY') {
    const category = detectCategoryFromMessage(message);
    console.log(`🍕 [DeliveryAI] Intent WANT_CATEGORY - mostrando apenas: ${category}`);
    
    if (category) {
      const matchedCategory = findMatchingCategory(deliveryData, category);
      const shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!matchedCategory?.image_url;
      const categoryBubbles = shouldImageOnly
        ? []
        : formatCategoryAsBubbles(deliveryData, category);
      return {
        intent: 'WANT_CATEGORY',
        bubbles: categoryBubbles,
        metadata: {
          categoryRequested: category,
          categoryImageUrl: matchedCategory?.image_url || null,
          categoryName: matchedCategory?.name || null,
        },
      };
    } else {
      // Se não conseguiu identificar a categoria, mostra menu completo
      const menuBubbles = formatMenuAsBubbles(deliveryData);
      return {
        intent: 'WANT_MENU',
        bubbles: menuBubbles,
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: MEIO A MEIO - Pizza dividida
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'HALF_HALF') {
    console.log(`🍕 [DeliveryAI] Intent HALF_HALF - pedido meio a meio`);
    
    // Detectar categoria do contexto ou mensagem
    let categoryContext = detectCategoryFromMessage(conversationContext || message);
    if (!categoryContext) {
      // Se não detectou, assume pizza (mais comum)
      categoryContext = 'pizza';
      console.log(`🍕 [DeliveryAI] Categoria não detectada, assumindo: ${categoryContext}`);
    }
    
    // Extrair os dois sabores da mensagem COM FILTRO DE CATEGORIA
    const halfHalfResult = parseHalfHalfOrder(message, deliveryData, categoryContext);
    
    if (halfHalfResult.success && halfHalfResult.items.length === 2) {
      const [item1, item2] = halfHalfResult.items;
      
      // 🔍 VERIFICAR SE OS ITENS TÊM VARIAÇÕES (TAMANHOS)
      // Buscar os itens completos do menu para verificar options
      const fullItem1 = findItemByNameFuzzy(deliveryData, item1.name, categoryContext);
      const fullItem2 = findItemByNameFuzzy(deliveryData, item2.name, categoryContext);
      
      // Verificar se algum tem variação de tamanho
      const hasVariations = (fullItem1?.options && fullItem1.options.length > 0) || 
                           (fullItem2?.options && fullItem2.options.length > 0);
      
      // Verificar se o tamanho já foi especificado na mensagem
      const sizeFromMessage = detectSizeFromMessage(message);
      
      console.log(`🔍 [DeliveryAI] Meio a meio - hasVariations: ${hasVariations}, sizeFromMessage: ${sizeFromMessage}`);
      
      // Se tem variações e o tamanho NÃO foi especificado, perguntar
      if (hasVariations && !sizeFromMessage) {
        // Montar lista de tamanhos disponíveis do primeiro item (assume mesmo para todos da categoria)
        const sizeOptions = fullItem1?.options?.find(opt => 
          opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
        );
        
        let sizesText = '';
        if (sizeOptions && sizeOptions.options) {
          sizesText = sizeOptions.options.map(opt => 
            `• *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
          ).join('\n');
        } else {
          // Fallback se não achar as opções
          sizesText = '• *Pequena (P)*\n• *Média (M)*\n• *Grande (G)*';
        }
        
        return {
          intent: 'HALF_HALF',
          bubbles: [
            `🍕 Ótima escolha! *${item1.name}* e *${item2.name}* meio a meio!\n\n📐 *Qual tamanho você prefere?*\n\n${sizesText}\n\nMe diz o tamanho que eu já monto seu pedido! 😊`
          ],
          metadata: {
            awaitingSize: true,
            halfHalfPending: {
              item1: item1.name,
              item2: item2.name,
              category: categoryContext
            }
          },
        };
      }
      
      // Tamanho especificado ou item sem variação - calcular preço
      let finalPrice = Math.max(item1.price, item2.price);
      let sizeLabel = '';
      
      // Se tem tamanho especificado, buscar o preço correto
      if (sizeFromMessage && fullItem1?.options) {
        const sizeOption = fullItem1.options.find(opt => 
          opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
        );
        if (sizeOption && sizeOption.options) {
          const selectedSize = sizeOption.options.find(opt => 
            opt.name.toLowerCase().includes(sizeFromMessage.toLowerCase()) ||
            (sizeFromMessage.toLowerCase() === 'p' && opt.name.toLowerCase().includes('pequen')) ||
            (sizeFromMessage.toLowerCase() === 'm' && opt.name.toLowerCase().includes('méd')) ||
            (sizeFromMessage.toLowerCase() === 'g' && opt.name.toLowerCase().includes('grand'))
          );
          if (selectedSize) {
            finalPrice = selectedSize.price;
            sizeLabel = ` (${selectedSize.name})`;
          }
        }
      }
      
      console.log(`💰 [DeliveryAI] Meio a meio: ${item1.name} + ${item2.name} = R$ ${finalPrice} ${sizeLabel}`);
      
      let cartSummary = '';
      if (customerPhone) {
        const halfHalfName = `${categoryContext.charAt(0).toUpperCase() + categoryContext.slice(1)} meio a meio: ${item1.name} + ${item2.name}${sizeLabel}`;
        const customItemId = `halfhalf:${normalizeTextForMatch(item1.name)}:${normalizeTextForMatch(item2.name)}:${normalizeTextForMatch(sizeLabel || 'base')}`;
        addCustomItemToCart(userId, customerPhone, {
          itemId: customItemId,
          name: halfHalfName,
          price: finalPrice,
          quantity: 1,
          notes: `Metade ${item1.name} + Metade ${item2.name}`,
          menuItemId: null,
        });
        const cart = getCart(userId, customerPhone);
        cartSummary = `\n\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
      }

      return {
        intent: 'HALF_HALF',
        bubbles: [
          `✅ Perfeito! ${categoryContext.charAt(0).toUpperCase() + categoryContext.slice(1)}${sizeLabel} meio a meio:\n\n🍕 *Metade ${item1.name}*\n🍕 *Metade ${item2.name}*\n\n💰 *Total: R$ ${finalPrice.toFixed(2).replace('.', ',')}*${hasVariations ? ' (cobrado o valor da mais cara no tamanho escolhido)' : ''}${cartSummary}\n\nQuer mais alguma coisa ou posso confirmar o pedido?`
        ],
        metadata: {
          halfHalfItems: halfHalfResult.items,
          halfHalfPrice: finalPrice,
          halfHalfSize: sizeFromMessage || null,
          categoryContext,
        },
      };
    } else {
      // Não conseguiu identificar os sabores
      const pizzaCat = deliveryData.categories.find(c => c.name.toLowerCase().includes(categoryContext || 'pizza'));
      const optionsList = pizzaCat ? pizzaCat.items.slice(0, 10).map(i => `• ${i.name}`).join('\n') : '';
      
      return {
        intent: 'HALF_HALF',
        bubbles: [
          `🍕 Ótimo, ${categoryContext} meio a meio! Quais dois sabores você quer?\n\nExemplo: "Calabresa e Mussarela"\n\n${pizzaCat ? `Alguns sabores de ${pizzaCat.name}:\n${optionsList}\n\n_...e mais opções no cardápio!_` : 'Veja o cardápio para escolher!'}`
        ],
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: CARDÁPIO COMPLETO - NÃO CHAMA IA
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'WANT_MENU') {
    console.log(`🍕 [DeliveryAI] Intent WANT_MENU - solicitando categoria antes do cardápio completo`);
    
    const categoryFromMessage = detectCategoryFromMessage(message);
    if (categoryFromMessage) {
      const matchedCategory = findMatchingCategory(deliveryData, categoryFromMessage);
      const shouldImageOnly = normalizeMenuSendMode(deliveryData.config.menu_send_mode) === 'image' && !!matchedCategory?.image_url;
      const categoryBubbles = shouldImageOnly
        ? []
        : formatCategoryAsBubbles(deliveryData, categoryFromMessage);
      return {
        intent: 'WANT_MENU',
        bubbles: categoryBubbles,
        metadata: {
          categoryRequested: categoryFromMessage,
          categoryImageUrl: matchedCategory?.image_url || null,
          categoryName: matchedCategory?.name || null,
        },
      };
    }
    
    const categoriesList = deliveryData.categories
      .map(cat => `• ${cat.name}`)
      .join('\n');
    
    const categoryPrompt = `Claro! Qual categoria você quer ver primeiro?\n\n${categoriesList}\n\nEx.: Pizza, Esfihas, Açaí, Bebidas.`;
    
    return {
      intent: 'WANT_MENU',
      bubbles: [categoryPrompt],
      metadata: {
        itemMentioned: undefined,
      },
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: SAUDAÇÃO - Envia boas-vindas e cardápio completo
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'GREETING') {
    const greeting = getTimeBasedGreeting();
    console.log(`🍕 [DeliveryAI] GREETING detectado - solicitando categoria antes do cardápio`);
    
    const categoriesList = deliveryData.categories
      .map(cat => `• ${cat.name}`)
      .join('\n');

    const historyName = getCustomerNameFromHistory(conversationHistory);
    const effectiveName = deliveryData.config.use_customer_name
      ? (historyName || 'Cliente')
      : 'Cliente';
    const defaultWelcomeTemplate = `${greeting}! 😊 Bem-vindo(a) ao *${deliveryData.config.business_name}*!`;
    const welcomeTemplate = deliveryData.config.welcome_message || defaultWelcomeTemplate;
    const welcomeTextRaw = interpolateDeliveryMessage(welcomeTemplate, {
      cliente_nome: effectiveName,
      nome: effectiveName,
      name: effectiveName,
    });
    const welcomeText = applyHumanization(welcomeTextRaw, deliveryData.config, true);
    const welcomeMessage = `${welcomeText}\n\nO que você deseja ver primeiro? Escolha uma categoria:\n${categoriesList}\n\nEx.: Pizza, Esfihas, Açaí, Bebidas.`;
    
    return {
      intent: 'GREETING',
      bubbles: [welcomeMessage],
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
    
    // ═══════════════════════════════════════════════════════════════════════
    // 🆕 VERIFICAR SE É RESPOSTA DE TAMANHO PENDENTE
    // Se a última mensagem do bot perguntou qual tamanho, buscar o item
    // mencionado nessa mensagem e completar o pedido
    // ═══════════════════════════════════════════════════════════════════════
    const lastBotMessage = conversationHistory?.filter(m => m.fromMe).slice(-1)[0];
    if (lastBotMessage) {
      const botMsgLower = lastBotMessage.text.toLowerCase();
      const isAwaitingSize = botMsgLower.includes('qual tamanho') || 
                             botMsgLower.includes('me diz o tamanho');
      
      if (isAwaitingSize) {
        // ═════════════════════════════════════════════════════════════════
        // 🍕 CASO ESPECIAL: PIZZA MEIO A MEIO PENDENTE
        // Pattern: "*Pizza Calabresa* e *Pizza Mussarela* meio a meio"
        // ═════════════════════════════════════════════════════════════════
        const isHalfHalfPending = botMsgLower.includes('meio a meio');
        if (isHalfHalfPending) {
          // Extrair os dois sabores: "*Pizza Calabresa* e *Pizza Mussarela*"
          const halfHalfMatch = lastBotMessage.text.match(/\*([^*]+)\*\s+e\s+\*([^*]+)\*/);
          if (halfHalfMatch) {
            const flavor1Name = halfHalfMatch[1].trim();
            const flavor2Name = halfHalfMatch[2].trim();
            
            console.log(`🍕 [DeliveryAI] Continuando MEIO A MEIO pendente: ${flavor1Name} + ${flavor2Name}`);
            
            // Buscar ambos os itens
            const item1 = findItemByNameFuzzy(deliveryData, flavor1Name);
            const item2 = findItemByNameFuzzy(deliveryData, flavor2Name);
            
            if (item1 && item2) {
              // Detectar tamanho da mensagem atual
              const sizeFromMsg = detectSizeFromMessage(message);
              
              if (sizeFromMsg) {
                const resolved1 = resolveMenuItemOptions(item1, message);
                const resolved2 = resolveMenuItemOptions(item2, message);
                const fallbackSizePrice = (menuItem: MenuItem): number | null => {
                  const sizeGroup = menuItem.options?.find(opt =>
                    opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
                  );
                  if (!sizeGroup || !sizeGroup.options?.length) return null;
                  const prices = sizeGroup.options.map(opt => opt.price).filter(p => typeof p === 'number');
                  if (prices.length === 0) return null;
                  const sorted = [...prices].sort((a, b) => a - b);
                  if (sizeFromMsg === 'P') return sorted[0];
                  if (sizeFromMsg === 'G') return sorted[sorted.length - 1];
                  if (sizeFromMsg === 'M') return sorted[Math.floor(sorted.length / 2)];
                  return null;
                };

                let price1 = resolved1.unitPrice;
                let price2 = resolved2.unitPrice;
                if (sizeFromMsg && price1 === item1.price) {
                  price1 = fallbackSizePrice(item1) ?? price1;
                }
                if (sizeFromMsg && price2 === item2.price) {
                  price2 = fallbackSizePrice(item2) ?? price2;
                }
                const sizeOpt1 = resolved1.optionsSelected.find(opt => /tamanho|size/i.test(opt.group));
                const sizeOpt2 = resolved2.optionsSelected.find(opt => /tamanho|size/i.test(opt.group));
                const sizeName = sizeOpt1?.option || sizeOpt2?.option || '';
                
                // Preço final: o maior dos dois
                const extractPrice = (text: string): number | null => {
                  const normalized = text.replace(/\./g, '').replace(',', '.');
                  const value = parseFloat(normalized);
                  return Number.isFinite(value) ? value : null;
                };
                const sizePriceFromPrompt = (() => {
                  const prompt = lastBotMessage.text;
                  const matchP = prompt.match(/Pequena\s*\(P\).*?R\$\s*([\d.,]+)/i);
                  const matchM = prompt.match(/M[eé]dia\s*\(M\).*?R\$\s*([\d.,]+)/i);
                  const matchG = prompt.match(/Grande\s*\(G\).*?R\$\s*([\d.,]+)/i);
                  if (sizeFromMsg === 'P' && matchP) return extractPrice(matchP[1]);
                  if (sizeFromMsg === 'M' && matchM) return extractPrice(matchM[1]);
                  if (sizeFromMsg === 'G' && matchG) return extractPrice(matchG[1]);
                  return null;
                })();
                const sizePriceFromMenu = (() => {
                  for (const category of deliveryData.categories) {
                    for (const menuItem of category.items) {
                      const sizeGroup = menuItem.options?.find(opt =>
                        opt.name.toLowerCase().includes('tamanho') || opt.name.toLowerCase().includes('size')
                      );
                      if (!sizeGroup || !sizeGroup.options?.length) continue;
                      for (const opt of sizeGroup.options) {
                        const optNameLower = opt.name.toLowerCase();
                        if ((sizeFromMsg === 'P' && (optNameLower.includes('pequen') || optNameLower === 'p')) ||
                            (sizeFromMsg === 'M' && (optNameLower.includes('médi') || optNameLower.includes('medi') || optNameLower === 'm')) ||
                            (sizeFromMsg === 'G' && (optNameLower.includes('grand') || optNameLower === 'g'))) {
                          const rawPrice = opt.price as unknown as string | number;
                          const parsedPrice = typeof rawPrice === 'number'
                            ? rawPrice
                            : parseFloat(String(rawPrice).replace(/\./g, '').replace(',', '.'));
                          return Number.isFinite(parsedPrice) ? parsedPrice : null;
                        }
                      }
                    }
                  }
                  return null;
                })();
                const fallbackSizePriceByLetter = sizeFromMsg === 'G'
                  ? 55
                  : sizeFromMsg === 'M'
                    ? 40
                    : sizeFromMsg === 'P'
                      ? 30
                      : null;
                const finalPrice = sizePriceFromPrompt ?? sizePriceFromMenu ?? fallbackSizePriceByLetter ?? Math.max(price1, price2);
                const displayName = `${item1.name} + ${item2.name} (${sizeName || sizeFromMsg})`;
                
                // Adicionar ao carrinho como item único (meio a meio)
                if (customerPhone) {
                  const halfHalfItem = {
                    ...item1,
                    name: displayName,
                    price: finalPrice,
                    id: `half-half-${item1.id}-${item2.id}`,
                  };
                  addToCart(userId, customerPhone, halfHalfItem, 1, {
                    displayName,
                    priceOverride: finalPrice,
                    notes: `Meio a meio: ${item1.name} + ${item2.name}`,
                    optionsSelected: [{ group: 'Tamanho', option: sizeName || sizeFromMsg }],
                    itemKeySuffix: `halfhalf-${sizeFromMsg}`,
                  });
                }
                
                const cart = customerPhone ? getCart(userId, customerPhone) : null;
                const subtotal = cart ? getCartSubtotal(cart) : finalPrice;
                const deliveryFee = deliveryData.config.delivery_fee;
                
                let response = `✅ Perfeito! Adicionado ao pedido:\n\n`;
                response += `• 1x ${displayName} - R$ ${finalPrice.toFixed(2).replace('.', ',')}\n`;
                
                if (cart) {
                  response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
                } else {
                  response += `\n💰 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
                  response += `\n🛵 Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
                  response += `\n\n💵 *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*`;
                }
                
                response += `\n\nDeseja mais alguma coisa? Para finalizar, me diga:\n📝 Nome\n📍 Endereço\n💳 Forma de pagamento`;
                
                return {
                  intent: 'ADD_ITEM',
                  bubbles: [response],
                  metadata: {
                    orderItems: [{ name: displayName, quantity: 1, price: finalPrice }],
                    subtotal,
                    deliveryFee,
                    total: subtotal + deliveryFee,
                    isHalfHalf: true,
                  },
                };
              }
            }
          }
        }
        // ═════════════════════════════════════════════════════════════════
        
        // Extrair o nome do item da mensagem anterior do bot
        // Pattern: "Boa escolha! *1x Pizza Frango Catupiry*!"
        const itemMatch = lastBotMessage.text.match(/\*(\d+)x\s+([^*]+)\*/);
        if (itemMatch) {
          const pendingQuantity = parseInt(itemMatch[1]) || 1;
          const pendingItemName = itemMatch[2].trim();
          
          console.log(`🍕 [DeliveryAI] Continuando pedido pendente: ${pendingQuantity}x ${pendingItemName}`);
          
          // Buscar o item no menu
          const menuItem = findItemByNameFuzzy(deliveryData, pendingItemName);
          if (menuItem) {
            // Resolver opções COM o tamanho da mensagem atual
            const resolved = resolveMenuItemOptions(menuItem, message);
            
            if (!resolved.needsSize) {
              // Tamanho foi detectado! Adicionar ao carrinho
              if (customerPhone) {
                const optionsKey = resolved.optionsSelected
                  .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
                  .join('|');
                addToCart(userId, customerPhone, menuItem, pendingQuantity, {
                  displayName: resolved.displayName,
                  priceOverride: resolved.unitPrice,
                  notes: resolved.notes,
                  optionsSelected: resolved.optionsSelected,
                  itemKeySuffix: optionsKey || undefined,
                });
              }
              
              const itemTotal = resolved.unitPrice * pendingQuantity;
              const cart = customerPhone ? getCart(userId, customerPhone) : null;
              const subtotal = cart ? getCartSubtotal(cart) : itemTotal;
              const deliveryFee = deliveryData.config.delivery_fee;
              
              let response = `✅ Perfeito! Adicionado ao pedido:\n\n`;
              response += `• ${pendingQuantity}x ${resolved.displayName} - R$ ${itemTotal.toFixed(2).replace('.', ',')}\n`;
              
              if (cart) {
                response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
              } else {
                response += `\n💰 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
                response += `\n🛵 Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
                response += `\n\n💵 *Total: R$ ${(subtotal + deliveryFee).toFixed(2).replace('.', ',')}*`;
              }
              
              const deliveryOptions = [];
              if (deliveryData.config.accepts_delivery) deliveryOptions.push('🛵 Delivery');
              if (deliveryData.config.accepts_pickup) deliveryOptions.push('🏪 Retirada');
              const deliveryTypeLine = deliveryOptions.length > 0
                ? `🚚 Tipo de entrega: ${deliveryOptions.join(' ou ')}`
                : '🚚 Tipo de entrega';
              
              response += `\n\nDeseja mais alguma coisa? Posso sugerir *Borda Recheada* ou *Refrigerante*.\n\nPara finalizar, me diga:\n📝 Nome\n${deliveryTypeLine}\n📍 Endereço (se for entrega)\n💳 Forma de pagamento`;
              
              return {
                intent: 'ADD_ITEM',
                bubbles: [response],
                metadata: {
                  orderItems: [{ name: resolved.displayName, quantity: pendingQuantity, price: resolved.unitPrice }],
                  subtotal,
                  deliveryFee,
                  total: subtotal + deliveryFee,
                },
              };
            }
          }
        }
      }
    }
    // ═══════════════════════════════════════════════════════════════════════
    
    // 🧠 DETECTAR CONTEXTO: Qual categoria o cliente estava vendo?
    let categoryContext = detectCategoryContext(conversationHistory, deliveryData);
    
    const categoryMap: Record<string, string> = {
      pizza: 'Pizza',
      esfirra: 'Esfiha',
      bebida: 'Bebida',
      'açaí': 'Açaí',
      borda: 'Borda',
    };

    const messageCategoryKey = detectCategoryFromMessage(message);
    if (messageCategoryKey) {
      categoryContext = categoryMap[messageCategoryKey] || categoryContext;
    }
    
    if (!categoryContext) {
      const msgLower = message.toLowerCase();
      if (msgLower.includes('pizza')) {
        categoryContext = 'Pizza';
      } else if (msgLower.includes('esfiha') || msgLower.includes('esfirra')) {
        categoryContext = 'Esfiha';
      } else if (msgLower.includes('bebida') || msgLower.includes('refrigerante') || msgLower.includes('refri')) {
        categoryContext = 'Bebida';
      } else if (msgLower.includes('borda')) {
        categoryContext = 'Borda';
      }
    }
    
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
    const itemsNeedingSize: Array<{ name: string; quantity: number; options: Array<{ name: string; price: number }> }> = [];
    
    for (const parsed of parsedItems) {
      const itemCategoryKey = detectCategoryFromMessage(parsed.name);
      const itemCategoryContext = itemCategoryKey
        ? (categoryMap[itemCategoryKey] || categoryContext)
        : categoryContext;
      const menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
      
      if (menuItem) {
        const resolved = resolveMenuItemOptions(menuItem, message);
        if (resolved.needsSize) {
          itemsNeedingSize.push({
            name: menuItem.name,
            quantity: parsed.quantity,
            options: resolved.sizeOptions || [],
          });
          continue;
        }
        if (customerPhone) {
          const optionsKey = resolved.optionsSelected
            .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
            .join('|');
          addToCart(userId, customerPhone, menuItem, parsed.quantity, {
            displayName: resolved.displayName,
            priceOverride: resolved.unitPrice,
            notes: resolved.notes,
            optionsSelected: resolved.optionsSelected,
            itemKeySuffix: optionsKey || undefined,
          });
        }
        addedItems.push({
          name: resolved.displayName,
          quantity: parsed.quantity,
          price: resolved.unitPrice,
          total: resolved.unitPrice * parsed.quantity,
        });
      } else {
        notFoundItems.push(parsed.name);
      }
    }
    
    if (itemsNeedingSize.length > 0) {
      const item = itemsNeedingSize[0];
      const sizesText = item.options.map((opt: any) => 
        `• *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
      ).join('\n');
      
      return {
        intent: 'WANT_TO_ORDER',
        bubbles: [
          `🍕 Boa escolha! *${item.quantity}x ${item.name}*!\n\n📐 *Qual tamanho você quer?*\n\n${sizesText}\n\nMe diz o tamanho! 😊`
        ],
        metadata: {
          awaitingSize: true,
          pendingItem: {
            name: item.name,
            quantity: item.quantity
          }
        },
      };
    }
    
    if (addedItems.length === 0) {
      return {
        intent,
        bubbles: [`Hmm, não encontrei "${parsedItems[0]?.name || ''}" no cardápio 🤔 Quer ver as opções?`],
      };
    }
    
    const cart = customerPhone ? getCart(userId, customerPhone) : null;
    const subtotal = cart ? getCartSubtotal(cart) : addedItems.reduce((sum, item) => sum + item.total, 0);
    const deliveryFee = deliveryData.config.delivery_fee;
    const total = subtotal + deliveryFee;
    
    let response = `✅ Adicionado ao pedido:\n\n`;
    for (const item of addedItems) {
      response += `• ${item.quantity}x ${item.name} - R$ ${item.total.toFixed(2).replace('.', ',')}\n`;
    }
    
    if (notFoundItems.length > 0) {
      response += `\n⚠️ Não encontrei: ${notFoundItems.join(', ')}\n`;
    }
    
    if (cart) {
      response += `\n${formatCartSummary(cart, deliveryData.config.delivery_fee)}`;
    } else {
      response += `\n💰 Subtotal: R$ ${subtotal.toFixed(2).replace('.', ',')}`;
      response += `\n🛵 Taxa de entrega: R$ ${deliveryFee.toFixed(2).replace('.', ',')}`;
      response += `\n\n💵 *Total: R$ ${total.toFixed(2).replace('.', ',')}*`;
    }
    
    const deliveryOptions = [];
    if (deliveryData.config.accepts_delivery) deliveryOptions.push('🛵 Delivery');
    if (deliveryData.config.accepts_pickup) deliveryOptions.push('🏪 Retirada');
    const deliveryTypeLine = deliveryOptions.length > 0
      ? `🚚 Tipo de entrega: ${deliveryOptions.join(' ou ')}`
      : '🚚 Tipo de entrega';
    
    response += `\n\nDeseja mais alguma coisa? Posso sugerir *Borda Recheada* ou *Refrigerante*.\n\nPara finalizar, me diga:\n📝 Nome\n${deliveryTypeLine}\n📍 Endereço (se for entrega)\n💳 Forma de pagamento`;
    
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
  // CASO ESPECIAL: CONFIRMAÇÃO FINAL DO PEDIDO (sim após ver o resumo)
  // Este check DEVE vir ANTES do handler de CONFIRM_ORDER
  // Quando o cliente responde "sim" após ver o resumo completo com "Confirma o pedido?"
  // ═══════════════════════════════════════════════════════════════════════
  const isConfirmingFinalOrder = conversationContext && 
    conversationContext.toLowerCase().includes('confirma o pedido') &&
    message.toLowerCase().match(/^(sim|confirmo|confirma|ok|pode|manda|vai|isso|certo|certeza|confirmar|ss|sss|siiim|siim)$/i);
  
  if (isConfirmingFinalOrder) {
    console.log(`✅ [DeliveryAI] Cliente CONFIRMOU o pedido FINAL - criando no banco`);
    
    // Extrair dados do RESUMO que estava no contexto
    // O resumo contém linhas como "👤 *Nome:* Carlos Eduardo"
    const ctx = conversationContext!;
    const info: CustomerInfo = {};
    
    // Extrair Nome do resumo
    const nameMatch = ctx.match(/\*Nome:\*\s*([^\n]+)/i);
    if (nameMatch) {
      info.customerName = nameMatch[1].trim();
      console.log(`📝 [DeliveryAI] Nome extraído do resumo: "${info.customerName}"`);
    }
    
    // Extrair Endereço do resumo
    const addressMatch = ctx.match(/\*Endereço:\*\s*([^\n]+)/i);
    if (addressMatch) {
      info.customerAddress = addressMatch[1].trim();
      console.log(`📝 [DeliveryAI] Endereço extraído do resumo: "${info.customerAddress}"`);
    }
    
    // Extrair Pagamento do resumo
    const paymentMatch = ctx.match(/\*Pagamento:\*\s*([^\n]+)/i);
    if (paymentMatch) {
      info.paymentMethod = paymentMatch[1].trim();
      console.log(`📝 [DeliveryAI] Pagamento extraído do resumo: "${info.paymentMethod}"`);
    }
    
    // Extrair Tipo de entrega do resumo
    if (ctx.toLowerCase().includes('*tipo:* delivery')) {
      info.deliveryType = 'delivery';
    } else if (ctx.toLowerCase().includes('*tipo:* retirada') || ctx.toLowerCase().includes('retirada no local')) {
      info.deliveryType = 'pickup';
    }
    
    console.log(`📝 [DeliveryAI] Info extraída do resumo:`, info);
    
    try {
      if (!customerPhone) {
        return {
          intent: 'PROVIDE_CUSTOMER_INFO',
          bubbles: [
            `❌ Não consegui identificar seu telefone para finalizar o pedido. Pode me informar novamente?`
          ],
          metadata: { error: true, errorMessage: 'missing_customer_phone' },
        };
      }
      const deliveryType = info.deliveryType || (deliveryData.config.accepts_delivery ? 'delivery' : 'pickup');
      const orderResult = await confirmAndCreateOrder(
        userId,
        customerPhone,
        info.customerName || 'Cliente',
        deliveryType,
        info.paymentMethod || 'Dinheiro',
        info.customerAddress || null,
        deliveryData,
        effectiveConversationId
      );

      if (!orderResult.success || !orderResult.orderId) {
        return {
          intent: 'PROVIDE_CUSTOMER_INFO',
          bubbles: [
            `❌ Ops! Não consegui confirmar seu pedido. ${orderResult.error || 'Tente novamente.'}`
          ],
          metadata: {
            error: true,
            errorMessage: orderResult.error,
          },
        };
      }
      const historyName = getCustomerNameFromHistory(conversationHistory);
      const effectiveName = deliveryData.config.use_customer_name
        ? (info.customerName || historyName || 'Cliente')
        : 'Cliente';
      const confirmationTemplate = deliveryData.config.order_confirmation_message || '';
      const confirmationIntroRaw = confirmationTemplate
        ? interpolateDeliveryMessage(confirmationTemplate, {
            cliente_nome: effectiveName,
            nome: effectiveName,
            name: effectiveName,
            pedido_numero: String(orderResult.orderId),
            total: orderResult.total ? `R$ ${orderResult.total.toFixed(2).replace('.', ',')}` : '',
            tempo_estimado: `${deliveryData.config.estimated_delivery_time} minutos`,
          })
        : '';
      const confirmationIntro = confirmationIntroRaw
        ? applyHumanization(confirmationIntroRaw, deliveryData.config, true)
        : '';
      const summaryMessage = `✅ *Pedido confirmado com sucesso!*\n\n🎫 *Número do pedido:* #${orderResult.orderId}\n\n📝 *Nome:* ${info.customerName || effectiveName}\n${deliveryType === 'delivery' ? `📍 *Endereço:* ${info.customerAddress}\n` : '🏃 *Retirada no local*\n'}💳 *Pagamento:* ${info.paymentMethod}\n\n⏱️ *Previsão:* ${deliveryData.config.estimated_delivery_time} minutos\n\n🍕 Seu pedido já foi enviado para a cozinha! Obrigado pela preferência! 😊`;
      const finalMessage = confirmationIntro
        ? `${confirmationIntro}\n\n${summaryMessage}`
        : summaryMessage;

      return {
        intent: 'FINALIZE_ORDER',
        bubbles: [
          finalMessage
        ],
        metadata: {
          orderCreated: true,
          orderId: orderResult.orderId,
          customerInfo: info,
        },
      };
    } catch (error) {
      console.error(`❌ [DeliveryAI] Erro ao criar pedido:`, error);
      return {
        intent: 'PROVIDE_CUSTOMER_INFO',
        bubbles: [
          `❌ Ops! Tive um problema ao criar seu pedido. Por favor, tente novamente ou entre em contato com o atendente.`
        ],
        metadata: {
          error: true,
          errorMessage: String(error),
        },
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: NEGAÇÃO DA CONFIRMAÇÃO FINAL
  // Quando o cliente responde "não" após ver o resumo
  // ═══════════════════════════════════════════════════════════════════════
  const isDenyingFinalOrder = conversationContext && 
    conversationContext.toLowerCase().includes('confirma o pedido') &&
    message.toLowerCase().match(/^(n[aã]o|nope|cancela|cancelar|desisto|mudei de ideia)$/i);
  
  if (isDenyingFinalOrder) {
    return {
      intent: 'CANCEL_ORDER',
      bubbles: [
        `❌ Pedido cancelado!\n\nSe quiser alterar alguma informação ou fazer um novo pedido, é só me avisar! 😊`
      ],
      metadata: {
        cancelled: true,
        reason: 'user_declined',
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: CONFIRMAÇÃO DE PEDIDO (início - sem resumo ainda)
  // Cliente confirmou o pedido (sim, ok, confirmo, pode mandar, etc)
  // Agora precisa coletar: NOME, TIPO (delivery/retirada), ENDEREÇO, PAGAMENTO
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'CONFIRM_ORDER') {
    console.log(`✅ [DeliveryAI] Intent CONFIRM_ORDER - pedindo dados do cliente`);
    
    const deliveryOptions = [];
    if (deliveryData.config.accepts_delivery) deliveryOptions.push('🛵 Delivery');
    if (deliveryData.config.accepts_pickup) deliveryOptions.push('🏃 Retirada no local');
    
    return {
      intent: 'CONFIRM_ORDER',
      bubbles: [
        `✅ Ótimo! Para finalizar seu pedido, preciso de algumas informações:\n\n📝 *Seu nome completo*\n\n🚚 *Tipo de entrega:* ${deliveryOptions.join(' ou ')}\n\n${deliveryData.config.accepts_delivery ? '📍 *Endereço* (se for delivery): rua, número, bairro\n\n' : ''}💳 *Forma de pagamento:* ${deliveryData.config.payment_methods.join(', ')}\n\nPode me enviar tudo junto ou separado! 😊`
      ],
      metadata: {
        awaitingCustomerInfo: true,
      },
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: INFORMAÇÕES DO CLIENTE
  // Cliente forneceu nome, endereço, tipo de entrega e/ou forma de pagamento
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'PROVIDE_CUSTOMER_INFO' || (conversationContext && conversationContext.toLowerCase().includes('seu nome') && conversationContext.toLowerCase().includes('forma de pagamento'))) {
    console.log(`📝 [DeliveryAI] Cliente fornecendo dados - extraindo informações`);
    
    // IMPORTANTE: Recuperar informações parciais já coletadas anteriormente
    // Isso permite coletar dados em múltiplas mensagens
    let existingInfo: CustomerInfo = {};
    
    // Tentar extrair info existente do contexto da conversa anterior
    // Procurar por padrões no contexto que indicam dados já coletados
    if (conversationContext) {
      const lines = conversationContext.split('\n');
      
      // Capturar delivery type e pagamento APENAS a partir de mensagens do cliente
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        if (lower.startsWith('cliente:') || lower.startsWith('client:') || lower.startsWith('customer:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          if (!existingInfo.deliveryType) {
            if (/\b(retirada|retirar|retiro|buscar|busco|pegar|pego|no local|balc[aã]o)\b/i.test(contentLower)) {
              existingInfo.deliveryType = 'pickup';
            } else if (/\b(delivery|entrega|mandar|enviar|levar)\b/i.test(contentLower)) {
              existingInfo.deliveryType = 'delivery';
            }
          }
          
          if (!existingInfo.paymentMethod) {
            const paymentMatch = content.match(/\b(pix|dinheiro|cart[aã]o|d[eé]bito|cr[eé]dito|cartão|cartao)\b/i);
            if (paymentMatch) {
              const paymentMap: Record<string, string> = {
                'pix': 'Pix',
                'dinheiro': 'Dinheiro',
                'cartao': 'Cartao',
                'cartão': 'Cartao',
                'debito': 'Cartao',
                'débito': 'Cartao',
                'credito': 'Cartao',
                'crédito': 'Cartao',
              };
              existingInfo.paymentMethod = paymentMap[paymentMatch[1].toLowerCase()] || 'Dinheiro';
            }
          }
        }
      }
      
      // IMPORTANTE: Buscar endereço no contexto (mensagens anteriores do cliente)
      // Dividir contexto em linhas e procurar mensagens do cliente que parecem endereço
      console.log(`📝 [DeliveryAI] Buscando endereço no contexto...`);
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        // Só considerar mensagens do cliente
        if (lower.startsWith('cliente:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          // Verificar se parece endereço (tem palavra de logradouro OU padrão texto,número)
          const isAddress = (
            /\b(rua|av|avenida|alameda|travessa|estrada|praça|praca)\b/i.test(contentLower) ||
            /[a-záàâãéèêíïóôõöúç\s]+,\s*\d+/i.test(contentLower)
          );
          
          // Só verificar se NÃO é nome ou greeting (pagamento pode vir junto com endereço!)
          const hasNumber = /\d/.test(content);
          const notName = !/\b(meu nome|me chamo|sou o|sou a)\b/i.test(contentLower);
          const notGreeting = !/\b(oi|olá|bom dia|boa tarde|boa noite|quero|gostaria)\b/i.test(contentLower);
          const minLength = content.length >= 8;
          
          if (isAddress && hasNumber && notName && notGreeting && minLength) {
            // Extrair apenas a parte do endereço (remover pagamento/entrega)
            let addressPart = content
              .replace(/\b(pix|dinheiro|cart[aã]o|credito|d[eé]bito)\b/gi, '')
              .replace(/\b(entrega|delivery|retirada|retirar)\b/gi, '')
              .trim()
              .replace(/^[\s,]+|[\s,]+$/g, ''); // Remove espaços e vírgulas nas pontas
            
            if (addressPart.length >= 5) {
              existingInfo.customerAddress = addressPart;
              console.log(`📝 [DeliveryAI] ✅ Endereço recuperado do contexto: "${addressPart}"`);
              break;
            }
          }
        }
      }
      
      // Buscar nome no contexto se a IA já perguntou
      // Procurar mensagens do cliente que vêm DEPOIS de perguntas de nome
      let foundNameQuestion = false;
      for (const line of lines) {
        const lower = line.toLowerCase().trim();
        
        // Marcar quando encontramos pergunta de nome
        if (lower.startsWith('você:') && (lower.includes('nome') || lower.includes('qual seu'))) {
          foundNameQuestion = true;
          continue;
        }
        
        // Se já encontrou a pergunta do nome, procurar resposta do cliente
        if (foundNameQuestion && lower.startsWith('cliente:')) {
          const content = line.substring(line.indexOf(':') + 1).trim();
          const contentLower = content.toLowerCase();
          
          // Verificar se parece nome (sem números, sem palavras de endereço/pagamento)
          const notAddress = !/\b(rua|av|avenida|alameda|travessa|estrada|praça|bairro)\b/i.test(contentLower);
          const notPayment = !/\b(pix|dinheiro|cartao|cartão)\b/i.test(contentLower);
          const noNumber = !/\d/.test(content);
          const isName = /^[a-záàâãéèêíïóôõöúçñ\s]{2,50}$/i.test(content);
          
          if (notAddress && notPayment && noNumber && isName) {
            existingInfo.customerName = content;
            console.log(`📝 [DeliveryAI] ✅ Nome recuperado do contexto: "${content}"`);
            break;
          }
          // Resetar após encontrar resposta do cliente (pode ter outra pergunta de nome depois)
          foundNameQuestion = false;
        }
      }
    }
    
    // Extrair informações da mensagem atual, combinando com existentes
    const info = extractCustomerInfo(message, conversationContext || '', existingInfo);
    
    // Verificar se tem todas as informações mínimas
    const hasName = info.customerName && info.customerName.length > 2;
    const hasPayment = info.paymentMethod && deliveryData.config.payment_methods.some(pm => 
      pm.toLowerCase().includes(info.paymentMethod!.toLowerCase()) || 
      info.paymentMethod!.toLowerCase().includes(pm.toLowerCase())
    );
    const hasDeliveryType = info.deliveryType !== undefined;
    
    // CORREÇÃO: Só precisa de endereço se for DELIVERY
    let needsAddress = false;
    if (info.deliveryType === 'delivery') {
      needsAddress = true;
    } else if (info.deliveryType === 'pickup') {
      needsAddress = false;
    } else if (!hasDeliveryType) {
      // Se o tipo não foi definido, só precisa de endereço se aceitar delivery
      // e NÃO aceitar pickup (ou seja, delivery é a única opção)
      needsAddress = deliveryData.config.accepts_delivery && !deliveryData.config.accepts_pickup;
    }
    
    const hasAddress = info.customerAddress && info.customerAddress.length > 5;
    
    console.log(`📝 [DeliveryAI] Dados extraídos:`, {
      hasName,
      hasPayment,
      hasDeliveryType,
      needsAddress,
      hasAddress,
      info
    });
    
    // Se falta alguma informação, perguntar ESPECIFICAMENTE o que falta
    const missing: string[] = [];
    const missingFields: string[] = [];
    
    if (!hasName) {
      missing.push('📝 *Seu nome completo*');
      missingFields.push('name');
    }
    if (!hasDeliveryType) {
      const options = [];
      if (deliveryData.config.accepts_delivery) options.push('🛵 Delivery');
      if (deliveryData.config.accepts_pickup) options.push('🏃 Retirada');
      missing.push(`🚚 *Tipo de entrega:* ${options.join(' ou ')}`);
      missingFields.push('deliveryType');
    }
    if (needsAddress && !hasAddress) {
      missing.push('📍 *Endereço completo* (rua, número, bairro)');
      missingFields.push('address');
    }
    if (!hasPayment) {
      missing.push(`💳 *Forma de pagamento:* ${deliveryData.config.payment_methods.join(', ')}`);
      missingFields.push('payment');
    }
    
    if (missing.length > 0) {
      // Mensagem mais amigável dependendo do que falta
      let responseMsg = '';
      
      if (missing.length === 1) {
        // Só falta 1 campo - perguntar diretamente
        if (missingFields[0] === 'name') {
          responseMsg = `📝 Qual seu *nome completo*?`;
        } else if (missingFields[0] === 'deliveryType') {
          const options = [];
          if (deliveryData.config.accepts_delivery) options.push('🛵 Delivery');
          if (deliveryData.config.accepts_pickup) options.push('🏃 Retirada no local');
          responseMsg = `🚚 Você prefere *${options.join(' ou ')}*?`;
        } else if (missingFields[0] === 'address') {
          responseMsg = `📍 Qual seu *endereço completo*? (rua, número, bairro)`;
        } else if (missingFields[0] === 'payment') {
          responseMsg = `💳 Qual a *forma de pagamento*? (${deliveryData.config.payment_methods.join(', ')})`;
        }
      } else {
        // Faltam múltiplos campos
        responseMsg = `Quase lá! Só preciso de mais algumas informações:\n\n${missing.join('\n\n')}\n\nPode me enviar! 😊`;
      }
      
      return {
        intent: 'PROVIDE_CUSTOMER_INFO',
        bubbles: [responseMsg],
        metadata: {
          partialInfo: info,
          missingFields: missingFields,
          awaitingInfo: true,
        },
      };
    }
    
    // ═══════════════════════════════════════════════════════════════════════
    // TODAS AS INFORMAÇÕES COLETADAS - MOSTRAR RESUMO E PEDIR CONFIRMAÇÃO
    // ═══════════════════════════════════════════════════════════════════════
    console.log(`✅ [DeliveryAI] Todas informações coletadas - mostrando resumo para confirmação`);
    
    const cart = customerPhone ? getCart(userId, customerPhone) : null;
    if (!cart || cart.items.size === 0) {
      return {
        intent: 'WANT_TO_ORDER',
        bubbles: [
          `🛒 Seu pedido está vazio. Me diga o que você gostaria de pedir!`
        ],
      };
    }

    const subtotal = getCartSubtotal(cart);
    const deliveryFee = info.deliveryType === 'delivery' ? deliveryData.config.delivery_fee : 0;
    const total = subtotal + deliveryFee;
    
    // Montar resumo do pedido
    let resumo = `📋 *RESUMO DO SEU PEDIDO:*\n\n`;
    resumo += `👤 *Nome:* ${info.customerName}\n`;
    if (info.deliveryType === 'delivery') {
      resumo += `📍 *Endereço:* ${info.customerAddress}\n`;
      resumo += `🛵 *Tipo:* Delivery\n`;
    } else {
      resumo += `🏃 *Tipo:* Retirada no local\n`;
    }
    resumo += `💳 *Pagamento:* ${info.paymentMethod}\n\n`;
    resumo += `💰 *Subtotal:* R$ ${subtotal.toFixed(2).replace('.', ',')}\n`;
    if (info.deliveryType === 'delivery') {
      resumo += `🛵 *Taxa de entrega:* R$ ${deliveryFee.toFixed(2).replace('.', ',')}\n`;
    }
    resumo += `\n💵 *TOTAL: R$ ${total.toFixed(2).replace('.', ',')}*\n\n`;
    resumo += `⏱️ *Previsão:* ${deliveryData.config.estimated_delivery_time} minutos\n\n`;
    resumo += `✅ *Confirma o pedido?* (responda "sim" para confirmar ou "não" para cancelar)`;
    
    return {
      intent: 'PROVIDE_CUSTOMER_INFO',
      bubbles: [resumo],
      metadata: {
        awaitingConfirmation: true,
        customerInfo: info,
        subtotal,
        deliveryFee,
        total,
      },
    };
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // CASO ESPECIAL: CANCELAMENTO DE PEDIDO
  // Respeita a configuração accepts_cancellation
  // ═══════════════════════════════════════════════════════════════════════
  if (intent === 'CANCEL_ORDER') {
    console.log(`🍕 [DeliveryAI] Intent CANCEL_ORDER - verificando config accepts_cancellation: ${deliveryData.config.accepts_cancellation}`);
    
    if (deliveryData.config.accepts_cancellation) {
      // Cancelamento permitido
      return {
        intent: 'CANCEL_ORDER',
        bubbles: [
          `❌ Pedido cancelado com sucesso!\n\nSe mudar de ideia, é só me chamar novamente. 😊`
        ],
        metadata: {
          cancelled: true,
        },
      };
    } else {
      // Cancelamento NÃO permitido pela configuração
      return {
        intent: 'CANCEL_ORDER',
        bubbles: [
          `⚠️ Infelizmente não é possível cancelar o pedido por aqui.\n\nPara cancelamentos, entre em contato diretamente com o estabelecimento ou aguarde uma resposta do atendente. 📞`
        ],
        metadata: {
          cancelled: false,
          reason: 'cancellation_not_allowed',
        },
      };
    }
  }
  
  // ═══════════════════════════════════════════════════════════════════════
  // OUTROS CASOS: USA IA COM CONTEXTO MÍNIMO
  // ═══════════════════════════════════════════════════════════════════════
  
  const mistral = await getLLMClient();
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
  
  // Lista de TODOS os nomes de itens para validação
  const allItemNames = deliveryData.categories
    .flatMap(cat => cat.items.map(item => item.name.toLowerCase()));
  
  const systemPrompt = `Você é um atendente simpático da ${deliveryData.config.business_name}.

⚠️ REGRAS CRÍTICAS - SIGA À RISCA:

1. CARDÁPIO COMPLETO (APENAS ESTES ITENS EXISTEM):
${itemList}

2. ITENS QUE NÃO EXISTEM (NUNCA MENCIONE):
   - Batata frita, batata, fritas
   - Onion rings, nuggets
   - Milk shake, sorvete
   - Qualquer item NÃO listado acima

3. SE O CLIENTE PEDIR ALGO QUE NÃO TEM:
   Responda: "Infelizmente não temos [item]. Nosso cardápio tem: [listar itens]"

4. AO CONFIRMAR PEDIDO:
   - Use APENAS preços do cardápio acima
   - Calcule: Subtotal + Taxa entrega (R$ ${deliveryData.config.delivery_fee.toFixed(2)}) = Total
   - NUNCA invente valores

5. INFORMAÇÕES DE ENTREGA:
   - Taxa: R$ ${deliveryData.config.delivery_fee.toFixed(2)}
   - Tempo: ~${deliveryData.config.estimated_delivery_time} min
   - Pedido mínimo: R$ ${deliveryData.config.min_order_value.toFixed(2)}
   - Pagamento: ${deliveryData.config.payment_methods.join(', ')}

6. SEJA BREVE: máximo 2-3 frases. Use emojis com moderação.

7. SE NÃO SOUBER: pergunte ao cliente ou diga que vai verificar.`;

  try {
    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ],
      temperature: 0.2, // Muito baixa para ser mais determinístico
      maxTokens: 300,   // Respostas curtas
    });
    
    let aiResponse = response.choices?.[0]?.message?.content || '';
    if (typeof aiResponse !== 'string') {
      aiResponse = String(aiResponse);
    }
    
    // VALIDAÇÃO 1: Verificar se inventou itens
    const inventedItems = detectInventedItems(aiResponse, allItemNames);
    if (inventedItems.length > 0) {
      console.log(`🚨 [DeliveryAI] IA INVENTOU ITENS: ${inventedItems.join(', ')}`);
      // Corrigir a resposta
      aiResponse = `Nosso cardápio tem:\n${itemList}\n\nO que você gostaria de pedir? 😊`;
    }
    
    // VALIDAÇÃO 2: Validar preços na resposta
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
// 🚨 DETECTAR ITENS INVENTADOS PELA IA
// ═══════════════════════════════════════════════════════════════════════

function detectInventedItems(response: string, validItems: string[]): string[] {
  const inventedItems: string[] = [];
  const responseLower = response.toLowerCase();
  
  // Lista de itens comuns que IA pode inventar
  const commonInventions = [
    'batata frita', 'batata', 'fritas', 'french fries',
    'onion rings', 'anéis de cebola',
    'nuggets', 'chicken nuggets',
    'milk shake', 'milkshake', 'shake',
    'sorvete', 'sundae',
    'combo', 'promoção',
    'pizza', 'hot dog', 'cachorro quente',
    'cheddar', 'bacon extra', // a menos que exista
  ];
  
  for (const invention of commonInventions) {
    // Verifica se a IA mencionou o item inventado
    if (responseLower.includes(invention)) {
      // Verifica se NÃO é um item válido do cardápio
      const isValid = validItems.some(valid => 
        valid.includes(invention) || invention.includes(valid)
      );
      
      if (!isValid) {
        inventedItems.push(invention);
      }
    }
  }
  
  return inventedItems;
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
// � PARSE DE PIZZA MEIO A MEIO
// ═══════════════════════════════════════════════════════════════════════

interface HalfHalfResult {
  success: boolean;
  items: Array<{ name: string; price: number; category: string }>;
  errorMessage?: string;
}

export function parseHalfHalfOrder(message: string, deliveryData: DeliveryData, categoryContext?: string): HalfHalfResult {
  const lowerMsg = message.toLowerCase();
  
  // Detectar categoria do contexto (pizza, esfirra, etc)
  let categoryFilter = categoryContext;
  if (!categoryFilter) {
    // Tentar detectar da mensagem
    if (lowerMsg.includes('pizza')) categoryFilter = 'pizza';
    else if (lowerMsg.includes('esfirra') || lowerMsg.includes('esfiha')) categoryFilter = 'esfirra';
    else if (lowerMsg.includes('hamburguer') || lowerMsg.includes('lanche')) categoryFilter = 'hamburguer';
  }
  
  console.log(`🍕 [DeliveryAI] parseHalfHalfOrder - categoria: ${categoryFilter || 'TODAS'}`);
  
  // Padrões para extrair dois sabores:
  // "meio a meio calabresa e mussarela"
  // "meia calabresa e meia mussarela"
  // "calabresa com mussarela"
  // "metade calabresa metade mussarela"
  // "pizza calabresa/mussarela"
  
  const patterns = [
    /meia\s+(.+?)\s+meia\s+(.+?)(?:\s|$)/i,
    /(?:meio\s*(?:a\s*)?meio|meia)\s+(.+?)\s+(?:e|com|\/)\s+(?:meia|meio\s*(?:a\s*)?meio)?\s*(.+?)(?:\s|$)/i,
    /(?:metade)\s+(.+?)\s+(?:e|com|\/)\s+(?:metade)?\s*(.+?)(?:\s|$)/i,
    /(.+?)\s+(?:e|com|\/)\s+(.+?)\s+(?:meio\s*(?:a\s*)?meio|metade|meia)/i,
    /(.+?)\s*\/\s*(.+)/i,
    /(.+?)\s+(?:e|com)\s+(.+)/i,
  ];
  
  let flavor1 = '';
  let flavor2 = '';

  // Fallback rápido: "meia X meia Y" sem conjunção
  if (!flavor1 && !flavor2 && lowerMsg.includes('meia')) {
    const meiaParts = lowerMsg.split('meia').map(p => p.trim()).filter(Boolean);
    if (meiaParts.length >= 3) {
      const possibleFlavors = meiaParts.slice(-2);
      flavor1 = possibleFlavors[0]
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '')
        .trim();
      flavor2 = possibleFlavors[1]
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '')
        .trim();
      console.log(`🔍 [DeliveryAI] Sabores extraídos (fallback meia): "${flavor1}" e "${flavor2}"`);
    }
  }
  
  for (const pattern of patterns) {
    if (flavor1 && flavor2) break;
    const match = lowerMsg.match(pattern);
    if (match) {
      flavor1 = match[1].trim()
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '');  // Remove "a" inicial
      flavor2 = match[2].trim()
        .replace(/^(?:pizza\s*(?:de\s*)?|esfirra\s*(?:de\s*)?|esfiha\s*(?:de\s*)?|de\s*)/i, '')
        .replace(/sabor\s*/i, '')
        .replace(/^a\s+/i, '');  // Remove "a" inicial
      console.log(`🔍 [DeliveryAI] Sabores extraídos: "${flavor1}" e "${flavor2}"`);
      break;
    }
  }
  
  if (!flavor1 || !flavor2) {
    return {
      success: false,
      items: [],
      errorMessage: 'Não consegui identificar os dois sabores. Por favor, diga algo como "pizza meio a meio calabresa e mussarela".'
    };
  }
  
  // Buscar itens no menu COM FILTRO DE CATEGORIA
  const item1 = findItemByNameFuzzy(deliveryData, flavor1, categoryFilter);
  const item2 = findItemByNameFuzzy(deliveryData, flavor2, categoryFilter);
  
  const items: Array<{ name: string; price: number; category: string }> = [];
  const notFound: string[] = [];
  
  if (item1) {
    items.push({ name: item1.name, price: item1.price, category: item1.category_name });
  } else {
    notFound.push(flavor1);
  }
  
  if (item2) {
    items.push({ name: item2.name, price: item2.price, category: item2.category_name });
  } else {
    notFound.push(flavor2);
  }
  
  // Verificar se os dois itens são da mesma categoria
  if (items.length === 2 && items[0].category !== items[1].category) {
    console.log(`⚠️ [DeliveryAI] Categorias diferentes: ${items[0].category} vs ${items[1].category}`);
  }
  
  if (notFound.length > 0) {
    const categoryName = categoryFilter || 'categoria';
    return {
      success: false,
      items,
      errorMessage: `Não encontrei ${notFound.join(', ')} em ${categoryName}. Verifique os sabores disponíveis no cardápio.`
    };
  }
  
  return {
    success: true,
    items,
  };
}

// ═══════════════════════════════════════════════════════════════════════
// �🎯 FUNÇÃO PRINCIPAL - PROCESSADOR DE DELIVERY
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
  searchName: string,
  categoryFilter?: string  // NOVO: Filtrar por categoria específica
): MenuItem | null {
  const normalized = searchName.toLowerCase().trim()
    .replace(/refri\b/g, 'refrigerante')
    .replace(/(\d)\s*l\b/gi, '$1 litros')
    .replace(/(\d)\s*litro\b/gi, '$1 litros');
  
  // Filtrar categorias se especificado
  const categoriesToSearch = categoryFilter 
    ? data.categories.filter(c => c.name.toLowerCase().includes(categoryFilter.toLowerCase()))
    : data.categories;
  
  console.log(`🔍 [DeliveryAI] Buscando "${searchName}" em ${categoriesToSearch.length} categorias ${categoryFilter ? `(filtro: ${categoryFilter})` : ''}`);
  
  // 1. Normalização de sabor (remover prefixos como "pizza de", "esfiha de")
  const cleanedName = normalized
    .replace(/^(?:pizza\s*(?:de\s*)?|esfirra?\s*(?:de\s*)?|esfiha\s*(?:de\s*)?)/i, '')
    .replace(/^(?:uma?\s*|um\s*)/i, '')
    .trim();

  const searchWords = normalized
    .split(/\s+/)
    .filter(w => w.length > 2 && !['de', 'da', 'do', 'uma', 'um'].includes(w));

  const flavorWords = normalized
    .split(/\s+/)
    .filter(w => w.length > 4 && !['pizza', 'esfiha', 'esfirra', 'quero', 'grande', 'media', 'pequena'].includes(w));

  type Candidate = { item: MenuItem; categoryName: string; score: number; reason: string };
  const candidates: Candidate[] = [];

  for (const category of categoriesToSearch) {
    for (const item of category.items) {
      const itemNameLower = item.name.toLowerCase();
      let score = 0;
      let reason = '';

      if (itemNameLower === normalized) {
        score = 100;
        reason = 'exato';
      } else if (cleanedName.length > 2 && itemNameLower.includes(cleanedName)) {
        score = 90;
        reason = `sabor:${cleanedName}`;
      } else if (searchWords.length > 0 && searchWords.every(word => itemNameLower.includes(word))) {
        score = 80;
        reason = 'todas-palavras';
      } else if (flavorWords.length > 0 && flavorWords.some(word => itemNameLower.includes(word))) {
        score = 60;
        reason = 'fuzzy-sabor';
      }

      if (score > 0) {
        candidates.push({ item, categoryName: category.name, score, reason });
      }
    }
  }

  if (candidates.length > 0) {
    candidates.sort((a, b) => b.score - a.score || a.item.name.length - b.item.name.length);
    const best = candidates[0];
    console.log(`✅ [DeliveryAI] Match ${best.reason}: ${best.item.name} (categoria: ${best.categoryName})`);
    return best.item;
  }
  
  console.log(`❌ [DeliveryAI] Nenhum item encontrado para "${searchName}"`);
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧠 DETECTAR CONTEXTO DE CATEGORIA BASEADO NO HISTÓRICO
// ═══════════════════════════════════════════════════════════════════════

export function detectCategoryContext(
  conversationHistory: Array<{ fromMe: boolean; text: string }>,
  deliveryData: DeliveryData
): string | undefined {
  // Procurar nas últimas mensagens do BOT (fromMe=true) por menções a categorias
  const recentBotMessages = conversationHistory
    .filter(m => m.fromMe)
    .slice(-5); // Últimas 5 mensagens do bot
  
  const categoryKeywords: Record<string, string[]> = {
    'Pizza': ['🍕 PIZZAS SALGADAS', '🍫 PIZZAS DOCES', 'Pizza Calabresa', 'Pizza Mussarela', 'Pizza Brigadeiro'],
    'Esfiha': ['🥟 ESFIHAS ABERTAS', 'Esfiha de Carne', 'Esfiha de Queijo', 'Esfiha de Brigadeiro'],
    'Bebida': ['🍹 BEBIDAS', 'Refrigerante', 'Coca-Cola'],
    'Borda': ['🧀 BORDAS RECHEADAS', 'Borda de Catupiry'],
  };
  
  for (const message of recentBotMessages.reverse()) { // Mais recente primeiro
    for (const [categoryName, keywords] of Object.entries(categoryKeywords)) {
      if (keywords.some(kw => message.text.includes(kw))) {
        console.log(`🧠 [DeliveryAI] Contexto detectado: última categoria vista foi "${categoryName}"`);
        return categoryName;
      }
    }
  }
  
  console.log(`🧠 [DeliveryAI] Nenhum contexto de categoria detectado no histórico`);
  return undefined;
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
  deliveryData: DeliveryData,
  categoryContext?: string
): ProcessOrderResult {
  const categoryMap: Record<string, string> = {
    pizza: 'Pizza',
    esfirra: 'Esfiha',
    bebida: 'Bebida',
    'açaí': 'Açaí',
    borda: 'Borda',
  };
  const parsedItems = parseOrderItems(message);
  const addedItems: Array<{ name: string; quantity: number; price: number }> = [];
  const notFoundItems: string[] = [];
  const itemsNeedingSize: Array<{ name: string; quantity: number; options: Array<{ name: string; price: number }> }> = [];
  
  for (const parsed of parsedItems) {
    const itemCategoryKey = detectCategoryFromMessage(parsed.name);
    const itemCategoryContext = itemCategoryKey
      ? (categoryMap[itemCategoryKey] || categoryContext)
      : categoryContext;
    const menuItem = findItemByNameFuzzy(deliveryData, parsed.name, itemCategoryContext);
    
    if (menuItem) {
      const resolved = resolveMenuItemOptions(menuItem, message);
      if (resolved.needsSize) {
        itemsNeedingSize.push({
          name: menuItem.name,
          quantity: parsed.quantity,
          options: resolved.sizeOptions || [],
        });
        continue;
      }
      const optionsKey = resolved.optionsSelected
        .map(opt => `${normalizeTextForMatch(opt.group)}:${normalizeTextForMatch(opt.option)}`)
        .join('|');
      addToCart(userId, customerPhone, menuItem, parsed.quantity, {
        displayName: resolved.displayName,
        priceOverride: resolved.unitPrice,
        notes: resolved.notes,
        optionsSelected: resolved.optionsSelected,
        itemKeySuffix: optionsKey || undefined,
      });
      addedItems.push({
        name: resolved.displayName,
        quantity: parsed.quantity,
        price: resolved.unitPrice,
      });
    } else {
      notFoundItems.push(parsed.name);
    }
  }
  
  if (itemsNeedingSize.length > 0) {
    const item = itemsNeedingSize[0];
    const sizesText = item.options.map(opt =>
      `• *${opt.name}* - R$ ${opt.price.toFixed(2).replace('.', ',')}`
    ).join('\n');
    return {
      success: false,
      addedItems: [],
      notFoundItems,
      cart: getCart(userId, customerPhone),
      message: `🍕 Boa escolha! *${item.quantity}x ${item.name}*\n\n📐 *Qual tamanho você quer?*\n\n${sizesText}\n\nMe diz o tamanho! 😊`,
    };
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
    const validConversationId = conversationId && !conversationId.startsWith('sim-')
      ? conversationId
      : null;

    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .insert({
        user_id: userId,
        conversation_id: validConversationId,
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
      menu_item_id: item.menuItemId ?? null,
      item_name: item.name,
      quantity: item.quantity,
      unit_price: item.price,
      total_price: item.price * item.quantity,
      options_selected: item.optionsSelected || [],
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
  conversationHistory?: Array<{ fromMe: boolean; text: string }>,
  customerPhone?: string,
  conversationId?: string
): Promise<DeliveryAIResponse | null> {
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🍕 [DeliveryAI] Processando mensagem: "${message.substring(0, 50)}..."`);
  
  // 1. Buscar dados do delivery no banco
  const deliveryData = await getDeliveryData(userId);
  if (!deliveryData) {
    console.log(`🍕 [DeliveryAI] Delivery não ativo para este usuário`);
    return null; // Retorna null para indicar que deve usar fluxo normal
  }
  
  // 2. VERIFICAR HORÁRIO DE FUNCIONAMENTO
  const businessStatus = isBusinessOpen(deliveryData.config.opening_hours);
  console.log(`🕐 [DeliveryAI] Horário: ${businessStatus.currentTime} | Aberto: ${businessStatus.isOpen}`);
  
  if (!businessStatus.isOpen) {
    console.log(`🚫 [DeliveryAI] Estabelecimento fechado - informando cliente`);
    const hoursText = formatBusinessHours(deliveryData.config.opening_hours);
    const historyName = getCustomerNameFromHistory(conversationHistory);
    const effectiveName = deliveryData.config.use_customer_name
      ? (historyName || 'Cliente')
      : 'Cliente';

    const defaultClosedTemplate = `😔 *Ops! Estamos fechados no momento.*\n\n🕐 {status}\n\n{horarios}\n\n✨ Volte no horário de funcionamento! Teremos prazer em atendê-lo.`;
    const closedTemplate = deliveryData.config.closed_message || defaultClosedTemplate;
    const closedMessageRaw = interpolateDeliveryMessage(closedTemplate, {
      cliente_nome: effectiveName,
      nome: effectiveName,
      name: effectiveName,
      horarios: hoursText,
      status: businessStatus.message,
    });
    const closedMessage = applyHumanization(closedMessageRaw, deliveryData.config, true);

    return {
      intent: 'OTHER',
      bubbles: [closedMessage],
      metadata: { businessClosed: true, businessStatus }
    };
  }
  
  // 3. Detectar intenção (atalhos rápidos antes da IA)
  const normalizedMsg = normalizeTextForMatch(message);
  let intent: CustomerIntent | null = null;
  if (/^(oi|ola|olá|bom dia|boa tarde|boa noite|e ai|eae|opa|oii+|hi|hey)\b/.test(normalizedMsg)) {
    intent = 'GREETING';
  } else if (/(cardapio|cardápio|menu|o que tem|oque tem|quais produtos|quais os produtos|me manda o menu|mostra o menu|ver o cardapio|ver cardápio)/i.test(normalizedMsg)) {
    intent = 'WANT_MENU';
  }
  if (!intent) {
    // Detectar intenção COM IA (considera contexto da conversa)
    intent = await detectIntentWithAI(message, conversationHistory, deliveryData);
  }
  console.log(`🍕 [DeliveryAI] Intenção detectada (com contexto): ${intent}`);
  
  // 4. Gerar resposta baseada na intenção
  const response = await generateDeliveryResponse(
    userId,
    message,
    intent,
    deliveryData,
    conversationHistory?.map(m => `${m.fromMe ? 'Você' : 'Cliente'}: ${m.text}`).join('\n'),
    customerPhone,
    conversationId,
    conversationHistory
  );

  const menuSendMode = normalizeMenuSendMode(deliveryData.config.menu_send_mode);
  if (menuSendMode !== 'text') {
    if (menuSendMode === 'image' && !response.metadata?.categoryImageUrl) {
      const requestedCategory = response.metadata?.categoryRequested || detectCategoryFromMessage(message);
      if (requestedCategory) {
        const matchedCategory = findMatchingCategory(deliveryData, requestedCategory);
        if (matchedCategory?.image_url) {
          response.metadata = {
            ...response.metadata,
            categoryRequested: requestedCategory,
            categoryImageUrl: matchedCategory.image_url,
            categoryName: matchedCategory.name,
          };
        }
      }
    }

    const mediaActions = buildMenuMediaActions(deliveryData, response.intent, response.metadata);

    if (menuSendMode === 'image' && response.metadata?.categoryImageUrl && mediaActions.length === 0) {
      mediaActions.push({
        type: 'send_media_url',
        media_url: response.metadata.categoryImageUrl,
        media_type: 'image',
        caption: response.metadata.categoryName || response.metadata.categoryRequested,
      });
    }

    if (mediaActions.length > 0) {
      response.mediaActions = mediaActions;
      if (menuSendMode === 'image') {
        response.bubbles = [];
      }
    }
  }
  
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
  detectIntentWithAI,
  isDeliveryEnabled,
  getDeliveryData,
  formatMenuAsBubbles,
  findItemInMenu,
  findItemByNameFuzzy,
  detectCategoryContext,
  validatePriceInResponse,
  isBusinessOpen,  // Verificar horário de funcionamento
  // Carrinho
  getCart,
  addToCart,
  addCustomItemToCart,
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
