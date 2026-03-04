import { db } from '../db';
import { sql } from 'drizzle-orm';
import path from 'path';
import crypto from 'crypto';
import type { Ticket, TicketMessage, TicketAttachment, TicketStatus, TicketPriority } from './types';
import { pool } from '../db';
import { supabase } from '../supabaseAuth';

const BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';

type SectorRoutingCandidate = {
  id: string;
  name: string;
  keywords: string[];
  auto_assign_agent_id: string | null;
};

// Upload helper — Supabase Storage
async function uploadImageBuffer(buffer: Buffer, originalName: string, mimeType: string): Promise<{
  provider: string;
  key: string;
  url: string;
  width?: number;
  height?: number;
  sha256?: string;
}> {
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  const ext = path.extname(originalName) || '.png';
  const key = `tickets/${Date.now()}-${crypto.randomBytes(8).toString('hex')}${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: mimeType,
    upsert: false,
    cacheControl: '3600',
  });
  if (error) throw new Error(`Supabase Storage upload failed: ${error.message}`);

  const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(key);

  return {
    provider: 'supabase',
    key,
    url: urlData.publicUrl,
    sha256
  };
}

// Helper: execute raw SQL via pool (since ticket tables aren't in Drizzle schema)
async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}

async function queryOne<T = any>(text: string, params: any[] = []): Promise<T | null> {
  const result = await pool.query(text, params);
  return (result.rows[0] as T) || null;
}

function normalizeText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeKeywords(keywords: string[]): string[] {
  const seen = new Set<string>();
  for (const keyword of keywords) {
    const normalized = normalizeText(keyword);
    if (normalized) {
      seen.add(normalized);
    }
  }
  return Array.from(seen);
}

async function fetchSectorsForRouting(client?: any): Promise<SectorRoutingCandidate[]> {
  const sqlText = `SELECT id, name, keywords, auto_assign_agent_id FROM sectors`;
  const result = client ? await client.query(sqlText) : await pool.query(sqlText);
  return (result.rows || []) as SectorRoutingCandidate[];
}

function findBestSector(text: string, sectors: SectorRoutingCandidate[]) {
  const normalizedText = normalizeText(text);
  if (!normalizedText || sectors.length === 0) return null;

  let best: { sector: SectorRoutingCandidate; matches: string[] } | null = null;

  for (const sector of sectors) {
    const keywords = normalizeKeywords(sector.keywords || []);
    if (keywords.length === 0) continue;

    const matches = keywords.filter((keyword) => normalizedText.includes(keyword));
    if (matches.length === 0) continue;

    if (!best || matches.length > best.matches.length) {
      best = { sector, matches };
      continue;
    }

    if (best && matches.length === best.matches.length) {
      const currentScore = keywords.join(' ').length;
      const bestScore = normalizeKeywords(best.sector.keywords || []).join(' ').length;
      if (currentScore > bestScore) {
        best = { sector, matches };
      }
    }
  }

  return best;
}

// Transaction helper using pool directly
async function withTransaction<T>(fn: (client: any) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (e) {
    await client.query('ROLLBACK');
    throw e;
  } finally {
    client.release();
  }
}

// Create ticket
export async function createTicket(input: {
  userId: string;
  subject: string;
  description?: string;
  priority: TicketPriority;
}): Promise<Ticket> {
  return withTransaction(async (client) => {
    const ticketResult = await client.query(
      `INSERT INTO tickets (user_id, subject, description, priority, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [input.userId, input.subject.trim(), input.description?.trim() || null, input.priority]
    );
    let ticket = ticketResult.rows[0];

    if (input.description?.trim()) {
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body)
         VALUES ($1, 'user', $2, $3)`,
        [ticket.id, input.userId, input.description.trim()]
      );
    }

    const routingText = `${input.subject || ''} ${input.description || ''}`.trim();
    if (routingText) {
      const sectors = await fetchSectorsForRouting(client);
      const best = findBestSector(routingText, sectors);
      if (best) {
        const updateResult = await client.query(
          `UPDATE tickets
           SET sector_id = $2,
               assigned_admin_id = CASE WHEN $3 IS NOT NULL THEN $3 ELSE assigned_admin_id END,
               updated_at = NOW()
           WHERE id = $1
           RETURNING *`,
          [ticket.id, best.sector.id, best.sector.auto_assign_agent_id]
        );
        ticket = updateResult.rows[0] || ticket;
      }
    }

    return ticket;
  });
}

// List user tickets
export async function listUserTickets(userId: string, page: number, limit: number): Promise<{
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
}> {
  const offset = (page - 1) * limit;

  const [items, totalRow] = await Promise.all([
    query(
      `SELECT t.*, u.name as user_name
       FROM tickets t
       JOIN users u ON u.id = t.user_id::text
       WHERE t.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM tickets WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId]
    )
  ]);

  return { items, total: parseInt(totalRow?.count || '0'), page, limit };
}

