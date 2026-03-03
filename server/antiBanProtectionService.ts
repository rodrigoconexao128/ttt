/**
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║              🛡️ SISTEMA ANTI-BLOQUEIO WHATSAPP v5.0 - SIMPLES E EFICAZ              ║
 * ╠══════════════════════════════════════════════════════════════════════════════════════╣
 * ║                                                                                      ║
 * ║  📋 FUNCIONALIDADES PRINCIPAIS:                                                      ║
 * ║                                                                                      ║
 * ║  1. Delay entre mensagens (3-8 segundos) - variável para parecer humano             ║
 * ║  2. Detectar quando o DONO envia mensagem manual - contar no delay                  ║
 * ║  3. Sistema de LOTES: após 10 mensagens, pausa de 1 minuto                          ║
 * ║  4. Simulação de digitação ("composing") antes de cada mensagem                     ║
 * ║  5. Logs detalhados para monitoramento                                              ║
 * ║                                                                                      ║
 * ║  ❌ SEM rate limiting absurdo (10 msgs/hora é ridículo para negócios)               ║
 * ║  ❌ SEM limites diários que atrapalham o atendimento                                ║
 * ║                                                                                      ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 */

// ═══════════════════════════════════════════════════════════════════════════════
//  CONFIGURAÇÕES ANTI-BANIMENTO v5.0 - REALISTAS E FUNCIONAIS
// ═══════════════════════════════════════════════════════════════════════════════

export const ANTI_BAN_CONFIG = {
  // ═══════════════════════════════════════════════════════════════════════════
  // DELAYS ENTRE MENSAGENS (valores realistas - 5 a 15 segundos)
  // ═══════════════════════════════════════════════════════════════════════════
  
  MIN_DELAY_MS: 5000,           // 5 segundos mínimo
  MAX_DELAY_MS: 15000,          // 15 segundos máximo
  
  // Delay após mensagem manual do DONO
  OWNER_MESSAGE_DELAY_MS: 5000,  // 5 segundos após dono enviar manualmente
  
  // ═══════════════════════════════════════════════════════════════════════════
  // SISTEMA DE LOTES - Pausa após 10 mensagens consecutivas
  // ═══════════════════════════════════════════════════════════════════════════
  
  BATCH_SIZE: 10,               // Após 10 envios consecutivos
  BATCH_PAUSE_MS: 60000,        // Pausa de 1 MINUTO (60 segundos)
  
  // ═══════════════════════════════════════════════════════════════════════════
  // DIGITANDO (typing indicator) - Simula digitação antes de enviar
  // ═══════════════════════════════════════════════════════════════════════════
  
  TYPING_ENABLED: true,         // Habilitar simulação de digitação
  TYPING_MIN_MS: 1500,          // 1.5 segundos mínimo digitando
  TYPING_MAX_MS: 4000,          // 4 segundos máximo digitando
  TYPING_CHARS_PER_SECOND: 35,  // Velocidade simulada de digitação
};

// Para compatibilidade com código existente
export const ANTI_BAN_CONFIG_V4 = ANTI_BAN_CONFIG;

// ═══════════════════════════════════════════════════════════════════════════════
//  TIPOS E INTERFACES
// ═══════════════════════════════════════════════════════════════════════════════

interface ChannelStats {
  userId: string;
  consecutiveMessages: number;  // Contador para sistema de lotes
  lastMessageAt: number;
  lastOwnerMessageAt: number;   // Última msg manual do dono
  lastOwnerMessageContact: string | null;
  isPaused: boolean;
  pauseEndAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CLASSE PRINCIPAL - PROTEÇÃO ANTI-BAN SIMPLIFICADA
// ═══════════════════════════════════════════════════════════════════════════════

class AntiBanProtectionService {
  private channelStats: Map<string, ChannelStats> = new Map();
  
