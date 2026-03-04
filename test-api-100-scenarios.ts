/**
 * 🧪 TESTE MASSIVO VIA API - 100 CENÁRIOS DE NEGÓCIO
 * 
 * Testa o admin agent via requisições HTTP ao servidor rodando
 */

const BASE_URL = "http://localhost:5000";
const DELAY_BETWEEN_TESTS = 100;

// ============================================================================
// 100 CENÁRIOS DE NEGÓCIO
// ============================================================================

const BUSINESS_SCENARIOS = [
  // VAREJO (1-15)
  { id: 1, type: "Loja de Roupas", name: "Loja Estilo", agent: "Julia", role: "Vendedora", prompt: "Vende roupas femininas, preços de 50 a 200 reais, horário 9h-18h, aceita pix e cartão" },
  { id: 2, type: "Supermercado", name: "Super Bom", agent: "Carlos", role: "Atendente", prompt: "Delivery de supermercado, entrega em 2h, mínimo R$30, frete grátis acima de R$150" },
  { id: 3, type: "Farmácia", name: "Farma Vida", agent: "Ana", role: "Atendente", prompt: "Farmácia 24h, entrega de medicamentos, aceita receitas pelo WhatsApp" },
  { id: 4, type: "Pet Shop", name: "Pet Amigo", agent: "Beto", role: "Vendedor", prompt: "Banho R$50, tosa R$30, ração a partir de R$80, vacinas com agendamento" },
  { id: 5, type: "Loja de Eletrônicos", name: "Tech Store", agent: "Diego", role: "Consultor", prompt: "Celulares, notebooks, TVs, garantia de 1 ano, parcelamento em 12x" },
  { id: 6, type: "Ótica", name: "Ótica Visão", agent: "Marina", role: "Consultora", prompt: "Óculos de grau e sol, lentes de contato, exame de vista gratuito" },
  { id: 7, type: "Loja de Calçados", name: "Pé Perfeito", agent: "Lucas", role: "Vendedor", prompt: "Sapatos, tênis, chinelos, troca em 30 dias, numeração 33-45" },
  { id: 8, type: "Loja de Cosméticos", name: "Beleza Pura", agent: "Camila", role: "Consultora", prompt: "Maquiagem, skincare, perfumes, marcas importadas e nacionais" },
  { id: 9, type: "Loja de Brinquedos", name: "Mundo Kids", agent: "Rafael", role: "Atendente", prompt: "Brinquedos educativos, jogos, bonecas, carrinhos, faixa etária 0-12 anos" },
  { id: 10, type: "Papelaria", name: "Papel & Cia", agent: "Fernanda", role: "Atendente", prompt: "Material escolar, escritório, impressão, encadernação, xerox" },

  // ALIMENTAÇÃO (11-20)
  { id: 11, type: "Pizzaria", name: "Pizza Express", agent: "Marcos", role: "Atendente", prompt: "Pizzas de 45 a 70 reais, entrega em 40min, refrigerante grátis pedidos acima de R$80" },
  { id: 12, type: "Hamburgueria", name: "Burger House", agent: "Bruno", role: "Atendente", prompt: "Hambúrgueres artesanais, combos de 25 a 45 reais, vegano disponível" },
  { id: 13, type: "Restaurante Japonês", name: "Sushi King", agent: "Yuki", role: "Atendente", prompt: "Sushi, sashimi, temaki, rodízio R$89, delivery mínimo R$50" },
  { id: 14, type: "Padaria", name: "Pão Quente", agent: "Rosa", role: "Atendente", prompt: "Pães frescos, bolos, salgados, café, encomendas para festas" },
  { id: 15, type: "Açaí", name: "Açaí Prime", agent: "Leo", role: "Atendente", prompt: "Açaí de 300ml a 1L, 15 a 35 reais, toppings variados, entrega rápida" },
  { id: 16, type: "Pastelaria", name: "Pastel Show", agent: "João", role: "Atendente", prompt: "Pastéis de 8 a 15 reais, caldos, sucos, 50 sabores, fritura na hora" },
  { id: 17, type: "Marmitaria", name: "Comida Boa", agent: "Maria", role: "Atendente", prompt: "Marmitas de 18 a 25 reais, opção fit, vegana, low carb, entrega almoço" },
  { id: 18, type: "Doceria", name: "Doce Mel", agent: "Paula", role: "Atendente", prompt: "Bolos decorados, doces finos, bem-casados, encomendas 3 dias antes" },
  { id: 19, type: "Cafeteria", name: "Café & Arte", agent: "André", role: "Barista", prompt: "Cafés especiais, chás, lanches, ambiente para trabalho remoto, wifi" },
  { id: 20, type: "Sorveteria", name: "Gelato Fino", agent: "Renata", role: "Atendente", prompt: "Sorvetes artesanais, 40 sabores, casquinha, sundae, milk shake" },

  // SERVIÇOS (21-40)
  { id: 21, type: "Salão de Beleza", name: "Beauty Hair", agent: "Patrícia", role: "Recepcionista", prompt: "Corte R$50, escova R$40, coloração R$120, manicure R$30, agendamento" },
  { id: 22, type: "Barbearia", name: "Barber Shop", agent: "Marcos", role: "Recepcionista", prompt: "Corte R$40, barba R$25, combo R$55, cerveja grátis, agendamento" },
  { id: 23, type: "Academia", name: "Fitness Pro", agent: "Edu", role: "Consultor", prompt: "Planos de 99 a 199 reais, musculação, crossfit, personal opcional" },
  { id: 24, type: "Clínica Odontológica", name: "Sorriso Perfeito", agent: "Dra. Ana", role: "Recepcionista", prompt: "Consultas, limpeza, clareamento, implantes, parcelamento" },
  { id: 25, type: "Clínica Estética", name: "Beleza Total", agent: "Dra. Carla", role: "Consultora", prompt: "Botox, preenchimento, limpeza de pele, pacotes, avaliação grátis" },
  { id: 26, type: "Oficina Mecânica", name: "Auto Center", agent: "Zé", role: "Atendente", prompt: "Troca de óleo, freios, suspensão, orçamento grátis, guincho" },
  { id: 27, type: "Lavanderia", name: "Lavou Limpou", agent: "Sandra", role: "Atendente", prompt: "Lavagem kg R$15, roupas delicadas, entrega, prazo 48h" },
  { id: 28, type: "Hotel", name: "Hotel Conforto", agent: "Concierge", role: "Recepcionista", prompt: "Quartos de 150 a 400 reais, café incluso, wifi, estacionamento" },
  { id: 29, type: "Pousada", name: "Pousada Sol", agent: "Cléo", role: "Recepcionista", prompt: "Diárias de 200 a 350, piscina, praia, passeios, transfer" },
  { id: 30, type: "Escritório de Advocacia", name: "Advocacia Silva", agent: "Dra. Silva", role: "Secretária", prompt: "Trabalhista, família, cível, consulta R$200, contratos" },
  { id: 31, type: "Contabilidade", name: "Contábil Express", agent: "Ricardo", role: "Assistente", prompt: "Abertura MEI grátis, contabilidade de 200 a 800 reais, impostos" },
  { id: 32, type: "Imobiliária", name: "Casa Certa", agent: "Corretor Max", role: "Corretor", prompt: "Venda, aluguel, avaliação grátis, financiamento, documentação" },
  { id: 33, type: "Escola de Idiomas", name: "English Now", agent: "Teacher John", role: "Consultor", prompt: "Inglês, espanhol, aulas online ou presencial, de 200 a 500 reais" },
  { id: 34, type: "Auto Escola", name: "Direção Certa", agent: "Instrutor Paulo", role: "Atendente", prompt: "Carteira A/B, simulador, carro ou moto, pacotes, parcelamento" },
  { id: 35, type: "Gráfica", name: "Print Express", agent: "Designer Lu", role: "Atendente", prompt: "Cartões, banners, adesivos, convites, orçamento online, entrega" },
  { id: 36, type: "Assistência Técnica", name: "TecFix", agent: "Técnico Alex", role: "Atendente", prompt: "Celular, notebook, TV, orçamento grátis, garantia 90 dias" },
  { id: 37, type: "Fotógrafo", name: "Studio Click", agent: "Fotógrafo Leo", role: "Atendente", prompt: "Casamentos, ensaios, eventos, pacotes de 500 a 3000 reais" },
  { id: 38, type: "DJ/Eventos", name: "DJ Party", agent: "DJ Rick", role: "Atendente", prompt: "Festas, casamentos, formaturas, equipamento completo, de 800 a 2500" },
  { id: 39, type: "Personal Trainer", name: "Fit Personal", agent: "Personal João", role: "Consultor", prompt: "Treinos personalizados, acompanhamento online, dieta, R$300 a 600" },
  { id: 40, type: "Massagista", name: "Relaxe Spa", agent: "Terapeuta Ana", role: "Atendente", prompt: "Massagem relaxante, shiatsu, pedras quentes, de 80 a 150, agendamento" },

  // PROFISSIONAIS LIBERAIS (41-60)
  { id: 41, type: "Psicólogo", name: "Psico Equilíbrio", agent: "Dra. Marina", role: "Secretária", prompt: "Consultas R$200, online ou presencial, adultos e crianças, sigilo total" },
  { id: 42, type: "Nutricionista", name: "Nutri Saúde", agent: "Nutri Carol", role: "Atendente", prompt: "Consultas R$250, plano alimentar, retorno incluso, bioimpedância" },
  { id: 43, type: "Dentista", name: "Odonto Care", agent: "Dra. Paula", role: "Recepcionista", prompt: "Clínico, ortodontia, implantes, emergências 24h, parcelamento" },
  { id: 44, type: "Fisioterapeuta", name: "Fisio Vida", agent: "Dr. Carlos", role: "Atendente", prompt: "Sessões R$120, pilates, RPG, domiciliar, pacotes com desconto" },
  { id: 45, type: "Veterinário", name: "Pet Vet", agent: "Dra. Bia", role: "Recepcionista", prompt: "Consultas R$150, vacinas, cirurgias, emergência 24h, hotel pet" },
  { id: 46, type: "Arquiteto", name: "Arq Design", agent: "Arq. Bruno", role: "Assistente", prompt: "Projetos residenciais e comerciais, 3D, acompanhamento de obra" },
  { id: 47, type: "Designer", name: "Creative Studio", agent: "Design Ju", role: "Atendente", prompt: "Logos, identidade visual, social media, websites, orçamento online" },
  { id: 48, type: "Desenvolvedor", name: "Code Solutions", agent: "Dev André", role: "Consultor", prompt: "Sites, apps, sistemas, automações, orçamento sem compromisso" },
  { id: 49, type: "Eletricista", name: "Elétrica 24h", agent: "Eletricista Zé", role: "Atendente", prompt: "Instalações, reparos, emergências, visita R$80, orçamento grátis" },
  { id: 50, type: "Encanador", name: "Hidro Fix", agent: "Encanador João", role: "Atendente", prompt: "Vazamentos, entupimentos, instalações, emergência 24h, orçamento" },
  { id: 51, type: "Pintor", name: "Pintura Express", agent: "Pintor Marcos", role: "Atendente", prompt: "Residencial, comercial, m² de 20 a 40 reais, material incluso opcional" },
  { id: 52, type: "Jardineiro", name: "Verde Jardim", agent: "Jardineiro Pedro", role: "Atendente", prompt: "Manutenção, paisagismo, poda, mensal de 200 a 500 reais" },
  { id: 53, type: "Diarista", name: "Limpeza Total", agent: "Maria Limpeza", role: "Atendente", prompt: "Diária R$150, semanal, quinzenal, faxina pesada, produtos inclusos" },
  { id: 54, type: "Cuidador de Idosos", name: "Cuidar Bem", agent: "Cuidadora Ana", role: "Atendente", prompt: "Acompanhamento diurno ou noturno, plantão 12h ou 24h, experiência" },
  { id: 55, type: "Professor Particular", name: "Aulas VIP", agent: "Professor Lucas", role: "Atendente", prompt: "Matemática, física, química, vestibular, hora-aula R$80 a 150" },
  { id: 56, type: "Advogado Trabalhista", name: "Direitos Trabalhistas", agent: "Dr. Paulo", role: "Secretária", prompt: "Reclamação trabalhista, acordos, cálculos, primeira consulta grátis" },
  { id: 57, type: "Corretor de Seguros", name: "Seguro Total", agent: "Corretor Marcos", role: "Consultor", prompt: "Auto, vida, residencial, empresarial, cotação em 5 minutos" },
  { id: 58, type: "Coaching", name: "Vida Plena", agent: "Coach Sandra", role: "Atendente", prompt: "Coaching pessoal e profissional, sessões online, pacotes mensais" },
  { id: 59, type: "Consultor Financeiro", name: "Finanças OK", agent: "Consultor Pedro", role: "Atendente", prompt: "Planejamento financeiro, investimentos, educação financeira" },
  { id: 60, type: "Terapeuta Holístico", name: "Equilíbrio Zen", agent: "Terapeuta Luna", role: "Atendente", prompt: "Reiki, aromaterapia, meditação guiada, sessões online ou presencial" },

  // E-COMMERCE / DIGITAL (61-80)
  { id: 61, type: "Dropshipping", name: "Import Shop", agent: "Vendedor Online", role: "Atendente", prompt: "Produtos importados, entrega 15-30 dias, rastreamento, garantia" },
  { id: 62, type: "Infoprodutos", name: "Curso Digital", agent: "Suporte", role: "Atendente", prompt: "Cursos online, acesso vitalício, certificado, suporte ao aluno" },
  { id: 63, type: "Afiliado", name: "Renda Extra", agent: "Mentor", role: "Consultor", prompt: "Marketing digital, mentoria, comunidade, resultados comprovados" },
  { id: 64, type: "SaaS", name: "Software Cloud", agent: "Customer Success", role: "Suporte", prompt: "Planos de 49 a 299, trial 14 dias, suporte 24h, integrações" },
  { id: 65, type: "Agência Digital", name: "Marketing Pro", agent: "Account Manager", role: "Consultor", prompt: "Gestão de redes, ads, SEO, sites, pacotes de 1500 a 5000 reais" },
  { id: 66, type: "Loja Virtual", name: "E-Shop", agent: "SAC", role: "Atendente", prompt: "Roupas, acessórios, frete grátis acima de 199, troca em 30 dias" },
  { id: 67, type: "Marketplace", name: "Multi Vendas", agent: "Suporte Vendedor", role: "Atendente", prompt: "Cadastro grátis, comissão 10%, pagamento semanal, milhões de clientes" },
  { id: 68, type: "Delivery App", name: "Entrega Já", agent: "Suporte", role: "Atendente", prompt: "Entrega em 1h, taxa de 5 a 15 reais, cupons de desconto, fidelidade" },
  { id: 69, type: "Streaming", name: "Play Cursos", agent: "Suporte", role: "Atendente", prompt: "Plataforma de cursos, R$29/mês, download offline, cancelamento fácil" },
  { id: 70, type: "Fintech", name: "Bank Digital", agent: "Suporte", role: "Atendente", prompt: "Conta gratuita, cartão sem anuidade, pix, investimentos, empréstimos" },
  { id: 71, type: "App de Mobilidade", name: "Vai de Carro", agent: "Suporte", role: "Atendente", prompt: "Corridas, frota variada, código promocional, motorista parceiro" },
  { id: 72, type: "Consultoria Online", name: "Consult Pro", agent: "Consultor", role: "Atendente", prompt: "Consultoria de negócios, mentoria, sessões de 1h, pacotes mensais" },
  { id: 73, type: "Newsletter", name: "News Invest", agent: "Suporte", role: "Atendente", prompt: "Newsletter diária, análises de mercado, R$49/mês, 7 dias grátis" },
  { id: 74, type: "Podcast", name: "PodCast Pro", agent: "Produtor", role: "Atendente", prompt: "Produção de podcasts, edição, hospedagem, divulgação, pacotes" },
  { id: 75, type: "NFT/Crypto", name: "Crypto Art", agent: "Consultor", role: "Atendente", prompt: "Coleções NFT, consultoria crypto, wallets, educação sobre blockchain" },
  { id: 76, type: "Social Media Manager", name: "Social Boost", agent: "Gestor", role: "Consultor", prompt: "Gestão Instagram, TikTok, LinkedIn, pacotes de 800 a 2500/mês" },
  { id: 77, type: "Copywriter", name: "Copy Expert", agent: "Copywriter", role: "Consultor", prompt: "Textos persuasivos, landing pages, emails, scripts de venda" },
  { id: 78, type: "Tráfego Pago", name: "Ads Master", agent: "Gestor", role: "Consultor", prompt: "Google Ads, Facebook Ads, ROI garantido, relatórios semanais" },
  { id: 79, type: "Web Designer", name: "Web Create", agent: "Designer", role: "Consultor", prompt: "Sites responsivos, e-commerce, landing pages, manutenção mensal" },
  { id: 80, type: "SEO Specialist", name: "Rank Up", agent: "Especialista", role: "Consultor", prompt: "Otimização SEO, primeira página Google, análise de concorrentes" },

  // NICHOS ESPECÍFICOS (81-100)
  { id: 81, type: "Casas de Festas", name: "Festa Feliz", agent: "Recepcionista", role: "Atendente", prompt: "Aluguel de espaço, buffet, decoração, pacotes de 3000 a 10000" },
  { id: 82, type: "Floricultura", name: "Flor & Amor", agent: "Florista", role: "Atendente", prompt: "Buquês, arranjos, coroas, entrega no mesmo dia, preços variados" },
  { id: 83, type: "Sex Shop", name: "Love Store", agent: "Consultora", role: "Atendente", prompt: "Produtos adultos, embalagem discreta, entrega sigilosa, sex coach" },
  { id: 84, type: "Tatuagem", name: "Ink Art", agent: "Tatuador", role: "Atendente", prompt: "Tattoos, piercing, orçamento por foto, agendamento, portfólio online" },
  { id: 85, type: "Funerária", name: "Paz Eterna", agent: "Atendente", role: "Consultor", prompt: "Planos funeral, cremação, translado, assistência 24h, pagamento facilitado" },
  { id: 86, type: "Chaveiro", name: "Chaveiro 24h", agent: "Chaveiro", role: "Atendente", prompt: "Abertura de portas, cópias de chaves, carros, cofres, 24 horas" },
  { id: 87, type: "Dedetizadora", name: "Sem Pragas", agent: "Técnico", role: "Atendente", prompt: "Dedetização, desratização, orçamento grátis, garantia, produtos seguros" },
  { id: 88, type: "Mudanças", name: "Mudança Fácil", agent: "Atendente", role: "Consultor", prompt: "Mudanças residenciais e comerciais, embalagem, montagem, orçamento" },
  { id: 89, type: "Self Storage", name: "Guarda Tudo", agent: "Consultor", role: "Atendente", prompt: "Boxes de 1 a 30m², mensalidade de 150 a 1500, acesso 24h, seguro" },
  { id: 90, type: "Coworking", name: "Work Hub", agent: "Community Manager", role: "Consultor", prompt: "Estações, salas, auditório, de 500 a 2000/mês, day use R$50" },
  { id: 91, type: "Escola Infantil", name: "Escolinha Feliz", agent: "Coordenadora", role: "Atendente", prompt: "Berçário ao pré, período integral ou parcial, de 800 a 2000/mês" },
  { id: 92, type: "Autopeças", name: "Peças Car", agent: "Vendedor", role: "Atendente", prompt: "Peças originais e paralelas, todas as marcas, entrega, garantia" },
  { id: 93, type: "Loja de Pesca", name: "Pesque & Leve", agent: "Pescador", role: "Atendente", prompt: "Varas, molinetes, iscas, acessórios, dicas de pesca, eventos" },
  { id: 94, type: "Casa de Bolos", name: "Bolo da Vó", agent: "Boleira", role: "Atendente", prompt: "Bolos caseiros, fatias, inteiros, tortas, encomendas, delivery" },
  { id: 95, type: "Churrasqueiro", name: "Churrasco Top", agent: "Churrasqueiro", role: "Atendente", prompt: "Churrasco para eventos, por pessoa R$60 a 100, equipamento incluso" },
  { id: 96, type: "Costureira", name: "Costura Express", agent: "Costureira", role: "Atendente", prompt: "Ajustes, reformas, roupas sob medida, vestidos de festa, orçamento" },
  { id: 97, type: "Marido de Aluguel", name: "Conserta Tudo", agent: "Faz Tudo", role: "Atendente", prompt: "Pequenos reparos, montagem de móveis, hora R$60, visita grátis" },
  { id: 98, type: "Borracharia", name: "Pneu Novo", agent: "Borracheiro", role: "Atendente", prompt: "Troca de pneus, conserto, balanceamento, socorro 24h, orçamento" },
  { id: 99, type: "Vidraçaria", name: "Vidro Art", agent: "Vidreiro", role: "Atendente", prompt: "Box, espelhos, janelas, medição grátis, instalação, garantia" },
  { id: 100, type: "Despachante", name: "Doc Express", agent: "Despachante", role: "Atendente", prompt: "Transferência, licenciamento, CNH, abertura de empresa, procuração" },
];