// Get user ticket
export async function getUserTicketById(ticketId: number, userId: string): Promise<Ticket | null> {
  return queryOne(
    `SELECT t.*, u.name as user_name
     FROM tickets t
     JOIN users u ON u.id = t.user_id::text
     WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL`,
    [ticketId, userId]
  );
}

// Update user ticket
export async function updateUserTicket(ticketId: number, userId: string, payload: any): Promise<Ticket> {
  const allowed = ['subject', 'description', 'priority'];
  const updates: string[] = [];
  const values: any[] = [ticketId];
  let idx = 2;

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      updates.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx++;
    }
  }

  updates.push(`updated_at = NOW()`);
  values.push(userId);

  const result = await queryOne<Ticket>(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND user_id = $${idx} AND deleted_at IS NULL RETURNING *`,
    values
  );
  if (!result) throw new Error('Ticket não encontrado.');
  return result;
}

// Delete user ticket
export async function deleteUserTicket(ticketId: number, userId: string): Promise<void> {
  await query(
    `UPDATE tickets SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}

// List messages for user
export async function listMessagesForUser(ticketId: number, userId: string): Promise<TicketMessage[]> {
  const messages = await query<TicketMessage>(
    `SELECT tm.* FROM ticket_messages tm
     JOIN tickets t ON t.id = tm.ticket_id
     WHERE tm.ticket_id = $1 AND t.user_id = $2 AND tm.deleted_at IS NULL
     ORDER BY tm.created_at ASC`,
    [ticketId, userId]
  );

  const msgIds = messages.map(m => m.id);
  if (msgIds.length > 0) {
    const allAttachments = await query<TicketAttachment>(
      `SELECT * FROM ticket_attachments WHERE message_id = ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY created_at ASC`,
      [msgIds]
    );
    const attachMap = new Map<number, TicketAttachment[]>();
    for (const att of allAttachments) {
      if (!attachMap.has(att.message_id)) attachMap.set(att.message_id, []);
      attachMap.get(att.message_id)!.push(att);
    }
    for (const msg of messages) {
      msg.attachments = attachMap.get(msg.id) || [];
    }
  } else {
    for (const msg of messages) msg.attachments = [];
  }

  return messages;
}

// Send user message
export async function sendUserMessage(params: {
  userId: string;
  ticketId: number;
  body: string;
  files: Express.Multer.File[];
}): Promise<TicketMessage> {
  if (params.body.trim().length === 0 && params.files.length === 0) {
    throw new Error('Mensagem vazia.');
  }

  return withTransaction(async (client) => {
    const ticketResult = await client.query(
      `SELECT * FROM tickets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [params.ticketId, params.userId]
    );
    const ticket = ticketResult.rows[0];
    if (!ticket) throw new Error('Ticket não encontrado.');

    const msgResult = await client.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body, has_attachments)
       VALUES ($1, 'user', $2, $3, $4) RETURNING *`,
      [params.ticketId, params.userId, params.body.trim() || '[imagem]', params.files.length > 0]
    );
    const msg = msgResult.rows[0];

    for (const f of params.files) {
      const uploaded = await uploadImageBuffer(f.buffer, f.originalname, f.mimetype);
      await client.query(
        `INSERT INTO ticket_attachments
         (ticket_id, message_id, kind, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256)
         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9)`,
        [params.ticketId, msg.id, f.originalname, f.mimetype, f.size, uploaded.provider, uploaded.key, uploaded.url, uploaded.sha256]
      );
    }

    // Update last_message_at and unread counter for admin
    const statusUpdate = ['resolved', 'closed'].includes(ticket.status) ? `, status = 'open'` : '';
    await client.query(
      `UPDATE tickets SET last_message_at = NOW(), unread_count_admin = COALESCE(unread_count_admin, 0) + 1, updated_at = NOW()${statusUpdate} WHERE id = $1`,
      [params.ticketId]
    );

    return msg;
  });
}

