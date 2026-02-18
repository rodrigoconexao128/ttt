/**
 * Serviço de Lembretes de Agendamento via IA
 * 
 * Este serviço NÃO envia mensagens automáticas engessadas.
 * Em vez disso, ele usa a IA do agente para gerar mensagens NATURAIS
 * que se adaptam ao estilo de cada negócio.
 * 
 * Fluxo:
 * 1. Verifica agendamentos que precisam de lembrete (X horas antes)
 * 2. Busca histórico da conversa com o cliente
 * 3. Pede para a IA gerar uma mensagem natural de lembrete
 * 4. Envia via WhatsApp como se fosse a IA conversando normalmente
 */

import { supabase } from "./supabaseAuth";
import { db } from "./db";
import { 
  conversations, 
  messages as messagesTable,
  whatsappConnections,
  businessAgentConfigs
} from "@shared/schema";
import { eq, and, desc } from "drizzle-orm";
import { getLLMClient } from "./llm";
import { getSessions } from "./whatsapp";
import { storage } from "./storage";
import { messageQueueService } from "./messageQueueService";

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

const CHECK_INTERVAL_MS = 10 * 60 * 1000; // Verificar a cada 10 minutos

// Cache de lembretes já enviados para evitar duplicatas
const sentRemindersCache = new Map<string, number>(); // appointmentId -> timestamp

// Limpar cache a cada hora
setInterval(() => {
  const now = Date.now();
  const ONE_DAY = 24 * 60 * 60 * 1000;
  for (const [key, timestamp] of sentRemindersCache.entries()) {
    if (now - timestamp > ONE_DAY) {
      sentRemindersCache.delete(key);
    }
  }
}, 60 * 60 * 1000);

// ============================================================================
// TIPOS
// ============================================================================

interface AppointmentForReminder {
  id: string;
  user_id: string;
  client_name: string;
  client_phone: string;
  service_name: string;
  appointment_date: string;
  start_time: string;
  end_time: string;
  location: string;
  status: string;
  reminder_sent: boolean;
}

interface SchedulingConfig {
  is_enabled: boolean;
  send_reminder: boolean;
  reminder_hours_before: number;
  reminder_message: string;
  service_name: string;
  location: string;
}

// ============================================================================
// CLASSE PRINCIPAL
// ============================================================================

