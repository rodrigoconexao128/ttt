import process from "process";
import { config } from "dotenv";
config();

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

console.log("Testing getBucket...");
try {
  const { data, error } = await supabase.storage.getBucket("payment-receipts");
  console.log("getBucket result:", JSON.stringify({ data, error }, null, 2));
} catch(e) {
  console.log("getBucket exception:", e.message);
}

console.log("Testing listBuckets...");
try {
  const { data, error } = await supabase.storage.listBuckets();
  console.log("listBuckets result:", JSON.stringify({ data, error }, null, 2));
} catch(e) {
  console.log("listBuckets exception:", e.message);
}
