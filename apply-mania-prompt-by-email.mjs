import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

const TARGET_EMAIL = 'maniadelencois@gmail.com';
const PROMPT_FILE = path.resolve('prompt-mania-calibrado-v5.txt');

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL não configurada no ambiente.');
  }

  if (!fs.existsSync(PROMPT_FILE)) {
    throw new Error(`Prompt não encontrado: ${PROMPT_FILE}`);
  }

  const prompt = fs.readFileSync(PROMPT_FILE, 'utf8');
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    const userRes = await client.query(
      'SELECT id, email FROM users WHERE lower(email) = lower($1) LIMIT 1',
      [TARGET_EMAIL]
    );

    if (userRes.rows.length === 0) {
      throw new Error(`Usuário não encontrado: ${TARGET_EMAIL}`);
    }

    const userId = userRes.rows[0].id;

    const updateRes = await client.query(
      'UPDATE ai_agent_config SET prompt = $1, updated_at = NOW() WHERE user_id = $2',
      [prompt, userId]
    );

    if ((updateRes.rowCount || 0) === 0) {
      throw new Error(`Nenhuma linha atualizada em ai_agent_config para user_id=${userId}`);
    }

    await client.query('COMMIT');

    console.log('✅ Prompt aplicado com sucesso');
    console.log(`👤 Cliente: ${TARGET_EMAIL}`);
    console.log(`🧾 user_id: ${userId}`);
    console.log(`📝 chars_prompt: ${prompt.length}`);
    console.log(`🔄 linhas_atualizadas: ${updateRes.rowCount}`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(error => {
  console.error('❌ Falha ao aplicar prompt:', error.message);
  process.exit(1);
});