// Mark read by user
export async function markReadByUser(ticketId: number, userId: string): Promise<void> {
  await query(
    `UPDATE tickets SET unread_count_user = 0 WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}

// Admin functions
export async function listAdminTickets(filters: {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedAdminId?: string;
  page: number;
  limit: number;
}): Promise<{ items: any[]; total: number; page: number; limit: number }> {
  const offset = (filters.page - 1) * filters.limit;
  let where = 'WHERE t.deleted_at IS NULL';
  const params: any[] = [];
  let idx = 1;

  if (filters.status) {
    where += ` AND t.status = $${idx++}`;
    params.push(filters.status);
  }
  if (filters.priority) {
    where += ` AND t.priority = $${idx++}`;
    params.push(filters.priority);
  }
  if (filters.assignedAdminId !== undefined) {
    where += ` AND t.assigned_admin_id = $${idx++}`;
    params.push(filters.assignedAdminId);
  }

  const [items, totalRow] = await Promise.all([
    query(
      `SELECT t.*, u.name as user_name, a.email as admin_name
       FROM tickets t
       JOIN users u ON u.id = t.user_id::text
       LEFT JOIN admins a ON a.id::text = t.assigned_admin_id::text
       ${where}
       ORDER BY
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.last_message_at DESC NULLS LAST
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, offset]
    ),
    queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM tickets t ${where}`,
      params
    )
  ]);

  return { items, total: parseInt(totalRow?.count || '0'), page: filters.page, limit: filters.limit };
}

export async function getAdminTicketById(ticketId: number): Promise<Ticket | null> {
  return queryOne(
    `SELECT t.*, u.name as user_name, a.email as admin_name
     FROM tickets t
     JOIN users u ON u.id = t.user_id::text
     LEFT JOIN admins a ON a.id::text = t.assigned_admin_id::text
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [ticketId]
  );
}

export async function updateAdminTicket(ticketId: number, adminId: string, payload: any): Promise<Ticket> {
  const allowed = ['assignedAdminId', 'priority', 'subject', 'description', 'sectorId'];
  const updates: string[] = [];
  const values: any[] = [ticketId];
  let idx = 2;

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      const col = key === 'assignedAdminId' ? 'assigned_admin_id' : key === 'sectorId' ? 'sector_id' : key;
      updates.push(`${col} = $${idx}`);
      values.push(payload[key]);
      idx++;
    }
  }

  updates.push(`updated_at = NOW()`);

  const result = await queryOne<Ticket>(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    values
  );
  if (!result) throw new Error('Ticket não encontrado.');
  return result;
}

export async function updateTicketStatus(ticketId: number, status: TicketStatus): Promise<Ticket> {
  const updates = [`status = $2`, `updated_at = NOW()`];

  if (status === 'resolved') updates.push(`resolved_at = NOW()`);
  else if (status === 'closed') updates.push(`closed_at = NOW()`);
  else {
    updates.push(`resolved_at = NULL`);
    updates.push(`closed_at = NULL`);
  }

  const result = await queryOne<Ticket>(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [ticketId, status]
  );
  if (!result) throw new Error('Ticket não encontrado.');
  return result;
}

