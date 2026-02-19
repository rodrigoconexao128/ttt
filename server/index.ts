import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import cors from "cors";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { restoreExistingSessions, restoreAdminSessions, restorePendingAITimers, startConnectionHealthCheck, startPendingTimersCron, startAutoRecoveryCron } from "./whatsapp";
import { startWhatsAppLeaderElection } from "./whatsappLeaderLock";
import { followUpService } from "./followUpService";
import { appointmentReminderService } from "./appointmentReminderService";
import { paymentReminderService } from "./paymentReminderService";
import { statusSchedulerService } from "./statusSchedulerService";
import { startAutoReactivationService } from "./autoReactivateService";
import { startDailySyncCron } from "./fullContactSyncService";
import { startMediaCleanupService } from "./mediaCleanupService";
import { startNotificationScheduler } from "./notificationSchedulerService";
import { seedDatabase } from "./seed";
import path from "path";
import fs from "fs";

const BOOT_ID = new Date().toISOString();
process.env.BOOT_ID = BOOT_ID;
console.log(`🚀 [BOOT] Starting server (bootId=${BOOT_ID})`);
console.log(`🚀 [BOOT] node=${process.version} env=${process.env.NODE_ENV || 'unknown'} port=${process.env.PORT || 'unknown'}`);
console.log(`🚀 [BOOT] railwayCommit=${process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_GIT_COMMIT || 'unknown'}`);

// 🛡️ MODO DESENVOLVIMENTO: Aviso de proteção de produção
if (process.env.SKIP_WHATSAPP_RESTORE === 'true') {
  console.log('\n');
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  🛡️  MODO DESENVOLVIMENTO ATIVO - PROTEÇÃO DE PRODUÇÃO              ║');
  console.log('║                                                                      ║');
  console.log('║  SKIP_WHATSAPP_RESTORE=true                                          ║');
  console.log('║                                                                      ║');
  console.log('║  ✅ Sessões WhatsApp do Railway NÃO serão afetadas                   ║');
  console.log('║  ✅ Conexões/desconexões de WhatsApp bloqueadas localmente           ║');
  console.log('║  ✅ Banco de dados compartilhado, mas estado WA preservado           ║');
  console.log('║                                                                      ║');
  console.log('║  Para conectar WhatsApp em dev, remova SKIP_WHATSAPP_RESTORE do .env ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log('\n');
}

const app = express();

// CORS: permite credenciais (cookies de sessão) para o frontend
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(o => o.trim())
  : [process.env.FRONTEND_URL || 'http://localhost:5173', 'http://localhost:5000'];

app.use(cors({
  origin: (origin, callback) => {
    // Permitir requests sem origin (ex: mobile, Postman) ou origins permitidas
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(null, true); // Em same-origin (Railway), origin é o próprio servidor
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
  // Keep the process alive
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Keep the process alive
});
// Force restart


declare module 'http' {
  interface IncomingMessage {
    rawBody: unknown
  }
}
app.use(express.json({
  limit: '50mb', // Aumenta o limite para 50MB
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));
app.use(express.urlencoded({ limit: '50mb', extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const server = await registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // Serve uploaded ticket attachments
  const uploadsPath = path.join(process.cwd(), 'uploads');
  if (!fs.existsSync(uploadsPath)) {
    fs.mkdirSync(uploadsPath, { recursive: true });
  }
  app.use('/uploads', express.static(uploadsPath));

  // Serve static assets from findeas theme and client public (fallback)
  const findeasThemePath = path.join(process.cwd(), 'findeas theme');
  const clientPublicAssetsPath = path.join(process.cwd(), 'client', 'public', 'assets');

  if (fs.existsSync(clientPublicAssetsPath)) {
    app.use('/assets', express.static(clientPublicAssetsPath));
  }
  if (fs.existsSync(path.join(findeasThemePath, 'assets'))) {
    app.use('/assets', express.static(path.join(findeasThemePath, 'assets')));
  }

  // Lightweight health endpoints for uptime checks
  app.get('/health', (_req: Request, res: Response) => {
    res.status(200).json({ status: 'ok' });
  });
  app.get('/healthz', (_req: Request, res: Response) => {
    res.status(200).send('ok');
  });

  // Serve landing page HTML for unauthenticated root route
  app.get('/', (req: Request, res: Response, next) => {
    // Check if user is authenticated by looking for session cookie
    const hasAuthCookie = req.headers.cookie?.includes('connect.sid');

    if (!hasAuthCookie) {
      // Serve the static landing page HTML
      const landingPath = path.join(findeasThemePath, 'landing-5.html');
      if (fs.existsSync(landingPath)) {
        return res.sendFile(landingPath);
      }
    }

    // If authenticated or landing page not found, continue to Vite/React
    next();
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (app.get("env") === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || '5000', 10);
  server.listen({
    port,
    host: "0.0.0.0",
  }, async () => {
    log(`serving on port ${port}`);
    
    // Aguardar um pouco antes de iniciar operações de banco
    // Isso dá tempo para o pool de conexões estabilizar
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Seed database with initial data (com retry interno)
    try {
      await seedDatabase();
    } catch (error) {
      console.error("Failed to seed database:", error);
      // Não crashar - continuar mesmo se seed falhar
    }
    
    // Runtime migration: add ai_enabled column to whatsapp_connections if not exists
    try {
      const { pool } = await import("./db");
      await pool.query(`ALTER TABLE whatsapp_connections ADD COLUMN IF NOT EXISTS ai_enabled BOOLEAN NOT NULL DEFAULT true`);
      console.log("[MIGRATION] ai_enabled column ensured on whatsapp_connections");
    } catch (migErr) {
      console.error("[MIGRATION] Error adding ai_enabled column (may already exist):", migErr);
    }
    
    // Aguardar mais um pouco antes de restaurar sessões
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const disableBackgroundJobs = process.env.DISABLE_WHATSAPP_PROCESSING === 'true';

    if (disableBackgroundJobs) {
      console.log('?? [DEV MODE] Background jobs desabilitados (DISABLE_WHATSAPP_PROCESSING=true)');
      return;
    }

    startWhatsAppLeaderElection({
      onLeader: async () => {
        // Restore WhatsApp sessions after server starts
        restoreExistingSessions().catch((error) => {
          console.error('Failed to restore WhatsApp sessions:', error);
        });

        // Restore admin WhatsApp sessions
        restoreAdminSessions().catch((error) => {
          console.error('Failed to restore admin WhatsApp sessions:', error);
        });

        // Restore pending AI response timers from database
        setTimeout(() => {
          restorePendingAITimers().catch((error) => {
            console.error('Failed to restore pending AI timers:', error);
          });

          // Retry orphan timers and auto-recovery
          startPendingTimersCron();
          startAutoRecoveryCron();
        }, 10000);

        // Start Follow-up Service
        followUpService.start();

        // Start Appointment Reminder Service
        appointmentReminderService.start();

        // Start Payment Reminder Service
        paymentReminderService.start();

        // Start WhatsApp Status Scheduler
        statusSchedulerService.start();

        // Start Auto-Reactivation Service
        startAutoReactivationService();

        // Start health check monitor for reconnection
        startConnectionHealthCheck();

        // Start daily contacts sync
        startDailySyncCron();

        // Start media cleanup
        startMediaCleanupService();

        // Start admin notification scheduler
        startNotificationScheduler();
      },
    });
  });
})();
