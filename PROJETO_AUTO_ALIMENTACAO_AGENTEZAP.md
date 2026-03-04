# Projeto Auto-Alimentação AgentZap

## Visão Geral

Sistema para que o agente admin de vendas do AgentZap **nunca se perca como um humano**: não esqueça contexto, não repita perguntas, não entre em loop, e aprenda com cada conversa.

Baseado em pesquisa profunda de:
- **OpenClaw** — memória em camadas (Markdown), compactação, flush pré-compactação, busca semântica híbrida
- **LangGraph.js** — checkpointer persistente, memory store cross-thread, memória semântica/episódica/procedural
- **Resultados V7** — 5 perfis realistas, nota média 5.0/10, 33 erros, 20% conversão

---

## Diagnóstico: Por Que o Agente Falha (V7)

### Erros Identificados (33 total em 5 conversas)

| Tipo | Qty | Exemplo Real | Causa Raiz |
|------|-----|-------------|------------|
| **REPETITIVO** | 9x | Agente pergunta horário depois que cliente já respondeu | Sem detecção de duplicata nas respostas |
| **RESPOSTA_GENERICA** | 6x | "Consigo sim" sem detalhes | Prompt sem instrução anti-genérico |
| **NAO_RESPONDEU_PERGUNTA** | 6x | Cliente pergunta sobre fotos/painel, agente ignora | Classificador não identifica perguntas |
| **CONTEXTO_PERDIDO** | 6x | Dr. Carlos deu horário Seg-Sex 8-18 + Sab 8-12, agente salvou só Seg-Sex 9-18 | Sem compactação/resumo de contexto |
| **TEXTO_LONGO** | 3x | Respostas com parágrafos inteiros | Sem limit de tokens na resposta |
| **LOOP_TRAVADO** | 2x | Fernanda: agente repetiu "quer que ele conclua o pedido?" 3+ vezes | Zero detecção de loop |

### O Que Existe Hoje no Código vs O Que Falta

| Componente | `aiAgent.ts` (end-user) | `adminAgentService.ts` (vendas) | Status |
|-----------|------------------------|--------------------------------|--------|
| Loop detection (hash MD5) | ✅ `isDuplicateResponse()` | ❌ NENHUM | **CRÍTICO** |
| Loop detection (estrutural) | ✅ `analyzeConversationHistory()` | ❌ NENHUM | **CRÍTICO** |
| Anti-repetição no prompt | ✅ `generateMemoryContextBlock()` | 1 linha sobre cardápio | **CRÍTICO** |
| `memory_summary` no DB | Schema existe, nunca usado | Schema existe, nunca usado | **GRAVE** |
| Token counting | ❌ | ❌ | **GRAVE** |
| Compactação/resumo | Parcial (efêmera) | ❌ NENHUM | **GRAVE** |
| State persistence | N/A | Parcial (`setupProfile` only) | **MÉDIO** |
| Intent tracking | Schema tem campos, não usa | Schema tem campos, não usa | **MÉDIO** |

---

## Arquitetura Proposta: 4 Camadas de Auto-Alimentação

Inspirado no melhor de OpenClaw + LangGraph, adaptado para a realidade do AgentZap (monolito TypeScript, Supabase, WhatsApp).

```
┌──────────────────────────────────────────────────────┐
│                    CAMADA 4                           │
│              MEMÓRIA PROCEDURAL                      │
│  Auto-refinamento do prompt baseado em feedback      │
│  (Futuro — Fase 3 do POC)                            │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────┐
│                    CAMADA 3                           │
│              MEMÓRIA DE LONGO PRAZO                   │
│  memory_summary persistido + busca por contexto      │
│  Equivalente: OpenClaw MEMORY.md + LangGraph Store   │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────┐
│                    CAMADA 2                           │
│              COMPACTAÇÃO INTELIGENTE                  │
│  Resumo automático antes de descartar mensagens      │
│  Equivalente: OpenClaw auto-compaction               │
└────────────────────────┬─────────────────────────────┘
                         │
┌────────────────────────┴─────────────────────────────┐
│                    CAMADA 1                           │
│              ANTI-LOOP & GUARD RAILS                  │
│  Detecção de repetição + bloqueio de loop +           │
│  instruções anti-genérico no prompt                   │
│  Equivalente: aiAgent.ts já tem, admin NÃO TEM       │
└──────────────────────────────────────────────────────┘
```

