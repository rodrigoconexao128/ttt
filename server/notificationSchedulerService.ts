/**
 * 🔔 SERVIÇO DE NOTIFICAÇÕES AGENDADAS - VERSÃO PROFISSIONAL
 * 
 * Responsável por verificar e enviar notificações automáticas:
 * - Lembretes de pagamento (X dias antes do vencimento)
 * - Notificações de atraso (X dias após vencimento)
 * - Check-ins periódicos (a cada X dias)
 * - Alertas de WhatsApp desconectado (após X horas)
 * - Broadcasts programados
 * - ✅ NOVO: Verificação e downgrade de planos vencidos
 * 
 * ✅ FUNCIONA MESMO COM WHATSAPP DESCONECTADO (verifica antes de enviar)
 * ✅ GERA MENSAGEM ÚNICA POR CLIENTE COM IA (anti-detecção de bot)
 * ✅ DELAY HUMANO ENTRE MENSAGENS (3-10 segundos)
 * ✅ DELAY ENTRE LOTES (30-60 segundos a cada 15-25 mensagens)
 * ✅ LIMITE DIÁRIO (máximo 500 notificações por admin/dia)
 * ✅ RETRY COM BACKOFF EXPONENCIAL
 * 
 * NÃO é um chatbot - apenas envia mensagens informativas
 */

import crypto from "crypto";
import { storage } from "./storage";
import { sendAdminNotification } from "./whatsapp";
import { callGroq } from "./llm";
import { db } from "./db";
import { sql } from "drizzle-orm";

interface NotificationJob {
  type: 'payment_reminder' | 'overdue_reminder' | 'periodic_checkin' | 'disconnected_alert';
  adminId: string;
  userId: string;
  phone: string;
  userName: string;
  data: any;
}

// Executar a cada 5 minutos para processar notificações agendadas mais rapidamente
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Limites anti-bloqueio
const DAILY_NOTIFICATION_LIMIT = 500; // Máximo de notificações por admin por dia
const BATCH_SIZE_MIN = 15; // Tamanho mínimo de lote
const BATCH_SIZE_MAX = 25; // Tamanho máximo de lote
const BATCH_DELAY_MIN_MS = 30000; // 30 segundos entre lotes
const BATCH_DELAY_MAX_MS = 60000; // 60 segundos entre lotes

let schedulerInterval: NodeJS.Timeout | null = null;

// Cache de contadores diários (resetado à meia-noite)
const dailyCounters: Map<string, { count: number; date: string }> = new Map();

/**
 * Inicia o scheduler de notificações
 */
export function startNotificationScheduler(): void {
  if (schedulerInterval) {
    console.log('🔔 [NOTIFICATION SCHEDULER] Já está rodando');
    return;
  }

  console.log('🔔 [NOTIFICATION SCHEDULER] Iniciando...');
  
  // Executar imediatamente e depois a cada intervalo
  processNotifications();
  schedulerInterval = setInterval(processNotifications, CHECK_INTERVAL_MS);
}

/**
 * Para o scheduler de notificações
 */
export function stopNotificationScheduler(): void {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('🔔 [NOTIFICATION SCHEDULER] Parado');
  }
}

/**
 * Processa todas as notificações pendentes
 */
async function processNotifications(): Promise<void> {
  try {
    console.log('🔔 [NOTIFICATION SCHEDULER] Verificando notificações...');

    // ✅ Limpar contadores antigos
    cleanOldCounters();

    // ✅ NOVO: Verificar e atualizar planos vencidos automaticamente
    await processExpiredSubscriptions();

    // ✅ PRIMEIRO: Processar fila de scheduled_notifications
    await processScheduledNotificationsQueue();

    // Buscar todos os admins com notificações habilitadas
    const configs = await getActiveNotificationConfigs();
    
    for (const config of configs) {
      await processAdminNotifications(config);
    }

    console.log(`🔔 [NOTIFICATION SCHEDULER] Processamento concluído (${configs.length} admins)`);
  } catch (error) {
    console.error('🔔 [NOTIFICATION SCHEDULER] Erro:', error);
  }
}

// 🔒 Lock para evitar processamento duplicado
let isQueueProcessing = false;

/**
 * ✅ PROCESSA FILA DE NOTIFICAÇÕES AGENDADAS (scheduled_notifications)
 * Esta função processa todas as notificações com scheduled_for <= NOW() e status = 'pending'
 * Usa delays anti-banimento e variação IA
 * 
 * 🔒 CORREÇÃO BUG DUPLICATAS:
 * - Lock global para evitar execuções paralelas
 * - Marca notificações como 'processing' ANTES de buscar
 * - Verifica se já foi enviada para o mesmo cliente recentemente
 */
