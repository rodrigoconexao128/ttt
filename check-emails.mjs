import pg from 'pg';
const c = new pg.Client({connectionString:'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'});
await c.connect();
const r = await c.query(`SELECT email FROM auth.users WHERE email LIKE '%bigacai%' OR email LIKE '%ceara%' LIMIT 3`);
console.log(JSON.stringify(r.rows, null, 2));
await c.end();
