/**
 * 🧪 TESTE: Bugs de Áudio e Follow-up
 * 
 * Este teste verifica:
 * 1. A IA NUNCA deve dizer que não consegue ouvir áudios (pois são transcritos automaticamente)
 * 2. Quando a IA retoma após follow-up, ela não deve repetir a conversa
 * 
 * Execute com: npx tsx test-audio-followup-bugs.ts
 */

import { Mistral } from "@mistralai/mistralai";
import * as dotenv from "dotenv";

dotenv.config();

// Configuração
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MODEL = "mistral-small-latest";

// Cores para output
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 1: Bug do Áudio
// ═══════════════════════════════════════════════════════════════════════════

interface AudioTestCase {
  name: string;
  clientMessage: string; // Mensagem transcrita ou indicação de áudio
  expectedBehavior: string;
  forbiddenPhrases: string[];
}

const audioTestCases: AudioTestCase[] = [
  {
    name: "Áudio transcrito - Pergunta sobre preço",
    clientMessage: "Qual o preço do serviço de vocês?", // Áudio transcrito
    expectedBehavior: "Responder sobre o preço normalmente",
    forbiddenPhrases: [
      "não consigo ouvir",
      "não ouço áudio",
      "não escuto",
      "não tenho como ouvir",
      "escreva por favor",
      "envie por texto",
      "digite",
      "infelizmente não consigo",
      "não é possível ouvir",
      "mensagem de voz",
    ],
  },
  {
    name: "Áudio transcrito - Saudação",
    clientMessage: "Bom dia, tudo bem?", // Áudio transcrito
    expectedBehavior: "Responder a saudação normalmente",
    forbiddenPhrases: [
      "não consigo ouvir",
      "não ouço áudio",
      "não escuto",
      "escreva por favor",
      "envie por texto",
      "digite",
    ],
  },
  {
    name: "Marcador de áudio - Sistema envia indicação de áudio (sem transcrição)",
    clientMessage: "(mensagem de voz do cliente)",
    expectedBehavior: "Pedir para o cliente repetir ou perguntar o que precisa",
    forbiddenPhrases: [
      "não consigo ouvir",
      "não ouço áudio",
      "não escuto",
    ],
  },
];

