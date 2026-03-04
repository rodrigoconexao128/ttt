/**
 * Script de verificação rápida dos agentes e status do Fluxo
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const { Client } = pg;

async function verify() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco\n');
    
    // 1. Verificar status do Fluxo
    const fluxoResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active = true) as fluxo_ativo,
        COUNT(*) FILTER (WHERE is_active = false OR is_active IS NULL) as fluxo_inativo,
        COUNT(*) as total
      FROM chatbot_configs
    `);
    
    console.log('═══════════════════════════════════════════');
    console.log('📊 STATUS DO ROBÔ FLUXO');
    console.log('═══════════════════════════════════════════');
    console.log(`✅ Fluxo ATIVO: ${fluxoResult.rows[0].fluxo_ativo}`);
    console.log(`🔒 Fluxo INATIVO: ${fluxoResult.rows[0].fluxo_inativo}`);
    console.log(`📊 Total configs: ${fluxoResult.rows[0].total}`);
    
    // 2. Verificar agentes ativos
    const agentResult = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE a.is_active = true) as agentes_ativos,
        COUNT(*) as total
      FROM ai_agent_config a
    `);
    
    console.log('\n═══════════════════════════════════════════');
    console.log('🤖 STATUS DOS AGENTES IA');
    console.log('═══════════════════════════════════════════');
    console.log(`✅ Agentes ATIVOS: ${agentResult.rows[0].agentes_ativos}`);
    console.log(`📊 Total agentes: ${agentResult.rows[0].total}`);
    
    // 3. Verificar 5 contas com prompts únicos
    const promptsResult = await client.query(`
      SELECT 
        a.user_id,
        b.company_name,
        b.agent_name,
        LEFT(a.prompt, 100) as prompt_preview,
        a.is_active as ai_active
      FROM ai_agent_config a
      LEFT JOIN business_agent_configs b ON a.user_id = b.user_id
      WHERE a.prompt IS NOT NULL AND a.prompt != ''
      ORDER BY a.updated_at DESC
      LIMIT 5
    `);
    
    console.log('\n═══════════════════════════════════════════');
    console.log('📋 5 ÚLTIMOS AGENTES CONFIGURADOS');
    console.log('═══════════════════════════════════════════');
    
    let allUnique = true;
    const prompts = [];
    
    for (const row of promptsResult.rows) {
      const preview = row.prompt_preview || 'SEM PROMPT';
      console.log(`\n🏢 ${row.company_name || 'N/A'}`);
      console.log(`   Agente: ${row.agent_name || 'N/A'}`);
      console.log(`   Status: ${row.ai_active ? '✅ Ativo' : '🔴 Inativo'}`);
      console.log(`   Prompt: ${preview.substring(0, 80)}...`);
      
      // Verificar duplicatas
      if (prompts.includes(preview)) {
        allUnique = false;
        console.log('   ⚠️ PROMPT DUPLICADO!');
      }
      prompts.push(preview);
    }
    
    console.log('\n═══════════════════════════════════════════');
    console.log('📊 RESULTADO FINAL');
    console.log('═══════════════════════════════════════════');
    
    const fluxoOk = parseInt(fluxoResult.rows[0].fluxo_ativo) === 0;
    const promptsOk = allUnique;
    
    console.log(`${fluxoOk ? '✅' : '❌'} Fluxo desativado para todos: ${fluxoOk ? 'SIM' : 'NÃO'}`);
    console.log(`${promptsOk ? '✅' : '❌'} Prompts únicos (sem duplicatas): ${promptsOk ? 'SIM' : 'NÃO'}`);
    
    if (fluxoOk && promptsOk) {
      console.log('\n🎉 SISTEMA OK - Agentes funcionando corretamente!');
    } else {
      console.log('\n⚠️ PROBLEMAS DETECTADOS - Verificar itens acima');
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

verify();
