# Implementação: Agendamentos Avançados com Google Calendar, Serviços e Profissionais

## 📋 Resumo da Implementação

### ✅ Funcionalidades Implementadas

#### 1. **Gestão de Serviços**
- CRUD completo de serviços (criar, editar, deletar)
- Campos: nome, descrição, duração, preço, cor de identificação
- Toggle para ativar/desativar funcionalidade
- UI com cards coloridos mostrando preço e duração

#### 2. **Gestão de Profissionais**
- CRUD completo de profissionais
- Campos: nome, email, telefone, especialidade, foto
- Horários de trabalho personalizados por profissional
- Dias de trabalho selecionáveis
- Atribuição de serviços que cada profissional realiza
- Toggle para ativar/desativar funcionalidade

#### 3. **Integração Google Calendar (One-Click)**
- Botão "Conectar com Google" que abre popup OAuth2
- Status visual de conexão (conectado/desconectado)
- Toggle para sincronização automática
- Desconexão com um clique
- Benefícios listados na interface

#### 4. **IA de Agendamento Automático**
- Toggle para habilitar IA gerenciar agendamentos
- IA irá:
  - Perguntar qual serviço o cliente deseja
  - Mostrar profissionais disponíveis
  - Verificar horários livres
  - Criar agendamento automaticamente
  - Sincronizar com Google Calendar
  - Enviar confirmação

---

## 🗄️ Alterações no Banco de Dados

### Tabelas Criadas:
1. **scheduling_services** - Serviços oferecidos
2. **scheduling_professionals** - Profissionais da equipe
3. **professional_services** - Relacionamento N:N entre profissionais e serviços

### Colunas Adicionadas em `scheduling_config`:
- `use_services` - Habilita gestão de serviços
- `use_professionals` - Habilita gestão de profissionais
- `ai_scheduling_enabled` - IA pode criar agendamentos
- `ai_can_suggest_service` - IA pode sugerir serviços
- `ai_can_suggest_professional` - IA pode sugerir profissionais
- `public_booking_enabled` - Link público de agendamento
- `booking_link_slug` - Slug personalizado para link público

### Colunas Adicionadas em `appointments`:
- `service_id` - FK para scheduling_services
- `professional_id` - FK para scheduling_professionals
- `professional_name` - Nome do profissional (desnormalizado)
- `google_event_id` - ID do evento no Google Calendar

---

## 🔌 APIs Criadas

### Serviços
- `GET /api/scheduling/services` - Listar serviços
- `POST /api/scheduling/services` - Criar serviço
- `PUT /api/scheduling/services/:id` - Atualizar serviço
- `DELETE /api/scheduling/services/:id` - Deletar serviço

### Profissionais
- `GET /api/scheduling/professionals` - Listar profissionais
- `POST /api/scheduling/professionals` - Criar profissional
- `PUT /api/scheduling/professionals/:id` - Atualizar profissional
- `DELETE /api/scheduling/professionals/:id` - Deletar profissional
- `POST /api/scheduling/professionals/:id/services` - Atribuir serviços

### Google Calendar
- `GET /api/scheduling/google-calendar/connect` - Obter URL OAuth2
- `POST /api/scheduling/google-calendar/disconnect` - Desconectar
- `GET /api/scheduling/google-calendar/status` - Status da conexão

### Configurações Avançadas
- `PUT /api/scheduling/config/advanced` - Atualizar configs avançadas
- `GET /api/scheduling/available-slots-advanced` - Slots com filtro de serviço/profissional

---

## 🎨 Interface do Usuário

### Novas Abas na página de Agendamentos:
1. **Serviços** - Cadastro e gerenciamento de serviços
2. **Profissionais** - Cadastro e gerenciamento de equipe
3. **Google Calendar** - Configuração de integração

### Características da UI:
- Cards com cores personalizadas para serviços
- Formulário completo para profissionais com horários
- Status visual da conexão Google Calendar
- Toggles para ativar/desativar cada funcionalidade
- Alertas informando quando funcionalidade está desativada

---

## 🔧 Arquivos Modificados

### Frontend
- `client/src/pages/scheduling.tsx`
  - Novas interfaces (SchedulingService, SchedulingProfessional, GoogleCalendarStatus)
  - Funções transformadoras (transformService, transformProfessional)
  - Mutations para CRUD de serviços e profissionais
  - Mutations para Google Calendar (connect/disconnect/sync)
  - TabsContent para Serviços, Profissionais e Google Calendar
  - Dialogs para criar/editar serviços e profissionais

### Backend
- `server/routes.ts`
  - Rotas CRUD para serviços
  - Rotas CRUD para profissionais
  - Rotas para Google Calendar scheduling
  - Rota de config/advanced atualizada

