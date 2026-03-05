# Diagramas de Fluxo do Sistema

## 1. Arquitetura Geral

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENTE (Browser)                         │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  React SPA (Vite)                                        │   │
│  │  - Dashboard                                             │   │
│  │  - Admin Panel                                           │   │
│  │  - Conversas WhatsApp                                    │   │
│  │  - Agente de IA                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ HTTP/WebSocket
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                    SERVIDOR (Express)                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Rotas API                                               │   │
│  │  - Auth (Supabase JWT)                                   │   │
│  │  - Admin (Session)                                       │   │
│  │  - WhatsApp                                              │   │
│  │  - Conversas                                             │   │
│  │  - Pagamentos                                            │   │
│  │  - Agente IA                                             │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Middlewares                                             │   │
│  │  - isAuthenticated (JWT)                                 │   │
│  │  - isAdmin (Session)                                     │   │
│  └──────────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Serviços                                                │   │
│  │  - Baileys (WhatsApp)                                    │   │
│  │  - Mistral AI                                            │   │
│  │  - PIX QR Code                                           │   │
│  └──────────────────────────────────────────────────────────┘   │
└────────────────────────┬────────────────────────────────────────┘
                         │ PostgreSQL
                         │
┌────────────────────────▼────────────────────────────────────────┐
│                  BANCO DE DADOS (Supabase)                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Tabelas                                                 │   │
│  │  - users, admins, plans, subscriptions, payments         │   │
│  │  - whatsapp_connections, conversations, messages         │   │
│  │  - ai_agent_config, system_config, sessions             │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Fluxo de Autenticação de Usuário (JWT)

```
┌─────────────────────────────────────────────────────────────────┐
│ USUÁRIO NOVO - CRIAR CONTA                                      │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Supabase
   │                                 │                           │
   │ POST /api/auth/signup           │                           │
   │ {email, password, name}         │                           │
   ├────────────────────────────────>│                           │
   │                                 │ admin.createUser()        │
   │                                 ├──────────────────────────>│
   │                                 │                    Cria usuário
   │                                 │<──────────────────────────┤
   │                                 │ {user, session}           │
   │                                 │                           │
   │                                 │ upsertUser() em users table
   │                                 │ (sincroniza com banco local)
   │                                 │                           │
   │ {success, user}                 │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
   │ Armazena token em localStorage  │                           │
   │ Redireciona para /dashboard     │                           │
   │                                 │                           │

┌─────────────────────────────────────────────────────────────────┐
│ USUÁRIO EXISTENTE - FAZER LOGIN                                 │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Supabase
   │                                 │                           │
   │ POST /api/auth/signin           │                           │
   │ {email, password}               │                           │
   ├────────────────────────────────>│                           │
   │                                 │ signInWithPassword()      │
   │                                 ├──────────────────────────>│
   │                                 │                    Valida credenciais
   │                                 │<──────────────────────────┤
   │                                 │ {user, session, token}    │
   │                                 │                           │
   │                                 │ upsertUser() em users table
   │                                 │                           │
   │ {success, session, user}        │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
   │ Armazena token em localStorage  │                           │
   │ Redireciona para /dashboard     │                           │
   │                                 │                           │

┌─────────────────────────────────────────────────────────────────┐
│ REQUISIÇÃO PROTEGIDA - USAR TOKEN JWT                           │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Supabase
   │                                 │                           │
   │ GET /api/conversations          │                           │
   │ Authorization: Bearer <token>   │                           │
   ├────────────────────────────────>│                           │
   │                                 │ isAuthenticated middleware │
   │                                 │ supabase.auth.getUser()   │
   │                                 ├──────────────────────────>│
   │                                 │                    Valida token
   │                                 │<──────────────────────────┤
   │                                 │ {user}                    │
   │                                 │                           │
   │                                 │ req.user.claims.sub = user.id
   │                                 │ Busca conversas do usuário
   │                                 │                           │
   │ [conversations]                 │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
```

---

## 3. Fluxo de Autenticação de Admin (Session)

