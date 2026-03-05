import "dotenv/config";
import { Pool } from "pg";

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    console.log("Connecting to database...");
    const client = await pool.connect();
    
    console.log("Running migration: Add share_token column to conversations...");
    
    // Add share_token column
    await client.query(`
      ALTER TABLE conversations 
      ADD COLUMN IF NOT EXISTS share_token VARCHAR(64) UNIQUE;
    `);
    console.log("✅ Column share_token added");
    
    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_conversations_share_token 
      ON conversations(share_token) 
      WHERE share_token IS NOT NULL;
    `);
    console.log("✅ Index created");
    
    client.release();
    console.log("\n🎉 Migration completed successfully!");
    
  } catch (error) {
    console.error("Migration error:", error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
