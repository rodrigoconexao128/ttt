import process from "process";
import { config } from "dotenv";
config();
import pkg from "pg";
const { Pool } = pkg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const result = await pool.query("SELECT chave, valor FROM system_config WHERE chave IN ($1, $2, $3, $4, $5) ORDER BY chave", ["pix_manual_enabled", "pix_key", "merchant_name", "mercadopago_access_token", "pix_manual_key"]);
console.log("System config:", JSON.stringify(result.rows, null, 2));
await pool.end();
