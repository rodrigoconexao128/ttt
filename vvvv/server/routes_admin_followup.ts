import type { Express, Request, Response } from "express";
import { isAdmin } from "./supabaseAuth";
import { db } from "./db";
import { adminConversations, followupLogs, systemConfig } from "@shared/schema";
import { eq, and, gte, desc, sql, asc } from "drizzle-orm";

// ============================================================================
// HELPERS PARA CONFIGURAÇÃO GLOBAL DE FOLLOW-UP (systemConfig)
// ============================================================================

const GLOBAL_FOLLOWUP_CONFIG_KEY = "admin_followup_global_config";

const DEFAULT_GLOBAL_FOLLOWUP_CONFIG = {
  id: "global",
  userId: "admin",
  isEnabled: true,
  // Toggle follow-up para não pagantes
  followupNonPayersEnabled: true,
  maxAttempts: 8,
  intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
  businessHoursStart: "09:00",
  businessHoursEnd: "18:00",
  businessDays: [1, 2, 3, 4, 5],
  respectBusinessHours: true,
  tone: "friendly",
  formalityLevel: 3,
  useEmojis: true,
  importantInfo: [],
  infiniteLoop: true,
  infiniteLoopMinDays: 15,   // Periodicidade mínima configurável
  infiniteLoopMaxDays: 30,   // Periodicidade máxima configurável
};

async function getGlobalFollowupConfig() {
  try {
    const row = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });
    if (row?.valor) {
      const saved = JSON.parse(row.valor);
      return { ...DEFAULT_GLOBAL_FOLLOWUP_CONFIG, ...saved };
    }
  } catch (_) {}
  return DEFAULT_GLOBAL_FOLLOWUP_CONFIG;
}

async function saveGlobalFollowupConfig(data: Record<string, any>) {
  const merged = { ...DEFAULT_GLOBAL_FOLLOWUP_CONFIG, ...data };
  const valor = JSON.stringify(merged);
  // Upsert via insert + conflict update
  try {
    const existing = await db.query.systemConfig.findFirst({
      where: eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY),
    });
    if (existing) {
      await db.update(systemConfig)
        .set({ valor, updatedAt: new Date() })
        .where(eq(systemConfig.chave, GLOBAL_FOLLOWUP_CONFIG_KEY));
    } else {
      await db.insert(systemConfig).values({
        chave: GLOBAL_FOLLOWUP_CONFIG_KEY,
        valor,
      });
    }
  } catch (err) {
    console.error("[ADMIN FOLLOWUP CONFIG] Erro ao salvar config global:", err);
    throw err;
  }
  return merged;
}

// ============================================================================
// ROTAS DE FOLLOW-UP DO ADMIN (CONFIGURAÇÃO GLOBAL)
// ============================================================================

