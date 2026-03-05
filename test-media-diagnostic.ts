/**
 * TESTE SIMULADO - Verificar se o sistema está detectando e enviando mídias
 * para o agente rodrigo4@gmail.com
 */

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735'; // rodrigo4@gmail.com

// Copia das funções necessárias
function parseMistralResponse(responseText: string): { messages: { content: string }[], actions: { type: string, media_name: string }[] } | null {
  try {
    const mediaTagRegex = /\[(MEDIA|ENVIAR_MIDIA|MIDIA):([A-Z0-9_]+)\]/gi;
    
    const actions: { type: string, media_name: string }[] = [];
    let match: RegExpExecArray | null;
    const detectedNames = new Set<string>();
    
    while ((match = mediaTagRegex.exec(responseText)) !== null) {
      const tagType = match[1].toUpperCase();
      const mediaName = match[2].toUpperCase();
      
      if (!detectedNames.has(mediaName)) {
        detectedNames.add(mediaName);
        actions.push({
          type: 'send_media',
          media_name: mediaName,
        });
        console.log(`📁 [MediaService] Tag de mídia detectada [${tagType}]: ${mediaName}`);
      }
    }
    
    const cleanText = responseText
      .replace(/\[(MEDIA|ENVIAR_MIDIA|MIDIA):[A-Z0-9_]+\]/gi, '')
      .replace(/\s{2,}/g, ' ')
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

async function checkRecentMessages() {
  console.log('\n🔍 VERIFICANDO MENSAGENS RECENTES DO AGENTE rodrigo4@gmail.com\n');
  console.log('═'.repeat(70));
  
  const { data: messages, error } = await supabase
    .from('messages')
    .select('id, content, media_type, media_name, from_me, created_at')
    .eq('user_id', USER_ID)
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    return;
  }
  
  console.log(`📊 Total de mensagens recentes: ${messages.length}\n`);
  
  let mediasSent = 0;
  let messagesWithTags = 0;
  let messagesWithoutMedia = 0;
  
  for (const msg of messages) {
    if (msg.from_me) {
      console.log(`\n📤 Mensagem do AGENTE (${new Date(msg.created_at).toLocaleString('pt-BR')})`);
      console.log(`   ID: ${msg.id}`);
      console.log(`   Conteúdo: "${msg.content?.substring(0, 100)}${msg.content?.length > 100 ? '...' : ''}"`);
      
      // Verificar se há tags no conteúdo
      const parsed = parseMistralResponse(msg.content || '');
      
      if (parsed?.actions && parsed.actions.length > 0) {
        messagesWithTags++;
        console.log(`   🔍 TAGS DETECTADAS: ${parsed.actions.map(a => `[${a.media_name}]`).join(', ')}`);
      }
      
      if (msg.media_type && msg.media_name) {
        mediasSent++;
        console.log(`   ✅ MÍDIA ENVIADA: ${msg.media_type} - ${msg.media_name}`);
      } else if (!msg.media_type && !msg.media_name) {
        messagesWithoutMedia++;
        console.log(`   ⚠️  SEM MÍDIA: media_type e media_name estão NULL`);
      }
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('\n📊 ESTATÍSTICAS:');
  console.log(`   Total de mensagens do agente: ${messages.filter(m => m.from_me).length}`);
  console.log(`   Mensagens com tags detectadas: ${messagesWithTags}`);
  console.log(`   Mídias efetivamente enviadas: ${mediasSent}`);
  console.log(`   Mensagens sem mídia: ${messagesWithoutMedia}`);
  
  if (mediasSent === 0) {
    console.log('\n❌ PROBLEMA CONFIRMADO: Nenhuma mídia foi enviada nas últimas 20 mensagens!');
  } else if (mediasSent < messagesWithTags) {
    console.log('\n⚠️  PROBLEMA PARCIAL: Algumas tags foram ignoradas!');
  } else {
    console.log('\n✅ TUDO OK: Tags estão sendo processadas e mídias enviadas!');
  }
}

async function checkMediaLibrary() {
  console.log('\n📚 BIBLIOTECA DE MÍDIAS DO AGENTE\n');
  console.log('═'.repeat(70));
  
  const { data: medias, error } = await supabase
    .from('agent_media_library')
    .select('name, media_type, when_to_use, is_active')
    .eq('user_id', USER_ID)
    .eq('is_active', true);
  
  if (error) {
    console.error('❌ Erro ao buscar mídias:', error);
    return;
  }
  
  console.log(`📁 Total de mídias ativas: ${medias.length}\n`);
  
  for (const media of medias) {
    console.log(`\n📁 ${media.media_type.toUpperCase()}: ${media.name}`);
    console.log(`   Gatilho: ${media.when_to_use?.substring(0, 80)}...`);
  }
}

async function testMediaTagDetection() {
  console.log('\n🧪 TESTANDO DETECÇÃO DE TAGS EM MENSAGENS SIMULADAS\n');
  console.log('═'.repeat(70));
  
  const testResponses = [
    'Opa! Deixa eu te mostrar como funciona! [MEDIA:COMO_FUNCIONA]',
    'Aqui está o vídeo! [ENVIAR_MIDIA:DETALHES_DO_SISTEMA]',
    'Vou te enviar o material [MIDIA:AGENDAMENTO]',
    'Só um momento... vou te explicar',
  ];
  
  for (const response of testResponses) {
    console.log(`\n📝 Teste: "${response}"`);
    const parsed = parseMistralResponse(response);
    if (parsed?.actions && parsed.actions.length > 0) {
      console.log(`   ✅ Detectou: ${parsed.actions.map(a => a.media_name).join(', ')}`);
      console.log(`   📝 Texto limpo: "${parsed.messages[0].content}"`);
    } else {
      console.log(`   ⚠️  Nenhuma tag detectada`);
    }
  }
}

async function main() {
  console.log('\n🚀 DIAGNÓSTICO COMPLETO - SISTEMA DE ENVIO DE MÍDIAS');
  console.log('User: rodrigo4@gmail.com');
  console.log('User ID: ' + USER_ID);
  console.log('\n');
  
  await checkMediaLibrary();
  await testMediaTagDetection();
  await checkRecentMessages();
  
  console.log('\n' + '═'.repeat(70));
  console.log('✅ Diagnóstico concluído!\n');
}

main().catch(console.error);
