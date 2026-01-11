/**
 * 🧪 TESTE DE ANTI-AMNÉSIA E TÉCNICAS DE VENDAS
 * 
 * Este teste simula conversas LONGAS para verificar:
 * 1. A IA não repete cumprimentos
 * 2. A IA usa o nome do cliente
 * 3. A IA não repete perguntas já feitas
 * 4. A IA cumpre promessas (se ofereceu vídeo, envia)
 * 5. A IA não usa gírias excessivas
 * 6. A IA mantém contexto da conversa
 */

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

// Prompt V4 atualizado com técnicas profissionais
const PROMPT_V4 = `═══════════════════════════════════════════════════════════════════════════════
🤖 IDENTIDADE DO AGENTE
═══════════════════════════════════════════════════════════════════════════════

Você é RODRIGO, consultor de vendas da AgenteZap.
Missão: Fazer o cliente CRIAR CONTA e TESTAR o AgenteZap.
Personalidade: Profissional, acolhedor, consultivo - como um bom vendedor que entende o cliente.

COMO VOCÊ FALA:
- Use o NOME do cliente sempre que possível (gera rapport e confiança)
- Seja direto mas empático
- Perguntas abertas para entender o negócio
- Frases curtas (máx 4-5 linhas por mensagem)
- Emojis com moderação (1-2 por mensagem)
- NUNCA use gírias excessivas como "cara", "véi", "mano", "brother"

═══════════════════════════════════════════════════════════════════════════════
🎯 REGRAS ABSOLUTAS (NUNCA VIOLE)
═══════════════════════════════════════════════════════════════════════════════

REGRA #1 - LINK SEMPRE NO INÍCIO:
- TODA primeira interação DEVE incluir: https://agentezap.online

REGRA #2 - CÓDIGO PROMOCIONAL:
- SEMPRE que mencionar R$49: incluir código PARC2026PROMO
- Explicar: vai em Planos > Tenho código de plano

REGRA #3 - CONTINUIDADE:
- Se já cumprimentou, NÃO cumprimente de novo
- Se já perguntou algo, NÃO pergunte de novo
- LEMBRE-SE de tudo

REGRA #4 - CUMPRA PROMESSAS:
- Se ofereceu vídeo → USE [ENVIAR_VIDEO:DEMONSTRACAO]
- NUNCA prometa e não cumpra

REGRA #5 - USE O NOME DO CLIENTE:
- Sempre que souber o nome, use-o

═══════════════════════════════════════════════════════════════════════════════
💰 PREÇOS
═══════════════════════════════════════════════════════════════════════════════

PREÇO NORMAL: R$99/mês
PREÇO COM CÓDIGO: R$49/mês
R$49/mês = pagamento MENSAL, uso ILIMITADO

═══════════════════════════════════════════════════════════════════════════════`;

interface TestMessage {
  role: "user" | "assistant";
  content: string;
}

interface TestScenario {
  name: string;
  clientName: string;
  conversationHistory: TestMessage[];
  newMessage: string;
  checks: {
    description: string;
    validator: (response: string) => boolean;
  }[];
}

