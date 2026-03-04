# 🚨 Sistema de Recuperação de Mensagens Pendentes

## Problema Resolvido
Mensagens de clientes (especialmente vindos de anúncios Meta) que não estavam chegando durante:
- Atualizações/deploys no Railway
- Instabilidade de conexão WhatsApp
- Mensagens mostrando "Carregando..." no WhatsApp

**Clientes afetados:**
- jefersonlv26@gmail.com
- marcelomarquesterapeuta@gmail.com
- rodrigo4@gmail.com

## Solução Implementada

### 📊 Melhorias Baseadas em Melhores Práticas (v2.0)

**Referências:**
- AWS Architecture Blog: [Exponential Backoff and Jitter](https://aws.amazon.com/blogs/architecture/exponential-backoff-and-jitter/)
- Microsoft Azure: [Retry Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/retry)
- Microsoft Azure: [Circuit Breaker Pattern](https://docs.microsoft.com/en-us/azure/architecture/patterns/circuit-breaker)

**Implementado:**
1. **Exponential Backoff com Full Jitter (AWS)** - Em vez de delay fixo, usa `random(0, min(cap, base * 2^attempt))`
2. **Circuit Breaker (Microsoft)** - Para processamento após 5 falhas consecutivas, aguarda 60s antes de tentar novamente
3. **Idempotência** - Usa `whatsapp_message_id` como chave única para evitar reprocessamento
4. **Save-First Pattern** - Salva ANTES de processar para garantir que nunca perde mensagem

### 1. Tabelas no Supabase (Projeto: bnfpcuzjvycudccycqqt)

```sql
-- Mensagens pendentes de processamento
pending_incoming_messages
  - id (UUID)
  - user_id (referência ao usuário)
  - connection_id (conexão WhatsApp)
  - whatsapp_message_id (ID único da mensagem - UNIQUE)
  - remote_jid (JID do contato)
  - contact_number (número do contato)
  - push_name (nome do contato)
  - message_content (texto da mensagem)
  - message_type (text, image, audio, etc)
  - raw_message (JSON completo para reprocessamento)
  - status (pending, processing, processed, failed, skipped)
  - process_attempts (contador de tentativas)
  - expires_at (48h após recebimento)

-- Log de saúde da conexão
connection_health_log
  - id (UUID)
  - user_id
  - connection_id
  - event_type (connected, disconnected, reconnecting, etc)
  - event_details (JSON)
  - messages_pending (contador)
  - messages_recovered (contador)
```

### 2. Serviço TypeScript

Arquivo: `server/pendingMessageRecoveryService.ts`

**Configurações (Best Practices):**
```typescript
CONFIG = {
  MAX_PROCESS_ATTEMPTS: 3,
  BASE_DELAY_MS: 1000,        // Base para exponential backoff
  MAX_DELAY_MS: 32000,        // Cap máximo
  JITTER_FACTOR: 1.0,         // Full Jitter (AWS recomendado)
  CIRCUIT_BREAKER_THRESHOLD: 5,   // Falhas para abrir
  CIRCUIT_BREAKER_RESET_MS: 60000, // Tempo para half-open
  POST_CONNECT_DELAY_MS: 15000,    // Espera após conexão
}
```

**Funcionalidades:**
- `saveIncomingMessage()` - Salva mensagem IMEDIATAMENTE ao receber do Baileys
- `markAsProcessed()` - Marca mensagem como processada com sucesso
- `markAsFailed()` - Marca falhas com contador de tentativas
- `startMessageRecovery()` - Inicia recuperação após conexão estabilizar
- `logConnectionDisconnection()` - Registra eventos de desconexão
- `calculateBackoffWithJitter()` - Calcula delay com exponential backoff + jitter
- `checkCircuitBreaker()` - Verifica se pode processar (circuit breaker)
- `onProcessingSuccess()` / `onProcessingFailure()` - Atualiza estado do circuit breaker

### 3. Integração no whatsapp.ts

**Pontos de integração:**

1. **`messages.upsert`** (linha ~2450)
   - Salva mensagem na tabela `pending_incoming_messages` ANTES de processar
   
2. **`handleIncomingMessage`** (linha ~3394)
   - Marca mensagem como processada após salvar no banco principal

3. **`connection.update` - conn === "open"** (linha ~2370)
   - Inicia recuperação de mensagens pendentes após conexão estabilizar

4. **`connection.update` - conn === "close"** (linha ~2230)
   - Registra evento de desconexão no log de saúde

5. **Final do arquivo** (linha ~7074)
   - Registra o `messageProcessor` callback para reprocessamento

## Fluxo de Recuperação

```
MENSAGEM CHEGA
     ↓
[1] Salva em pending_incoming_messages (status: pending)
     ↓
[2] Tenta processar normalmente
     ↓
[3a] SUCESSO → marca como processed
[3b] FALHA → permanece pending (até 3 tentativas)
     ↓
CONEXÃO RECONECTA
     ↓
[4] Aguarda 15 segundos (estabilização)
     ↓
[5] Busca mensagens pending
     ↓
[6] Reprocessa cada uma com handleIncomingMessage
     ↓
[7] Marca como processed ou failed
```

## Configurações

```typescript
const CONFIG = {
  MAX_PROCESS_ATTEMPTS: 3,      // Máximo de tentativas
  RECOVERY_DELAY_MS: 2000,      // Delay entre mensagens no recovery
  MAX_MESSAGES_PER_CYCLE: 50,   // Máximo de mensagens por ciclo
  CLEANUP_INTERVAL_MS: 30min,   // Limpeza de expirados
  POST_CONNECT_DELAY_MS: 15s,   // Aguardar após conexão
};
```

## Deploy

O projeto está no Railway:
- **Projeto:** handsome-mindfulness
- **Serviço:** vvvv
- **Deploy:** Automático via git push

Para deploy manual:
```bash
cd vvvv
railway up
```

## Monitoramento

Estatísticas disponíveis via:
```typescript
import { getRecoveryStats, getRecoveryStatsForUser } from './pendingMessageRecoveryService';

// Stats globais
getRecoveryStats();
// → { totalSaved, totalRecovered, totalFailed, totalSkipped, usersProcessing, lastCleanup }

// Stats por usuário
await getRecoveryStatsForUser(userId);
// → { pending, processed, failed, oldest_pending }
```

## Logs

Procure por `🚨 [RECOVERY]` nos logs do Railway para monitorar:
- Mensagens salvas
- Recuperações iniciadas
- Falhas de processamento
- Eventos de conexão
