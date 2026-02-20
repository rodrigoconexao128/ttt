import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const stmts = [
  // conversations missing sector_id
  `ALTER TABLE conversations ADD COLUMN IF NOT EXISTS sector_id VARCHAR(255) NULL`,
  // sectors missing owner_id
  `ALTER TABLE sectors ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) NULL`,
  // sector_members missing owner_id
  `ALTER TABLE sector_members ADD COLUMN IF NOT EXISTS owner_id VARCHAR(255) NULL`,
  // indexes after columns exist
  `CREATE INDEX IF NOT EXISTS idx_conversations_sector_id ON conversations(sector_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sectors_owner_id ON sectors(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_sector_members_owner_id ON sector_members(owner_id)`,
];

for (const stmt of stmts) {
  try {
    await pool.query(stmt);
    console.log('[OK]', stmt.substring(0, 80));
  } catch (err) {
    console.error('[ERR]', stmt.substring(0, 80), err.message);
  }
}

// Verify
const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name IN ('sector_id','assigned_to_member_id','routing_intent','routing_confidence','routing_at') ORDER BY column_name`);
console.log('conversations routing cols:', r.rows.map(x => x.column_name));

const r2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='sectors' AND column_name='owner_id'`);
console.log('sectors.owner_id:', r2.rows.length > 0 ? 'EXISTS' : 'MISSING');

const r3 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='sector_members' AND column_name='owner_id'`);
console.log('sector_members.owner_id:', r3.rows.length > 0 ? 'EXISTS' : 'MISSING');

await pool.end();
