import { db } from "./db";
import { adminConversations, followupLogs, adminMessages, systemConfig } from "@shared/schema";
import { eq, and, lte, isNull } from "drizzle-orm";
import { getLLMClient } from "./llm";

// ============================================================================
// CONFIGURAÇÕES
// ============================================================================

// Intervalos de follow-up em minutos
// 10m, 30m, 3h, 24h, 48h, 3d, 7d, 15d
const FOLLOW_UP_SCHEDULE = [
  10,                 // 10 minutos (Estágio 0)
  30,                 // 30 minutos (Estágio 1)
  3 * 60,             // 3 horas (Estágio 2)
  24 * 60,            // 24 horas (Estágio 3)
  48 * 60,            // 48 horas (Estágio 4)
  3 * 24 * 60,        // 3 dias (Estágio 5)
  7 * 24 * 60,        // 7 dias (Estágio 6)
  15 * 24 * 60        // 15 dias (Estágio 7)
];

// Chave da config global de follow-up no systemConfig
const GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";

/** Busca configuração global de follow-up do admin */
async function getAdminFollowupGlobalConfig(): Promise<{
  isEnabled: boolean;
  followupNonPayersEnabled: boolean;
  infiniteLoopMinDays: number;
  infiniteLoopMaxDays: number;
}> {
  try {
    const row = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });
    if (row?.valor) {
      const saved = JSON.parse(row.valor);
      return {
        isEnabled: saved.isEnabled !== false,
        followupNonPayersEnabled: saved.followupNonPayersEnabled !== false,
        infiniteLoopMinDays: saved.infiniteLoopMinDays ?? 15,
        infiniteLoopMaxDays: saved.infiniteLoopMaxDays ?? 30,
      };
    }
  } catch (_) {}
  return { isEnabled: true, followupNonPayersEnabled: true, infiniteLoopMinDays: 15, infiniteLoopMaxDays: 30 };
}

type FollowUpCallback = (phoneNumber: string, context: string, attempt: number, type: string) => Promise<{ success: boolean, message?: string, error?: string } | void>;
type ScheduledContactCallback = (phoneNumber: string, reason: string) => Promise<void>;

