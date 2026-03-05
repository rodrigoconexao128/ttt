/**
 * TESTE CRÍTICO: Continuidade de Contexto
 * 
 * Testa se a IA mantém contexto quando cliente:
 * 1. Manda "oi" novamente no meio da conversa
 * 2. Repete perguntas já respondidas
 * 3. Envia mensagens curtas como "ok", "sim", "não"
 * 4. Volta ao assunto anterior após desviar
 * 5. Faz múltiplas perguntas seguidas
 */

// API Key direta (do .env)
const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// Prompt real do AgenteZap (rodrigo4@gmail.com)
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

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface TestResult {
  cenario: string;
  passou: boolean;
  problema: string;
  resposta: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// CENÁRIOS DE TESTE - Situações onde a IA pode se perder
// ═══════════════════════════════════════════════════════════════════════════

const CENARIOS_TESTE = [
  {
    nome: "1. Cliente manda OI no meio da conversa",
    historico: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Tudo bem? Sou o Rodrigo da AgenteZap. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?" },
      { role: "user" as const, content: "Vendas" },
      { role: "assistant" as const, content: "Perfeito! Então você trabalha com vendas. Nosso plano é ilimitado por R$ 99/mês e já inclui IA, Follow-up, Notificador, Mídias, Qualificação, Campanhas e mais." },
    ],
    novaMensagem: "Oi",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve perguntar novamente o que ele faz" },
      { tipo: "NAO_CONTEM", valor: "Me conta:", descricao: "NÃO deve se apresentar novamente" },
    ],
  },
  {
    nome: "2. Cliente repete pergunta já respondida",
    historico: [
      { role: "user" as const, content: "Quanto custa?" },
      { role: "assistant" as const, content: "O plano é R$ 99/mês, ilimitado! Já inclui IA, Follow-up, Notificador e muito mais." },
      { role: "user" as const, content: "Entendi" },
      { role: "assistant" as const, content: "Ótimo! Quer saber mais detalhes ou já podemos começar?" },
    ],
    novaMensagem: "Qual o preço mesmo?",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["99", "já", "como", "R$"], descricao: "Deve mencionar o preço ou que já informou" },
    ],
  },
  {
    nome: "3. Cliente envia 'Tudo bem?' no meio da conversa",
    historico: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Tudo bem? Rodrigo da AgenteZap aqui. Me conta: o que você faz hoje?" },
      { role: "user" as const, content: "Atendimento" },
      { role: "assistant" as const, content: "Legal! Você trabalha com atendimento. Nossa IA pode responder clientes 24h. Quer ver como funciona?" },
    ],
    novaMensagem: "Tudo bem?",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve perguntar de novo" },
    ],
  },
  {
    nome: "4. Cliente volta ao assunto anterior após desvio",
    historico: [
      { role: "user" as const, content: "Quanto custa o plano?" },
      { role: "assistant" as const, content: "R$ 99/mês ilimitado!" },
      { role: "user" as const, content: "Vocês têm site?" },
      { role: "assistant" as const, content: "Sim! Acesse agentezap.com para mais informações." },
      { role: "user" as const, content: "Achei caro" },
    ],
    novaMensagem: "E se eu pagar anual?",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["anual", "desconto", "ano", "preço", "valor", "pagamento"], descricao: "Deve entender que está falando de pagamento" },
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve reiniciar conversa" },
    ],
  },
  {
    nome: "5. Múltiplas mensagens do cliente seguidas",
    historico: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Rodrigo da AgenteZap. O que você faz hoje?" },
    ],
    novaMensagem: "Vendas\nPelo WhatsApp\nPreciso de ajuda pra responder mais rápido",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["sim", "claro", "ajudar", "WhatsApp", "vendas", "rápido", "IA", "automático"], descricao: "Deve entender o contexto" },
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve perguntar de novo" },
    ],
  },
  {
    nome: "6. Cliente responde 'sim' sem contexto",
    historico: [
      { role: "user" as const, content: "Como funciona?" },
      { role: "assistant" as const, content: "A IA responde seus clientes automaticamente 24h. Quer ver uma demonstração?" },
    ],
    novaMensagem: "Sim",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["demonstração", "mostrar", "exemplo", "veja", "assim", "funciona", "então", "vou"], descricao: "Deve entender o 'sim' e dar a demo" },
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve reiniciar conversa" },
    ],
  },
  {
    nome: "7. Cliente manda emoji",
    historico: [
      { role: "user" as const, content: "Bom dia" },
      { role: "assistant" as const, content: "Bom dia! Rodrigo da AgenteZap. Como posso ajudar?" },
      { role: "user" as const, content: "Quero saber sobre o plano" },
      { role: "assistant" as const, content: "Claro! O plano é R$ 99/mês ilimitado com IA, Follow-up e mais." },
    ],
    novaMensagem: "👍",
    verificacoes: [
      { tipo: "CONTEM_UM_DE", valor: ["dúvida", "ajudar", "começar", "interesse", "quer", "podemos", "algo", "mais"], descricao: "Deve continuar oferecendo ajuda" },
    ],
  },
  {
    nome: "8. Cliente manda Oi após receber áudio",
    historico: [
      { role: "user" as const, content: "Oi" },
      { role: "assistant" as const, content: "Oi! Rodrigo da AgenteZap. O que você faz hoje?" },
      { role: "user" as const, content: "[Áudio recebido]" },
      { role: "assistant" as const, content: "Entendi! Você trabalha com vendas online. Posso te ajudar a automatizar isso!" },
    ],
    novaMensagem: "Oi",
    verificacoes: [
      { tipo: "NAO_CONTEM", valor: "o que você faz", descricao: "NÃO deve perguntar novamente" },
    ],
  },
];

