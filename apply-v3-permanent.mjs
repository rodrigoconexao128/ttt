import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIRECT_URL = 'postgresql://postgres:Ibira2019%217678@db.bnfpcuzjvycudccycqqt.supabase.co:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = new pg.Client({ connectionString: DIRECT_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  await client.connect();
  console.log('✅ Conectado DIRETO\n');

  const novoPrompt = fs.readFileSync(path.join(__dirname, 'prompt-rodrigo-calibrado-v3.txt'), 'utf8');
  console.log(`📄 Prompt v3: ${novoPrompt.length} chars`);

  // Get current version info (to copy model etc.)
  const { rows: currentRows } = await client.query(`
    SELECT id, version_number, model, prompt_type, config_type
    FROM prompt_versions
    WHERE user_id = $1 AND is_current = true
    LIMIT 1
  `, [USER_ID]);

  if (currentRows.length === 0) {
    console.error('❌ Nenhuma versão atual encontrada');
    process.exit(1);
  }

  const current = currentRows[0];
  console.log('Versão atual:', current);
  const nextVersion = current.version_number + 1;

  await client.query('BEGIN');

  // Step 1: Mark current version as NOT current
  const r1 = await client.query(
    'UPDATE prompt_versions SET is_current = false WHERE user_id = $1 AND is_current = true',
    [USER_ID]
  );
  console.log(`\nStep 1: Marcou ${r1.rowCount} versão(ões) como is_current=false`);

  // Step 2: Insert new version as current
  const r2 = await client.query(`
    INSERT INTO prompt_versions
      (user_id, version_number, prompt_type, prompt_content, model, is_active, config_type, edit_summary, edit_type, is_current)
    VALUES ($1, $2, $3, $4, $5, true, $6, $7, 'manual', true)
    RETURNING id, version_number
  `, [
    USER_ID,
    nextVersion,
    current.prompt_type || 'main',
    novoPrompt,
    current.model || 'mistral-medium-latest',
    current.config_type || 'ai_agent_config',
    `Calibração v3 - FAQs completos (Pix, WA Business, banimento, ZVMA, config IA, pausar IA)`
  ]);
  const newVersion = r2.rows[0];
  console.log(`Step 2: Inseriu nova versão: id=${newVersion.id}, version_number=${newVersion.version_number}`);

  // Step 3: Update ai_agent_config with new prompt
  const r3 = await client.query(
    'UPDATE ai_agent_config SET prompt = $1, updated_at = NOW() WHERE user_id = $2',
    [novoPrompt, USER_ID]
  );
  console.log(`Step 3: ai_agent_config atualizado (${r3.rowCount} linha(s))`);

  await client.query('COMMIT');
  console.log('\n✅ COMMIT feito! Todas as 3 tabelas atualizadas.');

  // Verify
  const verify = await client.query(`
    SELECT 'ai_agent_config' as source, length(prompt) as len, updated_at::text as ts
    FROM ai_agent_config WHERE user_id = $1
    UNION ALL
    SELECT 'prompt_versions_current' as source, length(prompt_content) as len, created_at::text as ts
    FROM prompt_versions WHERE user_id = $1 AND is_current = true
  `, [USER_ID]);
  console.log('\nVerificação final:');
  verify.rows.forEach(r => console.log(' ', JSON.stringify(r)));

  await client.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
