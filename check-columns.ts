import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const result = await pool.query(`
    SELECT column_name 
    FROM information_schema.columns 
    WHERE table_name = 'prompt_versions'
  `);
  console.log('Colunas:', result.rows.map(x => x.column_name));
  await pool.end();
}

main();
