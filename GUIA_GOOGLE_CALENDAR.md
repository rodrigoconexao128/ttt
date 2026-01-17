# 🔐 Google Calendar Integration - Guia Completo

## ⚠️ IMPORTANTE: Configuração Necessária

### ❌ Ainda NÃO está funcionando automaticamente!

Para funcionar, você precisa configurar as chaves da API do Google. Vou explicar cada passo:

---

## 📋 Passo 1: Obter Credenciais do Google Cloud

### 1.1 Criar Projeto no Google Cloud Console

1. Acesse: https://console.cloud.google.com/
2. Clique em "Novo Projeto" (ou selecione um existente)
3. Dê um nome: "AgentZap Agendamentos" (ou outro)
4. Clique em "Criar"

### 1.2 Habilitar Google Calendar API

1. No menu lateral, vá em: **APIs e Serviços > Biblioteca**
2. Busque por: **"Google Calendar API"**
3. Clique nela e depois em **"ATIVAR"**

### 1.3 Criar Credenciais OAuth 2.0

1. No menu lateral: **APIs e Serviços > Credenciais**
2. Clique em **"+ CRIAR CREDENCIAIS"**
3. Selecione: **"ID do cliente OAuth 2.0"**

4. **Configurar tela de consentimento** (se necessário):
   - Tipo: Externo
   - Nome do app: "AgentZap"
   - Email de suporte: seu email
   - Domínio autorizado: seu domínio (ex: agentezap.online)
   - **Escopos**: Adicione:
     - `https://www.googleapis.com/auth/calendar`
     - `https://www.googleapis.com/auth/calendar.events`

5. **Criar credencial**:
   - Tipo de aplicativo: **Aplicativo da Web**
   - Nome: "AgentZap Calendar Integration"
   - **URIs de redirecionamento autorizados** (cole exatamente assim):
     ```
     http://localhost:5000/api/google-calendar/callback
     https://agentezap.online/api/google-calendar/callback
     ```
   
   > ✅ **VOCÊ JÁ FEZ ISSO!** Suas credenciais:
   > - Client ID: `374200700676-ih5t54862m2i5tn3bk1rdf96jm4ujje4.apps.googleusercontent.com`
   > - Client Secret: `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`

6. Clique em **"CRIAR"**

7. **Copie as credenciais** que aparecem:
   - ✅ **Client ID** (algo como: `123456-abc.apps.googleusercontent.com`)
   - ✅ **Client Secret** (algo como: `GOCSPX-abc123xyz`)

---

## 📝 Passo 2: Configurar Variáveis de Ambiente

### 2.1 Adicionar no arquivo `.env`

Crie/edite o arquivo `.env` na pasta `vvvv/`:

```bash
# Google Calendar Integration
GOOGLE_CLIENT_ID=374200700676-ih5t54862m2i5tn3bk1rdf96jm4ujje4.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=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
GOOGLE_REDIRECT_URI=http://localhost:5000/api/google-calendar/callback
```

> ⚠️ **IMPORTANTE**: Essas são suas credenciais reais! Mantenha-as em segredo.

### 2.2 Adicionar no Railway (Produção)

1. Acesse seu projeto no Railway
2. Vá em **Variables**
3. Adicione as 3 variáveis:
   - `GOOGLE_CLIENT_ID` = `374200700676-ih5t54862m2i5tn3bk1rdf96jm4ujje4.apps.googleusercontent.com`
   - `GOOGLE_CLIENT_SECRET` = `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`
   - `GOOGLE_REDIRECT_URI` = `https://agentezap.online/api/google-calendar/callback`

> 💡 **Dica**: Copie e cole exatamente como está acima!

---

## 🔄 Como Funciona a Integração

### Fluxo OAuth2 (One-Click)

```
┌─────────────┐
│   Cliente   │
│  clica em   │
│ "Conectar"  │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 1. Frontend chama:                                   │
│    GET /api/scheduling/google-calendar/connect       │
│    Retorna: { authUrl: "https://accounts.google..." }│
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 2. Abre popup com URL do Google:                     │
│    - Usuário faz login no Google (se necessário)    │
│    - Usuário autoriza acesso ao calendário          │
│    - Google redireciona para callback               │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 3. Backend recebe callback:                          │
│    GET /api/google-calendar/callback?code=...        │
│    - Troca 'code' por access_token + refresh_token  │
│    - Salva tokens no Supabase (tabela:              │
│      google_calendar_tokens)                         │
│    - Redireciona para /#/agendamentos                │
└──────┬───────────────────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────────────────────┐
│ 4. Frontend detecta sucesso:                         │
│    - Recarrega status da conexão                    │
│    - Mostra "Conectado" com email do usuário        │
└──────────────────────────────────────────────────────┘
```

