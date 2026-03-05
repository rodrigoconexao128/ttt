/**
 * 🧪 TESTE RODRIGO HUMANIZADO - IA ADMIN vs IA CLIENTE
 * 
 * Testa se o Rodrigo:
 * 1. Se apresenta pelo nome
 * 2. Conversa de forma natural (não robótica)
 * 3. NÃO cria conta nas primeiras mensagens
 * 4. Usa técnicas de RAPPORT e SPIN Selling
 * 5. Tira dúvidas, explica, convence
 * 6. Só cria conta quando o cliente pede ou está convencido
 */

import * as dotenv from "dotenv";
dotenv.config();

import { 
  processAdminMessage,
  clearClientSession,
  getClientSession
} from "./server/adminAgentService";

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const VERBOSE = true;
const DELAY_BETWEEN_MESSAGES = 100; // ms

// ============================================================================
// PADRÕES PARA ANÁLISE
// ============================================================================

const ROBOTIC_PATTERNS = [
  /Olá! (Tudo bem\?|Como vai\?|Seja bem-vindo)/i,
  /Recebi sua mensagem/i,
  /Posso te ajudar\?$/i,
  /Fico feliz em te atender/i,
  /Como posso ajudá-lo hoje\?/i,
  /Entendi! ?[🎯✅]/i,
  /Show! ?🚀/i,
  /Perfeito! ?✅/i,
  /Ótimo! ?🔥/i,
  /Que legal! ?😊/i,
  /(!!){2,}/,  // múltiplas exclamações
  /🚀.*🚀/,   // emoji repetido
  /Responda com/i,
  /Confirme digitando/i,
  /Para prosseguir/i,
];

const HUMAN_PATTERNS = [
  /cara|massa|show|tranquilo|beleza|firmeza/i,
  /deixa eu|vou te|bora|vamo/i,
  /rodrigo/i, 
  /né\?|sabe\?|tá\?|viu\?/i,
  /hmm|ah|opa|eita|pois é/i,
];

// ============================================================================
// CENÁRIOS DE CLIENTES VARIADOS
// ============================================================================

interface ClientScenario {
  name: string;
  description: string;
  messages: string[];  // Mensagens que o cliente vai mandando
  expectedBehavior: string;
}

const CLIENT_SCENARIOS: ClientScenario[] = [
  {
    name: "Cliente Curioso",
    description: "Só quer entender o que é, faz muitas perguntas",
    messages: [
      "oi",
      "vi um anuncio de voces",
      "isso é o que exatamente?",
      "hmm entendi, quanto custa isso?",
      "beleza, quero testar entao"
    ],
    expectedBehavior: "Rodrigo deve responder cada pergunta, NÃO criar conta até o cliente pedir no final"
  },
  {
    name: "Cliente Direto com Negócio",
    description: "Fala logo o que tem, espera Rodrigo conversar",
    messages: [
      "oi tenho uma pizzaria",
      "sim entrego na regiao toda",
      "as vezes demoro pra responder sim",
      "interessante, posso ver funcionando?"
    ],
    expectedBehavior: "Rodrigo deve fazer SPIN Selling, perguntar mais sobre o negócio, só criar no final"
  },
  {
    name: "Cliente Cético",
    description: "Desconfia, já foi enganado antes",
    messages: [
      "boa tarde",
      "ja tentei usar chatbot antes e foi horrivel",
      "o de voces é diferente como?",
      "deixa eu pensar..."
    ],
    expectedBehavior: "Rodrigo deve ser empático, explicar diferenças, não forçar venda"
  },
  {
    name: "Cliente com Pressa",
    description: "Precisa resolver urgente",
    messages: [
      "oi preciso urgente de um atendente virtual",
      "minha funcionaria saiu e to sozinho",
      "tenho uma clinica estetica",
      "bora testar"
    ],
    expectedBehavior: "Rodrigo deve entender urgência e responder rápido"
  },
  {
    name: "Cliente que só quer preço",
    description: "Pergunta preço logo de cara",
    messages: [
      "oi quanto custa",
      "tenho um salao de beleza",
      "quero testar"
    ],
    expectedBehavior: "Rodrigo pode falar preço mas deve voltar a entender o negócio"
  }
];

