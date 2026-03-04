# Guia do Desenvolvedor - WhatsApp CRM SaaS

## 🎯 Objetivo
Este guia fornece instruções passo a passo para qualquer desenvolvedor ou IA entender e modificar o sistema.

---

## 📚 Antes de Começar

### 1. Leia a Documentação
- [ ] Ler `DOCUMENTATION.md` (visão geral do sistema)
- [ ] Ler `SYSTEM_ARCHITECTURE.md` (arquitetura migrada para Supabase)
- [ ] Entender os dois sistemas de autenticação

### 2. Configurar Ambiente Local
```bash
# 1. Clonar repositório
git clone https://github.com/heroncosmo/wz.git
cd whatsgithub

# 2. Instalar dependências
npm install

# 3. Configurar .env (ver seção abaixo)
cp .env.example .env

# 4. Iniciar servidor
npm run dev

# 5. Acessar aplicação
# Frontend: http://localhost:5000
# Admin: http://localhost:5000/admin-login
```

### 3. Variáveis de Ambiente Necessárias
```env
# Database (Supabase)
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres

# Session
SESSION_SECRET=seu-secret-aleatorio-aqui

# Supabase (opcional, para Supabase Auth)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...

# Mistral API (também em system_config)
MISTRAL_API_KEY=0bCWTkNZwH4to0Yms6v83EsP40bujdgL

# Port
PORT=5000
NODE_ENV=development
```

---

## 🔐 Entender Autenticação

### Sistema 1: Supabase Auth (JWT) - Usuários Finais

**Arquivo:** `server/supabaseAuth.ts`

**Fluxo:**
1. Usuário faz login → POST /api/auth/signin
2. Backend valida com Supabase
3. Supabase retorna JWT token
4. Frontend armazena em localStorage
5. Requisições futuras: `Authorization: Bearer <token>`

**Middleware:** `isAuthenticated`
- Valida Bearer token
- Extrai user ID: `req.user.claims.sub`
- Protege rotas de usuários

**Rotas Protegidas:**
- GET /api/conversations
- POST /api/messages/:conversationId
- GET /api/subscriptions/current
- POST /api/agent/test
- etc

### Sistema 2: Admin Session - Administradores

**Arquivo:** `server/routes.ts` (linhas 35-87)

**Fluxo:**
1. Admin faz login → POST /api/admin/login
2. Backend valida email/password com bcrypt
3. Backend cria sessão: `req.session.adminId = admin.id`
4. Express-session salva em PostgreSQL
5. Cookie "connect.sid" enviado ao cliente
6. Requisições futuras: `Cookie: connect.sid=...`

**Middleware:** `isAdmin` (server/middleware.ts)
- Verifica `req.session.adminId`
- Fallback: Supabase auth com role admin
- Protege rotas de admin

**Rotas Protegidas:**
- GET /api/admin/plans
- POST /api/admin/plans
- GET /api/admin/config
- PUT /api/admin/config
- etc

**Credenciais Padrão:**
```
Email: rodrigoconexao128@gmail.com
Senha: Ibira2019!
Role: owner
```

---

## 🛠️ Estrutura de Código

### Backend (server/)

#### 1. server/index.ts
- Entry point da aplicação
- Inicia servidor Express
- Registra rotas
- Inicia WebSocket

#### 2. server/routes.ts (826 linhas)
- Todas as rotas da API
- Divididas em seções:
  - Admin auth (linhas 35-87)
  - WhatsApp (linhas 90-...)
  - Conversations (linhas ...)
  - Plans (linhas ...)
  - Subscriptions (linhas ...)
  - Payments (linhas ...)
  - Admin panel (linhas ...)
  - AI Agent (linhas ...)

#### 3. server/middleware.ts
- `isAdmin()` - Proteção de rotas admin
- Verifica sessão admin OU Supabase auth

#### 4. server/supabaseAuth.ts
- `getSession()` - Configura express-session
- `setupAuth(app)` - Registra rotas de auth
- `isAuthenticated` - Middleware JWT
- `upsertUser()` - Sincroniza usuário

#### 5. server/storage.ts
- Interface de acesso ao banco
- Funções CRUD para todas as tabelas
- Exemplo: `getAdminByEmail(email)`

#### 6. server/db.ts
- Conexão Drizzle ORM
- Pool de conexões PostgreSQL

#### 7. server/seed.ts
- Dados iniciais (admin, planos)
- Roda automaticamente ao iniciar

#### 8. server/whatsapp.ts
- Integração Baileys
- Conexão WhatsApp
- Envio/recebimento de mensagens
- Geração de QR Code

#### 9. server/aiAgent.ts
- Integração Mistral AI
- Geração de respostas automáticas
- Contexto conversacional

#### 10. server/pixService.ts
- Geração de QR Code PIX
- Integração com qrcode-pix

### Frontend (client/src/)

#### 1. client/src/pages/admin.tsx
- Painel de administração
- Proteção: Verifica sessão admin
- Abas: Dashboard, Planos, Pagamentos, Configurações

#### 2. client/src/pages/admin-login.tsx
- Página de login admin
- Formulário: email + password
- POST /api/admin/login

#### 3. client/src/pages/dashboard.tsx
- Dashboard do usuário
- Conversas WhatsApp
- Agente de IA

#### 4. client/src/lib/apiRequest.ts
- Wrapper HTTP com token JWT
- Adiciona `Authorization: Bearer <token>`
- Trata erros 401

#### 5. client/src/lib/supabase.ts
- Cliente Supabase
- Autenticação de usuários

### Banco de Dados (shared/schema.ts)

