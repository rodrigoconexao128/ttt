import pg from 'pg';
const { Client } = pg;
import { readFileSync } from 'fs';

const DATABASE_URL = 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:6543/postgres';

async function runMigration() {
  const client = new Client({
    connectionString: DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  try {
    await client.connect();
    console.log('✅ Conectado ao Supabase');

    const sql = readFileSync('./server/db/migrations/20250211_create_ticket_system.sql', 'utf8');
    
    // Execute the entire SQL at once
    await client.query(sql);
    console.log('✅ Migration executada com sucesso!');

    // Verify tables and enums
    const tablesResult = await client.query(`
      SELECT table_name FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_name IN ('tickets', 'ticket_messages', 'ticket_attachments')
      ORDER BY table_name;
    `);
    console.log('📋 Tabelas criadas:', tablesResult.rows.map(r => r.table_name).join(', '));

    const enumsResult = await client.query(`
      SELECT typname FROM pg_type 
      WHERE typname IN ('ticket_status', 'ticket_priority', 'ticket_message_sender', 'ticket_attachment_kind')
      ORDER BY typname;
    `);
    console.log('🔤 ENUMs criados:', enumsResult.rows.map(r => r.typname).join(', '));

  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

runMigration();
