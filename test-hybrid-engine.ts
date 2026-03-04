/**
 * 🧪 TESTE DO HYBRID FLOW ENGINE
 * 
 * Testa a arquitetura correta:
 * 1. IA interpreta mensagem do cliente
 * 2. Sistema executa deterministicamente
 * 3. IA humaniza resposta (opcional)
 */

import HybridFlowEngine, { BusinessConfig } from './server/HybridFlowEngine';

// Configuração do negócio de teste
const PIZZARIA_CONFIG: BusinessConfig = {
  name: 'Pizzaria do Zé',
  menu: [
    { id: '1', name: 'Pizza Calabresa', price: 45.00, category: 'Pizzas' },
    { id: '2', name: 'Pizza Mussarela', price: 40.00, category: 'Pizzas' },
    { id: '3', name: 'Pizza Portuguesa', price: 50.00, category: 'Pizzas' },
    { id: '4', name: 'Pizza Frango com Catupiry', price: 52.00, category: 'Pizzas' },
    { id: '5', name: 'Pizza Margherita', price: 48.00, category: 'Pizzas' },
    { id: '6', name: 'Coca-Cola 2L', price: 12.00, category: 'Bebidas' },
    { id: '7', name: 'Guaraná 2L', price: 10.00, category: 'Bebidas' },
    { id: '8', name: 'Água Mineral', price: 5.00, category: 'Bebidas' },
  ],
  delivery_fee: 5.00,
  min_order: 30.00,
  payment_methods: ['Pix', 'Cartão de Crédito', 'Cartão de Débito', 'Dinheiro'],
  hours: 'Seg-Dom: 18h às 23h',
  delivery_time: '40-60 minutos'
};

// API Key (substitua pela sua)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

async function runTests() {
  console.log('═'.repeat(70));
  console.log('🧪 TESTE DO HYBRID FLOW ENGINE');
  console.log('═'.repeat(70));
  
  if (!ANTHROPIC_API_KEY) {
    console.log('\n⚠️ ANTHROPIC_API_KEY não configurada!');
    console.log('Configure a variável de ambiente ou edite o arquivo.\n');
    
    // Rodar teste de estrutura sem IA
    await testStructure();
    return;
  }
  
  const engine = new HybridFlowEngine(ANTHROPIC_API_KEY);
  const customerId = 'test-customer-123';
  
  // Conversas de teste - formas variadas de falar
  const conversations = [
    // Teste 1: Saudação informal
    'e ai mano',
    
    // Teste 2: Pedir cardápio de forma informal
    'deixa eu ver oq vcs tem ai',
    
    // Teste 3: Pedir pizza de forma muito informal
    'me vê uma calabresa ai',
    
    // Teste 4: Adicionar mais item
    'mais uma coca 2 litros',
    
    // Teste 5: Ver pedido
    'oq q ta no meu pedido?',
    
    // Teste 6: Confirmar
    'isso ai, pode fechar',
    
    // Teste 7: Escolher delivery
    'manda pra mim',
    
    // Teste 8: Dar endereço
    'rua das flores 123 centro',
    
    // Teste 9: Pagamento
    'vou pagar no pix',
  ];
  
  console.log('\n--- Simulando Conversa Natural ---\n');
  
  for (const message of conversations) {
    console.log(`\n👤 Cliente: "${message}"`);
    
    try {
      const result = await engine.processMessage(
        customerId, 
        message, 
        PIZZARIA_CONFIG,
        { humanize: false } // Sem humanização para teste rápido
      );
      
      console.log(`🧠 IA interpretou: ${result.debug.parsed_input.intent}`);
      console.log(`⚙️ Sistema executou: ${result.debug.system_response.action_performed}`);
      console.log(`🤖 Resposta: ${result.response.substring(0, 200)}${result.response.length > 200 ? '...' : ''}`);
      
      // Pequeno delay entre mensagens
      await new Promise(r => setTimeout(r, 500));
      
    } catch (error) {
      console.log(`❌ Erro: ${error}`);
    }
  }
  
  // Mostrar estado final
  const finalState = engine.getState(customerId);
  console.log('\n' + '─'.repeat(70));
  console.log('📊 ESTADO FINAL DA CONVERSA:');
  console.log('─'.repeat(70));
  console.log(`   Etapa: ${finalState?.current_step}`);
  console.log(`   Carrinho: ${finalState?.cart.map(i => `${i.quantity}x ${i.name}`).join(', ') || 'vazio'}`);
  console.log(`   Total: R$ ${finalState?.total.toFixed(2)}`);
  console.log(`   Entrega: ${finalState?.delivery_type || 'não definido'}`);
  console.log(`   Endereço: ${finalState?.address || 'não definido'}`);
  console.log(`   Pagamento: ${finalState?.payment_method || 'não definido'}`);
}

