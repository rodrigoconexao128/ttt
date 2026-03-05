import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTcyNzEyOTQ3MCwiZXhwIjoyMDQyNzA1NDcwfQ.f_L4_6rusB6z5rBEnXB2HFq_cj2Kf6r9yNcQ3b2RPPU'
);

async function check() {
  // Buscar chatbot
  const { data: chatbot, error: cbErr } = await supabase
    .from('chatbots')
    .select('id, name, is_active, use_ai, trigger_phrases, flow_data')
    .eq('user_id', '811c0403-ee01-4d60-8101-9b9e80684384')
    .single();
  
  if (cbErr) {
    console.log('Erro chatbot:', cbErr);
    return;
  }
  
  console.log('=== CHATBOT ===');
  console.log('Nome:', chatbot.name);
  console.log('Ativo:', chatbot.is_active);
  console.log('Usa IA:', chatbot.use_ai);
  console.log('Trigger phrases:', chatbot.trigger_phrases);
  
  if (chatbot.flow_data) {
    console.log('\n=== FLOW DATA ===');
    console.log('Tem nodes:', !!chatbot.flow_data.nodes);
    console.log('Qtd nodes:', chatbot.flow_data.nodes?.length || 0);
    console.log('Qtd edges:', chatbot.flow_data.edges?.length || 0);
    
    // Listar tipos de nodes
    const types = (chatbot.flow_data.nodes || []).map(n => n.type);
    console.log('Tipos de nodes:', [...new Set(types)]);
    
    // Mostrar nodes de start
    const startNodes = (chatbot.flow_data.nodes || []).filter(n => n.type === 'start');
    console.log('\nStart nodes:', startNodes.length);
    startNodes.forEach((n, i) => {
      console.log('Start', i+1, '- Keywords:', n.data?.keywords);
    });
    
    // Mostrar primeiro fluxo
    const firstNode = (chatbot.flow_data.nodes || [])[0];
    console.log('\nPrimeiro node:', firstNode?.type, '-', firstNode?.data?.label || firstNode?.data?.content?.substring(0, 50));
    
    // Mostrar nodes de buttons
    const buttonNodes = (chatbot.flow_data.nodes || []).filter(n => n.type === 'buttons');
    console.log('\nNodes de buttons:', buttonNodes.length);
    buttonNodes.forEach((n, i) => {
      console.log('Buttons', i+1, '- Botões:', n.data?.buttons?.map(b => b.text || b.title));
    });
    
  } else {
    console.log('\n!!! ERRO: flow_data está vazio ou null !!!');
  }
}

check().then(() => process.exit(0));
