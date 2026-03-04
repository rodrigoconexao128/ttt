const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='conversations' ORDER BY ordinal_position").then(r => {
  console.log('ALL conversations columns:');
  r.rows.forEach(row => console.log(row.column_name));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='reseller_clients' ORDER BY ordinal_position");
}).then(r => {
  console.log('\nreseller_clients columns:');
  r.rows.forEach(row => console.log(row.column_name));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='resellers' ORDER BY ordinal_position");
}).then(r => {
  console.log('\nresellers columns:');
  r.rows.forEach(row => console.log(row.column_name));
  pool.end();
}).catch(e => { console.error('ERROR:', e.message); pool.end(); });
