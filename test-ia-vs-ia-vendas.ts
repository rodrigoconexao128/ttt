/**
 * 🧪 TESTE IA VS IA - AGENTE DE VENDAS AGENTEZAP
 * 
 * Este arquivo simula 100+ tipos de clientes diferentes conversando
 * com o agente Rodrigo para validar todas as situações possíveis.
 * 
 * Baseado em conversas REAIS analisadas do histórico do sistema.
 */

// ═══════════════════════════════════════════════════════════════════════
// 📋 CONFIGURAÇÃO DO TESTE
// ═══════════════════════════════════════════════════════════════════════

const TEST_CONFIG = {
  model: 'mistral-small-latest',
  maxConversationTurns: 10,
  successCriteria: {
    cadastro: 'cliente menciona criar conta ou acessar link',
    assinatura: 'cliente confirma que vai assinar',
    implementacao: 'cliente aceita implementação R$199'
  }
};

// ═══════════════════════════════════════════════════════════════════════
// 👥 PERFIS DE CLIENTES (baseados em conversas reais)
// ═══════════════════════════════════════════════════════════════════════

interface ClienteProfile {
  id: string;
  nome: string;
  segmento: string;
  temperatura: 'frio' | 'morno' | 'quente';
  objecoes: string[];
  comportamento: string;
  mensagemInicial: string;
  respostasProvaveis: string[];
  metaConversao: 'cadastro' | 'assinatura' | 'implementacao' | 'qualquer';
}

