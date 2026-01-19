/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🎯 DETERMINISTIC FLOW ENGINE - Motor Universal de Fluxo Determinístico
 * ═══════════════════════════════════════════════════════════════════════
 *
 * CONCEITO FUNDAMENTAL:
 * - A IA NUNCA toma decisões sozinha
 * - A IA apenas INTERPRETA a intenção do usuário
 * - O SISTEMA (fluxo) toma TODAS as decisões
 * - A IA HUMANIZA a resposta final
 *
 * FUNCIONAMENTO:
 * 1. Usuário envia mensagem
 * 2. IA interpreta intenção (ex: "quer ver produtos", "quer agendar")
 * 3. Sistema consulta fluxo determinístico e decide próximo estado
 * 4. Sistema gera resposta baseada nas regras do fluxo
 * 5. IA humaniza a resposta (torna mais natural)
 * 6. Resposta final enviada ao usuário
 *
 * FUNCIONA PARA QUALQUER NEGÓCIO:
 * - Delivery, Vendas, Agendamento, Suporte, Cursos, etc
 * - Sistema se adapta ao tipo de negócio automaticamente
 * - Fluxo é criado a partir do prompt do agente
 *
 * ═══════════════════════════════════════════════════════════════════════
 */

import { supabase } from "./supabaseAuth";
import { getMistralClient } from "./mistralClient";

// ═══════════════════════════════════════════════════════════════════════
// TIPOS
// ═══════════════════════════════════════════════════════════════════════

export type FlowType = 'DELIVERY' | 'VENDAS' | 'AGENDAMENTO' | 'SUPORTE' | 'CURSO' | 'GENERICO';

export interface FlowState {
  id: string;
  name: string;
  type: 'greeting' | 'question' | 'info' | 'action' | 'end';
  message: string;  // Template da mensagem (pode ter variáveis)
  options?: string[];  // Opções disponíveis para o usuário
  nextStates?: Record<string, string>;  // Mapeamento: opção → próximo estado
  defaultNext?: string;  // Estado padrão se não houver match
  actions?: string[];  // Ações a executar (ex: "add_to_cart", "schedule_appointment")
}

export interface FlowDefinition {
  id: string;
  userId: string;
  flowType: FlowType;
  agentName: string;
  businessName: string;
  agentPersonality: string;

  // Estrutura do fluxo
  states: Record<string, FlowState>;
  initialState: string;

  // Dados do negócio
  businessData: {
    prices?: Record<string, number>;
    coupons?: Record<string, { code: string; discount: number }>;
    links?: Record<string, string>;
    schedule?: any;
    products?: any[];
    [key: string]: any;
  };

  // Regras globais
  globalRules: string[];

  // Metadados
  version: string;
  sourcePrompt?: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface FlowExecution {
  id: string;
  flowDefinitionId: string;
  userId: string;
  conversationId: string;
  contactName?: string;
  contactPhone?: string;

  // Estado atual
  currentState: string;
  flowData: Record<string, any>;  // Dados coletados (carrinho, preferências, etc)

  // Histórico
  stateHistory: string[];
  lastUserMessage?: string;
  lastAiResponse?: string;

  // Status
  status: 'active' | 'completed' | 'abandoned' | 'error';
  startedAt: Date;
  lastInteractionAt: Date;
  completedAt?: Date;
}

export interface UserIntent {
  category: string;  // Ex: "product_inquiry", "schedule", "price", "greeting"
  confidence: number;  // 0-1
  entities: Record<string, any>;  // Entidades extraídas
  rawMessage: string;
}

// ═══════════════════════════════════════════════════════════════════════
// DETERMINISTIC FLOW ENGINE
// ═══════════════════════════════════════════════════════════════════════

export class DeterministicFlowEngine {

