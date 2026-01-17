/**
 * 🧪 TESTE DE CONSISTÊNCIA: SIMULADOR vs WHATSAPP
 * 
 * Este script testa se a resposta da IA é IDÊNTICA entre:
 * 1. Chamada direta da função generateAIResponse
 * 2. Chamada do testAgentResponse (simulador)
 * 
 * O objetivo é encontrar onde está a variação das respostas.
 */

import { Mistral } from "@mistralai/mistralai";
import dotenv from "dotenv";

dotenv.config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  console.error("❌ MISTRAL_API_KEY não configurada!");
  process.exit(1);
}

const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });

// Prompt de teste fixo (simulando um agente de vendas)
const TEST_SYSTEM_PROMPT = `Você é Rodrigo, vendedor da AgenteZap.

REGRAS:
- Tom: Natural, amigável, persuasivo
- Plano: R$49/mês ilimitado
- Link: https://agentezap.online/p/plano-promo-ilimitado-mensal-e805ee4e

RESPONDA DE FORMA CURTA E DIRETA.`;

const TEST_USER_MESSAGE = "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.";

async function testMistralConsistency(numTests: number = 5) {
  console.log("═".repeat(70));
  console.log("🧪 TESTE DE CONSISTÊNCIA DO MISTRAL API");
  console.log("═".repeat(70));
  console.log(`\n📝 Mensagem de teste: "${TEST_USER_MESSAGE}"\n`);
  
  const responses: string[] = [];
  
  for (let i = 1; i <= numTests; i++) {
    console.log(`\n🔄 Teste ${i}/${numTests}...`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: TEST_SYSTEM_PROMPT },
          { role: "user", content: TEST_USER_MESSAGE }
        ],
        maxTokens: 2000, // SEM LIMITE ARTIFICIAL
        temperature: 0.0, // DETERMINÍSTICO
        randomSeed: 42, // SEED FIXO
      });
      
      const responseText = response.choices?.[0]?.message?.content;
      
      if (typeof responseText === "string") {
        responses.push(responseText);
        console.log(`   ✅ Resposta (${responseText.length} chars):`);
        console.log(`   "${responseText.substring(0, 150)}..."`);
      } else {
        console.log(`   ❌ Resposta inválida:`, responseText);
      }
      
    } catch (error: any) {
      console.error(`   ❌ Erro na chamada ${i}:`, error.message);
    }
    
    // Pequeno delay entre chamadas
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Analisar variação
  console.log("\n" + "═".repeat(70));
  console.log("📊 ANÁLISE DE VARIAÇÃO");
  console.log("═".repeat(70));
  
  if (responses.length === 0) {
    console.log("❌ Nenhuma resposta recebida!");
    return;
  }
  
  const firstResponse = responses[0];
  let allIdentical = true;
  
  for (let i = 1; i < responses.length; i++) {
    if (responses[i] !== firstResponse) {
      allIdentical = false;
      console.log(`\n❌ VARIAÇÃO DETECTADA entre resposta 1 e ${i + 1}:`);
      console.log(`   Resposta 1 (${firstResponse.length} chars):`);
      console.log(`   "${firstResponse.substring(0, 200)}..."`);
      console.log(`   Resposta ${i + 1} (${responses[i].length} chars):`);
      console.log(`   "${responses[i].substring(0, 200)}..."`);
      
      // Mostrar diferença de tamanho
      const diff = responses[i].length - firstResponse.length;
      console.log(`   Diferença de tamanho: ${diff > 0 ? '+' : ''}${diff} chars`);
    }
  }
  
  if (allIdentical) {
    console.log("\n✅ SUCESSO! Todas as ${numTests} respostas são IDÊNTICAS!");
    console.log(`   Resposta padrão (${firstResponse.length} chars):`);
    console.log(`   "${firstResponse}"`);
  } else {
    console.log("\n⚠️ PROBLEMA: Respostas estão variando mesmo com temperature=0 e randomSeed=42!");
  }
  
  // Testar diferentes configurações
  console.log("\n" + "═".repeat(70));
  console.log("🔬 TESTANDO DIFERENTES CONFIGURAÇÕES");
  console.log("═".repeat(70));
  
  const configs = [
    { name: "temp=0", temperature: 0 },
    { name: "temp=0 + seed=42", temperature: 0, randomSeed: 42 },
    { name: "temp=0 + seed=42 + topP=0.01", temperature: 0, randomSeed: 42, topP: 0.01 },
    { name: "temp=0.1", temperature: 0.1 },
    { name: "temp=0.3", temperature: 0.3 },
  ];
  
  for (const config of configs) {
    console.log(`\n📋 Testando: ${config.name}`);
    
    const configResponses: string[] = [];
    
    for (let i = 0; i < 3; i++) {
      try {
        const response = await mistral.chat.complete({
          model: "mistral-small-latest",
          messages: [
            { role: "system", content: TEST_SYSTEM_PROMPT },
            { role: "user", content: TEST_USER_MESSAGE }
          ],
          maxTokens: 2000,
          ...config
        });
        
        const text = response.choices?.[0]?.message?.content;
        if (typeof text === "string") {
          configResponses.push(text);
        }
      } catch (e) {
        // ignore
      }
      await new Promise(r => setTimeout(r, 500));
    }
    
    if (configResponses.length >= 2) {
      const consistent = configResponses.every(r => r === configResponses[0]);
      console.log(`   ${consistent ? '✅' : '❌'} ${consistent ? 'CONSISTENTE' : 'VARIANDO'} (${configResponses[0].length} chars)`);
    }
  }
}

