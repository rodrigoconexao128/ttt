/**
 * FollowUpEngine - Motor de Follow-ups Automáticos
 * 
 * Responsável por:
 * - Processar follow-ups agendados via cron
 * - Enviar mensagens de retorno automático
 * - Gerenciar fila de mensagens pendentes
 * - Aplicar lógica de escalonamento (10min -> 1h -> 24h)
 */

import { tempClientService, type FollowUpType } from "./tempClientService";
import { promptBuilder } from "./promptBuilder";
import type { TempClient } from "@shared/schema";

// Intervalo do cron em milissegundos
const CRON_INTERVAL = 30 * 1000; // 30 segundos

// Tempos de follow-up em milissegundos
const FOLLOW_UP_TIMES = {
  auto_10min: 10 * 60 * 1000,    // 10 minutos
  auto_1h: 60 * 60 * 1000,       // 1 hora
  auto_24h: 24 * 60 * 60 * 1000, // 24 horas
};

// Limite de follow-ups automáticos por cliente
const MAX_AUTO_FOLLOW_UPS = 5;

class FollowUpEngine {
  private isRunning = false;
  private cronInterval: NodeJS.Timeout | null = null;
  private sendMessageFn: ((phoneNumber: string, message: string) => Promise<void>) | null = null;

  /**
   * Configura a função de envio de mensagens
   * Deve ser chamado durante a inicialização do servidor
   */
  setSendMessageFunction(fn: (phoneNumber: string, message: string) => Promise<void>) {
    this.sendMessageFn = fn;
    console.log("[FollowUpEngine] Função de envio configurada");
  }

  /**
   * Inicia o motor de follow-ups
   */
  start() {
    if (this.isRunning) {
      console.log("[FollowUpEngine] Já está rodando");
      return;
    }

    console.log("[FollowUpEngine] Iniciando motor de follow-ups...");
    this.isRunning = true;
    
    // Processar imediatamente e depois a cada intervalo
    this.processPendingFollowUps();
    this.cronInterval = setInterval(() => {
      this.processPendingFollowUps();
    }, CRON_INTERVAL);

    console.log(`[FollowUpEngine] Cron ativo, intervalo: ${CRON_INTERVAL / 1000}s`);
  }

  /**
   * Para o motor de follow-ups
   */
  stop() {
    if (this.cronInterval) {
      clearInterval(this.cronInterval);
      this.cronInterval = null;
    }
    this.isRunning = false;
    console.log("[FollowUpEngine] Motor parado");
  }

  /**
   * Processa todos os follow-ups pendentes
   */
  private async processPendingFollowUps() {
    try {
      const pendingFollowUps = await tempClientService.getPendingFollowUps();
      
      if (pendingFollowUps.length === 0) {
        return;
      }

      console.log(`[FollowUpEngine] Processando ${pendingFollowUps.length} follow-ups pendentes`);

      for (const followUp of pendingFollowUps) {
        await this.processFollowUp(followUp);
      }
    } catch (error) {
      console.error("[FollowUpEngine] Erro ao processar follow-ups:", error);
    }
  }

  /**
   * Processa um único follow-up
   */
  private async processFollowUp(followUp: {
    id: string;
    tempClientId: string | null;
    phoneNumber: string;
    type: string;
    message: string | null;
    context: any;
    client: TempClient | null;
  }) {
    try {
      // Verificar se cliente ainda existe e não foi convertido
      if (followUp.client?.convertedToRealUser) {
        await tempClientService.markFollowUpSent(followUp.id);
        console.log(`[FollowUpEngine] Follow-up cancelado - cliente convertido: ${followUp.id}`);
        return;
      }

      // Verificar limite de follow-ups
      if (followUp.client && followUp.client.followUpCount >= MAX_AUTO_FOLLOW_UPS) {
        await tempClientService.markFollowUpSent(followUp.id);
        console.log(`[FollowUpEngine] Follow-up cancelado - limite atingido: ${followUp.id}`);
        return;
      }

      // Gerar mensagem se não foi definida
      let message = followUp.message;
      if (!message && followUp.client) {
        message = this.generateFollowUpMessage(followUp.type as FollowUpType, followUp.client);
      }

      if (!message) {
        message = "Oi! Vi que você estava configurando seu agente de IA... Quer continuar?";
      }

      // Enviar mensagem
      if (this.sendMessageFn) {
        await this.sendMessageFn(followUp.phoneNumber, message);
        await tempClientService.markFollowUpSent(followUp.id);
        console.log(`[FollowUpEngine] Follow-up enviado: ${followUp.type} -> ${followUp.phoneNumber}`);

        // Incrementar contador e agendar próximo
        if (followUp.client) {
          await this.scheduleNextFollowUp(followUp.client, followUp.type as FollowUpType);
        }
      } else {
        console.warn("[FollowUpEngine] Função de envio não configurada");
        await tempClientService.markFollowUpFailed(followUp.id);
      }
    } catch (error) {
      console.error(`[FollowUpEngine] Erro ao processar follow-up ${followUp.id}:`, error);
      await tempClientService.markFollowUpFailed(followUp.id);
    }
  }