export async function listMessagesForAdmin(ticketId: number): Promise<TicketMessage[]> {
  const messages = await query<TicketMessage>(
    `SELECT * FROM ticket_messages WHERE ticket_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [ticketId]
  );

  const msgIds = messages.map(m => m.id);
  if (msgIds.length > 0) {
    const allAttachments = await query<TicketAttachment>(
      `SELECT * FROM ticket_attachments WHERE message_id = ANY($1::bigint[]) AND deleted_at IS NULL ORDER BY created_at ASC`,
      [msgIds]
    );
    const attachMap = new Map<number, TicketAttachment[]>();
    for (const att of allAttachments) {
      if (!attachMap.has(att.message_id)) attachMap.set(att.message_id, []);
      attachMap.get(att.message_id)!.push(att);
    }
    for (const msg of messages) {
      msg.attachments = attachMap.get(msg.id) || [];
    }
  } else {
    for (const msg of messages) msg.attachments = [];
  }

  return messages;
}

export async function sendAdminMessage(params: {
  adminId: string;
  ticketId: number;
  body: string;
  files: Express.Multer.File[];
}): Promise<TicketMessage> {
  if (params.body.trim().length === 0 && params.files.length === 0) {
    throw new Error('Mensagem vazia.');
  }

  return withTransaction(async (client) => {
    const ticketResult = await client.query(
      `SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL`,
      [params.ticketId]
    );
    if (!ticketResult.rows[0]) throw new Error('Ticket não encontrado.');

    const msgResult = await client.query(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_admin_id, body, has_attachments)
       VALUES ($1, 'admin', $2, $3, $4) RETURNING *`,
      [params.ticketId, params.adminId, params.body.trim() || '[imagem]', params.files.length > 0]
    );
    const msg = msgResult.rows[0];

    for (const f of params.files) {
      const uploaded = await uploadImageBuffer(f.buffer, f.originalname, f.mimetype);
      await client.query(
        `INSERT INTO ticket_attachments
         (ticket_id, message_id, kind, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256)
         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9)`,
        [params.ticketId, msg.id, f.originalname, f.mimetype, f.size, uploaded.provider, uploaded.key, uploaded.url, uploaded.sha256]
      );
    }

    // Update last_message_at and unread counter for user
    await client.query(
      `UPDATE tickets SET last_message_at = NOW(), unread_count_user = COALESCE(unread_count_user, 0) + 1, updated_at = NOW() WHERE id = $1`,
      [params.ticketId]
    );

    return msg;
  });
}

export async function markReadByAdmin(ticketId: number): Promise<void> {
  await query(`UPDATE tickets SET unread_count_admin = 0 WHERE id = $1`, [ticketId]);
}

export async function routeTicket(params: {
  ticketId?: number;
  subject?: string;
  description?: string;
  text?: string;
  apply?: boolean;
}): Promise<{
  matched: boolean;
  sector: SectorRoutingCandidate | null;
  matchedKeywords: string[];
  applied: boolean;
}> {
  let routingText = `${params.subject || ''} ${params.description || ''} ${params.text || ''}`.trim();

  if (!routingText && params.ticketId) {
    const ticket = await queryOne<{ subject: string; description: string | null }>(
      `SELECT subject, description FROM tickets WHERE id = $1 AND deleted_at IS NULL`,
      [params.ticketId]
    );
    if (ticket) {
      routingText = `${ticket.subject || ''} ${ticket.description || ''}`.trim();
    }
  }

  if (!routingText) {
    return { matched: false, sector: null, matchedKeywords: [], applied: false };
  }

  const sectors = await fetchSectorsForRouting();
  const best = findBestSector(routingText, sectors);
  if (!best) {
    return { matched: false, sector: null, matchedKeywords: [], applied: false };
  }

  let applied = false;
  if (params.ticketId && params.apply) {
    await query(
      `UPDATE tickets
       SET sector_id = $2,
           assigned_admin_id = CASE WHEN $3 IS NOT NULL AND assigned_admin_id IS NULL THEN $3 ELSE assigned_admin_id END,
           updated_at = NOW()
       WHERE id = $1 AND deleted_at IS NULL`,
      [params.ticketId, best.sector.id, best.sector.auto_assign_agent_id]
    );
    applied = true;
  }

  return {
    matched: true,
    sector: best.sector,
    matchedKeywords: best.matches,
    applied
  };
}

