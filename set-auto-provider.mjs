// Script para configurar provider como 'auto'
import { db } from './server/db.js';
import { systemConfig } from './shared/schema.js';
import { eq } from 'drizzle-orm';

async function setAutoProvider() {
  console.log('\n🔧 CONFIGURANDO PROVIDER COMO AUTO...\n');
  
  // Atualizar o provider no banco para 'auto'
  await db
    .update(systemConfig)
    .set({ valor: 'auto', updatedAt: new Date() })
    .where(eq(systemConfig.chave, 'openrouter_provider'));
  
  console.log('✅ Provider atualizado para: auto');
  
  // Verificar todas as configs
  const results = await db
    .select()
    .from(systemConfig)
    .where(eq(systemConfig.chave, 'openrouter_provider'));
  
  console.log(`Valor no banco: ${results[0]?.valor}`);
  
  process.exit(0);
}

setAutoProvider();
