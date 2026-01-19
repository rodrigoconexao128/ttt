import { db } from "./db";
import { 
  conversations, 
  userFollowupLogs, 
  followupConfigs,
  messages,
  whatsappConnections,
  users,
  businessAgentConfigs
} from "@shared/schema";
import { eq, and, lte, isNotNull } from "drizzle-orm";
import { getMistralClient } from "./mistralClient";
import { storage } from "./storage";
import { getSessions } from "./whatsapp";

// ============================================================================
// � VERIFICAÇÃO DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
// ============================================================================
async function checkUserSuspensionForFollowUp(userId: string): Promise<boolean> {
  try {
    const suspensionStatus = await storage.isUserSuspended(userId);
    if (suspensionStatus.suspended) {
      console.log(`🚫 [USER-FOLLOW-UP] Usuário ${userId} está SUSPENSO - Follow-up desativado`);
      return true;
    }
    return false;
  } catch (error) {
    console.error(`⚠️ [USER-FOLLOW-UP] Erro ao verificar suspensão do usuário ${userId}:`, error);
    return false;
  }
}

// ============================================================================
// �🚀 SISTEMA DE CACHE PARA REDUZIR QUERIES NO DB
// ============================================================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

// Cache de configurações de follow-up por usuário
const followupConfigCache = new Map<string, CacheEntry<typeof followupConfigs.$inferSelect | null>>();

// Cache de configurações de agente por usuário
const agentConfigCache = new Map<string, CacheEntry<any>>();

// Cache global da chave Mistral
let mistralKeyCache: CacheEntry<string | null> | null = null;

// 🔒 ANTI-DUPLICAÇÃO: Cache de mensagens enviadas recentemente
// Armazena hash das mensagens enviadas por conversa nos últimos 30 minutos
const sentMessagesCache = new Map<string, { hash: string; timestamp: number }[]>();

// 🔒 ANTI-DUPLICAÇÃO: Set de conversas sendo processadas agora
// Evita que a mesma conversa seja processada em paralelo
const conversationsBeingProcessed = new Set<string>();

// Limpar cache de mensagens enviadas a cada 10 minutos
setInterval(() => {
  const now = Date.now();
  const THIRTY_MINUTES = 30 * 60 * 1000;
  
  for (const [convId, messages] of sentMessagesCache.entries()) {
    const filtered = messages.filter(m => now - m.timestamp < THIRTY_MINUTES);
    if (filtered.length === 0) {
      sentMessagesCache.delete(convId);
    } else {
      sentMessagesCache.set(convId, filtered);
    }
  }
}, 10 * 60 * 1000);

/**
 * Gera hash simples de uma mensagem para detectar duplicatas
 */
function generateMessageHash(message: string): string {
  const normalized = message.toLowerCase()
    .replace(/[^a-záéíóúàèìòùâêîôûãõ\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  
  // Hash simples baseado em soma de caracteres
  let hash = 0;
  for (let i = 0; i < normalized.length; i++) {
    hash = ((hash << 5) - hash) + normalized.charCodeAt(i);
    hash = hash & hash; // Convert to 32bit integer
  }
  return hash.toString(16);
}

/**
 * Verifica se uma mensagem similar já foi enviada recentemente
 */
function wasMessageRecentlySent(conversationId: string, message: string): boolean {
  const cache = sentMessagesCache.get(conversationId);
  if (!cache || cache.length === 0) return false;
  
  const newHash = generateMessageHash(message);
  return cache.some(m => m.hash === newHash);
}

/**
 * Registra uma mensagem como enviada
 */
function registerSentMessage(conversationId: string, message: string): void {
  const hash = generateMessageHash(message);
  const existing = sentMessagesCache.get(conversationId) || [];
  existing.push({ hash, timestamp: Date.now() });
  
  // Manter apenas últimas 20 mensagens no cache
  if (existing.length > 20) {
    existing.shift();
  }
  
  sentMessagesCache.set(conversationId, existing);
}

// Limpar caches expirados periodicamente
setInterval(() => {
  const now = Date.now();
  
  for (const [key, entry] of followupConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      followupConfigCache.delete(key);
    }
  }
  
  for (const [key, entry] of agentConfigCache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      agentConfigCache.delete(key);
    }
  }
  
  if (mistralKeyCache && now - mistralKeyCache.timestamp > CACHE_TTL_MS) {
    mistralKeyCache = null;
  }
}, 10 * 60 * 1000); // Limpar a cada 10 minutos

/**
 * Verifica se um usuário específico tem conexão WhatsApp ativa em memória
 * 🚀 OTIMIZADO: Não faz query no DB, apenas verifica memória
 * 
 * IMPORTANTE: Baileys usa socket.user para indicar conexão ativa (não socket.ws.readyState)
 */
function isUserConnectionActive(userId: string): boolean {
  const sessions = getSessions();
  const session = sessions.get(userId);
  // Baileys: socket.user !== undefined significa conexão ativa
  return session?.socket?.user !== undefined;
}

// ============================================================================
// FOLLOW-UP INTELIGENTE PARA USUÁRIOS
// Serviço que gerencia follow-ups automáticos para cada agente de usuário
// ============================================================================

// Intervalos padrão em minutos
const DEFAULT_INTERVALS = [10, 30, 180, 1440, 2880, 4320, 10080, 21600];

/**
 * Adiciona segundos aleatórios a uma data para parecer mais humano
 * Evita que todos os follow-ups sejam no mesmo segundo (parece robô)
 */
function addRandomSeconds(date: Date): Date {
  const randomSeconds = Math.floor(Math.random() * 45) + 5; // Entre 5 e 50 segundos
  return new Date(date.getTime() + randomSeconds * 1000);
}

/**
 * Validação básica de segurança - só rejeita casos extremos
 * A IA deve fazer o trabalho principal de gerar mensagens corretas
 */
function validateMessage(message: string): boolean {
  if (!message || message.trim().length < 10) {
    console.warn(`⚠️ [FOLLOW-UP] Mensagem muito curta ou vazia`);
    return false;
  }
  
  // Verificar se a mensagem está EXATAMENTE duplicada (mesma string 2x)
  const trimmed = message.trim();
  const halfLen = Math.floor(trimmed.length / 2);
  if (halfLen > 30) {
    const firstHalf = trimmed.substring(0, halfLen).trim();
    const secondHalf = trimmed.substring(halfLen).trim();
    if (firstHalf === secondHalf) {
      console.warn(`⚠️ [FOLLOW-UP] Mensagem exatamente duplicada detectada`);
      return false;
    }
  }
  
  return true;
}

type FollowUpCallback = (
  userId: string,
  conversationId: string,
  phoneNumber: string,
  remoteJid: string,
  message: string,
  stage: number
) => Promise<{ success: boolean; error?: string }>;

export class UserFollowUpService {
  private checkInterval: NodeJS.Timeout | null = null;
  private isRunning = false;
  private onFollowUpReady: FollowUpCallback | null = null;

  start() {
    if (this.isRunning) return;
    this.isRunning = true;
    console.log("🚀 [USER-FOLLOW-UP] Serviço iniciado");
    
    // Verificar a cada 5 minutos (otimizado para reduzir carga no DB)
    this.checkInterval = setInterval(() => this.processFollowUps(), 5 * 60 * 1000);
    // Aguardar 60s antes da primeira execução para não sobrecarregar na inicialização
    setTimeout(() => this.processFollowUps(), 60 * 1000);
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isRunning = false;
    console.log("🛑 [USER-FOLLOW-UP] Serviço parado");
  }

