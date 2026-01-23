/**
 * TESTE DE MÍDIAS - Agente Rhuan (Apê Fácil)
 * 
 * Testa se:
 * - "folder" envia FOLDER_GRANVI
 * - "folheto" envia FOLHETO_SOLARE_FIORE
 */

import 'dotenv/config';
import { testAgentResponse } from "./aiAgent";
import { getAgentMediaLibrary } from "./mediaService";

const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// User ID do Rhuan
const RHUAN_USER_ID = 'fb67aaf9-eb89-49f4-8002-1247e9bdc8ea';

interface TestCase {
  name: string;
  message: string;
  expectMedia: boolean;
  expectedMediaName?: string;
}

const testCases: TestCase[] = [
  // FOLDER - Deve enviar FOLDER_GRANVI
  { name: '📁 Folder direto', message: 'folder', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  { name: '📁 Quero folder', message: 'quero ver o folder', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  { name: '📁 Manda folder', message: 'manda o folder', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  { name: '📁 Envia folder', message: 'me envia o folder', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  { name: '📁 Tem folder?', message: 'tem folder?', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  { name: '📁 Posso ver folder?', message: 'posso ver o folder?', expectMedia: true, expectedMediaName: 'FOLDER_GRANVI' },
  
  // FOLHETO - Deve enviar FOLHETO_SOLARE_FIORE
  { name: '📄 Folheto direto', message: 'folheto', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  { name: '📄 Quero folheto', message: 'quero ver o folheto', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  { name: '📄 Manda folheto', message: 'manda o folheto', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  { name: '📄 Envia folheto', message: 'me envia o folheto', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  { name: '📄 Tem folheto?', message: 'tem folheto?', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  { name: '📄 Posso ver folheto?', message: 'posso ver o folheto?', expectMedia: true, expectedMediaName: 'FOLHETO_SOLARE_FIORE' },
  
  // NÃO DEVE ENVIAR
  { name: '❌ Saudação', message: 'oi, tudo bem?', expectMedia: false },
  { name: '❌ Interesse básico', message: 'tenho interesse', expectMedia: false },
  { name: '❌ Pergunta geral', message: 'como funciona?', expectMedia: false },
];

async function printMedias() {
  console.log(`\n${CYAN}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${CYAN}  📁 MÍDIAS CONFIGURADAS PARA O USUÁRIO RHUAN${RESET}`);
  console.log(`${CYAN}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  const medias = await getAgentMediaLibrary(RHUAN_USER_ID);
  
  for (const media of medias) {
    console.log(`${BOLD}${BLUE}${media.name}${RESET}`);
    console.log(`   Tipo: ${media.mediaType}`);
    console.log(`   Descrição: ${media.description?.substring(0, 80)}...`);
    console.log(`   Quando usar: ${media.whenToUse?.substring(0, 100)}...`);
    console.log(`   Ativo: ${media.isActive}`);
    console.log('');
  }
}

async function runTests(): Promise<void> {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}  🧪 TESTE DE MÍDIAS - AGENTE APÊ FÁCIL (RHUAN)${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  // Primeiro mostrar mídias configuradas
  await printMedias();
  
  console.log(`\n${BOLD}${YELLOW}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${YELLOW}  🔬 INICIANDO TESTES${RESET}`);
  console.log(`${BOLD}${YELLOW}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  let passed = 0;
  let failed = 0;
  
  for (const testCase of testCases) {
    console.log(`\n${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    console.log(`${BOLD}${testCase.name}${RESET}`);
    console.log(`📨 Mensagem: "${testCase.message}"`);
    console.log(`📁 Espera mídia: ${testCase.expectMedia ? `SIM (${testCase.expectedMediaName})` : 'NÃO'}`);
    console.log(`${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}`);
    
    try {
      const result = await testAgentResponse(RHUAN_USER_ID, testCase.message);
      
      const hasMedia = result.mediaActions && result.mediaActions.length > 0;
      const mediaNames = result.mediaActions?.map(a => a.media_name).join(', ') || 'nenhuma';
      
      console.log(`\n📝 Resposta IA: "${result.text?.substring(0, 150)}..."`);
      console.log(`📁 Mídias detectadas: ${mediaNames}`);
      
      // Verificar resultado
      let testPassed = false;
      
      if (testCase.expectMedia) {
        if (hasMedia) {
          if (testCase.expectedMediaName) {
            const foundExpected = result.mediaActions?.some(
              a => a.media_name?.toUpperCase() === testCase.expectedMediaName?.toUpperCase()
            );
            testPassed = !!foundExpected;
          } else {
            testPassed = true;
          }
        }
      } else {
        testPassed = !hasMedia;
      }
      
      if (testPassed) {
        console.log(`\n${GREEN}✅ PASSOU${RESET}`);
        passed++;
      } else {
        console.log(`\n${RED}❌ FALHOU${RESET}`);
        if (testCase.expectMedia) {
          console.log(`   Esperado: ${testCase.expectedMediaName || 'qualquer mídia'}`);
          console.log(`   Recebido: ${mediaNames}`);
        } else {
          console.log(`   Não deveria enviar mídia, mas enviou: ${mediaNames}`);
        }
        failed++;
      }
      
    } catch (error: any) {
      console.log(`\n${RED}❌ ERRO: ${error.message}${RESET}`);
      failed++;
    }
    
    // Delay para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
  
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  📊 RESULTADO FINAL${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${GREEN}✅ Passaram: ${passed}/${testCases.length}${RESET}`);
  if (failed > 0) {
    console.log(`${RED}❌ Falharam: ${failed}/${testCases.length}${RESET}`);
  }
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
