/**
 * 🧪 TESTE DE CLASSIFICAÇÃO DE MÍDIA COM IA
 * 
 * Este teste verifica se a nova função classifyMediaWithAI funciona corretamente
 * para QUALQUER biblioteca de mídia (não apenas keywords hardcoded).
 * 
 * Execute com: npx tsx test-media-ai-classification.ts
 */

import { classifyMediaWithAI } from "./server/mistralClient";

// ============================================================================
// BIBLIOTECA DE MÍDIA DE EXEMPLO (simula diferentes usuários)
// ============================================================================

// Usuário 1: AgentZap (biblioteca do rodrigo4@gmail.com)
const mediaLibraryAgentZap = [
  {
    name: "MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR",
    type: "audio",
    whenToUse: "Enviar apenas quando: O cliente mandar a primeira mensagem (oi, olá, bom dia, etc)",
    isActive: true,
  },
  {
    name: "NOTIFICADOR_INTELIGENTE",
    type: "video",
    whenToUse: "Enviar apenas quando: O cliente perguntar sobre leads quentes ou notificações",
    isActive: true,
  },
  {
    name: "DETALHES_DO_SISTEMA",
    type: "video",
    whenToUse: "Enviar apenas quando: O cliente quiser ver uma demonstração ou entender como funciona",
    isActive: true,
  },
  {
    name: "KANBAN_CRM",
    type: "video",
    whenToUse: "Enviar apenas quando: O cliente perguntar sobre organização, CRM ou kanban",
    isActive: true,
  },
  {
    name: "ENVIO_EM_MASSA",
    type: "video",
    whenToUse: "Enviar apenas quando: O cliente perguntar sobre envio em massa, campanhas ou broadcast",
    isActive: true,
  },
];

// Usuário 2: Clínica de Estética
const mediaLibraryClinica = [
  {
    name: "VIDEO_BOAS_VINDAS",
    type: "video",
    whenToUse: "Enviar na primeira mensagem do cliente",
    isActive: true,
  },
  {
    name: "TABELA_PRECOS",
    type: "image",
    whenToUse: "Quando o cliente perguntar sobre valores, preços ou quanto custa",
    isActive: true,
  },
  {
    name: "ANTES_DEPOIS_BOTOX",
    type: "image",
    whenToUse: "Quando falar sobre botox, rugas ou tratamento facial",
    isActive: true,
  },
  {
    name: "LOCALIZACAO",
    type: "image",
    whenToUse: "Quando perguntar onde fica, endereço ou como chegar",
    isActive: true,
  },
];

// Usuário 3: Loja de Roupas
const mediaLibraryLoja = [
  {
    name: "CATALOGO_VERAO",
    type: "document",
    whenToUse: "Quando perguntar sobre novidades, coleção ou catálogo",
    isActive: true,
  },
  {
    name: "PROMOCAO_DO_DIA",
    type: "image",
    whenToUse: "Quando mencionar promoção, desconto ou oferta",
    isActive: true,
  },
  {
    name: "AUDIO_ATENDIMENTO",
    type: "audio",
    whenToUse: "Primeira mensagem ou saudação inicial",
    isActive: true,
  },
];

// ============================================================================
// CENÁRIOS DE TESTE
// ============================================================================

interface TestScenario {
  name: string;
  mediaLibrary: typeof mediaLibraryAgentZap;
  clientMessage: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  sentMedias: string[];
  expectedDecision: 'SEND' | 'NO_MEDIA' | 'ANY'; // 'ANY' para casos onde qualquer decisão é válida
  expectedMediaName?: string; // Nome esperado da mídia (opcional)
}

