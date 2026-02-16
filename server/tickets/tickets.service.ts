import { db } from '../db';
import { sql } from 'drizzle-orm';
import path from 'path';
import crypto from 'crypto';
import type { Ticket, TicketMessage, TicketAttachment, TicketStatus, TicketPriority } from './types';
import { pool } from '../db';
import { supabase } from '../supabaseAuth';

const BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';

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
    const ticket = ticketResult.rows[0];

    if (input.description?.trim()) {
      await client.query(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body)
         VALUES ($1, 'user', $2, $3)`,
        [ticket.id, input.userId, input.description.trim()]
      );
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

    if (['resolved', 'closed'].includes(ticket.status)) {
      await client.query(`UPDATE tickets SET status = 'open' WHERE id = $1`, [params.ticketId]);
    }

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
  const allowed = ['assignedAdminId', 'priority', 'subject', 'description'];
  const updates: string[] = [];
  const values: any[] = [ticketId];
  let idx = 2;

  for (const key of allowed) {
    if (payload[key] !== undefined) {
      const col = key === 'assignedAdminId' ? 'assigned_admin_id' : key;
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

    return msg;
  });
}

export async function markReadByAdmin(ticketId: number): Promise<void> {
  await query(`UPDATE tickets SET unread_count_admin = 0 WHERE id = $1`, [ticketId]);
}
