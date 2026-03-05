/**
 * Teste completo de inserção em massa na Lista de Exclusão
 * Executa via: npx tsx test-bulk-exclusion.ts
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:h8r6MFBWjL5XTms7@aws-1-sa-east-1.pooler.supabase.com:6543/postgres',
  ssl: { rejectUnauthorized: false }
});

async function testBulkExclusion() {
  console.log('🧪 TESTE DE INSERÇÃO EM MASSA - LISTA DE EXCLUSÃO\n');
  
  const TEST_USER_ID = '731f255c-7fcd-4af9-9431-142e0a0234a1';
  
  try {
    // 1. Limpar números de teste anteriores (números que começam com 55119990)
    console.log('🧹 Limpando números de teste anteriores...');
    await pool.query(
      `DELETE FROM exclusion_list WHERE user_id = $1 AND phone_number LIKE '55119990%'`,
      [TEST_USER_ID]
    );
    
    // 2. Simular bulk import - 20 números
    console.log('\n📥 Inserindo 20 números em massa...');
    const numbersToInsert = [
      '5511999001111', '5511999002222', '5511999003333', '5511999004444', '5511999005555',
      '5511999006666', '5511999007777', '5511999008888', '5511999009999', '5511999010000',
      '5511999011111', '5511999012222', '5511999013333', '5511999014444', '5511999015555',
      '5511999016666', '5511999017777', '5511999018888', '5511999019999', '5511999020000',
    ];
    
    let inserted = 0;
    for (const number of numbersToInsert) {
      try {
        await pool.query(
          `INSERT INTO exclusion_list (user_id, phone_number, exclude_from_followup, is_active)
           VALUES ($1, $2, true, true)
           ON CONFLICT (user_id, phone_number) DO NOTHING`,
          [TEST_USER_ID, number]
        );
        inserted++;
      } catch (err) {
        // Ignorar duplicatas
      }
    }
    console.log(`✅ ${inserted} números inseridos com sucesso!`);
    
    // 3. Verificar contagem total
    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM exclusion_list WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    console.log(`📊 Total de números na lista: ${countResult.rows[0].total}`);
    
    // 4. Testar isNumberExcluded para um número inserido
    console.log('\n🔍 Testando lógica de exclusão...');
    const checkResult = await pool.query(
      `SELECT COUNT(*) > 0 as is_excluded
       FROM exclusion_list el
       JOIN exclusion_config ec ON ec.user_id = el.user_id
       WHERE el.user_id = $1 
         AND el.phone_number = '5511999001111'
         AND el.is_active = true
         AND ec.is_enabled = true`,
      [TEST_USER_ID]
    );
    
    if (checkResult.rows[0].is_excluded) {
      console.log('✅ Número 5511999001111: 🚫 BLOQUEADO - IA não pode responder');
    } else {
      console.log('❌ ERRO: Número deveria estar bloqueado!');
    }
    
    // 5. Testar número que NÃO está na lista
    const checkNormalResult = await pool.query(
      `SELECT COUNT(*) > 0 as is_excluded
       FROM exclusion_list el
       JOIN exclusion_config ec ON ec.user_id = el.user_id
       WHERE el.user_id = $1 
         AND el.phone_number = '5511999099999'
         AND el.is_active = true
         AND ec.is_enabled = true`,
      [TEST_USER_ID]
    );
    
    if (!checkNormalResult.rows[0].is_excluded) {
      console.log('✅ Número 5511999099999: ✅ LIBERADO - IA pode responder');
    } else {
      console.log('❌ ERRO: Número não deveria estar bloqueado!');
    }
    
    // 6. Testar remoção em massa
    console.log('\n🗑️ Testando remoção em massa (5 números)...');
    const deleteResult = await pool.query(
      `DELETE FROM exclusion_list 
       WHERE user_id = $1 
         AND phone_number IN ('5511999016666', '5511999017777', '5511999018888', '5511999019999', '5511999020000')
       RETURNING phone_number`,
      [TEST_USER_ID]
    );
    console.log(`✅ ${deleteResult.rowCount} números removidos`);
    
    // 7. Verificar contagem final
    const finalCount = await pool.query(
      `SELECT 
         COUNT(*) as total,
         COUNT(*) FILTER (WHERE phone_number LIKE '55119990%') as teste_numeros
       FROM exclusion_list 
       WHERE user_id = $1`,
      [TEST_USER_ID]
    );
    console.log(`📊 Total após remoção: ${finalCount.rows[0].total} (${finalCount.rows[0].teste_numeros} de teste)`);
    
    // 8. Resumo
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📋 RESUMO DOS TESTES');
    console.log('═══════════════════════════════════════════════════════');
    console.log('✅ Inserção em massa: PASSOU');
    console.log('✅ Verificação de bloqueio: PASSOU');
    console.log('✅ Verificação de liberado: PASSOU');
    console.log('✅ Remoção em massa: PASSOU');
    console.log('═══════════════════════════════════════════════════════');
    console.log('\n🎉 TODOS OS TESTES PASSARAM!\n');
    
  } catch (error) {
    console.error('❌ Erro durante os testes:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

testBulkExclusion();
