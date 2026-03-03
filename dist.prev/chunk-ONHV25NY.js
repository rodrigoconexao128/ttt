import {
  supabase
} from "./chunk-BBJFUA6K.js";
import {
  chatComplete
} from "./chunk-IC5GBZQZ.js";

// server/FlowBuilder.ts
import Anthropic from "@anthropic-ai/sdk";
var PromptAnalyzer = class {
  /**
   * Detecta o tipo de negócio baseado no prompt
   */
  detectFlowType(prompt) {
    const promptLower = prompt.toLowerCase();
    const deliveryKeywords = [
      "card\xE1pio",
      "menu",
      "pizza",
      "hamburguer",
      "lanche",
      "delivery",
      "entrega",
      "pedido",
      "carrinho",
      "ifood",
      "motoboy",
      "comida",
      "restaurante",
      "lanchonete",
      "pizzaria",
      "hamburgueria",
      "a\xE7a\xED",
      "sobremesa",
      "bebida",
      "refrigerante",
      "taxa de entrega",
      "esfiha"
    ];
    const agendamentoKeywords = [
      "agendar",
      "agendamento",
      "consulta",
      "hor\xE1rio",
      "dispon\xEDvel",
      "cl\xEDnica",
      "consult\xF3rio",
      "sal\xE3o",
      "barbearia",
      "dentista",
      "m\xE9dico",
      "advogado",
      "psic\xF3logo",
      "personal",
      "academia",
      "aula",
      "sess\xE3o",
      "atendimento presencial"
    ];
    const vendasKeywords = [
      "plano",
      "assinatura",
      "mensalidade",
      "cupom",
      "desconto",
      "demonstra\xE7\xE3o",
      "teste gr\xE1tis",
      "trial",
      "implementa\xE7\xE3o",
      "cadastro",
      "conta",
      "funcionalidade",
      "feature",
      "saas",
      "software",
      "plataforma",
      "sistema",
      "ferramenta",
      // Serviços e Comércio
      "or\xE7amento",
      "honor\xE1rio",
      "contrat",
      "servi\xE7o",
      "venda",
      "compra",
      "pre\xE7o",
      "valor",
      "pagamento",
      "pix",
      "cart\xE3o",
      // Gráficas e lojas específicas
      "gr\xE1fica",
      "banner",
      "adesivo",
      "impress\xE3o",
      "copos",
      "personalizado",
      "pe\xE7as",
      "conserto",
      "moto",
      "carro",
      "loja",
      "estoque",
      // Consultoria
      "assessoria",
      "consultoria",
      "cpf",
      "cnpj",
      "cr\xE9dito",
      "limpa nome"
    ];
    const suporteKeywords = [
      "suporte",
      "ajuda",
      "problema",
      "erro",
      "bug",
      "ticket",
      "reclama\xE7\xE3o",
      "d\xFAvida t\xE9cnica",
      "n\xE3o funciona",
      "tutorial",
      "como usar",
      "passo a passo",
      "instala\xE7\xE3o",
      "internet lenta",
      "modem",
      "roteador",
      "conex\xE3o",
      "sinal",
      "mbps"
    ];
    const cursoKeywords = [
      "curso",
      "aula",
      "m\xF3dulo",
      "mentoria",
      "treinamento",
      "forma\xE7\xE3o",
      "certificado",
      "certifica\xE7\xE3o",
      "aprender",
      "ensino",
      "educa\xE7\xE3o",
      "infoproduto",
      "ebook",
      "e-book",
      "material did\xE1tico",
      "apostila",
      "aluno",
      "estudante",
      "professor",
      "instrutor",
      "mentor",
      "conte\xFAdo exclusivo",
      "acesso vital\xEDcio",
      "\xE1rea de membros",
      "hotmart",
      "eduzz",
      "monetizze",
      "kiwify",
      "udemy",
      "coursera",
      "garantia",
      "reembolso",
      "satisfa\xE7\xE3o",
      "transforma\xE7\xE3o",
      "resultado",
      "m\xE9todo",
      "metodologia",
      "passo a passo",
      "do zero",
      "iniciante",
      "avan\xE7ado",
      "completo",
      "masterclass",
      "workshop",
      "webinar",
      "comunidade",
      "grupo vip",
      "suporte ao aluno",
      "b\xF4nus",
      "brindes",
      "inscri\xE7\xE3o",
      "matr\xEDcula",
      "vaga",
      "turma",
      "libera\xE7\xE3o",
      "acesso"
    ];
    const countMatches = (keywords) => keywords.filter((kw) => promptLower.includes(kw)).length;
    const scores = {
      DELIVERY: countMatches(deliveryKeywords),
      AGENDAMENTO: countMatches(agendamentoKeywords),
      VENDAS: countMatches(vendasKeywords),
      SUPORTE: countMatches(suporteKeywords),
      CURSO: countMatches(cursoKeywords)
    };
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return "GENERICO";
    const topType = Object.entries(scores).find(([_, score]) => score === maxScore);
    return topType?.[0] || "GENERICO";
  }
  /**
   * Extrai nome do agente do prompt
   */
  extractAgentName(prompt) {
    const patterns = [
      /NOME DA IA:\s*(\w+)/i,
      // NOME DA IA: Thais
      /seu nome é\s+\*?\*?(\w+)\*?\*?/i,
      // Seu nome é Ana
      /você é \*?\*?(\w+)\*?\*?[,.\s]/i,
      // Você é **Rodrigo**,
      /sou (?:o |a )?(\w+)[,.\s]/i,
      // Sou o Rodrigo, Sou a Ana
      /me chamo (\w+)/i,
      // Me chamo X
      /meu nome é (\w+)/i,
      // Meu nome é X
      /\[(\w+)\]\s*-/i,
      // [Nome] - descrição
      /assistente.*?(?:é|chamada?)\s+\*?\*?(\w+)\*?\*?/i
      // assistente...é Ana
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1].length > 1 && match[1].toLowerCase() !== "a" && match[1].toLowerCase() !== "o") {
        return match[1];
      }
    }
    return "Atendente";
  }
  /**
   * Extrai nome do negócio do prompt
   */
  extractBusinessName(prompt) {
    const patterns = [
      /\*\*([A-Z][A-Za-z0-9\s&]+?)\*\*\s*[-–]/,
      // **Novo Sabor** -
      /(?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+?)(?:\*?\*?[,.\n])/,
      /atendente (?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /bem[- ]vindo (?:à|ao|a)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /especialista (?:da|do)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /(?:empresa|negócio|loja):\s*\*?\*?([A-Z][A-Za-z0-9\s&]+)/i
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1].trim().length > 2) {
        return match[1].trim();
      }
    }
    return "Meu Neg\xF3cio";
  }
  /**
   * Extrai preços mencionados no prompt
   */
  extractPrices(prompt) {
    const prices = {};
    const pricePatterns = [
      /R\$\s?(\d+(?:[.,]\d{2})?)/gi,
      /(\d+(?:[.,]\d{2})?)\s*reais/gi
    ];
    const contextPatterns = [
      { pattern: /plano.*?R\$\s?(\d+)/i, key: "plano_mensal" },
      { pattern: /implementa[çc][aã]o.*?R\$\s?(\d+)/i, key: "implementacao" },
      { pattern: /promo[çc][aã]o.*?R\$\s?(\d+)/i, key: "promo" },
      { pattern: /cupom.*?R\$\s?(\d+)/i, key: "desconto" },
      { pattern: /taxa.*?R\$\s?(\d+)/i, key: "taxa_entrega" }
    ];
    for (const { pattern, key } of contextPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        prices[key] = parseFloat(match[1].replace(",", "."));
      }
    }
    return prices;
  }
  /**
   * Extrai links do prompt
   */
  extractLinks(prompt) {
    const links = {};
    const urlPattern = /https?:\/\/[^\s\)]+/gi;
    const urls = prompt.match(urlPattern) || [];
    for (const url of urls) {
      if (url.includes("cadastro") || url.includes("signup")) {
        links["cadastro"] = url;
      } else if (url.includes("promo") || url.includes("plano")) {
        links["promocao"] = url;
      } else if (url.includes("tutorial") || url.includes("video")) {
        links["tutorial"] = url;
      } else {
        links["site"] = url;
      }
    }
    return links;
  }
  /**
   * Extrai cupons do prompt
   */
  extractCoupons(prompt) {
    const coupons = {};
    const couponPattern = /cupom[:\s]+\*?\*?([A-Z0-9]+)\*?\*?/gi;
    let match;
    while ((match = couponPattern.exec(prompt)) !== null) {
      coupons[match[1]] = {
        code: match[1],
        discount: 0
        // Será preenchido se encontrar contexto
      };
    }
    return coupons;
  }
  /**
   * Extrai personalidade/tom de voz
   */
  extractPersonality(prompt) {
    const traits = [];
    if (/informal|natural|humano/i.test(prompt)) traits.push("informal");
    if (/formal|profissional/i.test(prompt)) traits.push("formal");
    if (/amig[aá]vel|simpático/i.test(prompt)) traits.push("amig\xE1vel");
    if (/direto|objetivo/i.test(prompt)) traits.push("direto");
    if (/empático|acolhedor/i.test(prompt)) traits.push("emp\xE1tico");
    if (/divertido|descontraído/i.test(prompt)) traits.push("descontra\xEDdo");
    return traits.length > 0 ? traits.join(", ") : "profissional e amig\xE1vel";
  }
  /**
   * Extrai regras globais do prompt
   */
  extractGlobalRules(prompt) {
    const rules = [];
    const rulePatterns = [
      /NUNCA\s+(.+?)(?:\.|$)/gi,
      /SEMPRE\s+(.+?)(?:\.|$)/gi,
      /NÃO\s+(.+?)(?:\.|$)/gi,
      /IMPORTANTE:\s*(.+?)(?:\.|$)/gi,
      /REGRA[S]?:\s*(.+?)(?:\.|$)/gi
    ];
    for (const pattern of rulePatterns) {
      let match;
      while ((match = pattern.exec(prompt)) !== null) {
        rules.push(match[1].trim());
      }
    }
    return rules;
  }
  /**
   * 🎯 EXTRAI MENSAGEM CUSTOMIZADA OBRIGATÓRIA DO PROMPT
   * Detecta quando prompt exige mensagem inicial exata/específica
   */
  extractCustomGreeting(prompt) {
    const patterns = [
      // "responder **exatamente** com..." (mais flexível)
      /responder\s+\*\*exatamente\*\*.*?:\s*\n+([\s\S]+)/i,
      // "primeira mensagem: (mensagem)"
      /primeira mensagem(?:\s+(?:de todas|sempre|inicial))?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
      // "sempre enviar: (mensagem)"
      /sempre enviar(?:\s+(?:a seguinte|esta))?(?:\s+mensagem)?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
      // "enviar sempre: (mensagem)"
      /enviar sempre(?:\s+(?:a seguinte|esta))?(?:\s+mensagem)?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
      // "mensagem inicial: (mensagem)"
      /mensagem inicial:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i,
      // "Ignorar... responder com: (mensagem)"
      /Ignorar.*?responder.*?com.*?:\s*\n+([\s\S]+?)(?:\n\n\n|$)/i
    ];
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1]) {
        let message = match[1].trim();
        message = message.replace(/\n{3,}$/g, "");
        if (message.length > 20 && /[a-záàâãéèêíïóôõöúçñ]/i.test(message)) {
          console.log(`[PromptAnalyzer] \u{1F3AF} Mensagem customizada detectada (${message.length} chars)`);
          console.log(`[PromptAnalyzer] Preview: ${message.substring(0, 80)}...`);
          return message;
        }
      }
    }
    return null;
  }
};
var FlowBuilder = class {
  analyzer;
  anthropic;
  mistralApiKey;
  constructor(anthropicApiKey, mistralApiKey) {
    this.analyzer = new PromptAnalyzer();
    if (anthropicApiKey) {
      this.anthropic = new Anthropic({ apiKey: anthropicApiKey });
    }
    if (mistralApiKey) {
      this.mistralApiKey = mistralApiKey;
    }
  }
  /**
   * Constrói FlowDefinition a partir de um prompt existente
   */
  /**
   * 🤖 USA IA PARA EXTRAIR MENSAGEM CUSTOMIZADA DO PROMPT
   * Muito mais robusto que regex!
   * Usa o sistema centralizado de LLM (Groq/Mistral conforme config)
   */
  async extractCustomGreetingWithAI(prompt) {
    try {
      console.log("[FlowBuilder] \u{1F916} Usando IA (sistema centralizado) para extrair mensagem customizada...");
      const analysisPrompt = `Analise o seguinte prompt de agente de IA e determine se ele cont\xE9m uma MENSAGEM INICIAL CUSTOMIZADA OBRIGAT\xD3RIA.

PROMPT:
"""
${prompt}
"""

TAREFA:
1. Identifique se o prompt especifica uma mensagem exata/espec\xEDfica que DEVE ser enviada como primeira intera\xE7\xE3o
2. Procure por frases como:
   - "responder exatamente com..."
   - "primeira mensagem..."
   - "sempre enviar..."
   - "mensagem inicial..."
   - "ignorar sauda\xE7\xE3o e responder com..."

3. Se encontrar, extraia TODA a mensagem customizada (incluindo emojis, formata\xE7\xE3o, quebras de linha)
4. Se N\xC3O encontrar mensagem customizada espec\xEDfica, retorne null

RESPONDA APENAS COM JSON V\xC1LIDO:
{
  "has_custom_greeting": true/false,
  "greeting_message": "texto completo da mensagem" ou null,
  "confidence": 0-100
}`;
      const response = await chatComplete({
        messages: [{ role: "user", content: analysisPrompt }],
        temperature: 0.1,
        maxTokens: 1e3
      });
      const content = response.choices?.[0]?.message?.content?.trim() || "{}";
      const jsonMatch = typeof content === "string" ? content.match(/\{[\s\S]*\}/) : null;
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : typeof content === "string" ? content : "{}");
      console.log(`[FlowBuilder] \u{1F916} IA Analysis: has_custom=${result.has_custom_greeting}, confidence=${result.confidence}%`);
      if (result.has_custom_greeting && result.confidence >= 70 && result.greeting_message) {
        console.log(`[FlowBuilder] \u2705 Mensagem customizada extra\xEDda pela IA (${result.greeting_message.length} chars)`);
        return result.greeting_message;
      }
      return null;
    } catch (error) {
      console.error(`[FlowBuilder] \u274C Erro ao usar IA para extrair mensagem:`, error.message);
      console.log("[FlowBuilder] \u{1F504} Usando regex fallback...");
      return this.analyzer.extractCustomGreeting(prompt);
    }
  }
  async buildFromPrompt(prompt, userId) {
    console.log("[FlowBuilder] Analisando prompt...");
    const flowType = this.analyzer.detectFlowType(prompt);
    console.log(`[FlowBuilder] Tipo detectado: ${flowType}`);
    const agentName = this.analyzer.extractAgentName(prompt);
    const businessName = this.analyzer.extractBusinessName(prompt);
    const personality = this.analyzer.extractPersonality(prompt);
    const prices = this.analyzer.extractPrices(prompt);
    const links = this.analyzer.extractLinks(prompt);
    const coupons = this.analyzer.extractCoupons(prompt);
    const globalRules = this.analyzer.extractGlobalRules(prompt);
    const customGreeting = await this.extractCustomGreetingWithAI(prompt);
    if (customGreeting) {
      console.log(`[FlowBuilder] \u{1F3AF} Mensagem customizada encontrada (${customGreeting.length} chars)`);
    }
    console.log(`[FlowBuilder] Agente: ${agentName}, Neg\xF3cio: ${businessName}`);
    let flow;
    switch (flowType) {
      case "DELIVERY":
        flow = this.buildDeliveryFlow(agentName, businessName, personality);
        break;
      case "VENDAS":
        flow = this.buildVendasFlow(agentName, businessName, personality);
        break;
      case "AGENDAMENTO":
        flow = this.buildAgendamentoFlow(agentName, businessName, personality);
        break;
      case "SUPORTE":
        flow = this.buildSuporteFlow(agentName, businessName, personality);
        break;
      case "CURSO":
        flow = this.buildCursoFlow(agentName, businessName, personality);
        break;
      default:
        flow = this.buildGenericoFlow(agentName, businessName, personality);
    }
    flow.data.prices = prices;
    flow.data.links = links;
    flow.data.coupons = coupons;
    flow.globalRules = globalRules;
    flow.sourcePrompt = prompt;
    if (customGreeting) {
      console.log(`[FlowBuilder] \u2705 Aplicando sauda\xE7\xE3o customizada no flow inteiro`);
      if (flow.states[flow.initialState]) {
        flow.states[flow.initialState].description = customGreeting;
      }
      flow.actions.GREET_CUSTOM = {
        name: "Sauda\xE7\xE3o Customizada",
        type: "RESPONSE",
        template: customGreeting
      };
      for (const state of Object.values(flow.states)) {
        if (!Array.isArray(state.transitions)) continue;
        for (const transition of state.transitions) {
          if (transition.intent === "GREETING") {
            transition.action = "GREET_CUSTOM";
          }
        }
      }
      for (const [actionKey, actionDef] of Object.entries(flow.actions)) {
        const isGreetingAction = /greet|sauda|welcome/i.test(actionKey) || /greet|sauda|welcome/i.test(actionDef.name || "");
        if (isGreetingAction && actionDef.type === "RESPONSE") {
          actionDef.template = customGreeting;
        }
      }
    }
    if (this.anthropic) {
      flow = await this.enrichWithAI(flow, prompt);
    }
    return flow;
  }
  /**
   * Constrói flow de DELIVERY (pizzarias, restaurantes)
   */
  buildDeliveryFlow(agentName, businessName, personality) {
    return {
      id: `delivery_${Date.now()}`,
      version: "1.0.0",
      type: "DELIVERY",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["PEDIDO_FINALIZADO", "CANCELADO"],
      states: {
        INICIO: {
          name: "In\xEDcio",
          description: "Aguardando primeira mensagem",
          transitions: [
            { intent: "GREETING", nextState: "SAUDACAO", action: "GREET" },
            { intent: "WANT_MENU", nextState: "MENU", action: "SHOW_MENU" },
            { intent: "ADD_ITEM", nextState: "PEDINDO", action: "ADD_TO_CART" }
          ]
        },
        SAUDACAO: {
          name: "Sauda\xE7\xE3o",
          description: "Cliente acabou de chegar",
          transitions: [
            { intent: "WANT_MENU", nextState: "MENU", action: "SHOW_MENU" },
            { intent: "ADD_ITEM", nextState: "PEDINDO", action: "ADD_TO_CART" },
            { intent: "ASK_HOURS", nextState: "SAUDACAO", action: "INFO_HOURS" },
            { intent: "ASK_DELIVERY_FEE", nextState: "SAUDACAO", action: "INFO_FEE" }
          ]
        },
        MENU: {
          name: "Menu",
          description: "Mostrando card\xE1pio",
          transitions: [
            { intent: "ADD_ITEM", nextState: "PEDINDO", action: "ADD_TO_CART" },
            { intent: "ASK_PRODUCT_INFO", nextState: "MENU", action: "PRODUCT_INFO" }
          ]
        },
        PEDINDO: {
          name: "Fazendo Pedido",
          description: "Cliente adicionando itens",
          transitions: [
            { intent: "ADD_ITEM", nextState: "PEDINDO", action: "ADD_TO_CART" },
            { intent: "REMOVE_ITEM", nextState: "PEDINDO", action: "REMOVE_FROM_CART" },
            { intent: "SEE_CART", nextState: "PEDINDO", action: "SHOW_CART" },
            { intent: "CONFIRM_ORDER", nextState: "TIPO_ENTREGA", action: "ASK_DELIVERY_TYPE" },
            { intent: "CANCEL_ORDER", nextState: "CANCELADO", action: "CANCEL" },
            { intent: "CHOOSE_DELIVERY", nextState: "ENDERECO", action: "ASK_ADDRESS" },
            { intent: "CHOOSE_PICKUP", nextState: "PAGAMENTO", action: "ASK_PAYMENT" }
          ]
        },
        TIPO_ENTREGA: {
          name: "Tipo de Entrega",
          description: "Escolhendo delivery ou retirada",
          transitions: [
            { intent: "CHOOSE_DELIVERY", nextState: "ENDERECO", action: "ASK_ADDRESS" },
            { intent: "CHOOSE_PICKUP", nextState: "PAGAMENTO", action: "ASK_PAYMENT" }
          ]
        },
        ENDERECO: {
          name: "Endere\xE7o",
          description: "Coletando endere\xE7o",
          transitions: [
            { intent: "PROVIDE_ADDRESS", nextState: "PAGAMENTO", action: "SAVE_ADDRESS" },
            { intent: "CHOOSE_PAYMENT", nextState: "CONFIRMACAO", action: "SHOW_SUMMARY" }
          ]
        },
        PAGAMENTO: {
          name: "Pagamento",
          description: "Escolhendo forma de pagamento",
          transitions: [
            { intent: "CHOOSE_PAYMENT", nextState: "CONFIRMACAO", action: "SHOW_SUMMARY" },
            { intent: "PROVIDE_ADDRESS", nextState: "PAGAMENTO", action: "SAVE_ADDRESS" }
          ]
        },
        CONFIRMACAO: {
          name: "Confirma\xE7\xE3o",
          description: "Confirmando pedido",
          transitions: [
            { intent: "CONFIRM_ORDER", nextState: "PEDIDO_FINALIZADO", action: "CREATE_ORDER" },
            { intent: "CANCEL_ORDER", nextState: "CANCELADO", action: "CANCEL" }
          ]
        },
        PEDIDO_FINALIZADO: {
          name: "Pedido Finalizado",
          description: "Pedido criado com sucesso",
          transitions: []
        },
        CANCELADO: {
          name: "Cancelado",
          description: "Pedido cancelado",
          transitions: [
            { intent: "GREETING", nextState: "INICIO", action: "GREET" }
          ]
        }
      },
      intents: {
        GREETING: {
          name: "Sauda\xE7\xE3o",
          examples: ["oi", "ol\xE1", "bom dia", "boa tarde", "boa noite", "e a\xED", "eai", "opa"],
          patterns: ["^(oi|ola|bom\\s+dia|boa\\s+(tarde|noite)|e\\s*a[i\xED]|opa)[!?.,]?$"],
          priority: 10
        },
        WANT_MENU: {
          name: "Ver Card\xE1pio",
          examples: ["card\xE1pio", "menu", "o que tem", "quais op\xE7\xF5es", "me manda o card\xE1pio"],
          patterns: ["card[\xE1a]pio", "menu", "o\\s+que\\s+tem", "op[\xE7c][\xF5o]es"],
          priority: 8
        },
        ADD_ITEM: {
          name: "Adicionar Item",
          examples: ["quero", "me v\xEA", "manda", "adiciona", "pode ser", "quero uma", "quero mais"],
          patterns: ["quero\\s+(uma?|\\d+)", "me\\s+v[\xEAe]", "adiciona", "manda\\s+(uma?|\\d+)"],
          entities: ["product", "quantity"],
          priority: 9
        },
        REMOVE_ITEM: {
          name: "Remover Item",
          examples: ["tira", "remove", "sem", "n\xE3o quero mais"],
          patterns: ["tira", "remove", "n[\xE3a]o\\s+quero\\s+mais"],
          entities: ["product"],
          priority: 7
        },
        SEE_CART: {
          name: "Ver Carrinho",
          examples: ["meu pedido", "o que pedi", "meu carrinho", "total", "ver pedido"],
          patterns: ["meu\\s+pedido", "o\\s+que\\s+pedi", "carrinho", "ver\\s+pedido"],
          priority: 6
        },
        CONFIRM_ORDER: {
          name: "Confirmar",
          examples: ["isso", "fechado", "pode fechar", "confirma", "ok", "fechar pedido", "finalizar"],
          patterns: ["fechado?", "confirma", "finaliza", "^ok$", "^isso$"],
          priority: 8
        },
        CANCEL_ORDER: {
          name: "Cancelar",
          examples: ["cancela", "desisto", "n\xE3o quero", "deixa pra l\xE1"],
          patterns: ["cancela", "desisto", "deixa\\s+pra\\s+l[\xE1a]"],
          priority: 8
        },
        CHOOSE_DELIVERY: {
          name: "Delivery",
          examples: ["delivery", "entrega", "manda pra mim", "quero entrega", "entregar"],
          patterns: ["^delivery$", "entrega", "manda\\s+pra\\s+mim", "entregar"],
          priority: 7
        },
        CHOOSE_PICKUP: {
          name: "Retirada",
          examples: ["buscar", "retirar", "retirada", "vou ai", "vou buscar", "retiro"],
          patterns: ["buscar", "retirar", "retirada", "vou\\s+a[\xEDi]", "retiro"],
          priority: 7
        },
        PROVIDE_ADDRESS: {
          name: "Endere\xE7o",
          examples: ["rua", "avenida", "n\xFAmero"],
          patterns: ["rua\\s+", "avenida\\s+", "av\\.?\\s+", "n[\xFAu]mero\\s+\\d+", "n[\xBAo]\\s*\\d+"],
          entities: ["address"],
          priority: 6
        },
        CHOOSE_PAYMENT: {
          name: "Pagamento",
          examples: ["pix", "dinheiro", "cart\xE3o", "pago em", "vou pagar"],
          patterns: ["^pix$", "^dinheiro$", "cart[\xE3a]o", "pago\\s+em", "vou\\s+pagar"],
          entities: ["payment_method"],
          priority: 7
        },
        ASK_HOURS: {
          name: "Hor\xE1rio",
          examples: ["hor\xE1rio", "abre", "fecha", "funciona"],
          patterns: ["hor[\xE1a]rio", "abre", "fecha", "funciona"],
          priority: 5
        },
        ASK_DELIVERY_FEE: {
          name: "Taxa",
          examples: ["taxa", "frete", "quanto a entrega"],
          patterns: ["taxa", "frete", "quanto\\s+(a|custa)\\s+entrega"],
          priority: 5
        },
        ASK_PRODUCT_INFO: {
          name: "Info Produto",
          examples: ["quanto custa", "tem", "qual o pre\xE7o"],
          patterns: ["quanto\\s+custa", "qual\\s+o?\\s*pre[\xE7c]o"],
          entities: ["product"],
          priority: 6
        }
      },
      actions: {
        GREET: {
          name: "Saudar",
          type: "RESPONSE",
          template: "Ol\xE1! \u{1F60A} Bem-vindo ao {business_name}! Posso te enviar nosso card\xE1pio ou voc\xEA j\xE1 sabe o que quer pedir?",
          variables: ["business_name"]
        },
        SHOW_MENU: {
          name: "Mostrar Menu",
          type: "DATA",
          dataSource: "menu",
          template: "Ol\xE1! Essas s\xE3o nossas op\xE7\xF5es:\n\n{menu_formatted}\n\nQual voc\xEA gostaria de pedir?"
        },
        ADD_TO_CART: {
          name: "Adicionar ao Carrinho",
          type: "DATA",
          template: "\u2705 Adicionei {quantity}x {product}!\n\n\u{1F6D2} Seu pedido:\n{cart_summary}\n\n\u{1F4B0} Total: R$ {total}\n\nMais algo ou posso fechar?"
        },
        SHOW_CART: {
          name: "Mostrar Carrinho",
          type: "DATA",
          template: "\u{1F6D2} *Seu Pedido:*\n\n{cart_summary}\n\n\u{1F4B0} Total: R$ {total}"
        },
        ASK_DELIVERY_TYPE: {
          name: "Perguntar Tipo Entrega",
          type: "RESPONSE",
          template: "\u{1F6F5} Vai ser *delivery* ou *retirada* no local?"
        },
        ASK_ADDRESS: {
          name: "Perguntar Endere\xE7o",
          type: "RESPONSE",
          template: "\u{1F4CD} Qual seu endere\xE7o de entrega?"
        },
        SAVE_ADDRESS: {
          name: "Salvar Endere\xE7o",
          type: "DATA",
          template: "\u{1F4CD} Entrega em: {address}\n\n\u{1F4B3} Como vai pagar? (Pix, Cart\xE3o ou Dinheiro)"
        },
        ASK_PAYMENT: {
          name: "Perguntar Pagamento",
          type: "RESPONSE",
          template: "\u{1F4B3} Como vai pagar? (Pix, Cart\xE3o ou Dinheiro)"
        },
        SHOW_SUMMARY: {
          name: "Mostrar Resumo",
          type: "DATA",
          template: "\u{1F4CB} *RESUMO DO PEDIDO*\n\n{cart_summary}\n\n\u{1F6F5} {delivery_type}\n\u{1F4CD} {address}\n\u{1F4B3} {payment_method}\n\n\u{1F4B0} *TOTAL: R$ {total}*\n\n\u2705 Confirma?"
        },
        CREATE_ORDER: {
          name: "Criar Pedido",
          type: "EXTERNAL",
          template: "\u{1F389} Pedido #{order_id} confirmado!\n\n\u23F1\uFE0F {delivery_time}\n\nObrigado pela prefer\xEAncia! \u{1F60A}"
        },
        CANCEL: {
          name: "Cancelar",
          type: "RESPONSE",
          template: "Pedido cancelado! Se mudar de ideia \xE9 s\xF3 chamar \u{1F60A}"
        },
        INFO_HOURS: {
          name: "Informar Hor\xE1rio",
          type: "DATA",
          dataSource: "business_hours",
          template: "\u{1F550} Nosso hor\xE1rio: {hours}"
        },
        INFO_FEE: {
          name: "Informar Taxa",
          type: "DATA",
          dataSource: "delivery_fee",
          template: "\u{1F6F5} Taxa de entrega: R$ {delivery_fee}"
        }
      },
      data: {
        menu: [],
        payment_methods: ["Pix", "Cart\xE3o", "Dinheiro"],
        delivery_fee: 5,
        min_order: 20,
        delivery_time: "40-60 min"
      },
      globalRules: [
        "Nunca inventar produtos que n\xE3o est\xE3o no card\xE1pio",
        "Sempre confirmar o pedido antes de finalizar",
        "Ser simp\xE1tico e usar emojis moderadamente"
      ],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Constrói flow de VENDAS (SaaS, agências, B2B)
   */
  buildVendasFlow(agentName, businessName, personality) {
    return {
      id: `vendas_${Date.now()}`,
      version: "1.0.0",
      type: "VENDAS",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["CADASTRADO", "NAO_INTERESSADO"],
      states: {
        INICIO: {
          name: "In\xEDcio",
          description: "Primeira intera\xE7\xE3o",
          transitions: [
            { intent: "GREETING", nextState: "QUALIFICANDO", action: "GREET_SALES" },
            { intent: "ASK_HOW_WORKS", nextState: "EXPLICANDO", action: "EXPLAIN_SOLUTION" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICES" }
          ]
        },
        QUALIFICANDO: {
          name: "Qualificando",
          description: "Entendendo necessidade",
          transitions: [
            { intent: "TELL_BUSINESS", nextState: "EXPLICANDO", action: "PERSONALIZE_PITCH" },
            { intent: "ASK_HOW_WORKS", nextState: "EXPLICANDO", action: "EXPLAIN_SOLUTION" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICES" },
            { intent: "WANT_DEMO", nextState: "DEMO", action: "OFFER_TRIAL" }
          ]
        },
        EXPLICANDO: {
          name: "Explicando",
          description: "Explicando a solu\xE7\xE3o",
          transitions: [
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICES" },
            { intent: "ASK_FEATURES", nextState: "EXPLICANDO", action: "EXPLAIN_FEATURES" },
            { intent: "WANT_DEMO", nextState: "DEMO", action: "OFFER_TRIAL" },
            { intent: "ASK_TECHNICAL", nextState: "EXPLICANDO", action: "ANSWER_TECHNICAL" }
          ]
        },
        PRECOS: {
          name: "Pre\xE7os",
          description: "Falando sobre valores",
          transitions: [
            { intent: "ASK_COUPON", nextState: "PRECOS", action: "EXPLAIN_COUPON" },
            { intent: "ASK_PROMO", nextState: "PRECOS", action: "SHOW_PROMO" },
            { intent: "ASK_IMPLEMENTATION", nextState: "PRECOS", action: "EXPLAIN_IMPL" },
            { intent: "WANT_DEMO", nextState: "DEMO", action: "OFFER_TRIAL" },
            { intent: "CONFIRM", nextState: "FECHANDO", action: "CLOSE_SALE" }
          ]
        },
        DEMO: {
          name: "Demo",
          description: "Oferecendo teste",
          transitions: [
            { intent: "CONFIRM", nextState: "CADASTRADO", action: "SEND_SIGNUP_LINK" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICES" }
          ]
        },
        FECHANDO: {
          name: "Fechando",
          description: "Fechando venda",
          transitions: [
            { intent: "CONFIRM", nextState: "CADASTRADO", action: "SEND_SIGNUP_LINK" },
            { intent: "OBJECTION", nextState: "EXPLICANDO", action: "HANDLE_OBJECTION" }
          ]
        },
        CADASTRADO: {
          name: "Cadastrado",
          description: "Cliente se cadastrou",
          transitions: [
            { intent: "ASK_HELP", nextState: "CADASTRADO", action: "OFFER_SUPPORT" }
          ]
        },
        NAO_INTERESSADO: {
          name: "N\xE3o Interessado",
          description: "Cliente n\xE3o quis",
          transitions: [
            { intent: "GREETING", nextState: "INICIO", action: "GREET_SALES" }
          ]
        }
      },
      intents: {
        GREETING: {
          name: "Sauda\xE7\xE3o",
          examples: ["oi", "ol\xE1", "bom dia", "vi seu an\xFAncio"],
          priority: 10
        },
        ASK_HOW_WORKS: {
          name: "Como Funciona",
          examples: ["como funciona", "o que faz", "me explica", "quero entender"],
          priority: 9
        },
        ASK_PRICE: {
          name: "Pre\xE7o",
          examples: ["quanto custa", "qual o valor", "pre\xE7o", "quanto \xE9"],
          priority: 9
        },
        ASK_PROMO: {
          name: "Promo\xE7\xE3o",
          examples: ["promo\xE7\xE3o", "desconto", "vi o an\xFAncio de", "R$49"],
          priority: 8
        },
        ASK_COUPON: {
          name: "Cupom",
          examples: ["cupom", "onde coloco", "c\xF3digo", "n\xE3o funciona"],
          priority: 7
        },
        ASK_IMPLEMENTATION: {
          name: "Implementa\xE7\xE3o",
          examples: ["implementa\xE7\xE3o", "voc\xEAs configuram", "setup", "R$199"],
          priority: 7
        },
        ASK_FEATURES: {
          name: "Funcionalidades",
          examples: ["funcionalidades", "o que tem", "recursos", "features"],
          priority: 6
        },
        ASK_TECHNICAL: {
          name: "T\xE9cnico",
          examples: ["precisa", "PC ligado", "integra", "como configura"],
          priority: 6
        },
        WANT_DEMO: {
          name: "Quer Demo",
          examples: ["quero testar", "como testo", "tem trial", "teste gr\xE1tis"],
          priority: 8
        },
        TELL_BUSINESS: {
          name: "Conta Neg\xF3cio",
          examples: ["sou", "tenho", "minha empresa", "trabalho com"],
          entities: ["business_type"],
          priority: 5
        },
        CONFIRM: {
          name: "Confirmar",
          examples: ["quero", "vou cadastrar", "ok", "fechado", "pode ser"],
          priority: 8
        },
        OBJECTION: {
          name: "Obje\xE7\xE3o",
          examples: ["caro", "n\xE3o sei", "vou pensar", "depois"],
          priority: 5
        },
        ASK_HELP: {
          name: "Pedir Ajuda",
          examples: ["ajuda", "n\xE3o consigo", "como fa\xE7o", "d\xFAvida"],
          priority: 7
        }
      },
      actions: {
        GREET_SALES: {
          name: "Saudar Vendas",
          type: "RESPONSE",
          template: "Opa, tudo bom? {agent_name} aqui da {business_name}! Me conta, voc\xEA t\xE1 buscando automatizar o atendimento?"
        },
        EXPLAIN_SOLUTION: {
          name: "Explicar Solu\xE7\xE3o",
          type: "RESPONSE",
          template: "A gente configura uma IA que atende seus clientes no Zap, tira d\xFAvidas e at\xE9 agenda hor\xE1rios. \xC9 como ter um funcion\xE1rio 24h, mas sem custo trabalhista, sabe? Quer ver funcionando ou prefere criar uma conta gr\xE1tis pra testar?"
        },
        SHOW_PRICES: {
          name: "Mostrar Pre\xE7os",
          type: "DATA",
          dataSource: "prices",
          template: "O plano ilimitado \xE9 R${price_standard}/m\xEAs. Mas com o cupom {coupon_code} voc\xEA garante por R${price_promo}/m\xEAs! Quer testar gr\xE1tis primeiro? {signup_link}"
        },
        SHOW_PROMO: {
          name: "Mostrar Promo",
          type: "DATA",
          template: "Isso mesmo! O plano ilimitado sai por R${price_promo}/m\xEAs usando o cupom {coupon_code}. Voc\xEA cria a conta, testa de gra\xE7a e, se curtir, ativa com esse desconto. Bora testar? {signup_link}"
        },
        EXPLAIN_COUPON: {
          name: "Explicar Cupom",
          type: "RESPONSE",
          template: 'O cupom {coupon_code} \xE9 usado na hora de ativar o plano. Primeiro cria sua conta gr\xE1tis, depois acessa Planos e clica em "Plano Exclusivo". Ali voc\xEA insere o cupom pra garantir R${price_promo}/m\xEAs!'
        },
        EXPLAIN_IMPL: {
          name: "Explicar Implementa\xE7\xE3o",
          type: "DATA",
          template: "A implementa\xE7\xE3o \xE9 R${impl_price} (pagamento \xFAnico). Nossa equipe deixa tudo pronto: treina a IA, cadastra produtos e te entrega rodando. Ideal se voc\xEA t\xE1 sem tempo. Mas se quiser configurar sozinho, \xE9 bem f\xE1cil tamb\xE9m!"
        },
        OFFER_TRIAL: {
          name: "Oferecer Trial",
          type: "RESPONSE",
          template: "Cria sua conta gr\xE1tis pra testar: {signup_link}\n\nSem cart\xE3o, s\xF3 testar! Qualquer d\xFAvida me chama aqui."
        },
        SEND_SIGNUP_LINK: {
          name: "Enviar Link Cadastro",
          type: "RESPONSE",
          template: "\u2705 Perfeito! Acessa aqui: {signup_link}\n\nSe usar o cupom {coupon_code}, garante o pre\xE7o de R${price_promo}/m\xEAs! Me avisa quando criar a conta que te ajudo com o pr\xF3ximo passo."
        },
        CLOSE_SALE: {
          name: "Fechar Venda",
          type: "RESPONSE",
          template: "Show! Ent\xE3o s\xF3 acessar {signup_link} e criar sua conta. L\xE1 em Planos, usa o cupom {coupon_code} e o mensal cai de R${price_standard} pra R${price_promo}. Me avisa quando finalizar!"
        },
        HANDLE_OBJECTION: {
          name: "Tratar Obje\xE7\xE3o",
          type: "RESPONSE",
          template: "Entendo! O bom \xE9 que voc\xEA pode testar gr\xE1tis sem compromisso. Se n\xE3o fizer sentido pro seu neg\xF3cio, zero custo. Mas geralmente quem testa n\xE3o quer largar mais, sabe? \u{1F604}"
        },
        OFFER_SUPPORT: {
          name: "Oferecer Suporte",
          type: "RESPONSE",
          template: "Qualquer d\xFAvida de configura\xE7\xE3o me chama aqui! Posso te mandar v\xEDdeos tutoriais tamb\xE9m se preferir."
        },
        ANSWER_TECHNICAL: {
          name: "Responder T\xE9cnico",
          type: "RESPONSE",
          template: "N\xE3o precisa deixar PC ligado! Funciona 100% na nuvem. Voc\xEA configura uma vez e pronto - o agente atende 24h automaticamente."
        },
        PERSONALIZE_PITCH: {
          name: "Personalizar Pitch",
          type: "RESPONSE",
          template: "Legal! Pra {business_type} a IA ajuda muito com {benefit}. Quer que eu te mostre um exemplo de como funcionaria pro seu neg\xF3cio?"
        }
      },
      data: {
        prices: { standard: 99, promo: 49 },
        links: { signup: "https://agentezap.online/" },
        coupons: { PARC2026PROMO: { code: "PARC2026PROMO", discount: 50 } },
        faq: []
      },
      globalRules: [
        'Nunca usar termos t\xE9cnicos como "tokens", "LLM", "GPT"',
        "Sempre mencionar o cupom quando falar de pre\xE7o promocional",
        "Implementa\xE7\xE3o \xE9 pagamento \xDANICO, n\xE3o mensal",
        "Sempre incentivar o teste gr\xE1tis primeiro"
      ],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Constrói flow de AGENDAMENTO (clínicas, salões)
   */
  buildAgendamentoFlow(agentName, businessName, personality) {
    return {
      id: `agendamento_${Date.now()}`,
      version: "1.0.0",
      type: "AGENDAMENTO",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["AGENDADO", "CANCELADO"],
      states: {
        INICIO: {
          name: "In\xEDcio",
          description: "Primeira mensagem",
          transitions: [
            { intent: "GREETING", nextState: "SAUDACAO", action: "GREET_SCHEDULE" },
            { intent: "WANT_SCHEDULE", nextState: "SERVICO", action: "ASK_SERVICE" }
          ]
        },
        SAUDACAO: {
          name: "Sauda\xE7\xE3o",
          description: "Cliente chegou",
          transitions: [
            { intent: "WANT_SCHEDULE", nextState: "SERVICO", action: "ASK_SERVICE" },
            { intent: "ASK_SERVICES", nextState: "SAUDACAO", action: "SHOW_SERVICES" },
            { intent: "ASK_PRICES", nextState: "SAUDACAO", action: "SHOW_PRICES" }
          ]
        },
        SERVICO: {
          name: "Servi\xE7o",
          description: "Escolhendo servi\xE7o",
          transitions: [
            { intent: "CHOOSE_SERVICE", nextState: "DATA", action: "ASK_DATE" }
          ]
        },
        DATA: {
          name: "Data",
          description: "Escolhendo data",
          transitions: [
            { intent: "PROVIDE_DATE", nextState: "HORARIO", action: "SHOW_TIMES" }
          ]
        },
        HORARIO: {
          name: "Hor\xE1rio",
          description: "Escolhendo hor\xE1rio",
          transitions: [
            { intent: "CHOOSE_TIME", nextState: "CONFIRMACAO", action: "CONFIRM_BOOKING" }
          ]
        },
        CONFIRMACAO: {
          name: "Confirma\xE7\xE3o",
          description: "Confirmando agendamento",
          transitions: [
            { intent: "CONFIRM", nextState: "AGENDADO", action: "CREATE_APPOINTMENT" },
            { intent: "CANCEL", nextState: "CANCELADO", action: "CANCEL_BOOKING" }
          ]
        },
        AGENDADO: {
          name: "Agendado",
          description: "Consulta marcada",
          transitions: []
        },
        CANCELADO: {
          name: "Cancelado",
          description: "Agendamento cancelado",
          transitions: [
            { intent: "GREETING", nextState: "INICIO", action: "GREET_SCHEDULE" }
          ]
        }
      },
      intents: {
        GREETING: { name: "Sauda\xE7\xE3o", examples: ["oi", "ol\xE1"], priority: 10 },
        WANT_SCHEDULE: { name: "Quer Agendar", examples: ["quero agendar", "marcar hor\xE1rio", "consulta"], priority: 9 },
        ASK_SERVICES: { name: "Ver Servi\xE7os", examples: ["quais servi\xE7os", "o que voc\xEAs fazem"], priority: 7 },
        ASK_PRICES: { name: "Ver Pre\xE7os", examples: ["quanto custa", "valores", "tabela"], priority: 7 },
        CHOOSE_SERVICE: { name: "Escolher Servi\xE7o", examples: ["quero", "vou fazer"], entities: ["service"], priority: 8 },
        PROVIDE_DATE: { name: "Fornecer Data", examples: ["dia", "amanh\xE3", "segunda"], entities: ["date"], priority: 8 },
        CHOOSE_TIME: { name: "Escolher Hor\xE1rio", examples: ["\xE0s", "hor\xE1rio", "14h"], entities: ["time"], priority: 8 },
        CONFIRM: { name: "Confirmar", examples: ["confirma", "ok", "isso"], priority: 8 },
        CANCEL: { name: "Cancelar", examples: ["cancela", "desisto"], priority: 8 }
      },
      actions: {
        GREET_SCHEDULE: { name: "Saudar", type: "RESPONSE", template: "Ol\xE1! \u{1F60A} Bem-vindo ao {business_name}! Quer agendar um hor\xE1rio?" },
        ASK_SERVICE: { name: "Perguntar Servi\xE7o", type: "DATA", dataSource: "services", template: "Qual servi\xE7o voc\xEA gostaria?\n\n{services_list}" },
        SHOW_SERVICES: { name: "Mostrar Servi\xE7os", type: "DATA", dataSource: "services", template: "\u{1F4CB} Nossos servi\xE7os:\n\n{services_list}" },
        SHOW_PRICES: { name: "Mostrar Pre\xE7os", type: "DATA", dataSource: "services", template: "\u{1F4B0} Tabela de pre\xE7os:\n\n{prices_list}" },
        ASK_DATE: { name: "Perguntar Data", type: "RESPONSE", template: "\xD3timo! Para qual dia voc\xEA gostaria?" },
        SHOW_TIMES: { name: "Mostrar Hor\xE1rios", type: "DATA", template: "\u{1F4C5} Hor\xE1rios dispon\xEDveis para {date}:\n\n{times_list}\n\nQual prefere?" },
        CONFIRM_BOOKING: { name: "Confirmar", type: "DATA", template: "\u{1F4CB} *Confirma\xE7\xE3o*\n\n\u{1F5D3}\uFE0F {date} \xE0s {time}\n\u{1F486} {service}\n\u{1F4B0} R$ {price}\n\nConfirma?" },
        CREATE_APPOINTMENT: { name: "Criar Agendamento", type: "EXTERNAL", template: "\u2705 Agendamento confirmado!\n\n\u{1F5D3}\uFE0F {date} \xE0s {time}\n\nTe esperamos!" },
        CANCEL_BOOKING: { name: "Cancelar", type: "RESPONSE", template: "Agendamento cancelado. Quando quiser remarcar \xE9 s\xF3 chamar!" }
      },
      data: {
        services: [],
        business_hours: {}
      },
      globalRules: [
        "Nunca agendar fora do hor\xE1rio de funcionamento",
        "Sempre confirmar data e hor\xE1rio antes de finalizar"
      ],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Constrói flow de SUPORTE
   */
  buildSuporteFlow(agentName, businessName, personality) {
    return {
      id: `suporte_${Date.now()}`,
      version: "1.0.0",
      type: "SUPORTE",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["RESOLVIDO", "ESCALADO"],
      states: {
        INICIO: {
          name: "In\xEDcio",
          description: "Cliente chegou",
          transitions: [
            { intent: "GREETING", nextState: "IDENTIFICANDO", action: "GREET_SUPPORT" },
            { intent: "REPORT_PROBLEM", nextState: "DIAGNOSTICANDO", action: "START_DIAGNOSIS" }
          ]
        },
        IDENTIFICANDO: {
          name: "Identificando",
          description: "Entendendo o problema",
          transitions: [
            { intent: "REPORT_PROBLEM", nextState: "DIAGNOSTICANDO", action: "START_DIAGNOSIS" },
            { intent: "ASK_FAQ", nextState: "IDENTIFICANDO", action: "ANSWER_FAQ" }
          ]
        },
        DIAGNOSTICANDO: {
          name: "Diagnosticando",
          description: "Analisando problema",
          transitions: [
            { intent: "PROVIDE_INFO", nextState: "SOLUCIONANDO", action: "PROPOSE_SOLUTION" },
            { intent: "ASK_ESCALATE", nextState: "ESCALADO", action: "ESCALATE_TICKET" }
          ]
        },
        SOLUCIONANDO: {
          name: "Solucionando",
          description: "Aplicando solu\xE7\xE3o",
          transitions: [
            { intent: "CONFIRM_SOLVED", nextState: "RESOLVIDO", action: "CLOSE_TICKET" },
            { intent: "STILL_PROBLEM", nextState: "DIAGNOSTICANDO", action: "TRY_ALTERNATIVE" }
          ]
        },
        RESOLVIDO: {
          name: "Resolvido",
          description: "Problema resolvido",
          transitions: []
        },
        ESCALADO: {
          name: "Escalado",
          description: "Passou para humano",
          transitions: []
        }
      },
      intents: {
        GREETING: { name: "Sauda\xE7\xE3o", examples: ["oi", "preciso de ajuda"], priority: 10 },
        REPORT_PROBLEM: { name: "Reportar Problema", examples: ["n\xE3o funciona", "erro", "problema", "bug"], priority: 9 },
        ASK_FAQ: { name: "Pergunta FAQ", examples: ["como", "onde", "qual"], priority: 6 },
        PROVIDE_INFO: { name: "Dar Info", examples: ["\xE9 isso", "aconteceu", "print"], priority: 7 },
        ASK_ESCALATE: { name: "Escalar", examples: ["falar com humano", "atendente", "pessoa real"], priority: 8 },
        CONFIRM_SOLVED: { name: "Resolvido", examples: ["funcionou", "resolvido", "obrigado"], priority: 8 },
        STILL_PROBLEM: { name: "Ainda com Problema", examples: ["ainda n\xE3o", "continua", "n\xE3o resolveu"], priority: 7 }
      },
      actions: {
        GREET_SUPPORT: { name: "Saudar", type: "RESPONSE", template: "Ol\xE1! Sou do suporte {business_name}. Como posso ajudar?" },
        START_DIAGNOSIS: { name: "Iniciar Diagn\xF3stico", type: "RESPONSE", template: "Entendi! Me conta mais detalhes sobre o problema. O que exatamente est\xE1 acontecendo?" },
        ANSWER_FAQ: { name: "Responder FAQ", type: "DATA", dataSource: "kb_articles", template: "{answer}" },
        PROPOSE_SOLUTION: { name: "Propor Solu\xE7\xE3o", type: "RESPONSE", template: "Entendi! Tenta fazer o seguinte:\n\n{solution_steps}\n\nMe avisa se funcionou!" },
        TRY_ALTERNATIVE: { name: "Tentar Alternativa", type: "RESPONSE", template: "Ok, vamos tentar outra coisa:\n\n{alternative_steps}" },
        CLOSE_TICKET: { name: "Fechar Ticket", type: "RESPONSE", template: "\u2705 \xD3timo! Fico feliz que resolveu. Qualquer coisa \xE9 s\xF3 chamar!" },
        ESCALATE_TICKET: { name: "Escalar", type: "RESPONSE", template: "\u{1F4DE} Vou passar seu caso para um especialista. Em breve entrar\xE3o em contato!" }
      },
      data: {
        kb_articles: []
      },
      globalRules: [
        "Sempre tentar resolver antes de escalar",
        "Ser emp\xE1tico com o cliente frustrado"
      ],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Constrói flow de CURSO (infoprodutos, mentorias, treinamentos)
   * 
   * ARQUITETURA:
   * - Fluxo A: FAQ do curso (responder rápido e correto)
   * - Fluxo B: Vendas/Lead (transformar conversa em compra)
   * - Fluxo C: Qualificação (identificar perfil do aluno)
   */
  buildCursoFlow(agentName, businessName, personality) {
    return {
      id: `curso_${Date.now()}`,
      version: "1.0.0",
      type: "CURSO",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["INSCRITO", "NAO_INTERESSADO", "LEAD_CAPTURADO"],
      states: {
        // ═══════════════════════════════════════════════════════════════
        // INÍCIO - Primeira Interação
        // ═══════════════════════════════════════════════════════════════
        INICIO: {
          name: "In\xEDcio",
          description: "Primeira mensagem do cliente",
          transitions: [
            { intent: "GREETING", nextState: "QUALIFICANDO", action: "GREET_COURSE" },
            { intent: "ASK_COURSE_INFO", nextState: "FAQ", action: "EXPLAIN_COURSE" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICE" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" },
            { intent: "ASK_FOR_WHO", nextState: "FAQ", action: "EXPLAIN_FOR_WHO" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // QUALIFICANDO - Entendendo o interesse
        // ═══════════════════════════════════════════════════════════════
        QUALIFICANDO: {
          name: "Qualificando",
          description: "Entendendo necessidade do aluno",
          transitions: [
            { intent: "TELL_GOAL", nextState: "EXPLICANDO", action: "PERSONALIZE_PITCH" },
            { intent: "ASK_COURSE_INFO", nextState: "FAQ", action: "EXPLAIN_COURSE" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICE" },
            { intent: "ASK_FOR_WHO", nextState: "FAQ", action: "EXPLAIN_FOR_WHO" },
            { intent: "ASK_CONTENT", nextState: "FAQ", action: "EXPLAIN_CONTENT" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // FAQ - Respondendo dúvidas (base curada)
        // ═══════════════════════════════════════════════════════════════
        FAQ: {
          name: "FAQ",
          description: "Respondendo d\xFAvidas sobre o curso",
          transitions: [
            { intent: "ASK_COURSE_INFO", nextState: "FAQ", action: "EXPLAIN_COURSE" },
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICE" },
            { intent: "ASK_FOR_WHO", nextState: "FAQ", action: "EXPLAIN_FOR_WHO" },
            { intent: "ASK_CONTENT", nextState: "FAQ", action: "EXPLAIN_CONTENT" },
            { intent: "ASK_DURATION", nextState: "FAQ", action: "EXPLAIN_DURATION" },
            { intent: "ASK_CERTIFICATE", nextState: "FAQ", action: "EXPLAIN_CERTIFICATE" },
            { intent: "ASK_GUARANTEE", nextState: "FAQ", action: "EXPLAIN_GUARANTEE" },
            { intent: "ASK_SUPPORT", nextState: "FAQ", action: "EXPLAIN_SUPPORT" },
            { intent: "ASK_BONUS", nextState: "FAQ", action: "EXPLAIN_BONUS" },
            { intent: "ASK_PAYMENT_OPTIONS", nextState: "PRECOS", action: "SHOW_PAYMENT_OPTIONS" },
            { intent: "ASK_REQUIREMENTS", nextState: "FAQ", action: "EXPLAIN_REQUIREMENTS" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" },
            { intent: "ASK_HUMAN", nextState: "ENCAMINHANDO", action: "TRANSFER_TO_HUMAN" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // EXPLICANDO - Pitch personalizado
        // ═══════════════════════════════════════════════════════════════
        EXPLICANDO: {
          name: "Explicando",
          description: "Explicando solu\xE7\xE3o personalizada",
          transitions: [
            { intent: "ASK_PRICE", nextState: "PRECOS", action: "SHOW_PRICE" },
            { intent: "ASK_CONTENT", nextState: "FAQ", action: "EXPLAIN_CONTENT" },
            { intent: "ASK_RESULTS", nextState: "EXPLICANDO", action: "SHOW_RESULTS" },
            { intent: "ASK_TESTIMONIALS", nextState: "EXPLICANDO", action: "SHOW_TESTIMONIALS" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" },
            { intent: "OBJECTION", nextState: "TRATANDO_OBJECAO", action: "HANDLE_OBJECTION" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // PREÇOS - Falando sobre valores
        // ═══════════════════════════════════════════════════════════════
        PRECOS: {
          name: "Pre\xE7os",
          description: "Apresentando valores e condi\xE7\xF5es",
          transitions: [
            { intent: "ASK_COUPON", nextState: "PRECOS", action: "EXPLAIN_COUPON" },
            { intent: "ASK_INSTALLMENTS", nextState: "PRECOS", action: "SHOW_INSTALLMENTS" },
            { intent: "ASK_GUARANTEE", nextState: "FAQ", action: "EXPLAIN_GUARANTEE" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" },
            { intent: "OBJECTION", nextState: "TRATANDO_OBJECAO", action: "HANDLE_OBJECTION" },
            { intent: "TOO_EXPENSIVE", nextState: "TRATANDO_OBJECAO", action: "HANDLE_PRICE_OBJECTION" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // TRATANDO OBJEÇÃO - Contornando dúvidas
        // ═══════════════════════════════════════════════════════════════
        TRATANDO_OBJECAO: {
          name: "Tratando Obje\xE7\xE3o",
          description: "Respondendo obje\xE7\xF5es e d\xFAvidas",
          transitions: [
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" },
            { intent: "ASK_GUARANTEE", nextState: "FAQ", action: "EXPLAIN_GUARANTEE" },
            { intent: "NEED_TIME", nextState: "LEAD_CAPTURADO", action: "CAPTURE_LEAD" },
            { intent: "NOT_NOW", nextState: "LEAD_CAPTURADO", action: "CAPTURE_LEAD" },
            { intent: "NOT_INTERESTED", nextState: "NAO_INTERESSADO", action: "RESPECT_DECISION" },
            { intent: "ASK_HUMAN", nextState: "ENCAMINHANDO", action: "TRANSFER_TO_HUMAN" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // FECHANDO - Processo de matrícula
        // ═══════════════════════════════════════════════════════════════
        FECHANDO: {
          name: "Fechando",
          description: "Fechando matr\xEDcula",
          transitions: [
            { intent: "CONFIRM", nextState: "INSCRITO", action: "SEND_ENROLLMENT_LINK" },
            { intent: "ASK_GUARANTEE", nextState: "FECHANDO", action: "REASSURE_GUARANTEE" },
            { intent: "OBJECTION", nextState: "TRATANDO_OBJECAO", action: "HANDLE_OBJECTION" },
            { intent: "NEED_TIME", nextState: "LEAD_CAPTURADO", action: "CAPTURE_LEAD" }
          ]
        },
        // ═══════════════════════════════════════════════════════════════
        // ESTADOS FINAIS
        // ═══════════════════════════════════════════════════════════════
        INSCRITO: {
          name: "Inscrito",
          description: "Aluno se inscreveu",
          transitions: [
            { intent: "ASK_ACCESS", nextState: "INSCRITO", action: "EXPLAIN_ACCESS" },
            { intent: "ASK_HELP", nextState: "INSCRITO", action: "OFFER_SUPPORT" }
          ]
        },
        LEAD_CAPTURADO: {
          name: "Lead Capturado",
          description: "Lead para follow-up futuro",
          transitions: [
            { intent: "GREETING", nextState: "QUALIFICANDO", action: "WELCOME_BACK" },
            { intent: "WANT_ENROLL", nextState: "FECHANDO", action: "START_ENROLLMENT" }
          ]
        },
        NAO_INTERESSADO: {
          name: "N\xE3o Interessado",
          description: "Cliente n\xE3o quis",
          transitions: [
            { intent: "GREETING", nextState: "INICIO", action: "GREET_COURSE" }
          ]
        },
        ENCAMINHANDO: {
          name: "Encaminhando",
          description: "Passando para humano",
          transitions: []
        }
      },
      // ═══════════════════════════════════════════════════════════════════
      // INTENTS - Intenções reconhecidas
      // ═══════════════════════════════════════════════════════════════════
      intents: {
        // Saudação
        GREETING: {
          name: "Sauda\xE7\xE3o",
          examples: ["oi", "ol\xE1", "bom dia", "boa tarde", "e a\xED", "eai", "opa"],
          patterns: ["^(oi|ola|bom\\s+dia|boa\\s+(tarde|noite)|e\\s*a[i\xED]|opa)[!?.,]?$"],
          priority: 10
        },
        // FAQ - Informações do curso
        ASK_COURSE_INFO: {
          name: "O que \xE9 o curso",
          examples: ["o que \xE9", "sobre o que \xE9", "me fala do curso", "como funciona", "o que vou aprender", "do que se trata"],
          patterns: ["o\\s+que\\s+[e\xE9]", "como\\s+funciona", "sobre\\s+o\\s+que", "do\\s+que\\s+se\\s+trata"],
          priority: 8
        },
        ASK_FOR_WHO: {
          name: "Para quem \xE9",
          examples: ["para quem \xE9", "pra quem \xE9", "\xE9 pra iniciante", "serve pra mim", "\xE9 pra quem", "preciso ter experi\xEAncia"],
          patterns: ["(para|pra)\\s+quem", "[e\xE9]\\s+pra\\s+(iniciante|quem)", "serve\\s+pra\\s+mim", "experi[\xEAe]ncia"],
          priority: 8
        },
        ASK_CONTENT: {
          name: "Conte\xFAdo do curso",
          examples: ["o que tem no curso", "quais m\xF3dulos", "quais aulas", "conte\xFAdo", "grade", "ementa", "tem aula de"],
          patterns: ["o\\s+que\\s+tem", "quais\\s+(m[\xF3o]dulos|aulas)", "conte[\xFAu]do", "grade", "ementa"],
          priority: 7
        },
        ASK_DURATION: {
          name: "Dura\xE7\xE3o",
          examples: ["quanto tempo dura", "dura\xE7\xE3o", "quantas horas", "quantas aulas", "tempo do curso"],
          patterns: ["quanto\\s+tempo", "dura[\xE7c][a\xE3]o", "quantas\\s+(horas|aulas)"],
          priority: 6
        },
        ASK_CERTIFICATE: {
          name: "Certificado",
          examples: ["tem certificado", "certificado", "certifica\xE7\xE3o", "d\xE1 certificado", "diploma"],
          patterns: ["certificad[oa]", "certifica[\xE7c][a\xE3]o", "diploma"],
          priority: 6
        },
        ASK_GUARANTEE: {
          name: "Garantia",
          examples: ["tem garantia", "posso devolver", "reembolso", "garantia de satisfa\xE7\xE3o", "e se eu n\xE3o gostar"],
          patterns: ["garantia", "reembolso", "devolver", "n[a\xE3]o\\s+gostar"],
          priority: 7
        },
        ASK_SUPPORT: {
          name: "Suporte",
          examples: ["tem suporte", "como tiro d\xFAvida", "consigo falar", "comunidade", "grupo", "ajuda"],
          patterns: ["suporte", "tirar\\s+d[\xFAu]vida", "comunidade", "grupo"],
          priority: 6
        },
        ASK_BONUS: {
          name: "B\xF4nus",
          examples: ["quais b\xF4nus", "o que vem junto", "tem brinde", "materiais extras", "al\xE9m do curso"],
          patterns: ["b[\xF4o]nus", "brinde", "materiais\\s+extras", "al[e\xE9]m\\s+do\\s+curso"],
          priority: 5
        },
        ASK_REQUIREMENTS: {
          name: "Pr\xE9-requisitos",
          examples: ["preciso saber algo", "pr\xE9-requisito", "preciso ter", "conhecimento pr\xE9vio"],
          patterns: ["pr[e\xE9][-]?requisito", "preciso\\s+(saber|ter)", "conhecimento\\s+pr[e\xE9]vio"],
          priority: 5
        },
        ASK_ACCESS: {
          name: "Acesso",
          examples: ["como acesso", "onde acesso", "liberou", "\xE1rea de membros", "login"],
          patterns: ["como\\s+acesso", "onde\\s+acesso", "[a\xE1]rea\\s+de\\s+membros", "login"],
          priority: 6
        },
        // Preços e pagamento
        ASK_PRICE: {
          name: "Pre\xE7o",
          examples: ["quanto custa", "qual o valor", "pre\xE7o", "quanto \xE9", "investimento"],
          patterns: ["quanto\\s+(custa|[e\xE9])", "qual\\s+o?\\s*valor", "pre[\xE7c]o", "investimento"],
          priority: 9
        },
        ASK_PAYMENT_OPTIONS: {
          name: "Formas de Pagamento",
          examples: ["formas de pagamento", "aceita pix", "parcelamento", "como pago", "parcela em quantas vezes"],
          patterns: ["formas?\\s+de\\s+pagamento", "aceita\\s+(pix|cart[a\xE3]o)", "parcel", "como\\s+pago"],
          priority: 7
        },
        ASK_INSTALLMENTS: {
          name: "Parcelamento",
          examples: ["parcela em quantas vezes", "posso parcelar", "divide", "parcelas", "cart\xE3o"],
          patterns: ["parcela", "divide", "quantas\\s+vezes", "cart[a\xE3]o"],
          priority: 7
        },
        ASK_COUPON: {
          name: "Cupom",
          examples: ["tem cupom", "c\xF3digo de desconto", "promo\xE7\xE3o", "desconto"],
          patterns: ["cupom", "c[\xF3o]digo", "promo[\xE7c][a\xE3]o", "desconto"],
          priority: 6
        },
        TOO_EXPENSIVE: {
          name: "Caro demais",
          examples: ["muito caro", "n\xE3o tenho dinheiro", "t\xE1 caro", "fora do or\xE7amento", "pesado"],
          patterns: ["(muito|t[a\xE1])\\s+caro", "n[a\xE3]o\\s+tenho\\s+dinheiro", "or[\xE7c]amento", "pesado"],
          priority: 7
        },
        // Qualificação
        TELL_GOAL: {
          name: "Contar objetivo",
          examples: ["quero aprender", "meu objetivo \xE9", "preciso de", "quero ser", "quero trabalhar com"],
          patterns: ["quero\\s+(aprender|ser|trabalhar)", "meu\\s+objetivo", "preciso\\s+de"],
          entities: ["goal", "experience_level"],
          priority: 7
        },
        // Vendas
        WANT_ENROLL: {
          name: "Quero me inscrever",
          examples: ["quero comprar", "quero me inscrever", "como fa\xE7o pra comprar", "link de compra", "quero adquirir", "vou comprar", "me inscreve"],
          patterns: ["quero\\s+(comprar|me\\s+inscrever|adquirir)", "link\\s+de\\s+compra", "como\\s+(fa[\xE7c]o|compro)", "vou\\s+comprar"],
          priority: 9
        },
        CONFIRM: {
          name: "Confirmar",
          examples: ["ok", "isso", "vou comprar", "fecha", "quero"],
          patterns: ["^(ok|isso|fecha|quero|vou|sim)$"],
          priority: 8
        },
        // Objeções
        OBJECTION: {
          name: "Obje\xE7\xE3o",
          examples: ["ser\xE1 que funciona", "tenho medo", "e se n\xE3o der certo", "n\xE3o sei se", "estou em d\xFAvida"],
          patterns: ["ser[a\xE1]\\s+que", "tenho\\s+medo", "n[a\xE3]o\\s+sei\\s+se", "d[\xFAu]vida", "e\\s+se"],
          priority: 6
        },
        NEED_TIME: {
          name: "Preciso pensar",
          examples: ["vou pensar", "preciso pensar", "deixa eu ver", "vou analisar", "depois volto"],
          patterns: ["vou\\s+(pensar|analisar)", "preciso\\s+pensar", "deixa\\s+eu\\s+ver", "depois"],
          priority: 7
        },
        NOT_NOW: {
          name: "Agora n\xE3o",
          examples: ["agora n\xE3o d\xE1", "depois", "m\xEAs que vem", "outro momento"],
          patterns: ["agora\\s+n[a\xE3]o", "depois", "m[e\xEA]s\\s+que\\s+vem", "outro\\s+momento"],
          priority: 6
        },
        NOT_INTERESTED: {
          name: "N\xE3o interessado",
          examples: ["n\xE3o tenho interesse", "n\xE3o quero", "n\xE3o \xE9 pra mim", "obrigado mas n\xE3o"],
          patterns: ["n[a\xE3]o\\s+(tenho\\s+interesse|quero|[e\xE9]\\s+pra\\s+mim)"],
          priority: 8
        },
        // Resultados e prova social
        ASK_RESULTS: {
          name: "Resultados",
          examples: ["funciona mesmo", "tem resultado", "quem j\xE1 fez", "d\xE1 resultado"],
          patterns: ["funciona\\s+mesmo", "resultado", "quem\\s+j[a\xE1]\\s+fez"],
          priority: 6
        },
        ASK_TESTIMONIALS: {
          name: "Depoimentos",
          examples: ["depoimentos", "casos de sucesso", "quem j\xE1 comprou", "feedback de alunos"],
          patterns: ["depoimento", "casos?\\s+de\\s+sucesso", "feedback", "alunos\\s+que"],
          priority: 5
        },
        // Escalar
        ASK_HUMAN: {
          name: "Falar com humano",
          examples: ["falar com algu\xE9m", "atendente", "pessoa real", "humano"],
          patterns: ["falar\\s+com\\s+(algu[e\xE9]m|pessoa|atendente|humano)"],
          priority: 8
        },
        ASK_HELP: {
          name: "Ajuda",
          examples: ["preciso de ajuda", "me ajuda", "estou com d\xFAvida"],
          patterns: ["ajuda", "d[\xFAu]vida"],
          priority: 5
        }
      },
      // ═══════════════════════════════════════════════════════════════════
      // ACTIONS - Ações e templates
      // ═══════════════════════════════════════════════════════════════════
      actions: {
        // Saudação
        GREET_COURSE: {
          name: "Saudar",
          type: "RESPONSE",
          template: `Ol\xE1! \u{1F60A} Seja bem-vindo(a)!

Sou {agent_name} e estou aqui para te ajudar a conhecer o {business_name}.

Voc\xEA tem interesse em transformar sua carreira/vida atrav\xE9s do nosso m\xE9todo?`,
          variables: ["agent_name", "business_name"]
        },
        WELCOME_BACK: {
          name: "Bem-vindo de volta",
          type: "RESPONSE",
          template: `Ol\xE1! Que bom te ver de volta! \u{1F60A}

Ficou com alguma d\xFAvida sobre o {business_name}? Estou aqui pra ajudar!`,
          variables: ["business_name"]
        },
        // FAQ - Respostas da base curada
        EXPLAIN_COURSE: {
          name: "Explicar o curso",
          type: "DATA",
          dataSource: "course_info",
          template: `\u{1F4DA} *Sobre o {business_name}*

{course_description}

\u2705 O que voc\xEA vai aprender:
{learning_outcomes}

Quer saber mais sobre o conte\xFAdo ou sobre como funciona a garantia?`,
          variables: ["business_name", "course_description", "learning_outcomes"]
        },
        EXPLAIN_FOR_WHO: {
          name: "Para quem \xE9",
          type: "DATA",
          dataSource: "target_audience",
          template: `\u{1F3AF} *Para quem \xE9 o {business_name}?*

{target_audience}

{not_for_audience}

Se identificou? Posso te explicar melhor o conte\xFAdo!`,
          variables: ["business_name", "target_audience", "not_for_audience"]
        },
        EXPLAIN_CONTENT: {
          name: "Conte\xFAdo",
          type: "DATA",
          dataSource: "modules",
          template: `\u{1F4D6} *Conte\xFAdo do Curso*

{modules_list}

S\xE3o {total_hours} horas de conte\xFAdo pr\xE1tico e direto ao ponto!

Quer saber sobre os b\xF4nus que v\xEAm junto?`,
          variables: ["modules_list", "total_hours"]
        },
        EXPLAIN_DURATION: {
          name: "Dura\xE7\xE3o",
          type: "DATA",
          dataSource: "course_info",
          template: `\u23F1\uFE0F *Dura\xE7\xE3o*

O curso tem {total_hours} horas de conte\xFAdo.

Voc\xEA pode fazer no seu ritmo, com acesso {access_period}.

As aulas s\xE3o gravadas e ficam dispon\xEDveis 24h!`,
          variables: ["total_hours", "access_period"]
        },
        EXPLAIN_CERTIFICATE: {
          name: "Certificado",
          type: "DATA",
          dataSource: "certificate_info",
          template: `\u{1F393} *Certificado*

{certificate_description}

{certificate_validity}`,
          variables: ["certificate_description", "certificate_validity"]
        },
        EXPLAIN_GUARANTEE: {
          name: "Garantia",
          type: "DATA",
          dataSource: "guarantee_info",
          template: `\u2705 *Garantia de {guarantee_days} dias*

{guarantee_description}

Se por qualquer motivo voc\xEA n\xE3o gostar, basta pedir o reembolso em at\xE9 {guarantee_days} dias e devolvemos 100% do valor. Sem burocracia!

Isso te deixa mais tranquilo(a)?`,
          variables: ["guarantee_days", "guarantee_description"]
        },
        EXPLAIN_SUPPORT: {
          name: "Suporte",
          type: "DATA",
          dataSource: "support_info",
          template: `\u{1F4AC} *Suporte ao Aluno*

{support_description}

{community_info}

Voc\xEA nunca estar\xE1 sozinho(a) nessa jornada!`,
          variables: ["support_description", "community_info"]
        },
        EXPLAIN_BONUS: {
          name: "B\xF4nus",
          type: "DATA",
          dataSource: "bonus_info",
          template: `\u{1F381} *B\xF4nus Exclusivos*

Al\xE9m do curso completo, voc\xEA recebe:

{bonus_list}

Tudo isso est\xE1 incluso no valor da inscri\xE7\xE3o!`,
          variables: ["bonus_list"]
        },
        EXPLAIN_REQUIREMENTS: {
          name: "Pr\xE9-requisitos",
          type: "DATA",
          dataSource: "requirements",
          template: `\u{1F4CB} *Pr\xE9-requisitos*

{requirements_description}

{equipment_needed}

O curso foi feito pra voc\xEA conseguir acompanhar mesmo partindo do zero!`,
          variables: ["requirements_description", "equipment_needed"]
        },
        EXPLAIN_ACCESS: {
          name: "Como acessar",
          type: "DATA",
          dataSource: "access_info",
          template: `\u{1F511} *Acesso \xE0s Aulas*

{access_instructions}

Qualquer d\xFAvida t\xE9cnica, nossa equipe de suporte est\xE1 dispon\xEDvel!`,
          variables: ["access_instructions"]
        },
        // Preços
        SHOW_PRICE: {
          name: "Mostrar pre\xE7o",
          type: "DATA",
          dataSource: "pricing",
          template: `\u{1F4B0} *Investimento*

{pricing_details}

{payment_options}

E lembre-se: voc\xEA tem {guarantee_days} dias de garantia!

Quer ver as formas de pagamento?`,
          variables: ["pricing_details", "payment_options", "guarantee_days"]
        },
        SHOW_PAYMENT_OPTIONS: {
          name: "Formas de pagamento",
          type: "DATA",
          dataSource: "payment_methods",
          template: `\u{1F4B3} *Formas de Pagamento*

{payment_methods_list}

{installments_info}

Qual forma prefere?`,
          variables: ["payment_methods_list", "installments_info"]
        },
        SHOW_INSTALLMENTS: {
          name: "Parcelamento",
          type: "DATA",
          dataSource: "installments",
          template: `\u{1F4B3} *Parcelamento*

{installments_details}

Quer que eu te mande o link para garantir sua vaga?`,
          variables: ["installments_details"]
        },
        EXPLAIN_COUPON: {
          name: "Cupom",
          type: "DATA",
          dataSource: "coupons",
          template: `\u{1F39F}\uFE0F *Cupom de Desconto*

{coupon_info}

Esse desconto \xE9 por tempo limitado!`,
          variables: ["coupon_info"]
        },
        // Qualificação e Pitch
        PERSONALIZE_PITCH: {
          name: "Pitch personalizado",
          type: "RESPONSE",
          template: `Que legal! \u{1F525}

Com o {business_name} voc\xEA vai conseguir exatamente isso!

{personalized_benefits}

Quer conhecer o conte\xFAdo completo ou j\xE1 quer saber como se inscrever?`,
          variables: ["business_name", "personalized_benefits"]
        },
        // Resultados e prova social
        SHOW_RESULTS: {
          name: "Mostrar resultados",
          type: "DATA",
          dataSource: "results",
          template: `\u{1F4C8} *Resultados dos Alunos*

{results_description}

{success_metrics}

Quer ver depoimentos de quem j\xE1 fez?`,
          variables: ["results_description", "success_metrics"]
        },
        SHOW_TESTIMONIALS: {
          name: "Depoimentos",
          type: "DATA",
          dataSource: "testimonials",
          template: `\u2B50 *O que nossos alunos dizem*

{testimonials_list}

Quer garantir sua vaga tamb\xE9m?`,
          variables: ["testimonials_list"]
        },
        // Objeções
        HANDLE_OBJECTION: {
          name: "Tratar obje\xE7\xE3o",
          type: "RESPONSE",
          template: `Entendo perfeitamente sua preocupa\xE7\xE3o! \u{1F60A}

{objection_response}

E lembre-se: voc\xEA tem {guarantee_days} dias pra testar. Se n\xE3o gostar, devolvemos seu dinheiro!

Posso tirar mais alguma d\xFAvida?`,
          variables: ["objection_response", "guarantee_days"]
        },
        HANDLE_PRICE_OBJECTION: {
          name: "Tratar pre\xE7o",
          type: "RESPONSE",
          template: `Entendo! \u{1F4AD}

Olha, quando voc\xEA divide o investimento pelo que vai aprender, fica menos de {daily_value} por dia!

{value_comparison}

E voc\xEA ainda tem {guarantee_days} dias pra testar. Se n\xE3o valer a pena, devolvemos tudo!

{payment_facilitation}`,
          variables: ["daily_value", "value_comparison", "guarantee_days", "payment_facilitation"]
        },
        // Fechamento
        START_ENROLLMENT: {
          name: "Iniciar matr\xEDcula",
          type: "RESPONSE",
          template: `\xD3tima decis\xE3o! \u{1F389}

Voc\xEA est\xE1 a um passo de transformar sua vida!

\u{1F4CB} *Resumo:*
\u2022 {business_name}
\u2022 {total_hours} de conte\xFAdo
\u2022 Acesso {access_period}
\u2022 Garantia de {guarantee_days} dias
\u2022 Todos os b\xF4nus inclusos

{enrollment_cta}

Posso te mandar o link de inscri\xE7\xE3o?`,
          variables: ["business_name", "total_hours", "access_period", "guarantee_days", "enrollment_cta"]
        },
        REASSURE_GUARANTEE: {
          name: "Refor\xE7ar garantia",
          type: "RESPONSE",
          template: `N\xE3o se preocupe! \u{1F60A}

A garantia funciona assim: voc\xEA tem {guarantee_days} dias pra testar o curso. Se n\xE3o gostar por QUALQUER motivo, \xE9 s\xF3 mandar um email pedindo reembolso e devolvemos 100% do valor.

Sem perguntas, sem burocracia!

Quer que eu mande o link?`,
          variables: ["guarantee_days"]
        },
        SEND_ENROLLMENT_LINK: {
          name: "Enviar link",
          type: "RESPONSE",
          template: `Perfeito! \u{1F680}

Aqui est\xE1 seu link exclusivo de inscri\xE7\xE3o:

\u{1F449} {enrollment_link}

Qualquer d\xFAvida durante o processo, me chama aqui!

Te vejo do outro lado! \u{1F393}`,
          variables: ["enrollment_link"]
        },
        // Lead
        CAPTURE_LEAD: {
          name: "Capturar lead",
          type: "RESPONSE",
          template: `Sem problema! Fico feliz em poder te ajudar! \u{1F60A}

Quando estiver pronto(a), \xE9 s\xF3 me chamar aqui que te ajudo com a inscri\xE7\xE3o!

{lead_nurture_message}

At\xE9 breve! \u{1F44B}`,
          variables: ["lead_nurture_message"]
        },
        RESPECT_DECISION: {
          name: "Respeitar decis\xE3o",
          type: "RESPONSE",
          template: `Tudo bem, respeito sua decis\xE3o! \u{1F60A}

Se mudar de ideia ou tiver qualquer d\xFAvida no futuro, estou por aqui!

Desejo sucesso na sua jornada! \u{1F64F}`,
          variables: []
        },
        // Suporte
        OFFER_SUPPORT: {
          name: "Oferecer suporte",
          type: "RESPONSE",
          template: `Claro! Estou aqui pra te ajudar! \u{1F60A}

{support_response}

Mais alguma d\xFAvida?`,
          variables: ["support_response"]
        },
        TRANSFER_TO_HUMAN: {
          name: "Transferir pra humano",
          type: "RESPONSE",
          template: `Entendi! Vou passar seu contato para nossa equipe! \u{1F4DE}

Em breve algu\xE9m vai entrar em contato com voc\xEA para tirar todas as suas d\xFAvidas.

Enquanto isso, posso te ajudar com mais alguma informa\xE7\xE3o?`,
          variables: []
        }
      },
      // ═══════════════════════════════════════════════════════════════════
      // DATA - Dados padrão do curso (serão sobrescritos pela config)
      // ═══════════════════════════════════════════════════════════════════
      data: {
        // Informações do curso
        faq: [
          { question: "O que \xE9 o curso?", answer: "Um treinamento completo para voc\xEA dominar..." },
          { question: "Para quem \xE9?", answer: "Para quem quer aprender..." },
          { question: "Quanto tempo dura?", answer: "S\xE3o X horas de conte\xFAdo..." },
          { question: "Tem certificado?", answer: "Sim! Voc\xEA recebe certificado ao concluir." },
          { question: "Tem garantia?", answer: "Sim! Garantia de 7 dias." }
        ],
        prices: {
          full: 997,
          promotional: 497,
          installments: 12
        },
        links: {
          checkout: "",
          area_membros: ""
        },
        // Configurações específicas de curso
        course_info: {
          total_hours: 40,
          access_period: "vital\xEDcio",
          guarantee_days: 7,
          modules_count: 8
        }
      },
      globalRules: [
        "NUNCA inventar informa\xE7\xF5es sobre pre\xE7os - usar apenas dados cadastrados",
        "NUNCA inventar depoimentos ou resultados",
        "SEMPRE mencionar a garantia quando falar de pre\xE7o",
        "SEMPRE ser emp\xE1tico com obje\xE7\xF5es",
        "NUNCA pressionar demais - respeitar o tempo do cliente",
        "Se n\xE3o souber responder algo espec\xEDfico, oferecer falar com humano"
      ],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Constrói flow GENÉRICO (fallback)
   */
  buildGenericoFlow(agentName, businessName, personality) {
    return {
      id: `generico_${Date.now()}`,
      version: "1.0.0",
      type: "GENERICO",
      businessName,
      agentName,
      agentPersonality: personality,
      initialState: "INICIO",
      finalStates: ["FINALIZADO"],
      states: {
        INICIO: {
          name: "In\xEDcio",
          description: "Estado inicial",
          transitions: [
            { intent: "GREETING", nextState: "CONVERSANDO", action: "GREET" },
            { intent: "ASK_INFO", nextState: "CONVERSANDO", action: "PROVIDE_INFO" }
          ]
        },
        CONVERSANDO: {
          name: "Conversando",
          description: "Em conversa",
          transitions: [
            { intent: "ASK_INFO", nextState: "CONVERSANDO", action: "PROVIDE_INFO" },
            { intent: "THANKS", nextState: "FINALIZADO", action: "FAREWELL" },
            { intent: "FAREWELL", nextState: "FINALIZADO", action: "FAREWELL" }
          ]
        },
        FINALIZADO: {
          name: "Finalizado",
          description: "Conversa encerrada",
          transitions: [
            { intent: "GREETING", nextState: "INICIO", action: "GREET" }
          ]
        }
      },
      intents: {
        GREETING: { name: "Sauda\xE7\xE3o", examples: ["oi", "ol\xE1"], priority: 10 },
        ASK_INFO: { name: "Pedir Info", examples: ["como", "onde", "quando", "qual"], priority: 5 },
        THANKS: { name: "Agradecer", examples: ["obrigado", "valeu"], priority: 7 },
        FAREWELL: { name: "Despedida", examples: ["tchau", "at\xE9 mais"], priority: 7 }
      },
      actions: {
        GREET: { name: "Saudar", type: "RESPONSE", template: "Ol\xE1! \u{1F60A} Sou {agent_name} do {business_name}. Como posso ajudar?" },
        PROVIDE_INFO: { name: "Dar Info", type: "RESPONSE", template: "{response}" },
        FAREWELL: { name: "Despedir", type: "RESPONSE", template: "At\xE9 mais! \u{1F44B} Qualquer coisa \xE9 s\xF3 chamar!" }
      },
      data: {},
      globalRules: [],
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
  }
  /**
   * Enriquece FlowDefinition usando IA para análise profunda
   */
  async enrichWithAI(flow, originalPrompt) {
    if (!this.anthropic) return flow;
    try {
      const response = await this.anthropic.messages.create({
        model: "claude-3-haiku-20240307",
        max_tokens: 2e3,
        temperature: 0,
        system: `Voc\xEA \xE9 um analisador de prompts de agentes de IA.
Analise o prompt fornecido e extraia:
1. FAQ adicional (perguntas frequentes e respostas)
2. Regras espec\xEDficas do neg\xF3cio
3. Inten\xE7\xF5es adicionais que devem ser reconhecidas
4. Vari\xE1veis importantes (pre\xE7os, links, nomes)

Retorne JSON v\xE1lido:
{
  "faq": [{"question": "...", "answer": "..."}],
  "rules": ["regra1", "regra2"],
  "intents": [{"name": "INTENT_NAME", "examples": ["ex1", "ex2"]}],
  "variables": {"key": "value"}
}`,
        messages: [{
          role: "user",
          content: `PROMPT DO AGENTE:

${originalPrompt}`
        }]
      });
      const content = response.content[0];
      if (content.type !== "text") return flow;
      const enrichment = JSON.parse(content.text);
      if (enrichment.faq) {
        flow.data.faq = [...flow.data.faq || [], ...enrichment.faq];
      }
      if (enrichment.rules) {
        flow.globalRules = [...flow.globalRules, ...enrichment.rules];
      }
      if (enrichment.intents) {
        for (const intent of enrichment.intents) {
          flow.intents[intent.name] = {
            name: intent.name,
            examples: intent.examples,
            priority: 5
          };
        }
      }
      console.log("[FlowBuilder] Enriquecimento com IA aplicado");
    } catch (error) {
      console.error("[FlowBuilder] Erro no enriquecimento:", error);
    }
    return flow;
  }
};

// server/UnifiedFlowEngine.ts
var FlowStorage = class {
  /**
   * Salva ou atualiza FlowDefinition no banco
   */
  static async saveFlow(userId, flow) {
    try {
      const { error } = await supabase.from("agent_flows").upsert({
        user_id: userId,
        flow_id: flow.id,
        flow_type: flow.type,
        flow_definition: flow,
        business_name: flow.businessName,
        agent_name: flow.agentName,
        version: flow.version,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, {
        onConflict: "user_id"
      });
      if (error) {
        console.error(`[FlowStorage] Erro ao salvar flow:`, error);
        return false;
      }
      console.log(`[FlowStorage] \u2705 Flow salvo: ${flow.id} (${flow.type}) para user ${userId}`);
      return true;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return false;
    }
  }
  /**
   * Carrega FlowDefinition do usuário
   */
  static async loadFlow(userId) {
    try {
      const { data, error } = await supabase.from("agent_flows").select("flow_definition").eq("user_id", userId).single();
      if (error) {
        if (error.code !== "PGRST116") {
          console.error(`[FlowStorage] Erro ao carregar flow:`, error);
        }
        return null;
      }
      return data?.flow_definition;
    } catch (err) {
      console.error(`[FlowStorage] Erro:`, err);
      return null;
    }
  }
  /**
   * Salva estado da conversa
   */
  static async saveConversationState(state) {
    try {
      const { error } = await supabase.from("conversation_flow_states").upsert({
        conversation_id: state.conversationId,
        user_id: state.userId,
        flow_id: state.flowId,
        current_state: state.currentState,
        data: state.data,
        history: state.history,
        updated_at: (/* @__PURE__ */ new Date()).toISOString()
      }, {
        onConflict: "conversation_id"
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
  static async loadConversationState(conversationId) {
    try {
      const { data, error } = await supabase.from("conversation_flow_states").select("*").eq("conversation_id", conversationId).single();
      if (error) {
        if (error.code !== "PGRST116") {
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
};
var AIInterpreter = class {
  // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
  constructor() {
    console.log(`[AIInterpreter] Inicializado com OpenRouter/Chutes`);
  }
  /**
   * Detecta intenção do usuário com base no FlowDefinition
   */
  async detectIntent(message, flow, currentState, context) {
    const state = flow.states[currentState];
    if (!state) {
      return { intent: "UNKNOWN", confidence: 0 };
    }
    if (!state.transitions || !Array.isArray(state.transitions)) {
      console.warn(`[AIInterpreter] Estado ${currentState} n\xE3o tem transitions v\xE1lidas`);
      return { intent: "UNKNOWN", confidence: 0 };
    }
    const possibleIntents = state.transitions.map((t) => t.intent);
    const intentDescriptions = possibleIntents.map((intentId) => {
      const intent = flow.intents[intentId];
      return intent ? `${intentId}: Exemplos: "${intent.examples.slice(0, 3).join('", "')}"` : intentId;
    }).join("\n");
    const systemPrompt = `Voc\xEA \xE9 um analisador de inten\xE7\xF5es para atendimento via WhatsApp.
Neg\xF3cio: ${flow.businessName}
Agente: ${flow.agentName}
Estado atual: ${currentState}

INTENTS POSS\xCDVEIS NESTE ESTADO:
${intentDescriptions}

TAREFA:
Analise a mensagem do cliente e identifique qual intent ela representa.
Retorne APENAS JSON v\xE1lido no formato:
{
  "intent": "NOME_DO_INTENT",
  "confidence": 0-100,
  "extractedData": { ... }  // dados extra\xEDdos se houver (ex: quantidade, item, etc)
}

REGRAS:
- Se n\xE3o tiver certeza, use confidence baixa
- Se n\xE3o reconhecer, retorne intent: "UNKNOWN"
- Extraia dados relevantes (n\xFAmeros, nomes, etc)`;
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Mensagem do cliente: "${message}"` }
      ];
      const response = await chatComplete({
        messages,
        temperature: 0.1,
        maxTokens: 200
      });
      const text = response.choices?.[0]?.message?.content?.trim() || "{}";
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const result = JSON.parse(jsonMatch ? jsonMatch[0] : text);
      return {
        intent: result.intent || "UNKNOWN",
        confidence: result.confidence || 0,
        extractedData: result.extractedData
      };
    } catch (err) {
      console.error(`[AIInterpreter] Erro na detec\xE7\xE3o:`, err);
      return { intent: "UNKNOWN", confidence: 0 };
    }
  }
  /**
   * Detecção rápida usando regex (fallback sem IA)
   */
  detectIntentFast(message, flow, currentState) {
    const state = flow.states[currentState];
    if (!state) {
      return { intent: "UNKNOWN", confidence: 0 };
    }
    const msgLower = message.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    for (const transition of state.transitions) {
      const intent = flow.intents[transition.intent];
      if (!intent) continue;
      if (intent.patterns) {
        for (const pattern of intent.patterns) {
          const regex = new RegExp(pattern, "i");
          if (regex.test(msgLower)) {
            return { intent: transition.intent, confidence: 90 };
          }
        }
      }
      for (const example of intent.examples) {
        const exampleLower = example.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        if (msgLower.includes(exampleLower) || exampleLower.includes(msgLower)) {
          return { intent: transition.intent, confidence: 70 };
        }
      }
    }
    if (msgLower.match(/^(oi|ola|bom dia|boa tarde|boa noite|e ai|eae|hey|hi)\s*[!?,.]?$/)) {
      return { intent: "GREETING", confidence: 95 };
    }
    return { intent: "UNKNOWN", confidence: 0 };
  }
};
var SystemExecutor = class {
  /**
   * Executa ação e retorna resposta do sistema
   * AGORA COM INTEGRAÇÃO REAL COM O BANCO DE DADOS! 🚀
   */
  async execute(flow, action, currentState, nextState, data, extractedData, userId, userMessage) {
    const mergedData = { ...data, ...extractedData };
    if (flow.type === "DELIVERY" && !mergedData.cart) {
      mergedData.cart = [];
      mergedData.total = 0;
    }
    if (action.type === "DATA" && userId) {
      await this.loadRealData(action.dataSource, mergedData, flow, userId);
    }
    const actionName = action.name || "";
    if (flow.type === "DELIVERY" && userId) {
      await this.processDeliveryAction(actionName, mergedData, extractedData, userId);
    }
    const template = action.template || "";
    if (template.includes("{response}") && !mergedData.response && userId) {
      console.log(`\u{1F4E6} [SystemExecutor] Template usa {response} - carregando dados do contexto...`);
      await this.loadContextualData(mergedData, flow, userId, userMessage);
    }
    let response = this.processTemplate(template, mergedData, flow);
    let mediaActions = [];
    if (action.mediaTag) {
      mediaActions = [{ tag: action.mediaTag, type: "send" }];
    }
    return {
      response,
      newData: mergedData,
      mediaActions
    };
  }
  /**
   * 🛒 Processa ações específicas de Delivery (ADD_TO_CART, REMOVE_FROM_CART, etc)
   */
  async processDeliveryAction(actionName, data, extractedData, userId) {
    console.log(`\u{1F6D2} [SystemExecutor] Processando a\xE7\xE3o delivery: ${actionName}`);
    console.log(`\u{1F6D2} [SystemExecutor] extractedData:`, JSON.stringify(extractedData || {}));
    if (!data.cart) data.cart = [];
    if (typeof data.total !== "number") data.total = 0;
    const productName = extractedData?.product || extractedData?.item;
    const quantity = extractedData?.quantity || 1;
    switch (actionName) {
      case "Adicionar ao Carrinho":
      case "ADD_TO_CART": {
        if (!productName || !userId) {
          console.log(`\u{1F6D2} [SystemExecutor] Sem produto ou userId para adicionar`);
          break;
        }
        const menuItem = await this.findMenuItemByName(productName, userId);
        if (!menuItem) {
          console.log(`\u{1F6D2} [SystemExecutor] Produto "${productName}" n\xE3o encontrado no menu`);
          data.error = `Produto "${productName}" n\xE3o encontrado no card\xE1pio`;
          break;
        }
        console.log(`\u{1F6D2} [SystemExecutor] Item encontrado: ${menuItem.name} - R$ ${menuItem.price}`);
        const existingIndex = data.cart.findIndex(
          (item) => item.name.toLowerCase() === menuItem.name.toLowerCase()
        );
        if (existingIndex >= 0) {
          data.cart[existingIndex].quantity += quantity;
        } else {
          data.cart.push({
            name: menuItem.name,
            quantity,
            unit_price: parseFloat(menuItem.price)
          });
        }
        this.recalculateTotal(data);
        data.product = menuItem.name;
        data.quantity = quantity;
        data.item_total = (quantity * parseFloat(menuItem.price)).toFixed(2);
        this.buildCartSummary(data);
        console.log(`\u{1F6D2} [SystemExecutor] \u2705 Carrinho atualizado:`, JSON.stringify(data.cart));
        console.log(`\u{1F6D2} [SystemExecutor] \u2705 Total: R$ ${data.total}`);
        break;
      }
      case "Remover do Carrinho":
      case "REMOVE_FROM_CART": {
        if (!productName) break;
        const removeIndex = data.cart.findIndex(
          (item) => item.name.toLowerCase().includes(productName.toLowerCase())
        );
        if (removeIndex >= 0) {
          const removed = data.cart.splice(removeIndex, 1)[0];
          data.product = removed.name;
          data.quantity = removed.quantity;
          this.recalculateTotal(data);
          this.buildCartSummary(data);
          console.log(`\u{1F6D2} [SystemExecutor] \u2705 Removido: ${removed.name}`);
        }
        break;
      }
      case "Mostrar Carrinho":
      case "SHOW_CART": {
        this.buildCartSummary(data);
        break;
      }
      case "Cancelar":
      case "CANCEL": {
        data.cart = [];
        data.total = 0;
        data.cart_summary = "Carrinho vazio";
        console.log(`\u{1F6D2} [SystemExecutor] \u2705 Pedido cancelado`);
        break;
      }
      default:
        if (data.cart.length > 0) {
          this.buildCartSummary(data);
        }
    }
  }
  /**
   * 🔍 Busca item do menu pelo nome (fuzzy match) com preço REAL
   */
  async findMenuItemByName(productName, userId) {
    try {
      const { data: items, error } = await supabase.from("menu_items").select("name, price, description").eq("user_id", userId).eq("is_available", true);
      if (error || !items || items.length === 0) {
        console.log(`\u{1F50D} [SystemExecutor] Nenhum item encontrado no menu de ${userId}`);
        return null;
      }
      const searchLower = productName.toLowerCase();
      let found = items.find(
        (item) => item.name.toLowerCase() === searchLower
      );
      if (!found) {
        found = items.find(
          (item) => item.name.toLowerCase().includes(searchLower) || searchLower.includes(item.name.toLowerCase())
        );
      }
      if (!found) {
        const words = searchLower.split(/\s+/);
        found = items.find((item) => {
          const itemLower = item.name.toLowerCase();
          return words.some((word) => word.length > 2 && itemLower.includes(word));
        });
      }
      return found || null;
    } catch (err) {
      console.error(`\u{1F50D} [SystemExecutor] Erro buscando menu:`, err);
      return null;
    }
  }
  /**
   * 💰 Recalcula total do carrinho
   */
  recalculateTotal(data) {
    data.total = data.cart.reduce((sum, item) => {
      return sum + item.quantity * item.unit_price;
    }, 0);
  }
  /**
   * 📝 Constrói resumo do carrinho para exibição
   */
  buildCartSummary(data) {
    if (!data.cart || data.cart.length === 0) {
      data.cart_summary = "Carrinho vazio";
      data.total = "0,00";
      return;
    }
    data.cart_summary = data.cart.map((item) => {
      const itemTotal = (item.quantity * item.unit_price).toFixed(2).replace(".", ",");
      return `\u2022 ${item.quantity}x ${item.name} - R$ ${itemTotal}`;
    }).join("\n");
    data.total = typeof data.total === "number" ? data.total.toFixed(2).replace(".", ",") : data.total;
  }
  /**
   * 🔧 Carrega dados contextuais quando o template usa {response}
   * Isso é necessário para fluxos GENERICO que usam PROVIDE_INFO com {response}
   */
  async loadContextualData(data, flow, userId, userMessage) {
    console.log(`\u{1F4E6} [SystemExecutor] Carregando dados contextuais para flow type: ${flow.type}`);
    const msgLower = (userMessage || "").toLowerCase();
    const isMenuQuery = /cardápio|menu|pizza|pizzas|lanche|hamburguer|comida|prato|vocês têm|o que tem|quais|opções/.test(msgLower);
    const isDeliveryQuery = /entrega|delivery|taxa|frete|tempo|demora/.test(msgLower);
    const isHoursQuery = /horário|abre|fecha|funciona|funcionamento/.test(msgLower);
    const { data: deliveryConfig } = await supabase.from("delivery_config").select("display_instructions, business_name").eq("user_id", userId).single();
    const displayInstructions = deliveryConfig?.display_instructions || "";
    const businessName = deliveryConfig?.business_name || flow.businessName || "nosso estabelecimento";
    const askFirstKeywords = ["pergunt", "primeiro", "antes", "categorias", "quer ver"];
    const shouldAskFirst = askFirstKeywords.some((kw) => displayInstructions.toLowerCase().includes(kw));
    console.log(`\u{1F4E6} [SystemExecutor] displayInstructions: "${displayInstructions.substring(0, 80)}..."`);
    console.log(`\u{1F4E6} [SystemExecutor] shouldAskFirst = ${shouldAskFirst}`);
    if (isMenuQuery) {
      console.log(`\u{1F4E6} [SystemExecutor] Detectada pergunta sobre menu - carregando card\xE1pio...`);
      await this.loadMenuData(data, userId, flow);
      if (shouldAskFirst && data.menu_categories && data.menu_categories.length > 0) {
        console.log(`\u{1F4E6} [SystemExecutor] \u26A0\uFE0F MODO PERGUNTAR PRIMEIRO ATIVO! Mostrando apenas categorias.`);
        const categoryNames = data.menu_categories.map((c) => c.name).join(", ");
        data.response = `Bem-vindo(a) ao ${businessName}! \u{1F60A}

Temos: ${categoryNames}.

Qual voc\xEA gostaria de ver?`;
        data.askingCategory = true;
        return;
      }
      if (data.menu_formatted && data.menu_formatted !== "Card\xE1pio n\xE3o dispon\xEDvel no momento.") {
        data.response = `Aqui est\xE1 nosso card\xE1pio:

${data.menu_formatted}`;
      } else {
        data.response = `Nosso card\xE1pio est\xE1 sendo atualizado. Por favor, entre em contato conosco para mais informa\xE7\xF5es!`;
      }
      return;
    }
    if (isDeliveryQuery) {
      console.log(`\u{1F4E6} [SystemExecutor] Detectada pergunta sobre delivery - carregando config...`);
      await this.loadDeliveryFee(data, userId);
      data.response = `\u{1F6F5} *Informa\xE7\xF5es de Entrega:*

\u{1F4CD} Taxa de entrega: R$ ${data.delivery_fee || "5,00"}
\u23F1\uFE0F Tempo estimado: ${data.delivery_time || "45 minutos"}
\u{1F4B0} Pedido m\xEDnimo: R$ ${data.min_order || "20,00"}`;
      return;
    }
    if (isHoursQuery) {
      console.log(`\u{1F4E6} [SystemExecutor] Detectada pergunta sobre hor\xE1rio - carregando config...`);
      await this.loadBusinessHours(data, userId);
      if (data.hours) {
        data.response = `\u{1F550} *Nosso hor\xE1rio de funcionamento:*

${data.hours}`;
      } else {
        data.response = `Nosso hor\xE1rio de funcionamento est\xE1 dispon\xEDvel em nosso site ou redes sociais.`;
      }
      return;
    }
    console.log(`\u{1F4E6} [SystemExecutor] Nenhum contexto espec\xEDfico detectado - usando resposta gen\xE9rica`);
    data.response = `Como posso ajudar voc\xEA? Posso fornecer informa\xE7\xF5es sobre nosso card\xE1pio, hor\xE1rios de funcionamento ou delivery.`;
  }
  /**
   * 🚀 Carrega dados REAIS do banco de dados
   */
  async loadRealData(dataSource, data, flow, userId) {
    console.log(`\u{1F4E6} [SystemExecutor] Carregando dados: ${dataSource} para user ${userId}`);
    switch (dataSource) {
      case "menu":
        await this.loadMenuData(data, userId, flow);
        break;
      case "business_hours":
        await this.loadBusinessHours(data, userId);
        break;
      case "delivery_fee":
        await this.loadDeliveryFee(data, userId);
        break;
      case "products":
        await this.loadProductsData(data, userId);
        break;
      default:
        console.log(`\u{1F4E6} [SystemExecutor] DataSource n\xE3o reconhecido: ${dataSource}`);
    }
  }
  /**
   * 🍕 Carrega menu de delivery do banco
   */
  async loadMenuData(data, userId, flow) {
    try {
      const { data: categories, error: catError } = await supabase.from("menu_categories").select("id, name, display_order").eq("user_id", userId).eq("is_active", true).order("display_order");
      if (catError) throw catError;
      const { data: items, error: itemError } = await supabase.from("menu_items").select("id, name, description, price, category_id, is_available").eq("user_id", userId).eq("is_available", true).order("display_order");
      if (itemError) throw itemError;
      console.log(`\u{1F4E6} [SystemExecutor] Categorias: ${categories?.length || 0}, Itens: ${items?.length || 0}`);
      let menuFormatted = "";
      const usedItemIds = /* @__PURE__ */ new Set();
      for (const category of categories || []) {
        const categoryItems = (items || []).filter((item) => item.category_id === category.id);
        if (categoryItems.length === 0) continue;
        const emoji = category.name.toLowerCase().includes("pizza") ? "\u{1F355}" : "\u{1F4CB}";
        menuFormatted += `
${emoji} *${category.name}*

`;
        for (const item of categoryItems) {
          const price = parseFloat(item.price).toFixed(2);
          menuFormatted += `${item.name} - R$ ${price}
`;
          if (item.description) {
            menuFormatted += `${item.description}

`;
          } else {
            menuFormatted += `
`;
          }
          usedItemIds.add(item.id);
        }
      }
      const uncategorizedItems = (items || []).filter((item) => !item.category_id || !usedItemIds.has(item.id));
      if (uncategorizedItems.length > 0) {
        if (menuFormatted) {
          menuFormatted += `
\u{1F4CB} *Outros*

`;
        }
        for (const item of uncategorizedItems) {
          const price = parseFloat(item.price).toFixed(2);
          menuFormatted += `${item.name} - R$ ${price}
`;
          if (item.description) {
            menuFormatted += `${item.description}

`;
          } else {
            menuFormatted += `
`;
          }
        }
      }
      data.menu_formatted = menuFormatted.trim() || "Card\xE1pio n\xE3o dispon\xEDvel no momento.";
      data.menu_items = items || [];
      data.menu_categories = categories || [];
      console.log(`\u{1F4E6} [SystemExecutor] \u2705 Menu carregado: ${items?.length || 0} itens, formatado: ${data.menu_formatted.substring(0, 100)}...`);
    } catch (err) {
      console.error(`\u{1F4E6} [SystemExecutor] \u274C Erro ao carregar menu:`, err);
      data.menu_formatted = "Card\xE1pio n\xE3o dispon\xEDvel no momento.";
    }
  }
  /**
   * 🕐 Carrega horário de funcionamento
   */
  async loadBusinessHours(data, userId) {
    try {
      const { data: config, error } = await supabase.from("delivery_config").select("opening_hours").eq("user_id", userId).single();
      if (error) throw error;
      const hours = config?.opening_hours;
      if (hours) {
        const dayNames = {
          monday: "Segunda",
          tuesday: "Ter\xE7a",
          wednesday: "Quarta",
          thursday: "Quinta",
          friday: "Sexta",
          saturday: "S\xE1bado",
          sunday: "Domingo"
        };
        let hoursFormatted = "";
        for (const [day, h] of Object.entries(hours)) {
          const hourData = h;
          if (hourData.is_open) {
            hoursFormatted += `${dayNames[day] || day}: ${hourData.open} \xE0s ${hourData.close}
`;
          }
        }
        data.hours = hoursFormatted.trim() || "Consulte nosso hor\xE1rio de funcionamento.";
      }
      console.log(`\u{1F4E6} [SystemExecutor] \u2705 Hor\xE1rio carregado`);
    } catch (err) {
      console.error(`\u{1F4E6} [SystemExecutor] \u274C Erro ao carregar hor\xE1rio:`, err);
      data.hours = "Consulte nosso hor\xE1rio de funcionamento.";
    }
  }
  /**
   * 🛵 Carrega taxa de entrega
   */
  async loadDeliveryFee(data, userId) {
    try {
      const { data: config, error } = await supabase.from("delivery_config").select("delivery_fee, min_order_value, estimated_delivery_time").eq("user_id", userId).single();
      if (error) throw error;
      data.delivery_fee = config?.delivery_fee?.toFixed(2).replace(".", ",") || "0,00";
      data.min_order = config?.min_order_value?.toFixed(2).replace(".", ",") || "0,00";
      data.delivery_time = `${config?.estimated_delivery_time || 45} minutos`;
      console.log(`\u{1F4E6} [SystemExecutor] \u2705 Taxa de entrega: R$ ${data.delivery_fee}`);
    } catch (err) {
      console.error(`\u{1F4E6} [SystemExecutor] \u274C Erro ao carregar taxa:`, err);
      data.delivery_fee = "0,00";
    }
  }
  /**
   * 📦 Carrega catálogo de produtos (VENDAS)
   */
  async loadProductsData(data, userId) {
    try {
      const { data: products, error } = await supabase.from("products").select("name, price, description, category, stock").eq("user_id", userId).eq("is_active", true).order("category").limit(50);
      if (error) throw error;
      let productsFormatted = "";
      let currentCategory = "";
      for (const product of products || []) {
        if (product.category && product.category !== currentCategory) {
          currentCategory = product.category;
          productsFormatted += `
*${currentCategory.toUpperCase()}*
`;
        }
        const price = parseFloat(product.price).toFixed(2).replace(".", ",");
        productsFormatted += `\u2022 ${product.name} - R$ ${price}
`;
        if (product.description) {
          productsFormatted += `  \u21B3 ${product.description}
`;
        }
      }
      data.products_formatted = productsFormatted.trim() || "Produtos n\xE3o dispon\xEDveis no momento.";
      data.products_list = products || [];
      console.log(`\u{1F4E6} [SystemExecutor] \u2705 Produtos carregados: ${products?.length || 0} itens`);
    } catch (err) {
      console.error(`\u{1F4E6} [SystemExecutor] \u274C Erro ao carregar produtos:`, err);
      data.products_formatted = "Produtos n\xE3o dispon\xEDveis no momento.";
    }
  }
  /**
   * Processa template substituindo variáveis
   */
  processTemplate(template, data, flow) {
    let result = template;
    if (flow.data) {
      if (flow.data.prices) {
        result = result.replace(/\{price_standard\}/g, flow.data.prices.standard?.toString() || "");
        result = result.replace(/\{price_promo\}/g, flow.data.prices.promo?.toString() || "");
        result = result.replace(/\{impl_price\}/g, flow.data.prices.implementation?.toString() || "");
      }
      if (flow.data.links) {
        result = result.replace(/\{signup_link\}/g, flow.data.links.signup || "");
        result = result.replace(/\{site_link\}/g, flow.data.links.site || "");
      }
      if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
        const firstCoupon = Object.values(flow.data.coupons)[0];
        result = result.replace(/\{coupon_code\}/g, firstCoupon?.code || "");
        result = result.replace(/\{coupon_discount\}/g, firstCoupon?.discount?.toString() || "");
      }
    }
    result = result.replace(/\{agent_name\}/g, flow.agentName);
    result = result.replace(/\{business_name\}/g, flow.businessName);
    for (const [key, value] of Object.entries(data)) {
      const regex = new RegExp(`\\{${key}\\}`, "g");
      result = result.replace(regex, String(value || ""));
    }
    return result;
  }
};
var AIHumanizer = class {
  // 🚀 Agora usa OpenRouter/Chutes automaticamente via chatComplete()
  constructor() {
    console.log(`[AIHumanizer] Inicializado com OpenRouter/Chutes`);
  }
  /**
   * Humaniza resposta do sistema (anti-bloqueio)
   */
  async humanize(systemResponse, flow, userMessage, options) {
    const personality = options?.personality || flow.agentPersonality || "amig\xE1vel e profissional";
    const systemPrompt = `Voc\xEA \xE9 ${flow.agentName} da ${flow.businessName}.
Personalidade: ${personality}

\u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F TAREFA CR\xCDTICA - LEIA COM ATEN\xC7\xC3O \u26A0\uFE0F\u26A0\uFE0F\u26A0\uFE0F

Voc\xEA vai receber uma resposta PRONTA do sistema. Sua \xDANICA fun\xE7\xE3o \xE9:
- Tornar o texto mais NATURAL e amig\xE1vel (como WhatsApp)
- COPIAR TODOS os dados EXATAMENTE como est\xE3o
- N\xC3O adicionar, remover ou modificar NENHUM item, pre\xE7o ou informa\xE7\xE3o

\u{1F6A8} PROIBIDO (voc\xEA ser\xE1 REJEITADO se fizer isso):
\u274C Adicionar itens que N\xC3O est\xE3o na resposta original
\u274C Inventar pre\xE7os, produtos, sabores, categorias
\u274C Adicionar exemplos ou sugest\xF5es extras
\u274C Expandir listas com itens novos
\u274C Usar separadores "\u2501\u2501\u2501\u2501\u2501" ou formata\xE7\xE3o t\xE9cnica
\u274C Adicionar t\xEDtulos como "NOSSO DELIVERY", "INFORMA\xC7\xD5ES"

\u2705 PERMITIDO (fa\xE7a APENAS isso):
\u2713 Ajustar pontua\xE7\xE3o e gram\xE1tica
\u2713 Adicionar 1-2 emojis simples (se ainda n\xE3o tiver muitos)
\u2713 Tornar o tom mais amig\xE1vel e natural
\u2713 Reformular frases mantendo OS MESMOS dados

EXEMPLO CORRETO:
Original: "Ol\xE1!

\u{1F355} Pizzas

Mussarela - R$ 45.00
Queijo de primeira

Qual gostaria?"
Humanizado: "Ol\xE1! Essas s\xE3o nossas pizzas:

\u{1F355} Mussarela - R$ 45,00
Queijo de primeira qualidade

Qual voc\xEA gostaria de pedir? \u{1F60A}"
(Note: MESMO item, MESMO pre\xE7o, MESMA descri\xE7\xE3o - s\xF3 mudou a forma de escrever)

EXEMPLO ERRADO (N\xC3O FA\xC7A ISSO):
Original: "Ol\xE1!

\u{1F355} Pizzas

Mussarela - R$ 45.00
Queijo de primeira

Qual gostaria?"
ERRADO: "Ol\xE1! Temos v\xE1rias pizzas:

\u{1F355} Mussarela - R$ 45,00
\u{1F355} Calabresa - R$ 50,00
\u{1F355} Portuguesa - R$ 55,00

Qual prefere?"
\u274C\u274C\u274C REJEITADO! Adicionou Calabresa e Portuguesa que N\xC3O existiam!

\u26A1 REGRA DE OURO: Se a resposta tem 1 pizza, retorne 1 pizza. Se tem 5, retorne 5. NUNCA invente!

Responda APENAS com o texto humanizado.`;
    try {
      const messages = [
        { role: "system", content: systemPrompt },
        { role: "user", content: `Mensagem original do cliente: "${userMessage}"

Resposta do sistema para humanizar:
${systemResponse}` }
      ];
      const response = await chatComplete({
        messages,
        temperature: 0,
        // ZERO criatividade - apenas reformulação
        maxTokens: 500
      });
      let humanized = response.choices?.[0]?.message?.content?.trim() || systemResponse;
      if (systemResponse.length > 0 && humanized.length > systemResponse.length * 1.3) {
        console.error(`\u{1F6A8} [AIHumanizer] REJEITADO! Resposta cresceu 30%+ - poss\xEDvel inven\xE7\xE3o de dados`);
        console.error(`\u{1F4CA} Original: ${systemResponse.length} chars`);
        console.error(`\u{1F4CA} Humanized: ${humanized.length} chars`);
        console.error(`\u{1F4DD} Original:
${systemResponse}`);
        console.error(`\u{1F4DD} Humanized:
${humanized}`);
        console.error(`\u26A0\uFE0F Usando resposta original para evitar alucina\xE7\xE3o`);
        humanized = systemResponse;
      }
      console.log(`\u{1F3A8} [AIHumanizer] \u2705 Humanizado (${systemResponse.length} \u2192 ${humanized.length} chars): "${humanized.substring(0, 80)}..."`);
      return humanized;
    } catch (err) {
      console.error(`[AIHumanizer] Erro:`, err);
      return systemResponse;
    }
  }
};
var UnifiedFlowEngine = class {
  interpreter;
  executor;
  humanizer;
  config;
  constructor(config) {
    this.config = config;
    this.interpreter = new AIInterpreter();
    this.executor = new SystemExecutor();
    this.humanizer = new AIHumanizer();
  }
  /**
   * Processa mensagem do cliente usando o fluxo
   */
  async processMessage(userId, conversationId, message, options) {
    console.log(`
\u{1F680} [UnifiedFlowEngine] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550`);
    console.log(`   User: ${userId}`);
    console.log(`   Conversation: ${conversationId}`);
    console.log(`   Message: "${message.substring(0, 50)}..."`);
    const flow = await FlowStorage.loadFlow(userId);
    if (!flow) {
      console.log(`   \u26A0\uFE0F Nenhum flow encontrado para user ${userId}`);
      return null;
    }
    console.log(`   \u{1F4CB} Flow: ${flow.id} (${flow.type})`);
    let state = await FlowStorage.loadConversationState(conversationId);
    if (!state) {
      state = {
        userId,
        conversationId,
        flowId: flow.id,
        currentState: flow.initialState,
        data: {},
        history: [],
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      };
      console.log(`   \u{1F195} Nova conversa, estado inicial: ${flow.initialState}`);
    } else {
      console.log(`   \u{1F4CD} Estado atual: ${state.currentState}`);
    }
    let intentResult;
    if (options?.useAI !== false) {
      intentResult = await this.interpreter.detectIntent(message, flow, state.currentState, state.data);
      console.log(`   \u{1F3AF} Intent (IA): ${intentResult.intent} (${intentResult.confidence}%)`);
    } else {
      intentResult = this.interpreter.detectIntentFast(message, flow, state.currentState);
      console.log(`   \u{1F3AF} Intent (Regex): ${intentResult.intent} (${intentResult.confidence}%)`);
    }
    const currentFlowState = flow.states[state.currentState];
    if (!currentFlowState) {
      console.log(`   \u274C Estado inv\xE1lido: ${state.currentState}`);
      return null;
    }
    if (!currentFlowState.transitions || !Array.isArray(currentFlowState.transitions)) {
      console.log(`   \u26A0\uFE0F Estado ${state.currentState} n\xE3o tem transitions definidas`);
      return null;
    }
    const transition = currentFlowState.transitions.find((t) => t.intent === intentResult.intent);
    if (!transition) {
      console.log(`   \u26A0\uFE0F Sem transi\xE7\xE3o para intent ${intentResult.intent} no estado ${state.currentState}`);
      if (intentResult.intent === "UNKNOWN") {
        const greetingTransition = currentFlowState.transitions.find((t) => t.intent === "GREETING");
        if (greetingTransition) {
          console.log(`   \u{1F504} Fallback para GREETING`);
          return this.executeTransition(flow, greetingTransition, state, message, options);
        }
      }
      return null;
    }
    return this.executeTransition(flow, transition, state, message, options, intentResult.extractedData);
  }
  /**
   * Executa uma transição específica
   */
  async executeTransition(flow, transition, state, message, options, extractedData) {
    const action = flow.actions[transition.action];
    if (!action) {
      console.log(`   \u274C A\xE7\xE3o n\xE3o encontrada: ${transition.action}`);
      return {
        text: "Desculpe, ocorreu um erro. Tente novamente.",
        newState: state.currentState,
        intent: transition.intent,
        action: transition.action
      };
    }
    const { response, newData, mediaActions } = await this.executor.execute(
      flow,
      action,
      state.currentState,
      transition.nextState,
      state.data,
      extractedData,
      state.userId,
      message
      // 🔧 Passa mensagem do usuário para detectar contexto
    );
    let finalResponse = response;
    if (options?.humanize !== false && this.config.humanize !== false) {
      finalResponse = await this.humanizer.humanize(response, flow, message);
    }
    state.currentState = transition.nextState;
    state.data = newData;
    state.history.push({
      role: "user",
      message,
      intent: transition.intent,
      timestamp: /* @__PURE__ */ new Date()
    });
    state.history.push({
      role: "assistant",
      message: finalResponse,
      action: transition.action,
      state: transition.nextState,
      timestamp: /* @__PURE__ */ new Date()
    });
    state.updatedAt = /* @__PURE__ */ new Date();
    await FlowStorage.saveConversationState(state);
    console.log(`   \u2705 A\xE7\xE3o: ${transition.action} \u2192 Estado: ${transition.nextState}`);
    console.log(`   \u{1F4DD} Resposta: "${finalResponse.substring(0, 80)}..."`);
    console.log(`\u{1F680} [UnifiedFlowEngine] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
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
  static async createFlowFromPrompt(userId, prompt, options) {
    console.log(`
\u{1F3D7}\uFE0F [UnifiedFlowEngine] Criando flow a partir de prompt...`);
    const builder = new FlowBuilder();
    const flow = await builder.buildFromPrompt(prompt);
    if (options?.businessName) {
      flow.businessName = options.businessName;
    }
    const saved = await FlowStorage.saveFlow(userId, flow);
    if (!saved) {
      console.log(`   \u274C Erro ao salvar flow`);
      return null;
    }
    console.log(`   \u2705 Flow criado: ${flow.id} (${flow.type})`);
    console.log(`   \u{1F4CA} Estados: ${Object.keys(flow.states).length}`);
    console.log(`   \u{1F3AF} Inten\xE7\xF5es: ${Object.keys(flow.intents).length}`);
    console.log(`   \u26A1 A\xE7\xF5es: ${Object.keys(flow.actions).length}`);
    return flow;
  }
  /**
   * Atualiza FlowDefinition existente com nova instrução
   */
  static async updateFlowFromInstruction(userId, instruction, apiKey) {
    console.log(`
\u{1F504} [UnifiedFlowEngine] Atualizando flow com instru\xE7\xE3o...`);
    console.log(`   Instru\xE7\xE3o: "${instruction.substring(0, 80)}..."`);
    const existingFlow = await FlowStorage.loadFlow(userId);
    if (!existingFlow) {
      return {
        success: false,
        message: "Nenhum flow encontrado para atualizar. Crie um agente primeiro."
      };
    }
    const analyzer = new PromptAnalyzer();
    const instructionLower = instruction.toLowerCase();
    const priceMatch = instructionLower.match(/pre[çc]o.*?(r?\$?\s*\d+)/i);
    if (priceMatch) {
      const newPrice = parseFloat(priceMatch[1].replace(/[^\d,]/g, "").replace(",", "."));
      if (!isNaN(newPrice) && existingFlow.data?.prices) {
        existingFlow.data.prices.standard = newPrice;
        console.log(`   \u{1F4B0} Pre\xE7o atualizado para R$${newPrice}`);
      }
    }
    const couponMatch = instructionLower.match(/cupom.*?([A-Z0-9]+)/i);
    if (couponMatch) {
      const newCoupon = couponMatch[1].toUpperCase();
      if (existingFlow.data?.coupons) {
        existingFlow.data.coupons[0] = { code: newCoupon, discount: existingFlow.data.coupons[0]?.discount || 50 };
        console.log(`   \u{1F39F}\uFE0F Cupom atualizado para ${newCoupon}`);
      }
    }
    const nameMatch = instructionLower.match(/(?:nome|chama[r]?).*?(?:de\s+)?([a-záéíóúâêîôûãõç]+)/i);
    if (nameMatch && nameMatch[1].length > 2) {
      existingFlow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1);
      console.log(`   \u{1F464} Nome atualizado para ${existingFlow.agentName}`);
    }
    if (instructionLower.includes("mais formal")) {
      existingFlow.agentPersonality = "formal, profissional, educado";
      console.log(`   \u{1F3AD} Personalidade: formal`);
    } else if (instructionLower.includes("mais informal") || instructionLower.includes("descontra\xEDdo")) {
      existingFlow.agentPersonality = "informal, descontra\xEDdo, amig\xE1vel";
      console.log(`   \u{1F3AD} Personalidade: informal`);
    }
    existingFlow.version = incrementVersion(existingFlow.version);
    const saved = await FlowStorage.saveFlow(userId, existingFlow);
    if (!saved) {
      return {
        success: false,
        message: "Erro ao salvar altera\xE7\xF5es no flow."
      };
    }
    return {
      success: true,
      flow: existingFlow,
      message: `Flow atualizado com sucesso! Vers\xE3o: ${existingFlow.version}`
    };
  }
};
function incrementVersion(version) {
  const parts = version.split(".");
  const patch = parseInt(parts[2] || "0") + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}

// server/flowIntegration.ts
async function handleGeneratePrompt(userId, businessType, businessName, description, additionalInfo, mistralApiKey) {
  console.log(`
\u{1F517} [FlowIntegration] Gerando prompt + flow para ${businessName}`);
  const analyzer = new PromptAnalyzer();
  const builder = new FlowBuilder(void 0, mistralApiKey);
  const basePrompt = `
Voc\xEA \xE9 um atendente virtual da ${businessName}.
Tipo de neg\xF3cio: ${businessType}
${description ? `Descri\xE7\xE3o: ${description}` : ""}
${additionalInfo ? `Informa\xE7\xF5es adicionais: ${additionalInfo}` : ""}
  `.trim();
  let flow;
  try {
    const desiredType = await resolveDesiredFlowType(userId);
    flow = await buildFlowFromPromptWithType(basePrompt, desiredType);
    flow.businessName = businessName;
    flow.agentName = extractAgentName(description) || "Assistente";
    console.log(`   \u{1F4CB} Flow criado: ${flow.type} com ${Object.keys(flow.states).length} estados`);
  } catch (err) {
    console.error(`   \u274C Erro ao criar flow:`, err);
    flow = builder.buildGenericoFlow("Assistente", businessName, "profissional e amig\xE1vel");
    flow.businessName = businessName;
  }
  let flowCreated = false;
  try {
    flowCreated = await FlowStorage.saveFlow(userId, flow);
    console.log(`   ${flowCreated ? "\u2705" : "\u274C"} Flow ${flowCreated ? "salvo" : "n\xE3o salvo"} no banco`);
  } catch (err) {
    console.error(`   \u274C Erro ao salvar flow:`, err);
  }
  const prompt = generatePromptFromFlow(flow, description, additionalInfo);
  console.log(`   \u{1F4DD} Prompt gerado: ${prompt.length} chars`);
  console.log(`\u{1F517} [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
  return { prompt, flow, flowCreated };
}
async function handleEditPrompt(userId, currentPrompt, instruction, newPrompt, apiKey) {
  console.log(`
\u{1F517} [FlowIntegration] Editando flow com instru\xE7\xE3o...`);
  console.log(`   Instru\xE7\xE3o: "${instruction.substring(0, 60)}..."`);
  const promptChangedCompletely = newPrompt !== currentPrompt && (newPrompt.length > currentPrompt.length * 1.5 || newPrompt.length < currentPrompt.length * 0.7);
  const hasCustomGreeting = /responder\s+\*\*exatamente\*\*|primeira mensagem|sempre enviar|enviar sempre|mensagem inicial/i.test(newPrompt);
  if (promptChangedCompletely || hasCustomGreeting) {
    console.log(`   \u{1F504} REGENERANDO FLOW DO ZERO (prompt mudou ${promptChangedCompletely ? "completamente" : "tem mensagem customizada"})`);
    const builder = new FlowBuilder(void 0, apiKey);
    const flow2 = await builder.buildFromPrompt(newPrompt);
    const saved2 = await FlowStorage.saveFlow(userId, flow2);
    console.log(`   ${saved2 ? "\u2705" : "\u274C"} Flow ${saved2 ? "regenerado" : "n\xE3o regenerado"} do zero`);
    console.log(`\u{1F517} [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
    return {
      flowUpdated: saved2,
      changes: saved2 ? ["Flow regenerado completamente do novo prompt"] : []
    };
  }
  console.log(`   \u270F\uFE0F Edi\xE7\xE3o pontual - modificando valores espec\xEDficos`);
  let flow = await FlowStorage.loadFlow(userId);
  const changes = [];
  if (!flow) {
    console.log(`   \u26A0\uFE0F Flow n\xE3o encontrado, criando do prompt atual...`);
    const builder = new FlowBuilder(void 0, apiKey);
    flow = await builder.buildFromPrompt(currentPrompt);
    changes.push("Flow criado a partir do prompt existente");
  }
  const instructionLower = instruction.toLowerCase();
  const priceMatches = instruction.match(/(?:pre[çc]o|valor|custa?).*?r?\$?\s*(\d+(?:[,.]\d{2})?)/gi);
  if (priceMatches) {
    for (const match of priceMatches) {
      const priceMatch = match.match(/(\d+(?:[,.]\d{2})?)/);
      if (priceMatch) {
        const newPrice = parseFloat(priceMatch[1].replace(",", "."));
        if (!isNaN(newPrice) && flow) {
          if (!flow.data) flow.data = {};
          if (!flow.data.prices) flow.data.prices = {};
          if (instructionLower.includes("promo") || instructionLower.includes("desconto")) {
            flow.data.prices.promo = newPrice;
            changes.push(`Pre\xE7o promocional: R$${newPrice}`);
          } else if (instructionLower.includes("impl") || instructionLower.includes("setup")) {
            flow.data.prices.implementation = newPrice;
            changes.push(`Pre\xE7o implementa\xE7\xE3o: R$${newPrice}`);
          } else {
            flow.data.prices.standard = newPrice;
            changes.push(`Pre\xE7o padr\xE3o: R$${newPrice}`);
          }
        }
      }
    }
  }
  const couponMatch = instruction.match(/cupom\s*(?:é|:)?\s*([A-Z0-9_-]+)/i);
  if (couponMatch && flow) {
    const newCoupon = couponMatch[1].toUpperCase();
    if (!flow.data) flow.data = {};
    if (!flow.data.coupons) flow.data.coupons = {};
    const discountMatch = instruction.match(/(\d+)\s*%/);
    const discount = discountMatch ? parseInt(discountMatch[1]) : 50;
    flow.data.coupons[newCoupon] = { code: newCoupon, discount };
    changes.push(`Cupom: ${newCoupon} (${discount}% off)`);
  }
  const linkMatch = instruction.match(/(https?:\/\/[^\s]+)/i);
  if (linkMatch && flow) {
    if (!flow.data) flow.data = {};
    if (!flow.data.links) flow.data.links = {};
    if (instructionLower.includes("cadastro") || instructionLower.includes("signup")) {
      flow.data.links.signup = linkMatch[1];
      changes.push(`Link cadastro: ${linkMatch[1]}`);
    } else {
      flow.data.links.site = linkMatch[1];
      changes.push(`Link site: ${linkMatch[1]}`);
    }
  }
  if (instructionLower.includes("nome") && instructionLower.includes("agente") && flow) {
    const nameMatch = instruction.match(/(?:chamar?|nome).*?(?:de\s+)?([A-Za-záéíóúâêîôûãõçÁÉÍÓÚÂÊÎÔÛÃÕÇ]+)(?:\s|$)/i);
    if (nameMatch && nameMatch[1].length > 2 && !["de", "do", "da", "para", "por"].includes(nameMatch[1].toLowerCase())) {
      flow.agentName = nameMatch[1].charAt(0).toUpperCase() + nameMatch[1].slice(1).toLowerCase();
      changes.push(`Nome do agente: ${flow.agentName}`);
    }
  }
  if (!flow) {
    console.log(`   \u274C Flow n\xE3o encontrado ap\xF3s cria\xE7\xE3o`);
    return { flowUpdated: false, changes: [] };
  }
  if (instructionLower.includes("formal") && !instructionLower.includes("informal")) {
    flow.agentPersonality = "formal, profissional, cort\xEAs";
    changes.push("Personalidade: formal");
  } else if (instructionLower.includes("informal") || instructionLower.includes("descontra\xEDdo")) {
    flow.agentPersonality = "informal, descontra\xEDdo, divertido";
    changes.push("Personalidade: informal");
  } else if (instructionLower.includes("direto") || instructionLower.includes("objetivo")) {
    flow.agentPersonality = "direto, objetivo, pr\xE1tico";
    changes.push("Personalidade: direto");
  }
  if (instructionLower.includes("sempre") || instructionLower.includes("nunca")) {
    if (!flow.globalRules) flow.globalRules = [];
    flow.globalRules.push(instruction);
    changes.push(`Nova regra adicionada`);
  }
  flow.version = incrementVersion2(flow.version);
  const saved = await FlowStorage.saveFlow(userId, flow);
  console.log(`   ${saved ? "\u2705" : "\u274C"} Flow ${saved ? "atualizado" : "n\xE3o atualizado"}`);
  console.log(`   \u{1F4CA} ${changes.length} mudan\xE7as aplicadas: ${changes.join(", ")}`);
  console.log(`\u{1F517} [FlowIntegration] \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`);
  return {
    flowUpdated: saved,
    changes
  };
}
async function shouldUseFlowEngine(userId) {
  console.log(`
\u{1F50D} [shouldUseFlowEngine] Verificando para user ${userId}`);
  try {
    const { data: chatbotConfig, error: chatbotError } = await supabase.from("chatbot_configs").select("is_active, name").eq("user_id", userId).single();
    if (chatbotError && chatbotError.code !== "PGRST116") {
      console.error(`   \u274C Erro ao verificar chatbot_configs:`, chatbotError);
    }
    const flowAtivo = chatbotConfig?.is_active === true;
    console.log(`   \u2192 chatbot_configs.is_active: ${chatbotConfig?.is_active ?? "n\xE3o existe"}`);
    if (!flowAtivo) {
      console.log(`   \u26A0\uFE0F FlowEngine DESATIVADO - Usando Agente IA (prompt)`);
      return false;
    }
    const flow = await FlowStorage.loadFlow(userId);
    if (flow) {
      console.log(`   \u2705 FlowEngine ATIVO - FlowDefinition encontrado: ${flow.type}`);
      return true;
    }
    console.log(`   \u26A0\uFE0F FlowEngine ativo mas sem FlowDefinition, usando Agente IA`);
    return false;
  } catch (error) {
    console.error(`   \u274C Erro ao verificar FlowEngine:`, error);
    return false;
  }
}
async function processWithFlowEngine(userId, conversationId, messageText, apiKey, options) {
  const config = {
    apiKey,
    model: void 0,
    // Sem hardcode - usa modelo do banco de dados
    humanize: true,
    temperature: 0.2
  };
  const engine = new UnifiedFlowEngine(config);
  const result = await engine.processMessage(
    userId,
    conversationId,
    messageText,
    {
      useAI: true,
      humanize: true,
      contactName: options?.contactName
    }
  );
  if (!result) {
    return null;
  }
  return {
    text: result.text,
    mediaActions: result.mediaActions,
    usedFlow: true
  };
}
function extractAgentName(text) {
  if (!text) return null;
  const patterns = [
    /(?:sou|me chamo|meu nome [ée])\s+([A-Za-záéíóúâêîôûãõç]+)/i,
    /(?:agente|atendente)\s+([A-Za-záéíóúâêîôûãõç]+)/i
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1].length > 2) {
      return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
    }
  }
  return null;
}
function incrementVersion2(version) {
  const parts = version.split(".");
  const patch = parseInt(parts[2] || "0") + 1;
  return `${parts[0]}.${parts[1]}.${patch}`;
}
function generatePromptFromFlow(flow, description, additionalInfo) {
  const lines = [];
  lines.push(`Voc\xEA \xE9 ${flow.agentName}, atendente virtual da ${flow.businessName}.`);
  if (flow.agentPersonality) {
    lines.push(`Personalidade: ${flow.agentPersonality}.`);
  }
  lines.push("");
  if (flow.type === "DELIVERY") {
    lines.push("TIPO: Delivery/Restaurante");
    lines.push("Voc\xEA ajuda clientes a ver o card\xE1pio, montar pedidos e finalizar compras.");
  } else if (flow.type === "VENDAS") {
    lines.push("TIPO: Vendas/Comercial");
    lines.push("Voc\xEA apresenta produtos/servi\xE7os, responde d\xFAvidas e guia para fechamento.");
  } else if (flow.type === "AGENDAMENTO") {
    lines.push("TIPO: Agendamento");
    lines.push("Voc\xEA agenda hor\xE1rios, confirma disponibilidade e gerencia reservas.");
  } else if (flow.type === "SUPORTE") {
    lines.push("TIPO: Suporte");
    lines.push("Voc\xEA responde d\xFAvidas frequentes e encaminha casos complexos.");
  }
  lines.push("");
  if (flow.data) {
    lines.push("DADOS DO NEG\xD3CIO:");
    if (flow.data.prices) {
      if (flow.data.prices.standard) lines.push(`\u2022 Pre\xE7o padr\xE3o: R$${flow.data.prices.standard}`);
      if (flow.data.prices.promo) lines.push(`\u2022 Pre\xE7o promocional: R$${flow.data.prices.promo}`);
      if (flow.data.prices.implementation) lines.push(`\u2022 Implementa\xE7\xE3o: R$${flow.data.prices.implementation}`);
    }
    if (flow.data.coupons && Object.keys(flow.data.coupons).length > 0) {
      for (const [key, coupon] of Object.entries(flow.data.coupons)) {
        lines.push(`\u2022 Cupom ${coupon.code}: ${coupon.discount}% de desconto`);
      }
    }
    if (flow.data.links) {
      if (flow.data.links.site) lines.push(`\u2022 Site: ${flow.data.links.site}`);
      if (flow.data.links.signup) lines.push(`\u2022 Cadastro: ${flow.data.links.signup}`);
    }
    lines.push("");
  }
  if (flow.globalRules && flow.globalRules.length > 0) {
    lines.push("REGRAS:");
    for (const rule of flow.globalRules.slice(0, 10)) {
      lines.push(`\u2022 ${rule}`);
    }
    lines.push("");
  }
  if (description) {
    lines.push("DESCRI\xC7\xC3O:");
    lines.push(description);
    lines.push("");
  }
  if (additionalInfo) {
    lines.push("INFORMA\xC7\xD5ES ADICIONAIS:");
    lines.push(additionalInfo);
    lines.push("");
  }
  lines.push("INSTRU\xC7\xD5ES:");
  lines.push("\u2022 Seja amig\xE1vel e profissional");
  lines.push("\u2022 Respostas curtas e objetivas para WhatsApp");
  lines.push("\u2022 Use no m\xE1ximo 2 emojis por mensagem");
  lines.push("\u2022 Nunca invente informa\xE7\xF5es");
  return lines.join("\n");
}
async function resolveDesiredFlowType(userId) {
  try {
    const { data: deliveryConfigs, error: deliveryError } = await supabase.from("delivery_config").select("is_active, send_to_ai").eq("user_id", userId);
    const deliveryConfig = deliveryConfigs?.[0];
    console.log(`\u{1F50D} [resolveDesiredFlowType] DELIVERY check - is_active: ${deliveryConfig?.is_active}, send_to_ai: ${deliveryConfig?.send_to_ai}, error: ${deliveryError?.message || "none"}, count: ${deliveryConfigs?.length || 0}`);
    if (!deliveryError && deliveryConfig?.is_active === true) {
      console.log(`\u{1F4E6} [resolveDesiredFlowType] \u2192 DELIVERY (ativo)`);
      return "DELIVERY";
    }
  } catch (err) {
    console.log(`\u274C [resolveDesiredFlowType] DELIVERY erro: ${err?.message || err}`);
  }
  try {
    const { data: productsConfig } = await supabase.from("products_config").select("is_active, send_to_ai").eq("user_id", userId).single();
    if (productsConfig?.is_active && productsConfig?.send_to_ai !== false) {
      console.log(`\u{1F6CD}\uFE0F [resolveDesiredFlowType] \u2192 VENDAS (ativo)`);
      return "VENDAS";
    }
  } catch {
  }
  try {
    const { data: schedulingConfig } = await supabase.from("scheduling_config").select("is_enabled").eq("user_id", userId).single();
    if (schedulingConfig?.is_enabled) {
      console.log(`\u{1F4C5} [resolveDesiredFlowType] \u2192 AGENDAMENTO (ativo)`);
      return "AGENDAMENTO";
    }
  } catch {
  }
  try {
    const { data: courseConfig } = await supabase.from("course_config").select("is_active, send_to_ai").eq("user_id", userId).single();
    if (courseConfig?.is_active && courseConfig?.send_to_ai !== false) {
      console.log(`\u{1F393} [resolveDesiredFlowType] \u2192 CURSO (ativo)`);
      return "CURSO";
    }
  } catch {
  }
  console.log(`\u{1F916} [resolveDesiredFlowType] \u2192 GENERICO (fallback com fluxo invis\xEDvel)`);
  return "GENERICO";
}
function buildFlowFromPromptWithType(prompt, flowType, mistralApiKey) {
  const analyzer = new PromptAnalyzer();
  const builder = new FlowBuilder(void 0, mistralApiKey);
  const agentName = analyzer.extractAgentName(prompt) || "Assistente";
  const businessName = analyzer.extractBusinessName(prompt) || "Empresa";
  const personality = analyzer.extractPersonality(prompt) || "amigavel e profissional";
  let flow;
  switch (flowType) {
    case "DELIVERY":
      flow = builder.buildDeliveryFlow(agentName, businessName, personality);
      break;
    case "VENDAS":
      flow = builder.buildVendasFlow(agentName, businessName, personality);
      break;
    case "AGENDAMENTO":
      flow = builder.buildAgendamentoFlow(agentName, businessName, personality);
      break;
    case "SUPORTE":
      flow = builder.buildSuporteFlow(agentName, businessName, personality);
      break;
    case "CURSO":
      flow = builder.buildCursoFlow(agentName, businessName, personality);
      break;
    default:
      flow = builder.buildGenericoFlow(agentName, businessName, personality);
  }
  flow.data = flow.data || {};
  flow.data.prices = analyzer.extractPrices(prompt);
  flow.data.links = analyzer.extractLinks(prompt);
  flow.data.coupons = analyzer.extractCoupons(prompt);
  flow.globalRules = analyzer.extractGlobalRules(prompt);
  flow.sourcePrompt = prompt;
  return flow;
}
async function buildFlowForUserPrompt(userId, prompt) {
  const desiredType = await resolveDesiredFlowType(userId);
  return buildFlowFromPromptWithType(prompt, desiredType);
}

export {
  FlowBuilder,
  FlowStorage,
  UnifiedFlowEngine,
  handleGeneratePrompt,
  handleEditPrompt,
  shouldUseFlowEngine,
  processWithFlowEngine,
  buildFlowForUserPrompt
};
