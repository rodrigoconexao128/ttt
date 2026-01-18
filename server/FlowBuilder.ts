/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🏗️ FLOW BUILDER - Construtor de Fluxos a partir de Prompts
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Analisa prompts existentes (texto livre) e converte em FlowDefinitions
 * estruturadas para o sistema híbrido (IA Interpreta + Sistema Executa)
 * 
 * TIPOS DE FLUXO:
 * - DELIVERY: Pizzarias, restaurantes, lanchonetes
 * - VENDAS: Agências, SaaS, serviços B2B
 * - AGENDAMENTO: Clínicas, salões, consultórios
 * - SUPORTE: SAC, help desk, suporte técnico
 * - GENERICO: Fallback para casos não identificados
 */

import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════════════════
// 📊 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════

export type FlowType = 'DELIVERY' | 'VENDAS' | 'AGENDAMENTO' | 'SUPORTE' | 'GENERICO';

export interface FlowState {
  name: string;
  description: string;
  transitions: Array<{
    intent: string;
    nextState: string;
    action: string;
    condition?: string;
  }>;
  onEnter?: string;  // Ação ao entrar no estado
  onExit?: string;   // Ação ao sair do estado
}

export interface FlowIntent {
  name: string;
  examples: string[];  // Exemplos de frases que ativam essa intenção
  patterns?: string[]; // Padrões regex para matching
  entities?: string[]; // Entidades a extrair (product, quantity, address, etc.)
  priority?: number;   // Prioridade de matching (maior = primeiro)
}

export interface FlowAction {
  name: string;
  type: 'RESPONSE' | 'DATA' | 'EXTERNAL' | 'MEDIA';
  template?: string;      // Template de resposta
  dataSource?: string;    // Fonte de dados (menu, faq, prices)
  mediaTag?: string;      // Tag de mídia [ENVIAR_MIDIA:...]
  variables?: string[];   // Variáveis usadas no template
}

export interface FlowData {
  // Para DELIVERY
  menu?: Array<{ id: string; name: string; price: number; category: string }>;
  delivery_fee?: number;
  min_order?: number;
  payment_methods?: string[];
  delivery_time?: string;
  
  // Para VENDAS
  prices?: Record<string, number>;
  links?: Record<string, string>;
  coupons?: Record<string, { discount: number; code: string }>;
  faq?: Array<{ question: string; answer: string }>;
  
  // Para AGENDAMENTO
  services?: Array<{ name: string; duration: number; price: number }>;
  business_hours?: Record<string, { open: string; close: string }>;
  
  // Para SUPORTE
  kb_articles?: Array<{ title: string; content: string; keywords: string[] }>;
}

export interface FlowDefinition {
  id: string;
  version: string;
  type: FlowType;
  businessName: string;
  businessDescription?: string;
  
  // Configuração do agente
  agentName: string;
  agentPersonality: string;  // Tom de voz, estilo
  
  // Estados do fluxo
  initialState: string;
  finalStates: string[];
  states: Record<string, FlowState>;
  
  // Intenções reconhecidas
  intents: Record<string, FlowIntent>;
  
  // Ações disponíveis
  actions: Record<string, FlowAction>;
  
  // Dados do negócio
  data: FlowData;
  
  // Regras globais
  globalRules: string[];
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  sourcePrompt?: string;  // Prompt original se migrado
}

// ═══════════════════════════════════════════════════════════════════════
// 🔍 PROMPT ANALYZER - Analisa e classifica prompts
// ═══════════════════════════════════════════════════════════════════════

export class PromptAnalyzer {
  
  /**
   * Detecta o tipo de negócio baseado no prompt
   */
  detectFlowType(prompt: string): FlowType {
    const promptLower = prompt.toLowerCase();
    
    // DELIVERY: Palavras-chave de delivery/restaurante
    const deliveryKeywords = [
      'cardápio', 'menu', 'pizza', 'hamburguer', 'lanche', 'delivery',
      'entrega', 'pedido', 'carrinho', 'ifood', 'motoboy', 'comida',
      'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'açaí',
      'sobremesa', 'bebida', 'refrigerante', 'taxa de entrega', 'esfiha'
    ];
    
    // AGENDAMENTO: Palavras-chave de serviços agendados
    const agendamentoKeywords = [
      'agendar', 'agendamento', 'consulta', 'horário', 'disponível',
      'clínica', 'consultório', 'salão', 'barbearia', 'dentista',
      'médico', 'advogado', 'psicólogo', 'personal', 'academia',
      'aula', 'sessão', 'atendimento presencial'
    ];
    
    // VENDAS: Palavras-chave de vendas B2B/SaaS/Serviços
    const vendasKeywords = [
      'plano', 'assinatura', 'mensalidade', 'cupom', 'desconto',
      'demonstração', 'teste grátis', 'trial', 'implementação',
      'cadastro', 'conta', 'funcionalidade', 'feature', 'saas',
      'software', 'plataforma', 'sistema', 'ferramenta',
      // Serviços e Comércio
      'orçamento', 'honorário', 'contrat', 'serviço', 'venda', 'compra',
      'preço', 'valor', 'pagamento', 'pix', 'cartão',
      // Gráficas e lojas específicas
      'gráfica', 'banner', 'adesivo', 'impressão', 'copos', 'personalizado',
      'peças', 'conserto', 'moto', 'carro', 'loja', 'estoque',
      // Consultoria
      'assessoria', 'consultoria', 'cpf', 'cnpj', 'crédito', 'limpa nome'
    ];
    
    // SUPORTE: Palavras-chave de suporte técnico
    const suporteKeywords = [
      'suporte', 'ajuda', 'problema', 'erro', 'bug', 'ticket',
      'reclamação', 'dúvida técnica', 'não funciona', 'tutorial',
      'como usar', 'passo a passo', 'instalação', 'internet lenta',
      'modem', 'roteador', 'conexão', 'sinal', 'mbps'
    ];
    
    // Contar matches
    const countMatches = (keywords: string[]) => 
      keywords.filter(kw => promptLower.includes(kw)).length;
    
    const scores = {
      DELIVERY: countMatches(deliveryKeywords),
      AGENDAMENTO: countMatches(agendamentoKeywords),
      VENDAS: countMatches(vendasKeywords),
      SUPORTE: countMatches(suporteKeywords),
    };
    
    // Encontrar o tipo com maior score
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'GENERICO';
    
    const topType = Object.entries(scores).find(([_, score]) => score === maxScore);
    return (topType?.[0] as FlowType) || 'GENERICO';
  }
  