const testScenarios: TestScenario[] = [
  // ========== AGENTZAP ==========
  {
    name: "AgentZap - Primeira mensagem (oi)",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Oi",
    conversationHistory: [{ text: "Oi", fromMe: false }],
    sentMedias: [],
    expectedDecision: 'SEND',
    expectedMediaName: "MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR",
  },
  {
    name: "AgentZap - Pergunta sobre CRM",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Como funciona o CRM de vocês?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá! Bem-vindo ao AgentZap!", fromMe: true },
      { text: "Como funciona o CRM de vocês?", fromMe: false },
    ],
    sentMedias: ["MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR"],
    expectedDecision: 'SEND',
    expectedMediaName: "KANBAN_CRM",
  },
  {
    name: "AgentZap - Pergunta genérica (sem mídia relevante)",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Qual horário de funcionamento?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá!", fromMe: true },
      { text: "Qual horário de funcionamento?", fromMe: false },
    ],
    sentMedias: ["MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR"],
    expectedDecision: 'NO_MEDIA',
  },

  // ========== CLÍNICA ==========
  {
    name: "Clínica - Primeira mensagem",
    mediaLibrary: mediaLibraryClinica,
    clientMessage: "Bom dia!",
    conversationHistory: [{ text: "Bom dia!", fromMe: false }],
    sentMedias: [],
    expectedDecision: 'SEND',
    expectedMediaName: "VIDEO_BOAS_VINDAS",
  },
  {
    name: "Clínica - Pergunta sobre preço",
    mediaLibrary: mediaLibraryClinica,
    clientMessage: "Quanto custa o botox?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá! Bem-vinda!", fromMe: true },
      { text: "Quanto custa o botox?", fromMe: false },
    ],
    sentMedias: ["VIDEO_BOAS_VINDAS"],
    expectedDecision: 'SEND',
    expectedMediaName: "TABELA_PRECOS",
  },
  {
    name: "Clínica - Pergunta sobre localização",
    mediaLibrary: mediaLibraryClinica,
    clientMessage: "Onde fica a clínica?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá!", fromMe: true },
      { text: "Onde fica a clínica?", fromMe: false },
    ],
    sentMedias: [],
    expectedDecision: 'SEND',
    expectedMediaName: "LOCALIZACAO",
  },

  // ========== LOJA ==========
  {
    name: "Loja - Primeira mensagem",
    mediaLibrary: mediaLibraryLoja,
    clientMessage: "Olá",
    conversationHistory: [{ text: "Olá", fromMe: false }],
    sentMedias: [],
    expectedDecision: 'SEND',
    expectedMediaName: "AUDIO_ATENDIMENTO",
  },
  {
    name: "Loja - Pergunta sobre promoção",
    mediaLibrary: mediaLibraryLoja,
    clientMessage: "Tem alguma promoção hoje?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá!", fromMe: true },
      { text: "Tem alguma promoção hoje?", fromMe: false },
    ],
    sentMedias: ["AUDIO_ATENDIMENTO"],
    expectedDecision: 'SEND',
    expectedMediaName: "PROMOCAO_DO_DIA",
  },
];

// ============================================================================
// EXECUÇÃO DOS TESTES
// ============================================================================

async function runTests() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 TESTE DE CLASSIFICAÇÃO DE MÍDIA COM IA`);
  console.log(`${'═'.repeat(70)}\n`);

  let passed = 0;
  let failed = 0;
  const results: string[] = [];

  for (const scenario of testScenarios) {
    console.log(`\n${'─'.repeat(70)}`);
    console.log(`📋 Cenário: ${scenario.name}`);
    console.log(`💬 Mensagem: "${scenario.clientMessage}"`);
    console.log(`${'─'.repeat(70)}`);

    try {
      const result = await classifyMediaWithAI({
        clientMessage: scenario.clientMessage,
        conversationHistory: scenario.conversationHistory,
        mediaLibrary: scenario.mediaLibrary,
        sentMedias: scenario.sentMedias,
      });

      const decision = result.shouldSend ? 'SEND' : 'NO_MEDIA';
      
      // Verificar se o resultado está correto
      let testPassed = false;
      
      if (scenario.expectedDecision === 'ANY') {
        testPassed = true; // Qualquer decisão é válida
      } else if (scenario.expectedDecision === decision) {
        if (scenario.expectedMediaName) {
          testPassed = result.mediaName?.toUpperCase() === scenario.expectedMediaName.toUpperCase();
        } else {
          testPassed = true;
        }
      }

      if (testPassed) {
        passed++;
        results.push(`✅ ${scenario.name}`);
        console.log(`\n✅ PASSOU!`);
      } else {
        failed++;
        results.push(`❌ ${scenario.name} (esperado: ${scenario.expectedDecision}/${scenario.expectedMediaName || 'qualquer'}, obtido: ${decision}/${result.mediaName || 'nenhuma'})`);
        console.log(`\n❌ FALHOU!`);
        console.log(`   Esperado: ${scenario.expectedDecision} / ${scenario.expectedMediaName || 'qualquer'}`);
        console.log(`   Obtido: ${decision} / ${result.mediaName || 'nenhuma'}`);
      }

      console.log(`\n📊 Resultado da IA:`);
      console.log(`   Decisão: ${decision}`);
      console.log(`   Mídia: ${result.mediaName || 'nenhuma'}`);
      console.log(`   Confiança: ${result.confidence}%`);
      console.log(`   Razão: ${result.reason}`);

    } catch (error: any) {
      failed++;
      results.push(`❌ ${scenario.name} (ERRO: ${error.message})`);
      console.log(`\n❌ ERRO: ${error.message}`);
    }

    // Pequena pausa entre testes para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  // Resumo final
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 RESUMO DOS TESTES`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`\n✅ Passou: ${passed}/${testScenarios.length}`);
  console.log(`❌ Falhou: ${failed}/${testScenarios.length}`);
  console.log(`📈 Taxa de sucesso: ${((passed / testScenarios.length) * 100).toFixed(1)}%`);
  console.log(`\nDetalhes:`);
  results.forEach(r => console.log(`   ${r}`));
  console.log(`\n${'═'.repeat(70)}\n`);

  return { passed, failed, total: testScenarios.length };
}

// Executar
runTests().catch(console.error);
