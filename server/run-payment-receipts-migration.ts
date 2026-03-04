import 'dotenv/config';
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runMigration() {
  try {
    console.log("🔄 Running payment_receipts migration...");
    
    const migrationFile = path.join(process.cwd(), "migrations", "0073_create_payment_receipts_table.sql");
    const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
    
    // Split by semicolon and execute each statement
    const statements = migrationSQL
      .split(";")
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      console.log(`Executing: ${statement.substring(0, 100)}...`);
      await db.execute(sql.raw(statement));
    }
    
    console.log("✅ Payment receipts migration completed successfully!");
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  }
}

runMigration();
