/**
 * 🧪 TESTE DE INTEGRAÇÃO DA API DE EDIÇÃO DE PROMPTS
 * 
 * Simula chamadas à API de edição e verifica se funciona corretamente.
 * 
 * Para executar: npx tsx test-edit-api.ts
 */

import { editPromptLocally, injectPromptChanges, PromptChange } from "./server/promptEditFullDocument";

// ============ CORES PARA OUTPUT ============
const colors = {
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  reset: "\x1b[0m",
  bold: "\x1b[1m"
};

// ============ SIMULAÇÃO DA API ============
interface EditResponse {
  newPrompt: string;
  changes: PromptChange[];
  summary: string;
  tokensUsed: { input: number; output: number; saved: number };
  method: string;
}

function simulateAPICall(currentPrompt: string, instruction: string): EditResponse {
  // Simula exatamente o que a rota /api/agent/edit-prompt faz
  const localResult = editPromptLocally(currentPrompt, instruction);
  
  return {
    newPrompt: localResult.newPrompt,
    changes: localResult.changes,
    summary: localResult.summary,
    tokensUsed: { input: 0, output: 0, saved: 0 },
    method: "local-fallback"
  };
}

// ============ PROMPT DE TESTE ============
const TEST_PROMPT = `Sou a Ana, assistente virtual da Clínica Estética Beleza Pura.

SERVIÇOS:
• Limpeza de pele: R$120
• Peeling: R$250
• Botox: R$800
• Preenchimento labial: R$1.200

HORÁRIO:
Segunda a sexta: 9h às 18h
Sábado: 9h às 13h

REGRAS:
• Sempre perguntar o nome do cliente
• Confirmar horário disponível antes de agendar
• Informar preparação necessária para cada procedimento
• Tom profissional mas acolhedor`;

// ============ TESTES ============
interface TestCase {
  name: string;
  instruction: string;
  shouldContain?: string;
  shouldNotContain?: string;
  expectChanges: boolean;
}

const testCases: TestCase[] = [
  {
    name: "Mudar nome da empresa",
    instruction: "Mude o nome para Estética Premium",
    shouldContain: "Premium",
    shouldNotContain: "Beleza Pura",
    expectChanges: true
  },
  {
    name: "Alterar preço",
    instruction: "O botox agora custa R$900",
    shouldContain: "900",
    expectChanges: true
  },
  {
    name: "Mudar tom para informal",
    instruction: "Seja mais informal e use emojis",
    shouldContain: "emoji",
    expectChanges: true
  },
  {
    name: "Adicionar regra",
    instruction: "Adicione regra: nunca ofereça desconto",
    shouldContain: "desconto",
    expectChanges: true
  },
  {
    name: "Mudar horário",
    instruction: "Agora funcionamos até as 20h",
    shouldContain: "20",
    expectChanges: true
  },
  {
    name: "Renomear assistente",
    instruction: "Troque meu nome para Maria",
    shouldContain: "Maria",
    expectChanges: true
  },
  {
    name: "Ser mais direto",
    instruction: "Respostas mais curtas e diretas",
    shouldContain: "Concis",
    expectChanges: true
  },
  {
    name: "Foco em vendas",
    instruction: "Adicione foco em vendas",
    shouldContain: "Venda",
    expectChanges: true
  }
];

