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
  // URL da foto de perfil do contato (Base64 ou URL do Baileys)
  contactAvatar: text("contact_avatar"),
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

// AI Agent Configuration table (LEGACY - mantido para backward compatibility)
export const aiAgentConfig = pgTable("ai_agent_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  prompt: text("prompt").notNull(),
  isActive: boolean("is_active").default(false).notNull(),
  model: varchar("model", { length: 100 }).default("mistral-small-latest").notNull(),
  triggerPhrases: text("trigger_phrases").array(),
  messageSplitChars: integer("message_split_chars").default(400),
  responseDelaySeconds: integer("response_delay_seconds").default(30), // Tempo de espera antes de responder (acumulação de mensagens)
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agent Media Library table (NEW - Sistema de mídias do agente)
// Cada agente pode ter áudios, imagens, vídeos que o Mistral decide quando enviar
export const agentMediaLibrary = pgTable("agent_media_library", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identificação da mídia (usado no prompt para o Mistral)
  name: varchar("name", { length: 100 }).notNull(), // Ex: "AUDIO_PRECO", "IMG_BOAS_VINDAS"
  
  // Tipo da mídia
  mediaType: varchar("media_type", { length: 20 }).notNull(), // 'audio', 'image', 'video', 'document'
  
  // Armazenamento
  storageUrl: text("storage_url").notNull(), // URL pública ou base64
  fileName: varchar("file_name", { length: 255 }),
  fileSize: integer("file_size"), // Tamanho em bytes
  mimeType: varchar("mime_type", { length: 100 }),
  durationSeconds: integer("duration_seconds"), // Duração para áudio/vídeo
  
  // Contexto para o Mistral (CRÍTICO)
  description: text("description").notNull(), // "Explica o preço do produto X" - usado pela IA para decidir
  whenToUse: text("when_to_use"), // "Quando o cliente perguntar sobre preço"
  caption: text("caption"), // Legenda que vai junto com a imagem/vídeo no WhatsApp
  transcription: text("transcription"), // Transcrição automática de áudios
  
  // Opções de áudio
  isPtt: boolean("is_ptt").default(true), // PTT = Push-to-talk (mensagem de voz gravada)
  
  // Opção de envio combinado
  sendAlone: boolean("send_alone").default(false), // true = enviar sozinha, false = pode ser combinada com outras
  
  // Ordenação e status
  isActive: boolean("is_active").default(true).notNull(),
  displayOrder: integer("display_order").default(0),
  
  // W-API integration
  wapiMediaId: varchar("wapi_media_id", { length: 255 }),
  
  // Metadata
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_agent_media_user_id").on(table.userId),
  uniqueIndex("idx_agent_media_unique_name").on(table.userId, table.name),
]);

