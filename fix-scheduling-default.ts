/**
 * Fix: Alterar DEFAULT de is_enabled para FALSE na tabela scheduling_config
 * 
 * MOTIVO: Novos usuários não devem ter agendamento ativado automaticamente.
 * O sistema de agendamento deve ser uma funcionalidade opt-in que o usuário
 * ativa manualmente quando precisa.
 */

import "dotenv/config";
import { sql } from "drizzle-orm";
import { db } from "./server/db.js";

async function fixSchedulingDefault() {
  console.log("🔧 Corrigindo DEFAULT de is_enabled para FALSE...\n");

  try {
    // Verificar se a tabela existe
    const tableCheck = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'scheduling_config'
      );
    `);
    
    console.log("📋 Verificando tabela scheduling_config...");
    
    // Alterar o DEFAULT de is_enabled para FALSE
    await db.execute(sql`
      ALTER TABLE scheduling_config 
      ALTER COLUMN is_enabled SET DEFAULT false;
    `);
    console.log("✅ DEFAULT de is_enabled alterado para FALSE");

    // Verificar a alteração
    const columnInfo = await db.execute(sql`
      SELECT column_name, column_default, is_nullable 
      FROM information_schema.columns 
      WHERE table_name = 'scheduling_config' AND column_name = 'is_enabled';
    `);
    console.log("\n📊 Configuração atual da coluna:");
    console.log(columnInfo.rows);

    // Contar quantos usuários têm agendamento ativo
    const activeCount = await db.execute(sql`
      SELECT COUNT(*) as total, 
             SUM(CASE WHEN is_enabled = true THEN 1 ELSE 0 END) as enabled,
             SUM(CASE WHEN is_enabled = false THEN 1 ELSE 0 END) as disabled
      FROM scheduling_config;
    `);
    console.log("\n📈 Status atual dos agendamentos:");
    console.log(activeCount.rows);

    console.log("\n🎉 Correção concluída com sucesso!");
    console.log("ℹ️  Novos usuários agora começam com agendamento DESATIVADO por padrão.");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro na correção:", error);
    process.exit(1);
  }
}

fixSchedulingDefault();
