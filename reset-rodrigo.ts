
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ SUPABASE_URL ou SUPABASE_SERVICE_KEY não configurados!');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function main() {
  const email = 'rodrigoconexao128@gmail.com'; 
  const newPassword = '123456'; 
  
  console.log('🔍 Buscando usuários no Supabase Auth...');
  
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
  
  if (listError) {
    console.error('❌ Erro ao listar usuários:', listError);
    process.exit(1);
  }
  
  let user = users.find(u => u.email === email);
  
  if (!user) {
    console.log(`⚠️ Usuário com email ${email} não encontrado no Supabase Auth! Criando...`);
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
    return;
  }
  
  console.log(`✅ Usuário encontrado: ${user.id}`);
  
  console.log('\n🔧 Atualizando senha...');
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    user.id,
    { 
      password: newPassword,
      email_confirm: true 
    }
  );
  
  if (updateError) {
    console.error('❌ Erro ao atualizar senha:', updateError);
    process.exit(1);
  }
  
  console.log('✅ Senha atualizada com sucesso!');
}

main();
