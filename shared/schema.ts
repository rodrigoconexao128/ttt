import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, boolean, jsonb, index, uniqueIndex, decimal, uuid, serial, date, numeric } from "drizzle-orm/pg-core";
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
  phone: varchar("phone").notNull(),
  profileImageUrl: varchar("profile_image_url"),
  role: varchar("role", { length: 50 }).default("user").notNull(),
  whatsappNumber: varchar("whatsapp_number"),
  onboardingCompleted: boolean("onboarding_completed").default(false).notNull(),
  // Reseller reference - se este usuário é cliente de um revendedor
  resellerId: varchar("reseller_id"),
  // Campos de suspensão por violação de políticas
  suspendedAt: timestamp("suspended_at"),
  suspensionReason: text("suspension_reason"),
  suspensionType: varchar("suspension_type", { length: 100 }),
  refundedAt: timestamp("refunded_at"),
  refundAmount: numeric("refund_amount", { precision: 10, scale: 2 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Policy Violations table - Registro de violações de políticas da plataforma
export const policyViolations = pgTable("policy_violations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  violationType: varchar("violation_type", { length: 100 }).notNull(), // religious_services, adult_content, illegal_activities, etc.
  description: text("description"),
  evidence: jsonb("evidence"), // Array de evidências (mensagens, prints, etc.)
  status: varchar("status", { length: 50 }).notNull().default("pending"), // pending, confirmed, dismissed
  resultedInSuspension: boolean("resulted_in_suspension").default(false),
  adminId: varchar("admin_id"), // Admin que revisou
  internalNotes: text("internal_notes"),
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
  // 🛡️ SAFE MODE: Modo seguro anti-bloqueio
  // Quando ativado pelo admin, ao reconectar via QR Code:
  // 1. Zera todos os follow-ups pendentes
  // 2. Zera a fila de mensagens em memória
  // 3. Começa do zero para evitar novo bloqueio
  safeModeEnabled: boolean("safe_mode_enabled").default(false).notNull(),
  safeModeActivatedAt: timestamp("safe_mode_activated_at"),
  safeModeActivatedBy: varchar("safe_mode_activated_by", { length: 255 }),
  safeModeLastCleanupAt: timestamp("safe_mode_last_cleanup_at"),
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
  // Follow-up Inteligente
  followupActive: boolean("followup_active").default(true).notNull(),
  followupStage: integer("followup_stage").default(0).notNull(),
  nextFollowupAt: timestamp("next_followup_at"),
  followupDisabledReason: text("followup_disabled_reason"),
  // Token único para compartilhar conversa via URL
  shareToken: varchar("share_token", { length: 64 }).unique(),
  // CRM Kanban
  kanbanStageId: varchar("kanban_stage_id"),
  kanbanNotes: text("kanban_notes"),
  priority: varchar("priority").default("normal"),
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
  fetchHistoryOnFirstResponse: boolean("fetch_history_on_first_response").default(false).notNull(), // Buscar histórico do WhatsApp ao responder pela primeira vez
  pauseOnManualReply: boolean("pause_on_manual_reply").default(true).notNull(), // Pausar IA automaticamente quando dono responde manualmente
  autoReactivateMinutes: integer("auto_reactivate_minutes"), // Tempo em minutos para reativar IA automaticamente (NULL = nunca)
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
  notificationMode: varchar("notification_mode", { length: 20 }).default("ai").notNull(), // "ai" | "manual" | "both"
  notificationManualKeywords: text("notification_manual_keywords"), // Comma-separated keywords for manual mode

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
  // Auto-reactivation timer fields
  ownerLastReplyAt: timestamp("owner_last_reply_at").defaultNow(), // Quando o dono respondeu pela última vez
  autoReactivateAfterMinutes: integer("auto_reactivate_after_minutes"), // NULL = nunca, número = minutos para reativar
  clientHasPendingMessage: boolean("client_has_pending_message").default(false), // Cliente enviou mensagem após pausa?
  clientLastMessageAt: timestamp("client_last_message_at"), // Quando cliente enviou última mensagem
  createdAt: timestamp("created_at").defaultNow(),
});

// ============================================================================
// 🌐 WEBSITE IMPORTS - Sistema de importação de dados de websites
// Permite ao cliente alimentar o agente com produtos/preços/info de seu site
// ============================================================================
export const websiteImports = pgTable("website_imports", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do website
  websiteUrl: text("website_url").notNull(),
  websiteName: varchar("website_name", { length: 255 }),
  websiteDescription: text("website_description"),
  
  // Conteúdo extraído
  extractedHtml: text("extracted_html"), // HTML bruto (limitado)
  extractedText: text("extracted_text"), // Texto limpo extraído
  
  // Dados estruturados extraídos pelo Mistral
  extractedProducts: jsonb("extracted_products").$type<Array<{
    name: string;
    description?: string;
    price?: string;
    priceValue?: number;
    currency?: string;
    category?: string;
    imageUrl?: string;
    availability?: string;
    features?: string[];
  }>>().default([]),
  
  extractedInfo: jsonb("extracted_info").$type<{
    businessName?: string;
    businessDescription?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
    workingHours?: string;
    socialMedia?: Record<string, string>;
    paymentMethods?: string[];
    shippingInfo?: string;
    returnPolicy?: string;
    categories?: string[];
  }>().default({}),
  
  // Contexto formatado para o agente (pronto para usar no prompt)
  formattedContext: text("formatted_context"),
  
  // Status e controle
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, processing, completed, failed
  errorMessage: text("error_message"),
  pagesScraped: integer("pages_scraped").default(0),
  productsFound: integer("products_found").default(0),
  
  // Se o contexto foi aplicado ao prompt do agente
  appliedToPrompt: boolean("applied_to_prompt").default(false),
  appliedAt: timestamp("applied_at"),
  
  // Metadata
  lastScrapedAt: timestamp("last_scraped_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_website_imports_user_id").on(table.userId),
  index("idx_website_imports_status").on(table.status),
]);

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
  descricao: text("descricao"), // Descrição detalhada do plano
  valor: decimal("valor", { precision: 10, scale: 2 }).notNull(),
  valorOriginal: decimal("valor_original", { precision: 10, scale: 2 }), // Valor antes do desconto (se houver)
  periodicidade: varchar("periodicidade", { length: 20 }).default("mensal").notNull(), // mensal, anual
  tipo: varchar("tipo", { length: 50 }).default("padrao").notNull(), // padrao, anual, implementacao, personalizado
  descontoPercent: integer("desconto_percent").default(0), // Percentual de desconto
  badge: varchar("badge", { length: 50 }), // Ex: "Mais Popular", "5% OFF", etc
  destaque: boolean("destaque").default(false).notNull(), // Plano em destaque
  ordem: integer("ordem").default(0).notNull(), // Ordem de exibição
  limiteConversas: integer("limite_conversas").default(100).notNull(),
  limiteAgentes: integer("limite_agentes").default(1).notNull(),
  caracteristicas: jsonb("caracteristicas").$type<string[]>(), // Lista de features do plano
  ativo: boolean("ativo").default(true).notNull(),
  // Mercado Pago fields
  mpPlanId: varchar("mp_plan_id", { length: 255 }), // ID do plano no Mercado Pago
  valorPrimeiraCobranca: decimal("valor_primeira_cobranca", { precision: 10, scale: 2 }), // Valor diferente na primeira cobrança
  codigoPersonalizado: varchar("codigo_personalizado", { length: 50 }).unique(), // Código para planos personalizados
  isPersonalizado: boolean("is_personalizado").default(false), // Se é um plano personalizado
  frequenciaDias: integer("frequencia_dias").default(30), // Frequência de cobrança em dias
  trialDias: integer("trial_dias").default(0), // Dias de trial gratuito
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Subscriptions table
export const subscriptions = pgTable("subscriptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  planId: varchar("plan_id").notNull().references(() => plans.id, { onDelete: 'cascade' }),
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, active, expired, cancelled, paused
  dataInicio: timestamp("data_inicio"),
  dataFim: timestamp("data_fim"),
  canaisUsados: integer("canais_usados").default(0).notNull(),
  couponCode: text("coupon_code"), // Cupom de desconto aplicado
  couponPrice: decimal("coupon_price", { precision: 10, scale: 2 }), // Preço com cupom aplicado
  // Mercado Pago fields
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }), // ID da assinatura no Mercado Pago
  mpStatus: varchar("mp_status", { length: 50 }), // Status no Mercado Pago
  mpInitPoint: text("mp_init_point"), // Link de pagamento
  externalReference: varchar("external_reference", { length: 255 }).unique(), // Referência externa
  nextPaymentDate: timestamp("next_payment_date"), // Data da próxima cobrança
  payerEmail: varchar("payer_email", { length: 255 }), // Email do pagador
  paymentMethod: varchar("payment_method", { length: 50 }).default("mercadopago"), // Método de pagamento
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Payments table (legacy - Pix payments)
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

