/**
 * Script de Testes Automatizados para o Agente de Vendas
 * 
 * Este script simula 100+ tipos diferentes de negócios interagindo com o agente de vendas
 * para testar a qualidade das respostas, persuasão e fluxo de vendas.
 * 
 * Execute com: npx tsx scripts/test-sales-agent.ts
 */

import { processAdminMessage, clearClientSession } from "../server/adminAgentService";

// ============================================================================
// TIPOS DE NEGÓCIOS (100+)
// ============================================================================

const businessTypes = [
  // VAREJO
  { name: "Loja de Roupas Femininas", agent: "Carla", role: "vendedora", prompt: "Vendemos vestidos, blusas, calças. Preços de R$50 a R$300. Aceitamos pix e cartão." },
  { name: "Loja de Calçados", agent: "Laura", role: "atendente", prompt: "Sapatos, tênis, sandálias. Tamanhos 33 ao 44. Frete grátis acima de R$200." },
  { name: "Loja de Eletrônicos", agent: "Pedro", role: "vendedor", prompt: "Celulares, notebooks, tablets. Garantia de 1 ano. Parcelamos em até 12x." },
  { name: "Loja de Móveis", agent: "João", role: "consultor", prompt: "Sofás, camas, armários. Entrega em até 15 dias. Montagem inclusa." },
  { name: "Loja de Cosméticos", agent: "Bruna", role: "consultora de beleza", prompt: "Maquiagem, skincare, perfumes. Marcas nacionais e importadas." },
  { name: "Pet Shop", agent: "Nina", role: "atendente", prompt: "Ração, brinquedos, banho e tosa. Delivery para toda cidade." },
  { name: "Loja de Artigos Esportivos", agent: "Marcos", role: "vendedor", prompt: "Roupas fitness, equipamentos, suplementos. Damos 10% de desconto à vista." },
  { name: "Joalheria", agent: "Helena", role: "consultora", prompt: "Anéis, colares, brincos. Ouro e prata. Gravação grátis." },
  { name: "Loja de Brinquedos", agent: "Tia Lu", role: "vendedora", prompt: "Brinquedos educativos e recreativos. Para todas as idades." },
  { name: "Floricultura", agent: "Rosa", role: "atendente", prompt: "Buquês, arranjos, plantas. Entrega no mesmo dia." },
  
  // ALIMENTAÇÃO
  { name: "Pizzaria", agent: "Mario", role: "atendente", prompt: "Pizzas tradicionais e gourmet. Promoção terça e quarta. Delivery até 22h." },
  { name: "Hamburgueria", agent: "Burgão", role: "atendente", prompt: "Hambúrgueres artesanais. Combos com batata e refri. Delivery via app." },
  { name: "Restaurante Japonês", agent: "Yuki", role: "atendente", prompt: "Sushi, sashimi, temaki. Rodízio R$89,90. Reservas pelo WhatsApp." },
  { name: "Confeitaria", agent: "Doce", role: "atendente", prompt: "Bolos personalizados, doces finos. Encomendas com 3 dias de antecedência." },
  { name: "Açaiteria", agent: "Açaí", role: "atendente", prompt: "Açaí na tigela e copo. Vários complementos. Aberto até meia-noite." },
  { name: "Marmitaria", agent: "Marmita", role: "atendente", prompt: "Marmitas fitness e tradicionais. Planos semanais com desconto." },
  { name: "Food Truck", agent: "Truck", role: "atendente", prompt: "Lanches especiais. Veja onde estamos hoje no Instagram." },
  { name: "Padaria", agent: "Padeiro", role: "atendente", prompt: "Pães, bolos, salgados. Fresquinhos todo dia. Encomendas sob medida." },
  { name: "Sorveteria", agent: "Gelato", role: "atendente", prompt: "Sorvetes artesanais. 30 sabores. Delivery gelado garantido." },
  { name: "Cafeteria", agent: "Café", role: "barista", prompt: "Cafés especiais, bolos, lanches. Wi-fi grátis. Ambiente climatizado." },
  
  // SAÚDE
  { name: "Clínica Odontológica", agent: "Dra. Sorria", role: "recepcionista", prompt: "Limpeza, clareamento, implantes. Aceitamos planos. Emergência 24h." },
  { name: "Clínica Médica", agent: "Dr. Saúde", role: "secretária", prompt: "Clínica geral, pediatria, ginecologia. Consultas a partir de R$150." },
  { name: "Clínica de Fisioterapia", agent: "Fisio", role: "recepcionista", prompt: "Fisioterapia, RPG, pilates. Atendemos convênios." },
  { name: "Clínica de Psicologia", agent: "Psi", role: "secretária", prompt: "Terapia individual e de casal. Sessões online disponíveis." },
  { name: "Clínica Veterinária", agent: "Dr. Pet", role: "recepcionista", prompt: "Consultas, vacinas, cirurgias. Plantão 24h. Internação disponível." },
  { name: "Academia de Musculação", agent: "Fit", role: "consultor", prompt: "Musculação, funcional, dança. Planos a partir de R$89/mês." },
  { name: "Estúdio de Pilates", agent: "Pilates", role: "recepcionista", prompt: "Pilates solo e aparelho. Aulas individuais e em grupo." },
  { name: "Clínica de Nutrição", agent: "Nutri", role: "secretária", prompt: "Reeducação alimentar, dietas personalizadas. Primeira consulta R$200." },
  { name: "Farmácia de Manipulação", agent: "Pharma", role: "atendente", prompt: "Medicamentos manipulados. Entrega em 24h. Receitas online." },
  { name: "Laboratório de Análises", agent: "Lab", role: "recepcionista", prompt: "Exames de sangue, urina, imagem. Resultados online. Atendemos convênios." },
  
  // BELEZA
  { name: "Salão de Beleza", agent: "Bella", role: "recepcionista", prompt: "Corte, coloração, escova, unhas. Agendamento online." },
  { name: "Barbearia", agent: "Barber", role: "atendente", prompt: "Corte, barba, sobrancelha. Ambiente masculino. Cerveja cortesia." },
  { name: "Clínica de Estética", agent: "Estética", role: "consultora", prompt: "Limpeza de pele, drenagem, botox. Avaliação gratuita." },
  { name: "Estúdio de Micropigmentação", agent: "Micro", role: "atendente", prompt: "Sobrancelhas, lábios, olhos. Técnicas fio a fio e shadow." },
  { name: "Espaço de Massagem", agent: "Relax", role: "recepcionista", prompt: "Relaxante, shiatsu, pedras quentes. Day spa disponível." },
  { name: "Estúdio de Tatuagem", agent: "Tattoo", role: "atendente", prompt: "Tatuagens personalizadas. Orçamento por WhatsApp. Ambiente esterilizado." },
  { name: "Clínica Capilar", agent: "Hair", role: "consultora", prompt: "Tratamentos capilares, transplante. Primeira avaliação grátis." },
  { name: "Esmalteria", agent: "Nails", role: "manicure", prompt: "Unhas em gel, fibra, acrílico. Nail art. Atendimento sem hora marcada." },
  { name: "Bronzeamento", agent: "Bronze", role: "atendente", prompt: "Bronzeamento natural e artificial. Pacotes especiais." },
  { name: "Depilação a Laser", agent: "Laser", role: "consultora", prompt: "Depilação definitiva. Tecnologia de última geração. Resultados em 6 sessões." },
  
  // SERVIÇOS
  { name: "Escritório de Advocacia", agent: "Dr. Lei", role: "secretária", prompt: "Direito trabalhista, familiar, civil. Consulta inicial R$200." },
  { name: "Escritório de Contabilidade", agent: "Contador", role: "atendente", prompt: "Contabilidade para empresas e MEI. Abertura de empresa inclusa." },
  { name: "Imobiliária", agent: "Imóveis", role: "corretor", prompt: "Venda e aluguel de imóveis. Avaliação gratuita." },
  { name: "Corretora de Seguros", agent: "Seguro", role: "corretor", prompt: "Seguro auto, vida, residencial. Cotação grátis em 5 minutos." },
  { name: "Agência de Marketing", agent: "Marketing", role: "consultor", prompt: "Social media, tráfego pago, sites. Pacotes a partir de R$1.500/mês." },
  { name: "Oficina Mecânica", agent: "Mecânico", role: "atendente", prompt: "Revisão, troca de óleo, freios. Orçamento grátis. Carro reserva." },
  { name: "Lava Jato", agent: "Lava", role: "atendente", prompt: "Lavagem simples, completa, higienização. Agendamento por WhatsApp." },
  { name: "Chaveiro 24h", agent: "Chave", role: "atendente", prompt: "Abertura de portas, cópias de chaves. Atendimento 24h. Chegamos em 30min." },
  { name: "Eletricista", agent: "Elétrica", role: "atendente", prompt: "Instalações, manutenção, emergências. Orçamento grátis. Garantia de 90 dias." },
  { name: "Encanador", agent: "Hidra", role: "atendente", prompt: "Vazamentos, entupimentos, instalações. Atendimento rápido." },
  
  // EDUCAÇÃO
  { name: "Escola de Idiomas", agent: "English", role: "secretária", prompt: "Inglês, espanhol, francês. Turmas presenciais e online. Matrícula grátis." },
  { name: "Escola de Música", agent: "Música", role: "secretária", prompt: "Piano, violão, bateria, canto. Aulas individuais. Material incluso." },
  { name: "Escola de Dança", agent: "Dança", role: "secretária", prompt: "Ballet, jazz, hip hop, forró. Aulas experimentais grátis." },
  { name: "Escola de Artes Marciais", agent: "Sensei", role: "recepcionista", prompt: "Jiu-jitsu, muay thai, karatê. Primeira semana grátis." },
  { name: "Escola de Natação", agent: "Nadar", role: "secretária", prompt: "Natação infantil e adulto. Hidroginástica. Piscina aquecida." },
  { name: "Escola de Futebol", agent: "Goleiro", role: "coordenador", prompt: "Escolinha para crianças de 5 a 15 anos. Uniforme incluso." },
  { name: "Cursinho Pré-Vestibular", agent: "Vestiba", role: "secretária", prompt: "Preparação para Enem e vestibulares. Aprovação garantida." },
  { name: "Escola de Informática", agent: "Tech", role: "secretária", prompt: "Pacote Office, programação, design. Certificado reconhecido." },
  { name: "Escola de Culinária", agent: "Chef", role: "secretária", prompt: "Cursos práticos de gastronomia. Turmas de sábado disponíveis." },
  { name: "Reforço Escolar", agent: "Estudo", role: "professora", prompt: "Matemática, português, todas as matérias. Atendimento individual." },
  
  // EVENTOS
  { name: "Buffet de Festas", agent: "Festa", role: "consultor", prompt: "Festas infantis, casamentos, corporativo. Decoração inclusa." },
  { name: "Fotógrafo", agent: "Foto", role: "atendente", prompt: "Ensaios, casamentos, eventos. Pacotes com álbum. Entrega em 30 dias." },
  { name: "Filmagem de Eventos", agent: "Cine", role: "produtor", prompt: "Vídeos de casamento, formaturas, institucional. Drone incluso." },
  { name: "DJ para Festas", agent: "DJ", role: "atendente", prompt: "Festas, casamentos, formaturas. Equipamento completo. Iluminação." },
  { name: "Decorador de Festas", agent: "Decor", role: "decoradora", prompt: "Festas temáticas, casamentos, 15 anos. Montagem e desmontagem." },
  { name: "Cerimonialista", agent: "Ceri", role: "cerimonialista", prompt: "Organização completa do seu evento. Assessoria do início ao fim." },
  { name: "Casa de Festas", agent: "Salão", role: "atendente", prompt: "Aluguel de espaço para festas. Capacidade para 300 pessoas." },
  { name: "Florista para Eventos", agent: "Flor", role: "florista", prompt: "Arranjos para casamentos e eventos. Buquês de noiva." },
  { name: "Locação de Móveis", agent: "Móvel", role: "atendente", prompt: "Mesas, cadeiras, louças para eventos. Entrega e retirada." },
  { name: "Animador de Festas", agent: "Alegria", role: "recreador", prompt: "Animação infantil, personagens, brinquedos. Pacotes de 2 a 4 horas." },
  
  // TECNOLOGIA
  { name: "Desenvolvimento de Sites", agent: "Web", role: "consultor", prompt: "Sites, e-commerce, landing pages. A partir de R$2.000." },
  { name: "Desenvolvimento de Apps", agent: "App", role: "consultor", prompt: "Aplicativos iOS e Android. Orçamento personalizado." },
  { name: "Suporte de TI", agent: "TI", role: "suporte", prompt: "Manutenção de computadores, redes, servidores. Contrato mensal." },
  { name: "Segurança Digital", agent: "Seguro", role: "consultor", prompt: "Antivírus, backup, firewall. Proteção para empresas." },
  { name: "Consultoria em Nuvem", agent: "Cloud", role: "consultor", prompt: "Migração para nuvem, AWS, Azure, Google Cloud." },
  { name: "Automação Residencial", agent: "Smart", role: "consultor", prompt: "Casa inteligente, Alexa, automação. Instalação inclusa." },
  { name: "Câmeras de Segurança", agent: "Câmera", role: "técnico", prompt: "Instalação de CFTV. Acesso remoto pelo celular." },
  { name: "Provedor de Internet", agent: "Net", role: "atendente", prompt: "Internet fibra. Planos de 100 a 500 mega. Instalação grátis." },
  { name: "Assistência Técnica Celular", agent: "Cell", role: "técnico", prompt: "Conserto de celulares e tablets. Troca de tela na hora." },
  { name: "Assistência Técnica Notebook", agent: "Note", role: "técnico", prompt: "Formatação, upgrade, conserto. Orçamento grátis." },
  
  // CONSTRUÇÃO
  { name: "Construtora", agent: "Obras", role: "engenheiro", prompt: "Construção residencial e comercial. Orçamento sem compromisso." },
  { name: "Arquiteto", agent: "Arq", role: "arquiteto", prompt: "Projetos residenciais e comerciais. Acompanhamento de obra." },
  { name: "Designer de Interiores", agent: "Design", role: "designer", prompt: "Projetos de decoração. Maquetes 3D. Consultoria online." },
  { name: "Loja de Materiais de Construção", agent: "Material", role: "vendedor", prompt: "Cimento, tijolos, acabamentos. Entrega em obra." },
  { name: "Vidraçaria", agent: "Vidro", role: "atendente", prompt: "Box, espelhos, vitrines, janelas. Instalação inclusa." },
  { name: "Marmoraria", agent: "Mármore", role: "atendente", prompt: "Pias, bancadas, pisos em mármore e granito." },
  { name: "Serralheria", agent: "Ferro", role: "serralheiro", prompt: "Portões, grades, corrimãos. Orçamento no local." },
  { name: "Pintor", agent: "Pintura", role: "pintor", prompt: "Pintura residencial e comercial. Acabamento de qualidade." },
  { name: "Jardinagem", agent: "Jardim", role: "jardineiro", prompt: "Manutenção de jardins, paisagismo, poda." },
  { name: "Desentupidora", agent: "Desentope", role: "atendente", prompt: "Desentupimento de pias, ralos, esgotos. Atendimento 24h." },
  
  // AUTOMOTIVO
  { name: "Concessionária de Carros", agent: "Auto", role: "vendedor", prompt: "Carros novos e seminovos. Financiamento facilitado." },
  { name: "Loja de Pneus", agent: "Pneu", role: "vendedor", prompt: "Pneus nacionais e importados. Alinhamento e balanceamento." },
  { name: "Autopeças", agent: "Peças", role: "vendedor", prompt: "Peças originais e alternativas. Entrega express." },
  { name: "Som Automotivo", agent: "Som", role: "instalador", prompt: "Instalação de som, multimídia, alarme. Garantia de 1 ano." },
  { name: "Polimento Automotivo", agent: "Brilho", role: "atendente", prompt: "Polimento, cristalização, vitrificação. Proteção por 1 ano." },
  { name: "Guincho 24h", agent: "Guincho", role: "atendente", prompt: "Serviço de guincho e reboque. Atendimento 24h. Chegamos em 40min." },
  { name: "Despachante", agent: "Despacho", role: "despachante", prompt: "Transferência, licenciamento, multas. Atendemos via WhatsApp." },
  { name: "Auto Escola", agent: "Habilitação", role: "secretária", prompt: "Aulas teóricas e práticas. Primeira habilitação e reciclagem." },
  { name: "Aluguel de Carros", agent: "Rent", role: "atendente", prompt: "Aluguel diário, semanal, mensal. Frota diversificada." },
  { name: "Estacionamento", agent: "Park", role: "atendente", prompt: "Estacionamento coberto e descoberto. Mensalidade disponível." },
  
  // OUTROS
  { name: "Hotel", agent: "Hotel", role: "recepcionista", prompt: "Quartos standard, luxo e suíte. Café da manhã incluso." },
  { name: "Pousada", agent: "Pousada", role: "recepcionista", prompt: "Ambiente familiar. Piscina e área de lazer. Pet friendly." },
  { name: "Agência de Viagens", agent: "Viagem", role: "agente", prompt: "Pacotes nacionais e internacionais. Parcelamos em até 10x." },
  { name: "Funerária", agent: "Funeral", role: "atendente", prompt: "Serviços funerários completos. Atendimento 24h. Planos assistenciais." },
  { name: "Lavanderia", agent: "Lavanderia", role: "atendente", prompt: "Lavagem de roupas, cama e banho. Entrega em domicílio." },
  { name: "Costureira", agent: "Costura", role: "costureira", prompt: "Ajustes, consertos, roupas sob medida. Orçamento por foto." },
  { name: "Gráfica", agent: "Gráfica", role: "atendente", prompt: "Cartões, panfletos, banners. Entrega rápida." },
  { name: "Papelaria", agent: "Papel", role: "vendedora", prompt: "Material escolar e escritório. Impressão e cópia." },
  { name: "Cartório", agent: "Cartório", role: "atendente", prompt: "Reconhecimento de firma, autenticação, certidões. Agendamento online." },
  { name: "Despachante Aduaneiro", agent: "Aduaneiro", role: "despachante", prompt: "Importação e exportação. Consultoria tributária." },
];

