/**
 * 🧪 TESTE MASSIVO DO ADMIN AGENT - 100 CENÁRIOS DE NEGÓCIO
 * 
 * Testa todo o fluxo de vendas com diferentes tipos de negócio,
 * perguntas variadas, ações, modo de teste, follow-up, etc.
 */

// Carregar variáveis de ambiente ANTES de qualquer import
import * as dotenv from "dotenv";
dotenv.config();

import { 
  getClientSession, 
  createClientSession, 
  updateClientSession,
  clearClientSession,
  addToConversationHistory,
  generateAIResponse,
  processAdminMessage,
  generateFollowUpResponse,
  type ClientSession 
} from "./server/adminAgentService";
import { 
  scheduleAutoFollowUp, 
  cancelFollowUp, 
  parseScheduleFromText 
} from "./server/followUpService";

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const TEST_PHONE_BASE = "5511999990000"; // Base phone number for tests
const DELAY_BETWEEN_TESTS = 50; // ms entre cada teste
const VERBOSE = process.env.VERBOSE === "true"; // Modo verboso

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
  { id: 11, type: "Livraria", name: "Livro Aberto", agent: "Gabriel", role: "Vendedor", prompt: "Livros novos e usados, encomendas, troca, indicações de leitura" },
  { id: 12, type: "Loja de Instrumentos", name: "Som Total", agent: "Pedro", role: "Consultor", prompt: "Violões, guitarras, teclados, aulas disponíveis, luthier" },
  { id: 13, type: "Loja de Móveis", name: "Casa Nova", agent: "Carla", role: "Consultora", prompt: "Móveis planejados, entrega em 15 dias, projeto grátis, montagem inclusa" },
  { id: 14, type: "Joalheria", name: "Ouro Fino", agent: "Isabela", role: "Consultora", prompt: "Joias em ouro 18k, prata 925, gravação grátis, certificado de autenticidade" },
  { id: 15, type: "Loja de Artigos Esportivos", name: "Sport Max", agent: "Thiago", role: "Vendedor", prompt: "Equipamentos de academia, futebol, natação, corrida, suplementos" },

  // ALIMENTAÇÃO (16-30)
  { id: 16, type: "Pizzaria", name: "Pizza Express", agent: "Marcos", role: "Atendente", prompt: "Pizzas de 45 a 70 reais, entrega em 40min, refrigerante grátis pedidos acima de R$80" },
  { id: 17, type: "Hamburgueria", name: "Burger House", agent: "Bruno", role: "Atendente", prompt: "Hambúrgueres artesanais, combos de 25 a 45 reais, vegano disponível" },
  { id: 18, type: "Restaurante Japonês", name: "Sushi King", agent: "Yuki", role: "Atendente", prompt: "Sushi, sashimi, temaki, rodízio R$89, delivery mínimo R$50" },
  { id: 19, type: "Padaria", name: "Pão Quente", agent: "Rosa", role: "Atendente", prompt: "Pães frescos, bolos, salgados, café, encomendas para festas" },
  { id: 20, type: "Açaí", name: "Açaí Prime", agent: "Leo", role: "Atendente", prompt: "Açaí de 300ml a 1L, 15 a 35 reais, toppings variados, entrega rápida" },
  { id: 21, type: "Pastelaria", name: "Pastel Show", agent: "João", role: "Atendente", prompt: "Pastéis de 8 a 15 reais, caldos, sucos, 50 sabores, fritura na hora" },
  { id: 22, type: "Marmitaria", name: "Comida Boa", agent: "Maria", role: "Atendente", prompt: "Marmitas de 18 a 25 reais, opção fit, vegana, low carb, entrega almoço" },
  { id: 23, type: "Doceria", name: "Doce Mel", agent: "Paula", role: "Atendente", prompt: "Bolos decorados, doces finos, bem-casados, encomendas 3 dias antes" },
  { id: 24, type: "Cafeteria", name: "Café & Arte", agent: "André", role: "Barista", prompt: "Cafés especiais, chás, lanches, ambiente para trabalho remoto, wifi" },
  { id: 25, type: "Sorveteria", name: "Gelato Fino", agent: "Renata", role: "Atendente", prompt: "Sorvetes artesanais, 40 sabores, casquinha, sundae, milk shake" },
  { id: 26, type: "Churrascaria", name: "Picanha & Cia", agent: "Sérgio", role: "Garçom Virtual", prompt: "Rodízio R$79, cortes nobres, buffet completo, reservas" },
  { id: 27, type: "Comida Árabe", name: "Habibi", agent: "Ahmad", role: "Atendente", prompt: "Esfihas, quibes, shawarma, combos de 30 a 60 reais, entrega" },
  { id: 28, type: "Comida Mexicana", name: "Taco Loco", agent: "Miguel", role: "Atendente", prompt: "Tacos, burritos, nachos, combos, terça mexicana com desconto" },
  { id: 29, type: "Healthy Food", name: "Vida Saudável", agent: "Clara", role: "Nutricionista Virtual", prompt: "Refeições fit, sucos detox, marmitas congeladas, planos semanais" },
  { id: 30, type: "Food Truck", name: "Street Food", agent: "Duda", role: "Atendente", prompt: "Lanches gourmet, localização variável, eventos, catering" },

  // SERVIÇOS (31-50)
  { id: 31, type: "Salão de Beleza", name: "Beauty Hair", agent: "Patrícia", role: "Recepcionista", prompt: "Corte R$50, escova R$40, coloração R$120, manicure R$30, agendamento" },
  { id: 32, type: "Barbearia", name: "Barber Shop", agent: "Marcos", role: "Recepcionista", prompt: "Corte R$40, barba R$25, combo R$55, cerveja grátis, agendamento" },
  { id: 33, type: "Academia", name: "Fitness Pro", agent: "Edu", role: "Consultor", prompt: "Planos de 99 a 199 reais, musculação, crossfit, personal opcional" },
  { id: 34, type: "Clínica Odontológica", name: "Sorriso Perfeito", agent: "Dra. Ana", role: "Recepcionista", prompt: "Consultas, limpeza, clareamento, implantes, parcelamento" },
  { id: 35, type: "Clínica Estética", name: "Beleza Total", agent: "Dra. Carla", role: "Consultora", prompt: "Botox, preenchimento, limpeza de pele, pacotes, avaliação grátis" },
  { id: 36, type: "Oficina Mecânica", name: "Auto Center", agent: "Zé", role: "Atendente", prompt: "Troca de óleo, freios, suspensão, orçamento grátis, guincho" },
  { id: 37, type: "Lavanderia", name: "Lavou Limpou", agent: "Sandra", role: "Atendente", prompt: "Lavagem kg R$15, roupas delicadas, entrega, prazo 48h" },
  { id: 38, type: "Hotel", name: "Hotel Conforto", agent: "Concierge", role: "Recepcionista", prompt: "Quartos de 150 a 400 reais, café incluso, wifi, estacionamento" },
  { id: 39, type: "Pousada", name: "Pousada Sol", agent: "Cléo", role: "Recepcionista", prompt: "Diárias de 200 a 350, piscina, praia, passeios, transfer" },
  { id: 40, type: "Escritório de Advocacia", name: "Advocacia Silva", agent: "Dra. Silva", role: "Secretária", prompt: "Trabalhista, família, cível, consulta R$200, contratos" },
  { id: 41, type: "Contabilidade", name: "Contábil Express", agent: "Ricardo", role: "Assistente", prompt: "Abertura MEI grátis, contabilidade de 200 a 800 reais, impostos" },
  { id: 42, type: "Imobiliária", name: "Casa Certa", agent: "Corretor Max", role: "Corretor", prompt: "Venda, aluguel, avaliação grátis, financiamento, documentação" },
  { id: 43, type: "Escola de Idiomas", name: "English Now", agent: "Teacher John", role: "Consultor", prompt: "Inglês, espanhol, aulas online ou presencial, de 200 a 500 reais" },
  { id: 44, type: "Auto Escola", name: "Direção Certa", agent: "Instrutor Paulo", role: "Atendente", prompt: "Carteira A/B, simulador, carro ou moto, pacotes, parcelamento" },
  { id: 45, type: "Gráfica", name: "Print Express", agent: "Designer Lu", role: "Atendente", prompt: "Cartões, banners, adesivos, convites, orçamento online, entrega" },
  { id: 46, type: "Assistência Técnica", name: "TecFix", agent: "Técnico Alex", role: "Atendente", prompt: "Celular, notebook, TV, orçamento grátis, garantia 90 dias" },
  { id: 47, type: "Fotógrafo", name: "Studio Click", agent: "Fotógrafo Leo", role: "Atendente", prompt: "Casamentos, ensaios, eventos, pacotes de 500 a 3000 reais" },
  { id: 48, type: "DJ/Eventos", name: "DJ Party", agent: "DJ Rick", role: "Atendente", prompt: "Festas, casamentos, formaturas, equipamento completo, de 800 a 2500" },
  { id: 49, type: "Personal Trainer", name: "Fit Personal", agent: "Personal João", role: "Consultor", prompt: "Treinos personalizados, acompanhamento online, dieta, R$300 a 600" },
  { id: 50, type: "Massagista", name: "Relaxe Spa", agent: "Terapeuta Ana", role: "Atendente", prompt: "Massagem relaxante, shiatsu, pedras quentes, de 80 a 150, agendamento" },

  // PROFISSIONAIS LIBERAIS (51-65)
  { id: 51, type: "Psicólogo", name: "Psico Equilíbrio", agent: "Dra. Marina", role: "Secretária", prompt: "Consultas R$200, online ou presencial, adultos e crianças, sigilo total" },
  { id: 52, type: "Nutricionista", name: "Nutri Saúde", agent: "Nutri Carol", role: "Atendente", prompt: "Consultas R$250, plano alimentar, retorno incluso, bioimpedância" },
  { id: 53, type: "Dentista", name: "Odonto Care", agent: "Dra. Paula", role: "Recepcionista", prompt: "Clínico, ortodontia, implantes, emergências 24h, parcelamento" },
  { id: 54, type: "Fisioterapeuta", name: "Fisio Vida", agent: "Dr. Carlos", role: "Atendente", prompt: "Sessões R$120, pilates, RPG, domiciliar, pacotes com desconto" },
  { id: 55, type: "Veterinário", name: "Pet Vet", agent: "Dra. Bia", role: "Recepcionista", prompt: "Consultas R$150, vacinas, cirurgias, emergência 24h, hotel pet" },
  { id: 56, type: "Arquiteto", name: "Arq Design", agent: "Arq. Bruno", role: "Assistente", prompt: "Projetos residenciais e comerciais, 3D, acompanhamento de obra" },
  { id: 57, type: "Designer", name: "Creative Studio", agent: "Design Ju", role: "Atendente", prompt: "Logos, identidade visual, social media, websites, orçamento online" },
  { id: 58, type: "Desenvolvedor", name: "Code Solutions", agent: "Dev André", role: "Consultor", prompt: "Sites, apps, sistemas, automações, orçamento sem compromisso" },
  { id: 59, type: "Eletricista", name: "Elétrica 24h", agent: "Eletricista Zé", role: "Atendente", prompt: "Instalações, reparos, emergências, visita R$80, orçamento grátis" },
  { id: 60, type: "Encanador", name: "Hidro Fix", agent: "Encanador João", role: "Atendente", prompt: "Vazamentos, entupimentos, instalações, emergência 24h, orçamento" },
  { id: 61, type: "Pintor", name: "Pintura Express", agent: "Pintor Marcos", role: "Atendente", prompt: "Residencial, comercial, m² de 20 a 40 reais, material incluso opcional" },
  { id: 62, type: "Jardineiro", name: "Verde Jardim", agent: "Jardineiro Pedro", role: "Atendente", prompt: "Manutenção, paisagismo, poda, mensal de 200 a 500 reais" },
  { id: 63, type: "Diarista", name: "Limpeza Total", agent: "Maria Limpeza", role: "Atendente", prompt: "Diária R$150, semanal, quinzenal, faxina pesada, produtos inclusos" },
  { id: 64, type: "Cuidador de Idosos", name: "Cuidar Bem", agent: "Cuidadora Ana", role: "Atendente", prompt: "Acompanhamento diurno ou noturno, plantão 12h ou 24h, experiência" },
  { id: 65, type: "Professor Particular", name: "Aulas VIP", agent: "Professor Lucas", role: "Atendente", prompt: "Matemática, física, química, vestibular, hora-aula R$80 a 150" },

  // E-COMMERCE / DIGITAL (66-80)
  { id: 66, type: "Dropshipping", name: "Import Shop", agent: "Vendedor Online", role: "Atendente", prompt: "Produtos importados, entrega 15-30 dias, rastreamento, garantia" },
  { id: 67, type: "Infoprodutos", name: "Curso Digital", agent: "Suporte", role: "Atendente", prompt: "Cursos online, acesso vitalício, certificado, suporte ao aluno" },
  { id: 68, type: "Afiliado", name: "Renda Extra", agent: "Mentor", role: "Consultor", prompt: "Marketing digital, mentoria, comunidade, resultados comprovados" },
  { id: 69, type: "SaaS", name: "Software Cloud", agent: "Customer Success", role: "Suporte", prompt: "Planos de 49 a 299, trial 14 dias, suporte 24h, integrações" },
  { id: 70, type: "Agência Digital", name: "Marketing Pro", agent: "Account Manager", role: "Consultor", prompt: "Gestão de redes, ads, SEO, sites, pacotes de 1500 a 5000 reais" },
  { id: 71, type: "Loja Virtual", name: "E-Shop", agent: "SAC", role: "Atendente", prompt: "Roupas, acessórios, frete grátis acima de 199, troca em 30 dias" },
  { id: 72, type: "Marketplace", name: "Multi Vendas", agent: "Suporte Vendedor", role: "Atendente", prompt: "Cadastro grátis, comissão 10%, pagamento semanal, milhões de clientes" },
  { id: 73, type: "Delivery App", name: "Entrega Já", agent: "Suporte", role: "Atendente", prompt: "Entrega em 1h, taxa de 5 a 15 reais, cupons de desconto, fidelidade" },
  { id: 74, type: "Streaming", name: "Play Cursos", agent: "Suporte", role: "Atendente", prompt: "Plataforma de cursos, R$29/mês, download offline, cancelamento fácil" },
  { id: 75, type: "Fintech", name: "Bank Digital", agent: "Suporte", role: "Atendente", prompt: "Conta gratuita, cartão sem anuidade, pix, investimentos, empréstimos" },
  { id: 76, type: "App de Mobilidade", name: "Vai de Carro", agent: "Suporte", role: "Atendente", prompt: "Corridas, frota variada, código promocional, motorista parceiro" },
  { id: 77, type: "Consultoria Online", name: "Consult Pro", agent: "Consultor", role: "Atendente", prompt: "Consultoria de negócios, mentoria, sessões de 1h, pacotes mensais" },
  { id: 78, type: "Newsletter", name: "News Invest", agent: "Suporte", role: "Atendente", prompt: "Newsletter diária, análises de mercado, R$49/mês, 7 dias grátis" },
  { id: 79, type: "Podcast", name: "PodCast Pro", agent: "Produtor", role: "Atendente", prompt: "Produção de podcasts, edição, hospedagem, divulgação, pacotes" },
  { id: 80, type: "NFT/Crypto", name: "Crypto Art", agent: "Consultor", role: "Atendente", prompt: "Coleções NFT, consultoria crypto, wallets, educação sobre blockchain" },

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

