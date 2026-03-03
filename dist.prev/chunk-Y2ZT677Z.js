import {
  analyzeImageWithMistral,
  transcribeAudioWithMistral
} from "./chunk-YCIPFGXJ.js";
import {
  db,
  pool,
  withRetry
} from "./chunk-HIRAYR4B.js";
import {
  adminAgentMedia,
  adminConversations,
  adminMessages,
  adminWhatsappConnection,
  admins,
  agentDisabledConversations,
  agents,
  aiAgentConfig,
  audioConfig,
  audioMessageCounter,
  businessAgentConfigs,
  connectionAgents,
  connectionMembers,
  contactLists,
  conversationTags,
  conversations,
  coupons,
  mediaFlowItems,
  mediaFlows,
  messages,
  paymentHistory,
  payments,
  plans,
  resellerClients,
  resellerInvoiceItems,
  resellerInvoices,
  resellerPayments,
  resellers,
  subscriptions,
  systemConfig,
  tags,
  teamMemberSessions,
  teamMembers,
  users,
  whatsappConnections,
  whatsappContacts
} from "./chunk-WF5ZUJEW.js";

// server/supabaseAuth.ts
import { createClient } from "@supabase/supabase-js";
import { eq as eq2 } from "drizzle-orm";
import session from "express-session";
import connectPg from "connect-pg-simple";

