import { pool } from './server/db';

async function main() {
  // Buscar o user do AgenteZap (email rodrigo)
  const users = await pool.query(`
    SELECT id, email, name FROM users
    WHERE email ILIKE '%roderigo%' OR email ILIKE '%rodrigo%'
    LIMIT 5
  `);
  
  console.log('USUARIOS RODRIGO:');
  for (const u of users.rows) {
    console.log(`  - ${u.id}: ${u.email} (${u.name})`);
    
    // Verificar se tem agente configurado
    const agent = await pool.query(`
      SELECT prompt, model, is_active FROM ai_agent_config WHERE user_id = $1
    `, [u.id]);
    
    if (agent.rows.length > 0) {
      console.log(`    Agente: model=${agent.rows[0].model}, active=${agent.rows[0].is_active}`);
      console.log(`    Prompt (100 chars): ${(agent.rows[0].prompt || '').substring(0, 100)}...`);
    } else {
      console.log('    SEM AGENTE CONFIGURADO');
    }
  }
}

main().catch(console.error).finally(() => process.exit(0));
