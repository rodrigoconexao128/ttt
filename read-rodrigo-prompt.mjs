import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});
const uid = 'cb9213c3-fde3-479e-a4aa-344171c59735';
try {
  // First list tables to understand schema
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('=== TABELAS ===');
  tables.rows.forEach(r => console.log(' -', r.table_name));

  // Try ai_agent_config
  try {
    const a = await pool.query('SELECT id, user_id, prompt FROM ai_agent_config WHERE user_id=$1', [uid]);
    if (a.rows.length > 0) {
      console.log('\n=== PROMPT ATUAL (ai_agent_config) ===');
      console.log(a.rows[0].prompt);
    } else {
      console.log('\nSem registro em ai_agent_config para este user_id');
    }
  } catch(e) {
    console.log('ai_agent_config erro:', e.message);
  }

  // Try agents
  try {
    const a = await pool.query('SELECT * FROM agents WHERE user_id=$1', [uid]);
    if (a.rows.length > 0) {
      console.log('\n=== agents table ===');
      console.log(JSON.stringify(a.rows[0], null, 2));
    } else {
      console.log('\nSem registro em agents para este user_id');
    }
  } catch(e) {
    console.log('agents erro:', e.message);
  }
} catch(e) {
  console.error('Erro geral:', e.message);
} finally {
  await pool.end();
}
