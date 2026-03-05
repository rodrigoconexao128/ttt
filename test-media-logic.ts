/**
 * Teste de Lógica de Mídias - Verifica se a IA envia UMA mídia por vez
 * 
 * Cenários de teste:
 * 1. Cliente diz "Oi" → Deve enviar APENAS áudio de início
 * 2. Cliente pergunta sobre envio em massa → Deve enviar APENAS vídeo de envio em massa
 * 3. Cliente pergunta sobre CRM → Deve enviar APENAS vídeo de CRM
 * 4. Cliente conta seu negócio → Deve enviar APENAS áudio de como funciona
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic();

// Simular o prompt do sistema (simplificado)
const SYSTEM_PROMPT = `
Você é RODRIGO, consultor de vendas da AgenteZap.

REGRAS DE MÍDIA - CRÍTICAS:
1. Envie UMA mídia por vez, NUNCA múltiplas
2. Cada mídia tem condição específica

MÍDIAS DISPONÍVEIS:
- [MEDIA:MENSAGEM_DE_INICIO] → SOMENTE quando cliente diz "oi", "olá" - NUNCA para perguntas específicas
- [MEDIA:ENVIO_EM_MASSA] → SOMENTE quando cliente pergunta sobre disparos, campanhas
- [MEDIA:FOLLOWUP_INTELIGENTE] → SOMENTE quando cliente pergunta sobre recuperar leads
- [MEDIA:CRM_KANBAN] → SOMENTE quando cliente pergunta sobre CRM, organização
- [MEDIA:COMO_FUNCIONA] → SOMENTE quando cliente explica SEU negócio

PROIBIDO: Não use "cara", "véi", "mano". Use o nome do cliente.
`;

interface TestCase {
  name: string;
  clientMessage: string;
  expectedMedias: string[];
  forbiddenMedias: string[];
  forbiddenWords: string[];
}

const testCases: TestCase[] = [
  {
    name: "1. Cliente diz Oi - deve enviar APENAS áudio de início",
    clientMessage: "Oi, boa tarde!",
    expectedMedias: ["MENSAGEM_DE_INICIO"],
    forbiddenMedias: ["ENVIO_EM_MASSA", "FOLLOWUP", "CRM", "COMO_FUNCIONA"],
    forbiddenWords: ["cara", "véi", "mano", "brother"],
  },
  {
    name: "2. Cliente pergunta sobre envio em massa",
    clientMessage: "Vocês tem disparo em massa? Preciso enviar promoção pra meus clientes",
    expectedMedias: ["ENVIO_EM_MASSA"],
    forbiddenMedias: ["MENSAGEM_DE_INICIO", "FOLLOWUP", "CRM", "AGENDAMENTO"],
    forbiddenWords: ["cara", "véi", "mano"],
  },
  {
    name: "3. Cliente pergunta sobre CRM",
    clientMessage: "Tem algum CRM? Preciso organizar meus leads em etapas",
    expectedMedias: ["CRM", "KANBAN"],
    forbiddenMedias: ["MENSAGEM_DE_INICIO", "ENVIO_EM_MASSA", "AGENDAMENTO"],
    forbiddenWords: ["cara", "véi", "mano"],
  },
  {
    name: "4. Cliente conta seu negócio",
    clientMessage: "Tenho uma loja de roupas femininas e recebo muitas mensagens por dia",
    expectedMedias: ["COMO_FUNCIONA"],
    forbiddenMedias: ["MENSAGEM_DE_INICIO", "ENVIO_EM_MASSA", "CRM"],
    forbiddenWords: ["cara", "véi", "mano"],
  },
  {
    name: "5. Cliente pergunta sobre follow-up",
    clientMessage: "E quando o cliente não responde? Tem como recuperar?",
    expectedMedias: ["FOLLOWUP"],
    forbiddenMedias: ["MENSAGEM_DE_INICIO", "ENVIO_EM_MASSA", "CRM", "AGENDAMENTO"],
    forbiddenWords: ["cara", "véi", "mano"],
  },
];

async function runTest(test: TestCase): Promise<{ passed: boolean; errors: string[]; response: string }> {
  const errors: string[] = [];
  
  try {
    const message = await anthropic.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 500,
      system: SYSTEM_PROMPT,
      messages: [
        { role: "user", content: test.clientMessage }
      ],
    });

    const response = message.content[0].type === "text" ? message.content[0].text : "";
    
    // Verificar mídias esperadas
    let hasExpectedMedia = false;
    for (const media of test.expectedMedias) {
      if (response.includes(`[MEDIA:`) && response.toLowerCase().includes(media.toLowerCase())) {
        hasExpectedMedia = true;
        break;
      }
    }
    
    // Verificar mídias proibidas
    for (const media of test.forbiddenMedias) {
      if (response.toLowerCase().includes(`[media:${media.toLowerCase()}`)) {
        errors.push(`❌ Enviou mídia proibida: ${media}`);
      }
    }
    
    // Verificar palavras proibidas
    for (const word of test.forbiddenWords) {
      if (response.toLowerCase().includes(word.toLowerCase())) {
        errors.push(`❌ Usou palavra proibida: "${word}"`);
      }
    }
    
    // Contar quantas mídias foram enviadas
    const mediaCount = (response.match(/\[MEDIA:[A-Z0-9_]+\]/gi) || []).length;
    if (mediaCount > 2) {
      errors.push(`❌ Enviou ${mediaCount} mídias (máximo permitido: 2)`);
    }
    
    return {
      passed: errors.length === 0,
      errors,
      response,
    };
  } catch (error) {
    return {
      passed: false,
      errors: [`Erro na API: ${error}`],
      response: "",
    };
  }
}

async function main() {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DE LÓGICA DE MÍDIAS - UMA POR VEZ");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  let passedCount = 0;
  let failedCount = 0;
  
  for (const test of testCases) {
    console.log(`\n📋 ${test.name}`);
    console.log(`   Cliente: "${test.clientMessage}"`);
    
    const result = await runTest(test);
    
    if (result.passed) {
      console.log(`   ✅ PASSOU`);
      passedCount++;
    } else {
      console.log(`   ❌ FALHOU:`);
      for (const error of result.errors) {
        console.log(`      ${error}`);
      }
      failedCount++;
    }
    
    console.log(`   Resposta: "${result.response.substring(0, 200)}..."`);
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log(`📊 RESULTADO: ${passedCount}/${testCases.length} testes passaram`);
  console.log("═══════════════════════════════════════════════════════════════");
  
  if (failedCount > 0) {
    console.log("\n⚠️ Alguns testes falharam! Revisar lógica de mídias.");
    process.exit(1);
  } else {
    console.log("\n✅ Todos os testes passaram! Lógica de mídias OK.");
    process.exit(0);
  }
}

main();