const CLIENT_MESSAGES = [
  "Oi, quero saber mais sobre o agente de IA",
  "Olá! Como funciona isso?",
  "E aí, quanto custa?",
  "Boa tarde, preciso de um atendente virtual",
  "Oi! Vim pelo anúncio",
  "Quero automatizar meu WhatsApp",
  "Me explica como funciona isso de IA no WhatsApp",
  "Oi, vocês fazem chatbot?",
  "Isso é mesmo uma IA que atende?",
  "Como assim a IA responde igual gente?",
  "Funciona 24 horas mesmo?",
  "Dá pra testar antes de pagar?",
  "Será que funciona pro meu negócio?",
  "É caro?",
  "Preciso urgente de um atendente",
  "opa blz?",
  "oii",
  "bom dia! tudo bem?",
  "eae",
  "hmm",
];

// Tipos
interface TestResult {
  id: number;
  type: string;
  success: boolean;
  phase: string;
  error?: string;
  responses: string[];
  duration: number;
}

// Funções auxiliares
function generatePhone(id: number): string {
  return `5511999${id.toString().padStart(6, '0')}`;
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendMessage(phone: string, message: string): Promise<string> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/admin-message`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, message })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json();
    return data.response || data.text || "";
  } catch (error: any) {
    throw new Error(`API Error: ${error.message}`);
  }
}

async function clearSession(phone: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/clear-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone })
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function getSession(phone: string): Promise<any> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/session/${phone}`);
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

