import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';
const client = await pool.connect();
try {
  // Check user_id col type in whatsapp_connections
  const t = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name='whatsapp_connections' AND column_name='user_id'`);
  console.log('user_id type in whatsapp_connections:', t.rows[0]?.data_type);

  const t2 = await client.query(`SELECT data_type FROM information_schema.columns WHERE table_name='conversations' AND column_name='connection_id'`);
  console.log('connection_id type in conversations:', t2.rows[0]?.data_type);

  // Try query with cast
  const r = await client.query(`SELECT id FROM whatsapp_connections WHERE user_id::text = $1`, [USER_ID]);
  console.log('Connections found:', r.rows.length);
  r.rows.forEach(row => console.log(' conn id:', row.id, typeof row.id));
} catch(e) {
  console.error('Error:', e.message);
} finally {
  client.release();
  await pool.end();
}
