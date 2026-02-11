import { db, pgp } from '../db';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import type { Ticket, TicketMessage, TicketAttachment, TicketStatus, TicketPriority } from '../../client/src/types/tickets';

// Upload helper
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
  const uploadPath = path.join(process.cwd(), 'uploads', key);
  
  await fs.mkdir(path.dirname(uploadPath), { recursive: true });
  await fs.writeFile(uploadPath, buffer);
  
  return {
    provider: 'local',
    key,
    url: `/uploads/${key}`,
    sha256
  };
}

// Create ticket
export async function createTicket(input: {
  userId: number;
  subject: string;
  description?: string;
  priority: TicketPriority;
}): Promise<Ticket> {
  return db.tx(async (tx) => {
    const ticket = await tx.one(
      `INSERT INTO tickets (user_id, subject, description, priority, status)
       VALUES ($1, $2, $3, $4, 'open')
       RETURNING *`,
      [input.userId, input.subject.trim(), input.description?.trim() || null, input.priority]
    );
    
    if (input.description?.trim()) {
      await tx.none(
        `INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body)
         VALUES ($1, 'user', $2, $3)`,
        [ticket.id, input.userId, input.description.trim()]
      );
    }
    
    return ticket;
  });
}

// List user tickets
export async function listUserTickets(userId: number, page: number, limit: number): Promise<{
  items: Ticket[];
  total: number;
  page: number;
  limit: number;
}> {
  const offset = (page - 1) * limit;
  
  const [items, total] = await Promise.all([
    db.any(
      `SELECT t.*, u.name as user_name
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       WHERE t.user_id = $1 AND t.deleted_at IS NULL
       ORDER BY t.last_message_at DESC NULLS LAST, t.created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    ),
    db.one(
      `SELECT COUNT(*) FROM tickets WHERE user_id = $1 AND deleted_at IS NULL`,
      [userId],
      r => parseInt(r.count)
    )
  ]);
  
  return { items, total, page, limit };
}

// Get user ticket
export async function getUserTicketById(ticketId: number, userId: number): Promise<Ticket | null> {
  return db.oneOrNone(
    `SELECT t.*, u.name as user_name
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     WHERE t.id = $1 AND t.user_id = $2 AND t.deleted_at IS NULL`,
    [ticketId, userId]
  );
}

// Update user ticket
export async function updateUserTicket(ticketId: number, userId: number, payload: any): Promise<Ticket> {
  const allowed = ['subject', 'description', 'priority'];
  const updates: string[] = [];
  const values: any[] = [];
  let idx = 2;
  
  for (const key of allowed) {
    if (payload[key] !== undefined) {
      updates.push(`${key} = $${idx}`);
      values.push(payload[key]);
      idx++;
    }
  }
  
  updates.push(`updated_at = NOW()`);
  
  return db.one(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND user_id = $${idx} AND deleted_at IS NULL RETURNING *`,
    [ticketId, ...values, userId]
  );
}

// Delete user ticket
export async function deleteUserTicket(ticketId: number, userId: number): Promise<void> {
  await db.none(
    `UPDATE tickets SET deleted_at = NOW() WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}

// List messages for user
export async function listMessagesForUser(ticketId: number, userId: number): Promise<TicketMessage[]> {
  const messages = await db.any(
    `SELECT tm.* FROM ticket_messages tm
     JOIN tickets t ON t.id = tm.ticket_id
     WHERE tm.ticket_id = $1 AND t.user_id = $2 AND tm.deleted_at IS NULL
     ORDER BY tm.created_at ASC`,
    [ticketId, userId]
  );
  
  for (const msg of messages) {
    msg.attachments = await db.any(
      `SELECT * FROM ticket_attachments WHERE message_id = $1 AND deleted_at IS NULL`,
      [msg.id]
    );
  }
  
  return messages;
}

// Send user message
export async function sendUserMessage(params: {
  userId: number;
  ticketId: number;
  body: string;
  files: Express.Multer.File[];
}): Promise<TicketMessage> {
  if (params.body.trim().length === 0 && params.files.length === 0) {
    throw new Error('Mensagem vazia.');
  }
  
  return db.tx(async (tx) => {
    const ticket = await tx.oneOrNone(
      `SELECT * FROM tickets WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [params.ticketId, params.userId]
    );
    if (!ticket) throw new Error('Ticket não encontrado.');
    
    const msg = await tx.one(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_user_id, body, has_attachments)
       VALUES ($1, 'user', $2, $3, $4) RETURNING *`,
      [params.ticketId, params.userId, params.body.trim() || '[imagem]', params.files.length > 0]
    );
    
    for (const f of params.files) {
      const uploaded = await uploadImageBuffer(f.buffer, f.originalname, f.mimetype);
      await tx.none(
        `INSERT INTO ticket_attachments
         (ticket_id, message_id, kind, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256)
         VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9)`,
        [params.ticketId, msg.id, f.originalname, f.mimetype, f.size, uploaded.provider, uploaded.key, uploaded.url, uploaded.sha256]
      );
    }
    
    if (['resolved', 'closed'].includes(ticket.status)) {
      await tx.none(`UPDATE tickets SET status = 'open' WHERE id = $1`, [params.ticketId]);
    }
    
    return msg;
  });
}

// Mark read by user
export async function markReadByUser(ticketId: number, userId: number): Promise<void> {
  await db.none(
    `UPDATE tickets SET unread_count_user = 0 WHERE id = $1 AND user_id = $2`,
    [ticketId, userId]
  );
}

// Admin functions
export async function listAdminTickets(filters: {
  status?: TicketStatus;
  priority?: TicketPriority;
  assignedAdminId?: number;
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
  
  const [items, total] = await Promise.all([
    db.any(
      `SELECT t.*, u.name as user_name, a.name as admin_name
       FROM tickets t
       JOIN users u ON u.id = t.user_id
       LEFT JOIN admins a ON a.id = t.assigned_admin_id
       ${where}
       ORDER BY 
         CASE t.priority WHEN 'urgent' THEN 1 WHEN 'high' THEN 2 WHEN 'medium' THEN 3 ELSE 4 END,
         t.last_message_at DESC NULLS LAST
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, filters.limit, offset]
    ),
    db.one(`SELECT COUNT(*) FROM tickets t ${where}`, params, r => parseInt(r.count))
  ]);
  
  return { items, total, page: filters.page, limit: filters.limit };
}