// ============================================================================
// PAYMENT HISTORY - Histórico de todos os pagamentos (MercadoPago, Pix, etc)
// Usado para exibir histórico de cobranças para clientes e admin
// ============================================================================
export const paymentHistory = pgTable("payment_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  subscriptionId: varchar("subscription_id").notNull().references(() => subscriptions.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  
  // Informações do pagamento MercadoPago
  mpPaymentId: varchar("mp_payment_id", { length: 255 }), // ID do pagamento no MercadoPago
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }), // ID da assinatura no MP
  
  // Valores
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(), // Valor cobrado
  netAmount: decimal("net_amount", { precision: 10, scale: 2 }), // Valor líquido recebido
  feeAmount: decimal("fee_amount", { precision: 10, scale: 2 }), // Taxa MP
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
  statusDetail: varchar("status_detail", { length: 100 }), // Detalhe do status (accredited, cc_rejected_*, etc)
  
  // Tipo de pagamento
  paymentType: varchar("payment_type", { length: 50 }).default("recurring").notNull(), // first_payment, setup_fee, recurring, refund
  paymentMethod: varchar("payment_method", { length: 50 }), // credit_card, debit_card, pix, boleto
  
  // Datas
  paymentDate: timestamp("payment_date"), // Data do pagamento
  dueDate: timestamp("due_date"), // Data de vencimento
  
  // Informações adicionais
  payerEmail: varchar("payer_email", { length: 255 }),
  cardLastFourDigits: varchar("card_last_four_digits", { length: 4 }),
  cardBrand: varchar("card_brand", { length: 50 }), // visa, mastercard, etc
  
  // Metadata
  rawResponse: jsonb("raw_response"), // Resposta completa do MercadoPago
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_payment_history_subscription").on(table.subscriptionId),
  index("idx_payment_history_user").on(table.userId),
  index("idx_payment_history_mp_payment").on(table.mpPaymentId),
  index("idx_payment_history_status").on(table.status),
  index("idx_payment_history_date").on(table.paymentDate),
]);

// Coupons table - Sistema de cupons de desconto
export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  code: text("code").unique().notNull(), // Código do cupom (ex: BLACKFRIDAY, WELCOME2025)
  discountType: text("discount_type").default("fixed_price").notNull(), // Tipo de desconto
  discountValue: decimal("discount_value", { precision: 10, scale: 2 }).default("0").notNull(), // Valor do desconto
  finalPrice: decimal("final_price", { precision: 10, scale: 2 }), // Preço final com cupom aplicado
  isActive: boolean("is_active").default(true),
  maxUses: integer("max_uses"), // null = ilimitado
  currentUses: integer("current_uses").default(0), // Quantas vezes foi usado
  applicablePlans: jsonb("applicable_plans").$type<string[]>(), // Planos onde o cupom é válido (null = todos)
  validFrom: timestamp("valid_from").defaultNow(),
  validUntil: timestamp("valid_until"), // Data de expiração (null = sem expiração)
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

// Follow-up Logs table (Admin)
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

// ============================================================================
// FOLLOW-UP INTELIGENTE - Configuração por Usuário
// ============================================================================

