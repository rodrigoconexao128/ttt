# 🚨 SOLUÇÃO - Circuit Breaker Persistente Após Deploy

## STATUS ATUAL

### ✅ Correções Aplicadas
- Pool aumentado: 3/5 → 10/15 conexões
- Timeouts relaxados: 10-15s → 30s
- 5 índices FK adicionados no Supabase
- 2 RLS policies otimizadas
- Deploy concluído com **SUCCESS**

### ❌ Problema Persiste
```
Error: Circuit breaker open: Too many authentication errors
Error: Circuit breaker open: Failed to retrieve database credentials
Code: XX000 (PostgreSQL Internal Error)
```

---

## 🔍 ANÁLISE ADICIONAL

### Evidências

1. **Conexões ativas no Supabase:** Apenas 2 conexões
   - ✅ Não é problema de sobrecarga
   
2. **Erro mudou de:**
   - "Too many authentication errors"  
   - Para: "Failed to retrieve database credentials"
   
3. **Padrão observado:**
   - Erro aparece em TODAS as queries
   - Afeta `/api/usage`, `/api/access-status`, etc.
   - Mensagens WhatsApp NÃO estão sendo processadas

### Hipóteses

#### 🎯 HIPÓTESE 1: Rate Limiting do Supabase Pooler
- **Problema:** PgBouncer pode ter limite de autenticações/segundo
- **Evidência:** Pool maior (10-15) tenta autenticar múltiplas conexões simultaneamente
- **Solução:** Adicionar delay/retry escalonado nas conexões

#### 🎯 HIPÓTESE 2: Credenciais em Cache no Railway
- **Problema:** Railway pode estar usando credenciais antigas em cache
- **Evidência:** MCP Supabase funciona, mas Railway não
- **Solução:** Forçar redeploy ou limpar cache

#### 🎯 HIPÓTESE 3: SSL/TLS Handshake Falhando
- **Problema:** Pool maior causa mais handshakes SSL simultâneos
- **Evidência:** PgBouncer pode estar rejeitando por timeout de SSL
- **Solução:** Aumentar `ssl_handshake_timeout` ou desabilitar temporariamente

#### 🎯 HIPÓTESE 4: Supabase bloqueou IP do Railway
- **Problema:** Muitas tentativas falhadas podem ter bloqueado o IP
- **Evidência:** Erro "authentication errors" persistente
- **Solução:** Verificar logs Supabase e whitelist IP

---

## ✅ SOLUÇÕES IMEDIATAS

### SOLUÇÃO 1: Reverter Pool Temporariamente

**Objetivo:** Confirmar se o pool maior é a causa

```typescript
// server/db.ts
max: isPoolerConnection ? 5 : 7,  // Meio termo entre 3 e 10
min: 1,  // Reduzir para 1
```

**Ação:**
```bash
# Reverter parcialmente
git revert HEAD --no-commit
# Editar server/db.ts manualmente com valores intermediários
git add server/db.ts
git commit -m "test: Reduzir pool para 5/7 temporariamente"
railway up
```

### SOLUÇÃO 2: Adicionar Retry com Backoff Exponencial

**Objetivo:** Evitar tentar autenticar todas as conexões ao mesmo tempo

```typescript
// server/db.ts
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: isPoolerConnection ? 10 : 15,
  min: 1,  // Reduzido de 2
  idleTimeoutMillis: isPoolerConnection ? 20000 : 60000,
  connectionTimeoutMillis: 30000,
  statement_timeout: 30000,
  allowExitOnIdle: false,
  
  // ✅ NOVO: Retry com backoff exponencial
  retryStrategy: (times: number) => {
    const delay = Math.min(times * 1000, 10000); // Max 10s
    console.log(`[DB] Retry #${times} após ${delay}ms`);
    return delay;
  },
  
  // ✅ NOVO: Conectar conexões de forma escalonada
  max_connection_backoff: 2000,  // 2s entre cada conexão nova
};
```

### SOLUÇÃO 3: Verificar e Resetar Credenciais

**Objetivo:** Garantir que as credenciais estão corretas

1. **No Supabase Dashboard:**
   - Ir para Settings → Database
   - Verificar se a senha mudou
   - Se necessário, resetar senha e atualizar Railway

2. **No Railway:**
   ```bash
   railway variables
   # Verificar DATABASE_URL
   # Se necessário, atualizar:
   railway variables set DATABASE_URL="nova_url"
   ```

### SOLUÇÃO 4: Forçar Recreate do Container

**Objetivo:** Limpar qualquer cache/estado corrompido

```bash
cd "c:\Users\Windows\Downloads\agentezap correto\vvvv"