  /**
   * Gera mensagem de follow-up baseado no tipo e cliente
   */
  private generateFollowUpMessage(type: FollowUpType, client: TempClient): string {
    switch (type) {
      case "auto_10min":
        return promptBuilder.getFollowUp10min(client);
      case "auto_1h":
        return promptBuilder.getFollowUp1h(client);
      case "auto_24h":
        return promptBuilder.getFollowUp24h(client);
      default:
        return promptBuilder.getFollowUp10min(client);
    }
  }

  /**
   * Agenda próximo follow-up na sequência
   */
  private async scheduleNextFollowUp(client: TempClient, currentType: FollowUpType) {
    // Determinar próximo tipo na sequência
    let nextType: FollowUpType | null = null;
    let nextDelay: number = 0;

    switch (currentType) {
      case "auto_10min":
        nextType = "auto_1h";
        nextDelay = FOLLOW_UP_TIMES.auto_1h;
        break;
      case "auto_1h":
        nextType = "auto_24h";
        nextDelay = FOLLOW_UP_TIMES.auto_24h;
        break;
      case "auto_24h":
        // Não agendar mais follow-ups automáticos após 24h
        nextType = null;
        break;
    }

    if (nextType && client.followUpCount < MAX_AUTO_FOLLOW_UPS) {
      const scheduledFor = new Date(Date.now() + nextDelay);
      
      await tempClientService.scheduleFollowUp(
        client.id,
        client.phoneNumber,
        nextType,
        scheduledFor,
        { step: client.onboardingStep, previousType: currentType }
      );

      console.log(`[FollowUpEngine] Próximo follow-up agendado: ${nextType} em ${scheduledFor.toISOString()}`);
    }
  }

  /**
   * Agenda follow-up inicial quando cliente para de responder
   */
  async scheduleInitialFollowUp(client: TempClient) {
    // Verificar se já não tem follow-up pendente
    if (client.followUpCount >= MAX_AUTO_FOLLOW_UPS) {
      return;
    }

    const scheduledFor = new Date(Date.now() + FOLLOW_UP_TIMES.auto_10min);
    
    await tempClientService.scheduleFollowUp(
      client.id,
      client.phoneNumber,
      "auto_10min",
      scheduledFor,
      { step: client.onboardingStep }
    );

    console.log(`[FollowUpEngine] Follow-up inicial agendado para ${client.phoneNumber}`);
  }

  /**
   * Agenda follow-up manual (admin)
   */
  async scheduleManualFollowUp(
    phoneNumber: string,
    message: string,
    scheduledFor: Date,
    clientId?: string
  ) {
    if (clientId) {
      await tempClientService.scheduleFollowUp(
        clientId,
        phoneNumber,
        "manual",
        scheduledFor,
        {},
        message
      );
    } else {
      // Criar follow-up sem cliente associado
      const { db } = await import("./db");
      const { scheduledFollowUps } = await import("@shared/schema");
      
      await db.insert(scheduledFollowUps).values({
        phoneNumber,
        type: "manual",
        message,
        scheduledFor,
        status: "pending",
        context: {},
      });
    }

    console.log(`[FollowUpEngine] Follow-up manual agendado: ${phoneNumber} -> ${scheduledFor.toISOString()}`);
  }

  /**
   * Agenda follow-up baseado em contexto (IA entendeu que cliente quer retorno depois)
   */
  async scheduleContextualFollowUp(
    client: TempClient,
    scheduledFor: Date,
    context: string
  ) {
    // Gerar mensagem contextualizada
    const message = `Oi! Lembrei de você porque ${context}. 

Podemos continuar agora? 😊`;

    await tempClientService.scheduleFollowUp(
      client.id,
      client.phoneNumber,
      "scheduled",
      scheduledFor,
      { reason: context },
      message
    );

    console.log(`[FollowUpEngine] Follow-up contextual agendado: ${client.phoneNumber} -> ${scheduledFor.toISOString()}`);
  }

  /**
   * Cancela todos os follow-ups de um cliente (usado quando converte ou quando cliente responde)
   */
  async cancelClientFollowUps(clientId: string) {
    await tempClientService.cancelAllFollowUps(clientId);
    console.log(`[FollowUpEngine] Follow-ups cancelados para cliente: ${clientId}`);
  }

  /**
   * Retorna estatísticas do engine
   */
  async getStats() {
    const pending = await tempClientService.getPendingFollowUps();
    const allFollowUps = await tempClientService.getAllScheduledFollowUps();
    
    const byStatus = {
      pending: allFollowUps.filter(f => f.followUp.status === "pending").length,
      sent: allFollowUps.filter(f => f.followUp.status === "sent").length,
      cancelled: allFollowUps.filter(f => f.followUp.status === "cancelled").length,
      failed: allFollowUps.filter(f => f.followUp.status === "failed").length,
    };

    const byType = {
      auto_10min: allFollowUps.filter(f => f.followUp.type === "auto_10min").length,
      auto_1h: allFollowUps.filter(f => f.followUp.type === "auto_1h").length,
      auto_24h: allFollowUps.filter(f => f.followUp.type === "auto_24h").length,
      scheduled: allFollowUps.filter(f => f.followUp.type === "scheduled").length,
      manual: allFollowUps.filter(f => f.followUp.type === "manual").length,
    };

    return {
      isRunning: this.isRunning,
      pendingNow: pending.length,
      total: allFollowUps.length,
      byStatus,
      byType,
    };
  }
}

export const followUpEngine = new FollowUpEngine();
export default followUpEngine;
