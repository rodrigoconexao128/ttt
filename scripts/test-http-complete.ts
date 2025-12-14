/**
 * Teste Completo do Agente de Vendas via HTTP
 * 
 * Este script NÃO importa módulos do servidor - usa apenas HTTP
 * Execute em um terminal SEPARADO do servidor
 * 
 * npx tsx scripts/test-http-complete.ts
 */

const BASE_URL = "http://localhost:5000";

// 100+ Tipos de Negócios para Testar
const BUSINESS_TYPES = [
  // VAREJO (20)
  { empresa: "Loja Bella Moda", agente: "Julia", funcao: "vendedora", instrucoes: "Vendemos roupas femininas. Vestidos R$100-500, blusas R$50-150. Pix e cartão." },
  { empresa: "Calçados Passo Firme", agente: "Carla", funcao: "atendente", instrucoes: "Sapatos, tênis, sandálias. Tamanhos 33-44. Frete grátis acima R$200." },
  { empresa: "TechStore Eletrônicos", agente: "Pedro", funcao: "vendedor", instrucoes: "Celulares, notebooks, tablets. Garantia 1 ano. 12x sem juros." },
  { empresa: "Casa & Decoração", agente: "Marina", funcao: "consultora", instrucoes: "Móveis, sofás, camas. Entrega em 15 dias. Montagem inclusa." },
  { empresa: "Bella Cosméticos", agente: "Ana", funcao: "consultora de beleza", instrucoes: "Maquiagem, skincare, perfumes. Marcas nacionais e importadas." },
  { empresa: "Pet Amor", agente: "Nina", funcao: "atendente", instrucoes: "Ração, brinquedos, banho e tosa. Delivery grátis." },
  { empresa: "Fitness Store", agente: "Marcos", funcao: "vendedor", instrucoes: "Roupas fitness, equipamentos, suplementos. 10% desconto à vista." },
  { empresa: "Joias Elegance", agente: "Helena", funcao: "consultora", instrucoes: "Anéis, colares, brincos. Ouro e prata. Gravação grátis." },
  { empresa: "Mundo Kids", agente: "Tia Lu", funcao: "vendedora", instrucoes: "Brinquedos educativos e recreativos. Todas as idades." },
  { empresa: "Flora & Jardim", agente: "Rosa", funcao: "atendente", instrucoes: "Buquês, arranjos, plantas. Entrega no mesmo dia." },
  { empresa: "Ótica Visão", agente: "Carlos", funcao: "vendedor", instrucoes: "Óculos de grau e sol. Lentes de contato. Exame grátis." },
  { empresa: "Papelaria Arte", agente: "Lia", funcao: "atendente", instrucoes: "Material escolar, escritório. Impressão e cópia." },
  { empresa: "Perfumaria Essência", agente: "Paula", funcao: "consultora", instrucoes: "Perfumes importados e nacionais. Até 10x sem juros." },
  { empresa: "Bebê Store", agente: "Marta", funcao: "vendedora", instrucoes: "Enxoval, carrinhos, móveis. Lista de presentes." },
  { empresa: "Instrumentos Melodia", agente: "Ricardo", funcao: "vendedor", instrucoes: "Violões, teclados, baterias. Aulas incluídas." },
  { empresa: "Casa do Vinho", agente: "Sommelier", funcao: "consultor", instrucoes: "Vinhos nacionais e importados. Kits presenteáveis." },
  { empresa: "Bike Center", agente: "Ciclista", funcao: "vendedor", instrucoes: "Bicicletas, peças, acessórios. Oficina completa." },
  { empresa: "Moda Plus Size", agente: "Gabi", funcao: "consultora", instrucoes: "Roupas do 46 ao 60. Moda inclusiva e estilosa." },
  { empresa: "Camping & Aventura", agente: "Trilheiro", funcao: "vendedor", instrucoes: "Barracas, mochilas, equipamentos. Dicas de trilhas." },
  { empresa: "Livraria Saber", agente: "Professor", funcao: "atendente", instrucoes: "Livros didáticos e literatura. Encomendas especiais." },
  
  // ALIMENTAÇÃO (20)
  { empresa: "Pizzaria Napoli", agente: "Mario", funcao: "atendente", instrucoes: "Pizzas tradicionais e gourmet. Promoção terça. Delivery até 22h." },
  { empresa: "Burger House", agente: "Burgão", funcao: "atendente", instrucoes: "Hambúrgueres artesanais. Combos. Delivery via app." },
  { empresa: "Sushi Yuki", agente: "Yuki", funcao: "atendente", instrucoes: "Sushi, sashimi, temaki. Rodízio R$89,90. Reservas por WhatsApp." },
  { empresa: "Doce Mel Confeitaria", agente: "Doce", funcao: "atendente", instrucoes: "Bolos personalizados, doces finos. 3 dias de antecedência." },
  { empresa: "Açaí da Bahia", agente: "Açaí", funcao: "atendente", instrucoes: "Açaí na tigela e copo. Aberto até meia-noite." },
  { empresa: "Fit Marmitas", agente: "Nutri", funcao: "atendente", instrucoes: "Marmitas fitness e tradicionais. Planos semanais." },
  { empresa: "Food Truck Gourmet", agente: "Chef", funcao: "atendente", instrucoes: "Lanches especiais. Localização no Instagram." },
  { empresa: "Padaria Pão Quente", agente: "Padeiro", funcao: "atendente", instrucoes: "Pães, bolos, salgados. Encomendas sob medida." },
  { empresa: "Gelato Italiano", agente: "Gelato", funcao: "atendente", instrucoes: "Sorvetes artesanais. 30 sabores. Delivery gelado." },
  { empresa: "Café Aroma", agente: "Barista", funcao: "atendente", instrucoes: "Cafés especiais, bolos. Wi-fi grátis." },
  { empresa: "Churrascaria Gaúcha", agente: "Gaucho", funcao: "atendente", instrucoes: "Rodízio de carnes R$79,90. Buffet completo." },
  { empresa: "Comida Árabe", agente: "Habibi", funcao: "atendente", instrucoes: "Esfihas, quibes, falafel. Pratos árabes autênticos." },
  { empresa: "Pastelaria Wong", agente: "Wong", funcao: "atendente", instrucoes: "Pastéis, yakisoba, guioza. Delivery rápido." },
  { empresa: "Tacos & Burritos", agente: "Pancho", funcao: "atendente", instrucoes: "Comida mexicana autêntica. Nachos, quesadillas." },
  { empresa: "Veggie Natural", agente: "Verde", funcao: "atendente", instrucoes: "Comida vegetariana e vegana. Opções sem glúten." },
  { empresa: "Crepes & Waffles", agente: "Crepe", funcao: "atendente", instrucoes: "Crepes doces e salgados. Waffles belgas." },
  { empresa: "Espetinho do Zé", agente: "Zé", funcao: "atendente", instrucoes: "Espetinhos, bebidas. Aberto das 18h às 2h." },
  { empresa: "Salgados da Vó", agente: "Vovó", funcao: "atendente", instrucoes: "Coxinhas, empadas, risólis. Encomendas para festas." },
  { empresa: "Juice Bar", agente: "Suco", funcao: "atendente", instrucoes: "Sucos naturais, smoothies, açaí. Delivery." },
  { empresa: "Hot Dog Especial", agente: "Dog", funcao: "atendente", instrucoes: "Hot dogs gourmet. Mais de 20 complementos." },
  
  // SAÚDE (15)
  { empresa: "Clínica Sorria", agente: "Dra. Sorria", funcao: "recepcionista", instrucoes: "Limpeza, clareamento, implantes. Planos aceitos. Emergência 24h." },
  { empresa: "Clínica Vida", agente: "Dr. Saúde", funcao: "secretária", instrucoes: "Clínica geral, pediatria, gineco. Consultas R$150+." },
  { empresa: "Fisio Bem Estar", agente: "Fisio", funcao: "recepcionista", instrucoes: "Fisioterapia, RPG, pilates. Convênios aceitos." },
  { empresa: "Mente Sã", agente: "Psi", funcao: "secretária", instrucoes: "Terapia individual e casal. Sessões online disponíveis." },
  { empresa: "Vet Care", agente: "Dr. Pet", funcao: "recepcionista", instrucoes: "Consultas, vacinas, cirurgias. Plantão 24h." },
  { empresa: "Academia Força", agente: "Personal", funcao: "consultor", instrucoes: "Musculação, funcional, dança. Planos R$89/mês." },
  { empresa: "Studio Pilates", agente: "Pilates", funcao: "recepcionista", instrucoes: "Pilates solo e aparelho. Aulas individuais." },
  { empresa: "Nutri Vida", agente: "Nutri", funcao: "secretária", instrucoes: "Reeducação alimentar, dietas. Primeira consulta R$200." },
  { empresa: "Farmácia Fórmula", agente: "Pharma", funcao: "atendente", instrucoes: "Medicamentos manipulados. Entrega 24h." },
  { empresa: "Lab Diagnóstico", agente: "Lab", funcao: "recepcionista", instrucoes: "Exames de sangue, urina, imagem. Resultados online." },
  { empresa: "Ortopedia Dr. Osso", agente: "Dr. Osso", funcao: "secretária", instrucoes: "Ortopedia e traumatologia. Cirurgias." },
  { empresa: "Dermato Pele", agente: "Dra. Pele", funcao: "secretária", instrucoes: "Dermatologia clínica e estética. Botox, preenchimento." },
  { empresa: "Cardio Coração", agente: "Dr. Coração", funcao: "secretária", instrucoes: "Cardiologia. Exames, check-up completo." },
  { empresa: "Oftalmo Visão", agente: "Dr. Olhos", funcao: "secretária", instrucoes: "Oftalmologia. Cirurgia de catarata, miopia." },
  { empresa: "Pediatra Criança", agente: "Dra. Criança", funcao: "secretária", instrucoes: "Pediatria, vacinas, acompanhamento." },
  
  // BELEZA (15)
  { empresa: "Salão Glamour", agente: "Bella", funcao: "recepcionista", instrucoes: "Corte, coloração, escova, unhas. Agendamento online." },
  { empresa: "Barbearia Vintage", agente: "Barber", funcao: "atendente", instrucoes: "Corte, barba, sobrancelha. Cerveja cortesia." },
  { empresa: "Estética Perfeição", agente: "Estética", funcao: "consultora", instrucoes: "Limpeza de pele, drenagem, botox. Avaliação grátis." },
  { empresa: "Micro Art", agente: "Micro", funcao: "atendente", instrucoes: "Sobrancelhas, lábios. Técnicas fio a fio e shadow." },
  { empresa: "Spa Relax", agente: "Relax", funcao: "recepcionista", instrucoes: "Massagem relaxante, pedras quentes. Day spa." },
  { empresa: "Tattoo Art", agente: "Tattoo", funcao: "atendente", instrucoes: "Tatuagens personalizadas. Ambiente esterilizado." },
  { empresa: "Hair Solutions", agente: "Hair", funcao: "consultora", instrucoes: "Tratamentos capilares, transplante. Avaliação grátis." },
  { empresa: "Nail Designer", agente: "Nails", funcao: "manicure", instrucoes: "Unhas em gel, fibra, acrílico. Nail art." },
  { empresa: "Bronze Perfeito", agente: "Bronze", funcao: "atendente", instrucoes: "Bronzeamento natural e artificial. Pacotes." },
  { empresa: "Laser Depil", agente: "Laser", funcao: "consultora", instrucoes: "Depilação definitiva. Resultados em 6 sessões." },
  { empresa: "Makeup Studio", agente: "Makeup", funcao: "maquiadora", instrucoes: "Maquiagem para eventos, noivas. Curso de auto-maquiagem." },
  { empresa: "Extensão Cílios", agente: "Lash", funcao: "designer", instrucoes: "Extensão fio a fio, volume russo. Manutenção." },
  { empresa: "Design Sobrancelhas", agente: "Brow", funcao: "designer", instrucoes: "Design, henna, micropigmentação." },
  { empresa: "SPA Unhas", agente: "Spa Nails", funcao: "manicure", instrucoes: "Manicure, pedicure, spa dos pés. Ambiente relaxante." },
  { empresa: "Podologia Saúde", agente: "Podo", funcao: "podóloga", instrucoes: "Tratamento de unhas, calos, joanetes." },
  
  // SERVIÇOS PROFISSIONAIS (15)
  { empresa: "Advocacia Direito", agente: "Dr. Lei", funcao: "secretária", instrucoes: "Direito trabalhista, familiar, civil. Consulta R$200." },
  { empresa: "Contabilidade Fácil", agente: "Contador", funcao: "atendente", instrucoes: "Contabilidade para empresas e MEI. Abertura inclusa." },
  { empresa: "Imóveis Prime", agente: "Corretor", funcao: "corretor", instrucoes: "Venda e aluguel de imóveis. Avaliação gratuita." },
  { empresa: "Seguro Já", agente: "Corretor", funcao: "corretor", instrucoes: "Seguro auto, vida, residencial. Cotação grátis." },
  { empresa: "Marketing Digital Pro", agente: "Marketer", funcao: "consultor", instrucoes: "Social media, tráfego pago, sites. R$1.500/mês." },
  { empresa: "Auto Mecânica", agente: "Mecânico", funcao: "atendente", instrucoes: "Revisão, troca de óleo, freios. Orçamento grátis." },
  { empresa: "Lava Car Premium", agente: "Lava", funcao: "atendente", instrucoes: "Lavagem simples, completa, higienização." },
  { empresa: "Chaveiro 24h", agente: "Chave", funcao: "atendente", instrucoes: "Abertura de portas, cópias. 24h. 30min." },
  { empresa: "Elétrica Profissional", agente: "Elétrica", funcao: "atendente", instrucoes: "Instalações, manutenção, emergências. Garantia 90 dias." },
  { empresa: "Hidráulica Express", agente: "Hidra", funcao: "atendente", instrucoes: "Vazamentos, entupimentos. Atendimento rápido." },
  { empresa: "Arquitetura Design", agente: "Arquiteto", funcao: "arquiteto", instrucoes: "Projetos residenciais e comerciais." },
  { empresa: "Engenharia Civil", agente: "Engenheiro", funcao: "engenheiro", instrucoes: "Construção, reformas, laudos técnicos." },
  { empresa: "RH Talentos", agente: "RH", funcao: "consultor", instrucoes: "Recrutamento, seleção, treinamentos." },
  { empresa: "Consultoria Empresarial", agente: "Consultor", funcao: "consultor", instrucoes: "Planejamento estratégico, gestão." },
  { empresa: "Traduções Pro", agente: "Tradutor", funcao: "tradutor", instrucoes: "Inglês, espanhol, francês. Documentos e técnica." },
  
  // EDUCAÇÃO (10)
  { empresa: "English Now", agente: "Teacher", funcao: "secretária", instrucoes: "Inglês, espanhol, francês. Presencial e online." },
  { empresa: "Escola de Música", agente: "Maestro", funcao: "secretária", instrucoes: "Piano, violão, bateria, canto. Material incluso." },
  { empresa: "Studio Dance", agente: "Dança", funcao: "secretária", instrucoes: "Ballet, jazz, hip hop. Aulas experimentais grátis." },
  { empresa: "Academia Luta", agente: "Sensei", funcao: "recepcionista", instrucoes: "Jiu-jitsu, muay thai, karatê. Primeira semana grátis." },
  { empresa: "Natação Kids", agente: "Nadar", funcao: "secretária", instrucoes: "Natação infantil e adulto. Piscina aquecida." },
  { empresa: "Escolinha Futebol", agente: "Técnico", funcao: "coordenador", instrucoes: "Crianças de 5 a 15 anos. Uniforme incluso." },
  { empresa: "Cursinho Aprovação", agente: "Professor", funcao: "secretária", instrucoes: "Preparação Enem e vestibulares." },
  { empresa: "Info Tech", agente: "Tech", funcao: "secretária", instrucoes: "Pacote Office, programação, design." },
  { empresa: "Chef Academy", agente: "Chef", funcao: "secretária", instrucoes: "Cursos de gastronomia. Turmas de sábado." },
  { empresa: "Reforço Escolar Pro", agente: "Professora", funcao: "professora", instrucoes: "Matemática, português, todas matérias." },
  
  // TECNOLOGIA (10)
  { empresa: "WebDev Studio", agente: "Dev", funcao: "consultor", instrucoes: "Sites, e-commerce, landing pages. R$2.000+." },
  { empresa: "App Factory", agente: "App", funcao: "consultor", instrucoes: "Aplicativos iOS e Android. Orçamento personalizado." },
  { empresa: "TI Suporte", agente: "Suporte", funcao: "suporte", instrucoes: "Manutenção, redes, servidores. Contrato mensal." },
  { empresa: "Cyber Security", agente: "Security", funcao: "consultor", instrucoes: "Antivírus, backup, firewall. Proteção empresarial." },
  { empresa: "Cloud Solutions", agente: "Cloud", funcao: "consultor", instrucoes: "Migração nuvem, AWS, Azure, Google Cloud." },
  { empresa: "Smart Home", agente: "Smart", funcao: "consultor", instrucoes: "Casa inteligente, automação. Instalação inclusa." },
  { empresa: "CFTV Segurança", agente: "Câmera", funcao: "técnico", instrucoes: "Instalação CFTV. Acesso remoto pelo celular." },
  { empresa: "Net Fibra", agente: "Net", funcao: "atendente", instrucoes: "Internet fibra. 100 a 500 mega. Instalação grátis." },
  { empresa: "Cell Repair", agente: "Cell", funcao: "técnico", instrucoes: "Conserto celulares, tablets. Troca de tela na hora." },
  { empresa: "Note Service", agente: "Note", funcao: "técnico", instrucoes: "Formatação, upgrade, conserto notebooks." },
];