// Cenários de teste com conversas longas
const testScenarios: TestScenario[] = [
  {
    name: "Conversa longa - Não repetir cumprimento",
    clientName: "Carlos",
    conversationHistory: [
      { role: "user", content: "Oi, tudo bem?" },
      { role: "assistant", content: "Olá Carlos! Tudo ótimo, obrigado por perguntar! 😊\n\nVi que você tem interesse no AgenteZap. O que você vende?\n\nConhece: https://agentezap.online" },
      { role: "user", content: "Vendo roupas femininas" },
      { role: "assistant", content: "Que legal, Carlos! O mercado de moda é muito dinâmico.\n\nO AgenteZap pode te ajudar a responder clientes automaticamente, mesmo quando você está ocupada com pedidos.\n\nQuantas mensagens você recebe por dia no WhatsApp?" },
      { role: "user", content: "Umas 50 mais ou menos" },
      { role: "assistant", content: "Carlos, 50 mensagens por dia é bastante! A IA do AgenteZap pode responder todas instantaneamente.\n\nE com o código PARC2026PROMO você paga só R$49/mês (ilimitado).\n\nQuer testar gratuitamente?" },
      { role: "user", content: "Sim, quero testar" },
    ],
    newMessage: "Como faço para começar?",
    checks: [
      {
        description: "NÃO deve repetir Olá/Oi (já cumprimentou)",
        validator: (r) => !r.toLowerCase().match(/^(olá|oi|ola|bom dia|boa tarde|boa noite|e aí)\b/i)
      },
      {
        description: "Deve usar o nome Carlos",
        validator: (r) => r.toLowerCase().includes("carlos")
      },
      {
        description: "NÃO deve perguntar novamente o que vende",
        validator: (r) => !r.toLowerCase().includes("o que você vende")
      },
      {
        description: "Deve incluir link ou instruções claras",
        validator: (r) => r.includes("agentezap.online") || r.includes("criar") || r.includes("conta")
      }
    ]
  },
  {
    name: "Cumprir promessa de vídeo",
    clientName: "Maria",
    conversationHistory: [
      { role: "user", content: "Olá, vi o anúncio" },
      { role: "assistant", content: "Olá Maria! Que bom que viu nosso anúncio! 😊\n\nO AgenteZap automatiza seu WhatsApp com IA.\n\nQuer que eu te mostre um vídeo de como funciona?" },
      { role: "user", content: "Quero sim, manda o vídeo" },
    ],
    newMessage: "Pode mandar",
    checks: [
      {
        description: "Deve enviar o vídeo prometido [ENVIAR_VIDEO]",
        validator: (r) => r.includes("[ENVIAR_VIDEO") || r.toLowerCase().includes("vídeo") || r.toLowerCase().includes("video")
      },
      {
        description: "NÃO deve apenas prometer de novo",
        validator: (r) => !r.toLowerCase().match(/vou (te )?(enviar|mandar)/) || r.includes("[ENVIAR_VIDEO")
      },
      {
        description: "Deve usar o nome Maria",
        validator: (r) => r.toLowerCase().includes("maria")
      }
    ]
  },
  {
    name: "Não usar gírias excessivas",
    clientName: "João",
    conversationHistory: [],
    newMessage: "Oi, quero saber sobre o sistema",
    checks: [
      {
        description: "NÃO deve usar 'cara'",
        validator: (r) => !r.toLowerCase().match(/\bcara\b/)
      },
      {
        description: "NÃO deve usar 'véi' ou 'vei'",
        validator: (r) => !r.toLowerCase().match(/\bv[ée]i\b/)
      },
      {
        description: "NÃO deve usar 'mano'",
        validator: (r) => !r.toLowerCase().match(/\bmano\b/)
      },
      {
        description: "Deve incluir link agentezap.online",
        validator: (r) => r.includes("agentezap.online")
      },
      {
        description: "Deve ser profissional mas acolhedor",
        validator: (r) => r.length > 50 && r.length < 800
      }
    ]
  },
  {
    name: "Lembrar contexto do negócio do cliente",
    clientName: "Ana",
    conversationHistory: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Olá Ana! Tudo bem? 😊\n\nSou Rodrigo da AgenteZap. O que você vende?\n\nConhece: https://agentezap.online" },
      { role: "user", content: "Tenho uma pizzaria delivery" },
      { role: "assistant", content: "Ana, pizzaria é um ótimo segmento! Muitos pedidos pelo WhatsApp, né?\n\nO AgenteZap pode receber pedidos automaticamente e até encaminhar para preparo.\n\nQuantos pedidos recebe por dia?" },
      { role: "user", content: "Uns 30 pedidos" },
      { role: "assistant", content: "30 pedidos por dia é um bom movimento, Ana!\n\nCom a IA você não perde nenhum pedido de madrugada.\n\nQuer testar? Com código PARC2026PROMO fica R$49/mês." },
      { role: "user", content: "Funciona para cardápio?" },
    ],
    newMessage: "Posso colocar meu cardápio na IA?",
    checks: [
      {
        description: "Deve lembrar que é pizzaria",
        validator: (r) => r.toLowerCase().includes("pizzaria") || r.toLowerCase().includes("cardápio") || r.toLowerCase().includes("pedido")
      },
      {
        description: "Deve usar o nome Ana",
        validator: (r) => r.toLowerCase().includes("ana")
      },
      {
        description: "NÃO deve cumprimentar de novo",
        validator: (r) => !r.toLowerCase().match(/^(olá|oi|ola)\b/i)
      },
      {
        description: "Deve responder sobre cardápio/menu",
        validator: (r) => r.toLowerCase().includes("cardápio") || r.toLowerCase().includes("menu") || r.toLowerCase().includes("produtos") || r.toLowerCase().includes("prompt")
      }
    ]
  },
  {
    name: "Não repetir explicação de preço",
    clientName: "Pedro",
    conversationHistory: [
      { role: "user", content: "Quanto custa?" },
      { role: "assistant", content: "Pedro, o AgenteZap custa R$99/mês.\n\nMas com o código PARC2026PROMO você paga só R$49/mês!\n\nÉ pagamento mensal, mas uso ILIMITADO.\n\nQuer criar sua conta? https://agentezap.online" },
      { role: "user", content: "Mas o R$49 é por mês mesmo?" },
      { role: "assistant", content: "Isso mesmo, Pedro! R$49 por MÊS.\n\nE pode usar ILIMITADO - sem limite de mensagens ou contatos.\n\nPara ativar: agentezap.online → Planos → Tenho código de plano → PARC2026PROMO" },
      { role: "user", content: "Tem desconto se pagar anual?" },
    ],
    newMessage: "Tem plano anual?",
    checks: [
      {
        description: "NÃO deve repetir toda explicação de preço",
        validator: (r) => !(r.includes("R$99") && r.includes("R$49") && r.includes("PARC2026"))
      },
      {
        description: "Deve usar o nome Pedro",
        validator: (r) => r.toLowerCase().includes("pedro")
      },
      {
        description: "Deve responder sobre plano anual",
        validator: (r) => r.toLowerCase().includes("anual") || r.toLowerCase().includes("mensal") || r.toLowerCase().includes("momento")
      }
    ]
  }
];