async function processScheduledNotificationsQueue(): Promise<void> {
  // 🔒 Verificar lock - evitar processamento paralelo
  if (isQueueProcessing) {
    console.log('📋 [QUEUE SCHEDULER] ⏳ Já existe processamento em andamento, ignorando...');
    return;
  }
  
  isQueueProcessing = true;
  
  try {
    console.log('📋 [QUEUE SCHEDULER] Buscando notificações pendentes...');
    
    // ✅ PRIMEIRO: Marcar como 'processing' para evitar duplicatas
    // Usa FOR UPDATE SKIP LOCKED para evitar race conditions entre processos
    const claimResult = await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'processing', updated_at = NOW()
      WHERE id IN (
        SELECT id FROM scheduled_notifications
        WHERE status = 'pending'
          AND scheduled_for <= NOW()
        ORDER BY scheduled_for ASC
        LIMIT 50
        FOR UPDATE SKIP LOCKED
      )
      RETURNING id
    `);
    
    const claimedIds = (claimResult.rows as any[]).map(r => r.id);
    
    if (claimedIds.length === 0) {
      console.log('📋 [QUEUE SCHEDULER] Nenhuma notificação pendente para processar');
      return;
    }
    
    console.log(`📋 [QUEUE SCHEDULER] Reivindicou ${claimedIds.length} notificações para processamento`);
    
    // Buscar os dados completos das notificações reivindicadas
    // ✅ CORREÇÃO: Usar sql.raw() para strings literais no template SQL
    // O id é VARCHAR, não UUID - usar cast para text[]
    const idsArrayStr = `'{${claimedIds.join(',')}}'`;
    const pendingResult = await db.execute(sql`
      SELECT sn.*, anc.admin_id as config_admin_id,
             anc.respect_business_hours,
             anc.business_hours_start,
             anc.business_hours_end,
             anc.business_days,
             anc.ai_variation_enabled,
             anc.ai_variation_prompt,
             anc.broadcast_min_interval_seconds,
             anc.broadcast_max_interval_seconds
      FROM scheduled_notifications sn
      LEFT JOIN admin_notification_config anc ON anc.admin_id = sn.admin_id
      WHERE sn.id = ANY(${sql.raw(idsArrayStr)}::text[])
      ORDER BY sn.scheduled_for ASC
    `);
    
    const pendingNotifications = pendingResult.rows as any[];
    
    // Agrupar por admin para verificar conexão uma vez
    const adminGroups = new Map<string, any[]>();
    for (const notification of pendingNotifications) {
      const adminId = notification.admin_id;
      if (!adminGroups.has(adminId)) {
        adminGroups.set(adminId, []);
      }
      adminGroups.get(adminId)!.push(notification);
    }
    
    // Processar cada admin
    for (const [adminId, notifications] of adminGroups) {
      await processAdminScheduledQueue(adminId, notifications);
    }
    
    // ✅ Reverter notificações que não foram processadas (ainda em 'processing')
    // Usando sql.raw() para strings literais no template SQL
    // O id é VARCHAR, não UUID - usar cast para text[]
    const revertIdsArrayStr = `'{${claimedIds.join(',')}}'`;
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE id = ANY(${sql.raw(revertIdsArrayStr)}::text[])
        AND status = 'processing'
    `);
    
  } catch (error) {
    console.error('📋 [QUEUE SCHEDULER] Erro ao processar fila:', error);
    
    // Em caso de erro, reverter todas para 'pending'
    await db.execute(sql`
      UPDATE scheduled_notifications
      SET status = 'pending', updated_at = NOW()
      WHERE status = 'processing'
    `).catch(e => console.error('Erro ao reverter status:', e));
    
  } finally {
    // 🔓 Liberar lock
    isQueueProcessing = false;
  }
}

/**
 * Processa notificações agendadas de um admin específico
 */
