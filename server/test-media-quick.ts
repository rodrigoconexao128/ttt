/**
 * TESTE RÁPIDO DO SISTEMA DE MÍDIA - 30 CENÁRIOS CHAVE
 * Foco nos cenários mais importantes para validar o sistema
 */

import 'dotenv/config';
import { db } from "./db";
import { storage } from "./storage";
import { generateAIResponse } from "./aiAgent";
import { getAgentMediaLibrary, upsertAgentMedia } from "./mediaService";
import { agentMediaLibrary, aiAgentConfig } from "@shared/schema";
import { eq } from "drizzle-orm";

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const RESET = '\x1b[0m';

interface TestCase {
  name: string;
  messages: string[];
  shouldTriggerMedia: boolean;
  expectedMediaType?: string;
}

// Cenários focados nos casos mais importantes
const TEST_CASES: TestCase[] = [
  // ✅ DEVEM ENVIAR MÍDIA
  { name: "Pede catálogo", messages: ["Manda o catálogo"], shouldTriggerMedia: true, expectedMediaType: "image" },
  { name: "Pede foto", messages: ["Me manda uma foto"], shouldTriggerMedia: true, expectedMediaType: "image" },
  { name: "Quer ver produtos", messages: ["Quero ver os produtos"], shouldTriggerMedia: true, expectedMediaType: "image" },
  { name: "Tabela de preços", messages: ["Manda a tabela de preços"], shouldTriggerMedia: true, expectedMediaType: "image" },
  { name: "Pede áudio", messages: ["Me manda um áudio"], shouldTriggerMedia: true, expectedMediaType: "audio" },
  { name: "Pede vídeo", messages: ["Tem vídeo mostrando?"], shouldTriggerMedia: true, expectedMediaType: "video" },
  { name: "Pede PDF", messages: ["Me manda o PDF"], shouldTriggerMedia: true, expectedMediaType: "document" },
  { name: "Pede contrato", messages: ["Quero ver o contrato"], shouldTriggerMedia: true, expectedMediaType: "document" },
  { name: "Mostra o cardápio", messages: ["Mostra o cardápio"], shouldTriggerMedia: true, expectedMediaType: "image" },
  { name: "Informal - manda aí", messages: ["Manda aí o catálogo"], shouldTriggerMedia: true, expectedMediaType: "image" },
  
  // ❌ NÃO DEVEM ENVIAR MÍDIA
  { name: "Saudação Oi", messages: ["Oi"], shouldTriggerMedia: false },
  { name: "Saudação Bom dia", messages: ["Bom dia!"], shouldTriggerMedia: false },
  { name: "Agradecimento", messages: ["Obrigado pela informação"], shouldTriggerMedia: false },
  { name: "Pergunta horário", messages: ["Qual o horário de funcionamento?"], shouldTriggerMedia: false },
  { name: "Pergunta localização", messages: ["Onde fica vocês?"], shouldTriggerMedia: false },
  { name: "Confirma pedido", messages: ["Ok, fechado então"], shouldTriggerMedia: false },
  { name: "Pergunta entrega", messages: ["Vocês fazem entrega?"], shouldTriggerMedia: false },
  { name: "Pergunta pagamento", messages: ["Como funciona o pagamento?"], shouldTriggerMedia: false },
  { name: "Elogio", messages: ["Vocês são muito bons!"], shouldTriggerMedia: false },
  { name: "Reclamação", messages: ["Estou tendo um problema"], shouldTriggerMedia: false },
  { name: "Só emoji", messages: ["👍"], shouldTriggerMedia: false },
  { name: "Só pontuação", messages: ["???"], shouldTriggerMedia: false },
];

