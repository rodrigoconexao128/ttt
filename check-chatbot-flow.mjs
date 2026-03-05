import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us'
);

async function check() {
  const userId = '811c0403-ee01-4d60-8101-9b9e80684384';
  
  // 1. Buscar chatbot_configs
  const { data: config, error: configErr } = await supabase
    .from('chatbot_configs')
    .select('*')
    .eq('user_id', userId)
    .single();
  
  if (configErr) {
    console.log('Erro ao buscar config:', configErr.message);
  } else {
    console.log('\n=== CHATBOT CONFIG ===');
    console.log('ID:', config.id);
    console.log('Nome:', config.name);
    console.log('Ativo:', config.is_active);
    console.log('Welcome Message:', config.welcome_message?.substring(0, 100), '...');
    console.log('Fallback Message:', config.fallback_message);
    console.log('Restart Keywords:', config.restart_keywords);
    console.log('Advanced Settings:', JSON.stringify(config.advanced_settings, null, 2));
    
    // 2. Buscar nós do fluxo
    const { data: nodes, error: nodesErr } = await supabase
      .from('chatbot_flow_nodes')
      .select('node_id, name, node_type, content')
      .eq('chatbot_id', config.id)
      .order('display_order');
    
    if (nodesErr) {
      console.log('\nErro ao buscar nós:', nodesErr.message);
    } else {
      console.log('\n=== FLOW NODES ===');
      console.log('Total de nós:', nodes?.length || 0);
      nodes?.forEach((n, i) => {
        console.log(`\n[${i+1}] ${n.node_type} - ${n.name || 'sem nome'}`);
        console.log('    ID:', n.node_id);
        if (n.node_type === 'start') {
          console.log('    Keywords:', n.content?.keywords);
        }
        if (n.node_type === 'buttons' && n.content?.buttons) {
          console.log('    Buttons:', n.content.buttons.map(b => b.title || b.text));
        }
        if (n.node_type === 'text' && n.content?.text) {
          console.log('    Text:', n.content.text.substring(0, 80), '...');
        }
      });
    }
    
    // 3. Buscar conexões
    const { data: connections, error: connErr } = await supabase
      .from('chatbot_flow_connections')
      .select('*')
      .eq('chatbot_id', config.id);
    
    console.log('\n=== CONNECTIONS ===');
    console.log('Total de conexões:', connections?.length || 0);
    
    // 4. Buscar estado de conversas
    const { data: convStates, error: stateErr } = await supabase
      .from('chatbot_conversation_data')
      .select('*')
      .eq('chatbot_id', config.id)
      .limit(5);
    
    console.log('\n=== CONVERSATION STATES (últimas 5) ===');
    convStates?.forEach(cs => {
      console.log('\nConversa:', cs.conversation_id);
      console.log('  Nó atual:', cs.current_node_id);
      console.log('  Status:', cs.status);
      console.log('  Variables:', JSON.stringify(cs.variables));
    });
  }
}

check().then(() => process.exit(0));
