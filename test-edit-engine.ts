/**
 * Teste Completo do Novo Engine de Edição (SEARCH/REPLACE)
 * 
 * Baseado nas técnicas do Aider:
 * - SEARCH/REPLACE blocks
 * - Busca Fuzzy
 * - Edição Semântica
 */

import { editPromptAdvanced } from './server/promptEditEngine';

interface TestCase {
  name: string;
  prompt: string;
  instruction: string;
  shouldChange: boolean;
  expectedContent?: string[];   // Strings que devem estar no resultado
  notExpectedContent?: string[]; // Strings que NÃO devem estar no resultado
}

const SAMPLE_PROMPT = `Pizza Express - Assistente Virtual

Olá! Seja bem-vindo à Pizza Express! 🍕

## Sobre Nós
Somos uma pizzaria tradicional desde 1995, especializada em pizzas artesanais.

## Cardápio
• Pizza Margherita - R$45
• Pizza Calabresa - R$50
• Pizza Frango - R$55
• Refrigerante 2L - R$12

## Horário de Funcionamento
Abrimos de terça a domingo, das 18h às 23h.
Fechamos na segunda-feira.

## Entrega
Entrega grátis para pedidos acima de R$80.
Taxa de entrega: R$8 para outras compras.

## Contato
WhatsApp: (11) 99999-8888
Instagram: @pizzaexpress`;

const testCases: TestCase[] = [
  // ============ TESTES DE MUDANÇA DE NOME ============
  {
    name: "Mudar nome - direto",
    prompt: SAMPLE_PROMPT,
    instruction: "mude o nome para Bella Napoli",
    shouldChange: true,
    expectedContent: ["Bella Napoli"],
    notExpectedContent: ["Pizza Express"]
  },
  {
    name: "Mudar nome - variação 'chama'",
    prompt: SAMPLE_PROMPT,
    instruction: "a empresa chama Pizzaria Italiana",
    shouldChange: true,
    expectedContent: ["Pizzaria Italiana"],
    notExpectedContent: ["Pizza Express"]
  },
  {
    name: "Mudar nome - com 'agora é'",
    prompt: SAMPLE_PROMPT,
    instruction: "o nome agora é Super Pizza",
    shouldChange: true,
    expectedContent: ["Super Pizza"],
    notExpectedContent: ["Pizza Express"]
  },
  
  // ============ TESTES DE MUDANÇA DE PREÇO ============
  {
    name: "Mudar preço - direto",
    prompt: SAMPLE_PROMPT,
    instruction: "mude o preço mínimo para R$35",
    shouldChange: true,
    expectedContent: ["R$35"]
  },
  {
    name: "Mudar preço - com valor",
    prompt: SAMPLE_PROMPT,
    instruction: "preço: R$40",
    shouldChange: true,
    expectedContent: ["R$40"]
  },
  
  // ============ TESTES DE MUDANÇA DE HORÁRIO ============
  {
    name: "Mudar horário - direto",
    prompt: SAMPLE_PROMPT,
    instruction: "horário de funcionamento: 17h às 22h",
    shouldChange: true,
    expectedContent: ["17h às 22h"]
  },
  
  // ============ TESTES DE REMOÇÃO ============
  {
    name: "Remover - parte sobre segundas",
    prompt: SAMPLE_PROMPT,
    instruction: "remova a parte sobre segunda-feira",
    shouldChange: true,
    notExpectedContent: ["Fechamos na segunda"]
  },
  {
    name: "Remover - menção a Instagram",
    prompt: SAMPLE_PROMPT,
    instruction: "não mencione o Instagram",
    shouldChange: true,
    notExpectedContent: ["@pizzaexpress", "Instagram"]
  },
  {
    name: "Remover - taxa de entrega",
    prompt: SAMPLE_PROMPT,
    instruction: "tire a taxa de entrega",
    shouldChange: true,
    notExpectedContent: ["Taxa de entrega"]
  },
  
  // ============ TESTES DE ADIÇÃO ============
  {
    name: "Adicionar - informação de estacionamento",
    prompt: SAMPLE_PROMPT,
    instruction: "adicione que temos estacionamento grátis",
    shouldChange: true,
    expectedContent: ["estacionamento"]
  },
  {
    name: "Adicionar - aceitamos pix",
    prompt: SAMPLE_PROMPT,
    instruction: "inclua que aceitamos pix",
    shouldChange: true,
    expectedContent: ["pix"]
  },
  
  // ============ TESTES DE TOM ============
  {
    name: "Tom - mais formal",
    prompt: "Oi! Você está na Pizza Express! Beleza, o que vai querer?",
    instruction: "torne mais formal",
    shouldChange: true,
    expectedContent: ["Olá", "senhor"],
    notExpectedContent: ["Oi!", "Beleza"]
  },
  {
    name: "Tom - mais informal",
    prompt: "O senhor está na Pizza Express. Prezado cliente, como posso ajudar?",
    instruction: "torne mais informal e descontraído",
    shouldChange: true,
    expectedContent: ["você"],
    notExpectedContent: ["senhor", "Prezado"]
  },
  
  // ============ TESTES DE BUSCA FUZZY ============
  {
    name: "Fuzzy - texto com pequenas diferenças",
    prompt: "Pizza Expresss - O Melhor Sabor",  // Note: 3 's'
    instruction: "mude o nome para Pizzaria do João",
    shouldChange: true,
    expectedContent: ["Pizzaria do João"]
  },
  
  // ============ TESTES DE SUBSTITUIÇÃO GENÉRICA ============
  {
    name: "Substituir - texto específico",
    prompt: SAMPLE_PROMPT,
    instruction: "mude Refrigerante 2L para Refrigerante 1,5L",
    shouldChange: true,
    expectedContent: ["1,5L"]
  },
  {
    name: "Substituir - emoji",
    prompt: SAMPLE_PROMPT,
    instruction: "mude o emoji de pizza para 🍕🔥",
    shouldChange: true,
    expectedContent: ["🔥"]
  },
  
  // ============ TESTES EDGE CASES ============
  {
    name: "Edge - instrução vaga (deve adicionar)",
    prompt: SAMPLE_PROMPT,
    instruction: "seja mais simpático",
    shouldChange: true
  },
  {
    name: "Edge - prompt grande",
    prompt: SAMPLE_PROMPT.repeat(3),
    instruction: "mude o nome para MegaPizza",
    shouldChange: true,
    expectedContent: ["MegaPizza"]
  },
  {
    name: "Edge - múltiplas ocorrências",
    prompt: "Pizza Express é a melhor. Na Pizza Express você encontra tudo.",
    instruction: "mude Pizza Express para Bella Pizza",
    shouldChange: true,
    expectedContent: ["Bella Pizza"],
    notExpectedContent: ["Pizza Express"]
  }
];

