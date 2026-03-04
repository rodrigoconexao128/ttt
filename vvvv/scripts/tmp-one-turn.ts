import "dotenv/config";
import { processAdminMessage, clearClientSession } from "../server/adminAgentService";

async function main() {
  const phone = "5511997712999";
  clearClientSession(phone);
  const response = await processAdminMessage(phone, "oi", undefined, undefined, true, "Teste");
  console.log(String(response?.text || "<null>").slice(0, 200));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
