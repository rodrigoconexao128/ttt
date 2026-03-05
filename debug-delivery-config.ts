/**
 * 🔍 SCRIPT PARA BUSCAR USER_ID DO bigacaicuiaba@gmail.com
 * E VERIFICAR CONFIGURAÇÃO DE DELIVERY
 */

import { createClient } from '@supabase/supabase-js';

// Configuração direta do Supabase (chaves de produção)
const supabase = createClient(
  'https://bnfpcuzjvycudccycqqt.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM'
);

async function debugDeliveryConfig() {
  console.log('\n🔍 Buscando configuração de delivery para bigacaicuiaba@gmail.com...\n');

  // 1. Buscar usuário
  const { data: users, error: userError } = await supabase
    .from('users')
    .select('id, email, created_at')
    .eq('email', 'bigacaicuiaba@gmail.com');

  if (userError) {
    console.error('❌ Erro ao buscar usuário:', userError);
    return;
  }

  if (!users || users.length === 0) {
    console.log('⚠️ Usuário não encontrado com email bigacaicuiaba@gmail.com');
    return;
  }

  const user = users[0];
  console.log(`✅ Usuário encontrado:`);
  console.log(`   ID: ${user.id}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Criado em: ${user.created_at}\n`);

  const userId = user.id;

  // 2. Buscar configuração de delivery
  const { data: config, error: configError } = await supabase
    .from('delivery_config')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (configError && configError.code !== 'PGRST116') {
    console.error('❌ Erro ao buscar config de delivery:', configError);
    return;
  }

  if (!config) {
    console.log('⚠️ Nenhuma configuração de delivery encontrada');
    return;
  }

  console.log(`✅ Configuração de Delivery:`);
  console.log(`   Ativo: ${config.is_active ? '✅' : '❌'}`);
  console.log(`   Enviar para IA: ${config.send_to_ai ? '✅' : '❌'}`);
  console.log(`   Nome do negócio: ${config.business_name}`);
  console.log(`   Tipo: ${config.business_type}`);
  console.log(`   Taxa de entrega: R$ ${config.delivery_fee}`);
  console.log(`   Pedido mínimo: R$ ${config.min_order_value}`);
  console.log(`   Tempo estimado: ${config.estimated_delivery_time} min\n`);

  // 3. Buscar categorias
  const { data: categories, error: catError } = await supabase
    .from('menu_categories')
    .select('id, name, display_order, is_active')
    .eq('user_id', userId)
    .order('display_order', { ascending: true });

  if (catError) {
    console.error('❌ Erro ao buscar categorias:', catError);
  } else {
    console.log(`✅ Categorias (${categories?.length || 0}):`);
    categories?.forEach(cat => {
      console.log(`   ${cat.is_active ? '✅' : '❌'} ${cat.name} (ordem: ${cat.display_order})`);
    });
    console.log('');
  }

  // 4. Buscar itens do menu
  const { data: items, error: itemsError } = await supabase
    .from('menu_items')
    .select(`
      id, name, description, price, promotional_price, 
      category_id, preparation_time, ingredients, serves, is_featured, is_available,
      display_order,
      menu_categories(name)
    `)
    .eq('user_id', userId)
    .order('display_order', { ascending: true });

  if (itemsError) {
    console.error('❌ Erro ao buscar itens:', itemsError);
  } else {
    console.log(`✅ Itens do Menu (${items?.length || 0}):`);
    
    // Agrupar por categoria
    const byCategory = new Map<string, any[]>();
    items?.forEach(item => {
      const catName = (item.menu_categories as any)?.name || 'Sem Categoria';
      if (!byCategory.has(catName)) {
        byCategory.set(catName, []);
      }
      byCategory.get(catName)!.push(item);
    });

    for (const [catName, catItems] of byCategory.entries()) {
      console.log(`\n   📁 ${catName}:`);
      catItems.forEach(item => {
        const available = item.is_available ? '✅' : '❌';
        const featured = item.is_featured ? '⭐' : '  ';
        const price = item.promotional_price 
          ? `~R$ ${item.price}~ R$ ${item.promotional_price}` 
          : `R$ ${item.price}`;
        console.log(`      ${available} ${featured} ${item.name} - ${price}`);
        if (!item.is_available) {
          console.log(`         ⚠️ Item INDISPONÍVEL - não será enviado no cardápio`);
        }
      });
    }
  }

  console.log(`\n${'='.repeat(70)}\n`);
  console.log(`📊 RESUMO:`);
  console.log(`   Total de categorias: ${categories?.length || 0}`);
  console.log(`   Total de itens: ${items?.length || 0}`);
  console.log(`   Itens disponíveis: ${items?.filter(i => i.is_available).length || 0}`);
  console.log(`   Itens indisponíveis: ${items?.filter(i => !i.is_available).length || 0}`);
  console.log(`\n${'='.repeat(70)}\n`);
}

debugDeliveryConfig().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