// Configuração de Follow-up por Usuário
export const followupConfigs = pgTable("followup_configs", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Configurações gerais
  // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
  isEnabled: boolean("is_enabled").default(false).notNull(),
  maxAttempts: integer("max_attempts").default(8).notNull(),
  
  // Intervalos customizados (em minutos) - padrão: 10m, 30m, 3h, 24h, 48h, 3d, 7d, 15d
  intervalsMinutes: jsonb("intervals_minutes").$type<number[]>().default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
  
  // Horário comercial
  businessHoursStart: text("business_hours_start").default("09:00"),
  businessHoursEnd: text("business_hours_end").default("18:00"),
  businessDays: jsonb("business_days").$type<number[]>().default([1, 2, 3, 4, 5]), // 0=dom, 1=seg, ... 6=sab
  respectBusinessHours: boolean("respect_business_hours").default(true).notNull(),
  
  // Tom e estilo das mensagens
  tone: varchar("tone", { length: 50 }).default("consultivo").notNull(), // consultivo, vendedor, humano, técnico
  formalityLevel: integer("formality_level").default(5).notNull(), // 1-10
  useEmojis: boolean("use_emojis").default(true).notNull(),
  
  // Informações importantes para argumentos (a IA pode usar)
  importantInfo: jsonb("important_info").$type<Array<{ titulo: string; conteudo: string; usado?: boolean }>>().default([]),
  
  // Loop infinito após acabar sequência
  infiniteLoop: boolean("infinite_loop").default(true).notNull(),
  infiniteLoopMinDays: integer("infinite_loop_min_days").default(15).notNull(),
  infiniteLoopMaxDays: integer("infinite_loop_max_days").default(30).notNull(),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Logs de Follow-up dos Usuários
export const userFollowupLogs = pgTable("user_followup_logs", {
  id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  contactNumber: text("contact_number").notNull(),
  status: text("status").notNull(), // 'sent', 'failed', 'cancelled', 'skipped'
  messageContent: text("message_content"),
  aiDecision: jsonb("ai_decision").$type<{ action: string; reason: string; context?: string }>(),
  stage: integer("stage").default(0).notNull(),
  executedAt: timestamp("executed_at").defaultNow(),
  errorReason: text("error_reason"),
}, (table) => [
  index("idx_user_followup_logs_conv").on(table.conversationId),
  index("idx_user_followup_logs_user").on(table.userId),
]);

// =============================================================================
// TAGS / ETIQUETAS - Sistema de Etiquetas para Conversas (WhatsApp CRM)
// =============================================================================

// Tabela de Tags
export const tags = pgTable("tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Nome da etiqueta (ex: "Novo cliente", "Pagamento pendente")
  name: varchar("name", { length: 100 }).notNull(),
  // Cor da etiqueta (hex color, ex: "#22c55e")
  color: varchar("color", { length: 20 }).default("#6b7280").notNull(),
  // Ícone (opcional - nome do ícone lucide)
  icon: varchar("icon", { length: 50 }),
  // Se é uma etiqueta padrão do sistema (WhatsApp Business defaults)
  isDefault: boolean("is_default").default(false).notNull(),
  // Posição para ordenação
  position: integer("position").default(0).notNull(),
  // Descrição opcional da etiqueta
  description: text("description"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_tags_user_id").on(table.userId),
  index("idx_tags_position").on(table.position),
  // Unique: nome único por usuário
  uniqueIndex("idx_tags_unique_name").on(table.userId, table.name),
]);

// Tabela de Relação Tags <-> Conversas (many-to-many)
export const conversationTags = pgTable("conversation_tags", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  tagId: varchar("tag_id").notNull().references(() => tags.id, { onDelete: 'cascade' }),
  // Quando a tag foi atribuída
  assignedAt: timestamp("assigned_at").defaultNow(),
}, (table) => [
  index("idx_conversation_tags_conversation").on(table.conversationId),
  index("idx_conversation_tags_tag").on(table.tagId),
  // Unique: uma tag só pode ser atribuída uma vez por conversa
  uniqueIndex("idx_conversation_tags_unique").on(table.conversationId, table.tagId),
]);

// Schemas e types para Tags
export const insertTagSchema = createInsertSchema(tags).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const tagSchema = z.object({
  name: z.string().min(1, "Nome é obrigatório").max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Cor inválida").default("#6b7280"),
  icon: z.string().max(50).optional(),
  description: z.string().max(500).optional(),
  position: z.number().int().min(0).default(0),
});

export type Tag = typeof tags.$inferSelect;
export type InsertTag = z.infer<typeof insertTagSchema>;
export type TagInput = z.infer<typeof tagSchema>;

// Schemas e types para ConversationTags
export const insertConversationTagSchema = createInsertSchema(conversationTags).omit({
  id: true,
  assignedAt: true,
});

export type ConversationTag = typeof conversationTags.$inferSelect;
export type InsertConversationTag = z.infer<typeof insertConversationTagSchema>;

// Relations para Tags
export const tagsRelations = relations(tags, ({ one, many }) => ({
  user: one(users, {
    fields: [tags.userId],
    references: [users.id],
  }),
  conversationTags: many(conversationTags),
}));

export const conversationTagsRelations = relations(conversationTags, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationTags.conversationId],
    references: [conversations.id],
  }),
  tag: one(tags, {
    fields: [conversationTags.tagId],
    references: [tags.id],
  }),
}));

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
  conversationTags: many(conversationTags),
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

// Website Imports schemas and types
export const insertWebsiteImportSchema = createInsertSchema(websiteImports).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertWebsiteImport = z.infer<typeof insertWebsiteImportSchema>;
export type WebsiteImport = typeof websiteImports.$inferSelect;

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

// Payment schemas and types (legacy - Pix)
export const insertPaymentSchema = createInsertSchema(payments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPayment = z.infer<typeof insertPaymentSchema>;
export type Payment = typeof payments.$inferSelect;

// Payment History schemas and types (MercadoPago, etc)
export const insertPaymentHistorySchema = createInsertSchema(paymentHistory).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPaymentHistory = z.infer<typeof insertPaymentHistorySchema>;
export type PaymentHistory = typeof paymentHistory.$inferSelect;

// System config schemas and types
export const insertSystemConfigSchema = createInsertSchema(systemConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertSystemConfig = z.infer<typeof insertSystemConfigSchema>;
export type SystemConfig = typeof systemConfig.$inferSelect;

// Coupon schemas and types
export const insertCouponSchema = createInsertSchema(coupons).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCoupon = z.infer<typeof insertCouponSchema>;
export type Coupon = typeof coupons.$inferSelect;

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

// ============================================================================
// FOLLOW-UP INTELIGENTE - Schemas e Types
// ============================================================================

// Follow-up Config schemas and types
export const insertFollowupConfigSchema = createInsertSchema(followupConfigs).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const followupConfigSchema = z.object({
  userId: z.string(),
  // IMPORTANTE: Follow-up DESATIVADO por padrão - usuário precisa ativar manualmente
  isEnabled: z.boolean().default(false),
  maxAttempts: z.number().min(1).max(20).default(8),
  intervalsMinutes: z.array(z.number()).default([10, 30, 180, 1440, 2880, 4320, 10080, 21600]),
  businessHoursStart: z.string().default("09:00"),
  businessHoursEnd: z.string().default("18:00"),
  businessDays: z.array(z.number().min(0).max(6)).default([1, 2, 3, 4, 5]),
  respectBusinessHours: z.boolean().default(true),
  tone: z.enum(["consultivo", "vendedor", "humano", "técnico"]).default("consultivo"),
  formalityLevel: z.number().min(1).max(10).default(5),
  useEmojis: z.boolean().default(true),
  importantInfo: z.array(z.object({
    titulo: z.string(),
    conteudo: z.string(),
    usado: z.boolean().optional(),
  })).default([]),
  infiniteLoop: z.boolean().default(true),
  infiniteLoopMinDays: z.number().min(1).max(60).default(15),
  infiniteLoopMaxDays: z.number().min(1).max(90).default(30),
});

export type InsertFollowupConfig = z.infer<typeof insertFollowupConfigSchema>;
export type FollowupConfig = typeof followupConfigs.$inferSelect;
export type FollowupConfigInput = z.infer<typeof followupConfigSchema>;

// User Follow-up Logs schemas and types
export const insertUserFollowupLogSchema = createInsertSchema(userFollowupLogs).omit({
  id: true,
  executedAt: true,
});
export type InsertUserFollowupLog = z.infer<typeof insertUserFollowupLogSchema>;
export type UserFollowupLog = typeof userFollowupLogs.$inferSelect;

// Follow-up Config Relations
export const followupConfigsRelations = relations(followupConfigs, ({ one }) => ({
  user: one(users, {
    fields: [followupConfigs.userId],
    references: [users.id],
  }),
}));

// User Follow-up Logs Relations
export const userFollowupLogsRelations = relations(userFollowupLogs, ({ one }) => ({
  conversation: one(conversations, {
    fields: [userFollowupLogs.conversationId],
    references: [conversations.id],
  }),
  user: one(users, {
    fields: [userFollowupLogs.userId],
    references: [users.id],
  }),
}));

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
  name: z.string().min(1, "Nome da mídia é obrigatório").max(100),
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
// QUICK REPLIES - Respostas Rápidas para Admin
// =============================================================================

export const adminQuickReplies = pgTable("admin_quick_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  adminId: varchar("admin_id").references(() => admins.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  category: varchar("category", { length: 50 }),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_quick_replies_admin").on(table.adminId),
  index("idx_quick_replies_shortcut").on(table.shortcut),
]);

