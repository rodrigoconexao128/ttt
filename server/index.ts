import 'dotenv/config';
import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import { restoreExistingSessions, restoreAdminSessions, startConnectionHealthCheck } from "./whatsapp";
import { followUpService } from "./followUpService";
import { appointmentReminderService } from "./appointmentReminderService";
import { startAutoReactivationService } from "./autoReactivateService";
import { startDailySyncCron } from "./fullContactSyncService";
import { startMediaCleanupService } from "./mediaCleanupService";
import { seedDatabase } from "./seed";
import path from "path";
import fs from "fs";

const BOOT_ID = new Date().toISOString();
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

  // Serve static assets from findeas theme
  const findeasThemePath = path.join(process.cwd(), 'findeas theme');
  app.use('/assets', express.static(path.join(findeasThemePath, 'assets')));

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
    
    // Aguardar mais um pouco antes de restaurar sessões
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Restore WhatsApp sessions after server starts
    restoreExistingSessions().catch((error) => {
      console.error("Failed to restore WhatsApp sessions:", error);
    });

    // Restore admin WhatsApp sessions
    restoreAdminSessions().catch((error) => {
      console.error("Failed to restore admin WhatsApp sessions:", error);
    });

    // Start Follow-up Service
    followUpService.start();
    
    // 🔔 Start Appointment Reminder Service (lembretes via IA)
    appointmentReminderService.start();
    
    // ⏰ Start Auto-Reactivation Service (reativa IA após timer)
    startAutoReactivationService();
    
    // 🔄 Iniciar Health Check Monitor para reconexão automática
    // Verifica a cada 5 minutos se as conexões estão saudáveis
    startConnectionHealthCheck();
    
    // 📱 Iniciar Cron Job de Sincronização Diária de Contatos
    // Sincroniza TODOS os contatos de TODOS os clientes 1x por dia às 03:00 BRT
    startDailySyncCron();
    
    // 🗑️ Iniciar Serviço de Limpeza de Mídias
    // Deleta mídias do Storage com mais de 1 hora para economizar Egress
    startMediaCleanupService();
  });
})();
