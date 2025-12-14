/**
 * TempClientService - Gerenciamento de clientes temporários
 * 
 * Responsável por:
 * - Criar/buscar clientes temporários
 * - Gerenciar estado de onboarding
 * - Controlar modo teste
 * - Agendar follow-ups
 * - Converter para conta real após pagamento
 */

import { db } from "./db";
import { tempClients, scheduledFollowUps, users, whatsappConnections, type TempClient, type InsertTempClient } from "@shared/schema";
import { eq, sql, and, lt, isNull, or } from "drizzle-orm";
import crypto from "crypto";

// Tipos de onboarding steps
export type OnboardingStep = 
  | "initial"           // Primeira mensagem
  | "collecting_type"   // Coletando tipo de negócio
  | "collecting_agent_name" // Coletando nome do agente
  | "collecting_role"   // Coletando função/papel do agente
  | "collecting_info"   // Coletando informações adicionais
  | "ready_to_test"     // Pronto para testar
  | "in_test"           // Em modo teste
  | "calibrating"       // Calibrando após sair do teste
  | "awaiting_payment"  // Aguardando pagamento
  | "converted";        // Convertido para conta real

// Tipos de follow-up
export type FollowUpType = 
  | "auto_10min"   // Automático após 10 min sem resposta
  | "auto_1h"      // Automático após 1 hora
  | "auto_24h"     // Automático após 24 horas
  | "scheduled"    // Cliente agendou
  | "manual";      // Admin agendou manualmente

// Interface para histórico de conversa
export interface ConversationMessage {
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
}

class TempClientService {
  private emailCounter = 0;

  /**
   * Gera email temporário único
   */
  private async generateTempEmail(): Promise<string> {
    // Buscar próximo número na sequência
    const result = await db.execute(sql`SELECT nextval('temp_email_seq') as seq`);
    const seq = (result.rows[0] as { seq: string }).seq;
    return `temp_${seq.padStart(6, '0')}@agentezap.temp`;
  }

  /**
   * Busca ou cria cliente temporário pelo número de telefone
   */
  async getOrCreateByPhone(phoneNumber: string): Promise<TempClient> {
    // Normalizar número
    const normalizedPhone = this.normalizePhone(phoneNumber);

    // Tentar buscar existente
    const existing = await db
      .select()
      .from(tempClients)
      .where(eq(tempClients.phoneNumber, normalizedPhone))
      .limit(1);

    if (existing.length > 0) {
      // Atualizar last_interaction_at
      await this.updateInteraction(existing[0].id);
      return existing[0];
    }

    // Criar novo
    const tempEmail = await this.generateTempEmail();
    const [newClient] = await db
      .insert(tempClients)
      .values({
        phoneNumber: normalizedPhone,
        tempEmail,
        onboardingStep: "initial",
        conversationHistory: [],
      })
      .returning();

    console.log(`[TempClient] Novo cliente temporário criado: ${normalizedPhone} (${tempEmail})`);
    return newClient;
  }

  /**
   * Normaliza número de telefone
   */
  private normalizePhone(phone: string): string {
    // Remove tudo exceto números
    let cleaned = phone.replace(/\D/g, '');
    // Adiciona código do país se necessário
    if (cleaned.length === 11 && cleaned.startsWith('9')) {
      cleaned = '55' + cleaned;
    } else if (cleaned.length === 10 || cleaned.length === 11) {
      cleaned = '55' + cleaned;
    }
    return cleaned;
  }

  /**
   * Atualiza timestamp de última interação e agenda próximo follow-up
   */
  async updateInteraction(clientId: string): Promise<void> {
    const now = new Date();
    const next10min = new Date(now.getTime() + 10 * 60 * 1000); // 10 minutos

    await db
      .update(tempClients)
      .set({
        lastInteractionAt: now,
        nextFollowUpAt: next10min,
        updatedAt: now,
      })
      .where(eq(tempClients.id, clientId));
  }

