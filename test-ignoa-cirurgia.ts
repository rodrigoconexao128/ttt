/**
 * 🧪 TESTE IGNOA - DIFERENCIAÇÃO CURSOS DE CIRURGIA
 * 
 * Este script testa se o agente da IGNOA consegue:
 * 1. Diferenciar os dois cursos de cirurgia quando perguntado de forma genérica
 * 2. Enviar a mídia correta para cada curso
 * 3. Explicar a diferença entre Aperfeiçoamento e Especialização
 * 
 * EXECUTE EM UM TERMINAL SEPARADO DO SERVIDOR!
 * 
 * Uso: npx tsx test-ignoa-cirurgia.ts
 */

import 'dotenv/config';

// URL DO API - conecta direto ao banco de produção para testar com o prompt real
const API_URL = process.env.API_URL || "http://localhost:5000";

interface TestMessage {
  role: 'cliente' | 'agente';
  text: string;
  hasMedia?: boolean;
  mediaName?: string;
}

interface TestResult {
  scenario: string;
  passed: boolean;
  messages: TestMessage[];
  issues: string[];
  expectedBehavior: string;
}

// Configuração do usuário IGNOA
const IGNOA_USER_ID = '9833fb4b-c51a-44ee-8618-8ddd6a999bb3';

// Checklist de comportamentos esperados
const BEHAVIOR_CHECKS = {
  // Quando pergunta genérica sobre cirurgia, deve apresentar AMBAS opções
  presentsBothOptions: (text: string) => {
    const hasAperfeicoamento = /aperfeic?oamento|cirurgia oral|12 meses|500.*mês|500\/mês/i.test(text);
    const hasBucomaxilo = /bucomaxilo|especializa[çc][aã]o|24 meses|2\.?800/i.test(text);
    return hasAperfeicoamento && hasBucomaxilo;
  },
  
  // Quando fala especificamente do aperfeiçoamento
  correctAperfeicoamentoInfo: (text: string) => {
    const has12months = /12 meses/i.test(text);
    const hasPrice = /500/i.test(text);
    const hasCoord = /andreza|dra\.?\s*andreza/i.test(text);
    return has12months && hasPrice;
  },
  
  // Quando fala especificamente da especialização
  correctBucomaxiloInfo: (text: string) => {
    const has24months = /24 meses/i.test(text);
    const hasPrice = /2\.?800|2\.?016/i.test(text);
    return has24months && hasPrice;
  },
  
  // Verifica se envia mídia correta
  hasMediaTag: (text: string, mediaName: string) => {
    return text.includes(`[MEDIA:${mediaName}]`);
  },
  
  // Pergunta qual opção interessa
  asksWhichOption: (text: string) => {
    return /qual.*interessa|qual.*prefere|qual.*das duas/i.test(text);
  }
};

