# PESQUISA COMPLETA: OpenClaw - Problemas e Soluções

---

## TÓPICO 1: Por que agentes OpenClaw travam em loops de erro e não completam tarefas

### 1.1 Relatos Reais de Usuários (Citações Exatas do Reddit)

**u/rthiago** — "My AI Agent Can't Complete a Single Task" (39 upvotes, 62 comments):
> "I'll say something like 'start and finish task X'... About 30 seconds later it either stops or asks me for guidance on trivial stuff. Half the time it just goes silent and I have to ask for a status update."

**u/Either_Ad7555** — "OpenClaw feels non-proactive + agent and subagents stall after ~1 minute" (8 upvotes, 26 comments):
> "When I ask it to do a task or spin up subagents, they appear to 'work' for ~1 minute, then progress stops... when I ask 'status?', it repeats the same update from minutes ago as if no work happened."

**u/TaroJust9374** — "Not getting much value from OpenClaw" (55 upvotes, 46 comments):
> "It keeps breaking. Cron jobs silently fail... Task completion is inconsistent... It can't perform anywhere near the level of the same model running through Claude Code."

**u/BetaOp9**:
> "I f***ing hate working with my openclaw, I revoked all his already limited access and put him on general chat bot in discord duty until they improve things."

**u/randrs1337** (usa Opus 4.5):
> "It made stupid s**t on its own initiative trying to cut the corners on things we earlier agreed on... The bot said sorry many times added more guardrails."

**u/dan-lash**:
> "Sometimes it'll take 10 minutes to do something... it could be waiting or timeout out or broken, no visibility. Especially for sub agents."

**u/DGC_David**:
> "Most of this code looks like it used OpenClaw to generate it, the webportals UI is practically useless, and none of the documentation really seems that complete."

---

### 1.2 CAUSAS RAIZ IDENTIFICADAS

#### Causa 1: Context Overflow / Compaction
O agente acumula mensagens e tool results até estourar a janela de contexto do modelo. Quando isso acontece:
- A sessão é compactada (resumida), **perdendo instruções da tarefa original**
- O agente "esquece" o que estava fazendo
- Fica em loop repetindo status antigos

**u/jdrolls** explica:
> "Cron jobs failing silently is almost always because (1) the job triggers but the agent session hits a context limit and gets compacted, losing task instructions, or (2) env vars aren't visible to the systemd service."

**u/Sitting3827** (context overflow com Haiku 4.5):
> "Context overflow: prompt too large for the model. Try again with less input or a larger-context model."

#### Causa 2: Modelo Errado
Modelos baratos/fracos não conseguem manter planos de execução complexos.

**u/Typical-Education345**:
> "Ran mine with Claude Max, minimal problems and tons of valuable output... ran with Gemini pro and died in a few hours with '429 limit reach'."

**u/Svk78**:
> "I started on GPT 5 and had a pretty average experience. Then switched to Opus... Light and day result. GPT 5 didn't understand the system prompt and had no knowledge of the tools available."

**u/ZeusCorleone** (sobre GPT-5):
> "Model: openai/gpt-5 << issue"

**Recomendação da comunidade sobre modelos baratos**:
> "flash, haiku, and 'nano/mini' models THAT AREN'T GPT 5 MINI aren't worth it... THEY LACK THE STRUCTURE AND RELIABILITY. you'll get annoyed, trust me."
> "Qwen3 Coder has structure, is relatively cheap/usually free, and is reliable. Use it instead of flash/haiku."

#### Causa 3: HEARTBEAT.md e SOUL.md mal configurados
O agente não sabe o que fazer de forma proativa sem instruções claras.

**u/cbelliott**:
> "You need to modify your agent's heartbeat with more information about what it should do, how proactive it should be, etc."

**u/Crowley-Barns**:
> "Tell it to set up a half hour or hourly heartbeat and to be proactive... A generic 'be proactive' probably won't do much if it doesn't know much about you and your goals though!"