async function processAdminScheduledQueue(adminId: string, notifications: any[]): Promise<void> {
  try {
    // Verificar conexão WhatsApp
    const connectionResult = await db.execute(sql`
      SELECT * FROM admin_whatsapp_connection WHERE admin_id = ${adminId} AND is_connected = true
    `);
    
    if (!connectionResult.rows?.length) {
      console.log(`⚠️ [${adminId}] WhatsApp desconectado - adiando ${notifications.length} notificações`);
      return;
    }
    
    // Pegar config da primeira notificação (já incluído no JOIN)
    const config = notifications[0];
    
    // Verificar horário comercial se habilitado
    if (config?.respect_business_hours) {
      const businessConfig = {
        business_hours_start: config.business_hours_start,
        business_hours_end: config.business_hours_end,
        business_days: config.business_days
      };
      
      if (!isWithinBusinessHours(businessConfig)) {
        console.log(`⏰ [${adminId}] Fora do horário comercial - adiando ${notifications.length} notificações`);
        return;
      }
    }
    
    // ✅ CONFIGS ANTI-BAN MELHORADAS
    // Delays maiores para evitar detecção de broadcast
    const minDelay = Math.max(config?.broadcast_min_interval_seconds || 30, 30); // MÍNIMO 30s
    const maxDelay = Math.max(config?.broadcast_max_interval_seconds || 60, 60); // MÍNIMO 60s
    const batchSize = 5; // Reduzido de 10 para 5
    const batchPauseSeconds = 300; // 5 MINUTOS de pausa entre lotes (era 60s)
    
    let processed = 0;
    let failed = 0;
    let skipped = 0;
    
    for (let i = 0; i < notifications.length; i++) {
      const notification = notifications[i];
      
      // Verificar limite diário
      if (!canSendNotification(adminId)) {
        console.log(`🚫 [${adminId}] Limite diário atingido - parando processamento`);
        break;
      }
      
      // ✅ VERIFICAÇÃO ANTI-DUPLICATA: Verificar se já enviou para este telefone recentemente (últimas 4h)
      try {
        const recentSendResult = await db.execute(sql`
          SELECT COUNT(*) as count FROM admin_notification_logs
          WHERE admin_id = ${adminId}
            AND recipient_phone = ${notification.recipient_phone}
            AND notification_type = ${notification.notification_type}
            AND status = 'sent'
            AND created_at >= NOW() - INTERVAL '4 hours'
        `);
        
        const recentCount = parseInt((recentSendResult.rows[0] as any)?.count || '0', 10);
        
        if (recentCount > 0) {
          console.log(`📋 [QUEUE] ⏭️ PULANDO ${notification.recipient_name} - já recebeu ${notification.notification_type} nas últimas 4h (${recentCount}x)`);
          skipped++;
          
          // Marcar como sent para não reprocessar
          await db.execute(sql`
            UPDATE scheduled_notifications 
            SET status = 'skipped_duplicate', updated_at = NOW()
            WHERE id = ${notification.id}
          `);
          continue;
        }
      } catch (dupCheckErr) {
        console.error('Erro ao verificar duplicata:', dupCheckErr);
      }
      
      try {
        // Buscar histórico de conversa para contexto
        let conversationHistory = '';
        try {
          const historyResult = await db.execute(sql`
            SELECT am.text, am.from_me
            FROM admin_messages am
            INNER JOIN admin_conversations ac ON am.conversation_id = ac.id
            WHERE ac.admin_id = ${adminId}
            AND (ac.contact_number LIKE ${'%' + notification.recipient_phone.slice(-8)} OR ac.contact_number LIKE ${notification.recipient_phone + '%'})
            ORDER BY am.timestamp DESC
            LIMIT 10
          `);
          
          conversationHistory = (historyResult.rows as any[]).reverse().map(msg => 
            `${msg.from_me ? 'Você' : 'Cliente'}: ${msg.text}`
          ).join('\n');
        } catch (histErr) {
          // Ignorar erro de histórico
        }
        
        // Preparar mensagem com variáveis
        const metadata = typeof notification.metadata === 'string' 
          ? JSON.parse(notification.metadata || '{}') 
          : notification.metadata || {};
          
        let finalMessage = notification.message_template
          .replace(/{cliente_nome}/g, notification.recipient_name || 'Cliente')
          .replace(/{dias_restantes}/g, metadata.daysBefore || '')
          .replace(/{dias_atraso}/g, metadata.daysOverdue || metadata.daysAfter || '')
          .replace(/{data_vencimento}/g, metadata.dueDate ? 
            new Date(metadata.dueDate).toLocaleDateString('pt-BR') : '')
          .replace(/{valor}/g, metadata.valor || '');
        
        // Aplicar variação IA se habilitada
        if (notification.ai_enabled) {
          try {
            let systemPrompt = notification.ai_prompt || config?.ai_variation_prompt || 
              'Reescreva esta mensagem de forma natural e personalizada.';
            
            // Adicionar contexto do cliente
            systemPrompt += `\n\nO nome do cliente é: ${notification.recipient_name || 'Cliente'}`;
            
            if (conversationHistory) {
              systemPrompt += `\n\nHISTÓRICO DA CONVERSA COM ESTE CLIENTE:\n---\n${conversationHistory}\n---\n\nUse este contexto para personalizar a mensagem de forma natural.`;
            }
            
            systemPrompt += '\n\nIMPORTANTE: Retorne APENAS a mensagem reescrita, sem explicações, aspas ou marcadores.';
            
            // ✅ CORRIGIDO: Usar array de ChatMessage ao invés de string
            const variedMessage = await callGroq(
              [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: finalMessage }
              ],
              { temperature: 0.8, maxTokens: 500 }
            );
            
            // ✅ PROTEÇÃO REFORÇADA: Verificar se retornou mensagem válida (não genérica)
            const trimmedVaried = variedMessage.trim();
            const isGenericMessage = 
              !trimmedVaried ||
              trimmedVaried.length < 20 ||
              trimmedVaried.toLowerCase().includes('como posso ajudar') ||
              trimmedVaried.toLowerCase().includes('olá! como posso') ||
              trimmedVaried.toLowerCase().includes('em que posso ajudar') ||
              trimmedVaried.toLowerCase().includes('posso te ajudar') ||
              trimmedVaried === 'Olá!' ||
              trimmedVaried === 'Oi!' ||
              !trimmedVaried.includes(notification.recipient_name?.split(' ')[0] || '');
            
            if (!isGenericMessage) {
              finalMessage = trimmedVaried;
              console.log(`📋 [QUEUE] ✅ IA variou mensagem para ${notification.recipient_name}`);
            } else {
              console.log(`📋 [QUEUE] ⚠️ IA retornou mensagem genérica: "${trimmedVaried.substring(0, 50)}...", usando ORIGINAL para ${notification.recipient_name}`);
              // Manter finalMessage original - NÃO ALTERAR
            }
          } catch (aiError) {
            console.error(`📋 [QUEUE] ❌ Erro IA para ${notification.recipient_name}:`, aiError);
            // Continuar com mensagem original se IA falhar
          }
        }
        
        // Enviar mensagem
        const sendResult = await sendAdminNotification(adminId, notification.recipient_phone, finalMessage);
        const sent = sendResult.success;
        const errorMsg = sendResult.error || 'Falha desconhecida';
        
        if (sent) {
          processed++;
          incrementDailyCounter(adminId);
          console.log(`📋 [QUEUE] ✓ Enviado para ${notification.recipient_name} (${processed}/${notifications.length})`);
        } else {
          failed++;
          console.log(`📋 [QUEUE] ✗ Falha ao enviar para ${notification.recipient_name}: ${errorMsg}`);
        }
        
        // Atualizar status da notificação
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET 
            status = ${sent ? 'sent' : 'failed'},
            sent_at = NOW(),
            final_message = ${finalMessage},
            conversation_context = ${conversationHistory || ''},
            error_message = ${sent ? null : errorMsg}
          WHERE id = ${notification.id}
        `);
        
        // Registrar log
        await db.execute(sql`
          INSERT INTO admin_notification_logs (
            admin_id, user_id, notification_type, recipient_phone, recipient_name,
            message_original, message_sent, status, metadata, created_at, sent_at, error_message
          ) VALUES (
            ${adminId}, ${notification.user_id}, ${notification.notification_type},
            ${notification.recipient_phone}, ${notification.recipient_name},
            ${notification.message_template}, ${finalMessage}, ${sent ? 'sent' : 'failed'},
            ${typeof notification.metadata === 'string' ? notification.metadata : JSON.stringify(notification.metadata)}::jsonb, NOW(), NOW(),
            ${sent ? null : errorMsg}
          )
        `);
        
        // DELAY ENTRE MENSAGENS (anti-ban) - SEMPRE USAR
        const delay = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
        
        // Pausa maior a cada lote de 10
        if ((i + 1) % batchSize === 0 && i + 1 < notifications.length) {
          console.log(`📋 [QUEUE] Pausa de ${batchPauseSeconds}s após lote de ${batchSize} mensagens...`);
          await new Promise(resolve => setTimeout(resolve, batchPauseSeconds * 1000));
        } else if (i + 1 < notifications.length) {
          console.log(`📋 [QUEUE] Aguardando ${delay}s antes da próxima mensagem...`);
          await new Promise(resolve => setTimeout(resolve, delay * 1000));
        }
        
      } catch (error) {
        console.error(`📋 [QUEUE] Erro processando ${notification.recipient_name}:`, error);
        failed++;
        await db.execute(sql`
          UPDATE scheduled_notifications 
          SET status = 'failed', error_message = ${String(error)}
          WHERE id = ${notification.id}
        `);
      }
    }
    
    console.log(`📋 [QUEUE] Admin ${adminId}: ${processed} enviados, ${failed} falhas, ${skipped} pulados (duplicatas)`);
    
  } catch (error) {
    console.error(`📋 [QUEUE] Erro ao processar admin ${adminId}:`, error);
  }
}

/**
 * Busca configurações de notificação ativas
 */
async function getActiveNotificationConfigs(): Promise<any[]> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM admin_notification_config 
      WHERE payment_reminder_enabled = true 
         OR overdue_reminder_enabled = true 
         OR periodic_checkin_enabled = true
         OR disconnected_alert_enabled = true
    `);
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar configs de notificação:', error);
    return [];
  }
}

