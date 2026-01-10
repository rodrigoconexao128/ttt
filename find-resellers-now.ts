import { pool } from './server/db';

async function main() {
  const res = await pool.query(`SELECT id, email, "planType" FROM users WHERE "planType" = 'revenda' LIMIT 10`);
  console.log('Usuarios revenda:');
  res.rows.forEach((r: any) => console.log(r.email, r.id));
  process.exit(0);
}

main().catch(console.error);
