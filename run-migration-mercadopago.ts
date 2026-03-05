/**
 * Migration: Adicionar suporte ao Mercado Pago
 * 
 * Novos campos em plans:
 * - mp_plan_id: ID do plano no Mercado Pago
 * - valor_primeira_cobranca: Valor diferente na primeira cobrança (implementação)
 * - codigo_personalizado: Código para planos personalizados
 * - is_personalizado: Se é um plano personalizado
 * 
 * Novos campos em subscriptions:
 * - mp_subscription_id: ID da assinatura no Mercado Pago
 * - mp_status: Status no Mercado Pago
 * - mp_init_point: Link de pagamento
 * - external_reference: Referência externa
 * - next_payment_date: Data da próxima cobrança
 */

import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

async function runMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false }
  });

  const client = await pool.connect();

  try {
    console.log('🚀 Iniciando migration: Suporte ao Mercado Pago...\n');

    // 1. Adicionar campos de Mercado Pago na tabela plans
    console.log('📝 Adicionando campos de Mercado Pago na tabela plans...');
    
    await client.query(`
      ALTER TABLE plans 
      ADD COLUMN IF NOT EXISTS mp_plan_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS valor_primeira_cobranca DECIMAL(10, 2),
      ADD COLUMN IF NOT EXISTS codigo_personalizado VARCHAR(50) UNIQUE,
      ADD COLUMN IF NOT EXISTS is_personalizado BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS frequencia_dias INTEGER DEFAULT 30,
      ADD COLUMN IF NOT EXISTS trial_dias INTEGER DEFAULT 0
    `);
    console.log('✅ Campos adicionados na tabela plans');

    // 2. Adicionar campos de Mercado Pago na tabela subscriptions
    console.log('📝 Adicionando campos de Mercado Pago na tabela subscriptions...');
    
    await client.query(`
      ALTER TABLE subscriptions 
      ADD COLUMN IF NOT EXISTS mp_subscription_id VARCHAR(255),
      ADD COLUMN IF NOT EXISTS mp_status VARCHAR(50),
      ADD COLUMN IF NOT EXISTS mp_init_point TEXT,
      ADD COLUMN IF NOT EXISTS external_reference VARCHAR(255) UNIQUE,
      ADD COLUMN IF NOT EXISTS next_payment_date TIMESTAMP,
      ADD COLUMN IF NOT EXISTS payer_email VARCHAR(255),
      ADD COLUMN IF NOT EXISTS payment_method VARCHAR(50) DEFAULT 'mercadopago'
    `);
    console.log('✅ Campos adicionados na tabela subscriptions');

    // 3. Criar tabela para logs de pagamentos do Mercado Pago
    console.log('📝 Criando tabela mp_payment_logs...');
    
    await client.query(`
      CREATE TABLE IF NOT EXISTS mp_payment_logs (
        id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
        subscription_id VARCHAR REFERENCES subscriptions(id) ON DELETE CASCADE,
        mp_payment_id VARCHAR(255),
        amount DECIMAL(10, 2),
        status VARCHAR(50),
        status_detail VARCHAR(100),
        payment_date TIMESTAMP,
        raw_data JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);
    console.log('✅ Tabela mp_payment_logs criada');

    // 4. Criar índices para performance
    console.log('📝 Criando índices...');
    
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_plans_mp_plan_id ON plans(mp_plan_id);
      CREATE INDEX IF NOT EXISTS idx_plans_codigo_personalizado ON plans(codigo_personalizado);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_mp_subscription_id ON subscriptions(mp_subscription_id);
      CREATE INDEX IF NOT EXISTS idx_subscriptions_external_reference ON subscriptions(external_reference);
      CREATE INDEX IF NOT EXISTS idx_mp_payment_logs_subscription ON mp_payment_logs(subscription_id);
      CREATE INDEX IF NOT EXISTS idx_mp_payment_logs_mp_payment_id ON mp_payment_logs(mp_payment_id);
    `);
    console.log('✅ Índices criados');

    // 5. Criar configurações padrão do Mercado Pago
    console.log('📝 Inserindo configurações padrão do Mercado Pago...');
    
    await client.query(`
      INSERT INTO system_config (chave, valor) VALUES 
        ('mercadopago_test_mode', 'true'),
        ('mercadopago_webhook_secret', '')
      ON CONFLICT (chave) DO NOTHING
    `);
    console.log('✅ Configurações padrão inseridas');

    console.log('\n🎉 Migration concluída com sucesso!');
    console.log('\nAgora você precisa:');
    console.log('1. Configurar as credenciais do Mercado Pago no admin');
    console.log('2. Criar os planos com os IDs do Mercado Pago');

  } catch (error) {
    console.error('❌ Erro na migration:', error);
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigration()
  .then(() => process.exit(0))
  .catch(() => process.exit(1));
