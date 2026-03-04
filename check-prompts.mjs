import pg from 'pg';

const pool = new pg.Pool({ 
  connectionString: "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres"
});

async function check() {
  // Verificar prompt do rodrigo4 com ID correto
  const r2 = await pool.query(
    `SELECT user_id, LENGTH(prompt) as len FROM ai_agent_config WHERE user_id = 'cb9213c3-fde3-479e-a4aa-344171c59735'`
  );
  console.log('AI_AGENT_CONFIG.prompt rodrigo4:', r2.rows);

  // Comparar: o que o simulator-server.mjs usa (se existisse tabela negocios)
  // vs o que o servidor usa (ai_agent_config + todos os extras)
  
  // O log do servidor mostrou:
  // - Prompt base (ai_agent_config.prompt): 10,476 chars
  // - Prompt FINAL com blindagem+delivery+mídias: 33,182 chars → 9,221 tokens
  console.log('\n--- COMPARAÇÃO ---');
  console.log('simulator-server.mjs: usa prompt base (se tabela negocios existisse)');
  console.log('servidor principal: Prompt base 10,476 chars + extras = 33,182 chars (~9,221 tokens)');

  await pool.end();
}

check().catch(console.error);
