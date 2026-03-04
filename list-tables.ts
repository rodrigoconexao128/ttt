import { pool } from './server/db';

async function main() {
  const res = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name");
  console.log('Tabelas:');
  res.rows.forEach((r: any) => console.log(r.table_name));
  process.exit(0);
}

main().catch(console.error);
