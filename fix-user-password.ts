/**
 * Script para corrigir senha de usuário no Supabase
 * Execute com: npx tsx fix-user-password.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as readline from 'readline';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const email = 'ivoalvim@gmail.com'; // Email do usuário
  const newPassword = 'AgentZap2025!'; // Nova senha segura
  
  console.log('🔍 Buscando usuários no Supabase Auth...');
  
  // Listar todos os usuários para encontrar pelo email
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Erro ao listar usuários:', listError);
    process.exit(1);
  }
  
  console.log(`📋 Total de usuários no Supabase Auth: ${users.length}`);
  
  // Encontrar o usuário pelo email
  const user = users.find(u => u.email === email);
  
  if (!user) {
    console.log(`⚠️ Usuário com email ${email} não encontrado no Supabase Auth!`);
    console.log('\n📋 Usuários existentes:');
    users.slice(0, 10).forEach(u => console.log(`  - ${u.email} (ID: ${u.id})`));
    if (users.length > 10) console.log(`  ... e mais ${users.length - 10} usuários`);
    
    // Criar o usuário
    console.log('\n🔧 Criando usuário no Supabase Auth...');
    const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
      email: email,
      password: newPassword,
      email_confirm: true,
    });
    
    if (createError) {
      console.error('❌ Erro ao criar usuário:', createError);
      process.exit(1);
    }
    
    console.log('✅ Usuário criado com sucesso!');
    console.log(`\n📧 Email: ${email}`);
    console.log(`🔑 Senha: ${newPassword}`);
    console.log(`🆔 ID: ${newUser.user.id}`);
    return;
  }
  
  console.log(`\n✅ Usuário encontrado:`);
  console.log(`  - Email: ${user.email}`);
  console.log(`  - ID: ${user.id}`);
  console.log(`  - Criado em: ${user.created_at}`);
  console.log(`  - Confirmado: ${user.email_confirmed_at ? 'Sim' : 'Não'}`);
  
  // Atualizar senha
  console.log('\n🔧 Atualizando senha...');
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { 
      password: newPassword,
      email_confirm: true // Garantir que email está confirmado
    }
  );
  
  if (updateError) {
    console.error('❌ Erro ao atualizar senha:', updateError);
    process.exit(1);
  }
  
  console.log('✅ Senha atualizada com sucesso!');
  console.log(`\n📧 Email: ${email}`);
  console.log(`🔑 Nova Senha: ${newPassword}`);
  console.log('\n🔗 Acesse: https://agentezap.online/login');
  
  // Testar login
  console.log('\n🧪 Testando login...');
  const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
    email: email,
    password: newPassword,
  });
  
  if (signInError) {
    console.error('❌ Erro ao testar login:', signInError);
  } else {
    console.log('✅ Login funcionando! Token gerado com sucesso.');
  }
}

main().catch(console.error);