export const insertQuickReplySchema = createInsertSchema(adminQuickReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type QuickReply = typeof adminQuickReplies.$inferSelect;
export type InsertQuickReply = z.infer<typeof insertQuickReplySchema>;

// =============================================================================
// USER QUICK REPLIES - Respostas Rápidas para Usuários do SaaS
// =============================================================================

export const userQuickReplies = pgTable("user_quick_replies", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id, { onDelete: 'cascade' }),
  title: varchar("title", { length: 100 }).notNull(),
  content: text("content").notNull(),
  shortcut: varchar("shortcut", { length: 50 }),
  category: varchar("category", { length: 50 }),
  usageCount: integer("usage_count").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_user_quick_replies_user").on(table.userId),
  index("idx_user_quick_replies_shortcut").on(table.shortcut),
]);

export const insertUserQuickReplySchema = createInsertSchema(userQuickReplies).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  usageCount: true,
});

export type UserQuickReply = typeof userQuickReplies.$inferSelect;
export type InsertUserQuickReply = z.infer<typeof insertUserQuickReplySchema>;

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

// =============================================================================
// EXCLUSION LIST - Lista de Exclusão de Números para IA e Follow-up
// =============================================================================

export const exclusionList = pgTable("exclusion_list", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Número de telefone formatado (apenas dígitos, ex: "5511987654321")
  phoneNumber: varchar("phone_number", { length: 20 }).notNull(),
  // Nome/apelido do contato para identificação
  contactName: varchar("contact_name", { length: 255 }),
  // Motivo da exclusão (opcional)
  reason: text("reason"),
  // Se a exclusão também se aplica ao follow-up
  excludeFromFollowup: boolean("exclude_from_followup").default(true).notNull(),
  // Se a exclusão está ativa
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Índice para busca rápida por usuário
  index("idx_exclusion_list_user").on(table.userId),
  // Índice para busca rápida por número de telefone
  index("idx_exclusion_list_phone").on(table.phoneNumber),
  // Unique constraint: um número só pode estar na lista de exclusão uma vez por usuário
  uniqueIndex("idx_exclusion_list_unique_user_phone").on(table.userId, table.phoneNumber),
]);

// Configuração global de exclusão para o usuário
export const exclusionConfig = pgTable("exclusion_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  // Se a lista de exclusão está ativa globalmente
  isEnabled: boolean("is_enabled").default(true).notNull(),
  // Se a exclusão de follow-up está ativada (usar excludeFromFollowup de cada número)
  followupExclusionEnabled: boolean("followup_exclusion_enabled").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const insertExclusionListSchema = createInsertSchema(exclusionList).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertExclusionConfigSchema = createInsertSchema(exclusionConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type ExclusionListItem = typeof exclusionList.$inferSelect;
export type InsertExclusionListItem = z.infer<typeof insertExclusionListSchema>;
export type ExclusionConfig = typeof exclusionConfig.$inferSelect;
export type InsertExclusionConfig = z.infer<typeof insertExclusionConfigSchema>;

// Schema Zod para validação de entrada via API
export const exclusionListItemSchema = z.object({
  phoneNumber: z.string().min(8, "Número de telefone inválido").max(20),
  contactName: z.string().max(255).optional(),
  reason: z.string().optional(),
  excludeFromFollowup: z.boolean().default(true),
  isActive: z.boolean().default(true),
});

export const exclusionConfigSchema = z.object({
  isEnabled: z.boolean().default(true),
  followupExclusionEnabled: z.boolean().default(true),
});

// =============================================================================
// DAILY USAGE TRACKING - Rastreamento de Uso Diário (Limites para Free Users)
// =============================================================================

export const dailyUsage = pgTable("daily_usage", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  // Data do registro (sem hora - apenas YYYY-MM-DD)
  usageDate: timestamp("usage_date").notNull(),
  // Número de calibrações de prompt feitas hoje
  promptEditsCount: integer("prompt_edits_count").default(0).notNull(),
  // Número de mensagens do simulador usadas hoje
  simulatorMessagesCount: integer("simulator_messages_count").default(0).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  // Índice para busca rápida por usuário e data
  index("idx_daily_usage_user_date").on(table.userId, table.usageDate),
  // Unique constraint: apenas um registro por usuário por dia
  uniqueIndex("idx_daily_usage_unique").on(table.userId, table.usageDate),
]);

export const insertDailyUsageSchema = createInsertSchema(dailyUsage).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export type DailyUsage = typeof dailyUsage.$inferSelect;
export type InsertDailyUsage = z.infer<typeof insertDailyUsageSchema>;

// =============================================================================
// SALES FUNNELS - Funis de Vendas com Pipeline Visual
// =============================================================================

// Tabela principal de Funis de Vendas
export const salesFunnels = pgTable("sales_funnels", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 255 }).notNull(),
  product: varchar("product", { length: 255 }),
  manager: varchar("manager", { length: 255 }),
  conversionRate: decimal("conversion_rate", { precision: 5, scale: 2 }).default("0"),
  estimatedRevenue: decimal("estimated_revenue", { precision: 12, scale: 2 }).default("0"),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_sales_funnels_user").on(table.userId),
  index("idx_sales_funnels_active").on(table.isActive),
]);

// Estágios do Funil
export const funnelStages = pgTable("funnel_stages", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  funnelId: varchar("funnel_id").notNull().references(() => salesFunnels.id, { onDelete: 'cascade' }),
  name: varchar("name", { length: 100 }).notNull(),
  description: text("description"),
  color: varchar("color", { length: 50 }).default("text-slate-700"),
  bgColor: varchar("bg_color", { length: 50 }).default("bg-slate-100"),
  borderColor: varchar("border_color", { length: 50 }).default("border-slate-200"),
  iconColor: varchar("icon_color", { length: 50 }).default("text-slate-500"),
  position: integer("position").default(1).notNull(),
  automationsCount: integer("automations_count").default(0),
  // Configurações de automação WhatsApp
  autoMessageEnabled: boolean("auto_message_enabled").default(false),
  autoMessageText: text("auto_message_text"),
  autoMessageDelayMinutes: integer("auto_message_delay_minutes").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_funnel_stages_funnel").on(table.funnelId),
  index("idx_funnel_stages_position").on(table.position),
]);

