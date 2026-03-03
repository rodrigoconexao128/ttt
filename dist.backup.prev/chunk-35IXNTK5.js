import {
  getLLMClient
} from "./chunk-AUBOE2VN.js";
import {
  db
} from "./chunk-5S2WHN5J.js";
import {
  adminConversations,
  adminMessages,
  followupLogs,
  systemConfig
} from "./chunk-6GOR32UJ.js";

// server/followUpService.ts
import { eq, and, lte } from "drizzle-orm";
var FOLLOW_UP_SCHEDULE = [
  10,
  // 10 minutos (Estágio 0)
  30,
  // 30 minutos (Estágio 1)
  3 * 60,
  // 3 horas (Estágio 2)
  24 * 60,
  // 24 horas (Estágio 3)
  48 * 60,
  // 48 horas (Estágio 4)
  3 * 24 * 60,
  // 3 dias (Estágio 5)
  7 * 24 * 60,
  // 7 dias (Estágio 6)
  15 * 24 * 60
  // 15 dias (Estágio 7)
];
var GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";
async function getAdminFollowupGlobalConfig() {
  try {
    const row = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY)
    });
    if (row?.valor) {
      const saved = JSON.parse(row.valor);
      return {
        isEnabled: saved.isEnabled !== false,
        followupNonPayersEnabled: saved.followupNonPayersEnabled !== false,
        infiniteLoopMinDays: saved.infiniteLoopMinDays ?? 15,
        infiniteLoopMaxDays: saved.infiniteLoopMaxDays ?? 30
      };
    }
  } catch (_) {
  }
  return { isEnabled: true, followupNonPayersEnabled: true, infiniteLoopMinDays: 15, infiniteLoopMaxDays: 30 };
}
var FollowUpService = class {
  checkInterval = null;
  isRunning = false;
  // Prevent overlapping cycles (timer overlap can spam leads)
  isProcessingCycle = false;
  onFollowUpReady = null;
  onScheduledContactReady = null;
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("\u{1F680} [FOLLOW-UP] Servi\xE7o iniciado");
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1e3);
    setTimeout(() => this.processFollowUps(), 30 * 1e3);
  }
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("\u{1F6D1} [FOLLOW-UP] Servi\xE7o parado");
  }
  registerFollowUpCallback(callback) {
    this.onFollowUpReady = callback;
    console.log("\u{1F4F2} [FOLLOW-UP] Callback registrado");
  }
  registerScheduledContactCallback(callback) {
    this.onScheduledContactReady = callback;
    console.log("\u{1F4F2} [AGENDAMENTO] Callback registrado");
  }
  /**
   * Processa conversas pendentes de follow-up
   */
  async processFollowUps() {
    if (this.isProcessingCycle) {
      console.log("\u23ED\uFE0F [FOLLOW-UP] Verifica\xE7\xE3o anterior ainda em execu\xE7\xE3o, pulando ciclo para evitar duplicatas");
      return;
    }
    this.isProcessingCycle = true;
    try {
      const globalConfig = await getAdminFollowupGlobalConfig();
      if (!globalConfig.isEnabled) {
        console.log("\u{1F6D1} [FOLLOW-UP] Follow-up global DESATIVADO na config do admin. Pulando ciclo.");
        return;
      }
      const now = /* @__PURE__ */ new Date();
      const pendingConversations = await db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.followupActive, true),
          lte(adminConversations.nextFollowupAt, now)
        )
      });
      if (pendingConversations.length > 0) {
        console.log(`\u{1F50D} [FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }
      for (const conv of pendingConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("\u274C [FOLLOW-UP] Erro ao processar follow-ups:", error);
    } finally {
      this.isProcessingCycle = false;
    }
  }
  /**
   * Executa a lógica de follow-up para uma conversa específica
   */
  async executeFollowUp(conversation) {
    console.log(`\u{1F449} [FOLLOW-UP] Processando ${conversation.contactNumber} (Est\xE1gio ${conversation.followupStage})`);
    try {
      const globalConfig = await getAdminFollowupGlobalConfig();
      const followupForNonPayers = conversation.followupForNonPayers ?? true;
      const paymentStatus = conversation.paymentStatus ?? "pending";
      if (paymentStatus === "paid") {
        console.log(`\u{1F6D1} [FOLLOW-UP] Client already paid. Skipping.`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, "skipped", "Client already paid", void 0, "paid", "paid", conversation.followupStage || 0);
        await this.disableFollowUp(conversation.id, "Cliente j\xE1 pagou");
        return;
      }
      if (!globalConfig.followupNonPayersEnabled && paymentStatus === "unpaid") {
        console.log(`\u{1F6D1} [FOLLOW-UP] Follow-up para n\xE3o pagantes DESATIVADO globalmente. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, "skipped", "Follow-up n\xE3o pagantes desativado", void 0, paymentStatus, "non_payer", conversation.followupStage || 0);
        await this.scheduleNextFollowUp(conversation, 24 * 60);
        return;
      }
      if (!followupForNonPayers && (paymentStatus === "unpaid" || paymentStatus === "pending")) {
        console.log(`\u{1F6D1} [FOLLOW-UP] Follow-up para n\xE3o pagantes desativado nesta conversa. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, "skipped", "Follow-up n\xE3o pagantes desativado nesta conversa", void 0, paymentStatus, "non_payer", conversation.followupStage || 0);
        return;
      }
      try {
        const recent = await db.query.followupLogs.findFirst({
          where: and(
            eq(followupLogs.conversationId, conversation.id),
            eq(followupLogs.status, "sent")
          ),
          orderBy: (logs, { desc }) => [desc(logs.executedAt)]
        });
        if (recent?.executedAt) {
          const ageMs = Date.now() - new Date(recent.executedAt).getTime();
          const cooldownMs = 7 * 60 * 1e3;
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs) {
            console.log(`??? [FOLLOW-UP] Cooldown ativo (${Math.round(ageMs / 1e3)}s) para ${conversation.contactNumber}, evitando spam`);
            await this.scheduleNextFollowUp(conversation, 30);
            return;
          }
        }
      } catch (cooldownErr) {
        console.warn("?? [FOLLOW-UP] Falha ao checar cooldown, continuando:", cooldownErr);
      }
      if (!conversation.followupActive) {
        console.log(`\u{1F6D1} [FOLLOW-UP] Follow-up desativado para ${conversation.contactNumber}. Cancelando.`);
        await this.disableFollowUp(conversation.id, "Follow-up desativado manualmente");
        return;
      }
      const decision = await this.analyzeWithAI(conversation);
      if (decision.action === "abort") {
        console.log(`\u{1F6D1} [FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id);
        return;
      }
      if (decision.action === "wait") {
        console.log(`\u23F3 [FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        await this.scheduleNextFollowUp(conversation, 24 * 60);
        return;
      }
      if (decision.action === "send") {
        if (this.onFollowUpReady) {
          console.log(`\u{1F4E4} [FOLLOW-UP] Disparando callback para ${conversation.contactNumber}`);
          const attempt = (conversation.followupStage || 0) + 1;
          const type = attempt >= FOLLOW_UP_SCHEDULE.length ? "final" : "reminder";
          const result = await this.onFollowUpReady(
            conversation.contactNumber,
            decision.context || "Follow-up autom\xE1tico",
            attempt,
            type
          );
          try {
            if (result && typeof result === "object") {
              await this.logFollowUp(conversation.id, conversation.contactNumber, result.success ? "sent" : "failed", result.message, result.error, paymentStatus, type, attempt);
            } else {
              await this.logFollowUp(conversation.id, conversation.contactNumber, "sent", "Mensagem enviada (conte\xFAdo n\xE3o capturado)", void 0, paymentStatus, type, attempt);
            }
          } catch (logError) {
            console.error("Erro ao logar follow-up:", logError);
          }
          await this.scheduleNextFollowUp(conversation);
        } else {
          console.warn("\u26A0\uFE0F [FOLLOW-UP] Callback n\xE3o registrado! Mensagem n\xE3o enviada.");
        }
      }
    } catch (error) {
      console.error(`\u274C [FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    }
  }
  /**
   * Enhanced log function with payment status and follow-up type
   */
  async logFollowUp(conversationId, contactNumber, status, messageContent, errorReason, paymentStatus, followupType, stage) {
    try {
      await db.insert(followupLogs).values({
        conversationId,
        contactNumber,
        status,
        messageContent,
        errorReason,
        paymentStatus,
        followupType,
        stage
      });
    } catch (logError) {
      console.error("Erro ao logar follow-up:", logError);
    }
  }
  /**
   * Usa IA para analisar se deve enviar follow-up
   */
  async analyzeWithAI(conversation) {
    const messages = await db.query.adminMessages.findMany({
      where: eq(adminMessages.conversationId, conversation.id),
      orderBy: (adminMessages2, { asc }) => [asc(adminMessages2.timestamp)],
      limit: 20
    });
    const lastMessages = messages.map((m) => ({
      role: m.fromMe ? "assistant" : "user",
      content: m.text || (m.mediaType ? `[M\xEDdia: ${m.mediaType}]` : "")
    }));
    const prompt = `
      Analise esta conversa de vendas e decida o pr\xF3ximo passo para o sistema de follow-up autom\xE1tico.
      
      Contexto:
      - O cliente parou de responder.
      - Estamos no est\xE1gio ${conversation.followupStage} de follow-up.
      - Objetivo: Reengajar o cliente para fechar a venda.
      
      Hist\xF3rico recente:
      ${JSON.stringify(lastMessages, null, 2)}
      
      Regras de Decis\xE3o CR\xCDTICAS:
      1. ABORT ('abort'): 
         - Se o cliente J\xC1 FECHOU/CONTRATOU (ex: "j\xE1 paguei", "fechado", "contratado").
         - Se o cliente disse explicitamente "n\xE3o tenho interesse", "pare de mandar mensagem".
      
      2. WAIT ('wait'): 
         - Se o cliente est\xE1 AGUARDANDO UMA RESPOSTA NOSSA (ex: fez uma pergunta e n\xE3o respondemos ainda).
         - Se o cliente disse "vou ver e te aviso", "falo com voc\xEA amanh\xE3".
      
      3. SEND ('send'): 
         - Se o cliente simplesmente parou de responder e faz sentido tentar reengajar.
         - Se o cliente n\xE3o fechou e n\xE3o estamos devendo resposta.
      
      Responda APENAS um JSON:
      {
        "action": "send" | "wait" | "abort",
        "reason": "breve explica\xE7\xE3o",
        "context": "dicas para a mensagem de follow-up (ex: focar em benef\xEDcios, perguntar se ficou d\xFAvida)"
      }
    `;
    try {
      const mistral = await getLLMClient();
      const response = await mistral.chat.complete({
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.choices?.[0]?.message?.content || "";
      const jsonStr = content.replace(/```json/g, "").replace(/```/g, "").trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro na an\xE1lise de IA:", e);
      return { action: "wait", reason: "Erro na an\xE1lise de IA" };
    }
  }
  /**
   * Agenda o próximo follow-up ou finaliza se acabou a sequência
   * Uses configurable periodicity from global admin config and conversation config
   */
  async scheduleNextFollowUp(conversation, customDelayMinutes) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;
    const globalConfig = await getAdminFollowupGlobalConfig();
    const convConfig = conversation.followupConfig || {
      enabled: true,
      maxAttempts: 8,
      intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432e3],
      finalMinDays: 15,
      finalMaxDays: 30,
      businessHoursStart: "09:00",
      businessHoursEnd: "18:00",
      respectBusinessHours: true,
      tone: "friendly",
      formalityLevel: 3,
      useEmojis: true
    };
    const finalMinDays = globalConfig.infiniteLoopMinDays ?? convConfig.finalMinDays ?? 15;
    const finalMaxDays = globalConfig.infiniteLoopMaxDays ?? convConfig.finalMaxDays ?? 30;
    if (customDelayMinutes) {
      const nextDate = new Date(Date.now() + customDelayMinutes * 60 * 1e3);
      await db.update(adminConversations).set({ nextFollowupAt: nextDate }).where(eq(adminConversations.id, conversation.id));
      return;
    }
    if (currentStage >= convConfig.intervalsMinutes.length) {
      const range = Math.max(1, finalMaxDays - finalMinDays);
      const randomDelay = Math.floor(Math.random() * (range + 1) + finalMinDays);
      const nextDate = new Date(Date.now() + randomDelay * 24 * 60 * 60 * 1e3);
      console.log(`\u{1F504} [FOLLOW-UP] Ciclo infinito: Agendando pr\xF3ximo para daqui a ${randomDelay} dias (config: ${finalMinDays}-${finalMaxDays}d)`);
      await db.update(adminConversations).set({
        followupStage: nextStage,
        // Continua incrementando para saber quantas vezes já tentou
        nextFollowupAt: nextDate
      }).where(eq(adminConversations.id, conversation.id));
    } else {
      const delayMinutes = convConfig.intervalsMinutes[currentStage];
      const nextDate = new Date(Date.now() + delayMinutes * 60 * 1e3);
      await db.update(adminConversations).set({
        followupStage: nextStage,
        nextFollowupAt: nextDate
      }).where(eq(adminConversations.id, conversation.id));
    }
  }
  /**
   * Desativa o follow-up para uma conversa
   */
  async disableFollowUp(conversationId, reason = "Cancelado manualmente") {
    console.log(`\u{1F6D1} [FOLLOW-UP] Desativando follow-up para conversa ${conversationId}. Motivo: ${reason}`);
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });
    if (conversation) {
      await db.update(adminConversations).set({
        followupActive: false,
        nextFollowupAt: null,
        followupStage: 0
        // Reset stage too just in case
      }).where(eq(adminConversations.id, conversationId));
      console.log(`\u2705 [FOLLOW-UP] Sucesso ao desativar follow-up para ${conversation.contactNumber}. Active: ${conversation.followupActive}`);
      await this.logFollowUp(
        conversation.id,
        conversation.contactNumber,
        "cancelled",
        reason,
        void 0,
        conversation.paymentStatus || "pending",
        "cancelled",
        conversation.followupStage || 0
      );
    } else {
      console.warn(`\u26A0\uFE0F [FOLLOW-UP] Falha ao desativar: Conversa ${conversationId} n\xE3o encontrada ou update falhou.`);
    }
  }
  /**
   * Inicia o ciclo de follow-up para uma nova conversa (ou reinicia)
   */
  async scheduleInitialFollowUp(conversationId) {
    const existing = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });
    if (existing?.followupActive && existing?.nextFollowupAt) {
      console.log(`\u2139\uFE0F [FOLLOW-UP] Follow-up j\xE1 ativo para ${conversationId} (stage=${existing.followupStage}, next=${new Date(existing.nextFollowupAt).toLocaleString()}). N\xC3O resetando.`);
      return;
    }
    const delayMinutes = FOLLOW_UP_SCHEDULE[0];
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1e3);
    await db.update(adminConversations).set({
      followupActive: true,
      followupStage: 0,
      nextFollowupAt: nextDate
    }).where(eq(adminConversations.id, conversationId));
    console.log(`\u2705 [FOLLOW-UP] Agendado inicial para conversa ${conversationId} em ${delayMinutes} min`);
  }
  /**
   * Helper para agendar pelo telefone (busca a conversa mais recente)
   */
  async scheduleInitialFollowUpByPhone(phoneNumber) {
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.contactNumber, phoneNumber),
      orderBy: (adminConversations2, { desc }) => [desc(adminConversations2.lastMessageTime)]
    });
    if (conversation) {
      await this.scheduleInitialFollowUp(conversation.id);
    } else {
      console.warn(`\u26A0\uFE0F [FOLLOW-UP] Conversa n\xE3o encontrada para ${phoneNumber} ao tentar agendar follow-up inicial`);
    }
  }
  /**
   * Cancela follow-up ativo para um telefone (MANUALMENTE)
   */
  async cancelFollowUpByPhone(phoneNumber) {
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.contactNumber, phoneNumber)
    });
    if (conversation) {
      await this.disableFollowUp(conversation.id, "Cancelado pelo usu\xE1rio");
      console.log(`\u{1F6D1} [FOLLOW-UP] Cancelado manualmente para ${phoneNumber}`);
    }
  }
  /**
   * Reseta ciclo quando cliente responde
   */
  async resetFollowUpCycle(phoneNumber) {
    const delayMinutes = FOLLOW_UP_SCHEDULE[0];
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1e3);
    await db.update(adminConversations).set({
      followupActive: true,
      followupStage: 0,
      nextFollowupAt: nextDate
    }).where(eq(adminConversations.contactNumber, phoneNumber));
    console.log(`\u{1F504} [FOLLOW-UP] Cliente respondeu. Ciclo resetado para 10min (Est\xE1gio 0) para ${phoneNumber}`);
  }
  // ============================================================================
  // GETTERS PARA O CALENDÁRIO
  // ============================================================================
  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(status) {
    const whereClause = status ? eq(followupLogs.status, status) : void 0;
    return await db.query.followupLogs.findMany({
      where: whereClause,
      orderBy: (followupLogs2, { desc }) => [desc(followupLogs2.executedAt)],
      limit: 100
    });
  }
  /**
   * Retorna eventos para o calendário (follow-ups futuros)
   */
  async getCalendarEvents() {
    const now = /* @__PURE__ */ new Date();
    const activeFollowUps = await db.query.adminConversations.findMany({
      where: and(
        eq(adminConversations.followupActive, true),
        // Trazer apenas os futuros ou atrasados (não nulos)
        lte(adminConversations.nextFollowupAt, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1e3))
        // Próximos 30 dias
      )
    });
    const validFollowUps = activeFollowUps.filter((c) => c.followupActive === true);
    return validFollowUps.map((conv) => ({
      id: conv.id,
      // Use ID directly for easier deletion
      phoneNumber: conv.contactNumber,
      type: "followup",
      title: `Follow-up #${(conv.followupStage || 0) + 1}`,
      scheduledAt: conv.nextFollowupAt,
      status: conv.nextFollowupAt && conv.nextFollowupAt < now ? "overdue" : "pending",
      attempt: (conv.followupStage || 0) + 1,
      metadata: {
        conversationId: conv.id,
        stage: conv.followupStage
      }
    }));
  }
  /**
   * Retorna estatísticas para o dashboard
   */
  async getFollowUpStats() {
    const now = /* @__PURE__ */ new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1e3);
    const events = await this.getCalendarEvents();
    const stats = {
      pending: events.filter((e) => e.status === "pending" || e.status === "overdue").length,
      scheduledToday: events.filter(
        (e) => e.scheduledAt && new Date(e.scheduledAt) >= today && new Date(e.scheduledAt) < new Date(today.getTime() + 24 * 60 * 60 * 1e3)
      ).length,
      scheduledThisWeek: events.filter(
        (e) => e.scheduledAt && new Date(e.scheduledAt) >= today && new Date(e.scheduledAt) < nextWeek
      ).length,
      byType: {}
    };
    events.forEach((e) => {
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    });
    return stats;
  }
};
var followUpService = new FollowUpService();
function registerFollowUpCallback(callback) {
  followUpService.registerFollowUpCallback(callback);
}
function registerScheduledContactCallback(callback) {
  followUpService.registerScheduledContactCallback(callback);
}
var scheduleAutoFollowUp = function(phoneNumber, delayMinutes, context) {
  console.warn("\u26A0\uFE0F scheduleAutoFollowUp (legacy) chamado - migrar para scheduleInitialFollowUp");
};
var cancelFollowUp = function(phoneNumber) {
  followUpService.cancelFollowUpByPhone(phoneNumber);
};
var scheduleContact = function(phoneNumber, date, reason) {
};
var parseScheduleFromText = function(text) {
  const now = /* @__PURE__ */ new Date();
  const lowerText = text.toLowerCase();
  if (lowerText.includes("amanh\xE3") || lowerText.includes("amanha")) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
    if (hourMatch) {
      tomorrow.setHours(parseInt(hourMatch[1]), 0, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0);
    }
    return tomorrow;
  }
  const weekdays = ["domingo", "segunda", "ter\xE7a", "terca", "quarta", "quinta", "sexta", "s\xE1bado", "sabado"];
  for (let i = 0; i < weekdays.length; i++) {
    if (lowerText.includes(weekdays[i])) {
      const targetDay = i % 7;
      const currentDay = now.getDay();
      let daysToAdd = targetDay - currentDay;
      if (daysToAdd <= 0) daysToAdd += 7;
      const target = new Date(now);
      target.setDate(target.getDate() + daysToAdd);
      const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
      if (hourMatch) {
        target.setHours(parseInt(hourMatch[1]), 0, 0, 0);
      } else {
        target.setHours(10, 0, 0, 0);
      }
      return target;
    }
  }
  const inXMatch = text.match(/daqui\s*(?:a\s*)?(\d+)\s*(dia|hora|minuto)/i);
  if (inXMatch) {
    const amount = parseInt(inXMatch[1]);
    const unit = inXMatch[2].toLowerCase();
    const target = new Date(now);
    if (unit.startsWith("dia")) {
      target.setDate(target.getDate() + amount);
      target.setHours(10, 0, 0, 0);
    } else if (unit.startsWith("hora")) {
      target.setHours(target.getHours() + amount);
    } else if (unit.startsWith("minuto")) {
      target.setMinutes(target.getMinutes() + amount);
    }
    return target;
  }
  return null;
};
function setMockFollowUpFunctions(mocks) {
  if (mocks.cancelFollowUp) cancelFollowUp = mocks.cancelFollowUp;
  if (mocks.scheduleAutoFollowUp) scheduleAutoFollowUp = mocks.scheduleAutoFollowUp;
  if (mocks.scheduleContact) scheduleContact = mocks.scheduleContact;
  if (mocks.followUpService) followUpService = mocks.followUpService;
}

export {
  FollowUpService,
  followUpService,
  registerFollowUpCallback,
  registerScheduledContactCallback,
  scheduleAutoFollowUp,
  cancelFollowUp,
  scheduleContact,
  parseScheduleFromText,
  setMockFollowUpFunctions
};
