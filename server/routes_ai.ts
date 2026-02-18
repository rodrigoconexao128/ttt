import type { Express, Request, Response } from "express";
import { isAdmin } from "./supabaseAuth";
import { db } from "./db";
import { conversations, userFollowupLogs } from "@shared/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";

// ============================================================================
// ROTAS DE IA PARA AGENDAMENTO DE MENSAGENS
// ============================================================================

export function registerAIRoutes(app: Express) {

  /**
   * POST /api/ai/generate-message
   * Gerar uma mensagem com base em uma mensagem base e contexto
   */
  app.post("/api/ai/generate-message", isAdmin, async (req: any, res: Response) => {
    try {
      const { conversationId, baseMessage, context } = req.body;

      // Validação
      if (!baseMessage || typeof baseMessage !== 'string') {
        return res.status(400).json({ message: "baseMessage (string) é obrigatório" });
      }

      // Buscar contexto da conversa se fornecido
      let conversationContext = "";
      if (conversationId) {
        const conversation = await db.query.conversations.findFirst({
          where: eq(conversations.id, conversationId)
        });

        if (conversation) {
          conversationContext = `
            Nome: ${conversation.contactName || 'Não informado'}
            Telefone: ${conversation.contactNumber || 'Não informado'}
            Última mensagem: ${conversation.lastMessageText || 'Nenhuma'}
          `;
        }
      }

      // Contexto adicional
      const fullContext = `
        Contexto: ${context || 'Agendamento de mensagem'}
        Informações do cliente:
        ${conversationContext}
        Mensagem base para melhoria:
        ${baseMessage}
      `;

      // Gerar mensagem com IA (usando MistralClient)
      const { MistralClient } = await import("./mistralClient");
      const mistral = new MistralClient();

      const response = await mistral.chat.completions.create({
        model: "mistral-large-latest",
        messages: [
          {
            role: "system",
            content: "Você é um assistente de atendimento ao cliente profissional. Melhore a mensagem base para torná-la mais clara, educada e eficaz, mantendo o tom original. Seja conciso e direto."
          },
          {
            role: "user",
            content: fullContext
          }
        ],
        max_tokens: 500,
        temperature: 0.7
      });

      const generatedMessage = response.choices[0]?.message?.content || baseMessage;

      res.json({
        generatedMessage,
        originalMessage: baseMessage,
        model: "mistral-large-latest"
      });

    } catch (error: any) {
      console.error("Erro ao gerar mensagem com IA:", error);
      res.status(500).json({
        message: "Erro ao gerar mensagem com IA",
        error: error.message
      });
    }
  });

  console.log("✅ [AI ROUTES] Rotas de IA registradas");
}
