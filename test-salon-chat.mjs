/**
 * TESTE DE AGENDAMENTO VIA CHAT DO SALÃO
 * Testa o fluxo completo de conversa para agendamento
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userId = '';
let accessToken = '';
let conversationId = '';
let testDate = '';

async function setup() {
  console.log('🔐 Login...');

  const { data: signInData } = await supabase.auth.signInWithPassword({
    email: 'testsalon2026@teste.com',
    password: 'Teste2026!',
  });

  userId = signInData.user.id;
  accessToken = signInData.session.access_token;
  console.log('✅ Login OK');

  // Buscar ou criar conversa
  let { data: convs } = await supabase
    .from('conversations')
    .select('*')
    .eq('connection_id', userId)
    .limit(1);

  if (convs && convs.length > 0) {
    conversationId = convs[0].id;
  } else {
    // Tentar buscar uma conexão do usuário
    const { data: connections } = await supabase
      .from('whatsapp_connections')
      .select('*')
      .eq('user_id', userId)
      .limit(1);

    if (connections && connections.length > 0) {
      const { data: newConv } = await supabase
        .from('conversations')
        .insert({
          connection_id: connections[0].id,
          contact_number: '11999999999',
          remote_jid: '11999999999@s.whatsapp.net',
          contact_name: 'Teste Chat',
        })
        .select()
        .single();
      conversationId = newConv?.id || '';
    } else {
      conversationId = '';
    }
  }

  if (!conversationId) {
    console.log('❌ Não foi possível criar conversa de teste');
    return;
  }

  console.log('✅ Conversa:', conversationId);

  testDate = new Date().toISOString().split('T')[0];
  console.log('📅 Data teste:', testDate);
}

async function cleanExistingAppointments() {
  console.log('\n🧹 Limpando agendamentos de teste...');

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('user_id', userId)
    .eq('appointment_date', testDate)
    .in('service_name', ['Corte Teste E2E']);

  if (error) {
    console.log('⚠️  Erro ao limpar:', error.message);
  } else {
    console.log('✅ Limpeza concluída');
  }
}

async function listAppointments() {
  console.log('\n📋 Agendamentos existentes:');

  const { data } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('appointment_date', testDate)
    .order('start_time');

  if (data && data.length > 0) {
    data.forEach(a => {
      console.log(`  - ${a.start_time}-${a.end_time}: ${a.service_name} (${a.professional_name || 'sem prof'})`);
    });
  } else {
    console.log('  (nenhum)');
  }

  return data || [];
}

async function sendChatMessage(message) {
  console.log(`\n💬 Enviando mensagem: "${message}"`);

  const response = await fetch('http://localhost:5000/api/chat/salon', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      conversationId: conversationId,
      message: message,
      sender: 'customer',
    }),
  });

  if (!response.ok) {
    console.log('❌ Erro na resposta:', response.status);
    return null;
  }

  const result = await response.json();
  console.log(`🤖 Resposta da IA: ${result.response?.message || result.message || '(sem resposta)'}`);

  return result;
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE DE AGENDAMENTO VIA CHAT DO SALÃO');
  console.log('='.repeat(60));

  await setup();
  await cleanExistingAppointments();
  await listAppointments();

  // Cenário 1: Agendar primeiro horário
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 1: Primeiro agendamento às 10:00');
  console.log('─'.repeat(40));

  await sendChatMessage(`Quero agendar um Corte Teste E2E para hoje às 10:00`);

  // Aguardar um pouco para o processamento
  await new Promise(r => setTimeout(r, 2000));

  await listAppointments();

  // Cenário 2: Tentar agendar no mesmo horário (deve falhar)
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 2: Tentar agendar mesmo horário');
  console.log('─'.repeat(40));

  await sendChatMessage(`Quero agendar outro Corte Teste E2E para hoje às 10:00`);

  await new Promise(r => setTimeout(r, 2000));

  await listAppointments();

  // Cenário 3: Verificar slots disponíveis
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 3: Verificar slots disponíveis');
  console.log('─'.repeat(40));

  await sendChatMessage(`Quais horários estão disponíveis hoje para Corte Teste E2E?`);

  await new Promise(r => setTimeout(r, 2000));

  console.log('\n' + '='.repeat(60));
  console.log('FIM DOS TESTES DE AGENDAMENTO');
  console.log('='.repeat(60));
}

main().catch(console.error);
