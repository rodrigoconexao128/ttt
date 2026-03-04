import process from "process";
import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Test upload
const testContent = Buffer.from("test receipt content");
const fileName = `receipts/test_${Date.now()}.txt`;

console.log("Testing upload to payment-receipts bucket...");
const { data: uploadData, error: uploadError } = await supabase.storage
  .from("payment-receipts")
  .upload(fileName, testContent, {
    contentType: "text/plain",
    upsert: false
  });

console.log("Upload result:", JSON.stringify({ uploadData, uploadError }, null, 2));

if (!uploadError) {
  const { data: urlData } = supabase.storage.from("payment-receipts").getPublicUrl(fileName);
  console.log("Public URL:", urlData?.publicUrl);
  
  // Clean up
  await supabase.storage.from("payment-receipts").remove([fileName]);
  console.log("Cleaned up test file");
}
