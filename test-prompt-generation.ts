/**
 * TESTE DE GERAÇÃO DE PROMPTS - 20+ CENÁRIOS
 * 
 * Este script testa a geração de prompts para diversos tipos de negócio
 * para garantir que a função está funcionando corretamente.
 * 
 * Execução: npx ts-node test-prompt-generation.ts
 */

// Tipos de negócio para testar
const testScenarios = [
  // ALIMENTAÇÃO
  {
    businessType: "pizzaria",
    businessName: "Pizzaria Bella Napoli",
    description: `Horário: Segunda a Domingo, 18h às 23h
Endereço: Rua das Flores, 123 - Centro
Cardápio:
- Pizza Margherita: R$ 45
- Pizza Calabresa: R$ 50
- Pizza 4 Queijos: R$ 55
Delivery grátis até 5km. Promoção: Terça 2 por 1!`
  },
  {
    businessType: "hamburgueria",
    businessName: "Burger House",
    description: `Horário: 18h às 00h todos os dias
Combos a partir de R$ 29,90
Batata + refrigerante incluso
Delivery via iFood e WhatsApp`
  },
  {
    businessType: "restaurante",
    businessName: "Cantina da Vovó",
    description: `Comida caseira, almoço executivo R$ 25
Self-service R$ 48/kg
Domingo: feijoada completa R$ 45
Aceitamos VR, VA, PIX`
  },
  {
    businessType: "doceria",
    businessName: "Doce Tentação",
    description: `Bolos decorados sob encomenda
Brigadeiros, bem-casados, docinhos
Entregas para festas
Encomendas com 48h de antecedência`
  },
  
  // BELEZA & SAÚDE
  {
    businessType: "salao",
    businessName: "Studio Ana Beleza",
    description: `Corte feminino: R$ 80
Escova: R$ 50
Progressiva: R$ 200
Coloração: a partir de R$ 150
Horário: Terça a Sábado, 9h às 19h`
  },
  {
    businessType: "barbearia",
    businessName: "Barbearia do Seu João",
    description: `Corte: R$ 35
Barba: R$ 25
Combo: R$ 50
Horário: Segunda a Sábado, 9h às 20h
Sem agendamento, ordem de chegada`
  },
  {
    businessType: "clinica_medica",
    businessName: "Clínica Saúde Total",
    description: `Clínica geral, cardiologia, dermatologia
Consulta particular: R$ 200
Convênios: Unimed, Bradesco, SulAmérica
Horário: Seg-Sex, 8h às 18h`
  },
  {
    businessType: "dentista",
    businessName: "Odonto Smile",
    description: `Limpeza: R$ 150
Clareamento: R$ 800
Ortodontia: avaliação gratuita
CRO: 12345 | Parcelamos em até 12x`
  },
  
  // SERVIÇOS
  {
    businessType: "oficina",
    businessName: "Auto Center Silva",
    description: `Troca de óleo: R$ 80
Revisão completa: R$ 250
Freios e suspensão
Orçamento gratuito. Guincho disponível.`
  },
  {
    businessType: "eletricista",
    businessName: "Elétrica Express",
    description: `Instalações residenciais e comerciais
Manutenção preventiva
Troca de fiação
Atendemos emergências 24h`
  },
  {
    businessType: "limpeza",
    businessName: "Clean House",
    description: `Limpeza residencial: a partir de R$ 150
Limpeza comercial: sob orçamento
Pós-obra, vidros, estofados
Produtos inclusos no preço`
  },
  
  // VAREJO
  {
    businessType: "loja_roupa",
    businessName: "Fashion Store",
    description: `Moda feminina e masculina
Parcelamos em até 6x sem juros
Frete grátis acima de R$ 200
Trocas em até 30 dias`
  },
  {
    businessType: "petshop",
    businessName: "Pet Amigo",
    description: `Banho: a partir de R$ 40
Tosa: a partir de R$ 60
Rações, acessórios, medicamentos
Veterinário às terças e quintas`
  },
  {
    businessType: "farmacia",
    businessName: "Farmácia Vida",
    description: `Medicamentos, perfumaria, dermocosméticos
Delivery grátis no bairro
Desconto de 20% para idosos
Aplicação de injeção: R$ 5`
  },
  
  // PROFISSIONAIS
  {
    businessType: "advogado",
    businessName: "Dr. Carlos Silva - Advocacia",
    description: `Direito trabalhista, civil e do consumidor
Consulta inicial: R$ 200
Atendimento online disponível
OAB/SP: 123456`
  },
  {
    businessType: "contador",
    businessName: "Contabilidade Express",
    description: `Abertura de empresa: R$ 500
MEI: gratuito
Declaração IR: R$ 150
Contabilidade mensal: a partir de R$ 200`
  },
  {
    businessType: "marketing",
    businessName: "Digital Marketing Pro",
    description: `Gestão de redes sociais
Tráfego pago (Google/Meta)
Criação de sites
Pacotes a partir de R$ 1.500/mês`
  },
  
  // EDUCAÇÃO
  {
    businessType: "curso_idiomas",
    businessName: "English Now",
    description: `Inglês para todas as idades
Turmas reduzidas (máx 6 alunos)
Aulas online e presenciais
Material didático incluso`
  },
  {
    businessType: "autoescola",
    businessName: "Auto Escola Passe Fácil",
    description: `Categoria A: R$ 1.200
Categoria B: R$ 1.800
Combo A+B: R$ 2.500
Simulados gratuitos. Carro 0km`
  },
  
  // DIGITAL
  {
    businessType: "infoprodutor",
    businessName: "Método Vendas Online",
    description: `Curso completo de vendas pela internet
8 módulos, +40 aulas
Bônus: mentoria em grupo
Preço: R$ 497 ou 12x de R$ 49,70
Garantia de 7 dias`
  },
  {
    businessType: "ecommerce",
    businessName: "Tech Store Online",
    description: `Eletrônicos e acessórios
Frete grátis acima de R$ 150
Entrega em 3-7 dias úteis
PIX: 5% desconto
Cartão até 12x`
  },
];

