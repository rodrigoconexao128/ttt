# 🛡️ Sistema Anti-Bloqueio WhatsApp - Documentação

## Visão Geral

Este sistema implementa proteção contra bloqueio do WhatsApp através de:

1. **Fila de mensagens POR WHATSAPP** - Cada conexão WhatsApp tem sua própria fila independente
2. **Delay de 5-10 segundos** entre mensagens do mesmo WhatsApp
3. **Variação automática de palavras/sinônimos** para evitar padrões detectáveis
4. **Priorização inteligente** - Respostas de IA têm prioridade sobre envios em massa

## Arquitetura

```
┌─────────────────────────────────────────────────────────────────────┐
│                    MessageQueueService                              │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐        │
│  │  WhatsApp A    │  │  WhatsApp B    │  │  WhatsApp C    │  ...   │
│  │  (userId: 123) │  │  (userId: 456) │  │  (userId: 789) │        │
│  │  ┌──────────┐  │  │  ┌──────────┐  │  │  ┌──────────┐  │        │
│  │  │ Fila     │  │  │  │ Fila     │  │  │  │ Fila     │  │        │
│  │  │ [msg1]   │  │  │  │ [msg1]   │  │  │  │ [msg1]   │  │        │
│  │  │ [msg2]   │  │  │  │ [msg2]   │  │  │  │ [msg2]   │  │        │
│  │  │ [msg3]   │  │  │  │          │  │  │  │ [msg3]   │  │        │
│  │  └──────────┘  │  │  └──────────┘  │  │  └──────────┘  │        │
│  │  Delay: 5-10s  │  │  Delay: 5-10s  │  │  Delay: 5-10s  │        │
│  └────────────────┘  └────────────────┘  └────────────────┘        │
└─────────────────────────────────────────────────────────────────────┘
```

## Pontos de Integração

O sistema anti-bloqueio está integrado em **TODOS** os pontos de envio:

### 1. Respostas da IA (`processAccumulatedMessages`)
- Prioridade: **HIGH**
- Variação: Aplicada automaticamente
- Local: `server/whatsapp.ts`

### 2. Envio Manual (`sendMessage`)
- Prioridade: **HIGH** (mensagens do dono)
- Variação: Aplicada automaticamente
- Local: `server/whatsapp.ts`

### 3. Follow-up (`userFollowUpService`)
- Prioridade: **NORMAL**
- Variação: Aplicada automaticamente
- Local: Via callback em `server/routes.ts`

### 4. Envio em Massa (`sendBulkMessages`, `sendBulkMessagesAdvanced`)
- Prioridade: **LOW**
- Variação: Aplicada automaticamente (ou skip se IA já variou)
- Local: `server/whatsapp.ts`

### 5. Envio para Grupos (`sendMessageToGroups`)
- Prioridade: **LOW**
- Variação: Aplicada automaticamente
- Local: `server/whatsapp.ts`

## Variação de Mensagens

O sistema substitui palavras por sinônimos de forma inteligente:

### Dicionário de Sinônimos

| Palavra Original | Variações |
|-----------------|-----------|
| olá | oi, e aí, hey, eae |
| obrigado | valeu, agradeço, muito obrigado, vlw |
| sim | claro, com certeza, isso mesmo, positivo |
| agora | neste momento, no momento, atualmente |
| gostaria | queria, adoraria, preciso, necessito |
| pode | consegue, seria possível, poderia, dá pra |
| ... | (50+ palavras no dicionário) |

### Tipos de Variação

1. **Sinônimos** (70% de chance por palavra)
2. **Pontuação** (30% de chance) - `!` → `.`, `?` → `??`
3. **Emojis** (40% de chance) - 😊 → 🙂, 👍 → ✅
4. **Capitalização** (10% de chance) - lowercase inicial

## Prioridades da Fila

```
┌─────────────────────────────────────┐
│  HIGH (0)    │ Respostas IA        │
│              │ Mensagens do dono   │
├──────────────┼─────────────────────┤
│  NORMAL (1)  │ Follow-ups          │
├──────────────┼─────────────────────┤
│  LOW (2)     │ Envio em massa      │
│              │ Grupos              │
└──────────────┴─────────────────────┘
```

## Configurações

```typescript
// server/messageQueueService.ts
private readonly MIN_DELAY_MS = 5000;  // 5 segundos mínimo
private readonly MAX_DELAY_MS = 10000; // 10 segundos máximo
private readonly VARIATION_PROBABILITY = 0.7; // 70% chance de variar palavra
```

## API de Monitoramento

### GET /api/health

Inclui estatísticas do sistema anti-bloqueio:

```json
{
  "status": "healthy",
  "antiBlock": {
    "totalQueues": 3,
    "queues": {
      "abc123": {
        "queueLength": 2,
        "isProcessing": true,
        "totalSent": 150,
        "totalErrors": 2,
        "lastSentAt": "2026-01-11T15:30:00.000Z"
      }
    }
  }
}
```

## Fluxo de Envio

```
[Requisição de Envio]
        │
        ▼
[messageQueueService.enqueue()]
        │
        ├── Inicializa fila do usuário (se não existir)
        │
        ├── Aplica variação de texto (sinônimos, pontuação, etc)
        │
        ├── Insere na fila por prioridade
        │
        └── Retorna Promise
        
[Processamento da Fila]
        │
        ├── Verifica delay desde última mensagem
        │
        ├── Aguarda 5-10s se necessário
        │
        ├── Envia mensagem via socket.sendMessage
        │
        └── Resolve Promise com resultado
```

## Regras Importantes

1. **POR WHATSAPP**: O delay de 5-10s é POR WHATSAPP conectado, não global
   - WhatsApp A pode enviar enquanto WhatsApp B está em delay
   
2. **NUNCA no mesmo segundo**: O sistema garante que nunca duas mensagens saem no mesmo segundo do mesmo WhatsApp

3. **Variação obrigatória**: Mesmo mensagens predefinidas terão palavras variadas

4. **Prioridade respeitada**: Se houver resposta de IA na fila, ela passa na frente de envios em massa

## Logs

O sistema gera logs detalhados com prefixo `🛡️ [ANTI-BLOCK]`:

```
🛡️ [ANTI-BLOCK] Mensagem enfileirada para abc123...
   📊 Fila: 3 | Prioridade: high
   📝 Original: "Olá, como posso ajudar?"
   🔄 Variado: "Oi, como posso te ajudar?"

🛡️ [ANTI-BLOCK] Aguardando 7.3s antes de enviar (userId: abc123...)

🛡️ [ANTI-BLOCK] ✅ Mensagem enviada - ID: 3EB0...
```

## Manutenção

### Limpeza Automática
- Filas sem atividade por 30 minutos são removidas automaticamente

### Monitoramento
- Endpoint `/api/health` mostra status de todas as filas
- Logs detalhados no console do servidor

## Deploy

O sistema está integrado e é deployado automaticamente com o projeto principal via Railway.

---

**Última atualização**: Janeiro 2026
**Versão**: 1.0.0
