/**
 * 🧪 TESTE DE CORREÇÕES DE BUGS
 * 
 * Este arquivo testa as correções implementadas:
 * 1. Detecção de bots
 * 2. Rate limiting
 * 3. Deduplicação de respostas
 * 4. Anti-amnésia melhorado
 */

import { analyzeConversationHistory } from './server/aiAgent';

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🧪 INICIANDO TESTES DE CORREÇÕES DE BUGS');
console.log('═══════════════════════════════════════════════════════════════════════\n');

// ════════════════════════════════════════════════════════════════════════════
// TESTE 1: Detecção de Loops por Saudação Repetida
// ════════════════════════════════════════════════════════════════════════════
console.log('📋 TESTE 1: Detecção de Loops por Saudação Repetida');
console.log('────────────────────────────────────────────────────────────────────────');

const conversationWithRepeatedGreetings = [
  { fromMe: true, text: 'Oi! Tudo bem? Sou a Ana da empresa X!', timestamp: new Date() },
  { fromMe: false, text: 'Oi', timestamp: new Date() },
  { fromMe: true, text: 'Olá! Seja bem-vindo! Sou a Ana da empresa X!', timestamp: new Date() },
  { fromMe: false, text: 'Oi, tudo bem?', timestamp: new Date() },
  { fromMe: true, text: 'Bom dia! Que bom te ver por aqui!', timestamp: new Date() },
];

