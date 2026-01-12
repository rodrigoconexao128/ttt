
import "dotenv/config";
import { storage } from "./server/storage";
import { db } from "./server/db";
import { users, adminAgentMedia } from "./shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("🔍 Verificando mídias no banco de dados...");
  
  // 1. Encontrar ID do usuário rodrigo4@gmail.com
  const user = await db.select().from(users).where(eq(users.email, "rodrigo4@gmail.com")).limit(1);
  let adminId;

  if (user.length > 0) {
    adminId = user[0].id;
    console.log(`👤 Usuário encontrado: ${user[0].email} (ID: ${adminId})`);
  } else {
    console.log("⚠️ Usuário rodrigo4@gmail.com não encontrado. Listando todas as mídias globais/ativas.");
  }

  // 2. Listar mídias (todas)
  const medias = await db.select().from(adminAgentMedia).orderBy(adminAgentMedia.createdAt);
  
  console.log(`\n📋 Mídias Totais (${medias.length}):`);
  
  for (const m of medias) {
      console.log(`\n-----------------------------------------------------------`);
      console.log(`🆔 ID: ${m.id} | AdminID: ${m.adminId}`);
      console.log(`🏷️ NAME: ${m.name}`);
      console.log(`📁 TYPE: ${m.mediaType}`);
      console.log(`📝 DESCRIPTION: ${m.description}`);
      console.log(`🎯 WHEN_TO_USE: ${m.whenToUse}`);
      console.log(`⚡ IS_ACTIVE: ${m.isActive}`);
  }
}

main().catch(console.error).finally(() => process.exit(0));
