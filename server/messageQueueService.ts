/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP                         ║
 * ║                                                                              ║
 * ║  Este serviço implementa proteção contra bloqueio do WhatsApp através de:   ║
 * ║  1. Fila de mensagens POR WHATSAPP (cada conexão tem sua própria fila)      ║
 * ║  2. Delay de 5-10 segundos entre mensagens do MESMO WhatsApp                ║
 * ║  3. Nunca envia duas mensagens no mesmo segundo                             ║
 * ║                                                                              ║
 * ║  IMPORTANTE: Múltiplos WhatsApps podem enviar ao mesmo tempo!               ║
 * ║  A regra é POR WHATSAPP, não global.                                        ║
 * ║                                                                              ║
 * ║  ⚠️ VARIAÇÃO DE IA REMOVIDA - Estava corrompendo respostas do agente!       ║
 * ║  Mensagens são enviadas EXATAMENTE como recebidas.                          ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { WASocket } from "@whiskeysockets/baileys";

// ═══════════════════════════════════════════════════════════════════════════════
//  INTERFACE E TIPOS
// ═══════════════════════════════════════════════════════════════════════════════

interface QueuedMessage {
  id: string;
  jid: string;
  text: string;
  originalText: string; // Texto original antes da variação
  options?: {
    isFromAgent?: boolean;
    mediaType?: string;
    mediaUrl?: string;
    caption?: string;
  };
  priority: 'high' | 'normal' | 'low'; // Alta = resposta IA, Normal = follow-up, Baixa = bulk
  addedAt: number;
  resolve: (result: MessageSendResult) => void;
  reject: (error: Error) => void;
}

interface MessageSendResult {
  success: boolean;
  messageId?: string;
  variedText?: string;
  error?: string;
}

interface WhatsAppQueueState {
  queue: QueuedMessage[];
  isProcessing: boolean;
  lastSentAt: number;
  totalSent: number;
  totalErrors: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🎯 CLASSE PRINCIPAL DO SERVIÇO DE FILA
// ═══════════════════════════════════════════════════════════════════════════════

class MessageQueueService {
  // Mapa de filas: userId -> estado da fila daquele WhatsApp
  private queues = new Map<string, WhatsAppQueueState>();
  
  // Histórico de variações por mensagem base (para evitar repetição)
  private variationHistory = new Map<string, string[]>();
  
  // Configurações
  private readonly MIN_DELAY_MS = 5000; // 5 segundos mínimo
  private readonly MAX_DELAY_MS = 10000; // 10 segundos máximo
  
  // Callback para enviar mensagem real (injetado pelo whatsapp.ts)
  private sendCallback: ((userId: string, jid: string, text: string, options?: any) => Promise<string | null>) | null = null;

  constructor() {
    console.log('🛡️ [ANTI-BLOCK] MessageQueueService iniciado (com IA Mistral para humanização)');
    
    // Limpar filas vazias a cada 5 minutos
    setInterval(() => this.cleanupEmptyQueues(), 5 * 60 * 1000);
    
    // Limpar histórico de variações a cada 30 minutos
    setInterval(() => {
      this.variationHistory.clear();
      console.log('🛡️ [ANTI-BLOCK] Histórico de variações limpo');
    }, 30 * 60 * 1000);
  }

  /**
   * Registra o callback para envio real de mensagens
   * Deve ser chamado pelo whatsapp.ts após inicialização
   */
  registerSendCallback(callback: (userId: string, jid: string, text: string, options?: any) => Promise<string | null>): void {
    this.sendCallback = callback;
    console.log('🛡️ [ANTI-BLOCK] Callback de envio registrado');
  }

  /**
   * Gera hash simples de uma mensagem para histórico
   */
  private generateHash(text: string): string {
    let hash = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }

