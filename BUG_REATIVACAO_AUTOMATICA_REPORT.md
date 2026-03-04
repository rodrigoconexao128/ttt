# 🔴 BUG CRÍTICO: Reativação Automática de IA para Clientes Desativados

## Descrição do Bug

O sistema estava **reativando automaticamente** o follow-up de IA para clientes que haviam **desativado manualmente** a IA.

### Cliente Afetado Reportado
- **Nome**: Leandro Uchoa  
- **Telefone**: 17869533502
- **Conversation ID**: f76c75e2-df74-42a5-b757-b1b25e71ccd1
- **Status no DB**: `followup_active: false`, `followup_disabled_reason: "Desativado pelo usuário"`
- **Evidência**: Screenshot mostra IA respondendo às 22:12 (01:12 UTC)

### Timeline do Bug
1. **01:11:00** - IA envia mensagem automática (follow-up ativo)
2. **01:12:04** - Cliente Leandro responde
3. **01:12:51** - 🔴 **IA RESPONDE NOVAMENTE** (bug: reativou automaticamente)
4. Usuário havia desativado IA para este cliente anteriormente

## Causa Raiz

### Arquivo: `vvvv/server/userFollowUpService.ts`

#### ❌ Bug 1: `resetFollowUpCycle()` (linha 1127-1177)
Quando o **cliente respondia**, o método verificava apenas `followupActive`, mas **NÃO verificava** `followupDisabledReason`.

```typescript
// ❌ CÓDIGO COM BUG (ANTES)
if (!conversation.followupActive) {
  console.log(`ℹ️ Follow-up estava desativado, não resetando`);
  return;
}
// 🔥 Problema: Se followupActive=false mas foi desativado MANUALMENTE,
// o código não reativava. MAS se followupActive=true, ele continuava
// resetando mesmo com followupDisabledReason definido!
```

#### ❌ Bug 2: `enableFollowUp()` (linha 1084-1124)
Quando o **dono enviava mensagem**, o método ativava follow-up SEM verificar se foi desativado manualmente.

```typescript
// ❌ CÓDIGO COM BUG (ANTES)
await db.update(conversations)
  .set({ 
    followupActive: true,
    followupStage: 0,
    nextFollowupAt: nextDate,
    followupDisabledReason: null  // 🔥 APAGAVA O MOTIVO!
  })
```

### Gatilhos do Bug

1. **Cliente responde** → `whatsapp.ts:3241` chama `resetFollowUpCycle()`
   - Se `followupActive=true` e cliente responde, resetava ciclo
   - **NÃO checava** se foi desativado manualmente
   - Reativava automaticamente

2. **Dono envia mensagem** → `whatsapp.ts:3990` chama `enableFollowUp()`
   - Sempre ativava follow-up em novas conversas
   - **NÃO checava** se foi desativado manualmente antes
   - Sobrescrevia `followupDisabledReason`

## Correção Implementada

### ✅ Fix 1: `resetFollowUpCycle()` - Linha 1140
```typescript
// ✅ CÓDIGO CORRIGIDO
if (!conversation.followupActive) {
  console.log(`ℹ️ Follow-up estava desativado, não resetando`);
  return;
}

// 🔧 FIX BUG REATIVAÇÃO: Verificar se foi desativado MANUALMENTE
if (conversation.followupDisabledReason && 
    conversation.followupDisabledReason.includes('Desativado pelo usuário')) {
  console.log(`🛑 Follow-up DESATIVADO MANUALMENTE. NÃO reativando.`);
  return;
}
```

### ✅ Fix 2: `enableFollowUp()` - Linha 1100
```typescript
// ✅ CÓDIGO CORRIGIDO
// 🔧 FIX BUG REATIVAÇÃO: Verificar ANTES de ativar
if (conversation.followupDisabledReason && 
    conversation.followupDisabledReason.includes('Desativado pelo usuário')) {
  console.log(`🛑 Follow-up DESATIVADO MANUALMENTE. NÃO reativando.`);
  return;
}
```

## Impacto

### Antes da Correção
- ✅ Cliente desativa IA manualmente
- ❌ Cliente responde → Sistema REATIVA IA automaticamente
- ❌ IA volta a enviar mensagens indesejadas
- ❌ Violação da escolha do usuário

### Depois da Correção
- ✅ Cliente desativa IA manualmente  
- ✅ Cliente responde → Sistema RESPEITA desativação
- ✅ IA NÃO envia mensagens
- ✅ Desativação manual é permanente até reativação manual

## Como Reativar Manualmente (se necessário)

Se um cliente desativou por engano e quer reativar:

1. **Via Interface**: Ir na conversa → Botão "Ativar IA"
2. **Via API**: `POST /user-followup/enable/:conversationId`
3. **Direto no DB**: 
```sql
UPDATE conversations 
SET followup_active = true,
    followup_disabled_reason = NULL,
    followup_stage = 0,
    next_followup_at = NOW() + INTERVAL '10 minutes'
WHERE id = '<conversation_id>';
```

## Auditoria Necessária

Verificar outros clientes que podem ter sido afetados:

```sql
-- Clientes desativados manualmente que receberam mensagens da IA nas últimas 24h
SELECT 
  c.contact_name,
  c.contact_number,
  c.followup_disabled_reason,
  COUNT(m.id) as ai_messages_sent
FROM conversations c
LEFT JOIN messages m ON m.conversation_id = c.id 
  AND m.timestamp > NOW() - INTERVAL '24 hours'
  AND m.from_me = true
  AND m.is_from_agent = true
WHERE c.followup_disabled_reason LIKE '%Desativado pelo usuário%'
GROUP BY c.contact_name, c.contact_number, c.followup_disabled_reason
HAVING COUNT(m.id) > 0;
```

## Deploy

- **Commit**: `5528ff0`
- **Branch**: `main`
- **Status**: ✅ Pushed to GitHub
- **Railway**: 🔄 Auto-deploy em progresso
- **Timestamp**: 2026-01-16 ~01:30 UTC

## Próximos Passos

1. ✅ Correção implementada e commitada
2. ✅ Push para GitHub/Railway
3. 🔄 Aguardar deploy do Railway
4. ⏳ Auditar clientes afetados nas últimas 24h
5. ⏳ Notificar usuário sobre clientes que precisam ser re-desativados manualmente
6. ⏳ Monitorar logs para confirmar que reativações automáticas pararam

---

**Autor da Correção**: GitHub Copilot  
**Data**: 2026-01-16  
**Severidade**: 🔴 **CRÍTICA** (violação de controle do usuário)
