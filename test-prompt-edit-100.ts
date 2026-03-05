/**
 * 🧪 TESTE COMPLETO DE EDIÇÃO DE PROMPTS
 * 
 * Testa a lógica de edição via JSON Schema com 100 cenários diferentes.
 * Verifica se cada edição foi aplicada corretamente.
 * 
 * Para executar: npx tsx test-prompt-edit-100.ts
 */

import { 
  editPromptLocally, 
  injectPromptChanges,
  PromptChange 
} from "./server/promptEditFullDocument";

// ============ PROMPT DE TESTE BASE ============
const BASE_PROMPT = `Pizzaria Bella Napoli - Atendente virtual. Tom: simpático e objetivo.

REGRAS:
• Apresente cardápio quando pedirem
• Informe promoções do dia
• Pergunte endereço para delivery
• Confirme pedido antes de finalizar
• Informe tempo de entrega real

NÃO FAZER:
• Inventar preços ou itens
• Prometer entrega sem confirmar
• Dar opiniões sobre dietas

CONTEXTO:
Pizzas a partir de R$35. Entrega grátis acima de R$60.
Horário: 18h às 23h. Fecha segunda.`;

// ============ CENÁRIOS DE TESTE ============
interface TestCase {
  id: number;
  instruction: string;
  expectedChanges: {
    type: "contains" | "not_contains" | "replaced" | "count_changes";
    value: string | number;
    description: string;
  }[];
}

