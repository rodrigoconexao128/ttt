const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', ssl: { rejectUnauthorized: false } });
pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='scheduled_messages' ORDER BY ordinal_position").then(r => {
  console.log('=== scheduled_messages ===');
  r.rows.forEach(row => console.log(row.column_name, '-', row.data_type));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='sectors' ORDER BY ordinal_position");
}).then(r => {
  console.log('\n=== sectors ===');
  r.rows.forEach(row => console.log(row.column_name));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='sector_members' ORDER BY ordinal_position");
}).then(r => {
  console.log('\n=== sector_members ===');
  r.rows.forEach(row => console.log(row.column_name));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='payment_receipts' ORDER BY ordinal_position");
}).then(r => {
  console.log('\n=== payment_receipts ===');
  r.rows.forEach(row => console.log(row.column_name));
  pool.end();
}).catch(e => { console.error('ERROR:', e.message); pool.end(); });
