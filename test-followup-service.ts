/**
 * Teste do Serviço de Follow-up
 * Execute com: npx tsx test-followup-service.ts
 */

import { db } from "./server/db";
import { 
  conversations, 
  userFollowupLogs, 
  followupConfigs,
  messages,
  whatsappConnections,
  users
} from "./shared/schema";
import { eq, and, lte, isNotNull, desc } from "drizzle-orm";

const DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

async function testFollowUpService() {
  console.log("🧪 ========== TESTE DO SERVIÇO DE FOLLOW-UP ==========\n");

  // 1. Verificar configurações de follow-up
  console.log("📋 1. VERIFICANDO CONFIGURAÇÕES DE FOLLOW-UP:");
  const configs = await db.query.followupConfigs.findMany();
  console.log(`   Total de configurações: ${configs.length}`);
  
  for (const cfg of configs) {
    console.log(`   - User ${cfg.userId.slice(0, 8)}...: Ativo=${cfg.isEnabled}, Horário=${cfg.businessHoursStart}-${cfg.businessHoursEnd}, Dias=${JSON.stringify(cfg.businessDays)}`);
    console.log(`     Intervalos: ${JSON.stringify(cfg.intervalsMinutes)}`);
    console.log(`     Respeita horário: ${cfg.respectBusinessHours}, Loop infinito: ${cfg.infiniteLoop}`);
  }

  // 2. Verificar conversas pendentes de follow-up
  console.log("\n📋 2. CONVERSAS COM FOLLOW-UP PENDENTE:");
  const now = new Date();
  const pendingConversations = await db.query.conversations.findMany({
    where: and(
      eq(conversations.followupActive, true),
      isNotNull(conversations.nextFollowupAt)
    ),
    with: {
      connection: true
    },
    limit: 20
  });

  console.log(`   Total pendentes: ${pendingConversations.length}`);
  
  let dueNow = 0;
  let futureScheduled = 0;
  
  for (const conv of pendingConversations) {
    const nextAt = conv.nextFollowupAt ? new Date(conv.nextFollowupAt) : null;
    const isDue = nextAt && nextAt <= now;
    const timeUntil = nextAt ? ((nextAt.getTime() - now.getTime()) / 60000).toFixed(0) : 'N/A';
    
    if (isDue) dueNow++;
    else futureScheduled++;
    
    console.log(`   - ${conv.contactName || conv.contactNumber}: Estágio=${conv.followupStage}, Próximo=${nextAt?.toLocaleString('pt-BR') || 'N/A'}`);
    console.log(`     ${isDue ? '⏰ DEVERIA SER PROCESSADO AGORA!' : `⏳ Em ${timeUntil} minutos`}`);
    
    if (conv.followupDisabledReason) {
      console.log(`     ⚠️ Motivo: ${conv.followupDisabledReason}`);
    }
  }

  console.log(`\n   📊 Resumo: ${dueNow} para processar agora, ${futureScheduled} agendados para futuro`);

  // 3. Verificar horário comercial atual
  console.log("\n📋 3. VERIFICAÇÃO DE HORÁRIO COMERCIAL:");
  const currentDay = now.getDay();
  const currentTime = now.toTimeString().slice(0, 5);
  const dayNames = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  
  console.log(`   Agora: ${dayNames[currentDay]} (${currentDay}), ${currentTime}`);
  
  for (const cfg of configs) {
    const businessDays = cfg.businessDays as number[] || [1, 2, 3, 4, 5];
    const isBusinessDay = businessDays.includes(currentDay);
    const start = String(cfg.businessHoursStart || "09:00");
    const end = String(cfg.businessHoursEnd || "18:00");
    const isBusinessHour = currentTime >= start && currentTime <= end;
    const isOpen = isBusinessDay && isBusinessHour;
    
    console.log(`   - User ${cfg.userId.slice(0, 8)}...: ${isOpen ? '✅ ABERTO' : '❌ FECHADO'}`);
    console.log(`     Dias: ${JSON.stringify(businessDays)} (hoje=${currentDay}), Horário: ${start}-${end} (agora=${currentTime})`);
  }

  // 4. Verificar logs recentes
  console.log("\n📋 4. LOGS DE FOLLOW-UP RECENTES:");
  const logs = await db.query.userFollowupLogs.findMany({
    orderBy: [desc(userFollowupLogs.executedAt)],
    limit: 10
  });

  if (logs.length === 0) {
    console.log("   ⚠️ NENHUM LOG ENCONTRADO - O serviço pode não estar processando!");
  } else {
    for (const log of logs) {
      const icon = log.status === 'sent' ? '✅' : log.status === 'failed' ? '❌' : '⏭️';
      console.log(`   ${icon} ${log.status}: ${log.contactNumber} - ${new Date(log.executedAt!).toLocaleString('pt-BR')}`);
      if (log.errorReason) {
        console.log(`      Erro: ${log.errorReason}`);
      }
      if (log.aiDecision) {
        const decision = log.aiDecision as any;
        console.log(`      IA: ${decision.action} - ${decision.reason}`);
      }
    }
  }

  // 5. Simular processamento
  console.log("\n📋 5. SIMULAÇÃO DE PROCESSAMENTO:");
  
  const toProcess = pendingConversations.filter(c => {
    const nextAt = c.nextFollowupAt ? new Date(c.nextFollowupAt) : null;
    return nextAt && nextAt <= now;
  });

  if (toProcess.length === 0) {
    console.log("   ⚠️ Nenhuma conversa pronta para processar agora.");
    
    // Encontrar a próxima que será processada
    const nextOne = pendingConversations
      .filter(c => c.nextFollowupAt)
      .sort((a, b) => new Date(a.nextFollowupAt!).getTime() - new Date(b.nextFollowupAt!).getTime())[0];
    
    if (nextOne && nextOne.nextFollowupAt) {
      const nextAt = new Date(nextOne.nextFollowupAt);
      const minutesUntil = ((nextAt.getTime() - now.getTime()) / 60000).toFixed(0);
      console.log(`   📅 Próximo processamento: ${nextOne.contactName || nextOne.contactNumber} em ${minutesUntil} minutos (${nextAt.toLocaleString('pt-BR')})`);
    }
  } else {
    console.log(`   🔥 ${toProcess.length} conversas deveriam ser processadas AGORA!`);
    for (const conv of toProcess.slice(0, 5)) {
      console.log(`   - ${conv.contactName || conv.contactNumber} (${conv.contactNumber})`);
    }
  }

  // 6. Testar cálculo de próximo horário comercial
  console.log("\n📋 6. TESTE DE CÁLCULO DE PRÓXIMO HORÁRIO COMERCIAL:");
  
  function getNextBusinessTime(config: any): Date {
    const now = new Date();
    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    const start = String(config.businessHoursStart || "09:00");
    const [startHour, startMin] = start.split(':').map(Number);

    let next = new Date(now);
    next.setHours(startHour, startMin, 0, 0);

    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    while (!businessDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  for (const cfg of configs.slice(0, 3)) {
    const nextBiz = getNextBusinessTime(cfg);
    console.log(`   - User ${cfg.userId.slice(0, 8)}...: Próximo horário comercial = ${nextBiz.toLocaleString('pt-BR')} (${dayNames[nextBiz.getDay()]})`);
  }

  // 7. Diagnóstico final
  console.log("\n========== 📊 DIAGNÓSTICO FINAL ==========\n");

  const issues: string[] = [];
  const ok: string[] = [];

  if (configs.length === 0) {
    issues.push("❌ Nenhuma configuração de follow-up encontrada");
  } else {
    ok.push(`✅ ${configs.length} configurações de follow-up encontradas`);
  }

  if (pendingConversations.length === 0) {
    issues.push("❌ Nenhuma conversa com follow-up pendente");
  } else {
    ok.push(`✅ ${pendingConversations.length} conversas com follow-up pendente`);
  }

  if (logs.length === 0) {
    issues.push("❌ Nenhum log de follow-up - o serviço pode não estar rodando");
  } else {
    ok.push(`✅ ${logs.length} logs de follow-up encontrados`);
    
    const failedLogs = logs.filter(l => l.status === 'failed');
    if (failedLogs.length > 0) {
      issues.push(`⚠️ ${failedLogs.length} follow-ups falharam recentemente`);
      for (const fl of failedLogs) {
        issues.push(`   - ${fl.contactNumber}: ${fl.errorReason}`);
      }
    }
  }

  if (toProcess.length > 0) {
    issues.push(`⚠️ ${toProcess.length} conversas deveriam ser processadas agora mas não estão`);
  } else {
    ok.push("✅ Todas as conversas estão com agendamento correto");
  }

  // Verificar se é horário comercial para algum usuário
  const anyOpen = configs.some(cfg => {
    const businessDays = cfg.businessDays as number[] || [1, 2, 3, 4, 5];
    const isBusinessDay = businessDays.includes(currentDay);
    const start = String(cfg.businessHoursStart || "09:00");
    const end = String(cfg.businessHoursEnd || "18:00");
    const isBusinessHour = currentTime >= start && currentTime <= end;
    return isBusinessDay && isBusinessHour;
  });

  if (!anyOpen) {
    issues.push(`⚠️ Fora do horário comercial para TODOS os usuários - follow-ups serão adiados`);
  } else {
    ok.push("✅ Dentro do horário comercial para pelo menos 1 usuário");
  }

  console.log("🟢 CORRETO:");
  ok.forEach(o => console.log(`   ${o}`));
  
  console.log("\n🔴 PROBLEMAS:");
  if (issues.length === 0) {
    console.log("   Nenhum problema encontrado!");
  } else {
    issues.forEach(i => console.log(`   ${i}`));
  }

  console.log("\n========== FIM DO TESTE ==========\n");
  
  process.exit(0);
}

testFollowUpService().catch(err => {
  console.error("Erro no teste:", err);
  process.exit(1);
});
