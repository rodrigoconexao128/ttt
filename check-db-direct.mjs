import pg from 'pg';

// Direct URL
const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = new pg.Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('✅ Conectado DIRETO');

  // Read all rows matching
  const r1 = await client.query(
    'SELECT id, user_id, length(prompt) as len, updated_at FROM ai_agent_config WHERE user_id = $1 ORDER BY updated_at DESC',
    [USER_ID]
  );
  console.log('Linhas encontradas:', r1.rowCount);
  r1.rows.forEach(row => console.log('  →', JSON.stringify(row)));

  // Show first 400 chars of each row
  for (const row of r1.rows) {
    const r2 = await client.query(
      'SELECT left(prompt, 400) as inicio FROM ai_agent_config WHERE id = $1',
      [row.id]
    );
    console.log(`\nRow ${row.id}:`);
    console.log(r2.rows[0].inicio);
  }

  await client.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