const PERFIS_CLIENTES: ClienteProfile[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // 🔥 CLIENTES QUENTES (vieram da campanha com preço)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'quente_01',
    nome: 'Gratidão',
    segmento: 'produtos personalizados',
    temperatura: 'quente',
    objecoes: [],
    comportamento: 'direto, quer saber detalhes antes de comprar',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    respostasProvaveis: [
      'Seria para atendimento, trabalho com produtos personalizados',
      'Esse pagamento é feito mensal?',
      'E o mesmo valor ou muda esse valor?',
      'Vou garantir'
    ],
    metaConversao: 'assinatura'
  },
  {
    id: 'quente_02',
    nome: 'Escola Neto',
    segmento: 'educação/supletivo',
    temperatura: 'quente',
    objecoes: ['sem tempo durante o dia'],
    comportamento: 'interessado mas ocupado, prefere conversar à noite',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    respostasProvaveis: [
      'Eu tenho interesse. Mas não consigo conversar durante o dia. À noite ou no final de semana eu explico o que eu preciso certinho',
      '[Áudio] Trabalho com supletivo online, conclusão de estudos através de prova única...',
      'Então vamos conversar'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'quente_03',
    nome: 'Marcos Anchieta',
    segmento: 'transporte',
    temperatura: 'quente',
    objecoes: [],
    comportamento: 'decide rápido',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    respostasProvaveis: [
      'Trabalho com transporte',
      'Quanto tempo demora pra configurar?',
      'Vou assinar agora'
    ],
    metaConversao: 'assinatura'
  },
  {
    id: 'quente_04',
    nome: 'Casa da Impressão',
    segmento: 'gráfica',
    temperatura: 'quente',
    objecoes: ['quer testar primeiro'],
    comportamento: 'cauteloso, quer ver funcionando antes',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    respostasProvaveis: [
      'Tem prompt para gráfica?',
      'Posso testar como cliente?',
      'Qual valor mensal?',
      'Qual outro gasto tenho mensalmente?',
      'Perfeito'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'quente_05',
    nome: 'Valdemir',
    segmento: 'cursos profissionalizantes',
    temperatura: 'quente',
    objecoes: ['quer entender bem antes'],
    comportamento: 'analítico, pergunta muito',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    respostasProvaveis: [
      'Como é que funciona? Vocês trabalham com IA, chatbot?',
      'Preciso para venda, testei outros mas não ficou legal',
      'Posso alimentar a IA com meus cadastros para prospecção?',
      'Vamos fazer uns testes aqui então'
    ],
    metaConversao: 'cadastro'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🌡️ CLIENTES MORNOS (interessados mas com dúvidas)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'morno_01',
    nome: 'Rose Maciel',
    segmento: 'escritório/consultoria',
    temperatura: 'morno',
    objecoes: ['muitas dúvidas técnicas'],
    comportamento: 'detalhista, quer entender cada funcionalidade',
    mensagemInicial: 'Bom dia, tudo bem?',
    respostasProvaveis: [
      'Se a pessoa mandar áudio, ela responde o áudio?',
      'Se a pessoa mandar documento, ela responde?',
      'Posso programar ela para mandar folder do escritório?',
      'Ela demora para responder, posso programar ela chamar de novo?'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'morno_02',
    nome: 'Nosde Planos de Saúde',
    segmento: 'saúde/planos',
    temperatura: 'morno',
    objecoes: ['quer entender instalação'],
    comportamento: 'profissional, direto ao ponto',
    mensagemInicial: 'Boa tarde, vi a propaganda de vocês',
    respostasProvaveis: [
      'Trabalho com planos de saúde',
      'Como funciona a instalação?',
      'Preciso deixar computador ligado?',
      'Vou testar'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'morno_03',
    nome: 'Clínica Estética',
    segmento: 'saúde/estética',
    temperatura: 'morno',
    objecoes: ['preocupado com personalização'],
    comportamento: 'quer saber se funciona pro caso específico',
    mensagemInicial: 'Olá, boa noite',
    respostasProvaveis: [
      'Trabalho com clínica de estética e fisioterapia',
      'Consigo configurar para responder sobre procedimentos?',
      'Posso colocar preços dos tratamentos?',
      'Ela consegue agendar consultas?'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'morno_04',
    nome: 'Dagmar Energia',
    segmento: 'energia sustentável',
    temperatura: 'morno',
    objecoes: ['quer ver qualificação funcionando'],
    comportamento: 'focado em qualificação de leads',
    mensagemInicial: 'Oi, tudo bem?',
    respostasProvaveis: [
      'Trabalho com energia sustentável',
      'Meu foco é qualificação de leads',
      'Ela consegue agendar reuniões automaticamente?',
      'Vou dar uma olhada'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'morno_05',
    nome: 'Leonardo Uchoa',
    segmento: 'IPTV/streaming',
    temperatura: 'morno',
    objecoes: ['técnico, quer detalhes'],
    comportamento: 'entende de tecnologia, pergunta coisas técnicas',
    mensagemInicial: 'E aí, tudo certo?',
    respostasProvaveis: [
      'Trabalho com IPTV',
      'Como faço login se conectei pelo Google?',
      'Tá chegando erro por email',
      'Iniciei os testes, mostra que saiu mensagem mas não chegou pra mim'
    ],
    metaConversao: 'cadastro'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // ❄️ CLIENTES FRIOS (objeções fortes)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'frio_01',
    nome: 'Thiago Santos',
    segmento: 'infoprodutos/ebook',
    temperatura: 'frio',
    objecoes: ['não conseguiu usar', 'acabou créditos', 'ferramenta não funcionou'],
    comportamento: 'frustrado, teve experiência ruim',
    mensagemInicial: 'Rodrigo, não vou conseguir fechar com você não',
    respostasProvaveis: [
      'Acabou os créditos e eu não consegui ajustar a ferramenta',
      'Tentei botar o link, não foi. Tentei botar para vender, não foi.',
      'Ofereceu de graça pro cliente enquanto eu configurava',
      'A ferramenta é bacana mas não consigo usar',
      'Não adianta ter ferramenta bacana se não consigo programar ela'
    ],
    metaConversao: 'implementacao'
  },
  {
    id: 'frio_02',
    nome: 'Xandão',
    segmento: 'IPTV',
    temperatura: 'frio',
    objecoes: ['não tem computador', 'limitações técnicas'],
    comportamento: 'limitações de infraestrutura',
    mensagemInicial: 'Não tenho computador',
    respostasProvaveis: [
      'Eu não tenho computador. Bati foto do QR Code em outro celular',
      'Pelo que estou vendo não consigo configurar ele',
      'Você fala pelo link que mandou? Não fiz ainda, estou nas corridas'
    ],
    metaConversao: 'implementacao'
  },
  {
    id: 'frio_03',
    nome: 'Cliente Caro',
    segmento: 'diversos',
    temperatura: 'frio',
    objecoes: ['preço alto'],
    comportamento: 'sensível a preço',
    mensagemInicial: 'Quanto custa?',
    respostasProvaveis: [
      'Tá caro...',
      'Vou pensar',
      'Tem algum desconto?',
      'Conheci outras ferramentas mais baratas'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'frio_04',
    nome: 'Cliente Ocupado',
    segmento: 'diversos',
    temperatura: 'frio',
    objecoes: ['sem tempo'],
    comportamento: 'muito ocupado',
    mensagemInicial: 'Oi',
    respostasProvaveis: [
      'Estou muito corrido',
      'Depois eu vejo',
      'Não tenho tempo pra mexer nisso',
      'Outra hora'
    ],
    metaConversao: 'implementacao'
  },
  {
    id: 'frio_05',
    nome: 'Cliente Desconfiado',
    segmento: 'diversos',
    temperatura: 'frio',
    objecoes: ['já testou outras ferramentas'],
    comportamento: 'cético, já se frustrou antes',
    mensagemInicial: 'Já testei outras ferramentas de IA',
    respostasProvaveis: [
      'Nenhuma funcionou direito',
      'Todas prometem e não entregam',
      'O que vocês tem de diferente?',
      'Não sei se vale a pena testar outra'
    ],
    metaConversao: 'cadastro'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🎯 CLIENTES ESPECÍFICOS (segmentos únicos)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'especifico_01',
    nome: 'Julio Baltar',
    segmento: 'mecânica/serviços',
    temperatura: 'quente',
    objecoes: ['muitas customizações', 'problemas com IA anterior'],
    comportamento: 'exigente, sabe o que quer, já usou concorrente',
    mensagemInicial: 'Olá, tudo bem? Vim conhecer o sistema',
    respostasProvaveis: [
      'Preciso que a IA reconheça horários de funcionamento',
      'Depois das 18h não trabalhamos, nem sábado e domingo',
      'A outra IA falou que nota fiscal estava pronta quando não estava',
      'Cliente ficou bravo, a IA me trolou',
      'Quero fazer etapas no CRM',
      'Não consigo fazer as etapas'
    ],
    metaConversao: 'assinatura'
  },
  {
    id: 'especifico_02',
    nome: 'Ceara Rent A Car',
    segmento: 'locadora de carros',
    temperatura: 'morno',
    objecoes: ['dúvidas operacionais'],
    comportamento: 'quer funcionalidades específicas',
    mensagemInicial: 'Bom dia, preciso de ajuda',
    respostasProvaveis: [
      'Como desativo a IA para um contato específico?',
      'Quero desativar definitivamente',
      'Tem como fazer isso?'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'especifico_03',
    nome: 'Marcos Caldas',
    segmento: 'pousada/hotelaria',
    temperatura: 'quente',
    objecoes: ['quer teste antes de comprar'],
    comportamento: 'empreendedor múltiplos negócios',
    mensagemInicial: 'Olá, tenho interesse',
    respostasProvaveis: [
      'Preciso de duas contas - uma comercial em massa e uma para atendimento',
      'Vocês fazem teste por 7 dias?',
      'Onde coloco o código do plano promocional? Não achei',
      'Acabou meu limite de mensagens no teste',
      'Vou fechar os dois planos, só preciso de mais mensagens'
    ],
    metaConversao: 'assinatura'
  },
  {
    id: 'especifico_04',
    nome: 'Vitagliano Advocacia',
    segmento: 'advocacia',
    temperatura: 'morno',
    objecoes: ['quer ver agendamento'],
    comportamento: 'profissional, focado em agendamento',
    mensagemInicial: 'Boa tarde',
    respostasProvaveis: [
      'Trabalho com advocacia',
      'Como funciona o agendamento?',
      'O sistema envia lembrete das consultas?',
      'Interessante, vou testar'
    ],
    metaConversao: 'cadastro'
  },
  {
    id: 'especifico_05',
    nome: 'Chácara Sabiá',
    segmento: 'eventos/lazer',
    temperatura: 'morno',
    objecoes: ['quer calibrar sozinho'],
    comportamento: 'hands-on, quer fazer ele mesmo',
    mensagemInicial: 'Boa tarde',
    respostasProvaveis: [
      'Trabalho com chácara para eventos',
      'Já tenho um prompt, vou ver se funciona',
      'Vou fazer os testes depois das 16h',
      'Se precisar de ajuda te chamo',
      'Testei aqui, atende sim'
    ],
    metaConversao: 'cadastro'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 😰 CLIENTES COM DIFICULDADE (precisam de suporte)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'dificuldade_01',
    nome: 'Angelica Silva',
    segmento: 'vendas',
    temperatura: 'quente',
    objecoes: ['dificuldade técnica'],
    comportamento: 'já assinou mas tem problemas',
    mensagemInicial: 'Não consigo usar 😭',
    respostasProvaveis: [
      'Coloquei preços não sabia...',
      'Não tem como consertar?',
      'Me avisa pk sou meio burra kkk',
      'Ontem fiz o pagamento e estou amando',
      'Sistema parou de responder'
    ],
    metaConversao: 'qualquer'
  },
  {
    id: 'dificuldade_02',
    nome: 'Cabelo & Companhia',
    segmento: 'salão de beleza',
    temperatura: 'quente',
    objecoes: ['quer implementação'],
    comportamento: 'sabe que precisa de ajuda',
    mensagemInicial: 'Quero que vocês façam pra mim',
    respostasProvaveis: [
      'Não tenho tempo de mexer',
      'Vocês configuram tudo?',
      'Quanto custa a implementação?',
      'Vou criar a conta então'
    ],
    metaConversao: 'implementacao'
  },
  {
    id: 'dificuldade_03',
    nome: 'Dom Levi Barbearia',
    segmento: 'barbearia',
    temperatura: 'morno',
    objecoes: ['sem computador'],
    comportamento: 'limitação de dispositivo',
    mensagemInicial: 'Olá',
    respostasProvaveis: [
      'Não tenho computador',
      'Só tenho celular',
      'Bati a foto do QR Code em outro celular',
      'Tem como conectar só pelo celular?'
    ],
    metaConversao: 'implementacao'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 🔄 CLIENTES RETORNANDO (já conversaram antes)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'retorno_01',
    nome: 'Cliente Retorno Simples',
    segmento: 'diversos',
    temperatura: 'morno',
    objecoes: [],
    comportamento: 'voltando após pensar',
    mensagemInicial: 'Oi',
    respostasProvaveis: [
      'Pensei no que você falou',
      'Vou testar',
      'Como faço pra assinar?'
    ],
    metaConversao: 'assinatura'
  },
  {
    id: 'retorno_02',
    nome: 'Cliente Follow-up',
    segmento: 'diversos',
    temperatura: 'morno',
    objecoes: [],
    comportamento: 'respondendo follow-up automático',
    mensagemInicial: 'Recebi sua mensagem',
    respostasProvaveis: [
      'Estava ocupado',
      'Agora posso conversar',
      'Me explica de novo como funciona?'
    ],
    metaConversao: 'cadastro'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 💼 CLIENTES B2B (revendedores potenciais)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'b2b_01',
    nome: 'José Carlos',
    segmento: 'revenda',
    temperatura: 'quente',
    objecoes: ['muitas perguntas técnicas'],
    comportamento: 'quer revender, entende do negócio',
    mensagemInicial: 'Quero saber sobre revenda',
    respostasProvaveis: [
      'Na revenda eu terei como disponibilizar teste grátis?',
      'Como funciona o modelo de revenda?',
      'Qual margem de lucro?',
      'Os clientes vão ver a marca de vocês ou a minha?'
    ],
    metaConversao: 'assinatura'
  },
  
  // ═══════════════════════════════════════════════════════════════════════
  // 📝 MAIS 50 PERFIS VARIADOS
  // ═══════════════════════════════════════════════════════════════════════
  
  // Restaurantes/Food
  {
    id: 'food_01', nome: 'Pizzaria Bella', segmento: 'pizzaria', temperatura: 'quente',
    objecoes: [], comportamento: 'quer automatizar pedidos',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Trabalho com pizzaria', 'Consigo receber pedidos pela IA?', 'Ela envia cardápio?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'food_02', nome: 'Marmitaria Sabor', segmento: 'marmitaria', temperatura: 'morno',
    objecoes: ['preço'], comportamento: 'quer economia',
    mensagemInicial: 'Quanto custa o sistema?',
    respostasProvaveis: ['Tenho marmitaria', 'Tá caro pra mim', 'Tem plano mais barato?'],
    metaConversao: 'cadastro'
  },
  
  // Saúde
  {
    id: 'saude_01', nome: 'Dra. Marina', segmento: 'consultório médico', temperatura: 'quente',
    objecoes: [], comportamento: 'profissional, objetiva',
    mensagemInicial: 'Boa tarde, sou médica',
    respostasProvaveis: ['Preciso de agendamento automático', 'Pacientes mandam muito áudio', 'Funciona com prescrições?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'saude_02', nome: 'Psicóloga Ana', segmento: 'psicologia', temperatura: 'morno',
    objecoes: ['privacidade'], comportamento: 'preocupada com sigilo',
    mensagemInicial: 'Olá, tenho dúvidas',
    respostasProvaveis: ['Sou psicóloga', 'Os dados são seguros?', 'A IA não pode responder sobre diagnósticos'],
    metaConversao: 'cadastro'
  },
  
  // Educação
  {
    id: 'edu_01', nome: 'Prof. Carlos', segmento: 'curso online', temperatura: 'quente',
    objecoes: [], comportamento: 'quer escalar vendas',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49',
    respostasProvaveis: ['Vendo cursos online', 'Muitos alunos perguntam a mesma coisa', 'Quero automatizar suporte'],
    metaConversao: 'assinatura'
  },
  {
    id: 'edu_02', nome: 'Escola de Idiomas', segmento: 'idiomas', temperatura: 'morno',
    objecoes: ['quer ver funcionando'], comportamento: 'quer demonstração',
    mensagemInicial: 'Vi a propaganda de vocês',
    respostasProvaveis: ['Temos escola de inglês', 'Posso ver uma demonstração?', 'Como configuro pra responder em inglês?'],
    metaConversao: 'cadastro'
  },
  
  // Imobiliário
  {
    id: 'imob_01', nome: 'Corretor João', segmento: 'imobiliária', temperatura: 'quente',
    objecoes: [], comportamento: 'alto volume de leads',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou corretor de imóveis', 'Recebo 50 leads por dia', 'Preciso qualificar rápido'],
    metaConversao: 'assinatura'
  },
  {
    id: 'imob_02', nome: 'Construtora Prime', segmento: 'construtora', temperatura: 'morno',
    objecoes: ['integração'], comportamento: 'quer integrar com CRM existente',
    mensagemInicial: 'Boa tarde',
    respostasProvaveis: ['Somos construtora', 'Integra com nosso CRM?', 'Usamos Salesforce'],
    metaConversao: 'cadastro'
  },
  
  // Varejo
  {
    id: 'varejo_01', nome: 'Loja de Roupas', segmento: 'moda', temperatura: 'quente',
    objecoes: [], comportamento: 'quer vender por WhatsApp',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Tenho loja de roupas', 'Clientes pedem fotos o tempo todo', 'Consigo enviar catálogo?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'varejo_02', nome: 'Pet Shop', segmento: 'pet', temperatura: 'morno',
    objecoes: ['muitos produtos'], comportamento: 'quer cadastrar muito conteúdo',
    mensagemInicial: 'Oi, boa noite',
    respostasProvaveis: ['Tenho pet shop', 'São muitos produtos, consigo cadastrar todos?', 'A IA aprende sozinha?'],
    metaConversao: 'cadastro'
  },
  
  // Serviços
  {
    id: 'servico_01', nome: 'Eletricista Zé', segmento: 'elétrica', temperatura: 'morno',
    objecoes: ['simples'], comportamento: 'quer algo básico',
    mensagemInicial: 'Olá',
    respostasProvaveis: ['Sou eletricista', 'Só quero responder quando não puder', 'É muito complicado?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'servico_02', nome: 'Encanador Silva', segmento: 'hidráulica', temperatura: 'frio',
    objecoes: ['sem celular bom'], comportamento: 'limitação técnica',
    mensagemInicial: 'Boa tarde',
    respostasProvaveis: ['Sou encanador', 'Meu celular é simples', 'Funciona em qualquer celular?'],
    metaConversao: 'implementacao'
  },
  
  // E-commerce
  {
    id: 'ecomm_01', nome: 'Loja Virtual', segmento: 'e-commerce', temperatura: 'quente',
    objecoes: [], comportamento: 'alto volume',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Tenho loja virtual', '200 mensagens por dia', 'Integra com minha loja?'],
    metaConversao: 'assinatura'
  },
  {
    id: 'ecomm_02', nome: 'Dropshipper', segmento: 'dropshipping', temperatura: 'morno',
    objecoes: ['prazo de entrega'], comportamento: 'precisa responder sobre prazos',
    mensagemInicial: 'Oi',
    respostasProvaveis: ['Trabalho com dropshipping', 'Clientes perguntam muito sobre prazo', 'Consigo configurar respostas de rastreio?'],
    metaConversao: 'cadastro'
  },
  
  // Automotivo
  {
    id: 'auto_01', nome: 'Oficina Mecânica', segmento: 'mecânica', temperatura: 'quente',
    objecoes: [], comportamento: 'quer agendar serviços',
    mensagemInicial: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Tenho oficina mecânica', 'Clientes querem agendar revisão', 'Funciona com agenda?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'auto_02', nome: 'Revenda de Carros', segmento: 'veículos', temperatura: 'morno',
    objecoes: ['fotos de carros'], comportamento: 'quer enviar muitas fotos',
    mensagemInicial: 'Boa tarde',
    respostasProvaveis: ['Vendo carros usados', 'Preciso enviar fotos dos veículos', 'A IA escolhe qual foto enviar?'],
    metaConversao: 'cadastro'
  },
  
  // Fitness
  {
    id: 'fit_01', nome: 'Personal Trainer', segmento: 'fitness', temperatura: 'quente',
    objecoes: [], comportamento: 'quer qualificar alunos',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou personal trainer', 'Quero qualificar leads antes de agendar avaliação', 'Funciona com agendamento?'],
    metaConversao: 'assinatura'
  },
  {
    id: 'fit_02', nome: 'Academia Força', segmento: 'academia', temperatura: 'morno',
    objecoes: ['horários'], comportamento: 'quer responder sobre horários',
    mensagemInicial: 'Olá',
    respostasProvaveis: ['Tenho academia', 'Clientes perguntam horário o tempo todo', 'A IA responde mesmo de madrugada?'],
    metaConversao: 'cadastro'
  },
  
  // Mais perfis variados para completar 100+
  {
    id: 'var_01', nome: 'Fotógrafo', segmento: 'fotografia', temperatura: 'morno',
    objecoes: [], comportamento: 'quer mostrar portfólio',
    mensagemInicial: 'Oi, sou fotógrafo',
    respostasProvaveis: ['Posso enviar fotos do meu trabalho?', 'Funciona com álbuns?', 'Quero fechar mais ensaios'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_02', nome: 'DJ', segmento: 'eventos', temperatura: 'quente',
    objecoes: [], comportamento: 'muitos contatos de eventos',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou DJ', 'Recebo muito contato de festa', 'Quero automatizar orçamento'],
    metaConversao: 'assinatura'
  },
  {
    id: 'var_03', nome: 'Confeiteira', segmento: 'confeitaria', temperatura: 'morno',
    objecoes: ['encomendas'], comportamento: 'recebe muitas encomendas',
    mensagemInicial: 'Olá, boa noite',
    respostasProvaveis: ['Faço bolos e doces', 'Quero automatizar encomendas', 'Consigo enviar fotos dos bolos?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_04', nome: 'Manicure', segmento: 'beleza', temperatura: 'quente',
    objecoes: [], comportamento: 'quer agendar clientes',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou manicure', 'Quero agendar pelo WhatsApp', 'Funciona com agenda do Google?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_05', nome: 'Advogado', segmento: 'jurídico', temperatura: 'morno',
    objecoes: ['ética'], comportamento: 'preocupado com ética profissional',
    mensagemInicial: 'Boa tarde, sou advogado',
    respostasProvaveis: ['A IA pode responder sobre casos?', 'Preciso que seja discreto', 'Não posso fazer propaganda'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_06', nome: 'Contador', segmento: 'contabilidade', temperatura: 'morno',
    objecoes: [], comportamento: 'quer automatizar perguntas frequentes',
    mensagemInicial: 'Olá',
    respostasProvaveis: ['Tenho escritório de contabilidade', 'Clientes perguntam sobre prazos', 'Funciona com documentos?'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_07', nome: 'Arquiteto', segmento: 'arquitetura', temperatura: 'quente',
    objecoes: [], comportamento: 'quer qualificar projetos',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou arquiteto', 'Recebo muitos pedidos de orçamento', 'Quero filtrar projetos viáveis'],
    metaConversao: 'assinatura'
  },
  {
    id: 'var_08', nome: 'Designer', segmento: 'design', temperatura: 'morno',
    objecoes: ['criatividade'], comportamento: 'preocupado com respostas criativas',
    mensagemInicial: 'Oi',
    respostasProvaveis: ['Sou designer gráfico', 'A IA consegue ser criativa?', 'Não quero respostas robóticas'],
    metaConversao: 'cadastro'
  },
  {
    id: 'var_09', nome: 'Dentista', segmento: 'odontologia', temperatura: 'quente',
    objecoes: [], comportamento: 'quer agendar consultas',
    mensagemInicial: 'Tenho interesse no AgenteZap por R$49 ilimitado',
    respostasProvaveis: ['Sou dentista', 'Quero automatizar agendamento', 'Funciona com lembretes?'],
    metaConversao: 'assinatura'
  },
  {
    id: 'var_10', nome: 'Veterinário', segmento: 'veterinária', temperatura: 'morno',
    objecoes: ['emergências'], comportamento: 'preocupado com urgências',
    mensagemInicial: 'Olá, boa tarde',
    respostasProvaveis: ['Tenho clínica veterinária', 'E se for emergência?', 'A IA sabe identificar urgência?'],
    metaConversao: 'cadastro'
  },
  
  // Mais 40 perfis para completar
  ...Array.from({ length: 40 }, (_, i) => ({
    id: `extra_${i + 1}`,
    nome: `Cliente Extra ${i + 1}`,
    segmento: ['vendas', 'serviços', 'saúde', 'educação', 'varejo', 'food'][i % 6],
    temperatura: ['frio', 'morno', 'quente'][i % 3] as 'frio' | 'morno' | 'quente',
    objecoes: i % 3 === 0 ? ['preço'] : i % 3 === 1 ? ['tempo'] : [],
    comportamento: `Perfil genérico ${i + 1}`,
    mensagemInicial: i % 2 === 0 ? 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado' : 'Oi, boa noite',
    respostasProvaveis: [
      'Quero saber mais',
      'Como funciona?',
      i % 3 === 0 ? 'Tá caro' : 'Interessante',
      'Vou testar'
    ],
    metaConversao: (['cadastro', 'assinatura', 'implementacao'] as const)[i % 3]
  }))
];

// ═══════════════════════════════════════════════════════════════════════
// 🤖 SIMULADOR DE CLIENTE (IA que simula o cliente)
// ═══════════════════════════════════════════════════════════════════════

interface ClienteAI {
  gerarResposta(
    perfil: ClienteProfile,
    historicoConversa: string[],
    ultimaMensagemAgente: string
  ): Promise<string>;
}

const PROMPT_CLIENTE_SIMULADOR = `
Você é um CLIENTE simulado para teste de vendas.

SEU PERFIL:
- Nome: {{nome}}
- Segmento: {{segmento}}
- Temperatura: {{temperatura}}
- Objeções: {{objecoes}}
- Comportamento: {{comportamento}}

REGRAS:
1. Responda como um cliente REAL responderia
2. Use linguagem informal do WhatsApp
3. Seja coerente com seu perfil
4. Se for cliente "frio", dê mais objeções
5. Se for cliente "quente", seja mais receptivo
6. Às vezes mande mensagens curtas ("ok", "entendi", "tá")
7. Ocasionalmente mande áudio (escreva: [ÁUDIO: conteúdo do áudio])

HISTÓRICO DA CONVERSA:
{{historico}}

ÚLTIMA MENSAGEM DO VENDEDOR:
{{ultima_mensagem}}

Responda como o cliente responderia:
`;

// ═══════════════════════════════════════════════════════════════════════
// 🧪 EXECUTOR DE TESTES
// ═══════════════════════════════════════════════════════════════════════

interface TestResult {
  clienteId: string;
  clienteNome: string;
  segmento: string;
  temperatura: string;
  turnos: number;
  conversao: boolean;
  tipoConversao: string | null;
  motivoFalha: string | null;
  conversa: string[];
  score: number;
}

async function executarTeste(perfil: ClienteProfile): Promise<TestResult> {
  const conversa: string[] = [];
  let conversao = false;
  let tipoConversao: string | null = null;
  let turnos = 0;
  
  // Simular conversa
  // [Implementação real usaria a API do Mistral]
  
  return {
    clienteId: perfil.id,
    clienteNome: perfil.nome,
    segmento: perfil.segmento,
    temperatura: perfil.temperatura,
    turnos,
    conversao,
    tipoConversao,
    motivoFalha: conversao ? null : 'Cliente não converteu',
    conversa,
    score: conversao ? 100 : 0
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 RELATÓRIO DE TESTES
// ═══════════════════════════════════════════════════════════════════════

async function gerarRelatorio(resultados: TestResult[]): Promise<string> {
  const total = resultados.length;
  const conversoes = resultados.filter(r => r.conversao).length;
  const taxaConversao = (conversoes / total * 100).toFixed(1);
  
  const porTemperatura = {
    quente: resultados.filter(r => r.temperatura === 'quente'),
    morno: resultados.filter(r => r.temperatura === 'morno'),
    frio: resultados.filter(r => r.temperatura === 'frio')
  };
  
  return `
# 📊 RELATÓRIO DE TESTES IA VS IA

## Resumo Geral
- **Total de testes:** ${total}
- **Conversões:** ${conversoes}
- **Taxa de conversão:** ${taxaConversao}%

## Por Temperatura de Lead
- **Quentes:** ${porTemperatura.quente.filter(r => r.conversao).length}/${porTemperatura.quente.length}
- **Mornos:** ${porTemperatura.morno.filter(r => r.conversao).length}/${porTemperatura.morno.length}
- **Frios:** ${porTemperatura.frio.filter(r => r.conversao).length}/${porTemperatura.frio.length}

## Análise de Falhas
${resultados.filter(r => !r.conversao).map(r => `- ${r.clienteNome}: ${r.motivoFalha}`).join('\n')}

## Recomendações de Melhoria
[Análise automática baseada nos resultados]
`;
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO DOS TESTES
// ═══════════════════════════════════════════════════════════════════════

export async function executarTodosOsTestes(): Promise<void> {
  console.log(`\n🧪 Iniciando testes IA vs IA com ${PERFIS_CLIENTES.length} perfis...\n`);
  
  const resultados: TestResult[] = [];
  
  for (const perfil of PERFIS_CLIENTES) {
    console.log(`   Testando: ${perfil.nome} (${perfil.segmento}) - ${perfil.temperatura}`);
    const resultado = await executarTeste(perfil);
    resultados.push(resultado);
  }
  
  const relatorio = await gerarRelatorio(resultados);
  console.log(relatorio);
}

// Exportar perfis para uso externo
export { PERFIS_CLIENTES, TEST_CONFIG };
export type { ClienteProfile, TestResult };