// Teste individual
async function testScenario(scenario: typeof BUSINESS_SCENARIOS[0], openingMessage: string): Promise<TestResult> {
  const phone = generatePhone(scenario.id);
  const responses: string[] = [];
  const startTime = Date.now();
  let phase = "init";
  
  try {
    // Limpar sessão
    await clearSession(phone);
    
    // 1. ABERTURA
    phase = "opening";
    const r1 = await sendMessage(phone, openingMessage);
    responses.push(`[USER] ${openingMessage}`);
    responses.push(`[RODRIGO] ${r1.substring(0, 100)}...`);
    if (!r1) throw new Error("Resposta vazia na abertura");
    await sleep(50);
    
    // 2. EMPRESA
    phase = "company";
    const r2 = await sendMessage(phone, scenario.name);
    responses.push(`[USER] ${scenario.name}`);
    responses.push(`[RODRIGO] ${r2.substring(0, 100)}...`);
    if (!r2) throw new Error("Resposta vazia na empresa");
    await sleep(50);
    
    // 3. NOME DO AGENTE
    phase = "agent_name";
    const r3 = await sendMessage(phone, `quero chamar de ${scenario.agent}`);
    responses.push(`[USER] quero chamar de ${scenario.agent}`);
    responses.push(`[RODRIGO] ${r3.substring(0, 100)}...`);
    if (!r3) throw new Error("Resposta vazia no agente");
    await sleep(50);
    
    // 4. FUNÇÃO
    phase = "role";
    const r4 = await sendMessage(phone, scenario.role);
    responses.push(`[USER] ${scenario.role}`);
    responses.push(`[RODRIGO] ${r4.substring(0, 100)}...`);
    if (!r4) throw new Error("Resposta vazia na função");
    await sleep(50);
    
    // 5. INSTRUÇÕES
    phase = "prompt";
    const r5 = await sendMessage(phone, scenario.prompt);
    responses.push(`[USER] ${scenario.prompt}`);
    responses.push(`[RODRIGO] ${r5.substring(0, 100)}...`);
    if (!r5) throw new Error("Resposta vazia nas instruções");
    await sleep(50);
    
    // 6. CONFIRMAR E TESTAR
    phase = "test_start";
    const r6 = await sendMessage(phone, "sim, quero testar");
    responses.push(`[USER] sim, quero testar`);
    responses.push(`[RODRIGO] ${r6.substring(0, 100)}...`);
    await sleep(50);
    
    // Verificar se entrou em modo de teste
    const session = await getSession(phone);
    const inTestMode = session?.flowState === 'test_mode';
    
    if (inTestMode) {
      // 7. TESTAR AGENTE
      phase = "testing";
      const testMsg = await sendMessage(phone, "oi, quanto custa?");
      responses.push(`[USER-TEST] oi, quanto custa?`);
      responses.push(`[AGENT-${scenario.agent}] ${testMsg.substring(0, 100)}...`);
      await sleep(50);
      
      // 8. SAIR DO TESTE
      phase = "exit_test";
      const exitMsg = await sendMessage(phone, "#sair");
      responses.push(`[USER] #sair`);
      responses.push(`[RODRIGO] ${exitMsg.substring(0, 100)}...`);
    }
    
    return {
      id: scenario.id,
      type: scenario.type,
      success: true,
      phase: "completed",
      responses,
      duration: Date.now() - startTime
    };
    
  } catch (error: any) {
    return {
      id: scenario.id,
      type: scenario.type,
      success: false,
      phase,
      error: error.message,
      responses,
      duration: Date.now() - startTime
    };
  }
}

