# 🚀 COMECE AQUI - WhatsApp CRM SaaS

## 👋 Bem-vindo!

Você está em um projeto **WhatsApp CRM SaaS** migrado de **Replit** para **Supabase**.

A documentação completa foi criada para você entender tudo sobre o sistema.

---

## ⚡ Início Rápido (5 minutos)

### 1. Entenda a Estrutura
```
Projeto tem 2 sistemas de autenticação:

1️⃣ Supabase Auth (JWT)
   └─ Para usuários finais
   └─ Token Bearer em requisições
   └─ Armazenado em localStorage

2️⃣ Admin Session (Cookies)
   └─ Para administradores
   └─ Cookie connect.sid
   └─ Armazenado em PostgreSQL
```

### 2. Credenciais Padrão
```
Admin:
  Email: rodrigoconexao128@gmail.com
  Senha: Ibira2019!

Mistral API Key:
  0bCWTkNZwH4to0Yms6v83EsP40bujdgL
```

### 3. Inicie o Servidor
```bash
npm install
npm run dev
```

### 4. Acesse a Aplicação
```
Frontend: http://localhost:5000
Admin:    http://localhost:5000/admin-login
```

---

## 📚 Qual Documento Ler?

### 🆕 Você é novo no projeto?
```
1. INDEX.md (10 min)
   └─ Entenda a estrutura da documentação

2. README_DOCUMENTATION.md (15 min)
   └─ Visão geral do projeto

3. SYSTEM_ARCHITECTURE.md (45 min)
   └─ Como o sistema funciona

4. DEVELOPER_GUIDE.md (40 min)
   └─ Como desenvolver
```

### 💻 Quer implementar algo?
```
1. DEVELOPMENT_TASKLIST.md (15 min)
   └─ Encontre a tarefa

2. DEVELOPER_GUIDE.md (30 min)
   └─ Siga os passos

3. QUICK_REFERENCE.md (10 min)
   └─ Referência rápida
```

### 🐛 Precisa debugar?
```
1. QUICK_REFERENCE.md (5 min)
   └─ Erros comuns

2. SYSTEM_ARCHITECTURE.md (15 min)
   └─ Troubleshooting

3. SYSTEM_FLOW_DIAGRAMS.md (10 min)
   └─ Visualize o fluxo
```

---

## 🗂️ Documentos Disponíveis

| Documento | O Quê | Quando Usar |
|-----------|-------|------------|
| **INDEX.md** | Índice completo | Comece aqui |
| **README_DOCUMENTATION.md** | Visão geral | Entender projeto |
| **QUICK_REFERENCE.md** | Referência rápida | Durante desenvolvimento |
| **SYSTEM_ARCHITECTURE.md** | Arquitetura completa | Entender sistema |
| **DEVELOPER_GUIDE.md** | Guia prático | Implementar |
| **DEVELOPMENT_TASKLIST.md** | Tarefas organizadas | Planejar |
| **SYSTEM_FLOW_DIAGRAMS.md** | Diagramas visuais | Visualizar fluxos |
| **DOCUMENTATION.md** | Referência original | Endpoints, schema |

---

## 🎯 Roteiros de Leitura

### Roteiro 1: Novo Desenvolvedor (2 horas)
```
INDEX.md (10 min)
    ↓
README_DOCUMENTATION.md (15 min)
    ↓
QUICK_REFERENCE.md (10 min)
    ↓
SYSTEM_ARCHITECTURE.md (45 min)
    ↓
DEVELOPER_GUIDE.md (40 min)
    ↓
SYSTEM_FLOW_DIAGRAMS.md (20 min)
```

### Roteiro 2: Implementar Funcionalidade (1 hora)
```
DEVELOPMENT_TASKLIST.md (15 min)
    ↓
DEVELOPER_GUIDE.md (30 min)
    ↓
QUICK_REFERENCE.md (10 min)
    ↓
SYSTEM_ARCHITECTURE.md (5 min)
```

### Roteiro 3: Debugar Problema (30 min)
```
QUICK_REFERENCE.md (5 min)
    ↓
SYSTEM_ARCHITECTURE.md (15 min)
    ↓
SYSTEM_FLOW_DIAGRAMS.md (10 min)
```

