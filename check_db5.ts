import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const r = await pool.query(`
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'team_member_sessions' ORDER BY ordinal_position
`);
console.log('team_member_sessions cols:', r.rows.map(x => x.column_name));

// Verify conversations have all needed cols
const r2 = await pool.query(`
  SELECT column_name FROM information_schema.columns 
  WHERE table_name = 'conversations' AND column_name IN ('sector_id','assigned_to_member_id','routing_intent','routing_confidence','routing_at','is_closed','closed_at','closed_by')
  ORDER BY column_name
`);
console.log('conversations routing+ticket cols:', r2.rows.map(x => x.column_name));

// Test a real query on sectors
const r3 = await pool.query(`SELECT COUNT(*)::int as cnt FROM sectors`);
console.log('sectors count:', r3.rows[0].cnt);

await pool.end();
