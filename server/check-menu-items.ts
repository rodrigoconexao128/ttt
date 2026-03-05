#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkMenuItems() {
  try {
    const userId = 'f63bd20f-4f72-4ffe-8c77-ca1fcef3852e';

    console.log('\n📊 Verificando menu_items do usuário de teste...\n');

    const { rows: items } = await pool.query(`
      SELECT *
      FROM menu_items
      WHERE user_id = $1
      ORDER BY created_at DESC;
    `, [userId]);

    console.log(`✅ ${items.length} produto(s) encontrado(s)!\n`);

    items.forEach(item => {
      console.log(`📦 ${item.name}`);
      console.log(`   Preço: R$ ${item.price}`);
      console.log(`   Preço Promocional: ${item.promotional_price ? `R$ ${item.promotional_price}` : 'N/A'}`);
      console.log(`   Descrição: ${item.description || 'N/A'}`);
      console.log(`   Disponível: ${item.is_available ? 'Sim' : 'Não'}`);
      console.log(`   Destaque: ${item.is_featured ? 'Sim' : 'Não'}`);
      console.log(`   Tempo de preparo: ${item.preparation_time || 'N/A'} min`);
      console.log(`   Ingredientes: ${item.ingredients || 'N/A'}`);
      console.log(`   Categoria: ${item.category_id || 'Sem categoria'}\n`);
    });

    // Buscar categorias
    const { rows: cats } = await pool.query(`
      SELECT *
      FROM menu_categories
      WHERE user_id = $1
      ORDER BY display_order;
    `, [userId]);

    console.log(`\n📂 ${cats.length} categoria(s) encontrada(s):\n`);
    cats.forEach(cat => {
      console.log(`   - ${cat.name}`);
      if (cat.description) console.log(`     ${cat.description}`);
    });

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

checkMenuItems().then(() => {
  console.log('\n✅ Verificação completa!');
  process.exit(0);
});
