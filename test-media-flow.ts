/**
 * Script de teste para verificar fluxo de mídias do admin agent
 * Executa: npx tsx test-media-flow.ts
 */

import { generateAdminMediaPromptBlock, parseAdminMediaTags, getAdminMediaByName, getAdminMediaList } from './server/adminMediaStore';

async function testMediaFlow() {
  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('🧪 TESTE DE FLUXO DE MÍDIAS DO ADMIN AGENT');
  console.log('═══════════════════════════════════════════════════════════════\n');

  // 1. Listar mídias disponíveis
  console.log('📋 1. LISTANDO MÍDIAS DISPONÍVEIS:\n');
  const mediaList = await getAdminMediaList(undefined);
  
  if (mediaList.length === 0) {
    console.log('❌ NENHUMA MÍDIA CADASTRADA!');
    console.log('   Acesse o painel admin -> Agente IA -> Mídias e adicione mídias\n');
  } else {
    console.log(`✅ ${mediaList.length} mídia(s) encontrada(s):\n`);
    for (const media of mediaList) {
      console.log(`   📁 Nome: ${media.name}`);
      console.log(`      Tipo: ${media.mediaType}`);
      console.log(`      Descrição: ${media.description || 'N/A'}`);
      console.log(`      Quando usar: ${media.whenToUse || 'N/A'}`);
      console.log(`      URL: ${media.storageUrl?.substring(0, 60)}...`);
      console.log('');
    }
  }

  // 2. Gerar bloco de prompt
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📝 2. BLOCO DE PROMPT GERADO PARA A IA:\n');
  const promptBlock = await generateAdminMediaPromptBlock(undefined);
  
  if (!promptBlock) {
    console.log('❌ Bloco vazio - nenhuma mídia para gerar prompt');
  } else {
    console.log(promptBlock);
  }

  // 3. Testar parseAdminMediaTags
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔍 3. TESTANDO PARSER DE TAGS:\n');
  
  const testCases = [
    'Vou te explicar! [ENVIAR_MIDIA:COMO_FUNCIONA]',
    'Segue o áudio explicando [ENVIAR_MIDIA:COMO_FUNCIONA] e a foto [ENVIAR_MIDIA:FOTO_PRODUTO]',
    'Resposta sem mídia alguma',
    'Teste com tag errada [ENVIAR_MEDIA:TESTE]',
    '[ENVIAR_MIDIA:AUDIO_TESTE]',
  ];

  for (const testCase of testCases) {
    const result = parseAdminMediaTags(testCase);
    console.log(`   Input: "${testCase}"`);
    console.log(`   → cleanText: "${result.cleanText}"`);
    console.log(`   → mediaActions: ${JSON.stringify(result.mediaActions)}`);
    console.log('');
  }

  // 4. Testar busca de mídia por nome
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('🔎 4. TESTANDO BUSCA POR NOME:\n');
  
  const testNames = ['COMO_FUNCIONA', 'como_funciona', 'COMO FUNCIONA', 'NAO_EXISTE'];
  
  for (const name of testNames) {
    const media = await getAdminMediaByName(undefined, name);
    if (media) {
      console.log(`   ✅ "${name}" → Encontrada: ${media.name} (${media.mediaType})`);
    } else {
      console.log(`   ❌ "${name}" → Não encontrada`);
    }
  }

  console.log('\n═══════════════════════════════════════════════════════════════');
  console.log('✅ TESTE CONCLUÍDO');
  console.log('═══════════════════════════════════════════════════════════════\n');
}

testMediaFlow().catch(console.error);
