import process from "process";
import { config } from "dotenv";
config();
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Check reseller details
const reseller = await pool.query("SELECT * FROM resellers WHERE user_id = $1", ["cb9213c3-fde3-479e-a4aa-344171c59735"]);
console.log("Reseller:", JSON.stringify(reseller.rows[0], null, 2));

// Check reseller clients  
const clients = await pool.query("SELECT rc.*, u.email, u.name FROM reseller_clients rc LEFT JOIN users u ON rc.user_id = u.id WHERE rc.reseller_id = $1 ORDER BY rc.created_at DESC LIMIT 5", ["022e9e72-265f-473c-8bf4-d4658051b5ee"]);
console.log("Reseller Clients:", JSON.stringify(clients.rows, null, 2));

// Check pending payments for reseller
const payments = await pool.query("SELECT id, status, amount, payment_method, status_detail FROM reseller_payments WHERE reseller_id = $1 ORDER BY created_at DESC LIMIT 5", ["022e9e72-265f-473c-8bf4-d4658051b5ee"]);
console.log("Reseller Payments:", JSON.stringify(payments.rows.map(p => ({...p, status_detail: p.status_detail ? p.status_detail.substring(0, 100) : null})), null, 2));

// Check payment_receipts for this user
const receipts = await pool.query("SELECT id, status, amount, admin_notes, mp_payment_id, receipt_url FROM payment_receipts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5", ["cb9213c3-fde3-479e-a4aa-344171c59735"]);
console.log("Payment Receipts:", JSON.stringify(receipts.rows, null, 2));

await pool.end();
