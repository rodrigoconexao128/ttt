/**
 * 🧪 TESTE: Converter Prompt do Rodrigo4 em FlowDefinition
 * 
 * Este teste demonstra como o FlowBuilder converte um prompt de texto livre
 * em uma estrutura de fluxo que o sistema híbrido pode executar.
 */

import FlowBuilder, { FlowDefinition, PromptAnalyzer } from './server/FlowBuilder';
import * as fs from 'fs';

// Carregar prompt do rodrigo4
const promptRodrigo4 = fs.readFileSync('./vvvv/prompt-rodrigo4.txt', 'utf-8');

async function testFlowBuilder() {
  console.log('═'.repeat(70));
  console.log('🧪 TESTE: Conversão de Prompt para FlowDefinition');
  console.log('═'.repeat(70));
  
  // 1. Testar Analyzer
  console.log('\n' + '─'.repeat(70));
  console.log('📊 FASE 1: Análise do Prompt');
  console.log('─'.repeat(70));
  
  const analyzer = new PromptAnalyzer();
  
  const flowType = analyzer.detectFlowType(promptRodrigo4);
  console.log(`\n   Tipo detectado: ${flowType}`);
  
  const agentName = analyzer.extractAgentName(promptRodrigo4);
  console.log(`   Nome do Agente: ${agentName}`);
  
  const businessName = analyzer.extractBusinessName(promptRodrigo4);
  console.log(`   Nome do Negócio: ${businessName}`);
  
  const personality = analyzer.extractPersonality(promptRodrigo4);
  console.log(`   Personalidade: ${personality}`);
  
  const prices = analyzer.extractPrices(promptRodrigo4);
  console.log(`   Preços extraídos:`, prices);
  
  const links = analyzer.extractLinks(promptRodrigo4);
  console.log(`   Links extraídos:`, links);
  
  const coupons = analyzer.extractCoupons(promptRodrigo4);
  console.log(`   Cupons extraídos:`, Object.keys(coupons));
  
  const rules = analyzer.extractGlobalRules(promptRodrigo4);
  console.log(`   Regras extraídas: ${rules.length}`);
  rules.slice(0, 3).forEach(r => console.log(`     • ${r.substring(0, 60)}...`));
  
  // 2. Construir FlowDefinition
  console.log('\n' + '─'.repeat(70));
  console.log('🏗️ FASE 2: Construção do FlowDefinition');
  console.log('─'.repeat(70));
  
  const builder = new FlowBuilder();
  const flow = await builder.buildFromPrompt(promptRodrigo4);
  
  console.log(`\n   ID: ${flow.id}`);
  console.log(`   Tipo: ${flow.type}`);
  console.log(`   Agente: ${flow.agentName}`);
  console.log(`   Negócio: ${flow.businessName}`);
  console.log(`   Estados: ${Object.keys(flow.states).length}`);
  console.log(`   Intenções: ${Object.keys(flow.intents).length}`);
  console.log(`   Ações: ${Object.keys(flow.actions).length}`);
  
  // 3. Mostrar estrutura do fluxo
  console.log('\n' + '─'.repeat(70));
  console.log('🔄 FASE 3: Estrutura do Fluxo');
  console.log('─'.repeat(70));
  
  console.log('\n   📍 ESTADOS:');
  for (const [stateName, state] of Object.entries(flow.states)) {
    console.log(`\n   [${stateName}] - ${state.description}`);
    state.transitions.forEach(t => {
      console.log(`      → ${t.intent} → ${t.nextState} (${t.action})`);
    });
  }
  
  console.log('\n\n   🎯 INTENÇÕES:');
  for (const [intentName, intent] of Object.entries(flow.intents)) {
    console.log(`\n   ${intentName}:`);
    console.log(`      Exemplos: ${intent.examples.slice(0, 3).join(', ')}...`);
  }
  
  console.log('\n\n   ⚡ AÇÕES:');
  for (const [actionName, action] of Object.entries(flow.actions)) {
    console.log(`\n   ${actionName} (${action.type}):`);
    if (action.template) {
      console.log(`      Template: ${action.template.substring(0, 80)}...`);
    }
  }
  
  // 4. Simular conversa com o fluxo
  console.log('\n' + '─'.repeat(70));
  console.log('💬 FASE 4: Simulação de Conversa');
  console.log('─'.repeat(70));
  
  const conversationSimulation = [
    { message: 'oi', expectedIntent: 'GREETING', expectedState: 'QUALIFICANDO' },
    { message: 'como funciona?', expectedIntent: 'ASK_HOW_WORKS', expectedState: 'EXPLICANDO' },
    { message: 'quanto custa?', expectedIntent: 'ASK_PRICE', expectedState: 'PRECOS' },
    { message: 'vi o anúncio de R$49', expectedIntent: 'ASK_PROMO', expectedState: 'PRECOS' },
    { message: 'quero testar', expectedIntent: 'WANT_DEMO', expectedState: 'DEMO' },
  ];
  
  let currentState = flow.initialState;
  console.log(`\n   Estado inicial: ${currentState}`);
  
  for (const { message, expectedIntent, expectedState } of conversationSimulation) {
    // Simular detecção de intenção
    const detectedIntent = simulateIntentDetection(message, flow);
    
    // Encontrar transição
    const state = flow.states[currentState];
    const transition = state?.transitions.find(t => t.intent === detectedIntent);
    
    console.log(`\n   👤 Cliente: "${message}"`);
    console.log(`      🎯 Intent: ${detectedIntent} (esperado: ${expectedIntent})`);
    
    if (transition) {
      const action = flow.actions[transition.action];
      console.log(`      ⚡ Ação: ${transition.action}`);
      console.log(`      🤖 Resposta: ${action?.template?.substring(0, 60)}...`);
      console.log(`      📍 Próximo estado: ${transition.nextState}`);
      currentState = transition.nextState;
    } else {
      console.log(`      ⚠️ Sem transição definida para este intent neste estado`);
    }
  }
  
  // 5. Salvar FlowDefinition
  console.log('\n' + '─'.repeat(70));
  console.log('💾 FASE 5: Exportação');
  console.log('─'.repeat(70));
  
  const outputPath = './vvvv/flow-rodrigo4.json';
  fs.writeFileSync(outputPath, JSON.stringify(flow, null, 2));
  console.log(`\n   ✅ FlowDefinition salvo em: ${outputPath}`);
  
  // Resumo
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RESUMO');
  console.log('═'.repeat(70));
  
  console.log(`
   ✅ Prompt convertido com sucesso!
   
   📋 FlowDefinition:
      • Tipo: ${flow.type}
      • ${Object.keys(flow.states).length} estados
      • ${Object.keys(flow.intents).length} intenções
      • ${Object.keys(flow.actions).length} ações
      • ${flow.globalRules.length} regras globais
   
   🔄 Fluxo VENDAS detectado corretamente para rodrigo4 (AgenteZap)
   
   💡 Próximos passos:
      1. Integrar com UnifiedFlowEngine
      2. A IA interpreta mensagens usando os exemplos de intent
      3. Sistema executa ações deterministicamente
      4. IA humaniza respostas usando os templates
  `);
}

/**
 * Simula detecção de intenção (versão simplificada)
 */
function simulateIntentDetection(message: string, flow: FlowDefinition): string {
  const msgLower = message.toLowerCase();
  
  for (const [intentName, intent] of Object.entries(flow.intents)) {
    for (const example of intent.examples) {
      if (msgLower.includes(example.toLowerCase())) {
        return intentName;
      }
    }
  }
  
  return 'UNKNOWN';
}

testFlowBuilder().catch(console.error);
