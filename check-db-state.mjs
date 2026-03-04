import pg from 'pg';

const DB_URL = 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = new pg.Client({ connectionString: DB_URL });

async function main() {
  await client.connect();
  console.log('✅ Conectado');

  // How many rows
  const r1 = await client.query(
    'SELECT id, user_id, length(prompt) as len, updated_at FROM ai_agent_config WHERE user_id = $1',
    [USER_ID]
  );
  console.log('Linhas encontradas:', r1.rowCount);
  r1.rows.forEach(row => console.log('  →', JSON.stringify(row)));

  // First 500 chars of prompt
  if (r1.rows.length > 0) {
    const r2 = await client.query(
      'SELECT left(prompt, 500) as inicio, length(prompt) as len FROM ai_agent_config WHERE user_id = $1',
      [USER_ID]
    );
    console.log('\nIníco do prompt no banco:');
    console.log(r2.rows[0].inicio);
    console.log('\nTotal chars:', r2.rows[0].len);
  }

  // Check if R$99 appears
  const r3 = await client.query(
    "SELECT position('R$99' IN prompt) as pos_99, position('R$49' IN prompt) as pos_49, position('Rodrigo da AgenteZap' IN prompt) as saudacao FROM ai_agent_config WHERE user_id = $1",
    [USER_ID]
  );
  console.log('\nPosição R$99:', r3.rows[0].pos_99, '(0 = não encontrado)');
  console.log('Posição R$49:', r3.rows[0].pos_49, '(0 = não encontrado)');
  console.log('Posição saudação:', r3.rows[0].saudacao, '(0 = não encontrado)');

  await client.end();
}

main().catch(err => {
  console.error('Erro:', err.message);
  process.exit(1);
});
