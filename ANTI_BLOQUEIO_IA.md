# 🛡️ Sistema Anti-Bloqueio WhatsApp - AgenteZap

## 📋 Visão Geral

Sistema de proteção contra bloqueio do WhatsApp implementado para garantir comunicação segura e natural.

## ✨ Funcionalidades Implementadas

### 1. 🕐 Sistema de Fila por WhatsApp
- **Delay de 5-10 segundos** entre mensagens do MESMO WhatsApp
- Múltiplos WhatsApps podem enviar simultaneamente
- Sistema de prioridade (high/normal/low)

### 2. 🤖 Variação de Mensagens com IA (Mistral)
- **A variação é feita pela própria IA Mistral, NÃO por substituição automática de dicionário**
- Mantém 100% do sentido original
- Varia palavras, estrutura e tom de forma natural
- Evita repetição de variações já usadas
- Cache inteligente para economizar chamadas à API

### 3. 📊 Estatísticas e Monitoramento
- Endpoint `/api/health` retorna stats do anti-bloqueio
- Logs detalhados de cada mensagem
- Histórico de variações para evitar repetição

## 📁 Arquivos Criados/Modificados

### Novos Arquivos:
- `server/messageQueueService.ts` - Serviço principal de fila
- `server/messageHumanizer.ts` - Humanizador de mensagens com IA Mistral
- `test-humanizer.ts` - Script de teste do humanizador
- `test-humanizer-isolated.ts` - Teste isolado
- `test-mistral-simple.mjs` - Teste simplificado

### Modificados:
- `server/whatsapp.ts` - Integração do sistema de fila
- `server/routes.ts` - Stats no endpoint /api/health

## 🔧 Como Funciona

### Fluxo de Mensagens:
```
Mensagem Original → messageQueueService.enqueue()
                          ↓
                   humanizeMessageWithAI()
                          ↓
                   [Cache ou Mistral API]
                          ↓
                   Mensagem Humanizada
                          ↓
                   [Aguarda delay 5-10s]
                          ↓
                   sendMessageRaw()
```

### Sistema de Prioridade:
- **HIGH**: Respostas da IA, mensagens manuais
- **NORMAL**: Follow-ups
- **LOW**: Bulk messages, grupos

## 🧪 Testes

Execute o teste do humanizador:
```bash
npx tsx test-humanizer.ts
```

## ⚙️ Configurações

### Delays (messageQueueService.ts):
```typescript
MIN_DELAY_MS = 5000  // 5 segundos mínimo
MAX_DELAY_MS = 10000 // 10 segundos máximo
```

### Humanizador (messageHumanizer.ts):
```typescript
CACHE_TTL_MS = 30 * 60 * 1000 // Cache de 30 minutos
```

## 📝 Notas Importantes

1. **A variação é feita pela IA Mistral**, não por dicionário automático
2. **O sentido nunca é perdido** - a IA entende o contexto
3. **Mensagens curtas (<20 chars)** não são humanizadas
4. **Cache inteligente** evita chamadas repetidas à API
5. **Histórico de variações** evita repetição da mesma variação

## 🚀 Deploy

O sistema já está integrado e será ativado automaticamente no próximo deploy ao Railway.

---

## 📐 Arquitetura Técnica

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
                              ↓
┌─────────────────────────────────────────────────────────────────────┐
│                    MessageHumanizer (IA Mistral)                    │
│                                                                     │
│  📝 Mensagem Original → 🤖 Mistral AI → ✨ Mensagem Humanizada      │
│                                                                     │
│  Cache: 30 min TTL | Histórico: Últimas 10 variações por msg       │
└─────────────────────────────────────────────────────────────────────┘
```

## 🔌 Pontos de Integração

O sistema anti-bloqueio está integrado em **TODOS** os pontos de envio:

1. **Respostas da IA** (`processAccumulatedMessages`) - Prioridade HIGH
2. **Envio Manual** (`sendMessage`) - Prioridade HIGH  
3. **Follow-up** (`userFollowUpService`) - Prioridade NORMAL
4. **Envio em Massa** (`sendBulkMessages`) - Prioridade LOW
5. **Grupos** (`sendMessageToGroups`) - Prioridade LOW
