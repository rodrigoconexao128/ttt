# Migrations Pendentes

Execute as seguintes migrations no Supabase SQL Editor:

## 1. Avatar de Contato
```sql
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS contact_avatar TEXT;
COMMENT ON COLUMN conversations.contact_avatar IS 'Profile picture URL from WhatsApp';
```

## 2. Tamanho de Bolhas de Mensagem
```sql
ALTER TABLE ai_agent_config 
ADD COLUMN IF NOT EXISTS message_split_chars INTEGER DEFAULT 400;

COMMENT ON COLUMN ai_agent_config.message_split_chars IS 'Maximum characters per message bubble. 0 = no split';
```

## Como Executar

1. Acesse o Supabase Dashboard: https://supabase.com/dashboard
2. Selecione seu projeto
3. Vá em "SQL Editor"
4. Cole cada comando acima e execute (Run)
5. Verifique se as colunas foram criadas com sucesso

## Verificação

Para confirmar que as migrations foram aplicadas:

```sql
-- Verificar colunas de conversations
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'conversations' 
AND column_name IN ('contact_avatar');

-- Verificar colunas de ai_agent_config
SELECT column_name, data_type, column_default 
FROM information_schema.columns 
WHERE table_name = 'ai_agent_config' 
AND column_name IN ('message_split_chars');
```
