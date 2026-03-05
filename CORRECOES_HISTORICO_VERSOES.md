# 🔧 Correções Profundas - Sistema de Histórico de Versões do Agente

## 📋 Problemas Identificados e Corrigidos

### ❌ PROBLEMA 1: Versão ativa incorreta
**Descrição**: Quando restaurava uma versão, mostrava que uma estava ativa mas outra estava realmente ativa.

**Causa Raiz**: 
- Havia dois lugares com informação de "versão ativa": 
  1. `prompt_versions.is_current` (flag no histórico)
  2. `ai_agent_config.prompt` (o que o agente realmente usa)
- Dessincronia entre esses dois sistemas

**Correção**:
- ✅ Rota de restauração agora atualiza AMBOS
- ✅ Frontend mostra badge "EM USO" comparando `config.prompt` com `version.prompt_content`
- ✅ Logs detalhados em cada operação

---

### ❌ PROBLEMA 2: Não criava nova versão ao restaurar
**Descrição**: Ao restaurar, não criava versão tipo "Restaurado da v5" para manter histórico navegável.

**Causa Raiz**: Frontend chamava rota errada (`/api/agent/config` em vez de `/api/agent/prompt-versions/:id/restore`)

**Correção**:
- ✅ Frontend agora chama `/api/agent/prompt-versions/:id/restore` corretamente
- ✅ Backend cria nova versão com `editType: 'restore'` e `editSummary: "Restaurado da versão X"`
- ✅ Histórico completo mantido com navegação entre restaurações

---

### ❌ PROBLEMA 3: Timestamps não apareciam
**Descrição**: Tinha que atualizar página para ver que histórico foi atualizado.

**Causa Raiz**: 
- Falta de invalidação de queries após mutations
- Cache do React Query não era atualizado

**Correção**:
- ✅ `updateConfigMutation` agora invalida queries de config E versões
- ✅ Após restaurar, força refetch automático
- ✅ UI atualiza em tempo real sem precisar refresh

---

### ❌ PROBLEMA 4: Histórico não aparecia
**Descrição**: Às vezes nenhum histórico aparecia para restaurar.

**Causa Raiz**: 
- Salvamento manual (via editor de código) não criava versão automaticamente
- Apenas edições via IA criavam versões

**Correção**:
- ✅ Rota `/api/agent/config` agora detecta mudança de prompt
- ✅ Cria automaticamente nova versão quando prompt muda
- ✅ Versões sempre sincronizadas com config

---

### ❌ PROBLEMA 5: Agente usava prompt errado (CRÍTICO!)
**Descrição**: Quando agente respondia clientes no WhatsApp, podia estar usando prompt diferente do escolhido.

**Causa Raiz**: 
- `aiAgent.ts` busca `ai_agent_config.prompt` do banco
- Se config não foi atualizado ao restaurar versão, agente usava prompt antigo

**Correção**:
- ✅ Restauração agora GARANTE atualização de `ai_agent_config.prompt`
- ✅ Logs detalhados mostram qual prompt está sendo usado
- ✅ Rota de validação `/api/agent/prompt-versions/validate` verifica consistência

---

## 🔄 Fluxos Corrigidos

### Fluxo 1: Salvamento Manual
```
1. Usuário edita prompt no editor
2. Clica "Salvar"
3. POST /api/agent/config
   ├─ Detecta mudança de prompt
   ├─ Atualiza ai_agent_config.prompt
   ├─ Cria nova versão em prompt_versions
   └─ Marca is_current = true
4. Invalida queries
5. UI atualiza automaticamente
```

### Fluxo 2: Edição via IA
```
1. Usuário envia instrução no chat
2. POST /api/agent/edit-prompt
   ├─ IA processa e edita prompt
   ├─ Cria nova versão
   └─ Atualiza config
3. Retorna para frontend
4. UI atualiza
```

### Fluxo 3: Restauração de Versão
```
1. Usuário clica em versão antiga no histórico
2. POST /api/agent/prompt-versions/:id/restore
   ├─ Busca versão original (ex: v5)
   ├─ Cria NOVA versão "Restaurado da v5" (ex: v12)
   ├─ Marca nova versão como is_current = true
   ├─ Atualiza ai_agent_config.prompt
   └─ Retorna versionNumber e restoredFrom
3. Frontend invalida queries
4. UI mostra nova versão v12 criada
5. Badge "EM USO" atualiza
```

### Fluxo 4: Agente Respondendo Cliente
```
1. Cliente envia mensagem no WhatsApp
2. aiAgent.ts processa
3. await storage.getAgentConfig(userId)
   └─ Busca ai_agent_config.prompt do banco
4. Logs mostram:
   ├─ Prompt length
   ├─ Primeiros 150 chars
   └─ Hash MD5 (para debug)
5. Usa esse prompt para gerar resposta
6. Envia para cliente
```

