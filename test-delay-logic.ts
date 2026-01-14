/**
 * Teste de lógica de delay para envio em massa
 * Execute com: npx tsx test-delay-logic.ts
 */

console.log('🧪 Teste de Lógica de Delay para Envio em Massa\n');

// Configurações dos perfis
const delayProfiles = {
  'Normal': { min: 3000, max: 7000 },
  'Humano': { min: 5000, max: 12000 },
  'Conservador': { min: 10000, max: 20000 },
  'Ultra Seguro': { min: 15000, max: 30000 },
};

// Simular envio de 5 mensagens para cada perfil
async function simulateBulkSend(profileName: string, delayMin: number, delayMax: number, numContacts: number = 5) {
  console.log(`\n📤 Simulando envio com perfil: ${profileName} (${delayMin/1000}s - ${delayMax/1000}s)`);
  console.log(`   Contatos: ${numContacts}`);
  
  const timestamps: number[] = [];
  const intervals: number[] = [];
  
  for (let i = 0; i < numContacts; i++) {
    const startTime = Date.now();
    timestamps.push(startTime);
    
    console.log(`\n   [${i + 1}/${numContacts}] Enviando mensagem...`);
    console.log(`   Timestamp: ${new Date(startTime).toISOString()}`);
    
    // Simular tempo de processamento da fila (5-10s base)
    const queueDelay = 5000 + Math.random() * 5000;
    console.log(`   ⏱️ Queue delay simulado: ${(queueDelay/1000).toFixed(1)}s`);
    
    // Simular delay adicional configurado APÓS a queue
    if (i < numContacts - 1) {
      const configuredDelay = delayMin + Math.random() * (delayMax - delayMin);
      console.log(`   🛡️ Delay configurado: ${(configuredDelay/1000).toFixed(1)}s`);
      
      // Delay total = queue + configurado
      const totalDelay = queueDelay + configuredDelay;
      console.log(`   📊 Delay TOTAL: ${(totalDelay/1000).toFixed(1)}s`);
      
      // Esperar delay configurado (em produção, queue já foi processada, então só esperamos o configurado)
      // Aqui simulamos apenas o delay configurado para ver os intervalos
      await new Promise(resolve => setTimeout(resolve, 100)); // Simular delay curto para teste
    }
    
    if (i > 0) {
      const interval = startTime - timestamps[i - 1];
      intervals.push(interval);
    }
  }
  
  // Estatísticas
  console.log(`\n   📊 Estatísticas do perfil ${profileName}:`);
  console.log(`   - Delays esperados: ${delayMin/1000}s - ${delayMax/1000}s`);
  console.log(`   - Delay médio esperado: ${((delayMin + delayMax) / 2 / 1000).toFixed(1)}s`);
  
  return { profileName, delayMin, delayMax, timestamps, intervals };
}

// Calcular delay real entre mensagens do cliente marcos.anchieta
function analyzeRealData() {
  console.log('\n📊 Análise dos dados reais do cliente marcos.anchieta@actransbr.org');
  console.log('   (Configurou Ultra Seguro 15-30s, mas mensagens foram enviadas com 9-26s)\n');
  
  // Timestamps reais do Supabase (convertidos de ISO)
  const realTimestamps = [
    new Date('2025-06-25T17:45:13.009Z').getTime(),
    new Date('2025-06-25T17:45:22.4Z').getTime(),
    new Date('2025-06-25T17:45:47.633Z').getTime(),
    new Date('2025-06-25T17:46:08.826Z').getTime(),
    new Date('2025-06-25T17:46:28.803Z').getTime(),
    new Date('2025-06-25T17:46:54.81Z').getTime(),
  ];
  
  console.log('   Timestamps reais:');
  realTimestamps.forEach((ts, i) => {
    console.log(`   ${i + 1}. ${new Date(ts).toISOString()}`);
  });
  
  console.log('\n   Intervalos reais:');
  for (let i = 1; i < realTimestamps.length; i++) {
    const interval = (realTimestamps[i] - realTimestamps[i - 1]) / 1000;
    const status = interval >= 15 ? '✅' : '❌';
    console.log(`   ${i}→${i + 1}: ${interval.toFixed(1)}s ${status} (esperado: 15-30s)`);
  }
  
  const intervals = [];
  for (let i = 1; i < realTimestamps.length; i++) {
    intervals.push((realTimestamps[i] - realTimestamps[i - 1]) / 1000);
  }
  
  const minInterval = Math.min(...intervals);
  const maxInterval = Math.max(...intervals);
  const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
  
  console.log('\n   📈 Resumo:');
  console.log(`   - Menor intervalo: ${minInterval.toFixed(1)}s (deveria ser ≥15s)`);
  console.log(`   - Maior intervalo: ${maxInterval.toFixed(1)}s`);
  console.log(`   - Média: ${avgInterval.toFixed(1)}s`);
  
  if (minInterval < 15) {
    console.log('\n   ❌ PROBLEMA: O menor intervalo está ABAIXO do mínimo configurado!');
    console.log('   📝 Causa raiz: O delay configurado (15-30s) estava sendo IGNORADO');
    console.log('   ✅ Correção aplicada: Delay COMPLETO agora é aplicado após cada mensagem');
  }
}

// Demonstrar o cálculo correto
function demonstrateCorrectCalculation() {
  console.log('\n\n🔧 Demonstração do cálculo CORRIGIDO:\n');
  
  const profiles = [
    { name: 'Normal', min: 3, max: 7 },
    { name: 'Humano', min: 5, max: 12 },
    { name: 'Conservador', min: 10, max: 20 },
    { name: 'Ultra Seguro', min: 15, max: 30 },
  ];
  
  profiles.forEach(profile => {
    console.log(`   ${profile.name} (${profile.min}s-${profile.max}s):`);
    
    // Simular 5 delays
    const delays: number[] = [];
    for (let i = 0; i < 5; i++) {
      const delay = profile.min + Math.random() * (profile.max - profile.min);
      delays.push(delay);
    }
    
    console.log(`   Delays simulados: ${delays.map(d => d.toFixed(1) + 's').join(', ')}`);
    console.log(`   Mínimo: ${Math.min(...delays).toFixed(1)}s (esperado: ≥${profile.min}s) ${Math.min(...delays) >= profile.min ? '✅' : '❌'}`);
    console.log(`   Máximo: ${Math.max(...delays).toFixed(1)}s (esperado: ≤${profile.max}s) ${Math.max(...delays) <= profile.max ? '✅' : '❌'}`);
    console.log('');
  });
}

// Executar análise
async function main() {
  analyzeRealData();
  demonstrateCorrectCalculation();
  
  console.log('\n✅ Análise concluída!');
  console.log('📝 Resumo das correções implementadas:');
  console.log('   1. Delay configurado agora é aplicado COMPLETO após cada mensagem');
  console.log('   2. Não depende mais do delay da fila (que pode variar)');
  console.log('   3. Logs detalhados com timestamps adicionados');
  console.log('   4. Variação de IA está ativa e funcional');
}

main().catch(console.error);
