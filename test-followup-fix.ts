/**
 * Teste das correções do sistema de Follow-up
 * 
 * Este script testa:
 * 1. Cache anti-duplicação de mensagens
 * 2. Detecção de similaridade
 * 3. Bloqueio de frases repetidas
 */

console.log("\n🧪 ===============================================");
console.log("🧪 TESTE DE CORREÇÕES DO FOLLOW-UP");
console.log("🧪 ===============================================\n");

// ===== TESTE 1: Função de hash =====
console.log("📋 TESTE 1: Função generateMessageHash()");
console.log("─".repeat(50));

function generateMessageHash(message: string): string {
  const normalized = message.toLowerCase()
    .replace(/[^a-záéíóúàèìòùâêîôûãõ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash;
  }
  return hash.toString(16);
}

const msg1 = "Raphael, entendi! Vamos resolver isso juntos.";
const msg2 = "Raphael, entendi! Vamos resolver isso juntos.";
const msg3 = "Olá Raphael! Que bom falar com você!";

console.log(`Mensagem 1: "${msg1}"`);
console.log(`Hash 1: ${generateMessageHash(msg1)}`);
console.log(`Mensagem 2: "${msg2}"`);
console.log(`Hash 2: ${generateMessageHash(msg2)}`);
console.log(`Mensagem 3: "${msg3}"`);
console.log(`Hash 3: ${generateMessageHash(msg3)}`);
console.log(`\n✅ Hash iguais (msg1 = msg2): ${generateMessageHash(msg1) === generateMessageHash(msg2)}`);
console.log(`✅ Hash diferentes (msg1 ≠ msg3): ${generateMessageHash(msg1) !== generateMessageHash(msg3)}`);

// ===== TESTE 2: Similaridade =====
console.log("\n\n📋 TESTE 2: Cálculo de similaridade");
console.log("─".repeat(50));

function calculateTextSimilarity(text1: string, text2: string): number {
  const words1 = text1.toLowerCase().split(/\s+/);
  const words2 = text2.toLowerCase().split(/\s+/);
  
  if (words1.length === 0 || words2.length === 0) return 0;
  
  let matches = 0;
  for (const word of words1) {
    if (word.length > 3 && words2.includes(word)) matches++;
  }
  
  return matches / Math.max(words1.length, words2.length);
}

const testCases = [
  {
    msg1: "Raphael, entendi! Vamos resolver isso. Para enviar anexos, você precisa configurar a IA.",
    msg2: "Raphael, entendi! Vamos resolver isso. Para enviar anexos, você precisa configurar a IA.",
    expected: "Alta (>60%)"
  },
  {
    msg1: "Raphael, entendi! Vamos resolver isso juntos.",
    msg2: "Que ótimo, Raphael! Fico feliz em saber que conseguiu!",
    expected: "Baixa (<30%)"
  },
  {
    msg1: "Raphael, ótimo! Se precisar de ajuda com a aquisição, é só chamar.",
    msg2: "Raphael, ótimo! Se precisar de ajuda com a aquisição ou qualquer outra coisa, é só chamar.",
    expected: "Alta (>60%)"
  }
];

for (const tc of testCases) {
  const sim = calculateTextSimilarity(tc.msg1, tc.msg2);
  const blocked = sim > 0.6;
  console.log(`\nMsg A: "${tc.msg1.substring(0, 50)}..."`);
  console.log(`Msg B: "${tc.msg2.substring(0, 50)}..."`);
  console.log(`Similaridade: ${(sim * 100).toFixed(1)}% | Esperado: ${tc.expected}`);
  console.log(`Bloqueado (>60%): ${blocked ? '🚫 SIM' : '✅ NÃO'}`);
}

// ===== TESTE 3: Detecção de frases repetidas =====
console.log("\n\n📋 TESTE 3: Detecção de frases-chave repetidas");
console.log("─".repeat(50));

const keyPhrases = ['entendi', 'vamos resolver', 'passo a passo', 'fico feliz', 'estou à disposição'];

const ourLastMessages = [
  "Raphael, entendi! Vamos resolver isso juntos.",
  "Fico feliz em ajudar!",
  "Estou à disposição para qualquer dúvida."
];

const newMessages = [
  "Raphael, entendi! Posso te ajudar com isso.",
  "Olá! Como posso ajudar hoje?",
  "Vamos resolver isso de outra forma."
];

for (const newMsg of newMessages) {
  console.log(`\n🆕 Nova mensagem: "${newMsg}"`);
  const msgLower = newMsg.toLowerCase();
  let blocked = false;
  let blockedPhrase = "";
  
  for (const phrase of keyPhrases) {
    const usedBefore = ourLastMessages.some(prev => prev?.toLowerCase().includes(phrase));
    if (usedBefore && msgLower.includes(phrase)) {
      blocked = true;
      blockedPhrase = phrase;
      break;
    }
  }
  
  if (blocked) {
    console.log(`   🚫 BLOQUEADO - Frase "${blockedPhrase}" já usada antes`);
  } else {
    console.log(`   ✅ PERMITIDO - Nenhuma frase repetida`);
  }
}

// ===== TESTE 4: Verificação de estrutura =====
console.log("\n\n📋 TESTE 4: Verificação de estrutura repetitiva");
console.log("─".repeat(50));

function checkSameStructure(message: string, ourLastMessages: string[]): boolean {
  return ourLastMessages.some(prev => {
    if (!prev) return false;
    const msgStart = message.substring(0, 30).toLowerCase();
    const msgEnd = message.substring(Math.max(0, message.length - 30)).toLowerCase();
    const prevStart = prev.substring(0, 30).toLowerCase();
    const prevEnd = prev.substring(Math.max(0, prev.length - 30)).toLowerCase();
    
    const startSame = msgStart === prevStart && msgStart.length > 12;
    const endSame = msgEnd === prevEnd && msgEnd.length > 12;
    
    return startSame || endSame;
  });
}

const structureTests = [
  {
    newMsg: "Raphael, entendi! Vamos resolver de outra maneira.",
    prev: ["Raphael, entendi! Vamos resolver isso juntos."],
    expected: "BLOQUEADO (início igual)"
  },
  {
    newMsg: "Olá! Se precisar de ajuda, é só chamar. Estou à disposição!",
    prev: ["Perfeito! Se precisar de ajuda, é só chamar. Estou à disposição!"],
    expected: "BLOQUEADO (fim igual)"
  },
  {
    newMsg: "Ótima escolha! Que bom que gostou do plano.",
    prev: ["Raphael, entendi! Vamos resolver isso juntos."],
    expected: "PERMITIDO"
  }
];

for (const test of structureTests) {
  const blocked = checkSameStructure(test.newMsg, test.prev);
  console.log(`\n🆕 Nova: "${test.newMsg.substring(0, 40)}..."`);
  console.log(`   Anterior: "${test.prev[0].substring(0, 40)}..."`);
  console.log(`   Resultado: ${blocked ? '🚫 BLOQUEADO' : '✅ PERMITIDO'} | Esperado: ${test.expected}`);
}

// ===== RESUMO =====
console.log("\n\n📊 RESUMO DAS CORREÇÕES IMPLEMENTADAS");
console.log("═".repeat(50));
console.log("✅ 1. Cache anti-duplicação com hash de mensagens");
console.log("✅ 2. Lock de processamento por conversa");
console.log("✅ 3. Threshold de similaridade aumentado para 60%");
console.log("✅ 4. Verificação de estrutura repetitiva");
console.log("✅ 5. Lista de frases-chave proibidas se repetidas");
console.log("✅ 6. Prompt reescrito explicando conceito de follow-up");
console.log("✅ 7. Verificação: cliente foi último a falar = não é follow-up");
console.log("\n🎯 O sistema agora deve:");
console.log("   - Evitar mensagens duplicadas ou muito similares");
console.log("   - Não enviar follow-up se cliente acabou de responder");
console.log("   - Gerar mensagens mais variadas e contextualizadas");
console.log("   - Continuar a conversa de onde parou\n");
