/**
 * TESTE DE EXCLUSIVIDADE POR PROFISSIONAL
 * Verifica se o sistema impede agendamentos sobrepostos para o mesmo profissional
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userId = '';
let accessToken = '';
let professionalId = '';
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

  // Buscar profissional
  const { data: prof } = await supabase
    .from('scheduling_professionals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single();

  professionalId = prof.id;
  console.log('✅ Profissional:', prof.name);

  // Usar data de hoje
  testDate = new Date().toISOString().split('T')[0];
  console.log('📅 Data teste:', testDate);
}

async function cleanExistingAppointments() {
  console.log('\n🧹 Limpando agendamentos de teste...');

  const { error } = await supabase
    .from('appointments')
    .delete()
    .eq('user_id', userId)
    .eq('professional_id', professionalId)
    .eq('appointment_date', testDate)
    .in('service_name', ['Corte Teste E2E', 'Barba Teste E2E']);

  if (error) {
    console.log('⚠️  Erro ao limpar:', error.message);
  } else {
    console.log('✅ Limpeza concluída');
  }
}

async function testBookingAt(time, serviceName, duration) {
  console.log(`\n📅 Testando agendamento: ${serviceName} às ${time} (${duration}min)`);

  const response = await fetch('http://localhost:5000/api/salon/create-appointment', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      appointmentDate: testDate,
      startTime: time,
      serviceId: null,
      serviceName: serviceName,
      durationMinutes: duration,
      professionalId: professionalId,
      customerName: 'Cliente Teste',
      customerPhone: '11999999999',
    }),
  });

  const result = await response.json();

  if (result.success) {
    console.log('✅ Agendamento criado:', result.data?.id);
    return result.data;
  } else {
    console.log('❌ Erro:', result.error);
    return null;
  }
}

async function listAppointments() {
  console.log('\n📋 Agendamentos existentes:');

  const { data } = await supabase
    .from('appointments')
    .select('*')
    .eq('user_id', userId)
    .eq('appointment_date', testDate)
    .eq('professional_id', professionalId)
    .order('start_time');

  if (data && data.length > 0) {
    data.forEach(a => {
      console.log(`  - ${a.start_time}-${a.end_time}: ${a.service_name}`);
    });
  } else {
    console.log('  (nenhum)');
  }

  return data || [];
}

async function checkOverlap(newStart, newEnd, existingAppointments) {
  for (const appt of existingAppointments) {
    const existingStart = parseTime(appt.start_time);
    const existingEnd = parseTime(appt.end_time);

    // Verificar sobreposição
    if (newStart < existingEnd && newEnd > existingStart) {
      return {
        overlaps: true,
        conflicting: appt
      };
    }
  }
  return { overlaps: false };
}

function parseTime(timeStr) {
  const [hours, minutes] = timeStr.split(':').map(Number);
  return hours * 60 + minutes;
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE DE EXCLUSIVIDADE POR PROFISSIONAL');
  console.log('='.repeat(60));

  await setup();
  await cleanExistingAppointments();
  await listAppointments();

  // Cenário 1: Agendar primeiro horário
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 1: Primeiro agendamento');
  console.log('─'.repeat(40));

  const appt1 = await testBookingAt('10:00', 'Corte Teste E2E', 30);
  await listAppointments();

  // Cenário 2: Tentar agendar no mesmo horário (deve falhar)
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 2: Sobreposição total (deve falhar)');
  console.log('─'.repeat(40));

  const appt2 = await testBookingAt('10:00', 'Barba Teste E2E', 30);
  if (!appt2) {
    console.log('✅ CORRETO: Sistema bloqueou sobreposição total');
  } else {
    console.log('❌ ERRO: Sistema permitiu sobreposição total!');
  }

  // Cenário 3: Tentar agendar com sobreposição parcial (deve falhar)
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 3: Sobreposição parcial (deve falhar)');
  console.log('─'.repeat(40));

  const appt3 = await testBookingAt('10:15', 'Barba Teste E2E', 30);
  if (!appt3) {
    console.log('✅ CORRETO: Sistema bloqueou sobreposição parcial');
  } else {
    console.log('❌ ERRO: Sistema permitiu sobreposição parcial!');
  }

  // Cenário 4: Agendar horário livre (deve funcionar)
  console.log('\n' + '─'.repeat(40));
  console.log('CENÁRIO 4: Horário livre (deve funcionar)');
  console.log('─'.repeat(40));

  const appt4 = await testBookingAt('11:00', 'Barba Teste E2E', 30);
  if (appt4) {
    console.log('✅ CORRETO: Sistema permitiu agendamento em horário livre');
  } else {
    console.log('❌ ERRO: Sistema bloqueou horário livre!');
  }

  await listAppointments();

  // Verificar slots disponíveis
  console.log('\n' + '─'.repeat(40));
  console.log('VERIFICAR SLOTS DISPONÍVEIS');
  console.log('─'.repeat(40));

  const response = await fetch(`http://localhost:5000/api/salon/available-slots?date=${testDate}&professionalId=${professionalId}&serviceDuration=30`, {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
    },
  });

  if (response.ok) {
    const slots = await response.json();
    console.log(`\n🕐 ${slots.length} slots disponíveis:`);

    // Verificar se 10:00-10:30 e 10:15-10:45 não estão na lista
    const has1000 = slots.includes('10:00');
    const has1015 = slots.includes('10:15');

    if (!has1000 && !has1015) {
      console.log('✅ CORRETO: Horários ocupados (10:00, 10:15) não aparecem na lista');
    } else {
      console.log('❌ ERRO: Horários ocupados ainda aparecem como disponíveis!');
    }

    // Verificar se 11:00 está bloqueado
    const has1100 = slots.includes('11:00');
    if (!has1100) {
      console.log('✅ CORRETO: Horário 11:00 (agendado) não aparece na lista');
    } else {
      console.log('❌ ERRO: Horário 11:00 aparece como disponível!');
    }

    // Mostrar alguns slots
    console.log('\nPrimeiros 10 slots:', slots.slice(0, 10).join(', '));
  }

  console.log('\n' + '='.repeat(60));
  console.log('FIM DOS TESTES DE EXCLUSIVIDADE');
  console.log('='.repeat(60));
}

main().catch(console.error);
