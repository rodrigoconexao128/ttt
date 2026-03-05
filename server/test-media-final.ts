/**
 * TESTE DE MÍDIAS - USA testAgentResponse (sem verificar trigger phrases)
 * 
 * Testa se o sistema de mídias funciona para TODOS os tipos
 */

import 'dotenv/config';
import { db } from "./db";
import { testAgentResponse } from "./aiAgent";
import { upsertAgentMedia, getAgentMediaLibrary } from "./mediaService";
import { agentMediaLibrary } from "@shared/schema";
import { eq } from "drizzle-orm";

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

const TEST_USER_ID = '731f255c-7fcd-4af9-9431-142e0a0234a1';

interface TestCase {
  name: string;
  message: string;
  expectMedia: boolean;
  expectedMediaName?: string;
}

const testCases: TestCase[] = [
  // IMAGENS
  { name: '🖼️ Catálogo', message: 'me manda o catálogo', expectMedia: true, expectedMediaName: 'CATALOGO_PRODUTOS' },
  { name: '🖼️ Cardápio', message: 'manda o cardapio', expectMedia: true },
  { name: '🖼️ Foto/preços', message: 'tem foto dos preços?', expectMedia: true },
  
  // ÁUDIO - Crítico
  { name: '🎵 Áudio direto', message: 'me manda um áudio', expectMedia: true, expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: '🎵 Áudio explicando', message: 'manda um áudio explicando', expectMedia: true, expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: '🎵 Grava áudio', message: 'grava um áudio pra mim', expectMedia: true },
  
  // VÍDEO
  { name: '🎬 Vídeo direto', message: 'manda um vídeo', expectMedia: true, expectedMediaName: 'VIDEO_DEMONSTRACAO' },
  { name: '🎬 Tem vídeo?', message: 'tem vídeo?', expectMedia: true },
  
  // DOCUMENTO - Crítico
  { name: '📄 Contrato', message: 'me envia o contrato', expectMedia: true, expectedMediaName: 'PDF_CONTRATO' },
  { name: '📄 PDF', message: 'manda o PDF', expectMedia: true, expectedMediaName: 'PDF_CONTRATO' },
  { name: '📄 Documento', message: 'me envia o documento', expectMedia: true },
  
  // NÃO DEVE ENVIAR
  { name: '❌ Saudação', message: 'oi, tudo bem?', expectMedia: false },
  { name: '❌ Obrigado', message: 'obrigado pela ajuda', expectMedia: false },
  { name: '❌ Pergunta horário', message: 'qual o horário?', expectMedia: false },
  { name: '❌ Confirmação', message: 'ok, fechado', expectMedia: false },
];

async function setupTestMedia(): Promise<void> {
  console.log(`${YELLOW}Configurando mídias de teste...${RESET}`);
  
  // Limpar mídias existentes
  await db.delete(agentMediaLibrary).where(eq(agentMediaLibrary.userId, TEST_USER_ID));
  
  // Criar mídias de teste
  const mediaItems = [
    {
      userId: TEST_USER_ID,
      name: 'CATALOGO_PRODUTOS',
      mediaType: 'image' as const,
      storageUrl: 'https://example.com/catalogo.jpg',
      description: 'Catálogo de produtos',
      whenToUse: 'Quando pedirem catálogo, produtos, preços',
      isActive: true,
    },
    {
      userId: TEST_USER_ID,
      name: 'AUDIO_EXPLICACAO',
      mediaType: 'audio' as const,
      storageUrl: 'https://example.com/audio.ogg',
      description: 'Áudio explicativo',
      whenToUse: 'Quando pedirem áudio, explicação por voz',
      isActive: true,
    },
    {
      userId: TEST_USER_ID,
      name: 'VIDEO_DEMONSTRACAO',
      mediaType: 'video' as const,
      storageUrl: 'https://example.com/video.mp4',
      description: 'Vídeo demonstrativo',
      whenToUse: 'Quando pedirem vídeo, demonstração',
      isActive: true,
    },
    {
      userId: TEST_USER_ID,
      name: 'PDF_CONTRATO',
      mediaType: 'document' as const,
      storageUrl: 'https://example.com/contrato.pdf',
      description: 'Contrato em PDF',
      whenToUse: 'Quando pedirem contrato, documento, PDF',
      isActive: true,
    },
  ];
  
  for (const item of mediaItems) {
    await upsertAgentMedia(item);
  }
  
  const library = await getAgentMediaLibrary(TEST_USER_ID);
  console.log(`${GREEN}✅ ${library.length} mídias configuradas${RESET}\n`);
}

async function runTests(): Promise<void> {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}         🧪 TESTE DE MÍDIAS (testAgentResponse)           ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  await setupTestMedia();
  
  let passed = 0;
  let failed = 0;
  const failures: { name: string; expected: string; got: string; response: string }[] = [];
  
  for (const testCase of testCases) {
    process.stdout.write(`  ${testCase.name}... `);
    
    try {
      const result = await testAgentResponse(TEST_USER_ID, testCase.message);
      const hasMedia = result.mediaActions && result.mediaActions.length > 0;
      const mediaTags = result.mediaActions.map(a => a.media_name);
      
      let success = false;
      
      if (testCase.expectMedia) {
        if (testCase.expectedMediaName) {
          success = mediaTags.includes(testCase.expectedMediaName);
        } else {
          success = hasMedia;
        }
      } else {
        success = !hasMedia;
      }
      
      if (success) {
        console.log(`${GREEN}✅${RESET}`);
        passed++;
      } else {
        console.log(`${RED}❌${RESET}`);
        failed++;
        failures.push({
          name: testCase.name,
          expected: testCase.expectMedia 
            ? (testCase.expectedMediaName || 'qualquer mídia') 
            : 'nenhuma mídia',
          got: hasMedia ? mediaTags.join(', ') : 'nenhuma',
          response: result.text?.substring(0, 100) || 'sem resposta',
        });
      }
      
      // Delay entre testes
      await new Promise(r => setTimeout(r, 300));
    } catch (error) {
      console.log(`${RED}❌ ERRO: ${error}${RESET}`);
      failed++;
    }
  }
  
  // Resumo
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}                    📊 RESUMO                            ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  const rate = ((passed / testCases.length) * 100).toFixed(1);
  const rateColor = parseFloat(rate) >= 90 ? GREEN : parseFloat(rate) >= 70 ? YELLOW : RED;
  
  console.log(`${GREEN}✅ Passou: ${passed}${RESET} | ${RED}❌ Falhou: ${failed}${RESET} | Total: ${testCases.length}`);
  console.log(`${rateColor}📊 Taxa de acerto: ${rate}%${RESET}`);
  
  if (failures.length > 0) {
    console.log(`\n${RED}${BOLD}FALHAS:${RESET}`);
    for (const f of failures) {
      console.log(`\n${RED}❌ ${f.name}${RESET}`);
      console.log(`   Esperado: ${f.expected}`);
      console.log(`   Recebido: ${f.got}`);
      console.log(`   Resposta: "${f.response}..."`);
    }
  }
  
  if (parseFloat(rate) === 100) {
    console.log(`\n${GREEN}${BOLD}🎉 TODOS OS TESTES PASSARAM!${RESET}`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
