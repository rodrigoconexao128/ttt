import type { Express, Request } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from "multer";
import { storage } from "./storage";
import { setupAuth, isAuthenticated, getSession, supabase } from "./supabaseAuth";

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
  sendMessage as whatsappSendMessage,
  addWebSocketClient,
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
} from "./mediaService";
import { z } from "zod";

// Helper to get userId from authenticated request
function getUserId(req: any): string {
  return req.user.claims.sub;
}

export async function registerRoutes(app: Express): Promise<Server> {
  // Auth middleware
  await setupAuth(app);

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

  // Update user password (Replit Auth users don't have passwords, so this is a placeholder)
  app.put("/api/user/password", isAuthenticated, async (req: any, res) => {
    try {
      // Since we're using Replit Auth (OIDC), password management is handled by Replit
      // This endpoint is here for future compatibility or if switching to custom auth
      res.status(400).json({ 
        message: "A autenticação é gerenciada pelo Replit. Use a página de configurações do Replit para alterar sua senha." 
      });
    } catch (error) {
      console.error("Error updating password:", error);
      res.status(500).json({ message: "Failed to update password" });
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
      res.json({ success: true });
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

      const config = await storage.upsertAgentConfig(userId, result.data);
      res.json(config);
    } catch (error) {
      console.error("Error updating agent config:", error);
      res.status(500).json({ message: "Failed to update agent config" });
    }
  });

  app.post("/api/agent/test", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const schema = z.object({ message: z.string() });
      const result = schema.safeParse(req.body);

      if (!result.success) {
        return res.status(400).json({ message: "Invalid request" });
      }

      const testResult = await testAgentResponse(userId, result.data.message);
      res.json({ 
        response: testResult.text,
        mediaActions: testResult.mediaActions || []
      });
    } catch (error: any) {
      console.error("Error testing agent:", error);
      res.status(500).json({ message: error.message || "Failed to test agent" });
    }
  });

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

      const result = agentMediaSchema.partial().safeParse(req.body);

      if (!result.success) {
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
      }

      res.json({ success: true, isDisabled: disable });
    } catch (error) {
      console.error("Error toggling agent:", error);
      res.status(500).json({ message: "Failed to toggle agent" });
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

  // Create subscription
  app.post("/api/subscriptions/create", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const { planId } = req.body;

      if (!planId) {
        return res.status(400).json({ message: "Plan ID is required" });
      }

      // Check if plan exists and is active
      const plan = await storage.getPlan(planId);
      if (!plan || !plan.ativo) {
        return res.status(404).json({ message: "Plan not found or inactive" });
      }

      // Create subscription with pending status
      const subscription = await storage.createSubscription({
        userId,
        planId,
        status: "pending",
        dataInicio: new Date(),
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

      // Check if payment already exists
      const existingPayment = await storage.getPaymentBySubscriptionId(subscriptionId);

      // Always (re)gerar o PIX quando em pending, para garantir payload válido após correções
      const { pixCode, pixQrCode } = await generatePixQRCode({
        planNome: subscription.plan.nome,
        valor: Number(subscription.plan.valor),
        subscriptionId,
      });

      if (existingPayment && existingPayment.status === "pending") {
        const updated = await storage.updatePayment(existingPayment.id, {
          pixCode,
          pixQrCode,
        });
        return res.json(updated);
      }

      // Create payment record
      const payment = await storage.createPayment({
        subscriptionId,
        valor: subscription.plan.valor,
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
      const payments = await storage.getPendingPayments();
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
  // Get all users
  app.get("/api/admin/users", isAdmin, async (_req, res) => {
    try {
      const users = await storage.getAllUsers();
      res.json(users);
    } catch (error) {
      console.error("Error fetching users:", error);
      res.status(500).json({ message: "Failed to fetch users" });
    }
  });

  // Get admin stats
  app.get("/api/admin/stats", isAdmin, async (_req, res) => {
    try {
      const [users, totalRevenue, activeSubscriptions] = await Promise.all([
        storage.getAllUsers(),
        storage.getTotalRevenue(),
        storage.getActiveSubscriptionsCount(),
      ]);

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
      const [mistralKey, pixKey] = await Promise.all([
        storage.getSystemConfig("mistral_api_key"),
        storage.getSystemConfig("pix_key"),
      ]);
      res.json({
        mistral_api_key: mistralKey?.valor || "",
        pix_key: pixKey?.valor || "",
      });
    } catch (error) {
      console.error("Error fetching config:", error);
      res.status(500).json({ message: "Failed to fetch config" });
    }
  });

  // Update system config
  app.put("/api/admin/config", isAdmin, async (req, res) => {
    try {
      const { mistral_api_key, pix_key } = req.body;

      if (mistral_api_key !== undefined) {
        await storage.updateSystemConfig("mistral_api_key", mistral_api_key);
      }

      if (pix_key !== undefined) {
        await storage.updateSystemConfig("pix_key", pix_key);
      }

      res.json({ success: true });
    } catch (error) {
      console.error("Error updating config:", error);
      res.status(500).json({ message: "Failed to update config" });
    }
  });

  // ==================== ADMIN WHATSAPP ROUTES ====================
  // Get admin WhatsApp connection status
  app.get("/api/admin/whatsapp/connection", isAdmin, async (req, res) => {
    try {
      const adminId = (req.session as any)?.adminId;
      const connection = await storage.getAdminWhatsappConnection(adminId);
      res.json(connection || { isConnected: false });
    } catch (error) {
      console.error("Error fetching admin WhatsApp connection:", error);
      res.status(500).json({ message: "Failed to fetch connection" });
    }
  });

  // Connect admin WhatsApp
  app.post("/api/admin/whatsapp/connect", isAdmin, async (req, res) => {
    try {
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
      const adminId = (req.session as any)?.adminId;
      const { disconnectAdminWhatsApp } = await import("./whatsapp");
      await disconnectAdminWhatsApp(adminId);
      res.json({ success: true });
    } catch (error) {
      console.error("Error disconnecting admin WhatsApp:", error);
      res.status(500).json({ message: "Failed to disconnect WhatsApp" });
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
      socket.destroy();
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
        const { addAdminWebSocketClient } = require("./whatsapp");
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

  return httpServer;
}
