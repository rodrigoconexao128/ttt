import 'dotenv/config';
import { db } from "./db";
import { sql } from "drizzle-orm";
import fs from "fs";
import path from "path";

async function runBusinessCategoriesMigration() {
  try {
    console.log("🔄 Running business_categories migration...");
    
    const migrationFile = path.join(process.cwd(), "server", "migrations", "create_business_categories.sql");
    const migrationSQL = fs.readFileSync(migrationFile, "utf-8");
    
    // Remove comment lines and split on semicolons
    const cleanedSQL = migrationSQL
      .split('\n')
      .filter((line: string) => !line.trim().startsWith('--'))
      .join('\n');

    // Execute the whole block at once (it's one INSERT ... VALUES ... ON CONFLICT statement)
    const statements = cleanedSQL
      .split(";")
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0);
    
    for (const statement of statements) {
      if (statement.trim()) {
        console.log(`  Executing: ${statement.substring(0, 70).replace(/\n/g, ' ')}...`);
        await db.execute(sql.raw(statement));
      }
    }
    
    console.log("✅ business_categories migration completed!");
    
    // Verify row count
    const result = await db.execute(sql.raw(`SELECT COUNT(*) as count FROM business_categories`));
    console.log(`   Total categories seeded: ${(result as any).rows[0].count}`);
    
    // Show summary
    const summary = await db.execute(sql.raw(`
      SELECT category_group, COUNT(*) as slugs, SUM(user_count) as total_users
      FROM business_categories
      GROUP BY category_group
      ORDER BY total_users DESC
    `));
    console.log("\n   Category Group Summary:");
    for (const row of (summary as any).rows) {
      console.log(`     ${row.category_group}: ${row.slugs} types, ${row.total_users} users`);
    }
    
  } catch (error) {
    console.error("❌ Error running business_categories migration:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

runBusinessCategoriesMigration();
