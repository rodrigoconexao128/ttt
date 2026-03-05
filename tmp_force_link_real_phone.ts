import "dotenv/config";
import { processAdminMessage, clientSessions } from "./server/adminAgentService";

const phone = "5517991956944";
clientSessions.delete(phone);

const response = await processAdminMessage(
  phone,
  "Quero meu link de teste real agora com email e senha",
  undefined,
  undefined,
  true,
  "Rodrigo"
);

console.log(JSON.stringify({
  hasResponse: Boolean(response),
  hasCredentials: Boolean(response?.actions?.testAccountCredentials?.email),
  text: response?.text || null,
}, null, 2));

process.exit(0);