  /**
   * Adiciona mensagem à fila do WhatsApp específico
   * Retorna uma Promise que resolve quando a mensagem for enviada
   * 
   * ✅ VARIAÇÃO DE IA REMOVIDA - Texto enviado exatamente como recebido
   */
  async enqueue(
    userId: string,
    jid: string,
    text: string,
    options?: {
      isFromAgent?: boolean;
      priority?: 'high' | 'normal' | 'low';
    }
  ): Promise<MessageSendResult> {
    // Inicializar fila do usuário se não existir
    if (!this.queues.has(userId)) {
      this.queues.set(userId, {
        queue: [],
        isProcessing: false,
        lastSentAt: Date.now(), // ✅ CORREÇÃO: Inicializar com tempo atual para garantir delay na primeira msg
        totalSent: 0,
        totalErrors: 0,
      });
      console.log(`🛡️ [ANTI-BLOCK] Nova fila criada para ${userId.substring(0, 8)}... (lastSentAt = now para garantir delay)`);
    }

    const state = this.queues.get(userId)!;
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // ⚠️ VARIAÇÃO DE IA REMOVIDA - Enviar texto EXATAMENTE como recebido
    // A variação estava corrompendo respostas do agente e mensagens do dono

    return new Promise((resolve, reject) => {
      const queuedMessage: QueuedMessage = {
        id: messageId,
        jid,
        text: text, // ✅ Usar texto original SEM variação
        originalText: text,
        options,
        priority: options?.priority || 'normal',
        addedAt: Date.now(),
        resolve,
        reject,
      };

      // Inserir na posição correta baseado em prioridade
      this.insertByPriority(state.queue, queuedMessage);

      console.log(`🛡️ [ANTI-BLOCK] Mensagem enfileirada para ${userId.substring(0, 8)}...`);
      console.log(`   📊 Fila: ${state.queue.length} | Prioridade: ${options?.priority || 'normal'}`);
      console.log(`   📝 Texto: "${text.substring(0, 50)}..."`);
      // ✅ VARIAÇÃO REMOVIDA - texto enviado sem modificação

      // Iniciar processamento se não estiver rodando
      if (!state.isProcessing) {
        this.processQueue(userId);
      }
    });
  }

  /**
   * Insere mensagem na fila respeitando prioridade
   * high > normal > low
   */
  private insertByPriority(queue: QueuedMessage[], message: QueuedMessage): void {
    const priorityOrder = { high: 0, normal: 1, low: 2 };
    const msgPriority = priorityOrder[message.priority];

    // Encontrar posição correta
    let insertIndex = queue.length;
    for (let i = 0; i < queue.length; i++) {
      if (priorityOrder[queue[i].priority] > msgPriority) {
        insertIndex = i;
        break;
      }
    }

    queue.splice(insertIndex, 0, message);
  }

  /**
   * Processa a fila de um WhatsApp específico
   * Garante delay de 5-10s entre mensagens
   */
  private async processQueue(userId: string): Promise<void> {
    const state = this.queues.get(userId);
    if (!state || state.isProcessing) return;

    state.isProcessing = true;

    while (state.queue.length > 0) {
      const message = state.queue.shift()!;
      
      try {
        // Calcular delay necessário
        const now = Date.now();
        const timeSinceLastSent = now - state.lastSentAt;
        const requiredDelay = this.getRandomDelay();
        
        // 🛡️ PROTEÇÃO EXTRA: Se lastSentAt é muito antigo (> 1 min), ainda assim aplicar delay mínimo
        // Isso previne envios instantâneos após reconexão ou reinício do servidor
        const isFirstAfterLongGap = timeSinceLastSent > 60000; // > 1 minuto
        const remainingDelay = isFirstAfterLongGap 
          ? requiredDelay  // Aplicar delay completo se primeira msg após longa pausa
          : Math.max(0, requiredDelay - timeSinceLastSent);

        if (remainingDelay > 0) {
          console.log(`🛡️ [ANTI-BLOCK] Aguardando ${(remainingDelay/1000).toFixed(1)}s antes de enviar (userId: ${userId.substring(0, 8)}...)${isFirstAfterLongGap ? ' [PRIMEIRA MSG]' : ''}`);
          await this.sleep(remainingDelay);
        }

        // Enviar mensagem
        const result = await this.sendMessage(userId, message);
        
        state.lastSentAt = Date.now();
        state.totalSent++;

        message.resolve(result);

      } catch (error: any) {
        state.totalErrors++;
        console.error(`🛡️ [ANTI-BLOCK] ❌ Erro ao enviar:`, error.message);
        message.reject(error);
      }
    }

    state.isProcessing = false;
  }