**u/SDSunDiego**:
> "Proactiveness is set by the HEARTBEAT.md file. Give it something to be proactive about and it'll be proactive and make sure you don't have a shit model."

#### Causa 4: Arquivos de contexto mal estruturados
**u/jdrolls** (13 dias de uso autônomo):
> "Why output quality differs from Claude Code: Claude Code has your full codebase as context. OpenClaw loads workspace files (AGENTS.md, SOUL.md, MEMORY.md) as its context. If those files are thin or missing, the agent is flying blind."

**u/Acrobatic_Task_6573**:
> "The config files are the make or break though. A poorly configured OpenClaw is basically just a chatbot with extra steps."

---

### 1.3 SOLUÇÕES COMPROVADAS

#### Solução 1: Configurar Compaction + Memory Flush corretamente

Config completa do `openclaw.json` (baseada em docs oficiais + Reddit u/Sitting3827):

```json
"agents": {
  "defaults": {
    "model": {
      "primary": "google/gemini-3-flash-preview",
      "fallbacks": ["google/gemini-3-pro-preview"]
    },
    "compaction": {
      "mode": "safeguard",
      "reserveTokensFloor": 32000,
      "memoryFlush": {
        "enabled": true,
        "softThresholdTokens": 6000,
        "systemPrompt": "Session nearing compaction. Store durable memories now.",
        "prompt": "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
      }
    },
    "contextPruning": {
      "mode": "cache-ttl",
      "ttl": "30m"
    },
    "heartbeat": {
      "every": "30m"
    },
    "contextTokens": 100000,
    "maxConcurrent": 2,
    "subagents": {
      "maxConcurrent": 8
    }
  }
}
```

**Docs oficiais (docs.openclaw.ai/concepts/compaction)**:
- **Auto-compaction**: Quando a sessão se aproxima da janela de contexto, o OpenClaw compacta automaticamente
- **Manual**: Use `/compact Focus on decisions and open questions` para forçar
- **Memory flush**: Antes da compaction, o OpenClaw executa um turno silencioso para salvar notas duráveis em disco

**Docs oficiais (docs.openclaw.ai/concepts/session-pruning)**:
- **Mode `cache-ttl`**: Só executa se a última chamada for mais antiga que `ttl` (padrão 5min)
- Só remove `toolResult` messages, nunca user/assistant
- Defaults: `keepLastAssistants: 3`, `softTrimRatio: 0.3`, `hardClearRatio: 0.5`

#### Solução 2: Usar `/new` entre tarefas

**u/alborden** (5 upvotes):
> "Use /new between tasks. Your context builds up during a session so eventually even a simple message uses a disproportionate number of tokens because your bot goes through all previous messages in the current session."

#### Solução 3: Quebrar tarefas em pedaços explícitos

**u/Tgbrutus** (2 upvotes):
> "The 30-second timeout sounds like a context/planning issue. Few things that helped me:
> 1. Break tasks down explicitly - 'Build website' fails, but 'Create index.html with hello world, then add CSS file, then...' works
> 2. Heartbeat with checklist - Put a TODO list in HEARTBEAT.md so it knows what's next without asking
> 3. Model matters - Codex 5.2 is good for code, but for autonomous planning Claude/Gemini are better at staying on track"

#### Solução 4: Setup de memória robusto (u/jdrolls - 13 dias autônomo)

Estrutura recomendada:
- `AGENTS.md` — Checklist diário de tarefas
- `SOUL.md` — Menos de 300 palavras, identidade do agente
- `MEMORY.md` — Memória de longo prazo
- `memory/episodic/YYYY-MM-DD.md` — Logs diários
- `HEARTBEAT.md` — Sistema de rotação com health checks
- Sub-agentes para tarefas pesadas

#### Solução 5: Model routing (economia de tokens)