  /**
   * Extrai nome do agente do prompt
   */
  extractAgentName(prompt: string): string {
    // Padrões comuns (em ordem de especificidade)
    const patterns = [
      /NOME DA IA:\s*(\w+)/i,                    // NOME DA IA: Thais
      /seu nome é\s+\*?\*?(\w+)\*?\*?/i,         // Seu nome é Ana
      /você é \*?\*?(\w+)\*?\*?[,.\s]/i,         // Você é **Rodrigo**,
      /sou (?:o |a )?(\w+)[,.\s]/i,              // Sou o Rodrigo, Sou a Ana
      /me chamo (\w+)/i,                          // Me chamo X
      /meu nome é (\w+)/i,                        // Meu nome é X
      /\[(\w+)\]\s*-/i,                           // [Nome] - descrição
      /assistente.*?(?:é|chamada?)\s+\*?\*?(\w+)\*?\*?/i,  // assistente...é Ana
    ];
    
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1].length > 1 && match[1].toLowerCase() !== 'a' && match[1].toLowerCase() !== 'o') {
        return match[1];
      }
    }
    
    return 'Atendente';
  }
  
  /**
   * Extrai nome do negócio do prompt
   */
  extractBusinessName(prompt: string): string {
    // Padrões comuns (em ordem de especificidade)
    const patterns = [
      /\*\*([A-Z][A-Za-z0-9\s&]+?)\*\*\s*[-–]/,          // **Novo Sabor** -
      /(?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+?)(?:\*?\*?[,.\n])/,
      /atendente (?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /bem[- ]vindo (?:à|ao|a)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /especialista (?:da|do)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /(?:empresa|negócio|loja):\s*\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1].trim().length > 2) {
        return match[1].trim();
      }
    }
    
    return 'Meu Negócio';
  }
  
  /**
   * Extrai preços mencionados no prompt
   */
  extractPrices(prompt: string): Record<string, number> {
    const prices: Record<string, number> = {};
    
    // Padrão: R$ XX ou XX reais
    const pricePatterns = [
      /R\$\s?(\d+(?:[.,]\d{2})?)/gi,
      /(\d+(?:[.,]\d{2})?)\s*reais/gi,
    ];
    
    // Contextos de preço
    const contextPatterns = [
      { pattern: /plano.*?R\$\s?(\d+)/i, key: 'plano_mensal' },
      { pattern: /implementa[çc][aã]o.*?R\$\s?(\d+)/i, key: 'implementacao' },
      { pattern: /promo[çc][aã]o.*?R\$\s?(\d+)/i, key: 'promo' },
      { pattern: /cupom.*?R\$\s?(\d+)/i, key: 'desconto' },
      { pattern: /taxa.*?R\$\s?(\d+)/i, key: 'taxa_entrega' },
    ];
    
    for (const { pattern, key } of contextPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        prices[key] = parseFloat(match[1].replace(',', '.'));
      }
    }
    
    return prices;
  }
  
  /**
   * Extrai links do prompt
   */
  extractLinks(prompt: string): Record<string, string> {
    const links: Record<string, string> = {};
    
    // Encontrar todas URLs
    const urlPattern = /https?:\/\/[^\s\)]+/gi;
    const urls = prompt.match(urlPattern) || [];
    
    for (const url of urls) {
      if (url.includes('cadastro') || url.includes('signup')) {
        links['cadastro'] = url;
      } else if (url.includes('promo') || url.includes('plano')) {
        links['promocao'] = url;
      } else if (url.includes('tutorial') || url.includes('video')) {
        links['tutorial'] = url;
      } else {
        links['site'] = url;
      }
    }
    
    return links;
  }
  
  /**
   * Extrai cupons do prompt
   */
  extractCoupons(prompt: string): Record<string, { discount: number; code: string }> {
    const coupons: Record<string, { discount: number; code: string }> = {};
    
    // Padrão: código em MAIÚSCULAS
    const couponPattern = /cupom[:\s]+\*?\*?([A-Z0-9]+)\*?\*?/gi;
    let match;
    
    while ((match = couponPattern.exec(prompt)) !== null) {
      coupons[match[1]] = {
        code: match[1],
        discount: 0 // Será preenchido se encontrar contexto
      };
    }
    
    return coupons;
  }
  
  /**
   * Extrai personalidade/tom de voz
   */
  extractPersonality(prompt: string): string {
    const traits: string[] = [];
    
    if (/informal|natural|humano/i.test(prompt)) traits.push('informal');
    if (/formal|profissional/i.test(prompt)) traits.push('formal');
    if (/amig[aá]vel|simpático/i.test(prompt)) traits.push('amigável');
    if (/direto|objetivo/i.test(prompt)) traits.push('direto');
    if (/empático|acolhedor/i.test(prompt)) traits.push('empático');
    if (/divertido|descontraído/i.test(prompt)) traits.push('descontraído');
    
    return traits.length > 0 ? traits.join(', ') : 'profissional e amigável';
  }
  
  /**
   * Extrai regras globais do prompt
   */
  extractGlobalRules(prompt: string): string[] {
    const rules: string[] = [];
    
    // Padrões de regras: "NUNCA", "SEMPRE", "NÃO"
    const rulePatterns = [
      /NUNCA\s+(.+?)(?:\.|$)/gi,
      /SEMPRE\s+(.+?)(?:\.|$)/gi,
      /NÃO\s+(.+?)(?:\.|$)/gi,
      /IMPORTANTE:\s*(.+?)(?:\.|$)/gi,
      /REGRA[S]?:\s*(.+?)(?:\.|$)/gi,
    ];
    
    for (const pattern of rulePatterns) {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        rules.push(match[1].trim());
      }
    }
    
    return rules;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🏗️ FLOW BUILDER - Constrói FlowDefinitions
// ═══════════════════════════════════════════════════════════════════════

export class FlowBuilder {
  private analyzer: PromptAnalyzer;
  private anthropic?: Anthropic;
  
  constructor(anthropicApiKey?: string) {
    this.analyzer = new PromptAnalyzer();
    if (anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    }
  }
  