// Deals/Oportunidades no Funil
export const funnelDeals = pgTable("funnel_deals", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  stageId: varchar("stage_id").notNull().references(() => funnelStages.id, { onDelete: 'cascade' }),
  contactName: varchar("contact_name", { length: 255 }).notNull(),
  companyName: varchar("company_name", { length: 255 }),
  value: decimal("value", { precision: 12, scale: 2 }).default("0"),
  valuePeriod: varchar("value_period", { length: 20 }).default("mensal"), // mensal, anual, único
  priority: varchar("priority", { length: 20 }).default("Média"), // Alta, Média, Baixa
  assignee: varchar("assignee", { length: 255 }),
  contactPhone: varchar("contact_phone", { length: 50 }),
  contactEmail: varchar("contact_email", { length: 255 }),
  notes: text("notes"),
  lastContactAt: timestamp("last_contact_at").defaultNow(),
  expectedCloseDate: timestamp("expected_close_date"),
  wonAt: timestamp("won_at"),
  lostAt: timestamp("lost_at"),
  lostReason: text("lost_reason"),
  // Vinculação com conversa do WhatsApp
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_funnel_deals_stage").on(table.stageId),
  index("idx_funnel_deals_priority").on(table.priority),
  index("idx_funnel_deals_contact").on(table.contactPhone),
]);

// Histórico de Movimentações de Deals
export const dealHistory = pgTable("deal_history", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  dealId: varchar("deal_id").notNull().references(() => funnelDeals.id, { onDelete: 'cascade' }),
  fromStageId: varchar("from_stage_id").references(() => funnelStages.id, { onDelete: 'set null' }),
  toStageId: varchar("to_stage_id").references(() => funnelStages.id, { onDelete: 'set null' }),
  action: varchar("action", { length: 50 }).notNull(), // created, moved, updated, won, lost
  notes: text("notes"),
  performedBy: varchar("performed_by", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_deal_history_deal").on(table.dealId),
  index("idx_deal_history_date").on(table.createdAt),
]);

// Relations
export const salesFunnelsRelations = relations(salesFunnels, ({ one, many }) => ({
  user: one(users, { fields: [salesFunnels.userId], references: [users.id] }),
  stages: many(funnelStages),
}));

export const funnelStagesRelations = relations(funnelStages, ({ one, many }) => ({
  funnel: one(salesFunnels, { fields: [funnelStages.funnelId], references: [salesFunnels.id] }),
  deals: many(funnelDeals),
}));

export const funnelDealsRelations = relations(funnelDeals, ({ one, many }) => ({
  stage: one(funnelStages, { fields: [funnelDeals.stageId], references: [funnelStages.id] }),
  conversation: one(conversations, { fields: [funnelDeals.conversationId], references: [conversations.id] }),
  history: many(dealHistory),
}));

export const dealHistoryRelations = relations(dealHistory, ({ one }) => ({
  deal: one(funnelDeals, { fields: [dealHistory.dealId], references: [funnelDeals.id] }),
  fromStage: one(funnelStages, { fields: [dealHistory.fromStageId], references: [funnelStages.id] }),
  toStage: one(funnelStages, { fields: [dealHistory.toStageId], references: [funnelStages.id] }),
}));

// Schemas Zod para validação
export const insertSalesFunnelSchema = createInsertSchema(salesFunnels).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFunnelStageSchema = createInsertSchema(funnelStages).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFunnelDealSchema = createInsertSchema(funnelDeals).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

// Types
export type SalesFunnel = typeof salesFunnels.$inferSelect;
export type InsertSalesFunnel = z.infer<typeof insertSalesFunnelSchema>;
export type FunnelStage = typeof funnelStages.$inferSelect;
export type InsertFunnelStage = z.infer<typeof insertFunnelStageSchema>;
export type FunnelDeal = typeof funnelDeals.$inferSelect;
export type InsertFunnelDeal = z.infer<typeof insertFunnelDealSchema>;
export type DealHistoryItem = typeof dealHistory.$inferSelect;

// ==================== SISTEMA DE AGENDAMENTOS ====================

// Configuração de agendamento por usuário
export const schedulingConfig = pgTable("scheduling_config", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Status
  isEnabled: boolean("is_enabled").default(false).notNull(),
  
  // Informações do local/serviço
  serviceName: varchar("service_name", { length: 255 }),
  serviceDuration: integer("service_duration").default(60), // Duração em minutos
  location: varchar("location", { length: 500 }),
  locationType: varchar("location_type", { length: 50 }).default("presencial"), // presencial, online, ambos
  
  // Dias disponíveis (array de 0-6, onde 0=Domingo)
  availableDays: jsonb("available_days").default([1,2,3,4,5]),
  
  // Horários de funcionamento
  workStartTime: varchar("work_start_time", { length: 10 }).default("09:00"),
  workEndTime: varchar("work_end_time", { length: 10 }).default("18:00"),
  
  // Intervalos de almoço/pausa
  breakStartTime: varchar("break_start_time", { length: 10 }).default("12:00"),
  breakEndTime: varchar("break_end_time", { length: 10 }).default("13:00"),
  hasBreak: boolean("has_break").default(true),
  
  // Configurações avançadas
  slotDuration: integer("slot_duration").default(60), // Duração de cada slot em minutos
  bufferBetweenAppointments: integer("buffer_between_appointments").default(15),
  maxAppointmentsPerDay: integer("max_appointments_per_day").default(10),
  advanceBookingDays: integer("advance_booking_days").default(30), // Quantos dias à frente pode agendar
  minBookingNoticeHours: integer("min_booking_notice_hours").default(2), // Mínimo de antecedência
  
  // Configurações de confirmação
  requireConfirmation: boolean("require_confirmation").default(true), // IA confirma antes de agendar
  autoConfirm: boolean("auto_confirm").default(false), // Agendar automaticamente
  allowCancellation: boolean("allow_cancellation").default(true), // Permitir cancelamento pelo cliente via IA
  sendReminder: boolean("send_reminder").default(true),
  reminderHoursBefore: integer("reminder_hours_before").default(24),
  
  // Google Calendar
  googleCalendarEnabled: boolean("google_calendar_enabled").default(false),
  googleCalendarId: varchar("google_calendar_id", { length: 255 }),
  googleSyncMode: varchar("google_sync_mode", { length: 50 }).default("two_way"),
  
  // Mensagens personalizadas
  confirmationMessage: text("confirmation_message").default("Seu agendamento foi confirmado! 📅"),
  reminderMessage: text("reminder_message").default("Lembrete: Você tem um agendamento amanhã!"),
  cancellationMessage: text("cancellation_message").default("Seu agendamento foi cancelado."),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Agendamentos
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").references(() => conversations.id, { onDelete: 'set null' }),
  
  // Informações do cliente
  clientName: varchar("client_name", { length: 255 }).notNull(),
  clientPhone: varchar("client_phone", { length: 50 }).notNull(),
  clientEmail: varchar("client_email", { length: 255 }),
  
  // Detalhes do agendamento
  serviceName: varchar("service_name", { length: 255 }),
  appointmentDate: varchar("appointment_date", { length: 20 }).notNull(), // YYYY-MM-DD
  startTime: varchar("start_time", { length: 10 }).notNull(), // HH:mm
  endTime: varchar("end_time", { length: 10 }).notNull(), // HH:mm
  durationMinutes: integer("duration_minutes").default(60),
  
  // Local
  location: varchar("location", { length: 500 }),
  locationType: varchar("location_type", { length: 50 }).default("presencial"),
  meetingLink: varchar("meeting_link", { length: 500 }),
  
  // Status do agendamento
  status: varchar("status", { length: 50 }).default("pending"), // pending, confirmed, cancelled, completed, no_show
  
  // Confirmações
  confirmedByClient: boolean("confirmed_by_client").default(false),
  confirmedByBusiness: boolean("confirmed_by_business").default(false),
  confirmedAt: timestamp("confirmed_at"),
  
  // Cancelamento
  cancelledAt: timestamp("cancelled_at"),
  cancelledBy: varchar("cancelled_by", { length: 50 }),
  cancellationReason: text("cancellation_reason"),
  
  // Lembretes
  reminderSent: boolean("reminder_sent").default(false),
  reminderSentAt: timestamp("reminder_sent_at"),
  
  // Google Calendar
  googleEventId: varchar("google_event_id", { length: 255 }),
  googleCalendarSynced: boolean("google_calendar_synced").default(false),
  
  // Notas
  clientNotes: text("client_notes"),
  internalNotes: text("internal_notes"),
  
  // IA
  createdByAi: boolean("created_by_ai").default(false),
  aiConfirmationPending: boolean("ai_confirmation_pending").default(false),
  aiConversationContext: jsonb("ai_conversation_context"),
  
  // Metadados
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_appointments_user_date").on(table.userId, table.appointmentDate),
  index("idx_appointments_status").on(table.status),
  index("idx_appointments_client_phone").on(table.clientPhone),
]);

