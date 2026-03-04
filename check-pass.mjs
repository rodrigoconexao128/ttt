import pg from 'pg';
const c = new pg.Client({connectionString:'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres'});
await c.connect();

// Buscar senhas originais das contas (raw_user_meta_data pode ter)
const r = await c.query(`
  SELECT 
    email,
    raw_user_meta_data->>'temp_password' as temp_pass
  FROM auth.users 
  WHERE email IN ('bigacaicuiaba@gmail.com', 'contato@ceararentacar.com.br')
`);
console.log('Passwords:', JSON.stringify(r.rows, null, 2));
await c.end();
