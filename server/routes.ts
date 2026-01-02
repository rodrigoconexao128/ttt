import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import { followUpService } from "./followUpService";
import { userFollowUpService } from "./userFollowUpService";
import { registerFollowUpRoutes } from "./routes_user_followup";
import { setupAuth, isAuthenticated, getSession, supabase } from "./supabaseAuth";
import { withRetry } from "./db";

// Configurar multer para upload em memória (depois envia pro Supabase Storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'audio/ogg', 'audio/opus', 'audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/webm', 'audio/mp4',
      'image/jpeg', 'image/png', 'image/gif', 'image/webp',
      'video/mp4', 'video/webm', 'video/quicktime',
      'application/pdf', 'application/msword', 
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain', // Aceitar arquivos .txt
      'application/vnd.ms-excel', // Excel .xls
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // Excel .xlsx
    ];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error(`Tipo de arquivo não suportado: ${file.mimetype}`));
    }
  }
});
import { isAdmin } from "./middleware";
import {
  connectWhatsApp,
  disconnectWhatsApp,
  forceReconnectWhatsApp,
  forceResetWhatsApp,
  sendMessage as whatsappSendMessage,
  addWebSocketClient,
  addAdminWebSocketClient,
  triggerAgentResponseForConversation,
  triggerAdminAgentResponseForConversation,
} from "./whatsapp";
import { 
  sendMessageSchema, 
  insertAiAgentConfigSchema,
  insertPlanSchema,
  insertSubscriptionSchema,
  insertPaymentSchema,
  agentMediaSchema,
} from "@shared/schema";
import { testAgentResponse } from "./aiAgent";
import { generatePixQRCode } from "./pixService";
import {
  getAgentMediaLibrary,
  getMediaByName,
  insertAgentMedia,
  updateAgentMedia,
  deleteAgentMedia,
  transcribeAudio,
  generateMediaPromptBlock,
  parseMistralResponse,
} from "./mediaService";
import {
  addAdminMedia,
  updateAdminMedia as updateAdminMediaStore,
  deleteAdminMedia as deleteAdminMediaStore,
  getAdminMediaList,
  getAdminMediaById,
  hasAdminMedia,
  getAdminMediaCount,
  type AdminMedia,
} from "./adminMediaStore";
import { processAdminMessage } from "./adminAgentService";
import { z } from "zod";

// Helper to get userId from authenticated request
function getUserId(req: any): string {
  return req.user.claims.sub;
}

