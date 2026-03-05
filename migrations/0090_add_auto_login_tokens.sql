-- Tabela para tokens de auto-login (conexão e planos)
CREATE TABLE IF NOT EXISTS auto_login_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token VARCHAR(255) UNIQUE NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  purpose VARCHAR(50) NOT NULL, -- 'connection' ou 'plans'
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  
  INDEX idx_auto_login_tokens_token (token),
  INDEX idx_auto_login_tokens_user (user_id),
  INDEX idx_auto_login_tokens_expires (expires_at)
);

-- Limpar tokens expirados automaticamente (opcional)
CREATE INDEX IF NOT EXISTS idx_auto_login_tokens_cleanup ON auto_login_tokens(expires_at) WHERE used_at IS NULL;
