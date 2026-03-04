# PESQUISA PROFUNDA: OpenClaw Session Reset, Memory Loss, Context Loss & Amnesia

**Data da pesquisa:** 2026-02-14
**Fontes pesquisadas:** Documentação oficial OpenClaw, GitHub Issues/PRs, Reddit r/openclaw

---

## ÍNDICE

1. [Pergunta 1: O reset "daily" limpa TODO o histórico?](#1-o-reset-daily-limpa-todo-o-histórico-de-mensagens)
2. [Pergunta 2: O OpenClaw recarrega transcrições dos JSONL?](#2-o-openclaw-recarrega-transcrições-dos-jsonl)
3. [Pergunta 3: Como configurar para não perder contexto?](#3-como-configurar-agentes-para-não-perder-contexto)
4. [Pergunta 4: O que exatamente o memoryFlush faz?](#4-o-que-exatamente-o-memoryflush-faz)
5. [Pergunta 5: Issues no GitHub sobre perda de memória](#5-issues-no-github-sobre-perda-de-memória)
6. [Pergunta 6: Comportamento nativo ou causado por patches?](#6-comportamento-nativo-ou-causado-por-patches)
7. [Soluções da Comunidade](#7-soluções-da-comunidade)
8. [Plano de Ação Recomendado](#8-plano-de-ação-recomendado)

---

## 1. O reset "daily" limpa TODO o histórico de mensagens?

### Resposta: SIM. Completamente.

A documentação oficial confirma que o reset diário cria uma **sessão completamente nova**, descartando todo o histórico de conversação anterior.

**Fonte:** https://docs.openclaw.ai/concepts/session

> *"Daily reset: defaults to 4:00 AM local time. A session is stale once its last update is earlier than the most recent daily reset time."*

> *"Reset creates a new sessionId for that sessionKey"*

### Como funciona tecnicamente:

1. **Avaliação preguiçosa (lazy):** O reset não acontece exatamente às 4h — ele é avaliado na **próxima mensagem recebida** após o horário de reset
2. **Novo sessionId:** Um novo UUID é gerado, criando um novo arquivo de transcrição `.jsonl`
3. **Transcrição anterior:** O arquivo JSONL antigo fica em disco como **artefato histórico**, mas NÃO é carregado na nova sessão
4. **Dois gatilhos competem:** `atHour: 4` (reset diário) e `idleMinutes: 480` (8 horas de inatividade) — **o que expirar primeiro ganha**

### Configuração atual do setup:

```json
"session": {
  "reset": {
    "mode": "daily",
    "atHour": 4,
    "idleMinutes": 480
  }
}
```

Isso significa: se o agente ficou inativo por 8 horas OU se passou das 4h da manhã (o que acontecer primeiro), a próxima mensagem cria uma sessão nova.

**Fonte adicional:** https://docs.openclaw.ai/gateway/configuration-reference

> *"atHour — Hour of day (0-23, local time) for the daily tombstone. Default 4."*
> *"idleMinutes — Sliding window in minutes. If the last session update is older than this, the session is considered stale."*

---

## 2. O OpenClaw recarrega transcrições dos JSONL?

### Resposta: NÃO. Os arquivos JSONL são artefatos históricos, não são recarregados.

A documentação oficial é muito clara sobre isso:

**Fonte:** https://docs.openclaw.ai/concepts/session-pruning

> *"Session pruning does not rewrite the on-disk session history (*.jsonl)"*

**Fonte:** https://docs.openclaw.ai/concepts/memory

> *"OpenClaw memory is plain Markdown in the agent workspace. The files are the source of truth; the model only 'remembers' what gets written to disk."*

### O que É carregado no início de uma nova sessão:

| Arquivo | Comportamento |
|---------|--------------|
| `SOUL.md` | Carregado sempre (system prompt) |
| `AGENTS.md` | Carregado sempre (instruções do agente) |
| `MEMORY.md` | Carregado sempre (memória permanente) |
| `memory/YYYY-MM-DD.md` | Carregados **hoje + ontem** automaticamente |
| `BOOT.md` | Executado apenas no `gateway:startup` (via hook boot-md) |
| Transcrições `.jsonl` | **NUNCA recarregados** — ficam em disco como histórico |

### Clarificação importante:

A memória do OpenClaw opera em **duas camadas completamente separadas:**

1. **Camada de sessão:** Transcrições `.jsonl` + `sessions.json` — efêmeras, descartadas no reset
2. **Camada de memória:** Arquivos Markdown no workspace (`MEMORY.md`, `memory/*.md`) — persistentes, lidos a cada sessão

**Fonte:** https://docs.openclaw.ai/reference/session-management-compaction

> *"Two persistence layers: sessions.json store + JSONL transcripts"*

---

## 3. Como configurar agentes para não perder contexto?

### Resposta: Não existe configuração nativa que preserve contexto entre sessões. Requer workarounds.

O OpenClaw **por design** não preserva contexto conversacional entre sessões. A comunidade desenvolveu várias soluções:

### 3.1 Solução Básica: MEMORY.md + memory/*.md

**Configuração mínima recomendada:**

```json
{
  "compaction": {
    "mode": "safeguard",
    "memoryFlush": {
      "enabled": true
    }
  },
  "memorySearch": {
    "enabled": true,
    "backend": "hybrid",
    "sessionMemory": {
      "enabled": true
    }
  }
}
```

**Problema:** `memoryFlush` só roda **antes da compactação**, NÃO no reset diário.

### 3.2 Solução: Hook `session-memory`

O hook bundled `session-memory` salva um resumo da conversa em `memory/YYYY-MM-DD.md` — mas **APENAS quando o usuário executa `/new` manualmente**.

**Fonte:** https://docs.openclaw.ai/automation/hooks

> Hooks bundled: `session-memory`, `boot-md`, `command-logger`, `bootstrap-extra-files`

**BUG CRÍTICO:** O hook `session-memory` NÃO dispara em auto-resets (diário às 4h ou idle timeout). Isso é o motivo principal da perda de memória.

**PR que corrige isso:** https://github.com/openclaw/openclaw/pull/14243

> *"The session-memory hook only fires on explicit /new commands, not on automatic session resets triggered by evaluateSessionFreshness (daily at 4 AM or after idle timeout). This means conversations silently lose all context overnight — no memory files are saved, and the bot wakes up with amnesia."*

### 3.3 Solução: Hook `session:end` (EM DESENVOLVIMENTO)

O evento `session:end` está listado como **"Future Event"** na documentação de hooks. Existem PRs ativos para implementá-lo:

- **Issue:** https://github.com/openclaw/openclaw/issues/15806
  > *"When a session is reset due to idle timeout, there's no hook event that fires before the session is destroyed. This means any unsaved context in the session is lost."*

- **PR:** https://github.com/openclaw/openclaw/pull/15933
  > *"Ensure session_end hook fires before session destruction due to idle timeout or daily reset policy. This allows agents to persist important context (update memory files, write RESUME.md, etc.) before any session destruction."*

### 3.4 Solução da Comunidade: Pre-compact file

**Fonte:** https://www.reddit.com/r/openclaw/comments/1r3501p/

Usuário "These-Koala9672" compartilhou uma abordagem:

> *"After a compaction or a /new session reset, the agent completely loses the conversational thread. It knows the 'facts' from memory files, but the actual dialogue — the tone, the back-and-forth, what we were working on — just vanishes."*

Solução proposta:
1. **`memory/conversation-pre-compact.md`** — Salvar últimos ~20.000 tokens de conversa real antes do reset
2. **Regra no AGENTS.md:** "ALWAYS read conversation-pre-compact.md if it exists"
3. **`conversation-state.md`** — Bookmark leve (~20 linhas) com último tópico, threads abertas

---

## 4. O que exatamente o memoryFlush faz?

### Resposta: Executa um turno silencioso do agente para escrever notas duráveis em `memory/YYYY-MM-DD.md` — mas APENAS antes da compactação.

**Fonte:** https://docs.openclaw.ai/concepts/memory

### Fluxo do memoryFlush:

```
Contexto se aproxima do limite de tokens
    ↓
memoryFlush.enabled = true?
    ↓ SIM
Executa turno silencioso (agentic turn) com prompt interno
    ↓
Agente escreve notas importantes em memory/YYYY-MM-DD.md
    ↓
Compactação normal acontece (resumo do contexto)
    ↓
Sessão continua com contexto compactado
```

### O que memoryFlush NÃO faz:

- **NÃO dispara no reset diário** (às 4h)
- **NÃO dispara no idle timeout** (8 horas de inatividade)
- **NÃO dispara no `/new` manual** (a menos que esteja combinado com o hook session-memory)
- **NÃO salva o histórico de conversação** — salva apenas "notas" que o modelo decide escrever

### Configuração atual:

```json
"compaction": {
  "mode": "safeguard",
  "memoryFlush": {
    "enabled": true
  },
  "reserveTokensFloor": 32000,
  "softThresholdTokens": 40000
}
```

**Fonte do modo safeguard:** https://docs.openclaw.ai/concepts/compaction

> No modo `safeguard`, a compactação só dispara quando o contexto atinge `softThresholdTokens` (40k tokens). Se as conversas nunca atingem esse limite, a compactação **NUNCA dispara** e o memoryFlush **NUNCA executa**.

### Bug relacionado:

**Issue:** https://github.com/openclaw/openclaw/issues/14143
> *"Memory compaction never triggers (compactionCount: 0)"*

**Issue:** https://github.com/openclaw/openclaw/issues/15101
> *"Stale totalTokens after compaction causes false memory flush triggers"*

**PR:** https://github.com/openclaw/openclaw/pull/15962
> *"fix(memory): only update memoryFlushCompactionCount when compaction completes"*

---

## 5. Issues no GitHub sobre perda de memória

### Busca realizada: `session reset memory` — 145 resultados (71 open, 74 closed)

**Fonte:** https://github.com/openclaw/openclaw/issues?q=session+reset+memory

### Issues CRÍTICAS diretamente relacionadas:

#### 5.1 PR #14576 — "Fix/memory loss bugs" (ABERTO, size: XL)
- **URL:** https://github.com/openclaw/openclaw/pull/14576
- **Autor:** @ENCHIGO
- **Mudanças:** +3100 / -1005 linhas
- **20 participantes**
- **O que faz:**
  > *"Adds saveSessionSnapshotToMemory to persist a short markdown snapshot of recent transcript content into the agent workspace memory/ folder before auto-resetting sessions (compaction failure, role ordering conflict, Gemini session corruption)."*
  > *"Improves QMD memory manager robustness by atomically exporting session markdown via temp-file+rename, reducing SQLite busy sensitivity."*
- **Review do Lead Developer (jondecker76):**
  > *"This PR addresses critical memory loss bugs and is close to ready [...] Priority: High — Memory loss prevention is critical."*

#### 5.2 PR #14243 — "fix: fire session-memory hook on auto-resets" (ABERTO)
- **URL:** https://github.com/openclaw/openclaw/pull/14243
- **Autor:** @TheDude135
- **Mudanças:** +62 / -23 linhas
- **Descrição:**
  > *"The session-memory hook only fires on explicit /new commands, not on automatic session resets triggered by evaluateSessionFreshness (daily at 4 AM or after idle timeout). This means conversations silently lose all context overnight — no memory files are saved, and the bot wakes up with amnesia."*
- **Solução:** Adiciona evento `session:auto-reset` que dispara o hook session-memory
- **Feature bônus:** Paths de memória baseados em tópicos para Telegram forum (`memory/topics/topic-{id}/`)

#### 5.3 PR #15933 — "feat: fire session_end hook on idle timeout and daily reset" (ABERTO)
- **URL:** https://github.com/openclaw/openclaw/pull/15933
- **Autor:** @Shuai-DaiDai
- **Mudanças:** +239 / -21 linhas
- **Descrição:**
  > *"When a session is reset due to idle timeout or daily reset, there's no hook event that fires before the session is destroyed. This means any unsaved context in the session is silently lost."*
- **Cobertura:** Idle timeout + Daily reset + Manual /new e /reset
- **Corrige:** Issue #15806

#### 5.4 Issue #15806 — "Feature: session:end hook event" (ABERTO)
- **URL:** https://github.com/openclaw/openclaw/issues/15806
- **Autor:** @sterling-prog
- **Descrição:**
  > *"When a session is reset due to idle timeout, there's no hook event that fires before the session is destroyed. This means any unsaved context in the session is lost."*
- **Workaround atual descrito:**
  > *"pre-reset-memory custom hook handles manual /new and /reset commands. End-of-day cron job catches some gaps. But idle timeout resets (the most common case) have no hook — context is silently lost."*

#### 5.5 Issue #14463 — "Webchat creates new session after ~27 min idle" (ABERTO, BUG)
- **URL:** https://github.com/openclaw/openclaw/issues/14463
- **Autor:** @j2deen
- **Versão afetada:** OpenClaw 2026.2.3-1
- **Descrição:**
  > *"Complete loss of conversation context with no user action (no /new, /reset, or explicit session change)."*
- **Evidência:** Dois arquivos de sessão distintos no servidor, gateway não foi reiniciado

#### 5.6 Issue #15624 — "Auto-save key info before /new or /reset" (FECHADO como duplicata)
- **URL:** https://github.com/openclaw/openclaw/issues/15624
- **Fechado como duplicata de:** #8185
- **Proposta:** Auto-salvar resumo antes de `/new` ou `/reset`

#### 5.7 Issue #15776 — "Feature Request: session:end hook" (ABERTO)
- **URL:** https://github.com/openclaw/openclaw/issues/15776

#### 5.8 PR #14924 — "fix: preserve session settings across daily auto-reset" (FECHADO/ABANDONADO)
- **URL:** https://github.com/openclaw/openclaw/pull/14924

---

## 6. Comportamento nativo ou causado por patches?

### Resposta: É COMPORTAMENTO NATIVO do OpenClaw. Não é causado por patches.

A perda de contexto nas sessões é **by design** na arquitetura do OpenClaw. As evidências:

### 6.1 Documentação oficial confirma:

**Fonte:** https://docs.openclaw.ai/concepts/session
> *"Reset creates a new sessionId for that sessionKey"* — docs oficiais descrevem isso como comportamento esperado.

**Fonte:** https://docs.openclaw.ai/concepts/memory
> *"OpenClaw memory is plain Markdown in the agent workspace. The files are the source of truth; the model only 'remembers' what gets written to disk."* — se não foi escrito em arquivo Markdown, está perdido.

### 6.2 Comunidade confirma:

**Reddit user (gavlaahh):** https://www.reddit.com/r/openclaw/comments/1r3nyro/
> *"You know the drill. You've spent three weeks teaching your agent your preferences, your workflow, your family's names. Context hits 200k tokens, compaction fires, and suddenly it's asking you what timezone you're in again."*

**Reddit user (snozzberrypatch):** Comentário no mesmo post:
> *"Umm isn't one of the key features of OpenClaw a persistent memory feature that flushes memory when you near the context limit and writes a summary to disk?"*

**Reddit user (SUPA_BROS):**
> *"I run on AutoMate (not OpenClaw) and we handle this with a two-layer approach: daily logs (raw timestamped entries, append-only) + a curated MEMORY.md that gets distilled periodically."*

**Reddit user (adamb0mbNZ):** https://www.reddit.com/r/openclaw/comments/1r49r9m/
> *"The AI agent community calls this context compression amnesia. A Reddit post about it pulled over a thousand upvotes because literally everyone building agents has hit this."*

### 6.3 GitHub confirma como problema sistêmico:

- **145 issues** relacionadas a "session reset memory"
- **71 ainda abertas** — problema ativo e reconhecido
- **Múltiplos PRs** tentando corrigir diferentes aspectos do mesmo problema fundamental
- O próprio **Lead Developer** (jondecker76) reconhece como "Priority: High — Memory loss prevention is critical"

### 6.4 Lacuna arquitetural confirmada:

A raiz do problema é uma **lacuna arquitetural**: o OpenClaw tem dois sistemas (sessão e memória) que não se comunicam adequadamente:

| Evento | Hook `session-memory` dispara? | `memoryFlush` dispara? | Resultado |
|--------|-------------------------------|----------------------|-----------|
| `/new` manual | ✅ SIM | ❌ NÃO | Contexto salvo |
| `/reset` manual | ✅ SIM | ❌ NÃO | Contexto salvo |
| Compactação | ❌ NÃO | ✅ SIM | Notas salvas |
| Reset diário (4h) | ❌ NÃO | ❌ NÃO | **CONTEXTO PERDIDO** |
| Idle timeout (8h) | ❌ NÃO | ❌ NÃO | **CONTEXTO PERDIDO** |
| Restart do gateway | ❌ NÃO | ❌ NÃO | **CONTEXTO PERDIDO** |

---

## 7. Soluções da Comunidade

### 7.1 Sistema de Memória com 5 Camadas de Redundância

**Autor:** gavlaahh (Reddit)
**Repo:** https://github.com/gavdalf/openclaw-memory
**Custo:** ~US$0,10/mês (Gemini Flash via OpenRouter)

Componentes:
1. Cron observer a cada 15 minutos
2. Watcher reativo inotify (dispara ao crescimento do transcript)
3. Hook pre-compaction (captura momento antes da amnésia)
4. Script de recovery de sessão (roda a cada /new)
5. Verificação de git diff

> *"Each layer exists because the previous ones had a specific blind spot"*

### 7.2 Sistema Híbrido SQLite + LanceDB

**Autor:** adamb0mbNZ (Reddit)
**Post:** https://www.reddit.com/r/openclaw/comments/1r49r9m/

Sistema de 3 camadas:
1. **SQLite + FTS5** — lookups estruturados (nomes, datas, preferências)
2. **LanceDB** — busca semântica vetorial para contexto fuzzy
3. **MEMORY.md** — fatos críticos sempre carregados

Com sistema de decay em 5 tiers:
| Tier | Exemplos | TTL |
|------|----------|-----|
| Permanent | Nomes, aniversários, decisões | Nunca expira |
| Stable | Detalhes do projeto, tech stack | 90 dias |
| Active | Tasks atuais, sprint goals | 14 dias |
| Session | Contexto de debug | 24 horas |
| Checkpoint | Estado pré-tarefa | 4 horas |

### 7.3 Solução File-Based Simples

**Autor:** These-Koala9672 (Reddit)
**Post:** https://www.reddit.com/r/openclaw/comments/1r3501p/

Componentes:
1. `memory/conversation-pre-compact.md` — Últimos ~20k tokens de conversa
2. Regra no AGENTS.md: "ALWAYS read conversation-pre-compact.md"
3. `conversation-state.md` — Bookmark leve (~20 linhas)

> *"The key insight is that compaction optimizes for token efficiency but sacrifices conversational continuity."*

### 7.4 Solução Panzrom (Reddit, comentário no post do gavlaahh):

> *"I just limited the context window to 40k tokens and now the memory flush and the auto compaction runs every few messages. The memory flush works well and the small context window is also cheaper."*

**Insight:** Forçar compactação frequente fazendo `softThresholdTokens` menor garante que `memoryFlush` rode com mais frequência.

---

## 8. Plano de Ação Recomendado

### IMEDIATO (hoje):

#### 8.1 Criar BOOT.md em cada workspace de agente

```markdown
# BOOT — Instruções de Inicialização

## REGRA CRÍTICA
Ao iniciar uma nova sessão, SEMPRE:
1. Leia memory/YYYY-MM-DD.md (data de hoje e ontem)
2. Leia MEMORY.md para contexto permanente
3. Leia memory/conversation-pre-compact.md se existir
4. NÃO pergunte "é a primeira vez que conversamos?" — consulte os arquivos de memória primeiro
5. Retome da onde parou baseado no contexto encontrado

## Identidade
Você é [NOME DO AGENTE]. Você tem acesso a memórias persistentes nos arquivos do workspace.
Sempre que receber nova informação importante, salve em MEMORY.md ou memory/.
```

#### 8.2 Adicionar seção de continuidade no SOUL.md

```markdown
## Continuidade de Sessão
- Você pode ter sessões que resetam diariamente às 4h ou após 8h de inatividade
- Quando isso acontecer, seus arquivos de memória são sua ponte com conversas anteriores
- NUNCA assuma que é a primeira conversa — SEMPRE verifique memory/ e MEMORY.md primeiro
- Se encontrar contexto anterior, retome naturalmente sem pedir introduções
```

#### 8.3 Garantir hooks ativos no openclaw.json

```json
{
  "hooks": {
    "bundled": ["session-memory", "boot-md", "command-logger"]
  }
}
```

### CURTO PRAZO (esta semana):

#### 8.4 Reduzir softThresholdTokens para forçar memoryFlush

```json
{
  "compaction": {
    "mode": "safeguard",
    "memoryFlush": { "enabled": true },
    "softThresholdTokens": 20000,
    "reserveTokensFloor": 15000
  }
}
```

Isso faz o memoryFlush rodar com mais frequência, salvando mais notas antes da compactação.

#### 8.5 Implementar conversation-pre-compact.md

Adicionar no AGENTS.md de cada agente:
```markdown
## Regra de Persistência
Antes de o contexto ser compactado ou a sessão resetada:
1. Salve os últimos pontos importantes em memory/conversation-pre-compact.md
2. Inclua: último tópico, decisões pendentes, tarefas em andamento
3. Use formato conciso (máximo 20 linhas)
```

### MÉDIO PRAZO (quando PRs forem mergeados):

#### 8.6 Atualizar OpenClaw quando disponível

Monitorar estes PRs:
- **#15933** — `session_end` hook em auto-resets (resolve o problema principal)
- **#14243** — `session-memory` em auto-resets + paths por tópico
- **#14576** — Fix de memory loss bugs (snapshot antes de resets)

Quando mergeados, atualizar o gateway e habilitar `session:end` hook.

### LONGO PRAZO:

#### 8.7 Considerar sistema de memória externo

Se a solução nativa não for suficiente, implementar uma das soluções da comunidade:
- **Simples:** https://github.com/gavdalf/openclaw-memory (bash, $0.10/mês)
- **Avançado:** Sistema SQLite+LanceDB do adamb0mbNZ

---

## RESUMO EXECUTIVO

| Pergunta | Resposta |
|----------|---------|
| Reset diário limpa tudo? | **SIM** — cria sessão nova com novo UUID |
| JSONL é recarregado? | **NÃO** — fica em disco como artefato histórico |
| Tem config para preservar contexto? | **NÃO nativamente** — requer workarounds com hooks e memory files |
| O que memoryFlush faz? | Salva notas **APENAS antes da compactação**, não no reset diário |
| Issues no GitHub? | **145 issues**, 71 abertas, PRs ativos corrigindo (#14576, #14243, #15933) |
| Nativo ou patches? | **100% NATIVO** — comportamento by design, reconhecido pela equipe |

### Causa raiz do problema relatado:

Os 4 agentes Telegram mostraram "0 mensagens" e perguntaram "é a primeira vez?" porque:

1. O gateway foi reiniciado (nova sessão criada)
2. OU o horário de reset diário (4h) havia passado
3. OU o idle timeout (8h) expirou
4. A nova sessão começa **vazia** — sem carregamento de JSONL anteriores
5. Os hooks `session-memory` e `memoryFlush` **não dispararam** antes do reset
6. Sem `BOOT.md` ou instruções de continuidade no `SOUL.md`, o agente não sabe consultar arquivos de memória
7. Resultado: **amnésia total** — o agente se comporta como se nunca tivesse conversado antes

---

## URLs DE REFERÊNCIA COMPLETAS

### Documentação Oficial:
- https://docs.openclaw.ai/concepts/session
- https://docs.openclaw.ai/concepts/memory
- https://docs.openclaw.ai/concepts/compaction
- https://docs.openclaw.ai/concepts/session-pruning
- https://docs.openclaw.ai/gateway/configuration-reference
- https://docs.openclaw.ai/automation/hooks
- https://docs.openclaw.ai/reference/session-management-compaction

### GitHub Issues/PRs:
- https://github.com/openclaw/openclaw/pull/14576 (Fix/memory loss bugs — XL)
- https://github.com/openclaw/openclaw/pull/14243 (session-memory em auto-resets)
- https://github.com/openclaw/openclaw/pull/15933 (session_end hook)
- https://github.com/openclaw/openclaw/issues/15806 (Feature: session:end)
- https://github.com/openclaw/openclaw/issues/14463 (Webchat memory loss bug)
- https://github.com/openclaw/openclaw/issues/15624 (Auto-save before reset)
- https://github.com/openclaw/openclaw/issues/14143 (Compaction never triggers)
- https://github.com/openclaw/openclaw/issues/15101 (Stale tokens after compaction)
- https://github.com/openclaw/openclaw/pull/15962 (Fix memoryFlush count)

### Reddit:
- https://www.reddit.com/r/openclaw/comments/1r3nyro/ (Compaction amnesia fix — 20 upvotes)
- https://www.reddit.com/r/openclaw/comments/1r49r9m/ (Permanent memory system — 25 upvotes)
- https://www.reddit.com/r/openclaw/comments/1r3501p/ (File-based persistence — 6 upvotes)

### Repositórios de Soluções:
- https://github.com/gavdalf/openclaw-memory (Sistema de memória com 5 camadas)
