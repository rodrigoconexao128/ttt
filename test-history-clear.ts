/**
 * TESTE REAL: Validar que a limpeza de histórico funciona corretamente
 * 
 * Este teste simula:
 * 1. Um cliente novo conversa com Rodrigo
 * 2. Admin clica em "Limpar histórico"
 * 3. Cliente envia nova mensagem
 * 4. Rodrigo DEVE tratá-lo como cliente NOVO (perguntar sobre negócio)
 */

import {
  processAdminMessage,
  getClientSession,
  createClientSession,
  clearClientSession,
  wasChatCleared,
  shouldForceOnboarding
} from './server/adminAgentService';

// Telefone de teste
const TEST_PHONE = '5511888887777';

async function runHistoryClearTest(): Promise<void> {
  console.log('\n===========================================');
  console.log('🧪 TESTE: LIMPEZA DE HISTÓRICO');
  console.log('===========================================\n');
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // ============================================
    // FASE 1: Simular cliente novo conversando
    // ============================================
    console.log('📍 FASE 1: Cliente novo conversando com Rodrigo');
    console.log('-------------------------------------------');
    
    // Criar sessão inicial
    createClientSession(TEST_PHONE);
    const session1 = getClientSession(TEST_PHONE);
    
    console.log(`✅ Sessão criada para ${TEST_PHONE}`);
    console.log(`   flowState inicial: ${session1?.flowState || 'N/A'}`);
    
    // Simular primeira mensagem do cliente (skipTriggerCheck=true para teste)
    console.log('\n🗣️ Enviando primeira mensagem do cliente...');
    const response1Result = await processAdminMessage(TEST_PHONE, 'Olá, quero saber sobre o sistema', undefined, undefined, true);
    const response1 = response1Result?.text || '';
    
    console.log(`📨 Resposta do Rodrigo (primeiros 200 chars):`);    console.log(`   "${response1.substring(0, 200)}..."`);
    
    // Verificar se a sessão mudou
    const session2 = getClientSession(TEST_PHONE);
    console.log(`\n📊 Estado após primeira conversa:`);
    console.log(`   flowState: ${session2?.flowState}`);
    console.log(`   businessType: ${session2?.businessType || 'N/A'}`);
    console.log(`   conversationHistory: ${session2?.conversationHistory?.length || 0} mensagens`);
    
    // TESTE 1: Sessão deve existir
    if (session2) {
      console.log('\n✅ TESTE 1 PASSOU: Sessão existe após conversa');
      testsPassed++;
    } else {
      console.log('\n❌ TESTE 1 FALHOU: Sessão não existe');
      testsFailed++;
    }
    
    // ============================================
    // FASE 2: Admin limpa o histórico
    // ============================================
    console.log('\n\n📍 FASE 2: Admin limpa o histórico');
    console.log('-------------------------------------------');
    
    console.log('🗑️ Chamando clearClientSession()...');
    const cleared = clearClientSession(TEST_PHONE);
    
    // TESTE 2: Limpeza retornou sucesso
    if (cleared) {
      console.log('✅ TESTE 2 PASSOU: clearClientSession() retornou true');
      testsPassed++;
    } else {
      console.log('❌ TESTE 2 FALHOU: clearClientSession() retornou false');
      testsFailed++;
    }
    
    // Verificar flags
    const isCleared = wasChatCleared(TEST_PHONE);
    const forceOnboard = shouldForceOnboarding(TEST_PHONE);
    
    console.log(`\n📊 Flags após limpeza:`);
    console.log(`   wasChatCleared: ${isCleared}`);
    console.log(`   shouldForceOnboarding: ${forceOnboard}`);
    
    // TESTE 3: Flag wasChatCleared deve ser true
    if (isCleared) {
      console.log('\n✅ TESTE 3 PASSOU: wasChatCleared() retorna true');
      testsPassed++;
    } else {
      console.log('\n❌ TESTE 3 FALHOU: wasChatCleared() não retorna true');
      testsFailed++;
    }
    
    // TESTE 4: Flag shouldForceOnboarding deve ser true
    if (forceOnboard) {
      console.log('✅ TESTE 4 PASSOU: shouldForceOnboarding() retorna true');
      testsPassed++;
    } else {
      console.log('❌ TESTE 4 FALHOU: shouldForceOnboarding() não retorna true');
      testsFailed++;
    }
    
    // ============================================
    // FASE 3: Cliente envia nova mensagem
    // ============================================
    console.log('\n\n📍 FASE 3: Cliente envia nova mensagem após limpeza');
    console.log('-------------------------------------------');

    // Enviar nova mensagem (processAdminMessage vai recriar sessão automaticamente)
    console.log('\n🗣️ Enviando mensagem após limpeza: "Oi"');
    const response2Result = await processAdminMessage(TEST_PHONE, 'Oi', undefined, undefined, true);
    const response2 = response2Result?.text || '';
    
    // Verificar sessão após resposta
    const session3 = getClientSession(TEST_PHONE);
    console.log(`\n📊 Estado da sessão após nova mensagem:`);
    console.log(`   flowState: ${session3?.flowState}`);
    console.log(`   businessType: ${session3?.businessType || 'N/A'}`);
    console.log(`   userId: ${session3?.userId || 'N/A'}`);
    
    console.log(`\n📨 Resposta do Rodrigo:`);
    console.log(`"${response2}"`);
    
    // TESTE 5: flowState deve ser onboarding (cliente novo)
    if (session3?.flowState === 'onboarding') {
      console.log('\n✅ TESTE 5 PASSOU: flowState é "onboarding" (cliente novo)');
      testsPassed++;
    } else {
      console.log(`\n❌ TESTE 5 FALHOU: flowState é "${session3?.flowState}" (esperado: onboarding)`);
      testsFailed++;
    }
    
    // TESTE 6: Rodrigo deve perguntar sobre o negócio (tratando como novo)
    const responseLC = response2.toLowerCase();
    const isNewClientResponse = 
      responseLC.includes('negócio') ||
      responseLC.includes('negocio') ||
      responseLC.includes('tipo de negócio') ||
      responseLC.includes('área') ||
      responseLC.includes('empresa') ||
      responseLC.includes('trabalha') ||
      responseLC.includes('ramo') ||
      responseLC.includes('segmento') ||
      responseLC.includes('atua') ||
      responseLC.includes('atividade') ||
      responseLC.includes('conte') ||
      responseLC.includes('fale') ||
      responseLC.includes('ajudar') ||
      responseLC.includes('interesse') ||
      responseLC.includes('conhecer') ||
      responseLC.includes('bem-vindo') ||
      responseLC.includes('prazer') ||
      responseLC.includes('sou rodrigo') ||
      responseLC.includes('sou o rodrigo') ||
      responseLC.includes('me chamo') ||
      responseLC.includes('meu nome') ||
      responseLC.includes('vende') ||
      responseLC.includes('atendimento');
    
    if (isNewClientResponse) {
      console.log('✅ TESTE 6 PASSOU: Rodrigo tratou como cliente novo');
      testsPassed++;
    } else {
      console.log('❌ TESTE 6 FALHOU: Rodrigo não tratou como cliente novo');
      console.log('   Resposta deveria conter apresentação/perguntar sobre negócio');
      testsFailed++;
    }
    
    // ============================================
    // RESULTADO FINAL
    // ============================================
    console.log('\n\n===========================================');
    console.log('📊 RESULTADO FINAL DO TESTE');
    console.log('===========================================');
    console.log(`✅ Testes passaram: ${testsPassed}`);
    console.log(`❌ Testes falharam: ${testsFailed}`);
    console.log(`📈 Taxa de sucesso: ${Math.round((testsPassed / (testsPassed + testsFailed)) * 100)}%`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 TODOS OS TESTES PASSARAM!');
      console.log('✅ A limpeza de histórico está funcionando corretamente!');
    } else {
      console.log('\n⚠️ ALGUNS TESTES FALHARAM');
      console.log('🔧 Revisar implementação da limpeza de histórico');
    }
    
  } catch (error: any) {
    console.error('\n❌ ERRO DURANTE O TESTE:', error.message);
    console.error(error.stack);
    testsFailed++;
  }
}

// Executar
runHistoryClearTest().then(() => {
  console.log('\n\n🏁 Teste finalizado');
  process.exit(0);
}).catch(err => {
  console.error('Erro fatal:', err);
  process.exit(1);
});