// ============================================================================
// FUNÇÕES DE ANÁLISE
// ============================================================================

function analyzeResponse(response: string): { 
  roboticPatterns: string[], 
  humanPatterns: string[], 
  score: number,
  hasRodrigoName: boolean,
  createdAccount: boolean
} {
  const roboticPatterns: string[] = [];
  const humanPatterns: string[] = [];
  let score = 70; // Base score

  // Check robotic patterns
  for (const pattern of ROBOTIC_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      roboticPatterns.push(match[0]);
      score -= 15;
    }
  }

  // Check human patterns
  for (const pattern of HUMAN_PATTERNS) {
    const match = response.match(pattern);
    if (match) {
      humanPatterns.push(match[0]);
      score += 5;
    }
  }

  // Check if too long (robotic template)
  if (response.length > 600) {
    roboticPatterns.push(`Resposta muito longa (${response.length} chars)`);
    score -= 10;
  }

  // Check emoji count
  const emojiCount = (response.match(/[\u{1F300}-\u{1F9FF}]/gu) || []).length;
  if (emojiCount > 4) {
    roboticPatterns.push(`Muitos emojis (${emojiCount})`);
    score -= 5;
  }

  const hasRodrigoName = /rodrigo/i.test(response);
  const createdAccount = /\[ACAO:CRIAR_CONTA_TESTE/.test(response);

  return {
    roboticPatterns,
    humanPatterns,
    score: Math.max(0, Math.min(100, score)),
    hasRodrigoName,
    createdAccount
  };
}

// ============================================================================
// EXECUTAR TESTE
// ============================================================================

