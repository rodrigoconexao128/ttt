
import { storage } from "./vvvv/server/storage";

async function checkConfig() {
  try {
    console.log("Checking admin_agent_trigger_phrases...");
    const config = await storage.getSystemConfig("admin_agent_trigger_phrases");
    console.log("Raw config object:", config);
    
    if (config?.valor) {
      console.log("Value string:", config.valor);
      try {
        const parsed = JSON.parse(config.valor);
        console.log("Parsed value:", parsed);
        console.log("Is Array?", Array.isArray(parsed));
        console.log("Length:", parsed.length);
      } catch (e) {
        console.error("JSON Parse Error:", e);
      }
    } else {
      console.log("Value is null or undefined");
    }
  } catch (err) {
    console.error("Storage Error:", err);
  }
  process.exit(0);
}

checkConfig();
