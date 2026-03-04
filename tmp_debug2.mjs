import { db } from './server/db.js';
import { followupLogs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

// Exactly like stats endpoint
const allLogs = await db.query.followupLogs.findMany({
  orderBy: [desc(followupLogs.executedAt)],
  limit: 10000,
});
console.log('Total logs:', allLogs.length);
console.log('Sample row:', JSON.stringify(allLogs[0]));
const totalSent = allLogs.filter(l => l.status === 'sent').length;
const totalFailed = allLogs.filter(l => l.status === 'failed').length;
console.log('Sent:', totalSent, 'Failed:', totalFailed);
process.exit(0);
