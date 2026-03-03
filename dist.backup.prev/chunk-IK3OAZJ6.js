import {
  getSessions,
  messageQueueService
} from "./chunk-SGT55VYN.js";
import {
  supabase
} from "./chunk-KSCKUPAW.js";
import {
  storage
} from "./chunk-7EIK4PB3.js";
import {
  getLLMClient
} from "./chunk-OEGEW5R4.js";
import {
  db
} from "./chunk-ZO343QIX.js";
import {
  businessAgentConfigs,
  conversations,
  messages
} from "./chunk-P6ABBBKG.js";

// server/appointmentReminderService.ts
import { eq, and, desc } from "drizzle-orm";
var CHECK_INTERVAL_MS = 10 * 60 * 1e3;
var sentRemindersCache = /* @__PURE__ */ new Map();
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1e3;
  for (const [key, timestamp] of sentRemindersCache.entries()) {
    if (now - timestamp > ONE_DAY) {
      sentRemindersCache.delete(key);
    }
  }
}, 60 * 60 * 1e3);
var AppointmentReminderService = class {
  checkInterval = null;
  isRunning = false;
  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("\u{1F4C5} [APPOINTMENT-REMINDER] Servi\xE7o de lembretes iniciado");
    this.checkInterval = setInterval(() => this.processReminders(), CHECK_INTERVAL_MS);
    setTimeout(() => this.processReminders(), 2 * 60 * 1e3);
  }
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("\u{1F6D1} [APPOINTMENT-REMINDER] Servi\xE7o parado");
  }
  /**
   * Processa todos os agendamentos que precisam de lembrete
   */
  async processReminders() {
    try {
      console.log("\u{1F50D} [APPOINTMENT-REMINDER] Verificando agendamentos...");
      const { data: configs, error: configError } = await supabase.from("scheduling_config").select("*").eq("is_enabled", true).eq("send_reminder", true);
      if (configError || !configs || configs.length === 0) {
        console.log("\u{1F4C5} [APPOINTMENT-REMINDER] Nenhum usu\xE1rio com lembretes ativos");
        return;
      }
      for (const config of configs) {
        await this.processUserReminders(config);
      }
    } catch (error) {
      console.error("\u274C [APPOINTMENT-REMINDER] Erro ao processar lembretes:", error);
    }
  }
  /**
   * Processa lembretes para um usuário específico
   * Suporta múltiplos tempos de lembrete (ex: 24h, 2h, 30min antes)
   */
  async processUserReminders(config) {
    try {
      const now = /* @__PURE__ */ new Date();
      const reminderTimes = config.reminder_times && Array.isArray(config.reminder_times) && config.reminder_times.length > 0 ? config.reminder_times.sort((a, b) => b - a) : [config.reminder_hours_before || 24];
      const maxReminder = Math.max(...reminderTimes);
      const today = now.toISOString().split("T")[0];
      const dayAfterTomorrow = new Date(now.getTime() + maxReminder * 60 * 60 * 1e3 + 24 * 60 * 60 * 1e3).toISOString().split("T")[0];
      const { data: appointments, error } = await supabase.from("appointments").select("*, reminder_times_sent").eq("user_id", config.user_id).in("status", ["confirmed", "pending"]).gte("appointment_date", today).lte("appointment_date", dayAfterTomorrow).order("appointment_date", { ascending: true }).order("start_time", { ascending: true });
      if (error || !appointments || appointments.length === 0) {
        return;
      }
      console.log(`\u{1F4C5} [APPOINTMENT-REMINDER] ${appointments.length} agendamentos encontrados para user ${config.user_id}`);
      for (const appointment of appointments) {
        const appointmentDateTime = /* @__PURE__ */ new Date(`${appointment.appointment_date}T${appointment.start_time}`);
        const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1e3 * 60 * 60);
        if (hoursUntilAppointment <= 0) continue;
        const sentTimes = appointment.reminder_times_sent || [];
        for (const reminderHour of reminderTimes) {
          if (sentTimes.includes(reminderHour)) continue;
          const cacheKey = `${appointment.id}_${reminderHour}h`;
          if (sentRemindersCache.has(cacheKey)) continue;
          const windowMinutes = 15;
          if (hoursUntilAppointment <= reminderHour && hoursUntilAppointment > reminderHour - (windowMinutes / 60 + 0.5)) {
            console.log(`\u{1F4E4} [APPOINTMENT-REMINDER] Enviando lembrete ${reminderHour}h para ${appointment.client_name} (${cacheKey})`);
            await this.sendReminderViaAI(appointment, config, reminderHour);
            const updatedSentTimes = [...sentTimes, reminderHour];
            await supabase.from("appointments").update({
              reminder_times_sent: updatedSentTimes,
              // Manter compatibilidade: marcar reminder_sent=true quando todos foram enviados
              reminder_sent: updatedSentTimes.length >= reminderTimes.length
            }).eq("id", appointment.id);
            sentRemindersCache.set(cacheKey, Date.now());
            break;
          }
        }
      }
    } catch (error) {
      console.error(`\u274C [APPOINTMENT-REMINDER] Erro ao processar user ${config.user_id}:`, error);
    }
  }
  /**
   * Envia lembrete usando a IA do agente (mensagem natural, não automática)
   */
  async sendReminderViaAI(appointment, config, reminderHour) {
    const userId = config.user_id;
    const clientPhone = appointment.client_phone;
    console.log(`\u{1F4E4} [APPOINTMENT-REMINDER] Preparando lembrete para ${clientPhone} - ${appointment.client_name}`);
    try {
      const sessions = getSessions();
      const session = sessions.get(userId);
      if (!session?.socket) {
        console.log(`\u26A0\uFE0F [APPOINTMENT-REMINDER] WhatsApp n\xE3o conectado para user ${userId}`);
        return;
      }
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        console.log(`\u26A0\uFE0F [APPOINTMENT-REMINDER] Conex\xE3o n\xE3o encontrada para user ${userId}`);
        return;
      }
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.connectionId, connection.id),
          eq(conversations.contactNumber, clientPhone)
        )
      });
      if (!conversation) {
        console.log(`\u26A0\uFE0F [APPOINTMENT-REMINDER] Conversa n\xE3o encontrada com ${clientPhone}`);
        return;
      }
      const agentConfig = await db.query.businessAgentConfigs.findFirst({
        where: eq(businessAgentConfigs.userId, userId)
      });
      const recentMessages = await db.query.messages.findMany({
        where: eq(messages.conversationId, conversation.id),
        orderBy: [desc(messages.timestamp)],
        limit: 10
      });
      const reminderMessage = await this.generateReminderWithAI(
        appointment,
        config,
        agentConfig,
        recentMessages.reverse()
      );
      if (!reminderMessage) {
        console.log(`\u26A0\uFE0F [APPOINTMENT-REMINDER] IA n\xE3o gerou mensagem de lembrete`);
        return;
      }
      const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
      console.log(`\u{1F4E4} [APPOINTMENT-REMINDER] Enviando para ${jid}: ${reminderMessage.substring(0, 50)}...`);
      const sentMessage = await messageQueueService.executeWithDelay(userId, "lembrete de agendamento", async () => {
        return await session.socket.sendMessage(jid, { text: reminderMessage });
      });
      if (sentMessage?.key.id) {
        await storage.createMessage({
          conversationId: conversation.id,
          messageId: sentMessage.key.id,
          fromMe: true,
          text: reminderMessage,
          timestamp: /* @__PURE__ */ new Date(),
          status: "sent"
        });
      }
      await storage.updateConversation(conversation.id, {
        lastMessageText: reminderMessage,
        lastMessageTime: /* @__PURE__ */ new Date()
      });
      if (!reminderHour) {
        await supabase.from("appointments").update({ reminder_sent: true }).eq("id", appointment.id);
        sentRemindersCache.set(appointment.id, Date.now());
      }
      console.log(`\u2705 [APPOINTMENT-REMINDER] Lembrete ${reminderHour ? reminderHour + "h" : ""} enviado com sucesso para ${clientPhone}`);
    } catch (error) {
      console.error(`\u274C [APPOINTMENT-REMINDER] Erro ao enviar lembrete:`, error);
    }
  }
  /**
   * Gera mensagem de lembrete usando a IA do agente
   * A mensagem será NATURAL e adaptada ao estilo do negócio
   */
  async generateReminderWithAI(appointment, config, agentConfig, conversationHistory) {
    try {
      const mistral = await getLLMClient();
      if (!mistral) {
        console.error("\u274C [APPOINTMENT-REMINDER] Mistral n\xE3o dispon\xEDvel");
        return config.reminder_message || null;
      }
      const appointmentDate = /* @__PURE__ */ new Date(`${appointment.appointment_date}T${appointment.start_time}`);
      const dayNames = ["domingo", "segunda-feira", "ter\xE7a-feira", "quarta-feira", "quinta-feira", "sexta-feira", "s\xE1bado"];
      const dayName = dayNames[appointmentDate.getDay()];
      const formattedDate = `${appointmentDate.getDate().toString().padStart(2, "0")}/${(appointmentDate.getMonth() + 1).toString().padStart(2, "0")}`;
      const formattedTime = appointment.start_time.substring(0, 5);
      const historyContext = conversationHistory.map((m) => `${m.fromMe ? "Atendente" : "Cliente"}: ${m.text || "[m\xEDdia]"}`).join("\n");
      const systemPrompt = `Voc\xEA \xE9 o assistente de atendimento de um neg\xF3cio.
${agentConfig?.prompt ? `
Contexto do neg\xF3cio:
${agentConfig.prompt.substring(0, 500)}...` : ""}

Voc\xEA precisa enviar uma mensagem de LEMBRETE para o cliente sobre um agendamento.
A mensagem deve ser:
- NATURAL e amig\xE1vel (como se voc\xEA estivesse conversando normalmente)
- Adaptada ao estilo do neg\xF3cio (formal/informal conforme configurado)
- Curta e objetiva (1-3 frases)
- N\xC3O deve parecer autom\xE1tica ou rob\xF3tica
- Pode usar emojis se for um neg\xF3cio mais descontra\xEDdo

Informa\xE7\xF5es do agendamento:
- Cliente: ${appointment.client_name}
- Servi\xE7o: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Hor\xE1rio: ${formattedTime}
${appointment.location ? `- Local: ${appointment.location}` : ""}

${historyContext ? `
\xDAltimas mensagens da conversa:
${historyContext}` : ""}

${config.reminder_message ? `
Modelo de refer\xEAncia (adapte naturalmente): ${config.reminder_message}` : ""}

Gere apenas a mensagem de lembrete, sem explica\xE7\xF5es adicionais.`;
      const response = await mistral.chat.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere a mensagem de lembrete de agendamento para o cliente." }
        ],
        temperature: 0.7,
        maxTokens: 150
      });
      const message = response.choices?.[0]?.message?.content;
      if (typeof message === "string" && message.trim()) {
        return message.trim();
      }
      return config.reminder_message || `Oi ${appointment.client_name}! \u{1F60A} Passando para lembrar do seu ${appointment.service_name} ${dayName} \xE0s ${formattedTime}. Te esperamos!`;
    } catch (error) {
      console.error("\u274C [APPOINTMENT-REMINDER] Erro ao gerar mensagem com IA:", error);
      return config.reminder_message || null;
    }
  }
  /**
   * Força envio de lembrete para um agendamento específico (uso manual)
   */
  async sendManualReminder(appointmentId) {
    try {
      const { data: appointment, error } = await supabase.from("appointments").select("*").eq("id", appointmentId).single();
      if (error || !appointment) {
        return { success: false, error: "Agendamento n\xE3o encontrado" };
      }
      const { data: config } = await supabase.from("scheduling_config").select("*").eq("user_id", appointment.user_id).single();
      if (!config) {
        return { success: false, error: "Configura\xE7\xE3o de agendamento n\xE3o encontrada" };
      }
      await this.sendReminderViaAI(appointment, { ...config, user_id: appointment.user_id });
      return { success: true, message: "Lembrete enviado com sucesso" };
    } catch (error) {
      return { success: false, error: error.message || "Erro ao enviar lembrete" };
    }
  }
};
var appointmentReminderService = new AppointmentReminderService();
async function sendCustomMessageToClient(appointment, userId, customMessage) {
  const clientPhone = appointment.client_phone;
  const finalMessage = (customMessage || "").trim();
  if (!finalMessage) return;
  try {
    const sessions = getSessions();
    const session = sessions.get(userId);
    if (!session?.socket) {
      console.log(`[CUSTOM CONFIRMATION] WhatsApp nao conectado para user ${userId}`);
      return;
    }
    const connection = await storage.getConnectionByUserId(userId);
    if (!connection) {
      console.log(`[CUSTOM CONFIRMATION] Conexao nao encontrada para user ${userId}`);
      return;
    }
    let conversation = await storage.getConversationByContactNumber(connection.id, clientPhone);
    if (!conversation) {
      conversation = await storage.createConversation({
        connectionId: connection.id,
        contactNumber: clientPhone,
        contactName: appointment.client_name,
        lastMessageText: null,
        lastMessageTime: null,
        lastMessageFromMe: true
      });
    }
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    const sentMessage = await messageQueueService.executeWithDelay(userId, "custom confirmation", async () => {
      return await session.socket.sendMessage(jid, { text: finalMessage });
    });
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: finalMessage,
        timestamp: /* @__PURE__ */ new Date(),
        status: "sent"
      });
    }
    await storage.updateConversation(conversation.id, {
      lastMessageText: finalMessage,
      lastMessageTime: /* @__PURE__ */ new Date(),
      lastMessageFromMe: true,
      hasReplied: true
    });
  } catch (error) {
    console.error("[CUSTOM CONFIRMATION] Erro ao enviar mensagem personalizada:", error);
  }
}
async function sendConfirmationToClientViaAI(appointment, userId) {
  const clientPhone = appointment.client_phone;
  console.log(`\u{1F4E4} [CONFIRMATION] Enviando confirma\xE7\xE3o para ${clientPhone} - ${appointment.client_name}`);
  try {
    const { data: config } = await supabase.from("scheduling_config").select("*").eq("user_id", userId).single();
    if (!config?.is_enabled) {
      console.log(`\u26A0\uFE0F [CONFIRMATION] Agendamento desativado para user ${userId}`);
      return;
    }
    const sessions = getSessions();
    const session = sessions.get(userId);
    if (!session?.socket) {
      console.log(`\u26A0\uFE0F [CONFIRMATION] WhatsApp n\xE3o conectado para user ${userId}`);
      return;
    }
    const connection = await storage.getConnectionByUserId(userId);
    if (!connection) {
      console.log(`\u26A0\uFE0F [CONFIRMATION] Conex\xE3o n\xE3o encontrada para user ${userId}`);
      return;
    }
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.connectionId, connection.id),
        eq(conversations.contactNumber, clientPhone)
      )
    });
    if (!conversation) {
      console.log(`\u26A0\uFE0F [CONFIRMATION] Conversa n\xE3o encontrada com ${clientPhone}`);
      return;
    }
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });
    const recentMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversation.id),
      orderBy: [desc(messages.timestamp)],
      limit: 10
    });
    const confirmationMessage = await generateConfirmationWithAI(
      appointment,
      config,
      agentConfig,
      recentMessages.reverse()
    );
    if (!confirmationMessage) {
      console.log(`\u26A0\uFE0F [CONFIRMATION] IA n\xE3o gerou mensagem de confirma\xE7\xE3o`);
      return;
    }
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    console.log(`\u{1F4E4} [CONFIRMATION] Enviando para ${jid}: ${confirmationMessage.substring(0, 50)}...`);
    const sentMessage = await messageQueueService.executeWithDelay(appointment.user_id, "confirma\xE7\xE3o de agendamento", async () => {
      return await session.socket.sendMessage(jid, { text: confirmationMessage });
    });
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: confirmationMessage,
        timestamp: /* @__PURE__ */ new Date(),
        status: "sent"
      });
    }
    await storage.updateConversation(conversation.id, {
      lastMessageText: confirmationMessage,
      lastMessageTime: /* @__PURE__ */ new Date()
    });
    console.log(`\u2705 [CONFIRMATION] Confirma\xE7\xE3o enviada para ${clientPhone}`);
  } catch (error) {
    console.error(`\u274C [CONFIRMATION] Erro ao enviar confirma\xE7\xE3o:`, error);
  }
}
async function generateConfirmationWithAI(appointment, config, agentConfig, conversationHistory) {
  try {
    const mistral = await getLLMClient();
    if (!mistral) {
      console.error("\u274C [CONFIRMATION] Mistral n\xE3o dispon\xEDvel");
      return config?.confirmation_message || null;
    }
    const appointmentDate = /* @__PURE__ */ new Date(`${appointment.appointment_date}T${appointment.start_time}`);
    const dayNames = ["domingo", "segunda-feira", "ter\xE7a-feira", "quarta-feira", "quinta-feira", "sexta-feira", "s\xE1bado"];
    const dayName = dayNames[appointmentDate.getDay()];
    const formattedDate = `${appointmentDate.getDate().toString().padStart(2, "0")}/${(appointmentDate.getMonth() + 1).toString().padStart(2, "0")}`;
    const formattedTime = appointment.start_time.substring(0, 5);
    const historyContext = conversationHistory.map((m) => `${m.fromMe ? "Atendente" : "Cliente"}: ${m.text || "[m\xEDdia]"}`).join("\n");
    const systemPrompt = `Voc\xEA \xE9 o assistente de atendimento de um neg\xF3cio.
${agentConfig?.prompt ? `
Contexto do neg\xF3cio:
${agentConfig.prompt.substring(0, 500)}...` : ""}

O neg\xF3cio acabou de CONFIRMAR um agendamento do cliente.
Voc\xEA precisa enviar uma mensagem informando que o agendamento foi CONFIRMADO.

A mensagem deve ser:
- NATURAL e amig\xE1vel (como se voc\xEA estivesse conversando normalmente)
- Adaptada ao estilo do neg\xF3cio (formal/informal conforme configurado)
- Curta e objetiva (1-3 frases)
- N\xC3O deve parecer autom\xE1tica ou rob\xF3tica
- Pode usar emojis se for um neg\xF3cio mais descontra\xEDdo
- Reafirmar os detalhes do agendamento

Informa\xE7\xF5es do agendamento CONFIRMADO:
- Cliente: ${appointment.client_name}
- Servi\xE7o: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Hor\xE1rio: ${formattedTime}
${appointment.location ? `- Local: ${appointment.location}` : ""}

${historyContext ? `
\xDAltimas mensagens da conversa:
${historyContext}` : ""}

${config?.confirmation_message ? `
Modelo de refer\xEAncia (adapte naturalmente): ${config.confirmation_message}` : ""}

Gere apenas a mensagem de confirma\xE7\xE3o, sem explica\xE7\xF5es adicionais.`;
    const response = await mistral.chat.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Gere a mensagem informando que o agendamento foi confirmado." }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    const message = response.choices?.[0]?.message?.content;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    return config?.confirmation_message || `Oi ${appointment.client_name}! \u{1F60A} Seu ${appointment.service_name} para ${dayName} (${formattedDate}) \xE0s ${formattedTime} est\xE1 confirmado! Te esperamos!`;
  } catch (error) {
    console.error("\u274C [CONFIRMATION] Erro ao gerar mensagem com IA:", error);
    return config?.confirmation_message || null;
  }
}
async function sendCancellationToClientViaAI(appointment, userId, reason) {
  const clientPhone = appointment.client_phone;
  console.log(`\u{1F4E4} [CANCELLATION] Enviando notifica\xE7\xE3o de cancelamento para ${clientPhone}`);
  try {
    const { data: config } = await supabase.from("scheduling_config").select("*").eq("user_id", userId).single();
    if (!config?.is_enabled) {
      return;
    }
    const sessions = getSessions();
    const session = sessions.get(userId);
    if (!session?.socket) {
      console.log(`\u26A0\uFE0F [CANCELLATION] WhatsApp n\xE3o conectado para user ${userId}`);
      return;
    }
    const connection = await storage.getConnectionByUserId(userId);
    if (!connection) {
      return;
    }
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.connectionId, connection.id),
        eq(conversations.contactNumber, clientPhone)
      )
    });
    if (!conversation) {
      return;
    }
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });
    const cancellationMessage = await generateCancellationWithAI(
      appointment,
      config,
      agentConfig,
      reason
    );
    if (!cancellationMessage) {
      return;
    }
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    const sentMessage = await messageQueueService.executeWithDelay(userId, "cancelamento de agendamento", async () => {
      return await session.socket.sendMessage(jid, { text: cancellationMessage });
    });
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: cancellationMessage,
        timestamp: /* @__PURE__ */ new Date(),
        status: "sent"
      });
    }
    await storage.updateConversation(conversation.id, {
      lastMessageText: cancellationMessage,
      lastMessageTime: /* @__PURE__ */ new Date()
    });
    console.log(`\u2705 [CANCELLATION] Notifica\xE7\xE3o enviada para ${clientPhone}`);
  } catch (error) {
    console.error(`\u274C [CANCELLATION] Erro:`, error);
  }
}
async function generateCancellationWithAI(appointment, config, agentConfig, reason) {
  try {
    const mistral = await getLLMClient();
    if (!mistral) {
      return config?.cancellation_message || null;
    }
    const appointmentDate = /* @__PURE__ */ new Date(`${appointment.appointment_date}T${appointment.start_time}`);
    const dayNames = ["domingo", "segunda-feira", "ter\xE7a-feira", "quarta-feira", "quinta-feira", "sexta-feira", "s\xE1bado"];
    const dayName = dayNames[appointmentDate.getDay()];
    const formattedDate = `${appointmentDate.getDate().toString().padStart(2, "0")}/${(appointmentDate.getMonth() + 1).toString().padStart(2, "0")}`;
    const formattedTime = appointment.start_time.substring(0, 5);
    const systemPrompt = `Voc\xEA \xE9 o assistente de atendimento de um neg\xF3cio.
${agentConfig?.prompt ? `
Contexto do neg\xF3cio:
${agentConfig.prompt.substring(0, 500)}...` : ""}

O neg\xF3cio precisou CANCELAR um agendamento do cliente.
Voc\xEA precisa enviar uma mensagem informando o cancelamento de forma gentil.

A mensagem deve ser:
- NATURAL e emp\xE1tica (pedindo desculpas pelo inconveniente)
- Adaptada ao estilo do neg\xF3cio
- Curta e objetiva (1-3 frases)
- Oferecer remarcar para outro hor\xE1rio
- N\xC3O deve parecer autom\xE1tica ou rob\xF3tica

Agendamento CANCELADO:
- Cliente: ${appointment.client_name}
- Servi\xE7o: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Hor\xE1rio: ${formattedTime}
${reason ? `- Motivo: ${reason}` : ""}

${config?.cancellation_message ? `
Modelo de refer\xEAncia: ${config.cancellation_message}` : ""}

Gere apenas a mensagem de cancelamento, sem explica\xE7\xF5es.`;
    const response = await mistral.chat.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Gere a mensagem informando o cancelamento do agendamento." }
      ],
      temperature: 0.7,
      maxTokens: 150
    });
    const message = response.choices?.[0]?.message?.content;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
    return config?.cancellation_message || `Oi ${appointment.client_name}, precisamos cancelar seu ${appointment.service_name} de ${dayName} \xE0s ${formattedTime}. Desculpe o inconveniente! Podemos remarcar para outro hor\xE1rio?`;
  } catch (error) {
    console.error("\u274C [CANCELLATION] Erro ao gerar mensagem:", error);
    return config?.cancellation_message || null;
  }
}

export {
  AppointmentReminderService,
  appointmentReminderService,
  sendCustomMessageToClient,
  sendConfirmationToClientViaAI,
  sendCancellationToClientViaAI
};
