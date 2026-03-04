/**
 * Teste para verificar o modo "Perguntar Primeiro" do delivery
 * Simula interação de cliente com bigacaicuiaba@gmail.com
 * 
 * Execução: npx tsx teste-perguntar-primeiro.ts
 */

import Anthropic from '@anthropic-ai/sdk';

// Configuração
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

interface DeliveryData {
  business_name: string;
  business_type: string;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  delivery_fee: number;
  min_order_value: number;
  estimated_delivery_time: number;
  payment_methods: string[];
  total_items: number;
  categories: Array<{
    name: string;
    items: Array<{
      name: string;
      price: number;
      description?: string;
      available: boolean;
      is_highlight?: boolean;
    }>;
  }>;
  displayInstructions: string;
}

// Simular dados do bigacaicuiaba
const deliveryData: DeliveryData = {
  business_name: "Novo Sabor Pizza e Esfihas e Açaí",
  business_type: "Pizzaria",
  accepts_delivery: true,
  accepts_pickup: true,
  delivery_fee: 5.00,
  min_order_value: 20.00,
  estimated_delivery_time: 45,
  payment_methods: ['dinheiro', 'cartao', 'pix'],
  total_items: 36,
  categories: [
    {
      name: "🍕 Pizzas Salgadas",
      items: [
        { name: "Pizza Calabresa", price: 35.00, description: "Calabresa, cebola, mussarela", available: true },
        { name: "Pizza Frango", price: 38.00, description: "Frango desfiado, catupiry", available: true },
        { name: "Pizza Portuguesa", price: 40.00, description: "Presunto, ovos, cebola, mussarela", available: true },
      ]
    },
    {
      name: "🍫 Pizzas Doces", 
      items: [
        { name: "Pizza Chocolate", price: 30.00, description: "Chocolate ao leite", available: true },
        { name: "Pizza Banana", price: 32.00, description: "Banana, canela, leite condensado", available: true },
      ]
    },
    {
      name: "🥟 Esfihas Abertas",
      items: [
        { name: "Esfiha de Carne", price: 4.00, description: "Carne moída temperada", available: true },
        { name: "Esfiha de Queijo", price: 4.00, description: "Queijo mussarela", available: true },
        { name: "Esfiha de Calabresa", price: 4.00, description: "Calabresa com cebola", available: true },
      ]
    },
    {
      name: "🍹 Bebidas",
      items: [
        { name: "Coca-Cola Lata", price: 6.00, available: true },
        { name: "Guaraná Lata", price: 5.00, available: true },
        { name: "Água Mineral", price: 3.00, available: true },
      ]
    }
  ],
  displayInstructions: `Quando o cliente quiser ver o cardápio, primeiro pergunte: "Você quer ver: 🍕 Pizzas, 🥟 Esfihas, 🍹 Bebidas, 🧀 Bordas ou o cardápio completo?" Só envie o menu da categoria escolhida. Use a tag [ENVIAR_CATEGORIA: nome] para enviar apenas uma categoria, ou [ENVIAR_CARDAPIO_COMPLETO] se o cliente quiser ver tudo.`
};

function formatPrice(price: string | number): string {
  const numPrice = typeof price === 'string' ? parseFloat(price) : price;
  return `R$ ${numPrice.toFixed(2).replace('.', ',')}`;
}

