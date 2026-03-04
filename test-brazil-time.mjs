#!/usr/bin/env node
/**
 * TESTE DE HORÁRIO DO BRASIL
 * Verifica se o sistema está gerando corretamente a data/hora no fuso do Brasil
 * 
 * Problema reportado: Cliente JB Elétrica (contato@jbeletrica.com.br) tem prompt
 * com horário de atendimento (08h-12h, 13h30-18h) mas IA não sabe o horário atual.
 */

console.log('═══════════════════════════════════════════════════════════════════════');
console.log('🕐 TESTE DE HORÁRIO DO BRASIL - DIAGNÓSTICO');
console.log('═══════════════════════════════════════════════════════════════════════');

// Função que será adicionada ao aiAgent.ts
function getBrazilDateTime() {
  const now = new Date();
  
  // Método 1: toLocaleString (mais confiável para timezone)
  const brazilTimeStr = now.toLocaleString('pt-BR', { 
    timeZone: 'America/Sao_Paulo',
    hour12: false 
  });
  
  // Extrair componentes
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  
  const hour = brazilTime.getHours();
  const minute = brazilTime.getMinutes();
  const dayOfWeek = brazilTime.getDay(); // 0=Domingo, 1=Segunda, ... 6=Sábado
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  const diasSemanaAbrev = ['DOM', 'SEG', 'TER', 'QUA', 'QUI', 'SEX', 'SAB'];
  
  const date = brazilTime.toLocaleDateString('pt-BR');
  const time = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
  
  return {
    date,             // "23/01/2026"
    time,             // "14:30"
    hour,             // 14
    minute,           // 30
    dayOfWeek,        // 4 (quinta-feira)
    dayName: diasSemana[dayOfWeek],           // "Quinta-feira"
    dayNameAbrev: diasSemanaAbrev[dayOfWeek], // "QUI"
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
    brazilTimeStr,    // String completa formatada
  };
}

// Função para verificar horário de atendimento JB Elétrica
function checkJBEletricaSchedule(brazilTime) {
  const { hour, minute, isWeekend, dayName } = brazilTime;
  const currentMinutes = hour * 60 + minute;
  
  // Horário JB Elétrica: Seg-Sex, 08:00-12:00 e 13:30-18:00
  const morningStart = 8 * 60;         // 08:00 = 480 min
  const morningEnd = 12 * 60;          // 12:00 = 720 min
  const lunchEnd = 13 * 60 + 30;       // 13:30 = 810 min
  const afternoonEnd = 18 * 60;        // 18:00 = 1080 min
  
  if (isWeekend) {
    return { status: 'FORA_HORARIO', reason: `Fim de semana (${dayName})` };
  }
  
  if (currentMinutes >= morningStart && currentMinutes < morningEnd) {
    return { status: 'DENTRO_HORARIO', reason: 'Expediente manhã (08:00-12:00)' };
  }
  
  if (currentMinutes >= morningEnd && currentMinutes < lunchEnd) {
    return { status: 'ALMOCO', reason: 'Horário de almoço (12:00-13:30)' };
  }
  
  if (currentMinutes >= lunchEnd && currentMinutes < afternoonEnd) {
    return { status: 'DENTRO_HORARIO', reason: 'Expediente tarde (13:30-18:00)' };
  }
  
  return { status: 'FORA_HORARIO', reason: `Fora do expediente (atual: ${brazilTime.time})` };
}

// Executar testes
console.log('\n📅 INFORMAÇÕES DO SISTEMA:');
console.log('─────────────────────────────────────────────────────────────────────');
console.log('UTC agora:', new Date().toISOString());
console.log('Timezone do servidor:', Intl.DateTimeFormat().resolvedOptions().timeZone);

const brazil = getBrazilDateTime();
console.log('\n🇧🇷 HORÁRIO DO BRASIL (America/Sao_Paulo):');
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Data:', brazil.date);
console.log('Hora:', brazil.time);
console.log('Dia da semana:', brazil.dayName);
console.log('É fim de semana:', brazil.isWeekend ? 'SIM' : 'NÃO');
console.log('String completa:', brazil.brazilTimeStr);

const schedule = checkJBEletricaSchedule(brazil);
console.log('\n🏢 VERIFICAÇÃO JB ELÉTRICA:');
console.log('─────────────────────────────────────────────────────────────────────');
console.log('Status:', schedule.status);
console.log('Motivo:', schedule.reason);

// Simular o bloco que será adicionado ao contexto da IA
console.log('\n📝 BLOCO DE CONTEXTO PROPOSTO PARA IA:');
console.log('═══════════════════════════════════════════════════════════════════════');
const contextBlock = `
🕐 DATA E HORA ATUAL (BRASIL - São Paulo):
   • Data: ${brazil.date}
   • Hora: ${brazil.time}
   • Dia: ${brazil.dayName}
   ${brazil.isWeekend ? '   ⚠️ HOJE É FIM DE SEMANA' : ''}

Use estas informações para verificar horários de funcionamento mencionados no prompt.
`;
console.log(contextBlock);
console.log('═══════════════════════════════════════════════════════════════════════');

// Testar diferentes cenários
console.log('\n🧪 SIMULAÇÃO DE CENÁRIOS:');
console.log('─────────────────────────────────────────────────────────────────────');

const testScenarios = [
  { hour: 7, minute: 30, day: 1, desc: 'Seg 07:30 (antes expediente)' },
  { hour: 9, minute: 0, day: 1, desc: 'Seg 09:00 (manhã)' },
  { hour: 12, minute: 30, day: 1, desc: 'Seg 12:30 (almoço)' },
  { hour: 15, minute: 0, day: 1, desc: 'Seg 15:00 (tarde)' },
  { hour: 19, minute: 0, day: 1, desc: 'Seg 19:00 (após expediente)' },
  { hour: 10, minute: 0, day: 6, desc: 'Sáb 10:00 (fim de semana)' },
  { hour: 14, minute: 0, day: 0, desc: 'Dom 14:00 (fim de semana)' },
];

for (const scenario of testScenarios) {
  const testTime = {
    hour: scenario.hour,
    minute: scenario.minute,
    dayOfWeek: scenario.day,
    isWeekend: scenario.day === 0 || scenario.day === 6,
    time: `${scenario.hour.toString().padStart(2, '0')}:${scenario.minute.toString().padStart(2, '0')}`,
    dayName: ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][scenario.day],
  };
  const result = checkJBEletricaSchedule(testTime);
  const emoji = result.status === 'DENTRO_HORARIO' ? '✅' : result.status === 'ALMOCO' ? '🍽️' : '❌';
  console.log(`${emoji} ${scenario.desc} → ${result.status}`);
}

console.log('\n═══════════════════════════════════════════════════════════════════════');
console.log('✅ TESTE CONCLUÍDO');
console.log('═══════════════════════════════════════════════════════════════════════');
