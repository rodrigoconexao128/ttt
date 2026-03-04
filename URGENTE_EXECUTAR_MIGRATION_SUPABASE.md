# 🚨 URGENTE: EXECUTAR MIGRATION NO SUPABASE

**Data:** 22/11/2025  
**Status:** ⚠️ **BLOQUEADOR CRÍTICO**  
**Problema:** Tabela `whatsapp_contacts` **NÃO EXISTE** no Supabase!

---

## 🔍 Diagnóstico

**Print do Supabase mostra:** "This table is empty" na tabela `whatsapp_contacts`

**MAS:** A tabela nem existe ainda! A migration SQL **NÃO FOI EXECUTADA**.

**Consequência:**
- ❌ Cache warming não carrega nada (tabela não existe)
- ❌ Fallback DB não encontra nada (tabela não existe)
- ❌ Sistema continua salvando LID ao invés do número real
- ❌ Evento `contacts.upsert` salva dados mas a tabela não existe para receber

---

## ✅ SOLUÇÃO: Executar Migration AGORA

### Passo 1: Abrir Supabase SQL Editor

1. Ir para: https://supabase.com/dashboard
2. Selecionar projeto: `rodrigoconexao128@gmail.com's Project`
3. Clicar em **SQL Editor** no menu lateral esquerdo
4. Clicar em **+ New query**

### Passo 2: Copiar SQL da Migration

Abrir arquivo: `migrations/add_whatsapp_contacts.sql`

**OU copiar daqui:**

```sql
-- =====================================================================
-- Migration: Add whatsapp_contacts table for persistent contact storage
-- =====================================================================

CREATE TABLE IF NOT EXISTS whatsapp_contacts (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  connection_id VARCHAR NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  contact_id TEXT NOT NULL,
  lid TEXT,
  phone_number TEXT,
  name VARCHAR(255),
  img_url TEXT,
  last_synced_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- ÍNDICES
CREATE INDEX IF NOT EXISTS idx_contacts_connection_id 
ON whatsapp_contacts(connection_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contacts_lid 
ON whatsapp_contacts(lid) 
WHERE lid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_phone 
ON whatsapp_contacts(phone_number) 
WHERE phone_number IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_unique_connection_contact 
ON whatsapp_contacts(connection_id, contact_id);

CREATE INDEX IF NOT EXISTS idx_contacts_last_synced 
ON whatsapp_contacts(last_synced_at);

-- COMMENTS
COMMENT ON TABLE whatsapp_contacts IS 'Cache persistente de contatos do WhatsApp/Baileys. Mapeia @lid para phoneNumber real.';
COMMENT ON COLUMN whatsapp_contacts.phone_number IS 'CRÍTICO: Número real do contato (formato: numero@s.whatsapp.net). Resolve @lid → número.';

-- VALIDAÇÃO
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'whatsapp_contacts') THEN
    RAISE NOTICE 'SUCCESS: whatsapp_contacts table created';
  ELSE
    RAISE EXCEPTION 'FAILED: whatsapp_contacts table not found';
  END IF;
END $$;
```

### Passo 3: Executar SQL

1. Colar o SQL no editor
2. Clicar em **Run** (ou Ctrl+Enter)
3. Aguardar mensagem: `SUCCESS: whatsapp_contacts table created`

### Passo 4: Verificar Tabela Criada

Executar query de verificação:

```sql
-- Verificar se tabela existe
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'whatsapp_contacts';

-- Verificar índices
SELECT indexname 
FROM pg_indexes 
WHERE tablename = 'whatsapp_contacts';

-- Deve retornar 5 índices:
-- - idx_contacts_connection_id
-- - idx_contacts_lid
-- - idx_contacts_phone
-- - idx_contacts_unique_connection_contact
-- - idx_contacts_last_synced
```

### Passo 5: Verificar Dados Salvos

Após executar a migration, aguardar alguns minutos e verificar:

```sql
-- Ver contatos salvos
SELECT 
  id,
  connection_id,
  contact_id,
  lid,
  phone_number,
  name,
  created_at
FROM whatsapp_contacts
ORDER BY created_at DESC
LIMIT 10;
```

---

## 🔍 O Que Vai Acontecer Após a Migration