async function generateMemoryContext(history: TestMessage[], clientName: string): string {
  // Simular o sistema anti-amnésia
  const hasGreeted = history.some(m => 
    m.role === "assistant" && m.content.toLowerCase().match(/^(olá|oi|ola|bom dia|boa tarde)/i)
  );
  
  const hasAskedBusiness = history.some(m =>
    m.role === "assistant" && m.content.toLowerCase().includes("o que você vende")
  );
  
  const hasExplainedPrice = history.some(m =>
    m.role === "assistant" && (m.content.includes("R$49") || m.content.includes("R$99"))
  );

  const promisedVideo = history.some(m =>
    m.role === "assistant" && m.content.toLowerCase().match(/vou (te )?(enviar|mandar|mostrar).*vídeo/i)
  );

  const sentVideo = history.some(m =>
    m.role === "assistant" && m.content.includes("[ENVIAR_VIDEO")
  );

  let memoryBlock = `
═══════════════════════════════════════════════════════════════════════════════
🧠 MEMÓRIA DA CONVERSA (ANTI-AMNÉSIA)
═══════════════════════════════════════════════════════════════════════════════

👤 NOME DO CLIENTE: ${clientName}
   → Use o nome ${clientName} naturalmente na conversa
`;

  if (hasGreeted) {
    memoryBlock += `
🚫 CUMPRIMENTO: JÁ FOI FEITO!
   → NÃO cumprimente novamente
   → Vá DIRETO ao assunto`;
  }

  if (hasAskedBusiness) {
    memoryBlock += `
✅ JÁ PERGUNTOU SOBRE O NEGÓCIO: Não pergunte novamente`;
  }

  if (hasExplainedPrice) {
    memoryBlock += `
✅ JÁ EXPLICOU PREÇO: Não repita toda explicação`;
  }

  if (promisedVideo && !sentVideo) {
    memoryBlock += `
⚠️ AÇÃO PENDENTE: Prometeu enviar vídeo mas NÃO enviou!
   → ENVIE AGORA com [ENVIAR_VIDEO:DEMONSTRACAO]`;
  }

  memoryBlock += `

🎯 REGRAS:
- Use o nome ${clientName} sempre
- Não use gírias (cara, véi, mano)
- Frases curtas (máx 4-5 linhas)
═══════════════════════════════════════════════════════════════════════════════`;

  return memoryBlock;
}

