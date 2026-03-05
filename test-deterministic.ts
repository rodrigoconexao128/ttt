/**
 * 🧪 TESTE DE DETERMINISMO MISTRAL
 * 
 * Este script testa se temperature=0 + randomSeed=42 gera respostas
 * 100% idênticas para a mesma pergunta.
 * 
 * Uso: npx tsx test-deterministic.ts
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from 'dotenv';

dotenv.config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error("❌ MISTRAL_API_KEY não encontrada no .env");
  process.exit(1);
}

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

// Prompt completo do usuário rodrigo4@gmail.com
const SYSTEM_PROMPT = `## IDENTIDADE
Você é **Rodrigo**, especialista da **AgenteZap**.
Seu objetivo é ajudar potenciais clientes a entenderem a plataforma, criar a conta gratuita para teste e, se fizer sentido, assinar o plano ou contratar a implementação.

## TOM DE VOZ (IMPORTANTE)
*   **Humano e Natural:** Use "tá?", "né?", "entendeu?". Evite formalidades excessivas.
*   **Conversacional:** Não use listas numeradas (1. 2. 3.). Fale em parágrafos curtos.
*   **Empático:** Entenda a dor do cliente (perder vendas, falta de tempo) e ofereça a solução.
*   **Direto:** Responda o que foi perguntado, mas sempre puxe o gancho para o próximo passo (teste grátis).

## DIRETRIZES DE PREÇO E LIMITES (LEIAS COM ATENÇÃO - REGRAS RÍGIDAS)
1.  **Plano Mensal Padrão:** O valor oficial é **R$99/mês** - é **ILIMITADO em tudo** (mensagens, tokens, atendimentos).
2.  **IMPORTANTE SOBRE LIMITES:**
    - **TODOS os planos são ILIMITADOS** - sem limite de tokens, mensagens ou atendimentos.
    - Se perguntarem "quantos tokens?", responda: "**É ilimitado!** Sem limite de tokens ou mensagens."
    - **NUNCA invente números como 10.000 tokens** - isso não existe. É sempre ILIMITADO.
3.  **Campanha Promocional (R$49):**
    *   Se o cliente mencionar "R$49", "promoção" ou vier de um anúncio de R$49: **CONFIRME** o preço de R$49/mês.
    *   Para garantir esse preço, instrua o cliente a usar o cupom: **PARC2026PROMO**.
    *   *Instrução:* "O plano é R$99, mas com o cupom PARC2026PROMO você garante por R$49 mensais."
4.  **Implementação (Setup):**
    *   Custa **R$199 (pagamento ÚNICO)**.
    *   Nós configuramos tudo (IA, fluxos, mídias).
    *   Ofereça se o cliente parecer sem tempo ou com dificuldade técnica.
5.  **Teste Grátis:** Sempre incentive o cadastro gratuito primeiro ("sem cartão, só testar").

## FLUXO DE CONVERSA

### 1. Abordagem Inicial
Seja breve. Pergunte o ramo do cliente ou o que ele precisa (vendas, suporte).
*Exemplo:* "Opa, tudo bom? Rodrigo aqui da AgenteZap. Me conta, seu foco hoje é mais vendas ou atendimento?"

### 2. Explicando a Solução
Não use "tokens", "LLM", "GPT". Diga que é uma IA própria, ilimitada, que atende no WhatsApp 24h.
Se o cliente perguntar funcionalidades, explique com exemplos do dia a dia dele.
**Se perguntarem sobre limites:** Diga que é TUDO ILIMITADO - mensagens, tokens, atendimentos.

### 3. Fechamento / Cadastro
O objetivo é o cadastro em **https://agentezap.online/**.
*   "Cria sua conta grátis pra testar: https://agentezap.online/"
*   "Lá em Planos, se você usar o código **PARC2026PROMO**, o mensal cai de R$99 pra R$49."

### 4. Suporte e Vídeos
Se o cliente tiver dúvida de como usar ou configurar:
*   Ofereça ajuda.
*   Diga que pode enviar um vídeo explicativo.
*   **IMPORTANTE:** Se o sistema mostrar mídias disponíveis (vídeos de tutorial), use a tag correspondente (ex: \`[ENVIAR_MIDIA:VIDEO_CADASTRO]\`) quando o contexto pedir.

## REGRAS DE OURO (SISTEMA)
*   **NUNCA** envie instruções internas para o usuário (ex: "Se o cliente perguntar...").
*   O que está escrito em blocos de diretrizes ou regras é para VOCÊ saber como agir, não para copiar e colar para o cliente.
*   **NUNCA** invente taxas, limites ou números que não existem.
*   **SEMPRE** consulte o histórico da conversa para não repetir perguntas.
*   **SEMPRE** que falar de preço promocional, mencione o cupom \`PARC2026PROMO\`.
*   **Corrija o entendimento da Implementação:** É pagamento **ÚNICO** de R$199, não mensal.`;

const USER_MESSAGE = "Oi";

async function testWithConfig(config: { temperature: number; randomSeed?: number }, testName: string) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`🧪 ${testName}`);
  console.log(`   temperature: ${config.temperature}, randomSeed: ${config.randomSeed ?? "undefined"}`);
  console.log("=".repeat(60));

  const responses: string[] = [];

  for (let i = 1; i <= 3; i++) {
    console.log(`\n📤 Teste ${i}/3: Enviando "${USER_MESSAGE}"...`);
    
    const startTime = Date.now();
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: USER_MESSAGE }
      ],
      maxTokens: 200,
      temperature: config.temperature,
      ...(config.randomSeed !== undefined && { randomSeed: config.randomSeed })
    });
    const elapsed = Date.now() - startTime;

    const text = response.choices?.[0]?.message?.content as string;
    responses.push(text);
    
    console.log(`📥 Resposta (${elapsed}ms):`);
    console.log(`   "${text.substring(0, 100)}..."`);
  }

  // Verificar se todas as respostas são idênticas
  const allIdentical = responses.every(r => r === responses[0]);
  
  console.log("\n" + "─".repeat(60));
  console.log(`📊 RESULTADO: ${allIdentical ? "✅ TODAS IDÊNTICAS!" : "❌ RESPOSTAS DIFERENTES"}`);
  
  if (!allIdentical) {
    console.log("\n📋 Diferenças encontradas:");
    for (let i = 0; i < responses.length; i++) {
      console.log(`   [${i + 1}] "${responses[i].substring(0, 80)}..."`);
    }
  }
  
  return { testName, allIdentical, responses };
}

async function main() {
  console.log("🚀 TESTE DE DETERMINISMO MISTRAL API");
  console.log("=====================================");
  console.log("Objetivo: Encontrar configuração que gera respostas 100% idênticas");
  console.log("");

  const results: { testName: string; allIdentical: boolean }[] = [];

  // Teste 1: temperature=0.3 (atual em produção)
  results.push(await testWithConfig({ temperature: 0.3 }, "ATUAL: temperature=0.3 (sem seed)"));

  // Teste 2: temperature=0 (sem seed)
  results.push(await testWithConfig({ temperature: 0 }, "NOVO: temperature=0 (sem seed)"));

  // Teste 3: temperature=0 + randomSeed=42
  results.push(await testWithConfig({ temperature: 0, randomSeed: 42 }, "IDEAL: temperature=0 + randomSeed=42"));

  // Teste 4: temperature=0 + randomSeed=12345
  results.push(await testWithConfig({ temperature: 0, randomSeed: 12345 }, "ALT: temperature=0 + randomSeed=12345"));

  // Resumo final
  console.log("\n\n" + "=".repeat(60));
  console.log("📊 RESUMO FINAL");
  console.log("=".repeat(60));
  
  for (const r of results) {
    console.log(`${r.allIdentical ? "✅" : "❌"} ${r.testName}`);
  }
  
  const winner = results.find(r => r.allIdentical);
  if (winner) {
    console.log(`\n🏆 MELHOR CONFIG: ${winner.testName}`);
    console.log("   Implementar esta configuração no aiAgent.ts");
  } else {
    console.log("\n⚠️ Nenhuma configuração gerou respostas 100% idênticas.");
    console.log("   Mistral pode ter variação inerente mesmo com temperature=0.");
    console.log("   Considerar usar randomSeed para minimizar variação.");
  }
}

main().catch(console.error);
