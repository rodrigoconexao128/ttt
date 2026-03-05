/**
 * Teste direto da função generateAIResponse do adminAgentService
 * Simula mensagem e verifica se a IA inclui tags de mídia
 */

import 'dotenv/config';

async function main() {
  console.log('\n========================================');
  console.log('TESTE DIRETO DA IA COM MÍDIAS');
  console.log('========================================\n');

  // Import dinamicamente após carregar .env
  const { processAdminMessage, createClientSession, clearClientSession } = await import('./server/adminAgentService');
  const { generateAdminMediaPromptBlock, parseAdminMediaTags, getAdminMediaList } = await import('./server/adminMediaStore');
  
  // Verificar mídias disponíveis
  console.log('1️⃣ Verificando mídias no banco...');
  const mediaList = await getAdminMediaList();
  console.log(`   Encontradas: ${mediaList.length} mídia(s)`);
  for (const m of mediaList) {
    console.log(`   - ${m.name} (${m.mediaType}): ${m.whenToUse?.substring(0, 50)}...`);
  }
  console.log('');
  
  // Gerar prompt block
  console.log('2️⃣ Gerando prompt block...');
  const promptBlock = await generateAdminMediaPromptBlock();
  console.log(`   Tamanho: ${promptBlock.length} caracteres\n`);
  
  // Limpar sessão anterior para teste limpo
  const testPhone = '5511999999999';
  console.log('3️⃣ Limpando sessão anterior...');
  clearClientSession(testPhone);
  console.log('   Sessão limpa\n');
  
  // Testar com mensagens diferentes
  const testMessages = [
    'oi',
    'como funciona o sistema?',
    'qual o preço?',
    'me mostra um video',
    'tem contrato?'
  ];
  
  console.log('4️⃣ Testando respostas da IA...\n');
  
  for (const msg of testMessages) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📤 CLIENTE: "${msg}"`);
    
    try {
      // processAdminMessage(phone, message, mediaType?, mediaUrl?, skipTriggerCheck)
      const response = await processAdminMessage(testPhone, msg, undefined, undefined, true); // skipTriggerCheck = true
      
      // Verificar tags na resposta original
      const { cleanText, mediaActions } = parseAdminMediaTags(response.text);
      
      console.log(`📥 IA (limpo): "${cleanText.substring(0, 100)}..."`);
      console.log(`🏷️ Tags encontradas: ${mediaActions.length}`);
      
      if (mediaActions.length > 0) {
        console.log(`   ✅ MÍDIA(S): ${mediaActions.map(a => a.media_name).join(', ')}`);
      } else {
        console.log(`   ⚠️ Nenhuma mídia na resposta`);
      }
      
      // Verificar se response.mediaActions foi populado
      if (response.mediaActions && response.mediaActions.length > 0) {
        console.log(`   📁 Media actions processadas: ${response.mediaActions.length}`);
      }
      
    } catch (error: any) {
      console.log(`   ❌ Erro: ${error.message}`);
    }
    
    console.log('');
  }
  
  console.log('========================================');
  console.log('TESTE CONCLUÍDO');
  console.log('========================================\n');
  
  process.exit(0);
}

main().catch(console.error);
