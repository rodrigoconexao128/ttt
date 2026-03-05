import 'dotenv/config';
import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
const phone = '5517991596944';
const { rows } = await pool.query('select id, email, phone from users where regexp_replace(coalesce(phone,\'\'), \'\\D\', \'\', \'g\') = $1', [phone]);
console.log(JSON.stringify(rows, null, 2));
await pool.end();
