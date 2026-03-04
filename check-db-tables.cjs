const { Pool } = require('pg');
const pool = new Pool({ 
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});
pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name").then(r => {
  console.log('=== TABLES ===');
  r.rows.forEach(row => console.log(row.table_name));
  return pool.query("SELECT column_name, data_type FROM information_schema.columns WHERE table_name='conversations' ORDER BY ordinal_position");
}).then(r => {
  console.log('\n=== conversations columns ===');
  r.rows.forEach(row => console.log(row.column_name, '-', row.data_type));
  return pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='subscriptions' ORDER BY ordinal_position");
}).then(r => {
  console.log('\n=== subscriptions columns ===');
  r.rows.forEach(row => console.log(row.column_name));
  pool.end();
}).catch(e => { 
  console.error('ERROR:', e.message); 
  pool.end(); 
});
