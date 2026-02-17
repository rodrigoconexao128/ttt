import type { Express } from "express";
import { isAuthenticated } from "../supabaseAuth";
import * as controller from "./sectors.controller";

function requireAdmin(req: any, res: any, next: any) {
  const role = req.user?.role || req.session?.user?.role || req.session?.adminRole;
  if (role !== "admin" && role !== "owner") {
    return res.status(403).json({ error: "Acesso restrito a administradores." });
  }
  next();
}

export function registerSectorRoutes(app: Express): void {
  console.log("[Sectors] Registrando rotas de setores...");

  app.get("/api/sectors", isAuthenticated, requireAdmin, controller.listSectors);
  app.get("/api/sectors/agents", isAuthenticated, requireAdmin, controller.listAdminAgents);
  app.get("/api/sectors/:id", isAuthenticated, requireAdmin, controller.getSectorById);
  app.post("/api/sectors", isAuthenticated, requireAdmin, controller.createSector);
  app.patch("/api/sectors/:id", isAuthenticated, requireAdmin, controller.updateSector);
  app.delete("/api/sectors/:id", isAuthenticated, requireAdmin, controller.deleteSector);

  console.log("[Sectors] Rotas registradas com sucesso!");
}
