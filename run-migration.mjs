import pg from 'pg';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const client = new pg.Client({
    connectionString: process.env.DATABASE_URL,
    ssl: {
      rejectUnauthorized: false
    }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao PostgreSQL');

    const sql = fs.readFileSync(
      'C:\\Users\\Windows\\Downloads\\agentezap correto\\vvvv\\server\\db\\migrations\\20250211_create_ticket_system.sql',
      'utf8'
    );

    console.log('📄 Executando migration...');
    await client.query(sql);
    console.log('✅ Migration executada com sucesso!');

  } catch (err) {
    console.error('❌ Erro na migration:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
