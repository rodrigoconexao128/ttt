import { pool } from './server/db';

async function main() {
  const t1 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reseller_clients'");
  console.log('=== RESELLER CLIENTS ===');
  t1.rows.forEach((r: any) => console.log(r.column_name));

  const t2 = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reseller_invoices'");
  console.log('\n=== RESELLER INVOICES ===');
  t2.rows.forEach((r: any) => console.log(r.column_name));
  process.exit(0);
}

main().catch(console.error);
