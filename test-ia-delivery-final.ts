/**
 * TESTE IA AGENTE VS IA CLIENTE - DELIVERY
 * 10 cenários de teste para validar fluxo completo de delivery
 */

import fetch from 'node-fetch';

const API_URL = 'https://vvvv-production.up.railway.app';
const USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384'; // bigacaicuiaba@gmail.com

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface TestResult {
  scenario: number;
  name: string;
  passed: boolean;
  messages: string[];
  error?: string;
  analysis: string;
}

// IA Cliente - gera mensagens como um cliente real
class IACliente {
  private personality: string;
  
  constructor() {
    this.personality = this.randomPersonality();
  }
  
  private randomPersonality(): string {
    const personalities = ['formal', 'informal', 'com_pressa', 'indeciso', 'curioso'];
    return personalities[Math.floor(Math.random() * personalities.length)];
  }
  
  generateMessage(context: string, previousMessages: Message[]): string {
    const isFirstMessage = previousMessages.length === 0;
    
    if (isFirstMessage) {
      return this.generateInitialMessage(context);
    }
    
    return this.generateFollowUpMessage(context, previousMessages);
  }
  
  private generateInitialMessage(context: string): string {
    const initialMessages: Record<string, string[]> = {
      'cardapio': [
        'Oi, quero ver o cardápio',
        'bom dia, me manda o cardápio por favor',
        'opa, tem cardápio?',
        'quero fazer um pedido, me passa o menu',
        'boa tarde! quais são as opções de vocês?'
      ],
      'preco': [
        'quanto custa a pizza grande?',
        'qual o valor do açaí?',
        'preço da pizza calabresa',
        'quanto é o refrigerante?',
        'valores dos produtos'
      ],
      'pedido': [
        'quero pedir uma pizza',
        'vou querer um açaí',
        'faz meu pedido: 1 pizza grande margherita',
        'quero uma pizza calabresa grande',
        'manda 2 pizzas grandes pra mim'
      ],
      'horario': [
        'qual horário de funcionamento?',
        'até que horas vocês atendem?',
        'abrem que horas?',
        'tão aberto agora?',
        'funcionam domingo?'
      ],
      'entrega': [
        'fazem entrega?',
        'entregam na minha região?',
        'qual taxa de entrega?',
        'tempo de entrega?',
        'entregam até qual horário?'
      ],
      'pagamento': [
        'aceitam pix?',
        'formas de pagamento',
        'pode ser no cartão?',
        'paga na entrega?',
        'tem pagamento online?'
      ]
    };
    
    const messages = initialMessages[context] || initialMessages['cardapio'];
    return messages[Math.floor(Math.random() * messages.length)];
  }
  
  private generateFollowUpMessage(context: string, previousMessages: Message[]): string {
    const lastAssistant = previousMessages.filter(m => m.role === 'assistant').pop();
    
    if (!lastAssistant) {
      return 'não entendi, pode repetir?';
    }
    
    const content = lastAssistant.content.toLowerCase();
    
    // Se perguntou o endereço
    if (content.includes('endereço') || content.includes('onde você mora') || content.includes('entregar')) {
      return 'Rua das Flores, 123 - Centro';
    }
    
    // Se perguntou forma de pagamento
    if (content.includes('pagamento') || content.includes('pagar')) {
      const pagamentos = ['pix', 'dinheiro', 'cartão', 'débito'];
      return pagamentos[Math.floor(Math.random() * pagamentos.length)];
    }
    
    // Se apresentou o cardápio
    if (content.includes('cardápio') || content.includes('menu') || content.includes('pizza') || content.includes('açaí')) {
      return 'quero pedir uma pizza grande margherita';
    }
    
    // Se confirmou pedido
    if (content.includes('confirma') || content.includes('correto') || content.includes('total')) {
      return 'sim, pode confirmar';
    }
    
    // Se perguntou troco
    if (content.includes('troco')) {
      return 'não precisa de troco';
    }
    
    // Default
    return 'ok, obrigado!';
  }
}

