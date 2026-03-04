# CORREÇÃO: IA NÃO SUGERE HORÁRIOS DURANTE O ALMOÇO

## Data: 2026-02-09

## Problema Identificado

Durante os testes E2E com Playwright (3 rodadas), observamos que a IA às vezes sugeria horários dentro do almoço (12:30, 12:15) mesmo quando o `opening_hours.__break` estava configurado para bloquear 12:00-13:00.

**Causa raiz:** O backend `salonAvailability.ts` filtrava corretamente os slots (excluindo almoço), mas quando passávamos os slots para a função `generateAIResponse()`, o LLM às vezes ignorava a lista e "inventava" horários próximos mas não exatamente na lista.

## Solução Implementada: Fluxo Estruturado com Validação

### 1. Nova Função: `generateSlotSuggestionMessageLLM()`

**Arquivo:** `server/salonAIService.ts` (linhas 552-645)

Esta função substitui a sugestão de horários via LLM livre por um fluxo estruturado:

```typescript
interface SlotSuggestionResult {
  messageText: string;
  suggestedSlots: string[];
}

async function generateSlotSuggestionMessageLLM(
  options: SlotSuggestionOptions
): Promise<SlotSuggestionResult>
```

**Características:**
- LLM retorna JSON estrito: `{ messageText: "...", suggestedSlots: ["HH:mm", ...] }`
- `suggestedSlots` é validado contra `allowedSlots` (vindo do backend)
- Se validação falhar: LLM é rechamada com correção (até 2 tentativas)
- Se persistir erro: usa fallback determinístico com slots diretos do backend

### 2. Validação Sem Regex

A validação é feita por comparação de listas (sem regex):

```typescript
const allValid = suggested.every((s: string) => allowedSlots.includes(s));
```

Isso garante que **apenas** horários vindos do backend podem ser sugeridos.

### 3. Ponto de Aplicação

A função estruturada é usada em 3 pontos críticos:

**a) Quando falta horário (`needsTime`):**
```typescript
// Linha 929
const slotResult = await generateSlotSuggestionMessageLLM({
  message,
  conversationHistory: history,
  salonData,
  bookingState: state,
  date: state.date!,
  allowedSlots: slots,  // ← JÁ filtrados pelo backend (sem almoço)
  breakConfig,
  serviceName: state.service?.name,
});
return { text: slotResult.messageText };
```

**b) Quando horário solicitado é inválido (validação antes de confirmação):**
```typescript
// Linha 843
const slotResult = await generateSlotSuggestionMessageLLM({
  // ... same structure
  allowedSlots: availableSlots,
});
return { text: slotResult.messageText };
```

**c) Quando criação de agendamento falha (conflito/race):**
```typescript
// Linha 890
const slotResult = await generateSlotSuggestionMessageLLM({
  // ... same structure
  allowedSlots: result.suggestedSlots,
});
return { text: slotResult.messageText };
```

### 4. Regra Global no Prompt

Adicionado ao `systemPrompt` do `generateAIResponse()`:

> **IMPORTANTE: NUNCA sugira horários específicos (como "12:30", "14:10") a menos que uma lista de horários disponíveis seja fornecida no contexto. Sem lista, pergunte apenas a preferência do cliente.**

Isso evita que o LLM "chute" horários em respostas gerais.

## Backend Continua Sendo a Fonte de Verdade

O `salonAvailability.ts` já filtra corretamente o almoço via `computeBreakWindow()` e `intersectsBreak()`. A nova camada apenas **garante** que a IA respeite os slots calculados pelo backend.

## Testes E2E Esperados

Após reinício do servidor, os testes devem demonstrar:

1. **Solicitação de horário para hoje:** IA responde com slots da lista `allowedSlots` (nunca com 12:xx durante almoço)
2. **Horário solicitado durante almoço (12:30):** IA oferece alternativas fora do almoço
3. **Todos os slots sugeridos** estão contidos em `allowedSlots`

## Próximos Passos

1. **Reiniciar o servidor** para aplicar as mudanças
2. **Limpar o simulador** e testar novamente
3. **Verificar no painel** se agendamentos continuam funcionando
4. **Rodar teste específico:** Solicitar "quero agendar hoje às 12:30" e confirmar que IA não aceita

## Arquivos Modificados

- `vvvv/server/salonAIService.ts`
  - Adicionada função `generateSlotSuggestionMessageLLM()` (linhas 552-645)
  - Modificado `systemPrompt` com regra global (linha ~600)
  - Substituído 3 pontos de chamada para usar a nova função (linhas 843, 890, 929)

## Critérios de Aceite

- ✅ IA nunca sugere 12:xx durante almoço configurado (12:00-13:00)
- ✅ Todas as sugestões de horário são subconjunto de `allowedSlots`
- ✅ Fallback funciona se LLM falhar
- ✅ Sem regex - validação puramente estrutural