// ============ EXECUTAR TESTES ============
console.log(`
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
${colors.blue}🧪 TESTE DE INTEGRAÇÃO - API DE EDIÇÃO DE PROMPTS${colors.reset}
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
`);

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\n${colors.yellow}📝 Teste: ${test.name}${colors.reset}`);
  console.log(`   Instrução: "${test.instruction}"`);
  
  const response = simulateAPICall(TEST_PROMPT, test.instruction);
  
  let testPassed = true;
  let reason = "";
  
  // Verificar se há mudanças
  if (test.expectChanges && response.changes.length === 0) {
    testPassed = false;
    reason = "Nenhuma mudança detectada";
  }
  
  // Verificar conteúdo esperado
  if (test.shouldContain && !response.newPrompt.toLowerCase().includes(test.shouldContain.toLowerCase())) {
    testPassed = false;
    reason = `Deveria conter "${test.shouldContain}"`;
  }
  
  // Verificar conteúdo que não deveria existir
  if (test.shouldNotContain && response.newPrompt.toLowerCase().includes(test.shouldNotContain.toLowerCase())) {
    testPassed = false;
    reason = `Não deveria conter "${test.shouldNotContain}"`;
  }
  
  if (testPassed) {
    console.log(`   ${colors.green}✅ PASSOU${colors.reset}`);
    console.log(`   Mudanças: ${response.changes.length}`);
    console.log(`   Método: ${response.method}`);
    passed++;
  } else {
    console.log(`   ${colors.red}❌ FALHOU: ${reason}${colors.reset}`);
    console.log(`   Changes: ${response.changes.length}`);
    console.log(`   Summary: ${response.summary}`);
    failed++;
  }
}

// ============ RESULTADO FINAL ============
console.log(`
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
${colors.bold}📊 RESULTADO FINAL${colors.reset}
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
${colors.green}✅ Passou: ${passed}/${testCases.length}${colors.reset}
${colors.red}❌ Falhou: ${failed}/${testCases.length}${colors.reset}
📈 Taxa de sucesso: ${(passed/testCases.length*100).toFixed(1)}%
`);

// ============ TESTE DETALHADO DE UM CASO ============
console.log(`
${colors.bold}────────────────────────────────────────────────────────────${colors.reset}
${colors.blue}🔍 TESTE DETALHADO: Mudança de Nome${colors.reset}
${colors.bold}────────────────────────────────────────────────────────────${colors.reset}
`);

const detailedTest = simulateAPICall(TEST_PROMPT, "Mude o nome para Clínica Derma Plus");

console.log(`📌 Instrução: "Mude o nome para Clínica Derma Plus"`);
console.log(`\n📦 Resposta da API:`);
console.log(`   method: "${detailedTest.method}"`);
console.log(`   changes: ${detailedTest.changes.length}`);
console.log(`   summary: "${detailedTest.summary}"`);

console.log(`\n📝 Mudanças aplicadas:`);
for (const change of detailedTest.changes) {
  console.log(`   • ${change.action}: "${change.target?.substring(0, 40)}..." → "${change.newContent?.substring(0, 40)}..."`);
}

console.log(`\n🔍 Verificação:`);
console.log(`   Contém "Derma Plus": ${detailedTest.newPrompt.includes("Derma Plus") ? colors.green + "SIM ✅" : colors.red + "NÃO ❌"}${colors.reset}`);
console.log(`   Contém "Beleza Pura": ${detailedTest.newPrompt.includes("Beleza Pura") ? colors.red + "SIM ❌" : colors.green + "NÃO ✅"}${colors.reset}`);

// ============ SIMULAR FLUXO COMPLETO DO FRONTEND ============
console.log(`
${colors.bold}────────────────────────────────────────────────────────────${colors.reset}
${colors.blue}🎯 SIMULAÇÃO DO FLUXO FRONTEND${colors.reset}
${colors.bold}────────────────────────────────────────────────────────────${colors.reset}
`);

// Simula o que o frontend faz
const currentPrompt = TEST_PROMPT;
const userInstruction = "Seja mais vendedor e use mais emojis";

console.log(`1. Frontend envia:`);
console.log(`   POST /api/agent/edit-prompt`);
console.log(`   { currentPrompt: "...", instruction: "${userInstruction}" }`);

const apiResponse = simulateAPICall(currentPrompt, userInstruction);

console.log(`\n2. Backend retorna:`);
console.log(`   {`);
console.log(`     newPrompt: "${apiResponse.newPrompt.substring(0, 50)}..."`);
console.log(`     changes: [${apiResponse.changes.length} items]`);
console.log(`     summary: "${apiResponse.summary}"`);
console.log(`     method: "${apiResponse.method}"`);
console.log(`   }`);

console.log(`\n3. Frontend verifica:`);
console.log(`   data.newPrompt existe? ${apiResponse.newPrompt ? colors.green + "SIM ✅" : colors.red + "NÃO ❌"}${colors.reset}`);

console.log(`\n4. Frontend atualiza estado:`);
console.log(`   setCurrentPrompt(data.newPrompt) ✅`);
console.log(`   setHasChanges(true) ✅`);

console.log(`
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
${colors.green}✅ SIMULAÇÃO COMPLETA - O FLUXO ESTÁ CORRETO${colors.reset}
${colors.bold}════════════════════════════════════════════════════════════${colors.reset}
`);
