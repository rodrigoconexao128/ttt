# 🛡️ Sistema Anti-Bloqueio: Fila Universal de Mensagens

## 📋 Resumo
Implementação de sistema de fila centralizado que garante delay de **5-10 segundos** entre TODAS as mensagens enviadas pelo mesmo WhatsApp, independente da origem (IA, manual, mídia, admin, etc.).

## 🔧 Arquitetura

### messageQueueService (Central)
Localização: `server/messageQueueService.ts`

```typescript
// Métodos principais:
- waitForTurn(userId, description): Aguarda vez na fila
- markMediaSent(userId): Marca mensagem como enviada
- executeWithDelay(userId, description, sendFn): Wrapper completo
```

### sendWithQueue (Helper)
Localização: `server/whatsapp.ts`

```typescript
async function sendWithQueue<T>(
  queueId: string,      // userId para usuários, "ADMIN_AGENT" para admin
  description: string,   // Log description
  sendFn: () => Promise<T>
): Promise<T>
```

## 📍 Locais Corrigidos

### 1. whatsapp.ts (40+ locais)
- ✅ Admin Agent respostas de texto
- ✅ Admin Agent notificações de pagamento  
- ✅ Admin Agent mídias (imagem, áudio, vídeo, documento)
- ✅ Admin Agent desconexão
- ✅ Código de pareamento (pairing code)
- ✅ QR Code envio
- ✅ sendAdminConversationMessage
- ✅ sendAdminDirectMessage
- ✅ sendAdminMediaMessage
- ✅ sendUserMediaMessage
- ✅ NOTIFY notifications
- ✅ Media handler responses
- ✅ Welcome credentials message
- ✅ sendAdminMessage (texto e mídias)

### 2. mediaService.ts
- ✅ sendMediaViaBaileys (imagem, vídeo, documento)
- ✅ sendAudioWithFallback (múltiplas estratégias)
- ✅ markMediaSent após cada envio

### 3. routes.ts
- ✅ Endpoint `/api/debug/send-audio`

### 4. appointmentReminderService.ts
- ✅ Lembretes de agendamento
- ✅ Confirmações de agendamento
- ✅ Cancelamentos de agendamento

## 🔄 Filas por Canal

Cada WhatsApp tem sua própria fila identificada por:

| Tipo | Queue ID |
|------|----------|
| Usuários | `userId` (UUID) |
| Admin Agent | `"ADMIN_AGENT"` |
| Sessões Admin | `"admin_" + adminId` |

## 📊 Logs de Monitoramento

```
🛡️ [ANTI-BLOCK] Mensagem enfileirada para d87308a1...
   📊 Fila: 1 | Prioridade: high
🛡️ [ANTI-BLOCK] Aguardando 8.6s antes de enviar (userId: d87308a1...)
🛡️ [ANTI-BLOCK] 📤 Enviando mensagem para 5521968908287@s...
🛡️ [ANTI-BLOCK] ✅ Mensagem enviada - ID: 3EB03A625BF5B86B98EA2B
```

## 🎯 Garantias

1. **Nenhum envio simultâneo** - Todas as mensagens passam pela fila
2. **Delay de 5-10s** - Intervalo humanizado entre mensagens
3. **Por canal WhatsApp** - Cada conexão tem sua própria fila
4. **Resiliência** - Mesmo em erro, libera fila para próxima mensagem

## 🧪 Verificação

```bash
# Ver logs anti-bloqueio em tempo real
railway logs | grep "ANTI-BLOCK"
```

## 📅 Data da Implementação
- **Data**: Janeiro 2025
- **Deploy**: Railway (ad92eb6d-31d4-45b2-9b78-56898787e384)
- **Projeto**: AgentZap - Sistema de IA para WhatsApp