**u/FrostByghte** (3 upvotes):
> "1. Check compaction is running properly
> 2. Model switching - Use higher tier models to maintain/setup framework. Use lower tier models to run tasks
> 3. Shutoff the heartbeat unless you need it
> 4. Go through all your injected files, trim them down
> 5. Set up automatic session resets (/new) when you sleep"

**u/pueblokc** (6 upvotes):
> "Use sonnet for chat, have bot build rules. Use gemini lite for grunt work or haiku even."

**u/Asgen** (3 upvotes):
> "I'm using Gemini 3 pro and Gemini 3 flash for 90% of tasks and it's cut my usage way down."

**u/cheechw** (sobre modelos baratos eficientes):
> "The absolute best bang for your buck imo I've found is Minimax M2.1. At $0.27/M input tokens it's 1/20th the price of Opus."
> "For less advanced tasks you can use GLM 4.7 Flash that cost an unbelievable $0.07/M input tokens."

---

### 1.4 MODELOS RECOMENDADOS PELA COMUNIDADE

| Modelo | Uso | Custo | Consenso |
|--------|-----|-------|----------|
| Gemini 3 Flash | Tarefas gerais, heartbeat | Grátis/Barato | Muito recomendado |
| Gemini 3 Pro | Planejamento, análise | Barato | Bom para autonomia |
| Kimi K2.5 | Assistente geral | $0.99/mês primeiro mês | Muito popular |
| Qwen3 Coder | Tarefas estruturadas | Geralmente grátis | "Reliable" |
| GLM 4.7 Flash | Leitura/resumo/busca | $0.07/M tokens | Ultra barato |
| Opus 4.5 | Tarefas complexas | $$$$ | Melhor qualidade |
| Sonnet 4.5 | Equilíbrio qualidade/custo | $$ | Sólido |

---

## TÓPICO 2: Como usar GitHub Copilot como provider com OpenClaw

### 2.1 Documentação Oficial (docs.openclaw.ai/providers/github-copilot)

Existem **DUAS formas** de usar GitHub Copilot com OpenClaw:

#### Forma 1: Provider Built-in `github-copilot`

**Setup via CLI:**
```bash
# 1. Login via device-flow do GitHub
openclaw models auth login-github-copilot

# 2. Definir modelo
openclaw models set github-copilot/gpt-4o
```

**Config via `openclaw.json`:**
```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "github-copilot/gpt-4o"
      }
    }
  }
}
```

**Notas importantes:**
- Requer TTY interativo (terminal com input)
- Disponibilidade de modelos depende do seu plano GitHub Copilot
- Token do GitHub é armazenado no auth profile store do OpenClaw
- Usa device-login flow (abre link no browser para autorizar)

#### Forma 2: Copilot Proxy Plugin (via extensão VS Code)

- Usa a extensão do VS Code como proxy
- Permite usar tokens da sua assinatura Copilot
- Configuração mais complexa mas funciona via VS Code

### 2.2 Relatos da Comunidade sobre GitHub Copilot

**u/caenum** (3 upvotes):
> "What about Gemini CLI API? Gemini 3 Flash - should be 1000 requests per day with usual Google account."

**u/marketing_whiz** (sobre OAuth ao invés de API):
> "I set up on my open ai pro plan but instead of api I used the oauth connection. I've been using daily with no issues or extra charges."

**u/Jarr11** (2 upvotes):
> "I have a ChatGPT subscription, so I use Codex 5.3 for my OpenClaw using OpenAI login"

**u/coach69VE** (sobre usar assinatura existente):
> "My best experience yet was gpt 5.2 through my openai subscription oauth, but I went through the limit in 1.5 days."

### 2.3 Alternativa Grátis: LiteLLM + Múltiplas APIs

**u/LeninsMommy** (61 upvotes — post mais votado sobre custo zero):
> "I basically set up a bunch of accounts with Nvidia and Google to get the free $300 Google AI credits, many different APIs. I took all those API keys and set them up through this open source program called LiteLLM, which essentially rotates and optimizes API key usage so that I never hit rate limits or other issues. All free."

