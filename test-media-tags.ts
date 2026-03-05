/**
 * TESTE DE TAGS DE MÍDIA
 * Verifica se o sistema detecta corretamente as diferentes variações de tags
 */

import * as dotenv from 'dotenv';
dotenv.config();

import { parseMistralResponse } from './server/mediaService';

console.log('🧪 TESTANDO PARSER DE TAGS DE MÍDIA\n');
console.log('═'.repeat(60));

const testCases = [
  {
    name: 'Tag [MEDIA:NOME] - formato padrão',
    input: 'Vou te enviar agora! [MEDIA:VIDEO_DEMO]',
    expectedMedia: ['VIDEO_DEMO'],
  },
  {
    name: 'Tag [ENVIAR_MIDIA:NOME] - formato legacy',
    input: 'Aqui está! [ENVIAR_MIDIA:AUDIO_INTRO]',
    expectedMedia: ['AUDIO_INTRO'],
  },
  {
    name: 'Tag [MIDIA:NOME] - formato alternativo',
    input: 'Segue o material [MIDIA:DOCUMENTO_PDF]',
    expectedMedia: ['DOCUMENTO_PDF'],
  },
  {
    name: 'Múltiplas tags diferentes',
    input: 'Confira: [MEDIA:VIDEO_1] e também [ENVIAR_MIDIA:AUDIO_2]',
    expectedMedia: ['VIDEO_1', 'AUDIO_2'],
  },
  {
    name: 'Tag no final da mensagem',
    input: 'Deixa eu te mostrar como funciona na prática, vai te ajudar muito a entender! [MEDIA:COMO_FUNCIONA]',
    expectedMedia: ['COMO_FUNCIONA'],
  },
  {
    name: 'Sem tags - deve retornar vazio',
    input: 'Vou te enviar um vídeo explicativo...',
    expectedMedia: [],
  },
  {
    name: 'Tag com nome complexo (underscores)',
    input: 'Pronto! [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]',
    expectedMedia: ['MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR'],
  },
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\n📋 Teste: ${test.name}`);
  console.log(`   Input: "${test.input.substring(0, 50)}${test.input.length > 50 ? '...' : ''}"`);
  
  const result = parseMistralResponse(test.input);
  const detectedMedias = result?.actions?.map(a => a.media_name) || [];
  
  const expectedSet = new Set(test.expectedMedia.map(m => m.toUpperCase()));
  const detectedSet = new Set(detectedMedias.map(m => m?.toUpperCase() || ''));
  
  const isEqual = expectedSet.size === detectedSet.size && 
    [...expectedSet].every(m => detectedSet.has(m));
  
  if (isEqual) {
    console.log(`   ✅ PASSOU - Detectou: [${detectedMedias.join(', ')}]`);
    passed++;
  } else {
    console.log(`   ❌ FALHOU`);
    console.log(`      Esperado: [${test.expectedMedia.join(', ')}]`);
    console.log(`      Detectou: [${detectedMedias.join(', ')}]`);
    failed++;
  }
  
  // Mostrar texto limpo
  if (result?.messages?.[0]?.content) {
    console.log(`   📝 Texto limpo: "${result.messages[0].content.substring(0, 50)}..."`);
  }
}

console.log('\n' + '═'.repeat(60));
console.log(`📊 RESULTADO FINAL: ${passed}/${testCases.length} testes passaram`);
if (failed > 0) {
  console.log(`❌ ${failed} teste(s) falharam`);
  process.exit(1);
} else {
  console.log('✅ Todos os testes passaram!');
  process.exit(0);
}
