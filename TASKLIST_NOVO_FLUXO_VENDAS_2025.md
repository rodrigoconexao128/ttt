# 🚀 TASKLIST COMPLETA: Novo Fluxo de Vendas AgenteZap 2025

## 📋 VISÃO GERAL

### Objetivo Principal
Criar um fluxo de vendas 100% automatizado por IA que:
1. **Configura o agente** diretamente na conversa (sem criar conta inicialmente)
2. **Permite teste ao vivo** do agente configurado (#sair para calibrar)
3. **Follow-ups inteligentes** automáticos (10 min, 1h, 24h, agendados)
4. **Converte em venda** via PIX → Depois conecta WhatsApp do cliente
5. **IA humanizada** que entende contexto e agenda callbacks

### Princípios de Design
- **Zero fricção inicial**: cliente não precisa criar conta para testar
- **Teste antes de pagar**: cliente experimenta o agente configurado
- **IA que vende**: usar técnicas de persuasão naturais
- **Follow-up automático**: nunca perder um lead
- **Agendamento inteligente**: IA entende "me liga amanhã" e agenda

---

## 📊 ARQUITETURA DO SISTEMA

```
┌─────────────────────────────────────────────────────────────────┐
│                    FLUXO DO CLIENTE                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. PRIMEIRO CONTATO                                             │
│     └─> IA identifica interesse                                  │
│         └─> Coleta: Nome da loja, tipo de negócio                │
│             └─> Coleta: O que o agente deve fazer                │
│                 └─> Coleta: Informações do negócio               │
│                                                                  │
│  2. CONFIGURAÇÃO DO AGENTE (em tempo real)                       │
│     └─> IA cria prompt personalizado                             │
│         └─> Salva como "cliente temporário" (email fictício)     │
│             └─> ID: temp_[phone]_[timestamp]                     │
│                                                                  │
│  3. MODO TESTE                                                   │
│     └─> Cliente digita: "iniciar teste" ou similar               │
│         └─> Ativa modo DEMO (cliente fala com SEU agente)        │
│             └─> #sair para voltar ao atendimento normal          │
│                                                                  │
│  4. FOLLOW-UPS AUTOMÁTICOS                                       │
│     └─> 10 min sem resposta: "O que achou do teste?"             │
│         └─> 1h: "Vi que você testou... alguma dúvida?"           │
│             └─> 24h: "Vim ver como posso te ajudar..."           │
│                 └─> Agendado: Se cliente pediu callback          │
│                                                                  │
│  5. CONVERSÃO                                                    │
│     └─> Cliente aprova → Envia PIX                               │
│         └─> Pagamento confirmado → Cria conta REAL               │
│             └─> Conecta WhatsApp → Sistema funcionando           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 📝 FASE 1: CONTA TEMPORÁRIA (SEM CRIAÇÃO DE CONTA REAL)

### 1.1 Schema de Dados - Clientes Temporários
**Arquivo**: `shared/schema.ts`
```typescript
// Nova tabela: temp_clients
export const tempClients = pgTable("temp_clients", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  phoneNumber: varchar("phone_number").unique().notNull(),
  // Email fictício auto-gerado: temp_[contador]@agentezap.temp
  tempEmail: varchar("temp_email").unique().notNull(),
  // Dados coletados
  businessName: varchar("business_name"),
  businessType: varchar("business_type"),
  agentName: varchar("agent_name"),
  agentRole: varchar("agent_role"),
  agentPrompt: text("agent_prompt"),
  // Estado da conversa
  onboardingStep: varchar("onboarding_step").default("initial"),
  // Controle de follow-up
  lastInteractionAt: timestamp("last_interaction_at").defaultNow(),
  nextFollowUpAt: timestamp("next_follow_up_at"),
  followUpCount: integer("follow_up_count").default(0),
  // Modo teste
  isInTestMode: boolean("is_in_test_mode").default(false),
  testStartedAt: timestamp("test_started_at"),
  testDurationSeconds: integer("test_duration_seconds").default(0),
  // Conversão
  paymentReceived: boolean("payment_received").default(false),
  convertedToRealUser: boolean("converted_to_real_user").default(false),
  realUserId: varchar("real_user_id"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});
```

### 1.2 Gerador de Email Temporário
**Arquivo**: `server/tempClientService.ts`
```typescript
// Gera email único: temp_000001@agentezap.temp
async function generateTempEmail(): Promise<string> {
  const count = await db.select({ count: sql`count(*)` }).from(tempClients);
  const nextId = (Number(count[0].count) + 1).toString().padStart(6, '0');
  return `temp_${nextId}@agentezap.temp`;
}
```

### 1.3 Tasks
- [ ] **T1.1** Criar migration para tabela `temp_clients`
- [ ] **T1.2** Criar `tempClientService.ts` com CRUD
- [ ] **T1.3** Atualizar `adminAgentService.ts` para usar temp_clients
- [ ] **T1.4** Criar função `generateTempEmail()`
- [ ] **T1.5** Testes unitários do serviço

---

## 📝 FASE 2: NOVO FLUXO DE ONBOARDING (CONFIGURAÇÃO DO AGENTE)

### 2.1 Etapas do Onboarding
```
STEP 1: "initial"
  → IA: "Oi! Sou o Rodrigo da AgenteZap. Posso criar um agente de IA 
         pro seu negócio em 2 minutos. Qual é o nome da sua loja/empresa?"
  → Cliente: "Pizzaria do João"
  → Salva: businessName = "Pizzaria do João"

STEP 2: "collecting_type"
  → IA: "Show! A Pizzaria do João é de que área? Restaurante, loja, 
         serviços...?"
  → Cliente: "Restaurante/delivery"
  → Salva: businessType = "Restaurante/delivery"

STEP 3: "collecting_agent_name"
  → IA: "Legal! Como você quer que seu agente de IA se chame? 
         Pode ser um nome tipo 'Maria', 'Bia', ou o nome do atendente."
  → Cliente: "Ana"
  → Salva: agentName = "Ana"

STEP 4: "collecting_role"
  → IA: "Perfeito! A Ana vai fazer o quê? Responder dúvidas, anotar 
         pedidos, agendar horários...?"
  → Cliente: "Anotar pedidos e responder sobre o cardápio"
  → Salva: agentRole = "Anotar pedidos e responder sobre o cardápio"

STEP 5: "collecting_info"
  → IA: "Agora me conta: que informações a Ana precisa saber? 
         Ex: cardápio, preços, horário, formas de pagamento..."
  → Cliente: [envia informações]
  → Salva: agentPrompt = [constrói prompt com todas as infos]

STEP 6: "ready_to_test"
  → IA: "Pronto! 🎉 Montei sua agente Ana. Quer testar agora?
         É só digitar 'iniciar teste' e você vai conversar direto 
         com a Ana como se fosse um cliente!"
```

### 2.2 Construtor de Prompt Inteligente
**Arquivo**: `server/promptBuilder.ts`
```typescript
export function buildAgentPrompt(data: {
  businessName: string;
  businessType: string;
  agentName: string;
  agentRole: string;
  businessInfo: string;
}): string {
  return `Você é ${data.agentName}, ${data.agentRole} da ${data.businessName}.

SOBRE O NEGÓCIO:
- Nome: ${data.businessName}
- Tipo: ${data.businessType}

SUAS RESPONSABILIDADES:
${data.agentRole}

INFORMAÇÕES QUE VOCÊ SABE:
${data.businessInfo}

COMO VOCÊ ATENDE:
- Seja simpático e prestativo
- Responda de forma natural, como um humano
- Use linguagem informal mas profissional
- Respostas curtas (2-4 linhas)
- Use emojis com moderação
- Se não souber algo, diga que vai verificar

NUNCA:
- Diga que é uma IA ou robô
- Invente informações que não foram fornecidas
- Seja rude ou impaciente`;
}
```

### 2.3 Tasks
- [ ] **T2.1** Criar enum `OnboardingStep` com todas as etapas
- [ ] **T2.2** Criar `promptBuilder.ts` com builder inteligente
- [ ] **T2.3** Atualizar `adminAgentService.ts` com novo fluxo de etapas
- [ ] **T2.4** Criar função `processOnboardingStep(step, message, client)`
- [ ] **T2.5** Validação de cada etapa (não aceitar respostas vazias)
- [ ] **T2.6** Persistir progresso a cada etapa (tolerante a desconexão)

---

## 📝 FASE 3: MODO TESTE (#sair para calibrar)

### 3.1 Lógica do Modo Teste
```typescript
// Ativar modo teste
if (mensagem.includes("iniciar teste") || mensagem.includes("testar")) {
  await activateTestMode(clientPhone);
  // Cliente agora fala com SEU agente configurado
}

// Sair do modo teste
if (mensagem.trim() === "#sair") {
  await deactivateTestMode(clientPhone);
  // Volta para o atendimento do Rodrigo (admin)
  // IA pergunta: "O que achou? Quer ajustar algo?"
}
```

### 3.2 Roteamento de Mensagens
```typescript
async function handleAdminWhatsAppMessage(message, contact) {
  const tempClient = await getTempClientByPhone(contact);
  
  if (tempClient?.isInTestMode) {
    // Redireciona para o agente configurado do cliente
    return handleTestModeMessage(message, tempClient);
  } else {
    // Atendimento normal pelo Rodrigo
    return handleAdminAgentMessage(message, contact);
  }
}
```

### 3.3 Tasks
- [ ] **T3.1** Criar função `activateTestMode(phone)`
- [ ] **T3.2** Criar função `deactivateTestMode(phone)`
- [ ] **T3.3** Criar `handleTestModeMessage()` que usa o prompt do cliente
- [ ] **T3.4** Adicionar detecção de "#sair" no processamento
- [ ] **T3.5** Salvar métricas do teste (duração, nº mensagens)
- [ ] **T3.6** Ao sair, perguntar "O que achou? Quer ajustar algo?"

---

## 📝 FASE 4: FOLLOW-UPS INTELIGENTES

### 4.1 Schema de Agendamentos
**Arquivo**: `shared/schema.ts`
```typescript
export const scheduledFollowUps = pgTable("scheduled_follow_ups", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  tempClientId: varchar("temp_client_id").references(() => tempClients.id),
  phoneNumber: varchar("phone_number").notNull(),
  // Tipo de follow-up
  type: varchar("type").notNull(), // "auto_10min", "auto_1h", "auto_24h", "scheduled"
  // Mensagem personalizada (IA gera baseado no contexto)
  message: text("message"),
  // Quando executar
  scheduledFor: timestamp("scheduled_for").notNull(),
  // Status
  status: varchar("status").default("pending"), // "pending", "sent", "cancelled", "failed"
  // Contexto (para IA gerar mensagem contextualizada)
  context: jsonb("context"),
  // Timestamps
  createdAt: timestamp("created_at").defaultNow(),
  executedAt: timestamp("executed_at"),
});
```

### 4.2 Motor de Follow-Up
**Arquivo**: `server/followUpEngine.ts`
```typescript
// Executado a cada minuto via cron/setInterval
async function processScheduledFollowUps() {
  const now = new Date();
  const pendingFollowUps = await getFollowUpsDueNow(now);
  
  for (const followUp of pendingFollowUps) {
    // IA gera mensagem contextualizada
    const message = await generateFollowUpMessage(followUp);
    
    // Envia via WhatsApp admin
    await sendAdminMessage(followUp.phoneNumber, message);
    
    // Marca como enviado
    await markFollowUpSent(followUp.id);
    
    // Agenda próximo follow-up se necessário
    await scheduleNextFollowUp(followUp);
  }
}
```

### 4.3 Detecção de Intenção de Callback
```typescript
// IA detecta quando cliente quer ser contatado depois
const callbackPhrases = [
  "me liga amanhã",
  "entra em contato amanhã",
  "me manda mensagem amanhã",
  "fala comigo de manhã",
  "fala comigo à tarde",
  "fala comigo depois do almoço",
  "me avisa segunda-feira",
  // etc.
];

