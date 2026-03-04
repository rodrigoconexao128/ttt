const { Client } = require('pg');

(async () => {
  const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const q = await client.query(`
    WITH last_msg AS (
      SELECT m.*,
             row_number() OVER (PARTITION BY m.conversation_id ORDER BY m.timestamp DESC, m.created_at DESC) AS rn
      FROM messages m
    ),
    candidates AS (
      SELECT
        c.id AS conversation_id,
        c.connection_id,
        wc.user_id,
        c.contact_number,
        lm.message_id,
        lm.text,
        lm.timestamp AS last_ts,
        wc.ai_enabled,
        wc.is_connected,
        EXISTS (
          SELECT 1 FROM pending_ai_responses p
          WHERE p.conversation_id = c.id
            AND p.status IN ('pending','processing')
        ) AS has_pending,
        EXISTS (
          SELECT 1 FROM messages a
          WHERE a.conversation_id = c.id
            AND a.from_me = true
            AND a.timestamp > lm.timestamp
        ) AS has_agent_after,
        EXISTS (
          SELECT 1 FROM messages oi
          WHERE oi.conversation_id = c.id
            AND lower(trim(coalesce(oi.text,''))) = 'oi'
            AND oi.timestamp >= lm.timestamp
        ) AS has_oi_after
      FROM conversations c
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      JOIN last_msg lm ON lm.conversation_id = c.id AND lm.rn = 1
      WHERE lm.from_me = false
        AND lm.text ILIKE '%mensagem incompleta%'
        AND lm.timestamp >= NOW() - INTERVAL '72 hours'
    )
    SELECT *
    FROM candidates
    WHERE has_pending = false
      AND has_agent_after = false
      AND has_oi_after = false
      AND ai_enabled = true
      AND is_connected = true
    ORDER BY last_ts DESC
    LIMIT 500;
  `);

  console.log('CANDIDATES_COUNT', q.rows.length);
  const byUser = q.rows.reduce((acc, r) => {
    acc[r.user_id] = (acc[r.user_id] || 0) + 1;
    return acc;
  }, {});
  console.log('BY_USER', JSON.stringify(byUser, null, 2));
  console.log('TOP20', JSON.stringify(q.rows.slice(0, 20), null, 2));

  const rodrigo = q.rows.filter(r => r.user_id === 'cb9213c3-fde3-479e-a4aa-344171c59735');
  console.log('RODRIGO_COUNT', rodrigo.length);
  if (rodrigo.length) {
    console.log('RODRIGO', JSON.stringify(rodrigo.slice(0, 50), null, 2));
  }

  await client.end();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