  registerCallback(callback: FollowUpCallback) {
    this.onFollowUpReady = callback;
    console.log("📲 [USER-FOLLOW-UP] Callback registrado");
  }

  /**
   * Processa todas as conversas pendentes de follow-up
   */
  private async processFollowUps() {
    try {
      // 🚀 REMOVIDO: Verificação global hasAnyActiveWhatsAppConnection()
      // Motivo: Após restart do servidor, a memória está vazia mas o banco tem conexões ativas
      // NOVA ESTRATÉGIA: Verificar conexão por usuário específico no executeFollowUp
      // Isso permite processar follow-ups de usuários conectados mesmo se outros não estão
      
      const now = new Date();
      
      // Buscar conversas que precisam de follow-up
      const pendingConversations = await db.query.conversations.findMany({
        where: and(
          eq(conversations.followupActive, true),
          isNotNull(conversations.nextFollowupAt),
          lte(conversations.nextFollowupAt, now)
        ),
        with: {
          connection: {
            with: {
              user: true
            }
          }
        }
      });

      if (pendingConversations.length > 0) {
        console.log(`🔍 [USER-FOLLOW-UP] Encontradas ${pendingConversations.length} conversas para processar`);
      }

      for (const conv of pendingConversations) {
        await this.executeFollowUp(conv);
      }
    } catch (error) {
      console.error("❌ [USER-FOLLOW-UP] Erro ao processar follow-ups:", error);
    }
  }

