import { pool } from './server/db';

async function main() {
  const res = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name = 'users' ORDER BY ordinal_position");
  console.log('Colunas da tabela users:');
  console.log(res.rows.map((r: any) => r.column_name).join(', '));
  process.exit(0);
}

main().catch(console.error);