// Business Agent Configuration table (NEW - Sistema avançado de configuração)
export const businessAgentConfigs = pgTable("business_agent_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identity Layer
  agentName: varchar("agent_name", { length: 100 }).notNull(),
  agentRole: varchar("agent_role", { length: 200 }).notNull(),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  companyDescription: text("company_description"),
  personality: varchar("personality", { length: 100 }).default("profissional e prestativo").notNull(),
  
  // Knowledge Layer (JSONB para flexibilidade)
  productsServices: jsonb("products_services").$type<Array<{
    name: string;
    description: string;
    price?: string;
    features?: string[];
  }>>().default([]),
  businessInfo: jsonb("business_info").$type<{
    horarioFuncionamento?: string;
    endereco?: string;
    telefone?: string;
    email?: string;
    website?: string;
    redesSociais?: Record<string, string>;
    formasContato?: string[];
    metodosEntrega?: string[];
  }>().default({}),
  faqItems: jsonb("faq_items").$type<Array<{
    pergunta: string;
    resposta: string;
    categoria?: string;
  }>>().default([]),
  policies: jsonb("policies").$type<{
    trocasDevolucoes?: string;
    garantia?: string;
    privacidade?: string;
    termos?: string;
  }>().default({}),
  
  // Guardrails Layer
  allowedTopics: text("allowed_topics").array().default([]),
  prohibitedTopics: text("prohibited_topics").array().default([]),
  allowedActions: text("allowed_actions").array().default([]),
  prohibitedActions: text("prohibited_actions").array().default([]),
  
  // Personality Layer
  toneOfVoice: varchar("tone_of_voice", { length: 50 }).default("amigável").notNull(),
  communicationStyle: varchar("communication_style", { length: 50 }).default("claro e direto").notNull(),
  emojiUsage: varchar("emoji_usage", { length: 20 }).default("moderado").notNull(), // nunca, raro, moderado, frequente
  formalityLevel: integer("formality_level").default(5).notNull(), // 1-10 scale
  
  // Behavior Configuration
  maxResponseLength: integer("max_response_length").default(400).notNull(),
  useCustomerName: boolean("use_customer_name").default(true).notNull(),
  offerNextSteps: boolean("offer_next_steps").default(true).notNull(),
  escalateToHuman: boolean("escalate_to_human").default(true).notNull(),
  escalationKeywords: text("escalation_keywords").array().default([]),
  
  // Notification System
  notificationPhoneNumber: varchar("notification_phone_number"),
  notificationTrigger: text("notification_trigger"), // "Notify me when..."
  notificationEnabled: boolean("notification_enabled").default(false).notNull(),

  // System Configuration
  isActive: boolean("is_active").default(false).notNull(),
  model: varchar("model", { length: 100 }).default("mistral-small-latest").notNull(),
  triggerPhrases: text("trigger_phrases").array().default([]),
  templateType: varchar("template_type", { length: 50 }), // ecommerce, professional, health, education, realestate
  
  // Metadata
  version: integer("version").default(1).notNull(),
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

// Admin Conversations table - Conversas do WhatsApp do admin com clientes do sistema
export const adminConversations = pgTable("admin_conversations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => admins.id, { onDelete: 'cascade' }),
  contactNumber: varchar("contact_number").notNull(),
  remoteJid: text("remote_jid"),
  contactName: varchar("contact_name"),
  contactAvatar: text("contact_avatar"),
  lastMessageText: text("last_message_text"),
  lastMessageTime: timestamp("last_message_time"),
  unreadCount: integer("unread_count").default(0).notNull(),
  // Controle de IA - se false, admin responde manualmente
  isAgentEnabled: boolean("is_agent_enabled").default(true).notNull(),
  
  // Follow-up System
  followupActive: boolean("followup_active").default(true).notNull(),
  followupStage: integer("followup_stage").default(0).notNull(),
  nextFollowupAt: timestamp("next_followup_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_admin_conversations_admin").on(table.adminId),
  index("idx_admin_conversations_contact").on(table.contactNumber),
]);

// Admin Messages table - Mensagens das conversas do admin
export const adminMessages = pgTable("admin_messages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => adminConversations.id, { onDelete: 'cascade' }),
  messageId: varchar("message_id").notNull(),
  fromMe: boolean("from_me").notNull(),
  text: text("text"),
  timestamp: timestamp("timestamp").notNull(),
  status: varchar("status", { length: 50 }),
  isFromAgent: boolean("is_from_agent").default(false).notNull(),
  // Media fields
  mediaType: varchar("media_type", { length: 50 }),
  mediaUrl: text("media_url"),
  mediaMimeType: varchar("media_mime_type", { length: 100 }),
  mediaCaption: text("media_caption"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_admin_messages_conversation").on(table.conversationId),
  index("idx_admin_messages_timestamp").on(table.timestamp),
]);

// Admin Agent Media table
export const adminAgentMedia = pgTable("admin_agent_media", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").notNull().references(() => admins.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  mediaType: varchar("media_type", { length: 50 }).notNull(),
  storageUrl: text("storage_url").notNull(),
  fileName: varchar("file_name", { length: 500 }),
  fileSize: integer("file_size"),
  mimeType: varchar("mime_type", { length: 100 }),
  durationSeconds: integer("duration_seconds"),
  description: text("description").notNull(),
  whenToUse: text("when_to_use"),
  caption: text("caption"),
  transcription: text("transcription"),
  isActive: boolean("is_active").default(true).notNull(),
  sendAlone: boolean("send_alone").default(true).notNull(),
  displayOrder: integer("display_order").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_admin_agent_media_admin_id").on(table.adminId),
  index("idx_admin_agent_media_name").on(table.name),
  index("idx_admin_agent_media_active").on(table.isActive),
]);

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

