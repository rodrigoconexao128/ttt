import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

await client.connect();

// Check all users tables and their schema
const usersAll = await client.query(`
  SELECT table_schema, table_name, column_name, data_type, udt_name 
  FROM information_schema.columns 
  WHERE table_name = 'users' AND column_name = 'id'
  ORDER BY table_schema
`);
console.log('All users.id columns:', JSON.stringify(usersAll.rows, null, 2));

// Check search_path
const sp = await client.query(`SHOW search_path`);
console.log('search_path:', sp.rows);

await client.end();