  /**
   * Executa follow-up para uma conversa específica
   */
  private async executeFollowUp(conversation: any) {
    const userId = conversation.connection?.userId;
    if (!userId) {
      console.warn(`⚠️ [USER-FOLLOW-UP] Conversa ${conversation.id} sem userId`);
      return;
    }

    // � VERIFICAÇÃO CRÍTICA: Re-validar se followup ainda está ativo
    // Evita enviar mensagens de followup que foram desativadas entre a query inicial e o processamento
    const [currentConv] = await db.select()
      .from(conversations)
      .where(eq(conversations.id, conversation.id))
      .limit(1);
    
    if (!currentConv || !currentConv.followupActive) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO para conversa ${conversation.contactNumber} - cancelando envio`);
      return;
    }

    // �🚫 VERIFICAÇÃO DE SUSPENSÃO: Usuários suspensos não podem usar follow-up
    const isSuspended = await checkUserSuspensionForFollowUp(userId);
    if (isSuspended) {
      console.log(`🚫 [USER-FOLLOW-UP] Usuário ${userId} está SUSPENSO - desativando follow-up da conversa`);
      await this.disableFollowUp(conversation.id, "Conta suspensa por violação de políticas");
      return;
    }

    // 🔌 VERIFICAÇÃO POR USUÁRIO: Verificar se ESTE usuário específico tem conexão ativa
    // Isso permite processar follow-ups de outros usuários mesmo se este não está conectado
    if (!isUserConnectionActive(userId)) {
      // Reagendar apenas ESTA conversa para tentar novamente em 5 minutos
      // NÃO bloqueia outras conversas de outros usuários!
      const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
      await db.update(conversations)
        .set({ 
          nextFollowupAt: retryDate,
          followupDisabledReason: '🔄 Aguardando conexão WhatsApp...'
        })
        .where(eq(conversations.id, conversation.id));
      // Log apenas se for primeira vez (evitar spam no console)
      if (conversation.followupDisabledReason !== '🔄 Aguardando conexão WhatsApp...') {
        console.log(`⏸️ [USER-FOLLOW-UP] Usuário ${userId} sem conexão ativa - reagendando ${conversation.contactNumber}`);
      }
      return;
    }

    // 🔒 ANTI-DUPLICAÇÃO: Verificar se esta conversa já está sendo processada
    if (conversationsBeingProcessed.has(conversation.id)) {
      console.log(`⏳ [USER-FOLLOW-UP] Conversa ${conversation.contactNumber} já está sendo processada - ignorando`);
      return;
    }
    
    // Marcar como em processamento
    conversationsBeingProcessed.add(conversation.id);

    console.log(`👉 [USER-FOLLOW-UP] Processando ${conversation.contactNumber} (Estágio ${conversation.followupStage})`);

    try {
      // 🚫 LISTA DE EXCLUSÃO: Verificar se o número está excluído de follow-up
      const isExcludedFromFollowup = await storage.isNumberExcludedFromFollowup(userId, conversation.contactNumber);
      if (isExcludedFromFollowup) {
        console.log(`🚫 [USER-FOLLOW-UP] Número ${conversation.contactNumber} está na LISTA DE EXCLUSÃO - não enviar follow-up`);
        await this.disableFollowUp(conversation.id, "Número na lista de exclusão");
        return;
      }

      // 1. Buscar configuração de follow-up do usuário
      const config = await this.getFollowupConfig(userId);
      if (!config || !config.isEnabled) {
        console.log(`🛑 [USER-FOLLOW-UP] Follow-up desativado para usuário ${userId}`);
        await this.disableFollowUp(conversation.id, "Usuário desativou follow-up");
        return;
      }

      // 2. Verificar horário comercial
      if (config.respectBusinessHours && !this.isBusinessHours(config)) {
        console.log(`⏰ [USER-FOLLOW-UP] Fora do horário comercial para ${conversation.contactNumber}`);
        // Agendar para o próximo horário comercial
        const nextBusinessTime = this.getNextBusinessTime(config);
        await this.scheduleNextFollowUp(conversation.id, nextBusinessTime);
        return;
      }

      // 3. Analisar histórico com IA
      const decision = await this.analyzeWithAI(conversation, config);
      
      if (decision.action === 'abort') {
        console.log(`🛑 [USER-FOLLOW-UP] Abortado pela IA para ${conversation.contactNumber}: ${decision.reason}`);
        await this.disableFollowUp(conversation.id, decision.reason);
        await this.logFollowUp(conversation, userId, 'cancelled', null, decision, decision.reason);
        return;
      }

      // 📅 NOVO: Cliente pediu para retornar em data específica
      if (decision.action === 'schedule' && decision.scheduleDate) {
        const scheduleDate = new Date(decision.scheduleDate);
        console.log(`📅 [USER-FOLLOW-UP] Cliente pediu para retornar em ${scheduleDate.toLocaleDateString('pt-BR')}: ${decision.reason}`);
        await this.scheduleNextFollowUp(conversation.id, scheduleDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, `Reagendado para ${scheduleDate.toLocaleDateString('pt-BR')} conforme combinado`);
        // Atualizar motivo visível
        await db.update(conversations)
          .set({ followupDisabledReason: `📅 Combinado retornar em ${scheduleDate.toLocaleDateString('pt-BR')}` })
          .where(eq(conversations.id, conversation.id));
        return;
      }

      if (decision.action === 'wait') {
        console.log(`⏳ [USER-FOLLOW-UP] IA sugeriu esperar para ${conversation.contactNumber}: ${decision.reason}`);
        // Adiar por 24h com segundos aleatórios
        const nextDate = addRandomSeconds(new Date(Date.now() + 24 * 60 * 60 * 1000));
        await this.scheduleNextFollowUp(conversation.id, nextDate);
        await this.logFollowUp(conversation, userId, 'skipped', null, decision, decision.reason);
        return;
      }

      // 4. Gerar mensagem de follow-up
      if (decision.action === 'send' && decision.message) {
        // ⚠️ VERIFICAÇÃO CRÍTICA: Re-validar estado do followup antes de enviar
        // Evita enviar se usuário desativou followup enquanto IA estava processando
        const [recheck] = await db.select()
          .from(conversations)
          .where(eq(conversations.id, conversation.id))
          .limit(1);
        
        if (!recheck || !recheck.followupActive) {
          console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO durante processamento para ${conversation.contactNumber} - cancelando envio`);
          return;
        }
        
        // 🔒 VERIFICAÇÃO CRÍTICA: Se IA está desativada, NÃO enviar follow-up
        // Follow-up só deve funcionar quando IA está ativa
        const isAgentEnabled = await storage.isAgentEnabledForConversation(conversation.id);
        if (!isAgentEnabled) {
          console.log(`🛑 [USER-FOLLOW-UP] IA desativada para ${conversation.contactNumber} - cancelando follow-up`);
          await this.disableFollowUp(conversation.id, "IA desativada pelo usuário");
          return;
        }
        
        // �🔒 ANTI-DUPLICAÇÃO: Verificar se mensagem similar já foi enviada recentemente
        if (wasMessageRecentlySent(conversation.id, decision.message)) {
          console.warn(`🔒 [USER-FOLLOW-UP] Mensagem DUPLICADA detectada para ${conversation.contactNumber} - NÃO enviando`);
          const nextDate = addRandomSeconds(new Date(Date.now() + 60 * 60 * 1000)); // 1 hora
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem duplicada bloqueada');
          return;
        }
        
        // 4.1 Validação básica de segurança (a IA deve gerar mensagem correta)
        if (!validateMessage(decision.message)) {
          console.warn(`⚠️ [USER-FOLLOW-UP] Mensagem inválida para ${conversation.contactNumber}, reagendando`);
          const nextDate = addRandomSeconds(new Date(Date.now() + 30 * 60 * 1000)); // 30 min
          await this.scheduleNextFollowUp(conversation.id, nextDate);
          await this.logFollowUp(conversation, userId, 'skipped', decision.message, decision, 'Mensagem inválida');
          return;
        }

        if (this.onFollowUpReady && conversation.remoteJid) {
          console.log(`📤 [USER-FOLLOW-UP] Disparando follow-up para ${conversation.contactNumber}`);
          
          const result = await this.onFollowUpReady(
            userId,
            conversation.id,
            conversation.contactNumber,
            conversation.remoteJid,
            decision.message, // Mensagem da IA (já deve estar correta)
            conversation.followupStage || 0
          );

          if (result.success) {
            // ✅ Registrar mensagem enviada no cache anti-duplicação
            registerSentMessage(conversation.id, decision.message);
            
            // Sucesso: Logar e agendar próximo estágio
            await this.logFollowUp(
              conversation, 
              userId, 
              'sent', 
              decision.message,
              decision, 
              null
            );
            await this.advanceToNextStage(conversation, config);
            
            // 🔄 REATIVAR IA: Quando follow-up é enviado, reativar IA SOMENTE se follow-up ainda estiver ativo
            // Isso evita reativar IA se o usuário desativou o follow-up enquanto processava
            try {
              // Buscar estado atualizado da conversa
              const [currentConv] = await db.select()
                .from(conversations)
                .where(eq(conversations.id, conversation.id))
                .limit(1);
              
              // Só reativa se follow-up ainda estiver ativo
              if (currentConv?.followupActive) {
                await storage.enableAgentForConversation(conversation.id);
                console.log(`🤖 [USER-FOLLOW-UP] IA reativada para ${conversation.contactNumber} após follow-up`);
              } else {
                console.log(`⏭️ [USER-FOLLOW-UP] IA NÃO reativada - follow-up foi desativado para ${conversation.contactNumber}`);
              }
            } catch (reactivateError) {
              console.warn(`⚠️ [USER-FOLLOW-UP] Erro ao reativar IA para ${conversation.contactNumber}:`, reactivateError);
            }
          } else {
            // Falha (ex: WhatsApp desconectado): NÃO logar como falha, apenas reagendar
            // Isso evita poluir o histórico com "falhas" que são apenas reconexões
            const isConnectionError = result.error?.toLowerCase().includes('not connected') || 
                                       result.error?.toLowerCase().includes('connection') ||
                                       result.error?.toLowerCase().includes('socket');
            
            if (isConnectionError) {
              // Erro de conexão: reagendar silenciosamente para tentar em 2 minutos
              console.log(`🔄 [USER-FOLLOW-UP] WhatsApp desconectado, reagendando em 2 minutos: ${result.error}`);
              const retryDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
              await db.update(conversations)
                .set({ 
                  nextFollowupAt: retryDate,
                  followupDisabledReason: `🔄 Aguardando conexão WhatsApp...`
                })
                .where(eq(conversations.id, conversation.id));
            } else {
              // Outro tipo de erro: logar como falha
              await this.logFollowUp(
                conversation, 
                userId, 
                'failed', 
                decision.message, 
                decision, 
                result.error
              );
              // Reagendar para tentar novamente em 5 minutos
              const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
              await db.update(conversations)
                .set({ 
                  nextFollowupAt: retryDate,
                  followupDisabledReason: `⚠️ Erro: ${result.error}`
                })
                .where(eq(conversations.id, conversation.id));
            }
          }
        } else {
          console.warn("⚠️ [USER-FOLLOW-UP] Callback não registrado ou remoteJid ausente");
          // Reagendar para tentar em 5 minutos com segundos aleatórios
          const retryDate = addRandomSeconds(new Date(Date.now() + 5 * 60 * 1000));
          await db.update(conversations)
            .set({ nextFollowupAt: retryDate })
            .where(eq(conversations.id, conversation.id));
        }
      }

    } catch (error) {
      console.error(`❌ [USER-FOLLOW-UP] Erro ao executar para ${conversation.contactNumber}:`, error);
    } finally {
      // 🔓 ANTI-DUPLICAÇÃO: Liberar lock da conversa
      conversationsBeingProcessed.delete(conversation.id);
    }
  }

  /**
   * Busca ou cria configuração de follow-up para o usuário (COM CACHE)
   */
  async getFollowupConfig(userId: string) {
    // 🚀 Verificar cache primeiro
    const cached = followupConfigCache.get(userId);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
      return cached.data;
    }
    
    let config = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (!config) {
      // Criar configuração padrão - DESATIVADO por padrão, usuário precisa ativar
      const [newConfig] = await db.insert(followupConfigs).values({
        userId,
        isEnabled: false,
        maxAttempts: 8,
        intervalsMinutes: DEFAULT_INTERVALS,
        businessHoursStart: "09:00",
        businessHoursEnd: "18:00",
        businessDays: [1, 2, 3, 4, 5],
        respectBusinessHours: true,
        tone: "consultivo",
        formalityLevel: 5,
        useEmojis: true,
        importantInfo: [],
        infiniteLoop: true,
        infiniteLoopMinDays: 15,
        infiniteLoopMaxDays: 30,
      }).returning();
      config = newConfig;
    }

    // 🚀 Salvar no cache
    followupConfigCache.set(userId, { data: config, timestamp: Date.now() });
    
    return config;
  }

  /**
   * Atualiza configuração de follow-up (invalida cache)
   */
  async updateFollowupConfig(userId: string, data: Partial<typeof followupConfigs.$inferInsert>) {
    // 🚀 Invalidar cache ao atualizar
    followupConfigCache.delete(userId);
    
    // Remover campos que não devem ser atualizados pelo frontend
    const { id, userId: _, createdAt, updatedAt, ...cleanData } = data as any;
    
    const existing = await db.query.followupConfigs.findFirst({
      where: eq(followupConfigs.userId, userId)
    });

    if (existing) {
      const [updated] = await db.update(followupConfigs)
        .set({ ...cleanData, updatedAt: new Date() })
        .where(eq(followupConfigs.userId, userId))
        .returning();
      
      // 🚀 Atualizar cache
      followupConfigCache.set(userId, { data: updated, timestamp: Date.now() });
      return updated;
    } else {
      const [created] = await db.insert(followupConfigs)
        .values({ userId, ...cleanData })
        .returning();
      
      // 🚀 Salvar no cache
      followupConfigCache.set(userId, { data: created, timestamp: Date.now() });
      return created;
    }
  }

  /**
   * Usa IA para analisar se deve enviar follow-up e qual mensagem
   * VERSÃO MELHORADA: Lê contexto completo, entende o negócio, evita repetições
   */
  private async analyzeWithAI(conversation: any, config: any): Promise<{
    action: 'send' | 'wait' | 'abort' | 'schedule';
    reason: string;
    message?: string;
    context?: string;
    scheduleDate?: string;
  }> {
    // Buscar mensagens recentes - AUMENTADO para ter contexto COMPLETO da conversa
    // Isso é essencial para o follow-up entender onde a conversa parou
    const recentMessages = await db.query.messages.findMany({
      where: eq(messages.conversationId, conversation.id),
      orderBy: (messages, { desc }) => [desc(messages.timestamp)],
      limit: 40 // Aumentado para 40 mensagens para contexto completo
    });

    // Buscar configuração do agente para entender o negócio
    const userId = conversation.connection?.userId;
    let businessContext = "";
    let agentName = "";
    let companyName = "";
    
    if (userId) {
      try {
        const businessConfig = await db.query.businessAgentConfigs.findFirst({
          where: eq(businessAgentConfigs.userId, userId)
        });
        
        if (businessConfig) {
          agentName = businessConfig.agentName || "";
          companyName = businessConfig.companyName || "";
          const products = businessConfig.productsServices || [];
          const productsList = Array.isArray(products) && products.length > 0
            ? products.map((p: any) => `- ${p.name}: ${p.description || ''} ${p.price ? `(${p.price})` : ''}`).join('\n')
            : '';
          
          businessContext = `
SOBRE O NEGÓCIO:
- Empresa: ${companyName || 'Não informado'}
- Agente: ${agentName || 'Assistente'}
- Cargo: ${businessConfig.agentRole || 'Assistente Virtual'}
- Descrição: ${businessConfig.companyDescription || 'Não informada'}
${productsList ? `\nPRODUTOS/SERVIÇOS:\n${productsList}` : ''}
`;
        }
      } catch (e) {
        console.warn("Erro ao buscar business config:", e);
      }
    }

    // Formatar histórico de forma limpa e completa
    const historyFormatted = recentMessages
      .reverse()
      .map(m => {
        let content = m.text || '';
        // Se é mídia sem texto, indicar de forma natural
        if (!content && m.mediaType) {
          if (m.mediaType === 'audio') content = '(cliente enviou um áudio)';
          else if (m.mediaType === 'image') content = '(cliente enviou uma imagem)';
          else if (m.mediaType === 'video') content = '(cliente enviou um vídeo)';
          else if (m.mediaType === 'document') content = '(cliente enviou um documento)';
          else content = '(cliente enviou uma mídia)';
        }
        // Limpar a palavra "Áudio" que pode ter ficado
        content = content.replace(/\s*Áudio\s*$/gi, '').trim();
        content = content.replace(/\s*Audio\s*$/gi, '').trim();
        
        return {
          de: m.fromMe ? "NÓS" : "CLIENTE",
          mensagem: content,
          hora: m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
        };
      });

    // Calcular tempo desde última mensagem
    const lastClientMessage = recentMessages.find(m => !m.fromMe);
    const lastOurMessage = recentMessages.find(m => m.fromMe);
    const lastClientTime = lastClientMessage?.timestamp ? new Date(lastClientMessage.timestamp) : null;
    const lastOurTime = lastOurMessage?.timestamp ? new Date(lastOurMessage.timestamp) : null;
    const now = new Date();
    
    // Data atual em formato brasileiro
    const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const todayStr = brazilNow.toLocaleDateString('pt-BR');
    const dayOfWeek = brazilNow.getDay();
    const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
    const todayName = dayNames[dayOfWeek];
    
    const minutesSinceClient = lastClientTime 
      ? Math.floor((now.getTime() - lastClientTime.getTime()) / (1000 * 60)) 
      : 9999;
    const minutesSinceOur = lastOurTime 
      ? Math.floor((now.getTime() - lastOurTime.getTime()) / (1000 * 60)) 
      : 9999;
    
    // Determinar quem falou por último
    const lastMessageWasOurs = lastOurTime && lastClientTime ? lastOurTime > lastClientTime : !!lastOurTime;
    
    // Nome do cliente (do WhatsApp)
    const clientName = conversation.contactName || '';
    
    // Pegar últimas 5 mensagens que enviamos para evitar repetição
    const ourLastMessages = recentMessages
      .filter(m => m.fromMe && m.text)
      .slice(0, 5)
      .map(m => m.text?.replace(/\s*Áudio\s*$/gi, '').trim());

    // Identificar se o cliente reclamou ou deu feedback negativo
    const clientFeedback = recentMessages
      .filter(m => !m.fromMe && m.text)
      .map(m => m.text?.toLowerCase() || '')
      .join(' ');
    
    const hasNegativeFeedback = 
      clientFeedback.includes('repetiu') ||
      clientFeedback.includes('repetindo') ||
      clientFeedback.includes('sem ler') ||
      clientFeedback.includes('não leu') ||
      clientFeedback.includes('lendo') ||
      clientFeedback.includes('mesmo texto') ||
      clientFeedback.includes('já disse') ||
      clientFeedback.includes('já falei');

    // Extrair última mensagem do cliente para contexto
    const lastClientText = lastClientMessage?.text?.replace(/\s*Áudio\s*$/gi, '').trim() || '';

    const toneMap: Record<string, string> = {
      'consultivo': 'consultivo e prestativo',
      'vendedor': 'vendedor persuasivo mas sutil',
      'humano': 'casual e amigável',
      'técnico': 'profissional e direto'
    };

    // Identificar o último assunto/tópico da conversa
    const lastTopics = historyFormatted.slice(-5).map(h => h.mensagem).join(' ');
    
    // Verificar se já oferecemos algo específico
    const offeredDemo = ourLastMessages.some(m => m?.toLowerCase().includes('demo') || m?.toLowerCase().includes('vídeo') || m?.toLowerCase().includes('teste'));
    const offeredPrice = ourLastMessages.some(m => m?.toLowerCase().includes('99') || m?.toLowerCase().includes('199') || m?.toLowerCase().includes('preço') || m?.toLowerCase().includes('plano'));
    const askedQuestion = ourLastMessages[0]?.includes('?');

    const prompt = `## 📌 O QUE É FOLLOW-UP E QUANDO USAR

FOLLOW-UP significa "acompanhamento" - é uma mensagem que enviamos para RETOMAR uma conversa que FICOU PARADA.

❌ **FOLLOW-UP NÃO É:**
- Responder mensagem normal do cliente (isso é conversa, não follow-up)
- Enviar se já mandamos msg há menos de 2 horas
- Repetir a mesma informação de antes
- Insistir quando cliente não quer

✅ **FOLLOW-UP É:**
- Retomar contato quando CLIENTE ficou em silêncio há MUITAS HORAS
- Continuar de onde a conversa PAROU, não começar do zero
- Agregar VALOR NOVO (nova info, novo benefício, nova abordagem)
- Ser natural como um humano falaria

---

## 🎯 SUA IDENTIDADE
- Você é: ${agentName || 'Assistente Virtual'} da ${companyName || 'empresa'}
${businessContext}

## 📅 MOMENTO ATUAL
- Data: ${todayStr} (${todayName})  
- Hora: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

## 👤 CLIENTE: ${clientName || 'Não identificado'}

## ⏰ ANÁLISE TEMPORAL CRÍTICA
- CLIENTE respondeu há: **${minutesSinceClient} minutos** (${Math.floor(minutesSinceClient/60)}h ${minutesSinceClient % 60}min)
- NÓS enviamos msg há: **${minutesSinceOur} minutos**
- Quem falou por ÚLTIMO: **${lastMessageWasOurs ? '⚠️ NÓS (cliente não respondeu)' : '🟢 CLIENTE (aguardando NOSSA resposta)'}**
- Estágio do follow-up: ${conversation.followupStage || 0}
${hasNegativeFeedback ? '\n⛔ **ALERTA CRÍTICO**: Cliente JÁ RECLAMOU de mensagens repetidas!' : ''}

## 💬 HISTÓRICO COMPLETO (LEIA TUDO COM ATENÇÃO!)
${historyFormatted.map(h => `[${h.hora}] ${h.de}: ${h.mensagem}`).join('\n')}

## 🚫 NOSSAS ÚLTIMAS MENSAGENS (NÃO REPITA NENHUMA DELAS!)
${ourLastMessages.length > 0 ? ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n') : '(nenhuma ainda)'}

## 🧠 ANÁLISE INTELIGENTE DO CONTEXTO
- Última fala do cliente: "${lastClientText}"
- Já oferecemos demonstração: ${offeredDemo ? 'SIM' : 'NÃO'}
- Já falamos de preço/planos: ${offeredPrice ? 'SIM' : 'NÃO'}

---

## 🎯 REGRAS DE DECISÃO (SIGA RIGOROSAMENTE!)

### WAIT (esperar) - Escolha quando:
1. Cliente respondeu há MENOS de 2 horas (conversa ativa, não incomodar)
2. NÓS enviamos msg há menos de 2 horas e cliente não respondeu (dar tempo)
3. Cliente pediu para esperar, disse que está ocupado
4. Não temos nada NOVO para agregar

### SEND (enviar) - Escolha APENAS quando TODOS os critérios:
1. Cliente parou de responder há MAIS de 2 horas
2. Temos algo NOVO/DIFERENTE para falar (não repetir)
3. A conversa não teve fechamento negativo

### ABORT (cancelar follow-up) - Escolha quando:
1. Cliente disse NÃO claramente, rejeitou
2. Cliente já comprou/fechou
3. Cliente pediu para não enviar mais mensagens

### SCHEDULE (agendar) - Escolha quando:
1. Cliente mencionou data específica ("me liga segunda", "depois do carnaval")

---

## ✍️ COMO ESCREVER A MENSAGEM (se action=send)

1. **CONTINUE DE ONDE PAROU**: Releia o histórico e continue o ASSUNTO que estava em discussão
2. **SEJA DIFERENTE**: Use abordagem/palavras diferentes das msgs anteriores
3. **AGREGUE VALOR**: Traga informação nova, benefício novo, ângulo novo
4. **SEJA CURTO**: Máximo 2-3 frases, WhatsApp não é email
5. **SEJA HUMANO**: Escreva como pessoa real, não robô
6. **USE O NOME**: Chame o cliente pelo nome se souber

⛔ **NUNCA NO FOLLOW-UP**:
- NÃO cumprimente novamente (sem "Bom dia", "Oi", "Olá") - já conversamos hoje!
- NÃO se apresente de novo (sem "Sou X da empresa Y")
- NÃO repita a mesma pergunta que já fez
- NÃO envie a mesma mensagem com palavras diferentes
- NÃO seja formal demais ou robótico

✅ **EXEMPLOS BONS de follow-up natural**:
- "E aí, conseguiu pensar sobre o que conversamos?"
- "Vi aqui que ficou uma dúvida sobre X, quer que eu explique melhor?"
- "Só passando pra ver se posso te ajudar com mais alguma coisa"
- "Lembrei de você! Ainda está interessado em X?"

**Tom**: ${toneMap[config.tone] || 'consultivo'}
**Emojis**: ${config.useEmojis ? 'Pode usar 1 emoji sutil' : 'NÃO use emojis'}

---

## 📋 RESPONDA APENAS EM JSON (sem texto antes ou depois):
{"action":"wait|send|abort|schedule","reason":"explicação curta do motivo","message":"texto pronto (só se action=send)","scheduleDate":"YYYY-MM-DDTHH:MM (só se action=schedule)"}`;

    try {
      const mistral = await getMistralClient();
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.8 // Mais criatividade para variar mensagens
      });
      
      const rawContent = response.choices?.[0]?.message?.content || "";
      const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
      const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
      
      // Tentar parsear JSON
      const parsed = JSON.parse(jsonStr);
      
      // 🔧 NOVA VERIFICAÇÃO: Se quem falou por último foi o CLIENTE, não é follow-up!
      // Follow-up é para retomar conversa quando CLIENTE não respondeu
      if (!lastMessageWasOurs && minutesSinceClient < 120) {
        console.log(`⏸️ [FOLLOW-UP] Cliente respondeu há ${minutesSinceClient}min e foi o último a falar - aguardando NOSSA resposta normal, não follow-up`);
        return { action: 'wait', reason: 'Cliente foi o último a falar - aguardar resposta normal da IA, não follow-up' };
      }
      
      // Se action é schedule, validar a data
      if (parsed.action === 'schedule' && parsed.scheduleDate) {
        const scheduleDate = new Date(parsed.scheduleDate);
        if (isNaN(scheduleDate.getTime())) {
          console.warn(`⚠️ [FOLLOW-UP] Data inválida retornada pela IA: ${parsed.scheduleDate}`);
          return { action: 'wait', reason: 'Data de agendamento inválida' };
        }
        // Se a data é no passado, ajustar para o futuro
        if (scheduleDate < now) {
          scheduleDate.setDate(scheduleDate.getDate() + 7);
        }
        return {
          action: 'schedule',
          reason: parsed.reason || 'Cliente combinou data',
          scheduleDate: scheduleDate.toISOString(),
          context: parsed.strategy
        };
      }
      
      // Validar e limpar mensagem gerada
      let message = parsed.message;
      if (message) {
        // Remover colchetes e conteúdo problemático
        message = message.replace(/\[.*?\]/g, '').trim();
        // Remover opções com barra
        message = message.replace(/\b\w+\/\w+(\/\w+)*/g, '').trim();
        // Remover "Áudio" do final
        message = message.replace(/\s*Áudio\s*$/gi, '').trim();
        message = message.replace(/\s*Audio\s*$/gi, '').trim();
        // Limpar espaços duplos
        message = message.replace(/\s+/g, ' ').trim();
        
        // 🔧 VERIFICAÇÃO MELHORADA DE REPETIÇÃO - THRESHOLD AUMENTADO PARA 60%
        // Verificar se é muito similar a mensagens anteriores
        const isSimilar = ourLastMessages.some(prev => {
          if (!prev) return false;
          const similarity = this.calculateTextSimilarity(message, prev);
          console.log(`📊 Similaridade com msg anterior: ${(similarity * 100).toFixed(1)}%`);
          return similarity > 0.6; // 60% similar = muito parecido (MAIS RESTRITIVO)
        });
        
        if (isSimilar) {
          console.warn(`⚠️ [FOLLOW-UP] Mensagem SIMILAR detectada (>60%) - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Mensagem muito similar à anterior - evitando repetição' };
        }
        
        // Verificar se a mensagem parece repetitiva (mesma estrutura)
        const sameStructure = ourLastMessages.some(prev => {
          if (!prev) return false;
          // Se começa igual (primeiras 30 chars) ou termina igual (últimas 30 chars)
          const msgStart = message.substring(0, 30).toLowerCase();
          const msgEnd = message.substring(Math.max(0, message.length - 30)).toLowerCase();
          const prevStart = prev.substring(0, 30).toLowerCase();
          const prevEnd = prev.substring(Math.max(0, prev.length - 30)).toLowerCase();
          
          const startSame = msgStart === prevStart && msgStart.length > 12;
          const endSame = msgEnd === prevEnd && msgEnd.length > 12;
          
          if (startSame || endSame) {
            console.log(`📊 Estrutura similar: início=${startSame}, fim=${endSame}`);
          }
          return startSame || endSame;
        });
        
        if (sameStructure) {
          console.warn(`⚠️ [FOLLOW-UP] Estrutura REPETITIVA - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Estrutura de mensagem repetitiva - evitando irritar cliente' };
        }
        
        // Verificar se contém frases exatamente iguais de msgs anteriores
        const hasExactPhrase = ourLastMessages.some(prev => {
          if (!prev || prev.length < 20) return false;
          // Dividir em frases e verificar se alguma é igual
          const prevPhrases = prev.split(/[.!?]/).filter(p => p.trim().length > 12);
          const newPhrases = message.split(/[.!?]/).filter(p => p.trim().length > 12);
          
          return newPhrases.some(np => 
            prevPhrases.some(pp => 
              np.trim().toLowerCase() === pp.trim().toLowerCase()
            )
          );
        });
        
        if (hasExactPhrase) {
          console.warn(`⚠️ [FOLLOW-UP] Frase EXATA repetida - NÃO ENVIANDO`);
          return { action: 'wait', reason: 'Contém frase exatamente igual a anterior' };
        }
        
        // 🆕 VERIFICAÇÃO EXTRA: Palavras-chave muito repetidas
        const keyPhrases = ['entendi', 'vamos resolver', 'passo a passo', 'fico feliz', 'estou à disposição'];
        const msgLower = message.toLowerCase();
        for (const phrase of keyPhrases) {
          const usedBefore = ourLastMessages.some(prev => prev?.toLowerCase().includes(phrase));
          if (usedBefore && msgLower.includes(phrase)) {
            console.warn(`⚠️ [FOLLOW-UP] Frase "${phrase}" já usada antes - NÃO ENVIANDO`);
            return { action: 'wait', reason: `Frase "${phrase}" repetida - gerar mensagem diferente` };
          }
        }
      }
      
      return {
        action: parsed.action || 'wait',
        reason: parsed.reason || 'Decisão da IA',
        message: message,
        context: parsed.strategy
      };
    } catch (e) {
      console.error("Erro na análise de IA:", e);
      return { action: 'wait', reason: "Erro na análise de IA" };
    }
  }
  
  /**
   * Calcula similaridade entre dois textos (0 a 1)
   */
  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = text1.toLowerCase().split(/\s+/);
    const words2 = text2.toLowerCase().split(/\s+/);
    
    if (words1.length === 0 || words2.length === 0) return 0;
    
    let matches = 0;
    for (const word of words1) {
      if (word.length > 3 && words2.includes(word)) matches++;
    }
    
    return matches / Math.max(words1.length, words2.length);
  }

  /**
   * Verifica se está em horário comercial (timezone Brasil)
   */
  private isBusinessHours(config: any): boolean {
    // Usar timezone do Brasil
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const currentDay = brazilTime.getDay(); // 0 = domingo
    const currentHour = brazilTime.getHours();
    const currentMin = brazilTime.getMinutes();
    const currentTime = `${currentHour.toString().padStart(2, '0')}:${currentMin.toString().padStart(2, '0')}`;

    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    if (!businessDays.includes(currentDay)) {
      console.log(`⏰ [FOLLOW-UP] Dia ${currentDay} não está nos dias úteis ${JSON.stringify(businessDays)}`);
      return false;
    }

    const start = String(config.businessHoursStart || "09:00").slice(0, 5);
    const end = String(config.businessHoursEnd || "18:00").slice(0, 5);

    const isOpen = currentTime >= start && currentTime <= end;
    console.log(`⏰ [FOLLOW-UP] Horário atual: ${currentTime}, Horário comercial: ${start}-${end}, Aberto: ${isOpen}`);
    
    return isOpen;
  }

  /**
   * Calcula próximo horário comercial disponível (timezone Brasil)
   */
  private getNextBusinessTime(config: any): Date {
    const now = new Date();
    const brazilTime = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
    const businessDays = config.businessDays || [1, 2, 3, 4, 5];
    const start = String(config.businessHoursStart || "09:00").slice(0, 5);
    const [startHour, startMin] = start.split(':').map(Number);

    // Próximo dia útil às 9h
    let next = new Date(brazilTime);
    next.setHours(startHour, startMin, 0, 0);

    // Se já passou do horário de início hoje, ir para amanhã
    if (brazilTime >= next) {
      next.setDate(next.getDate() + 1);
    }

    // Avançar até encontrar um dia útil
    while (!businessDays.includes(next.getDay())) {
      next.setDate(next.getDate() + 1);
    }

    console.log(`📅 [FOLLOW-UP] Próximo horário comercial: ${next.toLocaleString('pt-BR')}`);
    return next;
  }

  /**
   * Avança para o próximo estágio de follow-up
   */
  private async advanceToNextStage(conversation: any, config: any) {
    const currentStage = conversation.followupStage || 0;
    const nextStage = currentStage + 1;
    const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;

    let nextDate: Date;

    if (nextStage >= intervals.length) {
      if (config.infiniteLoop) {
        // Loop infinito: aleatorizar entre min e max dias
        const minDays = config.infiniteLoopMinDays || 15;
        const maxDays = config.infiniteLoopMaxDays || 30;
        const randomDays = Math.floor(Math.random() * (maxDays - minDays + 1) + minDays);
        nextDate = addRandomSeconds(new Date(Date.now() + randomDays * 24 * 60 * 60 * 1000));
        console.log(`🔄 [USER-FOLLOW-UP] Loop infinito: próximo em ${randomDays} dias`);
      } else {
        // Desativar follow-up
        await this.disableFollowUp(conversation.id, "Sequência completa");
        return;
      }
    } else {
      // FIX: Usar o intervalo do PRÓXIMO estágio, não do atual
      const delayMinutes = intervals[nextStage];
      nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));
      console.log(`⏰ [USER-FOLLOW-UP] Estágio ${currentStage} → ${nextStage}, intervalo: ${delayMinutes} minutos`);
    }

    await db.update(conversations)
      .set({ 
        followupStage: nextStage,
        nextFollowupAt: nextDate 
      })
      .where(eq(conversations.id, conversation.id));

    console.log(`📅 [USER-FOLLOW-UP] Próximo follow-up agendado para ${nextDate.toLocaleString()}`);
  }

  /**
   * Agenda próximo follow-up para uma data específica
   */
  private async scheduleNextFollowUp(conversationId: string, date: Date) {
    await db.update(conversations)
      .set({ nextFollowupAt: date })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Desativa follow-up para uma conversa
   */
  async disableFollowUp(conversationId: string, reason: string = "Desativado") {
    console.log(`🛑 [USER-FOLLOW-UP] Desativando para conversa ${conversationId}. Motivo: ${reason}`);
    
    await db.update(conversations)
      .set({ 
        followupActive: false, 
        nextFollowupAt: null,
        followupDisabledReason: reason
      })
      .where(eq(conversations.id, conversationId));
  }

  /**
   * Ativa follow-up para uma conversa
   */
  async enableFollowUp(conversationId: string) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível ativar follow-up: userId não encontrado`);
      return;
    }

    // � VERIFICAÇÃO CRÍTICA: Se a IA está desativada, NÃO ativar follow-up
    // Follow-up só funciona quando IA está ativa
    const isAgentEnabled = await storage.isAgentEnabledForConversation(conversationId);
    if (!isAgentEnabled) {
      console.log(`🛑 [USER-FOLLOW-UP] IA está desativada para ${conversationId}. Follow-up NÃO pode ser ativado.`);
      await db.update(conversations)
        .set({ 
          followupActive: false,
          followupDisabledReason: "IA desativada - ative a IA primeiro"
        })
        .where(eq(conversations.id, conversationId));
      return;
    }

    // �🔧 FIX BUG REATIVAÇÃO: Se foi DESATIVADO MANUALMENTE pelo usuário, NÃO reativar automaticamente
    // Isso evita que o sistema reative follow-up quando o dono envia uma mensagem
    if (conversation.followupDisabledReason && conversation.followupDisabledReason.includes('Desativado pelo usuário')) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO MANUALMENTE para ${conversationId}. Motivo: ${conversation.followupDisabledReason}. NÃO reativando automaticamente.`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    
    // Se follow-up não está habilitado para este usuário, não ativar
    if (!config?.isEnabled) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up desabilitado para usuário ${userId}`);
      return;
    }

    const intervals = config?.intervalsMinutes || DEFAULT_INTERVALS;
    const delayMinutes = intervals[0] || 10;
    const nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: 0,
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));

    console.log(`✅ [USER-FOLLOW-UP] Ativado para conversa ${conversationId}`);
  }

  /**
   * Reseta o ciclo quando o cliente responde
   * TÉCNICA DE FOLLOW-UP: Quando cliente responde, NÃO incomodar imediatamente.
   * Esperar um tempo maior (2h) para dar espaço à conversa fluir naturalmente.
   * Se o cliente está ATIVO conversando, não faz sentido mandar follow-up.
   */
  async resetFollowUpCycle(conversationId: string, reason?: string) {
    // Buscar conversa para obter userId via connection
    const conversation = await db.query.conversations.findFirst({
      where: eq(conversations.id, conversationId),
      with: { connection: true }
    });

    if (!conversation?.connection?.userId) {
      console.log(`⚠️ [USER-FOLLOW-UP] Não foi possível resetar follow-up: userId não encontrado`);
      return;
    }

    // 🔧 FIX CRÍTICO: NÃO reativar se foi desativado MANUALMENTE pelo usuário
    // Checar tanto followupActive quanto followupDisabledReason
    if (!conversation.followupActive) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up estava desativado para ${conversationId}, não resetando automaticamente`);
      return;
    }

    // 🔧 FIX BUG REATIVAÇÃO: Se existe motivo de desativação, significa que foi desativado MANUALMENTE
    // NUNCA reativar automaticamente quando foi desativado pelo usuário
    if (conversation.followupDisabledReason && conversation.followupDisabledReason.includes('Desativado pelo usuário')) {
      console.log(`🛑 [USER-FOLLOW-UP] Follow-up foi DESATIVADO MANUALMENTE para ${conversationId}. Motivo: ${conversation.followupDisabledReason}. NÃO reativando automaticamente.`);
      return;
    }

    const userId = conversation.connection.userId;
    const config = await this.getFollowupConfig(userId);
    
    // 🔧 FIX: Verificar se follow-up global está ativado para este usuário
    if (!config?.isEnabled) {
      console.log(`ℹ️ [USER-FOLLOW-UP] Follow-up global desativado para usuário ${userId}`);
      return;
    }
    
    // 🔧 FIX CRÍTICO: Quando cliente responde, dar MUITO mais tempo antes do próximo follow-up
    // Isso evita que o sistema pareça "perdido" ou "incomodando"
    // TÉCNICA: Esperar 2 HORAS após cliente responder, não 10 minutos
    // Se a conversa está ativa, o sistema não deve interferir
    const delayMinutes = 120; // 2 horas de "respiro" após cliente responder
    const nextDate = addRandomSeconds(new Date(Date.now() + delayMinutes * 60 * 1000));

    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: 0, // Resetar estágio para não ficar muito insistente
        nextFollowupAt: nextDate,
        followupDisabledReason: null
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`🔄 [USER-FOLLOW-UP] ${reason || 'Cliente respondeu'}. Ciclo pausado por 2h para ${conversationId} (dar espaço à conversa)`);
  }

  /**
   * Agenda um follow-up manual para uma data/hora específica
   */
  async scheduleManualFollowUp(conversationId: string, scheduledFor: Date, note?: string) {
    await db.update(conversations)
      .set({ 
        followupActive: true,
        followupStage: -1, // -1 indica agendamento manual
        nextFollowupAt: scheduledFor,
        followupDisabledReason: note ? `📅 Agendado: ${note}` : '📅 Agendamento manual'
      })
      .where(eq(conversations.id, conversationId));
      
    console.log(`📅 [USER-FOLLOW-UP] Agendamento manual criado para ${conversationId}: ${scheduledFor.toLocaleString()}`);
  }

  /**
   * Log de follow-up
   */
  private async logFollowUp(
    conversation: any, 
    userId: string, 
    status: string, 
    messageContent: string | null, 
    aiDecision: any, 
    errorReason?: string
  ) {
    try {
      await db.insert(userFollowupLogs).values({
        conversationId: conversation.id,
        userId,
        contactNumber: conversation.contactNumber,
        status,
        messageContent,
        aiDecision,
        stage: conversation.followupStage || 0,
        errorReason
      });
    } catch (error) {
      console.error("Erro ao logar follow-up:", error);
    }
  }

  /**
   * Busca logs de follow-up
   */
  async getFollowUpLogs(userId: string, limit: number = 50) {
    return await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId),
      orderBy: (logs, { desc }) => [desc(logs.executedAt)],
      limit
    });
  }

  /**
   * Estatísticas de follow-up do usuário
   */
  async getFollowUpStats(userId: string) {
    const logs = await db.query.userFollowupLogs.findMany({
      where: eq(userFollowupLogs.userId, userId)
    });

    const pendingConversations = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      }
    });

    const userPending = pendingConversations.filter(c => c.connection?.userId === userId);

    return {
      totalSent: logs.filter(l => l.status === 'sent').length,
      totalFailed: logs.filter(l => l.status === 'failed').length,
      totalCancelled: logs.filter(l => l.status === 'cancelled').length,
      totalSkipped: logs.filter(l => l.status === 'skipped').length,
      pending: userPending.length,
      scheduledToday: userPending.filter(c => {
        if (!c.nextFollowupAt) return false;
        const today = new Date();
        const scheduled = new Date(c.nextFollowupAt);
        return scheduled.toDateString() === today.toDateString();
      }).length
    };
  }

  /**
   * Lista conversas com follow-up ativo do usuário
   */
  async getPendingFollowUps(userId: string) {
    const allPending = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      },
      orderBy: (conv, { asc }) => [asc(conv.nextFollowupAt)]
    });

    return allPending.filter(c => c.connection?.userId === userId);
  }

  /**
   * Reorganiza todos os follow-ups pendentes de um usuário
   * Recalcula as datas baseado na configuração atual (horários, dias úteis, etc.)
   */
  async reorganizeAllFollowups(userId: string): Promise<{ reorganized: number; skipped: number }> {
    console.log(`🔄 [USER-FOLLOW-UP] Reorganizando todos os follow-ups para usuário ${userId}`);
    
    const config = await this.getFollowupConfig(userId);
    if (!config || !config.isEnabled) {
      console.log(`⚠️ [USER-FOLLOW-UP] Follow-up desabilitado para usuário ${userId}`);
      return { reorganized: 0, skipped: 0 };
    }

    // Buscar todas as conversas com follow-up ativo
    const pendingConversations = await db.query.conversations.findMany({
      where: and(
        eq(conversations.followupActive, true),
        isNotNull(conversations.nextFollowupAt)
      ),
      with: {
        connection: true
      }
    });

    // Filtrar só as do usuário
    const userConversations = pendingConversations.filter(c => c.connection?.userId === userId);
    
    let reorganized = 0;
    let skipped = 0;
    const intervals = config.intervalsMinutes || DEFAULT_INTERVALS;
    const now = new Date();

    for (const conversation of userConversations) {
      try {
        const stage = conversation.followupStage || 0;
        const delayMinutes = intervals[stage] || intervals[intervals.length - 1] || 10;
        
        // Calcular nova data baseada em lastMessageAt ou now
        const baseDate = conversation.lastMessageAt 
          ? new Date(conversation.lastMessageAt) 
          : now;
        
        let newDate = new Date(baseDate.getTime() + delayMinutes * 60 * 1000);
        
        // Se a nova data já passou, usar a partir de agora
        if (newDate < now) {
          newDate = new Date(now.getTime() + 1 * 60 * 1000); // 1 minuto a partir de agora
        }
        
        // Verificar horário comercial e ajustar se necessário
        if (!this.isBusinessHours(config)) {
          const nextBusinessTime = this.getNextBusinessTime(config);
          if (nextBusinessTime && nextBusinessTime > newDate) {
            newDate = nextBusinessTime;
          }
        } else {
          // Verificar se a nova data está dentro do horário comercial
          const brazilTime = new Date(newDate.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
          const day = brazilTime.getDay();
          const hours = brazilTime.getHours();
          const minutes = brazilTime.getMinutes();
          const currentMinutes = hours * 60 + minutes;
          
          const businessDays = config.businessDays || [1, 2, 3, 4, 5];
          const [startHour, startMin] = (config.businessHoursStart || '09:00').split(':').map(Number);
          const [endHour, endMin] = (config.businessHoursEnd || '18:00').split(':').map(Number);
          const startMinutes = startHour * 60 + startMin;
          const endMinutes = endHour * 60 + endMin;
          
          if (!businessDays.includes(day) || currentMinutes < startMinutes || currentMinutes >= endMinutes) {
            const nextBusinessTime = this.getNextBusinessTime(config);
            if (nextBusinessTime) {
              newDate = nextBusinessTime;
            }
          }
        }
        
        // Adicionar segundos aleatórios para parecer mais humano
        newDate = addRandomSeconds(newDate);
        
        await db.update(conversations)
          .set({ 
            nextFollowupAt: newDate,
            followupDisabledReason: null
          })
          .where(eq(conversations.id, conversation.id));
        
        reorganized++;
        console.log(`✅ [USER-FOLLOW-UP] Reorganizado: ${conversation.contactNumber} -> ${newDate.toISOString()}`);
      } catch (error) {
        console.error(`❌ [USER-FOLLOW-UP] Erro ao reorganizar ${conversation.id}:`, error);
        skipped++;
      }
    }
    
    console.log(`🔄 [USER-FOLLOW-UP] Reorganização concluída: ${reorganized} reorganizados, ${skipped} ignorados`);
    return { reorganized, skipped };
  }

  /**
   * Limpa o status de "aguardando conexão" para todas as conversas de uma conexão específica
   * Chamado quando o WhatsApp reconecta para permitir que os follow-ups sejam processados novamente
   * 
   * 🚀 OTIMIZADO: Faz apenas 1 UPDATE direto sem SELECT prévio
   */
  async clearConnectionWaitingStatus(connectionId: string): Promise<number> {
    try {
      // Reagendar para 2 minutos no futuro
      const nextDate = addRandomSeconds(new Date(Date.now() + 2 * 60 * 1000));
      
      // UPDATE direto apenas nas conversas que realmente precisam (sem SELECT prévio)
      // Isso economiza 1 query e reduz Disk I/O significativamente
      const result = await db.update(conversations)
        .set({ 
          followupDisabledReason: null,
          nextFollowupAt: nextDate
        })
        .where(and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.followupActive, true),
          eq(conversations.followupDisabledReason, '🔄 Aguardando conexão WhatsApp...')
        ))
        .returning({ id: conversations.id });
      
      const count = result.length;
      if (count > 0) {
        console.log(`🔄 [USER-FOLLOW-UP] ${count} conversas reativadas para conexão ${connectionId}`);
      }
      return count;
    } catch (error) {
      console.error(`❌ [USER-FOLLOW-UP] Erro ao limpar status de aguardo:`, error);
      return 0;
    }
  }
}

// Singleton
export const userFollowUpService = new UserFollowUpService();
