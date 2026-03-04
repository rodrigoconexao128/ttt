import pg from 'pg';
const c = new pg.Client({connectionString:'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'});
await c.connect();

const r = await c.query(`
  SELECT 
    u.email,
    LEFT(a.prompt, 300) as prompt_preview
  FROM auth.users u
  JOIN ai_agent_config a ON a.user_id = u.id::text
  WHERE u.email = 'fabrizioamfa@gmail.com'
`);
console.log('Prompt do Fabrizio:\n');
console.log(r.rows[0]?.prompt_preview);
await c.end();