  /**
   * Atualiza etapa do onboarding
   */
  async updateOnboardingStep(clientId: string, step: OnboardingStep): Promise<TempClient> {
    const [updated] = await db
      .update(tempClients)
      .set({
        onboardingStep: step,
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    console.log(`[TempClient] Onboarding atualizado: ${clientId} -> ${step}`);
    return updated;
  }

  /**
   * Atualiza dados do negócio/agente coletados
   */
  async updateBusinessData(
    clientId: string,
    data: Partial<{
      businessName: string;
      businessType: string;
      agentName: string;
      agentRole: string;
      agentPrompt: string;
    }>
  ): Promise<TempClient> {
    const [updated] = await db
      .update(tempClients)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    return updated;
  }

  /**
   * Adiciona mensagem ao histórico de conversa
   */
  async addToHistory(
    clientId: string,
    role: "user" | "assistant",
    content: string
  ): Promise<void> {
    const client = await this.getById(clientId);
    if (!client) return;

    const history = (client.conversationHistory as ConversationMessage[]) || [];
    history.push({
      role,
      content,
      timestamp: new Date().toISOString(),
    });

    // Manter apenas últimas 50 mensagens
    const trimmedHistory = history.slice(-50);

    await db
      .update(tempClients)
      .set({
        conversationHistory: trimmedHistory,
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId));
  }

  /**
   * Busca cliente por ID
   */
  async getById(clientId: string): Promise<TempClient | null> {
    const [client] = await db
      .select()
      .from(tempClients)
      .where(eq(tempClients.id, clientId))
      .limit(1);

    return client || null;
  }

  /**
   * Busca cliente por número de telefone
   */
  async getByPhone(phoneNumber: string): Promise<TempClient | null> {
    const normalizedPhone = this.normalizePhone(phoneNumber);
    const [client] = await db
      .select()
      .from(tempClients)
      .where(eq(tempClients.phoneNumber, normalizedPhone))
      .limit(1);

    return client || null;
  }

  /**
   * Inicia modo teste
   */
  async startTestMode(clientId: string): Promise<TempClient> {
    const [updated] = await db
      .update(tempClients)
      .set({
        isInTestMode: true,
        testStartedAt: new Date(),
        testMessagesCount: 0,
        onboardingStep: "in_test",
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    console.log(`[TempClient] Modo teste iniciado: ${clientId}`);
    return updated;
  }

  /**
   * Sai do modo teste
   */
  async exitTestMode(clientId: string): Promise<TempClient> {
    const [updated] = await db
      .update(tempClients)
      .set({
        isInTestMode: false,
        onboardingStep: "calibrating",
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    console.log(`[TempClient] Modo teste encerrado: ${clientId}`);
    return updated;
  }

  /**
   * Incrementa contador de mensagens no teste
   */
  async incrementTestMessages(clientId: string): Promise<void> {
    await db
      .update(tempClients)
      .set({
        testMessagesCount: sql`test_messages_count + 1`,
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId));
  }

  // =====================================================
  // FOLLOW-UPS
  // =====================================================

  /**
   * Agenda um follow-up
   */
  async scheduleFollowUp(
    clientId: string,
    phoneNumber: string,
    type: FollowUpType,
    scheduledFor: Date,
    context?: Record<string, any>,
    message?: string
  ): Promise<void> {
    // Cancelar follow-ups pendentes do mesmo tipo
    await db
      .update(scheduledFollowUps)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(scheduledFollowUps.tempClientId, clientId),
          eq(scheduledFollowUps.status, "pending"),
          eq(scheduledFollowUps.type, type)
        )
      );

    // Criar novo
    await db
      .insert(scheduledFollowUps)
      .values({
        tempClientId: clientId,
        phoneNumber: this.normalizePhone(phoneNumber),
        type,
        message,
        scheduledFor,
        status: "pending",
        context: context || {},
      });

    console.log(`[TempClient] Follow-up agendado: ${type} para ${scheduledFor.toISOString()}`);
  }

  /**
   * Busca follow-ups pendentes que devem ser executados
   */
  async getPendingFollowUps(): Promise<Array<{
    id: string;
    tempClientId: string | null;
    phoneNumber: string;
    type: string;
    message: string | null;
    context: any;
    client: TempClient | null;
  }>> {
    const now = new Date();
    
    const pending = await db
      .select()
      .from(scheduledFollowUps)
      .where(
        and(
          eq(scheduledFollowUps.status, "pending"),
          lt(scheduledFollowUps.scheduledFor, now)
        )
      );

    // Enriquecer com dados do cliente
    const results = [];
    for (const followUp of pending) {
      let client: TempClient | null = null;
      if (followUp.tempClientId) {
        client = await this.getById(followUp.tempClientId);
      }
      results.push({
        ...followUp,
        client,
      });
    }

    return results;
  }

  /**
   * Marca follow-up como enviado
   */
  async markFollowUpSent(followUpId: string): Promise<void> {
    await db
      .update(scheduledFollowUps)
      .set({
        status: "sent",
        executedAt: new Date(),
      })
      .where(eq(scheduledFollowUps.id, followUpId));
  }

  /**
   * Marca follow-up como falhou
   */
  async markFollowUpFailed(followUpId: string): Promise<void> {
    await db
      .update(scheduledFollowUps)
      .set({
        status: "failed",
        executedAt: new Date(),
      })
      .where(eq(scheduledFollowUps.id, followUpId));
  }

  /**
   * Cancela todos os follow-ups de um cliente
   */
  async cancelAllFollowUps(clientId: string): Promise<void> {
    await db
      .update(scheduledFollowUps)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(scheduledFollowUps.tempClientId, clientId),
          eq(scheduledFollowUps.status, "pending")
        )
      );
  }

  // =====================================================
  // CONVERSÃO
  // =====================================================

  /**
   * Registra pagamento recebido
   */
  async registerPayment(clientId: string): Promise<TempClient> {
    const [updated] = await db
      .update(tempClients)
      .set({
        paymentReceived: true,
        onboardingStep: "awaiting_payment", // Ou outro step
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    console.log(`[TempClient] Pagamento registrado: ${clientId}`);
    return updated;
  }

  /**
   * Converte cliente temporário para conta real
   * Nota: A senha não é armazenada no banco users pois usamos Supabase Auth
   * O email é usado como identificador
   */
  async convertToRealUser(
    clientId: string,
    realEmail: string,
    _password?: string // Não usado - Supabase Auth gerencia senhas
  ): Promise<{ userId: string; tempClient: TempClient }> {
    const tempClient = await this.getById(clientId);
    if (!tempClient) {
      throw new Error("Cliente temporário não encontrado");
    }

    if (!tempClient.paymentReceived) {
      throw new Error("Pagamento não recebido");
    }

    // Criar usuário real (phone é obrigatório no schema)
    const [newUser] = await db
      .insert(users)
      .values({
        email: realEmail,
        name: tempClient.businessName || "Usuário",
        phone: tempClient.phoneNumber, // Usar o phone do temp client
        role: "user",
      })
      .returning();

    // Atualizar temp client
    const [updated] = await db
      .update(tempClients)
      .set({
        convertedToRealUser: true,
        realUserId: newUser.id,
        onboardingStep: "converted",
        updatedAt: new Date(),
      })
      .where(eq(tempClients.id, clientId))
      .returning();

    console.log(`[TempClient] Convertido para usuário real: ${clientId} -> ${newUser.id}`);
    return { userId: newUser.id, tempClient: updated };
  }

  // =====================================================
  // ESTATÍSTICAS
  // =====================================================

  /**
   * Retorna estatísticas dos clientes temporários
   */
  async getStats(): Promise<{
    total: number;
    byStep: Record<string, number>;
    inTest: number;
    converted: number;
    pending: number;
  }> {
    const all = await db.select().from(tempClients);
    
    const byStep: Record<string, number> = {};
    let inTest = 0;
    let converted = 0;
    
    for (const client of all) {
      byStep[client.onboardingStep] = (byStep[client.onboardingStep] || 0) + 1;
      if (client.isInTestMode) inTest++;
      if (client.convertedToRealUser) converted++;
    }

    return {
      total: all.length,
      byStep,
      inTest,
      converted,
      pending: all.filter(c => !c.convertedToRealUser && c.paymentReceived).length,
    };
  }

  /**
   * Busca todos os clientes que precisam de follow-up
   */
  async getClientsNeedingFollowUp(): Promise<TempClient[]> {
    const now = new Date();
    
    return await db
      .select()
      .from(tempClients)
      .where(
        and(
          eq(tempClients.convertedToRealUser, false),
          lt(tempClients.nextFollowUpAt!, now)
        )
      );
  }

  /**
   * Lista todos os agendamentos para o painel admin
   */
  async getAllScheduledFollowUps(status?: string): Promise<Array<{
    followUp: typeof scheduledFollowUps.$inferSelect;
    client: TempClient | null;
  }>> {
    let query = db.select().from(scheduledFollowUps);
    
    const results = status 
      ? await db.select().from(scheduledFollowUps).where(eq(scheduledFollowUps.status, status))
      : await db.select().from(scheduledFollowUps);

    const enriched = [];
    for (const followUp of results) {
      let client: TempClient | null = null;
      if (followUp.tempClientId) {
        client = await this.getById(followUp.tempClientId);
      }
      enriched.push({ followUp, client });
    }

    return enriched;
  }
}

export const tempClientService = new TempClientService();
export default tempClientService;
