-- Migration: Novo Fluxo de Vendas 2025
-- Descrição: Tabelas para clientes temporários e agendamentos de follow-up

-- =============================================================================
-- TEMP CLIENTS - Clientes em fase de teste (sem conta real ainda)
-- =============================================================================

CREATE TABLE IF NOT EXISTS temp_clients (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  phone_number VARCHAR UNIQUE NOT NULL,
  temp_email VARCHAR UNIQUE NOT NULL,
  -- Dados coletados durante onboarding
  business_name VARCHAR,
  business_type VARCHAR,
  agent_name VARCHAR,
  agent_role VARCHAR,
  agent_prompt TEXT,
  -- Estado do onboarding: initial, collecting_type, collecting_agent_name, collecting_role, collecting_info, ready_to_test
  onboarding_step VARCHAR NOT NULL DEFAULT 'initial',
  -- Controle de follow-up
  last_interaction_at TIMESTAMP DEFAULT NOW(),
  next_follow_up_at TIMESTAMP,
  follow_up_count INTEGER NOT NULL DEFAULT 0,
  -- Modo teste
  is_in_test_mode BOOLEAN NOT NULL DEFAULT false,
  test_started_at TIMESTAMP,
  test_messages_count INTEGER NOT NULL DEFAULT 0,
  -- Conversão
  payment_received BOOLEAN NOT NULL DEFAULT false,
  converted_to_real_user BOOLEAN NOT NULL DEFAULT false,
  real_user_id VARCHAR,
  -- Histórico de conversa
  conversation_history JSONB DEFAULT '[]'::jsonb,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_temp_clients_phone ON temp_clients(phone_number);
CREATE INDEX IF NOT EXISTS idx_temp_clients_step ON temp_clients(onboarding_step);
CREATE INDEX IF NOT EXISTS idx_temp_clients_test_mode ON temp_clients(is_in_test_mode);
CREATE INDEX IF NOT EXISTS idx_temp_clients_follow_up ON temp_clients(next_follow_up_at) WHERE next_follow_up_at IS NOT NULL;

-- =============================================================================
-- SCHEDULED FOLLOW-UPS - Agendamentos de retorno automático
-- =============================================================================

CREATE TABLE IF NOT EXISTS scheduled_follow_ups (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::varchar,
  temp_client_id VARCHAR REFERENCES temp_clients(id) ON DELETE CASCADE,
  user_id VARCHAR,
  phone_number VARCHAR NOT NULL,
  -- Tipo: auto_10min, auto_1h, auto_24h, scheduled, manual
  type VARCHAR NOT NULL,
  -- Mensagem customizada (IA gera baseado no contexto)
  message TEXT,
  -- Quando executar
  scheduled_for TIMESTAMP NOT NULL,
  -- Status: pending, sent, cancelled, failed
  status VARCHAR NOT NULL DEFAULT 'pending',
  -- Contexto para IA gerar mensagem contextualizada
  context JSONB,
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  executed_at TIMESTAMP
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_follow_ups_scheduled ON scheduled_follow_ups(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_follow_ups_status ON scheduled_follow_ups(status);
CREATE INDEX IF NOT EXISTS idx_follow_ups_phone ON scheduled_follow_ups(phone_number);
CREATE INDEX IF NOT EXISTS idx_follow_ups_pending ON scheduled_follow_ups(scheduled_for, status) WHERE status = 'pending';

-- =============================================================================
-- SEQUÊNCIA PARA EMAILS TEMPORÁRIOS
-- =============================================================================

CREATE SEQUENCE IF NOT EXISTS temp_email_seq START 1;

-- Função para gerar email temporário
CREATE OR REPLACE FUNCTION generate_temp_email()
RETURNS VARCHAR AS $$
BEGIN
  RETURN 'temp_' || LPAD(nextval('temp_email_seq')::text, 6, '0') || '@agentezap.temp';
END;
$$ LANGUAGE plpgsql;

-- =============================================================================
-- TRIGGERS
-- =============================================================================

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION update_temp_client_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_temp_client_timestamp ON temp_clients;
CREATE TRIGGER trigger_update_temp_client_timestamp
  BEFORE UPDATE ON temp_clients
  FOR EACH ROW
  EXECUTE FUNCTION update_temp_client_timestamp();

-- =============================================================================
-- COMENTÁRIOS
-- =============================================================================

COMMENT ON TABLE temp_clients IS 'Clientes em fase de onboarding/teste que ainda não criaram conta real';
COMMENT ON COLUMN temp_clients.onboarding_step IS 'Etapa do onboarding: initial, collecting_type, collecting_agent_name, collecting_role, collecting_info, ready_to_test';
COMMENT ON COLUMN temp_clients.is_in_test_mode IS 'Se true, cliente está testando seu agente configurado. Digitar #sair para sair';
COMMENT ON COLUMN temp_clients.conversation_history IS 'Array JSON com histórico [{role, content, timestamp}]';

COMMENT ON TABLE scheduled_follow_ups IS 'Agendamentos de follow-up automático ou manual';
COMMENT ON COLUMN scheduled_follow_ups.type IS 'Tipo: auto_10min, auto_1h, auto_24h, scheduled (cliente agendou), manual (admin agendou)';
COMMENT ON COLUMN scheduled_follow_ups.context IS 'Contexto JSON para IA gerar mensagem contextualizada';