async function runScenarioTest(scenario: ClientScenario): Promise<{
  success: boolean;
  score: number;
  issues: string[];
  conversationLog: string[];
  createdAccountEarly: boolean;
  introducedAsRodrigo: boolean;
}> {
  const phone = `5511${Date.now().toString().slice(-9)}`;
  const conversationLog: string[] = [];
  const issues: string[] = [];
  let totalScore = 0;
  let responseCount = 0;
  let createdAccountEarly = false;
  let introducedAsRodrigo = false;
  let messageNumber = 0;

  clearClientSession(phone);

  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 CENÁRIO: ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log('═'.repeat(70));

  for (const clientMessage of scenario.messages) {
    messageNumber++;
    
    try {
      await new Promise(r => setTimeout(r, DELAY_BETWEEN_MESSAGES));
      
      const result = await processAdminMessage(phone, clientMessage, undefined, undefined, true);
      const response = result.text || '';
      
      conversationLog.push(`👤 CLIENTE: ${clientMessage}`);
      conversationLog.push(`🤵 RODRIGO: ${response}`);

      if (VERBOSE) {
        console.log(`\n👤 CLIENTE [${messageNumber}]: ${clientMessage}`);
        console.log(`🤵 RODRIGO: ${response.substring(0, 200)}${response.length > 200 ? '...' : ''}`);
      }

      const analysis = analyzeResponse(response);
      totalScore += analysis.score;
      responseCount++;

      // Check if introduced as Rodrigo in first message
      if (messageNumber === 1 && analysis.hasRodrigoName) {
        introducedAsRodrigo = true;
      }

      // Check if created account too early (before message 4)
      if (analysis.createdAccount && messageNumber < 4) {
        createdAccountEarly = true;
        issues.push(`⚠️ Criou conta muito cedo (mensagem ${messageNumber})`);
      }

      // Log issues
      if (analysis.roboticPatterns.length > 0) {
        issues.push(`Msg ${messageNumber}: Padrões robóticos: ${analysis.roboticPatterns.join(', ')}`);
      }

    } catch (error: any) {
      issues.push(`Erro na mensagem ${messageNumber}: ${error.message}`);
      conversationLog.push(`❌ ERRO: ${error.message}`);
    }
  }

  const avgScore = responseCount > 0 ? Math.round(totalScore / responseCount) : 0;
  
  // Penalties
  if (!introducedAsRodrigo) {
    issues.push('❌ Não se apresentou como Rodrigo na primeira mensagem');
  }
  if (createdAccountEarly) {
    issues.push('❌ Criou conta antes de conversar o suficiente');
  }

  console.log(`\n📊 RESULTADO: Score ${avgScore}/100`);
  if (introducedAsRodrigo) console.log('✅ Se apresentou como Rodrigo');
  else console.log('❌ Não se apresentou como Rodrigo');
  if (!createdAccountEarly) console.log('✅ Conversou antes de criar conta');
  else console.log('❌ Criou conta cedo demais');

  return {
    success: avgScore >= 60 && !createdAccountEarly,
    score: avgScore,
    issues,
    conversationLog,
    createdAccountEarly,
    introducedAsRodrigo
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 TESTE RODRIGO HUMANIZADO - IA ADMIN vs IA CLIENTE 🧪         ║');
  console.log('║     Validando comportamento 100% humano                              ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  const results: {
    scenario: string;
    success: boolean;
    score: number;
    introducedAsRodrigo: boolean;
    createdAccountEarly: boolean;
  }[] = [];

  for (const scenario of CLIENT_SCENARIOS) {
    try {
      const result = await runScenarioTest(scenario);
      results.push({
        scenario: scenario.name,
        success: result.success,
        score: result.score,
        introducedAsRodrigo: result.introducedAsRodrigo,
        createdAccountEarly: result.createdAccountEarly
      });
      
      // Delay between scenarios
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.error(`\n❌ Erro fatal no cenário "${scenario.name}":`, error);
    }
  }

  // ============================================================================
  // RELATÓRIO FINAL
  // ============================================================================
  
  console.log('\n\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║                        📈 RELATÓRIO FINAL                            ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  console.log('\n📋 RESULTADOS POR CENÁRIO:');
  console.log('─'.repeat(70));

  let passed = 0;
  let totalScore = 0;
  let introducedCount = 0;
  let earlyAccountCount = 0;

  for (const r of results) {
    const status = r.success ? '✅' : '❌';
    const rodrigo = r.introducedAsRodrigo ? '👤' : '⚠️';
    const timing = r.createdAccountEarly ? '⏰' : '✅';
    
    console.log(`${status} ${r.scenario.padEnd(30)} | Score: ${r.score}/100 | Rodrigo: ${rodrigo} | Timing: ${timing}`);
    
    if (r.success) passed++;
    totalScore += r.score;
    if (r.introducedAsRodrigo) introducedCount++;
    if (r.createdAccountEarly) earlyAccountCount++;
  }

  const avgScore = results.length > 0 ? Math.round(totalScore / results.length) : 0;
  const passRate = results.length > 0 ? Math.round((passed / results.length) * 100) : 0;

  console.log('\n' + '═'.repeat(70));
  console.log('📊 ESTATÍSTICAS:');
  console.log(`   Cenários testados: ${results.length}`);
  console.log(`   Aprovados: ${passed}/${results.length} (${passRate}%)`);
  console.log(`   Score médio: ${avgScore}/100`);
  console.log(`   Se apresentou como Rodrigo: ${introducedCount}/${results.length}`);
  console.log(`   Criou conta cedo demais: ${earlyAccountCount}/${results.length}`);

  // Veredicto final
  console.log('\n' + '═'.repeat(70));
  
  if (passRate >= 90 && avgScore >= 75 && earlyAccountCount === 0 && introducedCount >= results.length * 0.8) {
    console.log('🎉 VEREDICTO: RODRIGO ESTÁ 100% HUMANO!');
    console.log('   ✅ Conversa naturalmente');
    console.log('   ✅ Se apresenta como Rodrigo');
    console.log('   ✅ Não cria conta cedo demais');
  } else if (passRate >= 70) {
    console.log('⚠️  VEREDICTO: QUASE LÁ - PRECISA DE AJUSTES');
    if (earlyAccountCount > 0) console.log('   ❌ Está criando conta muito cedo');
    if (introducedCount < results.length * 0.8) console.log('   ❌ Não está se apresentando como Rodrigo');
    if (avgScore < 75) console.log('   ❌ Ainda tem padrões robóticos');
  } else {
    console.log('❌ VEREDICTO: AINDA PARECE ROBÔ');
    console.log('   Necessário revisar o prompt do Admin.');
  }

  console.log('\n');
}

main().catch(console.error);
