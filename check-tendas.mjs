import pg from 'pg';
const c = new pg.Client({connectionString:'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'});
await c.connect();
const r = await c.query(`
  SELECT 
    u.email,
    bac.is_active as business_active,
    ai.is_active as ai_active,
    cc.is_active as chatbot_active
  FROM auth.users u
  LEFT JOIN business_agent_configs bac ON bac.user_id = u.id::text
  LEFT JOIN ai_agent_config ai ON ai.user_id = u.id::text
  LEFT JOIN chatbot_configs cc ON cc.user_id = u.id::text
  WHERE u.email = 'contato@toldoseldorado.com.br'
`);
console.log('TENDAS ELDORADO status:');
console.log(JSON.stringify(r.rows[0], null, 2));
await c.end();
