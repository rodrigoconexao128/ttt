import {
  users,
  admins,
  whatsappConnections,
  adminWhatsappConnection,
  conversations,
  messages,
  aiAgentConfig,
  businessAgentConfigs,
  agentDisabledConversations,
  plans,
  subscriptions,
  payments,
  paymentHistory,
  systemConfig,
  whatsappContacts,
  adminConversations,
  adminMessages,
  adminAgentMedia,
  coupons,
  tags,
  conversationTags,
  resellers,
  resellerClients,
  resellerPayments,
  resellerInvoices,
  type User,
  type UpsertUser,
  type WhatsappConnection,
  type InsertWhatsappConnection,
  type AdminWhatsappConnection,
  type InsertAdminWhatsappConnection,
  type Conversation,
  type InsertConversation,
  type Message,
  type InsertMessage,
  type AiAgentConfig,
  type InsertAiAgentConfig,
  type BusinessAgentConfig,
  type InsertBusinessAgentConfig,
  type Plan,
  type InsertPlan,
  type Subscription,
  type InsertSubscription,
  type Payment,
  type InsertPayment,
  type PaymentHistory,
  type InsertPaymentHistory,
  type SystemConfig,
  type InsertSystemConfig,
  type WhatsappContact,
  type InsertWhatsappContact,
  type AdminAgentMedia,
  type InsertAdminAgentMedia,
  type Coupon,
  type InsertCoupon,
  type Tag,
  type InsertTag,
  type ConversationTag,
  type InsertConversationTag,
  type Reseller,
  type InsertReseller,
  type ResellerClient,
  type InsertResellerClient,
  type ResellerPayment,
  type InsertResellerPayment,
  type ResellerInvoice,
  type InsertResellerInvoice,
  resellerInvoiceItems,
  type ResellerInvoiceItem,
  type InsertResellerInvoiceItem,
} from "@shared/schema";
import { db, withRetry } from "./db";
import { eq, desc, and, gte, sql, inArray, lte, isNotNull } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";

// ============================================
// CACHE EM MEMÓRIA PARA REDUZIR CARGA NO DB
// ============================================
interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number; // time to live in ms
}

class MemoryCache {
  private cache = new Map<string, CacheEntry<any>>();
  private maxSize = 500; // Máximo de entradas no cache

  set<T>(key: string, data: T, ttlMs: number = 30000): void {
    // Limpar cache se estiver muito grande
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }

  get<T>(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;
    
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data as T;
  }

  invalidate(pattern: string): void {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }

  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    // Se ainda estiver grande, remover os mais antigos
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.maxSize / 2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }

  getStats(): { size: number; maxSize: number; hitRate: string } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: 'n/a', // Podemos implementar contagem de hits/misses futuramente
    };
  }
}

export const memoryCache = new MemoryCache();

// ============================================
// CIRCUIT BREAKER PARA PROTEÇÃO DO DB
// ============================================
class CircuitBreaker {
  private failures = 0;
  private lastFailure = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private readonly threshold = 5; // Número de falhas para abrir
  private readonly resetTimeout = 30000; // 30 segundos para tentar novamente

  async execute<T>(operation: () => Promise<T>, fallback?: T): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = 'half-open';
      } else {
        console.warn('⚡ [Circuit Breaker] Circuito ABERTO - usando fallback');
        if (fallback !== undefined) return fallback;
        throw new Error('Database circuit breaker is open');
      }
    }

    try {
      const result = await operation();
      if (this.state === 'half-open') {
        this.state = 'closed';
        this.failures = 0;
        console.log('✅ [Circuit Breaker] Circuito FECHADO - DB recuperado');
      }
      return result;
    } catch (error: any) {
      this.failures++;
      this.lastFailure = Date.now();
      
      if (this.failures >= this.threshold) {
        this.state = 'open';
        console.error(`🔴 [Circuit Breaker] Circuito ABERTO após ${this.failures} falhas`);
      }
      
      if (fallback !== undefined) return fallback;
      throw error;
    }
  }

  isOpen(): boolean {
    return this.state === 'open';
  }

  getState(): string {
    return this.state;
  }
}

export const dbCircuitBreaker = new CircuitBreaker();

export interface IStorage {
  // User operations (IMPORTANT: mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  getUserByPhone(phone: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;
  deleteUser(id: string): Promise<void>;

  // WhatsApp connection operations
  getConnectionByUserId(userId: string): Promise<WhatsappConnection | undefined>;
  getConnectionById(connectionId: string): Promise<WhatsappConnection | undefined>;
  getAdminConnection(): Promise<AdminWhatsappConnection | undefined>;
  getAllConnections(): Promise<WhatsappConnection[]>;
  createConnection(connection: InsertWhatsappConnection): Promise<WhatsappConnection>;
  updateConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection>;

  // Conversation operations
  getConversationsByConnectionId(connectionId: string): Promise<Conversation[]>;
  getConversationByContactNumber(connectionId: string, contactNumber: string): Promise<Conversation | undefined>;
  getConversation(id: string): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation>;

  // Message operations
  getMessagesByConversationId(conversationId: string): Promise<Message[]>;
  getMessageByMessageId(messageId: string): Promise<Message | undefined>;
  deleteMessagesByConversationId(conversationId: string): Promise<void>;
  createMessage(message: InsertMessage): Promise<Message>;
  getTodayMessagesCount(connectionId: string): Promise<number>;
  getAgentMessagesCount(connectionId: string): Promise<number>;

  // AI Agent operations (legacy)
  getAgentConfig(userId: string): Promise<AiAgentConfig | undefined>;
  upsertAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig>;
  updateAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig | undefined>;
  
  // Business Agent operations (new advanced system)
  getBusinessAgentConfig(userId: string): Promise<BusinessAgentConfig | undefined>;
  upsertBusinessAgentConfig(userId: string, data: Partial<InsertBusinessAgentConfig>): Promise<BusinessAgentConfig>;
  deleteBusinessAgentConfig(userId: string): Promise<void>;
  
