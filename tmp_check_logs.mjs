import { db } from './server/db.js';
import { followupLogs } from './shared/schema.js';
import { sql } from 'drizzle-orm';

const result = await db.execute(sql`SELECT status, COUNT(*) as count FROM followup_logs GROUP BY status ORDER BY count DESC`);
console.log(JSON.stringify(result.rows, null, 2));
process.exit(0);

