/**
 * TESTE REAL DE ÁUDIO
 * 
 * Este teste REALMENTE verifica se o áudio chegou no WhatsApp
 * ao invés de só confiar no MessageId retornado
 */

import fetch from 'node-fetch';
import { setTimeout as sleep } from 'timers/promises';

const API_URL = 'http://localhost:5000';
const TEST_JID = '5517991956944@s.whatsapp.net'; // Seu número
const AUDIO_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/731f255c-7fcd-4af9-9431-142e0a0234a1/1765288302760_explicacaorestaurante.opus';

async function testAudioDelivery() {
  console.log('🧪 TESTE REAL DE ENTREGA DE ÁUDIO');
  console.log('=====================================\n');

  try {
    // 1. Enviar o áudio
    console.log('📤 Passo 1: Enviando áudio via API...');
    const sendResponse = await fetch(`${API_URL}/api/debug/send-audio`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        audioUrl: AUDIO_URL,
        jid: TEST_JID,
        isPtt: true,
        mimetype: 'audio/mp4' // Forçar mp4 como nos testes do Baileys
      })
    });

    const sendResult = await sendResponse.json();
    console.log('📋 Resultado do envio:', JSON.stringify(sendResult, null, 2));

    if (!sendResult.success) {
      console.error('❌ FALHA: API retornou erro ao enviar');
      return false;
    }

    const messageId = sendResult.messageId;
    console.log(`✅ MessageId retornado: ${messageId}\n`);

    // 2. Aguardar 3 segundos para o áudio chegar
    console.log('⏳ Passo 2: Aguardando 3 segundos para o áudio ser entregue...');
    await sleep(3000);

    // 3. VERIFICAÇÃO MANUAL
    console.log('\n📱 Passo 3: VERIFICAÇÃO MANUAL NECESSÁRIA');
    console.log('=========================================');
    console.log(`Por favor, verifique seu WhatsApp (${TEST_JID.replace('@s.whatsapp.net', '')})`);
    console.log('\n❓ O áudio REALMENTE chegou?');
    console.log('   [ ] SIM - Apareceu um áudio com ícone de microfone');
    console.log('   [ ] NÃO - Nada chegou no WhatsApp\n');

    // 4. Tentar buscar a mensagem via API de histórico
    console.log('🔍 Passo 4: Tentando buscar mensagem no histórico...');
    try {
      const historyResponse = await fetch(`${API_URL}/api/messages?contactNumber=5517991956944&limit=10`);
      const historyData = await historyResponse.json();
      
      console.log(`📚 Encontradas ${historyData.messages?.length || 0} mensagens recentes`);
      
      // Procurar pela mensagem enviada
      const sentMessage = historyData.messages?.find((msg: any) => 
        msg.messageId === messageId && msg.isFromMe
      );

      if (sentMessage) {
        console.log('✅ Mensagem encontrada no histórico:');
        console.log(`   - Tipo: ${sentMessage.mediaType || 'text'}`);
        console.log(`   - Status: ${sentMessage.status || 'unknown'}`);
        console.log(`   - Timestamp: ${sentMessage.timestamp}`);
        
        if (sentMessage.mediaType === 'audio' || sentMessage.body?.includes('🎤')) {
          console.log('✅ CONFIRMADO: Mensagem de áudio registrada no sistema');
        } else {
          console.log('⚠️  AVISO: Mensagem não aparece como áudio no sistema');
        }
      } else {
        console.log('❌ Mensagem NÃO encontrada no histórico');
        console.log('   Isso pode significar que a mensagem não foi persistida');
      }
    } catch (historyError) {
      console.log('⚠️  Não foi possível buscar histórico:', historyError);
    }

    console.log('\n📊 RESULTADO FINAL:');
    console.log('===================');
    console.log(`✅ MessageId retornado: ${messageId}`);
    console.log(`❓ Áudio chegou no WhatsApp: VERIFICAR MANUALMENTE`);
    console.log('\n💡 DICA: Se o MessageId existe mas o áudio NÃO chegou,');
    console.log('   então o problema está no Baileys ou no formato do arquivo.');

    return true;

  } catch (error) {
    console.error('❌ ERRO NO TESTE:', error);
    return false;
  }
}

// Executar o teste
testAudioDelivery().then((success) => {
  console.log('\n' + '='.repeat(50));
  if (success) {
    console.log('✅ Teste concluído - Verifique os resultados acima');
  } else {
    console.log('❌ Teste falhou - Veja os erros acima');
  }
  process.exit(success ? 0 : 1);
});
