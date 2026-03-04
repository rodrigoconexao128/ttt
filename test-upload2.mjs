import process from "process";
import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Test upload with valid MIME type
const testContent = Buffer.from("test content simulating image data");
const fileName = `receipts/test_reseller_${Date.now()}.jpg`;

console.log("Testing upload with image/jpeg...");
const { data: uploadData, error: uploadError } = await supabase.storage
  .from("payment-receipts")
  .upload(fileName, testContent, {
    contentType: "image/jpeg",
    upsert: false
  });

console.log("Upload result:", JSON.stringify({ uploadData, uploadError }, null, 2));

if (!uploadError) {
  const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
  console.log("Public URL:", urlData?.publicUrl);
  
  // Test insert into payment_receipts
  const pg = await import("pg");
  const { Pool } = pg.default;
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  
  const testUserId = "test-user-123"; // fake
  try {
    const result = await pool.query(`
      INSERT INTO payment_receipts (user_id, subscription_id, plan_id, amount, receipt_url, status, mp_payment_id, admin_notes)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING id
    `, ["test-user-123", null, null, 49.99, urlData?.publicUrl, "pending", "test-payment", "Comprovante de revendedor - Reseller ID: test-123"]);
    console.log("DB Insert result:", result.rows);
  } catch(e) {
    console.log("DB Insert error:", e.message);
  }
  
  await pool.end();
  
  // Clean up storage
  await supabase.storage.from("payment-receipts").remove([fileName]);
  console.log("Cleaned up test file");
}
