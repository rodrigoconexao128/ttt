const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
async function main() {
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('sectors','sector_members','routing_logs','ticket_closure_logs','bulk_actions_log','scheduled_messages','conversations') ORDER BY table_name");
  console.log(JSON.stringify(r.rows.map(x=>x.table_name)));
  
  // Also check conversations columns
  const cols = await pool.query("SELECT column_name FROM information_schema.columns WHERE table_name='conversations' AND column_name IN ('sector_id','assigned_to_member_id','routing_at','routing_intent','routing_confidence','is_closed','closed_at','closed_by','closure_reason') ORDER BY column_name");
  console.log('conversations cols:', JSON.stringify(cols.rows.map(x=>x.column_name)));
  
  await pool.end();
}
main().catch(e=>console.error(e.message));
