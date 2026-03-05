# 📚 Documentação Completa do Sistema - WhatsApp CRM SaaS

## 🎯 Visão Geral

Este projeto é um **WhatsApp CRM SaaS** migrado de **Replit Auth** para **Supabase Auth**, com um sistema híbrido de autenticação:

1. **Supabase Auth (JWT)** - Para usuários finais
2. **Admin Session (Cookies)** - Para administradores

---

## 📖 Documentos Disponíveis

### 1. **DOCUMENTATION.md** (Original)
- Visão geral do sistema
- Schema do banco de dados
- API REST endpoints
- Fluxo de pagamentos PIX
- Sistema de IA (Agente Mistral)
- Migração para Supabase
- Configuração e deployment

**Quando usar:** Para entender a visão geral do projeto e referência rápida de endpoints.

---

### 2. **SYSTEM_ARCHITECTURE.md** ⭐ (NOVO - RECOMENDADO)
- Visão geral da migração (Replit → Supabase)
- **Dois sistemas de autenticação explicados em detalhes**
- Fluxo de autenticação detalhado (4 cenários)
- Estrutura de diretórios
- Componentes críticos
- Fluxos de dados
- Segurança e proteção
- Troubleshooting

**Quando usar:** Para entender como a autenticação funciona e como o sistema foi migrado.

**Leia primeiro:** Este é o documento mais importante para novos desenvolvedores.

---

### 3. **DEVELOPER_GUIDE.md** ⭐ (NOVO - RECOMENDADO)
- Instruções passo a passo para configurar ambiente
- Entender autenticação (JWT vs Session)
- Estrutura de código explicada
- Como adicionar uma nova rota
- Como modificar autenticação
- Como testar
- Fluxos principais
- Deploy

**Quando usar:** Quando você quer implementar uma nova funcionalidade.

**Leia segundo:** Este é o guia prático para desenvolvimento.

---

### 4. **DEVELOPMENT_TASKLIST.md** ⭐ (NOVO - RECOMENDADO)
- Tasklist profunda organizada por módulos
- 8 módulos principais:
  1. Autenticação
  2. Usuários e Perfil
  3. WhatsApp
  4. Agente de IA
  5. Pagamentos e Assinaturas
  6. Admin Panel
  7. Infraestrutura e Deployment
  8. Testes

- Cada tarefa inclui:
  - Descrição clara
  - Arquivos envolvidos
  - Passos específicos
  - Testes necessários
  - Dependências

**Quando usar:** Para planejar desenvolvimento futuro e entender o escopo do projeto.

**Leia terceiro:** Use como referência para novas funcionalidades.

---

### 5. **SYSTEM_FLOW_DIAGRAMS.md** ⭐ (NOVO - RECOMENDADO)
- Diagramas ASCII de fluxos principais:
  1. Arquitetura geral
  2. Fluxo de autenticação de usuário (JWT)
  3. Fluxo de autenticação de admin (Session)
  4. Fluxo de mensagem WhatsApp
  5. Fluxo de pagamento PIX

**Quando usar:** Para visualizar como os dados fluem pelo sistema.

**Leia junto com SYSTEM_ARCHITECTURE.md:** Complementam um ao outro.

---

## 🚀 Começar Rápido

### Para Novos Desenvolvedores

1. **Leia nesta ordem:**
   - [ ] SYSTEM_ARCHITECTURE.md (entender autenticação)
   - [ ] DEVELOPER_GUIDE.md (configurar ambiente)
   - [ ] SYSTEM_FLOW_DIAGRAMS.md (visualizar fluxos)

2. **Configure ambiente:**
   ```bash
   npm install
   cp .env.example .env
   npm run dev
   ```

3. **Teste autenticação:**
   - Criar conta em http://localhost:5000
   - Fazer login como admin em http://localhost:5000/admin-login
   - Credenciais: rodrigoconexao128@gmail.com / Ibira2019!

4. **Implemente sua primeira tarefa:**
   - Escolha uma tarefa em DEVELOPMENT_TASKLIST.md
   - Siga os passos em DEVELOPER_GUIDE.md
   - Teste localmente

---

## 🔐 Autenticação - Resumo Executivo

### Sistema 1: Supabase Auth (JWT) - Usuários Finais

```
Login → Supabase retorna JWT token
Token armazenado em localStorage
Requisições: Authorization: Bearer <token>
Middleware: isAuthenticated
```

**Rotas protegidas:**
- GET /api/conversations
- POST /api/messages/:conversationId
- GET /api/subscriptions/current
- POST /api/agent/test
- etc

### Sistema 2: Admin Session - Administradores

```
Login → Backend cria sessão (req.session.adminId)
Express-session salva em PostgreSQL
Cookie "connect.sid" enviado ao cliente
Requisições: Cookie: connect.sid=...
Middleware: isAdmin
```

**Rotas protegidas:**
- GET /api/admin/plans
- GET /api/admin/config
- PUT /api/admin/config
- POST /api/admin/payments/approve/:id
- etc

**Credenciais padrão:**
```
Email: rodrigoconexao128@gmail.com
Senha: Ibira2019!
```

