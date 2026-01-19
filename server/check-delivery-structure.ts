#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkStructure() {
  try {
    // 1. Ver estrutura de delivery_menu_items
    console.log('\n📋 Estrutura de delivery_menu_items:\n');
    const { rows: cols } = await pool.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'delivery_menu_items'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    cols.forEach(c => {
      console.log(`   - ${c.column_name}: ${c.data_type} ${c.is_nullable === 'NO' ? '(NOT NULL)' : ''}`);
    });

    // 2. Ver alguns produtos
    console.log('\n\n🍕 Exemplos de produtos (últimos 5):\n');
    const { rows: items } = await pool.query(`
      SELECT *
      FROM delivery_menu_items
      ORDER BY created_at DESC
      LIMIT 5;
    `);

    items.forEach(item => {
      console.log(`\n   📦 ID: ${item.id}`);
      console.log(`      Nome: ${item.name || 'N/A'}`);
      console.log(`      Preço: ${item.price || 'N/A'}`);
      console.log(`      Descrição: ${item.description || 'N/A'}`);
      console.log(`      Delivery Config ID: ${item.delivery_config_id || 'N/A'}`);
    });

    // 3. Ver estrutura de delivery_config
    console.log('\n\n📋 Estrutura de delivery_config:\n');
    const { rows: configCols } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'delivery_config'
        AND table_schema = 'public'
      ORDER BY ordinal_position;
    `);

    configCols.forEach(c => {
      console.log(`   - ${c.column_name}: ${c.data_type}`);
    });

    // 4. Buscar delivery_config do usuário de teste
    console.log('\n\n🔧 Delivery configs do usuário de teste:\n');
    const { rows: configs } = await pool.query(`
      SELECT *
      FROM delivery_config
      WHERE user_id = $1;
    `, ['f63bd20f-4f72-4ffe-8c77-ca1fcef3852e']);

    if (configs.length > 0) {
      console.log(`✅ ${configs.length} config(s) encontrada(s):`);
      configs.forEach(cfg => {
        console.log(`\n   📌 Config ID: ${cfg.id}`);
        console.log(`      Ativo: ${cfg.is_active ? 'Sim' : 'Não'}`);
        console.log(`      Business Name: ${cfg.business_name || 'N/A'}`);
      });

      // 5. Buscar produtos deste delivery_config
      console.log('\n\n🍕 Produtos deste delivery_config:\n');
      const { rows: userItems } = await pool.query(`
        SELECT *
        FROM delivery_menu_items
        WHERE delivery_config_id = $1;
      `, [configs[0].id]);

      console.log(`✅ ${userItems.length} produto(s) encontrado(s):\n`);
      userItems.forEach(item => {
        console.log(`   📦 ${item.name}`);
        console.log(`      Preço: R$ ${item.price}`);
        console.log(`      Descrição: ${item.description || 'N/A'}`);
        console.log(`      Disponível: ${item.available ? 'Sim' : 'Não'}\n`);
      });
    } else {
      console.log('⚠️  Nenhum delivery_config encontrado');
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

checkStructure().then(() => {
  console.log('\n✅ Verificação completa!');
  process.exit(0);
});
