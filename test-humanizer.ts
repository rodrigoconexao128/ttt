/**
 * ╔══════════════════════════════════════════════════════════════════════════════╗
 * ║              🧪 TESTE DO HUMANIZADOR DE MENSAGENS COM IA                     ║
 * ║                                                                              ║
 * ║  Execute com: npx tsx test-humanizer.ts                                      ║
 * ║                                                                              ║
 * ║  Este script testa se a IA consegue variar mensagens mantendo o sentido.    ║
 * ╚══════════════════════════════════════════════════════════════════════════════╝
 */

import { humanizeMessageWithAI, humanizeMessagesBatch, testHumanizer } from "./server/messageHumanizer";

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

// Mensagens de teste que simulam cenários reais
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
  {
    original: "Oi João! Vi que você acessou nosso site ontem. Posso te ajudar a encontrar o que procura?",
    type: "followup" as const,
    description: "Follow-up personalizado"
  },
  {
    original: "Sua fatura do mês de dezembro já está disponível. O valor é de R$ 199,90 com vencimento dia 15/01.",
    type: "bulk" as const,
    description: "Notificação de fatura"
  },
  {
    original: "Parabéns! Você foi selecionado para participar do nosso programa de fidelidade. Clique aqui para ativar seus benefícios.",
    type: "bulk" as const,
    description: "Mensagem de programa de fidelidade"
  },
];

async function runTests() {
  log("cyan", "\n╔══════════════════════════════════════════════════════════════════════════════╗");
  log("cyan", "║              🧪 INICIANDO TESTES DO HUMANIZADOR COM IA                        ║");
  log("cyan", "╚══════════════════════════════════════════════════════════════════════════════╝\n");

  // Teste básico primeiro
  log("yellow", "📋 Teste 1: Verificação básica do humanizador...\n");
  
  const basicTest = await testHumanizer();
  
  if (basicTest.success) {
    log("green", "✅ Teste básico PASSOU!");
    log("blue", `   📝 Original:   "${basicTest.original}"`);
    log("magenta", `   ✨ Humanizada: "${basicTest.humanized}"`);
  } else {
    log("red", "❌ Teste básico FALHOU!");
    log("red", `   Erro: ${basicTest.error || "Mensagem não foi alterada"}`);
    return;
  }

  log("yellow", "\n═══════════════════════════════════════════════════════════════════════════════\n");
  log("yellow", "📋 Teste 2: Humanização de diferentes tipos de mensagens...\n");

  let successCount = 0;
  let failCount = 0;

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
        log("red", `   ❌ FALHOU`);
        log("red", `   ⚠️ ${!isDifferent ? "Mensagem não alterada" : "Tamanho muito diferente"}`);
        failCount++;
      }
    } catch (error: any) {
      log("red", `   ❌ ERRO: ${error.message}`);
      failCount++;
    }

    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  log("yellow", "\n═══════════════════════════════════════════════════════════════════════════════\n");
  log("yellow", "📋 Teste 3: Múltiplas variações da MESMA mensagem (evitar repetição)...\n");

  const sameMessage = "Olá! Estamos com uma oferta especial para você. Entre em contato para saber mais!";
  const variations: string[] = [];

  log("blue", `📝 Mensagem base: "${sameMessage}"\n`);

  for (let i = 0; i < 5; i++) {
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
        log("red", `   [${i + 1}] ❌ Repetição detectada: "${humanized}"`);
      }
    } catch (error: any) {
      log("red", `   [${i + 1}] ❌ Erro: ${error.message}`);
    }

    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  const uniqueVariations = new Set(variations).size;
  log("yellow", `\n   📊 Variações únicas geradas: ${uniqueVariations}/5`);

  // Resumo final
  log("cyan", "\n╔══════════════════════════════════════════════════════════════════════════════╗");
  log("cyan", "║                         📊 RESUMO DOS TESTES                                  ║");
  log("cyan", "╚══════════════════════════════════════════════════════════════════════════════╝\n");

  log("green", `   ✅ Testes passados: ${successCount}`);
  log("red", `   ❌ Testes falhados: ${failCount}`);
  log("yellow", `   📝 Variações únicas: ${uniqueVariations}/5`);
  
  const totalSuccess = successCount + (basicTest.success ? 1 : 0);
  const totalTests = testMessages.length + 1;
  const successRate = ((totalSuccess / totalTests) * 100).toFixed(0);
  
  log("cyan", `\n   📈 Taxa de sucesso: ${successRate}%`);

  if (parseInt(successRate) >= 80) {
    log("green", "\n🎉 HUMANIZADOR ESTÁ FUNCIONANDO CORRETAMENTE!");
    log("green", "   Pronto para integrar no sistema de anti-bloqueio.\n");
  } else {
    log("red", "\n⚠️ HUMANIZADOR PRECISA DE AJUSTES!");
    log("red", "   Verifique a configuração do Mistral e tente novamente.\n");
  }
}

// Executar testes
runTests().catch(console.error);
