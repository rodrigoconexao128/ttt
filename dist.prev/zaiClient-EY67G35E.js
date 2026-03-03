import {
  storage
} from "./chunk-7EIK4PB3.js";
import "./chunk-HLD2MYUP.js";
import "./chunk-ZO343QIX.js";
import "./chunk-P6ABBBKG.js";
import "./chunk-KFQGP6VL.js";

// server/zaiClient.ts
var ZAI_API_URL = "https://api.z.ai/api/coding/paas/v4/chat/completions";
async function getZaiApiKey() {
  const config = await storage.getSystemConfig("zai_api_key");
  return config?.valor || process.env.ZAI_API_KEY || null;
}
async function chatCompleteZai(model, messages, temperature = 0.7) {
  const apiKey = await getZaiApiKey();
  if (!apiKey) {
    throw new Error("Z.AI API Key not configured. Please add 'zai_api_key' to system_config.");
  }
  const response = await fetch(ZAI_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
      stream: false
    })
  });
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Z.AI API Error: ${response.status} - ${errorText}`);
  }
  return await response.json();
}
export {
  chatCompleteZai,
  getZaiApiKey
};
