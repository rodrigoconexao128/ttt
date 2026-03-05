/**
 * Script para verificar problema de login do usuário
 * Execute com: npx tsx check-user-login.ts
 */

import dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(import.meta.dirname, '.env') });

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

const EMAIL_TO_CHECK = 'ivoalvim@gmail.com';

async function checkUser() {
  console.log('\n=== VERIFICAÇÃO DE LOGIN ===\n');
  console.log('📧 Email:', EMAIL_TO_CHECK);
  console.log('🔗 Supabase URL:', supabaseUrl);
  console.log('🔑 Service Key configurada:', supabaseServiceKey ? '✅ Sim' : '❌ Não');
  
  // 1. Verificar se o usuário existe no Supabase Auth
  console.log('\n--- 1. Verificando usuário no Supabase Auth ---');
  try {
    const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers();
    
    if (authError) {
      console.error('❌ Erro ao listar usuários do Auth:', authError.message);
    } else {
      const user = authUsers.users.find(u => u.email === EMAIL_TO_CHECK);
      if (user) {
        console.log('✅ Usuário encontrado no Supabase Auth:');
        console.log('   ID:', user.id);
        console.log('   Email:', user.email);
        console.log('   Email confirmado:', user.email_confirmed_at ? '✅ Sim' : '❌ Não');
        console.log('   Criado em:', user.created_at);
        console.log('   Último login:', user.last_sign_in_at || 'Nunca');
        console.log('   Metadata:', JSON.stringify(user.user_metadata, null, 2));
      } else {
        console.log('❌ Usuário NÃO encontrado no Supabase Auth');
        console.log('   Total de usuários no Auth:', authUsers.users.length);
        console.log('   Lista de emails:');
        authUsers.users.forEach(u => console.log('     -', u.email));
      }
    }
  } catch (e) {
    console.error('❌ Erro ao verificar Auth:', e);
  }
  
  // 2. Verificar se o usuário existe na tabela users do banco
  console.log('\n--- 2. Verificando tabela users (local) ---');
  try {
    const { data: localUser, error: dbError } = await supabase
      .from('users')
      .select('*')
      .eq('email', EMAIL_TO_CHECK)
      .single();
    
    if (dbError) {
      console.log('❌ Usuário NÃO encontrado na tabela users local:', dbError.message);
    } else if (localUser) {
      console.log('✅ Usuário encontrado na tabela users:');
      console.log('   ID:', localUser.id);
      console.log('   Email:', localUser.email);
      console.log('   Nome:', localUser.name);
      console.log('   Telefone:', localUser.phone);
      console.log('   Role:', localUser.role);
      console.log('   Criado em:', localUser.created_at);
    }
  } catch (e: any) {
    console.log('⚠️  Erro ao verificar tabela users:', e.message);
  }

  // 3. Tentar fazer login para verificar credenciais
  console.log('\n--- 3. Verificando se login funciona (apenas teste) ---');
  console.log('⚠️  Não é possível testar sem a senha do usuário');
  console.log('   O usuário precisa tentar fazer login normalmente');
  
  // 4. Verificar configuração do ANON_KEY
  console.log('\n--- 4. Verificando variáveis de ambiente ---');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? '✅ Configurado' : '❌ Não configurado');
  console.log('SUPABASE_ANON_KEY:', process.env.SUPABASE_ANON_KEY ? '✅ Configurado' : '❌ Não configurado');
  console.log('SUPABASE_SERVICE_KEY:', process.env.SUPABASE_SERVICE_KEY ? '✅ Configurado' : '❌ Não configurado');
  console.log('DATABASE_URL:', process.env.DATABASE_URL ? '✅ Configurado' : '❌ Não configurado');
  console.log('VITE_SUPABASE_URL:', process.env.VITE_SUPABASE_URL ? '✅ Configurado' : '❌ Não configurado');
  console.log('VITE_SUPABASE_ANON_KEY:', process.env.VITE_SUPABASE_ANON_KEY ? '✅ Configurado' : '❌ Não configurado');
  
  console.log('\n=== FIM DA VERIFICAÇÃO ===\n');
}

checkUser().catch(console.error);
