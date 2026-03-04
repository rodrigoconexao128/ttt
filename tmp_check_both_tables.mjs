import { db } from './server/db.js';
import { sql } from 'drizzle-orm';

const r1 = await db.execute(sql`SELECT status, COUNT(*) FROM followup_logs GROUP BY status`);
console.log('followup_logs:', JSON.stringify(r1.rows));

const r2 = await db.execute(sql`SELECT status, COUNT(*) FROM user_followup_logs GROUP BY status`);
console.log('user_followup_logs:', JSON.stringify(r2.rows));
process.exit(0);
