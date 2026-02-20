import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const sm = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sector_members' ORDER BY ordinal_position`);
console.log('sector_members:', JSON.stringify(sm.rows));

const s = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='sectors' ORDER BY ordinal_position`);
console.log('sectors:', JSON.stringify(s.rows));

const rl = await pool.query(`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='routing_logs' ORDER BY ordinal_position`);
console.log('routing_logs:', JSON.stringify(rl.rows));

const sm2 = await pool.query(`SELECT * FROM sector_members LIMIT 3`);
console.log('sector_members rows sample:', JSON.stringify(sm2.rows));

const s2 = await pool.query(`SELECT * FROM sectors LIMIT 3`);
console.log('sectors rows sample:', JSON.stringify(s2.rows));

await pool.end();
