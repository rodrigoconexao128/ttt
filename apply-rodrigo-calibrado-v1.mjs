import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

const TARGET_USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';
const TARGET_EMAIL   = 'rodrigo4@gmail.com';
const PROMPT_FILE    = path.join(__dirname, 'prompt-rodrigo-calibrado-v1.txt');

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const newPrompt = fs.readFileSync(PROMPT_FILE, 'utf8');

const client = await pool.connect();
try {
  await client.query('BEGIN');

  // Backup do prompt atual
  const cur = await client.query(
    'SELECT prompt FROM ai_agent_config WHERE user_id = $1',
    [TARGET_USER_ID]
  );
  if (cur.rows.length === 0) {
    throw new Error('ai_agent_config não encontrado para ' + TARGET_EMAIL);
  }
  const oldPrompt = cur.rows[0].prompt || '';
  fs.writeFileSync(path.join(__dirname, 'backup-rodrigo-prompt.txt'), oldPrompt, 'utf8');
  console.log('✅ Backup salvo em backup-rodrigo-prompt.txt');
  console.log('   chars antigo:', oldPrompt.length);

  // Aplica novo prompt
  await client.query(
    'UPDATE ai_agent_config SET prompt = $1, updated_at = NOW() WHERE user_id = $2',
    [newPrompt, TARGET_USER_ID]
  );

  await client.query('COMMIT');
  console.log('✅ Prompt rodrigo4 atualizado no banco!');
  console.log('   chars novo:', newPrompt.length);

  // Verifica frase chave
  const FRASE = 'Boa tarde, Tudo bem? Rodrigo da AgenteZap aqui. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?';
  console.log('   frase obrigatória presente:', newPrompt.includes(FRASE));
} catch (e) {
  await client.query('ROLLBACK');
  console.error('❌ Erro:', e.message);
  process.exit(1);
} finally {
  client.release();
  await pool.end();
}
