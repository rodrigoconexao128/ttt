require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
(async () => {
  const id = '242ec16b-9a81-4794-9dbd-3687dd1bed20';
  const conv = await pool.query("select id, admin_id, contact_name, contact_number, user_id, created_at, updated_at, last_message_text, is_agent_enabled from admin_conversations where id = '242ec16b-9a81-4794-9dbd-3687dd1bed20'");
  console.log('CONV', JSON.stringify(conv.rows, null, 2));
  const msgs = await pool.query("select id, is_from_agent, message_type, media_type, text, timestamp from admin_messages where conversation_id = '242ec16b-9a81-4794-9dbd-3687dd1bed20' order by timestamp asc limit 30");
  console.log('MSGS', JSON.stringify(msgs.rows, null, 2));
  await pool.end();
})().catch(async (err) => {
  console.error(err);
  process.exit(1);
});
