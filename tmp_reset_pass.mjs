import { db } from './server/db.js';
import { admins } from './shared/schema.js';
import { eq } from 'drizzle-orm';
import bcrypt from 'bcryptjs';

const pass = 'Ibira2019!';
const hash = await bcrypt.hash(pass, 10);

// Update rodrigo4@gmail.com
await db.update(admins).set({ passwordHash: hash }).where(eq(admins.email, 'rodrigo4@gmail.com'));
console.log('Updated rodrigo4@gmail.com password');

// Update rodrigoconexao128@gmail.com
await db.update(admins).set({ passwordHash: hash }).where(eq(admins.email, 'rodrigoconexao128@gmail.com'));
console.log('Updated rodrigoconexao128@gmail.com password');

process.exit(0);
