import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const uid = 'cb9213c3-fde3-479e-a4aa-344171c59735';

try {
  // 1. Alterar role de admin para user
  const update = await pool.query(
    "UPDATE users SET role = 'user' WHERE id = $1 RETURNING id, email, name, role",
    [uid]
  );
  console.log('=== ROLE ATUALIZADA ===');
  console.log(JSON.stringify(update.rows[0], null, 2));

  // 2. Verificar se agora aparece como user
  const check = await pool.query(
    "SELECT id, email, name, role FROM users WHERE id = $1",
    [uid]
  );
  console.log('\n=== VERIFICACAO ===');
  console.log(JSON.stringify(check.rows[0], null, 2));

  // 3. Contar quantos users existem (excluindo admin/owner) para confirmar que ele entra na lista
  const count = await pool.query(
    "SELECT COUNT(*) as total FROM users WHERE role = 'user'"
  );
  console.log('\n=== TOTAL USERS (role=user) ===');
  console.log('Total:', count.rows[0].total);

  // 4. Limpar subscriptions duplicadas pending/pending_pix (manter apenas a mais recente)
  const subs = await pool.query(
    "SELECT id, status, plan_id, created_at FROM subscriptions WHERE user_id = $1 ORDER BY created_at DESC",
    [uid]
  );
  console.log('\n=== SUBSCRIPTIONS ATUAIS ===');
  console.log(`Total: ${subs.rows.length}`);
  subs.rows.forEach(s => {
    console.log(`  ${s.id} | ${s.status} | ${s.created_at}`);
  });

} catch(e) {
  console.error('Error:', e.message);
} finally {
  await pool.end();
}
