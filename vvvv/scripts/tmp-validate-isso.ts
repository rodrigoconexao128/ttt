import "dotenv/config";
import { processAdminMessage, clearClientSession } from "../server/adminAgentService";

async function main() {
  const phone = "5511997712345";
  clearClientSession(phone);
  const messages = [
    "oi",
    "bom dia, aqui e a bicicletaria do joao, vendo bicicletas e pecas",
    "quero que ele atenda, venda e tire duvidas",
    "isso",
  ];

  for (let i = 0; i < messages.length; i += 1) {
    const input = messages[i];
    const response = await processAdminMessage(phone, input, undefined, undefined, true, "Teste Bicicletaria");
    console.log(`TURN ${i + 1}`);
    console.log("USER:", input);
    console.log("BOT :", String(response?.text || "<null>").replace(/\s+/g, " ").slice(0, 360));
  }
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