// ============================================================================
// PERGUNTAS VARIADAS PARA SIMULAR CLIENTES REAIS
// ============================================================================

const CLIENT_OPENING_MESSAGES = [
  // Diretos e objetivos
  "Oi, quero saber mais sobre o agente de IA",
  "Olá! Como funciona isso?",
  "E aí, quanto custa?",
  "Boa tarde, preciso de um atendente virtual",
  "Oi! Vim pelo anúncio",
  "Quero automatizar meu WhatsApp",
  "Me explica como funciona isso de IA no WhatsApp",
  "Oi, vocês fazem chatbot?",
  
  // Curiosos
  "Isso é mesmo uma IA que atende?",
  "Como assim a IA responde igual gente?",
  "Funciona 24 horas mesmo?",
  "Dá pra testar antes de pagar?",
  
  // Céticos
  "Será que funciona pro meu negócio?",
  "Já tentei outros e não funcionou",
  "É caro?",
  "Tem taxa escondida?",
  
  // Com pressa
  "Preciso urgente de um atendente",
  "Consigo usar hoje?",
  "É rápido pra configurar?",
  
  // Detalhistas
  "Quero entender bem antes de contratar",
  "Quais as funcionalidades?",
  "Vocês dão suporte?",
  
  // Informais
  "opa blz?",
  "oii",
  "bom dia! tudo bem?",
  "eae",
];

