import 'dotenv/config';
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runQrcodesMigration() {
  try {
    console.log("🔄 Running QR Code Inteligente migration...");
    
    const migrationFile = path.join(process.cwd(), "server", "migrations", "create_smart_qrcodes.sql");
    const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
    
    // Split by semicolon and execute each statement
    // Remove comment lines before splitting
    const cleanedSQL = migrationSQL
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('--'))
      .join('\n');

    const statements = cleanedSQL
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`  Executing: ${statement.substring(0, 60)}...`);
        await db.execute(sql.raw(statement));
      }
    }
    
    console.log("✅ QR Code migration completed successfully!");
    console.log("   Tables created: smart_qrcodes, qrcode_scan_logs");
  } catch (error) {
    console.error("❌ Error running QR Code migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runQrcodesMigration();
