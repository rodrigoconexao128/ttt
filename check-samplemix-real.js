
import pg from 'pg';
const { Pool } = pg;

const connectionString = "postgresql://postgres.bnfpcuzjvycudccycqqt:h8r6MFBWjL5XTms7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

const pool = new Pool({
  connectionString,
});

async function main() {
  try {
    console.log("Connecting to DB...");
    const client = await pool.connect();
    
    try {
      console.log("Searching for user like 'Samplemix%' or 'samplemix%'...");
      const userRes = await client.query("SELECT id, email FROM users WHERE email ILIKE $1", ['%samplemix%']);
      
      if (userRes.rows.length === 0) {
        console.log("❌ No matching user found!");
        console.log("Listing top 10 users to check format...");
        const allUsers = await client.query("SELECT id, email FROM users LIMIT 10");
        console.table(allUsers.rows);
        return;
      }
      
      const user = userRes.rows[0];
      console.log(`✅ User Found: ${user.email} (ID: ${user.id})`);
      
      console.log("Fetching ai_agent_config...");
      const configRes = await client.query("SELECT prompt FROM ai_agent_config WHERE user_id = $1", [user.id]);
      
      if (configRes.rows.length === 0) {
        console.log("❌ No AI Config found for this user!");
      } else {
        const prompt = configRes.rows[0].prompt;
        console.log("\n═══════════════════════════════════════════════════════════");
        console.log("📝 CURRENT PROMPT IN DATABASE:");
        console.log("═══════════════════════════════════════════════════════════\n");
        console.log(prompt);
        console.log("\n═══════════════════════════════════════════════════════════\n");
      }

    } finally {
      client.release();
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

main();