async function testScenario(scenario: TestScenario): Promise<{
  passed: boolean;
  checks: { description: string; passed: boolean }[];
  response: string;
}> {
  const client = new Mistral({ apiKey: MISTRAL_API_KEY });
  
  // Construir mensagens
  const memoryContext = await generateMemoryContext(scenario.conversationHistory, scenario.clientName);
  
  const messages: any[] = [
    {
      role: "system",
      content: PROMPT_V4 + memoryContext
    }
  ];
  
  // Adicionar histórico
  for (const msg of scenario.conversationHistory) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }
  
  // Adicionar nova mensagem
  messages.push({
    role: "user",
    content: scenario.newMessage
  });
  
  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages,
    temperature: 0.3,
    maxTokens: 500
  });
  
  const responseText = response.choices?.[0]?.message?.content || "";
  
  // Executar verificações
  const checkResults = scenario.checks.map(check => ({
    description: check.description,
    passed: check.validator(responseText)
  }));
  
  const allPassed = checkResults.every(c => c.passed);
  
  return {
    passed: allPassed,
    checks: checkResults,
    response: responseText
  };
}

async function runAllTests() {
  console.log("═══════════════════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE ANTI-AMNÉSIA E TÉCNICAS DE VENDAS");
  console.log("═══════════════════════════════════════════════════════════════════════════════\n");
  
  let totalPassed = 0;
  let totalFailed = 0;
  
  for (const scenario of testScenarios) {
    console.log(`\n📋 Teste: ${scenario.name}`);
    console.log(`   Cliente: ${scenario.clientName}`);
    console.log(`   Histórico: ${scenario.conversationHistory.length} mensagens`);
    console.log(`   Nova mensagem: "${scenario.newMessage}"`);
    console.log("   ---");
    
    try {
      const result = await testScenario(scenario);
      
      console.log(`   📝 Resposta da IA:`);
      console.log(`   "${result.response.substring(0, 200)}${result.response.length > 200 ? '...' : ''}"`);
      console.log("   ---");
      
      for (const check of result.checks) {
        const status = check.passed ? "✅" : "❌";
        console.log(`   ${status} ${check.description}`);
      }
      
      if (result.passed) {
        console.log(`   ✅ PASSOU`);
        totalPassed++;
      } else {
        console.log(`   ❌ FALHOU`);
        totalFailed++;
      }
      
    } catch (error: any) {
      console.log(`   ❌ ERRO: ${error.message}`);
      totalFailed++;
    }
    
    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════════════════════");
  console.log(`📊 RESULTADO FINAL: ${totalPassed}/${testScenarios.length} testes passaram`);
  console.log(`   ✅ Passou: ${totalPassed}`);
  console.log(`   ❌ Falhou: ${totalFailed}`);
  console.log(`   Taxa de sucesso: ${Math.round((totalPassed / testScenarios.length) * 100)}%`);
  console.log("═══════════════════════════════════════════════════════════════════════════════");
}

runAllTests().catch(console.error);
