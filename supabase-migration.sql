-- WhatsApp CRM SaaS - Supabase Migration Script
-- Este script cria todas as tabelas necessárias no Supabase
-- IMPORTANTE: Mantém VARCHAR para compatibilidade com Drizzle ORM

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Session storage table (para express-session)
CREATE TABLE IF NOT EXISTS sessions (
  sid VARCHAR PRIMARY KEY,
  sess JSONB NOT NULL,
  expire TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS IDX_session_expire ON sessions(expire);

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email VARCHAR UNIQUE,
  first_name VARCHAR,
  last_name VARCHAR,
  profile_image_url VARCHAR,
  role VARCHAR(50) DEFAULT 'user' NOT NULL,
  telefone VARCHAR,
  whatsapp_number VARCHAR,
  onboarding_completed BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Admins table
CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  email VARCHAR UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(50) DEFAULT 'admin' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Plans table
CREATE TABLE IF NOT EXISTS plans (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  nome VARCHAR(100) NOT NULL,
  valor DECIMAL(10,2) NOT NULL,
  periodicidade VARCHAR(20) DEFAULT 'mensal' NOT NULL,
  limite_conversas INTEGER DEFAULT 100 NOT NULL,
  limite_agentes INTEGER DEFAULT 1 NOT NULL,
  ativo BOOLEAN DEFAULT true NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Subscriptions table
CREATE TABLE IF NOT EXISTS subscriptions (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan_id VARCHAR NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  data_inicio TIMESTAMP,
  data_fim TIMESTAMP,
  canais_usados INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  subscription_id VARCHAR NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  valor DECIMAL(10,2) NOT NULL,
  pix_code TEXT NOT NULL,
  pix_qr_code TEXT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending' NOT NULL,
  data_pagamento TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- WhatsApp connections table
CREATE TABLE IF NOT EXISTS whatsapp_connections (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  phone_number VARCHAR,
  is_connected BOOLEAN DEFAULT false NOT NULL,
  qr_code TEXT,
  session_data JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Conversations table
CREATE TABLE IF NOT EXISTS conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  connection_id VARCHAR NOT NULL REFERENCES whatsapp_connections(id) ON DELETE CASCADE,
  contact_number VARCHAR NOT NULL,
  contact_name VARCHAR,
  last_message_text TEXT,
  last_message_time TIMESTAMP,
  unread_count INTEGER DEFAULT 0 NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Messages table
CREATE TABLE IF NOT EXISTS messages (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id VARCHAR NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  message_id VARCHAR NOT NULL,
  from_me BOOLEAN NOT NULL,
  text TEXT,
  timestamp TIMESTAMP NOT NULL,
  status VARCHAR(50),
  is_from_agent BOOLEAN DEFAULT false NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- AI Agent Configuration table
CREATE TABLE IF NOT EXISTS ai_agent_config (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id VARCHAR NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  prompt TEXT NOT NULL,
  is_active BOOLEAN DEFAULT false NOT NULL,
  model VARCHAR(100) DEFAULT 'mistral-small-latest' NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Agent disabled conversations table
CREATE TABLE IF NOT EXISTS agent_disabled_conversations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  conversation_id VARCHAR NOT NULL UNIQUE REFERENCES conversations(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- System configuration table
CREATE TABLE IF NOT EXISTS system_config (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid()::text,
  chave VARCHAR(100) UNIQUE NOT NULL,
  valor TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Seed default admin (senha: Ibira2019!)
-- Hash bcrypt para 'Ibira2019!': $2a$10$YourHashHere
INSERT INTO admins (email, password_hash, role)
VALUES ('rodrigoconexao128@gmail.com', '$2a$10$rZ8qN5xK5YvH5xK5YvH5xOqN5xK5YvH5xK5YvH5xK5YvH5xK5YvH5u', 'owner')
ON CONFLICT (email) DO NOTHING;

-- Seed default plans
INSERT INTO plans (nome, valor, periodicidade, limite_conversas, limite_agentes, ativo)
VALUES 
  ('Básico', 99.90, 'mensal', 50, 1, true),
  ('Profissional', 199.90, 'mensal', 200, 3, true),
  ('Empresarial', 499.90, 'mensal', -1, -1, true)
ON CONFLICT DO NOTHING;

-- Seed system config
INSERT INTO system_config (chave, valor)
VALUES 
  ('mistral_api_key', ''),
  ('pix_key', '')
ON CONFLICT (chave) DO NOTHING;