async function detectAndScheduleCallback(message: string, clientPhone: string) {
  const scheduledTime = await parseScheduleIntent(message);
  if (scheduledTime) {
    await createScheduledFollowUp({
      phoneNumber: clientPhone,
      type: "scheduled",
      scheduledFor: scheduledTime,
      context: { originalMessage: message },
    });
    return true;
  }
  return false;
}
```

### 4.4 Tasks
- [ ] **T4.1** Criar migration para `scheduled_follow_ups`
- [ ] **T4.2** Criar `followUpEngine.ts` com processador
- [ ] **T4.3** Criar cron job que roda a cada 1 minuto
- [ ] **T4.4** Função `scheduleAutoFollowUp(phone, type)` - agenda 10min, 1h, 24h
- [ ] **T4.5** Função `parseScheduleIntent(message)` - entende "amanhã às 10h"
- [ ] **T4.6** IA para gerar mensagens de follow-up contextualizadas
- [ ] **T4.7** Cancelar follow-ups se cliente responder antes

---

## 📝 FASE 5: PAINEL ADMIN - AGENDAMENTOS

### 5.1 Endpoints da API
```typescript
// GET /api/admin/follow-ups
// Lista todos os follow-ups agendados

// POST /api/admin/follow-ups
// Cria follow-up manual

