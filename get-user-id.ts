/**
 * 🔍 BUSCA RÁPIDA DE USER_ID
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM'
);

async function getUserId() {
  try {
    console.log('Buscando itens do menu...\n');
    
    const { data, error } = await supabase
      .from('menu_items')
      .select('user_id, name')
      .limit(10);

    if (error) {
      console.error('Erro menu_items:', error);
    } else {
      console.log(`menu_items: ${data?.length || 0} itens`);
      if (data && data.length > 0) {
        console.log(`Primeiro item: ${data[0].name} (user_id: ${data[0].user_id})`);
      }
    }
    
    // Tentar delivery_config novamente
    const { data: configs, error: configError } = await supabase
      .from('delivery_config')
      .select('*')
      .limit(5);
      
    if (configError) {
      console.error('Erro delivery_config:', configError);
    } else {
      console.log(`\ndelivery_config: ${configs?.length || 0} configs`);
      if (configs && configs.length > 0) {
        console.log('Primeira config:', configs[0]);
      }
    }
    
    // Tentar ai_agent_config (tabela correta!)
    const { data: agents, error: agentError } = await supabase
      .from('ai_agent_config')
      .select('user_id, email, prompt')
      .limit(20);
      
    if (agentError) {
      console.error('Erro ai_agent_config:', agentError);
    } else {
      console.log(`\nai_agent_config: ${agents?.length || 0} agentes`);
      agents?.forEach((agent, index) => {
        const promptPreview = agent.prompt?.substring(0, 50) || 'sem prompt';
        console.log(`${index + 1}. ${agent.email} (user_id: ${agent.user_id})`);
        console.log(`    Prompt: ${promptPreview}...`);
      });
      
      // Buscar especificamente por 'big'
      const bigAgents = agents?.filter(a => a.email?.toLowerCase().includes('big'));
      if (bigAgents && bigAgents.length > 0) {
        console.log(`\n🎯🎯🎯 ENCONTRADO! Agentes com 'big' no email:`);
        bigAgents.forEach(a => console.log(`   - ${a.email}\n   - USER_ID: ${a.user_id}\n`));
      }
    }
  } catch (err) {
    console.error('Erro fatal:', err);
  }
}

getUserId();
