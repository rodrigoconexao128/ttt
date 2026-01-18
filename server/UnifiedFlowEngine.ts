/**
 * ═══════════════════════════════════════════════════════════════════════════
 * 🚀 UNIFIED FLOW ENGINE - Motor Híbrido Unificado
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * ARQUITETURA HÍBRIDA:
 * 1. IA INTERPRETA → Entende o que o cliente quer (qualquer jeito de falar)
 * 2. SISTEMA EXECUTA → Busca dados, calcula, move estados (determinístico)
 * 3. IA HUMANIZA → Resposta natural, anti-bloqueio (opcional)
 * 
 * SUPORTA:
 * - DELIVERY: Cardápio, carrinho, pedidos (ex: pizzarias)
 * - VENDAS: Funil de vendas, preços, demos (ex: AgenteZap)
 * - AGENDAMENTO: Horários, confirmações, cancelamentos
 * - SUPORTE: FAQ, tickets, encaminhamentos
 * - GENERICO: Atendimento livre baseado no prompt
 * 
 * INTEGRAÇÃO:
 * - FlowBuilder: Converte prompts em FlowDefinitions
 * - FlowStorage: Persiste fluxos no Supabase
 * - HybridFlowEngine: Executa fluxos com IA híbrida
 */

import { supabase } from "./supabaseAuth";
import { FlowBuilder, PromptAnalyzer } from "./FlowBuilder";
import type { FlowDefinition, FlowType, FlowState, FlowIntent, FlowAction } from "./FlowBuilder";

// Tipo de transição inline (não exportado pelo FlowBuilder)
interface FlowTransition {
  intent: string;
  nextState: string;
  action: string;
  condition?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════════

export interface ConversationState {
  userId: string;
  conversationId: string;
  flowId: string;
  currentState: string;
  data: Record<string, any>;
  history: ConversationTurn[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ConversationTurn {
  role: 'user' | 'assistant';
  message: string;
  intent?: string;
  action?: string;
  state?: string;
  timestamp: Date;
}

export interface FlowExecutionResult {
  text: string;
  newState: string;
  intent: string;
  action: string;
  data?: Record<string, any>;
  mediaActions?: any[];
  notification?: any;
}

export interface FlowConfig {
  apiKey: string;
  model?: string;
  humanize?: boolean;
  temperature?: number;
}

// ═══════════════════════════════════════════════════════════════════════════
// FLOW STORAGE - Persistência de Fluxos
// ═══════════════════════════════════════════════════════════════════════════

export class FlowStorage {
  
  /**
   * Salva ou atualiza FlowDefinition no banco
   */
  static async saveFlow(userId: string, flow: FlowDefinition): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('agent_flows')
        .upsert({
          user_id: userId,
          flow_id: flow.id,
          flow_type: flow.type,
          flow_definition: flow,
          business_name: flow.businessName,
          agent_name: flow.agentName,
          version: flow.version,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (error) {
        console.error(`[FlowStorage] Erro ao salvar flow:`, error);
        return false;
      }

      console.log(`[FlowStorage] ✅ Flow salvo: ${flow.id} (${flow.type}) para user ${userId}`);
      return true;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return false;
    }
  }

  /**
   * Carrega FlowDefinition do usuário
   */
  static async loadFlow(userId: string): Promise<FlowDefinition | null> {
    try {
      const { data, error } = await supabase
        .from('agent_flows')
        .select('flow_definition')
        .eq('user_id', userId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') { // Não encontrado
          console.error(`[FlowStorage] Erro ao carregar flow:`, error);
        }
        return null;
      }

      return data?.flow_definition as FlowDefinition;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return null;
    }
  }

  /**
   * Salva estado da conversa
   */
  static async saveConversationState(state: ConversationState): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('conversation_flow_states')
        .upsert({
          conversation_id: state.conversationId,
          user_id: state.userId,
          flow_id: state.flowId,
          current_state: state.currentState,
          data: state.data,
          history: state.history,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'conversation_id'
        });

      if (error) {
        console.error(`[FlowStorage] Erro ao salvar estado:`, error);
        return false;
      }

      return true;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return false;
    }
  }

