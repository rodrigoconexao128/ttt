import pg from 'pg';
const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
  ssl: { rejectUnauthorized: false }
});

const USER_ID = '811c0403-ee01-4d60-8101-9b9e80684384';

async function main() {
  const action = process.argv[2];
  
  try {
    if (action === 'reset') {
      // Resetar para estado inicial: Agent OFF, Fluxo OFF
      await pool.query(`UPDATE chatbot_configs SET is_active = false WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE business_agent_configs SET is_active = false WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE ai_agent_config SET is_active = false WHERE user_id = $1`, [USER_ID]);
      console.log('✅ Estado resetado: TUDO OFF');
    } else if (action === 'agent-on') {
      // Simular Agent ON, Fluxo OFF
      await pool.query(`UPDATE chatbot_configs SET is_active = false WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE business_agent_configs SET is_active = true WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE ai_agent_config SET is_active = true WHERE user_id = $1`, [USER_ID]);
      console.log('✅ Estado: Agent ON, Fluxo OFF');
    } else if (action === 'fluxo-on') {
      // Simular Fluxo ON, Agent OFF
      await pool.query(`UPDATE chatbot_configs SET is_active = true WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE business_agent_configs SET is_active = false WHERE user_id = $1`, [USER_ID]);
      await pool.query(`UPDATE ai_agent_config SET is_active = false WHERE user_id = $1`, [USER_ID]);
      console.log('✅ Estado: Fluxo ON, Agent OFF');
    }
    
    // Sempre mostrar o estado atual
    const result = await pool.query(`
      SELECT 
        cc.is_active as fluxo,
        bac.is_active as business,
        ai.is_active as ai
      FROM chatbot_configs cc, business_agent_configs bac, ai_agent_config ai 
      WHERE cc.user_id = $1 
        AND bac.user_id = cc.user_id 
        AND ai.user_id = cc.user_id
    `, [USER_ID]);
    
    console.log('Estado atual:', JSON.stringify(result.rows[0]));
  } catch (err) {
    console.error('Erro:', err);
  } finally {
    await pool.end();
  }
}

main();
