/**
 * TESTE ISOLADO DE TAGS DE MÍDIA
 * Não depende de banco de dados - testa apenas o regex
 */

// Copia da função parseMistralResponse para teste isolado
function parseMistralResponse(responseText: string): { messages: { content: string }[], actions: { type: string, media_name: string }[] } | null {
  try {
    // 🔥 REGEX UNIFICADO: Aceita TODOS os formatos de tag de mídia
    // [MEDIA:NOME], [ENVIAR_MIDIA:NOME], [MIDIA:NOME]
    const mediaTagRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):([A-Z0-9_]+)\]/gi;
    
    const actions: { type: string, media_name: string }[] = [];
    let match: RegExpExecArray | null;
    const detectedNames = new Set<string>(); // Evitar duplicatas
    
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
      const tagType = match[1].toUpperCase(); // MEDIA, ENVIAR_MIDIA ou MIDIA
      const mediaName = match[2].toUpperCase();
      
      // Evitar adicionar a mesma mídia duas vezes
      if (!detectedNames.has(mediaName)) {
        detectedNames.add(mediaName);
        actions.push({
          type: 'send_media',
          media_name: mediaName,
        });
        console.log(`📁 [MediaService] Tag de mídia detectada [${tagType}]: ${mediaName}`);
      }
    }
    
    // 🧹 Remover TODAS as variantes de tags do texto final
    const cleanText = responseText
      .replace(/\[(MEDIA|ENVIAR_MIDIA|MIDIA):[A-Z0-9_]+\]/gi, '')
      .replace(/\s{2,}/g, ' ') // Remover espaços duplicados
      .trim();
    
    if (actions.length > 0) {
      console.log(`📁 [MediaService] Total de ${actions.length} mídia(s) para enviar: ${actions.map(a => a.media_name).join(', ')}`);
    }
    
    return {
      messages: [{ content: cleanText }],
      actions,
    };
  } catch (error) {
    console.error(`[MediaService] Error parsing Mistral response:`, error);
    return {
      messages: [{ content: responseText }],
      actions: [],
    };
  }
}

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
  {
    name: 'Tag do prompt do rodrigo4',
    input: 'Veja como funciona! [ENVIAR_MIDIA:VIDEO_CADASTRO]',
    expectedMedia: ['VIDEO_CADASTRO'],
  },
];

let passed = 0;
let failed = 0;

for (const test of testCases) {
  console.log(`\n📋 Teste: ${test.name}`);
  console.log(`   Input: "${test.input.substring(0, 60)}${test.input.length > 60 ? '...' : ''}"`);
  
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
    console.log(`   📝 Texto limpo: "${result.messages[0].content}"`);
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
