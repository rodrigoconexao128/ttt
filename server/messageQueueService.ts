/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║                    🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP                         ║
 * ║                                                                              ║
 * ║  Este serviço implementa proteção contra bloqueio do WhatsApp através de:   ║
 * ║  1. Fila de mensagens POR WHATSAPP (cada conexão tem sua própria fila)      ║
 * ║  2. Delay de 5-10 segundos entre mensagens do MESMO WhatsApp                ║
 * ║  3. VARIAÇÃO COM IA (Mistral) para humanizar mensagens mantendo sentido     ║
 * ║  4. Nunca envia duas mensagens no mesmo segundo                             ║
 * ║                                                                              ║
 * ║  IMPORTANTE: Múltiplos WhatsApps podem enviar ao mesmo tempo!               ║
 * ║  A regra é POR WHATSAPP, não global.                                        ║
 * ║                                                                              ║
 * ║  🤖 A variação é feita pela IA Mistral, NÃO por substituição automática!    ║
 * ║  Isso garante que o sentido nunca seja perdido.                             ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { WASocket } from "@whiskeysockets/baileys";
import { humanizeMessageWithAI } from "./messageHumanizer";

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
   * 🤖 A variação é feita pela IA Mistral para manter o sentido!
   */
  async enqueue(
    userId: string,
    jid: string,
    text: string,
    options?: {
      isFromAgent?: boolean;
      priority?: 'high' | 'normal' | 'low';
      skipVariation?: boolean;
      messageType?: 'followup' | 'bulk' | 'response' | 'group';
    }
  ): Promise<MessageSendResult> {
    // Inicializar fila do usuário se não existir
    if (!this.queues.has(userId)) {
      this.queues.set(userId, {
        queue: [],
        isProcessing: false,
        lastSentAt: 0,
        totalSent: 0,
        totalErrors: 0,
      });
    }

    const state = this.queues.get(userId)!;
    const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    
    // Aplicar variação ao texto usando IA (se não for skipVariation)
    let variedText = text;
    if (!options?.skipVariation && text.length >= 20) {
      try {
        // Buscar variações anteriores desta mensagem
        const hash = this.generateHash(text);
        const previousVariations = this.variationHistory.get(hash) || [];
        
        // Chamar IA para humanizar
        variedText = await humanizeMessageWithAI(text, {
          type: options?.messageType || (options?.priority === 'low' ? 'bulk' : 'followup'),
          previousVariations: previousVariations.slice(-5), // Últimas 5 variações
        });
        
        // Salvar no histórico
        previousVariations.push(variedText);
        this.variationHistory.set(hash, previousVariations.slice(-10)); // Manter últimas 10
        
      } catch (error) {
        console.error('🛡️ [ANTI-BLOCK] Erro na humanização com IA, usando texto original:', error);
        variedText = text;
      }
    }

    return new Promise((resolve, reject) => {
      const queuedMessage: QueuedMessage = {
        id: messageId,
        jid,
        text: variedText,
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
      console.log(`   📝 Original: "${text.substring(0, 50)}..."`);
      if (text !== variedText) {
        console.log(`   🔄 Variado: "${variedText.substring(0, 50)}..."`);
      }

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
        const timeSinceLastSent = Date.now() - state.lastSentAt;
        const requiredDelay = this.getRandomDelay();
        const remainingDelay = Math.max(0, requiredDelay - timeSinceLastSent);

        if (remainingDelay > 0) {
          console.log(`🛡️ [ANTI-BLOCK] Aguardando ${(remainingDelay/1000).toFixed(1)}s antes de enviar (userId: ${userId.substring(0, 8)}...)`);
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
}

// Singleton exportado
export const messageQueueService = new MessageQueueService();

// Re-exportar a função de humanização com IA para uso direto
export { humanizeMessageWithAI } from "./messageHumanizer";

// Tipos exportados
export type { QueuedMessage, MessageSendResult, WhatsAppQueueState };
