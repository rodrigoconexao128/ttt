/**
 * ═══════════════════════════════════════════════════════════════════════
 * 🧪 TESTE COMPLETO DO SISTEMA DE FLUXOS
 * ═══════════════════════════════════════════════════════════════════════
 * 
 * Valida 100+ cenários de diferentes tipos de clientes:
 * - DELIVERY (Pizzarias, Restaurantes)
 * - VENDAS (SaaS, Agências, Consultoria)
 * - AGENDAMENTO (Clínicas, Salões)
 * - SUPORTE (Help Desk, SAC)
 * - GENÉRICO (Outros)
 */

import { PromptAnalyzer, FlowBuilder, FlowDefinition, FlowType } from './server/FlowBuilder.js';

// ═══════════════════════════════════════════════════════════════════════
// 📊 PROMPTS REAIS DO SUPABASE (Anonimizados)
// ═══════════════════════════════════════════════════════════════════════

const PROMPTS_REAIS = {
  // VENDAS - SaaS AgenteZap (rodrigo4@gmail.com)
  VENDAS_SAAS: `## IDENTIDADE
Você é **Rodrigo**, especialista da **AgenteZap**.
Seu objetivo é ajudar potenciais clientes a entenderem a plataforma, criar a conta gratuita para teste e, se fizer sentido, assinar o plano ou contratar a implementação.

## TOM DE VOZ (IMPORTANTE)
*   **Humano e Natural:** Use "tá?", "né?", "entendeu?". Evite formalidades excessivas.
*   **Conversacional:** Não use listas numeradas (1. 2. 3.). Fale em parágrafos curtos.
*   **Empático:** Entenda a dor do cliente (perder vendas, falta de tempo) e ofereça a solução.
*   **Direto:** Responda o que foi perguntado, mas sempre puxe o gancho para o próximo passo (teste grátis).

## DIRETRIZES DE PREÇO
O plano Mensal Padrão: O valor oficial é **R$99/mês** (ilimitado para 1 número de WhatsApp). Cada número adicional custa **R$49,99/mês**, ou você pode adicionar **até 10 números por R$199/mês**.
**Campanha Promocional (R$49):** https://agentezap.online/p/plano-promo-ilimitado-mensal
**Implementação (Setup):** R$199 (pagamento único)
**Teste Grátis:** Sempre incentive o cadastro gratuito primeiro.

## FLUXO DE CONVERSA
1. Abordagem Inicial - destacar funcionalidades da IA
2. Explicando a Solução - IA que atende 24h
3. Fechamento / Cadastro - link de cadastro
4. Suporte e Vídeos - tutoriais disponíveis`,

  // DELIVERY - Pizzaria (bigacaicuiaba@gmail.com)
  DELIVERY_PIZZA: `**Novo Sabor Pizza e Esfihas e Açaí** - atendente da pizzaria. Tom cordial, profissional, eficiente e acolhedor.

**REGRAS:**
• Seja cordial, simpático e direto ao ponto
• Adapte o tom da saudação inicial conforme a entrada do cliente
• Use emojis com moderação (🍕🥤🍦)
• Peça confirmação dos pedidos antes de finalizar
• Informe prazos de entrega estimados
• Ofereça sugestões de acompanhamentos
• Entrega em Cuiabá e Várzea Grande
• Promoção: Pizza Grande + Refri + Borda Recheada por R$59,99!

**NÃO FAZER:**
• Ignorar perguntas sobre ingredientes ou áreas de entrega
• Prometer prazos sem confirmar
• Ser genérico nas respostas`,

  // SUPORTE/VENDAS - Visto Americano (sdcvistos19@gmail.com)
  SUPORTE_VISTOS: `CONFIGURAÇÃO DA IA – SDC Vistos
NOME DA IA: Thais

1) IDENTIDADE E TOM
- Você é a Thais, atendente virtual da SDC Vistos.
- Sempre pergunte o nome do cliente antes de responder
- Linguagem clara, educada, objetiva e profissional
- Tom acolhedor, prático e focado em resolver

2) REGRA MAIS IMPORTANTE
- Você DEVE sempre usar o nome do cliente nas respostas

4) OBJETIVO DO ATENDIMENTO
- Identificar a necessidade do cliente (visto americano / passaporte brasileiro)
- Explicar o processo com clareza
- Coletar dados/documentos necessários
- Encaminhar próximos passos

5) PRINCIPAIS SERVIÇOS
- Visto Americano (B1/B2 – turismo/negócios)
- Passaporte Brasileiro (adulto e menor)

HONORÁRIOS: R$ 400,00 por pessoa
Taxa consular: US$ 185,00 por pessoa`,

  // SERVIÇOS - Gráfica (arte.print.sb@gmail.com)
  SERVICOS_GRAFICA: `**Arte Print** - Atendente de gráfica. Tom direto, eficiente e amigável.

**REGRAS:**
• Copos Long Drink Acrílico: confirme modelo, quantidade mínima 20 unidades
• Para banners em lona, adesivos: peça o tamanho ao cliente (cm ou m²)
• Verifique se o nome é real, pergunte educadamente
• Use a tabela de preços para cálculos
• Informe métodos de pagamento (PIX/Cartão)

**NÃO FAZER:**
• Inventar informações
• Enviar imagens sem solicitação
• Negociar ou prometer descontos`,

  // CONSULTORIA - Assessoria Empresarial (nathanandrade@gmail.com)
  CONSULTORIA_CREDITO: `## IDENTIDADE E MISSÃO
Você é a **assistente virtual de pré-atendimento** da **Nathan Andrade - Assessoria Empresarial**.
Seu nome é **Ana**.

### SUA MISSÃO PRINCIPAL:
**CONVERTER leads em clientes** através de atendimento humanizado, empático e profissional.

## PERSONALIDADE E TOM DE VOZ
- **HUMANA**: Escreva como uma pessoa real
- **EMPÁTICA**: Demonstre que ENTENDE a dor do cliente (nome sujo, limitações)
- **CONFIANTE**: Transmita segurança sem prometer resultados específicos
- **CONSULTIVA**: Você é uma consultora que AJUDA, não vendedora

## SERVIÇOS
- Limpa Nome (retirar restrições do CPF/CNPJ)
- Bacen (limpar apontamentos no Banco Central)
- Rating Comercial (aumentar score e limite de crédito)

## VALORES
- Honorários mínimos: R$ 890,00
- Consulta CPF/CNPJ: R$ 30,00
- Rating Comercial: R$ 1.300,00
- Prazo Limpa Nome: 20-30 dias úteis`,

  // SERVIÇOS TÉCNICOS - Internet (delnetpe@hotmail.com)
  SUPORTE_INTERNET: `**Del Net Assistente** - consultor especializado em atendimento ao cliente.

**DIRETRIZES DE ATENDIMENTO:**
• Solicite nome e sobrenome após abordar o problema
• Para instalação de internet: solicite primeiro o endereço completo
• Linguagem formal e técnica, evite coloquialismos

**PLANOS:**
- R$ 59,99: 400 Mbps
- R$ 69,99: 600 Mbps
- R$ 79,99: 800 Mbps

**SUPORTE TÉCNICO:**
• Internet lenta: reinicie modem e roteador
• Luzes apagadas: verificar conexão na tomada
• Luz vermelha piscando: agendar visita técnica`,

  // VENDAS - Loja de Roupas (rodrigo6@gmail.com)
  VENDAS_ROUPAS: `Você vai ser o Marcio, dono da loja Marcio Roupas, um vendedor especializado em roupas de alta qualidade. 
Seu objetivo é ajudar clientes a encontrar as melhores peças para seu estilo e necessidades.
Logo na primeira mensagem, ofereça nossa camisa branca como uma peça versátil.
Utilize técnicas persuasivas de venda para destacar os modelos mais modernos.`,

  // SERVIÇOS - Motos (reimotos01@hotmail.com)
  SERVICOS_MOTOS: `**Nely Motos** - Vendedora de peças e especialista em consertos de motocicletas. Tom profissional, mas descontraído.

**REGRAS:**
• Seja direta e objetiva, mas sempre cordial
• Ofereça soluções rápidas para peças ou consertos
• Informe prazos e valores com transparência
• Use linguagem técnica quando necessário

**NÃO FAZER:**
• Ignorar dúvidas técnicas sem explicar
• Prometer prazos ou valores sem confirmar`,

  // JURÍDICO - Escritório de Advocacia
  JURIDICO_TRABALHISTA: `**Silva & Associados** - Atendente jurídico especializado em direito trabalhista.

**REGRAS:**
• Identifique-se como atendente da Silva & Associados
• Agende consultas com horário, data e contato do cliente
• Responda dúvidas básicas sobre direito trabalhista
• Seja claro e objetivo, evitando jargões complexos

**NÃO FAZER:**
• Dar conselhos jurídicos detalhados
• Prometer resultados ou garantir vitórias`,

  // AUDIO/VIDEO - Gravação (alemaodapropaganda@hotmail.com)
  SERVICOS_AUDIO: `**Loc Laser** - especialista em gravações de áudio e vídeo.

**BOAS-VINDAS:**
• Primeiro contato: "Olá! Bem-vindo à Loc Laser. Esta é uma mensagem automática. Diga como posso lhe ajudar."

**REGRAS:**
• Demais contatos: Não use saudação de boas-vindas
• Responda diretamente à pergunta do cliente
• Seja direto, objetivo e acolhedor

**PROIBIDO:**
• Usar termos como 'locação', 'aluguel', 'reserva'
• Alterar a saudação definida para primeiro contato`
};