/**
 * Processa notificações para um admin específico
 */
async function processAdminNotifications(config: any): Promise<void> {
  const adminId = config.admin_id;
  
  try {
    // Verificar horário comercial
    if (config.respect_business_hours && !isWithinBusinessHours(config)) {
      console.log(`🔔 [${adminId}] Fora do horário comercial, pulando...`);
      return;
    }

    // Buscar usuários do admin
    const users = await getAdminUsers(adminId);
    
    for (const user of users) {
      // Verificar se WhatsApp está desconectado
      if (config.disconnected_alert_enabled) {
        await checkDisconnectedAlert(config, user);
      }

      // Verificar lembretes de pagamento
      if (config.payment_reminder_enabled && user.planExpiresAt) {
        await checkPaymentReminder(config, user);
      }

      // Verificar notificações de atraso
      if (config.overdue_reminder_enabled && user.planExpiresAt) {
        await checkOverdueReminder(config, user);
      }

      // Verificar check-in periódico
      if (config.periodic_checkin_enabled) {
        await checkPeriodicCheckin(config, user);
      }
    }
  } catch (error) {
    console.error(`🔔 [${adminId}] Erro ao processar notificações:`, error);
  }
}

/**
 * Verifica se está dentro do horário comercial
 */
function isWithinBusinessHours(config: any): boolean {
  // Usar fuso horário de Brasília para verificar horário comercial
  const now = new Date();
  const options = { timeZone: 'America/Sao_Paulo' };
  
  // Obter dia da semana em Brasília
  const dayOfWeek = new Date(now.toLocaleString('en-US', options)).getDay(); // 0 = domingo, 6 = sábado
  
  // Obter hora atual em Brasília no formato HH:MM
  const currentTime = now.toLocaleTimeString('pt-BR', { 
    timeZone: 'America/Sao_Paulo', 
    hour: '2-digit', 
    minute: '2-digit', 
    hour12: false 
  });

  // Verificar dia da semana
  const businessDays = config.business_days || [1, 2, 3, 4, 5];
  if (!businessDays.includes(dayOfWeek)) {
    console.log(`⏰ [BUSINESS HOURS] Dia ${dayOfWeek} não está nos dias comerciais: ${businessDays}`);
    return false;
  }

  // Verificar horário
  const startTime = (config.business_hours_start || '09:00').slice(0, 5);
  const endTime = (config.business_hours_end || '18:00').slice(0, 5);
  
  const isWithin = currentTime >= startTime && currentTime <= endTime;
  console.log(`⏰ [BUSINESS HOURS] Hora atual BRT: ${currentTime}, Comercial: ${startTime}-${endTime}, Permitido: ${isWithin}`);
  
  return isWithin;
}