// ============================================================================
// TIPOS DE TESTE
// ============================================================================

type TestResult = {
  scenario: number;
  businessType: string;
  success: boolean;
  phase: string;
  error?: string;
  duration: number;
  responses: string[];
};

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function generatePhone(scenarioId: number): string {
  return `5511999${scenarioId.toString().padStart(6, '0')}`;
}

async function simulateConversation(
  scenario: typeof BUSINESS_SCENARIOS[0],
  openingMessage: string
): Promise<TestResult> {
  const startTime = Date.now();
  const phone = generatePhone(scenario.id);
  const responses: string[] = [];
  let currentPhase = "opening";
  
  try {
    // Limpar sessão anterior
    clearClientSession(phone);
    
    // 1. ABERTURA - Cliente entra em contato
    currentPhase = "opening";
    const result1 = await processAdminMessage(phone, openingMessage, undefined, undefined, true);
    responses.push(`[CLIENTE]: ${openingMessage}`);
    responses.push(`[RODRIGO]: ${result1.text}`);
    
    if (!result1.text) throw new Error("Resposta vazia na abertura");
    
    // 2. EMPRESA - Informar nome da empresa
    currentPhase = "company";
    await sleep(50);
    const result2 = await processAdminMessage(phone, scenario.name, undefined, undefined, true);
    responses.push(`[CLIENTE]: ${scenario.name}`);
    responses.push(`[RODRIGO]: ${result2.text}`);
    
    if (!result2.text) throw new Error("Resposta vazia na empresa");
    
    // 3. NOME DO AGENTE
    currentPhase = "agent_name";
    await sleep(50);
    const result3 = await processAdminMessage(phone, `quero chamar de ${scenario.agent}`, undefined, undefined, true);
    responses.push(`[CLIENTE]: quero chamar de ${scenario.agent}`);
    responses.push(`[RODRIGO]: ${result3.text}`);
    
    if (!result3.text) throw new Error("Resposta vazia no nome do agente");
    
    // 4. FUNÇÃO
    currentPhase = "role";
    await sleep(50);
    const result4 = await processAdminMessage(phone, `${scenario.role}`, undefined, undefined, true);
    responses.push(`[CLIENTE]: ${scenario.role}`);
    responses.push(`[RODRIGO]: ${result4.text}`);
    
    if (!result4.text) throw new Error("Resposta vazia na função");
    
    // 5. INSTRUÇÕES
    currentPhase = "prompt";
    await sleep(50);
    const result5 = await processAdminMessage(phone, scenario.prompt, undefined, undefined, true);
    responses.push(`[CLIENTE]: ${scenario.prompt}`);
    responses.push(`[RODRIGO]: ${result5.text}`);
    
    if (!result5.text) throw new Error("Resposta vazia nas instruções");
    
    // 6. ACEITAR TESTE
    currentPhase = "test_start";
    await sleep(50);
    const result6 = await processAdminMessage(phone, "sim, quero testar", undefined, undefined, true);
    responses.push(`[CLIENTE]: sim, quero testar`);
    responses.push(`[RODRIGO]: ${result6.text}`);
    
    // Verificar se entrou em modo de teste
    const session = getClientSession(phone);
    if (session?.flowState !== 'test_mode') {
      // Tentar forçar teste
      await sleep(50);
      const retryTest = await processAdminMessage(phone, "pode iniciar o teste, quero ver como funciona", undefined, undefined, true);
      responses.push(`[CLIENTE]: pode iniciar o teste, quero ver como funciona`);
      responses.push(`[RODRIGO]: ${retryTest.text}`);
    }
    
    // 7. TESTAR O AGENTE (simular cliente do cliente)
    currentPhase = "testing";
    await sleep(50);
    const sessionAfterTest = getClientSession(phone);
    if (sessionAfterTest?.flowState === 'test_mode') {
      const testMessage = await processAdminMessage(phone, "oi, quanto custa?", undefined, undefined, true);
      responses.push(`[CLIENTE TESTE]: oi, quanto custa?`);
      responses.push(`[AGENTE ${scenario.agent}]: ${testMessage.text}`);
    }
    
    // 8. SAIR DO TESTE
    currentPhase = "exit_test";
    await sleep(50);
    const exitResult = await processAdminMessage(phone, "#sair", undefined, undefined, true);
    responses.push(`[CLIENTE]: #sair`);
    responses.push(`[RODRIGO]: ${exitResult.text}`);
    
    // 9. VERIFICAR FOLLOW-UP
    currentPhase = "follow_up";
    const sessionFinal = getClientSession(phone);
    
    return {
      scenario: scenario.id,
      businessType: scenario.type,
      success: true,
      phase: "completed",
      duration: Date.now() - startTime,
      responses
    };
    
  } catch (error: any) {
    return {
      scenario: scenario.id,
      businessType: scenario.type,
      success: false,
      phase: currentPhase,
      error: error.message || String(error),
      duration: Date.now() - startTime,
      responses
    };
  }
}