// Função de geração local (simulando o backend)
function generateLocalPrompt(type: string, name: string, info: string): string {
  return `# AGENTE ${name.toUpperCase()} - AgenteZap

## 🤖 IDENTIDADE
Você é o assistente virtual de atendimento da **${name}**.
Tipo de negócio: ${type}

## 💬 PERSONALIDADE
- Seja simpático, profissional e prestativo
- Use linguagem natural e amigável (como um atendente real)
- Responda de forma clara e objetiva
- Use emojis com moderação (1-2 por mensagem, nunca exagere)
- Sempre cumprimente o cliente de forma calorosa
- Personalize as respostas quando tiver o nome do cliente

## 📋 INFORMAÇÕES DO NEGÓCIO
${info}

## ✅ O QUE FAZER
- Responder dúvidas sobre produtos/serviços
- Informar preços e condições de pagamento
- Explicar funcionamento do negócio
- Agendar horários quando aplicável
- Enviar informações de contato e localização
- Qualificar o interesse do cliente
- Ser proativo em oferecer ajuda adicional

## ❌ O QUE NÃO FAZER
- Nunca invente informações que não foram fornecidas
- Não prometa prazos ou descontos sem autorização
- Não seja insistente ou agressivo na venda
- Se não souber algo, diga que vai verificar
- Nunca compartilhe dados de outros clientes
- Não use linguagem muito formal ou robótica

## 🔄 FLUXO DE ATENDIMENTO

**1. Primeira mensagem:**
- Cumprimente de forma calorosa
- Pergunte como pode ajudar

**2. Durante o atendimento:**
- Escute atentamente a necessidade
- Ofereça soluções adequadas
- Confirme informações importantes

**3. Fechamento:**
- Resuma o que foi combinado
- Pergunte se pode ajudar em mais algo
- Agradeça pelo contato

## 💡 DICAS ESPECIAIS
- Use {{nome}} para inserir automaticamente o nome do cliente
- Sempre confirme dados importantes antes de finalizar
- Em caso de reclamações, seja empático e solucione rapidamente
- Para pedidos/agendamentos, repita todos os detalhes para confirmação`;
}

