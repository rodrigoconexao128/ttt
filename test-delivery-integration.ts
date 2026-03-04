/**
 * 🧪 TESTE DE INTEGRAÇÃO COMPLETO - SISTEMA DELIVERY
 * 
 * Testa fluxo completo desde pedido de cardápio até confirmação de pedido
 * Simula diferentes perfis de cliente
 */

import { testAgentResponse } from './server/aiAgent';
import type { Message } from '@shared/schema';

// ID do usuário de teste (bigacaicuiaba@gmail.com)
const TEST_USER_ID = 'bigacaicuiaba@gmail.com'; // Ajustar com ID real

interface TestScenario {
  name: string;
  description: string;
  messages: string[];
  expectedBehavior: string[];
}

const testScenarios: TestScenario[] = [
  {
    name: 'Cliente Direto - Só quer cardápio',
    description: 'Cliente pede cardápio direto sem saudação',
    messages: [
      'me envie o cardapio',
    ],
    expectedBehavior: [
      'Deve enviar cardápio COMPLETO',
      'Deve conter TODOS os produtos (Pizzas, Esfihhas, Bordas, Bebidas)',
      'Deve estar formatado bonitinho',
    ]
  },
  {
    name: 'Cliente Educado',
    description: 'Cliente cumprimenta antes de pedir',
    messages: [
      'oi',
      'qual o cardapio?',
    ],
    expectedBehavior: [
      'Primeira mensagem: responde saudação',
      'Segunda mensagem: envia cardápio COMPLETO',
    ]
  },
  {
    name: 'Cliente Específico',
    description: 'Cliente quer saber de um produto específico',
    messages: [
      'oi',
      'quanto custa a pizza calabresa?',
    ],
    expectedBehavior: [
      'Deve informar preço correto',
      'Pode sugerir outros produtos',
    ]
  },
  {
    name: 'Cliente Comprador - Fluxo Completo',
    description: 'Cliente faz pedido completo até confirmação',
    messages: [
      'oi',
      'quero fazer um pedido',
      'quero 2 pizzas calabresa',
      'é pra entregar na Rua das Flores 123',
      'vou pagar no pix',
    ],
    expectedBehavior: [
      'Confirma pedido',
      'Lista itens e valores',
      'Pede dados de entrega',
      'Confirma forma de pagamento',
      'Cria pedido no sistema',
    ]
  },
  {
    name: 'Cliente Indeciso',
    description: 'Cliente pergunta várias coisas antes de decidir',
    messages: [
      'oi',
      'tem promoção?',
      'qual o tempo de entrega?',
      'qual o pedido minimo?',
      'me mostra o cardapio',
    ],
    expectedBehavior: [
      'Responde sobre promoções',
      'Informa tempo de entrega',
      'Informa pedido mínimo',
      'Envia cardápio COMPLETO',
    ]
  }
];

async function runScenario(scenario: TestScenario): Promise<void> {
  console.log(`\n┌${'─'.repeat(70)}┐`);
  console.log(`│ 🧪 CENÁRIO: ${scenario.name.padEnd(58)}│`);
  console.log(`│ ${scenario.description.padEnd(68)}│`);
  console.log(`└${'─'.repeat(70)}┘\n`);

  const conversationHistory: Message[] = [];
  let sentMedias: string[] = [];

  for (let i = 0; i < scenario.messages.length; i++) {
    const message = scenario.messages[i];
    
    console.log(`\n📱 Cliente: ${message}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const response = await testAgentResponse(
        TEST_USER_ID,
        message,
        undefined, // sem custom prompt
        conversationHistory,
        sentMedias,
        'Cliente Teste'
      );

      if (response.text) {
        console.log(`\n🤖 Agente:\n${response.text}`);
        
        // Adicionar ao histórico
        conversationHistory.push({
          id: `msg_${Date.now()}_user`,
          fromMe: false,
          text: message,
          timestamp: new Date(),
          conversationId: 'test',
        });
        
        conversationHistory.push({
          id: `msg_${Date.now()}_agent`,
          fromMe: true,
          text: response.text,
          timestamp: new Date(),
          conversationId: 'test',
        });

        // Verificações automáticas
        console.log(`\n✅ VERIFICAÇÕES:`);
        
        // Se foi pedido de cardápio, verificar se tem os itens principais
        if (message.toLowerCase().includes('cardapio') || message.toLowerCase().includes('cardápio')) {
          const hasItems = {
            pizzas: response.text.toLowerCase().includes('pizza'),
            bebidas: response.text.toLowerCase().includes('coca') || response.text.toLowerCase().includes('refrigerante'),
            bordas: response.text.toLowerCase().includes('borda'),
            esfihhas: response.text.toLowerCase().includes('esfih') || response.text.toLowerCase().includes('esfiha'),
          };

          console.log(`   🍕 Pizzas: ${hasItems.pizzas ? '✅' : '❌'}`);
          console.log(`   🥤 Bebidas: ${hasItems.bebidas ? '✅' : '❌'}`);
          console.log(`   🧀 Bordas: ${hasItems.bordas ? '✅' : '❌'}`);
          console.log(`   🥟 Esfihhas: ${hasItems.esfihhas ? '✅' : '❌'}`);

          const allCategories = hasItems.pizzas && hasItems.bebidas && hasItems.bordas && hasItems.esfihhas;
          if (!allCategories) {
            console.log(`\n   ⚠️ ALERTA: Cardápio incompleto! Faltam categorias.`);
          }
        }

        // Contar caracteres
        console.log(`   📏 Tamanho: ${response.text.length} caracteres`);

        // Verificar se tem tag de pedido
        if (response.deliveryOrderCreated) {
          console.log(`   🛒 Pedido criado: #${response.deliveryOrderCreated.id}`);
        }

        // Atualizar mídias enviadas
        if (response.mediaActions && response.mediaActions.length > 0) {
          sentMedias = [...sentMedias, ...response.mediaActions.map(m => m.media_name || '')];
        }
      } else {
        console.log(`\n⚠️ Sem resposta do agente`);
      }

    } catch (error) {
      console.error(`\n❌ ERRO ao processar mensagem:`, error);
    }

    // Pequeno delay entre mensagens
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  console.log(`\n┌${'─'.repeat(70)}┐`);
  console.log(`│ ✅ COMPORTAMENTO ESPERADO:${' '.repeat(42)}│`);
  scenario.expectedBehavior.forEach(behavior => {
    console.log(`│   • ${behavior.padEnd(65)}│`);
  });
  console.log(`└${'─'.repeat(70)}┘\n`);
}

async function runAllScenarios() {
  console.log(`\n`);
  console.log(`╔${'═'.repeat(70)}╗`);
  console.log(`║ 🧪 TESTE DE INTEGRAÇÃO COMPLETO - SISTEMA DELIVERY${' '.repeat(19)}║`);
  console.log(`║ Testando múltiplos cenários de cliente${' '.repeat(31)}║`);
  console.log(`╚${'═'.repeat(70)}╝`);

  for (const scenario of testScenarios) {
    await runScenario(scenario);
    console.log(`\n${'═'.repeat(72)}\n`);
  }

  console.log(`\n`);
  console.log(`╔${'═'.repeat(70)}╗`);
  console.log(`║ 🎉 TODOS OS CENÁRIOS TESTADOS!${' '.repeat(39)}║`);
  console.log(`╚${'═'.repeat(70)}╝`);
  console.log(`\n`);
}

// Executar todos os cenários
runAllScenarios().catch(error => {
  console.error('❌ Erro fatal nos testes:', error);
  process.exit(1);
});