async function testAudioBug(mistral: Mistral): Promise<{ passed: number; failed: number }> {
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "📢 TESTE 1: BUG DO ÁUDIO - IA não deve dizer que não ouve áudio");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  // Prompt corrigido (sem a instrução de que não consegue ouvir áudios)
  const systemPrompt = `Você é um atendente profissional de uma empresa.

REGRAS:
1. Responda de forma natural e objetiva.
2. IMPORTANTE: Você consegue entender mensagens de voz perfeitamente pois elas são transcritas automaticamente. Nunca diga que não consegue ouvir áudios - simplesmente responda ao conteúdo transcrito normalmente.
3. Seja cordial e prestativo.`;

  for (const testCase of audioTestCases) {
    log("blue", `\n📌 Teste: ${testCase.name}`);
    log("yellow", `   Cliente: "${testCase.clientMessage}"`);
    log("yellow", `   Esperado: ${testCase.expectedBehavior}`);

    try {
      const response = await mistral.chat.complete({
        model: MODEL,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: testCase.clientMessage },
        ],
        maxTokens: 300,
        temperature: 0.7,
      });

      const aiResponse = response.choices?.[0]?.message?.content?.toString() || "";
      log("cyan", `   IA: "${aiResponse.substring(0, 150)}..."`);

      // Verificar frases proibidas
      const foundForbidden = testCase.forbiddenPhrases.filter((phrase) =>
        aiResponse.toLowerCase().includes(phrase.toLowerCase())
      );

      if (foundForbidden.length > 0) {
        log("red", `   ❌ FALHOU! Encontrou frases proibidas: ${foundForbidden.join(", ")}`);
        failed++;
      } else {
        log("green", `   ✅ PASSOU! Resposta adequada.`);
        passed++;
      }
    } catch (error: any) {
      log("red", `   ❌ ERRO: ${error.message}`);
      failed++;
    }
  }

  return { passed, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// TESTE 2: Bug do Follow-up / Reativação
// ═══════════════════════════════════════════════════════════════════════════

interface FollowUpTestCase {
  name: string;
  conversationHistory: Array<{ role: "user" | "assistant"; content: string }>;
  followUpMessage: string;
  clientResponseAfterFollowUp: string;
  forbiddenBehaviors: string[];
}

const followUpTestCases: FollowUpTestCase[] = [
  {
    name: "Follow-up após cliente sumir - Cliente volta",
    conversationHistory: [
      { role: "user", content: "Oi, qual o preço?" },
      { role: "assistant", content: "Oi! Nosso plano custa R$ 99/mês. Quer saber mais?" },
      { role: "user", content: "Deixa eu pensar" },
      { role: "assistant", content: "Claro! Qualquer dúvida me chama." },
    ],
    followUpMessage: "Oi Fernando, tudo bem? Lembrei de você! Ficou alguma dúvida sobre o plano?",
    clientResponseAfterFollowUp: "Sim, me conta mais",
    forbiddenBehaviors: [
      "Repetir a mesma saudação inicial",
      "Perguntar 'qual o seu negócio' novamente",
      "Copiar a resposta do cliente na própria resposta",
      "Concatenar múltiplas respostas em uma",
    ],
  },
  {
    name: "Follow-up - Cliente responde com áudio transcrito",
    conversationHistory: [
      { role: "user", content: "Bom dia" },
      { role: "assistant", content: "Bom dia! Sou o Rodrigo da AgenteZap. Qual seu negócio?" },
      { role: "user", content: "Sou dentista" },
      { role: "assistant", content: "Legal! Dentista perde muito tempo confirmando consulta. Quer ver um teste?" },
    ],
    followUpMessage: "E aí, conseguiu dar uma olhada?",
    clientResponseAfterFollowUp: "Quero testar sim, como faz?", // Áudio transcrito
    forbiddenBehaviors: [
      "Dizer que não ouve áudio",
      "Repetir pergunta sobre o negócio",
      "Repetir a resposta anterior",
    ],
  },
];

async function testFollowUpBug(mistral: Mistral): Promise<{ passed: number; failed: number }> {
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "🔄 TESTE 2: BUG DO FOLLOW-UP - IA não deve repetir conversa");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  let passed = 0;
  let failed = 0;

  const systemPrompt = `Você é RODRIGO, vendedor da AgenteZap.

═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRAS CRÍTICAS DE CONTINUIDADE (OBRIGATÓRIO - SEMPRE SIGA)
═══════════════════════════════════════════════════════════════════════════════

🚫 PROIBIDO:
- Perguntar "o que você faz?" de novo se cliente JÁ RESPONDEU
- Se apresentar novamente se já se apresentou
- Repetir a mesma pergunta feita anteriormente
- Copiar a mensagem do cliente na sua resposta
- Concatenar múltiplas respostas em uma só

✅ OBRIGATÓRIO:
- Continuar de onde parou naturalmente
- Responder de forma NATURAL e CURTA (máx 2-3 frases)
- PARE DE ESCREVER assim que terminar sua vez. AGUARDE o cliente.
- JAMAIS simule o cliente ou responda por ele
`;

  for (const testCase of followUpTestCases) {
    log("blue", `\n📌 Teste: ${testCase.name}`);

    // Construir histórico incluindo follow-up
    const fullHistory: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    // Adicionar histórico original
    for (const msg of testCase.conversationHistory) {
      fullHistory.push({ role: msg.role, content: msg.content });
    }

    // Adicionar follow-up como mensagem do assistant
    fullHistory.push({ role: "assistant", content: testCase.followUpMessage });

    // Adicionar resposta do cliente após follow-up
    fullHistory.push({ role: "user", content: testCase.clientResponseAfterFollowUp });

    log("yellow", `   Histórico: ${testCase.conversationHistory.length} msgs`);
    log("yellow", `   Follow-up: "${testCase.followUpMessage}"`);
    log("yellow", `   Cliente responde: "${testCase.clientResponseAfterFollowUp}"`);

    try {
      const response = await mistral.chat.complete({
        model: MODEL,
        messages: fullHistory,
        maxTokens: 400,
        temperature: 0.7,
      });

      const aiResponse = response.choices?.[0]?.message?.content?.toString() || "";
      log("cyan", `   IA: "${aiResponse}"`);

      // Verificar comportamentos proibidos
      const problems: string[] = [];

      // 1. Verificar se repetiu a resposta do cliente
      if (aiResponse.includes(testCase.clientResponseAfterFollowUp)) {
        problems.push("Repetiu a resposta do cliente");
      }

      // 2. Verificar se concatenou múltiplas respostas (verifica se tem "Cliente:" ou padrões de diálogo)
      if (/cliente:|usuário:|rodrigo:|assistant:|user:/i.test(aiResponse)) {
        problems.push("Concatenou múltiplas respostas ou simulou diálogo");
      }

      // 3. Verificar se repete perguntas já feitas
      const previousQuestions = testCase.conversationHistory
        .filter((m) => m.role === "assistant")
        .map((m) => m.content.toLowerCase());
      
      for (const prevQ of previousQuestions) {
        // Verifica se uma parte significativa da pergunta anterior aparece na resposta
        const prevWords = prevQ.split(" ").filter((w) => w.length > 4);
        let matchCount = 0;
        for (const word of prevWords) {
          if (aiResponse.toLowerCase().includes(word)) matchCount++;
        }
        if (matchCount > 3 && matchCount / prevWords.length > 0.5) {
          problems.push("Repetiu resposta anterior");
          break;
        }
      }

      // 4. Verificar se disse que não ouve áudio
      if (/não.*ouço|não.*consigo.*ouvir|não.*escuto/i.test(aiResponse)) {
        problems.push("Disse que não ouve áudio");
      }

      // 5. Verificar se resposta é muito longa (indica múltiplas respostas concatenadas)
      if (aiResponse.length > 600) {
        problems.push("Resposta muito longa (possível concatenação)");
      }

      if (problems.length > 0) {
        log("red", `   ❌ FALHOU! Problemas: ${problems.join(", ")}`);
        failed++;
      } else {
        log("green", `   ✅ PASSOU! Resposta adequada e sem repetição.`);
        passed++;
      }
    } catch (error: any) {
      log("red", `   ❌ ERRO: ${error.message}`);
      failed++;
    }
  }

  return { passed, failed };
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN
// ═══════════════════════════════════════════════════════════════════════════

async function main() {
  if (!MISTRAL_API_KEY) {
    log("red", "❌ MISTRAL_API_KEY não configurada!");
    process.exit(1);
  }

  log("green", "🚀 Iniciando testes de Bug de Áudio e Follow-up...\n");

  const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

  // Executar testes
  const audioResults = await testAudioBug(mistral);
  const followUpResults = await testFollowUpBug(mistral);

  // Resumo final
  log("cyan", "\n═══════════════════════════════════════════════════════════════");
  log("cyan", "📊 RESUMO FINAL");
  log("cyan", "═══════════════════════════════════════════════════════════════\n");

  const totalPassed = audioResults.passed + followUpResults.passed;
  const totalFailed = audioResults.failed + followUpResults.failed;
  const total = totalPassed + totalFailed;

  log("blue", `📢 Teste de Áudio: ${audioResults.passed}/${audioResults.passed + audioResults.failed} passou`);
  log("blue", `🔄 Teste de Follow-up: ${followUpResults.passed}/${followUpResults.passed + followUpResults.failed} passou`);
  log("cyan", `\n📈 TOTAL: ${totalPassed}/${total} testes passaram (${Math.round((totalPassed / total) * 100)}%)`);

  if (totalFailed > 0) {
    log("red", `\n⚠️ ${totalFailed} teste(s) falharam. Verifique os prompts e correções.`);
    process.exit(1);
  } else {
    log("green", `\n✅ Todos os testes passaram! As correções estão funcionando.`);
    process.exit(0);
  }
}

main().catch((error) => {
  log("red", `❌ Erro fatal: ${error.message}`);
  process.exit(1);
});