### 2.4 Alternativas Grátis/Baratas Populares

| Provider | Como | Custo |
|----------|------|-------|
| **Gemini 3 Flash** | API key Google AI Studio | Grátis (1000 req/dia) |
| **NVIDIA NIM Kimi K2.5** | Custom provider setup | Grátis |
| **OpenRouter free models** | OpenRouter API | Grátis (com limites) |
| **GLM 4.7** | API | $3/mês |
| **Kimi K2.5 direto** | Moonshot API | $0.99 primeiro mês |
| **Ollama local** | GPU local (mín. 3090) | Grátis (requer hardware) |
| **ChatGPT OAuth** | Subscription login | $20/mês (plano existente) |
| **GitHub Copilot** | Device-login ou VS Code proxy | $10-19/mês (plano existente) |

---

## RESUMO EXECUTIVO PARA SUA SITUAÇÃO

### Você está usando Gemini 3 Flash/Pro via gateway OpenClaw. Recomendações:

1. **Compaction**: Adicione `memoryFlush` na config para não perder contexto na compactação
2. **Session pruning**: Configure `cache-ttl` com 30min TTL
3. **HEARTBEAT.md**: Coloque uma checklist clara do que o agente deve fazer
4. **SOUL.md**: Mantenha abaixo de 300 palavras
5. **Use `/new`** entre tarefas diferentes para limpar contexto
6. **Use `/compact`** quando sentir que está "pesado"
7. **Gemini Flash** é excelente para heartbeat e tarefas simples (consensus da comunidade)
8. **Gemini Pro** para tarefas que precisam de mais raciocínio

### Config recomendada para Gemini no seu `openclaw.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "google/gemini-3-flash-preview",
        "fallbacks": ["google/gemini-3-pro-preview"]
      },
      "compaction": {
        "mode": "safeguard",
        "reserveTokensFloor": 32000,
        "memoryFlush": {
          "enabled": true,
          "softThresholdTokens": 6000,
          "systemPrompt": "Session nearing compaction. Store durable memories now.",
          "prompt": "Write any lasting notes to memory/YYYY-MM-DD.md; reply with NO_REPLY if nothing to store."
        }
      },
      "contextPruning": {
        "mode": "cache-ttl",
        "ttl": "30m"
      },
      "heartbeat": {
        "every": "30m"
      },
      "contextTokens": 100000,
      "maxConcurrent": 2
    }
  }
}
```

---

## FONTES

### Reddit Threads Analisados:
1. r/clawdbot — "My AI Agent Can't Complete a Single Task" (39 upvotes, 62 comments)
2. r/clawdbot — "OpenClaw feels non-proactive + agent and subagents stall after ~1 minute" (8 upvotes, 26 comments)
3. r/clawdbot — "Not getting much value from openclaw / clawdbot" (55 upvotes, 46 comments)
4. r/clawdbot — "I Fixed One of OpenClaw's Biggest Problems" (51 upvotes, 16 comments)
5. r/openclaw — "Context overflow with OpenClaw + Claude Haiku 4.5" (4 upvotes, 6 comments)
6. r/clawdbot — "Clawdbot burns tokens like crazy" (42 upvotes, 73 comments)
7. r/openclaw — "I'm having a hard time avoiding rate limits" (20 upvotes, 29 comments)
8. r/clawdbot — "Can I run OpenClaw without paying for API keys?" (93 upvotes, 170 comments)
9. r/clawdbot — "Here's how most OpenClaw users are overpaying 10-20x" (6 comments)

### Docs Oficiais:
- docs.openclaw.ai/concepts/compaction
- docs.openclaw.ai/concepts/memory
- docs.openclaw.ai/concepts/session-pruning
- docs.openclaw.ai/providers/github-copilot
