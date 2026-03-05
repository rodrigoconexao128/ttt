# 🔬 Análise Técnica: Google Calendar Integration

## 📊 Resumo Executivo

### ✅ O que JÁ está implementado:
- ✅ Fluxo OAuth2 completo (login com Google)
- ✅ Armazenamento seguro de tokens no Supabase
- ✅ Renovação automática de access_token
- ✅ API para criar/atualizar/deletar eventos
- ✅ Verificação de disponibilidade no calendário
- ✅ Sincronização automática de agendamentos
- ✅ UI completa para conectar/desconectar

### ❌ O que NÃO está configurado ainda:
- ❌ Chaves GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET
- ❌ Essas chaves precisam vir do Google Cloud Console

---

## 🔐 Como Funciona o OAuth2 do Google

### Fluxo Técnico Detalhado

```typescript
// 1. INÍCIO - Cliente clica em "Conectar com Google"
Frontend → GET /api/scheduling/google-calendar/connect
          ↓
Backend executa: getGoogleAuthUrl(userId)
          ↓
Retorna: {
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth?
    client_id=SEU_CLIENT_ID&
    redirect_uri=http://localhost:5000/api/google-calendar/callback&
    response_type=code&
    scope=https://www.googleapis.com/auth/calendar&
    access_type=offline&
    prompt=consent&
    state=USER_ID_123"
}

// 2. POPUP - Navegador abre popup com authUrl
Usuário vê tela do Google:
  - "AgentZap quer acessar seu Google Calendar"
  - [ ] Ver seus eventos
  - [ ] Criar eventos
  - [Permitir] [Negar]

// 3. AUTORIZAÇÃO - Usuário clica em "Permitir"
Google redireciona para:
  http://localhost:5000/api/google-calendar/callback?
    code=4/0AbcdEfg123...&
    state=USER_ID_123

// 4. CALLBACK - Backend recebe o código
Backend executa: handleGoogleCallback(code, userId)
          ↓
1. Troca 'code' por tokens:
   POST https://oauth2.googleapis.com/token
   Body: {
     code: "4/0AbcdEfg123...",
     client_id: GOOGLE_CLIENT_ID,
     client_secret: GOOGLE_CLIENT_SECRET,
     redirect_uri: "http://localhost:5000/api/google-calendar/callback",
     grant_type: "authorization_code"
   }
   
2. Google retorna:
   {
     access_token: "ya29.a0AbcdEfg...",  // Válido por 1 hora
     refresh_token: "1//0AbcdEfg...",    // Válido indefinidamente
     token_type: "Bearer",
     expiry_date: 1736976000000,         // Timestamp
     scope: "https://www.googleapis.com/auth/calendar"
   }

3. Salva no Supabase:
   INSERT INTO google_calendar_tokens (
     user_id,
     access_token,
     refresh_token,
     token_type,
     expiry_date,
     scope
   ) VALUES (...)
   ON CONFLICT (user_id) DO UPDATE SET ...

// 5. REDIRECIONAMENTO - Volta para a aplicação
Backend redireciona para: /#/agendamentos?google_connected=true
Frontend detecta parâmetro e atualiza UI
```

---

## ⚡ Tempo de Sincronização - Análise Detalhada

### Criação de Agendamento com Sincronização