### 1. Próxima vez que conectar WhatsApp:

```
[CACHE WARMING] Loading X contacts from DB...
[CACHE WARMING] ✅ Loaded X contacts into memory
```

### 2. Quando Baileys emitir `contacts.upsert`:

```
========================================
[CONTACTS SYNC] ⚡ Baileys emitiu X contatos
========================================

🔍 [CONTACT DEBUG] Processando contato:
   - ID: 5511999999999@s.whatsapp.net
   - LID: 254635809968349@lid
   - phoneNumber: 5511999999999@s.whatsapp.net
   - name: Rodrigo Cooperador De Jov
   ✅ Adicionado ao cache com LID
   ✅ [DB SAVE] Salvo no Supabase com sucesso!
```

### 3. Quando mensagem @lid chegar:

```
🔍 [parseRemoteJid] ========== DEBUG START ==========
   Input remoteJid: 254635809968349@lid
   🚨 DETECTADO @LID - Iniciando resolução...
   [Tentativa 1] Cache lookup: ✅ ENCONTRADO
   🎯 [LID FIX] SUCESSO! Mapeamento encontrado:
      LID: 254635809968349@lid
      → phoneNumber: 5511999999999@s.whatsapp.net
      → Número limpo: 5511999999999
```

### 4. No banco `conversations`:

```sql
contact_number: "5511999999999"  ← Número real (correto!)
remote_jid: "5511999999999@s.whatsapp.net"
```

---

## 🐛 Troubleshooting

### Erro: "relation whatsapp_connections does not exist"

**Causa:** Tabela `whatsapp_connections` não existe (projeto novo?)

**Solução:** Executar migration anterior primeiro:

```sql
-- Verificar se existe
SELECT table_name FROM information_schema.tables 
WHERE table_name = 'whatsapp_connections';

-- Se não existir, criar schema completo (arquivo completo em shared/schema.ts)
```

### Erro: "permission denied for schema public"

**Causa:** Usuário não tem permissão para criar tabelas

**Solução:** Executar como admin ou dar permissões:

```sql
GRANT ALL ON SCHEMA public TO postgres;
GRANT ALL ON SCHEMA public TO authenticated;
```

### Tabela criada mas ainda não funciona

**Verificar:**

1. Railway redployou? (aguardar deploy do commit 379411c)
2. Logs do Railway mostram `[CONTACTS SYNC]`? (Baileys emitindo eventos?)
3. Cache warming executou? (`[CACHE WARMING] Loaded X contacts`)

---

## 📊 Monitoramento

Após executar migration, verificar logs no Railway:

```bash
railway logs --follow
```

Procurar por:

✅ **Sinais de sucesso:**
- `[CACHE WARMING] ✅ Loaded X contacts`
- `[CONTACTS SYNC] ⚡ Baileys emitiu X contatos`
- `✅ [DB SAVE] Salvo no Supabase`
- `🎯 [LID FIX] SUCESSO! Mapeamento encontrado`

❌ **Sinais de problema:**
- `❌ [CACHE WARMING] Failed to load contacts`
- `❌ [LID FALLBACK] NÃO ENCONTRADO NO DB`
- `⚠️ [LID WARNING] NENHUM MAPEAMENTO ENCONTRADO`

---

## 🎯 AÇÃO IMEDIATA NECESSÁRIA

**PARAR TUDO E:**

1. ✅ Abrir Supabase Dashboard
2. ✅ SQL Editor → New query
3. ✅ Copiar SQL de `migrations/add_whatsapp_contacts.sql`
4. ✅ Executar (Run)
5. ✅ Verificar mensagem "SUCCESS"
6. ✅ Aguardar redeploy Railway (commit 379411c)
7. ✅ Testar enviar mensagem do Instagram/Facebook
8. ✅ Verificar logs detalhados
9. ✅ Confirmar número real aparece (não LID)

**Sem a migration, TODO o trabalho de implementação não funciona!**

A tabela precisa existir para:
- Cache warming carregar dados
- Fallback DB buscar números
- Evento `contacts.upsert` salvar dados
- Sistema resolver @lid → phoneNumber

**🚨 EXECUTAR MIGRATION AGORA!**
