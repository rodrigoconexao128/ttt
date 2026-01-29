import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us'
);

const CHATBOT_ID = '94c98a9f-1cc8-4d74-98b0-12d3d42975ed';

async function fixConnections() {
  console.log('🔧 Corrigindo conexões com IDs corretos dos botões...\n');
  
  // Buscar todos os nós de botões
  const { data: nodes } = await supabase
    .from('chatbot_flow_nodes')
    .select('node_id, name, node_type, content')
    .eq('chatbot_id', CHATBOT_ID)
    .in('node_type', ['buttons', 'list']);
  
  const connections = [];
  
  for (const node of nodes) {
    // Processar botões
    if (node.node_type === 'buttons' && node.content?.buttons) {
      console.log(`\n📌 ${node.name} (${node.node_id}):`);
      for (const btn of node.content.buttons) {
        const handle = `button_${btn.id}`;
        const nextNode = btn.next_node;
        console.log(`  ${handle} -> ${nextNode}`);
        if (nextNode) {
          connections.push({
            from_node_id: node.node_id,
            from_handle: handle,
            to_node_id: nextNode
          });
        }
      }
    }
    
    // Processar listas
    if (node.node_type === 'list' && node.content?.sections) {
      console.log(`\n📋 ${node.name} (${node.node_id}):`);
      for (const section of node.content.sections) {
        if (section.rows) {
          for (const row of section.rows) {
            const handle = `row_${row.id}`;
            const nextNode = row.next_node || node.content.default_next_node;
            console.log(`  ${handle} -> ${nextNode || 'default'}`);
            if (nextNode) {
              connections.push({
                from_node_id: node.node_id,
                from_handle: handle,
                to_node_id: nextNode
              });
            }
          }
        }
      }
      // Adicionar conexão default para listas
      if (node.content.default_next_node) {
        connections.push({
          from_node_id: node.node_id,
          from_handle: 'default',
          to_node_id: node.content.default_next_node
        });
      }
    }
  }
  
  console.log(`\n📝 Total de conexões a criar: ${connections.length}`);
  
  // Limpar conexões existentes
  await supabase
    .from('chatbot_flow_connections')
    .delete()
    .eq('chatbot_id', CHATBOT_ID);
  
  // Inserir novas conexões
  let success = 0;
  let errors = 0;
  
  for (const conn of connections) {
    const { error } = await supabase
      .from('chatbot_flow_connections')
      .insert({
        chatbot_id: CHATBOT_ID,
        ...conn
      });
    
    if (error) {
      console.log(`❌ ${conn.from_node_id} -> ${conn.to_node_id}: ${error.message}`);
      errors++;
    } else {
      success++;
    }
  }
  
  console.log(`\n✅ ${success} conexões criadas`);
  console.log(`❌ ${errors} erros`);
  
  // Verificar total
  const { data: total } = await supabase
    .from('chatbot_flow_connections')
    .select('*')
    .eq('chatbot_id', CHATBOT_ID);
  
  console.log(`\n📊 Total de conexões: ${total?.length || 0}`);
}

fixConnections().then(() => process.exit(0));
