
import fs from 'fs';
import path from 'path';
import pg from 'pg';
import 'dotenv/config';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    const promptPath = 'prompt-rodrigo4.txt';
    const newPrompt = fs.readFileSync(promptPath, 'utf8');

    console.log('📖 Lendo prompt de: ' + promptPath);
    console.log('📝 Tamanho do novo prompt: ' + newPrompt.length + ' caracteres');

    const userRes = await client.query("SELECT id FROM users WHERE email = 'rodrigo4@gmail.com'");
    
    if (userRes.rows.length === 0) {
      console.error('❌ Usuário rodrigo4@gmail.com não encontrado!');
      return;
    }

    const userId = userRes.rows[0].id;
    console.log('👤 User ID: ' + userId);

    const updateRes = await client.query("UPDATE ai_agent_config SET prompt = $1 WHERE user_id = $2", [newPrompt, userId]);

    if (updateRes.rowCount > 0) {
      console.log('✅ Prompt atualizado com sucesso no banco de dados!');
    } else {
      console.warn('⚠️ Nenhuma linha atualizada. Verifique se o usuário tem ai_agent_config.');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
