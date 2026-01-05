import pkg from 'pg';
const { Pool } = pkg;
import * as fs from 'fs';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

async function main() {
  const client = await pool.connect();
  
  try {
    // Buscar versões do prompt do usuário rodrigo4@gmail.com
    const result = await client.query(`
      SELECT pv.id, pv.prompt_content, pv.is_current, pv.edit_summary, pv.created_at,
             LENGTH(pv.prompt_content) as prompt_length
      FROM prompt_versions pv
      JOIN users u ON pv.user_id = u.id
      WHERE u.email = 'rodrigo4@gmail.com'
      ORDER BY pv.created_at DESC
      LIMIT 20
    `);
    
    console.log(`📚 Encontradas ${result.rows.length} versões do prompt:`);
    console.log('═'.repeat(80));
    
    for (const row of result.rows) {
      const date = new Date(row.created_at).toLocaleString('pt-BR');
      const summary = (row.edit_summary || '').substring(0, 50);
      const isCurrent = row.is_current ? '✅ ATUAL' : '';
      const hasProblems = row.prompt_content.includes('Combinado?ique') || 
                          row.prompt_content.includes('**te virtual') ||
                          row.prompt_content.includes('proQuer');
      
      console.log(`\n📅 ${date} ${isCurrent}`);
      console.log(`   ID: ${row.id}`);
      console.log(`   Tamanho: ${row.prompt_length} chars`);
      console.log(`   Resumo: ${summary}...`);
      console.log(`   Problemas: ${hasProblems ? '⚠️ TEM ERROS' : '✅ OK'}`);
    }
    
    // Encontrar a versão mais recente SEM problemas
    console.log('\n' + '═'.repeat(80));
    console.log('🔍 Procurando versão sem erros...');
    
    for (const row of result.rows) {
      const hasProblems = row.prompt_content.includes('Combinado?ique') || 
                          row.prompt_content.includes('**te virtual') ||
                          row.prompt_content.includes('proQuer');
      
      if (!hasProblems) {
        console.log(`\n✅ VERSÃO LIMPA ENCONTRADA!`);
        console.log(`   ID: ${row.id}`);
        console.log(`   Data: ${new Date(row.created_at).toLocaleString('pt-BR')}`);
        console.log(`   Tamanho: ${row.prompt_length} chars`);
        
        // Salvar essa versão para análise
        fs.writeFileSync('prompt-limpo.txt', row.prompt_content);
        console.log(`   Salvo em: prompt-limpo.txt`);
        break;
      }
    }
    
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
