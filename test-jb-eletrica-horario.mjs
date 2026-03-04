#!/usr/bin/env node
/**
 * TESTE DE SIMULAÇÃO - JB ELÉTRICA COM HORÁRIO DO BRASIL
 * Testa se a IA responde corretamente usando o contexto de horário
 */

import fetch from 'node-fetch';

// Configuração
const API_URL = 'http://localhost:5000/api';

// Função para obter horário do Brasil (igual ao aiAgent.ts)
function getBrazilDateTime() {
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  
  const hour = brazilTime.getHours();
  const minute = brazilTime.getMinutes();
  const dayOfWeek = brazilTime.getDay();
  
  const diasSemana = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  
  return {
    date: brazilTime.toLocaleDateString('pt-BR'),
    time: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
    hour,
    minute,
    dayName: diasSemana[dayOfWeek],
    isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
  };
}

// Verifica status esperado baseado no horário atual
function getExpectedStatus(brazilTime) {
  const { hour, minute, isWeekend, dayName } = brazilTime;
  const currentMinutes = hour * 60 + minute;
  
  // JB Elétrica: Seg-Sex, 08:00-12:00 e 13:30-18:00
  if (isWeekend) {
    return { status: 'FORA_HORARIO', expectedResponse: 'fora do horário de atendimento', reason: `Fim de semana (${dayName})` };
  }
  
  if (currentMinutes >= 8*60 && currentMinutes < 12*60) {
    return { status: 'DENTRO_HORARIO', expectedResponse: 'saudação normal', reason: 'Expediente manhã (08:00-12:00)' };
  }
  
  if (currentMinutes >= 12*60 && currentMinutes < 13*60+30) {
    return { status: 'ALMOCO', expectedResponse: 'horário de almoço', reason: 'Almoço (12:00-13:30)' };
  }
  
  if (currentMinutes >= 13*60+30 && currentMinutes < 18*60) {
    return { status: 'DENTRO_HORARIO', expectedResponse: 'saudação normal', reason: 'Expediente tarde (13:30-18:00)' };
  }
  
  return { status: 'FORA_HORARIO', expectedResponse: 'fora do horário de atendimento', reason: `Fora do expediente (${brazilTime.time})` };
}

async function testJBEletrica() {
  console.log('═══════════════════════════════════════════════════════════════════════');
  console.log('🧪 TESTE: SIMULAÇÃO JB ELÉTRICA COM HORÁRIO DO BRASIL');
  console.log('═══════════════════════════════════════════════════════════════════════\n');
  
  const brazilTime = getBrazilDateTime();
  const expectedStatus = getExpectedStatus(brazilTime);
  
  console.log('📅 HORÁRIO ATUAL DO BRASIL:');
  console.log(`   Data: ${brazilTime.date}`);
  console.log(`   Hora: ${brazilTime.time}`);
  console.log(`   Dia: ${brazilTime.dayName}`);
  console.log(`   É fim de semana: ${brazilTime.isWeekend ? 'SIM' : 'NÃO'}`);
  console.log('');
  console.log('🎯 STATUS ESPERADO:');
  console.log(`   Status: ${expectedStatus.status}`);
  console.log(`   Motivo: ${expectedStatus.reason}`);
  console.log(`   Resposta esperada deve mencionar: "${expectedStatus.expectedResponse}"`);
  console.log('');
  
  // Login
  console.log('🔐 Fazendo login...');
  try {
    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'contato@jbeletrica.com.br',
        password: 'jbeletrica2024'
      })
    });
    
    if (!loginResponse.ok) {
      // Tentar com credenciais padrão de teste
      console.log('   Login JB Elétrica falhou, tentando com conta de teste...');
      const testLogin = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'rodrigo4@gmail.com',
          password: 'Ibira2019!'
        })
      });
      
      if (!testLogin.ok) {
        console.error('❌ Falha no login');
        console.log('\n📝 NOTA: Execute o servidor local primeiro com "npm run dev"');
        return;
      }
      
      const testData = await testLogin.json();
      console.log('✅ Login com conta de teste OK');
      
      // Testar com prompt simulado
      await testWithSimulator(testData.token, brazilTime, expectedStatus);
      return;
    }
    
    const loginData = await loginResponse.json();
    console.log('✅ Login JB Elétrica OK');
    
    await testWithSimulator(loginData.token, brazilTime, expectedStatus);
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
    console.log('\n📝 NOTA: Certifique-se que o servidor está rodando em http://localhost:5000');
  }
}

async function testWithSimulator(token, brazilTime, expectedStatus) {
  console.log('\n📤 Enviando mensagem de teste...');
  
  const sessionId = `test-horario-${Date.now()}`;
  const testMessage = 'Oi, bom dia! Vocês estão atendendo agora?';
  
  console.log(`   Mensagem: "${testMessage}"`);
  console.log(`   Session ID: ${sessionId}`);
  
  try {
    const simResponse = await fetch(`${API_URL}/simulator/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        message: testMessage,
        sessionId: sessionId,
        agentId: '00000000-0000-0000-0000-000000000000'
      })
    });
    
    if (!simResponse.ok) {
      const errorText = await simResponse.text();
      console.error('❌ Erro na simulação:', errorText);
      return;
    }
    
    const result = await simResponse.json();
    
    console.log('\n📥 RESPOSTA DA IA:');
    console.log('─────────────────────────────────────────────────────────────────────');
    console.log(result.response || result.message || JSON.stringify(result, null, 2));
    console.log('─────────────────────────────────────────────────────────────────────');
    
    // Validar resposta
    const responseText = (result.response || result.message || '').toLowerCase();
    
    console.log('\n🔍 VALIDAÇÃO:');
    
    if (expectedStatus.status === 'FORA_HORARIO') {
      const hasFora = responseText.includes('fora') && (responseText.includes('horário') || responseText.includes('atendimento'));
      const hasSegSex = responseText.includes('segunda') || responseText.includes('seg');
      const hasHorarios = responseText.includes('08') || responseText.includes('18') || responseText.includes('8h');
      
      if (hasFora || hasSegSex || hasHorarios) {
        console.log('✅ PASSOU: IA identificou corretamente que está FORA do horário');
      } else {
        console.log('⚠️ POSSÍVEL PROBLEMA: Esperava menção a "fora do horário" mas não encontrou');
        console.log('   Verifique se a IA está considerando o horário atual: ' + brazilTime.time);
      }
    } else if (expectedStatus.status === 'ALMOCO') {
      const hasAlmoco = responseText.includes('almoço') || responseText.includes('almoco');
      const has12h = responseText.includes('12') || responseText.includes('13');
      
      if (hasAlmoco || has12h) {
        console.log('✅ PASSOU: IA identificou corretamente que está em horário de ALMOÇO');
      } else {
        console.log('⚠️ POSSÍVEL PROBLEMA: Esperava menção a "almoço" mas não encontrou');
      }
    } else {
      // Dentro do horário - não deve mencionar fora/almoço
      const hasFora = responseText.includes('fora') && responseText.includes('horário');
      const hasAlmoco = responseText.includes('almoço');
      
      if (!hasFora && !hasAlmoco) {
        console.log('✅ PASSOU: IA respondeu normalmente (dentro do horário comercial)');
      } else {
        console.log('⚠️ POSSÍVEL PROBLEMA: Deveria estar dentro do horário mas mencionou fora/almoço');
      }
    }
    
  } catch (error) {
    console.error('❌ Erro na simulação:', error.message);
  }
}

// Executar
testJBEletrica();
