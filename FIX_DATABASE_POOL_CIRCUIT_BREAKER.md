# 🚨 FIX CRÍTICO - Circuit Breaker Database

## PROBLEMA IDENTIFICADO

```
Error: Circuit breaker open: Too many authentication errors
Code: XX000 (FATAL - Internal PostgreSQL Error)
```

## CAUSAS RAIZ

### 1. Pool de Conexões Subdimensionado
```typescript
max: isPoolerConnection ? 3 : 5  // ❌ MUITO PEQUENO
```
- **3-5 conexões** para um servidor de mensagens WhatsApp de alta carga
- Volume observado: **200+ mensagens no cache simultâneo**
- Cada mensagem precisa de 2-3 queries (conversation, contact, message)

### 2. Timeouts Agressivos Demais
```typescript
connectionTimeoutMillis: 15000,   // 15s
statement_timeout: 10000,         // 10s por query
idleTimeoutMillis: 5000,          // 5s para pooler
```

### 3. Performance do Supabase Degradada
**Advisors mostraram:**
- 80+ RLS policies ineficientes re-avaliando `auth.<function>()` por linha
- 5 foreign keys sem índices (delivery_carts, delivery_orders, etc.)
- 50+ índices não utilizados consumindo memória

## CORREÇÕES URGENTES

### STEP 1: Aumentar Pool de Conexões

```typescript
// ANTES
max: isPoolerConnection ? 3 : 5,

// DEPOIS
max: isPoolerConnection ? 10 : 15,  // 3x mais conexões
min: 2,  // Manter 2 conexões sempre prontas
```

### STEP 2: Relaxar Timeouts

```typescript
// ANTES
connectionTimeoutMillis: 15000,
statement_timeout: 10000,
idleTimeoutMillis: isPoolerConnection ? 5000 : 30000,

// DEPOIS
connectionTimeoutMillis: 30000,  // 30s para conectar
statement_timeout: 30000,  // 30s por query
idleTimeoutMillis: isPoolerConnection ? 20000 : 60000,  // 20s/60s idle
```

### STEP 3: Implementar Circuit Breaker Real

```typescript
// Adicionar ao db.ts
import CircuitBreaker from 'opossum';

const breakerOptions = {
  timeout: 30000,  // 30s timeout
  errorThresholdPercentage: 50,  // 50% de falhas
  resetTimeout: 30000,  // 30s para tentar de novo
  rollingCountTimeout: 10000,  // Janela de 10s
  rollingCountBuckets: 10,
};

export const queryBreaker = new CircuitBreaker(
  async (query: string, params?: any[]) => {
    const client = await pool.connect();
    try {
      return await client.query(query, params);
    } finally {
      client.release();
    }
  },
  breakerOptions
);
```

### STEP 4: Otimizar RLS Policies no Supabase

```sql
-- EXECUTAR NO SUPABASE SQL EDITOR
-- Exemplo: flow_executions_select_policy

-- ANTES (LENTO - re-avalia auth.uid() por linha)
CREATE POLICY "flow_executions_select_policy" ON flow_executions
  FOR SELECT USING (user_id = auth.uid());

-- DEPOIS (RÁPIDO - usa subquery)
DROP POLICY IF EXISTS "flow_executions_select_policy" ON flow_executions;
CREATE POLICY "flow_executions_select_policy" ON flow_executions
  FOR SELECT USING (user_id = (SELECT auth.uid()));
```

### STEP 5: Adicionar Índices Missing

```sql
-- Foreign keys sem índices identificados
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_carts_user_id 
  ON delivery_carts(user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_orders_conversation_id 
  ON delivery_orders(conversation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_delivery_pedidos_conversation_id 
  ON delivery_pedidos(conversation_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_flow_executions_flow_definition_id 
  ON flow_executions(flow_definition_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_order_items_menu_item_id 
  ON order_items(menu_item_id);
```

### STEP 6: Remover Índices Duplicados

```sql
-- appointments tem índices duplicados
DROP INDEX IF EXISTS idx_appointments_professional;  -- Mantém idx_appointments_professional_id
DROP INDEX IF EXISTS idx_appointments_service;  -- Mantém idx_appointments_service_id
```

## IMPLEMENTAÇÃO IMEDIATA

### Arquivo: `server/db.ts`