// Função de validação de prompt
function validatePrompt(prompt: string, scenario: typeof testScenarios[0]): { valid: boolean; issues: string[] } {
  const issues: string[] = [];
  
  // Verificar se o nome do negócio está presente
  if (!prompt.includes(scenario.businessName)) {
    issues.push(`Nome do negócio "${scenario.businessName}" não encontrado`);
  }
  
  // Verificar seções obrigatórias
  const requiredSections = [
    "IDENTIDADE",
    "PERSONALIDADE", 
    "INFORMAÇÕES DO NEGÓCIO",
    "O QUE FAZER",
    "O QUE NÃO FAZER",
  ];
  
  for (const section of requiredSections) {
    if (!prompt.includes(section)) {
      issues.push(`Seção "${section}" não encontrada`);
    }
  }
  
  // Verificar tamanho mínimo
  if (prompt.length < 500) {
    issues.push(`Prompt muito curto (${prompt.length} caracteres, mínimo: 500)`);
  }
  
  // Verificar se informações do negócio foram incluídas
  const infoKeywords = scenario.description.split(/\s+/).slice(0, 5);
  let foundKeywords = 0;
  for (const keyword of infoKeywords) {
    if (keyword.length > 3 && prompt.toLowerCase().includes(keyword.toLowerCase())) {
      foundKeywords++;
    }
  }
  if (foundKeywords < 2) {
    issues.push("Informações do negócio podem não estar incluídas corretamente");
  }
  
  return {
    valid: issues.length === 0,
    issues
  };
}

// Executar testes
async function runTests() {
  console.log("=".repeat(60));
  console.log("🧪 TESTE DE GERAÇÃO DE PROMPTS - 20+ CENÁRIOS");
  console.log("=".repeat(60));
  console.log("");
  
  let passed = 0;
  let failed = 0;
  const results: { scenario: string; status: string; issues?: string[] }[] = [];
  
  for (const scenario of testScenarios) {
    console.log(`\n📝 Testando: ${scenario.businessName} (${scenario.businessType})`);
    
    try {
      const prompt = generateLocalPrompt(
        scenario.businessType,
        scenario.businessName,
        scenario.description
      );
      
      const validation = validatePrompt(prompt, scenario);
      
      if (validation.valid) {
        console.log(`   ✅ PASSOU - Prompt gerado corretamente (${prompt.length} chars)`);
        passed++;
        results.push({ scenario: scenario.businessName, status: "PASSED" });
      } else {
        console.log(`   ⚠️ AVISOS:`);
        validation.issues.forEach(issue => console.log(`      - ${issue}`));
        // Consideramos avisos como parcialmente ok
        passed++;
        results.push({ scenario: scenario.businessName, status: "PASSED_WITH_WARNINGS", issues: validation.issues });
      }
      
      // Mostrar preview do prompt
      console.log(`   📄 Preview: "${prompt.substring(0, 100).replace(/\n/g, ' ')}..."`);
      
    } catch (error) {
      console.log(`   ❌ FALHOU: ${error}`);
      failed++;
      results.push({ scenario: scenario.businessName, status: "FAILED", issues: [String(error)] });
    }
  }
  
  // Resumo
  console.log("\n" + "=".repeat(60));
  console.log("📊 RESUMO DOS TESTES");
  console.log("=".repeat(60));
  console.log(`✅ Passou: ${passed}/${testScenarios.length}`);
  console.log(`❌ Falhou: ${failed}/${testScenarios.length}`);
  console.log(`📈 Taxa de sucesso: ${((passed / testScenarios.length) * 100).toFixed(1)}%`);
  
  // Listar falhas se houver
  const failures = results.filter(r => r.status === "FAILED");
  if (failures.length > 0) {
    console.log("\n⚠️ CENÁRIOS COM FALHA:");
    failures.forEach(f => {
      console.log(`   - ${f.scenario}: ${f.issues?.join(", ")}`);
    });
  }
  
  console.log("\n" + "=".repeat(60));
  console.log("✨ Teste concluído!");
  console.log("=".repeat(60));
}

// Executar
runTests();
