import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const TARGET_EMAIL = 'rodrigo4@gmail.com';
const REQUIRED_GREETING = 'Boa tarde, Tudo bem? Rodrigo da AgenteZap aqui. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?';

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada.');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      `select u.id, u.email, a.prompt
       from users u
       join ai_agent_config a on a.user_id = u.id
       where lower(u.email) = lower($1)
       limit 1`,
      [TARGET_EMAIL]
    );

    if (userRes.rows.length === 0) {
      throw new Error(`Usuário não encontrado: ${TARGET_EMAIL}`);
    }

    const { id: userId, prompt: currentPrompt } = userRes.rows[0];

    let nextPrompt = currentPrompt || '';

    const block = `\n## SAUDAÇÃO INICIAL OBRIGATÓRIA\n\nQuando o cliente iniciar conversa com interesse no plano (ex.: \"Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.\"), a primeira resposta deve ser **exatamente**:\n\"${REQUIRED_GREETING}\"\n\nRegra: não parafrasear, não alterar pontuação e não trocar palavras nessa primeira saudação.\n`;

    if (!nextPrompt.includes(REQUIRED_GREETING)) {
      if (/##\s*SAUDAÇÃO INICIAL OBRIGATÓRIA/i.test(nextPrompt)) {
        // seção existe, mas sem frase exata: adiciona no topo para garantir prioridade
        nextPrompt = `${block}\n${nextPrompt}`;
      } else {
        nextPrompt = `${block}\n${nextPrompt}`;
      }
    }

    await client.query(
      `update ai_agent_config
       set prompt = $1, updated_at = now()
       where user_id = $2`,
      [nextPrompt, userId]
    );

    await client.query('COMMIT');

    console.log('✅ Prompt rodrigo atualizado com saudação exata');
    console.log(`👤 Cliente: ${TARGET_EMAIL}`);
    console.log(`🧾 user_id: ${userId}`);
    console.log(`📝 chars_antigo: ${(currentPrompt || '').length}`);
    console.log(`📝 chars_novo: ${nextPrompt.length}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('❌ Falha:', error.message);
  process.exit(1);
});
