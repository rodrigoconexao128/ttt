import "dotenv/config";
import { processAdminMessage, clientSessions } from "./server/adminAgentService";

const phone = "5517991956944";
clientSessions.delete(phone);
const result = await processAdminMessage(phone, "Oi");
console.log(JSON.stringify({ text: result?.text }, null, 2));
process.exit(0);
