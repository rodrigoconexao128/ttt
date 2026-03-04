import pg from 'pg';

const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';
const EMAIL = 'rodrigo4@gmail.com';

const client = new pg.Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();

  const userRes = await client.query(
    `SELECT id, email, is_active
     FROM users
     WHERE lower(email)=lower($1)
     LIMIT 1`,
    [EMAIL],
  );

  if (!userRes.rowCount) {
    console.log(JSON.stringify({ found: false, email: EMAIL }, null, 2));
    await client.end();
    return;
  }

  const user = userRes.rows[0];
  const userId = user.id;

  const pendingRes = await client.query(
    `SELECT
       COUNT(*)::int as pending_total,
       COUNT(*) FILTER (WHERE p.execute_at < now() - interval '5 min')::int as overdue_5m,
       COUNT(*) FILTER (WHERE p.execute_at < now() - interval '30 min')::int as overdue_30m
     FROM pending_ai_responses p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE c.user_id = $1
       AND p.status='pending'`,
    [userId],
  );

  const msgRes = await client.query(
    `SELECT
       COUNT(*) FILTER (WHERE m.from_me=true AND m.is_from_agent=true)::int as agent_sent_30m,
       COUNT(*) FILTER (WHERE m.from_me=false)::int as incoming_30m,
       MAX(m.timestamp) FILTER (WHERE m.from_me=false) as last_incoming,
       MAX(m.timestamp) FILTER (WHERE m.from_me=true AND m.is_from_agent=true) as last_agent
     FROM messages m
     JOIN conversations c ON c.id = m.conversation_id
     WHERE c.user_id = $1
       AND m.timestamp > now() - interval '30 min'`,
    [userId],
  );

  const connRes = await client.query(
    `SELECT id, is_connected, is_primary, ai_enabled, updated_at, phone_number
     FROM whatsapp_connections
     WHERE user_id = $1
     ORDER BY updated_at DESC
     LIMIT 5`,
    [userId],
  );

  const overdueSample = await client.query(
    `SELECT p.conversation_id, p.execute_at, p.retry_count, p.last_error
     FROM pending_ai_responses p
     JOIN conversations c ON c.id = p.conversation_id
     WHERE c.user_id = $1
       AND p.status='pending'
       AND p.execute_at < now() - interval '5 min'
     ORDER BY p.execute_at ASC
     LIMIT 5`,
    [userId],
  );

  console.log(JSON.stringify({
    user,
    pending: pendingRes.rows[0],
    recentMessages: msgRes.rows[0],
    connections: connRes.rows,
    overdueSamples: overdueSample.rows,
  }, null, 2));

  await client.end();
}

main().catch(async (err) => {
  console.error(err);
  try { await client.end(); } catch {}
  process.exit(1);
});
