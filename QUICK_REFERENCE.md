# 🚀 Referência Rápida - WhatsApp CRM SaaS

## 📚 Documentação - Qual Ler?

```
┌─────────────────────────────────────────────────────────────┐
│ NOVO NO PROJETO?                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. README_DOCUMENTATION.md (este arquivo)                   │
│ 2. SYSTEM_ARCHITECTURE.md (entender autenticação)           │
│ 3. DEVELOPER_GUIDE.md (configurar e desenvolver)            │
│ 4. SYSTEM_FLOW_DIAGRAMS.md (visualizar fluxos)              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QUER IMPLEMENTAR ALGO?                                      │
├─────────────────────────────────────────────────────────────┤
│ 1. DEVELOPMENT_TASKLIST.md (encontre a tarefa)              │
│ 2. DEVELOPER_GUIDE.md (siga os passos)                      │
│ 3. SYSTEM_ARCHITECTURE.md (entenda o contexto)              │
│ 4. SYSTEM_FLOW_DIAGRAMS.md (visualize o fluxo)              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ PRECISA DEBUGAR?                                            │
├─────────────────────────────────────────────────────────────┤
│ 1. SYSTEM_ARCHITECTURE.md → Troubleshooting                 │
│ 2. SYSTEM_FLOW_DIAGRAMS.md → Visualize o fluxo              │
│ 3. DEVELOPER_GUIDE.md → Testes                              │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│ QUER VISÃO GERAL?                                           │
├─────────────────────────────────────────────────────────────┤
│ 1. DOCUMENTATION.md (visão geral original)                  │
│ 2. SYSTEM_ARCHITECTURE.md (arquitetura migrada)             │
│ 3. SYSTEM_FLOW_DIAGRAMS.md (diagramas)                      │
└─────────────────────────────────────────────────────────────┘
```

---

## 🔐 Autenticação - Cheat Sheet

### Supabase Auth (JWT) - Usuários Finais

**Arquivo:** `server/supabaseAuth.ts`

**Middleware:** `isAuthenticated`

**Fluxo:**
```
POST /api/auth/signin → JWT token → localStorage → Authorization: Bearer <token>
```

**Rotas Protegidas:**
- GET /api/conversations
- POST /api/messages/:conversationId
- GET /api/subscriptions/current
- POST /api/agent/test
- GET /api/agent/config
- POST /api/agent/config
- POST /api/agent/toggle/:conversationId
- GET /api/agent/status/:conversationId

**Extrair User ID:**
```typescript
const userId = req.user.claims.sub;
```

---

### Admin Session - Administradores

**Arquivo:** `server/routes.ts` (linhas 35-87)

**Middleware:** `isAdmin` (server/middleware.ts)

**Fluxo:**
```
POST /api/admin/login → req.session.adminId → Cookie: connect.sid
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

**Credenciais Padrão:**
```
Email: rodrigoconexao128@gmail.com
Senha: Ibira2019!
```

**Extrair Admin ID:**
```typescript
const adminId = (req.session as any)?.adminId;
```

---

## 🛠️ Adicionar Nova Rota

### Passo 1: Adicionar função em storage.ts
```typescript
async getMyData(userId: string) {
  const [data] = await db
    .select()
    .from(myTable)
    .where(eq(myTable.userId, userId));
  return data;
}
```

### Passo 2: Adicionar rota em routes.ts
```typescript
app.get("/api/my-data", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const data = await storage.getMyData(userId);
    res.json(data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ message: "Internal server error" });
  }
});
```

### Passo 3: Chamar do frontend
```typescript
const { data } = await apiRequest("/api/my-data");
```

---

## 🧪 Testar Rota

### Com curl
```bash
# Usuário final
curl -X GET http://localhost:5000/api/my-data \
  -H "Authorization: Bearer <token>"

# Admin
curl -X GET http://localhost:5000/api/admin/config \
  -H "Cookie: connect.sid=<cookie>"
