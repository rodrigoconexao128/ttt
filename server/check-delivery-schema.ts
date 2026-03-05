#!/usr/bin/env node
import { Pool } from "pg";
import * as dotenv from "dotenv";

dotenv.config();

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL must be set");
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

async function checkDeliverySchema() {
  console.log('\n🔍 INVESTIGANDO ESTRUTURA DE DELIVERY NO BANCO\n');
  console.log('═══════════════════════════════════════════════════════════\n');

  try {
    // 1. Verificar tabelas relacionadas a delivery
    console.log('📋 Buscando tabelas relacionadas a delivery/produtos...\n');
    const { rows: tables } = await pool.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND (
          table_name LIKE '%delivery%'
          OR table_name LIKE '%product%'
          OR table_name LIKE '%menu%'
          OR table_name LIKE '%item%'
          OR table_name LIKE '%cardapio%'
        )
      ORDER BY table_name;
    `);

    console.log(`✅ Encontradas ${tables.length} tabela(s):`);
    tables.forEach(t => console.log(`   - ${t.table_name}`));

    // 2. Verificar campos do agent_config
    console.log('\n📝 Verificando campos de agent_config...\n');
    const { rows: columns } = await pool.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'agent_configs'
        AND table_schema = 'public'
        AND (
          column_name LIKE '%delivery%'
          OR column_name LIKE '%product%'
          OR column_name LIKE '%menu%'
          OR column_name LIKE '%cardapio%'
        )
      ORDER BY column_name;
    `);

    console.log(`✅ Encontrados ${columns.length} campo(s) relacionados:`);
    columns.forEach(c => console.log(`   - ${c.column_name} (${c.data_type})`));

    // 3. Verificar dados do usuário de teste
    console.log('\n🔎 Verificando dados do usuário de teste...\n');
    const userId = 'f63bd20f-4f72-4ffe-8c77-ca1fcef3852e';

    const { rows: agentConfigs } = await pool.query(`
      SELECT *
      FROM agent_configs
      WHERE user_id = $1;
    `, [userId]);

    if (agentConfigs.length > 0) {
      const config = agentConfigs[0];
      const deliveryKeys = Object.keys(config).filter(k =>
        k.toLowerCase().includes('delivery') ||
        k.toLowerCase().includes('product') ||
        k.toLowerCase().includes('menu') ||
        k.toLowerCase().includes('cardapio')
      );

      console.log(`✅ Configuração encontrada! Campos de delivery:`);
      deliveryKeys.forEach(key => {
        const value = config[key];
        if (value !== null && value !== undefined) {
          console.log(`\n   📌 ${key}:`);
          if (typeof value === 'object') {
            console.log(`   ${JSON.stringify(value, null, 2).split('\n').join('\n   ')}`);
          } else {
            console.log(`   ${value}`);
          }
        }
      });
    } else {
      console.log('⚠️  Nenhuma configuração encontrada para este usuário');
    }

    // 4. Tentar buscar produtos em possíveis tabelas
    console.log('\n\n🔎 Buscando produtos do usuário nas possíveis tabelas...\n');

    const possibleTables = tables.map(t => t.table_name).filter(name =>
      name.includes('item') || name.includes('product') || name.includes('menu') || name.includes('cardapio')
    );

    for (const tableName of possibleTables) {
      try {
        const { rows } = await pool.query(`
          SELECT *
          FROM ${tableName}
          WHERE user_id = $1
          LIMIT 5;
        `, [userId]);

        if (rows.length > 0) {
          console.log(`✅ ${tableName}: ${rows.length} registro(s)`);
          console.log(JSON.stringify(rows, null, 2));
          console.log('\n');
        }
      } catch (e: any) {
        if (!e.message.includes('column "user_id" does not exist')) {
          console.log(`⚠️  Erro em "${tableName}":`, e.message);
        }
      }
    }

  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    await pool.end();
  }
}

checkDeliverySchema().then(() => {
  console.log('\n✅ Investigação completa!');
  process.exit(0);
}).catch(err => {
  console.error('❌ Erro:', err);
  process.exit(1);
});
