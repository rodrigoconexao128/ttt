# 🔄 Auto-Reativação de IA - Nova Funcionalidade

## Resumo

Implementação da funcionalidade de **auto-reativação da IA** após pausa manual. Quando o dono do WhatsApp responde manualmente a um cliente, a IA é pausada automaticamente. Com esta nova funcionalidade, é possível configurar um timer para que a IA volte a responder automaticamente caso o dono não continue a conversa.

## Funcionalidades

### Timer de Auto-Reativação
- **Opções pré-definidas**: 10 min, 30 min, 1 hora, 2 horas
- **Opção "Nunca"**: Comportamento atual (manual only)
- **Custom**: Permite definir qualquer tempo em minutos

### Lógica de Funcionamento
1. Dono envia mensagem → IA pausada com timestamp
2. Cliente envia mensagem → Marcado como "pendente"
3. Timer expira sem resposta do dono → IA reativada automaticamente
4. IA lê o contexto da conversa e responde à mensagem pendente
5. Se dono responder novamente → Timer resetado

## Arquivos Modificados

### Backend
- `server/storage.ts` - Novos métodos para gerenciar auto-reativação
- `server/whatsapp.ts` - Integração com o sistema de pausa
- `server/autoReactivateService.ts` - **NOVO** - Serviço de background
- `server/index.ts` - Inicialização do serviço

### Frontend
- `client/src/components/agent-studio-unified.tsx` - UI do timer
- `client/src/pages/my-agent.tsx` - UI do timer

### Database
- `shared/schema.ts` - Novos campos no schema
- `migrations/0061_add_auto_reactivate_timer.sql` - Migration

## Schema Changes

### Tabela: `ai_agent_config`
```sql
auto_reactivate_minutes integer DEFAULT NULL
```
- `NULL` = nunca auto-reativar (manual only)
- `10, 30, 60, 120, etc` = minutos para auto-reativar

### Tabela: `agent_disabled_conversations`
```sql
owner_last_reply_at timestamp DEFAULT NOW()
auto_reactivate_after_minutes integer DEFAULT NULL
client_has_pending_message boolean DEFAULT false
client_last_message_at timestamp DEFAULT NULL
```

## Como Usar

1. Acesse **Meu Agente IA** > **Config**
2. Em **Pausar IA ao Responder**, ative o switch
3. Selecione o tempo de auto-reativação desejado:
   - **Nunca**: Comportamento padrão (manual)
   - **10 min - 2 horas**: Timer automático
   - **Custom**: Digite qualquer tempo
4. Salve as configurações

## Cenários de Teste

| Cenário | Comportamento Esperado |
|---------|----------------------|
| Dono responde, timer 10min, cliente envia em 5min | IA aguarda até 10min |
| Dono responde, timer 10min, sem mensagem do cliente | IA NÃO reativa (não há pendência) |
| Dono responde 2x dentro do timer | Timer resetado cada vez |
| Timer "Nunca" | Comportamento atual (manual only) |
| IA reativada por timer | Lê contexto e responde à mensagem pendente |

## Serviço de Background

O `autoReactivateService` executa a cada 30 segundos verificando:
1. Conversas pausadas com timer configurado
2. Se timer expirou (now > ownerLastReplyAt + autoReactivateAfterMinutes)
3. Se cliente tem mensagem pendente

Quando encontra conversas elegíveis:
1. Remove da tabela de desabilitados
2. Dispara resposta da IA
3. Notifica frontend via WebSocket

---
*Implementado em: 08/01/2026*
