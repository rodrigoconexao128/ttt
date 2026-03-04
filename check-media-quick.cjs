require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function check() {
  try {
    // Buscar usuário rodrigo4@gmail.com
    const userRes = await pool.query("SELECT id, email FROM users WHERE email = 'rodrigo4@gmail.com'");
    if (!userRes.rows.length) {
      console.log('Usuário rodrigo4@gmail.com não encontrado');
      process.exit(1);
    }
    const userId = userRes.rows[0].id;
    console.log('=== USUÁRIO ===');
    console.log('ID:', userId);
    console.log('Email:', userRes.rows[0].email);
    
    // Buscar mídias do agente
    const mediasRes = await pool.query("SELECT id, name, media_type, storage_url, is_active, when_to_use FROM agent_media_library WHERE user_id = $1", [userId]);
    console.log('\n=== MÍDIAS AGENTE (' + mediasRes.rows.length + ') ===');
    for (const m of mediasRes.rows) {
      console.log('- ' + m.name + ' | tipo: ' + m.media_type + ' | ativo: ' + m.is_active);
      console.log('  URL: ' + (m.storage_url || 'SEM URL').substring(0, 100));
      console.log('  whenToUse: ' + (m.when_to_use || 'N/A').substring(0, 80));
    }
    
    // Buscar config do agente
    const configRes = await pool.query("SELECT is_active FROM agent_config WHERE user_id = $1", [userId]);
    if (configRes.rows.length) {
      console.log('\n=== CONFIG AGENTE ===');
      console.log('Ativo:', configRes.rows[0].is_active);
    }
    
    // Verificar outros agentes com mídias
    const otherMediasRes = await pool.query(`
      SELECT u.email, COUNT(m.id) as media_count 
      FROM agent_media_library m 
      JOIN users u ON m.user_id = u.id 
      GROUP BY u.email 
      ORDER BY media_count DESC 
      LIMIT 10
    `);
    console.log('\n=== TOP 10 AGENTES COM MÍDIAS ===');
    for (const r of otherMediasRes.rows) {
      console.log(r.email + ': ' + r.media_count + ' mídias');
    }
    
    process.exit(0);
  } catch(e) {
    console.error(e);
    process.exit(1);
  }
}
check();