export class AppointmentReminderService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("📅 [APPOINTMENT-REMINDER] Serviço de lembretes iniciado");
    
    // Verificar a cada 10 minutos
    this.checkInterval = setInterval(() => this.processReminders(), CHECK_INTERVAL_MS);
    
    // Primeira verificação após 2 minutos
    setTimeout(() => this.processReminders(), 2 * 60 * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [APPOINTMENT-REMINDER] Serviço parado");
  }

  /**
   * Processa todos os agendamentos que precisam de lembrete
   */
  private async processReminders() {
    try {
      console.log("🔍 [APPOINTMENT-REMINDER] Verificando agendamentos...");
      
      // Buscar todos os usuários com agendamento ativo
      const { data: configs, error: configError } = await supabase
        .from('scheduling_config')
        .select('*')
        .eq('is_enabled', true)
        .eq('send_reminder', true);
      
      if (configError || !configs || configs.length === 0) {
        console.log("📅 [APPOINTMENT-REMINDER] Nenhum usuário com lembretes ativos");
        return;
      }

      for (const config of configs) {
        await this.processUserReminders(config);
      }
    } catch (error) {
      console.error("❌ [APPOINTMENT-REMINDER] Erro ao processar lembretes:", error);
    }
  }

  /**
   * Processa lembretes para um usuário específico
   */
  private async processUserReminders(config: SchedulingConfig & { user_id: string }) {
    try {
      const now = new Date();
      const reminderHours = config.reminder_hours_before || 24;
      
      // Calcular janela de tempo para lembretes
      // Busca agendamentos que acontecerão nas próximas X horas
      const reminderWindowStart = new Date(now);
      const reminderWindowEnd = new Date(now.getTime() + reminderHours * 60 * 60 * 1000);
      
      // Formato de data para comparação
      const today = now.toISOString().split('T')[0];
      const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      
      // Buscar agendamentos confirmados que precisam de lembrete
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('user_id', config.user_id)
        .in('status', ['confirmed', 'pending'])
        .eq('reminder_sent', false)
        .in('appointment_date', [today, tomorrow])
        .order('appointment_date', { ascending: true })
        .order('start_time', { ascending: true });
      
      if (error || !appointments || appointments.length === 0) {
        return;
      }

      console.log(`📅 [APPOINTMENT-REMINDER] ${appointments.length} agendamentos encontrados para user ${config.user_id}`);

      for (const appointment of appointments) {
        // Verificar se está na janela de lembrete
        const appointmentDateTime = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
        const hoursUntilAppointment = (appointmentDateTime.getTime() - now.getTime()) / (1000 * 60 * 60);
        
        // Só enviar se estiver dentro da janela de lembrete
        if (hoursUntilAppointment > 0 && hoursUntilAppointment <= reminderHours) {
          // Verificar cache para evitar duplicatas
          if (sentRemindersCache.has(appointment.id)) {
            console.log(`⏭️ [APPOINTMENT-REMINDER] Lembrete já enviado para ${appointment.id}`);
            continue;
          }
          
          await this.sendReminderViaAI(appointment, config);
        }
      }
    } catch (error) {
      console.error(`❌ [APPOINTMENT-REMINDER] Erro ao processar user ${config.user_id}:`, error);
    }
  }

  /**
   * Envia lembrete usando a IA do agente (mensagem natural, não automática)
   */
  private async sendReminderViaAI(
    appointment: AppointmentForReminder, 
    config: SchedulingConfig & { user_id: string }
  ) {
    const userId = config.user_id;
    const clientPhone = appointment.client_phone;
    
    console.log(`📤 [APPOINTMENT-REMINDER] Preparando lembrete para ${clientPhone} - ${appointment.client_name}`);

    try {
      // 1. Verificar se existe conexão WhatsApp ativa
      const sessions = getSessions();
      const session = sessions.get(userId);
      
      if (!session?.socket) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] WhatsApp não conectado para user ${userId}`);
        return;
      }

      // 2. Buscar conversa existente com o cliente
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] Conexão não encontrada para user ${userId}`);
        return;
      }

      // Buscar conversa pelo número do cliente
      const conversation = await db.query.conversations.findFirst({
        where: and(
          eq(conversations.connectionId, connection.id),
          eq(conversations.contactNumber, clientPhone)
        )
      });

      if (!conversation) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] Conversa não encontrada com ${clientPhone}`);
        return;
      }

      // 3. Buscar configurações do agente para adaptar o estilo
      const agentConfig = await db.query.businessAgentConfigs.findFirst({
        where: eq(businessAgentConfigs.userId, userId)
      });

      // 4. Buscar histórico recente da conversa
      const recentMessages = await db.query.messages.findMany({
        where: eq(messagesTable.conversationId, conversation.id),
        orderBy: [desc(messagesTable.timestamp)],
        limit: 10
      });

      // 5. Gerar mensagem de lembrete via IA
      const reminderMessage = await this.generateReminderWithAI(
        appointment,
        config,
        agentConfig,
        recentMessages.reverse()
      );

      if (!reminderMessage) {
        console.log(`⚠️ [APPOINTMENT-REMINDER] IA não gerou mensagem de lembrete`);
        return;
      }

      // 6. Enviar mensagem via WhatsApp
      const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
      
      console.log(`📤 [APPOINTMENT-REMINDER] Enviando para ${jid}: ${reminderMessage.substring(0, 50)}...`);
      
      // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
      const userId = appointment.user_id;
      const sentMessage = await messageQueueService.executeWithDelay(userId, 'lembrete de agendamento', async () => {
        return await session.socket.sendMessage(jid, { text: reminderMessage });
      });

      // 7. Registrar mensagem no histórico
      if (sentMessage?.key.id) {
        await storage.createMessage({
          conversationId: conversation.id,
          messageId: sentMessage.key.id,
          fromMe: true,
          text: reminderMessage,
          timestamp: new Date(),
          status: "sent",
        });
      }

      // 8. Atualizar conversa
      await storage.updateConversation(conversation.id, {
        lastMessageText: reminderMessage,
        lastMessageTime: new Date(),
      });

      // 9. Marcar lembrete como enviado
      await supabase
        .from('appointments')
        .update({ reminder_sent: true })
        .eq('id', appointment.id);

      // Adicionar ao cache
      sentRemindersCache.set(appointment.id, Date.now());

      console.log(`✅ [APPOINTMENT-REMINDER] Lembrete enviado com sucesso para ${clientPhone}`);

    } catch (error) {
      console.error(`❌ [APPOINTMENT-REMINDER] Erro ao enviar lembrete:`, error);
    }
  }

  /**
   * Gera mensagem de lembrete usando a IA do agente
   * A mensagem será NATURAL e adaptada ao estilo do negócio
   */
  private async generateReminderWithAI(
    appointment: AppointmentForReminder,
    config: SchedulingConfig,
    agentConfig: any,
    conversationHistory: any[]
  ): Promise<string | null> {
    try {
      const mistral = await getLLMClient();
      if (!mistral) {
        console.error("❌ [APPOINTMENT-REMINDER] Mistral não disponível");
        return config.reminder_message || null; // Fallback para mensagem padrão
      }

      // Formatar data e hora do agendamento
      const appointmentDate = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
      const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
      const dayName = dayNames[appointmentDate.getDay()];
      const formattedDate = `${appointmentDate.getDate().toString().padStart(2, '0')}/${(appointmentDate.getMonth() + 1).toString().padStart(2, '0')}`;
      const formattedTime = appointment.start_time.substring(0, 5);

      // Construir histórico da conversa para contexto
      const historyContext = conversationHistory
        .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text || '[mídia]'}`)
        .join('\n');

      // Prompt para a IA gerar mensagem natural
      const systemPrompt = `Você é o assistente de atendimento de um negócio.
${agentConfig?.prompt ? `\nContexto do negócio:\n${agentConfig.prompt.substring(0, 500)}...` : ''}

Você precisa enviar uma mensagem de LEMBRETE para o cliente sobre um agendamento.
A mensagem deve ser:
- NATURAL e amigável (como se você estivesse conversando normalmente)
- Adaptada ao estilo do negócio (formal/informal conforme configurado)
- Curta e objetiva (1-3 frases)
- NÃO deve parecer automática ou robótica
- Pode usar emojis se for um negócio mais descontraído

Informações do agendamento:
- Cliente: ${appointment.client_name}
- Serviço: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Horário: ${formattedTime}
${appointment.location ? `- Local: ${appointment.location}` : ''}

${historyContext ? `\nÚltimas mensagens da conversa:\n${historyContext}` : ''}

${config.reminder_message ? `\nModelo de referência (adapte naturalmente): ${config.reminder_message}` : ''}

Gere apenas a mensagem de lembrete, sem explicações adicionais.`;

      // Usa modelo configurado no banco de dados (sem hardcode)
      const response = await mistral.chat.complete({
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: "Gere a mensagem de lembrete de agendamento para o cliente." }
        ],
        temperature: 0.7,
        maxTokens: 150
      });

      const message = response.choices?.[0]?.message?.content;
      
      if (typeof message === 'string' && message.trim()) {
        return message.trim();
      }

      // Fallback para mensagem configurada
      return config.reminder_message || `Oi ${appointment.client_name}! 😊 Passando para lembrar do seu ${appointment.service_name} ${dayName} às ${formattedTime}. Te esperamos!`;

    } catch (error) {
      console.error("❌ [APPOINTMENT-REMINDER] Erro ao gerar mensagem com IA:", error);
      // Fallback para mensagem configurada
      return config.reminder_message || null;
    }
  }

  /**
   * Força envio de lembrete para um agendamento específico (uso manual)
   */
  async sendManualReminder(appointmentId: string): Promise<{ success: boolean; message?: string; error?: string }> {
    try {
      const { data: appointment, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('id', appointmentId)
        .single();

      if (error || !appointment) {
        return { success: false, error: 'Agendamento não encontrado' };
      }

      const { data: config } = await supabase
        .from('scheduling_config')
        .select('*')
        .eq('user_id', appointment.user_id)
        .single();

      if (!config) {
        return { success: false, error: 'Configuração de agendamento não encontrada' };
      }

      await this.sendReminderViaAI(appointment, { ...config, user_id: appointment.user_id });
      
      return { success: true, message: 'Lembrete enviado com sucesso' };
    } catch (error: any) {
      return { success: false, error: error.message || 'Erro ao enviar lembrete' };
    }
  }
}

