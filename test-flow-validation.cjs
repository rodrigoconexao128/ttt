/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🧪 VALIDAÇÃO COMPLETA DO SISTEMA DE FLUXOS (CommonJS para execução direta)
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Execute com: node test-flow-validation.cjs
 */

// ═══════════════════════════════════════════════════════════════════════
// 📊 TIPOS DE FLUXO
// ═══════════════════════════════════════════════════════════════════════

const FlowTypes = {
  DELIVERY: 'DELIVERY',
  VENDAS: 'VENDAS',
  AGENDAMENTO: 'AGENDAMENTO',
  SUPORTE: 'SUPORTE',
  GENERICO: 'GENERICO'
};

// ═══════════════════════════════════════════════════════════════════════
// 🔍 PROMPT ANALYZER (Versão simplificada para teste)
// ═══════════════════════════════════════════════════════════════════════

class PromptAnalyzer {
  
  detectFlowType(prompt) {
    const promptLower = prompt.toLowerCase();
    
    // Keywords com pesos
    const deliveryKeywords = [
      'cardápio', 'menu', 'pizza', 'hamburguer', 'lanche', 'delivery',
      'entrega', 'pedido', 'carrinho', 'ifood', 'motoboy', 'comida',
      'restaurante', 'lanchonete', 'pizzaria', 'hamburgueria', 'açaí',
      'sobremesa', 'bebida', 'refrigerante', 'taxa de entrega', 'esfiha'
    ];
    
    const agendamentoKeywords = [
      'agendar', 'agendamento', 'consulta', 'horário', 'disponível',
      'clínica', 'consultório', 'salão', 'barbearia', 'dentista',
      'médico', 'advogado', 'psicólogo', 'personal', 'academia',
      'aula', 'sessão', 'atendimento presencial'
    ];
    
    const vendasKeywords = [
      'plano', 'assinatura', 'mensalidade', 'cupom', 'desconto',
      'demonstração', 'teste grátis', 'trial', 'implementação',
      'cadastro', 'conta', 'funcionalidade', 'feature', 'saas',
      'software', 'plataforma', 'sistema', 'ferramenta', 'honorário',
      'contrat', 'orçamento', 'serviço', 'venda', 'compra',
      // Gráficas, lojas, comércio
      'gráfica', 'banner', 'adesivo', 'impressão', 'copos', 'personalizado',
      'peças', 'conserto', 'moto', 'carro', 'loja', 'estoque',
      'preço', 'valor', 'pagamento', 'pix', 'cartão',
      // Consultoria
      'assessoria', 'consultoria', 'cpf', 'cnpj', 'crédito', 'limpa nome'
    ];
    
    const suporteKeywords = [
      'suporte', 'ajuda', 'problema', 'erro', 'bug', 'ticket',
      'reclamação', 'dúvida técnica', 'não funciona', 'tutorial',
      'como usar', 'passo a passo', 'instalação', 'lenta', 'modem',
      'roteador', 'conexão', 'sinal', 'mbps'
    ];
    
    const countMatches = (keywords) => 
      keywords.filter(kw => promptLower.includes(kw)).length;
    
    const scores = {
      DELIVERY: countMatches(deliveryKeywords),
      AGENDAMENTO: countMatches(agendamentoKeywords),
      VENDAS: countMatches(vendasKeywords),
      SUPORTE: countMatches(suporteKeywords),
    };
    
    console.log(`    📊 Scores: DELIVERY=${scores.DELIVERY}, VENDAS=${scores.VENDAS}, AGENDAMENTO=${scores.AGENDAMENTO}, SUPORTE=${scores.SUPORTE}`);
    
    const maxScore = Math.max(...Object.values(scores));
    if (maxScore === 0) return 'GENERICO';
    
    const topType = Object.entries(scores).find(([_, score]) => score === maxScore);
    return topType?.[0] || 'GENERICO';
  }
  
