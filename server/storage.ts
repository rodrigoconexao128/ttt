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
  systemConfig,
  whatsappContacts,
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
  type SystemConfig,
  type InsertSystemConfig,
  type WhatsappContact,
  type InsertWhatsappContact,
} from "@shared/schema";
import { db } from "./db";
import { eq, desc, and, gte, sql } from "drizzle-orm";
import { transcribeAudioWithMistral } from "./mistralClient";

export interface IStorage {
  // User operations (IMPORTANT: mandatory for Replit Auth)
  getUser(id: string): Promise<User | undefined>;
  upsertUser(user: UpsertUser): Promise<User>;
  updateUser(id: string, data: Partial<UpsertUser>): Promise<User>;

  // WhatsApp connection operations
  getConnectionByUserId(userId: string): Promise<WhatsappConnection | undefined>;
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
  createMessage(message: InsertMessage): Promise<Message>;
  getTodayMessagesCount(connectionId: string): Promise<number>;
  getAgentMessagesCount(connectionId: string): Promise<number>;

  // AI Agent operations (legacy)
  getAgentConfig(userId: string): Promise<AiAgentConfig | undefined>;
  upsertAgentConfig(userId: string, data: Partial<InsertAiAgentConfig>): Promise<AiAgentConfig>;
  
  // Business Agent operations (new advanced system)
  getBusinessAgentConfig(userId: string): Promise<BusinessAgentConfig | undefined>;
  upsertBusinessAgentConfig(userId: string, data: Partial<InsertBusinessAgentConfig>): Promise<BusinessAgentConfig>;
  deleteBusinessAgentConfig(userId: string): Promise<void>;
  
  // Agent conversation control
  isAgentDisabledForConversation(conversationId: string): Promise<boolean>;
  disableAgentForConversation(conversationId: string): Promise<void>;
  enableAgentForConversation(conversationId: string): Promise<void>;

  // Plan operations
  getAllPlans(): Promise<Plan[]>;
  getActivePlans(): Promise<Plan[]>;
  getPlan(id: string): Promise<Plan | undefined>;
  createPlan(plan: InsertPlan): Promise<Plan>;
  updatePlan(id: string, data: Partial<InsertPlan>): Promise<Plan>;
  deletePlan(id: string): Promise<void>;

  // Subscription operations
  getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined>;
  getAllSubscriptions(): Promise<(Subscription & { plan: Plan; user: User })[]>;
  createSubscription(subscription: InsertSubscription): Promise<Subscription>;
  updateSubscription(id: string, data: Partial<InsertSubscription>): Promise<Subscription>;

  // Payment operations
  getPayment(id: string): Promise<Payment | undefined>;
  getPaymentBySubscriptionId(subscriptionId: string): Promise<Payment | undefined>;
  getPendingPayments(): Promise<(Payment & { subscription: Subscription & { user: User; plan: Plan } })[]>;
  createPayment(payment: InsertPayment): Promise<Payment>;
  updatePayment(id: string, data: Partial<InsertPayment>): Promise<Payment>;

  // System config operations
  getSystemConfig(key: string): Promise<SystemConfig | undefined>;
  updateSystemConfig(key: string, value: string): Promise<SystemConfig>;

  // Admin operations
  getAdminByEmail(email: string): Promise<any | undefined>;
  getAllAdmins(): Promise<any[]>;

  // Admin WhatsApp connection operations
  getAdminWhatsappConnection(adminId: string): Promise<AdminWhatsappConnection | undefined>;
  createAdminWhatsappConnection(connection: InsertAdminWhatsappConnection): Promise<AdminWhatsappConnection>;
  updateAdminWhatsappConnection(adminId: string, data: Partial<InsertAdminWhatsappConnection>): Promise<AdminWhatsappConnection>;

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
}

export class DatabaseStorage implements IStorage {
  // User operations
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async updateUser(id: string, data: Partial<UpsertUser>): Promise<User> {
    await db.update(users).set(data).where(eq(users.id, id));
    const [user] = await db.select().from(users).where(eq(users.id, id));
    return user;
  }

  async upsertUser(userData: UpsertUser): Promise<User> {
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

  async getAllConnections(): Promise<WhatsappConnection[]> {
    const connections = await db
      .select()
      .from(whatsappConnections)
      .orderBy(desc(whatsappConnections.createdAt));
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

  // Message operations
  async getMessagesByConversationId(conversationId: string): Promise<Message[]> {
    return await db
      .select()
      .from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.timestamp);
  }

  async createMessage(messageData: InsertMessage): Promise<Message> {
    const data: InsertMessage = { ...messageData };

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

  async getTodayMessagesCount(connectionId: string): Promise<number> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const result = await db
      .select()
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          gte(messages.timestamp, today)
        )
      );

    return result.length;
  }

  async getAgentMessagesCount(connectionId: string): Promise<number> {
    const result = await db
      .select()
      .from(messages)
      .innerJoin(conversations, eq(messages.conversationId, conversations.id))
      .where(
        and(
          eq(conversations.connectionId, connectionId),
          eq(messages.isFromAgent, true)
        )
      );

    return result.length;
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

  async disableAgentForConversation(conversationId: string): Promise<void> {
    await db
      .insert(agentDisabledConversations)
      .values({ conversationId })
      .onConflictDoNothing();
  }

  async enableAgentForConversation(conversationId: string): Promise<void> {
    await db
      .delete(agentDisabledConversations)
      .where(eq(agentDisabledConversations.conversationId, conversationId));
  }

  // Plan operations
  async getAllPlans(): Promise<Plan[]> {
    return await db.select().from(plans).orderBy(desc(plans.createdAt));
  }

  async getActivePlans(): Promise<Plan[]> {
    return await db
      .select()
      .from(plans)
      .where(eq(plans.ativo, true))
      .orderBy(desc(plans.createdAt));
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

  // Subscription operations
  async getUserSubscription(userId: string): Promise<(Subscription & { plan: Plan }) | undefined> {
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
    const result = await db
      .select()
      .from(subscriptions)
      .innerJoin(plans, eq(subscriptions.planId, plans.id))
      .innerJoin(users, eq(subscriptions.userId, users.id))
      .orderBy(desc(subscriptions.createdAt));

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

  // System config operations
  async getSystemConfig(key: string): Promise<SystemConfig | undefined> {
    const [config] = await db
      .select()
      .from(systemConfig)
      .where(eq(systemConfig.chave, key));
    return config;
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
    return await db.select().from(admins);
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
    return await db.select().from(users).orderBy(desc(users.createdAt));
  }

  async getTotalRevenue(): Promise<number> {
    const result = await db
      .select({ total: sql<number>`COALESCE(SUM(CAST(${payments.valor} AS NUMERIC)), 0)` })
      .from(payments)
      .where(eq(payments.status, "paid"));

    return Number(result[0]?.total || 0);
  }

  async getActiveSubscriptionsCount(): Promise<number> {
    const result = await db
      .select()
      .from(subscriptions)
      .where(eq(subscriptions.status, "active"));

    return result.length;
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
}

export const storage = new DatabaseStorage();
