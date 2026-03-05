import dotenv from 'dotenv';
dotenv.config();

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function resetPassword() {
  const userId = '3b5fb16c-27d0-4877-8e2e-28b21887c2ba';
  const newPassword = 'Teste123!';
  
  console.log('Definindo senha para usuário teste...');
  console.log('SUPABASE_URL:', supabaseUrl ? 'OK' : 'NÃO CONFIGURADO');
  
  const { data, error } = await supabase.auth.admin.updateUserById(userId, {
    password: newPassword
  });
  
  if (error) {
    console.error('❌ Erro:', error.message);
    process.exit(1);
  }
  
  console.log('✅ Senha definida com sucesso!');
  console.log('Email: teste@teste.com');
  console.log('Senha: Teste123!');
}

resetPassword();
