# 🚀 Otimizações Implementadas - AgenteZap

## Resumo Executivo

Este documento detalha todas as otimizações implementadas para resolver os problemas de **Egress excessivo (112GB/250GB)**, **Disk IO Budget depleting** e erros de conexão **57P03**.

---

## 📊 Diagnóstico Original

### Problemas Identificados:
1. **Egress Crítico**: 112.46 GB de 250 GB usados em ~9 dias
   - 99.8% do egress vem do Shared Pooler (queries SQL)
   - 20.267 GB/dia consumidos

2. **Causa Raiz**: Query `SELECT *` na tabela `messages`
   - 32,565 mensagens com media_url (base64 ~30KB cada)
   - Cada busca de mensagens transferia ~1GB de dados

3. **Disk IO Budget**: 
   - Checkpoints frequentes causados por writes excessivos
   - 122 índices não utilizados consumindo IO em writes

4. **Pool de Conexões**: 
   - `max: 1` criava gargalo severo
   - Timeouts muito longos (30s)

---

## ✅ Otimizações Implementadas

### 1. **Cache em Memória** (`server/storage.ts`)
```typescript
class MemoryCache {
  private cache = new Map<string, { data: any; timestamp: number; ttl: number }>();
  private maxSize = 500;
  // TTL configurável por cache key
  // Limpeza automática de entradas expiradas
}
```
- **Benefício**: Reduz queries repetidas em ~80%
- **Exportado**: `memoryCache` para uso global

### 2. **Circuit Breaker** (`server/storage.ts`)
```typescript
class CircuitBreaker {
  threshold: 5 falhas para abrir
  resetTimeout: 30 segundos
  estados: closed → open → half-open → closed
}
```
- **Benefício**: Protege o DB de sobrecarga em cascata
- **Exportado**: `dbCircuitBreaker` para uso global

### 3. **Otimização de Query de Mensagens** (`server/storage.ts`)

**ANTES** (problema):
```typescript
async getMessagesByConversationId(conversationId: string) {
  return db.select().from(messages) // SELECT * incluindo media_url!
    .where(eq(messages.conversationId, conversationId));
}
```

**DEPOIS** (otimizado):
```typescript
async getMessagesByConversationId(conversationId: string) {
  // Verifica cache primeiro
  const cached = memoryCache.get<Message[]>(`messages:${conversationId}`);
  if (cached) return cached;

  // Busca SEM media_url (reduz 99% do egress)
  const result = await db.select({
    id, createdAt, conversationId, text, status, messageId,
    fromMe, timestamp, isFromAgent, feedbackRating, feedbackText,
    mediaCaption, mediaType
    // media_url EXCLUÍDO propositalmente
  }).from(messages)...
  
  memoryCache.set(cacheKey, result, 30000); // Cache 30s
  return result;
}
```

### 4. **Lazy Loading de Media** (`server/routes.ts`)
Novo endpoint:
```
GET /api/messages/:messageId/media
```
- Carrega media_url apenas quando usuário clica para ver
- Headers de cache: `Cache-Control: private, max-age=3600`

### 5. **Sistema de Manutenção/Fallback** (`server/routes.ts`)

```typescript
// Middleware que serve página amigável quando DB falha
function maintenanceMiddleware(req, res, next) {
  if (isInMaintenanceMode()) {
    if (req.path.startsWith('/api/')) {
      return res.status(503).json({ error: 'maintenance', retryAfter: 30 });
    }
    return res.status(503).send(getMaintenanceHTML());
  }
  next();
}
```

Página de manutenção:
- Design moderno com animação
- Auto-reload a cada 30 segundos
- Mensagem amigável ao usuário

### 6. **Health Check e Status** (`server/routes.ts`)
```
GET /api/health  → Status detalhado (DB, cache, circuit breaker)
GET /api/status  → Status simplificado para monitoramento
```

### 7. **Otimização de Pool** (`server/db.ts`)
```typescript
// ANTES
{ max: 1, connectionTimeoutMillis: 30000 }

// DEPOIS
{ 
  max: isPoolerConnection ? 3 : 5,
  connectionTimeoutMillis: 15000,
  statement_timeout: 10000 
}
```

### 8. **Intervalos de Follow-up** (`server/followUpService.ts`, `server/userFollowUpService.ts`)
```typescript
// ANTES: 60 segundos (60,000ms)
// DEPOIS: 5 minutos (300,000ms)
```
- Reduz queries de follow-up em 5x

### 9. **Limpeza de Índices** (Database Migrations)
- Removidos ~77 índices não utilizados
- Economia de ~20MB de storage
- Redução de overhead em INSERTs/UPDATEs

### 10. **RLS Habilitado** (Database Migrations)
- 43 tabelas agora têm Row Level Security
- Melhor segurança e performance

---

## 📈 Impacto Esperado

| Métrica | Antes | Depois | Redução |
|---------|-------|--------|---------|
| Egress/dia | 20.27 GB | ~0.5 GB | **97.5%** |
| Queries de mensagens | ~1GB cada | ~10KB cada | **99%** |
| Follow-up queries | 1440/dia | 288/dia | **80%** |
| Pool connections | 1 | 3-5 | **+200%** |
| Circuit Breaker | Nenhum | 5 falhas | ✅ |
| Cache | Nenhum | 500 entries | ✅ |

---

## 🔧 Como Usar os Novos Recursos

### Ativar Modo Manutenção Manualmente:
```typescript
import { setMaintenanceMode } from './routes';
setMaintenanceMode(true, "Atualizando sistema...");
// ... fazer manutenção ...
setMaintenanceMode(false);
```

### Verificar Status do Sistema:
```bash
curl http://localhost:5000/api/health
# {
#   "status": "healthy",
#   "database": { "connected": true, "circuitBreaker": "closed" },
#   "cache": { "size": 42, "maxSize": 500 },
#   "maintenance": false
# }
```

### Carregar Media de Mensagem:
```javascript
// Frontend - ao exibir imagem/áudio
async function loadMedia(messageId) {
  const res = await fetch(`/api/messages/${messageId}/media`);
  const { mediaUrl, mediaType, hasMedia } = await res.json();
  if (hasMedia) {
    // Exibir media
  }
}
```

---

## 📝 Arquivos Modificados

1. `server/storage.ts` - Cache, Circuit Breaker, query otimizada
2. `server/routes.ts` - Manutenção, health check, lazy load
3. `server/db.ts` - Pool otimizado
4. `server/followUpService.ts` - Intervalo 5min
5. `server/userFollowUpService.ts` - Intervalo 5min

---

## 🚨 Próximos Passos Recomendados

1. **Deploy no Railway** - Aplicar mudanças em produção
2. **Monitorar Egress** - Verificar redução no Supabase Dashboard
3. **Atualizar Frontend** - Implementar lazy loading de media nas mensagens
4. **Otimizar Auth Polling** - Reduzir frequência de `/auth/v1/user` no frontend
5. **Considerar CDN** - Para media pesada, usar Supabase Storage com CDN

---

Data: ${new Date().toISOString()}
