/**
 * TESTE E2E DO SISTEMA DE MÍDIA
 * 
 * Este script simula EXATAMENTE o que acontece quando uma mensagem chega do WhatsApp:
 * 1. Mensagem é recebida
 * 2. IA processa e decide contextualmente se deve enviar mídia
 * 3. Verifica se as ações de mídia foram detectadas corretamente
 * 
 * NÃO É CHATBOT - A IA entende o CONTEXTO e decide quando enviar mídia
 */

// Carregar variáveis de ambiente PRIMEIRO
import 'dotenv/config';

import { db } from "./db";
import { storage } from "./storage";
import { generateAIResponse } from "./aiAgent";
import { getAgentMediaLibrary } from "./mediaService";

// Cores para output
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface TestCase {
  name: string;
  messages: string[]; // Histórico de mensagens do cliente
  expectedMediaTrigger?: string; // Nome da mídia esperada (se houver)
  shouldTriggerMedia: boolean;
}

// Cenários de teste - A IA deve ENTENDER o contexto, não palavras exatas
// NOTA: O agente atual é o "Rodrigo do AgenteZap" vendendo o software,
// então os testes devem refletir isso. As mídias cadastradas são de exemplo.
const TEST_CASES: TestCase[] = [
  // Testes que DEVEM acionar mídia (baseado nas mídias cadastradas)
  {
    name: "Cliente pede catálogo de produtos",
    messages: ["Oi", "Quero ver os produtos que vocês tem"],
    expectedMediaTrigger: "IMG_CATALOGO_PRECOS",
    shouldTriggerMedia: true,
  },
  {
    name: "Cliente pede tabela de preços diretamente",
    messages: ["Me manda a tabela de preços por favor"],
    expectedMediaTrigger: "IMG_CATALOGO_PRECOS",
    shouldTriggerMedia: true,
  },
  {
    name: "Cliente pede para ver catálogo",
    messages: ["Mostra o catálogo"],
    expectedMediaTrigger: "IMG_CATALOGO_PRECOS",
    shouldTriggerMedia: true,
  },
  {
    name: "Cliente quer ver imagem do produto",
    messages: ["Tem imagem do produto?", "Me manda uma foto"],
    expectedMediaTrigger: "IMG_CATALOGO_PRECOS",
    shouldTriggerMedia: true,
  },
  
  // Testes que NÃO devem acionar mídia
  {
    name: "Cliente só diz Oi (saudação simples)",
    messages: ["Oi"],
    shouldTriggerMedia: false, // O agente atual não tem áudio de boas-vindas obrigatório
  },
  {
    name: "Cliente pergunta sobre entrega",
    messages: ["Vocês entregam em São Paulo?"],
    shouldTriggerMedia: false,
  },
  {
    name: "Cliente faz pergunta genérica sobre serviço",
    messages: ["Como funciona o serviço de vocês?"],
    shouldTriggerMedia: false,
  },
  {
    name: "Cliente pergunta sobre preço do plano",
    messages: ["Quanto custa o plano mensal?"],
    shouldTriggerMedia: false, // Pergunta sobre preço do AgenteZap, não catálogo
  },
];

