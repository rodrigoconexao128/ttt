#!/usr/bin/env node
/**
 * Script para verificar tipos de negócios disponíveis no sistema
 */

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

async function checkBusinessTypes() {
  console.log("\n🔍 VERIFICANDO TIPOS DE NEGÓCIOS NO SISTEMA\n");
  console.log("═══════════════════════════════════════════════════════════\n");

  try {
    // 1. Verificar usuários ativos
    console.log("📊 Usuários no sistema:");
    const { rows: users } = await pool.query(`
      SELECT id, email, name, created_at
      FROM users
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`   Total encontrado: ${users.length}\n`);
    users.forEach((u, i) => {
      console.log(`   ${i+1}. ${u.email || u.name || u.id}`);
    });

    // 2. Verificar configurações de módulos
    console.log("\n📦 MÓDULOS CONFIGURADOS:\n");

    // Delivery
    const { rows: deliveryConfigs } = await pool.query(`
      SELECT user_id, is_active, send_to_ai, business_name
      FROM delivery_config
      WHERE is_active = true
      LIMIT 5
    `);
    console.log(`   🍕 Delivery: ${deliveryConfigs.length} ativo(s)`);
    deliveryConfigs.forEach(d => console.log(`      - ${d.business_name || d.user_id}`));

    // Produtos/Catálogo
    const { rows: productsConfigs } = await pool.query(`
      SELECT user_id, is_active, send_to_ai
      FROM products_config
      WHERE is_active = true
      LIMIT 5
    `);
    console.log(`   🛍️ Produtos/Catálogo: ${productsConfigs.length} ativo(s)`);

    // Agendamento
    const { rows: schedulingConfigs } = await pool.query(`
      SELECT user_id, is_enabled
      FROM scheduling_config
      WHERE is_enabled = true
      LIMIT 5
    `);
    console.log(`   📅 Agendamento: ${schedulingConfigs.length} ativo(s)`);

    // Curso
    const { rows: courseConfigs } = await pool.query(`
      SELECT user_id, is_active, course_name
      FROM course_config
      WHERE is_active = true
      LIMIT 5
    `);
    console.log(`   📚 Curso: ${courseConfigs.length} ativo(s)`);
    courseConfigs.forEach(c => console.log(`      - ${c.course_name || c.user_id}`));

    // 3. Verificar VIEW user_active_modules
    console.log("\n🎯 MÓDULOS ATIVOS POR USUÁRIO (via VIEW):\n");
    const { rows: activeModules } = await pool.query(`
      SELECT user_id, active_module
      FROM user_active_modules
      LIMIT 10
    `);

    const moduleCount: Record<string, number> = {};
    activeModules.forEach(m => {
      moduleCount[m.active_module] = (moduleCount[m.active_module] || 0) + 1;
    });

    Object.entries(moduleCount).forEach(([module, count]) => {
      console.log(`   ${module}: ${count} usuário(s)`);
    });

    // 4. Verificar agentes configurados
    console.log("\n🤖 AGENTES DE IA CONFIGURADOS:\n");
    const { rows: agents } = await pool.query(`
      SELECT user_id, is_active, prompt
      FROM ai_agent_config
      WHERE is_active = true
      ORDER BY created_at DESC
      LIMIT 5
    `);
    console.log(`   Total: ${agents.length} agente(s) ativo(s)\n`);
    agents.forEach((a, i) => {
      console.log(`   ${i+1}. User: ${a.user_id.substring(0, 8)}...`);
      console.log(`      Prompt: ${a.prompt?.substring(0, 80)}...`);
    });

    // 5. Verificar fluxos já criados
    console.log("\n🎯 FLUXOS DETERMINÍSTICOS JÁ CRIADOS:\n");
    const { rows: flows } = await pool.query(`
      SELECT user_id, flow_type, agent_name, business_name, is_active, created_at
      FROM flow_definitions
      ORDER BY created_at DESC
      LIMIT 10
    `);
    console.log(`   Total: ${flows.length} fluxo(s)\n`);
    flows.forEach((f, i) => {
      console.log(`   ${i+1}. ${f.flow_type} - ${f.business_name || 'Sem nome'} (${f.is_active ? 'ATIVO' : 'inativo'})`);
    });

    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("✅ Verificação concluída!\n");

  } catch (error: any) {
    console.error("\n❌ Erro:", error.message);
  } finally {
    await pool.end();
  }
}

checkBusinessTypes();