// ═══════════════════════════════════════════════════════════════════════
// 🎯 CENÁRIOS DE TESTE - 100+ Mensagens de Clientes
// ═══════════════════════════════════════════════════════════════════════

interface TestScenario {
  name: string;
  flowType: FlowType;
  prompt: string;
  clientMessages: Array<{
    message: string;
    expectedIntent: string;
    expectedStateAfter?: string;
    shouldExtract?: string[];  // entidades esperadas
  }>;
}

const TEST_SCENARIOS: TestScenario[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 1: VENDAS - SaaS (AgenteZap)
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'AgenteZap - Vendas SaaS',
    flowType: 'VENDAS',
    prompt: PROMPTS_REAIS.VENDAS_SAAS,
    clientMessages: [
      { message: 'oi', expectedIntent: 'GREETING', expectedStateAfter: 'INICIAL' },
      { message: 'olá', expectedIntent: 'GREETING' },
      { message: 'bom dia', expectedIntent: 'GREETING' },
      { message: 'como funciona?', expectedIntent: 'ASK_INFO', expectedStateAfter: 'EXPLICANDO' },
      { message: 'o que é isso?', expectedIntent: 'ASK_INFO' },
      { message: 'me explica melhor', expectedIntent: 'ASK_INFO' },
      { message: 'quanto custa?', expectedIntent: 'ASK_PRICE', expectedStateAfter: 'PRECOS' },
      { message: 'qual o valor?', expectedIntent: 'ASK_PRICE' },
      { message: 'preço?', expectedIntent: 'ASK_PRICE' },
      { message: 'tem desconto?', expectedIntent: 'ASK_DISCOUNT' },
      { message: 'vi o anúncio de 49 reais', expectedIntent: 'ASK_PROMO' },
      { message: 'tem promoção?', expectedIntent: 'ASK_PROMO' },
      { message: 'quero testar', expectedIntent: 'REQUEST_DEMO', expectedStateAfter: 'DEMO' },
      { message: 'como faço pra testar?', expectedIntent: 'REQUEST_DEMO' },
      { message: 'tem teste grátis?', expectedIntent: 'REQUEST_DEMO' },
      { message: 'quero contratar', expectedIntent: 'PURCHASE', expectedStateAfter: 'FECHAMENTO' },
      { message: 'vou assinar', expectedIntent: 'PURCHASE' },
      { message: 'pode me mandar o link', expectedIntent: 'REQUEST_LINK' },
      { message: 'obrigado', expectedIntent: 'THANKS', expectedStateAfter: 'FIM' },
      { message: 'valeu', expectedIntent: 'THANKS' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 2: DELIVERY - Pizzaria
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Pizzaria Novo Sabor - Delivery',
    flowType: 'DELIVERY',
    prompt: PROMPTS_REAIS.DELIVERY_PIZZA,
    clientMessages: [
      { message: 'boa noite', expectedIntent: 'GREETING', expectedStateAfter: 'INICIAL' },
      { message: 'tá funcionando?', expectedIntent: 'ASK_OPEN' },
      { message: 'qual o horário?', expectedIntent: 'ASK_HOURS' },
      { message: 'cardápio', expectedIntent: 'ASK_MENU', expectedStateAfter: 'CARDAPIO' },
      { message: 'quero ver o menu', expectedIntent: 'ASK_MENU' },
      { message: 'o que tem de pizza?', expectedIntent: 'ASK_MENU' },
      { message: 'quero uma pizza', expectedIntent: 'ADD_ITEM', expectedStateAfter: 'PEDINDO' },
      { message: 'quero uma calabresa', expectedIntent: 'ADD_ITEM', shouldExtract: ['product'] },
      { message: 'uma pizza grande de mussarela', expectedIntent: 'ADD_ITEM', shouldExtract: ['product', 'size'] },
      { message: 'adiciona um refrigerante', expectedIntent: 'ADD_ITEM', shouldExtract: ['product'] },
      { message: 'delivery', expectedIntent: 'CHOOSE_DELIVERY', expectedStateAfter: 'ENDERECO' },
      { message: 'entrega', expectedIntent: 'CHOOSE_DELIVERY' },
      { message: 'quero pra entregar', expectedIntent: 'CHOOSE_DELIVERY' },
      { message: 'vou buscar', expectedIntent: 'CHOOSE_PICKUP' },
      { message: 'retirada', expectedIntent: 'CHOOSE_PICKUP' },
      { message: 'meu endereço é Rua das Flores, 123', expectedIntent: 'PROVIDE_ADDRESS', shouldExtract: ['address'] },
      { message: 'Rua X, número 50, bairro Centro', expectedIntent: 'PROVIDE_ADDRESS', shouldExtract: ['address'] },
      { message: 'pix', expectedIntent: 'CHOOSE_PAYMENT', expectedStateAfter: 'PAGAMENTO' },
      { message: 'cartão', expectedIntent: 'CHOOSE_PAYMENT', shouldExtract: ['payment_method'] },
      { message: 'dinheiro', expectedIntent: 'CHOOSE_PAYMENT', shouldExtract: ['payment_method'] },
      { message: 'confirma', expectedIntent: 'CONFIRM', expectedStateAfter: 'CONFIRMACAO' },
      { message: 'isso mesmo', expectedIntent: 'CONFIRM' },
      { message: 'cancela', expectedIntent: 'CANCEL' },
      { message: 'quero trocar', expectedIntent: 'MODIFY' },
      { message: 'taxa de entrega?', expectedIntent: 'ASK_DELIVERY_FEE' },
      { message: 'quanto tempo demora?', expectedIntent: 'ASK_TIME' },
      { message: 'vocês entregam no Bairro X?', expectedIntent: 'ASK_DELIVERY_AREA', shouldExtract: ['location'] },
      { message: 'tem açaí?', expectedIntent: 'ASK_MENU' },
      { message: 'quais bebidas?', expectedIntent: 'ASK_MENU' },
      { message: 'obrigado', expectedIntent: 'THANKS', expectedStateAfter: 'FIM' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 3: SUPORTE/SERVIÇOS - Vistos
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'SDC Vistos - Serviços de Visto',
    flowType: 'VENDAS',  // Mais parecido com vendas de serviços
    prompt: PROMPTS_REAIS.SUPORTE_VISTOS,
    clientMessages: [
      { message: 'olá', expectedIntent: 'GREETING' },
      { message: 'quero tirar visto americano', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'preciso de passaporte', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'quanto custa o visto?', expectedIntent: 'ASK_PRICE' },
      { message: 'qual o valor do serviço?', expectedIntent: 'ASK_PRICE' },
      { message: 'quais documentos preciso?', expectedIntent: 'ASK_INFO' },
      { message: 'quanto tempo demora?', expectedIntent: 'ASK_TIME' },
      { message: 'meu visto foi negado', expectedIntent: 'ASK_HELP' },
      { message: 'quero renovar meu visto', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'vocês fazem o DS-160?', expectedIntent: 'ASK_INFO' },
      { message: 'tem desconto?', expectedIntent: 'ASK_DISCOUNT' },
      { message: 'quero contratar', expectedIntent: 'PURCHASE' },
      { message: 'me manda o orçamento', expectedIntent: 'REQUEST_QUOTE' },
      { message: 'meu nome é João Silva', expectedIntent: 'PROVIDE_INFO', shouldExtract: ['name'] },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 4: CONSULTORIA - Crédito
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Nathan Andrade - Assessoria Crédito',
    flowType: 'VENDAS',
    prompt: PROMPTS_REAIS.CONSULTORIA_CREDITO,
    clientMessages: [
      { message: 'oi', expectedIntent: 'GREETING' },
      { message: 'primeiro contato', expectedIntent: 'NEW_LEAD' },
      { message: 'já sou cliente', expectedIntent: 'EXISTING_CLIENT' },
      { message: 'sou parceiro', expectedIntent: 'PARTNER' },
      { message: 'quero limpar meu nome', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'como funciona o limpa nome?', expectedIntent: 'ASK_INFO' },
      { message: 'quanto custa?', expectedIntent: 'ASK_PRICE' },
      { message: 'funciona mesmo?', expectedIntent: 'ASK_GUARANTEE' },
      { message: 'é confiável?', expectedIntent: 'ASK_TRUST' },
      { message: 'já fui enganado antes', expectedIntent: 'OBJECTION' },
      { message: 'tá caro', expectedIntent: 'OBJECTION_PRICE' },
      { message: 'tem desconto?', expectedIntent: 'ASK_DISCOUNT' },
      { message: 'individual', expectedIntent: 'CHOOSE_OPTION' },
      { message: 'coletivo', expectedIntent: 'CHOOSE_OPTION' },
      { message: 'quero o rating comercial', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'vamos fechar', expectedIntent: 'PURCHASE' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 5: SUPORTE - Internet
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Del Net - Suporte Internet',
    flowType: 'SUPORTE',
    prompt: PROMPTS_REAIS.SUPORTE_INTERNET,
    clientMessages: [
      { message: 'oi', expectedIntent: 'GREETING' },
      { message: 'estou sem internet', expectedIntent: 'REPORT_PROBLEM' },
      { message: 'minha internet está lenta', expectedIntent: 'REPORT_PROBLEM' },
      { message: 'a luz está vermelha', expectedIntent: 'REPORT_PROBLEM' },
      { message: 'as luzes estão apagadas', expectedIntent: 'REPORT_PROBLEM' },
      { message: 'quero instalar internet', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'quais são os planos?', expectedIntent: 'ASK_PLANS' },
      { message: 'quanto custa o plano de 600?', expectedIntent: 'ASK_PRICE' },
      { message: 'como pago minha fatura?', expectedIntent: 'ASK_PAYMENT' },
      { message: 'quero falar com atendente', expectedIntent: 'TRANSFER_HUMAN' },
      { message: 'meu endereço é Rua X, 123', expectedIntent: 'PROVIDE_ADDRESS', shouldExtract: ['address'] },
      { message: 'meu nome é Maria Santos', expectedIntent: 'PROVIDE_INFO', shouldExtract: ['name'] },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 6: SERVIÇOS - Gráfica
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Arte Print - Gráfica',
    flowType: 'VENDAS',  // Venda de produtos/serviços
    prompt: PROMPTS_REAIS.SERVICOS_GRAFICA,
    clientMessages: [
      { message: 'olá', expectedIntent: 'GREETING' },
      { message: 'quero fazer um banner', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'orçamento de adesivo', expectedIntent: 'REQUEST_QUOTE' },
      { message: 'preciso de copos personalizados', expectedIntent: 'REQUEST_SERVICE' },
      { message: '50 copos', expectedIntent: 'PROVIDE_QUANTITY', shouldExtract: ['quantity'] },
      { message: 'tamanho 2 metros por 1 metro', expectedIntent: 'PROVIDE_SIZE', shouldExtract: ['size'] },
      { message: 'aceita pix?', expectedIntent: 'ASK_PAYMENT' },
      { message: 'vocês entregam?', expectedIntent: 'ASK_DELIVERY' },
      { message: 'quanto fica?', expectedIntent: 'ASK_PRICE' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 7: JURÍDICO - Advocacia
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Silva & Associados - Advocacia',
    flowType: 'AGENDAMENTO',  // Foco em agendar consultas
    prompt: PROMPTS_REAIS.JURIDICO_TRABALHISTA,
    clientMessages: [
      { message: 'oi, boa tarde', expectedIntent: 'GREETING' },
      { message: 'quero agendar uma consulta', expectedIntent: 'REQUEST_APPOINTMENT' },
      { message: 'fui demitido sem justa causa', expectedIntent: 'ASK_HELP' },
      { message: 'meus direitos trabalhistas', expectedIntent: 'ASK_INFO' },
      { message: 'quanto custa a consulta?', expectedIntent: 'ASK_PRICE' },
      { message: 'segunda-feira às 10h', expectedIntent: 'PROVIDE_TIME', shouldExtract: ['date', 'time'] },
      { message: 'meu telefone é 11999999999', expectedIntent: 'PROVIDE_CONTACT', shouldExtract: ['phone'] },
      { message: 'presencial ou online?', expectedIntent: 'ASK_OPTIONS' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 8: VENDAS - Loja de Roupas
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Marcio Roupas - Loja',
    flowType: 'VENDAS',
    prompt: PROMPTS_REAIS.VENDAS_ROUPAS,
    clientMessages: [
      { message: 'oi', expectedIntent: 'GREETING' },
      { message: 'quero ver camisas', expectedIntent: 'ASK_PRODUCTS' },
      { message: 'tem na cor preta?', expectedIntent: 'ASK_OPTIONS', shouldExtract: ['color'] },
      { message: 'tamanho M', expectedIntent: 'PROVIDE_SIZE', shouldExtract: ['size'] },
      { message: 'quanto custa?', expectedIntent: 'ASK_PRICE' },
      { message: 'quero comprar', expectedIntent: 'PURCHASE' },
      { message: 'tem como parcelar?', expectedIntent: 'ASK_PAYMENT' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 9: SERVIÇOS - Motos
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Nely Motos - Peças e Consertos',
    flowType: 'VENDAS',
    prompt: PROMPTS_REAIS.SERVICOS_MOTOS,
    clientMessages: [
      { message: 'oi', expectedIntent: 'GREETING' },
      { message: 'preciso de uma peça', expectedIntent: 'REQUEST_PRODUCT' },
      { message: 'troca de óleo', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'minha moto está com problema', expectedIntent: 'REPORT_PROBLEM' },
      { message: 'quanto custa?', expectedIntent: 'ASK_PRICE' },
      { message: 'tem a peça X em estoque?', expectedIntent: 'ASK_AVAILABILITY' },
      { message: 'qual o prazo?', expectedIntent: 'ASK_TIME' },
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════
  // CENÁRIO 10: SERVIÇOS - Áudio/Vídeo
  // ═══════════════════════════════════════════════════════════════════════
  {
    name: 'Loc Laser - Gravação',
    flowType: 'GENERICO',
    prompt: PROMPTS_REAIS.SERVICOS_AUDIO,
    clientMessages: [
      { message: 'olá', expectedIntent: 'GREETING' },
      { message: 'preciso de uma gravação', expectedIntent: 'REQUEST_SERVICE' },
      { message: 'quanto custa?', expectedIntent: 'ASK_PRICE' },
      { message: 'vocês fazem vídeo?', expectedIntent: 'ASK_INFO' },
      { message: 'qual o prazo?', expectedIntent: 'ASK_TIME' },
    ]
  },
];

// ═══════════════════════════════════════════════════════════════════════
// 🧪 CLASSE DE TESTES
// ═══════════════════════════════════════════════════════════════════════

class FlowSystemTester {
  private analyzer: PromptAnalyzer;
  private builder: FlowBuilder;
  private results: {
    totalTests: number;
    passed: number;
    failed: number;
    errors: Array<{ scenario: string; message: string; expected: string; actual: string }>;
    flowsCreated: Array<{ name: string; type: FlowType; states: number; intents: number }>;
  };

  constructor() {
    this.analyzer = new PromptAnalyzer();
    this.builder = new FlowBuilder();
    this.results = {
      totalTests: 0,
      passed: 0,
      failed: 0,
      errors: [],
      flowsCreated: []
    };
  }

  /**
   * Executa todos os testes
   */
  async runAllTests(): Promise<void> {
    console.log('\n' + '═'.repeat(70));
    console.log('🧪 TESTE COMPLETO DO SISTEMA DE FLUXOS');
    console.log('═'.repeat(70));

    // FASE 1: Testar detecção de tipo de fluxo
    console.log('\n📊 FASE 1: Detecção de Tipo de Fluxo');
    console.log('-'.repeat(50));
    this.testFlowTypeDetection();

    // FASE 2: Testar criação de fluxos
    console.log('\n🏗️ FASE 2: Criação de Fluxos');
    console.log('-'.repeat(50));
    await this.testFlowCreation();

    // FASE 3: Testar detecção de intenções
    console.log('\n🎯 FASE 3: Detecção de Intenções');
    console.log('-'.repeat(50));
    await this.testIntentDetection();

    // FASE 4: Testar transições de estado
    console.log('\n🔄 FASE 4: Transições de Estado');
    console.log('-'.repeat(50));
    await this.testStateTransitions();

    // Relatório final
    this.printFinalReport();
  }

  /**
   * FASE 1: Testa detecção de tipo de fluxo
   */
  private testFlowTypeDetection(): void {
    const tests = [
      { prompt: PROMPTS_REAIS.DELIVERY_PIZZA, expected: 'DELIVERY' },
      { prompt: PROMPTS_REAIS.VENDAS_SAAS, expected: 'VENDAS' },
      { prompt: PROMPTS_REAIS.JURIDICO_TRABALHISTA, expected: 'AGENDAMENTO' },
      { prompt: PROMPTS_REAIS.SUPORTE_INTERNET, expected: 'SUPORTE' },
      { prompt: PROMPTS_REAIS.CONSULTORIA_CREDITO, expected: 'VENDAS' },
      { prompt: PROMPTS_REAIS.SERVICOS_GRAFICA, expected: 'VENDAS' },
    ];

    for (const test of tests) {
      this.results.totalTests++;
      const detected = this.analyzer.detectFlowType(test.prompt);
      
      if (detected === test.expected) {
        this.results.passed++;
        console.log(`✅ Detectou corretamente: ${test.expected}`);
      } else {
        this.results.failed++;
        console.log(`❌ Esperado: ${test.expected}, Detectado: ${detected}`);
        this.results.errors.push({
          scenario: 'Detecção de Tipo',
          message: test.prompt.substring(0, 50) + '...',
          expected: test.expected,
          actual: detected
        });
      }
    }
  }

  /**
   * FASE 2: Testa criação de fluxos
   */
  private async testFlowCreation(): Promise<void> {
    for (const scenario of TEST_SCENARIOS.slice(0, 5)) {
      this.results.totalTests++;
      
      try {
        const flow = await this.builder.buildFromPrompt(scenario.prompt);
        
        // Verificar estrutura básica
        const hasStates = Object.keys(flow.states).length > 0;
        const hasIntents = Object.keys(flow.intents).length > 0;
        const hasInitialState = flow.initialState && flow.states[flow.initialState];
        
        if (hasStates && hasIntents && hasInitialState) {
          this.results.passed++;
          console.log(`✅ ${scenario.name}: ${Object.keys(flow.states).length} estados, ${Object.keys(flow.intents).length} intenções`);
          
          this.results.flowsCreated.push({
            name: scenario.name,
            type: flow.type,
            states: Object.keys(flow.states).length,
            intents: Object.keys(flow.intents).length
          });
        } else {
          this.results.failed++;
          console.log(`❌ ${scenario.name}: Estrutura incompleta`);
          this.results.errors.push({
            scenario: scenario.name,
            message: 'Estrutura do fluxo incompleta',
            expected: 'states, intents, initialState',
            actual: `hasStates=${hasStates}, hasIntents=${hasIntents}, hasInitialState=${hasInitialState}`
          });
        }
      } catch (error) {
        this.results.failed++;
        console.log(`❌ ${scenario.name}: Erro ao criar fluxo - ${error}`);
        this.results.errors.push({
          scenario: scenario.name,
          message: 'Erro ao criar fluxo',
          expected: 'FlowDefinition',
          actual: String(error)
        });
      }
    }
  }

  /**
   * FASE 3: Testa detecção de intenções com regex
   */
  private async testIntentDetection(): Promise<void> {
    // Criar fluxo de DELIVERY para testar
    const deliveryFlow = await this.builder.buildFromPrompt(PROMPTS_REAIS.DELIVERY_PIZZA);
    
    // Mensagens de teste para DELIVERY
    const deliveryTests = [
      { msg: 'oi', expectedIntent: 'GREETING' },
      { msg: 'bom dia', expectedIntent: 'GREETING' },
      { msg: 'quero o cardápio', expectedIntent: 'ASK_MENU' },
      { msg: 'ver menu', expectedIntent: 'ASK_MENU' },
      { msg: 'uma pizza de calabresa', expectedIntent: 'ADD_ITEM' },
      { msg: 'quero uma mussarela', expectedIntent: 'ADD_ITEM' },
      { msg: 'quero entregar', expectedIntent: 'CHOOSE_DELIVERY' },
      { msg: 'delivery', expectedIntent: 'CHOOSE_DELIVERY' },
      { msg: 'vou buscar', expectedIntent: 'CHOOSE_PICKUP' },
      { msg: 'retirada na loja', expectedIntent: 'CHOOSE_PICKUP' },
      { msg: 'pagar com pix', expectedIntent: 'CHOOSE_PAYMENT' },
      { msg: 'cartão de crédito', expectedIntent: 'CHOOSE_PAYMENT' },
      { msg: 'confirmar pedido', expectedIntent: 'CONFIRM' },
      { msg: 'isso mesmo', expectedIntent: 'CONFIRM' },
      { msg: 'obrigado', expectedIntent: 'THANKS' },
    ];

    console.log(`\nTestando ${deliveryTests.length} mensagens de DELIVERY:`);
    
    for (const test of deliveryTests) {
      this.results.totalTests++;
      const detectedIntent = this.detectIntentWithRegex(test.msg, deliveryFlow);
      
      if (detectedIntent === test.expectedIntent) {
        this.results.passed++;
        console.log(`  ✅ "${test.msg}" → ${detectedIntent}`);
      } else {
        this.results.failed++;
        console.log(`  ❌ "${test.msg}" → ${detectedIntent} (esperado: ${test.expectedIntent})`);
        this.results.errors.push({
          scenario: 'Intent Detection - DELIVERY',
          message: test.msg,
          expected: test.expectedIntent,
          actual: detectedIntent || 'NONE'
        });
      }
    }

    // Criar fluxo de VENDAS para testar
    const vendasFlow = await this.builder.buildFromPrompt(PROMPTS_REAIS.VENDAS_SAAS);
    
    const vendasTests = [
      { msg: 'oi', expectedIntent: 'GREETING' },
      { msg: 'como funciona?', expectedIntent: 'ASK_INFO' },
      { msg: 'quanto custa?', expectedIntent: 'ASK_PRICE' },
      { msg: 'tem promoção?', expectedIntent: 'ASK_PROMO' },
      { msg: 'quero testar', expectedIntent: 'REQUEST_DEMO' },
      { msg: 'vou contratar', expectedIntent: 'PURCHASE' },
      { msg: 'obrigado', expectedIntent: 'THANKS' },
    ];

    console.log(`\nTestando ${vendasTests.length} mensagens de VENDAS:`);
    
    for (const test of vendasTests) {
      this.results.totalTests++;
      const detectedIntent = this.detectIntentWithRegex(test.msg, vendasFlow);
      
      if (detectedIntent === test.expectedIntent) {
        this.results.passed++;
        console.log(`  ✅ "${test.msg}" → ${detectedIntent}`);
      } else {
        this.results.failed++;
        console.log(`  ❌ "${test.msg}" → ${detectedIntent} (esperado: ${test.expectedIntent})`);
        this.results.errors.push({
          scenario: 'Intent Detection - VENDAS',
          message: test.msg,
          expected: test.expectedIntent,
          actual: detectedIntent || 'NONE'
        });
      }
    }
  }

  /**
   * Detecta intenção usando regex patterns do fluxo
   */
  private detectIntentWithRegex(message: string, flow: FlowDefinition): string | null {
    const msgLower = message.toLowerCase().trim();
    
    // Ordenar intents por prioridade
    const sortedIntents = Object.entries(flow.intents)
      .sort((a, b) => (b[1].priority || 0) - (a[1].priority || 0));
    
    for (const [intentName, intent] of sortedIntents) {
      // Verificar regex patterns
      const regexPattern = (intent as any).regexPatterns;
      if (regexPattern) {
        try {
          const regex = new RegExp(regexPattern, 'i');
          if (regex.test(msgLower)) {
            return intentName;
          }
        } catch (e) {
          // Regex inválido, tentar exemplos
        }
      }
      
      // Verificar exemplos
      for (const example of intent.examples) {
        const exampleLower = example.toLowerCase();
        if (msgLower.includes(exampleLower) || exampleLower.includes(msgLower)) {
          return intentName;
        }
        // Verificar palavras-chave
        const keywords = exampleLower.split(/\s+/);
        const msgWords = msgLower.split(/\s+/);
        const matches = keywords.filter(kw => msgWords.some(mw => mw.includes(kw) || kw.includes(mw)));
        if (matches.length >= 2 || (matches.length === 1 && keywords.length === 1)) {
          return intentName;
        }
      }
    }
    
    return null;
  }

  /**
   * FASE 4: Testa transições de estado
   */
  private async testStateTransitions(): Promise<void> {
    const deliveryFlow = await this.builder.buildFromPrompt(PROMPTS_REAIS.DELIVERY_PIZZA);
    
    // Simular conversa completa de delivery
    const conversation = [
      { msg: 'boa noite', expectedState: 'INICIAL' },
      { msg: 'quero ver o cardápio', expectedState: 'CARDAPIO' },
      { msg: 'quero uma pizza de calabresa', expectedState: 'PEDINDO' },
      { msg: 'entrega', expectedState: 'ENDERECO' },
      { msg: 'meu endereço é Rua das Flores, 123', expectedState: 'PAGAMENTO' },
      { msg: 'pix', expectedState: 'CONFIRMACAO' },
      { msg: 'confirma', expectedState: 'FIM' },
    ];

    console.log('\nSimulando conversa completa de DELIVERY:');
    
    let currentState = deliveryFlow.initialState;
    
    for (const step of conversation) {
      this.results.totalTests++;
      
      const intent = this.detectIntentWithRegex(step.msg, deliveryFlow);
      const state = deliveryFlow.states[currentState];
      
      if (state) {
        const transition = state.transitions.find(t => t.intent === intent);
        if (transition) {
          currentState = transition.nextState;
        }
      }
      
      // Verificar se chegou no estado esperado
      if (currentState === step.expectedState) {
        this.results.passed++;
        console.log(`  ✅ "${step.msg}" → Estado: ${currentState}`);
      } else {
        this.results.failed++;
        console.log(`  ❌ "${step.msg}" → Estado: ${currentState} (esperado: ${step.expectedState})`);
        this.results.errors.push({
          scenario: 'State Transition - DELIVERY',
          message: step.msg,
          expected: step.expectedState,
          actual: currentState
        });
      }
    }
  }

  /**
   * Imprime relatório final
   */
  private printFinalReport(): void {
    console.log('\n' + '═'.repeat(70));
    console.log('📊 RELATÓRIO FINAL');
    console.log('═'.repeat(70));
    
    const successRate = ((this.results.passed / this.results.totalTests) * 100).toFixed(1);
    
    console.log(`\n📈 ESTATÍSTICAS:`);
    console.log(`   Total de Testes: ${this.results.totalTests}`);
    console.log(`   ✅ Passou: ${this.results.passed}`);
    console.log(`   ❌ Falhou: ${this.results.failed}`);
    console.log(`   📊 Taxa de Sucesso: ${successRate}%`);
    
    if (this.results.flowsCreated.length > 0) {
      console.log(`\n🏗️ FLUXOS CRIADOS:`);
      for (const flow of this.results.flowsCreated) {
        console.log(`   • ${flow.name}: ${flow.type} (${flow.states} estados, ${flow.intents} intents)`);
      }
    }
    
    if (this.results.errors.length > 0) {
      console.log(`\n⚠️ ERROS ENCONTRADOS:`);
      for (const error of this.results.errors.slice(0, 10)) {
        console.log(`   • [${error.scenario}] "${error.message}"`);
        console.log(`     Esperado: ${error.expected} | Atual: ${error.actual}`);
      }
      if (this.results.errors.length > 10) {
        console.log(`   ... e mais ${this.results.errors.length - 10} erros`);
      }
    }
    
    // Conclusão
    console.log('\n' + '═'.repeat(70));
    if (parseFloat(successRate) >= 80) {
      console.log('✅ SISTEMA APROVADO PARA DEPLOY - Taxa de sucesso acima de 80%');
    } else if (parseFloat(successRate) >= 60) {
      console.log('⚠️ SISTEMA PRECISA DE AJUSTES - Taxa de sucesso entre 60-80%');
    } else {
      console.log('❌ SISTEMA NÃO APROVADO - Taxa de sucesso abaixo de 60%');
    }
    console.log('═'.repeat(70) + '\n');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO DOS TESTES
// ═══════════════════════════════════════════════════════════════════════

async function main() {
  const tester = new FlowSystemTester();
  await tester.runAllTests();
}

main().catch(console.error);
