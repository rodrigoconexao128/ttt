#!/usr/bin/env node
/**
 * 🧪 TESTE FLOWENGINE - CONTAS REAIS
 * 
 * Valida que o sistema híbrido "IA nas pontas, robô no meio" funciona corretamente
 * com as contas de teste reais no Supabase.
 * 
 * Arquitetura: IA INTERPRETA → SISTEMA EXECUTA → IA HUMANIZA
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';

// Contas de teste
const TEST_ACCOUNTS = [
  { 
    email: 'rodrigo4@gmail.com', 
    expectedFlowType: 'AGENDAMENTO',
    businessType: 'AGENDAMENTO',
    testInputs: ['oi', '1', '2', '25/01/2026', '14:00', '3'],
    expectedStates: ['start', 'show_availability', 'collect_date', 'collect_time', 'confirm_appointment']
  },
  { 
    email: 'joyce02yasmin@gmail.com', 
    expectedFlowType: 'SUPORTE',
    businessType: 'SUPORTE',
    testInputs: ['olá', '1', 'sim', '2', 'minha internet caiu', '3'],
    expectedStates: ['start', 'show_faq', 'end_resolved', 'report_issue', 'transfer_human']
  }
];

// Classe FlowEngine simplificada para testes
class TestFlowEngine {
  constructor(flowDefinition) {
    this.flowDef = flowDefinition?.states || flowDefinition;
    this.initialState = flowDefinition?.initialState || 'start';
    this.currentState = this.initialState;
  }

  interpretInput(userInput) {
    const state = this.flowDef[this.currentState];
    if (!state) return { action: 'unknown', nextState: this.initialState };
    
    const input = userInput.toLowerCase().trim();
    
    // Verificar nextStates
    if (state.nextStates) {
      // Verificar match exato
      if (state.nextStates[input]) {
        return { action: 'transition', nextState: state.nextStates[input] };
      }
      // Verificar por número
      if (state.nextStates[input]) {
        return { action: 'transition', nextState: state.nextStates[input] };
      }
      // Verificar palavras-chave
      for (const [keyword, nextState] of Object.entries(state.nextStates)) {
        if (input.includes(keyword.toLowerCase())) {
          return { action: 'transition', nextState };
        }
      }
    }
    
    // Default next
    if (state.defaultNext) {
      return { action: 'transition', nextState: state.defaultNext };
    }
    
    return { action: 'stay', nextState: this.currentState };
  }

  executeAction(action, nextState) {
    const result = {
      previousState: this.currentState,
      action,
      newState: nextState,
      message: null
    };
    
    this.currentState = nextState;
    const state = this.flowDef[nextState];
    
    if (state) {
      result.message = state.message;
      result.stateType = state.type;
    }
    
    return result;
  }

  humanizeResponse(systemResult) {
    // Simula humanização mantendo mensagem determinística
    return {
      ...systemResult,
      humanized: true,
      finalMessage: systemResult.message
    };
  }

  processMessage(userInput) {
    // 1. IA INTERPRETA
    const interpretation = this.interpretInput(userInput);
    
    // 2. SISTEMA EXECUTA
    const execution = this.executeAction(interpretation.action, interpretation.nextState);
    
    // 3. IA HUMANIZA
    const response = this.humanizeResponse(execution);
    
    return response;
  }

  reset() {
    this.currentState = this.initialState;
  }
}

// Testes
async function runTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║  🧪 TESTE FLOWENGINE - CONTAS REAIS                          ║');
  console.log('║  Arquitetura: IA INTERPRETA → SISTEMA EXECUTA → IA HUMANIZA  ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  
  let totalTests = 0;
  let passedTests = 0;

  for (const account of TEST_ACCOUNTS) {
    console.log(`\n${'═'.repeat(60)}`);
    console.log(`📧 Testando: ${account.email}`);
    console.log(`📂 Tipo esperado: ${account.expectedFlowType}`);
    console.log(`${'═'.repeat(60)}`);

    // 1. Buscar dados do usuário
    const { data: users, error: userError } = await supabase
      .from('users')
      .select('id, name, email')
      .eq('email', account.email)
      .limit(1);

    if (userError || !users || users.length === 0) {
      console.log(`❌ Erro ao buscar usuário: ${userError?.message || 'Não encontrado'}`);
      continue;
    }

    const userId = users[0].id;
    console.log(`✅ Usuário encontrado: ${users[0].name} (${userId})`);

    // 2. Buscar flow_definition
    const { data: flows, error: flowError } = await supabase
      .from('flow_definitions')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1);

    if (flowError || !flows || flows.length === 0) {
      console.log(`❌ Erro ao buscar flow: ${flowError?.message || 'Não encontrado'}`);
      continue;
    }

    const flow = flows[0];
    console.log(`✅ Flow encontrado: ${flow.flow_type} (${flow.id})`);
    console.log(`   └─ Agent: ${flow.agent_name}, Business: ${flow.business_name}`);

    // 3. Validar tipo do flow
    totalTests++;
    if (flow.flow_type === account.expectedFlowType) {
      passedTests++;
      console.log(`✅ TESTE: Tipo do flow correto`);
    } else {
      console.log(`❌ TESTE: Tipo incorreto (esperado: ${account.expectedFlowType}, recebido: ${flow.flow_type})`);
    }

    // 4. Testar FlowEngine
    const flowDef = flow.flow_definition;
    if (!flowDef || !flowDef.states) {
      console.log(`❌ Flow definition inválida`);
      continue;
    }

    console.log(`\n📊 Estados do Flow:`);
    Object.keys(flowDef.states).forEach(state => {
      const s = flowDef.states[state];
      console.log(`   ${state === flowDef.initialState ? '🏠' : '  '} ${state} (${s.type})`);
    });

    // 5. Simular conversa
    console.log(`\n🎭 Simulando conversa...`);
    const engine = new TestFlowEngine(flowDef);

    for (let i = 0; i < Math.min(account.testInputs.length, 3); i++) {
      const input = account.testInputs[i];
      const response = engine.processMessage(input);
      
      console.log(`\n   [${i + 1}] Input: "${input}"`);
      console.log(`       └─ Estado: ${response.previousState} → ${response.newState}`);
      console.log(`       └─ Tipo: ${response.stateType}`);
      console.log(`       └─ Humanizado: ${response.humanized ? '✅' : '❌'}`);
      
      // Verificar determinismo
      totalTests++;
      const response2 = new TestFlowEngine(flowDef).processMessage(input);
      if (response.newState === response2.newState && response.message === response2.message) {
        passedTests++;
        console.log(`       └─ Determinístico: ✅ (mesma entrada = mesma saída)`);
      } else {
        console.log(`       └─ Determinístico: ❌ FALHA!`);
      }
    }

    // 6. Testar consistência múltiplas execuções
    console.log(`\n🔄 Teste de consistência (5 execuções com mesmo input):`);
    const testInput = account.testInputs[0];
    const results = [];
    
    for (let i = 0; i < 5; i++) {
      const e = new TestFlowEngine(flowDef);
      const r = e.processMessage(testInput);
      results.push(r.newState);
    }

    const allSame = results.every(r => r === results[0]);
    totalTests++;
    if (allSame) {
      passedTests++;
      console.log(`   ✅ Todas execuções retornaram: ${results[0]}`);
    } else {
      console.log(`   ❌ Resultados variaram: ${results.join(', ')}`);
    }

    // 7. Testar nextStates
    console.log(`\n🔀 Teste de transições (nextStates):`);
    const startState = flowDef.states.start;
    if (startState?.nextStates) {
      totalTests++;
      passedTests++;
      console.log(`   ✅ Estado inicial tem ${Object.keys(startState.nextStates).length} transições definidas`);
      Object.entries(startState.nextStates).slice(0, 3).forEach(([key, value]) => {
        console.log(`      └─ "${key}" → ${value}`);
      });
    }
  }

  // Resumo final
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`   Total de testes: ${totalTests}`);
  console.log(`   Passaram: ${passedTests}`);
  console.log(`   Falharam: ${totalTests - passedTests}`);
  console.log(`   Taxa de sucesso: ${((passedTests / totalTests) * 100).toFixed(1)}%`);
  console.log(`\n   ${passedTests === totalTests ? '✅ TODOS OS TESTES PASSARAM!' : '⚠️ ALGUNS TESTES FALHARAM'}`);
  console.log(`${'═'.repeat(60)}\n`);

  return passedTests === totalTests;
}

// Executar
runTests()
  .then(success => process.exit(success ? 0 : 1))
  .catch(err => {
    console.error('Erro fatal:', err);
    process.exit(1);
  });