// ============ EXECUÇÃO DOS TESTES ============

async function runTests() {
  console.log("🧪 TESTE DO NOVO ENGINE DE EDIÇÃO (SEARCH/REPLACE)\n");
  console.log("=".repeat(60) + "\n");

  let passed = 0;
  let failed = 0;
  const failures: { name: string; error: string }[] = [];

  for (const test of testCases) {
    try {
      const result = editPromptAdvanced(test.prompt, test.instruction);
      
      // Verifica se houve mudança
      const changed = result.newPrompt !== test.prompt;
      if (test.shouldChange && !changed) {
        throw new Error("Deveria mudar o prompt, mas não mudou");
      }
      if (!test.shouldChange && changed) {
        throw new Error("Não deveria mudar o prompt, mas mudou");
      }
      
      // Verifica conteúdo esperado
      if (test.expectedContent) {
        for (const expected of test.expectedContent) {
          if (!result.newPrompt.toLowerCase().includes(expected.toLowerCase())) {
            throw new Error(`Deveria conter "${expected}" mas não contém`);
          }
        }
      }
      
      // Verifica conteúdo que NÃO deve existir
      if (test.notExpectedContent) {
        for (const notExpected of test.notExpectedContent) {
          if (result.newPrompt.toLowerCase().includes(notExpected.toLowerCase())) {
            throw new Error(`Não deveria conter "${notExpected}" mas contém`);
          }
        }
      }
      
      console.log(`✅ ${test.name}`);
      if (result.feedbackMessage) {
        console.log(`   📝 Feedback: ${result.feedbackMessage.substring(0, 80)}...`);
      }
      passed++;
      
    } catch (error: any) {
      console.log(`❌ ${test.name}`);
      console.log(`   Erro: ${error.message}`);
      failed++;
      failures.push({ name: test.name, error: error.message });
    }
  }

  // ============ RESUMO ============
  console.log("\n" + "=".repeat(60));
  console.log("\n📊 RESULTADO FINAL:\n");
  console.log(`   ✅ Passou: ${passed}/${testCases.length}`);
  console.log(`   ❌ Falhou: ${failed}/${testCases.length}`);
  console.log(`   📈 Taxa de sucesso: ${((passed / testCases.length) * 100).toFixed(1)}%`);

  if (failures.length > 0) {
    console.log("\n❌ FALHAS DETALHADAS:");
    failures.forEach(f => {
      console.log(`   • ${f.name}: ${f.error}`);
    });
  }

  console.log("\n" + "=".repeat(60));
  
  // Exit code para CI
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
