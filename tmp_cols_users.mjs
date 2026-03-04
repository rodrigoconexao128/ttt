import pg from 'pg';
const client = new pg.Client({ connectionString: 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres', ssl: { rejectUnauthorized: false } });
await client.connect();
const rows = await client.query("SELECT column_name FROM information_schema.columns WHERE table_name='users' ORDER BY ordinal_position");
console.log(rows.rows.map((r) => r.column_name).join('\n'));
await client.end();