/**
 * Busca usuários de um admin
 */
async function getAdminUsers(adminId: string): Promise<any[]> {
  try {
    const result = await db.execute(sql`
      SELECT 
        u.id,
        u.phone,
        u.name,
        u.whatsapp_connected,
        u.whatsapp_disconnected_at,
        s.expires_at as plan_expires_at,
        s.status as subscription_status
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id
      WHERE u.id = ${adminId}
         OR u.parent_id = ${adminId}
      ORDER BY u.created_at DESC
    `);
    return result.rows;
  } catch (error) {
    console.error('Erro ao buscar usuários do admin:', error);
    return [];
  }
}

/**
 * Verifica alerta de WhatsApp desconectado
 */
async function checkDisconnectedAlert(config: any, user: any): Promise<void> {
  if (user.whatsapp_connected) return;

  const disconnectedAt = user.whatsapp_disconnected_at ? new Date(user.whatsapp_disconnected_at) : null;
  if (!disconnectedAt) return;

  const hoursDisconnected = (Date.now() - disconnectedAt.getTime()) / (1000 * 60 * 60);
  const alertHours = config.disconnected_alert_hours || 2;

  if (hoursDisconnected >= alertHours) {
    // ✅ CORRIGIDO: Verificar usando 'disconnected' (tipo real usado nos logs)
    // Antes usava 'disconnected_alert' que nunca encontrava nos logs
    const recentlySent = await wasNotificationSentRecently(
      config.admin_id,
      user.id,
      'disconnected', // ✅ Tipo correto
      24
    );

    if (!recentlySent) {
      // ✅ CORRIGIDO: Usar 'disconnected' para consistência com a fila
      await sendNotification(config, user, 'disconnected', {
        hoursDisconnected: Math.floor(hoursDisconnected),
      });
    }
  }
}

/**
 * Verifica lembrete de pagamento
 */
