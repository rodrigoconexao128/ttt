import "dotenv/config";
import { db } from "./server/db";
import { sql } from "drizzle-orm";

async function enableRLS() {
  console.log("🔒 Habilitando RLS na tabela reseller_invoice_items...\n");

  try {
    // 1. Habilitar RLS na tabela
    await db.execute(sql`
      ALTER TABLE reseller_invoice_items ENABLE ROW LEVEL SECURITY;
    `);
    console.log("✅ RLS habilitado na tabela reseller_invoice_items");

    // 2. Dropar políticas existentes (se houver)
    const policies = [
      "Resellers can view their own invoice items",
      "Resellers can insert their own invoice items",
      "Resellers can update their own invoice items",
      "Resellers can delete their own invoice items",
      "Service role has full access to invoice items"
    ];

    for (const policyName of policies) {
      try {
        await db.execute(sql.raw(`DROP POLICY IF EXISTS "${policyName}" ON reseller_invoice_items;`));
      } catch (e) {
        // Ignorar erros se a política não existir
      }
    }

    // 3. Criar política para permitir que revendedores vejam apenas seus itens
    await db.execute(sql`
      CREATE POLICY "Resellers can view their own invoice items"
      ON reseller_invoice_items
      FOR SELECT
      USING (
        invoice_id IN (
          SELECT id FROM reseller_invoices 
          WHERE reseller_id = auth.uid()::text
        )
      );
    `);
    console.log("✅ Política SELECT criada");

    // 4. Criar política para permitir que revendedores insiram itens em suas faturas
    await db.execute(sql`
      CREATE POLICY "Resellers can insert their own invoice items"
      ON reseller_invoice_items
      FOR INSERT
      WITH CHECK (
        invoice_id IN (
          SELECT id FROM reseller_invoices 
          WHERE reseller_id = auth.uid()::text
        )
      );
    `);
    console.log("✅ Política INSERT criada");

    // 5. Criar política para permitir que revendedores atualizem itens de suas faturas
    await db.execute(sql`
      CREATE POLICY "Resellers can update their own invoice items"
      ON reseller_invoice_items
      FOR UPDATE
      USING (
        invoice_id IN (
          SELECT id FROM reseller_invoices 
          WHERE reseller_id = auth.uid()::text
        )
      );
    `);
    console.log("✅ Política UPDATE criada");

    // 6. Criar política para permitir que revendedores deletem itens de suas faturas
    await db.execute(sql`
      CREATE POLICY "Resellers can delete their own invoice items"
      ON reseller_invoice_items
      FOR DELETE
      USING (
        invoice_id IN (
          SELECT id FROM reseller_invoices 
          WHERE reseller_id = auth.uid()::text
        )
      );
    `);
    console.log("✅ Política DELETE criada");

    // 7. Criar política para service_role (bypass RLS)
    await db.execute(sql`
      CREATE POLICY "Service role has full access to invoice items"
      ON reseller_invoice_items
      FOR ALL
      TO service_role
      USING (true)
      WITH CHECK (true);
    `);
    console.log("✅ Política SERVICE_ROLE criada");

    console.log("\n🎉 RLS configurado com sucesso na tabela reseller_invoice_items!");
    console.log("\nPolíticas criadas:");
    console.log("  1. SELECT - Revendedores veem apenas itens de suas faturas");
    console.log("  2. INSERT - Revendedores podem inserir itens em suas faturas");
    console.log("  3. UPDATE - Revendedores podem atualizar itens de suas faturas");
    console.log("  4. DELETE - Revendedores podem deletar itens de suas faturas");
    console.log("  5. ALL (service_role) - Acesso completo para operações do servidor");

  } catch (error) {
    console.error("❌ Erro ao configurar RLS:", error);
    throw error;
  }
}

// Executar
enableRLS()
  .then(() => {
    console.log("\n✅ Migration concluída com sucesso!");
    process.exit(0);
  })
  .catch((error) => {
    console.error("\n❌ Migration falhou:", error);
    process.exit(1);
  });