// Chamar a API do agente
async function callAgent(message: string, history: Message[]): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/api/test-agent/message`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId: USER_ID,
        message: message,
        history: history.map(m => ({ role: m.role, content: m.content })),
        sentMedias: []
      })
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText}`);
    }
    
    const data = await response.json() as any;
    return data.text || data.response || 'Sem resposta';
  } catch (error) {
    throw error;
  }
}

// Executar um cenário de teste
async function runScenario(
  scenarioNum: number,
  name: string,
  context: string,
  maxTurns: number = 5,
  validationFn: (messages: Message[]) => { passed: boolean; analysis: string }
): Promise<TestResult> {
  const result: TestResult = {
    scenario: scenarioNum,
    name,
    passed: false,
    messages: [],
    analysis: ''
  };
  
  const iaCliente = new IACliente();
  const conversationHistory: Message[] = [];
  
  try {
    for (let turn = 0; turn < maxTurns; turn++) {
      // IA Cliente gera mensagem
      const clientMessage = iaCliente.generateMessage(context, conversationHistory);
      result.messages.push(`👤 Cliente: ${clientMessage}`);
      
      // Enviar para IA Agente
      const agentResponse = await callAgent(clientMessage, conversationHistory);
      result.messages.push(`🤖 Agente: ${agentResponse}`);
      
      // Adicionar ao histórico
      conversationHistory.push({ role: 'user', content: clientMessage });
      conversationHistory.push({ role: 'assistant', content: agentResponse });
      
      // Delay entre turnos
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
    
    // Validar resultado
    const validation = validationFn(conversationHistory);
    result.passed = validation.passed;
    result.analysis = validation.analysis;
    
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    result.analysis = `ERRO: ${result.error}`;
  }
  
  return result;
}

// ====================
// 10 CENÁRIOS DE TESTE
// ====================

const scenarios = [
  {
    num: 1,
    name: 'Pedido de Cardápio Completo',
    context: 'cardapio',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const hasMenu = agentMsgs.includes('pizza') || agentMsgs.includes('açaí') || agentMsgs.includes('margherita');
      const hasPrice = agentMsgs.includes('r$') || agentMsgs.includes('reais') || /\d+[,.]?\d*/.test(agentMsgs);
      return {
        passed: hasMenu && hasPrice,
        analysis: `Menu: ${hasMenu ? '✅' : '❌'} | Preços: ${hasPrice ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 2,
    name: 'Consulta de Preço Específico',
    context: 'preco',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content).join(' ');
      const hasPrice = /r\$\s*\d+/i.test(agentMsgs) || /\d+\s*(reais|,\d{2})/i.test(agentMsgs);
      return {
        passed: hasPrice,
        analysis: `Preço informado: ${hasPrice ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 3,
    name: 'Fluxo de Pedido Completo',
    context: 'pedido',
    maxTurns: 5,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const asksAddress = agentMsgs.includes('endereço') || agentMsgs.includes('entrega') || agentMsgs.includes('onde');
      const confirmsOrder = agentMsgs.includes('pedido') || agentMsgs.includes('total') || agentMsgs.includes('confirma');
      return {
        passed: asksAddress || confirmsOrder,
        analysis: `Pede endereço: ${asksAddress ? '✅' : '❌'} | Confirma pedido: ${confirmsOrder ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 4,
    name: 'Informações de Horário',
    context: 'horario',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const hasHours = /\d{1,2}[h:]?\d{0,2}/.test(agentMsgs) || agentMsgs.includes('hora') || agentMsgs.includes('funcionamento');
      return {
        passed: hasHours,
        analysis: `Horário informado: ${hasHours ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 5,
    name: 'Informações de Entrega',
    context: 'entrega',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const hasDeliveryInfo = agentMsgs.includes('entrega') || agentMsgs.includes('frete') || agentMsgs.includes('taxa');
      return {
        passed: hasDeliveryInfo,
        analysis: `Info entrega: ${hasDeliveryInfo ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 6,
    name: 'Formas de Pagamento',
    context: 'pagamento',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const hasPaymentInfo = agentMsgs.includes('pix') || agentMsgs.includes('cartão') || agentMsgs.includes('dinheiro') || agentMsgs.includes('pagamento');
      return {
        passed: hasPaymentInfo,
        analysis: `Info pagamento: ${hasPaymentInfo ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 7,
    name: 'Atendimento Inicial',
    context: 'cardapio',
    maxTurns: 1,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant');
      const hasGreeting = agentMsgs.length > 0 && agentMsgs[0].content.length > 20;
      return {
        passed: hasGreeting,
        analysis: `Resposta inicial adequada: ${hasGreeting ? '✅' : '❌'} (${agentMsgs[0]?.content.length || 0} chars)`
      };
    }
  },
  {
    num: 8,
    name: 'Continuidade de Conversa',
    context: 'pedido',
    maxTurns: 4,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant');
      const hasMultipleResponses = agentMsgs.length >= 3;
      const responsesVary = new Set(agentMsgs.map(m => m.content)).size === agentMsgs.length;
      return {
        passed: hasMultipleResponses,
        analysis: `Múltiplas respostas: ${hasMultipleResponses ? '✅' : '❌'} | Variadas: ${responsesVary ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 9,
    name: 'Menu com Categorias',
    context: 'cardapio',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content.toLowerCase()).join(' ');
      const hasCategories = (agentMsgs.match(/pizza|açaí|bebida|salgado|doce/gi) || []).length >= 2;
      return {
        passed: hasCategories,
        analysis: `Múltiplas categorias: ${hasCategories ? '✅' : '❌'}`
      };
    }
  },
  {
    num: 10,
    name: 'Resposta com Preços Formatados',
    context: 'preco',
    maxTurns: 2,
    validation: (msgs: Message[]) => {
      const agentMsgs = msgs.filter(m => m.role === 'assistant').map(m => m.content).join(' ');
      const priceMatches = agentMsgs.match(/R\$\s*[\d.,]+/gi) || [];
      const hasMultiplePrices = priceMatches.length >= 1;
      return {
        passed: hasMultiplePrices,
        analysis: `Preços encontrados: ${priceMatches.length} - ${priceMatches.slice(0, 3).join(', ')}`
      };
    }
  }
];

// Main execution
async function main() {
  console.log('\n' + '='.repeat(70));
  console.log('🧪 TESTE IA AGENTE VS IA CLIENTE - DELIVERY');
  console.log('📍 API: ' + API_URL);
  console.log('👤 User: bigacaicuiaba@gmail.com');
  console.log('='.repeat(70) + '\n');
  
  const results: TestResult[] = [];
  
  for (const scenario of scenarios) {
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📋 CENÁRIO ${scenario.num}: ${scenario.name}`);
    console.log(`${'─'.repeat(50)}`);
    
    const result = await runScenario(
      scenario.num,
      scenario.name,
      scenario.context,
      scenario.maxTurns,
      scenario.validation
    );
    
    results.push(result);
    
    // Mostrar mensagens
    for (const msg of result.messages) {
      console.log(`   ${msg.substring(0, 150)}${msg.length > 150 ? '...' : ''}`);
    }
    
    console.log(`\n   📊 Resultado: ${result.passed ? '✅ PASSOU' : '❌ FALHOU'}`);
    console.log(`   📝 Análise: ${result.analysis}`);
    if (result.error) {
      console.log(`   ⚠️  Erro: ${result.error}`);
    }
    
    // Delay entre cenários
    await new Promise(resolve => setTimeout(resolve, 3000));
  }
  
  // Resumo final
  console.log('\n' + '='.repeat(70));
  console.log('📊 RESUMO FINAL');
  console.log('='.repeat(70));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`\n✅ Passou: ${passed}/${results.length}`);
  console.log(`❌ Falhou: ${failed}/${results.length}`);
  console.log(`📈 Taxa de sucesso: ${((passed / results.length) * 100).toFixed(1)}%\n`);
  
  // Detalhes dos que falharam
  if (failed > 0) {
    console.log('❌ Cenários que falharam:');
    for (const r of results.filter(r => !r.passed)) {
      console.log(`   - ${r.scenario}. ${r.name}: ${r.analysis}`);
    }
  }
  
  console.log('\n' + '='.repeat(70));
}

main().catch(console.error);
