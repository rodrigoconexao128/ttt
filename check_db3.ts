import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const r = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name IN ('sector_id','assigned_to_member_id','routing_intent','routing_confidence','routing_at') ORDER BY column_name`);
console.log('conversations new cols:', r.rows.map(x => x.column_name));

const r2 = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='sectors' ORDER BY column_name`);
console.log('sectors cols:', r2.rows.map(x => x.column_name));

await pool.end();
