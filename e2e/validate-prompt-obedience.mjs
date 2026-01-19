/**
 * VALIDADOR DE OBEDIÊNCIA AO PROMPT - VERSÃO JavaScript
 * 
 * Este script testa se a IA realmente obedece ao prompt definido pelo usuário.
 * Usa a API Mistral para simular a resposta da IA e validar contra as regras.
 * 
 * Execute: node e2e/validate-prompt-obedience.mjs
 */

// Configuração
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'cvAkMWTjLbMeFMFiPjgmscgSJwg4AKWI';

// Casos de teste baseados nos prompts reais do banco
const PROMPT_TESTS = [
  // 1. JOYCE - Mensagem Customizada Exata
  {
    name: 'JOYCE - JB Play TV IPTV',
    userId: 'b58c4f1d-032d-4b6a-8e85-7b03d4e0be9b',
    systemPrompt: `Responder **exatamente** com a seguinte mensagem como primeira interação:

👋 *Olá! Seja bem-vindo à JB Play TV 📺*
*🤖 ATENDIMENTO* *AUTOMÁTICO*
*✨ IPTV completo, rápido e estável*
*📱 Compatível com vários aparelhos*
*👉 Para continuar, informe* *qual aparelho você vai usar:*
*(Digite apenas o número 👇)*
🔵 1️⃣ *TV Box*
🟣 2️⃣ *TV Android*
🟠 3️⃣ *Roku*
🟢 4️⃣ *Smart TV*
🟡 5️⃣ *Celular Android*
🍎 6️⃣ *iPhone*`,
    userMessage: 'oi',
    requiredElements: [
      'JB Play TV',
      'TV Box',
      'iPhone'
    ],
    forbiddenElements: [
      'Como posso ajudar',
      'Posso te ajudar'
    ],
    expectedBehavior: 'Responder EXATAMENTE a mensagem customizada sem variações'
  },

  // 2. MAQSUL - Vendedora Laura  
  {
    name: 'MAQSUL - Laura (Máquinas Têxteis)',
    userId: '09ede027-ca1f-4901-8e17-6bf57d653541',
    systemPrompt: `Laura – A Especialista em Máquinas Têxteis da Maqsul Máquinas.
Nunca falar que você é uma inteligência artificial.
Foco na experiência do cliente, falar somente o necessário sendo objetiva nas respostas.
**Evite textos muito longos** seja objetiva.
Inicie o atendimento com uma saudação cordial e pergunte o nome da pessoa.`,
    userMessage: 'oi',
    requiredElements: [
      'nome'
    ],
    forbiddenElements: [
      'inteligência artificial',
      'IA',
      'sou um robô',
      'assistente virtual'
    ],
    expectedBehavior: 'Saudar, perguntar o nome e NÃO revelar que é IA'
  },

  // 3. INSTITUTO SÃO LÁZARO - Clínica Veterinária
  {
    name: 'INSTITUTO SÃO LÁZARO - Clínica Veterinária',
    userId: 'a36bcc57-7863-4887-84c2-4011c5c163f3',
    systemPrompt: `**Miguel** - atendente virtual do Instituto São Lázaro Medicina Veterinária.
**REGRAS:**
• Saúde de acordo com o horário da mensagem enviada
• Primeiro pergunte o nome
• Depois pergunte o nome do Pet
• Faça uma pergunta por vez
• Responda apenas sobre questões relativas ao funcionamento da clínica`,
    userMessage: 'oi',
    requiredElements: [
      'nome'
    ],
    forbiddenElements: [
      'pet',
      'animal',
      'cachorro',
      'gato'
    ],
    expectedBehavior: 'Perguntar APENAS o nome primeiro (sem perguntar sobre pet)'
  },

  // 4. RODRIGO - AgenteZap Vendas
  {
    name: 'RODRIGO - AgenteZap Vendas',
    userId: 'test-user-debug-123',
    systemPrompt: `Você é Rodrigo, vendedor da AgenteZap.

REGRAS:
- Tom: Natural, amigável, persuasivo
- Plano: R$49/mês ilimitado
- Link: https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e

RESPONDA DE FORMA CURTA E DIRETA.`,
    userMessage: 'quanto custa o plano?',
    requiredElements: [
      '49',
    ],
    forbiddenElements: [
      'não sei',
      'vou verificar'
    ],
    expectedBehavior: 'Informar preço de R$49/mês de forma direta'
  },

  // 5. PIZZARIA BRASIL - Delivery
  {
    name: 'PIZZARIA BRASIL - Delivery',
    userId: '8f187da4-5ab5-482c-ae0c-47bb8177f169',
    systemPrompt: `# AGENTE PIZZARIA BRASIL - AgenteZap

## IDENTIDADE
Você é um atendente virtual da Pizzaria brasil.

## PERSONALIDADE
- Seja simpático, profissional e prestativo
- Use linguagem natural e amigável
- Responda de forma clara e objetiva
- Use emojis com moderação (1-2 por mensagem)

## COMO ATENDER
1. **Primeira mensagem do cliente:**
   - Cumprimente de forma calorosa
   - Pergunte como pode ajudar`,
    userMessage: 'oi',
    requiredElements: [
      'ajudar'
    ],
    forbiddenElements: [
      'cardápio',
      'menu'
    ],
    // NOTE: Removido 'pizza' pois 'Pizzaria Brasil' contém 'pizza' no nome
    expectedBehavior: 'Cumprimentar e perguntar como pode ajudar (SEM enviar cardápio)'
  },

  // 6. MARCIO ROUPAS - Vendedor
  {
    name: 'MARCIO ROUPAS - Vendedor',
    userId: '2aabf221-954b-46b2-94cb-0f5c6451dc78',
    systemPrompt: `Você vai ser o Marcio, dono da loja Marcio Roupas, um vendedor especializado em roupas de alta qualidade.
Logo na primeira mensagem, ofereça nossa camisa branca como uma peça versátil e indispensável.`,
    userMessage: 'oi',
    requiredElements: [
      'camisa branca'
    ],
    forbiddenElements: [
      'assistente virtual',
      'sou um robô',
      'inteligência artificial'
    ],
    // NOTE: Removido 'IA' e 'robô' isolados pois podem aparecer em outras palavras
    expectedBehavior: 'Oferecer a camisa branca logo na primeira mensagem'
  },

  // 7. ACADEMIA ROMANOS - Vitória
  {
    name: 'ACADEMIA ROMANOS - Vitória',
    userId: '7191e914-31bc-4b30-9597-ebd0e9b93f51',
    systemPrompt: `**Vitória** - Atendente da Academia Romanos.
**REGRAS:**
• Use emojis estratégicos em **TODAS** as mensagens
• Use tom profissional, mas simpático e direto
• Faça UMA pergunta por mensagem (max 250 caracteres)
• Não mencione ou ofereça serviço de personal trainer, pois não trabalhamos com esse serviço`,
    userMessage: 'quero treinar',
    requiredElements: [],
    forbiddenElements: [
      'personal trainer',
      'personal',
      'treinador pessoal'
    ],
    expectedBehavior: 'NÃO mencionar personal trainer (serviço não oferecido)'
  },
];

