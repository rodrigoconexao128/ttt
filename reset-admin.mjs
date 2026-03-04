import bcrypt from 'bcryptjs';
import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
    connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres'
});

const hash = await bcrypt.hash('Ibira2019!', 10);
const result = await pool.query('UPDATE admins SET password_hash = $1 WHERE email = $2 RETURNING id, email, role', [hash, 'rodrigoconexao128@gmail.com']);
console.log('Updated:', result.rows);

// Also check what MP token is configured
const configs = await pool.query("SELECT chave, valor FROM system_config WHERE chave IN ('mercadopago_access_token', 'mercadopago_pix_key', 'mp_pix_key')");
console.log('MP Configs:', configs.rows);

await pool.end();
