/**
 * Teste simples da função parseAdminMediaTags
 * Não precisa de banco de dados
 */

// Função copiada do adminMediaStore
function parseAdminMediaTags(text: string): string[] {
  // Match [ENVIAR_MIDIA:NOME_DA_MIDIA]
  const regex = /\[ENVIAR_MIDIA:([^\]]+)\]/g;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1].trim());
  }
  
  return tags;
}

console.log('\n========================================');
console.log('TESTE DE PARSING DE TAGS DE MÍDIA');
console.log('========================================\n');

// Casos de teste
const testCases = [
  {
    name: 'Resposta com tag correta',
    text: 'Olá! Deixa eu te explicar como funciona nosso sistema. [ENVIAR_MIDIA:COMO_FUNCIONA] Qualquer dúvida me avisa!',
    expected: ['COMO_FUNCIONA']
  },
  {
    name: 'Múltiplas tags',
    text: 'Veja nosso vídeo [ENVIAR_MIDIA:VIDEO_DEMO] e também nossos preços [ENVIAR_MIDIA:TABELA_PRECOS]',
    expected: ['VIDEO_DEMO', 'TABELA_PRECOS']
  },
  {
    name: 'Sem tags',
    text: 'Olá! Tudo bem? Posso ajudar você com alguma coisa?',
    expected: []
  },
  {
    name: 'Tag no início',
    text: '[ENVIAR_MIDIA:APRESENTACAO] Este é nosso sistema!',
    expected: ['APRESENTACAO']
  },
  {
    name: 'Tag no final',
    text: 'Veja aqui o documento: [ENVIAR_MIDIA:CONTRATO]',
    expected: ['CONTRATO']
  },
  {
    name: 'Tag com espaços no nome (deve funcionar)',
    text: 'Veja: [ENVIAR_MIDIA:MINHA MIDIA]',
    expected: ['MINHA MIDIA']
  },
  {
    name: 'Tag com underscores',
    text: 'Veja: [ENVIAR_MIDIA:VIDEO_EXPLICATIVO_COMPLETO]',
    expected: ['VIDEO_EXPLICATIVO_COMPLETO']
  }
];

let passed = 0;
let failed = 0;

for (const testCase of testCases) {
  const result = parseAdminMediaTags(testCase.text);
  const success = JSON.stringify(result) === JSON.stringify(testCase.expected);
  
  if (success) {
    console.log(`✅ ${testCase.name}`);
    console.log(`   Input: "${testCase.text.substring(0, 50)}..."`);
    console.log(`   Result: ${JSON.stringify(result)}`);
    passed++;
  } else {
    console.log(`❌ ${testCase.name}`);
    console.log(`   Input: "${testCase.text}"`);
    console.log(`   Expected: ${JSON.stringify(testCase.expected)}`);
    console.log(`   Got: ${JSON.stringify(result)}`);
    failed++;
  }
  console.log('');
}

console.log('========================================');
console.log(`RESULTADO: ${passed} passou, ${failed} falhou`);
console.log('========================================\n');

// Agora simular uma resposta da IA que NÃO tem a tag
console.log('\n========================================');
console.log('PROBLEMA ATUAL: IA NÃO INCLUI A TAG');
console.log('========================================\n');

const iaResponseWithoutTag = `Fala, tudo tranquilo por aí? 😄

Então, deixa eu te explicar como funciona o AgenteZap. Basicamente, é um sistema de automação para WhatsApp que permite que você crie agentes de atendimento personalizados para o seu negócio.

Funciona assim:
1. Você cadastra as informações do seu negócio
2. Treina o agente com perguntas e respostas
3. O agente atende seus clientes automaticamente 24/7

Quer saber mais sobre algum ponto específico?`;

const tagsFromIA = parseAdminMediaTags(iaResponseWithoutTag);
console.log('Resposta da IA (simulada):');
console.log(iaResponseWithoutTag);
console.log('\nTags encontradas:', tagsFromIA);
console.log('Quantidade:', tagsFromIA.length);

console.log('\n========================================');
console.log('SOLUÇÃO: IA DEVERIA RESPONDER ASSIM');
console.log('========================================\n');

const iaResponseWithTag = `Fala, tudo tranquilo por aí? 😄

Então, deixa eu te explicar como funciona o AgenteZap. [ENVIAR_MIDIA:COMO_FUNCIONA]

Basicamente, é um sistema de automação para WhatsApp que permite que você crie agentes de atendimento personalizados para o seu negócio.

Quer saber mais sobre algum ponto específico?`;

const tagsFromIA2 = parseAdminMediaTags(iaResponseWithTag);
console.log('Resposta da IA (correta):');
console.log(iaResponseWithTag);
console.log('\nTags encontradas:', tagsFromIA2);
console.log('Quantidade:', tagsFromIA2.length);
