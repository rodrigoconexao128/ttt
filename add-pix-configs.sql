-- Adicionar configurações de nome do comerciante e cidade ao sistema
-- Executar no Supabase SQL Editor

INSERT INTO system_config (chave, valor) 
VALUES 
  ('merchant_name', 'RODRIGO MACEDO'),
  ('merchant_city', 'COSMORAMA')
ON CONFLICT (chave) 
DO UPDATE SET 
  valor = EXCLUDED.valor, 
  updated_at = NOW()
RETURNING *;