// Follow-up Logs table
export const followupLogs = pgTable("followup_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: varchar("conversation_id").references(() => adminConversations.id),
  contactNumber: text("contact_number").notNull(),
  status: text("status").notNull(), // 'sent', 'failed'
  messageContent: text("message_content"),
  executedAt: timestamp("executed_at").defaultNow(),
  errorReason: text("error_reason"),
}, (table) => [
  index("idx_followup_logs_conversation").on(table.conversationId),
  index("idx_followup_logs_status").on(table.status),
]);

// Relations
export const usersRelations = relations(users, ({ many, one }) => ({
  whatsappConnections: many(whatsappConnections),
  aiAgentConfig: one(aiAgentConfig, {
    fields: [users.id],
    references: [aiAgentConfig.userId],
  }),
  businessAgentConfig: one(businessAgentConfigs, {
    fields: [users.id],
    references: [businessAgentConfigs.userId],
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

// Admin Conversations schemas and types
export const insertAdminConversationSchema = createInsertSchema(adminConversations).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertAdminConversation = z.infer<typeof insertAdminConversationSchema>;
export type AdminConversation = typeof adminConversations.$inferSelect;

// Admin Messages schemas and types
export const insertAdminMessageSchema = createInsertSchema(adminMessages).omit({
  id: true,
  createdAt: true,
});
export type InsertAdminMessage = z.infer<typeof insertAdminMessageSchema>;
export type AdminMessage = typeof adminMessages.$inferSelect;

// Business Agent Configuration schemas and types
export const insertBusinessAgentConfigSchema = createInsertSchema(businessAgentConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Zod schemas detalhados para validação
export const businessAgentConfigSchema = z.object({
  userId: z.string(),
  agentName: z.string().min(1, "Nome do agente é obrigatório"),
  agentRole: z.string().min(1, "Função do agente é obrigatória"),
  companyName: z.string().min(1, "Nome da empresa é obrigatório"),
  companyDescription: z.string().optional(),
  personality: z.string().default("profissional e prestativo"),
  
  productsServices: z.array(z.object({
    name: z.string(),
    description: z.string(),
    price: z.string().optional(),
    features: z.array(z.string()).optional(),
  })).default([]),
  
  businessInfo: z.object({
    horarioFuncionamento: z.string().optional(),
    endereco: z.string().optional(),
    telefone: z.string().optional(),
    email: z.string().email().optional(),
    website: z.string().url().optional(),
    redesSociais: z.record(z.string()).optional(),
    formasContato: z.array(z.string()).optional(),
    metodosEntrega: z.array(z.string()).optional(),
  }).default({}),
  
  faqItems: z.array(z.object({
    pergunta: z.string(),
    resposta: z.string(),
    categoria: z.string().optional(),
  })).default([]),
  
  policies: z.object({
    trocasDevolucoes: z.string().optional(),
    garantia: z.string().optional(),
    privacidade: z.string().optional(),
    termos: z.string().optional(),
  }).default({}),
  
  allowedTopics: z.array(z.string()).default([]),
  prohibitedTopics: z.array(z.string()).default([]),
  allowedActions: z.array(z.string()).default([]),
  prohibitedActions: z.array(z.string()).default([]),
  
  toneOfVoice: z.string().default("amigável"),
  communicationStyle: z.string().default("claro e direto"),
  emojiUsage: z.enum(["nunca", "raro", "moderado", "frequente"]).default("moderado"),
  formalityLevel: z.number().min(1).max(10).default(5),
  
  maxResponseLength: z.number().default(400),
  useCustomerName: z.boolean().default(true),
  offerNextSteps: z.boolean().default(true),
  escalateToHuman: z.boolean().default(true),
  escalationKeywords: z.array(z.string()).default([]),
  
  isActive: z.boolean().default(false),
  model: z.string().default("mistral-small-latest"),
  triggerPhrases: z.array(z.string()).default([]),
  templateType: z.enum(["ecommerce", "professional", "health", "education", "realestate", "custom"]).optional(),
  
  version: z.number().default(1),
});

export type InsertBusinessAgentConfig = z.infer<typeof insertBusinessAgentConfigSchema>;
export type BusinessAgentConfig = typeof businessAgentConfigs.$inferSelect;
export type BusinessAgentConfigInput = z.infer<typeof businessAgentConfigSchema>;

// Agent Media Library schemas and types
export const insertAgentMediaSchema = createInsertSchema(agentMediaLibrary).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const agentMediaSchema = z.object({
  userId: z.string(),
  name: z.string().min(1, "Nome da mídia é obrigatório").max(100).regex(/^[A-Z0-9_]+$/, "Nome deve ser em MAIÚSCULAS com underscores (ex: AUDIO_PRECO)"),
  mediaType: z.enum(["audio", "image", "video", "document"]),
  storageUrl: z.string().min(1, "URL de armazenamento é obrigatória"),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  durationSeconds: z.number().optional(),
  description: z.string().min(1, "Descrição é obrigatória"),
  whenToUse: z.string().optional(),
  caption: z.string().optional(), // Legenda que vai com a imagem/vídeo
  transcription: z.string().optional(),
  isPtt: z.boolean().default(true), // Push-to-talk (áudio aparece como gravado)
  sendAlone: z.boolean().default(false), // Enviar sozinha ou pode combinar com outras
  isActive: z.boolean().default(true),
  displayOrder: z.number().default(0),
  wapiMediaId: z.string().optional(),
});

export type InsertAgentMedia = z.infer<typeof insertAgentMediaSchema>;
export type AgentMedia = typeof agentMediaLibrary.$inferSelect;
export type AgentMediaInput = z.infer<typeof agentMediaSchema>;

// Agent Media Library relations
export const agentMediaLibraryRelations = relations(agentMediaLibrary, ({ one }) => ({
  user: one(users, {
    fields: [agentMediaLibrary.userId],
    references: [users.id],
  }),
}));

// Admin Agent Media schemas and types
export const insertAdminAgentMediaSchema = createInsertSchema(adminAgentMedia).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const adminAgentMediaSchema = z.object({
  adminId: z.string(),
  name: z.string().min(1, "Nome da mídia é obrigatório").max(100).regex(/^[A-Z0-9_]+$/, "Nome deve ser em MAIÚSCULAS com underscores (ex: COMO_FUNCIONA)"),
  mediaType: z.enum(["audio", "image", "video", "document"]),
  storageUrl: z.string().min(1, "URL de armazenamento é obrigatória"),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  mimeType: z.string().optional(),
  durationSeconds: z.number().optional(),
  description: z.string().min(1, "Descrição é obrigatória"),
  whenToUse: z.string().optional(),
  caption: z.string().optional(),
  transcription: z.string().optional(),
  isActive: z.boolean().default(true),
  sendAlone: z.boolean().default(true),
  displayOrder: z.number().default(0),
});

export type InsertAdminAgentMedia = z.infer<typeof insertAdminAgentMediaSchema>;
export type AdminAgentMedia = typeof adminAgentMedia.$inferSelect;
export type AdminAgentMediaInput = z.infer<typeof adminAgentMediaSchema>;

// Admin Agent Media relations
export const adminAgentMediaRelations = relations(adminAgentMedia, ({ one }) => ({
  admin: one(admins, {
    fields: [adminAgentMedia.adminId],
    references: [admins.id],
  }),
}));

// =============================================================================
// STRUCTURED RESPONSE FORMAT FOR MISTRAL (Media Actions)
// =============================================================================

// Schema para resposta estruturada do Mistral com ações de mídia
export const mistralResponseSchema = z.object({
  messages: z.array(z.object({
    type: z.literal("text"),
    content: z.string(),
  })),
  actions: z.array(z.object({
    type: z.literal("send_media"),
    media_name: z.string(), // Nome da mídia na biblioteca (ex: AUDIO_PRECO)
    delay_seconds: z.number().optional(), // Delay antes de enviar (opcional)
  })).optional().default([]),
});

export type MistralResponse = z.infer<typeof mistralResponseSchema>;
