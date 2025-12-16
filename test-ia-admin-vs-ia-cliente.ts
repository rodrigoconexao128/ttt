/**
 * TESTE: IA ADMIN (Rodrigo) vs IA CLIENTE
 * 
 * Simula conversas reais onde uma IA faz papel de cliente
 * e a IA Admin (Rodrigo) precisa responder de forma 100% humana.
 * 
 * Critérios de avaliação:
 * 1. Não parece robô?
 * 2. Se apresenta como Rodrigo?
 * 3. Varia as respostas?
 * 4. Usa técnicas de RAPPORT e SPIN Selling?
 * 5. Conversa como amigo tentando ajudar?
 */

import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';

dotenv.config();

const mistral = new Mistral({ apiKey: process.env.MISTRAL_API_KEY || 'your-mistral-key' });

// Prompt do Rodrigo (Admin) - simplificado para teste
const RODRIGO_PROMPT = `Você é o RODRIGO, 28 anos, especialista em automação com IA para negócios.

PERSONALIDADE:
- Fala de forma casual, usa "cara", "massa", "show", "tranquilo"
- Não usa pontuação excessiva ou emojis demais
- Se interessa genuinamente pelo negócio do cliente
- É paciente, não força venda

TÉCNICAS DE VENDAS (invisíveis):
- RAPPORT: conecta-se primeiro, vende depois
- SPIN: pergunta Situação, identifica Problema, mostra Implicação, apresenta Necessidade

REGRAS:
1. NUNCA use templates robóticos tipo "Recebi sua mensagem!", "Posso te ajudar?"
2. Varie suas respostas - não comece sempre igual
3. Se apresente como Rodrigo quando fizer sentido
4. Converse como um amigo explicando algo legal, não como vendedor`;

// Prompt da IA Cliente (simula cliente real)
const CLIENTE_IA_PROMPT = `Você é um cliente REAL interessado em automação de WhatsApp.

Seu perfil: Dono de pequeno negócio, não muito técnico, quer entender se vale a pena.

COMO AGIR:
- Faça perguntas reais que clientes fazem
- Às vezes seja direto, às vezes enrolado
- Mostre dúvidas genuínas (preço, segurança, funcionamento)
- Não seja artificial - aja como pessoa comum no WhatsApp

OBJETIVO: Testar se o vendedor parece humano ou robô.
Se parecer robô, reclame educadamente: "parece que to falando com bot"`;

interface ConversationMessage {
  role: 'rodrigo' | 'cliente';
  content: string;
}

interface TestResult {
  scenario: string;
  conversation: ConversationMessage[];
  humanScore: number;
  issues: string[];
  passed: boolean;
}

// Cenários de teste variados
const TEST_SCENARIOS = [
  {
    name: "Cliente direto - conta negócio de cara",
    clienteFirstMessage: "oi tenho uma pizzaria e quero automatizar meu whatsapp",
  },
  {
    name: "Cliente curioso - só quer saber mais",
    clienteFirstMessage: "oi, vi propaganda de vcs, como funciona isso?",
  },
  {
    name: "Cliente cético - desconfia de robô",
    clienteFirstMessage: "to cansado de bot que nao resolve nada, isso ai é diferente?",
  },
  {
    name: "Cliente ocupado - mensagem curta",
    clienteFirstMessage: "opa",
  },
  {
    name: "Cliente técnico - pergunta específica",
    clienteFirstMessage: "isso usa a api oficial do whatsapp business ou é tipo whatsapp web?",
  },
  {
    name: "Cliente preocupado com preço",
    clienteFirstMessage: "quanto custa? to sem grana pra coisa cara",
  },
  {
    name: "Cliente que já testou concorrente",
    clienteFirstMessage: "ja usei outro sistema desses e era horrivel, pq o de vcs seria melhor?",
  },
  {
    name: "Cliente confuso - não sabe o que quer",
    clienteFirstMessage: "oi, meu amigo falou que isso é bom mas nao entendi direito oq faz",
  },
  {
    name: "Cliente que manda áudio (simulado)",
    clienteFirstMessage: "[AUDIO TRANSCRITO]: olha eu tenho uma loja de roupas e queria saber se esse negócio de ia responde cliente sozinho mesmo",
  },
  {
    name: "Cliente que só responde 'sim' ou 'não'",
    clienteFirstMessage: "sim",
  },
];

