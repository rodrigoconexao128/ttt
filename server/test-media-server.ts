/**
 * TEST DE MÍDIA VIA SERVIDOR (usa sessão autenticada)
 * 
 * Este script usa o servidor rodando para testar o envio de mídias
 * via endpoint /api/agent/test
 */

import fs from 'fs';
import path from 'path';

// Cores para console
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Configuração
const SERVER_URL = 'http://localhost:5000';
const COOKIE_FILE = 'admin_cookies.txt';

interface TestCase {
  name: string;
  message: string;
  expectedMediaType: 'image' | 'audio' | 'video' | 'document' | 'any' | 'none';
  expectedMediaName?: string;
}

const testCases: TestCase[] = [
  // IMAGENS
  { name: '🖼️ Catálogo direto', message: 'me manda o catálogo', expectedMediaType: 'image', expectedMediaName: 'CATALOGO_PRODUTOS' },
  { name: '🖼️ Catálogo informal', message: 'manda o catalogo ai', expectedMediaType: 'image', expectedMediaName: 'CATALOGO_PRODUTOS' },
  { name: '🖼️ Cardápio', message: 'manda o cardapio', expectedMediaType: 'image', expectedMediaName: 'CARDAPIO' },
  
  // ÁUDIO - CRÍTICO (falhou no teste real)
  { name: '🎵 Áudio explicação', message: 'me manda um áudio explicando', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: '🎵 Áudio direto', message: 'manda um áudio', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: '🎵 Áudio vocal', message: 'grava um áudio pra mim', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: '🎵 Explicação em áudio', message: 'me envia uma explicação em audio', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  
  // VÍDEO
  { name: '🎬 Vídeo direto', message: 'manda um vídeo mostrando', expectedMediaType: 'video', expectedMediaName: 'VIDEO_DEMONSTRACAO' },
  { name: '🎬 Vídeo demonstração', message: 'tem vídeo?', expectedMediaType: 'video', expectedMediaName: 'VIDEO_DEMONSTRACAO' },
  
  // DOCUMENTO - CRÍTICO (falhou no teste real)
  { name: '📄 Contrato direto', message: 'me envia o contrato', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  { name: '📄 PDF direto', message: 'manda o PDF', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  { name: '📄 Documento', message: 'me envia o documento', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  { name: '📄 Contrato PDF', message: 'manda o contrato em PDF', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  
  // NÃO DEVE ENVIAR
  { name: '❌ Saudação', message: 'oi, tudo bem?', expectedMediaType: 'none' },
  { name: '❌ Obrigado', message: 'obrigado pela ajuda', expectedMediaType: 'none' },
  { name: '❌ Horário', message: 'qual o horário de funcionamento?', expectedMediaType: 'none' },
];

async function loadCookies(): Promise<string> {
  // Fazer login para obter cookie de sessão
  const loginPath = path.join(process.cwd(), 'tmp_admin_login.json');
  const loginData = JSON.parse(fs.readFileSync(loginPath, 'utf-8'));
  
  const loginResponse = await fetch(`${SERVER_URL}/api/admin/login`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(loginData),
  });
  
  if (!loginResponse.ok) {
    throw new Error(`Login falhou: ${loginResponse.status}`);
  }
  
  // Extrair cookie da resposta
  const setCookie = loginResponse.headers.get('set-cookie');
  if (!setCookie) {
    throw new Error('Nenhum cookie retornado pelo login');
  }
  
  // Parse do cookie
  const match = setCookie.match(/connect\.sid=([^;]+)/);
  if (!match) {
    throw new Error('Cookie connect.sid não encontrado na resposta');
  }
  
  return `connect.sid=${match[1]}`;
}

async function testMessage(cookie: string, message: string): Promise<{ text: string; mediaActions: any[] }> {
  const response = await fetch(`${SERVER_URL}/api/agent/test`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Cookie': cookie,
    },
    body: JSON.stringify({ message }),
  });
  
  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`HTTP ${response.status}: ${errorText}`);
  }
  
  const data = await response.json();
  return {
    text: data.response || '',
    mediaActions: data.mediaActions || [],
  };
}

