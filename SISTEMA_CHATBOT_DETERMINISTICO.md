# 🎯 SISTEMA CHATBOT DETERMINÍSTICO - Documentação Completa

## 📋 VISÃO GERAL

Este documento descreve o **Sistema de Chatbot Determinístico** implementado no AgentEzap. O sistema garante que **a IA NUNCA toma decisões sozinha**, eliminando respostas erradas e inconsistentes.

## 🎯 PROBLEMA RESOLVIDO

### Antes (Sistema apenas com IA):
- ✗ IA respondia informações erradas às vezes
- ✗ Cliente explicava quem era a empresa e IA esquecia
- ✗ Respostas variavam mesmo para mesmas perguntas
- ✗ IA inventava preços, produtos, informações

### Agora (Sistema Determinístico):
- ✅ IA apenas INTERPRETA intenção (não decide)
- ✅ SISTEMA toma TODAS as decisões (baseado em regras)
- ✅ IA apenas HUMANIZA a resposta final
- ✅ Respostas sempre consistentes e corretas

## 🔄 COMO FUNCIONA

### Fluxo de Processamento:

```
1. Cliente envia mensagem
   ↓
2. IA interpreta intenção
   - "Cliente quer ver produtos"
   - "Cliente quer agendar"
   - "Cliente quer preço"
   ↓
3. SISTEMA consulta fluxo determinístico
   - Estado atual: "start"
   - Intenção: "product_inquiry"
   - Próximo estado: "show_catalog"
   ↓
4. SISTEMA gera resposta baseada em REGRAS
   - Template do estado "show_catalog"
   - Substitui variáveis: {{product_name}}, {{price}}
   - Dados vêm do BANCO, não da IA
   ↓
5. IA humaniza a resposta
   - Torna mais conversacional
   - Adiciona emojis (máximo 2)
   - Mantém EXATAMENTE as mesmas informações
   ↓
6. Resposta enviada ao cliente
```

## 🏗️ ARQUITETURA

### Componentes Principais:

#### 1. **DeterministicFlowEngine.ts**
Motor principal que processa mensagens usando fluxos determinísticos.

**Responsabilidades:**
- Carregar FlowDefinition do banco
- Interpretar intenção do usuário (via IA)
- Determinar próximo estado (via REGRAS)
- Gerar resposta do template
- Humanizar resposta final

#### 2. **PromptToFlowConverter.ts**
Converte prompts de agentes em fluxos determinísticos.

**Responsabilidades:**
- Analisar prompt e extrair informações
- Detectar tipo de negócio (delivery, vendas, agendamento, genérico)
- Criar estados do fluxo
- Extrair preços, links, regras do prompt

#### 3. **Tabelas no Banco de Dados**

**`flow_definitions`**
Armazena os fluxos determinísticos.

```sql
- id: UUID
- user_id: Referência para users
- flow_type: DELIVERY | VENDAS | AGENDAMENTO | SUPORTE | CURSO | GENERICO
- agent_name: Nome do agente
- business_name: Nome do negócio
- agent_personality: Personalidade (formal, informal, etc)
- flow_definition: JSONB com {states, initialState}
- business_data: JSONB com preços, links, cupons, etc
- global_rules: Array de regras globais
- source_prompt: Prompt original
- version: Versionamento
- is_active: Ativo/inativo
```

**`flow_executions`**
Rastreia execuções ativas de fluxos.

```sql
- id: UUID
- flow_definition_id: Referência para flow_definitions
- user_id: Referência para users
- conversation_id: ID da conversa (WhatsApp contact)
- current_state: Estado atual no fluxo
- flow_data: JSONB com dados coletados (carrinho, preferências)
- state_history: Array de estados visitados
- status: active | completed | abandoned | error
```

**`user_active_modules`** (VIEW)
Determina qual módulo está ativo por usuário.

Retorna: `{ user_id, active_module, computed_at }`

## 🎭 TIPOS DE FLUXO

O sistema cria fluxos diferentes baseados no tipo de negócio:

### 1. DELIVERY
Estados: start → show_menu → take_order → confirm_order → collect_address → finalize_order

### 2. VENDAS (Catálogo/Produtos)
Estados: start → show_catalog → product_details → show_prices → finalize_sale

### 3. AGENDAMENTO
Estados: start → show_availability → collect_date → collect_time → confirm_appointment

### 4. SUPORTE
Estados: start → show_faq → report_issue → transfer_human

### 5. CURSO
Estados: start → show_modules → show_module_details → start_lesson

### 6. GENERICO (Escritório/Atendimento Geral)
Estados: start → company_info → transfer_human → leave_message

## 🔧 INTEGRAÇÃO COM SISTEMA EXISTENTE

### No `aiAgent.ts`:

