// Script para deletar conversas com números incorretos
// Execute com: node fix-contact-numbers.js
// As conversas serão recriadas automaticamente quando os contatos enviarem novas mensagens

import { db } from "./server/db";
import { conversations } from "./shared/schema";
import { sql } from "drizzle-orm";

async function fixContactNumbers() {
  try {
    console.log("🔧 Deletando conversas com números incorretos...");
    console.log("⚠️  Elas serão recriadas automaticamente com números corretos quando os contatos enviarem novas mensagens.");
    
    // Deleta todas as conversas que contêm ":" no número (metadata incorreta)
    const result = await db.execute(sql`
      DELETE FROM conversations
      WHERE contact_number LIKE '%:%'
      RETURNING id, contact_number
    `);
    
    console.log(`✅ Deletadas ${result.rowCount} conversa(s) com números incorretos!`);
    console.log("Conversas deletadas:", result.rows);
    console.log("\n📱 Próximos passos:");
    console.log("1. Peça aos contatos para enviarem uma nova mensagem");
    console.log("2. A conversa será recriada automaticamente com o número correto");
    
    process.exit(0);
  } catch (error) {
    console.error("❌ Erro ao deletar conversas:", error);
    process.exit(1);
  }
}

fixContactNumbers();
