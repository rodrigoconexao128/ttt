const { Pool } = require('pg');
const pool = new Pool({ connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres', ssl: { rejectUnauthorized: false } });
Promise.all([
  pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='ticket_closure_logs' ORDER BY ordinal_position"),
  pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='bulk_actions_log' ORDER BY ordinal_position"),
  pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='routing_logs' ORDER BY ordinal_position"),
]).then(([logs, bulk, routing]) => {
  console.log('ticket_closure_logs:', logs.rows.map(r=>r.column_name).join(', '));
  console.log('bulk_actions_log:', bulk.rows.map(r=>r.column_name).join(', '));
  console.log('routing_logs:', routing.rows.map(r=>r.column_name).join(', '));
  pool.end();
}).catch(e => { console.error('ERROR:', e.message); pool.end(); });
