import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;
const TARGET_EMAIL = 'rodrigo4@gmail.com';
const PHRASE = 'Boa tarde, Tudo bem? Rodrigo da AgenteZap aqui. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const res = await client.query(
      `select a.prompt
       from users u
       join ai_agent_config a on a.user_id = u.id
       where lower(u.email) = lower($1)
       limit 1`,
      [TARGET_EMAIL]
    );
    const prompt = res.rows[0]?.prompt || '';
    const idx = prompt.indexOf(PHRASE);
    console.log('contains exact:', idx >= 0);
    console.log('idx:', idx);
    if (idx >= 0) {
      console.log('near:', JSON.stringify(prompt.slice(Math.max(0, idx - 120), idx + PHRASE.length + 120)));
    }
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error('erro:', e.message);
  process.exit(1);
});
