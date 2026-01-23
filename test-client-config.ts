/**
 * Teste direto da API do cliente Objetivo Milionário
 * Para diagnosticar o problema de corte da lista de categorias
 */
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDMwMjIyNDUsImV4cCI6MjA1ODU5ODI0NX0.8j6pQpKHLOLaYjEGUabDLrDP7Yr_BG2FmtxMfS3JB4E';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testClientConfig() {
  console.log("=".repeat(80));
  console.log("TESTE DIRETO DA CONFIGURAÇÃO DO CLIENTE");
  console.log("=".repeat(80));

  // Buscar o usuário
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email, name')
    .eq('email', 'lmcoriolano@hotmail.com')
    .limit(1);

  if (userError || !users?.length) {
    console.error('Erro ao buscar usuário:', userError);
    return;
  }

  const user = users[0];
  console.log(`\n✅ Usuário encontrado: ${user.name} (${user.email})`);
  console.log(`   ID: ${user.id}`);

  // Buscar configuração do agente
  const { data: agentConfig, error: agentError } = await supabase
    .from('ai_agent_config')
    .select('prompt, model, message_split_chars, is_active')
    .eq('user_id', user.id)
    .limit(1);

  if (agentError || !agentConfig?.length) {
    console.error('Erro ao buscar config do agente:', agentError);
    return;
  }

  const config = agentConfig[0];
  console.log(`\n📝 Configuração do Agente:`);
  console.log(`   Modelo: ${config.model}`);
  console.log(`   message_split_chars: ${config.message_split_chars}`);
  console.log(`   is_active: ${config.is_active}`);
  console.log(`   Tamanho do prompt: ${config.prompt?.length || 0} caracteres`);

  // Analisar o prompt
  const prompt = config.prompt || '';
  
  // Buscar a lista de 71 categorias no prompt
  const categoriesMatch = prompt.match(/1\.\s*🎨.*?71\.\s*🎁.*?(?=\n\n|\n[A-Z]|$)/s);
  if (categoriesMatch) {
    console.log(`\n📋 Lista de 71 categorias encontrada no prompt:`);
    console.log(`   Tamanho: ${categoriesMatch[0].length} caracteres`);
    
    // Contar quantas categorias existem
    const categoryNumbers = categoriesMatch[0].match(/\d+\./g);
    console.log(`   Total de categorias: ${categoryNumbers?.length || 0}`);
    
    // Verificar se a 71 está presente
    if (categoriesMatch[0].includes('71.')) {
      console.log(`   ✅ Categoria 71 está presente no prompt`);
    } else {
      console.log(`   ❌ Categoria 71 NÃO está no prompt!`);
    }
  } else {
    console.log(`\n⚠️ Lista de 71 categorias NÃO encontrada no prompt padrão`);
    // Procurar de outra forma
    const linesWith71 = prompt.split('\n').filter(l => l.includes('71.'));
    console.log(`   Linhas com "71.": ${linesWith71.length}`);
    if (linesWith71.length > 0) {
      console.log(`   Encontrado: "${linesWith71[0].substring(0, 80)}..."`);
    }
  }

  // Verificar menções à lista de categorias
  console.log(`\n🔍 Análise de instruções sobre a lista:`);
  const mentions = [
    'lista completa',
    'lista toda',
    '71 categorias',
    'todas as 71',
    'sem cortar',
    'lista inteira'
  ];
  
  for (const mention of mentions) {
    const count = (prompt.toLowerCase().match(new RegExp(mention, 'gi')) || []).length;
    console.log(`   "${mention}": ${count} menções`);
  }

  // Verificar se há instruções de NÃO cortar
  const dontCutInstructions = prompt.match(/(?:nunca|não|jamais).*(?:cortar|omitir|resumir|encurtar)/gi);
  if (dontCutInstructions?.length) {
    console.log(`\n📌 Instruções encontradas para NÃO cortar:`);
    dontCutInstructions.forEach(inst => {
      console.log(`   - "${inst.substring(0, 80)}"`);
    });
  }

  console.log("\n" + "=".repeat(80));
  console.log("FIM DO DIAGNÓSTICO");
  console.log("=".repeat(80));
}

testClientConfig().catch(console.error);