  /**
   * Processa mensagem usando fluxo determinístico
   *
   * GARANTE: A IA nunca decide sozinha, apenas interpreta e humaniza
   */
  async processMessage(
    userId: string,
    conversationId: string,
    userMessage: string,
    options?: {
      contactName?: string;
      contactPhone?: string;
      apiKey?: string;
    }
  ): Promise<{
    text: string;
    mediaActions?: any[];
    state: string;
    flowData: Record<string, any>;
  } | null> {

    console.log(`\n🎯 [DeterministicFlow] Processando mensagem para user ${userId}`);
    console.log(`   Mensagem: "${userMessage.substring(0, 60)}..."`);

    try {
      // 1. Carregar FlowDefinition
      const flowDef = await this.loadFlowDefinition(userId);
      if (!flowDef) {
        console.log(`   ⚠️ Sem FlowDefinition, usando sistema legado`);
        return null;
      }

      console.log(`   📋 Flow carregado: ${flowDef.flowType} (${Object.keys(flowDef.states).length} estados)`);

      // 2. Carregar ou criar FlowExecution
      let execution = await this.loadOrCreateExecution(userId, conversationId, flowDef.id, options);

      console.log(`   🔄 Estado atual: ${execution.currentState}`);

      // 3. IA interpreta intenção do usuário (NÃO TOMA DECISÃO)
      const intent = await this.interpretUserIntent(
        userMessage,
        flowDef,
        execution,
        options?.apiKey
      );

      console.log(`   🧠 Intenção detectada: ${intent.category} (${(intent.confidence * 100).toFixed(0)}%)`);

      // 4. Sistema decide próximo estado baseado em REGRAS (não IA!)
      const nextState = this.determineNextState(
        flowDef,
        execution.currentState,
        intent,
        userMessage
      );

      console.log(`   ➡️ Próximo estado: ${nextState}`);

      // 5. Sistema gera resposta baseada no FLUXO (não IA!)
      const stateData = flowDef.states[nextState];
      if (!stateData) {
        console.error(`   ❌ Estado ${nextState} não encontrado no fluxo`);
        return null;
      }

      // 6. Executar ações do estado (se houver)
      if (stateData.actions) {
        for (const action of stateData.actions) {
          await this.executeAction(action, execution, intent.entities);
        }
      }

      // 7. Gerar mensagem baseada no template do estado
      let responseText = this.generateResponseFromTemplate(
        stateData.message,
        execution.flowData,
        flowDef.businessData,
        intent.entities
      );

      // 8. IA humaniza a resposta (tornando mais natural)
      if (options?.apiKey) {
        responseText = await this.humanizeResponse(
          responseText,
          flowDef,
          userMessage,
          options.apiKey
        );
      }

      // 9. Atualizar execution
      execution.currentState = nextState;
      execution.lastUserMessage = userMessage;
      execution.lastAiResponse = responseText;
      execution.stateHistory.push(nextState);
      execution.lastInteractionAt = new Date();

      // Marcar como completo se for estado final
      if (stateData.type === 'end') {
        execution.status = 'completed';
        execution.completedAt = new Date();
      }

      await this.saveExecution(execution);

      console.log(`   ✅ Resposta gerada: "${responseText.substring(0, 60)}..."`);
      console.log(`🎯 [DeterministicFlow] ════════════════════════════════\n`);

      return {
        text: responseText,
        mediaActions: [],
        state: nextState,
        flowData: execution.flowData
      };

    } catch (error) {
      console.error(`   ❌ Erro ao processar com DeterministicFlow:`, error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // INTERPRETAÇÃO DE INTENÇÃO (IA apenas interpreta, NÃO decide)
  // ═══════════════════════════════════════════════════════════════════════

  private async interpretUserIntent(
    userMessage: string,
    flowDef: FlowDefinition,
    execution: FlowExecution,
    apiKey?: string
  ): Promise<UserIntent> {

    if (!apiKey) {
      // Fallback: detecção simples por keywords
      return this.simpleIntentDetection(userMessage, flowDef);
    }

    const mistral = getMistralClient(apiKey);

    const prompt = `Você é um interpretador de intenções. Analise a mensagem do usuário e retorne APENAS um JSON com a intenção.

IMPORTANTE: Você NÃO deve tomar decisões, apenas INTERPRETAR a intenção.

Contexto:
- Tipo de negócio: ${flowDef.flowType}
- Nome do negócio: ${flowDef.businessName}
- Estado atual da conversa: ${execution.currentState}

Mensagem do usuário: "${userMessage}"

Retorne JSON neste formato EXATO:
{
  "category": "greeting|product_inquiry|price|schedule|support|purchase|other",
  "confidence": 0.0-1.0,
  "entities": {
    "product_name": "string ou null",
    "quantity": number ou null,
    "date": "string ou null",
    "time": "string ou null"
  }
}`;

    try {
      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 200
      });

      const content = response.choices?.[0]?.message?.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          category: parsed.category || 'other',
          confidence: parsed.confidence || 0.5,
          entities: parsed.entities || {},
          rawMessage: userMessage
        };
      }
    } catch (error) {
      console.error(`   ⚠️ Erro ao interpretar intenção com IA, usando fallback`);
    }

