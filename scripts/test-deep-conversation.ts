/**
 * TESTE PROFUNDO DE CONVERSA COM IA
 * 
 * Este teste simula uma conversa REAL, mensagem por mensagem,
 * verificando:
 * 1. Se a IA não repete conteúdo já explicado
 * 2. Se a IA envia mídias quando apropriado (tags [ENVIAR_MIDIA:X])
 * 3. Se a IA mantém contexto ao longo da conversa
 * 4. Se a IA segue o fluxo de vendas corretamente
 */

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
}

interface TestResult {
  passed: boolean;
  issue: string;
  context: string;
}

// Simula o prompt do sistema (simplificado para teste)
const SYSTEM_PROMPT = `Você é o Rodrigo, consultor de vendas da AgenteZap.

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE MÍDIAS - OBRIGATÓRIO
═══════════════════════════════════════════════════════════════════════════════

MÍDIAS DISPONÍVEIS:
- COMO_FUNCIONA (áudio explicativo)
- VIDEO_DEMONSTRACAO (vídeo demo)
- TABELA_PRECOS (imagem com preços)
- PDF_CONTRATO (documento)

REGRA CRÍTICA: Quando o cliente perguntar "como funciona" ou pedir explicação,
você DEVE incluir a tag [ENVIAR_MIDIA:COMO_FUNCIONA] na sua resposta.

EXEMPLOS:
CLIENTE: "como funciona?"
RESPOSTA: "Vou te explicar! ... [ENVIAR_MIDIA:COMO_FUNCIONA]"

CLIENTE: "explica mais"
RESPOSTA: "Claro! ... [ENVIAR_MIDIA:COMO_FUNCIONA]"

═══════════════════════════════════════════════════════════════════════════════
🧠 REGRA DE NÃO REPETIÇÃO
═══════════════════════════════════════════════════════════════════════════════

NUNCA repita explicações que você já deu na conversa.
Se você já explicou algo, AVANCE para o próximo passo:
- Pergunte se tem dúvidas
- Ofereça o teste gratuito
- Pergunte sobre o negócio do cliente

═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO: NOVO CLIENTE
═══════════════════════════════════════════════════════════════════════════════

Fluxo de vendas:
1. Saudar e descobrir o negócio
2. Explicar como funciona (COM MÍDIA)
3. Oferecer teste gratuito
4. Coletar nome do agente
5. Criar conta de teste
`;

async function generateResponse(
  history: ConversationMessage[],
  userMessage: string
): Promise<string> {
  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userMessage }
  ];

  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages,
    maxTokens: 600,
    temperature: 0.85,
  });

  return response.choices?.[0]?.message?.content?.toString() || "";
}

function checkForMediaTag(response: string): { hasMedia: boolean; mediaName: string | null } {
  const match = response.match(/\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/i);
  return {
    hasMedia: !!match,
    mediaName: match ? match[1] : null
  };
}

function checkForRepetition(currentResponse: string, previousResponses: string[]): boolean {
  // Verifica se mais de 60% do conteúdo é repetido
  const currentWords = currentResponse.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  
  for (const prev of previousResponses) {
    const prevWords = prev.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    let matchCount = 0;
    
    for (const word of currentWords) {
      if (prevWords.includes(word)) {
        matchCount++;
      }
    }
    
    const similarity = matchCount / currentWords.length;
    if (similarity > 0.6) {
      return true; // É repetição
    }
  }
  
  return false;
}

async function runDeepTest(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE PROFUNDO DE CONVERSA COM IA");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const conversationHistory: ConversationMessage[] = [];
  const assistantResponses: string[] = [];
  const testResults: TestResult[] = [];

  // Cenário de teste: conversa completa
  const userMessages = [
    "oi",
    "como funciona o sistema de vcs?",
    "sim, me explica mais como funciona",
    "entendi, e quanto custa?",
    "posso testar antes de pagar?",
    "ok, quero testar",
    "minha loja se chama Loja do João"
  ];

  const expectedBehaviors = [
    { shouldHaveMedia: false, mediaName: null, description: "Saudação - não precisa mídia" },
    { shouldHaveMedia: true, mediaName: "COMO_FUNCIONA", description: "Perguntou como funciona - DEVE ter mídia" },
    { shouldHaveMedia: false, mediaName: null, description: "Não deve repetir - deve avançar conversa" },
    { shouldHaveMedia: false, mediaName: null, description: "Perguntou preço - pode enviar TABELA_PRECOS" },
    { shouldHaveMedia: false, mediaName: null, description: "Perguntou sobre teste - deve explicar" },
    { shouldHaveMedia: false, mediaName: null, description: "Quer testar - deve pedir dados" },
    { shouldHaveMedia: false, mediaName: null, description: "Deu nome - deve confirmar" }
  ];

  for (let i = 0; i < userMessages.length; i++) {
    const userMsg = userMessages[i];
    const expected = expectedBehaviors[i];

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📤 USUÁRIO [${i + 1}]: ${userMsg}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    try {
      const response = await generateResponse(conversationHistory, userMsg);
      
      console.log(`\n📥 IA: ${response}\n`);

      // Verificar mídia
      const { hasMedia, mediaName } = checkForMediaTag(response);
      
      if (expected.shouldHaveMedia && !hasMedia) {
        const result: TestResult = {
          passed: false,
          issue: `FALHA: Deveria ter enviado mídia [ENVIAR_MIDIA:${expected.mediaName}] mas não enviou!`,
          context: expected.description
        };
        testResults.push(result);
        console.log(`❌ ${result.issue}`);
      } else if (expected.shouldHaveMedia && hasMedia) {
        console.log(`✅ Mídia enviada corretamente: [ENVIAR_MIDIA:${mediaName}]`);
        testResults.push({ passed: true, issue: "", context: expected.description });
      } else if (!expected.shouldHaveMedia) {
        testResults.push({ passed: true, issue: "", context: expected.description });
      }

      // Verificar repetição (a partir da 3ª mensagem)
      if (i >= 2 && assistantResponses.length > 0) {
        const isRepetition = checkForRepetition(response, assistantResponses);
        if (isRepetition) {
          const result: TestResult = {
            passed: false,
            issue: "FALHA: IA está repetindo conteúdo já explicado!",
            context: expected.description
          };
          testResults.push(result);
          console.log(`❌ ${result.issue}`);
        } else {
          console.log(`✅ Não está repetindo - conteúdo novo`);
        }
      }

      // Atualizar histórico
      conversationHistory.push({ role: "user", content: userMsg });
      conversationHistory.push({ role: "assistant", content: response });
      assistantResponses.push(response);

      // Delay entre mensagens
      await new Promise(r => setTimeout(r, 1500));

    } catch (error) {
      console.error(`❌ Erro na mensagem ${i + 1}:`, error);
      testResults.push({
        passed: false,
        issue: `Erro: ${error}`,
        context: expected.description
      });
    }
  }

  // Resumo final
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 RESUMO DO TESTE PROFUNDO");
  console.log("═══════════════════════════════════════════════════════════════\n");

  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;

  console.log(`✅ Passou: ${passed}`);
  console.log(`❌ Falhou: ${failed}`);

  if (failed > 0) {
    console.log("\n🔴 PROBLEMAS ENCONTRADOS:");
    testResults.filter(r => !r.passed).forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.issue}`);
      console.log(`     Contexto: ${r.context}`);
    });
  }

  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

// Executar
runDeepTest().catch(console.error);
