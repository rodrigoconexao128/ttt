/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🚀 CENTRALIZED MESSAGE SENDER v1.0
 *  Sistema unificado para envio de TODAS as mensagens
 *  TODOS os sistemas DEVEM usar este serviço para enviar mensagens!
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * Sistemas que DEVEM usar este serviço:
 * - ✅ Follow-up automático
 * - ✅ Notificador inteligente
 * - ✅ Mensagem manual (admin)
 * - ✅ Conversas normais
 * - ✅ Delivery
 * - ✅ Catálogo
 * - ✅ Agendamento
 * - ✅ AI Agent
 * - ✅ Broadcast
 * - ✅ Recovery
 * - ✅ Media (imagens, vídeos, áudios)
 * 
 * NUNCA faça socket.sendMessage() diretamente! Use este serviço.
 */

import { antiBanProtectionService, simulateTyping, groupMetadataCache, ANTI_BAN_CONFIG } from './antiBanProtectionService';
import type { AnyMessageContent, WASocket } from '@whiskeysockets/baileys';

// ═══════════════════════════════════════════════════════════════════════════════
//  📋 TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface SendMessageOptions {
  userId: string;          // ID do usuário/conexão
  jid: string;             // ID do destinatário
  content: AnyMessageContent; // Conteúdo da mensagem
  socket: WASocket;        // Socket do WhatsApp
  origin: MessageOrigin;   // Origem da mensagem (para logs e auditoria)
  priority?: MessagePriority; // Prioridade (normal, alta, urgente)
  quotedMessage?: any;     // Mensagem citada (reply)
  skipTyping?: boolean;    // Pular indicador de digitação
  isOwnerInitiated?: boolean; // Se o dono iniciou a conversa
}

type MessageOrigin = 
  | 'follow_up'
  | 'user_follow_up'
  | 'delivery'
  | 'catalog'
  | 'scheduling'
  | 'ai_agent'
  | 'broadcast'
  | 'recovery'
  | 'manual_admin'
  | 'conversation'
  | 'media'
  | 'notification'
  | 'whatsapp_sender'
  | 'chatbot_flow'
  | 'unknown';

type MessagePriority = 'low' | 'normal' | 'high' | 'urgent';

interface SendResult {
  success: boolean;
  messageId?: string;
  error?: string;
  waitedMs?: number;
}

interface QueuedMessage {
  options: SendMessageOptions;
  resolve: (result: SendResult) => void;
  queuedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  📊 ESTATÍSTICAS E LOGS
// ═══════════════════════════════════════════════════════════════════════════════

interface SendStats {
  totalSent: number;
  totalFailed: number;
  byOrigin: Record<MessageOrigin, number>;
  lastSentAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  🎯 CLASSE PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════

class CentralizedMessageSender {
  private stats: Map<string, SendStats> = new Map();
  private processing = new Map<string, boolean>();
  private queues = new Map<string, QueuedMessage[]>();