function buildDeliveryPrompt(data: DeliveryData): string {
  const businessName = data.business_name;
  const emoji = '🍕';
  
  // Build menu text
  let menuText = '';
  for (const category of data.categories) {
    if (!category.items || category.items.length === 0) continue;
    menuText += `\n**${category.name}**\n`;
    for (const item of category.items) {
      if (!item.available) continue;
      const highlight = item.is_highlight ? '⭐ ' : '';
      menuText += `  ${highlight}• ${item.name} - ${formatPrice(item.price)}\n`;
      if (item.description) {
        menuText += `    _${item.description}_\n`;
      }
    }
  }
  
  const paymentMethods = data.payment_methods.join(', ');
  const displayInstructionsText = data.displayInstructions?.trim() || '';
  
  // Detectar modo "perguntar primeiro"
  const askFirstKeywords = ['pergunt', 'primeiro', 'antes', 'categorias', 'quer ver'];
  const shouldAskFirst = askFirstKeywords.some(kw => displayInstructionsText.toLowerCase().includes(kw));
  
  console.log('\n🔍 DIAGNÓSTICO:');
  console.log(`   displayInstructions: "${displayInstructionsText.substring(0, 100)}..."`);
  console.log(`   shouldAskFirst: ${shouldAskFirst}`);
  console.log(`   Keywords encontradas: ${askFirstKeywords.filter(kw => displayInstructionsText.toLowerCase().includes(kw)).join(', ')}\n`);
  
  const categoryList = data.categories
    .filter(c => c.items && c.items.length > 0)
    .map(c => `${c.name} (${c.items.length} itens)`)
    .join(', ');

  return `
═══════════════════════════════════════════════════════════════════════
${emoji} CARDÁPIO - ${businessName.toUpperCase()} (${data.total_items} itens)
═══════════════════════════════════════════════════════════════════════

📁 **CATEGORIAS DISPONÍVEIS:** ${categoryList}

${menuText}

📋 *INFORMAÇÕES DO DELIVERY:*
${data.accepts_delivery ? `• Entrega: Taxa de ${formatPrice(data.delivery_fee)} | Tempo estimado: ~${data.estimated_delivery_time} min` : ''}
${data.accepts_pickup ? '• Retirada no local: GRÁTIS' : ''}
${data.min_order_value > 0 ? `• Pedido mínimo: ${formatPrice(data.min_order_value)}` : ''}
• Formas de pagamento: ${paymentMethods}

${displayInstructionsText ? `
**📝 INSTRUÇÕES DE APRESENTAÇÃO (SIGA ESTAS REGRAS OBRIGATORIAMENTE):**
${displayInstructionsText}
` : ''}

═══════════════════════════════════════════════════════════════════════
${shouldAskFirst ? `
🎯🎯🎯 **MODO: PERGUNTAR PRIMEIRO - SIGA ESTAS REGRAS!** 🎯🎯🎯
═══════════════════════════════════════════════════════════════════════

⚠️ **REGRA OBRIGATÓRIA:** NÃO envie o cardápio completo de primeira!

Quando o cliente perguntar sobre cardápio/menu/produtos, siga este fluxo:

**PASSO 1 - PERGUNTE A CATEGORIA:**
Responda perguntando qual categoria o cliente quer ver:
"Olá! 😊 Temos ${categoryList}. Qual você gostaria de ver?"

**PASSO 2 - ENVIE APENAS A CATEGORIA ESCOLHIDA:**
Quando ele responder (ex: "pizzas", "esfihas", etc), use a tag:
[ENVIAR_CATEGORIA: nome_da_categoria]

Exemplo: Se o cliente quer ver pizzas, responda:
"Aqui estão nossas pizzas! 🍕
[ENVIAR_CATEGORIA: Pizzas]"

**PASSO 3 - CARDÁPIO COMPLETO (APENAS SE PEDIR):**
Se o cliente pedir explicitamente o cardápio COMPLETO, aí sim use:
[ENVIAR_CARDAPIO_COMPLETO]

⛔ PROIBIDO: Enviar cardápio completo automaticamente
⛔ PROIBIDO: Listar itens manualmente - use as tags!
✅ SEMPRE pergunte a categoria primeiro
✅ Use [ENVIAR_CATEGORIA: X] para mostrar só uma categoria
` : `
🚨🚨🚨 REGRA ABSOLUTAMENTE CRÍTICA E OBRIGATÓRIA 🚨🚨🚨
═══════════════════════════════════════════════════════════════════════

QUANDO O CLIENTE PERGUNTAR SOBRE CARDÁPIO, MENU OU PRODUTOS:
- "Qual o cardápio?" / "O que tem?" / "Me manda o menu" / "Quais produtos?" / etc.

⚠️ VOCÊ É OBRIGADO A RESPONDER COM ESTA TAG NO INÍCIO:
[ENVIAR_CARDAPIO_COMPLETO]

EXEMPLO CORRETO (COPIE ESTE FORMATO):
---
[ENVIAR_CARDAPIO_COMPLETO]

Aqui está nosso cardápio completo! Me avise se quiser fazer um pedido 😊
---

⛔ PROIBIDO: Listar itens/preços manualmente. O sistema inserirá o cardápio completo automaticamente.
`}

**INSTRUÇÕES PARA ATENDIMENTO DE PEDIDOS:**
1. Seja SIMPÁTICO e NATURAL como um atendente humano de ${data.business_type}
2. ${shouldAskFirst ? '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** PERGUNTE qual categoria quer ver primeiro!' : '**QUANDO O CLIENTE PEDIR CARDÁPIO/MENU:** Use a tag [ENVIAR_CARDAPIO_COMPLETO] OBRIGATORIAMENTE'}
═══════════════════════════════════════════════════════════════════════
`;
}

