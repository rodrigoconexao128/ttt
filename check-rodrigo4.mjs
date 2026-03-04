import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const uid = 'cb9213c3-fde3-479e-a4aa-344171c59735';

try {
  const s = await pool.query('SELECT * FROM subscriptions WHERE user_id=$1', [uid]);
  console.log('=== SUBSCRIPTIONS ===');
  console.log(JSON.stringify(s.rows, null, 2));

  const c = await pool.query('SELECT * FROM whatsapp_connections WHERE user_id=$1', [uid]);
  console.log('\n=== WHATSAPP CONNECTIONS ===');
  console.log(JSON.stringify(c.rows, null, 2));

  const a = await pool.query('SELECT id, user_id, business_name, agent_type FROM agent_configs WHERE user_id=$1', [uid]);
  console.log('\n=== AGENT CONFIG ===');
  console.log(JSON.stringify(a.rows, null, 2));
} catch(e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