  // Agent conversation control
  isAgentDisabledForConversation(conversationId: string): Promise<boolean>;
  disableAgentForConversation(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void>;
  enableAgentForConversation(conversationId: string): Promise<void>;
  updateDisabledConversationOwnerReply(conversationId: string): Promise<void>;
  markClientPendingMessage(conversationId: string): Promise<void>;
  getConversationsToAutoReactivate(): Promise<Array<{ conversationId: string; clientLastMessageAt: Date | null }>>;
  getDisabledConversationDetails(conversationId: string): Promise<{ ownerLastReplyAt: Date | null; autoReactivateAfterMinutes: number | null; clientHasPendingMessage: boolean } | null>;

  // Plan operations
  getAllPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  // Coupon operations
  getCouponByCode(code: string): Promise<Coupon | undefined>;
  getAllCoupons(): Promise<Coupon[]>;
  createCoupon(coupon: InsertCoupon): Promise<Coupon>;
  updateCoupon(id: string, data: Partial<InsertCoupon>): Promise<Coupon>;
  deleteCoupon(id: string): Promise<void>;
  incrementCouponUsage(id: string): Promise<void>;

  // Subscription operations
  getSubscription(id: string): Promise<(Subscription & { plan: Plan }) | undefined>;
  getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined>;
  getAllSubscriptions(): Promise<(Subscription & { plan: Plan; user: User })[]>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription>;

  // Payment operations (legacy - Pix)
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentBySubscriptionId(subscriptionId: string): Promise<Payment | undefined>;
  getPendingPayments(): Promise<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment>;

  // Payment History operations (MercadoPago, etc)
  createPaymentHistory(payment: Partial<InsertPaymentHistory>): Promise<PaymentHistory>;
  getPaymentHistory(id: string): Promise<PaymentHistory | undefined>;
  getPaymentHistoryByMpPaymentId(mpPaymentId: string): Promise<PaymentHistory | undefined>;
  getPaymentHistoryBySubscription(subscriptionId: string): Promise<PaymentHistory[]>;
  getPaymentHistoryByUser(userId: string): Promise<PaymentHistory[]>;
  getAllPaymentHistory(): Promise<(PaymentHistory & { subscription?: Subscription; user?: User })[]>;
  updatePaymentHistory(id: string, data: Partial<InsertPaymentHistory>): Promise<PaymentHistory>;

  // System config operations
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  getSystemConfigs(keys: string[]): Promise<Map<string, string>>;
  updateSystemConfig(key: string, value: string): Promise<SystemConfig>;

  // Admin operations
  getAdminByEmail(email: string): Promise<any | undefined>;
  getAllAdmins(): Promise<any[]>;

  // Admin WhatsApp connection operations
  getAdminWhatsappConnection(adminId: string): Promise<AdminWhatsappConnection | undefined>;
  getAdminConnection(): Promise<AdminWhatsappConnection | undefined>; // Added this
  createAdminWhatsappConnection(connection: InsertAdminWhatsappConnection): Promise<AdminWhatsappConnection>;
  updateAdminWhatsappConnection(adminId: string, data: Partial<InsertAdminWhatsappConnection>): Promise<AdminWhatsappConnection>;

  // Safe test account reset with validation
  resetTestAccountSafely(phoneNumber: string): Promise<{ 
    success: boolean; 
    error?: string;
    result?: any;
  }>;

  // Admin stats
  getAllUsers(): Promise<User[]>;
  getTotalRevenue(): Promise<number>;
  getActiveSubscriptionsCount(): Promise<number>;

  // WhatsApp Contacts operations (FIX LID 2025)
  upsertContact(contact: InsertWhatsappContact): Promise<WhatsappContact>;
  batchUpsertContacts(contacts: InsertWhatsappContact[]): Promise<void>;
  getContactByLid(lid: string, connectionId: string): Promise<WhatsappContact | undefined>;
  getContactById(contactId: string, connectionId: string): Promise<WhatsappContact | undefined>;
  getContactsByConnectionId(connectionId: string): Promise<WhatsappContact[]>;
  deleteOldContacts(daysOld: number): Promise<number>;

  // Campaign operations (in-memory for now)
  getCampaigns?(userId: string): Promise<any[]>;
  getCampaign?(userId: string, id: string): Promise<any | undefined>;
  createCampaign?(campaign: any): Promise<any>;
  updateCampaign?(userId: string, id: string, data: any): Promise<any>;
  deleteCampaign?(userId: string, id: string): Promise<void>;
  
  // Contact List operations (in-memory for now)
  getContactLists?(userId: string): Promise<any[]>;
  getContactList?(userId: string, id: string): Promise<any | undefined>;
  createContactList?(list: any): Promise<any>;
  updateContactList?(userId: string, id: string, data: any): Promise<any>;
  deleteContactList?(userId: string, id: string): Promise<void>;
  addContactsToList?(userId: string, listId: string, contacts: any[]): Promise<any>;
  getSyncedContacts?(userId: string): Promise<any[]>;
  saveSyncedContacts?(userId: string, contacts: any[]): Promise<void>;
  getUserActiveConnection?(userId: string): Promise<any | undefined>;
  
  // Share token and message update operations
  getConversationByShareToken(shareToken: string): Promise<Conversation | undefined>;
  updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message>;
}

// In-memory storage for campaigns and contact lists
const campaignsStore: Map<string, any[]> = new Map();
const contactListsStore: Map<string, any[]> = new Map();
const syncedContactsStore: Map<string, any[]> = new Map();

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async getUserByPhone(phone: string): Promise<User | undefined> {
    // Busca por telefone exato ou com variações (com/sem +)
    const cleanPhone = phone.replace(/\D/g, "");
    const phoneWithPlus = "+" + cleanPhone;
    
    const [user] = await db.select().from(users).where(
      sql`${users.phone} = ${phoneWithPlus} OR ${users.phone} = ${cleanPhone} OR REPLACE(${users.phone}, '+', '') = ${cleanPhone}`
    );
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User> {
    await db.update(users).set(data).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
    // Upsert simples por ID - telefone pode ser duplicado
    const [user] = await db
      .insert(users)
      .values(userData)
      .onConflictDoUpdate({
        target: users.id,
        set: {
          ...userData,
          updatedAt: new Date(),
        },
      })
      .returning();
    return user;
  }

  // Delete user and all related data (cascade)
  async deleteUser(id: string): Promise<void> {
    console.log(`[STORAGE] Deleting user ${id} and all related data...`);
    
    // Get user's connection first
    const connection = await this.getConnectionByUserId(id);
    
    if (connection) {
      // Delete all messages from conversations
      const userConversations = await db
        .select()
        .from(conversations)
        .where(eq(conversations.connectionId, connection.id));
      
      for (const conv of userConversations) {
        await db.delete(messages).where(eq(messages.conversationId, conv.id));
      }
      
      // Delete conversations
      await db.delete(conversations).where(eq(conversations.connectionId, connection.id));
      
      // Delete whatsapp contacts cache
      await db.delete(whatsappContacts).where(eq(whatsappContacts.connectionId, connection.id));
      
      // Delete the connection itself
      await db.delete(whatsappConnections).where(eq(whatsappConnections.id, connection.id));
    }
    
    // Delete AI agent config
    await db.delete(aiAgentConfig).where(eq(aiAgentConfig.userId, id));

    // Delete business agent config
    await db.delete(businessAgentConfigs).where(eq(businessAgentConfigs.userId, id));
    
    // Delete user's subscription and payments
    const subscription = await db.select().from(subscriptions).where(eq(subscriptions.userId, id));
    if (subscription.length > 0) {
      await db.delete(payments).where(eq(payments.subscriptionId, subscription[0].id));
      await db.delete(subscriptions).where(eq(subscriptions.userId, id));
    }
    
    // Finally delete the user
    await db.delete(users).where(eq(users.id, id));
    
    console.log(`[STORAGE] User ${id} and all related data deleted successfully`);
  }

  // WhatsApp connection operations
  async getConnectionByUserId(userId: string): Promise<WhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.userId, userId))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1);
    return connection;
  }

  async getConnectionById(connectionId: string): Promise<WhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.id, connectionId))
      .limit(1);
    return connection;
  }

  async getAdminConnection(): Promise<AdminWhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(adminWhatsappConnection)
      .limit(1);
    return connection;
  }

  async getAllConnections(): Promise<WhatsappConnection[]> {
    const connections = await withRetry(() =>
      db
        .select()
        .from(whatsappConnections)
        .orderBy(desc(whatsappConnections.createdAt))
    );
    return connections;
  }

  async createConnection(connectionData: InsertWhatsappConnection): Promise<WhatsappConnection> {
    const [connection] = await db
      .insert(whatsappConnections)
      .values(connectionData)
      .returning();
    return connection;
  }

  async updateConnection(id: string, data: Partial<InsertWhatsappConnection>): Promise<WhatsappConnection> {
    const [connection] = await db
      .update(whatsappConnections)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(whatsappConnections.id, id))
      .returning();
    return connection;
  }

  // Conversation operations
  async getConversationsByConnectionId(connectionId: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(eq(conversations.connectionId, connectionId))
      .orderBy(desc(conversations.lastMessageTime));
  }

  async getConversationByContactNumber(
    connectionId: string,
    contactNumber: string
  ): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(conversations.contactNumber, contactNumber)
        )
      );
    return conversation;
  }

  async getConversation(id: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, id));
    return conversation;
  }

  async createConversation(conversationData: InsertConversation): Promise<Conversation> {
    const [conversation] = await db
      .insert(conversations)
      .values(conversationData)
      .returning();
    return conversation;
  }

  async updateConversation(id: string, data: Partial<InsertConversation>): Promise<Conversation> {
    const [conversation] = await db
      .update(conversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(conversations.id, id))
      .returning();
    return conversation;
  }

  async getConversationByShareToken(shareToken: string): Promise<Conversation | undefined> {
    const [conversation] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.shareToken, shareToken));
    return conversation;
  }

  // Message operations - OTIMIZADO para reduzir egress do Supabase
  // Por padrão NÃO retorna media_url que pode ser muito grande (base64)
  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    // Verificar cache primeiro
    const cacheKey = `messages:${conversationId}`;
    const cached = memoryCache.get<Message[]>(cacheKey);
    if (cached) return cached;

    // Query completa incluindo media_url para renderizar mídias no chat
    const result = await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        messageId: messages.messageId,
        fromMe: messages.fromMe,
        text: messages.text,
        timestamp: messages.timestamp,
        status: messages.status,
        isFromAgent: messages.isFromAgent,
        mediaType: messages.mediaType,
        mediaUrl: messages.mediaUrl, // Incluir media_url para exibir mídias
        mediaMimeType: messages.mediaMimeType,
        mediaDuration: messages.mediaDuration,
        mediaCaption: messages.mediaCaption,
        createdAt: messages.createdAt,
      })
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);

    // Cache por 30 segundos
    memoryCache.set(cacheKey, result as Message[], 30000);
    return result as Message[];
  }

  // Nova função para buscar media_url de uma mensagem específica (lazy loading)
  async getMessageMedia(messageId: string): Promise<{ mediaUrl: string | null; mediaType: string | null } | null> {
    const [result] = await db
      .select({ 
        mediaUrl: messages.mediaUrl,
        mediaType: messages.mediaType 
      })
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return result || null;
  }

  // Versão completa com media_url - usar apenas quando REALMENTE necessário
  async getMessagesByConversationIdWithMedia(conversationId: string, limit: number = 50): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(desc(messages.timestamp))
      .limit(limit);
  }

  async updateMessage(id: string, data: Partial<InsertMessage>): Promise<Message> {
    const [message] = await db
      .update(messages)
      .set(data)
      .where(eq(messages.id, id))
      .returning();
    
    // 🔥 Invalidar cache de mensagens da conversa após atualização
    if (message?.conversationId) {
      memoryCache.invalidate(`messages:${message.conversationId}`);
    }
    return message;
  }

  async getMessageByMessageId(messageId: string): Promise<Message | undefined> {
    const [message] = await db
      .select()
      .from(messages)
      .where(eq(messages.messageId, messageId))
      .limit(1);
    return message;
  }

  async deleteMessagesByConversationId(conversationId: string): Promise<void> {
    // 🔥 Invalidar cache antes de deletar
    memoryCache.invalidate(`messages:${conversationId}`);
    
    await db
      .delete(messages)
      .where(eq(messages.conversationId, conversationId));
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const data: InsertMessage = { ...messageData };

    // 🔥 CRÍTICO: Invalidar cache de mensagens da conversa ANTES de inserir
    // Isso evita o bug onde a verificação de última mensagem retorna dados desatualizados
    memoryCache.invalidate(`messages:${data.conversationId}`);

    // Transcrição automática para mensagens de áudio, independente do agente estar ativo ou não.
    if (data.mediaType === "audio" && data.mediaUrl) {
      try {
        const base64Part = data.mediaUrl.split(",")[1];
        if (base64Part) {
          const audioBuffer = Buffer.from(base64Part, "base64");

          // Descobre o usuário dono da conversa para permitir modelos
          // configuráveis no futuro (via env).
          let transcriptionModel: string | undefined;

          const [conversation] = await db
            .select()
            .from(conversations)
            .where(eq(conversations.id, data.conversationId));

          if (conversation) {
            const [connection] = await db
              .select()
              .from(whatsappConnections)
              .where(eq(whatsappConnections.id, conversation.connectionId));

            if (connection?.userId) {
              // Hoje usamos apenas o modelo padrão configurado em mistralClient,
              // mas deixamos o campo para futura customização por usuário.
              transcriptionModel = process.env.MISTRAL_TRANSCRIPTION_MODEL || undefined;
            }
          }

          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: "whatsapp-audio.ogg",
            model: transcriptionModel,
          });

          if (transcription && transcription.length > 0) {
            data.text = transcription;
          }
        }
      } catch (error) {
        console.error("Error transcribing audio message in storage.createMessage:", error);
      }
    }

    const [message] = await db
      .insert(messages)
      .values(data)
      .returning();
    return message;
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Reduz drasticamente o Egress do Supabase
  async getTodayMessagesCount(connectionId: string): Promise<number> {
    // Cache para evitar queries repetidas (TTL 60s)
    const cacheKey = `todayMsgCount:${connectionId}`;
    const cached = memoryCache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          gte(messages.timestamp, today)
        )
      );

    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
    return count;
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Antes: trazia TODAS as mensagens do agente (milhares de rows com media_url grande)
  // Agora: retorna apenas 1 número, reduz Egress em ~99%
  async getAgentMessagesCount(connectionId: string): Promise<number> {
    // Cache para evitar queries repetidas (TTL 60s)
    const cacheKey = `agentMsgCount:${connectionId}`;
    const cached = memoryCache.get<number>(cacheKey);
    if (cached !== null) return cached;

    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(messages.isFromAgent, true)
        )
      );

    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 60000); // Cache por 60 segundos
    return count;
  }

  // AI Agent operations
  async getAgentConfig(userId: string): Promise<AiAgentConfig | undefined> {
    const [config] = await db
      .select()
      .from(aiAgentConfig)
      .where(eq(aiAgentConfig.userId, userId));
    return config;
  }

  async upsertAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig> {
    const [config] = await db
      .insert(aiAgentConfig)
      .values({ userId, ...data } as InsertAiAgentConfig)
      .onConflictDoUpdate({
        target: aiAgentConfig.userId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  }

  async updateAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig | undefined> {
    const [config] = await db
      .update(aiAgentConfig)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(aiAgentConfig.userId, userId))
      .returning();
    return config;
  }

  // 🆕 Business Agent Configuration operations (Advanced System)
  async getBusinessAgentConfig(userId: string): Promise<BusinessAgentConfig | undefined> {
    const [config] = await db
      .select()
      .from(businessAgentConfigs)
      .where(eq(businessAgentConfigs.userId, userId));
    return config;
  }

  async upsertBusinessAgentConfig(userId: string, data: Partial<InsertBusinessAgentConfig>): Promise<BusinessAgentConfig> {
    const [config] = await db
      .insert(businessAgentConfigs)
      .values({ userId, ...data } as InsertBusinessAgentConfig)
      .onConflictDoUpdate({
        target: businessAgentConfigs.userId,
        set: {
          ...data,
          updatedAt: new Date(),
        },
      })
      .returning();
    return config;
  }

  async deleteBusinessAgentConfig(userId: string): Promise<void> {
    await db
      .delete(businessAgentConfigs)
      .where(eq(businessAgentConfigs.userId, userId));
  }

  async isAgentDisabledForConversation(conversationId: string): Promise<boolean> {
    const [disabled] = await db
      .select()
      .from(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
    return !!disabled;
  }

  async disableAgentForConversation(conversationId: string, autoReactivateAfterMinutes?: number | null): Promise<void> {
    await db
      .insert(agentDisabledConversations)
      .values({ 
        conversationId,
        ownerLastReplyAt: new Date(),
        autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
        clientHasPendingMessage: false,
        clientLastMessageAt: null,
      })
      .onConflictDoUpdate({
        target: agentDisabledConversations.conversationId,
        set: {
          ownerLastReplyAt: new Date(),
          autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
          // Reset pending message flag when owner replies again
          clientHasPendingMessage: false,
        }
      });
  }

  async enableAgentForConversation(conversationId: string): Promise<void> {
    await db
      .delete(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  async updateDisabledConversationOwnerReply(conversationId: string): Promise<void> {
    await db
      .update(agentDisabledConversations)
      .set({ 
        ownerLastReplyAt: new Date(),
        clientHasPendingMessage: false, // Reset when owner replies again
      })
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  async markClientPendingMessage(conversationId: string): Promise<void> {
    await db
      .update(agentDisabledConversations)
      .set({ 
        clientHasPendingMessage: true,
        clientLastMessageAt: new Date(),
      })
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  async getConversationsToAutoReactivate(): Promise<Array<{ conversationId: string; clientLastMessageAt: Date | null }>> {
    // 🔥 OTIMIZAÇÃO: Query 100% SQL para minimizar Egress
    // Usa cálculo de tempo direto no PostgreSQL ao invés de filtrar em JS
    // Retorna APENAS registros que precisam ser reativados AGORA
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT 
          conversation_id as "conversationId",
          client_last_message_at as "clientLastMessageAt"
        FROM agent_disabled_conversations
        WHERE 
          auto_reactivate_after_minutes IS NOT NULL
          AND client_has_pending_message = true
          AND owner_last_reply_at IS NOT NULL
          AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
        LIMIT 10
      `);
      
      return result.rows.map(r => ({
        conversationId: r.conversationId,
        clientLastMessageAt: r.clientLastMessageAt ? new Date(r.clientLastMessageAt) : null,
      }));
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em getConversationsToAutoReactivate:`, error);
      return [];
    }
  }

  /**
   * 🔥 OTIMIZAÇÃO: Verifica rapidamente se há conversas para reativar
   * Usa COUNT(*) que é muito mais leve que SELECT * para verificação
   */
  async hasConversationsToAutoReactivate(): Promise<boolean> {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT 1 FROM agent_disabled_conversations
          WHERE 
            auto_reactivate_after_minutes IS NOT NULL
            AND client_has_pending_message = true
            AND owner_last_reply_at IS NOT NULL
            AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
          LIMIT 1
        ) as has_pending
      `);
      return result.rows[0]?.has_pending === true;
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em hasConversationsToAutoReactivate:`, error);
      return false;
    }
  }

  /**
   * 🔥 OTIMIZAÇÃO: Conta conversas com timers ativos (para ajuste dinâmico de intervalo)
   */
  async countActiveAutoReactivateTimers(): Promise<number> {
    try {
      const { pool } = await import("./db");
      const result = await pool.query(`
        SELECT COUNT(*) as count 
        FROM agent_disabled_conversations
        WHERE auto_reactivate_after_minutes IS NOT NULL
          AND client_has_pending_message = true
      `);
      return parseInt(result.rows[0]?.count || '0', 10);
    } catch (error) {
      console.error(`❌ [STORAGE] Erro em countActiveAutoReactivateTimers:`, error);
      return 0;
    }
  }

  async getDisabledConversationDetails(conversationId: string): Promise<{ ownerLastReplyAt: Date | null; autoReactivateAfterMinutes: number | null; clientHasPendingMessage: boolean } | null> {
    const [result] = await db
      .select({
        ownerLastReplyAt: agentDisabledConversations.ownerLastReplyAt,
        autoReactivateAfterMinutes: agentDisabledConversations.autoReactivateAfterMinutes,
        clientHasPendingMessage: agentDisabledConversations.clientHasPendingMessage,
      })
      .from(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
    
    if (!result) return null;
    return {
      ownerLastReplyAt: result.ownerLastReplyAt,
      autoReactivateAfterMinutes: result.autoReactivateAfterMinutes,
      clientHasPendingMessage: result.clientHasPendingMessage ?? false,
    };
  }

  // Plan operations
  async getAllPlans(): Promise<Plan[]> {
    return await withRetry(() => db.select().from(plans).orderBy(plans.ordem));
  }

  async getActivePlans(): Promise<Plan[]> {
    return await db
      .select()
      .from(plans)
      .where(eq(plans.ativo, true))
      .orderBy(plans.ordem);
  }

  async getPlan(id: string): Promise<Plan | undefined> {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }

  async createPlan(planData: InsertPlan): Promise<Plan> {
    const [plan] = await db.insert(plans).values(planData).returning();
    return plan;
  }

  async updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan> {
    const [plan] = await db
      .update(plans)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(plans.id, id))
      .returning();
    return plan;
  }

  async deletePlan(id: string): Promise<void> {
    await db.delete(plans).where(eq(plans.id, id));
  }

  // Coupon operations
  async getCouponByCode(code: string): Promise<Coupon | undefined> {
    try {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
      return coupon;
    } catch (error) {
      console.error("Error in getCouponByCode with Drizzle, trying raw query:", error);
      // Fallback to raw query if Drizzle fails (PgBouncer compatibility)
      const { pool } = await import("./db");
      const result = await pool.query(
        "SELECT * FROM coupons WHERE UPPER(code) = $1",
        [code.toUpperCase()]
      );
      if (result.rows.length === 0) return undefined;
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async getAllCoupons(): Promise<Coupon[]> {
    try {
      return await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    } catch (error) {
      console.error("Error in getAllCoupons with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      const result = await pool.query("SELECT * FROM coupons ORDER BY created_at DESC");
      return result.rows.map((row: any) => ({
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon));
    }
  }

  async createCoupon(couponData: InsertCoupon): Promise<Coupon> {
    try {
      const [coupon] = await db.insert(coupons).values({
        ...couponData,
        code: couponData.code.toUpperCase()
      }).returning();
      return coupon;
    } catch (error) {
      console.error("Error in createCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      const result = await pool.query(`
        INSERT INTO coupons (code, discount_type, discount_value, final_price, is_active, max_uses, current_uses, applicable_plans, valid_until)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        couponData.code.toUpperCase(),
        couponData.discountType || 'fixed_price',
        couponData.discountValue || '0',
        couponData.finalPrice,
        couponData.isActive !== false,
        couponData.maxUses || null,
        couponData.currentUses || 0,
        couponData.applicablePlans ? JSON.stringify(couponData.applicablePlans) : null,
        couponData.validUntil || null
      ]);
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async updateCoupon(id: string, data: Partial<InsertCoupon>): Promise<Coupon> {
    try {
      const updateData: any = { ...data, updatedAt: new Date() };
      if (data.code) {
        updateData.code = data.code.toUpperCase();
      }
      const [coupon] = await db
        .update(coupons)
        .set(updateData)
        .where(eq(coupons.id, id))
        .returning();
      return coupon;
    } catch (error) {
      console.error("Error in updateCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      
      // Build dynamic SET clause
      const setClauses: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;
      
      if (data.code !== undefined) {
        setClauses.push(`code = $${paramIndex++}`);
        values.push(data.code.toUpperCase());
      }
      if (data.finalPrice !== undefined) {
        setClauses.push(`final_price = $${paramIndex++}`);
        values.push(data.finalPrice);
      }
      if (data.isActive !== undefined) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(data.isActive);
      }
      if (data.maxUses !== undefined) {
        setClauses.push(`max_uses = $${paramIndex++}`);
        values.push(data.maxUses);
      }
      if (data.validUntil !== undefined) {
        setClauses.push(`valid_until = $${paramIndex++}`);
        values.push(data.validUntil);
      }
      if (data.applicablePlans !== undefined) {
        setClauses.push(`applicable_plans = $${paramIndex++}`);
        values.push(data.applicablePlans ? JSON.stringify(data.applicablePlans) : null);
      }
      
      setClauses.push(`updated_at = $${paramIndex++}`);
      values.push(new Date());
      values.push(id);
      
      const result = await pool.query(`
        UPDATE coupons SET ${setClauses.join(', ')} WHERE id = $${paramIndex}
        RETURNING *
      `, values);
      
      const row = result.rows[0];
      return {
        id: row.id,
        code: row.code,
        discountType: row.discount_type,
        discountValue: row.discount_value,
        finalPrice: row.final_price,
        isActive: row.is_active,
        maxUses: row.max_uses,
        currentUses: row.current_uses,
        applicablePlans: row.applicable_plans,
        validFrom: row.valid_from,
        validUntil: row.valid_until,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      } as Coupon;
    }
  }

  async deleteCoupon(id: string): Promise<void> {
    try {
      await db.delete(coupons).where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in deleteCoupon with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      await pool.query("DELETE FROM coupons WHERE id = $1", [id]);
    }
  }

  async incrementCouponUsage(id: string): Promise<void> {
    try {
      await db
        .update(coupons)
        .set({ currentUses: sql`${coupons.currentUses} + 1`, updatedAt: new Date() })
        .where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in incrementCouponUsage with Drizzle, trying raw query:", error);
      const { pool } = await import("./db");
      await pool.query("UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1", [id]);
    }
  }

  // Subscription operations
  async getSubscription(id: string): Promise<(Subscription & { plan: Plan }) | undefined> {
    const result = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.id, id))
      .limit(1);

    if (result.length === 0) return undefined;
    
    return {
      ...result[0].subscriptions,
      plan: result[0].plans,
    };
  }

  async getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined> {
    // Primeiro, tenta encontrar uma subscription ativa
    const activeResult = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active")
      ))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (activeResult.length > 0) {
      return {
        ...activeResult[0].subscriptions,
        plan: activeResult[0].plans,
      };
    }

    // Se não há ativa, retorna a mais recente (pode ser pending, expired, etc)
    const result = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .where(eq(subscriptions.userId, userId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);

    if (result.length === 0) return undefined;
    
    return {
      ...result[0].subscriptions,
      plan: result[0].plans,
    };
  }

  async getAllSubscriptions(): Promise<(Subscription & { plan: Plan; user: User })[]> {
    const result = await withRetry(() =>
      db
        .select()
        .from(subscriptions)
        .innerJoin(plans, eq(subscriptions.planId, plans.id))
        .innerJoin(users, eq(subscriptions.userId, users.id))
        .orderBy(desc(subscriptions.createdAt))
    );

    return result.map((row) => ({
      ...row.subscriptions,
      plan: row.plans,
      user: row.users,
    }));
  }

  async createSubscription(subscriptionData: InsertSubscription): Promise<Subscription> {
    const [subscription] = await db
      .insert(subscriptions)
      .values(subscriptionData)
      .returning();
    return subscription;
  }

  async updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription> {
    const [subscription] = await db
      .update(subscriptions)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(subscriptions.id, id))
      .returning();
    return subscription;
  }

  // Payment operations
  async getPayment(id: string): Promise<Payment | undefined> {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }

  async getPaymentBySubscriptionId(subscriptionId: string): Promise<Payment | undefined> {
    const [payment] = await db
      .select()
      .from(payments)
      .where(eq(payments.subscriptionId, subscriptionId))
      .orderBy(desc(payments.createdAt))
      .limit(1);
    return payment;
  }

  async getPendingPayments(): Promise<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]> {
    const result = await db
      .select()
      .from(payments)
      .innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id))
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .where(eq(payments.status, "pending"))
      .orderBy(desc(payments.createdAt));

    return result.map((row) => ({
      ...row.payments,
      subscription: {
        ...row.subscriptions,
        user: row.users,
        plan: row.plans,
      },
    }));
  }

  async createPayment(paymentData: InsertPayment): Promise<Payment> {
    const [payment] = await db.insert(payments).values(paymentData).returning();
    return payment;
  }

  async updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment> {
    const [payment] = await db
      .update(payments)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(payments.id, id))
      .returning();
    return payment;
  }

  // Payment History operations (MercadoPago, etc)
  async createPaymentHistory(paymentData: Partial<InsertPaymentHistory>): Promise<PaymentHistory> {
    const [payment] = await db.insert(paymentHistory).values(paymentData as any).returning();
    return payment;
  }

  async getPaymentHistory(id: string): Promise<PaymentHistory | undefined> {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.id, id));
    return payment;
  }

  async getPaymentHistoryByMpPaymentId(mpPaymentId: string): Promise<PaymentHistory | undefined> {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.mpPaymentId, mpPaymentId));
    return payment;
  }

  async getPaymentHistoryBySubscription(subscriptionId: string): Promise<PaymentHistory[]> {
    return await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.subscriptionId, subscriptionId))
      .orderBy(desc(paymentHistory.createdAt));
  }

  async getPaymentHistoryByUser(userId: string): Promise<PaymentHistory[]> {
    return await db
      .select()
      .from(paymentHistory)
      .where(eq(paymentHistory.userId, userId))
      .orderBy(desc(paymentHistory.createdAt));
  }

  async getAllPaymentHistory(): Promise<(PaymentHistory & { subscription?: Subscription; user?: User })[]> {
    const result = await db
      .select()
      .from(paymentHistory)
      .leftJoin(subscriptions, eq(paymentHistory.subscriptionId, subscriptions.id))
      .leftJoin(users, eq(paymentHistory.userId, users.id))
      .orderBy(desc(paymentHistory.createdAt));

    return result.map((row) => ({
      ...row.payment_history,
      subscription: row.subscriptions || undefined,
      user: row.users || undefined,
    }));
  }

  async updatePaymentHistory(id: string, data: Partial<InsertPaymentHistory>): Promise<PaymentHistory> {
    const [payment] = await db
      .update(paymentHistory)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(paymentHistory.id, id))
      .returning();
    return payment;
  }

  // System config operations
  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, key));
    return config;
  }

  async getSystemConfigs(keys: string[]): Promise<Map<string, string>> {
    const configs = await db
      .select()
      .from(systemConfig)
      .where(inArray(systemConfig.chave, keys));
    
    const result = new Map<string, string>();
    for (const config of configs) {
      if (config.valor !== null) {
        result.set(config.chave, config.valor);
      }
    }
    return result;
  }

  async updateSystemConfig(key: string, value: string): Promise<SystemConfig> {
    const [config] = await db
      .insert(systemConfig)
      .values({ chave: key, valor: value })
      .onConflictDoUpdate({
        target: systemConfig.chave,
        set: { valor: value, updatedAt: new Date() },
      })
      .returning();
    return config;
  }

  // Admin operations
  async getAdminByEmail(email: string): Promise<any | undefined> {
    const [admin] = await db
      .select()
      .from(admins)
      .where(eq(admins.email, email));
    return admin;
  }

  async getAllAdmins(): Promise<any[]> {
    return await withRetry(() => db.select().from(admins));
  }

  // Admin WhatsApp connection operations
  async getAdminWhatsappConnection(adminId: string): Promise<AdminWhatsappConnection | undefined> {
    const [connection] = await db
      .select()
      .from(adminWhatsappConnection)
      .where(eq(adminWhatsappConnection.adminId, adminId));
    return connection;
  }

  async createAdminWhatsappConnection(connection: InsertAdminWhatsappConnection): Promise<AdminWhatsappConnection> {
    const [created] = await db
      .insert(adminWhatsappConnection)
      .values(connection)
      .returning();
    return created;
  }

  async updateAdminWhatsappConnection(adminId: string, data: Partial<InsertAdminWhatsappConnection>): Promise<AdminWhatsappConnection> {
    const [updated] = await db
      .update(adminWhatsappConnection)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminWhatsappConnection.adminId, adminId))
      .returning();
    return updated;
  }

  // Admin stats
  async getAllUsers(): Promise<User[]> {
    return await withRetry(() => db.select().from(users).orderBy(desc(users.createdAt)));
  }

  async getTotalRevenue(): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${payments.valor} AS NUMERIC)), 0)` })
      .from(payments)
      .where(eq(payments.status, "paid"));

    return Number(result[0]?.total || 0);
  }

  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  async getActiveSubscriptionsCount(): Promise<number> {
    const result = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    return result[0]?.count || 0;
  }

  // ======================================================================
  // WhatsApp Contacts Operations (FIX LID 2025)
  // Persistent storage for @lid → phoneNumber mappings
  // ======================================================================

  /**
   * Upsert (Insert or Update) a WhatsApp contact
   * Uses ON CONFLICT to avoid duplicates and update existing records
   */
  async upsertContact(contact: InsertWhatsappContact): Promise<WhatsappContact> {
    const [upserted] = await db
      .insert(whatsappContacts)
      .values({
        ...contact,
        lastSyncedAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [whatsappContacts.connectionId, whatsappContacts.contactId],
        set: {
          lid: contact.lid,
          phoneNumber: contact.phoneNumber,
          name: contact.name,
          imgUrl: contact.imgUrl,
          lastSyncedAt: new Date(),
          updatedAt: new Date(),
        },
      })
      .returning();
    
    console.log(`[DB] Upserted contact: ${contact.contactId}${contact.phoneNumber ? ` (phoneNumber: ${contact.phoneNumber})` : ""}`);
    return upserted;
  }

  /**
   * Batch upsert multiple contacts at once (more efficient than individual inserts)
   * Used during initial sync when Baileys emits many contacts.upsert events
   */
  async batchUpsertContacts(contacts: InsertWhatsappContact[]): Promise<void> {
    if (contacts.length === 0) return;

    const now = new Date();
    const contactsWithTimestamps = contacts.map(c => ({
      ...c,
      lastSyncedAt: now,
      updatedAt: now,
    }));

    await db
      .insert(whatsappContacts)
      .values(contactsWithTimestamps)
      .onConflictDoUpdate({
        target: [whatsappContacts.connectionId, whatsappContacts.contactId],
        set: {
          lid: sql`EXCLUDED.lid`,
          phoneNumber: sql`EXCLUDED.phone_number`,
          name: sql`EXCLUDED.name`,
          imgUrl: sql`EXCLUDED.img_url`,
          lastSyncedAt: now,
          updatedAt: now,
        },
      });

    console.log(`[DB] Batch upserted ${contacts.length} contacts`);
  }

  /**
   * Get contact by LID (primary use case for @lid resolution)
   * Query: SELECT * FROM whatsapp_contacts WHERE lid = ? AND connection_id = ?
   */
  async getContactByLid(lid: string, connectionId: string): Promise<WhatsappContact | undefined> {
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.lid, lid),
        eq(whatsappContacts.connectionId, connectionId)
      ))
      .limit(1);

    if (contact) {
      console.log(`[DB] Contact found by LID: ${lid} → ${contact.phoneNumber || "no phone"}`);
    }

    return contact;
  }

  /**
   * Get contact by contactId (general lookup)
   * Query: SELECT * FROM whatsapp_contacts WHERE contact_id = ? AND connection_id = ?
   */
  async getContactById(contactId: string, connectionId: string): Promise<WhatsappContact | undefined> {
    const [contact] = await db
      .select()
      .from(whatsappContacts)
      .where(and(
        eq(whatsappContacts.contactId, contactId),
        eq(whatsappContacts.connectionId, connectionId)
      ))
      .limit(1);

    return contact;
  }

  /**
   * Get all contacts for a specific connection (cache warming)
   * Used when restoring session to pre-populate in-memory cache
   */
  async getContactsByConnectionId(connectionId: string): Promise<WhatsappContact[]> {
    const contacts = await db
      .select()
      .from(whatsappContacts)
      .where(eq(whatsappContacts.connectionId, connectionId))
      .orderBy(desc(whatsappContacts.lastSyncedAt));

    console.log(`[DB] Loaded ${contacts.length} contacts for connection ${connectionId}`);
    return contacts;
  }

  /**
   * Delete contacts from inactive connections (data retention policy)
   * Should be run periodically (e.g., daily cron job)
   * Query: DELETE FROM whatsapp_contacts WHERE connection_id IN (...)
   */
  async deleteOldContacts(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    // Find inactive connections
    const inactiveConnections = await db
      .select({ id: whatsappConnections.id })
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.isConnected, false),
        sql`${whatsappConnections.updatedAt} < ${cutoffDate}`
      ));

    if (inactiveConnections.length === 0) {
      console.log(`[DB] No inactive connections older than ${daysOld} days`);
      return 0;
    }

    const connectionIds = inactiveConnections.map(c => c.id);

    // Delete contacts from those connections
    const deleted = await db
      .delete(whatsappContacts)
      .where(sql`${whatsappContacts.connectionId} = ANY(${connectionIds})`);

    console.log(`[DB] Deleted contacts from ${connectionIds.length} inactive connections (${daysOld}+ days old)`);
    return deleted.rowCount || 0;
  }

  // ==================== CAMPAIGN OPERATIONS (In-Memory) ====================

  async getCampaigns(userId: string): Promise<any[]> {
    return campaignsStore.get(userId) || [];
  }

  async getCampaign(userId: string, id: string): Promise<any | undefined> {
    const campaigns = campaignsStore.get(userId) || [];
    return campaigns.find(c => c.id === id);
  }

  async createCampaign(campaign: any): Promise<any> {
    const userId = campaign.userId;
    const campaigns = campaignsStore.get(userId) || [];
    const newCampaign = {
      ...campaign,
      id: `campaign_${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    campaigns.push(newCampaign);
    campaignsStore.set(userId, campaigns);
    return newCampaign;
  }

  async updateCampaign(userId: string, id: string, data: any): Promise<any> {
    const campaigns = campaignsStore.get(userId) || [];
    const index = campaigns.findIndex(c => c.id === id);
    if (index !== -1) {
      campaigns[index] = { ...campaigns[index], ...data, updatedAt: new Date() };
      campaignsStore.set(userId, campaigns);
      return campaigns[index];
    }
    return null;
  }

  async deleteCampaign(userId: string, id: string): Promise<void> {
    const campaigns = campaignsStore.get(userId) || [];
    const filtered = campaigns.filter(c => c.id !== id);
    campaignsStore.set(userId, filtered);
  }

  // ==================== CONTACT LIST OPERATIONS (In-Memory) ====================

  async getContactLists(userId: string): Promise<any[]> {
    return contactListsStore.get(userId) || [];
  }

  async getContactList(userId: string, id: string): Promise<any | undefined> {
    const lists = contactListsStore.get(userId) || [];
    return lists.find(l => l.id === id);
  }

  async createContactList(list: any): Promise<any> {
    const userId = list.userId;
    const lists = contactListsStore.get(userId) || [];
    const newList = {
      ...list,
      id: `list_${Date.now()}`,
      contacts: list.contacts || [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    lists.push(newList);
    contactListsStore.set(userId, lists);
    return newList;
  }

  async updateContactList(userId: string, id: string, data: any): Promise<any> {
    const lists = contactListsStore.get(userId) || [];
    const index = lists.findIndex(l => l.id === id);
    if (index !== -1) {
      lists[index] = { ...lists[index], ...data, updatedAt: new Date() };
      contactListsStore.set(userId, lists);
      return lists[index];
    }
    return null;
  }

  async deleteContactList(userId: string, id: string): Promise<void> {
    const lists = contactListsStore.get(userId) || [];
    const filtered = lists.filter(l => l.id !== id);
    contactListsStore.set(userId, filtered);
  }

  async addContactsToList(userId: string, listId: string, contacts: any[]): Promise<any> {
    const lists = contactListsStore.get(userId) || [];
    const index = lists.findIndex(l => l.id === listId);
    if (index !== -1) {
      const existingContacts = lists[index].contacts || [];
      lists[index].contacts = [...existingContacts, ...contacts];
      lists[index].updatedAt = new Date();
      contactListsStore.set(userId, lists);
      return { success: true, totalContacts: lists[index].contacts.length };
    }
    return { success: false };
  }

  async getSyncedContacts(userId: string): Promise<any[]> {
    return syncedContactsStore.get(userId) || [];
  }

  async saveSyncedContacts(userId: string, contacts: any[]): Promise<void> {
    const existing = syncedContactsStore.get(userId) || [];
    const merged = [...existing];
    
    for (const contact of contacts) {
      const existingIndex = merged.findIndex(c => c.phone === contact.phone);
      if (existingIndex === -1) {
        merged.push(contact);
      } else {
        merged[existingIndex] = { ...merged[existingIndex], ...contact };
      }
    }
    
    syncedContactsStore.set(userId, merged);
  }

  async getUserActiveConnection(userId: string): Promise<any | undefined> {
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true)
      ))
      .orderBy(desc(whatsappConnections.createdAt))
      .limit(1);
    return connection;
  }

  // ========================================================================
  // ADMIN CONVERSATIONS - Conversas do WhatsApp do admin com clientes
  // ========================================================================

  async getAdminConversations(adminId: string): Promise<any[]> {
    const result = await db
      .select()
      .from(adminConversations)
      .where(eq(adminConversations.adminId, adminId))
      .orderBy(desc(adminConversations.lastMessageTime));
    return result;
  }

  async getAdminConversation(id: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(eq(adminConversations.id, id));
    return result;
  }

  // Busca conversa do admin pelo número de telefone (sistema single-admin)
  async getAdminConversationByPhone(contactNumber: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(eq(adminConversations.contactNumber, contactNumber));
    return result;
  }

  async getAdminConversationByContact(adminId: string, contactNumber: string): Promise<any | undefined> {
    const [result] = await db
      .select()
      .from(adminConversations)
      .where(and(
        eq(adminConversations.adminId, adminId),
        eq(adminConversations.contactNumber, contactNumber)
      ));
    return result;
  }

  async createAdminConversation(data: {
    adminId: string;
    contactNumber: string;
    remoteJid?: string;
    contactName?: string;
    contactAvatar?: string;
    isAgentEnabled?: boolean;
  }): Promise<any> {
    const [result] = await db
      .insert(adminConversations)
      .values({
        adminId: data.adminId,
        contactNumber: data.contactNumber,
        remoteJid: data.remoteJid,
        contactName: data.contactName,
        contactAvatar: data.contactAvatar,
        isAgentEnabled: data.isAgentEnabled ?? true,
        unreadCount: 0,
      })
      .returning();
    return result;
  }

  async updateAdminConversation(id: string, data: Partial<{
    contactName: string;
    contactAvatar: string;
    lastMessageText: string;
    lastMessageTime: Date;
    unreadCount: number;
    isAgentEnabled: boolean;
  }>): Promise<any> {
    const [result] = await db
      .update(adminConversations)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(adminConversations.id, id))
      .returning();
    return result;
  }

  async getOrCreateAdminConversation(adminId: string, contactNumber: string, remoteJid?: string, contactName?: string, contactAvatar?: string): Promise<any> {
    let conversation = await this.getAdminConversationByContact(adminId, contactNumber);
    
    if (!conversation) {
      conversation = await this.createAdminConversation({
        adminId,
        contactNumber,
        remoteJid,
        contactName,
        contactAvatar,
      });
    } else if (contactName || contactAvatar) {
      // Update if name/avatar provided and different/missing
      const updates: any = {};
      if (contactName && conversation.contactName !== contactName) updates.contactName = contactName;
      if (contactAvatar && conversation.contactAvatar !== contactAvatar) updates.contactAvatar = contactAvatar;
      
      if (Object.keys(updates).length > 0) {
        conversation = await this.updateAdminConversation(conversation.id, updates);
      }
    }
    
    return conversation;
  }

  // Admin Messages
  async getAdminMessages(conversationId: string): Promise<any[]> {
    const result = await db
      .select()
      .from(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId))
      .orderBy(adminMessages.timestamp);
    return result;
  }

  async createAdminMessage(data: {
    conversationId: string;
    messageId: string;
    fromMe: boolean;
    text?: string;
    timestamp: Date;
    status?: string;
    isFromAgent?: boolean;
    mediaType?: string;
    mediaUrl?: string;
    mediaMimeType?: string;
    mediaCaption?: string;
  }): Promise<any> {
    // Criar cópia para permitir modificação
    const messageData = { ...data };

    // 🎤 Transcrição automática para TODOS os áudios (do dono/fromMe=true E do cliente/fromMe=false)
    if (messageData.mediaType === "audio" && messageData.mediaUrl) {
      try {
        const base64Part = messageData.mediaUrl.split(",")[1];
        if (base64Part) {
          const audioBuffer = Buffer.from(base64Part, "base64");
          const origem = messageData.fromMe ? "dono" : "cliente";
          console.log(`[Storage] Transcrevendo áudio do ${origem} (${audioBuffer.length} bytes)...`);
          
          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: `whatsapp-audio-${origem}.ogg`,
          });

          if (transcription && transcription.length > 0) {
            console.log(`[Storage] Transcrição do ${origem}: ${transcription.substring(0, 100)}...`);
            messageData.text = transcription;
          }
        }
      } catch (error) {
        console.error("[Storage] Erro ao transcrever áudio:", error);
      }
    }

    const [result] = await db
      .insert(adminMessages)
      .values({
        conversationId: messageData.conversationId,
        messageId: messageData.messageId,
        fromMe: messageData.fromMe,
        text: messageData.text,
        timestamp: messageData.timestamp,
        status: messageData.status,
        isFromAgent: messageData.isFromAgent ?? false,
        mediaType: messageData.mediaType,
        mediaUrl: messageData.mediaUrl,
        mediaMimeType: messageData.mediaMimeType,
        mediaCaption: messageData.mediaCaption,
      })
      .returning();
    return result;
  }

  async toggleAdminConversationAgent(conversationId: string, enabled: boolean): Promise<any> {
    const [result] = await db
      .update(adminConversations)
      .set({ isAgentEnabled: enabled, updatedAt: new Date() })
      .where(eq(adminConversations.id, conversationId))
      .returning();
    return result;
  }

  async clearAdminConversationMessages(conversationId: string): Promise<number> {
    // Deletar todas as mensagens da conversa
    const result = await db
      .delete(adminMessages)
      .where(eq(adminMessages.conversationId, conversationId));
    
    // Atualizar a conversa para limpar última mensagem
    await db
      .update(adminConversations)
      .set({ 
        lastMessageText: null, 
        lastMessageTime: new Date(),
        updatedAt: new Date() 
      })
      .where(eq(adminConversations.id, conversationId));
    
    console.log(`🗑️ [STORAGE] Mensagens da conversa ${conversationId} limpas`);
    return result.rowCount || 0;
  }

  async isAdminAgentEnabledForConversation(conversationId: string): Promise<boolean> {
    const [conversation] = await db
      .select({ isAgentEnabled: adminConversations.isAgentEnabled })
      .from(adminConversations)
      .where(eq(adminConversations.id, conversationId));
    return conversation?.isAgentEnabled ?? true;
  }

  // =============================================================================
  // ADMIN AGENT MEDIA - Persistência de mídias do admin agent
  // =============================================================================

  async getAllAdminMedia(adminId: string): Promise<AdminAgentMedia[]> {
    return await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.adminId, adminId))
      .orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }

  async getActiveAdminMedia(adminId?: string): Promise<AdminAgentMedia[]> {
    // Sistema single-admin: busca de qualquer admin se não especificar
    return await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.isActive, true))
      .orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }

  async getAdminMediaById(id: string): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .select()
      .from(adminAgentMedia)
      .where(eq(adminAgentMedia.id, id));
    return result;
  }

  async getAdminMediaByName(adminId: string | undefined, name: string): Promise<AdminAgentMedia | undefined> {
    const normalizedName = name.toUpperCase().replace(/\s+/g, '_');
    // Sistema single-admin: busca de qualquer admin
    const [result] = await db
      .select()
      .from(adminAgentMedia)
      .where(and(
        eq(adminAgentMedia.name, normalizedName),
        eq(adminAgentMedia.isActive, true)
      ));
    return result;
  }

  async createAdminMedia(mediaData: InsertAdminAgentMedia): Promise<AdminAgentMedia> {
    const [result] = await db
      .insert(adminAgentMedia)
      .values({
        ...mediaData,
        name: mediaData.name.toUpperCase().replace(/\s+/g, '_'), // Normalizar nome
      })
      .returning();
    return result;
  }

  async updateAdminMedia(id: string, mediaData: Partial<InsertAdminAgentMedia>): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .update(adminAgentMedia)
      .set({
        ...mediaData,
        name: mediaData.name ? mediaData.name.toUpperCase().replace(/\s+/g, '_') : undefined,
        updatedAt: new Date(),
      })
      .where(eq(adminAgentMedia.id, id))
      .returning();
    return result;
  }

  async deleteAdminMedia(id: string): Promise<boolean> {
    const result = await db
      .delete(adminAgentMedia)
      .where(eq(adminAgentMedia.id, id));
    return result.rowCount! > 0;
  }

  async toggleAdminMediaActive(id: string, isActive: boolean): Promise<AdminAgentMedia | undefined> {
    const [result] = await db
      .update(adminAgentMedia)
      .set({ isActive, updatedAt: new Date() })
      .where(eq(adminAgentMedia.id, id))
      .returning();
    return result;
  }



  /**
   * Reset completo de um cliente pelo número de telefone
   * Exclui: conversa admin, mensagens admin, sessão em memória, user (se existir)
   * Usado para testes - permite testar como cliente novo
   */
  async resetClientByPhone(phoneNumber: string): Promise<{
    conversationDeleted: boolean;
    messagesDeleted: number;
    userDeleted: boolean;
    connectionDeleted: boolean;
    subscriptionDeleted: boolean;
    agentConfigDeleted: boolean;
  }> {
    const result = {
      conversationDeleted: false,
      messagesDeleted: 0,
      userDeleted: false,
      connectionDeleted: false,
      subscriptionDeleted: false,
      agentConfigDeleted: false,
    };

    console.log(`🗑️ [RESET CLIENT] Iniciando reset para ${phoneNumber}...`);

    try {
      // 1. Buscar conversa admin pelo número
      const adminConv = await this.getAdminConversationByPhone(phoneNumber);
      if (adminConv) {
        // Deletar todas as mensagens da conversa
        const messagesResult = await db
          .delete(adminMessages)
          .where(eq(adminMessages.conversationId, adminConv.id));
        result.messagesDeleted = messagesResult.rowCount || 0;
        console.log(`🗑️ [RESET CLIENT] ${result.messagesDeleted} mensagens admin excluídas`);

        // Deletar a conversa
        await db
          .delete(adminConversations)
          .where(eq(adminConversations.id, adminConv.id));
        result.conversationDeleted = true;
        console.log(`🗑️ [RESET CLIENT] Conversa admin excluída`);
      }

      // 2. Buscar user pelo telefone
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, phoneNumber));

      if (user) {
        // Deletar config do agente
        const agentResult = await db
          .delete(aiAgentConfig)
          .where(eq(aiAgentConfig.userId, user.id));
        result.agentConfigDeleted = (agentResult.rowCount || 0) > 0;
        if (result.agentConfigDeleted) {
          console.log(`🗑️ [RESET CLIENT] Config do agente excluída`);
        }

        // Buscar conexão do usuário
        const [connection] = await db
          .select()
          .from(whatsappConnections)
          .where(eq(whatsappConnections.userId, user.id));

        if (connection) {
          // Buscar conversas do usuário
          const userConversations = await db
            .select()
            .from(conversations)
            .where(eq(conversations.connectionId, connection.id));

          // Deletar mensagens das conversas do usuário
          for (const conv of userConversations) {
            await db
              .delete(messages)
              .where(eq(messages.conversationId, conv.id));
          }

          // Deletar conversas do usuário
          await db
            .delete(conversations)
            .where(eq(conversations.connectionId, connection.id));

          // Deletar conexão
          await db
            .delete(whatsappConnections)
            .where(eq(whatsappConnections.id, connection.id));
          result.connectionDeleted = true;
          console.log(`🗑️ [RESET CLIENT] Conexão WhatsApp excluída`);
        }

        // Buscar e deletar subscription
        const [subscription] = await db
          .select()
          .from(subscriptions)
          .where(eq(subscriptions.userId, user.id));

        if (subscription) {
          // Deletar pagamentos
          await db
            .delete(payments)
            .where(eq(payments.subscriptionId, subscription.id));

          // Deletar subscription
          await db
            .delete(subscriptions)
            .where(eq(subscriptions.id, subscription.id));
          result.subscriptionDeleted = true;
          console.log(`🗑️ [RESET CLIENT] Subscription excluída`);
        }

        // Finalmente, deletar o usuário
        await db
          .delete(users)
          .where(eq(users.id, user.id));
        result.userDeleted = true;
        console.log(`🗑️ [RESET CLIENT] Usuário excluído`);
      }

      console.log(`✅ [RESET CLIENT] Reset completo para ${phoneNumber}`, result);
      return result;

    } catch (error) {
      console.error(`❌ [RESET CLIENT] Erro ao resetar cliente:`, error);
      throw error;
    }
  }

  /**
   * Reset SEGURO de conta de teste com validações rigorosas
   * Só permite deletar se for REALMENTE uma conta de teste
   */
  async resetTestAccountSafely(phoneNumber: string): Promise<{ 
    success: boolean; 
    error?: string;
    result?: any;
  }> {
    try {
      console.log(`🔍 [SAFE RESET] Verificando segurança para ${phoneNumber}...`);

      // 1. Buscar usuário pelo telefone
      const [user] = await db
        .select()
        .from(users)
        .where(eq(users.phone, phoneNumber));

      if (!user) {
        console.log(`⚠️ [SAFE RESET] Nenhum usuário encontrado para ${phoneNumber}`);
        // Se não tem usuário, apenas limpa conversas admin
        const adminConv = await this.getAdminConversationByPhone(phoneNumber);
        if (adminConv) {
          await db.delete(adminMessages).where(eq(adminMessages.conversationId, adminConv.id));
          await db.delete(adminConversations).where(eq(adminConversations.id, adminConv.id));
        }
        return { 
          success: true, 
          result: { userDeleted: false, conversationDeleted: !!adminConv } 
        };
      }

      // 2. VALIDAÇÕES DE SEGURANÇA
      
      // Validação 1: Email deve ser @agentezap.temp (conta gerada automaticamente)
      // RELAXADO: Se o admin pediu reset, vamos permitir deletar mesmo se não for .temp, 
      // desde que não tenha pagamentos reais (verificado abaixo)
      /*
      if (!user.email?.endsWith('@agentezap.temp')) {
        return {
          success: false,
          error: `⛔ Não é uma conta de teste! Email: ${user.email || 'não definido'}. Apenas contas @agentezap.temp podem ser deletadas.`
        };
      }
      */

      // Validação 2: Verificar conexão WhatsApp
      const [connection] = await db
        .select()
        .from(whatsappConnections)
        .where(eq(whatsappConnections.userId, user.id));

      if (connection && connection.isConnected) {
        console.log(`⚠️ [SAFE RESET] Usuário tem WhatsApp conectado. Desconectando forçadamente para permitir reset...`);
        // Desconectar WhatsApp antes de deletar
        await db
          .update(whatsappConnections)
          .set({ isConnected: false, qrCode: null })
          .where(eq(whatsappConnections.id, connection.id));
      }

      // Validação 3: Verificar se tem mensagens reais (conversas com clientes)
      if (connection) {
        const [hasRealConversations] = await db
          .select({ count: sql<number>`count(*)` })
          .from(conversations)
          .where(eq(conversations.connectionId, connection.id));
        
        if (hasRealConversations && Number(hasRealConversations.count) > 0) {
          console.log(`⚠️ [SAFE RESET] Usuário tem conversas reais (${hasRealConversations.count}). Apagando conversas para permitir reset...`);
          // Apagar conversas reais para permitir reset
          await db
            .delete(conversations)
            .where(eq(conversations.connectionId, connection.id));
        }
      }

      // Validação 4: Verificar subscription (só pode deletar se for trial ou inexistente)
      const [subscription] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.userId, user.id));

      if (subscription && subscription.status !== 'trialing' && subscription.status !== 'inactive') {
        return {
          success: false,
          error: `⛔ Usuário tem assinatura ativa (${subscription.status})! Não pode deletar conta com pagamento ativo.`
        };
      }

      // Validação 5: Verificar se tem pagamentos realizados
      if (subscription) {
        const [hasPayments] = await db
          .select({ count: sql<number>`count(*)` })
          .from(payments)
          .where(eq(payments.subscriptionId, subscription.id));

        if (hasPayments && Number(hasPayments.count) > 0) {
          return {
            success: false,
            error: '⛔ Usuário tem pagamentos registrados! Não pode deletar conta com histórico financeiro.'
          };
        }
      }

      // Validação 6: Verificar idade da conta (segurança extra)
      const createdAtDate = user.createdAt ? new Date(user.createdAt) : new Date();
      const accountAge = Date.now() - createdAtDate.getTime();
      const daysOld = accountAge / (1000 * 60 * 60 * 24);
      if (daysOld > 30) {
        return {
          success: false,
          error: `⛔ Conta tem mais de 30 dias (${Math.floor(daysOld)} dias). Muito antiga para reset automático.`
        };
      }

      // ✅ TODAS AS VALIDAÇÕES PASSARAM - SAFE TO DELETE
      console.log(`✅ [SAFE RESET] Validações OK para ${phoneNumber}. Procedendo com reset...`);
      
      const result = await this.resetClientByPhone(phoneNumber);
      
      return {
        success: true,
        result
      };

    } catch (error: any) {
      console.error(`❌ [SAFE RESET] Erro ao resetar:`, error);
      return {
        success: false,
        error: `Erro técnico: ${error.message}`
      };
    }
  }

  // ==================== QUICK REPLIES / RESPOSTAS RÁPIDAS ====================

  async getQuickReplies(adminId: string): Promise<any[]> {
    const { adminQuickReplies } = await import("@shared/schema");
    return db
      .select()
      .from(adminQuickReplies)
      .where(eq(adminQuickReplies.adminId, adminId))
      .orderBy(adminQuickReplies.createdAt);
  }

  async getQuickReply(id: string): Promise<any | undefined> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .select()
      .from(adminQuickReplies)
      .where(eq(adminQuickReplies.id, id));
    return reply;
  }

  async createQuickReply(data: {
    adminId: string;
    title: string;
    content: string;
    shortcut?: string | null;
    category?: string | null;
  }): Promise<any> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .insert(adminQuickReplies)
      .values(data)
      .returning();
    return reply;
  }

  async updateQuickReply(id: string, data: Partial<{
    title: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    updatedAt: Date;
  }>): Promise<any> {
    const { adminQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .update(adminQuickReplies)
      .set(data)
      .where(eq(adminQuickReplies.id, id))
      .returning();
    return reply;
  }

  async deleteQuickReply(id: string): Promise<void> {
    const { adminQuickReplies } = await import("@shared/schema");
    await db
      .delete(adminQuickReplies)
      .where(eq(adminQuickReplies.id, id));
  }

  async incrementQuickReplyUsage(id: string): Promise<void> {
    const { adminQuickReplies } = await import("@shared/schema");
    await db
      .update(adminQuickReplies)
      .set({
        usageCount: sql`${adminQuickReplies.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(adminQuickReplies.id, id));
  }

  // ==================== USER QUICK REPLIES / RESPOSTAS RÁPIDAS USUÁRIOS ====================

  async getUserQuickReplies(userId: string): Promise<any[]> {
    const { userQuickReplies } = await import("@shared/schema");
    return db
      .select()
      .from(userQuickReplies)
      .where(eq(userQuickReplies.userId, userId))
      .orderBy(userQuickReplies.createdAt);
  }

  async getUserQuickReply(id: string): Promise<any | undefined> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .select()
      .from(userQuickReplies)
      .where(eq(userQuickReplies.id, id));
    return reply;
  }

  async createUserQuickReply(data: {
    userId: string;
    title: string;
    content: string;
    shortcut?: string | null;
    category?: string | null;
  }): Promise<any> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .insert(userQuickReplies)
      .values(data)
      .returning();
    return reply;
  }

  async updateUserQuickReply(id: string, data: Partial<{
    title: string;
    content: string;
    shortcut: string | null;
    category: string | null;
    usageCount: number;
    updatedAt: Date;
  }>): Promise<any> {
    const { userQuickReplies } = await import("@shared/schema");
    const [reply] = await db
      .update(userQuickReplies)
      .set(data)
      .where(eq(userQuickReplies.id, id))
      .returning();
    return reply;
  }

  async deleteUserQuickReply(id: string): Promise<void> {
    const { userQuickReplies } = await import("@shared/schema");
    await db
      .delete(userQuickReplies)
      .where(eq(userQuickReplies.id, id));
  }

  async incrementUserQuickReplyUsage(id: string): Promise<void> {
    const { userQuickReplies } = await import("@shared/schema");
    await db
      .update(userQuickReplies)
      .set({
        usageCount: sql`${userQuickReplies.usageCount} + 1`,
        updatedAt: new Date(),
      })
      .where(eq(userQuickReplies.id, id));
  }

  // ==================== EXCLUSION LIST / LISTA DE EXCLUSÃO ====================

  /**
   * Normaliza um número de telefone brasileiro para comparação
   * Retorna array com todas as variações possíveis do número
   * Ex: 5517991956944 -> ['5517991956944', '17991956944', '991956944']
   */
  private normalizePhoneForComparison(phoneNumber: string): string[] {
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const variations: string[] = [cleanNumber];
    
    // Se começa com 55 (Brasil), adicionar versão sem 55
    if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
      variations.push(cleanNumber.substring(2)); // Remove 55
    }
    
    // Se não começa com 55, adicionar versão com 55
    if (!cleanNumber.startsWith('55') && cleanNumber.length >= 10) {
      variations.push('55' + cleanNumber);
    }
    
    // Para números com DDD (2 dígitos) + número (8 ou 9 dígitos)
    // Adicionar versão apenas com número local (sem DDD)
    if (cleanNumber.length >= 10 && cleanNumber.length <= 11) {
      variations.push(cleanNumber.substring(2)); // Remove DDD
    }
    
    // Se já é número com código do país, adicionar sem código do país e sem DDD
    if (cleanNumber.startsWith('55') && cleanNumber.length >= 12) {
      const withoutCountry = cleanNumber.substring(2);
      if (withoutCountry.length >= 10) {
        variations.push(withoutCountry.substring(2)); // Apenas número local
      }
    }
    
    console.log(`📞 [EXCLUSION] Normalizando número ${phoneNumber} -> variações: [${variations.join(', ')}]`);
    return [...new Set(variations)]; // Remove duplicados
  }

  /**
   * Verifica se um número está na lista de exclusão de um usuário
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído e ativo
   */
  async isNumberExcluded(userId: string, phoneNumber: string): Promise<boolean> {
    const { exclusionList, exclusionConfig } = await import("@shared/schema");
    const { or } = await import("drizzle-orm");
    
    // Primeiro verificar se a lista de exclusão está ativa para o usuário
    const config = await this.getExclusionConfig(userId);
    if (!config?.isEnabled) {
      console.log(`🚫 [EXCLUSION] Lista de exclusão desativada para usuário ${userId}`);
      return false;
    }

    // Obter todas as variações possíveis do número para comparação
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    
    // Buscar qualquer item que corresponda a alguma das variações do número
    const items = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, userId),
          eq(exclusionList.isActive, true),
          or(...numberVariations.map(num => eq(exclusionList.phoneNumber, num)))
        )
      );
    
    const isExcluded = items.length > 0;
    console.log(`📞 [EXCLUSION] Verificando ${phoneNumber} (variações: ${numberVariations.join(', ')}) -> ${isExcluded ? '🚫 EXCLUÍDO' : '✅ Permitido'}`);
    
    return isExcluded;
  }

  /**
   * Verifica se um número está excluído de follow-up
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído de follow-up
   */
  async isNumberExcludedFromFollowup(userId: string, phoneNumber: string): Promise<boolean> {
    const { exclusionList } = await import("@shared/schema");
    const { or } = await import("drizzle-orm");
    
    // Verificar configuração global de follow-up
    const config = await this.getExclusionConfig(userId);
    if (!config?.isEnabled || !config?.followupExclusionEnabled) {
      console.log(`🚫 [EXCLUSION] Exclusão de follow-up desativada para usuário ${userId}`);
      return false;
    }

    // Obter todas as variações possíveis do número para comparação
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    
    // Buscar qualquer item que corresponda a alguma das variações do número
    const items = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, userId),
          eq(exclusionList.isActive, true),
          eq(exclusionList.excludeFromFollowup, true),
          or(...numberVariations.map(num => eq(exclusionList.phoneNumber, num)))
        )
      );
    
    const isExcluded = items.length > 0;
    console.log(`📞 [EXCLUSION-FOLLOWUP] Verificando ${phoneNumber} -> ${isExcluded ? '🚫 EXCLUÍDO DE FOLLOW-UP' : '✅ Follow-up permitido'}`);
    
    return isExcluded;
  }

  /**
   * Obtém configuração de exclusão do usuário
   */
  async getExclusionConfig(userId: string): Promise<any | undefined> {
    const { exclusionConfig } = await import("@shared/schema");
    const [config] = await db
      .select()
      .from(exclusionConfig)
      .where(eq(exclusionConfig.userId, userId));
    return config;
  }

  /**
   * Cria ou atualiza configuração de exclusão do usuário
   */
  async upsertExclusionConfig(userId: string, data: {
    isEnabled?: boolean;
    followupExclusionEnabled?: boolean;
  }): Promise<any> {
    const { exclusionConfig } = await import("@shared/schema");
    
    const existing = await this.getExclusionConfig(userId);
    
    if (existing) {
      const [config] = await db
        .update(exclusionConfig)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(eq(exclusionConfig.userId, userId))
        .returning();
      return config;
    } else {
      const [config] = await db
        .insert(exclusionConfig)
        .values({
          userId,
          isEnabled: data.isEnabled ?? true,
          followupExclusionEnabled: data.followupExclusionEnabled ?? true,
        })
        .returning();
      return config;
    }
  }

  /**
   * Obtém todos os números da lista de exclusão do usuário
   */
  async getExclusionList(userId: string): Promise<any[]> {
    const { exclusionList } = await import("@shared/schema");
    return db
      .select()
      .from(exclusionList)
      .where(eq(exclusionList.userId, userId))
      .orderBy(desc(exclusionList.createdAt));
  }

  /**
   * Obtém um item da lista de exclusão por ID
   */
  async getExclusionListItem(id: string): Promise<any | undefined> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .select()
      .from(exclusionList)
      .where(eq(exclusionList.id, id));
    return item;
  }

  /**
   * Adiciona um número à lista de exclusão
   */
  async addToExclusionList(data: {
    userId: string;
    phoneNumber: string;
    contactName?: string | null;
    reason?: string | null;
    excludeFromFollowup?: boolean;
    isActive?: boolean;
  }): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    
    // Limpar o número (apenas dígitos)
    const cleanNumber = data.phoneNumber.replace(/\D/g, "");
    
    // Verificar se já existe
    const existing = await db
      .select()
      .from(exclusionList)
      .where(
        and(
          eq(exclusionList.userId, data.userId),
          eq(exclusionList.phoneNumber, cleanNumber)
        )
      );
    
    if (existing.length > 0) {
      // Atualizar o existente
      const [item] = await db
        .update(exclusionList)
        .set({
          contactName: data.contactName,
          reason: data.reason,
          excludeFromFollowup: data.excludeFromFollowup ?? true,
          isActive: data.isActive ?? true,
          updatedAt: new Date(),
        })
        .where(eq(exclusionList.id, existing[0].id))
        .returning();
      return item;
    }
    
    const [item] = await db
      .insert(exclusionList)
      .values({
        userId: data.userId,
        phoneNumber: cleanNumber,
        contactName: data.contactName,
        reason: data.reason,
        excludeFromFollowup: data.excludeFromFollowup ?? true,
        isActive: data.isActive ?? true,
      })
      .returning();
    return item;
  }

  /**
   * Atualiza um item da lista de exclusão
   */
  async updateExclusionListItem(id: string, data: Partial<{
    contactName: string | null;
    reason: string | null;
    excludeFromFollowup: boolean;
    isActive: boolean;
  }>): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .update(exclusionList)
      .set({
        ...data,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id))
      .returning();
    return item;
  }

  /**
   * Remove um número da lista de exclusão (soft delete - desativa)
   */
  async removeFromExclusionList(id: string): Promise<void> {
    const { exclusionList } = await import("@shared/schema");
    await db
      .update(exclusionList)
      .set({
        isActive: false,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id));
  }

  /**
   * Remove permanentemente um número da lista de exclusão
   */
  async deleteFromExclusionList(id: string): Promise<void> {
    const { exclusionList } = await import("@shared/schema");
    await db
      .delete(exclusionList)
      .where(eq(exclusionList.id, id));
  }

  /**
   * Reativa um número na lista de exclusão
   */
  async reactivateExclusionListItem(id: string): Promise<any> {
    const { exclusionList } = await import("@shared/schema");
    const [item] = await db
      .update(exclusionList)
      .set({
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(exclusionList.id, id))
      .returning();
    return item;
  }

  // =============================================================================
  // DAILY USAGE TRACKING - Rastreamento de uso diário para limites free
  // =============================================================================

  /**
   * Obtém ou cria o registro de uso diário para um usuário
   */
  async getDailyUsage(userId: string): Promise<{ promptEditsCount: number; simulatorMessagesCount: number }> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [existing] = await db
      .select()
      .from(dailyUsage)
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      );

    if (existing) {
      return {
        promptEditsCount: existing.promptEditsCount,
        simulatorMessagesCount: existing.simulatorMessagesCount,
      };
    }

    return { promptEditsCount: 0, simulatorMessagesCount: 0 };
  }

  /**
   * Incrementa o contador de edições de prompt do dia
   */
  async incrementPromptEdits(userId: string): Promise<number> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tenta atualizar registro existente
    const updated = await db
      .update(dailyUsage)
      .set({
        promptEditsCount: sql`${dailyUsage.promptEditsCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      )
      .returning();

    if (updated.length > 0) {
      return updated[0].promptEditsCount;
    }

    // Se não existe, cria novo registro
    const [newRecord] = await db
      .insert(dailyUsage)
      .values({
        userId,
        usageDate: today,
        promptEditsCount: 1,
        simulatorMessagesCount: 0,
      })
      .returning();

    return newRecord.promptEditsCount;
  }

  /**
   * Incrementa o contador de mensagens do simulador do dia
   */
  async incrementSimulatorMessages(userId: string): Promise<number> {
    const { dailyUsage } = await import("@shared/schema");
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Tenta atualizar registro existente
    const updated = await db
      .update(dailyUsage)
      .set({
        simulatorMessagesCount: sql`${dailyUsage.simulatorMessagesCount} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(dailyUsage.userId, userId),
          eq(dailyUsage.usageDate, today)
        )
      )
      .returning();

    if (updated.length > 0) {
      return updated[0].simulatorMessagesCount;
    }

    // Se não existe, cria novo registro
    const [newRecord] = await db
      .insert(dailyUsage)
      .values({
        userId,
        usageDate: today,
        promptEditsCount: 0,
        simulatorMessagesCount: 1,
      })
      .returning();

    return newRecord.simulatorMessagesCount;
  }

  // ============================================================================
  // TAGS / ETIQUETAS - CRUD Operations
  // ============================================================================

  /**
   * Obtém todas as tags de um usuário
   */
  async getTagsByUserId(userId: string): Promise<Tag[]> {
    return await db
      .select()
      .from(tags)
      .where(eq(tags.userId, userId))
      .orderBy(tags.position, tags.name);
  }

  /**
   * Obtém uma tag por ID
   */
  async getTag(id: string): Promise<Tag | undefined> {
    const [tag] = await db
      .select()
      .from(tags)
      .where(eq(tags.id, id));
    return tag;
  }

  /**
   * Cria uma nova tag
   */
  async createTag(tagData: InsertTag): Promise<Tag> {
    const [newTag] = await db
      .insert(tags)
      .values(tagData)
      .returning();
    return newTag;
  }

  /**
   * Atualiza uma tag existente
   */
  async updateTag(id: string, data: Partial<InsertTag>): Promise<Tag> {
    const [updated] = await db
      .update(tags)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(tags.id, id))
      .returning();
    return updated;
  }

  /**
   * Deleta uma tag e remove todas as associações
   */
  async deleteTag(id: string): Promise<void> {
    await db.delete(tags).where(eq(tags.id, id));
  }

  /**
   * Cria tags padrão do WhatsApp Business para um usuário
   */
  async createDefaultTags(userId: string): Promise<Tag[]> {
    const defaultTags = [
      { name: "Novo cliente", color: "#22c55e", icon: "user-plus", position: 0, isDefault: true },
      { name: "Novo pedido", color: "#eab308", icon: "shopping-bag", position: 1, isDefault: true },
      { name: "Pagamento pendente", color: "#f97316", icon: "clock", position: 2, isDefault: true },
      { name: "Pago", color: "#3b82f6", icon: "check-circle", position: 3, isDefault: true },
      { name: "Pedido finalizado", color: "#ef4444", icon: "package", position: 4, isDefault: true },
      { name: "VIP", color: "#a855f7", icon: "star", position: 5, isDefault: true },
    ];

    const createdTags: Tag[] = [];
    for (const tagData of defaultTags) {
      try {
        const [newTag] = await db
          .insert(tags)
          .values({ ...tagData, userId })
          .onConflictDoNothing()
          .returning();
        if (newTag) createdTags.push(newTag);
      } catch (error) {
        // Ignora duplicatas
        console.log(`Tag "${tagData.name}" já existe para o usuário`);
      }
    }
    return createdTags;
  }

  // ============================================================================
  // CONVERSATION TAGS - Associação de Tags a Conversas
  // ============================================================================

  /**
   * Obtém todas as tags de uma conversa
   */
  async getConversationTags(conversationId: string): Promise<Tag[]> {
    const result = await db
      .select({
        tag: tags,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(eq(conversationTags.conversationId, conversationId));
    
    return result.map(r => r.tag);
  }

  /**
   * Obtém conversas filtradas por tag
   */
  async getConversationsByTag(tagId: string, connectionId: string): Promise<Conversation[]> {
    const result = await db
      .select({
        conversation: conversations,
      })
      .from(conversationTags)
      .innerJoin(conversations, eq(conversationTags.conversationId, conversations.id))
      .where(
        and(
          eq(conversationTags.tagId, tagId),
          eq(conversations.connectionId, connectionId)
        )
      )
      .orderBy(desc(conversations.lastMessageTime));
    
    return result.map(r => r.conversation);
  }

  /**
   * Adiciona uma tag a uma conversa
   */
  async addTagToConversation(conversationId: string, tagId: string): Promise<ConversationTag> {
    const [result] = await db
      .insert(conversationTags)
      .values({ conversationId, tagId })
      .onConflictDoNothing()
      .returning();
    return result;
  }

  /**
   * Remove uma tag de uma conversa
   */
  async removeTagFromConversation(conversationId: string, tagId: string): Promise<void> {
    await db
      .delete(conversationTags)
      .where(
        and(
          eq(conversationTags.conversationId, conversationId),
          eq(conversationTags.tagId, tagId)
        )
      );
  }

  /**
   * Atualiza todas as tags de uma conversa (substitui as existentes)
   */
  async setConversationTags(conversationId: string, tagIds: string[]): Promise<void> {
    // Remove todas as tags existentes
    await db
      .delete(conversationTags)
      .where(eq(conversationTags.conversationId, conversationId));
    
    // Adiciona as novas tags
    if (tagIds.length > 0) {
      await db
        .insert(conversationTags)
        .values(tagIds.map(tagId => ({ conversationId, tagId })))
        .onConflictDoNothing();
    }
  }

  /**
   * Obtém conversas com suas tags para um connectionId
   */
  async getConversationsWithTags(connectionId: string): Promise<(Conversation & { tags: Tag[] })[]> {
    // Busca todas as conversas
    const allConversations = await db
      .select()
      .from(conversations)
      .where(eq(conversations.connectionId, connectionId))
      .orderBy(desc(conversations.lastMessageTime));
    
    // Busca todas as tags associadas
    const conversationIds = allConversations.map(c => c.id);
    
    if (conversationIds.length === 0) {
      return [];
    }

    const allTags = await db
      .select({
        conversationId: conversationTags.conversationId,
        tag: tags,
      })
      .from(conversationTags)
      .innerJoin(tags, eq(conversationTags.tagId, tags.id))
      .where(inArray(conversationTags.conversationId, conversationIds));
    
    // Agrupa tags por conversa
    const tagsByConversation = new Map<string, Tag[]>();
    for (const { conversationId, tag } of allTags) {
      if (!tagsByConversation.has(conversationId)) {
        tagsByConversation.set(conversationId, []);
      }
      tagsByConversation.get(conversationId)!.push(tag);
    }
    
    // Combina conversas com suas tags
    return allConversations.map(conv => ({
      ...conv,
      tags: tagsByConversation.get(conv.id) || [],
    }));
  }

  // ============================================
  // RESELLER FUNCTIONS - Sistema de Revenda White-Label
  // ============================================

  /**
   * Cria um novo revendedor
   */
  async createReseller(data: InsertReseller): Promise<Reseller> {
    const [result] = await db.insert(resellers).values(data).returning();
    return result;
  }

  /**
   * Obtém revendedor por ID
   */
  async getReseller(id: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo ID do usuário
   */
  async getResellerByUserId(userId: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.userId, userId)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo domínio customizado
   */
  async getResellerByDomain(domain: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return result;
  }

  /**
   * Obtém revendedor pelo subdomínio
   */
  async getResellerBySubdomain(subdomain: string): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return result;
  }

  /**
   * Atualiza revendedor
   */
  async updateReseller(id: string, data: Partial<InsertReseller>): Promise<Reseller | undefined> {
    const [result] = await db
      .update(resellers)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resellers.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém revendedor por ID
   */
  async getResellerById(id: number): Promise<Reseller | undefined> {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }

  /**
   * Lista todos os revendedores (admin)
   */
  async getAllResellers(): Promise<(Reseller & { user: User | null; clientCount: number })[]> {
    const allResellers = await db.select().from(resellers).orderBy(desc(resellers.createdAt));
    
    const results: (Reseller & { user: User | null; clientCount: number })[] = [];
    
    for (const reseller of allResellers) {
      const [user] = await db.select().from(users).where(eq(users.id, reseller.userId)).limit(1);
      const clientCountResult = await db
        .select({ count: sql<number>`count(*)` })
        .from(resellerClients)
        .where(eq(resellerClients.resellerId, reseller.id));
      
      results.push({
        ...reseller,
        user: user || null,
        clientCount: Number(clientCountResult[0]?.count || 0),
      });
    }
    
    return results;
  }

  /**
   * Verifica se subdomínio está disponível
   */
  async isSubdomainAvailable(subdomain: string): Promise<boolean> {
    const [existing] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return !existing;
  }

  /**
   * Verifica se domínio está disponível
   */
  async isDomainAvailable(domain: string): Promise<boolean> {
    const [existing] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return !existing;
  }

  // ============================================
  // RESELLER CLIENTS FUNCTIONS
  // ============================================

  /**
   * Cria um novo cliente do revendedor
   */
  async createResellerClient(data: InsertResellerClient): Promise<ResellerClient> {
    const [result] = await db.insert(resellerClients).values(data).returning();
    
    // Atualizar o reseller_id do usuário
    await db.update(users).set({ resellerId: data.resellerId }).where(eq(users.id, data.userId));
    
    return result;
  }

  /**
   * Obtém cliente do revendedor por ID
   */
  async getResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém cliente do revendedor por ID (número)
   */
  async getResellerClientById(id: number): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }

  /**
   * Obtém cliente do revendedor pelo ID do usuário
   */
  async getResellerClientByUserId(userId: string): Promise<ResellerClient | undefined> {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.userId, userId)).limit(1);
    return result;
  }

  /**
   * Lista clientes de um revendedor
   */
  async getResellerClients(resellerId: string): Promise<(ResellerClient & { user: User | null, firstPaymentDate: Date | null, lastPaymentDate: Date | null, isOverdue: boolean, monthsInSystem: number })[]> {
    const clients = await db
      .select()
      .from(resellerClients)
      .where(eq(resellerClients.resellerId, resellerId))
      .orderBy(desc(resellerClients.createdAt));
    
    const results: (ResellerClient & { user: User | null, firstPaymentDate: Date | null, lastPaymentDate: Date | null, isOverdue: boolean, monthsInSystem: number })[] = [];
    
    for (const client of clients) {
      const [user] = await db.select().from(users).where(eq(users.id, client.userId)).limit(1);
      
      // Buscar pagamentos do cliente
      const payments = await db
        .select()
        .from(resellerPayments)
        .where(and(
          eq(resellerPayments.resellerId, resellerId),
          eq(resellerPayments.resellerClientId, client.id),
          eq(resellerPayments.status, 'paid')
        ))
        .orderBy(resellerPayments.paidAt);
      
      const firstPaymentDate = payments.length > 0 && payments[0].paidAt ? payments[0].paidAt : null;
      const lastPaymentDate = payments.length > 0 && payments[payments.length - 1].paidAt ? payments[payments.length - 1].paidAt : null;
      
      // Cliente está em atraso se nextPaymentDate passou e não é cliente gratuito
      const isOverdue = !client.isFreeClient && 
                        client.nextPaymentDate !== null && 
                        new Date(client.nextPaymentDate) < new Date();
      
      // Quantos meses no sistema = quantidade de pagamentos
      const monthsInSystem = payments.length;
      
      results.push({ 
        ...client, 
        user: user || null,
        firstPaymentDate,
        lastPaymentDate,
        isOverdue,
        monthsInSystem
      });
    }
    
    return results;
  }

  /**
   * Atualiza cliente do revendedor
   */
  async updateResellerClient(id: string, data: Partial<InsertResellerClient>): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Suspende cliente do revendedor
   */
  async suspendResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "suspended", suspendedAt: new Date(), updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Reativa cliente do revendedor
   */
  async reactivateResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "active", suspendedAt: null, updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Cancela cliente do revendedor
   */
  async cancelResellerClient(id: string): Promise<ResellerClient | undefined> {
    const [result] = await db
      .update(resellerClients)
      .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
      .where(eq(resellerClients.id, id))
      .returning();
    return result;
  }

  /**
   * Conta clientes ativos de um revendedor
   */
  async countActiveResellerClients(resellerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(resellerClients)
      .where(and(eq(resellerClients.resellerId, resellerId), eq(resellerClients.status, "active")));
    return Number(result?.count || 0);
  }

  /**
   * Conta clientes gratuitos de um revendedor (máximo 1)
   */
  async countFreeResellerClients(resellerId: string): Promise<number> {
    const [result] = await db
      .select({ count: sql<number>`count(*)` })
      .from(resellerClients)
      .where(and(
        eq(resellerClients.resellerId, resellerId), 
        eq(resellerClients.isFreeClient, true)
      ));
    return Number(result?.count || 0);
  }

  // ============================================
  // RESELLER PAYMENTS FUNCTIONS
  // ============================================

  /**
   * Cria um novo pagamento do revendedor
   */
  async createResellerPayment(data: InsertResellerPayment): Promise<ResellerPayment> {
    const [result] = await db.insert(resellerPayments).values(data).returning();
    return result;
  }

  /**
   * Obtém pagamento do revendedor por ID
   */
  async getResellerPayment(id: string): Promise<ResellerPayment | undefined> {
    const [result] = await db.select().from(resellerPayments).where(eq(resellerPayments.id, id)).limit(1);
    return result;
  }

  /**
   * Lista pagamentos de um revendedor
   */
  async getResellerPayments(resellerId: string, limit: number = 50): Promise<ResellerPayment[]> {
    return db
      .select()
      .from(resellerPayments)
      .where(eq(resellerPayments.resellerId, resellerId))
      .orderBy(desc(resellerPayments.createdAt))
      .limit(limit);
  }

  /**
   * Atualiza pagamento do revendedor
   */
  async updateResellerPayment(id: string, data: Partial<InsertResellerPayment>): Promise<ResellerPayment | undefined> {
    const [result] = await db
      .update(resellerPayments)
      .set(data)
      .where(eq(resellerPayments.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém métricas do revendedor
   */
  async getResellerDashboardMetrics(resellerId: string): Promise<{
    totalClients: number;
    activeClients: number;
    suspendedClients: number;
    cancelledClients: number;
    totalRevenue: number;
    monthlyRevenue: number;
    monthlyCost: number;
    monthlyProfit: number;
  }> {
    // Contagem de clientes por status
    const clientStats = await db
      .select({
        status: resellerClients.status,
        count: sql<number>`count(*)`,
      })
      .from(resellerClients)
      .where(eq(resellerClients.resellerId, resellerId))
      .groupBy(resellerClients.status);
    
    const stats = {
      totalClients: 0,
      activeClients: 0,
      suspendedClients: 0,
      cancelledClients: 0,
    };
    
    for (const { status, count } of clientStats) {
      const countNum = Number(count);
      stats.totalClients += countNum;
      if (status === "active") stats.activeClients = countNum;
      if (status === "suspended") stats.suspendedClients = countNum;
      if (status === "cancelled") stats.cancelledClients = countNum;
    }
    
    // Receita total (pagamentos aprovados)
    const [totalRevenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(resellerPayments)
      .where(and(eq(resellerPayments.resellerId, resellerId), eq(resellerPayments.status, "approved")));
    
    // Receita do mês atual
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    
    const [monthlyRevenueResult] = await db
      .select({ total: sql<number>`COALESCE(SUM(amount), 0)` })
      .from(resellerPayments)
      .where(
        and(
          eq(resellerPayments.resellerId, resellerId),
          eq(resellerPayments.status, "approved"),
          gte(resellerPayments.createdAt, startOfMonth)
        )
      );
    
    // Obter config do revendedor para calcular custo
    const reseller = await this.getReseller(resellerId);
    const costPerClient = Number(reseller?.costPerClient || 49.99);
    const monthlyPrice = Number(reseller?.clientMonthlyPrice || 99.99);
    
    const monthlyCost = stats.activeClients * costPerClient;
    const monthlyRevenue = stats.activeClients * monthlyPrice;
    
    return {
      ...stats,
      totalRevenue: Number(totalRevenueResult?.total || 0),
      monthlyRevenue,
      monthlyCost,
      monthlyProfit: monthlyRevenue - monthlyCost,
    };
  }

  // ============================================
  // RESELLER INVOICES FUNCTIONS (Flow 2: Reseller -> System)
  // ============================================

  /**
   * Cria uma nova fatura do revendedor para o sistema
   */
  async createResellerInvoice(data: InsertResellerInvoice): Promise<ResellerInvoice> {
    const [result] = await db.insert(resellerInvoices).values(data).returning();
    return result;
  }

  /**
   * Obtém fatura do revendedor por ID
   */
  async getResellerInvoice(id: number): Promise<ResellerInvoice | undefined> {
    const [result] = await db.select().from(resellerInvoices).where(eq(resellerInvoices.id, id)).limit(1);
    return result;
  }

  /**
   * Lista faturas de um revendedor
   */
  async getResellerInvoices(resellerId: string, limit: number = 50): Promise<ResellerInvoice[]> {
    return db
      .select()
      .from(resellerInvoices)
      .where(eq(resellerInvoices.resellerId, resellerId))
      .orderBy(desc(resellerInvoices.createdAt))
      .limit(limit);
  }

  /**
   * Obtém fatura por mês de referência
   */
  async getResellerInvoiceByMonth(resellerId: string, referenceMonth: string): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .select()
      .from(resellerInvoices)
      .where(
        and(
          eq(resellerInvoices.resellerId, resellerId),
          eq(resellerInvoices.referenceMonth, referenceMonth)
        )
      )
      .limit(1);
    return result;
  }

  /**
   * Atualiza fatura do revendedor
   */
  async updateResellerInvoice(id: number, data: Partial<InsertResellerInvoice>): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .update(resellerInvoices)
      .set(data)
      .where(eq(resellerInvoices.id, id))
      .returning();
    return result;
  }

  /**
   * Obtém faturas pendentes ou vencidas de um revendedor
   */
  async getResellerPendingInvoices(resellerId: string): Promise<ResellerInvoice[]> {
    return db
      .select()
      .from(resellerInvoices)
      .where(
        and(
          eq(resellerInvoices.resellerId, resellerId),
          sql`${resellerInvoices.status} IN ('pending', 'overdue')`
        )
      )
      .orderBy(desc(resellerInvoices.dueDate));
  }

  /**
   * Cria fatura com itens (transacional)
   */
  async createResellerInvoiceWithItems(
    invoice: InsertResellerInvoice,
    items: InsertResellerInvoiceItem[]
  ): Promise<ResellerInvoice> {
    return await db.transaction(async (tx) => {
      const [newInvoice] = await tx
        .insert(resellerInvoices)
        .values(invoice)
        .returning();

      if (items.length > 0) {
        const itemsWithId = items.map((item) => ({
          ...item,
          invoiceId: newInvoice.id,
        }));
        await tx.insert(resellerInvoiceItems).values(itemsWithId);
      }

      return newInvoice;
    });
  }

  /**
   * Obtém fatura pelo ID do Mercado Pago
   */
  async getResellerInvoiceByMpPaymentId(mpPaymentId: string): Promise<ResellerInvoice | undefined> {
    const [result] = await db
      .select()
      .from(resellerInvoices)
      .where(eq(resellerInvoices.mpPaymentId, mpPaymentId))
      .limit(1);
    return result;
  }

  /**
   * Obtém itens de uma fatura
   */
  async getResellerInvoiceItems(invoiceId: number): Promise<ResellerInvoiceItem[]> {
    return db
      .select()
      .from(resellerInvoiceItems)
      .where(eq(resellerInvoiceItems.invoiceId, invoiceId));
  }
}

export const storage = new DatabaseStorage();