# Trigger rebuild completo
railway service
railway redeploy
```

### SOLUÇÃO 5: Adicionar Logs de Debug

**Objetivo:** Identificar exatamente onde a autenticação falha

```typescript
// server/db.ts
export const pool = new Pool(poolConfig);

// ✅ LOGS DETALHADOS
pool.on('connect', (client: PoolClient) => {
  console.log('✅ [DB Pool] Conexão estabelecida com sucesso');
});

pool.on('acquire', (client: PoolClient) => {
  console.log('🔗 [DB Pool] Conexão adquirida do pool');
});

pool.on('error', (err, client) => {
  console.error('❌ [DB Pool] Erro detalhado:');
  console.error('  - Message:', err.message);
  console.error('  - Code:', err.code);
  console.error('  - Stack:', err.stack);
});

pool.on('remove', (client: PoolClient) => {
  console.log('🔌 [DB Pool] Conexão removida');
});

// ✅ LOG INICIAL DE TESTE
setTimeout(async () => {
  console.log('[DB] Testando autenticação inicial...');
  try {
    const client = await pool.connect();
    console.log('✅ [DB] Autenticação OK!');
    const result = await client.query('SELECT current_user, current_database()');
    console.log('[DB] Conectado como:', result.rows[0]);
    client.release();
  } catch (error: any) {
    console.error('❌ [DB] Falha na autenticação inicial:', error.message);
    console.error('   Code:', error.code);
    console.error('   Detail:', error.detail);
  }
}, 2000);
```

### SOLUÇÃO 6: Testar com Pool Mínimo

**Objetivo:** Confirmar que 1 conexão funciona

```typescript
// Configuração ULTRA conservadora para teste
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  max: 1,  // ⚠️ APENAS 1 conexão para teste
  min: 0,
  idleTimeoutMillis: 60000,
  connectionTimeoutMillis: 60000,  // 60s timeout
  statement_timeout: 60000,
  allowExitOnIdle: false,
};
```

---

## 📋 PLANO DE AÇÃO SEQUENCIAL

### FASE 1: Diagnóstico (15 min)

1. ✅ Adicionar logs detalhados (Solução 5)
2. ✅ Deploy com logs
3. ✅ Verificar Railway logs
4. ✅ Identificar mensagem de erro exata

**Comando:**
```bash
cd "c:\Users\Windows\Downloads\agentezap correto\vvvv"

# Adicionar logs ao server/db.ts
# (usar Solução 5)

git add server/db.ts
git commit -m "debug: Adicionar logs detalhados de autenticação"
railway up

# Aguardar 2 min
railway logs --lines 100
```

### FASE 2: Teste com Pool Mínimo (10 min)

1. ✅ Reduzir pool para 1 conexão (Solução 6)
2. ✅ Deploy
3. ✅ Verificar se funciona
4. ✅ Se funcionar, aumentar gradualmente (2, 3, 5, 10)

### FASE 3: Verificar Credenciais (5 min)

1. ✅ Acessar Supabase Dashboard
2. ✅ Settings → Database → Connection String
3. ✅ Copiar password
4. ✅ Comparar com Railway
5. ✅ Se diferente, atualizar Railway

### FASE 4: Implementar Retry (20 min)

1. ✅ Adicionar backoff exponencial (Solução 2)
2. ✅ Deploy
3. ✅ Monitorar logs por 10 min
4. ✅ Verificar se erros diminuem

---

## 🔧 IMPLEMENTAÇÃO IMEDIATA

### Arquivo: `server/db.ts` (Versão com Logs + Retry)

```typescript
import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const rawDbUrl = process.env.DATABASE_URL;
const directDbUrl = process.env.DATABASE_URL_DIRECT;
const dbUrl = directDbUrl || rawDbUrl;
const isPoolerConnection = dbUrl.includes(':6543') || dbUrl.includes('pooler.supabase.com');

console.log(
  `[DB] Modo: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'}`,
);

