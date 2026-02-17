import type { Express, Request, Response, NextFunction } from "express";

import { createServer, type Server } from "http";

import { WebSocketServer, WebSocket } from "ws";

import multer from "multer";

import * as XLSX from "xlsx";

import { storage, dbCircuitBreaker, memoryCache } from "./storage";

import { followUpService } from "./followUpService";

import { userFollowUpService } from "./userFollowUpService";

import { registerFollowUpRoutes } from "./routes_user_followup";

import { registerAudioConfigRoutes } from "./routes_audio_config";

import { registerChatbotFlowRoutes } from "./routes_chatbot_flow";

import { registerSalonRoutes } from "./routes_salon";
import { registerTicketRoutes } from "./tickets/tickets.routes";
import { registerSectorRoutes } from "./sectors/sectors.routes";

import { setupAuth, isAuthenticated, getSession, supabase } from "./supabaseAuth";

import { withRetry, db } from "./db";

import { eq, and, gte, desc, inArray, sql } from "drizzle-orm";

import { subscriptions, paymentHistory, conversations as conversationsTable, plans, resellers, resellerClients, users, resellerInvoiceItems as resellerInvoiceItemsTable, resellerInvoices as resellerInvoicesTable, websiteImports, aiAgentConfig } from "@shared/schema";

import { resellerService } from "./resellerService";

import { scrapeWebsite, validateUrl, formatContextForAgent, type WebsiteScrapingResult } from "./websiteScraperService";

import { startBackgroundSync, getSyncStatus, getSyncedContactsFromDB, hasSyncedBefore } from "./contactSyncService";

import { startFullContactSync, getFullSyncStatus, scheduleFullSyncForAllClients, startDailySyncCron, getQueueStats } from "./fullContactSyncService";

import { getAccessEntitlement } from "./accessEntitlement";



// ============================================

// CACHE PARA BUCKETS DE STORAGE

// ============================================

let agentMediaBucketChecked = false;



// ============================================

// SISTEMA DE MANUTENÇÃO E FALLBACK

// ============================================

let maintenanceMode = false;

let maintenanceMessage = "Estamos realizando uma manutenção rápida. Voltamos em instantes!";



export function setMaintenanceMode(enabled: boolean, message?: string): void {

  maintenanceMode = enabled;

  if (message) maintenanceMessage = message;

  console.log(`?? [MAINTENANCE] Modo de manutenção: ${enabled ? 'ATIVADO' : 'DESATIVADO'}`);

}



export function isInMaintenanceMode(): boolean {

  return maintenanceMode || dbCircuitBreaker.isOpen();

}



// Middleware de manutenção - retorna página amigável quando sistema está instável

function maintenanceMiddleware(req: Request, res: Response, next: NextFunction): void {

  // Sempre permitir health check

  if (req.path === '/api/health' || req.path === '/api/status') {

    return next();

  }



  // Se em manutenção ou circuit breaker aberto

  if (isInMaintenanceMode()) {

    // Para APIs, retornar JSON

    if (req.path.startsWith('/api/')) {

      res.status(503).json({

        error: 'maintenance',

        message: dbCircuitBreaker.isOpen() 

          ? 'Sistema temporariamente indisponível. Tentando reconectar automaticamente...'

          : maintenanceMessage,

        retryAfter: 30,

      });

      return;

    }

    

    // Para páginas, retornar HTML de manutenção

    res.status(503).send(getMaintenanceHTML());

    return;

  }



  next();

}



function getMaintenanceHTML(): string {

  return `<!DOCTYPE html>

<html lang="pt-BR">

<head>

  <meta charset="UTF-8">

  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>Manutenção - AgenteZap</title>

  <style>

    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {

      min-height: 100vh;

      display: flex;

      align-items: center;

      justify-content: center;

      background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);

      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;

      color: white;

    }

    .container {

      text-align: center;

      padding: 2rem;

      max-width: 500px;

    }

    .icon {

      font-size: 4rem;

      margin-bottom: 1rem;

      animation: pulse 2s infinite;

    }

    @keyframes pulse {

      0%, 100% { transform: scale(1); }

      50% { transform: scale(1.1); }

    }

    h1 {

      font-size: 1.8rem;

      margin-bottom: 1rem;

      color: #00d26a;

    }

    p {

      font-size: 1.1rem;

      opacity: 0.9;

      margin-bottom: 1.5rem;

      line-height: 1.6;

    }

    .status {

      display: inline-block;

      padding: 0.5rem 1rem;

      background: rgba(255,255,255,0.1);

      border-radius: 20px;

      font-size: 0.9rem;

    }

    .progress {

      width: 200px;

      height: 4px;

      background: rgba(255,255,255,0.2);

      border-radius: 2px;

      margin: 1.5rem auto;

      overflow: hidden;

    }

    .progress-bar {

      height: 100%;

      width: 30%;

      background: #00d26a;

      border-radius: 2px;

      animation: loading 1.5s infinite;

    }

    @keyframes loading {

      0% { transform: translateX(-100%); }

      100% { transform: translateX(400%); }

    }

  </style>

  <script>

    // Tentar recarregar a cada 30 segundos

    setTimeout(() => window.location.reload(), 30000);

  </script>

</head>

<body>

  <div class="container">

    <div class="icon">??</div>

    <h1>Estamos melhorando para você!</h1>

    <p>${maintenanceMessage}</p>

    <div class="progress"><div class="progress-bar"></div></div>

    <span class="status">?? Recarregando automaticamente...</span>

  </div>

</body>

</html>`;

}



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

  splitMessageHumanLike,

  connectionHealthCheck,

  startConnectionHealthCheck,

  stopConnectionHealthCheck,

  sendAdminNotification,

} from "./whatsapp";

import { messageQueueService } from "./messageQueueService";

import { 

  sendMessageSchema, 

  insertAiAgentConfigSchema,

  insertPlanSchema,

  insertSubscriptionSchema,

  insertPaymentSchema,

  agentMediaSchema,
  agentSchema,
  mediaFlowSchema,
  mediaFlowItemSchema,

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

  isGoogleCalendarConfigured,

  getGoogleAuthUrl,

  handleGoogleCallback,

  isGoogleCalendarConnected,

  getGoogleCalendarStatus,

  disconnectGoogleCalendar,

  syncAppointmentToCalendar,

  removeAppointmentFromCalendar,

  listCalendarEvents,

  checkCalendarAvailability,

} from "./googleCalendarService";

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

import { forceCleanup as forceMediaCleanup, getStorageStats } from "./mediaCleanupService";

import { invalidateLLMConfigCache, getCurrentProvider, getMistralQueueInfo, getMistralModelStatus } from "./llm";

import { z } from "zod";



// Helper to get userId from authenticated request

function getUserId(req: any): string {

  return req.user.claims.sub;

}



// Helper para mapear colunas automaticamente na importação de produtos

function autoMapColumns(headers: string[]): Record<string, number | null> {

  const mapping: Record<string, number | null> = {

    name: null,

    price: null,

    stock: null,

    description: null,

    category: null,

    link: null,

    sku: null,

    unit: null,

    is_active: null,

  };

  

  const patterns: Record<string, RegExp[]> = {

    name: [/nome|name|produto|product|descri[cç][aã]o|item|artigo/i],

    price: [/pre[cç]o|price|valor|value|venda|custo|cost/i],

    stock: [/estoque|stock|qtd|quantidade|qty|inventory|saldo/i],

    description: [/descri[cç][aã]o.*completa|detalhes?|details?|obs|observa/i],

    category: [/categor|tipo|type|grupo|group|classe|class|fam[ií]lia/i],

    link: [/link|url|site|website|web|imagem|image|foto|photo/i],

    sku: [/sku|c[oó]digo|code|ref|referencia|ean|barcode|id.*produto/i],

    unit: [/unid|unit|medida|measure|un\b|kg|g\b|ml|l\b/i],

    is_active: [/ativo|active|status|ativar|disponivel|visible/i],

  };

  

  headers.forEach((header, index) => {

    const normalizedHeader = String(header).toLowerCase().trim();

    

    for (const [field, regexps] of Object.entries(patterns)) {

      if (mapping[field] !== null) continue; // Já mapeado

      

      for (const regex of regexps) {

        if (regex.test(normalizedHeader)) {

          mapping[field] = index;

          break;

        }

      }

    }

  });

  

  // Se não encontrou nome, assume que é a primeira coluna com texto

  if (mapping.name === null && headers.length > 0) {

    mapping.name = 0;

  }

  

  // Se tem coluna de nome mas não tem preço, tenta a segunda coluna numérica

  if (mapping.price === null && headers.length > 1) {

    // Procura por coluna que parece ser preço (começa ou termina com número)

    for (let i = 1; i < headers.length; i++) {

      const h = String(headers[i]).toLowerCase();

      if (/\d|r\$|valor|preço|price/.test(h)) {

        mapping.price = i;

        break;

      }

    }

  }

  

  return mapping;

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

    restaurant: `${businessName} - Atendente de restaurante ???. Tom: simpático e objetivo.



REGRAS:

 Apresente cardápio quando pedirem

 Informe promoções do dia

 Pergunte endereço para delivery

 Confirme pedido antes de finalizar

 Informe tempo de entrega real



NÃO FAZER:

 Inventar preços ou itens

 Prometer entrega sem confirmar

 Dar opiniões sobre dietas`,



    store: `${businessName} - Atendente de loja. Tom: prestativo e paciente.



REGRAS:

 Apresente produtos e benefícios

 Informe disponibilidade de estoque

 Explique parcelamento e pagamento

 Ajude na escolha de tamanhos

 Informe política de troca



NÃO FAZER:

 Inventar preços ou estoque

 Forçar venda

 Prometer prazos sem confirmar`,



    clinic: `${businessName} - Atendente de clínica. Tom: empático e profissional.



REGRAS:

 Agende consultas e exames

 Informe especialidades

 Confirme convênios aceitos

 Envie localização

 Oriente preparo para exames



NÃO FAZER:

 Dar diagnósticos

 Prescrever medicamentos

 Orientar sobre sintomas`,



    salon: `${businessName} - Atendente de salão ??. Tom: animado e atencioso.



REGRAS:

 Agende horários disponíveis

 Apresente serviços e valores

 Pergunte sobre preferências

 Confirme agendamento 1 dia antes

 Sugira tratamentos complementares



NÃO FAZER:

 Agendar sem checar disponibilidade

 Prometer resultados impossíveis

 Criticar outros profissionais`,



    gym: `${businessName} - Atendente de academia ??. Tom: motivador e amigável.



REGRAS:

 Apresente planos e valores

 Agende aula experimental

 Informe horários e modalidades

 Motive o cliente a começar

 Explique estrutura da academia



NÃO FAZER:

 Prescrever dietas ou suplementos

 Prometer resultados em X dias

 Criticar condicionamento do cliente`,



    other: `${businessName} - Atendente virtual. Tom: profissional e objetivo.



REGRAS:

 Responda dúvidas sobre produtos/serviços

 Informe preços e condições

 Agende horários quando aplicável

 Encaminhe para humano se necessário



NÃO FAZER:

 Inventar informações

 Prometer o que não pode cumprir

 Ser agressivo em vendas`

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



  // ==================== HEALTH CHECK E STATUS ====================

  // Estes endpoints SEMPRE funcionam, mesmo em manutenção

  app.get("/api/health", async (req, res) => {

    const dbStatus = !dbCircuitBreaker.isOpen();

    const cacheStats = memoryCache.getStats();

    const antiBlockStats = messageQueueService.getStats();

    

    res.json({

      status: dbStatus ? 'healthy' : 'degraded',

      timestamp: new Date().toISOString(),

      database: {

        connected: dbStatus,

        circuitBreaker: dbCircuitBreaker.getState(),

      },

      cache: cacheStats,

      antiBlock: antiBlockStats,

      maintenance: maintenanceMode,

    });

  });



  app.get("/api/status", (req, res) => {

    res.json({

      operational: !isInMaintenanceMode(),

      maintenance: maintenanceMode,

      dbAvailable: !dbCircuitBreaker.isOpen(),

    });

  });



  // Aplicar middleware de manutenção APÓS os health checks

  app.use(maintenanceMiddleware);



  // ==================== FOLLOW-UP INTELIGENTE ROUTES ====================

  registerFollowUpRoutes(app);

  

  // ==================== AUDIO CONFIG (TTS) ROUTES ====================

  registerAudioConfigRoutes(app);

  

  // ==================== CHATBOT FLOW BUILDER ROUTES ====================

  registerChatbotFlowRoutes(app);

  // ==================== SALON ROUTES ====================

  registerSalonRoutes(app);

  // ==================== TICKETS/SUPPORT ROUTES ====================
  console.log("🎫 [DEBUG] About to call registerTicketRoutes...");
  try {
    registerTicketRoutes(app);
    console.log("✅ [DEBUG] registerTicketRoutes called successfully");
  } catch (e) {
    console.error("❌ [DEBUG] Error calling registerTicketRoutes:", e);
  }

  // ==================== SECTORS ROUTES ====================
  try {
    registerSectorRoutes(app);
  } catch (e) {
    console.error("❌ [DEBUG] Error calling registerSectorRoutes:", e);
  }



  // Iniciar serviço de follow-up dos usuários

  userFollowUpService.start();

  

  // Registrar callback para enviar mensagens de follow-up via WhatsApp

  userFollowUpService.registerCallback(async (userId, conversationId, phoneNumber, remoteJid, message, stage) => {

    try {

      console.log(`?? [FOLLOW-UP-CALLBACK] Enviando para ${phoneNumber} (estágio ${stage})`);

      // ?? FIX: Marcar mensagem de follow-up como isFromAgent para que a IA

      // saiba que foi ela quem enviou quando retomar a conversa após o cliente responder

      await whatsappSendMessage(userId, conversationId, message, { isFromAgent: true, source: "followup" });

      console.log(`? [FOLLOW-UP-CALLBACK] Mensagem enviada com sucesso para ${phoneNumber}`);

      return { success: true };

    } catch (error: any) {

      console.error(`? [FOLLOW-UP-CALLBACK] Erro ao enviar para ${phoneNumber}:`, error);

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

    

    if (adminId && adminRole) {

      res.json({ 

        authenticated: true,

        isAdmin: true,

        adminId,

        role: adminRole,

      });

    } else {

      res.json({ authenticated: false, isAdmin: false });

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

      // ??? MODO DESENVOLVIMENTO: Bloquear reconexões para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando reconexão forçada de usuário (proteção de produção)`);

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
      const devMode = process.env.SKIP_WHATSAPP_RESTORE === 'true' || process.env.DISABLE_WHATSAPP_PROCESSING === 'true';

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

      // ??? MODO DESENVOLVIMENTO: Bloquear reset para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando reset de sessão WhatsApp (proteção de produção)`);

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



  // -------------------------------------------------------------------------------

  // ??? SAFE MODE: Modo Seguro Anti-Bloqueio para Clientes

  // -------------------------------------------------------------------------------

  // Toggle Safe Mode para um usuário específico

  // Quando ativado, ao reconectar via QR Code, o sistema limpa:

  // 1. Fila de mensagens pendentes

  // 2. Follow-ups programados

  // 3. Começa do zero para evitar novo bloqueio

  app.post("/api/admin/users/:userId/safe-mode", isAdmin, async (req, res) => {

    try {

      const { userId } = req.params;

      const { enabled } = req.body;

      const adminSession = req.session as { admin?: { id: string; email: string } };

      

      console.log(`??? [SAFE MODE] Admin ${adminSession.admin?.email} alterando safe mode para user ${userId}: ${enabled}`);

      

      // Verificar se usuário existe

      const user = await storage.getUser(userId);

      if (!user) {

        return res.status(404).json({ success: false, message: "Usuário não encontrado" });

      }

      

      // Buscar conexão do usuário

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(404).json({ success: false, message: "Conexão WhatsApp não encontrada para este usuário" });

      }

      

      // Atualizar safe mode

      const updatedConnection = await storage.updateConnection(connection.id, {

        safeModeEnabled: enabled,

        safeModeActivatedAt: enabled ? new Date() : null,

        safeModeActivatedBy: enabled ? adminSession.admin?.id || 'admin' : null,

      });

      

      console.log(`??? [SAFE MODE] Safe mode ${enabled ? 'ATIVADO' : 'DESATIVADO'} para ${user.name || user.email}`);

      

      res.json({

        success: true,

        message: enabled 

          ? `Modo seguro ATIVADO para ${user.name || user.email}. Na próxima reconexão via QR Code, todas as filas e follow-ups serão zerados.`

          : `Modo seguro DESATIVADO para ${user.name || user.email}.`,

        safeModeEnabled: updatedConnection.safeModeEnabled,

        safeModeActivatedAt: updatedConnection.safeModeActivatedAt,

        safeModeLastCleanupAt: updatedConnection.safeModeLastCleanupAt,

      });

    } catch (error: any) {

      console.error(`??? [SAFE MODE] Erro ao alterar safe mode:`, error);

      res.status(500).json({ success: false, message: "Erro ao alterar modo seguro", error: error.message });

    }

  });



  // GET: Obter status do Safe Mode de um usuário

  app.get("/api/admin/users/:userId/safe-mode", isAdmin, async (req, res) => {

    try {

      const { userId } = req.params;

      

      const user = await storage.getUser(userId);

      if (!user) {

        return res.status(404).json({ success: false, message: "Usuário não encontrado" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(404).json({ 

          success: false, 

          message: "Conexão WhatsApp não encontrada",

          safeModeEnabled: false

        });

      }

      

      res.json({

        success: true,

        userId,

        userName: user.name,

        userEmail: user.email,

        safeModeEnabled: connection.safeModeEnabled,

        safeModeActivatedAt: connection.safeModeActivatedAt,

        safeModeActivatedBy: connection.safeModeActivatedBy,

        safeModeLastCleanupAt: connection.safeModeLastCleanupAt,

        isConnected: connection.isConnected,

      });

    } catch (error: any) {

      console.error(`??? [SAFE MODE] Erro ao buscar status:`, error);

      res.status(500).json({ success: false, message: "Erro ao buscar status do modo seguro", error: error.message });

    }

  });



  // Reconnect all WhatsApp sessions (force)

  app.post("/api/admin/connections/reconnect-all", isAdmin, async (req, res) => {

    try {

      // ??? MODO DESENVOLVIMENTO: Bloquear reconexões em massa para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando reconexão em massa (proteção de produção)`);

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



  // ?? Health Check Manual - Verificar e reconectar sessões problemáticas

  app.post("/api/admin/connections/health-check", isAdmin, async (req, res) => {

    try {

      // ??? MODO DESENVOLVIMENTO: Bloquear health check para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Health check bloqueado (proteção de produção)`);

        return res.status(403).json({ 

          success: false, 

          message: 'Health check desabilitado em modo desenvolvimento para proteger sessões em produção',

          devMode: true 

        });

      }

      

      console.log("[ADMIN] Executando health check manual...");

      await connectionHealthCheck();

      

      res.json({ 

        success: true, 

        message: 'Health check executado com sucesso. Veja os logs do servidor para detalhes.'

      });

    } catch (error: any) {

      console.error("[ADMIN] Erro no health check:", error);

      res.status(500).json({ message: "Erro no health check", error: error.message });

    }

  });



  // ?? Status detalhado de todas as conexões

  app.get("/api/admin/connections/status", isAdmin, async (req, res) => {

    try {

      const connections = await storage.getAllConnections();

      const { getSession } = await import("./whatsapp");

      

      const statusList = await Promise.all(connections.map(async (conn) => {

        const session = conn.userId ? getSession(conn.userId) : null;

        const hasActiveSocket = session?.socket?.user !== undefined;

        

        return {

          connectionId: conn.id,

          userId: conn.userId,

          phoneNumber: conn.phoneNumber,

          dbStatus: conn.isConnected ? 'connected' : 'disconnected',

          socketStatus: hasActiveSocket ? 'active' : 'inactive',

          isHealthy: conn.isConnected === hasActiveSocket,

          isZombie: conn.isConnected && !hasActiveSocket,

          updatedAt: conn.updatedAt,

        };

      }));

      

      const summary = {

        total: statusList.length,

        healthy: statusList.filter(s => s.isHealthy && s.dbStatus === 'connected').length,

        zombies: statusList.filter(s => s.isZombie).length,

        disconnected: statusList.filter(s => s.dbStatus === 'disconnected').length,

      };

      

      res.json({ summary, connections: statusList });

    } catch (error: any) {

      console.error("[ADMIN] Erro ao obter status das conexões:", error);

      res.status(500).json({ message: "Erro ao obter status", error: error.message });

    }

  });



  // ==================== ADMIN AGENTS E CONEXOES ====================
  app.get("/api/admin/agents", isAdmin, async (req, res) => {
    try {
      const agents = await storage.getAgents();
      res.json(agents);
    } catch (error) {
      console.error("[ADMIN] Erro ao listar agentes:", error);
      res.status(500).json({ message: "Erro ao listar agentes" });
    }
  });

  app.post("/api/admin/agents", isAdmin, async (req, res) => {
    try {
      const parsed = agentSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }
      const agent = await storage.createAgent(parsed.data);
      res.json(agent);
    } catch (error) {
      console.error("[ADMIN] Erro ao criar agente:", error);
      res.status(500).json({ message: "Erro ao criar agente" });
    }
  });

  app.put("/api/admin/agents/:id", isAdmin, async (req, res) => {
    try {
      const parsed = agentSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }
      const agent = await storage.updateAgent(req.params.id, parsed.data);
      res.json(agent);
    } catch (error) {
      console.error("[ADMIN] Erro ao atualizar agente:", error);
      res.status(500).json({ message: "Erro ao atualizar agente" });
    }
  });

  app.delete("/api/admin/agents/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteAgent(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[ADMIN] Erro ao excluir agente:", error);
      res.status(500).json({ message: "Erro ao excluir agente" });
    }
  });

  app.get("/api/admin/connections", isAdmin, async (req, res) => {
    try {
      const [connections, users, agents] = await Promise.all([
        storage.getAllConnections(),
        storage.getAllUsers(),
        storage.getAgents(),
      ]);

      const userMap = new Map(users.map((user) => [user.id, user]));
      const agentMap = new Map(agents.map((agent) => [agent.id, agent]));

      const payload = connections.map((connection) => ({
        ...connection,
        user: userMap.get(connection.userId) || null,
        agent: connection.agentId ? agentMap.get(connection.agentId) || null : null,
      }));

      res.json(payload);
    } catch (error) {
      console.error("[ADMIN] Erro ao listar conexoes:", error);
      res.status(500).json({ message: "Erro ao listar conexoes" });
    }
  });

  app.post("/api/admin/connections", isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string().min(1),
        agentId: z.string().min(1),
        phoneNumber: z.string().optional().nullable(),
        isConnected: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      const user = await storage.getUser(parsed.data.userId);
      if (!user) {
        return res.status(404).json({ message: "Usuario nao encontrado" });
      }

      const agent = await storage.getAgent(parsed.data.agentId);
      if (!agent) {
        return res.status(404).json({ message: "Agente nao encontrado" });
      }

      const connection = await storage.createConnection({
        userId: parsed.data.userId,
        agentId: parsed.data.agentId,
        phoneNumber: parsed.data.phoneNumber || null,
        isConnected: parsed.data.isConnected ?? false,
      });

      res.json(connection);
    } catch (error) {
      console.error("[ADMIN] Erro ao criar conexao:", error);
      res.status(500).json({ message: "Erro ao criar conexao" });
    }
  });

  app.put("/api/admin/connections/:id", isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        userId: z.string().optional(),
        agentId: z.string().optional(),
        phoneNumber: z.string().optional().nullable(),
        isConnected: z.boolean().optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      if (parsed.data.userId) {
        const user = await storage.getUser(parsed.data.userId);
        if (!user) {
          return res.status(404).json({ message: "Usuario nao encontrado" });
        }
      }

      if (parsed.data.agentId) {
        const agent = await storage.getAgent(parsed.data.agentId);
        if (!agent) {
          return res.status(404).json({ message: "Agente nao encontrado" });
        }
      }

      const connection = await storage.updateConnection(req.params.id, parsed.data);
      res.json(connection);
    } catch (error) {
      console.error("[ADMIN] Erro ao atualizar conexao:", error);
      res.status(500).json({ message: "Erro ao atualizar conexao" });
    }
  });

  app.delete("/api/admin/connections/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteConnection(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[ADMIN] Erro ao excluir conexao:", error);
      res.status(500).json({ message: "Erro ao excluir conexao" });
    }
  });

  // ==================== ADMIN MEDIA FLOWS ====================
  app.get("/api/admin/media-flows", isAdmin, async (req, res) => {
    try {
      const [flows, agents] = await Promise.all([
        storage.getMediaFlows(),
        storage.getAgents(),
      ]);
      const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
      const itemsByFlow = await Promise.all(
        flows.map((flow) => storage.getMediaFlowItems(flow.id))
      );
      const payload = flows.map((flow, index) => ({
        ...flow,
        agent: agentMap.get(flow.agentId) || null,
        items: itemsByFlow[index] || [],
      }));
      res.json(payload);
    } catch (error) {
      console.error("[ADMIN] Erro ao listar media flows:", error);
      res.status(500).json({ message: "Erro ao listar media flows" });
    }
  });

  app.post("/api/admin/media-flows", isAdmin, async (req, res) => {
    try {
      const parsed = mediaFlowSchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      const agent = await storage.getAgent(parsed.data.agentId);
      if (!agent) {
        return res.status(404).json({ message: "Agente nao encontrado" });
      }

      const flow = await storage.createMediaFlow(parsed.data);
      res.json(flow);
    } catch (error) {
      console.error("[ADMIN] Erro ao criar media flow:", error);
      res.status(500).json({ message: "Erro ao criar media flow" });
    }
  });

  app.put("/api/admin/media-flows/:id", isAdmin, async (req, res) => {
    try {
      const parsed = mediaFlowSchema.partial().safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      if (parsed.data.agentId) {
        const agent = await storage.getAgent(parsed.data.agentId);
        if (!agent) {
          return res.status(404).json({ message: "Agente nao encontrado" });
        }
      }

      const flow = await storage.updateMediaFlow(req.params.id, parsed.data);
      res.json(flow);
    } catch (error) {
      console.error("[ADMIN] Erro ao atualizar media flow:", error);
      res.status(500).json({ message: "Erro ao atualizar media flow" });
    }
  });

  app.delete("/api/admin/media-flows/:id", isAdmin, async (req, res) => {
    try {
      await storage.deleteMediaFlow(req.params.id);
      res.json({ success: true });
    } catch (error) {
      console.error("[ADMIN] Erro ao excluir media flow:", error);
      res.status(500).json({ message: "Erro ao excluir media flow" });
    }
  });

  app.post("/api/admin/media-flows/:id/items", isAdmin, async (req, res) => {
    try {
      const schema = mediaFlowItemSchema.extend({
        flowId: z.string().optional(),
        displayOrder: z.number().int().min(0).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      const flowId = req.params.id;
      const existingItems = await storage.getMediaFlowItems(flowId);
      const displayOrder = parsed.data.displayOrder ?? existingItems.length;

      const item = await storage.createMediaFlowItem({
        flowId,
        mediaId: parsed.data.mediaId || null,
        mediaName: parsed.data.mediaName,
        mediaType: parsed.data.mediaType,
        storageUrl: parsed.data.storageUrl,
        caption: parsed.data.caption || null,
        delaySeconds: parsed.data.delaySeconds ?? 0,
        displayOrder,
      });
      res.json(item);
    } catch (error) {
      console.error("[ADMIN] Erro ao criar item do media flow:", error);
      res.status(500).json({ message: "Erro ao criar item do media flow" });
    }
  });

  app.put("/api/admin/media-flows/items/:itemId", isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        delaySeconds: z.number().int().min(0).optional(),
        caption: z.string().optional().nullable(),
        displayOrder: z.number().int().min(0).optional(),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      const item = await storage.updateMediaFlowItem(req.params.itemId, parsed.data);
      res.json(item);
    } catch (error) {
      console.error("[ADMIN] Erro ao atualizar item do media flow:", error);
      res.status(500).json({ message: "Erro ao atualizar item do media flow" });
    }
  });

  app.delete("/api/admin/media-flows/items/:itemId", isAdmin, async (req, res) => {
    try {
      await storage.deleteMediaFlowItem(req.params.itemId);
      res.json({ success: true });
    } catch (error) {
      console.error("[ADMIN] Erro ao excluir item do media flow:", error);
      res.status(500).json({ message: "Erro ao excluir item do media flow" });
    }
  });

  app.post("/api/admin/media-flows/:id/reorder", isAdmin, async (req, res) => {
    try {
      const schema = z.object({
        order: z.array(z.string().min(1)),
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ message: "Dados invalidos", errors: parsed.error.errors });
      }

      await storage.reorderMediaFlowItems(req.params.id, parsed.data.order);
      res.json({ success: true });
    } catch (error) {
      console.error("[ADMIN] Erro ao reordenar media flow:", error);
      res.status(500).json({ message: "Erro ao reordenar media flow" });
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

        const message = `?? *Suas Credenciais de Acesso*\n\nOlá ${user.name}! Aqui estão seus dados para acessar o painel:\n\n?? *Email:* ${user.email}\n?? *Senha:* ${password}\n\n?? Acesse em: https://agentezap.com.br/login\n\n_Recomendamos trocar sua senha após o primeiro acesso._`;

        

        try {

          const { sendAdminDirectMessage } = await import("./whatsapp");

          const adminConnection = await storage.getAdminConnection();

          

          if (adminConnection && adminConnection.isConnected) {

               await sendAdminDirectMessage(adminConnection.adminId, user.phone, message);

          } else {

               console.log("?? [ADMIN] No admin connection found to send credentials.");

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

          console.log(`??? [SIMULATOR] Deletando usuário de teste ${cleanPhone} (ID: ${user.id})`);

          await storage.deleteUser(user.id);

          

          // Tentar limpar do Supabase Auth também se for email temporário

          if (user.email && user.email.includes('@agentezap.temp')) {

            try {

              const { supabase } = await import("./supabaseAuth");

              await supabase.auth.admin.deleteUser(user.id);

            } catch (e) {

              console.log("?? [SIMULATOR] Erro ao deletar do Supabase Auth (ignorado):", e);

            }

          }

        }

      } catch (err) {

        console.error("? [SIMULATOR] Erro ao limpar dados do usuário:", err);

      }

      

      console.log(`?? [SIMULATOR] Histórico limpo para telefone ${cleanPhone}`);

      

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



  // ==================== AI MATCHING PARA FLOW BUILDER ====================

  // Rota para a IA analisar semanticamente a mensagem do usuário e encontrar

  // a melhor opção correspondente no fluxo (botões ou lista)

  app.post("/api/ai/match-flow-option", async (req, res) => {

    try {

      const { userMessage, options, optionsList, businessContext } = req.body;

      

      if (!userMessage || !optionsList || !Array.isArray(optionsList) || optionsList.length === 0) {

        return res.status(400).json({ 

          error: "userMessage and optionsList are required",

          matchedIndex: null,

          confidence: 0

        });

      }



      console.log(`?? [AI-MATCH] Analisando: "${userMessage}" contra ${optionsList.length} opções`);

      if (businessContext) {

        console.log(`?? [AI-MATCH] Contexto do negócio: ${businessContext}`);

      }



      // Importar função de LLM

      const { generateWithLLM } = await import("./llm");



      // Criar prompt para a IA fazer matching semântico COM CONTEXTO

      const systemPrompt = `Você é um assistente de atendimento especializado em identificar a intenção do cliente e fazer correspondência precisa com as opções disponíveis.



${businessContext ? `CONTEXTO DO NEGÓCIO: ${businessContext}` : ''}



REGRAS DE MATCHING (siga rigorosamente):

1. A mensagem do cliente DEVE estar relacionada ao tipo de serviço oferecido

2. Se a mensagem não faz sentido para o negócio (ex: "cortar cabelo" em empresa elétrica), responda NULL

3. Entenda a INTENÇÃO semântica - não seja literal demais

4. Correspondências válidas:

   - "quero pedir" ? opções de pedido/delivery/cardápio

   - "quanto custa" ? opções de preços/orçamento/valores

   - "agendar/marcar" ? opções de agendamento/horários/visita

   - "falar com alguém" ? opções de suporte/atendente/técnico

   - "dúvidas/informações" ? opções de ajuda/FAQ/sobre

5. Números diretos (1, 2, 3) indicam a opção diretamente

6. Saudações genéricas (oi, olá, bom dia) ? NULL (não são escolhas)

7. Mensagens sem relação com as opções ? NULL



FORMATO DE RESPOSTA:

- Responda APENAS com o índice (0 a N) da opção correspondente

- Se não houver correspondência válida, responda NULL

- Sem explicações adicionais`;



      const userPrompt = `MENSAGEM DO CLIENTE: "${userMessage}"



OPÇÕES DISPONÍVEIS:

${optionsList.map((opt: string, i: number) => `${i}. ${opt}`).join('\n')}



A mensagem do cliente corresponde a alguma dessas opções? 

Responda apenas com o número do índice (0 a ${optionsList.length - 1}) ou NULL:`;



      try {

        const aiResponse = await generateWithLLM(systemPrompt, userPrompt, {

          temperature: 0.1, // Baixa temperatura para respostas mais consistentes

          maxTokens: 10

        });



        const cleanResponse = aiResponse.trim().toUpperCase();

        console.log(`?? [AI-MATCH] Resposta da IA: "${cleanResponse}"`);



        // Verificar se a resposta é um número válido

        if (cleanResponse === 'NULL' || cleanResponse === 'NENHUMA' || cleanResponse === 'NONE') {

          console.log(`?? [AI-MATCH] IA não encontrou correspondência`);

          return res.json({ matchedIndex: null, confidence: 0 });

        }



        // Extrair número da resposta

        const match = cleanResponse.match(/\d+/);

        if (match) {

          const index = parseInt(match[0], 10);

          if (index >= 0 && index < optionsList.length) {

            console.log(`?? [AI-MATCH] ? Match encontrado: "${userMessage}" ? "${optionsList[index]}" (índice: ${index})`);

            return res.json({ 

              matchedIndex: index, 

              confidence: 85, // Confiança alta quando IA encontra match

              matchedOption: optionsList[index]

            });

          }

        }



        // Resposta inválida da IA

        console.log(`?? [AI-MATCH] Resposta inválida da IA: "${cleanResponse}"`);

        return res.json({ matchedIndex: null, confidence: 0 });



      } catch (llmError: any) {

        console.error(`? [AI-MATCH] Erro na LLM:`, llmError?.message || llmError);

        return res.json({ 

          matchedIndex: null, 

          confidence: 0,

          error: "LLM error"

        });

      }



    } catch (error: any) {

      console.error("? [AI-MATCH] Erro geral:", error);

      res.status(500).json({ 

        error: "Internal server error",

        matchedIndex: null,

        confidence: 0

      });

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



  // Update user signature

  app.put("/api/user/signature", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { signature, signatureEnabled } = req.body;



      await storage.updateUser(userId, {

        signature: signature || null,

        signatureEnabled: signatureEnabled || false,

      });



      const updatedUser = await storage.getUser(userId);

      res.json(updatedUser);

    } catch (error) {

      console.error("Error updating signature:", error);

      res.status(500).json({ message: "Failed to update signature" });

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



  // Get user branding (white-label for reseller clients)

  app.get("/api/user/branding", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const user = await storage.getUser(userId);

      

      if (!user) {

        return res.status(404).json({ message: "User not found" });

      }



      // If user is a reseller client, return reseller branding

      if (user.resellerId) {

        const reseller = await storage.getReseller(user.resellerId);

        if (reseller && reseller.isActive) {

          return res.json({

            isWhiteLabel: true,

            companyName: reseller.companyName,

            logoUrl: reseller.logoUrl,

            primaryColor: reseller.primaryColor || "#000000",

            secondaryColor: reseller.secondaryColor || "#ffffff",

            accentColor: reseller.accentColor || "#22c55e",

            supportEmail: reseller.supportEmail,

            supportPhone: reseller.supportPhone,

            welcomeMessage: reseller.welcomeMessage,

          });

        }

      }



      // Return default AgenteZap branding

      return res.json({

        isWhiteLabel: false,

        companyName: "AgenteZap",

        logoUrl: null,

        primaryColor: "#000000",

        secondaryColor: "#ffffff",

        accentColor: "#22c55e",

      });

    } catch (error) {

      console.error("Error fetching user branding:", error);

      res.status(500).json({ message: "Failed to fetch branding" });

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

      if (devMode) {
        return res.json({
          ...connection,
          isConnected: false,
          phoneNumber: connection.phoneNumber,
          _devMode: true,
          _message: 'Modo desenvolvimento - WhatsApp desabilitado',
        });
      }



      // -----------------------------------------------------------------------

      // ?? LEADER ELECTION: Fonte de verdade = Banco (não memória local)

      // -----------------------------------------------------------------------

      // Com múltiplas instâncias/replicas, só o líder tem socket ativo.

      // Se usarmos memória local (getSession) para decidir o estado:

      // - Follower sempre vê isConnected=false (não tem socket)

      // - Follower atualiza banco para false, quebrando o estado global

      //

      // Solução: O banco é a fonte de verdade distribuída.

      // - Se DB=true e socket local existe → podemos elevar para true (harmless)

      // - Se DB=true e socket local não existe → provável follower, manter DB

      // - Se DB=false e socket local existe → líder irá curar via health check

      // - Se DB=false e socket local não existe → realmente desconectado

      // -----------------------------------------------------------------------

      const { getSession } = await import("./whatsapp");

      const activeSession = getSession(userId);

      const hasLocalSocket = !!(activeSession?.socket?.user);



      // Só podemos CURAR (elevar de false para true) com certeza local.

      // Nunca devemos DERRUBAR (true para false) baseado em memória local.

      if (!connection.isConnected && hasLocalSocket) {

        // DB=false mas temos socket local: provável líder que ainda não sincronizou

        console.log(`?? [WHATSAPP WS] Curando estado user ${userId.substring(0, 8)}...: DB=false mas socket local ativo`);

        await storage.updateConnection(connection.id, {

          isConnected: true,

          phoneNumber: activeSession?.socket?.user?.id.split(':')[0],

        });

        connection.isConnected = true;

        connection.phoneNumber = activeSession?.socket?.user?.id.split(':')[0];

      }

      // Caso contrário: respeitar o que está no banco (fonte de verdade distribuída)

      // Não fazer NADA se connection.isConnected=true e !hasLocalSocket

      // (pode ser follower, e não devemos derrubar o estado global)



      // Retornar estado do banco como fonte de verdade

      // Opcional: incluir debug sobre socket local (sem afetar DB)

      const response = {

        ...connection,

        // Opcional para debug: mostra se TEM socket local (não significa estado global)

        _debugLocalSocket: hasLocalSocket,

      };



      res.json(response);

    } catch (error) {

      console.error("Error fetching connection:", error);

      res.status(500).json({ message: "Failed to fetch connection" });

    }

  });



  app.post("/api/whatsapp/connect", isAuthenticated, async (req: any, res) => {

    try {

      // ??? MODO DESENVOLVIMENTO: Bloquear conexões para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando conexão WhatsApp de usuário (proteção de produção)`);

        return res.status(403).json({ 

          success: false, 

          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',

          devMode: true 

        });

      }

      

      const userId = getUserId(req);

      

      // ?? Verificar se usuário está suspenso - bloquear conexão

      const suspensionStatus = await storage.isUserSuspended(userId);

      if (suspensionStatus.suspended) {

        console.log(`?? [SUSPENSION] Bloqueando conexão WhatsApp para usuário suspenso: ${userId}`);

        return res.status(403).json({ 

          success: false, 

          message: 'Sua conta está suspensa. Não é possível conectar o WhatsApp.',

          suspended: true,

          reason: suspensionStatus.data?.reason

        });

      }

      

      await connectWhatsApp(userId);

      res.json({ success: true });

    } catch (error) {

      console.error("Error connecting WhatsApp:", error);

      res.status(500).json({ message: "Failed to connect WhatsApp" });

    }

  });



  app.post("/api/whatsapp/disconnect", isAuthenticated, async (req: any, res) => {

    try {

      // ??? MODO DESENVOLVIMENTO: Bloquear desconexões para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando desconexão WhatsApp de usuário (proteção de produção)`);

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



  // POST - Resetar conexão WhatsApp (self-service para usuário)

  // -----------------------------------------------------------------------

  // ?? RESET SELF-SERVICE: Permite que o próprio usuário resete sua conexão

  // -----------------------------------------------------------------------

  // Quando o QR Code "buga" ou o pairing deixa credenciais parciais,

  // o usuário pode clicar em "Resetar" para limpar tudo e tentar de novo.

  // Antes só existia reset via admin (/api/admin/connections/reset/:userId).

  // -----------------------------------------------------------------------

  app.post("/api/whatsapp/reset", isAuthenticated, async (req: any, res) => {

    try {

      // ??? MODO DESENVOLVIMENTO: Bloquear reset para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando reset WhatsApp de usuário (proteção de produção)`);

        return res.status(403).json({

          success: false,

          message: 'WhatsApp desabilitado em modo desenvolvimento para proteger sessões em produção',

          devMode: true

        });

      }



      const userId = getUserId(req);



      // Verificar se o usuário tem uma conexão

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(404).json({ message: "Conexão não encontrada" });

      }



      // Chamar forceResetWhatsApp (função que limpa auth e atualiza DB)

      const { forceResetWhatsApp } = await import("./whatsapp");

      await forceResetWhatsApp(userId);



      console.log(`[RESET] Usuário ${userId.substring(0, 8)}... resetou sua própria conexão`);



      res.json({

        success: true,

        message: "Conexão resetada com sucesso. Escaneie o QR Code novamente."

      });



    } catch (error: any) {

      console.error("Error resetting WhatsApp connection:", error);



      // Se for erro de modo desenvolvimento, propagar mensagem específica

      if (error.message?.includes('SKIP_WHATSAPP_RESTORE')) {

        return res.status(403).json({

          success: false,

          message: error.message,

          devMode: true

        });

      }



      res.status(500).json({ message: "Failed to reset connection" });

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



      // ?? FIX: Marcar como lida quando usuário abre a conversa

      if (conversation.unreadCount > 0) {

        await storage.updateConversation(id, { unreadCount: 0 });

        console.log(`?? [READ] Conversa ${id} marcada como lida`);

      }



      res.json(conversation);

    } catch (error) {

      console.error("Error fetching conversation:", error);

      res.status(500).json({ message: "Failed to fetch conversation" });

    }

  });



  // ?? POST - Marcar conversa como lida explicitamente

  app.post("/api/conversations/:id/read", isAuthenticated, async (req: any, res) => {

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



      await storage.updateConversation(id, { unreadCount: 0 });

      console.log(`?? [READ] Conversa ${id} marcada como lida via POST`);



      res.json({ success: true });

    } catch (error) {

      console.error("Error marking conversation as read:", error);

      res.status(500).json({ message: "Failed to mark conversation as read" });

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



  // ==================== TAGS / ETIQUETAS ====================



  // GET - Listar todas as tags do usuário

  app.get("/api/tags", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      let userTags = await storage.getTagsByUserId(userId);

      

      // Se o usuário não tem tags, cria as tags padrão

      if (userTags.length === 0) {

        userTags = await storage.createDefaultTags(userId);

      }

      

      res.json(userTags);

    } catch (error) {

      console.error("Error fetching tags:", error);

      res.status(500).json({ message: "Failed to fetch tags" });

    }

  });



  // POST - Criar uma nova tag

  app.post("/api/tags", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, color, icon, description, position } = req.body;

      

      if (!name || name.trim().length === 0) {

        return res.status(400).json({ message: "Nome da etiqueta é obrigatório" });

      }

      

      const tag = await storage.createTag({

        userId,

        name: name.trim(),

        color: color || "#6b7280",

        icon: icon || null,

        description: description || null,

        position: position || 0,

        isDefault: false,

      });

      

      res.status(201).json(tag);

    } catch (error: any) {

      console.error("Error creating tag:", error);

      if (error.code === '23505') { // Unique violation

        return res.status(400).json({ message: "Já existe uma etiqueta com este nome" });

      }

      res.status(500).json({ message: "Failed to create tag" });

    }

  });



  // PUT - Atualizar uma tag

  app.put("/api/tags/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, color, icon, description, position } = req.body;

      

      // Verifica se a tag pertence ao usuário

      const existingTag = await storage.getTag(id);

      if (!existingTag || existingTag.userId !== userId) {

        return res.status(404).json({ message: "Tag not found" });

      }

      

      const updatedData: any = {};

      if (name !== undefined) updatedData.name = name.trim();

      if (color !== undefined) updatedData.color = color;

      if (icon !== undefined) updatedData.icon = icon;

      if (description !== undefined) updatedData.description = description;

      if (position !== undefined) updatedData.position = position;

      

      const tag = await storage.updateTag(id, updatedData);

      res.json(tag);

    } catch (error: any) {

      console.error("Error updating tag:", error);

      if (error.code === '23505') {

        return res.status(400).json({ message: "Já existe uma etiqueta com este nome" });

      }

      res.status(500).json({ message: "Failed to update tag" });

    }

  });



  // DELETE - Deletar uma tag

  app.delete("/api/tags/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      // Verifica se a tag pertence ao usuário

      const existingTag = await storage.getTag(id);

      if (!existingTag || existingTag.userId !== userId) {

        return res.status(404).json({ message: "Tag not found" });

      }

      

      await storage.deleteTag(id);

      res.json({ success: true });

    } catch (error) {

      console.error("Error deleting tag:", error);

      res.status(500).json({ message: "Failed to delete tag" });

    }

  });



  // ==================== CONVERSATION TAGS ====================



  // GET - Obter tags de uma conversa específica

  app.get("/api/conversations/:conversationId/tags", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      

      // Verifica se a conversa pertence ao usuário

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      const conversationTagsList = await storage.getConversationTags(conversationId);

      res.json(conversationTagsList);

    } catch (error) {

      console.error("Error fetching conversation tags:", error);

      res.status(500).json({ message: "Failed to fetch conversation tags" });

    }

  });



  // PUT - Atualizar tags de uma conversa (substitui todas)

  app.put("/api/conversations/:conversationId/tags", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      const { tagIds } = req.body;

      

      // Verifica se a conversa pertence ao usuário

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      // Verifica se todas as tags pertencem ao usuário

      const userTags = await storage.getTagsByUserId(userId);

      const userTagIds = new Set(userTags.map(t => t.id));

      const validTagIds = (tagIds || []).filter((id: string) => userTagIds.has(id));

      

      await storage.setConversationTags(conversationId, validTagIds);

      

      const updatedTags = await storage.getConversationTags(conversationId);

      res.json(updatedTags);

    } catch (error) {

      console.error("Error updating conversation tags:", error);

      res.status(500).json({ message: "Failed to update conversation tags" });

    }

  });



  // POST - Adicionar uma tag a uma conversa

  app.post("/api/conversations/:conversationId/tags/:tagId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId, tagId } = req.params;

      

      // Verifica se a conversa pertence ao usuário

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      // Verifica se a tag pertence ao usuário

      const tag = await storage.getTag(tagId);

      if (!tag || tag.userId !== userId) {

        return res.status(404).json({ message: "Tag not found" });

      }

      

      await storage.addTagToConversation(conversationId, tagId);

      

      const updatedTags = await storage.getConversationTags(conversationId);

      res.json(updatedTags);

    } catch (error) {

      console.error("Error adding tag to conversation:", error);

      res.status(500).json({ message: "Failed to add tag to conversation" });

    }

  });



  // DELETE - Remover uma tag de uma conversa

  app.delete("/api/conversations/:conversationId/tags/:tagId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId, tagId } = req.params;

      

      // Verifica se a conversa pertence ao usuário

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      await storage.removeTagFromConversation(conversationId, tagId);

      

      const updatedTags = await storage.getConversationTags(conversationId);

      res.json(updatedTags);

    } catch (error) {

      console.error("Error removing tag from conversation:", error);

      res.status(500).json({ message: "Failed to remove tag from conversation" });

    }

  });



  // GET - Obter conversas com suas tags (para listagem com filtro)

  app.get("/api/conversations-with-tags", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { tagId } = req.query;

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.json([]);

      }

      

      // Se tem filtro por tag, busca apenas conversas com essa tag

      if (tagId) {

        const conversations = await storage.getConversationsByTag(tagId, connection.id);

        // Adiciona as tags a cada conversa

        const conversationsWithTags = await Promise.all(

          conversations.map(async (conv) => ({

            ...conv,

            tags: await storage.getConversationTags(conv.id),

          }))

        );

        return res.json(conversationsWithTags);

      }

      

      // Sem filtro, retorna todas as conversas com suas tags

      const conversationsWithTags = await storage.getConversationsWithTags(connection.id);

      res.json(conversationsWithTags);

    } catch (error) {

      console.error("Error fetching conversations with tags:", error);

      res.status(500).json({ message: "Failed to fetch conversations with tags" });

    }

  });



  // POST - A��es em massa nas conversas (marcar como lida)
  app.post("/api/conversations/bulk/read", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const conversationIds = Array.isArray(req.body?.conversationIds)
        ? req.body.conversationIds.filter(Boolean)
        : [];

      if (conversationIds.length === 0) {
        return res.status(400).json({ message: "IDs de conversa obrigat�rios" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.status(403).json({ message: "WhatsApp n�o conectado" });
      }

      const updated = await db
        .update(conversationsTable)
        .set({ unreadCount: 0, updatedAt: new Date() })
        .where(and(
          eq(conversationsTable.connectionId, connection.id),
          inArray(conversationsTable.id, conversationIds)
        ))
        .returning({ id: conversationsTable.id });

      res.json({ updated: updated.length });
    } catch (error) {
      console.error("Error marking conversations as read:", error);
      res.status(500).json({ message: "Failed to mark conversations as read" });
    }
  });

  // POST - A��es em massa nas conversas (arquivar/desarquivar)
  app.post("/api/conversations/bulk/archive", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const conversationIds = Array.isArray(req.body?.conversationIds)
        ? req.body.conversationIds.filter(Boolean)
        : [];
      const archived = req.body?.archived === false ? false : true;

      if (conversationIds.length === 0) {
        return res.status(400).json({ message: "IDs de conversa obrigat�rios" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.status(403).json({ message: "WhatsApp n�o conectado" });
      }

      const updated = await db
        .update(conversationsTable)
        .set({ isArchived: archived, updatedAt: new Date() })
        .where(and(
          eq(conversationsTable.connectionId, connection.id),
          inArray(conversationsTable.id, conversationIds)
        ))
        .returning({ id: conversationsTable.id });

      res.json({ updated: updated.length });
    } catch (error) {
      console.error("Error archiving conversations:", error);
      res.status(500).json({ message: "Failed to archive conversations" });
    }
  });

  // POST - A��es em massa nas conversas (etiquetar)
  app.post("/api/conversations/bulk/tags", isAuthenticated, async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const conversationIds = Array.isArray(req.body?.conversationIds)
        ? req.body.conversationIds.filter(Boolean)
        : [];
      const tagIds = Array.isArray(req.body?.tagIds)
        ? req.body.tagIds.filter(Boolean)
        : [];

      if (conversationIds.length === 0 || tagIds.length === 0) {
        return res.status(400).json({ message: "IDs de conversa e etiquetas s�o obrigat�rios" });
      }

      const connection = await storage.getConnectionByUserId(userId);
      if (!connection) {
        return res.status(403).json({ message: "WhatsApp n�o conectado" });
      }

      const validConversations = await db
        .select({ id: conversationsTable.id })
        .from(conversationsTable)
        .where(and(
          eq(conversationsTable.connectionId, connection.id),
          inArray(conversationsTable.id, conversationIds)
        ));

      const validIds = validConversations.map(conv => conv.id);
      if (validIds.length === 0) {
        return res.json({ updated: 0 });
      }

      await storage.addTagsToConversations(validIds, tagIds);
      res.json({ updated: validIds.length });
    } catch (error) {
      console.error("Error tagging conversations:", error);
      res.status(500).json({ message: "Failed to tag conversations" });
    }
  });
  // ==================== CUSTOM FIELDS - CAMPOS PERSONALIZADOS ====================

  // Similar ao Digisac: Nome, Empresa, Email, CPF/CNPJ, Endereço, etc.



  // GET - Listar definições de campos personalizados do usuário

  app.get("/api/custom-fields", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data: definitions, error } = await supabase

        .from('custom_field_definitions')

        .select('*')

        .eq('user_id', userId)

        .order('position', { ascending: true });

      

      if (error) throw error;

      

      // Se não tem campos, cria os campos padrão

      if (!definitions || definitions.length === 0) {

        const defaultFields = [

          { name: 'nome_responsavel', label: 'Nome do Responsável', field_type: 'text', position: 1, ai_extraction_prompt: 'Extraia o nome completo da pessoa que está conversando' },

          { name: 'empresa', label: 'Empresa', field_type: 'text', position: 2, ai_extraction_prompt: 'Extraia o nome da empresa mencionada' },

          { name: 'email', label: 'Email', field_type: 'email', position: 3, ai_extraction_prompt: 'Extraia o email mencionado na conversa' },

          { name: 'cpf_cnpj', label: 'CPF/CNPJ', field_type: 'cpf_cnpj', position: 4, ai_extraction_prompt: 'Extraia o CPF ou CNPJ mencionado' },

          { name: 'telefone_adicional', label: 'Telefone Adicional', field_type: 'phone', position: 5 },

          { name: 'endereco', label: 'Endereço', field_type: 'textarea', position: 6, ai_extraction_prompt: 'Extraia o endereço completo mencionado' },

        ];

        

        const { data: created, error: createError } = await supabase

          .from('custom_field_definitions')

          .insert(defaultFields.map(f => ({ ...f, user_id: userId })))

          .select();

        

        if (createError) throw createError;

        return res.json(created);

      }

      

      res.json(definitions);

    } catch (error) {

      console.error("Error fetching custom field definitions:", error);

      res.status(500).json({ message: "Failed to fetch custom field definitions" });

    }

  });



  // POST - Criar nova definição de campo personalizado

  app.post("/api/custom-fields", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, label, fieldType, options, required, placeholder, helpText, aiExtractionPrompt, aiExtractionEnabled, position } = req.body;

      

      if (!name || !label) {

        return res.status(400).json({ message: "Nome e label são obrigatórios" });

      }

      

      // Get max position

      const { data: existingFields } = await supabase

        .from('custom_field_definitions')

        .select('position')

        .eq('user_id', userId)

        .order('position', { ascending: false })

        .limit(1);

      

      const maxPosition = existingFields?.[0]?.position || 0;

      

      const { data: definition, error } = await supabase

        .from('custom_field_definitions')

        .insert({

          user_id: userId,

          name: name.toLowerCase().replace(/\s+/g, '_'),

          label,

          field_type: fieldType || 'text',

          options: options || [],

          required: required || false,

          placeholder,

          help_text: helpText,

          ai_extraction_prompt: aiExtractionPrompt,

          ai_extraction_enabled: aiExtractionEnabled !== false,

          position: position ?? (maxPosition + 1),

        })

        .select()

        .single();

      

      if (error) {

        if (error.code === '23505') {

          return res.status(400).json({ message: "Já existe um campo com este nome" });

        }

        throw error;

      }

      

      res.status(201).json(definition);

    } catch (error) {

      console.error("Error creating custom field definition:", error);

      res.status(500).json({ message: "Failed to create custom field definition" });

    }

  });



  // PUT - Atualizar definição de campo personalizado

  app.put("/api/custom-fields/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { label, fieldType, options, required, placeholder, helpText, aiExtractionPrompt, aiExtractionEnabled, position, isActive } = req.body;

      

      // Verifica se pertence ao usuário

      const { data: existing } = await supabase

        .from('custom_field_definitions')

        .select('id')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (!existing) {

        return res.status(404).json({ message: "Campo não encontrado" });

      }

      

      const updateData: any = { updated_at: new Date().toISOString() };

      if (label !== undefined) updateData.label = label;

      if (fieldType !== undefined) updateData.field_type = fieldType;

      if (options !== undefined) updateData.options = options;

      if (required !== undefined) updateData.required = required;

      if (placeholder !== undefined) updateData.placeholder = placeholder;

      if (helpText !== undefined) updateData.help_text = helpText;

      if (aiExtractionPrompt !== undefined) updateData.ai_extraction_prompt = aiExtractionPrompt;

      if (aiExtractionEnabled !== undefined) updateData.ai_extraction_enabled = aiExtractionEnabled;

      if (position !== undefined) updateData.position = position;

      if (isActive !== undefined) updateData.is_active = isActive;

      

      const { data: definition, error } = await supabase

        .from('custom_field_definitions')

        .update(updateData)

        .eq('id', id)

        .select()

        .single();

      

      if (error) throw error;

      

      res.json(definition);

    } catch (error) {

      console.error("Error updating custom field definition:", error);

      res.status(500).json({ message: "Failed to update custom field definition" });

    }

  });



  // DELETE - Deletar definição de campo personalizado

  app.delete("/api/custom-fields/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('custom_field_definitions')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error deleting custom field definition:", error);

      res.status(500).json({ message: "Failed to delete custom field definition" });

    }

  });



  // PUT - Reordenar campos personalizados

  app.put("/api/custom-fields/reorder", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { fieldIds } = req.body; // Array de IDs na nova ordem

      

      if (!Array.isArray(fieldIds)) {

        return res.status(400).json({ message: "fieldIds deve ser um array" });

      }

      

      // Atualiza as posições

      for (let i = 0; i < fieldIds.length; i++) {

        await supabase

          .from('custom_field_definitions')

          .update({ position: i + 1 })

          .eq('id', fieldIds[i])

          .eq('user_id', userId);

      }

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error reordering custom fields:", error);

      res.status(500).json({ message: "Failed to reorder custom fields" });

    }

  });



  // GET - Obter valores dos campos personalizados de uma conversa

  app.get("/api/conversations/:conversationId/custom-fields", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      

      // Verifica ownership

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      // Busca definições do usuário

      const { data: definitions, error: defError } = await supabase

        .from('custom_field_definitions')

        .select('*')

        .eq('user_id', userId)

        .eq('is_active', true)

        .order('position', { ascending: true });

      

      if (defError) throw defError;

      

      // Busca valores existentes para esta conversa

      const { data: values, error: valError } = await supabase

        .from('custom_field_values')

        .select('*')

        .eq('conversation_id', conversationId);

      

      if (valError) throw valError;

      

      // Mescla definições com valores

      const valuesMap = new Map((values || []).map(v => [v.field_definition_id, v]));

      

      const fieldsWithValues = (definitions || []).map(def => ({

        definition: def,

        value: valuesMap.get(def.id) || null,

      }));

      

      res.json(fieldsWithValues);

    } catch (error) {

      console.error("Error fetching conversation custom fields:", error);

      res.status(500).json({ message: "Failed to fetch conversation custom fields" });

    }

  });



  // PUT - Salvar valores dos campos personalizados de uma conversa

  app.put("/api/conversations/:conversationId/custom-fields", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      const { fields } = req.body; // Array de { fieldDefinitionId, value }

      

      // Verifica ownership

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      if (!Array.isArray(fields)) {

        return res.status(400).json({ message: "fields deve ser um array" });

      }

      

      // Upsert cada valor

      for (const field of fields) {

        const { fieldDefinitionId, value } = field;

        

        if (!fieldDefinitionId) continue;

        

        // Verifica se já existe

        const { data: existing } = await supabase

          .from('custom_field_values')

          .select('id')

          .eq('field_definition_id', fieldDefinitionId)

          .eq('conversation_id', conversationId)

          .single();

        

        if (existing) {

          // Update

          await supabase

            .from('custom_field_values')

            .update({

              value: value || null,

              last_edited_by: 'user',

              updated_at: new Date().toISOString(),

            })

            .eq('id', existing.id);

        } else if (value) {

          // Insert

          await supabase

            .from('custom_field_values')

            .insert({

              field_definition_id: fieldDefinitionId,

              conversation_id: conversationId,

              value,

              last_edited_by: 'user',

            });

        }

      }

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error saving conversation custom fields:", error);

      res.status(500).json({ message: "Failed to save conversation custom fields" });

    }

  });



  // POST - Auto-extrair valores dos campos usando IA

  app.post("/api/conversations/:conversationId/custom-fields/extract", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      

      // Verifica ownership

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      // Busca mensagens da conversa

      const messages = await storage.getMessagesByConversationId(conversationId);

      if (!messages || messages.length === 0) {

        return res.json({ extracted: 0, message: "Sem mensagens para análise" });

      }

      

      // Busca definições com extração IA ativada

      const { data: definitions, error: defError } = await supabase

        .from('custom_field_definitions')

        .select('*')

        .eq('user_id', userId)

        .eq('is_active', true)

        .eq('ai_extraction_enabled', true)

        .not('ai_extraction_prompt', 'is', null);

      

      if (defError) throw defError;

      

      if (!definitions || definitions.length === 0) {

        return res.json({ extracted: 0, message: "Nenhum campo com extração IA ativada" });

      }

      

      // Monta contexto da conversa (últimas 50 mensagens)

      const conversationText = messages

        .slice(-50)

        .map(m => `${m.fromMe ? 'Atendente' : 'Cliente'}: ${m.text || '[mídia]'}`)

        .join('\n');

      

      // Monta prompt para extração

      const fieldsToExtract = definitions.map(d => ({

        id: d.id,

        name: d.name,

        label: d.label,

        prompt: d.ai_extraction_prompt,

        fieldType: d.field_type,

      }));

      

      const extractionPrompt = `Analise a seguinte conversa e extraia as informações solicitadas. Retorne APENAS um JSON válido com os campos preenchidos.



CONVERSA:

${conversationText}



CAMPOS PARA EXTRAIR:

${fieldsToExtract.map(f => `- [ID: ${f.id}] ${f.label}: ${f.prompt}`).join('\n')}



FORMATO DE RESPOSTA (JSON):

{

  "extractions": [

    { "fieldId": "cole-aqui-o-id-do-campo", "value": "valor_extraido", "confidence": 0.95, "source": "trecho_da_conversa" }

  ]

}



IMPORTANTE: Use o ID (UUID) exato mostrado entre [ID: ...] para cada campo. Exemplo: se vir [ID: abc-123], use "fieldId": "abc-123".

Se não encontrar um valor, retorne value como null. A confidence deve ser entre 0 e 1.`;



      // Chama LLM para extração (usa Groq ou Mistral conforme configuração do admin)

      const { generateWithLLM } = await import("./llm");

      const response = await generateWithLLM(

        "Você é um assistente especializado em extração de dados de conversas. Analise cuidadosamente e extraia as informações solicitadas.",

        extractionPrompt,

        { 

          temperature: 0.1, // Baixa temperatura para respostas mais precisas

          maxTokens: 1000 

        }

      );

      

      console.log("=== AI EXTRACTION RESPONSE ===");

      console.log(response);

      console.log("==============================");

      

      // Parse da resposta

      let extractions: any[] = [];

      try {

        // Tenta extrair JSON da resposta

        const jsonMatch = response.match(/\{[\s\S]*\}/);

        if (jsonMatch) {

          const parsed = JSON.parse(jsonMatch[0]);

          extractions = parsed.extractions || [];

          console.log("=== PARSED EXTRACTIONS ===");

          console.log(JSON.stringify(extractions, null, 2));

          console.log("==========================");

        }

      } catch (parseError) {

        console.error("Error parsing AI extraction response:", parseError);

        console.error("Raw response:", response);

        return res.json({ extracted: 0, message: "Erro ao processar resposta da IA" });

      }

      

      // Salva os valores extraídos

      let extractedCount = 0;

      for (const extraction of extractions) {

        console.log(`Processing extraction for field ${extraction.fieldId}:`, extraction);

        

        if (!extraction.value || extraction.value === 'null') {

          console.log(`Skipping field ${extraction.fieldId} - no value`);

          continue;

        }

        

        // Verifica se já existe valor

        const { data: existing } = await supabase

          .from('custom_field_values')

          .select('id, value')

          .eq('field_definition_id', extraction.fieldId)

          .eq('conversation_id', conversationId)

          .single();

        

        console.log(`Existing value for field ${extraction.fieldId}:`, existing);

        

        if (existing && existing.value) {

          // Já tem valor preenchido, não sobrescreve

          console.log(`Skipping field ${extraction.fieldId} - already has value`);

          continue;

        }

        

        if (existing) {

          // Update

          console.log(`Updating field ${extraction.fieldId} with value:`, extraction.value);

          const { error: updateError } = await supabase

            .from('custom_field_values')

            .update({

              value: extraction.value,

              auto_extracted: true,

              extraction_source: extraction.source,

              extraction_confidence: extraction.confidence,

              last_edited_by: 'ai',

              updated_at: new Date().toISOString(),

            })

            .eq('id', existing.id);

          

          if (updateError) {

            console.error(`Error updating field ${extraction.fieldId}:`, updateError);

          }

        } else {

          // Insert

          console.log(`Inserting new value for field ${extraction.fieldId}:`, extraction.value);

          const { error: insertError } = await supabase

            .from('custom_field_values')

            .insert({

              field_definition_id: extraction.fieldId,

              conversation_id: conversationId,

              value: extraction.value,

              auto_extracted: true,

              extraction_source: extraction.source,

              extraction_confidence: extraction.confidence,

              last_edited_by: 'ai',

            });

          

          if (insertError) {

            console.error(`Error inserting field ${extraction.fieldId}:`, insertError);

          }

        }

        extractedCount++;

      }

      

      console.log(`=== EXTRACTION COMPLETE: ${extractedCount} fields extracted ===`);

      

      res.json({ 

        extracted: extractedCount, 

        total: definitions.length,

        message: `${extractedCount} campo(s) preenchido(s) automaticamente`

      });

    } catch (error) {

      console.error("Error extracting custom fields:", error);

      res.status(500).json({ message: "Failed to extract custom fields" });

    }

  });



  // =============================================

  // ROTAS DE PRODUTOS (CATÁLOGO)

  // =============================================



  // GET - Listar produtos do usuário

  app.get("/api/products", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { category, isActive, search, page = 1, limit = 50 } = req.query;

      

      let query = supabase

        .from('products')

        .select('*', { count: 'exact' })

        .eq('user_id', userId)

        .order('name', { ascending: true });

      

      if (category) {

        query = query.eq('category', category);

      }

      

      if (isActive !== undefined) {

        query = query.eq('is_active', isActive === 'true');

      }

      

      if (search) {

        query = query.or(`name.ilike.%${search}%,sku.ilike.%${search}%`);

      }

      

      // Paginação

      const pageNum = parseInt(page as string);

      const limitNum = parseInt(limit as string);

      query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

      

      const { data, error, count } = await query;

      

      if (error) throw error;

      

      res.json({

        products: data || [],

        total: count || 0,

        page: pageNum,

        totalPages: Math.ceil((count || 0) / limitNum)

      });

    } catch (error) {

      console.error("Error fetching products:", error);

      res.status(500).json({ message: "Failed to fetch products" });

    }

  });



  // GET - Obter produto específico

  app.get("/api/products/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { data, error } = await supabase

        .from('products')

        .select('*')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (error) {

        if (error.code === 'PGRST116') {

          return res.status(404).json({ message: "Product not found" });

        }

        throw error;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching product:", error);

      res.status(500).json({ message: "Failed to fetch product" });

    }

  });



  // POST - Criar novo produto

  app.post("/api/products", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, price, stock, description, category, link, sku, unit, isActive } = req.body;

      

      if (!name) {

        return res.status(400).json({ message: "Nome do produto é obrigatório" });

      }

      

      const { data, error } = await supabase

        .from('products')

        .insert({

          user_id: userId,

          name,

          price: price ? parseFloat(price) : null,

          stock: stock || 0,

          description,

          category,

          link,

          sku,

          unit: unit || 'un',

          is_active: isActive !== false,

        })

        .select()

        .single();

      

      if (error) throw error;

      

      res.status(201).json(data);

    } catch (error) {

      console.error("Error creating product:", error);

      res.status(500).json({ message: "Failed to create product" });

    }

  });



  // PUT - Atualizar produto

  app.put("/api/products/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, price, stock, description, category, link, sku, unit, isActive } = req.body;

      

      const updateData: any = {

        updated_at: new Date().toISOString(),

      };

      

      if (name !== undefined) updateData.name = name;

      if (price !== undefined) updateData.price = price ? parseFloat(price) : null;

      if (stock !== undefined) updateData.stock = stock;

      if (description !== undefined) updateData.description = description;

      if (category !== undefined) updateData.category = category;

      if (link !== undefined) updateData.link = link;

      if (sku !== undefined) updateData.sku = sku;

      if (unit !== undefined) updateData.unit = unit;

      if (isActive !== undefined) updateData.is_active = isActive;

      

      const { data, error } = await supabase

        .from('products')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) {

        if (error.code === 'PGRST116') {

          return res.status(404).json({ message: "Product not found" });

        }

        throw error;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error updating product:", error);

      res.status(500).json({ message: "Failed to update product" });

    }

  });



  // DELETE - Remover produto

  app.delete("/api/products/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('products')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error deleting product:", error);

      res.status(500).json({ message: "Failed to delete product" });

    }

  });



  // DELETE - Remover vários produtos

  app.delete("/api/products", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { ids } = req.body;

      

      if (!Array.isArray(ids) || ids.length === 0) {

        return res.status(400).json({ message: "IDs de produtos são obrigatórios" });

      }

      

      const { error } = await supabase

        .from('products')

        .delete()

        .in('id', ids)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true, deleted: ids.length });

    } catch (error) {

      console.error("Error deleting products:", error);

      res.status(500).json({ message: "Failed to delete products" });

    }

  });



  // POST - Importar produtos de Excel/CSV (com mapeamento de colunas)

  app.post("/api/products/import", isAuthenticated, upload.single('file'), async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const file = req.file;

      const columnMapping = JSON.parse(req.body.columnMapping || '{}');

      

      if (!file) {

        return res.status(400).json({ message: "Arquivo é obrigatório" });

      }

      

      // Importa xlsx dinamicamente

      const XLSX = await import('xlsx');

      

      // Lê o arquivo

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });

      const sheetName = workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];

      

      // Converte para JSON

      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      

      if (rawData.length < 2) {

        return res.status(400).json({ message: "Arquivo vazio ou sem dados válidos" });

      }

      

      // Primeira linha são os headers

      const headers = rawData[0] as string[];

      const dataRows = rawData.slice(1);

      

      // Se não tiver mapeamento, tenta mapear automaticamente

      let mapping = columnMapping;

      if (Object.keys(mapping).length === 0) {

        mapping = autoMapColumns(headers);

      }

      

      // Processa as linhas

      const products = [];

      const errors: string[] = [];

      

      for (let i = 0; i < dataRows.length; i++) {

        const row = dataRows[i] as any[];

        const rowNum = i + 2; // +2 porque excel é 1-indexed e pulamos o header

        

        try {

          const product: any = {

            user_id: userId,

            is_active: true,

            unit: 'un',

          };

          

          // Aplica o mapeamento

          for (const [targetField, sourceIndex] of Object.entries(mapping)) {

            if (sourceIndex !== null && sourceIndex !== undefined && sourceIndex !== -1) {

              let value = row[sourceIndex as number];

              

              if (value !== undefined && value !== null && value !== '') {

                // Tratamento específico por campo

                if (targetField === 'price') {

                  // Remove R$, pontos de milhar, substitui vírgula por ponto

                  value = String(value)

                    .replace(/R\$\s*/gi, '')

                    .replace(/\./g, '')

                    .replace(',', '.')

                    .trim();

                  product[targetField] = parseFloat(value) || null;

                } else if (targetField === 'stock') {

                  product[targetField] = parseInt(String(value).replace(/\D/g, '')) || 0;

                } else if (targetField === 'is_active') {

                  product[targetField] = ['sim', 'yes', 'true', '1', 'ativo'].includes(

                    String(value).toLowerCase().trim()

                  );

                } else {

                  product[targetField] = String(value).trim();

                }

              }

            }

          }

          

          // Valida que tem pelo menos nome

          if (!product.name) {

            // Tenta usar o primeiro valor não vazio como nome

            const firstValue = row.find(v => v !== undefined && v !== null && String(v).trim() !== '');

            if (firstValue) {

              product.name = String(firstValue).trim();

            } else {

              errors.push(`Linha ${rowNum}: Nome do produto é obrigatório`);

              continue;

            }

          }

          

          products.push(product);

        } catch (rowError) {

          errors.push(`Linha ${rowNum}: Erro ao processar - ${rowError}`);

        }

      }

      

      if (products.length === 0) {

        return res.status(400).json({ 

          message: "Nenhum produto válido encontrado",

          errors

        });

      }

      

      // =============================================

      // UPSERT OTIMIZADO: Batch lookup para melhor performance

      // Em vez de 2 queries por produto (~3090 queries), faz:

      // - 1 query para buscar todos produtos do usuário

      // - Matching in-memory

      // - Batch insert/update

      // =============================================

      let inserted = 0;

      let updated = 0;

      

      // ?? OTIMIZAÇÃO: Busca TODOS os produtos do usuário de uma vez só

      const { data: existingProducts } = await supabase

        .from('products')

        .select('id, sku, name')

        .eq('user_id', userId);

      

      // Cria maps para lookup rápido O(1) em vez de O(n) por produto

      const productsBySKU = new Map<string, { id: number }>();

      const productsByName = new Map<string, { id: number }>();

      

      if (existingProducts) {

        for (const existing of existingProducts) {

          if (existing.sku) {

            productsBySKU.set(existing.sku.toLowerCase().trim(), { id: existing.id });

          }

          if (existing.name) {

            productsByName.set(existing.name.toLowerCase().trim(), { id: existing.id });

          }

        }

      }

      

      // Separa produtos em inserções e atualizações

      const toInsert: any[] = [];

      const toUpdate: { id: number; data: any }[] = [];

      

      for (const product of products) {

        let existingProduct = null;

        

        // Lookup in-memory - muito mais rápido que query

        if (product.sku) {

          existingProduct = productsBySKU.get(product.sku.toLowerCase().trim());

        }

        

        if (!existingProduct && product.name) {

          existingProduct = productsByName.get(product.name.toLowerCase().trim());

        }

        

        if (existingProduct) {

          // Atualiza existente

          const updateData = { ...product };

          delete updateData.user_id;

          updateData.updated_at = new Date().toISOString();

          toUpdate.push({ id: existingProduct.id, data: updateData });

        } else {

          // Insere novo

          toInsert.push(product);

        }

      }

      

      // ?? Executa inserções em batch (se tiver)

      if (toInsert.length > 0) {

        const { error: insertError } = await supabase

          .from('products')

          .insert(toInsert);

        

        if (!insertError) {

          inserted = toInsert.length;

        } else {

          errors.push(`Erro ao inserir produtos em batch: ${insertError.message}`);

        }

      }

      

      // ?? Executa atualizações (infelizmente Supabase não tem batch update, faz um por um)

      for (const { id, data } of toUpdate) {

        const { error: updateError } = await supabase

          .from('products')

          .update(data)

          .eq('id', id);

        

        if (!updateError) {

          updated++;

        } else {

          errors.push(`Erro ao atualizar produto ${data.name}: ${updateError.message}`);

        }

      }

      

      res.json({ 

        success: true, 

        inserted,

        updated,

        total: dataRows.length,

        errors: errors.length > 0 ? errors : undefined,

        message: `${inserted} produto(s) criado(s), ${updated} produto(s) atualizado(s)`

      });

    } catch (error) {

      console.error("Error importing products:", error);

      res.status(500).json({ message: "Failed to import products" });

    }

  });



  // GET - Preview do arquivo de importação (headers e primeiras linhas)

  app.post("/api/products/import/preview", isAuthenticated, upload.single('file'), async (req: any, res) => {

    try {

      const file = req.file;

      

      if (!file) {

        return res.status(400).json({ message: "Arquivo é obrigatório" });

      }

      

      // Importa xlsx dinamicamente

      const XLSX = await import('xlsx');

      

      // Lê o arquivo

      const workbook = XLSX.read(file.buffer, { type: 'buffer' });

      const sheetName = workbook.SheetNames[0];

      const worksheet = workbook.Sheets[sheetName];

      

      // Converte para JSON

      const rawData: any[] = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '' });

      

      if (rawData.length < 1) {

        return res.status(400).json({ message: "Arquivo vazio" });

      }

      

      const headers = rawData[0] as string[];

      const sampleRows = rawData.slice(1, 6); // Primeiras 5 linhas de dados

      

      // Tenta detectar mapeamento automático

      const suggestedMapping = autoMapColumns(headers);

      

      res.json({

        headers,

        sampleRows,

        totalRows: rawData.length - 1,

        suggestedMapping

      });

    } catch (error) {

      console.error("Error previewing import:", error);

      res.status(500).json({ message: "Failed to preview import" });

    }

  });



  // POST - Importar produtos de URL (Scraping com AI)

  app.post("/api/products/import-url", isAuthenticated, async (req: any, res) => {

    try {

      const { url } = req.body;

      

      if (!url) {

        return res.status(400).json({ message: "URL é obrigatória" });

      }

      

      const validation = validateUrl(url);

      if (!validation.valid) {

        return res.status(400).json({ message: validation.error });

      }

      

      console.log(`[ProductsImport] Scraping de URL: ${validation.normalizedUrl}`);

      

      // Usa o serviço existente de scrape

      const result = await scrapeWebsite(validation.normalizedUrl!);

      

      if (!result.success) {

        return res.status(400).json({ 

          message: result.error || "Falha ao analisar o website. Verifique se a URL está acessível." 

        });

      }

      

      // Mapeia o resultado para o formato esperado pelo frontend de produtos

      const products = result.products.map(p => ({

        name: p.name,

        price: p.priceValue || 0,

        description: p.description || "",

        image: p.imageUrl || null,

        link: validation.normalizedUrl,

        category: p.category || "Importados",

        sku: "",

        unit: "un"

      }));

      

      res.json({

        success: true,

        products,

        total: products.length,

        websiteInfo: {

          name: result.websiteName,

          description: result.websiteDescription

        }

      });

      

    } catch (error: any) {

      console.error("[ProductsImport] Erro ao importar de URL:", error);

      res.status(500).json({ message: "Erro interno ao processar URL. Tente novamente." });

    }

  });



  // GET - Obter categorias únicas dos produtos do usuário

  app.get("/api/products/categories", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data, error } = await supabase

        .from('products')

        .select('category')

        .eq('user_id', userId)

        .not('category', 'is', null);

      

      if (error) throw error;

      

      // Extrai categorias únicas

      const categories = [...new Set((data || []).map(p => p.category).filter(Boolean))];

      

      res.json(categories);

    } catch (error) {

      console.error("Error fetching categories:", error);

      res.status(500).json({ message: "Failed to fetch categories" });

    }

  });



  // =============================================

  // ROTAS DE CONFIGURAÇÃO DE PRODUTOS

  // =============================================



  // GET - Obter configuração de produtos do usuário

  app.get("/api/products-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      let { data, error } = await supabase

        .from('products_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (error && error.code === 'PGRST116') {

        // Não existe, cria com valores padrão - DESATIVADO por padrão

        const { data: newConfig, error: insertError } = await supabase

          .from('products_config')

          .insert({ 

            user_id: userId,

            is_active: false, // DESATIVADO por padrão - ativar via toggle

            send_to_ai: true

          })

          .select()

          .single();

        

        if (insertError) throw insertError;

        data = newConfig;

      } else if (error) {

        throw error;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching products config:", error);

      res.status(500).json({ message: "Failed to fetch products config" });

    }

  });



  // PUT - Atualizar configuração de produtos

  app.put("/api/products-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { isActive, sendToAi, aiInstructions, is_active, send_to_ai, ai_instructions } = req.body;

      

      const updateData: any = {

        updated_at: new Date().toISOString(),

      };

      

      // Aceita tanto camelCase quanto snake_case

      if (isActive !== undefined) updateData.is_active = isActive;

      if (is_active !== undefined) updateData.is_active = is_active;

      if (sendToAi !== undefined) updateData.send_to_ai = sendToAi;

      if (send_to_ai !== undefined) updateData.send_to_ai = send_to_ai;

      if (aiInstructions !== undefined) updateData.ai_instructions = aiInstructions;

      if (ai_instructions !== undefined) updateData.ai_instructions = ai_instructions;

      

      // Tenta update primeiro

      const { data: existing } = await supabase

        .from('products_config')

        .select('id')

        .eq('user_id', userId)

        .single();

      

      let data;

      if (existing) {

        const { data: updated, error } = await supabase

          .from('products_config')

          .update(updateData)

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        data = updated;

      } else {

        const { data: created, error } = await supabase

          .from('products_config')

          .insert({ user_id: userId, ...updateData })

          .select()

          .single();

        

        if (error) throw error;

        data = created;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error updating products config:", error);

      res.status(500).json({ message: "Failed to update products config" });

    }

  });



  // GET - Obter produtos formatados para a IA

  app.get("/api/products/for-ai", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verifica se o módulo está ativo

      const { data: config } = await supabase

        .from('products_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (!config || !config.is_active || !config.send_to_ai) {

        return res.json({ 

          active: false,

          products: [],

          instructions: null 

        });

      }

      

      // Busca produtos ativos

      const { data: products, error } = await supabase

        .from('products')

        .select('name, price, stock, description, category, link, sku, unit')

        .eq('user_id', userId)

        .eq('is_active', true)

        .order('name', { ascending: true });

      

      if (error) throw error;

      

      res.json({

        active: true,

        instructions: config.ai_instructions,

        products: products || [],

        count: products?.length || 0

      });

    } catch (error) {

      console.error("Error fetching products for AI:", error);

      res.status(500).json({ message: "Failed to fetch products for AI" });

    }

  });



  // =============================================

  // ROTAS DE CURSO/INFOPRODUTO

  // =============================================

  

  // --- COURSE CONFIG ---



  // GET - Obter configuração de curso

  app.get("/api/course-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data, error } = await supabase

        .from('course_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (error && error.code !== 'PGRST116') throw error;

      

      // Retorna config padrão se não existir

      if (!data) {

        return res.json({

          id: null,

          user_id: userId,

          is_active: false,

          send_to_ai: true,

          course_name: null,

          course_description: null,

          course_type: 'curso_online',

          target_audience: null,

          not_for_audience: null,

          learning_outcomes: [],

          modules: [],

          total_hours: 0,

          total_lessons: 0,

          access_period: 'vitalicio',

          has_certificate: true,

          certificate_description: null,

          certificate_validity: null,

          guarantee_days: 7,

          guarantee_description: 'Garantia incondicional de satisfação',

          price_full: null,

          price_promotional: null,

          price_installments: 12,

          price_installment_value: null,

          checkout_link: null,

          members_area_link: null,

          sales_page_link: null,

          payment_methods: ['pix', 'cartao_credito', 'boleto'],

          installments_info: null,

          bonus_items: [],

          requirements_description: null,

          equipment_needed: null,

          support_description: null,

          community_info: null,

          testimonials: [],

          results_description: null,

          success_metrics: null,

          active_coupons: [],

          ai_instructions: 'Você é um especialista em vendas de infoprodutos. Seja empático, mostre o valor do curso e sempre mencione a garantia.',

          lead_nurture_message: 'Quando estiver pronto(a), é só me chamar!',

          enrollment_cta: 'Garanta sua vaga com desconto especial!',

        });

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching course config:", error);

      res.status(500).json({ message: "Failed to fetch course config" });

    }

  });



  // PUT - Atualizar configuração de curso

  app.put("/api/course-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const body = req.body;

      

      const updateData: any = {

        updated_at: new Date().toISOString(),

      };

      

      // Lista de campos permitidos

      const allowedFields = [

        'is_active', 'send_to_ai', 'course_name', 'course_description', 'course_type',

        'target_audience', 'not_for_audience', 'learning_outcomes', 'modules',

        'total_hours', 'total_lessons', 'access_period', 'has_certificate',

        'certificate_description', 'certificate_validity', 'guarantee_days',

        'guarantee_description', 'price_full', 'price_promotional', 'price_installments',

        'price_installment_value', 'checkout_link', 'members_area_link', 'sales_page_link',

        'payment_methods', 'installments_info', 'bonus_items', 'requirements_description',

        'equipment_needed', 'support_description', 'community_info', 'testimonials',

        'results_description', 'success_metrics', 'active_coupons', 'ai_instructions',

        'lead_nurture_message', 'enrollment_cta'

      ];

      

      // Mapear camelCase para snake_case

      const camelToSnake = (str: string) => str.replace(/[A-Z]/g, letter => `_${letter.toLowerCase()}`);

      

      for (const [key, value] of Object.entries(body)) {

        const snakeKey = camelToSnake(key);

        if (allowedFields.includes(snakeKey) && value !== undefined) {

          // Converter números se necessário

          if (['price_full', 'price_promotional', 'price_installment_value', 'total_hours'].includes(snakeKey)) {

            updateData[snakeKey] = value ? parseFloat(String(value)) : null;

          } else if (['guarantee_days', 'price_installments', 'total_lessons'].includes(snakeKey)) {

            updateData[snakeKey] = value ? parseInt(String(value)) : null;

          } else {

            updateData[snakeKey] = value;

          }

        }

        // Também aceitar snake_case diretamente

        if (allowedFields.includes(key) && value !== undefined) {

          if (['price_full', 'price_promotional', 'price_installment_value', 'total_hours'].includes(key)) {

            updateData[key] = value ? parseFloat(String(value)) : null;

          } else if (['guarantee_days', 'price_installments', 'total_lessons'].includes(key)) {

            updateData[key] = value ? parseInt(String(value)) : null;

          } else {

            updateData[key] = value;

          }

        }

      }

      

      // Tenta update primeiro, depois insert

      const { data: existing } = await supabase

        .from('course_config')

        .select('id')

        .eq('user_id', userId)

        .single();

      

      if (existing) {

        const { data, error } = await supabase

          .from('course_config')

          .update(updateData)

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        res.json(data);

      } else {

        const { data, error } = await supabase

          .from('course_config')

          .insert({

            user_id: userId,

            ...updateData

          })

          .select()

          .single();

        

        if (error) throw error;

        res.json(data);

      }

    } catch (error) {

      console.error("Error updating course config:", error);

      res.status(500).json({ message: "Failed to update course config" });

    }

  });



  // POST - Adicionar módulo ao curso

  app.post("/api/course-config/modules", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const newModule = req.body;

      

      if (!newModule.name) {

        return res.status(400).json({ message: "Nome do módulo é obrigatório" });

      }

      

      // Buscar configuração atual

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('modules, total_hours, total_lessons')

        .eq('user_id', userId)

        .single();

      

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      

      const currentModules = config?.modules || [];

      const moduleWithId = {

        id: `mod_${Date.now()}`,

        name: newModule.name,

        description: newModule.description || '',

        duration_minutes: newModule.duration_minutes || 60,

        lessons: newModule.lessons || [],

        order: currentModules.length + 1,

      };

      

      const updatedModules = [...currentModules, moduleWithId];

      

      // Recalcular totais

      const totalMinutes = updatedModules.reduce((sum: number, m: any) => sum + (m.duration_minutes || 0), 0);

      const totalLessons = updatedModules.reduce((sum: number, m: any) => sum + (m.lessons?.length || 0), 0);

      

      // Atualizar ou criar

      if (config) {

        const { data, error } = await supabase

          .from('course_config')

          .update({

            modules: updatedModules,

            total_hours: totalMinutes / 60,

            total_lessons: totalLessons,

            updated_at: new Date().toISOString()

          })

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        res.json({ module: moduleWithId, config: data });

      } else {

        const { data, error } = await supabase

          .from('course_config')

          .insert({

            user_id: userId,

            modules: updatedModules,

            total_hours: totalMinutes / 60,

            total_lessons: totalLessons,

          })

          .select()

          .single();

        

        if (error) throw error;

        res.json({ module: moduleWithId, config: data });

      }

    } catch (error) {

      console.error("Error adding course module:", error);

      res.status(500).json({ message: "Failed to add course module" });

    }

  });



  // PUT - Atualizar módulo do curso

  app.put("/api/course-config/modules/:moduleId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { moduleId } = req.params;

      const updates = req.body;

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('modules')

        .eq('user_id', userId)

        .single();

      

      if (fetchError) throw fetchError;

      

      const modules = config?.modules || [];

      const moduleIndex = modules.findIndex((m: any) => m.id === moduleId);

      

      if (moduleIndex === -1) {

        return res.status(404).json({ message: "Módulo não encontrado" });

      }

      

      modules[moduleIndex] = { ...modules[moduleIndex], ...updates };

      

      // Recalcular totais

      const totalMinutes = modules.reduce((sum: number, m: any) => sum + (m.duration_minutes || 0), 0);

      const totalLessons = modules.reduce((sum: number, m: any) => sum + (m.lessons?.length || 0), 0);

      

      const { data, error } = await supabase

        .from('course_config')

        .update({

          modules,

          total_hours: totalMinutes / 60,

          total_lessons: totalLessons,

          updated_at: new Date().toISOString()

        })

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.error("Error updating course module:", error);

      res.status(500).json({ message: "Failed to update course module" });

    }

  });



  // DELETE - Remover módulo do curso

  app.delete("/api/course-config/modules/:moduleId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { moduleId } = req.params;

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('modules')

        .eq('user_id', userId)

        .single();

      

      if (fetchError) throw fetchError;

      

      const modules = (config?.modules || []).filter((m: any) => m.id !== moduleId);

      

      // Recalcular totais

      const totalMinutes = modules.reduce((sum: number, m: any) => sum + (m.duration_minutes || 0), 0);

      const totalLessons = modules.reduce((sum: number, m: any) => sum + (m.lessons?.length || 0), 0);

      

      const { data, error } = await supabase

        .from('course_config')

        .update({

          modules,

          total_hours: totalMinutes / 60,

          total_lessons: totalLessons,

          updated_at: new Date().toISOString()

        })

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.error("Error deleting course module:", error);

      res.status(500).json({ message: "Failed to delete course module" });

    }

  });



  // POST - Adicionar bônus ao curso

  app.post("/api/course-config/bonus", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const newBonus = req.body;

      

      if (!newBonus.name) {

        return res.status(400).json({ message: "Nome do bônus é obrigatório" });

      }

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('bonus_items')

        .eq('user_id', userId)

        .single();

      

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      

      const currentBonus = config?.bonus_items || [];

      const bonusWithId = {

        id: `bonus_${Date.now()}`,

        name: newBonus.name,

        description: newBonus.description || '',

        value: newBonus.value || 0,

      };

      

      const updatedBonus = [...currentBonus, bonusWithId];

      

      if (config) {

        const { data, error } = await supabase

          .from('course_config')

          .update({

            bonus_items: updatedBonus,

            updated_at: new Date().toISOString()

          })

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        res.json({ bonus: bonusWithId, config: data });

      } else {

        const { data, error } = await supabase

          .from('course_config')

          .insert({

            user_id: userId,

            bonus_items: updatedBonus,

          })

          .select()

          .single();

        

        if (error) throw error;

        res.json({ bonus: bonusWithId, config: data });

      }

    } catch (error) {

      console.error("Error adding course bonus:", error);

      res.status(500).json({ message: "Failed to add course bonus" });

    }

  });



  // DELETE - Remover bônus do curso

  app.delete("/api/course-config/bonus/:bonusId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { bonusId } = req.params;

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('bonus_items')

        .eq('user_id', userId)

        .single();

      

      if (fetchError) throw fetchError;

      

      const bonusItems = (config?.bonus_items || []).filter((b: any) => b.id !== bonusId);

      

      const { data, error } = await supabase

        .from('course_config')

        .update({

          bonus_items: bonusItems,

          updated_at: new Date().toISOString()

        })

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.error("Error deleting course bonus:", error);

      res.status(500).json({ message: "Failed to delete course bonus" });

    }

  });



  // POST - Adicionar depoimento

  app.post("/api/course-config/testimonials", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const newTestimonial = req.body;

      

      if (!newTestimonial.name || !newTestimonial.text) {

        return res.status(400).json({ message: "Nome e texto do depoimento são obrigatórios" });

      }

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('testimonials')

        .eq('user_id', userId)

        .single();

      

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      

      const currentTestimonials = config?.testimonials || [];

      const testimonialWithId = {

        id: `test_${Date.now()}`,

        name: newTestimonial.name,

        photo_url: newTestimonial.photo_url || null,

        text: newTestimonial.text,

        result: newTestimonial.result || '',

      };

      

      const updatedTestimonials = [...currentTestimonials, testimonialWithId];

      

      if (config) {

        const { data, error } = await supabase

          .from('course_config')

          .update({

            testimonials: updatedTestimonials,

            updated_at: new Date().toISOString()

          })

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        res.json({ testimonial: testimonialWithId, config: data });

      } else {

        const { data, error } = await supabase

          .from('course_config')

          .insert({

            user_id: userId,

            testimonials: updatedTestimonials,

          })

          .select()

          .single();

        

        if (error) throw error;

        res.json({ testimonial: testimonialWithId, config: data });

      }

    } catch (error) {

      console.error("Error adding course testimonial:", error);

      res.status(500).json({ message: "Failed to add course testimonial" });

    }

  });



  // DELETE - Remover depoimento

  app.delete("/api/course-config/testimonials/:testimonialId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { testimonialId } = req.params;

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('testimonials')

        .eq('user_id', userId)

        .single();

      

      if (fetchError) throw fetchError;

      

      const testimonials = (config?.testimonials || []).filter((t: any) => t.id !== testimonialId);

      

      const { data, error } = await supabase

        .from('course_config')

        .update({

          testimonials,

          updated_at: new Date().toISOString()

        })

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.error("Error deleting course testimonial:", error);

      res.status(500).json({ message: "Failed to delete course testimonial" });

    }

  });



  // POST - Adicionar cupom ativo

  app.post("/api/course-config/coupons", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const newCoupon = req.body;

      

      if (!newCoupon.code) {

        return res.status(400).json({ message: "Código do cupom é obrigatório" });

      }

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('active_coupons')

        .eq('user_id', userId)

        .single();

      

      if (fetchError && fetchError.code !== 'PGRST116') throw fetchError;

      

      const currentCoupons = config?.active_coupons || [];

      const couponWithId = {

        id: `coupon_${Date.now()}`,

        code: newCoupon.code.toUpperCase(),

        discount_percent: newCoupon.discount_percent || null,

        discount_value: newCoupon.discount_value || null,

        expires_at: newCoupon.expires_at || null,

        description: newCoupon.description || '',

      };

      

      const updatedCoupons = [...currentCoupons, couponWithId];

      

      if (config) {

        const { data, error } = await supabase

          .from('course_config')

          .update({

            active_coupons: updatedCoupons,

            updated_at: new Date().toISOString()

          })

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        res.json({ coupon: couponWithId, config: data });

      } else {

        const { data, error } = await supabase

          .from('course_config')

          .insert({

            user_id: userId,

            active_coupons: updatedCoupons,

          })

          .select()

          .single();

        

        if (error) throw error;

        res.json({ coupon: couponWithId, config: data });

      }

    } catch (error) {

      console.error("Error adding course coupon:", error);

      res.status(500).json({ message: "Failed to add course coupon" });

    }

  });



  // DELETE - Remover cupom

  app.delete("/api/course-config/coupons/:couponId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { couponId } = req.params;

      

      const { data: config, error: fetchError } = await supabase

        .from('course_config')

        .select('active_coupons')

        .eq('user_id', userId)

        .single();

      

      if (fetchError) throw fetchError;

      

      const activeCoupons = (config?.active_coupons || []).filter((c: any) => c.id !== couponId);

      

      const { data, error } = await supabase

        .from('course_config')

        .update({

          active_coupons: activeCoupons,

          updated_at: new Date().toISOString()

        })

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error) {

      console.error("Error deleting course coupon:", error);

      res.status(500).json({ message: "Failed to delete course coupon" });

    }

  });



  // GET - Dados do curso formatados para IA

  app.get("/api/course-config/ai-context", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data: config, error } = await supabase

        .from('course_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (error && error.code !== 'PGRST116') throw error;

      

      if (!config || !config.is_active) {

        return res.json({

          enabled: false,

          context: ''

        });

      }

      

      // Formatar contexto para IA

      let context = `

?? INFORMAÇÕES DO CURSO: ${config.course_name || 'Curso'}



${config.course_description || ''}



?? PARA QUEM É:

${config.target_audience || 'Pessoas interessadas em aprender'}



? PARA QUEM NÃO É:

${config.not_for_audience || 'Não especificado'}



?? CONTEÚDO (${config.total_hours || 0} horas, ${config.total_lessons || 0} aulas):

${(config.modules || []).map((m: any, i: number) => `${i + 1}. ${m.name}: ${m.description || ''}`).join('\n')}



?? INVESTIMENTO:

- Preço: R$ ${config.price_promotional || config.price_full || 'Consultar'}

${config.price_installments ? `- Parcelamento em até ${config.price_installments}x` : ''}

${config.price_installment_value ? `- Parcelas de R$ ${config.price_installment_value}` : ''}



? GARANTIA: ${config.guarantee_days || 7} dias

${config.guarantee_description || 'Garantia de satisfação'}



?? CERTIFICADO: ${config.has_certificate ? 'Sim' : 'Não'}

${config.certificate_description || ''}



?? ACESSO: ${config.access_period || 'Vitalício'}



?? BÔNUS INCLUSOS:

${(config.bonus_items || []).map((b: any) => ` ${b.name}${b.value ? ` (valor: R$ ${b.value})` : ''}`).join('\n') || 'Nenhum bônus cadastrado'}



?? FORMAS DE PAGAMENTO:

${(config.payment_methods || []).join(', ')}



?? LINK DE INSCRIÇÃO:

${config.checkout_link || 'Solicitar ao atendimento'}



?? SUPORTE:

${config.support_description || 'Suporte dedicado ao aluno'}

${config.community_info || ''}



? DEPOIMENTOS DE ALUNOS:

${(config.testimonials || []).slice(0, 3).map((t: any) => `"${t.text}" - ${t.name}`).join('\n\n') || 'Ainda não há depoimentos'}



?? RESULTADOS:

${config.results_description || ''}

${config.success_metrics || ''}



??? CUPONS ATIVOS:

${(config.active_coupons || []).map((c: any) => `${c.code}: ${c.discount_percent ? c.discount_percent + '% de desconto' : 'R$ ' + c.discount_value + ' de desconto'}`).join('\n') || 'Nenhum cupom ativo'}



INSTRUÇÕES PARA O AGENTE:

${config.ai_instructions || ''}

`.trim();

      

      res.json({

        enabled: true,

        context,

        config

      });

    } catch (error) {

      console.error("Error fetching course AI context:", error);

      res.status(500).json({ message: "Failed to fetch course AI context" });

    }

  });



  // =============================================

  // ROTAS DE DELIVERY (CARDÁPIO DIGITAL)

  // =============================================



  // --- DELIVERY CONFIG ---



  // GET - Obter configuração de delivery

  app.get("/api/delivery-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data, error } = await supabase

        .from('delivery_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (error && error.code !== 'PGRST116') throw error;

      

      // Retorna config padrão se não existir

      if (!data) {

        return res.json({

          id: null,

          user_id: userId,

          is_active: false,

          send_to_ai: true,

          business_name: null,

          business_type: 'restaurante',

          delivery_fee: 0,

          min_order_value: 0,

          estimated_delivery_time: 45,

          delivery_radius_km: 10,

          payment_methods: ['dinheiro', 'cartao', 'pix'],

          accepts_delivery: true,

          accepts_pickup: true,

          opening_hours: {},

          ai_instructions: 'Você é um atendente de delivery. Seja simpático, ajude o cliente a escolher, anote os pedidos corretamente com todos os detalhes e sempre confirme antes de finalizar.',

          whatsapp_order_number: null,

        });

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching delivery config:", error);

      res.status(500).json({ message: "Failed to fetch delivery config" });

    }

  });



  // PUT - Atualizar configuração de delivery

  app.put("/api/delivery-config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const body = req.body;

      

      const updateData: any = {

        updated_at: new Date().toISOString(),

      };

      

      // Mapear campos (aceita camelCase e snake_case)

      const fieldMappings: Record<string, string> = {

        isActive: 'is_active', is_active: 'is_active',

        sendToAi: 'send_to_ai', send_to_ai: 'send_to_ai',

        businessName: 'business_name', business_name: 'business_name',

        businessType: 'business_type', business_type: 'business_type',

        deliveryFee: 'delivery_fee', delivery_fee: 'delivery_fee',

        minOrderValue: 'min_order_value', min_order_value: 'min_order_value',

        estimatedDeliveryTime: 'estimated_delivery_time', estimated_delivery_time: 'estimated_delivery_time',

        deliveryRadiusKm: 'delivery_radius_km', delivery_radius_km: 'delivery_radius_km',

        paymentMethods: 'payment_methods', payment_methods: 'payment_methods',

        acceptsDelivery: 'accepts_delivery', accepts_delivery: 'accepts_delivery',

        acceptsPickup: 'accepts_pickup', accepts_pickup: 'accepts_pickup',

        openingHours: 'opening_hours', opening_hours: 'opening_hours',

        aiInstructions: 'ai_instructions', ai_instructions: 'ai_instructions',

        whatsappOrderNumber: 'whatsapp_order_number', whatsapp_order_number: 'whatsapp_order_number',

      };

      

      for (const [key, value] of Object.entries(body)) {

        const dbField = fieldMappings[key];

        if (dbField && value !== undefined) {

          // Converter números se necessário

          if (['delivery_fee', 'min_order_value', 'delivery_radius_km'].includes(dbField)) {

            updateData[dbField] = value ? parseFloat(String(value)) : 0;

          } else if (['estimated_delivery_time'].includes(dbField)) {

            updateData[dbField] = value ? parseInt(String(value)) : 45;

          } else {

            updateData[dbField] = value;

          }

        }

      }

      

      // Tenta update primeiro, depois insert

      const { data: existing } = await supabase

        .from('delivery_config')

        .select('id')

        .eq('user_id', userId)

        .single();

      

      let data;

      if (existing) {

        const { data: updated, error } = await supabase

          .from('delivery_config')

          .update(updateData)

          .eq('user_id', userId)

          .select()

          .single();

        

        if (error) throw error;

        data = updated;

      } else {

        const { data: created, error } = await supabase

          .from('delivery_config')

          .insert({ user_id: userId, ...updateData })

          .select()

          .single();

        

        if (error) throw error;

        data = created;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error updating delivery config:", error);

      res.status(500).json({ message: "Failed to update delivery config" });

    }

  });



  // --- MENU CATEGORIES ---



  // GET - Listar categorias do cardápio

  app.get("/api/delivery/categories", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data, error } = await supabase

        .from('menu_categories')

        .select('*')

        .eq('user_id', userId)

        .order('display_order', { ascending: true })

        .order('name', { ascending: true });

      

      if (error) throw error;

      

      res.json(data || []);

    } catch (error) {

      console.error("Error fetching menu categories:", error);

      res.status(500).json({ message: "Failed to fetch menu categories" });

    }

  });



  // POST - Criar categoria

  app.post("/api/delivery/categories", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, description, imageUrl, displayOrder, isActive } = req.body;

      

      if (!name) {

        return res.status(400).json({ message: "Nome da categoria é obrigatório" });

      }

      

      const { data, error } = await supabase

        .from('menu_categories')

        .insert({

          user_id: userId,

          name,

          description,

          image_url: imageUrl || null,

          display_order: displayOrder || 0,

          is_active: isActive !== false,

        })

        .select()

        .single();

      

      if (error) throw error;

      

      res.status(201).json(data);

    } catch (error) {

      console.error("Error creating menu category:", error);

      res.status(500).json({ message: "Failed to create menu category" });

    }

  });



  // PUT - Atualizar categoria

  app.put("/api/delivery/categories/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, description, imageUrl, displayOrder, isActive } = req.body;

      

      const updateData: any = { updated_at: new Date().toISOString() };

      if (name !== undefined) updateData.name = name;

      if (description !== undefined) updateData.description = description;

      if (imageUrl !== undefined) updateData.image_url = imageUrl;

      if (displayOrder !== undefined) updateData.display_order = displayOrder;

      if (isActive !== undefined) updateData.is_active = isActive;

      

      const { data, error } = await supabase

        .from('menu_categories')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      

      res.json(data);

    } catch (error) {

      console.error("Error updating menu category:", error);

      res.status(500).json({ message: "Failed to update menu category" });

    }

  });



  // DELETE - Remover categoria

  app.delete("/api/delivery/categories/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('menu_categories')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error deleting menu category:", error);

      res.status(500).json({ message: "Failed to delete menu category" });

    }

  });



  // --- MENU ITEMS ---



  // GET - Listar itens do cardápio

  app.get("/api/delivery/items", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { categoryId, isAvailable, search, page = 1, limit = 50 } = req.query;

      

      let query = supabase

        .from('menu_items')

        .select('*, menu_categories(id, name)', { count: 'exact' })

        .eq('user_id', userId)

        .order('display_order', { ascending: true })

        .order('name', { ascending: true });

      

      if (categoryId) {

        query = query.eq('category_id', categoryId);

      }

      

      if (isAvailable !== undefined) {

        query = query.eq('is_available', isAvailable === 'true');

      }

      

      if (search) {

        query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);

      }

      

      const pageNum = parseInt(page as string);

      const limitNum = parseInt(limit as string);

      query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

      

      const { data, error, count } = await query;

      

      if (error) throw error;

      

      res.json({

        items: data || [],

        total: count || 0,

        page: pageNum,

        totalPages: Math.ceil((count || 0) / limitNum)

      });

    } catch (error) {

      console.error("Error fetching menu items:", error);

      res.status(500).json({ message: "Failed to fetch menu items" });

    }

  });



  // GET - Item específico

  app.get("/api/delivery/items/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { data, error } = await supabase

        .from('menu_items')

        .select('*, menu_categories(id, name)')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (error) {

        if (error.code === 'PGRST116') {

          return res.status(404).json({ message: "Item not found" });

        }

        throw error;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching menu item:", error);

      res.status(500).json({ message: "Failed to fetch menu item" });

    }

  });



  // POST - Criar item do cardápio

  app.post("/api/delivery/items", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { 

        categoryId, name, description, price, promotionalPrice,

        imageUrl, preparationTime, isAvailable, isFeatured,

        options, ingredients, allergens, serves, displayOrder

      } = req.body;

      

      if (!name) {

        return res.status(400).json({ message: "Nome do item é obrigatório" });

      }

      if (!price) {

        return res.status(400).json({ message: "Preço é obrigatório" });

      }

      

      const { data, error } = await supabase

        .from('menu_items')

        .insert({

          user_id: userId,

          category_id: categoryId || null,

          name,

          description,

          price: parseFloat(String(price)),

          promotional_price: promotionalPrice ? parseFloat(String(promotionalPrice)) : null,

          image_url: imageUrl || null,

          preparation_time: preparationTime || 30,

          is_available: isAvailable !== false,

          is_featured: isFeatured === true,

          options: options || [],

          ingredients,

          allergens,

          serves: serves || 1,

          display_order: displayOrder || 0,

        })

        .select('*, menu_categories(id, name)')

        .single();

      

      if (error) throw error;

      

      res.status(201).json(data);

    } catch (error) {

      console.error("Error creating menu item:", error);

      res.status(500).json({ message: "Failed to create menu item" });

    }

  });



  // PUT - Atualizar item do cardápio

  app.put("/api/delivery/items/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const body = req.body;

      

      const updateData: any = { updated_at: new Date().toISOString() };

      

      const fieldMappings: Record<string, string> = {

        categoryId: 'category_id', name: 'name', description: 'description',

        price: 'price', promotionalPrice: 'promotional_price',

        imageUrl: 'image_url', preparationTime: 'preparation_time',

        isAvailable: 'is_available', isFeatured: 'is_featured',

        options: 'options', ingredients: 'ingredients',

        allergens: 'allergens', serves: 'serves', displayOrder: 'display_order',

      };

      

      for (const [key, dbField] of Object.entries(fieldMappings)) {

        if (body[key] !== undefined) {

          if (['price', 'promotional_price'].includes(dbField)) {

            updateData[dbField] = body[key] ? parseFloat(String(body[key])) : null;

          } else if (['preparation_time', 'serves', 'display_order'].includes(dbField)) {

            updateData[dbField] = parseInt(String(body[key])) || 0;

          } else {

            updateData[dbField] = body[key];

          }

        }

      }

      

      const { data, error } = await supabase

        .from('menu_items')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select('*, menu_categories(id, name)')

        .single();

      

      if (error) throw error;

      

      res.json(data);

    } catch (error) {

      console.error("Error updating menu item:", error);

      res.status(500).json({ message: "Failed to update menu item" });

    }

  });



  // DELETE - Remover item

  app.delete("/api/delivery/items/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('menu_items')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error deleting menu item:", error);

      res.status(500).json({ message: "Failed to delete menu item" });

    }

  });



  // DELETE - Remover múltiplos itens

  app.delete("/api/delivery/items", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { ids } = req.body;

      

      if (!ids || !Array.isArray(ids) || ids.length === 0) {

        return res.status(400).json({ message: "IDs são obrigatórios" });

      }

      

      const { error } = await supabase

        .from('menu_items')

        .delete()

        .eq('user_id', userId)

        .in('id', ids);

      

      if (error) throw error;

      

      res.json({ success: true, deleted: ids.length });

    } catch (error) {

      console.error("Error deleting menu items:", error);

      res.status(500).json({ message: "Failed to delete menu items" });

    }

  });



  // --- DELIVERY ORDERS ---



  // GET - Listar pedidos

  app.get("/api/delivery/orders", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { status, startDate, endDate, page = 1, limit = 50 } = req.query;

      

      let query = supabase

        .from('delivery_orders')

        .select('*, order_items(*)', { count: 'exact' })

        .eq('user_id', userId)

        .order('created_at', { ascending: false });

      

      if (status) {

        if (status === 'active') {

          query = query.in('status', ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery']);

        } else {

          query = query.eq('status', status);

        }

      }

      

      if (startDate) {

        query = query.gte('created_at', startDate);

      }

      if (endDate) {

        query = query.lte('created_at', endDate);

      }

      

      const pageNum = parseInt(page as string);

      const limitNum = parseInt(limit as string);

      query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

      

      const { data, error, count } = await query;

      

      if (error) throw error;

      

      res.json({

        orders: data || [],

        total: count || 0,

        page: pageNum,

        totalPages: Math.ceil((count || 0) / limitNum)

      });

    } catch (error) {

      console.error("Error fetching delivery orders:", error);

      res.status(500).json({ message: "Failed to fetch delivery orders" });

    }

  });



  // GET - Pedido específico

  app.get("/api/delivery/orders/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { data, error } = await supabase

        .from('delivery_orders')

        .select('*, order_items(*)')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (error) {

        if (error.code === 'PGRST116') {

          return res.status(404).json({ message: "Order not found" });

        }

        throw error;

      }

      

      res.json(data);

    } catch (error) {

      console.error("Error fetching delivery order:", error);

      res.status(500).json({ message: "Failed to fetch delivery order" });

    }

  });



  // POST - Criar pedido (manual ou via IA)

  app.post("/api/delivery/orders", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const {

        conversationId, customerName, customerPhone, customerAddress,

        customerComplement, customerReference, deliveryType, paymentMethod,

        notes, items, deliveryFee, discount, createdByAi

      } = req.body;

      

      if (!items || !Array.isArray(items) || items.length === 0) {

        return res.status(400).json({ message: "Itens são obrigatórios" });

      }

      

      // Calcular totais

      let subtotal = 0;

      for (const item of items) {

        subtotal += (item.quantity || 1) * parseFloat(String(item.unitPrice || 0));

      }

      const total = subtotal + parseFloat(String(deliveryFee || 0)) - parseFloat(String(discount || 0));

      

      // Buscar configuração para tempo estimado

      const { data: config } = await supabase

        .from('delivery_config')

        .select('estimated_delivery_time')

        .eq('user_id', userId)

        .single();

      

      // Criar pedido

      const { data: order, error: orderError } = await supabase

        .from('delivery_orders')

        .insert({

          user_id: userId,

          conversation_id: conversationId || null,

          customer_name: customerName,

          customer_phone: customerPhone,

          customer_address: customerAddress,

          customer_complement: customerComplement,

          customer_reference: customerReference,

          delivery_type: deliveryType || 'delivery',

          status: 'pending',

          payment_method: paymentMethod,

          payment_status: 'pending',

          subtotal,

          delivery_fee: deliveryFee || 0,

          discount: discount || 0,

          total,

          notes,

          estimated_time: config?.estimated_delivery_time || 45,

          created_by_ai: createdByAi === true,

        })

        .select()

        .single();

      

      if (orderError) throw orderError;

      

      // Criar itens do pedido

      const orderItems = items.map((item: any) => ({

        order_id: order.id,

        menu_item_id: item.menuItemId || null,

        item_name: item.name || item.itemName,

        quantity: item.quantity || 1,

        unit_price: parseFloat(String(item.unitPrice)),

        total_price: (item.quantity || 1) * parseFloat(String(item.unitPrice)),

        options_selected: item.optionsSelected || item.options || [],

        notes: item.notes,

      }));

      

      const { error: itemsError } = await supabase

        .from('order_items')

        .insert(orderItems);

      

      if (itemsError) throw itemsError;

      

      // Buscar pedido completo

      const { data: fullOrder, error: fullError } = await supabase

        .from('delivery_orders')

        .select('*, order_items(*)')

        .eq('id', order.id)

        .single();

      

      if (fullError) throw fullError;

      

      // ?? ENVIAR NOTIFICAÇÃO WHATSAPP PARA O DONO DO ESTABELECIMENTO

      try {

        const { data: deliveryConfig } = await supabase

          .from('delivery_config')

          .select('whatsapp_order_number, business_name')

          .eq('user_id', userId)

          .single();

        

        if (deliveryConfig?.whatsapp_order_number) {

          const notifyNumber = deliveryConfig.whatsapp_order_number.replace(/\D/g, '');

          

          // Formatar preço

          const formatPrice = (val: number) => val.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

          

          // Montar mensagem de notificação

          const itemsList = items.map((i: any) => 

            ` ${i.quantity || 1}x ${i.name || i.itemName} - ${formatPrice((i.quantity || 1) * parseFloat(String(i.unitPrice)))}`

          ).join('\n');

          

          const orderNotification = `?? *NOVO PEDIDO #${fullOrder.order_number}*\n\n` +

            `?? *Cliente:* ${customerName || 'Não informado'}\n` +

            `?? *Telefone:* ${customerPhone || 'Não informado'}\n` +

            `?? *${deliveryType === 'pickup' ? 'RETIRADA NO LOCAL' : `Entrega: ${customerAddress || 'Não informado'}`}*\n` +

            `${customerComplement ? `    _${customerComplement}_\n` : ''}` +

            `\n?? *Itens:*\n${itemsList}\n\n` +

            `?? Subtotal: ${formatPrice(subtotal)}\n` +

            `${parseFloat(String(deliveryFee || 0)) > 0 ? `?? Taxa entrega: ${formatPrice(parseFloat(String(deliveryFee)))}\n` : ''}` +

            `${parseFloat(String(discount || 0)) > 0 ? `??? Desconto: -${formatPrice(parseFloat(String(discount)))}\n` : ''}` +

            `?? *TOTAL: ${formatPrice(total)}*\n\n` +

            `?? *Pagamento:* ${paymentMethod || 'Não informado'}\n` +

            `${notes ? `?? Obs: ${notes}\n` : ''}\n` +

            `? Acesse o painel para confirmar o pedido!`;

          

          // Verificar se tem sessão WhatsApp ativa e enviar

          const { sendWhatsAppMessageFromUser } = await import('./whatsappSender');

          await sendWhatsAppMessageFromUser(userId, notifyNumber, orderNotification);

          console.log(`?? [Delivery] Notificação enviada para ${notifyNumber} - Pedido #${fullOrder.order_number}`);

        }

      } catch (notifyError) {

        console.error(`?? [Delivery] Erro ao enviar notificação WhatsApp:`, notifyError);

        // Não falha a criação do pedido por erro de notificação

      }

      

      res.status(201).json(fullOrder);

    } catch (error) {

      console.error("Error creating delivery order:", error);

      res.status(500).json({ message: "Failed to create delivery order" });

    }

  });



  // PUT - Atualizar status do pedido

  app.put("/api/delivery/orders/:id/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { status, cancellationReason } = req.body;

      

      const validStatuses = ['pending', 'confirmed', 'preparing', 'ready', 'out_for_delivery', 'delivered', 'cancelled'];

      if (!validStatuses.includes(status)) {

        return res.status(400).json({ message: "Status inválido" });

      }

      

      const updateData: any = {

        status,

        updated_at: new Date().toISOString(),

      };

      

      // Timestamps por status

      if (status === 'confirmed') updateData.confirmed_at = new Date().toISOString();

      if (status === 'ready') updateData.ready_at = new Date().toISOString();

      if (status === 'out_for_delivery') updateData.out_for_delivery_at = new Date().toISOString();

      if (status === 'delivered') updateData.delivered_at = new Date().toISOString();

      if (status === 'cancelled') {

        updateData.cancelled_at = new Date().toISOString();

        updateData.cancellation_reason = cancellationReason || null;

      }

      

      const { data, error } = await supabase

        .from('delivery_orders')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select('*, order_items(*)')

        .single();

      

      if (error) throw error;

      

      res.json(data);

    } catch (error) {

      console.error("Error updating order status:", error);

      res.status(500).json({ message: "Failed to update order status" });

    }

  });



  // PUT - Atualizar pedido completo

  app.put("/api/delivery/orders/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const body = req.body;

      

      const updateData: any = { updated_at: new Date().toISOString() };

      

      const fieldMappings: Record<string, string> = {

        customerName: 'customer_name', customerPhone: 'customer_phone',

        customerAddress: 'customer_address', customerComplement: 'customer_complement',

        customerReference: 'customer_reference', deliveryType: 'delivery_type',

        paymentMethod: 'payment_method', paymentStatus: 'payment_status',

        notes: 'notes', estimatedTime: 'estimated_time',

      };

      

      for (const [key, dbField] of Object.entries(fieldMappings)) {

        if (body[key] !== undefined) {

          updateData[dbField] = body[key];

        }

      }

      

      const { data, error } = await supabase

        .from('delivery_orders')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select('*, order_items(*)')

        .single();

      

      if (error) throw error;

      

      res.json(data);

    } catch (error) {

      console.error("Error updating delivery order:", error);

      res.status(500).json({ message: "Failed to update delivery order" });

    }

  });



  // GET - Cardápio completo formatado para IA

  app.get("/api/delivery/menu-for-ai", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verifica se o módulo está ativo

      const { data: config } = await supabase

        .from('delivery_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (!config || !config.is_active || !config.send_to_ai) {

        return res.json({ 

          active: false,

          menu: [],

          config: null,

          instructions: null 

        });

      }

      

      // Busca categorias e itens

      const { data: categories } = await supabase

        .from('menu_categories')

        .select('*')

        .eq('user_id', userId)

        .eq('is_active', true)

        .order('display_order', { ascending: true });

      

      const { data: items } = await supabase

        .from('menu_items')

        .select('*')

        .eq('user_id', userId)

        .eq('is_available', true)

        .order('display_order', { ascending: true });

      

      // Organiza por categoria

      const menu = (categories || []).map(cat => ({

        category: cat.name,

        description: cat.description,

        items: (items || [])

          .filter(item => item.category_id === cat.id)

          .map(item => ({

            name: item.name,

            description: item.description,

            price: parseFloat(item.price),

            promotionalPrice: item.promotional_price ? parseFloat(item.promotional_price) : null,

            preparationTime: item.preparation_time,

            serves: item.serves,

            options: item.options,

          }))

      }));

      

      // Itens sem categoria

      const uncategorizedItems = (items || [])

        .filter(item => !item.category_id)

        .map(item => ({

          name: item.name,

          description: item.description,

          price: parseFloat(item.price),

          promotionalPrice: item.promotional_price ? parseFloat(item.promotional_price) : null,

          preparationTime: item.preparation_time,

          serves: item.serves,

          options: item.options,

        }));

      

      if (uncategorizedItems.length > 0) {

        menu.push({

          category: 'Outros',

          description: null,

          items: uncategorizedItems,

        });

      }

      

      res.json({

        active: true,

        config: {

          businessName: config.business_name,

          businessType: config.business_type,

          deliveryFee: config.delivery_fee,

          minOrderValue: config.min_order_value,

          estimatedDeliveryTime: config.estimated_delivery_time,

          paymentMethods: config.payment_methods,

          acceptsDelivery: config.accepts_delivery,

          acceptsPickup: config.accepts_pickup,

          openingHours: config.opening_hours,

        },

        instructions: config.ai_instructions,

        menu,

        totalItems: items?.length || 0,

      });

    } catch (error) {

      console.error("Error fetching menu for AI:", error);

      res.status(500).json({ message: "Failed to fetch menu for AI" });

    }

  });



  // GET - Cardápio PÚBLICO para simulador de fluxo (sem autenticação)

  // Usado pelo flow-builder para carregar itens reais do usuário

  app.get("/api/public/delivery/menu/:userId", async (req: any, res) => {

    try {

      const { userId } = req.params;

      

      if (!userId) {

        return res.status(400).json({ message: "userId é obrigatório" });

      }

      

      // Verifica se o módulo delivery está ativo

      const { data: config } = await supabase

        .from('delivery_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      // Busca categorias

      const { data: categories } = await supabase

        .from('menu_categories')

        .select('*')

        .eq('user_id', userId)

        .eq('is_active', true)

        .order('display_order', { ascending: true });

      

      // Busca itens disponíveis

      const { data: items } = await supabase

        .from('menu_items')

        .select('*')

        .eq('user_id', userId)

        .eq('is_available', true)

        .order('display_order', { ascending: true });

      

      // Formato para usar como Lista no WhatsApp (sections com rows)

      const sections = (categories || []).map(cat => ({

        title: cat.name,

        rows: (items || [])

          .filter(item => item.category_id === cat.id)

          .map(item => ({

            id: item.id,

            title: item.name,

            description: `R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}${item.description ? ' - ' + item.description.substring(0, 50) : ''}`,

            price: parseFloat(item.price),

            menuItemId: item.id,

          }))

      })).filter(s => s.rows.length > 0);

      

      // Itens sem categoria

      const uncategorizedItems = (items || []).filter(item => !item.category_id);

      if (uncategorizedItems.length > 0) {

        sections.push({

          title: 'Outros',

          rows: uncategorizedItems.map(item => ({

            id: item.id,

            title: item.name,

            description: `R$ ${parseFloat(item.price).toFixed(2).replace('.', ',')}${item.description ? ' - ' + item.description.substring(0, 50) : ''}`,

            price: parseFloat(item.price),

            menuItemId: item.id,

          }))

        });

      }

      

      res.json({

        active: config?.is_active || false,

        config: config ? {

          businessName: config.business_name,

          businessType: config.business_type,

          deliveryFee: parseFloat(config.delivery_fee || '0'),

          minOrderValue: parseFloat(config.min_order_value || '0'),

          estimatedDeliveryTime: config.estimated_delivery_time || 45,

          paymentMethods: config.payment_methods || ['dinheiro', 'cartao', 'pix'],

          acceptsDelivery: config.accepts_delivery !== false,

          acceptsPickup: config.accepts_pickup !== false,

        } : null,

        sections,

        totalItems: items?.length || 0,

      });

    } catch (error) {

      console.error("Error fetching public menu:", error);

      res.status(500).json({ message: "Failed to fetch menu" });

    }

  });



  // POST - Criar pedido PÚBLICO a partir do simulador de fluxo

  app.post("/api/public/delivery/orders", async (req: any, res) => {

    try {

      const {

        userId, customerName, customerPhone, customerAddress,

        deliveryType, paymentMethod, notes, items, deliveryFee, discount

      } = req.body;

      

      if (!userId) {

        return res.status(400).json({ message: "userId é obrigatório" });

      }

      if (!items || !Array.isArray(items) || items.length === 0) {

        return res.status(400).json({ message: "Itens são obrigatórios" });

      }

      

      // Calcular totais

      let subtotal = 0;

      for (const item of items) {

        subtotal += (item.quantity || 1) * parseFloat(String(item.price || item.unitPrice || 0));

      }

      const total = subtotal + parseFloat(String(deliveryFee || 0)) - parseFloat(String(discount || 0));

      

      // Buscar configuração para tempo estimado

      const { data: config } = await supabase

        .from('delivery_config')

        .select('estimated_delivery_time')

        .eq('user_id', userId)

        .single();

      

      // Criar pedido

      const { data: order, error: orderError } = await supabase

        .from('delivery_orders')

        .insert({

          user_id: userId,

          customer_name: customerName || 'Cliente Simulador',

          customer_phone: customerPhone || '',

          customer_address: customerAddress || '',

          delivery_type: deliveryType || 'delivery',

          status: 'pending',

          payment_method: paymentMethod || 'pix',

          payment_status: 'pending',

          subtotal,

          delivery_fee: deliveryFee || 0,

          discount: discount || 0,

          total,

          notes: notes || 'Pedido criado pelo simulador de fluxo',

          estimated_time: config?.estimated_delivery_time || 45,

          created_by_ai: false,

        })

        .select()

        .single();

      

      if (orderError) throw orderError;

      

      // Criar itens do pedido

      const orderItems = items.map((item: any) => ({

        order_id: order.id,

        menu_item_id: item.menuItemId || item.id || null,

        item_name: item.name || item.title,

        quantity: item.quantity || 1,

        unit_price: parseFloat(String(item.price || item.unitPrice)),

        total_price: (item.quantity || 1) * parseFloat(String(item.price || item.unitPrice)),

        notes: item.notes || null,

      }));

      

      const { error: itemsError } = await supabase

        .from('order_items')

        .insert(orderItems);

      

      if (itemsError) throw itemsError;

      

      // Buscar pedido completo

      const { data: fullOrder, error: fullError } = await supabase

        .from('delivery_orders')

        .select('*, order_items(*)')

        .eq('id', order.id)

        .single();

      

      if (fullError) throw fullError;

      

      console.log(`? [Simulador] Pedido #${fullOrder.order_number} criado para usuário ${userId}`);

      

      res.status(201).json({

        success: true,

        order: fullOrder,

        message: `Pedido #${fullOrder.order_number} criado com sucesso!`

      });

    } catch (error) {

      console.error("Error creating order from simulator:", error);

      res.status(500).json({ message: "Falha ao criar pedido" });

    }

  });



  // GET - Dashboard/estatísticas de pedidos

  app.get("/api/delivery/stats", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Calcular início de hoje e da semana

      const now = new Date();

      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

      const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();

      

      // Início da semana (domingo)

      const dayOfWeek = now.getDay();

      const weekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).toISOString();

      

      // Buscar pedidos de hoje

      const { data: todayOrders, error: todayError } = await supabase

        .from('delivery_orders')

        .select('status, total, created_at')

        .eq('user_id', userId)

        .gte('created_at', todayStart)

        .lte('created_at', todayEnd);

      

      if (todayError) throw todayError;

      

      // Buscar pedidos da semana

      const { data: weekOrders, error: weekError } = await supabase

        .from('delivery_orders')

        .select('status, total, created_at')

        .eq('user_id', userId)

        .gte('created_at', weekStart);

      

      if (weekError) throw weekError;

      

      // Calcular estatísticas de hoje

      const todayStats = {

        total: todayOrders?.length || 0,

        revenue: todayOrders?.filter(o => o.status === 'delivered').reduce((sum, o) => sum + parseFloat(o.total || '0'), 0) || 0,

        pending: todayOrders?.filter(o => o.status === 'pending').length || 0,

        confirmed: todayOrders?.filter(o => o.status === 'confirmed').length || 0,

        preparing: todayOrders?.filter(o => o.status === 'preparing').length || 0,

        ready: todayOrders?.filter(o => o.status === 'ready').length || 0,

        out_for_delivery: todayOrders?.filter(o => o.status === 'out_for_delivery').length || 0,

        delivered: todayOrders?.filter(o => o.status === 'delivered').length || 0,

        cancelled: todayOrders?.filter(o => o.status === 'cancelled').length || 0,

      };

      

      // Calcular estatísticas da semana

      const weekStats = {

        total: weekOrders?.length || 0,

        revenue: weekOrders?.filter(o => o.status === 'delivered').reduce((sum, o) => sum + parseFloat(o.total || '0'), 0) || 0,

      };

      

      res.json({

        today: todayStats,

        week: weekStats,

      });

    } catch (error) {

      console.error("Error fetching delivery stats:", error);

      res.status(500).json({ message: "Failed to fetch delivery stats" });

    }

  });



  // --- IMAGENS GENÉRICAS ---

  

  // GET - Buscar imagem genérica de comida (usando Loremflickr como alternativa gratuita)

  app.get("/api/delivery/food-image", isAuthenticated, async (req: any, res) => {

    try {

      const { query } = req.query;

      

      if (!query) {

        return res.status(400).json({ message: "Query é obrigatória" });

      }

      

      // Usar Loremflickr (gratuito, sem API key) - alternativa ao Unsplash Source descontinuado

      // Formato: https://loremflickr.com/WIDTH/HEIGHT/KEYWORD

      const imageUrl = `https://loremflickr.com/800/600/${encodeURIComponent(query)},food`;

      

      res.json({ 

        imageUrl: imageUrl,

        source: 'loremflickr',

        query 

      });

    } catch (error) {

      console.error("Error fetching food image:", error);

      // Fallback para placeholder

      res.json({ 

        imageUrl: `https://placehold.co/800x600/f97316/white?text=${encodeURIComponent(req.query.query || 'Comida')}`,

        source: 'placeholder',

        query: req.query.query 

      });

    }

  });

  app.get("/api/conversations/:conversationId/media", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { conversationId } = req.params;

      const { type } = req.query; // image, video, audio, document ou all

      

      // Verifica ownership

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }

      

      // Busca todas as mensagens com mídia

      const messages = await storage.getMessagesByConversationId(conversationId);

      

      let mediaMessages = messages.filter(m => m.mediaType && m.mediaUrl);

      

      // Filtra por tipo se especificado

      if (type && type !== 'all') {

        mediaMessages = mediaMessages.filter(m => m.mediaType === type);

      }

      

      // Mapeia para formato de galeria

      const gallery = mediaMessages.map(m => ({

        id: m.id,

        mediaType: m.mediaType,

        mediaUrl: m.mediaUrl,

        mediaMimeType: m.mediaMimeType,

        mediaCaption: m.mediaCaption,

        mediaDuration: m.mediaDuration,

        timestamp: m.timestamp,

        fromMe: m.fromMe,

      }));

      

      // Conta por tipo

      const counts = {

        image: messages.filter(m => m.mediaType === 'image').length,

        video: messages.filter(m => m.mediaType === 'video').length,

        audio: messages.filter(m => m.mediaType === 'audio').length,

        document: messages.filter(m => m.mediaType === 'document').length,

        total: mediaMessages.length,

      };

      

      res.json({ gallery, counts });

    } catch (error) {

      console.error("Error fetching conversation media:", error);

      res.status(500).json({ message: "Failed to fetch conversation media" });

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

        (!msg.text || msg.text === "?? Áudio" || msg.text === "?? Áudio" || msg.text.startsWith("[Áudio"))

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



      const afterRaw = (req.query?.after as string | undefined) || undefined;

      const limitRaw = (req.query?.limit as string | undefined) || undefined;



      if (afterRaw) {

        const afterDate = new Date(afterRaw);

        if (Number.isNaN(afterDate.getTime())) {

          return res.status(400).json({ message: "Invalid 'after' timestamp" });

        }



        const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : 500;

        const limit = Number.isFinite(parsedLimit) ? Math.max(1, Math.min(parsedLimit, 2000)) : 500;



        const newer = await storage.getMessagesByConversationIdAfter(conversationId, afterDate, limit);

        return res.json(newer);

      }



      const allMessages = await storage.getMessagesByConversationId(conversationId);

      res.json(allMessages);

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



  // ==================== LAZY LOAD DE MEDIA ====================

  // Endpoint para carregar media (imagens/áudio) sob demanda - reduz Egress

  app.get("/api/messages/:messageId/media", isAuthenticated, async (req: any, res) => {

    try {

      const { messageId } = req.params;

      const userId = getUserId(req);



      // Buscar mensagem para verificar propriedade

      const message = await storage.getMessageByMessageId(messageId);

      if (!message) {

        return res.status(404).json({ message: "Message not found" });

      }



      // Verificar propriedade via conversation -> connection

      const conversation = await storage.getConversation(message.conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }



      // Buscar apenas a media_url da mensagem

      const mediaData = await storage.getMessageMedia(messageId);

      

      if (!mediaData || mediaData.mediaUrl === null) {

        return res.json({ mediaUrl: null, hasMedia: false });

      }



      // Adicionar headers de cache (media raramente muda)

      res.set('Cache-Control', 'private, max-age=3600'); // Cache 1 hora

      res.json({ 

        mediaUrl: mediaData.mediaUrl, 

        mediaType: mediaData.mediaType ?? 'unknown',

        hasMedia: true 

      });

    } catch (error) {

      console.error("Error fetching message media:", error);

      res.status(500).json({ message: "Failed to fetch media" });

    }

  });



  // ==================== RE-DOWNLOAD DE MÍDIA ====================

  // Endpoint para tentar re-baixar mídia do WhatsApp usando metadados salvos

  app.post("/api/messages/:messageId/redownload", isAuthenticated, async (req: any, res) => {

    try {

      const { messageId } = req.params;

      const userId = getUserId(req);



      // Buscar mensagem para verificar propriedade

      const message = await storage.getMessageByMessageId(messageId);

      if (!message) {

        return res.status(404).json({ success: false, message: "Mensagem não encontrada" });

      }



      // Verificar propriedade via conversation -> connection

      const conversation = await storage.getConversation(message.conversationId);

      if (!conversation) {

        return res.status(404).json({ success: false, message: "Conversa não encontrada" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ success: false, message: "Acesso negado" });

      }



      // ? CASO 1: Já tem mediaUrl válido - retornar diretamente sem redownload

      if (message.mediaUrl && message.mediaUrl.length > 10) {

        console.log(`? [REDOWNLOAD] Mensagem ${messageId} já tem mediaUrl, retornando direto`);

        return res.json({ 

          success: true, 

          message: "Mídia já disponível!",

          mediaUrl: message.mediaUrl 

        });

      }



      // ? CASO 2: Verificar se tem metadados para re-download

      if (!message.mediaKey || !message.directPath) {

        return res.status(400).json({ 

          success: false, 

          message: "Esta mídia não tem metadados para re-download. Mídias antigas não podem ser recuperadas." 

        });

      }



      // Tentar re-baixar usando Baileys

      const { redownloadMedia } = await import("./whatsapp");

      const result = await redownloadMedia(

        connection.id,

        message.mediaKey,

        message.directPath,

        message.mediaUrlOriginal || undefined,

        message.mediaType || "image",

        message.mediaMimeType || "application/octet-stream"

      );



      if (result.success && result.mediaUrl) {

        // Atualizar a mensagem com a nova URL

        await storage.updateMessageMedia(messageId, result.mediaUrl);

        

        return res.json({ 

          success: true, 

          message: "Mídia re-baixada com sucesso!",

          mediaUrl: result.mediaUrl 

        });

      } else {

        return res.status(404).json({ 

          success: false, 

          message: result.error || "Mídia expirada ou não disponível no WhatsApp" 

        });

      }

    } catch (error) {

      console.error("Error redownloading media:", error);

      res.status(500).json({ success: false, message: "Erro ao tentar re-baixar mídia" });

    }

  });



  app.post("/api/messages/send", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // ?? Verificar se usuário está suspenso - bloquear envio de mensagens

      const suspensionStatus = await storage.isUserSuspended(userId);

      if (suspensionStatus.suspended) {

        console.log(`?? [SUSPENSION] Bloqueando envio de mensagem para usuário suspenso: ${userId}`);

        return res.status(403).json({ 

          success: false, 

          message: 'Sua conta está suspensa. Não é possível enviar mensagens.',

          suspended: true,

          reason: suspensionStatus.data?.reason

        });

      }

      

      const result = sendMessageSchema.safeParse(req.body);



      if (!result.success) {

        return res.status(400).json({ message: "Invalid request", errors: result.error });

      }



      const { conversationId, text } = result.data;

      let finalText = text;



      // Prepend signature if enabled

      try {

        const user = await storage.getUser(userId);

        if (user && user.signatureEnabled && user.signature) {

          const signaturePrefix = `*${user.signature}:* `;

          // Only prepend if not already present and text is not empty

          if (finalText && finalText.trim().length > 0 && !finalText.startsWith(signaturePrefix)) {

            finalText = `${signaturePrefix}${finalText}`;

          }

        }

      } catch (error) {

        console.error("Error appending signature:", error);

        // Continue with original text if signature append fails

      }



      // Verify ownership before sending

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }



      await whatsappSendMessage(userId, conversationId, finalText);

      

      // ?? AUTO-PAUSE IA: Quando o dono envia mensagem pelo sistema, PAUSA a IA

      try {

        const isAlreadyDisabled = await storage.isAgentDisabledForConversation(conversationId);

        if (!isAlreadyDisabled) {

          await storage.disableAgentForConversation(conversationId);

          console.log(`?? [AUTO-PAUSE] IA pausada automaticamente para conversa ${conversationId} - dono enviou mensagem pelo sistema`);

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



  // ==================== PAYMENT RECEIPTS ROUTES ====================
  
  // Upload de comprovante de pagamento PIX
  app.post("/api/payment-receipts/upload", isAuthenticated, upload.single("receipt"), async (req: any, res) => {
    try {
      const userId = getUserId(req);
      const file = req.file;
      const { subscriptionId, paymentId, amount } = req.body;

      if (!file) {
        return res.status(400).json({ message: "Arquivo de comprovante é obrigatório" });
      }

      if (!subscriptionId) {
        return res.status(400).json({ message: "ID da assinatura é obrigatório" });
      }

      // Verificar se a assinatura pertence ao usuário
      const subscription = await storage.getSubscription(subscriptionId);
      if (!subscription || subscription.userId !== userId) {
        return res.status(403).json({ message: "Assinatura não encontrada ou não pertence ao usuário" });
      }

      // Remover comprovantes duplicados pendentes da mesma assinatura/pagamento
      const duplicatesQuery = supabase
        .from("payment_receipts")
        .select("id, receipt_url")
        .eq("subscription_id", subscriptionId)
        .eq("status", "pending");

      if (paymentId) {
        duplicatesQuery.eq("mp_payment_id", paymentId);
      }

      const { data: duplicateReceipts, error: duplicateError } = await duplicatesQuery;

      if (duplicateError) {
        console.error("Error checking duplicate receipts:", duplicateError);
      } else if (duplicateReceipts && duplicateReceipts.length > 0) {
        const extractStoragePath = (url: string) => {
          if (!url) return null;
          if (url.startsWith("receipts/")) return url;
          const marker = "/payment-receipts/";
          const markerIndex = url.indexOf(marker);
          if (markerIndex === -1) return null;
          return url.slice(markerIndex + marker.length);
        };

        const pathsToRemove = duplicateReceipts
          .map((receipt: any) => extractStoragePath(receipt.receipt_url))
          .filter((path: string | null) => Boolean(path)) as string[];

        if (pathsToRemove.length > 0) {
          const { error: removeError } = await supabase.storage
            .from("payment-receipts")
            .remove(pathsToRemove);
          if (removeError) {
            console.error("Error removing duplicate receipt files:", removeError);
          }
        }

        const { error: deleteError } = await supabase
          .from("payment_receipts")
          .delete()
          .in("id", duplicateReceipts.map((receipt: any) => receipt.id));

        if (deleteError) {
          console.error("Error removing duplicate receipt records:", deleteError);
        }
      }

      // Upload do arquivo para Supabase Storage
      const safeOriginalName = file.originalname.replace(/[^\w.\-]+/g, "_");
      const fileName = `receipts/${userId}/${Date.now()}_${safeOriginalName}`;
      const { data: uploadData, error: uploadError } = await supabase.storage
        .from("payment-receipts")
        .upload(fileName, file.buffer, {
          contentType: file.mimetype,
          upsert: false
        });

      if (uploadError) {
        console.error("Error uploading receipt:", uploadError);
        return res.status(500).json({ message: "Erro ao fazer upload do comprovante" });
      }

      // Obter URL pública do arquivo
      const { data: urlData } = supabase.storage
        .from("payment-receipts")
        .getPublicUrl(fileName);

      const receiptUrl = urlData?.publicUrl || fileName;

      // Salvar registro na tabela payment_receipts
      const { data: receipt, error: insertError } = await supabase
        .from("payment_receipts")
        .insert({
          user_id: userId,
          subscription_id: subscriptionId,
          plan_id: subscription.planId,
          amount: parseFloat(amount) || 0,
          receipt_url: receiptUrl,
          receipt_filename: file.originalname,
          receipt_mime_type: file.mimetype,
          status: "pending",
          mp_payment_id: paymentId || null
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving receipt:", insertError);
        return res.status(500).json({ message: "Erro ao salvar comprovante" });
      }

      // Atualizar status da assinatura para ativo (libera acesso temporariamente)
      await supabase
        .from("subscriptions")
        .update({ 
          status: "active",
          pending_receipt: true,
          updated_at: new Date().toISOString()
        })
        .eq("id", subscriptionId);

      res.json({ 
        success: true, 
        message: "Comprovante enviado com sucesso! Seu acesso foi liberado.", 
        receipt 
      });
    } catch (error) {
      console.error("Error uploading receipt:", error);
      res.status(500).json({ message: "Erro ao processar comprovante" });
    }
  });

  // Listar comprovantes pendentes (admin)
  app.get("/api/admin/payment-receipts", isAdmin, async (req, res) => {
    try {
      const { status = "pending", page = "1", limit = "20" } = req.query;
      const pageNum = parseInt(page as string);
      const limitNum = parseInt(limit as string);

      let query = supabase
        .from("payment_receipts")
        .select(`
          *,
          users:user_id (id, email, name),
          plans:plan_id (id, nome, valor)
        `, { count: "exact" })
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      query = query.range((pageNum - 1) * limitNum, pageNum * limitNum - 1);

      const { data, error, count } = await query;

      if (error) throw error;

      res.json({
        receipts: data || [],
        total: count || 0,
        page: pageNum,
        totalPages: Math.ceil((count || 0) / limitNum)
      });
    } catch (error) {
      console.error("Error fetching receipts:", error);
      res.status(500).json({ message: "Erro ao buscar comprovantes" });
    }
  });

  // Aprovar comprovante (admin)
  app.post("/api/admin/payment-receipts/:id/approve", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = (req.session as any).adminId;
      const { notes } = req.body;

      // Buscar o comprovante
      const { data: receipt, error: fetchError } = await supabase
        .from("payment_receipts")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !receipt) {
        return res.status(404).json({ message: "Comprovante não encontrado" });
      }

      if (receipt.status !== "pending") {
        return res.status(400).json({ message: "Este comprovante já foi processado" });
      }

      // Atualizar status do comprovante para aprovado
      const { error: updateError } = await supabase
        .from("payment_receipts")
        .update({
          status: "approved",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          admin_notes: notes || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (updateError) throw updateError;

      // Confirmar assinatura como ativa (remover flag pending_receipt)
      if (receipt.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({
            status: "active",
            pending_receipt: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", receipt.subscription_id);
      }

      res.json({ success: true, message: "Comprovante aprovado com sucesso!" });
    } catch (error) {
      console.error("Error approving receipt:", error);
      res.status(500).json({ message: "Erro ao aprovar comprovante" });
    }
  });

  // Rejeitar comprovante (admin) - cancela o plano
  app.post("/api/admin/payment-receipts/:id/reject", isAdmin, async (req: any, res) => {
    try {
      const { id } = req.params;
      const adminId = (req.session as any).adminId;
      const { notes } = req.body;

      // Buscar o comprovante
      const { data: receipt, error: fetchError } = await supabase
        .from("payment_receipts")
        .select("*")
        .eq("id", id)
        .single();

      if (fetchError || !receipt) {
        return res.status(404).json({ message: "Comprovante não encontrado" });
      }

      if (receipt.status !== "pending") {
        return res.status(400).json({ message: "Este comprovante já foi processado" });
      }

      // Atualizar status do comprovante para rejeitado
      const { error: updateError } = await supabase
        .from("payment_receipts")
        .update({
          status: "rejected",
          reviewed_at: new Date().toISOString(),
          reviewed_by: adminId,
          admin_notes: notes || "Comprovante rejeitado pelo administrador",
          updated_at: new Date().toISOString()
        })
        .eq("id", id);

      if (updateError) throw updateError;

      // Cancelar a assinatura
      if (receipt.subscription_id) {
        await supabase
          .from("subscriptions")
          .update({
            status: "cancelled",
            pending_receipt: false,
            cancelled_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", receipt.subscription_id);
      }

      res.json({ success: true, message: "Comprovante rejeitado e plano cancelado" });
    } catch (error) {
      console.error("Error rejecting receipt:", error);
      res.status(500).json({ message: "Erro ao rejeitar comprovante" });
    }
  });

  // ==================== ACCESS CONTROL ROUTES ====================

  

  // Check user access status (subscription + trial messages)

  // Também verifica se é cliente de revendedor e aplica lógica de bloqueio em CASCATA

  // Se o REVENDEDOR está bloqueado, TODOS os clientes dele são bloqueados

  app.get("/api/access-status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const connection = await storage.getConnectionByUserId(userId);

      const subscription = await storage.getUserSubscription(userId);

      

      // Verificar se é cliente de revendedor

      const resellerClient = await storage.getResellerClientByUserId(userId);

      let resellerInfo = null;

      let resellerBlocked = false; // Flag para bloqueio em cascata

      

      if (resellerClient) {

        const reseller = await storage.getReseller(resellerClient.resellerId);

        if (reseller) {

          // VERIFICAR SE O REVENDEDOR ESTÁ BLOQUEADO (CASCATA)

          if (reseller.resellerStatus === 'blocked') {

            resellerBlocked = true;

          }

          

          resellerInfo = {

            isResellerClient: true,

            clientId: resellerClient.id,

            status: resellerClient.status,

            nextPaymentDate: resellerClient.nextPaymentDate,

            resellerBlocked, // Informar se o bloqueio é por causa do revendedor

            clientPrice: resellerClient.clientPrice || reseller.clientMonthlyPrice,

            reseller: {

              companyName: reseller.companyName,

              pixKey: reseller.pixKey,

              pixKeyType: reseller.pixKeyType,

              pixHolderName: (reseller as any).pixHolderName,

              pixBankName: (reseller as any).pixBankName,

              supportPhone: reseller.supportPhone,

              supportEmail: reseller.supportEmail,

              resellerStatus: reseller.resellerStatus, // Status do revendedor

            },

          };

        }

      }

      

      const FREE_TRIAL_LIMIT = 25;

      

      // Count agent messages

      let agentMessagesCount = 0;

      if (connection) {

        agentMessagesCount = await storage.getAgentMessagesCount(connection.id);

      }

      

      // Use canonical entitlement helper for subscription status (single source of truth)
      const entitlement = await getAccessEntitlement(userId);
      let hasActiveSubscription = entitlement.hasActiveSubscription;
      let isSubscriptionExpired = entitlement.isExpired;

      

      // Calculate days remaining

      let daysRemaining = subscription?.dataFim 

        ? Math.ceil((new Date(subscription.dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

        : 0;

        

      // Para cliente de revenda, usar nextPaymentDate

      if (resellerClient && resellerClient.nextPaymentDate) {

        daysRemaining = Math.ceil((new Date(resellerClient.nextPaymentDate).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

      }

      

      // Trial messages

      const trialMessagesUsed = agentMessagesCount;

      const trialMessagesRemaining = Math.max(0, FREE_TRIAL_LIMIT - agentMessagesCount);

      const trialLimitReached = agentMessagesCount >= FREE_TRIAL_LIMIT;

      

      // Determine access status

      let accessStatus: 'active' | 'trial' | 'blocked' | 'expired' = 'trial';

      let blockReason: string | null = null;

      

      if (hasActiveSubscription && !isSubscriptionExpired) {

        accessStatus = 'active';

      } else if ((subscription || resellerClient) && isSubscriptionExpired) {

        accessStatus = 'expired';

        // Diferenciar se o bloqueio é por causa do revendedor

        if (resellerBlocked) {

          blockReason = 'reseller_blocked'; // Novo: revendedor bloqueado

        } else if (resellerClient) {

          blockReason = 'reseller_client_expired';

        } else {

          blockReason = 'subscription_expired';

        }

      } else if (trialLimitReached) {

        accessStatus = 'blocked';

        blockReason = 'trial_limit_reached';

      } else {

        accessStatus = 'trial';

      }

      

      // Should block the system?

      const shouldBlock = accessStatus === 'blocked' || accessStatus === 'expired';

      

      // Mensagem customizada para cliente de revenda

      let message = null;

      if (shouldBlock) {

        if (blockReason === 'reseller_blocked' && resellerInfo) {

          // Bloqueio em cascata - revendedor não pagou o sistema

          message = `O sistema está temporariamente indisponível. Entre em contato com ${resellerInfo.reseller.companyName}.`;

          if (resellerInfo.reseller.supportPhone) {

            message += ` WhatsApp: ${resellerInfo.reseller.supportPhone}`;

          }

        } else if (blockReason === 'reseller_client_expired' && resellerInfo) {

          message = `Sua assinatura está vencida. Entre em contato com ${resellerInfo.reseller.companyName} para regularizar.`;

          if (resellerInfo.reseller.supportPhone) {

            message += ` WhatsApp: ${resellerInfo.reseller.supportPhone}`;

          }

        } else if (blockReason === 'subscription_expired') {

          message = 'Sua assinatura expirou. Renove para continuar usando o sistema.';

        } else {

          message = 'Você atingiu o limite de 25 mensagens de teste. Assine um plano para continuar.';

        }

      }

      

      res.json({

        accessStatus,

        shouldBlock,

        blockReason,

        

        // Subscription info

        hasSubscription: !!(subscription || resellerClient),

        subscriptionStatus: resellerClient?.status || subscription?.status || null,

        isSubscriptionExpired,

        daysRemaining: Math.max(0, daysRemaining),

        subscriptionEndDate: resellerClient?.nextPaymentDate || subscription?.dataFim || null,

        planName: subscription?.plan?.nome || (resellerClient ? 'Plano Revenda' : null),

        

        // Trial info

        trialMessagesUsed,

        trialMessagesRemaining,

        trialMessagesLimit: FREE_TRIAL_LIMIT,

        trialLimitReached,

        

        // Reseller info (para UI mostrar info do revendedor)

        resellerInfo,

        

        // For UI

        message,

      });

    } catch (error) {

      console.error("Error checking access status:", error);

      res.status(500).json({ message: "Failed to check access status" });

    }

  });



  // Message usage and limits route (for free trial limit)

  app.get("/api/usage", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const connection = await storage.getConnectionByUserId(userId);

      // Use canonical entitlement helper (same logic as /api/access-status)
      const entitlement = await getAccessEntitlement(userId);
      const hasActiveSubscription = entitlement.hasActiveSubscription;



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

        planName: entitlement.planName,

      });

    } catch (error) {

      console.error("Error fetching usage:", error);

      res.status(500).json({ message: "Failed to fetch usage" });

    }

  });



  // Daily usage limits for calibration/simulator (free users)

  // Constants for free user daily limits

  const FREE_DAILY_CALIBRATION_LIMIT = 5;

  const FREE_DAILY_SIMULATOR_LIMIT = 25;

  app.get("/api/daily-limits", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      // Use canonical entitlement helper (same logic as /api/access-status)
      const entitlement = await getAccessEntitlement(userId);
      const hasActiveSubscription = entitlement.hasActiveSubscription;



      // Plano pago = limites ilimitados

      if (hasActiveSubscription) {

        return res.json({

          hasActiveSubscription: true,

          calibration: {

            used: 0,

            limit: -1,

            remaining: -1,

            isLimitReached: false,

          },

          simulator: {

            used: 0,

            limit: -1,

            remaining: -1,

            isLimitReached: false,

          },

        });

      }



      const dailyUsage = await storage.getDailyUsage(userId);



      res.json({

        hasActiveSubscription: false,

        calibration: {

          used: dailyUsage.promptEditsCount,

          limit: FREE_DAILY_CALIBRATION_LIMIT,

          remaining: Math.max(0, FREE_DAILY_CALIBRATION_LIMIT - dailyUsage.promptEditsCount),

          isLimitReached: dailyUsage.promptEditsCount >= FREE_DAILY_CALIBRATION_LIMIT,

        },

        simulator: {

          used: dailyUsage.simulatorMessagesCount,

          limit: FREE_DAILY_SIMULATOR_LIMIT,

          remaining: Math.max(0, FREE_DAILY_SIMULATOR_LIMIT - dailyUsage.simulatorMessagesCount),

          isLimitReached: dailyUsage.simulatorMessagesCount >= FREE_DAILY_SIMULATOR_LIMIT,

        },

      });

    } catch (error) {

      console.error("Error fetching daily limits:", error);

      res.status(500).json({ message: "Failed to fetch daily limits" });

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

      

      // ?? LOG: Verificar se prompt está mudando

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

      

      // ?? FIX CRÍTICO: Sincronizar isActive com business_agent_configs

      // O toggle da UI "A ON/OFF" deve atualizar AMBAS as tabelas para consistência

      // O backend usa business_agent_configs.is_active para verificar se deve responder

      if (typeof result.data.isActive === 'boolean') {

        console.log(`[AGENT CONFIG] ?? Sincronizando isActive=${result.data.isActive} com business_agent_configs`);

        try {

          const existingBusinessConfig = await storage.getBusinessAgentConfig(userId);

          if (existingBusinessConfig) {

            await storage.upsertBusinessAgentConfig(userId, {

              ...existingBusinessConfig,

              isActive: result.data.isActive

            });

            console.log(`[AGENT CONFIG] ? business_agent_configs.is_active atualizado para ${result.data.isActive}`);

          } else {

            // Se não existe business config, criar uma mínima

            await storage.upsertBusinessAgentConfig(userId, {

              userId,

              agentName: "Assistente",

              agentRole: "Assistente Virtual",

              companyName: "Minha Empresa",

              isActive: result.data.isActive

            });

            console.log(`[AGENT CONFIG] ? Criado business_agent_configs com isActive=${result.data.isActive}`);

          }

          

          // ?? TOGGLE EXCLUSIVO: Ativar Meu Agente = desativar Robô Fluxo (chatbot)

          // Isso evita conflitos entre os dois sistemas

          if (result.data.isActive === true) {

            console.log(`[AGENT CONFIG] ?? Desativando Robô Fluxo (chatbot) para usuário ${userId}`);

            // Usar db já importado no topo do arquivo, e sql também

            await db.execute(sql`

              UPDATE chatbot_configs SET

                is_active = false,

                updated_at = now()

              WHERE user_id = ${userId}

            `);

            

            // Limpar cache do fluxo

            const { clearFlowCache } = await import("./chatbotFlowEngine");

            clearFlowCache(userId);

            console.log(`[AGENT CONFIG] ? Robô Fluxo desativado para usuário ${userId}`);

          }

        } catch (syncError) {

          console.error(`[AGENT CONFIG] ?? Erro ao sincronizar business_agent_configs:`, syncError);

          // Continua mesmo se falhar

        }

      }

      

      // ?? CRÍTICO: Se prompt mudou, criar nova versão no histórico

      if (promptChanged && result.data.prompt) {

        const { salvarVersaoPrompt } = await import("./promptHistoryService");

        

        console.log(`\n[AGENT CONFIG] ---------------------------------------------------`);

        console.log(`[AGENT CONFIG] ?? SALVAMENTO MANUAL DETECTADO`);

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

          console.log(`[AGENT CONFIG] ? Nova versão criada: v${novaVersao.version_number}`);

          console.log(`[AGENT CONFIG] ID da versão: ${novaVersao.id}`);

          console.log(`[AGENT CONFIG] Marcada como current: ${novaVersao.is_current}`);

        } else {

          console.error(`[AGENT CONFIG] ? ERRO: Falha ao criar versão do prompt`);

        }

        console.log(`[AGENT CONFIG] ---------------------------------------------------\n`);

        

        // ?? REMOVIDO: Não criar FlowDefinition automaticamente quando salva prompt

        // A criação do FlowDefinition deve ser feita APENAS quando o usuário ativa 

        // o Construtor de Fluxo (chatbot_configs.is_active = true)

        // Isso evita conflito entre Meu Agente IA e Construtor de Fluxo

        // Se o usuário usa "Meu Agente IA", NÃO deve ter FlowDefinition ativo

        // Se o usuário usa "Construtor de Fluxo", aí sim cria FlowDefinition



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

 [regra 1]

 [regra 2]

...



NÃO FAZER:

 [item 1]

 [item 2]



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

          

          // Usa modelo configurado no banco de dados (sem hardcode)

          const response = await mistral.chat.complete({

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



      // ?? AUTO-CALIBRAÇÃO NA CRIAÇÃO DO AGENTE

      // Testar o prompt gerado com IA Cliente vs IA Agente antes de ativar

      console.log(`\n?? [Generate Prompt] ----------------------------------------`);

      console.log(`?? [Generate Prompt] Iniciando auto-calibração do prompt criado...`);

      console.log(`?? [Generate Prompt] Negócio: ${businessName} (${businessTypeLabel})`);

      console.log(`?? [Generate Prompt] Prompt length: ${generatedPrompt.length} chars`);

      

      let calibrationResult: any = null;

      let finalPrompt = generatedPrompt;

      

      try {

        const { calibrarPromptEditado } = await import("./promptCalibrationService");

        

        // Usar MESMA configuração que a EDIÇÃO de prompts

        // IA Cliente vs IA Agente - Calibração robusta

        const contextoNegocio = description || `Negócio: ${businessName}. Tipo: ${businessTypeLabel}`;

        const instrucaoCalibracao = `Criar agente de atendimento para: ${contextoNegocio}`;

        

        console.log(`?? [Generate Prompt] Executando calibração IA Cliente vs IA Agente...`);

        console.log(`?? [Generate Prompt] Instrução: ${instrucaoCalibracao.substring(0, 100)}...`);

        

        // CHAMADA CORRETA - Mesmos parâmetros que a EDIÇÃO

        calibrationResult = await calibrarPromptEditado(

          generatedPrompt,

          instrucaoCalibracao,

          mistralApiKey || "",  // apiKey obrigatória

          "mistral",            // modelo igual à edição

          {

            numeroCenarios: 2,        // Igual à edição

            maxTentativasReparo: 2,   // Igual à edição

            scoreMinimoAprovacao: 70  // Score mínimo 70

          }

        );

        

        console.log(`?? [Generate Prompt] ----------------------------------------`);

        console.log(`?? [Generate Prompt] RESULTADO CALIBRAÇÃO:`);

        console.log(`   ? Sucesso: ${calibrationResult.sucesso}`);

        console.log(`   ?? Score geral: ${calibrationResult.scoreGeral}/100`);

        console.log(`   ?? Cenários: ${calibrationResult.cenariosAprovados}/${calibrationResult.cenariosTotais} aprovados`);

        console.log(`   ?? Tentativas de reparo: ${calibrationResult.tentativasReparo}`);

        console.log(`   ?? Tempo: ${calibrationResult.tempoMs}ms`);

        console.log(`?? [Generate Prompt] ----------------------------------------`);

        

        if (calibrationResult.sucesso && calibrationResult.promptFinal) {

          finalPrompt = calibrationResult.promptFinal;

          console.log(`?? [Generate Prompt] ? Prompt CALIBRADO com sucesso! Usando versão otimizada.`);

        } else {

          console.log(`?? [Generate Prompt] ?? Calibração não atingiu score mínimo (70%), usando prompt original`);

        }

      } catch (calibrationError) {

        console.error(`?? [Generate Prompt] ? Erro na calibração:`, calibrationError);

        // Continua com prompt original se calibração falhar

      }

      

      console.log(`?? [Generate Prompt] ----------------------------------------\n`);



      // ?? CRIAR FLOW DEFINITION AUTOMATICAMENTE

      // Isso permite que o FlowEngine seja usado depois

      let flowCreated = false;

      try {

        const { handleGeneratePrompt } = await import("./flowIntegration");

        const userId = getUserId(req);

        

        console.log(`\n?? [Generate Prompt] Criando FlowDefinition para sistema híbrido...`);

        

        const flowResult = await handleGeneratePrompt(

          userId,

          businessType,

          businessName,

          description,

          additionalInfo

        );

        

        flowCreated = flowResult.flowCreated;

        console.log(`?? [Generate Prompt] FlowDefinition: ${flowCreated ? '? Criado' : '? Não criado'}`);

        console.log(`?? [Generate Prompt] Tipo de flow: ${flowResult.flow?.type || 'GENERICO'}`);

      } catch (flowError) {

        console.error(`?? [Generate Prompt] ? Erro ao criar FlowDefinition:`, flowError);

        // Continua mesmo se falhar - o sistema legado será usado

      }



      res.json({ 

        prompt: finalPrompt,

        flowCreated,

        calibration: calibrationResult ? {

          calibrated: true,

          approved: calibrationResult.sucesso,       // CORRIGIDO: era "aprovado"

          score: calibrationResult.scoreGeral,       // CORRIGIDO: era "scoreMedio"

          repairs: calibrationResult.edicoesAplicadas || 0, // CORRIGIDO: era tentativasReparo (loops), agora edições reais

          scenarios: calibrationResult.cenariosTotais,

          scenariosApproved: calibrationResult.cenariosAprovados,

          timeMs: calibrationResult.tempoMs

        } : {

          calibrated: false,

          reason: 'Calibração não executada'

        }

      });

    } catch (error) {

      console.error("Error generating prompt:", error);

      res.status(500).json({ message: "Failed to generate prompt" });

    }

  });



  // ============ EDITOR DE PROMPTS COM AUTO-CALIBRAÇÃO (SSE - STREAMING) ============

  // ?? Sistema de IA Cliente vs IA Agente com logs em tempo real

  app.post("/api/agent/edit-prompt-stream", isAuthenticated, async (req: any, res) => {

    // Configurar SSE (Server-Sent Events)

    res.setHeader('Content-Type', 'text/event-stream');

    res.setHeader('Cache-Control', 'no-cache');

    res.setHeader('Connection', 'keep-alive');

    res.flushHeaders();



    const sendEvent = (data: any) => {

      res.write(`data: ${JSON.stringify(data)}\n\n`);

    };



    try {

      const userId = getUserId(req);

      const { currentPrompt, instruction, skipCalibration = false } = req.body;



      if (!currentPrompt || !instruction) {

        sendEvent({ type: 'error', message: 'currentPrompt e instruction são obrigatórios' });

        res.end();

        return;

      }



      // Linha removida



      // Buscar chave API

      const mistralConfig = await storage.getSystemConfig('mistral_api_key');

      const mistralApiKey = mistralConfig?.valor || process.env.MISTRAL_API_KEY || '';



      if (!mistralApiKey) {

        sendEvent({ type: 'error', message: 'Chave API não configurada' });

        res.end();

        return;

      }



      // Verificar limite para usuários free (canonical entitlement)

      const entitlementCalib = await getAccessEntitlement(userId);

      const hasActiveSubscription = entitlementCalib.hasActiveSubscription;



      if (!hasActiveSubscription) {

        const dailyUsage = await storage.getDailyUsage(userId);

        if (dailyUsage.promptEditsCount >= FREE_DAILY_CALIBRATION_LIMIT) {

          sendEvent({

            type: 'limit_reached',

            message: `Limite de ${FREE_DAILY_CALIBRATION_LIMIT} calibrações atingido`,

            used: dailyUsage.promptEditsCount,

            limit: FREE_DAILY_CALIBRATION_LIMIT 

          });

          res.end();

          return;

        }

      }



      sendEvent({ type: 'log', message: '?? Iniciando processamento...' });

      sendEvent({ type: 'log', message: '?? Analisando sua instrução...' });

      sendEvent({ type: 'log', message: '?? Lendo prompt atual...' });



      // Editar prompt via IA

      const { editarPromptViaIA } = await import("./promptEditService");

      const { salvarVersaoPrompt, salvarMensagemChat } = await import("./promptHistoryService");

      const { calibrarPromptEditado } = await import("./promptCalibrationService");



      sendEvent({ type: 'log', message: '?? Enviando para IA...' });

      sendEvent({ type: 'log', message: '? Aguardando resposta do modelo...' });

      const result = await editarPromptViaIA(currentPrompt, instruction, mistralApiKey, "mistral");



      if (!result.success || result.novoPrompt === currentPrompt) {

        sendEvent({ type: 'log', message: '?? ' + (result.mensagemChat || 'Não foi possível aplicar essa mudança') });

        sendEvent({ type: 'complete', success: false, feedbackMessage: result.mensagemChat });

        res.end();

        return;

      }



      sendEvent({ type: 'log', message: '? IA respondeu!' });

      const numEdicoes = result.edicoesAplicadas || 0;

      if (numEdicoes > 0) {

        sendEvent({ type: 'log', message: `?? ${numEdicoes} edição(ões) aplicadas no prompt!` });

      } else {

        sendEvent({ type: 'log', message: '?? Analisando resposta...' });

      }

      sendEvent({ type: 'log', message: '?? Iniciando validação automática...' });

      sendEvent({ type: 'log', message: '?? Preparando cenários de teste...' });



      // Calibração com streaming de logs

      let calibrationResult: any = null;

      let promptFinal = result.novoPrompt;



      if (!skipCalibration) {

        const progressCallback = (log: any) => {

          // IMPORTANTE: Sempre usar type='calibration_log' para o frontend processar

          // O log.type original é preservado em 'logType' para contexto

          sendEvent({ 

            type: 'calibration_log', 

            logType: log.type,  // tipo original do log (scenario_running, etc)

            message: log.message,

            data: log.data,

            timestamp: log.timestamp

          });

        };



        try {

          calibrationResult = await calibrarPromptEditado(

            result.novoPrompt,

            instruction,

            mistralApiKey,

            "mistral",

            {

              numeroCenarios: 2,

              maxTentativasReparo: 100, // ILIMITADO - continua até atingir 70

              scoreMinimoAprovacao: 70

            },

            progressCallback

          );



          // SEMPRE usar o prompt calibrado (melhor resultado após todas tentativas)

          // O sistema já tentou 20 vezes para atingir 70 - usar o melhor que conseguiu

          promptFinal = calibrationResult.promptFinal;

        } catch (calibError: any) {

          sendEvent({ type: 'calibration_log', message: `?? Erro na calibração: ${calibError.message}` });

          // Em caso de erro, reverter para original

          promptFinal = currentPrompt;

        }

      }



      // Salvar alterações SOMENTE se calibração passou ou foi pulada

      await storage.updateAgentConfig(userId, { prompt: promptFinal });

      

      if (!hasActiveSubscription) {

        await storage.incrementPromptEdits(userId);

      }



      // Salvar histórico

      await salvarMensagemChat({

        userId,

        configType: 'ai_agent_config',

        role: 'user',

        content: instruction

      });



      const calibrationMessage = calibrationResult 

        ? (calibrationResult.sucesso 

          ? `\n\n? *Validação:* Score ${calibrationResult.scoreGeral}/100 (${calibrationResult.edicoesAplicadas || 0} edições)`

          : `\n\n? *Calibração:* Score ${calibrationResult.scoreGeral}/100 (${calibrationResult.edicoesAplicadas || 0} edições)`)

        : '';



      await salvarMensagemChat({

        userId,

        configType: 'ai_agent_config',

        role: 'assistant',

        content: result.mensagemChat + calibrationMessage

      });



      sendEvent({ 

        type: 'complete', 

        success: true, 

        newPrompt: promptFinal,

        feedbackMessage: result.mensagemChat + calibrationMessage,

        calibration: calibrationResult ? {

          score: calibrationResult.scoreGeral,

          success: calibrationResult.sucesso,

          repairs: calibrationResult.edicoesAplicadas || 0 // CORRIGIDO: era tentativasReparo (loops), agora edições reais

        } : null

      });



    } catch (error: any) {

      console.error('[Edit Prompt Stream] Erro:', error);

      sendEvent({ type: 'error', message: error.message || 'Erro ao processar' });

    } finally {

      res.end();

    }

  });



  // ============ EDITOR DE PROMPTS COM AUTO-CALIBRAÇÃO ============

  // ?? Sistema de IA Cliente vs IA Agente para validar edições antes de aplicar

  app.post("/api/agent/edit-prompt", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { currentPrompt, instruction, skipCalibration = false } = req.body;



      if (!currentPrompt || !instruction) {

        return res.status(400).json({ message: "currentPrompt e instruction são obrigatórios" });

      }



      // Buscar chave Mistral logo no início (necessário para análise de intenção)

      const mistralConfig = await storage.getSystemConfig('mistral_api_key');

      const mistralApiKey = mistralConfig?.valor || process.env.MISTRAL_API_KEY || '';

      

      console.log(`?? [Edit Prompt] Key from DB: ${mistralConfig?.valor ? `EXISTS (${mistralConfig.valor.substring(0, 10)}...)` : 'NOT FOUND'}`);

      console.log(`?? [Edit Prompt] Key from ENV: ${process.env.MISTRAL_API_KEY ? `EXISTS` : 'NOT FOUND'}`);

      

      if (!mistralApiKey) {

        return res.status(500).json({ 

          message: "Chave API Mistral não configurada. Configure em Configurações > Sistema." 

        });

      }



      // ==================================================================================

      // ?? SISTEMA INTELIGENTE DE DETECÇÃO DE INTENÇÃO (usando IA)

      // Analisa se o usuário quer editar LISTAGEM/FORMATAÇÃO de módulos ativos

      // vs apenas COMPORTAMENTO/ATENDIMENTO

      // ==================================================================================

      

      // Verificar módulos ativos primeiro

      let deliveryActive = false;

      let catalogActive = false;

      let deliveryItemNames: string[] = [];

      let productNames: string[] = [];

      

      try {

        const { data: deliveryConfig } = await supabase

          .from('delivery_config')

          .select('is_active, send_to_ai')

          .eq('user_id', userId)

          .single();

        deliveryActive = deliveryConfig?.is_active && deliveryConfig?.send_to_ai;

        

        // Se delivery ativo, buscar nomes dos itens para detecção

        if (deliveryActive) {

          const { data: items } = await supabase

            .from('menu_items')

            .select('name')

            .eq('user_id', userId)

            .eq('is_available', true)

            .limit(50);

          deliveryItemNames = items?.map(i => i.name.toLowerCase()) || [];

        }

        

        const { data: productsConfig } = await supabase

          .from('products_config')

          .select('is_active, send_to_ai')

          .eq('user_id', userId)

          .single();

        catalogActive = productsConfig?.is_active && productsConfig?.send_to_ai;

        

        // Se catálogo ativo, buscar nomes dos produtos para detecção

        if (catalogActive) {

          const { data: products } = await supabase

            .from('products')

            .select('name')

            .eq('user_id', userId)

            .eq('is_active', true)

            .limit(50);

          productNames = products?.map(p => p.name.toLowerCase()) || [];

        }

      } catch (e) {

        // Módulos não configurados

      }

      

      // Se nenhum módulo ativo, prosseguir normalmente

      if (!deliveryActive && !catalogActive) {

        console.log(`? [Edit Prompt] Nenhum módulo ativo - edição livre`);

      } else {

        // ?? ANÁLISE DE INTENÇÃO USANDO IA (Mistral)

        console.log(`?? [Intent Detection] Analisando intenção da instrução com IA...`);

        

        const intentAnalysisPrompt = `Você é um analisador de intenções. Analise a seguinte instrução de edição de prompt e determine se o usuário quer editar a FORMATAÇÃO/LISTAGEM de itens OU apenas o COMPORTAMENTO/ATENDIMENTO.



CONTEXTO:

${deliveryActive ? `- Módulo DELIVERY está ATIVO (cardápio com ${deliveryItemNames.length} itens)` : ''}

${catalogActive ? `- Módulo CATÁLOGO está ATIVO (produtos com ${productNames.length} itens)` : ''}



INSTRUÇÃO DO USUÁRIO:

"${instruction}"



ANÁLISE - Responda APENAS com um JSON válido no seguinte formato:

{

  "quer_editar_listagem": true/false,

  "modulo_afetado": "delivery" ou "catalog" ou "none",

  "confianca": 0-100,

  "razao": "breve explicação"

}



REGRAS:

1. Se menciona como LISTAR, MOSTRAR, FORMATAR, ENVIAR itens/cardápio/produtos ? quer_editar_listagem = true

2. Se menciona nome específico de item (ex: "${deliveryItemNames[0] || 'Pizza Calabresa'}") ? quer_editar_listagem = true

3. Se menciona apenas COMPORTAMENTO (como atender, reagir, responder) ? quer_editar_listagem = false

4. Se diz "quando pedir cardápio, faça X" (contexto de REAÇÃO) ? quer_editar_listagem = false

5. Se diz "mude o cardápio para..." (contexto de EDIÇÃO) ? quer_editar_listagem = true



Responda APENAS com o JSON, sem texto adicional.`;



        try {

          // ?? Chamada via chatComplete (usa OpenRouter/Chutes automaticamente)

          const { chatComplete } = await import("./llm");

          

          const intentResponse = await chatComplete({

            messages: [{ role: 'user', content: intentAnalysisPrompt }],

            temperature: 0.1,

            maxTokens: 200

          });



          const intentText = intentResponse.choices?.[0]?.message?.content?.trim() || '{}';

          

          // Parse JSON da resposta

          let intentAnalysis;

          try {

            // Extrair JSON se vier com markdown

            const jsonMatch = intentText.match(/\{[\s\S]*\}/);

            intentAnalysis = JSON.parse(jsonMatch ? jsonMatch[0] : intentText);

          } catch (e) {

            console.error(`? [Intent Detection] Erro ao parsear JSON:`, intentText);

            intentAnalysis = { quer_editar_listagem: false, modulo_afetado: 'none', confianca: 0 };

          }



          console.log(`?? [Intent Detection] Resultado:`, intentAnalysis);



          // ?? SE DETECTOU INTENÇÃO DE EDITAR LISTAGEM DE MÓDULO ATIVO

          if (intentAnalysis.quer_editar_listagem && intentAnalysis.confianca >= 60) {

            if (intentAnalysis.modulo_afetado === 'delivery' && deliveryActive) {

              console.log(`?? [Edit Prompt] BLOQUEIO: Usuário quer editar LISTAGEM do delivery (confiança ${intentAnalysis.confianca}%)`);

              return res.json({

                success: false,

                conflictDetected: true,

                conflictType: 'delivery',

                intentAnalysis,

                message: `?? Percebi que você quer modificar **como os itens do cardápio são listados/formatados**.\n\n?? **Por que foi bloqueado:**\n${intentAnalysis.razao}\n\n?? **O que você pode fazer:**\n1. Ir em **Delivery > Cardápio** para editar itens, preços e descrições\n2. Editar as **Instruções de Atendimento** nas configurações do Delivery (comportamento, não formatação)\n3. Se quiser controle total da formatação, desative "Enviar para IA" nas configurações do Delivery\n\n?? **Dica:** Se sua intenção era apenas mudar o COMPORTAMENTO (como reagir a perguntas), tente reformular a instrução de forma mais clara.`,

                feedbackMessage: `?? Percebi que você quer modificar **como os itens do cardápio são listados**.\n\nComo você tem o módulo de Delivery **ATIVO**, a formatação do cardápio é gerenciada automaticamente em **Delivery > Cardápio**.\n\n?? **${intentAnalysis.razao}**`,

                suggestion: 'Edite o cardápio em Delivery > Cardápio'

              });

            }

            

            if (intentAnalysis.modulo_afetado === 'catalog' && catalogActive) {

              console.log(`?? [Edit Prompt] BLOQUEIO: Usuário quer editar LISTAGEM do catálogo (confiança ${intentAnalysis.confianca}%)`);

              return res.json({

                success: false,

                conflictDetected: true,

                conflictType: 'catalog',

                intentAnalysis,

                message: `?? Percebi que você quer modificar **como os produtos são listados/formatados**.\n\n?? **Por que foi bloqueado:**\n${intentAnalysis.razao}\n\n?? **O que você pode fazer:**\n1. Ir em **Produtos** para editar itens, preços e descrições\n2. Editar as **Instruções de IA** nas configurações de Produtos (comportamento, não formatação)\n3. Se quiser controle total da formatação, desative "Enviar para IA" nas configurações de Produtos\n\n?? **Dica:** Se sua intenção era apenas mudar o COMPORTAMENTO (como reagir a perguntas), tente reformular a instrução de forma mais clara.`,

                feedbackMessage: `?? Percebi que você quer modificar **como os produtos são listados**.\n\nComo você tem o módulo de Produtos **ATIVO**, a formatação do catálogo é gerenciada automaticamente em **Produtos**.\n\n?? **${intentAnalysis.razao}**`,

                suggestion: 'Edite os produtos em Produtos'

              });

            }

          } else {

            console.log(`? [Intent Detection] Instrução é sobre COMPORTAMENTO (confiança ${intentAnalysis.confianca}%) - permitindo edição`);

          }

        } catch (intentError: any) {

          console.error(`? [Intent Detection] Erro na análise:`, intentError.message);

          // Em caso de erro na análise, permitir edição (fail-safe)

        }

      }



      // ?? CHECK DAILY CALIBRATION LIMIT FOR FREE USERS (canonical entitlement)

      const entitlementCalib2 = await getAccessEntitlement(userId);

      const hasActiveSubscription = entitlementCalib2.hasActiveSubscription;



      if (!hasActiveSubscription) {

        const dailyUsage = await storage.getDailyUsage(userId);

        if (dailyUsage.promptEditsCount >= FREE_DAILY_CALIBRATION_LIMIT) {

          return res.json({

            success: false,

            limitReached: true,

            message: `Você atingiu o limite de ${FREE_DAILY_CALIBRATION_LIMIT} calibrações por dia. Assine um plano para calibrações ilimitadas.`,

            used: dailyUsage.promptEditsCount,

            limit: FREE_DAILY_CALIBRATION_LIMIT,

          });

        }

      }



      // Usar novo serviço de edição via IA (Search/Replace com JSON)

      const { editarPromptViaIA } = await import("./promptEditService");

      const { salvarVersaoPrompt, salvarMensagemChat } = await import("./promptHistoryService");

      const { calibrarPromptEditado } = await import("./promptCalibrationService");

      

      const result = await editarPromptViaIA(currentPrompt, instruction, mistralApiKey, "mistral");

      

      console.log(`?? [Edit Prompt] Sucesso: ${result.success}, Edições: ${result.edicoesAplicadas}`);

      console.log(`?? [Edit Prompt] Resposta IA: ${result.mensagemChat}`);

      

      // ==================================================================================

      // ?? AUTO-CALIBRAÇÃO: Validar edição com IA Cliente vs IA Agente

      // ==================================================================================

      let calibrationResult = null;

      let promptFinal = result.novoPrompt;

      let calibrationMessage = "";

      

      // Só calibrar se houve mudança no prompt E calibração não foi pulada

      if (result.success && result.novoPrompt !== currentPrompt && !skipCalibration) {

        console.log(`?? [Calibração] Iniciando validação automática...`);

        

        try {

          calibrationResult = await calibrarPromptEditado(

            result.novoPrompt,

            instruction,

            mistralApiKey,

            "mistral",

            {

              numeroCenarios: 2, // Balancear velocidade vs precisão

              maxTentativasReparo: 100, // ILIMITADO - continua até atingir 70

              scoreMinimoAprovacao: 70 // Score mínimo obrigatório

            }

          );

          

          console.log(`?? [Calibração] Score: ${calibrationResult.scoreGeral}/100`);

          console.log(`?? [Calibração] Aprovados: ${calibrationResult.cenariosAprovados}/${calibrationResult.cenariosTotais}`);

          console.log(`?? [Calibração] Edições aplicadas: ${calibrationResult.edicoesAplicadas || 0}`);

          

          // SEMPRE usar o prompt calibrado (melhor resultado após todas tentativas)

          promptFinal = calibrationResult.promptFinal;

          

          const numEdicoes = calibrationResult.edicoesAplicadas || 0;

          if (calibrationResult.sucesso) {

            if (numEdicoes > 0) {

              calibrationMessage = `\n\n? *Validação automática:* Edição testada e ajustada (${numEdicoes} edição${numEdicoes > 1 ? 'ões' : ''}) para garantir funcionamento correto.`;

            } else {

              calibrationMessage = `\n\n? *Validação automática:* Edição testada e aprovada! (Score: ${calibrationResult.scoreGeral}/100)`;

            }

          } else {

            // Score < 70 após 100 tentativas - usar melhor resultado mesmo assim

            calibrationMessage = `\n\n? *Calibração:* Score ${calibrationResult.scoreGeral}/100 (${numEdicoes} edições aplicadas)`;

          }

        } catch (calibError: any) {

          console.error(`? [Calibração] Erro:`, calibError.message);

          // Se calibração falhar por erro, ainda usar o prompt editado

          calibrationMessage = `\n\n?? Erro na validação. Teste no simulador para confirmar.`;

        }

      }

      

      // ==================================================================================

      // ?? SALVAR HISTÓRICO DO CHAT

      // ==================================================================================

      

      // 1. Salvar mensagem do usuário (SEMPRE)

      await salvarMensagemChat({

        userId,

        configType: 'ai_agent_config',

        role: 'user',

        content: instruction

      });

      

      // 2. Salvar resposta da IA com feedback de calibração

      const mensagemCompleta = result.mensagemChat + calibrationMessage;

      await salvarMensagemChat({

        userId,

        configType: 'ai_agent_config',

        role: 'assistant',

        content: mensagemCompleta,

        metadata: {

          edicoes_aplicadas: result.edicoesAplicadas,

          edicoes_falharam: result.edicoesFalharam,

          operacao: result.novoPrompt !== currentPrompt ? 'edicao' : 'chat',

          calibration: calibrationResult ? {

            score: calibrationResult.scoreGeral,

            aprovados: calibrationResult.cenariosAprovados,

            total: calibrationResult.cenariosTotais,

            reparos: calibrationResult.tentativasReparo,

            sucesso: calibrationResult.sucesso

          } : null

        }

      });

      

      // 3. Lógica específica de EDIÇÃO (apenas se houve mudança no prompt)

      // SEMPRE salvar porque o sistema calibra até atingir o melhor resultado

      if (result.success && result.novoPrompt !== currentPrompt) {

        // ?? Incrementar contador de calibrações do dia (para usuários free)

        if (!hasActiveSubscription) {

          await storage.incrementPromptEdits(userId);

        }



        // ?? CRÍTICO: Atualizar prompt na configuração principal (usar prompt calibrado)

        await storage.updateAgentConfig(userId, { 

          prompt: promptFinal // Usar prompt calibrado/reparado

        });

        console.log(`[Edit Prompt] ? Config principal atualizada com prompt calibrado`);

        

        // ?? AUTO-UPDATE FLOW: Reorganizar e calibrar fluxo após edição

        // Quando cliente edita o prompt, o fluxo é regenerado baseado na nova instrução

        let flowUpdated = false;

        try {

          const { handleEditPrompt } = await import("./flowIntegration");

          console.log(`\n?? [Edit Prompt] Regenerando FlowDefinition conforme nova instrução...`);

          

          const flowResult = await handleEditPrompt(

            userId,

            currentPrompt,

            instruction,

            promptFinal,

            mistralApiKey

          );

          

          flowUpdated = flowResult.flowUpdated;

          console.log(`?? [Edit Prompt] FlowDefinition: ${flowUpdated ? '? Atualizado' : '? Não atualizado'}`);

          if (flowUpdated && flowResult.changes.length > 0) {

            console.log(`?? [Edit Prompt] Mudanças no fluxo: ${flowResult.changes.join(', ')}`);

          }

        } catch (flowError) {

          console.error(`?? [Edit Prompt] ? Erro ao atualizar FlowDefinition:`, flowError);

          // Continua mesmo se falhar - o sistema legado será usado

        }

        

        // Salvar nova versão do prompt (com info de calibração)

        await salvarVersaoPrompt({

          userId,

          configType: 'ai_agent_config',

          promptContent: promptFinal,

          editSummary: instruction,

          editType: 'ia',

          editDetails: {

            ...result.detalhes,

            flowUpdated,

            calibration: calibrationResult ? {

              score: calibrationResult.scoreGeral,

              reparos: calibrationResult.tentativasReparo

            } : null

          }

        });

      }

      

      res.json({

        success: result.success,

        newPrompt: promptFinal, // Retornar prompt calibrado

        changes: result.detalhes,

        summary: mensagemCompleta,

        feedbackMessage: mensagemCompleta,

        method: "mistral-search-replace-with-calibration",

        stats: {

          aplicadas: result.edicoesAplicadas,

          falharam: result.edicoesFalharam

        },

        flowUpdated: result.success && result.novoPrompt !== currentPrompt ? true : false,

        calibration: calibrationResult ? {

          sucesso: calibrationResult.sucesso,

          score: calibrationResult.scoreGeral,

          cenariosAprovados: calibrationResult.cenariosAprovados,

          cenariosTotais: calibrationResult.cenariosTotais,

          tentativasReparo: calibrationResult.tentativasReparo,

          tempoMs: calibrationResult.tempoMs,

          resultados: calibrationResult.resultados.map(r => ({

            cenarioId: r.cenarioId,

            passou: r.passou,

            score: r.score

          }))

        } : null

      });

    } catch (error: any) {

      console.error("Error editing prompt:", error);

      res.status(500).json({ message: error.message || "Failed to edit prompt" });

    }

  });



  // ============ ENDPOINT DEDICADO PARA CALIBRAÇÃO MANUAL ============

  // ?? Permite testar prompt antes de aplicar edições

  app.post("/api/agent/calibrate", isAuthenticated, async (req: any, res) => {

    try {

      const { prompt, testScenarios, instruction } = req.body;



      if (!prompt) {

        return res.status(400).json({ message: "prompt é obrigatório" });

      }



      // Buscar chave Mistral

      const mistralConfig = await storage.getSystemConfig('mistral_api_key');

      const mistralApiKey = mistralConfig?.valor || process.env.MISTRAL_API_KEY || '';

      

      if (!mistralApiKey) {

        return res.status(500).json({ 

          success: false, 

          message: "Chave de API Mistral não configurada" 

        });

      }



      const { calibrarPromptEditado } = await import("./promptCalibrationService");

      

      console.log(`?? [Calibrate] Iniciando calibração manual...`);

      

      const calibrationResult = await calibrarPromptEditado(

        prompt,

        instruction || "Validar comportamento geral do agente",

        mistralApiKey,

        "mistral",

        {

          numeroCenarios: testScenarios?.length || 3,

          maxTentativasReparo: 0, // Não reparar em teste manual

          scoreMinimoAprovacao: 70

        }

      );

      

      res.json({

        success: calibrationResult.sucesso,

        score: calibrationResult.scoreGeral,

        cenariosAprovados: calibrationResult.cenariosAprovados,

        cenariosTotais: calibrationResult.cenariosTotais,

        tempoMs: calibrationResult.tempoMs,

        resultados: calibrationResult.resultados.map(r => ({

          cenarioId: r.cenarioId,

          perguntaCliente: r.perguntaCliente,

          respostaAgente: r.respostaAgente,

          passou: r.passou,

          score: r.score,

          motivo: r.motivo

        }))

      });

    } catch (error: any) {

      console.error("Error in calibration:", error);

      res.status(500).json({ message: error.message || "Falha na calibração" });

    }

  });



  // ============ ROTAS DE HISTÓRICO DO PROMPT ============

  

  // Listar versões do prompt

  app.get("/api/agent/prompt-versions", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { listarVersoes } = await import("./promptHistoryService");

      

      console.log(`[PROMPT VERSIONS] ?? Listando versões para user ${userId}`);

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

      

      console.log(`[RESTORE VERSION] ?? User ${userId} restaurando versão ${id}`);

      

      // Buscar versão original

      const versaoOriginal = await obterVersao(id);

      if (!versaoOriginal) {

        console.error(`[RESTORE VERSION] ? Versão ${id} não encontrada`);

        return res.status(404).json({ message: "Versão não encontrada" });

      }

      

      console.log(`[RESTORE VERSION] ?? Versão original: v${versaoOriginal.version_number} (${versaoOriginal.edit_type})`);

      

      // Criar nova versão restaurada

      const versaoRestaurada = await restaurarVersao(id, userId);

      

      if (!versaoRestaurada) {

        console.error(`[RESTORE VERSION] ? Falha ao criar versão restaurada`);

        return res.status(500).json({ message: "Falha ao restaurar versão" });

      }

      

      console.log(`[RESTORE VERSION] ? Nova versão criada: v${versaoRestaurada.version_number} (tipo: restore)`);

      

      // ?? CRÍTICO: Atualizar o prompt no config para o agente usar

      const agentConfig = await storage.getAgentConfig(userId);

      if (agentConfig) {

        console.log(`[RESTORE VERSION] ?? Atualizando ai_agent_config.prompt`);

        console.log(`[RESTORE VERSION] ?? Prompt antigo: ${agentConfig.prompt?.length || 0} chars`);

        console.log(`[RESTORE VERSION] ?? Prompt novo: ${versaoRestaurada.prompt_content.length} chars`);

        

        await storage.updateAgentConfig(userId, {

          prompt: versaoRestaurada.prompt_content

        });

        

        console.log(`[RESTORE VERSION] ? Config atualizado com sucesso!`);

      } else {

        console.warn(`[RESTORE VERSION] ?? Nenhum config encontrado para user ${userId}`);

      }

      

      res.json({ 

        success: true,

        newPrompt: versaoRestaurada.prompt_content,

        versionId: versaoRestaurada.id,

        versionNumber: versaoRestaurada.version_number,

        restoredFrom: versaoOriginal.version_number

      });

    } catch (error: any) {

      console.error("[RESTORE VERSION] ? Error restoring prompt version:", error);

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



  // ?? ROTA DE DEBUG: Validar consistência do sistema de versões

  app.get("/api/agent/prompt-versions/validate", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { listarVersoes, obterVersaoAtual } = await import("./promptHistoryService");

      

      console.log(`[VALIDATE] ?? Validando consistência para user ${userId}`);

      

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

        report.issues.push('? DESSINCRONIZADO: ai_agent_config.prompt diferente de prompt_versions.is_current');

      }

      if (versoesMarkadasCurrent.length > 1) {

        report.issues.push(`? MÚLTIPLAS VERSÕES CURRENT: ${versoesMarkadasCurrent.length} versões marcadas como is_current`);

      }

      if (versoesMarkadasCurrent.length === 0 && todasVersoes.length > 0) {

        report.issues.push('?? NENHUMA VERSÃO CURRENT: Existem versões mas nenhuma marcada como current');

      }

      

      if (report.issues.length === 0) {

        report.issues.push('? Sistema consistente - Nenhum problema encontrado');

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

      console.log(`?? [/api/agent/test] ENTRADA - userId: ${userId}, message: ${req.body.message?.substring(0, 30)}`);

      

      // ?? CHECK DAILY SIMULATOR LIMIT FOR FREE USERS (canonical entitlement)

      const entitlementSim = await getAccessEntitlement(userId);

      const hasActiveSubscription = entitlementSim.hasActiveSubscription;



      if (!hasActiveSubscription) {

        const dailyUsage = await storage.getDailyUsage(userId);

        if (dailyUsage.simulatorMessagesCount >= FREE_DAILY_SIMULATOR_LIMIT) {

          return res.json({

            success: false,

            limitReached: true,

            message: `Você atingiu o limite de ${FREE_DAILY_SIMULATOR_LIMIT} mensagens do simulador por dia. Assine um plano para uso ilimitado.`,

            used: dailyUsage.simulatorMessagesCount,

            limit: FREE_DAILY_SIMULATOR_LIMIT,

          });

        }

        // ?? Incrementar contador de mensagens do simulador (para usuários free)

        await storage.incrementSimulatorMessages(userId);

      }

      

      const schema = z.object({ 

        message: z.string(), 

        customPrompt: z.string().optional(),

        // ?? Suporte para histórico de conversação (simulador unificado)

        history: z.array(z.object({

          role: z.enum(["user", "assistant"]),

          content: z.string()

        })).optional(),

        // ?? Mídias já enviadas nesta sessão do simulador

        sentMedias: z.array(z.string()).optional(),

        // ?? Nome do contato para simulação (opcional - default "Visitante")

        contactName: z.string().optional()

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

      // ?? Aceita nome de contato customizado para simulação mais realista

      const testResult = await testAgentResponse(

        userId, 

        result.data.message, 

        result.data.customPrompt,

        conversationHistory,

        result.data.sentMedias,

        result.data.contactName || "Visitante"

      );

      

      // ?? RESOLVER URLs DAS MÍDIAS PARA O FRONTEND

      let mediaActions: any[] = [];

      if (testResult.mediaActions && testResult.mediaActions.length > 0) {

        const mediaLibrary = await getAgentMediaLibrary(userId);

        

        for (const action of testResult.mediaActions) {

          if (action.type === 'send_media' && action.media_name) {

            const mediaItem = mediaLibrary.find(

              m => m.name.toUpperCase() === action.media_name.toUpperCase()

            );

            

            if (mediaItem) {

              console.log(`?? [/api/agent/test] Mídia encontrada: ${action.media_name} -> ${mediaItem.storageUrl}`);

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

      

      // ?? DIVIDIR RESPOSTA IGUAL AO WHATSAPP PARA CONSISTÊNCIA DO SIMULADOR

      // Busca config do agente para obter messageSplitChars

      const agentConfig = await storage.getAgentConfig(userId);

      const messageSplitChars = agentConfig?.messageSplitChars ?? 400;

      

      // ?? PRESERVAR QUEBRAS DE LINHA NA RESPOSTA DO SIMULADOR

      // O texto original já pode ter formatação intencional (quebras de linha)

      // Apenas dividir em bolhas se necessário, mas preservar as quebras internas

      const responseText = testResult.text || "";

      

      // Se a mensagem é pequena (cabe no limite), retorna como está

      // Se é grande, divide mas preserva quebras de linha em cada parte

      let splitMessages: string[];

      if (responseText.length <= messageSplitChars || messageSplitChars === 0) {

        splitMessages = [responseText];

      } else {

        splitMessages = splitMessageHumanLike(responseText, messageSplitChars);

      }

      

      console.log(`?? [SIMULADOR] Resposta dividida em ${splitMessages.length} partes (limit: ${messageSplitChars} chars)`);

      

      res.json({ 

        response: testResult.text, // Mantém resposta completa para backward compatibility

        splitResponses: splitMessages, // Novo: array de mensagens divididas

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

        

        // Se o bucket não existir, tentar criar (apenas se ainda não verificamos)

        if (uploadError.message?.includes('Bucket not found') && !agentMediaBucketChecked) {

          // Criar bucket

          const { error: createError } = await supabase.storage.createBucket('agent-media', {

            public: true,

            fileSizeLimit: 52428800 // 50MB

          });

          

          agentMediaBucketChecked = true;

          

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



  // ==========================================================================

  // WEBSITE IMPORT ROUTES - Importação de dados de websites para o agente

  // ==========================================================================



  /**

   * Lista todas as importações de website do usuário

   */

  app.get("/api/agent/website-imports", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const imports = await db

        .select()

        .from(websiteImports)

        .where(eq(websiteImports.userId, userId))

        .orderBy(desc(websiteImports.createdAt));

      

      res.json(imports);

    } catch (error) {

      console.error("[WebsiteImport] Error listing imports:", error);

      res.status(500).json({ message: "Falha ao listar importações" });

    }

  });



  /**

   * Inicia o scraping de um website

   * POST /api/agent/import-website

   * Body: { url: string }

   */

  app.post("/api/agent/import-website", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { url } = req.body;



      if (!url || typeof url !== "string") {

        return res.status(400).json({ message: "URL é obrigatória" });

      }



      // Validar URL

      const validation = validateUrl(url);

      if (!validation.valid) {

        return res.status(400).json({ message: validation.error });

      }



      console.log(`[WebsiteImport] Usuário ${userId} iniciando import de: ${validation.normalizedUrl}`);



      // Criar registro de importação

      const [importRecord] = await db

        .insert(websiteImports)

        .values({

          userId,

          websiteUrl: validation.normalizedUrl!,

          status: "processing",

        })

        .returning();



      // Iniciar scraping (async)

      scrapeWebsite(validation.normalizedUrl!)

        .then(async (result: WebsiteScrapingResult) => {

          if (result.success) {

            // Atualizar registro com dados extraídos

            await db

              .update(websiteImports)

              .set({

                status: "completed",

                websiteName: result.websiteName,

                websiteDescription: result.websiteDescription,

                extractedText: result.extractedText,

                extractedHtml: result.extractedHtml,

                extractedProducts: result.products,

                extractedInfo: result.businessInfo,

                formattedContext: result.formattedContext,

                pagesScraped: result.pagesScraped,

                productsFound: result.productsFound,

                lastScrapedAt: new Date(),

                updatedAt: new Date(),

              })

              .where(eq(websiteImports.id, importRecord.id));



            console.log(`[WebsiteImport] ? Import ${importRecord.id} concluído: ${result.productsFound} produtos`);

          } else {

            // Atualizar com erro

            await db

              .update(websiteImports)

              .set({

                status: "failed",

                errorMessage: result.error,

                updatedAt: new Date(),

              })

              .where(eq(websiteImports.id, importRecord.id));



            console.log(`[WebsiteImport] ? Import ${importRecord.id} falhou: ${result.error}`);

          }

        })

        .catch(async (error) => {

          await db

            .update(websiteImports)

            .set({

              status: "failed",

              errorMessage: error.message,

              updatedAt: new Date(),

            })

            .where(eq(websiteImports.id, importRecord.id));

        });



      // Retornar imediatamente com o ID do import

      res.json({

        id: importRecord.id,

        status: "processing",

        message: "Importação iniciada. Acompanhe o status pelo ID.",

      });

    } catch (error: any) {

      console.error("[WebsiteImport] Error starting import:", error);

      res.status(500).json({ message: `Falha ao iniciar importação: ${error.message}` });

    }

  });



  /**

   * Verifica o status de uma importação

   * GET /api/agent/website-imports/:id

   */

  app.get("/api/agent/website-imports/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      const [importRecord] = await db

        .select()

        .from(websiteImports)

        .where(and(eq(websiteImports.id, id), eq(websiteImports.userId, userId)));



      if (!importRecord) {

        return res.status(404).json({ message: "Importação não encontrada" });

      }



      res.json(importRecord);

    } catch (error) {

      console.error("[WebsiteImport] Error fetching import:", error);

      res.status(500).json({ message: "Falha ao buscar importação" });

    }

  });



  /**

   * Aplica o conteúdo importado ao prompt do agente

   * POST /api/agent/website-imports/:id/apply

   */

  app.post("/api/agent/website-imports/:id/apply", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      // Buscar importação

      const [importRecord] = await db

        .select()

        .from(websiteImports)

        .where(and(eq(websiteImports.id, id), eq(websiteImports.userId, userId)));



      if (!importRecord) {

        return res.status(404).json({ message: "Importação não encontrada" });

      }



      if (importRecord.status !== "completed") {

        return res.status(400).json({ message: "Importação ainda não foi concluída" });

      }



      if (!importRecord.formattedContext) {

        return res.status(400).json({ message: "Nenhum conteúdo para aplicar" });

      }



      // Buscar config atual do agente

      const agentConfig = await storage.getAgentConfig(userId);

      

      if (!agentConfig) {

        return res.status(404).json({ message: "Configure seu agente antes de importar" });

      }



      // Remover contexto anterior importado (se existir)

      let currentPrompt = agentConfig.prompt || "";

      const importMarkerStart = "## ?? CATÁLOGO DE PRODUTOS/SERVIÇOS";

      const importMarkerEnd = "*Dados atualizados automaticamente via importação de website.*";

      

      const startIdx = currentPrompt.indexOf(importMarkerStart);

      if (startIdx !== -1) {

        const endIdx = currentPrompt.indexOf(importMarkerEnd, startIdx);

        if (endIdx !== -1) {

          currentPrompt = currentPrompt.substring(0, startIdx) + currentPrompt.substring(endIdx + importMarkerEnd.length);

        }

      }



      // Adicionar novo contexto

      const newPrompt = currentPrompt.trim() + "\n" + importRecord.formattedContext;



      // Salvar prompt atualizado

      await storage.saveAgentConfig(userId, {

        ...agentConfig,

        prompt: newPrompt,

      });



      // Marcar importação como aplicada

      await db

        .update(websiteImports)

        .set({

          appliedToPrompt: true,

          appliedAt: new Date(),

          updatedAt: new Date(),

        })

        .where(eq(websiteImports.id, id));



      console.log(`[WebsiteImport] ? Contexto de ${importRecord.websiteUrl} aplicado ao agente de ${userId}`);



      res.json({

        success: true,

        message: "Conteúdo aplicado ao agente com sucesso!",

        productsAdded: importRecord.productsFound,

      });

    } catch (error: any) {

      console.error("[WebsiteImport] Error applying import:", error);

      res.status(500).json({ message: `Falha ao aplicar: ${error.message}` });

    }

  });



  /**

   * Exclui uma importação

   * DELETE /api/agent/website-imports/:id

   */

  app.delete("/api/agent/website-imports/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      const [deleted] = await db

        .delete(websiteImports)

        .where(and(eq(websiteImports.id, id), eq(websiteImports.userId, userId)))

        .returning();



      if (!deleted) {

        return res.status(404).json({ message: "Importação não encontrada" });

      }



      res.json({ success: true, message: "Importação excluída" });

    } catch (error) {

      console.error("[WebsiteImport] Error deleting import:", error);

      res.status(500).json({ message: "Falha ao excluir importação" });

    }

  });



  /**

   * Preview do scraping sem salvar

   * POST /api/agent/website-imports/preview

   */

  app.post("/api/agent/website-imports/preview", isAuthenticated, async (req: any, res) => {

    try {

      const { url } = req.body;



      if (!url || typeof url !== "string") {

        return res.status(400).json({ message: "URL é obrigatória" });

      }



      const validation = validateUrl(url);

      if (!validation.valid) {

        return res.status(400).json({ message: validation.error });

      }



      console.log(`[WebsiteImport] Preview de: ${validation.normalizedUrl}`);



      // Fazer scraping

      const result = await scrapeWebsite(validation.normalizedUrl!);



      if (!result.success) {

        return res.status(400).json({ 

          success: false,

          message: result.error || "Falha ao analisar o website" 

        });

      }



      res.json({

        success: true,

        websiteUrl: result.websiteUrl,

        websiteName: result.websiteName,

        websiteDescription: result.websiteDescription,

        products: result.products,

        businessInfo: result.businessInfo,

        formattedContext: result.formattedContext,

        productsFound: result.productsFound,

      });

    } catch (error: any) {

      console.error("[WebsiteImport] Error in preview:", error);

      res.status(500).json({ message: `Erro ao analisar: ${error.message}` });

    }

  });



  // ==========================================================================

  // END WEBSITE IMPORT ROUTES

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



      // ?? FIX: Buscar config do usuário para obter timer de auto-reativação

      const agentConfig = await storage.getAgentConfig(userId);

      const autoReactivateMinutes = agentConfig?.autoReactivateMinutes ?? null;



      await storage.disableAgentForConversation(conversationId, autoReactivateMinutes);

      console.log(`?? [DISABLE API] IA desabilitada para ${conversationId}${autoReactivateMinutes ? ` (reativa em ${autoReactivateMinutes}min)` : ' (manual only)'}`);

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

      

      // ?? Quando IA é reativada, NÃO dispara resposta automática

      // O usuário deve usar "Responder com IA" se quiser uma resposta imediata

      // Isso evita conflitos em conversas que já foram encerradas

      console.log(`?? [ENABLE] IA reativada para ${conversationId} - aguardando nova mensagem do cliente`);

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error enabling agent:", error);

      res.status(500).json({ message: "Failed to enable agent" });

    }

  });



  // Status da IA para uma conversa específica

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



      // Check if agent is disabled for this conversation

      const isDisabled = await storage.isAgentDisabledForConversation(conversationId);

      

      res.json({ 

        isDisabled,

        conversationId 

      });

    } catch (error) {

      console.error("Error getting agent status:", error);

      res.status(500).json({ message: "Failed to get agent status" });

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

        // ?? FIX: Buscar config do usuário para obter timer de auto-reativação

        const agentConfig = await storage.getAgentConfig(userId);

        const autoReactivateMinutes = agentConfig?.autoReactivateMinutes ?? null;

        

        await storage.disableAgentForConversation(conversationId, autoReactivateMinutes);

        console.log(`?? [TOGGLE] IA desabilitada para ${conversationId}${autoReactivateMinutes ? ` (reativa em ${autoReactivateMinutes}min)` : ' (manual only)'}`);

      } else {

        await storage.enableAgentForConversation(conversationId);

        

        // ?? Quando IA é reativada, NÃO dispara resposta automática

        // O usuário deve usar "Responder com IA" se quiser uma resposta imediata

        // Isso evita conflitos em conversas que já foram encerradas

        console.log(`?? [TOGGLE] IA reativada para ${conversationId} - aguardando nova mensagem do cliente`);

      }



      res.json({ success: true, isDisabled: disable });

    } catch (error) {

      console.error("Error toggling agent:", error);

      res.status(500).json({ message: "Failed to toggle agent" });

    }

  });



  // ---------------------------------------------------------------------------

  // ?? RESPONDER COM IA - Dispara resposta da IA manualmente

  // ---------------------------------------------------------------------------

  // Este endpoint permite o usuário disparar uma resposta da IA sob demanda,

  // útil quando:

  // - A IA estava desativada e o usuário quer que ela responda uma vez

  // - O usuário quer forçar uma resposta mesmo que a última mensagem seja dele

  // ---------------------------------------------------------------------------

  app.post("/api/agent/respond/:conversationId", isAuthenticated, async (req: any, res) => {

    // ===============================================================

    // DEBUG: Log explícito no início para diagnóstico

    // ===============================================================

    console.log(`\n${'='.repeat(60)}`);

    console.log(`[RESPONDER COM IA] ENDPOINT ACIONADO - ${new Date().toISOString()}`);

    console.log(`${'='.repeat(60)}`);

    

    try {

      const { conversationId } = req.params;

      const userId = getUserId(req);

      

      console.log(`[RESPONDER COM IA] userId: ${userId}`);

      console.log(`[RESPONDER COM IA] conversationId: ${conversationId}`);



      // Verificar propriedade da conversa

      const conversation = await storage.getConversation(conversationId);

      if (!conversation) {

        console.log(`[RESPONDER COM IA] ERRO: Conversa não encontrada`);

        return res.status(404).json({ message: "Conversa não encontrada" });

      }

      console.log(`[RESPONDER COM IA] Conversa encontrada: ${conversation.contactName || conversation.contactNumber}`);



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        console.log(`[RESPONDER COM IA] ERRO: Acesso negado - connectionId mismatch`);

        return res.status(403).json({ message: "Acesso negado" });

      }

      console.log(`[RESPONDER COM IA] Conexão verificada: ${connection.id}`);



      // Verificar se agente global está ativo

      // IMPORTANTE: Usar getBusinessAgentConfig que é a tabela que a UI sincroniza

      const businessAgentConfig = await storage.getBusinessAgentConfig(userId);

      console.log(`[RESPONDER COM IA] businessAgentConfig.isActive: ${businessAgentConfig?.isActive}`);

      

      if (!businessAgentConfig?.isActive) {

        console.log(`[RESPONDER COM IA] ERRO: Agente não está ativo globalmente`);

        return res.status(400).json({ 

          success: false, 

          message: "O agente precisa estar ativo globalmente. Ative-o em 'Meu Agente IA'." 

        });

      }



      // Disparar resposta da IA em background (fire and forget)

      console.log(`[RESPONDER COM IA] Chamando triggerAgentResponseForConversation...`);

      

      // Disparar sem esperar resultado (não bloqueia a resposta)

      triggerAgentResponseForConversation(userId, conversationId, true)

        .then(result => {

          console.log(`[RESPONDER COM IA] RESULTADO: triggered=${result.triggered}, reason="${result.reason}"`);

        })

        .catch(error => {

          console.error(`[RESPONDER COM IA] ERRO na função trigger:`, error);

        });

      

      // Retorna sucesso imediatamente - processamento continua em background

      console.log(`[RESPONDER COM IA] Retornando sucesso ao cliente`);

      res.json({ 

        success: true, 

        message: "Solicitação enviada. A IA irá responder em breve." 

      });

    } catch (error) {

      console.error("[RESPONDER COM IA] ERRO GERAL:", error);

      res.status(500).json({ message: "Falha ao responder com IA" });

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



  // ==================== BUSINESS AGENT CONFIG ROUTES (?? ADVANCED SYSTEM) ====================

  

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

      

      // ?? TOGGLE EXCLUSIVO: Se Meu Agente IA está sendo ativado, desativar Robô Fluxo

      if (configData.isActive === true) {

        console.log(`[BUSINESS CONFIG] ?? Desativando Robô Fluxo para usuário ${userId} (ativou Meu Agente)`);

        // Usar db e sql já importados no topo do arquivo

        await db.execute(sql`

          UPDATE chatbot_configs SET

            is_active = false,

            updated_at = now()

          WHERE user_id = ${userId}

        `);

        

        // Limpar cache do fluxo

        const { clearFlowCache } = await import("./chatbotFlowEngine");

        clearFlowCache(userId);

        

        // Sincronizar ai_agent_config também

        await db.execute(sql`

          UPDATE ai_agent_config SET

            is_active = true,

            updated_at = now()

          WHERE user_id = ${userId}

        `);

        console.log(`[BUSINESS CONFIG] ? Robô Fluxo desativado, Meu Agente sincronizado`);

      }

      

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

      

      // Chamar LLM para teste (Groq ou Mistral conforme config admin)

      const { getLLMClient } = await import("./llm");

      const mistral = await getLLMClient();

      

      // Usa modelo configurado no banco de dados (sem hardcode)

      const response = await mistral.chat.complete({

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



  // ==================== PLAN LINK SYSTEM ====================

  // Get plan by link slug (public) - used for plan-specific landing

  app.get("/api/plans/by-slug/:slug", async (req, res) => {

    try {

      const { slug } = req.params;

      const allPlans = await storage.getAllPlans();

      const plan = allPlans.find(p => (p as any).linkSlug === slug && p.ativo);

      

      if (!plan) {

        return res.status(404).json({ plan: null, message: "Plano não encontrado" });

      }

      

      res.json({

        plan: {

          id: plan.id,

          nome: plan.nome,

          descricao: plan.descricao,

          valor: plan.valor,

          valorOriginal: (plan as any).valorOriginal,

          valorPrimeiraCobranca: (plan as any).valorPrimeiraCobranca,

          periodicidade: plan.periodicidade,

          tipo: plan.tipo,

          caracteristicas: plan.caracteristicas,

          linkSlug: (plan as any).linkSlug,

        }

      });

    } catch (error) {

      console.error("Error fetching plan by slug:", error);

      res.status(500).json({ plan: null, message: "Erro ao buscar plano" });

    }

  });



  // Store plan assignment in session before signup

  app.post("/api/plans/assign-by-link", async (req: any, res) => {

    try {

      const { slug, planId } = req.body;

      

      let targetPlanId = planId;

      

      // If slug is provided, find the plan by slug

      if (slug && !planId) {

        const allPlans = await storage.getAllPlans();

        const plan = allPlans.find(p => (p as any).linkSlug === slug && p.ativo);

        if (plan) {

          targetPlanId = plan.id;

        }

      }

      

      if (!targetPlanId) {

        return res.status(400).json({ message: "Plano não encontrado" });

      }

      

      // Validate plan exists

      const plan = await storage.getPlan(targetPlanId);

      if (!plan || !plan.ativo) {

        return res.status(404).json({ message: "Plano não encontrado" });

      }

      

      // Store in session

      req.session.assignedPlanId = targetPlanId;

      res.json({ success: true, planId: targetPlanId });

    } catch (error) {

      console.error("Error assigning plan:", error);

      res.status(500).json({ message: "Erro ao atribuir plano" });

    }

  });



  // Get assigned plan from session (for signup flow)

  app.get("/api/plans/assigned", async (req: any, res) => {

    try {

      const assignedPlanId = req.session?.assignedPlanId;

      if (!assignedPlanId) {

        return res.json({ assigned: false });

      }

      

      const plan = await storage.getPlan(assignedPlanId);

      if (!plan || !plan.ativo) {

        return res.json({ assigned: false });

      }

      

      res.json({

        assigned: true,

        plan: {

          id: plan.id,

          nome: plan.nome,

          descricao: plan.descricao,

          valor: plan.valor,

          valorOriginal: (plan as any).valorOriginal,

          valorPrimeiraCobranca: (plan as any).valorPrimeiraCobranca,

          periodicidade: plan.periodicidade,

          tipo: plan.tipo,

          caracteristicas: plan.caracteristicas,

        }

      });

    } catch (error) {

      console.error("Error getting assigned plan:", error);

      res.status(500).json({ message: "Erro ao buscar plano atribuído" });

    }

  });



  // Get user's assigned plan (for logged in users)

  app.get("/api/user/assigned-plan", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const user = await storage.getUser(userId);

      

      if (!user || !(user as any).assignedPlanId) {

        return res.json({ hasAssignedPlan: false });

      }

      

      const plan = await storage.getPlan((user as any).assignedPlanId);

      if (!plan || !plan.ativo) {

        return res.json({ hasAssignedPlan: false });

      }

      

      res.json({

        hasAssignedPlan: true,

        plan: {

          id: plan.id,

          nome: plan.nome,

          descricao: plan.descricao,

          valor: plan.valor,

          valorOriginal: (plan as any).valorOriginal,

          valorPrimeiraCobranca: (plan as any).valorPrimeiraCobranca,

          periodicidade: plan.periodicidade,

          tipo: plan.tipo,

          caracteristicas: plan.caracteristicas,

        }

      });

    } catch (error) {

      console.error("Error getting user assigned plan:", error);

      res.status(500).json({ message: "Erro ao buscar plano do usuário" });

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



      // ------------------------------------------------------------------

      // PROTEÇÃO CONTRA DUPLICADOS: Verificar se já existe assinatura 

      // pendente criada nos últimos 5 minutos para este mesmo plano

      // ------------------------------------------------------------------

      const recentPendingSubscription = await db.query.subscriptions.findFirst({

        where: and(

          eq(subscriptions.userId, userId),

          eq(subscriptions.planId, planId),

          eq(subscriptions.status, "pending"),

          gte(subscriptions.createdAt, new Date(Date.now() - 5 * 60 * 1000)) // Últimos 5 minutos

        ),

        orderBy: [desc(subscriptions.createdAt)]

      });



      if (recentPendingSubscription) {

        console.log(`[Subscription] Reutilizando assinatura pendente existente: ${recentPendingSubscription.id}`);

        // Retornar a assinatura existente ao invés de criar uma nova

        return res.json(recentPendingSubscription);

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



      console.log(`??? [ADMIN] Iniciando reset completo do cliente: ${cleanPhone}`);



      // Limpar sessão em memória (do adminAgentService)

      const { clearClientSession } = await import("./adminAgentService");

      clearClientSession(cleanPhone);

      

      // Resetar todos os dados no banco

      const result = await storage.resetClientByPhone(cleanPhone);



      console.log(`? [ADMIN] Cliente ${cleanPhone} resetado completamente`, result);



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

      const [mistralKey, mistralModel, pixKey, zaiKey, llmProvider, groqKey, groqModel, openrouterKey, openrouterModel, openrouterProvider] = await withRetry(() => 

        Promise.all([

          storage.getSystemConfig("mistral_api_key"),

          storage.getSystemConfig("mistral_model"),

          storage.getSystemConfig("pix_key"),

          storage.getSystemConfig("zai_api_key"),

          storage.getSystemConfig("llm_provider"),

          storage.getSystemConfig("groq_api_key"),

          storage.getSystemConfig("groq_model"),

          storage.getSystemConfig("openrouter_api_key"),

          storage.getSystemConfig("openrouter_model"),

          storage.getSystemConfig("openrouter_provider"),

        ])

      );

      res.json({

        mistral_api_key: mistralKey?.valor || "",

        mistral_model: mistralModel?.valor || "mistral-medium-latest",

        pix_key: pixKey?.valor || "",

        zai_api_key: zaiKey?.valor || "",

        llm_provider: llmProvider?.valor || "mistral",

        groq_api_key: groqKey?.valor || "",

        groq_model: groqModel?.valor || "openai/gpt-oss-20b",

        openrouter_api_key: openrouterKey?.valor || "",

        openrouter_model: openrouterModel?.valor || "google/gemma-3-4b-it:free",

        openrouter_provider: openrouterProvider?.valor || "auto",

      });

    } catch (error) {

      console.error("Error fetching config:", error);

      res.status(500).json({ message: "Failed to fetch config" });

    }

  });

  
  // ═══════════════════════════════════════════════════════════════════
  // CHECKOUT CONFIG - Configurações públicas para o checkout
  // Retorna se PIX manual está ativado para esconder cartão no frontend
  // ═══════════════════════════════════════════════════════════════════
  app.get("/api/checkout/config", async (req, res) => {
    try {
      const [pixManualConfig, pixKeyConfig] = await Promise.all([
        storage.getSystemConfig('pix_manual_enabled'),
        storage.getSystemConfig('pix_key'),
      ]);
      
      const pixManualEnabled = pixManualConfig?.valor === 'true' || pixManualConfig?.valor === true;
      
      res.json({
        pix_manual_enabled: pixManualEnabled,
        has_pix_key: !!pixKeyConfig?.valor,
      });
    } catch (error) {
      console.error("Error fetching checkout config:", error);
      res.status(500).json({ message: "Failed to fetch checkout config" });
    }
  });

  // Update system config

  app.put("/api/admin/config", isAdmin, async (req, res) => {

    try {

      const { mistral_api_key, mistral_model, pix_key, zai_api_key, llm_provider, groq_api_key, groq_model, openrouter_api_key, openrouter_model, openrouter_provider } = req.body;



      if (mistral_api_key !== undefined) {

        // Limpar espaços e caracteres invisíveis da chave antes de salvar

        const cleanKey = mistral_api_key.trim().replace(/[\r\n\t\s]/g, "");

        await storage.updateSystemConfig("mistral_api_key", cleanKey);

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] Mistral key saved (${cleanKey.length} chars)`);

      }



      // Mistral model selection

      if (mistral_model !== undefined) {

        await storage.updateSystemConfig("mistral_model", mistral_model.trim());

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] Mistral model set to: ${mistral_model.trim()}`);

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



      // LLM Provider Toggle (OpenRouter/Groq/Mistral)

      if (llm_provider !== undefined) {

        const validProviders = ["openrouter", "groq", "mistral"];

        const provider = llm_provider.trim().toLowerCase();

        if (validProviders.includes(provider)) {

          await storage.updateSystemConfig("llm_provider", provider);

          invalidateLLMConfigCache(); // Invalida cache para aplicar imediatamente

          console.log(`[Admin] LLM Provider changed to: ${provider}`);

        }

      }



      if (groq_api_key !== undefined) {

        const cleanGroqKey = groq_api_key.trim().replace(/[\r\n\t\s]/g, "");

        await storage.updateSystemConfig("groq_api_key", cleanGroqKey);

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] Groq API key saved (${cleanGroqKey.length} chars)`);

      }



      if (groq_model !== undefined) {

        await storage.updateSystemConfig("groq_model", groq_model.trim());

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] Groq model set to: ${groq_model.trim()}`);

      }



      // OpenRouter configurations

      if (openrouter_api_key !== undefined) {

        const cleanOpenRouterKey = openrouter_api_key.trim().replace(/[\r\n\t\s]/g, "");

        await storage.updateSystemConfig("openrouter_api_key", cleanOpenRouterKey);

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] OpenRouter API key saved (${cleanOpenRouterKey.length} chars)`);

      }



      if (openrouter_model !== undefined) {

        await storage.updateSystemConfig("openrouter_model", openrouter_model.trim());

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] OpenRouter model set to: ${openrouter_model.trim()}`);

      }



      // OpenRouter provider (ex: chutes, hyperbolic, deepinfra)

      if (openrouter_provider !== undefined) {

        await storage.updateSystemConfig("openrouter_provider", openrouter_provider.trim().toLowerCase());

        invalidateLLMConfigCache(); // Invalida cache

        console.log(`[Admin] OpenRouter provider set to: ${openrouter_provider.trim()}`);

      }



      res.json({ success: true });

    } catch (error) {

      console.error("Error updating config:", error);

      res.status(500).json({ message: "Failed to update config" });

    }

  });



  // ==================== MISTRAL QUEUE STATUS API ====================

  

  // Get Mistral queue status - shows fallback timer and model rotation info

  app.get("/api/admin/mistral-queue", isAdmin, async (_req, res) => {

    try {

      const queueInfo = getMistralQueueInfo();

      const modelStatus = getMistralModelStatus();

      

      res.json({

        queue: queueInfo,

        models: modelStatus,

        config: {

          fallbackDelayMinutes: 5,

          description: "Sistema de fila inteligente que tenta modelos Mistral em rotação por 5 minutos antes de fazer fallback para OpenRouter/Groq"

        }

      });

    } catch (error) {

      console.error("Error fetching Mistral queue status:", error);

      res.status(500).json({ message: "Failed to fetch queue status" });

    }

  });



  // ==================== OPENROUTER MODELS & PROVIDERS API ====================

  

  // Fetch available models from OpenRouter API

  app.get("/api/admin/openrouter/models", isAdmin, async (_req, res) => {

    try {

      console.log(`[Admin] Fetching OpenRouter models list...`);

      

      const response = await fetch('https://openrouter.ai/api/v1/models', {

        method: 'GET',

        headers: {

          'Content-Type': 'application/json',

        }

      });

      

      if (!response.ok) {

        throw new Error(`OpenRouter API error: ${response.status}`);

      }

      

      const data = await response.json();

      

      // Filtrar modelos de chat (excluir embedding, moderation, etc)

      // e retornar apenas campos relevantes para reduzir payload

      const models = (data.data || [])

        .filter((model: any) => {

          // Excluir modelos de embedding, moderation, e modelos que não são de chat

          const id = model.id?.toLowerCase() || '';

          return !id.includes('embed') && 

                 !id.includes('guard') && 

                 !id.includes('moderation') &&

                 !id.includes('tts') &&

                 !id.includes('whisper') &&

                 !id.includes('vision-preview');

        })

        .map((model: any) => ({

          id: model.id,

          name: model.name,

          description: model.description,

          context_length: model.context_length,

          pricing: model.pricing,

          top_provider: model.top_provider,

          architecture: model.architecture,

        }))

        .sort((a: any, b: any) => {

          // Ordenar por preço (mais barato primeiro)

          const priceA = parseFloat(a.pricing?.prompt || '999');

          const priceB = parseFloat(b.pricing?.prompt || '999');

          return priceA - priceB;

        });

      

      console.log(`[Admin] Found ${models.length} chat models from OpenRouter`);

      res.json({ models });

    } catch (error: any) {

      console.error("Error fetching OpenRouter models:", error);

      res.status(500).json({ message: error.message });

    }

  });



  // Get providers for a specific model from OpenRouter

  app.get("/api/admin/openrouter/providers/:modelId", isAdmin, async (req, res) => {

    try {

      const modelId = decodeURIComponent(req.params.modelId);

      console.log(`[Admin] Fetching providers for model: ${modelId}`);

      

      // OpenRouter não tem endpoint específico para providers, 

      // mas podemos extrair do endpoint de modelos

      const response = await fetch('https://openrouter.ai/api/v1/models', {

        method: 'GET',

        headers: {

          'Content-Type': 'application/json',

        }

      });

      

      if (!response.ok) {

        throw new Error(`OpenRouter API error: ${response.status}`);

      }

      

      const data = await response.json();

      const model = (data.data || []).find((m: any) => m.id === modelId);

      

      if (!model) {

        return res.status(404).json({ message: `Model ${modelId} not found` });

      }

      

      // Lista comum de providers do OpenRouter

      // O provider exato depende do modelo, mas estes são os mais comuns

      const commonProviders = [

        { slug: 'chutes', name: 'Chutes', description: 'Mais barato, $0.02-0.10/M tokens (bf16)' },

        { slug: 'hyperbolic', name: 'Hyperbolic', description: 'Barato, $0.04-0.12/M tokens' },

        { slug: 'deepinfra', name: 'DeepInfra', description: 'Rápido, $0.05-0.15/M tokens' },

        { slug: 'together', name: 'Together AI', description: 'Confiável, $0.10-0.30/M tokens' },

        { slug: 'fireworks', name: 'Fireworks', description: 'Alta performance' },

        { slug: 'lepton', name: 'Lepton', description: 'Baixa latência' },

        { slug: 'novita', name: 'Novita AI', description: 'Alternativa econômica' },

        { slug: 'avian', name: 'Avian', description: 'API simples' },

      ];

      

      // Retornar info do modelo com providers sugeridos

      res.json({

        model: {

          id: model.id,

          name: model.name,

          pricing: model.pricing,

          top_provider: model.top_provider,

        },

        providers: commonProviders,

        recommended: 'chutes', // Sempre recomendar Chutes por ser mais barato

      });

    } catch (error: any) {

      console.error("Error fetching providers:", error);

      res.status(500).json({ message: error.message });

    }

  });



  // ==================== STORAGE CLEANUP ROUTES ====================

  

  // Get storage statistics (admin only)

  app.get("/api/admin/storage/stats", isAdmin, async (_req, res) => {

    try {

      const stats = await getStorageStats();

      res.json(stats);

    } catch (error: any) {

      console.error("Error fetching storage stats:", error);

      res.status(500).json({ message: error.message });

    }

  });

  

  // Force cleanup of old media (admin only)

  app.post("/api/admin/storage/cleanup", isAdmin, async (_req, res) => {

    try {

      console.log(`??? [ADMIN] Limpeza de mídia forçada solicitada`);

      const result = await forceMediaCleanup();

      res.json({

        success: true,

        message: `Limpeza concluída: ${result.deletedFiles} arquivos deletados`,

        ...result,

      });

    } catch (error: any) {

      console.error("Error during storage cleanup:", error);

      res.status(500).json({ message: error.message });

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

        // Payment rejected - Mensagens em português brasileiro

        // Documentação: https://www.mercadopago.com.br/developers/pt/docs/checkout-api-payments/error-messages

        const errorMessages: Record<string, string> = {

          // Erros de validação do cartão

          "cc_rejected_bad_filled_card_number": "Número do cartão inválido. Verifique e tente novamente.",

          "cc_rejected_bad_filled_date": "Data de validade inválida. Verifique mês/ano.",

          "cc_rejected_bad_filled_other": "Dados do cartão incorretos. Verifique as informações.",

          "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) inválido.",

          "CC_VAL_433": "?? Validação do cartão falhou. Use um cartão real em modo produção.",

          

          // Erros de cartão bloqueado/desativado

          "cc_rejected_blacklist": "Este cartão não pode ser utilizado. Use outro cartão.",

          "cc_rejected_card_disabled": "Cartão desativado. Ative-o com sua operadora ou use outro.",

          "cc_rejected_card_error": "Erro no cartão. Use outro cartão.",

          

          // Erros que requerem ação do usuário

          "cc_rejected_call_for_authorize": "Ligue para sua operadora de cartão para autorizar.",

          "cc_rejected_insufficient_amount": "Saldo insuficiente no cartão.",

          "cc_rejected_max_attempts": "Limite de tentativas excedido. Aguarde e tente novamente.",

          

          // Erros de segurança/fraude

          "cc_rejected_high_risk": "Pagamento recusado por segurança. Tente outro cartão.",

          "cc_rejected_duplicated_payment": "Pagamento duplicado. Verifique sua fatura.",

          

          // Erros de configuração

          "cc_rejected_invalid_installments": "Parcelas inválidas para este cartão.",

          "cc_rejected_other_reason": "Pagamento não aprovado. Tente outro cartão.",

          

          // Erros genéricos

          "rejected": "Pagamento recusado. Verifique os dados ou use outro cartão.",

          "pending_contingency": "Processando pagamento. Aguarde a confirmação.",

          "pending_review_manual": "Pagamento em análise. Aguarde a confirmação.",

        };

        

        const message = errorMessages[result.status_detail] || errorMessages[result.status] || result.message || "Pagamento não aprovado. Verifique os dados do cartão.";

        

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

  // -------------------------------------------------------------------------------

  // CRIAR ASSINATURA RECORRENTE VIA MERCADO PAGO (preapproval API)

  // -------------------------------------------------------------------------------

  // VERSÃO 2025: Suporta dois tokens para cobrança imediata + assinatura recorrente

  // - paymentToken: Usado para /v1/payments (cobrança IMEDIATA)

  // - subscriptionToken: Usado para /preapproval (assinatura recorrente no próximo mês)

  // -------------------------------------------------------------------------------

  app.post("/api/subscriptions/create-mp-subscription", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      // Suportar tanto formato antigo (token) quanto novo (paymentToken + subscriptionToken)

      const { 

        subscriptionId, 

        token,                    // Formato antigo (compatibilidade)

        paymentToken,             // Token para pagamento imediato

        subscriptionToken,        // Token para assinatura recorrente

        payerEmail, 

        paymentMethodId, 

        issuerId, 

        cardholderName, 

        identificationNumber,

        installments: requestedInstallments // Número de parcelas para planos de implementação

      } = req.body;

      

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

      

      // ------------------------------------------------------------------

      // PROTEÇÃO CONTRA COBRANÇAS DUPLICADAS

      // Verifica se já existe um pagamento aprovado/em análise nos últimos 2 minutos

      // ou se a assinatura já está ativa

      // ------------------------------------------------------------------

      if (subscription.status === "active" && subscription.mpSubscriptionId) {

        console.log(`[MP Subscription] Assinatura ${subscriptionId} já está ativa com MP ID: ${subscription.mpSubscriptionId}`);

        return res.json({

          status: "approved",

          message: "Sua assinatura já está ativa!",

          subscriptionId: subscription.mpSubscriptionId,

          mpStatus: subscription.mpStatus || "authorized"

        });

      }



      // Verificar pagamento recente aprovado nos últimos 2 minutos

      const recentPayment = await db.query.paymentHistory.findFirst({

        where: and(

          eq(paymentHistory.subscriptionId, subscriptionId),

          inArray(paymentHistory.status, ["approved", "in_process", "pending"]),

          gte(paymentHistory.createdAt, new Date(Date.now() - 2 * 60 * 1000)) // Últimos 2 minutos

        ),

        orderBy: [desc(paymentHistory.createdAt)]

      });



      if (recentPayment) {

        console.log(`[MP Subscription] Pagamento recente encontrado (${recentPayment.status}): ${recentPayment.mpPaymentId}`);

        if (recentPayment.status === "approved") {

          return res.json({

            status: "approved",

            message: "Pagamento já foi aprovado! Sua assinatura está sendo ativada.",

            mpPaymentId: recentPayment.mpPaymentId

          });

        } else {

          return res.json({

            status: recentPayment.status,

            message: "Pagamento já está sendo processado. Aguarde a confirmação.",

            mpPaymentId: recentPayment.mpPaymentId

          });

        }

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

      

      // Determinar valor da primeira cobrança

      const primeiraCobrancaValor = hasSetupFee ? valorPrimeiraCobranca : valorMensal;

      

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

      

      // Determinar qual token usar (compatibilidade com formato antigo)

      const tokenParaPagamento = paymentToken || token;

      const tokenParaAssinatura = subscriptionToken || null;

      

      // Determinar número de parcelas (apenas para planos de implementação)

      // Validar: máximo 12 parcelas, mínimo 1

      const installments = hasSetupFee && requestedInstallments ? 

        Math.min(Math.max(1, parseInt(requestedInstallments) || 1), 12) : 1;

      

      console.log("[MP Subscription] Creating subscription:", {

        subscriptionId,

        planName: plan.nome,

        valorMensal,

        valorPrimeiraCobranca: primeiraCobrancaValor,

        hasSetupFee,

        installments,

        frequency,

        frequency_type,

        hasPaymentToken: !!tokenParaPagamento,

        hasSubscriptionToken: !!tokenParaAssinatura,

        mode: tokenParaAssinatura ? "TWO_TOKENS" : (tokenParaPagamento ? "SINGLE_TOKEN" : "NO_TOKEN"),

      });

      

      // -------------------------------------------------------------------------------

      // VERSÃO 2025: FLUXO DE DOIS TOKENS PARA COBRANÇA IMEDIATA + ASSINATURA RECORRENTE

      // -------------------------------------------------------------------------------

      // MODO 1 (DOIS TOKENS): Frontend envia paymentToken + subscriptionToken

      //   - paymentToken: Usado em /v1/payments para cobrança IMEDIATA

      //   - subscriptionToken: Usado em /preapproval para assinatura (próximo mês)

      //

      // MODO 2 (TOKEN ÚNICO - compatibilidade): Frontend envia apenas token

      //   - Usado em /preapproval com status="authorized"

      //   - MP cobra automaticamente "em até 1 hora"

      //

      // MODO 3 (SEM TOKEN): Usuário completa via init_point

      // -------------------------------------------------------------------------------

      

      // -------------------------------------------------------------------------------

      // MODO 1: DOIS TOKENS - Cobrança imediata + Assinatura recorrente

      // -------------------------------------------------------------------------------

      if (tokenParaPagamento && tokenParaAssinatura) {

        console.log("[MP Subscription] --- MODO DOIS TOKENS ---");

        console.log("[MP Subscription] Etapa 1: Cobrança imediata via /v1/payments");

        

        // -------------------------------------------------------------------

        // ETAPA 1: PAGAMENTO IMEDIATO via /v1/payments (com suporte a parcelamento)

        // -------------------------------------------------------------------

        const paymentData = {

          token: tokenParaPagamento,

          transaction_amount: primeiraCobrancaValor,

          description: `${plan.nome} - AgenteZap${installments > 1 ? ` (${installments}x)` : ''}`,

          installments: installments, // Número de parcelas (1 a 12)

          payment_method_id: paymentMethodId || "visa",

          statement_descriptor: "AGENTEZAP",

          external_reference: `sub_${subscriptionId}_first`,

          notification_url: `${baseUrl}/api/webhooks/mercadopago`,

          payer: {

            email: payerEmail,

            ...(identificationNumber && {

              identification: {

                type: "CPF",

                number: identificationNumber.replace(/\D/g, ""),

              }

            }),

          },

        };

        

        console.log("[MP Subscription] Payment data:", JSON.stringify(paymentData, null, 2));

        

        const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${accessToken}`,

            "X-Idempotency-Key": `payment_${subscriptionId}_${Date.now()}`,

          },

          body: JSON.stringify(paymentData),

        });

        

        const paymentResult = await paymentResponse.json();

        console.log("[MP Subscription] Payment result:", JSON.stringify(paymentResult, null, 2));

        

        // -------------------------------------------------------------------

        // VERIFICAR RESULTADO DO PAGAMENTO - APENAS "approved" PERMITE CONTINUAR!

        // CORREÇÃO 2025: NÃO tratar "in_process" como aprovado!

        // -------------------------------------------------------------------

        

        // CASO 1: PAGAMENTO EM ANÁLISE (in_process) - NÃO criar assinatura ainda!

        if (paymentResult.status === "in_process") {

          console.log("[MP Subscription] ? Pagamento em análise (in_process):", paymentResult.status_detail);

          

          // Registrar no histórico como pendente

          try {

            await storage.createPaymentHistory({

              subscriptionId,

              userId,

              mpPaymentId: paymentResult.id.toString(),

              amount: primeiraCobrancaValor.toString(),

              status: "in_process",

              statusDetail: paymentResult.status_detail || "pending_review_manual",

              paymentType: hasSetupFee ? "setup_fee" : "subscription_first_payment",

              paymentMethod: paymentMethodId || "credit_card",

              paymentDate: new Date(),

              payerEmail,

              rawResponse: paymentResult,

            });

            console.log("[MP Subscription] Pagamento pendente registrado no histórico");

          } catch (historyError) {

            console.error("[MP Subscription] Erro ao registrar histórico:", historyError);

          }

          

          // Atualizar assinatura local como "pending_payment"

          await storage.updateSubscription(subscriptionId, {

            status: "pending_payment",

            mpStatus: "in_process",

            payerEmail,

            paymentMethod: paymentMethodId || "credit_card",

          });

          

          // Retornar status pendente - NÃO ativar a assinatura!

          return res.json({

            status: "in_process",

            message: "? Pagamento em análise. Você receberá uma confirmação em até 2 dias úteis por e-mail. Sua assinatura será ativada automaticamente após a aprovação.",

            mpPaymentId: paymentResult.id,

            statusDetail: paymentResult.status_detail,

          });

        }

        

        // CASO 2: PAGAMENTO REJEITADO - Retornar erro

        if (paymentResult.status !== "approved") {

          // Pagamento falhou - não criar assinatura

          const errorMessages: Record<string, string> = {

            "cc_rejected_bad_filled_card_number": "Número do cartão inválido.",

            "cc_rejected_bad_filled_date": "Data de validade inválida.",

            "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) inválido.",

            "cc_rejected_insufficient_amount": "Saldo insuficiente no cartão.",

            "cc_rejected_high_risk": "Pagamento recusado por segurança.",

            "cc_rejected_call_for_authorize": "Ligue para sua operadora para autorizar.",

            "cc_rejected_card_disabled": "Cartão desativado. Use outro cartão.",

            "cc_rejected_other_reason": "Pagamento não aprovado. Tente outro cartão.",

            "invalid_users": "?? Erro: Usando cartão de teste em modo produção.",

          };

          

          const statusDetail = paymentResult.status_detail || "";

          let errorMessage = errorMessages[statusDetail] || paymentResult.message || "Pagamento não aprovado. Tente outro cartão.";

          

          console.log("[MP Subscription] ? Pagamento rejeitado:", paymentResult.status, statusDetail);

          

          return res.json({

            status: "rejected",

            message: errorMessage,

            errorCode: statusDetail,

          });

        }

        

        // CASO 3: PAGAMENTO APROVADO - Continuar com criação da assinatura

        console.log("[MP Subscription] ? Pagamento APROVADO! ID:", paymentResult.id);

        

        try {

          await storage.createPaymentHistory({

            subscriptionId,

            userId,

            mpPaymentId: paymentResult.id.toString(),

            amount: primeiraCobrancaValor.toString(),

            status: paymentResult.status,

            statusDetail: paymentResult.status_detail || "accredited",

            paymentType: hasSetupFee ? "setup_fee" : "subscription_first_payment",

            paymentMethod: paymentMethodId || "credit_card",

            paymentDate: new Date(),

            payerEmail,

            rawResponse: paymentResult,

          });

          console.log("[MP Subscription] Pagamento registrado no histórico");

        } catch (historyError) {

          console.error("[MP Subscription] Erro ao registrar histórico:", historyError);

        }

        

        // -------------------------------------------------------------------

        // ETAPA 2: CRIAR ASSINATURA RECORRENTE via /preapproval

        // Start date = próximo mês (mesmo dia)

        // -------------------------------------------------------------------

        console.log("[MP Subscription] Etapa 2: Criando assinatura recorrente via /preapproval");

        

        // Calcular data de início (próximo mês, mesmo dia)

        const nextMonthStartDate = new Date();

        nextMonthStartDate.setMonth(nextMonthStartDate.getMonth() + 1);

        

        // Ajustar para último dia do mês se necessário

        const currentDay = new Date().getDate();

        const nextMonthLastDay = new Date(nextMonthStartDate.getFullYear(), nextMonthStartDate.getMonth() + 1, 0).getDate();

        if (currentDay > nextMonthLastDay) {

          nextMonthStartDate.setDate(nextMonthLastDay);

        }

        

        const endDate = new Date();

        endDate.setFullYear(endDate.getFullYear() + 5); // 5 anos máximo

        

        const subscriptionData = {

          reason: `${plan.nome} - AgenteZap (Recorrente)`,

          external_reference: `sub_${subscriptionId}_recurring`,

          payer_email: payerEmail,

          card_token_id: tokenParaAssinatura,

          status: "authorized",

          auto_recurring: {

            frequency: frequency,

            frequency_type: frequency_type,

            transaction_amount: valorMensal, // Valor recorrente mensal

            currency_id: "BRL",

            start_date: nextMonthStartDate.toISOString(), // Começa no PRÓXIMO MÊS

            end_date: endDate.toISOString(),

            billing_day: currentDay <= 28 ? currentDay : 28, // Mesmo dia do mês (máx 28)

            billing_day_proportional: false, // NÃO cobrar proporcional (já cobramos o primeiro)

          },

          back_url: `${baseUrl}/dashboard`,

        };

        

        console.log("[MP Subscription] Subscription data:", JSON.stringify(subscriptionData, null, 2));

        

        const subscriptionResponse = await fetch("https://api.mercadopago.com/preapproval", {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${accessToken}`,

            "X-Idempotency-Key": `preapproval_${subscriptionId}_${Date.now()}`,

          },

          body: JSON.stringify(subscriptionData),

        });

        

        const subscriptionResult = await subscriptionResponse.json();

        console.log("[MP Subscription] Subscription result:", JSON.stringify(subscriptionResult, null, 2));

        

        // Verificar se assinatura foi criada

        if (subscriptionResult.id) {

          // Assinatura criada com sucesso!

          const dataFim = new Date();

          if (frequency_type === "months") {

            dataFim.setMonth(dataFim.getMonth() + frequency);

          } else if (frequency_type === "years") {

            dataFim.setFullYear(dataFim.getFullYear() + frequency);

          } else {

            dataFim.setDate(dataFim.getDate() + frequenciaDias);

          }

          

          // Atualizar assinatura local

          await storage.updateSubscription(subscriptionId, {

            status: "active",

            dataInicio: new Date(),

            dataFim,

            mpSubscriptionId: subscriptionResult.id,

            mpStatus: subscriptionResult.status,

            payerEmail,

            paymentMethod: paymentMethodId || "credit_card",

            nextPaymentDate: nextMonthStartDate,

          });

          

          console.log("[MP Subscription] ?? SUCESSO COMPLETO!");

          console.log("[MP Subscription] - Pagamento imediato: R$", primeiraCobrancaValor);

          console.log("[MP Subscription] - Assinatura ID:", subscriptionResult.id);

          console.log("[MP Subscription] - Próxima cobrança:", nextMonthStartDate.toISOString());

          

          return res.json({

            status: "approved",

            message: `?? Pagamento de R$ ${primeiraCobrancaValor.toFixed(2).replace(".", ",")} aprovado! Assinatura ativada. Próxima cobrança: ${nextMonthStartDate.toLocaleDateString("pt-BR")}`,

            subscriptionId: subscriptionResult.id,

            mpPaymentId: paymentResult.id,

            mpStatus: subscriptionResult.status,

            nextPaymentDate: nextMonthStartDate.toISOString(),

          });

        } else {

          // Assinatura falhou, mas pagamento foi feito

          // Ativar assinatura local mesmo assim (só sem recorrência automática)

          console.log("[MP Subscription] ?? Assinatura falhou, mas pagamento foi aprovado");

          console.log("[MP Subscription] Erro:", subscriptionResult.message || subscriptionResult.error);

          

          const dataFim = new Date();

          dataFim.setMonth(dataFim.getMonth() + frequency);

          

          await storage.updateSubscription(subscriptionId, {

            status: "active",

            dataInicio: new Date(),

            dataFim,

            mpSubscriptionId: null, // Sem assinatura recorrente

            mpStatus: "payment_only",

            payerEmail,

            paymentMethod: paymentMethodId || "credit_card",

          });

          

          return res.json({

            status: "approved",

            message: `? Pagamento de R$ ${primeiraCobrancaValor.toFixed(2).replace(".", ",")} aprovado! Sua assinatura está ativa. (Nota: A recorrência automática não foi configurada - você receberá um lembrete antes do vencimento)`,

            mpPaymentId: paymentResult.id,

            warning: "subscription_creation_failed",

          });

        }

      }

      

      // -------------------------------------------------------------------------------

      // MODO 2: TOKEN ÚNICO - Cobrança IMEDIATA + Assinatura pendente para renovação

      // VERSÃO 2025: NUNCA esperar 1 hora - SEMPRE cobrar imediatamente!

      // -------------------------------------------------------------------------------

      if (tokenParaPagamento && !tokenParaAssinatura) {

        console.log("[MP Subscription] --- MODO TOKEN ÚNICO - COBRANÇA IMEDIATA ---");

        console.log("[MP Subscription] Etapa 1: Cobrança IMEDIATA via /v1/payments");

        console.log("[MP Subscription] Etapa 2: Criar assinatura pendente para renovação futura");

        

        // -------------------------------------------------------------------

        // ETAPA 1: PAGAMENTO IMEDIATO via /v1/payments (com suporte a parcelamento)

        // -------------------------------------------------------------------

        const paymentData = {

          token: tokenParaPagamento,

          transaction_amount: primeiraCobrancaValor,

          description: `${plan.nome} - AgenteZap${installments > 1 ? ` (${installments}x)` : ''}`,

          installments: installments, // Número de parcelas (1 a 12)

          payment_method_id: paymentMethodId || "visa",

          statement_descriptor: "AGENTEZAP",

          external_reference: `sub_${subscriptionId}_single`,

          notification_url: `${baseUrl}/api/webhooks/mercadopago`,

          payer: {

            email: payerEmail,

            ...(identificationNumber && {

              identification: {

                type: "CPF",

                number: identificationNumber.replace(/\D/g, ""),

              }

            }),

          },

        };

        

        console.log("[MP Subscription] Payment data:", JSON.stringify(paymentData, null, 2));

        

        const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${accessToken}`,

            "X-Idempotency-Key": `payment_single_${subscriptionId}_${Date.now()}`,

          },

          body: JSON.stringify(paymentData),

        });

        

        const paymentResult = await paymentResponse.json();

        console.log("[MP Subscription] Payment result:", JSON.stringify(paymentResult, null, 2));

        

        // -------------------------------------------------------------------

        // VERIFICAR RESULTADO DO PAGAMENTO - APENAS "approved" PERMITE CONTINUAR!

        // CORREÇÃO 2025: NÃO tratar "in_process" como aprovado!

        // -------------------------------------------------------------------

        

        // CASO 1: PAGAMENTO EM ANÁLISE (in_process) - NÃO criar assinatura ainda!

        if (paymentResult.status === "in_process") {

          console.log("[MP Subscription] ? Pagamento em análise (in_process):", paymentResult.status_detail);

          

          // Registrar no histórico como pendente

          try {

            await storage.createPaymentHistory({

              subscriptionId,

              userId,

              mpPaymentId: paymentResult.id.toString(),

              amount: primeiraCobrancaValor.toString(),

              status: "in_process",

              statusDetail: paymentResult.status_detail || "pending_review_manual",

              paymentType: hasSetupFee ? "setup_fee" : "subscription_first_payment",

              paymentMethod: paymentMethodId || "credit_card",

              paymentDate: new Date(),

              payerEmail,

              rawResponse: paymentResult,

            });

            console.log("[MP Subscription] Pagamento pendente registrado no histórico");

          } catch (historyError) {

            console.error("[MP Subscription] Erro ao registrar histórico:", historyError);

          }

          

          // Atualizar assinatura local como "pending_payment"

          await storage.updateSubscription(subscriptionId, {

            status: "pending_payment",

            mpStatus: "in_process",

            payerEmail,

            paymentMethod: paymentMethodId || "credit_card",

          });

          

          // Retornar status pendente - NÃO ativar a assinatura!

          return res.json({

            status: "in_process",

            message: "? Pagamento em análise. Você receberá uma confirmação em até 2 dias úteis por e-mail. Sua assinatura será ativada automaticamente após a aprovação.",

            mpPaymentId: paymentResult.id,

            statusDetail: paymentResult.status_detail,

          });

        }

        

        // CASO 2: PAGAMENTO REJEITADO - Retornar erro

        if (paymentResult.status !== "approved") {

          // Pagamento falhou

          const errorMessages: Record<string, string> = {

            "cc_rejected_bad_filled_card_number": "Número do cartão inválido.",

            "cc_rejected_bad_filled_date": "Data de validade inválida.",

            "cc_rejected_bad_filled_security_code": "Código de segurança (CVV) inválido.",

            "cc_rejected_insufficient_amount": "Saldo insuficiente no cartão.",

            "cc_rejected_high_risk": "Pagamento recusado por segurança.",

            "cc_rejected_call_for_authorize": "Ligue para sua operadora para autorizar.",

            "cc_rejected_card_disabled": "Cartão desativado. Use outro cartão.",

            "cc_rejected_other_reason": "Pagamento não aprovado. Tente outro cartão.",

            "invalid_users": "?? Erro: Usando cartão de teste em modo produção.",

          };

          

          const statusDetail = paymentResult.status_detail || "";

          let errorMessage = errorMessages[statusDetail] || paymentResult.message || "Pagamento não aprovado. Tente outro cartão.";

          

          console.log("[MP Subscription] ? Pagamento rejeitado:", paymentResult.status, statusDetail);

          

          return res.json({

            status: "rejected",

            message: errorMessage,

            errorCode: statusDetail,

          });

        }

        

        // CASO 3: PAGAMENTO APROVADO - Continuar com criação da assinatura

        console.log("[MP Subscription] ? Pagamento imediato APROVADO! ID:", paymentResult.id);

        

        try {

          await storage.createPaymentHistory({

            subscriptionId,

            userId,

            mpPaymentId: paymentResult.id.toString(),

            amount: primeiraCobrancaValor.toString(),

            status: paymentResult.status,

            statusDetail: paymentResult.status_detail || "accredited",

            paymentType: hasSetupFee ? "setup_fee" : "subscription_first_payment",

            paymentMethod: paymentMethodId || "credit_card",

            paymentDate: new Date(),

            payerEmail,

            rawResponse: paymentResult,

          });

          console.log("[MP Subscription] Pagamento registrado no histórico");

        } catch (historyError) {

          console.error("[MP Subscription] Erro ao registrar histórico:", historyError);

        }

        

        // -------------------------------------------------------------------

        // ETAPA 2: CRIAR ASSINATURA PENDENTE via /preapproval (sem token)

        // Para renovação manual no próximo mês - usuário receberá link

        // -------------------------------------------------------------------

        console.log("[MP Subscription] Etapa 2: Criando assinatura pendente para renovação futura");

        

        const nextMonthStartDate = new Date();

        nextMonthStartDate.setMonth(nextMonthStartDate.getMonth() + 1);

        const currentDay = new Date().getDate();

        const nextMonthLastDay = new Date(nextMonthStartDate.getFullYear(), nextMonthStartDate.getMonth() + 1, 0).getDate();

        if (currentDay > nextMonthLastDay) {

          nextMonthStartDate.setDate(nextMonthLastDay);

        }

        

        const endDate = new Date();

        endDate.setFullYear(endDate.getFullYear() + 5);

        

        // Criar assinatura PENDENTE (sem token, usuário completará depois)

        const subscriptionData = {

          reason: `${plan.nome} - AgenteZap (Renovação)`,

          external_reference: `sub_${subscriptionId}_renewal`,

          payer_email: payerEmail,

          auto_recurring: {

            frequency: frequency,

            frequency_type: frequency_type,

            transaction_amount: valorMensal,

            currency_id: "BRL",

            start_date: nextMonthStartDate.toISOString(),

            end_date: endDate.toISOString(),

          },

          back_url: `${baseUrl}/dashboard`,

        };

        

        const subscriptionResponse = await fetch("https://api.mercadopago.com/preapproval", {

          method: "POST",

          headers: {

            "Content-Type": "application/json",

            "Authorization": `Bearer ${accessToken}`,

            "X-Idempotency-Key": `preapproval_single_${subscriptionId}_${Date.now()}`,

          },

          body: JSON.stringify(subscriptionData),

        });

        

        const subscriptionResult = await subscriptionResponse.json();

        console.log("[MP Subscription] Subscription result:", JSON.stringify(subscriptionResult, null, 2));

        

        // Calcular data de fim do período atual

        const dataFim = new Date();

        if (frequency_type === "months") {

          dataFim.setMonth(dataFim.getMonth() + frequency);

        } else if (frequency_type === "years") {

          dataFim.setFullYear(dataFim.getFullYear() + frequency);

        } else {

          dataFim.setDate(dataFim.getDate() + frequenciaDias);

        }

        

        // Atualizar assinatura local como ATIVA (pagamento foi feito!)

        await storage.updateSubscription(subscriptionId, {

          status: "active",

          dataInicio: new Date(),

          dataFim,

          mpSubscriptionId: subscriptionResult.id || null,

          mpStatus: subscriptionResult.status || "payment_completed",

          mpInitPoint: subscriptionResult.init_point || null,

          payerEmail,

          paymentMethod: paymentMethodId || "credit_card",

          nextPaymentDate: nextMonthStartDate,

        });

        

        console.log("[MP Subscription] ? SUCESSO - Token Único!");

        console.log("[MP Subscription] - Pagamento imediato: R$", primeiraCobrancaValor);

        console.log("[MP Subscription] - MP Payment ID:", paymentResult.id);

        console.log("[MP Subscription] - Próxima cobrança:", nextMonthStartDate.toISOString());

        

        // Mensagem de sucesso adaptada

        const renewalNote = subscriptionResult.init_point 

          ? " Você receberá um lembrete antes da renovação."

          : "";

        

        return res.json({

          status: "approved",

          message: `?? Pagamento de R$ ${primeiraCobrancaValor.toFixed(2).replace(".", ",")} aprovado! Assinatura ativada.${renewalNote}`,

          mpPaymentId: paymentResult.id,

          subscriptionId: subscriptionResult.id || null,

          mpStatus: "active",

          nextPaymentDate: nextMonthStartDate.toISOString(),

        });

      }

      

      // -------------------------------------------------------------------------------

      // MODO 3: SEM TOKEN - Criar assinatura pendente com init_point

      // -------------------------------------------------------------------------------

      console.log("[MP Subscription] --- MODO SEM TOKEN ---");

      console.log("[MP Subscription] Criando assinatura pendente com init_point");

      

      const startDate = new Date();

      const endDate = new Date();

      endDate.setFullYear(endDate.getFullYear() + 5);

      

      const subscriptionData = {

        reason: `${plan.nome} - AgenteZap`,

        external_reference: `sub_${subscriptionId}`,

        payer_email: payerEmail,

        status: "pending",

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

      

      const mpResponse = await fetch("https://api.mercadopago.com/preapproval", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `preapproval_${subscriptionId}_${Date.now()}`,

        },

        body: JSON.stringify(subscriptionData),

      });

      

      const mpResult = await mpResponse.json();

      console.log("[MP Subscription] Preapproval result:", JSON.stringify(mpResult, null, 2));

      

      if (mpResult.id && mpResult.init_point) {

        const dataFim = new Date();

        dataFim.setMonth(dataFim.getMonth() + frequency);

        

        await storage.updateSubscription(subscriptionId, {

          status: "pending",

          dataInicio: new Date(),

          dataFim,

          mpSubscriptionId: mpResult.id,

          mpStatus: mpResult.status,

          payerEmail,

        });

        

        return res.json({

          status: "pending",

          message: "Clique no link para completar o pagamento.",

          subscriptionId: mpResult.id,

          initPoint: mpResult.init_point,

          mpStatus: mpResult.status,

        });

      }

      

      return res.json({

        status: "error",

        message: mpResult.message || "Erro ao criar assinatura.",

      });

    } catch (error: any) {

      console.error("[MP Subscription] Error:", error);

      res.status(500).json({ 

        status: "error",

        message: error.message || "Erro ao criar assinatura" 

      });

    }

  });



  // -------------------------------------------------------------------------------

  // ASSINATURA COM PIX - Endpoint para criar pagamento PIX + assinatura

  // Lógica PRÉ-PAGO: Cobra o primeiro PIX imediatamente, 

  // depois cria assinatura com boleto/cartão para cobranças futuras

  // -------------------------------------------------------------------------------

  app.post("/api/subscriptions/create-pix-subscription", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { subscriptionId, payerEmail } = req.body;

      

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

      const hasSetupFee = valorPrimeiraCobranca > 0 && valorPrimeiraCobranca !== valorMensal;

      const pixAmount = hasSetupFee ? valorPrimeiraCobranca : valorMensal;

      

      // ===== VERIFICAR SE PIX MANUAL ESTÁ ATIVADO =====
      const pixManualConfig = await storage.getSystemConfig('pix_manual_enabled');
      const pixManualEnabled = pixManualConfig?.valor === 'true' || pixManualConfig?.valor === true;
      
      if (pixManualEnabled) {
        console.log("[PIX MANUAL] Gerando QR Code PIX manual...");
        
        // Usar serviço de PIX manual (chave PIX configurada no admin)
        const { pixCode, pixQrCode } = await generatePixQRCode({
          planNome: plan.nome,
          valor: pixAmount,
          subscriptionId: subscriptionId,
        });
        
        // Atualizar assinatura com status de aguardando PIX manual
        await storage.updateSubscription(subscriptionId, {
          status: "pending_pix",
          payerEmail,
          paymentMethod: "pix_manual",
        });
        
        console.log("[PIX MANUAL] QR Code gerado com sucesso!");
        
        return res.json({
          status: "pending",
          message: "PIX gerado! Escaneie o QR Code ou copie o código para pagar.",
          paymentId: `manual_${subscriptionId}`,
          qrCode: pixCode, // Código Pix Copia e Cola
          qrCodeBase64: pixQrCode, // Imagem QR Code (data URL)
          expirationDate: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          amount: pixAmount,
          isManualPix: true,
        });
      }
      
      // ===== PIX VIA MERCADOPAGO (modo padrão) =====
      // Get MP credentials

      const configMap = await storage.getSystemConfigs([

        "mercadopago_access_token"

      ]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ 

          status: "error",

          message: "Mercado Pago não configurado" 

        });

      }

      

      console.log("[MP PIX] Creating PIX payment:", {

        subscriptionId,

        planName: plan.nome,

        pixAmount,

        hasSetupFee,

      });

      

      // -------------------------------------------------------------------

      // CRIAR PAGAMENTO PIX VIA API /v1/payments

      // Retorna QR Code e código Pix Copia e Cola

      // -------------------------------------------------------------------

      

      const pixPaymentData = {

        transaction_amount: pixAmount,

        payment_method_id: "pix",

        description: hasSetupFee 

          ? `Taxa de implementação - ${plan.nome} - AgenteZap`

          : `Primeira mensalidade - ${plan.nome} - AgenteZap`,

        payer: {

          email: payerEmail,

        },

        external_reference: `pix_${subscriptionId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        // PIX expira em 30 minutos

        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

      };

      

      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `pix_${subscriptionId}_${Date.now()}`,

        },

        body: JSON.stringify(pixPaymentData),

      });

      

      const pixResult = await pixResponse.json();

      

      console.log("[MP PIX] Payment result:", {

        status: pixResult.status,

        statusDetail: pixResult.status_detail,

        id: pixResult.id,

        hasQrCode: !!pixResult.point_of_interaction?.transaction_data?.qr_code,

      });

      

      if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {

        const transactionData = pixResult.point_of_interaction.transaction_data;

        

        // Atualizar assinatura com o pagamento PIX pendente

        await storage.updateSubscription(subscriptionId, {

          status: "pending_pix",

          mpPixPaymentId: pixResult.id?.toString(),

          payerEmail,

        });

        

        return res.json({

          status: "pending",

          message: "PIX gerado com sucesso! Escaneie o QR Code ou copie o código.",

          paymentId: pixResult.id,

          qrCode: transactionData.qr_code, // Código Pix Copia e Cola

          qrCodeBase64: transactionData.qr_code_base64, // Imagem QR Code

          ticketUrl: transactionData.ticket_url, // URL alternativa

          expirationDate: pixResult.date_of_expiration,

          amount: pixAmount,

        });

      } else {

        // Erro ao criar PIX

        const errorMessage = pixResult.message || "Erro ao gerar PIX. Tente novamente.";

        console.error("[MP PIX] Error:", pixResult);

        

        return res.json({

          status: "error",

          message: errorMessage,

        });

      }

      

    } catch (error: any) {

      console.error("[MP PIX] Error:", error);

      res.status(500).json({ 

        status: "error",

        message: error.message || "Erro ao criar pagamento PIX" 

      });

    }

  });



  // -------------------------------------------------------------------------------

  // VERIFICAR STATUS DO PAGAMENTO PIX

  // Usado pelo frontend para fazer polling e verificar se o PIX foi pago

  // -------------------------------------------------------------------------------

  app.get("/api/subscriptions/check-pix-status/:paymentId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { paymentId } = req.params;

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs([

        "mercadopago_access_token"

      ]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ 

          status: "error",

          message: "Mercado Pago não configurado" 

        });

      }

      

      // Consultar status do pagamento

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {

        headers: {

          "Authorization": `Bearer ${accessToken}`,

        },

      });

      

      const payment = await response.json();

      

      console.log("[MP PIX Check] Payment status:", {

        id: paymentId,

        status: payment.status,

        statusDetail: payment.status_detail,

      });

      

      if (payment.status === "approved") {

        // PIX foi pago! Ativar a assinatura

        const externalRef = payment.external_reference || "";

        const subscriptionIdMatch = externalRef.match(/pix_([^_]+)/);

        const subscriptionId = subscriptionIdMatch ? subscriptionIdMatch[1] : null;

        

        if (subscriptionId) {

          const subscription = await storage.getSubscription(subscriptionId) as any;

          

          if (subscription && subscription.userId === userId) {

            // Get plan para calcular próxima cobrança

            const plan = await storage.getPlan(subscription.planId) as any;

            const frequenciaDias = plan?.frequenciaDias || 30;

            

            // Calcular data fim do período

            const dataFim = new Date();

            dataFim.setDate(dataFim.getDate() + frequenciaDias);

            

            // Próximo pagamento

            const nextPaymentDate = new Date();

            nextPaymentDate.setDate(nextPaymentDate.getDate() + frequenciaDias);

            

            // Atualizar assinatura para ativa

            await storage.updateSubscription(subscriptionId, {

              status: "active",

              dataInicio: new Date(),

              dataFim,

              mpStatus: "authorized",

              nextPaymentDate,

            });

            

            // Registrar pagamento no histórico

            try {

              await storage.createPaymentHistory({

                subscriptionId,

                userId,

                mpPaymentId: paymentId,

                amount: payment.transaction_amount?.toString(),

                netAmount: payment.transaction_details?.net_received_amount?.toString(),

                feeAmount: payment.fee_details?.[0]?.amount?.toString(),

                status: "approved",

                statusDetail: payment.status_detail || "accredited",

                paymentType: "pix_first_payment",

                paymentMethod: "pix",

                paymentDate: new Date(),

                payerEmail: payment.payer?.email,

                rawResponse: payment,

              });

            } catch (historyError) {

              console.error("[MP PIX] Error recording history:", historyError);

            }

          }

        }

        

        return res.json({

          status: "approved",

          message: "?? Pagamento PIX confirmado! Assinatura ativada com sucesso!",

        });

      } else if (payment.status === "rejected" || payment.status === "cancelled") {

        return res.json({

          status: payment.status,

          message: "Pagamento não aprovado ou cancelado.",

        });

      } else {

        // Ainda pendente

        return res.json({

          status: "pending",

          message: "Aguardando pagamento PIX...",

        });

      }

      

    } catch (error: any) {

      console.error("[MP PIX Check] Error:", error);

      res.status(500).json({ 

        status: "error",

        message: error.message || "Erro ao verificar pagamento" 

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

        // -------------------------------------------------------------------

        // PROCESSAR PAGAMENTO - PIX e Cartão de Crédito (in_process ? approved)

        // -------------------------------------------------------------------

        console.log("[MP Webhook] Payment notification:", data);

        

        if (data?.id) {

          try {

            // Get MP credentials

            const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

            const accessToken = configMap.get("mercadopago_access_token");

            

            if (accessToken) {

              // Consultar detalhes do pagamento

              const paymentResponse = await fetch(`https://api.mercadopago.com/v1/payments/${data.id}`, {

                headers: { "Authorization": `Bearer ${accessToken}` },

              });

              

              const payment = await paymentResponse.json();

              console.log("[MP Webhook] Payment details:", {

                id: payment.id,

                status: payment.status,

                statusDetail: payment.status_detail,

                paymentMethodId: payment.payment_method_id,

                externalRef: payment.external_reference,

              });

              

              // -------------------------------------------------------------------

              // CASO 1: PAGAMENTO APROVADO (pode ser PIX ou Cartão que estava in_process)

              // -------------------------------------------------------------------

              if (payment.status === "approved") {

                const externalRef = payment.external_reference || "";



                // ?? NEW: Reseller Granular Payments

                if (externalRef && externalRef.startsWith("reseller_granular_")) {

                   const { resellerService } = await import("./resellerService");

                   await resellerService.processGranularPaymentWebhook(payment);

                   console.log("[MP Webhook] Granular payment processed:", payment.id);

                   return res.json({ message: "Granular payment processed" });

                }



                // ?? FIX: Reseller Client Creation Payments (PIX aprovado para criação de cliente)

                if (externalRef && externalRef.startsWith("reseller_client_")) {

                   const paymentIdFromRef = externalRef.replace("reseller_client_", "");

                   console.log("[MP Webhook] ?? Reseller client creation payment detected:", {

                     mpPaymentId: payment.id,

                     paymentIdFromRef,

                     externalRef

                   });

                   

                   try {

                     const { resellerService } = await import("./resellerService");

                     

                     // Verificar se já foi processado (evitar duplicação)

                     const existingPayment = await storage.getResellerPayment(paymentIdFromRef);

                     if (existingPayment && existingPayment.status === "approved") {

                       console.log("[MP Webhook] ?? Pagamento já processado anteriormente:", paymentIdFromRef);

                       return res.json({ message: "Payment already processed" });

                     }

                     

                     // Processar criação do cliente

                     const result = await resellerService.confirmPixPayment(paymentIdFromRef);

                     

                     if (result.success) {

                       console.log("[MP Webhook] ? Cliente de revenda criado com sucesso:", {

                         clientId: result.clientId,

                         userId: result.userId,

                         paymentId: paymentIdFromRef

                       });

                     } else {

                       console.error("[MP Webhook] ? Erro ao criar cliente de revenda:", result.error);

                     }

                     

                     return res.json({ 

                       message: result.success ? "Reseller client created" : "Error creating client",

                       success: result.success,

                       error: result.error

                     });

                   } catch (resellerError: any) {

                     console.error("[MP Webhook] ? Erro crítico ao processar cliente de revenda:", resellerError);

                     // Não retornar erro 500 para evitar retry infinito

                     return res.json({ message: "Error processing reseller client", error: resellerError.message });

                   }

                }



                let subscriptionId: string | null = null;

                

                // Extrair ID da assinatura do external_reference

                // Formato PIX: pix_UUID

                // Formato Cartão: sub_UUID_first ou sub_UUID_single ou sub_UUID_recurring

                const pixMatch = externalRef.match(/pix_([^_]+)/);

                const cardMatch = externalRef.match(/sub_([^_]+)_/);

                subscriptionId = pixMatch ? pixMatch[1] : (cardMatch ? cardMatch[1] : null);

                

                if (subscriptionId) {

                  const subscription = await storage.getSubscription(subscriptionId) as any;

                  

                  if (subscription) {

                    // Verificar se a assinatura estava pendente de pagamento

                    const wasInProcess = subscription.status === "pending_payment" || subscription.mpStatus === "in_process";

                    

                    if (wasInProcess || subscription.status === "pending_pix") {

                      console.log("[MP Webhook] ? Ativando assinatura após pagamento aprovado:", subscriptionId);

                      

                      // Get plan para calcular próxima cobrança

                      const plan = await storage.getPlan(subscription.planId) as any;

                      const frequenciaDias = plan?.frequenciaDias || 30;

                      

                      // Calcular data fim do período

                      const dataFim = new Date();

                      dataFim.setDate(dataFim.getDate() + frequenciaDias);

                      

                      // Próximo pagamento

                      const nextPaymentDate = new Date();

                      nextPaymentDate.setDate(nextPaymentDate.getDate() + frequenciaDias);

                      

                      // Atualizar assinatura para ativa

                      await storage.updateSubscription(subscriptionId, {

                        status: "active",

                        dataInicio: subscription.dataInicio || new Date(),

                        dataFim,

                        mpStatus: "authorized",

                        nextPaymentDate,

                      });

                      

                      // Atualizar histórico de pagamento existente ou criar novo

                      const existingHistory = await storage.getPaymentHistoryByMpPaymentId(payment.id?.toString());

                      

                      if (existingHistory) {

                        // Atualizar status do pagamento existente

                        await storage.updatePaymentHistory(existingHistory.id, {

                          status: "approved",

                          statusDetail: payment.status_detail || "accredited",

                          rawResponse: payment,

                        });

                        console.log("[MP Webhook] Payment history UPDATED to approved:", payment.id);

                      } else {

                        // Registrar novo pagamento no histórico

                        const isPix = payment.payment_method_id === "pix";

                        await storage.createPaymentHistory({

                          subscriptionId,

                          userId: subscription.userId,

                          mpPaymentId: payment.id?.toString(),

                          amount: payment.transaction_amount?.toString(),

                          netAmount: payment.transaction_details?.net_received_amount?.toString(),

                          feeAmount: payment.fee_details?.[0]?.amount?.toString(),

                          status: "approved",

                          statusDetail: payment.status_detail || "accredited",

                          paymentType: isPix ? "pix_first_payment" : "subscription_first_payment",

                          paymentMethod: payment.payment_method_id || "credit_card",

                          paymentDate: new Date(),

                          payerEmail: payment.payer?.email || subscription.payerEmail,

                          rawResponse: payment,

                        });

                        console.log("[MP Webhook] Payment history CREATED:", payment.id);

                      }

                      

                      console.log("[MP Webhook] ? Assinatura ATIVADA via webhook:", subscriptionId);

                    }

                  }

                }

              }

              

              // -------------------------------------------------------------------

              // CASO 2: PAGAMENTO REJEITADO (in_process ? rejected)

              // -------------------------------------------------------------------

              if (payment.status === "rejected" || payment.status === "cancelled") {

                const externalRef = payment.external_reference || "";

                const cardMatch = externalRef.match(/sub_([^_]+)_/);

                const subscriptionId = cardMatch ? cardMatch[1] : null;

                

                if (subscriptionId) {

                  const subscription = await storage.getSubscription(subscriptionId) as any;

                  

                  if (subscription && (subscription.status === "pending_payment" || subscription.mpStatus === "in_process")) {

                    console.log("[MP Webhook] ? Pagamento rejeitado, cancelando assinatura:", subscriptionId);

                    

                    await storage.updateSubscription(subscriptionId, {

                      status: "cancelled",

                      mpStatus: payment.status,

                    });

                    

                    // Atualizar histórico de pagamento

                    const existingHistory = await storage.getPaymentHistoryByMpPaymentId(payment.id?.toString());

                    if (existingHistory) {

                      await storage.updatePaymentHistory(existingHistory.id, {

                        status: payment.status,

                        statusDetail: payment.status_detail,

                        rawResponse: payment,

                      });

                    }

                    

                    console.log("[MP Webhook] ? Assinatura CANCELADA via webhook:", subscriptionId);

                  }

                }

              }

            }

          } catch (paymentError) {

            console.error("[MP Webhook] Error processing payment:", paymentError);

          }

        }

      }

      

      res.status(200).send("OK");

    } catch (error) {

      console.error("Error processing MP webhook:", error);

      res.status(500).send("Error");

    }

  });



  // ==================== PAYMENT HISTORY ROUTES ====================

  

  // Get payment history for current user

  app.get("/api/payment-history", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const history = await storage.getPaymentHistoryByUser(userId);

      res.json(history);

    } catch (error) {

      console.error("Error fetching payment history:", error);

      res.status(500).json({ message: "Erro ao buscar histórico de pagamentos" });

    }

  });



  // Get payment history for a specific subscription

  app.get("/api/payment-history/subscription/:subscriptionId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { subscriptionId } = req.params;

      

      // Verify user owns this subscription

      const subscription = await storage.getSubscription(subscriptionId) as any;

      if (!subscription || subscription.userId !== userId) {

        return res.status(403).json({ message: "Acesso negado" });

      }

      

      const history = await storage.getPaymentHistoryBySubscription(subscriptionId);

      res.json(history);

    } catch (error) {

      console.error("Error fetching subscription payment history:", error);

      res.status(500).json({ message: "Erro ao buscar histórico de pagamentos" });

    }

  });



  // Admin: Get all payment history

  app.get("/api/admin/payment-history", isAdmin, async (_req, res) => {

    try {

      const history = await storage.getAllPaymentHistory();

      res.json(history);

    } catch (error) {

      console.error("Error fetching all payment history:", error);

      res.status(500).json({ message: "Erro ao buscar histórico de pagamentos" });

    }

  });



  // Admin: Get all subscriptions with details

  app.get("/api/admin/subscriptions", isAdmin, async (_req, res) => {

    try {

      const subscriptions = await storage.getAllSubscriptions();

      

      // Enrich with payment history

      const enrichedSubscriptions = await Promise.all(

        subscriptions.map(async (sub: any) => {

          const payments = await storage.getPaymentHistoryBySubscription(sub.id);

          const lastPayment = payments[0] || null;

          const totalPaid = payments

            .filter((p: any) => p.status === "approved")

            .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);

          

          return {

            ...sub,

            paymentHistory: payments,

            lastPayment,

            totalPaid,

            paymentsCount: payments.length,

            approvedPaymentsCount: payments.filter((p: any) => p.status === "approved").length,

            failedPaymentsCount: payments.filter((p: any) => p.status === "rejected").length,

          };

        })

      );

      

      res.json(enrichedSubscriptions);

    } catch (error) {

      console.error("Error fetching admin subscriptions:", error);

      res.status(500).json({ message: "Erro ao buscar assinaturas" });

    }

  });



  // Admin: Get subscription stats

  app.get("/api/admin/subscription-stats", isAdmin, async (_req, res) => {

    try {

      const subscriptions = await storage.getAllSubscriptions();

      const allHistory = await storage.getAllPaymentHistory();

      

      const stats = {

        totalSubscriptions: subscriptions.length,

        activeSubscriptions: subscriptions.filter((s: any) => s.status === "active").length,

        pendingSubscriptions: subscriptions.filter((s: any) => s.status === "pending").length,

        cancelledSubscriptions: subscriptions.filter((s: any) => s.status === "cancelled").length,

        expiredSubscriptions: subscriptions.filter((s: any) => s.status === "expired").length,

        totalPayments: allHistory.length,

        approvedPayments: allHistory.filter((p: any) => p.status === "approved").length,

        rejectedPayments: allHistory.filter((p: any) => p.status === "rejected").length,

        pendingPayments: allHistory.filter((p: any) => p.status === "pending").length,

        totalRevenue: allHistory

          .filter((p: any) => p.status === "approved")

          .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0),

      };

      

      res.json(stats);

    } catch (error) {

      console.error("Error fetching subscription stats:", error);

      res.status(500).json({ message: "Erro ao buscar estatísticas" });

    }

  });



  // ==================== END PAYMENT HISTORY ROUTES ====================



  // ==================== ANNUAL DISCOUNT CONFIG ====================

  

  // GET - Obter configuração de desconto anual (público para assinantes)

  app.get("/api/system-config/annual-discount", isAuthenticated, async (req: any, res) => {

    try {

      const configs = await storage.getSystemConfigs([

        "annual_discount_percent",

        "annual_discount_enabled"

      ]);

      

      const percent = configs.has("annual_discount_percent") 

        ? parseFloat(configs.get("annual_discount_percent")!) 

        : 5;

      const enabled = configs.get("annual_discount_enabled") !== "false";

      

      res.json({ percent, enabled });

    } catch (error) {

      console.error("Error fetching annual discount config:", error);

      res.json({ percent: 5, enabled: true }); // Default values

    }

  });



  // POST - Atualizar configuração de desconto anual (admin only)

  app.post("/api/admin/annual-discount", isAdmin, async (req: any, res) => {

    try {

      const { percent, enabled } = req.body;

      

      if (typeof percent === "number" && percent >= 0 && percent <= 100) {

        await storage.updateSystemConfig("annual_discount_percent", percent.toString());

      }

      

      if (typeof enabled === "boolean") {

        await storage.updateSystemConfig("annual_discount_enabled", enabled.toString());

      }

      

      res.json({ success: true, message: "Desconto anual atualizado" });

    } catch (error) {

      console.error("Error updating annual discount:", error);

      res.status(500).json({ message: "Erro ao atualizar desconto anual" });

    }

  });



  // ==================== POLICY VIOLATIONS & SUSPENSION ROUTES ====================

  

  // GET - Verificar status de suspensão do usuário logado

  app.get("/api/user/suspension-status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const suspensionStatus = await storage.isUserSuspended(userId);

      

      if (suspensionStatus.suspended) {

        res.json({

          suspended: true,

          reason: suspensionStatus.data?.reason,

          type: suspensionStatus.data?.type,

          suspendedAt: suspensionStatus.data?.suspendedAt,

          refundedAt: suspensionStatus.data?.refundedAt,

          refundAmount: suspensionStatus.data?.refundAmount,

        });

      } else {

        res.json({ suspended: false });

      }

    } catch (error) {

      console.error("Error checking suspension status:", error);

      res.status(500).json({ message: "Erro ao verificar status de suspensão" });

    }

  });



  // GET - Buscar plano atribuído do usuário

  app.get("/api/user/assigned-plan", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const user = await storage.getUserById(userId);

      

      if (!user?.assignedPlanId) {

        return res.json(null);

      }

      

      const plan = await storage.getPlan(user.assignedPlanId);

      res.json(plan || null);

    } catch (error) {

      console.error("Error fetching assigned plan:", error);

      res.status(500).json({ message: "Erro ao buscar plano atribuído" });

    }

  });



  // GET - Admin: Listar usuários suspensos

  app.get("/api/admin/suspended-users", isAdmin, async (_req, res) => {

    try {

      const suspendedUsers = await storage.getSuspendedUsers();

      res.json(suspendedUsers);

    } catch (error) {

      console.error("Error fetching suspended users:", error);

      res.status(500).json({ message: "Erro ao buscar usuários suspensos" });

    }

  });



  // POST - Admin: Suspender usuário por violação de políticas

  app.post("/api/admin/users/:userId/suspend", isAdmin, async (req: any, res) => {

    try {

      const { userId } = req.params;

      const { violationType, reason, evidence, refundAmount } = req.body;

      

      if (!violationType || !reason) {

        return res.status(400).json({ message: "Tipo de violação e motivo são obrigatórios" });

      }



      // Verificar se usuário existe

      const user = await storage.getUser(userId);

      if (!user) {

        return res.status(404).json({ message: "Usuário não encontrado" });

      }



      // Verificar se já está suspenso

      const existingStatus = await storage.isUserSuspended(userId);

      if (existingStatus.suspended) {

        return res.status(400).json({ message: "Usuário já está suspenso" });

      }



      // 1. Desconectar WhatsApp automaticamente antes de suspender

      try {

        console.log(`?? [SUSPENSION] Desconectando WhatsApp do usuário ${user.email}...`);

        await disconnectWhatsApp(userId);

        console.log(`? [SUSPENSION] WhatsApp desconectado com sucesso`);

      } catch (disconnectError) {

        console.log(`?? [SUSPENSION] Não foi possível desconectar WhatsApp (pode não estar conectado):`, disconnectError);

        // Continua mesmo se o WhatsApp não estiver conectado

      }



      // 2. Suspender usuário

      await storage.suspendUser(

        userId,

        violationType,

        reason,

        req.session?.admin?.id,

        evidence || [],

        refundAmount

      );



      console.log(`?? [ADMIN] Usuário ${user.email} suspenso por ${violationType}: ${reason}`);



      res.json({ 

        success: true, 

        message: `Usuário ${user.email} suspenso com sucesso. WhatsApp desconectado.`,

        suspendedAt: new Date().toISOString()

      });

    } catch (error) {

      console.error("Error suspending user:", error);

      res.status(500).json({ message: "Erro ao suspender usuário" });

    }

  });



  // POST - Admin: Remover suspensão de usuário

  app.post("/api/admin/users/:userId/unsuspend", isAdmin, async (req: any, res) => {

    try {

      const { userId } = req.params;

      const { adminNote } = req.body;



      // Verificar se usuário existe

      const user = await storage.getUser(userId);

      if (!user) {

        return res.status(404).json({ message: "Usuário não encontrado" });

      }



      // Verificar se está suspenso

      const existingStatus = await storage.isUserSuspended(userId);

      if (!existingStatus.suspended) {

        return res.status(400).json({ message: "Usuário não está suspenso" });

      }



      // Remover suspensão

      await storage.unsuspendUser(userId, adminNote);



      console.log(`? [ADMIN] Suspensão removida do usuário ${user.email}`);



      res.json({ 

        success: true, 

        message: `Suspensão removida do usuário ${user.email}` 

      });

    } catch (error) {

      console.error("Error unsuspending user:", error);

      res.status(500).json({ message: "Erro ao remover suspensão" });

    }

  });



  // ==================== END POLICY VIOLATIONS ROUTES ====================



  // ==================== MY SUBSCRIPTION ROUTES (CLIENTE) ====================

  

  // Get current user's active subscription with full details

  // Também retorna info do revendedor se for cliente de revenda

  app.get("/api/my-subscription", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verificar se é cliente de revendedor

      const resellerClient = await storage.getResellerClientByUserId(userId);

      let resellerInfo = null;

      

      if (resellerClient) {

        const reseller = await storage.getReseller(resellerClient.resellerId);

        if (reseller) {

          resellerInfo = {

            isResellerClient: true,

            clientId: resellerClient.id,

            status: resellerClient.status,

            clientPrice: resellerClient.clientPrice || reseller.clientMonthlyPrice,

            nextPaymentDate: resellerClient.nextPaymentDate,

            billingDay: resellerClient.billingDay || 1,

            activatedAt: resellerClient.activatedAt,

            isFreeClient: resellerClient.isFreeClient,

            reseller: {

              companyName: reseller.companyName,

              logoUrl: reseller.logoUrl,

              primaryColor: reseller.primaryColor,

              accentColor: reseller.accentColor,

              supportEmail: reseller.supportEmail,

              supportPhone: reseller.supportPhone,

              welcomeMessage: reseller.welcomeMessage,

              pixKey: reseller.pixKey,

              pixKeyType: reseller.pixKeyType,

              pixHolderName: (reseller as any).pixHolderName,

              pixBankName: (reseller as any).pixBankName,

            },

          };

        }

      }

      

      // Get user's subscription (uses getUserSubscription which prefers active)

      const subscriptionWithPlan = await storage.getUserSubscription(userId) as any;

      

      if (!subscriptionWithPlan) {

        // Retornar resellerInfo mesmo sem subscription (cliente de revenda sem subscription tradicional)

        return res.json({ 

          subscription: null, 

          plan: null, 

          payments: [], 

          stats: { totalPaid: 0, totalPayments: 0, approvedPayments: 0, failedPayments: 0 },

          resellerInfo // IMPORTANTE: incluir resellerInfo para clientes de revenda

        });

      }

      

      const subscription = subscriptionWithPlan;

      const plan = subscriptionWithPlan.plan;

      

      // Get payment history - try both by subscription AND by user

      let payments = await storage.getPaymentHistoryBySubscription(subscription.id) || [];

      

      // Se não tem histórico na tabela payment_history, verificar tabela payments antiga

      if (payments.length === 0) {

        const oldPayment = await storage.getPaymentBySubscriptionId(subscription.id);

        

        // Se encontrou pagamentos na tabela antiga, considera como histórico

        if (oldPayment) {

          payments = [{

            id: oldPayment.id,

            subscriptionId: oldPayment.subscriptionId,

            userId: userId,

            amount: oldPayment.valor?.toString() || "0",

            status: oldPayment.status === "paid" ? "approved" : oldPayment.status,

            paymentMethod: "pix_manual",

            paymentDate: oldPayment.dataPagamento || oldPayment.createdAt,

            createdAt: oldPayment.createdAt,

          }];

        }

        

        // Se assinatura está ativa mas não tem nenhum registro de pagamento, 

        // criar um registro inicial para assinaturas ativadas manualmente

        if (payments.length === 0 && subscription.status === "active") {

          // Para clientes de revenda, usar o clientPrice. Para outros, usar coupon_price ou plan.valor

          const paymentAmount = resellerInfo?.clientPrice || subscription.couponPrice || plan?.valor || "0";

          

          const initialPayment = {

            id: "initial_" + subscription.id,

            subscriptionId: subscription.id,

            userId: userId,

            amount: paymentAmount.toString(),

            status: "approved",

            statusDetail: "manual_activation",

            paymentType: "initial_activation",

            paymentMethod: subscription.paymentMethod || "pix_manual",

            paymentDate: subscription.dataInicio,

            createdAt: subscription.createdAt || subscription.dataInicio,

          };

          payments = [initialPayment];

        }

      }

      

      // Calculate stats

      const totalPaid = payments

        .filter((p: any) => p.status === "approved")

        .reduce((sum: number, p: any) => sum + parseFloat(p.amount || "0"), 0);

        

      const daysRemaining = subscription?.dataFim 

        ? Math.ceil((new Date(subscription.dataFim).getTime() - Date.now()) / (1000 * 60 * 60 * 24))

        : 0;

      

      // Check if needs to pay (PIX pending or renewal due)

      const needsPayment = subscription?.status === "pending_pix" || 

        (subscription?.status === "active" && daysRemaining <= 5);

      

      // Buscar info do cartão se tiver assinatura MP

      let cardInfo = null;

      if (subscription.mpSubscriptionId) {

        try {

          const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

          const accessToken = configMap.get("mercadopago_access_token");

          if (accessToken) {

            const preapprovalResponse = await fetch(

              `https://api.mercadopago.com/preapproval/${subscription.mpSubscriptionId}`,

              { headers: { "Authorization": `Bearer ${accessToken}` } }

            );

            if (preapprovalResponse.ok) {

              const preapprovalData = await preapprovalResponse.json();

              cardInfo = {

                lastFourDigits: preapprovalData.summarized?.charged_payment?.last_four_digits,

                brand: preapprovalData.payment_method_id,

              };

            }

          }

        } catch (e) {

          console.log("Could not fetch card info:", e);

        }

      }

      

      // Detectar se é plano de revenda (pelo tipo do plano OU pela tabela reseller_clients)
      const isResellerPlan = plan?.tipo === 'revenda' || !!resellerInfo?.isResellerClient;

      if (isResellerPlan) {
        console.log(`[MY-SUBSCRIPTION] Plano revenda detectado! userId=${userId}, planTipo=${plan?.tipo}, resellerClient=${!!resellerInfo?.isResellerClient}, mpSubscriptionId original=${subscription.mpSubscriptionId}, forçando null`);
      }

      res.json({

        subscription: {

          ...subscription,

          daysRemaining: Math.max(0, daysRemaining),

          needsPayment,

          // Se não tem nextPaymentDate definido, usa dataFim

          nextPaymentDate: subscription.nextPaymentDate || subscription.dataFim,

          // Info do cartão

          cardLastFourDigits: cardInfo?.lastFourDigits || null,

          cardBrand: cardInfo?.brand || null,

          // Plano revenda NUNCA usa MercadoPago - forçar mpSubscriptionId null
          // para que a página mostre botão de PIX manual ao invés de "Cobrança Automática"
          ...(isResellerPlan ? { mpSubscriptionId: null } : {}),

        },

        plan,

        payments,

        stats: {

          totalPaid: totalPaid > 0 ? totalPaid : (subscription.status === "active" ? parseFloat(resellerInfo?.clientPrice || plan?.valor || "0") : 0),

          totalPayments: payments.length || (subscription.status === "active" ? 1 : 0),

          approvedPayments: payments.filter((p: any) => p.status === "approved").length || (subscription.status === "active" ? 1 : 0),

          failedPayments: payments.filter((p: any) => p.status === "rejected").length,

        },

        // Informações do revendedor (se for cliente de revenda)

        resellerInfo,

      });

    } catch (error) {

      console.error("Error fetching my subscription:", error);

      res.status(500).json({ message: "Erro ao buscar assinatura" });

    }

  });

  

  // Generate new PIX for renewal or pending payment

  app.post("/api/my-subscription/generate-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { subscriptionId } = req.body;

      

      if (!subscriptionId) {

        return res.status(400).json({ message: "ID da assinatura é obrigatório" });

      }

      

      // Verify ownership

      const subscription = await storage.getSubscription(subscriptionId) as any;

      if (!subscription || subscription.userId !== userId) {

        return res.status(403).json({ message: "Assinatura não encontrada" });

      }

      

      // Get plan

      const plan = await storage.getPlan(subscription.planId) as any;

      if (!plan) {

        return res.status(404).json({ message: "Plano não encontrado" });

      }

      

      // Calculate amount - properly handle Decimal/string from database

      const valorCoupon = subscription.couponPrice ? parseFloat(String(subscription.couponPrice)) : null;

      const valorPlano = parseFloat(String(plan.valor)) || 0;

      const valorMensal = valorCoupon || valorPlano;

      

      if (!valorMensal || isNaN(valorMensal)) {

        console.error("[PIX Generate] Valor inválido:", { couponPrice: subscription.couponPrice, planValor: plan.valor });

        return res.status(400).json({ message: "Valor da assinatura inválido" });

      }

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Get user email from database as fallback

      const user = await storage.getUser(userId);

      const payerEmail = subscription.payerEmail || user?.email || req.user?.claims?.email;

      

      if (!payerEmail) {

        return res.status(400).json({ message: "Email do pagador não encontrado" });

      }

      

      console.log("[PIX Generate] Email do pagador:", payerEmail, "Valor:", valorMensal);

      

      // Create PIX payment

      const pixPaymentData = {

        transaction_amount: valorMensal,

        payment_method_id: "pix",

        description: `Mensalidade - ${plan.nome} - AgenteZap`,

        payer: {

          email: payerEmail,

        },

        external_reference: `pix_${subscriptionId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

      };

      

      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `pix_renewal_${subscriptionId}_${Date.now()}`,

        },

        body: JSON.stringify(pixPaymentData),

      });

      

      const pixResult = await pixResponse.json();

      

      if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {

        const transactionData = pixResult.point_of_interaction.transaction_data;

        

        // Update subscription with pending PIX

        await storage.updateSubscription(subscriptionId, {

          mpPixPaymentId: pixResult.id?.toString(),

        });

        

        // Record pending payment in history

        await storage.createPaymentHistory({

          subscriptionId,

          userId,

          mpPaymentId: pixResult.id?.toString(),

          amount: valorMensal.toString(),

          status: "pending",

          statusDetail: "pending_pix",

          paymentType: subscription.status === "active" ? "pix_recurring" : "pix_first_payment",

          paymentMethod: "pix",

          dueDate: new Date(Date.now() + 30 * 60 * 1000),

          payerEmail: subscription.payerEmail,

          rawResponse: pixResult,

        });

        

        return res.json({

          status: "pending",

          message: "PIX gerado com sucesso!",

          paymentId: pixResult.id,

          qrCode: transactionData.qr_code,

          qrCodeBase64: transactionData.qr_code_base64,

          ticketUrl: transactionData.ticket_url,

          expirationDate: pixResult.date_of_expiration,

          amount: valorMensal,

        });

      } else {

        return res.json({

          status: "error",

          message: pixResult.message || "Erro ao gerar PIX",

        });

      }

    } catch (error: any) {

      console.error("Error generating renewal PIX:", error);

      res.status(500).json({ message: error.message || "Erro ao gerar PIX" });

    }

  });

  

  // Generate PIX for annual payment (12 months with discount)

  app.post("/api/my-subscription/generate-annual-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { subscriptionId, discountPercent = 5 } = req.body;

      

      if (!subscriptionId) {

        return res.status(400).json({ message: "ID da assinatura é obrigatório" });

      }

      

      // Verify ownership

      const subscription = await storage.getSubscription(subscriptionId) as any;

      if (!subscription || subscription.userId !== userId) {

        return res.status(403).json({ message: "Assinatura não encontrada" });

      }

      

      // Get plan

      const plan = await storage.getPlan(subscription.planId) as any;

      if (!plan) {

        return res.status(404).json({ message: "Plano não encontrado" });

      }

      

      // Calculate annual amount with discount  

      const valorCoupon = subscription.couponPrice ? parseFloat(String(subscription.couponPrice)) : null;

      const valorPlano = parseFloat(String(plan.valor)) || 0;

      const valorMensal = valorCoupon || valorPlano;

      

      console.log("[ANNUAL PIX] Valores calc:", { valorCoupon, valorPlano, valorMensal, planValor: plan.valor, couponPrice: subscription.couponPrice });

      

      if (!valorMensal || isNaN(valorMensal) || valorMensal <= 0) {

        return res.status(400).json({ message: "Valor do plano inválido" });

      }

      

      const valorAnual = valorMensal * 12;

      const desconto = valorAnual * (discountPercent / 100);

      const valorFinal = Math.round((valorAnual - desconto) * 100) / 100; // Arredondar para 2 casas decimais

      

      console.log("[ANNUAL PIX] Valores finais:", { valorAnual, desconto, valorFinal });

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Get user email from database

      const user = await storage.getUser(userId);

      const payerEmail = subscription.payerEmail || user?.email || req.user?.claims?.email;

      

      if (!payerEmail) {

        return res.status(400).json({ message: "Email do pagador não encontrado" });

      }

      

      // Create PIX payment for annual amount

      const pixPaymentData = {

        transaction_amount: valorFinal,

        payment_method_id: "pix",

        description: `Plano Anual (12 meses) - ${plan.nome} - AgenteZap - ${discountPercent}% desconto`,

        payer: {

          email: payerEmail,

        },

        external_reference: `pix_annual_${subscriptionId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

      };

      

      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `pix_annual_${subscriptionId}_${Date.now()}`,

        },

        body: JSON.stringify(pixPaymentData),

      });

      

      const pixResult = await pixResponse.json();

      

      if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {

        const transactionData = pixResult.point_of_interaction.transaction_data;

        

        // Record pending payment in history

        await storage.createPaymentHistory({

          subscriptionId,

          userId,

          mpPaymentId: pixResult.id?.toString(),

          amount: valorFinal.toString(),

          status: "pending",

          statusDetail: "pending_annual_pix",

          paymentType: "annual_pix",

          paymentMethod: "pix",

          dueDate: new Date(Date.now() + 30 * 60 * 1000),

          payerEmail: subscription.payerEmail,

          rawResponse: { ...pixResult, discountPercent, originalAmount: valorAnual },

        });

        

        return res.json({

          status: "pending",

          message: "PIX anual gerado com sucesso!",

          paymentId: pixResult.id,

          qrCode: transactionData.qr_code,

          qrCodeBase64: transactionData.qr_code_base64,

          ticketUrl: transactionData.ticket_url,

          expirationDate: pixResult.date_of_expiration,

          amount: valorFinal,

          discountPercent,

          originalAmount: valorAnual,

          savings: desconto,

        });

      } else {

        return res.json({

          status: "error",

          message: pixResult.message || "Erro ao gerar PIX anual",

        });

      }

    } catch (error: any) {

      console.error("Error generating annual PIX:", error);

      res.status(500).json({ message: error.message || "Erro ao gerar PIX anual" });

    }

  });

  

  // Charge annual payment on existing card

  app.post("/api/my-subscription/charge-annual-card", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { subscriptionId, discountPercent = 5 } = req.body;

      

      if (!subscriptionId) {

        return res.status(400).json({ message: "ID da assinatura é obrigatório" });

      }

      

      // Verify ownership

      const subscription = await storage.getSubscription(subscriptionId) as any;

      if (!subscription || subscription.userId !== userId) {

        return res.status(403).json({ message: "Assinatura não encontrada" });

      }

      

      // Verify has MP subscription (card registered)

      if (!subscription.mpSubscriptionId) {

        return res.status(400).json({ message: "Nenhum cartão cadastrado. Use PIX para pagamento anual." });

      }

      

      // Get plan

      const plan = await storage.getPlan(subscription.planId) as any;

      if (!plan) {

        return res.status(404).json({ message: "Plano não encontrado" });

      }

      

      // Calculate annual amount with discount

      const valorMensal = subscription.couponPrice 

        ? parseFloat(subscription.couponPrice) 

        : parseFloat(plan.valor);

      const valorAnual = valorMensal * 12;

      const desconto = valorAnual * (discountPercent / 100);

      const valorFinal = valorAnual - desconto;

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Get the preapproval (subscription) details to find the card

      const preapprovalResponse = await fetch(

        `https://api.mercadopago.com/preapproval/${subscription.mpSubscriptionId}`,

        {

          headers: {

            "Authorization": `Bearer ${accessToken}`,

          },

        }

      );

      

      if (!preapprovalResponse.ok) {

        return res.status(400).json({ message: "Não foi possível recuperar dados do cartão cadastrado" });

      }

      

      const preapprovalData = await preapprovalResponse.json();

      

      // Create a payment using the preapproval's card info

      // Note: This creates a new one-time payment charged to the saved card

      const paymentData = {

        transaction_amount: valorFinal,

        description: `Plano Anual (12 meses) - ${plan.nome} - AgenteZap - ${discountPercent}% desconto`,

        payer: {

          email: subscription.payerEmail || preapprovalData.payer_email || req.user?.email,

        },

        external_reference: `annual_card_${subscriptionId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        token: preapprovalData.card_token_id, // Use saved card token if available

      };

      

      // For MercadoPago, we need to use the card_id from the preapproval

      // This is a simplified approach - real implementation may vary

      const paymentResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `annual_card_${subscriptionId}_${Date.now()}`,

        },

        body: JSON.stringify(paymentData),

      });

      

      const paymentResult = await paymentResponse.json();

      

      if (paymentResult.status === "approved") {

        // Update subscription to extend for 12 months

        const newEndDate = new Date();

        newEndDate.setFullYear(newEndDate.getFullYear() + 1);

        

        await storage.updateSubscription(subscriptionId, {

          dataFim: newEndDate,

          nextPaymentDate: newEndDate,

        });

        

        // Record payment in history

        await storage.createPaymentHistory({

          subscriptionId,

          userId,

          mpPaymentId: paymentResult.id?.toString(),

          amount: valorFinal.toString(),

          status: "approved",

          statusDetail: "annual_card_payment",

          paymentType: "annual_card",

          paymentMethod: paymentResult.payment_method_id || "credit_card",

          paymentDate: new Date(),

          payerEmail: subscription.payerEmail,

          cardLastFourDigits: paymentResult.card?.last_four_digits,

          cardBrand: paymentResult.payment_method_id,

          rawResponse: { ...paymentResult, discountPercent, originalAmount: valorAnual },

        });

        

        return res.json({

          status: "approved",

          message: `Pagamento anual de ${(valorFinal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} cobrado com sucesso! Sua assinatura foi estendida por 12 meses.`,

          paymentId: paymentResult.id,

          amount: valorFinal,

          discountPercent,

          savings: desconto,

          newEndDate,

        });

      } else {

        // Record failed payment

        await storage.createPaymentHistory({

          subscriptionId,

          userId,

          mpPaymentId: paymentResult.id?.toString(),

          amount: valorFinal.toString(),

          status: paymentResult.status || "rejected",

          statusDetail: paymentResult.status_detail || "annual_card_failed",

          paymentType: "annual_card",

          paymentMethod: "credit_card",

          payerEmail: subscription.payerEmail,

          rawResponse: paymentResult,

        });

        

        return res.json({

          status: "error",

          message: paymentResult.status_detail || "Pagamento recusado. Tente novamente ou use PIX.",

        });

      }

    } catch (error: any) {

      console.error("Error charging annual card:", error);

      res.status(500).json({ message: error.message || "Erro ao processar pagamento" });

    }

  });

  

  // ==================== END MY SUBSCRIPTION ROUTES ====================



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



  // Test Groq API key

  app.post("/api/admin/test-groq", isAdmin, async (_req, res) => {

    try {

      console.log("[Test Groq] Starting test...");

      

      // Buscar chave e modelo do banco

      const groqKeyConfig = await storage.getSystemConfig("groq_api_key");

      const groqModelConfig = await storage.getSystemConfig("groq_model");

      

      const apiKey = groqKeyConfig?.valor;

      const model = groqModelConfig?.valor || "openai/gpt-oss-20b";

      

      // Log informações sobre a chave (sem expor a chave completa)

      const keyPreview = apiKey ? `${apiKey.substring(0, 4)}...${apiKey.substring(apiKey.length - 4)}` : "null";

      console.log(`[Test Groq] Key resolved: ${keyPreview} (${apiKey?.length ?? 0} chars)`);

      console.log(`[Test Groq] Model: ${model}`);

      

      if (!apiKey) {

        console.log("[Test Groq] No valid key found");

        return res.json({ 

          success: false, 

          error: "Chave Groq não configurada",

          keyLength: 0

        });

      }

      

      console.log("[Test Groq] Making test request...");

      

      // Fazer chamada direta à API Groq

      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {

        method: "POST",

        headers: {

          "Authorization": `Bearer ${apiKey}`,

          "Content-Type": "application/json"

        },

        body: JSON.stringify({

          model: model,

          messages: [{ role: "user", content: "Say OK" }],

          max_tokens: 5

        })

      });

      

      const data = await response.json();

      

      if (!response.ok) {

        throw new Error(data.error?.message || `HTTP ${response.status}`);

      }

      

      console.log("[Test Groq] Response received:", data.choices?.[0]?.message?.content);

      

      if (data.choices && data.choices.length > 0) {

        res.json({ 

          success: true, 

          model: model,

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

      console.error("[Test Groq] Error:", error.message);

      

      // Extrair mensagem de erro útil

      let errorMessage = "Erro desconhecido";

      let suggestion = "";

      

      if (error.message?.includes("401")) {

        errorMessage = "Chave inválida ou expirada (401 Unauthorized)";

        suggestion = "Verifique se a chave está correta. Gere uma nova em console.groq.com";

      } else if (error.message?.includes("403")) {

        errorMessage = "Acesso negado (403 Forbidden)";

        suggestion = "Verifique se a chave tem permissões corretas";

      } else if (error.message?.includes("429")) {

        errorMessage = "Limite de requisições excedido (429 Too Many Requests)";

        suggestion = "Aguarde alguns minutos antes de tentar novamente";

      } else if (error.message?.includes("model_not_found") || error.message?.includes("does not exist")) {

        errorMessage = "Modelo não encontrado";

        suggestion = "O modelo selecionado pode ter sido removido. Tente outro modelo.";

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



  // Test OpenRouter API key

  app.post("/api/admin/test-openrouter", isAdmin, async (_req, res) => {

    try {

      console.log("[Test OpenRouter] Starting test...");

      

      // Buscar chave e modelo do banco

      const openrouterKeyConfig = await storage.getSystemConfig("openrouter_api_key");

      const openrouterModelConfig = await storage.getSystemConfig("openrouter_model");

      

      const apiKey = openrouterKeyConfig?.valor;

      const model = openrouterModelConfig?.valor || "meta-llama/llama-3.3-70b-instruct:free";

      

      // Log informações sobre a chave (sem expor a chave completa)

      const keyPreview = apiKey ? `${apiKey.substring(0, 10)}...${apiKey.substring(apiKey.length - 4)}` : "null";

      console.log(`[Test OpenRouter] Key resolved: ${keyPreview} (${apiKey?.length ?? 0} chars)`);

      console.log(`[Test OpenRouter] Model: ${model}`);

      

      if (!apiKey) {

        console.log("[Test OpenRouter] No valid key found");

        return res.json({ 

          success: false, 

          error: "Chave OpenRouter não configurada",

          keyLength: 0

        });

      }

      

      console.log("[Test OpenRouter] Making test request...");

      

      // Fazer chamada direta à API OpenRouter

      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {

        method: "POST",

        headers: {

          "Authorization": `Bearer ${apiKey}`,

          "Content-Type": "application/json",

          "HTTP-Referer": "https://agentezap.com",

          "X-Title": "AgenteZap"

        },

        body: JSON.stringify({

          model: model,

          messages: [{ role: "user", content: "Say OK" }],

          max_tokens: 5,

          provider: {

            order: ['chutes'],  // ?? FORÇAR APENAS Chutes ($0.02/M input, $0.10/M output - bf16)

            allow_fallbacks: false  // ?? NÃO permitir outros providers!

          }

        })

      });

      

      const data = await response.json();

      

      if (!response.ok) {

        throw new Error(data.error?.message || `HTTP ${response.status}`);

      }

      

      console.log("[Test OpenRouter] Response received:", data.choices?.[0]?.message?.content);

      

      if (data.choices && data.choices.length > 0) {

        res.json({ 

          success: true, 

          model: model,

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

      console.error("[Test OpenRouter] Error:", error.message);

      

      // Extrair mensagem de erro útil

      let errorMessage = "Erro desconhecido";

      let suggestion = "";

      

      if (error.message?.includes("401")) {

        errorMessage = "Chave inválida ou expirada (401 Unauthorized)";

        suggestion = "Verifique se a chave está correta. Gere uma nova em openrouter.ai/keys";

      } else if (error.message?.includes("403")) {

        errorMessage = "Acesso negado (403 Forbidden)";

        suggestion = "Verifique se a chave tem permissões corretas";

      } else if (error.message?.includes("429")) {

        errorMessage = "Limite de requisições excedido (429 Too Many Requests)";

        suggestion = "Aguarde alguns minutos antes de tentar novamente";

      } else if (error.message?.includes("model_not_found") || error.message?.includes("does not exist") || error.message?.includes("No endpoints found")) {

        errorMessage = "Modelo não encontrado ou não disponível";

        suggestion = "O modelo pode requerer configuração especial. Tente 'meta-llama/llama-3.3-70b-instruct:free'";

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

      

      // ??? MODO DESENVOLVIMENTO: Não sincronizar estado para não afetar produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true' || process.env.DISABLE_WHATSAPP_PROCESSING === 'true') {

        console.log(`?? [DEV MODE] Retornando estado do banco sem sincronizar (proteção de produção)`);

        return res.json({

          ...(connection || {}),

          isConnected: false,

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

        console.log(`?? [ADMIN WS] Sincronizando estado: banco=${connection.isConnected}, real=${isReallyConnected}`);

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

      // ??? MODO DESENVOLVIMENTO: Bloquear conexões para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando conexão admin WhatsApp (proteção de produção)`);

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

      // ??? MODO DESENVOLVIMENTO: Bloquear desconexões para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando desconexão admin WhatsApp (proteção de produção)`);

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

      

      // ?? Quando IA admin é reativada, verificar se há mensagens pendentes e responder

      try {

        const triggerResult = await triggerAdminAgentResponseForConversation(id);

        console.log(`?? [ADMIN RESUME] IA reativada para ${id}: ${triggerResult.reason}`);

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

        console.log(`??? [ADMIN] Histórico limpo para conversa ${id} (telefone: ${phone})`);



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

              console.log(`??? [ADMIN] Usuário ${user.id} deletado do Supabase Auth (history)`);

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

      

      console.log(`?? [ADMIN] Solicitação de RESET COMPLETO para ${phone}`);

      

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

        console.log(`??? [ADMIN] Usuário ${user.id} deletado do Supabase Auth (complete)`);

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



  // ========================================================================

  // ADMIN NOTIFICATIONS - Sistema de notificações automáticas

  // ========================================================================



  // Get notification config

  app.get("/api/admin/notifications/config", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const config = await storage.getAdminNotificationConfig?.(adminId);

      

      const defaultConfig = {

        paymentReminderEnabled: true,

        paymentReminderDaysBefore: [7, 3, 1],

        paymentReminderMessageTemplate: 'Olá {cliente_nome}! ??\n\nGostaríamos de lembrar que seu pagamento vence em {dias_restantes} dias.\n\n?? Vencimento: {data_vencimento}\n?? Valor: R$ {valor}\n\nQualquer dúvida estamos à disposição! ??',

        paymentReminderAiEnabled: true,

        paymentReminderAiPrompt: 'Reescreva esta mensagem de lembrete de pagamento de forma natural e personalizada. Mantenha o tom profissional mas amigável.',

        overdueReminderEnabled: true,

        overdueReminderDaysAfter: [1, 3, 7, 14],

        overdueReminderMessageTemplate: 'Olá {cliente_nome}! ??\n\nIdentificamos que seu pagamento está em atraso há {dias_atraso} dias.\n\n?? Venceu em: {data_vencimento}\n?? Valor: R$ {valor}\n\nPor favor, regularize sua situação. ??',

        overdueReminderAiEnabled: true,

        overdueReminderAiPrompt: 'Reescreva esta mensagem de cobrança de forma educada e empática. Mantenha o tom profissional.',

        periodicCheckinEnabled: true,

        periodicCheckinMinDays: 7,

        periodicCheckinMaxDays: 15,

        periodicCheckinMessageTemplate: 'Olá {cliente_nome}! ??\n\nPassando para ver se está tudo bem! ??\n\nPrecisa de alguma coisa? Estamos aqui! ??',

        checkinAiEnabled: true,

        checkinAiPrompt: 'Reescreva esta mensagem de check-in de forma calorosa e natural. Pareça genuinamente interessado no cliente.',

        broadcastEnabled: true,

        broadcastAntibotVariation: true,

        broadcastAiVariation: true,

        broadcastMinIntervalSeconds: 3,

        broadcastMaxIntervalSeconds: 10,

        disconnectedAlertEnabled: true,

        disconnectedAlertHours: 2,

        disconnectedAlertMessageTemplate: 'Olá {cliente_nome}! ??\n\nNotamos que seu WhatsApp está desconectado. ??\n\nPodemos ajudar? ??',

        disconnectedAiEnabled: true,

        disconnectedAiPrompt: 'Reescreva esta mensagem de alerta de desconexão de forma prestativa e profissional.',

        aiVariationEnabled: true,

        aiVariationPrompt: 'Reescreva esta mensagem de forma natural e personalizada. Mantenha o tom profissional mas amigável.',

        businessHoursStart: '09:00',

        businessHoursEnd: '18:00',

        businessDays: [1, 2, 3, 4, 5],

        respectBusinessHours: true,

        welcomeMessageEnabled: true,

        welcomeMessageVariations: [

          'Olá {{name}}! ?? Bem-vindo(a) ao nosso atendimento. Como posso ajudar você hoje?',

          'Oi {{name}}! ?? É um prazer ter você aqui. Em que posso ser útil?',

          'Bem-vindo(a) {{name}}! Estou aqui para ajudar. O que você precisa?',

        ],

        welcomeMessageAiEnabled: true,

        welcomeMessageAiPrompt: 'Gere uma mensagem de boas-vindas calorosa e profissional.',

      };

      

      if (!config) {

        return res.json(defaultConfig);

      }



      // Converter snake_case para camelCase

      const camelCaseConfig = {

        paymentReminderEnabled: config.payment_reminder_enabled ?? defaultConfig.paymentReminderEnabled,

        paymentReminderDaysBefore: config.payment_reminder_days_before ?? defaultConfig.paymentReminderDaysBefore,

        paymentReminderMessageTemplate: config.payment_reminder_message_template ?? defaultConfig.paymentReminderMessageTemplate,

        paymentReminderAiEnabled: config.payment_reminder_ai_enabled ?? defaultConfig.paymentReminderAiEnabled,

        paymentReminderAiPrompt: config.payment_reminder_ai_prompt ?? defaultConfig.paymentReminderAiPrompt,

        overdueReminderEnabled: config.overdue_reminder_enabled ?? defaultConfig.overdueReminderEnabled,

        overdueReminderDaysAfter: config.overdue_reminder_days_after ?? defaultConfig.overdueReminderDaysAfter,

        overdueReminderMessageTemplate: config.overdue_reminder_message_template ?? defaultConfig.overdueReminderMessageTemplate,

        overdueReminderAiEnabled: config.overdue_reminder_ai_enabled ?? defaultConfig.overdueReminderAiEnabled,

        overdueReminderAiPrompt: config.overdue_reminder_ai_prompt ?? defaultConfig.overdueReminderAiPrompt,

        periodicCheckinEnabled: config.periodic_checkin_enabled ?? defaultConfig.periodicCheckinEnabled,

        periodicCheckinMinDays: config.periodic_checkin_min_days ?? defaultConfig.periodicCheckinMinDays,

        periodicCheckinMaxDays: config.periodic_checkin_max_days ?? defaultConfig.periodicCheckinMaxDays,

        periodicCheckinMessageTemplate: config.periodic_checkin_message_template ?? defaultConfig.periodicCheckinMessageTemplate,

        checkinAiEnabled: config.checkin_ai_enabled ?? defaultConfig.checkinAiEnabled,

        checkinAiPrompt: config.checkin_ai_prompt ?? defaultConfig.checkinAiPrompt,

        broadcastEnabled: config.broadcast_enabled ?? defaultConfig.broadcastEnabled,

        broadcastAntibotVariation: config.broadcast_antibot_variation ?? defaultConfig.broadcastAntibotVariation,

        broadcastAiVariation: config.broadcast_ai_variation ?? defaultConfig.broadcastAiVariation,

        broadcastMinIntervalSeconds: config.broadcast_min_interval_seconds ?? defaultConfig.broadcastMinIntervalSeconds,

        broadcastMaxIntervalSeconds: config.broadcast_max_interval_seconds ?? defaultConfig.broadcastMaxIntervalSeconds,

        disconnectedAlertEnabled: config.disconnected_alert_enabled ?? defaultConfig.disconnectedAlertEnabled,

        disconnectedAlertHours: config.disconnected_alert_hours ?? defaultConfig.disconnectedAlertHours,

        disconnectedAlertMessageTemplate: config.disconnected_alert_message_template ?? defaultConfig.disconnectedAlertMessageTemplate,

        disconnectedAiEnabled: config.disconnected_ai_enabled ?? defaultConfig.disconnectedAiEnabled,

        disconnectedAiPrompt: config.disconnected_ai_prompt ?? defaultConfig.disconnectedAiPrompt,

        aiVariationEnabled: config.ai_variation_enabled ?? defaultConfig.aiVariationEnabled,

        aiVariationPrompt: config.ai_variation_prompt ?? defaultConfig.aiVariationPrompt,

        businessHoursStart: config.business_hours_start ?? defaultConfig.businessHoursStart,

        businessHoursEnd: config.business_hours_end ?? defaultConfig.businessHoursEnd,

        businessDays: config.business_days ?? defaultConfig.businessDays,

        respectBusinessHours: config.respect_business_hours ?? defaultConfig.respectBusinessHours,

        welcomeMessageEnabled: config.welcome_message_enabled ?? defaultConfig.welcomeMessageEnabled,

        welcomeMessageVariations: config.welcome_message_variations ?? defaultConfig.welcomeMessageVariations,

        welcomeMessageAiEnabled: config.welcome_message_ai_enabled ?? defaultConfig.welcomeMessageAiEnabled,

        welcomeMessageAiPrompt: config.welcome_message_ai_prompt ?? defaultConfig.welcomeMessageAiPrompt,

      };



      res.json(camelCaseConfig);

    } catch (error) {

      console.error("Error fetching notification config:", error);

      res.status(500).json({ message: "Failed to fetch config" });

    }

  });



  // Update notification config

  app.put("/api/admin/notifications/config", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const configData = req.body;



      await storage.updateAdminNotificationConfig?.(adminId, configData);



      res.json({ success: true });

    } catch (error) {

      console.error("Error updating notification config:", error);

      res.status(500).json({ message: "Failed to update config" });

    }

  });



  // Get notification stats

  app.get("/api/admin/notifications/stats", isAdmin, async (_req, res) => {

    try {

      const users = await storage.getAllUsers();

      const connections = await storage.getAllConnections?.();

      const subscriptions = await storage.getAllSubscriptions?.();

      

      const total = users.length;

      const withPlan = users.filter(u => {

        const sub = subscriptions?.find(s => s.userId === u.id && s.status === 'active');

        return !!sub;

      }).length;

      const withoutPlan = total - withPlan;

      const disconnected = users.filter(u => {

        const conn = connections?.find(c => c.userId === u.id);

        return !conn || !conn.isConnected;

      }).length;

      

      // Calcular pagamentos em atraso (simplificado)

      const overduePayments = 0; // TODO: implementar lógica real



      res.json({

        total,

        withPlan,

        withoutPlan,

        disconnected,

        overduePayments,

      });

    } catch (error) {

      console.error("Error fetching notification stats:", error);

      res.status(500).json({ message: "Failed to fetch stats" });

    }

  });



  // Test notification with AI variation

  app.post("/api/admin/notifications/test", isAdmin, async (req: any, res) => {

    try {

      const { type, message } = req.body;

      const adminId = (req.session as any)?.adminId;

      

      // Simular variação com IA

      const { callGroq } = await import("./llm");

      const config = await storage.getAdminNotificationConfig?.(adminId);

      

      const systemPrompt = config?.aiVariationPrompt || 'Reescreva esta mensagem de forma natural e personalizada. Retorne APENAS a mensagem reescrita, sem explicações.';

      

      // ? CORRIGIDO: Usar array de ChatMessage

      const variedMessage = await callGroq(

        [

          { role: 'system', content: systemPrompt },

          { role: 'user', content: message }

        ],

        { temperature: 0.8, maxTokens: 300 }

      );

      

      // ? PROTEÇÃO: Verificar se retornou mensagem válida

      const trimmedVaried = variedMessage.trim();

      const finalMessage = (trimmedVaried && trimmedVaried.length > 10 && !trimmedVaried.includes('Como posso ajudar'))

        ? trimmedVaried

        : message;



      res.json({ 

        success: true, 

        original: message,

        variedMessage: finalMessage,

      });

    } catch (error: any) {

      console.error("Error testing notification:", error);

      res.status(500).json({ message: error.message });

    }

  });



  // Get broadcasts

  app.get("/api/admin/broadcasts", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const broadcasts = await storage.getAdminBroadcasts?.(adminId);

      

      res.json(broadcasts || []);

    } catch (error) {

      console.error("Error fetching broadcasts:", error);

      res.status(500).json({ message: "Failed to fetch broadcasts" });

    }

  });



  // Create broadcast

  app.post("/api/admin/broadcasts", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { name, messageTemplate, targetType, aiVariation, antibotEnabled } = req.body;



      if (!name || !messageTemplate || !targetType) {

        return res.status(400).json({ message: "Name, message template and target type are required" });

      }



      // Calcular total de destinatários

      const users = await storage.getAllUsers();

      const subscriptions = await storage.getAllSubscriptions?.();

      

      let totalRecipients = 0;

      if (targetType === 'all') {

        totalRecipients = users.length;

      } else if (targetType === 'with_plan') {

        totalRecipients = users.filter(u => {

          const sub = subscriptions?.find(s => s.userId === u.id && s.status === 'active');

          return !!sub;

        }).length;

      } else if (targetType === 'without_plan') {

        totalRecipients = users.filter(u => {

          const sub = subscriptions?.find(s => s.userId === u.id && s.status === 'active');

          return !sub;

        }).length;

      }



      const broadcastId = await storage.createAdminBroadcast?.({

        adminId,

        name,

        messageTemplate,

        targetType,

        aiVariation: aiVariation !== false,

        antibotEnabled: antibotEnabled !== false,

        status: 'draft',

        totalRecipients,

        sentCount: 0,

        failedCount: 0,

      });



      res.json({ success: true, id: broadcastId });

    } catch (error) {

      console.error("Error creating broadcast:", error);

      res.status(500).json({ message: "Failed to create broadcast" });

    }

  });



  // Start broadcast COM DELAYS EM LOTE E VERIFICAÇÃO DE SESSÃO

  app.post("/api/admin/broadcasts/:id/start", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { id } = req.params;



      // Iniciar broadcast em background

      setImmediate(async () => {

        try {

          await storage.updateAdminBroadcast?.(adminId, id, { status: 'sending', startedAt: new Date() });

          

          const broadcast = await storage.getAdminBroadcast?.(adminId, id);

          if (!broadcast) return;



          const config = await storage.getAdminNotificationConfig?.(adminId);

          const users = await storage.getAllUsers();

          const subscriptions = await storage.getAllSubscriptions?.();

          const { sendAdminNotification, getAdminSession } = await import("./whatsapp");



          // ? VERIFICAR SE ADMIN TEM WHATSAPP CONECTADO

          const adminSession = getAdminSession(adminId);

          if (!adminSession || !adminSession.socket?.user) {

            console.log(`?? [BROADCAST ${id}] WhatsApp do admin desconectado - cancelando broadcast`);

            await storage.updateAdminBroadcast?.(adminId, id, { 

              status: 'cancelled',

              completedAt: new Date(),

              sentCount: 0,

              failedCount: 0,

            });

            return;

          }



          // Filtrar destinatários

          let recipients = users;

          if (broadcast.targetType === 'with_plan') {

            recipients = users.filter(u => {

              const sub = subscriptions?.find(s => s.userId === u.id && s.status === 'active');

              return !!sub;

            });

          } else if (broadcast.targetType === 'without_plan') {

            recipients = users.filter(u => {

              const sub = subscriptions?.find(s => s.userId === u.id && s.status === 'active');

              return !sub;

            });

          }



          let sent = 0;

          let failed = 0;

          let batchCount = 0;



          // ? TAMANHO DE LOTE ALEATÓRIO (15-25 mensagens)

          const BATCH_SIZE_MIN = 15;

          const BATCH_SIZE_MAX = 25;

          

          for (let i = 0; i < recipients.length; i++) {

            const user = recipients[i];

            

            try {

              // Substituir variáveis

              let message = broadcast.messageTemplate.replace(/{cliente_nome}/g, user.name || 'Cliente');

              

              // ? VARIAR COM IA SE HABILITADO (cada mensagem única)

              if (broadcast.aiVariation && config?.aiVariationEnabled) {

                const { callGroq } = await import("./llm");

                const prompt = config.aiVariationPrompt || 

                  `Reescreva esta mensagem mantendo o mesmo significado mas com palavras diferentes.

                  Varie saudações, conectivos e expressões.

                  Mantenha tom profissional e cordial.

                  Cliente: ${user.name || 'Cliente'}

                  Retorne APENAS a mensagem reescrita, sem explicações.`;

                

                message = await callGroq([

                  { role: 'system', content: prompt },

                  { role: 'user', content: broadcast.messageTemplate },

                ], {

                  // Usa modelo do banco de dados via config

                  temperature: 0.8,

                  max_tokens: 300,

                });

                message = message.trim();

              }



              // ? ENVIAR COM RETRY

              let success = false;

              for (let attempt = 1; attempt <= 3; attempt++) {

                const result = await sendAdminNotification(adminId, user.phone || user.whatsappNumber, message);

                if (result.success) {

                  success = true;

                  break;

                }

                

                if (attempt < 3) {

                  const backoffMs = Math.pow(2, attempt) * 1000;

                  await new Promise(resolve => setTimeout(resolve, backoffMs));

                }

              }



              if (success) {

                sent++;

              } else {

                failed++;

              }



              // ? DELAY ANTI-BOT ENTRE MENSAGENS INDIVIDUAIS (3-10 segundos)

              if (broadcast.antibotEnabled && i < recipients.length - 1) {

                const minDelay = (config?.broadcastMinIntervalSeconds || 3) * 1000;

                const maxDelay = (config?.broadcastMaxIntervalSeconds || 10) * 1000;

                const delay = Math.random() * (maxDelay - minDelay) + minDelay;

                await new Promise(resolve => setTimeout(resolve, delay));

              }

            } catch (error) {

              console.error(`Error sending to ${user.id}:`, error);

              failed++;

            }



            // ? DELAY ENTRE LOTES (30-60 segundos a cada 15-25 mensagens)

            if ((i + 1) % (Math.floor(Math.random() * (BATCH_SIZE_MAX - BATCH_SIZE_MIN + 1)) + BATCH_SIZE_MIN) === 0 && i < recipients.length - 1) {

              batchCount++;

              const BATCH_DELAY_MIN_MS = 30000; // 30 segundos

              const BATCH_DELAY_MAX_MS = 60000; // 60 segundos

              const batchDelay = Math.random() * (BATCH_DELAY_MAX_MS - BATCH_DELAY_MIN_MS) + BATCH_DELAY_MIN_MS;

              

              console.log(`?? [BROADCAST ${id}] Pausa entre lotes (${batchCount}) - aguardando ${Math.floor(batchDelay/1000)}s...`);

              await new Promise(resolve => setTimeout(resolve, batchDelay));

            }



            // Atualizar progresso

            await storage.updateAdminBroadcast?.(adminId, id, { sentCount: sent, failedCount: failed });

          }



          await storage.updateAdminBroadcast?.(adminId, id, { 

            status: 'completed', 

            completedAt: new Date(),

            sentCount: sent,

            failedCount: failed,

          });



          console.log(`? [BROADCAST ${id}] Concluído: ${sent} enviados, ${failed} falhas, ${batchCount} pausas de lote`);

        } catch (error) {

          console.error(`? [BROADCAST ${id}] Erro:`, error);

          await storage.updateAdminBroadcast?.(adminId, id, { status: 'cancelled' });

        }

      });



      res.json({ success: true, message: 'Broadcast iniciado em background' });

    } catch (error) {

      console.error("Error starting broadcast:", error);

      res.status(500).json({ message: "Failed to start broadcast" });

    }

  });



  // ==================== SCHEDULED NOTIFICATIONS / AGENDAMENTOS ====================



  // Get scheduled notifications (calendar view)

  app.get("/api/admin/notifications/scheduled", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { startDate, endDate, status, type } = req.query;

      

      const result = await db.execute(sql`

        SELECT 

          sn.*,

          u.name as user_name,

          u.email as user_email

        FROM scheduled_notifications sn

        LEFT JOIN users u ON sn.user_id = u.id

        WHERE sn.admin_id = ${adminId}

        ${startDate ? sql`AND sn.scheduled_for >= ${startDate}::timestamp` : sql``}

        ${endDate ? sql`AND sn.scheduled_for <= ${endDate}::timestamp` : sql``}

        ${status ? sql`AND sn.status = ${status}` : sql``}

        ${type ? sql`AND sn.notification_type = ${type}` : sql``}

        ORDER BY sn.scheduled_for ASC

      `);

      

      res.json(result.rows || []);

    } catch (error) {

      console.error("Error fetching scheduled notifications:", error);

      res.status(500).json({ message: "Failed to fetch scheduled notifications" });

    }

  });



  // Get calendar summary (count per day)

  app.get("/api/admin/notifications/calendar", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { month, year } = req.query;

      

      const startOfMonth = new Date(Number(year), Number(month) - 1, 1);

      const endOfMonth = new Date(Number(year), Number(month), 0, 23, 59, 59);

      

      const result = await db.execute(sql`

        SELECT 

          DATE(scheduled_for) as date,

          notification_type,

          status,

          COUNT(*) as count

        FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        AND scheduled_for >= ${startOfMonth.toISOString()}

        AND scheduled_for <= ${endOfMonth.toISOString()}

        GROUP BY DATE(scheduled_for), notification_type, status

        ORDER BY date

      `);

      

      // Agrupar por data para facilitar visualização no calendário

      const calendarData: Record<string, { 

        total: number; 

        pending: number; 

        sent: number; 

        failed: number;

        byType: Record<string, number>;

      }> = {};

      

      for (const row of result.rows as any[]) {

        const dateKey = row.date.split('T')[0];

        if (!calendarData[dateKey]) {

          calendarData[dateKey] = { total: 0, pending: 0, sent: 0, failed: 0, byType: {} };

        }

        const count = parseInt(row.count);

        calendarData[dateKey].total += count;

        calendarData[dateKey].byType[row.notification_type] = (calendarData[dateKey].byType[row.notification_type] || 0) + count;

        

        if (row.status === 'pending') calendarData[dateKey].pending += count;

        else if (row.status === 'sent') calendarData[dateKey].sent += count;

        else if (row.status === 'failed') calendarData[dateKey].failed += count;

      }

      

      res.json(calendarData);

    } catch (error) {

      console.error("Error fetching calendar data:", error);

      res.status(500).json({ message: "Failed to fetch calendar data" });

    }

  });



  // Reorganize/Generate all scheduled notifications

  app.post("/api/admin/notifications/reorganize", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      

      // Obter configuração

      const rawConfig = await storage.getAdminNotificationConfig?.(adminId);

      

      // Configuração padrão

      const defaultConfig = {

        paymentReminderEnabled: true,

        paymentReminderDaysBefore: [7, 3, 1],

        paymentReminderMessageTemplate: 'Olá {cliente_nome}! ??\n\nGostaríamos de lembrar que seu pagamento vence em {dias_restantes} dias.\n\n?? Vencimento: {data_vencimento}\n?? Valor: R$ {valor}\n\nQualquer dúvida estamos à disposição! ??',

        paymentReminderAiEnabled: true,

        paymentReminderAiPrompt: 'Reescreva esta mensagem de lembrete de pagamento de forma natural e personalizada. Mantenha o tom profissional mas amigável.',

        overdueReminderEnabled: true,

        overdueReminderDaysAfter: [1, 3, 7, 14],

        overdueReminderMessageTemplate: 'Olá {cliente_nome}! ??\n\nIdentificamos que seu pagamento está em atraso há {dias_atraso} dias.\n\n?? Venceu em: {data_vencimento}\n?? Valor: R$ {valor}\n\nPor favor, regularize sua situação. ??',

        overdueReminderAiEnabled: true,

        overdueReminderAiPrompt: 'Reescreva esta mensagem de cobrança de forma educada e empática. Mantenha o tom profissional.',

        periodicCheckinEnabled: true,

        periodicCheckinMinDays: 7,

        periodicCheckinMaxDays: 15,

        periodicCheckinMessageTemplate: 'Olá {cliente_nome}! ??\n\nPassando para ver se está tudo bem! ??\n\nPrecisa de alguma coisa? Estamos aqui! ??',

        checkinAiEnabled: true,

        checkinAiPrompt: 'Reescreva esta mensagem de check-in de forma calorosa e natural. Pareça genuinamente interessado no cliente.',

        disconnectedAlertEnabled: true,

        disconnectedAlertHours: 2,

        disconnectedAlertMessageTemplate: 'Olá {cliente_nome}! ??\n\nNotamos que seu WhatsApp está desconectado. ??\n\nPodemos ajudar? ??',

        disconnectedAiEnabled: true,

        disconnectedAiPrompt: 'Reescreva esta mensagem de alerta de desconexão de forma prestativa e profissional.',

        aiVariationEnabled: true,

        aiVariationPrompt: 'Reescreva esta mensagem de forma natural e personalizada. Mantenha o tom profissional mas amigável.',

        businessHoursStart: '09:00',

        businessHoursEnd: '18:00',

        businessDays: [1, 2, 3, 4, 5],

        respectBusinessHours: true,

      };

      

      // Converter snake_case para camelCase se tiver config no banco

      const config = rawConfig ? {

        paymentReminderEnabled: rawConfig.payment_reminder_enabled ?? defaultConfig.paymentReminderEnabled,

        paymentReminderDaysBefore: rawConfig.payment_reminder_days_before ?? defaultConfig.paymentReminderDaysBefore,

        paymentReminderMessageTemplate: rawConfig.payment_reminder_message_template ?? defaultConfig.paymentReminderMessageTemplate,

        paymentReminderAiEnabled: rawConfig.payment_reminder_ai_enabled ?? defaultConfig.paymentReminderAiEnabled,

        paymentReminderAiPrompt: rawConfig.payment_reminder_ai_prompt ?? defaultConfig.paymentReminderAiPrompt,

        overdueReminderEnabled: rawConfig.overdue_reminder_enabled ?? defaultConfig.overdueReminderEnabled,

        overdueReminderDaysAfter: rawConfig.overdue_reminder_days_after ?? defaultConfig.overdueReminderDaysAfter,

        overdueReminderMessageTemplate: rawConfig.overdue_reminder_message_template ?? defaultConfig.overdueReminderMessageTemplate,

        overdueReminderAiEnabled: rawConfig.overdue_reminder_ai_enabled ?? defaultConfig.overdueReminderAiEnabled,

        overdueReminderAiPrompt: rawConfig.overdue_reminder_ai_prompt ?? defaultConfig.overdueReminderAiPrompt,

        periodicCheckinEnabled: rawConfig.periodic_checkin_enabled ?? defaultConfig.periodicCheckinEnabled,

        periodicCheckinMinDays: rawConfig.periodic_checkin_min_days ?? defaultConfig.periodicCheckinMinDays,

        periodicCheckinMaxDays: rawConfig.periodic_checkin_max_days ?? defaultConfig.periodicCheckinMaxDays,

        periodicCheckinMessageTemplate: rawConfig.periodic_checkin_message_template ?? defaultConfig.periodicCheckinMessageTemplate,

        checkinAiEnabled: rawConfig.checkin_ai_enabled ?? defaultConfig.checkinAiEnabled,

        checkinAiPrompt: rawConfig.checkin_ai_prompt ?? defaultConfig.checkinAiPrompt,

        disconnectedAlertEnabled: rawConfig.disconnected_alert_enabled ?? defaultConfig.disconnectedAlertEnabled,

        disconnectedAlertHours: rawConfig.disconnected_alert_hours ?? defaultConfig.disconnectedAlertHours,

        disconnectedAlertMessageTemplate: rawConfig.disconnected_alert_message_template ?? defaultConfig.disconnectedAlertMessageTemplate,

        disconnectedAiEnabled: rawConfig.disconnected_ai_enabled ?? defaultConfig.disconnectedAiEnabled,

        disconnectedAiPrompt: rawConfig.disconnected_ai_prompt ?? defaultConfig.disconnectedAiPrompt,

        aiVariationEnabled: rawConfig.ai_variation_enabled ?? defaultConfig.aiVariationEnabled,

        aiVariationPrompt: rawConfig.ai_variation_prompt ?? defaultConfig.aiVariationPrompt,

        businessHoursStart: rawConfig.business_hours_start ?? defaultConfig.businessHoursStart,

        businessHoursEnd: rawConfig.business_hours_end ?? defaultConfig.businessHoursEnd,

        businessDays: rawConfig.business_days ?? defaultConfig.businessDays,

        respectBusinessHours: rawConfig.respect_business_hours ?? defaultConfig.respectBusinessHours,

      } : defaultConfig;

      

      console.log(`[Reorganize] Config carregada:`, JSON.stringify({

        paymentReminderEnabled: config.paymentReminderEnabled,

        overdueReminderEnabled: config.overdueReminderEnabled,

        periodicCheckinEnabled: config.periodicCheckinEnabled,

        disconnectedAlertEnabled: config.disconnectedAlertEnabled,

        paymentReminderDaysBefore: config.paymentReminderDaysBefore,

        overdueReminderDaysAfter: config.overdueReminderDaysAfter,

      }));

      

      // Obter todos os usuários com plano ativo

      const users = await storage.getAllUsers();

      const subscriptions = await storage.getAllSubscriptions?.() || [];

      const connections = await storage.getAllConnections?.() || [];

      

      // Limpar agendamentos pendentes antigos (passados)

      await db.execute(sql`

        DELETE FROM scheduled_notifications 

        WHERE admin_id = ${adminId} 

        AND status = 'pending'

        AND scheduled_for < NOW()

      `);

      

      // Buscar logs de envio para não duplicar

      const sentLogsResult = await db.execute(sql`

        SELECT user_id, notification_type, 

               DATE(created_at) as sent_date,

               (metadata->>'daysBefore')::int as days_before,

               (metadata->>'daysAfter')::int as days_after

        FROM admin_notification_logs 

        WHERE admin_id = ${adminId}

        AND created_at > NOW() - INTERVAL '30 days'

      `);

      const sentLogs = sentLogsResult.rows || [];

      

      // Buscar agendamentos pendentes existentes para não duplicar

      const existingResult = await db.execute(sql`

        SELECT user_id, notification_type, DATE(scheduled_for) as schedule_date,

               (metadata->>'daysBefore')::int as days_before,

               (metadata->>'daysAfter')::int as days_after

        FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        AND status = 'pending'

      `);

      const existingScheduled = existingResult.rows || [];

      

      // Função para verificar se já foi enviado ou agendado

      const alreadySentOrScheduled = (userId: string, type: string, daysBefore?: number, daysAfter?: number) => {

        // Verifica se já foi enviado

        const wasSent = sentLogs.some((log: any) => 

          log.user_id === userId && 

          log.notification_type === type &&

          (daysBefore === undefined || log.days_before === daysBefore) &&

          (daysAfter === undefined || log.days_after === daysAfter)

        );

        // Verifica se já está agendado

        const isScheduled = existingScheduled.some((s: any) => 

          s.user_id === userId && 

          s.notification_type === type &&

          (daysBefore === undefined || s.days_before === daysBefore) &&

          (daysAfter === undefined || s.days_after === daysAfter)

        );

        return wasSent || isScheduled;

      };

      

      const scheduledItems: any[] = [];

      const now = new Date();

      

      // Contar status de subscriptions para debug

      const activeCount = subscriptions.filter(s => s.status === 'active').length;

      const pendingCount = subscriptions.filter(s => s.status === 'pending').length;

      console.log(`[Reorganize] Processando ${users.length} usuários, ${subscriptions.length} subscriptions (${activeCount} active, ${pendingCount} pending)`);

      console.log(`[Reorganize] Exemplo de subscription:`, JSON.stringify(subscriptions[0], null, 2));

      

      for (const user of users) {

        if (!user.phone) continue;

        

        // Buscar subscription ativa OU pendente (pendente = aguardando pagamento = vence em breve)

        const subscription = subscriptions.find(s => s.userId === user.id && (s.status === 'active' || s.status === 'pending'));

        const connection = connections.find(c => c.userId === user.id);

        

        // Calcular data de vencimento

        // Prioridade: nextPaymentDate > dataFim > dataInicio + frequenciaDias

        let dueDate = subscription?.nextPaymentDate || subscription?.dataFim;

        

        // Se não tem data de vencimento mas tem data de início e plano, calcular

        if (!dueDate && subscription?.dataInicio && subscription?.plan) {

          const startDate = new Date(subscription.dataInicio);

          const frequenciaDias = subscription.plan.frequenciaDias || 30; // padrão 30 dias

          const calculatedDueDate = new Date(startDate);

          calculatedDueDate.setDate(calculatedDueDate.getDate() + frequenciaDias);

          dueDate = calculatedDueDate.toISOString();

          

          console.log(`[Reorganize] ${user.name}: calculado vencimento = dataInicio(${startDate.toISOString()}) + ${frequenciaDias} dias = ${dueDate}`);

        }

        

        const planValor = subscription?.plan?.valor || '0';

        

        // Debug: mostrar se vai entrar na condição de lembrete

        if (subscription && dueDate) {

          const dueDateObj = new Date(dueDate);

          const daysUntilDue = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          if (daysUntilDue > -30 && daysUntilDue <= 30) {

            console.log(`[Reorganize] ${user.name}: dueDate=${dueDate}, daysUntilDue=${daysUntilDue}, paymentReminderEnabled=${config.paymentReminderEnabled}`);

          }

        }

        

        // 1. LEMBRETE DE PAGAMENTO (para quem tem plano com vencimento)

        if (config.paymentReminderEnabled && subscription && dueDate) {

          const dueDateObj = new Date(dueDate);

          const daysUntilDue = Math.ceil((dueDateObj.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

          

          // Apenas logar quem vence nos próximos 14 dias

          if (daysUntilDue > 0 && daysUntilDue <= 14) {

            console.log(`[Reorganize] ${user.name}: LEMBRETE - vence em ${daysUntilDue} dias (${dueDateObj.toISOString()})`);

          }

          

          for (const daysBefore of (config.paymentReminderDaysBefore || [7, 3, 1])) {

            // Só agendar se a data de lembrete está no futuro

            if (daysUntilDue > 0 && daysUntilDue <= daysBefore + 7) {

              console.log(`[Reorganize] ${user.name}: tentando agendar lembrete de ${daysBefore} dias antes`);

              // Verifica se já foi enviado ou agendado

              if (alreadySentOrScheduled(user.id, 'payment_reminder', daysBefore)) {

                console.log(`[Reorganize] Pulando ${user.name} - já enviado/agendado para ${daysBefore} dias antes`);

                continue;

              }

              

              const scheduleDate = new Date(dueDateObj);

              scheduleDate.setDate(scheduleDate.getDate() - daysBefore);

              

              // Se a data de agendamento já passou, agendar para amanhã no horário comercial

              if (scheduleDate <= now) {

                scheduleDate.setTime(now.getTime());

                scheduleDate.setDate(scheduleDate.getDate() + 1);

              }

              

              // Aplicar horário comercial

              if (config.respectBusinessHours) {

                const [startHour] = (config.businessHoursStart || '09:00').split(':').map(Number);

                scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);

              }

              

              scheduledItems.push({

                admin_id: adminId,

                user_id: user.id,

                notification_type: 'payment_reminder',

                recipient_phone: user.phone,

                recipient_name: user.name || 'Cliente',

                message_template: config.paymentReminderMessageTemplate || 'Lembrete de pagamento',

                ai_prompt: config.paymentReminderAiPrompt || config.aiVariationPrompt,

                scheduled_for: scheduleDate.toISOString(),

                ai_enabled: config.paymentReminderAiEnabled !== false,

                metadata: JSON.stringify({ 

                  daysBefore, 

                  dueDate: dueDateObj.toISOString(),

                  subscriptionId: subscription.id,

                  valor: planValor,

                  planName: subscription.plan?.nome || 'Plano'

                }),

              });

            }

          }

        }

        

        // 2. COBRANÇA EM ATRASO (para quem tem plano vencido)

        if (config.overdueReminderEnabled && subscription && dueDate) {

          const dueDateObj = new Date(dueDate);

          const daysOverdue = Math.ceil((now.getTime() - dueDateObj.getTime()) / (1000 * 60 * 60 * 24));

          

          if (daysOverdue > 0) {

            console.log(`[Reorganize] ${user.name}: em atraso há ${daysOverdue} dias`);

            

            for (const daysAfter of (config.overdueReminderDaysAfter || [1, 3, 7, 14])) {

              // Se está no período de atraso adequado

              if (daysOverdue >= daysAfter && daysOverdue < daysAfter + 7) {

                // Verifica se já foi enviado ou agendado

                if (alreadySentOrScheduled(user.id, 'overdue_reminder', undefined, daysAfter)) {

                  console.log(`[Reorganize] Pulando ${user.name} - cobrança já enviada/agendada para ${daysAfter} dias após`);

                  continue;

                }

                

                const scheduleDate = new Date();

                // Aplicar horário comercial

                if (config.respectBusinessHours) {

                  const [startHour] = (config.businessHoursStart || '09:00').split(':').map(Number);

                  scheduleDate.setHours(startHour + Math.floor(Math.random() * 2), Math.floor(Math.random() * 60), 0);

                }

                // Se horário já passou, agendar para amanhã

                if (scheduleDate <= now) {

                  scheduleDate.setDate(scheduleDate.getDate() + 1);

                }

                

                scheduledItems.push({

                  admin_id: adminId,

                  user_id: user.id,

                  notification_type: 'overdue_reminder',

                  recipient_phone: user.phone,

                  recipient_name: user.name || 'Cliente',

                  message_template: config.overdueReminderMessageTemplate || 'Cobrança em atraso',

                  ai_prompt: config.overdueReminderAiPrompt || config.aiVariationPrompt,

                  scheduled_for: scheduleDate.toISOString(),

                  ai_enabled: config.overdueReminderAiEnabled !== false,

                  metadata: JSON.stringify({ 

                    daysAfter,

                    daysOverdue, 

                    dueDate: dueDateObj.toISOString(),

                    subscriptionId: subscription.id,

                    valor: planValor,

                    planName: subscription.plan?.nome || 'Plano'

                  }),

                });

              }

            }

          }

        }

        

        // 3. CHECK-IN PERIÓDICO (só para quem tem plano ativo)

        if (config.periodicCheckinEnabled && subscription) {

          // Verifica se já tem check-in agendado

          if (alreadySentOrScheduled(user.id, 'checkin')) {

            continue;

          }

          

          const minDays = config.periodicCheckinMinDays || 7;

          const maxDays = config.periodicCheckinMaxDays || 15;

          const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;

          

          const scheduleDate = new Date();

          scheduleDate.setDate(scheduleDate.getDate() + randomDays);

          

          if (config.respectBusinessHours) {

            const [startHour] = (config.businessHoursStart || '09:00').split(':').map(Number);

            scheduleDate.setHours(startHour + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60), 0);

          }

          

          scheduledItems.push({

            admin_id: adminId,

            user_id: user.id,

            notification_type: 'checkin',

            recipient_phone: user.phone,

            recipient_name: user.name || 'Cliente',

            message_template: config.periodicCheckinMessageTemplate || 'Check-in periódico',

            ai_prompt: config.checkinAiPrompt || config.aiVariationPrompt,

            scheduled_for: scheduleDate.toISOString(),

            ai_enabled: config.checkinAiEnabled !== false,

            metadata: JSON.stringify({ minDays, maxDays, randomDays }),

          });

        }

        

        // 4. ALERTA DESCONECTADO (para quem está desconectado com plano ativo)

        if (config.disconnectedAlertEnabled && connection && !connection.isConnected && subscription) {

          // Verifica se já tem alerta agendado

          if (alreadySentOrScheduled(user.id, 'disconnected')) {

            continue;

          }

          

          const scheduleDate = new Date();

          scheduleDate.setHours(scheduleDate.getHours() + (config.disconnectedAlertHours || 2));

          

          scheduledItems.push({

            admin_id: adminId,

            user_id: user.id,

            notification_type: 'disconnected',

            recipient_phone: user.phone,

            recipient_name: user.name || 'Cliente',

            message_template: config.disconnectedAlertMessageTemplate || 'Alerta de desconexão',

            ai_prompt: config.disconnectedAiPrompt || config.aiVariationPrompt,

            scheduled_for: scheduleDate.toISOString(),

            ai_enabled: config.disconnectedAiEnabled !== false,

            metadata: JSON.stringify({ disconnectedSince: connection.updatedAt }),

          });

        }

      }

      

      console.log(`[Reorganize] Total de ${scheduledItems.length} notificações a agendar`);

      

      // Inserir todos os agendamentos

      if (scheduledItems.length > 0) {

        for (const item of scheduledItems) {

          await db.execute(sql`

            INSERT INTO scheduled_notifications (

              admin_id, user_id, notification_type, recipient_phone, recipient_name,

              message_template, ai_prompt, scheduled_for, ai_enabled, metadata, status

            ) VALUES (

              ${item.admin_id}, ${item.user_id}, ${item.notification_type}, 

              ${item.recipient_phone}, ${item.recipient_name}, ${item.message_template},

              ${item.ai_prompt}, ${item.scheduled_for}::timestamp, ${item.ai_enabled}, 

              ${item.metadata}::jsonb, 'pending'

            )

            ON CONFLICT DO NOTHING

          `);

        }

      }

      

      res.json({ 

        success: true, 

        message: `${scheduledItems.length} notificações agendadas`,

        scheduled: scheduledItems.length,

        breakdown: {

          paymentReminder: scheduledItems.filter(i => i.notification_type === 'payment_reminder').length,

          overdueReminder: scheduledItems.filter(i => i.notification_type === 'overdue_reminder').length,

          checkin: scheduledItems.filter(i => i.notification_type === 'checkin').length,

          disconnected: scheduledItems.filter(i => i.notification_type === 'disconnected').length,

        }

      });

    } catch (error) {

      console.error("Error reorganizing notifications:", error);

      res.status(500).json({ message: "Failed to reorganize notifications" });

    }

  });



  // Cancel scheduled notification

  app.delete("/api/admin/notifications/scheduled/:id", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { id } = req.params;

      

      await db.execute(sql`

        UPDATE scheduled_notifications 

        SET status = 'cancelled'

        WHERE id = ${id} AND admin_id = ${adminId} AND status = 'pending'

      `);

      

      res.json({ success: true });

    } catch (error) {

      console.error("Error cancelling notification:", error);

      res.status(500).json({ message: "Failed to cancel notification" });

    }

  });



  // Get conversation history for a user (for AI context)

  app.get("/api/admin/notifications/conversation-history/:userId", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { userId } = req.params;

      const { limit = 10 } = req.query;

      

      // Buscar telefone do usuário

      const userResult = await db.execute(sql`

        SELECT phone FROM users WHERE id = ${userId}

      `);

      const userPhone = (userResult.rows?.[0] as any)?.phone;

      

      if (!userPhone) {

        return res.json([]);

      }

      

      // Buscar mensagens do admin com este usuário pelo número de telefone

      const result = await db.execute(sql`

        SELECT 

          am.text,

          am.from_me,

          am.timestamp,

          am.is_from_agent

        FROM admin_messages am

        INNER JOIN admin_conversations ac ON am.conversation_id = ac.id

        WHERE ac.admin_id = ${adminId}

        AND (ac.contact_number LIKE ${'%' + userPhone.slice(-8)} OR ac.contact_number LIKE ${userPhone + '%'})

        ORDER BY am.timestamp DESC

        LIMIT ${Number(limit)}

      `);

      

      // Formatar histórico para contexto IA

      const history = (result.rows as any[]).reverse().map(msg => ({

        role: msg.from_me ? 'assistant' : 'user',

        content: msg.text,

        timestamp: msg.timestamp,

        isFromAgent: msg.is_from_agent

      }));

      

      res.json(history);

    } catch (error) {

      console.error("Error fetching conversation history:", error);

      res.status(500).json({ message: "Failed to fetch conversation history" });

    }

  });



  // Process and send scheduled notification with conversation context

  app.post("/api/admin/notifications/send/:id", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { id } = req.params;

      

      // Buscar notificação agendada

      const result = await db.execute(sql`

        SELECT * FROM scheduled_notifications WHERE id = ${id} AND admin_id = ${adminId}

      `);

      

      const notification = result.rows?.[0] as any;

      if (!notification) {

        return res.status(404).json({ message: "Notificação não encontrada" });

      }

      

      if (notification.status !== 'pending') {

        return res.status(400).json({ message: "Notificação já foi processada" });

      }

      

      // Buscar histórico de conversa pelo telefone do destinatário

      const historyResult = await db.execute(sql`

        SELECT 

          am.text,

          am.from_me,

          am.timestamp

        FROM admin_messages am

        INNER JOIN admin_conversations ac ON am.conversation_id = ac.id

        WHERE ac.admin_id = ${adminId}

        AND (ac.contact_number LIKE ${'%' + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + '%'})

        ORDER BY am.timestamp DESC

        LIMIT 15

      `);

      

      const conversationHistory = (historyResult.rows as any[]).reverse().map(msg => 

        `${msg.from_me ? 'Você' : 'Cliente'}: ${msg.text}`

      ).join('\n');

      

      // Preparar mensagem - substituir variáveis

      const metadata = typeof notification.metadata === 'string' ? JSON.parse(notification.metadata || '{}') : (notification.metadata || {});

      let finalMessage = notification.message_template

        .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')

        .replace(/{dias_restantes}/g, metadata.daysBefore || '')

        .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')

        .replace(/{data_vencimento}/g, metadata.dueDate ? 

          new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')

        .replace(/{valor}/g, metadata.valor || '');

      

      // Variação com IA usando contexto da conversa

      if (notification.ai_enabled) {

        try {

          const { callGroq } = await import("./llm");

          const config = await storage.getAdminNotificationConfig?.(adminId);

          

          let systemPrompt = notification.ai_prompt || config?.aiVariationPrompt || 

            'Reescreva esta mensagem de forma natural e personalizada.';

          

          // Adicionar contexto do cliente

          systemPrompt += `\n\nO nome do cliente é: ${notification.recipient_name || 'Cliente'}`;

          

          // Adicionar contexto da conversa ao prompt

          if (conversationHistory) {

            systemPrompt += `\n\nHISTÓRICO DA CONVERSA COM ESTE CLIENTE:\n---\n${conversationHistory}\n---\n\nUse este contexto para personalizar a mensagem.`;

          }

          

          systemPrompt += '\n\nIMPORTANTE: Retorne APENAS a mensagem reescrita, sem explicações ou aspas.';

          

          // ? CORRIGIDO: Usar array de ChatMessage

          const variedMessage = await callGroq(

            [

              { role: 'system', content: systemPrompt },

              { role: 'user', content: finalMessage }

            ],

            { temperature: 0.8, maxTokens: 500 }

          );

          

          // ? PROTEÇÃO: Verificar se retornou mensagem válida

          const trimmedVaried = variedMessage.trim();

          if (trimmedVaried && trimmedVaried.length > 10 && !trimmedVaried.includes('Como posso ajudar')) {

            finalMessage = trimmedVaried;

          }

        } catch (aiError) {

          console.error("Error varying message with AI:", aiError);

          // Continua com mensagem original se IA falhar

        }

      }

      

      // Enviar mensagem

      const { sendAdminNotification } = await import("./whatsapp");

      const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);

      const sent = sendResult.success;

      

      // Atualizar status

      await db.execute(sql`

        UPDATE scheduled_notifications 

        SET 

          status = ${sent ? 'sent' : 'failed'},

          sent_at = NOW(),

          final_message = ${finalMessage},

          conversation_context = ${conversationHistory || ''},

          error_message = ${sent ? null : (sendResult.error || 'Falha ao enviar')}

        WHERE id = ${id}

      `);

      

      // Registrar no log com metadata para evitar duplicatas

      await db.execute(sql`

        INSERT INTO admin_notification_logs (

          admin_id, user_id, notification_type, recipient_phone, recipient_name,

          message_original, message_sent, status, metadata, created_at, sent_at

        ) VALUES (

          ${adminId}, ${notification.user_id}, ${notification.notification_type},

          ${notification.recipient_phone}, ${notification.recipient_name},

          ${notification.message_template}, ${finalMessage}, ${sent ? 'sent' : 'failed'},

          ${notification.metadata}::jsonb, NOW(), NOW()

        )

      `);

      

      res.json({ 

        success: sent, 

        message: sent ? 'Notificação enviada com sucesso' : 'Falha ao enviar',

        finalMessage 

      });

    } catch (error) {

      console.error("Error sending notification:", error);

      res.status(500).json({ message: "Failed to send notification" });

    }

  });



  // REENVIAR notificação que já foi enviada (status = 'sent')

  app.post("/api/admin/notifications/resend/:id", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      const { id } = req.params;

      

      // Buscar notificação agendada - permitir apenas status 'sent' ou 'failed'

      const result = await db.execute(sql`

        SELECT * FROM scheduled_notifications WHERE id = ${id} AND admin_id = ${adminId}

      `);

      

      const notification = result.rows?.[0] as any;

      if (!notification) {

        return res.status(404).json({ message: "Notificação não encontrada" });

      }

      

      if (notification.status !== 'sent' && notification.status !== 'failed') {

        return res.status(400).json({ message: "Apenas notificações enviadas ou com falha podem ser reenviadas" });

      }

      

      // Usar a mesma mensagem final se existir, ou gerar nova

      let finalMessage = notification.final_message || notification.message_template;

      

      console.log(`[RESEND] Notification ${id}: ai_enabled=${notification.ai_enabled}, regenerate=${req.body?.regenerate}`);

      

      // Se AI estava ativada, podemos regenerar a mensagem

      if (notification.ai_enabled && req.body?.regenerate) {

        console.log(`[RESEND] ? Usando variação de IA para reenvio`);

        try {

          // Buscar histórico de conversa

          const historyResult = await db.execute(sql`

            SELECT 

              am.text,

              am.from_me,

              am.timestamp

            FROM admin_messages am

            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id

            WHERE ac.admin_id = ${adminId}

            AND (ac.contact_number LIKE ${'%' + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + '%'})

            ORDER BY am.timestamp DESC

            LIMIT 15

          `);

          

          const conversationHistory = (historyResult.rows as any[]).reverse().map(msg => 

            `${msg.from_me ? 'Você' : 'Cliente'}: ${msg.text}`

          ).join('\n');

          

          const metadata = typeof notification.metadata === 'string' ? JSON.parse(notification.metadata || '{}') : (notification.metadata || {});

          let baseMessage = notification.message_template

            .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')

            .replace(/{dias_restantes}/g, metadata.daysBefore || '')

            .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')

            .replace(/{data_vencimento}/g, metadata.dueDate ? 

              new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')

            .replace(/{valor}/g, metadata.valor || '');

          

          const { callGroq } = await import("./llm");

          const config = await storage.getAdminNotificationConfig?.(adminId);

          

          let systemPrompt = notification.ai_prompt || config?.aiVariationPrompt || 

            'Reescreva esta mensagem de forma natural e personalizada.';

          systemPrompt += `\n\nO nome do cliente é: ${notification.recipient_name || 'Cliente'}`;

          if (conversationHistory) {

            systemPrompt += `\n\nHISTÓRICO DA CONVERSA COM ESTE CLIENTE:\n---\n${conversationHistory}\n---\n\nUse este contexto para personalizar a mensagem.`;

          }

          systemPrompt += '\n\nIMPORTANTE: Retorne APENAS a mensagem reescrita, sem explicações ou aspas.';

          

          const variedMessage = await callGroq(

            [

              { role: 'system', content: systemPrompt },

              { role: 'user', content: baseMessage }

            ],

            { temperature: 0.8, maxTokens: 500 }

          );

          

          const trimmedVaried = variedMessage.trim();

          console.log(`[RESEND] IA retornou: "${trimmedVaried.substring(0, 100)}..."`);

          if (trimmedVaried && trimmedVaried.length > 10 && !trimmedVaried.includes('Como posso ajudar')) {

            finalMessage = trimmedVaried;

            console.log(`[RESEND] ? Mensagem variada pela IA com sucesso`);

          } else {

            console.log(`[RESEND] ?? Mensagem da IA rejeitada, usando original`);

          }

        } catch (aiError) {

          console.error("[RESEND] ? Error varying message with AI on resend:", aiError);

        }

      } else {

        console.log(`[RESEND] ?? Usando mensagem original (sem variação IA)`);

      }

      

      // Enviar mensagem

      const { sendAdminNotification } = await import("./whatsapp");

      const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);

      const sent = sendResult.success;

      

      console.log(`[RESEND] ?? Resultado do envio:`, {

        success: sent,

        originalPhone: sendResult.originalPhone,

        validatedPhone: sendResult.validatedPhone,

        error: sendResult.error

      });

      

      // Atualizar registro original marcando como reenviado

      await db.execute(sql`

        UPDATE scheduled_notifications 

        SET 

          metadata = jsonb_set(

            jsonb_set(

              COALESCE(metadata, '{}')::jsonb, 

              '{resent_at}', 

              to_jsonb(NOW()::text)

            ),

            '{validated_phone}',

            to_jsonb(${sendResult.validatedPhone || 'unknown'}::text)

          ),

          final_message = ${finalMessage}

        WHERE id = ${id}

      `);

      

      // Registrar novo log de reenvio

      await db.execute(sql`

        INSERT INTO admin_notification_logs (

          admin_id, user_id, notification_type, recipient_phone, recipient_name,

          message_original, message_sent, status, metadata, created_at, sent_at

        ) VALUES (

          ${adminId}, ${notification.user_id}, ${notification.notification_type},

          ${notification.recipient_phone}, ${notification.recipient_name},

          ${notification.message_template}, ${finalMessage}, ${sent ? 'sent' : 'failed'},

          ${JSON.stringify({ 

            original_notification_id: notification.id, 

            resent: true, 

            resent_at: new Date().toISOString(),

            validated_phone: sendResult.validatedPhone,

            original_phone: sendResult.originalPhone 

          })}::jsonb, NOW(), NOW()

        )

      `);

      

      res.json({ 

        success: sent, 

        message: sent ? 'Notificação reenviada com sucesso' : 'Falha ao reenviar',

        finalMessage,

        debug: {

          originalPhone: sendResult.originalPhone,

          validatedPhone: sendResult.validatedPhone,

          error: sendResult.error

        }

      });

    } catch (error) {

      console.error("Error resending notification:", error);

      res.status(500).json({ message: "Failed to resend notification" });

    }

  });



  // PROCESSAR FILA DE NOTIFICAÇÕES AGENDADAS - COM SISTEMA DE DELAY ANTI-BAN

  app.post("/api/admin/notifications/process-queue", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      

      // Verificar conexão WhatsApp

      const adminConnection = await db.execute(sql`

        SELECT * FROM admin_whatsapp_connection WHERE admin_id = ${adminId} AND is_connected = true

      `);

      if (!adminConnection.rows?.length) {

        return res.status(400).json({ message: "WhatsApp do admin não está conectado" });

      }

      

      // Buscar notificações pendentes para enviar agora

      const pendingResult = await db.execute(sql`

        SELECT * FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        AND status = 'pending'

        AND scheduled_for <= NOW()

        ORDER BY scheduled_for ASC

        LIMIT 50

      `);

      

      const pendingNotifications = pendingResult.rows as any[];

      if (pendingNotifications.length === 0) {

        return res.json({ success: true, message: "Nenhuma notificação para processar", processed: 0 });

      }

      

      // Obter configuração para delays

      const config = await storage.getAdminNotificationConfig?.(adminId);

      const minDelay = config?.broadcastMinIntervalSeconds || 10;

      const maxDelay = config?.broadcastMaxIntervalSeconds || 20;

      const batchSize = 10; // A cada 10 mensagens, pausa maior

      const batchPauseSeconds = 60; // Pausa de 60 segundos a cada lote

      

      console.log(`[QUEUE] Iniciando processamento de ${pendingNotifications.length} notificações`);

      

      // Retornar imediatamente - processar em background

      res.json({ 

        success: true, 

        message: `Processando ${pendingNotifications.length} notificações em fila`,

        total: pendingNotifications.length,

        batchSize,

        minDelay,

        maxDelay

      });

      

      // Processar em background

      (async () => {

        let processed = 0;

        let failed = 0;

        

        for (let i = 0; i < pendingNotifications.length; i++) {

          const notification = pendingNotifications[i];

          

          try {

            // Buscar histórico de conversa

            const historyResult = await db.execute(sql`

              SELECT am.text, am.from_me

              FROM admin_messages am

              INNER JOIN admin_conversations ac ON am.conversation_id = ac.id

              WHERE ac.admin_id = ${adminId}

              AND (ac.contact_number LIKE ${'%' + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + '%'})

              ORDER BY am.timestamp DESC

              LIMIT 10

            `);

            

            const conversationHistory = (historyResult.rows as any[]).reverse().map(msg => 

              `${msg.from_me ? 'Você' : 'Cliente'}: ${msg.text}`

            ).join('\n');

            

            // Preparar mensagem com variáveis

            const metadata = typeof notification.metadata === 'string' ? JSON.parse(notification.metadata || '{}') : (notification.metadata || {});

            let finalMessage = notification.message_template

              .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')

              .replace(/{dias_restantes}/g, metadata.daysBefore || '')

              .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')

              .replace(/{data_vencimento}/g, metadata.dueDate ? 

                new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')

              .replace(/{valor}/g, metadata.valor || '');

            

            // VARIAÇÃO IA OBRIGATÓRIA se ativada

            if (notification.ai_enabled) {

              try {

                const { callGroq } = await import("./llm");

                

                let systemPrompt = notification.ai_prompt || config?.aiVariationPrompt || 

                  'Reescreva esta mensagem de forma natural e personalizada.';

                

                // Adicionar contexto do cliente

                systemPrompt += `\n\nO nome do cliente é: ${notification.recipient_name || 'Cliente'}`;

                

                if (conversationHistory) {

                  systemPrompt += `\n\nHISTÓRICO DA CONVERSA COM ESTE CLIENTE:\n---\n${conversationHistory}\n---\n\nUse este contexto para personalizar a mensagem.`;

                }

                

                systemPrompt += '\n\nIMPORTANTE: Retorne APENAS a mensagem reescrita, sem explicações ou aspas.';

                

                // ? CORRIGIDO: Usar array de ChatMessage

                const variedMessage = await callGroq(

                  [

                    { role: 'system', content: systemPrompt },

                    { role: 'user', content: finalMessage }

                  ],

                  { temperature: 0.8, maxTokens: 500 }

                );

                

                // ? PROTEÇÃO: Verificar se retornou mensagem válida

                const trimmedVaried = variedMessage.trim();

                if (trimmedVaried && trimmedVaried.length > 10 && !trimmedVaried.includes('Como posso ajudar')) {

                  finalMessage = trimmedVaried;

                  console.log(`[QUEUE] ? IA variou mensagem para ${notification.recipient_name}`);

                } else {

                  console.log(`[QUEUE] ?? IA retornou inválido, usando original para ${notification.recipient_name}`);

                }

              } catch (aiError) {

                console.error(`[QUEUE] ? Erro IA para ${notification.recipient_name}:`, aiError);

                // Se IA falhar e é obrigatória, não enviar sem variação

                if (config?.aiVariationEnabled) {

                  console.log(`[QUEUE] Pulando ${notification.recipient_name} - IA obrigatória falhou`);

                  failed++;

                  await db.execute(sql`

                    UPDATE scheduled_notifications 

                    SET status = 'failed', error_message = 'Falha na variação IA obrigatória'

                    WHERE id = ${notification.id}

                  `);

                  continue;

                }

              }

            }

            

            // Enviar mensagem

            const { sendAdminNotification } = await import("./whatsapp");

            const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);

            const sent = sendResult.success;

            

            if (sent) {

              processed++;

              console.log(`[QUEUE] ? Enviado para ${notification.recipient_name} (${processed}/${pendingNotifications.length})`);

            } else {

              failed++;

              console.log(`[QUEUE] ? Falha ao enviar para ${notification.recipient_name}: ${sendResult.error || 'Erro desconhecido'}`);

            }

            

            // Atualizar status

            await db.execute(sql`

              UPDATE scheduled_notifications 

              SET 

                status = ${sent ? 'sent' : 'failed'},

                sent_at = NOW(),

                final_message = ${finalMessage},

                conversation_context = ${conversationHistory || ''},

                error_message = ${sent ? null : (sendResult.error || 'Falha ao enviar')}

              WHERE id = ${notification.id}

            `);

            

            // Registrar log

            await db.execute(sql`

              INSERT INTO admin_notification_logs (

                admin_id, user_id, notification_type, recipient_phone, recipient_name,

                message_original, message_sent, status, metadata, created_at, sent_at

              ) VALUES (

                ${adminId}, ${notification.user_id}, ${notification.notification_type},

                ${notification.recipient_phone}, ${notification.recipient_name},

                ${notification.message_template}, ${finalMessage}, ${sent ? 'sent' : 'failed'},

                ${notification.metadata}::jsonb, NOW(), NOW()

              )

            `);

            

            // DELAY ENTRE MENSAGENS (anti-ban)

            const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;

            

            // Pausa maior a cada lote de 10

            if ((i + 1) % batchSize === 0 && i + 1 < pendingNotifications.length) {

              console.log(`[QUEUE] Pausa de ${batchPauseSeconds}s após lote de ${batchSize} mensagens...`);

              await new Promise(resolve => setTimeout(resolve, batchPauseSeconds * 1000));

            } else if (i + 1 < pendingNotifications.length) {

              console.log(`[QUEUE] Aguardando ${delay}s antes da próxima mensagem...`);

              await new Promise(resolve => setTimeout(resolve, delay * 1000));

            }

            

          } catch (error) {

            console.error(`[QUEUE] Erro processando ${notification.recipient_name}:`, error);

            failed++;

            await db.execute(sql`

              UPDATE scheduled_notifications 

              SET status = 'failed', error_message = ${String(error)}

              WHERE id = ${notification.id}

            `);

          }

        }

        

        console.log(`[QUEUE] Processamento concluído: ${processed} enviados, ${failed} falhas`);

      })();

      

    } catch (error) {

      console.error("Error processing notification queue:", error);

      res.status(500).json({ message: "Failed to process queue" });

    }

  });



  // OBTER STATUS DA FILA DE NOTIFICAÇÕES

  app.get("/api/admin/notifications/queue-status", isAdmin, async (req: any, res) => {

    try {

      const adminId = (req.session as any)?.adminId;

      

      const result = await db.execute(sql`

        SELECT 

          status,

          notification_type,

          COUNT(*) as count

        FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        GROUP BY status, notification_type

      `);

      

      const pendingTodayResult = await db.execute(sql`

        SELECT COUNT(*) as count 

        FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        AND status = 'pending'

        AND scheduled_for <= NOW()

      `);

      

      const nextInQueueResult = await db.execute(sql`

        SELECT * FROM scheduled_notifications

        WHERE admin_id = ${adminId}

        AND status = 'pending'

        ORDER BY scheduled_for ASC

        LIMIT 5

      `);

      

      res.json({

        breakdown: result.rows,

        pendingNow: Number((pendingTodayResult.rows?.[0] as any)?.count || 0),

        nextInQueue: nextInQueueResult.rows

      });

    } catch (error) {

      console.error("Error getting queue status:", error);

      res.status(500).json({ message: "Failed to get queue status" });

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

          

          // ?? Callback de progresso para atualizar campanha em tempo real

          const onProgress = async (currentSent: number, currentFailed: number) => {

            try {

              await storage.updateCampaign?.(userId, campaignId, {

                totalSent: currentSent,

                totalFailed: currentFailed,

                status: 'running',

              });

              console.log(`[BULK SEND PROGRESS] Campanha ${campaignId}: ${currentSent} enviados, ${currentFailed} falhas`);

            } catch (e) {

              console.error('[BULK SEND PROGRESS] Erro ao atualizar campanha:', e);

            }

          };

          

          const result = await sendBulkMessagesAdvanced(userId, contactsWithNames, message, {

            delayMin: delayMin * 1000,

            delayMax: delayMax * 1000,

            useAI,

            onProgress,

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



  // Envio em massa COM MÍDIA (imagem, vídeo, áudio, documento)

  app.post("/api/whatsapp/bulk-send-media", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { phones, message, contacts, media, settings } = req.body;



      if (!phones || !Array.isArray(phones) || phones.length === 0) {

        return res.status(400).json({ message: "Lista de telefones é obrigatória" });

      }



      if (!media || !media.type || !media.data) {

        return res.status(400).json({ message: "Mídia é obrigatória (type e data)" });

      }



      // Validar tipo de mídia

      const validTypes = ['audio', 'image', 'video', 'document'];

      if (!validTypes.includes(media.type)) {

        return res.status(400).json({ message: `Tipo de mídia inválido: ${media.type}. Use: ${validTypes.join(', ')}` });

      }



      // Verificar conexão WhatsApp

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || !connection.isConnected) {

        return res.status(400).json({ message: "WhatsApp não está conectado" });

      }



      // Importar função de envio com mídia

      const { sendBulkMediaMessages } = await import("./whatsapp");



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



      console.log(`[BULK MEDIA SEND] Iniciando envio de ${media.type} para ${contactsWithNames.length} números`);



      // Configurações de delay (mais conservador para mídia)

      const delayMin = settings?.delayMin || 8;

      const delayMax = settings?.delayMax || 20;



      // Criar campanha com status "running"

      const campaignName = `Mídia ${media.type} ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;

      const campaignId = `campaign_media_${Date.now()}`;



      await storage.createCampaign?.({

        id: campaignId,

        userId,

        name: campaignName,

        message: message || `[${media.type.toUpperCase()}]`,

        recipients: contactsWithNames.map(c => c.phone),

        recipientNames: contactsWithNames.reduce((acc, c) => ({ ...acc, [c.phone]: c.name }), {}),

        status: 'running',

        totalSent: 0,

        totalFailed: 0,

        executedAt: new Date(),

        createdAt: new Date(),

        delayProfile: 'conservador', // Mídia sempre conservador

        mediaType: media.type,

      });



      // Responder imediatamente

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

        message: `Envio de ${media.type} iniciado em background.`

      });



      // Executar em background

      setImmediate(async () => {

        try {

          console.log(`[BULK MEDIA SEND BACKGROUND] Executando campanha ${campaignId}`);



          const onProgress = async (currentSent: number, currentFailed: number) => {

            try {

              await storage.updateCampaign?.(userId, campaignId, {

                totalSent: currentSent,

                totalFailed: currentFailed,

                status: 'running',

              });

            } catch (e) {

              console.error('[BULK MEDIA SEND PROGRESS] Erro:', e);

            }

          };



          const result = await sendBulkMediaMessages(userId, contactsWithNames, message || '', {

            type: media.type,

            data: media.data,

            mimetype: media.mimetype,

            filename: media.filename,

            caption: message,

            ptt: media.ptt,

          }, {

            delayMin: delayMin * 1000,

            delayMax: delayMax * 1000,

            onProgress,

          });



          await storage.updateCampaign?.(userId, campaignId, {

            status: 'completed',

            totalSent: result.sent,

            totalFailed: result.failed,

            results: result.details,

            completedAt: new Date(),

          });



          console.log(`[BULK MEDIA SEND BACKGROUND] Campanha ${campaignId} concluída: ${result.sent} enviados, ${result.failed} falharam`);

        } catch (error: any) {

          console.error(`[BULK MEDIA SEND BACKGROUND] Erro na campanha ${campaignId}:`, error);

          await storage.updateCampaign?.(userId, campaignId, {

            status: 'error',

            errorMessage: error.message,

          });

        }

      });

    } catch (error: any) {

      console.error("Error in bulk media send:", error);

      res.status(500).json({ message: error.message || "Falha no envio de mídia em massa" });

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



  // ============================================

  // ?? SINCRONIZAÇÃO DE CONTATOS EM BACKGROUND

  // Sistema de fila que processa gradualmente

  // REGRA: Somente clientes que já conversaram

  // ============================================



  // Iniciar sincronização em background (fila gradual)

  app.post("/api/contacts/sync", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verificar conexão WhatsApp

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(400).json({ 

          message: "Nenhuma conexão WhatsApp encontrada. Configure seu WhatsApp primeiro." 

        });

      }



      // Iniciar sincronização em background (não bloqueia)

      const result = await startBackgroundSync(userId, connection.id);

      

      res.json({ 

        success: result.status !== 'error',

        message: result.message,

        status: result.status,

      });

    } catch (error) {

      console.error("Error starting sync:", error);

      res.status(500).json({ message: "Erro ao iniciar sincronização" });

    }

  });



  // Verificar status da sincronização

  app.get("/api/contacts/sync/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const status = getSyncStatus(userId);

      

      res.json(status);

    } catch (error) {

      console.error("Error getting sync status:", error);

      res.status(500).json({ message: "Erro ao verificar status" });

    }

  });



  // Buscar contatos sincronizados - DIRETO DO BANCO DE DADOS

  // Não processa nada em tempo real, apenas retorna dados do banco

  // REGRA: Somente clientes que já conversaram (hasResponded = true)

  app.get("/api/contacts/synced", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const returnAsArray = req.query.array === 'true' || req.query.format === 'array';

      

      // Buscar conexão do usuário

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.json(returnAsArray ? [] : { contacts: [], total: 0 });

      }



      // Verificar se já tem contatos sincronizados no banco

      const hasSynced = await hasSyncedBefore(connection.id);

      

      // Se não tem contatos sincronizados, iniciar sincronização em background automaticamente

      if (!hasSynced && connection.isConnected) {

        console.log(`[SYNCED CONTACTS] Iniciando primeira sincronização para ${connection.id}`);

        await startBackgroundSync(userId, connection.id);

      }



      // Buscar contatos DIRETO DO BANCO (rápido, sem processar)

      const { contacts, total } = await getSyncedContactsFromDB(connection.id);

      

      // Se pediu array (para Envio em Massa), retorna só o array

      if (returnAsArray) {

        console.log(`[SYNCED CONTACTS] Retornando ${total} contatos como array`);

        return res.json(contacts);

      }

      

      // Pegar status da sincronização para informar o frontend

      const syncStatus = getSyncStatus(userId);

      

      console.log(`[SYNCED CONTACTS] Retornando ${total} contatos do banco (sync status: ${syncStatus.status})`);

      

      // Retornar com metadados de sincronização

      res.json({

        contacts,

        total,

        syncStatus: {

          status: syncStatus.status,

          progress: syncStatus.progress,

          message: syncStatus.status === 'running' 

            ? `Sincronizando... ${syncStatus.progress}%` 

            : syncStatus.status === 'completed'

            ? 'Sincronização concluída'

            : syncStatus.status === 'error'

            ? `Erro: ${syncStatus.error}`

            : 'Aguardando sincronização',

        },

      });

    } catch (error) {

      console.error("Error fetching synced contacts:", error);

      res.status(500).json({ message: "Failed to fetch synced contacts" });

    }

  });



  // ===== AGENDA LIVE - CONTATOS EM MEMÓRIA (SEM BANCO DE DADOS) =====

  // Retorna contatos da agenda que estão em cache na memória

  // Não acessa banco de dados, economiza Egress e Disk IO do Supabase

  // Cache expira em 2 HORAS - ideal para envio em massa sob demanda

  app.get("/api/contacts/agenda-live", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { getAgendaContacts, syncAgendaFromSessionCache, getSession } = await import("./whatsapp");

      

      // Buscar do cache em memória

      let cached = getAgendaContacts(userId);

      

      // Se não tem cache, tentar popular do cache da sessão

      if (!cached) {

        const session = getSession(userId);

        if (session) {

          const syncResult = syncAgendaFromSessionCache(userId);

          if (syncResult.count > 0) {

            // Recarregar cache após popular

            cached = getAgendaContacts(userId);

          }

        }

      }

      

      if (!cached) {

        // Não tem cache e não tem sessão

        return res.json({

          status: 'not_synced',

          contacts: [],

          total: 0,

          message: '?? Clique em "Sincronizar Agenda" para carregar seus contatos do WhatsApp.',

        });

      }

      

      if (cached.status === 'syncing') {

        return res.json({

          status: 'syncing',

          contacts: [],

          total: 0,

          message: '? Sincronizando agenda do WhatsApp... Aguarde alguns segundos.',

        });

      }

      

      if (cached.status === 'error') {

        return res.json({

          status: 'error',

          contacts: [],

          total: 0,

          message: `? Erro na sincronização: ${cached.error}`,

        });

      }

      

      // Status ready - retornar contatos

      const contacts = cached.contacts || [];

      const expiresIn = Math.max(0, Math.floor((cached.expiresAt.getTime() - Date.now()) / 1000 / 60));

      

      console.log(`?? [AGENDA LIVE] Retornando ${contacts.length} contatos do cache para user ${userId} (expira em ${expiresIn}min)`);

      

      res.json({

        status: 'ready',

        contacts,

        total: contacts.length,

        syncedAt: cached.syncedAt,

        expiresIn: `${expiresIn} minutos`,

        message: `? ${contacts.length} contatos carregados da agenda`,

      });

    } catch (error) {

      console.error("Error fetching agenda contacts:", error);

      res.status(500).json({ 

        status: 'error',

        contacts: [],

        total: 0,

        message: "? Erro ao buscar contatos da agenda" 

      });

    }

  });



  // Forçar ressincronização da agenda (busca do cache da sessão ou aguarda evento)

  app.post("/api/contacts/agenda-live/refresh", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { syncAgendaFromSessionCache, getSession } = await import("./whatsapp");

      

      // Verificar se tem sessão ativa

      const session = getSession(userId);

      if (!session) {

        return res.status(400).json({

          success: false,

          message: '? WhatsApp não está conectado. Conecte primeiro para sincronizar a agenda.',

        });

      }

      

      // Tentar popular do cache da sessão

      const result = syncAgendaFromSessionCache(userId);

      

      console.log(`?? [AGENDA REFRESH] Usuário ${userId}: ${result.message}`);

      

      res.json({

        success: result.success,

        count: result.count,

        message: result.message,

      });

    } catch (error) {

      console.error("Error refreshing agenda:", error);

      res.status(500).json({ 

        success: false,

        message: "? Erro ao solicitar atualização da agenda" 

      });

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



  // Atualizar uma lista (nome/descrição)

  app.put("/api/contacts/lists/:listId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { listId } = req.params;

      const { name, description } = req.body;



      if (!name || typeof name !== "string") {

        return res.status(400).json({ message: "Nome da lista é obrigatório" });

      }



      const result = await storage.updateContactList?.(userId, listId, { name, description });

      if (!result) {

        return res.status(404).json({ message: "Lista não encontrada" });

      }

      res.json(result);

    } catch (error) {

      console.error("Error updating contact list:", error);

      res.status(500).json({ message: "Failed to update contact list" });

    }

  });



  // Excluir uma lista

  app.delete("/api/contacts/lists/:listId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { listId } = req.params;



      await storage.deleteContactList?.(userId, listId);

      res.json({ success: true, message: "Lista excluída com sucesso" });

    } catch (error) {

      console.error("Error deleting contact list:", error);

      res.status(500).json({ message: "Failed to delete contact list" });

    }

  });



  // Remover um contato de uma lista

  app.delete("/api/contacts/lists/:listId/contacts/:phone", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { listId, phone } = req.params;



      const result = await storage.removeContactFromList?.(userId, listId, phone);

      if (!result?.success) {

        return res.status(404).json({ message: result?.message || "Erro ao remover contato" });

      }

      res.json(result);

    } catch (error) {

      console.error("Error removing contact from list:", error);

      res.status(500).json({ message: "Failed to remove contact from list" });

    }

  });



  // ============================================

  // ?? SINCRONIZAÇÃO COMPLETA DE CONTATOS

  // Sistema de fila assíncrona global

  // Sincroniza TODOS os contatos (WhatsApp + Conversas)

  // ============================================



  // ======================================================================

  // ?? SINCRONIZAÇÃO COMPLETA DE CONTATOS - FORÇA RECONEXÃO PARA BUSCAR TODOS

  // ======================================================================

  // Esta função FORÇA uma reconexão do WhatsApp para que o Baileys dispare

  // novamente o evento contacts.upsert com TODOS os 3000+ contatos.

  //

  // Segundo a documentação do Baileys:

  // - contacts.upsert envia TODOS os contatos na PRIMEIRA conexão

  // - Para forçar novo envio, precisa reconectar a sessão

  // - Ref: https://github.com/WhiskeySockets/Baileys/issues/266

  // ======================================================================

  app.post("/api/contacts/sync-agenda", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      console.log(`\n[SYNC AGENDA] ?? User ${userId} solicitou sincronização COMPLETA da agenda`);



      // Verificar conexão WhatsApp

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(400).json({

          success: false,

          message: "? Nenhuma conexão WhatsApp encontrada. Configure seu WhatsApp primeiro."

        });

      }



      if (!connection.isConnected) {

        return res.status(400).json({

          success: false,

          message: "? WhatsApp desconectado. Reconecte para sincronizar a agenda."

        });

      }



      // FORÇAR RECONEXÃO COMPLETA para buscar TODOS os contatos

      const { forceFullContactSync, getAgendaContacts } = await import("./whatsapp");



      console.log(`[SYNC AGENDA] ?? Iniciando sincronização COMPLETA (reconexão)...`);

      const syncResult = await forceFullContactSync(userId);



      if (!syncResult.success) {

        return res.status(400).json({

          success: false,

          message: syncResult.message

        });

      }



      // Contar contatos no cache após sync

      const agendaData = getAgendaContacts(userId);

      const cacheCount = agendaData?.contacts?.length || 0;



      // Contar contatos no banco de dados

      const dbContacts = await storage.getContactsByConnectionId(connection.id);

      console.log(`[SYNC AGENDA] ?? Contatos no cache: ${cacheCount} | No banco: ${dbContacts.length}`);



      res.json({

        success: true,

        message: `? ${Math.max(cacheCount, dbContacts.length)} contatos sincronizados!`,

        count: dbContacts.length,

        cacheCount: cacheCount,

        info: `Reconexão realizada! Contatos salvos no banco de dados.`

      });

    } catch (error) {

      console.error("[SYNC AGENDA] Erro:", error);

      res.status(500).json({

        success: false,

        message: "? Erro ao sincronizar contatos: " + (error instanceof Error ? error.message : 'Erro desconhecido')

      });

    }

  });



  // Iniciar sincronização COMPLETA (agenda WhatsApp + conversas)

  app.post("/api/contacts/full-sync", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { force } = req.body;  // force=true ignora rate limiting

      

      // Verificar conexão WhatsApp

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(400).json({ 

          success: false,

          message: "? Nenhuma conexão WhatsApp encontrada. Configure seu WhatsApp primeiro." 

        });

      }

      

      if (!connection.isConnected) {

        return res.status(400).json({ 

          success: false,

          message: "? WhatsApp desconectado. Reconecte para sincronizar contatos." 

        });

      }



      // Iniciar sincronização completa (fila assíncrona)

      const result = await startFullContactSync(userId, connection.id, force === true);

      

      res.json({ 

        success: result.status !== 'error' && result.status !== 'rate_limited',

        message: result.message,

        status: result.status,

        queuePosition: result.queuePosition,

      });

    } catch (error) {

      console.error("Error starting full sync:", error);

      res.status(500).json({ 

        success: false,

        message: "? Erro ao iniciar sincronização completa" 

      });

    }

  });



  // Verificar status da sincronização COMPLETA

  app.get("/api/contacts/full-sync/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.json({

          status: 'idle',

          message: 'Nenhuma conexão WhatsApp',

          progress: 0,

        });

      }



      const status = getFullSyncStatus(connection.id);

      

      // Formatar mensagem amigável

      let message = '';

      switch (status.status) {

        case 'idle':

          message = 'Aguardando sincronização';

          break;

        case 'queued':

          message = `Na fila (posição ${status.queuePosition})`;

          break;

        case 'running':

          message = `Sincronizando... ${status.progress}%`;

          break;

        case 'completed':

          message = `? Concluído! ${status.totalContacts} contatos`;

          break;

        case 'error':

          message = `? Erro: ${status.error}`;

          break;

      }

      

      res.json({

        ...status,

        message,

        lastSyncFormatted: status.lastSyncAt 

          ? new Date(status.lastSyncAt).toLocaleString('pt-BR')

          : null,

        nextAutoSyncFormatted: status.nextAutoSyncAt

          ? new Date(status.nextAutoSyncAt).toLocaleString('pt-BR')

          : null,

      });

    } catch (error) {

      console.error("Error getting full sync status:", error);

      res.status(500).json({ message: "Erro ao verificar status" });

    }

  });



  // Estatísticas da fila global (admin)

  app.get("/api/contacts/full-sync/queue-stats", isAuthenticated, async (req: any, res) => {

    try {

      const stats = getQueueStats();

      res.json(stats);

    } catch (error) {

      console.error("Error getting queue stats:", error);

      res.status(500).json({ message: "Erro ao buscar estatísticas da fila" });

    }

  });



  // Forçar sincronização de TODOS os clientes (admin only)

  app.post("/api/admin/contacts/sync-all-clients", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verificar se é admin

      const user = await storage.getUser(userId);

      if (!user || !user.isAdmin) {

        return res.status(403).json({ message: "Apenas administradores podem executar esta ação" });

      }

      

      console.log(`[ADMIN] ?? Admin ${userId} iniciou sincronização de todos os clientes`);

      

      const result = await scheduleFullSyncForAllClients();

      

      res.json({

        success: true,

        message: `? Sincronização agendada para ${result.scheduled} clientes (${result.skipped} pulados, ${result.errors} erros)`,

        ...result,

      });

    } catch (error) {

      console.error("Error scheduling sync for all clients:", error);

      res.status(500).json({ message: "Erro ao agendar sincronização" });

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

  // ?? ROTA DE TESTE: Enviar áudio diretamente via Baileys

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



      console.log(`\n?? [DEBUG] Teste de envio de áudio`);

      console.log(`?? audioUrl: ${audioUrl}`);

      console.log(`?? jid: ${jid}`);

      console.log(`?? isPtt: ${isPtt}`);

      console.log(`?? synthetic: ${synthetic}`);



      let audioBuffer: Buffer;



      if (synthetic) {

        console.log(`?? Gerando áudio WAV sintético (beep)...`);

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



      console.log(`?? Audio buffer size: ${audioBuffer.length} bytes`);



      // Validar buffer

      const { validateAudioBuffer } = await import("./mediaService");

      const mime = mimetype || (synthetic ? 'audio/wav' : 'audio/ogg');

      const validation = await validateAudioBuffer(audioBuffer, mime);



      console.log(`?? Audio validation result:`, validation);



      // Enviar áudio

      const messageContent = {

        audio: audioBuffer,

        mimetype: mime,

        ptt: isPtt,

      };



      console.log(`?? Enviando áudio (PTT: ${messageContent.ptt})...`);



      // ??? ANTI-BLOQUEIO: Usar executeWithDelay para garantir try/finally

      const result = await messageQueueService.executeWithDelay(userId, 'debug envio áudio', async () => {

        return await session.socket.sendMessage(jid, messageContent);

      });



      if (result?.key?.id) {

        console.log(`? Audio sent! MessageId: ${result.key.id}`);

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

        console.log(`? Baileys não retornou MessageId:`, result);

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



      const { getLLMClient } = await import("./llm");

      const mistral = await getLLMClient();



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



      console.log(`?? [MODEL-TEST] Testando ${model} com: "${message.substring(0, 50)}..."`);



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

          console.error("? [MODEL-TEST] Erro Z.AI:", error);

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



  // POST - Testar DELIVERY (SEM autenticação para desenvolvimento local)

  app.post("/api/dev/delivery/test", async (req: any, res) => {

    try {

      const { userId, message, history } = req.body;

      

      if (!userId || !message) {

        return res.status(400).json({ message: "userId and message are required" });

      }



      console.log(`?? [DEV] Testando delivery para user ${userId}: ${message.substring(0, 50)}`);

      

      // Converter histórico

      const conversationHistory = history?.map((msg: any, idx: number) => ({

        id: `test-${idx}`,

        chatId: "test",

        text: msg.content,

        fromMe: msg.role === "assistant",

        timestamp: new Date(Date.now() - (history.length - idx) * 60000),

        isFromAgent: msg.role === "assistant",

      })) || [];

      

      // Usar testAgentResponse diretamente

      const testResult = await testAgentResponse(

        userId, 

        message, 

        undefined,

        conversationHistory,

        undefined,

        "Teste"

      );

      

      res.json({ 

        response: testResult.response,

        intent: testResult.intent,

        mediaActions: testResult.mediaActions || []

      });

    } catch (error: any) {

      console.error("? [DEV] Erro no teste delivery:", error);

      res.status(500).json({ message: error.message || "Erro interno" });

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

      

      console.log(`?? [DEBUG] Buscando usuário por telefone: ${cleanPhone}`);

      

      // Buscar em users

      const users = await storage.getAllUsers();

      console.log(`?? [DEBUG] Total de usuários: ${users.length}`);

      

      const userByPhone = users.find(u => u.phone?.replace(/\D/g, "") === cleanPhone);

      console.log(`?? [DEBUG] Usuário por phone: ${userByPhone ? userByPhone.email : 'não encontrado'}`);

      

      // Buscar em whatsapp_connections

      const connections = await storage.getAllConnections();

      console.log(`?? [DEBUG] Total de conexões: ${connections.length}`);

      

      // Debug: mostrar as primeiras conexões para ver o formato

      const sampleConnections = connections.slice(0, 3).map(c => ({

        id: c.id,

        userId: c.userId,

        phoneNumber: c.phoneNumber,

        // Tentar acessar como snake_case também

        phone_number_alt: (c as any).phone_number

      }));

      console.log(`?? [DEBUG] Sample connections:`, JSON.stringify(sampleConnections));

      

      const connection = connections.find(c => {

        const connPhone = c.phoneNumber?.replace(/\D/g, "") || "";

        console.log(`?? [DEBUG] Comparando: ${connPhone} === ${cleanPhone}`);

        return connPhone === cleanPhone;

      });

      console.log(`?? [DEBUG] Conexão por phoneNumber: ${connection ? connection.userId : 'não encontrada'}`);

      

      let userByConnection = null;

      if (connection) {

        userByConnection = users.find(u => u.id === connection.userId);

        console.log(`?? [DEBUG] Usuário por conexão: ${userByConnection ? userByConnection.email : 'não encontrado'}`);

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

        

        // Se o bucket não existir, tentar criar (apenas se ainda não verificamos)

        if (uploadError.message?.includes('Bucket not found') && !agentMediaBucketChecked) {

          const { error: createError } = await supabase.storage.createBucket('agent-media', {

            public: true,

            fileSizeLimit: 52428800

          });

          

          agentMediaBucketChecked = true;

          

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

      // ??? MODO DESENVOLVIMENTO: Bloquear pairing code para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando geração de pairing code (proteção de produção)`);

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

      // -----------------------------------------------------------------------
      // ?? FIX: Verificar se já está conectado antes de gerar novo código
      // -----------------------------------------------------------------------
      const existingConnection = await storage.getConnectionByUserId(userId);
      if (existingConnection?.isConnected === true) {
        console.log(`[PAIRING] Usuário ${userId} já está conectado, bloqueando novo código`);
        return res.status(409).json({
          success: false,
          message: "WhatsApp já está conectado. Desconecte antes de gerar um novo código.",
          alreadyConnected: true
        });
      }

      const { requestClientPairingCode } = await import("./whatsapp");

      const code = await requestClientPairingCode(userId, phoneNumber);



      if (!code) {

        // Retornar 503 (Service Unavailable) em vez de 500 genérico
        return res.status(503).json({

          success: false,

          message: "Não foi possível abrir conexão com o WhatsApp para gerar o código agora. Tente novamente em alguns segundos ou use QR Code."

        });

      }



      res.json({ success: true, code });

    } catch (error: any) {

      console.error("Error generating pairing code:", error);

      // Verificar se é erro de WebSocket/conexão
      const errorMessage = error?.message || "";

      if (errorMessage.includes("Timeout") || errorMessage.includes("WebSocket") || errorMessage.includes("conexão")) {

        return res.status(503).json({

          success: false,

          message: "Não foi possível estabelecer conexão com o WhatsApp. Tente novamente em alguns segundos ou use QR Code."

        });

      }

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



      const { generateWithLLM } = await import("./llm");

      

      const systemPrompt = `Você é um assistente que cria mensagens prontas para atendimento ao cliente.

Crie uma mensagem profissional, amigável e concisa baseada na descrição do usuário.

Responda APENAS com a mensagem pronta, sem explicações adicionais.

A mensagem deve ser adequada para WhatsApp (informal mas profissional).`;



      const result = await generateWithLLM(systemPrompt, prompt);

      

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



      const { generateWithLLM } = await import("./llm");

      

      const systemPrompt = `Você é um assistente que cria mensagens prontas para atendimento ao cliente.

Crie uma mensagem profissional, amigável e concisa baseada no título fornecido.

Responda APENAS com a mensagem pronta, sem explicações adicionais.

A mensagem deve ser adequada para WhatsApp (informal mas profissional).`;



      const result = await generateWithLLM(systemPrompt, `Crie uma mensagem de: ${title}`);



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



      const { generateWithLLM } = await import("./llm");

      

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



      const result = await generateWithLLM(systemPrompt, prompt);



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



      // ?? Verificar se usuário está suspenso - bloquear envio de mídia

      const suspensionStatus = await storage.isUserSuspended(userId);

      if (suspensionStatus.suspended) {

        console.log(`?? [SUSPENSION] Bloqueando envio de mídia para usuário suspenso: ${userId}`);

        return res.status(403).json({ 

          success: false, 

          message: 'Sua conta está suspensa. Não é possível enviar mídia.',

          suspended: true,

          reason: suspensionStatus.data?.reason

        });

      }



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

        console.log(`[send-media-base64] ?? Audio detected, converting to OGG/Opus...`);

        const { convertToWhatsAppAudio } = await import("./audioConverter");

        const converted = await convertToWhatsAppAudio(fileData, mimeType || 'audio/mpeg');

        finalFileData = converted.data;

        finalMimeType = converted.mimeType;

        console.log(`[send-media-base64] ? Audio converted to: ${converted.mimeType}`);

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



      console.log('[send-audio] ?? Request received for conversation:', id);

      console.log('[send-audio] ?? Data size:', audioData?.length || 0, 'chars, mimeType:', mimeType, 'duration:', duration);



      if (!audioData) {

        console.log('[send-audio] ? No audio data provided');

        return res.status(400).json({ message: "Audio data is required" });

      }



      // Converter áudio para OGG/Opus se necessário (WhatsApp requer este formato para PTT)

      const { convertToWhatsAppAudio } = await import("./audioConverter");

      const converted = await convertToWhatsAppAudio(audioData, mimeType || 'audio/webm');

      console.log('[send-audio] ?? Converted audio mimeType:', converted.mimeType);



      // Verificar propriedade da conversa

      const conversation = await storage.getConversation(id);

      if (!conversation) {

        console.log('[send-audio] ? Conversation not found:', id);

        return res.status(404).json({ message: "Conversation not found" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        console.log('[send-audio] ? Forbidden - connection mismatch');

        return res.status(403).json({ message: "Forbidden" });

      }



      // Usar áudio convertido (já processado acima)

      console.log('[send-audio] ?? Sending converted audio, mimeType:', converted.mimeType);



      // Enviar via WhatsApp

      const { sendUserMediaMessage } = await import("./whatsapp");

      await sendUserMediaMessage(userId, id, {

        type: 'audio',

        data: converted.data,

        mimetype: converted.mimeType,

        ptt: true, // Push to talk (nota de voz)

        seconds: duration || 0,

      });



      console.log('[send-audio] ? Audio sent successfully!');

      res.json({ success: true });

    } catch (error: any) {

      console.error("[send-audio] ? Error sending user audio:", error);

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



      const { generateWithLLM } = await import("./llm");

      

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



      const result = await generateWithLLM(systemPrompt, prompt);



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



------------------------------------------------------------------

                    SOBRE A AGENTEZAP

------------------------------------------------------------------



A AgenteZap é uma plataforma de automação de WhatsApp com Inteligência Artificial que permite:

- Criar agentes de IA personalizados que atendem clientes 24/7

- Automatizar respostas no WhatsApp com IA conversacional

- Configurar instruções personalizadas para cada negócio

- Integrar com o WhatsApp do cliente via QR Code ou código de pareamento



------------------------------------------------------------------

                    PLANOS E PREÇOS

------------------------------------------------------------------



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



------------------------------------------------------------------

                    FUNCIONALIDADES DO SISTEMA

------------------------------------------------------------------



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



------------------------------------------------------------------

                    COMO VOCÊ DEVE ATENDER

------------------------------------------------------------------



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



------------------------------------------------------------------

                    FLUXO DE ATENDIMENTO

------------------------------------------------------------------



NOVO CLIENTE (sem conta):

1. Cumprimentar: "Oi! Aqui é o Rodrigo da AgenteZap ??"

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



------------------------------------------------------------------

                    INFORMAÇÕES TÉCNICAS

------------------------------------------------------------------



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

      // ??? MODO DESENVOLVIMENTO: Bloquear pairing code para proteger produção

      if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {

        console.log(`?? [DEV MODE] Bloqueando geração de pairing code (proteção de produção)`);

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

      // -----------------------------------------------------------------------
      // ?? VALIDAÇÃO DE NÚMERO: Formato E.164 (apenas dígitos, com DDI)
      // -----------------------------------------------------------------------
      // O WhatsApp exige formato internacional para pairing code.
      // Brasil: 55 + DDD (2 dígitos) + número (8-9 dígitos) = 12-13 dígitos
      // Aceitamos 10-15 dígitos para compatibilidade internacional.
      // -----------------------------------------------------------------------
      const cleanPhone = String(phoneNumber).replace(/\D/g, ""); // Remover não-dígitos

      if (cleanPhone.length < 10 || cleanPhone.length > 15) {
        return res.status(400).json({
          success: false,
          message: "Número de telefone inválido. Use o formato: código do país (DDI) + DDD + número. Exemplo para Brasil: 5511999999999",
          hint: "Formato esperado: 55 + DDD + número (total de 12-13 dígitos para Brasil)"
        });
      }

      // Validação adicional para Brasil (se começar com 55)
      if (cleanPhone.startsWith("55") && cleanPhone.length < 12) {
        return res.status(400).json({
          success: false,
          message: "Número brasileiro incompleto. Use: 55 + DDD (2 dígitos) + número (8-9 dígitos). Exemplo: 5511999999999",
          hint: "Para Brasil: 55 (DDI) + 11 (DDD de São Paulo) + 999999999 (número)"
        });
      }

      // Log para debug (sem o número completo por privacidade)
      console.log(`[PAIRING VALIDATION] Número validado: ${cleanPhone.substring(0, 4)}****${cleanPhone.slice(-2)} (${cleanPhone.length} dígitos)`);

      // -----------------------------------------------------------------------
      // ?? FIX: Verificar se já está conectado antes de gerar novo código
      // -----------------------------------------------------------------------
      const existingConnection = await storage.getConnectionByUserId(userId);
      if (existingConnection?.isConnected === true) {
        console.log(`[PAIRING] Usuário ${userId} já está conectado, bloqueando novo código`);
        return res.status(409).json({
          success: false,
          message: "WhatsApp já está conectado. Desconecte antes de gerar um novo código.",
          alreadyConnected: true
        });
      }

      const { requestClientPairingCode } = await import("./whatsapp");

      const code = await requestClientPairingCode(userId, cleanPhone); // Usar número limpo



      if (!code) {

        // Retornar 503 (Service Unavailable) em vez de 500 genérico
        return res.status(503).json({

          success: false,

          message: "Não foi possível abrir conexão com o WhatsApp para gerar o código agora. Tente novamente em alguns segundos ou use QR Code."

        });

      }



      res.json({ success: true, code });

    } catch (error: any) {

      console.error("Error generating client pairing code:", error);

      // Verificar se é erro de WebSocket/conexão
      const errorMessage = error?.message || "";

      if (errorMessage.includes("Timeout") || errorMessage.includes("WebSocket") || errorMessage.includes("conexão")) {

        return res.status(503).json({

          success: false,

          message: "Não foi possível estabelecer conexão com o WhatsApp. Tente novamente em alguns segundos ou use QR Code."

        });

      }

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

    

    // ==================== TESTE DO KILL SWITCH ====================

    // Rota de debug para testar o bloqueio em cascata de clientes de revendedor

    app.get("/api/test/kill-switch/status", async (req, res) => {

      try {

        const resellerId = req.query.resellerId as string;

        

        let reseller;

        if (resellerId) {

          [reseller] = await db.select().from(resellers).where(eq(resellers.id, resellerId)).limit(1);

        } else {

          [reseller] = await db.select().from(resellers).limit(1);

        }

        

        if (!reseller) {

          return res.json({ error: "Nenhum reseller encontrado" });

        }

        

        const clients = await db.select()

          .from(resellerClients)

          .innerJoin(users, eq(resellerClients.userId, users.id))

          .where(eq(resellerClients.resellerId, reseller.id));

        

        res.json({

          reseller: {

            id: reseller.id,

            companyName: reseller.companyName,

            resellerStatus: reseller.resellerStatus,

            isActive: reseller.isActive,

          },

          clients: clients.map(c => ({

            clientId: c.reseller_clients.id,

            userId: c.users.id,

            email: c.users.email,

            status: c.reseller_clients.status,

            hasResellerId: !!c.users.resellerId,

            killSwitchActive: c.users.resellerId === reseller.id,

          })),

          killSwitchWouldBlock: reseller.resellerStatus === 'blocked',

        });

      } catch (error: any) {

        res.status(500).json({ error: error.message });

      }

    });

    

    // Bloquear/Desbloquear reseller para teste do Kill Switch

    app.post("/api/test/kill-switch/toggle", async (req, res) => {

      try {

        const { action, resellerId } = req.body; // 'block' or 'unblock', optional resellerId

        

        let reseller;

        if (resellerId) {

          [reseller] = await db.select().from(resellers).where(eq(resellers.id, resellerId)).limit(1);

        } else {

          [reseller] = await db.select().from(resellers).limit(1);

        }

        

        if (!reseller) {

          return res.json({ error: "Nenhum reseller encontrado" });

        }

        

        const newStatus = action === 'block' ? 'blocked' : 'active';

        

        await db.update(resellers)

          .set({ resellerStatus: newStatus, updatedAt: new Date() })

          .where(eq(resellers.id, reseller.id));

        

        console.log(`[KILL SWITCH TEST] Reseller ${reseller.id} ${newStatus === 'blocked' ? 'BLOQUEADO' : 'ATIVADO'}`);

        

        res.json({

          success: true,

          resellerId: reseller.id,

          previousStatus: reseller.resellerStatus,

          newStatus,

          message: newStatus === 'blocked' 

            ? '? Kill Switch ATIVADO - Clientes serão bloqueados'

            : '? Kill Switch DESATIVADO - Clientes podem acessar',

        });

      } catch (error: any) {

        res.status(500).json({ error: error.message });

      }

    });

    

    console.log("? [DEV] Rotas de teste habilitadas: /api/test/*");

    

    // Rota para simular verificação de Kill Switch para um usuário específico

    app.get("/api/test/kill-switch/verify/:userId", async (req, res) => {

      try {

        const { userId } = req.params;

        

        // Buscar usuário

        const user = await db.select().from(users).where(eq(users.id, userId)).limit(1);

        

        if (!user.length) {

          return res.json({ error: "Usuário não encontrado" });

        }

        

        const dbUser = user[0];

        

        if (!dbUser.resellerId) {

          return res.json({

            userId: dbUser.id,

            email: dbUser.email,

            hasReseller: false,

            wouldBlock: false,

            message: "Usuário não está vinculado a nenhum revendedor",

          });

        }

        

        // Buscar reseller

        const [reseller] = await db.select().from(resellers).where(eq(resellers.id, dbUser.resellerId)).limit(1);

        

        if (!reseller) {

          return res.json({

            userId: dbUser.id,

            email: dbUser.email,

            hasReseller: true,

            resellerId: dbUser.resellerId,

            wouldBlock: false,

            message: "Revendedor não encontrado no banco",

          });

        }

        

        const isBlocked = reseller.resellerStatus === 'blocked' || reseller.isActive === false;

        

        res.json({

          userId: dbUser.id,

          email: dbUser.email,

          hasReseller: true,

          reseller: {

            id: reseller.id,

            companyName: reseller.companyName,

            resellerStatus: reseller.resellerStatus,

            isActive: reseller.isActive,

          },

          wouldBlock: isBlocked,

          message: isBlocked 

            ? "? KILL SWITCH ATIVO - Este usuário seria BLOQUEADO ao tentar acessar"

            : "? Acesso permitido - Revendedor está ativo",

        });

      } catch (error: any) {

        res.status(500).json({ error: error.message });

      }

    });



    /**

     * Rota de teste para simular login como cliente de revenda

     * GET /api/test/simulate-login/:email

     */

    app.get("/api/test/simulate-login/:email", async (req: any, res) => {

      try {

        const { email } = req.params;

        

        const user = await db.select().from(users).where(eq(users.email, email)).limit(1);

        

        if (!user.length) {

          return res.status(404).json({ error: "Usuário não encontrado" });

        }

        

        const dbUser = user[0];

        

        // Definir sessão diretamente (express-session)

        req.session.userId = dbUser.id;

        req.session.user = {

          id: dbUser.id,

          email: dbUser.email,

          name: dbUser.name,

        };

        

        req.session.save((err: any) => {

          if (err) {

            return res.status(500).json({ error: "Erro ao criar sessão: " + err.message });

          }

          

          res.json({

            success: true,

            user: {

              id: dbUser.id,

              email: dbUser.email,

              name: dbUser.name,

              resellerId: dbUser.resellerId,

            },

            message: "Sessão criada! Agora você pode acessar rotas autenticadas.",

            redirectTo: dbUser.resellerId ? "/plans" : "/dashboard",

          });

        });

      } catch (error: any) {

        res.status(500).json({ error: error.message });

      }

    });

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

      const { getLLMClient } = await import("./llm");



      const { message, token, history, userId, sentMedias } = req.body;



      const result = await handleTestAgentMessage(

        { message, token, history, userId, sentMedias }, // ?? Passando sentMedias

        {

          getTestToken,

          getAgentConfig: (id) => storage.getAgentConfig(id),

          getMistralClient: getLLMClient,

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

   * Suporta: token de teste OU userId direto

   */

  app.get("/api/test-agent/info/:token", async (req: any, res) => {

    try {

      const { token } = req.params;

      

      // ?? FIX: Se o token parecer um userId (começa com test- ou tem formato UUID), buscar direto

      if (token.startsWith('test-') || token.match(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)) {

        // Buscar config do agente pelo userId

        const userConfig = await db

          .select({

            name: users.name,

            userId: users.id,

            prompt: aiAgentConfig.prompt,

          })

          .from(users)

          .leftJoin(aiAgentConfig, eq(aiAgentConfig.userId, users.id))

          .where(eq(users.id, token))

          .limit(1);

        

        if (userConfig.length > 0 && userConfig[0].userId) {

          // Extrair nome do agente do prompt se possível (ex: "Você é Maria, atendente...")

          const promptMatch = userConfig[0].prompt?.match(/Você é (\w+)/i);

          const agentName = promptMatch ? promptMatch[1] : "Agente";

          

          return res.json({

            agentName: agentName,

            company: userConfig[0].name || "Empresa",

            userId: userConfig[0].userId,

            description: `Agente de ${userConfig[0].name || "teste"}`,

          });

        }

      }

      

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

      

      console.log(`?? [ADMIN] Follow-up ${active ? 'ATIVADO' : 'DESATIVADO'} para conversa ${id}`);

      

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

      

      console.log(`??? [API] Solicitação de cancelamento para ID: ${id}, Phone: ${phone}`);



      if (!phone) {

        return res.status(400).json({ error: "phone query param required" });

      }

      

      const { followUpService } = await import("./followUpService");

      

      // Tentar cancelar como follow-up

      await followUpService.disableFollowUp(id, "Cancelado manualmente pelo calendário");

      

      console.log(`? [API] Cancelamento processado para ID: ${id}`);

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error cancelling event:", error);

      res.status(500).json({ error: error.message });

    }

  });



  // Rota de teste para configurar fluxo de mídia

  app.use((await import("./testMediaRoute")).default);



  // ====================================================================

  // ??? ROTA DE TESTE - TTS MULTI-PROVIDER (PÚBLICA)

  // ====================================================================

  app.post("/api/test-tts", async (req, res) => {

    try {

      const { text, provider, voice, speed } = req.body;



      if (!text) {

        return res.status(400).json({ error: "Texto é obrigatório" });

      }



      console.log(`??? [TEST-TTS] Gerando áudio: "${text.substring(0, 50)}..."`);

      console.log(`??? [TEST-TTS] Provider: ${provider || 'auto'}, Voice: ${voice || 'default'}`);



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



      console.log(`? [TEST-TTS] Áudio enviado: ${result.audio.length} bytes (${result.provider})`);

    } catch (error: any) {

      console.error("? [TEST-TTS] Erro:", error);

      res.status(500).json({ 

        error: "Erro ao gerar áudio",

        details: error.message 

      });

    }

  });



  // ==================== EXCLUSION LIST / LISTA DE EXCLUSÃO ====================



  /**

   * Obter configuração de exclusão do usuário

   * GET /api/exclusion/config

   */

  app.get("/api/exclusion/config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      let config = await storage.getExclusionConfig(userId);

      

      // Se não existir, criar configuração padrão

      if (!config) {

        config = await storage.upsertExclusionConfig(userId, {

          isEnabled: true,

          followupExclusionEnabled: true,

        });

      }

      

        res.json(config);

    } catch (error: any) {

      console.error("Error fetching exclusion config:", error);

      res.status(500).json({ message: "Failed to fetch exclusion config" });

    }

  });



  /**

   * Atualizar configuração de exclusão do usuário

   * PUT /api/exclusion/config

   */

  app.put("/api/exclusion/config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { isEnabled, followupExclusionEnabled } = req.body;

      

      const config = await storage.upsertExclusionConfig(userId, {

        isEnabled,

        followupExclusionEnabled,

      });

      

      console.log(`?? [EXCLUSION] Config atualizada para usuário ${userId}: enabled=${isEnabled}, followup=${followupExclusionEnabled}`);

        res.json(config);

    } catch (error: any) {

      console.error("Error updating exclusion config:", error);

      res.status(500).json({ message: "Failed to update exclusion config" });

    }

  });



  /**

   * Obter todos os números da lista de exclusão

   * GET /api/exclusion/list

   */

  app.get("/api/exclusion/list", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const list = await storage.getExclusionList(userId);

      res.json(list);

    } catch (error: any) {

      console.error("Error fetching exclusion list:", error);

      res.status(500).json({ message: "Failed to fetch exclusion list" });

    }

  });



  /**

   * Adicionar número à lista de exclusão

   * POST /api/exclusion/list

   */

  app.post("/api/exclusion/list", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { phoneNumber, contactName, reason, excludeFromFollowup } = req.body;

      

      if (!phoneNumber) {

        return res.status(400).json({ message: "Phone number is required" });

      }

      

      // Limpar número (apenas dígitos)

      const cleanNumber = phoneNumber.replace(/\D/g, "");

      

      if (cleanNumber.length < 8) {

        return res.status(400).json({ message: "Invalid phone number" });

      }

      

      const item = await storage.addToExclusionList({

        userId,

        phoneNumber: cleanNumber,

        contactName: contactName || null,

        reason: reason || null,

        excludeFromFollowup: excludeFromFollowup ?? true,

        isActive: true,

      });

      

      console.log(`?? [EXCLUSION] Número ${cleanNumber} adicionado à lista de exclusão do usuário ${userId}`);

      res.json(item);

    } catch (error: any) {

      console.error("Error adding to exclusion list:", error);

      res.status(500).json({ message: "Failed to add to exclusion list" });

    }

  });



  /**

   * Adicionar MÚLTIPLOS números à lista de exclusão (bulk import)

   * POST /api/exclusion/list/bulk

   */

  app.post("/api/exclusion/list/bulk", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { numbers, excludeFromFollowup } = req.body;

      

      if (!numbers || !Array.isArray(numbers) || numbers.length === 0) {

        return res.status(400).json({ message: "Array de números é obrigatório" });

      }

      

      // Limpar e validar números

      const cleanNumbers = numbers

        .map((n: string) => n.replace(/\D/g, "").trim())

        .filter((n: string) => n.length >= 8 && n.length <= 15);

      

      if (cleanNumbers.length === 0) {

        return res.status(400).json({ message: "Nenhum número válido encontrado" });

      }

      

      // Buscar números já existentes para evitar duplicatas

      const existingList = await storage.getExclusionList(userId);

      const existingNumbers = new Set(existingList.map(item => item.phoneNumber));

      

      // Filtrar apenas números novos

      const newNumbers = cleanNumbers.filter((n: string) => !existingNumbers.has(n));

      

      // Adicionar em batch

      let added = 0;

      let skipped = cleanNumbers.length - newNumbers.length;

      

      for (const phoneNumber of newNumbers) {

        try {

          await storage.addToExclusionList({

            userId,

            phoneNumber,

            contactName: null,

            reason: null,

            excludeFromFollowup: excludeFromFollowup ?? true,

            isActive: true,

          });

          added++;

        } catch (err) {

          // Ignorar erros de duplicata

          skipped++;

        }

      }

      

      console.log(`?? [EXCLUSION BULK] ${added} números adicionados, ${skipped} ignorados (usuário ${userId})`);

      res.json({ 

        added, 

        skipped, 

        total: cleanNumbers.length,

        message: `${added} números bloqueados com sucesso` 

      });

    } catch (error: any) {

      console.error("Error bulk adding to exclusion list:", error);

      res.status(500).json({ message: "Falha ao adicionar números" });

    }

  });



  /**

   * Atualizar item da lista de exclusão

   * PUT /api/exclusion/list/:id

   */

  app.put("/api/exclusion/list/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { contactName, reason, excludeFromFollowup, isActive } = req.body;

      

      // Verificar se o item pertence ao usuário

      const existingItem = await storage.getExclusionListItem(id);

      if (!existingItem || existingItem.userId !== userId) {

        return res.status(404).json({ message: "Item not found" });

      }

      

      const item = await storage.updateExclusionListItem(id, {

        contactName,

        reason,

        excludeFromFollowup,

        isActive,

      });

      

      console.log(`?? [EXCLUSION] Item ${id} atualizado na lista de exclusão`);

      res.json(item);

    } catch (error: any) {

      console.error("Error updating exclusion list item:", error);

      res.status(500).json({ message: "Failed to update exclusion list item" });

    }

  });



  /**

   * Remover (soft delete) número da lista de exclusão

   * DELETE /api/exclusion/list/:id

   */

  app.delete("/api/exclusion/list/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { permanent } = req.query;

      

      // Verificar se o item pertence ao usuário

      const existingItem = await storage.getExclusionListItem(id);

      if (!existingItem || existingItem.userId !== userId) {

        return res.status(404).json({ message: "Item not found" });

      }

      

      if (permanent === 'true') {

        await storage.deleteFromExclusionList(id);

        console.log(`??? [EXCLUSION] Número ${existingItem.phoneNumber} removido permanentemente da lista de exclusão`);

      } else {

        await storage.removeFromExclusionList(id);

        console.log(`?? [EXCLUSION] Número ${existingItem.phoneNumber} desativado da lista de exclusão`);

      }

      

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error removing from exclusion list:", error);

      res.status(500).json({ message: "Failed to remove from exclusion list" });

    }

  });



  /**

   * Reativar número na lista de exclusão

   * POST /api/exclusion/list/:id/reactivate

   */

  app.post("/api/exclusion/list/:id/reactivate", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      // Verificar se o item pertence ao usuário

      const existingItem = await storage.getExclusionListItem(id);

      if (!existingItem || existingItem.userId !== userId) {

        return res.status(404).json({ message: "Item not found" });

      }

      

      const item = await storage.reactivateExclusionListItem(id);

      console.log(`? [EXCLUSION] Número ${existingItem.phoneNumber} reativado na lista de exclusão`);

      res.json(item);

    } catch (error: any) {

      console.error("Error reactivating exclusion list item:", error);

      res.status(500).json({ message: "Failed to reactivate exclusion list item" });

    }

  });



  /**

   * Verificar se um número está na lista de exclusão (utility endpoint)

   * GET /api/exclusion/check/:phoneNumber

   */

  app.get("/api/exclusion/check/:phoneNumber", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { phoneNumber } = req.params;

      

      const isExcluded = await storage.isNumberExcluded(userId, phoneNumber);

      const isExcludedFromFollowup = await storage.isNumberExcludedFromFollowup(userId, phoneNumber);

      

      res.json({

        phoneNumber,

        isExcluded,

        isExcludedFromFollowup,

      });

    } catch (error: any) {

      console.error("Error checking exclusion:", error);

      res.status(500).json({ message: "Failed to check exclusion" });

    }

  });



  // ==================== SALES FUNNEL ROUTES ====================



  /**

   * Get all funnels for the authenticated user

   * GET /api/funnels

   */

  app.get("/api/funnels", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data: funnels, error } = await supabase

        .from('sales_funnels')

        .select(`

          *,

          stages:funnel_stages(

            *,

            deals:funnel_deals(*)

          )

        `)

        .eq('user_id', userId)

        .eq('is_active', true)

        .order('created_at', { ascending: false });



      if (error) throw error;



      // Transform data to match frontend interface

      const transformedFunnels = (funnels || []).map((funnel: any) => {

        const stages = funnel.stages || [];

        let totalDeals = 0;

        let totalValue = 0;

        

        stages.forEach((stage: any) => {

          const deals = stage.deals || [];

          totalDeals += deals.length;

          deals.forEach((deal: any) => {

            totalValue += parseFloat(deal.value || 0);

          });

        });



        return {

          id: funnel.id,

          name: funnel.name,

          product: funnel.product,

          manager: funnel.manager,

          deals: totalDeals,

          value: totalValue,

          conversionRate: parseFloat(funnel.conversion_rate || 0),

          estimatedRevenue: parseFloat(funnel.estimated_revenue || 0),

          stages: stages.sort((a: any, b: any) => a.position - b.position).map((stage: any) => ({

            id: stage.id,

            name: stage.name,

            description: stage.description,

            color: stage.color || 'text-slate-700',

            bgColor: stage.bg_color || 'bg-slate-100',

            borderColor: stage.border_color || 'border-slate-200',

            iconColor: stage.icon_color || 'text-slate-500',

            position: stage.position,

            automations: stage.automations_count || 0,

            deals: (stage.deals || []).map((deal: any) => ({

              id: deal.id,

              name: deal.contact_name,

              company: deal.company_name || '',

              value: parseFloat(deal.value || 0),

              valuePeriod: deal.value_period || 'mensal',

              priority: deal.priority || 'Média',

              assignee: deal.assignee,

              phone: deal.contact_phone,

              email: deal.contact_email,

              notes: deal.notes,

              lastContact: deal.last_contact_at,

              conversationId: deal.conversation_id,

            })),

          })),

        };

      });



      res.json(transformedFunnels);

    } catch (error: any) {

      console.error("Error fetching funnels:", error);

      res.status(500).json({ message: "Failed to fetch funnels" });

    }

  });



  /**

   * Create a new funnel with default stages

   * POST /api/funnels

   */

  app.post("/api/funnels", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, product, manager } = req.body;



      if (!name) {

        return res.status(400).json({ message: "Funnel name is required" });

      }



      // Create the funnel

      const { data: funnel, error: funnelError } = await supabase

        .from('sales_funnels')

        .insert({

          user_id: userId,

          name,

          product: product || null,

          manager: manager || null,

        })

        .select()

        .single();



      if (funnelError) throw funnelError;



      // Create default stages

      const defaultStages = [

        { funnel_id: funnel.id, name: 'Prospecto', description: 'Lead interessado inicial', color: 'text-slate-700', bg_color: 'bg-slate-100', border_color: 'border-slate-200', icon_color: 'text-slate-500', position: 1 },

        { funnel_id: funnel.id, name: 'Qualificação', description: 'Verificando interesse e fit', color: 'text-blue-700', bg_color: 'bg-blue-100', border_color: 'border-blue-200', icon_color: 'text-blue-500', position: 2 },

        { funnel_id: funnel.id, name: 'Proposta', description: 'Proposta enviada', color: 'text-amber-700', bg_color: 'bg-amber-100', border_color: 'border-amber-200', icon_color: 'text-amber-500', position: 3 },

        { funnel_id: funnel.id, name: 'Negociação', description: 'Em negociação', color: 'text-purple-700', bg_color: 'bg-purple-100', border_color: 'border-purple-200', icon_color: 'text-purple-500', position: 4 },

        { funnel_id: funnel.id, name: 'Fechado', description: 'Venda concluída', color: 'text-emerald-700', bg_color: 'bg-emerald-100', border_color: 'border-emerald-200', icon_color: 'text-emerald-500', position: 5 },

      ];



      const { error: stagesError } = await supabase

        .from('funnel_stages')

        .insert(defaultStages);



      if (stagesError) throw stagesError;



      res.json({ 

        ...funnel,

        message: "Funnel created with default stages" 

      });

    } catch (error: any) {

      console.error("Error creating funnel:", error);

      res.status(500).json({ message: "Failed to create funnel" });

    }

  });



  /**

   * Get single funnel with all stages and deals

   * GET /api/funnels/:id

   */

  app.get("/api/funnels/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      const { data: funnel, error } = await supabase

        .from('sales_funnels')

        .select(`

          *,

          stages:funnel_stages(

            *,

            deals:funnel_deals(*)

          )

        `)

        .eq('id', id)

        .eq('user_id', userId)

        .single();



      if (error) throw error;

      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      res.json(funnel);

    } catch (error: any) {

      console.error("Error fetching funnel:", error);

      res.status(500).json({ message: "Failed to fetch funnel" });

    }

  });



  /**

   * Update funnel

   * PUT /api/funnels/:id

   */

  app.put("/api/funnels/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, product, manager, isActive } = req.body;



      const updateData: any = { updated_at: new Date().toISOString() };

      if (name !== undefined) updateData.name = name;

      if (product !== undefined) updateData.product = product;

      if (manager !== undefined) updateData.manager = manager;

      if (isActive !== undefined) updateData.is_active = isActive;



      const { data: funnel, error } = await supabase

        .from('sales_funnels')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();



      if (error) throw error;

      res.json(funnel);

    } catch (error: any) {

      console.error("Error updating funnel:", error);

      res.status(500).json({ message: "Failed to update funnel" });

    }

  });



  /**

   * Delete funnel (soft delete - sets is_active to false)

   * DELETE /api/funnels/:id

   */

  app.delete("/api/funnels/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      const { error } = await supabase

        .from('sales_funnels')

        .update({ is_active: false })

        .eq('id', id)

        .eq('user_id', userId);



      if (error) throw error;

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting funnel:", error);

      res.status(500).json({ message: "Failed to delete funnel" });

    }

  });



  // ==================== FUNNEL STAGES ROUTES ====================



  /**

   * Add stage to funnel

   * POST /api/funnels/:funnelId/stages

   */

  app.post("/api/funnels/:funnelId/stages", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { funnelId } = req.params;

      const { name, description, color, bgColor, borderColor, iconColor } = req.body;



      // Verify funnel ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', funnelId)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      // Get max position

      const { data: maxPos } = await supabase

        .from('funnel_stages')

        .select('position')

        .eq('funnel_id', funnelId)

        .order('position', { ascending: false })

        .limit(1)

        .single();



      const newPosition = (maxPos?.position || 0) + 1;



      const { data: stage, error } = await supabase

        .from('funnel_stages')

        .insert({

          funnel_id: funnelId,

          name,

          description: description || '',

          color: color || 'text-slate-700',

          bg_color: bgColor || 'bg-slate-100',

          border_color: borderColor || 'border-slate-200',

          icon_color: iconColor || 'text-slate-500',

          position: newPosition,

        })

        .select()

        .single();



      if (error) throw error;

      res.json(stage);

    } catch (error: any) {

      console.error("Error creating stage:", error);

      res.status(500).json({ message: "Failed to create stage" });

    }

  });



  /**

   * Update stage

   * PUT /api/funnels/:funnelId/stages/:stageId

   */

  app.put("/api/funnels/:funnelId/stages/:stageId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { funnelId, stageId } = req.params;

      const { name, description, color, bgColor, borderColor, iconColor, position, autoMessageEnabled, autoMessageText, autoMessageDelayMinutes } = req.body;



      // Verify funnel ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', funnelId)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      const updateData: any = { updated_at: new Date().toISOString() };

      if (name !== undefined) updateData.name = name;

      if (description !== undefined) updateData.description = description;

      if (color !== undefined) updateData.color = color;

      if (bgColor !== undefined) updateData.bg_color = bgColor;

      if (borderColor !== undefined) updateData.border_color = borderColor;

      if (iconColor !== undefined) updateData.icon_color = iconColor;

      if (position !== undefined) updateData.position = position;

      if (autoMessageEnabled !== undefined) updateData.auto_message_enabled = autoMessageEnabled;

      if (autoMessageText !== undefined) updateData.auto_message_text = autoMessageText;

      if (autoMessageDelayMinutes !== undefined) updateData.auto_message_delay_minutes = autoMessageDelayMinutes;



      const { data: stage, error } = await supabase

        .from('funnel_stages')

        .update(updateData)

        .eq('id', stageId)

        .eq('funnel_id', funnelId)

        .select()

        .single();



      if (error) throw error;

      res.json(stage);

    } catch (error: any) {

      console.error("Error updating stage:", error);

      res.status(500).json({ message: "Failed to update stage" });

    }

  });



  /**

   * Delete stage (moves deals to previous stage)

   * DELETE /api/funnels/:funnelId/stages/:stageId

   */

  app.delete("/api/funnels/:funnelId/stages/:stageId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { funnelId, stageId } = req.params;



      // Verify funnel ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', funnelId)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      // Get previous stage to move deals

      const { data: currentStage } = await supabase

        .from('funnel_stages')

        .select('position')

        .eq('id', stageId)

        .single();



      if (currentStage) {

        const { data: prevStage } = await supabase

          .from('funnel_stages')

          .select('id')

          .eq('funnel_id', funnelId)

          .lt('position', currentStage.position)

          .order('position', { ascending: false })

          .limit(1)

          .single();



        if (prevStage) {

          // Move deals to previous stage

          await supabase

            .from('funnel_deals')

            .update({ stage_id: prevStage.id })

            .eq('stage_id', stageId);

        }

      }



      const { error } = await supabase

        .from('funnel_stages')

        .delete()

        .eq('id', stageId)

        .eq('funnel_id', funnelId);



      if (error) throw error;

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting stage:", error);

      res.status(500).json({ message: "Failed to delete stage" });

    }

  });



  /**

   * Reorder stages

   * PUT /api/funnels/:funnelId/stages/reorder

   */

  app.put("/api/funnels/:funnelId/stages/reorder", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { funnelId } = req.params;

      const { stageIds } = req.body;



      // Verify funnel ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', funnelId)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      // Update positions

      const updates = stageIds.map((id: string, index: number) =>

        supabase

          .from('funnel_stages')

          .update({ position: index + 1 })

          .eq('id', id)

          .eq('funnel_id', funnelId)

      );



      await Promise.all(updates);

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error reordering stages:", error);

      res.status(500).json({ message: "Failed to reorder stages" });

    }

  });



  // ==================== FUNNEL DEALS ROUTES ====================



  /**

   * Create a new deal in a stage

   * POST /api/funnels/:funnelId/stages/:stageId/deals

   */

  app.post("/api/funnels/:funnelId/stages/:stageId/deals", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { funnelId, stageId } = req.params;

      const { contactName, companyName, value, valuePeriod, priority, assignee, contactPhone, contactEmail, notes, conversationId } = req.body;



      // Verify funnel ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', funnelId)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      const { data: deal, error } = await supabase

        .from('funnel_deals')

        .insert({

          stage_id: stageId,

          contact_name: contactName,

          company_name: companyName || null,

          value: value || 0,

          value_period: valuePeriod || 'mensal',

          priority: priority || 'Média',

          assignee: assignee || null,

          contact_phone: contactPhone || null,

          contact_email: contactEmail || null,

          notes: notes || null,

          conversation_id: conversationId || null,

        })

        .select()

        .single();



      if (error) throw error;



      // Add history entry

      await supabase

        .from('deal_history')

        .insert({

          deal_id: deal.id,

          to_stage_id: stageId,

          action: 'created',

          notes: `Deal criado: ${contactName}`,

        });



      // Update funnel metrics

      await updateFunnelMetrics(funnelId);



      res.json(deal);

    } catch (error: any) {

      console.error("Error creating deal:", error);

      res.status(500).json({ message: "Failed to create deal" });

    }

  });



  /**

   * Update deal

   * PUT /api/deals/:dealId

   */

  app.put("/api/deals/:dealId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;

      const { contactName, companyName, value, valuePeriod, priority, assignee, contactPhone, contactEmail, notes, stageId } = req.body;



      // Get current deal and verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          *,

          stage:funnel_stages(

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      const updateData: any = { updated_at: new Date().toISOString() };

      if (contactName !== undefined) updateData.contact_name = contactName;

      if (companyName !== undefined) updateData.company_name = companyName;

      if (value !== undefined) updateData.value = value;

      if (valuePeriod !== undefined) updateData.value_period = valuePeriod;

      if (priority !== undefined) updateData.priority = priority;

      if (assignee !== undefined) updateData.assignee = assignee;

      if (contactPhone !== undefined) updateData.contact_phone = contactPhone;

      if (contactEmail !== undefined) updateData.contact_email = contactEmail;

      if (notes !== undefined) updateData.notes = notes;



      // Handle stage change

      if (stageId && stageId !== currentDeal.stage_id) {

        updateData.stage_id = stageId;

        updateData.last_contact_at = new Date().toISOString();



        // Add history entry

        await supabase

          .from('deal_history')

          .insert({

            deal_id: dealId,

            from_stage_id: currentDeal.stage_id,

            to_stage_id: stageId,

            action: 'moved',

            notes: `Deal movido para novo estágio`,

          });

      }



      const { data: deal, error } = await supabase

        .from('funnel_deals')

        .update(updateData)

        .eq('id', dealId)

        .select()

        .single();



      if (error) throw error;



      // Update funnel metrics

      const { data: stage } = await supabase

        .from('funnel_stages')

        .select('funnel_id')

        .eq('id', deal.stage_id)

        .single();

      

      if (stage) {

        await updateFunnelMetrics(stage.funnel_id);

      }



      res.json(deal);

    } catch (error: any) {

      console.error("Error updating deal:", error);

      res.status(500).json({ message: "Failed to update deal" });

    }

  });



  /**

   * Move deal to different stage (drag & drop)

   * PUT /api/deals/:dealId/move

   */

  app.put("/api/deals/:dealId/move", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;

      const { toStageId } = req.body;



      // Get current deal and verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          *,

          stage:funnel_stages(

            funnel_id,

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      // Add history entry

      await supabase

        .from('deal_history')

        .insert({

          deal_id: dealId,

          from_stage_id: currentDeal.stage_id,

          to_stage_id: toStageId,

          action: 'moved',

        });



      // Update deal

      const { data: deal, error } = await supabase

        .from('funnel_deals')

        .update({

          stage_id: toStageId,

          last_contact_at: new Date().toISOString(),

          updated_at: new Date().toISOString(),

        })

        .eq('id', dealId)

        .select()

        .single();



      if (error) throw error;



      // Update funnel metrics

      await updateFunnelMetrics(currentDeal.stage.funnel_id);



      res.json(deal);

    } catch (error: any) {

      console.error("Error moving deal:", error);

      res.status(500).json({ message: "Failed to move deal" });

    }

  });



  /**

   * Mark deal as won

   * PUT /api/deals/:dealId/won

   */

  app.put("/api/deals/:dealId/won", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;



      // Verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          *,

          stage:funnel_stages(

            funnel_id,

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      const { data: deal, error } = await supabase

        .from('funnel_deals')

        .update({

          won_at: new Date().toISOString(),

          updated_at: new Date().toISOString(),

        })

        .eq('id', dealId)

        .select()

        .single();



      if (error) throw error;



      // Add history

      await supabase

        .from('deal_history')

        .insert({

          deal_id: dealId,

          action: 'won',

          notes: 'Deal marcado como ganho',

        });



      // Update funnel metrics

      await updateFunnelMetrics(currentDeal.stage.funnel_id);



      res.json(deal);

    } catch (error: any) {

      console.error("Error marking deal as won:", error);

      res.status(500).json({ message: "Failed to mark deal as won" });

    }

  });



  /**

   * Mark deal as lost

   * PUT /api/deals/:dealId/lost

   */

  app.put("/api/deals/:dealId/lost", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;

      const { reason } = req.body;



      // Verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          *,

          stage:funnel_stages(

            funnel_id,

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      const { data: deal, error } = await supabase

        .from('funnel_deals')

        .update({

          lost_at: new Date().toISOString(),

          lost_reason: reason || null,

          updated_at: new Date().toISOString(),

        })

        .eq('id', dealId)

        .select()

        .single();



      if (error) throw error;



      // Add history

      await supabase

        .from('deal_history')

        .insert({

          deal_id: dealId,

          action: 'lost',

          notes: reason || 'Deal marcado como perdido',

        });



      // Update funnel metrics

      await updateFunnelMetrics(currentDeal.stage.funnel_id);



      res.json(deal);

    } catch (error: any) {

      console.error("Error marking deal as lost:", error);

      res.status(500).json({ message: "Failed to mark deal as lost" });

    }

  });



  /**

   * Delete deal

   * DELETE /api/deals/:dealId

   */

  app.delete("/api/deals/:dealId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;



      // Verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          stage:funnel_stages(

            funnel_id,

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      const { error } = await supabase

        .from('funnel_deals')

        .delete()

        .eq('id', dealId);



      if (error) throw error;



      // Update funnel metrics

      await updateFunnelMetrics(currentDeal.stage.funnel_id);



      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting deal:", error);

      res.status(500).json({ message: "Failed to delete deal" });

    }

  });



  /**

   * Get deal history

   * GET /api/deals/:dealId/history

   */

  app.get("/api/deals/:dealId/history", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { dealId } = req.params;



      // Verify ownership

      const { data: currentDeal } = await supabase

        .from('funnel_deals')

        .select(`

          stage:funnel_stages(

            funnel:sales_funnels(user_id)

          )

        `)

        .eq('id', dealId)

        .single();



      if (!currentDeal || currentDeal.stage?.funnel?.user_id !== userId) {

        return res.status(404).json({ message: "Deal not found" });

      }



      const { data: history, error } = await supabase

        .from('deal_history')

        .select(`

          *,

          from_stage:funnel_stages!deal_history_from_stage_id_fkey(name),

          to_stage:funnel_stages!deal_history_to_stage_id_fkey(name)

        `)

        .eq('deal_id', dealId)

        .order('created_at', { ascending: false });



      if (error) throw error;

      res.json(history || []);

    } catch (error: any) {

      console.error("Error fetching deal history:", error);

      res.status(500).json({ message: "Failed to fetch deal history" });

    }

  });



  /**

   * Get funnel KPIs/metrics

   * GET /api/funnels/:id/metrics

   */

  app.get("/api/funnels/:id/metrics", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      // Verify ownership

      const { data: funnel } = await supabase

        .from('sales_funnels')

        .select('id')

        .eq('id', id)

        .eq('user_id', userId)

        .single();



      if (!funnel) {

        return res.status(404).json({ message: "Funnel not found" });

      }



      // Get all stages with deals

      const { data: stages } = await supabase

        .from('funnel_stages')

        .select(`

          *,

          deals:funnel_deals(*)

        `)

        .eq('funnel_id', id)

        .order('position');



      if (!stages) {

        return res.json({

          totalDeals: 0,

          totalValue: 0,

          wonDeals: 0,

          wonValue: 0,

          lostDeals: 0,

          conversionRate: 0,

          stageMetrics: [],

        });

      }



      let totalDeals = 0;

      let totalValue = 0;

      let wonDeals = 0;

      let wonValue = 0;

      let lostDeals = 0;



      const stageMetrics = stages.map((stage: any) => {

        const deals = stage.deals || [];

        const stageValue = deals.reduce((sum: number, d: any) => sum + parseFloat(d.value || 0), 0);

        const stageWon = deals.filter((d: any) => d.won_at).length;

        const stageLost = deals.filter((d: any) => d.lost_at).length;

        const stageWonValue = deals.filter((d: any) => d.won_at).reduce((sum: number, d: any) => sum + parseFloat(d.value || 0), 0);



        totalDeals += deals.length;

        totalValue += stageValue;

        wonDeals += stageWon;

        wonValue += stageWonValue;

        lostDeals += stageLost;



        return {

          id: stage.id,

          name: stage.name,

          deals: deals.length,

          value: stageValue,

          won: stageWon,

          lost: stageLost,

        };

      });



      const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;



      res.json({

        totalDeals,

        totalValue,

        wonDeals,

        wonValue,

        lostDeals,

        conversionRate: Math.round(conversionRate * 100) / 100,

        stageMetrics,

      });

    } catch (error: any) {

      console.error("Error fetching funnel metrics:", error);

      res.status(500).json({ message: "Failed to fetch funnel metrics" });

    }

  });



  // Helper function to update funnel metrics

  async function updateFunnelMetrics(funnelId: string) {

    try {

      const { data: stages } = await supabase

        .from('funnel_stages')

        .select(`

          deals:funnel_deals(value, won_at)

        `)

        .eq('funnel_id', funnelId);



      if (!stages) return;



      let totalDeals = 0;

      let wonDeals = 0;

      let totalValue = 0;



      stages.forEach((stage: any) => {

        const deals = stage.deals || [];

        totalDeals += deals.length;

        wonDeals += deals.filter((d: any) => d.won_at).length;

        totalValue += deals.reduce((sum: number, d: any) => sum + parseFloat(d.value || 0), 0);

      });



      const conversionRate = totalDeals > 0 ? (wonDeals / totalDeals) * 100 : 0;



      await supabase

        .from('sales_funnels')

        .update({

          conversion_rate: conversionRate,

          estimated_revenue: totalValue,

          updated_at: new Date().toISOString(),

        })

        .eq('id', funnelId);

    } catch (error) {

      console.error("Error updating funnel metrics:", error);

    }

  }



  // ==================== KANBAN CRM ROUTES ====================



  /**

   * Get user's kanban stages (creates defaults if none exist)

   * GET /api/kanban/stages

   */

  app.get("/api/kanban/stages", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Check if user has stages, create defaults if not

      const { data: stages, error } = await supabase

        .from('kanban_stages')

        .select('*')

        .eq('user_id', userId)

        .order('position', { ascending: true });



      if (error) throw error;



      // If no stages, create defaults

      if (!stages || stages.length === 0) {

        const defaultStages = [

          { user_id: userId, name: 'Novos', description: 'Leads novos', color: 'bg-blue-500', position: 0, is_default: true },

          { user_id: userId, name: 'Prospectando', description: 'Em prospecção', color: 'bg-purple-500', position: 1, is_default: true },

          { user_id: userId, name: 'Negociando', description: 'Em negociação', color: 'bg-amber-500', position: 2, is_default: true },

          { user_id: userId, name: 'Fechado', description: 'Venda concluída', color: 'bg-emerald-500', position: 3, is_default: true },

          { user_id: userId, name: 'Perdido', description: 'Não converteu', color: 'bg-slate-400', position: 4, is_default: true },

        ];



        const { data: newStages, error: insertError } = await supabase

          .from('kanban_stages')

          .insert(defaultStages)

          .select();



        if (insertError) throw insertError;

        return res.json(newStages);

      }



      res.json(stages);

    } catch (error: any) {

      console.error("Error fetching kanban stages:", error);

      res.status(500).json({ message: "Failed to fetch kanban stages" });

    }

  });



  /**

   * Create new kanban stage

   * POST /api/kanban/stages

   */

  app.post("/api/kanban/stages", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, description, color, position } = req.body;



      if (!name) {

        return res.status(400).json({ message: "Stage name is required" });

      }



      // Get max position if not provided

      let newPosition = position;

      if (newPosition === undefined) {

        const { data: maxPos } = await supabase

          .from('kanban_stages')

          .select('position')

          .eq('user_id', userId)

          .order('position', { ascending: false })

          .limit(1)

          .single();

        

        newPosition = (maxPos?.position || 0) + 1;

      }



      const { data: stage, error } = await supabase

        .from('kanban_stages')

        .insert({

          user_id: userId,

          name,

          description: description || '',

          color: color || 'bg-slate-500',

          position: newPosition,

          is_default: false,

        })

        .select()

        .single();



      if (error) throw error;

      res.json(stage);

    } catch (error: any) {

      console.error("Error creating kanban stage:", error);

      res.status(500).json({ message: "Failed to create kanban stage" });

    }

  });



  /**

   * Update kanban stage

   * PUT /api/kanban/stages/:id

   */

  app.put("/api/kanban/stages/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, description, color, position } = req.body;



      const { data: stage, error } = await supabase

        .from('kanban_stages')

        .update({

          name,

          description,

          color,

          position,

          updated_at: new Date().toISOString(),

        })

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();



      if (error) throw error;

      if (!stage) {

        return res.status(404).json({ message: "Stage not found" });

      }



      res.json(stage);

    } catch (error: any) {

      console.error("Error updating kanban stage:", error);

      res.status(500).json({ message: "Failed to update kanban stage" });

    }

  });



  /**

   * Delete kanban stage

   * DELETE /api/kanban/stages/:id

   */

  app.delete("/api/kanban/stages/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      // First, remove stage from all conversations

      await supabase

        .from('conversations')

        .update({ kanban_stage_id: null })

        .eq('kanban_stage_id', id);



      const { error } = await supabase

        .from('kanban_stages')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);



      if (error) throw error;

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting kanban stage:", error);

      res.status(500).json({ message: "Failed to delete kanban stage" });

    }

  });



  /**

   * Reorder kanban stages

   * PUT /api/kanban/stages/reorder

   */

  app.put("/api/kanban/stages/reorder", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { stageIds } = req.body; // Array of stage IDs in new order



      if (!Array.isArray(stageIds)) {

        return res.status(400).json({ message: "stageIds must be an array" });

      }



      // Update positions

      const updates = stageIds.map((id, index) => 

        supabase

          .from('kanban_stages')

          .update({ position: index })

          .eq('id', id)

          .eq('user_id', userId)

      );



      await Promise.all(updates);

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error reordering kanban stages:", error);

      res.status(500).json({ message: "Failed to reorder stages" });

    }

  });



  /**

   * Get conversations for kanban (with stage info)

   * GET /api/kanban/conversations

   */

  app.get("/api/kanban/conversations", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Get user's connection

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.json([]);

      }



      // Get conversations with kanban data

      const { data: conversations, error } = await supabase

        .from('conversations')

        .select('*')

        .eq('connection_id', connection.id)

        .order('last_message_time', { ascending: false });



      if (error) throw error;

      res.json(conversations || []);

    } catch (error: any) {

      console.error("Error fetching kanban conversations:", error);

      res.status(500).json({ message: "Failed to fetch conversations" });

    }

  });



  /**

   * Move conversation to a kanban stage

   * PUT /api/kanban/conversations/:id/move

   */

  app.put("/api/kanban/conversations/:id/move", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { stageId } = req.body;



      // Verify ownership

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(403).json({ message: "No connection found" });

      }



      const { data: conversation, error } = await supabase

        .from('conversations')

        .update({ 

          kanban_stage_id: stageId,

          updated_at: new Date().toISOString() 

        })

        .eq('id', id)

        .eq('connection_id', connection.id)

        .select()

        .single();



      if (error) throw error;

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }



      res.json(conversation);

    } catch (error: any) {

      console.error("Error moving conversation:", error);

      res.status(500).json({ message: "Failed to move conversation" });

    }

  });



  /**

   * Update conversation kanban data (notes, priority)

   * PUT /api/kanban/conversations/:id

   */

  app.put("/api/kanban/conversations/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { kanban_notes, priority, contact_name } = req.body;



      // Verify ownership

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection) {

        return res.status(403).json({ message: "No connection found" });

      }



      const updateData: any = { updated_at: new Date().toISOString() };

      if (kanban_notes !== undefined) updateData.kanban_notes = kanban_notes;

      if (priority !== undefined) updateData.priority = priority;

      if (contact_name !== undefined) updateData.contact_name = contact_name;



      const { data: conversation, error } = await supabase

        .from('conversations')

        .update(updateData)

        .eq('id', id)

        .eq('connection_id', connection.id)

        .select()

        .single();



      if (error) throw error;

      if (!conversation) {

        return res.status(404).json({ message: "Conversation not found" });

      }



      res.json(conversation);

    } catch (error: any) {

      console.error("Error updating conversation:", error);

      res.status(500).json({ message: "Failed to update conversation" });

    }

  });



  // ==================== SISTEMA DE AGENDAMENTOS ====================



  /**

   * Obter configuração de agendamento do usuário

   * GET /api/scheduling/config

   */

  app.get("/api/scheduling/config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data: config, error } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (error && error.code !== 'PGRST116') throw error;

      

      // Retornar config padrão se não existir

      if (!config) {

        return res.json({

          isEnabled: false,

          serviceName: '',

          serviceDuration: 60,

          location: '',

          locationType: 'presencial',

          availableDays: [1, 2, 3, 4, 5],

          workStartTime: '09:00',

          workEndTime: '18:00',

          breakStartTime: '12:00',

          breakEndTime: '13:00',

          hasBreak: true,

          slotDuration: 60,

          bufferBetweenAppointments: 15,

          maxAppointmentsPerDay: 10,

          advanceBookingDays: 30,

          minBookingNoticeHours: 2,

          requireConfirmation: true,

          autoConfirm: false,

          sendReminder: true,

          reminderHoursBefore: 24,

          googleCalendarEnabled: false,

          confirmationMessage: 'Seu agendamento foi confirmado! ??',

          reminderMessage: 'Lembrete: Você tem um agendamento amanhã!',

          cancellationMessage: 'Seu agendamento foi cancelado.',

        });

      }

      

        res.json(config);

    } catch (error: any) {

      console.error("Error fetching scheduling config:", error);

      res.status(500).json({ message: "Failed to fetch scheduling config" });

    }

  });



  /**

   * Salvar/atualizar configuração de agendamento

   * PUT /api/scheduling/config

   */

  app.put("/api/scheduling/config", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const config = req.body;

      

      // Importar função de invalidação de cache

      const { invalidateSchedulingCache } = await import("./schedulingService");

      

      // Verificar se já existe config

      const { data: existing } = await supabase

        .from('scheduling_config')

        .select('id')

        .eq('user_id', userId)

        .single();

      

      let result;

      if (existing) {

        // Update

        const { data, error } = await supabase

          .from('scheduling_config')

          .update({

            ...config,

            updated_at: new Date().toISOString(),

          })

          .eq('user_id', userId)

          .select()

          .single();

        if (error) throw error;

        result = data;

      } else {

        // Insert

        const { data, error } = await supabase

          .from('scheduling_config')

          .insert({

            user_id: userId,

            ...config,

          })

          .select()

          .single();

        if (error) throw error;

        result = data;

      }

      

      // Invalidar cache após atualização

      invalidateSchedulingCache(userId);

      

      console.log(`?? [SCHEDULING] Config atualizada para usuário ${userId}`);

      res.json(result);

    } catch (error: any) {

      console.error("Error updating scheduling config:", error);

      res.status(500).json({ message: "Failed to update scheduling config" });

    }

  });



  /**

   * Obter todos os agendamentos do usuário

   * GET /api/scheduling/appointments?status=pending,confirmed&from=2025-01-01&to=2025-01-31

   */

  app.get("/api/scheduling/appointments", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { status, from, to } = req.query;

      

      let query = supabase

        .from('appointments')

        .select('*')

        .eq('user_id', userId)

        .order('appointment_date', { ascending: true })

        .order('start_time', { ascending: true });

      

      // Filtrar por status

      if (status) {

        const statuses = (status as string).split(',');

        query = query.in('status', statuses);

      }

      

      // Filtrar por data

      if (from) {

        query = query.gte('appointment_date', from);

      }

      if (to) {

        query = query.lte('appointment_date', to);

      }

      

      const { data, error } = await query;

      if (error) throw error;

      

      res.json(data || []);

    } catch (error: any) {

      console.error("Error fetching appointments:", error);

      res.status(500).json({ message: "Failed to fetch appointments" });

    }

  });



  /**

   * Obter um agendamento específico

   * GET /api/scheduling/appointments/:id

   */

  app.get("/api/scheduling/appointments/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { data, error } = await supabase

        .from('appointments')

        .select('*')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (error) throw error;

      if (!data) {

        return res.status(404).json({ message: "Appointment not found" });

      }

      

      res.json(data);

    } catch (error: any) {

      console.error("Error fetching appointment:", error);

      res.status(500).json({ message: "Failed to fetch appointment" });

    }

  });



  /**

   * Criar novo agendamento

   * POST /api/scheduling/appointments

   */

  app.post("/api/scheduling/appointments", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const appointmentData = req.body;

      

      // Buscar configuração para verificar se Google Calendar está habilitado

      const { data: config } = await supabase

        .from('scheduling_config')

        .select('google_calendar_enabled, slot_duration, service_name')

        .eq('user_id', userId)

        .single();

      

      const appointmentDate = appointmentData.appointmentDate || appointmentData.appointment_date;

      const startTime = appointmentData.startTime || appointmentData.start_time;

      const endTime = appointmentData.endTime || appointmentData.end_time;

      

      // Verificar disponibilidade do slot no banco local

      const { data: existing, error: existingError } = await supabase

        .from('appointments')

        .select('id')

        .eq('user_id', userId)

        .eq('appointment_date', appointmentDate)

        .eq('start_time', startTime)

        .in('status', ['pending', 'confirmed']);

      

      if (existingError) throw existingError;

      

      if (existing && existing.length > 0) {

        return res.status(409).json({ 

          message: "Horário já está ocupado no sistema",

          code: "SLOT_TAKEN"

        });

      }

      

      // Verificar conflito no Google Calendar se estiver conectado

      if (config?.google_calendar_enabled) {

        const startDateTime = `${appointmentDate}T${startTime}:00`;

        const endDateTime = `${appointmentDate}T${endTime}:00`;

        

        const availability = await checkCalendarAvailability(userId, startDateTime, endDateTime);

        

        if (!availability.available) {

          return res.status(409).json({

            message: `Horário conflita com evento no Google Calendar: ${availability.conflictEvent}`,

            code: "GOOGLE_CALENDAR_CONFLICT",

            conflictEvent: availability.conflictEvent

          });

        }

      }

      

      // Criar agendamento

      const { data, error } = await supabase

        .from('appointments')

        .insert({

          user_id: userId,

          client_name: appointmentData.clientName || appointmentData.client_name,

          client_phone: appointmentData.clientPhone || appointmentData.client_phone,

          client_email: appointmentData.clientEmail || appointmentData.client_email,

          service_name: appointmentData.serviceName || appointmentData.service_name,

          service_id: appointmentData.serviceId || appointmentData.service_id,

          professional_id: appointmentData.professionalId || appointmentData.professional_id,

          professional_name: appointmentData.professionalName || appointmentData.professional_name,

          appointment_date: appointmentDate,

          start_time: startTime,

          end_time: endTime,

          duration_minutes: appointmentData.durationMinutes || appointmentData.duration_minutes || 60,

          location: appointmentData.location,

          location_type: appointmentData.locationType || appointmentData.location_type || 'presencial',

          client_notes: appointmentData.clientNotes || appointmentData.client_notes,

          internal_notes: appointmentData.internalNotes || appointmentData.internal_notes,

          created_by_ai: appointmentData.createdByAi || appointmentData.created_by_ai || false,

          conversation_id: appointmentData.conversationId || appointmentData.conversation_id,

          status: appointmentData.status || 'pending',

        })

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`?? [SCHEDULING] Novo agendamento criado: ${data.id} para ${appointmentData.clientName || appointmentData.client_name}`);

      

      // Sincronizar automaticamente com Google Calendar se habilitado

      if (config?.google_calendar_enabled) {

        const syncResult = await syncAppointmentToCalendar(userId, {

          id: data.id,

          clientName: data.client_name,

          clientPhone: data.client_phone,

          appointmentDate: data.appointment_date,

          appointmentTime: data.start_time,

          serviceName: data.service_name || config.service_name,

          notes: data.client_notes,

        }, data.duration_minutes || config.slot_duration || 60);

        

        if (syncResult.success && syncResult.eventId) {

          // Salvar Google Event ID no agendamento

          await supabase

            .from('appointments')

            .update({ 

              google_event_id: syncResult.eventId,

              google_calendar_synced: true 

            })

            .eq('id', data.id);

          

          console.log(`?? [GOOGLE CALENDAR] Agendamento ${data.id} sincronizado: ${syncResult.eventId}`);

        } else {

          console.warn(`?? [GOOGLE CALENDAR] Falha ao sincronizar agendamento ${data.id}: ${syncResult.error}`);

        }

      }

      

      res.status(201).json(data);

    } catch (error: any) {

      console.error("Error creating appointment:", error);

      res.status(500).json({ message: "Failed to create appointment" });

    }

  });



  /**

   * Atualizar agendamento

   * PUT /api/scheduling/appointments/:id

   */

  app.put("/api/scheduling/appointments/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const updates = req.body;

      

      const { data, error } = await supabase

        .from('appointments')

        .update({

          ...updates,

          updated_at: new Date().toISOString(),

        })

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      if (!data) {

        return res.status(404).json({ message: "Appointment not found" });

      }

      

      console.log(`?? [SCHEDULING] Agendamento ${id} atualizado`);

      res.json(data);

    } catch (error: any) {

      console.error("Error updating appointment:", error);

      res.status(500).json({ message: "Failed to update appointment" });

    }

  });



  /**

   * Confirmar agendamento

   * POST /api/scheduling/appointments/:id/confirm

   */

  app.post("/api/scheduling/appointments/:id/confirm", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { confirmedBy, sendNotification = true } = req.body; // 'client' ou 'business'

      

      const updateData: any = {

        status: 'confirmed',

        confirmed_at: new Date().toISOString(),

        updated_at: new Date().toISOString(),

      };

      

      if (confirmedBy === 'client') {

        updateData.confirmed_by_client = true;

      } else {

        updateData.confirmed_by_business = true;

      }

      

      const { data, error } = await supabase

        .from('appointments')

        .update(updateData)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`? [SCHEDULING] Agendamento ${id} confirmado por ${confirmedBy}`);

      

      // ?? Se confirmado pelo negócio E sendNotification ativo, enviar mensagem ao cliente via IA

      if (confirmedBy === 'business' && sendNotification && data) {

        try {

          const { sendConfirmationToClientViaAI } = await import('./appointmentReminderService');

          await sendConfirmationToClientViaAI(data, userId);

        } catch (notifyError) {

          console.error("? [SCHEDULING] Erro ao enviar confirmação:", notifyError);

          // Não falhar a operação principal

        }

      }

      

      res.json(data);

    } catch (error: any) {

      console.error("Error confirming appointment:", error);

      res.status(500).json({ message: "Failed to confirm appointment" });

    }

  });



  /**

   * Cancelar agendamento

   * POST /api/scheduling/appointments/:id/cancel

   */

  app.post("/api/scheduling/appointments/:id/cancel", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { cancelledBy, reason, sendNotification = true } = req.body;

      

      const { data, error } = await supabase

        .from('appointments')

        .update({

          status: 'cancelled',

          cancelled_at: new Date().toISOString(),

          cancelled_by: cancelledBy || 'business',

          cancellation_reason: reason,

          updated_at: new Date().toISOString(),

        })

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`? [SCHEDULING] Agendamento ${id} cancelado por ${cancelledBy}`);

      

      // ?? Se cancelado pelo negócio E sendNotification ativo, enviar mensagem ao cliente via IA

      if (cancelledBy === 'business' && sendNotification && data) {

        try {

          const { sendCancellationToClientViaAI } = await import('./appointmentReminderService');

          await sendCancellationToClientViaAI(data, userId, reason);

        } catch (notifyError) {

          console.error("? [SCHEDULING] Erro ao enviar notificação de cancelamento:", notifyError);

          // Não falhar a operação principal

        }

      }

      

      res.json(data);

    } catch (error: any) {

      console.error("Error cancelling appointment:", error);

      res.status(500).json({ message: "Failed to cancel appointment" });

    }

  });



  /**

   * Marcar como concluído/no-show

   * POST /api/scheduling/appointments/:id/complete

   */

  app.post("/api/scheduling/appointments/:id/complete", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { status } = req.body; // 'completed' ou 'no_show'

      

      const { data, error } = await supabase

        .from('appointments')

        .update({

          status: status || 'completed',

          updated_at: new Date().toISOString(),

        })

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`?? [SCHEDULING] Agendamento ${id} marcado como ${status}`);

      res.json(data);

    } catch (error: any) {

      console.error("Error completing appointment:", error);

      res.status(500).json({ message: "Failed to complete appointment" });

    }

  });



  /**

   * Deletar agendamento

   * DELETE /api/scheduling/appointments/:id

   */

  app.delete("/api/scheduling/appointments/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('appointments')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      console.log(`??? [SCHEDULING] Agendamento ${id} deletado`);

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting appointment:", error);

      res.status(500).json({ message: "Failed to delete appointment" });

    }

  });



  /**

   * Obter slots disponíveis para uma data

   * GET /api/scheduling/available-slots?date=2025-01-10

   */

  app.get("/api/scheduling/available-slots", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { date } = req.query;

      

      if (!date) {

        return res.status(400).json({ message: "Date is required" });

      }

      

      // Buscar configuração

      const { data: config, error: configError } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (configError && configError.code !== 'PGRST116') throw configError;

      

      if (!config || !config.is_enabled) {

        return res.json({ slots: [], message: "Agendamento não está ativado" });

      }

      

      // Verificar se o dia está disponível

      const dayOfWeek = new Date(date as string).getDay();

      const availableDays = config.available_days || [1,2,3,4,5];

      

      if (!availableDays.includes(dayOfWeek)) {

        return res.json({ slots: [], message: "Dia não disponível para agendamentos" });

      }

      

      // Verificar exceções para o dia

      const { data: exception } = await supabase

        .from('scheduling_exceptions')

        .select('*')

        .eq('user_id', userId)

        .eq('exception_date', date)

        .single();

      

      if (exception && exception.exception_type === 'blocked') {

        return res.json({ slots: [], message: exception.reason || "Dia bloqueado" });

      }

      

      // Determinar horários de início e fim

      let startTime = config.work_start_time || '09:00';

      let endTime = config.work_end_time || '18:00';

      

      if (exception && exception.exception_type === 'modified_hours') {

        startTime = exception.custom_start_time || startTime;

        endTime = exception.custom_end_time || endTime;

      }

      

      // Gerar todos os slots possíveis

      const slotDuration = config.slot_duration || 60;

      const buffer = config.buffer_between_appointments || 0;

      const slots: string[] = [];

      

      const [startHour, startMin] = startTime.split(':').map(Number);

      const [endHour, endMin] = endTime.split(':').map(Number);

      const breakStart = config.break_start_time || '12:00';

      const breakEnd = config.break_end_time || '13:00';

      

      let currentMinutes = startHour * 60 + startMin;

      const endMinutes = endHour * 60 + endMin;

      const [breakStartHour, breakStartMin] = breakStart.split(':').map(Number);

      const [breakEndHour, breakEndMin] = breakEnd.split(':').map(Number);

      const breakStartMinutes = breakStartHour * 60 + breakStartMin;

      const breakEndMinutes = breakEndHour * 60 + breakEndMin;

      

      while (currentMinutes + slotDuration <= endMinutes) {

        const slotEnd = currentMinutes + slotDuration;

        

        // Verificar se está no horário de pausa

        if (config.has_break) {

          if (currentMinutes < breakEndMinutes && slotEnd > breakStartMinutes) {

            currentMinutes = breakEndMinutes;

            continue;

          }

        }

        

        const hour = Math.floor(currentMinutes / 60);

        const min = currentMinutes % 60;

        slots.push(`${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`);

        

        currentMinutes += slotDuration + buffer;

      }

      

      // Buscar agendamentos existentes para o dia

      const { data: existingAppointments, error: apptError } = await supabase

        .from('appointments')

        .select('start_time')

        .eq('user_id', userId)

        .eq('appointment_date', date)

        .in('status', ['pending', 'confirmed']);

      

      if (apptError) throw apptError;

      

      // Filtrar slots já ocupados

      const occupiedSlots = new Set(existingAppointments?.map(a => a.start_time) || []);

      const availableSlots = slots.filter(slot => !occupiedSlots.has(slot));

      

      // Verificar limite máximo por dia

      const maxPerDay = config.max_appointments_per_day || 10;

      const currentCount = existingAppointments?.length || 0;

      

      if (currentCount >= maxPerDay) {

        return res.json({ slots: [], message: "Limite de agendamentos para o dia atingido" });

      }

      

      res.json({ 

        slots: availableSlots,

        config: {

          slotDuration,

          location: config.location,

          serviceName: config.service_name,

        }

      });

    } catch (error: any) {

      console.error("Error fetching available slots:", error);

      res.status(500).json({ message: "Failed to fetch available slots" });

    }

  });



  /**

   * Obter dias disponíveis do mês

   * GET /api/scheduling/available-days?month=2025-01

   */

  app.get("/api/scheduling/available-days", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { month } = req.query; // YYYY-MM

      

      if (!month) {

        return res.status(400).json({ message: "Month is required (YYYY-MM)" });

      }

      

      // Buscar configuração

      const { data: config, error: configError } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (configError && configError.code !== 'PGRST116') throw configError;

      

      if (!config || !config.is_enabled) {

        return res.json({ days: [], message: "Agendamento não está ativado" });

      }

      

      // Gerar todos os dias do mês

      const [year, monthNum] = (month as string).split('-').map(Number);

      const daysInMonth = new Date(year, monthNum, 0).getDate();

      const availableDays = config.available_days || [1,2,3,4,5];

      const advanceBookingDays = config.advance_booking_days || 30;

      

      const today = new Date();

      today.setHours(0, 0, 0, 0);

      const maxDate = new Date(today);

      maxDate.setDate(maxDate.getDate() + advanceBookingDays);

      

      // Buscar exceções do mês

      const startOfMonth = `${month}-01`;

      const endOfMonth = `${month}-${daysInMonth.toString().padStart(2, '0')}`;

      

      const { data: exceptions } = await supabase

        .from('scheduling_exceptions')

        .select('*')

        .eq('user_id', userId)

        .gte('exception_date', startOfMonth)

        .lte('exception_date', endOfMonth);

      

      const blockedDates = new Set(

        exceptions?.filter(e => e.exception_type === 'blocked').map(e => e.exception_date) || []

      );

      

      // Buscar contagem de agendamentos por dia

      const { data: appointments } = await supabase

        .from('appointments')

        .select('appointment_date')

        .eq('user_id', userId)

        .gte('appointment_date', startOfMonth)

        .lte('appointment_date', endOfMonth)

        .in('status', ['pending', 'confirmed']);

      

      const appointmentCounts: Record<string, number> = {};

      appointments?.forEach(a => {

        appointmentCounts[a.appointment_date] = (appointmentCounts[a.appointment_date] || 0) + 1;

      });

      

      const maxPerDay = config.max_appointments_per_day || 10;

      

      const days: { date: string; available: boolean; reason?: string }[] = [];

      

      for (let day = 1; day <= daysInMonth; day++) {

        const dateStr = `${month}-${day.toString().padStart(2, '0')}`;

        const date = new Date(year, monthNum - 1, day);

        const dayOfWeek = date.getDay();

        

        let available = true;

        let reason = '';

        

        // Verificar se é dia passado

        if (date < today) {

          available = false;

          reason = 'Data passada';

        }

        // Verificar limite de dias à frente

        else if (date > maxDate) {

          available = false;

          reason = 'Fora do período de agendamento';

        }

        // Verificar dia da semana

        else if (!availableDays.includes(dayOfWeek)) {

          available = false;

          reason = 'Dia não disponível';

        }

        // Verificar exceções

        else if (blockedDates.has(dateStr)) {

          available = false;

          reason = 'Dia bloqueado';

        }

        // Verificar limite de agendamentos

        else if ((appointmentCounts[dateStr] || 0) >= maxPerDay) {

          available = false;

          reason = 'Lotado';

        }

        

        days.push({ date: dateStr, available, reason: available ? undefined : reason });

      }

      

      res.json({ days, config: { availableDays, advanceBookingDays } });

    } catch (error: any) {

      console.error("Error fetching available days:", error);

      res.status(500).json({ message: "Failed to fetch available days" });

    }

  });



  /**

   * Gerenciar exceções (feriados, dias especiais)

   * GET /api/scheduling/exceptions

   */

  app.get("/api/scheduling/exceptions", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const { data, error } = await supabase

        .from('scheduling_exceptions')

        .select('*')

        .eq('user_id', userId)

        .order('exception_date', { ascending: true });

      

      if (error) throw error;

      res.json(data || []);

    } catch (error: any) {

      console.error("Error fetching exceptions:", error);

      res.status(500).json({ message: "Failed to fetch exceptions" });

    }

  });



  /**

   * Criar exceção (bloquear dia, modificar horário)

   * POST /api/scheduling/exceptions

   */

  app.post("/api/scheduling/exceptions", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const exceptionData = req.body;

      

      const { data, error } = await supabase

        .from('scheduling_exceptions')

        .insert({

          user_id: userId,

          exception_date: exceptionData.exceptionDate || exceptionData.exception_date,

          exception_type: exceptionData.exceptionType || exceptionData.exception_type,

          custom_start_time: exceptionData.customStartTime || exceptionData.custom_start_time,

          custom_end_time: exceptionData.customEndTime || exceptionData.custom_end_time,

          reason: exceptionData.reason,

        })

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`?? [SCHEDULING] Exceção criada para ${exceptionData.exceptionDate}`);

      res.status(201).json(data);

    } catch (error: any) {

      console.error("Error creating exception:", error);

      res.status(500).json({ message: "Failed to create exception" });

    }

  });



  /**

   * Deletar exceção

   * DELETE /api/scheduling/exceptions/:id

   */

  app.delete("/api/scheduling/exceptions/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('scheduling_exceptions')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      

      res.json({ success: true });

    } catch (error: any) {

      console.error("Error deleting exception:", error);

      res.status(500).json({ message: "Failed to delete exception" });

    }

  });



  /**

   * IA - Verificar disponibilidade e sugerir horários

   * POST /api/scheduling/ai/check-availability

   * Usado pela IA para verificar antes de confirmar agendamento

   */

  app.post("/api/scheduling/ai/check-availability", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { date, preferredTime, clientPhone } = req.body;

      

      // Buscar configuração

      const { data: config } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (!config || !config.is_enabled) {

        return res.json({

          available: false,

          message: "Sistema de agendamento não está ativado",

          suggestions: [],

        });

      }

      

      // Buscar slots disponíveis para o dia solicitado

      const dayOfWeek = new Date(date).getDay();

      const availableDays = config.available_days || [1,2,3,4,5];

      

      if (!availableDays.includes(dayOfWeek)) {

        // Sugerir próximo dia disponível

        const suggestions: string[] = [];

        const checkDate = new Date(date);

        for (let i = 1; i <= 7 && suggestions.length < 3; i++) {

          checkDate.setDate(checkDate.getDate() + 1);

          if (availableDays.includes(checkDate.getDay())) {

            suggestions.push(checkDate.toISOString().split('T')[0]);

          }

        }

        

        return res.json({

          available: false,

          message: `Não atendemos nesse dia. Dias disponíveis: ${availableDays.map((d: number) => ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'][d]).join(', ')}`,

          suggestions,

        });

      }

      

      // Buscar slots ocupados

      const { data: existingAppointments } = await supabase

        .from('appointments')

        .select('start_time')

        .eq('user_id', userId)

        .eq('appointment_date', date)

        .in('status', ['pending', 'confirmed']);

      

      const occupiedSlots = new Set(existingAppointments?.map(a => a.start_time) || []);

      

      // Verificar se o horário preferido está disponível

      if (preferredTime && !occupiedSlots.has(preferredTime)) {

        return res.json({

          available: true,

          slot: preferredTime,

          date,

          serviceName: config.service_name,

          location: config.location,

          duration: config.slot_duration || 60,

          message: `Horário disponível! ${date} às ${preferredTime}`,

        });

      }

      

      // Gerar slots disponíveis como sugestão

      const startTime = config.work_start_time || '09:00';

      const endTime = config.work_end_time || '18:00';

      const slotDuration = config.slot_duration || 60;

      

      const [startHour, startMin] = startTime.split(':').map(Number);

      const [endHour, endMin] = endTime.split(':').map(Number);

      

      let currentMinutes = startHour * 60 + startMin;

      const endMinutes = endHour * 60 + endMin;

      

      const availableSlots: string[] = [];

      while (currentMinutes + slotDuration <= endMinutes && availableSlots.length < 5) {

        const hour = Math.floor(currentMinutes / 60);

        const min = currentMinutes % 60;

        const slot = `${hour.toString().padStart(2, '0')}:${min.toString().padStart(2, '0')}`;

        

        if (!occupiedSlots.has(slot)) {

          availableSlots.push(slot);

        }

        

        currentMinutes += slotDuration;

      }

      

      if (availableSlots.length === 0) {

        return res.json({

          available: false,

          message: "Não há horários disponíveis para esta data",

          suggestions: [],

        });

      }

      

      res.json({

        available: true,

        slot: availableSlots[0],

        date,

        serviceName: config.service_name,

        location: config.location,

        duration: config.slot_duration || 60,

        suggestions: availableSlots,

        message: `Horários disponíveis para ${date}: ${availableSlots.join(', ')}`,

      });

    } catch (error: any) {

      console.error("Error checking availability:", error);

      res.status(500).json({ message: "Failed to check availability" });

    }

  });



  /**

   * IA - Criar agendamento pendente (aguardando confirmação)

   * POST /api/scheduling/ai/create-pending

   */

  app.post("/api/scheduling/ai/create-pending", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { 

        clientName, clientPhone, clientEmail,

        date, time, 

        conversationId, conversationContext 

      } = req.body;

      

      // Buscar configuração

      const { data: config } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (!config || !config.is_enabled) {

        return res.status(400).json({ 

          message: "Sistema de agendamento não está ativado" 

        });

      }

      

      // Calcular horário de término

      const slotDuration = config.slot_duration || 60;

      const [hour, min] = time.split(':').map(Number);

      const endMinutes = hour * 60 + min + slotDuration;

      const endHour = Math.floor(endMinutes / 60);

      const endMin = endMinutes % 60;

      const endTime = `${endHour.toString().padStart(2, '0')}:${endMin.toString().padStart(2, '0')}`;

      

      // Criar agendamento

      const status = config.require_confirmation ? 'pending' : 'confirmed';

      const aiConfirmationPending = config.require_confirmation;

      

      const { data, error } = await supabase

        .from('appointments')

        .insert({

          user_id: userId,

          client_name: clientName,

          client_phone: clientPhone,

          client_email: clientEmail,

          service_name: config.service_name,

          appointment_date: date,

          start_time: time,

          end_time: endTime,

          duration_minutes: slotDuration,

          location: config.location,

          location_type: config.location_type,

          status,

          created_by_ai: true,

          ai_confirmation_pending: aiConfirmationPending,

          ai_conversation_context: conversationContext,

          conversation_id: conversationId,

        })

        .select()

        .single();

      

      if (error) throw error;

      

      console.log(`?? [SCHEDULING-AI] Agendamento ${status} criado para ${clientName} em ${date} às ${time}`);

      

      res.status(201).json({

        ...data,

        confirmationMessage: config.require_confirmation 

          ? `Agendamento solicitado para ${date} às ${time}. Aguardando confirmação.`

          : config.confirmation_message,

        requiresConfirmation: config.require_confirmation,

      });

    } catch (error: any) {

      console.error("Error creating AI appointment:", error);

      res.status(500).json({ message: "Failed to create appointment" });

    }

  });



  // =====================================================================

  // SCHEDULING SERVICES ROUTES (Gestão de Serviços)

  // =====================================================================



  /**

   * Listar serviços do usuário

   * GET /api/scheduling/services

   */

  app.get("/api/scheduling/services", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { activeOnly } = req.query;

      

      let query = supabase

        .from('scheduling_services')

        .select('*')

        .eq('user_id', userId)

        .order('display_order', { ascending: true });

      

      if (activeOnly === 'true') {

        query = query.eq('is_active', true);

      }

      

      const { data, error } = await query;

      

      if (error) throw error;

      res.json(data || []);

    } catch (error: any) {

      console.error("Error fetching services:", error);

      res.status(500).json({ message: "Falha ao buscar serviços" });

    }

  });



  /**

   * Criar novo serviço

   * POST /api/scheduling/services

   */

  app.post("/api/scheduling/services", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, description, durationMinutes, duration_minutes, price, isActive, is_active, allowOnline, allowPresencial, requiresConfirmation, bufferBeforeMinutes, bufferAfterMinutes, maxPerDay, color, icon, displayOrder } = req.body;

      

      if (!name) {

        return res.status(400).json({ message: "Nome do serviço é obrigatório" });

      }

      

      // Suporta ambos os formatos: camelCase e snake_case

      const actualDuration = durationMinutes || duration_minutes || 60;

      const actualIsActive = isActive !== undefined ? isActive : (is_active !== undefined ? is_active : true);

      

      const { data, error } = await supabase

        .from('scheduling_services')

        .insert({

          user_id: userId,

          name,

          description,

          duration_minutes: actualDuration,

          price: price || null,

          is_active: actualIsActive !== false,

          allow_online: allowOnline !== false,

          allow_presencial: allowPresencial !== false,

          requires_confirmation: requiresConfirmation !== false,

          buffer_before_minutes: bufferBeforeMinutes || 0,

          buffer_after_minutes: bufferAfterMinutes || 15,

          max_per_day: maxPerDay || null,

          color: color || '#3b82f6',

          icon: icon || null,

          display_order: displayOrder || 0,

        })

        .select()

        .single();

      

      if (error) throw error;

      res.status(201).json(data);

    } catch (error: any) {

      console.error("Error creating service:", error);

      res.status(500).json({ message: "Falha ao criar serviço" });

    }

  });



  /**

   * Atualizar serviço

   * PUT /api/scheduling/services/:id

   */

  app.put("/api/scheduling/services/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const updates = req.body;

      

      // Converter camelCase para snake_case (suporta ambos os formatos)

      const dbUpdates: any = {};

      if (updates.name !== undefined) dbUpdates.name = updates.name;

      if (updates.description !== undefined) dbUpdates.description = updates.description;

      // Suporta ambos: durationMinutes e duration_minutes

      if (updates.durationMinutes !== undefined) dbUpdates.duration_minutes = updates.durationMinutes;

      else if (updates.duration_minutes !== undefined) dbUpdates.duration_minutes = updates.duration_minutes;

      if (updates.price !== undefined) dbUpdates.price = updates.price;

      // Suporta ambos: isActive e is_active

      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      else if (updates.is_active !== undefined) dbUpdates.is_active = updates.is_active;

      if (updates.allowOnline !== undefined) dbUpdates.allow_online = updates.allowOnline;

      if (updates.allowPresencial !== undefined) dbUpdates.allow_presencial = updates.allowPresencial;

      if (updates.requiresConfirmation !== undefined) dbUpdates.requires_confirmation = updates.requiresConfirmation;

      if (updates.bufferBeforeMinutes !== undefined) dbUpdates.buffer_before_minutes = updates.bufferBeforeMinutes;

      if (updates.bufferAfterMinutes !== undefined) dbUpdates.buffer_after_minutes = updates.bufferAfterMinutes;

      if (updates.maxPerDay !== undefined) dbUpdates.max_per_day = updates.maxPerDay;

      if (updates.color !== undefined) dbUpdates.color = updates.color;

      if (updates.icon !== undefined) dbUpdates.icon = updates.icon;

      if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;

      dbUpdates.updated_at = new Date().toISOString();

      

      const { data, error } = await supabase

        .from('scheduling_services')

        .update(dbUpdates)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      if (!data) {

        return res.status(404).json({ message: "Serviço não encontrado" });

      }

      res.json(data);

    } catch (error: any) {

      console.error("Error updating service:", error);

      res.status(500).json({ message: "Falha ao atualizar serviço" });

    }

  });



  /**

   * Excluir serviço

   * DELETE /api/scheduling/services/:id

   */

  app.delete("/api/scheduling/services/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('scheduling_services')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      res.json({ message: "Serviço excluído com sucesso" });

    } catch (error: any) {

      console.error("Error deleting service:", error);

      res.status(500).json({ message: "Falha ao excluir serviço" });

    }

  });



  // =====================================================================

  // SCHEDULING PROFESSIONALS ROUTES (Gestão de Profissionais)

  // =====================================================================



  /**

   * Listar profissionais do usuário

   * GET /api/scheduling/professionals

   */

  app.get("/api/scheduling/professionals", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { activeOnly, withServices } = req.query;

      

      let query = supabase

        .from('scheduling_professionals')

        .select('*')

        .eq('user_id', userId)

        .order('display_order', { ascending: true });

      

      if (activeOnly === 'true') {

        query = query.eq('is_active', true);

      }

      

      const { data, error } = await query;

      if (error) throw error;

      

      // Se pediu com serviços, buscar a relação

      if (withServices === 'true' && data) {

        const profIds = data.map(p => p.id);

        const { data: relations } = await supabase

          .from('professional_services')

          .select('*, service:scheduling_services(*)')

          .in('professional_id', profIds);

        

        // Mapear serviços para cada profissional

        const professionalsWithServices = data.map(prof => ({

          ...prof,

          services: (relations || [])

            .filter(r => r.professional_id === prof.id)

            .map(r => ({ ...r.service, customDurationMinutes: r.custom_duration_minutes, customPrice: r.custom_price }))

        }));

        

        return res.json(professionalsWithServices);

      }

      

      res.json(data || []);

    } catch (error: any) {

      console.error("Error fetching professionals:", error);

      res.status(500).json({ message: "Falha ao buscar profissionais" });

    }

  });



  /**

   * Criar novo profissional

   * POST /api/scheduling/professionals

   */

  app.post("/api/scheduling/professionals", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, email, phone, avatarUrl, bio, workSchedule, isActive, isDefault, acceptsOnline, acceptsPresencial, maxAppointmentsPerDay, displayOrder, serviceIds } = req.body;

      

      if (!name) {

        return res.status(400).json({ message: "Nome do profissional é obrigatório" });

      }

      

      // Se marcou como padrão, desmarcar outros

      if (isDefault) {

        await supabase

          .from('scheduling_professionals')

          .update({ is_default: false })

          .eq('user_id', userId);

      }

      

      const { data, error } = await supabase

        .from('scheduling_professionals')

        .insert({

          user_id: userId,

          name,

          email,

          phone,

          avatar_url: avatarUrl,

          bio,

          work_schedule: workSchedule || {},

          is_active: isActive !== false,

          is_default: isDefault || false,

          accepts_online: acceptsOnline !== false,

          accepts_presencial: acceptsPresencial !== false,

          max_appointments_per_day: maxAppointmentsPerDay || 10,

          display_order: displayOrder || 0,

        })

        .select()

        .single();

      

      if (error) throw error;

      

      // Se passou serviceIds, criar as relações

      if (serviceIds && serviceIds.length > 0 && data) {

        const relations = serviceIds.map((serviceId: string, index: number) => ({

          professional_id: data.id,

          service_id: serviceId,

          display_order: index,

        }));

        

        await supabase.from('professional_services').insert(relations);

      }

      

      res.status(201).json(data);

    } catch (error: any) {

      console.error("Error creating professional:", error);

      res.status(500).json({ message: "Falha ao criar profissional" });

    }

  });



  /**

   * Atualizar profissional

   * PUT /api/scheduling/professionals/:id

   */

  app.put("/api/scheduling/professionals/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const updates = req.body;

      

      // Converter camelCase para snake_case

      const dbUpdates: any = {};

      if (updates.name !== undefined) dbUpdates.name = updates.name;

      if (updates.email !== undefined) dbUpdates.email = updates.email;

      if (updates.phone !== undefined) dbUpdates.phone = updates.phone;

      if (updates.avatarUrl !== undefined) dbUpdates.avatar_url = updates.avatarUrl;

      if (updates.bio !== undefined) dbUpdates.bio = updates.bio;

      if (updates.workSchedule !== undefined) dbUpdates.work_schedule = updates.workSchedule;

      if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

      if (updates.isDefault !== undefined) {

        dbUpdates.is_default = updates.isDefault;

        // Se marcou como padrão, desmarcar outros

        if (updates.isDefault) {

          await supabase

            .from('scheduling_professionals')

            .update({ is_default: false })

            .eq('user_id', userId)

            .neq('id', id);

        }

      }

      if (updates.acceptsOnline !== undefined) dbUpdates.accepts_online = updates.acceptsOnline;

      if (updates.acceptsPresencial !== undefined) dbUpdates.accepts_presencial = updates.acceptsPresencial;

      if (updates.maxAppointmentsPerDay !== undefined) dbUpdates.max_appointments_per_day = updates.maxAppointmentsPerDay;

      if (updates.displayOrder !== undefined) dbUpdates.display_order = updates.displayOrder;

      dbUpdates.updated_at = new Date().toISOString();

      

      const { data, error } = await supabase

        .from('scheduling_professionals')

        .update(dbUpdates)

        .eq('id', id)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      if (!data) {

        return res.status(404).json({ message: "Profissional não encontrado" });

      }

      

      // Se passou serviceIds, atualizar as relações

      if (updates.serviceIds !== undefined) {

        // Remover relações antigas

        await supabase

          .from('professional_services')

          .delete()

          .eq('professional_id', id);

        

        // Criar novas relações

        if (updates.serviceIds.length > 0) {

          const relations = updates.serviceIds.map((serviceId: string, index: number) => ({

            professional_id: id,

            service_id: serviceId,

            display_order: index,

          }));

          

          await supabase.from('professional_services').insert(relations);

        }

      }

      

      res.json(data);

    } catch (error: any) {

      console.error("Error updating professional:", error);

      res.status(500).json({ message: "Falha ao atualizar profissional" });

    }

  });



  /**

   * Excluir profissional

   * DELETE /api/scheduling/professionals/:id

   */

  app.delete("/api/scheduling/professionals/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      

      const { error } = await supabase

        .from('scheduling_professionals')

        .delete()

        .eq('id', id)

        .eq('user_id', userId);

      

      if (error) throw error;

      res.json({ message: "Profissional excluído com sucesso" });

    } catch (error: any) {

      console.error("Error deleting professional:", error);

      res.status(500).json({ message: "Falha ao excluir profissional" });

    }

  });



  /**

   * Atribuir serviços a um profissional

   * POST /api/scheduling/professionals/:id/services

   */

  app.post("/api/scheduling/professionals/:id/services", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { serviceIds } = req.body;

      

      // Verificar se profissional pertence ao usuário

      const { data: prof } = await supabase

        .from('scheduling_professionals')

        .select('id')

        .eq('id', id)

        .eq('user_id', userId)

        .single();

      

      if (!prof) {

        return res.status(404).json({ message: "Profissional não encontrado" });

      }

      

      // Remover relações antigas

      await supabase

        .from('professional_services')

        .delete()

        .eq('professional_id', id);

      

      // Criar novas relações

      if (serviceIds && serviceIds.length > 0) {

        const relations = serviceIds.map((serviceId: string, index: number) => ({

          professional_id: id,

          service_id: serviceId,

          display_order: index,

        }));

        

        await supabase.from('professional_services').insert(relations);

      }

      

      res.json({ message: "Serviços atualizados com sucesso" });

    } catch (error: any) {

      console.error("Error assigning services:", error);

      res.status(500).json({ message: "Falha ao atribuir serviços" });

    }

  });



  /**

   * Buscar slots disponíveis considerando serviço e profissional

   * GET /api/scheduling/available-slots-advanced?date=2025-01-10&serviceId=...&professionalId=...

   */

  app.get("/api/scheduling/available-slots-advanced", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { date, serviceId, professionalId } = req.query;

      

      if (!date) {

        return res.status(400).json({ message: "Data é obrigatória" });

      }

      

      // Buscar configuração

      const { data: config } = await supabase

        .from('scheduling_config')

        .select('*')

        .eq('user_id', userId)

        .single();

      

      if (!config || !config.is_enabled) {

        return res.json({ slots: [], message: "Sistema de agendamento desativado" });

      }

      

      // Buscar serviço se especificado

      let serviceDuration = config.slot_duration || 60;

      let bufferAfter = config.buffer_between_appointments || 15;

      

      if (serviceId) {

        const { data: service } = await supabase

          .from('scheduling_services')

          .select('*')

          .eq('id', serviceId)

          .eq('user_id', userId)

          .single();

        

        if (service) {

          serviceDuration = service.duration_minutes;

          bufferAfter = service.buffer_after_minutes || 15;

        }

      }

      

      // Buscar profissional se especificado

      let workStartTime = config.work_start_time || '09:00:00';

      let workEndTime = config.work_end_time || '18:00:00';

      let breakStartTime = config.break_start_time || '12:00:00';

      let breakEndTime = config.break_end_time || '13:00:00';

      let hasBreak = config.has_break;

      

      if (professionalId) {

        const { data: professional } = await supabase

          .from('scheduling_professionals')

          .select('*')

          .eq('id', professionalId)

          .eq('user_id', userId)

          .single();

        

        if (professional && professional.work_schedule) {

          const dayOfWeek = new Date(date as string).getDay();

          const daySchedule = (professional.work_schedule as any)[dayOfWeek.toString()];

          

          if (daySchedule) {

            workStartTime = daySchedule.start || workStartTime;

            workEndTime = daySchedule.end || workEndTime;

            if (daySchedule.break_start && daySchedule.break_end) {

              breakStartTime = daySchedule.break_start;

              breakEndTime = daySchedule.break_end;

              hasBreak = true;

            }

          }

        }

      }

      

      // Buscar agendamentos existentes

      let appointmentsQuery = supabase

        .from('appointments')

        .select('start_time, end_time')

        .eq('user_id', userId)

        .eq('appointment_date', date)

        .in('status', ['pending', 'confirmed']);

      

      if (professionalId) {

        appointmentsQuery = appointmentsQuery.eq('professional_id', professionalId);

      }

      

      const { data: existingAppointments } = await appointmentsQuery;

      

      // Gerar slots disponíveis

      const slots: { time: string; available: boolean }[] = [];

      

      const parseTime = (time: string) => {

        const [h, m] = time.split(':').map(Number);

        return h * 60 + m;

      };

      

      const formatTime = (minutes: number) => {

        const h = Math.floor(minutes / 60);

        const m = minutes % 60;

        return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;

      };

      

      const startMinutes = parseTime(workStartTime);

      const endMinutes = parseTime(workEndTime);

      const breakStart = hasBreak ? parseTime(breakStartTime) : 0;

      const breakEnd = hasBreak ? parseTime(breakEndTime) : 0;

      

      for (let time = startMinutes; time + serviceDuration <= endMinutes; time += serviceDuration + bufferAfter) {

        // Pular horário de almoço

        if (hasBreak && time < breakEnd && time + serviceDuration > breakStart) {

          time = breakEnd - serviceDuration - bufferAfter;

          continue;

        }

        

        const slotTime = formatTime(time);

        const slotEnd = formatTime(time + serviceDuration);

        

        // Verificar conflito com agendamentos existentes

        const hasConflict = (existingAppointments || []).some(apt => {

          const aptStart = parseTime(apt.start_time);

          const aptEnd = parseTime(apt.end_time);

          return time < aptEnd && time + serviceDuration > aptStart;

        });

        

        slots.push({ time: slotTime, available: !hasConflict });

      }

      

      res.json({ slots, serviceDuration, date });

    } catch (error: any) {

      console.error("Error fetching available slots:", error);

      res.status(500).json({ message: "Falha ao buscar horários disponíveis" });

    }

  });



  /**

   * Habilitar múltiplos serviços/profissionais na config

   * PUT /api/scheduling/config/advanced

   */

  app.put("/api/scheduling/config/advanced", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { 

        useServices, useProfessionals, aiSchedulingEnabled, 

        aiCanSuggestProfessional, aiCanSuggestService, 

        bookingLinkSlug, publicBookingEnabled, googleCalendarEnabled,

        use_services, use_professionals, ai_scheduling_enabled,

        google_calendar_enabled

      } = req.body;

      

      const updates: any = { updated_at: new Date().toISOString() };

      

      // Support both camelCase and snake_case

      if (useServices !== undefined || use_services !== undefined) 

        updates.use_services = useServices ?? use_services;

      if (useProfessionals !== undefined || use_professionals !== undefined) 

        updates.use_professionals = useProfessionals ?? use_professionals;

      if (aiSchedulingEnabled !== undefined || ai_scheduling_enabled !== undefined) 

        updates.ai_scheduling_enabled = aiSchedulingEnabled ?? ai_scheduling_enabled;

      if (aiCanSuggestProfessional !== undefined) 

        updates.ai_can_suggest_professional = aiCanSuggestProfessional;

      if (aiCanSuggestService !== undefined) 

        updates.ai_can_suggest_service = aiCanSuggestService;

      if (bookingLinkSlug !== undefined) 

        updates.booking_link_slug = bookingLinkSlug;

      if (publicBookingEnabled !== undefined) 

        updates.public_booking_enabled = publicBookingEnabled;

      if (googleCalendarEnabled !== undefined || google_calendar_enabled !== undefined) 

        updates.google_calendar_enabled = googleCalendarEnabled ?? google_calendar_enabled;

      

      const { data, error } = await supabase

        .from('scheduling_config')

        .update(updates)

        .eq('user_id', userId)

        .select()

        .single();

      

      if (error) throw error;

      res.json(data);

    } catch (error: any) {

      console.error("Error updating advanced config:", error);

      res.status(500).json({ message: "Falha ao atualizar configurações avançadas" });

    }

  });



  /**

   * Obter URL de conexão do Google Calendar para Scheduling

   * GET /api/scheduling/google-calendar/connect

   */

  app.get("/api/scheduling/google-calendar/connect", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      if (!isGoogleCalendarConfigured()) {

        return res.status(400).json({ 

          message: "Google Calendar não está configurado no servidor." 

        });

      }

      

      const authUrl = getGoogleAuthUrl(userId);

      res.json({ authUrl });

    } catch (error: any) {

      console.error("Error getting Google auth URL:", error);

      res.status(500).json({ message: "Falha ao obter URL de autenticação" });

    }

  });



  /**

   * Desconectar Google Calendar do Scheduling

   * POST /api/scheduling/google-calendar/disconnect

   */

  app.post("/api/scheduling/google-calendar/disconnect", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const result = await disconnectGoogleCalendar(userId);

      

      if (result.success) {

        // Também atualizar config

        await supabase

          .from('scheduling_config')

          .update({ google_calendar_enabled: false })

          .eq('user_id', userId);

        

        res.json({ message: "Google Calendar desconectado com sucesso" });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error disconnecting Google Calendar:", error);

      res.status(500).json({ message: "Falha ao desconectar" });

    }

  });



  /**

   * Obter status do Google Calendar para Scheduling

   * GET /api/scheduling/google-calendar/status

   */

  app.get("/api/scheduling/google-calendar/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const status = await getGoogleCalendarStatus(userId);

      res.json(status);

    } catch (error: any) {

      console.error("Error getting Google Calendar status:", error);

      res.status(500).json({ message: "Falha ao obter status" });

    }

  });



  // =====================================================================

  // GOOGLE CALENDAR INTEGRATION ROUTES

  // =====================================================================



  /**

   * Verificar status da integração Google Calendar

   * GET /api/google-calendar/status

   */

  app.get("/api/google-calendar/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const status = await getGoogleCalendarStatus(userId);

      res.json(status);

    } catch (error: any) {

      console.error("Error getting Google Calendar status:", error);

      res.status(500).json({ message: "Failed to get status" });

    }

  });



  /**

   * Verificar se Google Calendar está configurado no servidor

   * GET /api/google-calendar/configured

   */

  app.get("/api/google-calendar/configured", isAuthenticated, async (req: any, res) => {

    res.json({ configured: isGoogleCalendarConfigured() });

  });



  /**

   * Iniciar fluxo OAuth do Google Calendar

   * GET /api/google-calendar/auth

   */

  app.get("/api/google-calendar/auth", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      if (!isGoogleCalendarConfigured()) {

        return res.status(400).json({ 

          message: "Google Calendar não está configurado. Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET." 

        });

      }

      

      const authUrl = getGoogleAuthUrl(userId);

      res.json({ authUrl });

    } catch (error: any) {

      console.error("Error generating auth URL:", error);

      res.status(500).json({ message: error.message });

    }

  });



  /**

   * Callback do OAuth Google (redirecionamento)

   * GET /api/google-calendar/callback?code=...&state=...

   */

  app.get("/api/google-calendar/callback", async (req, res) => {

    try {

      const { code, state: userId, error: oauthError } = req.query;

      

      if (oauthError) {

        console.error('[GoogleCalendar] OAuth error:', oauthError);

        return res.redirect('/#/agendamentos?google_error=' + encodeURIComponent(String(oauthError)));

      }

      

      if (!code || !userId) {

        return res.redirect('/#/agendamentos?google_error=missing_params');

      }

      

      const result = await handleGoogleCallback(code as string, userId as string);

      

      if (result.success) {

        console.log(`[GoogleCalendar] Conectado com sucesso para usuário ${userId}`);

        res.redirect('/#/agendamentos?google_connected=true');

      } else {

        console.error('[GoogleCalendar] Erro no callback:', result.error);

        res.redirect('/#/agendamentos?google_error=' + encodeURIComponent(result.error || 'unknown'));

      }

    } catch (error: any) {

      console.error("Error in Google Calendar callback:", error);

      res.redirect('/#/agendamentos?google_error=' + encodeURIComponent(error.message));

    }

  });



  /**

   * Desconectar Google Calendar

   * POST /api/google-calendar/disconnect

   */

  app.post("/api/google-calendar/disconnect", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const result = await disconnectGoogleCalendar(userId);

      

      if (result.success) {

        res.json({ message: "Google Calendar desconectado com sucesso" });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error disconnecting Google Calendar:", error);

      res.status(500).json({ message: "Failed to disconnect" });

    }

  });



  /**

   * Listar eventos do Google Calendar

   * GET /api/google-calendar/events?from=2025-01-01&to=2025-01-31

   */

  app.get("/api/google-calendar/events", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { from, to } = req.query;

      

      if (!from || !to) {

        return res.status(400).json({ message: "from and to dates are required" });

      }

      

      const startDate = new Date(from as string);

      const endDate = new Date(to as string);

      

      const result = await listCalendarEvents(userId, startDate, endDate);

      

      if (result.success) {

        res.json({ events: result.events });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error listing Google Calendar events:", error);

      res.status(500).json({ message: "Failed to list events" });

    }

  });



  /**

   * Sincronizar agendamento com Google Calendar

   * POST /api/google-calendar/sync-appointment/:appointmentId

   */

  app.post("/api/google-calendar/sync-appointment/:appointmentId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { appointmentId } = req.params;

      

      // Buscar agendamento

      const { data: appointment, error: apptError } = await supabase

        .from('appointments')

        .select('*')

        .eq('id', appointmentId)

        .eq('user_id', userId)

        .single();

      

      if (apptError || !appointment) {

        return res.status(404).json({ message: "Agendamento não encontrado" });

      }

      

      // Buscar configuração para duração

      const { data: config } = await supabase

        .from('scheduling_config')

        .select('slot_duration, service_name')

        .eq('user_id', userId)

        .single();

      

      const result = await syncAppointmentToCalendar(userId, {

        id: appointment.id,

        clientName: appointment.client_name,

        clientPhone: appointment.client_phone,

        appointmentDate: appointment.appointment_date,

        appointmentTime: appointment.start_time,

        serviceName: appointment.service_name || config?.service_name,

        notes: appointment.notes,

        googleEventId: appointment.google_event_id,

      }, config?.slot_duration || 60);

      

      if (result.success && result.eventId) {

        // Salvar eventId no agendamento

        await supabase

          .from('appointments')

          .update({ 

            google_event_id: result.eventId,

            updated_at: new Date().toISOString()

          })

          .eq('id', appointmentId);

        

        res.json({ 

          message: "Sincronizado com Google Calendar",

          eventId: result.eventId 

        });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error syncing appointment:", error);

      res.status(500).json({ message: "Failed to sync appointment" });

    }

  });



  /**

   * Remover evento do Google Calendar

   * DELETE /api/google-calendar/event/:eventId

   */

  app.delete("/api/google-calendar/event/:eventId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { eventId } = req.params;

      

      const result = await removeAppointmentFromCalendar(userId, eventId);

      

      if (result.success) {

        res.json({ message: "Evento removido do Google Calendar" });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error removing calendar event:", error);

      res.status(500).json({ message: "Failed to remove event" });

    }

  });



  /**

   * Verificar disponibilidade no Google Calendar

   * GET /api/google-calendar/check-availability?start=...&end=...

   */

  app.get("/api/google-calendar/check-availability", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { start, end } = req.query;

      

      if (!start || !end) {

        return res.status(400).json({ message: "start and end datetimes are required" });

      }

      

      const result = await checkCalendarAvailability(userId, start as string, end as string);

      res.json(result);

    } catch (error: any) {

      console.error("Error checking calendar availability:", error);

      res.status(500).json({ message: "Failed to check availability" });

    }

  });



  // ============================================================

  // ROTAS DE REVENDA WHITE-LABEL

  // ============================================================



  /**

   * Verificar se o usuário tem plano de revenda

   * GET /api/reseller/status

   */

  app.get("/api/reseller/status", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const hasReseller = await resellerService.hasResellerPlan(userId);

      const reseller = await storage.getResellerByUserId(userId);

      

      res.json({ 

        hasResellerPlan: hasReseller,

        reseller: reseller || null

      });

    } catch (error: any) {

      console.error("Error checking reseller status:", error);

      res.status(500).json({ message: "Erro ao verificar status de revenda" });

    }

  });



  /**

   * Obter/Criar/Atualizar perfil do revendedor

   * GET/POST/PUT /api/reseller/profile

   */

  app.get("/api/reseller/profile", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verificar se tem plano de revenda

      const hasReseller = await resellerService.hasResellerPlan(userId);

      if (!hasReseller) {

        return res.status(403).json({ message: "Você não possui plano de revenda ativo" });

      }

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(404).json({ message: "Perfil de revendedor não encontrado. Configure seu perfil." });

      }

      

      res.json(reseller);

    } catch (error: any) {

      console.error("Error getting reseller profile:", error);

      res.status(500).json({ message: "Erro ao obter perfil de revendedor" });

    }

  });



  app.post("/api/reseller/profile", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      // Verificar se tem plano de revenda

      const hasReseller = await resellerService.hasResellerPlan(userId);

      if (!hasReseller) {

        return res.status(403).json({ message: "Você não possui plano de revenda ativo" });

      }

      

      const result = await resellerService.setupReseller(userId, req.body);

      

      if (result.success) {

        res.json({ message: "Perfil de revendedor configurado com sucesso", reseller: result.reseller });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error creating reseller profile:", error);

      res.status(500).json({ message: "Erro ao criar perfil de revendedor" });

    }

  });



  app.put("/api/reseller/profile", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(404).json({ message: "Perfil de revendedor não encontrado" });

      }

      

      const updated = await storage.updateReseller(reseller.id, req.body);

      res.json({ message: "Perfil atualizado com sucesso", reseller: updated });

    } catch (error: any) {

      console.error("Error updating reseller profile:", error);

      res.status(500).json({ message: "Erro ao atualizar perfil de revendedor" });

    }

  });



  /**

   * Listar clientes do revendedor

   * GET /api/reseller/clients

   */

  app.get("/api/reseller/clients", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const clients = await storage.getResellerClients(reseller.id);

      res.json(clients);

    } catch (error: any) {

      console.error("Error listing reseller clients:", error);

      res.status(500).json({ message: "Erro ao listar clientes" });

    }

  });



  /**

   * Criar novo cliente do revendedor

   * POST /api/reseller/clients

   */

  app.post("/api/reseller/clients", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { email, name, phone, password } = req.body;

      

      if (!email || !name || !password) {

        return res.status(400).json({ message: "Email, nome e senha são obrigatórios" });

      }

      

      // Obter o revendedor

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const result = await resellerService.createClient({

        resellerId: reseller.id,

        email,

        name,

        phone: phone || '',

        password

      });

      

      if (result.success) {

        res.json({ 

          message: "Cliente criado com sucesso",

          clientId: result.clientId,

          userId: result.userId,

          paymentUrl: result.paymentUrl

        });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error creating reseller client:", error);

      res.status(500).json({ message: "Erro ao criar cliente" });

    }

  });



  /**

   * Suspender cliente do revendedor

   * POST /api/reseller/clients/:clientId/suspend

   */

  app.post("/api/reseller/clients/:clientId/suspend", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      await storage.suspendResellerClient(clientId);

      res.json({ message: "Cliente suspenso com sucesso" });

    } catch (error: any) {

      console.error("Error suspending client:", error);

      res.status(500).json({ message: "Erro ao suspender cliente" });

    }

  });



  /**

   * Reativar cliente do revendedor

   * POST /api/reseller/clients/:clientId/reactivate

   */

  app.post("/api/reseller/clients/:clientId/reactivate", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      await storage.reactivateResellerClient(clientId);

      res.json({ message: "Cliente reativado com sucesso" });

    } catch (error: any) {

      console.error("Error reactivating client:", error);

      res.status(500).json({ message: "Erro ao reativar cliente" });

    }

  });



  /**

   * Cancelar cliente do revendedor

   * POST /api/reseller/clients/:clientId/cancel

   */

  app.post("/api/reseller/clients/:clientId/cancel", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      await storage.cancelResellerClient(clientId);

      res.json({ message: "Cliente cancelado com sucesso" });

    } catch (error: any) {

      console.error("Error canceling client:", error);

      res.status(500).json({ message: "Erro ao cancelar cliente" });

    }

  });



  /**

   * Pagar antecipado (adiciona 30 dias ao saasPaidUntil)

   * POST /api/reseller/clients/:clientId/pay-ahead

   */

  app.post("/api/reseller/clients/:clientId/pay-ahead", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Calcular nova data (atual saasPaidUntil + 30 dias)

      let currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : new Date();

      if (currentSaaSDate < new Date()) {

        currentSaaSDate = new Date(); // Se já venceu, começa de hoje

      }

      

      const newDate = new Date(currentSaaSDate);

      newDate.setDate(newDate.getDate() + 30);

      

      // Calcular referência do mês

      const referenceMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;

      

      // Preço do cliente

      const clientPrice = parseFloat(client.clientPrice || client.monthlyCost || reseller.clientMonthlyPrice || '49.99');

      

      // Criar ou obter fatura do mês atual

      let invoice = await db.query.resellerInvoices.findFirst({

        where: and(

          eq(resellerInvoicesTable.resellerId, reseller.id),

          eq(resellerInvoicesTable.referenceMonth, referenceMonth)

        ),

      });

      

      if (!invoice) {

        // Criar nova fatura

        const [newInvoice] = await db.insert(resellerInvoicesTable).values({

          resellerId: reseller.id,

          amount: clientPrice.toFixed(2),

          status: 'paid',

          referenceMonth,

          dueDate: newDate,

          paymentMethod: 'pay_ahead',

          paidAt: new Date(),

        }).returning();

        invoice = newInvoice;

      }

      

      // Adicionar item da fatura para este cliente

      await db.insert(resellerInvoiceItemsTable).values({

        invoiceId: invoice.id,

        resellerClientId: clientId,

        amount: clientPrice.toFixed(2),

        description: `Pagamento Antecipado - ${client.userId}`,

      });

      

      // Atualizar cliente

      await storage.updateResellerClient(clientId, {

        saasPaidUntil: newDate,

        saasStatus: "active",

        status: "active",

        nextPaymentDate: newDate,

      });

      

      res.json({ 

        message: "Pagamento antecipado processado",

        saasPaidUntil: newDate.toISOString(),

      });

    } catch (error: any) {

      console.error("Error processing pay-ahead:", error);

      res.status(500).json({ message: "Erro ao processar pagamento antecipado" });

    }

  });



  /**

   * Pagar anual (adiciona 365 dias ao saasPaidUntil)

   * POST /api/reseller/clients/:clientId/pay-annual

   */

  app.post("/api/reseller/clients/:clientId/pay-annual", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Calcular nova data (atual saasPaidUntil + 365 dias)

      let currentSaaSDate = client.saasPaidUntil ? new Date(client.saasPaidUntil) : new Date();

      if (currentSaaSDate < new Date()) {

        currentSaaSDate = new Date(); // Se já venceu, começa de hoje

      }

      

      const newDate = new Date(currentSaaSDate);

      newDate.setDate(newDate.getDate() + 365);

      

      // Preço do cliente

      const clientPrice = parseFloat(client.clientPrice || client.monthlyCost || reseller.clientMonthlyPrice || '49.99');

      const annualPrice = clientPrice * 12; // 12 meses

      

      // Calcular referência do mês

      const referenceMonth = `${newDate.getFullYear()}-${String(newDate.getMonth() + 1).padStart(2, '0')}`;

      

      // Criar fatura anual

      const [invoice] = await db.insert(resellerInvoicesTable).values({

        resellerId: reseller.id,

        amount: annualPrice.toFixed(2),

        status: 'paid',

        referenceMonth,

        dueDate: newDate,

        paymentMethod: 'pay_annual',

        paidAt: new Date(),

      }).returning();

      

      // Adicionar item da fatura para este cliente

      await db.insert(resellerInvoiceItemsTable).values({

        invoiceId: invoice.id,

        resellerClientId: clientId,

        amount: annualPrice.toFixed(2),

        description: `Pagamento Anual (12 meses) - ${client.userId}`,

      });

      

      // Atualizar cliente

      await storage.updateResellerClient(clientId, {

        saasPaidUntil: newDate,

        saasStatus: "active",

        status: "active",

        nextPaymentDate: newDate,

      });

      

      res.json({ 

        message: "Pagamento anual processado",

        saasPaidUntil: newDate.toISOString(),

      });

    } catch (error: any) {

      console.error("Error processing annual payment:", error);

      res.status(500).json({ message: "Erro ao processar pagamento anual" });

    }

  });



  /**

   * Gerar PIX para pagamento mensal de um cliente (revendedor paga ao dono do sistema)

   * POST /api/reseller/clients/:clientId/generate-pix

   * IMPORTANTE: Este PIX é para o REVENDEDOR pagar ao DONO DO SISTEMA via Mercado Pago

   */

  app.post("/api/reseller/clients/:clientId/generate-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Buscar usuário do cliente para obter email

      const clientUser = await storage.getUser(client.userId);

      if (!clientUser) {

        return res.status(404).json({ message: "Usuário do cliente não encontrado" });

      }

      

      // Calcular valor mensal - usa o custo que o REVENDEDOR paga ao dono do sistema

      // O valor do plano do revendedor é o que ele paga por cliente

      const monthlyValue = parseFloat(client.monthlyCost || reseller.clientMonthlyPrice || '49.99');

      

      if (!monthlyValue || isNaN(monthlyValue) || monthlyValue <= 0) {

        return res.status(400).json({ message: "Valor mensal inválido" });

      }

      

      // Get MP credentials - usa as credenciais do SISTEMA (dono da plataforma)

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Usar email do revendedor como pagador (ele que está pagando)

      const resellerUser = await storage.getUser(userId);

      const payerEmail = resellerUser?.email || '';

      

      if (!payerEmail) {

        return res.status(400).json({ message: "Email do revendedor não encontrado" });

      }

      

      console.log("[RESELLER PIX] Gerando PIX - Revendedor:", reseller.companyName, "Cliente:", clientUser.name, "Valor:", monthlyValue);

      

      // Create PIX payment via Mercado Pago

      const pixPaymentData = {

        transaction_amount: monthlyValue,

        payment_method_id: "pix",

        description: `Mensalidade Cliente ${clientUser.name || clientUser.email} - ${reseller.companyName} - AgenteZap`,

        payer: {

          email: payerEmail,

        },

        external_reference: `reseller_pix_${reseller.id}_${clientId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

      };

      

      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `reseller_pix_${clientId}_${Date.now()}`,

        },

        body: JSON.stringify(pixPaymentData),

      });

      

      const pixResult = await pixResponse.json();

      

      if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {

        const transactionData = pixResult.point_of_interaction.transaction_data;

        

        // Registrar pagamento pendente

        const referenceMonth = new Date().toISOString().slice(0, 7);

        await db.insert(resellerInvoicesTable).values({

          resellerId: reseller.id,

          totalAmount: monthlyValue.toFixed(2),

          activeClients: 1,

          unitPrice: monthlyValue.toFixed(2),

          status: 'pending',

          referenceMonth,

          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

          paymentMethod: 'pix',

          mpPaymentId: pixResult.id?.toString(),

        });

        

        return res.json({

          status: "pending",

          message: "PIX gerado com sucesso! Escaneie o QR Code para pagar.",

          paymentId: pixResult.id,

          qrCode: transactionData.qr_code,

          qrCodeBase64: transactionData.qr_code_base64,

          ticketUrl: transactionData.ticket_url,

          expirationDate: pixResult.date_of_expiration,

          amount: monthlyValue,

          clientName: clientUser.name || clientUser.email,

        });

      } else {

        console.error("[RESELLER PIX] Erro Mercado Pago:", pixResult);

        return res.json({

          status: "error",

          message: pixResult.message || "Erro ao gerar PIX",

        });

      }

    } catch (error: any) {

      console.error("[RESELLER PIX] Erro:", error);

      res.status(500).json({ message: error.message || "Erro ao gerar PIX" });

    }

  });



  /**

   * Gerar PIX para pagamento anual de um cliente (revendedor paga ao dono do sistema)

   * POST /api/reseller/clients/:clientId/generate-annual-pix

   * IMPORTANTE: Este PIX é para o REVENDEDOR pagar ao DONO DO SISTEMA via Mercado Pago (12 meses com desconto)

   */

  app.post("/api/reseller/clients/:clientId/generate-annual-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      const { discountPercent = 5 } = req.body;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Buscar usuário do cliente para obter nome

      const clientUser = await storage.getUser(client.userId);

      if (!clientUser) {

        return res.status(404).json({ message: "Usuário do cliente não encontrado" });

      }

      

      // Calcular valor anual com desconto

      const monthlyValue = parseFloat(client.monthlyCost || reseller.clientMonthlyPrice || '49.99');

      

      if (!monthlyValue || isNaN(monthlyValue) || monthlyValue <= 0) {

        return res.status(400).json({ message: "Valor mensal inválido" });

      }

      

      const annualValue = monthlyValue * 12;

      const discount = annualValue * (discountPercent / 100);

      const finalValue = Math.round((annualValue - discount) * 100) / 100;

      

      console.log("[RESELLER ANNUAL PIX] Valores:", { monthlyValue, annualValue, discount, finalValue, discountPercent });

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Usar email do revendedor como pagador

      const resellerUser = await storage.getUser(userId);

      const payerEmail = resellerUser?.email || '';

      

      if (!payerEmail) {

        return res.status(400).json({ message: "Email do revendedor não encontrado" });

      }

      

      // Create PIX payment via Mercado Pago

      const pixPaymentData = {

        transaction_amount: finalValue,

        payment_method_id: "pix",

        description: `Plano Anual (12 meses) Cliente ${clientUser.name || clientUser.email} - ${reseller.companyName} - AgenteZap - ${discountPercent}% desconto`,

        payer: {

          email: payerEmail,

        },

        external_reference: `reseller_annual_pix_${reseller.id}_${clientId}_${Date.now()}`,

        notification_url: `${process.env.BASE_URL || 'https://agentezap.online'}/api/webhooks/mercadopago`,

        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString(),

      };

      

      const pixResponse = await fetch("https://api.mercadopago.com/v1/payments", {

        method: "POST",

        headers: {

          "Content-Type": "application/json",

          "Authorization": `Bearer ${accessToken}`,

          "X-Idempotency-Key": `reseller_annual_pix_${clientId}_${Date.now()}`,

        },

        body: JSON.stringify(pixPaymentData),

      });

      

      const pixResult = await pixResponse.json();

      

      if (pixResult.status === "pending" && pixResult.point_of_interaction?.transaction_data) {

        const transactionData = pixResult.point_of_interaction.transaction_data;

        

        // Registrar pagamento pendente (anual = 12 meses)

        const referenceMonth = new Date().toISOString().slice(0, 7);

        await db.insert(resellerInvoicesTable).values({

          resellerId: reseller.id,

          totalAmount: finalValue.toFixed(2),

          activeClients: 1,

          unitPrice: monthlyValue.toFixed(2),

          status: 'pending',

          referenceMonth,

          dueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],

          paymentMethod: 'pix_annual',

          mpPaymentId: pixResult.id?.toString(),

        });

        

        return res.json({

          status: "pending",

          message: "PIX Anual gerado com sucesso!",

          paymentId: pixResult.id,

          qrCode: transactionData.qr_code,

          qrCodeBase64: transactionData.qr_code_base64,

          ticketUrl: transactionData.ticket_url,

          expirationDate: pixResult.date_of_expiration,

          amount: finalValue,

          originalAmount: annualValue,

          discountPercent,

          discountAmount: discount,

          clientName: clientUser.name || clientUser.email,

        });

      } else {

        console.error("[RESELLER ANNUAL PIX] Erro Mercado Pago:", pixResult);

        return res.json({

          status: "error",

          message: pixResult.message || "Erro ao gerar PIX",

        });

      }

    } catch (error: any) {

      console.error("[RESELLER ANNUAL PIX] Erro:", error);

      res.status(500).json({ message: error.message || "Erro ao gerar PIX anual" });

    }

  });



  /**

   * Verificar status de pagamento PIX do revendedor

   * GET /api/reseller/check-pix-status/:paymentId

   */

  app.get("/api/reseller/check-pix-status/:paymentId", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const paymentId = req.params.paymentId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Get MP credentials

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const accessToken = configMap.get("mercadopago_access_token");

      

      if (!accessToken) {

        return res.status(500).json({ message: "Mercado Pago não configurado" });

      }

      

      // Check payment status

      const response = await fetch(`https://api.mercadopago.com/v1/payments/${paymentId}`, {

        headers: {

          "Authorization": `Bearer ${accessToken}`,

        },

      });

      

      const payment = await response.json();

      

      return res.json({

        status: payment.status,

        statusDetail: payment.status_detail,

      });

    } catch (error: any) {

      console.error("[RESELLER PIX STATUS] Erro:", error);

      res.status(500).json({ message: error.message || "Erro ao verificar status do PIX" });

    }

  });



  /**

   * Obter métricas do dashboard do revendedor

   * GET /api/reseller/dashboard

   */

  app.get("/api/reseller/dashboard", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const metrics = await storage.getResellerDashboardMetrics(reseller.id);

      res.json(metrics);

    } catch (error: any) {

      console.error("Error getting reseller dashboard:", error);

      res.status(500).json({ message: "Erro ao obter métricas do dashboard" });

    }

  });



  /**

   * Obter histórico de pagamentos do revendedor

   * GET /api/reseller/payments

   */

  app.get("/api/reseller/payments", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const payments = await storage.getResellerPayments(reseller.id);

      res.json(payments);

    } catch (error: any) {

      console.error("Error getting reseller payments:", error);

      res.status(500).json({ message: "Erro ao obter histórico de pagamentos" });

    }

  });



  /**

   * Webhook para pagamentos de criação de cliente

   * POST /api/reseller/webhook/payment

   */

  app.post("/api/reseller/webhook/payment", async (req: any, res) => {

    try {

      const { external_reference, status, payment_id } = req.body;

      

      if (!external_reference) {

        return res.status(400).json({ message: "external_reference é obrigatório" });

      }

      

      await resellerService.processPaymentWebhook(external_reference, status, payment_id);

      res.json({ message: "Pagamento processado com sucesso" });

    } catch (error: any) {

      console.error("Error processing reseller payment webhook:", error);

      res.status(500).json({ message: "Erro ao processar webhook de pagamento" });

    }

  });



  /**

   * Criar fatura granular para clientes selecionados

   * POST /api/reseller/invoices/custom

   */

  app.post("/api/reseller/invoices/custom", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { clientIds } = req.body;



      if (!clientIds || !Array.isArray(clientIds) || clientIds.length === 0) {

        return res.status(400).json({ message: "clientIds é obrigatório e deve ser um array não vazio" });

      }



      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }



      const result = await resellerService.createGranularInvoice(reseller.id, clientIds);

      

      if (!result.success) {

        return res.status(400).json({ message: result.error });

      }



      res.json({

        success: true,

        invoiceId: result.invoiceId,

        paymentUrl: result.paymentUrl,

        qrCode: result.qrCode,

        totalAmount: result.totalAmount

      });

    } catch (error: any) {

      console.error("Error creating granular invoice:", error);

      res.status(500).json({ message: "Erro ao criar fatura" });

    }

  });



  /**

   * Verificar se pode criar cliente gratuito

   * GET /api/reseller/free-client-available

   */

  app.get("/api/reseller/free-client-available", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const hasFreeSlot = await resellerService.hasFreeClientSlot(reseller.id);

      const usedFreeClients = await storage.countFreeResellerClients(reseller.id);

      

      res.json({ 

        available: hasFreeSlot,

        used: usedFreeClients,

        limit: 1, // 1 cliente gratuito por revendedor

      });

    } catch (error: any) {

      console.error("Error checking free client slot:", error);

      res.status(500).json({ message: "Erro ao verificar slot gratuito" });

    }

  });



  /**

   * Criar cliente gratuito (para demonstração - 1 por revendedor)

   * POST /api/reseller/clients/free

   */

  app.post("/api/reseller/clients/free", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { email, name, phone, password, clientPrice } = req.body;

      

      if (!email || !name || !password) {

        return res.status(400).json({ message: "Email, nome e senha são obrigatórios" });

      }

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const result = await resellerService.createFreeClient({

        resellerId: reseller.id,

        email,

        name,

        phone: phone || '',

        password,

        clientPrice,

        isFreeClient: true,

      });

      

      if (result.success) {

        res.json({ 

          message: "Cliente de demonstração criado com sucesso!",

          clientId: result.clientId,

          userId: result.userId,

        });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error creating free client:", error);

      res.status(500).json({ message: "Erro ao criar cliente gratuito" });

    }

  });



  /**

   * Iniciar checkout para criar cliente (PIX ou Cartão)

   * POST /api/reseller/clients/checkout

   */

  app.post("/api/reseller/clients/checkout", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, email, phone, password, clientPrice, paymentMethod, cardData } = req.body;

      

      if (!email || !name || !password) {

        return res.status(400).json({ message: "Dados do cliente incompletos" });

      }

      

      if (!paymentMethod || !['pix', 'credit_card'].includes(paymentMethod)) {

        return res.status(400).json({ message: "Método de pagamento inválido" });

      }

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const result = await resellerService.createClientCheckout({

        resellerId: reseller.id,

        clientData: { name, email, phone: phone || '', password, clientPrice },

        paymentMethod,

        cardData,

      });

      

      if (result.success) {

        res.json(result);

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error creating checkout:", error);

      res.status(500).json({ message: "Erro ao criar checkout" });

    }

  });



  /**

   * Confirmar pagamento PIX manualmente (para testes ou confirmação manual)

   * POST /api/reseller/payments/:paymentId/confirm

   */

  app.post("/api/reseller/payments/:paymentId/confirm", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const paymentId = req.params.paymentId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o pagamento pertence ao revendedor

      const payment = await storage.getResellerPayment(paymentId);

      if (!payment || payment.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Pagamento não encontrado" });

      }

      

      const result = await resellerService.confirmPixPayment(paymentId);

      

      if (result.success) {

        res.json({ 

          message: "Pagamento confirmado e cliente criado com sucesso!",

          clientId: result.clientId,

          userId: result.userId,

        });

      } else {

        res.status(400).json({ message: result.error });

      }

    } catch (error: any) {

      console.error("Error confirming payment:", error);

      res.status(500).json({ message: "Erro ao confirmar pagamento" });

    }

  });



  /**

   * Obter plano do cliente da revenda (para mostrar na página de planos)

   * GET /api/user/reseller-plan

   */

  app.get("/api/user/reseller-plan", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const user = await storage.getUser(userId);

      

      // Verificar se é cliente de revenda de duas formas:

      // 1. Campo resellerId no user

      // 2. Registro na tabela reseller_clients

      let resellerId = user?.resellerId;

      let resellerClient = null;

      

      // Se não tem resellerId diretamente, verificar na tabela reseller_clients

      if (!resellerId) {

        resellerClient = await storage.getResellerClientByUserId(userId);

        if (resellerClient) {

          resellerId = resellerClient.resellerId;

        }

      }

      

      if (!resellerId) {

        // Não é cliente de revenda - retornar null para mostrar planos normais

        return res.json({ isResellerClient: false });

      }

      

      // É cliente de revenda - buscar dados do revendedor e do cliente

      const reseller = await storage.getReseller(resellerId);

      if (!reseller || !reseller.isActive) {

        return res.json({ isResellerClient: false });

      }

      

      // Buscar dados do cliente da revenda se ainda não temos

      if (!resellerClient) {

        resellerClient = await storage.getResellerClientByUserId(userId);

      }

      

      // Calcular o preço que o cliente vê (definido pelo revendedor)

      const clientPrice = resellerClient?.clientPrice || reseller.clientMonthlyPrice || "99.99";

      

      res.json({

        isResellerClient: true,

        plan: {

          name: "Plano Ilimitado",

          price: clientPrice,

          features: [

            "Conversas ilimitadas",

            "Agente IA avançado",

            "Follow-up automático",

            "Suporte prioritário",

            "Todas as funcionalidades"

          ],

        },

        reseller: {

          companyName: reseller.companyName,

          supportEmail: reseller.supportEmail,

          supportPhone: reseller.supportPhone,

          primaryColor: reseller.primaryColor,

          pixKey: reseller.pixKey,

          pixKeyType: reseller.pixKeyType,

          pixHolderName: (reseller as any).pixHolderName,

          pixBankName: (reseller as any).pixBankName,

        },

        status: resellerClient?.status || "pending",

      });

    } catch (error: any) {

      console.error("Error getting reseller plan:", error);

      res.status(500).json({ message: "Erro ao obter plano" });

    }

  });



  /**

   * Criar assinatura para cliente de revenda

   * POST /api/reseller-client/subscription/create

   * Cria uma assinatura usando o preço definido pelo revendedor

   */

  app.post("/api/reseller-client/subscription/create", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const user = await storage.getUser(userId);



      if (!user || !user.resellerId) {

        return res.status(403).json({ message: "Apenas clientes de revenda podem usar esta rota" });

      }



      // Buscar dados do revendedor e cliente

      const reseller = await storage.getReseller(user.resellerId);

      if (!reseller || !reseller.isActive) {

        return res.status(403).json({ message: "Revendedor inativo" });

      }



      const resellerClient = await storage.getResellerClientByUserId(userId);

      if (!resellerClient) {

        return res.status(404).json({ message: "Cliente de revenda não encontrado" });

      }



      // Verificar se já tem assinatura ativa

      const existingSubscription = await storage.getUserSubscription(userId);

      if (existingSubscription?.status === "active") {

        return res.status(400).json({ message: "Você já possui uma assinatura ativa" });

      }



      // Calcular o preço do cliente

      const clientPrice = resellerClient.clientPrice || reseller.clientMonthlyPrice || "99.99";



      // Buscar ou criar um plano para o cliente de revenda

      // Primeiro, tentar encontrar um plano com o mesmo valor

      let plan = await db.query.plans.findFirst({

        where: and(

          eq(plans.valor, clientPrice),

          eq(plans.ativo, true)

        )

      });



      // Se não encontrar, usar o plano Pro padrão e ajustar o preço via couponPrice

      if (!plan) {

        plan = await db.query.plans.findFirst({

          where: eq(plans.ativo, true),

          orderBy: [desc(plans.createdAt)]

        });

      }



      if (!plan) {

        return res.status(500).json({ message: "Nenhum plano disponível no sistema" });

      }



      // Verificar se já existe assinatura pendente recente

      const recentPendingSubscription = await db.query.subscriptions.findFirst({

        where: and(

          eq(subscriptions.userId, userId),

          eq(subscriptions.status, "pending"),

          gte(subscriptions.createdAt, new Date(Date.now() - 5 * 60 * 1000))

        ),

        orderBy: [desc(subscriptions.createdAt)]

      });



      if (recentPendingSubscription) {

        console.log(`[Reseller Client] Reutilizando assinatura pendente: ${recentPendingSubscription.id}`);

        return res.json(recentPendingSubscription);

      }



      // Criar assinatura com o preço do cliente de revenda

      const subscription = await storage.createSubscription({

        userId,

        planId: plan.id,

        status: "pending",

        dataInicio: new Date(),

        // Usar couponPrice para definir o preço real que o cliente vai pagar

        couponPrice: clientPrice,

        couponCode: `RESELLER_${reseller.id.substring(0, 8)}`,

      });



      console.log(`[Reseller Client] Assinatura criada: ${subscription.id} - Preço: R$ ${clientPrice}`);



      res.json(subscription);

    } catch (error: any) {

      console.error("Error creating reseller client subscription:", error);

      res.status(500).json({ message: "Erro ao criar assinatura" });

    }

  });



  /**

   * Detectar revendedor pelo host (para white-label)

   * GET /api/reseller/detect

   */

  app.get("/api/reseller/detect", async (req: any, res) => {

    try {

      const host = req.headers.host || req.hostname;

      const result = await resellerService.detectResellerByHost(host);

      

      if (result && result.reseller) {

        const r = result.reseller;

        res.json({

          detected: true,

          reseller: {

            companyName: r.companyName,

            logo: r.logoUrl,

            primaryColor: r.primaryColor,

            secondaryColor: r.secondaryColor,

            supportEmail: r.supportEmail,

            supportPhone: r.supportPhone

          }

        });

      } else {

        res.json({ detected: false });

      }

    } catch (error: any) {

      console.error("Error detecting reseller:", error);

      res.json({ detected: false });

    }

  });



  // ============================================================

  // ROTAS DE ADMIN PARA GERENCIAR REVENDEDORES

  // ============================================================



  /**

   * Listar todos os revendedores (Admin)

   * GET /api/admin/resellers

   */

  app.get("/api/admin/resellers", isAdmin, async (req: any, res) => {

    try {

      const resellers = await storage.getAllResellers();

      res.json(resellers);

    } catch (error: any) {

      console.error("Error listing resellers:", error);

      res.status(500).json({ message: "Erro ao listar revendedores" });

    }

  });



  /**

   * Obter detalhes de um revendedor (Admin)

   * GET /api/admin/resellers/:resellerId

   */

  app.get("/api/admin/resellers/:resellerId", isAdmin, async (req: any, res) => {

    try {

      const resellerId = req.params.resellerId;

      const reseller = await storage.getReseller(resellerId);

      

      if (!reseller) {

        return res.status(404).json({ message: "Revendedor não encontrado" });

      }

      

      const clients = await storage.getResellerClients(resellerId);

      const metrics = await storage.getResellerDashboardMetrics(resellerId);

      

      res.json({ reseller, clients, metrics });

    } catch (error: any) {

      console.error("Error getting reseller details:", error);

      res.status(500).json({ message: "Erro ao obter detalhes do revendedor" });

    }

  });



  /**

   * Ativar/Desativar/Bloquear revendedor (Admin)

   * PUT /api/admin/resellers/:resellerId/status

   * Body: { active?: boolean, resellerStatus?: 'active' | 'suspended' | 'blocked' | 'overdue' }

   */

  app.put("/api/admin/resellers/:resellerId/status", isAdmin, async (req: any, res) => {

    try {

      const resellerId = req.params.resellerId;

      const { active, resellerStatus } = req.body;

      

      const updateData: any = {};

      

      // Suporte para isActive (legado)

      if (typeof active === 'boolean') {

        updateData.isActive = active;

      }

      

      // Suporte para resellerStatus (novo - para Kill Switch)

      if (resellerStatus && ['active', 'suspended', 'blocked', 'overdue'].includes(resellerStatus)) {

        updateData.resellerStatus = resellerStatus;

        console.log(`[ADMIN] Alterando status do revendedor ${resellerId} para: ${resellerStatus}`);

      }

      

      await storage.updateReseller(resellerId, updateData);

      

      let message = 'Revendedor atualizado';

      if (resellerStatus === 'blocked') {

        message = '? Revendedor BLOQUEADO - Clientes serão bloqueados em cascata';

      } else if (resellerStatus === 'active') {

        message = '? Revendedor ATIVADO - Clientes podem acessar';

      }

      

      res.json({ message, resellerStatus: resellerStatus || (active ? 'active' : 'suspended') });

    } catch (error: any) {

      console.error("Error updating reseller status:", error);

      res.status(500).json({ message: "Erro ao atualizar status do revendedor" });

    }

  });



  /**

   * Atribuir plano de revenda a um usuário (Admin)

   * POST /api/admin/users/:userId/make-reseller

   */

  app.post("/api/admin/users/:userId/make-reseller", isAdmin, async (req: any, res) => {

    try {

      const targetUserId = req.params.userId;

      

      // Buscar plano de revenda

      const allPlans = await storage.getAllPlans();

      const resellerPlan = allPlans.find((p: any) => p.tipo === 'revenda');

      

      if (!resellerPlan) {

        return res.status(404).json({ message: "Plano de revenda não encontrado. Crie um plano com tipo 'revenda' primeiro." });

      }

      

      // Criar assinatura de revenda para o usuário

      const endDate = new Date();

      endDate.setMonth(endDate.getMonth() + 1);

      

      await storage.createSubscription({

        userId: targetUserId,

        planId: resellerPlan.id,

        status: 'active',

        mpSubscriptionId: `admin_assigned_${Date.now()}`,

        dataInicio: new Date(),

        dataFim: endDate

      });

      

      // Criar perfil de revendedor

      await storage.createReseller({

        userId: targetUserId,

        companyName: 'Minha Revenda',

        isActive: true

      });

      

      res.json({ message: "Plano de revenda atribuído com sucesso" });

    } catch (error: any) {

      console.error("Error making user reseller:", error);

      res.status(500).json({ message: "Erro ao atribuir plano de revenda" });

    }

  });



  // ============================================================

  // ROTAS AVANÇADAS DE RESELLER - Detalhes do Cliente

  // ============================================================



  /**

   * Obter detalhes completos de um cliente

   * GET /api/reseller/clients/:clientId/details

   * Retorna: dados do cliente no formato similar a /api/my-subscription

   */

  app.get("/api/reseller/clients/:clientId/details", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Buscar dados do usuário

      const user = await storage.getUser(client.userId);

      

      // Buscar conexão WhatsApp do cliente

      const connection = await storage.getConnectionByUserId(client.userId);

      

      // Buscar assinatura do cliente (se existir)

      const subscription = await storage.getUserSubscription(client.userId);

      

      // Buscar histórico de pagamentos do cliente via invoice_items (Revendedor -> Sistema)

      const invoiceItems = await db.query.resellerInvoiceItems.findMany({

        where: eq(resellerInvoiceItemsTable.resellerClientId, clientId),

        with: {

          invoice: true,

        },

      });

      

      // Filtrar apenas invoices pagas e mapear histórico

      const paidInvoiceItems = invoiceItems.filter(item => item.invoice?.status === 'paid');

      

      // CALCULAR DATAS E STATUS CORRETOS

      const now = new Date();

      

      // Determinar data de ativação

      const activatedAt = client.activatedAt ? new Date(client.activatedAt) : new Date(client.createdAt);

      

      // Calcular saasPaidUntil - se não existe, é activatedAt + 30 dias

      let saasPaidUntil = client.saasPaidUntil ? new Date(client.saasPaidUntil) : null;

      if (!saasPaidUntil) {

        saasPaidUntil = new Date(activatedAt);

        saasPaidUntil.setDate(saasPaidUntil.getDate() + 30);

      }

      

      // Calcular dias restantes

      const daysRemaining = Math.max(0, Math.ceil((saasPaidUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)));

      

      // Determinar status efetivo

      const isExpired = saasPaidUntil < now;

      const effectiveStatus = client.status === 'cancelled' ? 'cancelled' : 

                              client.status === 'suspended' ? 'suspended' :

                              isExpired ? 'overdue' : 'active';

      

      // Calcular próxima fatura (saasPaidUntil é a data limite, próximo pagamento é antes disso)

      const nextPaymentDate = client.nextPaymentDate ? new Date(client.nextPaymentDate) : saasPaidUntil;

      

      // Preço do cliente (usa clientPrice, senão monthlyCost, senão preço padrão do revendedor)

      const clientPrice = parseFloat(client.clientPrice || client.monthlyCost || reseller.clientMonthlyPrice || '49.99');

      

      // CONSTRUIR HISTÓRICO DE PAGAMENTOS

      let paymentHistory = paidInvoiceItems.map(item => ({

        id: item.id,

        amount: item.amount,

        paidAt: item.invoice!.paidAt,

        createdAt: item.invoice!.createdAt,

        referenceMonth: item.invoice!.referenceMonth || '',

        paymentMethod: item.invoice!.paymentMethod || 'pix',

        status: 'approved',

        description: `Mensalidade ${item.invoice!.referenceMonth || ''}`,

      }));

      

      // Se não tem histórico mas está ativo, criar registro virtual de ativação

      if (paymentHistory.length === 0 && client.status === 'active') {

        paymentHistory = [{

          id: 'activation_' + client.id,

          amount: clientPrice.toFixed(2),

          paidAt: activatedAt.toISOString(),

          createdAt: activatedAt.toISOString(),

          referenceMonth: `${activatedAt.getFullYear()}-${String(activatedAt.getMonth() + 1).padStart(2, '0')}`,

          paymentMethod: 'activation',

          status: 'approved',

          description: 'Ativação do Cliente',

        }];

      }

      

      // Calcular estatísticas

      const totalPaid = paymentHistory.reduce((sum, p) => sum + parseFloat(p.amount || '0'), 0);

      const totalPayments = paymentHistory.length;

      const approvedPayments = paymentHistory.filter(p => p.status === 'approved').length;

      

      // Calcular meses no sistema

      const monthsInSystem = Math.max(0, Math.floor((now.getTime() - activatedAt.getTime()) / (1000 * 60 * 60 * 24 * 30)));

      

      // Buscar estatísticas de uso do cliente

      const conversations = await db.query.conversations.findMany({

        where: eq(conversationsTable.connectionId, connection?.id || ''),

      });

      

      res.json({

        // Dados do cliente (estilo simplificado)

        client: {

          id: client.id,

          status: effectiveStatus,

          activatedAt: activatedAt.toISOString(),

          saasPaidUntil: saasPaidUntil.toISOString(),

          isFreeClient: client.isFreeClient || false,

          createdAt: client.createdAt,

        },

        // Dados do usuário

        user: user ? {

          id: user.id,

          name: user.name,

          email: user.email,

          phone: user.phone,

        } : null,

        // Conexão WhatsApp

        connection: connection ? {

          id: connection.id,

          isConnected: connection.isConnected,

          phoneNumber: connection.phoneNumber,

        } : null,

        // FORMATO SIMILAR A /api/my-subscription

        subscriptionView: {

          status: effectiveStatus,

          daysRemaining,

          nextPaymentDate: nextPaymentDate.toISOString(),

          dataInicio: activatedAt.toISOString(),

          dataFim: saasPaidUntil.toISOString(),

          needsPayment: isExpired || daysRemaining <= 5,

          isOverdue: isExpired,

        },

        // Plano/Preço

        plan: {

          nome: client.isFreeClient ? 'Plano Gratuito' : 'Plano Mensal',

          valor: clientPrice.toFixed(2),

          descricao: `Gerenciado por ${reseller.companyName}`,

        },

        // Histórico de pagamentos

        paymentHistory,

        // Estatísticas

        stats: {

          totalPaid,

          totalPayments,

          approvedPayments,

          monthsInSystem,

          totalConversations: conversations.length,

        },

        // Info do revendedor (para exibir dados de contato/PIX)

        reseller: {

          companyName: reseller.companyName,

          pixKey: reseller.pixKey,

          pixKeyType: reseller.pixKeyType,

          pixHolderName: (reseller as any).pixHolderName,

          pixBankName: (reseller as any).pixBankName,

          supportPhone: reseller.supportPhone,

          supportEmail: reseller.supportEmail,

        },

      });

    } catch (error: any) {

      console.error("Error getting client details:", error);

      res.status(500).json({ message: "Erro ao obter detalhes do cliente" });

    }

  });



  /**

   * Resetar senha de um cliente

   * POST /api/reseller/clients/:clientId/reset-password

   */

  app.post("/api/reseller/clients/:clientId/reset-password", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      const { newPassword } = req.body;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Gerar nova senha se não foi fornecida

      const password = newPassword || generateRandomPassword();

      

      // Atualizar senha no Supabase Auth

      const { error: authError } = await supabase.auth.admin.updateUserById(

        client.userId,

        { password }

      );

      

      if (authError) {

        console.error("Error resetting password:", authError);

        return res.status(500).json({ message: "Erro ao resetar senha" });

      }

      

      res.json({ 

        message: "Senha resetada com sucesso",

        newPassword: password, // Retorna a nova senha para o revendedor enviar ao cliente

      });

    } catch (error: any) {

      console.error("Error resetting client password:", error);

      res.status(500).json({ message: "Erro ao resetar senha" });

    }

  });



  /**

   * Marcar pagamento do cliente como pago manualmente

   * POST /api/reseller/clients/:clientId/mark-paid

   * Registra pagamento de uma fatura específica (baseado em referenceMonth)

   */

  app.post("/api/reseller/clients/:clientId/mark-paid", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      const { amount, description, paymentMethod = 'manual', referenceMonth, dueDate } = req.body;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Verificar se a fatura já foi paga (evitar duplicidade)

      if (referenceMonth) {

        const existingPayments = await storage.getResellerPayments(reseller.id, 100);

        const alreadyPaid = existingPayments.some(

          p => p.resellerClientId === clientId && 

               p.status === 'approved' && 

               p.referenceMonth === referenceMonth

        );

        if (alreadyPaid) {

          return res.status(400).json({ message: `Fatura de ${referenceMonth} já foi paga` });

        }

      }

      

      // Calcular valor se não fornecido

      const paymentAmount = amount || client.clientPrice || reseller.clientMonthlyPrice || "99.99";

      

      // Criar registro de pagamento com referência à fatura

      const payment = await storage.createResellerPayment({

        resellerId: reseller.id,

        resellerClientId: clientId,

        amount: String(paymentAmount),

        paymentType: 'monthly_fee',

        status: 'approved',

        paymentMethod: paymentMethod,

        description: description || `Mensalidade ${referenceMonth || 'manual'}`,

        paidAt: new Date(),

        referenceMonth: referenceMonth || null,

        dueDate: dueDate ? new Date(dueDate) : null,

      });

      

      // Calcular próximo vencimento baseado na fatura paga

      let nextPaymentDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      if (referenceMonth) {

        // Se pagou uma fatura específica, o próximo vencimento é o mês seguinte

        const [year, month] = referenceMonth.split('-').map(Number);

        const nextMonth = month === 12 ? 1 : month + 1;

        const nextYear = month === 12 ? year + 1 : year;

        const billingDay = client.billingDay || 1;

        nextPaymentDate = new Date(nextYear, nextMonth - 1, billingDay);

      }

      

      // Se o cliente estava suspenso, reativar

      if (client.status === 'suspended' || client.status === 'pending') {

        await storage.updateResellerClient(clientId, {

          status: 'active',

          activatedAt: client.activatedAt || new Date(),

          suspendedAt: null,

          nextPaymentDate: nextPaymentDate,

        });

        

        // Atualizar assinatura do cliente também

        const subscription = await storage.getUserSubscription(client.userId);

        if (subscription) {

          await storage.updateSubscription(subscription.id, {

            status: 'active',

            dataFim: nextPaymentDate,

          });

        }

      } else {

        // Atualizar apenas a data do próximo pagamento

        await storage.updateResellerClient(clientId, {

          nextPaymentDate: nextPaymentDate,

        });

      }

      

      res.json({ 

        message: "Pagamento registrado com sucesso",

        payment: {

          id: payment.id,

          amount: payment.amount,

          status: payment.status,

          referenceMonth: payment.referenceMonth,

          createdAt: payment.createdAt,

        },

        clientStatus: client.status === 'suspended' || client.status === 'pending' ? 'active' : client.status,

        nextPaymentDate: nextPaymentDate,

      });

    } catch (error: any) {

      console.error("Error marking payment as paid:", error);

      res.status(500).json({ message: "Erro ao registrar pagamento" });

    }

  });



  /**

   * Histórico de pagamentos de um cliente específico

   * GET /api/reseller/clients/:clientId/payments

   */

  app.get("/api/reseller/clients/:clientId/payments", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      // Buscar pagamentos do cliente

      const allPayments = await storage.getResellerPayments(reseller.id, 100);

      const clientPayments = allPayments.filter(p => p.resellerClientId === clientId);

      

      res.json(clientPayments);

    } catch (error: any) {

      console.error("Error getting client payments:", error);

      res.status(500).json({ message: "Erro ao obter histórico de pagamentos" });

    }

  });



  /**

   * Atualizar preço mensal de um cliente

   * PUT /api/reseller/clients/:clientId/price

   */

  app.put("/api/reseller/clients/:clientId/price", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const clientId = req.params.clientId;

      const { clientPrice } = req.body;

      

      if (!clientPrice || parseFloat(clientPrice) < 0) {

        return res.status(400).json({ message: "Preço inválido" });

      }

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Verificar se o cliente pertence ao revendedor

      const client = await storage.getResellerClient(clientId);

      if (!client || client.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Cliente não encontrado" });

      }

      

      await storage.updateResellerClient(clientId, {

        clientPrice: String(clientPrice),

      });

      

      res.json({ 

        message: "Preço atualizado com sucesso",

        newPrice: clientPrice,

      });

    } catch (error: any) {

      console.error("Error updating client price:", error);

      res.status(500).json({ message: "Erro ao atualizar preço" });

    }

  });



  // ============================================================

  // ROTAS DE FATURAMENTO DO REVENDEDOR (Flow 2: Reseller -> System)

  // ============================================================



  /**

   * Obter resumo da assinatura do revendedor

   * GET /api/reseller/my-subscription

   * Retorna: clientes ativos, valor mensal, próxima fatura, status

   */

  app.get("/api/reseller/my-subscription", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      // Contar clientes ativos

      const activeClients = await storage.countActiveResellerClients(reseller.id);

      

      // Valores

      const costPerClient = Number(reseller.costPerClient || 49.99);

      const totalMonthly = activeClients * costPerClient;

      

      // Buscar fatura atual (mês corrente)

      const now = new Date();

      const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

      let currentInvoice = await storage.getResellerInvoiceByMonth(reseller.id, currentMonth);

      

      // Se não existe fatura do mês atual e tem clientes, criar

      if (!currentInvoice && activeClients > 0) {

        const billingDay = reseller.billingDay || 10;

        const dueDate = new Date(now.getFullYear(), now.getMonth(), billingDay);

        if (dueDate < now) {

          // Se já passou o dia de vencimento, é para o próximo mês

          dueDate.setMonth(dueDate.getMonth() + 1);

        }

        

        currentInvoice = await storage.createResellerInvoice({

          resellerId: reseller.id,

          referenceMonth: currentMonth,

          dueDate: dueDate.toISOString().split('T')[0],

          activeClients,

          unitPrice: String(costPerClient),

          totalAmount: String(totalMonthly),

          status: 'pending',

        });

      }

      

      // Buscar faturas pendentes/vencidas

      const pendingInvoices = await storage.getResellerPendingInvoices(reseller.id);

      

      // Verificar se há faturas vencidas e atualizar status

      const today = new Date();

      today.setHours(0, 0, 0, 0);

      

      for (const invoice of pendingInvoices) {

        const dueDate = new Date(invoice.dueDate);

        dueDate.setHours(0, 0, 0, 0);

        

        if (invoice.status === 'pending' && dueDate < today) {

          await storage.updateResellerInvoice(invoice.id, { status: 'overdue' });

          invoice.status = 'overdue';

        }

      }

      

      // Determinar status geral do revendedor

      const hasOverdue = pendingInvoices.some(inv => inv.status === 'overdue');

      const daysPastDue = hasOverdue ? Math.floor((today.getTime() - new Date(pendingInvoices.find(i => i.status === 'overdue')!.dueDate).getTime()) / (1000 * 60 * 60 * 24)) : 0;

      

      // Atualizar status do revendedor se necessário

      let resellerStatus = reseller.resellerStatus || 'active';

      if (hasOverdue && daysPastDue > 10) {

        resellerStatus = 'blocked';

        await storage.updateReseller(reseller.id, { resellerStatus: 'blocked' });

      } else if (hasOverdue && daysPastDue > 5) {

        resellerStatus = 'overdue';

        await storage.updateReseller(reseller.id, { resellerStatus: 'overdue' });

      } else if (pendingInvoices.length > 0) {

        resellerStatus = 'pending';

      } else {

        resellerStatus = 'active';

      }

      

      res.json({

        activeClients,

        costPerClient,

        totalMonthly,

        billingDay: reseller.billingDay || 10,

        currentInvoice: currentInvoice ? {

          id: currentInvoice.id,

          referenceMonth: currentInvoice.referenceMonth,

          dueDate: currentInvoice.dueDate,

          activeClients: currentInvoice.activeClients,

          unitPrice: currentInvoice.unitPrice,

          totalAmount: currentInvoice.totalAmount,

          status: currentInvoice.status,

        } : null,

        pendingInvoices: pendingInvoices.map(inv => ({

          id: inv.id,

          referenceMonth: inv.referenceMonth,

          dueDate: inv.dueDate,

          activeClients: inv.activeClients,

          totalAmount: inv.totalAmount,

          status: inv.status,

        })),

        resellerStatus,

        daysPastDue: hasOverdue ? daysPastDue : 0,

      });

    } catch (error: any) {

      console.error("Error getting reseller subscription:", error);

      res.status(500).json({ message: "Erro ao obter dados da assinatura" });

    }

  });



  /**

   * Listar todas as faturas do revendedor

   * GET /api/reseller/my-invoices

   */

  app.get("/api/reseller/my-invoices", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const invoices = await storage.getResellerInvoices(reseller.id);

      

      res.json(invoices);

    } catch (error: any) {

      console.error("Error getting reseller invoices:", error);

      res.status(500).json({ message: "Erro ao obter faturas" });

    }

  });



  /**

   * Gerar PIX para pagar fatura

   * POST /api/reseller/my-invoices/:invoiceId/pay-pix

   * Gera QR Code PIX para pagamento ao dono do sistema

   */

  app.post("/api/reseller/my-invoices/:invoiceId/pay-pix", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const invoiceId = parseInt(req.params.invoiceId);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const invoice = await storage.getResellerInvoice(invoiceId);

      if (!invoice || invoice.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Fatura não encontrada" });

      }

      

      if (invoice.status === 'paid') {

        return res.status(400).json({ message: "Esta fatura já foi paga" });

      }

      

      // Buscar usuário do revendedor para pegar email

      const user = await storage.getUser(userId);

      

      // Criar pagamento PIX no Mercado Pago (usando credenciais do sistema)

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const mpAccessToken = configMap.get("mercadopago_access_token");

      

      if (!mpAccessToken) {

        return res.status(500).json({ message: "Configuração de pagamento não encontrada" });

      }

      

      // Criar preferência de pagamento PIX

      const amount = parseFloat(String(invoice.totalAmount));

      const timestamp = Date.now();

      const externalReference = `reseller_invoice_${invoice.id}_${timestamp}`;

      const idempotencyKey = `reseller-invoice-pix-${invoice.id}-${timestamp}`;

      

      const pixResponse = await fetch('https://api.mercadopago.com/v1/payments', {

        method: 'POST',

        headers: {

          'Authorization': `Bearer ${mpAccessToken}`,

          'Content-Type': 'application/json',

          'X-Idempotency-Key': idempotencyKey,

        },

        body: JSON.stringify({

          transaction_amount: amount,

          description: `Fatura ${invoice.referenceMonth} - ${reseller.companyName}`,

          payment_method_id: 'pix',

          external_reference: externalReference,

          payer: {

            email: user?.email || 'reseller@agentezap.com',

            first_name: reseller.companyName?.split(' ')[0] || 'Revendedor',

          },

        }),

      });

      

      const pixData = await pixResponse.json();

      

      if (!pixResponse.ok || !pixData.point_of_interaction?.transaction_data) {

        console.error('Erro ao criar PIX:', pixData);

        return res.status(500).json({ message: "Erro ao gerar PIX" });

      }

      

      // Atualizar fatura com ID do pagamento

      await storage.updateResellerInvoice(invoiceId, {

        mpPaymentId: String(pixData.id),

        paymentMethod: 'pix',

      });

      

      res.json({

        paymentId: pixData.id,

        qrCode: pixData.point_of_interaction.transaction_data.qr_code,

        qrCodeBase64: pixData.point_of_interaction.transaction_data.qr_code_base64,

        ticketUrl: pixData.point_of_interaction.transaction_data.ticket_url,

        expirationDate: pixData.date_of_expiration,

        amount: amount,

        referenceMonth: invoice.referenceMonth,

      });

    } catch (error: any) {

      console.error("Error generating PIX:", error);

      res.status(500).json({ message: "Erro ao gerar PIX" });

    }

  });



  /**

   * Verificar status de pagamento de fatura

   * GET /api/reseller/my-invoices/:invoiceId/check-payment

   */

  app.get("/api/reseller/my-invoices/:invoiceId/check-payment", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const invoiceId = parseInt(req.params.invoiceId);

      

      const reseller = await storage.getResellerByUserId(userId);

      if (!reseller) {

        return res.status(403).json({ message: "Você não é um revendedor" });

      }

      

      const invoice = await storage.getResellerInvoice(invoiceId);

      if (!invoice || invoice.resellerId !== reseller.id) {

        return res.status(404).json({ message: "Fatura não encontrada" });

      }

      

      if (invoice.status === 'paid') {

        return res.json({ status: 'paid', paidAt: invoice.paidAt });

      }

      

      if (!invoice.mpPaymentId) {

        return res.json({ status: invoice.status });

      }

      

      // Verificar status no Mercado Pago

      const configMap = await storage.getSystemConfigs(["mercadopago_access_token"]);

      const mpAccessToken = configMap.get("mercadopago_access_token");

      

      const mpResponse = await fetch(`https://api.mercadopago.com/v1/payments/${invoice.mpPaymentId}`, {

        headers: { 'Authorization': `Bearer ${mpAccessToken}` },

      });

      

      const mpData = await mpResponse.json();

      

      if (mpData.status === 'approved') {

        // Atualizar fatura como paga

        await storage.updateResellerInvoice(invoiceId, {

          status: 'paid',

          paidAt: new Date(),

        });

        

        // Atualizar status do revendedor

        await storage.updateReseller(reseller.id, { resellerStatus: 'active' });

        

        return res.json({ status: 'paid', paidAt: new Date() });

      }

      

      res.json({ status: mpData.status || invoice.status });

    } catch (error: any) {

      console.error("Error checking payment:", error);

      res.status(500).json({ message: "Erro ao verificar pagamento" });

    }

  });



  /**

   * Marcar fatura como paga manualmente (admin)

   * POST /api/reseller/my-invoices/:invoiceId/mark-paid

   */

  app.post("/api/reseller/my-invoices/:invoiceId/mark-paid", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const invoiceId = parseInt(req.params.invoiceId);

      const { paymentMethod = 'manual' } = req.body;

      

      // Verificar se é admin ou o próprio revendedor

      const user = await storage.getUser(userId);

      const reseller = await storage.getResellerByUserId(userId);

      

      const invoice = await storage.getResellerInvoice(invoiceId);

      if (!invoice) {

        return res.status(404).json({ message: "Fatura não encontrada" });

      }

      

      // Apenas admin ou o próprio revendedor podem marcar como pago

      const isAdmin = user?.role === 'admin';

      const isOwner = reseller && invoice.resellerId === reseller.id;

      

      if (!isAdmin && !isOwner) {

        return res.status(403).json({ message: "Sem permissão para esta ação" });

      }

      

      if (invoice.status === 'paid') {

        return res.status(400).json({ message: "Esta fatura já foi paga" });

      }

      

      // Atualizar fatura

      await storage.updateResellerInvoice(invoiceId, {

        status: 'paid',

        paymentMethod,

        paidAt: new Date(),

      });

      

      // Atualizar status do revendedor

      await storage.updateReseller(invoice.resellerId, { resellerStatus: 'active' });

      

      res.json({ 

        message: "Fatura marcada como paga com sucesso",

        status: 'paid',

        paidAt: new Date(),

      });

    } catch (error: any) {

      console.error("Error marking invoice as paid:", error);

      res.status(500).json({ message: "Erro ao marcar fatura como paga" });

    }

  });



  // ==================== TEAM MEMBERS - Sistema de Membros/Funcionários ====================

  

  // GET - Listar membros da equipe do usuário

  app.get("/api/team-members", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const members = await storage.getTeamMembers(userId);

      // Remover passwordHash dos resultados

      const safeMemebers = members.map(({ passwordHash, ...rest }) => rest);

      res.json(safeMemebers);

    } catch (error) {

      console.error("Error fetching team members:", error);

      res.status(500).json({ message: "Erro ao buscar membros da equipe" });

    }

  });



  // POST - Criar novo membro da equipe

  app.post("/api/team-members", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { name, email, password, role, permissions, avatarUrl, signature, signatureEnabled } = req.body;



      if (!name || !email) {

        return res.status(400).json({ message: "Nome e email são obrigatórios" });

      }



      // Verificar se email já existe para este dono

      const existing = await storage.getTeamMemberByEmail(userId, email);

      if (existing) {

        return res.status(400).json({ message: "Já existe um membro com este email" });

      }



      // Gerar senha aleatória se não fornecida

      const finalPassword = password || generateRandomPassword();

      const bcrypt = await import("bcryptjs");

      const passwordHash = await bcrypt.hash(finalPassword, 10);



      const member = await storage.createTeamMember({

        ownerId: userId,

        name,

        email,

        passwordHash,

        role: role || "atendente",

        permissions: permissions || {

          canViewConversations: true,

          canSendMessages: true,

          canUseQuickReplies: true,

          canMoveKanban: true,

          canViewDashboard: false,

          canEditContacts: false,

        },

        avatarUrl: avatarUrl || null,

        signature: signature || null,

        signatureEnabled: signatureEnabled || false,

        isActive: true,

      });



      // Retornar sem passwordHash, mas incluir a senha gerada (só na criação)

      const { passwordHash: _, ...safeData } = member;

      res.json({ 

        ...safeData, 

        generatedPassword: finalPassword,

        message: "Membro criado com sucesso" 

      });

    } catch (error) {

      console.error("Error creating team member:", error);

      res.status(500).json({ message: "Erro ao criar membro da equipe" });

    }

  });



  // PUT - Atualizar membro da equipe

  app.put("/api/team-members/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { name, email, password, role, permissions, avatarUrl, isActive, signature, signatureEnabled } = req.body;



      // Verificar propriedade

      const existing = await storage.getTeamMember(id);

      if (!existing || existing.ownerId !== userId) {

        return res.status(404).json({ message: "Membro não encontrado" });

      }



      const updateData: any = {

        name,

        email,

        role,

        permissions,

        avatarUrl,

        isActive,

        signature,

        signatureEnabled,

        updatedAt: new Date(),

      };



      // Se nova senha fornecida, hash

      if (password) {

        const bcrypt = await import("bcryptjs");

        updateData.passwordHash = await bcrypt.hash(password, 10);

      }



      const member = await storage.updateTeamMember(id, updateData);

      const { passwordHash: _, ...safeData } = member;

      res.json(safeData);

    } catch (error) {

      console.error("Error updating team member:", error);

      res.status(500).json({ message: "Erro ao atualizar membro da equipe" });

    }

  });



  // DELETE - Excluir membro da equipe

  app.delete("/api/team-members/:id", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      // Verificar propriedade

      const existing = await storage.getTeamMember(id);

      if (!existing || existing.ownerId !== userId) {

        return res.status(404).json({ message: "Membro não encontrado" });

      }



      await storage.deleteTeamMember(id);

      res.json({ success: true, message: "Membro excluído com sucesso" });

    } catch (error) {

      console.error("Error deleting team member:", error);

      res.status(500).json({ message: "Erro ao excluir membro da equipe" });

    }

  });



  // POST - Resetar senha do membro

  app.post("/api/team-members/:id/reset-password", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;



      // Verificar propriedade

      const existing = await storage.getTeamMember(id);

      if (!existing || existing.ownerId !== userId) {

        return res.status(404).json({ message: "Membro não encontrado" });

      }



      const newPassword = generateRandomPassword();

      const bcrypt = await import("bcryptjs");

      const passwordHash = await bcrypt.hash(newPassword, 10);



      await storage.updateTeamMember(id, { passwordHash, updatedAt: new Date() });

      res.json({ newPassword, message: "Senha resetada com sucesso" });

    } catch (error) {

      console.error("Error resetting team member password:", error);

      res.status(500).json({ message: "Erro ao resetar senha" });

    }

  });



  // POST - Login de membro da equipe (rota separada)

  app.post("/api/team-members/login", async (req: any, res) => {

    try {

      const { email, password, ownerId } = req.body;



      if (!email || !password) {

        return res.status(400).json({ message: "Email e senha são obrigatórios" });

      }



      // Buscar membro pelo email (global ou por ownerId se fornecido)

      const member = await storage.getTeamMemberByEmailGlobal(email);

      if (!member) {

        return res.status(401).json({ message: "Credenciais inválidas" });

      }



      // Verificar se está ativo

      if (!member.isActive) {

        return res.status(403).json({ message: "Conta desativada. Contate o administrador." });

      }



      // Verificar senha

      const bcrypt = await import("bcryptjs");

      const valid = await bcrypt.compare(password, member.passwordHash);

      if (!valid) {

        return res.status(401).json({ message: "Credenciais inválidas" });

      }



      // Gerar token de sessão

      const crypto = await import("crypto");

      const token = crypto.randomBytes(32).toString('hex');

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 dias



      await storage.createTeamMemberSession({

        memberId: member.id,

        token,

        expiresAt,

        userAgent: req.headers['user-agent'] || null,

        ipAddress: req.ip || null,

      });



      // Atualizar último login

      await storage.updateTeamMember(member.id, { lastLoginAt: new Date() });



      // Buscar dados do dono

      const owner = await storage.getUser(member.ownerId);



      const { passwordHash: _, ...safeMember } = member;

      res.json({

        member: safeMember,

        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,

        token,

        expiresAt,

      });

    } catch (error) {

      console.error("Error logging in team member:", error);

      res.status(500).json({ message: "Erro ao fazer login" });

    }

  });



  // GET - Verificar sessão do membro

  app.get("/api/team-members/session", async (req: any, res) => {

    try {

      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {

        return res.status(401).json({ authenticated: false });

      }



      const token = authHeader.substring(7);

      const session = await storage.getTeamMemberSession(token);

      

      if (!session || new Date(session.expiresAt) < new Date()) {

        return res.status(401).json({ authenticated: false });

      }



      const member = await storage.getTeamMember(session.memberId);

      if (!member || !member.isActive) {

        return res.status(401).json({ authenticated: false });

      }



      const owner = await storage.getUser(member.ownerId);

      const { passwordHash: _, ...safeMember } = member;



      res.json({

        authenticated: true,

        member: safeMember,

        owner: owner ? { id: owner.id, name: owner.name, email: owner.email } : null,

      });

    } catch (error) {

      console.error("Error checking team member session:", error);

      res.status(500).json({ authenticated: false });

    }

  });



  // POST - Logout de membro

  app.post("/api/team-members/logout", async (req: any, res) => {

    try {

      const authHeader = req.headers.authorization;

      if (authHeader && authHeader.startsWith('Bearer ')) {

        const token = authHeader.substring(7);

        await storage.deleteTeamMemberSession(token);

      }

      res.json({ success: true });

    } catch (error) {

      console.error("Error logging out team member:", error);

      res.status(500).json({ message: "Erro ao fazer logout" });

    }

  });



  // ==================== SUBSCRIPTION MANAGEMENT ====================



  // POST - Ativar/Desativar assinatura do usuário na conversa

  app.post("/api/conversations/:id/toggle-subscription", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { active } = req.body;



      // Buscar conversa

      const conversation = await storage.getConversation(id);

      if (!conversation) {

        return res.status(404).json({ message: "Conversa não encontrada" });

      }



      // Verificar propriedade

      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }



      // Buscar usuário alvo pelo número de contato

      // Isso é para admin controlar assinatura de clientes

      // TODO: Implementar lógica de buscar user por phoneNumber



      res.json({ success: true, message: active ? "Assinatura ativada" : "Assinatura desativada" });

    } catch (error) {

      console.error("Error toggling subscription:", error);

      res.status(500).json({ message: "Erro ao alterar assinatura" });

    }

  });



  // ==================== FORWARD MESSAGE ====================



  // POST - Encaminhar mensagem para outro contato

  app.post("/api/conversations/:id/forward-message", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { id } = req.params;

      const { messageId, targetNumber, targetConversationId } = req.body;



      if (!messageId) {

        return res.status(400).json({ message: "ID da mensagem é obrigatório" });

      }



      if (!targetNumber && !targetConversationId) {

        return res.status(400).json({ message: "Número ou conversa de destino é obrigatório" });

      }



      // Verificar propriedade da conversa origem

      const conversation = await storage.getConversation(id);

      if (!conversation) {

        return res.status(404).json({ message: "Conversa não encontrada" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || conversation.connectionId !== connection.id) {

        return res.status(403).json({ message: "Forbidden" });

      }



      // Buscar mensagem original

      const messages = await storage.getMessages(id);

      const originalMessage = messages.find(m => m.id === messageId);

      if (!originalMessage) {

        return res.status(404).json({ message: "Mensagem não encontrada" });

      }



      // Determinar destino

      let targetJid: string;

      if (targetConversationId) {

        const targetConv = await storage.getConversation(targetConversationId);

        if (!targetConv || targetConv.connectionId !== connection.id) {

          return res.status(404).json({ message: "Conversa de destino não encontrada" });

        }

        targetJid = targetConv.remoteJid || `${targetConv.contactNumber}@s.whatsapp.net`;

      } else {

        // Limpar número e formatar JID

        const cleanNumber = targetNumber.replace(/\D/g, '');

        targetJid = `${cleanNumber}@s.whatsapp.net`;

      }



      // Encaminhar mensagem via WhatsApp

      if (originalMessage.mediaType && originalMessage.mediaUrl) {

        // Encaminhar mídia

        await whatsappSendMessage(

          userId,

          targetJid,

          originalMessage.mediaCaption || originalMessage.text || "",

          {

            mediaType: originalMessage.mediaType as any,

            mediaUrl: originalMessage.mediaUrl,

          }

        );

      } else if (originalMessage.text) {

        // Encaminhar texto

        await whatsappSendMessage(

          userId,

          targetJid,

          `_Mensagem encaminhada:_\n\n${originalMessage.text}`

        );

      } else {

        return res.status(400).json({ message: "Mensagem não pode ser encaminhada" });

      }



      res.json({ success: true, message: "Mensagem encaminhada com sucesso" });

    } catch (error) {

      console.error("Error forwarding message:", error);

      res.status(500).json({ message: "Erro ao encaminhar mensagem" });

    }

  });



  // ==================== NEW CONTACT ====================



  // POST - Iniciar nova conversa com contato

  app.post("/api/conversations/new-contact", isAuthenticated, async (req: any, res) => {

    try {

      const userId = getUserId(req);

      const { phoneNumber, name, message } = req.body;



      if (!phoneNumber) {

        return res.status(400).json({ message: "Número de telefone é obrigatório" });

      }



      const connection = await storage.getConnectionByUserId(userId);

      if (!connection || !connection.isConnected) {

        return res.status(400).json({ message: "WhatsApp não conectado" });

      }



      // Limpar e formatar número

      const cleanNumber = phoneNumber.replace(/\D/g, '');

      const jid = `${cleanNumber}@s.whatsapp.net`;



      // Verificar se já existe conversa

      let conversation = await storage.getConversationByRemoteJid(connection.id, jid);

      

      if (!conversation) {

        // Criar nova conversa

        conversation = await storage.createConversation({

          connectionId: connection.id,

          contactNumber: cleanNumber,

          remoteJid: jid,

          contactName: name || cleanNumber,

          lastMessageText: null,

          lastMessageTime: null,

          unreadCount: 0,

        });

      }



      // Se mensagem inicial fornecida, enviar

      if (message) {

        await whatsappSendMessage(userId, jid, message);

      }



      res.json({ 

        success: true, 

        conversation,

        message: "Conversa criada com sucesso" 

      });

    } catch (error) {

      console.error("Error creating new contact conversation:", error);

      res.status(500).json({ message: "Erro ao criar conversa" });

    }

  });



  return httpServer;

}



// Helper function to generate random password

function generateRandomPassword(): string {

  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%';

  let password = '';

  for (let i = 0; i < 12; i++) {

    password += chars.charAt(Math.floor(Math.random() * chars.length));

  }

  return password;

}