```
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN - FAZER LOGIN                                             │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Database
   │                                 │                           │
   │ POST /api/admin/login           │                           │
   │ {email, password}               │                           │
   ├────────────────────────────────>│                           │
   │                                 │ getAdminByEmail(email)    │
   │                                 ├──────────────────────────>│
   │                                 │                    SELECT * FROM admins
   │                                 │<──────────────────────────┤
   │                                 │ {admin}                   │
   │                                 │                           │
   │                                 │ bcrypt.compare(password, hash)
   │                                 │ ✓ Válido                  │
   │                                 │                           │
   │                                 │ req.session.adminId = admin.id
   │                                 │ express-session salva em DB
   │                                 │ Cookie: connect.sid=...   │
   │                                 │                           │
   │ {success, admin}                │                           │
   │ Set-Cookie: connect.sid=...     │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
   │ Cookie armazenado automaticamente│                           │
   │ Redireciona para /admin         │                           │
   │                                 │                           │

┌─────────────────────────────────────────────────────────────────┐
│ ADMIN - ACESSAR PAINEL                                          │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Database
   │                                 │                           │
   │ GET /admin (página)             │                           │
   │ useEffect → GET /api/admin/session
   │ Cookie: connect.sid=...         │                           │
   ├────────────────────────────────>│                           │
   │                                 │ Lê req.session.adminId    │
   │                                 │ ✓ Existe                  │
   │                                 │                           │
   │ {authenticated: true, adminId}  │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
   │ Mostra painel admin             │                           │
   │                                 │                           │

┌─────────────────────────────────────────────────────────────────┐
│ ADMIN - REQUISIÇÃO PROTEGIDA                                    │
└─────────────────────────────────────────────────────────────────┘

Frontend                          Backend                    Database
   │                                 │                           │
   │ GET /api/admin/config           │                           │
   │ Cookie: connect.sid=...         │                           │
   ├────────────────────────────────>│                           │
   │                                 │ isAdmin middleware        │
   │                                 │ Verifica req.session.adminId
   │                                 │ ✓ Existe                  │
   │                                 │                           │
   │                                 │ SELECT * FROM admins WHERE id=...
   │                                 ├──────────────────────────>│
   │                                 │<──────────────────────────┤
   │                                 │ {admin}                   │
   │                                 │                           │
   │                                 │ Busca system_config       │
   │                                 ├──────────────────────────>│
   │                                 │<──────────────────────────┤
   │                                 │ {mistral_key, pix_key}    │
   │                                 │                           │
   │ {mistral_api_key, pix_key}      │                           │
   │<────────────────────────────────┤                           │
   │                                 │                           │
```

---

## 4. Fluxo de Mensagem WhatsApp

```
┌─────────────────────────────────────────────────────────────────┐
│ USUÁRIO ENVIANDO MENSAGEM                                       │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                Baileys         WhatsApp
   │                       │                       │               │
   │ POST /messages/:id    │                       │               │
   │ {text}                │                       │               │
   ├──────────────────────>│                       │               │
   │                       │ isAuthenticated       │               │
   │                       │ Valida JWT            │               │
   │                       │                       │               │
   │                       │ whatsappSendMessage() │               │
   │                       ├──────────────────────>│               │
   │                       │                       │ Envia via WA  │
   │                       │                       ├──────────────>│
   │                       │                       │<──────────────┤
   │                       │                       │ ✓ Enviado     │
   │                       │<──────────────────────┤               │
   │                       │                       │               │
   │                       │ Salva em messages table
   │                       │ Atualiza conversation │               │
   │                       │                       │               │
   │ {success, message}    │                       │               │
   │<──────────────────────┤                       │               │
   │                       │                       │               │
   │ WebSocket notifica    │                       │               │
   │ Atualiza UI           │                       │               │
   │                       │                       │               │

┌─────────────────────────────────────────────────────────────────┐
│ RECEBENDO MENSAGEM + AGENTE DE IA                               │
└─────────────────────────────────────────────────────────────────┘

WhatsApp            Baileys             Backend                Database
   │                   │                    │                      │
   │ Mensagem recebida │                    │                      │
   ├──────────────────>│                    │                      │
   │                   │ Evento: message    │                      │
   │                   ├───────────────────>│                      │
   │                   │                    │ Salva em messages    │
   │                   │                    ├─────────────────────>│
   │                   │                    │                      │
   │                   │                    │ Verifica agent ativo │
   │                   │                    ├─────────────────────>│
   │                   │                    │ ✓ Ativo              │
   │                   │                    │<─────────────────────┤
   │                   │                    │                      │
   │                   │                    │ Busca histórico      │
   │                   │                    ├─────────────────────>│
   │                   │                    │ (últimas 10 msgs)    │
   │                   │                    │<─────────────────────┤
   │                   │                    │                      │
   │                   │                    │ generateAIResponse() │
   │                   │                    │ Chama Mistral API    │
   │                   │                    │                      │
   │                   │                    │ Mistral retorna      │
   │                   │                    │ resposta             │
   │                   │                    │                      │
   │                   │ Envia resposta     │                      │
   │                   │<───────────────────┤                      │
   │<──────────────────┤                    │                      │
   │ ✓ Enviado         │                    │ Salva resposta       │
   │                   │                    │ (isFromAgent: true)  │
   │                   │                    ├─────────────────────>│
   │                   │                    │                      │
   │                   │                    │ WebSocket notifica   │
   │                   │                    │ frontend             │
   │                   │                    │                      │
```

