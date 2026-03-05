import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const supabaseUrl = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us'; // Service role key para bypass RLS

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function seedDelivery() {
  const userId = '811c0403-ee01-4d60-8101-9b9e80684384'; // bigacaicuiaba@gmail.com
  
  // 1. Criar delivery_config
  const { data: configData, error: configError } = await supabase
    .from('delivery_config')
    .insert({
      user_id: userId,
      business_name: 'Novo Sabor Pizza e Esfihas e Acai',
      business_type: 'pizzaria',
      delivery_fee: 5,
      min_order_value: 20,
      estimated_delivery_time: 45,
      accepts_delivery: true,
      accepts_pickup: true,
      accepts_cancellation: true,
      payment_methods: ['Dinheiro', 'Cartao', 'Pix'],
      is_active: true,
      allow_customer_cancel: true,
      enable_sound_notification: true
    })
    .select()
    .single();
  
  if (configError) {
    console.error('❌ Erro ao criar delivery_config:', configError);
    console.error('❌ Detalhes:', JSON.stringify(configError, null, 2));
    return;
  }
  
  console.log('✅ Delivery config criado:', JSON.stringify(configData, null, 2));
  
  // 2. Criar categorias
  const categories = [
    { user_id: userId, name: 'Pizzas', display_order: 1 },
    { user_id: userId, name: 'Esfihas', display_order: 2 },
    { user_id: userId, name: 'Bebidas', display_order: 3 }
  ];
  
  const { data: categoriesData, error: categoriesError } = await supabase
    .from('menu_categories')
    .insert(categories)
    .select();
  
  if (categoriesError) {
    console.error('❌ Erro ao criar categorias:', categoriesError);
    return;
  }
  
  console.log('✅ Categorias criadas:', categoriesData);
  
  // 3. Criar alguns itens de exemplo
  const pizzaCategoryId = categoriesData.find(c => c.name === 'Pizzas')!.id;
  const esfihaCategoryId = categoriesData.find(c => c.name === 'Esfihas')!.id;
  const bebidaCategoryId = categoriesData.find(c => c.name === 'Bebidas')!.id;
  
  const items = [
    { user_id: userId, category_id: pizzaCategoryId, name: 'Pizza Calabresa', description: 'Molho, mussarela, calabresa, cebola', price: 45, display_order: 1, is_available: true },
    { user_id: userId, category_id: pizzaCategoryId, name: 'Pizza Mussarela', description: 'Molho, mussarela, tomate', price: 40, display_order: 2, is_available: true },
    { user_id: userId, category_id: esfihaCategoryId, name: 'Esfiha Carne', description: 'Esfiha aberta com carne temperada', price: 4, display_order: 1, is_available: true },
    { user_id: userId, category_id: esfihaCategoryId, name: 'Esfiha Queijo', description: 'Esfiha aberta com queijo mussarela', price: 4, display_order: 2, is_available: true },
    { user_id: userId, category_id: bebidaCategoryId, name: 'Refrigerante Lata', description: 'Coca-Cola, Guaraná, Fanta', price: 7, display_order: 1, is_available: true }
  ];
  
  const { data: itemsData, error: itemsError } = await supabase
    .from('menu_items')
    .insert(items)
    .select();
  
  if (itemsError) {
    console.error('❌ Erro ao criar itens:', itemsError);
    return;
  }
  
  console.log('✅ Itens criados:', itemsData);
  console.log('\n🎉 Seed de delivery concluído com sucesso!');
}

seedDelivery().catch(console.error);
