-- ═══════════════════════════════════════════════════════════════════════════
-- 🚀 MIGRATION: SISTEMA UNIFICADO DE FLUXOS - AGENTEZAP
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Este migration cria as tabelas necessárias para o sistema híbrido de fluxos:
-- - agent_flows: Armazena FlowDefinitions por usuário
-- - conversation_flow_states: Armazena estado de cada conversa
--
-- ARQUITETURA:
-- 1. IA INTERPRETA → Entende intenção do cliente
-- 2. SISTEMA EXECUTA → Busca dados, muda estados (determinístico)
-- 3. IA HUMANIZA → Resposta natural (anti-bloqueio)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: agent_flows
-- Armazena FlowDefinition de cada usuário (1 flow por usuário)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS agent_flows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamento com usuário (1:1)
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  
  -- Identificação do flow
  flow_id VARCHAR(100) NOT NULL,
  flow_type VARCHAR(50) NOT NULL CHECK (flow_type IN ('DELIVERY', 'VENDAS', 'AGENDAMENTO', 'SUPORTE', 'GENERICO')),
  
  -- FlowDefinition completo (JSON)
  flow_definition JSONB NOT NULL,
  
  -- Metadados para busca rápida
  business_name VARCHAR(255),
  agent_name VARCHAR(255),
  version VARCHAR(20) DEFAULT '1.0.0',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_agent_flows_user_id ON agent_flows(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_flows_flow_type ON agent_flows(flow_type);
CREATE INDEX IF NOT EXISTS idx_agent_flows_updated_at ON agent_flows(updated_at DESC);

-- Comentários
COMMENT ON TABLE agent_flows IS 'Armazena FlowDefinition de cada usuário para o sistema híbrido de atendimento';
COMMENT ON COLUMN agent_flows.flow_definition IS 'FlowDefinition completo com states, intents, actions, data, globalRules';
COMMENT ON COLUMN agent_flows.flow_type IS 'DELIVERY=restaurantes, VENDAS=SaaS/B2B, AGENDAMENTO=clínicas, SUPORTE=FAQ, GENERICO=outros';

-- ═══════════════════════════════════════════════════════════════════════════
-- TABELA: conversation_flow_states
-- Armazena estado atual de cada conversa (máquina de estados)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS conversation_flow_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  
  -- Relacionamento com conversa (1:1)
  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  
  -- Relacionamento com usuário (para queries)
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  
  -- Referência ao flow
  flow_id VARCHAR(100) NOT NULL,
  
  -- Estado atual na máquina de estados
  current_state VARCHAR(100) NOT NULL,
  
  -- Dados acumulados durante a conversa (carrinho, endereço, etc)
  data JSONB DEFAULT '{}',
  
  -- Histórico de turnos para contexto
  history JSONB DEFAULT '[]',
  
  -- Timestamps
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para performance
CREATE INDEX IF NOT EXISTS idx_conv_flow_states_conversation ON conversation_flow_states(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conv_flow_states_user ON conversation_flow_states(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_flow_states_updated ON conversation_flow_states(updated_at DESC);

-- Comentários
COMMENT ON TABLE conversation_flow_states IS 'Estado da máquina de estados para cada conversa ativa';
COMMENT ON COLUMN conversation_flow_states.current_state IS 'Nome do estado atual (ex: INICIO, PEDINDO, PAGAMENTO)';
COMMENT ON COLUMN conversation_flow_states.data IS 'Dados acumulados: carrinho, endereço, forma pagamento, etc';
COMMENT ON COLUMN conversation_flow_states.history IS 'Histórico de turnos: [{role, message, intent, action, timestamp}]';

-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: Atualizar updated_at automaticamente
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger para agent_flows
DROP TRIGGER IF EXISTS update_agent_flows_updated_at ON agent_flows;
CREATE TRIGGER update_agent_flows_updated_at
    BEFORE UPDATE ON agent_flows
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger para conversation_flow_states
DROP TRIGGER IF EXISTS update_conversation_flow_states_updated_at ON conversation_flow_states;
CREATE TRIGGER update_conversation_flow_states_updated_at
    BEFORE UPDATE ON conversation_flow_states
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ═══════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY (RLS)
-- ═══════════════════════════════════════════════════════════════════════════

-- Habilitar RLS
ALTER TABLE agent_flows ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_flow_states ENABLE ROW LEVEL SECURITY;

-- Políticas para agent_flows
DROP POLICY IF EXISTS agent_flows_select_policy ON agent_flows;
CREATE POLICY agent_flows_select_policy ON agent_flows
    FOR SELECT USING (true); -- Leitura permitida para queries internas

DROP POLICY IF EXISTS agent_flows_insert_policy ON agent_flows;
CREATE POLICY agent_flows_insert_policy ON agent_flows
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS agent_flows_update_policy ON agent_flows;
CREATE POLICY agent_flows_update_policy ON agent_flows
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS agent_flows_delete_policy ON agent_flows;
CREATE POLICY agent_flows_delete_policy ON agent_flows
    FOR DELETE USING (true);

-- Políticas para conversation_flow_states
DROP POLICY IF EXISTS conv_flow_states_select_policy ON conversation_flow_states;
CREATE POLICY conv_flow_states_select_policy ON conversation_flow_states
    FOR SELECT USING (true);

DROP POLICY IF EXISTS conv_flow_states_insert_policy ON conversation_flow_states;
CREATE POLICY conv_flow_states_insert_policy ON conversation_flow_states
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS conv_flow_states_update_policy ON conversation_flow_states;
CREATE POLICY conv_flow_states_update_policy ON conversation_flow_states
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS conv_flow_states_delete_policy ON conversation_flow_states;
CREATE POLICY conv_flow_states_delete_policy ON conversation_flow_states
    FOR DELETE USING (true);

-- ═══════════════════════════════════════════════════════════════════════════
-- FUNÇÃO: Limpar estados antigos (conversas sem atividade > 24h)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION cleanup_old_flow_states()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM conversation_flow_states
    WHERE updated_at < NOW() - INTERVAL '24 hours';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION cleanup_old_flow_states IS 'Remove estados de conversa inativos há mais de 24h';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFICAÇÃO
-- ═══════════════════════════════════════════════════════════════════════════

-- Verificar se as tabelas foram criadas
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'agent_flows') THEN
        RAISE NOTICE '✅ Tabela agent_flows criada com sucesso!';
    END IF;
    
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'conversation_flow_states') THEN
        RAISE NOTICE '✅ Tabela conversation_flow_states criada com sucesso!';
    END IF;
END $$;
