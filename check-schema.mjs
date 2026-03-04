import process from "process";
import { createRequire } from "module";
import { config } from "dotenv";
config();

import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const result = await pool.query("SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name = 'payment_receipts' ORDER BY ordinal_position");
console.log(JSON.stringify(result.rows, null, 2));
await pool.end();