---

## 5. Fluxo de Pagamento PIX

```
┌─────────────────────────────────────────────────────────────────┐
│ USUÁRIO ESCOLHENDO PLANO                                        │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                Database
   │                       │                      │
   │ GET /api/plans        │                      │
   ├──────────────────────>│                      │
   │                       │ SELECT * FROM plans  │
   │                       │ WHERE ativo = true   │
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │ [plans]              │
   │ [plans]               │                      │
   │<──────────────────────┤                      │
   │                       │                      │
   │ Mostra planos         │                      │
   │ Usuário clica "Assinar"
   │                       │                      │

┌─────────────────────────────────────────────────────────────────┐
│ CRIANDO ASSINATURA                                              │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                Database
   │                       │                      │
   │ POST /subscriptions/create
   │ {planId}              │                      │
   ├──────────────────────>│                      │
   │                       │ isAuthenticated      │
   │                       │ Valida JWT           │
   │                       │                      │
   │                       │ INSERT INTO subscriptions
   │                       │ status = "pending"   │
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │ {subscription}       │
   │ {subscription}        │                      │
   │<──────────────────────┤                      │
   │                       │                      │
   │ Redireciona para      │                      │
   │ /subscribe/:planId    │                      │
   │                       │                      │

┌─────────────────────────────────────────────────────────────────┐
│ GERANDO PIX QR CODE                                             │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                Database
   │                       │                      │
   │ POST /payments/generate-pix
   │ {subscriptionId}      │                      │
   ├──────────────────────>│                      │
   │                       │ isAuthenticated      │
   │                       │                      │
   │                       │ Busca chave PIX      │
   │                       │ (system_config)      │
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │ {pix_key}            │
   │                       │                      │
   │                       │ Gera QR Code         │
   │                       │ (qrcode-pix lib)     │
   │                       │                      │
   │                       │ INSERT INTO payments │
   │                       │ pixCode, pixQrCode   │
   │                       │ status = "pending"   │
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │ {payment}            │
   │ {payment}             │                      │
   │<──────────────────────┤                      │
   │                       │                      │
   │ Mostra QR Code        │                      │
   │ Usuário escaneia      │                      │
   │ Faz pagamento no banco│                      │
   │                       │                      │

┌─────────────────────────────────────────────────────────────────┐
│ ADMIN APROVANDO PAGAMENTO                                       │
└─────────────────────────────────────────────────────────────────┘

Frontend                Backend                Database
   │                       │                      │
   │ GET /admin/payments/pending
   │ Cookie: connect.sid   │                      │
   ├──────────────────────>│                      │
   │                       │ isAdmin              │
   │                       │ Valida sessão        │
   │                       │                      │
   │                       │ SELECT * FROM payments
   │                       │ WHERE status = "pending"
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │ [payments]           │
   │ [payments]            │                      │
   │<──────────────────────┤                      │
   │                       │                      │
   │ Admin clica "Aprovar" │                      │
   │                       │                      │
   │ POST /admin/payments/approve/:id
   │ Cookie: connect.sid   │                      │
   ├──────────────────────>│                      │
   │                       │ isAdmin              │
   │                       │                      │
   │                       │ UPDATE payments      │
   │                       │ status = "paid"      │
   │                       │ dataPagamento = now  │
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │                      │
   │                       │ UPDATE subscriptions │
   │                       │ status = "active"    │
   │                       │ dataInicio = now     │
   │                       │ dataFim = now + período
   │                       ├─────────────────────>│
   │                       │<─────────────────────┤
   │                       │                      │
   │ {success: true}       │                      │
   │<──────────────────────┤                      │
   │                       │                      │
   │ Atualiza lista        │                      │
   │ Notifica usuário      │                      │
   │                       │                      │
```

---

**Última atualização:** Novembro 2025  
**Versão:** 1.0.0