async function testarIA() {
  console.log('🧪 TESTE: Modo "Perguntar Primeiro" do Delivery');
  console.log('═'.repeat(60));
  console.log('Cliente: bigacaicuiaba@gmail.com (Novo Sabor Pizza)');
  console.log('═'.repeat(60));

  if (!ANTHROPIC_API_KEY) {
    console.log('\n⚠️  ANTHROPIC_API_KEY não definida!');
    console.log('   Mostrando apenas o prompt que seria enviado...\n');
    
    const prompt = buildDeliveryPrompt(deliveryData);
    console.log('📝 PROMPT GERADO:');
    console.log('─'.repeat(60));
    console.log(prompt);
    console.log('─'.repeat(60));
    return;
  }

  const anthropic = new Anthropic({ apiKey: ANTHROPIC_API_KEY });
  
  const systemPrompt = buildDeliveryPrompt(deliveryData);
  
  // Mensagens de teste
  const testMessages = [
    "Oi, quero ver o cardápio",
    "pizzas",
    "esfihas também"
  ];

  console.log('\n📝 SYSTEM PROMPT (resumo):');
  console.log('─'.repeat(60));
  // Mostrar apenas a parte relevante
  const modeSection = systemPrompt.includes('MODO: PERGUNTAR PRIMEIRO') 
    ? '✅ MODO: PERGUNTAR PRIMEIRO DETECTADO!' 
    : '❌ MODO: ENVIAR COMPLETO (padrão)';
  console.log(modeSection);
  console.log('─'.repeat(60));

  const messages: Array<{role: 'user' | 'assistant', content: string}> = [];
  
  for (const userMessage of testMessages) {
    console.log(`\n👤 CLIENTE: "${userMessage}"`);
    
    messages.push({ role: 'user', content: userMessage });
    
    try {
      const response = await anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages: messages
      });

      const assistantMessage = response.content[0].type === 'text' 
        ? response.content[0].text 
        : '';
      
      messages.push({ role: 'assistant', content: assistantMessage });
      
      console.log(`\n🤖 IA: ${assistantMessage}`);
      
      // Verificar se usou tags corretamente
      if (assistantMessage.includes('[ENVIAR_CARDAPIO_COMPLETO]')) {
        console.log('\n⚠️  ALERTA: IA usou [ENVIAR_CARDAPIO_COMPLETO] - deveria perguntar primeiro!');
      }
      if (assistantMessage.includes('[ENVIAR_CATEGORIA:')) {
        console.log('\n✅ IA usou [ENVIAR_CATEGORIA: ...] corretamente!');
      }
      
      console.log('\n' + '─'.repeat(60));
      
    } catch (error) {
      console.error('Erro na chamada da API:', error);
      break;
    }
  }
  
  console.log('\n✅ TESTE CONCLUÍDO!');
}

// Executar
testarIA().catch(console.error);
