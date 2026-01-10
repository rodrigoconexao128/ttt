import { pool } from './server/db';

async function main() {
  console.log('Iniciando migração para pagamento granular...');

  // 1. Adicionar coluna saas_paid_until na tabela reseller_clients
  try {
    await pool.query(`
      ALTER TABLE reseller_clients 
      ADD COLUMN IF NOT EXISTS saas_paid_until TIMESTAMP,
      ADD COLUMN IF NOT EXISTS saas_status VARCHAR(50) DEFAULT 'pending';
    `);
    console.log('✅ Colunas saas_paid_until e saas_status adicionadas em reseller_clients');
  } catch (e: any) {
    console.error('Erro ao alterar reseller_clients:', e.message);
  }

  // 2. Criar tabela reseller_invoice_items
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS reseller_invoice_items (
        id SERIAL PRIMARY KEY,
        invoice_id INTEGER NOT NULL,
        client_id INTEGER NOT NULL,
        amount NUMERIC(10, 2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);
    console.log('✅ Tabela reseller_invoice_items criada');
  } catch (e: any) {
    console.error('Erro ao criar reseller_invoice_items:', e.message);
  }
  
  // 3. Atualizar clientes existentes para terem uma data inicial (opcional, para não bloquear todos de imediato)
  // Vamos dar 3 dias de graça para testes
  await pool.query(`
    UPDATE reseller_clients 
    SET saas_paid_until = NOW() + INTERVAL '3 days', saas_status = 'active'
    WHERE saas_paid_until IS NULL
  `);
  console.log('✅ Clientes existentes inicializados com 3 dias grátis');

  process.exit(0);
}

main().catch(console.error);
