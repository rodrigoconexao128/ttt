import { db } from './server/db.js';
import { followupLogs } from './shared/schema.js';
import { desc } from 'drizzle-orm';

// Exactly how stats endpoint queries - check if status field has correct type
const allLogs = await db.query.followupLogs.findMany({
  orderBy: [desc(followupLogs.executedAt)],
  limit: 10000,
});
console.log('Total:', allLogs.length);
const totalSent = allLogs.filter(l => l.status === 'sent').length;
const totalFailed = allLogs.filter(l => l.status === 'failed').length;
const totalCancelled = allLogs.filter(l => l.status === 'cancelled').length;
const totalSkipped = allLogs.filter(l => l.status === 'skipped').length;
console.log('Sent:', totalSent);
console.log('Failed:', totalFailed);
console.log('Cancelled:', totalCancelled);
console.log('Skipped:', totalSkipped);

// Check all unique statuses
const statuses = [...new Set(allLogs.map(l => l.status))];
console.log('Unique statuses:', statuses);
process.exit(0);