export async function getTicketReports(): Promise<{
  ticketsBySector: Array<{ sectorId: string | null; sectorName: string; tickets: number }>;
  averageFirstResponseMinutes: number;
  responseTimeTrend: Array<{ date: string; minutes: number }>;
  activeAgents: Array<{ agentId: string; agentEmail: string; tickets: number }>;
  activeAgentsCount: number;
}> {
  const [sectorRows, unassignedRow, avgRow, trendRows, agentRows] = await Promise.all([
    query<{ sector_id: string; sector_name: string; tickets: string }>(
      `SELECT s.id as sector_id, s.name as sector_name, COUNT(t.id) as tickets
       FROM sectors s
       LEFT JOIN tickets t ON t.sector_id = s.id AND t.deleted_at IS NULL
       GROUP BY s.id, s.name
       ORDER BY tickets DESC, s.name ASC`
    ),
    queryOne<{ tickets: string }>(
      `SELECT COUNT(*) as tickets
       FROM tickets
       WHERE sector_id IS NULL AND deleted_at IS NULL`
    ),
    queryOne<{ minutes: string }>(
      `SELECT AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) as minutes
       FROM tickets
       WHERE first_response_at IS NOT NULL AND deleted_at IS NULL`
    ),
    query<{ day: Date; minutes: string }>(
      `SELECT date_trunc('day', created_at) as day,
              AVG(EXTRACT(EPOCH FROM (first_response_at - created_at)) / 60) as minutes
       FROM tickets
       WHERE first_response_at IS NOT NULL
         AND created_at >= NOW() - INTERVAL '14 days'
         AND deleted_at IS NULL
       GROUP BY day
       ORDER BY day ASC`
    ),
    query<{ agent_id: string; agent_email: string; tickets: string }>(
      `SELECT a.id as agent_id, a.email as agent_email, COUNT(t.id) as tickets
       FROM admins a
       JOIN tickets t ON t.assigned_admin_id::text = a.id::text
       WHERE t.deleted_at IS NULL AND t.status IN ('open', 'in_progress')
       GROUP BY a.id, a.email
       ORDER BY tickets DESC, a.email ASC`
    ),
  ]);

  const ticketsBySector = sectorRows.map((row) => ({
    sectorId: row.sector_id,
    sectorName: row.sector_name,
    tickets: parseInt(row.tickets || '0', 10),
  }));

  if (unassignedRow) {
    ticketsBySector.push({
      sectorId: null,
      sectorName: 'Sem setor',
      tickets: parseInt(unassignedRow.tickets || '0', 10),
    });
  }

  const averageFirstResponseMinutes = avgRow?.minutes ? parseFloat(avgRow.minutes) : 0;

  const trendMap = new Map<string, number>();
  for (const row of trendRows) {
    const key = row.day.toISOString().slice(0, 10);
    trendMap.set(key, row.minutes ? parseFloat(row.minutes) : 0);
  }

  const responseTimeTrend: Array<{ date: string; minutes: number }> = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 13; i >= 0; i -= 1) {
    const day = new Date(today);
    day.setDate(today.getDate() - i);
    const key = day.toISOString().slice(0, 10);
    responseTimeTrend.push({
      date: key,
      minutes: trendMap.get(key) ?? 0,
    });
  }

  const activeAgents = agentRows.map((row) => ({
    agentId: row.agent_id,
    agentEmail: row.agent_email,
    tickets: parseInt(row.tickets || '0', 10),
  }));

  return {
    ticketsBySector,
    averageFirstResponseMinutes,
    responseTimeTrend,
    activeAgents,
    activeAgentsCount: activeAgents.length,
  };
}
