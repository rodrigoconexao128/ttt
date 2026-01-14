# 🎯 TASKLIST: Sistema de Auto-Calibração de Prompts (IA Cliente vs IA Agente)

## 📋 Resumo do Problema

O sistema atual de edição de prompts (`/meu-agente-ia`) tem um problema crítico:
> "Muita das vezes até edita o prompt mas não acontece o êxito no simulador, ou seja na conversa real"

## 🔬 Solução: Auto-Calibração com IA vs IA

Baseado em técnicas de empresas líderes (Anthropic, LangChain/LangSmith, Microsoft Promptbase):

1. **Avaliação por IA** (Anthropic): Usar modelo IA para avaliar se resposta do agente atende à intenção do usuário
2. **Testes Offline** (LangSmith): Gerar cenários sintéticos antes de aplicar edições
3. **Self-Consistency** (Microsoft): Executar múltiplos cenários e verificar consistência das respostas
4. **Loop de Reparo** (Aider): Se edição falhar, tentar novamente com feedback do erro

---

## ✅ TASKLIST (20 Itens)

### FASE 1: Infraestrutura Base (Items 1-4)

#### 📌 Item 1: Criar `promptCalibrationService.ts`
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Serviço principal que orquestra a calibração automática
**Funções:**
- `calibrarPrompt(promptAtual, promptEditado, instrucao)`: Função principal
- `gerarCenariosValidacao(prompt, instrucao)`: Gera cenários de teste específicos
- `executarCalibracao(prompt, cenarios)`: Executa loop IA cliente vs IA agente
**Técnica:** Self-consistency (executar 3-5 cenários, verificar se edição funciona em todos)

#### 📌 Item 2: Implementar Gerador de Cenários de Teste
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Gera cenários de teste baseados na instrução do usuário
**Exemplos:**
- Instrução: "Adicione que aceitamos PIX"
- Cenário gerado: Cliente pergunta "Vocês aceitam PIX?" → Agente deve responder confirmando
**Técnica:** Few-shot prompting com exemplos dinâmicos

#### 📌 Item 3: Criar IA Cliente Simulado
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** IA que simula cliente fazendo perguntas específicas
**Funções:**
- `simularCliente(cenario, historico)`: Gera próxima mensagem do cliente
- Persona dinâmica baseada no cenário (cliente curioso, cliente apressado, etc.)
**Técnica:** Role inversion (como já existe em `test-agente-cliente-multicenario.ts`)

#### 📌 Item 4: Implementar Loop de Validação IA vs IA
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Loop que executa conversa simulada (3-5 turnos)
**Fluxo:**
1. Cliente envia mensagem relacionada à edição
2. Agente responde com novo prompt
3. Analisador verifica se resposta demonstra a edição funcionando
4. Repete para próximo cenário
**Técnica:** A/B testing simulado

---

### FASE 2: Análise e Reparo (Items 5-7)

#### 📌 Item 5: Criar Analisador de Respostas
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Avalia se resposta do agente demonstra que a edição funcionou
**Funções:**
- `analisarResposta(mensagemAgente, expectativa, instrucao)`: Retorna score 0-100
- `gerarVeredicto(score)`: "APROVADO", "PARCIAL", "REPROVADO"
**Técnica:** Model-graded evaluation (Anthropic)

#### 📌 Item 6: Implementar Reparo Automático do Prompt
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Se edição falhar na validação, tenta consertar automaticamente
**Fluxo:**
1. Detecta que edição não funcionou
2. Gera feedback específico do erro
3. Envia para IA com contexto do problema
4. Aplica nova edição
5. Re-valida (máximo 3 tentativas)
**Técnica:** Iterative refinement (Aider-style)

#### 📌 Item 7: Adicionar Retry com Backoff Exponencial
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Proteção contra rate limits e falhas transientes
**Parâmetros:**
- `maxRetries`: 3
- `initialDelay`: 1000ms
- `backoffFactor`: 2
**Técnica:** Circuit breaker pattern (já existe em `storage.ts`)

---

### FASE 3: Integração Backend (Items 8-9)

#### 📌 Item 8: Criar Endpoint `/api/agent/calibrate`
**Arquivo:** `server/routes.ts`
**Descrição:** Endpoint dedicado para calibração manual
**Request:**
```json
{
  "prompt": "...",
  "testScenarios": ["pergunta1", "pergunta2"]
}
```
**Response:**
```json
{
  "success": true,
  "results": [
    {"scenario": "...", "passed": true, "agentResponse": "..."}
  ],
  "overallScore": 95
}
```

#### 📌 Item 9: Integrar Calibragem no `/api/agent/edit-prompt`
**Arquivo:** `server/routes.ts`
**Descrição:** Após editar, validar automaticamente antes de confirmar
**Fluxo Novo:**
1. Usuário envia instrução
2. IA gera edições
3. **NOVO:** Sistema gera 3 cenários de teste
4. **NOVO:** Executa calibração
5. **NOVO:** Se falhar, tenta reparo (até 3x)
6. Se passar, salva prompt
7. Retorna resultado com feedback detalhado

