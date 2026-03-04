import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DB_URL = 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const client = new pg.Client({ connectionString: DB_URL });

async function main() {
  await client.connect();
  console.log('✅ Conectado ao banco');

  // Lê o novo prompt v2
  const novoPrompt = fs.readFileSync(path.join(__dirname, 'prompt-rodrigo-calibrado-v2.txt'), 'utf8');
  console.log(`📄 Novo prompt v2: ${novoPrompt.length} chars`);

  // Faz backup do atual antes de sobrescrever
  const { rows: atual } = await client.query(
    `SELECT prompt FROM ai_agent_config WHERE user_id = $1`,
    [USER_ID]
  );

  if (atual.length === 0) {
    console.error('❌ Nenhum registro encontrado para user_id:', USER_ID);
    await client.end();
    process.exit(1);
  }

  const backupPath = path.join(__dirname, 'backup-rodrigo-prompt-v2.txt');
  fs.writeFileSync(backupPath, atual[0].prompt, 'utf8');
  console.log(`💾 Backup salvo em: backup-rodrigo-prompt-v2.txt (${atual[0].prompt.length} chars)`);

  // Aplica o novo prompt v2
  const { rowCount } = await client.query(
    `UPDATE ai_agent_config SET prompt = $1, updated_at = NOW() WHERE user_id = $2`,
    [novoPrompt, USER_ID]
  );

  if (rowCount === 1) {
    console.log('🎉 Prompt v2 aplicado com sucesso!');
    console.log(`   Antes: ${atual[0].prompt.length} chars`);
    console.log(`   Agora:  ${novoPrompt.length} chars`);
  } else {
    console.error('❌ Update falhou, nenhuma linha atualizada');
  }

  await client.end();
}

main().catch(err => {
  console.error('❌ Erro:', err.message);
  process.exit(1);
});
