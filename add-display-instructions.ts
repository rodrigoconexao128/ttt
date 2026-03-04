import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function addDisplayInstructionsColumns() {
  console.log('🔧 Adicionando colunas display_instructions...\n');

  // Adicionar coluna em delivery_config
  try {
    const { error: deliveryError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE delivery_config 
        ADD COLUMN IF NOT EXISTS display_instructions TEXT 
        DEFAULT 'Quando o cliente pedir o cardápio, liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria.';
      `
    });
    
    if (deliveryError) {
      console.log('⚠️ delivery_config (tentando método alternativo):', deliveryError.message);
      
      // Tentar diretamente
      const { error: err2 } = await supabase
        .from('delivery_config')
        .update({ display_instructions: 'Quando o cliente pedir o cardápio, liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria.' })
        .is('display_instructions', null);
        
      if (err2 && !err2.message.includes('column')) {
        console.log('   Pode ser que a coluna já exista ou precisa ser criada manualmente');
      }
    } else {
      console.log('✅ delivery_config.display_instructions adicionada');
    }
  } catch (e: any) {
    console.log('⚠️ delivery_config:', e.message);
  }

  // Adicionar coluna em products_config
  try {
    const { error: productsError } = await supabase.rpc('exec_sql', {
      sql: `
        ALTER TABLE products_config 
        ADD COLUMN IF NOT EXISTS display_instructions TEXT 
        DEFAULT 'Quando o cliente pedir a lista de produtos, mostre cada produto em uma linha com nome, preço e disponibilidade.';
      `
    });
    
    if (productsError) {
      console.log('⚠️ products_config (tentando método alternativo):', productsError.message);
    } else {
      console.log('✅ products_config.display_instructions adicionada');
    }
  } catch (e: any) {
    console.log('⚠️ products_config:', e.message);
  }

  console.log('\n📝 Se as colunas não foram criadas, execute manualmente no Supabase:');
  console.log(`
ALTER TABLE delivery_config 
ADD COLUMN IF NOT EXISTS display_instructions TEXT 
DEFAULT 'Quando o cliente pedir o cardápio, liste cada item em uma linha separada com emoji, nome e preço. Organize por categoria.';

ALTER TABLE products_config 
ADD COLUMN IF NOT EXISTS display_instructions TEXT 
DEFAULT 'Quando o cliente pedir a lista de produtos, mostre cada produto em uma linha com nome, preço e disponibilidade.';
  `);
}

addDisplayInstructionsColumns();
