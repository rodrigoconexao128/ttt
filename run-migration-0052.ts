import 'dotenv/config';
import { db } from "./server/db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runMigration() {
  try {
    console.log("🔄 Running migration: Fix message_id unique constraint...");
    
    const migrationFile = path.join(process.cwd(), "migrations", "0052_fix_message_id_unique_constraint.sql");
    const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith("--"));
    
    for (const statement of statements) {
      console.log(`📝 Executing: ${statement.substring(0, 80)}...`);
      await db.execute(sql.raw(statement));
    }
    
    console.log("✅ Migration completed successfully!");
    console.log("🎉 A constraint UNIQUE incorreta foi removida!");
    console.log("🎉 Agora a IA deve responder normalmente às mensagens!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  }
}

runMigration();
