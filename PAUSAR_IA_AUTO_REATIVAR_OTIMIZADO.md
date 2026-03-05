# 🔄 Auto-Reativação de IA - Documentação Completa

## 📋 Visão Geral

A funcionalidade **"Pausar IA ao Responder"** com **auto-reativação temporizada** permite que a IA seja automaticamente pausada quando o dono do negócio responde manualmente, e depois reativada após um tempo configurável se o dono não continuar a conversa.

## 🎯 Fluxo de Funcionamento

```
┌─────────────────────────────────────────────────────────────────┐
│                     FLUXO DE AUTO-REATIVAÇÃO                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  1. Cliente envia mensagem                                      │
│         │                                                       │
│         ▼                                                       │
│  2. IA responde (se ativada)                                   │
│         │                                                       │
│         ▼                                                       │
│  3. OWNER envia mensagem manual                                │
│         │                                                       │
│         ├──► IA PAUSADA para esta conversa                     │
│         │    ├─ ownerLastReplyAt = NOW()                       │
│         │    └─ autoReactivateAfterMinutes = config            │
│         │                                                       │
│         ▼                                                       │
│  4. Cliente responde novamente                                 │
│         │                                                       │
│         ├──► clientHasPendingMessage = true                    │
│         │                                                       │
│         ▼                                                       │
│  5. Timer expira E owner não respondeu?                        │
│         │                                                       │
│         ├─ SIM ──► IA REATIVADA automaticamente               │
│         │          └─ Responde mensagem pendente               │
│         │                                                       │
│         └─ NÃO ──► Mantém pausada                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## ⚙️ Configuração

### No Frontend (Agent Studio)
- **Pausar IA ao Responder**: Toggle para ativar/desativar
- **Timer de Reativação**: Opções disponíveis
  - `Nunca` (null) - IA permanece pausada até ativação manual
  - `10 min` - Reativa após 10 minutos
  - `30 min` - Reativa após 30 minutos
  - `1h` - Reativa após 1 hora
  - `2h` - Reativa após 2 horas
  - `Personalizado` - Valor customizado em minutos

### No Banco de Dados
Tabela `ai_agent_config`:
- `pause_on_manual_reply` (boolean) - Se pausa ao responder manualmente
- `auto_reactivate_minutes` (integer, nullable) - Minutos até auto-reativar

Tabela `agent_disabled_conversations`:
- `conversation_id` - ID da conversa pausada
- `owner_last_reply_at` - Quando o owner respondeu
- `auto_reactivate_after_minutes` - Timer configurado
- `client_has_pending_message` - Se cliente enviou msg após pausa
- `client_last_message_at` - Quando cliente enviou última msg

## 🔥 Otimizações Implementadas

### 1. Query 100% SQL (Redução de Egress)
```sql
-- ANTES (problemático): Carregava TODOS os registros e filtrava em JS
SELECT * FROM agent_disabled_conversations
WHERE auto_reactivate_after_minutes IS NOT NULL...

-- DEPOIS (otimizado): Filtra direto no PostgreSQL
SELECT conversation_id, client_last_message_at
FROM agent_disabled_conversations
WHERE 
  auto_reactivate_after_minutes IS NOT NULL
  AND client_has_pending_message = true
  AND owner_last_reply_at + (auto_reactivate_after_minutes || ' minutes')::interval <= NOW()
LIMIT 10
```

### 2. Índice Parcial Otimizado
```sql
CREATE INDEX idx_agent_disabled_auto_reactivate 
ON agent_disabled_conversations (
  auto_reactivate_after_minutes,
  client_has_pending_message,
  owner_last_reply_at
) 
WHERE auto_reactivate_after_minutes IS NOT NULL 
  AND client_has_pending_message = true;
```

### 3. Polling Inteligente (Economia de Recursos)
| Situação | Intervalo | Razão |
|----------|-----------|-------|
| Timers ativos | 30s | Resposta rápida necessária |
| Nenhum timer pendente | 5min | Economia de recursos |
| Nenhum timer configurado | 10min | Modo idle |

### 4. EXISTS Check Antes de Query Pesada
```sql
-- Verifica rapidamente SE há algo para processar
SELECT EXISTS (
  SELECT 1 FROM agent_disabled_conversations
  WHERE ... LIMIT 1
) as has_pending
```

### 5. Batch Processing (LIMIT 10)
- Processa máximo 10 conversas por ciclo
- Evita sobrecarga do sistema
- Distribui carga ao longo do tempo

## 📊 Métricas de Performance

| Métrica | Antes | Depois | Melhoria |
|---------|-------|--------|----------|
| Dados por query | ~1058 registros | Máx 10 registros | ~99% |
| Tempo de query | Variável | ~14ms | Consistente |
| Queries/hora (idle) | 120 | 6-12 | ~90% |
| Uso de índice | Não | Sim | ✅ |

## 🔗 Arquivos Modificados

### Backend
- `server/autoReactivateService.ts` - Serviço de auto-reativação
- `server/storage.ts` - Métodos de banco de dados
- `server/whatsapp.ts` - Integração com WhatsApp

### Frontend
- `client/src/pages/agent-studio-unified.tsx` - UI de configuração
- `client/src/pages/my-agent.tsx` - UI de configuração (alternativa)

### Banco de Dados
- `migrations/0061_add_auto_reactivate_timer.sql` - Novos campos
- `migrations/0062_add_auto_reactivate_index.sql` - Índice otimizado

## 🧪 Testando

### Script de Teste
```bash
cd vvvv
npx tsx test-auto-reactivate.ts
```

### Verificações Manuais
1. Ative "Pausar IA ao Responder" com timer de 10min
2. Envie mensagem como owner (IA será pausada)
3. Simule mensagem do cliente (pendente será marcado)
4. Aguarde 10min - IA deve reativar e responder

## 📝 Logs para Debug

```
⏰ [AUTO-REACTIVATE] Iniciando serviço otimizado (intervalo inicial: 300s)
⏰ [AUTO-REACTIVATE] Intervalo ajustado: 300s → 30s (2 timers ativos)
⏰ [AUTO-REACTIVATE] Processando 1 conversas
🔄 [AUTO-REACTIVATE] Reativando IA para conversa abc123 (João Silva)
✅ [AUTO-REACTIVATE] IA reativada e respondendo para abc123: success
```

## 🚀 Deploy

As otimizações são transparentes e não requerem mudanças no processo de deploy atual. O índice já foi criado via migration.

---

**Última atualização:** Janeiro 2026
**Autor:** GitHub Copilot (Claude Opus 4.5)
