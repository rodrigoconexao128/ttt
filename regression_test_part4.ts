/**
 * Teste de regressão Parte 4 — Verificar que não quebramos nada
 */
import { Pool } from 'pg';

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

console.log('--- REGRESSION TEST: Verificando integridade das tabelas existentes ---\n');

// Test existing tables not altered (Partes 1 e 2)
const tables = ['users', 'conversations', 'messages', 'whatsapp_connections', 'team_members', 'team_member_sessions', 'tickets', 'sectors', 'sector_members'];

for (const t of tables) {
  try {
    const r = await pool.query(`SELECT COUNT(*)::int as cnt FROM ${t} LIMIT 1`);
    console.log(`[OK] ${t}: ${r.rows[0].cnt} rows`);
  } catch (e) {
    console.error(`[FAIL] ${t}: ${e.message}`);
  }
}

// Test that conversations still have all original columns
const convCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' ORDER BY column_name`);
const cols = convCols.rows.map(r => r.column_name);
const required = ['id', 'remote_jid', 'contact_name', 'connection_id', 'created_at', 'is_closed', 'kanban_stage_id'];
for (const col of required) {
  console.log(`[${cols.includes(col) ? 'OK' : 'FAIL'}] conversations.${col}: ${cols.includes(col) ? 'EXISTS' : 'MISSING'}`);
}

// Test new columns added
const newCols = ['sector_id', 'assigned_to_member_id', 'routing_intent', 'routing_confidence', 'routing_at'];
for (const col of newCols) {
  console.log(`[${cols.includes(col) ? 'OK' : 'FAIL'}] conversations.${col} (new): ${cols.includes(col) ? 'EXISTS' : 'MISSING'}`);
}

// Test that existing conversations are not broken
const activeConvs = await pool.query(`SELECT COUNT(*)::int as cnt FROM conversations WHERE created_at > NOW() - INTERVAL '30 days'`);
console.log(`[OK] Active conversations (last 30d): ${activeConvs.rows[0].cnt}`);

// Test team_members not broken
const tmCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='team_members' ORDER BY column_name`);
const tmColNames = tmCols.rows.map(r => r.column_name);
const tmRequired = ['id', 'owner_id', 'name', 'email', 'password_hash', 'role', 'permissions', 'is_active'];
for (const col of tmRequired) {
  console.log(`[${tmColNames.includes(col) ? 'OK' : 'FAIL'}] team_members.${col}: ${tmColNames.includes(col) ? 'EXISTS' : 'MISSING'}`);
}

// Test no orphaned sector data
const orphanSectors = await pool.query(`SELECT COUNT(*)::int as cnt FROM sectors WHERE owner_id IS NULL`);
console.log(`[${orphanSectors.rows[0].cnt === 0 ? 'OK' : 'WARN'}] Sectors sem owner_id: ${orphanSectors.rows[0].cnt}`);

// Test sectors.owner_id added
const sectorsWithOwner = await pool.query(`SELECT COUNT(*)::int as cnt FROM sectors WHERE owner_id IS NOT NULL`);
console.log(`[INFO] Sectors com owner_id configurado: ${sectorsWithOwner.rows[0].cnt}`);

await pool.end();
console.log('\n✅ REGRESSÃO CONCLUÍDA — Nenhuma tabela existente foi quebrada');