const TEST_CASES: TestCase[] = [
  // ============ EDIÇÕES DE NOME (1-10) ============
  {
    id: 1,
    instruction: "Mude o nome para Pizza Express",
    expectedChanges: [
      { type: "contains", value: "Pizza Express", description: "Nome deve mudar para Pizza Express" },
      { type: "not_contains", value: "Bella Napoli", description: "Não deve mais ter Bella Napoli" }
    ]
  },
  {
    id: 2,
    instruction: "Troque o nome da pizzaria para Sabor Italiano",
    expectedChanges: [
      { type: "contains", value: "Sabor Italiano", description: "Nome deve mudar" }
    ]
  },
  {
    id: 3,
    instruction: "O nome correto é Dom Pizza",
    expectedChanges: [
      { type: "contains", value: "Dom Pizza", description: "Nome deve mudar" }
    ]
  },
  {
    id: 4,
    instruction: "Altere para Pizzaria do João",
    expectedChanges: [
      { type: "contains", value: "Pizzaria do João", description: "Nome deve mudar" }
    ]
  },
  {
    id: 5,
    instruction: "Renomear para Casa da Pizza",
    expectedChanges: [
      { type: "contains", value: "Casa da Pizza", description: "Nome deve mudar" }
    ]
  },
  {
    id: 6,
    instruction: "Nome: Pizza Hut Brasil",
    expectedChanges: [
      { type: "contains", value: "Pizza Hut Brasil", description: "Nome deve mudar" }
    ]
  },
  {
    id: 7,
    instruction: "Substituir nome por Forneria Artesanal",
    expectedChanges: [
      { type: "contains", value: "Forneria Artesanal", description: "Nome deve mudar" }
    ]
  },
  {
    id: 8,
    instruction: "A empresa se chama Massa & Cia",
    expectedChanges: [
      { type: "contains", value: "Massa & Cia", description: "Nome deve mudar" }
    ]
  },
  {
    id: 9,
    instruction: "Atualizar nome: Cantina Napolitana",
    expectedChanges: [
      { type: "contains", value: "Cantina Napolitana", description: "Nome deve mudar" }
    ]
  },
  {
    id: 10,
    instruction: "O estabelecimento agora é Forno a Lenha",
    expectedChanges: [
      { type: "contains", value: "Forno a Lenha", description: "Nome deve mudar" }
    ]
  },

  // ============ EDIÇÕES DE TOM (11-20) ============
  {
    id: 11,
    instruction: "Torne mais formal",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter pelo menos uma mudança" }
    ]
  },
  {
    id: 12,
    instruction: "Seja mais profissional",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter pelo menos uma mudança" }
    ]
  },
  {
    id: 13,
    instruction: "Tom mais descontraído",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter pelo menos uma mudança" }
    ]
  },
  {
    id: 14,
    instruction: "Mais amigável e informal",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter pelo menos uma mudança" }
    ]
  },
  {
    id: 15,
    instruction: "Use tom de vendedor",
    expectedChanges: [
      { type: "contains", value: "Venda", description: "Deve adicionar seção de vendas" }
    ]
  },
  {
    id: 16,
    instruction: "Foco em converter clientes",
    expectedChanges: [
      { type: "contains", value: "Venda", description: "Deve adicionar seção de vendas" }
    ]
  },
  {
    id: 17,
    instruction: "Adicione foco em suporte",
    expectedChanges: [
      { type: "contains", value: "Suporte", description: "Deve adicionar seção de suporte" }
    ]
  },
  {
    id: 18,
    instruction: "Priorize atendimento ao cliente",
    expectedChanges: [
      { type: "contains", value: "Suporte", description: "Deve adicionar seção de suporte" }
    ]
  },
  {
    id: 19,
    instruction: "Respostas mais curtas e diretas",
    expectedChanges: [
      { type: "contains", value: "Concisa", description: "Deve adicionar seção de concisão" }
    ]
  },
  {
    id: 20,
    instruction: "Seja mais breve nas respostas",
    expectedChanges: [
      { type: "contains", value: "Concisa", description: "Deve adicionar seção de concisão" }
    ]
  },

  // ============ EDIÇÕES DE PREÇO (21-30) ============
  {
    id: 21,
    instruction: "Mude o preço mínimo para R$40",
    expectedChanges: [
      { type: "contains", value: "R$40", description: "Preço deve mudar para R$40" }
    ]
  },
  {
    id: 22,
    instruction: "Entrega grátis acima de R$80",
    expectedChanges: [
      { type: "contains", value: "R$80", description: "Valor mínimo delivery deve mudar" }
    ]
  },
  {
    id: 23,
    instruction: "Pizzas a partir de R$45",
    expectedChanges: [
      { type: "contains", value: "R$45", description: "Preço base deve mudar" }
    ]
  },
  {
    id: 24,
    instruction: "Atualizar: pizza grande R$50",
    expectedChanges: [
      { type: "contains", value: "R$50", description: "Deve mencionar novo preço" }
    ]
  },
  {
    id: 25,
    instruction: "Frete grátis sem valor mínimo",
    expectedChanges: [
      { type: "contains", value: "grátis", description: "Deve atualizar política de frete" }
    ]
  },
  {
    id: 26,
    instruction: "Taxa de entrega R$5",
    expectedChanges: [
      { type: "contains", value: "R$5", description: "Deve mencionar taxa" }
    ]
  },
  {
    id: 27,
    instruction: "Promoção: 2 pizzas por R$59",
    expectedChanges: [
      { type: "contains", value: "R$59", description: "Deve adicionar promoção" }
    ]
  },
  {
    id: 28,
    instruction: "Desconto de 10% no PIX",
    expectedChanges: [
      { type: "contains", value: "10%", description: "Deve mencionar desconto" }
    ]
  },
  {
    id: 29,
    instruction: "Combo família por R$99",
    expectedChanges: [
      { type: "contains", value: "R$99", description: "Deve adicionar combo" }
    ]
  },
  {
    id: 30,
    instruction: "Refrigerante grátis em pedidos acima de R$100",
    expectedChanges: [
      { type: "contains", value: "R$100", description: "Deve mencionar promoção" }
    ]
  },

  // ============ EDIÇÕES DE HORÁRIO (31-40) ============
  {
    id: 31,
    instruction: "Horário: 17h às 00h",
    expectedChanges: [
      { type: "contains", value: "17h", description: "Horário deve atualizar" }
    ]
  },
  {
    id: 32,
    instruction: "Abre às 16h",
    expectedChanges: [
      { type: "contains", value: "16h", description: "Horário abertura deve mudar" }
    ]
  },
  {
    id: 33,
    instruction: "Fecha às 22h",
    expectedChanges: [
      { type: "contains", value: "22h", description: "Horário fechamento deve mudar" }
    ]
  },
  {
    id: 34,
    instruction: "Não fechamos na segunda",
    expectedChanges: [
      { type: "not_contains", value: "Fecha segunda", description: "Deve remover info de fechamento" }
    ]
  },
  {
    id: 35,
    instruction: "Fechamos domingo",
    expectedChanges: [
      { type: "contains", value: "domingo", description: "Deve mencionar domingo" }
    ]
  },
  {
    id: 36,
    instruction: "Aberto 24 horas",
    expectedChanges: [
      { type: "contains", value: "24 horas", description: "Deve mencionar 24h" }
    ]
  },
  {
    id: 37,
    instruction: "Almoço: 11h às 15h",
    expectedChanges: [
      { type: "contains", value: "11h", description: "Horário almoço" }
    ]
  },
  {
    id: 38,
    instruction: "Jantar: 19h às 23h",
    expectedChanges: [
      { type: "contains", value: "19h", description: "Horário jantar" }
    ]
  },
  {
    id: 39,
    instruction: "Sábado horário especial: 12h às 02h",
    expectedChanges: [
      { type: "contains", value: "Sábado", description: "Deve mencionar sábado" }
    ]
  },
  {
    id: 40,
    instruction: "Feriados não abrimos",
    expectedChanges: [
      { type: "contains", value: "Feriados", description: "Deve mencionar feriados" }
    ]
  },

  // ============ ADIÇÃO DE REGRAS (41-50) ============
  {
    id: 41,
    instruction: "Adicione: sempre pergunte o nome do cliente",
    expectedChanges: [
      { type: "contains", value: "nome", description: "Deve mencionar nome do cliente" }
    ]
  },
  {
    id: 42,
    instruction: "Nova regra: confirmar número de telefone",
    expectedChanges: [
      { type: "contains", value: "telefone", description: "Deve mencionar telefone" }
    ]
  },
  {
    id: 43,
    instruction: "Incluir: oferecer bebidas junto",
    expectedChanges: [
      { type: "contains", value: "bebidas", description: "Deve mencionar bebidas" }
    ]
  },
  {
    id: 44,
    instruction: "Regra: sugerir borda recheada",
    expectedChanges: [
      { type: "contains", value: "borda", description: "Deve mencionar borda" }
    ]
  },
  {
    id: 45,
    instruction: "Adicionar regra de upsell",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 46,
    instruction: "Perguntar sobre alergia a ingredientes",
    expectedChanges: [
      { type: "contains", value: "alergia", description: "Deve mencionar alergia" }
    ]
  },
  {
    id: 47,
    instruction: "Regra: oferecer cupom para próxima compra",
    expectedChanges: [
      { type: "contains", value: "cupom", description: "Deve mencionar cupom" }
    ]
  },
  {
    id: 48,
    instruction: "Sempre agradecer o cliente",
    expectedChanges: [
      { type: "contains", value: "agradecer", description: "Deve mencionar agradecimento" }
    ]
  },
  {
    id: 49,
    instruction: "Pedir avaliação após entrega",
    expectedChanges: [
      { type: "contains", value: "avaliação", description: "Deve mencionar avaliação" }
    ]
  },
  {
    id: 50,
    instruction: "Regra: não discutir política ou religião",
    expectedChanges: [
      { type: "contains", value: "política", description: "Deve mencionar política" }
    ]
  },

  // ============ REMOÇÃO DE REGRAS (51-60) ============
  {
    id: 51,
    instruction: "Remover a regra sobre promoções",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 52,
    instruction: "Tirar a parte de confirmar pedido",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 53,
    instruction: "Deletar regra de tempo de entrega",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 54,
    instruction: "Excluir seção NÃO FAZER",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 55,
    instruction: "Remover contexto de preços",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 56,
    instruction: "Tirar informação de horário",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 57,
    instruction: "Remover regra de cardápio",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 58,
    instruction: "Deletar menção a delivery",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 59,
    instruction: "Tirar segunda-feira",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 60,
    instruction: "Remover emojis se houver",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },

  // ============ EMOJIS (61-65) ============
  {
    id: 61,
    instruction: "Adicionar mais emojis",
    expectedChanges: [
      { type: "contains", value: "Emoji", description: "Deve adicionar seção de emojis" }
    ]
  },
  {
    id: 62,
    instruction: "Use emojis nas respostas",
    expectedChanges: [
      { type: "contains", value: "Emoji", description: "Deve adicionar seção de emojis" }
    ]
  },
  {
    id: 63,
    instruction: "Incluir emoticons",
    expectedChanges: [
      { type: "contains", value: "Emoji", description: "Deve adicionar seção de emojis" }
    ]
  },
  {
    id: 64,
    instruction: "Adicione 😊 e 🍕 nas mensagens",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 65,
    instruction: "Usar mais emojis de pizza",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },

  // ============ CARDÁPIO (66-75) ============
  {
    id: 66,
    instruction: "Adicionar pizza de calabresa",
    expectedChanges: [
      { type: "contains", value: "calabresa", description: "Deve mencionar calabresa" }
    ]
  },
  {
    id: 67,
    instruction: "Incluir sabor margherita",
    expectedChanges: [
      { type: "contains", value: "margherita", description: "Deve mencionar margherita" }
    ]
  },
  {
    id: 68,
    instruction: "Nova pizza: 4 queijos",
    expectedChanges: [
      { type: "contains", value: "queijos", description: "Deve mencionar 4 queijos" }
    ]
  },
  {
    id: 69,
    instruction: "Adicionar opção vegana",
    expectedChanges: [
      { type: "contains", value: "vegana", description: "Deve mencionar vegana" }
    ]
  },
  {
    id: 70,
    instruction: "Incluir pizza doce de chocolate",
    expectedChanges: [
      { type: "contains", value: "chocolate", description: "Deve mencionar chocolate" }
    ]
  },
  {
    id: 71,
    instruction: "Novo sabor: frango com catupiry",
    expectedChanges: [
      { type: "contains", value: "frango", description: "Deve mencionar frango" }
    ]
  },
  {
    id: 72,
    instruction: "Adicionar calzone",
    expectedChanges: [
      { type: "contains", value: "calzone", description: "Deve mencionar calzone" }
    ]
  },
  {
    id: 73,
    instruction: "Incluir esfiha no cardápio",
    expectedChanges: [
      { type: "contains", value: "esfiha", description: "Deve mencionar esfiha" }
    ]
  },
  {
    id: 74,
    instruction: "Nova bebida: suco natural",
    expectedChanges: [
      { type: "contains", value: "suco", description: "Deve mencionar suco" }
    ]
  },
  {
    id: 75,
    instruction: "Adicionar sobremesa",
    expectedChanges: [
      { type: "contains", value: "sobremesa", description: "Deve mencionar sobremesa" }
    ]
  },

  // ============ LOCALIZAÇÃO (76-80) ============
  {
    id: 76,
    instruction: "Endereço: Rua das Flores, 123",
    expectedChanges: [
      { type: "contains", value: "Rua das Flores", description: "Deve adicionar endereço" }
    ]
  },
  {
    id: 77,
    instruction: "Região de entrega: Centro",
    expectedChanges: [
      { type: "contains", value: "Centro", description: "Deve mencionar região" }
    ]
  },
  {
    id: 78,
    instruction: "Telefone: (11) 99999-9999",
    expectedChanges: [
      { type: "contains", value: "99999", description: "Deve adicionar telefone" }
    ]
  },
  {
    id: 79,
    instruction: "Bairros atendidos: Vila Maria, Santana",
    expectedChanges: [
      { type: "contains", value: "Vila Maria", description: "Deve mencionar bairros" }
    ]
  },
  {
    id: 80,
    instruction: "Raio de entrega: 5km",
    expectedChanges: [
      { type: "contains", value: "5km", description: "Deve mencionar raio" }
    ]
  },

  // ============ PAGAMENTO (81-85) ============
  {
    id: 81,
    instruction: "Aceitar PIX",
    expectedChanges: [
      { type: "contains", value: "PIX", description: "Deve mencionar PIX" }
    ]
  },
  {
    id: 82,
    instruction: "Cartão de crédito em até 3x",
    expectedChanges: [
      { type: "contains", value: "3x", description: "Deve mencionar parcelamento" }
    ]
  },
  {
    id: 83,
    instruction: "Não aceitar cheque",
    expectedChanges: [
      { type: "contains", value: "cheque", description: "Deve mencionar cheque" }
    ]
  },
  {
    id: 84,
    instruction: "VR e VA aceitos",
    expectedChanges: [
      { type: "contains", value: "VR", description: "Deve mencionar vale refeição" }
    ]
  },
  {
    id: 85,
    instruction: "Pagamento na entrega",
    expectedChanges: [
      { type: "contains", value: "entrega", description: "Deve mencionar pagamento na entrega" }
    ]
  },

  // ============ RESPOSTAS (86-90) ============
  {
    id: 86,
    instruction: "Respostas mais detalhadas",
    expectedChanges: [
      { type: "contains", value: "Detalhada", description: "Deve adicionar seção de detalhes" }
    ]
  },
  {
    id: 87,
    instruction: "Respostas mais completas",
    expectedChanges: [
      { type: "contains", value: "Detalhada", description: "Deve adicionar seção de detalhes" }
    ]
  },
  {
    id: 88,
    instruction: "Seja mais explicativo",
    expectedChanges: [
      { type: "contains", value: "Detalhada", description: "Deve adicionar seção de detalhes" }
    ]
  },
  {
    id: 89,
    instruction: "Respostas resumidas",
    expectedChanges: [
      { type: "contains", value: "Concisa", description: "Deve adicionar seção de concisão" }
    ]
  },
  {
    id: 90,
    instruction: "Mensagens diretas ao ponto",
    expectedChanges: [
      { type: "contains", value: "Concisa", description: "Deve adicionar seção de concisão" }
    ]
  },

  // ============ INSTRUÇÕES CUSTOMIZADAS (91-100) ============
  {
    id: 91,
    instruction: "Sempre oferecer refrigerante",
    expectedChanges: [
      { type: "contains", value: "refrigerante", description: "Deve mencionar refrigerante" }
    ]
  },
  {
    id: 92,
    instruction: "Perguntar tamanho da pizza",
    expectedChanges: [
      { type: "contains", value: "tamanho", description: "Deve mencionar tamanho" }
    ]
  },
  {
    id: 93,
    instruction: "Confirmar CPF na nota",
    expectedChanges: [
      { type: "contains", value: "CPF", description: "Deve mencionar CPF" }
    ]
  },
  {
    id: 94,
    instruction: "Avisar tempo de espera de 40 min",
    expectedChanges: [
      { type: "contains", value: "40", description: "Deve mencionar tempo" }
    ]
  },
  {
    id: 95,
    instruction: "Oferecer programa de fidelidade",
    expectedChanges: [
      { type: "contains", value: "fidelidade", description: "Deve mencionar fidelidade" }
    ]
  },
  {
    id: 96,
    instruction: "Mencionar ingredientes frescos",
    expectedChanges: [
      { type: "contains", value: "frescos", description: "Deve mencionar frescos" }
    ]
  },
  {
    id: 97,
    instruction: "Destacar entrega rápida",
    expectedChanges: [
      { type: "contains", value: "rápida", description: "Deve mencionar rapidez" }
    ]
  },
  {
    id: 98,
    instruction: "Falar sobre qualidade artesanal",
    expectedChanges: [
      { type: "contains", value: "artesanal", description: "Deve mencionar artesanal" }
    ]
  },
  {
    id: 99,
    instruction: "Usar linguagem jovem e moderna",
    expectedChanges: [
      { type: "count_changes", value: 1, description: "Deve ter mudança" }
    ]
  },
  {
    id: 100,
    instruction: "Adicionar regra: nunca inventar promoções",
    expectedChanges: [
      { type: "contains", value: "promoções", description: "Deve mencionar promoções" }
    ]
  }
];

