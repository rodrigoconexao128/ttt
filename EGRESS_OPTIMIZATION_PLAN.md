# 🚨 DIAGNÓSTICO E PLANO DE OTIMIZAÇÃO - EGRESS SUPABASE

## 📊 ANÁLISE DO PROBLEMA

### Situação Atual (14/01/2026)
- **Egress usado:** 263.42 GB / 250 GB (**105% - EXCEDIDO**)
- **Cached Egress:** 7.06 GB / 250 GB (3% - **subutilizado!**)
- **Shared Pooler Egress:** 36.927 GB em 14/Jan sozinho!

### 🔥 CAUSA RAIZ IDENTIFICADA

A tabela `messages` está com **5.8 GB** de dados, porém:
- Linhas totais: **97.800**
- Dados reais (texto): **~11 MB**
- **TOAST (dados grandes):** **5.748 GB** ← PROBLEMA!

#### O que está acontecendo?
O sistema está salvando **MÍDIA EM BASE64 DIRETAMENTE NO BANCO**!

```sql
-- Encontrado no banco:
media_url = 'data:audio/ogg;base64,T2dnUw...' -- 50KB a 235KB por mensagem!
media_url = 'data:image/jpeg;base64,/9j/4AAQ...' -- até 500KB por imagem!
```

#### Impacto no Egress
- **16.613 chamadas** da query `SELECT * FROM messages WHERE conversation_id = ?`
- Cada query retorna **TODAS as mensagens** incluindo base64
- Cada áudio/imagem transferido = **50-500KB de egress** multiplicado por todas as vezes!

### 📈 Queries Problemáticas (Top 5)

| Query | Calls | Total Time | Rows | Blocks |
|-------|-------|------------|------|--------|
| SELECT messages... | 16,613 | 1,128,746ms | 705,504 | 5,978,620 |
| SELECT whatsapp_connections... | 56,159 | 3,097ms | 53,272 | 225,759 |
| SELECT subscriptions + plans... | 36,175 | 4,178ms | 32,989 | 396,029 |
| UPDATE conversations... | 37,101 | 3,206ms | 37,101 | 229,759 |
| SELECT auth.sessions... | 73,522 | 1,724ms | 72,781 | 147,854 |

---

## 🛠️ PLANO DE OTIMIZAÇÃO

### FASE 1: PARAR O SANGRAMENTO (Urgente - 1-2h)

#### 1.1 Criar índice parcial para mensagens com mídia
```sql
CREATE INDEX CONCURRENTLY idx_messages_media_present 
ON public.messages (conversation_id) 
WHERE media_url IS NOT NULL;
```

#### 1.2 Implementar lazy loading de mídia
- Não carregar `media_url` na query principal
- Carregar sob demanda quando usuário clica

### FASE 2: MIGRAR MÍDIA PARA STORAGE (2-4h)

#### 2.1 Criar bucket no Supabase Storage
```sql
INSERT INTO storage.buckets (id, name, public) 
VALUES ('whatsapp-media', 'whatsapp-media', true);
```

#### 2.2 Script de migração (Node.js)
- Ler mensagens com `media_url LIKE 'data:%'`
- Fazer upload para Supabase Storage
- Atualizar `media_url` com URL do storage
- Processar em batches de 100 mensagens

### FASE 3: LIMPEZA E COMPACTAÇÃO (1-2h)

#### 3.1 VACUUM FULL na tabela messages
```sql
-- ATENÇÃO: Vai travar a tabela por alguns minutos
-- Executar em horário de baixo tráfego
VACUUM FULL public.messages;
REINDEX TABLE public.messages;
```

#### 3.2 Limpar dados órfãos
```sql
-- Mensagens de conversas que não existem mais
DELETE FROM messages m
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c WHERE c.id = m.conversation_id
);
```

### FASE 4: OTIMIZAÇÕES DE CÓDIGO (2-3h)

#### 4.1 Modificar `storage.ts` - Lazy Loading
```typescript
// ANTES: Carrega tudo
async getMessagesByConversationId(conversationId: string) {
  return db.select().from(messages)...
}

// DEPOIS: Não carrega media_url por padrão
async getMessagesByConversationId(conversationId: string) {
  return db.select({
    id: messages.id,
    text: messages.text,
    timestamp: messages.timestamp,
    mediaType: messages.mediaType, // Só tipo, não URL
    // NÃO inclui mediaUrl aqui!
  }).from(messages)...
}

// Nova função para carregar mídia sob demanda
async getMessageMedia(messageId: string) {
  return db.select({ mediaUrl: messages.mediaUrl })
    .from(messages).where(eq(messages.id, messageId));
}
```

#### 4.2 Modificar `whatsapp.ts` - Upload para Storage
```typescript
// ANTES: Salva base64 no banco
mediaUrl = `data:${mediaMimeType};base64,${buffer.toString("base64")}`;

// DEPOIS: Upload para Storage
const { data, error } = await supabase.storage
  .from('whatsapp-media')
  .upload(`${userId}/${messageId}.${extension}`, buffer);
mediaUrl = supabase.storage
  .from('whatsapp-media')
  .getPublicUrl(`${userId}/${messageId}.${extension}`).data.publicUrl;
```

### FASE 5: CONFIGURAR CACHE CDN (30min)

O Supabase Storage usa CDN automaticamente. Após migração:
- Mídias serão servidas via cache CDN
- Cached Egress será usado (não conta no limite!)
- Headers `Cache-Control` configurados automaticamente

---

## 📋 CHECKLIST DE IMPLEMENTAÇÃO

- [ ] **URGENTE:** Criar índice para lazy loading
- [ ] Criar bucket no Supabase Storage
- [ ] Modificar `storage.ts` para não carregar media_url
- [ ] Modificar frontend para lazy load de mídia
- [ ] Criar API endpoint `/api/message-media/:id`
- [ ] Modificar `whatsapp.ts` para upload no Storage
- [ ] Criar script de migração de mídia existente
- [ ] Executar migração em batches
- [ ] VACUUM FULL após migração
- [ ] Verificar e deletar índices não usados
- [ ] Deploy no Railway
- [ ] Monitorar egress por 24h

---

## ⚠️ ÍNDICES NÃO USADOS (Candidatos a remoção)

Encontrados 23 índices nunca utilizados que ocupam espaço:
- `idx_prompt_versions_config_type`
- `idx_appointments_conversation_id`
- `idx_deal_history_*`
- `idx_funnel_*`
- `idx_scheduling_*`
- `idx_website_imports_*`
- E outros...

```sql
-- Para remover índices não usados:
DROP INDEX CONCURRENTLY idx_prompt_versions_config_type;
-- ... etc
```

---

## 🎯 RESULTADO ESPERADO

| Métrica | Antes | Depois |
|---------|-------|--------|
| Egress mensal | 263 GB+ | < 50 GB |
| Tamanho messages | 5.8 GB | ~100 MB |
| Query messages tempo | 68ms avg | < 5ms |
| Media load | Toda hora | Sob demanda |
| Cached Egress | 3% | 80%+ |

---

## 🚀 ORDEM DE EXECUÇÃO

1. **AGORA:** Executar índice parcial (sem downtime)
2. **AGORA:** Modificar código para lazy loading
3. **DEPOIS:** Criar bucket e modificar uploads
4. **DEPOIS:** Migrar dados existentes
5. **NOITE:** VACUUM FULL (horário de baixo tráfego)
6. **DEPLOY:** Railway com código otimizado
