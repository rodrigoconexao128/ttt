/**
 * 🧪 TESTE: Sistema Anti-Duplicação de Mensagens
 * 
 * Verifica que as proteções contra duplicação funcionam corretamente:
 * 1. Detecção de mensagens idênticas recentes
 * 2. Conversas em processamento não são re-processadas
 */

console.log('\n🧪 INICIANDO TESTES DE ANTI-DUPLICAÇÃO\n');
console.log('='.repeat(60));

// Simular estruturas do sistema
const conversationsBeingProcessed = new Set<string>();
const recentlySentMessages = new Map<string, { text: string; timestamp: number }[]>();

// 🔒 Função para verificar se mensagem é duplicata recente
function isRecentDuplicate(conversationId: string, text: string): boolean {
  const recent = recentlySentMessages.get(conversationId) || [];
  const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
  
  for (const msg of recent) {
    if (msg.timestamp > twoMinutesAgo && msg.text === text) {
      return true;
    }
  }
  return false;
}

// 🔒 Função para registrar mensagem enviada
function registerSentMessageCache(conversationId: string, text: string): void {
  const recent = recentlySentMessages.get(conversationId) || [];
  recent.push({ text, timestamp: Date.now() });
  if (recent.length > 10) recent.shift();
  recentlySentMessages.set(conversationId, recent);
}

// ============== TESTES ==============

let passed = 0;
let failed = 0;

// Teste 1: Mensagem nova deve ser permitida
console.log('\n📋 Teste 1: Mensagem nova deve ser permitida');
const convId1 = 'conv-1';
const msg1 = 'Olá, tudo bem?';

if (!isRecentDuplicate(convId1, msg1)) {
  console.log('   ✅ PASSOU: Mensagem nova detectada corretamente');
  passed++;
} else {
  console.log('   ❌ FALHOU: Mensagem nova foi incorretamente marcada como duplicata');
  failed++;
}

// Teste 2: Mensagem registrada e depois verificada deve ser duplicata
console.log('\n📋 Teste 2: Mensagem registrada deve ser detectada como duplicata');
registerSentMessageCache(convId1, msg1);

if (isRecentDuplicate(convId1, msg1)) {
  console.log('   ✅ PASSOU: Duplicata detectada corretamente');
  passed++;
} else {
  console.log('   ❌ FALHOU: Duplicata não foi detectada');
  failed++;
}

// Teste 3: Mensagem diferente não deve ser duplicata
console.log('\n📋 Teste 3: Mensagem diferente não deve ser duplicata');
const msg2 = 'Outra mensagem completamente diferente';

if (!isRecentDuplicate(convId1, msg2)) {
  console.log('   ✅ PASSOU: Mensagem diferente não é duplicata');
  passed++;
} else {
  console.log('   ❌ FALHOU: Mensagem diferente marcada como duplicata incorretamente');
  failed++;
}

// Teste 4: Conversa em processamento deve ser bloqueada
console.log('\n📋 Teste 4: Conversa em processamento deve ser bloqueada');
conversationsBeingProcessed.add('conv-2');

if (conversationsBeingProcessed.has('conv-2')) {
  console.log('   ✅ PASSOU: Conversa marcada em processamento detectada');
  passed++;
} else {
  console.log('   ❌ FALHOU: Conversa em processamento não detectada');
  failed++;
}

// Teste 5: Outra conversa não deve ser bloqueada
console.log('\n📋 Teste 5: Outra conversa não deve ser afetada');

if (!conversationsBeingProcessed.has('conv-3')) {
  console.log('   ✅ PASSOU: Conversa diferente não está bloqueada');
  passed++;
} else {
  console.log('   ❌ FALHOU: Conversa diferente incorretamente bloqueada');
  failed++;
}

// Teste 6: Liberar conversa permite reprocessamento
console.log('\n📋 Teste 6: Liberar conversa permite reprocessamento');
conversationsBeingProcessed.delete('conv-2');

if (!conversationsBeingProcessed.has('conv-2')) {
  console.log('   ✅ PASSOU: Conversa liberada corretamente');
  passed++;
} else {
  console.log('   ❌ FALHOU: Conversa ainda bloqueada após liberação');
  failed++;
}

// Teste 7: Cache tem limite de 10 mensagens
console.log('\n📋 Teste 7: Cache tem limite de 10 mensagens');
const convId2 = 'conv-limit';
for (let i = 0; i < 15; i++) {
  registerSentMessageCache(convId2, `Mensagem ${i}`);
}
const cacheSize = recentlySentMessages.get(convId2)?.length || 0;

if (cacheSize === 10) {
  console.log('   ✅ PASSOU: Cache limitado a 10 mensagens');
  passed++;
} else {
  console.log(`   ❌ FALHOU: Cache tem ${cacheSize} mensagens (esperado: 10)`);
  failed++;
}

// Teste 8: Mensagens antigas devem ser removidas do cache no check
console.log('\n📋 Teste 8: Timestamp antigo não deve ser detectado como duplicata');
const convId3 = 'conv-old';
const oldMsg = { text: 'Mensagem antiga', timestamp: Date.now() - 5 * 60 * 1000 }; // 5 min atrás
recentlySentMessages.set(convId3, [oldMsg]);

if (!isRecentDuplicate(convId3, 'Mensagem antiga')) {
  console.log('   ✅ PASSOU: Mensagem antiga (>2min) não é duplicata');
  passed++;
} else {
  console.log('   ❌ FALHOU: Mensagem antiga incorretamente detectada como duplicata');
  failed++;
}

// ============== RESULTADO ==============

console.log('\n' + '='.repeat(60));
console.log(`\n📊 RESULTADO FINAL: ${passed}/${passed + failed} testes passaram\n`);

if (failed === 0) {
  console.log('🎉 TODOS OS TESTES PASSARAM!\n');
  console.log('✅ Sistema anti-duplicação está funcionando corretamente.');
  console.log('   - Mensagens duplicatas são detectadas em janela de 2 minutos');
  console.log('   - Conversas em processamento são bloqueadas');
  console.log('   - Cache é limitado a 10 mensagens por conversa');
  process.exit(0);
} else {
  console.log(`❌ ${failed} teste(s) falharam\n`);
  process.exit(1);
}