```typescript
import { Pool, PoolClient } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";
import CircuitBreaker from 'opossum';

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
  `[DB] Modo de conexão: ${isPoolerConnection ? 'Supabase Pooler (PgBouncer)' : 'Direct Connection'}`,
);

// 🔥 CONFIGURAÇÃO OTIMIZADA PARA ALTA CARGA
const poolConfig: any = {
  connectionString: dbUrl,
  ssl: {
    rejectUnauthorized: false
  },
  // Pool dimensionado para 200+ mensagens/minuto
  max: isPoolerConnection ? 10 : 15,  // ✅ 3x maior
  min: 2,  // ✅ Mantém 2 conexões prontas
  idleTimeoutMillis: isPoolerConnection ? 20000 : 60000,  // ✅ Mais tempo idle
  connectionTimeoutMillis: 30000,  // ✅ 30s para conectar
  statement_timeout: 30000,  // ✅ 30s por query
  allowExitOnIdle: false,
  
  // Estratégia de retry
  retryStrategy: () => 5000,  // Retry após 5s
};

export const pool = new Pool(poolConfig);

// Circuit Breaker Pattern
const breakerOptions = {
  timeout: 30000,
  errorThresholdPercentage: 50,
  resetTimeout: 30000,
  rollingCountTimeout: 10000,
  rollingCountBuckets: 10,
  name: 'database-pool',
};

// Wrapper com circuit breaker
export const safeQuery = new CircuitBreaker(
  async (query: string, params?: any[]) => {
    const client = await pool.connect();
    try {
      const result = await client.query(query, params);
      return result;
    } finally {
      client.release();
    }
  },
  breakerOptions
);

// Monitoramento do circuit breaker
safeQuery.on('open', () => {
  console.error('🚨 [DB Circuit Breaker] ABERTO - muitas falhas detectadas');
});

safeQuery.on('halfOpen', () => {
  console.warn('⚠️ [DB Circuit Breaker] MEIO-ABERTO - testando recuperação');
});

safeQuery.on('close', () => {
  console.log('✅ [DB Circuit Breaker] FECHADO - sistema recuperado');
});

// Tratamento de erros do pool
pool.on('error', (err) => {
  console.error('❌ [DB Pool] Erro:', err.message);
});

// Configurar drizzle
export const db = drizzle({ 
  client: pool, 
  schema,
  logger: process.env.NODE_ENV !== 'production',
});

// Health check
setTimeout(async () => {
  try {
    await safeQuery.fire('SELECT 1', []);
    console.log('✅ [DB] Conexão inicial OK');
  } catch (error: any) {
    console.error('❌ [DB] Falha inicial:', error.message);
  }
}, 2000);
```

## DEPLOY NO RAILWAY

```bash
# 1. Instalar dependência do circuit breaker
npm install opossum

# 2. Commit das mudanças
git add server/db.ts package.json
git commit -m "fix: Aumentar pool DB e adicionar circuit breaker real"

# 3. Deploy
railway up
```

## MÉTRICAS ESPERADAS

### Antes
- ❌ Pool: 3-5 conexões
- ❌ Circuit breaker: "Too many authentication errors"
- ❌ Queries falhando com timeout de 10-15s
- ❌ Cache com 200+ mensagens presas

### Depois
- ✅ Pool: 10-15 conexões
- ✅ Circuit breaker real com monitoramento
- ✅ Timeout relaxado para 30s
- ✅ Mensagens processadas sem erro
- ✅ Performance melhorada 3-5x

## MONITORAMENTO

```bash
# Ver logs do Railway
railway logs

# Buscar por:
# ✅ "DB Circuit Breaker FECHADO"
# ✅ "Nova conexão estabelecida"
# ❌ "Circuit Breaker ABERTO" (não deveria aparecer mais)
```

## PRÓXIMOS PASSOS (Pós-Deploy)

1. **Executar migration de índices no Supabase**
2. **Otimizar RLS policies** (reduzir de 80+ para <20)
3. **Remover índices não utilizados** (50+)
4. **Monitorar métricas por 48h**

---
**Status**: PRONTO PARA IMPLEMENTAR
**Prioridade**: 🔴 CRÍTICA
**Tempo estimado**: 10 minutos
**Risco**: Baixo (apenas aumenta recursos)
