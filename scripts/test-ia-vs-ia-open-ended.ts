import "dotenv/config";

/**
 * 🧪 TESTE IA vs IA OPEN-ENDED (sem roteiro fixo)
 *
 * Objetivo:
 * - Validar o comportamento do Rodrigo (vendas) contra um Cliente IA REALISTA
 * - Sem forçar "agora faça X" em turnos específicos
 * - Rodar 2 nichos: Restaurante + Hotmart
 *
 * Critérios avaliados (heurísticos):
 * - LINK (não email)
 * - Explica SIMULADOR WhatsApp
 * - Explica que conversa com SEU AGENTE
 * - Aceita mídia SE o cliente enviar
 * - Em algum momento usa [AÇÃO:CRIAR_CONTA_TESTE]
 */

import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { mkdirSync, writeFileSync } from "fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

type Role = "system" | "user" | "assistant";

type Msg = { role: Role; content: string };

type Scenario = {
  id: string;
  label: string;
  clientProfile: string;
};

const scenarios: Scenario[] = [
  {
    id: "open-restaurante",
    label: "Restaurante (open-ended)",
    clientProfile: `Você é o dono de um restaurante de bairro.

Regras:
- Você NÃO segue roteiro fixo.
- Você começa com curiosidade, mas fica desconfiado se parecer golpe.
- Você pergunta sobre preço, configuração, se entende cardápio.
- Você só passa dados do negócio se o vendedor pedir bem.
- Se o vendedor pedir, às vezes você manda mídia, às vezes não.

Seu negócio (use só se perguntarem):
- Restaurante: Sabor Caseiro
- Horário: 11h às 22h
- Delivery grátis acima de R$ 30
- Prato do dia R$ 18, Marmitex R$ 15

Mídia (se decidir mandar):
- Formato: [Foto enviada: cardápio com Prato do dia R$ 18, Marmitex R$ 15, Horário 11h-22h]

Objetivo:
- Entender se funciona e decidir se testa.`,
  },
  {
    id: "open-hotmart",
    label: "Hotmart (open-ended)",
    clientProfile: `Você é uma infoprodutora que vende um curso na Hotmart.

Regras:
- NÃO siga roteiro fixo.
- Faça perguntas difíceis (garantia, entrega, afiliados, suporte).
- Você é cética, mas quer vender mais.
- Só passa detalhes do curso se o vendedor fizer perguntas certas.
- Se pedirem, você pode mandar um áudio (texto simulando áudio).

Seu negócio (use só se perguntarem):
- Curso: Receitas Fit
- Preço: R$ 197
- Garantia: 7 dias
- Plataforma: Hotmart
- Dor: perde leads de madrugada no WhatsApp

Mídia (se decidir mandar):
- Formato: [Áudio enviado: "Vendo curso na Hotmart por R$ 197, garantia 7 dias, quero que a IA explique e mande o link de compra"]

Objetivo:
- Tirar dúvidas e, se fizer sentido, testar.`,
  },
];

const RODRIGO_SYSTEM = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

REGRAS CRÍTICAS:
- NUNCA fale "email" como forma de entrega do acesso. Sempre diga LINK.
- Sempre explique que o link abre um SIMULADOR de WhatsApp (UI/UX igual WhatsApp).
- Sempre diga que o cliente conversa com SEU AGENTE no simulador.
- Aceite mídia (foto/áudio/vídeo) quando o cliente enviar.
- Quando tiver informações suficientes, use [AÇÃO:CRIAR_CONTA_TESTE].

Tom: humano, objetivo, 3-6 linhas, sem repetir.`;

async function mistralChat(systemPrompt: string, messages: Msg[], temperature = 0.85): Promise<string> {
  const res = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      temperature,
      max_tokens: 500,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mistral error ${res.status}: ${text || res.statusText}`);
  }

  const data = (await res.json()) as any;
  return data?.choices?.[0]?.message?.content ?? "";
}