// Singleton
export const appointmentReminderService = new AppointmentReminderService();

/**
 * Envia mensagem personalizada quando o negocio confirma agendamento manual
 */
export async function sendCustomMessageToClient(
  appointment: any,
  userId: string,
  customMessage: string
): Promise<void> {
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
        lastMessageFromMe: true,
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
        timestamp: new Date(),
        status: "sent",
      });
    }

    await storage.updateConversation(conversation.id, {
      lastMessageText: finalMessage,
      lastMessageTime: new Date(),
      lastMessageFromMe: true,
      hasReplied: true,
    });
  } catch (error) {
    console.error("[CUSTOM CONFIRMATION] Erro ao enviar mensagem personalizada:", error);
  }
}

/**
 * Envia confirmação ao cliente quando o negócio ACEITA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
export async function sendConfirmationToClientViaAI(
  appointment: any, 
  userId: string
): Promise<void> {
  const clientPhone = appointment.client_phone;
  
  console.log(`📤 [CONFIRMATION] Enviando confirmação para ${clientPhone} - ${appointment.client_name}`);

  try {
    // 1. Buscar configuração de agendamento
    const { data: config } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!config?.is_enabled) {
      console.log(`⚠️ [CONFIRMATION] Agendamento desativado para user ${userId}`);
      return;
    }

    // 2. Verificar se existe conexão WhatsApp ativa
    const sessions = getSessions();
    const session = sessions.get(userId);
    
    if (!session?.socket) {
      console.log(`⚠️ [CONFIRMATION] WhatsApp não conectado para user ${userId}`);
      return;
    }

    // 3. Buscar conversa existente com o cliente
    const connection = await storage.getConnectionByUserId(userId);
    if (!connection) {
      console.log(`⚠️ [CONFIRMATION] Conexão não encontrada para user ${userId}`);
      return;
    }

    // Buscar conversa pelo número do cliente
    const conversation = await db.query.conversations.findFirst({
      where: and(
        eq(conversations.connectionId, connection.id),
        eq(conversations.contactNumber, clientPhone)
      )
    });

    if (!conversation) {
      console.log(`⚠️ [CONFIRMATION] Conversa não encontrada com ${clientPhone}`);
      return;
    }

    // 4. Buscar configurações do agente para adaptar o estilo
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });

    // 5. Buscar histórico recente da conversa
    const recentMessages = await db.query.messages.findMany({
      where: eq(messagesTable.conversationId, conversation.id),
      orderBy: [desc(messagesTable.timestamp)],
      limit: 10
    });

    // 6. Gerar mensagem de confirmação via IA
    const confirmationMessage = await generateConfirmationWithAI(
      appointment,
      config,
      agentConfig,
      recentMessages.reverse()
    );

    if (!confirmationMessage) {
      console.log(`⚠️ [CONFIRMATION] IA não gerou mensagem de confirmação`);
      return;
    }

    // 7. Enviar mensagem via WhatsApp
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    
    console.log(`📤 [CONFIRMATION] Enviando para ${jid}: ${confirmationMessage.substring(0, 50)}...`);
    
    // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
    const sentMessage = await messageQueueService.executeWithDelay(appointment.user_id, 'confirmação de agendamento', async () => {
      return await session.socket.sendMessage(jid, { text: confirmationMessage });
    });

    // 8. Registrar mensagem no histórico
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: confirmationMessage,
        timestamp: new Date(),
        status: "sent",
      });
    }

    // 9. Atualizar conversa
    await storage.updateConversation(conversation.id, {
      lastMessageText: confirmationMessage,
      lastMessageTime: new Date(),
    });

    console.log(`✅ [CONFIRMATION] Confirmação enviada para ${clientPhone}`);

  } catch (error) {
    console.error(`❌ [CONFIRMATION] Erro ao enviar confirmação:`, error);
  }
}

/**
 * Gera mensagem de confirmação usando a IA do agente
 * A mensagem será NATURAL e adaptada ao estilo do negócio
 */