// ═══════════════════════════════════════════════════════════════════════════
// PROMPT DE CONTINUIDADE - Este é o fix crítico
// ═══════════════════════════════════════════════════════════════════════════

function gerarPromptContinuidade(historico: ChatMessage[]): string {
  if (historico.length === 0) return '';
  
  return `

═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS DE CONTINUIDADE (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════════════════════

Esta é uma CONVERSA EM ANDAMENTO. Analise o histórico abaixo antes de responder.

🚫 PROIBIDO (vai fazer você parecer um robô):
   ❌ Perguntar "o que você faz?" de novo - cliente JÁ RESPONDEU no histórico
   ❌ Se apresentar novamente ("Sou o Rodrigo da...") - cliente JÁ TE CONHECE
   ❌ Ignorar o contexto e recomeçar do zero
   ❌ Repetir perguntas que já foram feitas
   ❌ Dar a mesma resposta para um novo "oi" no meio da conversa

✅ OBRIGATÓRIO:
   ✅ Se cliente manda "oi/oi/tudo bem" de novo → apenas pergunte "posso ajudar com algo?" ou continue o assunto
   ✅ Se cliente repete pergunta → responda brevemente ("como eu disse, R$ 99/mês")
   ✅ Se cliente responde "sim/não" → entenda o contexto da pergunta anterior
   ✅ Referencie informações já discutidas naturalmente

📋 RESUMO DO HISTÓRICO:
${historico.map((m, i) => `   ${i + 1}. [${m.role === 'user' ? 'CLIENTE' : 'VOCÊ'}]: ${m.content.substring(0, 80)}${m.content.length > 80 ? '...' : ''}`).join('\n')}

🎯 LEMBRE-SE: Você já conversou com este cliente. Continue de onde parou!
═══════════════════════════════════════════════════════════════════════════════
`;
}

// ═══════════════════════════════════════════════════════════════════════════
// FUNÇÃO DE CHAMADA À IA
// ═══════════════════════════════════════════════════════════════════════════

