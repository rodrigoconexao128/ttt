import { pool } from './server/db';

async function main() {
  // Listar tabelas
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables 
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  
  console.log('TABELAS:');
  for (const row of tables.rows) {
    console.log('  - ' + row.table_name);
  }
  
  // Verificar estrutura de conversations
  const cols = await pool.query(`
    SELECT column_name FROM information_schema.columns 
    WHERE table_name = 'conversations'
    ORDER BY ordinal_position
  `);
  
  console.log('\nCOLUNAS DE conversations:');
  for (const row of cols.rows) {
    console.log('  - ' + row.column_name);
  }
  
  // Buscar uma conversa qualquer
  const conv = await pool.query(`
    SELECT * FROM conversations 
    ORDER BY last_message_time DESC
    LIMIT 1
  `);
  
  console.log('\nEXEMPLO DE CONVERSA:');
  if (conv.rows.length > 0) {
    console.log(JSON.stringify(conv.rows[0], null, 2));
  }
}

main().catch(console.error).finally(() => process.exit(0));