  /**
   * Envia mensagem real usando o callback registrado
   */
  private async sendMessage(userId: string, message: QueuedMessage): Promise<MessageSendResult> {
    if (!this.sendCallback) {
      throw new Error('Send callback not registered');
    }

    console.log(`🛡️ [ANTI-BLOCK] 📤 Enviando mensagem para ${message.jid.substring(0, 15)}...`);
    
    const messageId = await this.sendCallback(userId, message.jid, message.text, message.options);

    return {
      success: true,
      messageId: messageId || undefined,
      variedText: message.text !== message.originalText ? message.text : undefined,
    };
  }

  /**
   * Gera delay aleatório entre MIN e MAX
   */
  private getRandomDelay(): number {
    return this.MIN_DELAY_MS + Math.random() * (this.MAX_DELAY_MS - this.MIN_DELAY_MS);
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Limpa filas vazias para liberar memória
   */
  private cleanupEmptyQueues(): void {
    const now = Date.now();
    const MAX_IDLE_TIME = 30 * 60 * 1000; // 30 minutos sem atividade

    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      if (state.queue.length === 0 && !state.isProcessing) {
        // Verificar se última mensagem foi há mais de 30 min
        if (now - state.lastSentAt > MAX_IDLE_TIME) {
          this.queues.delete(userId);
          console.log(`🛡️ [ANTI-BLOCK] Fila removida por inatividade: ${userId.substring(0, 8)}...`);
        }
      }
    }
  }

  /**
   * Retorna estatísticas do serviço
   */
  getStats(): Record<string, any> {
    const stats: Record<string, any> = {
      totalQueues: this.queues.size,
      queues: {},
    };

    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      stats.queues[userId.substring(0, 8)] = {
        queueLength: state.queue.length,
        isProcessing: state.isProcessing,
        totalSent: state.totalSent,
        totalErrors: state.totalErrors,
        lastSentAt: state.lastSentAt ? new Date(state.lastSentAt).toISOString() : null,
      };
    }

    return stats;
  }

  /**
   * Força limpeza de todas as filas (para shutdown)
   */
  clearAllQueues(): void {
    const entries = Array.from(this.queues.entries());
    for (const [userId, state] of entries) {
      // Rejeitar todas as mensagens pendentes
      for (const msg of state.queue) {
        msg.reject(new Error('Queue cleared'));
      }
      state.queue = [];
    }
    this.queues.clear();
    console.log('🛡️ [ANTI-BLOCK] Todas as filas limpas');
  }

  /**
   * 🛡️ SAFE MODE: Limpa a fila de um usuário específico
   * Usado quando o cliente tomou bloqueio e está reconectando
   * Cancela todas as mensagens pendentes sem enviar
   */
  clearUserQueue(userId: string): { cleared: number; wasPending: boolean } {
    const state = this.queues.get(userId);
    if (!state) {
      console.log(`🛡️ [SAFE MODE] Nenhuma fila encontrada para ${userId.substring(0, 8)}...`);
      return { cleared: 0, wasPending: false };
    }

    const queueSize = state.queue.length;
    const wasPending = state.isProcessing;

    // Rejeitar todas as mensagens pendentes com erro específico
    for (const msg of state.queue) {
      msg.reject(new Error('Queue cleared by Safe Mode - anti-block protection'));
    }
    state.queue = [];
    state.isProcessing = false;

    console.log(`🛡️ [SAFE MODE] ✅ Fila do usuário ${userId.substring(0, 8)}... limpa: ${queueSize} mensagens removidas`);
    return { cleared: queueSize, wasPending };
  }

  /**
   * Obtém tamanho da fila de um usuário específico
   */
  getQueueSize(userId: string): number {
    return this.queues.get(userId)?.queue.length || 0;
  }

  /**
   * Verifica se um WhatsApp pode enviar mensagem agora
   * (útil para UI mostrar status)
   */
  canSendNow(userId: string): { canSend: boolean; waitMs: number } {
    const state = this.queues.get(userId);
    if (!state) {
      return { canSend: true, waitMs: 0 };
    }

    const timeSinceLastSent = Date.now() - state.lastSentAt;
    const waitMs = Math.max(0, this.MIN_DELAY_MS - timeSinceLastSent);

    return {
      canSend: waitMs === 0 && state.queue.length === 0,
      waitMs,
    };
  }