    return this.simpleIntentDetection(userMessage, flowDef);
  }

  private simpleIntentDetection(userMessage: string, flowDef: FlowDefinition): UserIntent {
    const lower = userMessage.toLowerCase();

    // Greeting
    if (/^(oi|olá|ola|bom dia|boa tarde|boa noite|hey|hello)/i.test(lower)) {
      return {
        category: 'greeting',
        confidence: 0.9,
        entities: {},
        rawMessage: userMessage
      };
    }

    // Price inquiry
    if (/(quanto custa|preço|valor|pre[cç]o)/i.test(lower)) {
      return {
        category: 'price',
        confidence: 0.8,
        entities: {},
        rawMessage: userMessage
      };
    }

    // Product inquiry
    if (/(produto|item|cardápio|menu|catálogo|tem|vende)/i.test(lower)) {
      return {
        category: 'product_inquiry',
        confidence: 0.7,
        entities: {},
        rawMessage: userMessage
      };
    }

    // Schedule
    if (/(agendar|horário|disponível|marcar|reserva)/i.test(lower)) {
      return {
        category: 'schedule',
        confidence: 0.8,
        entities: {},
        rawMessage: userMessage
      };
    }

    // Purchase intent
    if (/(quero|comprar|pedir|encomendar|finalizar)/i.test(lower)) {
      return {
        category: 'purchase',
        confidence: 0.8,
        entities: {},
        rawMessage: userMessage
      };
    }

    return {
      category: 'other',
      confidence: 0.5,
      entities: {},
      rawMessage: userMessage
    };
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DETERMINAÇÃO DO PRÓXIMO ESTADO (100% determinístico, SEM IA)
  // ═══════════════════════════════════════════════════════════════════════

  private determineNextState(
    flowDef: FlowDefinition,
    currentState: string,
    intent: UserIntent,
    userMessage: string
  ): string {

    const state = flowDef.states[currentState];
    if (!state) {
      console.error(`   ❌ Estado ${currentState} não encontrado`);
      return flowDef.initialState;
    }

    // Se o estado tem nextStates definidos, verificar match
    if (state.nextStates) {
      // Verificar match exato por palavra-chave
      for (const [keyword, nextState] of Object.entries(state.nextStates)) {
        if (userMessage.toLowerCase().includes(keyword.toLowerCase())) {
          return nextState;
        }
      }

      // Verificar match por categoria de intenção
      if (state.nextStates[intent.category]) {
        return state.nextStates[intent.category];
      }
    }

    // Se tem defaultNext, usar
    if (state.defaultNext) {
      return state.defaultNext;
    }

    // Se não tem próximo estado definido, permanecer no mesmo
    return currentState;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // EXECUÇÃO DE AÇÕES
  // ═══════════════════════════════════════════════════════════════════════

  private async executeAction(
    action: string,
    execution: FlowExecution,
    entities: Record<string, any>
  ): Promise<void> {

    console.log(`   🔧 Executando ação: ${action}`);

    switch (action) {
      case 'add_to_cart':
        if (!execution.flowData.cart) {
          execution.flowData.cart = [];
        }
        if (entities.product_name) {
          execution.flowData.cart.push({
            product: entities.product_name,
            quantity: entities.quantity || 1,
            addedAt: new Date().toISOString()
          });
        }
        break;

      case 'clear_cart':
        execution.flowData.cart = [];
        break;

      case 'save_preference':
        if (!execution.flowData.preferences) {
          execution.flowData.preferences = {};
        }
        Object.assign(execution.flowData.preferences, entities);
        break;

      case 'schedule_appointment':
        if (!execution.flowData.appointments) {
          execution.flowData.appointments = [];
        }
        execution.flowData.appointments.push({
          date: entities.date,
          time: entities.time,
          scheduledAt: new Date().toISOString()
        });
        break;

      default:
        console.log(`   ⚠️ Ação desconhecida: ${action}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // GERAÇÃO DE RESPOSTA A PARTIR DO TEMPLATE
  // ═══════════════════════════════════════════════════════════════════════

  private generateResponseFromTemplate(
    template: string,
    flowData: Record<string, any>,
    businessData: Record<string, any>,
    entities: Record<string, any>
  ): string {

    let response = template;

    // Substituir variáveis do tipo {{variable}}
    response = response.replace(/\{\{([^}]+)\}\}/g, (match, varName) => {
      const trimmed = varName.trim();

      // Tentar em businessData primeiro
      if (businessData[trimmed] !== undefined) {
        return String(businessData[trimmed]);
      }

      // Tentar em flowData
      if (flowData[trimmed] !== undefined) {
        return String(flowData[trimmed]);
      }

      // Tentar em entities
      if (entities[trimmed] !== undefined) {
        return String(entities[trimmed]);
      }

      // Se não encontrou, manter o placeholder
      return match;
    });

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // HUMANIZAÇÃO DA RESPOSTA (IA apenas torna mais natural)
  // ═══════════════════════════════════════════════════════════════════════

  private async humanizeResponse(
    responseText: string,
    flowDef: FlowDefinition,
    userMessage: string,
    apiKey: string
  ): Promise<string> {

    const mistral = getMistralClient(apiKey);

    const prompt = `Você é ${flowDef.agentName}, um assistente ${flowDef.agentPersonality}.

IMPORTANTE: Você está HUMANIZANDO uma resposta. NÃO invente informações, NÃO tome decisões.

Resposta base (gerada pelo sistema):
"${responseText}"

Mensagem do usuário:
"${userMessage}"

TAREFA: Reescreva a resposta de forma mais natural e humana, mantendo EXATAMENTE o mesmo conteúdo e informações.

REGRAS:
- Mantenha todas as informações da resposta original
- Não adicione informações novas
- Não remova informações
- Apenas torne mais conversacional e natural
- Use no máximo 2 emojis
- Seja breve (WhatsApp)

Resposta humanizada:`;

    try {
      const response = await mistral.chat.complete({
        model: 'mistral-small-latest',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.3,
        maxTokens: 300
      });

      const humanized = response.choices?.[0]?.message?.content?.trim();
      if (humanized && humanized.length > 10) {
        return humanized;
      }
    } catch (error) {
      console.error(`   ⚠️ Erro ao humanizar resposta, usando original`);
    }

    return responseText;
  }

  // ═══════════════════════════════════════════════════════════════════════
  // PERSISTÊNCIA
  // ═══════════════════════════════════════════════════════════════════════

  private async loadFlowDefinition(userId: string): Promise<FlowDefinition | null> {
    try {
      // Determinar qual módulo está ativo
      const { data: activeModule } = await supabase
        .from('user_active_modules')
        .select('active_module')
        .eq('user_id', userId)
        .single();

      const flowType = activeModule?.active_module || 'GENERICO';

      // Carregar FlowDefinition
      const { data, error } = await supabase
        .from('flow_definitions')
        .select('*')
        .eq('user_id', userId)
        .eq('flow_type', flowType)
        .eq('is_active', true)
        .single();

      if (error || !data) {
        return null;
      }

      return {
        id: data.id,
        userId: data.user_id,
        flowType: data.flow_type,
        agentName: data.agent_name,
        businessName: data.business_name,
        agentPersonality: data.agent_personality,
        states: data.flow_definition.states,
        initialState: data.flow_definition.initialState || data.flow_definition.defaultState,
        businessData: data.business_data || {},
        globalRules: data.global_rules || [],
        version: data.version,
        sourcePrompt: data.source_prompt,
        isActive: data.is_active,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at)
      };

    } catch (error) {
      console.error(`   ❌ Erro ao carregar FlowDefinition:`, error);
      return null;
    }
  }

  private async loadOrCreateExecution(
    userId: string,
    conversationId: string,
    flowDefinitionId: string,
    options?: { contactName?: string; contactPhone?: string }
  ): Promise<FlowExecution> {

    try {
      // Tentar carregar execution existente
      const { data, error } = await supabase
        .from('flow_executions')
        .select('*')
        .eq('user_id', userId)
        .eq('conversation_id', conversationId)
        .eq('status', 'active')
        .single();

      if (!error && data) {
        return {
          id: data.id,
          flowDefinitionId: data.flow_definition_id,
          userId: data.user_id,
          conversationId: data.conversation_id,
          contactName: data.contact_name,
          contactPhone: data.contact_phone,
          currentState: data.current_state,
          flowData: data.flow_data || {},
          stateHistory: data.state_history || [],
          lastUserMessage: data.last_user_message,
          lastAiResponse: data.last_ai_response,
          status: data.status,
          startedAt: new Date(data.started_at),
          lastInteractionAt: new Date(data.last_interaction_at),
          completedAt: data.completed_at ? new Date(data.completed_at) : undefined
        };
      }

    } catch (err) {
      console.log(`   ℹ️ Execution não encontrada, criando nova`);
    }

    // Criar nova execution
    const flowDef = await this.loadFlowDefinition(userId);
    const initialState = flowDef?.initialState || 'start';

    const newExecution: FlowExecution = {
      id: crypto.randomUUID(),
      flowDefinitionId,
      userId,
      conversationId,
      contactName: options?.contactName,
      contactPhone: options?.contactPhone,
      currentState: initialState,
      flowData: {},
      stateHistory: [initialState],
      status: 'active',
      startedAt: new Date(),
      lastInteractionAt: new Date()
    };

    await this.saveExecution(newExecution);

    return newExecution;
  }

  private async saveExecution(execution: FlowExecution): Promise<void> {
    try {
      const { error } = await supabase
        .from('flow_executions')
        .upsert({
          id: execution.id,
          flow_definition_id: execution.flowDefinitionId,
          user_id: execution.userId,
          conversation_id: execution.conversationId,
          contact_name: execution.contactName,
          contact_phone: execution.contactPhone,
          current_state: execution.currentState,
          flow_data: execution.flowData,
          state_history: execution.stateHistory,
          last_user_message: execution.lastUserMessage,
          last_ai_response: execution.lastAiResponse,
          status: execution.status,
          started_at: execution.startedAt.toISOString(),
          last_interaction_at: execution.lastInteractionAt.toISOString(),
          completed_at: execution.completedAt?.toISOString()
        }, {
          onConflict: 'user_id,conversation_id'
        });

      if (error) {
        console.error(`   ❌ Erro ao salvar execution:`, error);
      }

    } catch (error) {
      console.error(`   ❌ Erro ao salvar execution:`, error);
    }
  }
}
