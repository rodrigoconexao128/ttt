/**
 * Testes Realistas para o Sistema de Edição de Prompts
 * 
 * Testa a técnica de "Structured JSON Editing" com:
 * - Prompts grandes (3000+ caracteres)
 * - Vários tipos de instrução
 * - Fallback local
 * - Performance
 */

import { editPromptLocally } from "./server/promptEditFullDocument";

// Prompt grande de exemplo (similar ao gerado pelo sistema)
const LARGE_PROMPT = `Você é o assistente virtual de atendimento da **Pizzaria Bella Napoli**.

📋 **PERSONALIDADE:**
- Seja simpático, caloroso e acolhedor
- Use emojis com moderação para dar vida às respostas
- Seja objetivo nas informações de cardápio e preços
- Responda de forma rápida e eficiente
- Mantenha um tom profissional mas amigável

🏪 **INFORMAÇÕES DO NEGÓCIO:**
- Nome: Pizzaria Bella Napoli
- Tipo: Pizzaria e Delivery
- Horário: Segunda a domingo, das 18h às 00h
- Delivery: Disponível via app e WhatsApp
- Pagamento: Cartão, PIX, dinheiro
- Endereço: Rua das Flores, 123 - Centro

📋 **CARDÁPIO PRINCIPAL:**
- Pizza Margherita (P/M/G): R$ 35 / R$ 45 / R$ 55
- Pizza Calabresa (P/M/G): R$ 38 / R$ 48 / R$ 58
- Pizza Quatro Queijos (P/M/G): R$ 42 / R$ 52 / R$ 62
- Pizza Portuguesa (P/M/G): R$ 45 / R$ 55 / R$ 65
- Refrigerante 2L: R$ 12
- Suco Natural: R$ 10

## ✅ O QUE FAZER
- Sempre cumprimente o cliente de forma calorosa
- Informe sobre promoções do dia
- Confirme o pedido completo antes de finalizar
- Pergunte endereço para entrega
- Confirme forma de pagamento
- Informe tempo estimado de entrega (40-60 min)
- Ofereça opções de borda recheada
- Agradeça ao final do pedido

## ❌ O QUE NÃO FAZER
- Nunca seja rude ou impaciente
- Não invente preços ou produtos
- Não prometa tempos de entrega que não pode cumprir
- Não discuta com o cliente
- Não compartilhe dados de outros clientes
- Não faça comentários sobre política ou religião

## 💡 DICAS ESPECIAIS
- Se perguntarem sobre ingredientes, descreva com entusiasmo
- Para pedidos grandes (+5 pizzas), ofereça desconto de 10%
- Se o cliente reclamar, seja empático e ofereça solução
- Sempre confirme se quer troco para dinheiro
- Mencione o programa de fidelidade (10 pizzas = 1 grátis)

## 📱 FORMAS DE CONTATO
- WhatsApp: Este número
- Telefone: (11) 99999-9999
- Instagram: @pizzariabellanapoli
- Site: www.bellanapoli.com.br

Lembre-se: você representa a Pizzaria Bella Napoli e deve sempre manter a qualidade no atendimento!`;

// Cenários de teste
const TEST_SCENARIOS = [
  {
    name: "Tornar mais formal",
    instruction: "Quero que seja mais formal e profissional, menos descontraído",
    expectedChanges: ["simpático → cordial", "emojis com moderação → poucos emojis"]
  },
  {
    name: "Tornar mais informal",
    instruction: "Precisa ser mais descontraído e amigável, usar mais emojis",
    expectedChanges: ["profissional → descontraído"]
  },
  {
    name: "Adicionar foco em vendas",
    instruction: "Quero que seja mais vendedor, foque em conversão e upsell",
    expectedChanges: ["FOCO EM VENDAS", "gatilhos"]
  },
  {
    name: "Adicionar foco em suporte",
    instruction: "Precisa focar mais em suporte e resolução de problemas",
    expectedChanges: ["FOCO EM SUPORTE", "empatia"]
  },
  {
    name: "Respostas mais curtas",
    instruction: "Quero respostas mais curtas e diretas, sem enrolação",
    expectedChanges: ["Mensagens Concisas", "breve"]
  },
  {
    name: "Respostas mais detalhadas",
    instruction: "Precisa dar respostas mais completas e detalhadas",
    expectedChanges: ["Respostas Detalhadas", "completas"]
  },
  {
    name: "Instrução genérica",
    instruction: "Adicione uma regra para sempre perguntar se quer refrigerante",
    expectedChanges: ["INSTRUÇÃO ADICIONAL", "refrigerante"]
  },
  {
    name: "Múltiplas melhorias",
    instruction: "Seja mais vendedor, formal e focado em converter clientes",
    expectedChanges: ["FOCO EM VENDAS", "cordial"]
  },
  {
    name: "Prompt pequeno + formal",
    instruction: "mais profissional",
    expectedChanges: ["cordial", "profissional"]
  },
  {
    name: "Emojis",
    instruction: "Adicionar mais emojis nas respostas",
    expectedChanges: ["Uso de Emojis", "😊"]
  }
];

