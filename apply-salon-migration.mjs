/**
 * APLICAR MIGRAÇÃO DO SALÃO NO SUPABASE
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZXYiLCJyZWYiOiJzYWxvbi1kZXYiLCJyb2xlIjoic2VydmljZV9yb2xlIiwiaWF0IjoxNzYyMzUzMODksImV4cCI6MjA3NzkyOTM4OX0.a0Wxr0_WvWk_ZBY2s4qCqBG36sXhU8hPXM5MQyV4Jg';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🔄 Aplicando migração do salão...');

  // 1. Adicionar coluna min_notice_minutes
  console.log('\n1️⃣ Adicionando coluna min_notice_minutes...');

  const { error: alterError } = await supabase.rpc('exec_sql', {
    sql: `ALTER TABLE salon_config ADD COLUMN IF NOT EXISTS min_notice_minutes integer;`
  });

  // O Supabase não suporta exec_sql direto, vamos usar REST API
  // Mas para simplificar, vou criar um script SQL que o usuário pode aplicar manualmente

  console.log('⚠️  Para aplicar a migração, execute o SQL abaixo no Supabase SQL Editor:');
  console.log(`
-- Migration: Adicionar campo min_notice_minutes em salon_config
ALTER TABLE salon_config
ADD COLUMN IF NOT EXISTS min_notice_minutes integer;

-- Popular registros existentes (converter horas para minutos)
UPDATE salon_config
SET min_notice_minutes = COALESCE(min_notice_hours, 2) * 60
WHERE min_notice_minutes IS NULL;

-- Definir valor padrão como 0
ALTER TABLE salon_config
ALTER COLUMN min_notice_minutes SET DEFAULT 0;

-- Opcional: Adicionar constraint
ALTER TABLE salon_config
ADD CONSTRAINT IF NOT EXISTS salon_min_notice_minutes_nonnegative
CHECK (min_notice_minutes >= 0);
  `);
}

runMigration().catch(console.error);