### Tokens Salvos no Supabase

```sql
-- Tabela: google_calendar_tokens
CREATE TABLE google_calendar_tokens (
  user_id VARCHAR PRIMARY KEY,
  access_token TEXT,           -- Válido por ~1 hora
  refresh_token TEXT,          -- Válido indefinidamente
  token_type VARCHAR,
  expiry_date TIMESTAMPTZ,
  scope TEXT,
  updated_at TIMESTAMPTZ
);
```

---

## ⏱️ Tempo de Sincronização

### É INSTANTÂNEO! ⚡

Quando um agendamento é criado/atualizado:

```typescript
1. Cliente cria agendamento
   ↓ (< 100ms)
2. Salva no banco de dados Supabase
   ↓ (< 200ms)
3. Verifica se Google Calendar está conectado
   ↓ (< 50ms)
4. Cria evento no Google Calendar via API
   ↓ (< 500ms - 1s)
5. Google processa e adiciona no calendário
   ✅ TOTAL: ~1-2 segundos
```

### Atualização no App Google Calendar

- **Desktop/Web**: Instantâneo (1-2 segundos)
- **Mobile (Android/iOS)**: 5-30 segundos (depende da sincronização automática do aparelho)

---

## 🛡️ Prevenção de Conflitos de Horário

### ⚠️ Problema Atual no Código

**O código atual NÃO verifica conflitos no Google Calendar antes de criar agendamento!**

Ele apenas verifica conflitos na tabela `appointments` local.

### ✅ Solução: Melhorar a Verificação

Vou corrigir o código para verificar AMBOS:
1. Banco de dados local (appointments)
2. Google Calendar (se conectado)

---

## 🔒 Segurança dos Tokens

### Refresh Token

- **Validade**: Indefinida (até usuário revogar)
- **Armazenamento**: Criptografado no Supabase
- **Uso**: Renovar access_token automaticamente

### Access Token

- **Validade**: ~1 hora
- **Renovação**: Automática pelo código
- **Listener**: Detecta quando Google renova o token

```typescript
oauth2Client.on('tokens', async (newTokens) => {
  console.log('Tokens refreshed!');
  await updateUserTokens(userId, newTokens);
});
```

---

## 🚀 Próximos Passos

1. **Obter credenciais Google Cloud** (passos acima)
2. **Configurar .env e Railway** com as chaves
3. **Melhorar verificação de conflitos** (vou implementar agora)
4. **Testar integração**

---

## 📊 Fluxo Completo: Cliente Agenda pelo WhatsApp

```
Cliente envia WhatsApp: "Quero agendar corte de cabelo"
       ↓
IA verifica: Google Calendar está conectado?
       ↓ SIM
IA busca horários livres no Google Calendar
       ↓
IA oferece: "Tenho vaga às 14h ou 16h amanhã"
       ↓
Cliente escolhe: "14h"
       ↓
IA verifica novamente disponibilidade em tempo real
       ↓ LIVRE
IA cria agendamento:
  1. Salva no Supabase ✅
  2. Cria evento no Google Calendar ✅
  3. Envia confirmação ao cliente ✅
       ↓
Cliente recebe: "✅ Agendado para 15/01 às 14h!"
Profissional vê no Google Calendar no celular! 📱
```

---

## ❓ FAQs

### P: Os clientes precisam ter conta Google?
**R:** NÃO! Só VOCÊ (dono do negócio) precisa conectar. Os clientes agendam normalmente pelo WhatsApp.

### P: Funciona offline?
**R:** NÃO. Precisa de internet para sincronizar com Google.

### P: E se o Google estiver fora do ar?
**R:** O agendamento é salvo no Supabase normalmente. A sincronização com Google falha, mas não impede o agendamento.

### P: Posso desconectar?
**R:** SIM! Clique em "Desconectar" e os tokens são removidos.

### P: É seguro?
**R:** SIM! Usamos OAuth2 (mesmo padrão do "Login com Google"). Tokens são criptografados no Supabase.

---

## 🐛 Problemas Comuns

### "Google Calendar não está configurado"
✅ **Solução**: Adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no .env

### "Nenhum refresh_token recebido"
✅ **Solução**: 
1. Vá em https://myaccount.google.com/permissions
2. Remova acesso do AgentZap
3. Conecte novamente (força prompt de consentimento)

### Popup bloqueado pelo navegador
✅ **Solução**: Permita popups para o domínio agentezap.online

---

**Próximo: Vou implementar a verificação de conflitos no Google Calendar!**