export async function getAdminTicketById(ticketId: number): Promise<Ticket | null> {
  return db.oneOrNone(
    `SELECT t.*, u.name as user_name, a.name as admin_name
     FROM tickets t
     JOIN users u ON u.id = t.user_id
     LEFT JOIN admins a ON a.id = t.assigned_admin_id
     WHERE t.id = $1 AND t.deleted_at IS NULL`,
    [ticketId]
  );
}

export async function updateAdminTicket(ticketId: number, adminId: number, payload: any): Promise<Ticket> {
  const allowed = ['assignedAdminId', 'priority', 'subject', 'description'];
  const updates: string[] = [];
  const values: any[] = [];
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
  
  return db.one(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [ticketId, ...values]
  );
}

export async function updateTicketStatus(ticketId: number, status: TicketStatus): Promise<Ticket> {
  const updates = [`status = $2`, `updated_at = NOW()`];
  
  if (status === 'resolved') updates.push(`resolved_at = NOW()`);
  else if (status === 'closed') updates.push(`closed_at = NOW()`);
  else {
    updates.push(`resolved_at = NULL`);
    updates.push(`closed_at = NULL`);
  }
  
  return db.one(
    `UPDATE tickets SET ${updates.join(', ')} WHERE id = $1 AND deleted_at IS NULL RETURNING *`,
    [ticketId, status]
  );
}

export async function listMessagesForAdmin(ticketId: number): Promise<TicketMessage[]> {
  const messages = await db.any(
    `SELECT * FROM ticket_messages WHERE ticket_id = $1 AND deleted_at IS NULL ORDER BY created_at ASC`,
    [ticketId]
  );
  
  for (const msg of messages) {
    msg.attachments = await db.any(
      `SELECT * FROM ticket_attachments WHERE message_id = $1 AND deleted_at IS NULL`,
      [msg.id]
    );
  }
  
  return messages;
}

export async function sendAdminMessage(params: {
  adminId: number;
  ticketId: number;
  body: string;
  files: Express.Multer.File[];
}): Promise<TicketMessage> {
  if (params.body.trim().length === 0 && params.files.length === 0) {
    throw new Error('Mensagem vazia.');
  }
  
  return db.tx(async (tx) => {
    const ticket = await tx.oneOrNone(
      `SELECT * FROM tickets WHERE id = $1 AND deleted_at IS NULL`,
      [params.ticketId]
    );
    if (!ticket) throw new Error('Ticket não encontrado.');
    
    const msg = await tx.one(
      `INSERT INTO ticket_messages (ticket_id, sender_type, sender_admin_id, body, has_attachments)
       VALUES ($1, 'admin', $2, $3, $4) RETURNING *`,
      [params.ticketId, params.adminId, params.body.trim() || '[imagem]', params.files.length > 0]
    );
    
    for (const f of params.files) {
      const uploaded = await uploadImageBuffer(f.buffer, f.originalname, f.mimetype);
      await tx.none(
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
  await db.none(`UPDATE tickets SET unread_count_admin = 0 WHERE id = $1`, [ticketId]);
}
