#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkCategories() {
  try {
    // Estrutura de categories
    console.log('\n📋 Estrutura de delivery_menu_categories:\n');
    const { rows: cols } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'delivery_menu_categories'
      ORDER BY ordinal_position;
    `);

    cols.forEach(c => console.log(`   - ${c.column_name}: ${c.data_type}`));

    // Ver categorias do usuário
    console.log('\n\n🔎 Categorias criadas:\n');
    const { rows: cats } = await pool.query(`
      SELECT *
      FROM delivery_menu_categories
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    cats.forEach(cat => {
      console.log(`\n   📂 ${cat.name}`);
      console.log(`      ID: ${cat.id}`);
      console.log(`      user_id: ${cat.user_id || 'N/A'}`);
      console.log(`      delivery_config_id: ${cat.delivery_config_id || 'N/A'}`);
    });

    // Ver se category tem link para menu_items
    console.log('\n\n🔗 Verificando vínculo com menu_items:\n');
    const userId = 'f63bd20f-4f72-4ffe-8c77-ca1fcef3852e';

    // Pegar delivery_config_id do usuário
    const { rows: configs } = await pool.query(`
      SELECT id FROM delivery_config WHERE user_id = $1;
    `, [userId]);

    if (configs.length > 0) {
      const configId = configs[0].id;
      console.log(`   ✅ Delivery Config ID: ${configId}\n`);

      // Pegar categorias desse config
      const { rows: userCats } = await pool.query(`
        SELECT * FROM delivery_menu_categories WHERE delivery_config_id = $1;
      `, [configId]);

      console.log(`   📂 Categorias deste usuário: ${userCats.length}`);
      userCats.forEach(cat => console.log(`      - ${cat.name} (ID: ${cat.id})`));

      if (userCats.length > 0) {
        // Pegar itens dessas categorias
        console.log('\n   🍕 Itens dessas categorias:\n');
        for (const cat of userCats) {
          const { rows: items } = await pool.query(`
            SELECT * FROM delivery_menu_items WHERE category_id = $1;
          `, [cat.id]);

          if (items.length > 0) {
            console.log(`   📂 ${cat.name}:`);
            items.forEach(item => {
              console.log(`      - ${item.name} - R$ ${item.price}`);
              console.log(`        Descrição: ${item.description || 'N/A'}`);
              console.log(`        Disponível: ${item.available ? 'Sim' : 'Não'}\n`);
            });
          }
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

checkCategories().then(() => {
  console.log('\n✅ Verificação completa!');
  process.exit(0);
});
