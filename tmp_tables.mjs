import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

// Check which tables exist with followup name
const result = await db.execute(sql`SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE '%followup%'`);
console.log('Followup tables:', JSON.stringify(result.rows, null, 2));
process.exit(0);
