/**
 * 🧪 TESTE DE ALUCINAÇÃO E AMNÉSIA - Comparação de Modelos LLM
 * 
 * Testa diferentes modelos Groq e Mistral para verificar:
 * 1. ALUCINAÇÃO: IA faz coisas fora do escopo do prompt
 * 2. AMNÉSIA: IA esquece informações já fornecidas na conversa
 * 
 * Usando o prompt real do cliente JB Elétrica
 */

// APIs diretas do Supabase
const GROQ_API_KEY = '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';
const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// Modelos a testar
const MODELS = {
  groq: [
    'openai/gpt-oss-20b',       // Modelo que estava configurado
    'llama-3.3-70b-versatile',  // Modelo atual
    'llama-3.1-8b-instant',     // Modelo rápido
    'mixtral-8x7b-32768',       // Mixtral
  ],
  mistral: [
    'mistral-small-latest',     // Modelo small
    'mistral-medium-latest',    // Modelo medium  
    'mistral-large-latest',     // Modelo large
  ]
};

// Cores para console
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
};

// Prompt do JB Elétrica (extraído do Supabase)
const PROMPT_JBELETRICA = `AGENTE JB ELÉTRICA — IA COPILOTO DE TRIAGEM (WHATSAPP)
Empresa: JB Elétrica — Uberlândia/MG
Função: triagem inicial, coleta básica e organização do pedido.
A IA NÃO agenda, NÃO confirma datas/horários e NÃO faz diagnóstico técnico.
================================================================

## BLOCO 0 — REGRAS GLOBAIS (PRIORIDADE MÁXIMA)
================================================================

## REGRA 0.0 — CONTEXTO + HORÁRIO (ABSOLUTA)
Antes de qualquer resposta, a IA deve:
- ler toda a conversa
- identificar o que o cliente já informou
- verificar data e hora fornecida pela plataforma

Se não houver data/hora confiável:
- tratar como fora do horário e usar BLOCO 2 (fora do horário)

Se estiver em horário de almoço (12h às 13h30):
- usar BLOCO 2 (almoço)

Se estiver fora do horário, sábado, domingo ou feriado:
- usar BLOCO 2 (fora do horário)

Se estiver dentro do horário:
- seguir fluxo normal

É proibido:
- repetir perguntas já respondidas
- reiniciar atendimento
- sair do assunto

---------------------------------------------------------------

## REGRA 0.1 — OBJETIVO DO AGENTE
Você é a triagem da JB Elétrica.

Função:
- entender o pedido
- coletar somente o necessário
- encaminhar quando necessário
- permanecer disponível após o encaminhamento

Você não agenda.
Você não confirma horários.
Você não tenta resolver problema.
Você não levanta hipótese técnica.

---------------------------------------------------------------

## REGRA 0.2 — POSTURA
Linguagem educada, simples e humana.

Evitar:
- perfeito
- claro
- vou te ajudar
- vamos resolver

Usar:
- certo
- entendi
- vou anotar
- vou encaminhar

---------------------------------------------------------------

## REGRA 0.3 — PROIBIÇÕES GERAIS
É proibido:
- usar QUALQUER emoji, figurinha, reação ou símbolo decorativo
- usar nome do cliente
- usar nome de atendente humano
- assinar mensagens
- inventar valores, prazos ou serviços
- sugerir agenda, datas ou horários
- prometer retorno
- deixar o cliente com sensação de abandono

---------------------------------------------------------------

## REGRA 0.4 — PROIBIDO PEDIR BAIRRO
A IA nunca pede bairro.
Localização é tratada pelo setor responsável.

---------------------------------------------------------------

## REGRA 0.5 — UMA PERGUNTA POR MENSAGEM
A IA nunca faz duas perguntas na mesma mensagem.

É proibido:
- usar numeração
- usar listas
- oferecer alternativas na mesma mensagem

---------------------------------------------------------------

## REGRA 0.6 — CONTEXTO ABSOLUTO
Nunca perguntar novamente o que o cliente já informou.

Se o cliente explicar o serviço antes da saudação:
- responder direto no contexto

---------------------------------------------------------------

## REGRA 0.7 — INTERPRETAÇÃO DE TERMOS
- uma = uma unidade
- algumas, várias = duas ou mais unidades
- orçamento sem serviço = perguntar qual serviço

---------------------------------------------------------------

## REGRA 0.8 — PERGUNTA PENDENTE
Se o cliente responder outra coisa:
- repetir somente a pergunta pendente

---------------------------------------------------------------

## REGRA 0.9 — TRAVA DE ERRO
Se a IA ficar em dúvida:
- não inventar
- coletar o básico
- encaminhar

---------------------------------------------------------------

## REGRA 0.10 — NÃO VENDEMOS MATERIAL
Resposta padrão:
"A JB Elétrica trabalha apenas com serviços elétricos. Se precisar da execução do serviço, me diga qual é."

---------------------------------------------------------------

## REGRA 0.11 — PEDIDOS DE HORÁRIO / DISPONIBILIDADE
Se o cliente perguntar:
- se tem horário hoje
- se pode amanhã
- se consegue ainda hoje

Responder:
"Essa verificação é feita pelo setor responsável. Vou encaminhar para verificar a possibilidade."

Encaminhar.

---------------------------------------------------------------

## REGRA 0.12 — APÓS ENCAMINHAMENTO (ANTIESQUECIMENTO)
Após encaminhar, se o cliente enviar:
- oi
- dúvida
- complemento

Responder:
"O setor responsável já está analisando. Se quiser, pode mandar mais detalhes por aqui."

================================================================
## BLOCO 1 — SAUDAÇÃO (DENTRO DO HORÁRIO)
================================================================

Usar apenas se o cliente não explicou nada:
"Olá! Aqui é a JB Elétrica. Me diga qual serviço elétrico você precisa."

Se já explicou:
- não usar saudação

================================================================
## BLOCO 2 — FORA DO HORÁRIO / ALMOÇO
================================================================

Mensagem fora do horário:
"Agora estamos fora do horário de atendimento.
Nosso atendimento funciona de segunda a sexta, das 08h às 12h e das 13h30 às 18h.
Vou anotar seu pedido para continuidade no próximo horário."

Mensagem de almoço:
"Agora estamos em horário de almoço.
Atendimento de segunda a sexta, das 08h às 12h e das 13h30 às 18h.
Vou anotar seu pedido para continuidade após o almoço."

Regras:
- pode coletar informações
- não passa valores
- não fala de agenda

Encerramento:
"Anotado. Quando o setor responsável voltar ao atendimento, damos continuidade por aqui."

================================================================
## BLOCO 3 — RECONHECIMENTO DE SERVIÇO
================================================================

- tomada / interruptor → BLOCO 5
- luminária / plafon / spot / trilho / arandela → BLOCO 21
- chuveiro → BLOCO 8
- ventilador → BLOCO 9
- ar-condicionado → BLOCO 10
- defeito elétrico → BLOCO 11
- orçamento sem serviço → BLOCO 15

================================================================
## BLOCO 5 — TOMADAS E INTERRUPTORES
================================================================

Perguntar:
"Quantas tomadas serão instaladas ou trocadas?"

Se uma troca simples:
"Para troca de uma tomada sem passagem de fio, o valor é R$ 55,00."
Encaminhar.

Se mais de uma ou com fio:
Encaminhar.

================================================================
## BLOCO 8 — CHUVEIRO
================================================================

Perguntar:
"É troca do chuveiro completo ou apenas da resistência?"

Valores:
Resistência R$ 75,00
Instalação simples R$ 95,00
Instalação luxo R$ 130,00

Encaminhar.

================================================================
## BLOCO 9 — VENTILADOR
================================================================

Perguntar:
"É ventilador de parede ou de teto?"

Parede:
R$ 120,00. Encaminhar.

Teto:
Encaminhar.

================================================================
## BLOCO 10 — AR-CONDICIONADO
================================================================

"Realizamos apenas a parte elétrica do ar-condicionado."

Perguntar:
"Você precisa do ponto elétrico?"

Encaminhar.

================================================================
## BLOCO 11 — PROBLEMAS ELÉTRICOS
================================================================

"Para esse tipo de situação é necessário avaliar no local."
Encaminhar.

================================================================
## BLOCO 12 — SERVIÇOS NÃO REALIZADOS
================================================================

A JB Elétrica NÃO realiza:
- interfone
- porteiro eletrônico
- telefone fixo
- padrão Cemig
- relógio / medidor
- entrada de energia
- alarme
- cerca elétrica
- câmeras
- automação
- internet / rede / Wi-Fi
- eletrônica
- conserto de eletrodomésticos

Resposta obrigatória:
"Esse tipo de serviço nós não realizamos. Atendemos apenas serviços elétricos residenciais, comerciais e prediais."

================================================================
## BLOCO 15 — ORÇAMENTO SEM SERVIÇO
================================================================

Perguntar:
"Esse orçamento é para qual serviço elétrico?"

================================================================
## BLOCO 21 — LUMINÁRIAS
================================================================

Perguntar:
"É troca ou instalação?"

Depois:
"Quantas luminárias são?"

Encaminhar.

================================================================
## FIM
================================================================`;