export class FollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  // Prevent overlapping cycles (timer overlap can spam leads)
  private isProcessingCycle = false;
  private onFollowUpReady: FollowUpCallback | null = null;
  private onScheduledContactReady: ScheduledContactCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1000);
    // Aguardar 30s antes da primeira execução para não sobrecarregar na inicialização
    setTimeout(() => this.processFollowUps(), 30 * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [FOLLOW-UP] Serviço parado");
  }

  registerFollowUpCallback(callback: FollowUpCallback) {
    this.onFollowUpReady = callback;
    console.log("📲 [FOLLOW-UP] Callback registrado");
  }

  registerScheduledContactCallback(callback: ScheduledContactCallback) {
    this.onScheduledContactReady = callback;
    console.log("📲 [AGENDAMENTO] Callback registrado");
  }

  /**
   * Processa conversas pendentes de follow-up
   */
  private async processFollowUps() {
    if (this.isProcessingCycle) {
      console.log("⏭️ [FOLLOW-UP] Verificação anterior ainda em execução, pulando ciclo para evitar duplicatas");
      return;
    }

    this.isProcessingCycle = true;
    try {
      // 🛡️ Verificar config global antes de processar
      const globalConfig = await getAdminFollowupGlobalConfig();
      if (!globalConfig.isEnabled) {
        console.log("🛑 [FOLLOW-UP] Follow-up global DESATIVADO na config do admin. Pulando ciclo.");
        return;
      }

      const now = new Date();

      // Buscar conversas que precisam de follow-up
      const pendingConversations = await db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.followupActive, true),
          lte(adminConversations.nextFollowupAt, now)
        )
      });

      if (pendingConversations.length > 0) {
        console.log(`🔍 [FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }

      for (const conv of pendingConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("❌ [FOLLOW-UP] Erro ao processar follow-ups:", error);
    }
    finally {
      this.isProcessingCycle = false;
    }
  }

  /**
   * Executa a lógica de follow-up para uma conversa específica
   */
  private async executeFollowUp(conversation: typeof adminConversations.$inferSelect) {
    console.log(`👉 [FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      // 🛡️ Ler config global do admin
      const globalConfig = await getAdminFollowupGlobalConfig();

      // 🛡️ FOLLOW-UP FOR NON-PAYERS - Check payment status and toggle
      const followupForNonPayers = conversation.followupForNonPayers ?? true;
      const paymentStatus = conversation.paymentStatus ?? 'pending';

      // Se pagamento confirmado, nunca enviar follow-up
      if (paymentStatus === 'paid') {
        console.log(`🛑 [FOLLOW-UP] Client already paid. Skipping.`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Client already paid', undefined, 'paid', 'paid', conversation.followupStage || 0);
        await this.disableFollowUp(conversation.id, "Cliente já pagou");
        return;
      }

      // 🛡️ Se follow-up para não pagantes está desativado GLOBALMENTE e o status é não pago
      if (!globalConfig.followupNonPayersEnabled && paymentStatus === 'unpaid') {
        console.log(`🛑 [FOLLOW-UP] Follow-up para não pagantes DESATIVADO globalmente. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0);
        await this.scheduleNextFollowUp(conversation, 24 * 60); // Reagendar para checar amanhã
        return;
      }

      // 🛡️ Se follow-up para não pagantes está desativado NA CONVERSA e o status é não pago
      if (!followupForNonPayers && (paymentStatus === 'unpaid' || paymentStatus === 'pending')) {
        console.log(`🛑 [FOLLOW-UP] Follow-up para não pagantes desativado nesta conversa. Pulando ${conversation.contactNumber}`);
        await this.logFollowUp(conversation.id, conversation.contactNumber, 'skipped', 'Follow-up não pagantes desativado nesta conversa', undefined, paymentStatus, 'non_payer', conversation.followupStage || 0);
        return;
      }

      // Anti-spam: if a follow-up was sent very recently, do not send again.
      // Protects against accidental re-entry/retries and avoids flooding the lead.
      try {
        const recent = await db.query.followupLogs.findFirst({
          where: and(
            eq(followupLogs.conversationId, conversation.id),
            eq(followupLogs.status, 'sent'),
          ),
          orderBy: (logs, { desc }) => [desc(logs.executedAt)],
        });

        if (recent?.executedAt) {
          const ageMs = Date.now() - new Date(recent.executedAt as any).getTime();
          const cooldownMs = 7 * 60 * 1000;
          if (Number.isFinite(ageMs) && ageMs >= 0 && ageMs < cooldownMs) {
            console.log(`??? [FOLLOW-UP] Cooldown ativo (${Math.round(ageMs / 1000)}s) para ${conversation.contactNumber}, evitando spam`);
            await this.scheduleNextFollowUp(conversation, 30);
            return;
          }
        }
      } catch (cooldownErr) {
        console.warn('?? [FOLLOW-UP] Falha ao checar cooldown, continuando:', cooldownErr);
      }

      // ⚠️ IMPORTANTE: Follow-up é INDEPENDENTE da IA!
      // A desativação da IA (isAgentEnabled) NÃO deve cancelar o follow-up
      // Follow-up só deve ser cancelado quando:
      // 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
      // 2. Toggle individual na conversa está desativado (conversations.followupActive)

      // Verificar se o follow-up está ativo para esta conversa
      // Se followupActive for false, NÃO enviar mensagem
      if (!conversation.followupActive) {
        console.log(`🛑 [FOLLOW-UP] Follow-up desativado para ${conversation.contactNumber}. Cancelando.`);
        await this.disableFollowUp(conversation.id, "Follow-up desativado manualmente");
        return;
      }

      // 1. Analisar histórico com IA para decidir ação
      const decision = await this.analyzeWithAI(conversation);

      if (decision.action === 'abort') {
        console.log(`🛑 [FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id);
        return;
      }

      if (decision.action === 'wait') {
        console.log(`⏳ [FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        // Adiar por 24h ou conforme sugerido (simplificado para 24h aqui)
        await this.scheduleNextFollowUp(conversation, 24 * 60);
        return;
      }

      // 2. Se ação for 'send', disparar callback
      if (decision.action === 'send') {
        if (this.onFollowUpReady) {
          console.log(`📤 [FOLLOW-UP] Disparando callback para ${conversation.contactNumber}`);

          // O callback espera (phoneNumber, context, attempt, type)
          // Vamos adaptar os parâmetros
          const attempt = (conversation.followupStage || 0) + 1;
          const type = attempt >= FOLLOW_UP_SCHEDULE.length ? 'final' : 'reminder';

          const result = await this.onFollowUpReady(
            conversation.contactNumber,
            decision.context || "Follow-up automático",
            attempt,
            type
          );

          // Log result with enhanced details
          try {
            if (result && typeof result === 'object') {
               await this.logFollowUp(conversation.id, conversation.contactNumber, result.success ? 'sent' : 'failed', result.message, result.error, paymentStatus, type, attempt);
            } else {
               // Fallback for void return (backward compatibility)
               await this.logFollowUp(conversation.id, conversation.contactNumber, 'sent', 'Mensagem enviada (conteúdo não capturado)', undefined, paymentStatus, type, attempt);
            }
          } catch (logError) {
            console.error("Erro ao logar follow-up:", logError);
          }

          // Agendar próximo estágio
          await this.scheduleNextFollowUp(conversation);
        } else {
          console.warn("⚠️ [FOLLOW-UP] Callback não registrado! Mensagem não enviada.");
        }
      }

    } catch (error) {
      console.error(`❌ [FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    }
  }

  /**
   * Enhanced log function with payment status and follow-up type
   */
  private async logFollowUp(
    conversationId: string,
    contactNumber: string,
    status: string,
    messageContent: string | undefined,
    errorReason: string | undefined,
    paymentStatus: string,
    followupType: string,
    stage: number | undefined
  ): Promise<void> {
    try {
      await db.insert(followupLogs).values({
        conversationId,
        contactNumber,
        status,
        messageContent,
        errorReason,
        paymentStatus,
        followupType,
        stage,
      });
    } catch (logError) {
      console.error("Erro ao logar follow-up:", logError);
    }
  }

  /**
   * Usa IA para analisar se deve enviar follow-up
   */
  private async analyzeWithAI(conversation: typeof adminConversations.$inferSelect): Promise<{
    action: 'send' | 'wait' | 'abort';
    reason: string;
    context?: string;
  }> {
    // Fetch messages
    const messages = await db.query.adminMessages.findMany({
      where: eq(adminMessages.conversationId, conversation.id),
      orderBy: (adminMessages, { asc }) => [asc(adminMessages.timestamp)],
      limit: 20
    });
    
    const lastMessages = messages.map(m => ({
      role: m.fromMe ? "assistant" : "user",
      content: m.text || (m.mediaType ? `[Mídia: ${m.mediaType}]` : "")
    }));

    const prompt = `
      Analise esta conversa de vendas e decida o próximo passo para o sistema de follow-up automático.
      
      Contexto:
      - O cliente parou de responder.
      - Estamos no estágio ${conversation.followupStage} de follow-up.
      - Objetivo: Reengajar o cliente para fechar a venda.
      
      Histórico recente:
      ${JSON.stringify(lastMessages, null, 2)}
      
      Regras de Decisão CRÍTICAS:
      1. ABORT ('abort'): 
         - Se o cliente JÁ FECHOU/CONTRATOU (ex: "já paguei", "fechado", "contratado").
         - Se o cliente disse explicitamente "não tenho interesse", "pare de mandar mensagem".
      
      2. WAIT ('wait'): 
         - Se o cliente está AGUARDANDO UMA RESPOSTA NOSSA (ex: fez uma pergunta e não respondemos ainda).
         - Se o cliente disse "vou ver e te aviso", "falo com você amanhã".
      
      3. SEND ('send'): 
         - Se o cliente simplesmente parou de responder e faz sentido tentar reengajar.
         - Se o cliente não fechou e não estamos devendo resposta.
      
      Responda APENAS um JSON:
      {
        "action": "send" | "wait" | "abort",
        "reason": "breve explicação",
        "context": "dicas para a mensagem de follow-up (ex: focar em benefícios, perguntar se ficou dúvida)"
      }
    `;

    try {
      const mistral = await getLLMClient();
      // Usa modelo configurado no banco de dados (sem hardcode)
      const response = await mistral.chat.complete({
        messages: [{ role: "user", content: prompt }]
      });
      const content = response.choices?.[0]?.message?.content || "";
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      return JSON.parse(jsonStr);
    } catch (e) {
      console.error("Erro na análise de IA:", e);
      return { action: 'wait', reason: "Erro na análise de IA" };
    }
  }

  /**
   * Agenda o próximo follow-up ou finaliza se acabou a sequência
   * Uses configurable periodicity from global admin config and conversation config
   */
  private async scheduleNextFollowUp(conversation: typeof adminConversations.$inferSelect, customDelayMinutes?: number) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;

    // 🛡️ Ler config global para periodicidade
    const globalConfig = await getAdminFollowupGlobalConfig();

    // Get config from conversation or use defaults
    const convConfig = conversation.followupConfig || {
      enabled: true,
      maxAttempts: 8,
      intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
      finalMinDays: 15,
      finalMaxDays: 30,
      businessHoursStart: "09:00",
      businessHoursEnd: "18:00",
      respectBusinessHours: true,
      tone: "friendly",
      formalityLevel: 3,
      useEmojis: true,
    };

    // 🛡️ Usar periodicidade da config global do admin (tem prioridade)
    const finalMinDays = globalConfig.infiniteLoopMinDays ?? convConfig.finalMinDays ?? 15;
    const finalMaxDays = globalConfig.infiniteLoopMaxDays ?? convConfig.finalMaxDays ?? 30;

    if (customDelayMinutes) {
      const nextDate = new Date(Date.now() + customDelayMinutes * 60 * 1000);
      await db.update(adminConversations)
        .set({ nextFollowupAt: nextDate })
        .where(eq(adminConversations.id, conversation.id));
      return;
    }

    if (currentStage >= convConfig.intervalsMinutes.length) {
      // 🔄 Loop infinito com periodicidade configurável
      const range = Math.max(1, finalMaxDays - finalMinDays);
      const randomDelay = Math.floor(Math.random() * (range + 1) + finalMinDays);
      const nextDate = new Date(Date.now() + randomDelay * 24 * 60 * 60 * 1000);

      console.log(`🔄 [FOLLOW-UP] Ciclo infinito: Agendando próximo para daqui a ${randomDelay} dias (config: ${finalMinDays}-${finalMaxDays}d)`);

      await db.update(adminConversations)
        .set({
          followupStage: nextStage, // Continua incrementando para saber quantas vezes já tentou
          nextFollowupAt: nextDate
        })
        .where(eq(adminConversations.id, conversation.id));

    } else {
      const delayMinutes = convConfig.intervalsMinutes[currentStage];
      const nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);

      await db.update(adminConversations)
        .set({
          followupStage: nextStage,
          nextFollowupAt: nextDate
        })
        .where(eq(adminConversations.id, conversation.id));
    }
  }

  /**
   * Desativa o follow-up para uma conversa
   */
  async disableFollowUp(conversationId: string, reason: string = "Cancelado manualmente") {
    console.log(`🛑 [FOLLOW-UP] Desativando follow-up para conversa ${conversationId}. Motivo: ${reason}`);

    // Get conversation first to log with payment status
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });

    if (conversation) {
      // Force update regardless of current state to ensure it sticks
      await db.update(adminConversations)
        .set({
          followupActive: false,
          nextFollowupAt: null,
          followupStage: 0 // Reset stage too just in case
        })
        .where(eq(adminConversations.id, conversationId));

      console.log(`✅ [FOLLOW-UP] Sucesso ao desativar follow-up para ${conversation.contactNumber}. Active: ${conversation.followupActive}`);

      // Log cancellation with payment status
      await this.logFollowUp(
        conversation.id,
        conversation.contactNumber,
        'cancelled',
        reason,
        undefined,
        conversation.paymentStatus || 'pending',
        'cancelled',
        conversation.followupStage || 0
      );
    } else {
      console.warn(`⚠️ [FOLLOW-UP] Falha ao desativar: Conversa ${conversationId} não encontrada ou update falhou.`);
    }
  }

  /**
   * Inicia o ciclo de follow-up para uma nova conversa (ou reinicia)
   */
  async scheduleInitialFollowUp(conversationId: string) {
    // 🔧 FIX: NÃO resetar se follow-up já está ativo e agendado!
    // Antes: cada mensagem manual do admin resetava para estágio 0 + 10min,
    // destruindo o progresso de follow-up (ex: estágio 5 voltava para 0).
    const existing = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.id, conversationId)
    });
    
    if (existing?.followupActive && existing?.nextFollowupAt) {
      console.log(`ℹ️ [FOLLOW-UP] Follow-up já ativo para ${conversationId} (stage=${existing.followupStage}, next=${new Date(existing.nextFollowupAt).toLocaleString()}). NÃO resetando.`);
      return;
    }
    
    const delayMinutes = FOLLOW_UP_SCHEDULE[0];
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.update(adminConversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate
      })
      .where(eq(adminConversations.id, conversationId));
      
    console.log(`✅ [FOLLOW-UP] Agendado inicial para conversa ${conversationId} em ${delayMinutes} min`);
  }

  /**
   * Helper para agendar pelo telefone (busca a conversa mais recente)
   */
  async scheduleInitialFollowUpByPhone(phoneNumber: string) {
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.contactNumber, phoneNumber),
      orderBy: (adminConversations, { desc }) => [desc(adminConversations.lastMessageTime)]
    });

    if (conversation) {
      await this.scheduleInitialFollowUp(conversation.id);
    } else {
      console.warn(`⚠️ [FOLLOW-UP] Conversa não encontrada para ${phoneNumber} ao tentar agendar follow-up inicial`);
    }
  }

  /**
   * Cancela follow-up ativo para um telefone (MANUALMENTE)
   */
  async cancelFollowUpByPhone(phoneNumber: string) {
    const conversation = await db.query.adminConversations.findFirst({
      where: eq(adminConversations.contactNumber, phoneNumber)
    });

    if (conversation) {
      await this.disableFollowUp(conversation.id, "Cancelado pelo usuário");
      console.log(`🛑 [FOLLOW-UP] Cancelado manualmente para ${phoneNumber}`);
    }
  }

  /**
   * Reseta ciclo quando cliente responde
   */
  async resetFollowUpCycle(phoneNumber: string) {
    // NOVA LÓGICA: Se o cliente respondeu, não cancelamos permanentemente.
    // Apenas resetamos o ciclo para o estágio 0 (10 minutos após a resposta).
    // Isso garante que se ele parar de responder de novo, o follow-up volta.
    
    const delayMinutes = FOLLOW_UP_SCHEDULE[0]; // 10 minutos
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.update(adminConversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate
      })
      .where(eq(adminConversations.contactNumber, phoneNumber));
      
    console.log(`🔄 [FOLLOW-UP] Cliente respondeu. Ciclo resetado para 10min (Estágio 0) para ${phoneNumber}`);
  }

  // ============================================================================
  // GETTERS PARA O CALENDÁRIO
  // ============================================================================

  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(status?: string) {
    const whereClause = status ? eq(followupLogs.status, status) : undefined;
    
    return await db.query.followupLogs.findMany({
      where: whereClause,
      orderBy: (followupLogs, { desc }) => [desc(followupLogs.executedAt)],
      limit: 100
    });
  }

  /**
   * Retorna eventos para o calendário (follow-ups futuros)
   */
  async getCalendarEvents() {
    const now = new Date();
    
    // Buscar conversas com follow-up ativo
    const activeFollowUps = await db.query.adminConversations.findMany({
      where: and(
        eq(adminConversations.followupActive, true),
        // Trazer apenas os futuros ou atrasados (não nulos)
        lte(adminConversations.nextFollowupAt, new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)) // Próximos 30 dias
      )
    });

    // Double check filtering just in case DB returns stale data (unlikely but safe)
    const validFollowUps = activeFollowUps.filter(c => c.followupActive === true);

    return validFollowUps.map(conv => ({
      id: conv.id, // Use ID directly for easier deletion
      phoneNumber: conv.contactNumber,
      type: 'followup',
      title: `Follow-up #${(conv.followupStage || 0) + 1}`,
      scheduledAt: conv.nextFollowupAt,
      status: conv.nextFollowupAt && conv.nextFollowupAt < now ? 'overdue' : 'pending',
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
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const nextWeek = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    
    const events = await this.getCalendarEvents();
    
    const stats = {
      pending: events.filter(e => e.status === 'pending' || e.status === 'overdue').length,
      scheduledToday: events.filter(e => 
        e.scheduledAt && 
        new Date(e.scheduledAt) >= today && 
        new Date(e.scheduledAt) < new Date(today.getTime() + 24 * 60 * 60 * 1000)
      ).length,
      scheduledThisWeek: events.filter(e => 
        e.scheduledAt && 
        new Date(e.scheduledAt) >= today && 
        new Date(e.scheduledAt) < nextWeek
      ).length,
      byType: {} as Record<string, number>,
    };
    
    events.forEach(e => {
      stats.byType[e.type] = (stats.byType[e.type] || 0) + 1;
    });
    
    return stats;
  }
}

export let followUpService = new FollowUpService();

// ============================================================================
// FUNÇÕES LEGADAS / COMPATIBILIDADE
// ============================================================================

export function registerFollowUpCallback(callback: FollowUpCallback) {
  followUpService.registerFollowUpCallback(callback);
}

export function registerScheduledContactCallback(callback: ScheduledContactCallback) {
  followUpService.registerScheduledContactCallback(callback);
}

export let scheduleAutoFollowUp = function(phoneNumber: string, delayMinutes: number, context: string) {
    // TODO: Implementar compatibilidade se necessário, ou migrar chamadas antigas
    // Por enquanto, apenas loga
    console.warn("⚠️ scheduleAutoFollowUp (legacy) chamado - migrar para scheduleInitialFollowUp");
}

export let cancelFollowUp = function(phoneNumber: string) {
  followUpService.cancelFollowUpByPhone(phoneNumber);
}

export let scheduleContact = function(phoneNumber: string, date: Date, reason: string) {
    // TODO: Implementar agendamento pontual
}

export let parseScheduleFromText = function(text: string): Date | null {
  const now = new Date();
  const lowerText = text.toLowerCase();
  
  // Amanhã
  if (lowerText.includes('amanhã') || lowerText.includes('amanha')) {
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Tentar extrair hora
    const hourMatch = text.match(/(\d{1,2})\s*(?:h|hora|:)/i);
    if (hourMatch) {
      tomorrow.setHours(parseInt(hourMatch[1]), 0, 0, 0);
    } else {
      tomorrow.setHours(10, 0, 0, 0); // Padrão: 10h
    }
    
    return tomorrow;
  }
  
  // Próxima semana / segunda / terça etc
  const weekdays = ['domingo', 'segunda', 'terça', 'terca', 'quarta', 'quinta', 'sexta', 'sábado', 'sabado'];
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
  
  // Daqui X dias/horas
  const inXMatch = text.match(/daqui\s*(?:a\s*)?(\d+)\s*(dia|hora|minuto)/i);
  if (inXMatch) {
    const amount = parseInt(inXMatch[1]);
    const unit = inXMatch[2].toLowerCase();
    const target = new Date(now);
    
    if (unit.startsWith('dia')) {
      target.setDate(target.getDate() + amount);
      target.setHours(10, 0, 0, 0);
    } else if (unit.startsWith('hora')) {
      target.setHours(target.getHours() + amount);
    } else if (unit.startsWith('minuto')) {
      target.setMinutes(target.getMinutes() + amount);
    }
    
    return target;
  }
  
  return null;
}

export function setMockFollowUpFunctions(mocks: any) {
  if (mocks.cancelFollowUp) cancelFollowUp = mocks.cancelFollowUp;
  if (mocks.scheduleAutoFollowUp) scheduleAutoFollowUp = mocks.scheduleAutoFollowUp;
  if (mocks.scheduleContact) scheduleContact = mocks.scheduleContact;
  if (mocks.followUpService) followUpService = mocks.followUpService;
}