// Testes especiais
async function testClearAndRestart(): Promise<TestResult> {
  const phone = "5511888888888";
  const responses: string[] = [];
  const startTime = Date.now();
  
  try {
    // Criar sessão
    const r1 = await sendMessage(phone, "oi quero um agente");
    responses.push(`Primeiro contato: ${r1.substring(0, 50)}...`);
    
    // Limpar
    const cleared = await clearSession(phone);
    responses.push(`Sessão limpa: ${cleared}`);
    
    // Verificar se limpou
    const session = await getSession(phone);
    if (session && session.flowState !== 'onboarding') {
      throw new Error("Sessão não foi limpa corretamente");
    }
    responses.push("Sessão inexistente ou reset");
    
    // Novo contato
    const r2 = await sendMessage(phone, "oi de novo");
    responses.push(`Novo contato: ${r2.substring(0, 50)}...`);
    
    return {
      id: 0,
      type: "CLEAR_SESSION",
      success: true,
      phase: "completed",
      responses,
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      id: 0,
      type: "CLEAR_SESSION",
      success: false,
      phase: "error",
      error: error.message,
      responses,
      duration: Date.now() - startTime
    };
  }
}

async function testHumanConversations(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const phone = "5511777777777";
  
  const humanMessages = [
    "e ae mano",
    "opa blz?",
    "oii td bem?",
    "bom dia",
    "n entendi nd",
    "oq vcs fazem?",
    "eh caro?",
    "funciona msm?",
    "kkkk",
    "hmm deixa eu pensar",
  ];
  
  for (const msg of humanMessages) {
    await clearSession(phone);
    const startTime = Date.now();
    
    try {
      const response = await sendMessage(phone, msg);
      results.push({
        id: 0,
        type: `HUMAN: "${msg}"`,
        success: response.length > 10 && !response.includes("undefined"),
        phase: "completed",
        responses: [response],
        duration: Date.now() - startTime
      });
    } catch (error: any) {
      results.push({
        id: 0,
        type: `HUMAN: "${msg}"`,
        success: false,
        phase: "error",
        error: error.message,
        responses: [],
        duration: Date.now() - startTime
      });
    }
    
    await sleep(50);
  }
  
  return results;
}

