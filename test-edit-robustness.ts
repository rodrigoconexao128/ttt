
import { applyLLMBlocks } from './server/promptEditEngine';

console.log("🧪 TESTE DE ROBUSTEZ - EDITOR DE PROMPTS (SEARCH/REPLACE BLOCKS)");
console.log("================================================================");

const tests = [
  {
    name: "1. Edição Simples (Texto Estruturado)",
    original: `
# Agente de Vendas
O nome do agente é Carlos.
Ele vende carros.
    `.trim(),
    blocks: `<<<<<<< SEARCH
O nome do agente é Carlos.
=======
O nome do agente é Roberto.
>>>>>>> REPLACE`,
    expected: `
# Agente de Vendas
O nome do agente é Roberto.
Ele vende carros.
    `.trim()
  },
  {
    name: "2. Edição com Erro de Espaçamento (Fuzzy Match)",
    original: `
function soma(a, b) {
  return a + b;
}
    `.trim(),
    blocks: `<<<<<<< SEARCH
function soma(a,b){
  return a+b;
}
=======
function soma(a, b) {
  return a + b + 1; // Taxa extra
}
>>>>>>> REPLACE`,
    // Nota: O fuzzy deve ser capaz de lidar com pequenas variações, 
    // mas se for muito diferente pode falhar. Vamos testar um caso realista de LLM comendo espaços.
    expectedContains: "Taxa extra"
  },
  {
    name: "3. Múltiplas Edições no Mesmo Arquivo",
    original: `
Item 1: Maçã
Item 2: Banana
Item 3: Laranja
    `.trim(),
    blocks: `<<<<<<< SEARCH
Item 1: Maçã
=======
Item 1: Abacaxi
>>>>>>> REPLACE
<<<<<<< SEARCH
Item 3: Laranja
=======
Item 3: Uva
>>>>>>> REPLACE`,
    expected: `
Item 1: Abacaxi
Item 2: Banana
Item 3: Uva
    `.trim()
  },
  {
    name: "4. Texto Não Estruturado (Poema)",
    original: `
Rosas são vermelhas
Violetas são azuis
O código é doce
E você também
    `.trim(),
    blocks: `<<<<<<< SEARCH
Violetas são azuis
=======
Violetas são roxas
>>>>>>> REPLACE`,
    expected: `
Rosas são vermelhas
Violetas são roxas
O código é doce
E você também
    `.trim()
  },
  {
    name: "5. Inserção de Texto (Usando Âncora)",
    original: `
Passo 1: Abrir porta
Passo 2: Entrar
    `.trim(),
    blocks: `<<<<<<< SEARCH
Passo 1: Abrir porta
=======
Passo 1: Abrir porta
Passo 1.5: Tirar sapatos
>>>>>>> REPLACE`,
    expected: `
Passo 1: Abrir porta
Passo 1.5: Tirar sapatos
Passo 2: Entrar
    `.trim()
  },
  {
    name: "6. Remoção de Texto",
    original: `
IMPORTANTE:
Não fale palavrão.
Não grite.
Fim das regras.
    `.trim(),
    blocks: `<<<<<<< SEARCH
Não grite.
=======
>>>>>>> REPLACE`,
    // Nota: A implementação atual pode deixar uma linha em branco dependendo de como o replace funciona
    // O ideal é verificar se o texto sumiu
    expectedNotContains: "Não grite."
  }
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  console.log(`\nExecutando: ${test.name}`);
  try {
    const result = applyLLMBlocks(test.original, test.blocks);
    
    let success = false;
    
    if (test.expected) {
      // Normaliza quebras de linha para comparação
      const resNorm = result.newPrompt.replace(/\r\n/g, '\n').trim();
      const expNorm = test.expected.replace(/\r\n/g, '\n').trim();
      success = resNorm === expNorm;
      
      if (!success) {
        console.log("❌ Falhou na comparação exata.");
        console.log("Esperado:\n" + expNorm);
        console.log("Recebido:\n" + resNorm);
      }
    } else if (test.expectedContains) {
      success = result.newPrompt.includes(test.expectedContains);
      if (!success) console.log(`❌ Texto não contém: "${test.expectedContains}"`);
    } else if (test.expectedNotContains) {
      success = !result.newPrompt.includes(test.expectedNotContains);
      if (!success) console.log(`❌ Texto ainda contém: "${test.expectedNotContains}"`);
    }

    if (success) {
      console.log("✅ Passou");
      passed++;
    } else {
      console.log("❌ Falhou");
      failed++;
    }
  } catch (e) {
    console.log("❌ Erro de execução:", e);
    failed++;
  }
}

console.log("\n================================================================");
console.log(`RESUMO: ${passed} Passaram | ${failed} Falharam`);
console.log("================================================================");

if (failed > 0) {
  process.exit(1);
}