  /**
   * Constrói FlowDefinition a partir de um prompt existente
   */
  async buildFromPrompt(prompt: string, userId?: string): Promise<FlowDefinition> {
    console.log('[FlowBuilder] Analisando prompt...');
    
    // 1. Detectar tipo
    const flowType = this.analyzer.detectFlowType(prompt);
    console.log(`[FlowBuilder] Tipo detectado: ${flowType}`);
    
    // 2. Extrair informações básicas
    const agentName = this.analyzer.extractAgentName(prompt);
    const businessName = this.analyzer.extractBusinessName(prompt);
    const personality = this.analyzer.extractPersonality(prompt);
    const prices = this.analyzer.extractPrices(prompt);
    const links = this.analyzer.extractLinks(prompt);
    const coupons = this.analyzer.extractCoupons(prompt);
    const globalRules = this.analyzer.extractGlobalRules(prompt);
    
    console.log(`[FlowBuilder] Agente: ${agentName}, Negócio: ${businessName}`);
    
    // 3. Construir flow base por tipo
    let flow: FlowDefinition;
    
    switch (flowType) {
      case 'DELIVERY':
        flow = this.buildDeliveryFlow(agentName, businessName, personality);
        break;
      case 'VENDAS':
        flow = this.buildVendasFlow(agentName, businessName, personality);
        break;
      case 'AGENDAMENTO':
        flow = this.buildAgendamentoFlow(agentName, businessName, personality);
        break;
      case 'SUPORTE':
        flow = this.buildSuporteFlow(agentName, businessName, personality);
        break;
      default:
        flow = this.buildGenericoFlow(agentName, businessName, personality);
    }
    
    // 4. Enriquecer com dados extraídos
    flow.data.prices = prices;
    flow.data.links = links;
    flow.data.coupons = coupons;
    flow.globalRules = globalRules;
    flow.sourcePrompt = prompt;
    
    // 5. Se tiver IA disponível, fazer análise profunda
    if (this.anthropic) {
      flow = await this.enrichWithAI(flow, prompt);
    }
    
    return flow;
  }
  