// Função para chamar Mistral API
async function callMistralAPI(systemPrompt, userMessage) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage }
      ],
      temperature: 0.3,
      max_tokens: 1000
    })
  });

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

// Função para validar resposta (com detecção inteligente de palavras)
function validateResponse(response, requiredElements, forbiddenElements) {
  const errors = [];
  const normalizedResponse = response.toLowerCase();

  // Verificar elementos obrigatórios (substring match)
  for (const required of requiredElements) {
    if (!normalizedResponse.includes(required.toLowerCase())) {
      errors.push(`❌ FALTA OBRIGATÓRIO: "${required}"`);
    }
  }

  // Verificar elementos proibidos (com detecção mais precisa)
  for (const forbidden of forbiddenElements) {
    const forbiddenLower = forbidden.toLowerCase();
    
    // Se o forbidden tem espaços, é uma frase - buscar exata
    if (forbiddenLower.includes(' ')) {
      if (normalizedResponse.includes(forbiddenLower)) {
        errors.push(`❌ CONTÉM PROIBIDO: "${forbidden}"`);
      }
    } else {
      // Palavra única - usar word boundary para evitar falsos positivos
      // Ex: "ia" não deve casar com "Pizzaria"
      const wordBoundaryRegex = new RegExp(`\\b${forbiddenLower.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
      if (wordBoundaryRegex.test(response)) {
        errors.push(`❌ CONTÉM PROIBIDO: "${forbidden}"`);
      }
    }
  }

  return { passed: errors.length === 0, errors };
}

// Função principal de teste
async function runPromptObedienceTests() {
  console.log('╔══════════════════════════════════════════════════════════════╗');
  console.log('║     🔍 TESTE DE OBEDIÊNCIA AO PROMPT - AgenteZap            ║');
  console.log('║     Validando se a IA obedece 100% ao prompt definido       ║');
  console.log('╚══════════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const test of PROMPT_TESTS) {
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📋 Teste: ${test.name}`);
    console.log(`📝 Mensagem: "${test.userMessage}"`);
    console.log(`🎯 Esperado: ${test.expectedBehavior}`);

    try {
      // Chamar a API Mistral
      const response = await callMistralAPI(test.systemPrompt, test.userMessage);
      
      console.log(`\n📤 Resposta da IA:`);
      console.log(`   "${response.slice(0, 200)}${response.length > 200 ? '...' : ''}"`);

      // Validar a resposta
      const validation = validateResponse(response, test.requiredElements, test.forbiddenElements);
      
      if (validation.passed) {
        console.log(`\n✅ PASSOU - A IA obedeceu ao prompt`);
        passed++;
      } else {
        console.log(`\n❌ FALHOU - A IA NÃO obedeceu ao prompt`);
        validation.errors.forEach(err => console.log(`   ${err}`));
        failed++;
      }

      results.push({
        name: test.name,
        passed: validation.passed,
        response,
        errors: validation.errors
      });

    } catch (error) {
      console.log(`\n⚠️ ERRO: ${error}`);
      failed++;
      results.push({
        name: test.name,
        passed: false,
        response: '',
        errors: [`Erro de execução: ${error}`]
      });
    }

    // Delay para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // Relatório final
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📊 RELATÓRIO FINAL`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`✅ Passaram: ${passed}/${PROMPT_TESTS.length}`);
  console.log(`❌ Falharam: ${failed}/${PROMPT_TESTS.length}`);
  console.log(`📈 Taxa de sucesso: ${Math.round((passed / PROMPT_TESTS.length) * 100)}%`);
  
  if (failed > 0) {
    console.log(`\n⚠️ TESTES QUE FALHARAM:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - ${r.name}`);
      r.errors.forEach(e => console.log(`     ${e}`));
    });
  }

  console.log(`\n${'═'.repeat(60)}`);

  // Retornar código de saída
  process.exit(failed > 0 ? 1 : 0);
}

// Executar testes
runPromptObedienceTests().catch(console.error);