---

## CAMADA 1: Anti-Loop & Guard Rails

**Prioridade:** MÁXIMA (resolve o erro #1: REPETITIVO 9x + LOOP_TRAVADO 2x)

### 1.1 — isDuplicateResponse() para Admin Agent

Portar de `aiAgent.ts` L110-132. Detecção por hash MD5:

```typescript
// NOVO em adminAgentService.ts
const recentAdminResponseHashes = new Map<string, { hash: string; count: number; lastTime: number }[]>();

function isAdminDuplicateResponse(phone: string, responseText: string): boolean {
  const hash = createHash('md5').update(responseText.trim().toLowerCase().substring(0, 200)).digest('hex');
  const now = Date.now();
  const WINDOW_MS = 5 * 60 * 1000; // 5 minutos
  const MAX_REPEATS = 2;
  
  if (!recentAdminResponseHashes.has(phone)) {
    recentAdminResponseHashes.set(phone, []);
  }
  
  const history = recentAdminResponseHashes.get(phone)!;
  // Limpar entradas antigas
  const filtered = history.filter(h => now - h.lastTime < WINDOW_MS);
  
  const existing = filtered.find(h => h.hash === hash);
  if (existing) {
    existing.count++;
    existing.lastTime = now;
    if (existing.count >= MAX_REPEATS) {
      return true; // BLOQUEADO - resposta repetida
    }
  } else {
    filtered.push({ hash, count: 1, lastTime: now });
  }
  
  recentAdminResponseHashes.set(phone, filtered);
  return false;
}
```

**Onde inserir:** Após o LLM retornar a resposta em `generateAIResponse()` (após L5590).

**Ação quando repetição detectada:** Chamar LLM novamente com instrução extra:
```
"ATENÇÃO: Sua resposta anterior foi idêntica a uma resposta recente. 
Você DEVE dar uma resposta DIFERENTE e mais específica ao que o cliente disse.
NÃO repita o que já disse. Avance a conversa."
```

### 1.2 — analyzeConversationHistory() para Admin Agent

Portar de `aiAgent.ts` L1329-1577. Análise estrutural:

```typescript
interface AdminConversationMemory {
  loopDetected: boolean;
  loopType: 'greeting_repeat' | 'question_repeat' | 'response_repeat' | 'stuck_flow' | null;
  repeatedContent: string | null;
  turnsSinceLastNewInfo: number;
  questionsAskedByClient: string[]; // perguntas do cliente NÃO respondidas
  infoAlreadyProvided: string[];    // informações já dadas pelo agente
}

function analyzeAdminConversationHistory(history: ConversationEntry[]): AdminConversationMemory {
  const memory: AdminConversationMemory = {
    loopDetected: false,
    loopType: null,
    repeatedContent: null,
    turnsSinceLastNewInfo: 0,
    questionsAskedByClient: [],
    infoAlreadyProvided: []
  };
  
  const assistantMsgs = history.filter(h => h.role === 'assistant');
  const userMsgs = history.filter(h => h.role === 'user');
  
  // Detectar respostas idênticas (primeiros 100 chars)
  const recentAssistant = assistantMsgs.slice(-5);
  const prefixes = recentAssistant.map(m => m.content.substring(0, 100).toLowerCase());
  const duplicates = prefixes.filter((p, i) => prefixes.indexOf(p) !== i);
  if (duplicates.length >= 2) {
    memory.loopDetected = true;
    memory.loopType = 'response_repeat';
    memory.repeatedContent = duplicates[0];
  }
  
  // Detectar perguntas do cliente não respondidas
  for (const msg of userMsgs.slice(-5)) {
    if (msg.content.includes('?') || /como|quanto|qual|quando|onde|funciona|pode|tem/i.test(msg.content)) {
      const answered = assistantMsgs.some(a => 
        a.timestamp > msg.timestamp && 
        hasRelevantAnswer(a.content, msg.content)
      );
      if (!answered) {
        memory.questionsAskedByClient.push(msg.content);
      }
    }
  }
  
  return memory;
}
```

**Onde inserir:** Antes de `getMasterPrompt()` em `processAdminMessage()` (antes de L4298).

### 1.3 — Bloco de Memória no Prompt (Anti-Repetição)

Equivalente ao `generateMemoryContextBlock()` do `aiAgent.ts`:

```typescript
function generateAdminMemoryContextBlock(memory: AdminConversationMemory, history: ConversationEntry[]): string {
  let block = '\n<memoria_conversa>\n';
  
  if (memory.loopDetected) {
    block += `⚠️ ALERTA DE LOOP DETECTADO (${memory.loopType})!\n`;
    block += `Conteúdo repetido: "${memory.repeatedContent}"\n`;
    block += `OBRIGATÓRIO: Dê uma resposta COMPLETAMENTE DIFERENTE.\n`;
    block += `Se o cliente já respondeu algo, AVANCE para o próximo passo.\n\n`;
  }
  
  if (memory.questionsAskedByClient.length > 0) {
    block += `❓ PERGUNTAS DO CLIENTE AINDA NÃO RESPONDIDAS:\n`;
    for (const q of memory.questionsAskedByClient) {
      block += `- "${q}"\n`;
    }
    block += `OBRIGATÓRIO: Responda TODAS estas perguntas ANTES de fazer novas perguntas.\n\n`;
  }
  
  if (memory.infoAlreadyProvided.length > 0) {
    block += `✅ INFORMAÇÕES JÁ FORNECIDAS (não repetir):\n`;
    for (const info of memory.infoAlreadyProvided) {
      block += `- ${info}\n`;
    }
    block += '\n';
  }
  
  // Resumo do que o cliente já disse
  const clientInfo = extractClientProvidedInfo(history);
  if (Object.keys(clientInfo).length > 0) {
    block += `📋 O QUE O CLIENTE JÁ DISSE (use isso, NÃO pergunte de novo):\n`;
    for (const [key, value] of Object.entries(clientInfo)) {
      block += `- ${key}: ${value}\n`;
    }
    block += '\n';
  }
  
  block += '</memoria_conversa>\n';
  return block;
}
```

**Onde inserir:** No `getMasterPrompt()` (L4298-4310), após o `memoryInstruction` existente.

### 1.4 — Instruções Anti-Repetição no Template

Adicionar ao `<guardrails>` do `RODRIGO_PROMPT_TEMPLATE`:

```xml
<guardrails>
  <!-- REGRAS ANTI-LOOP (NOVAS) -->
  - NUNCA repita a mesma pergunta se o cliente já respondeu
  - NUNCA dê a mesma resposta genérica duas vezes seguidas
  - Se o cliente fez uma pergunta, RESPONDA antes de fazer outra pergunta
  - Se você perceber que está repetindo algo, AVANCE a conversa
  - Cada resposta deve trazer INFORMAÇÃO NOVA ou AVANÇAR um passo
  - Máximo 3 frases por resposta no WhatsApp
  - Se não tem certeza do que responder, pergunte algo específico e diferente
  
  <!-- REGRAS EXISTENTES -->
  - Repetir cardápio/catálogo toda hora — só quando perguntarem
  ...
</guardrails>
```

---

## CAMADA 2: Compactação Inteligente

**Prioridade:** ALTA (resolve CONTEXTO_PERDIDO 6x)

### 2.1 — Summarize Before Truncate

Inspirado em OpenClaw auto-compaction. Quando o histórico atinge 25 mensagens, antes de fazer `slice(-15)`:

```typescript
async function compactConversationHistory(
  phone: string, 
  history: ConversationEntry[],
  session: ClientSession
): Promise<{ compactedHistory: ConversationEntry[], summary: string }> {
  
  if (history.length < 25) {
    return { compactedHistory: history, summary: session.memorySummary || '' };
  }
  
  // Pegar as mensagens que vão ser "compactadas" (as mais antigas)
  const toCompact = history.slice(0, -15); // Manter as últimas 15 intactas
  const toKeep = history.slice(-15);
  
  // Gerar resumo das mensagens antigas + resumo anterior
  const previousSummary = session.memorySummary || '';
  
  const compactionPrompt = `Você é um assistente de resumo. Resuma esta conversa de vendas WhatsApp em bullets concisos.

${previousSummary ? `RESUMO ANTERIOR DA CONVERSA:\n${previousSummary}\n\n` : ''}

MENSAGENS A RESUMIR:
${toCompact.map(m => `[${m.role}]: ${m.content}`).join('\n')}

REGRAS:
1. Mantenha TODOS os fatos concretos: nomes, horários, preços, decisões
2. Mantenha qual etapa do onboarding o cliente está
3. Mantenha perguntas feitas pelo cliente e se foram respondidas
4. Mantenha intenções de compra/desistência
5. Máximo 500 caracteres
6. Format: bullets "-"

RESUMO:`;

  const summary = await chatComplete({
    model: 'mistral-small-latest', // modelo leve para resumo
    messages: [{ role: 'user', content: compactionPrompt }],
    max_tokens: 200
  });
  
  // Persistir resumo no DB
  await persistMemorySummary(phone, summary);
  
  // Criar entrada de resumo
  const summaryEntry: ConversationEntry = {
    role: 'system',
    content: `[RESUMO DA CONVERSA ANTERIOR]\n${summary}`,
    timestamp: toKeep[0]?.timestamp || Date.now()
  };
  
  return {
    compactedHistory: [summaryEntry, ...toKeep],
    summary
  };
}
```

### 2.2 — Persistir memory_summary no DB

```typescript
async function persistMemorySummary(phone: string, summary: string): Promise<void> {
  await db.update(adminConversations)
    .set({ memorySummary: summary })
    .where(eq(adminConversations.contactNumber, phone));
}
```

### 2.3 — Restaurar memory_summary no Cold Start

No `processAdminMessage()`, onde restaura de DB (L5818-5825):

```typescript
// EXISTENTE: restaura setupProfile e flowState
// NOVO: restaurar memorySummary
if (dbConversation.memorySummary) {
  session.memorySummary = dbConversation.memorySummary;
  // Injetar como primeira mensagem do histórico
  session.conversationHistory.unshift({
    role: 'system',
    content: `[RESUMO DA CONVERSA ANTERIOR]\n${dbConversation.memorySummary}`,
    timestamp: Date.now()
  });
}
```

---

## CAMADA 3: Memória de Longo Prazo

**Prioridade:** MÉDIA-ALTA (resolve padrões cross-sessão)

### 3.1 — Estrutura de Memória Expandida no context_state

Usar os campos que já existem no schema mas nunca são escritos:

```typescript
// Expandir context_state para incluir:
interface ExpandedContextState {
  // Já existentes
  mode?: string;
  pendingSlot?: string;
  capturedSlots?: Record<string, string>;
  
  // NOVOS - Memória de Longo Prazo
  lastIntent?: string;               // última intenção classificada
  lastQuestionAnswered?: string;      // última pergunta respondida
  clientProfile?: {                   // perfil acumulado do cliente
    nome?: string;
    negocio?: string;
    nicho?: string;
    interesse?: 'alto' | 'medio' | 'baixo';
    objecoes?: string[];              // objeções levantadas
    perguntasFrequentes?: string[];   // o que o cliente mais pergunta
  };
  conversationMetrics?: {
    totalTurns: number;
    questionsAsked: number;
    questionsAnswered: number;
    loopsDetected: number;
    lastActiveAt: string;
  };
  flowCheckpoints?: {                 // equivalente LangGraph checkpoints
    lastNode: string;                 // último passo do fluxo
    completedNodes: string[];         // passos já completados
    skippedNodes: string[];           // passos pulados
  };
}
```

### 3.2 — Flush de Memória Pré-Compactação

Inspirado em OpenClaw `memoryFlush`. Antes de compactar, extrair informações duráveis:

```typescript
async function memoryFlushBeforeCompaction(
  history: ConversationEntry[],
  currentState: ExpandedContextState
): Promise<ExpandedContextState> {
  
  // Usar LLM leve para extrair fatos duráveis
  const extractionPrompt = `Extraia fatos concretos desta conversa de vendas.

CONVERSA:
${history.slice(0, -15).map(m => `[${m.role}]: ${m.content}`).join('\n')}

Responda em JSON:
{
  "clientName": "nome se mencionado",
  "businessType": "tipo de negócio",
  "niche": "nicho específico",
  "interestLevel": "alto|medio|baixo",
  "objections": ["lista de objeções"],
  "decisionssMade": ["decisões tomadas"],
  "pendingQuestions": ["perguntas sem resposta"],
  "scheduleInfo": "horários mencionados",
  "priceDiscussed": true/false
}`;

  const extraction = await chatComplete({
    model: 'mistral-small-latest',
    messages: [{ role: 'user', content: extractionPrompt }],
    max_tokens: 300
  });
  
  // Merge com estado existente
  const facts = JSON.parse(extraction);
  return {
    ...currentState,
    clientProfile: {
      ...currentState.clientProfile,
      nome: facts.clientName || currentState.clientProfile?.nome,
      negocio: facts.businessType || currentState.clientProfile?.negocio,
      nicho: facts.niche || currentState.clientProfile?.nicho,
      interesse: facts.interestLevel || currentState.clientProfile?.interesse,
      objecoes: [...(currentState.clientProfile?.objecoes || []), ...(facts.objections || [])],
    },
    lastQuestionAnswered: facts.pendingQuestions?.[0]
  };
}
```

### 3.3 — Injeção de Memória no Prompt

Quando o prompt é montado, a memória de longo prazo é injetada:

```typescript
function injectLongTermMemory(prompt: string, state: ExpandedContextState): string {
  if (!state.clientProfile) return prompt;
  
  let memoryBlock = '\n<memoria_cliente>\n';
  
  if (state.clientProfile.nome) {
    memoryBlock += `Nome: ${state.clientProfile.nome}\n`;
  }
  if (state.clientProfile.negocio) {
    memoryBlock += `Negócio: ${state.clientProfile.negocio}\n`;
  }
  if (state.clientProfile.objecoes?.length) {
    memoryBlock += `Objeções já levantadas: ${state.clientProfile.objecoes.join(', ')}\n`;
    memoryBlock += `⚠️ Não insista em pontos que o cliente já rejeitou\n`;
  }
  if (state.flowCheckpoints?.lastNode) {
    memoryBlock += `Último passo completado: ${state.flowCheckpoints.lastNode}\n`;
    memoryBlock += `Passos já feitos: ${state.flowCheckpoints.completedNodes.join(' → ')}\n`;
  }
  
  memoryBlock += '</memoria_cliente>\n';
  
  return prompt + memoryBlock;
}
```

---

## CAMADA 4: Memória Procedural (Futuro — POC LangGraph)

**Prioridade:** BAIXA (Fase 2-3 do POC)

### 4.1 — Auto-Refinamento de Prompt

Inspirado em LangGraph procedural memory. O agente analisa conversas passadas e refina suas próprias instruções:

```typescript
// Roda como job periódico (1x/dia), não no hot path
async function refineAgentInstructions(): Promise<void> {
  // 1. Buscar últimas 20 conversas com métricas
  const recentConversations = await getRecentConversationsWithMetrics(20);
  
  // 2. Identificar padrões de falha
  const failurePatterns = analyzeFailurePatterns(recentConversations);
  
  // 3. Gerar regras novas baseadas nos padrões
  const refinementPrompt = `Analise estes padrões de falha do agente de vendas e sugira regras específicas para evitá-los:

PADRÕES DE FALHA:
${failurePatterns.map(p => `- ${p.type}: ${p.count}x — Exemplo: "${p.example}"`).join('\n')}

REGRAS ATUAIS:
${currentGuardrails}

Sugira 3-5 novas regras ESPECÍFICAS e ACIONÁVEIS. Formato: bullet list.`;

  const newRules = await chatComplete({ ... });
  
  // 4. Salvar no DB como "procedural memory"
  await saveProceduralMemory(newRules);
}
```

### 4.2 — Integração com LangGraph.js (POC)

Quando o POC LangGraph.js estiver pronto:

```
adminAgentGraphPOC.ts
  ├── load_context         → Lê memory_summary + context_state do DB
  ├── classify_turn        → Classifica intent com JSON estruturado
  ├── analyze_loop         → CAMADA 1: detecta loops
  ├── compact_if_needed    → CAMADA 2: compacta se > 25 msgs
  ├── flush_memory         → CAMADA 3: extrai fatos duráveis
  ├── collect_missing_info → Coleta dados faltantes
  ├── execute_action       → Executor determinístico
  ├── validate_result      → Validação real antes de confirmar
  ├── generate_reply       → LLM gera resposta com memória injetada
  ├── check_duplicate      → CAMADA 1: verifica duplicata
  └── persist_state        → Salva tudo no DB
```

---

## Plano de Implementação por Fases

### FASE 1: Anti-Loop (Impacto imediato — 1-2 dias)
| # | Tarefa | Arquivo | Linhas | Complexidade |
|---|--------|---------|--------|-------------|
| 1.1 | `isAdminDuplicateResponse()` | adminAgentService.ts | Após L5590 | Baixa |
| 1.2 | `analyzeAdminConversationHistory()` | adminAgentService.ts | Antes de L4298 | Média |
| 1.3 | `generateAdminMemoryContextBlock()` | adminAgentService.ts | L4298-4310 | Média |
| 1.4 | Instruções anti-repetição no `<guardrails>` | adminAgentService.ts | L3098-3106 | Baixa |
| 1.5 | Retry com instrução anti-loop quando duplicata | adminAgentService.ts | Após L5590 | Baixa |
| 1.6 | Teste V8: rodar mesmos 5 perfis, comparar | teste-v8.mjs | Novo arquivo | Média |

### FASE 2: Compactação (Memória média — 1-2 dias)
| # | Tarefa | Arquivo | Linhas | Complexidade |
|---|--------|---------|--------|-------------|
| 2.1 | `compactConversationHistory()` | adminAgentService.ts | Antes de L3609 | Média |
| 2.2 | `persistMemorySummary()` | adminAgentService.ts | Novo | Baixa |
| 2.3 | Restaurar `memory_summary` no cold start | adminAgentService.ts | L5818-5825 | Baixa |
| 2.4 | Substituir `slice(-30)` por compactação | adminAgentService.ts | L3608, L5545 | Baixa |
| 2.5 | Teste V8.1: conversas longas (15+ turnos) | teste-v8.1.mjs | Novo arquivo | Média |

### FASE 3: Memória de Longo Prazo (Durável — 2-3 dias)
| # | Tarefa | Arquivo | Linhas | Complexidade |
|---|--------|---------|--------|-------------|
| 3.1 | Expandir `context_state` type | adminAgentService.ts | L236-244 | Baixa |
| 3.2 | `memoryFlushBeforeCompaction()` | adminAgentService.ts | Novo | Alta |
| 3.3 | `injectLongTermMemory()` no prompt | adminAgentService.ts | L4298-4310 | Média |
| 3.4 | Persistir `lastIntent` + `capturedSlots` | adminAgentService.ts | L236-244 | Média |
| 3.5 | Tracking de `flowCheckpoints` | adminAgentService.ts | L5770+ | Alta |
| 3.6 | Teste V8.2: conversas com interrupções | teste-v8.2.mjs | Novo arquivo | Média |

### FASE 4: POC LangGraph.js (Orquestração — 5-7 dias)
| # | Tarefa | Arquivo | Complexidade |
|---|--------|---------|-------------|
| 4.1 | Instalar `@langchain/langgraph` | package.json | Baixa |
| 4.2 | `adminAgentGraphState.ts` — definição do estado | Novo | Média |
| 4.3 | `adminAgentGraphClassifier.ts` — classificação por LLM | Novo | Alta |
| 4.4 | `adminAgentGraphExecutor.ts` — ações determinísticas | Novo | Alta |
| 4.5 | `adminAgentGraphValidator.ts` — validação real | Novo | Média |
| 4.6 | `adminAgentGraphPOC.ts` — grafo completo | Novo | Muito Alta |
| 4.7 | Checkpointer PostgreSQL (Supabase) | Novo | Média |
| 4.8 | Benchmark A/B: atual vs LangGraph | Script | Alta |

### FASE 5: Auto-Refinamento (Procedural Memory — 3-5 dias)
| # | Tarefa | Complexidade |
|---|--------|-------------|
| 5.1 | Job diário de análise de conversas | Alta |
| 5.2 | Geração automática de novas regras | Alta |
| 5.3 | Feature flag para ativar regras auto-geradas | Média |
| 5.4 | Dashboard de métricas de qualidade | Alta |

---

## Métricas de Sucesso

| Métrica | Hoje (V7) | Meta Fase 1 | Meta Fase 3 | Meta Fase 4 |
|---------|-----------|-------------|-------------|-------------|
| **Nota média** | 5.0/10 | 7.0/10 | 8.0/10 | 9.0/10 |
| **REPETITIVO** | 9x | ≤2x | 0x | 0x |
| **LOOP_TRAVADO** | 2x | 0x | 0x | 0x |
| **NAO_RESPONDEU** | 6x | ≤2x | ≤1x | 0x |
| **CONTEXTO_PERDIDO** | 6x | 4x | ≤1x | 0x |
| **Conversão** | 20% (1/5) | 40% | 60% | 80% |
| **Turnos médios** | 7.6 | 6 | 5 | 4 |

---

## Decisão sobre Modelo de Produção

Recomendação baseada nos testes:

| Opção | Prós | Contras | Recomendação |
|-------|------|---------|-------------|
| **NVIDIA Llama 3.3 70B** | Grátis, testado, bom PT-BR | Sem fine-tune, latência? | ✅ Benchmark primeiro |
| **NVIDIA Nemotron 49B** | Raciocínio forte | Tags `<think>`, parsing extra | ⚠️ Só com parser |
| **NVIDIA Mistral Med 3** | Mesmo modelo, sem rate limit | Depende de NVIDIA uptime | ✅ Alternativa ao direto |
| **Mistral direto** | Já está em produção | Rate limit 429 | ❌ Problemático |

**Ação:** Fazer benchmark comparativo antes de trocar.

---

## Arquivos Gerados por Este Projeto

```
PROJETO_AUTO_ALIMENTACAO_AGENTEZAP.md  ← Este documento
teste-ia-vs-ia-v7-perfis.mjs          ← Teste V7 (já criado)
resultado-teste-v7-perfis.json        ← Resultados V7 (já criado)
reanalisar-v7.mjs                     ← Re-análise V7 (já criado)
```

---

*Projeto criado em: $(date)*
*Baseado em: OpenClaw docs + LangGraph.js docs + V7 test results + AgentZap codebase analysis*
