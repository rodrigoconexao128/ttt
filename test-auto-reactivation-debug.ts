/**
 * 🔍 Script de Debug - Auto-Reativação IA
 * 
 * Este script verifica:
 * 1. Configuração do agente (autoReactivateMinutes)
 * 2. Conversas pausadas com timer ativo
 * 3. Por que a reativação não está funcionando
 */

import { Pool } from 'pg';
import 'dotenv/config';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║     🔍 DEBUG AUTO-REATIVAÇÃO IA - AGENTEZAP                   ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    // 1. Verificar configurações de agentes com auto_reactivate_minutes
    console.log('📋 1. CONFIGURAÇÕES DE AGENTES (ai_agent_config)');
    console.log('─'.repeat(60));
    
    const configsResult = await pool.query(`
      SELECT 
        user_id,
        pause_on_manual_reply,
        auto_reactivate_minutes,
        updated_at
      FROM ai_agent_config
      WHERE auto_reactivate_minutes IS NOT NULL
      ORDER BY updated_at DESC
      LIMIT 10
    `);
    
    if (configsResult.rows.length === 0) {
      console.log('⚠️  NENHUM AGENTE tem auto_reactivate_minutes configurado!');
      console.log('    Isso significa que a configuração NÃO está sendo salva.\n');
    } else {
      console.table(configsResult.rows);
    }

    // 2. Verificar TODAS configurações de agentes
    console.log('\n📋 2. TODAS CONFIGURAÇÕES (verificar se campo existe)');
    console.log('─'.repeat(60));
    
    const allConfigsResult = await pool.query(`
      SELECT 
        user_id,
        pause_on_manual_reply,
        auto_reactivate_minutes,
        updated_at
      FROM ai_agent_config
      ORDER BY updated_at DESC
      LIMIT 5
    `);
    console.table(allConfigsResult.rows);

    // 3. Verificar estrutura da tabela ai_agent_config
    console.log('\n📋 3. ESTRUTURA DA TABELA ai_agent_config');
    console.log('─'.repeat(60));
    
    const schemaResult = await pool.query(`
      SELECT column_name, data_type, column_default, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'ai_agent_config'
      ORDER BY ordinal_position
    `);
    console.table(schemaResult.rows);

    // 4. Verificar conversas pausadas
    console.log('\n📋 4. CONVERSAS PAUSADAS (agent_disabled_conversations)');
    console.log('─'.repeat(60));
    
    const disabledResult = await pool.query(`
      SELECT 
        conversation_id,
        owner_last_reply_at,
        auto_reactivate_after_minutes,
        client_has_pending_message,
        client_last_message_at,
        CASE 
          WHEN auto_reactivate_after_minutes IS NOT NULL AND owner_last_reply_at IS NOT NULL
          THEN owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval
          ELSE NULL
        END as reactivate_at,
        CASE 
          WHEN auto_reactivate_after_minutes IS NOT NULL 
               AND owner_last_reply_at IS NOT NULL
               AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
          THEN 'EXPIRADO'
          ELSE 'ATIVO'
        END as timer_status
      FROM agent_disabled_conversations
      ORDER BY owner_last_reply_at DESC
      LIMIT 10
    `);
    
    if (disabledResult.rows.length === 0) {
      console.log('✅ Nenhuma conversa pausada no momento.\n');
    } else {
      console.table(disabledResult.rows);
    }

    // 5. Verificar conversas PRONTAS para reativar
    console.log('\n📋 5. CONVERSAS PRONTAS PARA REATIVAR (timer expirado + mensagem pendente)');
    console.log('─'.repeat(60));
    
    const readyResult = await pool.query(`
      SELECT 
        conversation_id as "conversationId",
        client_last_message_at as "clientLastMessageAt",
        owner_last_reply_at,
        auto_reactivate_after_minutes,
        owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval as expires_at,
        NOW() as current_time
      FROM agent_disabled_conversations
      WHERE 
        auto_reactivate_after_minutes IS NOT NULL
        AND client_has_pending_message = true
        AND owner_last_reply_at IS NOT NULL
        AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
      LIMIT 10
    `);
    
    if (readyResult.rows.length === 0) {
      console.log('ℹ️  Nenhuma conversa pronta para reativar.\n');
      console.log('   Possíveis razões:');
      console.log('   - Timer ainda não expirou');
      console.log('   - Cliente não enviou mensagem pendente (client_has_pending_message = false)');
      console.log('   - auto_reactivate_after_minutes é NULL');
    } else {
      console.table(readyResult.rows);
    }

    // 6. Verificar se há conversas com timer mas SEM mensagem pendente
    console.log('\n📋 6. CONVERSAS COM TIMER MAS SEM MENSAGEM PENDENTE');
    console.log('─'.repeat(60));
    
    const noPendingResult = await pool.query(`
      SELECT 
        conversation_id,
        auto_reactivate_after_minutes,
        client_has_pending_message,
        owner_last_reply_at,
        owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval as expires_at
      FROM agent_disabled_conversations
      WHERE 
        auto_reactivate_after_minutes IS NOT NULL
        AND client_has_pending_message = false
      LIMIT 10
    `);
    
    if (noPendingResult.rows.length > 0) {
      console.log('⚠️  Estas conversas têm timer configurado mas cliente não enviou mensagem:');
      console.table(noPendingResult.rows);
      console.log('   👆 A IA NÃO vai reativar porque não há mensagem pendente para responder.\n');
    } else {
      console.log('✅ Todas conversas com timer têm mensagem pendente.\n');
    }

    // 7. Diagnóstico final
    console.log('\n📋 7. DIAGNÓSTICO RESUMIDO');
    console.log('═'.repeat(60));
    
    const stats = await pool.query(`
      SELECT 
        COUNT(*) as total_pausadas,
        COUNT(*) FILTER (WHERE auto_reactivate_after_minutes IS NOT NULL) as com_timer,
        COUNT(*) FILTER (WHERE client_has_pending_message = true) as com_msg_pendente,
        COUNT(*) FILTER (
          WHERE auto_reactivate_after_minutes IS NOT NULL
            AND client_has_pending_message = true
            AND owner_last_reply_at IS NOT NULL
            AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
        ) as prontas_reativar
      FROM agent_disabled_conversations
    `);
    
    const s = stats.rows[0];
    console.log(`📊 Total de conversas pausadas: ${s.total_pausadas}`);
    console.log(`⏰ Com timer configurado: ${s.com_timer}`);
    console.log(`💬 Com mensagem pendente: ${s.com_msg_pendente}`);
    console.log(`✅ Prontas para reativar: ${s.prontas_reativar}`);
    
    if (s.prontas_reativar > 0) {
      console.log('\n❌ PROBLEMA DETECTADO: Há conversas que DEVERIAM ter sido reativadas!');
      console.log('   O serviço autoReactivateService pode não estar rodando.');
    } else if (s.com_timer > 0 && s.com_msg_pendente === '0') {
      console.log('\n⚠️  ATENÇÃO: Timer configurado mas sem mensagem pendente.');
      console.log('   A IA só reativa SE o cliente enviar mensagem enquanto pausada.');
    } else if (s.com_timer === '0' && Number(s.total_pausadas) > 0) {
      console.log('\n⚠️  PROBLEMA: Conversas pausadas mas NENHUMA tem timer!');
      console.log('   O auto_reactivate_minutes NÃO está sendo gravado corretamente.');
    }

    console.log('\n');

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

main();
