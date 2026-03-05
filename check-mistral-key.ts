import dotenv from 'dotenv';
dotenv.config();

import { storage } from './server/storage';

async function checkMistralKey() {
  console.log('🔍 Verificando chave do Mistral...\n');
  
  // Verificar variável de ambiente
  const envKey = process.env.MISTRAL_API_KEY;
  console.log('📌 MISTRAL_API_KEY (env):', envKey ? `✅ EXISTS (${envKey.length} chars)` : '❌ NOT FOUND');
  
  // Verificar banco de dados
  try {
    const dbKey = await storage.getSystemConfig('mistral_api_key');
    console.log('📌 mistral_api_key (database):', dbKey ? `✅ EXISTS (${dbKey.length} chars)` : '❌ NOT FOUND');
    
    if (dbKey) {
      console.log('\n🔑 Chave do banco:', dbKey.substring(0, 10) + '...' + dbKey.substring(dbKey.length - 5));
    }
    if (envKey) {
      console.log('🔑 Chave do env:', envKey.substring(0, 10) + '...' + envKey.substring(envKey.length - 5));
    }
    
    // Verificar se são iguais
    if (dbKey && envKey && dbKey === envKey) {
      console.log('\n✅ As chaves são IGUAIS');
    } else if (dbKey && envKey) {
      console.log('\n⚠️ As chaves são DIFERENTES!');
    }
    
  } catch (error: any) {
    console.error('❌ Erro ao buscar do banco:', error.message);
  }
  
  process.exit(0);
}

checkMistralKey();
