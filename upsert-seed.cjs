const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const supabaseServiceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MjM1MzM4OSwiZXhwIjoyMDc3OTI5Mzg5fQ.EIfKg_UwNVTtSiXa5L6eVYfl6_zlJU1m7EGP0jXa0us';

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

(async () => {
  console.log('🔍 Atualizando delivery_config com UPSERT...');
  
  const { data, error } = await supabase
    .from('delivery_config')
    .upsert({
      user_id: '811c0403-ee01-4d60-8101-9b9e80684384',
      business_name: 'Novo Sabor Pizza e Esfihas e Acai',
      business_type: 'pizzaria',
      delivery_fee: 5,
      min_order_value: 20,
      estimated_delivery_time: 45,
      accepts_delivery: true,
      accepts_pickup: true,
      accepts_cancellation: true,
      payment_methods: ['Dinheiro', 'Cartao', 'Pix'],
      is_active: true
    }, {
      onConflict: 'user_id'
    })
    .select();
  
  if (error) {
    console.error('❌ ERRO:', JSON.stringify(error, null, 2));
    process.exit(1);
  }
  
  console.log('✅ SUCESSO!');
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
})();