async function generateConfirmationWithAI(
  appointment: any,
  config: any,
  agentConfig: any,
  conversationHistory: any[]
): Promise<string | null> {
  try {
    const mistral = await getLLMClient();
    if (!mistral) {
      console.error("❌ [CONFIRMATION] Mistral não disponível");
      return config?.confirmation_message || null;
    }

    // Formatar data e hora do agendamento
    const appointmentDate = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const dayName = dayNames[appointmentDate.getDay()];
    const formattedDate = `${appointmentDate.getDate().toString().padStart(2, '0')}/${(appointmentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const formattedTime = appointment.start_time.substring(0, 5);

    // Construir histórico da conversa para contexto
    const historyContext = conversationHistory
      .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text || '[mídia]'}`)
      .join('\n');

    // Prompt para a IA gerar mensagem natural
    const systemPrompt = `Você é o assistente de atendimento de um negócio.
${agentConfig?.prompt ? `\nContexto do negócio:\n${agentConfig.prompt.substring(0, 500)}...` : ''}

O negócio acabou de CONFIRMAR um agendamento do cliente.
Você precisa enviar uma mensagem informando que o agendamento foi CONFIRMADO.

A mensagem deve ser:
- NATURAL e amigável (como se você estivesse conversando normalmente)
- Adaptada ao estilo do negócio (formal/informal conforme configurado)
- Curta e objetiva (1-3 frases)
- NÃO deve parecer automática ou robótica
- Pode usar emojis se for um negócio mais descontraído
- Reafirmar os detalhes do agendamento

Informações do agendamento CONFIRMADO:
- Cliente: ${appointment.client_name}
- Serviço: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Horário: ${formattedTime}
${appointment.location ? `- Local: ${appointment.location}` : ''}

${historyContext ? `\nÚltimas mensagens da conversa:\n${historyContext}` : ''}

${config?.confirmation_message ? `\nModelo de referência (adapte naturalmente): ${config.confirmation_message}` : ''}

Gere apenas a mensagem de confirmação, sem explicações adicionais.`;

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Gere a mensagem informando que o agendamento foi confirmado." }
      ],
      temperature: 0.7,
      maxTokens: 150
    });

    const message = response.choices?.[0]?.message?.content;
    
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    // Fallback para mensagem configurada
    return config?.confirmation_message || `Oi ${appointment.client_name}! 😊 Seu ${appointment.service_name} para ${dayName} (${formattedDate}) às ${formattedTime} está confirmado! Te esperamos!`;

  } catch (error) {
    console.error("❌ [CONFIRMATION] Erro ao gerar mensagem com IA:", error);
    return config?.confirmation_message || null;
  }
}

