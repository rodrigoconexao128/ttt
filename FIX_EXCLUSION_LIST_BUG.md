# 🐛 FIX: Bug Lista de Exclusão - IA e Follow-up Ignorando Lista

## Data: 2026-01-13

## Problema Identificado

A IA e o sistema de follow-up estavam **enviando mensagens para clientes que estavam na lista de exclusão** porque o código verificava incorretamente se a lista estava ativada.

### Causa Raiz

Nas funções `isNumberExcluded()` e `isNumberExcludedFromFollowup()` em `server/storage.ts`, o código original era:

```typescript
const config = await this.getExclusionConfig(userId);
if (!config?.isEnabled) {  // ❌ BUG AQUI
  console.log(`🚫 [EXCLUSION] Lista de exclusão desativada...`);
  return false;  // Permite todas as mensagens!
}
```

**O problema:** Se o usuário nunca acessou a página de configuração de exclusão, `config` seria `undefined`. O código `!config?.isEnabled` avalia como `true` quando `config` é `undefined`, fazendo o sistema pensar que a lista estava **desativada** e permitindo todas as mensagens.

### Impacto

- 2790 números na lista de exclusão foram ignorados
- Follow-ups enviados para clientes bloqueados
- IA respondeu a clientes que solicitaram não ser contatados
- Maioria dos usuários ativos (24+) não tinha `exclusion_config` criada no banco

## Solução Aplicada

### 1. Correção das Funções de Verificação

**`isNumberExcluded()` - ANTES:**
```typescript
if (!config?.isEnabled) {
  return false; // Permite tudo se config não existe
}
```

**`isNumberExcluded()` - DEPOIS:**
```typescript
if (config && config.isEnabled === false) {
  return false; // Só desativa se explicitamente false
}
// Se config não existe, continua verificando a lista (ativada por padrão)
```

### 2. Mesma Lógica para Follow-up

**`isNumberExcludedFromFollowup()` - DEPOIS:**
```typescript
if (config && config.isEnabled === false) {
  return false;
}
if (config && config.followupExclusionEnabled === false) {
  return false;
}
// Se config não existe, ambas flags assumem true por padrão
```

### 3. Criação de Configs Padrão no Banco

Executado SQL para criar `exclusion_config` para todos os usuários que tinham itens na lista mas não tinham config:

```sql
INSERT INTO exclusion_config (user_id, is_enabled, followup_exclusion_enabled)
SELECT DISTINCT el.user_id, true, true
FROM exclusion_list el
WHERE NOT EXISTS (
  SELECT 1 FROM exclusion_config ec WHERE ec.user_id = el.user_id
);
```

## Arquivos Modificados

1. `server/storage.ts` - Funções `isNumberExcluded()` e `isNumberExcludedFromFollowup()`
2. `undefined/server/storage.ts` - Mesmas correções (pasta duplicada)

## Verificação

Após deploy, verificar nos logs:

```
🔍 [EXCLUSION] Verificando lista de exclusão para usuário X (config=default, isEnabled=default=true)
🚫 EXCLUÍDO
```

Se aparecer "config=default", significa que não existe config mas a lista está sendo verificada corretamente.

## Lógica Final

| Config Existe | isEnabled | Comportamento |
|--------------|-----------|---------------|
| ❌ Não | - | Lista ATIVADA (padrão) |
| ✅ Sim | `true` | Lista ATIVADA |
| ✅ Sim | `false` | Lista DESATIVADA |
| ✅ Sim | `undefined` | Lista ATIVADA (padrão) |

## Prevenção Futura

A API `GET /api/exclusion/config` já cria config padrão automaticamente quando o usuário acessa a página. Porém, a correção garante que mesmo sem acessar a página, a lista funcione corretamente.
