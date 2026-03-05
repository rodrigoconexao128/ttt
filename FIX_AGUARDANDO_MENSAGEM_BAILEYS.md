# 🔄 FIX: "Aguardando para carregar mensagem" (Waiting for Message)

## 📋 Problema
Clientes relataram que em alguns casos a IA não está respondendo. As imagens mostram a mensagem "Aguardando para carregar mensagem" no WhatsApp, que indica falha na decriptação/entrega da mensagem.

## 🔍 Diagnóstico
Após pesquisa no repositório oficial do Baileys (WhiskeySockets/Baileys), encontrei a Issue #1767 que documenta exatamente este problema:
- https://github.com/WhiskeySockets/Baileys/issues/1767

### Causa Raiz
O WhatsApp mostra "Aguardando para carregar mensagem" quando:
1. A mensagem falhou na decriptação Signal Protocol
2. O Baileys precisa fazer retry/reenvio mas não tem o conteúdo original
3. O cliente (iPhone principalmente) não consegue descriptografar

### Solução Oficial
Implementar a função `getMessage` na configuração do socket. Esta função é chamada pelo Baileys quando precisa reenviar uma mensagem que falhou:

```typescript
const sock = makeWASocket({
  getMessage: async (key) => {
    // Retornar mensagem do cache/banco
    return cachedMessage;
  }
});
```

## ✅ Implementação

### 1. Sistema de Cache de Mensagens
Criado um sistema global de cache em memória para armazenar todas as mensagens enviadas/recebidas:

```typescript
interface CachedMessage {
  message: proto.IMessage;
  timestamp: number;
}

const messageCache = new Map<string, Map<string, CachedMessage>>();
const MESSAGE_CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 horas
```

### 2. Funções de Cache
- `cacheMessage(userId, messageId, message)` - Armazena mensagem
- `getCachedMessage(userId, messageId)` - Recupera mensagem
- Limpeza automática a cada 30 minutos (remove mensagens expiradas)

### 3. Integração com makeWASocket
Todos os 3 pontos onde `makeWASocket` é chamado foram atualizados:

1. **Conexão principal** (`connectWhatsApp`)
2. **Conexão admin** (`connectAdminWhatsApp`)  
3. **Conexão via pairing code** (`requestClientPairingCode`)

Cada um agora inclui:
```typescript
const sock = makeWASocket({
  auth: {
    creds: state.creds,
    keys: makeCacheableSignalKeyStore(state.keys, logger),
  },
  getMessage: async (key) => {
    // 1. Tentar cache em memória
    const cached = getCachedMessage(userId, key.id);
    if (cached) return cached;
    
    // 2. Fallback: buscar do banco de dados
    const dbMessage = await storage.getMessageByMessageId(key.id);
    if (dbMessage?.text) {
      return { conversation: dbMessage.text };
    }
    
    return undefined;
  },
});
```

### 4. Cacheamento Automático
Todas as mensagens são cacheadas automaticamente:

- **Envio** (`internalSendMessageRaw`): Cacheia após enviar
- **Recebimento** (`messages.upsert`): Cacheia ao receber

## 🛡️ Benefícios Adicionais

1. **makeCacheableSignalKeyStore**: Otimiza operações de chave Signal Protocol
2. **Limpeza automática**: Evita consumo excessivo de memória
3. **Fallback para banco**: Se não estiver no cache, busca do Supabase

## 📊 Logs de Diagnóstico

O sistema registra logs detalhados:
```
📦 [MSG CACHE] Armazenada mensagem ABC123 para user fb67...
🔄 [getMessage] Baileys solicitou mensagem ABC123 para retry
✅ [MSG CACHE] Mensagem ABC123 recuperada do cache para retry
⚠️ [MSG CACHE] Mensagem XYZ789 NÃO encontrada no cache
🧹 [MSG CACHE] Limpeza periódica: 15 mensagens expiradas removidas
```

## 📅 Data
Implementado em: 14 de Janeiro de 2026

## 🔗 Referências
- [Baileys Issue #1767](https://github.com/WhiskeySockets/Baileys/issues/1767)
- [Baileys README - getMessage](https://github.com/WhiskeySockets/Baileys#improve-retry-system--decrypt-poll-votes)
- [Solução de @PeterBaptista](https://github.com/WhiskeySockets/Baileys/issues/1767#issuecomment-2456789)
