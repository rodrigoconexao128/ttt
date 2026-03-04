import 'dotenv/config';
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runTicketMigration() {
  try {
    console.log("🔄 Running ticket system migration...");
    
    const migrationPath = path.join(process.cwd(), "server", "db", "migrations", "20250211_create_ticket_system.sql");
    console.log(`📖 Reading migration file: ${migrationPath}`);
    
    if (!fs.existsSync(migrationPath)) {
        throw new Error(`Migration file not found at ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, "utf-8");
    
    // Split by semicolon, but be careful with functions/DO blocks which use semicolons
    // For this specific file, it's safer to execute the whole block if possible, 
    // or split carefully. The file contains DO blocks ($$) which might break with simple split.
    // However, the `db.execute(sql.raw(statement))` might handle multiple statements if supported by the driver,
    // or we can try to split by ";\n" which is common in manual SQL files.
    
    // Let's try executing the whole file content first if the driver supports it.
    // Postgres usually allows multiple statements in one query string.
    
    await db.execute(sql.raw(migrationSQL));
    
    console.log("✅ Ticket system migration completed successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error running migration:", error);
    process.exit(1);
  }
}

runTicketMigration();