// ============ FUNÇÕES DE TESTE ============

function runTest(testCase: TestCase): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let allPassed = true;

  try {
    // Executa a edição local
    const result = editPromptLocally(BASE_PROMPT, testCase.instruction);
    
    details.push(`📝 Instrução: "${testCase.instruction}"`);
    details.push(`🔄 Mudanças: ${result.changes.length}`);
    
    // Verifica cada expectativa
    for (const expected of testCase.expectedChanges) {
      let passed = false;
      
      switch (expected.type) {
        case "contains":
          passed = result.newPrompt.toLowerCase().includes(String(expected.value).toLowerCase());
          break;
        case "not_contains":
          passed = !result.newPrompt.toLowerCase().includes(String(expected.value).toLowerCase());
          break;
        case "replaced":
          passed = !result.newPrompt.includes(String(expected.value));
          break;
        case "count_changes":
          passed = result.changes.length >= Number(expected.value);
          break;
      }
      
      if (passed) {
        details.push(`  ✅ ${expected.description}`);
      } else {
        details.push(`  ❌ ${expected.description}`);
        details.push(`     Prompt resultante (primeiras 200 chars): ${result.newPrompt.substring(0, 200)}...`);
        allPassed = false;
      }
    }

    // Mostra as mudanças aplicadas
    if (result.changes.length > 0) {
      details.push(`  📋 Mudanças aplicadas:`);
      for (const change of result.changes) {
        details.push(`     - ${change.action}: ${change.explanation}`);
      }
    }

  } catch (error: any) {
    details.push(`  💥 ERRO: ${error.message}`);
    allPassed = false;
  }

  return { passed: allPassed, details };
}

