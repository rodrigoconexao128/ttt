/**
 * 🧪 Teste REAL usando storage.getAgentConfig via Drizzle
 */

import 'dotenv/config';

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 TESTE REAL - storage.getAgentConfig via Drizzle        ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Importar o storage do projeto
    const { storage } = await import('./server/storage.js');
    
    // Buscar config do usuário com timer 60min
    const testUserId = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c';
    
    console.log(`📋 Buscando config para userId: ${testUserId}`);
    const config = await storage.getAgentConfig(testUserId);
    
    if (!config) {
      console.log('❌ Config não encontrada');
      return;
    }
    
    console.log('\n📋 Config retornada pelo Drizzle:');
    console.log(JSON.stringify(config, null, 2));
    
    console.log('\n📋 Campos específicos:');
    console.log(`   config.pauseOnManualReply: ${config.pauseOnManualReply}`);
    console.log(`   config.autoReactivateMinutes: ${config.autoReactivateMinutes}`);
    console.log(`   (config as any).autoReactivateMinutes: ${(config as any).autoReactivateMinutes}`);
    console.log(`   (config as any)?.autoReactivateMinutes ?? null: ${(config as any)?.autoReactivateMinutes ?? null}`);
    
    // Testar a lógica exata do whatsapp.ts
    const shouldPauseOnManualReply = config?.pauseOnManualReply !== false;
    const autoReactivateMinutes = (config as any)?.autoReactivateMinutes ?? null;
    
    console.log('\n📋 Simulando lógica do whatsapp.ts:');
    console.log(`   shouldPauseOnManualReply: ${shouldPauseOnManualReply}`);
    console.log(`   autoReactivateMinutes: ${autoReactivateMinutes}`);
    
    if (autoReactivateMinutes === null) {
      console.log('\n❌ PROBLEMA CONFIRMADO: autoReactivateMinutes está retornando null!');
      console.log('   O campo existe no banco mas não está sendo mapeado pelo Drizzle.');
    } else {
      console.log(`\n✅ autoReactivateMinutes está funcionando: ${autoReactivateMinutes} minutos`);
    }
    
  } catch (error) {
    console.error('❌ Erro:', error);
  }
  
  process.exit(0);
}

main();
