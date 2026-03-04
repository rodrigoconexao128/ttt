
import { db, pool } from './db';
import { users, resellerProfiles } from '@shared/schema';
import { eq } from 'drizzle-orm';

(async () => {
  try {
    const resellers = await db.select({
      id: users.id,
      email: users.email,
      planType: users.planType
    })
    .from(users)
    .where(eq(users.planType, 'revenda'));
    
    console.log('Usuarios com plano revenda:', resellers.length);
    resellers.slice(0,10).forEach(r => console.log(r.email));
    
    await pool.end();
  } catch(e) {
    console.error(e);
    await pool.end();
  }
})();