function runInjectTest(): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let allPassed = true;

  // Teste direto da função injectPromptChanges
  const testCases: { changes: PromptChange[]; expected: string; description: string }[] = [
    {
      changes: [{
        action: "replace",
        target: "Pizzaria Bella Napoli",
        newContent: "Pizza Express",
        explanation: "Mudando nome"
      }],
      expected: "Pizza Express",
      description: "Replace simples deve funcionar"
    },
    {
      changes: [{
        action: "replace",
        target: "R$35",
        newContent: "R$40",
        explanation: "Mudando preço"
      }],
      expected: "R$40",
      description: "Replace de preço deve funcionar"
    },
    {
      changes: [{
        action: "replace",
        target: "18h às 23h",
        newContent: "17h às 00h",
        explanation: "Mudando horário"
      }],
      expected: "17h às 00h",
      description: "Replace de horário deve funcionar"
    },
    {
      changes: [{
        action: "append",
        target: "",
        newContent: "## Nova Seção\nConteúdo aqui",
        explanation: "Adicionando seção"
      }],
      expected: "## Nova Seção",
      description: "Append deve adicionar no final"
    },
    {
      changes: [{
        action: "insert_after",
        target: "REGRAS:",
        newContent: "• Nova regra inserida",
        explanation: "Inserindo regra"
      }],
      expected: "• Nova regra inserida",
      description: "Insert_after deve funcionar"
    }
  ];

  details.push("\n🔬 TESTES DE INJECT DIRETO:");
  
  for (const tc of testCases) {
    const result = injectPromptChanges(BASE_PROMPT, tc.changes);
    const passed = result.includes(tc.expected);
    
    if (passed) {
      details.push(`  ✅ ${tc.description}`);
    } else {
      details.push(`  ❌ ${tc.description}`);
      details.push(`     Esperado conter: "${tc.expected}"`);
      details.push(`     Resultado (100 chars): ${result.substring(0, 100)}...`);
      allPassed = false;
    }
  }

  return { passed: allPassed, details };
}