// Tokens do Google Calendar
export const googleCalendarTokens = pgTable("google_calendar_tokens", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  tokenType: varchar("token_type", { length: 50 }),
  expiryDate: timestamp("expiry_date"),
  scope: text("scope"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Exceções de horário (feriados, dias bloqueados)
export const schedulingExceptions = pgTable("scheduling_exceptions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  exceptionDate: varchar("exception_date", { length: 20 }).notNull(), // YYYY-MM-DD
  exceptionType: varchar("exception_type", { length: 50 }).notNull(), // blocked, modified_hours, holiday
  
  // Se modified_hours
  customStartTime: varchar("custom_start_time", { length: 10 }),
  customEndTime: varchar("custom_end_time", { length: 10 }),
  
  reason: varchar("reason", { length: 255 }),
  
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_scheduling_exceptions_user_date").on(table.userId, table.exceptionDate),
]);

// Relations
export const schedulingConfigRelations = relations(schedulingConfig, ({ one }) => ({
  user: one(users, { fields: [schedulingConfig.userId], references: [users.id] }),
}));

export const appointmentsRelations = relations(appointments, ({ one }) => ({
  user: one(users, { fields: [appointments.userId], references: [users.id] }),
  conversation: one(conversations, { fields: [appointments.conversationId], references: [conversations.id] }),
}));

// Schemas Zod para validação de Agendamentos
export const insertSchedulingConfigSchema = createInsertSchema(schedulingConfig).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertSchedulingExceptionSchema = createInsertSchema(schedulingExceptions).omit({
  id: true,
  createdAt: true,
});

// Types de Agendamentos
export type SchedulingConfig = typeof schedulingConfig.$inferSelect;
export type InsertSchedulingConfig = z.infer<typeof insertSchedulingConfigSchema>;
export type Appointment = typeof appointments.$inferSelect;
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type SchedulingException = typeof schedulingExceptions.$inferSelect;
export type InsertSchedulingException = z.infer<typeof insertSchedulingExceptionSchema>;
export type GoogleCalendarToken = typeof googleCalendarTokens.$inferSelect;

// =============================================================================
// SISTEMA DE REVENDA WHITE-LABEL
// =============================================================================

// Configuração do Revendedor
export const resellers = pgTable("resellers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Branding
  logoUrl: text("logo_url"),
  primaryColor: varchar("primary_color", { length: 20 }).default("#000000"),
  secondaryColor: varchar("secondary_color", { length: 20 }).default("#ffffff"),
  accentColor: varchar("accent_color", { length: 20 }).default("#22c55e"),
  companyName: varchar("company_name", { length: 255 }),
  companyDescription: text("company_description"),
  
  // Domínio customizado
  customDomain: varchar("custom_domain", { length: 255 }).unique(),
  subdomain: varchar("subdomain", { length: 100 }).unique(),
  domainVerified: boolean("domain_verified").default(false).notNull(),
  
  // Preços para clientes finais (o que o revendedor cobra dos seus clientes)
  clientMonthlyPrice: decimal("client_monthly_price", { precision: 10, scale: 2 }).default("99.99"),
  clientSetupFee: decimal("client_setup_fee", { precision: 10, scale: 2 }).default("0"),
  
  // Custo por cliente para o revendedor (paga para nós)
  costPerClient: decimal("cost_per_client", { precision: 10, scale: 2 }).default("49.99"),
  
  // Chave PIX para recebimento dos clientes
  pixKey: varchar("pix_key", { length: 255 }),
  pixKeyType: varchar("pix_key_type", { length: 20 }), // cpf, cnpj, email, phone, random
  pixHolderName: varchar("pix_holder_name", { length: 255 }), // Nome do titular da conta
  pixBankName: varchar("pix_bank_name", { length: 100 }), // Nome do banco (Nubank, Inter, etc)
  
  // Ciclo de cobrança do revendedor (quanto o revendedor paga para nós)
  billingDay: integer("billing_day").default(1), // Dia do mês para vencimento (1-28)
  nextPaymentDate: timestamp("next_payment_date"), // Próximo vencimento do revendedor
  resellerStatus: varchar("reseller_status", { length: 50 }).default("active"), // active, suspended, cancelled
  
  // Configurações
  isActive: boolean("is_active").default(true).notNull(),
  maxClients: integer("max_clients").default(100),
  
  // Textos customizados
  welcomeMessage: text("welcome_message"),
  supportEmail: varchar("support_email", { length: 255 }),
  supportPhone: varchar("support_phone", { length: 50 }),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_resellers_user").on(table.userId),
  index("idx_resellers_domain").on(table.customDomain),
  index("idx_resellers_subdomain").on(table.subdomain),
]);