```

### Com Node.js
```javascript
const res = await fetch('http://localhost:5000/api/my-data', {
  headers: { 'Authorization': `Bearer ${token}` }
});
const data = await res.json();
```

---

## 📊 Estrutura de Banco

### Tabelas Principais

| Tabela | Descrição | Chave Primária |
|--------|-----------|----------------|
| users | Usuários finais | id (UUID) |
| admins | Administradores | id (UUID) |
| plans | Planos de assinatura | id (UUID) |
| subscriptions | Assinaturas de usuários | id (UUID) |
| payments | Pagamentos PIX | id (UUID) |
| whatsapp_connections | Conexões WhatsApp | id (UUID) |
| conversations | Conversas | id (UUID) |
| messages | Mensagens | id (UUID) |
| ai_agent_config | Config do agente | id (UUID) |
| system_config | Config do sistema | id (UUID) |
| sessions | Sessões admin | sid (string) |

---

## 🚀 Comandos Úteis

### Desenvolvimento
```bash
npm run dev              # Inicia servidor em modo dev
npm run build            # Build para produção
npm run start            # Inicia servidor em produção
```

### Debug
```bash
DEBUG_AUTH=1 npm run dev # Ativa logs de autenticação
```

### Banco de Dados
```bash
npm run db:push          # Sincroniza schema com banco
npm run db:studio        # Abre Drizzle Studio
```

---

## 🔍 Encontrar Código

### Onde está...?

**Login de usuário?**
- Frontend: `client/src/pages/login.tsx`
- Backend: `server/supabaseAuth.ts` (linhas 160-195)

**Login de admin?**
- Frontend: `client/src/pages/admin-login.tsx`
- Backend: `server/routes.ts` (linhas 35-71)

**Proteção de rota?**
- Usuários: `server/supabaseAuth.ts` (linhas 199-229)
- Admin: `server/middleware.ts` (linhas 14-58)

**Envio de mensagem WhatsApp?**
- Backend: `server/routes.ts` (linhas ~300-350)
- Integração: `server/whatsapp.ts`

**Agente de IA?**
- Config: `server/routes.ts` (linhas ~600-700)
- Lógica: `server/aiAgent.ts`

**Pagamento PIX?**
- Geração: `server/routes.ts` (linhas ~500-550)
- Aprovação: `server/routes.ts` (linhas ~550-600)

**Admin Panel?**
- Frontend: `client/src/pages/admin.tsx`
- Proteção: `client/src/pages/admin.tsx` (useEffect)

---

## ⚠️ Erros Comuns

### 401 Unauthorized
**Causa:** Token JWT inválido ou expirado
**Solução:** Fazer login novamente

### 403 Forbidden
**Causa:** Usuário não tem permissão
**Solução:** Verificar role do usuário

### 500 Internal Server Error
**Solução:** Verificar logs do servidor

### Admin login retorna 401
**Causa:** Hash de senha incorreto
**Solução:** Atualizar hash no banco

### /admin abre sem estar logado
**Causa:** Proteção de rota não funciona
**Solução:** Verificar useEffect em admin.tsx

### Agente de IA retorna 401
**Causa:** Chave Mistral vazia
**Solução:** Configurar em Admin Panel → Configurações

---

## 📝 Checklist Antes de Commitar

- [ ] Código testado localmente
- [ ] Sem console.log de debug
- [ ] Sem arquivos temporários
- [ ] Mensagem de commit clara
- [ ] Sem quebra de funcionalidades existentes

---

## 🎯 Próximos Passos

1. **Leia SYSTEM_ARCHITECTURE.md** (15 min)
2. **Configure ambiente** (5 min)
3. **Teste autenticação** (5 min)
4. **Escolha uma tarefa em DEVELOPMENT_TASKLIST.md** (5 min)
5. **Implemente** (30+ min)

---

## 📞 Referências Rápidas

**Documentação Oficial:**
- Supabase: https://supabase.com/docs
- Baileys: https://github.com/WhiskeySockets/Baileys
- Mistral: https://docs.mistral.ai
- Express: https://expressjs.com
- React: https://react.dev

**Arquivos Críticos:**
- `server/supabaseAuth.ts` - Autenticação
- `server/middleware.ts` - Proteção
- `server/routes.ts` - Rotas
- `shared/schema.ts` - Schema
- `client/src/pages/admin.tsx` - Admin Panel

---

**Última atualização:** Novembro 2025  
**Versão:** 1.0.0