function scoreConversation(all: { speaker: string; content: string }[]) {
  const full = all.map(m => `${m.speaker}: ${m.content}`).join("\n").toLowerCase();

  const hasCreateTag = full.includes("[ação:criar_conta_teste]");
  const mentionsLink = full.includes("link") && !full.includes("email");
  const mentionsSimulator = full.includes("simulador") && full.includes("whatsapp");
  const mentionsOwnAgent = full.includes("seu agente") || full.includes("seu\nagente") || (full.includes("conversa") && full.includes("agente"));
  const clientSentMedia = full.includes("[foto enviada") || full.includes("[áudio enviado") || full.includes("[audio enviado") || full.includes("[vídeo enviado") || full.includes("[video enviado");
  const rodrigoAcceptedMedia = clientSentMedia
    ? (full.includes("recebi") && (full.includes("foto") || full.includes("áudio") || full.includes("audio") || full.includes("vídeo") || full.includes("video")))
    : true;

  const details: string[] = [];
  let score = 0;

  if (hasCreateTag) { score += 25; details.push("✅ Usou [AÇÃO:CRIAR_CONTA_TESTE] (+25)"); } else { details.push("❌ Não usou [AÇÃO:CRIAR_CONTA_TESTE] (0)"); }
  if (mentionsLink) { score += 20; details.push("✅ Falou LINK (não email) (+20)"); } else { details.push("❌ Não garantiu LINK sem email (0)"); }
  if (mentionsSimulator) { score += 20; details.push("✅ Explicou SIMULADOR WhatsApp (+20)"); } else { details.push("❌ Não explicou SIMULADOR WhatsApp (0)"); }
  if (mentionsOwnAgent) { score += 20; details.push("✅ Disse que conversa com SEU AGENTE (+20)"); } else { details.push("❌ Não deixou claro SEU AGENTE (0)"); }
  if (rodrigoAcceptedMedia) { score += 15; details.push(clientSentMedia ? "✅ Aceitou mídia enviada (+15)" : "✅ (Sem mídia enviada: neutro) (+15)"); }
  else { details.push("❌ Cliente enviou mídia e Rodrigo não confirmou (0)"); }

  return { score, details };
}

async function runScenario(s: Scenario) {
  const conversation: { speaker: string; content: string }[] = [];
  const rodrigoMsgs: Msg[] = [];
  const clientMsgs: Msg[] = [];

  const clientSystem = `${s.clientProfile}\n\nComece a conversa com uma primeira mensagem curta e natural.`;
  const first = await mistralChat(clientSystem, [], 0.95);

  conversation.push({ speaker: "Cliente", content: first });
  rodrigoMsgs.push({ role: "user", content: first });
  clientMsgs.push({ role: "assistant", content: first });

  const maxTurns = 14;
  for (let i = 0; i < maxTurns; i++) {
    const rodrigo = await mistralChat(RODRIGO_SYSTEM, rodrigoMsgs, 0.85);
    conversation.push({ speaker: "Rodrigo", content: rodrigo });
    rodrigoMsgs.push({ role: "assistant", content: rodrigo });
    clientMsgs.push({ role: "user", content: rodrigo });

    if (rodrigo.toLowerCase().includes("[ação:criar_conta_teste]")) {
      const end = await mistralChat(`${s.clientProfile}\n\nO vendedor disse que vai mandar o link do simulador. Responda como cliente real.`, clientMsgs, 0.9);
      conversation.push({ speaker: "Cliente", content: end });
      break;
    }

    const client = await mistralChat(s.clientProfile, clientMsgs, 0.95);
    conversation.push({ speaker: "Cliente", content: client });
    rodrigoMsgs.push({ role: "user", content: client });
    clientMsgs.push({ role: "assistant", content: client });
  }

  const { score, details } = scoreConversation(conversation);
  return { conversation, score, details };
}

function saveLog(id: string, label: string, conversation: any, score: number, details: string[]) {
  const logsDir = join(__dirname, "..", "logs");
  try { mkdirSync(logsDir, { recursive: true }); } catch {}

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const base = `ia-vs-ia-open-${id}-${stamp}`;

  writeFileSync(join(logsDir, `${base}.json`), JSON.stringify({ label, score, details, conversation }, null, 2));

  const txt = [
    `TESTE: ${label}`,
    `Data: ${new Date().toLocaleString("pt-BR")}`,
    `NOTA: ${score}/100`,
    "",
    "CRITÉRIOS:",
    ...details,
    "",
    "CONVERSA:",
    ...conversation.map((m: any) => `\n[${m.speaker.toUpperCase()}]\n${m.content}`),
    "",
  ].join("\n");

  writeFileSync(join(logsDir, `${base}.txt`), txt);
}

async function main() {
  console.log("\n=== IA vs IA OPEN-ENDED ===\n");

  for (const s of scenarios) {
    console.log(`\n--- Rodando: ${s.label} ---\n`);
    const result = await runScenario(s);

    for (const d of result.details) {
      console.log(d);
    }
    console.log(`NOTA: ${result.score}/100\n`);

    saveLog(s.id, s.label, result.conversation, result.score, result.details);
  }
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
