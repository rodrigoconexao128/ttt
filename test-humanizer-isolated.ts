/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║          🧪 TESTE ISOLADO DO HUMANIZADOR DE MENSAGENS COM IA                 ║
 * ║                                                                              ║
 * ║  Execute com: npx tsx test-humanizer-isolated.ts                             ║
 * ║                                                                              ║
 * ║  Este script testa se a IA consegue variar mensagens mantendo o sentido.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { Mistral } from "@mistralai/mistralai";

// Cores para console
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m",
};

function log(color: keyof typeof colors, ...args: any[]) {
  console.log(colors[color], ...args, colors.reset);
}

// Pegar API key do ambiente
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  log("red", "❌ MISTRAL_API_KEY não encontrada no ambiente!");
  log("yellow", "   Configure a variável de ambiente MISTRAL_API_KEY");
  log("yellow", "   Exemplo: $env:MISTRAL_API_KEY='sua_chave_aqui'");
  process.exit(1);
}

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

/**
 * Humaniza uma mensagem usando IA Mistral
 */
async function humanizeMessageWithAI(
  originalMessage: string,
  context?: {
    type?: 'followup' | 'bulk' | 'response' | 'group';
    previousVariations?: string[];
  }
): Promise<string> {
  if (originalMessage.length < 20) {
    return originalMessage;
  }

  const previousVariationsText = context?.previousVariations?.length 
    ? `\n\n⚠️ VARIAÇÕES JÁ USADAS (NÃO REPITA NENHUMA DELAS):\n${context.previousVariations.map((v, i) => `${i+1}. "${v}"`).join('\n')}`
    : '';

  const prompt = `## 🎯 TAREFA: HUMANIZAR MENSAGEM

Você é um especialista em comunicação natural via WhatsApp. Sua tarefa é REESCREVER a mensagem abaixo de forma que:

1. **MANTENHA 100% DO SENTIDO ORIGINAL** - Não mude o significado, apenas a forma de escrever
2. **Use palavras diferentes** - Troque por sinônimos naturais
3. **Varie a estrutura** - Mude a ordem das ideias se possível
4. **Mantenha o tom** - Se é formal, mantenha formal. Se é casual, mantenha casual.
5. **Pareça humano** - Como se uma pessoa real estivesse digitando
6. **NÃO ADICIONE** informações que não existem na original
7. **NÃO REMOVA** informações importantes

${context?.type === 'bulk' ? '📢 CONTEXTO: Esta é uma mensagem de envio em massa. Varie bastante para não parecer spam.' : ''}
${context?.type === 'followup' ? '📋 CONTEXTO: Esta é uma mensagem de follow-up. Mantenha o tom de acompanhamento.' : ''}
${context?.type === 'group' ? '👥 CONTEXTO: Esta é uma mensagem para grupo. Mantenha apropriada para múltiplas pessoas.' : ''}
${previousVariationsText}

---

## 📝 MENSAGEM ORIGINAL:
"${originalMessage}"

---

## ✍️ RESPONDA APENAS COM A MENSAGEM REESCRITA (sem explicações, sem aspas, sem "Aqui está"):`;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    maxTokens: 500,
  });

  const rawResult = response.choices?.[0]?.message?.content;
  let result = typeof rawResult === 'string' ? rawResult : originalMessage;

  // Limpar resultado
  result = result
    .replace(/^["']|["']$/g, '')
    .replace(/^(Aqui está|Mensagem reescrita|Versão humanizada)[:\s]*/gi, '')
    .replace(/^[-–—]\s*/g, '')
    .trim();

  return result;
}

// Mensagens de teste
const testMessages = [
  {
    original: "Olá! Gostaria de saber se você ainda tem interesse em nosso produto. Podemos agendar uma demonstração?",
    type: "followup" as const,
    description: "Follow-up de vendas"
  },
  {
    original: "Bom dia! Estamos com uma promoção especial para você. Aproveite 30% de desconto em todos os planos até sexta-feira!",
    type: "bulk" as const,
    description: "Mensagem promocional em massa"
  },
  {
    original: "Olá pessoal! Lembrando que amanhã teremos nossa reunião às 14h. Não se esqueçam de confirmar presença.",
    type: "group" as const,
    description: "Mensagem para grupo"
  },
  {
    original: "Obrigado pelo seu contato! Recebi sua mensagem e entrarei em contato em breve para esclarecer suas dúvidas.",
    type: "response" as const,
    description: "Resposta automática"
  },
];

async function runTests() {
  log("cyan", "\n╔══════════════════════════════════════════════════════════════════════════════╗");
  log("cyan", "║         🧪 TESTE DO HUMANIZADOR DE MENSAGENS COM IA MISTRAL                   ║");
  log("cyan", "╚══════════════════════════════════════════════════════════════════════════════╝\n");

  log("yellow", "📋 Testando variação de mensagens com IA...\n");

  let successCount = 0;

  for (let i = 0; i < testMessages.length; i++) {
    const test = testMessages[i];
    log("cyan", `\n[${i + 1}/${testMessages.length}] 📨 ${test.description} (tipo: ${test.type})`);
    log("blue", `   📝 Original: "${test.original}"`);

    try {
      const humanized = await humanizeMessageWithAI(test.original, { type: test.type });
      
      const isDifferent = humanized !== test.original;
      const lengthRatio = humanized.length / test.original.length;
      const isValidLength = lengthRatio > 0.5 && lengthRatio < 2;

      if (isDifferent && isValidLength) {
        log("green", `   ✅ PASSOU`);
        log("magenta", `   ✨ Humanizada: "${humanized}"`);
        log("yellow", `   📊 Tamanho: ${test.original.length} → ${humanized.length} chars (${(lengthRatio * 100).toFixed(0)}%)`);
        successCount++;
      } else {
        log("red", `   ❌ FALHOU: ${!isDifferent ? "Mensagem não alterada" : "Tamanho muito diferente"}`);
      }
    } catch (error: any) {
      log("red", `   ❌ ERRO: ${error.message}`);
    }

    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Teste de múltiplas variações da mesma mensagem
  log("yellow", "\n═══════════════════════════════════════════════════════════════════════════════\n");
  log("yellow", "📋 Teste: Múltiplas variações da MESMA mensagem (evitar repetição)...\n");

  const sameMessage = "Olá! Estamos com uma oferta especial para você. Entre em contato para saber mais!";
  const variations: string[] = [];

  log("blue", `📝 Mensagem base: "${sameMessage}"\n`);

  for (let i = 0; i < 3; i++) {
    try {
      const humanized = await humanizeMessageWithAI(sameMessage, { 
        type: 'bulk',
        previousVariations: variations 
      });
      
      const isUnique = !variations.includes(humanized) && humanized !== sameMessage;
      
      if (isUnique) {
        log("green", `   [${i + 1}] ✅ "${humanized}"`);
        variations.push(humanized);
      } else {
        log("red", `   [${i + 1}] ❌ Repetição: "${humanized}"`);
      }
    } catch (error: any) {
      log("red", `   [${i + 1}] ❌ Erro: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1500));
  }

  // Resumo
  log("cyan", "\n╔══════════════════════════════════════════════════════════════════════════════╗");
  log("cyan", "║                         📊 RESUMO DOS TESTES                                  ║");
  log("cyan", "╚══════════════════════════════════════════════════════════════════════════════╝\n");

  const uniqueVariations = new Set(variations).size;
  const successRate = ((successCount / testMessages.length) * 100).toFixed(0);
  
  log("green", `   ✅ Testes passados: ${successCount}/${testMessages.length}`);
  log("yellow", `   📝 Variações únicas: ${uniqueVariations}/3`);
  log("cyan", `   📈 Taxa de sucesso: ${successRate}%`);

  if (parseInt(successRate) >= 75 && uniqueVariations >= 2) {
    log("green", "\n🎉 HUMANIZADOR ESTÁ FUNCIONANDO CORRETAMENTE!");
    log("green", "   A IA está variando mensagens mantendo o sentido.\n");
  } else {
    log("red", "\n⚠️ HUMANIZADOR PRECISA DE AJUSTES!\n");
  }
}

// Executar
runTests().catch(console.error);