async function checkPaymentReminder(config: any, user: any): Promise<void> {
  const expiresAt = new Date(user.plan_expires_at);
  const daysUntilExpiration = Math.ceil((expiresAt.getTime() - Date.now()) / (1000 * 60 * 60 * 24));

  const reminderDays = config.payment_reminder_days_before || [7, 3, 1];
  
  for (const days of reminderDays) {
    if (daysUntilExpiration === days) {
      // ✅ CORRIGIDO: Usar 'payment_reminder' (tipo real usado nos logs e fila)
      const recentlySent = await wasNotificationSentRecently(
        config.admin_id,
        user.id,
        'payment_reminder', // ✅ Tipo correto sem sufixo
        48 // Não reenviar se já enviou nas últimas 48h
      );

      if (!recentlySent) {
        await sendNotification(config, user, 'payment_reminder', {
          daysUntilExpiration: days,
          expirationDate: expiresAt.toLocaleDateString('pt-BR'),
        });
        break; // Enviar apenas um lembrete por vez
      }
    }
  }
}

/**
 * Verifica notificação de atraso
 */
async function checkOverdueReminder(config: any, user: any): Promise<void> {
  const expiresAt = new Date(user.plan_expires_at);
  const daysOverdue = Math.ceil((Date.now() - expiresAt.getTime()) / (1000 * 60 * 60 * 24));

  if (daysOverdue <= 0) return; // Plano ainda válido

  const overdueReminderDays = config.overdue_reminder_days_after || [1, 3, 7, 14];
  
  for (const days of overdueReminderDays) {
    if (daysOverdue === days) {
      // ✅ CORRIGIDO: Usar 'overdue_reminder' (tipo real usado nos logs e fila)
      const recentlySent = await wasNotificationSentRecently(
        config.admin_id,
        user.id,
        'overdue_reminder', // ✅ Tipo correto sem sufixo
        48
      );

      if (!recentlySent) {
        await sendNotification(config, user, 'overdue_reminder', {
          daysOverdue: days,
          expirationDate: expiresAt.toLocaleDateString('pt-BR'),
        });
        break;
      }
    }
  }
}

/**
 * Verifica check-in periódico
 */
async function checkPeriodicCheckin(config: any, user: any): Promise<void> {
  // Buscar última interação
  const lastLog = await getLastNotificationLog(config.admin_id, user.id, 'periodic_checkin');
  
  const minDays = config.periodic_checkin_min_days || 7;
  const maxDays = config.periodic_checkin_max_days || 15;
  
  // Escolher intervalo aleatório entre min e max
  const randomInterval = Math.floor(Math.random() * (maxDays - minDays + 1)) + minDays;
  
  if (!lastLog) {
    // Primeira vez - enviar após intervalo mínimo
    await sendNotification(config, user, 'periodic_checkin', {
      randomInterval,
    });
  } else {
    const daysSinceLastCheckin = Math.ceil(
      (Date.now() - new Date(lastLog.created_at).getTime()) / (1000 * 60 * 60 * 24)
    );

    if (daysSinceLastCheckin >= randomInterval) {
      await sendNotification(config, user, 'periodic_checkin', {
        daysSinceLastCheckin,
        randomInterval,
      });
    }
  }
}

/**
 * Envia uma notificação COM VERIFICAÇÃO DE SESSÃO E RETRY
 */
