/**
 * Teste rápido: Verificar se /api/agent/test retorna media_url
 */

import * as dotenv from "dotenv";
dotenv.config();

async function testMediaURL() {
  console.log('🔍 Testando resolução de URLs de mídia...\n');
  
  const userId = 'cb9213c3-fde3-479e-a4aa-344171c59735';
  
  // Simular request ao endpoint /api/agent/test
  const { testAgentResponse } = await import('./server/aiAgent');
  const { getAgentMediaLibrary } = await import('./server/mediaService');
  
  console.log('📨 Enviando: "Oi, tudo bem?"');
  
  const result = await testAgentResponse(userId, "Oi, tudo bem?", undefined, [], []);
  
  console.log('\n✅ Resultado do testAgentResponse:');
  console.log('   Text:', result.text.substring(0, 80) + '...');
  console.log('   MediaActions (sem URL):', result.mediaActions);
  
  // Agora resolver URLs como o endpoint faz
  let mediaActionsWithURL: any[] = [];
  if (result.mediaActions && result.mediaActions.length > 0) {
    const mediaLibrary = await getAgentMediaLibrary(userId);
    
    for (const action of result.mediaActions) {
      if (action.type === 'send_media' && action.media_name) {
        const mediaItem = mediaLibrary.find(
          m => m.name.toUpperCase() === action.media_name.toUpperCase()
        );
        
        if (mediaItem) {
          mediaActionsWithURL.push({
            type: 'send_media',
            media_name: action.media_name,
            media_url: mediaItem.storageUrl,
            media_type: mediaItem.mediaType,
            caption: mediaItem.caption || mediaItem.description,
          });
        }
      }
    }
  }
  
  console.log('\n🎯 MediaActions COM URLs resolvidas:');
  console.log(JSON.stringify(mediaActionsWithURL, null, 2));
  
  if (mediaActionsWithURL.length > 0 && mediaActionsWithURL[0].media_url) {
    console.log('\n✅ SUCESSO! URLs estão sendo resolvidas corretamente.');
    console.log(`   URL da mídia: ${mediaActionsWithURL[0].media_url}`);
  } else {
    console.log('\n❌ FALHA! URLs não foram resolvidas.');
  }
}

testMediaURL().catch(console.error);