// ============================================================================
// TESTES ESPECÍFICOS
// ============================================================================

async function testClearSession(): Promise<TestResult> {
  const phone = "5511999999999";
  const responses: string[] = [];
  const startTime = Date.now();
  
  try {
    // Criar sessão
    await processAdminMessage(phone, "oi quero um agente", undefined, undefined, true);
    responses.push("Criou sessão inicial");
    
    // Limpar
    const existed = clearClientSession(phone);
    responses.push(`clearClientSession retornou: ${existed}`);
    
    // Verificar se limpou
    const session = getClientSession(phone);
    if (session) throw new Error("Sessão ainda existe após limpar");
    responses.push("Sessão limpa com sucesso");
    
    // Entrar novamente
    const result = await processAdminMessage(phone, "oi", undefined, undefined, true);
    responses.push(`Novo contato: ${result.text.substring(0, 100)}...`);
    
    const newSession = getClientSession(phone);
    if (!newSession || newSession.flowState !== 'onboarding') {
      throw new Error("Nova sessão não iniciou corretamente");
    }
    responses.push("Nova sessão criada em onboarding");
    
    return {
      scenario: 0,
      businessType: "TESTE_LIMPAR",
      success: true,
      phase: "completed",
      duration: Date.now() - startTime,
      responses
    };
    
  } catch (error: any) {
    return {
      scenario: 0,
      businessType: "TESTE_LIMPAR",
      success: false,
      phase: "clear",
      error: error.message,
      duration: Date.now() - startTime,
      responses
    };
  }
}

