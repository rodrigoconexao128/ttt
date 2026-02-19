-- Migration: Criar tabelas de setores e roteamento
-- Data: 2026-02-18
-- Descrição: Cria tabelas para gerenciamento de setores, membros e relatórios de atendimento

-- Tabela de setores
CREATE TABLE IF NOT EXISTS sectors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  keywords TEXT[] NOT NULL DEFAULT '{}',
  auto_assign_agent_id UUID REFERENCES admins(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de membros de setor
CREATE TABLE IF NOT EXISTS sector_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id UUID NOT NULL REFERENCES sectors(id) ON DELETE CASCADE,
  admin_id UUID NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
  is_primary BOOLEAN DEFAULT FALSE,
  can_receive_tickets BOOLEAN DEFAULT TRUE,
  max_open_tickets INTEGER DEFAULT 10,
  status VARCHAR(50) DEFAULT 'active',
  assigned_by UUID REFERENCES admins(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(sector_id, admin_id)
);

-- Tabela de conversas (para relatórios)
CREATE TABLE IF NOT EXISTS conversation_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID NOT NULL,
  sector_id UUID REFERENCES sectors(id),
  assigned_admin_id UUID REFERENCES admins(id),
  assigned_at TIMESTAMP WITH TIME ZONE,
  closed_at TIMESTAMP WITH TIME ZONE,
  closed_by UUID REFERENCES admins(id),
  closed_reason TEXT,
  routing_method VARCHAR(50), -- 'intent', 'manual', 'round-robin'
  routing_confidence DECIMAL(3,2), -- 0-1
  message_count INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,

  UNIQUE(conversation_id)
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_sectors_name ON sectors(name);
CREATE INDEX IF NOT EXISTS idx_sectors_auto_assign_agent ON sectors(auto_assign_agent_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_sector_id ON sector_members(sector_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_admin_id ON sector_members(admin_id);
CREATE INDEX IF NOT EXISTS idx_sector_members_status ON sector_members(status);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_conversation_id ON conversation_reports(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_sector_id ON conversation_reports(sector_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_assigned_admin_id ON conversation_reports(assigned_admin_id);
CREATE INDEX IF NOT EXISTS idx_conversation_reports_created_at ON conversation_reports(created_at);

-- Gatilhos para updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_sectors_updated_at BEFORE UPDATE ON sectors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_sector_members_updated_at BEFORE UPDATE ON sector_members
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_conversation_reports_updated_at BEFORE UPDATE ON conversation_reports
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Comentários
COMMENT ON TABLE sectors IS 'Tabela de setores para organização de atendimento';
COMMENT ON TABLE sector_members IS 'Tabela de membros de setor com configurações de prioridade e limites de tickets';
COMMENT ON TABLE conversation_reports IS 'Tabela de relatórios de conversas com roteamento e status de fechamento';
COMMENT ON COLUMN sectors.keywords IS 'Palavras-chave para roteamento automático de conversas';
COMMENT ON COLUMN sector_members.is_primary IS 'Membro principal do setor (recebe tickets com prioridade)';
COMMENT ON COLUMN sector_members.max_open_tickets IS 'Limite máximo de tickets abertos por membro';
COMMENT ON COLUMN conversation_reports.routing_method IS 'Método de roteamento usado (intent, manual, round-robin)';
COMMENT ON COLUMN conversation_reports.routing_confidence IS 'Confiança do roteamento (0-1)';
