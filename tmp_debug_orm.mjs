import { db } from './server/db.js';
import { followupLogs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

const ormQuery = await db.query.followupLogs.findMany({
  orderBy: [desc(followupLogs.executedAt)],
  limit: 10000,
});
console.log('ORM followupLogs count:', ormQuery.length);
const sentCount = ormQuery.filter(l => l.status === 'sent').length;
const failedCount = ormQuery.filter(l => l.status === 'failed').length;
const cancelledCount = ormQuery.filter(l => l.status === 'cancelled').length;
console.log('ORM sent:', sentCount, 'failed:', failedCount, 'cancelled:', cancelledCount);
console.log('Sample row:', JSON.stringify(ormQuery[0]));
process.exit(0);
