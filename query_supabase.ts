
import { Pool } from 'pg';

const connectionString = "postgresql://postgres.bnfpcuzjvycudccycqqt:h8r6MFBWjL5XTms7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres";

const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false } // Required for some Supabase connections
});

async function run() {
  try {
    console.log("Connecting...");
    const userRes = await pool.query("SELECT id, email FROM users WHERE email = 'rodrigo4@gmail.com'");
    console.log("User:", userRes.rows[0]);

    if (userRes.rows[0]) {
      const userId = userRes.rows[0].id;

      // Check Business Agent Config
      const configRes = await pool.query("SELECT * FROM business_agent_configs WHERE user_id = $1", [userId]);
      console.log("Agent Config:", configRes.rows[0]);
      
      // Check Prompt Versions (Custom Prompts)
      const promptRes = await pool.query("SELECT id, prompt_content, is_active FROM prompt_versions WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC LIMIT 1", [userId]);
      console.log("Active Custom Prompt:", promptRes.rows[0]);
    }
  } catch (err) {
    console.error("Error:", err);
  } finally {
    await pool.end();
  }
}

run();