// Padrões que indicam comportamento robótico
const ROBOTIC_PATTERNS = [
  /Olá! (Tudo bem\?|Como vai\?|Seja bem-vindo)/i,
  /Recebi sua mensagem/i,
  /Posso te ajudar\?$/i,
  /Fico feliz em te atender/i,
  /Como posso ajudá-lo hoje\?/i,
  /Entendi! ?🎯/i,
  /Show! ?🚀/i,
  /Perfeito! ?✅/i,
  /Ótimo! ?🔥/i,
  /Que legal! ?😊/i,
  /(!!){2,}/,  // múltiplas exclamações
  /🚀.*🚀/,   // emoji repetido
  /Responda com/i,
  /Confirme digitando/i,
  /Para prosseguir/i,
  /Vou te transferir/i,
];

// Padrões que indicam comportamento humano
const HUMAN_PATTERNS = [
  /cara|massa|show|tranquilo|beleza|firmeza/i,
  /deixa eu|vou te|bora|vamo/i,
  /haha|kkk|rs/i,
  /rodrigo/i, // se apresenta pelo nome
  /né\?|sabe\?|tá\?|viu\?/i, // interjeições brasileiras
  /hmm|ah|opa|eita/i,
];

async function getRodrigoResponse(conversationHistory: ConversationMessage[]): Promise<string> {
  const messages = [
    { role: 'system' as const, content: RODRIGO_PROMPT },
    ...conversationHistory.map(msg => ({
      role: msg.role === 'rodrigo' ? 'assistant' as const : 'user' as const,
      content: msg.content
    }))
  ];

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages,
    maxTokens: 300,
    temperature: 0.9, // mais variação
  });

  return (response.choices?.[0]?.message?.content as string) || '';
}

async function getClienteIaResponse(conversationHistory: ConversationMessage[], scenario: string): Promise<string> {
  const messages = [
    { 
      role: 'system' as const, 
      content: CLIENTE_IA_PROMPT + `\n\nCENÁRIO ATUAL: ${scenario}\n\nContinue a conversa de forma natural. Seja crítico se o vendedor parecer robótico.` 
    },
    ...conversationHistory.map(msg => ({
      role: msg.role === 'cliente' ? 'assistant' as const : 'user' as const,
      content: msg.content
    }))
  ];

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages,
    maxTokens: 150,
    temperature: 0.8,
  });

  return (response.choices?.[0]?.message?.content as string) || '';
}

function analyzeHumanness(rodrigoMessages: string[]): { score: number; issues: string[] } {
  const issues: string[] = [];
  let score = 100;

  for (const msg of rodrigoMessages) {
    // Penaliza padrões robóticos
    for (const pattern of ROBOTIC_PATTERNS) {
      if (pattern.test(msg)) {
        issues.push(`Padrão robótico detectado: "${msg.match(pattern)?.[0]}"`);
        score -= 15;
      }
    }

    // Bonifica padrões humanos
    for (const pattern of HUMAN_PATTERNS) {
      if (pattern.test(msg)) {
        score += 3;
      }
    }

    // Penaliza respostas muito longas (parece template)
    if (msg.length > 500) {
      issues.push('Resposta muito longa (parece template)');
      score -= 10;
    }

    // Penaliza muitos emojis
    const emojiCount = (msg.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
    if (emojiCount > 3) {
      issues.push(`Muitos emojis (${emojiCount}) - parece forçado`);
      score -= 5;
    }
  }

  // Verifica se primeira mensagem é sempre igual (problema de variação)
  // Isso será verificado comparando múltiplos testes

  return { score: Math.max(0, Math.min(100, score)), issues };
}

async function runSingleTest(scenario: typeof TEST_SCENARIOS[0]): Promise<TestResult> {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`🧪 TESTANDO: ${scenario.name}`);
  console.log('='.repeat(60));

  const conversation: ConversationMessage[] = [];
  
  // Cliente manda primeira mensagem
  conversation.push({ role: 'cliente', content: scenario.clienteFirstMessage });
  console.log(`\n👤 CLIENTE: ${scenario.clienteFirstMessage}`);

  // Simula 4 turnos de conversa
  for (let turn = 0; turn < 4; turn++) {
    // Rodrigo responde
    const rodrigoResp = await getRodrigoResponse(conversation);
    conversation.push({ role: 'rodrigo', content: rodrigoResp });
    console.log(`\n🤵 RODRIGO: ${rodrigoResp}`);

    // Cliente IA responde (exceto no último turno)
    if (turn < 3) {
      const clienteResp = await getClienteIaResponse(conversation, scenario.name);
      conversation.push({ role: 'cliente', content: clienteResp });
      console.log(`\n👤 CLIENTE: ${clienteResp}`);
    }

    // Delay para não sobrecarregar API
    await new Promise(r => setTimeout(r, 500));
  }

  // Analisa humanidade das respostas do Rodrigo
  const rodrigoMessages = conversation.filter(m => m.role === 'rodrigo').map(m => m.content);
  const analysis = analyzeHumanness(rodrigoMessages);

  console.log(`\n📊 ANÁLISE:`);
  console.log(`   Score de Humanidade: ${analysis.score}/100`);
  if (analysis.issues.length > 0) {
    console.log(`   Problemas: ${analysis.issues.join(', ')}`);
  }

  return {
    scenario: scenario.name,
    conversation,
    humanScore: analysis.score,
    issues: analysis.issues,
    passed: analysis.score >= 70
  };
}