---

## 📁 Estrutura de Diretórios

```
whatsgithub/
├── server/
│   ├── supabaseAuth.ts       ← Autenticação Supabase + Sessions
│   ├── middleware.ts         ← Proteção de rotas (isAdmin)
│   ├── routes.ts             ← Todas as rotas (826 linhas)
│   ├── storage.ts            ← Acesso ao banco
│   ├── whatsapp.ts           ← Integração Baileys
│   ├── aiAgent.ts            ← Agente Mistral
│   └── pixService.ts         ← PIX QR Code
│
├── client/src/
│   ├── pages/
│   │   ├── admin.tsx         ← Painel admin (protegido)
│   │   ├── admin-login.tsx   ← Login admin
│   │   └── dashboard.tsx     ← Dashboard usuário
│   └── lib/
│       ├── apiRequest.ts     ← HTTP com token JWT
│       └── supabase.ts       ← Cliente Supabase
│
├── shared/
│   └── schema.ts             ← Schema Drizzle (tabelas)
│
├── DOCUMENTATION.md          ← Documentação original
├── SYSTEM_ARCHITECTURE.md    ← Arquitetura migrada ⭐
├── DEVELOPER_GUIDE.md        ← Guia prático ⭐
├── DEVELOPMENT_TASKLIST.md   ← Tasklist profunda ⭐
└── SYSTEM_FLOW_DIAGRAMS.md   ← Diagramas de fluxo ⭐
```

---

## 🔧 Variáveis de Ambiente

```env
# Database (Supabase)
DATABASE_URL=postgresql://user:password@db.supabase.co:5432/postgres

# Session
SESSION_SECRET=seu-secret-aleatorio-aqui

# Supabase (opcional)
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_KEY=eyJxxx...

# Mistral API
MISTRAL_API_KEY=0bCWTkNZwH4to0Yms6v83EsP40bujdgL

# Port
PORT=5000
NODE_ENV=development
```

---

## 🧪 Testes Rápidos

### Teste 1: Login de Usuário
```bash
# Criar conta
curl -X POST http://localhost:5000/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123","firstName":"Test"}'

# Fazer login
curl -X POST http://localhost:5000/api/auth/signin \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

### Teste 2: Login de Admin
```bash
# Fazer login
curl -X POST http://localhost:5000/api/admin/login \
  -H "Content-Type: application/json" \
  -d '{"email":"rodrigoconexao128@gmail.com","password":"Ibira2019!"}'

# Verificar sessão
curl -X GET http://localhost:5000/api/admin/session \
  -H "Cookie: connect.sid=<cookie>"
```

---

## 📊 Componentes Críticos

| Arquivo | Responsabilidade | Linhas |
|---------|------------------|--------|
| server/supabaseAuth.ts | Autenticação Supabase + Sessions | 231 |
| server/middleware.ts | Proteção de rotas | 58 |
| server/routes.ts | Todas as rotas da API | 826 |
| server/storage.ts | Acesso ao banco | ~500 |
| server/whatsapp.ts | Integração Baileys | ~400 |
| server/aiAgent.ts | Agente Mistral | ~200 |
| client/src/pages/admin.tsx | Painel admin | ~300 |

---

## 🎓 Fluxos Principais

### Fluxo 1: Usuário Enviando Mensagem
```
Frontend → POST /api/messages/:conversationId
  ↓ (isAuthenticated)
Backend valida JWT
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
Backend atualiza payment e subscription
  ↓
Frontend atualiza lista
```

### Fluxo 3: Agente Respondendo Mensagem
```
Mensagem recebida via Baileys
  ↓
Backend verifica se agent está ativo
  ↓
Backend chama Mistral API
  ↓
Mistral retorna resposta
  ↓
Backend envia via Baileys
```

---

## ⚠️ Problemas Comuns

### Admin login retorna 401
**Solução:** Verificar hash de senha no banco
```bash
UPDATE admins SET password_hash='$2b$10$...' WHERE email='rodrigoconexao128@gmail.com';
```

### /admin abre sem estar logado
**Solução:** Verificar proteção de rota em client/src/pages/admin.tsx

### Agente de IA retorna 401
**Solução:** Verificar chave Mistral em system_config
```bash
SELECT valor FROM system_config WHERE chave='mistral_api_key';
```

---

## 📞 Suporte

Para dúvidas:
1. Consulte SYSTEM_ARCHITECTURE.md
2. Consulte DEVELOPER_GUIDE.md
3. Verifique SYSTEM_FLOW_DIAGRAMS.md
4. Procure em DEVELOPMENT_TASKLIST.md

---

## 📝 Checklist para Modificações

- [ ] Ler SYSTEM_ARCHITECTURE.md
- [ ] Ler DEVELOPER_GUIDE.md
- [ ] Entender fluxo de autenticação
- [ ] Identificar middleware necessário
- [ ] Atualizar schema se necessário
- [ ] Testar localmente
- [ ] Fazer commit com mensagem clara

---

**Última atualização:** Novembro 2025  
**Versão:** 2.0.0 (Migrado para Supabase)  
**Status:** ✅ Documentação Completa

