/**
 * TESTE API DO SALÃO - Versão compatível com schema atual (min_notice_hours)
 * Testa o sistema de agendamentos funcionando com os campos existentes
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let userId = '';
let accessToken = '';

async function testSignupAndLogin() {
  console.log('🔐 Criando usuário de teste...');

  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: 'testsalon2026@teste.com',
    password: 'Teste2026!',
  });

  if (signInError) {
    console.log('❌ Erro no signin:', signInError.message);
    return false;
  }

  userId = signInData.user.id;
  accessToken = signInData.session.access_token;
  console.log('✅ Login successful:', userId);
  return true;
}

async function testUpdateConfigLegacy() {
  console.log('\n⚙️  TESTE: Atualizar configuração (sem min_notice_minutes)');

  const { data, error } = await supabase
    .from('salon_config')
    .upsert({
      user_id: userId,
      is_active: true,
      min_notice_hours: 0,  // 0 horas = permite agendar imediatamente
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
    console.log('❌ Erro ao atualizar config:', error.message);
    return null;
  }

  console.log('✅ Config atualizada com min_notice_hours=0 e __break');
  console.log('  - min_notice_hours:', data.min_notice_hours);
  console.log('  - __break:', data.opening_hours?.__break);
  return data;
}

async function testCreateService() {
  console.log('\n✂️  TESTE: Criar serviço de teste');

  const { data, error } = await supabase
    .from('scheduling_services')
    .insert({
      user_id: userId,
      name: 'Corte Teste E2E',
      description: 'Serviço criado automaticamente para teste',
      duration_minutes: 25,
      price: 50,
      is_active: true,
      color: '#ff0000',
    })
    .select()
    .single();

  if (error && !error.message.includes('duplicate')) {
    console.log('❌ Erro ao criar serviço:', error.message);
    return null;
  }

  if (data) {
    console.log('✅ Serviço criado:', data.id, data.name, data.duration_minutes + 'min');
  } else {
    // Tentar buscar serviço existente
    const { data: existing } = await supabase
      .from('scheduling_services')
      .select('*')
      .eq('user_id', userId)
      .eq('name', 'Corte Teste E2E')
      .single();
    if (existing) {
      console.log('✅ Serviço já existe:', existing.id, existing.name);
      return existing;
    }
  }
  return data;
}

async function testGetFirstProfessional() {
  console.log('\n👤 TESTE: Buscar primeiro profissional');

  const { data, error } = await supabase
    .from('scheduling_professionals')
    .select('*')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .single();

  if (error) {
    console.log('❌ Erro ao buscar profissional:', error.message);
    return null;
  }

  console.log('✅ Profissional encontrado:', data.id, data.name);
  return data;
}

async function testAvailableSlotsViaAPI(date, professionalId, serviceDuration) {
  console.log(`\n🕐 TESTE: Slots via API para ${date} (duração: ${serviceDuration}min)`);

  try {
    const response = await fetch(`http://localhost:5000/api/salon/available-slots?date=${date}&serviceDuration=${serviceDuration}&professionalId=${professionalId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      console.log('❌ Erro ao buscar slots via API:', response.status);
      const text = await response.text();
      console.log('   Detalhes:', text.substring(0, 200));
      return [];
    }

    const slots = await response.json();
    console.log(`✅ ${slots.length} slots disponíveis via API:`, slots.slice(0, 15).join(', '));

    // Verificar se horário de almoço foi bloqueado
    const hasLunchSlots = slots.some(s => s >= '12:00' && s < '13:00');
    if (hasLunchSlots) {
      console.log('⚠️  ATENÇÃO: Horários de almoço (12:00-13:00) NÃO foram bloqueados!');
    } else {
      console.log('✅ Horários de almoço (12:00-13:00) foram corretamente bloqueados!');
    }

    return slots;
  } catch (e) {
    console.log('❌ Erro ao conectar com API:', e.message);
    console.log('   Certifique-se de que o servidor está rodando em localhost:5000');
    return [];
  }
}

async function main() {
  console.log('='.repeat(60));
  console.log('TESTE API DO SISTEMA DE SALÃO (versão legada compatível)');
  console.log('='.repeat(60));

  // 1. Login
  const loggedIn = await testSignupAndLogin();
  if (!loggedIn) {
    console.log('\n❌ Falha no login. Verifique as credenciais.');
    return;
  }

  // 2. Atualizar config com min_notice_hours=0 e __break
  await testUpdateConfigLegacy();

  // 3. Criar serviço de teste
  await testCreateService();

  // 4. Buscar primeiro profissional
  const prof = await testGetFirstProfessional();
  if (!prof) {
    console.log('\n❌ Nenhum profissional encontrado. Abortando.');
    return;
  }

  // 5. Testar disponibilidade com diferentes durações
  const today = new Date().toISOString().split('T')[0];
  await testAvailableSlotsViaAPI(today, prof.id, 25);
  await testAvailableSlotsViaAPI(today, prof.id, 30);
  await testAvailableSlotsViaAPI(today, prof.id, 60);

  console.log('\n' + '='.repeat(60));
  console.log('FIM DOS TESTES');
  console.log('='.repeat(60));
  console.log('');
  console.log('📝 NOTA: Para suporte completo a min_notice_minutes, aplique a migração:');
  console.log('   https://supabase.com/dashboard/project/bnfpcuzjvycudccycqqt/sql');
  console.log('');
}

main().catch(console.error);