async function runTest(userId: string, testCase: TestCase): Promise<{
  passed: boolean;
  aiResponse: string | null;
  mediaActions: any[];
  details: string;
}> {
  console.log(`\n${BLUE}━━━ Testando: ${testCase.name} ━━━${RESET}`);
  console.log(`${YELLOW}Mensagens do cliente:${RESET}`);
  testCase.messages.forEach((msg, i) => console.log(`  ${i + 1}. "${msg}"`));

  // Simular histórico de conversa
  const conversationHistory = testCase.messages.slice(0, -1).map((text, i) => ({
    id: `msg-${i}`,
    conversationId: 'test-conv',
    messageId: `test-${i}`,
    fromMe: false,
    text,
    timestamp: new Date(Date.now() - (testCase.messages.length - i) * 60000),
    status: 'delivered' as const,
    isFromAgent: false,
  }));

  // Última mensagem do cliente (a que a IA vai responder)
  const newMessage = testCase.messages[testCase.messages.length - 1];

  try {
    // Chamar a MESMA função que o WhatsApp handler usa
    const result = await generateAIResponse(userId, conversationHistory, newMessage);

    if (!result) {
      return {
        passed: false,
        aiResponse: null,
        mediaActions: [],
        details: "IA não retornou resposta",
      };
    }

    const { text, mediaActions } = result;
    const hasMedia = mediaActions && mediaActions.length > 0;

    console.log(`${GREEN}Resposta da IA:${RESET} "${text?.substring(0, 150)}..."`);
    
    if (hasMedia) {
      console.log(`${GREEN}📁 Mídias detectadas:${RESET} ${mediaActions.map(a => a.media_name).join(', ')}`);
    } else {
      console.log(`${YELLOW}📁 Nenhuma mídia detectada${RESET}`);
    }

    // Verificar se o resultado está correto
    let passed = false;
    let details = "";

    if (testCase.shouldTriggerMedia) {
      if (hasMedia) {
        if (testCase.expectedMediaTrigger) {
          const found = mediaActions.some(a => a.media_name === testCase.expectedMediaTrigger);
          passed = found;
          details = found 
            ? `✅ Mídia correta detectada: ${testCase.expectedMediaTrigger}`
            : `❌ Esperava ${testCase.expectedMediaTrigger}, mas recebeu: ${mediaActions.map(a => a.media_name).join(', ')}`;
        } else {
          passed = true;
          details = `✅ Mídia detectada (qualquer): ${mediaActions.map(a => a.media_name).join(', ')}`;
        }
      } else {
        passed = false;
        details = `❌ Esperava mídia ${testCase.expectedMediaTrigger || 'qualquer'}, mas nenhuma foi detectada`;
      }
    } else {
      passed = !hasMedia;
      details = hasMedia 
        ? `❌ Não deveria enviar mídia, mas detectou: ${mediaActions.map(a => a.media_name).join(', ')}`
        : `✅ Corretamente não enviou mídia`;
    }

    return { passed, aiResponse: text, mediaActions: mediaActions || [], details };

  } catch (error) {
    return {
      passed: false,
      aiResponse: null,
      mediaActions: [],
      details: `Erro: ${error}`,
    };
  }
}

async function main() {
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║  TESTE E2E - SISTEMA DE MÍDIA CONTEXTUAL (NÃO É CHATBOT!)    ║${RESET}`);
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  // User ID do Rodrigo (admin)
  const userId = "731f255c-7fcd-4af9-9431-142e0a0234a1";

  // Verificar mídias disponíveis
  console.log(`${YELLOW}📁 Carregando biblioteca de mídias...${RESET}`);
  const mediaLibrary = await getAgentMediaLibrary(userId);
  console.log(`${GREEN}Mídias disponíveis:${RESET}`);
  mediaLibrary.forEach(m => {
    console.log(`  - ${m.name} (${m.mediaType}): ${m.whenToUse?.substring(0, 50) || 'N/A'}...`);
  });

  // Verificar config do agente
  const agentConfig = await storage.getAgentConfig(userId);
  if (!agentConfig?.isActive) {
    console.log(`${RED}❌ Agente não está ativo!${RESET}`);
    process.exit(1);
  }
  console.log(`${GREEN}✅ Agente ativo. Modelo: ${agentConfig.model}${RESET}`);

  // Rodar testes
  const results: { name: string; passed: boolean; details: string }[] = [];

  for (const testCase of TEST_CASES) {
    const result = await runTest(userId, testCase);
    results.push({ name: testCase.name, passed: result.passed, details: result.details });
    
    // Delay entre testes para não sobrecarregar API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Resumo
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║                      RESUMO DOS TESTES                        ║${RESET}`);
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  results.forEach(r => {
    const icon = r.passed ? `${GREEN}✅` : `${RED}❌`;
    console.log(`${icon} ${r.name}${RESET}`);
    console.log(`   ${r.details}`);
  });

  console.log(`\n${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
  console.log(`${GREEN}Passou: ${passed}${RESET} | ${RED}Falhou: ${failed}${RESET} | Total: ${results.length}`);
  
  if (failed === 0) {
    console.log(`\n${GREEN}🎉 TODOS OS TESTES PASSARAM! O sistema de mídia contextual está funcionando!${RESET}`);
  } else {
    console.log(`\n${YELLOW}⚠️ Alguns testes falharam. A IA pode precisar de ajustes no prompt.${RESET}`);
  }

  process.exit(failed > 0 ? 1 : 0);
}

// Rodar os testes
main().catch(console.error);
