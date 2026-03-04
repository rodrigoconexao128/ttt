# Deep Research: OpenClaw Session Resume / Continuity

**Data:** 2026-02-12  
**Status:** Pesquisa completa com solução prática identificada

---

## TL;DR — O Que Está Faltando

**Descoberta crítica:** O OpenClaw já tem um hook built-in chamado `boot-md` que roda `BOOT.md` automaticamente no startup do gateway — mas **NENHUM dos 4 workspaces tem um arquivo BOOT.md criado.** Este é o maior gap.

A solução completa requer **3 ações:**
1. Criar `BOOT.md` em cada workspace (5 minutos)
2. Habilitar hooks no `openclaw.json` (1 minuto)
3. Melhorar a seção "Continuity" do `SOUL.md` (2 minutos)

---

## 1. O Que Já Temos (Inventário)

### 1.1 Hooks Built-in do OpenClaw

| Hook | Status | Evento | O Que Faz |
|------|--------|--------|-----------|
| `boot-md` | ✅ Ready | `gateway:startup` | Roda BOOT.md quando gateway inicia |
| `session-memory` | ✅ Ready | `command:new` | Salva conversa em `memory/YYYY-MM-DD-slug.md` quando `/new` é executado |
| `command-logger` | ✅ Ready | `command` | Log de todos os comandos em JSONL |
| `soul-evil` | ❌ Missing | - | Easter egg, irrelevante |

**Fonte:** `openclaw hooks list` + docs oficiais em https://docs.openclaw.ai/automation/hooks

### 1.2 Config de Memória (openclaw.json) — JÁ CONFIGURADO

```json
{
  "compaction": {
    "mode": "safeguard",
    "reserveTokensFloor": 32000,
    "memoryFlush": {
      "enabled": true,
      "softThresholdTokens": 40000,
      "prompt": "Distill this session to memory/YYYY-MM-DD.md. Focus on: 1) Decisions 2) State changes 3) Lessons 4) Blockers 5) Next steps. NO_FLUSH if nothing worth storing.",
      "systemPrompt": "Extract only what is worth remembering. No fluff."
    }
  },
  "memorySearch": {
    "sources": ["memory", "sessions"],
    "experimental": { "sessionMemory": true },
    "query": { "hybrid": { "enabled": true, "vectorWeight": 0.7, "textWeight": 0.3 } },
    "cache": { "enabled": true, "maxEntries": 50000 }
  },
  "session": {
    "reset": {
      "mode": "daily",
      "atHour": 4,
      "idleMinutes": 480
    }
  }
}
```

### 1.3 Arquivos do Workspace — JÁ EXISTEM

| Arquivo | Existe | Função |
|---------|--------|--------|
| `SOUL.md` | ✅ | Identidade, regras, personalidade |
| `HEARTBEAT.md` | ✅ | Checklist periódico (7 etapas) |
| `MEMORY.md` | ✅ | Memória de longo prazo curada |
| `SESSION-STATE.md` | ✅ | Estado ativo (WAL Protocol) |
| `TASKS.md` | ✅ | Tracking de tarefas |
| `memory/YYYY-MM-DD.md` | ✅ | Dumps diários de sessão |
| **`BOOT.md`** | **❌ NÃO EXISTE** | **Instruções de inicialização** |
| `PROJECT_STATE.md` | ❌ | Estado do projeto (skill instalado, não usado) |

### 1.4 Skills Instalados Relevantes

| Skill | Workspace | Função |
|-------|-----------|--------|
| `nemp-memory` | ✅ workspace, workspace-drielle | Memória estruturada com busca semântica |
| `project-context-sync` | ✅ workspace, workspace-drielle | Mantém PROJECT_STATE.md atualizado |
| `team-tasks` | ✅ workspace-drielle | Coordenação de tarefas via TASKS.md |
| `dev-workflow` | ✅ workspace | Workflow de desenvolvimento |
| `proactive-agent` | ✅ global (~/.openclaw/skills/) | WAL Protocol, Working Buffer, Compaction Recovery |
| `self-improving-agent` | ✅ global | Hook `agent:bootstrap` para self-improvement |
| `restart-guard` | ✅ workspace, workspace-drielle | Preservação de contexto durante restart do gateway |
| `piv` | ✅ workspace, workspace-drielle | Plan-Implement-Validate loop |
| `heimdall` | ✅ workspace | Monitoramento |

---

## 2. Skills da Comunidade Relevantes (GitHub / ClawHub)