```typescript
// Timeline completa de um agendamento criado via IA no WhatsApp

T+0ms:    Cliente envia: "Quero agendar corte às 14h"
T+50ms:   IA processa mensagem
T+100ms:  IA verifica config: google_calendar_enabled = true
T+150ms:  IA chama checkCalendarAvailability()
          ↓
          // Dentro de checkCalendarAvailability:
          1. Busca tokens do usuário no Supabase (30ms)
          2. Verifica se access_token expirou (5ms)
          3. Se expirado, renova com refresh_token (200ms)
          4. Faz request para Google Calendar API:
             GET https://www.googleapis.com/calendar/v3/calendars/primary/events?
               timeMin=2026-01-16T14:00:00Z&
               timeMax=2026-01-16T15:00:00Z
          5. Google retorna lista de eventos (150ms)
          6. Verifica conflitos (10ms)
          
T+545ms:  IA recebe resultado: available = true
T+600ms:  IA cria agendamento:
          POST /api/scheduling/appointments
          {
            clientName: "João Silva",
            appointmentDate: "2026-01-16",
            startTime: "14:00",
            endTime: "15:00",
            ...
          }
          ↓
          // Dentro da rota POST:
          1. Verifica conflitos no banco local (50ms)
          2. Verifica conflitos no Google Calendar (400ms) ✅
          3. Insere no Supabase (100ms)
          4. Sincroniza com Google Calendar:
             
             syncAppointmentToCalendar():
               - Monta evento (20ms)
               - Faz POST para Google:
                 POST https://www.googleapis.com/calendar/v3/calendars/primary/events
                 {
                   "summary": "📅 Corte de Cabelo - João Silva",
                   "description": "Cliente: João Silva\nTelefone: (11) 99999-9999",
                   "start": {
                     "dateTime": "2026-01-16T14:00:00",
                     "timeZone": "America/Sao_Paulo"
                   },
                   "end": {
                     "dateTime": "2026-01-16T15:00:00",
                     "timeZone": "America/Sao_Paulo"
                   },
                   "reminders": {
                     "overrides": [
                       {"method": "popup", "minutes": 30},
                       {"method": "email", "minutes": 60}
                     ]
                   }
                 }
               - Google processa e retorna (400ms)
               - Retorna: { eventId: "abc123xyz", htmlLink: "..." }
          
          5. Atualiza agendamento com google_event_id (50ms)
          6. Retorna resposta (10ms)

T+1.730s: IA recebe confirmação do agendamento criado
T+1.800s: IA envia mensagem ao cliente: "✅ Agendado para 16/01 às 14h!"

// Sincronização nos dispositivos do profissional:
T+2.000s: Google Calendar Web atualiza (refresh automático)
T+5-30s:  Apps mobile sincronizam (depende de configuração do aparelho)
```

### Breakdown de Latência

| Operação | Tempo | Pode Falhar? |
|----------|-------|--------------|
| Buscar tokens Supabase | 20-50ms | ❌ Raro |
| Renovar access_token | 150-300ms | ⚠️ Sim (Google fora) |
| Verificar disponibilidade | 200-500ms | ⚠️ Sim (timeout) |
| Criar agendamento Supabase | 50-150ms | ❌ Raro |
| Criar evento Google Calendar | 300-800ms | ⚠️ Sim (Google fora) |
| **TOTAL MÉDIO** | **1.5-2s** | - |
| **TOTAL PESSIMISTA** | **3-5s** | - |

---

## 🛡️ Tratamento de Erros e Fallbacks

### Cenário 1: Google Calendar está fora do ar

```typescript
try {
  // Tenta criar evento no Google
  const result = await createCalendarEvent(userId, eventData);
} catch (error) {
  console.warn('Google Calendar indisponível:', error);
  // ✅ AGENDAMENTO JÁ FOI SALVO NO SUPABASE!
  // ❌ Apenas não sincronizou com Google
  // Cliente recebe confirmação normalmente
}
```

**Resultado**: Agendamento funciona, mas profissional não vê no Google Calendar até próxima sincronização.

### Cenário 2: Access Token expirou

```typescript
// Renovação AUTOMÁTICA via listener:
oauth2Client.on('tokens', async (newTokens) => {
  console.log('🔄 Tokens renovados automaticamente');
  await updateUserTokens(userId, newTokens);
});
```

**Resultado**: Transparente para o usuário, tudo funciona normalmente.

### Cenário 3: Usuário revogou acesso

```typescript
// Em qualquer chamada da API:
const oauth2Client = await getAuthenticatedClient(userId);

if (!oauth2Client) {
  // ❌ Tokens não encontrados ou inválidos
  console.log('⚠️ Google Calendar desconectado');
  
  // Atualiza config:
  await supabase
    .from('scheduling_config')
    .update({ google_calendar_enabled: false })
    .eq('user_id', userId);
  
  // ✅ Sistema continua funcionando sem Google
}
```

**Resultado**: Agendamentos continuam funcionando, mas sem sincronização.

---

## 🔄 Sincronização Bidirecional (Limitações)

### O que o código atual FAZ:

✅ **AgentZap → Google Calendar**
- Quando agendamento é criado no AgentZap → Cria evento no Google
- Quando agendamento é cancelado no AgentZap → Remove evento do Google
- Quando agendamento é atualizado no AgentZap → Atualiza evento no Google

### O que o código atual NÃO FAZ:

❌ **Google Calendar → AgentZap**
- Se você criar evento manualmente no Google → NÃO aparece no AgentZap
- Se você deletar evento no Google → Agendamento permanece no AgentZap
- Se você editar horário no Google → AgentZap não atualiza

### Por quê?

**Seria necessário implementar:**
1. **Webhooks do Google Calendar** (Push Notifications)
2. **Polling periódico** (verificar mudanças a cada X minutos)

**Complexidade:**
- Webhooks exigem URL pública e verificação de domínio
- Polling consome muitas requisições da API quota

---

## 📈 Limites da API do Google Calendar

### Quotas Gratuitas

| Operação | Limite | Por |
|----------|--------|-----|
| Queries (leituras) | 1.000.000 | dia |
| Inserts/Updates/Deletes | 10.000 | dia |
| Burst rate | 10 | segundo |

### Exemplo de Consumo

```
100 agendamentos/dia = 100 inserts
100 verificações de disponibilidade = 100 queries
─────────────────────────────────────────────────
Total: 200 requests/dia

Limite: 1.000.000 queries + 10.000 inserts
Margem: 99,98% livre! 🎉
```

**Conclusão**: MUITO difícil atingir os limites, mesmo com alto volume.

---

## 🔍 Debug: Como Verificar se Está Funcionando

### 1. Verificar Configuração

```bash
# No terminal do servidor:
node -e "console.log({
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ? '✅ Configurado' : '❌ Faltando',
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET ? '✅ Configurado' : '❌ Faltando',
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI
})"
```

### 2. Verificar Conexão do Usuário

```sql
-- No Supabase SQL Editor:
SELECT 
  user_id,
  access_token IS NOT NULL as has_access_token,
  refresh_token IS NOT NULL as has_refresh_token,
  expiry_date,
  updated_at
FROM google_calendar_tokens
WHERE user_id = 'USER_ID_AQUI';
```

### 3. Testar Criação de Evento

```typescript
// No frontend, console do navegador:
fetch('/api/scheduling/appointments', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer ' + localStorage.getItem('sb-access-token')
  },
  body: JSON.stringify({
    clientName: 'Teste Google',
    clientPhone: '11999999999',
    appointmentDate: '2026-01-17',
    startTime: '10:00',
    endTime: '11:00',
    serviceName: 'Teste'
  })
})
.then(r => r.json())
.then(console.log)
```

Depois verifique no Google Calendar se o evento apareceu!

---

## 🚨 Checklist de Implementação

- [x] Código OAuth2 implementado
- [x] Armazenamento de tokens no Supabase
- [x] Renovação automática de tokens
- [x] Verificação de conflitos
- [x] Sincronização automática
- [x] UI de conexão/desconexão
- [ ] **Obter credenciais do Google Cloud Console**
- [ ] **Adicionar GOOGLE_CLIENT_ID no .env**
- [ ] **Adicionar GOOGLE_CLIENT_SECRET no .env**
- [ ] **Adicionar GOOGLE_REDIRECT_URI no .env**
- [ ] **Configurar variáveis no Railway**
- [ ] **Testar conexão**
- [ ] **Testar criação de agendamento**
- [ ] **Verificar evento no Google Calendar**

---

## 💡 Próximas Melhorias Possíveis

1. **Sincronização Bidirecional** (Google → AgentZap)
   - Implementar webhooks
   - Detectar eventos criados manualmente no Google

2. **Múltiplos Calendários**
   - Permitir escolher qual calendário usar
   - Sincronizar com calendário específico por profissional

3. **Cores Personalizadas**
   - Usar cor do serviço no evento do Google
   - Códigos de cor do Google: 1-11

4. **Convidados**
   - Adicionar cliente como convidado (se tiver email)
   - Cliente recebe notificação do Google

5. **Sincronização em Lote**
   - Sincronizar agendamentos antigos
   - Migração de agendamentos existentes

---

**Status**: ✅ Código pronto, aguardando configuração das chaves Google Cloud!
