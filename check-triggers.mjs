import pg from 'pg';

const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';

const client = new pg.Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('✅ Conectado DIRETO\n');

  // Check triggers on ai_agent_config
  const triggers = await client.query(`
    SELECT trigger_name, event_manipulation, action_timing, action_statement
    FROM information_schema.triggers
    WHERE event_object_table = 'ai_agent_config'
    ORDER BY trigger_name
  `);
  console.log('=== TRIGGERS em ai_agent_config:', triggers.rowCount, '===');
  triggers.rows.forEach(t => console.log(JSON.stringify(t)));

  // Check RLS policies
  const rls = await client.query(`
    SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
    FROM pg_policies
    WHERE tablename = 'ai_agent_config'
  `);
  console.log('\n=== RLS POLICIES em ai_agent_config:', rls.rowCount, '===');
  rls.rows.forEach(p => console.log(JSON.stringify(p)));

  // Check table structure
  const cols = await client.query(`
    SELECT column_name, data_type, column_default
    FROM information_schema.columns
    WHERE table_name = 'ai_agent_config'
    ORDER BY ordinal_position
  `);
  console.log('\n=== COLUNAS de ai_agent_config ===');
  cols.rows.forEach(c => console.log(JSON.stringify(c)));

  await client.end();
}

main().catch(err => { console.error(err.message); process.exit(1); });