---

## 🛠️ Arquivos Modificados

### Backend
- ✅ `server/routes.ts`
  - Rota `/api/agent/config` cria versão automaticamente
  - Rota `/api/agent/prompt-versions` retorna `promptContent`
  - Rota `/api/agent/prompt-versions/:id/restore` melhorada
  - Nova rota `/api/agent/prompt-versions/validate` para debug
  - Logs detalhados em todas as rotas

- ✅ `server/promptHistoryService.ts`
  - `salvarVersaoPrompt()` com logs detalhados
  - Mostra versões desmarcadas
  - Confirma criação de nova versão

- ✅ `server/aiAgent.ts`
  - Logs detalhados do prompt usado
  - Mostra hash MD5 para debug
  - Facilita identificar qual versão está ativa

### Frontend
- ✅ `client/src/components/agent-studio-unified.tsx`
  - `restoreFromHistory()` usa rota correta
  - Invalida queries após mutations
  - Badge "EM USO" mostra versão realmente ativa
  - Mostra data/hora completa no histórico
  - Mostra tamanho do prompt
  - Melhor UX no painel de histórico

---

## 🔍 Como Validar Sistema

### 1. Usar rota de validação
```bash
GET /api/agent/prompt-versions/validate
```

Retorna:
- ✅ Se `ai_agent_config.prompt` = `prompt_versions.is_current.prompt_content`
- ✅ Se há apenas 1 versão com `is_current = true`
- ✅ Total de versões
- ✅ Hash MD5 dos prompts para comparar

### 2. Verificar logs
Ao responder cliente, logs mostram:
```
🤖 [AI Agent] ═══════════════════════════════════════════════════
🤖 [AI Agent] Config para user XXX respondendo cliente:
   Prompt length: 1234 chars
   Prompt (MD5 para debug): a1b2c3d4
🤖 [AI Agent] ═══════════════════════════════════════════════════
```

### 3. Verificar UI
- Badge "EM USO" aparece na versão correta
- Histórico mostra todas versões com timestamps
- Ao restaurar, nova versão é criada imediatamente

---

## 📊 Queries de Validação no Banco

### Verificar sincronização
```sql
SELECT 
  ac.user_id,
  ac.prompt as config_prompt_preview,
  pv.prompt_content as version_prompt_preview,
  pv.version_number,
  pv.is_current,
  (ac.prompt = pv.prompt_content) as is_synced,
  LENGTH(ac.prompt) as config_length,
  LENGTH(pv.prompt_content) as version_length
FROM ai_agent_config ac
LEFT JOIN prompt_versions pv ON pv.user_id = ac.user_id AND pv.is_current = true
WHERE ac.is_active = true
LIMIT 10;
```

### Verificar múltiplas versões current
```sql
SELECT user_id, COUNT(*) as count_current
FROM prompt_versions
WHERE is_current = true
GROUP BY user_id
HAVING COUNT(*) > 1;
```
Se retornar resultados, há BUG!

### Ver histórico de um usuário
```sql
SELECT 
  version_number,
  edit_type,
  edit_summary,
  is_current,
  LENGTH(prompt_content) as prompt_length,
  created_at
FROM prompt_versions
WHERE user_id = 'USER_ID_AQUI'
ORDER BY version_number DESC
LIMIT 20;
```

---

## ✅ Checklist de Validação

- [x] ✅ Salvamento manual cria versão
- [x] ✅ Restauração cria nova versão
- [x] ✅ UI atualiza em tempo real
- [x] ✅ Badge "EM USO" mostra versão correta
- [x] ✅ Logs detalhados em todas operações
- [x] ✅ Rota de validação funciona
- [x] ✅ Agente usa prompt correto ao responder

---

## 🎯 Próximos Passos (Opcionais)

1. **Trigger no Banco** (futuro): Criar trigger PostgreSQL que auto-cria versão quando `ai_agent_config.prompt` muda
2. **WebSocket**: Notificações em tempo real quando outra aba/usuário muda versão
3. **Diff Visual**: Mostrar diferenças entre versões lado a lado
4. **Export/Import**: Exportar histórico de versões para backup

---

## 📝 Notas Importantes

- ⚠️ Sempre use rota `/api/agent/prompt-versions/:id/restore` para restaurar (não `/api/agent/config`)
- ⚠️ Invalide queries após mutations para UI atualizar
- ⚠️ Monitore logs ao responder clientes para confirmar prompt correto
- ⚠️ Use rota `/validate` regularmente para verificar consistência

---

**Data de Correção**: 30/12/2025
**Versão**: 2.0
**Status**: ✅ COMPLETO E TESTADO
