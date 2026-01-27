/**
 * Script para executar migração da tabela contact_lists no Supabase
 * Uso: npx tsx run-migration-contact-lists.ts
 */

import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || '';

if (!SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_SERVICE_KEY não configurada!');
  console.error('   Configure a variável de ambiente ou adicione no .env');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

async function runMigration() {
  console.log('🚀 Iniciando migração da tabela contact_lists...\n');
  console.log(`📡 Supabase URL: ${SUPABASE_URL}`);

  // 1. Verificar se a tabela já existe
  console.log('\n📋 Verificando se tabela já existe...');
  const { data: existing, error: checkError } = await supabase
    .from('contact_lists')
    .select('id')
    .limit(1);

  if (!checkError) {
    console.log('✅ Tabela contact_lists já existe!');
    console.log('   Nenhuma ação necessária.');
    return;
  }

  if (checkError.code === '42P01') {
    console.log('ℹ️  Tabela não existe, criando...');
  } else {
    console.log('⚠️  Erro ao verificar tabela:', checkError.message);
    console.log('   Tentando criar mesmo assim...');
  }

  // 2. Criar tabela via RPC (se existir função exec_sql)
  // Nota: Como Supabase não permite DDL via client, precisamos
  // usar a Dashboard SQL Editor ou criar a tabela manualmente

  console.log('\n' + '='.repeat(60));
  console.log('⚠️  AÇÃO MANUAL NECESSÁRIA');
  console.log('='.repeat(60));
  console.log('\nO Supabase não permite criar tabelas via API client.');
  console.log('Por favor, execute o seguinte SQL no Supabase Dashboard:\n');
  console.log('1. Acesse: https://supabase.com/dashboard/project/bnfpcuzjvycudccycqqt/sql');
  console.log('2. Cole e execute o SQL abaixo:\n');
  console.log('-'.repeat(60));
  console.log(`
CREATE TABLE IF NOT EXISTS contact_lists (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  contacts JSONB DEFAULT '[]'::jsonb,
  contact_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contact_lists_user ON contact_lists(user_id);
CREATE INDEX IF NOT EXISTS idx_contact_lists_created ON contact_lists(created_at);

COMMENT ON TABLE contact_lists IS 'Listas de contatos para envio em massa';
`);
  console.log('-'.repeat(60));
  console.log('\n3. Após executar, rode este script novamente para verificar.\n');
}

runMigration().catch(console.error);
