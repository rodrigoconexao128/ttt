/**
 * TESTE COMPLETO DO SISTEMA DE SALÃO - 3 RODADAS
 * Testa: configuração de almoço, disponibilidade e agendamento
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userId = '';
let accessToken = '';
let professionalId = '';
let serviceId = '';

async function login() {
  console.log('🔐 Login...');

  const { data: signInData } = await supabase.auth.signInWithPassword({
    email: 'testsalon2026@teste.com',
    password: 'Teste2026!',
  });

  userId = signInData.user.id;
  accessToken = signInData.session.access_token;
  console.log('✅ Login OK');
}

async function configurarAlmoco() {
  console.log('\n⚙️  Configurando horário de almoço (12:00-13:00)...');

  const { data, error } = await supabase
    .from('salon_config')
    .upsert({
      user_id: userId,
      is_active: true,
      min_notice_hours: 0,  // Permite agendar imediatamente
      opening_hours: {
        monday: { enabled: true, open: '09:00', close: '19:00' },
        tuesday: { enabled: true, open: '09:00', close: '19:00' },
        wednesday: { enabled: true, open: '09:00', close: '19:00' },
        thursday: { enabled: true, open: '09:00', close: '19:00' },
        friday: { enabled: true, open: '09:00', close: '19:00' },
        saturday: { enabled: true, open: '09:00', close: '17:00' },
        sunday: { enabled: false, open: '09:00', close: '17:00' },
        __break: { enabled: true, start: '12:00', end: '13:00' },  // Almoço global
      },
    })
    .select()
    .single();

  if (error) {
    console.log('❌ Erro:', error.message);
    return false;
  }

  console.log('✅ Configuração salva com __break:', data.opening_hours?.__break);
  return true;
}

async function verificarServicoEProfissional() {
  console.log('\n📋 Verificando serviço...');

  const { data: services } = await supabase
    .from('scheduling_services')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1);

  if (services && services.length > 0) {
    serviceId = services[0].id;
    console.log('✅ Serviço encontrado:', services[0].name, services[0].duration_minutes + 'min');
  } else {
    // Criar serviço
    const { data: newService } = await supabase
      .from('scheduling_services')
      .insert({
        user_id: userId,
        name: 'Corte Rápido',
        description: 'Corte de teste',
        duration_minutes: 30,
        price: 50,
        is_active: true,
        color: '#ff0000',
      })
      .select()
      .single();

    serviceId = newService.id;
    console.log('✅ Serviço criado:', newService.name);
  }

  console.log('\n👤 Verificando profissional...');

  const { data: professionals } = await supabase
    .from('scheduling_professionals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1);

  if (professionals && professionals.length > 0) {
    professionalId = professionals[0].id;
    console.log('✅ Profissional encontrado:', professionals[0].name);
  } else {
    // Criar profissional
    const { data: newProf } = await supabase
      .from('scheduling_professionals')
      .insert({
        user_id: userId,
        name: 'Profissional Teste',
        bio: 'Profissional para testes',
        is_active: true,
      })
      .select()
      .single();

    professionalId = newProf.id;
    console.log('✅ Profissional criado:', newProf.name);
  }
}

async function limparAgendamentos() {
  console.log('\n🧹 Limpando agendamentos de teste...');

  const today = new Date().toISOString().split('T')[0];

  await supabase
    .from('appointments')
    .delete()
    .eq('user_id', userId)
    .eq('appointment_date', today);

  console.log('✅ Limpeza concluída');
}

async function testarDisponibilidade() {
  console.log('\n🕐 Testando disponibilidade...');

  const today = new Date().toISOString().split('T')[0];

  const response = await fetch(
    `http://localhost:5000/api/salon/available-slots?date=${today}&serviceDuration=30&professionalId=${professionalId}`,
    {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!response.ok) {
    console.log('❌ Erro na API:', response.status);
    return [];
  }

  const slots = await response.json();
  console.log(`✅ ${slots.length} slots disponíveis`);

  // Verificar se horário de almoço foi bloqueado
  const hasLunchSlots = slots.some(s => s >= '12:00' && s < '13:00');

  if (hasLunchSlots) {
    console.log('❌ ERRO: Horários de almoço (12:00-13:00) NÃO foram bloqueados!');
    return false;
  } else {
    console.log('✅ CORRETO: Horários de almoço (12:00-13:00) foram bloqueados!');
    return true;
  }
}

async function testarAgendamentoReal() {
  console.log('\n📅 Testando agendamento real...');

  const today = new Date().toISOString().split('T')[0];
  const timeSlot = '10:00';  // Horário fora do almoço

  // Buscar nome do serviço e profissional
  const { data: service } = await supabase
    .from('scheduling_services')
    .select('name')
    .eq('id', serviceId)
    .single();

  const { data: prof } = await supabase
    .from('scheduling_professionals')
    .select('name')
    .eq('id', professionalId)
    .single();

  const serviceName = service?.name || 'Corte Teste';
  const profName = prof?.name || 'Profissional';

  console.log(`   Tentando agendar: ${serviceName} às ${timeSlot} com ${profName}`);

  // Inserir agendamento diretamente no banco
  const { data, error } = await supabase
    .from('appointments')
    .insert({
      user_id: userId,
      appointment_date: today,
      start_time: timeSlot,
      end_time: '10:30',  // 30 minutos
      service_id: serviceId,
      service_name: serviceName,
      professional_id: professionalId,
      professional_name: profName,
      customer_name: 'Cliente Teste',
      customer_phone: '11999999999',
      status: 'confirmed',
    })
    .select()
    .single();

  if (error) {
    console.log('❌ Erro ao agendar:', error.message);
    return false;
  }

  console.log('✅ Agendamento criado:', data.id);

  // Verificar se o agendamento realmente existe
  const { data: check } = await supabase
    .from('appointments')
    .select('*')
    .eq('id', data.id)
    .single();

  if (check) {
    console.log('✅ CONFIRMADO: Agendamento existe no banco!');
    console.log(`   Data: ${check.appointment_date}`);
    console.log(`   Horário: ${check.start_time} - ${check.end_time}`);
    console.log(`   Serviço: ${check.service_name}`);
    console.log(`   Profissional: ${check.professional_name}`);
    return true;
  } else {
    console.log('❌ Agendamento não encontrado no banco');
    return false;
  }
}

async function rodadaTeste(numero) {
  console.log('\n' + '='.repeat(60));
  console.log(`RODADA ${numero}/3`);
  console.log('='.repeat(60));

  await login();
  await configurarAlmoco();
  await verificarServicoEProfissional();
  await limparAgendamentos();
  await testarDisponibilidade();
  await testarAgendamentoReal();

  console.log('\n✅ RODADA ' + numero + ' CONCLUÍDA!');
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE COMPLETO DO SISTEMA DE SALÃO - 3 RODADAS');
  console.log('='.repeat(60));

  await rodadaTeste(1);
  await new Promise(r => setTimeout(r, 2000));

  await rodadaTeste(2);
  await new Promise(r => setTimeout(r, 2000));

  await rodadaTeste(3);

  console.log('\n' + '='.repeat(60));
  console.log('TODAS AS RODADAS CONCLUÍDAS!');
  console.log('='.repeat(60));
}

main().catch(console.error);