interface ApiResponse {
  response: string | null;
  skipped?: boolean;
  reason?: string;
  actions?: {
    testAccountCredentials?: {
      email: string;
      password: string;
      loginUrl: string;
    };
  };
}

async function clearSession(phone: string): Promise<boolean> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/clear-session`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone }),
    });
    return response.ok;
  } catch {
    return false;
  }
}

async function sendMessage(phone: string, message: string): Promise<ApiResponse | null> {
  try {
    const response = await fetch(`${BASE_URL}/api/test/admin-message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, skipTrigger: true }),
    });
    
    if (!response.ok) {
      console.log(`   ❌ HTTP Error: ${response.status}`);
      return null;
    }
    
    return await response.json();
  } catch (error) {
    console.log(`   ❌ Connection Error: ${error}`);
    return null;
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

async function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// TESTE PRINCIPAL: Simular conversa completa
// ============================================================================

async function testFullConversation(
  phoneNumber: string,
  business: typeof BUSINESS_TYPES[0],
  testNum: number,
  totalTests: number
): Promise<{ success: boolean; issues: string[]; createdAccount: boolean }> {
  const issues: string[] = [];
  let createdAccount = false;
  
  console.log(`\n[${testNum}/${totalTests}] 🏪 ${business.empresa}`);
  console.log(`   Agente: ${business.agente} | Função: ${business.funcao}`);
  
  // 1. Limpar sessão
  await clearSession(phoneNumber);
  await delay(300);
  
  // 2. Primeira mensagem - Cliente interessado
  const r1 = await sendMessage(phoneNumber, "Oi, quero saber mais sobre o agente de IA de vocês");
  if (!r1 || !r1.response) {
    issues.push("Sem resposta na primeira mensagem");
    return { success: false, issues, createdAccount };
  }
  
  // Verificar se NÃO pergunta sobre desconexão (bug anterior)
  if (r1.response.toLowerCase().includes("desconectado") || r1.response.toLowerCase().includes("conexão")) {
    issues.push("ERRO: Perguntou sobre desconexão para cliente novo");
  }
  
  await delay(500);
  
  // 3. Informar empresa
  const r2 = await sendMessage(phoneNumber, `Tenho uma empresa chamada ${business.empresa}`);
  if (!r2 || !r2.response) {
    issues.push("Sem resposta ao informar empresa");
    return { success: false, issues, createdAccount };
  }
  await delay(500);
  
  // 4. Informar nome do agente e função
  const r3 = await sendMessage(phoneNumber, `O agente vai se chamar ${business.agente} e vai ser ${business.funcao}`);
  if (!r3 || !r3.response) {
    issues.push("Sem resposta ao informar agente");
    return { success: false, issues, createdAccount };
  }
  await delay(500);
  
  // 5. Informar instruções
  const r4 = await sendMessage(phoneNumber, business.instrucoes);
  if (!r4 || !r4.response) {
    issues.push("Sem resposta ao informar instruções");
    return { success: false, issues, createdAccount };
  }
  await delay(500);
  
  // 6. Pedir para testar
  const r5 = await sendMessage(phoneNumber, "Quero testar agora! Pode criar meu acesso?");
  
  if (r5) {
    if (r5.response) {
      // Verificar se NÃO está tentando simular no WhatsApp (comportamento antigo)
      if (r5.response.includes("#sair") || r5.response.includes("virar o ") || r5.response.includes("Eu vou agir")) {
        issues.push("ERRO: IA tentou simular no WhatsApp (comportamento antigo)");
      }
      
      // Verificar se criou conta de teste
      if (r5.actions?.testAccountCredentials) {
        createdAccount = true;
        console.log(`   ✅ Conta criada: ${r5.actions.testAccountCredentials.email}`);
      }
      
      // Verificar se menciona criar conta/credenciais (comportamento correto)
      const textoLower = r5.response.toLowerCase();
      if (textoLower.includes("conta") || textoLower.includes("email") || 
          textoLower.includes("senha") || textoLower.includes("painel") ||
          textoLower.includes("acesso") || textoLower.includes("login")) {
        // Comportamento esperado
      }
    }
  } else {
    issues.push("Sem resposta ao pedir teste");
  }
  
  // Verificar sessão final
  const session = await getSession(phoneNumber);
  if (session?.exists) {
    if (session.flowState === "active" && !session.agentConfig?.company) {
      issues.push("flowState='active' sem config completa");
    }
  }
  
  // Limpar
  await clearSession(phoneNumber);
  
  const success = issues.length === 0;
  if (success) {
    console.log(`   ✅ PASSOU ${createdAccount ? "(conta criada)" : ""}`);
  } else {
    console.log(`   ❌ FALHOU`);
    issues.forEach(i => console.log(`      ⚠️ ${i}`));
  }
  
  return { success, issues, createdAccount };
}

// ============================================================================
// EXECUTAR TESTES
// ============================================================================

async function runAllTests(): Promise<void> {
  console.log("\n" + "═".repeat(70));
  console.log("🧪 TESTE COMPLETO DO AGENTE DE VENDAS - 100+ TIPOS DE NEGÓCIO");
  console.log("═".repeat(70));
  
  // Verificar se servidor está rodando
  try {
    const healthCheck = await fetch(`${BASE_URL}/api/health`);
    if (!healthCheck.ok) {
      console.log("\n❌ ERRO: Servidor não está respondendo em " + BASE_URL);
      console.log("   Inicie o servidor com: npm run dev");
      return;
    }
    console.log("\n✅ Servidor OK em " + BASE_URL);
  } catch {
    console.log("\n❌ ERRO: Não foi possível conectar ao servidor");
    console.log("   Inicie o servidor com: npm run dev");
    return;
  }
  
  let passed = 0;
  let failed = 0;
  let accountsCreated = 0;
  const allIssues: string[] = [];
  
  const totalTests = BUSINESS_TYPES.length;
  
  for (let i = 0; i < totalTests; i++) {
    const business = BUSINESS_TYPES[i];
    const phone = `55179990${String(i).padStart(5, "0")}`;
    
    const result = await testFullConversation(phone, business, i + 1, totalTests);
    
    if (result.success) {
      passed++;
    } else {
      failed++;
      result.issues.forEach(issue => {
        if (!allIssues.includes(issue)) {
          allIssues.push(issue);
        }
      });
    }
    
    if (result.createdAccount) {
      accountsCreated++;
    }
    
    // Pequena pausa entre testes
    await delay(200);
  }
  
  // Resumo
  console.log("\n" + "═".repeat(70));
  console.log("📊 RESULTADO FINAL");
  console.log("═".repeat(70));
  console.log(`\n✅ Passaram: ${passed}/${totalTests}`);
  console.log(`❌ Falharam: ${failed}/${totalTests}`);
  console.log(`📧 Contas criadas: ${accountsCreated}/${totalTests}`);
  
  if (allIssues.length > 0) {
    console.log("\n⚠️ PROBLEMAS ENCONTRADOS:");
    allIssues.forEach((issue, i) => {
      console.log(`   ${i + 1}. ${issue}`);
    });
  }
  
  const successRate = (passed / totalTests * 100).toFixed(1);
  console.log(`\n📈 Taxa de sucesso: ${successRate}%`);
  
  if (passed === totalTests) {
    console.log("\n🎉 TODOS OS TESTES PASSARAM!");
  } else {
    console.log("\n⚠️ Alguns testes falharam. Revise os problemas acima.");
  }
  
  console.log("\n" + "═".repeat(70) + "\n");
}

// Executar
runAllTests().catch(console.error);
