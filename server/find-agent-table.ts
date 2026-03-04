#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function findAgentTable() {
  try {
    const { rows } = await pool.query(`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename LIKE '%agent%'
      ORDER BY tablename;
    `);

    console.log('\n📋 Tabelas com "agent" no nome:\n');
    rows.forEach(r => console.log(`   - ${r.tablename}`));

    // Buscar produtos
    console.log('\n\n🍕 Produtos do usuário de teste:\n');
    const { rows: items } = await pool.query(`
      SELECT *
      FROM delivery_menu_items
      WHERE user_id = $1;
    `, ['f63bd20f-4f72-4ffe-8c77-ca1fcef3852e']);

    console.log(`✅ Encontrados ${items.length} produto(s):\n`);
    items.forEach(item => {
      console.log(`   📦 ${item.name}`);
      console.log(`      Preço: R$ ${item.price}`);
      console.log(`      Descrição: ${item.description || 'N/A'}`);
      console.log(`      Disponível: ${item.available ? 'Sim' : 'Não'}`);
      console.log(`      Categoria: ${item.category_id || 'Sem categoria'}\n`);
    });

    // Verificar config de delivery
    console.log('\n🔧 Configuração de delivery:\n');
    const { rows: config } = await pool.query(`
      SELECT *
      FROM delivery_config
      WHERE user_id = $1;
    `, ['f63bd20f-4f72-4ffe-8c77-ca1fcef3852e']);

    if (config.length > 0) {
      console.log('✅ Configuração encontrada:');
      console.log(JSON.stringify(config[0], null, 2));
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

findAgentTable().then(() => process.exit(0));
