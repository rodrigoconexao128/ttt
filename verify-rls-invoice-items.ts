import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function verifyRLS() {
  console.log("🔍 Verificando RLS na tabela reseller_invoice_items...\n");

  try {
    // Verificar se RLS está habilitado
    const rlsStatus = await db.execute(sql`
      SELECT 
        tablename,
        rowsecurity 
      FROM pg_tables 
      WHERE schemaname = 'public' 
        AND tablename = 'reseller_invoice_items';
    `);

    console.log("📊 Status RLS:");
    console.log(rlsStatus.rows[0]);
    console.log();

    // Listar todas as políticas
    const policies = await db.execute(sql`
      SELECT 
        policyname,
        cmd,
        roles,
        qual,
        with_check
      FROM pg_policies 
      WHERE tablename = 'reseller_invoice_items'
      ORDER BY policyname;
    `);

    console.log(`\n📋 Políticas encontradas (${policies.rows.length}):\n`);
    policies.rows.forEach((policy: any, index: number) => {
      console.log(`${index + 1}. ${policy.policyname}`);
      console.log(`   Comando: ${policy.cmd}`);
      console.log(`   Roles: ${policy.roles}`);
      console.log();
    });

    console.log("✅ Verificação concluída!");

  } catch (error) {
    console.error("❌ Erro ao verificar RLS:", error);
    throw error;
  }
}

// Executar
verifyRLS()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Verificação falhou:", error);
    process.exit(1);
  });