async function runTests() {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}         🧪 TESTE DE MÍDIAS VIA SERVIDOR                  ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  // Carregar cookies
  let cookie: string;
  try {
    cookie = await loadCookies();
    console.log(`${GREEN}✅ Cookies carregados com sucesso${RESET}\n`);
  } catch (error) {
    console.log(`${RED}❌ ${error}${RESET}`);
    console.log(`${YELLOW}💡 Execute o servidor e faça login antes de rodar o teste${RESET}`);
    process.exit(1);
  }
  
  let passed = 0;
  let failed = 0;
  const failedTests: { name: string; message: string; expected: string; got: string; response: string }[] = [];
  
  for (const testCase of testCases) {
    try {
      const result = await testMessage(cookie, testCase.message);
      const mediaTags = result.mediaActions.map((a: any) => a.media_name);
      
      let success = false;
      let details = '';
      
      if (testCase.expectedMediaType === 'none') {
        success = mediaTags.length === 0;
        details = mediaTags.length === 0 
          ? '✅ Corretamente não enviou mídia' 
          : `❌ Enviou mídia indevidamente: ${mediaTags.join(', ')}`;
      } else if (testCase.expectedMediaType === 'any') {
        success = mediaTags.length > 0;
        details = success 
          ? `✅ Mídia enviada: ${mediaTags.join(', ')}` 
          : '❌ Não enviou nenhuma mídia';
      } else {
        if (testCase.expectedMediaName) {
          success = mediaTags.includes(testCase.expectedMediaName);
          details = success 
            ? `✅ Tag correta: ${testCase.expectedMediaName}` 
            : `❌ Esperava ${testCase.expectedMediaName}, recebeu: ${mediaTags.join(', ') || 'nenhuma'}`;
        } else {
          success = mediaTags.length > 0;
          details = success 
            ? `✅ Mídia enviada: ${mediaTags.join(', ')}` 
            : '❌ Não enviou nenhuma mídia';
        }
      }
      
      const statusIcon = success ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
      console.log(`${statusIcon} ${testCase.name}`);
      console.log(`   Input: "${testCase.message}"`);
      console.log(`   ${details}`);
      console.log(`   📝 Resposta: "${result.text.substring(0, 100)}..."\n`);
      
      if (success) {
        passed++;
      } else {
        failed++;
        failedTests.push({
          name: testCase.name,
          message: testCase.message,
          expected: testCase.expectedMediaName || testCase.expectedMediaType,
          got: mediaTags.join(', ') || 'nenhuma',
          response: result.text,
        });
      }
      
      // Delay entre requisições
      await new Promise(r => setTimeout(r, 800));
    } catch (error) {
      console.log(`${RED}❌ ${testCase.name}: ERRO - ${error}${RESET}\n`);
      failed++;
      failedTests.push({
        name: testCase.name,
        message: testCase.message,
        expected: testCase.expectedMediaName || testCase.expectedMediaType,
        got: 'ERRO',
        response: String(error),
      });
    }
  }
  
  // Resumo
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}                    📊 RESUMO FINAL                       ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  const rate = ((passed / testCases.length) * 100).toFixed(1);
  const rateColor = parseFloat(rate) >= 90 ? GREEN : parseFloat(rate) >= 70 ? YELLOW : RED;
  
  console.log(`${GREEN}✅ Passou: ${passed}${RESET} | ${RED}❌ Falhou: ${failed}${RESET} | Total: ${testCases.length}`);
  console.log(`${rateColor}📊 Taxa de acerto: ${rate}%${RESET}`);
  
  if (failed > 0) {
    console.log(`\n${RED}${BOLD}TESTES QUE FALHARAM:${RESET}`);
    for (const f of failedTests) {
      console.log(`\n${RED}❌ ${f.name}${RESET}`);
      console.log(`   Mensagem: "${f.message}"`);
      console.log(`   Esperado: ${f.expected}`);
      console.log(`   Recebido: ${f.got}`);
      console.log(`   Resposta: "${f.response.substring(0, 150)}..."`);
    }
  }
  
  if (parseFloat(rate) === 100) {
    console.log(`\n${GREEN}${BOLD}🎉 TODOS OS TESTES PASSARAM!${RESET}`);
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(console.error);
