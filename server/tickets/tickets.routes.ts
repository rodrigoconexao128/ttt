import type { Express, Request, Response, NextFunction } from "express";
import multer from "multer";
import { isAuthenticated, supabase } from "../supabaseAuth";
import { db } from "../db";
import * as controller from "./tickets.controller";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 4 },
  fileFilter: (_req, file, cb) => {
    const ok = ["image/png", "image/jpeg", "image/webp"].includes(file.mimetype);
    cb(ok ? null : new Error("Formato inválido. Apenas PNG/JPEG/WEBP."), ok);
  }
});

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role || req.session?.user?.role || req.session?.adminRole;
  if (role !== "admin" && role !== "owner") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
}

export function registerTicketRoutes(app: Express): void {
  console.log("🎫 [Tickets] Registrando rotas de chamados...");

  // User routes
  app.get("/api/tickets", isAuthenticated, controller.listUserTickets);
  app.post("/api/tickets", isAuthenticated, controller.createTicket);
  app.get("/api/tickets/:id", isAuthenticated, controller.getUserTicketById);
  app.patch("/api/tickets/:id", isAuthenticated, controller.updateUserTicket);
  app.delete("/api/tickets/:id", isAuthenticated, controller.deleteUserTicket);
  app.get("/api/tickets/:id/messages", isAuthenticated, controller.listUserTicketMessages);
  app.post("/api/tickets/:id/messages", isAuthenticated, upload.array("attachments", 4), controller.sendUserMessage);
  app.post("/api/tickets/:id/read", isAuthenticated, controller.markUserRead);

  // Admin routes
  app.get("/api/admin/tickets", isAuthenticated, requireAdmin, controller.listAdminTickets);
  app.get("/api/admin/tickets/:id", isAuthenticated, requireAdmin, controller.getAdminTicketById);
  app.patch("/api/admin/tickets/:id", isAuthenticated, requireAdmin, controller.updateAdminTicket);
  app.patch("/api/admin/tickets/:id/status", isAuthenticated, requireAdmin, controller.updateAdminTicketStatus);
  app.get("/api/admin/tickets/:id/messages", isAuthenticated, requireAdmin, controller.listAdminTicketMessages);
  app.post("/api/admin/tickets/:id/messages", isAuthenticated, requireAdmin, upload.array("attachments", 4), controller.sendAdminMessage);
  app.post("/api/admin/tickets/:id/read", isAuthenticated, requireAdmin, controller.markAdminRead);

  console.log("✅ [Tickets] Rotas registradas com sucesso!");
}
// v2 - Railway build compatible
