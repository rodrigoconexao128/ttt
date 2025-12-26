import { db } from "./db";
import { 
  conversations, 
  userFollowupLogs, 
  followupConfigs,
  messages,
  whatsappConnections,
  users
} from "@shared/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { getMistralClient } from "./mistralClient";

// ============================================================================
// FOLLOW-UP INTELIGENTE PARA USUÁRIOS
// Serviço que gerencia follow-ups automáticos para cada agente de usuário
// ============================================================================

// Intervalos padrão em minutos
const DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

type FollowUpCallback = (
  userId: string,
  conversationId: string,
  phoneNumber: string,
  remoteJid: string,
  message: string,
  stage: number
) => Promise<{ success: boolean; error?: string }>;

export class UserFollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private onFollowUpReady: FollowUpCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [USER-FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada minuto
    this.checkInterval = setInterval(() => this.processFollowUps(), 60 * 1000);
    // Executar imediatamente ao iniciar
    setTimeout(() => this.processFollowUps(), 5000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [USER-FOLLOW-UP] Serviço parado");
  }

  registerCallback(callback: FollowUpCallback) {
    this.onFollowUpReady = callback;
    console.log("📲 [USER-FOLLOW-UP] Callback registrado");
  }

  /**
   * Processa todas as conversas pendentes de follow-up
   */
  private async processFollowUps() {
    try {
      const now = new Date();
      
      // Buscar conversas que precisam de follow-up
      const pendingConversations = await db.query.conversations.findMany({
        where: and(
          eq(conversations.followupActive, true),
          isNotNull(conversations.nextFollowupAt),
          lte(conversations.nextFollowupAt, now)
        ),
        with: {
          connection: {
            with: {
              user: true
            }
          }
        }
      });

      if (pendingConversations.length > 0) {
        console.log(`🔍 [USER-FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }

      for (const conv of pendingConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("❌ [USER-FOLLOW-UP] Erro ao processar follow-ups:", error);
    }
  }

  /**
   * Executa follow-up para uma conversa específica
   */
  private async executeFollowUp(conversation: any) {
    const userId = conversation.connection?.userId;
    if (!userId) {
      console.warn(`⚠️ [USER-FOLLOW-UP] Conversa ${conversation.id} sem userId`);
      return;
    }

    console.log(`👉 [USER-FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      // 1. Buscar configuração de follow-up do usuário
      const config = await this.getFollowupConfig(userId);
      if (!config || !config.isEnabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up desativado para usuário ${userId}`);
        await this.disableFollowUp(conversation.id, "Usuário desativou follow-up");
        return;
      }

      // 2. Verificar horário comercial
      if (config.respectBusinessHours && !this.isBusinessHours(config)) {
        console.log(`⏰ [USER-FOLLOW-UP] Fora do horário comercial para ${conversation.contactNumber}`);
        // Agendar para o próximo horário comercial
        const nextBusinessTime = this.getNextBusinessTime(config);
        await this.scheduleNextFollowUp(conversation.id, nextBusinessTime);
        return;
      }

      // 3. Analisar histórico com IA
      const decision = await this.analyzeWithAI(conversation, config);
      
      if (decision.action === 'abort') {
        console.log(`🛑 [USER-FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id, decision.reason);
        await this.logFollowUp(conversation, userId, 'cancelled', null, decision, decision.reason);
        return;
      }

      if (decision.action === 'wait') {
        console.log(`⏳ [USER-FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        // Adiar por 24h
        const nextDate = new Date(Date.now() + 24 * 60 * 60 * 1000);
        await this.scheduleNextFollowUp(conversation.id, nextDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason);
        return;
      }

      // 4. Gerar mensagem de follow-up
      if (decision.action === 'send' && decision.message) {
        if (this.onFollowUpReady && conversation.remoteJid) {
          console.log(`📤 [USER-FOLLOW-UP] Disparando follow-up para ${conversation.contactNumber}`);
          
          const result = await this.onFollowUpReady(
            userId,
            conversation.id,
            conversation.contactNumber,
            conversation.remoteJid,
            decision.message,
            conversation.followupStage || 0
          );

          await this.logFollowUp(
            conversation, 
            userId, 
            result.success ? 'sent' : 'failed', 
            decision.message, 
            decision, 
            result.error
          );
          
          if (result.success) {
            // Sucesso: Agendar próximo estágio
            await this.advanceToNextStage(conversation, config);
          } else {
            // Falha (ex: WhatsApp desconectado): Reagendar para tentar em 5 minutos
            console.log(`⚠️ [USER-FOLLOW-UP] Falha ao enviar, reagendando em 5 minutos: ${result.error}`);
            const retryDate = new Date(Date.now() + 5 * 60 * 1000);
            await db.update(conversations)
              .set({ 
                nextFollowupAt: retryDate,
                followupDisabledReason: `⚠️ Aguardando conexão: ${result.error}`
              })
              .where(eq(conversations.id, conversation.id));
          }
        } else {
          console.warn("⚠️ [USER-FOLLOW-UP] Callback não registrado ou remoteJid ausente");
          // Reagendar para tentar em 5 minutos
          const retryDate = new Date(Date.now() + 5 * 60 * 1000);
          await db.update(conversations)
            .set({ nextFollowupAt: retryDate })
            .where(eq(conversations.id, conversation.id));
        }
      }

    } catch (error) {
      console.error(`❌ [USER-FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    }
  }

  /**
   * Busca ou cria configuração de follow-up para o usuário
   */
  async getFollowupConfig(userId: string) {
    let config = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (!config) {
      // Criar configuração padrão
      const [newConfig] = await db.insert(followupConfigs).values({
        userId,
        isEnabled: true,
        maxAttempts: 8,
        intervalsMinutes: DEFAULT_INTERVALS,
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00",
        businessDays: [1, 2, 3, 4, 5],
        respectBusinessHours: true,
        tone: "consultivo",
        formalityLevel: 5,
        useEmojis: true,
        importantInfo: [],
        infiniteLoop: true,
        infiniteLoopMinDays: 15,
        infiniteLoopMaxDays: 30,
      }).returning();
      config = newConfig;
    }

    return config;
  }

  /**
   * Atualiza configuração de follow-up
   */
  async updateFollowupConfig(userId: string, data: Partial<typeof followupConfigs.$inferInsert>) {
    const existing = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (existing) {
      const [updated] = await db.update(followupConfigs)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(followupConfigs.userId, userId))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(followupConfigs)
        .values({ userId, ...data })
        .returning();
      return created;
    }
  }

  /**
   * Usa IA para analisar se deve enviar follow-up e qual mensagem
   */
  private async analyzeWithAI(conversation: any, config: any): Promise<{
    action: 'send' | 'wait' | 'abort';
    reason: string;
    message?: string;
    context?: string;
  }> {
    // Buscar mensagens recentes
    const recentMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversation.id),
      orderBy: (messages, { desc }) => [desc(messages.timestamp)],
      limit: 15
    });

    const historyFormatted = recentMessages
      .reverse()
      .map(m => ({
        role: m.fromMe ? "assistant" : "user",
        content: m.text || (m.mediaType ? `[Mídia: ${m.mediaType}]` : "")
      }));

    // Preparar informações importantes não usadas
    const importantInfo = (config.importantInfo || [])
      .filter((info: any) => !info.usado)
      .map((info: any) => `- ${info.titulo}: ${info.conteudo}`)
      .join("\n");

    const toneMap: Record<string, string> = {
      'consultivo': 'consultivo e prestativo, focando em ajudar o cliente a tomar a melhor decisão',
      'vendedor': 'vendedor persuasivo mas não agressivo, destacando benefícios e urgência sutil',
      'humano': 'extremamente humanizado e casual, como um amigo que está ajudando',
      'técnico': 'técnico e profissional, focando em detalhes e especificações'
    };

    const prompt = `
Você é um especialista em follow-up de vendas. Analise esta conversa e decida o próximo passo.

## CONTEXTO
- Estágio atual do follow-up: ${conversation.followupStage || 0}
- Tom desejado: ${toneMap[config.tone] || toneMap.consultivo}
- Nível de formalidade: ${config.formalityLevel}/10
- Usar emojis: ${config.useEmojis ? 'Sim, moderadamente' : 'Não'}

## INFORMAÇÕES IMPORTANTES (ainda não mencionadas)
${importantInfo || 'Nenhuma informação adicional disponível'}

## HISTÓRICO DA CONVERSA
${JSON.stringify(historyFormatted, null, 2)}

## REGRAS CRÍTICAS
1. ABORT se:
   - Cliente já comprou/contratou ("fechado", "paguei", "contratado")
   - Cliente disse claramente "não tenho interesse", "pare de enviar"
   - Cliente bloqueou ou não responde há mais de 30 dias

2. WAIT se:
   - Estamos devendo uma resposta ao cliente
   - Cliente disse "vou pensar e te aviso"
   - Última mensagem do cliente foi há menos de 2 horas

3. SEND se:
   - Cliente parou de responder e faz sentido retomar
   - Podemos agregar valor com informação nova
   - É um bom momento para reengajar

## ESTRATÉGIAS DE FOLLOW-UP (escolha uma)
- Valor: compartilhar informação útil sem pressão
- Esclarecimento: tirar dúvida comum
- Leve: retomar sem pressão ("oi, só passando pra ver se ficou dúvida")
- Autoridade: mencionar experiência/casos similares
- Loop aberto: fazer pergunta que estimule resposta

## RESPOSTA
Responda APENAS um JSON válido:
{
  "action": "send" | "wait" | "abort",
  "reason": "explicação breve",
  "message": "mensagem de follow-up (APENAS se action = send, máximo 300 caracteres)",
  "strategy": "qual estratégia usou"
}
`;

    try {
      const mistral = await getMistralClient();
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }]
      });
      
      const rawContent = response.choices?.[0]?.message?.content || "";
      // Garantir que content é string
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Tentar parsear JSON
      const parsed = JSON.parse(jsonStr);
      return {
        action: parsed.action || 'wait',
        reason: parsed.reason || 'Decisão da IA',
        message: parsed.message,
        context: parsed.strategy
      };
    } catch (e) {
      console.error("Erro na análise de IA:", e);
      return { action: 'wait', reason: "Erro na análise de IA" };
    }
  }

  /**
   * Verifica se está em horário comercial
   */
  private isBusinessHours(config: any): boolean {
    const now = new Date();
    const currentDay = now.getDay(); // 0 = domingo
    const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"

    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    if (!businessDays.includes(currentDay)) {
      return false;
    }

    const start = config.businessHoursStart || "09:00";
    const end = config.businessHoursEnd || "18:00";

    return currentTime >= start && currentTime <= end;
  }

  /**
   * Calcula próximo horário comercial disponível
   */
  private getNextBusinessTime(config: any): Date {
    const now = new Date();
    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    const start = config.businessHoursStart || "09:00";
    const [startHour, startMin] = start.split(':').map(Number);

    // Próximo dia útil às 9h
    let next = new Date(now);
    next.setHours(startHour, startMin, 0, 0);

    // Se já passou do horário de início hoje, ir para amanhã
    if (now >= next) {
      next.setDate(next.getDate() + 1);
    }

    // Avançar até encontrar um dia útil
    while (!businessDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    return next;
  }

  /**
   * Avança para o próximo estágio de follow-up
   */
  private async advanceToNextStage(conversation: any, config: any) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;
    const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;

    let nextDate: Date;

    if (nextStage >= intervals.length) {
      if (config.infiniteLoop) {
        // Loop infinito: aleatorizar entre min e max dias
        const minDays = config.infiniteLoopMinDays || 15;
        const maxDays = config.infiniteLoopMaxDays || 30;
        const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1) + minDays);
        nextDate = new Date(Date.now() + randomDays * 24 * 60 * 60 * 1000);
        console.log(`🔄 [USER-FOLLOW-UP] Loop infinito: próximo em ${randomDays} dias`);
      } else {
        // Desativar follow-up
        await this.disableFollowUp(conversation.id, "Sequência completa");
        return;
      }
    } else {
      // FIX: Usar o intervalo do PRÓXIMO estágio, não do atual
      const delayMinutes = intervals[nextStage];
      nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);
      console.log(`⏰ [USER-FOLLOW-UP] Estágio ${currentStage} → ${nextStage}, intervalo: ${delayMinutes} minutos`);
    }

    await db.update(conversations)
      .set({ 
        followupStage: nextStage,
        nextFollowupAt: nextDate 
      })
      .where(eq(conversations.id, conversation.id));

    console.log(`📅 [USER-FOLLOW-UP] Próximo follow-up agendado para ${nextDate.toLocaleString()}`);
  }

  /**
   * Agenda próximo follow-up para uma data específica
   */
  private async scheduleNextFollowUp(conversationId: string, date: Date) {
    await db.update(conversations)
      .set({ nextFollowupAt: date })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Desativa follow-up para uma conversa
   */
  async disableFollowUp(conversationId: string, reason: string = "Desativado") {
    console.log(`🛑 [USER-FOLLOW-UP] Desativando para conversa ${conversationId}. Motivo: ${reason}`);
    
    await db.update(conversations)
      .set({ 
        followupActive: false, 
        nextFollowupAt: null,
        followupDisabledReason: reason
      })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Ativa follow-up para uma conversa
   */
  async enableFollowUp(conversationId: string) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível ativar follow-up: userId não encontrado`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    
    // Se follow-up não está habilitado para este usuário, não ativar
    if (!config?.isEnabled) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up desabilitado para usuário ${userId}`);
      return;
    }

    const intervals = config?.intervalsMinutes || DEFAULT_INTERVALS;
    const delayMinutes = intervals[0] || 10;
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));

    console.log(`✅ [USER-FOLLOW-UP] Ativado para conversa ${conversationId}`);
  }

  /**
   * Reseta o ciclo quando o cliente responde
   */
  async resetFollowUpCycle(conversationId: string, reason?: string) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível resetar follow-up: userId não encontrado`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    const intervals = config?.intervalsMinutes || DEFAULT_INTERVALS;
    const delayMinutes = intervals[0] || 10;
    const nextDate = new Date(Date.now() + delayMinutes * 60 * 1000);

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`🔄 [USER-FOLLOW-UP] ${reason || 'Cliente respondeu'}. Ciclo resetado para ${conversationId}`);
  }

  /**
   * Agenda um follow-up manual para uma data/hora específica
   */
  async scheduleManualFollowUp(conversationId: string, scheduledFor: Date, note?: string) {
    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: -1, // -1 indica agendamento manual
        nextFollowupAt: scheduledFor,
        followupDisabledReason: note ? `📅 Agendado: ${note}` : '📅 Agendamento manual'
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`📅 [USER-FOLLOW-UP] Agendamento manual criado para ${conversationId}: ${scheduledFor.toLocaleString()}`);
  }

  /**
   * Log de follow-up
   */
  private async logFollowUp(
    conversation: any, 
    userId: string, 
    status: string, 
    messageContent: string | null, 
    aiDecision: any, 
    errorReason?: string
  ) {
    try {
      await db.insert(userFollowupLogs).values({
        conversationId: conversation.id,
        userId,
        contactNumber: conversation.contactNumber,
        status,
        messageContent,
        aiDecision,
        stage: conversation.followupStage || 0,
        errorReason
      });
    } catch (error) {
      console.error("Erro ao logar follow-up:", error);
    }
  }

  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(userId: string, limit: number = 50) {
    return await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId),
      orderBy: (logs, { desc }) => [desc(logs.executedAt)],
      limit
    });
  }

  /**
   * Estatísticas de follow-up do usuário
   */
  async getFollowUpStats(userId: string) {
    const logs = await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId)
    });

    const pendingConversations = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      }
    });

    const userPending = pendingConversations.filter(c => c.connection?.userId === userId);

    return {
      totalSent: logs.filter(l => l.status === 'sent').length,
      totalFailed: logs.filter(l => l.status === 'failed').length,
      totalCancelled: logs.filter(l => l.status === 'cancelled').length,
      totalSkipped: logs.filter(l => l.status === 'skipped').length,
      pending: userPending.length,
      scheduledToday: userPending.filter(c => {
        if (!c.nextFollowupAt) return false;
        const today = new Date();
        const scheduled = new Date(c.nextFollowupAt);
        return scheduled.toDateString() === today.toDateString();
      }).length
    };
  }

  /**
   * Lista conversas com follow-up ativo do usuário
   */
  async getPendingFollowUps(userId: string) {
    const allPending = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      },
      orderBy: (conv, { asc }) => [asc(conv.nextFollowupAt)]
    });

    return allPending.filter(c => c.connection?.userId === userId);
  }
}

// Singleton
export const userFollowUpService = new UserFollowUpService();
