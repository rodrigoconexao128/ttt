import "dotenv/config";
import { processAdminMessage, clientSessions } from "./server/adminAgentService";
import { storage } from "./server/storage";

function expectContains(label: string, actual: string | undefined, expected: string) {
  if (!actual || !actual.includes(expected)) {
    throw new Error(`${label} failed. Expected to include: ${expected}\nActual: ${actual}`);
  }
}

async function cleanupPhone(phone: string) {
  clientSessions.delete(phone.replace(/\D/g, ""));
  try {
    await storage.resetClientByPhone(phone);
  } catch {}
}

async function main() {
  const suffix = String(Date.now()).slice(-6);
  const newPhone = `5511991${suffix}`;
  const linkedPhone = `5511981${suffix}`;
  const linkedNoAgentPhone = `5511971${suffix}`;
  const editOnlyPhone = `5511961${suffix}`;

  await cleanupPhone(newPhone);
  await cleanupPhone(linkedPhone);
  await cleanupPhone(linkedNoAgentPhone);
  clientSessions.delete(editOnlyPhone.replace(/\D/g, ""));

  const newReply = await processAdminMessage(newPhone, "Oi");
  expectContains("new greeting", newReply?.text, "Aqui e o Rodrigo, da AgenteZap");
  expectContains("new onboarding question", newReply?.text, "me responde 3 coisas rapidinho");

  const linkedUser = await storage.upsertUser({
    email: `${linkedPhone}@teste.local`,
    name: "Cliente Vinculado",
    phone: linkedPhone,
    whatsappNumber: linkedPhone,
    role: "user",
  });
  await storage.upsertAgentConfig(linkedUser.id, {
    prompt: "Voce e Sofia, da Barbearia Prime. Atenda com objetividade.",
    isActive: true,
    model: "mistral-large-latest",
    triggerPhrases: [],
    messageSplitChars: 400,
    responseDelaySeconds: 30,
  } as any);

  await storage.upsertUser({
    email: `${linkedNoAgentPhone}@teste.local`,
    name: "Conta Sem Agente",
    phone: linkedNoAgentPhone,
    whatsappNumber: linkedNoAgentPhone,
    role: "user",
  });

  clientSessions.delete(linkedPhone);
  clientSessions.delete(linkedNoAgentPhone);

  const linkedReply = await processAdminMessage(linkedPhone, "Oi");
  expectContains("linked greeting", linkedReply?.text, "ligado ao seu agente");

  const linkedNoAgentReply = await processAdminMessage(linkedNoAgentPhone, "Oi");
  expectContains("linked no agent greeting", linkedNoAgentReply?.text, "ligado a sua conta");

  const unlinkedEditReply = await processAdminMessage(editOnlyPhone, "quero editar meu agente");
  expectContains("unlinked edit guidance", unlinkedEditReply?.text, "https://agentezap.online/settings");

  const linkedEditReply = await processAdminMessage(linkedPhone, "quero editar meu agente");
  expectContains("linked edit guidance", linkedEditReply?.text, "ligado ao seu agente");

  console.log(JSON.stringify({
    ok: true,
    newReply: newReply?.text,
    linkedReply: linkedReply?.text,
    linkedNoAgentReply: linkedNoAgentReply?.text,
    unlinkedEditReply: unlinkedEditReply?.text,
    linkedEditReply: linkedEditReply?.text,
  }, null, 2));

  await cleanupPhone(newPhone);
  await cleanupPhone(linkedPhone);
  await cleanupPhone(linkedNoAgentPhone);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
