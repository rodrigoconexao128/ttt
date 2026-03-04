import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Tentando conexão direta (não pooler)
const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';
const POOLER_URL = 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

async function tryApply(url, label) {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log(`✅ Conectado (${label})`);

    const novoPrompt = fs.readFileSync(path.join(__dirname, 'prompt-rodrigo-calibrado-v3.txt'), 'utf8');
    console.log(`📄 v3: ${novoPrompt.length} chars`);

    // Backup first
    const { rows } = await client.query('SELECT length(prompt) as len, updated_at FROM ai_agent_config WHERE user_id = $1', [USER_ID]);
    console.log('Estado atual no banco:', rows[0]);

    // Apply with explicit BEGIN/COMMIT
    await client.query('BEGIN');
    const result = await client.query(
      'UPDATE ai_agent_config SET prompt = $1, updated_at = NOW() WHERE user_id = $2',
      [novoPrompt, USER_ID]
    );
    console.log('rowCount:', result.rowCount);
    await client.query('COMMIT');
    console.log('✅ COMMIT feito!');

    // Verify
    const { rows: verify } = await client.query('SELECT length(prompt) as len, updated_at FROM ai_agent_config WHERE user_id = $1', [USER_ID]);
    console.log('Estado APÓS update:', verify[0]);

    await client.end();
    return true;
  } catch (err) {
    console.error(`❌ Erro com ${label}:`, err.message);
    try { await client.end(); } catch {}
    return false;
  }
}

// Try direct first, then pooler
const ok = await tryApply(DIRECT_URL, 'DIRECT');
if (!ok) {
  console.log('\nTentando via pooler...');
  await tryApply(POOLER_URL, 'POOLER');
}
