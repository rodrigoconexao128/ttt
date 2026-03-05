import pg from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

async function runMigrations() {
  console.log("Running migrations...");
  
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });
  
  try {
    // Add applicable_plans to coupons
    await pool.query(`
      ALTER TABLE coupons 
      ADD COLUMN IF NOT EXISTS applicable_plans JSONB DEFAULT NULL
    `);
    console.log("✅ Added applicable_plans to coupons");

    // Add coupon fields to subscriptions
    await pool.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS coupon_code TEXT DEFAULT NULL
    `);
    console.log("✅ Added coupon_code to subscriptions");

    await pool.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS coupon_price DECIMAL(10, 2) DEFAULT NULL
    `);
    console.log("✅ Added coupon_price to subscriptions");

    // Rename PROMO coupons to distinctive names
    const result1 = await pool.query(`
      UPDATE coupons 
      SET code = 'AGENTEZAP29' 
      WHERE code = 'PROMO29'
      RETURNING code
    `);
    if (result1.rowCount && result1.rowCount > 0) {
      console.log("✅ Renamed PROMO29 to AGENTEZAP29");
    } else {
      console.log("⚠️ PROMO29 not found (may already be renamed)");
    }

    const result2 = await pool.query(`
      UPDATE coupons 
      SET code = 'PARCEIRO49'
      WHERE code = 'PROMO49'
      RETURNING code
    `);
    if (result2.rowCount && result2.rowCount > 0) {
      console.log("✅ Renamed PROMO49 to PARCEIRO49");
    } else {
      console.log("⚠️ PROMO49 not found (may already be renamed)");
    }

    // List all coupons
    const coupons = await pool.query(`SELECT code, final_price, is_active FROM coupons`);
    console.log("\n📋 Current coupons:");
    coupons.rows.forEach((c: any) => {
      console.log(`   - ${c.code}: R$ ${c.final_price} (${c.is_active ? 'ativo' : 'inativo'})`);
    });

    console.log("\n✅ All migrations completed successfully!");
  } catch (error) {
    console.error("Migration error:", error);
  } finally {
    await pool.end();
  }
  
  process.exit(0);
}

runMigrations();
