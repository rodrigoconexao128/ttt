import "dotenv/config";
import { storage } from "../server/storage";

async function main() {
  const id = "3c1f0098-239a-4aca-b0eb-cb320c382b83";
  const msgs = await storage.getAdminMessages(id);
  const last = msgs.slice(-12).map((m) => ({
    fromMe: m.fromMe,
    isFromAgent: m.isFromAgent,
    text: String(m.text || '').replace(/\s+/g,' ').trim().slice(0,220)
  }));

  const normalized = last.filter((m) => m.fromMe).map((m) => m.text.toLowerCase());
  const dupCounts = new Map<string, number>();
  for (const t of normalized) dupCounts.set(t, (dupCounts.get(t) || 0) + 1);
  const repeated = Array.from(dupCounts.entries()).filter(([,c]) => c > 1);

  console.log(JSON.stringify({ conversationId: id, totalMessages: msgs.length, repeatedAgentMessages: repeated.length, repeatedSamples: repeated.slice(0,5), last }, null, 2));
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
