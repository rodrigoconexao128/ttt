# 🚀 SISTEMA UNIFICADO DE FLUXOS - AGENTEZAP

## Visão Geral

O Sistema Unificado de Fluxos implementa uma **arquitetura híbrida** onde:

1. **IA INTERPRETA** → Entende o que o cliente quer (qualquer jeito de falar)
2. **SISTEMA EXECUTA** → Busca dados, calcula, move estados (determinístico)  
3. **IA HUMANIZA** → Resposta natural, anti-bloqueio (opcional)

### O Conceito Central
> "A IA entende o jogo como se fosse um humano interpretando, mas por trás tem um sistema com tudo determinístico. A IA nunca faz nada por conta dela - ela só consulta o sistema."

---

## Arquivos Criados

| Arquivo | Descrição |
|---------|-----------|
| `server/FlowBuilder.ts` | Converte prompts em FlowDefinitions estruturados |
| `server/UnifiedFlowEngine.ts` | Motor principal que orquestra IA + Sistema |
| `server/flowIntegration.ts` | Integração com endpoints existentes |
| `migration-flow-system.sql` | Migration SQL para Supabase |
| `test-unified-flow.ts` | Testes completos do sistema |

---

## Tipos de Fluxo Suportados

### 1. DELIVERY (Restaurantes/Pizzarias)
```
INICIO → SAUDACAO → MENU → PEDINDO → TIPO_ENTREGA → ENDERECO → PAGAMENTO → CONFIRMACAO → PEDIDO_FINALIZADO
```

**Intents:**
- GREETING, WANT_MENU, ADD_ITEM, REMOVE_ITEM, SEE_CART
- CONFIRM_ORDER, CANCEL_ORDER, CHOOSE_DELIVERY, CHOOSE_PICKUP
- PROVIDE_ADDRESS, CHOOSE_PAYMENT

### 2. VENDAS (SaaS/B2B como AgenteZap)
```
INICIO → QUALIFICANDO → EXPLICANDO → PRECOS → DEMO → FECHANDO → CADASTRADO
```

**Intents:**
- GREETING, ASK_HOW_WORKS, ASK_PRICE, ASK_PROMO
- ASK_COUPON, ASK_IMPLEMENTATION, ASK_FEATURES
- WANT_DEMO, CONFIRM, OBJECTION

### 3. AGENDAMENTO (Clínicas/Salões)
```
INICIO → SAUDACAO → SERVICO → DATA → HORARIO → CONFIRMACAO → AGENDADO
```

**Intents:**
- GREETING, WANT_SCHEDULE, CHOOSE_SERVICE
- CHOOSE_DATE, CHOOSE_TIME, CONFIRM, CANCEL

### 4. SUPORTE (FAQ)
```
INICIO → ATENDIMENTO → RESOLVIDO / ENCAMINHADO
```

### 5. GENERICO (Outros)
```
INICIO → CONVERSA → FIM
```

---

## FlowDefinition Structure

```typescript
interface FlowDefinition {
  id: string;                    // Identificador único
  version: string;               // Versão do flow
  type: FlowType;               // DELIVERY | VENDAS | AGENDAMENTO | SUPORTE | GENERICO
  
  businessName: string;          // Nome do negócio
  agentName: string;             // Nome do agente
  agentPersonality: string;      // Personalidade/tom de voz
  
  initialState: string;          // Estado inicial
  finalStates: string[];         // Estados finais
  
  states: {                      // Mapa de estados
    [stateName: string]: {
      name: string;
      description: string;
      transitions: {
        intent: string;          // Intent que dispara
        nextState: string;       // Próximo estado
        action: string;          // Ação a executar
      }[];
    };
  };
  
  intents: {                     // Mapa de intenções
    [intentName: string]: {
      name: string;
      examples: string[];        // Exemplos de frases
      patterns?: string[];       // Regex patterns
      entities?: string[];       // Entidades a extrair
      priority: number;
    };
  };
  
  actions: {                     // Mapa de ações
    [actionName: string]: {
      name: string;
      type: 'RESPONSE' | 'DATA' | 'EXTERNAL';
      template: string;          // Template da resposta
      variables?: string[];      // Variáveis usadas
      dataSource?: string;       // Fonte de dados
      mediaTag?: string;         // Tag de mídia
    };
  };
  
  data: {                        // Dados do negócio
    prices?: {
      standard?: number;
      promo?: number;
      implementation?: number;
    };
    links?: {
      site?: string;
      signup?: string;
    };
    coupons?: {
      code: string;
      discount: number;
    }[];
    // ... outros dados específicos
  };
  
  globalRules: string[];         // Regras globais
}
```

---

## Como Usar

### 1. Criar Flow a partir de Prompt

```typescript
import { FlowBuilder } from './server/FlowBuilder';

const builder = new FlowBuilder();
const flow = await builder.buildFromPrompt(promptText);

// flow.type = 'VENDAS' (detectado automaticamente)
// flow.agentName = 'Rodrigo' (extraído do prompt)
// flow.data.prices = { standard: 99, promo: 49 }
// flow.data.coupons = [{ code: 'PARC2026PROMO', discount: 50 }]
```

### 2. Processar Mensagem do Cliente

```typescript
import { UnifiedFlowEngine, FlowConfig } from './server/UnifiedFlowEngine';

const config: FlowConfig = {
  apiKey: 'sua-api-key',
  model: 'mistral-small-latest',
  humanize: true
};

const engine = new UnifiedFlowEngine(config);

const result = await engine.processMessage(
  userId,
  conversationId,
  "quanto custa?",  // mensagem do cliente
  { useAI: true, humanize: true }
);

// result = {
//   text: "O plano ilimitado é R$99/mês...",
//   newState: "PRECOS",
//   intent: "ASK_PRICE",
//   action: "SHOW_PRICES"
// }
```