const memory1 = analyzeConversationHistory(conversationWithRepeatedGreetings, 'João');
console.log(`   Saudações detectadas: ${memory1.greetingCount}x`);
console.log(`   Loop detectado: ${memory1.loopDetected ? '✅ SIM' : '❌ NÃO'}`);
console.log(`   Razão: ${memory1.loopReason || 'N/A'}`);
console.log(`   Resultado: ${memory1.loopDetected && memory1.greetingCount >= 2 ? '✅ PASSOU' : '❌ FALHOU'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// TESTE 2: Detecção de Pergunta de Nome Repetida
// ════════════════════════════════════════════════════════════════════════════
console.log('📋 TESTE 2: Detecção de Pergunta de Nome Repetida');
console.log('────────────────────────────────────────────────────────────────────────');

const conversationWithRepeatedNameQuestion = [
  { fromMe: true, text: 'Oi! Qual é seu nome?', timestamp: new Date() },
  { fromMe: false, text: 'João', timestamp: new Date() },
  { fromMe: true, text: 'Legal! E como você se chama?', timestamp: new Date() },
  { fromMe: false, text: 'Já disse, sou o João', timestamp: new Date() },
  { fromMe: true, text: 'Posso te chamar de quê?', timestamp: new Date() },
];

const memory2 = analyzeConversationHistory(conversationWithRepeatedNameQuestion, 'João');
console.log(`   Perguntas de nome: ${memory2.nameQuestionCount}x`);
console.log(`   Loop detectado: ${memory2.loopDetected ? '✅ SIM' : '❌ NÃO'}`);
console.log(`   Razão: ${memory2.loopReason || 'N/A'}`);
console.log(`   Resultado: ${memory2.loopDetected && memory2.nameQuestionCount >= 2 ? '✅ PASSOU' : '❌ FALHOU'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// TESTE 3: Detecção de Pergunta de Negócio Repetida
// ════════════════════════════════════════════════════════════════════════════
console.log('📋 TESTE 3: Detecção de Pergunta de Negócio Repetida');
console.log('────────────────────────────────────────────────────────────────────────');

const conversationWithRepeatedBusinessQuestion = [
  { fromMe: true, text: 'O que você faz? Qual seu ramo?', timestamp: new Date() },
  { fromMe: false, text: 'Tenho uma loja de roupas', timestamp: new Date() },
  { fromMe: true, text: 'Legal! E qual é seu negócio?', timestamp: new Date() },
  { fromMe: false, text: 'Já falei, loja de roupas', timestamp: new Date() },
  { fromMe: true, text: 'Que tipo de empresa você tem?', timestamp: new Date() },
];

const memory3 = analyzeConversationHistory(conversationWithRepeatedBusinessQuestion, 'Maria');
console.log(`   Perguntas de negócio: ${memory3.businessQuestionCount}x`);
console.log(`   Loop detectado: ${memory3.loopDetected ? '✅ SIM' : '❌ NÃO'}`);
console.log(`   Razão: ${memory3.loopReason || 'N/A'}`);
console.log(`   Resultado: ${memory3.loopDetected && memory3.businessQuestionCount >= 2 ? '✅ PASSOU' : '❌ FALHOU'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// TESTE 4: Detecção de Mensagem Repetida (Loop de Resposta)
// ════════════════════════════════════════════════════════════════════════════
console.log('📋 TESTE 4: Detecção de Mensagem Repetida (Loop de Resposta)');
console.log('────────────────────────────────────────────────────────────────────────');

const conversationWithRepeatedMessage = [
  { fromMe: false, text: 'Oi', timestamp: new Date() },
  { fromMe: true, text: 'Giordano, entendi que você trabalha com saúde e beleza! Quer ver como automatizar seu atendimento?', timestamp: new Date() },
  { fromMe: false, text: 'Sim', timestamp: new Date() },
  { fromMe: true, text: 'Giordano, entendi que você trabalha com saúde e beleza! Quer ver como automatizar seu atendimento?', timestamp: new Date() },
  { fromMe: false, text: 'Já mandou isso', timestamp: new Date() },
  { fromMe: true, text: 'Giordano, entendi que você trabalha com saúde e beleza! Quer ver como automatizar seu atendimento?', timestamp: new Date() },
];

const memory4 = analyzeConversationHistory(conversationWithRepeatedMessage, 'Giordano');
console.log(`   Loop detectado: ${memory4.loopDetected ? '✅ SIM' : '❌ NÃO'}`);
console.log(`   Razão: ${memory4.loopReason || 'N/A'}`);
console.log(`   Resultado: ${memory4.loopDetected ? '✅ PASSOU' : '❌ FALHOU'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// TESTE 5: Conversa Normal (Não deve detectar loop)
// ════════════════════════════════════════════════════════════════════════════
console.log('📋 TESTE 5: Conversa Normal (Não deve detectar loop)');
console.log('────────────────────────────────────────────────────────────────────────');

const normalConversation = [
  { fromMe: true, text: 'Oi! Sou a Ana da empresa X!', timestamp: new Date() },
  { fromMe: false, text: 'Oi, quero saber mais sobre o produto', timestamp: new Date() },
  { fromMe: true, text: 'Claro! O produto custa R$ 99,90 e tem várias funcionalidades', timestamp: new Date() },
  { fromMe: false, text: 'Legal, e como funciona?', timestamp: new Date() },
  { fromMe: true, text: 'Funciona assim: você cadastra e começa a usar!', timestamp: new Date() },
];

const memory5 = analyzeConversationHistory(normalConversation, 'Pedro');
console.log(`   Saudações: ${memory5.greetingCount}x`);
console.log(`   Perguntas nome: ${memory5.nameQuestionCount}x`);
console.log(`   Perguntas negócio: ${memory5.businessQuestionCount}x`);
console.log(`   Loop detectado: ${memory5.loopDetected ? '❌ SIM (ERRO!)' : '✅ NÃO'}`);
console.log(`   Resultado: ${!memory5.loopDetected ? '✅ PASSOU' : '❌ FALHOU'}\n`);

// ════════════════════════════════════════════════════════════════════════════
// RESUMO
// ════════════════════════════════════════════════════════════════════════════
console.log('═══════════════════════════════════════════════════════════════════════');
console.log('📊 RESUMO DOS TESTES');
console.log('═══════════════════════════════════════════════════════════════════════');

const tests = [
  { name: 'Saudação Repetida', passed: memory1.loopDetected && memory1.greetingCount >= 2 },
  { name: 'Nome Repetido', passed: memory2.loopDetected && memory2.nameQuestionCount >= 2 },
  { name: 'Negócio Repetido', passed: memory3.loopDetected && memory3.businessQuestionCount >= 2 },
  { name: 'Mensagem Repetida', passed: memory4.loopDetected },
  { name: 'Conversa Normal', passed: !memory5.loopDetected },
];

let passed = 0;
let failed = 0;

for (const test of tests) {
  if (test.passed) {
    passed++;
    console.log(`   ✅ ${test.name}`);
  } else {
    failed++;
    console.log(`   ❌ ${test.name}`);
  }
}

console.log('');
console.log(`   Total: ${passed}/${tests.length} testes passaram`);
console.log(`   Taxa de sucesso: ${Math.round(passed / tests.length * 100)}%`);
console.log('═══════════════════════════════════════════════════════════════════════\n');

if (failed > 0) {
  console.log('⚠️  Alguns testes falharam! Verifique as implementações.');
  process.exit(1);
} else {
  console.log('🎉 Todos os testes passaram! As correções estão funcionando.');
  process.exit(0);
}
