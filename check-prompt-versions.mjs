import pg from 'pg';

const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = new pg.Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('✅ Conectado DIRETO\n');

  // Check schema of prompt_versions
  const cols = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'prompt_versions'
    ORDER BY ordinal_position
  `);
  console.log('=== COLUNAS de prompt_versions ===');
  cols.rows.forEach(c => console.log(JSON.stringify(c)));

  // Check current versions for this user
  const versions = await client.query(`
    SELECT id, user_id, version_number, is_current, length(prompt_content) as len, created_at
    FROM prompt_versions
    WHERE user_id = $1
    ORDER BY version_number DESC
    LIMIT 10
  `, [USER_ID]);
  console.log('\n=== VERSÕES do prompt para rodrigo4 ===');
  console.log('Total:', versions.rowCount);
  versions.rows.forEach(v => console.log(JSON.stringify(v)));

  // Show is_current = true version content start
  const current = versions.rows.find(v => v.is_current);
  if (current) {
    const content = await client.query(`SELECT left(prompt_content, 400) as inicio FROM prompt_versions WHERE id = $1`, [current.id]);
    console.log('\n=== Início da versão CURRENT ===');
    console.log(content.rows[0].inicio);
  }

  await client.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
