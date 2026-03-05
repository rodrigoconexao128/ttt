/**
 * TESTE COMPLETO: Simula comportamento real do sistema
 * 
 * Testa cenários reais com:
 * - Múltiplos tipos de clientes
 * - Diferentes formas de "quebrar" a continuidade
 * - Respostas repetitivas
 * - Perda de contexto
 */

// API Key
const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// Prompt do AgenteZap
const SYSTEM_PROMPT = `Você é o Rodrigo, vendedor da AgenteZap.

O AgenteZap é uma plataforma de atendimento via WhatsApp com IA.

Plano: R$ 99/mês ilimitado
- IA que responde clientes 24h
- Follow-up automático
- Notificador de gatilhos
- Mídias automáticas
- Qualificação de leads
- Campanhas em massa

Sua função:
1. Saudar o cliente
2. Perguntar o que ele faz (vendas, atendimento, qualificação)
3. Explicar como a IA pode ajudar
4. Conduzir para a venda`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT DE CONTINUIDADE (igual ao novo código do aiAgent.ts)
// ═══════════════════════════════════════════════════════════════════════════

function gerarAntiAmnesiaPrompt(historico: Message[], novaMensagem: string): string {
  if (historico.length <= 1) return '';
  
  const lastMessages = historico.slice(-4);
  const clientMessages = lastMessages.filter(m => m.role === 'user');
  const agentMessages = lastMessages.filter(m => m.role === 'assistant');
  const hasAgentReplies = agentMessages.length > 0;
  const isSaudacao = /^(oi|olá|ola|bom dia|boa tarde|boa noite|ei|e ai|eai|fala|tudo bem|blz|beleza)[\s\?!\.]*$/i.test(novaMensagem.trim());
  
  const contextSummary = hasAgentReplies 
    ? `O cliente já disse: ${clientMessages.map(m => `"${m.content.substring(0, 50)}"`).join(', ')}`
    : '';
    
  return `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS DE CONTINUIDADE (OBRIGATÓRIO - SEMPRE SIGA)
═══════════════════════════════════════════════════════════════════════════════

Esta é uma CONVERSA EM ANDAMENTO com ${historico.length} mensagens.
${contextSummary}

🚫 PROIBIDO (vai fazer você parecer um robô burro):
   ❌ Perguntar "o que você faz?" de novo se cliente JÁ RESPONDEU
   ❌ Se apresentar novamente ("Sou o X da empresa Y") - cliente JÁ TE CONHECE
   ❌ Ignorar o contexto e recomeçar a conversa do zero
   ❌ Repetir as mesmas perguntas já feitas
   ❌ Dar a mesma saudação inicial para um novo "oi" no meio da conversa

✅ OBRIGATÓRIO:
   ✅ Se cliente manda "oi/olá/tudo bem" de novo → apenas pergunte "posso ajudar com algo?" ou continue o assunto anterior
   ✅ Se cliente repete uma pergunta → responda brevemente ("como eu disse, ...")
   ✅ Se cliente responde "sim/não" → entenda o contexto da pergunta anterior
   ✅ Continue de onde parou naturalmente

${isSaudacao && hasAgentReplies ? `
🎯 ATENÇÃO: O cliente acabou de mandar "${novaMensagem}" que é uma SAUDAÇÃO REPETIDA.
   NÃO reinicie a conversa! Apenas diga algo como "Posso ajudar com algo?" ou continue o assunto.
` : ''}
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE EXTENSIVOS
// ═══════════════════════════════════════════════════════════════════════════

const CENARIOS = [
  // --- SAUDAÇÕES REPETIDAS ---
  {
    nome: "Saudação 'Oi' repetida após resposta",
    mensagens: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Sou o Rodrigo da AgenteZap. O que você faz hoje?" },
      { role: "user" as const, content: "Vendas" },
      { role: "assistant" as const, content: "Legal! Com vendas a IA pode te ajudar muito. Quer saber como?" },
      { role: "user" as const, content: "Oi" },
    ],
    respostaInvalida: ["o que você faz", "me conta", "sou o rodrigo"],
    respostaValida: ["ajudar", "posso", "algo", "vendas", "?"],
  },
  {
    nome: "Saudação 'Bom dia' repetida",
    mensagens: [
      { role: "user" as const, content: "Bom dia" },
      { role: "assistant" as const, content: "Bom dia! Rodrigo da AgenteZap. O que você faz hoje?" },
      { role: "user" as const, content: "Atendimento ao cliente" },
      { role: "assistant" as const, content: "Ótimo! Nossa IA pode responder seus clientes 24h." },
      { role: "user" as const, content: "Bom dia" },
    ],
    respostaInvalida: ["o que você faz", "me conta"],
    respostaValida: ["ajudar", "posso", "algo", "atendimento"],
  },
  
  // --- PERGUNTAS REPETIDAS ---
  {
    nome: "Cliente pergunta preço 2x",
    mensagens: [
      { role: "user" as const, content: "Quanto custa?" },
      { role: "assistant" as const, content: "R$ 99/mês ilimitado!" },
      { role: "user" as const, content: "Entendi" },
      { role: "assistant" as const, content: "Quer saber mais detalhes?" },
      { role: "user" as const, content: "Qual o preço?" },
    ],
    respostaInvalida: [],
    respostaValida: ["99", "r$", "como disse", "mencionei"],
  },
  {
    nome: "Cliente pergunta como funciona 2x",
    mensagens: [
      { role: "user" as const, content: "Como funciona?" },
      { role: "assistant" as const, content: "A IA responde seus clientes automaticamente 24h por dia." },
      { role: "user" as const, content: "Interessante" },
      { role: "assistant" as const, content: "Quer ver uma demonstração?" },
      { role: "user" as const, content: "Como funciona mesmo?" },
    ],
    respostaInvalida: [],
    respostaValida: ["ia", "responde", "24", "automático", "funciona", "cliente"],
  },
  
  // --- MENSAGENS CURTAS AMBÍGUAS ---
  {
    nome: "Cliente responde 'sim'",
    mensagens: [
      { role: "user" as const, content: "Vocês fazem demo?" },
      { role: "assistant" as const, content: "Sim! Quer que eu mostre como a IA funciona?" },
      { role: "user" as const, content: "Sim" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["vou", "mostrar", "exemplo", "funciona", "assim", "então"],
  },
  {
    nome: "Cliente responde 'não'",
    mensagens: [
      { role: "user" as const, content: "Tem teste grátis?" },
      { role: "assistant" as const, content: "Não temos teste grátis, mas o plano é apenas R$ 99/mês. Quer conhecer?" },
      { role: "user" as const, content: "Não" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["entendo", "tudo bem", "problema", "dúvida", "ajudar", "algo"],
  },
  {
    nome: "Cliente manda 'ok'",
    mensagens: [
      { role: "user" as const, content: "Quanto custa?" },
      { role: "assistant" as const, content: "R$ 99/mês ilimitado!" },
      { role: "user" as const, content: "Ok" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["dúvida", "ajudar", "começar", "mais", "alguma"],
  },
  {
    nome: "Cliente manda emoji 👍",
    mensagens: [
      { role: "user" as const, content: "Quero saber sobre o plano" },
      { role: "assistant" as const, content: "O plano é R$ 99/mês com IA, follow-up e mais!" },
      { role: "user" as const, content: "👍" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["dúvida", "ajudar", "começar", "mais", "gostou", "interesse"],
  },
  
  // --- CONTEXTO E CONTINUIDADE ---
  {
    nome: "Cliente volta ao assunto após desvio",
    mensagens: [
      { role: "user" as const, content: "Quanto custa?" },
      { role: "assistant" as const, content: "R$ 99/mês!" },
      { role: "user" as const, content: "Vocês têm escritório?" },
      { role: "assistant" as const, content: "Somos 100% digitais, atendemos online." },
      { role: "user" as const, content: "Sobre o preço, aceita pix?" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["pix", "sim", "aceita", "pagamento", "forma"],
  },
  {
    nome: "Múltiplas mensagens seguidas do cliente",
    mensagens: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Rodrigo da AgenteZap. O que você faz?" },
      { role: "user" as const, content: "Trabalho com vendas pelo WhatsApp e preciso responder mais rápido" },
    ],
    respostaInvalida: ["o que você faz"],
    respostaValida: ["vendas", "whatsapp", "rápido", "ia", "ajudar", "automático"],
  },
  
  // --- RESPOSTAS REPETITIVAS (detectar se IA está em loop) ---
  {
    nome: "Evitar loop de resposta igual",
    mensagens: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Tudo bem? Sou o Rodrigo da AgenteZap. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?" },
      { role: "user" as const, content: "Oi" },
    ],
    respostaInvalida: ["o que você faz", "me conta", "vendas, atendimento ou qualificação"],
    respostaValida: ["posso ajudar", "algo", "?"],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO DE TESTE
// ═══════════════════════════════════════════════════════════════════════════

async function chamarIA(historico: Message[]): Promise<string> {
  const novaMensagem = historico[historico.length - 1].content;
  const historicoAnterior = historico.slice(0, -1);
  
  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: SYSTEM_PROMPT },
  ];
  
  // Injetar anti-amnesia prompt
  const antiAmnesia = gerarAntiAmnesiaPrompt(historicoAnterior, novaMensagem);
  if (antiAmnesia) {
    messages.push({ role: 'system', content: antiAmnesia });
  }
  
  // Adicionar histórico
  for (const msg of historicoAnterior) {
    messages.push({ role: msg.role, content: msg.content });
  }
  
  // Adicionar nova mensagem
  messages.push({ role: 'user', content: novaMensagem });
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      max_tokens: 300,
      temperature: 0.5,
    }),
  });
  
  const data = await response.json() as any;
  return data.choices?.[0]?.message?.content || '';
}

function verificar(resposta: string, invalidos: string[], validos: string[]): { ok: boolean; motivo: string } {
  const lower = resposta.toLowerCase();
  
  // Verificar se contém algo inválido
  for (const inv of invalidos) {
    if (lower.includes(inv.toLowerCase())) {
      return { ok: false, motivo: `Contém texto proibido: "${inv}"` };
    }
  }
  
  // Verificar se contém pelo menos um válido
  if (validos.length > 0) {
    const contemValido = validos.some(v => lower.includes(v.toLowerCase()));
    if (!contemValido) {
      return { ok: false, motivo: `Não contém nenhum termo esperado: ${validos.join(', ')}` };
    }
  }
  
  return { ok: true, motivo: '' };
}

async function executar() {
  console.log('\n' + '═'.repeat(80));
  console.log('🧪 TESTE COMPLETO DE CONTINUIDADE - AgenteZap');
  console.log('═'.repeat(80) + '\n');
  
  let passaram = 0;
  let falharam = 0;
  const falhas: { nome: string; motivo: string; resposta: string }[] = [];
  
  for (const cenario of CENARIOS) {
    console.log(`${'─'.repeat(60)}`);
    console.log(`🎯 ${cenario.nome}`);
    
    try {
      const resposta = await chamarIA(cenario.mensagens);
      const resultado = verificar(resposta, cenario.respostaInvalida, cenario.respostaValida);
      
      if (resultado.ok) {
        passaram++;
        console.log(`✅ PASSOU`);
        console.log(`   Resposta: "${resposta.substring(0, 80)}..."`);
      } else {
        falharam++;
        console.log(`❌ FALHOU: ${resultado.motivo}`);
        console.log(`   Resposta: "${resposta}"`);
        falhas.push({ nome: cenario.nome, motivo: resultado.motivo, resposta });
      }
    } catch (err: any) {
      falharam++;
      console.log(`💥 ERRO: ${err.message}`);
      falhas.push({ nome: cenario.nome, motivo: err.message, resposta: '' });
    }
    
    // Delay
    await new Promise(r => setTimeout(r, 1200));
  }
  
  // Relatório
  console.log('\n' + '═'.repeat(80));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(80));
  
  const percentual = Math.round((passaram / CENARIOS.length) * 100);
  console.log(`\n✅ Passaram: ${passaram}/${CENARIOS.length} (${percentual}%)`);
  console.log(`❌ Falharam: ${falharam}/${CENARIOS.length}`);
  
  if (falhas.length > 0) {
    console.log(`\n⚠️ DETALHES DAS FALHAS:`);
    for (const f of falhas) {
      console.log(`\n   📍 ${f.nome}`);
      console.log(`      Motivo: ${f.motivo}`);
      if (f.resposta) console.log(`      Resposta: "${f.resposta.substring(0, 100)}..."`);
    }
  }
  
  console.log('\n' + '═'.repeat(80));
  
  if (percentual >= 90) {
    console.log('🎉 EXCELENTE! Sistema funcionando corretamente!');
  } else if (percentual >= 70) {
    console.log('⚠️ BOM, mas precisa de ajustes');
  } else {
    console.log('❌ PROBLEMA CRÍTICO - Necessária correção imediata');
  }
}

executar().catch(console.error);
