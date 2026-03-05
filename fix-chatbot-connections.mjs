import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us'
);

const CHATBOT_ID = '94c98a9f-1cc8-4d74-98b0-12d3d42975ed';

async function createConnections() {
  console.log('🔧 Criando conexões para o fluxo da pizzaria...\n');
  
  // Conexões do Menu Principal (node_menu_principal)
  // Botões: ['🍕 Pizzas', '🥟 Esfihas', '📋 Mais opções']
  const menuPrincipalConnections = [
    { from_node_id: 'node_menu_principal', from_handle: 'button_1', to_node_id: 'node_tipo_pizza' },      // Pizzas
    { from_node_id: 'node_menu_principal', from_handle: 'button_2', to_node_id: 'node_esfihas' },         // Esfihas
    { from_node_id: 'node_menu_principal', from_handle: 'button_3', to_node_id: 'node_mais_opcoes' },     // Mais opções
    { from_node_id: 'node_menu_principal', from_handle: 'default', to_node_id: 'node_menu_principal' },   // Fallback
  ];
  
  // Conexões de Mais Opções (node_mais_opcoes)
  // Botões: ['🍹 Bebidas', '🧀 Bordas Recheadas', '🎁 Combos']
  const maisOpcoesConnections = [
    { from_node_id: 'node_mais_opcoes', from_handle: 'button_1', to_node_id: 'node_bebidas' },
    { from_node_id: 'node_mais_opcoes', from_handle: 'button_2', to_node_id: 'node_bordas' },
    { from_node_id: 'node_mais_opcoes', from_handle: 'button_3', to_node_id: 'node_combos' },
  ];
  
  // Conexões de Tipo de Pizza (node_tipo_pizza)
  // Botões: ['🍕 Pizzas Salgadas', '🍫 Pizzas Doces', '½ Meia a Meia']
  const tipoPizzaConnections = [
    { from_node_id: 'node_tipo_pizza', from_handle: 'button_1', to_node_id: 'node_pizzas_salgadas' },
    { from_node_id: 'node_tipo_pizza', from_handle: 'button_2', to_node_id: 'node_pizzas_doces' },
    { from_node_id: 'node_tipo_pizza', from_handle: 'button_3', to_node_id: 'node_meia_pizza' },
  ];
  
  // Conexões de Pizzas Salgadas/Doces -> Tamanho
  const pizzasConnections = [
    { from_node_id: 'node_pizzas_salgadas', from_handle: 'default', to_node_id: 'node_tamanho_pizza' },
    { from_node_id: 'node_pizzas_doces', from_handle: 'default', to_node_id: 'node_tamanho_pizza' },
  ];
  
  // Conexões de Tamanho Pizza -> Borda
  // Botões: ['P - Pequena', 'M - Média', 'G - Grande']
  const tamanhoPizzaConnections = [
    { from_node_id: 'node_tamanho_pizza', from_handle: 'button_1', to_node_id: 'node_borda' },
    { from_node_id: 'node_tamanho_pizza', from_handle: 'button_2', to_node_id: 'node_borda' },
    { from_node_id: 'node_tamanho_pizza', from_handle: 'button_3', to_node_id: 'node_borda' },
    { from_node_id: 'node_tamanho_pizza', from_handle: 'default', to_node_id: 'node_borda' },
  ];
  
  // Conexões de Borda (node_borda)
  // Botões: ['✅ Sim, quero borda!', '❌ Não, obrigado']
  const bordaConnections = [
    { from_node_id: 'node_borda', from_handle: 'button_1', to_node_id: 'node_escolher_borda' },
    { from_node_id: 'node_borda', from_handle: 'button_2', to_node_id: 'node_confirmar_pedido' },
  ];
  
  // Conexões de Escolher Borda -> Confirmar
  const escolherBordaConnections = [
    { from_node_id: 'node_escolher_borda', from_handle: 'default', to_node_id: 'node_confirmar_pedido' },
  ];
  
  // Conexões de Meia Pizza
  const meiaPizzaConnections = [
    { from_node_id: 'node_meia_tamanho', from_handle: 'button_1', to_node_id: 'node_meia_sabor1' },
    { from_node_id: 'node_meia_tamanho', from_handle: 'button_2', to_node_id: 'node_meia_sabor1' },
    { from_node_id: 'node_meia_sabor1', from_handle: 'default', to_node_id: 'node_meia_sabor2' },
    { from_node_id: 'node_meia_sabor2', from_handle: 'default', to_node_id: 'node_meia_borda' },
    { from_node_id: 'node_meia_borda', from_handle: 'button_1', to_node_id: 'node_escolher_borda_meia' },
    { from_node_id: 'node_meia_borda', from_handle: 'button_2', to_node_id: 'node_confirmar_meia' },
    { from_node_id: 'node_escolher_borda_meia', from_handle: 'default', to_node_id: 'node_confirmar_meia' },
    { from_node_id: 'node_confirmar_meia', from_handle: 'default', to_node_id: 'node_tipo_entrega' },
  ];
  
  // Conexões de Esfihas
  const esfihasConnections = [
    { from_node_id: 'node_esfihas', from_handle: 'default', to_node_id: 'node_qtd_esfiha' },
    { from_node_id: 'node_qtd_esfiha', from_handle: 'button_1', to_node_id: 'node_mais_esfihas' },
    { from_node_id: 'node_qtd_esfiha', from_handle: 'button_2', to_node_id: 'node_mais_esfihas' },
    { from_node_id: 'node_qtd_esfiha', from_handle: 'button_3', to_node_id: 'node_mais_esfihas' },
    { from_node_id: 'node_mais_esfihas', from_handle: 'button_1', to_node_id: 'node_esfihas' },
    { from_node_id: 'node_mais_esfihas', from_handle: 'button_2', to_node_id: 'node_bebidas' },
    { from_node_id: 'node_mais_esfihas', from_handle: 'button_3', to_node_id: 'node_tipo_entrega' },
  ];
  
  // Conexões de Bebidas
  const bebidasConnections = [
    { from_node_id: 'node_bebidas', from_handle: 'default', to_node_id: 'node_mais_bebidas' },
    { from_node_id: 'node_mais_bebidas', from_handle: 'button_1', to_node_id: 'node_bebidas' },
    { from_node_id: 'node_mais_bebidas', from_handle: 'button_2', to_node_id: 'node_menu_principal' },
    { from_node_id: 'node_mais_bebidas', from_handle: 'button_3', to_node_id: 'node_tipo_entrega' },
  ];
  
  // Conexões de Combos
  const combosConnections = [
    { from_node_id: 'node_combos', from_handle: 'row_combo_esfiha', to_node_id: 'node_combo_esfihas' },
    { from_node_id: 'node_combos', from_handle: 'row_combo_pizza', to_node_id: 'node_combo_pizza' },
    { from_node_id: 'node_combos', from_handle: 'default', to_node_id: 'node_menu_principal' },
    { from_node_id: 'node_combo_esfihas', from_handle: 'default', to_node_id: 'node_combo_refri' },
    { from_node_id: 'node_combo_refri', from_handle: 'button_1', to_node_id: 'node_tipo_entrega' },
    { from_node_id: 'node_combo_refri', from_handle: 'button_2', to_node_id: 'node_tipo_entrega' },
    { from_node_id: 'node_combo_refri', from_handle: 'button_3', to_node_id: 'node_tipo_entrega' },
    { from_node_id: 'node_combo_pizza', from_handle: 'default', to_node_id: 'node_combo_pizza_borda' },
    { from_node_id: 'node_combo_pizza_borda', from_handle: 'button_1', to_node_id: 'node_combo_pizza_refri' },
    { from_node_id: 'node_combo_pizza_borda', from_handle: 'button_2', to_node_id: 'node_combo_pizza_refri' },
    { from_node_id: 'node_combo_pizza_refri', from_handle: 'button_1', to_node_id: 'node_tipo_entrega' },
    { from_node_id: 'node_combo_pizza_refri', from_handle: 'button_2', to_node_id: 'node_tipo_entrega' },
  ];
  
  // Conexões de Tipo de Entrega
  const entregaConnections = [
    { from_node_id: 'node_tipo_entrega', from_handle: 'button_1', to_node_id: 'node_coletar_endereco' },
    { from_node_id: 'node_tipo_entrega', from_handle: 'button_2', to_node_id: 'node_coletar_nome' },
  ];
  
  // Conexões de Forma de Pagamento
  const pagamentoConnections = [
    { from_node_id: 'node_forma_pagamento', from_handle: 'button_1', to_node_id: 'node_troco' },
    { from_node_id: 'node_forma_pagamento', from_handle: 'button_2', to_node_id: 'node_confirmacao_final' },
    { from_node_id: 'node_forma_pagamento', from_handle: 'button_3', to_node_id: 'node_confirmacao_final' },
  ];
  
  // Conexões do Voltar ao Menu
  const voltarConnections = [
    { from_node_id: 'node_voltar_menu', from_handle: 'button_1', to_node_id: 'node_menu_principal' },
    { from_node_id: 'node_voltar_menu', from_handle: 'default', to_node_id: 'node_menu_principal' },
  ];
  
  // Combinar todas as conexões
  const allConnections = [
    ...menuPrincipalConnections,
    ...maisOpcoesConnections,
    ...tipoPizzaConnections,
    ...pizzasConnections,
    ...tamanhoPizzaConnections,
    ...bordaConnections,
    ...escolherBordaConnections,
    ...meiaPizzaConnections,
    ...esfihasConnections,
    ...bebidasConnections,
    ...combosConnections,
    ...entregaConnections,
    ...pagamentoConnections,
    ...voltarConnections,
  ];
  
  console.log(`📝 Total de conexões a criar: ${allConnections.length}\n`);
  
  // Primeiro, limpar conexões existentes (se houver)
  const { error: deleteError } = await supabase
    .from('chatbot_flow_connections')
    .delete()
    .eq('chatbot_id', CHATBOT_ID);
  
  if (deleteError) {
    console.log('⚠️ Erro ao limpar conexões antigas:', deleteError.message);
  } else {
    console.log('✅ Conexões antigas limpas\n');
  }
  
  // Inserir novas conexões
  let successCount = 0;
  let errorCount = 0;
  
  for (const conn of allConnections) {
    const { error } = await supabase
      .from('chatbot_flow_connections')
      .insert({
        chatbot_id: CHATBOT_ID,
        from_node_id: conn.from_node_id,
        from_handle: conn.from_handle,
        to_node_id: conn.to_node_id
      });
    
    if (error) {
      console.log(`❌ Erro: ${conn.from_node_id} -> ${conn.to_node_id}: ${error.message}`);
      errorCount++;
    } else {
      successCount++;
    }
  }
  
  console.log(`\n✅ Sucesso: ${successCount} conexões criadas`);
  console.log(`❌ Erros: ${errorCount}`);
  
  // Verificar total
  const { data: total } = await supabase
    .from('chatbot_flow_connections')
    .select('*')
    .eq('chatbot_id', CHATBOT_ID);
  
  console.log(`\n📊 Total de conexões agora: ${total?.length || 0}`);
  
  // Resetar estado da conversa problemática
  console.log('\n🔄 Resetando estado das conversas...');
  const { error: resetError } = await supabase
    .from('chatbot_conversation_data')
    .update({
      current_node_id: null,
      variables: {},
      visited_nodes: []
    })
    .eq('chatbot_id', CHATBOT_ID);
  
  if (resetError) {
    console.log('⚠️ Erro ao resetar conversas:', resetError.message);
  } else {
    console.log('✅ Conversas resetadas - próxima mensagem iniciará do início');
  }
}

createConnections().then(() => process.exit(0));