async function runAllTests() {
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     🤖 TESTE IA ADMIN (Rodrigo) vs IA CLIENTE 🤖              ║');
  console.log('║     Validando 100% de comportamento humano                     ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  const results: TestResult[] = [];
  const firstMessages: string[] = [];

  for (const scenario of TEST_SCENARIOS) {
    try {
      const result = await runSingleTest(scenario);
      results.push(result);
      
      // Coleta primeira resposta do Rodrigo para verificar variação
      const firstRodrigoMsg = result.conversation.find(m => m.role === 'rodrigo');
      if (firstRodrigoMsg) {
        firstMessages.push(firstRodrigoMsg.content);
      }

      await new Promise(r => setTimeout(r, 1000)); // Delay entre testes
    } catch (error) {
      console.error(`\n❌ Erro no cenário "${scenario.name}":`, error);
    }
  }

  // Análise de variação das primeiras mensagens
  console.log('\n');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║                    📈 RELATÓRIO FINAL                          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');

  // Verifica se primeiras mensagens são muito similares
  const uniqueStarts = new Set(firstMessages.map(m => m.substring(0, 30).toLowerCase()));
  const variationScore = (uniqueStarts.size / firstMessages.length) * 100;
  
  console.log(`\n🔄 VARIAÇÃO DAS PRIMEIRAS MENSAGENS:`);
  console.log(`   ${uniqueStarts.size}/${firstMessages.length} inícios únicos (${variationScore.toFixed(0)}% variação)`);
  
  if (variationScore < 50) {
    console.log(`   ⚠️  PROBLEMA: Primeiras mensagens muito similares!`);
  } else {
    console.log(`   ✅ Boa variação nas respostas iniciais`);
  }

  // Resumo por cenário
  console.log('\n📋 RESULTADOS POR CENÁRIO:');
  console.log('-'.repeat(70));
  
  let passed = 0;
  let totalScore = 0;

  for (const result of results) {
    const status = result.passed ? '✅' : '❌';
    console.log(`${status} ${result.scenario}`);
    console.log(`   Score: ${result.humanScore}/100`);
    if (result.issues.length > 0) {
      console.log(`   Issues: ${result.issues.slice(0, 2).join(', ')}`);
    }
    
    if (result.passed) passed++;
    totalScore += result.humanScore;
  }

  const avgScore = totalScore / results.length;
  const passRate = (passed / results.length) * 100;

  console.log('\n' + '='.repeat(70));
  console.log('📊 ESTATÍSTICAS FINAIS:');
  console.log(`   Cenários testados: ${results.length}`);
  console.log(`   Aprovados: ${passed}/${results.length} (${passRate.toFixed(0)}%)`);
  console.log(`   Score médio de humanidade: ${avgScore.toFixed(1)}/100`);
  console.log(`   Variação de respostas: ${variationScore.toFixed(0)}%`);

  // Veredicto final
  console.log('\n' + '='.repeat(70));
  if (passRate >= 90 && avgScore >= 75 && variationScore >= 50) {
    console.log('🎉 VEREDICTO: RODRIGO ESTÁ 100% HUMANO!');
    console.log('   O agente conversa de forma natural e variada.');
  } else if (passRate >= 70) {
    console.log('⚠️  VEREDICTO: QUASE LÁ - PRECISA DE AJUSTES');
    console.log('   Alguns padrões robóticos ainda detectados.');
  } else {
    console.log('❌ VEREDICTO: AINDA PARECE ROBÔ');
    console.log('   Necessário revisar o prompt do Admin.');
  }

  // Primeiras mensagens para análise manual
  console.log('\n📝 PRIMEIRAS MENSAGENS DO RODRIGO (para análise manual):');
  console.log('-'.repeat(70));
  firstMessages.forEach((msg, i) => {
    console.log(`[${i + 1}] ${msg.substring(0, 80)}${msg.length > 80 ? '...' : ''}`);
  });
}

// Executa
runAllTests().catch(console.error);