/**
 * Envia notificação ao cliente quando o negócio CANCELA o agendamento
 * Usa a IA para gerar mensagem natural adaptada ao estilo do negócio
 */
export async function sendCancellationToClientViaAI(
  appointment: any, 
  userId: string,
  reason?: string
): Promise<void> {
  const clientPhone = appointment.client_phone;
  
  console.log(`📤 [CANCELLATION] Enviando notificação de cancelamento para ${clientPhone}`);

  try {
    // 1. Buscar configuração de agendamento
    const { data: config } = await supabase
      .from('scheduling_config')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (!config?.is_enabled) {
      return;
    }

    // 2. Verificar se existe conexão WhatsApp ativa
    const sessions = getSessions();
    const session = sessions.get(userId);
    
    if (!session?.socket) {
      console.log(`⚠️ [CANCELLATION] WhatsApp não conectado para user ${userId}`);
      return;
    }

    // 3. Buscar conversa existente com o cliente
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

    // 4. Buscar configurações do agente
    const agentConfig = await db.query.businessAgentConfigs.findFirst({
      where: eq(businessAgentConfigs.userId, userId)
    });

    // 5. Gerar mensagem de cancelamento via IA
    const cancellationMessage = await generateCancellationWithAI(
      appointment,
      config,
      agentConfig,
      reason
    );

    if (!cancellationMessage) {
      return;
    }

    // 6. Enviar mensagem via WhatsApp
    const jid = conversation.remoteJid || `${clientPhone}@s.whatsapp.net`;
    
    // 🛡️ ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally
    const sentMessage = await messageQueueService.executeWithDelay(userId, 'cancelamento de agendamento', async () => {
      return await session.socket.sendMessage(jid, { text: cancellationMessage });
    });

    // 7. Registrar mensagem no histórico
    if (sentMessage?.key.id) {
      await storage.createMessage({
        conversationId: conversation.id,
        messageId: sentMessage.key.id,
        fromMe: true,
        text: cancellationMessage,
        timestamp: new Date(),
        status: "sent",
      });
    }

    // 8. Atualizar conversa
    await storage.updateConversation(conversation.id, {
      lastMessageText: cancellationMessage,
      lastMessageTime: new Date(),
    });

    console.log(`✅ [CANCELLATION] Notificação enviada para ${clientPhone}`);

  } catch (error) {
    console.error(`❌ [CANCELLATION] Erro:`, error);
  }
}

