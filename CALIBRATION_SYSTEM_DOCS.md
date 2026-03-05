# 🎯 Sistema de Auto-Calibração de Prompts

## 📋 Visão Geral

O sistema de Auto-Calibração resolve o problema de edições de prompt que "não funcionam na prática":

> **Problema:** Muitas vezes a edição é aplicada no texto do prompt, mas quando o agente responde no simulador ou conversa real, a mudança não se manifesta no comportamento.

> **Solução:** Antes de confirmar qualquer edição, o sistema executa uma **validação automática** usando **IA Cliente vs IA Agente** para garantir que a edição realmente funciona.

---

## 🔬 Arquitetura Técnica

### Fluxo de Calibração

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FLUXO DE EDIÇÃO COM CALIBRAÇÃO                  │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Usuário envia instrução: "Adicione que aceitamos PIX"           │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. IA (Mistral) gera edições via Search-and-Replace                │
│    {"buscar": "cartão e dinheiro", "substituir": "cartão, dinheiro │
│    e PIX"}                                                          │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. CALIBRAÇÃO: Gera cenários de teste automaticamente              │
│    • Cenário 1: "Vocês aceitam PIX?"                               │
│    • Cenário 2: "Quais formas de pagamento?"                       │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. SIMULAÇÃO: IA Cliente vs IA Agente                              │
│    Cliente: "Aceita PIX?"                                          │
│    Agente:  "Sim! Aceitamos PIX, cartão e dinheiro."               │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 5. ANÁLISE: IA avalia se resposta demonstra a edição               │
│    Score: 95/100 ✅ APROVADO                                        │
└─────────────────────────────────────────────────────────────────────┘
                              │
              ┌───────────────┴───────────────┐
              │                               │
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │ APROVADO      │               │ REPROVADO     │
      │ Score >= 60   │               │ Score < 60    │
      └───────────────┘               └───────────────┘
              │                               │
              ▼                               ▼
      ┌───────────────┐               ┌───────────────┐
      │ Salvar prompt │               │ REPARO AUTO   │
      │ calibrado     │               │ (até 3x)      │
      └───────────────┘               └───────────────┘
```

---

## 📁 Arquivos do Sistema

### Backend

| Arquivo | Descrição |
|---------|-----------|
| `server/promptCalibrationService.ts` | Serviço principal de calibração |
| `server/promptEditService.ts` | Serviço de edição via IA (search-replace) |
| `server/routes.ts` | Endpoints `/api/agent/edit-prompt` e `/api/agent/calibrate` |

### Frontend

| Arquivo | Descrição |
|---------|-----------|
| `client/src/components/agent-studio-unified.tsx` | Interface de edição de prompts |

### Testes

| Arquivo | Descrição |
|---------|-----------|
| `test-calibration-standalone.ts` | Testes NPX independentes |
| `e2e/calibration-flow.spec.ts` | Testes E2E com Playwright |

---

## 🔧 Configuração

### Parâmetros de Calibração

```typescript
const CONFIG_PADRAO = {
  maxTentativasReparo: 3,     // Máximo de tentativas de reparo automático
  numeroCenarios: 3,          // Cenários de teste por edição
  turnosConversaMax: 2,       // Turnos de conversa por cenário
  scoreMinimoAprovacao: 70,   // Score mínimo para aprovar
  timeoutMs: 30000            // Timeout máximo
};
```

### Variáveis de Ambiente

```env
MISTRAL_API_KEY=sua_chave_mistral
```

---

## 📊 API Reference

### POST `/api/agent/edit-prompt`

Edita o prompt com calibração automática.

**Request:**
```json
{
  "currentPrompt": "Prompt atual do agente",
  "instruction": "Adicione que aceitamos PIX",
  "skipCalibration": false  // Opcional: pular calibração
}
```

**Response:**
```json
{
  "success": true,
  "newPrompt": "Prompt editado e calibrado",
  "feedbackMessage": "Mudança aplicada!\n\n✅ Validação automática: Score 95/100",
  "calibration": {
    "sucesso": true,
    "score": 95,
    "cenariosAprovados": 2,
    "cenariosTotais": 2,
    "tentativasReparo": 0,
    "tempoMs": 15000
  }
}
```

### POST `/api/agent/calibrate`

Testa um prompt sem aplicar edições.

**Request:**
```json
{
  "prompt": "Prompt a ser testado",
  "instruction": "Descrição do comportamento esperado"
}
```

**Response:**
```json
{
  "success": true,
  "score": 90,
  "cenariosAprovados": 2,
  "cenariosTotais": 3,
  "resultados": [
    {
      "cenarioId": "cenario_1",
      "perguntaCliente": "Aceita PIX?",
      "respostaAgente": "Sim, aceitamos PIX!",
      "passou": true,
      "score": 95,
      "motivo": "Resposta demonstra claramente a funcionalidade"
    }
  ]
}
```

---

## 🧪 Testes

### Executar Testes Standalone (NPX)

```bash
cd vvvv
npx tsx test-calibration-standalone.ts
```

**Resultado esperado:**
```
✅ Teste 1: Adicionar PIX (deve passar) | Score: 98
✅ Teste 2: Mudar nome do atendente | Score: 100
✅ Teste 3: Adicionar convênio | Score: 98
✅ Teste 4: Edição mal feita (deve falhar e reparar) | Score: 95
✅ Teste 5: Mudar tom para mais informal | Score: 90

🎉 TESTES PASSARAM! Sistema de calibração funcionando corretamente.
```

### Executar Testes E2E (Playwright)

```bash
npx playwright test e2e/calibration-flow.spec.ts
```

---

## 📈 Métricas de Sucesso

| Métrica | Meta | Resultado Atual |
|---------|------|-----------------|
| Taxa de sucesso na 1ª tentativa | > 80% | ✅ 80% |
| Taxa de sucesso após reparo | > 95% | ✅ 100% |
| Tempo médio de calibração | < 15s | ✅ ~12s |
| Score médio das edições | > 80 | ✅ 96 |

---

## 🐛 Troubleshooting

### Problema: Calibração muito lenta

**Causa:** Número alto de cenários ou rate limiting da API

**Solução:** Reduzir `numeroCenarios` para 2

### Problema: Edições sempre reprovadas

**Causa:** Score mínimo muito alto ou prompt mal estruturado

**Solução:** 
1. Reduzir `scoreMinimoAprovacao` para 60
2. Verificar se o prompt base está claro e bem organizado

### Problema: Erro de API Key

**Causa:** Chave Mistral inválida ou expirada

**Solução:** Verificar variável `MISTRAL_API_KEY` no `.env` e no banco de dados

---

## 🚀 Roadmap Futuro

- [ ] **Cache de cenários:** Evitar regenerar cenários idênticos
- [ ] **UI de feedback:** Mostrar progresso da calibração em tempo real
- [ ] **Métricas avançadas:** Dashboard de taxa de sucesso
- [ ] **Calibração assíncrona:** Não bloquear UI durante validação

---

## 📚 Referências

Sistema baseado em técnicas de:
- **Anthropic:** Model-graded evaluation
- **LangSmith:** Offline evaluation with datasets
- **Microsoft Promptbase:** Self-consistency, dynamic few-shot
- **Aider:** Iterative refinement with repair loops

---

**Última atualização:** Janeiro 2026