// PATCH /api/admin/follow-ups/:id
// Edita ou cancela follow-up

// GET /api/admin/temp-clients
// Lista clientes temporários com status
```

### 5.2 UI do Dashboard
- [ ] **T5.1** Criar página `/admin/follow-ups` no frontend
- [ ] **T5.2** Tabela com follow-ups pendentes/enviados/cancelados
- [ ] **T5.3** Filtros por tipo, status, data
- [ ] **T5.4** Botão para criar follow-up manual
- [ ] **T5.5** Integrar com WebSocket para atualizações em tempo real

---

## 📝 FASE 6: CONVERSÃO (PAGAMENTO → CONTA REAL)

### 6.1 Fluxo de Conversão
```
1. Cliente aprova o agente testado
2. IA envia PIX para pagamento (R$ 99/mês)
3. Cliente envia comprovante
4. IA detecta imagem → Notifica admin
5. Admin confirma pagamento
6. Sistema:
   a. Cria conta REAL com email definitivo do cliente
   b. Migra dados do temp_client para user
   c. Oferece conectar WhatsApp (agora sim!)
   d. Ativa agente na conta real
```

### 6.2 Migração temp_client → user
```typescript
async function convertTempClientToRealUser(
  tempClientId: string,
  realEmail: string
): Promise<User> {
  const tempClient = await getTempClient(tempClientId);
  
  // Criar usuário real
  const user = await storage.upsertUser({
    email: realEmail,
    name: tempClient.businessName || "Cliente",
    phone: tempClient.phoneNumber,
  });
  
  // Criar agente com prompt já configurado
  await storage.upsertBusinessAgentConfig(user.id, {
    name: tempClient.agentName,
    businessType: tempClient.businessType,
    customPrompt: tempClient.agentPrompt,
    isActive: true,
  });
  
  // Marcar temp_client como convertido
  await updateTempClient(tempClientId, {
    convertedToRealUser: true,
    realUserId: user.id,
  });
  
  return user;
}
```

### 6.3 Tasks
- [ ] **T6.1** Criar função `convertTempClientToRealUser()`
- [ ] **T6.2** Atualizar fluxo de pagamento no `adminAgentService.ts`
- [ ] **T6.3** Após pagamento: pedir email real do cliente
- [ ] **T6.4** Migrar todas as configurações automaticamente
- [ ] **T6.5** Enviar mensagem de boas-vindas com próximos passos

---

## 📝 FASE 7: MÍDIAS E DEMONSTRAÇÃO

### 7.1 Captura de Screenshots do Sistema
**Mídias a capturar**:
1. Dashboard principal (visão geral)
2. Painel de conversas
3. Configuração do agente
4. Estatísticas/Analytics
5. Painel de agendamentos

### 7.2 Uso das Mídias no Fluxo de Vendas
```typescript
// Quando cliente pergunta "o que vou ter quando pagar?"
const mediasFuncionalidades = [
  { tag: "[dashboard]", desc: "Painel principal com visão geral" },
  { tag: "[conversas]", desc: "Todas as conversas em um lugar" },
  { tag: "[config_agente]", desc: "Configurar seu agente" },
  { tag: "[analytics]", desc: "Estatísticas de atendimento" },
];
```

### 7.3 Tasks
- [ ] **T7.1** Capturar screenshots de todas as telas do sistema
- [ ] **T7.2** Fazer upload para adminMediaStore com tags apropriadas
- [ ] **T7.3** Atualizar prompt do admin para usar mídias na argumentação
- [ ] **T7.4** Criar sequência de demonstração das funcionalidades

---

## 📝 FASE 8: IA DE VENDAS (PERSUASÃO HUMANIZADA)

### 8.1 Técnicas de Vendas a Implementar

#### 8.1.1 SPIN Selling (Neil Rackham)
- **Situation**: Entender o contexto do cliente
- **Problem**: Identificar as dores
- **Implication**: Mostrar consequências de não resolver
- **Need-payoff**: Mostrar como AgenteZap resolve

#### 8.1.2 Gatilhos Mentais
- **Escassez**: "Promoção de lançamento: R$ 99 só até sexta"
- **Prova Social**: "Mais de 500 negócios já usam"
- **Autoridade**: "Tecnologia usada por grandes empresas"
- **Reciprocidade**: "Pode testar grátis antes de pagar"

#### 8.1.3 Follow-up Progressivo
```
10 min: "O que achou do teste?" (curioso, leve)
1h: "Notei que você testou a Ana... ficou alguma dúvida?" (ajuda)
24h: "Oi! Vim ver se posso te ajudar com algo..." (disponibilidade)
3 dias: "Última chance: promoção de lançamento acaba amanhã!" (urgência)
```

### 8.2 Prompt de Vendas Aprimorado
```markdown
## TÉCNICAS DE VENDA (USE NATURALMENTE)

