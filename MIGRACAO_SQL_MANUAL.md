# Migração SQL do Salão - Instruções Manuais

## Situação Atual

A coluna `min_notice_minutes` ainda não existe na tabela `salon_config` do Supabase.
A migração foi criada em `server/migrations/salon_min_notice_minutes.sql` mas precisa ser aplicada manualmente.

## Como Aplicar a Migração

### Opção 1: Via Dashboard Supabase (RECOMENDADO)

1. Acesse: https://supabase.com/dashboard/project/bnfpcuzjvycudccycqqt/sql
2. Cole o SQL abaixo no editor
3. Clique em "Run" ou executar

### SQL para Copiar e Colar

```sql
-- Migration: Adicionar campo min_notice_minutes em salon_config
-- Data: 2025-02-08
-- Descrição: Adiciona antecedência mínima em minutos (permite 0) mantendo compatibilidade com min_notice_hours

-- Adicionar coluna min_notice_minutes
ALTER TABLE salon_config
ADD COLUMN IF NOT EXISTS min_notice_minutes integer;

-- Popular registros existentes (converter horas para minutos)
UPDATE salon_config
SET min_notice_minutes = COALESCE(min_notice_hours, 2) * 60
WHERE min_notice_minutes IS NULL;

-- Definir valor padrão como 0 (permite agendar imediatamente)
ALTER TABLE salon_config
ALTER COLUMN min_notice_minutes SET DEFAULT 0;

-- Opcional: Adicionar constraint para garantir valores não-negativos
ALTER TABLE salon_config
ADD CONSTRAINT IF NOT EXISTS salon_min_notice_minutes_nonnegative
CHECK (min_notice_minutes >= 0);

-- Comentário sobre a coluna
COMMENT ON COLUMN salon_config.min_notice_minutes IS 'Antecedência mínima em minutos para agendamentos (0 permite agendar imediatamente)';

-- NOTA: A coluna min_notice_hours é mantida para compatibilidade legada
-- O código backend deve priorizar min_notice_minutes se existir
```

### Opção 2: Via Supabase CLI (requer login)

```bash
# 1. Fazer login no Supabase
npx supabase login

# 2. Linkar o projeto (se ainda não linkado)
npx supabase link --project-ref bnfpcuzjvycudccycqqt

# 3. Aplicar a migração
npx supabase db push
```

## Verificar se a Migração Foi Aplicada

Depois de aplicar a migração, execute o teste:

```bash
node test-salon-api.mjs
```

Se ver `min_notice_minutes` na lista de colunas, a migração foi aplicada com sucesso!

## Próximos Passos (Após Migração)

1. ✅ Servidor está rodando em localhost:5000
2. ⏳ Testar no simulador: https://agentezap.online/meu-agente-ia
3. ⏳ Verificar antecedência em minutos (permitindo 0)
4. ⏳ Verificar bloqueio de almoço (12:00-13:00)
5. ⏳ Verificar exclusividade por profissional
6. ⏳ Verificar agendamento real via simulador
7. ⏳ Verificar detecção de conflitos e sugestões de alternativas
