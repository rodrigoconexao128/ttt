import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const r = await pool.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name`);
console.log('Tables:', r.rows.map((x: any) => x.table_name).join(', '));

const cols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='conversations' ORDER BY column_name`);
console.log('Conversations cols:', cols.rows.map((x: any) => x.column_name).join(', '));

const tmCols = await pool.query(`SELECT column_name FROM information_schema.columns WHERE table_name='team_members' ORDER BY column_name`);
console.log('Team members cols:', tmCols.rows.map((x: any) => x.column_name).join(', '));

await pool.end();
