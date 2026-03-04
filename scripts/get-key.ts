
import dotenv from 'dotenv';
dotenv.config();

if (!process.env.DATABASE_URL) {
    process.env.DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:h8r6MFBWjL5XTms7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";
}

import { resolveApiKey } from '../server/mistralClient';

async function main() {
  try {
    const key = await resolveApiKey();
    console.log("FOUND_KEY:" + key);
  } catch (e) {
    console.error(e);
  }
  process.exit(0);
}

main();
