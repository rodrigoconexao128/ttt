// Script para verificar configurações LLM no banco
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { inArray } from 'drizzle-orm';

async function checkConfig() {
  const keys = ['openrouter_model', 'openrouter_provider', 'llm_provider', 'openrouter_api_key'];
  
  const results = await db
    .select()
    .from(systemConfig)
    .where(inArray(systemConfig.chave, keys));
  
  console.log('\n========== CONFIGURAÇÕES LLM NO BANCO ==========\n');
  
  for (const r of results) {
    if (r.chave === 'openrouter_api_key') {
      console.log(`${r.chave}: ${r.valor ? '[API KEY PRESENTE]' : '[VAZIO]'}`);
    } else {
      console.log(`${r.chave}: ${r.valor}`);
    }
  }
  
  console.log('\n===============================================\n');
  
  // Verificar se provider está configurado
  const providerConfig = results.find(r => r.chave === 'llm_provider');
  const modelConfig = results.find(r => r.chave === 'openrouter_model');
  const openrouterProviderConfig = results.find(r => r.chave === 'openrouter_provider');
  
  console.log('ANÁLISE:');
  console.log(`- Provider LLM ativo: ${providerConfig?.valor || 'NÃO CONFIGURADO'}`);
  console.log(`- Modelo OpenRouter: ${modelConfig?.valor || 'NÃO CONFIGURADO'}`);
  console.log(`- Provider OpenRouter: ${openrouterProviderConfig?.valor || 'NÃO CONFIGURADO'}`);
  
  if (providerConfig?.valor === 'openrouter') {
    console.log('\n✅ Sistema está configurado para usar OpenRouter');
    if (modelConfig?.valor?.includes('gemma-3n-e4b')) {
      console.log('✅ Modelo Gemma 3n E4B está configurado!');
    }
    if (openrouterProviderConfig?.valor === 'chutes') {
      console.log('✅ Provider Chutes está configurado!');
    }
  } else {
    console.log('\n⚠️ Sistema NÃO está usando OpenRouter como provider principal');
  }
  
  process.exit(0);
}

checkConfig().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