export function registerAdminFollowUpRoutes(app: Express) {

  // ==================== CONFIGURAÇÃO GLOBAL ====================

  /**
   * GET /api/admin/followup/config
   * Buscar configuração global de follow-up do admin (persiste no banco)
   */
  app.get("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const config = await getGlobalFollowupConfig();
      res.json(config);
    } catch (error: any) {
      console.error("Erro ao buscar config de follow-up do admin:", error);
      res.status(500).json({ message: "Erro ao buscar configuração" });
    }
  });

  /**
   * PUT /api/admin/followup/config
   * Atualizar configuração global de follow-up (persiste no banco)
   */
  app.put("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const incoming = req.body;

      // Validar periodicidade
      if (incoming.infiniteLoopMinDays !== undefined) {
        const min = Number(incoming.infiniteLoopMinDays);
        if (isNaN(min) || min < 1 || min > 365) {
          return res.status(400).json({ message: "infiniteLoopMinDays deve ser entre 1 e 365" });
        }
        incoming.infiniteLoopMinDays = min;
      }
      if (incoming.infiniteLoopMaxDays !== undefined) {
        const max = Number(incoming.infiniteLoopMaxDays);
        if (isNaN(max) || max < 1 || max > 365) {
          return res.status(400).json({ message: "infiniteLoopMaxDays deve ser entre 1 e 365" });
        }
        incoming.infiniteLoopMaxDays = max;
      }
      if (
        incoming.infiniteLoopMinDays !== undefined &&
        incoming.infiniteLoopMaxDays !== undefined &&
        incoming.infiniteLoopMinDays > incoming.infiniteLoopMaxDays
      ) {
        return res.status(400).json({ message: "infiniteLoopMinDays não pode ser maior que infiniteLoopMaxDays" });
      }

      const saved = await saveGlobalFollowupConfig(incoming);
      console.log(`[ADMIN] Config de follow-up global atualizada por admin ${adminId}`);

      res.json({
        success: true,
        message: "Configuração atualizada com sucesso",
        config: saved,
      });
    } catch (error: any) {
      console.error("Erro ao atualizar config de follow-up do admin:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração" });
    }
  });

  // ==================== ESTATÍSTICAS GERAIS ====================

  /**
   * GET /api/admin/followup/stats
   * Estatísticas gerais de follow-up de todas as conversas
   */
  app.get("/api/admin/followup/stats", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;

      // Use raw SQL to avoid ORM table mapping ambiguity (followup_logs vs user_followup_logs)
      const [statusCounts, conversationStats, nonPayerStats] = await Promise.all([
        // Count follow-up logs by status (admin table: followup_logs)
        db.execute(sql`
          SELECT status, COUNT(*)::int AS count
          FROM followup_logs
          GROUP BY status
        `),
        // Active conversations for pending/scheduled
        db.execute(sql`
          SELECT
            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at <= NOW() THEN 1 END)::int AS pending,
            COUNT(CASE WHEN followup_active = true AND next_followup_at IS NOT NULL AND next_followup_at >= DATE_TRUNC('day', NOW()) AND next_followup_at < DATE_TRUNC('day', NOW()) + INTERVAL '1 day' THEN 1 END)::int AS scheduled_today
          FROM admin_conversations
        `),
        // Non-payer stats
        db.execute(sql`
          SELECT
            COUNT(CASE WHEN payment_status = 'unpaid' THEN 1 END)::int AS unpaid,
            COUNT(CASE WHEN payment_status = 'unpaid' AND followup_for_non_payers = true THEN 1 END)::int AS unpaid_followups_enabled
          FROM admin_conversations
        `)
      ]);

      // Parse status counts
      const statsByStatus: Record<string, number> = {};
      for (const row of statusCounts.rows as any[]) {
        statsByStatus[row.status] = Number(row.count) || 0;
      }
      
      const convRow = (conversationStats.rows[0] as any) || {};
      const nonPayerRow = (nonPayerStats.rows[0] as any) || {};

      res.json({
        totalSent: statsByStatus['sent'] || 0,
        totalFailed: statsByStatus['failed'] || 0,
        totalCancelled: statsByStatus['cancelled'] || 0,
        totalSkipped: statsByStatus['skipped'] || 0,
        pending: Number(convRow.pending) || 0,
        scheduledToday: Number(convRow.scheduled_today) || 0,
        unpaid: Number(nonPayerRow.unpaid) || 0,
        unpaidFollowupsEnabled: Number(nonPayerRow.unpaid_followups_enabled) || 0,
      });
    } catch (error: any) {
      console.error("Erro ao buscar estatísticas de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar estatísticas" });
    }
  });

  // ==================== LOGS DE FOLLOW-UP ====================

  /**
   * GET /api/admin/followup/logs
   * Logs de follow-up de todas as conversas
   */
  app.get("/api/admin/followup/logs", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const limit = parseInt(req.query.limit as string) || 200;
      const status = req.query.status as string | undefined;

      // Buscar logs de follow-up com filtros
      const logs = await db.query.followupLogs.findMany({
        where: status ? eq(followupLogs.status, status) : undefined,
        orderBy: [desc(followupLogs.executedAt)],
        limit,
      });

      // Enriquecer com nome do contato (busca em lote via contactNumber)
      const numbers = Array.from(new Set(logs.filter(l => l.contactNumber).map(l => l.contactNumber)));
      const nameMap = new Map<string, string | null>();
      if (numbers.length > 0) {
        // Buscar conversas por número — pegar a mais recente por número
        const convs = await db.query.adminConversations.findMany({
          orderBy: [desc(adminConversations.lastMessageTime)],
          limit: 1000,
        });
        for (const c of convs) {
          if (c.contactNumber && !nameMap.has(c.contactNumber)) {
            nameMap.set(c.contactNumber, c.contactName);
          }
        }
      }

      const enriched = logs.map(l => ({
        ...l,
        contactName: l.contactNumber ? (nameMap.get(l.contactNumber) ?? null) : null,
      }));

      res.json(enriched);
    } catch (error: any) {
      console.error("Erro ao buscar logs de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar logs" });
    }
  });

  // ==================== PENDENTES ====================

  /**
   * GET /api/admin/followup/pending
   * Lista conversas com follow-up pendente
   */
  app.get("/api/admin/followup/pending", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;

      const pending = await db.query.adminConversations.findMany({
        where: and(
          eq(adminConversations.followupActive, true),
          sql`${adminConversations.nextFollowupAt} IS NOT NULL`,
          sql`${adminConversations.nextFollowupAt} <= NOW()`
        ),
        orderBy: [asc(adminConversations.nextFollowupAt)],
        limit: 100
      });

      // Mapear para o formato esperado pelo UI
      const formatted = pending.map(conv => ({
        id: conv.id,
        contactNumber: conv.contactNumber || "",
        contactName: conv.contactName || null,
        stage: conv.followupStage || 0,
        nextFollowupAt: conv.nextFollowupAt || "",
        lastMessageText: conv.lastMessageText || null,
        lastMessageTime: conv.lastMessageTime || null,
        note: null, // followupDisabledReason not available in adminConversations
        // 🛡️ FOLLOW-UP FOR NON-PAYERS
        paymentStatus: conv.paymentStatus || 'pending',
        followupForNonPayers: conv.followupForNonPayers ?? true,
        followupConfig: conv.followupConfig
      }));

      res.json(formatted);
    } catch (error: any) {
      console.error("Erro ao buscar follow-ups pendentes:", error);
      res.status(500).json({ message: "Erro ao buscar pendentes" });
    }
  });

  // ==================== CONTROLE POR CONVERSA ====================

  /**
   * POST /api/admin/followup/conversation/:id/toggle
   * Ativar/Desativar follow-up para uma conversa específica
   */
  app.post("/api/admin/followup/conversation/:id/toggle", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { active } = req.body;

      if (typeof active !== 'boolean') {
        return res.status(400).json({ message: "active (boolean) é obrigatório" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (active) {
        // Ativar follow-up
        await db.update(adminConversations)
          .set({
            followupActive: true,
            nextFollowupAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
            followupStage: 0
          })
          .where(eq(adminConversations.id, id));

        console.log(`[ADMIN] Follow-up ATIVADO para conversa ${id}`);
      } else {
        // Desativar follow-up
        await db.update(adminConversations)
          .set({
            followupActive: false,
            nextFollowupAt: null,
          })
          .where(eq(adminConversations.id, id));

        console.log(`[ADMIN] Follow-up DESATIVADO para conversa ${id}`);
      }

      res.json({ success: true, active });
    } catch (error: any) {
      console.error("Erro ao alternar follow-up:", error);
      res.status(500).json({ message: "Erro ao alternar follow-up" });
    }
  });

  /**
   * GET /api/admin/followup/conversation/:id/status
   * Verificar status do follow-up de uma conversa
   */
  app.get("/api/admin/followup/conversation/:id/status", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      res.json({
        active: conversation.followupActive,
        stage: conversation.followupStage,
        nextFollowupAt: conversation.nextFollowupAt,
        disabledReason: null, // followupDisabledReason not available in adminConversations
        // 🛡️ FOLLOW-UP FOR NON-PAYERS
        paymentStatus: conversation.paymentStatus || 'pending',
        followupForNonPayers: conversation.followupForNonPayers ?? true,
        followupConfig: conversation.followupConfig
      });
    } catch (error: any) {
      console.error("Erro ao buscar status de follow-up:", error);
      res.status(500).json({ message: "Erro ao buscar status" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/reset
   * Resetar ciclo de follow-up
   */
  app.post("/api/admin/followup/conversation/:id/reset", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      await db.update(adminConversations)
        .set({
          followupStage: 0,
          nextFollowupAt: new Date(Date.now() + 10 * 60 * 1000)
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Ciclo de follow-up resetado para conversa ${id}`);

      res.json({ success: true, message: "Ciclo de follow-up resetado" });
    } catch (error: any) {
      console.error("Erro ao resetar follow-up:", error);
      res.status(500).json({ message: "Erro ao resetar follow-up" });
    }
  });

  // ==================== 🛡️ FOLLOW-UP FOR NON-PAYERS ====================

  /**
   * POST /api/admin/followup/conversation/:id/update-payment-status
   * Atualizar status de pagamento de uma conversa
   */
  app.post("/api/admin/followup/conversation/:id/update-payment-status", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { paymentStatus } = req.body;

      // Validação
      const validStatuses = ['paid', 'unpaid', 'pending'];
      if (!paymentStatus || !validStatuses.includes(paymentStatus)) {
        return res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Atualizar status de pagamento
      await db.update(adminConversations)
        .set({
          paymentStatus,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Status de pagamento atualizado para ${paymentStatus} em conversa ${id}`);

      res.json({
        success: true,
        paymentStatus,
        message: "Status de pagamento atualizado com sucesso"
      });
    } catch (error: any) {
      console.error("Erro ao atualizar status de pagamento:", error);
      res.status(500).json({ message: "Erro ao atualizar status de pagamento" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/toggle-non-payer-followup
   * Ativar/Desativar follow-up para não pagantes
   */
  app.post("/api/admin/followup/conversation/:id/toggle-non-payer-followup", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { enabled } = req.body;

      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ message: "enabled (boolean) é obrigatório" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Atualizar toggle de follow-up para não pagantes
      await db.update(adminConversations)
        .set({
          followupForNonPayers: enabled,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Follow-up para não pagantes ${enabled ? 'ATIVADO' : 'DESATIVADO'} para conversa ${id}`);

      res.json({
        success: true,
        followupForNonPayers: enabled,
        message: `Follow-up para não pagantes ${enabled ? 'ativado' : 'desativado'} com sucesso`
      });
    } catch (error: any) {
      console.error("Erro ao alternar follow-up para não pagantes:", error);
      res.status(500).json({ message: "Erro ao alternar follow-up para não pagantes" });
    }
  });

  /**
   * POST /api/admin/followup/conversation/:id/update-config
   * Atualizar configuração de follow-up para uma conversa
   */
  app.post("/api/admin/followup/conversation/:id/update-config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const config = req.body;

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Validar configuração
      const validStatuses = ['paid', 'unpaid', 'pending'];
      if (config.paymentStatus && !validStatuses.includes(config.paymentStatus)) {
        return res.status(400).json({ message: "paymentStatus deve ser 'paid', 'unpaid' ou 'pending'" });
      }

      // Atualizar configuração
      await db.update(adminConversations)
        .set({
          ...config,
          updatedAt: new Date()
        })
        .where(eq(adminConversations.id, id));

      console.log(`[ADMIN] Configuração de follow-up atualizada para conversa ${id}`);

      res.json({
        success: true,
        message: "Configuração de follow-up atualizada com sucesso",
        config
      });
    } catch (error: any) {
      console.error("Erro ao atualizar configuração de follow-up:", error);
      res.status(500).json({ message: "Erro ao atualizar configuração de follow-up" });
    }
  });

  // ==================== AGENDAMENTO DE MENSAGENS COM IA ====================

  /**
   * POST /api/admin/followup/conversation/:id/schedule-message
   * Agendar uma mensagem para ser enviada em uma data específica
   * Suporta texto manual ou gerado com IA
   */
  app.post("/api/admin/followup/conversation/:id/schedule-message", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { scheduledFor, text, useAI, note } = req.body;

      // Validação
      if (!scheduledFor) {
        return res.status(400).json({ message: "scheduledFor (data/hora) é obrigatório" });
      }

      if (!text) {
        return res.status(400).json({ message: "text é obrigatório" });
      }

      const conversation = await db.query.adminConversations.findFirst({
        where: eq(adminConversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      // Criar registro de mensagem agendada
      const scheduledMessage = {
        conversationId: id,
        scheduledFor: new Date(scheduledFor),
        text,
        useAI,
        note: note || null,
        createdBy: adminId,
        createdAt: new Date(),
        status: 'scheduled' // scheduled, sent, failed
      };

      // Inserir no banco
      // Precisamos criar uma tabela para mensagens agendadas
      // Por enquanto, vamos usar a tabela followupLogs como placeholder
      const log = await db.insert(followupLogs).values({
        conversationId: id,
        contactNumber: conversation.contactNumber || "",
        messageContent: text,
        scheduledFor: new Date(scheduledFor),
        executedAt: null, // Ainda não executado
        status: 'scheduled'
      }).returning();

      console.log(`[ADMIN] Mensagem agendada para conversa ${id} em ${scheduledFor}`);
      console.log(`  Texto: ${text.substring(0, 50)}...`);
      console.log(`  IA: ${useAI ? 'sim' : 'não'}`);

      res.json({
        success: true,
        messageId: log[0].id,
        scheduledFor: log[0].scheduledFor
      });
    } catch (error: any) {
      console.error("Erro ao agendar mensagem:", error);
      res.status(500).json({ message: "Erro ao agendar mensagem" });
    }
  });

  /**
   * GET /api/admin/followup/conversation/:id/scheduled-messages
   * Buscar mensagens agendadas para uma conversa
   */
  app.get("/api/admin/followup/conversation/:id/scheduled-messages", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;

      const messages = await db.query.followupLogs.findMany({
        where: and(
          eq(followupLogs.conversationId, id),
          eq(followupLogs.status, 'scheduled')
        ),
        orderBy: [asc(followupLogs.scheduledFor)]
      });

      res.json(messages);
    } catch (error: any) {
      console.error("Erro ao buscar mensagens agendadas:", error);
      res.status(500).json({ message: "Erro ao buscar mensagens agendadas" });
    }
  });

  /**
   * DELETE /api/admin/followup/conversation/:id/scheduled-messages/:messageId
   * Cancelar mensagem agendada
   */
  app.delete("/api/admin/followup/conversation/:id/scheduled-messages/:messageId", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id, messageId } = req.params;

      // Atualizar status para cancelled
      await db.update(followupLogs)
        .set({ status: 'cancelled' })
        .where(and(
          eq(followupLogs.id, messageId),
          eq(followupLogs.conversationId, id)
        ));

      console.log(`[ADMIN] Mensagem agendada ${messageId} cancelada`);

      res.json({ success: true, message: "Mensagem agendada cancelada" });
    } catch (error: any) {
      console.error("Erro ao cancelar mensagem agendada:", error);
      res.status(500).json({ message: "Erro ao cancelar mensagem agendada" });
    }
  });

  console.log("✅ [ADMIN FOLLOW-UP] Rotas registradas");
}
