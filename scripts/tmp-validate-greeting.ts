import "dotenv/config";
import { processAdminMessage, clearClientSession } from "../server/adminAgentService";

async function main() {
  const phone = "5511997712346";
  clearClientSession(phone);

  const r1 = await processAdminMessage(phone, "oi", undefined, undefined, true, "Teste Saudacao");
  const r2 = await processAdminMessage(phone, "e ai", undefined, undefined, true, "Teste Saudacao");

  console.log("TURN1:", String(r1?.text || "").replace(/\s+/g, " ").slice(0, 220));
  console.log("TURN2:", String(r2?.text || "").replace(/\s+/g, " ").slice(0, 220));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