  /**
   * Carrega estado da conversa
   */
  static async loadConversationState(conversationId: string): Promise<ConversationState | null> {
    try {
      const { data, error } = await supabase
        .from('conversation_flow_states')
        .select('*')
        .eq('conversation_id', conversationId)
        .single();

      if (error) {
        if (error.code !== 'PGRST116') {
          console.error(`[FlowStorage] Erro ao carregar estado:`, error);
        }
        return null;
      }

      return {
        userId: data.user_id,
        conversationId: data.conversation_id,
        flowId: data.flow_id,
        currentState: data.current_state,
        data: data.data || {},
        history: data.history || [],
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return null;
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI INTERPRETER - Detecta Intenção usando IA
// ═══════════════════════════════════════════════════════════════════════════

export class AIInterpreter {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'mistral-small-latest') {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Detecta intenção do usuário com base no FlowDefinition
   */
  async detectIntent(
    message: string,
    flow: FlowDefinition,
    currentState: string,
    context?: Record<string, any>
  ): Promise<{ intent: string; confidence: number; extractedData?: Record<string, any> }> {
    
    // Buscar transições possíveis no estado atual
    const state = flow.states[currentState];
    if (!state) {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    // Construir lista de intents possíveis
    const possibleIntents = state.transitions.map(t => t.intent);
    const intentDescriptions = possibleIntents.map(intentId => {
      const intent = flow.intents[intentId];
      return intent 
        ? `${intentId}: Exemplos: "${intent.examples.slice(0, 3).join('", "')}"`
        : intentId;
    }).join('\n');

    // Prompt para a IA
    const systemPrompt = `Você é um analisador de intenções para atendimento via WhatsApp.
Negócio: ${flow.businessName}
Agente: ${flow.agentName}
Estado atual: ${currentState}

INTENTS POSSÍVEIS NESTE ESTADO:
${intentDescriptions}

TAREFA:
Analise a mensagem do cliente e identifique qual intent ela representa.
Retorne APENAS JSON válido no formato:
{
  "intent": "NOME_DO_INTENT",
  "confidence": 0-100,
  "extractedData": { ... }  // dados extraídos se houver (ex: quantidade, item, etc)
}

REGRAS:
- Se não tiver certeza, use confidence baixa
- Se não reconhecer, retorne intent: "UNKNOWN"
- Extraia dados relevantes (números, nomes, etc)`;

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Mensagem do cliente: "${message}"` }
          ],
          temperature: 0.1,
          max_tokens: 200
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      const text = data.choices[0]?.message?.content?.trim() || '{}';
      
      // Extrair JSON
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : text);

      return {
        intent: result.intent || 'UNKNOWN',
        confidence: result.confidence || 0,
        extractedData: result.extractedData
      };
    } catch (err) {
      console.error(`[AIInterpreter] Erro na detecção:`, err);
      return { intent: 'UNKNOWN', confidence: 0 };
    }
  }

  /**
   * Detecção rápida usando regex (fallback sem IA)
   */
  detectIntentFast(message: string, flow: FlowDefinition, currentState: string): { intent: string; confidence: number } {
    const state = flow.states[currentState];
    if (!state) {
      return { intent: 'UNKNOWN', confidence: 0 };
    }

    const msgLower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

    // Verificar cada intent possível
    for (const transition of state.transitions) {
      const intent = flow.intents[transition.intent];
      if (!intent) continue;

      // Verificar padrões regex
      if (intent.patterns) {
        for (const pattern of intent.patterns) {
          const regex = new RegExp(pattern, 'i');
          if (regex.test(msgLower)) {
            return { intent: transition.intent, confidence: 90 };
          }
        }
      }

      // Verificar exemplos (match parcial)
      for (const example of intent.examples) {
        const exampleLower = example.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (msgLower.includes(exampleLower) || exampleLower.includes(msgLower)) {
          return { intent: transition.intent, confidence: 70 };
        }
      }
    }

    // Fallback: GREETING para mensagens curtas de saudação
    if (msgLower.match(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|eae|hey|hi)\s*[!?,.]?$/)) {
      return { intent: 'GREETING', confidence: 95 };
    }

    return { intent: 'UNKNOWN', confidence: 0 };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// SYSTEM EXECUTOR - Executa Ações Deterministicamente
// ═══════════════════════════════════════════════════════════════════════════

export class SystemExecutor {
  
  /**
   * Executa ação e retorna resposta do sistema
   * AGORA COM INTEGRAÇÃO REAL COM O BANCO DE DADOS! 🚀
   */
  async execute(
    flow: FlowDefinition,
    action: FlowAction,
    currentState: string,
    nextState: string,
    data: Record<string, any>,
    extractedData?: Record<string, any>,
    userId?: string
  ): Promise<{ response: string; newData: Record<string, any>; mediaActions?: any[] }> {
    
    // Mesclar dados extraídos
    const mergedData = { ...data, ...extractedData };

    // 🚀 Se a ação é do tipo DATA, buscar dados REAIS do sistema
    if (action.type === 'DATA' && userId) {
      await this.loadRealData(action.dataSource, mergedData, flow, userId);
    }

    // Processar template substituindo variáveis
    let response = this.processTemplate(action.template || '', mergedData, flow);

    // Processar ações de mídia se houver
    let mediaActions: any[] = [];
    if (action.mediaTag) {
      mediaActions = [{ tag: action.mediaTag, type: 'send' }];
    }

    return {
      response,
      newData: mergedData,
      mediaActions
    };
  }

  /**
   * 🚀 Carrega dados REAIS do banco de dados
   */
  private async loadRealData(
    dataSource: string | undefined,
    data: Record<string, any>,
    flow: FlowDefinition,
    userId: string
  ): Promise<void> {
    
    console.log(`📦 [SystemExecutor] Carregando dados: ${dataSource} para user ${userId}`);

    switch (dataSource) {
      case 'menu':
        await this.loadMenuData(data, userId, flow);
        break;
      
      case 'business_hours':
        await this.loadBusinessHours(data, userId);
        break;
      
      case 'delivery_fee':
        await this.loadDeliveryFee(data, userId);
        break;
        
      case 'products':
        await this.loadProductsData(data, userId);
        break;
      
      default:
        console.log(`📦 [SystemExecutor] DataSource não reconhecido: ${dataSource}`);
    }
  }

  /**
   * 🍕 Carrega menu de delivery do banco
   */
  private async loadMenuData(data: Record<string, any>, userId: string, flow: FlowDefinition): Promise<void> {
    try {
      // Buscar categorias
      const { data: categories, error: catError } = await supabase
        .from('menu_categories')
        .select('id, name, display_order')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('display_order');

      if (catError) throw catError;

      // Buscar itens do menu
      const { data: items, error: itemError } = await supabase
        .from('menu_items')
        .select('id, name, description, price, category_id, is_available')
        .eq('user_id', userId)
        .eq('is_available', true)
        .order('display_order');

      if (itemError) throw itemError;

      // Formatar cardápio por categoria
      let menuFormatted = '';
      for (const category of categories || []) {
        const categoryItems = (items || []).filter(item => item.category_id === category.id);
        if (categoryItems.length === 0) continue;
        
        menuFormatted += `\n*${category.name.toUpperCase()}*\n`;
        for (const item of categoryItems) {
          const price = parseFloat(item.price).toFixed(2).replace('.', ',');
          menuFormatted += `• ${item.name} - R$ ${price}\n`;
          if (item.description) {
            menuFormatted += `  ↳ ${item.description}\n`;
          }
        }
      }

      data.menu_formatted = menuFormatted.trim() || 'Cardápio não disponível no momento.';
      data.menu_items = items || [];
      data.menu_categories = categories || [];

      console.log(`📦 [SystemExecutor] ✅ Menu carregado: ${items?.length || 0} itens`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar menu:`, err);
      data.menu_formatted = 'Cardápio não disponível no momento.';
    }
  }

  /**
   * 🕐 Carrega horário de funcionamento
   */
  private async loadBusinessHours(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: config, error } = await supabase
        .from('delivery_config')
        .select('opening_hours')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      const hours = config?.opening_hours;
      if (hours) {
        const dayNames: Record<string, string> = {
          monday: 'Segunda',
          tuesday: 'Terça',
          wednesday: 'Quarta',
          thursday: 'Quinta',
          friday: 'Sexta',
          saturday: 'Sábado',
          sunday: 'Domingo'
        };
        
        let hoursFormatted = '';
        for (const [day, h] of Object.entries(hours)) {
          const hourData = h as any;
          if (hourData.is_open) {
            hoursFormatted += `${dayNames[day] || day}: ${hourData.open} às ${hourData.close}\n`;
          }
        }
        data.hours = hoursFormatted.trim() || 'Consulte nosso horário de funcionamento.';
      }

      console.log(`📦 [SystemExecutor] ✅ Horário carregado`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar horário:`, err);
      data.hours = 'Consulte nosso horário de funcionamento.';
    }
  }

  /**
   * 🛵 Carrega taxa de entrega
   */
  private async loadDeliveryFee(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: config, error } = await supabase
        .from('delivery_config')
        .select('delivery_fee, min_order_value, estimated_delivery_time')
        .eq('user_id', userId)
        .single();

      if (error) throw error;

      data.delivery_fee = config?.delivery_fee?.toFixed(2).replace('.', ',') || '0,00';
      data.min_order = config?.min_order_value?.toFixed(2).replace('.', ',') || '0,00';
      data.delivery_time = `${config?.estimated_delivery_time || 45} minutos`;

      console.log(`📦 [SystemExecutor] ✅ Taxa de entrega: R$ ${data.delivery_fee}`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar taxa:`, err);
      data.delivery_fee = '0,00';
    }
  }

  /**
   * 📦 Carrega catálogo de produtos (VENDAS)
   */
  private async loadProductsData(data: Record<string, any>, userId: string): Promise<void> {
    try {
      const { data: products, error } = await supabase
        .from('products')
        .select('name, price, description, category, stock')
        .eq('user_id', userId)
        .eq('is_active', true)
        .order('category')
        .limit(50);

      if (error) throw error;

      // Formatar lista de produtos
      let productsFormatted = '';
      let currentCategory = '';
      
      for (const product of products || []) {
        if (product.category && product.category !== currentCategory) {
          currentCategory = product.category;
          productsFormatted += `\n*${currentCategory.toUpperCase()}*\n`;
        }
        const price = parseFloat(product.price).toFixed(2).replace('.', ',');
        productsFormatted += `• ${product.name} - R$ ${price}\n`;
        if (product.description) {
          productsFormatted += `  ↳ ${product.description}\n`;
        }
      }

      data.products_formatted = productsFormatted.trim() || 'Produtos não disponíveis no momento.';
      data.products_list = products || [];

      console.log(`📦 [SystemExecutor] ✅ Produtos carregados: ${products?.length || 0} itens`);
    } catch (err) {
      console.error(`📦 [SystemExecutor] ❌ Erro ao carregar produtos:`, err);
      data.products_formatted = 'Produtos não disponíveis no momento.';
    }
  }

  /**
   * Processa template substituindo variáveis
   */
  private processTemplate(template: string, data: Record<string, any>, flow: FlowDefinition): string {
    let result = template;

    // Substituir variáveis do flow (preços, links, cupons)
    if (flow.data) {
      if (flow.data.prices) {
        result = result.replace(/\{price_standard\}/g, flow.data.prices.standard?.toString() || '');
        result = result.replace(/\{price_promo\}/g, flow.data.prices.promo?.toString() || '');
        result = result.replace(/\{impl_price\}/g, flow.data.prices.implementation?.toString() || '');
      }
      if (flow.data.links) {
        result = result.replace(/\{signup_link\}/g, flow.data.links.signup || '');
        result = result.replace(/\{site_link\}/g, flow.data.links.site || '');
      }
      if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
        const firstCoupon = Object.values(flow.data.coupons)[0];
        result = result.replace(/\{coupon_code\}/g, firstCoupon?.code || '');
        result = result.replace(/\{coupon_discount\}/g, firstCoupon?.discount?.toString() || '');
      }
    }

    // Substituir dados do negócio
    result = result.replace(/\{agent_name\}/g, flow.agentName);
    result = result.replace(/\{business_name\}/g, flow.businessName);

    // Substituir dados da conversa
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{${key}\\}`, 'g');
      result = result.replace(regex, String(value || ''));
    }

    return result;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// AI HUMANIZER - Humaniza Respostas (Opcional)
// ═══════════════════════════════════════════════════════════════════════════

export class AIHumanizer {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'mistral-small-latest') {
    this.apiKey = apiKey;
    this.model = model;
  }

  /**
   * Humaniza resposta do sistema (anti-bloqueio)
   */
  async humanize(
    systemResponse: string,
    flow: FlowDefinition,
    userMessage: string,
    options?: { personality?: string; variation?: number }
  ): Promise<string> {
    
    const personality = options?.personality || flow.agentPersonality || 'amigável e profissional';
    
    const systemPrompt = `Você é ${flow.agentName} da ${flow.businessName}.
Personalidade: ${personality}

TAREFA:
Reescreva a resposta abaixo de forma NATURAL e HUMANIZADA para WhatsApp.
Mantenha TODAS as informações (preços, links, dados), mas torne o texto mais humano.

REGRAS:
- Mantenha o tom de conversa informal de WhatsApp
- Não use cumprimentos excessivos
- Não repita informações
- Máximo 2 emojis por mensagem
- Se a resposta já estiver boa, retorne ela mesma
- NUNCA invente informações - use apenas o que está na resposta original

Responda APENAS com o texto humanizado, sem explicações.`;

    try {
      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: `Mensagem original do cliente: "${userMessage}"\n\nResposta do sistema para humanizar:\n${systemResponse}` }
          ],
          temperature: options?.variation || 0.3,
          max_tokens: 500
        })
      });

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();
      return data.choices[0]?.message?.content?.trim() || systemResponse;
    } catch (err) {
      console.error(`[AIHumanizer] Erro:`, err);
      return systemResponse; // Fallback para resposta original
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNIFIED FLOW ENGINE - Motor Principal
// ═══════════════════════════════════════════════════════════════════════════

export class UnifiedFlowEngine {
  private interpreter: AIInterpreter;
  private executor: SystemExecutor;
  private humanizer: AIHumanizer;
  private config: FlowConfig;

  constructor(config: FlowConfig) {
    this.config = config;
    this.interpreter = new AIInterpreter(config.apiKey, config.model);
    this.executor = new SystemExecutor();
    this.humanizer = new AIHumanizer(config.apiKey, config.model);
  }

  /**
   * Processa mensagem do cliente usando o fluxo
   */
  async processMessage(
    userId: string,
    conversationId: string,
    message: string,
    options?: {
      useAI?: boolean;         // true = IA interpreta, false = regex apenas
      humanize?: boolean;       // true = humaniza resposta
      contactName?: string;
    }
  ): Promise<FlowExecutionResult | null> {
    
    console.log(`\n🚀 [UnifiedFlowEngine] ════════════════════════════════`);
    console.log(`   User: ${userId}`);
    console.log(`   Conversation: ${conversationId}`);
    console.log(`   Message: "${message.substring(0, 50)}..."`);

    // 1. Carregar FlowDefinition do usuário
    const flow = await FlowStorage.loadFlow(userId);
    if (!flow) {
      console.log(`   ⚠️ Nenhum flow encontrado para user ${userId}`);
      return null;
    }
    console.log(`   📋 Flow: ${flow.id} (${flow.type})`);

    // 2. Carregar ou criar estado da conversa
    let state = await FlowStorage.loadConversationState(conversationId);
    if (!state) {
      state = {
        userId,
        conversationId,
        flowId: flow.id,
        currentState: flow.initialState,
        data: {},
        history: [],
        createdAt: new Date(),
        updatedAt: new Date()
      };
      console.log(`   🆕 Nova conversa, estado inicial: ${flow.initialState}`);
    } else {
      console.log(`   📍 Estado atual: ${state.currentState}`);
    }

    // 3. Detectar intenção
    let intentResult;
    if (options?.useAI !== false) {
      intentResult = await this.interpreter.detectIntent(message, flow, state.currentState, state.data);
      console.log(`   🎯 Intent (IA): ${intentResult.intent} (${intentResult.confidence}%)`);
    } else {
      intentResult = this.interpreter.detectIntentFast(message, flow, state.currentState);
      console.log(`   🎯 Intent (Regex): ${intentResult.intent} (${intentResult.confidence}%)`);
    }

    // 4. Encontrar transição válida
    const currentFlowState = flow.states[state.currentState];
    if (!currentFlowState) {
      console.log(`   ❌ Estado inválido: ${state.currentState}`);
      return null;
    }

    const transition = currentFlowState.transitions.find(t => t.intent === intentResult.intent);
    if (!transition) {
      console.log(`   ⚠️ Sem transição para intent ${intentResult.intent} no estado ${state.currentState}`);
      
      // Fallback: tentar GREETING em qualquer estado
      if (intentResult.intent === 'UNKNOWN') {
        const greetingTransition = currentFlowState.transitions.find(t => t.intent === 'GREETING');
        if (greetingTransition) {
          console.log(`   🔄 Fallback para GREETING`);
          return this.executeTransition(flow, greetingTransition, state, message, options);
        }
      }
      
      return null;
    }

    // 5. Executar transição
    return this.executeTransition(flow, transition, state, message, options, (intentResult as any).extractedData);
  }

  /**
   * Executa uma transição específica
   */
  private async executeTransition(
    flow: FlowDefinition,
    transition: FlowTransition,
    state: ConversationState,
    message: string,
    options?: { humanize?: boolean; contactName?: string },
    extractedData?: Record<string, any>
  ): Promise<FlowExecutionResult> {
    
    const action = flow.actions[transition.action];
    if (!action) {
      console.log(`   ❌ Ação não encontrada: ${transition.action}`);
      return {
        text: 'Desculpe, ocorreu um erro. Tente novamente.',
        newState: state.currentState,
        intent: transition.intent,
        action: transition.action
      };
    }

    // Executar ação (passa userId para carregar dados reais do banco)
    const { response, newData, mediaActions } = await this.executor.execute(
      flow,
      action,
      state.currentState,
      transition.nextState,
      state.data,
      extractedData,
      state.userId
    );

    // Humanizar se solicitado
    let finalResponse = response;
    if (options?.humanize !== false && this.config.humanize !== false) {
      finalResponse = await this.humanizer.humanize(response, flow, message);
    }

    // Atualizar estado
    state.currentState = transition.nextState;
    state.data = newData;
    state.history.push({
      role: 'user',
      message,
      intent: transition.intent,
      timestamp: new Date()
    });
    state.history.push({
      role: 'assistant',
      message: finalResponse,
      action: transition.action,
      state: transition.nextState,
      timestamp: new Date()
    });
    state.updatedAt = new Date();

    // Salvar estado
    await FlowStorage.saveConversationState(state);

    console.log(`   ✅ Ação: ${transition.action} → Estado: ${transition.nextState}`);
    console.log(`   📝 Resposta: "${finalResponse.substring(0, 80)}..."`);
    console.log(`🚀 [UnifiedFlowEngine] ════════════════════════════════\n`);

    return {
      text: finalResponse,
      newState: transition.nextState,
      intent: transition.intent,
      action: transition.action,
      data: newData,
      mediaActions
    };
  }

  /**
   * Cria FlowDefinition a partir de prompt de texto
   */
  static async createFlowFromPrompt(
    userId: string,
    prompt: string,
    options?: {
      businessType?: string;
      businessName?: string;
      additionalInfo?: string;
    }
  ): Promise<FlowDefinition | null> {
    
    console.log(`\n🏗️ [UnifiedFlowEngine] Criando flow a partir de prompt...`);
    
    const builder = new FlowBuilder();
    const flow = await builder.buildFromPrompt(prompt);

    // Aplicar overrides se fornecidos
    if (options?.businessName) {
      flow.businessName = options.businessName;
    }

    // Salvar no banco
    const saved = await FlowStorage.saveFlow(userId, flow);
    if (!saved) {
      console.log(`   ❌ Erro ao salvar flow`);
      return null;
    }

    console.log(`   ✅ Flow criado: ${flow.id} (${flow.type})`);
    console.log(`   📊 Estados: ${Object.keys(flow.states).length}`);
    console.log(`   🎯 Intenções: ${Object.keys(flow.intents).length}`);
    console.log(`   ⚡ Ações: ${Object.keys(flow.actions).length}`);

    return flow;
  }

  /**
   * Atualiza FlowDefinition existente com nova instrução
   */
  static async updateFlowFromInstruction(
    userId: string,
    instruction: string,
    apiKey: string
  ): Promise<{ success: boolean; flow?: FlowDefinition; message: string }> {
    
    console.log(`\n🔄 [UnifiedFlowEngine] Atualizando flow com instrução...`);
    console.log(`   Instrução: "${instruction.substring(0, 80)}..."`);

    // Carregar flow existente
    const existingFlow = await FlowStorage.loadFlow(userId);
    if (!existingFlow) {
      return {
        success: false,
        message: 'Nenhum flow encontrado para atualizar. Crie um agente primeiro.'
      };
    }

    // Analisar instrução para entender o que modificar
    const analyzer = new PromptAnalyzer();
    
    // Detectar tipo de modificação
    const instructionLower = instruction.toLowerCase();
    
    // Modificar preços
    const priceMatch = instructionLower.match(/pre[çc]o.*?(r?\$?\s*\d+)/i);
    if (priceMatch) {
      const newPrice = parseFloat(priceMatch[1].replace(/[^\d,]/g, '').replace(',', '.'));
      if (!isNaN(newPrice) && existingFlow.data?.prices) {
        existingFlow.data.prices.standard = newPrice;
        console.log(`   💰 Preço atualizado para R$${newPrice}`);
      }
    }

    // Modificar cupom
    const couponMatch = instructionLower.match(/cupom.*?([A-Z0-9]+)/i);
    if (couponMatch) {
      const newCoupon = couponMatch[1].toUpperCase();
      if (existingFlow.data?.coupons) {
        existingFlow.data.coupons[0] = { code: newCoupon, discount: existingFlow.data.coupons[0]?.discount || 50 };
        console.log(`   🎟️ Cupom atualizado para ${newCoupon}`);
      }
    }

    // Modificar nome do agente
    const nameMatch = instructionLower.match(/(?:nome|chama[r]?).*?(?:de\s+)?([a-záéíóúâêîôûãõç]+)/i);
    if (nameMatch && nameMatch[1].length > 2) {
      existingFlow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      console.log(`   👤 Nome atualizado para ${existingFlow.agentName}`);
    }

    // Modificar personalidade
    if (instructionLower.includes('mais formal')) {
      existingFlow.agentPersonality = 'formal, profissional, educado';
      console.log(`   🎭 Personalidade: formal`);
    } else if (instructionLower.includes('mais informal') || instructionLower.includes('descontraído')) {
      existingFlow.agentPersonality = 'informal, descontraído, amigável';
      console.log(`   🎭 Personalidade: informal`);
    }

    // Atualizar versão
    existingFlow.version = incrementVersion(existingFlow.version);

    // Salvar
    const saved = await FlowStorage.saveFlow(userId, existingFlow);
    if (!saved) {
      return {
        success: false,
        message: 'Erro ao salvar alterações no flow.'
      };
    }

    return {
      success: true,
      flow: existingFlow,
      message: `Flow atualizado com sucesso! Versão: ${existingFlow.version}`
    };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function incrementVersion(version: string): string {
  const parts = version.split('.');
  const patch = parseInt(parts[2] || '0') + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// MIGRATION SQL - Executar no Supabase
// ═══════════════════════════════════════════════════════════════════════════
export const FLOW_MIGRATION_SQL = `
-- Tabela para armazenar FlowDefinitions dos usuários
CREATE TABLE IF NOT EXISTS agent_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  flow_id VARCHAR NOT NULL,
  flow_type VARCHAR(50) NOT NULL,
  flow_definition JSONB NOT NULL,
  business_name VARCHAR(255),
  agent_name VARCHAR(255),
  version VARCHAR(20) DEFAULT '1.0.0',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_agent_flows_user_id ON agent_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_flows_flow_type ON agent_flows(flow_type);

-- Tabela para armazenar estado das conversas com flows
CREATE TABLE IF NOT EXISTS conversation_flow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  flow_id VARCHAR NOT NULL,
  current_state VARCHAR(100) NOT NULL,
  data JSONB DEFAULT '{}',
  history JSONB DEFAULT '[]',
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conv_flow_states_conv ON conversation_flow_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_flow_states_user ON conversation_flow_states(user_id);
`;

export default UnifiedFlowEngine;