async function testFollowUp(): Promise<TestResult> {
  const phone = "5511888888888";
  const responses: string[] = [];
  const startTime = Date.now();
  
  try {
    // Configurar agente mas não fechar
    await processAdminMessage(phone, "oi", undefined, undefined, true);
    await processAdminMessage(phone, "Loja Teste Follow", undefined, undefined, true);
    await processAdminMessage(phone, "Maria", undefined, undefined, true);
    await processAdminMessage(phone, "Atendente", undefined, undefined, true);
    await processAdminMessage(phone, "vende roupas femininas", undefined, undefined, true);
    responses.push("Configuração feita");
    
    // Simular follow-up
    const followUpResponse = await generateFollowUpResponse(phone, {
      type: 'no_response',
      lastMessage: 'ofereceu teste',
      minutesSinceLastInteraction: 60
    });
    
    if (!followUpResponse) throw new Error("Follow-up não gerou resposta");
    responses.push(`Follow-up: ${followUpResponse.substring(0, 100)}...`);
    
    return {
      scenario: 0,
      businessType: "TESTE_FOLLOWUP",
      success: true,
      phase: "completed",
      duration: Date.now() - startTime,
      responses
    };
    
  } catch (error: any) {
    return {
      scenario: 0,
      businessType: "TESTE_FOLLOWUP",
      success: false,
      phase: "followup",
      error: error.message,
      duration: Date.now() - startTime,
      responses
    };
  }
}