  constructor() {
    console.log('🚀 [CENTRALIZED-SENDER v1.0] Sistema unificado de envio inicializado');
    console.log(`   ⏱️ Delays: ${ANTI_BAN_CONFIG.MIN_DELAY_MS/1000}s - ${ANTI_BAN_CONFIG.MAX_DELAY_MS/1000}s`);
    console.log(`   ⌨️ Typing: ${ANTI_BAN_CONFIG.TYPING_ENABLED ? 'ATIVADO' : 'DESATIVADO'}`);
    console.log(`   📦 Batch: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs, pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000}s`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📤 MÉTODO PRINCIPAL DE ENVIO
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envia uma mensagem através do sistema anti-ban
   * ESTE É O ÚNICO MÉTODO QUE DEVE SER USADO PARA ENVIAR MENSAGENS
   */
  async sendMessage(options: SendMessageOptions): Promise<SendResult> {
    const { userId, jid, content, socket, origin, priority = 'normal' } = options;

    // Validações
    if (!socket) {
      console.error(`❌ [CENTRALIZED-SENDER] Socket não fornecido para ${origin}`);
      return { success: false, error: 'Socket não disponível' };
    }

    if (!jid) {
      console.error(`❌ [CENTRALIZED-SENDER] JID não fornecido para ${origin}`);
      return { success: false, error: 'JID não fornecido' };
    }

    // Log de entrada
    console.log(`📥 [CENTRALIZED-SENDER] Nova mensagem de [${origin}] para ${jid.substring(0, 15)}...`);

    // Mensagens urgentes (do dono) têm delay menor
    if (options.isOwnerInitiated || priority === 'urgent') {
      return this.sendImmediateWithMinimalDelay(options);
    }

    // Adicionar à fila e processar
    return this.enqueueAndProcess(options);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  🔥 ENVIO IMEDIATO (para mensagens do dono)
  // ═══════════════════════════════════════════════════════════════════════════

  private async sendImmediateWithMinimalDelay(options: SendMessageOptions): Promise<SendResult> {
    const { userId, jid, content, socket, origin, quotedMessage, skipTyping } = options;

    try {
      // Delay mínimo de 5 segundos mesmo para urgente
      const delay = ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS;
      console.log(`⚡ [CENTRALIZED-SENDER] Envio prioritário de [${origin}] - delay ${delay/1000}s`);
      
      // Typing indicator (se não pulado)
      if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
        await simulateTyping(socket, jid, this.getMessageLength(content));
      }

      await new Promise(resolve => setTimeout(resolve, delay));

      // Enviar mensagem
      const result = await socket.sendMessage(jid, content, {
        quoted: quotedMessage,
      });

      this.recordSent(userId, origin, true);
      
      return {
        success: true,
        messageId: result?.key?.id || undefined,
        waitedMs: delay,
      };
    } catch (error) {
      console.error(`❌ [CENTRALIZED-SENDER] Erro no envio prioritário:`, error);
      this.recordSent(userId, origin, false);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📋 SISTEMA DE FILA
  // ═══════════════════════════════════════════════════════════════════════════

  private async enqueueAndProcess(options: SendMessageOptions): Promise<SendResult> {
    const { userId } = options;

    return new Promise((resolve) => {
      // Obter ou criar fila para este usuário
      if (!this.queues.has(userId)) {
        this.queues.set(userId, []);
      }

      const queue = this.queues.get(userId)!;
      
      // Adicionar à fila
      queue.push({
        options,
        resolve,
        queuedAt: Date.now(),
      });

      console.log(`📋 [CENTRALIZED-SENDER] Mensagem enfileirada. Fila de ${userId.substring(0, 8)}: ${queue.length} msgs`);

      // Iniciar processamento se não estiver rodando
      if (!this.processing.get(userId)) {
        this.processQueue(userId);
      }
    });
  }

  private async processQueue(userId: string): Promise<void> {
    if (this.processing.get(userId)) return;
    
    this.processing.set(userId, true);
    const queue = this.queues.get(userId) || [];

    console.log(`🔄 [CENTRALIZED-SENDER] Iniciando processamento da fila de ${userId.substring(0, 8)}...`);

    while (queue.length > 0) {
      const item = queue.shift()!;
      const { options, resolve } = item;
      const { jid, content, socket, origin, quotedMessage, skipTyping } = options;

      try {
        // 1. Obter delay do anti-ban (usa calculateDelay com contactNumber extraído do jid)
        const contactNumber = jid.replace('@s.whatsapp.net', '').replace('@g.us', '');
        const delay = antiBanProtectionService.calculateDelay(userId, contactNumber);

        console.log(`⏱️ [CENTRALIZED-SENDER] Aguardando ${Math.ceil(delay/1000)}s antes de enviar [${origin}]...`);

        // 2. Typing indicator (se não pulado)
        if (!skipTyping && ANTI_BAN_CONFIG.TYPING_ENABLED) {
          await simulateTyping(socket, jid, this.getMessageLength(content));
        }

        // 3. Aguardar delay
        await new Promise(r => setTimeout(r, delay));

        // 4. Enviar mensagem
        const result = await socket.sendMessage(jid, content, {
          quoted: quotedMessage,
        });

        // 5. Registrar envio no anti-ban
        antiBanProtectionService.registerMessageSent(userId, contactNumber);
        this.recordSent(userId, origin, true);

        console.log(`✅ [CENTRALIZED-SENDER] Mensagem enviada [${origin}] → ${jid.substring(0, 15)}...`);

        resolve({
          success: true,
          messageId: result?.key?.id || undefined,
          waitedMs: delay,
        });

      } catch (error) {
        console.error(`❌ [CENTRALIZED-SENDER] Erro ao enviar [${origin}]:`, error);
        this.recordSent(userId, origin, false);

        resolve({
          success: false,
          error: error instanceof Error ? error.message : 'Erro desconhecido',
        });
      }
    }

    this.processing.set(userId, false);
    console.log(`✅ [CENTRALIZED-SENDER] Fila de ${userId.substring(0, 8)} processada`);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  🛠️ MÉTODOS AUXILIARES
  // ═══════════════════════════════════════════════════════════════════════════

  private isGroupJid(jid: string): boolean {
    return jid.endsWith('@g.us');
  }

  private getMessageLength(content: AnyMessageContent): number {
    if ('text' in content && typeof content.text === 'string') {
      return content.text.length;
    }
    if ('caption' in content && typeof content.caption === 'string') {
      return content.caption.length;
    }
    return 100; // Default para mídia
  }

  private recordSent(userId: string, origin: MessageOrigin, success: boolean): void {
    if (!this.stats.has(userId)) {
      this.stats.set(userId, {
        totalSent: 0,
        totalFailed: 0,
        byOrigin: {} as Record<MessageOrigin, number>,
        lastSentAt: 0,
      });
    }

    const stats = this.stats.get(userId)!;
    
    if (success) {
      stats.totalSent++;
    } else {
      stats.totalFailed++;
    }
    
    stats.byOrigin[origin] = (stats.byOrigin[origin] || 0) + 1;
    stats.lastSentAt = Date.now();
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  📊 ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════

  getStats(userId: string): SendStats | null {
    return this.stats.get(userId) || null;
  }

  getQueueSize(userId: string): number {
    return this.queues.get(userId)?.length || 0;
  }

  // ═══════════════════════════════════════════════════════════════════════════
  //  ⚡ MÉTODOS DE CONVENIÊNCIA
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * Envia mensagem de texto
   */
  async sendText(
    userId: string,
    jid: string,
    text: string,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    return this.sendMessage({
      userId,
      jid,
      content: { text },
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia imagem
   */
  async sendImage(
    userId: string,
    jid: string,
    image: Buffer | string,
    caption: string | undefined,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof image === 'string'
      ? { image: { url: image }, caption }
      : { image, caption };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia vídeo
   */
  async sendVideo(
    userId: string,
    jid: string,
    video: Buffer | string,
    caption: string | undefined,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof video === 'string'
      ? { video: { url: video }, caption }
      : { video, caption };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia áudio
   */
  async sendAudio(
    userId: string,
    jid: string,
    audio: Buffer | string,
    ptt: boolean,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof audio === 'string'
      ? { audio: { url: audio }, ptt }
      : { audio, ptt };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia documento
   */
  async sendDocument(
    userId: string,
    jid: string,
    document: Buffer | string,
    filename: string,
    mimetype: string,
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    const content: AnyMessageContent = typeof document === 'string'
      ? { document: { url: document }, fileName: filename, mimetype }
      : { document, fileName: filename, mimetype };

    return this.sendMessage({
      userId,
      jid,
      content,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia botões (se suportado)
   */
  async sendButtons(
    userId: string,
    jid: string,
    text: string,
    buttons: any[],
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    return this.sendMessage({
      userId,
      jid,
      content: { text, buttons } as any,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Envia lista
   */
  async sendList(
    userId: string,
    jid: string,
    text: string,
    buttonText: string,
    sections: any[],
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    return this.sendMessage({
      userId,
      jid,
      content: { text, buttonText, sections } as any,
      socket,
      origin,
      ...options,
    });
  }

  /**
   * Reseta contador de batch (quando cliente interage)
   */
  resetBatchCounter(userId: string): void {
    antiBanProtectionService.resetBatchCounter(userId);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const centralizedMessageSender = new CentralizedMessageSender();
export default centralizedMessageSender;

// Exportar tipos para uso em outros módulos
export type { SendMessageOptions, MessageOrigin, MessagePriority, SendResult };