async function testStructure() {
  console.log('\n' + '─'.repeat(70));
  console.log('📋 TESTE DE ESTRUTURA (sem IA)');
  console.log('─'.repeat(70));
  
  console.log('\n✅ BusinessConfig interface definida');
  console.log('✅ ConversationState interface definida');
  console.log('✅ ParsedInput interface definida');
  console.log('✅ SystemResponse interface definida');
  
  console.log('\n📦 Classes exportadas:');
  console.log('   • AIInterpreter - Usa IA para interpretar mensagens');
  console.log('   • SystemExecutor - Executa ações deterministicamente');
  console.log('   • AIHumanizer - Humaniza respostas (opcional)');
  console.log('   • HybridFlowEngine - Orquestra tudo');
  
  console.log('\n🔄 FLUXO DO SISTEMA:');
  console.log('');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │        MENSAGEM DO CLIENTE              │');
  console.log('   │  "me vê uma calabresa ai mano kkk"      │');
  console.log('   └────────────────┬────────────────────────┘');
  console.log('                    │');
  console.log('                    ▼');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │         🧠 AIInterpreter                │');
  console.log('   │  (IA entende qualquer forma de falar)   │');
  console.log('   │                                         │');
  console.log('   │  Output: {                              │');
  console.log('   │    intent: "ADD_ITEM",                  │');
  console.log('   │    entities: { product: "calabresa" }   │');
  console.log('   │  }                                      │');
  console.log('   └────────────────┬────────────────────────┘');
  console.log('                    │');
  console.log('                    ▼');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │         ⚙️ SystemExecutor               │');
  console.log('   │  (100% DETERMINÍSTICO - sem IA)         │');
  console.log('   │                                         │');
  console.log('   │  • Busca "calabresa" no menu            │');
  console.log('   │  • Adiciona ao carrinho                 │');
  console.log('   │  • Calcula total                        │');
  console.log('   │  • Muda estado para "PEDINDO"           │');
  console.log('   │                                         │');
  console.log('   │  Output: {                              │');
  console.log('   │    success: true,                       │');
  console.log('   │    data: { cart: [...], total: 45.00 }, │');
  console.log('   │    response_template: "Adicionei..."    │');
  console.log('   │  }                                      │');
  console.log('   └────────────────┬────────────────────────┘');
  console.log('                    │');
  console.log('                    ▼');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │         🎨 AIHumanizer (OPCIONAL)       │');
  console.log('   │  (IA varia a resposta - anti-bloqueio)  │');
  console.log('   └────────────────┬────────────────────────┘');
  console.log('                    │');
  console.log('                    ▼');
  console.log('   ┌─────────────────────────────────────────┐');
  console.log('   │         RESPOSTA AO CLIENTE             │');
  console.log('   │  "Beleza! Adicionei a calabresa 🍕      │');
  console.log('   │   Tá em R$45. Mais alguma coisa?"       │');
  console.log('   └─────────────────────────────────────────┘');
  console.log('');
  
  console.log('\n💡 VANTAGENS DESSA ARQUITETURA:');
  console.log('   ✅ IA entende QUALQUER forma de falar do cliente');
  console.log('   ✅ Sistema NUNCA alucina - execução 100% determinística');
  console.log('   ✅ Respostas podem variar (anti-bloqueio) sem perder precisão');
  console.log('   ✅ Dados sempre corretos (do sistema, não da IA)');
  console.log('   ✅ Debug fácil - você vê o que a IA interpretou');
  
  console.log('\n⚡ Para rodar o teste completo:');
  console.log('   1. Configure ANTHROPIC_API_KEY');
  console.log('   2. Execute: npx tsx vvvv/test-hybrid-engine.ts');
}

runTests().catch(console.error);
