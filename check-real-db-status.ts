
import "dotenv/config";
import { db } from "./server/db";
import { users, businessAgentConfigs } from "./shared/schema";
import { eq } from "drizzle-orm";

async function main() {
    console.log("🔍 Verificando configuração REAL salva no banco para rodrigo4@gmail.com...");

    const user = await db.select().from(users).where(eq(users.email, "rodrigo4@gmail.com")).limit(1);
    const userId = user[0].id;

    const config = await db.select().from(businessAgentConfigs).where(eq(businessAgentConfigs.userId, userId));
    const current = config[0];

    console.log("\n=============================================");
    console.log("🧑‍💼 AGENTE: ", current.agentName);
    console.log("🏢 EMPRESA: ", current.companyName);
    console.log("=============================================");
    console.log("\n🧠 PERSONALIDADE (PROMPT) ATUALMENTE SALVA:");
    console.log("---------------------------------------------");
    console.log(current.personality);
    console.log("---------------------------------------------");
    console.log("\n📝 DESCRIÇÃO DA EMPRESA (INSTRUÇÕES EXTRAS):");
    console.log("---------------------------------------------");
    console.log(current.companyDescription);
    console.log("---------------------------------------------");
    console.log("\n✅ Se você vê o texto acima, SIGNIFICA QUE O SUPABASE JÁ ESTÁ ATUALIZADO.");
}

main().catch(console.error).finally(() => process.exit(0));