// ========== CENÁRIOS DE TESTE PARA ALUCINAÇÃO ==========
const HALLUCINATION_TESTS = [
  {
    id: 'hal_01',
    name: 'Pedir serviço não realizado (interfone)',
    message: 'Preciso instalar um interfone na minha casa',
    expectedBehavior: 'Deve dizer que NÃO realiza este serviço',
    checkHallucination: (response) => {
      const lower = response.toLowerCase();
      // ALUCINAÇÃO se oferecer o serviço ou dar orçamento
      if (lower.includes('r$') || lower.includes('reais') || lower.includes('valor')) {
        return { hallucinated: true, reason: 'Inventou valor para serviço não realizado' };
      }
      if (lower.includes('vou agendar') || lower.includes('agenda')) {
        return { hallucinated: true, reason: 'Tentou agendar serviço não realizado' };
      }
      if (!lower.includes('não realiza') && !lower.includes('nós não realizamos') && !lower.includes('não fazemos')) {
        return { hallucinated: true, reason: 'Não informou que não realiza o serviço' };
      }
      return { hallucinated: false };
    }
  },
  {
    id: 'hal_02', 
    name: 'Pedir material (não vendem)',
    message: 'Vocês vendem tomada? Preciso comprar 5 tomadas',
    expectedBehavior: 'Deve dizer que trabalha apenas com serviços, não vende material',
    checkHallucination: (response) => {
      const lower = response.toLowerCase();
      if (lower.includes('sim') && lower.includes('vend')) {
        return { hallucinated: true, reason: 'Disse que vende material' };
      }
      if (lower.includes('r$') && lower.includes('tomada')) {
        return { hallucinated: true, reason: 'Deu preço de material' };
      }
      if (!lower.includes('serviço') && !lower.includes('não vend')) {
        return { hallucinated: true, reason: 'Não esclareceu que só faz serviços' };
      }
      return { hallucinated: false };
    }
  },
  {
    id: 'hal_03',
    name: 'Pedir agendamento (não pode agendar)',
    message: 'Pode agendar pra amanhã às 14h?',
    expectedBehavior: 'Deve informar que não agenda e encaminhar para setor responsável',
    checkHallucination: (response) => {
      const lower = response.toLowerCase();
      if (lower.includes('agendado') || lower.includes('confirmado') || lower.includes('marcado')) {
        return { hallucinated: true, reason: 'Confirmou agendamento (não pode)' };
      }
      if (lower.includes('ok, amanhã') || lower.includes('tudo certo')) {
        return { hallucinated: true, reason: 'Confirmou data/horário' };
      }
      return { hallucinated: false };
    }
  },
  {
    id: 'hal_04',
    name: 'Pedir diagnóstico técnico (não pode fazer)',
    message: 'A tomada da cozinha está fazendo barulho estranho, o que pode ser?',
    expectedBehavior: 'Deve dizer que precisa avaliar no local, NÃO dar diagnóstico',
    checkHallucination: (response) => {
      const lower = response.toLowerCase();
      if (lower.includes('pode ser') && (lower.includes('fio') || lower.includes('curto') || lower.includes('problema'))) {
        return { hallucinated: true, reason: 'Deu diagnóstico técnico (proibido)' };
      }
      if (lower.includes('provavelmente') || lower.includes('talvez seja')) {
        return { hallucinated: true, reason: 'Levantou hipótese técnica (proibido)' };
      }
      return { hallucinated: false };
    }
  },
  {
    id: 'hal_05',
    name: 'Usar emoji (proibido)',
    message: 'Oi, bom dia!',
    expectedBehavior: 'Resposta SEM emoji',
    checkHallucination: (response) => {
      const emojiRegex = /[\u{1F300}-\u{1F9FF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{1F600}-\u{1F64F}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]|[\u{2300}-\u{23FF}]|[\u{2B50}]|[\u{1F004}]|[\u{1F0CF}]|[\u{1F18E}]|[\u{1F191}-\u{1F19A}]|[\u{231A}-\u{231B}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{1F201}]|[\u{1F202}]|[\u{1F21A}]|[\u{1F22F}]|[\u{1F232}-\u{1F23A}]|[\u{1F250}-\u{1F251}]/gu;
      if (emojiRegex.test(response)) {
        return { hallucinated: true, reason: 'Usou emoji (proibido no prompt)' };
      }
      return { hallucinated: false };
    }
  },
  {
    id: 'hal_06',
    name: 'Inventar preço não listado',
    message: 'Quanto custa para instalar 10 tomadas?',
    expectedBehavior: 'Deve encaminhar para setor responsável, NÃO inventar valor',
    checkHallucination: (response) => {
      const lower = response.toLowerCase();
      // Preços válidos no prompt: R$ 55, R$ 75, R$ 95, R$ 120, R$ 130
      const priceRegex = /r\$\s*(\d+)/gi;
      const matches = [...lower.matchAll(priceRegex)];
      for (const match of matches) {
        const value = parseInt(match[1]);
        if (![55, 75, 95, 120, 130].includes(value)) {
          return { hallucinated: true, reason: `Inventou preço R$ ${value} (não existe no prompt)` };
        }
      }
      // Para 10 tomadas, deve encaminhar, não dar preço unitário x10
      if (lower.includes('550') || lower.includes('10 x') || lower.includes('10x')) {
        return { hallucinated: true, reason: 'Calculou preço para múltiplas unidades (deve encaminhar)' };
      }
      return { hallucinated: false };
    }
  }
];

// ========== CENÁRIOS DE TESTE PARA AMNÉSIA ==========
const AMNESIA_CONVERSATION = [
  {
    role: 'user',
    content: 'Olá, preciso trocar uma tomada aqui em casa'
  },
  {
    role: 'assistant', 
    content: null // será preenchido pela IA
  },
  {
    role: 'user',
    content: 'É só uma tomada mesmo, na cozinha'
  },
  {
    role: 'assistant',
    content: null
  },
  {
    role: 'user',
    content: 'É troca simples, sem passar fio'
  },
  {
    role: 'assistant',
    content: null
  },
  {
    role: 'user', 
    content: 'Ah, e também preciso trocar o chuveiro, a resistência queimou'
  },
  {
    role: 'assistant',
    content: null
  },
  {
    role: 'user',
    content: 'É só a resistência mesmo'
  },
  {
    role: 'assistant',
    content: null
  },
  // Teste de amnésia - perguntar sobre algo já dito
  {
    role: 'user',
    content: 'Então, quanto fica a tomada mesmo?'
  }
];

// Função para checar amnésia
function checkAmnesia(messages, finalResponse) {
  const lower = finalResponse.toLowerCase();
  
  // Se perguntar novamente quantas tomadas (já foi informado: "só uma")
  if (lower.includes('quantas tomadas') || lower.includes('quantas serão')) {
    return { hasAmnesia: true, reason: 'Perguntou novamente quantidade de tomadas (já informado)' };
  }
  
  // Se perguntar se é troca ou instalação (já foi informado: "troca simples")
  if (lower.includes('troca ou instalação') || lower.includes('instalação ou troca')) {
    return { hasAmnesia: true, reason: 'Perguntou troca/instalação novamente (já informado)' };
  }
  
  // Se perguntar se passa fio (já foi informado: "sem passar fio")
  if (lower.includes('passa fio') || lower.includes('passagem de fio')) {
    return { hasAmnesia: true, reason: 'Perguntou sobre passagem de fio novamente (já informado)' };
  }
  
  // Deveria lembrar que é troca simples de uma tomada = R$ 55,00
  if (!lower.includes('55') && !lower.includes('encaminh')) {
    return { hasAmnesia: true, reason: 'Não lembrou o contexto da tomada simples' };
  }
  
  return { hasAmnesia: false };
}

// ========== FUNÇÕES DE CHAMADA API ==========

async function callGroq(model, messages, temperature = 0.3) {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 500,
        temperature,
        // Parâmetros para reduzir alucinação
        top_p: 0.9,
        frequency_penalty: 0.3,
        presence_penalty: 0.3,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Groq API error: ${response.status} - ${text}`);
    }
    
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      elapsed: Date.now() - startTime,
      tokens: data.usage,
      error: null
    };
  } catch (err) {
    return {
      content: '',
      elapsed: Date.now() - startTime,
      tokens: null,
      error: err.message
    };
  }
}

async function callMistral(model, messages, temperature = 0.3) {
  const startTime = Date.now();
  
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: 500,
        temperature,
        top_p: 0.9,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Mistral API error: ${response.status} - ${text}`);
    }
    
    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      elapsed: Date.now() - startTime,
      tokens: data.usage,
      error: null
    };
  } catch (err) {
    return {
      content: '',
      elapsed: Date.now() - startTime,
      tokens: null,
      error: err.message
    };
  }
}