// 🔥 CONFIGURAÇÃO COM LOGS E RETRY
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool CONSERVADOR para teste
  max: isPoolerConnection ? 5 : 7,  // Meio termo
  min: 1,
  idleTimeoutMillis: isPoolerConnection ? 30000 : 60000,
  connectionTimeoutMillis: 45000,  // 45s
  statement_timeout: 30000,
  allowExitOnIdle: false,
  
  // Retry com backoff exponencial
  retryStrategy: (times: number) => {
    if (times > 5) return false;  // Max 5 retries
    const delay = Math.min(times * 2000, 15000);  // 2s, 4s, 6s, 8s, 10s
    console.log(`⏳ [DB] Retry #${times} após ${delay}ms`);
    return delay;
  },
};

export const pool = new Pool(poolConfig);

// LOGS DETALHADOS
pool.on('connect', () => {
  console.log('✅ [DB Pool] Nova conexão ESTABELECIDA');
});

pool.on('acquire', () => {
  console.log('🔗 [DB Pool] Conexão ADQUIRIDA do pool');
});

pool.on('error', (err: any) => {
  console.error('❌ [DB Pool] ERRO:', err.message);
  console.error('   Code:', err.code);
  console.error('   Severity:', err.severity);
});

pool.on('remove', () => {
  console.log('🔌 [DB Pool] Conexão REMOVIDA');
});

// Teste de conexão inicial COM LOGS DETALHADOS
setTimeout(async () => {
  console.log('🔍 [DB] === TESTE DE AUTENTICAÇÃO INICIAL ===');
  try {
    const start = Date.now();
    console.log('[DB] 1. Tentando conectar...');
    
    const client = await pool.connect();
    const connectTime = Date.now() - start;
    console.log(`✅ [DB] 2. Conectado em ${connectTime}ms`);
    
    console.log('[DB] 3. Executando query de teste...');
    const result = await client.query('SELECT current_user, current_database(), version()');
    const queryTime = Date.now() - start;
    
    console.log('✅ [DB] 4. Query executada em ' + (queryTime - connectTime) + 'ms');
    console.log('[DB] === AUTENTICAÇÃO OK ===');
    console.log('   User:', result.rows[0].current_user);
    console.log('   Database:', result.rows[0].current_database);
    console.log('   Version:', result.rows[0].version.substring(0, 50) + '...');
    
    client.release();
    console.log('[DB] 5. Conexão liberada de volta ao pool');
  } catch (error: any) {
    console.error('❌ [DB] === FALHA NA AUTENTICAÇÃO ===');
    console.error('   Message:', error.message);
    console.error('   Code:', error.code);
    console.error('   Severity:', error.severity);
    console.error('   Detail:', error.detail);
    console.error('   Hint:', error.hint);
    console.error('===================================');
  }
}, 3000);  // 3s delay para deixar servidor iniciar

export const db = drizzle({ 
  client: pool, 
  schema,
  logger: process.env.NODE_ENV !== 'production',
});
```

---

## 🎯 PRÓXIMOS PASSOS

### Agora (Imediato)
1. Aplicar arquivo `server/db.ts` com logs detalhados
2. Fazer deploy
3. Aguardar 3 min
4. Ler logs do Railway
5. Compartilhar output do teste de autenticação

### Depois (Se logs mostrarem autenticação OK)
1. Aumentar pool gradualmente (5 → 7 → 10)
2. Monitorar por 24h
3. Otimizar RLS policies restantes

### Se Autenticação Continuar Falhando
1. Verificar se IP do Railway foi bloqueado no Supabase
2. Resetar senha do Supabase
3. Atualizar DATABASE_URL no Railway
4. Considerar usar Supabase Pooler em modo SESSION (porta 5432)

---

## 📞 SUPORTE

Se o problema persistir após essas correções:

1. **Logs para compartilhar:**
   - Output completo do teste de autenticação
   - Últimas 100 linhas do Railway logs
   - Screenshot do Supabase Database Settings

2. **Informações úteis:**
   - Projeto Supabase: `bnfpcuzjvycudccycqqt`
   - Railway Project: `handsome-mindfulness`
   - Região: `us-west2`

3. **Possíveis causas externas:**
   - Manutenção do Supabase
   - Mudança de IP do Railway
   - Limite de conexões do plano Supabase
   - Bloqueio de segurança automático

---

**Status:** AGUARDANDO LOGS DETALHADOS
**Prioridade:** 🔴 CRÍTICA
**Próxima Ação:** Aplicar logs e fazer deploy
