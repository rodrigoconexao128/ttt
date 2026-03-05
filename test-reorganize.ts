/**
 * Teste do endpoint de reorganização de follow-ups
 */

import { db } from "./server/db";
import { conversations, followupConfigs, whatsappConnections } from "@shared/schema";
import { eq, and, isNotNull } from "drizzle-orm";

async function testReorganize() {
  console.log("\n🧪 === TESTE DE REORGANIZAÇÃO DE FOLLOW-UPS ===\n");

  // Pegar primeiro usuário com config ativa
  const configs = await db.query.followupConfigs.findMany({
    where: eq(followupConfigs.isEnabled, true),
    limit: 1
  });

  if (configs.length === 0) {
    console.log("❌ Nenhuma configuração de follow-up ativa encontrada");
    process.exit(1);
  }

  const config = configs[0];
  console.log("📋 Config encontrada:");
  console.log(`   - User ID: ${config.userId}`);
  console.log(`   - Horário: ${config.businessHoursStart} - ${config.businessHoursEnd}`);
  console.log(`   - Dias: ${JSON.stringify(config.businessDays)}`);
  console.log(`   - Intervalos: ${JSON.stringify(config.intervalsMinutes)}`);

  // Buscar conversas pendentes
  const pendingConversations = await db.query.conversations.findMany({
    where: and(
      eq(conversations.followupActive, true),
      isNotNull(conversations.nextFollowupAt)
    ),
    with: {
      connection: true
    }
  });

  const userConversations = pendingConversations.filter(c => c.connection?.userId === config.userId);
  
  console.log(`\n📊 Conversas do usuário com follow-up ativo: ${userConversations.length}`);

  // Verificar horário atual no Brasil
  const now = new Date();
  const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const dayOfWeek = brazilTime.getDay();
  const hours = brazilTime.getHours();
  const minutes = brazilTime.getMinutes();

  console.log(`\n🕐 Horário Brasil: ${brazilTime.toLocaleString('pt-BR')}`);
  console.log(`   - Dia da semana: ${dayOfWeek} (0=Dom, 1=Seg, ..., 6=Sáb)`);
  console.log(`   - Horário: ${hours}:${minutes.toString().padStart(2, '0')}`);

  const businessDays = config.businessDays || [1, 2, 3, 4, 5];
  const isBusinessDay = businessDays.includes(dayOfWeek);
  
  const [startHour, startMin] = (config.businessHoursStart || '09:00').split(':').map(Number);
  const [endHour, endMin] = (config.businessHoursEnd || '18:00').split(':').map(Number);
  const currentMinutes = hours * 60 + minutes;
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  
  const isBusinessHours = currentMinutes >= startMinutes && currentMinutes < endMinutes;

  console.log(`\n📍 Status do horário:`);
  console.log(`   - É dia útil configurado? ${isBusinessDay ? '✅ SIM' : '❌ NÃO'}`);
  console.log(`   - Está no horário comercial? ${isBusinessHours ? '✅ SIM' : '❌ NÃO'}`);

  if (!isBusinessDay || !isBusinessHours) {
    console.log(`\n⚠️ ATENÇÃO: Fora do horário comercial!`);
    console.log(`   Os follow-ups serão reagendados para o próximo horário comercial.`);
    
    // Calcular próximo horário comercial
    let nextDate = new Date(brazilTime);
    let daysChecked = 0;
    
    while (daysChecked < 7) {
      const checkDay = nextDate.getDay();
      if (businessDays.includes(checkDay)) {
        // Se for hoje mas já passou do horário, ou se for outro dia
        if (daysChecked > 0 || currentMinutes >= endMinutes) {
          // Próximo dia útil às 09:00
          nextDate.setHours(startHour, startMin, 0, 0);
          if (daysChecked === 0) {
            nextDate.setDate(nextDate.getDate() + 1);
          }
        } else if (currentMinutes < startMinutes) {
          // Ainda não começou o horário comercial
          nextDate.setHours(startHour, startMin, 0, 0);
        }
        break;
      }
      nextDate.setDate(nextDate.getDate() + 1);
      daysChecked++;
    }
    
    console.log(`   Próximo horário comercial: ${nextDate.toLocaleString('pt-BR')}`);
  }

  // Listar primeiras 5 conversas
  console.log(`\n📋 Primeiras 5 conversas com follow-up ativo:`);
  for (const conv of userConversations.slice(0, 5)) {
    const nextAt = conv.nextFollowupAt ? new Date(conv.nextFollowupAt).toLocaleString('pt-BR') : 'N/A';
    console.log(`   - ${conv.contactNumber}: Stage ${conv.followupStage || 0}, próximo: ${nextAt}`);
  }

  console.log("\n✅ Teste concluído! Use o botão 'Reorganizar Follow-ups' na interface para reagendar.");
  console.log("   Ou faça uma requisição POST para /api/followup/reorganize");

  process.exit(0);
}

testReorganize().catch(err => {
  console.error("❌ Erro:", err);
  process.exit(1);
});
