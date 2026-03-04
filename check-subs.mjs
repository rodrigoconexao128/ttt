import process from "process";
import { config } from "dotenv";
config();
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Check subscription for rodrigo4
const subs = await pool.query(`
  SELECT s.id, s.status, s.plan_id, s.data_inicio, s.data_fim, p.nome, p.tipo, p.valor
  FROM subscriptions s 
  LEFT JOIN plans p ON s.plan_id = p.id::text 
  WHERE s.user_id = $1 
  ORDER BY s.created_at DESC LIMIT 5
`, ["cb9213c3-fde3-479e-a4aa-344171c59735"]);
console.log("Subscriptions for rodrigo4:", JSON.stringify(subs.rows, null, 2));

// Check plans
const plans = await pool.query("SELECT id, nome, tipo, valor, periodicidade FROM plans WHERE tipo = 'revenda' OR nome ILIKE '%revend%' LIMIT 5");
console.log("Revenda plans:", JSON.stringify(plans.rows, null, 2));

await pool.end();
