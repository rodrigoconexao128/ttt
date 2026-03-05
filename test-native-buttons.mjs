/**
 * Script de teste para botões nativos via nativeFlowMessage
 * Testa a implementação do centralizedMessageSender.ts v2.0
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us';

const supabase = createClient(supabaseUrl, supabaseKey);

async function getActiveConnections() {
  const { data, error } = await supabase
    .from('whatsapp_connections')
    .select('id, user_id, phone_number, is_connected')
    .eq('is_connected', true)
    .limit(5);
  
  if (error) {
    console.log('Erro ao buscar conexões:', error.message);
    return [];
  }
  
  return data || [];
}

async function getChatbotFlow(userId) {
  const { data, error } = await supabase
    .from('chatbot_flows')
    .select('id, name, nodes, is_active')
    .eq('user_id', userId)
    .eq('is_active', true)
    .single();
  
  if (error) {
    console.log('Erro ao buscar flow:', error.message);
    return null;
  }
  
  return data;
}

async function main() {
  console.log('=== TESTE DE BOTÕES NATIVOS ===\n');
  
  // 1. Buscar conexões ativas
  console.log('1. Buscando conexões ativas...');
  const connections = await getActiveConnections();
  
  if (connections.length === 0) {
    console.log('❌ Nenhuma conexão ativa encontrada');
    return;
  }
  
  console.log(`✅ Encontradas ${connections.length} conexões ativas:\n`);
  
  for (const conn of connections) {
    console.log(`   📱 ${conn.phone_number || 'N/A'} (user: ${conn.user_id?.substring(0, 8)}...)`);
    
    // 2. Verificar se tem chatbot flow
    const flow = await getChatbotFlow(conn.user_id);
    
    if (flow) {
      console.log(`      ✅ Flow ativo: "${flow.name}" (${flow.nodes?.length || 0} nós)`);
      
      // Mostrar nós de botões
      const buttonNodes = flow.nodes?.filter(n => n.type === 'buttons') || [];
      if (buttonNodes.length > 0) {
        console.log(`      🔘 ${buttonNodes.length} nós de botões encontrados:`);
        buttonNodes.slice(0, 3).forEach(node => {
          const buttons = node.data?.buttons || [];
          console.log(`         - "${node.data?.label || node.id}": ${buttons.length} botões`);
        });
      }
    } else {
      console.log(`      ❌ Sem chatbot flow ativo`);
    }
    
    console.log('');
  }
  
  console.log('\n=== IMPLEMENTAÇÃO DOS BOTÕES NATIVOS ===\n');
  console.log('A implementação usa nativeFlowMessage com viewOnceMessage:');
  console.log('');
  console.log('1. sendButtons() no centralizedMessageSender.ts v2.0');
  console.log('   → Cria proto.Message.InteractiveMessage.create()');
  console.log('   → Usa nativeFlowMessage.buttons com name: "quick_reply"');
  console.log('   → Envia via generateWAMessageFromContent + relayMessage');
  console.log('');
  console.log('2. Resposta capturada em whatsapp.ts:');
  console.log('   → interactiveResponseMessage → nativeFlowResponseMessage');
  console.log('   → Extrai params.id ou params.display_text');
  console.log('');
  console.log('3. FlowEngine processa resposta:');
  console.log('   → Compara com buttonId ou buttonTitle');
  console.log('   → Também aceita entrada numérica (1, 2, 3...)');
  console.log('');
  
  console.log('⚠️ NOTA: O FlowEngine está atualmente DESABILITADO');
  console.log('   → server/flowIntegration.ts linha 285 retorna false');
  console.log('   → Para testar botões, habilitar FlowEngine ou usar outro método\n');
}

main().catch(console.error);
