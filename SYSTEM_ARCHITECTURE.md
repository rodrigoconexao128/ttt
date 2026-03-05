# WhatsApp CRM SaaS - Arquitetura Completa do Sistema Migrado para Supabase

## 📋 Índice
1. [Visão Geral da Migração](#visão-geral-da-migração)
2. [Dois Sistemas de Autenticação](#dois-sistemas-de-autenticação)
3. [Fluxo de Autenticação Detalhado](#fluxo-de-autenticação-detalhado)
4. [Estrutura de Diretórios](#estrutura-de-diretórios)
5. [Componentes Críticos](#componentes-críticos)
6. [Fluxos de Dados](#fluxos-de-dados)
7. [Segurança e Proteção](#segurança-e-proteção)
8. [Troubleshooting](#troubleshooting)

---

## Visão Geral da Migração

### De Replit Auth para Supabase Auth + Admin Session

**Antes (Replit):**
- Autenticação: Replit Auth (OIDC)
- Sessão: `req.session.passport.user.claims.sub`
- Database: Neon PostgreSQL
- Formato: Monolítico

**Depois (Supabase):**
- Autenticação Usuários: Supabase Auth (JWT Bearer tokens)
- Autenticação Admin: Email/Password com bcrypt + express-session
- Database: Supabase PostgreSQL
- Formato: Híbrido (JWT + Session)

### Por que dois sistemas?

1. **Supabase Auth (JWT)** - Usuários finais
   - Escalável
   - Stateless
   - Seguro com Bearer tokens
   - Integrado com Supabase

2. **Admin Session (Cookies)** - Administradores
   - Simples de usar
   - Compatível com navegadores
   - Isolado do sistema de usuários
   - Proteção adicional

---

## Dois Sistemas de Autenticação

### 1. Supabase Auth (JWT) - Para Usuários Finais

**Fluxo:**
```
Cliente → POST /api/auth/signin
  ↓
Backend chama supabase.auth.signInWithPassword()
  ↓
Supabase retorna JWT token
  ↓
Frontend armazena token em localStorage
  ↓
Requisições futuras: Authorization: Bearer <token>
```

**Middleware: `isAuthenticated`**
```typescript
// server/supabaseAuth.ts (linhas 199-229)
export const isAuthenticated: RequestHandler = async (req: any, res, next) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  
  if (error || !user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  req.user = {
    claims: {
      sub: user.id,
      email: user.email,
    }
  };

  next();
};
```

**Rotas Protegidas:**
- GET /api/auth/user
- GET /api/conversations
- POST /api/messages/:conversationId
- GET /api/subscriptions/current
- POST /api/subscriptions/create
- POST /api/agent/config
- POST /api/agent/test
- GET /api/agent/config
- POST /api/agent/toggle/:conversationId
- GET /api/agent/status/:conversationId

### 2. Admin Session - Para Administradores

**Fluxo:**
```
Admin → POST /api/admin/login (email + password)
  ↓
Backend valida com bcrypt
  ↓
Backend cria sessão: req.session.adminId = admin.id
  ↓
Express-session salva em PostgreSQL (tabela "sessions")
  ↓
Cookie "connect.sid" enviado ao cliente
  ↓
Requisições futuras: Cookie: connect.sid=...
```

**Middleware: `isAdmin`**
```typescript
// server/middleware.ts (linhas 14-58)
export async function isAdmin(req: Request, res: Response, next: NextFunction) {
  // 1. Verifica admin session (email/password login)
  const adminId = (req.session as any)?.adminId;
  if (adminId) {
    const [admin] = await db.select().from(admins).where(eq(admins.id, adminId));
    if (admin) {
      (req as any).admin = admin;
      return next();
    }
  }

  // 2. Fallback: Verifica Supabase Auth com role admin
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const userEmail = (req.user as any).claims?.email;
  const [admin] = await db.select().from(admins).where(eq(admins.email, userEmail));

  if (!admin) {
    return res.status(403).json({ message: "Forbidden - Admin access required" });
  }

  (req as any).admin = admin;
  next();
}
```

**Rotas Protegidas:**
- GET /api/admin/plans
- POST /api/admin/plans
- PUT /api/admin/plans/:id
- DELETE /api/admin/plans/:id
- GET /api/admin/subscriptions
- POST /api/admin/subscriptions
- DELETE /api/admin/subscriptions/:id
- GET /api/admin/payments/pending
- POST /api/admin/payments/approve/:id
- GET /api/admin/users
- GET /api/admin/stats
- GET /api/admin/config
- PUT /api/admin/config

---

## Fluxo de Autenticação Detalhado

### Cenário 1: Novo Usuário Criando Conta

```
1. Frontend: POST /api/auth/signup
   Body: { email, password, firstName, lastName }

2. Backend (supabaseAuth.ts:118-157):
   a) Valida email e password
   b) Chama supabase.auth.admin.createUser()
   c) Supabase cria usuário em auth.users
   d) Backend chama upsertUser() → cria em users table
   e) Retorna { success: true, user }

3. Frontend:
   a) Armazena token em localStorage
   b) Redireciona para /dashboard
   c) Requisições futuras: Authorization: Bearer <token>
```

### Cenário 2: Usuário Fazendo Login

```
1. Frontend: POST /api/auth/signin
   Body: { email, password }

2. Backend (supabaseAuth.ts:160-195):
   a) Valida email e password
   b) Chama supabase.auth.signInWithPassword()
   c) Supabase retorna JWT token
   d) Backend chama upsertUser() → atualiza em users table
   e) Retorna { success: true, session, user }

3. Frontend:
   a) Armazena token em localStorage
   b) Redireciona para /dashboard
```

### Cenário 3: Admin Fazendo Login

```
1. Frontend: POST /api/admin/login
   Body: { email, password }

2. Backend (routes.ts:35-71):
   a) Valida email e password
   b) Busca admin em admins table: storage.getAdminByEmail(email)
   c) Compara password com hash bcrypt: bcrypt.compare(password, admin.passwordHash)
   d) Se válido:
      - Cria sessão: req.session.adminId = admin.id
      - Express-session salva em PostgreSQL
      - Cookie "connect.sid" criado
   e) Retorna { success: true, admin }

3. Frontend:
   a) Armazena cookie automaticamente (httpOnly)
   b) Redireciona para /admin
   c) Requisições futuras: Cookie: connect.sid=...

4. Proteção de Rota (/admin):
   a) useEffect chama GET /api/admin/session
   b) Se não autenticado, redireciona para /admin-login
```

### Cenário 4: Verificar Sessão Admin

```
1. Frontend: GET /api/admin/session
   Headers: Cookie: connect.sid=...

2. Backend (routes.ts:74-87):
   a) Lê req.session.adminId
   b) Se existe:
      - Retorna { authenticated: true, adminId, role }
   c) Se não existe:
      - Retorna { authenticated: false }

3. Frontend:
   a) Se authenticated: mostra painel admin
   b) Se não: redireciona para /admin-login
```

---

## Estrutura de Diretórios

```
whatsgithub/
├── server/
│   ├── index.ts              # Entry point, inicia servidor
│   ├── routes.ts             # Todas as rotas da API (826 linhas)
│   ├── middleware.ts         # Middlewares (isAdmin, etc)
│   ├── supabaseAuth.ts       # Autenticação Supabase + Sessions
│   ├── db.ts                 # Conexão Drizzle ORM
│   ├── storage.ts            # Interface de acesso ao banco
│   ├── seed.ts               # Seed inicial (admin, planos)
│   ├── whatsapp.ts           # Integração Baileys
│   ├── aiAgent.ts            # Agente Mistral
│   ├── pixService.ts         # Geração PIX QR Code
│   └── websocket.ts          # WebSocket para QR Code
│
├── client/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── admin.tsx          # Painel admin (protegido)
│   │   │   ├── admin-login.tsx    # Login admin
│   │   │   ├── dashboard.tsx      # Dashboard usuário
│   │   │   ├── subscribe.tsx      # Planos e pagamentos
│   │   │   └── ...
│   │   ├── lib/
│   │   │   ├── queryClient.ts     # TanStack Query
│   │   │   ├── supabase.ts        # Cliente Supabase
│   │   │   └── apiRequest.ts      # Wrapper HTTP com token
│   │   └── components/
│   │       ├── ConfigManager.tsx  # Gerenciar config admin
│   │       └── ...
│   └── vite.config.ts
│
├── shared/
│   └── schema.ts             # Schema Drizzle (tabelas)
│
├── .env                      # Variáveis de ambiente
├── package.json
└── DOCUMENTATION.md          # Documentação original
```

---

## Componentes Críticos

### 1. server/supabaseAuth.ts
**Responsabilidade:** Autenticação Supabase + Sessions

**Funções principais:**
- `getSession()` - Configura express-session com PostgreSQL
- `setupAuth(app)` - Registra rotas de auth
- `isAuthenticated` - Middleware JWT
- `upsertUser()` - Sincroniza usuário com banco

### 2. server/middleware.ts
**Responsabilidade:** Proteção de rotas

**Funções principais:**
- `isAdmin()` - Verifica admin session OU Supabase auth com role admin

### 3. server/routes.ts
**Responsabilidade:** Todas as rotas da API

**Seções:**
- Admin auth (login, logout, session)
- WhatsApp (connect, disconnect, messages)
- Conversations
- Plans (CRUD)
- Subscriptions
- Payments
- Admin panel
- AI Agent

### 4. client/src/pages/admin.tsx
**Responsabilidade:** Painel de administração

**Proteção:**
```typescript
useEffect(() => {
  fetch("/api/admin/session", { credentials: "include" })
    .then(r => r.json())
    .then(d => {
      if (!d?.authenticated) setLocation("/admin-login");
    });
}, [setLocation]);
```

---

## Fluxos de Dados

### Fluxo 1: Usuário Enviando Mensagem WhatsApp

```
Frontend → POST /api/messages/:conversationId
  ↓ (isAuthenticated middleware)
Backend valida JWT token
  ↓
Backend busca conversation do usuário
  ↓
Backend chama whatsappSendMessage()
  ↓
Baileys envia via WhatsApp
  ↓
Backend salva em messages table
  ↓
WebSocket notifica frontend
  ↓
Frontend atualiza UI
```

### Fluxo 2: Agente de IA Respondendo Mensagem

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
generateAIResponse() chama Mistral API
  ↓
Mistral retorna resposta
  ↓
Backend envia resposta via Baileys
  ↓
Backend salva resposta em messages table (isFromAgent: true)
  ↓
WebSocket notifica frontend
```

### Fluxo 3: Admin Aprovando Pagamento

```
Admin → Admin Panel → Pagamentos
  ↓
Admin clica "Aprovar" em pagamento pendente
  ↓
Frontend → POST /api/admin/payments/approve/:id
  ↓ (isAdmin middleware)
Backend valida admin session
  ↓
Backend atualiza payment: status = "paid"
  ↓
Backend atualiza subscription: status = "active"
  ↓
Backend calcula dataFim (agora + período do plano)
  ↓
Frontend atualiza lista de pagamentos
```

---

## Segurança e Proteção

### 1. Proteção de Rotas

**Usuários Finais:**
- Middleware: `isAuthenticated`
- Valida: Bearer token JWT
- Extrai: `req.user.claims.sub` (user ID)

**Administradores:**
- Middleware: `isAdmin`
- Valida: `req.session.adminId` OU Supabase auth com role admin
- Extrai: `req.admin` (admin object)

### 2. Proteção de Dados

**Isolamento por Usuário:**
```typescript
// Exemplo: GET /api/conversations
const userId = getUserId(req); // Extrai de JWT
const conversations = await storage.getConversationsByUser(userId);
// Retorna apenas conversas do usuário autenticado
```

**Isolamento por Admin:**
```typescript
// Exemplo: GET /api/admin/users
// Apenas admins podem acessar
// Retorna todos os usuários do sistema
```

### 3. Proteção de Senha

**Admin:**
- Hash: bcrypt com 10 salt rounds
- Armazenado em: `admins.passwordHash`
- Comparação: `bcrypt.compare(password, hash)`

**Usuários Finais:**
- Gerenciado por Supabase Auth
- Não armazenado no banco local
- Validado via JWT token

### 4. Cookies Seguros

**Express-session:**
```typescript
cookie: {
  httpOnly: true,           // Não acessível via JavaScript
  secure: NODE_ENV === 'production',  // HTTPS only em produção
  maxAge: 7 * 24 * 60 * 60 * 1000,   // 7 dias
}
```

**Importante:** Em desenvolvimento (HTTP), rode com `NODE_ENV != production` para que cookies funcionem.

---

## Troubleshooting

### Problema: Admin login retorna 401 "Invalid credentials"

**Causas possíveis:**
1. Hash de senha incorreto no banco
2. Email não existe na tabela admins
3. Middleware isAdmin não reconhece sessão

**Solução:**
```bash
# 1. Verificar admin no banco
SELECT id, email, role FROM admins WHERE email='rodrigoconexao128@gmail.com';

# 2. Gerar novo hash bcrypt
node -e "const bcrypt=require('bcryptjs'); bcrypt.hash('Ibira2019!',10).then(h=>console.log(h))"

# 3. Atualizar hash no banco
UPDATE admins SET password_hash='$2b$10$...' WHERE email='rodrigoconexao128@gmail.com';

# 4. Testar login novamente
```

### Problema: /admin abre sem estar logado

**Causa:** Proteção de rota não está funcionando

**Solução:**
```typescript
// Verificar client/src/pages/admin.tsx
useEffect(() => {
  fetch("/api/admin/session", { credentials: "include" })
    .then(r => r.json())
    .then(d => {
      if (!d?.authenticated) setLocation("/admin-login");
    });
}, [setLocation]);
```

### Problema: Rotas admin retornam 401 mesmo com sessão válida

**Causa:** Middleware isAdmin não reconhece sessão

**Solução:**
```bash
# Ativar debug
DEBUG_AUTH=1 npm run dev

# Verificar logs no console
# [isAdmin] path /api/admin/config adminId <id>
```

### Problema: Agente de IA retorna 401

**Causa:** Chave Mistral API vazia no banco

**Solução:**
```bash
# 1. Verificar chave no banco
SELECT valor FROM system_config WHERE chave='mistral_api_key';

# 2. Se vazio, atualizar via Admin Panel
# Admin → Configurações → Insira chave Mistral

# 3. Ou atualizar direto no banco
UPDATE system_config SET valor='0bCWTkNZwH4to0Yms6v83EsP40bujdgL' WHERE chave='mistral_api_key';
```

---

**Última atualização:** Novembro 2025  
**Versão:** 2.0.0 (Migrado para Supabase)