// ============ EXECUÇÃO ============

async function main() {
  console.log("═".repeat(60));
  console.log("🧪 TESTE DE EDIÇÃO DE PROMPTS - 100 CENÁRIOS");
  console.log("═".repeat(60));
  console.log("");

  let passed = 0;
  let failed = 0;
  const failedTests: number[] = [];

  // Primeiro, testa a função de inject diretamente
  const injectResult = runInjectTest();
  console.log(injectResult.details.join("\n"));
  if (!injectResult.passed) {
    console.log("\n⚠️ ATENÇÃO: Problemas detectados no injectPromptChanges!");
  }

  console.log("\n" + "─".repeat(60));
  console.log("📋 EXECUTANDO 100 CENÁRIOS DE EDIÇÃO...");
  console.log("─".repeat(60) + "\n");

  for (const testCase of TEST_CASES) {
    const result = runTest(testCase);
    
    if (result.passed) {
      passed++;
      console.log(`✅ Teste #${testCase.id}: PASSOU`);
    } else {
      failed++;
      failedTests.push(testCase.id);
      console.log(`\n❌ Teste #${testCase.id}: FALHOU`);
      console.log(result.details.join("\n"));
      console.log("");
    }
  }

  console.log("\n" + "═".repeat(60));
  console.log("📊 RESULTADO FINAL");
  console.log("═".repeat(60));
  console.log(`✅ Passou: ${passed}/100`);
  console.log(`❌ Falhou: ${failed}/100`);
  console.log(`📈 Taxa de sucesso: ${(passed / 100 * 100).toFixed(1)}%`);
  
  if (failedTests.length > 0) {
    console.log(`\n❌ Testes que falharam: ${failedTests.join(", ")}`);
  }

  // Diagnóstico
  console.log("\n" + "─".repeat(60));
  console.log("🔍 DIAGNÓSTICO");
  console.log("─".repeat(60));
  
  // Testa especificamente a mudança de nome
  console.log("\n📌 Teste específico de MUDANÇA DE NOME:");
  const nameTest = editPromptLocally(BASE_PROMPT, "Mude o nome para Pizza Express");
  console.log(`   Instrução: "Mude o nome para Pizza Express"`);
  console.log(`   Mudanças: ${nameTest.changes.length}`);
  console.log(`   Contém 'Pizza Express': ${nameTest.newPrompt.includes("Pizza Express") ? "SIM ✅" : "NÃO ❌"}`);
  console.log(`   Contém 'Bella Napoli': ${nameTest.newPrompt.includes("Bella Napoli") ? "SIM (não removeu) ❌" : "NÃO (removeu corretamente) ✅"}`);
  console.log(`   Resumo: ${nameTest.summary}`);
  
  if (nameTest.changes.length === 0) {
    console.log("\n⚠️ PROBLEMA DETECTADO: A edição de nome não está gerando mudanças!");
    console.log("   A função editPromptLocally não tem lógica para detectar instruções de renomeação.");
    console.log("   Isso explica por que editar o nome não funciona.");
  }
}

main().catch(console.error);