### 2.1 Diretamente Relacionados a Session Resume

| Skill | Autor | URL | Relevância |
|-------|-------|-----|------------|
| **cognitive-memory** | icemilo414 | [GitHub](https://github.com/openclaw/skills/tree/main/skills/icemilo414/cognitive-memory/SKILL.md) | ⭐⭐⭐ Sistema multi-store (episódic, semantic, procedural, vault) com decay, reflection, e knowledge graph. Mais sofisticado que nemp-memory |
| **restart-guard** | Zjianru | [GitHub](https://github.com/Zjianru/restart-guard) | ⭐⭐⭐ Salva contexto YAML antes de restart, guardian watchdog, recovery pós-restart. Já instalado! |
| **project-context-sync** | joe3112 | [GitHub](https://github.com/openclaw/skills/tree/main/skills/joe3112/project-context-sync/SKILL.md) | ⭐⭐ Mantém PROJECT_STATE.md via post-commit hook. Já instalado! |
| **self-improving-agent** | (bundled) | Global skills | ⭐⭐ Hook `agent:bootstrap` que injeta reminder de self-improvement |
| **proactive-agent** | halthelobster | Global skills | ⭐⭐⭐ WAL Protocol + Working Buffer + Compaction Recovery |
| **backup** | jordanprater | [ClawHub](https://github.com/openclaw/skills/tree/main/skills/jordanprater/backup/SKILL.md) | ⭐ Backup de config e skills para GitHub |
| **gitclaw** | marian2js | [ClawHub](https://github.com/openclaw/skills/tree/main/skills/marian2js/gitclaw/SKILL.md) | ⭐ Sync workspace para GitHub repo |

### 2.2 Skills Pesquisados Mas NÃO Encontrados

Não existem skills específicos chamados:
- `session-handoff` ❌
- `session-resume` ❌
- `context-bridge` ❌
- `auto-resume` ❌
- `session-memory` (existe como hook built-in, não como skill)
- `continuity` ❌

### 2.3 Eventos de Hook Futuros (Planejados pelo OpenClaw)

Os docs oficiais listam como "Future Events" (não implementados ainda):
- `session:start` — Quando uma nova sessão começa
- `session:end` — Quando uma sessão termina
- `agent:error` — Quando um erro ocorre
- `message:sent` / `message:received`

**Quando `session:start` for implementado**, será possível criar um hook que automaticamente lê memória e resume trabalho. Por enquanto, usamos `boot-md` + SOUL.md.

---

## 3. Análise do Gap — O Que Está Faltando

### 3.1 O Fluxo Atual (QUEBRADO)

```
Sessão expira (4am ou 480min idle)
    ↓
memoryFlush salva em memory/YYYY-MM-DD.md ✅
    ↓
Nova sessão começa
    ↓
Agente acorda SEM CONTEXTO ❌ (lê SOUL.md e MEMORY.md no bootstrap)
    ↓
Agente NÃO SABE o que estava fazendo ❌
    ↓
Agente espera instrução do usuário ❌
```

### 3.2 O Fluxo Ideal (COM BOOT.md)

```
Sessão expira (4am ou 480min idle)
    ↓
memoryFlush salva em memory/YYYY-MM-DD.md ✅
    ↓
Gateway reinicia (ou nova sessão)
    ↓
boot-md hook executa BOOT.md ✅
    ↓
Agente automaticamente:
  1. Lê SESSION-STATE.md ✅
  2. Lê memory/YYYY-MM-DD.md (último) ✅
  3. Lê TASKS.md ✅
  4. Lê MEMORY.md ✅
  5. Identifica tarefas pendentes ✅
  6. Reporta status ou resume trabalho ✅
```

### 3.3 Gaps Específicos

| # | Gap | Impacto | Solução |
|---|-----|---------|---------|
| 1 | **BOOT.md não existe** | Agente não tem instruções de inicialização | Criar BOOT.md |
| 2 | **Hooks não habilitados no config** | boot-md e session-memory podem não estar ativados | Adicionar config de hooks |
| 3 | **SOUL.md vago sobre continuidade** | "Read them. Update them." não é específico o suficiente | Adicionar protocolo explícito |
| 4 | **Sem working-buffer.md** | Danger zone entre memory flush e compaction perde dados | Implementar Working Buffer Protocol |
| 5 | **Sem SESSION-RESUME automático** | `/new` reseta mas não garante leitura do contexto anterior | BOOT.md + SOUL.md resolvem |

---

## 4. Solução Recomendada

### Abordagem: Combinação de 3 Mecanismos

```
┌──────────────────────────────────────────────────┐
│  MECANISMO 1: BOOT.md (gateway:startup)          │
│  → Roda quando gateway inicia                    │
│  → Instruções de recovery e status check         │
├──────────────────────────────────────────────────┤
│  MECANISMO 2: SOUL.md "Every Session" Protocol   │
│  → Parte da identidade do agente                 │
│  → Lido em CADA sessão como bootstrap            │
│  → Protocolo explícito de "acordar"              │
├──────────────────────────────────────────────────┤
│  MECANISMO 3: session-memory hook (command:new)  │
│  → Salva automaticamente ao resetar              │
│  → Garante que sempre há dados para ler          │
└──────────────────────────────────────────────────┘
```

---

## 5. Implementação — Passo a Passo

### PASSO 1: Criar BOOT.md para cada workspace

**Arquivo:** `~/.openclaw/workspace/BOOT.md`

```markdown
# BOOT.md — Session Recovery Protocol

## On Every Startup

You just woke up. Your memory is fresh. Follow these steps IN ORDER:

### Step 1: Read Your State
1. Read `SESSION-STATE.md` — this is your last known working state
2. Read `TASKS.md` — check for pending tasks
3. Read `MEMORY.md` — your long-term curated memory

### Step 2: Read Recent Memory
1. Check `memory/` folder for today's and yesterday's date files
2. Read the most recent `memory/YYYY-MM-DD*.md` file(s)
3. Look for: unfinished tasks, blockers, next steps, decisions made

### Step 3: Check Working Buffer
1. If `memory/working-buffer.md` exists, read it FIRST
2. Extract any important context from the buffer
3. This captures conversations that happened near compaction

### Step 4: Resume or Report
- If there are PENDING tasks in TASKS.md → resume the most important one
- If SESSION-STATE.md shows work in progress → continue it
- If everything is done → report status and ask what's next
- ALWAYS tell the user what you found and what you're doing

### Step 5: Announce
Send a brief message: "🔄 Session recovered. [summary of what I found and what I'm resuming]"

## Rules
- NEVER say "I don't have context" without reading these files first
- NEVER ask "what were we doing?" — the answer is in the files
- If files are empty or missing, say so explicitly
- Update SESSION-STATE.md after recovery with current state
```

**Repetir para os outros workspaces** (`workspace-henri`, `workspace-drielle`, `workspace-rodrigo`) com adaptações do nome/idioma.

### PASSO 2: Habilitar Hooks no openclaw.json

Adicionar ao `openclaw.json`:

```json
{
  "hooks": {
    "internal": {
      "enabled": true,
      "entries": {
        "boot-md": { "enabled": true },
        "session-memory": { "enabled": true, "messages": 25 },
        "command-logger": { "enabled": true }
      }
    }
  }
}
```

### PASSO 3: Melhorar SOUL.md — Seção Continuity

Substituir a seção "Continuity" atual:

```markdown
## Continuity — Session Recovery Protocol (CRITICAL)

Each session, you wake up fresh. These files ARE your memory:

### On EVERY Session Start:
1. **READ** `SESSION-STATE.md` — your last working state
2. **READ** today's + yesterday's `memory/YYYY-MM-DD.md`  
3. **READ** `TASKS.md` — pending work
4. **READ** `MEMORY.md` — long-term context
5. **CHECK** `memory/working-buffer.md` if it exists
6. **ANNOUNCE** what you found and what you're resuming

### Before EVERY Session End / Compaction:
1. **UPDATE** `SESSION-STATE.md` with current state
2. **UPDATE** `TASKS.md` with progress
3. **WRITE** `memory/YYYY-MM-DD.md` with today's decisions and learnings

### The Rule:
- NEVER say "I don't have context" — READ THE FILES
- NEVER ask "what were we doing?" — THE ANSWER IS IN THE FILES  
- If something is important, WRITE IT DOWN NOW
```

### PASSO 4: Criar working-buffer.md (Opcional mas Recomendado)

**Arquivo:** `~/.openclaw/workspace/memory/working-buffer.md`

```markdown
# Working Buffer (Danger Zone Log)
**Status:** INACTIVE
**Info:** This file captures exchanges when context is near compaction.
When context > 60%, start logging every exchange here.
After compaction, read this file FIRST to recover context.
```

### PASSO 5: Restart Gateway

```powershell
openclaw gateway restart
```

---

## 6. Comparação de Abordagens

| Abordagem | Prós | Contras | Recomendação |
|-----------|------|---------|-------------|
| **BOOT.md (hook)** | Automático, built-in, zero código | Só roda no gateway startup, não em session reset | ✅ USAR |
| **SOUL.md protocol** | Lido em CADA sessão, sempre presente | Depende do agente "obedecer" as instruções | ✅ USAR |
| **Custom hook (session:start)** | Seria ideal | Evento `session:start` ainda NÃO implementado | ⏳ FUTURO |
| **cognitive-memory skill** | Muito sofisticado, multi-store | Complexo de configurar, overhead | 🔄 CONSIDERAR |
| **Cron job para verificar** | Pode rodar a cada X minutos | Gasta tokens desnecessariamente se nada mudou | ❌ EVITAR |
| **nemp-memory /nemp:context** | Busca semântica em memórias | Não é automático, precisa ser chamado | 🔄 JÁ TEMOS |

---

## 7. Skills Adicionais a Considerar para o Futuro

### cognitive-memory (icemilo414)
**Instalação:** `npx clawhub@latest install cognitive-memory`

O que adiciona sobre o que já temos:
- 4 memory stores (episodic, semantic, procedural, vault)
- Knowledge graph com entidades e relações
- Decay model (memórias "esquecem" com o tempo)
- Reflection process (consolidação periódica)
- Multi-agent memory sharing (read-all, gated-write)
- Audit trail completo via git

**Veredicto:** Poderoso mas complexo. Recomendo DEPOIS de estabilizar BOOT.md.

### restart-guard (Zjianru) — JÁ INSTALADO
Já temos este skill. Ele preserva contexto durante restarts do gateway. Funciona bem com BOOT.md.

### evolver (autogame-17)
Self-evolution engine. Pode complementar o self-improving-agent que já temos.

---

## 8. FAQ / Troubleshooting

**P: O boot-md roda em TODA sessão nova?**  
R: Não — ele roda apenas no `gateway:startup`. Para sessions dentro do mesmo gateway, depende do SOUL.md e do agente ler os arquivos.

**P: E se o agente "esquecer" de ler os arquivos?**  
R: O SOUL.md é injetado em TODA sessão como parte do bootstrap. Se as instruções estiverem claras lá, o agente vai segui-las.

**P: O `session:start` hook vai existir algum dia?**  
R: Os docs listam como "Future Events" — `session:start`, `session:end`. Quando for implementado, será a solução perfeita para auto-resume.

**P: Posso criar meu próprio hook para `command:new`?**  
R: Sim! Crie um diretório em `~/.openclaw/hooks/session-resume/` com HOOK.md e handler.ts. Veja a seção de Creating Custom Hooks nos docs.

**P: O `memoryFlush` já não resolve?**  
R: Parcialmente. Ele SALVA dados antes da compactação, mas não garante que o agente vai LER esses dados na próxima sessão. BOOT.md + SOUL.md cobrem o lado da LEITURA.

---

## 9. Próximo Passo Recomendado

**Prioridade 1 (FAZER AGORA):**
1. Criar BOOT.md em cada workspace ← 5 minutos
2. Habilitar hooks no openclaw.json ← 1 minuto
3. Atualizar seção Continuity do SOUL.md ← 2 minutos

**Prioridade 2 (PRÓXIMA SEMANA):**
4. Criar working-buffer.md
5. Testar o fluxo completo: `/new` → verificar memory dump → restart gateway → verificar BOOT.md executa → agente resume

**Prioridade 3 (QUANDO DISPONÍVEL):**
6. Instalar `cognitive-memory` para memória avançada
7. Criar hook custom para `session:start` quando o evento for implementado

---

## 10. Referências

- [OpenClaw Hooks Docs](https://docs.openclaw.ai/automation/hooks)
- [OpenClaw Config Reference](https://docs.openclaw.ai/gateway/configuration-reference)
- [Awesome OpenClaw Skills](https://github.com/VoltAgent/awesome-openclaw-skills)
- [cognitive-memory skill](https://github.com/openclaw/skills/tree/main/skills/icemilo414/cognitive-memory/SKILL.md)
- [restart-guard](https://github.com/Zjianru/restart-guard)
- [proactive-agent WAL Protocol](~/.openclaw/skills/proactive-agent/SKILL.md)
- [Nemp Memory](https://github.com/SukinShetty/Nemp-memory)
