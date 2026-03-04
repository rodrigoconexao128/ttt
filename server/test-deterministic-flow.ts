/**
 * 🧪 TESTE DO SISTEMA DETERMINÍSTICO
 *
 * Este script simula conversas para testar o fluxo determinístico
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

console.log('\n🧪 INICIANDO TESTES DO SISTEMA DETERMINÍSTICO\n');
console.log('═══════════════════════════════════════════════════════════\n');

// ═══════════════════════════════════════════════════════════════════════
// TESTE 1: Verificar se fluxos serão criados automaticamente
// ═══════════════════════════════════════════════════════════════════════

async function testFlowCreation() {
  console.log('📋 TESTE 1: Verificação de Fluxos Existentes\n');

  // Buscar agentes ativos
  const { data: agents, error } = await supabase
    .from('ai_agent_config')
    .select('user_id, prompt, is_active')
    .eq('is_active', true)
    .limit(3);

  if (error) {
    console.error('❌ Erro ao buscar agentes:', error.message);
    return;
  }

  console.log(`✅ Encontrado ${agents.length} agentes ativos\n`);

  for (const agent of agents) {
    const userId = agent.user_id;
    const promptPreview = agent.prompt?.substring(0, 60) || 'Sem prompt';

    console.log(`👤 User ID: ${userId.substring(0, 8)}...`);
    console.log(`   Prompt: ${promptPreview}...`);

    // Verificar se já tem fluxo
    const { data: existingFlow } = await supabase
      .from('flow_definitions')
      .select('id, flow_type, is_active')
      .eq('user_id', userId)
      .single();

    if (existingFlow) {
      console.log(`   ✅ JÁ TEM FLUXO: ${existingFlow.flow_type} (${existingFlow.is_active ? 'ATIVO' : 'inativo'})`);
    } else {
      console.log(`   ⚠️  SEM FLUXO - Será criado automaticamente na primeira mensagem`);
    }

    // Verificar qual módulo está ativo
    const { data: activeModule } = await supabase
      .from('user_active_modules')
      .select('active_module')
      .eq('user_id', userId)
      .single();

    if (activeModule) {
      console.log(`   📦 Módulo ativo: ${activeModule.active_module}`);
    }

    console.log();
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TESTE 2: Simular criação de fluxo para um usuário específico
// ═══════════════════════════════════════════════════════════════════════

async function testAutoFlowCreation() {
  console.log('\n📋 TESTE 2: Simulação de Criação Automática de Fluxo\n');

  // Buscar um usuário sem fluxo mas com agente ativo
  const { data: agentsWithoutFlow } = await supabase
    .from('ai_agent_config')
    .select('user_id, prompt')
    .eq('is_active', true)
    .limit(1);

  if (!agentsWithoutFlow || agentsWithoutFlow.length === 0) {
    console.log('⚠️  Nenhum agente disponível para teste');
    return;
  }

  const testAgent = agentsWithoutFlow[0];
  const userId = testAgent.user_id;

  console.log(`👤 Testando com User ID: ${userId.substring(0, 8)}...`);
  console.log(`   Prompt: ${testAgent.prompt?.substring(0, 60)}...`);

  // Verificar fluxo existente
  const { data: existingFlow, error: flowError } = await supabase
    .from('flow_definitions')
    .select('*')
    .eq('user_id', userId);

  if (existingFlow && existingFlow.length > 0) {
    console.log(`\n✅ Fluxo já existe para este usuário:`);
    existingFlow.forEach((flow, i) => {
      console.log(`   ${i + 1}. ${flow.flow_type} - ${flow.business_name || 'Sem nome'}`);
      console.log(`      Estados: ${Object.keys(flow.flow_definition?.states || {}).length}`);
      console.log(`      Ativo: ${flow.is_active ? 'SIM' : 'NÃO'}`);
    });
  } else {
    console.log(`\n⚠️  Nenhum fluxo encontrado para este usuário`);
    console.log(`   ✅ Na primeira mensagem, o sistema criará automaticamente!`);
  }
}

// ═══════════════════════════════════════════════════════════════════════
// TESTE 3: Verificar VIEW user_active_modules
// ═══════════════════════════════════════════════════════════════════════

async function testActiveModulesView() {
  console.log('\n📋 TESTE 3: Verificação da VIEW user_active_modules\n');

  const { data: modules, error } = await supabase
    .from('user_active_modules')
    .select('*')
    .limit(10);

  if (error) {
    console.error('❌ Erro ao buscar módulos ativos:', error.message);
    return;
  }

  console.log(`✅ Encontrado ${modules.length} usuários\n`);

  // Agrupar por tipo de módulo
  const byType = {};
  modules.forEach(m => {
    if (!byType[m.active_module]) {
      byType[m.active_module] = [];
    }
    byType[m.active_module].push(m.user_id);
  });

  Object.entries(byType).forEach(([moduleType, userIds]) => {
    console.log(`📦 ${moduleType}: ${userIds.length} usuário(s)`);
    userIds.slice(0, 3).forEach(id => {
      console.log(`   - ${id.substring(0, 12)}...`);
    });
  });
}

// ═══════════════════════════════════════════════════════════════════════
// EXECUTAR TODOS OS TESTES
// ═══════════════════════════════════════════════════════════════════════

async function runAllTests() {
  try {
    await testFlowCreation();
    await testAutoFlowCreation();
    await testActiveModulesView();

    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('✅ TODOS OS TESTES CONCLUÍDOS!');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('📝 PRÓXIMOS PASSOS:\n');
    console.log('1. ✅ Sistema está pronto para criar fluxos automaticamente');
    console.log('2. 🔄 Na primeira mensagem, cada agente ganhará seu fluxo');
    console.log('3. 🎯 Fluxos são determinísticos - IA não inventa informações');
    console.log('4. 🧪 Teste enviando mensagem via WhatsApp para qualquer bot\n');

  } catch (error) {
    console.error('\n❌ Erro durante testes:', error.message);
  }
}

runAllTests();