  /**
   * Constrói flow de DELIVERY (pizzarias, restaurantes)
   */
  buildDeliveryFlow(agentName: string, businessName: string, personality: string): FlowDefinition {
    return {
      id: `delivery_${Date.now()}`,
      version: '1.0.0',
      type: 'DELIVERY',
      businessName,
      agentName,
      agentPersonality: personality,
      
      initialState: 'INICIO',
      finalStates: ['PEDIDO_FINALIZADO', 'CANCELADO'],
      
      states: {
        INICIO: {
          name: 'Início',
          description: 'Aguardando primeira mensagem',
          transitions: [
            { intent: 'GREETING', nextState: 'SAUDACAO', action: 'GREET' },
            { intent: 'WANT_MENU', nextState: 'MENU', action: 'SHOW_MENU' },
            { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
          ]
        },
        SAUDACAO: {
          name: 'Saudação',
          description: 'Cliente acabou de chegar',
          transitions: [
            { intent: 'WANT_MENU', nextState: 'MENU', action: 'SHOW_MENU' },
            { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
            { intent: 'ASK_HOURS', nextState: 'SAUDACAO', action: 'INFO_HOURS' },
            { intent: 'ASK_DELIVERY_FEE', nextState: 'SAUDACAO', action: 'INFO_FEE' },
          ]
        },
        MENU: {
          name: 'Menu',
          description: 'Mostrando cardápio',
          transitions: [
            { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
            { intent: 'ASK_PRODUCT_INFO', nextState: 'MENU', action: 'PRODUCT_INFO' },
          ]
        },
        PEDINDO: {
          name: 'Fazendo Pedido',
          description: 'Cliente adicionando itens',
          transitions: [
            { intent: 'ADD_ITEM', nextState: 'PEDINDO', action: 'ADD_TO_CART' },
            { intent: 'REMOVE_ITEM', nextState: 'PEDINDO', action: 'REMOVE_FROM_CART' },
            { intent: 'SEE_CART', nextState: 'PEDINDO', action: 'SHOW_CART' },
            { intent: 'CONFIRM_ORDER', nextState: 'TIPO_ENTREGA', action: 'ASK_DELIVERY_TYPE' },
            { intent: 'CANCEL_ORDER', nextState: 'CANCELADO', action: 'CANCEL' },
            { intent: 'CHOOSE_DELIVERY', nextState: 'ENDERECO', action: 'ASK_ADDRESS' },
            { intent: 'CHOOSE_PICKUP', nextState: 'PAGAMENTO', action: 'ASK_PAYMENT' },
          ]
        },
        TIPO_ENTREGA: {
          name: 'Tipo de Entrega',
          description: 'Escolhendo delivery ou retirada',
          transitions: [
            { intent: 'CHOOSE_DELIVERY', nextState: 'ENDERECO', action: 'ASK_ADDRESS' },
            { intent: 'CHOOSE_PICKUP', nextState: 'PAGAMENTO', action: 'ASK_PAYMENT' },
          ]
        },
        ENDERECO: {
          name: 'Endereço',
          description: 'Coletando endereço',
          transitions: [
            { intent: 'PROVIDE_ADDRESS', nextState: 'PAGAMENTO', action: 'SAVE_ADDRESS' },
            { intent: 'CHOOSE_PAYMENT', nextState: 'CONFIRMACAO', action: 'SHOW_SUMMARY' },
          ]
        },
        PAGAMENTO: {
          name: 'Pagamento',
          description: 'Escolhendo forma de pagamento',
          transitions: [
            { intent: 'CHOOSE_PAYMENT', nextState: 'CONFIRMACAO', action: 'SHOW_SUMMARY' },
            { intent: 'PROVIDE_ADDRESS', nextState: 'PAGAMENTO', action: 'SAVE_ADDRESS' },
          ]
        },
        CONFIRMACAO: {
          name: 'Confirmação',
          description: 'Confirmando pedido',
          transitions: [
            { intent: 'CONFIRM_ORDER', nextState: 'PEDIDO_FINALIZADO', action: 'CREATE_ORDER' },
            { intent: 'CANCEL_ORDER', nextState: 'CANCELADO', action: 'CANCEL' },
          ]
        },
        PEDIDO_FINALIZADO: {
          name: 'Pedido Finalizado',
          description: 'Pedido criado com sucesso',
          transitions: []
        },
        CANCELADO: {
          name: 'Cancelado',
          description: 'Pedido cancelado',
          transitions: [
            { intent: 'GREETING', nextState: 'INICIO', action: 'GREET' },
          ]
        }
      },
      
      intents: {
        GREETING: {
          name: 'Saudação',
          examples: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'eai', 'opa'],
          patterns: ['^(oi|ola|bom\\s+dia|boa\\s+(tarde|noite)|e\\s*a[ií]|opa)[!?.,]?$'],
          priority: 10
        },
        WANT_MENU: {
          name: 'Ver Cardápio',
          examples: ['cardápio', 'menu', 'o que tem', 'quais opções', 'me manda o cardápio'],
          patterns: ['card[áa]pio', 'menu', 'o\\s+que\\s+tem', 'op[çc][õo]es'],
          priority: 8
        },
        ADD_ITEM: {
          name: 'Adicionar Item',
          examples: ['quero', 'me vê', 'manda', 'adiciona', 'pode ser', 'quero uma', 'quero mais'],
          patterns: ['quero\\s+(uma?|\\d+)', 'me\\s+v[êe]', 'adiciona', 'manda\\s+(uma?|\\d+)'],
          entities: ['product', 'quantity'],
          priority: 9
        },
        REMOVE_ITEM: {
          name: 'Remover Item',
          examples: ['tira', 'remove', 'sem', 'não quero mais'],
          patterns: ['tira', 'remove', 'n[ãa]o\\s+quero\\s+mais'],
          entities: ['product'],
          priority: 7
        },
        SEE_CART: {
          name: 'Ver Carrinho',
          examples: ['meu pedido', 'o que pedi', 'meu carrinho', 'total', 'ver pedido'],
          patterns: ['meu\\s+pedido', 'o\\s+que\\s+pedi', 'carrinho', 'ver\\s+pedido'],
          priority: 6
        },
        CONFIRM_ORDER: {
          name: 'Confirmar',
          examples: ['isso', 'fechado', 'pode fechar', 'confirma', 'ok', 'fechar pedido', 'finalizar'],
          patterns: ['fechado?', 'confirma', 'finaliza', '^ok$', '^isso$'],
          priority: 8
        },
        CANCEL_ORDER: {
          name: 'Cancelar',
          examples: ['cancela', 'desisto', 'não quero', 'deixa pra lá'],
          patterns: ['cancela', 'desisto', 'deixa\\s+pra\\s+l[áa]'],
          priority: 8
        },
        CHOOSE_DELIVERY: {
          name: 'Delivery',
          examples: ['delivery', 'entrega', 'manda pra mim', 'quero entrega', 'entregar'],
          patterns: ['^delivery$', 'entrega', 'manda\\s+pra\\s+mim', 'entregar'],
          priority: 7
        },
        CHOOSE_PICKUP: {
          name: 'Retirada',
          examples: ['buscar', 'retirar', 'retirada', 'vou ai', 'vou buscar', 'retiro'],
          patterns: ['buscar', 'retirar', 'retirada', 'vou\\s+a[íi]', 'retiro'],
          priority: 7
        },
        PROVIDE_ADDRESS: {
          name: 'Endereço',
          examples: ['rua', 'avenida', 'número'],
          patterns: ['rua\\s+', 'avenida\\s+', 'av\\.?\\s+', 'n[úu]mero\\s+\\d+', 'n[ºo]\\s*\\d+'],
          entities: ['address'],
          priority: 6
        },
        CHOOSE_PAYMENT: {
          name: 'Pagamento',
          examples: ['pix', 'dinheiro', 'cartão', 'pago em', 'vou pagar'],
          patterns: ['^pix$', '^dinheiro$', 'cart[ãa]o', 'pago\\s+em', 'vou\\s+pagar'],
          entities: ['payment_method'],
          priority: 7
        },
        ASK_HOURS: {
          name: 'Horário',
          examples: ['horário', 'abre', 'fecha', 'funciona'],
          patterns: ['hor[áa]rio', 'abre', 'fecha', 'funciona'],
          priority: 5
        },
        ASK_DELIVERY_FEE: {
          name: 'Taxa',
          examples: ['taxa', 'frete', 'quanto a entrega'],
          patterns: ['taxa', 'frete', 'quanto\\s+(a|custa)\\s+entrega'],
          priority: 5
        },
        ASK_PRODUCT_INFO: {
          name: 'Info Produto',
          examples: ['quanto custa', 'tem', 'qual o preço'],
          patterns: ['quanto\\s+custa', 'qual\\s+o?\\s*pre[çc]o'],
          entities: ['product'],
          priority: 6
        },
      },
      
      actions: {
        GREET: {
          name: 'Saudar',
          type: 'RESPONSE',
          template: 'Olá! 😊 Bem-vindo ao {business_name}! Posso te enviar nosso cardápio ou você já sabe o que quer pedir?',
          variables: ['business_name']
        },
        SHOW_MENU: {
          name: 'Mostrar Menu',
          type: 'DATA',
          dataSource: 'menu',
          template: '📋 *CARDÁPIO {business_name}*\n\n{menu_formatted}\n\nO que vai querer?'
        },
        ADD_TO_CART: {
          name: 'Adicionar ao Carrinho',
          type: 'DATA',
          template: '✅ Adicionei {quantity}x {product}!\n\n🛒 Seu pedido:\n{cart_summary}\n\n💰 Total: R$ {total}\n\nMais algo ou posso fechar?'
        },
        SHOW_CART: {
          name: 'Mostrar Carrinho',
          type: 'DATA',
          template: '🛒 *Seu Pedido:*\n\n{cart_summary}\n\n💰 Total: R$ {total}'
        },
        ASK_DELIVERY_TYPE: {
          name: 'Perguntar Tipo Entrega',
          type: 'RESPONSE',
          template: '🛵 Vai ser *delivery* ou *retirada* no local?'
        },
        ASK_ADDRESS: {
          name: 'Perguntar Endereço',
          type: 'RESPONSE',
          template: '📍 Qual seu endereço de entrega?'
        },
        SAVE_ADDRESS: {
          name: 'Salvar Endereço',
          type: 'DATA',
          template: '📍 Entrega em: {address}\n\n💳 Como vai pagar? (Pix, Cartão ou Dinheiro)'
        },
        ASK_PAYMENT: {
          name: 'Perguntar Pagamento',
          type: 'RESPONSE',
          template: '💳 Como vai pagar? (Pix, Cartão ou Dinheiro)'
        },
        SHOW_SUMMARY: {
          name: 'Mostrar Resumo',
          type: 'DATA',
          template: '📋 *RESUMO DO PEDIDO*\n\n{cart_summary}\n\n🛵 {delivery_type}\n📍 {address}\n💳 {payment_method}\n\n💰 *TOTAL: R$ {total}*\n\n✅ Confirma?'
        },
        CREATE_ORDER: {
          name: 'Criar Pedido',
          type: 'EXTERNAL',
          template: '🎉 Pedido #{order_id} confirmado!\n\n⏱️ {delivery_time}\n\nObrigado pela preferência! 😊'
        },
        CANCEL: {
          name: 'Cancelar',
          type: 'RESPONSE',
          template: 'Pedido cancelado! Se mudar de ideia é só chamar 😊'
        },
        INFO_HOURS: {
          name: 'Informar Horário',
          type: 'DATA',
          dataSource: 'business_hours',
          template: '🕐 Nosso horário: {hours}'
        },
        INFO_FEE: {
          name: 'Informar Taxa',
          type: 'DATA',
          dataSource: 'delivery_fee',
          template: '🛵 Taxa de entrega: R$ {delivery_fee}'
        },
      },
      
      data: {
        menu: [],
        payment_methods: ['Pix', 'Cartão', 'Dinheiro'],
        delivery_fee: 5,
        min_order: 20,
        delivery_time: '40-60 min',
      },
      
      globalRules: [
        'Nunca inventar produtos que não estão no cardápio',
        'Sempre confirmar o pedido antes de finalizar',
        'Ser simpático e usar emojis moderadamente'
      ],
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Constrói flow de VENDAS (SaaS, agências, B2B)
   */
  buildVendasFlow(agentName: string, businessName: string, personality: string): FlowDefinition {
    return {
      id: `vendas_${Date.now()}`,
      version: '1.0.0',
      type: 'VENDAS',
      businessName,
      agentName,
      agentPersonality: personality,
      
      initialState: 'INICIO',
      finalStates: ['CADASTRADO', 'NAO_INTERESSADO'],
      
      states: {
        INICIO: {
          name: 'Início',
          description: 'Primeira interação',
          transitions: [
            { intent: 'GREETING', nextState: 'QUALIFICANDO', action: 'GREET_SALES' },
            { intent: 'ASK_HOW_WORKS', nextState: 'EXPLICANDO', action: 'EXPLAIN_SOLUTION' },
            { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
          ]
        },
        QUALIFICANDO: {
          name: 'Qualificando',
          description: 'Entendendo necessidade',
          transitions: [
            { intent: 'TELL_BUSINESS', nextState: 'EXPLICANDO', action: 'PERSONALIZE_PITCH' },
            { intent: 'ASK_HOW_WORKS', nextState: 'EXPLICANDO', action: 'EXPLAIN_SOLUTION' },
            { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
            { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
          ]
        },
        EXPLICANDO: {
          name: 'Explicando',
          description: 'Explicando a solução',
          transitions: [
            { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
            { intent: 'ASK_FEATURES', nextState: 'EXPLICANDO', action: 'EXPLAIN_FEATURES' },
            { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
            { intent: 'ASK_TECHNICAL', nextState: 'EXPLICANDO', action: 'ANSWER_TECHNICAL' },
          ]
        },
        PRECOS: {
          name: 'Preços',
          description: 'Falando sobre valores',
          transitions: [
            { intent: 'ASK_COUPON', nextState: 'PRECOS', action: 'EXPLAIN_COUPON' },
            { intent: 'ASK_PROMO', nextState: 'PRECOS', action: 'SHOW_PROMO' },
            { intent: 'ASK_IMPLEMENTATION', nextState: 'PRECOS', action: 'EXPLAIN_IMPL' },
            { intent: 'WANT_DEMO', nextState: 'DEMO', action: 'OFFER_TRIAL' },
            { intent: 'CONFIRM', nextState: 'FECHANDO', action: 'CLOSE_SALE' },
          ]
        },
        DEMO: {
          name: 'Demo',
          description: 'Oferecendo teste',
          transitions: [
            { intent: 'CONFIRM', nextState: 'CADASTRADO', action: 'SEND_SIGNUP_LINK' },
            { intent: 'ASK_PRICE', nextState: 'PRECOS', action: 'SHOW_PRICES' },
          ]
        },
        FECHANDO: {
          name: 'Fechando',
          description: 'Fechando venda',
          transitions: [
            { intent: 'CONFIRM', nextState: 'CADASTRADO', action: 'SEND_SIGNUP_LINK' },
            { intent: 'OBJECTION', nextState: 'EXPLICANDO', action: 'HANDLE_OBJECTION' },
          ]
        },
        CADASTRADO: {
          name: 'Cadastrado',
          description: 'Cliente se cadastrou',
          transitions: [
            { intent: 'ASK_HELP', nextState: 'CADASTRADO', action: 'OFFER_SUPPORT' },
          ]
        },
        NAO_INTERESSADO: {
          name: 'Não Interessado',
          description: 'Cliente não quis',
          transitions: [
            { intent: 'GREETING', nextState: 'INICIO', action: 'GREET_SALES' },
          ]
        }
      },
      
      intents: {
        GREETING: {
          name: 'Saudação',
          examples: ['oi', 'olá', 'bom dia', 'vi seu anúncio'],
          priority: 10
        },
        ASK_HOW_WORKS: {
          name: 'Como Funciona',
          examples: ['como funciona', 'o que faz', 'me explica', 'quero entender'],
          priority: 9
        },
        ASK_PRICE: {
          name: 'Preço',
          examples: ['quanto custa', 'qual o valor', 'preço', 'quanto é'],
          priority: 9
        },
        ASK_PROMO: {
          name: 'Promoção',
          examples: ['promoção', 'desconto', 'vi o anúncio de', 'R$49'],
          priority: 8
        },
        ASK_COUPON: {
          name: 'Cupom',
          examples: ['cupom', 'onde coloco', 'código', 'não funciona'],
          priority: 7
        },
        ASK_IMPLEMENTATION: {
          name: 'Implementação',
          examples: ['implementação', 'vocês configuram', 'setup', 'R$199'],
          priority: 7
        },
        ASK_FEATURES: {
          name: 'Funcionalidades',
          examples: ['funcionalidades', 'o que tem', 'recursos', 'features'],
          priority: 6
        },
        ASK_TECHNICAL: {
          name: 'Técnico',
          examples: ['precisa', 'PC ligado', 'integra', 'como configura'],
          priority: 6
        },
        WANT_DEMO: {
          name: 'Quer Demo',
          examples: ['quero testar', 'como testo', 'tem trial', 'teste grátis'],
          priority: 8
        },
        TELL_BUSINESS: {
          name: 'Conta Negócio',
          examples: ['sou', 'tenho', 'minha empresa', 'trabalho com'],
          entities: ['business_type'],
          priority: 5
        },
        CONFIRM: {
          name: 'Confirmar',
          examples: ['quero', 'vou cadastrar', 'ok', 'fechado', 'pode ser'],
          priority: 8
        },
        OBJECTION: {
          name: 'Objeção',
          examples: ['caro', 'não sei', 'vou pensar', 'depois'],
          priority: 5
        },
        ASK_HELP: {
          name: 'Pedir Ajuda',
          examples: ['ajuda', 'não consigo', 'como faço', 'dúvida'],
          priority: 7
        },
      },
      
      actions: {
        GREET_SALES: {
          name: 'Saudar Vendas',
          type: 'RESPONSE',
          template: 'Opa, tudo bom? {agent_name} aqui da {business_name}! Me conta, você tá buscando automatizar o atendimento?'
        },
        EXPLAIN_SOLUTION: {
          name: 'Explicar Solução',
          type: 'RESPONSE',
          template: 'A gente configura uma IA que atende seus clientes no Zap, tira dúvidas e até agenda horários. É como ter um funcionário 24h, mas sem custo trabalhista, sabe? Quer ver funcionando ou prefere criar uma conta grátis pra testar?'
        },
        SHOW_PRICES: {
          name: 'Mostrar Preços',
          type: 'DATA',
          dataSource: 'prices',
          template: 'O plano ilimitado é R${price_standard}/mês. Mas com o cupom {coupon_code} você garante por R${price_promo}/mês! Quer testar grátis primeiro? {signup_link}'
        },
        SHOW_PROMO: {
          name: 'Mostrar Promo',
          type: 'DATA',
          template: 'Isso mesmo! O plano ilimitado sai por R${price_promo}/mês usando o cupom {coupon_code}. Você cria a conta, testa de graça e, se curtir, ativa com esse desconto. Bora testar? {signup_link}'
        },
        EXPLAIN_COUPON: {
          name: 'Explicar Cupom',
          type: 'RESPONSE',
          template: 'O cupom {coupon_code} é usado na hora de ativar o plano. Primeiro cria sua conta grátis, depois acessa Planos e clica em "Plano Exclusivo". Ali você insere o cupom pra garantir R${price_promo}/mês!'
        },
        EXPLAIN_IMPL: {
          name: 'Explicar Implementação',
          type: 'DATA',
          template: 'A implementação é R${impl_price} (pagamento único). Nossa equipe deixa tudo pronto: treina a IA, cadastra produtos e te entrega rodando. Ideal se você tá sem tempo. Mas se quiser configurar sozinho, é bem fácil também!'
        },
        OFFER_TRIAL: {
          name: 'Oferecer Trial',
          type: 'RESPONSE',
          template: 'Cria sua conta grátis pra testar: {signup_link}\n\nSem cartão, só testar! Qualquer dúvida me chama aqui.'
        },
        SEND_SIGNUP_LINK: {
          name: 'Enviar Link Cadastro',
          type: 'RESPONSE',
          template: '✅ Perfeito! Acessa aqui: {signup_link}\n\nSe usar o cupom {coupon_code}, garante o preço de R${price_promo}/mês! Me avisa quando criar a conta que te ajudo com o próximo passo.'
        },
        CLOSE_SALE: {
          name: 'Fechar Venda',
          type: 'RESPONSE',
          template: 'Show! Então só acessar {signup_link} e criar sua conta. Lá em Planos, usa o cupom {coupon_code} e o mensal cai de R${price_standard} pra R${price_promo}. Me avisa quando finalizar!'
        },
        HANDLE_OBJECTION: {
          name: 'Tratar Objeção',
          type: 'RESPONSE',
          template: 'Entendo! O bom é que você pode testar grátis sem compromisso. Se não fizer sentido pro seu negócio, zero custo. Mas geralmente quem testa não quer largar mais, sabe? 😄'
        },
        OFFER_SUPPORT: {
          name: 'Oferecer Suporte',
          type: 'RESPONSE',
          template: 'Qualquer dúvida de configuração me chama aqui! Posso te mandar vídeos tutoriais também se preferir.'
        },
        ANSWER_TECHNICAL: {
          name: 'Responder Técnico',
          type: 'RESPONSE',
          template: 'Não precisa deixar PC ligado! Funciona 100% na nuvem. Você configura uma vez e pronto - o agente atende 24h automaticamente.'
        },
        PERSONALIZE_PITCH: {
          name: 'Personalizar Pitch',
          type: 'RESPONSE',
          template: 'Legal! Pra {business_type} a IA ajuda muito com {benefit}. Quer que eu te mostre um exemplo de como funcionaria pro seu negócio?'
        },
      },
      
      data: {
        prices: { standard: 99, promo: 49 },
        links: { signup: 'https://agentezap.online/' },
        coupons: { PARC2026PROMO: { code: 'PARC2026PROMO', discount: 50 } },
        faq: [],
      },
      
      globalRules: [
        'Nunca usar termos técnicos como "tokens", "LLM", "GPT"',
        'Sempre mencionar o cupom quando falar de preço promocional',
        'Implementação é pagamento ÚNICO, não mensal',
        'Sempre incentivar o teste grátis primeiro'
      ],
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Constrói flow de AGENDAMENTO (clínicas, salões)
   */
  buildAgendamentoFlow(agentName: string, businessName: string, personality: string): FlowDefinition {
    return {
      id: `agendamento_${Date.now()}`,
      version: '1.0.0',
      type: 'AGENDAMENTO',
      businessName,
      agentName,
      agentPersonality: personality,
      
      initialState: 'INICIO',
      finalStates: ['AGENDADO', 'CANCELADO'],
      
      states: {
        INICIO: {
          name: 'Início',
          description: 'Primeira mensagem',
          transitions: [
            { intent: 'GREETING', nextState: 'SAUDACAO', action: 'GREET_SCHEDULE' },
            { intent: 'WANT_SCHEDULE', nextState: 'SERVICO', action: 'ASK_SERVICE' },
          ]
        },
        SAUDACAO: {
          name: 'Saudação',
          description: 'Cliente chegou',
          transitions: [
            { intent: 'WANT_SCHEDULE', nextState: 'SERVICO', action: 'ASK_SERVICE' },
            { intent: 'ASK_SERVICES', nextState: 'SAUDACAO', action: 'SHOW_SERVICES' },
            { intent: 'ASK_PRICES', nextState: 'SAUDACAO', action: 'SHOW_PRICES' },
          ]
        },
        SERVICO: {
          name: 'Serviço',
          description: 'Escolhendo serviço',
          transitions: [
            { intent: 'CHOOSE_SERVICE', nextState: 'DATA', action: 'ASK_DATE' },
          ]
        },
        DATA: {
          name: 'Data',
          description: 'Escolhendo data',
          transitions: [
            { intent: 'PROVIDE_DATE', nextState: 'HORARIO', action: 'SHOW_TIMES' },
          ]
        },
        HORARIO: {
          name: 'Horário',
          description: 'Escolhendo horário',
          transitions: [
            { intent: 'CHOOSE_TIME', nextState: 'CONFIRMACAO', action: 'CONFIRM_BOOKING' },
          ]
        },
        CONFIRMACAO: {
          name: 'Confirmação',
          description: 'Confirmando agendamento',
          transitions: [
            { intent: 'CONFIRM', nextState: 'AGENDADO', action: 'CREATE_APPOINTMENT' },
            { intent: 'CANCEL', nextState: 'CANCELADO', action: 'CANCEL_BOOKING' },
          ]
        },
        AGENDADO: {
          name: 'Agendado',
          description: 'Consulta marcada',
          transitions: []
        },
        CANCELADO: {
          name: 'Cancelado',
          description: 'Agendamento cancelado',
          transitions: [
            { intent: 'GREETING', nextState: 'INICIO', action: 'GREET_SCHEDULE' },
          ]
        }
      },
      
      intents: {
        GREETING: { name: 'Saudação', examples: ['oi', 'olá'], priority: 10 },
        WANT_SCHEDULE: { name: 'Quer Agendar', examples: ['quero agendar', 'marcar horário', 'consulta'], priority: 9 },
        ASK_SERVICES: { name: 'Ver Serviços', examples: ['quais serviços', 'o que vocês fazem'], priority: 7 },
        ASK_PRICES: { name: 'Ver Preços', examples: ['quanto custa', 'valores', 'tabela'], priority: 7 },
        CHOOSE_SERVICE: { name: 'Escolher Serviço', examples: ['quero', 'vou fazer'], entities: ['service'], priority: 8 },
        PROVIDE_DATE: { name: 'Fornecer Data', examples: ['dia', 'amanhã', 'segunda'], entities: ['date'], priority: 8 },
        CHOOSE_TIME: { name: 'Escolher Horário', examples: ['às', 'horário', '14h'], entities: ['time'], priority: 8 },
        CONFIRM: { name: 'Confirmar', examples: ['confirma', 'ok', 'isso'], priority: 8 },
        CANCEL: { name: 'Cancelar', examples: ['cancela', 'desisto'], priority: 8 },
      },
      
      actions: {
        GREET_SCHEDULE: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! 😊 Bem-vindo ao {business_name}! Quer agendar um horário?' },
        ASK_SERVICE: { name: 'Perguntar Serviço', type: 'DATA', dataSource: 'services', template: 'Qual serviço você gostaria?\n\n{services_list}' },
        SHOW_SERVICES: { name: 'Mostrar Serviços', type: 'DATA', dataSource: 'services', template: '📋 Nossos serviços:\n\n{services_list}' },
        SHOW_PRICES: { name: 'Mostrar Preços', type: 'DATA', dataSource: 'services', template: '💰 Tabela de preços:\n\n{prices_list}' },
        ASK_DATE: { name: 'Perguntar Data', type: 'RESPONSE', template: 'Ótimo! Para qual dia você gostaria?' },
        SHOW_TIMES: { name: 'Mostrar Horários', type: 'DATA', template: '📅 Horários disponíveis para {date}:\n\n{times_list}\n\nQual prefere?' },
        CONFIRM_BOOKING: { name: 'Confirmar', type: 'DATA', template: '📋 *Confirmação*\n\n🗓️ {date} às {time}\n💆 {service}\n💰 R$ {price}\n\nConfirma?' },
        CREATE_APPOINTMENT: { name: 'Criar Agendamento', type: 'EXTERNAL', template: '✅ Agendamento confirmado!\n\n🗓️ {date} às {time}\n\nTe esperamos!' },
        CANCEL_BOOKING: { name: 'Cancelar', type: 'RESPONSE', template: 'Agendamento cancelado. Quando quiser remarcar é só chamar!' },
      },
      
      data: {
        services: [],
        business_hours: {},
      },
      
      globalRules: [
        'Nunca agendar fora do horário de funcionamento',
        'Sempre confirmar data e horário antes de finalizar',
      ],
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Constrói flow de SUPORTE
   */
  buildSuporteFlow(agentName: string, businessName: string, personality: string): FlowDefinition {
    return {
      id: `suporte_${Date.now()}`,
      version: '1.0.0',
      type: 'SUPORTE',
      businessName,
      agentName,
      agentPersonality: personality,
      
      initialState: 'INICIO',
      finalStates: ['RESOLVIDO', 'ESCALADO'],
      
      states: {
        INICIO: {
          name: 'Início',
          description: 'Cliente chegou',
          transitions: [
            { intent: 'GREETING', nextState: 'IDENTIFICANDO', action: 'GREET_SUPPORT' },
            { intent: 'REPORT_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'START_DIAGNOSIS' },
          ]
        },
        IDENTIFICANDO: {
          name: 'Identificando',
          description: 'Entendendo o problema',
          transitions: [
            { intent: 'REPORT_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'START_DIAGNOSIS' },
            { intent: 'ASK_FAQ', nextState: 'IDENTIFICANDO', action: 'ANSWER_FAQ' },
          ]
        },
        DIAGNOSTICANDO: {
          name: 'Diagnosticando',
          description: 'Analisando problema',
          transitions: [
            { intent: 'PROVIDE_INFO', nextState: 'SOLUCIONANDO', action: 'PROPOSE_SOLUTION' },
            { intent: 'ASK_ESCALATE', nextState: 'ESCALADO', action: 'ESCALATE_TICKET' },
          ]
        },
        SOLUCIONANDO: {
          name: 'Solucionando',
          description: 'Aplicando solução',
          transitions: [
            { intent: 'CONFIRM_SOLVED', nextState: 'RESOLVIDO', action: 'CLOSE_TICKET' },
            { intent: 'STILL_PROBLEM', nextState: 'DIAGNOSTICANDO', action: 'TRY_ALTERNATIVE' },
          ]
        },
        RESOLVIDO: {
          name: 'Resolvido',
          description: 'Problema resolvido',
          transitions: []
        },
        ESCALADO: {
          name: 'Escalado',
          description: 'Passou para humano',
          transitions: []
        }
      },
      
      intents: {
        GREETING: { name: 'Saudação', examples: ['oi', 'preciso de ajuda'], priority: 10 },
        REPORT_PROBLEM: { name: 'Reportar Problema', examples: ['não funciona', 'erro', 'problema', 'bug'], priority: 9 },
        ASK_FAQ: { name: 'Pergunta FAQ', examples: ['como', 'onde', 'qual'], priority: 6 },
        PROVIDE_INFO: { name: 'Dar Info', examples: ['é isso', 'aconteceu', 'print'], priority: 7 },
        ASK_ESCALATE: { name: 'Escalar', examples: ['falar com humano', 'atendente', 'pessoa real'], priority: 8 },
        CONFIRM_SOLVED: { name: 'Resolvido', examples: ['funcionou', 'resolvido', 'obrigado'], priority: 8 },
        STILL_PROBLEM: { name: 'Ainda com Problema', examples: ['ainda não', 'continua', 'não resolveu'], priority: 7 },
      },
      
      actions: {
        GREET_SUPPORT: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! Sou do suporte {business_name}. Como posso ajudar?' },
        START_DIAGNOSIS: { name: 'Iniciar Diagnóstico', type: 'RESPONSE', template: 'Entendi! Me conta mais detalhes sobre o problema. O que exatamente está acontecendo?' },
        ANSWER_FAQ: { name: 'Responder FAQ', type: 'DATA', dataSource: 'kb_articles', template: '{answer}' },
        PROPOSE_SOLUTION: { name: 'Propor Solução', type: 'RESPONSE', template: 'Entendi! Tenta fazer o seguinte:\n\n{solution_steps}\n\nMe avisa se funcionou!' },
        TRY_ALTERNATIVE: { name: 'Tentar Alternativa', type: 'RESPONSE', template: 'Ok, vamos tentar outra coisa:\n\n{alternative_steps}' },
        CLOSE_TICKET: { name: 'Fechar Ticket', type: 'RESPONSE', template: '✅ Ótimo! Fico feliz que resolveu. Qualquer coisa é só chamar!' },
        ESCALATE_TICKET: { name: 'Escalar', type: 'RESPONSE', template: '📞 Vou passar seu caso para um especialista. Em breve entrarão em contato!' },
      },
      
      data: {
        kb_articles: [],
      },
      
      globalRules: [
        'Sempre tentar resolver antes de escalar',
        'Ser empático com o cliente frustrado',
      ],
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Constrói flow GENÉRICO (fallback)
   */
  buildGenericoFlow(agentName: string, businessName: string, personality: string): FlowDefinition {
    return {
      id: `generico_${Date.now()}`,
      version: '1.0.0',
      type: 'GENERICO',
      businessName,
      agentName,
      agentPersonality: personality,
      
      initialState: 'INICIO',
      finalStates: ['FINALIZADO'],
      
      states: {
        INICIO: {
          name: 'Início',
          description: 'Estado inicial',
          transitions: [
            { intent: 'GREETING', nextState: 'CONVERSANDO', action: 'GREET' },
            { intent: 'ASK_INFO', nextState: 'CONVERSANDO', action: 'PROVIDE_INFO' },
          ]
        },
        CONVERSANDO: {
          name: 'Conversando',
          description: 'Em conversa',
          transitions: [
            { intent: 'ASK_INFO', nextState: 'CONVERSANDO', action: 'PROVIDE_INFO' },
            { intent: 'THANKS', nextState: 'FINALIZADO', action: 'FAREWELL' },
            { intent: 'FAREWELL', nextState: 'FINALIZADO', action: 'FAREWELL' },
          ]
        },
        FINALIZADO: {
          name: 'Finalizado',
          description: 'Conversa encerrada',
          transitions: [
            { intent: 'GREETING', nextState: 'INICIO', action: 'GREET' },
          ]
        }
      },
      
      intents: {
        GREETING: { name: 'Saudação', examples: ['oi', 'olá'], priority: 10 },
        ASK_INFO: { name: 'Pedir Info', examples: ['como', 'onde', 'quando', 'qual'], priority: 5 },
        THANKS: { name: 'Agradecer', examples: ['obrigado', 'valeu'], priority: 7 },
        FAREWELL: { name: 'Despedida', examples: ['tchau', 'até mais'], priority: 7 },
      },
      
      actions: {
        GREET: { name: 'Saudar', type: 'RESPONSE', template: 'Olá! 😊 Sou {agent_name} do {business_name}. Como posso ajudar?' },
        PROVIDE_INFO: { name: 'Dar Info', type: 'RESPONSE', template: '{response}' },
        FAREWELL: { name: 'Despedir', type: 'RESPONSE', template: 'Até mais! 👋 Qualquer coisa é só chamar!' },
      },
      
      data: {},
      
      globalRules: [],
      
      createdAt: new Date(),
      updatedAt: new Date(),
    };
  }
  
  /**
   * Enriquece FlowDefinition usando IA para análise profunda
   */
  async enrichWithAI(flow: FlowDefinition, originalPrompt: string): Promise<FlowDefinition> {
    if (!this.anthropic) return flow;
    
    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-haiku-20240307',
        max_tokens: 2000,
        temperature: 0,
        system: `Você é um analisador de prompts de agentes de IA.
Analise o prompt fornecido e extraia:
1. FAQ adicional (perguntas frequentes e respostas)
2. Regras específicas do negócio
3. Intenções adicionais que devem ser reconhecidas
4. Variáveis importantes (preços, links, nomes)

Retorne JSON válido:
{
  "faq": [{"question": "...", "answer": "..."}],
  "rules": ["regra1", "regra2"],
  "intents": [{"name": "INTENT_NAME", "examples": ["ex1", "ex2"]}],
  "variables": {"key": "value"}
}`,
        messages: [{
          role: 'user',
          content: `PROMPT DO AGENTE:\n\n${originalPrompt}`
        }]
      });
      
      const content = response.content[0];
      if (content.type !== 'text') return flow;
      
      const enrichment = JSON.parse(content.text);
      
      // Adicionar FAQ
      if (enrichment.faq) {
        flow.data.faq = [...(flow.data.faq || []), ...enrichment.faq];
      }
      
      // Adicionar regras
      if (enrichment.rules) {
        flow.globalRules = [...flow.globalRules, ...enrichment.rules];
      }
      
      // Adicionar intenções
      if (enrichment.intents) {
        for (const intent of enrichment.intents) {
          flow.intents[intent.name] = {
            name: intent.name,
            examples: intent.examples,
            priority: 5
          };
        }
      }
      
      console.log('[FlowBuilder] Enriquecimento com IA aplicado');
      
    } catch (error) {
      console.error('[FlowBuilder] Erro no enriquecimento:', error);
    }
    
    return flow;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📦 EXPORTAÇÕES
// ═══════════════════════════════════════════════════════════════════════

export default FlowBuilder;
