# 📋 Plano de Implementação - Cadastro com Telefone + WhatsApp Admin + Mensagem de Boas-vindas

## 🎯 Objetivo

Implementar três funcionalidades principais:
1. **Modificar formulário de cadastro** - Remover firstName/lastName, adicionar name e phone
2. **Adicionar WhatsApp no painel admin** - Permitir que admin conecte seu próprio WhatsApp
3. **Mensagem de boas-vindas automática** - Enviar mensagem quando novo cliente se cadastra

---

## 📊 Estrutura da Tasklist

### 13 Fases Principais com 50+ Subtarefas

| Fase | Nome | Subtarefas | Status |
|------|------|-----------|--------|
| 1 | Análise e Planejamento | 5 | ⏳ |
| 2 | Modificação do Schema | 4 | ⏳ |
| 3 | Schema TypeScript | 3 | ⏳ |
| 4 | Backend - Signup | 4 | ⏳ |
| 5 | Backend - WhatsApp Admin | 5 | ⏳ |
| 6 | Frontend - Signup | 3 | ⏳ |
| 7 | Frontend - Admin Panel | 4 | ⏳ |
| 8 | Testes - Cadastro | 4 | ⏳ |
| 9 | Testes - WhatsApp Admin | 3 | ⏳ |
| 10 | Testes - Mensagem | 4 | ⏳ |
| 11 | Documentação | 3 | ⏳ |
| 12 | Verificação Final | 4 | ⏳ |
| 13 | Finalização | 3 | ⏳ |

---

## 🔄 Fluxo de Implementação

```
FASE 1: Análise
    ↓
FASE 2-3: Schema (DB + TypeScript)
    ↓
FASE 4-5: Backend (Signup + WhatsApp Admin)
    ↓
FASE 6-7: Frontend (Signup + Admin Panel)
    ↓
FASE 8-10: Testes (3 rodadas cada)
    ↓
FASE 11-12: Documentação + Verificação
    ↓
FASE 13: Finalização
```

---

## 📝 Resumo das Mudanças

### Schema (Banco de Dados)

**Tabela `users` - ANTES:**
```
- firstName (varchar)
- lastName (varchar)
- telefone (varchar)
- whatsappNumber (varchar)
```

**Tabela `users` - DEPOIS:**
```
- name (varchar, obrigatório)
- phone (varchar, unique, obrigatório)
```

**Nova Tabela `admin_whatsapp_connection`:**
```
- id (UUID, PK)
- adminId (FK para admins)
- phoneNumber (varchar)
- isConnected (boolean)
- qrCode (text)
- sessionData (jsonb)
- createdAt, updatedAt
```

### Backend

**Novo Endpoint POST /api/auth/signup:**
```json
{
  "email": "user@example.com",
  "password": "password123",
  "name": "João Silva",
  "phone": "11999999999"
}
```

**Novos Endpoints Admin:**
- `POST /api/admin/whatsapp/connect` - Conectar WhatsApp
- `POST /api/admin/whatsapp/disconnect` - Desconectar
- `GET /api/admin/whatsapp/connection` - Status
- `GET /api/admin/welcome-message` - Obter mensagem
- `PUT /api/admin/welcome-message` - Atualizar mensagem

**Nova Função:**
- `sendWelcomeMessage(adminId, userPhone)` - Enviar mensagem automática

### Frontend

**Formulário de Signup:**
- Remover: firstName, lastName
- Adicionar: name, phone
- Validação de telefone em tempo real

**Painel Admin:**
- Nova aba "WhatsApp Admin"
- Componente de conexão WhatsApp
- Configuração de mensagem de boas-vindas

---

## ✅ Checklist de Implementação

### Fase 1: Análise
- [ ] Analisar schema atual
- [ ] Analisar signup atual
- [ ] Analisar WhatsApp dos clientes
- [ ] Analisar painel admin
- [ ] Criar diagrama de arquitetura

### Fase 2-3: Schema
- [ ] Criar migration para alterar users
- [ ] Criar migration para admin_whatsapp_connection
- [ ] Criar migration para system_config
- [ ] Aplicar migrations no Supabase
- [ ] Atualizar shared/schema.ts

### Fase 4-5: Backend
- [ ] Criar função validatePhoneNumber()
- [ ] Atualizar endpoint signup
- [ ] Atualizar storage.ts
- [ ] Modificar whatsapp.ts para admin
- [ ] Criar função sendWelcomeMessage()
- [ ] Adicionar rotas admin WhatsApp

### Fase 6-7: Frontend
- [ ] Atualizar formulário de signup
- [ ] Criar componente PhoneInput
- [ ] Criar AdminWhatsappPanel
- [ ] Adicionar aba WhatsApp no admin
- [ ] Criar WelcomeMessageConfig

### Fase 8-10: Testes
- [ ] Testar cadastro (3 rodadas)
- [ ] Testar WhatsApp admin (3 rodadas)
- [ ] Testar mensagem de boas-vindas (3 rodadas)
- [ ] Testar validações
- [ ] Testar tratamento de erros

### Fase 11-13: Finalização
- [ ] Atualizar documentação
- [ ] Verificação final
- [ ] Revisar código
- [ ] Testar build
- [ ] Criar relatório

---

## 🚀 Próximos Passos

1. **Revisar este plano** - Confirmar se está de acordo com os requisitos
2. **Começar FASE 1** - Análise e planejamento
3. **Executar FASE 2-3** - Modificações de schema
4. **Executar FASE 4-5** - Backend
5. **Executar FASE 6-7** - Frontend
6. **Executar FASE 8-10** - Testes
7. **Executar FASE 11-13** - Finalização

---

## 📌 Notas Importantes

- ✅ Usar Supabase MCP para migrations
- ✅ Usar Sequential Thinking para planejamento
- ✅ Testar 3 vezes cada funcionalidade
- ✅ Manter sistema simples e direto
- ✅ Não quebrar funcionalidades existentes
- ✅ Adicionar logs para debug
- ✅ Mensagem de boas-vindas NÃO bloqueia cadastro

---

## 📊 Estatísticas

- **Total de Fases:** 13
- **Total de Subtarefas:** 50+
- **Tempo Estimado:** 4-6 horas
- **Complexidade:** Média
- **Risco:** Baixo (mudanças bem isoladas)

---

**Status:** ✅ PLANO CRIADO E PRONTO PARA IMPLEMENTAÇÃO

Você quer que eu comece a implementação agora? Qual fase você gostaria de começar?

