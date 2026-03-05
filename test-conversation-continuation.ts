/**
 * 🧪 TESTE: Continuação de Conversa - IA NÃO deve cumprimentar de novo
 * 
 * Testa se a IA:
 * 1. NÃO cumprimentar novamente se já conversamos hoje
 * 2. Continuar naturalmente após follow-up
 * 3. Responder ao conteúdo do áudio transcrito
 * 
 * Execute com: npx tsx test-conversation-continuation.ts
 */

import { Mistral } from "@mistralai/mistralai";
import "dotenv/config";

// Configuração
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
if (!MISTRAL_API_KEY) {
  console.error("❌ MISTRAL_API_KEY não configurada");
  process.exit(1);
}

// Cores
const colors = {
  reset: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  bold: "\x1b[1m",
};

function log(color: keyof typeof colors, message: string) {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

// Prompt base (simulando sistema real)
const SYSTEM_PROMPT = `Você é Rodrigo, consultor comercial da AgenteZap.

Sobre a AgenteZap:
- Sistema de IA para WhatsApp que automatiza atendimento
- Planos: Básico R$99/mês, Pro R$199/mês
- Teste grátis de 7 dias

Regras:
- Seja direto e objetivo
- Máximo 3-4 linhas por resposta
- IMPORTANTE: Você consegue entender mensagens de voz perfeitamente pois elas são transcritas automaticamente. Nunca diga que não consegue ouvir áudios - simplesmente responda ao conteúdo transcrito normalmente.
`;

interface TestCase {
  name: string;
  dynamicContext: string;
  history: Array<{ role: "user" | "assistant"; content: string }>;
  userMessage: string;
  badPatterns: string[]; // Padrões que NÃO devem aparecer na resposta
  goodPatterns: string[]; // Padrões que DEVEM aparecer (opcional)
}

const testCases: TestCase[] = [
  {
    name: "Continuação no mesmo dia - NÃO cumprimentar",
    dynamicContext: `
⚠️ ATENÇÃO - CONTINUAÇÃO DE CONVERSA:
- JÁ CONVERSAMOS COM ESTE CLIENTE HOJE!
- NÃO cumprimente novamente (sem "Bom dia", "Oi", "Olá", "Boa tarde")
- NÃO se apresente de novo (sem "Sou X da empresa Y")
- CONTINUE a conversa naturalmente de onde parou
- Responda diretamente ao que o cliente perguntou/disse`,
    history: [
      { role: "user", content: "Bom dia" },
      { role: "assistant", content: "Bom dia! Sou o Rodrigo da AgenteZap. Como posso ajudar?" },
      { role: "user", content: "Quero saber sobre o sistema" },
      { role: "assistant", content: "Claro! A AgenteZap é um sistema de IA para WhatsApp. Temos planos a partir de R$99/mês. Quer fazer um teste grátis?" },
      { role: "user", content: "Vou pensar, volto depois" },
      { role: "assistant", content: "Sem problemas! Fico à disposição quando precisar." },
    ],
    userMessage: "Oi, voltei! Me conta mais sobre o plano Pro",
    badPatterns: [
      "bom dia",
      "boa tarde",
      "boa noite",
      "olá!",
      "oi!",
      "sou o rodrigo",
      "sou rodrigo",
      "como posso ajudar",
      "em que posso ajudar",
    ],
    goodPatterns: ["pro", "199", "plano"],
  },
  {
    name: "Após Follow-up - NÃO repetir apresentação",
    dynamicContext: `
⚠️ ATENÇÃO - CONTINUAÇÃO DE CONVERSA:
- JÁ CONVERSAMOS COM ESTE CLIENTE HOJE!
- NÃO cumprimente novamente

🔄 RETOMADA APÓS FOLLOW-UP:
- A última mensagem foi um follow-up de reengajamento
- O cliente está VOLTANDO a conversar - seja receptivo!
- NÃO repita o que já foi dito no follow-up
- Avance a conversa para o próximo passo`,
    history: [
      { role: "user", content: "Oi, quero conhecer o sistema" },
      { role: "assistant", content: "Olá! Prazer, sou Rodrigo da AgenteZap. Nosso sistema automatiza atendimento no WhatsApp. Quer testar por 7 dias grátis?" },
      { role: "user", content: "Interessante, vou ver" },
      { role: "assistant", content: "Beleza! Qualquer dúvida, estou aqui." },
      // Follow-up enviado pelo sistema
      { role: "assistant", content: "E aí, Fernando! Lembrei de você! Ficou alguma dúvida sobre o sistema?" },
    ],
    userMessage: "Sim, como funciona o teste?",
    badPatterns: [
      "bom dia",
      "prazer",
      "sou o rodrigo",
      "sou rodrigo da agentezap",
      "olá!",
      "como posso ajudar",
    ],
    goodPatterns: ["teste", "7 dias", "grátis"],
  },
  {
    name: "Cliente manda áudio - Responder ao conteúdo",
    dynamicContext: `
🎤 MENSAGENS DE VOZ:
- IMPORTANTE: Você consegue entender mensagens de voz perfeitamente pois elas são transcritas automaticamente
- NUNCA diga que "não consegue ouvir áudios"`,
    history: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Olá! Sou Rodrigo da AgenteZap. Como posso ajudar?" },
    ],
    userMessage: "Então cara, eu tava querendo saber quanto custa o plano básico de vocês, e se tem desconto pra pagar anual",
    badPatterns: [
      "não consigo ouvir",
      "não posso ouvir",
      "infelizmente não consigo",
      "não escuto",
      "não ouço",
      "não entendi o áudio",
    ],
    goodPatterns: ["99", "básico", "plano"],
  },
  {
    name: "Áudio sem transcrição clara - NÃO dizer que não ouve",
    dynamicContext: `
🎤 MENSAGENS DE VOZ:
- IMPORTANTE: Você consegue entender mensagens de voz
- NUNCA diga que "não consegue ouvir áudios"
- Se a transcrição parecer vazia ou incompleta, peça educadamente para repetir`,
    history: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Olá! Como posso ajudar?" },
    ],
    userMessage: "(mensagem de voz do cliente)",
    badPatterns: [
      "não consigo ouvir",
      "não posso ouvir",
      "infelizmente não consigo",
      "não escuto",
      "não ouço",
    ],
    goodPatterns: [], // Pode pedir para repetir, mas nunca dizer que não ouve
  },
];

