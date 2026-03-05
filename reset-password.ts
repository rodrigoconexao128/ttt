import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us'
);

async function resetPassword() {
  let allUsers: any[] = [];
  let page = 1;
  let perPage = 1000;
  
  // Buscar todos os usuários com paginação
  const { data: result, error: listError } = await supabase.auth.admin.listUsers({
    page,
    perPage
  });
  
  if (listError) {
    console.log('Erro ao listar usuarios:', listError);
    return;
  }
  
  allUsers = result.users;
  console.log('Total de usuarios:', allUsers.length);
  
  const user = allUsers.find(u => u.email === 'rodrigo4@gmail.com');
  if (!user) {
    // Tentar buscar especificamente por ID do banco local
    console.log('\nUsuario rodrigo4@gmail.com nao encontrado na listagem');
    console.log('Tentando buscar pelo ID do banco local: cb9213c3-fde3-479e-a4aa-344171c59735');
    
    const { data: userById, error: errorById } = await supabase.auth.admin.getUserById('cb9213c3-fde3-479e-a4aa-344171c59735');
    
    if (errorById || !userById.user) {
      console.log('Erro ao buscar por ID:', errorById);
      console.log('\nUsuario precisa ser recriado. Deletando e recriando...');
      
      // Deletar se existir no Auth (diferente ID)
      const existingUser = allUsers.find(u => u.email === 'rodrigo4@gmail.com');
      if (existingUser) {
        await supabase.auth.admin.deleteUser(existingUser.id);
        console.log('Usuario deletado:', existingUser.id);
      }
      
      // Criar o usuário com o ID correto
      const { data: newUser, error: createError } = await supabase.auth.admin.createUser({
        email: 'rodrigo4@gmail.com',
        password: 'teste123',
        email_confirm: true,
        user_metadata: {
          name: 'rodrigo',
          phone: '5517981679818',
        }
      });
      
      if (createError) {
        console.log('Erro ao criar usuario:', createError);
      } else {
        console.log('Usuario criado com sucesso:', newUser.user?.id);
        console.log('IMPORTANTE: Atualize o ID no banco users!');
      }
      return;
    }
    
    console.log('\nUsuario encontrado pelo ID:', userById.user.id, userById.user.email);
    
    // Atualizar senha
    const { data, error } = await supabase.auth.admin.updateUserById(userById.user.id, {
      password: 'teste123'
    });
    
    if (error) {
      console.log('Erro ao atualizar senha:', error);
    } else {
      console.log('Senha atualizada com sucesso para: teste123');
    }
    return;
  }
  
  console.log('\nUsuario encontrado:', user.id);
  
  const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
    password: 'teste123'
  });
  
  if (error) {
    console.log('Erro ao atualizar senha:', error);
  } else {
    console.log('Senha atualizada com sucesso para: teste123');
  }
}

resetPassword();