// Teste de maxTokens - será que está cortando?
async function testMaxTokensImpact() {
  console.log("\n" + "═".repeat(70));
  console.log("🔬 TESTANDO IMPACTO DE maxTokens");
  console.log("═".repeat(70));
  
  const maxTokensValues = [500, 1000, 1500, 2000, 4000];
  
  for (const maxTokens of maxTokensValues) {
    console.log(`\n📋 Testando maxTokens=${maxTokens}`);
    
    try {
      const response = await mistral.chat.complete({
        model: "mistral-small-latest",
        messages: [
          { role: "system", content: TEST_SYSTEM_PROMPT },
          { role: "user", content: TEST_USER_MESSAGE }
        ],
        maxTokens,
        temperature: 0.0,
        randomSeed: 42,
      });
      
      const text = response.choices?.[0]?.message?.content;
      if (typeof text === "string") {
        console.log(`   Resposta: ${text.length} chars`);
        console.log(`   "${text.substring(0, 100)}..."`);
        
        // Verificar se o finish_reason indica truncamento
        const finishReason = response.choices?.[0]?.finishReason;
        console.log(`   Finish reason: ${finishReason}`);
        
        if (finishReason === "length") {
          console.log(`   ⚠️ TRUNCADO! maxTokens muito baixo.`);
        }
      }
    } catch (e: any) {
      console.log(`   ❌ Erro: ${e.message}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
}

// Executar testes
async function main() {
  console.log("🚀 Iniciando testes de consistência...\n");
  
  await testMistralConsistency(5);
  await testMaxTokensImpact();
  
  console.log("\n" + "═".repeat(70));
  console.log("✅ TESTES CONCLUÍDOS");
  console.log("═".repeat(70));
  
  console.log(`
CONCLUSÕES:
1. Se as respostas variam mesmo com temperature=0 e randomSeed=42:
   → O Mistral API pode ter variação interna que não controlamos
   → Solução: Aumentar temperatura ligeiramente (0.1) para melhor qualidade
   
2. Se maxTokens muito baixo causa truncamento:
   → Precisamos garantir maxTokens alto o suficiente
   → Recomendação: mínimo 2000 tokens
   
3. O importante é garantir que:
   → Simulador e WhatsApp usem EXATAMENTE os mesmos parâmetros
   → Nenhuma pós-processamento diferente entre os dois
`);
}

main().catch(console.error);
