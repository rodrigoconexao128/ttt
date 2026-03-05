/**
 * 🧪 TESTE ISOLADO DE CLASSIFICAÇÃO DE MÍDIA COM IA
 * 
 * Este teste verifica se a função classifyMediaWithAI funciona corretamente
 * para QUALQUER biblioteca de mídia (não apenas keywords hardcoded).
 * 
 * Execute com: npx tsx test-media-ai-isolated.ts
 */

import { Mistral } from "@mistralai/mistralai";

// ============================================================================
// FUNÇÃO DE CLASSIFICAÇÃO (CÓPIA ISOLADA)
// ============================================================================

interface MediaClassificationInput {
  clientMessage: string;
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>;
  mediaLibrary: Array<{ 
    name: string; 
    type: string; 
    whenToUse: string | null;
    isActive?: boolean;
  }>;
  sentMedias?: string[];
}

interface MediaClassificationResult {
  shouldSend: boolean;
  mediaName: string | null;
  confidence: number;
  reason: string;
}

async function classifyMediaWithAI(
  input: MediaClassificationInput
): Promise<MediaClassificationResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🤖 [MEDIA AI] ════════════════════════════════════════════════`);
    console.log(`🤖 [MEDIA AI] Iniciando classificação de mídia com IA...`);
    
    const { clientMessage, conversationHistory, mediaLibrary, sentMedias = [] } = input;
    
    // Filtrar mídias já enviadas e inativas
    const availableMedia = mediaLibrary.filter(m => {
      const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
      return !alreadySent && m.isActive !== false;
    });
    
    if (availableMedia.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Nenhuma mídia disponível`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Nenhuma mídia disponível' };
    }
    
    // Detectar se é primeira mensagem
    const clientMsgCount = conversationHistory.filter(m => !m.fromMe).length;
    const isFirstMessage = clientMsgCount <= 1;
    
    // Formatar histórico recente (últimas 5 mensagens)
    const recentHistory = conversationHistory
      .slice(-10)
      .map(m => `${m.fromMe ? 'Agente' : 'Cliente'}: ${m.text || '(sem texto)'}`)
      .join('\n');
    
    // Formatar biblioteca de mídia
    const mediaListForAI = availableMedia
      .map((m, i) => `${i + 1}. NOME: "${m.name}" | TIPO: ${m.type} | QUANDO USAR: ${m.whenToUse || 'não especificado'}`)
      .join('\n');
    
    // Prompt de classificação
    const systemPrompt = `Você é um sistema de classificação de mídia para um chatbot de WhatsApp.
Sua tarefa é analisar a conversa e decidir SE e QUAL mídia deve ser enviada ao cliente.

## REGRAS IMPORTANTES:
1. Se for PRIMEIRA MENSAGEM do cliente (saudação como "oi", "olá", "bom dia"), procure por mídia de boas-vindas/início
2. Apenas recomende mídia se for CLARAMENTE RELEVANTE para o contexto
3. NÃO recomende mídia se o cliente estiver fazendo perguntas específicas que não precisam de mídia
4. Leia o campo "QUANDO USAR" de cada mídia para entender quando é apropriado enviar
5. Se nenhuma mídia for claramente apropriada, responda com NO_MEDIA
6. Confiança deve ser entre 0-100 (apenas envie se > 60)

## RESPONDA APENAS EM JSON:
{"decision": "SEND" ou "NO_MEDIA", "mediaName": "NOME_EXATO_DA_MIDIA" ou null, "confidence": 0-100, "reason": "explicação breve"}`;

    const userPrompt = `## CONTEXTO:
É a primeira mensagem do cliente? ${isFirstMessage ? 'SIM' : 'NÃO'}
Mensagem atual do cliente: "${clientMessage}"

## HISTÓRICO RECENTE:
${recentHistory || '(primeira interação)'}

## MÍDIAS DISPONÍVEIS:
${mediaListForAI}

## MÍDIAS JÁ ENVIADAS (não repetir):
${sentMedias.join(', ') || 'nenhuma'}

Analise e decida se alguma mídia deve ser enviada. Responda APENAS o JSON.`;

    // Usar API Key do ambiente
    const apiKey = process.env.MISTRAL_API_KEY;
    if (!apiKey) {
      throw new Error("MISTRAL_API_KEY não configurada. Defina a variável de ambiente.");
    }
    
    const mistral = new Mistral({ apiKey });
    
    // Usar modelo rápido e barato para classificação
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      maxTokens: 150,
      temperature: 0.1,
    });
    
    const elapsedMs = Date.now() - startTime;
    
    if (!response || !response.choices || response.choices.length === 0) {
      console.log(`🤖 [MEDIA AI] ❌ Sem resposta da API (${elapsedMs}ms)`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Sem resposta da API' };
    }
    
    const rawResponse = response.choices[0].message.content as string;
    console.log(`🤖 [MEDIA AI] 📥 Resposta bruta (${elapsedMs}ms): ${rawResponse}`);
    
    // Tentar extrair JSON
    const jsonMatch = rawResponse.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.log(`🤖 [MEDIA AI] ⚠️ Não conseguiu extrair JSON`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Resposta não é JSON válido' };
    }
    
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      
      const result: MediaClassificationResult = {
        shouldSend: parsed.decision === 'SEND' && parsed.confidence >= 60,
        mediaName: parsed.mediaName || null,
        confidence: parsed.confidence || 0,
        reason: parsed.reason || 'Sem razão especificada'
      };
      
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════`);
      if (result.shouldSend) {
        console.log(`🤖 [MEDIA AI] ✅ DECISÃO: ENVIAR "${result.mediaName}"`);
      } else {
        console.log(`🤖 [MEDIA AI] ❌ DECISÃO: NÃO ENVIAR`);
      }
      console.log(`🤖 [MEDIA AI] 📊 Confiança: ${result.confidence}%`);
      console.log(`🤖 [MEDIA AI] 💡 Razão: ${result.reason}`);
      console.log(`🤖 [MEDIA AI] ⏱️ Tempo: ${elapsedMs}ms`);
      console.log(`🤖 [MEDIA AI] ════════════════════════════════════════════════\n`);
      
      return result;
    } catch (parseError) {
      console.log(`🤖 [MEDIA AI] ⚠️ Erro ao parsear JSON: ${parseError}`);
      return { shouldSend: false, mediaName: null, confidence: 0, reason: 'Erro ao parsear resposta' };
    }
    
  } catch (error: any) {
    console.error(`🤖 [MEDIA AI] ❌ ERRO: ${error.message}`);
    return { shouldSend: false, mediaName: null, confidence: 0, reason: `Erro: ${error.message}` };
  }
}

// ============================================================================
// BIBLIOTECAS DE MÍDIA DE DIFERENTES USUÁRIOS
// ============================================================================

// Usuário 1: AgentZap (rodrigo4@gmail.com)
const mediaLibraryAgentZap = [
  { name: "MENSAGEM_DE_INICIO", type: "audio", whenToUse: "Enviar quando cliente mandar primeira mensagem (oi, olá, bom dia)", isActive: true },
  { name: "NOTIFICADOR_INTELIGENTE", type: "video", whenToUse: "Quando perguntar sobre leads quentes ou notificações", isActive: true },
  { name: "DETALHES_DO_SISTEMA", type: "video", whenToUse: "Quando quiser ver demonstração ou entender como funciona", isActive: true },
  { name: "KANBAN_CRM", type: "video", whenToUse: "Quando perguntar sobre CRM, organização ou kanban", isActive: true },
  { name: "ENVIO_EM_MASSA", type: "video", whenToUse: "Quando perguntar sobre envio em massa ou campanhas", isActive: true },
];

// Usuário 2: Clínica de Estética
const mediaLibraryClinica = [
  { name: "VIDEO_BOAS_VINDAS", type: "video", whenToUse: "Primeira mensagem do cliente", isActive: true },
  { name: "TABELA_PRECOS", type: "image", whenToUse: "Quando perguntar sobre valores, preços ou quanto custa", isActive: true },
  { name: "ANTES_DEPOIS_BOTOX", type: "image", whenToUse: "Quando falar sobre botox ou tratamento facial", isActive: true },
  { name: "LOCALIZACAO", type: "image", whenToUse: "Quando perguntar onde fica ou endereço", isActive: true },
];

// Usuário 3: Loja de Roupas
const mediaLibraryLoja = [
  { name: "CATALOGO_VERAO", type: "document", whenToUse: "Quando perguntar sobre novidades ou catálogo", isActive: true },
  { name: "PROMOCAO_DO_DIA", type: "image", whenToUse: "Quando mencionar promoção ou desconto", isActive: true },
  { name: "AUDIO_ATENDIMENTO", type: "audio", whenToUse: "Primeira mensagem ou saudação inicial", isActive: true },
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
  expectedDecision: 'SEND' | 'NO_MEDIA' | 'ANY';
  expectedMediaName?: string;
}

const testScenarios: TestScenario[] = [
  // ========== AGENTZAP ==========
  {
    name: "AgentZap - Primeira mensagem",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Oi",
    conversationHistory: [{ text: "Oi", fromMe: false }],
    sentMedias: [],
    expectedDecision: 'SEND',
    expectedMediaName: "MENSAGEM_DE_INICIO",
  },
  {
    name: "AgentZap - Pergunta sobre CRM",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Como funciona o CRM?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá! Bem-vindo!", fromMe: true },
      { text: "Como funciona o CRM?", fromMe: false },
    ],
    sentMedias: ["MENSAGEM_DE_INICIO"],
    expectedDecision: 'SEND',
    expectedMediaName: "KANBAN_CRM",
  },
  {
    name: "AgentZap - Pergunta genérica",
    mediaLibrary: mediaLibraryAgentZap,
    clientMessage: "Qual horário de funcionamento?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá!", fromMe: true },
      { text: "Qual horário de funcionamento?", fromMe: false },
    ],
    sentMedias: ["MENSAGEM_DE_INICIO"],
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
      { text: "Olá!", fromMe: true },
      { text: "Quanto custa o botox?", fromMe: false },
    ],
    sentMedias: ["VIDEO_BOAS_VINDAS"],
    expectedDecision: 'SEND',
    // Pode ser TABELA_PRECOS ou ANTES_DEPOIS_BOTOX (ambos são relevantes)
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
    clientMessage: "Tem alguma promoção?",
    conversationHistory: [
      { text: "Oi", fromMe: false },
      { text: "Olá!", fromMe: true },
      { text: "Tem alguma promoção?", fromMe: false },
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
  console.log(`📌 Testando para MÚLTIPLAS bibliotecas de mídia`);
  console.log(`${'═'.repeat(70)}\n`);

  // Verificar se a API key está configurada
  if (!process.env.MISTRAL_API_KEY) {
    console.error(`❌ ERRO: MISTRAL_API_KEY não configurada!`);
    console.error(`   Configure com: set MISTRAL_API_KEY=sua_chave_aqui`);
    process.exit(1);
  }

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
        testPassed = true;
      } else if (scenario.expectedDecision === decision) {
        if (scenario.expectedMediaName) {
          testPassed = result.mediaName?.toUpperCase().includes(scenario.expectedMediaName.toUpperCase()) || false;
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
        results.push(`❌ ${scenario.name}`);
        console.log(`\n❌ FALHOU!`);
        console.log(`   Esperado: ${scenario.expectedDecision} / ${scenario.expectedMediaName || 'qualquer'}`);
        console.log(`   Obtido: ${decision} / ${result.mediaName || 'nenhuma'}`);
      }

    } catch (error: any) {
      failed++;
      results.push(`❌ ${scenario.name} (ERRO)`);
      console.log(`\n❌ ERRO: ${error.message}`);
    }

    // Pausa entre testes
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