// Função para simular chamada ao agente - usa a API de chat de usuários
async function sendToAgent(phone: string, message: string): Promise<string> {
  try {
    // Usa a API de teste do admin chat (que funciona com o agente do usuário IGNOA)
    const response = await fetch(`${API_URL}/api/test/user-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: IGNOA_USER_ID,
        phone,
        message
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    
    const data = await response.json() as any;
    return data.response || data.text || '';
  } catch (error: any) {
    console.error('Erro ao chamar agente:', error.message);
    return `ERRO: ${error.message}`;
  }
}

// Função para limpar histórico
async function clearHistory(phone: string): Promise<void> {
  try {
    await fetch(`${API_URL}/api/test/user-chat/clear`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: IGNOA_USER_ID, phone })
    });
  } catch {}
}

// Cenários de teste
async function runTests() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║  🦷 TESTE IGNOA - DIFERENCIAÇÃO CURSOS DE CIRURGIA                   ║
║                                                                      ║
║  Testando se o agente diferencia:                                    ║
║  • Aperfeiçoamento em Cirurgia Oral (12 meses, R$ 500/mês)          ║
║  • Especialização em Bucomaxilofacial (24 meses, R$ 2.800+)         ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  const results: TestResult[] = [];
  
  // CENÁRIO 1: Pergunta genérica sobre cirurgia
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CENÁRIO 1: Pergunta genérica sobre cirurgia');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const conversation1: Array<{role: string, content: string}> = [];
  const messages1 = [
    'oi',
    'cursos',
    'quero saber sobre o curso de cirurgia oral'
  ];
  
  const scenario1Messages: TestMessage[] = [];
  let scenario1Issues: string[] = [];
  
  for (const msg of messages1) {
    console.log(`\n👤 Cliente: ${msg}`);
    scenario1Messages.push({ role: 'cliente', text: msg });
    
    conversation1.push({ role: 'user', content: msg });
    const response = await sendToAgent(IGNOA_USER_ID, msg, conversation1);
    console.log(`🤖 Agente: ${response.substring(0, 300)}${response.length > 300 ? '...' : ''}`);
    scenario1Messages.push({ role: 'agente', text: response });
    
    conversation1.push({ role: 'assistant', content: response });
    
    // Verificar na última mensagem
    if (msg === 'quero saber sobre o curso de cirurgia oral') {
      if (!BEHAVIOR_CHECKS.presentsBothOptions(response)) {
        scenario1Issues.push('❌ NÃO apresentou as duas opções de cursos de cirurgia');
      } else {
        console.log('   ✅ Apresentou ambas as opções (Aperfeiçoamento e Especialização)');
      }
      
      if (!BEHAVIOR_CHECKS.asksWhichOption(response)) {
        scenario1Issues.push('⚠️ Não perguntou qual opção interessa');
      } else {
        console.log('   ✅ Perguntou qual opção o cliente prefere');
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  results.push({
    scenario: 'Pergunta genérica sobre cirurgia',
    passed: scenario1Issues.length === 0,
    messages: scenario1Messages,
    issues: scenario1Issues,
    expectedBehavior: 'Deve apresentar AMBOS os cursos de cirurgia e perguntar qual interessa'
  });
  
  // CENÁRIO 2: Pergunta específica sobre Aperfeiçoamento
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CENÁRIO 2: Interesse no Aperfeiçoamento (curso menor)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const conversation2: Array<{role: string, content: string}> = [];
  const messages2 = [
    'oi',
    'cursos de pós-graduação',
    'quero saber sobre o curso de aperfeiçoamento em cirurgia oral, o menor'
  ];
  
  const scenario2Messages: TestMessage[] = [];
  let scenario2Issues: string[] = [];
  
  for (const msg of messages2) {
    console.log(`\n👤 Cliente: ${msg}`);
    scenario2Messages.push({ role: 'cliente', text: msg });
    
    conversation2.push({ role: 'user', content: msg });
    const response = await sendToAgent(IGNOA_USER_ID, msg, conversation2);
    console.log(`🤖 Agente: ${response.substring(0, 300)}${response.length > 300 ? '...' : ''}`);
    scenario2Messages.push({ role: 'agente', text: response, hasMedia: response.includes('[MEDIA:') });
    
    conversation2.push({ role: 'assistant', content: response });
    
    if (msg.includes('aperfeiçoamento')) {
      if (!BEHAVIOR_CHECKS.correctAperfeicoamentoInfo(response)) {
        scenario2Issues.push('❌ Informações do Aperfeiçoamento incorretas');
      } else {
        console.log('   ✅ Informações corretas do Aperfeiçoamento');
      }
      
      if (!BEHAVIOR_CHECKS.hasMediaTag(response, 'IMG_CIRURGIA_ORAL')) {
        scenario2Issues.push('⚠️ Não enviou a mídia IMG_CIRURGIA_ORAL');
      } else {
        console.log('   ✅ Enviou mídia IMG_CIRURGIA_ORAL');
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  results.push({
    scenario: 'Interesse específico no Aperfeiçoamento',
    passed: scenario2Issues.length === 0,
    messages: scenario2Messages,
    issues: scenario2Issues,
    expectedBehavior: 'Deve dar informações do Aperfeiçoamento (12 meses, R$ 500/mês) e enviar mídia IMG_CIRURGIA_ORAL'
  });
  
  // CENÁRIO 3: Pergunta sobre especialização Bucomaxilofacial
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CENÁRIO 3: Interesse na Especialização Bucomaxilofacial');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const conversation3: Array<{role: string, content: string}> = [];
  const messages3 = [
    'boa noite',
    'tenho interesse em curso',
    'quero a especialização em bucomaxilofacial'
  ];
  
  const scenario3Messages: TestMessage[] = [];
  let scenario3Issues: string[] = [];
  
  for (const msg of messages3) {
    console.log(`\n👤 Cliente: ${msg}`);
    scenario3Messages.push({ role: 'cliente', text: msg });
    
    conversation3.push({ role: 'user', content: msg });
    const response = await sendToAgent(IGNOA_USER_ID, msg, conversation3);
    console.log(`🤖 Agente: ${response.substring(0, 300)}${response.length > 300 ? '...' : ''}`);
    scenario3Messages.push({ role: 'agente', text: response, hasMedia: response.includes('[MEDIA:') });
    
    conversation3.push({ role: 'assistant', content: response });
    
    if (msg.includes('bucomaxilofacial')) {
      if (!BEHAVIOR_CHECKS.correctBucomaxiloInfo(response)) {
        scenario3Issues.push('❌ Informações da Especialização incorretas');
      } else {
        console.log('   ✅ Informações corretas da Especialização');
      }
      
      if (!BEHAVIOR_CHECKS.hasMediaTag(response, 'IMG_BUCOMAXILOFACIAL') && !response.includes('[MEDIA:BUCOMAXILOFACIAL]')) {
        scenario3Issues.push('⚠️ Não enviou a mídia de Bucomaxilofacial');
      } else {
        console.log('   ✅ Enviou mídia de Bucomaxilofacial');
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  results.push({
    scenario: 'Interesse na Especialização Bucomaxilofacial',
    passed: scenario3Issues.length === 0,
    messages: scenario3Messages,
    issues: scenario3Issues,
    expectedBehavior: 'Deve dar informações da Especialização (24 meses, R$ 2.800+) e enviar mídia IMG_BUCOMAXILOFACIAL'
  });
  
  // CENÁRIO 4: Reproduzir o print do usuário
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 CENÁRIO 4: Reprodução do print (caso real)');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  
  const conversation4: Array<{role: string, content: string}> = [];
  const messages4 = [
    'boa noite!!',
    'gostaria de saber se já iniciou o curso de aperfeiçoamento em cirurgia oral?',
    'e valor?'
  ];
  
  const scenario4Messages: TestMessage[] = [];
  let scenario4Issues: string[] = [];
  
  for (const msg of messages4) {
    console.log(`\n👤 Cliente: ${msg}`);
    scenario4Messages.push({ role: 'cliente', text: msg });
    
    conversation4.push({ role: 'user', content: msg });
    const response = await sendToAgent(IGNOA_USER_ID, msg, conversation4);
    console.log(`🤖 Agente: ${response.substring(0, 400)}${response.length > 400 ? '...' : ''}`);
    scenario4Messages.push({ role: 'agente', text: response, hasMedia: response.includes('[MEDIA:') });
    
    conversation4.push({ role: 'assistant', content: response });
    
    // Verificar se a resposta é sobre APERFEIÇOAMENTO (não Bucomaxilofacial)
    if (msg.includes('aperfeiçoamento em cirurgia oral')) {
      const isAboutAperfeicoamento = /12 meses|500.*mês|500\/mês|aperfeic?oamento|andreza/i.test(response);
      const wronglyTalksBucomaxilo = /24 meses|2\.?800|2\.?016|especializa[çc][aã]o em buco/i.test(response) && !isAboutAperfeicoamento;
      
      if (wronglyTalksBucomaxilo) {
        scenario4Issues.push('❌ Respondeu sobre Bucomaxilofacial quando perguntaram sobre Aperfeiçoamento');
      } else if (isAboutAperfeicoamento) {
        console.log('   ✅ Respondeu corretamente sobre o Aperfeiçoamento em Cirurgia Oral');
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  results.push({
    scenario: 'Reprodução do print (caso real)',
    passed: scenario4Issues.length === 0,
    messages: scenario4Messages,
    issues: scenario4Issues,
    expectedBehavior: 'Deve responder sobre APERFEIÇOAMENTO (12 meses, R$ 500) e NÃO Bucomaxilofacial'
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                        📊 RELATÓRIO FINAL                            ║
╚══════════════════════════════════════════════════════════════════════╝
`);

  let passedCount = 0;
  for (const result of results) {
    const status = result.passed ? '✅ PASSOU' : '❌ FALHOU';
    console.log(`${status} - ${result.scenario}`);
    
    if (result.passed) {
      passedCount++;
    } else {
      console.log(`   Esperado: ${result.expectedBehavior}`);
      for (const issue of result.issues) {
        console.log(`   ${issue}`);
      }
    }
  }
  
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📈 RESULTADO: ${passedCount}/${results.length} cenários passaram
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);

  if (passedCount === results.length) {
    console.log('🎉 TODOS OS TESTES PASSARAM! O agente diferencia corretamente os cursos de cirurgia.');
  } else {
    console.log('⚠️ Alguns testes falharam. Verifique o prompt do agente.');
  }
}

// Executar testes
runTests().catch(console.error);