---

### FASE 4: Interface do Usuário (Items 10-12)

#### 📌 Item 10: Criar UI de Feedback de Calibragem
**Arquivo:** `client/src/components/agent-studio-unified.tsx`
**Descrição:** Mostrar progresso da calibração em tempo real
**Elementos:**
- Indicador de "Validando edição..." com spinner
- Lista de cenários testados com ✅/❌
- Score geral de confiança
- Botão "Forçar aplicar mesmo assim" (power user)

#### 📌 Item 11: Implementar Cache de Cenários
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Evitar regenerar cenários idênticos
**Chave cache:** `hash(instrucao + prompt.substring(0,100))`
**TTL:** 1 hora
**Técnica:** Memoization

#### 📌 Item 12: Adicionar Métricas de Sucesso
**Arquivo:** `server/promptCalibrationService.ts`
**Descrição:** Logar métricas para análise posterior
**Métricas:**
- `calibration_attempts`: Número de calibrações
- `calibration_success_rate`: % que passou na primeira tentativa
- `calibration_repair_rate`: % que precisou reparo
- `avg_calibration_time`: Tempo médio em ms

---

### FASE 5: Testes com NPX (Items 13-15)

#### 📌 Item 13: Criar Script de Teste NPX Standalone
**Arquivo:** `test-calibration-standalone.ts`
**Descrição:** Script independente para testar calibração sem subir servidor
**Comando:** `npx tsx test-calibration-standalone.ts`
**Testa:**
- Geração de cenários
- Loop IA vs IA
- Análise de respostas
- Reparo automático

#### 📌 Item 14: Testar Cenários Básicos com NPX
**Arquivo:** `test-calibration-standalone.ts`
**Cenários:**
1. "Adicione que aceitamos PIX" → Cliente pergunta sobre PIX
2. "Mude o nome para Maria" → Cliente pergunta quem está falando
3. "Adicione horário das 8h às 20h" → Cliente pergunta horário
4. "Seja mais informal" → Verificar tom de resposta

#### 📌 Item 15: Testar Edições Complexas com NPX
**Arquivo:** `test-calibration-standalone.ts`
**Cenários:**
1. "Crie uma seção de promoções" (adição grande)
2. "Remova menção a cartões" (remoção seletiva)
3. "Mude todo o tom para formal" (edição global)
4. "Adicione regra: nunca falar de concorrentes" (regra negativa)

---

### FASE 6: Testes Playwright E2E (Items 16-17)

#### 📌 Item 16: Criar Testes Playwright E2E
**Arquivo:** `e2e/calibration-flow.spec.ts`
**Descrição:** Testes end-to-end no navegador
**Fluxo:**
1. Login com credenciais de teste
2. Navegar para `/meu-agente-ia`
3. Enviar instrução de edição
4. Verificar feedback de calibração
5. Testar no simulador
6. Confirmar que resposta mudou

#### 📌 Item 17: Executar Testes de Login e Calibrar
**Credenciais:** `rodrigo4@gmail.com` / `Ibira2019!`
**Comando:** `npx playwright test e2e/calibration-flow.spec.ts`
**Cenários:**
1. Edição simples com sucesso
2. Edição que falha e é reparada
3. Edição que falha 3x (mostrar erro)

---

### FASE 7: Deploy e Documentação (Items 18-20)

#### 📌 Item 18: Validar no Ambiente Real
**URL:** `https://agentezap.online/meu-agente-ia`
**Checklist:**
- [ ] Login funciona
- [ ] Chat de edição carrega
- [ ] Edição dispara calibração
- [ ] Simulador reflete mudança
- [ ] Histórico de versões funciona

#### 📌 Item 19: Deploy no Railway com MCP
**Projeto Supabase:** `bnfpcuzjvycudccycqqt`
**Comando:** Usar MCP Railway para deploy
**Verificar:**
- Build passa sem erros
- Variáveis de ambiente corretas
- Health check OK

#### 📌 Item 20: Documentar Sistema de Calibração
**Arquivo:** `CALIBRATION_SYSTEM_DOCS.md`
**Conteúdo:**
- Arquitetura do sistema
- Fluxo de calibração
- Configurações disponíveis
- Troubleshooting comum
- Métricas e logs

---

## 🔧 Ordem de Execução

```
FASE 1 (Infraestrutura) → FASE 2 (Análise) → FASE 5 (Testes NPX) 
    → FASE 3 (Backend) → FASE 4 (UI) → FASE 6 (E2E) → FASE 7 (Deploy)
```

**Prioridade:** Testar com NPX primeiro (items 13-15) antes de integrar no sistema!

---

## 📊 Critérios de Sucesso

| Métrica | Meta |
|---------|------|
| Taxa de sucesso na 1ª tentativa | > 80% |
| Taxa de sucesso após reparo | > 95% |
| Tempo médio de calibração | < 10s |
| Cenários testados por edição | 3-5 |

---

## 🚀 Próximo Passo

Iniciar **Item 1**: Criar `promptCalibrationService.ts` com estrutura base.
