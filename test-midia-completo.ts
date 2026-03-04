/**
 * Teste COMPLETO de mídias no simulador
 * Simula exatamente o que acontece quando o frontend chama /api/test-agent/message
 */

import * as dotenv from "dotenv";
dotenv.config();

import { handleTestAgentMessage } from "./server/testAgentService";
import { storage } from "./server/storage";
import { getMistralClient } from "./server/mistralClient";
import { processAdminMessage } from "./server/adminAgentService";
import { getAgentMediaLibrary, generateMediaPromptBlock, parseMistralResponse } from "./server/mediaService";

async function getTestToken(token: string) {
  return undefined; // Para este teste, vamos passar userId diretamente
}

async function testSimulador() {
  console.log('🎬 ════════════════════════════════════════════════════════');
  console.log('🎬 TESTE COMPLETO DE MÍDIAS - SIMULADOR vs WHATSAPP');
  console.log('🎬 ════════════════════════════════════════════════════════\n');

  const userId = 'cb9213c3-fde3-479e-a4aa-344171c59735';
  const email = 'rodrigo4@gmail.com';

  console.log(`👤 Testando usuário: ${email}`);
  console.log(`   UserId: ${userId}\n`);

  // Simular histórico de conversa como o frontend envia
  let history: Array<{ role: "user" | "assistant"; content: string }> = [];
  let sentMedias: string[] = [];

  // ═══════════════════════════════════════════════════════════════
  // MENSAGEM 1: Cliente inicia conversa (deve enviar MENSAGEM_DE_INICIO)
  // ═══════════════════════════════════════════════════════════════
  console.log('📨 ═══════════════════════════════════════════════════════════');
  console.log('📨 MENSAGEM 1: "Oi, tudo bem?"');
  console.log('📨 Esperado: Enviar áudio MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR');
  console.log('📨 ═══════════════════════════════════════════════════════════\n');

  const msg1 = await handleTestAgentMessage(
    {
      message: "Oi, tudo bem?",
      userId,
      history,
      sentMedias,
    },
    {
      getTestToken,
      getAgentConfig: (id) => storage.getAgentConfig(id),
      getMistralClient,
      processAdminMessage,
      getAgentMediaLibrary,
      generateMediaPromptBlock,
      parseMistralResponse,
    }
  );

  console.log('\n✅ RESULTADO MENSAGEM 1:');
  console.log('   Texto:', msg1.response.substring(0, 100) + '...');
  console.log('   MediaActions:', JSON.stringify(msg1.mediaActions, null, 2));
  
  if (msg1.mediaActions && Array.isArray(msg1.mediaActions) && msg1.mediaActions.length > 0) {
    console.log('\n   🎉 MÍDIAS DETECTADAS:');
    for (const action of msg1.mediaActions) {
      console.log(`      • ${action.media_name} (${action.media_type})`);
      console.log(`        URL: ${action.media_url}`);
      sentMedias.push(action.media_name); // Adicionar às mídias enviadas
    }
  } else {
    console.log('\n   ⚠️  NENHUMA MÍDIA RETORNADA!');
  }

  // Adicionar ao histórico
  history.push({ role: "user", content: "Oi, tudo bem?" });
  history.push({ role: "assistant", content: msg1.response });

  console.log('\n📊 Estado atual:');
  console.log(`   Histórico: ${history.length} mensagens`);
  console.log(`   Mídias enviadas: ${sentMedias.join(', ') || 'nenhuma'}\n`);

  // ═══════════════════════════════════════════════════════════════
  // MENSAGEM 2: Cliente responde sobre trabalho (deve enviar COMO_FUNCIONA)
  // ═══════════════════════════════════════════════════════════════
  console.log('📨 ═══════════════════════════════════════════════════════════');
  console.log('📨 MENSAGEM 2: "Trabalho com vendas e atendimento"');
  console.log('📨 Esperado: Enviar áudio COMO_FUNCIONA');
  console.log('📨 ═══════════════════════════════════════════════════════════\n');

  const msg2 = await handleTestAgentMessage(
    {
      message: "Trabalho com vendas e atendimento",
      userId,
      history,
      sentMedias, // Passar mídias já enviadas
    },
    {
      getTestToken,
      getAgentConfig: (id) => storage.getAgentConfig(id),
      getMistralClient,
      processAdminMessage,
      getAgentMediaLibrary,
      generateMediaPromptBlock,
      parseMistralResponse,
    }
  );

  console.log('\n✅ RESULTADO MENSAGEM 2:');
  console.log('   Texto:', msg2.response.substring(0, 100) + '...');
  console.log('   MediaActions:', JSON.stringify(msg2.mediaActions, null, 2));
  
  if (msg2.mediaActions && Array.isArray(msg2.mediaActions) && msg2.mediaActions.length > 0) {
    console.log('\n   🎉 MÍDIAS DETECTADAS:');
    for (const action of msg2.mediaActions) {
      console.log(`      • ${action.media_name} (${action.media_type})`);
      console.log(`        URL: ${action.media_url}`);
      sentMedias.push(action.media_name);
    }
  } else {
    console.log('\n   ⚠️  NENHUMA MÍDIA RETORNADA!');
  }

  // Adicionar ao histórico
  history.push({ role: "user", content: "Trabalho com vendas e atendimento" });
  history.push({ role: "assistant", content: msg2.response });

  console.log('\n📊 Estado final:');
  console.log(`   Histórico: ${history.length} mensagens`);
  console.log(`   Mídias enviadas: ${sentMedias.join(', ') || 'nenhuma'}`);

  // ═══════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ═══════════════════════════════════════════════════════════════
  console.log('\n🎬 ════════════════════════════════════════════════════════');
  console.log('🎬 RESUMO DO TESTE');
  console.log('🎬 ════════════════════════════════════════════════════════');
  
  const msg1Media = (msg1.mediaActions as any[])?.length || 0;
  const msg2Media = (msg2.mediaActions as any[])?.length || 0;
  
  console.log(`\n   Mensagem 1: ${msg1Media} mídia(s)`);
  console.log(`   Mensagem 2: ${msg2Media} mídia(s)`);
  console.log(`\n   Total de mídias enviadas: ${sentMedias.length}`);
  
  if (sentMedias.length >= 1) {
    console.log('\n   ✅ TESTE PASSOU! Mídias estão sendo retornadas.');
  } else {
    console.log('\n   ❌ TESTE FALHOU! Nenhuma mídia foi retornada.');
  }
  
  console.log('\n🎬 ════════════════════════════════════════════════════════\n');
}

testSimulador().catch(console.error);