**Tabelas principais:**
- `users` - Usuários finais
- `admins` - Administradores
- `plans` - Planos de assinatura
- `subscriptions` - Assinaturas
- `payments` - Pagamentos PIX
- `whatsapp_connections` - Conexões WhatsApp
- `conversations` - Conversas
- `messages` - Mensagens
- `ai_agent_config` - Config do agente
- `system_config` - Config do sistema

---

## 🔧 Como Adicionar uma Nova Rota

### Exemplo: Adicionar rota GET /api/users/profile

**Passo 1: Adicionar função no storage.ts**
```typescript
async getUserProfile(userId: string) {
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId));
  return user;
}
```

**Passo 2: Adicionar rota em routes.ts**
```typescript
app.get("/api/users/profile", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const user = await storage.getUserProfile(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    res.json(user);
  } catch (error) {
    console.error("Error fetching profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
```

**Passo 3: Chamar do frontend**
```typescript
const { data } = await apiRequest("/api/users/profile");
```

---

## 🔄 Como Modificar Autenticação

### Cenário 1: Adicionar novo campo ao admin

**Passo 1: Atualizar schema (shared/schema.ts)**
```typescript
export const admins = pgTable("admins", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  email: varchar("email").unique().notNull(),
  passwordHash: text("password_hash").notNull(),
  role: varchar("role", { length: 50 }).default("admin").notNull(),
  departamento: varchar("departamento"), // NOVO CAMPO
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

**Passo 2: Migrar banco de dados**
```bash
# Adicionar coluna manualmente no Supabase
ALTER TABLE admins ADD COLUMN departamento VARCHAR;
```

**Passo 3: Atualizar storage.ts**
```typescript
async getAdminByEmail(email: string) {
  const [admin] = await db
    .select()
    .from(admins)
    .where(eq(admins.email, email));
  return admin; // Agora inclui departamento
}
```

### Cenário 2: Mudar hash de senha

**Passo 1: Gerar novo hash**
```bash
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('nova-senha',10).then(h=>console.log(h))"
```

**Passo 2: Atualizar no banco**
```bash
UPDATE admins SET password_hash='$2b$10$...' WHERE email='rodrigoconexao128@gmail.com';
```

**Passo 3: Testar login**
```bash
npm run dev
# Acessar http://localhost:5000/admin-login
# Fazer login com nova senha
```

---

## 🧪 Como Testar

### Teste 1: Verificar autenticação de usuário

```bash
# 1. Criar conta
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test"}'

# 2. Fazer login
curl -X POST http://localhost:5000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'

# 3. Usar token para acessar rota protegida
curl -X GET http://localhost:5000/api/auth/user \
  -H "Authorization: Bearer <token>"
```

### Teste 2: Verificar autenticação de admin

```bash
# 1. Fazer login admin
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rodrigoconexao128@gmail.com","password":"Ibira2019!"}'

# 2. Verificar sessão
curl -X GET http://localhost:5000/api/admin/session \
  -H "Cookie: connect.sid=<cookie>"

# 3. Acessar rota protegida
curl -X GET http://localhost:5000/api/admin/config \
  -H "Cookie: connect.sid=<cookie>"
```

### Teste 3: Testar agente de IA

```bash
# 1. Fazer login como usuário
# 2. Acessar /my-agent
# 3. Ativar agente
# 4. Enviar mensagem de teste
# 5. Verificar resposta do Mistral
```

---

## 📊 Fluxos Principais

### Fluxo 1: Usuário Enviando Mensagem

```
Frontend → POST /api/messages/:conversationId
  ↓ (isAuthenticated)
Backend valida JWT
  ↓
Backend busca conversation
  ↓
Backend chama whatsappSendMessage()
  ↓
Baileys envia via WhatsApp
  ↓
Backend salva em messages table
  ↓
WebSocket notifica frontend
```

### Fluxo 2: Admin Aprovando Pagamento

```
Frontend → POST /api/admin/payments/approve/:id
  ↓ (isAdmin)
Backend valida sessão admin
  ↓
Backend atualiza payment: status = "paid"
  ↓
Backend atualiza subscription: status = "active"
  ↓
Frontend atualiza lista
```

### Fluxo 3: Agente Respondendo Mensagem

```
Mensagem recebida via Baileys
  ↓
Backend salva em messages table
  ↓
Backend verifica se agent está ativo
  ↓
Backend busca histórico (últimas 10 mensagens)
  ↓
Backend chama generateAIResponse()
  ↓
Mistral retorna resposta
  ↓
Backend envia via Baileys
  ↓
Backend salva resposta (isFromAgent: true)
```

---

## 🚀 Deploy

### Desenvolvimento
```bash
npm run dev
# Acessa http://localhost:5000
```

### Produção
```bash
npm run build
NODE_ENV=production node dist/index.js
```

### Variáveis de Produção
```env
NODE_ENV=production
DATABASE_URL=postgresql://...
SESSION_SECRET=seu-secret-aleatorio
MISTRAL_API_KEY=...
PORT=5000
```

---

## 📝 Checklist para Modificações

Antes de fazer qualquer mudança:

- [ ] Ler DOCUMENTATION.md
- [ ] Ler SYSTEM_ARCHITECTURE.md
- [ ] Entender fluxo de autenticação
- [ ] Identificar qual middleware usar (isAuthenticated vs isAdmin)
- [ ] Atualizar schema se necessário
- [ ] Atualizar storage.ts
- [ ] Adicionar rota em routes.ts
- [ ] Testar com curl ou Postman
- [ ] Testar no frontend
- [ ] Verificar logs do servidor
- [ ] Fazer commit com mensagem clara

---

**Última atualização:** Novembro 2025  
**Versão:** 1.0.0