async function setupTestMedia(userId: string): Promise<void> {
  // Limpar mídias antigas
  await db.delete(agentMediaLibrary).where(eq(agentMediaLibrary.userId, userId));
  
  // Inserir mídias de teste
  const medias = [
    { name: "CATALOGO_PRODUTOS", mediaType: "image" as const, description: "Catálogo de produtos", whenToUse: "Quando pedirem catálogo, produtos, preços" },
    { name: "AUDIO_EXPLICACAO", mediaType: "audio" as const, description: "Áudio explicativo", whenToUse: "Quando pedirem áudio, explicação verbal" },
    { name: "VIDEO_DEMONSTRACAO", mediaType: "video" as const, description: "Vídeo demonstrativo", whenToUse: "Quando pedirem vídeo, demonstração" },
    { name: "PDF_CONTRATO", mediaType: "document" as const, description: "Contrato em PDF", whenToUse: "Quando pedirem contrato, documento, PDF" },
  ];
  
  for (const m of medias) {
    await upsertAgentMedia({
      userId,
      name: m.name,
      mediaType: m.mediaType,
      storageUrl: `https://example.com/${m.name.toLowerCase()}.${m.mediaType === 'image' ? 'jpg' : m.mediaType === 'audio' ? 'mp3' : m.mediaType === 'video' ? 'mp4' : 'pdf'}`,
      description: m.description,
      whenToUse: m.whenToUse,
      isActive: true,
      displayOrder: medias.indexOf(m),
    });
  }
}

async function runTest(userId: string, testCase: TestCase): Promise<boolean> {
  const conversationHistory = testCase.messages.slice(0, -1).map((text, i) => ({
    id: `msg-${i}`,
    conversationId: 'test-conv',
    messageId: `test-${i}`,
    fromMe: false,
    text,
    timestamp: new Date(),
    status: 'delivered' as const,
    isFromAgent: false,
  }));

  const newMessage = testCase.messages[testCase.messages.length - 1];

  try {
    const result = await generateAIResponse(userId, conversationHistory, newMessage);
    if (!result) {
      return !testCase.shouldTriggerMedia;
    }

    const hasMedia = result.mediaActions && result.mediaActions.length > 0;
    
    if (testCase.shouldTriggerMedia) {
      return hasMedia;
    } else {
      return !hasMedia;
    }
  } catch (error) {
    console.log(`${RED}Erro: ${error}${RESET}`);
    return false;
  }
}

async function main() {
  console.log(`\n${BLUE}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  console.log(`${BLUE}║     TESTE RÁPIDO - SISTEMA DE MÍDIA CONTEXTUAL                ║${RESET}`);
  console.log(`${BLUE}╚══════════════════════════════════════════════════════════════╝${RESET}\n`);

  const userId = "731f255c-7fcd-4af9-9431-142e0a0234a1";
  
  // Setup
  console.log(`${YELLOW}Configurando mídias de teste...${RESET}`);
  await setupTestMedia(userId);
  
  // Verificar agente
  const agentConfig = await storage.getAgentConfig(userId);
  if (!agentConfig?.isActive) {
    console.log(`${RED}❌ Agente não está ativo!${RESET}`);
    process.exit(1);
  }
  
  console.log(`${GREEN}✅ Agente ativo. Iniciando testes...${RESET}\n`);
  
  let passed = 0;
  let failed = 0;
  const failures: string[] = [];
  
  for (const testCase of TEST_CASES) {
    process.stdout.write(`  ${testCase.name}... `);
    
    const result = await runTest(userId, testCase);
    
    if (result) {
      console.log(`${GREEN}✓${RESET}`);
      passed++;
    } else {
      console.log(`${RED}✗${RESET}`);
      failed++;
      failures.push(testCase.name);
    }
    
    // Delay pequeno
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Resumo
  console.log(`\n${BLUE}══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${GREEN}✅ Passou: ${passed}${RESET} | ${RED}❌ Falhou: ${failed}${RESET} | Total: ${TEST_CASES.length}`);
  const rate = ((passed / TEST_CASES.length) * 100).toFixed(1);
  console.log(`📊 Taxa de acerto: ${rate}%`);
  
  if (failures.length > 0) {
    console.log(`\n${RED}Falhas: ${failures.join(', ')}${RESET}`);
  }
  
  if (failed === 0) {
    console.log(`\n${GREEN}🎉 TODOS OS TESTES PASSARAM!${RESET}`);
  } else if (parseFloat(rate) >= 90) {
    console.log(`\n${YELLOW}⚠️ Sistema funcionando bem (${rate}%)${RESET}`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(console.error);
