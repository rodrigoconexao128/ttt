/**
 * TESTE 2: Verificar contas específicas com negócios diferentes
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const { Client } = pg;

async function testSpecificAccounts() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('═══════════════════════════════════════════');
    console.log('📊 TESTE 2: VERIFICAÇÃO DE CONTAS ESPECÍFICAS');
    console.log('═══════════════════════════════════════════\n');
    
    // Buscar 5 contas diferentes com negócios distintos
    const result = await client.query(`
      SELECT DISTINCT ON (b.company_name)
        b.user_id,
        b.company_name,
        b.agent_name,
        LEFT(a.prompt, 150) as prompt_preview,
        a.is_active as ai_active,
        c.is_active as fluxo_active
      FROM business_agent_configs b
      JOIN ai_agent_config a ON a.user_id = b.user_id
      LEFT JOIN chatbot_configs c ON c.user_id = b.user_id
      WHERE b.company_name IS NOT NULL 
        AND b.company_name != '' 
        AND b.company_name != 'Minha Empresa'
      ORDER BY b.company_name
      LIMIT 10
    `);
    
    console.log(`📋 ${result.rows.length} contas com empresas configuradas:\n`);
    
    let testsOk = 0;
    let testsFail = 0;
    
    for (const row of result.rows) {
      const fluxoStatus = row.fluxo_active === true ? '🔴 ATIVO' : '✅ Inativo';
      const aiStatus = row.ai_active === true ? '✅ Ativo' : '🔴 Inativo';
      
      console.log(`🏢 ${row.company_name}`);
      console.log(`   🤖 Agente: ${row.agent_name}`);
      console.log(`   📡 IA: ${aiStatus} | Fluxo: ${fluxoStatus}`);
      console.log(`   📝 Prompt: ${(row.prompt_preview || '').substring(0, 100)}...`);
      
      // Verificar se Fluxo está desativado
      if (row.fluxo_active === true) {
        console.log('   ⚠️ PROBLEMA: Fluxo ainda ativo!');
        testsFail++;
      } else {
        testsOk++;
      }
      console.log('');
    }
    
    console.log('═══════════════════════════════════════════');
    console.log(`📊 RESULTADO: ${testsOk}/${result.rows.length} contas OK`);
    console.log('═══════════════════════════════════════════');
    
    if (testsFail === 0) {
      console.log('✅ TESTE 2 PASSOU: Todas as contas sem Fluxo ativo!\n');
    } else {
      console.log(`❌ TESTE 2 FALHOU: ${testsFail} contas com Fluxo ativo!\n`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await client.end();
  }
}

testSpecificAccounts();
