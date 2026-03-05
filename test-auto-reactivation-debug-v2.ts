/**
 * 🔬 Script de Debug DETALHADO - Auto-Reativação IA
 * 
 * Testa todo o fluxo:
 * 1. Configuração do agente
 * 2. Pausa de conversa com timer
 * 3. Verificação se timer está sendo gravado
 */

import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     🔬 DEBUG DETALHADO - AUTO-REATIVAÇÃO IA                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Buscar um usuário que tem auto_reactivate_minutes configurado (ex: 60 min)
    console.log('📋 1. BUSCANDO USUÁRIO COM TIMER 60 MIN CONFIGURADO');
    console.log('─'.repeat(60));
    
    const userWith60Min = await pool.query(`
      SELECT 
        user_id,
        auto_reactivate_minutes,
        pause_on_manual_reply,
        is_active
      FROM ai_agent_config
      WHERE auto_reactivate_minutes = 60
      LIMIT 1
    `);
    
    if (userWith60Min.rows.length === 0) {
      console.log('❌ Nenhum usuário com timer de 60 min encontrado');
      return;
    }
    
    const testUserId = userWith60Min.rows[0].user_id;
    console.log(`✅ Usuário encontrado: ${testUserId}`);
    console.log(`   auto_reactivate_minutes: ${userWith60Min.rows[0].auto_reactivate_minutes}`);
    console.log(`   pause_on_manual_reply: ${userWith60Min.rows[0].pause_on_manual_reply}`);

    // 2. Verificar conversas pausadas DESTE usuário
    console.log('\n📋 2. VERIFICANDO CONVERSAS PAUSADAS DESTE USUÁRIO');
    console.log('─'.repeat(60));
    
    const pausedConvs = await pool.query(`
      SELECT 
        adc.conversation_id,
        adc.auto_reactivate_after_minutes,
        adc.owner_last_reply_at,
        adc.client_has_pending_message,
        c.contact_name,
        c.contact_number
      FROM agent_disabled_conversations adc
      JOIN conversations c ON c.id = adc.conversation_id
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      WHERE wc.user_id = $1
      ORDER BY adc.owner_last_reply_at DESC
      LIMIT 5
    `, [testUserId]);
    
    if (pausedConvs.rows.length === 0) {
      console.log('ℹ️  Este usuário não tem conversas pausadas no momento.');
    } else {
      console.log('Conversas pausadas:');
      for (const conv of pausedConvs.rows) {
        console.log(`\n  📱 ${conv.contact_name || conv.contact_number}`);
        console.log(`     conversation_id: ${conv.conversation_id}`);
        console.log(`     auto_reactivate_after_minutes: ${conv.auto_reactivate_after_minutes}`);
        console.log(`     owner_last_reply_at: ${conv.owner_last_reply_at}`);
        console.log(`     client_has_pending_message: ${conv.client_has_pending_message}`);
        
        if (conv.auto_reactivate_after_minutes === null) {
          console.log(`     ⚠️  PROBLEMA: Timer não foi herdado da config do usuário!`);
        }
      }
    }

    // 3. Verificar se há problema na herança do timer
    console.log('\n📋 3. ANÁLISE: CONVERSAS SEM TIMER VS CONFIG DO USUÁRIO');
    console.log('─'.repeat(60));
    
    const mismatchResult = await pool.query(`
      SELECT 
        aac.user_id,
        aac.auto_reactivate_minutes as config_timer,
        COUNT(adc.conversation_id) FILTER (WHERE adc.auto_reactivate_after_minutes IS NULL) as conversas_sem_timer,
        COUNT(adc.conversation_id) FILTER (WHERE adc.auto_reactivate_after_minutes IS NOT NULL) as conversas_com_timer
      FROM ai_agent_config aac
      JOIN whatsapp_connections wc ON wc.user_id = aac.user_id
      JOIN conversations c ON c.connection_id = wc.id
      JOIN agent_disabled_conversations adc ON adc.conversation_id = c.id
      WHERE aac.auto_reactivate_minutes IS NOT NULL
      GROUP BY aac.user_id, aac.auto_reactivate_minutes
      HAVING COUNT(adc.conversation_id) FILTER (WHERE adc.auto_reactivate_after_minutes IS NULL) > 0
      LIMIT 10
    `);
    
    if (mismatchResult.rows.length > 0) {
      console.log('⚠️  USUÁRIOS COM DISCREPÂNCIA (timer na config, mas conversas sem timer):');
      console.table(mismatchResult.rows);
    } else {
      console.log('✅ Nenhuma discrepância encontrada entre config e conversas.');
    }

    // 4. Verificar quando as conversas foram pausadas
    console.log('\n📋 4. ÚLTIMAS CONVERSAS PAUSADAS (todas)');
    console.log('─'.repeat(60));
    
    const recentPaused = await pool.query(`
      SELECT 
        adc.conversation_id,
        adc.auto_reactivate_after_minutes,
        adc.owner_last_reply_at,
        c.contact_name,
        aac.auto_reactivate_minutes as user_config_timer
      FROM agent_disabled_conversations adc
      JOIN conversations c ON c.id = adc.conversation_id
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      LEFT JOIN ai_agent_config aac ON aac.user_id = wc.user_id
      ORDER BY adc.owner_last_reply_at DESC
      LIMIT 10
    `);
    
    console.log('As 10 conversas mais recentemente pausadas:');
    for (const row of recentPaused.rows) {
      const configTimer = row.user_config_timer;
      const convTimer = row.auto_reactivate_after_minutes;
      const status = configTimer !== null && convTimer === null 
        ? '❌ TIMER NÃO HERDADO' 
        : convTimer === configTimer 
          ? '✅ OK' 
          : '⚠️ DIFERENTE';
      
      console.log(`\n  ${row.contact_name || 'Sem nome'}`);
      console.log(`     Config do usuário: ${configTimer ?? 'null'} min`);
      console.log(`     Timer na conversa: ${convTimer ?? 'null'} min`);
      console.log(`     Pausada em: ${row.owner_last_reply_at}`);
      console.log(`     Status: ${status}`);
    }

    // 5. Diagnóstico final
    console.log('\n📋 5. DIAGNÓSTICO FINAL');
    console.log('═'.repeat(60));
    
    const statsResult = await pool.query(`
      SELECT 
        COUNT(*) FILTER (
          WHERE aac.auto_reactivate_minutes IS NOT NULL 
            AND adc.auto_reactivate_after_minutes IS NULL
        ) as config_ok_conv_null,
        COUNT(*) FILTER (
          WHERE aac.auto_reactivate_minutes IS NOT NULL 
            AND adc.auto_reactivate_after_minutes IS NOT NULL
        ) as ambos_ok,
        COUNT(*) FILTER (
          WHERE aac.auto_reactivate_minutes IS NULL 
            AND adc.auto_reactivate_after_minutes IS NOT NULL
        ) as config_null_conv_ok
      FROM agent_disabled_conversations adc
      JOIN conversations c ON c.id = adc.conversation_id
      JOIN whatsapp_connections wc ON wc.id = c.connection_id
      LEFT JOIN ai_agent_config aac ON aac.user_id = wc.user_id
    `);
    
    const stats = statsResult.rows[0];
    console.log(`\n📊 Estatísticas de herança de timer:`);
    console.log(`   ❌ Config com timer, conversa SEM timer: ${stats.config_ok_conv_null}`);
    console.log(`   ✅ Ambos com timer (correto): ${stats.ambos_ok}`);
    console.log(`   ⚠️  Config SEM timer, conversa COM timer: ${stats.config_null_conv_ok}`);
    
    if (Number(stats.config_ok_conv_null) > 0) {
      console.log(`\n🔴 PROBLEMA CONFIRMADO: O timer NÃO está sendo herdado da config para a conversa!`);
      console.log(`   Isso significa que quando a conversa é pausada, o valor auto_reactivate_minutes`);
      console.log(`   do usuário NÃO está sendo passado para auto_reactivate_after_minutes da conversa.`);
      console.log(`\n   CAUSA PROVÁVEL:`);
      console.log(`   - O código getAgentConfig não está retornando autoReactivateMinutes`);
      console.log(`   - OU o valor está sendo passado como undefined/null incorretamente`);
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

main();
