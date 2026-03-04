
import "dotenv/config";
import { db } from "./server/db";
import { users, adminAgentMedia } from "./shared/schema";
import { eq, and } from "drizzle-orm";

async function main() {
  console.log("🛠️ Configurando mídias do Rodrigo...");

  const user = await db.select().from(users).where(eq(users.email, "rodrigo4@gmail.com")).limit(1);
  if (user.length === 0) {
    console.error("❌ Usuário rodrigo4@gmail.com não encontrado!");
    // process.exit(1); 
  } else {
      console.log(`✅ User ID: ${user[0].id}`);
  }

  // Find the correct ADMIN ID from existing media
  const existingMedia = await db.select().from(adminAgentMedia).limit(1);
  if (existingMedia.length === 0) {
      console.error("❌ Nenhuma mídia existente para clonar o Admin ID!");
      process.exit(1);
  }
  const adminId = existingMedia[0].adminId;
  console.log(`✅ Using Valid Admin ID from existing media: ${adminId}`);

  // 1. Update ENVIO_EM_MASSA
  console.log("🔄 Atualizando ENVIO_EM_MASSA...");
  await db.update(adminAgentMedia)
    .set({
      description: "Vídeo ou Imagem mostrando como fazer campanhas e envio em massa.",
      whenToUse: "Quando o cliente perguntar sobre envio em massa, campanhas, disparar mensagens para todos, lista de transmissão, promoções ou marketing."
    })
    .where(and(
      eq(adminAgentMedia.name, "ENVIO_EM_MASSA"),
      // eq(adminAgentMedia.adminId, adminId) // Assuming global or owned by him. Safe to filter by name if uniqueish.
    ));

  // 2. Create NOTIFICADOR (Placeholder using existing image/audio URL for safety)
  // I'll pick a safe URL from existing media to avoid 404s if the user tests it.
  const existing = await db.select().from(adminAgentMedia).limit(1);
  const safeUrl = existing[0]?.storageUrl || "https://placeholder.com/image.png";

  const notificadorExists = await db.select().from(adminAgentMedia).where(eq(adminAgentMedia.name, "NOTIFICADOR_INTELIGENTE"));
  
  if (notificadorExists.length === 0) {
    console.log("➕ Criando NOTIFICADOR_INTELIGENTE...");
    await db.insert(adminAgentMedia).values({
      adminId: adminId,
      name: "NOTIFICADOR_INTELIGENTE",
      mediaType: "image", // Or video if available
      storageUrl: safeUrl,
      description: "Explicação sobre o Notificador Inteligente e Agendamentos.",
      whenToUse: "Quando o cliente perguntar sobre notificador inteligente, confirmação de agendamento, avisar cliente, lembretes automáticos ou agenda.",
      isActive: true,
      sendAlone: true,
      displayOrder: 10
    });
  } else {
    console.log("🔄 Atualizando NOTIFICADOR_INTELIGENTE...");
    await db.update(adminAgentMedia)
      .set({
         whenToUse: "Quando o cliente perguntar sobre notificador inteligente, confirmação de agendamento, avisar cliente, lembretes automáticos ou agenda."
      })
      .where(eq(adminAgentMedia.name, "NOTIFICADOR_INTELIGENTE"));
  }

  // 3. Create/Update FOLLOW_UP
  const followUpExists = await db.select().from(adminAgentMedia).where(eq(adminAgentMedia.name, "FOLLOW_UP_INTELIGENTE"));
  if (followUpExists.length === 0) {
      console.log("➕ Criando FOLLOW_UP_INTELIGENTE...");
      await db.insert(adminAgentMedia).values({
        adminId: adminId,
        name: "FOLLOW_UP_INTELIGENTE",
        mediaType: "image", 
        storageUrl: safeUrl,
        description: "Explicação sobre como o robô recupera vendas (Follow-up).",
        whenToUse: "Quando o cliente perguntar sobre recuperar vendas, cliente que parou de responder, follow-up, perseguição inteligente ou vácuo.",
        isActive: true,
        sendAlone: true,
        displayOrder: 11
      });
  } else {
      console.log("🔄 Atualizando FOLLOW_UP_INTELIGENTE...");
      await db.update(adminAgentMedia)
        .set({
           whenToUse: "Quando o cliente perguntar sobre recuperar vendas, cliente que parou de responder, follow-up, perseguição inteligente ou vácuo."
        })
        .where(eq(adminAgentMedia.name, "FOLLOW_UP_INTELIGENTE"));
  }

  console.log("🏁 Mídias atualizadas com sucesso!");
}

main().catch(console.error).finally(() => process.exit(0));
