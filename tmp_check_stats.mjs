import { db } from './server/db.js';
import { followupLogs } from './shared/schema.js';
import { sql } from 'drizzle-orm';

// Check actual query like the stats endpoint does
const allLogs = await db.query.followupLogs.findMany({ limit: 10000 });
console.log('Total logs from query:', allLogs.length);
const totalSent = allLogs.filter(l => l.status === 'sent').length;
const totalFailed = allLogs.filter(l => l.status === 'failed').length;
const totalCancelled = allLogs.filter(l => l.status === 'cancelled').length;
console.log('Sent:', totalSent, 'Failed:', totalFailed, 'Cancelled:', totalCancelled);

// Show sample status values
const sample = allLogs.slice(0, 5).map(l => ({ id: l.id, status: l.status }));
console.log('Sample:', JSON.stringify(sample));
process.exit(0);
