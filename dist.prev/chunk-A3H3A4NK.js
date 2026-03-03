import {
  sendAdminNotification
} from "./chunk-3VVPE4OQ.js";
import {
  callGroq
} from "./chunk-FYBACEOC.js";
import {
  db
} from "./chunk-HIRAYR4B.js";

// server/notificationSchedulerService.ts
import crypto from "crypto";
import { sql } from "drizzle-orm";
function sanitizeAIVariation(aiOutput, replacements) {
  let result = aiOutput.trim();
  const separators = [
    /\n\s*---\s*\n/,
    // --- separador
    /\n\s*\*?\(?[Oo]u,?\s/,
    // "Ou, se preferir..."
    /\n\s*\*?\(?[Oo]pção\s*\d/i,
    // "Opção 2:"
    /\n\s*\*?Versão\s*\d/i,
    // "Versão 2:"
    /\n\s*\*?Alternativa/i,
    // "Alternativa:"
    /\n\s*\*?Se preferir/i,
    // "Se preferir um tom..."
    /\n\s*\*?Outra opção/i,
    // "Outra opção:"
    /\n\s*\(\s*Ou/
    // "(Ou, se preferir"
  ];
  for (const sep of separators) {
    const match = result.match(sep);
    if (match && match.index && match.index > 30) {
      result = result.substring(0, match.index).trim();
      console.log(`[AI SANITIZE] Removida varia\xE7\xE3o extra (separador: ${sep.source})`);
      break;
    }
  }
  for (const [variable, value] of Object.entries(replacements)) {
    result = result.replace(new RegExp(variable.replace(/[{}]/g, "\\$&"), "g"), value);
  }
  if (result.startsWith('"') && result.endsWith('"') || result.startsWith("'") && result.endsWith("'")) {
    result = result.slice(1, -1).trim();
  }
  result = result.replace(/^(Aqui está[^:]*:|Mensagem[^:]*:|Segue[^:]*:)\s*/i, "").trim();
  return result;
}
var CHECK_INTERVAL_MS = 5 * 60 * 1e3;
var DAILY_NOTIFICATION_LIMIT = 500;
var schedulerInterval = null;
var dailyCounters = /* @__PURE__ */ new Map();
function startNotificationScheduler() {
  if (schedulerInterval) {
    console.log("\u{1F514} [NOTIFICATION SCHEDULER] J\xE1 est\xE1 rodando");
    return;
  }
  console.log("\u{1F514} [NOTIFICATION SCHEDULER] Iniciando...");
  processNotifications();
  schedulerInterval = setInterval(processNotifications, CHECK_INTERVAL_MS);
}
function stopNotificationScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log("\u{1F514} [NOTIFICATION SCHEDULER] Parado");
  }
}
var lastAutoReorganize = 0;
var AUTO_REORGANIZE_INTERVAL_MS = 2 * 60 * 60 * 1e3;
async function processNotifications() {
  try {
    console.log("\u{1F514} [NOTIFICATION SCHEDULER] Verificando notifica\xE7\xF5es...");
    try {
      const stuckResult = await db.execute(sql`
        UPDATE scheduled_notifications
        SET status = 'pending', updated_at = NOW(), retry_count = COALESCE(retry_count, 0) + 1
        WHERE status = 'processing'
          AND updated_at < NOW() - INTERVAL '30 minutes'
        RETURNING id, recipient_name, notification_type
      `);
      const stuckRows = stuckResult.rows;
      if (stuckRows.length > 0) {
        console.log(`\u{1F514} [RECOVERY] \u267B\uFE0F Resetou ${stuckRows.length} notifica\xE7\xF5es stuck em 'processing' \u2192 'pending'`);
        for (const row of stuckRows) {
          console.log(`   \u21B3 ${row.recipient_name} (${row.notification_type}) ID: ${row.id}`);
        }
      }
    } catch (recoveryErr) {
      console.error("\u{1F514} [RECOVERY] Erro ao resetar stuck:", recoveryErr);
    }
    try {
      const disconnectedFailedResult = await db.execute(sql`
        UPDATE scheduled_notifications
        SET status = 'pending', 
            updated_at = NOW(), 
            error_message = NULL,
            retry_count = COALESCE(retry_count, 0) + 1,
            scheduled_for = NOW() + (floor(random() * 30) || ' minutes')::interval
        WHERE status = 'failed'
          AND error_message LIKE '%WhatsApp%not connected%'
          AND scheduled_for >= NOW() - INTERVAL '48 hours'
          AND COALESCE(retry_count, 0) < 3
        RETURNING id, recipient_name, notification_type
      `);
      const recoveredRows = disconnectedFailedResult.rows;
      if (recoveredRows.length > 0) {
        console.log(`\u{1F514} [RECOVERY] \u267B\uFE0F Reagendou ${recoveredRows.length} notifica\xE7\xF5es que falharam por WhatsApp desconectado`);
      }
    } catch (recoveryErr) {
      console.error("\u{1F514} [RECOVERY] Erro ao recuperar falhas por desconex\xE3o:", recoveryErr);
    }
    cleanOldCounters();
    await processExpiredSubscriptions();
    const now = Date.now();
    if (now - lastAutoReorganize >= AUTO_REORGANIZE_INTERVAL_MS) {
      await autoReorganizeAllAdmins();
      lastAutoReorganize = now;
    }
    await processScheduledNotificationsQueue();
    const configs = await getActiveNotificationConfigs();
    console.log(`\u{1F514} [NOTIFICATION SCHEDULER] Processamento conclu\xEDdo (${configs.length} admins, usando fila com delays)`);
  } catch (error) {
    console.error("\u{1F514} [NOTIFICATION SCHEDULER] Erro:", error);
  }
}
async function autoReorganizeAllAdmins() {
  try {
    console.log("\u{1F504} [AUTO-REORGANIZE] Iniciando reorganiza\xE7\xE3o autom\xE1tica...");
    const adminResult = await db.execute(sql`
      SELECT DISTINCT admin_id FROM admin_notification_config
      WHERE payment_reminder_enabled = true
         OR overdue_reminder_enabled = true
         OR periodic_checkin_enabled = true
         OR disconnected_alert_enabled = true
    `);
    const adminIds = adminResult.rows.map((r) => r.admin_id);
    if (adminIds.length === 0) {
      console.log("\u{1F504} [AUTO-REORGANIZE] Nenhum admin com notifica\xE7\xF5es habilitadas");
      return;
    }
    for (const adminId of adminIds) {
      try {
        await autoReorganizeForAdmin(adminId);
      } catch (err) {
        console.error(`\u{1F504} [AUTO-REORGANIZE] Erro para admin ${adminId}:`, err);
      }
    }
    console.log(`\u{1F504} [AUTO-REORGANIZE] Conclu\xEDdo para ${adminIds.length} admin(s)`);
  } catch (error) {
    console.error("\u{1F504} [AUTO-REORGANIZE] Erro geral:", error);
  }
}
async function autoReorganizeForAdmin(adminId) {
  const now = /* @__PURE__ */ new Date();
  const configResult = await db.execute(sql`
    SELECT * FROM admin_notification_config WHERE admin_id = ${adminId}
  `);
  const rawConfig = configResult.rows[0];
  if (!rawConfig) return;
  const config = {
    paymentReminderEnabled: rawConfig.payment_reminder_enabled ?? true,
    paymentReminderDaysBefore: rawConfig.payment_reminder_days_before || [7, 3, 1],
    paymentReminderMessageTemplate: rawConfig.payment_reminder_message_template || "Ol\xE1 {cliente_nome}! Seu pagamento vence em {dias_restantes} dias. Vencimento: {data_vencimento}. Valor: R$ {valor}",
    paymentReminderAiEnabled: rawConfig.payment_reminder_ai_enabled ?? true,
    paymentReminderAiPrompt: rawConfig.payment_reminder_ai_prompt || "Reescreva de forma natural e personalizada.",
    overdueReminderEnabled: rawConfig.overdue_reminder_enabled ?? true,
    overdueReminderDaysAfter: rawConfig.overdue_reminder_days_after || [1, 3, 7, 14],
    overdueReminderMessageTemplate: rawConfig.overdue_reminder_message_template || "Ol\xE1 {cliente_nome}! Seu pagamento est\xE1 em atraso h\xE1 {dias_atraso} dias. Venceu em: {data_vencimento}. Valor: R$ {valor}",
    overdueReminderAiEnabled: rawConfig.overdue_reminder_ai_enabled ?? true,
    overdueReminderAiPrompt: rawConfig.overdue_reminder_ai_prompt || "Reescreva de forma educada e emp\xE1tica.",
    periodicCheckinEnabled: rawConfig.periodic_checkin_enabled ?? true,
    periodicCheckinMinDays: rawConfig.periodic_checkin_min_days || 7,
    periodicCheckinMaxDays: rawConfig.periodic_checkin_max_days || 15,
    periodicCheckinMessageTemplate: rawConfig.periodic_checkin_message_template || "Ol\xE1 {cliente_nome}! Passando para ver se est\xE1 tudo bem!",
    checkinAiEnabled: rawConfig.checkin_ai_enabled ?? true,
    checkinAiPrompt: rawConfig.checkin_ai_prompt || "Reescreva de forma calorosa e natural.",
    disconnectedAlertEnabled: rawConfig.disconnected_alert_enabled ?? true,
    disconnectedAlertHours: rawConfig.disconnected_alert_hours || 2,
    disconnectedAlertMessageTemplate: rawConfig.disconnected_alert_message_template || "Ol\xE1 {cliente_nome}! Notamos que seu WhatsApp est\xE1 desconectado.",
    disconnectedAiEnabled: rawConfig.disconnected_ai_enabled ?? true,
    disconnectedAiPrompt: rawConfig.disconnected_ai_prompt || "Reescreva de forma prestativa.",
    aiVariationPrompt: rawConfig.ai_variation_prompt || "",
    businessHoursStart: rawConfig.business_hours_start || "09:00",
    businessHoursEnd: rawConfig.business_hours_end || "18:00",
    businessDays: rawConfig.business_days || [1, 2, 3, 4, 5],
    respectBusinessHours: rawConfig.respect_business_hours ?? true
  };
  const businessDays = config.businessDays || [1, 2, 3, 4, 5];
  const excludedDays = [0, 1, 2, 3, 4, 5, 6].filter((d) => !businessDays.includes(d));
  const hasExcludedDays = excludedDays.length > 0;
  try {
    const staleResult = await db.execute(sql`
      UPDATE scheduled_notifications
      SET scheduled_for = (
        CASE 
          WHEN ${hasExcludedDays} AND EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = ANY(${excludedDays}::int[])
            THEN (DATE_TRUNC('day', NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '1 day' * 
                  CASE WHEN EXTRACT(DOW FROM NOW() AT TIME ZONE 'America/Sao_Paulo') = 6 THEN 2 ELSE 1 END
                 ) + (${config.businessHoursStart || "09:00"})::time + (floor(random() * 120) || ' minutes')::interval
          ELSE (NOW() AT TIME ZONE 'America/Sao_Paulo') + INTERVAL '5 minutes' + (floor(random() * 30) || ' minutes')::interval
        END
      ) AT TIME ZONE 'America/Sao_Paulo',
      updated_at = NOW(),
      retry_count = COALESCE(retry_count, 0) + 1
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW() - INTERVAL '2 hours'
        AND COALESCE(retry_count, 0) < 5
      RETURNING id, notification_type, recipient_name
    `);
    const rescheduled = staleResult.rows;
    if (rescheduled.length > 0) {
      console.log(`\u{1F504} [AUTO-REORGANIZE] \u267B\uFE0F Reagendou ${rescheduled.length} notifica\xE7\xF5es atrasadas (antes seriam deletadas)`);
    }
    await db.execute(sql`
      DELETE FROM scheduled_notifications
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW() - INTERVAL '2 hours'
        AND COALESCE(retry_count, 0) >= 5
    `);
  } catch (rescheduleErr) {
    console.error("\u{1F504} [AUTO-REORGANIZE] Erro ao reagendar atrasados:", rescheduleErr);
    await db.execute(sql`
      DELETE FROM scheduled_notifications
      WHERE admin_id = ${adminId}
        AND status = 'pending'
        AND scheduled_for < NOW()
    `);
  }
  const sentLogsResult = await db.execute(sql`
    SELECT user_id, notification_type,
           (metadata->>'daysBefore')::int as days_before,
           (metadata->>'daysAfter')::int as days_after
    FROM admin_notification_logs
    WHERE admin_id = ${adminId}
    AND created_at > NOW() - INTERVAL '30 days'
  `);
  const sentLogs = sentLogsResult.rows || [];
  const existingResult = await db.execute(sql`
    SELECT user_id, notification_type,
           (metadata->>'daysBefore')::int as days_before,
           (metadata->>'daysAfter')::int as days_after
    FROM scheduled_notifications
    WHERE admin_id = ${adminId}
    AND status = 'pending'
  `);
  const existingScheduled = existingResult.rows || [];
  const alreadySentOrScheduled = (userId, type, daysBefore, daysAfter) => {
    const wasSent = sentLogs.some(
      (log) => log.user_id === userId && log.notification_type === type && (daysBefore === void 0 || log.days_before === daysBefore) && (daysAfter === void 0 || log.days_after === daysAfter)
    );
    const isScheduled = existingScheduled.some(
      (s) => s.user_id === userId && s.notification_type === type && (daysBefore === void 0 || s.days_before === daysBefore) && (daysAfter === void 0 || s.days_after === daysAfter)
    );
    return wasSent || isScheduled;
  };
  const usersResult = await db.execute(sql`
    SELECT 
      u.id, u.phone, u.name,
      s.id as sub_id, s.status as sub_status, 
      s.data_fim, s.data_inicio, s.next_payment_date as next_payment_date,
      s.plan_id,
      p.valor as plan_valor, p.nome as plan_nome, p.frequencia_dias as frequencia_dias,
      COALESCE(wc.is_connected, false) as whatsapp_connected,
      wc.updated_at as connection_updated_at
    FROM users u
    LEFT JOIN LATERAL (
      SELECT * FROM subscriptions sub 
      WHERE sub.user_id = u.id AND sub.status IN ('active', 'pending', 'expired')
      ORDER BY sub.created_at DESC LIMIT 1
    ) s ON true
    LEFT JOIN plans p ON s.plan_id = p.id
    LEFT JOIN LATERAL (
      SELECT c.is_connected, c.updated_at FROM whatsapp_connections c 
      WHERE c.user_id = u.id ORDER BY c.created_at DESC LIMIT 1
    ) wc ON true
    WHERE u.id != ${adminId}
    AND u.id NOT IN (
      SELECT uu.id FROM users uu 
      JOIN admins a ON a.email = uu.email 
      WHERE a.id = ${adminId}
    )
    AND u.role IS DISTINCT FROM 'owner'
    AND u.phone IS NOT NULL
    AND u.phone != ''
  `);
  const users = usersResult.rows;
  const scheduledItems = [];
  for (const user of users) {
    if (!user.phone) continue;
    let dueDate = user.next_payment_date || user.data_fim;
    if (!dueDate && user.data_inicio && user.frequencia_dias) {
      const startDate = new Date(user.data_inicio);
      const calculatedDue = new Date(startDate);
      calculatedDue.setDate(calculatedDue.getDate() + (user.frequencia_dias || 30));
      dueDate = calculatedDue.toISOString();
    }
    const planValor = user.plan_valor || "0";
    const hasSubscription = user.sub_id && (user.sub_status === "active" || user.sub_status === "pending");
    const hasSubscriptionForOverdue = user.sub_id && (user.sub_status === "active" || user.sub_status === "pending" || user.sub_status === "expired");
    if (config.paymentReminderEnabled && hasSubscription && dueDate) {
      const dueDateObj = new Date(dueDate);
      const daysUntilDue = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1e3 * 60 * 60 * 24));
      for (const daysBefore of config.paymentReminderDaysBefore) {
        if (daysUntilDue > 0 && daysUntilDue <= daysBefore + 7) {
          if (alreadySentOrScheduled(user.id, "payment_reminder", daysBefore)) continue;
          const scheduleDate = new Date(dueDateObj);
          scheduleDate.setDate(scheduleDate.getDate() - daysBefore);
          if (scheduleDate <= now) {
            scheduleDate.setTime(now.getTime());
            scheduleDate.setDate(scheduleDate.getDate() + 1);
          }
          if (config.respectBusinessHours) {
            const [startHour] = config.businessHoursStart.split(":").map(Number);
            scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
          }
          scheduledItems.push({
            admin_id: adminId,
            user_id: user.id,
            notification_type: "payment_reminder",
            recipient_phone: user.phone,
            recipient_name: user.name || "Cliente",
            message_template: config.paymentReminderMessageTemplate,
            ai_prompt: config.paymentReminderAiPrompt || config.aiVariationPrompt,
            scheduled_for: scheduleDate.toISOString(),
            ai_enabled: config.paymentReminderAiEnabled,
            metadata: JSON.stringify({ daysBefore, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || "Plano" })
          });
        }
      }
    }
    if (config.overdueReminderEnabled && hasSubscriptionForOverdue && dueDate) {
      const dueDateObj = new Date(dueDate);
      const daysOverdue = Math.ceil((now.getTime() - dueDateObj.getTime()) / (1e3 * 60 * 60 * 24));
      if (daysOverdue > 0) {
        for (const daysAfter of config.overdueReminderDaysAfter) {
          if (daysOverdue >= daysAfter && daysOverdue < daysAfter + 7) {
            if (alreadySentOrScheduled(user.id, "overdue_reminder", void 0, daysAfter)) continue;
            const scheduleDate = /* @__PURE__ */ new Date();
            if (config.respectBusinessHours) {
              const [startHour] = config.businessHoursStart.split(":").map(Number);
              scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);
            }
            if (scheduleDate <= now) scheduleDate.setDate(scheduleDate.getDate() + 1);
            scheduledItems.push({
              admin_id: adminId,
              user_id: user.id,
              notification_type: "overdue_reminder",
              recipient_phone: user.phone,
              recipient_name: user.name || "Cliente",
              message_template: config.overdueReminderMessageTemplate,
              ai_prompt: config.overdueReminderAiPrompt || config.aiVariationPrompt,
              scheduled_for: scheduleDate.toISOString(),
              ai_enabled: config.overdueReminderAiEnabled,
              metadata: JSON.stringify({ daysAfter, daysOverdue, dueDate: dueDateObj.toISOString(), valor: planValor, planName: user.plan_nome || "Plano" })
            });
          }
        }
      }
    }
    if (config.periodicCheckinEnabled && hasSubscription) {
      if (!alreadySentOrScheduled(user.id, "checkin")) {
        const minDays = config.periodicCheckinMinDays;
        const maxDays = config.periodicCheckinMaxDays;
        const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
        const scheduleDate = /* @__PURE__ */ new Date();
        scheduleDate.setDate(scheduleDate.getDate() + randomDays);
        if (config.respectBusinessHours) {
          const [startHour] = config.businessHoursStart.split(":").map(Number);
          scheduleDate.setHours(startHour + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0);
        }
        scheduledItems.push({
          admin_id: adminId,
          user_id: user.id,
          notification_type: "checkin",
          recipient_phone: user.phone,
          recipient_name: user.name || "Cliente",
          message_template: config.periodicCheckinMessageTemplate,
          ai_prompt: config.checkinAiPrompt || config.aiVariationPrompt,
          scheduled_for: scheduleDate.toISOString(),
          ai_enabled: config.checkinAiEnabled,
          metadata: JSON.stringify({ minDays, maxDays, randomDays })
        });
      }
    }
    if (config.disconnectedAlertEnabled && hasSubscription && !user.whatsapp_connected) {
      if (!alreadySentOrScheduled(user.id, "disconnected")) {
        const scheduleDate = /* @__PURE__ */ new Date();
        scheduleDate.setHours(scheduleDate.getHours() + config.disconnectedAlertHours);
        scheduledItems.push({
          admin_id: adminId,
          user_id: user.id,
          notification_type: "disconnected",
          recipient_phone: user.phone,
          recipient_name: user.name || "Cliente",
          message_template: config.disconnectedAlertMessageTemplate,
          ai_prompt: config.disconnectedAiPrompt || config.aiVariationPrompt,
          scheduled_for: scheduleDate.toISOString(),
          ai_enabled: config.disconnectedAiEnabled,
          metadata: JSON.stringify({ disconnectedSince: user.connection_updated_at })
        });
      }
    }
  }
  if (scheduledItems.length > 0) {
    for (const item of scheduledItems) {
      try {
        await db.execute(sql`
          INSERT INTO scheduled_notifications (
            admin_id, user_id, notification_type, recipient_phone, recipient_name,
            message_template, ai_prompt, scheduled_for, ai_enabled, metadata, status
          ) VALUES (
            ${item.admin_id}, ${item.user_id}, ${item.notification_type},
            ${item.recipient_phone}, ${item.recipient_name}, ${item.message_template},
            ${item.ai_prompt}, ${item.scheduled_for}::timestamp, ${item.ai_enabled},
            ${item.metadata}::jsonb, 'pending'
          )
          ON CONFLICT DO NOTHING
        `);
      } catch (insertErr) {
      }
    }
    console.log(`\u{1F504} [AUTO-REORGANIZE] Admin ${adminId}: ${scheduledItems.length} notifica\xE7\xF5es agendadas automaticamente`);
  } else {
    console.log(`\u{1F504} [AUTO-REORGANIZE] Admin ${adminId}: nenhuma nova notifica\xE7\xE3o para agendar`);
  }
}
var isQueueProcessing = false;
async function processScheduledNotificationsQueue() {
  if (isQueueProcessing) {
    console.log("\u{1F4CB} [QUEUE SCHEDULER] \u23F3 J\xE1 existe processamento em andamento, ignorando...");
    return;
  }
  isQueueProcessing = true;
  try {
    console.log("\u{1F4CB} [QUEUE SCHEDULER] Buscando notifica\xE7\xF5es pendentes...");
    const claimResult = await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM scheduled_notifications
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    const claimedIds = claimResult.rows.map((r) => r.id);
    if (claimedIds.length === 0) {
      console.log("\u{1F4CB} [QUEUE SCHEDULER] Nenhuma notifica\xE7\xE3o pendente para processar");
      return;
    }
    console.log(`\u{1F4CB} [QUEUE SCHEDULER] Reivindicou ${claimedIds.length} notifica\xE7\xF5es para processamento`);
    const idsArrayStr = `'{${claimedIds.join(",")}}'`;
    const pendingResult = await db.execute(sql`
      SELECT sn.*, anc.admin_id as config_admin_id,
             anc.respect_business_hours,
             anc.business_hours_start,
             anc.business_hours_end,
             anc.business_days,
             anc.ai_variation_enabled,
             anc.ai_variation_prompt,
             anc.broadcast_min_interval_seconds,
             anc.broadcast_max_interval_seconds
      FROM scheduled_notifications sn
      LEFT JOIN admin_notification_config anc ON anc.admin_id = sn.admin_id
      WHERE sn.id = ANY(${sql.raw(idsArrayStr)}::text[])
      ORDER BY sn.scheduled_for ASC
    `);
    const pendingNotifications = pendingResult.rows;
    const adminGroups = /* @__PURE__ */ new Map();
    for (const notification of pendingNotifications) {
      const adminId = notification.admin_id;
      if (!adminGroups.has(adminId)) {
        adminGroups.set(adminId, []);
      }
      adminGroups.get(adminId).push(notification);
    }
    for (const [adminId, notifications] of adminGroups) {
      await processAdminScheduledQueue(adminId, notifications);
    }
    const revertIdsArrayStr = `'{${claimedIds.join(",")}}'`;
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE id = ANY(${sql.raw(revertIdsArrayStr)}::text[])
        AND status = 'processing'
    `);
  } catch (error) {
    console.error("\u{1F4CB} [QUEUE SCHEDULER] Erro ao processar fila:", error);
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
    `).catch((e) => console.error("Erro ao reverter status:", e));
  } finally {
    isQueueProcessing = false;
  }
}
async function processAdminScheduledQueue(adminId, notifications) {
  try {
    const connectionResult = await db.execute(sql`
      SELECT * FROM admin_whatsapp_connection WHERE admin_id = ${adminId} AND is_connected = true
    `);
    if (!connectionResult.rows?.length) {
      console.log(`\u26A0\uFE0F [${adminId}] WhatsApp desconectado - adiando ${notifications.length} notifica\xE7\xF5es`);
      return;
    }
    const config = notifications[0];
    if (config?.respect_business_hours) {
      const businessConfig = {
        business_hours_start: config.business_hours_start,
        business_hours_end: config.business_hours_end,
        business_days: config.business_days
      };
      if (!isWithinBusinessHours(businessConfig)) {
        console.log(`\u23F0 [${adminId}] Fora do hor\xE1rio comercial - adiando ${notifications.length} notifica\xE7\xF5es`);
        return;
      }
    }
    const minDelay = Math.max(config?.broadcast_min_interval_seconds || 30, 30);
    const maxDelay = Math.max(config?.broadcast_max_interval_seconds || 60, 60);
    const batchSize = 5;
    const batchPauseSeconds = 300;
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      if (!canSendNotification(adminId)) {
        console.log(`\u{1F6AB} [${adminId}] Limite di\xE1rio atingido - parando processamento`);
        break;
      }
      try {
        const recentSendResult = await db.execute(sql`
          SELECT COUNT(*) as count FROM admin_notification_logs
          WHERE admin_id = ${adminId}
            AND recipient_phone = ${notification.recipient_phone}
            AND notification_type = ${notification.notification_type}
            AND status = 'sent'
            AND created_at >= NOW() - INTERVAL '4 hours'
        `);
        const recentCount = parseInt(recentSendResult.rows[0]?.count || "0", 10);
        if (recentCount > 0) {
          console.log(`\u{1F4CB} [QUEUE] \u23ED\uFE0F PULANDO ${notification.recipient_name} - j\xE1 recebeu ${notification.notification_type} nas \xFAltimas 4h (${recentCount}x)`);
          skipped++;
          await db.execute(sql`
            UPDATE scheduled_notifications 
            SET status = 'skipped_duplicate', updated_at = NOW()
            WHERE id = ${notification.id}
          `);
          continue;
        }
      } catch (dupCheckErr) {
        console.error("Erro ao verificar duplicata:", dupCheckErr);
      }
      try {
        let conversationHistory = "";
        try {
          const historyResult = await db.execute(sql`
            SELECT am.text, am.from_me
            FROM admin_messages am
            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id
            WHERE ac.admin_id = ${adminId}
            AND (ac.contact_number LIKE ${"%" + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + "%"})
            ORDER BY am.timestamp DESC
            LIMIT 10
          `);
          conversationHistory = historyResult.rows.reverse().map(
            (msg) => `${msg.from_me ? "Voc\xEA" : "Cliente"}: ${msg.text}`
          ).join("\n");
        } catch (histErr) {
        }
        const metadata = typeof notification.metadata === "string" ? JSON.parse(notification.metadata || "{}") : notification.metadata || {};
        let finalMessage = notification.message_template.replace(/{cliente_nome}/g, notification.recipient_name || "Cliente").replace(/{dias_restantes}/g, metadata.daysBefore || "").replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || "").replace(/{data_vencimento}/g, metadata.dueDate ? new Date(metadata.dueDate).toLocaleDateString("pt-BR") : "").replace(/{valor}/g, metadata.valor || "");
        if (notification.ai_enabled) {
          try {
            let systemPrompt = notification.ai_prompt || config?.ai_variation_prompt || "Reescreva esta mensagem de forma natural e personalizada.";
            systemPrompt += `

O nome do cliente \xE9: ${notification.recipient_name || "Cliente"}`;
            if (conversationHistory) {
              systemPrompt += `

HIST\xD3RICO DA CONVERSA COM ESTE CLIENTE:
---
${conversationHistory}
---

Use este contexto para personalizar a mensagem de forma natural.`;
            }
            systemPrompt += "\n\nREGRAS OBRIGAT\xD3RIAS:";
            systemPrompt += "\n1. Retorne APENAS UMA \xDANICA mensagem reescrita.";
            systemPrompt += "\n2. N\xC3O gere m\xFAltiplas varia\xE7\xF5es ou op\xE7\xF5es alternativas.";
            systemPrompt += '\n3. N\xC3O use separadores como "---" ou "Ou, se preferir".';
            systemPrompt += "\n4. N\xC3O inclua explica\xE7\xF5es, aspas, marcadores ou prefixos.";
            systemPrompt += "\n5. Use o nome real do cliente na mensagem, NUNCA use {cliente_nome} ou outras vari\xE1veis entre chaves.";
            systemPrompt += `
6. O nome do cliente \xE9: ${notification.recipient_name || "Cliente"}. Use este nome diretamente.`;
            const variedMessage = await callGroq(
              [
                { role: "system", content: systemPrompt },
                { role: "user", content: finalMessage }
              ],
              { temperature: 0.7, maxTokens: 400 }
            );
            const sanitized = sanitizeAIVariation(variedMessage, {
              "{cliente_nome}": notification.recipient_name || "Cliente",
              "{dias_restantes}": metadata.daysBefore || "",
              "{dias_atraso}": metadata.daysOverdue || metadata.daysAfter || "",
              "{data_vencimento}": metadata.dueDate ? new Date(metadata.dueDate).toLocaleDateString("pt-BR") : "",
              "{valor}": metadata.valor || ""
            });
            const clientFirstName = (notification.recipient_name || "").split(" ")[0];
            const isGenericMessage = !sanitized || sanitized.length < 20 || sanitized.toLowerCase().includes("como posso ajudar") || sanitized.toLowerCase().includes("ol\xE1! como posso") || sanitized.toLowerCase().includes("em que posso ajudar") || sanitized.toLowerCase().includes("posso te ajudar") || sanitized === "Ol\xE1!" || sanitized === "Oi!" || // Verificar se variáveis de template ficaram sem substituir
            sanitized.includes("{cliente_nome}") || sanitized.includes("{dias_restantes}") || sanitized.includes("{data_vencimento}") || sanitized.includes("{valor}");
            if (!isGenericMessage) {
              finalMessage = sanitized;
              console.log(`\u{1F4CB} [QUEUE] \u2705 IA variou mensagem para ${notification.recipient_name}`);
            } else {
              console.log(`\u{1F4CB} [QUEUE] \u26A0\uFE0F IA retornou mensagem gen\xE9rica: "${sanitized.substring(0, 50)}...", usando ORIGINAL para ${notification.recipient_name}`);
            }
          } catch (aiError) {
            console.error(`\u{1F4CB} [QUEUE] \u274C Erro IA para ${notification.recipient_name}:`, aiError);
          }
        }
        let sent = false;
        let errorMsg = "Falha desconhecida";
        const maxRetries = 3;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);
            sent = sendResult.success;
            errorMsg = sendResult.error || "Falha desconhecida";
            if (sent) break;
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 2e3;
              console.log(`\u{1F4CB} [QUEUE] \u26A0\uFE0F Tentativa ${attempt}/${maxRetries} falhou para ${notification.recipient_name}: ${errorMsg}. Retry em ${backoffMs / 1e3}s...`);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          } catch (retryErr) {
            errorMsg = String(retryErr);
            if (attempt < maxRetries) {
              const backoffMs = Math.pow(2, attempt) * 2e3;
              console.log(`\u{1F4CB} [QUEUE] \u26A0\uFE0F Tentativa ${attempt}/${maxRetries} erro para ${notification.recipient_name}: ${errorMsg}. Retry em ${backoffMs / 1e3}s...`);
              await new Promise((resolve) => setTimeout(resolve, backoffMs));
            }
          }
        }
        if (sent) {
          processed++;
          incrementDailyCounter(adminId);
          console.log(`\u{1F4CB} [QUEUE] \u2713 Enviado para ${notification.recipient_name} (${processed}/${notifications.length})`);
        } else {
          failed++;
          console.log(`\u{1F4CB} [QUEUE] \u2717 Falha ao enviar para ${notification.recipient_name} ap\xF3s ${maxRetries} tentativas: ${errorMsg}`);
        }
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET 
            status = ${sent ? "sent" : "failed"},
            sent_at = NOW(),
            final_message = ${finalMessage},
            conversation_context = ${conversationHistory || ""},
            error_message = ${sent ? null : errorMsg}
          WHERE id = ${notification.id}
        `);
        await db.execute(sql`
          INSERT INTO admin_notification_logs (
            admin_id, user_id, notification_type, recipient_phone, recipient_name,
            message_original, message_sent, status, metadata, created_at, sent_at, error_message
          ) VALUES (
            ${adminId}, ${notification.user_id}, ${notification.notification_type},
            ${notification.recipient_phone}, ${notification.recipient_name},
            ${notification.message_template}, ${finalMessage}, ${sent ? "sent" : "failed"},
            ${typeof notification.metadata === "string" ? notification.metadata : JSON.stringify(notification.metadata)}::jsonb, NOW(), NOW(),
            ${sent ? null : errorMsg}
          )
        `);
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        if ((i + 1) % batchSize === 0 && i + 1 < notifications.length) {
          console.log(`\u{1F4CB} [QUEUE] Pausa de ${batchPauseSeconds}s ap\xF3s lote de ${batchSize} mensagens...`);
          await new Promise((resolve) => setTimeout(resolve, batchPauseSeconds * 1e3));
        } else if (i + 1 < notifications.length) {
          console.log(`\u{1F4CB} [QUEUE] Aguardando ${delay}s antes da pr\xF3xima mensagem...`);
          await new Promise((resolve) => setTimeout(resolve, delay * 1e3));
        }
      } catch (error) {
        console.error(`\u{1F4CB} [QUEUE] Erro processando ${notification.recipient_name}:`, error);
        failed++;
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET status = 'failed', error_message = ${String(error)}
          WHERE id = ${notification.id}
        `);
      }
    }
    console.log(`\u{1F4CB} [QUEUE] Admin ${adminId}: ${processed} enviados, ${failed} falhas, ${skipped} pulados (duplicatas)`);
  } catch (error) {
    console.error(`\u{1F4CB} [QUEUE] Erro ao processar admin ${adminId}:`, error);
  }
}
async function getActiveNotificationConfigs() {
  try {
    const result = await db.execute(sql`
      SELECT * FROM admin_notification_config 
      WHERE payment_reminder_enabled = true 
         OR overdue_reminder_enabled = true 
         OR periodic_checkin_enabled = true
         OR disconnected_alert_enabled = true
    `);
    return result.rows;
  } catch (error) {
    console.error("Erro ao buscar configs de notifica\xE7\xE3o:", error);
    return [];
  }
}
function isWithinBusinessHours(config) {
  const now = /* @__PURE__ */ new Date();
  const options = { timeZone: "America/Sao_Paulo" };
  const dayOfWeek = new Date(now.toLocaleString("en-US", options)).getDay();
  const currentTime = now.toLocaleTimeString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
  const businessDays = config.business_days || [1, 2, 3, 4, 5];
  if (!businessDays.includes(dayOfWeek)) {
    console.log(`\u23F0 [BUSINESS HOURS] Dia ${dayOfWeek} n\xE3o est\xE1 nos dias comerciais: ${businessDays}`);
    return false;
  }
  const startTime = (config.business_hours_start || "09:00").slice(0, 5);
  const endTime = (config.business_hours_end || "18:00").slice(0, 5);
  const isWithin = currentTime >= startTime && currentTime <= endTime;
  console.log(`\u23F0 [BUSINESS HOURS] Hora atual BRT: ${currentTime}, Comercial: ${startTime}-${endTime}, Permitido: ${isWithin}`);
  return isWithin;
}
async function applyAIVariation(message, customPrompt, clientName) {
  try {
    let prompt = customPrompt || `Reescreva esta mensagem mantendo o mesmo significado mas com palavras e estrutura diferentes.
      Mantenha tom profissional e cordial.
      Varie sauda\xE7\xF5es, conectivos e express\xF5es.`;
    prompt += "\n\nREGRAS OBRIGAT\xD3RIAS:";
    prompt += "\n1. Retorne APENAS UMA \xDANICA mensagem reescrita.";
    prompt += "\n2. N\xC3O gere m\xFAltiplas varia\xE7\xF5es ou op\xE7\xF5es alternativas.";
    prompt += '\n3. N\xC3O use separadores como "---" ou "Ou, se preferir".';
    prompt += "\n4. N\xC3O inclua explica\xE7\xF5es, aspas, marcadores ou prefixos.";
    prompt += "\n5. N\xC3O use vari\xE1veis como {cliente_nome} - use o nome real do cliente diretamente.";
    if (clientName) {
      prompt += `
6. O nome do cliente \xE9: ${clientName}. Use este nome diretamente na mensagem.`;
    }
    const result = await callGroq([
      { role: "system", content: prompt },
      { role: "user", content: message }
    ], {
      temperature: 0.7,
      max_tokens: 400
    });
    const sanitized = sanitizeAIVariation(result, {
      "{cliente_nome}": clientName || "Cliente"
    });
    const isGenericMessage = !sanitized || sanitized.length < 20 || sanitized.toLowerCase().includes("como posso ajudar") || sanitized.toLowerCase().includes("ol\xE1! como posso") || sanitized.toLowerCase().includes("em que posso ajudar") || sanitized.toLowerCase().includes("posso te ajudar") || sanitized === "Ol\xE1!" || sanitized === "Oi!" || // Verificar se variáveis de template ficaram sem substituir
    sanitized.includes("{cliente_nome}") || sanitized.includes("{dias_restantes}") || sanitized.includes("{data_vencimento}") || sanitized.includes("{valor}");
    if (isGenericMessage) {
      console.log(`\u26A0\uFE0F [AI VARIATION] Mensagem gen\xE9rica detectada, usando original: "${sanitized.substring(0, 30)}..."`);
      return message;
    }
    return sanitized;
  } catch (error) {
    console.error("\u26A0\uFE0F Erro ao aplicar varia\xE7\xE3o IA:", error);
    return message;
  }
}
function canSendNotification(adminId) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const key = `${adminId}_${today}`;
  const counter = dailyCounters.get(key);
  if (!counter || counter.date !== today) {
    return true;
  }
  return counter.count < DAILY_NOTIFICATION_LIMIT;
}
function incrementDailyCounter(adminId) {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  const key = `${adminId}_${today}`;
  const counter = dailyCounters.get(key);
  if (!counter || counter.date !== today) {
    dailyCounters.set(key, { count: 1, date: today });
  } else {
    counter.count++;
  }
}
function cleanOldCounters() {
  const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
  for (const [key, counter] of dailyCounters.entries()) {
    if (counter.date !== today) {
      dailyCounters.delete(key);
    }
  }
}
async function processExpiredSubscriptions() {
  try {
    console.log("\u{1F4E6} [SUBSCRIPTION CHECKER] Verificando planos vencidos...");
    const result = await db.execute(sql`
      UPDATE subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active'
        AND data_fim IS NOT NULL
        AND data_fim < NOW()
        AND (
          -- Se não é pagamento recorrente, expira imediatamente
          next_payment_date IS NULL
          OR
          -- Se é recorrente, dá 5 dias de carência após next_payment_date
          next_payment_date + INTERVAL '5 days' < NOW()
        )
      RETURNING id, user_id, data_fim, plan_id
    `);
    const expiredSubs = result.rows;
    if (expiredSubs.length > 0) {
      console.log(`\u{1F4E6} [SUBSCRIPTION CHECKER] \u26A0\uFE0F ${expiredSubs.length} plano(s) marcado(s) como expirado(s):`);
      for (const sub of expiredSubs) {
        console.log(`   - Subscription ${sub.id}: User ${sub.user_id}, venceu em ${sub.data_fim}`);
        try {
          await db.execute(sql`
            INSERT INTO admin_notification_logs (
              id, admin_id, user_id, client_phone, 
              notification_type, message_content, status, created_at
            ) VALUES (
              ${crypto.randomUUID()},
              ${sub.user_id},
              ${sub.user_id},
              'SYSTEM',
              'subscription_expired',
              ${"Plano expirado automaticamente. data_fim: " + sub.data_fim + ". Cliente volta ao limite de 25 mensagens de teste."},
              'sent',
              NOW()
            )
          `);
        } catch (logError) {
          console.error("Erro ao logar expira\xE7\xE3o:", logError);
        }
      }
    } else {
      console.log("\u{1F4E6} [SUBSCRIPTION CHECKER] \u2705 Nenhum plano vencido para atualizar");
    }
  } catch (error) {
    console.error("\u{1F4E6} [SUBSCRIPTION CHECKER] Erro:", error);
  }
}

export {
  startNotificationScheduler,
  stopNotificationScheduler,
  applyAIVariation,
  processExpiredSubscriptions
};