### Schema
- `shared/schema.ts`
  - Tabelas scheduling_services, scheduling_professionals, professional_services
  - Colunas adicionais em scheduling_config e appointments

---

## 🚀 Como Usar

### ⚠️ ANTES DE COMEÇAR: Configurar Google Calendar (Opcional)

A integração Google Calendar requer chaves da API do Google:

1. **Obter Credenciais**: Veja instruções completas em [GUIA_GOOGLE_CALENDAR.md](GUIA_GOOGLE_CALENDAR.md)
2. **Adicionar no .env**:
   ```bash
   GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
   GOOGLE_CLIENT_SECRET=seu-client-secret
   GOOGLE_REDIRECT_URI=http://localhost:5000/api/google-calendar/callback
   ```
3. **Adicionar no Railway**: Configure as mesmas variáveis na produção

**SEM ESSAS CHAVES**: A funcionalidade de Google Calendar não funcionará, mas os agendamentos normais continuam funcionando!

### Ativar Serviços:
1. Vá em Agendamentos → aba Serviços
2. Ative o toggle "Serviços"
3. Clique em "Novo Serviço"
4. Preencha nome, duração, preço e cor

### Ativar Profissionais:
1. Vá em Agendamentos → aba Profissionais
2. Ative o toggle "Profissionais"
3. Clique em "Novo Profissional"
4. Preencha dados e selecione serviços que realiza

### Conectar Google Calendar:
1. Vá em Agendamentos → aba Google Calendar
2. Clique em "Conectar com Google"
3. Autorize na janela popup
4. Ative "Sincronização Automática"

### Ativar IA de Agendamento:
1. Na aba Google Calendar, role até "Agendamento Inteligente com IA"
2. Ative "IA Gerencia Agendamentos"
3. A IA passará a criar agendamentos automaticamente

---

## 📝 Notas Técnicas

- Todas as datas são convertidas de snake_case (backend) para camelCase (frontend)
- Google Calendar usa OAuth2 com popup para melhor UX
- RLS (Row Level Security) habilitado em todas as tabelas
- Índices criados para performance em queries frequentes

---

## 📚 Documentação Adicional

- **[GUIA_GOOGLE_CALENDAR.md](GUIA_GOOGLE_CALENDAR.md)**: Guia completo sobre como configurar a integração Google Calendar
- **[ANALISE_TECNICA_GOOGLE_CALENDAR.md](ANALISE_TECNICA_GOOGLE_CALENDAR.md)**: Análise técnica detalhada do fluxo OAuth2 e sincronização

---

## 🔍 Funcionamento Detalhado

### Verificação de Conflitos

O sistema agora verifica conflitos em DUAS camadas:

1. **Banco de Dados Local** (Supabase)
   - Verifica se já existe agendamento no mesmo horário
   - Tempo: ~50ms

2. **Google Calendar** (se conectado)
   - Verifica se horário está livre no calendário do Google
   - Tempo: ~400-500ms
   - **NOVO!** ✅ Previne agendamentos em horários já ocupados no Google

### Sincronização Automática

Quando um agendamento é criado:

```
1. Cliente agenda (WhatsApp ou admin)
   ↓ (50ms)
2. Verifica conflitos no banco
   ↓ (400ms)
3. Verifica conflitos no Google Calendar ✅ NOVO!
   ↓ (100ms)
4. Cria agendamento no Supabase
   ↓ (500ms)
5. Cria evento no Google Calendar ✅ AUTOMÁTICO!
   ↓ (50ms)
6. Salva google_event_id no agendamento
   ✅ Total: ~1-2 segundos
```

### Tempo de Sincronização

- **Web/Desktop Google Calendar**: 1-2 segundos
- **Mobile (Android/iOS)**: 5-30 segundos (depende do sync automático)

---

## 🔐 Segurança e Tokens

### Como Funciona o OAuth2

1. **Usuário clica "Conectar com Google"**
2. **Popup abre tela do Google** (consentimento)
3. **Google redireciona com 'code'**
4. **Backend troca 'code' por tokens**:
   - `access_token`: válido por 1 hora
   - `refresh_token`: válido indefinidamente
5. **Tokens salvos criptografados no Supabase**

### Renovação Automática

O sistema detecta quando `access_token` expira e renova automaticamente usando `refresh_token`:

```typescript
oauth2Client.on('tokens', async (newTokens) => {
  // Salva novos tokens no Supabase
  await updateUserTokens(userId, newTokens);
});
```

**Cliente não precisa reconectar!** 🎉

---

**Data da Implementação:** ${new Date().toLocaleDateString('pt-BR')}
**Status:** ✅ Completo
**Google Calendar:** ⚠️ Requer configuração das chaves API
