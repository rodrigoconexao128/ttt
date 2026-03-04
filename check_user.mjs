import { config } from 'dotenv';
config({ quiet: true });
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const r1 = await pool.query("SELECT id, email, role FROM users WHERE email = 'rodrigo4@gmail.com'");
console.log('User:', JSON.stringify(r1.rows));

if (r1.rows.length > 0) {
  const userId = r1.rows[0].id;
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'resellers'");
  console.log('Resellers columns:', JSON.stringify(cols.rows.map(r => r.column_name)));
  const r2 = await pool.query('SELECT * FROM resellers WHERE user_id = $1', [userId]);
  console.log('Reseller:', JSON.stringify(r2.rows));
}

pool.end();
