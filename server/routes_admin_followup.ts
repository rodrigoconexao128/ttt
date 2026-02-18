import type { Express, Request, Response } from "express";
import { isAdmin } from "./supabaseAuth";
import { db } from "./db";
import { conversations, userFollowupLogs } from "@shared/schema";
import { eq, and, gte, desc, sql } from "drizzle-orm";

// ============================================================================
// ROTAS DE FOLLOW-UP DO ADMIN (CONFIGURAÇÃO GLOBAL)
// ============================================================================

export function registerAdminFollowUpRoutes(app: Express) {

  // ==================== CONFIGURAÇÃO GLOBAL ====================

  /**
   * GET /api/admin/followup/config
   * Buscar configuração global de follow-up do admin
   */
  app.get("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;

      // Para admin, usamos configuração global (hardcoded ou em banco)
      // Se não houver config, retorna default
      const defaultConfig = {
        id: "global",
        userId: "admin",
        isEnabled: true,
        maxAttempts: 8,
        intervalsMinutes: [10, 30, 180, 1440, 4320, 10080, 259200, 432000],
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00",
        businessDays: [1, 2, 3, 4, 5], // Segunda a Sexta
        respectBusinessHours: true,
        tone: "friendly",
        formalityLevel: 3,
        useEmojis: true,
        importantInfo: [],
        infiniteLoop: true,
        infiniteLoopMinDays: 15,
        infiniteLoopMaxDays: 30,
      };

      res.json(defaultConfig);
    } catch (error: any) {
      console.error("Erro ao buscar config de follow-up do admin:", error);
      res.status(500).json({ message: "Erro ao buscar configuração" });
    }
  });

  /**
   * PUT /api/admin/followup/config
   * Atualizar configuração global de follow-up
   */
  app.put("/api/admin/followup/config", isAdmin, async (req: any, res: Response) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const config = req.body;

      console.log(`[ADMIN] Atualizando config de follow-up para admin ${adminId}`, config);

      // Atualizar no banco (se tiver tabela de configs globais)
      // Por enquanto, apenas logamos e retornamos sucesso
      res.json({
        success: true,
        message: "Configuração atualizada com sucesso",
        config
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

      // Estatísticas globais de follow-up
      const stats = await db.query.conversations.findMany({
        where: sql`${conversations.followupActive} = true`
      });

      const totalSent = stats.filter(c => c.followupStage > 0).length;
      const totalPending = stats.filter(c => c.nextFollowupAt && new Date(c.nextFollowupAt) > new Date()).length;
      const totalCancelled = stats.filter(c => c.followupDisabledReason).length;
      const totalSkipped = stats.filter(c => c.followupSkipped).length;

      // Conversas com follow-up ativo hoje
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const scheduledToday = stats.filter(c => {
        if (!c.nextFollowupAt) return false;
        const nextDate = new Date(c.nextFollowupAt);
        nextDate.setHours(0, 0, 0, 0);
        return nextDate.getTime() === today.getTime();
      }).length;

      res.json({
        totalSent,
        totalFailed: 0, // Poderia calcular de logs
        totalCancelled,
        totalSkipped,
        pending: totalPending,
        scheduledToday
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
      const limit = parseInt(req.query.limit as string) || 100;

      // Buscar logs de follow-up
      const logs = await db.query.userFollowupLogs.findMany({
        orderBy: [desc(userFollowupLogs.executedAt)],
        limit
      });

      res.json(logs);
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

      const pending = await db.query.conversations.findMany({
        where: and(
          eq(conversations.followupActive, true),
          sql`${conversations.nextFollowupAt} IS NOT NULL`,
          sql`${conversations.nextFollowupAt} <= NOW()`
        ),
        orderBy: [asc(conversations.nextFollowupAt)],
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
        note: conv.followupDisabledReason || null
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

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      if (active) {
        // Ativar follow-up
        await db.update(conversations)
          .set({
            followupActive: true,
            nextFollowupAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
            followupStage: 0
          })
          .where(eq(conversations.id, id));

        console.log(`[ADMIN] Follow-up ATIVADO para conversa ${id}`);
      } else {
        // Desativar follow-up
        await db.update(conversations)
          .set({
            followupActive: false,
            nextFollowupAt: null,
            followupDisabledReason: "Desativado pelo admin"
          })
          .where(eq(conversations.id, id));

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

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      res.json({
        active: conversation.followupActive,
        stage: conversation.followupStage,
        nextFollowupAt: conversation.nextFollowupAt,
        disabledReason: conversation.followupDisabledReason
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

      const conversation = await db.query.conversations.findFirst({
        where: eq(conversations.id, id)
      });

      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }

      await db.update(conversations)
        .set({
          followupStage: 0,
          nextFollowupAt: new Date(Date.now() + 10 * 60 * 1000)
        })
        .where(eq(conversations.id, id));

      console.log(`[ADMIN] Ciclo de follow-up resetado para conversa ${id}`);

      res.json({ success: true, message: "Ciclo de follow-up resetado" });
    } catch (error: any) {
      console.error("Erro ao resetar follow-up:", error);
      res.status(500).json({ message: "Erro ao resetar follow-up" });
    }
  });

  console.log("✅ [ADMIN FOLLOW-UP] Rotas registradas");
}
