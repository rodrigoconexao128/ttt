# 📋 Configuração OpenRouter + Hyperbolic

## ✅ Status: IMPLEMENTADO E TESTADO

Data: 23/01/2026  
Autor: GitHub Copilot

---

## 🎯 Objetivo

Configurar o OpenRouter para usar o modelo **PAGO** `openai/gpt-oss-20b` com o provider **Hyperbolic**, que oferece o melhor custo ($0.04/M tokens input/output).

---

## ⚠️ Problema Anterior

O modelo gratuito `openai/gpt-oss-20b:free` estava retornando erro **404** devido à política de privacidade do OpenRouter que exige "data retention" para modelos gratuitos.

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
  order: ['hyperbolic'],  // Priorizar Hyperbolic (mais barato: $0.04/M)
  allow_fallbacks: true   // Permite outros providers se Hyperbolic falhar
}
```

**Defaults atualizados:**
- Modelo padrão: `openai/gpt-oss-20b`
- Fallback: Groq com `llama-3.3-70b-versatile`

### 3. Admin Panel (`client/src/pages/admin.tsx`)

**Lista de modelos atualizada:**
```javascript
{ value: 'openai/gpt-oss-20b', label: 'GPT-OSS 20B (Hyperbolic - $0.04/M) ✅ RECOMENDADO' },
{ value: 'google/gemma-2-27b-it', label: 'Gemma 2 27B (DeepInfra - $0.135/M)' },
{ value: 'qwen/qwen-2.5-72b-instruct', label: 'Qwen 2.5 72B (DeepInfra - $0.35/M)' },
{ value: 'mistralai/mistral-7b-instruct:free', label: 'Mistral 7B (Gratuito)' }
```

---

## 💰 Comparação de Custos

| Provider | Input/M | Output/M | Total Estimado |
|----------|---------|----------|----------------|
| **Hyperbolic** | $0.04 | $0.04 | ✅ Mais barato |
| DeepInfra | $0.03 | $0.14 | Intermediário |
| Crusoe | $0.02 | $0.10 | Mais caro output |

**Custo médio por chamada (~165 tokens):** `$0.0000066`

---

## 🧪 Testes Realizados

### Teste 1: API Direta (test-hyperbolic.mjs)

```
✅ SUCESSO!
📡 Status: 200
📝 Resposta: Olá! Hyperbolic funcionando!
📊 Detalhes:
   - Modelo usado: openai/gpt-oss-20b
   - Provider: Hyperbolic
   - Total tokens: 165
💰 Custo Total: $0.00000660
```

### Teste 2: Simulador WhatsApp (Playwright)

**Mensagem:** "Olá, quero saber mais sobre a plataforma"

**Resposta:**
> "Opa, Visitante! Rodrigo aqui da AgenteZap. A gente tem uma IA que atende seus clientes no WhatsApp 24h, tira dúvidas, envia catálogos, agenda horários e fecha vendas automaticamente..."

**Logs do servidor:**
```
[LLM] 🚀 chatComplete via OpenRouter com modelo correto: openai/gpt-oss-20b
[LLM] ✅ OpenRouter chatComplete respondeu
```

---

## 📁 Arquivos Modificados

1. `server/llm.ts` - Provider routing e defaults
2. `client/src/pages/admin.tsx` - Lista de modelos no painel
3. `test-hyperbolic.mjs` - Script de teste direto (NOVO)

---

## 🔄 Fallback

Se o Hyperbolic estiver indisponível, o sistema faz fallback para:
1. **Outros providers do OpenRouter** (via `allow_fallbacks: true`)
2. **Groq** (via configuração de fallback no sistema)

---

## 📊 Resumo

| Item | Status |
|------|--------|
| Modelo configurado | ✅ `openai/gpt-oss-20b` |
| Provider priorizado | ✅ Hyperbolic |
| Fallback habilitado | ✅ `allow_fallbacks: true` |
| Teste API direta | ✅ Status 200 |
| Teste simulador | ✅ Resposta gerada |
| Custo otimizado | ✅ $0.04/M tokens |

---

## 🚀 Próximos Passos (Opcional)

1. Monitorar custos no dashboard do OpenRouter
2. Avaliar qualidade das respostas em produção
3. Considerar outros modelos se necessário
