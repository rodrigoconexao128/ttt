import { Pool } from 'pg';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

// Check unique constraint on sector_members
const r = await pool.query(`
  SELECT constraint_name, constraint_type 
  FROM information_schema.table_constraints 
  WHERE table_name = 'sector_members' AND constraint_type IN ('UNIQUE', 'PRIMARY KEY')
`);
console.log('sector_members constraints:', JSON.stringify(r.rows));

// Check sector_members schema
const cols = await pool.query(`
  SELECT column_name, data_type, column_default
  FROM information_schema.columns 
  WHERE table_name = 'sector_members' 
  ORDER BY ordinal_position
`);
console.log('sector_members cols:', JSON.stringify(cols.rows));

// Check if owner_id is required for uniqueness
// ON CONFLICT (sector_id, member_id) must exist
const idx = await pool.query(`
  SELECT indexname, indexdef 
  FROM pg_indexes 
  WHERE tablename = 'sector_members'
`);
console.log('sector_members indexes:', JSON.stringify(idx.rows));

await pool.end();