FASE 1 - RAPPORT (Primeiras mensagens):
- Seja amigável e genuíno
- Faça perguntas sobre o negócio do cliente
- Mostre interesse real

FASE 2 - DESCOBERTA (Após coletar infos):
- "Quantos clientes você atende por dia no WhatsApp?"
- "Você consegue responder todo mundo rápido?"
- "Já perdeu venda porque demorou pra responder?"

FASE 3 - APRESENTAÇÃO (Após identificar dor):
- Mostre como o agente resolve o problema específico
- Use exemplos concretos
- Ofereça o teste

FASE 4 - OBJEÇÕES:
- "É caro?" → "R$ 99/mês dá R$ 3,30 por dia. Uma venda perdida por falta de resposta custa mais que isso"
- "Não sei se funciona" → "Por isso você pode testar antes! Zero risco"
- "Tenho que pensar" → "Entendo! Posso te mandar uma mensagem amanhã pra gente continuar?"

FASE 5 - FECHAMENTO:
- "Quer ativar agora? O pagamento é via PIX"
- Se hesitar: "Qual é sua maior preocupação?"
```

### 8.3 Tasks
- [ ] **T8.1** Reescrever prompt do admin com técnicas de venda
- [ ] **T8.2** Criar biblioteca de respostas para objeções comuns
- [ ] **T8.3** Implementar detecção de objeções na IA
- [ ] **T8.4** Criar métricas de conversão por etapa do funil
- [ ] **T8.5** A/B testing de mensagens de follow-up

---

## 📝 FASE 9: ANÁLISE DE CONVERSA E CONTEXTO

### 9.1 Análise de Sentimento
```typescript
interface ConversationAnalysis {
  sentiment: "positive" | "neutral" | "negative";
  buyingSignals: string[]; // "pediu preço", "perguntou como funciona"
  objections: string[];    // "caro", "preciso pensar"
  nextBestAction: string;  // "offer_test", "handle_objection", "close"
}
```

### 9.2 Tasks
- [ ] **T9.1** Criar função `analyzeConversation(history)` usando IA
- [ ] **T9.2** Detectar sinais de compra automaticamente
- [ ] **T9.3** Sugerir próxima ação para o agente
- [ ] **T9.4** Dashboard com análise de conversas

---

## 📝 FASE 10: TESTES E DEPLOY

### 10.1 Testes
- [ ] **T10.1** Testes unitários de todas as funções novas
- [ ] **T10.2** Teste E2E do fluxo completo (onboarding → teste → pagamento)
- [ ] **T10.3** Teste de follow-ups automáticos
- [ ] **T10.4** Teste de modo teste (#sair)
- [ ] **T10.5** Teste de conversão temp → real

### 10.2 Deploy
- [ ] **T10.6** Migrations no Supabase
- [ ] **T10.7** Deploy no Railway
- [ ] **T10.8** Monitoramento de erros
- [ ] **T10.9** Métricas de conversão

---

## 📊 CRONOGRAMA SUGERIDO

| Fase | Descrição | Estimativa | Dependências |
|------|-----------|------------|--------------|
| 1 | Conta Temporária | 4h | - |
| 2 | Novo Onboarding | 6h | Fase 1 |
| 3 | Modo Teste | 4h | Fase 2 |
| 4 | Follow-ups | 6h | Fase 1 |
| 5 | Painel Admin | 4h | Fase 4 |
| 6 | Conversão | 4h | Fase 3 |
| 7 | Mídias | 2h | - |
| 8 | IA de Vendas | 4h | Fase 2 |
| 9 | Análise | 4h | Fase 8 |
| 10 | Testes/Deploy | 4h | Todas |

**Total estimado**: ~42 horas de desenvolvimento

---

## 🎯 PRÓXIMOS PASSOS IMEDIATOS

1. **Criar migration** para `temp_clients` e `scheduled_follow_ups`
2. **Atualizar adminAgentService.ts** com novo fluxo de etapas
3. **Implementar modo teste** com #sair
4. **Criar motor de follow-up** com cron
5. **Testar fluxo completo** localmente

---

## 📚 REFERÊNCIAS DE PESQUISA

### Vendas via WhatsApp
- respond.io: Follow-ups com message templates
- Salesloft/Drift: Conversational AI que qualifica leads
- Técnicas: SPIN Selling, Gatilhos Mentais

### Follow-up Timing (Best Practices)
- 10 minutos: Primeiro follow-up (maior chance de resposta)
- 1 hora: Segundo follow-up (lembrete gentil)
- 24 horas: Terceiro follow-up (reengajamento)
- 3-7 dias: Follow-ups espaçados (persistência sem spam)

### Conversational Sales
- Personalize baseado no contexto
- Faça perguntas, não apenas apresente
- Ofereça valor antes de pedir algo
- Use urgência com moderação