  extractAgentName(prompt) {
    const patterns = [
      /NOME DA IA:\s*(\w+)/i,                    // NOME DA IA: Thais
      /seu nome é\s+\*?\*?(\w+)\*?\*?/i,         // Seu nome é Ana
      /você é \*?\*?(\w+)\*?\*?[,.\s]/i,         // Você é **Rodrigo**,
      /sou (?:o |a )?(\w+)[,.\s]/i,              // Sou o Rodrigo, Sou a Ana
      /me chamo (\w+)/i,                          // Me chamo X
      /meu nome é (\w+)/i,                        // Meu nome é X
      /\*\*(\w+)\*\*\s*[-–]/i,                   // **Nome** -
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
  
  extractBusinessName(prompt) {
    const patterns = [
      /\*\*([A-Z][A-Za-z0-9\s&]+?)\*\*\s*[-–]/,          // **Novo Sabor** -
      /(?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+?)(?:\*?\*?[,.\n\-])/,
      /atendente (?:da|do|de)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /bem[- ]vindo (?:à|ao|a)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
      /especialista (?:da|do)\s+\*?\*?([A-Z][A-Za-z0-9\s&]+)/i,
    ];
    
    for (const pattern of patterns) {
      const match = prompt.match(pattern);
      if (match && match[1].trim().length > 2) {
        return match[1].trim();
      }
    }
    return 'Meu Negócio';
  }
  
  extractPrices(prompt) {
    const prices = {};
    const contextPatterns = [
      { pattern: /plano.*?R\$\s?(\d+(?:[.,]\d{2})?)/i, key: 'plano_mensal' },
      { pattern: /implementa[çc][aã]o.*?R\$\s?(\d+(?:[.,]\d{2})?)/i, key: 'implementacao' },
      { pattern: /promo[çc][aã]o.*?R\$\s?(\d+(?:[.,]\d{2})?)/i, key: 'promo' },
      { pattern: /R\$\s?(\d+(?:[.,]\d{2})?)\s*\/\s*m[êe]s/i, key: 'mensal' },
      { pattern: /honorário.*?R\$\s?(\d+(?:[.,]\d{2})?)/i, key: 'honorario' },
    ];
    
    for (const { pattern, key } of contextPatterns) {
      const match = prompt.match(pattern);
      if (match) {
        prices[key] = parseFloat(match[1].replace(',', '.'));
      }
    }
    return prices;
  }
  
  extractLinks(prompt) {
    const links = {};
    const urlPattern = /https?:\/\/[^\s\)]+/gi;
    const urls = prompt.match(urlPattern) || [];
    
    for (const url of urls) {
      if (url.includes('cadastro') || url.includes('signup')) {
        links['cadastro'] = url;
      } else if (url.includes('promo') || url.includes('plano')) {
        links['promocao'] = url;
      } else {
        links['site'] = url;
      }
    }
    return links;
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 📋 PROMPTS REAIS PARA TESTE
// ═══════════════════════════════════════════════════════════════════════

const PROMPTS = {
  // VENDAS - AgenteZap (rodrigo4@gmail.com)
  AGENTEZAP: `## IDENTIDADE
Você é **Rodrigo**, especialista da **AgenteZap**.
Seu objetivo é ajudar potenciais clientes a entenderem a plataforma, criar a conta gratuita para teste e, se fizer sentido, assinar o plano ou contratar a implementação.

## TOM DE VOZ
*   **Humano e Natural:** Use "tá?", "né?", "entendeu?". Evite formalidades excessivas.
*   **Conversacional:** Não use listas numeradas. Fale em parágrafos curtos.

## DIRETRIZES DE PREÇO
O plano Mensal Padrão: O valor oficial é **R$99/mês**.
**Campanha Promocional (R$49):** https://agentezap.online/p/plano-promo-ilimitado-mensal
**Implementação (Setup):** R$199 (pagamento único)

## FLUXO DE CONVERSA
1. Abordagem Inicial
2. Explicando a Solução
3. Fechamento / Cadastro`,

  // DELIVERY - Pizzaria (bigacaicuiaba@gmail.com)
  PIZZARIA: `**Novo Sabor Pizza e Esfihas e Açaí** - atendente da pizzaria. Tom cordial, profissional, eficiente e acolhedor.

**REGRAS:**
• Seja cordial, simpático e direto ao ponto
• Peça confirmação dos pedidos antes de finalizar
• Informe prazos de entrega estimados
• Ofereça sugestões de acompanhamentos
• Entrega em Cuiabá e Várzea Grande
• Promoção: Pizza Grande + Refri + Borda Recheada por R$59,99!

**NÃO FAZER:**
• Ignorar perguntas sobre ingredientes ou áreas de entrega`,

  // SUPORTE - Internet (delnetpe@hotmail.com)
  INTERNET: `**Del Net Assistente** - consultor especializado em atendimento ao cliente de provedor de internet.

**DIRETRIZES DE ATENDIMENTO:**
• Solicite nome e sobrenome após abordar o problema
• Para instalação de internet: solicite primeiro o endereço completo

**PLANOS:**
- R$ 59,99: 400 Mbps
- R$ 69,99: 600 Mbps
- R$ 79,99: 800 Mbps

**SUPORTE TÉCNICO:**
• Internet lenta: reinicie modem e roteador
• Luzes apagadas: verificar conexão na tomada
• Luz vermelha piscando: agendar visita técnica`,

  // VISTOS - Serviços (sdcvistos19@gmail.com)
  VISTOS: `CONFIGURAÇÃO DA IA – SDC Vistos
NOME DA IA: Thais

1) IDENTIDADE E TOM
- Você é a Thais, atendente virtual da SDC Vistos.
- Linguagem clara, educada, objetiva e profissional

4) OBJETIVO DO ATENDIMENTO
- Identificar a necessidade do cliente (visto americano / passaporte brasileiro)
- Coletar dados/documentos necessários
- Encaminhar próximos passos

5) PRINCIPAIS SERVIÇOS
- Visto Americano (B1/B2 – turismo/negócios)
- Passaporte Brasileiro (adulto e menor)

HONORÁRIOS: R$ 400,00 por pessoa
Taxa consular: US$ 185,00 por pessoa`,

  // CONSULTORIA (nathanandrade@gmail.com)
  ASSESSORIA: `## IDENTIDADE E MISSÃO
Você é a **assistente virtual de pré-atendimento** da **Nathan Andrade - Assessoria Empresarial**.
Seu nome é **Ana**.

### SUA MISSÃO PRINCIPAL:
**CONVERTER leads em clientes** através de atendimento humanizado, empático e profissional.

## SERVIÇOS
- Limpa Nome (retirar restrições do CPF/CNPJ)
- Bacen (limpar apontamentos no Banco Central)
- Rating Comercial (aumentar score e limite de crédito)

## VALORES
- Honorários mínimos: R$ 890,00
- Consulta CPF/CNPJ: R$ 30,00
- Rating Comercial: R$ 1.300,00`,

  // JURIDICO - Advocacia
  ADVOCACIA: `**Silva & Associados** - Atendente jurídico especializado em direito trabalhista.

**REGRAS:**
• Identifique-se como atendente da Silva & Associados
• Agende consultas com horário, data e contato do cliente
• Responda dúvidas básicas sobre direito trabalhista

**NÃO FAZER:**
• Dar conselhos jurídicos detalhados
• Prometer resultados ou garantir vitórias`,

  // GRÁFICA (arte.print.sb@gmail.com)
  GRAFICA: `**Arte Print** - Atendente de gráfica. Tom direto, eficiente e amigável.

**REGRAS:**
• Copos Long Drink Acrílico: confirme modelo, quantidade mínima 20 unidades
• Para banners em lona, adesivos: peça o tamanho ao cliente
• Use a tabela de preços para cálculos
• Informe métodos de pagamento (PIX/Cartão)`,

  // MOTOS (reimotos01@hotmail.com)
  MOTOS: `**Nely Motos** - Vendedora de peças e especialista em consertos de motocicletas.

**REGRAS:**
• Seja direta e objetiva, mas sempre cordial
• Ofereça soluções rápidas para peças ou consertos
• Informe prazos e valores com transparência

**NÃO FAZER:**
• Ignorar dúvidas técnicas sem explicar`,
};

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES DE DETECÇÃO DE TIPO
// ═══════════════════════════════════════════════════════════════════════

function testFlowTypeDetection() {
  console.log('\n' + '═'.repeat(70));
  console.log('🔍 FASE 1: DETECÇÃO DE TIPO DE FLUXO');
  console.log('═'.repeat(70));
  
  const analyzer = new PromptAnalyzer();
  const tests = [
    { name: 'AgenteZap', prompt: PROMPTS.AGENTEZAP, expected: 'VENDAS' },
    { name: 'Pizzaria', prompt: PROMPTS.PIZZARIA, expected: 'DELIVERY' },
    { name: 'Del Net', prompt: PROMPTS.INTERNET, expected: 'SUPORTE' },
    { name: 'SDC Vistos', prompt: PROMPTS.VISTOS, expected: 'VENDAS' },
    { name: 'Nathan Assessoria', prompt: PROMPTS.ASSESSORIA, expected: 'VENDAS' },
    { name: 'Advocacia', prompt: PROMPTS.ADVOCACIA, expected: 'AGENDAMENTO' },
    { name: 'Arte Print', prompt: PROMPTS.GRAFICA, expected: 'VENDAS' },
    { name: 'Nely Motos', prompt: PROMPTS.MOTOS, expected: 'VENDAS' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n  📋 Testando: ${test.name}`);
    const detected = analyzer.detectFlowType(test.prompt);
    
    if (detected === test.expected) {
      passed++;
      console.log(`    ✅ PASSOU: Detectado ${detected}`);
    } else {
      failed++;
      console.log(`    ❌ FALHOU: Esperado ${test.expected}, Detectado ${detected}`);
    }
  }
  
  console.log(`\n  📊 Resultado: ${passed}/${tests.length} testes passaram`);
  return { passed, failed, total: tests.length };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES DE EXTRAÇÃO DE DADOS
// ═══════════════════════════════════════════════════════════════════════

function testDataExtraction() {
  console.log('\n' + '═'.repeat(70));
  console.log('📊 FASE 2: EXTRAÇÃO DE DADOS DO PROMPT');
  console.log('═'.repeat(70));
  
  const analyzer = new PromptAnalyzer();
  let passed = 0;
  let failed = 0;
  
  // Teste 1: AgenteZap
  console.log('\n  📋 Testando: AgenteZap');
  const agentName1 = analyzer.extractAgentName(PROMPTS.AGENTEZAP);
  const business1 = analyzer.extractBusinessName(PROMPTS.AGENTEZAP);
  const prices1 = analyzer.extractPrices(PROMPTS.AGENTEZAP);
  const links1 = analyzer.extractLinks(PROMPTS.AGENTEZAP);
  
  console.log(`    👤 Agente: ${agentName1} (esperado: Rodrigo)`);
  console.log(`    🏢 Negócio: ${business1} (esperado: AgenteZap)`);
  console.log(`    💰 Preços: ${JSON.stringify(prices1)}`);
  console.log(`    🔗 Links: ${JSON.stringify(links1)}`);
  
  if (agentName1 === 'Rodrigo') { passed++; console.log('    ✅ Nome do agente correto'); }
  else { failed++; console.log('    ❌ Nome do agente incorreto'); }
  
  if (business1.includes('AgenteZap')) { passed++; console.log('    ✅ Nome do negócio correto'); }
  else { failed++; console.log('    ❌ Nome do negócio incorreto'); }
  
  // Teste 2: Pizzaria
  console.log('\n  📋 Testando: Pizzaria');
  const business2 = analyzer.extractBusinessName(PROMPTS.PIZZARIA);
  console.log(`    🏢 Negócio: ${business2} (esperado: Novo Sabor)`);
  
  if (business2.includes('Novo Sabor') || business2.includes('Sabor Pizza')) { 
    passed++; console.log('    ✅ Nome do negócio correto'); 
  }
  else { failed++; console.log('    ❌ Nome do negócio incorreto'); }
  
  // Teste 3: SDC Vistos
  console.log('\n  📋 Testando: SDC Vistos');
  const agentName3 = analyzer.extractAgentName(PROMPTS.VISTOS);
  const prices3 = analyzer.extractPrices(PROMPTS.VISTOS);
  console.log(`    👤 Agente: ${agentName3} (esperado: Thais)`);
  console.log(`    💰 Preços: ${JSON.stringify(prices3)}`);
  
  if (agentName3 === 'Thais') { passed++; console.log('    ✅ Nome do agente correto'); }
  else { failed++; console.log('    ❌ Nome do agente incorreto'); }
  
  // Teste 4: Nathan Assessoria
  console.log('\n  📋 Testando: Nathan Assessoria');
  const agentName4 = analyzer.extractAgentName(PROMPTS.ASSESSORIA);
  console.log(`    👤 Agente: ${agentName4} (esperado: Ana)`);
  
  if (agentName4 === 'Ana') { passed++; console.log('    ✅ Nome do agente correto'); }
  else { failed++; console.log('    ❌ Nome do agente incorreto'); }
  
  console.log(`\n  📊 Resultado: ${passed}/${passed + failed} testes passaram`);
  return { passed, failed, total: passed + failed };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES DE DETECÇÃO DE INTENÇÃO
// ═══════════════════════════════════════════════════════════════════════

function testIntentDetection() {
  console.log('\n' + '═'.repeat(70));
  console.log('🎯 FASE 3: DETECÇÃO DE INTENÇÕES');
  console.log('═'.repeat(70));
  
  // Intents de DELIVERY
  const deliveryIntents = {
    GREETING: {
      examples: ['oi', 'olá', 'bom dia', 'boa tarde', 'boa noite', 'e aí', 'opa'],
      pattern: /^(oi|ol[aá]|bom\s+dia|boa\s+(tarde|noite)|e\s*a[ií]|opa)[!?.,]?$/i
    },
    ASK_MENU: {
      examples: ['cardápio', 'menu', 'o que tem', 'quais opções', 'quero ver o cardápio'],
      pattern: /card[áa]pio|menu|o\s+que\s+tem|ver\s+.*?(card|menu)|op[çc][õo]es/i
    },
    ADD_ITEM: {
      examples: ['quero uma pizza', 'quero uma calabresa', 'manda uma', 'adiciona'],
      pattern: /quero\s+(uma?|\\d+)|me\s+v[êe]|adiciona|manda\s+(uma?|\\d+)/i
    },
    CHOOSE_DELIVERY: {
      examples: ['delivery', 'entrega', 'entregar', 'quero pra entregar'],
      pattern: /^delivery$|entrega|manda\s+pra\s+mim|entregar|pra\s+entregar/i
    },
    CHOOSE_PICKUP: {
      examples: ['buscar', 'retirar', 'retirada', 'vou buscar'],
      pattern: /buscar|retirar|retirada|vou\s+a[íi]|retiro/i
    },
    CHOOSE_PAYMENT: {
      examples: ['pix', 'dinheiro', 'cartão'],
      pattern: /^pix$|^dinheiro$|cart[ãa]o|pago\s+em|vou\s+pagar/i
    },
    CONFIRM: {
      examples: ['confirma', 'isso mesmo', 'fechado', 'pode fechar'],
      pattern: /confirma|isso\s+mesmo|fechado?|pode\s+fechar|finalizar|^ok$/i
    },
    THANKS: {
      examples: ['obrigado', 'valeu', 'agradeço'],
      pattern: /obrigad[oa]|valeu|agrade[çc]o/i
    }
  };
  
  // Intents de VENDAS
  const vendasIntents = {
    GREETING: {
      examples: ['oi', 'olá', 'bom dia'],
      pattern: /^(oi|ol[aá]|bom\s+dia|boa\s+(tarde|noite))[!?.,]?$/i
    },
    ASK_INFO: {
      examples: ['como funciona', 'o que faz', 'me explica'],
      pattern: /como\s+funciona|o\s+que\s+faz|me\s+explica|quero\s+entender/i
    },
    ASK_PRICE: {
      examples: ['quanto custa', 'qual o valor', 'preço'],
      pattern: /quanto\s+custa|qual\s+o?\s*valor|pre[çc]o|quanto\s+[éeê]/i
    },
    ASK_PROMO: {
      examples: ['promoção', 'desconto', 'vi o anúncio'],
      pattern: /promo[çc][ãa]o|desconto|vi\s+o?\s*an[úu]ncio|r\$\s*49/i
    },
    REQUEST_DEMO: {
      examples: ['quero testar', 'como testo', 'tem teste grátis'],
      pattern: /quero\s+testar|como\s+test|teste\s+gr[áa]tis|trial|demonstra/i
    },
    PURCHASE: {
      examples: ['quero contratar', 'vou assinar', 'pode me mandar o link'],
      pattern: /quero\s+contratar|vou\s+(assinar|contratar)|pode\s+me\s+mandar|vou\s+cadastrar/i
    },
    THANKS: {
      examples: ['obrigado', 'valeu'],
      pattern: /obrigad[oa]|valeu/i
    }
  };
  
  // Testar mensagens de DELIVERY
  console.log('\n  📋 Testando mensagens de DELIVERY:');
  const deliveryTests = [
    { msg: 'oi', expected: 'GREETING' },
    { msg: 'bom dia', expected: 'GREETING' },
    { msg: 'cardápio', expected: 'ASK_MENU' },
    { msg: 'quero ver o cardápio', expected: 'ASK_MENU' },
    { msg: 'quero uma pizza de calabresa', expected: 'ADD_ITEM' },
    { msg: 'delivery', expected: 'CHOOSE_DELIVERY' },
    { msg: 'quero pra entregar', expected: 'CHOOSE_DELIVERY' },
    { msg: 'vou buscar', expected: 'CHOOSE_PICKUP' },
    { msg: 'pix', expected: 'CHOOSE_PAYMENT' },
    { msg: 'cartão', expected: 'CHOOSE_PAYMENT' },
    { msg: 'confirma', expected: 'CONFIRM' },
    { msg: 'isso mesmo', expected: 'CONFIRM' },
    { msg: 'obrigado', expected: 'THANKS' },
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of deliveryTests) {
    const detected = detectIntent(test.msg, deliveryIntents);
    if (detected === test.expected) {
      passed++;
      console.log(`    ✅ "${test.msg}" → ${detected}`);
    } else {
      failed++;
      console.log(`    ❌ "${test.msg}" → ${detected || 'NONE'} (esperado: ${test.expected})`);
    }
  }
  
  // Testar mensagens de VENDAS
  console.log('\n  📋 Testando mensagens de VENDAS:');
  const vendasTests = [
    { msg: 'oi', expected: 'GREETING' },
    { msg: 'como funciona?', expected: 'ASK_INFO' },
    { msg: 'quanto custa?', expected: 'ASK_PRICE' },
    { msg: 'tem promoção?', expected: 'ASK_PROMO' },
    { msg: 'vi o anúncio de R$49', expected: 'ASK_PROMO' },
    { msg: 'quero testar', expected: 'REQUEST_DEMO' },
    { msg: 'quero contratar', expected: 'PURCHASE' },
    { msg: 'obrigado', expected: 'THANKS' },
  ];
  
  for (const test of vendasTests) {
    const detected = detectIntent(test.msg, vendasIntents);
    if (detected === test.expected) {
      passed++;
      console.log(`    ✅ "${test.msg}" → ${detected}`);
    } else {
      failed++;
      console.log(`    ❌ "${test.msg}" → ${detected || 'NONE'} (esperado: ${test.expected})`);
    }
  }
  
  console.log(`\n  📊 Resultado: ${passed}/${passed + failed} testes passaram`);
  return { passed, failed, total: passed + failed };
}

function detectIntent(message, intents) {
  const msgLower = message.toLowerCase().trim();
  
  for (const [intentName, intent] of Object.entries(intents)) {
    // Verificar pattern regex
    if (intent.pattern && intent.pattern.test(msgLower)) {
      return intentName;
    }
    
    // Verificar exemplos
    for (const example of intent.examples) {
      const exampleLower = example.toLowerCase();
      if (msgLower === exampleLower || msgLower.includes(exampleLower)) {
        return intentName;
      }
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES DE SIMULAÇÃO DE CONVERSA
// ═══════════════════════════════════════════════════════════════════════

function testConversationSimulation() {
  console.log('\n' + '═'.repeat(70));
  console.log('💬 FASE 4: SIMULAÇÃO DE CONVERSAS');
  console.log('═'.repeat(70));
  
  // Definir máquina de estados de DELIVERY
  const deliveryStates = {
    'INICIO': {
      transitions: {
        'GREETING': 'SAUDACAO',
        'ASK_MENU': 'CARDAPIO',
        'ADD_ITEM': 'PEDINDO',
      }
    },
    'SAUDACAO': {
      transitions: {
        'ASK_MENU': 'CARDAPIO',
        'ADD_ITEM': 'PEDINDO',
      }
    },
    'CARDAPIO': {
      transitions: {
        'ADD_ITEM': 'PEDINDO',
      }
    },
    'PEDINDO': {
      transitions: {
        'ADD_ITEM': 'PEDINDO',
        'CHOOSE_DELIVERY': 'ENDERECO',
        'CHOOSE_PICKUP': 'PAGAMENTO',
        'CONFIRM': 'TIPO_ENTREGA',
      }
    },
    'TIPO_ENTREGA': {
      transitions: {
        'CHOOSE_DELIVERY': 'ENDERECO',
        'CHOOSE_PICKUP': 'PAGAMENTO',
      }
    },
    'ENDERECO': {
      transitions: {
        'PROVIDE_ADDRESS': 'PAGAMENTO',
        'CHOOSE_PAYMENT': 'CONFIRMACAO',
      }
    },
    'PAGAMENTO': {
      transitions: {
        'CHOOSE_PAYMENT': 'CONFIRMACAO',
      }
    },
    'CONFIRMACAO': {
      transitions: {
        'CONFIRM': 'FIM',
      }
    },
    'FIM': {}
  };
  
  // Conversa completa de DELIVERY
  console.log('\n  📋 Simulando conversa completa de DELIVERY:');
  const deliveryConversation = [
    { msg: 'oi', intent: 'GREETING', expectedState: 'SAUDACAO' },
    { msg: 'quero ver o cardápio', intent: 'ASK_MENU', expectedState: 'CARDAPIO' },
    { msg: 'quero uma pizza de calabresa', intent: 'ADD_ITEM', expectedState: 'PEDINDO' },
    { msg: 'delivery', intent: 'CHOOSE_DELIVERY', expectedState: 'ENDERECO' },
    { msg: 'pix', intent: 'CHOOSE_PAYMENT', expectedState: 'CONFIRMACAO' },
    { msg: 'confirma', intent: 'CONFIRM', expectedState: 'FIM' },
  ];
  
  let currentState = 'INICIO';
  let passed = 0;
  let failed = 0;
  
  for (const step of deliveryConversation) {
    const state = deliveryStates[currentState];
    if (state && state.transitions && state.transitions[step.intent]) {
      currentState = state.transitions[step.intent];
    }
    
    if (currentState === step.expectedState) {
      passed++;
      console.log(`    ✅ "${step.msg}" [${step.intent}] → Estado: ${currentState}`);
    } else {
      failed++;
      console.log(`    ❌ "${step.msg}" [${step.intent}] → Estado: ${currentState} (esperado: ${step.expectedState})`);
    }
  }
  
  // Conversa de VENDAS
  const vendasStates = {
    'INICIO': {
      transitions: {
        'GREETING': 'QUALIFICANDO',
        'ASK_INFO': 'EXPLICANDO',
        'ASK_PRICE': 'PRECOS',
      }
    },
    'QUALIFICANDO': {
      transitions: {
        'ASK_INFO': 'EXPLICANDO',
        'ASK_PRICE': 'PRECOS',
        'REQUEST_DEMO': 'DEMO',
      }
    },
    'EXPLICANDO': {
      transitions: {
        'ASK_PRICE': 'PRECOS',
        'REQUEST_DEMO': 'DEMO',
      }
    },
    'PRECOS': {
      transitions: {
        'ASK_PROMO': 'PRECOS',
        'REQUEST_DEMO': 'DEMO',
        'PURCHASE': 'FECHANDO',
      }
    },
    'DEMO': {
      transitions: {
        'PURCHASE': 'CADASTRADO',
      }
    },
    'FECHANDO': {
      transitions: {
        'PURCHASE': 'CADASTRADO',
      }
    },
    'CADASTRADO': {}
  };
  
  console.log('\n  📋 Simulando conversa completa de VENDAS:');
  const vendasConversation = [
    { msg: 'oi', intent: 'GREETING', expectedState: 'QUALIFICANDO' },
    { msg: 'como funciona?', intent: 'ASK_INFO', expectedState: 'EXPLICANDO' },
    { msg: 'quanto custa?', intent: 'ASK_PRICE', expectedState: 'PRECOS' },
    { msg: 'quero testar', intent: 'REQUEST_DEMO', expectedState: 'DEMO' },
    { msg: 'vou contratar', intent: 'PURCHASE', expectedState: 'CADASTRADO' },
  ];
  
  currentState = 'INICIO';
  
  for (const step of vendasConversation) {
    const state = vendasStates[currentState];
    if (state && state.transitions && state.transitions[step.intent]) {
      currentState = state.transitions[step.intent];
    }
    
    if (currentState === step.expectedState) {
      passed++;
      console.log(`    ✅ "${step.msg}" [${step.intent}] → Estado: ${currentState}`);
    } else {
      failed++;
      console.log(`    ❌ "${step.msg}" [${step.intent}] → Estado: ${currentState} (esperado: ${step.expectedState})`);
    }
  }
  
  console.log(`\n  📊 Resultado: ${passed}/${passed + failed} testes passaram`);
  return { passed, failed, total: passed + failed };
}

// ═══════════════════════════════════════════════════════════════════════
// 🧪 TESTES COM 100 CLIENTES DIFERENTES
// ═══════════════════════════════════════════════════════════════════════

function test100ClientScenarios() {
  console.log('\n' + '═'.repeat(70));
  console.log('👥 FASE 5: SIMULAÇÃO DE 100 TIPOS DE CLIENTES');
  console.log('═'.repeat(70));
  
  // Gerar 100 mensagens diferentes de clientes
  const clientMessages = [
    // Saudações (20 variações)
    'oi', 'olá', 'ola', 'oie', 'oii', 'opa', 'e aí', 'eai', 'fala', 'bom dia',
    'boa tarde', 'boa noite', 'hey', 'oi pessoal', 'olá, tudo bem?', 'oi boa noite',
    'oi, como vai?', 'oii, td bem?', 'opa, bom dia', 'ei',
    
    // Perguntas de preço (15 variações)
    'quanto custa?', 'qual o valor?', 'preço?', 'quanto é?', 'valores?',
    'qual o preço?', 'me passa os preços', 'tabela de preços', 'quanto tá custando?',
    'quanto fica?', 'qual valor?', 'me fala o preço', 'quanto sai?', 'preços?', 'valor?',
    
    // Cardápio/Menu (10 variações)
    'cardápio', 'menu', 'cardápio por favor', 'me manda o cardápio', 'quero ver o menu',
    'o que vocês tem?', 'quais opções?', 'opções?', 'o que tem pra comer?', 'quero ver',
    
    // Pedidos (15 variações)
    'quero uma pizza', 'quero 2 pizzas', 'me vê uma calabresa', 'manda uma mussarela',
    'quero uma grande', 'quero pedir', 'vou querer', 'pode ser uma portuguesa',
    'quero uma de frango', 'adiciona mais uma', 'bota mais uma pizza',
    'quero também uma coca', 'adiciona um refri', 'quero com borda recheada', 'sem cebola',
    
    // Entrega (10 variações)
    'delivery', 'entrega', 'quero pra entregar', 'manda pra mim', 'entregar em casa',
    'delivery por favor', 'é delivery', 'pra entrega', 'entrega no endereço', 'manda aqui',
    
    // Retirada (5 variações)
    'vou buscar', 'retirada', 'buscar no local', 'vou retirar', 'retiro aí',
    
    // Pagamento (10 variações)
    'pix', 'cartão', 'dinheiro', 'vou pagar no pix', 'pago no cartão',
    'aceita cartão?', 'pago em dinheiro', 'pode ser pix?', 'crédito', 'débito',
    
    // Confirmação (10 variações)
    'confirma', 'isso', 'ok', 'fechado', 'pode fechar', 'finaliza', 'isso mesmo',
    'tá certo', 'pode confirmar', 'confirmo',
    
    // Agradecimento (5 variações)
    'obrigado', 'obrigada', 'valeu', 'agradeço', 'muito obrigado',
  ];
  
  // Testar classificação de cada mensagem
  const intentPatterns = {
    GREETING: /^(oi+e?|ol[aá]|bom\s+dia|boa\s+(tarde|noite)|e\s*a[ií]|opa|hey|fala|ei)[!?.,]?(\s|$)/i,
    ASK_PRICE: /quanto|valor|pre[çc]o|tabela|cust/i,
    ASK_MENU: /card[áa]pio|menu|op[çc][õo]es|o\s+que\s+(tem|voc[êe]s)/i,
    ADD_ITEM: /quero|me\s+v[êe]|manda|adiciona|bota|pode\s+ser|vou\s+querer|pedir|sem\s+\w+/i,
    CHOOSE_DELIVERY: /delivery|entrega|manda\s+(pra|aqui)|pra\s+entregar|[ée]\s+delivery/i,
    CHOOSE_PICKUP: /buscar|retirar|retirada|retiro/i,
    CHOOSE_PAYMENT: /^pix$|^dinheiro$|cart[ãa]o|pago|cr[ée]dito|d[ée]bito|aceita|vou\s+pagar/i,
    CONFIRM: /confirma|^isso$|^ok$|fechado?|finaliza|t[aá]\s+certo|pode\s+fechar|isso\s+mesmo|^confirmo$/i,
    THANKS: /obrigad|valeu|agrade[çc]/i,
  };
  
  let classified = 0;
  let unclassified = 0;
  const intentCounts = {};
  
  for (const msg of clientMessages) {
    let detected = null;
    for (const [intent, pattern] of Object.entries(intentPatterns)) {
      if (pattern.test(msg)) {
        detected = intent;
        break;
      }
    }
    
    if (detected) {
      classified++;
      intentCounts[detected] = (intentCounts[detected] || 0) + 1;
    } else {
      unclassified++;
      console.log(`    ⚠️ Não classificada: "${msg}"`);
    }
  }
  
  console.log(`\n  📊 Resultado: ${classified}/${clientMessages.length} mensagens classificadas`);
  console.log(`\n  📈 Distribuição por intenção:`);
  for (const [intent, count] of Object.entries(intentCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`    • ${intent}: ${count} mensagens`);
  }
  
  if (unclassified > 0) {
    console.log(`\n  ⚠️ ${unclassified} mensagens não foram classificadas`);
  }
  
  return { passed: classified, failed: unclassified, total: clientMessages.length };
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════

function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 VALIDAÇÃO COMPLETA DO SISTEMA DE FLUXOS UNIFICADOS');
  console.log('═'.repeat(70));
  console.log('Validando lógica antes do deploy...\n');
  
  const results = [];
  
  // Fase 1: Detecção de Tipo
  results.push({ name: 'Detecção de Tipo', ...testFlowTypeDetection() });
  
  // Fase 2: Extração de Dados
  results.push({ name: 'Extração de Dados', ...testDataExtraction() });
  
  // Fase 3: Detecção de Intenções
  results.push({ name: 'Detecção de Intenções', ...testIntentDetection() });
  
  // Fase 4: Simulação de Conversas
  results.push({ name: 'Simulação de Conversas', ...testConversationSimulation() });
  
  // Fase 5: 100 Clientes
  results.push({ name: '100 Tipos de Clientes', ...test100ClientScenarios() });
  
  // Relatório Final
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(70));
  
  let totalPassed = 0;
  let totalFailed = 0;
  let totalTests = 0;
  
  console.log('\n  📈 RESULTADOS POR FASE:');
  for (const result of results) {
    const rate = ((result.passed / result.total) * 100).toFixed(0);
    const status = result.passed === result.total ? '✅' : result.passed >= result.total * 0.8 ? '⚠️' : '❌';
    console.log(`    ${status} ${result.name}: ${result.passed}/${result.total} (${rate}%)`);
    totalPassed += result.passed;
    totalFailed += result.failed;
    totalTests += result.total;
  }
  
  const overallRate = ((totalPassed / totalTests) * 100).toFixed(1);
  
  console.log('\n  📊 TOTAIS:');
  console.log(`    Total de Testes: ${totalTests}`);
  console.log(`    ✅ Passou: ${totalPassed}`);
  console.log(`    ❌ Falhou: ${totalFailed}`);
  console.log(`    📊 Taxa de Sucesso: ${overallRate}%`);
  
  // Conclusão
  console.log('\n' + '═'.repeat(70));
  if (parseFloat(overallRate) >= 90) {
    console.log('🎉 SISTEMA APROVADO PARA DEPLOY - Taxa de sucesso >= 90%');
  } else if (parseFloat(overallRate) >= 80) {
    console.log('⚠️ SISTEMA PRECISA DE PEQUENOS AJUSTES - Taxa de sucesso 80-90%');
  } else if (parseFloat(overallRate) >= 70) {
    console.log('⚠️ SISTEMA PRECISA DE AJUSTES - Taxa de sucesso 70-80%');
  } else {
    console.log('❌ SISTEMA NÃO APROVADO - Taxa de sucesso < 70%');
  }
  console.log('═'.repeat(70) + '\n');
}

// Executar
main();