async function sendNotification(
  config: any,
  user: any,
  type: string,
  data: any
): Promise<void> {
  try {
    // ✅ VERIFICAR SE ADMIN TEM SESSÃO WHATSAPP ATIVA
    const { getAdminSession } = await import("./whatsapp");
    const adminSession = getAdminSession(config.admin_id);
    
    if (!adminSession || !adminSession.socket?.user) {
      console.log(`⚠️ [${config.admin_id}] WhatsApp desconectado - pulando notificação`);
      
      // Registrar falha por WhatsApp offline
      await storage.createAdminNotificationLog?.({
        adminId: config.admin_id,
        userId: user.id,
        notificationType: type,
        recipientPhone: user.phone,
        recipientName: user.name,
        messageSent: '',
        messageOriginal: '',
        status: 'failed',
        errorMessage: 'WhatsApp do admin desconectado',
        metadata: data,
      });
      
      return;
    }

    // ✅ VERIFICAR LIMITE DIÁRIO
    if (!canSendNotification(config.admin_id)) {
      console.log(`🚫 [${config.admin_id}] Limite diário atingido (${DAILY_NOTIFICATION_LIMIT}/dia)`);
      return;
    }

    // Selecionar template
    let template = '';
    switch (type) {
      case 'payment_reminder':
        template = config.payment_reminder_message_template || '';
        break;
      case 'overdue_reminder':
        template = config.overdue_reminder_message_template || '';
        break;
      case 'periodic_checkin':
        template = config.periodic_checkin_message_template || '';
        break;
      case 'disconnected':  // ✅ CORRIGIDO: Aceita 'disconnected' (tipo padronizado)
      case 'disconnected_alert':  // Mantém retrocompatibilidade
        template = config.disconnected_alert_message_template || '';
        break;
    }

    if (!template) {
      console.log(`🔔 Template vazio para ${type}, pulando...`);
      return;
    }

    // Substituir variáveis
    let message = template
      .replace(/\{nome\}/g, user.name || 'Cliente')
      .replace(/\{dias\}/g, data.daysUntilExpiration || data.daysOverdue || data.daysSinceLastCheckin || '')
      .replace(/\{data\}/g, data.expirationDate || '')
      .replace(/\{horas\}/g, data.hoursDisconnected || '');

    // ✅ APLICAR VARIAÇÃO COM IA SE HABILITADO (anti-bot)
    if (config.ai_variation_enabled) {
      message = await applyAIVariation(message, config.ai_variation_prompt, user.name);
    }

    // ✅ ENVIAR COM RETRY (até 3 tentativas com backoff exponencial)
    let result = { success: false, error: '' };
    for (let attempt = 1; attempt <= 3; attempt++) {
      result = await sendAdminNotification(config.admin_id, user.phone, message);
      
      if (result.success) break;
      
      // Backoff exponencial: 2s, 4s, 8s
      if (attempt < 3) {
        const backoffMs = Math.pow(2, attempt) * 1000;
        console.log(`⏳ [${config.admin_id}] Tentativa ${attempt} falhou, aguardando ${backoffMs}ms...`);
        await new Promise(resolve => setTimeout(resolve, backoffMs));
      }
    }

    // Registrar log
    await storage.createAdminNotificationLog?.({
      adminId: config.admin_id,
      userId: user.id,
      notificationType: type,
      recipientPhone: user.phone,
      recipientName: user.name,
      messageSent: message,
      messageOriginal: template,
      status: result.success ? 'sent' : 'failed',
      errorMessage: result.error,
      metadata: {
        ...data,
        aiVariationUsed: config.ai_variation_enabled,
      },
    });

    if (result.success) {
      // Incrementar contador diário
      incrementDailyCounter(config.admin_id);
      console.log(`✅ [${config.admin_id}] ${type} enviado para ${user.phone}`);
    } else {
      console.error(`❌ [${config.admin_id}] Falha ao enviar ${type} após 3 tentativas:`, result.error);
    }
  } catch (error) {
    console.error(`🔔 Erro ao enviar notificação ${type}:`, error);
  }
}

/**
 * ✅ APLICA VARIAÇÃO COM IA NA MENSAGEM - GERA MENSAGEM ÚNICA PARA CADA CLIENTE
 * Isso evita detecção de bot pelo WhatsApp
 */
async function applyAIVariation(message: string, customPrompt?: string, clientName?: string): Promise<string> {
  try {
    const prompt = customPrompt || 
      `Reescreva esta mensagem mantendo o mesmo significado mas com palavras e estrutura diferentes.
      Mantenha tom profissional e cordial.
      Varie saudações, conectivos e expressões.
      ${clientName ? `O nome do cliente é ${clientName}.` : ''}
      Retorne APENAS a mensagem reescrita, sem explicações ou aspas.`;

    const result = await callGroq([
      { role: 'system', content: prompt },
      { role: 'user', content: message },
    ], {
      // Usa modelo do banco de dados via config
      temperature: 0.8, // Alta temperatura para máxima variação
      max_tokens: 300,
    });

    const trimmedResult = result.trim();
    
    // ✅ PROTEÇÃO REFORÇADA contra mensagens genéricas
    const isGenericMessage = 
      !trimmedResult ||
      trimmedResult.length < 20 ||
      trimmedResult.toLowerCase().includes('como posso ajudar') ||
      trimmedResult.toLowerCase().includes('olá! como posso') ||
      trimmedResult.toLowerCase().includes('em que posso ajudar') ||
      trimmedResult.toLowerCase().includes('posso te ajudar') ||
      trimmedResult === 'Olá!' ||
      trimmedResult === 'Oi!';
    
    if (isGenericMessage) {
      console.log(`⚠️ [AI VARIATION] Mensagem genérica detectada, usando original: "${trimmedResult.substring(0, 30)}..."`);
      return message; // Retornar mensagem original
    }

    return trimmedResult;
  } catch (error) {
    console.error('⚠️ Erro ao aplicar variação IA:', error);
    return message; // Retornar mensagem original se falhar
  }
}

/**
 * ✅ VERIFICA SE PODE ENVIAR NOTIFICAÇÃO (limite diário)
 */
function canSendNotification(adminId: string): boolean {
  const today = new Date().toISOString().split('T')[0];
  const key = `${adminId}_${today}`;
  
  const counter = dailyCounters.get(key);
  
  if (!counter || counter.date !== today) {
    // Novo dia ou primeiro envio
    return true;
  }
  
  return counter.count < DAILY_NOTIFICATION_LIMIT;
}

/**
 * ✅ INCREMENTA CONTADOR DIÁRIO
 */
