
import 'dotenv/config';
import { db } from "./server/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runSpecificMigration() {
  try {
    console.log("🔄 Running specific migration...");
    
    const migrationFile = path.join(process.cwd(), "migrations", "0009_add_followup_fields.sql");
    const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
    
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 50)}...`);
      await db.execute(sql.raw(statement));
    }
    
    console.log("✅ Migration 0009 completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  }
}

runSpecificMigration();
