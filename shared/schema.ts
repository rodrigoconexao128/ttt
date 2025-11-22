import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index, uniqueIndex, decimal } from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Session storage table (IMPORTANT: mandatory for Replit Auth)
export const sessions = pgTable(
  "sessions",
  {
    sid: varchar("sid").primaryKey(),
    sess: jsonb("sess").notNull(),
    expire: timestamp("expire").notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);

// User storage table (IMPORTANT: mandatory for Supabase Auth)
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique(),
  name: varchar("name").notNull(),
  phone: varchar("phone").unique().notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  whatsappNumber: varchar("whatsapp_number"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// WhatsApp connections table
export const whatsappConnections = pgTable("whatsapp_connections", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  phoneNumber: varchar("phone_number"),
  isConnected: boolean("is_connected").default(false).notNull(),
  qrCode: text("qr_code"),
  sessionData: jsonb("session_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// WhatsApp Contacts Cache table (FIX LID 2025 - Persistent storage)
// Armazena mapeamento de @lid → phoneNumber para contatos do Instagram/Facebook
export const whatsappContacts = pgTable("whatsapp_contacts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  // Connection que possui este contato
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  // JID principal do contato (pode ser @s.whatsapp.net ou @lid)
  contactId: text("contact_id").notNull(),
  // LID do contato (se vier de Instagram/Facebook Business)
  // Exemplo: "153519764074616@lid"
  lid: text("lid"),
  // Número de telefone real do contato (formato: numero@s.whatsapp.net)
  // Exemplo: "5511987654321@s.whatsapp.net"
  // ESTE É O CAMPO CRÍTICO para resolver @lid → número real
  phoneNumber: text("phone_number"),
  // Nome do contato (push name do WhatsApp)
  name: varchar("name", { length: 255 }),
  // URL da foto de perfil (opcional)
  imgUrl: text("img_url"),
  // Última sincronização com Baileys (para auditoria)
  lastSyncedAt: timestamp("last_synced_at").defaultNow(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // ÍNDICE COMPOSTO: Busca rápida por connectionId + contactId
  index("idx_contacts_connection_id").on(table.connectionId, table.contactId),
  // ÍNDICE: Busca rápida por LID (principal use case: resolver @lid)
  index("idx_contacts_lid").on(table.lid).where(sql`${table.lid} IS NOT NULL`),
  // ÍNDICE: Busca por phoneNumber para lookups reversos
  index("idx_contacts_phone").on(table.phoneNumber).where(sql`${table.phoneNumber} IS NOT NULL`),
  // UNIQUE CONSTRAINT: Um contato por connectionId (evita duplicatas)
  // Permite upsert sem conflitos
  uniqueIndex("idx_contacts_unique_connection_contact").on(table.connectionId, table.contactId),
  // ÍNDICE: Cleanup de contatos antigos (data retention)
  index("idx_contacts_last_synced").on(table.lastSyncedAt),
]);

// Conversations table
export const conversations = pgTable("conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  connectionId: varchar("connection_id")
    .notNull()
    .references(() => whatsappConnections.id, { onDelete: "cascade" }),
  contactNumber: varchar("contact_number").notNull(),
  // JID completo original do WhatsApp (ex: 5517912345678@s.whatsapp.net ou 254635809968349:20@lid)
  // SEMPRE usar este campo ao enviar mensagens de volta!
  remoteJid: text("remote_jid"),
  // Sufixo/domínio do JID usado para enviar mensagens (ex: s.whatsapp.net, lid)
  jidSuffix: varchar("jid_suffix", { length: 32 }).default("s.whatsapp.net"),
  contactName: varchar("contact_name"),
  lastMessageText: text("last_message_text"),
  lastMessageTime: timestamp("last_message_time"),
  unreadCount: integer("unread_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Messages table
export const messages = pgTable("messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").notNull(),
  fromMe: boolean("from_me").notNull(),
  text: text("text"),
  timestamp: timestamp("timestamp").notNull(),
  status: varchar("status", { length: 50 }),
  isFromAgent: boolean("is_from_agent").default(false).notNull(),
  // Media fields
  mediaType: varchar("media_type", { length: 50 }), // 'image', 'audio', 'video', 'document'
  mediaUrl: text("media_url"), // URL or base64 data
  mediaMimeType: varchar("media_mime_type", { length: 100 }),
  mediaDuration: integer("media_duration"), // Duration in seconds for audio/video
  mediaCaption: text("media_caption"), // Caption for media
  createdAt: timestamp("created_at").defaultNow(),
});

// AI Agent Configuration table
export const aiAgentConfig = pgTable("ai_agent_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  model: varchar("model", { length: 100 }).default("mistral-small-latest").notNull(),
  triggerPhrases: text("trigger_phrases").array(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent disabled conversations table
export const agentDisabledConversations = pgTable("agent_disabled_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().unique().references(() => conversations.id, { onDelete: 'cascade' }),
  createdAt: timestamp("created_at").defaultNow(),
});

// Admins table
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).default("admin").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Admin WhatsApp connection table
export const adminWhatsappConnection = pgTable("admin_whatsapp_connection", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().unique().references(() => admins.id, { onDelete: 'cascade' }),
  phoneNumber: varchar("phone_number"),
  isConnected: boolean("is_connected").default(false).notNull(),
  qrCode: text("qr_code"),
  sessionData: jsonb("session_data"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Plans table
export const plans = pgTable("plans", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  nome: varchar("nome", { length: 100 }).notNull(),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  periodicidade: varchar("periodicidade", { length: 20 }).default("mensal").notNull(), // mensal, anual
  limiteConversas: integer("limite_conversas").default(100).notNull(),
  limiteAgentes: integer("limite_agentes").default(1).notNull(),
  ativo: boolean("ativo").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: varchar("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, active, expired, cancelled
  dataInicio: timestamp("data_inicio"),
  dataFim: timestamp("data_fim"),
  canaisUsados: integer("canais_usados").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table
export const payments = pgTable("payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  pixCode: text("pix_code").notNull(),
  pixQrCode: text("pix_qr_code").notNull(),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, paid, expired
  dataPagamento: timestamp("data_pagamento"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// System configuration table
export const systemConfig = pgTable("system_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  chave: varchar("chave", { length: 100 }).unique().notNull(),
  valor: text("valor"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  whatsappConnections: many(whatsappConnections),
  aiAgentConfig: one(aiAgentConfig, {
    fields: [users.id],
    references: [aiAgentConfig.userId],
  }),
  subscriptions: many(subscriptions),
}));

export const whatsappConnectionsRelations = relations(whatsappConnections, ({ one, many }) => ({
  user: one(users, {
    fields: [whatsappConnections.userId],
    references: [users.id],
  }),
  conversations: many(conversations),
  contacts: many(whatsappContacts),
}));

export const whatsappContactsRelations = relations(whatsappContacts, ({ one }) => ({
  connection: one(whatsappConnections, {
    fields: [whatsappContacts.connectionId],
    references: [whatsappConnections.id],
  }),
}));

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  connection: one(whatsappConnections, {
    fields: [conversations.connectionId],
    references: [whatsappConnections.id],
  }),
  messages: many(messages),
  agentDisabled: one(agentDisabledConversations, {
    fields: [conversations.id],
    references: [agentDisabledConversations.conversationId],
  }),
}));

export const messagesRelations = relations(messages, ({ one }) => ({
  conversation: one(conversations, {
    fields: [messages.conversationId],
    references: [conversations.id],
  }),
}));

export const plansRelations = relations(plans, ({ many }) => ({
  subscriptions: many(subscriptions),
}));

export const subscriptionsRelations = relations(subscriptions, ({ one, many }) => ({
  user: one(users, {
    fields: [subscriptions.userId],
    references: [users.id],
  }),
  plan: one(plans, {
    fields: [subscriptions.planId],
    references: [plans.id],
  }),
  payments: many(payments),
}));

export const paymentsRelations = relations(payments, ({ one }) => ({
  subscription: one(subscriptions, {
    fields: [payments.subscriptionId],
    references: [subscriptions.id],
  }),
}));

export const adminWhatsappConnectionRelations = relations(adminWhatsappConnection, ({ one }) => ({
  admin: one(admins, {
    fields: [adminWhatsappConnection.adminId],
    references: [admins.id],
  }),
}));

// Zod schemas and types
export type User = typeof users.$inferSelect;
export type UpsertUser = typeof users.$inferInsert;

export const insertWhatsappConnectionSchema = createInsertSchema(whatsappConnections).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWhatsappConnection = z.infer<typeof insertWhatsappConnectionSchema>;
export type WhatsappConnection = typeof whatsappConnections.$inferSelect;

export const insertConversationSchema = createInsertSchema(conversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversations.$inferSelect;

// WhatsApp Contacts schemas and types
export const insertWhatsappContactSchema = createInsertSchema(whatsappContacts).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  lastSyncedAt: true,
});
export type InsertWhatsappContact = z.infer<typeof insertWhatsappContactSchema>;
export type WhatsappContact = typeof whatsappContacts.$inferSelect;

export const insertMessageSchema = createInsertSchema(messages).omit({
  id: true,
  createdAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messages.$inferSelect;

export const sendMessageSchema = z.object({
  conversationId: z.string(),
  text: z.string().min(1, "Message cannot be empty"),
});
export type SendMessage = z.infer<typeof sendMessageSchema>;

export const insertAiAgentConfigSchema = createInsertSchema(aiAgentConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAiAgentConfig = z.infer<typeof insertAiAgentConfigSchema>;
export type AiAgentConfig = typeof aiAgentConfig.$inferSelect;

export const insertAgentDisabledConversationSchema = createInsertSchema(agentDisabledConversations).omit({
  id: true,
  createdAt: true,
});
export type InsertAgentDisabledConversation = z.infer<typeof insertAgentDisabledConversationSchema>;
export type AgentDisabledConversation = typeof agentDisabledConversations.$inferSelect;

// Admin schemas and types
export const insertAdminSchema = createInsertSchema(admins).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdmin = z.infer<typeof insertAdminSchema>;
export type Admin = typeof admins.$inferSelect;

export const loginAdminSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});
export type LoginAdmin = z.infer<typeof loginAdminSchema>;

// Plan schemas and types
export const insertPlanSchema = createInsertSchema(plans).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPlan = z.infer<typeof insertPlanSchema>;
export type Plan = typeof plans.$inferSelect;

// Subscription schemas and types
export const insertSubscriptionSchema = createInsertSchema(subscriptions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSubscription = z.infer<typeof insertSubscriptionSchema>;
export type Subscription = typeof subscriptions.$inferSelect;

// Payment schemas and types
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// System config schemas and types
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;

// Admin WhatsApp connection schemas and types
export const insertAdminWhatsappConnectionSchema = createInsertSchema(adminWhatsappConnection).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminWhatsappConnection = z.infer<typeof insertAdminWhatsappConnectionSchema>;
export type AdminWhatsappConnection = typeof adminWhatsappConnection.$inferSelect;
