import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pool } from './db';
import { supabase } from './supabaseAuth';

const BUCKET = process.env.SUPABASE_TICKET_ATTACHMENTS_BUCKET || 'ticket-attachments';
const BATCH_SIZE = Number(process.env.TICKET_MIGRATION_BATCH_SIZE || 50);

type TicketAttachmentRow = {
  id: number;
  ticket_id: number;
  message_id: number;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  storage_provider: string;
  storage_key: string;
  public_url: string;
  checksum_sha256: string | null;
};

function resolveLocalPath(att: TicketAttachmentRow): string | null {
  const candidates: string[] = [];

  if (att.storage_key) {
    candidates.push(att.storage_key);
    candidates.push(path.join('uploads', att.storage_key));
    candidates.push(path.join('uploads', 'tickets', path.basename(att.storage_key)));
  }

  if (att.public_url) {
    const cleanUrl = att.public_url.split('?')[0];
    if (cleanUrl.startsWith('/')) {
      candidates.push(cleanUrl.replace(/^\/+/, ''));
      candidates.push(path.join('uploads', path.basename(cleanUrl)));
      candidates.push(path.join('uploads', 'tickets', path.basename(cleanUrl)));
    }
  }

  for (const c of candidates) {
    const abs = path.isAbsolute(c) ? c : path.join(process.cwd(), c);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) {
      return abs;
    }
  }

  return null;
}

async function uploadBufferToSupabase(att: TicketAttachmentRow, buffer: Buffer) {
  const ext = path.extname(att.original_name || '') || path.extname(att.storage_key || '') || '.png';
  const key = `tickets/${Date.now()}-${att.id}-${crypto.randomBytes(6).toString('hex')}${ext}`;

  const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, {
    contentType: att.mime_type || 'application/octet-stream',
    upsert: false,
    cacheControl: '3600',
  });

  if (error) throw new Error(`upload failed: ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(key);
  return { key, publicUrl: data.publicUrl };
}

async function migrateOne(att: TicketAttachmentRow): Promise<'ok' | 'skip' | 'fail'> {
  try {
    const localPath = resolveLocalPath(att);
    if (!localPath) {
      console.warn(`⚠️  [${att.id}] arquivo local não encontrado (storage_key=${att.storage_key}, public_url=${att.public_url})`);
      return 'skip';
    }

    const buffer = fs.readFileSync(localPath);
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    const uploaded = await uploadBufferToSupabase(att, buffer);

    await pool.query(
      `UPDATE ticket_attachments
       SET storage_provider = 'supabase',
           storage_key = $2,
           public_url = $3,
           checksum_sha256 = COALESCE(checksum_sha256, $4)
       WHERE id = $1`,
      [att.id, uploaded.key, uploaded.publicUrl, checksum]
    );

    console.log(`✅ [${att.id}] migrado para ${uploaded.key}`);
    return 'ok';
  } catch (err: any) {
    console.error(`❌ [${att.id}] falha:`, err?.message || err);
    return 'fail';
  }
}

async function run() {
  console.log('🔄 Iniciando migração de anexos de tickets para Supabase Storage...');
  console.log(`📦 Bucket: ${BUCKET}`);

  const countRes = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count
     FROM ticket_attachments
     WHERE deleted_at IS NULL
       AND (
         storage_provider = 'local'
         OR public_url LIKE '/uploads/%'
         OR storage_key LIKE 'uploads/%'
       )`
  );

  const total = Number(countRes.rows[0]?.count || 0);
  console.log(`📊 Total de anexos candidatos: ${total}`);

  if (total === 0) {
    console.log('✅ Nada para migrar.');
    await pool.end();
    return;
  }

  let offset = 0;
  let ok = 0;
  let skip = 0;
  let fail = 0;

  while (true) {
    const rowsRes = await pool.query<TicketAttachmentRow>(
      `SELECT id, ticket_id, message_id, original_name, mime_type, size_bytes, storage_provider, storage_key, public_url, checksum_sha256
       FROM ticket_attachments
       WHERE deleted_at IS NULL
         AND (
           storage_provider = 'local'
           OR public_url LIKE '/uploads/%'
           OR storage_key LIKE 'uploads/%'
         )
       ORDER BY id ASC
       LIMIT $1 OFFSET $2`,
      [BATCH_SIZE, offset]
    );

    const rows = rowsRes.rows;
    if (rows.length === 0) break;

    for (const row of rows) {
      const result = await migrateOne(row);
      if (result === 'ok') ok++;
      else if (result === 'skip') skip++;
      else fail++;
    }

    offset += rows.length;
    console.log(`📈 Progresso: ${Math.min(offset, total)}/${total} | ok=${ok} skip=${skip} fail=${fail}`);
  }

  console.log('══════════════════════════════════════════');
  console.log('🏁 Migração finalizada');
  console.log(`✅ Migrados: ${ok}`);
  console.log(`⚠️  Pulados: ${skip}`);
  console.log(`❌ Falhas: ${fail}`);
  console.log('══════════════════════════════════════════');

  await pool.end();
}

run().catch(async (err) => {
  console.error('❌ Erro fatal na migração:', err);
  await pool.end();
  process.exit(1);
});
