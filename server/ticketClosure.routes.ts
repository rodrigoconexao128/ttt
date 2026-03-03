import { Express, Request, Response } from "express";
import { db } from "./db";
import { ticketClosureLogs } from "../shared/schema";
import { eq } from "drizzle-orm";
import { storage } from "./storage";
import { isAuthenticated } from "./supabaseAuth";

// Helper to get userId from authenticated request
function getUserId(req: any): string {
  return req.user?.claims?.sub || req.user?.id;
}

/**
 * Register ticket closure routes (Fase 4.2)
 * These routes handle closing tickets while preserving history for audit
 */
export function registerTicketClosureRoutes(app: Express): void {
  console.log("🔒 [Fase 4.2] Registrando rotas de encerramento de chamados...");

  // POST - Encerrar chamado (fechar ticket, manter histórico para auditoria)
  app.post("/api/conversations/:conversationId/close-ticket", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);
      const { reason } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get user info for audit log
      const user = await storage.getUser(userId);
      const userName = user?.name || user?.email || 'User';

      // Close the conversation (mark as closed, preserve history)
      await storage.updateConversation(conversationId, {
        isClosed: true,
        closedAt: new Date(),
        closedBy: userId,
        closureReason: reason || null,
        followupActive: false,
      });

      // Log the closure
      await db.insert(ticketClosureLogs).values({
        conversationId,
        action: 'closed',
        performedBy: userId,
        performedByName: userName,
        reason: reason || null,
        createdAt: new Date(),
      });

      // Disable agent for this conversation
      await storage.disableAgentForConversation(conversationId);

      // Cancel any pending follow-ups (graceful - ignore if function not available)
      try {
        const followUpModule = await import("./userFollowUpService");
        if (followUpModule.cancelFollowUp && typeof followUpModule.cancelFollowUp === 'function') {
          followUpModule.cancelFollowUp(conversation.contactNumber);
        } else {
          // Use service method to cancel follow-up if available
          const { userFollowUpService } = followUpModule;
          if (userFollowUpService && typeof userFollowUpService.cancelFollowUp === 'function') {
            userFollowUpService.cancelFollowUp(conversation.contactNumber);
          }
        }
      } catch(e) {
        // Non-fatal: follow-up cancellation failed
        console.warn('[Ticket Close] Could not cancel follow-up:', e.message);
      }

      res.json({ 
        success: true, 
        message: "Chamado encerrado com sucesso",
        conversation: {
          id: conversationId,
          isClosed: true,
          closedAt: new Date(),
          closedBy: userId,
        }
      });
    } catch (error) {
      console.error("Error closing ticket:", error);
      res.status(500).json({ message: "Failed to close ticket" });
    }
  });

  // POST - Reabrir chamado (criar nova conversa com mesmo contato)
  app.post("/api/conversations/:conversationId/reopen-ticket", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);
      const { reason } = req.body || {};

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ownership
      const oldConversation = await storage.getConversation(conversationId);
      if (!oldConversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || oldConversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get user info for audit log
      const user = await storage.getUser(userId);
      const userName = user?.name || user?.email || 'User';

      // Log the reopening of the old conversation
      await db.insert(ticketClosureLogs).values({
        conversationId,
        action: 'reopened',
        performedBy: userId,
        performedByName: userName,
        reason: reason || null,
        createdAt: new Date(),
      });

      // FIX DUPLICATAS: Verificar se já existe conversa ativa para este contato antes de criar nova
      let newConversation = await storage.getActiveConversationByContactNumber(
        connection.id,
        oldConversation.contactNumber
      );

      if (newConversation) {
        console.log(`⚠️ [REOPEN] Conversa ativa já existe para ${oldConversation.contactNumber} (${newConversation.id}), reutilizando`);
      } else {
        // Create new conversation for fresh context
        newConversation = await storage.createConversation({
          connectionId: connection.id,
          contactNumber: oldConversation.contactNumber,
          remoteJid: oldConversation.remoteJid,
          jidSuffix: oldConversation.jidSuffix || 's.whatsapp.net',
          contactName: oldConversation.contactName,
          contactAvatar: oldConversation.contactAvatar,
        });
      }

      // Mark new conversation as open and ready
      await storage.updateConversation(newConversation.id, {
        isClosed: false,
        followupActive: true,
        followupStage: 0,
      });

      res.json({ 
        success: true, 
        message: "Novo chamado criado com sucesso",
        conversation: {
          id: newConversation.id,
          contactNumber: newConversation.contactNumber,
          contactName: newConversation.contactName,
          isClosed: false,
          previousConversationId: conversationId,
        }
      });
    } catch (error) {
      console.error("Error reopening ticket:", error);
      res.status(500).json({ message: "Failed to reopen ticket" });
    }
  });

  // GET - Buscar histórico de encerramento de um chamado
  app.get("/api/conversations/:conversationId/closure-logs", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      if (!userId) {
        return res.status(401).json({ message: "Unauthorized" });
      }

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get closure logs
      const logs = await db.select().from(ticketClosureLogs)
        .where(eq(ticketClosureLogs.conversationId, conversationId))
        .orderBy(ticketClosureLogs.createdAt);

      res.json({ logs });
    } catch (error) {
      console.error("Error fetching closure logs:", error);
      res.status(500).json({ message: "Failed to fetch closure logs" });
    }
  });

  // Admin routes for managing closed conversations
  
  // GET - Listar todas as conversas fechadas (admin)
  app.get("/api/admin/closed-conversations", async (req: any, res) => {
    try {
      const adminId = req.session?.adminId;
      if (!adminId) {
        return res.status(403).json({ message: "Admin access required" });
      }

      const closedConversations = await db.query.conversations.findMany({
        where: (conversations: any) => eq(conversations.isClosed, true),
        orderBy: (conversations: any) => [conversations.closedAt, 'desc'],
      });

      res.json({ conversations: closedConversations });
    } catch (error) {
      console.error("Error fetching closed conversations:", error);
      res.status(500).json({ message: "Failed to fetch closed conversations" });
    }
  });

  console.log("✅ [Fase 4.2] Rotas de encerramento registradas com sucesso!");
}
