# WhatsApp CRM SaaS - Documentação Completa

## Índice
1. [Visão Geral](#visão-geral)
2. [Arquitetura do Sistema](#arquitetura-do-sistema)
3. [Schema do Banco de Dados](#schema-do-banco-de-dados)
4. [API REST Endpoints](#api-rest-endpoints)
5. [Sistema de Autenticação](#sistema-de-autenticação)
6. [Fluxo de Pagamentos PIX](#fluxo-de-pagamentos-pix)
7. [Sistema de IA (Agente Mistral)](#sistema-de-ia-agente-mistral)
8. [Migração para Supabase](#migração-para-supabase)
9. [Configuração e Deployment](#configuração-e-deployment)

---

## Visão Geral

WhatsApp CRM SaaS é uma plataforma completa multi-tenant que permite aos usuários gerenciar conversas do WhatsApp através de uma interface web centralizada. O sistema possui:

- **Multi-tenancy**: Cada usuário tem sua própria conexão WhatsApp isolada
- **Sistema de Assinaturas**: Planos com limites configuráveis
- **Pagamentos PIX**: Integração completa com geração de QR codes
- **AI Agent**: Respostas automáticas via Mistral AI
- **Admin Panel**: Painel completo de administração

### Tecnologias Principais
- **Frontend**: React 18 + TypeScript + Vite + TailwindCSS + shadcn/ui
- **Backend**: Node.js + Express + TypeScript
- **Database**: PostgreSQL (Neon serverless)
- **ORM**: Drizzle ORM
- **WhatsApp**: Baileys (@whiskeysockets/baileys)
- **AI**: Mistral AI
- **Pagamentos**: qrcode-pix
- **Autenticação**: Replit Auth (OIDC) + Admin Session

---

## Arquitetura do Sistema

### Diagrama de Arquitetura
```
┌─────────────────┐
│   React SPA     │
│  (Frontend)     │
└────────┬────────┘
         │
         │ HTTP/WebSocket
         │
┌────────▼────────┐
│  Express Server │
│   (Backend)     │
├─────────────────┤
│  - Auth Routes  │
│  - WA Routes    │
│  - Admin Routes │
│  - Payment API  │
└────┬─────┬──────┘
     │     │
     │     │ WebSocket
     │     │
     │  ┌──▼────────┐
     │  │  Baileys  │
     │  │ WhatsApp  │
     │  └───────────┘
     │
┌────▼─────────────┐
│   PostgreSQL     │
│   (Database)     │
└──────────────────┘
```

### Camadas da Aplicação

1. **Frontend Layer**
   - React com TypeScript
   - State management: TanStack Query
   - Routing: Wouter
   - UI: shadcn/ui + Radix UI
   - Real-time: WebSocket client

2. **API Layer**
   - Express com TypeScript
   - Session management: express-session
   - WebSocket: ws
   - Validation: Zod

3. **Business Logic Layer**
   - Storage interface (IStorage)
   - WhatsApp integration (Baileys)
   - AI Agent (Mistral)
   - PIX Service

4. **Data Layer**
   - Drizzle ORM
   - PostgreSQL
   - Session store

---

## Schema do Banco de Dados

### Tabelas Principais

#### 1. `users` - Usuários do Sistema
```typescript
id: varchar (UUID, PK)
email: varchar (unique)
firstName: varchar
lastName: varchar
profileImageUrl: varchar
role: varchar (user|admin|owner)
telefone: varchar
whatsappNumber: varchar
onboardingCompleted: boolean
createdAt: timestamp
updatedAt: timestamp
```

**Relacionamentos:**
- → `whatsapp_connections` (1:1)
- → `subscriptions` (1:N)
- → `ai_agent_config` (1:1)

#### 2. `admins` - Administradores
```typescript
id: varchar (UUID, PK)
email: varchar (unique)
passwordHash: text (bcrypt)
role: varchar (admin|owner)
createdAt: timestamp
updatedAt: timestamp
```

#### 3. `plans` - Planos de Assinatura
```typescript
id: varchar (UUID, PK)
nome: varchar(100)
valor: decimal(10,2)
periodicidade: varchar(20) // mensal|anual
limiteConversas: integer (-1 = ilimitado)
limiteAgentes: integer (-1 = ilimitado)
ativo: boolean
createdAt: timestamp
updatedAt: timestamp
```

**Plano Padrão (Pro):**
- Nome: "Pro"
- Valor: R$ 299,90/mês
- Limites: -1 (ilimitado para tudo)

#### 4. `subscriptions` - Assinaturas
```typescript
id: varchar (UUID, PK)
userId: varchar (FK → users.id)
planId: varchar (FK → plans.id)
status: varchar(50) // pending|active|expired|cancelled
dataInicio: timestamp
dataFim: timestamp
createdAt: timestamp
updatedAt: timestamp
```

**Relacionamentos:**
- → `users` (N:1)
- → `plans` (N:1)
- → `payments` (1:N)

#### 5. `payments` - Pagamentos
```typescript
id: varchar (UUID, PK)
subscriptionId: varchar (FK → subscriptions.id)
valor: decimal(10,2)
pixCode: text (copia-e-cola PIX)
pixQrCode: text (base64 do QR code)
status: varchar(50) // pending|paid|expired
dataPagamento: timestamp
createdAt: timestamp
updatedAt: timestamp
```

#### 6. `whatsapp_connections` - Conexões WhatsApp
```typescript
id: varchar (UUID, PK)
userId: varchar (FK → users.id, unique)
phoneNumber: varchar
isConnected: boolean
qrCode: text (QR code para scan)
sessionData: jsonb (dados da sessão Baileys)
createdAt: timestamp
updatedAt: timestamp
```

#### 7. `conversations` - Conversas
```typescript
id: varchar (UUID, PK)
connectionId: varchar (FK → whatsapp_connections.id)
contactNumber: varchar
contactName: varchar
lastMessageText: text
lastMessageTime: timestamp
unreadCount: integer
createdAt: timestamp
updatedAt: timestamp
```

#### 8. `messages` - Mensagens
```typescript
id: varchar (UUID, PK)
conversationId: varchar (FK → conversations.id)
messageId: varchar (ID do WhatsApp)
fromMe: boolean
text: text
timestamp: timestamp
status: varchar(50)
isFromAgent: boolean (se foi enviada pelo AI Agent)
createdAt: timestamp
```

#### 9. `ai_agent_config` - Configuração do AI Agent
```typescript
id: varchar (UUID, PK)
userId: varchar (FK → users.id, unique)
prompt: text (instruções para o agente)
isActive: boolean
model: varchar(100) (modelo Mistral)
messagesResponded: integer
createdAt: timestamp
updatedAt: timestamp
```

#### 10. `agent_disabled_conversations` - Conversas com Agent Desabilitado
```typescript
id: varchar (UUID, PK)
conversationId: varchar (FK → conversations.id, unique)
createdAt: timestamp
```

#### 11. `system_config` - Configurações do Sistema
```typescript
id: varchar (UUID, PK)
chave: varchar(100) (unique) // mistral_api_key, pix_key
valor: text
createdAt: timestamp
updatedAt: timestamp
```

**Configurações Padrão:**
- `mistral_api_key`: Chave da API Mistral
- `pix_key`: Chave PIX para receber pagamentos

---

## API REST Endpoints

### Autenticação

#### Admin Login
```
POST /api/admin/login
Body: { email: string, password: string }
Response: { success: true, admin: { id, email, role } }
```

#### Check Admin Session
```
GET /api/admin/session
Response: { authenticated: boolean, adminId?: string, role?: string }
```

#### Admin Logout
```
POST /api/admin/logout
Response: { success: true }
```

#### Get Current User (Replit Auth)
```
GET /api/auth/user
Headers: Cookie (session)
Response: User
```

### WhatsApp

#### Get Connection
```
GET /api/whatsapp/connection
Headers: Cookie (session)
Response: WhatsappConnection | null
```

#### Connect WhatsApp
```
POST /api/whatsapp/connect
Response: { success: true }
```

#### Disconnect WhatsApp
```
POST /api/whatsapp/disconnect
Response: { success: true }
```

#### Send Message
```
POST /api/messages/:conversationId
Body: { text: string }
Response: { success: true, message: Message }
```

### Conversations

#### Get All Conversations
```
GET /api/conversations
Response: Conversation[]
```

#### Get Single Conversation
```
GET /api/conversation/:id
Response: Conversation
```

#### Get Conversation Messages
```
GET /api/conversation/:id/messages
Response: Message[]
```

### Plans

#### Get Active Plans (Public)
```
GET /api/plans
Response: Plan[]
```

#### Get All Plans (Admin)
```
GET /api/admin/plans
Response: Plan[]
```

#### Create Plan (Admin)
```
POST /api/admin/plans
Body: InsertPlan
Response: Plan
```

#### Update Plan (Admin)
```
PUT /api/admin/plans/:id
Body: Partial<InsertPlan>
Response: Plan
```

#### Delete Plan (Admin)
```
DELETE /api/admin/plans/:id
Response: { success: true }
```

### Subscriptions

#### Get Current Subscription
```
GET /api/subscriptions/current
Response: Subscription & { plan: Plan } | null
```

#### Create Subscription
```
POST /api/subscriptions/create
Body: { planId: string }
Response: Subscription
```

#### Get All Subscriptions (Admin)
```
GET /api/admin/subscriptions
Response: (Subscription & { plan: Plan, user: User })[]
```

### Payments

#### Generate PIX QR Code
```
POST /api/payments/generate-pix
Body: { subscriptionId: string }
Response: Payment (com pixCode e pixQrCode)
```

#### Get Pending Payments (Admin)
```
GET /api/admin/payments/pending
Response: (Payment & { subscription: Subscription & { user: User, plan: Plan } })[]
```

#### Approve Payment (Admin)
```
POST /api/admin/payments/approve/:id
Response: { success: true }
```

### Admin

#### Get All Users (Admin)
```
GET /api/admin/users
Response: User[]
```

#### Get Stats (Admin)
```
GET /api/admin/stats
Response: { totalUsers: number, totalRevenue: number, activeSubscriptions: number }
```

#### Get System Config (Admin)
```
GET /api/admin/config
Response: { mistral_api_key: string, pix_key: string }
```

#### Update System Config (Admin)
```
PUT /api/admin/config
Body: { mistral_api_key?: string, pix_key?: string }
Response: { success: true }
```

### AI Agent

#### Get Agent Config
```
GET /api/agent/config
Response: AiAgentConfig | null
```

#### Update Agent Config
```
POST /api/agent/config
Body: Partial<InsertAiAgentConfig>
Response: AiAgentConfig
```

#### Test Agent
```
POST /api/agent/test
Body: { message: string }
Response: { response: string }
```

#### Toggle Agent for Conversation
```
POST /api/agent/toggle/:conversationId
Response: { success: true, enabled: boolean }
```

#### Check Agent Status for Conversation
```
GET /api/agent/status/:conversationId
Response: { enabled: boolean }
```

---

## Sistema de Autenticação

### Dois Sistemas de Auth

#### 1. Replit Auth (OIDC) - Para Usuários Finais
- Usa OpenID Connect
- Session armazenada no PostgreSQL
- Middleware: `isAuthenticated`
- Acesso: Dashboard, WhatsApp, Planos, Pagamentos

#### 2. Admin Session - Para Administradores
- Email/Password com bcrypt
- Session armazenada em `req.session.adminId`
- Middleware: `isAdmin` (aceita ambos)
- Acesso: Admin Panel

### Middleware de Proteção

```typescript
// Verifica apenas Replit Auth
isAuthenticated(req, res, next)

// Verifica Admin Session OU Replit Auth + role admin/owner
isAdmin(req, res, next)
```

### Credenciais Admin Padrão
```
Email: rodrigoconexao128@gmail.com
Senha: Ibira2019!
Role: owner
```

---

## Fluxo de Pagamentos PIX

### 1. Escolha do Plano
```
Usuário → /plans → Escolhe plano → Clica "Assinar"
```

### 2. Criação da Assinatura
```
POST /api/subscriptions/create
Body: { planId }
→ Cria subscription com status: "pending"
```

### 3. Geração do PIX
```
Usuário → /subscribe/:planId
Frontend chama: POST /api/payments/generate-pix
Body: { subscriptionId }

Backend:
1. Busca chave PIX do system_config (ou usa padrão)
2. Gera QR Code via qrcode-pix library
3. Salva payment com:
   - pixCode (copia-e-cola)
   - pixQrCode (base64 do QR)
   - status: "pending"
→ Retorna payment
```

### 4. Pagamento do Cliente
```
Cliente:
1. Escaneia QR code OU
2. Copia código PIX
3. Faz pagamento no app do banco
```

### 5. Aprovação Manual pelo Admin
```
Admin → Admin Panel → Tab "Pagamentos"
→ Vê lista de pagamentos pendentes
→ Clica "Aprovar" após confirmar pagamento

POST /api/admin/payments/approve/:id
Backend:
1. Atualiza payment: status = "paid", dataPagamento = now
2. Ativa subscription:
   - status = "active"
   - dataInicio = now
   - dataFim = now + período do plano
```

### Configuração da Chave PIX
```
Admin → Admin Panel → Tab "Configurações"
→ Insere chave PIX (email, CPF, telefone, etc)
→ Salva

Storage:
system_config.chave = "pix_key"
system_config.valor = "chave_pix"
```

---

## Sistema de IA (Agente Mistral)

### Funcionamento

1. **Configuração do Agente** (`/my-agent`)
   - Usuário define prompt personalizado
   - Escolhe modelo Mistral (tiny, small, medium)
   - Ativa/desativa globalmente

2. **Processamento de Mensagens**
```typescript
// server/whatsapp.ts
Mensagem recebida →
  ├─ Salva no banco
  ├─ Verifica se agent está ativo
  └─ Se ativo:
      ├─ Busca histórico (últimas 10 mensagens)
      ├─ Chama generateAIResponse()
      └─ Envia resposta automática
```

3. **Contexto Conversacional**
```typescript
// server/aiAgent.ts
generateAIResponse(userId, conversationHistory, newMessage)
→ Monta mensagens:
  - System: prompt personalizado do usuário
  - History: últimas 10 mensagens (alternando user/assistant)
  - User: nova mensagem
→ Chama Mistral API
→ Retorna resposta
```

4. **Override por Conversa**
```
Usuário pode desabilitar agent para conversas específicas
→ POST /api/agent/toggle/:conversationId
```

### Chave API Mistral
```
Armazenada em: system_config.chave = "mistral_api_key"
Configurável via: Admin Panel → Configurações
Usada por: todos os agentes do sistema
```

---

## Migração para Supabase

### Por que Supabase?

Supabase oferece:
- PostgreSQL totalmente compatível
- Auth integrado (substituir Replit Auth)
- Storage para arquivos
- Realtime subscriptions
- Edge Functions
- APIs auto-geradas

### Passo a Passo da Migração

#### 1. Criar Projeto no Supabase

```bash
# 1. Criar conta em supabase.com
# 2. Criar novo projeto
# 3. Anotar:
#    - DATABASE_URL (connection string)
#    - SUPABASE_URL
#    - SUPABASE_ANON_KEY
#    - SUPABASE_SERVICE_KEY
```

#### 2. Exportar Schema Atual

```bash
# Instalar pg_dump (se necessário)
npm install -g pg_dump

# Exportar schema + data
pg_dump $DATABASE_URL > backup.sql

# Apenas schema (sem dados)
pg_dump $DATABASE_URL --schema-only > schema.sql
```

#### 3. Importar no Supabase

```bash
# Via dashboard Supabase:
# SQL Editor → Paste schema.sql → Run

# Via CLI:
psql $SUPABASE_DATABASE_URL < schema.sql
```

#### 4. Atualizar Código

**4.1. Environment Variables**
```env
# Substituir:
DATABASE_URL=sua_url_neon
ISSUER_URL=...
REPL_ID=...

# Por:
DATABASE_URL=sua_url_supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=eyJxxx...
SUPABASE_SERVICE_KEY=eyJxxx...
```

**4.2. Remover Replit Auth**
```bash
# Desinstalar
npm uninstall openid-client passport passport-local

# Remover arquivos
rm server/replitAuth.ts
```

**4.3. Implementar Supabase Auth**
```bash
# Instalar
npm install @supabase/supabase-js

# Criar server/supabaseAuth.ts
```

```typescript
// server/supabaseAuth.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);

export async function isAuthenticated(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  req.user = user;
  next();
}
```

**4.4. Atualizar Frontend Auth**
```typescript
// client/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL,
  import.meta.env.VITE_SUPABASE_ANON_KEY
);

// Login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'user@example.com',
  password: 'password',
});

// Get Session
const { data: { session } } = await supabase.auth.getSession();

// Logout
await supabase.auth.signOut();
```

**4.5. Atualizar Storage Interface**
```typescript
// Antes:
async getUser(id: string) {
  const [user] = await db.select().from(users).where(eq(users.id, id));
  return user;
}

// Depois (se usar Supabase Database API):
async getUser(id: string) {
  const { data } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  return data;
}

// OU manter Drizzle ORM (recomendado)
// Só precisa mudar DATABASE_URL para Supabase
```

#### 5. Migrar Sessions

**Opção A: Continuar com express-session + PostgreSQL**
```typescript
// Manter código atual
// Apenas mudar DATABASE_URL para Supabase
```

**Opção B: Usar Supabase Auth nativo**
```typescript
// Remover express-session
// Usar tokens JWT do Supabase
// Mais simples e escalável
```

#### 6. Migrar Uploads (se tiver)

```typescript
// Usar Supabase Storage
const { data, error } = await supabase.storage
  .from('avatars')
  .upload('public/avatar.png', file);

// Get URL
const { data: { publicUrl } } = supabase.storage
  .from('avatars')
  .getPublicUrl('public/avatar.png');
```

#### 7. Realtime (Opcional)

```typescript
// Substituir WebSocket por Supabase Realtime
const channel = supabase
  .channel('messages')
  .on('postgres_changes', 
    { event: 'INSERT', schema: 'public', table: 'messages' },
    (payload) => {
      console.log('New message:', payload.new);
    }
  )
  .subscribe();
```

#### 8. Deploy

**Opção A: Vercel/Netlify (Frontend) + Supabase Edge Functions (Backend)**
```bash
# Frontend
vercel deploy

# Backend (Edge Functions)
supabase functions deploy
```

**Opção B: Railway/Render (Full Stack)**
```bash
# Deploy tudo junto
railway up
# ou
render deploy
```

### Checklist de Migração

- [ ] Criar projeto Supabase
- [ ] Exportar dados atuais
- [ ] Importar schema no Supabase
- [ ] Testar conexão DATABASE_URL
- [ ] Implementar Supabase Auth
- [ ] Atualizar frontend (login/logout)
- [ ] Migrar sessions (se necessário)
- [ ] Testar todas as rotas
- [ ] Migrar uploads (se tiver)
- [ ] Configurar Realtime (opcional)
- [ ] Deploy e DNS
- [ ] Monitoramento e backups

### Vantagens da Migração

✅ **Auth Integrado**: OAuth, Magic Links, etc  
✅ **Storage Built-in**: Para uploads de arquivos  
✅ **Realtime**: Substituir WebSocket por Postgres Changes  
✅ **APIs Auto-geradas**: REST e GraphQL  
✅ **Edge Functions**: Serverless functions globais  
✅ **Dashboard**: UI completa para DB management  
✅ **Backups automáticos**: Point-in-time recovery  

### Custo Estimado

**Supabase Free Tier:**
- 500MB database
- 1GB file storage
- 2GB bandwidth
- 50,000 monthly active users

**Supabase Pro ($25/mês):**
- 8GB database
- 100GB file storage
- 250GB bandwidth
- 100,000 monthly active users
- Daily backups

---

## Configuração e Deployment

### Variáveis de Ambiente

```env
# Database
DATABASE_URL=postgresql://...
PGHOST=...
PGPORT=5432
PGUSER=...
PGPASSWORD=...
PGDATABASE=...

# Session
SESSION_SECRET=your-secret-key

# Mistral API (também em system_config)
MISTRAL_API_KEY=your-mistral-key

# Replit Auth (se usar)
ISSUER_URL=...
REPL_ID=...

# Port
PORT=5000
```

### Scripts Principais

```json
{
  "scripts": {
    "dev": "NODE_ENV=development tsx server/index.ts",
    "build": "vite build",
    "start": "node dist/index.js",
    "db:push": "drizzle-kit push",
    "db:studio": "drizzle-kit studio"
  }
}
```

### Deployment (Replit)

1. Sistema auto-deploys ao fazer commit
2. Workflow "Start application" roda `npm run dev`
3. Vite serve frontend + backend na porta 5000
4. Database seed roda automaticamente

### Deployment (Produção)

#### Opção 1: Railway/Render
```bash
# 1. Criar conta
# 2. Conectar repositório
# 3. Configurar env vars
# 4. Deploy automático em cada commit
```

#### Opção 2: VPS (DigitalOcean, AWS, etc)
```bash
# 1. Provisionar servidor
# 2. Instalar Node.js, PostgreSQL
# 3. Clonar repositório
# 4. npm install
# 5. npm run build
# 6. Configurar PM2 ou systemd
# 7. Nginx como reverse proxy
```

### Monitoramento

- Logs: `console.log` ou Winston
- Errors: Sentry
- Analytics: PostHog, Plausible
- Database: pg_stat_statements
- Uptime: UptimeRobot

---

## Troubleshooting

### Problema: Admin login não funciona
**Solução:**
1. Verificar se admin foi criado no seed
2. Acessar `/admin-login` (não `/admin`)
3. Usar credenciais: rodrigoconexao128@gmail.com / Ibira2019!

### Problema: PIX QR code não aparece
**Solução:**
1. Configurar chave PIX em Admin Panel → Configurações
2. Verificar se plano está ativo
3. Verificar console do servidor para erros

### Problema: AI Agent não responde
**Solução:**
1. Verificar Mistral API Key em Admin Panel → Configurações
2. Verificar se agent está ativo em /my-agent
3. Verificar saldo da conta Mistral

### Problema: WhatsApp não conecta
**Solução:**
1. Escanear QR code rapidamente (expira em 1min)
2. Verificar se já não está conectado em outro lugar
3. Limpar sessionData no banco e reconectar

---

## Suporte e Contato

Para dúvidas ou suporte, consulte:
- Repositório: [GitHub]
- Documentação Baileys: https://github.com/WhiskeySockets/Baileys
- Documentação Mistral: https://docs.mistral.ai
- Documentação Supabase: https://supabase.com/docs

---

**Última atualização:** Novembro 2025
**Versão:** 1.0.0
