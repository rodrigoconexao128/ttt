import { db } from "./db";
import { sql } from "drizzle-orm";

async function createAgentMediaLibrary() {
  try {
    console.log("🔄 Creating agent_media_library table...");
    
    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS agent_media_library (
        id VARCHAR(255) PRIMARY KEY DEFAULT gen_random_uuid()::text,
        user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name VARCHAR(100) NOT NULL,
        media_type VARCHAR(20) NOT NULL CHECK (media_type IN ('audio', 'image', 'video', 'document')),
        storage_url TEXT NOT NULL,
        file_name VARCHAR(255),
        file_size INTEGER,
        mime_type VARCHAR(100),
        duration_seconds INTEGER,
        description TEXT NOT NULL,
        when_to_use TEXT,
        transcription TEXT,
        is_active BOOLEAN DEFAULT true NOT NULL,
        display_order INTEGER DEFAULT 0,
        wapi_media_id VARCHAR(255),
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      )
    `);
    
    console.log("✅ Table created!");
    
    // Create indexes
    console.log("🔄 Creating indexes...");
    
    await db.execute(sql`
      CREATE INDEX IF NOT EXISTS idx_agent_media_user_id ON agent_media_library(user_id)
    `);
    
    await db.execute(sql`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_media_unique_name ON agent_media_library(user_id, name)
    `);
    
    console.log("✅ Indexes created!");
    console.log("✅ Migration completed successfully!");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Error:", error);
    process.exit(1);
  }
}

createAgentMediaLibrary();
