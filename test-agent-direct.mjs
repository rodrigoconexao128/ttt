/**
 * Teste direto do agente IA sem precisar de login
 * Verifica se os prompts estão corretos para cada usuário
 */

import pg from 'pg';

const DATABASE_URL = "postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019!7678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres";

const { Client } = pg;

async function testAgentPrompts() {
  const client = new Client({ connectionString: DATABASE_URL });
  
  try {
    await client.connect();
    console.log('✅ Conectado ao banco de dados');
    
    // Verificar 3 contas diferentes com prompts personalizados
    const testAccounts = [
      { email: 'bigacaicuiaba@gmail.com', expected: 'Pizza' },
      { email: 'contato@toldoseldorado.com.br', expected: 'TENDAS ELDORADO' },
      { email: 'contato@ceararentacar.com.br', expected: 'CEARÁ RENT A CAR' }
    ];
    
    console.log('\n📊 VERIFICAÇÃO DE PROMPTS ÚNICOS POR CONTA\n');
    
    for (const account of testAccounts) {
      const result = await client.query(`
        SELECT 
          u.email,
          bac.company_name,
          bac.agent_name,
          LEFT(aac.prompt::text, 200) as prompt_preview,
          aac.is_active as ai_active,
          bac.is_active as business_active,
          cc.is_active as fluxo_active
        FROM auth.users u
        LEFT JOIN business_agent_configs bac ON bac.user_id = u.id::text
        LEFT JOIN ai_agent_config aac ON aac.user_id = u.id::text
        LEFT JOIN chatbot_configs cc ON cc.user_id = u.id::text
        WHERE u.email = $1
      `, [account.email]);
      
      if (result.rows.length === 0) {
        console.log(`❌ ${account.email}: NÃO ENCONTRADO`);
        continue;
      }
      
      const row = result.rows[0];
      const promptContainsExpected = row.prompt_preview?.includes(account.expected);
      
      console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
      console.log(`📧 ${account.email}`);
      console.log(`🏢 Company: ${row.company_name}`);
      console.log(`🤖 Agent: ${row.agent_name}`);
      console.log(`📝 Prompt (preview): ${row.prompt_preview?.substring(0, 100)}...`);
      console.log(`✅ AI Active: ${row.ai_active}`);
      console.log(`✅ Business Active: ${row.business_active}`);
      console.log(`❌ Fluxo Active: ${row.fluxo_active || 'null (desativado)'}`);
      console.log(`🎯 Prompt contém "${account.expected}": ${promptContainsExpected ? '✅ SIM' : '❌ NÃO'}`);
      console.log('');
    }
    
    // Verificar se há prompts duplicados
    console.log('\n📊 VERIFICAÇÃO DE PROMPTS DUPLICADOS\n');
    
    const duplicateCheck = await client.query(`
      SELECT 
        LEFT(prompt::text, 100) as prompt_start,
        COUNT(*) as count
      FROM ai_agent_config 
      WHERE prompt IS NOT NULL AND prompt != ''
      GROUP BY LEFT(prompt::text, 100)
      HAVING COUNT(*) > 1
      ORDER BY count DESC
      LIMIT 5
    `);
    
    if (duplicateCheck.rows.length === 0) {
      console.log('✅ Nenhum prompt duplicado encontrado!');
    } else {
      console.log(`⚠️ ${duplicateCheck.rows.length} prompts duplicados encontrados:`);
      for (const row of duplicateCheck.rows) {
        console.log(`   ${row.count}x: "${row.prompt_start.substring(0, 50)}..."`);
      }
    }
    
    // Verificar se fluxo está desativado para todos
    console.log('\n📊 VERIFICAÇÃO DE FLUXO DESATIVADO\n');
    
    const fluxoCheck = await client.query(`
      SELECT COUNT(*) as total_fluxo_ativo
      FROM chatbot_configs 
      WHERE is_active = true
    `);
    
    if (parseInt(fluxoCheck.rows[0].total_fluxo_ativo) === 0) {
      console.log('✅ Fluxo está DESATIVADO para todas as contas!');
    } else {
      console.log(`❌ ${fluxoCheck.rows[0].total_fluxo_ativo} contas ainda têm fluxo ativo!`);
    }
    
    console.log('\n✅ TESTE CONCLUÍDO');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await client.end();
  }
}

testAgentPrompts();