// Clientes do Revendedor
export const resellerClients = pgTable("reseller_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resellerId: varchar("reseller_id").notNull().references(() => resellers.id, { onDelete: 'cascade' }),
  userId: varchar("user_id").notNull().unique().references(() => users.id, { onDelete: 'cascade' }),
  
  // Status
  status: varchar("status", { length: 50 }).default("active").notNull(), // active, suspended, cancelled, pending
  
  // Financeiro (cobra do revendedor por este cliente)
  monthlyCost: decimal("monthly_cost", { precision: 10, scale: 2 }).default("49.99"),
  
  // Preço que o revendedor cobra deste cliente específico
  clientPrice: decimal("client_price", { precision: 10, scale: 2 }),
  
  // Se é cliente gratuito (demo/teste - 1 por revendedor)
  isFreeClient: boolean("is_free_client").default(false).notNull(),
  
  // Dia de vencimento deste cliente específico
  billingDay: integer("billing_day").default(1), // Dia do mês (1-28)

  // SaaS Payment Control (Added for Granular Payments)
  saasPaidUntil: timestamp("saas_paid_until"),
  saasStatus: varchar("saas_status", { length: 20 }).default("active"), // active, overdue

  // Assinatura MercadoPago
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }),
  mpStatus: varchar("mp_status", { length: 50 }),
  nextPaymentDate: timestamp("next_payment_date"),
  
  // Datas
  activatedAt: timestamp("activated_at").defaultNow(),
  suspendedAt: timestamp("suspended_at"),
  cancelledAt: timestamp("cancelled_at"),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_reseller_clients_reseller").on(table.resellerId),
  index("idx_reseller_clients_user").on(table.userId),
  index("idx_reseller_clients_status").on(table.status),
]);

// Pagamentos do Revendedor (por cliente criado)
export const resellerPayments = pgTable("reseller_payments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  resellerId: varchar("reseller_id").notNull().references(() => resellers.id, { onDelete: 'cascade' }),
  resellerClientId: varchar("reseller_client_id").references(() => resellerClients.id, { onDelete: 'set null' }),
  
  // Valores
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  paymentType: varchar("payment_type", { length: 50 }).notNull(), // client_creation, recurring, setup_fee, monthly_fee
  
  // Status
  status: varchar("status", { length: 50 }).default("pending").notNull(), // pending, approved, rejected, refunded
  statusDetail: varchar("status_detail", { length: 100 }),
  
  // Referência da Fatura (para sistema de faturas mensais)
  referenceMonth: varchar("reference_month", { length: 7 }), // Formato: YYYY-MM (ex: 2025-01)
  dueDate: timestamp("due_date"), // Data de vencimento da fatura
  
  // MercadoPago
  mpPaymentId: varchar("mp_payment_id", { length: 255 }),
  mpSubscriptionId: varchar("mp_subscription_id", { length: 255 }),
  paymentMethod: varchar("payment_method", { length: 50 }), // credit_card, pix, manual
  
  // Informações do pagador
  payerEmail: varchar("payer_email", { length: 255 }),
  cardLastFourDigits: varchar("card_last_four_digits", { length: 4 }),
  cardBrand: varchar("card_brand", { length: 50 }),
  
  // Descrição
  description: text("description"),
  
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_payments_reseller").on(table.resellerId),
  index("idx_reseller_payments_client").on(table.resellerClientId),
  index("idx_reseller_payments_status").on(table.status),
  index("idx_reseller_payments_date").on(table.createdAt),
  index("idx_reseller_payments_reference").on(table.referenceMonth),
]);

// Relations para Resellers
export const resellersRelations = relations(resellers, ({ one, many }) => ({
  user: one(users, { fields: [resellers.userId], references: [users.id] }),
  clients: many(resellerClients),
  payments: many(resellerPayments),
  invoices: many(resellerInvoices),
}));

export const resellerClientsRelations = relations(resellerClients, ({ one, many }) => ({
  reseller: one(resellers, { fields: [resellerClients.resellerId], references: [resellers.id] }),
  user: one(users, { fields: [resellerClients.userId], references: [users.id] }),
  payments: many(resellerPayments),
}));

export const resellerPaymentsRelations = relations(resellerPayments, ({ one }) => ({
  reseller: one(resellers, { fields: [resellerPayments.resellerId], references: [resellers.id] }),
  client: one(resellerClients, { fields: [resellerPayments.resellerClientId], references: [resellerClients.id] }),
}));

// Tabela de faturas do revendedor para o sistema (Flow 2: Reseller -> System)
export const resellerInvoices = pgTable("reseller_invoices", {
  id: serial("id").primaryKey(),
  resellerId: varchar("reseller_id", { length: 255 }).notNull().references(() => resellers.id, { onDelete: "cascade" }),
  referenceMonth: varchar("reference_month", { length: 7 }).notNull(), // Formato: "2025-01"
  dueDate: date("due_date").notNull(),
  activeClients: integer("active_clients").notNull().default(0),
  unitPrice: decimal("unit_price", { precision: 10, scale: 2 }).notNull().default("49.99"),
  totalAmount: decimal("total_amount", { precision: 10, scale: 2 }).notNull(),
  status: varchar("status", { length: 20 }).notNull().default("pending"), // pending, paid, overdue
  paymentMethod: varchar("payment_method", { length: 20 }), // pix, card
  mpPaymentId: varchar("mp_payment_id", { length: 100 }),
  paidAt: timestamp("paid_at"),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_invoices_reseller").on(table.resellerId),
  index("idx_reseller_invoices_status").on(table.status),
  index("idx_reseller_invoices_due_date").on(table.dueDate),
]);

// Items da fatura do revendedor (para pagamentos granulares)
export const resellerInvoiceItems = pgTable("reseller_invoice_items", {
  id: serial("id").primaryKey(),
  invoiceId: integer("invoice_id").notNull().references(() => resellerInvoices.id, { onDelete: "cascade" }),
  resellerClientId: varchar("reseller_client_id", { length: 255 }).references(() => resellerClients.id, { onDelete: "set null" }),
  amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
  description: varchar("description", { length: 255 }),
  createdAt: timestamp("created_at").defaultNow(),
}, (table) => [
  index("idx_reseller_invoice_items_invoice").on(table.invoiceId),
  index("idx_reseller_invoice_items_client").on(table.resellerClientId),
]);

export const resellerInvoicesRelations = relations(resellerInvoices, ({ one, many }) => ({
  reseller: one(resellers, { fields: [resellerInvoices.resellerId], references: [resellers.id] }),
  items: many(resellerInvoiceItems),
}));

export const resellerInvoiceItemsRelations = relations(resellerInvoiceItems, ({ one }) => ({
  invoice: one(resellerInvoices, { fields: [resellerInvoiceItems.invoiceId], references: [resellerInvoices.id] }),
  client: one(resellerClients, { fields: [resellerInvoiceItems.resellerClientId], references: [resellerClients.id] }),
}));

