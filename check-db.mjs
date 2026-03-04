import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
});

// Check all relevant system configs
const configs = await pool.query("SELECT chave, valor FROM system_config ORDER BY chave");
console.log('All System Configs:');
configs.rows.forEach(r => console.log(`  ${r.chave}: ${r.valor?.substring(0, 80)}`));

// Check reseller_invoices table columns
const cols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reseller_invoices' ORDER BY ordinal_position");
console.log('\nreseller_invoices columns:');
cols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

// Check reseller_payment_receipts
const rcols = await pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'reseller_payment_receipts' ORDER BY ordinal_position");
console.log('\nreseller_payment_receipts columns:');
rcols.rows.forEach(r => console.log(`  ${r.column_name}: ${r.data_type}`));

// Check latest receipts
const receipts = await pool.query("SELECT id, reseller_id, invoice_id, amount, file_url, status, created_at FROM reseller_payment_receipts ORDER BY created_at DESC LIMIT 5");
console.log('\nLatest receipts:', receipts.rows);

await pool.end();
