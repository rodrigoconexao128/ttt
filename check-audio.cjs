const { Client } = require('pg');

const client = new Client({
  connectionString: 'postgresql://postgres.cqhgukpmsnsswgzxdmit:R%40quel200472@aws-0-sa-east-1.pooler.supabase.com:6543/postgres'
});

async function check() {
  await client.connect();
  const result = await client.query(`
    SELECT id, text, media_type, from_me, media_url IS NOT NULL as has_media 
    FROM messages 
    WHERE conversation_id = '529e8bad-4a0b-4892-8875-07a68dca9d48'
  `);
  console.log('Messages:', result.rows.length);
  for (const row of result.rows) {
    console.log({
      id: row.id.substring(0, 8),
      text: row.text ? row.text.substring(0, 30) : null,
      media_type: row.media_type,
      from_me: row.from_me,
      has_media: row.has_media
    });
  }
  await client.end();
}
check();
