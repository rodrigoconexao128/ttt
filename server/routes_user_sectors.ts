/**
 * User Sectors Routes - Parte 4
 * Gerenciamento de setores para o DONO do SaaS (usuário normal, não admin).
 * 
 * Escopo: cada usuário gerencia seus próprios setores via owner_id.
 * Permissões:
 *   - Dono: CRUD setores, vínculos membros, relatórios, encaminhamento.
 *   - Membro: ver setor da conversa, mover conversa para outro setor.
 */

import type { Express, Request, Response, NextFunction } from "express";
import { pool } from "./db";
import { isAuthenticated } from "./supabaseAuth";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getUserId(req: any): string {
  return req.user?.claims?.sub || req.user?.id;
}

function asyncHandler(fn: (req: any, res: Response) => Promise<any>) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req as any, res)).catch(next);
  };
}

async function q<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const r = await pool.query(text, params);
  return r.rows as T[];
}

async function qOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const rows = await q<T>(text, params);
  return rows[0] ?? null;
}

function normText(s: string): string {
  return String(s || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function normKeywords(kws: string[]): string[] {
  const seen = new Set<string>();
  for (const k of kws || []) {
    const n = normText(k);
    if (n) seen.add(n);
  }
  return Array.from(seen);
}

// Verifica se é o dono (tem claims.sub = userId)
function requireOwner(req: any, res: Response, next: NextFunction) {
  const userId = getUserId(req);
  if (!userId) return res.status(403).json({ error: "Acesso negado." });
  next();
}

// Detecta intenção para roteamento por keyword
function detectIntent(msg: string, sector: { name: string; keywords: string[] }): { score: number; matches: string[] } {
  const normMsg = normText(msg);
  const tokens = normMsg.split(/\s+/).filter(Boolean);
  const kws = new Set(normKeywords(sector.keywords || []));
  const matches: string[] = [];

  for (const kw of kws) {
    if (!kw) continue;
    if (normMsg.includes(kw) || tokens.includes(kw)) {
      matches.push(kw);
    }
  }

  const score = matches.length === 0 ? 0 : Math.min(0.97, 0.55 + matches.length * 0.1);
  return { score, matches };
}

// ---------------------------------------------------------------------------
// Register
// ---------------------------------------------------------------------------

export function registerUserSectorRoutes(app: Express): void {
  console.log("[UserSectors] Registrando rotas de setores para usuário normal...");

  // ---- CRUD SETORES ----

  // GET /api/user/sectors - Listar setores do usuário dono
  app.get("/api/user/sectors", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const sectors = await q(
      `SELECT s.*, 
              (SELECT COUNT(*)::int FROM sector_members sm WHERE sm.sector_id = s.id AND sm.owner_id = $1) as member_count
       FROM sectors s
       WHERE s.owner_id = $1
       ORDER BY s.name ASC`,
      [ownerId]
    );
    res.json({ items: sectors });
  }));

  // GET /api/user/sectors/:id - Detalhe de um setor
  app.get("/api/user/sectors/:id", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const sector = await qOne(
      `SELECT * FROM sectors WHERE id = $1 AND owner_id = $2`,
      [req.params.id, ownerId]
    );
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });
    res.json({ sector });
  }));

  // POST /api/user/sectors - Criar setor
  app.post("/api/user/sectors", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { name, description, keywords } = req.body || {};

    if (!name || String(name).trim().length < 2) {
      return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." });
    }

    const kws = normKeywords(
      Array.isArray(keywords)
        ? keywords
        : typeof keywords === "string"
        ? keywords.split(",").map((k: string) => k.trim()).filter(Boolean)
        : []
    );

    // Verificar duplicata dentro do owner
    const existing = await qOne(`SELECT id FROM sectors WHERE name = $1 AND owner_id = $2`, [name.trim(), ownerId]);
    if (existing) return res.status(400).json({ error: "Já existe um setor com este nome." });

    const sector = await qOne(
      `INSERT INTO sectors (name, description, keywords, owner_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [name.trim(), description?.trim() || null, kws, ownerId]
    );

    res.status(201).json({ sector });
  }));

  // PATCH /api/user/sectors/:id - Atualizar setor
  app.patch("/api/user/sectors/:id", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { name, description, keywords } = req.body || {};

    const sector = await qOne(`SELECT * FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });

    const updates: string[] = [];
    const values: any[] = [req.params.id, ownerId];
    let idx = 3;

    if (name !== undefined) {
      if (String(name).trim().length < 2) return res.status(400).json({ error: "Nome deve ter pelo menos 2 caracteres." });
      updates.push(`name = $${idx++}`); values.push(name.trim());
    }
    if (description !== undefined) {
      updates.push(`description = $${idx++}`); values.push(description?.trim() || null);
    }
    if (keywords !== undefined) {
      const kws = normKeywords(Array.isArray(keywords) ? keywords : String(keywords).split(",").map((k: string) => k.trim()).filter(Boolean));
      updates.push(`keywords = $${idx++}`); values.push(kws);
    }

    if (updates.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });
    updates.push(`updated_at = NOW()`);

    const updated = await qOne(
      `UPDATE sectors SET ${updates.join(", ")} WHERE id = $1 AND owner_id = $2 RETURNING *`,
      values
    );

    res.json({ sector: updated });
  }));

  // DELETE /api/user/sectors/:id - Deletar setor
  app.delete("/api/user/sectors/:id", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const r = await pool.query(`DELETE FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (r.rowCount === 0) return res.status(404).json({ error: "Setor não encontrado." });
    res.status(204).send();
  }));

  // ---- MEMBROS DE SETOR ----

  // GET /api/user/sectors/:id/members - Listar membros do setor
  app.get("/api/user/sectors/:id/members", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);

    // Verificar dono do setor
    const sector = await qOne(`SELECT id FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });

    const members = await q(
      `SELECT
          sm.id,
          sm.sector_id,
          sm.member_id,
          sm.is_primary,
          sm.can_receive_tickets,
          sm.max_open_tickets,
          COALESCE(sm.current_open_tickets, 0) as current_open_tickets,
          sm.assigned_at,
          sm.assigned_by,
          tm.name as member_name,
          tm.email as member_email,
          tm.role as member_role,
          tm.is_active as member_is_active
       FROM sector_members sm
       JOIN team_members tm ON tm.id = sm.member_id
       WHERE sm.sector_id = $1 AND sm.owner_id = $2
       ORDER BY sm.is_primary DESC, tm.name ASC`,
      [req.params.id, ownerId]
    );

    res.json({ items: members });
  }));

  // GET /api/user/team-members-available - Listar membros disponíveis para vincular
  app.get("/api/user/team-members-available", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const members = await q(
      `SELECT id, name, email, role, is_active FROM team_members WHERE owner_id = $1 ORDER BY name ASC`,
      [ownerId]
    );
    res.json({ items: members });
  }));

  // POST /api/user/sectors/:id/members - Vincular membro ao setor
  app.post("/api/user/sectors/:id/members", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { memberId, isPrimary, canReceiveTickets, maxOpenTickets } = req.body || {};

    if (!memberId) return res.status(400).json({ error: "memberId é obrigatório." });

    // Verificar dono do setor
    const sector = await qOne(`SELECT id FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });

    // Verificar que o membro pertence ao dono
    const member = await qOne(`SELECT id FROM team_members WHERE id = $1 AND owner_id = $2`, [memberId, ownerId]);
    if (!member) return res.status(404).json({ error: "Membro não encontrado." });

    // Se is_primary, resetar outros
    if (isPrimary) {
      await pool.query(`UPDATE sector_members SET is_primary = false WHERE sector_id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    }

    await pool.query(
      `INSERT INTO sector_members (sector_id, member_id, owner_id, is_primary, can_receive_tickets, max_open_tickets, assigned_by, assigned_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
       ON CONFLICT (sector_id, member_id) DO UPDATE SET
         is_primary = EXCLUDED.is_primary,
         can_receive_tickets = EXCLUDED.can_receive_tickets,
         max_open_tickets = EXCLUDED.max_open_tickets,
         assigned_by = EXCLUDED.assigned_by,
         assigned_at = NOW()`,
      [req.params.id, memberId, ownerId, isPrimary ?? false, canReceiveTickets ?? true, maxOpenTickets ?? 10, getUserId(req)]
    );

    const added = await qOne(
      `SELECT sm.*, tm.name as member_name, tm.email as member_email, tm.role as member_role, tm.is_active as member_is_active
       FROM sector_members sm JOIN team_members tm ON tm.id = sm.member_id
       WHERE sm.sector_id = $1 AND sm.member_id = $2 AND sm.owner_id = $3`,
      [req.params.id, memberId, ownerId]
    );

    res.status(201).json({ member: added });
  }));

  // DELETE /api/user/sectors/:id/members/:memberId - Desvincular membro
  app.delete("/api/user/sectors/:id/members/:memberId", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);

    const sector = await qOne(`SELECT id FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });

    const r = await pool.query(
      `DELETE FROM sector_members WHERE sector_id = $1 AND member_id = $2 AND owner_id = $3`,
      [req.params.id, req.params.memberId, ownerId]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: "Membro não encontrado no setor." });
    res.status(204).send();
  }));

  // PATCH /api/user/sectors/:id/members/:memberId - Atualizar config do membro no setor
  app.patch("/api/user/sectors/:id/members/:memberId", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { isPrimary, canReceiveTickets, maxOpenTickets } = req.body || {};

    const sector = await qOne(`SELECT id FROM sectors WHERE id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    if (!sector) return res.status(404).json({ error: "Setor não encontrado." });

    if (isPrimary) {
      await pool.query(`UPDATE sector_members SET is_primary = false WHERE sector_id = $1 AND owner_id = $2`, [req.params.id, ownerId]);
    }

    const updates: string[] = [];
    const values: any[] = [req.params.id, req.params.memberId, ownerId];
    let idx = 4;

    if (isPrimary !== undefined) { updates.push(`is_primary = $${idx++}`); values.push(isPrimary); }
    if (canReceiveTickets !== undefined) { updates.push(`can_receive_tickets = $${idx++}`); values.push(canReceiveTickets); }
    if (maxOpenTickets !== undefined) { updates.push(`max_open_tickets = $${idx++}`); values.push(maxOpenTickets); }

    if (updates.length === 0) return res.status(400).json({ error: "Nenhum campo para atualizar." });

    await pool.query(
      `UPDATE sector_members SET ${updates.join(", ")} WHERE sector_id = $1 AND member_id = $2 AND owner_id = $3`,
      values
    );

    const updated = await qOne(
      `SELECT sm.*, tm.name as member_name, tm.email as member_email, tm.role as member_role, tm.is_active as member_is_active
       FROM sector_members sm JOIN team_members tm ON tm.id = sm.member_id
       WHERE sm.sector_id = $1 AND sm.member_id = $2 AND sm.owner_id = $3`,
      [req.params.id, req.params.memberId, ownerId]
    );

    res.json({ member: updated });
  }));

  // ---- ROTEAMENTO ----

  // POST /api/user/sectors/route - Rotear conversa para setor por intenção
  app.post("/api/user/sectors/route", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { conversationId, messageText } = req.body || {};

    if (!conversationId || !messageText) {
      return res.status(400).json({ error: "conversationId e messageText são obrigatórios." });
    }

    // Verificar que a conversa pertence ao usuário
    const conv = await qOne(
      `SELECT c.id, c.connection_id FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE c.id = $1 AND wc.user_id = $2`,
      [conversationId, ownerId]
    );
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });

    const sectors = await q(`SELECT * FROM sectors WHERE owner_id = $1 ORDER BY name ASC`, [ownerId]);
    if (sectors.length === 0) return res.status(400).json({ error: "Nenhum setor configurado." });

    let selected: any = null;
    let bestScore = 0;
    let bestReason = "";

    for (const sec of sectors) {
      const { score, matches } = detectIntent(messageText, sec);
      if (score > bestScore) {
        bestScore = score;
        selected = sec;
        bestReason = matches.length ? `Match por keywords: ${matches.slice(0, 5).join(", ")}` : "Sem match";
      }
    }

    // Fallback: setor com membro disponível
    if (!selected || bestScore <= 0) {
      selected = await qOne(
        `SELECT s.* FROM sectors s
         JOIN sector_members sm ON sm.sector_id = s.id AND sm.owner_id = $1
         JOIN team_members tm ON tm.id = sm.member_id
         WHERE s.owner_id = $1 AND sm.can_receive_tickets = true AND tm.is_active = true
         GROUP BY s.id ORDER BY s.name ASC LIMIT 1`,
        [ownerId]
      );
      bestScore = 0.35;
      bestReason = "Fallback por disponibilidade";
    }

    if (!selected) return res.status(400).json({ error: "Nenhum setor disponível para roteamento." });

    // Selecionar membro do setor (menor carga)
    const member = await qOne(
      `SELECT sm.member_id, tm.name as member_name,
              COALESCE(loads.open_count, 0) as current_load,
              COALESCE(sm.max_open_tickets, 10) as max_open_tickets
       FROM sector_members sm
       JOIN team_members tm ON tm.id = sm.member_id
       LEFT JOIN (
         SELECT assigned_to_member_id as mid, COUNT(*) as open_count
         FROM conversations WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false
         GROUP BY assigned_to_member_id
       ) loads ON loads.mid = sm.member_id
       WHERE sm.sector_id = $1 AND sm.owner_id = $2
         AND sm.can_receive_tickets = true AND tm.is_active = true
         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)
       ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC LIMIT 1`,
      [selected.id, ownerId]
    );

    const intent = normText(messageText).split(/\s+/).slice(0, 4).join("_") || "geral";

    await pool.query(
      `UPDATE conversations SET
         sector_id = $1,
         assigned_to_member_id = $2,
         routing_intent = $3,
         routing_confidence = $4,
         routing_at = NOW(),
         updated_at = NOW()
       WHERE id = $5`,
      [selected.id, member?.member_id || null, intent, bestScore, conversationId]
    );

    // Log
    try {
      await pool.query(
        `INSERT INTO routing_logs (conversation_id, message_text, detected_intent, matched_sector_id, confidence_score, assigned_to_member_id, routing_method)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [conversationId, messageText, intent, selected.id, bestScore, member?.member_id || null, "intent+fallback"]
      );
    } catch (_) {}

    res.json({
      sectorId: selected.id,
      sectorName: selected.name,
      assignedMemberId: member?.member_id || null,
      assignedMemberName: member?.member_name || null,
      confidence: bestScore,
      reason: bestReason,
    });
  }));

  // ---- ENCAMINHAMENTO (transfer) ----

  // POST /api/user/sectors/transfer - Mover conversa para outro setor
  app.post("/api/user/sectors/transfer", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const { conversationId, targetSectorId, reason } = req.body || {};

    if (!conversationId || !targetSectorId) {
      return res.status(400).json({ error: "conversationId e targetSectorId são obrigatórios." });
    }

    // Verificar setor destino pertence ao dono
    const targetSector = await qOne(`SELECT * FROM sectors WHERE id = $1 AND owner_id = $2`, [targetSectorId, ownerId]);
    if (!targetSector) return res.status(404).json({ error: "Setor destino não encontrado." });

    // Verificar conversa pertence ao dono
    const conv = await qOne(
      `SELECT c.id FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE c.id = $1 AND wc.user_id = $2`,
      [conversationId, ownerId]
    );
    if (!conv) return res.status(404).json({ error: "Conversa não encontrada." });

    // Selecionar membro disponível no setor destino
    const member = await qOne(
      `SELECT sm.member_id, tm.name as member_name
       FROM sector_members sm
       JOIN team_members tm ON tm.id = sm.member_id
       LEFT JOIN (
         SELECT assigned_to_member_id as mid, COUNT(*) as open_count
         FROM conversations WHERE assigned_to_member_id IS NOT NULL AND COALESCE(is_closed, false) = false
         GROUP BY assigned_to_member_id
       ) loads ON loads.mid = sm.member_id
       WHERE sm.sector_id = $1 AND sm.owner_id = $2
         AND sm.can_receive_tickets = true AND tm.is_active = true
         AND COALESCE(loads.open_count, 0) < COALESCE(sm.max_open_tickets, 10)
       ORDER BY sm.is_primary DESC, COALESCE(loads.open_count, 0) ASC LIMIT 1`,
      [targetSectorId, ownerId]
    );

    await pool.query(
      `UPDATE conversations SET
         sector_id = $1,
         assigned_to_member_id = $2,
         routing_at = NOW(),
         routing_intent = 'transfer',
         updated_at = NOW()
       WHERE id = $3`,
      [targetSectorId, member?.member_id || null, conversationId]
    );

    res.json({
      success: true,
      sectorId: targetSector.id,
      sectorName: targetSector.name,
      assignedMemberId: member?.member_id || null,
      assignedMemberName: member?.member_name || null,
      reason: reason || "Encaminhamento manual",
    });
  }));

  // ---- VISIBILIDADE POR SETOR ----

  // GET /api/user/sectors/conversations - Conversas filtradas por setor do membro
  // (Membro comum vê só conversas dos setores dele; dono vê tudo)
  app.get("/api/user/sectors/conversations", isAuthenticated, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const sectorId = req.query.sectorId as string | undefined;

    // Se filtro por setor específico
    if (sectorId) {
      const convs = await q(
        `SELECT c.* FROM conversations c
         JOIN whatsapp_connections wc ON wc.id = c.connection_id
         WHERE wc.user_id = $1 AND c.sector_id = $2
         ORDER BY c.updated_at DESC`,
        [ownerId, sectorId]
      );
      return res.json({ items: convs });
    }

    // Sem filtro: dono vê tudo
    const convs = await q(
      `SELECT c.* FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE wc.user_id = $1
       ORDER BY c.updated_at DESC LIMIT 200`,
      [ownerId]
    );
    res.json({ items: convs });
  }));

  // ---- RELATÓRIOS (somente dono) ----

  // GET /api/user/sectors/reports - Relatório de atendimento por setor e membro
  app.get("/api/user/sectors/reports", isAuthenticated, requireOwner, asyncHandler(async (req, res) => {
    const ownerId = getUserId(req);
    const startDate = (req.query.startDate as string) || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const endDate = (req.query.endDate as string) || new Date().toISOString().split("T")[0];

    // Summary
    const summary = await qOne<any>(
      `SELECT
         COUNT(c.id)::int as total_conversations,
         COUNT(CASE WHEN COALESCE(c.is_closed, false) = false THEN 1 END)::int as open_conversations,
         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_conversations
       FROM conversations c
       JOIN whatsapp_connections wc ON wc.id = c.connection_id
       WHERE wc.user_id = $1
         AND c.routing_at IS NOT NULL
         AND c.routing_at::date BETWEEN $2::date AND $3::date`,
      [ownerId, startDate, endDate]
    );

    // Por setor
    const bySector = await q<any>(
      `SELECT
         s.id as sector_id,
         s.name as sector_name,
         COUNT(c.id)::int as assigned_count,
         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,
         ROUND(AVG(
           CASE WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600
                ELSE NULL END
         )::numeric, 2) as avg_hours
       FROM sectors s
       LEFT JOIN conversations c ON c.sector_id = s.id
         AND c.routing_at::date BETWEEN $2::date AND $3::date
       WHERE s.owner_id = $1
       GROUP BY s.id, s.name
       ORDER BY assigned_count DESC, s.name ASC`,
      [ownerId, startDate, endDate]
    );

    // Por membro
    const byMember = await q<any>(
      `SELECT
         tm.id as member_id,
         tm.name as member_name,
         tm.email as member_email,
         COUNT(c.id)::int as assigned_count,
         COUNT(CASE WHEN COALESCE(c.is_closed, false) = true THEN 1 END)::int as closed_count,
         ROUND(AVG(
           CASE WHEN c.closed_at IS NOT NULL AND c.routing_at IS NOT NULL
                THEN EXTRACT(EPOCH FROM (c.closed_at - c.routing_at)) / 3600
                ELSE NULL END
         )::numeric, 2) as avg_hours
       FROM team_members tm
       LEFT JOIN conversations c ON c.assigned_to_member_id = tm.id
         AND c.routing_at::date BETWEEN $2::date AND $3::date
       WHERE tm.owner_id = $1
       GROUP BY tm.id, tm.name, tm.email
       ORDER BY assigned_count DESC, tm.name ASC`,
      [ownerId, startDate, endDate]
    );

    res.json({
      period: { startDate, endDate },
      totalConversations: summary?.total_conversations || 0,
      totalOpen: summary?.open_conversations || 0,
      totalClosed: summary?.closed_conversations || 0,
      bySector,
      byMember,
    });
  }));

  // ---- ROTA PARA MEMBRO (visibilidade por setor) ----
  // GET /api/member/sectors/my - Setor(es) do membro logado (via header X-Member-Token)
  app.get("/api/member/sectors/my", asyncHandler(async (req, res) => {
    const token = req.headers["x-member-token"] as string || req.query.memberToken as string;
    if (!token) return res.status(401).json({ error: "Token de membro necessário." });

    const session = await qOne(
      `SELECT tms.member_id, tm.owner_id 
       FROM team_member_sessions tms 
       JOIN team_members tm ON tm.id = tms.member_id
       WHERE tms.token = $1 AND tms.expires_at > NOW()`,
      [token]
    );
    if (!session) return res.status(401).json({ error: "Sessão inválida ou expirada." });

    const sectors = await q(
      `SELECT s.id, s.name, s.description, sm.is_primary, sm.can_receive_tickets
       FROM sectors s
       JOIN sector_members sm ON sm.sector_id = s.id
       WHERE sm.member_id = $1 AND sm.owner_id = $2
       ORDER BY s.name ASC`,
      [session.member_id, session.owner_id]
    );

    res.json({ items: sectors });
  }));

  console.log("[UserSectors] Rotas registradas com sucesso!");
}