// ============================================================================
// CENÁRIOS DE CONVERSA
// ============================================================================

interface ConversationScenario {
  name: string;
  messages: string[];
  expectedBehaviors: string[];
}

const conversationScenarios: ConversationScenario[] = [
  {
    name: "Cliente curioso - quer saber mais",
    messages: [
      "Oi, vi um anúncio de vocês. O que é isso?",
      "Interessante... mas como funciona na prática?",
      "E quanto custa?",
    ],
    expectedBehaviors: [
      "Deve responder de forma acolhedora",
      "Deve explicar o produto claramente",
      "Deve coletar informações sobre o negócio",
    ],
  },
  {
    name: "Cliente direto - quer testar",
    messages: [
      "Quero testar o agente de IA de vocês",
      "Tenho uma loja de roupas chamada Modas Fashion",
      "A atendente vai se chamar Julia e vai vender roupas femininas",
      "Ela deve informar que temos vestidos de R$100 a R$500, blusas de R$50 a R$150, aceitamos pix e cartão",
    ],
    expectedBehaviors: [
      "Deve criar conta de teste",
      "Deve enviar credenciais de acesso",
      "Deve explicar como acessar o painel",
    ],
  },
  {
    name: "Cliente com objeção - acha caro",
    messages: [
      "Oi, queria saber mais sobre a IA",
      "Legal, mas R$99 por mês é muito caro pra mim",
      "Sei lá, não sei se compensa",
    ],
    expectedBehaviors: [
      "Deve usar técnicas de contorno de objeções",
      "Deve comparar com custo de funcionário",
      "Deve oferecer teste grátis",
    ],
  },
  {
    name: "Cliente desconfiado - já tentou chatbot",
    messages: [
      "Isso é tipo aqueles chatbots ruins?",
      "Já usei um e era horrível, só tinha botão",
      "Mas o meu negócio é diferente, acho que não funciona",
    ],
    expectedBehaviors: [
      "Deve diferenciar de chatbot comum",
      "Deve mostrar que é IA conversacional",
      "Deve oferecer teste para provar",
    ],
  },
  {
    name: "Cliente ocupado - quer pensar",
    messages: [
      "Opa, vi sua propaganda",
      "Legal, mas agora to sem tempo, depois vejo",
    ],
    expectedBehaviors: [
      "Deve tentar manter o interesse",
      "Deve oferecer agendamento de retorno",
      "Deve ser respeitoso com o tempo do cliente",
    ],
  },
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function simulateConversation(
  phoneNumber: string,
  messages: string[],
  businessInfo?: { name: string; agent: string; role: string; prompt: string }
): Promise<{ responses: string[]; success: boolean; issues: string[] }> {
  const responses: string[] = [];
  const issues: string[] = [];
  
  // Limpar sessão anterior
  clearClientSession(phoneNumber);
  
  for (const message of messages) {
    try {
      const response = await processAdminMessage(phoneNumber, message, undefined, undefined, true);
      
      if (response) {
        responses.push(response.text);
        
        // Verificar qualidade da resposta
        if (response.text.length < 50) {
          issues.push(`Resposta muito curta: "${response.text.substring(0, 100)}..."`);
        }
        
        if (response.text.includes("**") || response.text.includes("##")) {
          issues.push("Resposta contém markdown");
        }
        
        // Verificar se criou conta de teste quando deveria
        if (response.actions?.testAccountCredentials) {
          console.log(`  ✅ Conta de teste criada: ${response.actions.testAccountCredentials.email}`);
        }
      } else {
        responses.push("[SEM RESPOSTA]");
        issues.push("Nenhuma resposta retornada");
      }
    } catch (error) {
      responses.push(`[ERRO: ${error}]`);
      issues.push(`Erro ao processar mensagem: ${error}`);
    }
    
    // Delay entre mensagens
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  
  // Limpar sessão após teste
  clearClientSession(phoneNumber);
  
  return {
    responses,
    success: issues.length === 0,
    issues,
  };
}

async function runBusinessTypeTests(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: Diferentes Tipos de Negócio");
  console.log("═══════════════════════════════════════════════════════════════════\n");
  
  let passed = 0;
  let failed = 0;
  
  // Testar apenas 10 negócios para não demorar muito
  const sampled = businessTypes.slice(0, 10);
  
  for (let i = 0; i < sampled.length; i++) {
    const business = sampled[i];
    const phoneNumber = `559999000${String(i).padStart(3, "0")}`;
    
    console.log(`\n[${i + 1}/${sampled.length}] Testando: ${business.name}`);
    console.log(`  Agente: ${business.agent} | Função: ${business.role}`);
    
    const messages = [
      "Oi, quero criar um agente de IA",
      `A empresa é ${business.name}`,
      `O agente vai se chamar ${business.agent} e vai ser ${business.role}`,
      business.prompt,
      "Quero testar agora",
    ];
    
    const result = await simulateConversation(phoneNumber, messages, business);
    
    if (result.success) {
      console.log(`  ✅ PASSOU`);
      passed++;
    } else {
      console.log(`  ❌ FALHOU`);
      result.issues.forEach(issue => console.log(`    ⚠️ ${issue}`));
      failed++;
    }
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════════");
  console.log(`📊 RESULTADO: ${passed} passaram, ${failed} falharam`);
  console.log("═══════════════════════════════════════════════════════════════════\n");
}

async function runScenarioTests(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("🎭 TESTE: Cenários de Conversa");
  console.log("═══════════════════════════════════════════════════════════════════\n");
  
  for (let i = 0; i < conversationScenarios.length; i++) {
    const scenario = conversationScenarios[i];
    const phoneNumber = `559998000${String(i).padStart(3, "0")}`;
    
    console.log(`\n[${i + 1}/${conversationScenarios.length}] Cenário: ${scenario.name}`);
    console.log("  Comportamentos esperados:");
    scenario.expectedBehaviors.forEach(b => console.log(`    • ${b}`));
    
    console.log("\n  Simulando conversa...");
    
    const result = await simulateConversation(phoneNumber, scenario.messages);
    
    console.log("\n  Respostas do agente:");
    result.responses.forEach((r, idx) => {
      console.log(`    [${idx + 1}] ${r.substring(0, 150)}${r.length > 150 ? '...' : ''}`);
    });
    
    if (!result.success) {
      console.log("\n  ⚠️ Problemas encontrados:");
      result.issues.forEach(issue => console.log(`    • ${issue}`));
    }
  }
}

async function runStressTest(numConversations: number = 20): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`🔥 TESTE DE STRESS: ${numConversations} conversas simultâneas`);
  console.log("═══════════════════════════════════════════════════════════════════\n");
  
  const startTime = Date.now();
  const promises: Promise<void>[] = [];
  
  for (let i = 0; i < numConversations; i++) {
    const phoneNumber = `559997000${String(i).padStart(3, "0")}`;
    const business = businessTypes[i % businessTypes.length];
    
    const promise = (async () => {
      await simulateConversation(phoneNumber, [
        "Oi, quero saber mais sobre a IA",
        `Tenho uma ${business.name}`,
      ]);
    })();
    
    promises.push(promise);
  }
  
  await Promise.all(promises);
  
  const duration = (Date.now() - startTime) / 1000;
  console.log(`\n✅ ${numConversations} conversas processadas em ${duration.toFixed(2)}s`);
  console.log(`   Média: ${(duration / numConversations * 1000).toFixed(0)}ms por conversa`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("\n🚀 INICIANDO TESTES DO AGENTE DE VENDAS\n");
  console.log("═══════════════════════════════════════════════════════════════════\n");
  
  const args = process.argv.slice(2);
  const testType = args[0] || "all";
  
  switch (testType) {
    case "business":
      await runBusinessTypeTests();
      break;
    case "scenarios":
      await runScenarioTests();
      break;
    case "stress":
      const count = parseInt(args[1]) || 20;
      await runStressTest(count);
      break;
    case "all":
    default:
      await runScenarioTests();
      await runBusinessTypeTests();
      break;
  }
  
  console.log("\n✅ TESTES FINALIZADOS\n");
}

// Executar
main().catch(console.error);
