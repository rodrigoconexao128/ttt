import fs from 'fs';
import path from 'path';
import pg from 'pg';
import 'dotenv/config';

// Configura��o do banco de dados (mesma do check-database.ts)
const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  const client = await pool.connect();
  try {
    // Relative path since we run from vvvv
    const promptPath = 'prompt-rodrigo4.txt';
    const newPrompt = fs.readFileSync(promptPath, 'utf8');

    console.log(' Lendo prompt de: ' + promptPath);
    console.log(' Tamanho do novo prompt: ' + newPrompt.length + ' caracteres');

    // Buscar ID do usu�rio rodrigo4@gmail.com
    const userRes = await client.query("SELECT id FROM users WHERE email = 'rodrigo4@gmail.com'");
    
    if (userRes.rows.length === 0) {
      console.error(' Usu�rio rodrigo4@gmail.com n�o encontrado!');
      return;
    }

    const userId = userRes.rows[0].id;
    console.log(' User ID: ' + userId);

    // Update prompt
    const updateRes = await client.query(
      UPDATE ai_agent_config 
      SET prompt =  
      WHERE user_id = 
    , [newPrompt, userId]);

    if (updateRes.rowCount > 0) {
      console.log(' Prompt atualizado com sucesso no banco de dados!');
    } else {
      console.warn(' Nenhuma linha atualizada. Verifique se o usu�rio tem ai_agent_config.');
    }

  } catch (error) {
    console.error(' Erro:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