  constructor() {
    console.log('🛡️ [ANTI-BAN v5.0] Sistema SIMPLIFICADO inicializado');
    console.log(`   📊 Delay entre msgs: ${ANTI_BAN_CONFIG.MIN_DELAY_MS/1000}-${ANTI_BAN_CONFIG.MAX_DELAY_MS/1000}s`);
    console.log(`   📊 Após msg do dono: +${ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS/1000}s`);
    console.log(`   📊 Lote: ${ANTI_BAN_CONFIG.BATCH_SIZE} msgs → pausa ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000}s`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER STATS DO CANAL
  // ═══════════════════════════════════════════════════════════════════════════
  
  private getChannelStats(userId: string): ChannelStats {
    if (!this.channelStats.has(userId)) {
      this.channelStats.set(userId, {
        userId,
        consecutiveMessages: 0,
        lastMessageAt: 0,
        lastOwnerMessageAt: 0,
        lastOwnerMessageContact: null,
        isPaused: false,
        pauseEndAt: 0,
      });
    }
    return this.channelStats.get(userId)!;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR MENSAGEM MANUAL DO DONO
  // ═══════════════════════════════════════════════════════════════════════════
  
  registerOwnerManualMessage(userId: string, contactNumber: string, _messageType?: string): void {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    // Atualizar stats
    stats.lastOwnerMessageAt = now;
    stats.lastOwnerMessageContact = contactNumber;
    
    // Mensagem manual do dono "reinicia" o contador de lote
    // (ele está ativamente conversando, então o padrão é mais humano)
    stats.consecutiveMessages = 0;
    
    console.log(`🛡️ [ANTI-BAN v5.0] 👤 Mensagem MANUAL do DONO detectada`);
    console.log(`   📱 Contato: ${contactNumber}`);
    console.log(`   🔄 Contador de lote reiniciado`);
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DELAY ANTES DE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  
  calculateDelay(userId: string, contactNumber: string): number {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    // Verificar se está em pausa de lote
    if (stats.isPaused && now < stats.pauseEndAt) {
      const remainingPause = stats.pauseEndAt - now;
      console.log(`🛡️ [ANTI-BAN v5.0] ⏸️ Canal em PAUSA de lote por mais ${Math.ceil(remainingPause/1000)}s`);
      return remainingPause;
    } else if (stats.isPaused) {
      // Pausa acabou
      stats.isPaused = false;
      stats.consecutiveMessages = 0;
      console.log(`🛡️ [ANTI-BAN v5.0] ▶️ Pausa de lote FINALIZADA - retomando`);
    }
    
    // Delay base aleatório (3-8 segundos)
    let delay = this.randomBetween(
      ANTI_BAN_CONFIG.MIN_DELAY_MS,
      ANTI_BAN_CONFIG.MAX_DELAY_MS
    );
    
    // Se o dono enviou mensagem recentemente para este contato, adicionar delay extra
    const timeSinceOwnerMessage = now - stats.lastOwnerMessageAt;
    if (timeSinceOwnerMessage < ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS &&
        stats.lastOwnerMessageContact === contactNumber) {
      const extraDelay = ANTI_BAN_CONFIG.OWNER_MESSAGE_DELAY_MS - timeSinceOwnerMessage;
      delay += extraDelay;
      console.log(`🛡️ [ANTI-BAN v5.0] 👤 Dono enviou msg há ${Math.ceil(timeSinceOwnerMessage/1000)}s - delay extra: ${Math.ceil(extraDelay/1000)}s`);
    }
    
    // Verificar tempo desde última mensagem
    const timeSinceLastMessage = now - stats.lastMessageAt;
    if (timeSinceLastMessage < delay) {
      delay = Math.max(delay - timeSinceLastMessage, ANTI_BAN_CONFIG.MIN_DELAY_MS);
    }
    
    return delay;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  REGISTRAR ENVIO DE MENSAGEM
  // ═══════════════════════════════════════════════════════════════════════════
  
  registerMessageSent(userId: string, contactNumber: string): { shouldPause: boolean; pauseDuration: number } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    // Atualizar stats
    stats.lastMessageAt = now;
    stats.consecutiveMessages++;
    
    // Verificar se atingiu o limite de lote
    if (stats.consecutiveMessages >= ANTI_BAN_CONFIG.BATCH_SIZE) {
      stats.isPaused = true;
      stats.pauseEndAt = now + ANTI_BAN_CONFIG.BATCH_PAUSE_MS;
      
      console.log(`🛡️ [ANTI-BAN v5.0] 📦 LOTE DE ${ANTI_BAN_CONFIG.BATCH_SIZE} MSGS ATINGIDO`);
      console.log(`   ⏸️ Iniciando pausa de ${ANTI_BAN_CONFIG.BATCH_PAUSE_MS/1000} segundos (1 minuto)`);
      
      return {
        shouldPause: true,
        pauseDuration: ANTI_BAN_CONFIG.BATCH_PAUSE_MS,
      };
    }
    
    console.log(`🛡️ [ANTI-BAN v5.0] ✅ Msg enviada - Lote: ${stats.consecutiveMessages}/${ANTI_BAN_CONFIG.BATCH_SIZE}`);
    
    return { shouldPause: false, pauseDuration: 0 };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  VERIFICAR SE PODE ENVIAR
  // ═══════════════════════════════════════════════════════════════════════════
  
  canSendMessage(userId: string): { canSend: boolean; waitMs: number; reason: string } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    // Verificar se está em pausa de lote
    if (stats.isPaused && now < stats.pauseEndAt) {
      const waitMs = stats.pauseEndAt - now;
      return {
        canSend: false,
        waitMs,
        reason: `Pausa de lote (${Math.ceil(waitMs/1000)}s restantes)`,
      };
    }
    
    return { canSend: true, waitMs: 0, reason: 'OK' };
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  CALCULAR DURAÇÃO DA DIGITAÇÃO
  // ═══════════════════════════════════════════════════════════════════════════
  
  calculateTypingDuration(messageLength: number): number {
    // Calcular tempo baseado no tamanho da mensagem
    const typingTime = (messageLength / ANTI_BAN_CONFIG.TYPING_CHARS_PER_SECOND) * 1000;
    
    // Limitar entre min e max
    return Math.min(
      Math.max(typingTime, ANTI_BAN_CONFIG.TYPING_MIN_MS),
      ANTI_BAN_CONFIG.TYPING_MAX_MS
    );
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  UTILITÁRIOS
  // ═══════════════════════════════════════════════════════════════════════════
  
  private randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }
  
  // ═══════════════════════════════════════════════════════════════════════════
  //  OBTER ESTATÍSTICAS
  // ═══════════════════════════════════════════════════════════════════════════
  
  getStats(userId: string): {
    consecutiveMessages: number;
    isPaused: boolean;
    pauseRemainingMs: number;
  } {
    const stats = this.getChannelStats(userId);
    const now = Date.now();
    
    return {
      consecutiveMessages: stats.consecutiveMessages,
      isPaused: stats.isPaused && now < stats.pauseEndAt,
      pauseRemainingMs: stats.isPaused ? Math.max(0, stats.pauseEndAt - now) : 0,
    };
  }
  
  // Método para resetar contador (útil quando há interação do cliente)
  resetBatchCounter(userId: string): void {
    const stats = this.getChannelStats(userId);
    stats.consecutiveMessages = 0;
    console.log(`🛡️ [ANTI-BAN v5.0] 🔄 Contador de lote resetado para ${userId.substring(0, 8)}...`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  🗂️ CACHE DE METADADOS DE GRUPOS (evitar rate limits)
// ═══════════════════════════════════════════════════════════════════════════════

interface GroupMetadata {
  id: string;
  subject: string;
  participants?: string[];
  admins?: string[];
  fetchedAt: number;
}

class GroupMetadataCache {
  private cache = new Map<string, GroupMetadata>();
  private readonly TTL_MS = 30 * 60 * 1000; // 30 minutos

  set(groupId: string, metadata: Omit<GroupMetadata, 'fetchedAt'>): void {
    this.cache.set(groupId, {
      ...metadata,
      fetchedAt: Date.now(),
    });
    console.log(`📦 [GROUP-CACHE] Metadados cacheados para grupo ${groupId.substring(0, 20)}...`);
  }

  get(groupId: string): GroupMetadata | null {
    const cached = this.cache.get(groupId);
    if (!cached) return null;
    
    // Verificar se expirou
    if (Date.now() - cached.fetchedAt > this.TTL_MS) {
      this.cache.delete(groupId);
      return null;
    }
    
    return cached;
  }

  has(groupId: string): boolean {
    const cached = this.get(groupId);
    return cached !== null;
  }

  delete(groupId: string): void {
    this.cache.delete(groupId);
  }

  clear(): void {
    this.cache.clear();
  }

  // Limpar entradas expiradas periodicamente
  cleanup(): void {
    const now = Date.now();
    const keysToDelete: string[] = [];
    
    this.cache.forEach((value, key) => {
      if (now - value.fetchedAt > this.TTL_MS) {
        keysToDelete.push(key);
      }
    });
    
    keysToDelete.forEach(key => this.cache.delete(key));
  }
}

export const groupMetadataCache = new GroupMetadataCache();

// Limpar cache a cada 10 minutos
setInterval(() => groupMetadataCache.cleanup(), 10 * 60 * 1000);

// ═══════════════════════════════════════════════════════════════════════════════
//  ⌨️ SIMULADOR DE DIGITAÇÃO (typing indicator)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Envia indicador de "digitando" antes de uma mensagem
 * @param socket - Socket do Baileys
 * @param jid - ID do chat
 * @param messageLength - Tamanho da mensagem (para calcular duração)
 */
export async function simulateTyping(
  socket: any,
  jid: string,
  messageLength: number = 100
): Promise<void> {
  if (!ANTI_BAN_CONFIG.TYPING_ENABLED || !socket) return;
  
  try {
    // Calcular duração baseada no tamanho da mensagem
    const duration = antiBanProtectionService.calculateTypingDuration(messageLength);
    
    // Enviar "composing" (digitando)
    await socket.sendPresenceUpdate('composing', jid);
    
    // Aguardar o tempo calculado
    await new Promise(resolve => setTimeout(resolve, duration));
    
    // Enviar "paused" (parou de digitar)
    await socket.sendPresenceUpdate('paused', jid);
    
    console.log(`⌨️ [TYPING] Simulação de digitação: ${Math.ceil(duration/1000)}s para ${jid.substring(0, 15)}...`);
  } catch (error) {
    // Erro de typing não deve bloquear envio
    console.warn(`⚠️ [TYPING] Erro ao simular digitação:`, error);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  SINGLETON EXPORT
// ═══════════════════════════════════════════════════════════════════════════════

export const antiBanProtectionService = new AntiBanProtectionService();
export default antiBanProtectionService;
