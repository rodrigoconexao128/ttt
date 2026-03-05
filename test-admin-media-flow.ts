/**
 * Teste do fluxo de mídias do Admin Agent
 * Este teste conecta ao banco real e verifica:
 * 1. Se as mídias são carregadas
 * 2. Se o prompt block é gerado corretamente
 * 3. Se o parsing de tags funciona
 */

import 'dotenv/config';
import { storage } from './server/storage';
import { 
  getAdminMediaList, 
  generateAdminMediaPromptBlock, 
  parseAdminMediaTags,
  getAdminMediaByName,
  forceReloadCache
} from './server/adminMediaStore';

async function runTests() {
  console.log('\n========================================');
  console.log('TESTE DO FLUXO DE MÍDIAS DO ADMIN AGENT');
  console.log('========================================\n');

  try {
    // 1. Forçar recarga do cache
    console.log('1️⃣ Forçando recarga do cache...');
    await forceReloadCache('any');
    console.log('   ✅ Cache recarregado\n');

    // 2. Listar mídias
    console.log('2️⃣ Listando mídias do banco...');
    const mediaList = await getAdminMediaList();
    console.log(`   ✅ ${mediaList.length} mídia(s) encontrada(s)\n`);
    
    for (const media of mediaList) {
      console.log(`   📁 ${media.name} (${media.mediaType})`);
      console.log(`      Descrição: ${media.description}`);
      console.log(`      Quando usar: ${media.whenToUse || 'N/A'}`);
      console.log(`      URL: ${media.storageUrl?.substring(0, 60)}...`);
      console.log('');
    }

    // 3. Gerar prompt block
    console.log('3️⃣ Gerando bloco de prompt...');
    const promptBlock = await generateAdminMediaPromptBlock();
    console.log(`   ✅ Prompt block gerado (${promptBlock.length} caracteres)\n`);
    console.log('--- INÍCIO DO PROMPT BLOCK ---');
    console.log(promptBlock);
    console.log('--- FIM DO PROMPT BLOCK ---\n');

    // 4. Testar parsing de tags
    console.log('4️⃣ Testando parsing de tags...');
    
    const testCases = [
      {
        input: 'Vou te explicar como funciona! [ENVIAR_MIDIA:COMO_FUNCIONA]',
        expectedTags: ['COMO_FUNCIONA']
      },
      {
        input: 'Segue o vídeo e o áudio! [ENVIAR_MIDIA:VIDEO_DEMO] [ENVIAR_MIDIA:AUDIO_PRECO]',
        expectedTags: ['VIDEO_DEMO', 'AUDIO_PRECO']
      },
      {
        input: 'Olá! Como posso ajudar?',
        expectedTags: []
      }
    ];

    for (const testCase of testCases) {
      const result = parseAdminMediaTags(testCase.input);
      const tagNames = result.mediaActions.map(a => a.media_name);
      const success = JSON.stringify(tagNames) === JSON.stringify(testCase.expectedTags);
      
      if (success) {
        console.log(`   ✅ "${testCase.input.substring(0, 40)}..." → ${JSON.stringify(tagNames)}`);
      } else {
        console.log(`   ❌ "${testCase.input.substring(0, 40)}..."`);
        console.log(`      Esperado: ${JSON.stringify(testCase.expectedTags)}`);
        console.log(`      Obtido: ${JSON.stringify(tagNames)}`);
      }
    }
    console.log('');

    // 5. Testar busca por nome
    console.log('5️⃣ Testando busca por nome de mídia...');
    
    if (mediaList.length > 0) {
      const firstName = mediaList[0].name;
      const foundMedia = await getAdminMediaByName(undefined, firstName);
      
      if (foundMedia) {
        console.log(`   ✅ Mídia "${firstName}" encontrada!`);
        console.log(`      Tipo: ${foundMedia.mediaType}`);
        console.log(`      URL: ${foundMedia.storageUrl?.substring(0, 60)}...`);
      } else {
        console.log(`   ❌ Mídia "${firstName}" NÃO encontrada`);
      }
    } else {
      console.log('   ⚠️ Nenhuma mídia no banco para testar busca');
    }

    console.log('\n========================================');
    console.log('TESTE CONCLUÍDO');
    console.log('========================================\n');

  } catch (error) {
    console.error('❌ Erro no teste:', error);
  }

  process.exit(0);
}

runTests();