async function chamarIA(
  historico: ChatMessage[],
  novaMensagem: string
): Promise<string> {
  // Construir mensagens
  const messages: Array<{ role: string; content: string }> = [
    { 
      role: 'system', 
      content: SYSTEM_PROMPT + gerarPromptContinuidade(historico)
    },
  ];
  
  // Adicionar histórico
  for (const msg of historico) {
    messages.push({
      role: msg.role,
      content: msg.content
    });
  }
  
  // Adicionar nova mensagem
  messages.push({
    role: 'user',
    content: novaMensagem
  });
  
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

// ═══════════════════════════════════════════════════════════════════════════
// VERIFICADORES DE RESULTADO
// ═══════════════════════════════════════════════════════════════════════════

function verificarResposta(
  resposta: string,
  verificacoes: Array<{ tipo: string; valor: string | string[]; descricao: string }>
): { passou: boolean; problemas: string[] } {
  const problemas: string[] = [];
  const respostaLower = resposta.toLowerCase();
  
  for (const v of verificacoes) {
    switch (v.tipo) {
      case 'CONTEM':
        if (!respostaLower.includes((v.valor as string).toLowerCase())) {
          problemas.push(`❌ ${v.descricao}`);
        }
        break;
        
      case 'NAO_CONTEM':
        if (respostaLower.includes((v.valor as string).toLowerCase())) {
          problemas.push(`❌ ${v.descricao} (contém "${v.valor}")`);
        }
        break;
        
      case 'CONTEM_UM_DE':
        const opcoes = v.valor as string[];
        const contemUm = opcoes.some(op => respostaLower.includes(op.toLowerCase()));
        if (!contemUm) {
          problemas.push(`❌ ${v.descricao}`);
        }
        break;
    }
  }
  
  return {
    passou: problemas.length === 0,
    problemas
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// EXECUÇÃO DOS TESTES
// ═══════════════════════════════════════════════════════════════════════════

async function executarTestes() {
  console.log('\n' + '═'.repeat(80));
  console.log('🧪 TESTE DE CONTINUIDADE DE CONTEXTO - AgenteZap');
  console.log('═'.repeat(80));
  console.log('\nVerificando se a IA mantém contexto e não se perde na conversa...\n');
  
  const resultados: TestResult[] = [];
  let passaram = 0;
  let falharam = 0;
  
  for (const cenario of CENARIOS_TESTE) {
    console.log(`${'─'.repeat(70)}`);
    console.log(`🎯 ${cenario.nome}`);
    console.log(`${'─'.repeat(70)}`);
    
    console.log(`📜 Histórico:`);
    for (const msg of cenario.historico) {
      const emoji = msg.role === 'user' ? '👤' : '🤖';
      console.log(`   ${emoji} ${msg.content.substring(0, 60)}${msg.content.length > 60 ? '...' : ''}`);
    }
    console.log(`\n💬 Cliente envia agora: "${cenario.novaMensagem}"`);
    
    try {
      const resposta = await chamarIA(cenario.historico, cenario.novaMensagem);
      console.log(`\n🤖 Resposta da IA: "${resposta}"`);
      
      const verificacao = verificarResposta(resposta, cenario.verificacoes);
      
      if (verificacao.passou) {
        passaram++;
        console.log(`\n✅ PASSOU!`);
        resultados.push({
          cenario: cenario.nome,
          passou: true,
          problema: '',
          resposta
        });
      } else {
        falharam++;
        console.log(`\n❌ FALHOU:`);
        for (const p of verificacao.problemas) {
          console.log(`   ${p}`);
        }
        resultados.push({
          cenario: cenario.nome,
          passou: false,
          problema: verificacao.problemas.join('; '),
          resposta
        });
      }
      
    } catch (error: any) {
      falharam++;
      console.log(`\n💥 ERRO: ${error.message}`);
      resultados.push({
        cenario: cenario.nome,
        passou: false,
        problema: error.message,
        resposta: ''
      });
    }
    
    console.log('');
    
    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  // RELATÓRIO FINAL
  // ═══════════════════════════════════════════════════════════════════════════
  
  console.log('═'.repeat(80));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(80));
  
  const percentual = Math.round((passaram / CENARIOS_TESTE.length) * 100);
  
  console.log(`\n✅ Passaram: ${passaram}/${CENARIOS_TESTE.length} (${percentual}%)`);
  console.log(`❌ Falharam: ${falharam}/${CENARIOS_TESTE.length}`);
  
  if (falharam > 0) {
    console.log(`\n⚠️ CENÁRIOS QUE FALHARAM:`);
    for (const r of resultados.filter(r => !r.passou)) {
      console.log(`\n   📍 ${r.cenario}`);
      console.log(`      Problema: ${r.problema}`);
      console.log(`      Resposta: "${r.resposta.substring(0, 100)}..."`);
    }
  } else {
    console.log(`\n🎉 PERFEITO! Todos os cenários passaram!`);
    console.log(`   A IA está mantendo contexto corretamente.`);
  }
  
  console.log('\n' + '═'.repeat(80));
  
  return { passaram, falharam, percentual };
}

// Executar
executarTestes().catch(console.error);