async function testFollowUp(): Promise<TestResult> {
  const phone = "5511666666666";
  const responses: string[] = [];
  const startTime = Date.now();
  
  try {
    // Configurar agente mas não fechar
    await clearSession(phone);
    await sendMessage(phone, "oi");
    await sendMessage(phone, "Loja Teste Follow");
    await sendMessage(phone, "Maria");
    await sendMessage(phone, "Vendedora");
    responses.push("Configuração parcial feita");
    
    // Testar endpoint de follow-up
    const response = await fetch(`${BASE_URL}/api/test/followup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        phone, 
        context: { 
          type: 'no_response', 
          lastMessage: 'ofereceu teste',
          minutesSinceLastInteraction: 60 
        } 
      })
    });
    
    if (response.ok) {
      const data = await response.json();
      responses.push(`Follow-up: ${data.response?.substring(0, 80) || 'gerado'}...`);
    } else {
      responses.push(`Follow-up endpoint status: ${response.status}`);
    }
    
    return {
      id: 0,
      type: "FOLLOW_UP",
      success: true,
      phase: "completed",
      responses,
      duration: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      id: 0,
      type: "FOLLOW_UP",
      success: false,
      phase: "error",
      error: error.message,
      responses,
      duration: Date.now() - startTime
    };
  }
}

// Runner principal
async function runAllTests() {
  console.log("\n" + "═".repeat(70));
  console.log("🧪 TESTE MASSIVO DO ADMIN AGENT - 100 CENÁRIOS VIA API");
  console.log("═".repeat(70) + "\n");
  
  // Verificar se servidor está rodando
  try {
    const health = await fetch(`${BASE_URL}/api/health`);
    if (!health.ok) throw new Error("Health check failed");
    console.log("✅ Servidor rodando em " + BASE_URL + "\n");
  } catch {
    console.log("❌ ERRO: Servidor não está rodando em " + BASE_URL);
    console.log("   Execute 'npm run dev' primeiro!\n");
    process.exit(1);
  }
  
  const allResults: TestResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  // 1. TESTES DE NEGÓCIOS (100 cenários)
  console.log("📋 TESTANDO 100 CENÁRIOS DE NEGÓCIO...\n");
  
  for (let i = 0; i < BUSINESS_SCENARIOS.length; i++) {
    const scenario = BUSINESS_SCENARIOS[i];
    const openingMessage = CLIENT_MESSAGES[i % CLIENT_MESSAGES.length];
    
    process.stdout.write(`[${(i + 1).toString().padStart(3, '0')}/100] ${scenario.type.padEnd(25)} `);
    
    const result = await testScenario(scenario, openingMessage);
    allResults.push(result);
    
    if (result.success) {
      successCount++;
      console.log(`✅ OK (${result.duration}ms)`);
    } else {
      failCount++;
      console.log(`❌ FALHA em ${result.phase}: ${result.error}`);
    }
    
    await sleep(DELAY_BETWEEN_TESTS);
  }
  
  // 2. TESTE DE LIMPAR SESSÃO
  console.log("\n📋 TESTANDO LIMPAR SESSÃO...\n");
  const clearResult = await testClearAndRestart();
  allResults.push(clearResult);
  if (clearResult.success) {
    successCount++;
    console.log(`✅ Limpar sessão OK`);
  } else {
    failCount++;
    console.log(`❌ Limpar sessão FALHOU: ${clearResult.error}`);
  }
  
  // 3. TESTES DE CONVERSA HUMANA
  console.log("\n📋 TESTANDO CONVERSAS HUMANAS...\n");
  const humanResults = await testHumanConversations();
  for (const result of humanResults) {
    allResults.push(result);
    if (result.success) {
      successCount++;
      console.log(`✅ ${result.type}`);
    } else {
      failCount++;
      console.log(`❌ ${result.type}: ${result.error}`);
    }
  }
  
  // 4. TESTE DE FOLLOW-UP
  console.log("\n📋 TESTANDO FOLLOW-UP...\n");
  const followUpResult = await testFollowUp();
  allResults.push(followUpResult);
  if (followUpResult.success) {
    successCount++;
    console.log(`✅ Follow-up OK`);
  } else {
    failCount++;
    console.log(`❌ Follow-up FALHOU: ${followUpResult.error}`);
  }
  
  // RESUMO FINAL
  console.log("\n" + "═".repeat(70));
  console.log("📊 RESUMO FINAL");
  console.log("═".repeat(70));
  console.log(`✅ Sucesso: ${successCount}`);
  console.log(`❌ Falha: ${failCount}`);
  console.log(`📈 Taxa de sucesso: ${((successCount / allResults.length) * 100).toFixed(1)}%`);
  console.log(`⏱️ Tempo total: ${allResults.reduce((acc, r) => acc + r.duration, 0)}ms`);
  
  if (failCount > 0) {
    console.log("\n❌ CENÁRIOS COM FALHA:");
    allResults.filter(r => !r.success).forEach(r => {
      console.log(`  - [${r.id}] ${r.type}: ${r.error} (fase: ${r.phase})`);
    });
  }
  
  console.log("\n" + "═".repeat(70) + "\n");
}

runAllTests().catch(console.error);
