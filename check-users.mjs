import process from "process";
import { config } from "dotenv";
config();
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const result = await pool.query("SELECT u.id, u.email, u.name, u.role, r.id as reseller_id, r.company_name FROM users u LEFT JOIN resellers r ON r.user_id = u.id WHERE u.email IN ($1, $2)", ["rodrigo4@gmail.com", "rodrigoconexao128@gmail.com"]);
console.log("Users:", JSON.stringify(result.rows, null, 2));

// Check subscription
const subs = await pool.query("SELECT s.id, s.status, s.plan_id, s.user_id, p.nome, p.tipo FROM subscriptions s JOIN plans p ON s.plan_id::int = p.id WHERE s.user_id IN (SELECT id FROM users WHERE email IN ($1, $2)) ORDER BY s.created_at DESC LIMIT 5", ["rodrigo4@gmail.com", "rodrigoconexao128@gmail.com"]);
console.log("Subscriptions:", JSON.stringify(subs.rows, null, 2));

await pool.end();