// server/storage.ts
import { eq, desc, and, gte, sql, inArray, lte, lt, gt, isNull, asc, or } from "drizzle-orm";
var MemoryCache = class {
  cache = /* @__PURE__ */ new Map();
  inflight = /* @__PURE__ */ new Map();
  maxSize = 2e3;
  // Máximo de entradas no cache
  set(key, data, ttlMs = 3e4) {
    if (this.cache.size >= this.maxSize) {
      this.cleanup();
    }
    this.cache.set(key, { data, timestamp: Date.now(), ttl: ttlMs });
  }
  get(key) {
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }
  /** Check if key exists in cache (distinguishes cached null from cache miss) */
  has(key) {
    const entry = this.cache.get(key);
    if (!entry) return false;
    if (Date.now() - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return false;
    }
    return true;
  }
  /**
   * Get-or-compute with thundering herd protection.
   * Only ONE concurrent call per key actually runs computeFn;
   * all others await the same Promise.
   */
  async getOrCompute(key, computeFn, ttlMs = 3e4) {
    if (this.has(key)) {
      return this.get(key);
    }
    const existing = this.inflight.get(key);
    if (existing) return existing;
    const promise = computeFn().then((result) => {
      this.set(key, result, ttlMs);
      this.inflight.delete(key);
      return result;
    }).catch((err) => {
      this.inflight.delete(key);
      throw err;
    });
    this.inflight.set(key, promise);
    return promise;
  }
  invalidate(pattern) {
    for (const key of this.cache.keys()) {
      if (key.includes(pattern)) {
        this.cache.delete(key);
      }
    }
  }
  cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
    if (this.cache.size >= this.maxSize) {
      const entries = Array.from(this.cache.entries()).sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.slice(0, Math.floor(this.maxSize / 2));
      toRemove.forEach(([key]) => this.cache.delete(key));
    }
  }
  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate: "n/a"
    };
  }
};
var memoryCache = new MemoryCache();
var CircuitBreaker = class {
  failures = 0;
  lastFailure = 0;
  state = "closed";
  threshold = 5;
  // Número de falhas para abrir
  resetTimeout = 3e4;
  // 30 segundos para tentar novamente
  async execute(operation, fallback) {
    if (this.state === "open") {
      if (Date.now() - this.lastFailure > this.resetTimeout) {
        this.state = "half-open";
      } else {
        console.warn("\u26A1 [Circuit Breaker] Circuito ABERTO - usando fallback");
        if (fallback !== void 0) return fallback;
        throw new Error("Database circuit breaker is open");
      }
    }
    try {
      const result = await operation();
      if (this.state === "half-open") {
        this.state = "closed";
        this.failures = 0;
        console.log("\u2705 [Circuit Breaker] Circuito FECHADO - DB recuperado");
      }
      return result;
    } catch (error) {
      this.failures++;
      this.lastFailure = Date.now();
      if (this.failures >= this.threshold) {
        this.state = "open";
        console.error(`\u{1F534} [Circuit Breaker] Circuito ABERTO ap\xF3s ${this.failures} falhas`);
      }
      if (fallback !== void 0) return fallback;
      throw error;
    }
  }
  isOpen() {
    return this.state === "open";
  }
  getState() {
    return this.state;
  }
};
var dbCircuitBreaker = new CircuitBreaker();
var campaignsStore = /* @__PURE__ */ new Map();
var syncedContactsStore = /* @__PURE__ */ new Map();
function unwrapDbError(error) {
  if (!error || typeof error !== "object") return error;
  return error.cause && typeof error.cause === "object" ? error.cause : error;
}
function getDbErrorCode(error) {
  const directCode = error?.code;
  if (typeof directCode === "string" && directCode.length > 0) return directCode;
  const wrappedCode = error?.cause?.code;
  if (typeof wrappedCode === "string" && wrappedCode.length > 0) return wrappedCode;
  return void 0;
}
function getDbConstraintName(error) {
  const directConstraint = error?.constraint;
  if (typeof directConstraint === "string" && directConstraint.length > 0) return directConstraint;
  const wrappedConstraint = error?.cause?.constraint;
  if (typeof wrappedConstraint === "string" && wrappedConstraint.length > 0) return wrappedConstraint;
  return void 0;
}
function getDbErrorMessage(error) {
  const raw = error?.message || error?.cause?.message || "";
  return typeof raw === "string" ? raw : "";
}
function isPendingAiSkippedConstraintError(error) {
  const normalized = unwrapDbError(error);
  const code = getDbErrorCode(normalized);
  const constraint = getDbConstraintName(normalized)?.toLowerCase() || "";
  const message = getDbErrorMessage(normalized).toLowerCase();
  if (code === "23514") return true;
  if (constraint.includes("pending_ai_responses_status_check")) return true;
  return message.includes("pending_ai_responses_status_check") || message.includes("violates check constraint") && message.includes("pending_ai_responses");
}
var DatabaseStorage = class {
  pendingAiSkippedUnsupported = false;
  // User operations
  async getUser(id) {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async getUserByPhone(phone) {
    const cleanPhone = phone.replace(/\D/g, "");
    const phoneWithPlus = "+" + cleanPhone;
    const [user] = await db.select().from(users).where(
      sql`${users.phone} = ${phoneWithPlus} OR ${users.phone} = ${cleanPhone} OR REPLACE(${users.phone}, '+', '') = ${cleanPhone}`
    );
    return user;
  }
  async getUserByEmail(email) {
    const [user] = await db.select().from(users).where(eq(users.email, email));
    return user;
  }
  async updateUser(id, data) {
    await db.update(users).set(data).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }
  async upsertUser(userData) {
    const [user] = await db.insert(users).values(userData).onConflictDoUpdate({
      target: users.id,
      set: {
        ...userData,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return user;
  }
  // Delete user and all related data (cascade)
  async deleteUser(id) {
    console.log(`[STORAGE] Deleting user ${id} and all related data...`);
    const userConnections = await db.select().from(whatsappConnections).where(eq(whatsappConnections.userId, id));
    for (const connection of userConnections) {
      const userConversations = await db.select().from(conversations).where(eq(conversations.connectionId, connection.id));
      for (const conv of userConversations) {
        await db.delete(messages).where(eq(messages.conversationId, conv.id));
      }
      await db.delete(conversations).where(eq(conversations.connectionId, connection.id));
      await db.delete(whatsappContacts).where(eq(whatsappContacts.connectionId, connection.id));
      await db.delete(whatsappConnections).where(eq(whatsappConnections.id, connection.id));
    }
    await db.delete(aiAgentConfig).where(eq(aiAgentConfig.userId, id));
    await db.delete(businessAgentConfigs).where(eq(businessAgentConfigs.userId, id));
    const subscription = await db.select().from(subscriptions).where(eq(subscriptions.userId, id));
    if (subscription.length > 0) {
      await db.delete(payments).where(eq(payments.subscriptionId, subscription[0].id));
      await db.delete(subscriptions).where(eq(subscriptions.userId, id));
    }
    await db.delete(users).where(eq(users.id, id));
    console.log(`[STORAGE] User ${id} and all related data deleted successfully`);
  }
  // Agent operations
  async getAgents() {
    const agentsList = await db.select().from(agents).orderBy(desc(agents.createdAt));
    return agentsList;
  }
  async getAgent(id) {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id)).limit(1);
    return agent;
  }
  async createAgent(data) {
    const [agent] = await db.insert(agents).values(data).returning();
    return agent;
  }
  async updateAgent(id, data) {
    const [agent] = await db.update(agents).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(agents.id, id)).returning();
    return agent;
  }
  async deleteAgent(id) {
    await db.delete(agents).where(eq(agents.id, id));
  }
  // WhatsApp connection operations
  // FIX: Priorizar conexão primária/conectada em vez de apenas a mais recente
  // Isso evita que conexões secundárias recém-criadas "roubem" a sessão principal
  async getConnectionByUserId(userId, connectionId) {
    const cacheKey = connectionId ? `connByUser:${userId}:${connectionId}` : `connByUser:${userId}`;
    return memoryCache.getOrCompute(cacheKey, async () => {
      if (connectionId) {
        const [specific] = await db.select().from(whatsappConnections).where(and(
          eq(whatsappConnections.id, connectionId),
          eq(whatsappConnections.userId, userId)
        )).limit(1);
        if (specific) return specific;
      }
      const [primaryConnected] = await db.select().from(whatsappConnections).where(and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true),
        eq(whatsappConnections.isPrimary, true)
      )).limit(1);
      if (primaryConnected) return primaryConnected;
      const [connectedConn] = await db.select().from(whatsappConnections).where(and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isConnected, true)
      )).orderBy(whatsappConnections.createdAt).limit(1);
      if (connectedConn) return connectedConn;
      const [primaryConn] = await db.select().from(whatsappConnections).where(and(
        eq(whatsappConnections.userId, userId),
        eq(whatsappConnections.isPrimary, true)
      )).limit(1);
      if (primaryConn) return primaryConn;
      const [anyConn] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.userId, userId)).orderBy(whatsappConnections.createdAt).limit(1);
      return anyConn;
    }, 3e4);
  }
  async getConnectionById(connectionId) {
    const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, connectionId)).limit(1);
    return connection;
  }
  async getAdminConnection() {
    const [connection] = await db.select().from(adminWhatsappConnection).limit(1);
    return connection;
  }
  async getAllConnections() {
    const connections = await withRetry(
      () => db.select().from(whatsappConnections).orderBy(desc(whatsappConnections.createdAt))
    );
    return connections;
  }
  // Retorna UMA conexão por userId (a principal/conectada), para uso em
  // restoreExistingSessions e healthCheck — evita duplicatas e loops
  async getPrimaryConnectionPerUser() {
    const allConnections = await this.getAllConnections();
    const seen = /* @__PURE__ */ new Map();
    for (const conn of allConnections) {
      if (!conn.userId) continue;
      const existing = seen.get(conn.userId);
      if (!existing) {
        seen.set(conn.userId, conn);
      } else {
        if (conn.isConnected && !existing.isConnected) {
          seen.set(conn.userId, conn);
        } else if (!existing.isConnected && !conn.isConnected && conn.isPrimary && !existing.isPrimary) {
          seen.set(conn.userId, conn);
        }
      }
    }
    return Array.from(seen.values());
  }
  async createConnection(connectionData) {
    const [connection] = await db.insert(whatsappConnections).values(connectionData).returning();
    memoryCache.invalidate(`connByUser:${connection.userId}`);
    return connection;
  }
  async updateConnection(id, data) {
    const [connection] = await db.update(whatsappConnections).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(whatsappConnections.id, id)).returning();
    memoryCache.invalidate(`connByUser:${connection.userId}`);
    return connection;
  }
  async deleteConnection(id) {
    const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, id)).limit(1);
    await db.delete(whatsappConnections).where(eq(whatsappConnections.id, id));
    if (connection?.userId) {
      memoryCache.invalidate(`connByUser:${connection.userId}`);
    }
  }
  // Multi-connection: get all connections for a user
  async getConnectionsByUserId(userId) {
    return await db.select().from(whatsappConnections).where(eq(whatsappConnections.userId, userId)).orderBy(desc(whatsappConnections.createdAt));
  }
  // Connection Agents (many-to-many) CRUD
  async getConnectionAgents(connectionId) {
    return await db.select().from(connectionAgents).where(eq(connectionAgents.connectionId, connectionId)).orderBy(desc(connectionAgents.assignedAt));
  }
  async getAgentConnections(agentId) {
    return await db.select().from(connectionAgents).where(eq(connectionAgents.agentId, agentId)).orderBy(desc(connectionAgents.assignedAt));
  }
  async addConnectionAgent(data) {
    const [record] = await db.insert(connectionAgents).values(data).onConflictDoUpdate({
      target: [connectionAgents.connectionId, connectionAgents.agentId],
      set: { isActive: data.isActive ?? true, assignedBy: data.assignedBy }
    }).returning();
    return record;
  }
  async removeConnectionAgent(connectionId, agentId) {
    await db.delete(connectionAgents).where(
      and(
        eq(connectionAgents.connectionId, connectionId),
        eq(connectionAgents.agentId, agentId)
      )
    );
  }
  async updateConnectionAgent(connectionId, agentId, data) {
    const [record] = await db.update(connectionAgents).set(data).where(and(
      eq(connectionAgents.connectionId, connectionId),
      eq(connectionAgents.agentId, agentId)
    )).returning();
    return record;
  }
  // Connection Members CRUD
  async getConnectionMembers(connectionId) {
    return await db.select().from(connectionMembers).where(eq(connectionMembers.connectionId, connectionId)).orderBy(desc(connectionMembers.assignedAt));
  }
  async addConnectionMember(data) {
    const [record] = await db.insert(connectionMembers).values(data).onConflictDoUpdate({
      target: [connectionMembers.connectionId, connectionMembers.memberId],
      set: { canView: data.canView, canRespond: data.canRespond, canManage: data.canManage }
    }).returning();
    return record;
  }
  async removeConnectionMember(connectionId, memberId) {
    await db.delete(connectionMembers).where(
      and(
        eq(connectionMembers.connectionId, connectionId),
        eq(connectionMembers.memberId, memberId)
      )
    );
  }
  async updateConnectionMember(connectionId, memberId, data) {
    const [record] = await db.update(connectionMembers).set(data).where(and(
      eq(connectionMembers.connectionId, connectionId),
      eq(connectionMembers.memberId, memberId)
    )).returning();
    return record;
  }
  // Conversation operations
  async getConversationsByConnectionId(connectionId) {
    return await db.select().from(conversations).where(eq(conversations.connectionId, connectionId)).orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
  }
  // 🔥 OTIMIZADO: Retorna apenas COUNT e SUM ao invés de carregar 20k+ rows
  async getConversationStatsCount(connectionId) {
    const cacheKey = `convStats:${connectionId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached !== null) return cached;
    const result = await db.select({
      total: sql`count(*)::int`,
      unread: sql`coalesce(sum("unread_count"), 0)::int`
    }).from(conversations).where(eq(conversations.connectionId, connectionId));
    const stats = { total: result[0]?.total || 0, unread: result[0]?.unread || 0 };
    memoryCache.set(cacheKey, stats, 3e4);
    return stats;
  }
  async getConversationByContactNumber(connectionId, contactNumber) {
    const [conversation] = await db.select().from(conversations).where(
      and(
        eq(conversations.connectionId, connectionId),
        eq(conversations.contactNumber, contactNumber)
      )
    );
    return conversation;
  }
  // FIX Encerramento: retorna apenas conversas ativas (nao fechadas) pelo numero do contato
  async getActiveConversationByContactNumber(connectionId, contactNumber) {
    const result = await db.select().from(conversations).where(
      and(
        eq(conversations.connectionId, connectionId),
        eq(conversations.contactNumber, contactNumber),
        or(eq(conversations.isClosed, false), isNull(conversations.isClosed))
      )
    ).orderBy(desc(conversations.updatedAt)).limit(1);
    return result[0];
  }
  async getConversation(id) {
    return memoryCache.getOrCompute(`conv:${id}`, async () => {
      const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
      return conversation;
    }, 3e4);
  }
  invalidateConversationListCaches(connectionId) {
    if (!connectionId) return;
    memoryCache.invalidate(`convWithTags:${connectionId}`);
    memoryCache.invalidate(`convCount:${connectionId}`);
    memoryCache.invalidate(`convStats:${connectionId}`);
  }
  async createConversation(conversationData) {
    if (conversationData.connectionId && conversationData.contactNumber) {
      const existing = await this.getActiveConversationByContactNumber(
        conversationData.connectionId,
        conversationData.contactNumber
      );
      if (existing) {
        console.log(`\u26A0\uFE0F [STORAGE] Conversa ativa j\xE1 existe para ${conversationData.contactNumber} (${existing.id}), retornando existente em vez de duplicar`);
        const updated = await this.updateConversation(existing.id, {
          contactName: conversationData.contactName || existing.contactName,
          contactAvatar: conversationData.contactAvatar || existing.contactAvatar,
          lastMessageText: conversationData.lastMessageText || existing.lastMessageText,
          lastMessageTime: conversationData.lastMessageTime || existing.lastMessageTime
        });
        return updated;
      }
    }
    const [conversation] = await db.insert(conversations).values(conversationData).returning();
    this.invalidateConversationListCaches(conversation.connectionId);
    return conversation;
  }
  async updateConversation(id, data) {
    memoryCache.invalidate(`conv:${id}`);
    const [conversation] = await db.update(conversations).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(conversations.id, id)).returning();
    this.invalidateConversationListCaches(conversation.connectionId);
    return conversation;
  }
  async getConversationByShareToken(shareToken) {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.shareToken, shareToken));
    return conversation;
  }
  // Message operations - OTIMIZADO para reduzir egress do Supabase
  // ⚡ CRÍTICO: NÃO retorna media_url para economizar egress massivamente!
  // media_url pode ter 50KB-500KB de base64 por mensagem!
  async getMessagesByConversationId(conversationId) {
    const cacheKey = `messages:${conversationId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached) return cached;
    const result = await db.select({
      id: messages.id,
      conversationId: messages.conversationId,
      messageId: messages.messageId,
      fromMe: messages.fromMe,
      text: messages.text,
      timestamp: messages.timestamp,
      status: messages.status,
      isFromAgent: messages.isFromAgent,
      mediaType: messages.mediaType,
      mediaUrl: messages.mediaUrl,
      // ✅ NECESSÁRIO para mostrar player
      mediaKey: messages.mediaKey,
      directPath: messages.directPath,
      mediaMimeType: messages.mediaMimeType,
      mediaDuration: messages.mediaDuration,
      mediaCaption: messages.mediaCaption,
      createdAt: messages.createdAt
    }).from(messages).where(eq(messages.conversationId, conversationId)).orderBy(messages.timestamp);
    memoryCache.set(cacheKey, result, 6e4);
    return result;
  }
  // Paginação: carrega as N mensagens mais recentes (ou antes de um cursor)
  async getMessagesByConversationIdPaginated(conversationId, limit = 50, before) {
    const fetchLimit = limit + 1;
    const conditions = [eq(messages.conversationId, conversationId)];
    if (before) {
      conditions.push(lt(messages.timestamp, before));
    }
    const result = await db.select({
      id: messages.id,
      conversationId: messages.conversationId,
      messageId: messages.messageId,
      fromMe: messages.fromMe,
      text: messages.text,
      timestamp: messages.timestamp,
      status: messages.status,
      isFromAgent: messages.isFromAgent,
      mediaType: messages.mediaType,
      mediaUrl: messages.mediaUrl,
      mediaKey: messages.mediaKey,
      directPath: messages.directPath,
      mediaMimeType: messages.mediaMimeType,
      mediaDuration: messages.mediaDuration,
      mediaCaption: messages.mediaCaption,
      createdAt: messages.createdAt
    }).from(messages).where(and(...conditions)).orderBy(desc(messages.timestamp)).limit(fetchLimit);
    const hasMore = result.length > limit;
    const page = hasMore ? result.slice(0, limit) : result;
    page.reverse();
    return { messages: page, hasMore };
  }
  // Busca mensagens mais recentes que uma data (para sync incremental)
  async getMessagesByConversationIdAfter(conversationId, after, limit = 500) {
    const result = await db.select({
      id: messages.id,
      conversationId: messages.conversationId,
      messageId: messages.messageId,
      fromMe: messages.fromMe,
      text: messages.text,
      timestamp: messages.timestamp,
      status: messages.status,
      isFromAgent: messages.isFromAgent,
      mediaType: messages.mediaType,
      mediaUrl: messages.mediaUrl,
      mediaKey: messages.mediaKey,
      directPath: messages.directPath,
      mediaMimeType: messages.mediaMimeType,
      mediaDuration: messages.mediaDuration,
      mediaCaption: messages.mediaCaption,
      createdAt: messages.createdAt
    }).from(messages).where(and(
      eq(messages.conversationId, conversationId),
      gt(messages.timestamp, after)
    )).orderBy(messages.timestamp).limit(limit);
    return result;
  }
  // Nova função para buscar media_url de uma mensagem específica (lazy loading)
  async getMessageMedia(messageId) {
    const [result] = await db.select({
      mediaUrl: messages.mediaUrl,
      mediaType: messages.mediaType
    }).from(messages).where(eq(messages.id, messageId)).limit(1);
    return result || null;
  }
  // Atualizar mediaUrl de uma mensagem (usado para re-download de mídia)
  async updateMessageMedia(messageId, newMediaUrl) {
    await db.update(messages).set({ mediaUrl: newMediaUrl }).where(eq(messages.messageId, messageId));
    const [msg] = await db.select({ conversationId: messages.conversationId }).from(messages).where(eq(messages.messageId, messageId)).limit(1);
    if (msg?.conversationId) {
      memoryCache.invalidate(`messages:${msg.conversationId}`);
    }
  }
  // Versão completa com media_url - usar apenas quando REALMENTE necessário
  async getMessagesByConversationIdWithMedia(conversationId, limit = 50) {
    return await db.select().from(messages).where(eq(messages.conversationId, conversationId)).orderBy(desc(messages.timestamp)).limit(limit);
  }
  async updateMessage(id, data) {
    const [message] = await db.update(messages).set(data).where(eq(messages.id, id)).returning();
    if (message?.conversationId) {
      memoryCache.invalidate(`messages:${message.conversationId}`);
    }
    return message;
  }
  async getMessageByMessageId(messageId) {
    const [message] = await db.select().from(messages).where(eq(messages.messageId, messageId)).limit(1);
    return message;
  }
  async deleteMessagesByConversationId(conversationId) {
    memoryCache.invalidate(`messages:${conversationId}`);
    await db.delete(messages).where(eq(messages.conversationId, conversationId));
  }
  async createMessage(messageData) {
    const data = { ...messageData };
    memoryCache.invalidate(`messages:${data.conversationId}`);
    if (data.mediaType === "audio" && data.mediaUrl) {
      try {
        let audioBuffer = null;
        if (data.mediaUrl.startsWith("data:")) {
          const base64Part = data.mediaUrl.split(",")[1];
          if (base64Part) {
            audioBuffer = Buffer.from(base64Part, "base64");
            console.log(`\u{1F3A4} [Storage] \xC1udio base64 detectado: ${audioBuffer.length} bytes`);
          }
        } else if (data.mediaUrl.startsWith("http://") || data.mediaUrl.startsWith("https://")) {
          console.log(`\u{1F3A4} [Storage] Baixando \xE1udio de URL externa para transcri\xE7\xE3o...`);
          try {
            const audioResponse = await fetch(data.mediaUrl);
            if (audioResponse.ok) {
              const arrayBuffer = await audioResponse.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              console.log(`\u{1F3A4} [Storage] \xC1udio baixado da URL: ${audioBuffer.length} bytes`);
            } else {
              console.error(`\u{1F3A4} [Storage] Erro ao baixar \xE1udio: HTTP ${audioResponse.status}`);
            }
          } catch (fetchError) {
            console.error(`\u{1F3A4} [Storage] Erro ao fazer fetch do \xE1udio:`, fetchError);
          }
        }
        if (audioBuffer && audioBuffer.length > 0) {
          let transcriptionModel;
          const [conversation] = await db.select().from(conversations).where(eq(conversations.id, data.conversationId));
          if (conversation) {
            const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.id, conversation.connectionId));
            if (connection?.userId) {
              transcriptionModel = process.env.MISTRAL_TRANSCRIPTION_MODEL || void 0;
            }
          }
          console.log(`\u{1F3A4} [Storage] Iniciando transcri\xE7\xE3o com Mistral...`);
          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: "whatsapp-audio.ogg",
            model: transcriptionModel
          });
          if (transcription && transcription.length > 0) {
            console.log(`\u{1F3A4} [Storage] \u2705 Transcri\xE7\xE3o bem-sucedida: "${transcription.substring(0, 100)}..."`);
            data.text = transcription;
          } else {
            console.log(`\u{1F3A4} [Storage] \u26A0\uFE0F Transcri\xE7\xE3o vazia ou nula`);
          }
        } else {
          console.log(`\u{1F3A4} [Storage] \u26A0\uFE0F N\xE3o foi poss\xEDvel obter buffer do \xE1udio para transcri\xE7\xE3o`);
        }
      } catch (error) {
        console.error("Error transcribing audio message in storage.createMessage:", error);
      }
    }
    if (data.mediaType === "image" && data.mediaUrl && !data.fromMe) {
      try {
        let imageUrl = data.mediaUrl;
        if (imageUrl.startsWith("data:")) {
          console.log(`\u{1F5BC}\uFE0F [Storage] Imagem base64 detectada, enviando direto para an\xE1lise...`);
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          console.log(`\u{1F5BC}\uFE0F [Storage] Imagem URL detectada: ${imageUrl.substring(0, 80)}...`);
        } else {
          console.log(`\u{1F5BC}\uFE0F [Storage] Formato de imagem n\xE3o reconhecido, pulando an\xE1lise`);
          imageUrl = "";
        }
        if (imageUrl) {
          console.log(`\u{1F5BC}\uFE0F [Storage] Iniciando an\xE1lise de imagem com Mistral Vision...`);
          const analysisPrompt = `Analise esta imagem e descreva em portugu\xEAs de forma clara e objetiva.

IMPORTANTE:
- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transfer\xEAncia, boleto)
- Se for um PRODUTO: descreva caracter\xEDsticas visuais, marca se vis\xEDvel
- Se for uma D\xDAVIDA/PERGUNTA: descreva o que a pessoa parece querer saber
- Se for DOCUMENTO: identifique o tipo e informa\xE7\xF5es relevantes

Responda de forma concisa (m\xE1ximo 3 frases) descrevendo o que voc\xEA v\xEA.`;
          const imageDescription = await analyzeImageWithMistral(imageUrl, analysisPrompt);
          if (imageDescription && imageDescription.length > 0) {
            console.log(`\u{1F5BC}\uFE0F [Storage] \u2705 An\xE1lise de imagem bem-sucedida: "${imageDescription.substring(0, 100)}..."`);
            data.text = `[IMAGEM ANALISADA: ${imageDescription}]`;
          } else {
            console.log(`\u{1F5BC}\uFE0F [Storage] \u26A0\uFE0F An\xE1lise de imagem vazia ou nula`);
            data.text = data.text || "(imagem enviada pelo cliente)";
          }
        }
      } catch (error) {
        console.error("Error analyzing image message in storage.createMessage:", error);
        data.text = data.text || "(imagem enviada pelo cliente)";
      }
    }
    const [message] = await db.insert(messages).values(data).returning();
    return message;
  }
  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Reduz drasticamente o Egress do Supabase
  async getTodayMessagesCount(connectionId) {
    const cacheKey = `todayMsgCount:${connectionId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached !== null) return cached;
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const result = await db.select({ count: sql`count(*)::int` }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(
      and(
        eq(conversations.connectionId, connectionId),
        gte(messages.timestamp, today)
      )
    );
    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 6e4);
    return count;
  }
  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  // Antes: trazia TODAS as mensagens do agente (milhares de rows com media_url grande)
  // Agora: retorna apenas 1 número, reduz Egress em ~99%
  async getAgentMessagesCount(connectionId) {
    const cacheKey = `agentMsgCount:${connectionId}`;
    const cached = memoryCache.get(cacheKey);
    if (cached !== null) return cached;
    const result = await db.select({ count: sql`count(*)::int` }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(
      and(
        eq(conversations.connectionId, connectionId),
        eq(messages.isFromAgent, true)
      )
    );
    const count = result[0]?.count || 0;
    memoryCache.set(cacheKey, count, 6e4);
    return count;
  }
  // AI Agent operations
  async getAgentConfig(userId) {
    const [config] = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, userId));
    return config;
  }
  async upsertAgentConfig(userId, data) {
    const [config] = await db.insert(aiAgentConfig).values({ userId, ...data }).onConflictDoUpdate({
      target: aiAgentConfig.userId,
      set: {
        ...data,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return config;
  }
  async updateAgentConfig(userId, data) {
    const [config] = await db.update(aiAgentConfig).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(aiAgentConfig.userId, userId)).returning();
    return config;
  }
  // 🆕 Business Agent Configuration operations (Advanced System)
  async getBusinessAgentConfig(userId) {
    const [config] = await db.select().from(businessAgentConfigs).where(eq(businessAgentConfigs.userId, userId));
    return config;
  }
  async upsertBusinessAgentConfig(userId, data) {
    const [config] = await db.insert(businessAgentConfigs).values({ userId, ...data }).onConflictDoUpdate({
      target: businessAgentConfigs.userId,
      set: {
        ...data,
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    return config;
  }
  async deleteBusinessAgentConfig(userId) {
    await db.delete(businessAgentConfigs).where(eq(businessAgentConfigs.userId, userId));
  }
  /**
   * Verificar se IA está desativada para uma conversa
   * 
   * ⚠️ IMPORTANTE: A IA é controlada APENAS pela tabela agent_disabled_conversations
   * Follow-up é controlado SEPARADAMENTE por conversations.followupActive
   * IA e Follow-up são sistemas INDEPENDENTES!
   * 
   * IA é desativada quando:
   * 1. Existe entrada em agent_disabled_conversations (pausa temporária quando dono responde)
   * 
   * Follow-up é desativado quando:
   * 1. Toggle global em /followup está desativado (followup_configs.is_enabled)
   * 2. Toggle individual na conversa está desativado (conversations.followupActive)
   */
  async isAgentDisabledForConversation(conversationId) {
    const [disabled] = await db.select().from(agentDisabledConversations).where(eq(agentDisabledConversations.conversationId, conversationId));
    return !!disabled;
  }
  async disableAgentForConversation(conversationId, autoReactivateAfterMinutes) {
    await db.insert(agentDisabledConversations).values({
      conversationId,
      ownerLastReplyAt: /* @__PURE__ */ new Date(),
      autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
      clientHasPendingMessage: false,
      clientLastMessageAt: null
    }).onConflictDoUpdate({
      target: agentDisabledConversations.conversationId,
      set: {
        ownerLastReplyAt: /* @__PURE__ */ new Date(),
        autoReactivateAfterMinutes: autoReactivateAfterMinutes ?? null,
        // Reset pending message flag when owner replies again
        clientHasPendingMessage: false
      }
    });
    console.log(`\u{1F916} [STORAGE] IA desativada para conversa ${conversationId} (follow-up permanece no estado atual)`);
  }
  async enableAgentForConversation(conversationId) {
    await db.delete(agentDisabledConversations).where(eq(agentDisabledConversations.conversationId, conversationId));
    console.log(`\u2705 [STORAGE] IA reativada para conversa ${conversationId} (follow-up permanece no estado atual)`);
  }
  async updateDisabledConversationOwnerReply(conversationId, autoReactivateAfterMinutes) {
    const updateData = {
      ownerLastReplyAt: /* @__PURE__ */ new Date(),
      clientHasPendingMessage: false
      // Reset when owner replies again
    };
    if (autoReactivateAfterMinutes !== void 0) {
      updateData.autoReactivateAfterMinutes = autoReactivateAfterMinutes;
    }
    await db.update(agentDisabledConversations).set(updateData).where(eq(agentDisabledConversations.conversationId, conversationId));
  }
  async markClientPendingMessage(conversationId) {
    await db.update(agentDisabledConversations).set({
      clientHasPendingMessage: true,
      clientLastMessageAt: /* @__PURE__ */ new Date()
    }).where(eq(agentDisabledConversations.conversationId, conversationId));
  }
  async getConversationsToAutoReactivate() {
    try {
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(`
        SELECT 
          conversation_id as "conversationId",
          client_last_message_at as "clientLastMessageAt",
          client_has_pending_message as "clientHasPendingMessage"
        FROM agent_disabled_conversations
        WHERE 
          owner_last_reply_at IS NOT NULL
          AND auto_reactivate_after_minutes IS NOT NULL
          AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()
        LIMIT 10
      `);
      return result.rows.map((r) => ({
        conversationId: r.conversationId,
        clientLastMessageAt: r.clientLastMessageAt ? new Date(r.clientLastMessageAt) : null,
        clientHasPendingMessage: r.clientHasPendingMessage === true
      }));
    } catch (error) {
      console.error(`\u274C [STORAGE] Erro em getConversationsToAutoReactivate:`, error);
      return [];
    }
  }
  /**
   * 🔥 OTIMIZAÇÃO: Verifica rapidamente se há conversas para reativar
   * Usa EXISTS que é muito mais leve que SELECT * para verificação
   * 🐛 FIX CRÍTICO: NÃO usar COALESCE! Quando auto_reactivate_after_minutes é NULL,
   * significa "NUNCA reativar automaticamente" - essas conversas NÃO devem ser consideradas!
   */
  async hasConversationsToAutoReactivate() {
    try {
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(`
        SELECT EXISTS (
          SELECT 1 FROM agent_disabled_conversations
          WHERE 
            owner_last_reply_at IS NOT NULL
            AND auto_reactivate_after_minutes IS NOT NULL
            AND owner_last_reply_at + (auto_reactivate_after_minutes * INTERVAL '1 minute') <= NOW()
          LIMIT 1
        ) as has_pending
      `);
      return result.rows[0]?.has_pending === true;
    } catch (error) {
      console.error(`\u274C [STORAGE] Erro em hasConversationsToAutoReactivate:`, error);
      return false;
    }
  }
  /**
   * 🔥 OTIMIZAÇÃO: Conta conversas com timers ativos (para ajuste dinâmico de intervalo)
   * 🐛 FIX: Contar APENAS conversas que têm auto_reactivate_after_minutes configurado
   * Conversas com NULL não devem ser contadas pois nunca serão reativadas automaticamente
   */
  async countActiveAutoReactivateTimers() {
    try {
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(`
        SELECT COUNT(*) as count 
        FROM agent_disabled_conversations
        WHERE auto_reactivate_after_minutes IS NOT NULL
      `);
      return parseInt(result.rows[0]?.count || "0", 10);
    } catch (error) {
      console.error(`\u274C [STORAGE] Erro em countActiveAutoReactivateTimers:`, error);
      return 0;
    }
  }
  async getDisabledConversationDetails(conversationId) {
    const [result] = await db.select({
      ownerLastReplyAt: agentDisabledConversations.ownerLastReplyAt,
      autoReactivateAfterMinutes: agentDisabledConversations.autoReactivateAfterMinutes,
      clientHasPendingMessage: agentDisabledConversations.clientHasPendingMessage
    }).from(agentDisabledConversations).where(eq(agentDisabledConversations.conversationId, conversationId));
    if (!result) return null;
    return {
      ownerLastReplyAt: result.ownerLastReplyAt,
      autoReactivateAfterMinutes: result.autoReactivateAfterMinutes,
      clientHasPendingMessage: result.clientHasPendingMessage ?? false
    };
  }
  // Plan operations
  async getAllPlans() {
    return await withRetry(() => db.select().from(plans).orderBy(plans.ordem));
  }
  async getActivePlans() {
    return await db.select().from(plans).where(eq(plans.ativo, true)).orderBy(plans.ordem);
  }
  async getPlan(id) {
    const [plan] = await db.select().from(plans).where(eq(plans.id, id));
    return plan;
  }
  async getPlanBySlug(slug) {
    try {
      const [plan] = await db.select().from(plans).where(eq(plans.linkSlug, slug));
      return plan;
    } catch (error) {
      console.error("Error in getPlanBySlug:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(
        "SELECT * FROM plans WHERE link_slug = $1",
        [slug]
      );
      if (result.rows.length === 0) return void 0;
      const row = result.rows[0];
      return {
        id: row.id,
        nome: row.nome,
        valor: row.valor,
        tipo: row.tipo,
        features: row.features,
        ativo: row.ativo,
        ordem: row.ordem,
        codigoPersonalizado: row.codigo_personalizado,
        valorPrimeiraCobranca: row.valor_primeira_cobranca,
        linkSlug: row.link_slug,
        createdAt: row.created_at,
        updatedAt: row.updated_at
      };
    }
  }
  async createPlan(planData) {
    const [plan] = await db.insert(plans).values(planData).returning();
    return plan;
  }
  async updatePlan(id, data) {
    const [plan] = await db.update(plans).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(plans.id, id)).returning();
    return plan;
  }
  async deletePlan(id) {
    await db.delete(plans).where(eq(plans.id, id));
  }
  // Coupon operations
  async getCouponByCode(code) {
    try {
      const [coupon] = await db.select().from(coupons).where(eq(coupons.code, code.toUpperCase()));
      return coupon;
    } catch (error) {
      console.error("Error in getCouponByCode with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(
        "SELECT * FROM coupons WHERE UPPER(code) = $1",
        [code.toUpperCase()]
      );
      if (result.rows.length === 0) return void 0;
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
      };
    }
  }
  async getAllCoupons() {
    try {
      return await db.select().from(coupons).orderBy(desc(coupons.createdAt));
    } catch (error) {
      console.error("Error in getAllCoupons with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query("SELECT * FROM coupons ORDER BY created_at DESC");
      return result.rows.map((row) => ({
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
      }));
    }
  }
  async createCoupon(couponData) {
    try {
      const [coupon] = await db.insert(coupons).values({
        ...couponData,
        code: couponData.code.toUpperCase()
      }).returning();
      return coupon;
    } catch (error) {
      console.error("Error in createCoupon with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const result = await pool2.query(`
        INSERT INTO coupons (code, discount_type, discount_value, final_price, is_active, max_uses, current_uses, applicable_plans, valid_until)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING *
      `, [
        couponData.code.toUpperCase(),
        couponData.discountType || "fixed_price",
        couponData.discountValue || "0",
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
      };
    }
  }
  async updateCoupon(id, data) {
    try {
      const updateData = { ...data, updatedAt: /* @__PURE__ */ new Date() };
      if (data.code) {
        updateData.code = data.code.toUpperCase();
      }
      const [coupon] = await db.update(coupons).set(updateData).where(eq(coupons.id, id)).returning();
      return coupon;
    } catch (error) {
      console.error("Error in updateCoupon with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      const setClauses = [];
      const values = [];
      let paramIndex = 1;
      if (data.code !== void 0) {
        setClauses.push(`code = $${paramIndex++}`);
        values.push(data.code.toUpperCase());
      }
      if (data.finalPrice !== void 0) {
        setClauses.push(`final_price = $${paramIndex++}`);
        values.push(data.finalPrice);
      }
      if (data.isActive !== void 0) {
        setClauses.push(`is_active = $${paramIndex++}`);
        values.push(data.isActive);
      }
      if (data.maxUses !== void 0) {
        setClauses.push(`max_uses = $${paramIndex++}`);
        values.push(data.maxUses);
      }
      if (data.validUntil !== void 0) {
        setClauses.push(`valid_until = $${paramIndex++}`);
        values.push(data.validUntil);
      }
      if (data.applicablePlans !== void 0) {
        setClauses.push(`applicable_plans = $${paramIndex++}`);
        values.push(data.applicablePlans ? JSON.stringify(data.applicablePlans) : null);
      }
      setClauses.push(`updated_at = $${paramIndex++}`);
      values.push(/* @__PURE__ */ new Date());
      values.push(id);
      const result = await pool2.query(`
        UPDATE coupons SET ${setClauses.join(", ")} WHERE id = $${paramIndex}
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
      };
    }
  }
  async deleteCoupon(id) {
    try {
      await db.delete(coupons).where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in deleteCoupon with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      await pool2.query("DELETE FROM coupons WHERE id = $1", [id]);
    }
  }
  async incrementCouponUsage(id) {
    try {
      await db.update(coupons).set({ currentUses: sql`${coupons.currentUses} + 1`, updatedAt: /* @__PURE__ */ new Date() }).where(eq(coupons.id, id));
    } catch (error) {
      console.error("Error in incrementCouponUsage with Drizzle, trying raw query:", error);
      const { pool: pool2 } = await import("./db-REUKERK3.js");
      await pool2.query("UPDATE coupons SET current_uses = current_uses + 1, updated_at = NOW() WHERE id = $1", [id]);
    }
  }
  // Subscription operations
  async getSubscription(id) {
    const result = await db.select().from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).where(eq(subscriptions.id, id)).limit(1);
    if (result.length === 0) return void 0;
    return {
      ...result[0].subscriptions,
      plan: result[0].plans
    };
  }
  async getUserSubscription(userId) {
    const activeResult = await db.select().from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).where(and(
      eq(subscriptions.userId, userId),
      eq(subscriptions.status, "active")
    )).orderBy(desc(subscriptions.createdAt)).limit(1);
    if (activeResult.length > 0) {
      return {
        ...activeResult[0].subscriptions,
        plan: activeResult[0].plans
      };
    }
    const result = await db.select().from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).where(eq(subscriptions.userId, userId)).orderBy(desc(subscriptions.createdAt)).limit(1);
    if (result.length === 0) return void 0;
    return {
      ...result[0].subscriptions,
      plan: result[0].plans
    };
  }
  async getAllSubscriptions() {
    const result = await withRetry(
      () => db.select().from(subscriptions).innerJoin(plans, eq(subscriptions.planId, plans.id)).innerJoin(users, eq(subscriptions.userId, users.id)).orderBy(desc(subscriptions.createdAt))
    );
    return result.map((row) => ({
      ...row.subscriptions,
      plan: row.plans,
      user: row.users
    }));
  }
  async createSubscription(subscriptionData) {
    const [subscription] = await db.insert(subscriptions).values(subscriptionData).returning();
    return subscription;
  }
  async updateSubscription(id, data) {
    const [subscription] = await db.update(subscriptions).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(subscriptions.id, id)).returning();
    return subscription;
  }
  // Payment operations
  async getPayment(id) {
    const [payment] = await db.select().from(payments).where(eq(payments.id, id));
    return payment;
  }
  async getPaymentBySubscriptionId(subscriptionId) {
    const [payment] = await db.select().from(payments).where(eq(payments.subscriptionId, subscriptionId)).orderBy(desc(payments.createdAt)).limit(1);
    return payment;
  }
  async getPendingPayments() {
    const result = await db.select().from(payments).innerJoin(subscriptions, eq(payments.subscriptionId, subscriptions.id)).innerJoin(plans, eq(subscriptions.planId, plans.id)).innerJoin(users, eq(subscriptions.userId, users.id)).where(eq(payments.status, "pending")).orderBy(desc(payments.createdAt));
    return result.map((row) => ({
      ...row.payments,
      subscription: {
        ...row.subscriptions,
        user: row.users,
        plan: row.plans
      }
    }));
  }
  async createPayment(paymentData) {
    const [payment] = await db.insert(payments).values(paymentData).returning();
    return payment;
  }
  async updatePayment(id, data) {
    const [payment] = await db.update(payments).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(payments.id, id)).returning();
    return payment;
  }
  // Payment History operations (MercadoPago, etc)
  async createPaymentHistory(paymentData) {
    const [payment] = await db.insert(paymentHistory).values(paymentData).returning();
    return payment;
  }
  async getPaymentHistory(id) {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.id, id));
    return payment;
  }
  async getPaymentHistoryByMpPaymentId(mpPaymentId) {
    const [payment] = await db.select().from(paymentHistory).where(eq(paymentHistory.mpPaymentId, mpPaymentId));
    return payment;
  }
  async getPaymentHistoryBySubscription(subscriptionId) {
    return await db.select().from(paymentHistory).where(eq(paymentHistory.subscriptionId, subscriptionId)).orderBy(desc(paymentHistory.createdAt));
  }
  async getPaymentHistoryByUser(userId) {
    return await db.select().from(paymentHistory).where(eq(paymentHistory.userId, userId)).orderBy(desc(paymentHistory.createdAt));
  }
  async getAllPaymentHistory() {
    const result = await db.select().from(paymentHistory).leftJoin(subscriptions, eq(paymentHistory.subscriptionId, subscriptions.id)).leftJoin(users, eq(paymentHistory.userId, users.id)).orderBy(desc(paymentHistory.createdAt));
    return result.map((row) => ({
      ...row.payment_history,
      subscription: row.subscriptions || void 0,
      user: row.users || void 0
    }));
  }
  async updatePaymentHistory(id, data) {
    const [payment] = await db.update(paymentHistory).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(paymentHistory.id, id)).returning();
    return payment;
  }
  // System config operations
  async getSystemConfig(key) {
    const [config] = await db.select().from(systemConfig).where(eq(systemConfig.chave, key));
    return config;
  }
  async getSystemConfigs(keys) {
    const configs = await db.select().from(systemConfig).where(inArray(systemConfig.chave, keys));
    const result = /* @__PURE__ */ new Map();
    for (const config of configs) {
      if (config.valor !== null) {
        result.set(config.chave, config.valor);
      }
    }
    return result;
  }
  async updateSystemConfig(key, value) {
    const [config] = await db.insert(systemConfig).values({ chave: key, valor: value }).onConflictDoUpdate({
      target: systemConfig.chave,
      set: { valor: value, updatedAt: /* @__PURE__ */ new Date() }
    }).returning();
    return config;
  }
  // Admin operations
  async getAdminByEmail(email) {
    const [admin] = await db.select().from(admins).where(eq(admins.email, email));
    return admin;
  }
  async getAllAdmins() {
    return await withRetry(() => db.select().from(admins));
  }
  // Admin WhatsApp connection operations
  async getAdminWhatsappConnection(adminId) {
    const [connection] = await db.select().from(adminWhatsappConnection).where(eq(adminWhatsappConnection.adminId, adminId));
    return connection;
  }
  async createAdminWhatsappConnection(connection) {
    const [created] = await db.insert(adminWhatsappConnection).values(connection).returning();
    return created;
  }
  async updateAdminWhatsappConnection(adminId, data) {
    const [updated] = await db.update(adminWhatsappConnection).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(adminWhatsappConnection.adminId, adminId)).returning();
    return updated;
  }
  // Admin stats
  async getAllUsers() {
    return await withRetry(() => db.select().from(users).orderBy(desc(users.createdAt)));
  }
  async getTotalRevenue() {
    const result = await db.select({ total: sql`COALESCE(SUM(CAST(${payments.valor} AS NUMERIC)), 0)` }).from(payments).where(eq(payments.status, "paid"));
    return Number(result[0]?.total || 0);
  }
  // 🔥 OTIMIZADO: Usar COUNT(*) em vez de trazer todas as linhas
  async getActiveSubscriptionsCount() {
    const result = await db.select({ count: sql`count(*)::int` }).from(subscriptions).where(eq(subscriptions.status, "active"));
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
  async upsertContact(contact) {
    const [upserted] = await db.insert(whatsappContacts).values({
      ...contact,
      lastSyncedAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).onConflictDoUpdate({
      target: [whatsappContacts.connectionId, whatsappContacts.contactId],
      set: {
        lid: contact.lid,
        phoneNumber: contact.phoneNumber,
        name: contact.name,
        imgUrl: contact.imgUrl,
        lastSyncedAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date()
      }
    }).returning();
    console.log(`[DB] Upserted contact: ${contact.contactId}${contact.phoneNumber ? ` (phoneNumber: ${contact.phoneNumber})` : ""}`);
    return upserted;
  }
  /**
   * Batch upsert multiple contacts at once (more efficient than individual inserts)
   * Used during initial sync when Baileys emits many contacts.upsert events
   */
  async batchUpsertContacts(contacts) {
    if (contacts.length === 0) return;
    const now = /* @__PURE__ */ new Date();
    const contactsWithTimestamps = contacts.map((c) => ({
      ...c,
      lastSyncedAt: now,
      updatedAt: now
    }));
    const CHUNK_SIZE = 200;
    for (let i = 0; i < contactsWithTimestamps.length; i += CHUNK_SIZE) {
      const chunk = contactsWithTimestamps.slice(i, i + CHUNK_SIZE);
      await db.insert(whatsappContacts).values(chunk).onConflictDoUpdate({
        target: [whatsappContacts.connectionId, whatsappContacts.contactId],
        set: {
          lid: sql`EXCLUDED.lid`,
          phoneNumber: sql`EXCLUDED.phone_number`,
          name: sql`EXCLUDED.name`,
          imgUrl: sql`EXCLUDED.img_url`,
          lastSyncedAt: now,
          updatedAt: now
        }
      });
    }
    console.log(`[DB] Batch upserted ${contacts.length} contacts`);
  }
  /**
   * Get contact by LID (primary use case for @lid resolution)
   * Query: SELECT * FROM whatsapp_contacts WHERE lid = ? AND connection_id = ?
   */
  async getContactByLid(lid, connectionId) {
    const [contact] = await db.select().from(whatsappContacts).where(and(
      eq(whatsappContacts.lid, lid),
      eq(whatsappContacts.connectionId, connectionId)
    )).limit(1);
    if (contact) {
      console.log(`[DB] Contact found by LID: ${lid} \u2192 ${contact.phoneNumber || "no phone"}`);
    }
    return contact;
  }
  /**
   * Get contact by contactId (general lookup)
   * Query: SELECT * FROM whatsapp_contacts WHERE contact_id = ? AND connection_id = ?
   */
  async getContactById(contactId, connectionId) {
    const [contact] = await db.select().from(whatsappContacts).where(and(
      eq(whatsappContacts.contactId, contactId),
      eq(whatsappContacts.connectionId, connectionId)
    )).limit(1);
    return contact;
  }
  /**
   * Get all contacts for a specific connection (cache warming)
   * Used when restoring session to pre-populate in-memory cache
   */
  async getContactsByConnectionId(connectionId) {
    const contacts = await db.select().from(whatsappContacts).where(eq(whatsappContacts.connectionId, connectionId)).orderBy(desc(whatsappContacts.lastSyncedAt));
    console.log(`[DB] Loaded ${contacts.length} contacts for connection ${connectionId}`);
    return contacts;
  }
  /**
   * Delete contacts from inactive connections (data retention policy)
   * Should be run periodically (e.g., daily cron job)
   * Query: DELETE FROM whatsapp_contacts WHERE connection_id IN (...)
   */
  async deleteOldContacts(daysOld = 90) {
    const cutoffDate = /* @__PURE__ */ new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);
    const inactiveConnections = await db.select({ id: whatsappConnections.id }).from(whatsappConnections).where(and(
      eq(whatsappConnections.isConnected, false),
      sql`${whatsappConnections.updatedAt} < ${cutoffDate}`
    ));
    if (inactiveConnections.length === 0) {
      console.log(`[DB] No inactive connections older than ${daysOld} days`);
      return 0;
    }
    const connectionIds = inactiveConnections.map((c) => c.id);
    const deleted = await db.delete(whatsappContacts).where(sql`${whatsappContacts.connectionId} = ANY(${connectionIds})`);
    console.log(`[DB] Deleted contacts from ${connectionIds.length} inactive connections (${daysOld}+ days old)`);
    return deleted.rowCount || 0;
  }
  // ==================== CAMPAIGN OPERATIONS (In-Memory) ====================
  async getCampaigns(userId) {
    return campaignsStore.get(userId) || [];
  }
  async getCampaign(userId, id) {
    const campaigns = campaignsStore.get(userId) || [];
    return campaigns.find((c) => c.id === id);
  }
  async createCampaign(campaign) {
    const userId = campaign.userId;
    const campaigns = campaignsStore.get(userId) || [];
    const newCampaign = {
      ...campaign,
      id: campaign.id || `campaign_${Date.now()}`,
      // ✅ Usar ID fornecido ou gerar novo
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    };
    campaigns.push(newCampaign);
    campaignsStore.set(userId, campaigns);
    return newCampaign;
  }
  async updateCampaign(userId, id, data) {
    const campaigns = campaignsStore.get(userId) || [];
    const index = campaigns.findIndex((c) => c.id === id);
    if (index !== -1) {
      campaigns[index] = { ...campaigns[index], ...data, updatedAt: /* @__PURE__ */ new Date() };
      campaignsStore.set(userId, campaigns);
      return campaigns[index];
    }
    return null;
  }
  async deleteCampaign(userId, id) {
    const campaigns = campaignsStore.get(userId) || [];
    const filtered = campaigns.filter((c) => c.id !== id);
    campaignsStore.set(userId, filtered);
  }
  // ==================== CONTACT LIST OPERATIONS (Supabase/PostgreSQL) ====================
  async getContactLists(userId) {
    try {
      const result = await db.select().from(contactLists).where(eq(contactLists.userId, userId)).orderBy(desc(contactLists.createdAt));
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error fetching lists:", error);
      return [];
    }
  }
  async getContactList(userId, id) {
    try {
      const [result] = await db.select().from(contactLists).where(and(
        eq(contactLists.userId, userId),
        eq(contactLists.id, id)
      )).limit(1);
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error fetching list:", error);
      return void 0;
    }
  }
  async createContactList(list) {
    try {
      const contactsArray = list.contacts || [];
      const [result] = await db.insert(contactLists).values({
        userId: list.userId,
        name: list.name,
        description: list.description || null,
        contacts: contactsArray,
        contactCount: contactsArray.length
      }).returning();
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error creating list:", error);
      throw error;
    }
  }
  async updateContactList(userId, id, data) {
    try {
      const updateData = {
        updatedAt: /* @__PURE__ */ new Date()
      };
      if (data.name !== void 0) updateData.name = data.name;
      if (data.description !== void 0) updateData.description = data.description;
      if (data.contacts !== void 0) {
        updateData.contacts = data.contacts;
        updateData.contactCount = data.contacts.length;
      }
      const [result] = await db.update(contactLists).set(updateData).where(and(
        eq(contactLists.userId, userId),
        eq(contactLists.id, id)
      )).returning();
      return result;
    } catch (error) {
      console.error("[CONTACT_LISTS] Error updating list:", error);
      return null;
    }
  }
  async deleteContactList(userId, id) {
    try {
      await db.delete(contactLists).where(and(
        eq(contactLists.userId, userId),
        eq(contactLists.id, id)
      ));
    } catch (error) {
      console.error("[CONTACT_LISTS] Error deleting list:", error);
    }
  }
  async addContactsToList(userId, listId, contacts) {
    try {
      const [list] = await db.select().from(contactLists).where(and(
        eq(contactLists.userId, userId),
        eq(contactLists.id, listId)
      )).limit(1);
      if (!list) {
        return { success: false, message: "Lista n\xE3o encontrada" };
      }
      const existingContacts = list.contacts || [];
      const existingPhones = new Set(existingContacts.map((c) => c.phone));
      const newContacts = contacts.filter((c) => !existingPhones.has(c.phone));
      const mergedContacts = [...existingContacts, ...newContacts];
      const [result] = await db.update(contactLists).set({
        contacts: mergedContacts,
        contactCount: mergedContacts.length,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(contactLists.id, listId)).returning();
      return {
        success: true,
        totalContacts: mergedContacts.length,
        addedCount: newContacts.length
      };
    } catch (error) {
      console.error("[CONTACT_LISTS] Error adding contacts:", error);
      return { success: false };
    }
  }
  async removeContactFromList(userId, listId, phone) {
    try {
      const [list] = await db.select().from(contactLists).where(and(
        eq(contactLists.userId, userId),
        eq(contactLists.id, listId)
      )).limit(1);
      if (!list) {
        return { success: false, message: "Lista n\xE3o encontrada" };
      }
      const existingContacts = list.contacts || [];
      const filteredContacts = existingContacts.filter((c) => c.phone !== phone);
      const [result] = await db.update(contactLists).set({
        contacts: filteredContacts,
        contactCount: filteredContacts.length,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(contactLists.id, listId)).returning();
      return { success: true, totalContacts: filteredContacts.length };
    } catch (error) {
      console.error("[CONTACT_LISTS] Error removing contact:", error);
      return { success: false };
    }
  }
  async getSyncedContacts(userId) {
    return syncedContactsStore.get(userId) || [];
  }
  async saveSyncedContacts(userId, contacts) {
    const existing = syncedContactsStore.get(userId) || [];
    const merged = [...existing];
    for (const contact of contacts) {
      const existingIndex = merged.findIndex((c) => c.phone === contact.phone);
      if (existingIndex === -1) {
        merged.push(contact);
      } else {
        merged[existingIndex] = { ...merged[existingIndex], ...contact };
      }
    }
    syncedContactsStore.set(userId, merged);
  }
  async getUserActiveConnection(userId) {
    const [connection] = await db.select().from(whatsappConnections).where(and(
      eq(whatsappConnections.userId, userId),
      eq(whatsappConnections.isConnected, true)
    )).orderBy(desc(whatsappConnections.createdAt)).limit(1);
    return connection;
  }
  // ========================================================================
  // ADMIN CONVERSATIONS - Conversas do WhatsApp do admin com clientes
  // ========================================================================
  async getAdminConversations(adminId) {
    const result = await db.select().from(adminConversations).where(eq(adminConversations.adminId, adminId)).orderBy(desc(adminConversations.lastMessageTime));
    return result;
  }
  async getAdminConversation(id) {
    const [result] = await db.select().from(adminConversations).where(eq(adminConversations.id, id));
    return result;
  }
  // Busca conversa do admin pelo número de telefone (sistema single-admin)
  async getAdminConversationByPhone(contactNumber) {
    const [result] = await db.select().from(adminConversations).where(eq(adminConversations.contactNumber, contactNumber));
    return result;
  }
  async getAdminConversationByContact(adminId, contactNumber) {
    const [result] = await db.select().from(adminConversations).where(and(
      eq(adminConversations.adminId, adminId),
      eq(adminConversations.contactNumber, contactNumber)
    ));
    return result;
  }
  async createAdminConversation(data) {
    const [result] = await db.insert(adminConversations).values({
      adminId: data.adminId,
      contactNumber: data.contactNumber,
      remoteJid: data.remoteJid,
      contactName: data.contactName,
      contactAvatar: data.contactAvatar,
      isAgentEnabled: data.isAgentEnabled ?? true,
      unreadCount: 0
    }).returning();
    return result;
  }
  async updateAdminConversation(id, data) {
    const [result] = await db.update(adminConversations).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(adminConversations.id, id)).returning();
    return result;
  }
  async getOrCreateAdminConversation(adminId, contactNumber, remoteJid, contactName, contactAvatar) {
    let conversation = await this.getAdminConversationByContact(adminId, contactNumber);
    if (!conversation) {
      conversation = await this.createAdminConversation({
        adminId,
        contactNumber,
        remoteJid,
        contactName,
        contactAvatar
      });
    } else if (contactName || contactAvatar) {
      const updates = {};
      if (contactName && conversation.contactName !== contactName) updates.contactName = contactName;
      if (contactAvatar && conversation.contactAvatar !== contactAvatar) updates.contactAvatar = contactAvatar;
      if (Object.keys(updates).length > 0) {
        conversation = await this.updateAdminConversation(conversation.id, updates);
      }
    }
    return conversation;
  }
  // Admin Messages
  async getAdminMessages(conversationId) {
    const result = await db.select().from(adminMessages).where(eq(adminMessages.conversationId, conversationId)).orderBy(adminMessages.timestamp);
    return result;
  }
  async createAdminMessage(data) {
    const messageData = { ...data };
    if (messageData.mediaType === "audio" && messageData.mediaUrl) {
      try {
        let audioBuffer = null;
        const origem = messageData.fromMe ? "dono" : "cliente";
        if (messageData.mediaUrl.startsWith("data:")) {
          const base64Part = messageData.mediaUrl.split(",")[1];
          if (base64Part) {
            audioBuffer = Buffer.from(base64Part, "base64");
            console.log(`\u{1F3A4} [Storage Admin] \xC1udio base64 do ${origem}: ${audioBuffer.length} bytes`);
          }
        } else if (messageData.mediaUrl.startsWith("http://") || messageData.mediaUrl.startsWith("https://")) {
          console.log(`\u{1F3A4} [Storage Admin] Baixando \xE1udio do ${origem} de URL externa...`);
          try {
            const audioResponse = await fetch(messageData.mediaUrl);
            if (audioResponse.ok) {
              const arrayBuffer = await audioResponse.arrayBuffer();
              audioBuffer = Buffer.from(arrayBuffer);
              console.log(`\u{1F3A4} [Storage Admin] \xC1udio do ${origem} baixado: ${audioBuffer.length} bytes`);
            } else {
              console.error(`\u{1F3A4} [Storage Admin] Erro ao baixar \xE1udio: HTTP ${audioResponse.status}`);
            }
          } catch (fetchError) {
            console.error(`\u{1F3A4} [Storage Admin] Erro ao fazer fetch do \xE1udio:`, fetchError);
          }
        }
        if (audioBuffer && audioBuffer.length > 0) {
          console.log(`\u{1F3A4} [Storage Admin] Transcrevendo \xE1udio do ${origem} (${audioBuffer.length} bytes)...`);
          const transcription = await transcribeAudioWithMistral(audioBuffer, {
            fileName: `whatsapp-audio-${origem}.ogg`
          });
          if (transcription && transcription.length > 0) {
            console.log(`\u{1F3A4} [Storage Admin] \u2705 Transcri\xE7\xE3o do ${origem}: ${transcription.substring(0, 100)}...`);
            messageData.text = transcription;
          } else {
            console.log(`\u{1F3A4} [Storage Admin] \u26A0\uFE0F Transcri\xE7\xE3o vazia para \xE1udio do ${origem}`);
          }
        } else {
          console.log(`\u{1F3A4} [Storage Admin] \u26A0\uFE0F N\xE3o foi poss\xEDvel obter buffer do \xE1udio do ${origem}`);
        }
      } catch (error) {
        console.error("[Storage Admin] Erro ao transcrever \xE1udio:", error);
      }
    }
    if (messageData.mediaType === "image" && messageData.mediaUrl) {
      try {
        let imageUrl = messageData.mediaUrl;
        if (imageUrl.startsWith("data:")) {
          console.log(`\u{1F5BC}\uFE0F [Storage Admin] Imagem base64 detectada, enviando direto para an\xE1lise...`);
        } else if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
          console.log(`\u{1F5BC}\uFE0F [Storage Admin] Imagem URL detectada: ${imageUrl.substring(0, 80)}...`);
        } else {
          console.log(`\u{1F5BC}\uFE0F [Storage Admin] Formato de imagem n\xE3o reconhecido, pulando an\xE1lise`);
          imageUrl = "";
        }
        if (imageUrl) {
          console.log(`\u{1F5BC}\uFE0F [Storage Admin] Iniciando an\xE1lise de imagem com Mistral Vision...`);
          const analysisPrompt = `Analise esta imagem e descreva em portugu\xEAs de forma clara e objetiva.

IMPORTANTE:
- Se for um COMPROVANTE DE PAGAMENTO: extraia valor, data, nome do pagador/recebedor, tipo (PIX, transfer\xEAncia, boleto)
- Se for um PRODUTO: descreva caracter\xEDsticas visuais, marca se vis\xEDvel
- Se for uma D\xDAVIDA/PERGUNTA: descreva o que a pessoa parece querer saber
- Se for DOCUMENTO: identifique o tipo e informa\xE7\xF5es relevantes

Responda de forma concisa (m\xE1ximo 3 frases) descrevendo o que voc\xEA v\xEA.`;
          const imageDescription = await analyzeImageWithMistral(imageUrl, analysisPrompt);
          if (imageDescription && imageDescription.length > 0) {
            console.log(`\u{1F5BC}\uFE0F [Storage Admin] \u2705 An\xE1lise de imagem bem-sucedida: "${imageDescription.substring(0, 100)}..."`);
            messageData.text = `[IMAGEM ANALISADA: ${imageDescription}]`;
          } else {
            console.log(`\u{1F5BC}\uFE0F [Storage Admin] \u26A0\uFE0F An\xE1lise de imagem vazia ou nula`);
            messageData.text = messageData.text || "(imagem enviada pelo cliente)";
          }
        }
      } catch (error) {
        console.error("[Storage Admin] Erro ao analisar imagem:", error);
        messageData.text = messageData.text || "(imagem enviada pelo cliente)";
      }
    }
    const [result] = await db.insert(adminMessages).values({
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
      mediaCaption: messageData.mediaCaption
    }).returning();
    return result;
  }
  async toggleAdminConversationAgent(conversationId, enabled) {
    const [result] = await db.update(adminConversations).set({ isAgentEnabled: enabled, updatedAt: /* @__PURE__ */ new Date() }).where(eq(adminConversations.id, conversationId)).returning();
    return result;
  }
  async clearAdminConversationMessages(conversationId) {
    const result = await db.delete(adminMessages).where(eq(adminMessages.conversationId, conversationId));
    await db.update(adminConversations).set({
      lastMessageText: null,
      lastMessageTime: null,
      unreadCount: 0,
      isAgentEnabled: true,
      followupActive: true,
      followupStage: 0,
      nextFollowupAt: null,
      paymentStatus: "pending",
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(adminConversations.id, conversationId));
    console.log(`\u{1F5D1}\uFE0F [STORAGE] Mensagens da conversa ${conversationId} limpas`);
    return result.rowCount || 0;
  }
  async isAdminAgentEnabledForConversation(conversationId) {
    const [conversation] = await db.select({ isAgentEnabled: adminConversations.isAgentEnabled }).from(adminConversations).where(eq(adminConversations.id, conversationId));
    return conversation?.isAgentEnabled ?? true;
  }
  // =============================================================================
  // ADMIN AGENT MEDIA - Persistência de mídias do admin agent
  // =============================================================================
  async getAllAdminMedia(adminId) {
    return await db.select().from(adminAgentMedia).where(eq(adminAgentMedia.adminId, adminId)).orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }
  async getActiveAdminMedia(adminId) {
    return await db.select().from(adminAgentMedia).where(eq(adminAgentMedia.isActive, true)).orderBy(desc(adminAgentMedia.displayOrder), desc(adminAgentMedia.createdAt));
  }
  async getAdminMediaById(id) {
    const [result] = await db.select().from(adminAgentMedia).where(eq(adminAgentMedia.id, id));
    return result;
  }
  async getAdminMediaByName(adminId, name) {
    const normalizedName = name.toUpperCase().replace(/\s+/g, "_");
    const [result] = await db.select().from(adminAgentMedia).where(and(
      eq(adminAgentMedia.name, normalizedName),
      eq(adminAgentMedia.isActive, true)
    ));
    return result;
  }
  async createAdminMedia(mediaData) {
    const [result] = await db.insert(adminAgentMedia).values({
      ...mediaData,
      name: mediaData.name.toUpperCase().replace(/\s+/g, "_")
      // Normalizar nome
    }).returning();
    return result;
  }
  async updateAdminMedia(id, mediaData) {
    const [result] = await db.update(adminAgentMedia).set({
      ...mediaData,
      name: mediaData.name ? mediaData.name.toUpperCase().replace(/\s+/g, "_") : void 0,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(adminAgentMedia.id, id)).returning();
    return result;
  }
  async deleteAdminMedia(id) {
    const result = await db.delete(adminAgentMedia).where(eq(adminAgentMedia.id, id));
    return result.rowCount > 0;
  }
  async toggleAdminMediaActive(id, isActive) {
    const [result] = await db.update(adminAgentMedia).set({ isActive, updatedAt: /* @__PURE__ */ new Date() }).where(eq(adminAgentMedia.id, id)).returning();
    return result;
  }
  // =============================================================================
  // MEDIA FLOWS - Sequencia de midias por agente
  // =============================================================================
  async getMediaFlows() {
    return await db.select().from(mediaFlows).orderBy(desc(mediaFlows.createdAt));
  }
  async getMediaFlow(id) {
    const [result] = await db.select().from(mediaFlows).where(eq(mediaFlows.id, id));
    return result;
  }
  async createMediaFlow(data) {
    const [result] = await db.insert(mediaFlows).values(data).returning();
    return result;
  }
  async updateMediaFlow(id, data) {
    const [result] = await db.update(mediaFlows).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(mediaFlows.id, id)).returning();
    return result;
  }
  async deleteMediaFlow(id) {
    await db.delete(mediaFlows).where(eq(mediaFlows.id, id));
  }
  async getMediaFlowItems(flowId) {
    return await db.select().from(mediaFlowItems).where(eq(mediaFlowItems.flowId, flowId)).orderBy(asc(mediaFlowItems.displayOrder), asc(mediaFlowItems.createdAt));
  }
  async createMediaFlowItem(data) {
    const [result] = await db.insert(mediaFlowItems).values(data).returning();
    return result;
  }
  async updateMediaFlowItem(id, data) {
    const [result] = await db.update(mediaFlowItems).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(mediaFlowItems.id, id)).returning();
    return result;
  }
  async deleteMediaFlowItem(id) {
    await db.delete(mediaFlowItems).where(eq(mediaFlowItems.id, id));
  }
  async reorderMediaFlowItems(flowId, orderedIds) {
    for (let index = 0; index < orderedIds.length; index++) {
      await db.update(mediaFlowItems).set({ displayOrder: index, updatedAt: /* @__PURE__ */ new Date() }).where(and(eq(mediaFlowItems.flowId, flowId), eq(mediaFlowItems.id, orderedIds[index])));
    }
  }
  /**
   * Reset completo de um cliente pelo número de telefone
   * Exclui: conversa admin, mensagens admin, sessão em memória, user (se existir)
   * Usado para testes - permite testar como cliente novo
   */
  async resetClientByPhone(phoneNumber) {
    const result = {
      conversationDeleted: false,
      messagesDeleted: 0,
      userDeleted: false,
      connectionDeleted: false,
      subscriptionDeleted: false,
      agentConfigDeleted: false
    };
    const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
    const cleanPhone = normalizePhone(phoneNumber);
    const authEmails = new Set(
      [
        `${cleanPhone}@agentezap.com`,
        `${cleanPhone}@agentezap.temp`
      ].map((value) => value.toLowerCase()).filter(Boolean)
    );
    console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Iniciando reset para ${phoneNumber} -> ${cleanPhone}...`);
    try {
      const adminConv = await this.getAdminConversationByPhone(cleanPhone);
      if (adminConv) {
        const messagesResult = await db.delete(adminMessages).where(eq(adminMessages.conversationId, adminConv.id));
        result.messagesDeleted = messagesResult.rowCount || 0;
        console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] ${result.messagesDeleted} mensagens admin exclu\xEDdas`);
        await db.delete(adminConversations).where(eq(adminConversations.id, adminConv.id));
        result.conversationDeleted = true;
        console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Conversa admin exclu\xEDda`);
      }
      let [user] = await db.select().from(users).where(eq(users.phone, cleanPhone));
      if (!user) {
        const allUsers = await db.select().from(users);
        user = allUsers.find((candidate) => normalizePhone(candidate.phone) === cleanPhone);
      }
      if (user) {
        if (user.email) {
          authEmails.add(String(user.email).toLowerCase());
        }
        const agentResult = await db.delete(aiAgentConfig).where(eq(aiAgentConfig.userId, user.id));
        result.agentConfigDeleted = (agentResult.rowCount || 0) > 0;
        if (result.agentConfigDeleted) {
          console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Config do agente exclu\xEDda`);
        }
        const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.userId, user.id));
        if (connection) {
          const userConversations = await db.select().from(conversations).where(eq(conversations.connectionId, connection.id));
          for (const conv of userConversations) {
            await db.delete(messages).where(eq(messages.conversationId, conv.id));
          }
          await db.delete(conversations).where(eq(conversations.connectionId, connection.id));
          await db.delete(whatsappConnections).where(eq(whatsappConnections.id, connection.id));
          result.connectionDeleted = true;
          console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Conex\xE3o WhatsApp exclu\xEDda`);
        }
        const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
        if (subscription) {
          await db.delete(payments).where(eq(payments.subscriptionId, subscription.id));
          await db.delete(subscriptions).where(eq(subscriptions.id, subscription.id));
          result.subscriptionDeleted = true;
          console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Subscription exclu\xEDda`);
        }
        await db.execute(sql`delete from admin_notification_logs where user_id = ${user.id}`);
        await db.execute(sql`delete from audio_config where user_id = ${user.id}`);
        await db.execute(sql`delete from daily_usage where user_id = ${user.id}`);
        await db.execute(sql`delete from products_config where user_id = ${user.id}`);
        const tagRows = await db.execute(sql`select id from tags where user_id = ${user.id}`);
        const tagIds = Array.from(
          new Set(
            (tagRows?.rows || []).map((row) => row?.id).filter((value) => typeof value === "string" && value.length > 0)
          )
        );
        if (tagIds.length > 0) {
          await db.execute(
            sql`delete from conversation_tags where tag_id in (${sql.join(
              tagIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
        }
        await db.execute(sql`delete from tags where user_id = ${user.id}`);
        const teamMemberRows = await db.execute(sql`select id from team_members where owner_id = ${user.id}`);
        const teamMemberIds = Array.from(
          new Set(
            (teamMemberRows?.rows || []).map((row) => row?.id).filter((value) => typeof value === "string" && value.length > 0)
          )
        );
        if (teamMemberIds.length > 0) {
          await db.execute(
            sql`delete from connection_members where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
          await db.execute(
            sql`delete from routing_logs where assigned_to_member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
          await db.execute(
            sql`delete from sector_members where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
          await db.execute(
            sql`delete from team_member_sessions where member_id in (${sql.join(
              teamMemberIds.map((id) => sql`${id}`),
              sql`, `
            )})`
          );
        }
        await db.execute(sql`delete from team_members where owner_id = ${user.id}`);
        await db.delete(users).where(eq(users.id, user.id));
        result.userDeleted = true;
        console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Usu\xE1rio exclu\xEDdo`);
      }
      if (authEmails.size > 0) {
        try {
          const { data, error } = await supabase.auth.admin.listUsers();
          if (error) {
            console.warn(`\u26A0\uFE0F [RESET CLIENT] Falha ao listar usu\xE1rios no Auth: ${error.message}`);
          } else {
            const authUsers = Array.isArray(data?.users) ? data.users : [];
            for (const authUser of authUsers) {
              const authEmail = String(authUser?.email || "").toLowerCase();
              if (!authEmail || !authEmails.has(authEmail)) continue;
              const { error: deleteError } = await supabase.auth.admin.deleteUser(authUser.id);
              if (deleteError) {
                console.warn(`\u26A0\uFE0F [RESET CLIENT] Falha ao excluir Auth ${authEmail}: ${deleteError.message}`);
              } else {
                console.log(`\u{1F5D1}\uFE0F [RESET CLIENT] Usu\xE1rio Auth exclu\xEDdo: ${authEmail}`);
              }
            }
          }
        } catch (authCleanupError) {
          console.warn(`\u26A0\uFE0F [RESET CLIENT] Erro ao limpar Auth do Supabase:`, authCleanupError);
        }
      }
      console.log(`\u2705 [RESET CLIENT] Reset completo para ${phoneNumber}`, result);
      return result;
    } catch (error) {
      console.error(`\u274C [RESET CLIENT] Erro ao resetar cliente:`, error);
      throw error;
    }
  }
  /**
   * Reset SEGURO de conta de teste com validações rigorosas.
   * Em fluxos administrativos, pode receber forceAnyAccount para
   * remover qualquer conta vinculada ao telefone.
   */
  async resetTestAccountSafely(phoneNumber, options) {
    try {
      const normalizePhone = (value) => String(value || "").replace(/\D/g, "");
      const cleanPhone = normalizePhone(phoneNumber);
      const forceAnyAccount = options?.forceAnyAccount === true;
      console.log(
        `\u{1F50D} [SAFE RESET] Verificando seguranca para ${phoneNumber} -> ${cleanPhone}... modo=${forceAnyAccount ? "FORCED" : "SAFE"}`
      );
      let [user] = await db.select().from(users).where(eq(users.phone, cleanPhone));
      if (!user) {
        const allUsers = await db.select().from(users);
        user = allUsers.find((u) => normalizePhone(u.phone) === cleanPhone);
      }
      if (!user) {
        console.log(`\u26A0\uFE0F [SAFE RESET] Nenhum usuario encontrado para ${cleanPhone}`);
        const adminConv = await this.getAdminConversationByPhone(cleanPhone);
        if (adminConv) {
          await db.delete(adminMessages).where(eq(adminMessages.conversationId, adminConv.id));
          await db.delete(adminConversations).where(eq(adminConversations.id, adminConv.id));
        }
        return {
          success: true,
          result: { userDeleted: false, conversationDeleted: !!adminConv }
        };
      }
      if (!forceAnyAccount) {
        const userEmail = String(user.email || "").toLowerCase().trim();
        const managedEmails = /* @__PURE__ */ new Set([
          `${cleanPhone}@agentezap.com`,
          `${cleanPhone}@agentezap.temp`
        ]);
        if (!managedEmails.has(userEmail)) {
          return {
            success: false,
            error: `\u26D4 Conta nao elegivel para reset seguro. Email atual: ${user.email || "nao definido"}.`
          };
        }
      }
      const [connection] = await db.select().from(whatsappConnections).where(eq(whatsappConnections.userId, user.id));
      if (connection && connection.isConnected) {
        console.log(`\u26A0\uFE0F [SAFE RESET] Usu\xE1rio tem WhatsApp conectado. Desconectando for\xE7adamente para permitir reset...`);
        await db.update(whatsappConnections).set({ isConnected: false, qrCode: null }).where(eq(whatsappConnections.id, connection.id));
      }
      if (connection) {
        const [hasRealConversations] = await db.select({ count: sql`count(*)` }).from(conversations).where(eq(conversations.connectionId, connection.id));
        if (hasRealConversations && Number(hasRealConversations.count) > 0) {
          console.log(`\u26A0\uFE0F [SAFE RESET] Usu\xE1rio tem conversas reais (${hasRealConversations.count}). Apagando conversas para permitir reset...`);
          await db.delete(conversations).where(eq(conversations.connectionId, connection.id));
        }
      }
      const [subscription] = await db.select().from(subscriptions).where(eq(subscriptions.userId, user.id));
      if (!forceAnyAccount && subscription && subscription.status !== "trialing" && subscription.status !== "inactive") {
        return {
          success: false,
          error: `\u26D4 Usu\xE1rio tem assinatura ativa (${subscription.status})! N\xE3o pode deletar conta com pagamento ativo.`
        };
      }
      if (!forceAnyAccount && subscription) {
        const [hasPayments] = await db.select({ count: sql`count(*)` }).from(payments).where(eq(payments.subscriptionId, subscription.id));
        if (hasPayments && Number(hasPayments.count) > 0) {
          return {
            success: false,
            error: "\u26D4 Usu\xE1rio tem pagamentos registrados! N\xE3o pode deletar conta com hist\xF3rico financeiro."
          };
        }
      }
      const createdAtDate = user.createdAt ? new Date(user.createdAt) : /* @__PURE__ */ new Date();
      const accountAge = Date.now() - createdAtDate.getTime();
      const daysOld = accountAge / (1e3 * 60 * 60 * 24);
      if (!forceAnyAccount && daysOld > 30) {
        return {
          success: false,
          error: `\u26D4 Conta tem mais de 30 dias (${Math.floor(daysOld)} dias). Muito antiga para reset autom\xE1tico.`
        };
      }
      console.log(
        `\u2705 [SAFE RESET] ${forceAnyAccount ? "Reset forcado autorizado" : "Validacoes OK"} para ${cleanPhone}. Procedendo com reset...`
      );
      const result = await this.resetClientByPhone(cleanPhone);
      return {
        success: true,
        result
      };
    } catch (error) {
      console.error(`\u274C [SAFE RESET] Erro ao resetar:`, error);
      return {
        success: false,
        error: `Erro t\xE9cnico: ${error.message}`
      };
    }
  }
  // ==================== QUICK REPLIES / RESPOSTAS RÁPIDAS ====================
  async getQuickReplies(adminId) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    return db.select().from(adminQuickReplies).where(eq(adminQuickReplies.adminId, adminId)).orderBy(adminQuickReplies.createdAt);
  }
  async getQuickReply(id) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.select().from(adminQuickReplies).where(eq(adminQuickReplies.id, id));
    return reply;
  }
  async createQuickReply(data) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.insert(adminQuickReplies).values(data).returning();
    return reply;
  }
  async updateQuickReply(id, data) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.update(adminQuickReplies).set(data).where(eq(adminQuickReplies.id, id)).returning();
    return reply;
  }
  async deleteQuickReply(id) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    await db.delete(adminQuickReplies).where(eq(adminQuickReplies.id, id));
  }
  async incrementQuickReplyUsage(id) {
    const { adminQuickReplies } = await import("./schema-SHXO2XXZ.js");
    await db.update(adminQuickReplies).set({
      usageCount: sql`${adminQuickReplies.usageCount} + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(adminQuickReplies.id, id));
  }
  // ==================== USER QUICK REPLIES / RESPOSTAS RÁPIDAS USUÁRIOS ====================
  async getUserQuickReplies(userId) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    return db.select().from(userQuickReplies).where(eq(userQuickReplies.userId, userId)).orderBy(userQuickReplies.createdAt);
  }
  async getUserQuickReply(id) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.select().from(userQuickReplies).where(eq(userQuickReplies.id, id));
    return reply;
  }
  async createUserQuickReply(data) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.insert(userQuickReplies).values(data).returning();
    return reply;
  }
  async updateUserQuickReply(id, data) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    const [reply] = await db.update(userQuickReplies).set(data).where(eq(userQuickReplies.id, id)).returning();
    return reply;
  }
  async deleteUserQuickReply(id) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    await db.delete(userQuickReplies).where(eq(userQuickReplies.id, id));
  }
  async incrementUserQuickReplyUsage(id) {
    const { userQuickReplies } = await import("./schema-SHXO2XXZ.js");
    await db.update(userQuickReplies).set({
      usageCount: sql`${userQuickReplies.usageCount} + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(userQuickReplies.id, id));
  }
  // ==================== EXCLUSION LIST / LISTA DE EXCLUSÃO ====================
  /**
   * Normaliza um número de telefone brasileiro para comparação
   * Retorna array com todas as variações possíveis do número
   * Ex: 5517991956944 -> ['5517991956944', '17991956944', '991956944']
   */
  normalizePhoneForComparison(phoneNumber) {
    const cleanNumber = phoneNumber.replace(/\D/g, "");
    const variations = [cleanNumber];
    if (cleanNumber.startsWith("55") && cleanNumber.length >= 12) {
      variations.push(cleanNumber.substring(2));
    }
    if (!cleanNumber.startsWith("55") && cleanNumber.length >= 10) {
      variations.push("55" + cleanNumber);
    }
    if (cleanNumber.length >= 10 && cleanNumber.length <= 11) {
      variations.push(cleanNumber.substring(2));
    }
    if (cleanNumber.startsWith("55") && cleanNumber.length >= 12) {
      const withoutCountry = cleanNumber.substring(2);
      if (withoutCountry.length >= 10) {
        variations.push(withoutCountry.substring(2));
      }
    }
    console.log(`\u{1F4DE} [EXCLUSION] Normalizando n\xFAmero ${phoneNumber} -> varia\xE7\xF5es: [${variations.join(", ")}]`);
    return [...new Set(variations)];
  }
  /**
   * Verifica se um número está na lista de exclusão de um usuário
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído e ativo
   */
  async isNumberExcluded(userId, phoneNumber) {
    const { exclusionList, exclusionConfig } = await import("./schema-SHXO2XXZ.js");
    const { or: or2 } = await import("drizzle-orm");
    const config = await this.getExclusionConfig(userId);
    if (config && config.isEnabled === false) {
      console.log(`\u{1F6AB} [EXCLUSION] Lista de exclus\xE3o DESATIVADA explicitamente para usu\xE1rio ${userId}`);
      return false;
    }
    console.log(`\u{1F50D} [EXCLUSION] Verificando lista de exclus\xE3o para usu\xE1rio ${userId} (config=${config ? "exists" : "default"}, isEnabled=${config?.isEnabled ?? "default=true"})`);
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    const items = await db.select().from(exclusionList).where(
      and(
        eq(exclusionList.userId, userId),
        eq(exclusionList.isActive, true),
        or2(...numberVariations.map((num) => eq(exclusionList.phoneNumber, num)))
      )
    );
    const isExcluded = items.length > 0;
    console.log(`\u{1F4DE} [EXCLUSION] Verificando ${phoneNumber} (varia\xE7\xF5es: ${numberVariations.join(", ")}) -> ${isExcluded ? "\u{1F6AB} EXCLU\xCDDO" : "\u2705 Permitido"}`);
    return isExcluded;
  }
  /**
   * Verifica se um número está excluído de follow-up
   * @param userId ID do usuário
   * @param phoneNumber Número de telefone (apenas dígitos)
   * @returns true se o número está excluído de follow-up
   */
  async isNumberExcludedFromFollowup(userId, phoneNumber) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    const { or: or2 } = await import("drizzle-orm");
    const config = await this.getExclusionConfig(userId);
    if (config && config.isEnabled === false) {
      console.log(`\u{1F6AB} [EXCLUSION] Lista de exclus\xE3o DESATIVADA explicitamente para usu\xE1rio ${userId}`);
      return false;
    }
    if (config && config.followupExclusionEnabled === false) {
      console.log(`\u{1F6AB} [EXCLUSION] Exclus\xE3o de follow-up DESATIVADA explicitamente para usu\xE1rio ${userId}`);
      return false;
    }
    console.log(`\u{1F50D} [EXCLUSION-FOLLOWUP] Verificando lista de exclus\xE3o para usu\xE1rio ${userId} (config=${config ? "exists" : "default"}, isEnabled=${config?.isEnabled ?? "default=true"}, followupExclusionEnabled=${config?.followupExclusionEnabled ?? "default=true"})`);
    const numberVariations = this.normalizePhoneForComparison(phoneNumber);
    const items = await db.select().from(exclusionList).where(
      and(
        eq(exclusionList.userId, userId),
        eq(exclusionList.isActive, true),
        eq(exclusionList.excludeFromFollowup, true),
        or2(...numberVariations.map((num) => eq(exclusionList.phoneNumber, num)))
      )
    );
    const isExcluded = items.length > 0;
    console.log(`\u{1F4DE} [EXCLUSION-FOLLOWUP] Verificando ${phoneNumber} -> ${isExcluded ? "\u{1F6AB} EXCLU\xCDDO DE FOLLOW-UP" : "\u2705 Follow-up permitido"}`);
    return isExcluded;
  }
  /**
   * Obtém configuração de exclusão do usuário
   */
  async getExclusionConfig(userId) {
    const { exclusionConfig } = await import("./schema-SHXO2XXZ.js");
    const [config] = await db.select().from(exclusionConfig).where(eq(exclusionConfig.userId, userId));
    return config;
  }
  /**
   * Cria ou atualiza configuração de exclusão do usuário
   */
  async upsertExclusionConfig(userId, data) {
    const { exclusionConfig } = await import("./schema-SHXO2XXZ.js");
    const existing = await this.getExclusionConfig(userId);
    if (existing) {
      const [config] = await db.update(exclusionConfig).set({
        ...data,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(exclusionConfig.userId, userId)).returning();
      return config;
    } else {
      const [config] = await db.insert(exclusionConfig).values({
        userId,
        isEnabled: data.isEnabled ?? true,
        followupExclusionEnabled: data.followupExclusionEnabled ?? true
      }).returning();
      return config;
    }
  }
  /**
   * Obtém todos os números da lista de exclusão do usuário
   */
  async getExclusionList(userId) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    return db.select().from(exclusionList).where(eq(exclusionList.userId, userId)).orderBy(desc(exclusionList.createdAt));
  }
  /**
   * Obtém um item da lista de exclusão por ID
   */
  async getExclusionListItem(id) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    const [item] = await db.select().from(exclusionList).where(eq(exclusionList.id, id));
    return item;
  }
  /**
   * Adiciona um número à lista de exclusão
   */
  async addToExclusionList(data) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    const cleanNumber = data.phoneNumber.replace(/\D/g, "");
    const existing = await db.select().from(exclusionList).where(
      and(
        eq(exclusionList.userId, data.userId),
        eq(exclusionList.phoneNumber, cleanNumber)
      )
    );
    if (existing.length > 0) {
      const [item2] = await db.update(exclusionList).set({
        contactName: data.contactName,
        reason: data.reason,
        excludeFromFollowup: data.excludeFromFollowup ?? true,
        isActive: data.isActive ?? true,
        updatedAt: /* @__PURE__ */ new Date()
      }).where(eq(exclusionList.id, existing[0].id)).returning();
      return item2;
    }
    const [item] = await db.insert(exclusionList).values({
      userId: data.userId,
      phoneNumber: cleanNumber,
      contactName: data.contactName,
      reason: data.reason,
      excludeFromFollowup: data.excludeFromFollowup ?? true,
      isActive: data.isActive ?? true
    }).returning();
    return item;
  }
  /**
   * Atualiza um item da lista de exclusão
   */
  async updateExclusionListItem(id, data) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    const [item] = await db.update(exclusionList).set({
      ...data,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(exclusionList.id, id)).returning();
    return item;
  }
  /**
   * Remove um número da lista de exclusão (soft delete - desativa)
   */
  async removeFromExclusionList(id) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    await db.update(exclusionList).set({
      isActive: false,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(exclusionList.id, id));
  }
  /**
   * Remove permanentemente um número da lista de exclusão
   */
  async deleteFromExclusionList(id) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    await db.delete(exclusionList).where(eq(exclusionList.id, id));
  }
  /**
   * Reativa um número na lista de exclusão
   */
  async reactivateExclusionListItem(id) {
    const { exclusionList } = await import("./schema-SHXO2XXZ.js");
    const [item] = await db.update(exclusionList).set({
      isActive: true,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(exclusionList.id, id)).returning();
    return item;
  }
  // =============================================================================
  // DAILY USAGE TRACKING - Rastreamento de uso diário para limites free
  // =============================================================================
  /**
   * Obtém ou cria o registro de uso diário para um usuário
   */
  async getDailyUsage(userId) {
    const { dailyUsage } = await import("./schema-SHXO2XXZ.js");
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const [existing] = await db.select().from(dailyUsage).where(
      and(
        eq(dailyUsage.userId, userId),
        eq(dailyUsage.usageDate, today)
      )
    );
    if (existing) {
      return {
        promptEditsCount: existing.promptEditsCount,
        simulatorMessagesCount: existing.simulatorMessagesCount
      };
    }
    return { promptEditsCount: 0, simulatorMessagesCount: 0 };
  }
  /**
   * Incrementa o contador de edições de prompt do dia
   */
  async incrementPromptEdits(userId) {
    const { dailyUsage } = await import("./schema-SHXO2XXZ.js");
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const updated = await db.update(dailyUsage).set({
      promptEditsCount: sql`${dailyUsage.promptEditsCount} + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq(dailyUsage.userId, userId),
        eq(dailyUsage.usageDate, today)
      )
    ).returning();
    if (updated.length > 0) {
      return updated[0].promptEditsCount;
    }
    const [newRecord] = await db.insert(dailyUsage).values({
      userId,
      usageDate: today,
      promptEditsCount: 1,
      simulatorMessagesCount: 0
    }).returning();
    return newRecord.promptEditsCount;
  }
  /**
   * Incrementa o contador de mensagens do simulador do dia
   */
  async incrementSimulatorMessages(userId) {
    const { dailyUsage } = await import("./schema-SHXO2XXZ.js");
    const today = /* @__PURE__ */ new Date();
    today.setHours(0, 0, 0, 0);
    const updated = await db.update(dailyUsage).set({
      simulatorMessagesCount: sql`${dailyUsage.simulatorMessagesCount} + 1`,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(
      and(
        eq(dailyUsage.userId, userId),
        eq(dailyUsage.usageDate, today)
      )
    ).returning();
    if (updated.length > 0) {
      return updated[0].simulatorMessagesCount;
    }
    const [newRecord] = await db.insert(dailyUsage).values({
      userId,
      usageDate: today,
      promptEditsCount: 0,
      simulatorMessagesCount: 1
    }).returning();
    return newRecord.simulatorMessagesCount;
  }
  // ============================================================================
  // TAGS / ETIQUETAS - CRUD Operations
  // ============================================================================
  /**
   * Obtém todas as tags de um usuário
   */
  async getTagsByUserId(userId) {
    return await db.select().from(tags).where(eq(tags.userId, userId)).orderBy(tags.position, tags.name);
  }
  /**
   * Obtém uma tag por ID
   */
  async getTag(id) {
    const [tag] = await db.select().from(tags).where(eq(tags.id, id));
    return tag;
  }
  /**
   * Cria uma nova tag
   */
  async createTag(tagData) {
    const [newTag] = await db.insert(tags).values(tagData).returning();
    return newTag;
  }
  /**
   * Atualiza uma tag existente
   */
  async updateTag(id, data) {
    const [updated] = await db.update(tags).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(tags.id, id)).returning();
    return updated;
  }
  /**
   * Deleta uma tag e remove todas as associações
   */
  async deleteTag(id) {
    await db.delete(tags).where(eq(tags.id, id));
  }
  /**
   * Cria tags padrão do WhatsApp Business para um usuário
   */
  async createDefaultTags(userId) {
    const defaultTags = [
      { name: "Novo cliente", color: "#22c55e", icon: "user-plus", position: 0, isDefault: true },
      { name: "Novo pedido", color: "#eab308", icon: "shopping-bag", position: 1, isDefault: true },
      { name: "Pagamento pendente", color: "#f97316", icon: "clock", position: 2, isDefault: true },
      { name: "Pago", color: "#3b82f6", icon: "check-circle", position: 3, isDefault: true },
      { name: "Pedido finalizado", color: "#ef4444", icon: "package", position: 4, isDefault: true },
      { name: "VIP", color: "#a855f7", icon: "star", position: 5, isDefault: true }
    ];
    const createdTags = [];
    for (const tagData of defaultTags) {
      try {
        const [newTag] = await db.insert(tags).values({ ...tagData, userId }).onConflictDoNothing().returning();
        if (newTag) createdTags.push(newTag);
      } catch (error) {
        console.log(`Tag "${tagData.name}" j\xE1 existe para o usu\xE1rio`);
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
  async getConversationTags(conversationId) {
    const result = await db.select({
      tag: tags
    }).from(conversationTags).innerJoin(tags, eq(conversationTags.tagId, tags.id)).where(eq(conversationTags.conversationId, conversationId));
    return result.map((r) => r.tag);
  }
  /**
   * 🔥 OTIMIZADO: Batch - obtém tags para múltiplas conversas em 1 query (evita N+1)
   */
  async getTagsForConversations(conversationIds) {
    if (conversationIds.length === 0) return /* @__PURE__ */ new Map();
    const allTags = await db.select({
      conversationId: conversationTags.conversationId,
      tag: tags
    }).from(conversationTags).innerJoin(tags, eq(conversationTags.tagId, tags.id)).where(inArray(conversationTags.conversationId, conversationIds));
    const tagsByConversation = /* @__PURE__ */ new Map();
    for (const { conversationId, tag } of allTags) {
      if (!tagsByConversation.has(conversationId)) {
        tagsByConversation.set(conversationId, []);
      }
      tagsByConversation.get(conversationId).push(tag);
    }
    return tagsByConversation;
  }
  /**
   * Obtém conversas filtradas por tag
   */
  async getConversationsByTag(tagId, connectionId) {
    const result = await db.select({
      conversation: conversations
    }).from(conversationTags).innerJoin(conversations, eq(conversationTags.conversationId, conversations.id)).where(
      and(
        eq(conversationTags.tagId, tagId),
        eq(conversations.connectionId, connectionId)
      )
    ).orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
    return result.map((r) => r.conversation);
  }
  /**
   * Adiciona uma tag a uma conversa
   */
  async addTagToConversation(conversationId, tagId) {
    const [result] = await db.insert(conversationTags).values({ conversationId, tagId }).onConflictDoNothing().returning();
    return result;
  }
  /**
   * Remove uma tag de uma conversa
   */
  async removeTagFromConversation(conversationId, tagId) {
    await db.delete(conversationTags).where(
      and(
        eq(conversationTags.conversationId, conversationId),
        eq(conversationTags.tagId, tagId)
      )
    );
  }
  /**
   * Atualiza todas as tags de uma conversa (substitui as existentes)
   */
  async setConversationTags(conversationId, tagIds) {
    await db.delete(conversationTags).where(eq(conversationTags.conversationId, conversationId));
    if (tagIds.length > 0) {
      await db.insert(conversationTags).values(tagIds.map((tagId) => ({ conversationId, tagId }))).onConflictDoNothing();
    }
  }
  /**
   * Adiciona tags a várias conversas (mantém tags existentes).
   */
  async addTagsToConversations(conversationIds, tagIds) {
    if (conversationIds.length === 0 || tagIds.length === 0) return;
    const values = conversationIds.flatMap(
      (conversationId) => tagIds.map((tagId) => ({ conversationId, tagId }))
    );
    await db.insert(conversationTags).values(values).onConflictDoNothing();
  }
  /**
   * Obtém conversas com suas tags para um connectionId
   * 🔥 OTIMIZADO: Cache de 15s para evitar queries repetidas em polling
   */
  async getConversationsWithTags(connectionId, limit, offset) {
    const isFirstPage = limit != null && (!offset || offset === 0);
    if (limit == null) {
      const cacheKey = `convWithTags:${connectionId}`;
      const cached = memoryCache.get(cacheKey);
      if (cached !== null) return cached;
    } else if (isFirstPage) {
      const cacheKey = `convWithTags:${connectionId}:page0:${limit}`;
      const cached = memoryCache.get(cacheKey);
      if (cached !== null) return cached;
    }
    const countCacheKey = `convCount:${connectionId}`;
    let total = memoryCache.get(countCacheKey);
    if (total === null) {
      const countResult = await db.select({ count: sql`count(*)` }).from(conversations).where(eq(conversations.connectionId, connectionId));
      total = Number(countResult[0]?.count || 0);
      memoryCache.set(countCacheKey, total, 3e4);
    }
    let query = db.select().from(conversations).where(eq(conversations.connectionId, connectionId)).orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`);
    if (limit != null) {
      query = query.limit(limit);
    }
    if (offset != null && offset > 0) {
      query = query.offset(offset);
    }
    const allConversations = await query;
    const conversationIds = allConversations.map((c) => c.id);
    if (conversationIds.length === 0) {
      return { data: [], total };
    }
    const allTags = await db.select({
      conversationId: conversationTags.conversationId,
      tag: tags
    }).from(conversationTags).innerJoin(tags, eq(conversationTags.tagId, tags.id)).where(inArray(conversationTags.conversationId, conversationIds));
    const tagsByConversation = /* @__PURE__ */ new Map();
    for (const { conversationId, tag } of allTags) {
      if (!tagsByConversation.has(conversationId)) {
        tagsByConversation.set(conversationId, []);
      }
      tagsByConversation.get(conversationId).push(tag);
    }
    const data = allConversations.map((conv) => ({
      ...conv,
      tags: tagsByConversation.get(conv.id) || []
    }));
    const result = { data, total };
    if (limit == null) {
      const cacheKey = `convWithTags:${connectionId}`;
      memoryCache.set(cacheKey, result, 15e3);
    } else if (isFirstPage) {
      const cacheKey = `convWithTags:${connectionId}:page0:${limit}`;
      memoryCache.set(cacheKey, result, 1e4);
    }
    return result;
  }
  /**
   * searchConversations — Parte 9: Busca por contato (nome/número) e por conteúdo de mensagens
   * Retorna conversas que correspondem ao termo, com o trecho de mensagem mais relevante (snippet).
   */
  async searchConversations(connectionId, query, limit = 30) {
    if (!query || query.trim().length < 2) return [];
    const term = query.trim().toLowerCase();
    const likeTerm = `%${term}%`;
    const byContact = await db.select().from(conversations).where(
      and(
        eq(conversations.connectionId, connectionId),
        or(
          sql`lower(${conversations.contactName}) like ${likeTerm}`,
          sql`lower(${conversations.contactNumber}) like ${likeTerm}`
        )
      )
    ).orderBy(sql`${conversations.lastMessageTime} DESC NULLS LAST`).limit(limit);
    const byMessage = await db.select({
      conv: conversations,
      msgText: messages.text,
      msgFromMe: messages.fromMe,
      msgTime: messages.timestamp
    }).from(messages).innerJoin(conversations, eq(messages.conversationId, conversations.id)).where(
      and(
        eq(conversations.connectionId, connectionId),
        sql`lower(${messages.text}) like ${likeTerm}`
      )
    ).orderBy(sql`${messages.timestamp} DESC`).limit(limit * 3);
    const seen = /* @__PURE__ */ new Set();
    const merged = [];
    for (const c of byContact) {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        merged.push({ ...c, snippet: null });
      }
    }
    for (const row of byMessage) {
      const conv = row.conv;
      if (!seen.has(conv.id)) {
        seen.add(conv.id);
        merged.push({
          ...conv,
          snippet: row.msgText,
          snippetFromMe: row.msgFromMe
        });
      } else {
        const existing = merged.find((m) => m.id === conv.id);
        if (existing && !existing.snippet) {
          existing.snippet = row.msgText;
          existing.snippetFromMe = row.msgFromMe;
        }
      }
    }
    const topResults = merged.slice(0, limit);
    if (topResults.length === 0) return [];
    const convIds = topResults.map((c) => c.id);
    const allTagRows = await db.select({ conversationId: conversationTags.conversationId, tag: tags }).from(conversationTags).innerJoin(tags, eq(conversationTags.tagId, tags.id)).where(inArray(conversationTags.conversationId, convIds));
    const tagsByConv = /* @__PURE__ */ new Map();
    for (const { conversationId, tag } of allTagRows) {
      if (!tagsByConv.has(conversationId)) tagsByConv.set(conversationId, []);
      tagsByConv.get(conversationId).push(tag);
    }
    return topResults.map((c) => ({
      ...c,
      tags: tagsByConv.get(c.id) || []
    }));
  }
  // ============================================
  // RESELLER FUNCTIONS - Sistema de Revenda White-Label
  // ============================================
  /**
   * Cria um novo revendedor
   */
  async createReseller(data) {
    const [result] = await db.insert(resellers).values(data).returning();
    return result;
  }
  /**
   * Obtém revendedor por ID
   */
  async getReseller(id) {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }
  /**
   * Obtém revendedor pelo ID do usuário
   */
  async getResellerByUserId(userId) {
    const [result] = await db.select().from(resellers).where(eq(resellers.userId, userId)).limit(1);
    return result;
  }
  /**
   * Obtém revendedor pelo domínio customizado
   */
  async getResellerByDomain(domain) {
    const [result] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return result;
  }
  /**
   * Obtém revendedor pelo subdomínio
   */
  async getResellerBySubdomain(subdomain) {
    const [result] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return result;
  }
  /**
   * Atualiza revendedor
   */
  async updateReseller(id, data) {
    const [result] = await db.update(resellers).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(resellers.id, id)).returning();
    return result;
  }
  /**
   * Obtém revendedor por ID
   */
  async getResellerById(id) {
    const [result] = await db.select().from(resellers).where(eq(resellers.id, id)).limit(1);
    return result;
  }
  /**
   * Lista todos os revendedores (admin)
   */
  async getAllResellers() {
    const allResellers = await db.select().from(resellers).orderBy(desc(resellers.createdAt));
    const results = [];
    for (const reseller of allResellers) {
      const [user] = await db.select().from(users).where(eq(users.id, reseller.userId)).limit(1);
      const clientCountResult = await db.select({ count: sql`count(*)` }).from(resellerClients).where(eq(resellerClients.resellerId, reseller.id));
      results.push({
        ...reseller,
        user: user || null,
        clientCount: Number(clientCountResult[0]?.count || 0)
      });
    }
    return results;
  }
  /**
   * Verifica se subdomínio está disponível
   */
  async isSubdomainAvailable(subdomain) {
    const [existing] = await db.select().from(resellers).where(eq(resellers.subdomain, subdomain)).limit(1);
    return !existing;
  }
  /**
   * Verifica se domínio está disponível
   */
  async isDomainAvailable(domain) {
    const [existing] = await db.select().from(resellers).where(eq(resellers.customDomain, domain)).limit(1);
    return !existing;
  }
  // ============================================
  // RESELLER CLIENTS FUNCTIONS
  // ============================================
  /**
   * Cria um novo cliente do revendedor
   */
  async createResellerClient(data) {
    const [result] = await db.insert(resellerClients).values(data).returning();
    await db.update(users).set({ resellerId: data.resellerId }).where(eq(users.id, data.userId));
    return result;
  }
  /**
   * Obtém cliente do revendedor por ID
   */
  async getResellerClient(id) {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }
  /**
   * Obtém cliente do revendedor por ID (número)
   */
  async getResellerClientById(id) {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.id, id)).limit(1);
    return result;
  }
  /**
   * Obtém cliente do revendedor pelo ID do usuário
   */
  async getResellerClientByUserId(userId) {
    const [result] = await db.select().from(resellerClients).where(eq(resellerClients.userId, userId)).limit(1);
    return result;
  }
  /**
   * Lista clientes de um revendedor
   */
  async getResellerClients(resellerId) {
    const clients = await db.select().from(resellerClients).where(eq(resellerClients.resellerId, resellerId)).orderBy(desc(resellerClients.createdAt));
    const results = [];
    for (const client of clients) {
      const [user] = await db.select().from(users).where(eq(users.id, client.userId)).limit(1);
      const payments2 = await db.select().from(resellerPayments).where(and(
        eq(resellerPayments.resellerId, resellerId),
        eq(resellerPayments.resellerClientId, client.id),
        eq(resellerPayments.status, "paid")
      )).orderBy(resellerPayments.paidAt);
      const firstPaymentDate = payments2.length > 0 && payments2[0].paidAt ? payments2[0].paidAt : null;
      const lastPaymentDate = payments2.length > 0 && payments2[payments2.length - 1].paidAt ? payments2[payments2.length - 1].paidAt : null;
      const isOverdue = !client.isFreeClient && client.nextPaymentDate !== null && new Date(client.nextPaymentDate) < /* @__PURE__ */ new Date();
      const monthsInSystem = payments2.length;
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
  async updateResellerClient(id, data) {
    const [result] = await db.update(resellerClients).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(resellerClients.id, id)).returning();
    return result;
  }
  /**
   * Suspende cliente do revendedor
   */
  async suspendResellerClient(id) {
    const [result] = await db.update(resellerClients).set({ status: "suspended", suspendedAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(resellerClients.id, id)).returning();
    return result;
  }
  /**
   * Reativa cliente do revendedor
   */
  async reactivateResellerClient(id) {
    const [result] = await db.update(resellerClients).set({ status: "active", suspendedAt: null, updatedAt: /* @__PURE__ */ new Date() }).where(eq(resellerClients.id, id)).returning();
    return result;
  }
  /**
   * Cancela cliente do revendedor
   */
  async cancelResellerClient(id) {
    const [result] = await db.update(resellerClients).set({ status: "cancelled", cancelledAt: /* @__PURE__ */ new Date(), updatedAt: /* @__PURE__ */ new Date() }).where(eq(resellerClients.id, id)).returning();
    return result;
  }
  /**
   * Conta clientes ativos de um revendedor
   */
  async countActiveResellerClients(resellerId) {
    const [result] = await db.select({ count: sql`count(*)` }).from(resellerClients).where(and(eq(resellerClients.resellerId, resellerId), eq(resellerClients.status, "active")));
    return Number(result?.count || 0);
  }
  /**
   * Conta clientes gratuitos de um revendedor (máximo 1)
   */
  async countFreeResellerClients(resellerId) {
    const [result] = await db.select({ count: sql`count(*)` }).from(resellerClients).where(and(
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
  async createResellerPayment(data) {
    const [result] = await db.insert(resellerPayments).values(data).returning();
    return result;
  }
  /**
   * Obtém pagamento do revendedor por ID
   */
  async getResellerPayment(id) {
    const [result] = await db.select().from(resellerPayments).where(eq(resellerPayments.id, id)).limit(1);
    return result;
  }
  /**
   * Lista pagamentos de um revendedor
   */
  async getResellerPayments(resellerId, limit = 50) {
    return db.select().from(resellerPayments).where(eq(resellerPayments.resellerId, resellerId)).orderBy(desc(resellerPayments.createdAt)).limit(limit);
  }
  /**
   * Atualiza pagamento do revendedor
   */
  async updateResellerPayment(id, data) {
    const [result] = await db.update(resellerPayments).set(data).where(eq(resellerPayments.id, id)).returning();
    return result;
  }
  /**
   * Obtém métricas do revendedor
   */
  async getResellerDashboardMetrics(resellerId) {
    const clientStats = await db.select({
      status: resellerClients.status,
      count: sql`count(*)`
    }).from(resellerClients).where(eq(resellerClients.resellerId, resellerId)).groupBy(resellerClients.status);
    const stats = {
      totalClients: 0,
      activeClients: 0,
      suspendedClients: 0,
      cancelledClients: 0
    };
    for (const { status, count } of clientStats) {
      const countNum = Number(count);
      stats.totalClients += countNum;
      if (status === "active") stats.activeClients = countNum;
      if (status === "suspended") stats.suspendedClients = countNum;
      if (status === "cancelled") stats.cancelledClients = countNum;
    }
    const [totalRevenueResult] = await db.select({ total: sql`COALESCE(SUM(amount), 0)` }).from(resellerPayments).where(and(eq(resellerPayments.resellerId, resellerId), eq(resellerPayments.status, "approved")));
    const startOfMonth = /* @__PURE__ */ new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);
    const [monthlyRevenueResult] = await db.select({ total: sql`COALESCE(SUM(amount), 0)` }).from(resellerPayments).where(
      and(
        eq(resellerPayments.resellerId, resellerId),
        eq(resellerPayments.status, "approved"),
        gte(resellerPayments.createdAt, startOfMonth)
      )
    );
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
      monthlyProfit: monthlyRevenue - monthlyCost
    };
  }
  // ============================================
  // RESELLER INVOICES FUNCTIONS (Flow 2: Reseller -> System)
  // ============================================
  /**
   * Cria uma nova fatura do revendedor para o sistema
   */
  async createResellerInvoice(data) {
    const [result] = await db.insert(resellerInvoices).values(data).returning();
    return result;
  }
  /**
   * Obtém fatura do revendedor por ID
   */
  async getResellerInvoice(id) {
    const [result] = await db.select().from(resellerInvoices).where(eq(resellerInvoices.id, id)).limit(1);
    return result;
  }
  /**
   * Lista faturas de um revendedor
   */
  async getResellerInvoices(resellerId, limit = 50) {
    return db.select().from(resellerInvoices).where(eq(resellerInvoices.resellerId, resellerId)).orderBy(desc(resellerInvoices.createdAt)).limit(limit);
  }
  /**
   * Obtém fatura por mês de referência
   */
  async getResellerInvoiceByMonth(resellerId, referenceMonth) {
    const [result] = await db.select().from(resellerInvoices).where(
      and(
        eq(resellerInvoices.resellerId, resellerId),
        eq(resellerInvoices.referenceMonth, referenceMonth)
      )
    ).limit(1);
    return result;
  }
  /**
   * Atualiza fatura do revendedor
   */
  async updateResellerInvoice(id, data) {
    const [result] = await db.update(resellerInvoices).set(data).where(eq(resellerInvoices.id, id)).returning();
    return result;
  }
  /**
   * Obtém faturas pendentes ou vencidas de um revendedor
   */
  async getResellerPendingInvoices(resellerId) {
    return db.select().from(resellerInvoices).where(
      and(
        eq(resellerInvoices.resellerId, resellerId),
        sql`${resellerInvoices.status} IN ('pending', 'overdue')`
      )
    ).orderBy(desc(resellerInvoices.dueDate));
  }
  /**
   * Cria fatura com itens (transacional)
   */
  async createResellerInvoiceWithItems(invoice, items) {
    return await db.transaction(async (tx) => {
      const [newInvoice] = await tx.insert(resellerInvoices).values(invoice).returning();
      if (items.length > 0) {
        const itemsWithId = items.map((item) => ({
          ...item,
          invoiceId: newInvoice.id
        }));
        await tx.insert(resellerInvoiceItems).values(itemsWithId);
      }
      return newInvoice;
    });
  }
  /**
   * Obtém fatura pelo ID do Mercado Pago
   */
  async getResellerInvoiceByMpPaymentId(mpPaymentId) {
    const [result] = await db.select().from(resellerInvoices).where(eq(resellerInvoices.mpPaymentId, mpPaymentId)).limit(1);
    return result;
  }
  /**
   * Obtém itens de uma fatura
   */
  async getResellerInvoiceItems(invoiceId) {
    return db.select().from(resellerInvoiceItems).where(eq(resellerInvoiceItems.invoiceId, invoiceId));
  }
  // ============================================================================
  // SISTEMA DE SUSPENSÃO POR VIOLAÇÃO DE POLÍTICAS
  // ============================================================================
  /**
   * Verifica se um usuário está suspenso por violação de políticas
   */
  async isUserSuspended(userId) {
    const [user] = await db.select({
      suspendedAt: users.suspendedAt,
      suspensionReason: users.suspensionReason,
      suspensionType: users.suspensionType,
      refundedAt: users.refundedAt,
      refundAmount: users.refundAmount
    }).from(users).where(eq(users.id, userId));
    if (!user || !user.suspendedAt) {
      return { suspended: false };
    }
    return {
      suspended: true,
      data: {
        reason: user.suspensionReason,
        type: user.suspensionType,
        suspendedAt: user.suspendedAt,
        refundedAt: user.refundedAt,
        refundAmount: user.refundAmount ? parseFloat(user.refundAmount) : null
      }
    };
  }
  /**
   * Suspende um usuário por violação de políticas
   */
  async suspendUser(userId, violationType, reason, adminId, evidence, refundAmount) {
    const now = /* @__PURE__ */ new Date();
    await db.update(users).set({
      suspendedAt: now,
      suspensionReason: reason,
      suspensionType: violationType,
      refundedAt: refundAmount ? now : null,
      refundAmount: refundAmount ? refundAmount.toString() : null,
      updatedAt: now
    }).where(eq(users.id, userId));
    await db.execute(sql`
      INSERT INTO policy_violations (user_id, violation_type, description, status, resulted_in_suspension, admin_id, evidence, internal_notes)
      VALUES (${userId}, ${violationType}, ${reason}, 'confirmed', true, ${adminId || null}, ${JSON.stringify(evidence || [])}, ${"Suspens\xE3o aplicada em " + now.toISOString()})
    `);
    const [agentConfig] = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, userId));
    if (agentConfig) {
      await db.update(aiAgentConfig).set({ isActive: false }).where(eq(aiAgentConfig.userId, userId));
    }
    console.log(`\u{1F6AB} [SUSPENSION] Usu\xE1rio ${userId} suspenso por ${violationType}: ${reason}`);
  }
  /**
   * Obtém todos os usuários suspensos (para admin)
   */
  async getSuspendedUsers() {
    const result = await db.execute(sql`
      SELECT 
        u.id,
        u.email,
        u.name,
        u.phone,
        u.suspended_at as "suspendedAt",
        u.suspension_reason as "suspensionReason",
        u.suspension_type as "suspensionType",
        u.refunded_at as "refundedAt",
        u.refund_amount as "refundAmount",
        pv.description as "violationDescription",
        pv.evidence,
        pv.created_at as "violationDate"
      FROM users u
      LEFT JOIN policy_violations pv ON pv.user_id = u.id AND pv.resulted_in_suspension = true
      WHERE u.suspended_at IS NOT NULL
      ORDER BY u.suspended_at DESC
    `);
    return result.rows;
  }
  /**
   * Remove suspensão de um usuário (para admin reverter se necessário)
   */
  async unsuspendUser(userId, adminNote) {
    await db.update(users).set({
      suspendedAt: null,
      suspensionReason: null,
      suspensionType: null,
      updatedAt: /* @__PURE__ */ new Date()
    }).where(eq(users.id, userId));
    const revertNote = `
Revertido: ${adminNote || "Sem motivo especificado"} em ${(/* @__PURE__ */ new Date()).toISOString()}`;
    await db.execute(sql`
      UPDATE policy_violations
      SET status = 'dismissed', 
          internal_notes = COALESCE(internal_notes, '') || ${revertNote},
          updated_at = now()
      WHERE user_id = ${userId} AND resulted_in_suspension = true
    `);
    console.log(`\u2705 [SUSPENSION] Suspens\xE3o removida do usu\xE1rio ${userId}`);
  }
  // ==================== TEAM MEMBERS ====================
  /**
   * Buscar todos os membros de um dono
   */
  async getTeamMembers(ownerId) {
    return await db.select().from(teamMembers).where(eq(teamMembers.ownerId, ownerId)).orderBy(desc(teamMembers.createdAt));
  }
  /**
   * Buscar membro por ID
   */
  async getTeamMember(id) {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.id, id));
    return member;
  }
  /**
   * Buscar membro por email (dentro do mesmo dono)
   */
  async getTeamMemberByEmail(ownerId, email) {
    const [member] = await db.select().from(teamMembers).where(and(eq(teamMembers.ownerId, ownerId), eq(teamMembers.email, email)));
    return member;
  }
  /**
   * Buscar membro por email (global - para login)
   */
  async getTeamMemberByEmailGlobal(email) {
    const [member] = await db.select().from(teamMembers).where(eq(teamMembers.email, email));
    return member;
  }
  /**
   * Criar novo membro
   */
  async createTeamMember(data) {
    const [member] = await db.insert(teamMembers).values({
      ...data,
      createdAt: /* @__PURE__ */ new Date(),
      updatedAt: /* @__PURE__ */ new Date()
    }).returning();
    return member;
  }
  /**
   * Atualizar membro
   */
  async updateTeamMember(id, data) {
    const [member] = await db.update(teamMembers).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(teamMembers.id, id)).returning();
    return member;
  }
  /**
   * Excluir membro
   */
  async deleteTeamMember(id) {
    await db.delete(teamMemberSessions).where(eq(teamMemberSessions.memberId, id));
    await db.delete(teamMembers).where(eq(teamMembers.id, id));
  }
  // ==================== TEAM MEMBER SESSIONS ====================
  /**
   * Criar sessão de membro
   */
  async createTeamMemberSession(data) {
    const [session2] = await db.insert(teamMemberSessions).values({
      ...data,
      createdAt: /* @__PURE__ */ new Date()
    }).returning();
    return session2;
  }
  /**
   * Buscar sessão por token
   */
  async getTeamMemberSession(token) {
    const [session2] = await db.select().from(teamMemberSessions).where(eq(teamMemberSessions.token, token));
    return session2;
  }
  /**
   * Deletar sessão por token
   */
  async deleteTeamMemberSession(token) {
    await db.delete(teamMemberSessions).where(eq(teamMemberSessions.token, token));
  }
  /**
   * Limpar sessões expiradas
   */
  async cleanExpiredTeamMemberSessions() {
    await db.delete(teamMemberSessions).where(lte(teamMemberSessions.expiresAt, /* @__PURE__ */ new Date()));
  }
  // ==================== AUDIO CONFIG (TTS) ====================
  /**
   * Buscar configuração de áudio do usuário
   */
  async getAudioConfig(userId) {
    const [config] = await db.select().from(audioConfig).where(eq(audioConfig.userId, userId));
    return config;
  }
  /**
   * Criar configuração de áudio padrão
   * NOTA: Por padrão, TTS começa DESATIVADO - usuário precisa ativar manualmente via toggle
   */
  async createAudioConfig(userId) {
    const [config] = await db.insert(audioConfig).values({
      userId,
      isEnabled: false,
      // DESATIVADO por padrão - ativar via toggle
      voiceType: "female",
      speed: "1.00"
    }).returning();
    return config;
  }
  /**
   * Atualizar configuração de áudio
   */
  async updateAudioConfig(userId, data) {
    const existing = await this.getAudioConfig(userId);
    if (!existing) {
      const [config2] = await db.insert(audioConfig).values({
        userId,
        isEnabled: data.isEnabled ?? false,
        // DESATIVADO por padrão
        voiceType: data.voiceType ?? "female",
        speed: data.speed ?? "1.00"
      }).returning();
      return config2;
    }
    const [config] = await db.update(audioConfig).set({ ...data, updatedAt: /* @__PURE__ */ new Date() }).where(eq(audioConfig.userId, userId)).returning();
    return config;
  }
  /**
   * Buscar contador de mensagens de áudio do dia
   */
  async getAudioMessageCounter(userId) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    const [counter] = await db.select().from(audioMessageCounter).where(and(eq(audioMessageCounter.userId, userId), eq(audioMessageCounter.date, today)));
    return counter;
  }
  /**
   * Incrementar contador de mensagens de áudio
   * Retorna o novo contador ou undefined se limite atingido
   */
  async incrementAudioMessageCounter(userId) {
    const today = (/* @__PURE__ */ new Date()).toISOString().split("T")[0];
    let counter = await this.getAudioMessageCounter(userId);
    if (!counter) {
      const [newCounter] = await db.insert(audioMessageCounter).values({
        userId,
        date: today,
        count: 1,
        dailyLimit: 30
      }).returning();
      return { count: 1, limit: 30, canSend: true };
    }
    if (counter.count >= counter.dailyLimit) {
      return { count: counter.count, limit: counter.dailyLimit, canSend: false };
    }
    const [updated] = await db.update(audioMessageCounter).set({ count: counter.count + 1, updatedAt: /* @__PURE__ */ new Date() }).where(eq(audioMessageCounter.id, counter.id)).returning();
    return { count: updated.count, limit: updated.dailyLimit, canSend: true };
  }
  /**
   * Verificar se usuário pode enviar mais áudios hoje
   */
  async canSendAudio(userId) {
    const config = await this.getAudioConfig(userId);
    if (!config) {
      await this.createAudioConfig(userId);
    }
    if (config && !config.isEnabled) {
      return { canSend: false, remaining: 0, limit: 30 };
    }
    const counter = await this.getAudioMessageCounter(userId);
    if (!counter) {
      return { canSend: true, remaining: 30, limit: 30 };
    }
    const remaining = Math.max(0, counter.dailyLimit - counter.count);
    return { canSend: remaining > 0, remaining, limit: counter.dailyLimit };
  }
  // ========================================================================
  // Admin Notification operations
  // ========================================================================
  async getAdminNotificationConfig(adminId) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_notification_config WHERE admin_id = ${adminId} LIMIT 1
      `);
      return result.rows[0];
    } catch (error) {
      console.error("Error getting admin notification config:", error);
      return void 0;
    }
  }
  async updateAdminNotificationConfig(adminId, data) {
    try {
      const existing = await this.getAdminNotificationConfig(adminId);
      const paymentDays = data.paymentReminderDaysBefore || [7, 3, 1];
      const overdueDays = data.overdueReminderDaysAfter || [1, 3, 7, 14];
      const businessDays = data.businessDays || [1, 2, 3, 4, 5];
      let welcomeVariationsArray = [];
      if (Array.isArray(data.welcomeMessageVariations)) {
        welcomeVariationsArray = data.welcomeMessageVariations.map(
          (v) => typeof v === "string" ? v : String(v)
        ).filter((v) => v && v.trim());
      }
      const welcomeVariationsSQL = welcomeVariationsArray.length > 0 ? `ARRAY[${welcomeVariationsArray.map((v) => `'${v.replace(/'/g, "''")}'`).join(",")}]::text[]` : `ARRAY[]::text[]`;
      if (!existing) {
        await db.execute(sql`
          INSERT INTO admin_notification_config (
            admin_id, 
            payment_reminder_enabled, 
            payment_reminder_days_before,
            payment_reminder_message_template,
            payment_reminder_ai_enabled,
            payment_reminder_ai_prompt,
            overdue_reminder_enabled,
            overdue_reminder_days_after,
            overdue_reminder_message_template,
            overdue_reminder_ai_enabled,
            overdue_reminder_ai_prompt,
            periodic_checkin_enabled,
            periodic_checkin_min_days,
            periodic_checkin_max_days,
            periodic_checkin_message_template,
            checkin_ai_enabled,
            checkin_ai_prompt,
            broadcast_enabled,
            broadcast_antibot_variation,
            broadcast_ai_variation,
            broadcast_min_interval_seconds,
            broadcast_max_interval_seconds,
            disconnected_alert_enabled,
            disconnected_alert_hours,
            disconnected_alert_message_template,
            disconnected_ai_enabled,
            disconnected_ai_prompt,
            ai_variation_enabled,
            ai_variation_prompt,
            business_hours_start,
            business_hours_end,
            business_days,
            respect_business_hours,
            welcome_message_enabled,
            welcome_message_variations,
            welcome_message_ai_enabled,
            welcome_message_ai_prompt
          ) VALUES (
            ${adminId},
            ${data.paymentReminderEnabled ?? true},
            ARRAY[${sql.raw(paymentDays.join(","))}]::integer[],
            ${data.paymentReminderMessageTemplate || ""},
            ${data.paymentReminderAiEnabled ?? true},
            ${data.paymentReminderAiPrompt || "Reescreva esta mensagem de lembrete de pagamento de forma natural e personalizada."},
            ${data.overdueReminderEnabled ?? true},
            ARRAY[${sql.raw(overdueDays.join(","))}]::integer[],
            ${data.overdueReminderMessageTemplate || ""},
            ${data.overdueReminderAiEnabled ?? true},
            ${data.overdueReminderAiPrompt || "Reescreva esta mensagem de cobran\xE7a de forma educada e emp\xE1tica."},
            ${data.periodicCheckinEnabled ?? true},
            ${data.periodicCheckinMinDays ?? 7},
            ${data.periodicCheckinMaxDays ?? 15},
            ${data.periodicCheckinMessageTemplate || ""},
            ${data.checkinAiEnabled ?? true},
            ${data.checkinAiPrompt || "Reescreva esta mensagem de check-in de forma calorosa e natural."},
            ${data.broadcastEnabled ?? true},
            ${data.broadcastAntibotVariation ?? true},
            ${data.broadcastAiVariation ?? true},
            ${data.broadcastMinIntervalSeconds ?? 3},
            ${data.broadcastMaxIntervalSeconds ?? 10},
            ${data.disconnectedAlertEnabled ?? true},
            ${data.disconnectedAlertHours ?? 2},
            ${data.disconnectedAlertMessageTemplate || ""},
            ${data.disconnectedAiEnabled ?? true},
            ${data.disconnectedAiPrompt || "Reescreva esta mensagem de alerta de desconex\xE3o de forma prestativa e profissional."},
            ${data.aiVariationEnabled ?? true},
            ${data.aiVariationPrompt || ""},
            ${data.businessHoursStart || "09:00"},
            ${data.businessHoursEnd || "18:00"},
            ARRAY[${sql.raw(businessDays.join(","))}]::integer[],
            ${data.respectBusinessHours ?? true},
            ${data.welcomeMessageEnabled ?? true},
            ${sql.raw(welcomeVariationsSQL)},
            ${data.welcomeMessageAiEnabled ?? true},
            ${data.welcomeMessageAiPrompt || "Gere uma mensagem de boas-vindas calorosa e profissional para um cliente que acabou de iniciar uma conversa no WhatsApp. Use o nome do cliente se dispon\xEDvel. Seja breve, amig\xE1vel e mostre disposi\xE7\xE3o para ajudar."}
          )
        `);
      } else {
        await db.execute(sql`
          UPDATE admin_notification_config SET
            payment_reminder_enabled = ${data.paymentReminderEnabled},
            payment_reminder_days_before = ARRAY[${sql.raw(paymentDays.join(","))}]::integer[],
            payment_reminder_message_template = ${data.paymentReminderMessageTemplate},
            payment_reminder_ai_enabled = ${data.paymentReminderAiEnabled ?? true},
            payment_reminder_ai_prompt = ${data.paymentReminderAiPrompt || ""},
            overdue_reminder_enabled = ${data.overdueReminderEnabled},
            overdue_reminder_days_after = ARRAY[${sql.raw(overdueDays.join(","))}]::integer[],
            overdue_reminder_message_template = ${data.overdueReminderMessageTemplate},
            overdue_reminder_ai_enabled = ${data.overdueReminderAiEnabled ?? true},
            overdue_reminder_ai_prompt = ${data.overdueReminderAiPrompt || ""},
            periodic_checkin_enabled = ${data.periodicCheckinEnabled},
            periodic_checkin_min_days = ${data.periodicCheckinMinDays},
            periodic_checkin_max_days = ${data.periodicCheckinMaxDays},
            periodic_checkin_message_template = ${data.periodicCheckinMessageTemplate},
            checkin_ai_enabled = ${data.checkinAiEnabled ?? true},
            checkin_ai_prompt = ${data.checkinAiPrompt || ""},
            broadcast_enabled = ${data.broadcastEnabled},
            broadcast_antibot_variation = ${data.broadcastAntibotVariation},
            broadcast_ai_variation = ${data.broadcastAiVariation},
            broadcast_min_interval_seconds = ${data.broadcastMinIntervalSeconds},
            broadcast_max_interval_seconds = ${data.broadcastMaxIntervalSeconds},
            disconnected_alert_enabled = ${data.disconnectedAlertEnabled},
            disconnected_alert_hours = ${data.disconnectedAlertHours},
            disconnected_alert_message_template = ${data.disconnectedAlertMessageTemplate},
            disconnected_ai_enabled = ${data.disconnectedAiEnabled ?? true},
            disconnected_ai_prompt = ${data.disconnectedAiPrompt || ""},
            ai_variation_enabled = ${data.aiVariationEnabled},
            ai_variation_prompt = ${data.aiVariationPrompt},
            business_hours_start = ${data.businessHoursStart},
            business_hours_end = ${data.businessHoursEnd},
            business_days = ARRAY[${sql.raw(businessDays.join(","))}]::integer[],
            respect_business_hours = ${data.respectBusinessHours},
            welcome_message_enabled = ${data.welcomeMessageEnabled},
            welcome_message_variations = ${sql.raw(welcomeVariationsSQL)},
            welcome_message_ai_enabled = ${data.welcomeMessageAiEnabled},
            welcome_message_ai_prompt = ${data.welcomeMessageAiPrompt},
            updated_at = now()
          WHERE admin_id = ${adminId}
        `);
      }
    } catch (error) {
      console.error("Error updating admin notification config:", error);
      throw error;
    }
  }
  async getAdminBroadcasts(adminId) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcasts 
        WHERE admin_id = ${adminId}
        ORDER BY created_at DESC
        LIMIT 50
      `);
      return result.rows;
    } catch (error) {
      console.error("Error getting admin broadcasts:", error);
      return [];
    }
  }
  async getAdminBroadcast(adminId, id) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcasts 
        WHERE admin_id = ${adminId} AND id = ${id}
        LIMIT 1
      `);
      return result.rows[0];
    } catch (error) {
      console.error("Error getting admin broadcast:", error);
      return void 0;
    }
  }
  async createAdminBroadcast(data) {
    try {
      const id = `broadcast_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_broadcasts (
          id, admin_id, name, message_template, target_type, 
          target_filter, ai_variation, antibot_enabled, status,
          total_recipients, sent_count, failed_count
        ) VALUES (
          ${id}, ${data.adminId}, ${data.name}, ${data.messageTemplate},
          ${data.targetType}, ${JSON.stringify(data.targetFilter || {})},
          ${data.aiVariation}, ${data.antibotEnabled}, ${data.status},
          ${data.totalRecipients}, ${data.sentCount}, ${data.failedCount}
        )
      `);
      return id;
    } catch (error) {
      console.error("Error creating admin broadcast:", error);
      throw error;
    }
  }
  async updateAdminBroadcast(adminId, id, data) {
    try {
      if (data.status !== void 0 && data.completedAt !== void 0) {
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          sent_count = ${data.sentCount ?? 0}, 
          failed_count = ${data.failedCount ?? 0}, 
          completed_at = ${data.completedAt}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.status !== void 0 && data.startedAt !== void 0) {
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          started_at = ${data.startedAt}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.status !== void 0) {
        await db.execute(sql`UPDATE admin_broadcasts SET 
          status = ${data.status}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      } else if (data.sentCount !== void 0 || data.failedCount !== void 0) {
        await db.execute(sql`UPDATE admin_broadcasts SET 
          sent_count = ${data.sentCount ?? 0}, 
          failed_count = ${data.failedCount ?? 0}, 
          updated_at = now() 
          WHERE admin_id = ${adminId} AND id = ${id}`);
      }
    } catch (error) {
      console.error("Error updating admin broadcast:", error);
      throw error;
    }
  }
  async cancelAdminBroadcast(adminId, id) {
    try {
      await db.execute(sql`
        UPDATE admin_broadcasts 
        SET status = 'cancelled', updated_at = now()
        WHERE admin_id = ${adminId} AND id = ${id}
      `);
    } catch (error) {
      console.error("Error cancelling admin broadcast:", error);
      throw error;
    }
  }
  async createAdminNotificationLog(data) {
    try {
      const id = `log_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_notification_logs (
          id, admin_id, user_id, notification_type,
          recipient_phone, recipient_name, message_sent,
          message_original, status, metadata
        ) VALUES (
          ${id}, ${data.adminId}, ${data.userId}, ${data.notificationType},
          ${data.recipientPhone}, ${data.recipientName}, ${data.messageSent},
          ${data.messageOriginal}, ${data.status || "pending"},
          ${JSON.stringify(data.metadata || {})}
        )
      `);
      return id;
    } catch (error) {
      console.error("Error creating admin notification log:", error);
      throw error;
    }
  }
  // ============================================================
  // BROADCAST MESSAGE LOGS
  // ============================================================
  async ensureBroadcastMessagesTable() {
    try {
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS admin_broadcast_messages (
          id TEXT PRIMARY KEY,
          broadcast_id TEXT NOT NULL,
          admin_id TEXT NOT NULL,
          user_id TEXT,
          recipient_phone TEXT NOT NULL,
          recipient_name TEXT NOT NULL DEFAULT 'Cliente',
          message_original TEXT,
          message_sent TEXT NOT NULL,
          ai_varied BOOLEAN DEFAULT false,
          status TEXT DEFAULT 'sent',
          error_message TEXT,
          sent_at TIMESTAMP DEFAULT now()
        )
      `);
      await db.execute(sql`
        CREATE INDEX IF NOT EXISTS idx_broadcast_messages_broadcast_id 
        ON admin_broadcast_messages(broadcast_id)
      `);
      console.log("\u2705 [DB] Tabela admin_broadcast_messages garantida");
    } catch (error) {
      console.error("Error ensuring broadcast_messages table:", error);
    }
  }
  async createBroadcastMessage(data) {
    try {
      const id = `bm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      await db.execute(sql`
        INSERT INTO admin_broadcast_messages (
          id, broadcast_id, admin_id, user_id,
          recipient_phone, recipient_name,
          message_original, message_sent,
          ai_varied, status, error_message, sent_at
        ) VALUES (
          ${id}, ${data.broadcastId}, ${data.adminId}, ${data.userId || null},
          ${data.recipientPhone}, ${data.recipientName},
          ${data.messageOriginal}, ${data.messageSent},
          ${data.aiVaried}, ${data.status}, ${data.errorMessage || null}, now()
        )
      `);
      return id;
    } catch (error) {
      console.error("Error creating broadcast message log:", error);
      return "";
    }
  }
  async getBroadcastMessages(broadcastId) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM admin_broadcast_messages 
        WHERE broadcast_id = ${broadcastId}
        ORDER BY sent_at ASC
      `);
      return result.rows || [];
    } catch (error) {
      console.error("Error getting broadcast messages:", error);
      return [];
    }
  }
  // ============================================================
  // FOLLOW-UP PARA NÃO PAGANTES
  // ============================================================
  /**
   * Busca configuração de follow-up para não pagantes
   */
  async getNotapayerFollowupConfig() {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_configs WHERE id = 1 LIMIT 1
      `);
      return result.rows[0];
    } catch (error) {
      console.error("Error getting notapayer followup config:", error);
      return null;
    }
  }
  /**
   * Atualiza configuração de follow-up para não pagantes
   */
  async updateNotapayerFollowupConfig(data) {
    try {
      const existing = await this.getNotapayerFollowupConfig();
      if (!existing) {
        await db.execute(sql`
          INSERT INTO followup_configs (
            id, is_enabled, active_days, max_attempts,
            message_template, tone, use_emojis, active_days_start, active_days_end
          ) VALUES (
            1, ${data.isEnabled ?? false}, ${data.activeDays ?? 3}, ${data.maxAttempts ?? 3},
            ${data.messageTemplate ?? "Ol\xE1! Seu plano expirou. Quer renovar?"}, ${data.tone ?? "friendly"},
            ${data.useEmojis ?? true}, ${data.activeDaysStart ?? 1}, ${data.activeDaysEnd ?? 7}
          )
        `);
        return data;
      }
      await db.execute(sql`
        UPDATE followup_configs SET
          is_enabled = ${data.isEnabled ?? existing.is_enabled},
          active_days = ${data.activeDays ?? existing.active_days},
          max_attempts = ${data.maxAttempts ?? existing.max_attempts},
          message_template = ${data.messageTemplate ?? existing.message_template},
          tone = ${data.tone ?? existing.tone},
          use_emojis = ${data.useEmojis ?? existing.use_emojis},
          active_days_start = ${data.activeDaysStart ?? existing.active_days_start},
          active_days_end = ${data.activeDaysEnd ?? existing.active_days_end},
          updated_at = NOW()
        WHERE id = 1
      `);
      return data;
    } catch (error) {
      console.error("Error updating notapayer followup config:", error);
      throw error;
    }
  }
  /**
   * Busca tentativas de follow-up para um usuário
   */
  async getNotapayerFollowupAttempts(userId) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_attempts
        WHERE user_id = ${userId}
        ORDER BY sent_at DESC
        LIMIT 20
      `);
      return result.rows || [];
    } catch (error) {
      console.error("Error getting notapayer followup attempts:", error);
      return [];
    }
  }
  /**
   * Busca histórico completo de follow-ups
   */
  async getNotapayerFollowupHistory(limit = 100) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_attempts
        ORDER BY sent_at DESC
        LIMIT ${limit}
      `);
      return result.rows || [];
    } catch (error) {
      console.error("Error getting notapayer followup history:", error);
      return [];
    }
  }
  /**
   * Cria registro de tentativa de follow-up
   */
  async createNotapayerFollowupAttempt(data) {
    try {
      await db.execute(sql`
        INSERT INTO followup_attempts (user_id, subscription_id, message, sent_at, status)
        VALUES (${data.userId}, ${data.subscriptionId}, ${data.message}, ${data.sentAt.toISOString()}, ${data.status})
      `);
    } catch (error) {
      console.error("Error creating notapayer followup attempt:", error);
    }
  }
  /**
   * Lista não pagantes elegíveis para follow-up
   */
  async getNotapayerFollowupList(config) {
    try {
      const now = /* @__PURE__ */ new Date();
      const activeDaysStart = config.active_days_start || 1;
      const activeDaysEnd = config.active_days_end || 7;
      const result = await db.execute(sql`
        SELECT
          s.id as subscription_id,
          s.user_id,
          u.name as user_name,
          u.email as user_email,
          u.whatsapp_number as phone,
          p.name as plan_name,
          p.price as plan_price,
          s.expires_at as expires_at,
          s.cancelled_at as cancelled_at
        FROM subscriptions s
        JOIN users u ON u.id = s.user_id
        JOIN plans p ON p.id = s.plan_id
        WHERE s.cancelled_at IS NULL
          AND s.expires_at <= ${now}
          AND s.status = 'expired'
        ORDER BY s.expires_at DESC
      `);
      const subscriptions2 = result.rows || [];
      const eligible = subscriptions2.filter((sub) => {
        const daysSinceExpiry = Math.floor(
          (now.getTime() - new Date(sub.expires_at).getTime()) / (1e3 * 60 * 60 * 24)
        );
        return daysSinceExpiry >= activeDaysStart && daysSinceExpiry <= activeDaysEnd;
      });
      return await Promise.all(
        eligible.map(async (sub) => {
          const attempts = await this.getNotapayerFollowupAttempts(sub.user_id);
          return {
            ...sub,
            daysSinceExpiry: Math.floor(
              (now.getTime() - new Date(sub.expires_at).getTime()) / (1e3 * 60 * 60 * 24)
            ),
            attempts: attempts.length,
            lastAttempt: attempts[0]
          };
        })
      );
    } catch (error) {
      console.error("Error getting notapayer followup list:", error);
      return [];
    }
  }
  // ============================================================
  // FOLLOW-UP CONFIGURATION (GLOBAL)
  // ============================================================
  /**
   * Get global follow-up configuration
   * GET /api/followup/config
   */
  async getFollowupConfig() {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_configs WHERE id = 'global'
      `);
      if (result.rows && result.rows.length > 0) {
        return result.rows[0];
      }
      return null;
    } catch (error) {
      console.error("Error getting followup config:", error);
      return null;
    }
  }
  /**
   * Update global follow-up configuration
   * PUT /api/followup/config
   */
  async updateFollowupConfig(data) {
    try {
      const existing = await this.getFollowupConfig();
      if (!existing) {
        await db.execute(sql`
          INSERT INTO followup_configs (
            id, is_enabled, max_attempts, intervals_minutes,
            infinite_loop, infinite_loop_min_days, infinite_loop_max_days,
            respect_business_hours, business_hours_start, business_hours_end,
            business_days, use_emojis, tone
          ) VALUES (
            'global', ${data.isEnabled ?? true}, ${data.maxAttempts ?? 8},
            ${JSON.stringify(data.intervalsMinutes ?? [10, 30, 180, 1440])},
            ${data.infiniteLoop ?? true}, ${data.infiniteLoopMinDays ?? 15}, ${data.infiniteLoopMaxDays ?? 30},
            ${data.respectBusinessHours ?? true}, ${data.businessHoursStart ?? "09:00"}, ${data.businessHoursEnd ?? "18:00"},
            ${JSON.stringify(data.businessDays ?? [1, 2, 3, 4, 5])},
            ${data.useEmojis ?? true}, ${data.tone ?? "friendly"}
          )
        `);
        return data;
      }
      await db.execute(sql`
        UPDATE followup_configs SET
          is_enabled = ${data.isEnabled ?? existing.is_enabled},
          max_attempts = ${data.maxAttempts ?? existing.max_attempts},
          intervals_minutes = ${JSON.stringify(data.intervalsMinutes ?? existing.intervals_minutes)},
          infinite_loop = ${data.infiniteLoop ?? existing.infinite_loop},
          infinite_loop_min_days = ${data.infiniteLoopMinDays ?? existing.infinite_loop_min_days},
          infinite_loop_max_days = ${data.infiniteLoopMaxDays ?? existing.infinite_loop_max_days},
          respect_business_hours = ${data.respectBusinessHours ?? existing.respect_business_hours},
          business_hours_start = ${data.businessHoursStart ?? existing.business_hours_start},
          business_hours_end = ${data.businessHoursEnd ?? existing.business_hours_end},
          business_days = ${JSON.stringify(data.businessDays ?? existing.business_days)},
          use_emojis = ${data.useEmojis ?? existing.use_emojis},
          tone = ${data.tone ?? existing.tone},
          updated_at = NOW()
        WHERE id = 'global'
      `);
      return data;
    } catch (error) {
      console.error("Error updating followup config:", error);
      throw error;
    }
  }
  /**
   * Get follow-up history logs
   * GET /api/followup/logs
   */
  async getFollowupLogs(limit = 100) {
    try {
      const result = await db.execute(sql`
        SELECT * FROM followup_logs
        ORDER BY executed_at DESC
        LIMIT ${limit}
      `);
      return result.rows || [];
    } catch (error) {
      console.error("Error getting followup logs:", error);
      return [];
    }
  }
  /**
   * Get follow-up pending events
   * GET /api/followup/pending
   */
  async getFollowupPendingEvents() {
    try {
      const result = await db.execute(sql`
        SELECT
          a.id,
          a.contact_number,
          a.contact_name,
          a.followup_stage,
          a.next_followup_at,
          a.followup_active
        FROM admin_conversations a
        WHERE a.followup_active = true
          AND a.next_followup_at <= NOW()
        ORDER BY a.next_followup_at ASC
        LIMIT 50
      `);
      return result.rows || [];
    } catch (error) {
      console.error("Error getting followup pending events:", error);
      return [];
    }
  }
  /**
   * Get follow-up statistics
   * GET /api/followup/stats
   */
  async getFollowupStats() {
    try {
      const now = /* @__PURE__ */ new Date();
      const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1e3);
      const result = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'sent') as total_sent,
          COUNT(*) FILTER (WHERE status = 'failed') as total_failed,
          COUNT(*) FILTER (WHERE status = 'cancelled') as total_cancelled,
          COUNT(*) FILTER (WHERE status = 'skipped') as total_skipped,
          COUNT(*) FILTER (WHERE status = 'pending') as pending,
          COUNT(*) FILTER (WHERE DATE(executed_at) = CURRENT_DATE) as scheduled_today
        FROM followup_logs
        WHERE executed_at >= ${oneDayAgo.toISOString()}
      `);
      const row = result.rows[0];
      return {
        totalSent: row.total_sent || 0,
        totalFailed: row.total_failed || 0,
        totalCancelled: row.total_cancelled || 0,
        totalSkipped: row.total_skipped || 0,
        pending: row.pending || 0,
        scheduledToday: row.scheduled_today || 0
      };
    } catch (error) {
      console.error("Error getting followup stats:", error);
      return {
        totalSent: 0,
        totalFailed: 0,
        totalCancelled: 0,
        totalSkipped: 0,
        pending: 0,
        scheduledToday: 0
      };
    }
  }
  // ============================================================
  // PENDING AI RESPONSES - Persistent Timers
  // ============================================================
  async savePendingAIResponse(data) {
    try {
      await db.execute(sql`
        INSERT INTO pending_ai_responses (
          conversation_id, user_id, contact_number, jid_suffix,
          messages, scheduled_at, execute_at, status
        ) VALUES (
          ${data.conversationId}, ${data.userId}, ${data.contactNumber}, ${data.jidSuffix},
          ${JSON.stringify(data.messages)}, NOW(), ${data.executeAt.toISOString()}, 'pending'
        )
        ON CONFLICT (conversation_id) DO UPDATE SET
          messages = ${JSON.stringify(data.messages)},
          execute_at = ${data.executeAt.toISOString()},
          status = 'pending',
          updated_at = NOW()
      `);
      console.log(`\u{1F4BE} [PERSISTENT TIMER] Salvo para ${data.contactNumber} - executa \xE0s ${data.executeAt.toISOString()}`);
    } catch (error) {
      console.error("Error saving pending AI response:", error);
      throw error;
    }
  }
  async getPendingAIResponse(conversationId) {
    try {
      const result = await db.execute(sql`
        SELECT id, conversation_id, user_id, contact_number, jid_suffix,
               messages, execute_at, status
        FROM pending_ai_responses
        WHERE conversation_id = ${conversationId} AND status = 'pending'
      `);
      if (result.rows && result.rows.length > 0) {
        const row = result.rows[0];
        return {
          id: row.id,
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix,
          messages: typeof row.messages === "string" ? JSON.parse(row.messages) : row.messages,
          executeAt: new Date(row.execute_at),
          status: row.status
        };
      }
      return null;
    } catch (error) {
      console.error("Error getting pending AI response:", error);
      return null;
    }
  }
  async updatePendingAIResponseMessages(conversationId, messages2, executeAt) {
    try {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET messages = ${JSON.stringify(messages2)},
            execute_at = ${executeAt.toISOString()},
            updated_at = NOW()
        WHERE conversation_id = ${conversationId} AND status = 'pending'
      `);
      console.log(`\u{1F4DD} [PERSISTENT TIMER] Atualizado para conversation ${conversationId} - ${messages2.length} msgs`);
    } catch (error) {
      console.error("Error updating pending AI response messages:", error);
      throw error;
    }
  }
  async deletePendingAIResponse(conversationId) {
    try {
      await db.execute(sql`
        DELETE FROM pending_ai_responses
        WHERE conversation_id = ${conversationId}
      `);
      console.log(`\u{1F5D1}\uFE0F [PERSISTENT TIMER] Removido para conversation ${conversationId}`);
    } catch (error) {
      console.error("Error deleting pending AI response:", error);
    }
  }
  async getPendingAIResponsesForRestore() {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.id,
          p.conversation_id,
          p.user_id,
          c.connection_id,
          p.contact_number,
          p.jid_suffix,
          p.messages,
          p.execute_at,
          p.scheduled_at
        FROM pending_ai_responses p
        LEFT JOIN conversations c ON c.id = p.conversation_id
        WHERE p.status = 'pending'
        ORDER BY p.execute_at ASC
        LIMIT 200
      `);
      if (result.rows && result.rows.length > 0) {
        return result.rows.map((row) => ({
          id: row.id,
          conversationId: row.conversation_id,
          userId: row.user_id,
          connectionId: row.connection_id || void 0,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix,
          messages: typeof row.messages === "string" ? JSON.parse(row.messages) : row.messages,
          executeAt: new Date(row.execute_at),
          scheduledAt: new Date(row.scheduled_at)
        }));
      }
      return [];
    } catch (error) {
      console.error("Error getting pending AI responses for restore:", error);
      return [];
    }
  }
  async markPendingAIResponseCompleted(conversationId) {
    try {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'completed',
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
      `);
    } catch (error) {
      console.error("Error marking pending AI response as completed:", error);
    }
  }
  async markPendingAIResponseFailed(conversationId, reason, lastError) {
    try {
      console.log(`\u26A0\uFE0F [DB] Marcando timer como FAILED: ${conversationId} - Raz\xE3o: ${reason}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'failed',
            failure_reason = ${reason},
            last_error = ${lastError || null},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
      `);
    } catch (error) {
      console.error("Error marking pending AI response as failed:", error);
    }
  }
  async markPendingAIResponseSkipped(conversationId, reason) {
    const markAsCompletedFallback = async () => {
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'completed',
            failure_reason = ${`skipped:${reason}`},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
      `);
    };
    try {
      if (this.pendingAiSkippedUnsupported) {
        await markAsCompletedFallback();
        return;
      }
      console.log(`\u23ED\uFE0F [DB] Marcando timer como SKIPPED: ${conversationId} - Raz\xE3o: ${reason}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'skipped',
            failure_reason = ${reason},
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
      `);
    } catch (error) {
      if (isPendingAiSkippedConstraintError(error)) {
        this.pendingAiSkippedUnsupported = true;
        const errorCode = getDbErrorCode(error) || "unknown";
        const constraint = getDbConstraintName(error) || "unknown";
        console.warn(`\u26A0\uFE0F [DB] status='skipped' n\xE3o permitido (code=${errorCode}, constraint=${constraint}). Convertendo para completed (conversation=${conversationId}, reason=${reason}).`);
        try {
          await markAsCompletedFallback();
          return;
        } catch (fallbackError) {
          console.error("Error marking pending AI response as completed fallback:", fallbackError);
          return;
        }
      }
      console.error("Error marking pending AI response as skipped:", error);
    }
  }
  async resetPendingAIResponseForRetry(conversationId, delaySec = 30) {
    try {
      console.log(`\u{1F504} [DB] Resetando timer para retry em ${delaySec}s: ${conversationId}`);
      await db.execute(sql`
        UPDATE pending_ai_responses
        SET status = 'pending',
            scheduled_at = NOW(),
            execute_at = NOW() + (${delaySec} || ' seconds')::interval,
            retry_count = COALESCE(retry_count, 0) + 1,
            last_attempt_at = NOW(),
            updated_at = NOW()
        WHERE conversation_id = ${conversationId}
      `);
    } catch (error) {
      console.error("Error resetting pending AI response for retry:", error);
    }
  }
  // 🔄 AUTO-RECUPERAÇÃO: Busca timers "failed" com razões transitórias que podem ser retentados
  async getFailedTransientTimers() {
    try {
      const result = await db.execute(sql`
        SELECT p.conversation_id, p.user_id, p.contact_number, p.jid_suffix, p.messages,
               p.failure_reason, COALESCE(p.retry_count, 0) as retry_count
        FROM pending_ai_responses p
        INNER JOIN whatsapp_connections c ON c.user_id = p.user_id::text
          AND c.is_connected = true AND c.ai_enabled = true
        WHERE p.status = 'failed'
          AND p.updated_at > NOW() - INTERVAL '2 hours'
          AND (
            p.failure_reason LIKE 'connection_closed_max_retries_%'
            OR p.failure_reason LIKE 'send_failed_max_retries_%'
            OR p.failure_reason = 'session_unavailable_offline'
          )
          AND COALESCE(p.retry_count, 0) < 20
        ORDER BY p.updated_at ASC
        LIMIT 15
      `);
      if (result.rows && result.rows.length > 0) {
        return result.rows.map((row) => ({
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix || "s.whatsapp.net",
          messages: typeof row.messages === "string" ? JSON.parse(row.messages) : row.messages || [],
          failureReason: row.failure_reason,
          retryCount: Number(row.retry_count) || 0
        }));
      }
      return [];
    } catch (error) {
      console.error("Error getting failed transient timers:", error);
      return [];
    }
  }
  // 🚨 AUTO-RECUPERAÇÃO: Busca timers "completed" que na verdade não receberam resposta
  // Isso captura casos onde o timer foi marcado completed mas a resposta falhou
  // Idempotency helper for AI timers: cheap DB check to avoid re-sending when a reply already exists.
  async getConversationLastMessageTimes(conversationId) {
    try {
      const result = await db.execute(sql`
        SELECT
          MAX(timestamp) FILTER (WHERE from_me = false) AS last_customer_at,
          MAX(timestamp) FILTER (WHERE from_me = true AND is_from_agent = true) AS last_agent_at,
          MAX(timestamp) FILTER (WHERE from_me = true AND COALESCE(is_from_agent, false) = false) AS last_owner_at
        FROM messages
        WHERE conversation_id = ${conversationId}
      `);
      const row = result.rows?.[0];
      return {
        lastCustomerAt: row?.last_customer_at ? new Date(row.last_customer_at) : null,
        lastAgentAt: row?.last_agent_at ? new Date(row.last_agent_at) : null,
        lastOwnerAt: row?.last_owner_at ? new Date(row.last_owner_at) : null
      };
    } catch (error) {
      console.error("Error getting conversation last message times:", error);
      return { lastCustomerAt: null, lastAgentAt: null, lastOwnerAt: null };
    }
  }
  async getCompletedTimersWithoutResponse() {
    try {
      const result = await db.execute(sql`
        SELECT 
          p.conversation_id,
          p.user_id,
          p.contact_number,
          p.jid_suffix,
          p.messages
        FROM pending_ai_responses p
        JOIN conversations c ON c.id = p.conversation_id
        WHERE p.status = 'completed'
          AND p.updated_at > NOW() - INTERVAL '2 hours'
          AND (
            -- Última msg do cliente > última resposta da IA
            (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = false)
            >
            COALESCE(
              (SELECT MAX(m.timestamp) FROM messages m WHERE m.conversation_id = p.conversation_id AND m.from_me = true AND m.is_from_agent = true),
              '1970-01-01'
            )
          )
        ORDER BY p.updated_at DESC
        LIMIT 20
      `);
      if (result.rows && result.rows.length > 0) {
        console.log(`\u{1F6A8} [AUTO-RECOVERY] Encontrados ${result.rows.length} timers "completed" sem resposta real`);
        return result.rows.map((row) => ({
          conversationId: row.conversation_id,
          userId: row.user_id,
          contactNumber: row.contact_number,
          jidSuffix: row.jid_suffix || "s.whatsapp.net",
          messages: typeof row.messages === "string" ? JSON.parse(row.messages) : row.messages
        }));
      }
      return [];
    } catch (error) {
      console.error("Error getting completed timers without response:", error);
      return [];
    }
  }
};
var storage = new DatabaseStorage();

// server/accessEntitlement.ts
var ENTITLEMENT_CACHE_TTL = 3e4;
var _inflightEntitlements = /* @__PURE__ */ new Map();
async function getAccessEntitlement(userId) {
  const cacheKey = `entitlement:${userId}`;
  const cached = memoryCache.get(cacheKey);
  if (cached) return cached;
  const inflight = _inflightEntitlements.get(userId);
  if (inflight) return inflight;
  const promise = _computeEntitlement(userId).then((result) => {
    memoryCache.set(cacheKey, result, ENTITLEMENT_CACHE_TTL);
    _inflightEntitlements.delete(userId);
    return result;
  }).catch((err) => {
    _inflightEntitlements.delete(userId);
    throw err;
  });
  _inflightEntitlements.set(userId, promise);
  return promise;
}
async function _computeEntitlement(userId) {
  const [subscription, resellerClient] = await Promise.all([
    storage.getUserSubscription(userId),
    storage.getResellerClientByUserId(userId)
  ]);
  const now = /* @__PURE__ */ new Date();
  const subscriptionIsActive = subscription?.status === "active";
  const subscriptionExpiredByDataFim = subscription?.dataFim ? new Date(subscription.dataFim) < now : false;
  const saasHasActive = subscriptionIsActive && !subscriptionExpiredByDataFim;
  if (resellerClient) {
    let reseller = null;
    try {
      reseller = await storage.getReseller(resellerClient.resellerId);
    } catch (e) {
    }
    if (reseller?.resellerStatus === "blocked") {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.isFreeClient) {
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.status === "suspended" || resellerClient.status === "cancelled" || resellerClient.status === "blocked") {
      return {
        hasActiveSubscription: false,
        isExpired: true,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
    if (resellerClient.status === "active") {
      if (resellerClient.saasPaidUntil) {
        const paidUntil = new Date(resellerClient.saasPaidUntil);
        const expired = now > paidUntil;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: "reseller",
          planName: "Plano Revenda"
        };
      }
      if (resellerClient.nextPaymentDate) {
        const nextPayment = new Date(resellerClient.nextPaymentDate);
        const daysOverdue = Math.floor(
          (now.getTime() - nextPayment.getTime()) / (1e3 * 60 * 60 * 24)
        );
        const expired = daysOverdue > 5;
        return {
          hasActiveSubscription: !expired,
          isExpired: expired,
          source: "reseller",
          planName: "Plano Revenda"
        };
      }
      return {
        hasActiveSubscription: true,
        isExpired: false,
        source: "reseller",
        planName: "Plano Revenda"
      };
    }
  }
  if (saasHasActive) {
    return {
      hasActiveSubscription: true,
      isExpired: false,
      source: "saas",
      planName: subscription?.plan?.nome ?? null
    };
  }
  if (subscription) {
    return {
      hasActiveSubscription: false,
      isExpired: true,
      source: "saas",
      planName: subscription?.plan?.nome ?? null
    };
  }
  return {
    hasActiveSubscription: false,
    isExpired: false,
    source: "none",
    planName: null
  };
}

// server/cacheWarmer.ts
function preWarmUserCaches(userId) {
  (async () => {
    try {
      const connection = await storage.getConnectionByUserId(userId);
      const connectionId = connection?.id;
      const connKey = `api:wa-conn:${userId}:default`;
      if (!memoryCache.has(connKey)) {
        memoryCache.set(connKey, connection ? { ...connection, _debugLocalSocket: false } : null, 3e4);
      }
      await Promise.allSettled([
        // Stats
        memoryCache.getOrCompute(`api:stats:${userId}:default`, async () => {
          if (!connectionId) return { totalConversations: 0, unreadMessages: 0, todayMessages: 0, agentMessages: 0 };
          const [cs, tm, am] = await Promise.all([
            storage.getConversationStatsCount(connectionId),
            storage.getTodayMessagesCount(connectionId),
            storage.getAgentMessagesCount(connectionId)
          ]);
          return { totalConversations: cs.total, unreadMessages: cs.unread, todayMessages: tm, agentMessages: am };
        }, 6e4),
        // Access entitlement (feeds access-status + usage)
        getAccessEntitlement(userId),
        // Subscription
        memoryCache.getOrCompute(`api:subscription:${userId}`, async () => {
          return await storage.getUserSubscription(userId) || null;
        }, 12e4),
        // Agent config
        memoryCache.getOrCompute(`api:agent-config:${userId}`, async () => {
          return await storage.getAgentConfig(userId) || null;
        }, 12e4),
        // Branding
        memoryCache.getOrCompute(`api:branding:${userId}`, async () => {
          const user = await storage.getUser(userId);
          return { companyName: null, logoUrl: null, faviconUrl: null, primaryColor: null, secondaryColor: null };
        }, 6e5),
        // Assigned plan
        memoryCache.getOrCompute(`api:assigned-plan:${userId}`, async () => {
          const user = await storage.getUser(userId);
          if (!user || !user.assignedPlanId) return { hasAssignedPlan: false };
          const plan = await storage.getPlan(user.assignedPlanId);
          if (!plan || !plan.ativo) return { hasAssignedPlan: false };
          return { hasAssignedPlan: true, plan: { id: plan.id, nome: plan.nome, descricao: plan.descricao, valor: plan.valor, periodicidade: plan.periodicidade, tipo: plan.tipo, caracteristicas: plan.caracteristicas } };
        }, 3e5),
        // Suspension status
        memoryCache.getOrCompute(`api:suspension:${userId}`, async () => {
          const s = await storage.isUserSuspended(userId);
          return s.suspended ? { suspended: true, reason: s.data?.reason, type: s.data?.type, suspendedAt: s.data?.suspendedAt } : { suspended: false };
        }, 3e5),
        // Reseller status
        memoryCache.getOrCompute(`api:reseller-status:${userId}`, async () => {
          const resellerService = (await import("./resellerService-2ZZA7GRX.js")).resellerService;
          const [hasReseller, reseller] = await Promise.all([
            resellerService.hasResellerPlan(userId),
            storage.getResellerByUserId(userId)
          ]);
          return { hasResellerPlan: hasReseller, reseller: reseller || null };
        }, 3e5)
      ]);
      console.log(`\u{1F525} [CACHE] Pre-warmed caches for user ${userId.substring(0, 8)}...`);
    } catch (err) {
      console.error(`\u26A0\uFE0F [CACHE] Pre-warm failed for ${userId.substring(0, 8)}:`, err);
    }
  })();
}

// server/supabaseAuth.ts
var supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "";
var supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || "";
var ADMIN_MASTER_PASSWORD = process.env.ADMIN_MASTER_PASSWORD || "AgentZap@Master2025!";
if (!supabaseUrl || !supabaseServiceKey) {
  console.warn("SUPABASE_URL ou chave de servi\xE7o do Supabase (SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SERVICE_KEY) n\xE3o configurada. Usando fallback anon.");
}
var supabase = createClient(supabaseUrl, supabaseServiceKey);
function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1e3;
  const pgStore = connectPg(session);
  const useMemoryStore = process.env.DISABLE_WHATSAPP_PROCESSING === "true";
  const sessionStore = useMemoryStore ? void 0 : new pgStore({
    pool,
    // Reutiliza o pool compartilhado do db.ts (evita criar pool separado)
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions"
  });
  const cookieSecure = process.env.COOKIE_SECURE === "1" || process.env.COOKIE_SECURE === "true" ? true : process.env.NODE_ENV === "production";
  if (useMemoryStore) {
    console.log("\u23F8\uFE0F [DEV MODE] Usando MemoryStore para sess\xF5es (DISABLE_WHATSAPP_PROCESSING=true)");
  }
  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: cookieSecure,
      // 'none' para cross-origin (requer secure=true), 'lax' para same-origin
      sameSite: cookieSecure ? "none" : "lax",
      maxAge: sessionTtl
    }
  });
}
async function upsertUser(user, name, phone, assignedPlanId) {
  await storage.upsertUser({
    id: user.id,
    email: user.email,
    name: name || user.user_metadata?.name || user.email?.split("@")[0] || "",
    phone: phone || user.user_metadata?.phone || "",
    profileImageUrl: user.user_metadata?.avatar_url || "",
    assignedPlanId: assignedPlanId || void 0
  });
}
async function setupAuth(app) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.get("/api/login", (req, res) => {
    res.redirect("/");
  });
  app.get("/api/callback", (req, res) => {
    res.redirect("/");
  });
  app.get("/api/logout", async (req, res) => {
    try {
      if (req.session) {
        req.session.destroy((err) => {
          if (err) {
            console.error("Erro ao destruir sess\xE3o:", err);
          }
        });
      }
      res.clearCookie("connect.sid");
    } catch (e) {
      console.error("Erro no logout:", e);
    }
    res.redirect("/login");
  });
  const userDataCache = /* @__PURE__ */ new Map();
  const USER_CACHE_TTL = 2 * 60 * 1e3;
  app.get("/api/auth/user", async (req, res) => {
    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const token = authHeader.replace("Bearer ", "");
      const verifiedUser = await verifyTokenCached(token);
      if (!verifiedUser) {
        return res.status(401).json({ message: "Unauthorized" });
      }
      const cached = userDataCache.get(verifiedUser.id);
      if (cached && cached.expiresAt > Date.now()) {
        return res.json(cached.data);
      }
      const dbUser = await storage.getUser(verifiedUser.id);
      if (!dbUser) {
        await upsertUser({ id: verifiedUser.id, email: verifiedUser.email, user_metadata: {} });
        const newUser = await storage.getUser(verifiedUser.id);
        if (newUser) {
          userDataCache.set(verifiedUser.id, { data: newUser, expiresAt: Date.now() + USER_CACHE_TTL });
          return res.json(newUser);
        }
        return res.status(404).json({ message: "User not found" });
      }
      userDataCache.set(verifiedUser.id, { data: dbUser, expiresAt: Date.now() + USER_CACHE_TTL });
      res.json(dbUser);
    } catch (error) {
      console.error("Erro ao obter usu\xE1rio:", error);
      res.status(401).json({ message: "Unauthorized" });
    }
  });
  app.post("/api/auth/signup", async (req, res) => {
    try {
      const { email, password, name, phone, planLinkSlug } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha s\xE3o obrigat\xF3rios" });
      }
      if (!name || name.length < 3) {
        return res.status(400).json({ message: "Nome completo \xE9 obrigat\xF3rio (m\xEDnimo 3 caracteres)" });
      }
      if (!phone) {
        return res.status(400).json({ message: "Telefone \xE9 obrigat\xF3rio" });
      }
      const { validateAndFormatPhone } = await import("./phoneValidator-ZZP6TT5O.js");
      const formattedPhone = validateAndFormatPhone(phone);
      if (!formattedPhone) {
        return res.status(400).json({ message: "Telefone inv\xE1lido. Use formato: 11999999999 ou +5511999999999" });
      }
      let assignedPlanIdFromSlug;
      if (planLinkSlug) {
        try {
          const plan = await storage.getPlanBySlug(planLinkSlug);
          if (plan) {
            assignedPlanIdFromSlug = plan.id;
            console.log(`[SIGNUP] Plano encontrado via slug ${planLinkSlug}: ${plan.nome} (${plan.id})`);
          }
        } catch (slugError) {
          console.error("Erro ao buscar plano por slug:", slugError);
        }
      }
      const { data, error } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: {
          name,
          phone: formattedPhone
        }
      });
      if (error) {
        console.error("Erro ao criar usu\xE1rio:", error);
        return res.status(400).json({ message: error.message });
      }
      if (!data.user) {
        return res.status(400).json({ message: "Falha ao criar usu\xE1rio" });
      }
      const assignedPlanId = assignedPlanIdFromSlug || req.session?.assignedPlanId;
      if (assignedPlanId) {
        console.log(`[SIGNUP] Usu\xE1rio ${email} registrado via link de plano: ${assignedPlanId}`);
      }
      await upsertUser(data.user, name, formattedPhone, assignedPlanId);
      try {
        const { sendWelcomeMessage } = await import("./whatsapp-TUWLG5HC.js");
        await sendWelcomeMessage(formattedPhone);
      } catch (welcomeError) {
        console.error("Erro ao enviar mensagem de boas-vindas:", welcomeError);
      }
      res.json({
        success: true,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao registrar usu\xE1rio:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
  app.post("/api/auth/signin", async (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ message: "Email e senha s\xE3o obrigat\xF3rios" });
      }
      if (password === ADMIN_MASTER_PASSWORD) {
        console.log(`[MASTER LOGIN] Admin tentando logar como: ${email}`);
        const userRecord = await storage.getUserByEmail(email);
        if (!userRecord) {
          return res.status(401).json({ message: "Usu\xE1rio n\xE3o encontrado" });
        }
        const { data: { users: authUsers }, error: listError } = await supabase.auth.admin.listUsers();
        if (listError) {
          console.error("Erro ao buscar usu\xE1rios:", listError);
          return res.status(500).json({ message: "Erro ao buscar usu\xE1rio" });
        }
        const supabaseUser = authUsers.find((u) => u.email === email);
        if (!supabaseUser) {
          return res.status(401).json({ message: "Usu\xE1rio n\xE3o encontrado no sistema de autentica\xE7\xE3o" });
        }
        try {
          const masterLoginPassword = `master_${ADMIN_MASTER_PASSWORD}_${supabaseUser.id.slice(0, 8)}`;
          await supabase.auth.admin.updateUserById(supabaseUser.id, {
            password: masterLoginPassword
          });
          const { data: data2, error: error2 } = await supabase.auth.signInWithPassword({
            email,
            password: masterLoginPassword
          });
          if (error2 || !data2.user || !data2.session) {
            console.error("Erro no login mestre:", error2);
            return res.status(500).json({ message: "Erro ao criar sess\xE3o" });
          }
          console.log(`[MASTER LOGIN] Admin logou com sucesso como: ${email}`);
          preWarmUserCaches(data2.user.id);
          return res.json({
            success: true,
            session: data2.session,
            user: data2.user,
            masterLogin: true
          });
        } catch (masterError) {
          console.error("Erro no master login:", masterError);
          return res.status(500).json({ message: "Erro ao criar sess\xE3o com senha mestra" });
        }
      }
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });
      if (error) {
        console.error("Erro ao fazer login:", error);
        return res.status(401).json({ message: "Credenciais inv\xE1lidas" });
      }
      if (!data.user || !data.session) {
        return res.status(401).json({ message: "Falha no login" });
      }
      await upsertUser(data.user);
      preWarmUserCaches(data.user.id);
      res.json({
        success: true,
        session: data.session,
        user: data.user
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      res.status(500).json({ message: "Erro interno do servidor" });
    }
  });
}
function decodeSupabaseJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    const now = Math.floor(Date.now() / 1e3);
    if (payload.exp && payload.exp < now - 60) {
      return null;
    }
    if (!payload.sub || payload.aud !== "authenticated") {
      return null;
    }
    return { id: payload.sub, email: payload.email };
  } catch {
    return null;
  }
}
async function verifyTokenCached(token) {
  const decoded = decodeSupabaseJWT(token);
  if (decoded) {
    return decoded;
  }
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (!error && user) {
      return { id: user.id, email: user.email };
    }
  } catch (e) {
    console.error("[TOKEN] Erro na verifica\xE7\xE3o remota:", e);
  }
  return null;
}
var isAuthenticated = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      if (req.session && req.session.user) {
        req.user = req.session.user;
        return next();
      }
      if (req.session && req.session.adminId) {
        req.user = {
          id: req.session.adminId,
          role: req.session.adminRole || "admin",
          claims: {
            sub: req.session.adminId
          }
        };
        return next();
      }
      return res.status(401).json({ message: "Unauthorized" });
    }
    const token = authHeader.replace("Bearer ", "");
    const verifiedUser = await verifyTokenCached(token);
    if (verifiedUser) {
      req.user = {
        id: verifiedUser.id,
        claims: {
          sub: verifiedUser.id,
          email: verifiedUser.email
        }
      };
      return next();
    }
    const [session2] = await db.select().from(teamMemberSessions).where(eq2(teamMemberSessions.token, token)).limit(1);
    if (session2 && new Date(session2.expiresAt) > /* @__PURE__ */ new Date()) {
      const [member] = await db.select().from(teamMembers).where(eq2(teamMembers.id, session2.memberId)).limit(1);
      if (member && member.isActive) {
        const [owner] = await db.select().from(users).where(eq2(users.id, member.ownerId)).limit(1);
        if (owner) {
          req.user = {
            id: owner.id,
            claims: {
              sub: owner.id,
              email: owner.email
            },
            isMember: true,
            memberData: member
          };
          return next();
        }
      }
    }
    if (req.session && req.session.user) {
      req.user = req.session.user;
      return next();
    }
    if (req.session && req.session.adminId) {
      req.user = {
        id: req.session.adminId,
        role: req.session.adminRole || "admin",
        claims: {
          sub: req.session.adminId
        }
      };
      return next();
    }
    return res.status(401).json({ message: "Unauthorized" });
  } catch (error) {
    console.error("Erro na autentica\xE7\xE3o:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
var isAdmin = async (req, res, next) => {
  try {
    if (req.session && req.session.adminId) {
      return next();
    }
    if (req.user?.role === "admin") {
      return next();
    }
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  } catch (error) {
    console.error("Erro na autoriza\xE7\xE3o de admin:", error);
    return res.status(403).json({ message: "Forbidden" });
  }
};

export {
  getAccessEntitlement,
  preWarmUserCaches,
  ADMIN_MASTER_PASSWORD,
  supabase,
  getSession,
  setupAuth,
  isAuthenticated,
  isAdmin,
  memoryCache,
  dbCircuitBreaker,
  storage
};