  /**
   * 🛡️ ANTI-BLOCK PARA MÍDIA E OUTROS ENVIOS
   * Aguarda vez na fila e aplica delay entre mensagens
   * Use ANTES de enviar mídia, áudio, etc. para evitar bloqueio
   * 
   * @param userId - ID do usuário/WhatsApp
   * @param description - Descrição do envio (para logs)
   * @returns Promise que resolve após aplicar delay necessário
   */
  async waitForTurn(userId: string, description: string = 'mídia'): Promise<void> {
    // Obter ou criar estado da fila
    let state = this.queues.get(userId);
    if (!state) {
      state = {
        queue: [],
        isProcessing: false,
        lastSentAt: Date.now(), // 🛡️ Garantir delay na primeira msg
        totalSent: 0,
        totalErrors: 0,
      };
      this.queues.set(userId, state);
      console.log(`🛡️ [ANTI-BLOCK] Nova fila criada para mídia: ${userId.substring(0, 8)}...`);
    }

    // Aguardar se há fila de texto sendo processada
    while (state.isProcessing || state.queue.length > 0) {
      console.log(`🛡️ [ANTI-BLOCK] ⏳ Aguardando fila de texto terminar antes de enviar ${description}...`);
      await this.sleep(1000);
      state = this.queues.get(userId)!;
    }

    // Calcular delay necessário
    const now = Date.now();
    const timeSinceLastSent = now - state.lastSentAt;
    const requiredDelay = this.getRandomDelay();
    
    // Proteção para primeira msg após gap longo
    const isFirstAfterLongGap = timeSinceLastSent > 60000;
    const remainingDelay = isFirstAfterLongGap 
      ? requiredDelay 
      : Math.max(0, requiredDelay - timeSinceLastSent);

    if (remainingDelay > 0) {
      console.log(`🛡️ [ANTI-BLOCK] 🎵 Aguardando ${(remainingDelay/1000).toFixed(1)}s antes de enviar ${description} (userId: ${userId.substring(0, 8)}...)${isFirstAfterLongGap ? ' [PRIMEIRA]' : ''}`);
      await this.sleep(remainingDelay);
    }

    // Atualizar lastSentAt após o delay
    state.lastSentAt = Date.now();
    state.totalSent++;
    
    console.log(`🛡️ [ANTI-BLOCK] ✅ Liberado para enviar ${description}`);
  }

  /**
   * Notifica que um envio de mídia foi concluído
   * Use APÓS enviar mídia para atualizar timestamp da fila
   */
  markMediaSent(userId: string): void {
    const state = this.queues.get(userId);
    if (state) {
      state.lastSentAt = Date.now();
    }
  }

  /**
   * 🛡️ WRAPPER UNIVERSAL - Executa QUALQUER função de envio respeitando a fila
   * 
   * Use este método para enviar QUALQUER tipo de mensagem (texto, mídia, áudio, etc.)
   * garantindo que o delay de 5-10s seja respeitado.
   * 
   * @param userId - ID do usuário/WhatsApp (para identificar a fila)
   * @param description - Descrição do envio (para logs)
   * @param sendFn - Função async que faz o envio real
   * @returns Promise com o resultado do sendFn
   * 
   * @example
   * // Enviar texto
   * await messageQueueService.executeWithDelay(userId, 'texto', async () => {
   *   return await socket.sendMessage(jid, { text: 'Olá!' });
   * });
   * 
   * // Enviar mídia
   * await messageQueueService.executeWithDelay(userId, 'imagem', async () => {
   *   return await socket.sendMessage(jid, { image: buffer });
   * });
   */
  async executeWithDelay<T>(
    userId: string,
    description: string,
    sendFn: () => Promise<T>
  ): Promise<T> {
    // Aguardar vez na fila
    await this.waitForTurn(userId, description);
    
    try {
      // Executar envio real
      const result = await sendFn();
      
      // Atualizar timestamp após envio bem-sucedido
      this.markMediaSent(userId);
      
      return result;
    } catch (error) {
      // Em caso de erro, ainda atualizar timestamp para não travar fila
      this.markMediaSent(userId);
      throw error;
    }
  }
}

// Singleton exportado
export const messageQueueService = new MessageQueueService();

// ⚠️ VARIAÇÃO DE IA REMOVIDA - não re-exportar mais
// A humanização agora só está disponível em messageHumanizer.ts para uso em bulk send
// export { humanizeMessageWithAI } from "./messageHumanizer";

// Tipos exportados
export type { QueuedMessage, MessageSendResult, WhatsAppQueueState };
