import pg from 'pg';

const { Pool } = pg;

async function main() {
  if (!process.env.DATABASE_URL) {
    console.log('DATABASE_URL ausente');
    return;
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    const res = await client.query(
      `select u.email, a.prompt
       from users u
       join ai_agent_config a on a.user_id = u.id
       where lower(u.email) = lower($1)
       limit 1`,
      ['rodrigo4@gmail.com']
    );

    if (res.rows.length === 0) {
      console.log('rodrigo4 não encontrado');
      return;
    }

    const prompt = res.rows[0].prompt || '';
    console.log('prompt chars:', prompt.length);
    console.log('tem "responder exatamente"?', /responder\s+\*\*exatamente\*\*/i.test(prompt) || /responder\s+exatamente/i.test(prompt));
    console.log('tem "primeira mensagem"?', /primeira mensagem/i.test(prompt));
    console.log('preview:', JSON.stringify(prompt.slice(0, 300)));
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('erro:', e.message);
  process.exit(1);
});