// ========== TESTE DE ALUCINAÇÃO ==========

async function runHallucinationTest(provider, model, callFn) {
  console.log(`\n${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}🧪 TESTE DE ALUCINAÇÃO: ${provider.toUpperCase()} - ${model}${C.reset}`);
  console.log(`${C.bold}${C.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  
  const results = [];
  
  for (const test of HALLUCINATION_TESTS) {
    const messages = [
      { role: 'system', content: PROMPT_JBELETRICA },
      { role: 'user', content: test.message }
    ];
    
    const result = await callFn(model, messages);
    
    if (result.error) {
      console.log(`\n${C.red}❌ ${test.name}: ERRO - ${result.error}${C.reset}`);
      results.push({ test: test.id, passed: false, error: result.error });
      continue;
    }
    
    const check = test.checkHallucination(result.content);
    
    if (check.hallucinated) {
      console.log(`\n${C.red}❌ ${test.name}${C.reset}`);
      console.log(`   ${C.dim}Mensagem: "${test.message}"${C.reset}`);
      console.log(`   ${C.yellow}Resposta: ${result.content.substring(0, 200)}...${C.reset}`);
      console.log(`   ${C.red}ALUCINAÇÃO: ${check.reason}${C.reset}`);
      results.push({ test: test.id, passed: false, reason: check.reason });
    } else {
      console.log(`\n${C.green}✅ ${test.name}${C.reset}`);
      console.log(`   ${C.dim}Mensagem: "${test.message}"${C.reset}`);
      console.log(`   ${C.green}Resposta: ${result.content.substring(0, 150)}...${C.reset}`);
      results.push({ test: test.id, passed: true });
    }
    
    // Delay para evitar rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  
  console.log(`\n${C.bold}📊 RESULTADO ALUCINAÇÃO ${model}: ${passed}/${total} (${Math.round(passed/total*100)}%)${C.reset}`);
  
  return { model, provider, type: 'hallucination', passed, total, results };
}

// ========== TESTE DE AMNÉSIA ==========

async function runAmnesiaTest(provider, model, callFn) {
  console.log(`\n${C.bold}${C.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}🧠 TESTE DE AMNÉSIA: ${provider.toUpperCase()} - ${model}${C.reset}`);
  console.log(`${C.bold}${C.magenta}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  
  const conversation = [
    { role: 'system', content: PROMPT_JBELETRICA }
  ];
  
  let lastResponse = '';
  
  // Simular conversa completa
  for (let i = 0; i < AMNESIA_CONVERSATION.length; i++) {
    const msg = AMNESIA_CONVERSATION[i];
    
    if (msg.role === 'user') {
      conversation.push({ role: 'user', content: msg.content });
      console.log(`\n${C.blue}👤 Cliente: ${msg.content}${C.reset}`);
      
      const result = await callFn(model, conversation, 0.3);
      
      if (result.error) {
        console.log(`${C.red}❌ ERRO: ${result.error}${C.reset}`);
        return { model, provider, type: 'amnesia', passed: false, error: result.error };
      }
      
      lastResponse = result.content;
      conversation.push({ role: 'assistant', content: lastResponse });
      console.log(`${C.cyan}🤖 IA: ${lastResponse}${C.reset}`);
      
      await new Promise(r => setTimeout(r, 800));
    }
  }
  
  // Verificar amnésia na última resposta
  const amnesiaCheck = checkAmnesia(conversation, lastResponse);
  
  if (amnesiaCheck.hasAmnesia) {
    console.log(`\n${C.red}❌ AMNÉSIA DETECTADA: ${amnesiaCheck.reason}${C.reset}`);
    return { model, provider, type: 'amnesia', passed: false, reason: amnesiaCheck.reason };
  } else {
    console.log(`\n${C.green}✅ MEMÓRIA OK: Manteve contexto da conversa${C.reset}`);
    return { model, provider, type: 'amnesia', passed: true };
  }
}

// ========== CONVERSA LONGA IA vs IA ==========

async function runLongConversationTest(provider, model, callFn) {
  console.log(`\n${C.bold}${C.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  console.log(`${C.bold}💬 CONVERSA LONGA IA vs IA: ${provider.toUpperCase()} - ${model}${C.reset}`);
  console.log(`${C.bold}${C.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
  
  // Cliente IA (simula cliente real sem predefinições)
  const clientSystemPrompt = `Você é um cliente comum que precisa de serviços elétricos.
Você está conversando com a JB Elétrica pelo WhatsApp.
Seja natural, faça perguntas reais, às vezes mude de assunto.
Você precisa de: trocar algumas tomadas, instalar uma luminária, e verificar um problema elétrico.
Não seja robótico. Às vezes divague. Pergunte preços. Tente agendar.
Responda de forma curta como no WhatsApp.`;

  const agentConversation = [
    { role: 'system', content: PROMPT_JBELETRICA }
  ];
  
  const clientConversation = [
    { role: 'system', content: clientSystemPrompt }
  ];
  
  // Mensagem inicial do cliente
  let clientMsg = 'oi, boa tarde';
  const issues = [];
  
  for (let turn = 0; turn < 12; turn++) {
    // Cliente envia
    console.log(`\n${C.blue}👤 Cliente [${turn+1}]: ${clientMsg}${C.reset}`);
    agentConversation.push({ role: 'user', content: clientMsg });
    
    // Agente responde
    const agentResult = await callFn(model, agentConversation, 0.3);
    if (agentResult.error) {
      console.log(`${C.red}❌ ERRO AGENTE: ${agentResult.error}${C.reset}`);
      break;
    }
    
    const agentResponse = agentResult.content;
    agentConversation.push({ role: 'assistant', content: agentResponse });
    console.log(`${C.cyan}🤖 Agente [${turn+1}]: ${agentResponse}${C.reset}`);
    
    // Verificar problemas na resposta do agente
    const emojiRegex = /[\u{1F300}-\u{1F9FF}]/gu;
    if (emojiRegex.test(agentResponse)) {
      issues.push({ turn: turn+1, issue: 'Usou emoji (proibido)' });
    }
    if (agentResponse.toLowerCase().includes('vou agendar') || agentResponse.toLowerCase().includes('agendado')) {
      issues.push({ turn: turn+1, issue: 'Tentou agendar (proibido)' });
    }
    if (agentResponse.toLowerCase().includes('perfeito') || agentResponse.toLowerCase().includes('claro')) {
      issues.push({ turn: turn+1, issue: 'Usou palavra proibida (perfeito/claro)' });
    }
    
    // Cliente pensa na próxima mensagem
    clientConversation.push({ role: 'user', content: agentResponse });
    
    if (turn < 11) {
      const clientResult = await callFn(model, clientConversation, 0.7);
      if (clientResult.error) {
        console.log(`${C.red}❌ ERRO CLIENTE: ${clientResult.error}${C.reset}`);
        break;
      }
      clientMsg = clientResult.content;
      clientConversation.push({ role: 'assistant', content: clientMsg });
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\n${C.bold}📋 PROBLEMAS DETECTADOS: ${issues.length}${C.reset}`);
  for (const issue of issues) {
    console.log(`   ${C.red}Turn ${issue.turn}: ${issue.issue}${C.reset}`);
  }
  
  return { model, provider, type: 'long_conversation', issues: issues.length, details: issues };
}

// ========== MAIN ==========

async function main() {
  console.log(`\n${C.bold}${C.green}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}   🔬 TESTE COMPLETO: ALUCINAÇÃO E AMNÉSIA - GROQ vs MISTRAL${C.reset}`);
  console.log(`${C.bold}${C.green}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.dim}Prompt: JB Elétrica (9336 caracteres)${C.reset}`);
  console.log(`${C.dim}Data: ${new Date().toISOString()}${C.reset}\n`);
  
  const allResults = [];
  
  // Testar modelos Groq
  for (const model of MODELS.groq) {
    console.log(`\n${C.bold}${C.blue}▶ Testando GROQ: ${model}${C.reset}`);
    
    try {
      const halResult = await runHallucinationTest('groq', model, callGroq);
      allResults.push(halResult);
      
      const amnesiaResult = await runAmnesiaTest('groq', model, callGroq);
      allResults.push(amnesiaResult);
      
      // Conversa longa apenas para modelos principais
      if (model === 'openai/gpt-oss-20b' || model === 'llama-3.3-70b-versatile') {
        const longResult = await runLongConversationTest('groq', model, callGroq);
        allResults.push(longResult);
      }
    } catch (err) {
      console.log(`${C.red}ERRO no modelo ${model}: ${err.message}${C.reset}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Testar modelos Mistral
  for (const model of MODELS.mistral) {
    console.log(`\n${C.bold}${C.yellow}▶ Testando MISTRAL: ${model}${C.reset}`);
    
    try {
      const halResult = await runHallucinationTest('mistral', model, callMistral);
      allResults.push(halResult);
      
      const amnesiaResult = await runAmnesiaTest('mistral', model, callMistral);
      allResults.push(amnesiaResult);
      
      // Conversa longa para mistral-small
      if (model === 'mistral-small-latest') {
        const longResult = await runLongConversationTest('mistral', model, callMistral);
        allResults.push(longResult);
      }
    } catch (err) {
      console.log(`${C.red}ERRO no modelo ${model}: ${err.message}${C.reset}`);
    }
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // ========== RESUMO FINAL ==========
  console.log(`\n${C.bold}${C.green}═══════════════════════════════════════════════════════════════${C.reset}`);
  console.log(`${C.bold}${C.green}   📊 RESUMO COMPARATIVO FINAL${C.reset}`);
  console.log(`${C.bold}${C.green}═══════════════════════════════════════════════════════════════${C.reset}\n`);
  
  // Agrupar por modelo
  const summary = {};
  for (const result of allResults) {
    const key = `${result.provider}/${result.model}`;
    if (!summary[key]) {
      summary[key] = { hallucination: null, amnesia: null, long: null };
    }
    if (result.type === 'hallucination') {
      summary[key].hallucination = result;
    } else if (result.type === 'amnesia') {
      summary[key].amnesia = result;
    } else if (result.type === 'long_conversation') {
      summary[key].long = result;
    }
  }
  
  console.log(`${'MODELO'.padEnd(35)} | ${'ALUCINAÇÃO'.padEnd(12)} | ${'AMNÉSIA'.padEnd(10)} | CONVERSA LONGA`);
  console.log(`${'─'.repeat(35)} | ${'─'.repeat(12)} | ${'─'.repeat(10)} | ${'─'.repeat(15)}`);
  
  for (const [key, data] of Object.entries(summary)) {
    const hal = data.hallucination ? `${data.hallucination.passed}/${data.hallucination.total}` : 'N/A';
    const amn = data.amnesia ? (data.amnesia.passed ? '✅ OK' : '❌ FALHOU') : 'N/A';
    const long = data.long ? `${data.long.issues} problemas` : 'N/A';
    
    console.log(`${key.padEnd(35)} | ${hal.padEnd(12)} | ${amn.padEnd(10)} | ${long}`);
  }
  
  // Recomendação
  console.log(`\n${C.bold}${C.cyan}💡 RECOMENDAÇÃO:${C.reset}`);
  
  let bestModel = null;
  let bestScore = -1;
  
  for (const [key, data] of Object.entries(summary)) {
    let score = 0;
    if (data.hallucination) score += data.hallucination.passed * 10;
    if (data.amnesia?.passed) score += 20;
    if (data.long) score -= data.long.issues * 5;
    
    if (score > bestScore) {
      bestScore = score;
      bestModel = key;
    }
  }
  
  console.log(`   Melhor modelo baseado nos testes: ${C.green}${bestModel}${C.reset} (score: ${bestScore})`);
}

// Executar
main().catch(console.error);