### 3. Integrar com Endpoints Existentes

```typescript
// Em /api/agent/generate-prompt
import { handleGeneratePrompt } from './server/flowIntegration';

const { prompt, flow, flowCreated } = await handleGeneratePrompt(
  userId,
  businessType,
  businessName,
  description
);

// Em /api/agent/edit-prompt
import { handleEditPrompt } from './server/flowIntegration';

const { flowUpdated, changes } = await handleEditPrompt(
  userId,
  currentPrompt,
  instruction,
  newPrompt,
  apiKey
);
```

---

## Tabelas do Banco de Dados

### agent_flows
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| user_id | VARCHAR | FK para users (UNIQUE) |
| flow_id | VARCHAR | ID do flow |
| flow_type | VARCHAR | DELIVERY/VENDAS/etc |
| flow_definition | JSONB | FlowDefinition completo |
| business_name | VARCHAR | Nome do negócio |
| agent_name | VARCHAR | Nome do agente |
| version | VARCHAR | Versão do flow |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Última atualização |

### conversation_flow_states
| Coluna | Tipo | Descrição |
|--------|------|-----------|
| id | UUID | PK |
| conversation_id | VARCHAR | FK para conversations (UNIQUE) |
| user_id | VARCHAR | FK para users |
| flow_id | VARCHAR | ID do flow usado |
| current_state | VARCHAR | Estado atual |
| data | JSONB | Dados acumulados (carrinho, etc) |
| history | JSONB | Histórico de turnos |
| created_at | TIMESTAMP | Criação |
| updated_at | TIMESTAMP | Última atualização |

---

## Exemplo: Conversa de Vendas (rodrigo4@gmail.com)

```
👤 Cliente: "oi"
   🎯 Intent: GREETING (90%)
   📍 Estado: INICIO → QUALIFICANDO
   🤖 "Opa, tudo bom? Rodrigo aqui da AgenteZap!"

👤 Cliente: "como funciona?"
   🎯 Intent: ASK_HOW_WORKS (90%)
   📍 Estado: QUALIFICANDO → EXPLICANDO
   🤖 "A gente configura uma IA que atende seus clientes no Zap..."

👤 Cliente: "quanto custa?"
   🎯 Intent: ASK_PRICE (90%)
   📍 Estado: EXPLICANDO → PRECOS
   🤖 "O plano ilimitado é R$99/mês. Com o cupom PARC2026PROMO, R$49!"

👤 Cliente: "quero testar"
   🎯 Intent: WANT_DEMO (90%)
   📍 Estado: PRECOS → DEMO
   🤖 "Cria sua conta grátis: https://agentezap.online/"
```

---

## Exemplo: Conversa de Delivery (Pizzaria)

```
👤 Cliente: "boa noite"
   🎯 Intent: GREETING (90%)
   📍 Estado: INICIO → SAUDACAO
   🤖 "Olá! 😊 Bem-vindo à Pizzaria Bella Napoli!"

👤 Cliente: "quero ver o cardápio"
   🎯 Intent: WANT_MENU (90%)
   📍 Estado: SAUDACAO → MENU
   🤖 "📋 CARDÁPIO: [lista de pizzas]"

👤 Cliente: "quero uma margherita"
   🎯 Intent: ADD_ITEM (90%)
   📍 Estado: MENU → PEDINDO
   🤖 "✅ Adicionei 1x Margherita! Total: R$45"

👤 Cliente: "delivery"
   🎯 Intent: CHOOSE_DELIVERY (90%)
   📍 Estado: PEDINDO → ENDERECO
   🤖 "📍 Qual seu endereço de entrega?"

👤 Cliente: "Rua das Flores, 123"
   🎯 Intent: PROVIDE_ADDRESS (90%)
   📍 Estado: ENDERECO → PAGAMENTO
   🤖 "💳 Como vai pagar? (Pix, Cartão ou Dinheiro)"

👤 Cliente: "pix"
   🎯 Intent: CHOOSE_PAYMENT (90%)
   📍 Estado: PAGAMENTO → CONFIRMACAO
   🤖 "📋 RESUMO: 1x Margherita, Delivery, Pix. Total R$53. Confirma?"
```

---

## Próximos Passos

1. **Aplicar Migration SQL**
   ```bash
   # Execute no Supabase SQL Editor
   cat vvvv/migration-flow-system.sql
   ```

2. **Testar Localmente**
   ```bash
   npx tsx vvvv/test-unified-flow.ts
   ```

3. **Integrar com generateAIResponse()**
   - Verificar se usuário tem flow: `FlowStorage.loadFlow(userId)`
   - Se sim, usar `UnifiedFlowEngine.processMessage()`
   - Se não, usar sistema legado

4. **Gradual Rollout**
   - Começar com novas contas
   - Migrar contas existentes gradualmente
   - Monitorar métricas de qualidade

---

## Benefícios

✅ **Determinismo**: Sistema executa exatamente o que deve
✅ **Flexibilidade**: IA entende variações de linguagem
✅ **Anti-bloqueio**: Respostas humanizadas parecem naturais
✅ **Escalável**: Cada tipo de negócio tem flow otimizado
✅ **Debugável**: Estados e transições são rastreáveis
✅ **Editável**: Usuário pode modificar via chat

---

*Criado para AgenteZap - Sistema Híbrido de Atendimento*