// Schemas Zod para validação de Resellers
export const insertResellerSchema = createInsertSchema(resellers).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const resellerSchema = z.object({
  logoUrl: z.string().url().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#000000"),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#ffffff"),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).default("#22c55e"),
  companyName: z.string().min(1).max(255),
  companyDescription: z.string().optional(),
  customDomain: z.string().max(255).optional().nullable(),
  subdomain: z.string().min(3).max(100).regex(/^[a-z0-9-]+$/).optional().nullable(),
  clientMonthlyPrice: z.string().or(z.number()).transform(v => String(v)).default("99.99"),
  clientSetupFee: z.string().or(z.number()).transform(v => String(v)).default("0"),
  welcomeMessage: z.string().optional(),
  supportEmail: z.string().email().optional().nullable(),
  supportPhone: z.string().max(50).optional().nullable(),
});

export const insertResellerClientSchema = createInsertSchema(resellerClients).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertResellerPaymentSchema = createInsertSchema(resellerPayments).omit({
  id: true,
  createdAt: true,
});

export const insertResellerInvoiceSchema = createInsertSchema(resellerInvoices).omit({
  id: true,
  createdAt: true,
});

export const insertResellerInvoiceItemsSchema = createInsertSchema(resellerInvoiceItems).omit({
  id: true,
  createdAt: true,
});

// Types para Resellers
export type Reseller = typeof resellers.$inferSelect;
export type InsertReseller = z.infer<typeof insertResellerSchema>;
export type ResellerInput = z.infer<typeof resellerSchema>;
export type ResellerClient = typeof resellerClients.$inferSelect;
export type InsertResellerClient = z.infer<typeof insertResellerClientSchema>;
export type ResellerPayment = typeof resellerPayments.$inferSelect;
export type InsertResellerPayment = z.infer<typeof insertResellerPaymentSchema>;
export type ResellerInvoice = typeof resellerInvoices.$inferSelect;
export type InsertResellerInvoice = z.infer<typeof insertResellerInvoiceSchema>;
export type ResellerInvoiceItem = typeof resellerInvoiceItems.$inferSelect;
export type InsertResellerInvoiceItem = z.infer<typeof insertResellerInvoiceItemsSchema>;

// =============================================================================
// CUSTOM FIELDS - Campos Personalizados para Conversas
// Similar ao Digisac: Nome do Responsável, Empresa, Email, CPF/CNPJ, etc.
// =============================================================================

// Definições de campos personalizados (estrutura do formulário)
export const customFieldDefinitions = pgTable("custom_field_definitions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id, { onDelete: 'cascade' }),
  
  // Identificação
  name: varchar("name", { length: 100 }).notNull(), // Nome interno único
  label: varchar("label", { length: 100 }).notNull(), // Label exibido no formulário
  
  // Tipo do campo
  fieldType: varchar("field_type", { length: 50 }).default("text").notNull(),
  // Tipos suportados: text, email, phone, cpf_cnpj, number, date, select, textarea
  
  // Opções para select
  options: jsonb("options").$type<string[]>().default([]),
  
  // Validação e UX
  required: boolean("required").default(false),
  placeholder: varchar("placeholder", { length: 255 }),
  helpText: text("help_text"),
  
  // Auto-extração IA
  aiExtractionPrompt: text("ai_extraction_prompt"), // Prompt para IA extrair automaticamente
  aiExtractionEnabled: boolean("ai_extraction_enabled").default(true),
  
  // Ordenação e status
  position: integer("position").default(0),
  isActive: boolean("is_active").default(true),
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_field_defs_user").on(table.userId),
  uniqueIndex("idx_custom_field_defs_unique_name").on(table.userId, table.name),
]);

// Valores dos campos personalizados por conversa
export const customFieldValues = pgTable("custom_field_values", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  
  fieldDefinitionId: varchar("field_definition_id").notNull().references(() => customFieldDefinitions.id, { onDelete: 'cascade' }),
  conversationId: varchar("conversation_id").notNull().references(() => conversations.id, { onDelete: 'cascade' }),
  
  // Valor preenchido
  value: text("value"),
  
  // Metadados de extração automática
  autoExtracted: boolean("auto_extracted").default(false),
  extractionSource: text("extraction_source"), // Trecho da conversa
  extractionConfidence: decimal("extraction_confidence", { precision: 3, scale: 2 }), // 0.00 a 1.00
  
  // Auditoria
  lastEditedBy: varchar("last_edited_by", { length: 50 }).default("user"), // user, ai, system
  
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
}, (table) => [
  index("idx_custom_field_vals_conv").on(table.conversationId),
  index("idx_custom_field_vals_def").on(table.fieldDefinitionId),
  uniqueIndex("idx_custom_field_vals_unique").on(table.fieldDefinitionId, table.conversationId),
]);

// Relations para Custom Fields
export const customFieldDefinitionsRelations = relations(customFieldDefinitions, ({ one, many }) => ({
  user: one(users, {
    fields: [customFieldDefinitions.userId],
    references: [users.id],
  }),
  values: many(customFieldValues),
}));

export const customFieldValuesRelations = relations(customFieldValues, ({ one }) => ({
  definition: one(customFieldDefinitions, {
    fields: [customFieldValues.fieldDefinitionId],
    references: [customFieldDefinitions.id],
  }),
  conversation: one(conversations, {
    fields: [customFieldValues.conversationId],
    references: [conversations.id],
  }),
}));

// Schemas Zod para Custom Fields
export const insertCustomFieldDefinitionSchema = createInsertSchema(customFieldDefinitions).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const customFieldDefinitionSchema = z.object({
  name: z.string().min(1).max(100).regex(/^[a-z0-9_]+$/, "Use apenas letras minúsculas, números e underscore"),
  label: z.string().min(1).max(100),
  fieldType: z.enum(["text", "email", "phone", "cpf_cnpj", "number", "date", "select", "textarea"]).default("text"),
  options: z.array(z.string()).default([]),
  required: z.boolean().default(false),
  placeholder: z.string().max(255).optional(),
  helpText: z.string().optional(),
  aiExtractionPrompt: z.string().optional(),
  aiExtractionEnabled: z.boolean().default(true),
  position: z.number().int().min(0).default(0),
  isActive: z.boolean().default(true),
});

export const insertCustomFieldValueSchema = createInsertSchema(customFieldValues).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const customFieldValueSchema = z.object({
  fieldDefinitionId: z.string(),
  conversationId: z.string(),
  value: z.string().optional().nullable(),
  autoExtracted: z.boolean().default(false),
  extractionSource: z.string().optional(),
  extractionConfidence: z.string().or(z.number()).optional(),
  lastEditedBy: z.enum(["user", "ai", "system"]).default("user"),
});

// Types para Custom Fields
export type CustomFieldDefinition = typeof customFieldDefinitions.$inferSelect;
export type InsertCustomFieldDefinition = z.infer<typeof insertCustomFieldDefinitionSchema>;
export type CustomFieldDefinitionInput = z.infer<typeof customFieldDefinitionSchema>;
export type CustomFieldValue = typeof customFieldValues.$inferSelect;
export type InsertCustomFieldValue = z.infer<typeof insertCustomFieldValueSchema>;
export type CustomFieldValueInput = z.infer<typeof customFieldValueSchema>;