```typescript
// PRIORIDADE 1: Sistema Determinístico
try {
  const flowEngine = new DeterministicFlowEngine();
  const flowResult = await flowEngine.processMessage(...);

  if (flowResult) {
    // Retorna resposta do fluxo (IA não foi usada para decisão)
    return { text: flowResult.text };
  }

  // Se não tem fluxo, cria automaticamente
  const converter = new PromptToFlowConverter();
  const newFlow = await converter.convertPromptToFlow(prompt, userId);
  await saveFlow(newFlow);

  // Processa novamente com fluxo recém-criado
  const retryResult = await flowEngine.processMessage(...);
  if (retryResult) return { text: retryResult.text };

} catch (error) {
  // Fallback para sistema legado
}

// PRIORIDADE 2: Sistema de Delivery (se fluxo não respondeu)
// PRIORIDADE 3: Sistema legado com IA pura
```

## 🚀 CRIAÇÃO AUTOMÁTICA DE FLUXOS

Quando um agente **SEM fluxo** recebe uma mensagem:

1. Sistema detecta ausência de FlowDefinition
2. Busca o prompt do agente
3. Analisa o prompt:
   - Tipo de negócio
   - Nome do agente
   - Nome do negócio
   - Personalidade
   - Preços, links, cupons
   - Regras globais
4. Cria FlowDefinition automaticamente
5. Salva no banco
6. Processa mensagem usando o fluxo recém-criado

**Resultado**: TODOS os agentes, mesmo os criados antes deste sistema, passam a usar fluxo determinístico automaticamente!

## 🎨 EXEMPLO DE FLUXO

### Estado: "show_catalog"

```typescript
{
  id: 'show_catalog',
  name: 'Mostrar Catálogo',
  type: 'info',
  message: 'Aqui estão nossos produtos! 🛍️\n\n[Catálogo será carregado automaticamente]\n\nTe interessou algum produto específico?',
  nextStates: {
    'product_inquiry': 'product_details',
    'price': 'show_prices'
  },
  defaultNext: 'product_details'
}
```

### Processamento:

1. **Cliente**: "quero ver os produtos"
2. **IA interpreta**: category = "product_inquiry", confidence = 0.8
3. **Sistema decide**: Estado atual = "start", Intenção = "product_inquiry" → Próximo estado = "show_catalog"
4. **Sistema gera**: Template do estado "show_catalog"
5. **IA humaniza**: "Que legal! Deixa eu te mostrar nossos produtos! 🛍️..."
6. **Resposta final**: Mensagem humanizada + catálogo do banco

## 📊 VANTAGENS DO SISTEMA

### 1. Consistência Total
- Mesma pergunta = Mesma resposta
- Sem variações da IA

### 2. Informações Corretas
- Dados vêm do banco, não da IA
- Impossível inventar preços/produtos

### 3. Funciona para Qualquer Negócio
- Delivery, Vendas, Agendamento, Suporte, Curso
- Escritório/Atendimento Genérico
- **Sistema se adapta automaticamente**

### 4. Migração Automática
- Agentes antigos ganham fluxo automaticamente
- Sem necessidade de reconfiguração manual

### 5. IA Como Assistente, Não Como Cérebro
- IA interpreta (o que o usuário quer)
- IA humaniza (torna resposta natural)
- Sistema decide (próximo estado)
- Sistema gera (resposta baseada em regras)

## 🔄 SINCRONIZAÇÃO AGENTE ↔ FLUXO

### Quando agente é CRIADO:
1. Prompt é analisado
2. FlowDefinition é gerada automaticamente
3. Salva no banco junto com o agente

### Quando agente é EDITADO:
1. Detecta mudanças no prompt
2. Atualiza FlowDefinition correspondente
3. Mantém sincronização

### Quando usuário MUDA módulo (delivery → catálogo):
1. Sistema detecta mudança via VIEW `user_active_modules`
2. Carrega FlowDefinition do tipo correto
3. Se não existe, cria automaticamente

## 🎯 PRÓXIMOS PASSOS

1. ✅ Tabelas criadas no banco
2. ✅ Motor de fluxo implementado
3. ✅ Conversor de prompts implementado
4. ✅ Integração com aiAgent.ts
5. ⏳ Testes com Playwright MCP
6. ⏳ Revisões de código (3 ciclos)
7. ⏳ Deploy em produção

## 📝 LOGS DO SISTEMA

O sistema gera logs detalhados para debug:

```
🎯 [DeterministicFlow] Verificando se deve usar fluxo determinístico...
🎯 [DeterministicFlow] Processando mensagem para user abc123
   Mensagem: "quero ver o cardápio..."
   📋 Flow carregado: DELIVERY (7 estados)
   🔄 Estado atual: start
   🧠 Intenção detectada: product_inquiry (80%)
   ➡️ Próximo estado: show_menu
   ✅ Resposta gerada: "Aqui está nosso cardápio! 📋..."
🎯 [DeterministicFlow] ✅ Resposta gerada pelo fluxo determinístico!
   Estado: show_menu
```

## 🛡️ GARANTIAS DO SISTEMA

1. **IA NUNCA toma decisões sozinha**
2. **Dados SEMPRE vêm do banco**
3. **Respostas SEMPRE consistentes**
4. **Funciona para QUALQUER tipo de negócio**
5. **Migração AUTOMÁTICA de agentes existentes**
6. **Fallback seguro** (se falhar, usa sistema legado)

---

**Desenvolvido com foco em determinismo e confiabilidade para o AgentEzap**