function incrementDailyCounter(adminId: string): void {
  const today = new Date().toISOString().split('T')[0];
  const key = `${adminId}_${today}`;
  
  const counter = dailyCounters.get(key);
  
  if (!counter || counter.date !== today) {
    dailyCounters.set(key, { count: 1, date: today });
  } else {
    counter.count++;
  }
}

/**
 * ✅ LIMPA CONTADORES ANTIGOS (executar diariamente)
 */
function cleanOldCounters(): void {
  const today = new Date().toISOString().split('T')[0];
  
  for (const [key, counter] of dailyCounters.entries()) {
    if (counter.date !== today) {
      dailyCounters.delete(key);
    }
  }
}

/**
 * Verifica se uma notificação foi enviada recentemente
 */
async function wasNotificationSentRecently(
  adminId: string,
  userId: string,
  notificationType: string,
  hoursAgo: number
): Promise<boolean> {
  try {
    const cutoffTime = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    
    const result = await db.execute(sql`
      SELECT COUNT(*) as count FROM admin_notification_logs
      WHERE admin_id = ${adminId}
        AND user_id = ${userId}
        AND notification_type = ${notificationType}
        AND created_at >= ${cutoffTime.toISOString()}
        AND status = 'sent'
      LIMIT 1
    `);

    return (result.rows[0]?.count || 0) > 0;
  } catch (error) {
    console.error('Erro ao verificar notificação recente:', error);
    return false;
  }
}

/**
 * Busca último log de notificação
 */
async function getLastNotificationLog(
  adminId: string,
  userId: string,
  notificationType: string
): Promise<any | null> {
  try {
    const result = await db.execute(sql`
      SELECT * FROM admin_notification_logs
      WHERE admin_id = ${adminId}
        AND user_id = ${userId}
        AND notification_type = ${notificationType}
        AND status = 'sent'
      ORDER BY created_at DESC
      LIMIT 1
    `);

    return result.rows[0] || null;
  } catch (error) {
    console.error('Erro ao buscar último log:', error);
    return null;
  }
}

/**
 * 📦 VERIFICA E ATUALIZA PLANOS VENCIDOS AUTOMATICAMENTE
 * 
 * Esta função é executada periodicamente para:
 * 1. Encontrar subscriptions com status='active' mas data_fim < NOW()
 * 2. Marcar essas subscriptions como 'expired'
 * 3. Logar as alterações para auditoria
 * 
 * IMPORTANTE: Clientes com plano vencido voltam ao limite de 25 mensagens de teste
 * A verificação de limite é feita no whatsapp.ts ao processar mensagens
 */
export async function processExpiredSubscriptions(): Promise<void> {
  try {
    console.log('📦 [SUBSCRIPTION CHECKER] Verificando planos vencidos...');
    
    // Buscar subscriptions que estão active mas com data_fim no passado
    // Adicionar período de carência de 5 dias para pagamentos recorrentes
    const result = await db.execute(sql`
      UPDATE subscriptions
      SET status = 'expired', updated_at = NOW()
      WHERE status = 'active'
        AND data_fim IS NOT NULL
        AND data_fim < NOW()
        AND (
          -- Se não é pagamento recorrente, expira imediatamente
          next_payment_date IS NULL
          OR
          -- Se é recorrente, dá 5 dias de carência após next_payment_date
          next_payment_date + INTERVAL '5 days' < NOW()
        )
      RETURNING id, user_id, data_fim, plan_id
    `);
    
    const expiredSubs = result.rows as any[];
    
    if (expiredSubs.length > 0) {
      console.log(`📦 [SUBSCRIPTION CHECKER] ⚠️ ${expiredSubs.length} plano(s) marcado(s) como expirado(s):`);
      
      for (const sub of expiredSubs) {
        console.log(`   - Subscription ${sub.id}: User ${sub.user_id}, venceu em ${sub.data_fim}`);
        
        // Logar para auditoria
        try {
          await db.execute(sql`
            INSERT INTO admin_notification_logs (
              id, admin_id, user_id, client_phone, 
              notification_type, message_content, status, created_at
            ) VALUES (
              ${crypto.randomUUID()},
              ${sub.user_id},
              ${sub.user_id},
              'SYSTEM',
              'subscription_expired',
              ${'Plano expirado automaticamente. data_fim: ' + sub.data_fim + '. Cliente volta ao limite de 25 mensagens de teste.'},
              'sent',
              NOW()
            )
          `);
        } catch (logError) {
          console.error('Erro ao logar expiração:', logError);
        }
      }
    } else {
      console.log('📦 [SUBSCRIPTION CHECKER] ✅ Nenhum plano vencido para atualizar');
    }
    
  } catch (error) {
    console.error('📦 [SUBSCRIPTION CHECKER] Erro:', error);
  }
}
