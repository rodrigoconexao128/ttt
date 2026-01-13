/**
 * 🧪 Script de Teste - getAgentConfig e autoReactivateMinutes
 */

import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     🧪 TESTE getAgentConfig - autoReactivateMinutes          ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // Pegar um usuário com timer configurado
    const result = await pool.query(`
      SELECT * FROM ai_agent_config WHERE auto_reactivate_minutes = 60 LIMIT 1
    `);
    
    if (result.rows.length === 0) {
      console.log('Nenhum usuário com timer 60 min encontrado');
      return;
    }
    
    const config = result.rows[0];
    console.log('📋 Configuração do banco de dados (raw):');
    console.log(JSON.stringify(config, null, 2));
    
    console.log('\n📋 Campo auto_reactivate_minutes:');
    console.log(`   Valor: ${config.auto_reactivate_minutes}`);
    console.log(`   Tipo: ${typeof config.auto_reactivate_minutes}`);
    
    // Simular o que o código TypeScript faz
    const autoReactivateMinutes = (config as any)?.autoReactivateMinutes ?? null;
    console.log('\n📋 Simulando código TypeScript:');
    console.log(`   (config as any)?.autoReactivateMinutes: ${(config as any)?.autoReactivateMinutes}`);
    console.log(`   Resultado final (com ?? null): ${autoReactivateMinutes}`);
    
    // O problema está aqui! O campo no banco é snake_case mas o Drizzle deveria converter para camelCase
    console.log('\n📋 Verificando todos os campos:');
    for (const [key, value] of Object.entries(config)) {
      console.log(`   ${key}: ${value} (${typeof value})`);
    }
    
    // Testar acesso direto ao campo snake_case
    console.log('\n📋 Testando acessos diferentes:');
    console.log(`   config.auto_reactivate_minutes: ${config.auto_reactivate_minutes}`);
    console.log(`   config['auto_reactivate_minutes']: ${config['auto_reactivate_minutes']}`);
    console.log(`   config.autoReactivateMinutes: ${(config as any).autoReactivateMinutes}`);
    console.log(`   config['autoReactivateMinutes']: ${config['autoReactivateMinutes']}`);
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

main();