async function runTest(
  mistral: Mistral,
  testCase: TestCase
): Promise<boolean> {
  log("cyan", `\n📌 Teste: ${testCase.name}`);
  
  const messages = [
    {
      role: "system" as const,
      content: SYSTEM_PROMPT + "\n\n" + testCase.dynamicContext,
    },
    ...testCase.history,
    { role: "user" as const, content: testCase.userMessage },
  ];

  try {
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages,
      temperature: 0.3,
    });

    const aiResponse =
      (response.choices?.[0]?.message?.content as string) || "";
    const responseLower = aiResponse.toLowerCase();
    
    console.log(`    Contexto: ${testCase.dynamicContext.substring(0, 50)}...`);
    console.log(`    Cliente: "${testCase.userMessage}"`);
    console.log(`    IA: "${aiResponse.substring(0, 100)}..."`);

    // Verificar padrões ruins
    const foundBadPatterns: string[] = [];
    for (const pattern of testCase.badPatterns) {
      if (responseLower.includes(pattern.toLowerCase())) {
        foundBadPatterns.push(pattern);
      }
    }

    if (foundBadPatterns.length > 0) {
      log("red", `    ❌ FALHOU! Encontrou padrões proibidos: ${foundBadPatterns.join(", ")}`);
      return false;
    }

    // Verificar padrões bons (se especificados)
    if (testCase.goodPatterns.length > 0) {
      const foundGood = testCase.goodPatterns.some((p) =>
        responseLower.includes(p.toLowerCase())
      );
      if (!foundGood) {
        log("yellow", `    ⚠️ Aviso: Esperava encontrar um de: ${testCase.goodPatterns.join(", ")}`);
        // Não falha, apenas aviso
      }
    }

    log("green", `    ✅ PASSOU! Resposta adequada.`);
    return true;
  } catch (error: any) {
    log("red", `    ❌ ERRO: ${error.message}`);
    return false;
  }
}

async function main() {
  const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

  log("bold", "\n🚀 Iniciando testes de Continuação de Conversa...\n");

  let passed = 0;
  let failed = 0;

  for (const testCase of testCases) {
    const result = await runTest(mistral, testCase);
    if (result) passed++;
    else failed++;
    
    // Delay para não estourar rate limit
    await new Promise((r) => setTimeout(r, 1000));
  }

  log("bold", "\n═══════════════════════════════════════════════════════════════");
  log("bold", " 📊 RESUMO FINAL");
  log("bold", "═══════════════════════════════════════════════════════════════\n");

  console.log(`📈 TOTAL: ${passed}/${passed + failed} testes passaram (${Math.round((passed / (passed + failed)) * 100)}%)\n`);

  if (failed === 0) {
    log("green", "✅ Todos os testes passaram! As correções estão funcionando.");
  } else {
    log("red", `❌ ${failed} teste(s) falharam. Revisar implementação.`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
