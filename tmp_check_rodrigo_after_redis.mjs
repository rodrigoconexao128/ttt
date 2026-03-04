import pg from 'pg';

const { Client } = pg;

async function main() {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const email = 'rodrigo4@gmail.com';
  const userRes = await client.query(
    `SELECT id, email, "isActive" as is_active, "createdAt" as created_at
     FROM users
     WHERE lower(email) = lower($1)
     LIMIT 1`,
    [email],
  );

  if (userRes.rowCount === 0) {
    console.log(JSON.stringify({ email, found: false }, null, 2));
    await client.end();
    return;
  }

  const user = userRes.rows[0];
  const userId = user.id;

  const [pendingRes, messageRes, connectionRes, overdueListRes, convRes] = await Promise.all([
    client.query(
      `SELECT
         COUNT(*)::int AS pending_total,
         COUNT(*) FILTER (WHERE p.execute_at < NOW() - INTERVAL '5 minutes')::int AS pending_overdue_5m,
         COUNT(*) FILTER (WHERE p.execute_at < NOW() - INTERVAL '30 minutes')::int AS pending_overdue_30m
       FROM pending_ai_responses p
       JOIN conversations c ON c.id = p.conversation_id
       WHERE c.user_id = $1
         AND p.status = 'pending'`,
      [userId],
    ),
    client.query(
      `SELECT
         COUNT(*) FILTER (WHERE m.from_me = true AND m.is_from_agent = true)::int AS agent_sent_30m,
         COUNT(*) FILTER (WHERE m.from_me = false)::int AS incoming_30m,
         MAX(m.timestamp) FILTER (WHERE m.from_me = false) AS last_incoming_at,
         MAX(m.timestamp) FILTER (WHERE m.from_me = true AND m.is_from_agent = true) AS last_agent_at
       FROM messages m
       JOIN conversations c ON c.id = m.conversation_id
       WHERE c.user_id = $1
         AND m.timestamp > NOW() - INTERVAL '30 minutes'`,
      [userId],
    ),
    client.query(
      `SELECT id, is_connected, is_primary, ai_enabled, phone_number, updated_at
       FROM whatsapp_connections
       WHERE user_id = $1
       ORDER BY updated_at DESC
       LIMIT 10`,
      [userId],
    ),
    client.query(
      `SELECT p.conversation_id, p.execute_at, p.created_at, p.retry_count, p.last_error
       FROM pending_ai_responses p
       JOIN conversations c ON c.id = p.conversation_id
       WHERE c.user_id = $1
         AND p.status = 'pending'
         AND p.execute_at < NOW() - INTERVAL '5 minutes'
       ORDER BY p.execute_at ASC
       LIMIT 10`,
      [userId],
    ),
    client.query(
      `SELECT
         c.id,
         c.contact_number,
         c.last_message_time,
         c.last_message_from_me,
         c.has_replied,
         c.updated_at
       FROM conversations c
       WHERE c.user_id = $1
       ORDER BY c.last_message_time DESC NULLS LAST
       LIMIT 10`,
      [userId],
    ),
  ]);

  console.log(
    JSON.stringify(
      {
        user,
        pending: pendingRes.rows[0],
        recentMessages: messageRes.rows[0],
        connections: connectionRes.rows,
        overduePendingSamples: overdueListRes.rows,
        latestConversations: convRes.rows,
      },
      null,
      2,
    ),
  );

  await client.end();
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