/**
 * Gera mensagem de cancelamento usando a IA
 */
async function generateCancellationWithAI(
  appointment: any,
  config: any,
  agentConfig: any,
  reason?: string
): Promise<string | null> {
  try {
    const mistral = await getLLMClient();
    if (!mistral) {
      return config?.cancellation_message || null;
    }

    const appointmentDate = new Date(`${appointment.appointment_date}T${appointment.start_time}`);
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const dayName = dayNames[appointmentDate.getDay()];
    const formattedDate = `${appointmentDate.getDate().toString().padStart(2, '0')}/${(appointmentDate.getMonth() + 1).toString().padStart(2, '0')}`;
    const formattedTime = appointment.start_time.substring(0, 5);

    const systemPrompt = `Você é o assistente de atendimento de um negócio.
${agentConfig?.prompt ? `\nContexto do negócio:\n${agentConfig.prompt.substring(0, 500)}...` : ''}

O negócio precisou CANCELAR um agendamento do cliente.
Você precisa enviar uma mensagem informando o cancelamento de forma gentil.

A mensagem deve ser:
- NATURAL e empática (pedindo desculpas pelo inconveniente)
- Adaptada ao estilo do negócio
- Curta e objetiva (1-3 frases)
- Oferecer remarcar para outro horário
- NÃO deve parecer automática ou robótica

Agendamento CANCELADO:
- Cliente: ${appointment.client_name}
- Serviço: ${appointment.service_name}
- Data: ${dayName}, ${formattedDate}
- Horário: ${formattedTime}
${reason ? `- Motivo: ${reason}` : ''}

${config?.cancellation_message ? `\nModelo de referência: ${config.cancellation_message}` : ''}

Gere apenas a mensagem de cancelamento, sem explicações.`;

    // Usa modelo configurado no banco de dados (sem hardcode)
    const response = await mistral.chat.complete({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: "Gere a mensagem informando o cancelamento do agendamento." }
      ],
      temperature: 0.7,
      maxTokens: 150
    });

    const message = response.choices?.[0]?.message?.content;
    
    if (typeof message === 'string' && message.trim()) {
      return message.trim();
    }

    return config?.cancellation_message || `Oi ${appointment.client_name}, precisamos cancelar seu ${appointment.service_name} de ${dayName} às ${formattedTime}. Desculpe o inconveniente! Podemos remarcar para outro horário?`;

  } catch (error) {
    console.error("❌ [CANCELLATION] Erro ao gerar mensagem:", error);
    return config?.cancellation_message || null;
  }
}