async function testHumanLikeConversations(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const phone = "5511777777777";
  
  const humanQuestions = [
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
  
  for (const question of humanQuestions) {
    clearClientSession(phone);
    const startTime = Date.now();
    
    try {
      const result = await processAdminMessage(phone, question, undefined, undefined, true);
      results.push({
        scenario: 0,
        businessType: `HUMAN: "${question}"`,
        success: result.text.length > 10 && !result.text.includes("undefined"),
        phase: "completed",
        duration: Date.now() - startTime,
        responses: [result.text]
      });
    } catch (error: any) {
      results.push({
        scenario: 0,
        businessType: `HUMAN: "${question}"`,
        success: false,
        phase: "conversation",
        error: error.message,
        duration: Date.now() - startTime,
        responses: []
      });
    }
    
    await sleep(30);
  }
  
  return results;
}

async function testActions(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  const phone = "5511666666666";
  
  // Teste de cada ação
  const actionTests = [
    { name: "SALVAR_CONFIG", messages: ["oi", "Loja Action Test", "Bot", "Atendente"] },
    { name: "INICIAR_TESTE", messages: ["oi", "Loja Teste", "Ana", "Vendedora", "vende roupas", "sim quero testar"] },
    { name: "SAIR_TESTE", messages: ["oi", "Loja Sair", "Bot", "Atendente", "faz X", "sim testa", "#sair"] },
  ];
  
  for (const test of actionTests) {
    clearClientSession(phone);
    const startTime = Date.now();
    const responses: string[] = [];
    
    try {
      for (const msg of test.messages) {
        const result = await processAdminMessage(phone, msg, undefined, undefined, true);
        responses.push(`[${msg}]: ${result.text?.substring(0, 50) || "vazio"}...`);
        await sleep(30);
      }
      
      results.push({
        scenario: 0,
        businessType: `ACTION: ${test.name}`,
        success: true,
        phase: "completed",
        duration: Date.now() - startTime,
        responses
      });
    } catch (error: any) {
      results.push({
        scenario: 0,
        businessType: `ACTION: ${test.name}`,
        success: false,
        phase: test.name,
        error: error.message,
        duration: Date.now() - startTime,
        responses
      });
    }
  }
  
  return results;
}

// ============================================================================
// RUNNER PRINCIPAL
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("🧪 TESTE MASSIVO DO ADMIN AGENT - 100 CENÁRIOS");
  console.log("═".repeat(70) + "\n");
  
  const allResults: TestResult[] = [];
  let successCount = 0;
  let failCount = 0;
  
  // 1. TESTES DE NEGÓCIOS (100 cenários)
  console.log("\n📋 TESTANDO 100 CENÁRIOS DE NEGÓCIO...\n");
  
  for (let i = 0; i < BUSINESS_SCENARIOS.length; i++) {
    const scenario = BUSINESS_SCENARIOS[i];
    const openingMessage = CLIENT_OPENING_MESSAGES[i % CLIENT_OPENING_MESSAGES.length];
    
    process.stdout.write(`[${i + 1}/100] ${scenario.type.padEnd(25)} `);
    
    const result = await simulateConversation(scenario, openingMessage);
    allResults.push(result);
    
    if (result.success) {
      successCount++;
      console.log(`✅ OK (${result.duration}ms)`);
    } else {
      failCount++;
      console.log(`❌ FALHA em ${result.phase}: ${result.error}`);
      if (VERBOSE) {
        console.log("  Respostas:", result.responses.slice(-4).join("\n  "));
      }
    }
    
    await sleep(DELAY_BETWEEN_TESTS);
  }
  
  // 2. TESTE DE LIMPAR SESSÃO
  console.log("\n📋 TESTANDO LIMPAR SESSÃO...\n");
  const clearResult = await testClearSession();
  allResults.push(clearResult);
  if (clearResult.success) {
    successCount++;
    console.log(`✅ Limpar sessão OK`);
  } else {
    failCount++;
    console.log(`❌ Limpar sessão FALHOU: ${clearResult.error}`);
  }
  
  // 3. TESTE DE FOLLOW-UP
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
  
  // 4. TESTES DE CONVERSA HUMANA
  console.log("\n📋 TESTANDO CONVERSAS HUMANAS...\n");
  const humanResults = await testHumanLikeConversations();
  for (const result of humanResults) {
    allResults.push(result);
    if (result.success) {
      successCount++;
      console.log(`✅ ${result.businessType}`);
    } else {
      failCount++;
      console.log(`❌ ${result.businessType}: ${result.error}`);
    }
  }
  
  // 5. TESTES DE AÇÕES
  console.log("\n📋 TESTANDO AÇÕES...\n");
  const actionResults = await testActions();
  for (const result of actionResults) {
    allResults.push(result);
    if (result.success) {
      successCount++;
      console.log(`✅ ${result.businessType}`);
    } else {
      failCount++;
      console.log(`❌ ${result.businessType}: ${result.error}`);
    }
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
      console.log(`  - [${r.scenario}] ${r.businessType}: ${r.error} (fase: ${r.phase})`);
    });
  }
  
  console.log("\n" + "═".repeat(70) + "\n");
}

// Executar
runAllTests().catch(console.error);