// ============ FUNÇÃO DE GERAÇÃO LOCAL DE PROMPTS - VERSÃO CONCISA ============
function generateLocalPrompt(
  businessType: string, 
  businessName: string, 
  description: string, 
  additionalInfo: string,
  businessTypeLabel: string
): string {
  // Templates CONCISOS - máximo ~800 caracteres
  const templates: Record<string, string> = {
    restaurant: `${businessName} - Atendente de restaurante 🍽️. Tom: simpático e objetivo.

REGRAS:
• Apresente cardápio quando pedirem
• Informe promoções do dia
• Pergunte endereço para delivery
• Confirme pedido antes de finalizar
• Informe tempo de entrega real

NÃO FAZER:
• Inventar preços ou itens
• Prometer entrega sem confirmar
• Dar opiniões sobre dietas`,

    store: `${businessName} - Atendente de loja. Tom: prestativo e paciente.

REGRAS:
• Apresente produtos e benefícios
• Informe disponibilidade de estoque
• Explique parcelamento e pagamento
• Ajude na escolha de tamanhos
• Informe política de troca

NÃO FAZER:
• Inventar preços ou estoque
• Forçar venda
• Prometer prazos sem confirmar`,

    clinic: `${businessName} - Atendente de clínica. Tom: empático e profissional.

REGRAS:
• Agende consultas e exames
• Informe especialidades
• Confirme convênios aceitos
• Envie localização
• Oriente preparo para exames

NÃO FAZER:
• Dar diagnósticos
• Prescrever medicamentos
• Orientar sobre sintomas`,

    salon: `${businessName} - Atendente de salão 💇. Tom: animado e atencioso.

REGRAS:
• Agende horários disponíveis
• Apresente serviços e valores
• Pergunte sobre preferências
• Confirme agendamento 1 dia antes
• Sugira tratamentos complementares

NÃO FAZER:
• Agendar sem checar disponibilidade
• Prometer resultados impossíveis
• Criticar outros profissionais`,

    gym: `${businessName} - Atendente de academia 💪. Tom: motivador e amigável.

REGRAS:
• Apresente planos e valores
• Agende aula experimental
• Informe horários e modalidades
• Motive o cliente a começar
• Explique estrutura da academia

NÃO FAZER:
• Prescrever dietas ou suplementos
• Prometer resultados em X dias
• Criticar condicionamento do cliente`,

    other: `${businessName} - Atendente virtual. Tom: profissional e objetivo.

REGRAS:
• Responda dúvidas sobre produtos/serviços
• Informe preços e condições
• Agende horários quando aplicável
• Encaminhe para humano se necessário

NÃO FAZER:
• Inventar informações
• Prometer o que não pode cumprir
• Ser agressivo em vendas`
  };

  let basePrompt = templates[businessType] || templates.other;
  
  // Adiciona descrição se fornecida (máximo 200 chars)
  if (description && description.length > 10) {
    const shortDesc = description.length > 200 ? description.substring(0, 200) + '...' : description;
    basePrompt += `\n\nCONTEXTO:\n${shortDesc}`;
  }
  
  return basePrompt;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

  // ==================== FOLLOW-UP INTELIGENTE ROUTES ====================
  registerFollowUpRoutes(app);
  
  // Iniciar serviço de follow-up dos usuários
  userFollowUpService.start();
  
  // Registrar callback para enviar mensagens de follow-up via WhatsApp
  userFollowUpService.registerCallback(async (userId, conversationId, phoneNumber, remoteJid, message, stage) => {
    try {
      console.log(`📤 [FOLLOW-UP-CALLBACK] Enviando para ${phoneNumber} (estágio ${stage})`);
      await whatsappSendMessage(userId, conversationId, message);
      console.log(`✅ [FOLLOW-UP-CALLBACK] Mensagem enviada com sucesso para ${phoneNumber}`);
      return { success: true };
    } catch (error: any) {
      console.error(`❌ [FOLLOW-UP-CALLBACK] Erro ao enviar para ${phoneNumber}:`, error);
      return { success: false, error: error.message || "Erro desconhecido" };
    }
  });

  // ==================== ADMIN AUTH ROUTES ====================
  // Admin login with email/password
  app.post("/api/admin/login", async (req, res) => {
    try {
      const { email, password } = req.body;

      if (!email || !password) {
        return res.status(400).json({ message: "Email and password required" });
      }

      const admin = await storage.getAdminByEmail(email);
      if (!admin) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      const bcrypt = await import("bcryptjs");
      const validPassword = await bcrypt.compare(password, admin.passwordHash);

      if (!validPassword) {
        return res.status(401).json({ message: "Invalid credentials" });
      }

      // Regenerate session to avoid fixation and ensure persistence
      req.session.regenerate((err) => {
        if (err) {
          console.error("Error regenerating session:", err);
          return res.status(500).json({ message: "Login failed" });
        }
        (req.session as any).adminId = admin.id;
        (req.session as any).adminRole = admin.role;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error("Error saving session:", saveErr);
            return res.status(500).json({ message: "Login failed" });
          }
          res.json({
            success: true,
            admin: {
              id: admin.id,
              email: admin.email,
              role: admin.role,
            }
          });
        });
      });
    } catch (error) {
      console.error("Error in admin login:", error);
      res.status(500).json({ message: "Login failed" });
    }
  });

  // Check admin session
  app.get("/api/admin/session", (req, res) => {
    const adminId = (req.session as any)?.adminId;
    const adminRole = (req.session as any)?.adminRole;
    
    if (adminId) {
      res.json({ 
        authenticated: true,
        adminId,
        role: adminRole,
      });
    } else {
      res.json({ authenticated: false });
    }
  });

  // ==================== ADMIN USER MANAGEMENT ROUTES ====================
  
  // List users
  app.get("/api/admin/users", isAdmin, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const connections = await storage.getAllConnections();
      const subscriptions = await storage.getAllSubscriptions();
      
      // FREE_TRIAL_LIMIT
      const FREE_TRIAL_LIMIT = 25;
      
      // Map connection status to users with message usage
      const usersWithStatus = await Promise.all(users.map(async user => {
        const connection = connections.find(c => c.userId === user.id);
        const subscription = subscriptions.find(s => s.userId === user.id && s.status === 'active');
        const hasActiveSubscription = !!subscription;
        
        let agentMessagesCount = 0;
        if (connection) {
          agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
        }
        
        const limit = hasActiveSubscription ? -1 : FREE_TRIAL_LIMIT;
        const remaining = hasActiveSubscription ? -1 : Math.max(0, FREE_TRIAL_LIMIT - agentMessagesCount);
        const isLimitReached = !hasActiveSubscription && agentMessagesCount >= FREE_TRIAL_LIMIT;
        
        return {
          ...user,
          isConnected: connection?.isConnected || false,
          connectionId: connection?.id,
          agentMessagesCount,
          messageLimit: limit,
          messagesRemaining: remaining,
          isLimitReached,
          hasActiveSubscription,
        };
      }));
      
      res.json(usersWithStatus);
    } catch (error) {
      res.status(500).json({ message: "Error fetching users" });
    }
  });

  // Reconnect single user (force reconnection)
  app.post("/api/admin/connections/reconnect/:userId", isAdmin, async (req, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear reconexões para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando reconexão forçada de usuário (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const { userId } = req.params;
      console.log(`[ADMIN] Force reconnecting user ${userId}...`);
      
      // Check if user exists
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      // Check current connection status
      const connection = await storage.getConnectionByUserId(userId);
      console.log(`[ADMIN] User ${userId} connection status:`, {
        hasConnection: !!connection,
        isConnected: connection?.isConnected,
        phoneNumber: connection?.phoneNumber
      });

      // Force reconnection - clears stale session and reconnects
      try {
        await forceReconnectWhatsApp(userId);
        console.log(`[ADMIN] Successfully initiated force reconnection for user ${userId}`);
        
        // Wait a bit for connection to establish
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        // Check status after attempt
        const updatedConnection = await storage.getConnectionByUserId(userId);
        
        res.json({ 
          success: true, 
          message: `Reconexão iniciada para ${user.name || user.email || userId}`,
          status: {
            isConnected: updatedConnection?.isConnected,
            phoneNumber: updatedConnection?.phoneNumber
          }
        });
      } catch (connectError: any) {
        console.error(`[ADMIN] Failed to reconnect user ${userId}:`, connectError);
        res.json({ 
          success: false, 
          message: `Falha na reconexão: ${connectError.message}`,
          error: connectError.message 
        });
      }
    } catch (error: any) {
      console.error(`[ADMIN] Error reconnecting user ${req.params.userId}:`, error);
      res.status(500).json({ message: "Error reconnecting user", error: error.message });
    }
  });

  // Reset user session (clear auth files, force new QR code)
  app.post("/api/admin/connections/reset/:userId", isAdmin, async (req, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear reset para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando reset de sessão WhatsApp (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const { userId } = req.params;
      console.log(`[ADMIN] Resetting session for user ${userId}...`);
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }

      await forceResetWhatsApp(userId);
      
      res.json({ 
        success: true, 
        message: `Sessão resetada para ${user.name || user.email}. Usuário precisará escanear novo QR Code.`
      });
    } catch (error: any) {
      console.error(`[ADMIN] Error resetting session for user ${req.params.userId}:`, error);
      res.status(500).json({ message: "Error resetting session", error: error.message });
    }
  });

  // Reconnect all WhatsApp sessions (force)
  app.post("/api/admin/connections/reconnect-all", isAdmin, async (req, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear reconexões em massa para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando reconexão em massa (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      console.log("[ADMIN] Starting bulk force reconnection...");
      const connections = await storage.getAllConnections();
      let reconnectedCount = 0;

      for (const connection of connections) {
        if (connection.userId) {
            // Add a small delay to avoid overwhelming the server
            await new Promise(resolve => setTimeout(resolve, 1000)); 
            console.log(`[ADMIN] Force reconnecting user ${connection.userId}...`);
            await forceReconnectWhatsApp(connection.userId).catch(err => {
                console.error(`[ADMIN] Failed to reconnect user ${connection.userId}:`, err);
            });
            reconnectedCount++;
        }
      }

      res.json({ 
        success: true, 
        message: `Reconexão forçada iniciada para ${reconnectedCount} usuários`,
        count: reconnectedCount
      });
    } catch (error) {
      console.error("[ADMIN] Error in bulk reconnection:", error);
      res.status(500).json({ message: "Error reconnecting users" });
    }
  });

  // Bulk delete users
  app.post("/api/admin/users/bulk-delete", isAdmin, async (req, res) => {
    const { userIds } = req.body;
    
    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ message: "No user IDs provided" });
    }
    
    try {
      let deletedCount = 0;
      let skippedCount = 0;
      const errors: string[] = [];
      
      for (const userId of userIds) {
        try {
          const user = await storage.getUser(userId);
          if (!user) {
            errors.push(`User ${userId} not found`);
            continue;
          }
          
          // Skip admins and owners
          if (user.role === "admin" || user.role === "owner") {
            skippedCount++;
            console.log(`[ADMIN BULK DELETE] Skipped admin/owner: ${user.email}`);
            continue;
          }
          
          // Skip users with active subscription
          const activeSubscription = await storage.getUserSubscription(userId);
          if (activeSubscription && activeSubscription.status === "active") {
            skippedCount++;
            console.log(`[ADMIN BULK DELETE] Skipped user with active plan: ${user.email}`);
            continue;
          }
          
          await storage.deleteUser(userId);
          deletedCount++;
          console.log(`[ADMIN BULK DELETE] Deleted user ${userId} (${user.email})`);
        } catch (error) {
          errors.push(`Failed to delete user ${userId}`);
          console.error(`[ADMIN BULK DELETE] Error deleting user ${userId}:`, error);
        }
      }
      
      res.json({ 
        success: true, 
        deletedCount,
        skippedCount,
        message: `${deletedCount} usuário(s) excluído(s)${skippedCount > 0 ? `, ${skippedCount} ignorado(s) (admins ou com plano ativo)` : ''}${errors.length > 0 ? `. ${errors.length} erro(s).` : ''}`
      });
    } catch (error) {
      console.error("Error in bulk delete:", error);
      res.status(500).json({ message: "Error deleting users" });
    }
  });

  // Admin impersonate user - allows admin to access client's account
  app.post("/api/admin/users/:id/impersonate", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Log the impersonation attempt
      const adminId = (req.session as any)?.adminId;
      console.log(`[ADMIN IMPERSONATE] Admin ${adminId} is impersonating user ${id} (${user.email})`);
      
      // Create a session for the user
      (req.session as any).userId = user.id;
      (req.session as any).impersonatedBy = adminId;
      
      // Save session
      await new Promise<void>((resolve, reject) => {
        req.session.save((err) => {
          if (err) reject(err);
          else resolve();
        });
      });
      
      res.json({ 
        success: true, 
        message: `Logado como ${user.name || user.email}`,
        user: {
          id: user.id,
          name: user.name,
          email: user.email
        }
      });
    } catch (error) {
      console.error("Error impersonating user:", error);
      res.status(500).json({ message: "Error impersonating user" });
    }
  });

  // Update user email
  app.patch("/api/admin/users/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    const { email } = req.body;
    
    try {
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });
      
      const updated = await storage.updateUser(id, { email });
      res.json(updated);
    } catch (error) {
      res.status(500).json({ message: "Error updating user" });
    }
  });

  // Send credentials (mock)
  app.post("/api/admin/users/:id/send-credentials", isAdmin, async (req, res) => {
    const { id } = req.params;
    
    try {
      const user = await storage.getUser(id);
      if (!user) return res.status(404).json({ message: "User not found" });

      // Generate random password
      const password = Math.random().toString(36).slice(-8);
      
      // Update password in Supabase Auth
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        id,
        { password: password }
      );

      if (updateError) {
        console.error("Error updating password in Supabase:", updateError);
        return res.status(500).json({ message: "Failed to update password in Auth system: " + updateError.message });
      }
      
      // Send WhatsApp message
      if (user.phone) {
        const message = `🔐 *Suas Credenciais de Acesso*\n\nOlá ${user.name}! Aqui estão seus dados para acessar o painel:\n\n📧 *Email:* ${user.email}\n🔑 *Senha:* ${password}\n\n🔗 Acesse em: https://agentezap.com.br/login\n\n_Recomendamos trocar sua senha após o primeiro acesso._`;
        
        try {
          const { sendAdminDirectMessage } = await import("./whatsapp");
          const adminConnection = await storage.getAdminConnection();
          
          if (adminConnection && adminConnection.isConnected) {
               await sendAdminDirectMessage(adminConnection.adminId, user.phone, message);
          } else {
               console.log("⚠️ [ADMIN] No admin connection found to send credentials.");
               console.log(`[CREDENTIALS] User: ${user.email} | Pass: ${password}`);
          }
        } catch (err) {
          console.error("Error sending WhatsApp message:", err);
        }
      }

      res.json({ success: true, message: "Credentials sent", password }); // Return password so admin can see it too
    } catch (error) {
      console.error("Error sending credentials:", error);
      res.status(500).json({ message: "Error sending credentials" });
    }
  });

  // ==================== USER AGENT CONFIG ROUTES ====================
  
  // Get user agent config
  app.get("/api/admin/users/:id/agent-config", isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
      // Try to get business config first (new system)
      let config = await storage.getBusinessAgentConfig(id);
      
      // If not found, try legacy config
      if (!config) {
        const legacyConfig = await storage.getAgentConfig(id);
        if (legacyConfig) {
          // Map legacy to new format if needed, or just return what we have
          // For now, let's return the legacy config structure
          return res.json(legacyConfig);
        }
        // Return default if nothing exists
        return res.json({
            prompt: "",
            isActive: false,
            triggerPhrases: [],
            model: "mistral-medium-latest"
        });
      }
      
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Error fetching user agent config" });
    }
  });

  // Update user agent config
  app.post("/api/admin/users/:id/agent-config", isAdmin, async (req, res) => {
    const { id } = req.params;
    const data = req.body;
    try {
      // Update business config
      const config = await storage.upsertBusinessAgentConfig(id, data);
      res.json(config);
    } catch (error) {
      res.status(500).json({ message: "Error updating user agent config" });
    }
  });

  // Activate agent
  app.post("/api/admin/users/:id/activate", isAdmin, async (req, res) => {
    const { id } = req.params;
    try {
        // Assuming onboardingCompleted is the flag for activation
        const updated = await storage.updateUser(id, { onboardingCompleted: true });
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: "Error activating user" });
    }
  });

  // Admin logout
  app.post("/api/admin/logout", (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Error destroying admin session:", err);
          }
          res.clearCookie("connect.sid");
          return res.json({ success: true });
        });
      } else {
        res.clearCookie("connect.sid");
        return res.json({ success: true });
      }
    } catch (e) {
      console.error("Admin logout error:", e);
      res.status(500).json({ success: false });
    }
  });

  // Rota para simular chat com o admin (Rodrigo)
  // Funciona igual ao WhatsApp real - precisa da palavra de trigger para iniciar
  app.post("/api/test/admin-chat", async (req, res) => {
    try {
      const { phone, message, mediaType, mediaUrl } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number required" });
      }

      let media = undefined;
      if (mediaType && mediaUrl) {
        media = { type: mediaType, url: mediaUrl };
      }

      // processAdminMessage - sem skipTriggerCheck para testar o fluxo real com trigger
      const response = await processAdminMessage(phone, message || "", mediaType, mediaUrl);
      
      // Se response é null, significa que não houve trigger - retornar vazio
      if (!response) {
        return res.json({ 
          text: "", 
          noTrigger: true,
          message: "Mensagem recebida mas sem palavra de gatilho. Tente enviar 'agentezap' para iniciar."
        });
      }
      
      // O retorno pode ser um objeto ou string, dependendo da implementação.
      const responseText = typeof response === 'string' ? response : response?.text || "";
      
      // actions pode ser um objeto (não array) - verificar corretamente
      const actions = typeof response === 'object' ? response?.actions : undefined;
      const mediaActions = typeof response === 'object' ? response?.mediaActions : undefined;
      
      // Extrair link de teste se existir nas actions (actions é objeto, não array)
      let testLink = null;
      if (actions && typeof actions === 'object') {
        // Se actions tem uma propriedade testLink ou link
        if (actions.testLink) {
          testLink = actions.testLink;
        } else if (actions.link) {
          testLink = actions.link;
        }
      }
      
      res.json({ 
        text: responseText, 
        actions, 
        mediaActions,
        testLink
      });
    } catch (error) {
      console.error("Error in admin chat simulation:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Rota para obter histórico do simulador
  app.get("/api/test/admin-chat/history", async (req, res) => {
    try {
      const phone = req.query.phone as string;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const cleanPhone = phone.replace(/\D/g, "");
      
      const { getClientSession } = await import("./adminAgentService");
      const session = getClientSession(cleanPhone);
      
      if (!session) {
        return res.json({ history: [] });
      }
      
      res.json({ history: session.conversationHistory });
    } catch (error) {
      console.error("Error fetching chat history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Rota para limpar histórico do simulador (igual ao admin panel)
  app.delete("/api/test/admin-chat/clear", async (req, res) => {
    try {
      const { phone } = req.body;
      
      if (!phone) {
        return res.status(400).json({ error: "Phone number required" });
      }

      const cleanPhone = phone.replace(/\D/g, "");
      
      // Limpar sessão em memória
      const { clearClientSession } = await import("./adminAgentService");
      const cleared = clearClientSession(cleanPhone);
      
      // Cancelar follow-ups
      const { cancelFollowUp } = await import("./followUpService");
      cancelFollowUp(cleanPhone);

      // Limpar usuário do banco para reset completo (Simulador)
      try {
        const user = await storage.getUserByPhone(cleanPhone);
        if (user) {
          console.log(`🗑️ [SIMULATOR] Deletando usuário de teste ${cleanPhone} (ID: ${user.id})`);
          await storage.deleteUser(user.id);
          
          // Tentar limpar do Supabase Auth também se for email temporário
          if (user.email && user.email.includes('@agentezap.temp')) {
            try {
              const { supabase } = await import("./supabaseAuth");
              await supabase.auth.admin.deleteUser(user.id);
            } catch (e) {
              console.log("⚠️ [SIMULATOR] Erro ao deletar do Supabase Auth (ignorado):", e);
            }
          }
        }
      } catch (err) {
        console.error("❌ [SIMULATOR] Erro ao limpar dados do usuário:", err);
      }
      
      console.log(`🧹 [SIMULATOR] Histórico limpo para telefone ${cleanPhone}`);
      
      res.json({ 
        success: true, 
        message: "Histórico limpo com sucesso",
        sessionCleared: cleared
      });
    } catch (error) {
      console.error("Error clearing simulator history:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  });

  // Auth routes
  app.get("/api/auth/user", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      res.json(user);
    } catch (error) {
      console.error("Error fetching user:", error);
      res.status(500).json({ message: "Failed to fetch user" });
    }
  });

  // Update user profile
  app.put("/api/user/profile", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { email, name } = req.body;

      await storage.updateUser(userId, {
        email,
        name,
      });

      const updatedUser = await storage.getUser(userId);
      res.json(updatedUser);
    } catch (error) {
      console.error("Error updating profile:", error);
      res.status(500).json({ message: "Failed to update profile" });
    }
  });

  // Update user password (via Supabase Auth)
  app.put("/api/user/password", isAuthenticated, async (req: any, res) => {
    try {
      const { currentPassword, newPassword } = req.body;
      
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({ 
          message: "A nova senha deve ter pelo menos 6 caracteres" 
        });
      }

      // Get user email from session
      const userId = getUserId(req);
      const user = await storage.getUser(userId);
      
      if (!user || !user.email) {
        return res.status(400).json({ 
          message: "Usuário não encontrado" 
        });
      }

      // Import Supabase client to update password
      const { createClient } = await import("@supabase/supabase-js");
      const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
      const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY;
      
      if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ 
          message: "Configuração do servidor incompleta" 
        });
      }
      
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      // Get auth token from header to validate current session
      const authHeader = req.headers.authorization;
      const token = authHeader?.replace("Bearer ", "");
      
      if (token) {
        // Verify current password by trying to sign in
        const { createClient: createClientAnon } = await import("@supabase/supabase-js");
        const anonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
        if (anonKey) {
          const anonClient = createClientAnon(supabaseUrl, anonKey);
          const { error: signInError } = await anonClient.auth.signInWithPassword({
            email: user.email,
            password: currentPassword
          });
          
          if (signInError) {
            return res.status(400).json({ 
              message: "Senha atual incorreta" 
            });
          }
        }
      }
      
      // Update password using admin API
      const { data: authUser, error: getUserError } = await supabase.auth.admin.getUserById(
        req.user?.supabaseId || userId
      );
      
      if (getUserError) {
        // Try to find user by email
        const { data: users, error: listError } = await supabase.auth.admin.listUsers();
        if (!listError && users) {
          const foundUser = users.users.find((u: any) => u.email === user.email);
          if (foundUser) {
            const { error: updateError } = await supabase.auth.admin.updateUserById(
              foundUser.id,
              { password: newPassword }
            );
            
            if (updateError) {
              console.error("Error updating password:", updateError);
              return res.status(500).json({ 
                message: "Erro ao alterar senha. Tente novamente." 
              });
            }
            
            return res.json({ success: true, message: "Senha alterada com sucesso" });
          }
        }
        
        return res.status(400).json({ 
          message: "Não foi possível encontrar o usuário para alterar a senha" 
        });
      }
      
      const { error: updateError } = await supabase.auth.admin.updateUserById(
        authUser.user.id,
        { password: newPassword }
      );
      
      if (updateError) {
        console.error("Error updating password:", updateError);
        return res.status(500).json({ 
          message: "Erro ao alterar senha. Tente novamente." 
        });
      }
      
      res.json({ success: true, message: "Senha alterada com sucesso" });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Falha ao alterar senha" });
    }
  });

  // WhatsApp connection routes
  app.get("/api/whatsapp/connection", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const connection = await storage.getConnectionByUserId(userId);
      
      if (!connection) {
        return res.json(null);
      }

      res.json(connection);
    } catch (error) {
      console.error("Error fetching connection:", error);
      res.status(500).json({ message: "Failed to fetch connection" });
    }
  });

  app.post("/api/whatsapp/connect", isAuthenticated, async (req: any, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear conexões para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando conexão WhatsApp de usuário (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const userId = getUserId(req);
      await connectWhatsApp(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error connecting WhatsApp:", error);
      res.status(500).json({ message: "Failed to connect WhatsApp" });
    }
  });

  app.post("/api/whatsapp/disconnect", isAuthenticated, async (req: any, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear desconexões para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando desconexão WhatsApp de usuário (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const userId = getUserId(req);
      await disconnectWhatsApp(userId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting WhatsApp:", error);
      res.status(500).json({ message: "Failed to disconnect WhatsApp" });
    }
  });

  // Conversation routes
  app.get("/api/conversations", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);

      // Get user's connection
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.json([]);
      }

      const conversations = await storage.getConversationsByConnectionId(connection.id);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  app.get("/api/conversation/:id", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      const userId = getUserId(req);
      
      const conversation = await storage.getConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Verify ownership through connection
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      res.json(conversation);
    } catch (error) {
      console.error("Error fetching conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // ==================== CONVERSATION SHARE TOKEN ====================
  
  // POST - Generate or get share token for a conversation
  app.post("/api/conversations/:conversationId/share-token", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // If token already exists, return it
      if (conversation.shareToken) {
        return res.json({ 
          token: conversation.shareToken,
          url: `${req.protocol}://${req.get('host')}/conversas/compartilhada/${conversation.shareToken}`
        });
      }

      // Generate new token
      const crypto = await import("crypto");
      const token = crypto.randomBytes(32).toString("hex");
      
      await storage.updateConversation(conversationId, { shareToken: token });
      
      res.json({ 
        token,
        url: `${req.protocol}://${req.get('host')}/conversas/compartilhada/${token}`
      });
    } catch (error) {
      console.error("Error generating share token:", error);
      res.status(500).json({ message: "Failed to generate share token" });
    }
  });

  // GET - Access conversation by share token (public route - no auth required)
  app.get("/api/conversations/shared/:token", async (req, res) => {
    try {
      const { token } = req.params;

      if (!token || token.length !== 64) {
        return res.status(400).json({ message: "Invalid token" });
      }

      const conversation = await storage.getConversationByShareToken(token);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const messages = await storage.getMessagesByConversationId(conversation.id);
      
      res.json({
        conversation: {
          id: conversation.id,
          contactName: conversation.contactName,
          contactNumber: conversation.contactNumber,
          contactAvatar: conversation.contactAvatar,
        },
        messages: messages.map(msg => ({
          id: msg.id,
          fromMe: msg.fromMe,
          text: msg.text,
          timestamp: msg.timestamp,
          mediaType: msg.mediaType,
          mediaUrl: msg.mediaUrl,
          mediaDuration: msg.mediaDuration,
          mediaCaption: msg.mediaCaption,
          isFromAgent: msg.isFromAgent,
        })),
        contactName: conversation.contactName,
        contactNumber: conversation.contactNumber,
      });
    } catch (error) {
      console.error("Error fetching shared conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // DELETE - Remove share token from conversation
  app.delete("/api/conversations/:conversationId/share-token", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.updateConversation(conversationId, { shareToken: null });
      res.json({ success: true });
    } catch (error) {
      console.error("Error removing share token:", error);
      res.status(500).json({ message: "Failed to remove share token" });
    }
  });

  // ==================== AUTO-TRANSCRIPTION ====================
  
  // POST - Auto-transcribe all untranscribed audios in a conversation
  app.post("/api/conversations/:conversationId/auto-transcribe", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Get all messages in conversation
      const messages = await storage.getMessagesByConversationId(conversationId);
      
      // Filter audio messages without transcription
      const untranscribedAudios = messages.filter(msg => 
        msg.mediaType === "audio" && 
        msg.mediaUrl && 
        (!msg.text || msg.text === "🎵 Áudio" || msg.text === "🎤 Áudio" || msg.text.startsWith("[Áudio"))
      );

      if (untranscribedAudios.length === 0) {
        return res.json({ transcribed: 0, message: "No untranscribed audios found" });
      }

      const { transcribeAudioWithMistral } = await import("./mistralClient");
      let transcribedCount = 0;
      const errors: string[] = [];

      // Process audios (limit to 10 at a time to avoid overload)
      const toProcess = untranscribedAudios.slice(0, 10);
      
      for (const msg of toProcess) {
        try {
          if (!msg.mediaUrl) continue;
          
          const base64Part = msg.mediaUrl.split(",")[1];
          if (!base64Part) continue;
          
          const audioBuffer = Buffer.from(base64Part, "base64");
          console.log(`[Auto-Transcribe] Processing audio ${msg.id} (${audioBuffer.length} bytes)...`);
          
          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: "whatsapp-audio.ogg",
          });

          if (transcription && transcription.length > 0) {
            await storage.updateMessage(msg.id, { text: transcription });
            transcribedCount++;
            console.log(`[Auto-Transcribe] Transcribed ${msg.id}: ${transcription.substring(0, 50)}...`);
          }
        } catch (err) {
          console.error(`[Auto-Transcribe] Error transcribing ${msg.id}:`, err);
          errors.push(msg.id);
        }
      }

      res.json({ 
        transcribed: transcribedCount, 
        total: untranscribedAudios.length,
        remaining: untranscribedAudios.length - transcribedCount,
        errors: errors.length > 0 ? errors : undefined
      });
    } catch (error) {
      console.error("Error auto-transcribing:", error);
      res.status(500).json({ message: "Failed to auto-transcribe" });
    }
  });

  // Message routes
  app.get("/api/messages/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const messages = await storage.getMessagesByConversationId(conversationId);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  app.delete("/api/messages/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.deleteMessagesByConversationId(conversationId);
      
      // Reset conversation state
      await storage.updateConversation(conversationId, {
        lastMessageText: "",
        unreadCount: 0
      });

      // Re-enable agent so it can respond as if it's a new interaction
      await storage.enableAgentForConversation(conversationId);

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting messages:", error);
      res.status(500).json({ message: "Failed to delete messages" });
    }
  });

  app.post("/api/messages/send", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const result = sendMessageSchema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid request", errors: result.error });
      }

      const { conversationId, text } = result.data;

      // Verify ownership before sending
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await whatsappSendMessage(userId, conversationId, text);
      
      // 🛑 AUTO-PAUSE IA: Quando o dono envia mensagem pelo sistema, PAUSA a IA
      try {
        const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);
        if (!isAlreadyDisabled) {
          await storage.disableAgentForConversation(conversationId);
          console.log(`🛑 [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou mensagem pelo sistema`);
        }
      } catch (pauseError) {
        console.error("Erro ao pausar IA automaticamente:", pauseError);
      }
      
      res.json({ success: true, agentPaused: true });
    } catch (error: any) {
      console.error("Error sending message:", error);
      res.status(500).json({ message: error.message || "Failed to send message" });
    }
  });

  // Stats route
  app.get("/api/stats", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {
        return res.json({
          totalConversations: 0,
          unreadMessages: 0,
          todayMessages: 0,
          agentMessages: 0,
        });
      }

      const conversations = await storage.getConversationsByConnectionId(connection.id);
      const unreadMessages = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);
      const todayMessages = await storage.getTodayMessagesCount(connection.id);
      const agentMessages = await storage.getAgentMessagesCount(connection.id);

      res.json({
        totalConversations: conversations.length,
        unreadMessages,
        todayMessages,
        agentMessages,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Message usage and limits route (for free trial limit)
  app.get("/api/usage", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const connection = await storage.getConnectionByUserId(userId);
      const subscription = await storage.getUserSubscription(userId);
      
      // Apenas plano PAGO (status 'active') é ilimitado
      // Sem plano ou qualquer outro status = limite de 25 mensagens
      const hasActiveSubscription = subscription?.status === 'active';
      
      // Limite de teste: 25 mensagens (para usuários sem plano pago)
      const FREE_TRIAL_LIMIT = 25;
      
      let agentMessagesCount = 0;
      if (connection) {
        agentMessagesCount = await storage.getAgentMessagesCount(connection.id);
      }
      
      // Se tem plano pago = ilimitado, senão = limite de 25
      const limit = hasActiveSubscription ? -1 : FREE_TRIAL_LIMIT;
      const remaining = hasActiveSubscription ? -1 : Math.max(0, FREE_TRIAL_LIMIT - agentMessagesCount);
      const isLimitReached = !hasActiveSubscription && agentMessagesCount >= FREE_TRIAL_LIMIT;
      
      res.json({
        agentMessagesCount,
        limit,
        remaining,
        isLimitReached,
        hasActiveSubscription,
        planName: subscription?.plan?.nome || null,
      });
    } catch (error) {
      console.error("Error fetching usage:", error);
      res.status(500).json({ message: "Failed to fetch usage" });
    }
  });

  // AI Agent routes
  app.get("/api/agent/config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const config = await storage.getAgentConfig(userId);
      res.json(config || null);
    } catch (error) {
      console.error("Error fetching agent config:", error);
      res.status(500).json({ message: "Failed to fetch agent config" });
    }
  });

  app.post("/api/agent/config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const result = insertAiAgentConfigSchema.partial().safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid request", errors: result.error });
      }

      // Check if config already exists - if so, use update instead of upsert
      // This avoids the "prompt cannot be null" error when only updating settings
      const existingConfig = await storage.getAgentConfig(userId);
      
      // 🔍 LOG: Verificar se prompt está mudando
      const promptChanged = result.data.prompt && existingConfig && result.data.prompt !== existingConfig.prompt;
      console.log(`[AGENT CONFIG] User ${userId} - Prompt changed: ${promptChanged}`);
      if (promptChanged) {
        console.log(`[AGENT CONFIG] Old prompt length: ${existingConfig.prompt?.length || 0}`);
        console.log(`[AGENT CONFIG] New prompt length: ${result.data.prompt?.length || 0}`);
      }
      
      let config;
      if (existingConfig) {
        // Config exists, just update the provided fields
        config = await storage.updateAgentConfig(userId, result.data);
      } else {
        // No config exists, need to create with default prompt if not provided
        const dataWithDefaults = {
          prompt: result.data.prompt || "Você é um assistente virtual prestativo.",
          ...result.data
        };
        config = await storage.upsertAgentConfig(userId, dataWithDefaults);
      }
      
      // 📝 CRÍTICO: Se prompt mudou, criar nova versão no histórico
      if (promptChanged && result.data.prompt) {
        const { salvarVersaoPrompt } = await import("./promptHistoryService");
        
        console.log(`\n[AGENT CONFIG] ═══════════════════════════════════════════════════`);
        console.log(`[AGENT CONFIG] 💾 SALVAMENTO MANUAL DETECTADO`);
        console.log(`[AGENT CONFIG] User: ${userId}`);
        console.log(`[AGENT CONFIG] Prompt antigo: ${existingConfig.prompt?.length || 0} chars`);
        console.log(`[AGENT CONFIG] Prompt novo: ${result.data.prompt.length} chars`);
        console.log(`[AGENT CONFIG] Criando nova versão no histórico...`);
        
        const novaVersao = await salvarVersaoPrompt({
          userId,
          configType: 'ai_agent_config',
          promptContent: result.data.prompt,
          editSummary: 'Salvo manualmente via editor',
          editType: 'manual',
          editDetails: [{
            source: 'manual_save',
            timestamp: new Date().toISOString(),
            prompt_length: result.data.prompt.length
          }]
        });
        
        if (novaVersao) {
          console.log(`[AGENT CONFIG] ✅ Nova versão criada: v${novaVersao.version_number}`);
          console.log(`[AGENT CONFIG] ID da versão: ${novaVersao.id}`);
          console.log(`[AGENT CONFIG] Marcada como current: ${novaVersao.is_current}`);
        } else {
          console.error(`[AGENT CONFIG] ❌ ERRO: Falha ao criar versão do prompt`);
        }
        console.log(`[AGENT CONFIG] ═══════════════════════════════════════════════════\n`);
      }
      
      res.json(config);
    } catch (error) {
      console.error("Error updating agent config:", error);
      res.status(500).json({ message: "Failed to update agent config" });
    }
  });

  // ============ GERADOR DE PROMPTS COM IA ============
  app.post("/api/agent/generate-prompt", isAuthenticated, async (req: any, res) => {
    try {
      const { businessType, businessName, description, additionalInfo } = req.body;

      if (!businessType || !businessName) {
        return res.status(400).json({ message: "businessType e businessName são obrigatórios" });
      }

      // Tentar usar Mistral para gerar o prompt
      const mistralApiKey = process.env.MISTRAL_API_KEY;
      
      const businessTypeLabels: Record<string, string> = {
        restaurant: "Restaurante/Lanchonete",
        store: "Loja/Varejo",
        clinic: "Clínica/Consultório",
        salon: "Salão de Beleza/Barbearia",
        gym: "Academia/Personal",
        school: "Escola/Curso",
        agency: "Agência/Serviços",
        realestate: "Imobiliária",
        lawyer: "Escritório de Advocacia",
        mechanic: "Oficina Mecânica",
        other: "Outro negócio"
      };

      const businessTypeLabel = businessTypeLabels[businessType] || businessType;
      
      // Prompt de sistema para geração - OTIMIZADO PARA PROMPTS CONCISOS
      const systemPrompt = `Você é um especialista em criar prompts CONCISOS para agentes de IA de WhatsApp.

REGRAS CRÍTICAS:
1. O prompt deve ter NO MÁXIMO 1200 caracteres
2. Seja DIRETO e OBJETIVO - corte qualquer coisa desnecessária
3. Use formato de lista compacto, não parágrafos longos
4. Português brasileiro, tom profissional mas amigável
5. Estrutura MÍNIMA: Identidade (1-2 linhas) + Regras principais (5-7 itens) + O que NÃO fazer (3-4 itens)
6. NÃO inclua exemplos de resposta - deixe a IA improvisar
7. NÃO repita informações óbvias
8. Emojis: máximo 3-4 no prompt inteiro

FORMATO IDEAL:
[Nome] - atendente de [negócio]. [1 frase sobre tom]

REGRAS:
• [regra 1]
• [regra 2]
...

NÃO FAZER:
• [item 1]
• [item 2]

Priorize QUALIDADE sobre quantidade. Um prompt curto e bem feito é melhor que um longo e confuso.`;

      let userPrompt = "";

      if (businessType === 'custom') {
        userPrompt = `Analise a descrição abaixo e crie um prompt de atendimento perfeito para este negócio.
Identifique o tipo de negócio, o nome (se houver) e o tom de voz desejado a partir do texto.

DESCRIÇÃO DO USUÁRIO:
"${description}"

Crie um prompt completo, estruturado e profissional que o agente de IA usará para atender clientes no WhatsApp.`;
      } else {
        userPrompt = `Crie um prompt de atendimento para o seguinte negócio:

TIPO: ${businessTypeLabel}
NOME: ${businessName}
DESCRIÇÃO: ${description || "Não informada"}
INFORMAÇÕES ADICIONAIS: ${additionalInfo || "Nenhuma"}

Crie um prompt completo e profissional que o agente de IA usará para atender clientes no WhatsApp.`;
      }

      let generatedPrompt = "";

      if (mistralApiKey && mistralApiKey !== 'your-mistral-key') {
        try {
          const { Mistral } = await import("@mistralai/mistralai");
          const mistral = new Mistral({ apiKey: mistralApiKey });
          
          const response = await mistral.chat.complete({
            model: "mistral-small-latest",
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            maxTokens: 2000
          });

          if (response.choices && response.choices[0]?.message?.content) {
            generatedPrompt = String(response.choices[0].message.content);
          }
        } catch (mistralError) {
          console.error("Erro ao usar Mistral para gerar prompt:", mistralError);
        }
      }

      // Fallback: gerar prompt localmente se Mistral falhar
      if (!generatedPrompt) {
        generatedPrompt = generateLocalPrompt(businessType, businessName, description, additionalInfo, businessTypeLabel);
      }

      res.json({ prompt: generatedPrompt });
    } catch (error) {
      console.error("Error generating prompt:", error);
      res.status(500).json({ message: "Failed to generate prompt" });
    }
  });

  // ============ EDITOR DE PROMPTS COM SEARCH/REPLACE ENGINE ============
  app.post("/api/agent/edit-prompt", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { currentPrompt, instruction } = req.body;

      if (!currentPrompt || !instruction) {
        return res.status(400).json({ message: "currentPrompt e instruction são obrigatórios" });
      }

      // Buscar chave Mistral do banco de dados
      const mistralConfig = await storage.getSystemConfig('mistral_api_key');
      const mistralApiKey = mistralConfig?.valor || process.env.MISTRAL_API_KEY || '';
      
      console.log(`🔑 [Edit Prompt] Key from DB: ${mistralConfig?.valor ? `EXISTS (${mistralConfig.valor.substring(0, 10)}...)` : 'NOT FOUND'}`);
      console.log(`🔑 [Edit Prompt] Key from ENV: ${process.env.MISTRAL_API_KEY ? `EXISTS` : 'NOT FOUND'}`);
      
      if (!mistralApiKey) {
        return res.status(500).json({ 
          success: false, 
          message: "Chave de API Mistral não configurada" 
        });
      }

      // Usar novo serviço de edição via IA (Search/Replace com JSON)
      const { editarPromptViaIA } = await import("./promptEditService");
      const { salvarVersaoPrompt, salvarMensagemChat } = await import("./promptHistoryService");
      
      const result = await editarPromptViaIA(currentPrompt, instruction, mistralApiKey, "mistral");
      
      console.log(`📝 [Edit Prompt] Sucesso: ${result.success}, Edições: ${result.edicoesAplicadas}`);
      console.log(`📝 [Edit Prompt] Resposta IA: ${result.mensagemChat}`);
      
      // Salvar no histórico se teve edição bem-sucedida
      if (result.success && result.novoPrompt !== currentPrompt) {
        // Salvar mensagem do usuário
        await salvarMensagemChat({
          userId,
          configType: 'ai_agent_config',
          role: 'user',
          content: instruction
        });
        
        // Salvar resposta da IA
        await salvarMensagemChat({
          userId,
          configType: 'ai_agent_config',
          role: 'assistant',
          content: result.mensagemChat,
          metadata: {
            edicoes_aplicadas: result.edicoesAplicadas,
            edicoes_falharam: result.edicoesFalharam
          }
        });
        
        // Salvar nova versão do prompt
        await salvarVersaoPrompt({
          userId,
          configType: 'ai_agent_config',
          promptContent: result.novoPrompt,
          editSummary: instruction,
          editType: 'ia',
          editDetails: result.detalhes
        });
      }
      
      res.json({
        success: result.success,
        newPrompt: result.novoPrompt,
        changes: result.detalhes,
        summary: result.mensagemChat,
        feedbackMessage: result.mensagemChat,
        method: "mistral-search-replace",
        stats: {
          aplicadas: result.edicoesAplicadas,
          falharam: result.edicoesFalharam
        }
      });
    } catch (error: any) {
      console.error("Error editing prompt:", error);
      res.status(500).json({ message: error.message || "Failed to edit prompt" });
    }
  });

  // ============ ROTAS DE HISTÓRICO DO PROMPT ============
  
  // Listar versões do prompt
  app.get("/api/agent/prompt-versions", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { listarVersoes } = await import("./promptHistoryService");
      
      console.log(`[PROMPT VERSIONS] 📜 Listando versões para user ${userId}`);
      const versoes = await listarVersoes(userId, 'ai_agent_config', 50);
      
      console.log(`[PROMPT VERSIONS] Encontradas ${versoes.length} versões`);
      if (versoes.length > 0) {
        const currentVersion = versoes.find(v => v.is_current);
        console.log(`[PROMPT VERSIONS] Versão atual: ${currentVersion ? `v${currentVersion.version_number}` : 'NENHUMA MARCADA'}`);
      }
      
      res.json({ 
        success: true,
        versions: versoes.map(v => ({
          id: v.id,
          versionNumber: v.version_number,
          promptContent: v.prompt_content,
          editSummary: v.edit_summary,
          editType: v.edit_type,
          createdAt: v.created_at,
          isCurrent: v.is_current
        }))
      });
    } catch (error: any) {
      console.error("Error fetching prompt versions:", error);
      res.status(500).json({ message: error.message || "Failed to fetch versions" });
    }
  });
  
  // Restaurar uma versão específica
  app.post("/api/agent/prompt-versions/:id/restore", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { restaurarVersao, obterVersao } = await import("./promptHistoryService");
      
      console.log(`[RESTORE VERSION] 🔄 User ${userId} restaurando versão ${id}`);
      
      // Buscar versão original
      const versaoOriginal = await obterVersao(id);
      if (!versaoOriginal) {
        console.error(`[RESTORE VERSION] ❌ Versão ${id} não encontrada`);
        return res.status(404).json({ message: "Versão não encontrada" });
      }
      
      console.log(`[RESTORE VERSION] 📄 Versão original: v${versaoOriginal.version_number} (${versaoOriginal.edit_type})`);
      
      // Criar nova versão restaurada
      const versaoRestaurada = await restaurarVersao(id, userId);
      
      if (!versaoRestaurada) {
        console.error(`[RESTORE VERSION] ❌ Falha ao criar versão restaurada`);
        return res.status(500).json({ message: "Falha ao restaurar versão" });
      }
      
      console.log(`[RESTORE VERSION] ✅ Nova versão criada: v${versaoRestaurada.version_number} (tipo: restore)`);
      
      // 💾 CRÍTICO: Atualizar o prompt no config para o agente usar
      const agentConfig = await storage.getAgentConfig(userId);
      if (agentConfig) {
        console.log(`[RESTORE VERSION] 💾 Atualizando ai_agent_config.prompt`);
        console.log(`[RESTORE VERSION] 📊 Prompt antigo: ${agentConfig.prompt?.length || 0} chars`);
        console.log(`[RESTORE VERSION] 📊 Prompt novo: ${versaoRestaurada.prompt_content.length} chars`);
        
        await storage.updateAgentConfig(userId, {
          prompt: versaoRestaurada.prompt_content
        });
        
        console.log(`[RESTORE VERSION] ✅ Config atualizado com sucesso!`);
      } else {
        console.warn(`[RESTORE VERSION] ⚠️ Nenhum config encontrado para user ${userId}`);
      }
      
      res.json({ 
        success: true,
        newPrompt: versaoRestaurada.prompt_content,
        versionId: versaoRestaurada.id,
        versionNumber: versaoRestaurada.version_number,
        restoredFrom: versaoOriginal.version_number
      });
    } catch (error: any) {
      console.error("[RESTORE VERSION] ❌ Error restoring prompt version:", error);
      res.status(500).json({ message: error.message || "Failed to restore version" });
    }
  });
  
  // Listar chat do histórico
  app.get("/api/agent/prompt-chat", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { listarChatHistory } = await import("./promptHistoryService");
      
      const mensagens = await listarChatHistory(userId, 'ai_agent_config', 100);
      
      res.json({ 
        success: true,
        messages: mensagens.map(m => ({
          id: m.id,
          role: m.role,
          content: m.content,
          createdAt: m.created_at
        }))
      });
    } catch (error: any) {
      console.error("Error fetching prompt chat:", error);
      res.status(500).json({ message: error.message || "Failed to fetch chat" });
    }
  });

  // 🔍 ROTA DE DEBUG: Validar consistência do sistema de versões
  app.get("/api/agent/prompt-versions/validate", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { listarVersoes, obterVersaoAtual } = await import("./promptHistoryService");
      
      console.log(`[VALIDATE] 🔍 Validando consistência para user ${userId}`);
      
      // 1. Buscar config atual
      const agentConfig = await storage.getAgentConfig(userId);
      
      // 2. Buscar versão marcada como current
      const versaoAtual = await obterVersaoAtual(userId, 'ai_agent_config');
      
      // 3. Listar todas versões
      const todasVersoes = await listarVersoes(userId, 'ai_agent_config', 100);
      
      // 4. Verificar se há múltiplas versões com is_current = true
      const versoesMarkadasCurrent = todasVersoes.filter(v => v.is_current);
      
      // 5. Verificar sincronização
      const promptNoConfig = agentConfig?.prompt || '';
      const promptNaVersao = versaoAtual?.prompt_content || '';
      const isSynced = promptNoConfig === promptNaVersao;
      
      const report = {
        userId,
        timestamp: new Date().toISOString(),
        agentConfig: {
          exists: !!agentConfig,
          isActive: agentConfig?.isActive,
          promptLength: promptNoConfig.length,
          promptHash: require('crypto').createHash('md5').update(promptNoConfig).digest('hex').substring(0, 8)
        },
        currentVersion: versaoAtual ? {
          id: versaoAtual.id,
          versionNumber: versaoAtual.version_number,
          promptLength: promptNaVersao.length,
          promptHash: require('crypto').createHash('md5').update(promptNaVersao).digest('hex').substring(0, 8),
          editType: versaoAtual.edit_type,
          createdAt: versaoAtual.created_at
        } : null,
        validation: {
          isSynced,
          multipleCurrentVersions: versoesMarkadasCurrent.length > 1,
          currentVersionsCount: versoesMarkadasCurrent.length,
          totalVersions: todasVersoes.length,
          hasNoCurrentVersion: versoesMarkadasCurrent.length === 0
        },
        issues: [] as string[]
      };
      
      // Identificar problemas
      if (!isSynced) {
        report.issues.push('❌ DESSINCRONIZADO: ai_agent_config.prompt diferente de prompt_versions.is_current');
      }
      if (versoesMarkadasCurrent.length > 1) {
        report.issues.push(`❌ MÚLTIPLAS VERSÕES CURRENT: ${versoesMarkadasCurrent.length} versões marcadas como is_current`);
      }
      if (versoesMarkadasCurrent.length === 0 && todasVersoes.length > 0) {
        report.issues.push('⚠️ NENHUMA VERSÃO CURRENT: Existem versões mas nenhuma marcada como current');
      }
      
      if (report.issues.length === 0) {
        report.issues.push('✅ Sistema consistente - Nenhum problema encontrado');
      }
      
      console.log(`[VALIDATE] Resultado:`, JSON.stringify(report, null, 2));
      
      res.json(report);
    } catch (error: any) {
      console.error("[VALIDATE] Error:", error);
      res.status(500).json({ message: error.message || "Failed to validate" });
    }
  });

  app.post("/api/agent/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ 
        message: z.string(), 
        customPrompt: z.string().optional(),
        // 🆕 Suporte para histórico de conversação (simulador unificado)
        history: z.array(z.object({
          role: z.enum(["user", "assistant"]),
          content: z.string()
        })).optional(),
        // 🆕 Mídias já enviadas nesta sessão do simulador
        sentMedias: z.array(z.string()).optional()
      });
      const result = schema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid request" });
      }

      // Converter histórico do frontend para formato Message[]
      const conversationHistory = result.data.history?.map((msg, idx) => ({
        id: `sim-${idx}`,
        chatId: "simulator",
        text: msg.content,
        fromMe: msg.role === "assistant",
        timestamp: new Date(Date.now() - (result.data.history!.length - idx) * 60000),
        isFromAgent: msg.role === "assistant",
      })) || [];

      // Aceita prompt customizado para testar mudanças não salvas
      const testResult = await testAgentResponse(
        userId, 
        result.data.message, 
        result.data.customPrompt,
        conversationHistory,
        result.data.sentMedias
      );
      
      // 📁 RESOLVER URLs DAS MÍDIAS PARA O FRONTEND
      let mediaActions: any[] = [];
      if (testResult.mediaActions && testResult.mediaActions.length > 0) {
        const mediaLibrary = await getAgentMediaLibrary(userId);
        
        for (const action of testResult.mediaActions) {
          if (action.type === 'send_media' && action.media_name) {
            const mediaItem = mediaLibrary.find(
              m => m.name.toUpperCase() === action.media_name.toUpperCase()
            );
            
            if (mediaItem) {
              console.log(`📁 [/api/agent/test] Mídia encontrada: ${action.media_name} -> ${mediaItem.storageUrl}`);
              mediaActions.push({
                type: 'send_media',
                media_name: action.media_name,
                media_url: mediaItem.storageUrl,
                media_type: mediaItem.mediaType,
                caption: mediaItem.caption || mediaItem.description,
              });
            }
          }
        }
      }
      
      res.json({ 
        response: testResult.text,
        mediaActions
      });
    } catch (error: any) {
      console.error("Error testing agent:", error);
      res.status(500).json({ message: error.message || "Failed to test agent" });
    }
  });

  // ==========================================================================
  // CALENDAR ROUTES
  // ==========================================================================

  app.get("/api/admin/calendar/events", isAdmin, async (req: any, res) => {
    try {
      const events = await followUpService.getCalendarEvents();
      res.json({ events });
    } catch (error) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ message: "Failed to fetch calendar events" });
    }
  });

  app.get("/api/admin/calendar/stats", isAdmin, async (req: any, res) => {
    try {
      const stats = await followUpService.getFollowUpStats();
      res.json(stats);
    } catch (error) {
      console.error("Error fetching calendar stats:", error);
      res.status(500).json({ message: "Failed to fetch calendar stats" });
    }
  });

  app.delete("/api/admin/calendar/events/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      // ID format: fu_123 (followup_ID)
      if (id.startsWith('fu_')) {
        const conversationId = parseInt(id.split('_')[1]);
        await followUpService.disableFollowUp(conversationId);
        res.json({ success: true });
      } else {
        res.status(400).json({ message: "Invalid event ID" });
      }
    } catch (error) {
      console.error("Error cancelling event:", error);
      res.status(500).json({ message: "Failed to cancel event" });
    }
  });

  // ==========================================================================
  // END CALENDAR ROUTES
  // ==========================================================================

  // ==========================================================================
  // AGENT MEDIA LIBRARY ROUTES
  // ==========================================================================

  // Lista todas as mídias do agente
  app.get("/api/agent/media", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const mediaList = await getAgentMediaLibrary(userId);
      res.json(mediaList);
    } catch (error) {
      console.error("Error fetching agent media:", error);
      res.status(500).json({ message: "Failed to fetch agent media" });
    }
  });

  // Busca uma mídia específica por nome
  app.get("/api/agent/media/:name", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name } = req.params;
      const media = await getMediaByName(userId, name);
      
      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }
      
      res.json(media);
    } catch (error) {
      console.error("Error fetching agent media:", error);
      res.status(500).json({ message: "Failed to fetch agent media" });
    }
  });

  // Cria uma nova mídia (auto-incrementa nome se já existir)
  app.post("/api/agent/media", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const result = agentMediaSchema.safeParse({ ...req.body, userId });

      if (!result.success) {
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: result.error.errors 
        });
      }

      const media = await insertAgentMedia(result.data);
      
      if (!media) {
        return res.status(500).json({ message: "Failed to save media" });
      }

      res.json(media);
    } catch (error) {
      console.error("Error saving agent media:", error);
      res.status(500).json({ message: "Failed to save agent media" });
    }
  });

  // Atualiza uma mídia existente
  app.put("/api/agent/media/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      console.log("[Routes] PUT /api/agent/media/:id - body:", JSON.stringify(req.body, null, 2));
      const result = agentMediaSchema.partial().safeParse(req.body);

      if (!result.success) {
        console.error("[Routes] PUT /api/agent/media/:id - validation errors:", result.error.errors);
        return res.status(400).json({ 
          message: "Invalid request", 
          errors: result.error.errors 
        });
      }

      const media = await updateAgentMedia(id, userId, result.data);
      
      if (!media) {
        return res.status(404).json({ message: "Media not found" });
      }

      res.json(media);
    } catch (error: any) {
      console.error("Error updating agent media:", error);
      // Se for erro de nome duplicado, retorna 400
      if (error.message?.includes('já existe')) {
        return res.status(400).json({ message: error.message });
      }
      res.status(500).json({ message: "Failed to update agent media" });
    }
  });

  // Deleta uma mídia
  app.delete("/api/agent/media/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      const success = await deleteAgentMedia(userId, id);
      
      if (!success) {
        return res.status(500).json({ message: "Failed to delete media" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting agent media:", error);
      res.status(500).json({ message: "Failed to delete agent media" });
    }
  });

  // =============================================
  // UPLOAD DE ARQUIVO PARA BIBLIOTECA DE MÍDIAS
  // =============================================
  app.post("/api/agent/media/upload", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Determinar tipo de mídia baseado no mimetype
      let mediaType: 'audio' | 'image' | 'video' | 'document' = 'document';
      if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `media/${userId}/${timestamp}_${safeFileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('agent-media')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        
        // Se o bucket não existir, tentar criar
        if (uploadError.message?.includes('Bucket not found')) {
          // Criar bucket
          const { error: createError } = await supabase.storage.createBucket('agent-media', {
            public: true,
            fileSizeLimit: 52428800 // 50MB
          });
          
          if (createError && !createError.message?.includes('already exists')) {
            return res.status(500).json({ message: "Failed to create storage bucket", error: createError.message });
          }

          // Tentar upload novamente
          const { data: retryData, error: retryError } = await supabase.storage
            .from('agent-media')
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false
            });

          if (retryError) {
            return res.status(500).json({ message: "Failed to upload file", error: retryError.message });
          }
        } else {
          return res.status(500).json({ message: "Failed to upload file", error: uploadError.message });
        }
      }

      // Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from('agent-media')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Se for áudio, fazer transcrição automática
      let transcription: string | null = null;
      if (mediaType === 'audio') {
        try {
          console.log(`[Routes] Iniciando transcrição automática para áudio: ${file.originalname}`);
          transcription = await transcribeAudio(publicUrl, file.mimetype);
          if (transcription) {
            console.log(`[Routes] Transcrição concluída: ${transcription.substring(0, 100)}...`);
          }
        } catch (error) {
          console.error('[Routes] Erro ao transcrever áudio:', error);
          // Não falhar o upload se a transcrição falhar
        }
      }

      res.json({
        success: true,
        storageUrl: publicUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        mediaType: mediaType,
        transcription: transcription || undefined
      });

    } catch (error: any) {
      console.error("Error uploading file:", error);
      res.status(500).json({ message: "Failed to upload file", error: error.message });
    }
  });

  // Transcreve um áudio (para preencher automaticamente a descrição)
  app.post("/api/agent/media/transcribe", isAuthenticated, async (req: any, res) => {
    try {
      const { audioUrl, mimeType } = req.body;
      
      if (!audioUrl) {
        return res.status(400).json({ message: "audioUrl is required" });
      }

      const transcription = await transcribeAudio(audioUrl, mimeType);
      
      if (!transcription) {
        return res.status(500).json({ message: "Failed to transcribe audio" });
      }

      res.json({ transcription });
    } catch (error) {
      console.error("Error transcribing audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // ==========================================================================
  // END AGENT MEDIA LIBRARY ROUTES
  // ==========================================================================

  app.post("/api/agent/disable/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.disableAgentForConversation(conversationId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disabling agent:", error);
      res.status(500).json({ message: "Failed to disable agent" });
    }
  });

  app.post("/api/agent/enable/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      await storage.enableAgentForConversation(conversationId);
      
      // 🔄 Quando IA é reativada, verificar se há mensagens pendentes e responder
      try {
        const triggerResult = await triggerAgentResponseForConversation(userId, conversationId);
        console.log(`🔄 [ENABLE] IA reativada para ${conversationId}: ${triggerResult.reason}`);
      } catch (triggerError) {
        console.error("Erro ao disparar resposta após reativar IA:", triggerError);
      }
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error enabling agent:", error);
      res.status(500).json({ message: "Failed to enable agent" });
    }
  });

  app.post("/api/agent/toggle/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const { disable } = req.body;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (disable) {
        await storage.disableAgentForConversation(conversationId);
      } else {
        await storage.enableAgentForConversation(conversationId);
        
        // 🔄 Quando IA é reativada, verificar se há mensagens pendentes e responder
        try {
          const triggerResult = await triggerAgentResponseForConversation(userId, conversationId);
          console.log(`🔄 [TOGGLE] IA reativada para ${conversationId}: ${triggerResult.reason}`);
        } catch (triggerError) {
          console.error("Erro ao disparar resposta após reativar IA:", triggerError);
        }
      }

      res.json({ success: true, isDisabled: disable });
    } catch (error) {
      console.error("Error toggling agent:", error);
      res.status(500).json({ message: "Failed to toggle agent" });
    }
  });

  app.post("/api/agent/toggle-followup/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const { active } = req.body;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      if (active) {
        await followUpService.scheduleInitialFollowUp(conversationId);
      } else {
        await followUpService.disableFollowUp(parseInt(conversationId));
      }

      res.json({ success: true, active });
    } catch (error) {
      console.error("Error toggling follow-up:", error);
      res.status(500).json({ message: "Failed to toggle follow-up" });
    }
  });

  app.get("/api/agent/status/:conversationId", isAuthenticated, async (req: any, res) => {
    try {
      const { conversationId } = req.params;
      const userId = getUserId(req);

      // Verify ownership
      const conversation = await storage.getConversation(conversationId);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      const isDisabled = await storage.isAgentDisabledForConversation(conversationId);
      res.json({ isDisabled });
    } catch (error) {
      console.error("Error getting agent status:", error);
      res.status(500).json({ message: "Failed to get agent status" });
    }
  });

  // ==================== BUSINESS AGENT CONFIG ROUTES (🆕 ADVANCED SYSTEM) ====================
  
  // Get business agent configuration
  app.get("/api/agent/business-config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const config = await storage.getBusinessAgentConfig?.(userId);
      
      if (!config) {
        return res.json({ config: null, hasAdvancedConfig: false });
      }
      
      res.json({ config, hasAdvancedConfig: true });
    } catch (error) {
      console.error("Error getting business agent config:", error);
      res.status(500).json({ message: "Failed to get business agent configuration" });
    }
  });

  // Save/Update business agent configuration
  app.post("/api/agent/business-config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const configData = req.body;
      
      // Validar dados básicos
      if (!configData.agentName || !configData.agentRole || !configData.companyName) {
        return res.status(400).json({ 
          message: "Missing required fields: agentName, agentRole, companyName" 
        });
      }
      
      const config = await storage.upsertBusinessAgentConfig?.(userId, {
        ...configData,
        userId,
      });
      
      res.json({ config, message: "Business agent configuration saved successfully" });
    } catch (error) {
      console.error("Error saving business agent config:", error);
      res.status(500).json({ message: "Failed to save business agent configuration" });
    }
  });

  // Get notification configuration
  app.get("/api/agent/notification-config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const config = await storage.getBusinessAgentConfig?.(userId);
      
      res.json({ 
        notificationPhoneNumber: config?.notificationPhoneNumber || "",
        notificationTrigger: config?.notificationTrigger || "",
        notificationEnabled: config?.notificationEnabled || false,
        notificationMode: config?.notificationMode || "ai",
        notificationManualKeywords: config?.notificationManualKeywords || "",
      });
    } catch (error) {
      console.error("Error getting notification config:", error);
      res.status(500).json({ message: "Failed to get notification configuration" });
    }
  });

  // Save/Update notification configuration (separate from main agent config)
  app.post("/api/agent/notification-config", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { notificationPhoneNumber, notificationTrigger, notificationEnabled, notificationMode, notificationManualKeywords } = req.body;
      
      // Check if user has a business config, if not create a minimal one
      let existingConfig = await storage.getBusinessAgentConfig?.(userId);
      
      if (!existingConfig) {
        // Create minimal config just for notifications
        existingConfig = await storage.upsertBusinessAgentConfig?.(userId, {
          userId,
          agentName: "Assistente",
          agentRole: "Assistente Virtual",
          companyName: "Minha Empresa",
          notificationPhoneNumber: notificationPhoneNumber || null,
          notificationTrigger: notificationTrigger || null,
          notificationEnabled: notificationEnabled || false,
          notificationMode: notificationMode || "ai",
          notificationManualKeywords: notificationManualKeywords || null,
        });
      } else {
        // Update only notification fields
        existingConfig = await storage.upsertBusinessAgentConfig?.(userId, {
          ...existingConfig,
          notificationPhoneNumber: notificationPhoneNumber || null,
          notificationTrigger: notificationTrigger || null,
          notificationEnabled: notificationEnabled || false,
          notificationMode: notificationMode || "ai",
          notificationManualKeywords: notificationManualKeywords || null,
        });
      }
      
      res.json({ 
        message: "Notification configuration saved successfully",
        notificationPhoneNumber: existingConfig?.notificationPhoneNumber || "",
        notificationTrigger: existingConfig?.notificationTrigger || "",
        notificationEnabled: existingConfig?.notificationEnabled || false,
        notificationMode: existingConfig?.notificationMode || "ai",
        notificationManualKeywords: existingConfig?.notificationManualKeywords || "",
      });
    } catch (error) {
      console.error("Error saving notification config:", error);
      res.status(500).json({ message: "Failed to save notification configuration" });
    }
  });

  // Get available templates
  app.get("/api/agent/templates", isAuthenticated, async (_req: any, res) => {
    try {
      const { getAllTemplates } = await import("./businessTemplates");
      const templates = getAllTemplates();
      res.json({ templates });
    } catch (error) {
      console.error("Error getting templates:", error);
      res.status(500).json({ message: "Failed to get templates" });
    }
  });

  // Test business agent configuration (preview response)
  app.post("/api/agent/test-config", isAuthenticated, async (req: any, res) => {
    try {
      const { config, testMessage } = req.body;
      
      if (!config || !testMessage) {
        return res.status(400).json({ message: "Missing config or testMessage" });
      }
      
      // Gerar prompt de teste
      const { generateSystemPrompt } = await import("./promptTemplates");
      const systemPrompt = generateSystemPrompt(config, {
        currentTime: new Date(),
      });
      
      // Chamar Mistral para teste
      const { getMistralClient } = await import("./mistralClient");
      const mistral = await getMistralClient();
      
      const response = await mistral.chat.complete({
        model: config.model || "mistral-small-latest",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: testMessage },
        ],
        maxTokens: 400,
        temperature: 0.7,
      });
      
      const aiResponse = response.choices?.[0]?.message?.content || "Erro ao gerar resposta";
      
      res.json({ 
        response: aiResponse,
        promptPreview: systemPrompt.substring(0, 500) + "..." 
      });
    } catch (error) {
      console.error("Error testing agent config:", error);
      res.status(500).json({ message: "Failed to test agent configuration" });
    }
  });

  // Preview generated prompt
  app.post("/api/agent/preview-prompt", isAuthenticated, async (req: any, res) => {
    try {
      const { config } = req.body;
      
      if (!config) {
        return res.status(400).json({ message: "Missing config" });
      }
      
      const { generateSystemPrompt } = await import("./promptTemplates");
      const systemPrompt = generateSystemPrompt(config, {
        currentTime: new Date(),
      });
      
      res.json({ 
        prompt: systemPrompt,
        length: systemPrompt.length,
        estimatedTokens: Math.ceil(systemPrompt.length / 4),
      });
    } catch (error) {
      console.error("Error previewing prompt:", error);
      res.status(500).json({ message: "Failed to preview prompt" });
    }
  });

  // ==================== COUPONS ROUTES ====================
  // Validate coupon code (public)
  app.post("/api/coupons/validate", async (req, res) => {
    try {
      const { code, planTipo } = req.body;
      
      console.log("Validating coupon:", { code, planTipo });
      
      if (!code) {
        return res.status(400).json({ message: "Código do cupom é obrigatório" });
      }

      const coupon = await storage.getCouponByCode(code.toUpperCase());
      
      console.log("Coupon found:", coupon);
      
      if (!coupon) {
        return res.status(404).json({ message: "Cupom não encontrado", valid: false });
      }

      if (!coupon.isActive) {
        return res.status(400).json({ message: "Cupom expirado ou inativo", valid: false });
      }

      if (coupon.maxUses && coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses) {
        return res.status(400).json({ message: "Cupom esgotado", valid: false });
      }

      if (coupon.validUntil && new Date(coupon.validUntil) < new Date()) {
        return res.status(400).json({ message: "Cupom expirado", valid: false });
      }

      // Check if coupon is applicable to the specified plan
      const applicablePlans = coupon.applicablePlans as string[] | null;
      if (planTipo && applicablePlans && applicablePlans.length > 0) {
        if (!applicablePlans.includes(planTipo)) {
          return res.status(400).json({ message: "Cupom não válido para este plano", valid: false });
        }
      }

      res.json({ 
        valid: true, 
        finalPrice: coupon.finalPrice,
        discountType: coupon.discountType,
        code: coupon.code,
        applicablePlans: applicablePlans || null
      });
    } catch (error: any) {
      console.error("Error validating coupon:", error);
      console.error("Error stack:", error.stack);
      res.status(500).json({ 
        message: "Erro ao validar cupom", 
        error: error.message,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  });

  // Get all coupons (admin only)
  app.get("/api/admin/coupons", isAdmin, async (_req, res) => {
    try {
      const coupons = await storage.getAllCoupons();
      res.json(coupons);
    } catch (error) {
      console.error("Error fetching coupons:", error);
      res.status(500).json({ message: "Failed to fetch coupons" });
    }
  });

  // Create coupon (admin only)
  app.post("/api/admin/coupons", isAdmin, async (req, res) => {
    try {
      const { code, finalPrice, maxUses, validUntil, isActive, applicablePlans } = req.body;
      
      console.log("Creating coupon with data:", { code, finalPrice, maxUses, validUntil, isActive, applicablePlans });
      
      if (!code || finalPrice === undefined || finalPrice === null || finalPrice === "") {
        return res.status(400).json({ message: "Código e preço final são obrigatórios" });
      }

      const coupon = await storage.createCoupon({
        code: code.toUpperCase().trim(),
        finalPrice: String(finalPrice),
        discountType: "fixed_price",
        discountValue: "0",
        maxUses: maxUses ? parseInt(maxUses) : null,
        validUntil: validUntil ? new Date(validUntil) : null,
        isActive: isActive !== false,
        applicablePlans: applicablePlans && applicablePlans.length > 0 ? applicablePlans : null,
        currentUses: 0
      });
      console.log("Coupon created successfully:", coupon);
      res.json(coupon);
    } catch (error: any) {
      console.error("Error creating coupon:", error);
      res.status(500).json({ message: "Failed to create coupon", error: error.message });
    }
  });

  // Update coupon (admin only)
  app.put("/api/admin/coupons/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { code, finalPrice, maxUses, validUntil, isActive, applicablePlans } = req.body;
      
      console.log("Updating coupon:", id, req.body);
      
      const updateData: any = {};
      if (code !== undefined) updateData.code = code.toUpperCase().trim();
      if (finalPrice !== undefined) updateData.finalPrice = String(finalPrice);
      if (maxUses !== undefined) updateData.maxUses = maxUses ? parseInt(maxUses) : null;
      if (validUntil !== undefined) updateData.validUntil = validUntil ? new Date(validUntil) : null;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (applicablePlans !== undefined) updateData.applicablePlans = applicablePlans && applicablePlans.length > 0 ? applicablePlans : null;
      
      const coupon = await storage.updateCoupon(id, updateData);
      console.log("Coupon updated successfully:", coupon);
      res.json(coupon);
    } catch (error: any) {
      console.error("Error updating coupon:", error);
      res.status(500).json({ message: "Failed to update coupon", error: error.message });
    }
  });

  // Delete coupon (admin only)
  app.delete("/api/admin/coupons/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deleteCoupon(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting coupon:", error);
      res.status(500).json({ message: "Failed to delete coupon" });
    }
  });

  // ==================== PLANOS ROUTES ====================
  // Get all active plans (public)
  app.get("/api/plans", async (_req, res) => {
    try {
      const plans = await storage.getActivePlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Get plan by ID (public)
  app.get("/api/plans/:id", async (req, res) => {
    try {
      const { id } = req.params;
      const plans = await storage.getActivePlans();
      const plan = plans.find((p: any) => p.id === id);
      
      if (!plan) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }
      
      res.json(plan);
    } catch (error) {
      console.error("Error fetching plan:", error);
      res.status(500).json({ message: "Erro ao buscar plano" });
    }
  });

  // Get all plans (admin only)
  app.get("/api/admin/plans", isAdmin, async (_req, res) => {
    try {
      const plans = await storage.getAllPlans();
      res.json(plans);
    } catch (error) {
      console.error("Error fetching plans:", error);
      res.status(500).json({ message: "Failed to fetch plans" });
    }
  });

  // Create plan (admin only)
  app.post("/api/admin/plans", isAdmin, async (req, res) => {
    try {
      const validatedData = insertPlanSchema.parse(req.body);
      const plan = await storage.createPlan(validatedData);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error creating plan:", error);
      res.status(500).json({ message: "Failed to create plan" });
    }
  });

  // Update plan (admin only)
  app.put("/api/admin/plans/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const validatedData = insertPlanSchema.partial().parse(req.body);
      const plan = await storage.updatePlan(id, validatedData);
      res.json(plan);
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ message: error.errors[0].message });
      }
      console.error("Error updating plan:", error);
      res.status(500).json({ message: "Failed to update plan" });
    }
  });

  // Delete plan (admin only)
  app.delete("/api/admin/plans/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await storage.deletePlan(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting plan:", error);
      res.status(500).json({ message: "Failed to delete plan" });
    }
  });

  // Validate custom plan code (public)
  app.post("/api/plans/validate-code", async (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ valid: false, message: "Código não informado" });
      }
      
      // Search for plan with the custom code
      const allPlans = await storage.getAllPlans();
      const plan = allPlans.find(p => 
        (p as any).codigoPersonalizado?.toUpperCase() === code.toUpperCase() && 
        p.ativo && 
        (p as any).isPersonalizado
      );
      
      if (!plan) {
        return res.json({ valid: false, message: "Código de plano não encontrado" });
      }
      
      res.json({ 
        valid: true, 
        plan: {
          id: plan.id,
          nome: plan.nome,
          descricao: plan.descricao,
          valor: plan.valor,
          valorPrimeiraCobranca: (plan as any).valorPrimeiraCobranca,
          periodicidade: plan.periodicidade,
          caracteristicas: plan.caracteristicas,
        }
      });
    } catch (error) {
      console.error("Error validating plan code:", error);
      res.status(500).json({ valid: false, message: "Erro ao validar código" });
    }
  });

  // ==================== SUBSCRIPTIONS ROUTES ====================
  // Get current user subscription
  app.get("/api/subscriptions/current", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const subscription = await storage.getUserSubscription(userId);
      res.json(subscription || null);
    } catch (error) {
      console.error("Error fetching subscription:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Get subscription by ID
  app.get("/api/subscriptions/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      
      const subscription = await storage.getSubscription(id) as any;
      
      if (!subscription) {
        return res.status(404).json({ message: "Subscription not found" });
      }
      
      // Check if user owns this subscription or is admin
      const user = await storage.getUser(userId) as any;
      if (subscription.userId !== userId && user?.role !== 'admin') {
        return res.status(403).json({ message: "Access denied" });
      }
      
      // Include plan data
      const plan = await storage.getPlan(subscription.planId);
      res.json({ ...subscription, plan });
    } catch (error) {
      console.error("Error fetching subscription by ID:", error);
      res.status(500).json({ message: "Failed to fetch subscription" });
    }
  });

  // Create subscription
  app.post("/api/subscriptions/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { planId, couponCode } = req.body;

      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }

      // Check if plan exists and is active
      const plan = await storage.getPlan(planId);
      if (!plan || !plan.ativo) {
        return res.status(404).json({ message: "Plan not found or inactive" });
      }

      // Validate coupon if provided
      let appliedCouponPrice = null;
      let appliedCouponCode = null;
      
      if (couponCode) {
        const coupon = await storage.getCouponByCode(couponCode.toUpperCase());
        
        if (coupon && coupon.isActive) {
          // Check if coupon is valid
          const isExpired = coupon.validUntil && new Date(coupon.validUntil) < new Date();
          const isExhausted = coupon.maxUses && coupon.maxUses > 0 && coupon.currentUses >= coupon.maxUses;
          
          // Check if coupon applies to this plan
          const applicablePlans = coupon.applicablePlans as string[] | null;
          const planTipo = plan.tipo || (plan.periodicidade === "mensal" ? "mensal" : plan.periodicidade);
          const isApplicable = !applicablePlans || applicablePlans.length === 0 || applicablePlans.includes(planTipo);
          
          if (!isExpired && !isExhausted && isApplicable) {
            appliedCouponCode = coupon.code;
            appliedCouponPrice = coupon.finalPrice;
            // Increment coupon usage
            await storage.incrementCouponUsage(coupon.id);
          }
        }
      }

      // Create subscription with pending status
      const subscription = await storage.createSubscription({
        userId,
        planId,
        status: "pending",
        dataInicio: new Date(),
        couponCode: appliedCouponCode,
        couponPrice: appliedCouponPrice,
      });

      res.json(subscription);
    } catch (error) {
      console.error("Error creating subscription:", error);
      res.status(500).json({ message: "Failed to create subscription" });
    }
  });

  // Get all subscriptions (admin only)
  app.get("/api/admin/subscriptions", isAdmin, async (_req, res) => {
    try {
      const subscriptions = await storage.getAllSubscriptions();
      res.json(subscriptions);
    } catch (error) {
      console.error("Error fetching subscriptions:", error);
      res.status(500).json({ message: "Failed to fetch subscriptions" });
    }
  });

  // Admin: Assign plan to client (create subscription and auto-activate)
  app.post("/api/admin/subscriptions/assign", isAdmin, async (req, res) => {
    try {
      const { userId, planId } = req.body;

      if (!userId || !planId) {
        return res.status(400).json({ message: "User ID and Plan ID are required" });
      }

      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plan not found" });
      }

      // Create subscription with active status
      const subscription = await storage.createSubscription({
        userId,
        planId,
        status: "active",
        dataInicio: new Date(),
        dataFim: new Date(Date.now() + (plan.periodicidade === "anual" ? 365 : 30) * 24 * 60 * 60 * 1000),
      });

      res.json(subscription);
    } catch (error) {
      console.error("Error assigning plan:", error);
      res.status(500).json({ message: "Failed to assign plan" });
    }
  });

  // Admin: Cancel subscription
  app.delete("/api/admin/subscriptions/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      await storage.updateSubscription(id, { 
        status: "cancelled",
        dataFim: new Date(),
      });

      res.json({ success: true });
    } catch (error) {
      console.error("Error cancelling subscription:", error);
      res.status(500).json({ message: "Failed to cancel subscription" });
    }
  });

  // ==========================================
  // MIGRAÇÃO DE PLANOS (UPGRADE/DOWNGRADE)
  // Permite que o cliente mude de plano mantendo assinatura ativa
  // ==========================================
  app.post("/api/subscriptions/migrate-plan", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { newPlanId, subscriptionId } = req.body;

      if (!newPlanId || !subscriptionId) {
        return res.status(400).json({ 
          status: "error",
          message: "ID do novo plano e da assinatura são obrigatórios" 
        });
      }

      // Get current subscription
      const currentSubscription = await storage.getSubscription(subscriptionId) as any;
      if (!currentSubscription || currentSubscription.userId !== userId) {
        return res.status(404).json({ 
          status: "error",
          message: "Assinatura não encontrada" 
        });
      }

      if (currentSubscription.status !== "active") {
        return res.status(400).json({ 
          status: "error",
          message: "Só é possível migrar assinaturas ativas" 
        });
      }

      // Get new plan
      const newPlan = await storage.getPlan(newPlanId) as any;
      if (!newPlan || !newPlan.ativo) {
        return res.status(404).json({ 
          status: "error",
          message: "Novo plano não encontrado ou inativo" 
        });
      }

      // Get current plan for comparison
      const currentPlan = await storage.getPlan(currentSubscription.planId) as any;
      const isUpgrade = parseFloat(newPlan.valor) > parseFloat(currentPlan.valor);

      // Get MP credentials to update subscription if exists
      const configMap = await storage.getSystemConfigs([
        "mercadopago_access_token",
        "mercadopago_test_mode"
      ]);
      const accessToken = configMap.get("mercadopago_access_token");

      // If subscription has MP subscription, update the recurring amount
      if (currentSubscription.mpSubscriptionId && accessToken) {
        try {
          console.log("[Plan Migration] Updating MP subscription:", currentSubscription.mpSubscriptionId);
          
          const mpResponse = await fetch(
            `https://api.mercadopago.com/preapproval/${currentSubscription.mpSubscriptionId}`,
            {
              method: "PUT",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${accessToken}`,
              },
              body: JSON.stringify({
                reason: `${newPlan.nome} - AgenteZap`,
                auto_recurring: {
                  transaction_amount: parseFloat(newPlan.valor),
                },
              }),
            }
          );

          const mpResult = await mpResponse.json();
          console.log("[Plan Migration] MP update result:", mpResult.status || mpResult);
        } catch (mpError) {
          console.error("[Plan Migration] MP update error:", mpError);
          // Continue with local update even if MP fails
        }
      }

      // Update local subscription with new plan
      const dataFimAtual = new Date(currentSubscription.dataFim);
      
      // For upgrades, keep current end date
      // For downgrades, you could apply at end of current period
      await storage.updateSubscription(subscriptionId, {
        planId: newPlanId,
      });

      console.log("[Plan Migration] Subscription migrated:", {
        subscriptionId,
        oldPlan: currentPlan.nome,
        newPlan: newPlan.nome,
        isUpgrade,
      });

      res.json({
        status: "success",
        message: `${isUpgrade ? "Upgrade" : "Downgrade"} realizado com sucesso! Seu novo plano é ${newPlan.nome}.`,
        newPlan: {
          id: newPlan.id,
          nome: newPlan.nome,
          valor: newPlan.valor,
        },
      });
    } catch (error: any) {
      console.error("[Plan Migration] Error:", error);
      res.status(500).json({ 
        status: "error",
        message: error.message || "Erro ao migrar plano" 
      });
    }
  });

  // Admin: Force plan migration for any user
  app.post("/api/admin/subscriptions/:id/migrate-plan", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { newPlanId } = req.body;

      if (!newPlanId) {
        return res.status(400).json({ message: "ID do novo plano é obrigatório" });
      }

      // Get subscription
      const subscription = await storage.getSubscription(id) as any;
      if (!subscription) {
        return res.status(404).json({ message: "Assinatura não encontrada" });
      }

      // Get new plan
      const newPlan = await storage.getPlan(newPlanId);
      if (!newPlan) {
        return res.status(404).json({ message: "Novo plano não encontrado" });
      }

      // Update subscription
      await storage.updateSubscription(id, {
        planId: newPlanId,
      });

      res.json({ 
        success: true,
        message: `Plano alterado para ${newPlan.nome}`,
      });
    } catch (error) {
      console.error("Error migrating plan:", error);
      res.status(500).json({ message: "Falha ao migrar plano" });
    }
  });

  // ==================== PAYMENTS ROUTES ====================
  // Generate PIX QR Code
  app.post("/api/payments/generate-pix", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { subscriptionId } = req.body;

      if (!subscriptionId) {
        return res.status(400).json({ message: "Subscription ID is required" });
      }

      // Get subscription with plan
      const subscription = await storage.getUserSubscription(userId);
      if (!subscription || subscription.id !== subscriptionId) {
        return res.status(404).json({ message: "Subscription not found" });
      }

      // Determine the price - use coupon price if available, otherwise plan price
      const finalPrice = subscription.couponPrice 
        ? Number(subscription.couponPrice) 
        : Number(subscription.plan.valor);
      
      const planName = subscription.couponCode 
        ? `${subscription.plan.nome} (${subscription.couponCode})`
        : subscription.plan.nome;

      // Check if payment already exists
      const existingPayment = await storage.getPaymentBySubscriptionId(subscriptionId);

      // Generate PIX with the correct price
      const { pixCode, pixQrCode } = await generatePixQRCode({
        planNome: planName,
        valor: finalPrice,
        subscriptionId,
      });

      if (existingPayment && existingPayment.status === "pending") {
        const updated = await storage.updatePayment(existingPayment.id, {
          pixCode,
          pixQrCode,
          valor: finalPrice.toString(),
        });
        return res.json(updated);
      }

      // Create payment record
      const payment = await storage.createPayment({
        subscriptionId,
        valor: finalPrice.toString(),
        status: "pending",
        pixCode,
        pixQrCode,
      });

      res.json(payment);
    } catch (error) {
      console.error("Error generating PIX:", error);
      res.status(500).json({ message: "Failed to generate PIX" });
    }
  });

  // Debug: build PIX and return TLV breakdown (admin only)
  app.post("/api/admin/pix/debug", isAdmin, async (req, res) => {
    try {
      const { key, value, planNome } = req.body || {};
      const plan = planNome || 'Plano';
      const amount = Number(value ?? 1);
      const subscriptionId = 'debug' + Date.now().toString(36);
      const { pixCode, pixQrCode } = await generatePixQRCode({ planNome: plan, valor: amount, subscriptionId });

      // TLV parser
      const parseTLV = (s: string) => {
        const out: any[] = [];
        let i = 0;
        while (i + 4 <= s.length) {
          const id = s.slice(i, i + 2); i += 2;
          const len = parseInt(s.slice(i, i + 2), 10); i += 2;
          const val = s.slice(i, i + len); i += len;
          out.push({ id, len, value: val });
          if (id === '63') break;
        }
        return out;
      };

      res.json({ pixCode, pixQrCode, tlv: parseTLV(pixCode) });
    } catch (e) {
      console.error('PIX debug error:', e);
      res.status(500).json({ message: 'PIX debug failed' });
    }
  });

  // Get pending payments (admin only)
  app.get("/api/admin/payments/pending", isAdmin, async (_req, res) => {
    try {
      const payments = await withRetry(() => storage.getPendingPayments());
      res.json(payments);
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      res.status(500).json({ message: "Failed to fetch pending payments" });
    }
  });

  // Approve payment (admin only)
  app.post("/api/admin/payments/approve/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      // Get payment
      const payment = await storage.getPayment(id);
      if (!payment) {
        return res.status(404).json({ message: "Payment not found" });
      }

      if (payment.status !== "pending") {
        return res.status(400).json({ message: "Payment already processed" });
      }

      // Update payment status
      await storage.updatePayment(id, {
        status: "paid",
        dataPagamento: new Date(),
      });

      // Activate subscription
      const subscription = await storage.getUserSubscription(payment.subscriptionId);
      if (subscription) {
        const now = new Date();
        const dataFim = new Date(now);
        
        // Add subscription period based on plan
        if (subscription.plan.periodicidade === "mensal") {
          dataFim.setMonth(dataFim.getMonth() + 1);
        } else if (subscription.plan.periodicidade === "anual") {
          dataFim.setFullYear(dataFim.getFullYear() + 1);
        }

        await storage.updateSubscription(subscription.id, {
          status: "active",
          dataInicio: now,
          dataFim,
        });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error approving payment:", error);
      res.status(500).json({ message: "Failed to approve payment" });
    }
  });

  // ==================== ADMIN ROUTES ====================
  // NOTE: Get all users is defined earlier in the file (around line 156) with connection status
  // Do not duplicate the route here

  // Delete user (cascade delete all related data)
  app.delete("/api/admin/users/:id", isAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      
      // Verify user exists
      const user = await storage.getUser(id);
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      // Prevent deleting admins or owners
      if (user.role === "admin" || user.role === "owner") {
        return res.status(403).json({ message: "Cannot delete administrators" });
      }
      
      // Check if user has active subscription
      const activeSubscription = await storage.getUserSubscription(id);
      if (activeSubscription && activeSubscription.status === "active") {
        return res.status(403).json({ 
          message: "Cannot delete user with active subscription",
          plan: activeSubscription.plan?.nome 
        });
      }
      
      // Delete user and all related data
      await storage.deleteUser(id);
      
      console.log(`[ADMIN] User ${id} (${user.email}) deleted by admin`);
      
      res.json({ success: true, message: "User deleted successfully" });
    } catch (error) {
      console.error("Error deleting user:", error);
      res.status(500).json({ message: "Failed to delete user" });
    }
  });

  // Reset cliente completo por telefone (para testes)
  // Exclui: conversa admin, mensagens, user, conexão, subscription, config agente
  app.delete("/api/admin/reset-client/:phone", isAdmin, async (req, res) => {
    try {
      const { phone } = req.params;
      
      // Limpar número (remover caracteres não numéricos)
      const cleanPhone = phone.replace(/\D/g, "");
      
      if (!cleanPhone || cleanPhone.length < 10) {
        return res.status(400).json({ message: "Número de telefone inválido" });
      }

      console.log(`🗑️ [ADMIN] Iniciando reset completo do cliente: ${cleanPhone}`);

      // Limpar sessão em memória (do adminAgentService)
      const { clearClientSession } = await import("./adminAgentService");
      clearClientSession(cleanPhone);
      
      // Resetar todos os dados no banco
      const result = await storage.resetClientByPhone(cleanPhone);

      console.log(`✅ [ADMIN] Cliente ${cleanPhone} resetado completamente`, result);

      res.json({ 
        success: true, 
        message: `Cliente ${cleanPhone} resetado com sucesso`,
        details: result
      });
    } catch (error) {
      console.error("Erro ao resetar cliente:", error);
      res.status(500).json({ message: "Falha ao resetar cliente" });
    }
  });

  // Get admin stats
  app.get("/api/admin/stats", isAdmin, async (_req, res) => {
    try {
      // Usar withRetry para evitar falhas de conexão
      const [users, totalRevenue, activeSubscriptions] = await withRetry(() => 
        Promise.all([
          storage.getAllUsers(),
          storage.getTotalRevenue(),
          storage.getActiveSubscriptionsCount(),
        ])
      );

      res.json({
        totalUsers: users.length,
        totalRevenue,
        activeSubscriptions,
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ message: "Failed to fetch stats" });
    }
  });

  // Get system config
  app.get("/api/admin/config", isAdmin, async (_req, res) => {
    try {
      const [mistralKey, pixKey, zaiKey] = await withRetry(() => 
        Promise.all([
          storage.getSystemConfig("mistral_api_key"),
          storage.getSystemConfig("pix_key"),
          storage.getSystemConfig("zai_api_key"),
        ])
      );
      res.json({
        mistral_api_key: mistralKey?.valor || "",
        pix_key: pixKey?.valor || "",
        zai_api_key: zaiKey?.valor || "",
      });
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // Update system config
  app.put("/api/admin/config", isAdmin, async (req, res) => {
    try {
      const { mistral_api_key, pix_key, zai_api_key } = req.body;

      if (mistral_api_key !== undefined) {
        // Limpar espaços e caracteres invisíveis da chave antes de salvar
        const cleanKey = mistral_api_key.trim().replace(/[\r\n\t\s]/g, "");
        await storage.updateSystemConfig("mistral_api_key", cleanKey);
        console.log(`[Admin] Mistral key saved (${cleanKey.length} chars)`);
      }

      if (pix_key !== undefined) {
        await storage.updateSystemConfig("pix_key", pix_key.trim());
      }

      if (zai_api_key !== undefined) {
        // Limpar espaços e caracteres invisíveis da chave antes de salvar
        const cleanZaiKey = zai_api_key.trim().replace(/[\r\n\t\s]/g, "");
        await storage.updateSystemConfig("zai_api_key", cleanZaiKey);
        console.log(`[Admin] ZAI key saved (${cleanZaiKey.length} chars)`);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ message: "Failed to update config" });
    }
  });

  // ==================== MERCADO PAGO ROUTES ====================

  // Get Mercado Pago public key (public - for checkout)
  app.get("/api/mercadopago/public-key", async (_req, res) => {
    try {
      const configMap = await storage.getSystemConfigs([
        "mercadopago_public_key",
        "mercadopago_test_mode"
      ]);
      
      const publicKey = configMap.get("mercadopago_public_key") || "";
      const testMode = configMap.get("mercadopago_test_mode") === "true";
      
      if (!publicKey) {
        return res.status(404).json({ message: "Mercado Pago não configurado" });
      }
      
      res.json({ publicKey, testMode });
    } catch (error: any) {
      console.error("Error fetching MP public key:", error);
      res.status(500).json({ message: error.message });
    }
  });
  
  // Get Mercado Pago credentials info (admin only)
  app.get("/api/admin/mercadopago/credentials", isAdmin, async (_req, res) => {
    try {
      const { mercadoPagoService } = await import("./mercadoPagoService");
      const info = await mercadoPagoService.getCredentialsInfo();
      
      // Also get full credentials for admin to view
      const keys = [
        "mercadopago_public_key",
        "mercadopago_access_token", 
        "mercadopago_client_id",
        "mercadopago_client_secret",
        "mercadopago_test_mode"
      ];
      const configMap = await storage.getSystemConfigs(keys);
      
      res.json({
        configured: info.configured,
        isTestMode: info.isTestMode,
        publicKey: configMap.get("mercadopago_public_key") || "",
        accessToken: configMap.get("mercadopago_access_token") || "",
        clientId: configMap.get("mercadopago_client_id") || "",
        clientSecret: configMap.get("mercadopago_client_secret") || "",
      });
    } catch (error) {
      console.error("Error fetching MercadoPago credentials:", error);
      res.status(500).json({ message: "Failed to fetch credentials" });
    }
  });

  // Save Mercado Pago credentials (admin only)
  app.put("/api/admin/mercadopago/credentials", isAdmin, async (req, res) => {
    try {
      const { publicKey, accessToken, clientId, clientSecret, isTestMode } = req.body;
      const { mercadoPagoService } = await import("./mercadoPagoService");
      
      await mercadoPagoService.saveCredentials({
        publicKey,
        accessToken,
        clientId,
        clientSecret,
        isTestMode,
      });
      
      res.json({ success: true, message: "Credenciais salvas com sucesso" });
    } catch (error) {
      console.error("Error saving MercadoPago credentials:", error);
      res.status(500).json({ message: "Failed to save credentials" });
    }
  });

  // Test Mercado Pago connection (admin only)
  app.post("/api/admin/mercadopago/test", isAdmin, async (_req, res) => {
    try {
      const { mercadoPagoService } = await import("./mercadoPagoService");
      const result = await mercadoPagoService.testConnection();
      res.json(result);
    } catch (error: any) {
      console.error("Error testing MercadoPago:", error);
      res.json({ success: false, message: error.message });
    }
  });

  // List Mercado Pago plans (admin only)
  app.get("/api/admin/mercadopago/plans", isAdmin, async (_req, res) => {
    try {
      const { mercadoPagoService } = await import("./mercadoPagoService");
      const result = await mercadoPagoService.listPlans();
      res.json(result.results || []);
    } catch (error: any) {
      console.error("Error listing MP plans:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create Mercado Pago plan (admin only)
  app.post("/api/admin/mercadopago/plans", isAdmin, async (req, res) => {
    try {
      const { reason, transactionAmount, frequency, frequencyType, backUrl, trialDays } = req.body;
      const { mercadoPagoService } = await import("./mercadoPagoService");
      
      const plan = await mercadoPagoService.createPlan({
        reason,
        autoRecurring: {
          frequency: frequency || 1,
          frequencyType: frequencyType || "months",
          transactionAmount: parseFloat(transactionAmount),
          currencyId: "BRL",
          freeTrial: trialDays ? {
            frequency: trialDays,
            frequencyType: "days"
          } : undefined,
        },
        backUrl: backUrl || `${req.protocol}://${req.get('host')}/subscribe/success`,
      });
      
      res.json(plan);
    } catch (error: any) {
      console.error("Error creating MP plan:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Create subscription for user (creates checkout link)
  app.post("/api/subscriptions/create-mp", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { planId, couponCode } = req.body;
      
      const user = await storage.getUser(userId);
      if (!user) {
        return res.status(404).json({ message: "Usuário não encontrado" });
      }
      
      const plan = await storage.getPlan(planId);
      if (!plan) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }
      
      // Calculate final price (with coupon if applicable)
      let finalPrice = parseFloat(plan.valor as string);
      let appliedCoupon = null;
      
      if (couponCode) {
        const coupon = await storage.getCouponByCode(couponCode);
        if (coupon && coupon.isActive) {
          if (coupon.finalPrice) {
            finalPrice = parseFloat(coupon.finalPrice as string);
            appliedCoupon = coupon;
          }
        }
      }
      
      // Create local subscription first
      const localSubscription = await storage.createSubscription({
        userId,
        planId,
        status: "pending",
        couponCode: appliedCoupon?.code,
        couponPrice: appliedCoupon?.finalPrice,
      });
      
      // Create Mercado Pago subscription
      const { mercadoPagoService } = await import("./mercadoPagoService");
      
      const mpSubscription = await mercadoPagoService.createSubscription({
        reason: `${plan.nome} - AgenteZap`,
        externalReference: `sub_${localSubscription.id}`,
        payerEmail: user.email || `user_${userId}@agentezap.com`,
        autoRecurring: {
          frequency: 1,
          frequencyType: "months",
          transactionAmount: finalPrice,
          currencyId: "BRL",
        },
        backUrl: `${req.protocol}://${req.get('host')}/subscribe/success?subscriptionId=${localSubscription.id}`,
        status: "pending",
      });
      
      // Update local subscription with MP data
      await storage.updateSubscription(localSubscription.id, {
        // mpSubscriptionId: mpSubscription.id,
        // mpInitPoint: mpSubscription.init_point,
      });
      
      res.json({
        subscriptionId: localSubscription.id,
        checkoutUrl: mpSubscription.init_point,
        mpSubscriptionId: mpSubscription.id,
      });
    } catch (error: any) {
      console.error("Error creating MP subscription:", error);
      res.status(500).json({ message: error.message });
    }
  });

  // Process payment with card token (transparent checkout)
  app.post("/api/subscriptions/process-mp-payment", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { subscriptionId, token, payerEmail, paymentMethodId, issuerId } = req.body;
      
      if (!subscriptionId || !token || !payerEmail) {
        return res.status(400).json({ message: "Dados de pagamento incompletos" });
      }
      
      // Get subscription
      const subscription = await storage.getSubscription(subscriptionId) as any;
      if (!subscription || subscription.userId !== userId) {
        return res.status(404).json({ message: "Assinatura não encontrada" });
      }
      
      // Get plan
      const plan = await storage.getPlan(subscription.planId) as any;
      if (!plan) {
        return res.status(404).json({ message: "Plano não encontrado" });
      }
      
      // Calculate amount
      const valorPrimeiraCobranca = plan.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
      const valorMensal = subscription.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(plan.valor);
      const amount = valorPrimeiraCobranca > 0 ? valorPrimeiraCobranca : valorMensal;
      
      // Get MP credentials
      const configMap = await storage.getSystemConfigs([
        "mercadopago_access_token",
        "mercadopago_test_mode"
      ]);
      const accessToken = configMap.get("mercadopago_access_token");
      
      if (!accessToken) {
        return res.status(500).json({ message: "Mercado Pago não configurado" });
      }
      
      // Create payment with MP API
      const paymentData: any = {
        transaction_amount: amount,
        token: token,
        description: `${plan.nome} - AgenteZap`,
        installments: 1,
        payment_method_id: paymentMethodId || 'visa',
        payer: {
          email: payerEmail,
        },
        external_reference: `sub_${subscriptionId}`,
        statement_descriptor: "AGENTEZAP",
        metadata: {
          subscription_id: subscriptionId,
          plan_id: plan.id,
          user_id: userId,
        },
      };
      
      if (issuerId) {
        paymentData.issuer_id = parseInt(issuerId);
      }
      
      console.log("[MP Payment] Creating payment:", {
        amount,
        subscriptionId,
        planName: plan.nome,
        paymentMethodId,
      });
      
      const response = await fetch("https://api.mercadopago.com/v1/payments", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
          "X-Idempotency-Key": `payment_${subscriptionId}_${Date.now()}`,
        },
        body: JSON.stringify(paymentData),
      });
      
      const result = await response.json();
      
      console.log("[MP Payment] Full Result:", JSON.stringify(result, null, 2));
      console.log("[MP Payment] Summary:", {
        status: result.status,
        statusDetail: result.status_detail,
        id: result.id,
        message: result.message,
        cause: result.cause,
      });
      
      if (result.status === "approved") {
        // Update subscription to active
        const dataFim = new Date();
        dataFim.setMonth(dataFim.getMonth() + 1);
        
        await storage.updateSubscription(subscriptionId, {
          status: "active",
          dataInicio: new Date(),
          dataFim,
          mpSubscriptionId: result.id?.toString(),
          mpStatus: result.status,
          payerEmail,
          paymentMethod: paymentMethodId,
        });
        
        console.log("[MP Payment] Subscription activated:", subscriptionId);
        
        return res.json({
          status: "approved",
          message: "Pagamento aprovado! Sua assinatura está ativa.",
          paymentId: result.id,
        });
      } else if (result.status === "pending" || result.status === "in_process") {
        await storage.updateSubscription(subscriptionId, {
          mpSubscriptionId: result.id?.toString(),
          mpStatus: result.status,
          payerEmail,
          paymentMethod: paymentMethodId,
        });
        
        return res.json({
          status: "pending",
          message: "Pagamento em processamento. Aguarde a confirmação.",
          paymentId: result.id,
        });
      } else {
        // Payment rejected
        const errorMessages: Record<string, string> = {
          "cc_rejected_bad_filled_card_number": "Número do cartão inválido",
          "cc_rejected_bad_filled_date": "Data de validade inválida",
          "cc_rejected_bad_filled_other": "Dados do cartão incorretos",
          "cc_rejected_bad_filled_security_code": "Código de segurança inválido",
          "cc_rejected_blacklist": "Cartão não permitido",
          "cc_rejected_call_for_authorize": "Ligue para sua operadora para autorizar",
          "cc_rejected_card_disabled": "Cartão desativado",
          "cc_rejected_duplicated_payment": "Pagamento duplicado",
          "cc_rejected_high_risk": "Pagamento recusado por segurança",
          "cc_rejected_insufficient_amount": "Saldo insuficiente",
          "cc_rejected_invalid_installments": "Parcelas inválidas",
          "cc_rejected_max_attempts": "Limite de tentativas excedido",
          "cc_rejected_other_reason": "Pagamento não aprovado",
        };
        
        const message = errorMessages[result.status_detail] || result.message || "Pagamento não aprovado";
        
        return res.json({
          status: result.status || "rejected",
          message,
          statusDetail: result.status_detail,
        });
      }
    } catch (error: any) {
      console.error("[MP Payment] Error:", error);
      res.status(500).json({ 
        status: "error",
        message: error.message || "Erro ao processar pagamento" 
      });
    }
  });

  // ==========================================
  // CRIAR ASSINATURA RECORRENTE VIA MERCADO PAGO (preapproval API)
  // Suporta tanto checkout transparente quanto link de pagamento
  // ==========================================
  app.post("/api/subscriptions/create-mp-subscription", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { subscriptionId, token, payerEmail, paymentMethodId, issuerId, cardholderName, identificationNumber } = req.body;
      
      if (!subscriptionId || !payerEmail) {
        return res.status(400).json({ 
          status: "error",
          message: "Dados de pagamento incompletos" 
        });
      }
      
      // Get subscription
      const subscription = await storage.getSubscription(subscriptionId) as any;
      if (!subscription || subscription.userId !== userId) {
        return res.status(404).json({ 
          status: "error",
          message: "Assinatura não encontrada" 
        });
      }
      
      // Get plan
      const plan = await storage.getPlan(subscription.planId) as any;
      if (!plan) {
        return res.status(404).json({ 
          status: "error",
          message: "Plano não encontrado" 
        });
      }
      
      // Calculate amounts
      const valorPrimeiraCobranca = plan.valorPrimeiraCobranca ? parseFloat(plan.valorPrimeiraCobranca) : 0;
      const valorMensal = subscription.couponPrice ? parseFloat(subscription.couponPrice) : parseFloat(plan.valor);
      const frequenciaDias = plan.frequenciaDias || 30;
      const hasSetupFee = valorPrimeiraCobranca > 0 && valorPrimeiraCobranca !== valorMensal;
      
      // Get MP credentials
      const configMap = await storage.getSystemConfigs([
        "mercadopago_access_token",
        "mercadopago_test_mode"
      ]);
      const accessToken = configMap.get("mercadopago_access_token");
      const isTestMode = configMap.get("mercadopago_test_mode") === "true";
      
      if (!accessToken) {
        return res.status(500).json({ 
          status: "error",
          message: "Mercado Pago não configurado" 
        });
      }
      
      // Calculate frequency_type based on frequenciaDias
      let frequency = 1;
      let frequency_type = "months";
      if (frequenciaDias === 365 || frequenciaDias === 360) {
        frequency_type = "years";
        frequency = 1;
      } else if (frequenciaDias === 7) {
        frequency_type = "days";
        frequency = 7;
      } else if (frequenciaDias > 0) {
        frequency_type = "months";
        frequency = Math.round(frequenciaDias / 30);
      }
      
      // Get base URL for callbacks
      const baseUrl = process.env.BASE_URL || 
                     (isTestMode ? "http://localhost:5000" : "https://agentezap.com");
      
      console.log("[MP Subscription] Creating recurring subscription:", {
        subscriptionId,
        planName: plan.nome,
        valorMensal,
        valorPrimeiraCobranca,
        hasSetupFee,
        frequency,
        frequency_type,
        hasToken: !!token,
      });
      
      // ═══════════════════════════════════════════════════════════════════
      // ASSINATURA RECORRENTE REAL VIA API /preapproval
      // O Mercado Pago gerencia as cobranças automáticas mensais
      // ═══════════════════════════════════════════════════════════════════
      
      // Calculate start and end dates
      const startDate = new Date();
      const endDate = new Date();
      endDate.setFullYear(endDate.getFullYear() + 5); // 5 years subscription max
      
      // If there's a setup fee, we need to process it first as a single payment
      // then start the recurring subscription
      if (hasSetupFee && valorPrimeiraCobranca > 0 && token) {
        console.log("[MP Subscription] Processing setup fee payment:", valorPrimeiraCobranca);
        
        const setupPaymentData: any = {
          transaction_amount: valorPrimeiraCobranca,
          token: token,
          description: `Taxa de implementação - ${plan.nome} - AgenteZap`,
          installments: 1,
          payment_method_id: paymentMethodId || 'visa',
          payer: {
            email: payerEmail,
            identification: {
              type: "CPF",
              number: identificationNumber,
            },
          },
          external_reference: `setup_${subscriptionId}`,
          statement_descriptor: "AGENTEZAP",
        };
        
        if (issuerId) {
          setupPaymentData.issuer_id = parseInt(issuerId);
        }
        
        const setupResponse = await fetch("https://api.mercadopago.com/v1/payments", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "X-Idempotency-Key": `setup_${subscriptionId}_${Date.now()}`,
          },
          body: JSON.stringify(setupPaymentData),
        });
        
        const setupResult = await setupResponse.json();
        
        console.log("[MP Subscription] Setup fee result:", {
          status: setupResult.status,
          statusDetail: setupResult.status_detail,
          id: setupResult.id,
        });
        
        if (setupResult.status !== "approved") {
          const errorMessages: Record<string, string> = {
            "cc_rejected_bad_filled_card_number": "Número do cartão inválido",
            "cc_rejected_bad_filled_date": "Data de validade inválida",
            "cc_rejected_bad_filled_other": "Dados do cartão incorretos",
            "cc_rejected_bad_filled_security_code": "Código de segurança inválido",
            "cc_rejected_blacklist": "Este cartão não pode ser utilizado",
            "cc_rejected_call_for_authorize": "Autorize o pagamento com sua operadora",
            "cc_rejected_card_disabled": "Cartão desativado",
            "cc_rejected_duplicated_payment": "Pagamento duplicado",
            "cc_rejected_high_risk": "Pagamento recusado por segurança",
            "cc_rejected_insufficient_amount": "Saldo insuficiente",
            "cc_rejected_invalid_installments": "Parcelas inválidas",
            "cc_rejected_max_attempts": "Limite de tentativas excedido",
            "cc_rejected_other_reason": "Pagamento não aprovado",
            "rejected": "Pagamento recusado",
          };
          
          const message = errorMessages[setupResult.status_detail] || 
                         errorMessages[setupResult.status] || 
                         setupResult.message || 
                         "Pagamento da taxa inicial não aprovado";
          
          return res.json({
            status: setupResult.status || "rejected",
            message,
            statusDetail: setupResult.status_detail,
          });
        }
        
        // Setup fee paid, adjust start date for recurring
        startDate.setDate(startDate.getDate() + frequenciaDias);
      }
      
      // ═══════════════════════════════════════════════════════════════════
      // CRIAR ASSINATURA RECORRENTE NO MERCADO PAGO - CHECKOUT TRANSPARENTE
      // Usa a API /preapproval com card_token_id para pagamento autorizado
      // Documentação: https://www.mercadopago.com.br/developers/pt/docs/subscriptions/integration-configuration/subscription-no-associated-plan/authorized-payments
      // ═══════════════════════════════════════════════════════════════════
      
      const subscriptionData: any = {
        reason: `${plan.nome} - AgenteZap`,
        external_reference: `sub_${subscriptionId}`,
        payer_email: payerEmail,
        auto_recurring: {
          frequency: frequency,
          frequency_type: frequency_type,
          transaction_amount: valorMensal,
          currency_id: "BRL",
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
        },
        back_url: `${baseUrl}/dashboard`,
      };
      
      // Se temos card_token, usar checkout transparente (status: authorized)
      // Sem card_token, criar assinatura pendente (init_point)
      if (token) {
        subscriptionData.card_token_id = token;
        subscriptionData.status = "authorized"; // Checkout transparente - pagamento direto
        console.log("[MP Subscription] Using transparent checkout with card_token");
      } else {
        subscriptionData.status = "pending"; // Usuário completa via init_point
        console.log("[MP Subscription] No token - will use init_point");
      }
      
      console.log("[MP Subscription] Creating preapproval:", JSON.stringify(subscriptionData, null, 2));
      
      // Headers para API do Mercado Pago
      // Nota: Removido X-scope pois não é mais necessário para assinaturas sem plano associado
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${accessToken}`,
        "X-Idempotency-Key": `preapproval_${subscriptionId}_${Date.now()}`,
      };
      
      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {
        method: "POST",
        headers,
        body: JSON.stringify(subscriptionData),
      });
      
      const mpResult = await mpResponse.json();
      
      console.log("[MP Subscription] Preapproval result:", JSON.stringify(mpResult, null, 2));
      
      // Handle preapproval response
      if (mpResult.id) {
        // Subscription created successfully - status will be "pending" until user pays via init_point
        
        // Calculate dates
        const dataFim = new Date();
        if (frequency_type === "months") {
          dataFim.setMonth(dataFim.getMonth() + frequency);
        } else if (frequency_type === "years") {
          dataFim.setFullYear(dataFim.getFullYear() + frequency);
        } else {
          dataFim.setDate(dataFim.getDate() + frequenciaDias);
        }
        
        const nextPaymentDate = new Date(mpResult.next_payment_date || startDate);
        const isAuthorized = mpResult.status === "authorized";
        
        // Update local subscription
        await storage.updateSubscription(subscriptionId, {
          status: isAuthorized ? "active" : "pending",
          dataInicio: new Date(),
          dataFim,
          mpSubscriptionId: mpResult.id,
          mpStatus: mpResult.status,
          payerEmail,
          paymentMethod: paymentMethodId,
          nextPaymentDate,
        });
        
        console.log("[MP Subscription] Subscription created:", {
          id: mpResult.id,
          status: mpResult.status,
          isAuthorized,
          initPoint: mpResult.init_point,
        });
        
        // Checkout transparente - assinatura autorizada diretamente
        if (isAuthorized) {
          return res.json({
            status: "approved",
            message: "🎉 Assinatura recorrente ativada com sucesso! Cobranças automáticas configuradas.",
            subscriptionId: mpResult.id,
            mpStatus: mpResult.status,
          });
        }
        
        // Fallback: redirect to init_point if needed
        return res.json({
          status: "pending",
          message: "Assinatura criada. Complete o pagamento para ativar.",
          subscriptionId: mpResult.id,
          initPoint: mpResult.init_point,
          mpStatus: mpResult.status,
        });
      } else {
        // Error creating subscription
        const errorMsg = mpResult.message || "";
        
        // Se falhou com "Card token service not found" e tínhamos token,
        // tentar novamente SEM o token (fallback para init_point)
        // NOTA: Este erro pode ocorrer por várias razões, não apenas HTTPS
        if (token && errorMsg.toLowerCase().includes("card token service not found")) {
          console.log("[MP Subscription] Fallback: retrying without card_token (init_point mode)");
          console.log("[MP Subscription] NOTA: Este erro pode indicar problemas com o token ou configuração da conta MP");
          
          // Remover token e mudar status para pending
          delete subscriptionData.card_token_id;
          subscriptionData.status = "pending";
          
          const fallbackResponse = await fetch("https://api.mercadopago.com/preapproval", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${accessToken}`,
              "X-Idempotency-Key": `preapproval_${subscriptionId}_fallback_${Date.now()}`,
            },
            body: JSON.stringify(subscriptionData),
          });
          
          const fallbackResult = await fallbackResponse.json();
          console.log("[MP Subscription] Fallback result:", JSON.stringify(fallbackResult, null, 2));
          
          if (fallbackResult.id && fallbackResult.init_point) {
            // Fallback succeeded - update subscription and redirect to init_point
            const dataFim = new Date();
            dataFim.setMonth(dataFim.getMonth() + frequency);
            
            await storage.updateSubscription(subscriptionId, {
              status: "pending",
              dataInicio: new Date(),
              dataFim,
              mpSubscriptionId: fallbackResult.id,
              mpStatus: fallbackResult.status,
              payerEmail,
              paymentMethod: paymentMethodId,
            });
            
            // Mensagem mais informativa - não dizer que é problema de HTTPS
            return res.json({
              status: "pending",
              message: "⚠️ Não foi possível processar o cartão automaticamente. Use o link para completar o pagamento.",
              subscriptionId: fallbackResult.id,
              initPoint: fallbackResult.init_point,
              mpStatus: fallbackResult.status,
              isLocalhost: false, // Não é mais relacionado a localhost
            });
          }
        }
        
        // Translate error messages
        const errorMessages: Record<string, string> = {
          "invalid_card_token": "Token do cartão inválido ou expirado. Tente novamente.",
          "invalid_payer_email": "E-mail do pagador inválido.",
          "invalid_transaction_amount": "Valor da transação inválido.",
          "invalid_users": "Credenciais de teste requerem contas de teste do Mercado Pago.",
          "2034": "Em modo teste, use contas de teste do Mercado Pago.",
          "Invalid users involved": "Use contas de teste do Mercado Pago no modo sandbox.",
          "Card token service not found": "⚠️ Não foi possível processar o cartão. Use o link de pagamento.",
          "card_token_creation_failed": "Erro ao processar cartão. Tente novamente.",
        };
        
        const errorCode = mpResult.cause?.[0]?.code || mpResult.error || mpResult.message;
        // Check if message contains known error patterns
        let errorMessage = errorMessages[errorCode];
        if (!errorMessage && mpResult.message) {
          for (const [key, msg] of Object.entries(errorMessages)) {
            if (mpResult.message.toLowerCase().includes(key.toLowerCase())) {
              errorMessage = msg;
              break;
            }
          }
        }
        errorMessage = errorMessage || mpResult.message || "Erro ao criar assinatura recorrente";
        
        console.log("[MP Subscription] Error:", errorCode, mpResult);
        
        return res.json({
          status: "error",
          message: errorMessage,
          errorCode,
        });
      }
    } catch (error: any) {
      console.error("[MP Subscription] Error:", error);
      res.status(500).json({ 
        status: "error",
        message: error.message || "Erro ao criar assinatura" 
      });
    }
  });

  // Webhook do Mercado Pago (public - não requer auth)
  app.post("/api/webhooks/mercadopago", async (req, res) => {
    try {
      const { type, data, action } = req.body;
      console.log("[MP Webhook] Received:", { type, action, data });
      
      const { mercadoPagoService } = await import("./mercadoPagoService");
      
      // Process based on type
      if (type === "subscription_preapproval") {
        await mercadoPagoService.processWebhook("subscription_preapproval", data);
      } else if (type === "subscription_authorized_payment") {
        await mercadoPagoService.processWebhook("subscription_authorized_payment", data);
      } else if (type === "payment") {
        // Handle payment notifications
        console.log("[MP Webhook] Payment notification:", data);
      }
      
      res.status(200).send("OK");
    } catch (error) {
      console.error("Error processing MP webhook:", error);
      res.status(500).send("Error");
    }
  });

  // ==================== END MERCADO PAGO ROUTES ====================

  // Test Mistral API key
  app.post("/api/admin/test-mistral", isAdmin, async (_req, res) => {
    try {
      const { Mistral } = await import("@mistralai/mistralai");
      const { resolveApiKey } = await import("./mistralClient");
      
      console.log("[Test Mistral] Starting test...");
      
      const apiKey = await resolveApiKey();
      
      // Log informações sobre a chave (sem expor a chave completa)
      const keyPreview = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "null";
      console.log(`[Test Mistral] Key resolved: ${keyPreview} (${apiKey?.length ?? 0} chars)`);
      
      if (!apiKey || apiKey === "mock-key") {
        console.log("[Test Mistral] No valid key found");
        return res.json({ 
          success: false, 
          error: "Chave Mistral não configurada",
          keyLength: 0
        });
      }
      
      console.log("[Test Mistral] Creating Mistral client and testing...");
      const mistral = new Mistral({ apiKey });
      
      // Fazer uma chamada simples para testar a chave
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: "Say OK" }],
        maxTokens: 5,
      });
      
      console.log("[Test Mistral] Response received:", response.choices?.[0]?.message?.content);
      
      if (response.choices && response.choices.length > 0) {
        res.json({ 
          success: true, 
          model: "mistral-small-latest",
          message: "Chave válida e funcionando!",
          keyLength: apiKey.length,
          keyPreview
        });
      } else {
        res.json({ 
          success: false, 
          error: "Resposta inválida da API",
          keyLength: apiKey.length
        });
      }
    } catch (error: any) {
      console.error("[Test Mistral] Error:", error.message);
      
      // Extrair mensagem de erro útil
      let errorMessage = "Erro desconhecido";
      let suggestion = "";
      
      if (error.message?.includes("401")) {
        errorMessage = "Chave inválida ou expirada (401 Unauthorized)";
        suggestion = "Verifique se a chave está correta e não expirou. Gere uma nova em console.mistral.ai";
      } else if (error.message?.includes("403")) {
        errorMessage = "Acesso negado (403 Forbidden)";
        suggestion = "Verifique se a chave tem permissões corretas";
      } else if (error.message?.includes("429")) {
        errorMessage = "Limite de requisições excedido (429 Too Many Requests)";
        suggestion = "Aguarde alguns minutos antes de tentar novamente";
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      res.json({ 
        success: false, 
        error: errorMessage,
        suggestion
      });
    }
  });

  // ==================== ADMIN WHATSAPP ROUTES ====================
  // Get admin WhatsApp connection status - verifica estado REAL da sessão
  app.get("/api/admin/whatsapp/connection", isAdmin, async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const connection = await storage.getAdminWhatsappConnection(adminId);
      
      // 🛡️ MODO DESENVOLVIMENTO: Não sincronizar estado para não afetar produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Retornando estado do banco sem sincronizar (proteção de produção)`);
        return res.json({
          ...(connection || {}),
          isConnected: connection?.isConnected || false,
          phoneNumber: connection?.phoneNumber,
          _devMode: true,
          _message: 'Modo desenvolvimento - estado do banco preservado',
        });
      }
      
      // Verificar estado REAL da sessão na memória
      const { getAdminSession } = await import("./whatsapp");
      const activeSession = getAdminSession(adminId);
      const isReallyConnected = !!(activeSession?.socket?.user);
      
      // Se há discrepância entre banco e sessão real, sincronizar
      if (connection && connection.isConnected !== isReallyConnected) {
        console.log(`🔄 [ADMIN WS] Sincronizando estado: banco=${connection.isConnected}, real=${isReallyConnected}`);
        await storage.updateAdminWhatsappConnection(adminId, {
          isConnected: isReallyConnected,
          phoneNumber: isReallyConnected ? activeSession?.socket?.user?.id.split(':')[0] : connection.phoneNumber,
        });
      }
      
      // Retornar estado real
      const phoneNumber = isReallyConnected 
        ? activeSession?.socket?.user?.id.split(':')[0] 
        : connection?.phoneNumber;
      
      res.json({
        ...(connection || {}),
        isConnected: isReallyConnected,
        phoneNumber: phoneNumber || connection?.phoneNumber,
      });
    } catch (error) {
      console.error("Error fetching admin WhatsApp connection:", error);
      res.status(500).json({ message: "Failed to fetch connection" });
    }
  });

  // Connect admin WhatsApp
  app.post("/api/admin/whatsapp/connect", isAdmin, async (req, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear conexões para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando conexão admin WhatsApp (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const adminId = (req.session as any)?.adminId;
      const { connectAdminWhatsApp } = await import("./whatsapp");
      await connectAdminWhatsApp(adminId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error connecting admin WhatsApp:", error);
      res.status(500).json({ message: "Failed to connect WhatsApp" });
    }
  });

  // Disconnect admin WhatsApp
  app.post("/api/admin/whatsapp/disconnect", isAdmin, async (req, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear desconexões para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando desconexão admin WhatsApp (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const adminId = (req.session as any)?.adminId;
      const { disconnectAdminWhatsApp } = await import("./whatsapp");
      await disconnectAdminWhatsApp(adminId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting admin WhatsApp:", error);
      res.status(500).json({ message: "Failed to disconnect WhatsApp" });
    }
  });

  // ========================================================================
  // ADMIN CONVERSATIONS - Visualizar e gerenciar conversas do WhatsApp admin
  // ========================================================================

  // GET - Listar todas as conversas do admin
  app.get("/api/admin/conversations", isAdmin, async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const conversations = await storage.getAdminConversations(adminId);
      res.json(conversations);
    } catch (error) {
      console.error("Error fetching admin conversations:", error);
      res.status(500).json({ message: "Failed to fetch conversations" });
    }
  });

  // GET - Obter mensagens de uma conversa específica
  app.get("/api/admin/conversations/:id/messages", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const messages = await storage.getAdminMessages(id);
      res.json(messages);
    } catch (error) {
      console.error("Error fetching admin messages:", error);
      res.status(500).json({ message: "Failed to fetch messages" });
    }
  });

  // GET - Obter detalhes de uma conversa
  app.get("/api/admin/conversations/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getAdminConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      res.json(conversation);
    } catch (error) {
      console.error("Error fetching admin conversation:", error);
      res.status(500).json({ message: "Failed to fetch conversation" });
    }
  });

  // PATCH - Atualizar conversa (pausar/continuar IA)
  app.patch("/api/admin/conversations/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { isAgentEnabled, contactName } = req.body;
      
      const updates: any = {};
      if (typeof isAgentEnabled === 'boolean') {
        updates.isAgentEnabled = isAgentEnabled;
      }
      if (contactName !== undefined) {
        updates.contactName = contactName;
      }
      
      const conversation = await storage.updateAdminConversation(id, updates);
      res.json(conversation);
    } catch (error) {
      console.error("Error updating admin conversation:", error);
      res.status(500).json({ message: "Failed to update conversation" });
    }
  });

  // POST - Pausar IA para uma conversa específica
  app.post("/api/admin/conversations/:id/pause-agent", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.toggleAdminConversationAgent(id, false);
      res.json({ success: true, conversation });
    } catch (error) {
      console.error("Error pausing admin agent:", error);
      res.status(500).json({ message: "Failed to pause agent" });
    }
  });

  // POST - Continuar IA para uma conversa específica
  app.post("/api/admin/conversations/:id/resume-agent", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.toggleAdminConversationAgent(id, true);
      
      // 🔄 Quando IA admin é reativada, verificar se há mensagens pendentes e responder
      try {
        const triggerResult = await triggerAdminAgentResponseForConversation(id);
        console.log(`🔄 [ADMIN RESUME] IA reativada para ${id}: ${triggerResult.reason}`);
      } catch (triggerError) {
        console.error("Erro ao disparar resposta após reativar IA admin:", triggerError);
      }
      
      res.json({ success: true, conversation });
    } catch (error) {
      console.error("Error resuming admin agent:", error);
      res.status(500).json({ message: "Failed to resume agent" });
    }
  });

  // DELETE - Limpar histórico de mensagens de uma conversa (mantém a conversa, apaga mensagens)
  app.delete("/api/admin/conversations/:id/history", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getAdminConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }
      
      // Limpar mensagens do banco
      await storage.clearAdminConversationMessages(id);
      
      // Limpar sessão em memória do cliente (baseado no telefone)
      const phone = conversation.contactNumber || conversation.remoteJid?.split('@')[0]?.split(':')[0];
      if (phone) {
        const { clearClientSession } = await import("./adminAgentService");
        clearClientSession(phone);
        console.log(`🗑️ [ADMIN] Histórico limpo para conversa ${id} (telefone: ${phone})`);

        // Se existir conta de TESTE para esse telefone, fazer reset completo (inclui Auth)
        // Isso evita o bug do email_exists e garante que "limpar histórico" realmente limpa tudo.
        const user = await storage.getUserByPhone(phone);
        if (user) {
          const result = await storage.resetTestAccountSafely(phone);
          if (!result.success) {
            return res.status(400).json({
              success: false,
              message: "Histórico limpo, mas não foi possível deletar a conta (validação de segurança)",
              error: result.error,
            });
          }

          // Se deletou o usuário no banco, também deletar no Supabase Auth (senão o email fica preso)
          if (result.result?.userDeleted) {
            try {
              const { supabase } = await import("./supabaseAuth");
              const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
              if (authDeleteError) {
                console.error("[ADMIN] Falha ao deletar usuário no Supabase Auth:", authDeleteError);
                return res.status(500).json({
                  success: false,
                  message: "Histórico limpo, mas falha ao deletar usuário no Auth",
                  error: authDeleteError.message,
                });
              }
              console.log(`🗑️ [ADMIN] Usuário ${user.id} deletado do Supabase Auth (history)`);
            } catch (e: any) {
              console.error("[ADMIN] Erro ao deletar usuário no Auth:", e);
              return res.status(500).json({
                success: false,
                message: "Histórico limpo, mas erro ao deletar usuário no Auth",
                error: e?.message || String(e),
              });
            }
          }
        }
      }
      
      res.json({ success: true, message: "Histórico limpo com sucesso" });
    } catch (error) {
      console.error("Error clearing conversation history:", error);
      res.status(500).json({ message: "Falha ao limpar histórico" });
    }
  });

  // DELETE - Reset COMPLETO de conta de teste (histórico + usuário + tudo)
  app.delete("/api/admin/conversations/:id/complete", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const conversation = await storage.getAdminConversation(id);
      
      if (!conversation) {
        return res.status(404).json({ message: "Conversa não encontrada" });
      }
      
      // Extrair telefone da conversa
      const phone = conversation.contactNumber || conversation.remoteJid?.split('@')[0]?.split(':')[0];
      if (!phone) {
        return res.status(400).json({ message: "Número de telefone não encontrado na conversa" });
      }

      // Capturar userId antes do reset (depois ele some do DB)
      const user = await storage.getUserByPhone(phone);
      
      console.log(`🚨 [ADMIN] Solicitação de RESET COMPLETO para ${phone}`);
      
      // Limpar sessão em memória primeiro
      const { clearClientSession } = await import("./adminAgentService");
      clearClientSession(phone);
      
      // Cancelar follow-ups
      const { cancelFollowUp } = await import("./followUpService");
      cancelFollowUp(phone);
      
      // Executar reset seguro com validações
      const result = await storage.resetTestAccountSafely(phone);
      
      if (!result.success) {
        return res.status(400).json({ 
          message: result.error || "Não foi possível resetar a conta",
          error: result.error 
        });
      }

      // Se deletou o usuário no banco, deletar também no Supabase Auth
      // (senão o email fica preso e gera email_exists no próximo teste)
      let authDeleted = false;
      if (user?.id && result.result?.userDeleted) {
        const { supabase } = await import("./supabaseAuth");
        const { error: authDeleteError } = await supabase.auth.admin.deleteUser(user.id);
        if (authDeleteError) {
          console.error("[ADMIN] Falha ao deletar usuário no Supabase Auth:", authDeleteError);
          return res.status(500).json({
            success: false,
            message: "Reset no banco OK, mas falha ao deletar usuário no Auth",
            error: authDeleteError.message,
          });
        }
        authDeleted = true;
        console.log(`🗑️ [ADMIN] Usuário ${user.id} deletado do Supabase Auth (complete)`);
      }
      
      res.json({ 
        success: true, 
        message: "Reset completo realizado com sucesso",
        details: { ...result.result, authDeleted }
      });
    } catch (error: any) {
      console.error("Error resetting account completely:", error);
      res.status(500).json({ 
        message: "Falha ao resetar conta",
        error: error.message 
      });
    }
  });

  // POST - Enviar mensagem manual (como admin, não como IA)
  app.post("/api/admin/conversations/:id/send", isAdmin, async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { text } = req.body;
      
      if (!text) {
        return res.status(400).json({ message: "Text is required" });
      }
      
      const { sendAdminConversationMessage } = await import("./whatsapp");
      await sendAdminConversationMessage(adminId, id, text);
      
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending admin message:", error);
      res.status(500).json({ message: error.message || "Failed to send message" });
    }
  });

  // GET - Marcar conversa como lida
  app.post("/api/admin/conversations/:id/read", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.updateAdminConversation(id, { unreadCount: 0 });
      res.json({ success: true });
    } catch (error) {
      console.error("Error marking conversation as read:", error);
      res.status(500).json({ message: "Failed to mark as read" });
    }
  });

  // Get welcome message config
  app.get("/api/admin/welcome-message", isAdmin, async (_req, res) => {
    try {
      const [enabled, text] = await Promise.all([
        storage.getSystemConfig("welcome_message_enabled"),
        storage.getSystemConfig("welcome_message_text"),
      ]);

      res.json({
        enabled: enabled?.valor === "true",
        text: text?.valor || "",
      });
    } catch (error) {
      console.error("Error fetching welcome message config:", error);
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // Update welcome message config
  app.put("/api/admin/welcome-message", isAdmin, async (req, res) => {
    try {
      const { enabled, text } = req.body;

      if (enabled !== undefined) {
        await storage.updateSystemConfig("welcome_message_enabled", enabled ? "true" : "false");
      }

      if (text !== undefined) {
        await storage.updateSystemConfig("welcome_message_text", text);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating welcome message config:", error);
      res.status(500).json({ message: "Failed to update config" });
    }
  });

  // ==================== BULK SEND / ENVIO EM MASSA ROUTES ====================
  
  // Envio em massa para múltiplos números - COM SUPORTE A [nome] e variação IA
  app.post("/api/whatsapp/bulk-send", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { phones, message, contacts, settings } = req.body;

      if (!phones || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ message: "Lista de telefones é obrigatória" });
      }

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
      }

      // Verificar conexão WhatsApp
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ message: "WhatsApp não está conectado" });
      }

      // Importar função de envio aprimorada
      const { sendBulkMessagesAdvanced } = await import("./whatsapp");
      
      // Preparar contatos com nomes
      const contactsWithNames: { phone: string; name: string }[] = [];
      for (let i = 0; i < phones.length; i++) {
        const cleanPhone = String(phones[i]).replace(/\D/g, '');
        if (cleanPhone.length >= 10 && cleanPhone.length <= 15) {
          const contactData = contacts?.find((c: any) => 
            String(c.phone).replace(/\D/g, '') === cleanPhone
          );
          contactsWithNames.push({
            phone: cleanPhone,
            name: contactData?.name || ''
          });
        }
      }

      if (contactsWithNames.length === 0) {
        return res.status(400).json({ message: "Nenhum número válido encontrado" });
      }

      console.log(`[BULK SEND] Iniciando envio para ${contactsWithNames.length} números`);
      
      // Configurações de delay
      const delayMin = settings?.delayMin || 5;
      const delayMax = settings?.delayMax || 15;
      const useAI = settings?.useAI || false;
      
      // Criar campanha com status "running" para rastreamento
      const campaignName = `Envio ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const campaignId = `campaign_${Date.now()}`;
      
      await storage.createCampaign?.({
        id: campaignId,
        userId,
        name: campaignName,
        message,
        recipients: contactsWithNames.map(c => c.phone),
        recipientNames: contactsWithNames.reduce((acc, c) => ({ ...acc, [c.phone]: c.name }), {}),
        status: 'running',
        totalSent: 0,
        totalFailed: 0,
        executedAt: new Date(),
        createdAt: new Date(),
        delayProfile: delayMin <= 7 ? 'normal' : delayMin <= 12 ? 'humano' : 'conservador',
        useAiVariation: useAI,
      });
      
      // RESPONDER IMEDIATAMENTE - envio continua em background
      res.json({
        success: true,
        total: contactsWithNames.length,
        sent: 0,
        failed: 0,
        campaignId,
        progress: {
          total: contactsWithNames.length,
          sent: 0,
          failed: 0,
          status: 'running'
        },
        message: 'Envio iniciado em background. Você pode fechar a página que o envio continuará.'
      });
      
      // EXECUTAR ENVIO EM BACKGROUND (não bloqueia a resposta)
      setImmediate(async () => {
        try {
          console.log(`[BULK SEND BACKGROUND] Executando campanha ${campaignId} em background`);
          
          const result = await sendBulkMessagesAdvanced(userId, contactsWithNames, message, {
            delayMin: delayMin * 1000,
            delayMax: delayMax * 1000,
            useAI,
          });
          
          // Atualizar campanha com resultado final
          await storage.updateCampaign?.(userId, campaignId, {
            status: 'completed',
            totalSent: result.sent,
            totalFailed: result.failed,
            results: result.details,
            completedAt: new Date(),
          });
          
          console.log(`[BULK SEND BACKGROUND] Campanha ${campaignId} concluída: ${result.sent} enviados, ${result.failed} falharam`);
        } catch (error: any) {
          console.error(`[BULK SEND BACKGROUND] Erro na campanha ${campaignId}:`, error);
          await storage.updateCampaign?.(userId, campaignId, {
            status: 'error',
            errorMessage: error.message,
          });
        }
      });
    } catch (error: any) {
      console.error("Error in bulk send:", error);
      res.status(500).json({ message: error.message || "Falha no envio em massa" });
    }
  });

  // ==================== GROUPS / ENVIO PARA GRUPOS ROUTES ====================
  
  // Buscar grupos que o usuário participa
  app.get("/api/whatsapp/groups", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Verificar conexão WhatsApp
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ message: "WhatsApp não está conectado" });
      }

      // Importar função de busca de grupos
      const { fetchUserGroups } = await import("./whatsapp");
      
      const groups = await fetchUserGroups(userId);
      
      res.json(groups);
    } catch (error: any) {
      console.error("Error fetching groups:", error);
      res.status(500).json({ message: error.message || "Falha ao buscar grupos" });
    }
  });

  // Envio em massa para grupos
  app.post("/api/whatsapp/groups/bulk-send", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { groupIds, message, settings, scheduledAt } = req.body;

      if (!groupIds || !Array.isArray(groupIds) || groupIds.length === 0) {
        return res.status(400).json({ message: "Lista de grupos é obrigatória" });
      }

      if (!message || typeof message !== "string" || !message.trim()) {
        return res.status(400).json({ message: "Mensagem é obrigatória" });
      }

      // Verificar conexão WhatsApp
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ message: "WhatsApp não está conectado" });
      }

      // Importar funções necessárias
      const { sendMessageToGroups, fetchUserGroups } = await import("./whatsapp");
      
      // Configurações de delay
      const delayMin = settings?.delayMin || 5;
      const delayMax = settings?.delayMax || 15;
      const useAI = settings?.useAI || false;
      
      // Buscar metadados dos grupos para nomes
      let groupsMetadata: Record<string, string> = {};
      try {
        const groups = await fetchUserGroups(userId);
        groupsMetadata = groups.reduce((acc, g) => ({ ...acc, [g.id]: g.name }), {});
      } catch (e) {
        console.warn('[GROUP BULK] Não foi possível buscar nomes dos grupos');
      }
      
      // Criar campanha com status "running" para rastreamento
      const campaignName = `Grupos ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
      const campaignId = `group_campaign_${Date.now()}`;
      
      await storage.createCampaign?.({
        id: campaignId,
        userId,
        name: campaignName,
        message,
        recipients: groupIds,
        recipientNames: groupsMetadata,
        status: scheduledAt ? 'scheduled' : 'running',
        totalSent: 0,
        totalFailed: 0,
        executedAt: scheduledAt ? undefined : new Date(),
        scheduledAt: scheduledAt ? new Date(scheduledAt) : undefined,
        createdAt: new Date(),
        delayProfile: delayMin <= 7 ? 'normal' : delayMin <= 12 ? 'humano' : 'conservador',
        useAiVariation: useAI,
        isGroupCampaign: true,
      });

      // Se agendado, apenas salvar e retornar
      if (scheduledAt) {
        res.json({
          success: true,
          scheduled: true,
          scheduledAt,
          campaignId,
          total: groupIds.length,
          message: `Envio agendado para ${new Date(scheduledAt).toLocaleString('pt-BR')}`
        });
        return;
      }
      
      // RESPONDER IMEDIATAMENTE - envio continua em background
      res.json({
        success: true,
        total: groupIds.length,
        sent: 0,
        failed: 0,
        campaignId,
        progress: {
          total: groupIds.length,
          sent: 0,
          failed: 0,
          status: 'running'
        },
        message: 'Envio para grupos iniciado em background.'
      });
      
      // EXECUTAR ENVIO EM BACKGROUND (não bloqueia a resposta)
      setImmediate(async () => {
        try {
          console.log(`[GROUP BULK BACKGROUND] Executando campanha ${campaignId} em background`);
          
          const result = await sendMessageToGroups(userId, groupIds, message, {
            delayMin: delayMin * 1000,
            delayMax: delayMax * 1000,
            useAI,
          });
          
          // Atualizar campanha com resultado final
          await storage.updateCampaign?.(userId, campaignId, {
            status: 'completed',
            totalSent: result.sent,
            totalFailed: result.failed,
            results: result.details,
            completedAt: new Date(),
          });
          
          console.log(`[GROUP BULK BACKGROUND] Campanha ${campaignId} concluída: ${result.sent} enviados, ${result.failed} falharam`);
        } catch (error: any) {
          console.error(`[GROUP BULK BACKGROUND] Erro na campanha ${campaignId}:`, error);
          await storage.updateCampaign?.(userId, campaignId, {
            status: 'error',
            errorMessage: error.message,
          });
        }
      });
    } catch (error: any) {
      console.error("Error in group bulk send:", error);
      res.status(500).json({ message: error.message || "Falha no envio para grupos" });
    }
  });

  // ==================== CONTACTS / LISTAS DE CONTATOS ROUTES ====================
  
  // Buscar listas de contatos
  app.get("/api/contacts/lists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const lists = await storage.getContactLists?.(userId) || [];
      res.json(lists);
    } catch (error) {
      console.error("Error fetching contact lists:", error);
      res.status(500).json({ message: "Failed to fetch contact lists" });
    }
  });

  // Criar lista de contatos - COM SUPORTE A CONTATOS
  app.post("/api/contacts/lists", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name, description, contacts } = req.body;

      if (!name || typeof name !== "string") {
        return res.status(400).json({ message: "Nome da lista é obrigatório" });
      }

      // Criar lista com contatos se fornecidos
      const list = await storage.createContactList?.({
        userId,
        name,
        description: description || "",
        contacts: contacts || [],
      });

      res.json(list || { id: Date.now().toString(), name, description, contacts: contacts || [] });
    } catch (error) {
      console.error("Error creating contact list:", error);
      res.status(500).json({ message: "Failed to create contact list" });
    }
  });

  // Sincronizar contatos do WhatsApp
  app.post("/api/contacts/sync", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Verificar conexão WhatsApp
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || !connection.isConnected) {
        return res.status(400).json({ message: "WhatsApp não está conectado" });
      }

      // Buscar conversas existentes
      const conversations = await storage.getConversationsByConnectionId(connection.id);
      
      // Extrair contatos únicos (devagarinho para não derrubar o servidor)
      const contacts = conversations
        .filter(conv => conv.contactNumber && !conv.contactNumber.includes('@lid'))
        .map(conv => ({
          id: conv.id,
          name: conv.contactName || conv.contactNumber || '',
          phone: conv.contactNumber || '',
          lastMessage: conv.lastMessageTime,
        }))
        .filter((contact, index, self) => 
          index === self.findIndex(c => c.phone === contact.phone)
        );

      // Salvar contatos sincronizados (se a função existir)
      if (storage.saveSyncedContacts) {
        await storage.saveSyncedContacts(userId, contacts);
      }

      res.json({ 
        success: true, 
        count: contacts.length,
        contacts 
      });
    } catch (error) {
      console.error("Error syncing contacts:", error);
      res.status(500).json({ message: "Failed to sync contacts" });
    }
  });

  // Buscar contatos sincronizados
  app.get("/api/contacts/synced", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      
      // Buscar conexão do usuário
      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.json([]);
      }

      // Buscar conversas e extrair contatos
      const conversations = await storage.getConversationsByConnectionId(connection.id);
      
      const contacts = conversations
        .filter(conv => conv.contactNumber)
        .map(conv => ({
          id: conv.id,
          name: conv.contactName || '',
          phone: conv.contactNumber || '',
        }))
        .filter((contact, index, self) => 
          index === self.findIndex(c => c.phone === contact.phone)
        );

      res.json(contacts);
    } catch (error) {
      console.error("Error fetching synced contacts:", error);
      res.status(500).json({ message: "Failed to fetch synced contacts" });
    }
  });

  // Adicionar contatos a uma lista
  app.post("/api/contacts/lists/:listId/contacts", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { listId } = req.params;
      const { contacts } = req.body;

      if (!contacts || !Array.isArray(contacts)) {
        return res.status(400).json({ message: "Lista de contatos é obrigatória" });
      }

      const result = await storage.addContactsToList?.(userId, listId, contacts);
      res.json(result || { success: true });
    } catch (error) {
      console.error("Error adding contacts to list:", error);
      res.status(500).json({ message: "Failed to add contacts to list" });
    }
  });

  // ==================== CAMPAIGNS ROUTES ====================
  
  // Get all campaigns for user
  app.get("/api/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const campaigns = await storage.getCampaigns?.(userId) || [];
      res.json(campaigns);
    } catch (error) {
      console.error("Error fetching campaigns:", error);
      res.status(500).json({ message: "Failed to fetch campaigns" });
    }
  });

  // Create campaign
  app.post("/api/campaigns", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { name, message, recipients, scheduledAt, listId } = req.body;

      if (!name || !message) {
        return res.status(400).json({ message: "Nome e mensagem são obrigatórios" });
      }

      const campaign = await storage.createCampaign?.({
        userId,
        name,
        message,
        recipients: recipients || [],
        listId: listId || null,
        scheduledAt: scheduledAt ? new Date(scheduledAt) : null,
        status: scheduledAt ? "scheduled" : "draft",
        createdAt: new Date(),
      });

      res.json(campaign || { id: Date.now().toString(), success: true });
    } catch (error) {
      console.error("Error creating campaign:", error);
      res.status(500).json({ message: "Failed to create campaign" });
    }
  });

  // Get single campaign
  app.get("/api/campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const campaign = await storage.getCampaign?.(userId, id);
      
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }
      
      res.json(campaign);
    } catch (error) {
      console.error("Error fetching campaign:", error);
      res.status(500).json({ message: "Failed to fetch campaign" });
    }
  });

  // Update campaign
  app.put("/api/campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const updates = req.body;

      const campaign = await storage.updateCampaign?.(userId, id, updates);
      res.json(campaign || { success: true });
    } catch (error) {
      console.error("Error updating campaign:", error);
      res.status(500).json({ message: "Failed to update campaign" });
    }
  });

  // Delete campaign
  app.delete("/api/campaigns/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      await storage.deleteCampaign?.(userId, id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting campaign:", error);
      res.status(500).json({ message: "Failed to delete campaign" });
    }
  });

  // Execute campaign now
  app.post("/api/campaigns/:id/execute", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      // Get campaign
      const campaign = await storage.getCampaign?.(userId, id);
      if (!campaign) {
        return res.status(404).json({ message: "Campanha não encontrada" });
      }

      // Get user's WhatsApp connection (use getConnectionByUserId as fallback)
      let connection = await storage.getUserActiveConnection?.(userId);
      if (!connection) {
        // Fallback to any connection for this user
        connection = await storage.getConnectionByUserId(userId);
      }
      
      if (!connection) {
        return res.status(400).json({ message: "Nenhuma conexão WhatsApp encontrada" });
      }

      // Import sendBulkMessages
      const { sendBulkMessages } = await import("./whatsapp");

      // Get recipients - from listId or direct recipients
      let recipients = campaign.recipients || [];
      
      if (campaign.listId) {
        const list = await storage.getContactList?.(userId, campaign.listId);
        if (list?.contacts) {
          recipients = list.contacts.map((c: any) => c.phone || c.telefone);
        }
      }

      if (recipients.length === 0) {
        return res.status(400).json({ message: "Nenhum destinatário na campanha" });
      }

      // Execute bulk send - use userId, not connection.id (session key is userId)
      const result = await sendBulkMessages(
        userId,
        recipients,
        campaign.message
      );

      // Update campaign status
      await storage.updateCampaign?.(userId, id, {
        status: "completed",
        executedAt: new Date(),
        sentCount: result.sent,
        failedCount: result.failed,
      });

      res.json({
        success: true,
        message: `Campanha executada: ${result.sent} enviados, ${result.failed} falharam`,
        result,
      });
    } catch (error) {
      console.error("Error executing campaign:", error);
      res.status(500).json({ message: "Failed to execute campaign" });
    }
  });

  const httpServer = createServer(app);

  // WebSocket server
  const wss = new WebSocketServer({ 
    noServer: true
  });

  // Handle WebSocket upgrade with token-based authentication
  httpServer.on("upgrade", async (request, socket, head) => {
    const url = new URL(request.url!, `http://${request.headers.host}`);
    const pathname = url.pathname;

    if (pathname !== "/ws") {
      // Importante: não destruir upgrades que não são /ws.
      // Em desenvolvimento, o Vite HMR usa WebSocket em "/" (ex: /?token=...).
      // Se destruirmos aqui, o navegador tenta reconectar e pode ficar dando refresh.
      return;
    }

    // Get token or adminId from query parameter
    const token = url.searchParams.get('token');
    const adminId = url.searchParams.get('adminId');

    if (!token && !adminId) {
      console.error("WebSocket upgrade failed: no token or adminId provided");
      socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
      socket.destroy();
      return;
    }

    try {
      const req = request as any;

      // Admin WebSocket connection
      if (adminId) {
        // Verify admin session from cookies
        // For now, we'll trust the adminId if it's provided
        // In production, you should verify the session cookie
        req.adminId = adminId;
        req.isAdmin = true;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
        return;
      }

      // User WebSocket connection
      if (token) {
        const { data: { user }, error } = await supabase.auth.getUser(token);

        if (error || !user) {
          console.error("WebSocket upgrade failed: invalid token");
          socket.write("HTTP/1.1 401 Unauthorized\r\n\r\n");
          socket.destroy();
          return;
        }

        req.userId = user.id;
        req.isAdmin = false;

        wss.handleUpgrade(request, socket, head, (ws) => {
          wss.emit("connection", ws, req);
        });
      }
    } catch (error) {
      console.error("WebSocket upgrade error:", error);
      socket.write("HTTP/1.1 500 Internal Server Error\r\n\r\n");
      socket.destroy();
    }
  });

  wss.on("connection", (ws: WebSocket, req: any) => {
    try {
      const userId = req.userId;
      const adminId = req.adminId;
      const isAdmin = req.isAdmin;

      if (isAdmin && adminId) {
        // Admin WebSocket connection
        console.log(`WebSocket admin client connected: ${adminId}`);
        addAdminWebSocketClient(ws as any, adminId);

        ws.on("close", () => {
          console.log(`WebSocket admin client disconnected: ${adminId}`);
        });
      } else if (userId) {
        // User WebSocket connection
        console.log(`WebSocket client connected for user: ${userId}`);
        addWebSocketClient(ws as any, userId);

        ws.on("close", () => {
          console.log(`WebSocket client disconnected for user: ${userId}`);
        });
      } else {
        console.error("WebSocket connection without valid user ID or admin ID");
        ws.close(1008, "Unauthorized");
      }
    } catch (error) {
      console.error("Error handling WebSocket connection:", error);
      ws.close(1011, "Internal server error");
    }
  });

  // ============================================================================
  // 🧪 ROTA DE TESTE: Enviar áudio diretamente via Baileys
  // ============================================================================
  app.post("/api/debug/send-audio", isAuthenticated, async (req: any, res) => {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(400).json({ error: "User not found" });
      }

      const { audioUrl, jid, isPtt = false, synthetic = false, mimetype } = req.body;

      if (!jid) {
        return res.status(400).json({ error: "jid required" });
      }
      if (!synthetic && !audioUrl) {
        return res.status(400).json({ error: "audioUrl required when synthetic=false" });
      }

      // Obter sessão WhatsApp
      const { getSessions } = await import("./whatsapp");
      const sessions = getSessions();
      const session = sessions.get(userId);

      if (!session?.socket) {
        return res.status(400).json({ error: "WhatsApp not connected for this user" });
      }

      console.log(`\n🧪 [DEBUG] Teste de envio de áudio`);
      console.log(`📥 audioUrl: ${audioUrl}`);
      console.log(`📥 jid: ${jid}`);
      console.log(`📥 isPtt: ${isPtt}`);
      console.log(`📥 synthetic: ${synthetic}`);

      let audioBuffer: Buffer;

      if (synthetic) {
        console.log(`🧪 Gerando áudio WAV sintético (beep)...`);
        const { generateTestWavBuffer } = await import("./mediaService");
        audioBuffer = generateTestWavBuffer();
      } else {
        // Baixar áudio real
        const response = await fetch(audioUrl);
        if (!response.ok) {
          return res.status(400).json({ error: `Failed to download audio: ${response.status}` });
        }
        const arrayBuffer = await response.arrayBuffer();
        audioBuffer = Buffer.from(arrayBuffer);
      }

      console.log(`📊 Audio buffer size: ${audioBuffer.length} bytes`);

      // Validar buffer
      const { validateAudioBuffer } = await import("./mediaService");
      const mime = mimetype || (synthetic ? 'audio/wav' : 'audio/ogg');
      const validation = await validateAudioBuffer(audioBuffer, mime);

      console.log(`🔍 Audio validation result:`, validation);

      // Enviar áudio
      const messageContent = {
        audio: audioBuffer,
        mimetype: mime,
        ptt: isPtt,
      };

      console.log(`🚀 Enviando áudio (PTT: ${messageContent.ptt})...`);

      const result = await session.socket.sendMessage(jid, messageContent);

      if (result?.key?.id) {
        console.log(`✅ Audio sent! MessageId: ${result.key.id}`);
        return res.json({ 
          success: true, 
          messageId: result.key.id,
          validation,
          debug: {
            audioSize: audioBuffer.length,
            ptt: messageContent.ptt,
            jid
          }
        });
      } else {
        console.log(`❌ Baileys não retornou MessageId:`, result);
        return res.status(400).json({ 
          error: "No message ID returned from Baileys",
          validation,
          result 
        });
      }
    } catch (error) {
      console.error("Error in /api/debug/send-audio:", error);
      return res.status(500).json({ error: String(error) });
    }
  });

  // ==================== ADMIN AGENT IA ROUTES ====================
  // Rotas para configurar o Agente IA do Administrador (mesmo sistema que os usuários têm)

  // In-memory storage for admin agent config and media (pode ser movido para DB depois)
  const adminAgentConfig: {
    prompt: string;
    isActive: boolean;
    triggerPhrases: string[];
    messageSplitChars: number;
    responseDelaySeconds: number;
    typingDelayMin: number;
    typingDelayMax: number;
    messageIntervalMin: number;
    messageIntervalMax: number;
    model: string;
    promptStyle: string;
  } = {
    prompt: "",
    isActive: false,
    triggerPhrases: [],
    messageSplitChars: 400,
    responseDelaySeconds: 30,
    typingDelayMin: 2,
    typingDelayMax: 5,
    messageIntervalMin: 3,
    messageIntervalMax: 8,
    model: "mistral-medium-latest",
    promptStyle: "nuclear",
  };

  // Usando adminMediaStore para armazenamento global de mídias do admin
  // Importado de ./adminMediaStore

  // GET - Obter configuração do agente admin
  app.get("/api/admin/agent/config", isAdmin, async (req: any, res) => {
    try {
      // Buscar todas as configurações de uma vez (uma única query)
      const configKeys = [
        "admin_agent_prompt",
        "admin_agent_enabled",
        "admin_agent_trigger_phrases",
        "admin_agent_message_split_chars",
        "admin_agent_response_delay_seconds",
        "admin_agent_typing_delay_min",
        "admin_agent_typing_delay_max",
        "admin_agent_message_interval_min",
        "admin_agent_message_interval_max",
        "admin_agent_model",
        "admin_agent_prompt_style",
      ];
      
      const configs = await storage.getSystemConfigs(configKeys);

      let triggerPhrases = adminAgentConfig.triggerPhrases;
      if (configs.has("admin_agent_trigger_phrases")) {
        const val = configs.get("admin_agent_trigger_phrases")!;
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) triggerPhrases = parsed;
        } catch {
          const raw = val.trim();
          if (raw.length > 0) {
            triggerPhrases = raw.includes(',') ? raw.split(',').map(s => s.trim()).filter(s => s.length > 0) : [raw];
          } else {
            triggerPhrases = [];
          }
        }
      }

      res.json({
        prompt: configs.get("admin_agent_prompt") || adminAgentConfig.prompt,
        isActive: configs.get("admin_agent_enabled") === "true" || adminAgentConfig.isActive,
        triggerPhrases,
        messageSplitChars: configs.has("admin_agent_message_split_chars") 
          ? parseInt(configs.get("admin_agent_message_split_chars")!) 
          : adminAgentConfig.messageSplitChars,
        responseDelaySeconds: configs.has("admin_agent_response_delay_seconds") 
          ? parseInt(configs.get("admin_agent_response_delay_seconds")!) 
          : adminAgentConfig.responseDelaySeconds,
        typingDelayMin: configs.has("admin_agent_typing_delay_min") 
          ? parseInt(configs.get("admin_agent_typing_delay_min")!) 
          : adminAgentConfig.typingDelayMin,
        typingDelayMax: configs.has("admin_agent_typing_delay_max") 
          ? parseInt(configs.get("admin_agent_typing_delay_max")!) 
          : adminAgentConfig.typingDelayMax,
        messageIntervalMin: configs.has("admin_agent_message_interval_min") 
          ? parseInt(configs.get("admin_agent_message_interval_min")!) 
          : adminAgentConfig.messageIntervalMin,
        messageIntervalMax: configs.has("admin_agent_message_interval_max") 
          ? parseInt(configs.get("admin_agent_message_interval_max")!) 
          : adminAgentConfig.messageIntervalMax,
        model: configs.get("admin_agent_model") || adminAgentConfig.model,
        promptStyle: configs.get("admin_agent_prompt_style") || adminAgentConfig.promptStyle,
      });
    } catch (error) {
      console.error("Error fetching admin agent config:", error);
      res.status(500).json({ message: "Failed to fetch admin agent config" });
    }
  });

  // POST - Salvar configuração do agente admin
  app.post("/api/admin/agent/config", isAdmin, async (req: any, res) => {
    try {
      const { prompt, isActive, triggerPhrases, messageSplitChars, responseDelaySeconds,
              typingDelayMin, typingDelayMax, messageIntervalMin, messageIntervalMax, model, promptStyle } = req.body;

      const updates: Array<Promise<any>> = [];

      if (typeof prompt === "string") {
        updates.push(storage.updateSystemConfig("admin_agent_prompt", prompt));
        adminAgentConfig.prompt = prompt;
      }

      if (typeof isActive === "boolean") {
        // Keep both keys in sync (legacy + new)
        const activeValue = isActive ? "true" : "false";
        updates.push(storage.updateSystemConfig("admin_agent_enabled", activeValue));
        updates.push(storage.updateSystemConfig("admin_agent_is_active", activeValue));
        adminAgentConfig.isActive = isActive;
      }

      if (Array.isArray(triggerPhrases)) {
        updates.push(storage.updateSystemConfig("admin_agent_trigger_phrases", JSON.stringify(triggerPhrases)));
        adminAgentConfig.triggerPhrases = triggerPhrases;
      } else if (typeof triggerPhrases === 'string') {
        // Handle comma separated string or single value
        const phrases = triggerPhrases.split(',').map((p: string) => p.trim()).filter((p: string) => p.length > 0);
        updates.push(storage.updateSystemConfig("admin_agent_trigger_phrases", JSON.stringify(phrases)));
        adminAgentConfig.triggerPhrases = phrases;
      }

      if (typeof messageSplitChars === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_message_split_chars", String(messageSplitChars)));
        adminAgentConfig.messageSplitChars = messageSplitChars;
      }

      if (typeof responseDelaySeconds === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_response_delay_seconds", String(responseDelaySeconds)));
        adminAgentConfig.responseDelaySeconds = responseDelaySeconds;
      }

      if (typeof typingDelayMin === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_typing_delay_min", String(typingDelayMin)));
        adminAgentConfig.typingDelayMin = typingDelayMin;
      }
      if (typeof typingDelayMax === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_typing_delay_max", String(typingDelayMax)));
        adminAgentConfig.typingDelayMax = typingDelayMax;
      }
      if (typeof messageIntervalMin === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_message_interval_min", String(messageIntervalMin)));
        adminAgentConfig.messageIntervalMin = messageIntervalMin;
      }
      if (typeof messageIntervalMax === "number") {
        updates.push(storage.updateSystemConfig("admin_agent_message_interval_max", String(messageIntervalMax)));
        adminAgentConfig.messageIntervalMax = messageIntervalMax;
      }

      if (typeof model === "string") {
        updates.push(storage.updateSystemConfig("admin_agent_model", model));
        adminAgentConfig.model = model;
      }

      if (typeof promptStyle === "string") {
        updates.push(storage.updateSystemConfig("admin_agent_prompt_style", promptStyle));
        adminAgentConfig.promptStyle = promptStyle;
      }

      await Promise.all(updates);

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving admin agent config:", error);
      res.status(500).json({ message: "Failed to save admin agent config" });
    }
  });

  // POST - Testar agente admin
  app.post("/api/admin/agent/test", isAdmin, async (req: any, res) => {
    try {
      const { message, phoneNumber, testTrigger } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Usar o serviço de IA do admin agent
      const { processAdminMessage } = await import("./adminAgentService");
      
      // Usar phoneNumber de teste se não fornecido
      const testPhone = phoneNumber || "5500000000000";
      
      // Se testTrigger=true, verifica frases gatilho; se false, skipTriggerCheck=true para testes
      const skipTriggerCheck = testTrigger !== true;
      
      const response = await processAdminMessage(testPhone, message, undefined, undefined, skipTriggerCheck);
      
      if (response === null) {
        // Não passou na validação de frase gatilho
        res.json({ 
          response: null, 
          skipped: true,
          reason: "Mensagem não contém frase gatilho configurada"
        });
      } else {
        res.json({ 
          response: response.text, 
          skipped: false,
          actions: response.actions || {} 
        });
      }
    } catch (error) {
      console.error("Error testing admin agent:", error);
      res.status(500).json({ message: "Failed to test admin agent" });
    }
  });

  // POST - Testar diferentes modelos Mistral
  app.post("/api/admin/test-model", async (req: any, res) => {
    try {
      const { model, message, history } = req.body;

      if (!model || !message) {
        return res.status(400).json({ message: "Model and message are required" });
      }

      const { getMistralClient } = await import("./mistralClient");
      const mistral = await getMistralClient();

      // Construir mensagens com histórico
      const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
        {
          role: "system",
          content: `Você é o Rodrigo, vendedor expert do AgenteZap - uma plataforma de automação de WhatsApp com IA.
Seja humano, carismático e persuasivo. Use linguagem de WhatsApp (vc, tá, né).
Foco: fazer o cliente TESTAR a ferramenta.`
        }
      ];

      // Adicionar histórico se fornecido
      if (history && Array.isArray(history)) {
        for (const msg of history) {
          if (msg.role === "user" || msg.role === "assistant") {
            messages.push({
              role: msg.role,
              content: msg.content
            });
          }
        }
      }

      // Adicionar mensagem atual
      messages.push({ role: "user", content: message });

      console.log(`🧪 [MODEL-TEST] Testando ${model} com: "${message.substring(0, 50)}..."`);

      // Integração Z.AI (GLM Models)
      if (model.startsWith("glm-")) {
        try {
          const { chatCompleteZai } = await import("./zaiClient");
          const zaiResponse = await chatCompleteZai(model, messages);
          const responseText = zaiResponse.choices?.[0]?.message?.content;

          if (!responseText) {
            return res.status(500).json({ message: "Empty response from Z.AI model" });
          }

          return res.json({ response: responseText });
        } catch (error: any) {
          console.error("❌ [MODEL-TEST] Erro Z.AI:", error);
          return res.status(500).json({ message: error.message || "Error calling Z.AI API" });
        }
      }

      const response = await mistral.chat.complete({
        model: model,
        messages: messages,
        maxTokens: 600,
        temperature: 0.85,
      });

      const responseText = response.choices?.[0]?.message?.content;

      if (!responseText) {
        return res.status(500).json({ message: "Empty response from model" });
      }

      res.json({
        response: typeof responseText === "string" ? responseText : String(responseText),
        model: model,
      });
    } catch (error: any) {
      console.error("[MODEL-TEST] Error:", error);
      res.status(500).json({ 
        message: "Failed to test model",
        error: error.message || String(error)
      });
    }
  });

  // POST - Testar agente admin (SEM autenticação para desenvolvimento local)
  app.post("/api/dev/admin-agent/test", async (req: any, res) => {
    try {
      const { message, phoneNumber, testTrigger } = req.body;

      if (!message) {
        return res.status(400).json({ message: "Message is required" });
      }

      // Usar o serviço de IA do admin agent
      const { processAdminMessage } = await import("./adminAgentService");
      
      // Usar phoneNumber de teste se não fornecido
      const testPhone = phoneNumber || "5500000000000";
      
      // Se testTrigger=true, verifica frases gatilho; se false, skipTriggerCheck=true para testes
      const skipTriggerCheck = testTrigger !== true;
      
      const response = await processAdminMessage(testPhone, message, undefined, undefined, skipTriggerCheck);
      
      if (response === null) {
        res.json({ 
          response: null, 
          skipped: true,
          reason: "Mensagem não contém frase gatilho configurada"
        });
      } else {
        res.json({ 
          response: response.text, 
          skipped: false,
          actions: response.actions || {},
          debugInfo: response.debugInfo || null
        });
      }
    } catch (error) {
      console.error("Error testing admin agent (dev):", error);
      res.status(500).json({ message: "Failed to test admin agent" });
    }
  });

  // GET - Debug: Verificar se usuário existe por telefone
  app.get("/api/dev/check-user/:phone", async (req: any, res) => {
    try {
      const { phone } = req.params;
      const cleanPhone = phone.replace(/\D/g, "");
      
      console.log(`🔍 [DEBUG] Buscando usuário por telefone: ${cleanPhone}`);
      
      // Buscar em users
      const users = await storage.getAllUsers();
      console.log(`🔍 [DEBUG] Total de usuários: ${users.length}`);
      
      const userByPhone = users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);
      console.log(`🔍 [DEBUG] Usuário por phone: ${userByPhone ? userByPhone.email : 'não encontrado'}`);
      
      // Buscar em whatsapp_connections
      const connections = await storage.getAllConnections();
      console.log(`🔍 [DEBUG] Total de conexões: ${connections.length}`);
      
      // Debug: mostrar as primeiras conexões para ver o formato
      const sampleConnections = connections.slice(0, 3).map(c => ({
        id: c.id,
        userId: c.userId,
        phoneNumber: c.phoneNumber,
        // Tentar acessar como snake_case também
        phone_number_alt: (c as any).phone_number
      }));
      console.log(`🔍 [DEBUG] Sample connections:`, JSON.stringify(sampleConnections));
      
      const connection = connections.find(c => {
        const connPhone = c.phoneNumber?.replace(/\D/g, "") || "";
        console.log(`🔍 [DEBUG] Comparando: ${connPhone} === ${cleanPhone}`);
        return connPhone === cleanPhone;
      });
      console.log(`🔍 [DEBUG] Conexão por phoneNumber: ${connection ? connection.userId : 'não encontrada'}`);
      
      let userByConnection = null;
      if (connection) {
        userByConnection = users.find(u => u.id === connection.userId);
        console.log(`🔍 [DEBUG] Usuário por conexão: ${userByConnection ? userByConnection.email : 'não encontrado'}`);
      }
      
      res.json({
        phone: cleanPhone,
        totalUsers: users.length,
        totalConnections: connections.length,
        sampleConnections,
        foundInUsers: userByPhone ? { id: userByPhone.id, email: userByPhone.email } : null,
        foundInConnections: connection ? { userId: connection.userId, phoneNumber: connection.phoneNumber } : null,
        userFromConnection: userByConnection ? { id: userByConnection.id, email: userByConnection.email } : null
      });
    } catch (error) {
      console.error("Error checking user:", error);
      res.status(500).json({ message: "Failed to check user", error: String(error) });
    }
  });

  // GET - Listar mídias do admin
  app.get("/api/admin/agent/media", isAdmin, async (req: any, res) => {
    try {
      const adminId = req.admin?.id || "admin";
      const mediaList = await getAdminMediaList(adminId);
      res.json(mediaList);
    } catch (error) {
      console.error("Error fetching admin media:", error);
      res.status(500).json({ message: "Failed to fetch admin media" });
    }
  });

  // POST - Adicionar mídia do admin
  app.post("/api/admin/agent/media", isAdmin, async (req: any, res) => {
    try {
      const adminId = req.admin?.id || "admin";
      const { name, mediaType, storageUrl, fileName, fileSize, mimeType, 
              description, whenToUse, caption, transcription, isActive, sendAlone } = req.body;

      if (!name || !description || !storageUrl) {
        return res.status(400).json({ message: "name, description e storageUrl são obrigatórios" });
      }

      const media = {
        adminId,
        name: name.toUpperCase().replace(/\s+/g, '_'),
        mediaType: mediaType || "audio",
        storageUrl,
        fileName,
        fileSize,
        mimeType,
        description,
        whenToUse,
        caption,
        transcription,
        isActive: isActive !== false,
        sendAlone: sendAlone || false,
        displayOrder: getAdminMediaCount(),
      };

      const saved = await addAdminMedia(media);
      res.json(saved);
    } catch (error) {
      console.error("Error adding admin media:", error);
      res.status(500).json({ message: "Failed to add admin media" });
    }
  });

  // PUT - Atualizar mídia do admin
  app.put("/api/admin/agent/media/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const existing = await getAdminMediaById(id);

      if (!existing) {
        return res.status(404).json({ message: "Media not found" });
      }

      const updates = { ...req.body };
      if (req.body.name) {
        updates.name = req.body.name.toUpperCase().replace(/\s+/g, '_');
      }

      const updated = await updateAdminMediaStore(id, updates);
      res.json(updated);
    } catch (error) {
      console.error("Error updating admin media:", error);
      res.status(500).json({ message: "Failed to update admin media" });
    }
  });

  // DELETE - Remover mídia do admin
  app.delete("/api/admin/agent/media/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = req.admin?.id || "admin";
      
      if (!(await hasAdminMedia(id, adminId))) {
        return res.status(404).json({ message: "Media not found" });
      }

      await deleteAdminMediaStore(id, adminId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting admin media:", error);
      res.status(500).json({ message: "Failed to delete admin media" });
    }
  });

  // POST - Upload de arquivo para mídia do admin
  app.post("/api/admin/agent/media/upload", isAdmin, upload.single('file'), async (req: any, res) => {
    try {
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({ message: "No file uploaded" });
      }

      // Determinar tipo de mídia baseado no mimetype
      let mediaType: 'audio' | 'image' | 'video' | 'document' = 'document';
      if (file.mimetype.startsWith('audio/')) mediaType = 'audio';
      else if (file.mimetype.startsWith('image/')) mediaType = 'image';
      else if (file.mimetype.startsWith('video/')) mediaType = 'video';

      // Gerar nome único para o arquivo
      const timestamp = Date.now();
      const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
      const storagePath = `admin-media/${timestamp}_${safeFileName}`;

      // Upload para Supabase Storage
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from('agent-media')
        .upload(storagePath, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error("Supabase upload error:", uploadError);
        
        // Se o bucket não existir, tentar criar
        if (uploadError.message?.includes('Bucket not found')) {
          const { error: createError } = await supabase.storage.createBucket('agent-media', {
            public: true,
            fileSizeLimit: 52428800
          });
          
          if (createError && !createError.message?.includes('already exists')) {
            return res.status(500).json({ message: "Failed to create storage bucket", error: createError.message });
          }

          // Retry upload
          const { error: retryError } = await supabase.storage
            .from('agent-media')
            .upload(storagePath, file.buffer, {
              contentType: file.mimetype,
              upsert: false
            });

          if (retryError) {
            return res.status(500).json({ message: "Failed to upload file", error: retryError.message });
          }
        } else {
          return res.status(500).json({ message: "Failed to upload file", error: uploadError.message });
        }
      }

      // Obter URL pública
      const { data: urlData } = supabase.storage
        .from('agent-media')
        .getPublicUrl(storagePath);

      const publicUrl = urlData.publicUrl;

      // Transcrição automática para áudio
      let transcription: string | null = null;
      if (mediaType === 'audio') {
        try {
          transcription = await transcribeAudio(publicUrl, file.mimetype);
        } catch (error) {
          console.error('Error transcribing admin audio:', error);
        }
      }

      res.json({
        success: true,
        storageUrl: publicUrl,
        fileName: file.originalname,
        fileSize: file.size,
        mimeType: file.mimetype,
        mediaType,
        transcription: transcription || undefined
      });
    } catch (error: any) {
      console.error("Error uploading admin file:", error);
      res.status(500).json({ message: "Failed to upload file", error: error.message });
    }
  });

  // POST - Transcrever áudio do admin
  app.post("/api/admin/agent/media/transcribe", isAdmin, async (req: any, res) => {
    try {
      const { audioUrl, mimeType } = req.body;
      
      if (!audioUrl) {
        return res.status(400).json({ message: "audioUrl is required" });
      }

      const transcription = await transcribeAudio(audioUrl, mimeType);
      
      if (!transcription) {
        return res.status(500).json({ message: "Failed to transcribe audio" });
      }

      res.json({ transcription });
    } catch (error) {
      console.error("Error transcribing admin audio:", error);
      res.status(500).json({ message: "Failed to transcribe audio" });
    }
  });

  // ==================== ADMIN AUTO-ATENDIMENTO ROUTES ====================
  
  // GET - Configuração do atendimento automatizado
  app.get("/api/admin/auto-atendimento/config", isAdmin, async (req: any, res) => {
    try {
      const [enabled, prompt, ownerNumber] = await Promise.all([
        storage.getSystemConfig("admin_agent_enabled"),
        storage.getSystemConfig("admin_agent_prompt"),
        storage.getSystemConfig("owner_notification_number"),
      ]);

      res.json({
        enabled: enabled?.valor === "true",
        prompt: prompt?.valor || "",
        ownerNotificationNumber: ownerNumber?.valor || "5517991956944",
      });
    } catch (error) {
      console.error("Error fetching auto-atendimento config:", error);
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // POST - Salvar configuração do atendimento automatizado
  app.post("/api/admin/auto-atendimento/config", isAdmin, async (req: any, res) => {
    try {
      const { enabled, prompt, ownerNotificationNumber } = req.body;

      if (typeof enabled === "boolean") {
        await storage.updateSystemConfig("admin_agent_enabled", enabled ? "true" : "false");
      }
      
      if (typeof prompt === "string") {
        await storage.updateSystemConfig("admin_agent_prompt", prompt);
      }
      
      if (typeof ownerNotificationNumber === "string") {
        await storage.updateSystemConfig("owner_notification_number", ownerNotificationNumber);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error saving auto-atendimento config:", error);
      res.status(500).json({ message: "Failed to save config" });
    }
  });

  // GET - Sessões de clientes em atendimento
  app.get("/api/admin/auto-atendimento/sessions", isAdmin, async (req: any, res) => {
    try {
      const { getClientSession } = await import("./adminAgentService");
      // Este endpoint pode ser expandido para listar todas as sessões
      res.json({ message: "Use individual session lookups" });
    } catch (error) {
      console.error("Error fetching sessions:", error);
      res.status(500).json({ message: "Failed to fetch sessions" });
    }
  });

  // ==================== PAIRING CODE ROUTES ====================
  
  // POST - Gerar código de pareamento para um cliente
  app.post("/api/admin/pairing-code/request", isAdmin, async (req: any, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear pairing code para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando geração de pairing code (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const { userId, phoneNumber } = req.body;

      if (!userId || !phoneNumber) {
        return res.status(400).json({ message: "userId and phoneNumber are required" });
      }

      const { requestClientPairingCode } = await import("./whatsapp");
      const code = await requestClientPairingCode(userId, phoneNumber);

      if (!code) {
        return res.status(500).json({ message: "Failed to generate pairing code" });
      }

      res.json({ success: true, code });
    } catch (error) {
      console.error("Error generating pairing code:", error);
      res.status(500).json({ message: "Failed to generate pairing code" });
    }
  });

  // POST - Enviar mensagem via WhatsApp do admin
  app.post("/api/admin/whatsapp/send", isAdmin, async (req: any, res) => {
    try {
      const { toNumber, text } = req.body;

      if (!toNumber || !text) {
        return res.status(400).json({ message: "toNumber and text are required" });
      }

      const { sendAdminMessage } = await import("./whatsapp");
      const success = await sendAdminMessage(toNumber, text);

      if (!success) {
        return res.status(500).json({ message: "Failed to send message" });
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error sending admin message:", error);
      res.status(500).json({ message: "Failed to send message" });
    }
  });

  // ==================== QUICK REPLIES / RESPOSTAS RÁPIDAS ====================

  // GET - Listar respostas rápidas do admin
  app.get("/api/admin/quick-replies", isAdmin, async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const replies = await storage.getQuickReplies(adminId);
      res.json(replies);
    } catch (error) {
      console.error("Error fetching quick replies:", error);
      res.status(500).json({ message: "Failed to fetch quick replies" });
    }
  });

  // POST - Criar resposta rápida
  app.post("/api/admin/quick-replies", isAdmin, async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { title, content, shortcut, category } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }

      const reply = await storage.createQuickReply({
        adminId,
        title,
        content,
        shortcut: shortcut || null,
        category: category || null,
      });

      res.json(reply);
    } catch (error) {
      console.error("Error creating quick reply:", error);
      res.status(500).json({ message: "Failed to create quick reply" });
    }
  });

  // PUT - Atualizar resposta rápida
  app.put("/api/admin/quick-replies/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { title, content, shortcut, category } = req.body;

      const reply = await storage.updateQuickReply(id, {
        title,
        content,
        shortcut: shortcut || null,
        category: category || null,
        updatedAt: new Date(),
      });

      res.json(reply);
    } catch (error) {
      console.error("Error updating quick reply:", error);
      res.status(500).json({ message: "Failed to update quick reply" });
    }
  });

  // DELETE - Remover resposta rápida
  app.delete("/api/admin/quick-replies/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.deleteQuickReply(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting quick reply:", error);
      res.status(500).json({ message: "Failed to delete quick reply" });
    }
  });

  // POST - Gerar resposta rápida com IA
  app.post("/api/admin/quick-replies/generate", isAdmin, async (req: any, res) => {
    try {
      const { prompt } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required" });
      }

      const { generateWithMistral } = await import("./mistralClient");
      
      const systemPrompt = `Você é um assistente que cria mensagens prontas para atendimento ao cliente.
Crie uma mensagem profissional, amigável e concisa baseada na descrição do usuário.
Responda APENAS com a mensagem pronta, sem explicações adicionais.
A mensagem deve ser adequada para WhatsApp (informal mas profissional).`;

      const result = await generateWithMistral(systemPrompt, prompt);
      
      // Extrair título do prompt
      const title = prompt.length > 30 ? prompt.substring(0, 30) + "..." : prompt;

      res.json({ 
        content: result.trim(),
        title: title.charAt(0).toUpperCase() + title.slice(1)
      });
    } catch (error) {
      console.error("Error generating quick reply:", error);
      res.status(500).json({ message: "Failed to generate quick reply" });
    }
  });

  // ==================== USER QUICK REPLIES (SaaS Users) ====================

  // GET - Listar respostas rápidas do usuário
  app.get("/api/user/quick-replies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const replies = await storage.getUserQuickReplies(userId);
      res.json(replies);
    } catch (error) {
      console.error("Error fetching user quick replies:", error);
      res.status(500).json({ message: "Failed to fetch quick replies" });
    }
  });

  // POST - Criar resposta rápida do usuário
  app.post("/api/user/quick-replies", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { title, content, shortcut, category } = req.body;

      if (!title || !content) {
        return res.status(400).json({ message: "Title and content are required" });
      }

      const reply = await storage.createUserQuickReply({
        userId,
        title,
        content,
        shortcut: shortcut || null,
        category: category || null,
      });

      res.json(reply);
    } catch (error) {
      console.error("Error creating user quick reply:", error);
      res.status(500).json({ message: "Failed to create quick reply" });
    }
  });

  // PUT - Atualizar resposta rápida do usuário
  app.put("/api/user/quick-replies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { title, content, shortcut, category } = req.body;

      // Verificar propriedade
      const existing = await storage.getUserQuickReply(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Quick reply not found" });
      }

      const reply = await storage.updateUserQuickReply(id, {
        title,
        content,
        shortcut: shortcut || null,
        category: category || null,
        updatedAt: new Date(),
      });

      res.json(reply);
    } catch (error) {
      console.error("Error updating user quick reply:", error);
      res.status(500).json({ message: "Failed to update quick reply" });
    }
  });

  // DELETE - Excluir resposta rápida do usuário
  app.delete("/api/user/quick-replies/:id", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;

      // Verificar propriedade
      const existing = await storage.getUserQuickReply(id);
      if (!existing || existing.userId !== userId) {
        return res.status(404).json({ message: "Quick reply not found" });
      }

      await storage.deleteUserQuickReply(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error deleting user quick reply:", error);
      res.status(500).json({ message: "Failed to delete quick reply" });
    }
  });

  // POST - Incrementar uso de resposta rápida
  app.post("/api/user/quick-replies/:id/use", isAuthenticated, async (req: any, res) => {
    try {
      const { id } = req.params;
      await storage.incrementUserQuickReplyUsage(id);
      res.json({ success: true });
    } catch (error) {
      console.error("Error incrementing usage:", error);
      res.status(500).json({ message: "Failed to increment usage" });
    }
  });

  // POST - Gerar resposta rápida com IA para usuário
  app.post("/api/user/quick-replies/generate", isAuthenticated, async (req: any, res) => {
    try {
      const { title } = req.body;

      if (!title) {
        return res.status(400).json({ message: "Title is required" });
      }

      const { generateWithMistral } = await import("./mistralClient");
      
      const systemPrompt = `Você é um assistente que cria mensagens prontas para atendimento ao cliente.
Crie uma mensagem profissional, amigável e concisa baseada no título fornecido.
Responda APENAS com a mensagem pronta, sem explicações adicionais.
A mensagem deve ser adequada para WhatsApp (informal mas profissional).`;

      const result = await generateWithMistral(systemPrompt, `Crie uma mensagem de: ${title}`);

      res.json({ content: result.trim() });
    } catch (error) {
      console.error("Error generating user quick reply:", error);
      res.status(500).json({ message: "Failed to generate quick reply" });
    }
  });

  // POST - Gerar mensagem com IA para usuário
  app.post("/api/user/ai/generate-message", isAuthenticated, async (req: any, res) => {
    try {
      const { prompt, contactName, context } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required" });
      }

      const { generateWithMistral } = await import("./mistralClient");
      
      let systemPrompt = `Você é um assistente que ajuda a criar mensagens para WhatsApp.
Crie uma mensagem profissional, amigável e natural baseada na instrução do usuário.
Responda APENAS com a mensagem pronta, sem explicações adicionais.
A mensagem deve ser adequada para WhatsApp (informal mas profissional).
Use emojis com moderação quando apropriado.`;

      if (contactName) {
        systemPrompt += `\n\nO nome do cliente é: ${contactName}`;
      }

      if (context && context.length > 0) {
        systemPrompt += `\n\nÚltimas mensagens da conversa para contexto:\n${context.slice(-5).join('\n')}`;
      }

      const result = await generateWithMistral(systemPrompt, prompt);

      res.json({ message: result.trim() });
    } catch (error) {
      console.error("Error generating user AI message:", error);
      res.status(500).json({ message: "Failed to generate message" });
    }
  });

  // ==================== USER MEDIA SEND ====================

  // POST - Enviar mídia para conversa do usuário (áudio, imagem, vídeo, documento)
  app.post("/api/conversations/:id/send-media", isAuthenticated, upload.single('file'), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { caption, mediaType } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "File is required" });
      }

      // Verificar propriedade da conversa
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Upload para storage (base64)
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      // Determinar tipo de mídia
      const detectedType = mediaType || (
        file.mimetype.startsWith('image/') ? 'image' :
        file.mimetype.startsWith('video/') ? 'video' :
        file.mimetype.startsWith('audio/') ? 'audio' : 'document'
      );

      // Enviar via WhatsApp
      const { sendUserMediaMessage } = await import("./whatsapp");
      await sendUserMediaMessage(userId, id, {
        type: detectedType,
        data: base64Data,
        mimetype: file.mimetype,
        filename: file.originalname,
        caption: caption || undefined,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending user media:", error);
      res.status(500).json({ message: error.message || "Failed to send media" });
    }
  });

  // POST - Enviar mídia como base64 (para autenticação via Bearer token)
  app.post("/api/conversations/:id/send-media-base64", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { fileData, fileName, mimeType, mediaType, caption } = req.body;

      if (!fileData) {
        return res.status(400).json({ message: "File data is required" });
      }

      // Calcular tamanho aproximado do arquivo (base64 é ~33% maior que o binário)
      const base64Data = fileData.includes(',') ? fileData.split(',')[1] : fileData;
      const fileSizeBytes = Math.ceil((base64Data.length * 3) / 4);
      const fileSizeMB = fileSizeBytes / (1024 * 1024);

      console.log(`[send-media-base64] File: ${fileName}, Type: ${mimeType}, Size: ${fileSizeMB.toFixed(2)}MB`);

      // Limites de tamanho por tipo de mídia
      const MAX_VIDEO_SIZE_MB = 16; // WhatsApp limita vídeos a ~16MB
      const MAX_IMAGE_SIZE_MB = 16;
      const MAX_DOCUMENT_SIZE_MB = 100;

      if (mimeType?.startsWith('video/') && fileSizeMB > MAX_VIDEO_SIZE_MB) {
        return res.status(400).json({ 
          message: `Vídeo muito grande (${fileSizeMB.toFixed(1)}MB). O limite é ${MAX_VIDEO_SIZE_MB}MB para WhatsApp.` 
        });
      }

      if (mimeType?.startsWith('image/') && fileSizeMB > MAX_IMAGE_SIZE_MB) {
        return res.status(400).json({ 
          message: `Imagem muito grande (${fileSizeMB.toFixed(1)}MB). O limite é ${MAX_IMAGE_SIZE_MB}MB.` 
        });
      }

      if (fileSizeMB > MAX_DOCUMENT_SIZE_MB) {
        return res.status(400).json({ 
          message: `Arquivo muito grande (${fileSizeMB.toFixed(1)}MB). O limite é ${MAX_DOCUMENT_SIZE_MB}MB.` 
        });
      }

      // Verificar propriedade da conversa
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        return res.status(403).json({ message: "Forbidden" });
      }

      // Determinar tipo de mídia
      const detectedType = mediaType || (
        mimeType?.startsWith('image/') ? 'image' :
        mimeType?.startsWith('video/') ? 'video' :
        mimeType?.startsWith('audio/') ? 'audio' : 'document'
      );

      // Para áudio, converter para OGG/Opus (WhatsApp requer este formato para PTT)
      let finalFileData = fileData;
      let finalMimeType = mimeType || 'application/octet-stream';
      
      if (detectedType === 'audio') {
        console.log(`[send-media-base64] 🎵 Audio detected, converting to OGG/Opus...`);
        const { convertToWhatsAppAudio } = await import("./audioConverter");
        const converted = await convertToWhatsAppAudio(fileData, mimeType || 'audio/mpeg');
        finalFileData = converted.data;
        finalMimeType = converted.mimeType;
        console.log(`[send-media-base64] ✅ Audio converted to: ${converted.mimeType}`);
      }

      // Enviar via WhatsApp
      const { sendUserMediaMessage } = await import("./whatsapp");
      await sendUserMediaMessage(userId, id, {
        type: detectedType,
        data: finalFileData,
        mimetype: finalMimeType,
        filename: fileName || 'file',
        caption: caption || undefined,
        ptt: detectedType === 'audio', // Enviar como PTT se for áudio
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending user media (base64):", error);
      res.status(500).json({ message: error.message || "Failed to send media" });
    }
  });

  // POST - Enviar áudio gravado pelo usuário (base64)
  app.post("/api/conversations/:id/send-audio", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { id } = req.params;
      const { audioData, duration, mimeType } = req.body;

      console.log('[send-audio] 🎤 Request received for conversation:', id);
      console.log('[send-audio] 📊 Data size:', audioData?.length || 0, 'chars, mimeType:', mimeType, 'duration:', duration);

      if (!audioData) {
        console.log('[send-audio] ❌ No audio data provided');
        return res.status(400).json({ message: "Audio data is required" });
      }

      // Converter áudio para OGG/Opus se necessário (WhatsApp requer este formato para PTT)
      const { convertToWhatsAppAudio } = await import("./audioConverter");
      const converted = await convertToWhatsAppAudio(audioData, mimeType || 'audio/webm');
      console.log('[send-audio] 🔄 Converted audio mimeType:', converted.mimeType);

      // Verificar propriedade da conversa
      const conversation = await storage.getConversation(id);
      if (!conversation) {
        console.log('[send-audio] ❌ Conversation not found:', id);
        return res.status(404).json({ message: "Conversation not found" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection || conversation.connectionId !== connection.id) {
        console.log('[send-audio] ❌ Forbidden - connection mismatch');
        return res.status(403).json({ message: "Forbidden" });
      }

      // Usar áudio convertido (já processado acima)
      console.log('[send-audio] 🎵 Sending converted audio, mimeType:', converted.mimeType);

      // Enviar via WhatsApp
      const { sendUserMediaMessage } = await import("./whatsapp");
      await sendUserMediaMessage(userId, id, {
        type: 'audio',
        data: converted.data,
        mimetype: converted.mimeType,
        ptt: true, // Push to talk (nota de voz)
        seconds: duration || 0,
      });

      console.log('[send-audio] ✅ Audio sent successfully!');
      res.json({ success: true });
    } catch (error: any) {
      console.error("[send-audio] ❌ Error sending user audio:", error);
      res.status(500).json({ message: error.message || "Failed to send audio" });
    }
  });

  // ==================== AI MESSAGE GENERATOR ====================

  // POST - Gerar mensagem com IA
  app.post("/api/admin/ai/generate-message", isAdmin, async (req: any, res) => {
    try {
      const { prompt, context } = req.body;

      if (!prompt) {
        return res.status(400).json({ message: "Prompt is required" });
      }

      const { generateWithMistral } = await import("./mistralClient");
      
      let systemPrompt = `Você é um assistente que ajuda a criar mensagens para WhatsApp.
Crie uma mensagem profissional, amigável e natural baseada na instrução do usuário.
Responda APENAS com a mensagem pronta, sem explicações adicionais.
A mensagem deve ser adequada para WhatsApp (informal mas profissional).
Use emojis com moderação quando apropriado.`;

      if (context?.contactName) {
        systemPrompt += `\n\nO nome do cliente é: ${context.contactName}`;
      }

      if (context?.lastMessages && context.lastMessages.length > 0) {
        systemPrompt += `\n\nÚltimas mensagens da conversa para contexto:\n${context.lastMessages.slice(-5).join('\n')}`;
      }

      const result = await generateWithMistral(systemPrompt, prompt);

      res.json({ message: result.trim() });
    } catch (error) {
      console.error("Error generating AI message:", error);
      res.status(500).json({ message: "Failed to generate message" });
    }
  });

  // ==================== ADMIN MEDIA SEND ====================

  // POST - Enviar mídia para conversa (áudio, imagem, vídeo, documento)
  app.post("/api/admin/conversations/:id/send-media", isAdmin, upload.single('file'), async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { caption, mediaType } = req.body;
      const file = req.file;

      if (!file) {
        return res.status(400).json({ message: "File is required" });
      }

      const conversation = await storage.getAdminConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Upload para storage (base64)
      const base64Data = `data:${file.mimetype};base64,${file.buffer.toString('base64')}`;

      // Determinar tipo de mídia
      const detectedType = mediaType || (
        file.mimetype.startsWith('image/') ? 'image' :
        file.mimetype.startsWith('video/') ? 'video' :
        file.mimetype.startsWith('audio/') ? 'audio' : 'document'
      );

      // Enviar via WhatsApp
      const { sendAdminMediaMessage } = await import("./whatsapp");
      await sendAdminMediaMessage(adminId, id, {
        type: detectedType,
        data: base64Data,
        mimetype: file.mimetype,
        filename: file.originalname,
        caption: caption || undefined,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending media:", error);
      res.status(500).json({ message: error.message || "Failed to send media" });
    }
  });

  // POST - Enviar áudio gravado (base64)
  app.post("/api/admin/conversations/:id/send-audio", isAdmin, async (req: any, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const { id } = req.params;
      const { audioData, duration } = req.body;

      if (!audioData) {
        return res.status(400).json({ message: "Audio data is required" });
      }

      const conversation = await storage.getAdminConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }

      // Enviar via WhatsApp
      const { sendAdminMediaMessage } = await import("./whatsapp");
      await sendAdminMediaMessage(adminId, id, {
        type: 'audio',
        data: audioData,
        mimetype: 'audio/ogg; codecs=opus',
        ptt: true, // Push to talk (nota de voz)
        seconds: duration || 0,
      });

      res.json({ success: true });
    } catch (error: any) {
      console.error("Error sending audio:", error);
      res.status(500).json({ message: error.message || "Failed to send audio" });
    }
  });

  // ==================== DEV ENDPOINTS ====================
  
  // POST - Atualizar prompt do agente com instruções completas do sistema
  app.post("/api/dev/update-agent-prompt", isAdmin, async (req: any, res) => {
    try {
      const completeSystemPrompt = `Você é o Rodrigo, atendente humano da AgenteZap. Você NÃO é uma IA/robô, você é um humano real.

══════════════════════════════════════════════════════════════════
                    SOBRE A AGENTEZAP
══════════════════════════════════════════════════════════════════

A AgenteZap é uma plataforma de automação de WhatsApp com Inteligência Artificial que permite:
- Criar agentes de IA personalizados que atendem clientes 24/7
- Automatizar respostas no WhatsApp com IA conversacional
- Configurar instruções personalizadas para cada negócio
- Integrar com o WhatsApp do cliente via QR Code ou código de pareamento

══════════════════════════════════════════════════════════════════
                    PLANOS E PREÇOS
══════════════════════════════════════════════════════════════════

PLANO ÚNICO: R$ 99/mês
- Conversas ilimitadas
- 1 agente de IA personalizado
- Suporte via WhatsApp
- Acesso ao painel de controle
- Histórico de conversas
- Estatísticas de atendimento
- 24 horas de trial grátis para testar

FORMAS DE PAGAMENTO:
- PIX (único método aceito)
- Chave PIX: rodrigoconexao128@gmail.com
- Valor: R$ 99,00

══════════════════════════════════════════════════════════════════
                    FUNCIONALIDADES DO SISTEMA
══════════════════════════════════════════════════════════════════

1. PAINEL DO CLIENTE (/dashboard):
   - Ver estatísticas de conversas
   - Acessar histórico de mensagens
   - Configurar agente IA
   - Gerenciar conexão WhatsApp

2. CONEXÃO WHATSAPP (/conexao):
   - QR Code: Escanear com o WhatsApp Web do celular
   - Código de Pareamento: Para vincular sem QR Code
   - O cliente informa o número e recebe um código de 8 dígitos
   - Conecta o número dele ao nosso sistema

3. CONFIGURAÇÃO DO AGENTE (/agente):
   - Nome do Agente: Como ele se apresentará
   - Descrição da Empresa: O que a empresa faz
   - Função do Agente: Vendedor, suporte, etc
   - Instruções Detalhadas: Como deve atender

4. CONVERSAS (/conversas):
   - Ver todas as conversas em tempo real
   - Ler mensagens recebidas e enviadas
   - Pausar IA e assumir manualmente
   - Retomar IA quando quiser

══════════════════════════════════════════════════════════════════
                    COMO VOCÊ DEVE ATENDER
══════════════════════════════════════════════════════════════════

ESTILO DE COMUNICAÇÃO:
- Seja natural, simpático e profissional
- Use linguagem informal mas respeitosa (você, não você)
- Responda de forma curta e objetiva (2-5 linhas por vez)
- NÃO use formatação markdown (sem ** ou ## ou listas)
- Use emojis com moderação (1-2 por mensagem no máximo)
- NUNCA diga que é uma IA ou robô - você é o Rodrigo, humano real

REGRAS CRÍTICAS:
1. Se o cliente já tem conta (número cadastrado), NÃO peça email novamente
2. Verifique sempre o contexto antes de pedir informações
3. Seja proativo em ajudar com problemas
4. Se não souber algo, diga que vai verificar

══════════════════════════════════════════════════════════════════
                    FLUXO DE ATENDIMENTO
══════════════════════════════════════════════════════════════════

NOVO CLIENTE (sem conta):
1. Cumprimentar: "Oi! Aqui é o Rodrigo da AgenteZap 👋"
2. Perguntar interesse: "Como posso te ajudar?"
3. Explicar o serviço: IA que atende no WhatsApp 24/7
4. Coletar email para criar conta
5. Ajudar a configurar o agente (nome, empresa, função, instruções)
6. Explicar as opções de conexão (QR Code ou código de pareamento)
7. Falar sobre trial de 24h e plano de R$ 99/mês
8. Enviar PIX quando cliente quiser assinar

CLIENTE EXISTENTE (já tem conta):
- Verificar se há algum problema (conexão caiu, precisa reconectar)
- Ajudar a alterar configurações do agente
- Processar renovação de pagamento
- Tirar dúvidas sobre funcionamento
- NÃO pedir email novamente - já está cadastrado!

PROBLEMAS COMUNS:
- "WhatsApp desconectou": Pedir para acessar /conexao e reconectar
- "Agente não responde": Verificar se conexão está ativa
- "Quero mudar instruções": Acessar /agente e editar
- "Trial acabou": Explicar que precisa pagar R$ 99

══════════════════════════════════════════════════════════════════
                    INFORMAÇÕES TÉCNICAS
══════════════════════════════════════════════════════════════════

SITE: https://agentezap.online
- /login - Entrar na conta
- /cadastro - Criar conta nova
- /dashboard - Painel principal
- /conexao - Conectar WhatsApp
- /agente - Configurar IA
- /conversas - Ver mensagens
- /assinatura - Ver plano

SUPORTE:
- WhatsApp do dono: (17) 99195-6944
- Email: rodrigoconexao128@gmail.com

LEMBRE-SE: Você é o Rodrigo, atendente humano. Seja natural e prestativo!`;

      // Atualizar no banco
      await storage.updateSystemConfig("admin_agent_prompt", completeSystemPrompt);
      
      console.log("[DEV] Prompt do agente atualizado com instruções completas do sistema");
      
      res.json({ 
        success: true, 
        message: "Prompt do agente atualizado com sucesso!",
        promptLength: completeSystemPrompt.length
      });
    } catch (error) {
      console.error("Error updating agent prompt:", error);
      res.status(500).json({ message: "Failed to update agent prompt" });
    }
  });

  // ==================== CLIENT SELF-SERVICE ROUTES ====================
  
  // POST - Cliente solicita pairing code (página /conexao)
  app.post("/api/whatsapp/pairing-code", isAuthenticated, async (req: any, res) => {
    try {
      // 🛡️ MODO DESENVOLVIMENTO: Bloquear pairing code para proteger produção
      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
        console.log(`⚠️ [DEV MODE] Bloqueando geração de pairing code (proteção de produção)`);
        return res.status(403).json({ 
          success: false, 
          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',
          devMode: true 
        });
      }
      
      const userId = getUserId(req);
      const { phoneNumber } = req.body;

      if (!phoneNumber) {
        return res.status(400).json({ message: "phoneNumber is required" });
      }

      const { requestClientPairingCode } = await import("./whatsapp");
      const code = await requestClientPairingCode(userId, phoneNumber);

      if (!code) {
        return res.status(500).json({ message: "Failed to generate pairing code" });
      }

      res.json({ success: true, code });
    } catch (error) {
      console.error("Error generating client pairing code:", error);
      res.status(500).json({ message: "Failed to generate pairing code" });
    }
  });

  // Exportar configuração do admin para uso no WhatsApp handler
  (app as any).getAdminAgentConfig = () => adminAgentConfig;
  (app as any).getAdminMediaLibrary = async () => await getAdminMediaList("admin");

  // ==================== TESTE API ROUTES (APENAS DEV) ====================
  
  if (process.env.NODE_ENV === "development") {
    const { 
      processAdminMessage, 
      getClientSession, 
      clearClientSession,
      generateFollowUpResponse 
    } = await import("./adminAgentService");
    
    // Health check
    app.get("/api/health", (req, res) => {
      res.json({ status: "ok", timestamp: new Date().toISOString() });
    });
    
    // Testar mensagem do admin agent
    app.post("/api/test/admin-message", async (req, res) => {
      try {
        const { phone, message, skipTrigger = true } = req.body;
        if (!phone || !message) {
          return res.status(400).json({ error: "phone and message required" });
        }
        
        // skipTrigger=true para testes (ignora trigger phrases)
        const result = await processAdminMessage(phone, message, undefined, undefined, skipTrigger);
        
        if (!result) {
          return res.json({ 
            response: null,
            skipped: true,
            reason: "No trigger phrase detected (normal behavior)"
          });
        }
        
        res.json({ 
          response: result.text,
          mediaActions: result.mediaActions,
          actions: result.actions
        });
      } catch (error: any) {
        console.error("[TEST] Error:", error);
        res.status(500).json({ error: error.message });
      }
    });
    
    // Limpar sessão de cliente
    app.post("/api/test/clear-session", async (req, res) => {
      try {
        const { phone } = req.body;
        if (!phone) {
          return res.status(400).json({ error: "phone required" });
        }
        
        const cleared = clearClientSession(phone);
        res.json({ success: true, existed: cleared });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Obter sessão de cliente
    app.get("/api/test/session/:phone", async (req, res) => {
      try {
        const { phone } = req.params;
        const session = getClientSession(phone);
        
        if (!session) {
          return res.json({ exists: false });
        }
        
        res.json({
          exists: true,
          id: session.id,
          phoneNumber: session.phoneNumber,
          flowState: session.flowState,
          agentConfig: session.agentConfig,
          userId: session.userId,
          email: session.email,
          lastInteraction: session.lastInteraction,
          historyLength: session.conversationHistory.length
        });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    // Testar follow-up
    app.post("/api/test/followup", async (req, res) => {
      try {
        const { phone, context } = req.body;
        if (!phone) {
          return res.status(400).json({ error: "phone required" });
        }
        
        const response = await generateFollowUpResponse(phone, context || {
          type: 'no_response',
          lastMessage: 'ofereceu teste',
          minutesSinceLastInteraction: 60
        });
        
        res.json({ response });
      } catch (error: any) {
        res.status(500).json({ error: error.message });
      }
    });
    
    console.log("✅ [DEV] Rotas de teste habilitadas: /api/test/*");
  }

  // ==================== PÁGINA DE TESTE DO AGENTE (PÚBLICA) ====================
  
  /**
   * Endpoint para testar o agente via interface web
   * POST /api/test-agent/message
   * Não requer autenticação - é para clientes testarem SEU AGENTE
   */
  app.post("/api/test-agent/message", async (req: any, res) => {
    try {
      const { handleTestAgentMessage } = await import("./testAgentService");
      const { getTestToken, processAdminMessage } = await import("./adminAgentService");
      const { getMistralClient } = await import("./mistralClient");

      const { message, token, history, userId, sentMedias } = req.body;

      const result = await handleTestAgentMessage(
        { message, token, history, userId, sentMedias }, // 🆕 Passando sentMedias
        {
          getTestToken,
          getAgentConfig: (id) => storage.getAgentConfig(id),
          getMistralClient,
          processAdminMessage,
          getAgentMediaLibrary,
          generateMediaPromptBlock,
          parseMistralResponse,
        }
      );

      res.json({
        response: result.response,
        mediaActions: result.mediaActions,
      });
    } catch (error: any) {
      console.error("[TEST-AGENT] Erro:", error);
      res.status(500).json({ 
        error: error.message,
        response: "Ops, houve um erro técnico. Por favor, tente novamente."
      });
    }
  });
  
  /**
   * Obter informações do agente para a página de teste
   * GET /api/test-agent/info/:token
   */
  app.get("/api/test-agent/info/:token", async (req: any, res) => {
    try {
      const { token } = req.params;
      
      // Buscar token de teste gerado pelo adminAgentService (agora persiste no Supabase)
      const { getTestToken } = await import("./adminAgentService");
      const testToken = await getTestToken(token);
      
      if (testToken) {
        // Token válido - retornar info do agente do cliente
        return res.json({
          agentName: testToken.agentName,
          company: testToken.company,
          userId: testToken.userId,
          description: `Agente de ${testToken.company}`,
        });
      }
      
      // Token não encontrado ou expirado - retornar demo (Rodrigo)
      res.json({
        agentName: "Rodrigo",
        company: "AgenteZap",
        description: "Agente de vendas inteligente (demo)",
        isDemo: true,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Gerar link de teste único para um cliente
   * POST /api/admin/test-link/generate (apenas admin)
   */
  app.post("/api/admin/test-link/generate", isAdmin, async (req: any, res) => {
    try {
      const { phone, agentName, company } = req.body;
      
      // Gerar token único
      const crypto = await import("crypto");
      const token = crypto.randomBytes(16).toString("hex");
      
      // Salvar configuração do link (em memória por enquanto)
      // TODO: Persistir no banco
      const testLink = {
        token,
        phone,
        agentName: agentName || "Rodrigo",
        company: company || "AgenteZap",
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
      };
      
      res.json({
        success: true,
        token,
        link: `/test/${token}`,
        fullLink: `${req.protocol}://${req.get('host')}/test/${token}`,
        expiresAt: testLink.expiresAt,
      });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ==================== FOLLOW-UP TOGGLE ====================
  
  /**
   * Ativar/Desativar follow-up para uma conversa específica
   * POST /api/admin/conversations/:id/followup-toggle
   */
  app.post("/api/admin/conversations/:id/followup-toggle", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { active } = req.body;
      
      if (active === undefined) {
        return res.status(400).json({ message: "active boolean is required" });
      }
      
      const conversation = await storage.getAdminConversation(id);
      if (!conversation) {
        return res.status(404).json({ message: "Conversation not found" });
      }
      
      // Atualizar no banco
      await storage.updateAdminConversation(id, { 
        followupActive: active,
        // Se desativar, limpa a data. Se ativar, agenda para 10 min (reset)
        nextFollowupAt: active ? new Date(Date.now() + 10 * 60 * 1000) : null,
        followupStage: active ? 0 : conversation.followupStage
      });
      
      console.log(`🔄 [ADMIN] Follow-up ${active ? 'ATIVADO' : 'DESATIVADO'} para conversa ${id}`);
      
      res.json({ success: true, active });
    } catch (error: any) {
      console.error("Error toggling follow-up:", error);
      res.status(500).json({ message: "Failed to toggle follow-up" });
    }
  });

  // ==================== CALENDÁRIO DE FOLLOW-UPS ====================
  
  /**
   * Obter logs de follow-ups (enviados/falhados)
   * GET /api/admin/calendar/logs?status=sent|failed
   */
  app.get("/api/admin/calendar/logs", isAdmin, async (req: any, res) => {
    try {
      const { status } = req.query;
      const { followUpService } = await import("./followUpService");
      const logs = await followUpService.getFollowUpLogs(status as string);
      res.json({ logs });
    } catch (error: any) {
      console.error("Error fetching calendar logs:", error);
      res.status(500).json({ error: error.message });
    }
  });

  /**
   * Obter todos os eventos do calendário (follow-ups + agendamentos)
   * GET /api/admin/calendar/events
   */
  app.get("/api/admin/calendar/events", isAdmin, async (req: any, res) => {
    try {
      const { followUpService } = await import("./followUpService");
      const events = await followUpService.getCalendarEvents();
      res.json({ events });
    } catch (error: any) {
      console.error("Error fetching calendar events:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Obter estatísticas de follow-ups
   * GET /api/admin/calendar/stats
   */
  app.get("/api/admin/calendar/stats", isAdmin, async (req: any, res) => {
    try {
      const { followUpService } = await import("./followUpService");
      const stats = await followUpService.getFollowUpStats();
      // Mock business hours for now if not implemented
      const businessHours = { start: 8, end: 18, workDays: [1,2,3,4,5], isCurrentlyOpen: true, nextOpenTime: null };
      res.json({ stats, businessHours });
    } catch (error: any) {
      console.error("Error fetching calendar stats:", error);
      res.status(500).json({ error: error.message });
    }
  });
  
  /**
   * Cancelar um follow-up ou agendamento
   * DELETE /api/admin/calendar/events/:id
   */
  app.delete("/api/admin/calendar/events/:id", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const { phone } = req.query;
      
      console.log(`🗑️ [API] Solicitação de cancelamento para ID: ${id}, Phone: ${phone}`);

      if (!phone) {
        return res.status(400).json({ error: "phone query param required" });
      }
      
      const { followUpService } = await import("./followUpService");
      
      // Tentar cancelar como follow-up
      await followUpService.disableFollowUp(id, "Cancelado manualmente pelo calendário");
      
      console.log(`✅ [API] Cancelamento processado para ID: ${id}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("Error cancelling event:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Rota de teste para configurar fluxo de mídia
  app.use((await import("./testMediaRoute")).default);

  // ====================================================================
  // 🎙️ ROTA DE TESTE - TTS MULTI-PROVIDER (PÚBLICA)
  // ====================================================================
  app.post("/api/test-tts", async (req, res) => {
    try {
      const { text, provider, voice, speed } = req.body;

      if (!text) {
        return res.status(400).json({ error: "Texto é obrigatório" });
      }

      console.log(`🎙️ [TEST-TTS] Gerando áudio: "${text.substring(0, 50)}..."`);
      console.log(`🎙️ [TEST-TTS] Provider: ${provider || 'auto'}, Voice: ${voice || 'default'}`);

      const { generateTTS } = await import("./ttsService");

      // Gerar áudio usando o serviço multi-provider
      const result = await generateTTS({
        text,
        provider: provider || 'auto',
        voice,
        speed: speed || 1.0,
      });

      // Retornar áudio como resposta
      const contentType = result.format === 'wav' ? 'audio/wav' : 'audio/mpeg';
      
      res.set({
        'Content-Type': contentType,
        'Content-Length': result.audio.length,
        'Content-Disposition': `inline; filename="tts-test.${result.format}"`,
        'X-TTS-Provider': result.provider,
        'X-TTS-Format': result.format,
      });

      res.send(result.audio);

      console.log(`✅ [TEST-TTS] Áudio enviado: ${result.audio.length} bytes (${result.provider})`);
    } catch (error: any) {
      console.error("❌ [TEST-TTS] Erro:", error);
      res.status(500).json({ 
        error: "Erro ao gerar áudio",
        details: error.message 
      });
    }
  });

  return httpServer;
}