---

## 🔐 Autenticação - Resumo

### Para Usuários Finais (JWT)
```typescript
// Login
POST /api/auth/signin
{email, password}
→ Retorna JWT token

// Usar token
Authorization: Bearer <token>

// Middleware
isAuthenticated
```

### Para Administradores (Session)
```typescript
// Login
POST /api/admin/login
{email, password}
→ Cria sessão (req.session.adminId)

// Usar sessão
Cookie: connect.sid=...

// Middleware
isAdmin
```

---

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento
npm run dev              # Inicia servidor

# Build
npm run build            # Build para produção
npm run start            # Inicia em produção

# Debug
DEBUG_AUTH=1 npm run dev # Ativa logs de autenticação

# Banco de dados
npm run db:push          # Sincroniza schema
npm run db:studio        # Abre Drizzle Studio
```

---

## 📁 Estrutura de Diretórios

```
whatsgithub/
├── server/
│   ├── supabaseAuth.ts       ← Autenticação
│   ├── middleware.ts         ← Proteção de rotas
│   ├── routes.ts             ← Todas as rotas
│   ├── storage.ts            ← Banco de dados
│   ├── whatsapp.ts           ← WhatsApp
│   ├── aiAgent.ts            ← Agente IA
│   └── pixService.ts         ← PIX
│
├── client/src/
│   ├── pages/
│   │   ├── admin.tsx         ← Painel admin
│   │   ├── admin-login.tsx   ← Login admin
│   │   └── dashboard.tsx     ← Dashboard
│   └── lib/
│       ├── apiRequest.ts     ← HTTP com token
│       └── supabase.ts       ← Cliente Supabase
│
├── shared/
│   └── schema.ts             ← Schema do banco
│
└── 📚 DOCUMENTAÇÃO
    ├── INDEX.md
    ├── README_DOCUMENTATION.md
    ├── QUICK_REFERENCE.md
    ├── SYSTEM_ARCHITECTURE.md
    ├── DEVELOPER_GUIDE.md
    ├── DEVELOPMENT_TASKLIST.md
    ├── SYSTEM_FLOW_DIAGRAMS.md
    └── DOCUMENTATION.md
```

---

## ✅ Checklist de Início

- [ ] Leia INDEX.md
- [ ] Leia README_DOCUMENTATION.md
- [ ] Clone o repositório
- [ ] Execute `npm install`
- [ ] Configure `.env`
- [ ] Execute `npm run dev`
- [ ] Acesse http://localhost:5000
- [ ] Teste login de usuário
- [ ] Teste login de admin
- [ ] Leia SYSTEM_ARCHITECTURE.md

---

## 🆘 Problemas Comuns

### Admin login retorna 401
**Solução:** Verificar hash de senha no banco

### /admin abre sem estar logado
**Solução:** Verificar proteção de rota em admin.tsx

### Agente de IA retorna 401
**Solução:** Verificar chave Mistral em Admin Panel

### Cookies não funcionam em localhost
**Solução:** Rodar em modo desenvolvimento (npm run dev)

---

## 📞 Próximos Passos

1. **Leia INDEX.md** (10 min)
2. **Escolha seu roteiro** (novo dev, implementar ou debugar)
3. **Siga os documentos** na ordem recomendada
4. **Mantenha QUICK_REFERENCE.md aberto** durante desenvolvimento

---

## 🎓 Recursos

- **Supabase:** https://supabase.com/docs
- **Baileys:** https://github.com/WhiskeySockets/Baileys
- **Mistral:** https://docs.mistral.ai
- **Express:** https://expressjs.com
- **React:** https://react.dev

---

## 📝 Resumo

```
✅ Projeto migrado de Replit para Supabase
✅ Dois sistemas de autenticação funcionando
✅ Documentação completa criada
✅ Pronto para desenvolvimento

Próximo passo: Leia INDEX.md
```

---

**Bem-vindo ao projeto! 🚀**

Comece lendo **INDEX.md** para entender a estrutura da documentação.

Depois escolha seu roteiro e siga os documentos na ordem recomendada.

Boa sorte! 💪

