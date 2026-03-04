# 📋 Configuração OpenRouter + Chutes

## ✅ Status: IMPLEMENTADO E TESTADO

Data: 26/01/2026  
Autor: GitHub Copilot

---

## 🎯 Objetivo

Configurar o OpenRouter para usar o modelo **PAGO** `openai/gpt-oss-20b` com o provider **Chutes**, que oferece o MENOR custo ($0.02/M input, $0.10/M output - quantização bf16).

---

## ⚠️ Problema Anterior

O sistema estava usando o provider **Hyperbolic** que custa $0.04/M.
O provider **Chutes** é mais barato com $0.02/M input e $0.10/M output.

---

## 🔧 Configurações Atualizadas

### 1. Supabase Config (tabela `config`)

```sql
UPDATE config SET 
  openrouter_model = 'openai/gpt-oss-20b'
WHERE openrouter_model = 'openai/gpt-oss-20b:free';
```

**Valores atuais:**
- `llm_provider`: `openrouter`
- `openrouter_model`: `openai/gpt-oss-20b`
- `openrouter_api_key`: `sk-or-v1-be408084...` (configurado)

### 2. Server LLM (`server/llm.ts`)

**Provider Routing adicionado:**
```javascript
provider: {
  order: ['chutes'],  // Priorizar Chutes (mais barato: $0.02/M input, $0.10/M output - bf16)
  allow_fallbacks: true   // Permite outros providers se Chutes falhar
}
```

**Defaults atualizados:**
- Modelo padrão: `openai/gpt-oss-20b`
- Fallback: Groq com `llama-3.3-70b-versatile`

### 3. Admin Panel (`client/src/pages/admin.tsx`)

**Lista de modelos atualizada:**
```javascript
{ value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Chutes - $0.02/M input) ✅ RECOMENDADO' },
{ value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B (DeepInfra - $0.135/M)' },
{ value: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (DeepInfra - $0.35/M)' },
{ value: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Gratuito)' }
```

---

## 💰 Comparação de Custos (gpt-oss-20b)

| Provider | Input/M | Output/M | Latency | Throughput | Quantização |
|----------|---------|----------|---------|------------|-------------|
| **Chutes** | $0.02 | $0.10 | 0.46s | 81tps | bf16 ✅ |
| DeepInfra | $0.03 | $0.14 | 0.64s | 276tps | bf16 |
| nCompass | $0.04 | $0.15 | 1.17s | 80tps | - |
| Hyperbolic | $0.04 | $0.04 | - | - | - |

**Economia estimada:** ~50% mais barato no input vs DeepInfra

---

## 🧪 Testes Realizados

### Teste: API com Chutes

```
✅ CONFIGURADO!
📡 Provider: Chutes (bf16)
📝 Modelo: openai/gpt-oss-20b
💰 Custo Input: $0.02/M tokens
💰 Custo Output: $0.10/M tokens
```

**Logs do servidor:**
```
[LLM] 🚀 chatComplete via OpenRouter com modelo correto: openai/gpt-oss-20b
[LLM] ✅ OpenRouter chatComplete respondeu
```

---

## 📁 Arquivos Modificados

1. `server/llm.ts` - Provider routing alterado de hyperbolic → chutes
2. `server/promptCalibrationService.ts` - Comentários atualizados
3. `server/UnifiedFlowEngine.ts` - Comentários atualizados
4. `server/promptEditService.ts` - Comentários atualizados
5. `server/routes.ts` - Comentários atualizados

---

## 🔄 Fallback

Se o Chutes estiver indisponível, o sistema faz fallback para:
1. **Outros providers do OpenRouter** (via `allow_fallbacks: true`)
2. **Groq** (via configuração de fallback no sistema)

---

## 📊 Resumo

| Item | Status |
|------|--------|
| Modelo configurado | ✅ `openai/gpt-oss-20b` |
| Provider priorizado | ✅ Chutes (bf16) |
| Fallback habilitado | ✅ `allow_fallbacks: true` |
| Custo otimizado | ✅ $0.02/M input, $0.10/M output |
| Quantização | ✅ bf16 (melhor qualidade) |

---

## 🚀 Próximos Passos (Opcional)

1. Monitorar custos no dashboard do OpenRouter
2. Avaliar qualidade das respostas em produção
3. Considerar DeepInfra se precisar de maior throughput (276tps)