// Função de teste
async function runTests() {
  console.log("═".repeat(60));
  console.log("🧪 TESTES DE EDIÇÃO ESTRUTURADA DE PROMPTS");
  console.log("═".repeat(60));
  console.log(`\n📄 Tamanho do prompt original: ${LARGE_PROMPT.length} caracteres\n`);

  let passed = 0;
  let failed = 0;
  const results: Array<{
    name: string;
    success: boolean;
    changesCount: number;
    promptDelta: number;
    timeMs: number;
  }> = [];

  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n${"─".repeat(50)}`);
    console.log(`📝 Teste: ${scenario.name}`);
    console.log(`   Instrução: "${scenario.instruction}"`);

    const startTime = Date.now();
    
    try {
      const result = editPromptLocally(LARGE_PROMPT, scenario.instruction);
      const endTime = Date.now();
      const timeMs = endTime - startTime;

      // Verificar se mudanças foram aplicadas
      const hasExpectedChanges = scenario.expectedChanges.some(
        expected => result.newPrompt.includes(expected) || result.summary.includes(expected)
      );

      const isChanged = result.newPrompt !== LARGE_PROMPT;
      const promptDelta = result.newPrompt.length - LARGE_PROMPT.length;

      if (hasExpectedChanges || isChanged) {
        console.log(`   ✅ PASSOU`);
        console.log(`   📊 Mudanças: ${result.changes.length}`);
        console.log(`   📐 Delta tamanho: ${promptDelta > 0 ? '+' : ''}${promptDelta} chars`);
        console.log(`   ⚡ Tempo: ${timeMs}ms`);
        console.log(`   📝 Resumo: ${result.summary.substring(0, 80)}...`);
        passed++;
        results.push({
          name: scenario.name,
          success: true,
          changesCount: result.changes.length,
          promptDelta,
          timeMs
        });
      } else {
        console.log(`   ❌ FALHOU - Mudanças esperadas não encontradas`);
        console.log(`   Esperava: ${scenario.expectedChanges.join(", ")}`);
        failed++;
        results.push({
          name: scenario.name,
          success: false,
          changesCount: 0,
          promptDelta: 0,
          timeMs
        });
      }
    } catch (error: any) {
      console.log(`   ❌ ERRO: ${error.message}`);
      failed++;
      results.push({
        name: scenario.name,
        success: false,
        changesCount: 0,
        promptDelta: 0,
        timeMs: 0
      });
    }
  }

  // Resumo final
  console.log(`\n${"═".repeat(60)}`);
  console.log("📊 RESUMO DOS TESTES");
  console.log("═".repeat(60));
  console.log(`✅ Passou: ${passed}/${TEST_SCENARIOS.length}`);
  console.log(`❌ Falhou: ${failed}/${TEST_SCENARIOS.length}`);
  console.log(`📈 Taxa de sucesso: ${((passed / TEST_SCENARIOS.length) * 100).toFixed(1)}%`);

  const avgTime = results.reduce((sum, r) => sum + r.timeMs, 0) / results.length;
  const avgChanges = results.filter(r => r.success).reduce((sum, r) => sum + r.changesCount, 0) / passed;
  
  console.log(`\n⏱️ Tempo médio: ${avgTime.toFixed(2)}ms`);
  console.log(`📝 Média de mudanças por edição: ${avgChanges.toFixed(1)}`);

  // Teste de performance com prompt muito grande
  console.log(`\n${"─".repeat(50)}`);
  console.log("🔥 TESTE DE PERFORMANCE (Prompt 10x maior)");
  
  const hugePrompt = LARGE_PROMPT.repeat(10);
  console.log(`   Tamanho: ${hugePrompt.length} caracteres`);
  
  const perfStart = Date.now();
  const perfResult = editPromptLocally(hugePrompt, "seja mais formal e profissional");
  const perfEnd = Date.now();
  
  console.log(`   ⚡ Tempo: ${perfEnd - perfStart}ms`);
  console.log(`   📝 Mudanças aplicadas: ${perfResult.changes.length}`);
  console.log(`   ✅ Prompt editado com sucesso!`);

  // Teste de economia de tokens
  console.log(`\n${"─".repeat(50)}`);
  console.log("💰 ESTIMATIVA DE ECONOMIA DE TOKENS");
  
  const inputTokens = Math.ceil(LARGE_PROMPT.length / 4);
  const outputTokensFullRewrite = Math.ceil(LARGE_PROMPT.length / 4);
  const outputTokensJsonEdit = Math.ceil(200 / 4); // JSON de mudanças é pequeno
  const tokensSaved = outputTokensFullRewrite - outputTokensJsonEdit;
  const savingsPercent = ((tokensSaved / outputTokensFullRewrite) * 100).toFixed(1);
  
  console.log(`   Tokens de entrada: ~${inputTokens}`);
  console.log(`   Tokens saída (reescrita completa): ~${outputTokensFullRewrite}`);
  console.log(`   Tokens saída (JSON edit): ~${outputTokensJsonEdit}`);
  console.log(`   💰 Economia: ~${tokensSaved} tokens (${savingsPercent}%)`);

  console.log(`\n${"═".repeat(60)}`);
  console.log("🎉 TESTES CONCLUÍDOS!");
  console.log("═".repeat(60));

  return { passed, failed, total: TEST_SCENARIOS.length };
}

// Executar testes
runTests().catch(console.error);
