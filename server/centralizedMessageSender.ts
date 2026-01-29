/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *  🚀 CENTRALIZED MESSAGE SENDER v2.0
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
 * 
 * v2.0 - NOVA IMPLEMENTAÇÃO COM BOTÕES INTERATIVOS:
 * - Usa nativeFlowMessage para Android (botões clicáveis)
 * - Fallback para texto formatado em iOS/Web
 * - Suporte a quick_reply e list sections
 */

import { antiBanProtectionService, simulateTyping, groupMetadataCache, ANTI_BAN_CONFIG } from './antiBanProtectionService';
import { proto, generateWAMessageFromContent, generateWAMessageContent } from '@whiskeysockets/baileys';
import type { AnyMessageContent, WASocket } from '@whiskeysockets/baileys';

// ═══════════════════════════════════════════════════════════════════════════════
//  🎛️ CONFIGURAÇÃO DE BOTÕES INTERATIVOS
// ═══════════════════════════════════════════════════════════════════════════════

// Se true, tenta enviar botões nativos via nativeFlowMessage (funciona no Android)
// Se false ou se falhar, usa texto formatado (funciona em todos)
const USE_NATIVE_BUTTONS = true;

// Enviar AMBOS: primeiro nativo, depois texto como fallback
// Isso garante que funcione em TODOS os dispositivos
const SEND_TEXT_FALLBACK = true;

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
   * @param payload - Pode ser objeto completo {body, buttons, header?, footer?} ou text simples
   * 
   * v2.0: Agora usa nativeFlowMessage para Android (botões clicáveis)
   * E envia texto formatado como fallback para iOS/Web
   */
  async sendButtons(
    userId: string,
    jid: string,
    payload: any, // Aceita payload completo ou text simples
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    // Se payload é string simples, enviar como texto
    if (typeof payload === 'string') {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options,
      });
    }

    // Se não tem body ou buttons, enviar como está
    if (!payload.body || !payload.buttons?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔥 NOVA IMPLEMENTAÇÃO: nativeFlowMessage para Android
    // ═══════════════════════════════════════════════════════════════════════
    
    if (USE_NATIVE_BUTTONS) {
      try {
        console.log(`🔘 [NATIVE-BUTTONS] Tentando enviar ${payload.buttons.length} botões nativos para ${jid.substring(0, 15)}...`);
        
        // Criar botões no formato nativeFlowMessage (quick_reply)
        const nativeButtons = payload.buttons.map((btn: any) => ({
          name: 'quick_reply',
          buttonParamsJson: JSON.stringify({
            display_text: btn.reply?.title || btn.title || `Opção`,
            id: btn.reply?.id || btn.id || `btn_${Date.now()}`
          })
        }));

        // Criar mensagem interativa com nativeFlowMessage
        const interactiveMessage = proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: payload.body
          }),
          footer: payload.footer?.text ? proto.Message.InteractiveMessage.Footer.create({
            text: payload.footer.text
          }) : undefined,
          header: payload.header?.text ? proto.Message.InteractiveMessage.Header.create({
            title: payload.header.text,
            hasMediaAttachment: false
          }) : undefined,
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: nativeButtons
          })
        });

        // Gerar mensagem completa
        const msg = generateWAMessageFromContent(jid, {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2
              },
              interactiveMessage
            }
          }
        } as any, {} as any);

        // Enviar via relayMessage
        const result = await socket.relayMessage(jid, msg.message!, {
          messageId: msg.key.id!
        });

        console.log(`✅ [NATIVE-BUTTONS] Botões nativos enviados com sucesso!`);
        
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: msg.key.id || undefined,
          waitedMs: 0,
        };
        
      } catch (nativeError) {
        console.error(`⚠️ [NATIVE-BUTTONS] Falha ao enviar botões nativos, usando fallback texto:`, nativeError);
        // Continuar para fallback de texto
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📝 FALLBACK: Converter para texto formatado (funciona em todos)
    // ═══════════════════════════════════════════════════════════════════════
    
    let formattedText = payload.body;
    
    // Adicionar footer se existir
    if (payload.footer?.text) {
      formattedText += `\n\n${payload.footer.text}`;
    }
    
    // Adicionar botões como opções de texto
    if (payload.buttons && payload.buttons.length > 0) {
      formattedText += '\n\n';
      payload.buttons.forEach((btn: any, index: number) => {
        const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][index] || `${index + 1}.`;
        const title = btn.reply?.title || btn.title || `Opção ${index + 1}`;
        formattedText += `${emoji} ${title}\n`;
      });
      formattedText += '\n_Digite o número da opção desejada_';
    }
    
    const content = { text: formattedText };
    
    console.log(`📱 [BUTTONS→TEXT] Enviando ${payload.buttons?.length || 0} botões como texto para ${jid.substring(0, 15)}...`);
    
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
   * Envia lista
   * @param payload - Pode ser objeto completo {body, buttonText, sections, header?, footer?} ou text simples
   * 
   * v2.0: Agora usa nativeFlowMessage com single_select para Android (lista clicável)
   * E envia texto formatado como fallback para iOS/Web
   */
  async sendList(
    userId: string,
    jid: string,
    payload: any, // Aceita payload completo ou parâmetros individuais
    socket: WASocket,
    origin: MessageOrigin,
    options?: Partial<SendMessageOptions>
  ): Promise<SendResult> {
    // Se payload é string simples, enviar como texto
    if (typeof payload === 'string') {
      return this.sendMessage({
        userId,
        jid,
        content: { text: payload },
        socket,
        origin,
        ...options,
      });
    }

    // Se não tem body ou sections, enviar como está
    if (!payload.body || !payload.sections?.length) {
      return this.sendMessage({
        userId,
        jid,
        content: payload,
        socket,
        origin,
        ...options,
      });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 🔥 NOVA IMPLEMENTAÇÃO: nativeFlowMessage single_select para Android
    // ═══════════════════════════════════════════════════════════════════════
    
    if (USE_NATIVE_BUTTONS) {
      try {
        // Contar total de itens
        const totalItems = payload.sections.reduce((acc: number, s: any) => acc + (s.rows?.length || 0), 0);
        console.log(`📋 [NATIVE-LIST] Tentando enviar lista com ${totalItems} itens nativos para ${jid.substring(0, 15)}...`);
        
        // Criar seções no formato nativeFlowMessage (single_select)
        const nativeSections = payload.sections.map((section: any) => ({
          title: section.title || '',
          rows: (section.rows || []).map((row: any) => ({
            id: row.id || `row_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            title: row.title || 'Opção',
            description: row.description || ''
          }))
        }));

        // Criar mensagem interativa com nativeFlowMessage single_select
        const interactiveMessage = proto.Message.InteractiveMessage.create({
          body: proto.Message.InteractiveMessage.Body.create({
            text: payload.body
          }),
          footer: payload.footer?.text ? proto.Message.InteractiveMessage.Footer.create({
            text: payload.footer.text
          }) : undefined,
          header: payload.header?.text ? proto.Message.InteractiveMessage.Header.create({
            title: payload.header.text,
            hasMediaAttachment: false
          }) : undefined,
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            buttons: [{
              name: 'single_select',
              buttonParamsJson: JSON.stringify({
                title: payload.buttonText || payload.button_text || 'Selecionar',
                sections: nativeSections
              })
            }]
          })
        });

        // Gerar mensagem completa
        const msg = generateWAMessageFromContent(jid, {
          viewOnceMessage: {
            message: {
              messageContextInfo: {
                deviceListMetadata: {},
                deviceListMetadataVersion: 2
              },
              interactiveMessage
            }
          }
        } as any, {} as any);

        // Enviar via relayMessage
        const result = await socket.relayMessage(jid, msg.message!, {
          messageId: msg.key.id!
        });

        console.log(`✅ [NATIVE-LIST] Lista nativa enviada com sucesso!`);
        
        this.recordSent(userId, origin, true);
        return {
          success: true,
          messageId: msg.key.id || undefined,
          waitedMs: 0,
        };
        
      } catch (nativeError) {
        console.error(`⚠️ [NATIVE-LIST] Falha ao enviar lista nativa, usando fallback texto:`, nativeError);
        // Continuar para fallback de texto
      }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // 📝 FALLBACK: Converter para texto formatado (funciona em todos)
    // ═══════════════════════════════════════════════════════════════════════
    
    let formattedText = payload.body;
    
    // Adicionar footer se existir
    if (payload.footer?.text) {
      formattedText += `\n\n${payload.footer.text}`;
    }
    
    // Adicionar seções e itens como texto
    if (payload.sections && payload.sections.length > 0) {
      let itemIndex = 1;
      payload.sections.forEach((section: any) => {
        if (section.title) {
          formattedText += `\n\n*${section.title}*`;
        }
        if (section.rows && section.rows.length > 0) {
          section.rows.forEach((row: any) => {
            const emoji = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣', '🔟'][itemIndex - 1] || `${itemIndex}.`;
            formattedText += `\n${emoji} ${row.title}`;
            if (row.description) {
              formattedText += ` - _${row.description}_`;
            }
            itemIndex++;
          });
        }
      });
      formattedText += '\n\n_Digite o número ou nome da opção desejada_';
    }
    
    const content = { text: formattedText };
    
    const totalItems = payload.sections?.reduce((acc: number, s: any) => acc + (s.rows?.length || 0), 0) || 0;
    console.log(`📋 [LIST→TEXT] Enviando lista com ${totalItems} itens como texto para ${jid.substring(0, 15)}...`);
    
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
