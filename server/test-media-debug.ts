/**
 * TEST DE DIAGNÓSTICO COMPLETO DE MÍDIAS
 * 
 * Este teste simula o fluxo real de:
 * 1. Carregar biblioteca de mídia
 * 2. Gerar prompt com mídia
 * 3. Enviar para IA
 * 4. Verificar se a tag foi usada
 * 5. Testar parsear as tags
 */

import { db } from "./db";
import { agentMediaLibrary, aiAgentConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import Anthropic from "@anthropic-ai/sdk";

// Cores para console
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';
const BOLD = '\x1b[1m';

// Usuário de teste
const TEST_USER_ID = '731f255c-7fcd-4af9-9431-142e0a0234a1';

interface MediaItem {
  id: string;
  name: string;
  mediaType: string;
  description: string | null;
  whenToUse: string | null;
  storageUrl: string;
}

async function getMediaLibrary(): Promise<MediaItem[]> {
  const media = await db
    .select()
    .from(agentMediaLibrary)
    .where(and(
      eq(agentMediaLibrary.userId, TEST_USER_ID),
      eq(agentMediaLibrary.isActive, true)
    ));
  
  return media as MediaItem[];
}

async function getAgentPrompt(): Promise<string | null> {
  const [config] = await db
    .select()
    .from(aiAgentConfig)
    .where(eq(aiAgentConfig.userId, TEST_USER_ID))
    .limit(1);
  
  return config?.prompt || null;
}

function generateMediaPromptBlock(mediaList: MediaItem[]): string {
  if (!mediaList || mediaList.length === 0) {
    return '';
  }

  const audioMidias = mediaList.filter(m => m.mediaType === 'audio');
  const imageMidias = mediaList.filter(m => m.mediaType === 'image');
  const videoMidias = mediaList.filter(m => m.mediaType === 'video');
  const documentMidias = mediaList.filter(m => m.mediaType === 'document');

  const formatMedia = (m: MediaItem) => {
    const parts = [`**${m.name}**`];
    if (m.description) parts.push(`→ ${m.description}`);
    if (m.whenToUse) parts.push(`| Gatilho: ${m.whenToUse}`);
    return `  - ${parts.join(' ')}`;
  };

  let mediaBlock = `

---
📁 **MÍDIAS DISPONÍVEIS PARA ENVIAR**

Você tem as seguintes mídias que PODE e DEVE enviar quando o cliente pedir:

`;

  if (imageMidias.length > 0) {
    mediaBlock += `🖼️ **IMAGENS:**
${imageMidias.map(formatMedia).join('\n')}

`;
  }

  if (audioMidias.length > 0) {
    mediaBlock += `🎵 **ÁUDIOS:**
${audioMidias.map(formatMedia).join('\n')}

`;
  }

  if (videoMidias.length > 0) {
    mediaBlock += `🎬 **VÍDEOS:**
${videoMidias.map(formatMedia).join('\n')}

`;
  }

  if (documentMidias.length > 0) {
    mediaBlock += `📄 **DOCUMENTOS/PDFs:**
${documentMidias.map(formatMedia).join('\n')}

`;
  }

  mediaBlock += `
---
**INSTRUÇÕES OBRIGATÓRIAS PARA ENVIO DE MÍDIA:**

Quando o cliente pedir QUALQUER mídia listada acima, você DEVE:
1. Responder confirmando o envio
2. Adicionar a tag no FINAL da resposta: [ENVIAR_MIDIA:NOME_EXATO]

**EXEMPLOS DE PEDIDOS E RESPOSTAS:**

Cliente: "me manda o catálogo"
→ Resposta: "Claro! Vou te enviar o catálogo agora. [ENVIAR_MIDIA:CATALOGO_PRODUTOS]"

Cliente: "me envia o contrato"
→ Resposta: "Certo! Segue o contrato em PDF. [ENVIAR_MIDIA:PDF_CONTRATO]"

Cliente: "manda um áudio explicando"
→ Resposta: "Vou te mandar um áudio explicativo! [ENVIAR_MIDIA:AUDIO_EXPLICACAO]"

Cliente: "tem vídeo?"
→ Resposta: "Tenho sim! Vou te enviar agora. [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]"

**IMPORTANTE:**
- Use EXATAMENTE os nomes das mídias listados acima (em MAIÚSCULAS)
- A tag DEVE estar no formato [ENVIAR_MIDIA:NOME] sem espaços
- SEMPRE adicione a tag quando o cliente pedir mídia
---
`;

  return mediaBlock;
}

function parseMediaTags(text: string): string[] {
  const regex = /\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/gi;
  const tags: string[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = regex.exec(text)) !== null) {
    tags.push(match[1].toUpperCase());
  }
  
  return tags;
}

async function testWithMistral(systemPrompt: string, userMessage: string): Promise<{ text: string; tags: string[] }> {
  const mistralApiKey = process.env.MISTRAL_API_KEY;
  
  if (!mistralApiKey) {
    throw new Error('MISTRAL_API_KEY não configurada');
  }
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${mistralApiKey}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userMessage },
      ],
      temperature: 0.3,
      max_tokens: 500,
    }),
  });
  
  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.status}`);
  }
  
  const data = await response.json();
  const text = data.choices[0]?.message?.content || '';
  const tags = parseMediaTags(text);
  
  return { text, tags };
}

interface TestCase {
  name: string;
  message: string;
  expectedMediaType: 'image' | 'audio' | 'video' | 'document' | 'none';
  expectedMediaName?: string;
}

const testCases: TestCase[] = [
  // IMAGENS
  { name: 'Catálogo', message: 'me manda o catálogo', expectedMediaType: 'image', expectedMediaName: 'CATALOGO_PRODUTOS' },
  { name: 'Catálogo (informal)', message: 'manda o catalogo ai', expectedMediaType: 'image', expectedMediaName: 'CATALOGO_PRODUTOS' },
  
  // ÁUDIO
  { name: 'Áudio explicação', message: 'manda um áudio explicando', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: 'Áudio (informal)', message: 'me envia uma explicação em audio', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  { name: 'Áudio (vocal)', message: 'pode me mandar um vocal explicando?', expectedMediaType: 'audio', expectedMediaName: 'AUDIO_EXPLICACAO' },
  
  // VÍDEO
  { name: 'Vídeo demonstração', message: 'tem vídeo mostrando como funciona?', expectedMediaType: 'video', expectedMediaName: 'VIDEO_DEMONSTRACAO' },
  { name: 'Vídeo (direto)', message: 'manda um vídeo', expectedMediaType: 'video', expectedMediaName: 'VIDEO_DEMONSTRACAO' },
  
  // DOCUMENTO
  { name: 'Contrato PDF', message: 'me envia o contrato', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  { name: 'Documento (PDF)', message: 'manda o PDF do contrato', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  { name: 'Documento (proposta)', message: 'pode me enviar o documento?', expectedMediaType: 'document', expectedMediaName: 'PDF_CONTRATO' },
  
  // NÃO DEVE ENVIAR
  { name: 'Saudação', message: 'oi, tudo bem?', expectedMediaType: 'none' },
  { name: 'Obrigado', message: 'obrigado pela ajuda', expectedMediaType: 'none' },
  { name: 'Pergunta simples', message: 'qual o horário de funcionamento?', expectedMediaType: 'none' },
];

async function runDiagnostic() {
  console.log(`\n${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}${BLUE}         🔍 DIAGNÓSTICO COMPLETO DE MÍDIAS              ${RESET}`);
  console.log(`${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${RESET}\n`);
  
  // 1. Verificar biblioteca de mídia
  console.log(`${YELLOW}[1] VERIFICANDO BIBLIOTECA DE MÍDIA...${RESET}\n`);
  
  const mediaLibrary = await getMediaLibrary();
  
  if (mediaLibrary.length === 0) {
    console.log(`${RED}❌ ERRO: Nenhuma mídia encontrada para o usuário!${RESET}`);
    return;
  }
  
  console.log(`${GREEN}✅ ${mediaLibrary.length} mídias encontradas:${RESET}`);
  for (const m of mediaLibrary) {
    const typeEmoji = m.mediaType === 'image' ? '🖼️' : m.mediaType === 'audio' ? '🎵' : m.mediaType === 'video' ? '🎬' : '📄';
    console.log(`   ${typeEmoji} ${m.name} (${m.mediaType})`);
    console.log(`      Descrição: ${m.description || 'N/A'}`);
    console.log(`      Quando usar: ${m.whenToUse || 'N/A'}`);
    console.log(`      URL: ${m.storageUrl ? '✅ Configurada' : '❌ Faltando'}\n`);
  }
  
  // 2. Verificar prompt do agente
  console.log(`\n${YELLOW}[2] VERIFICANDO PROMPT DO AGENTE...${RESET}\n`);
  
  const basePrompt = await getAgentPrompt();
  
  if (!basePrompt) {
    console.log(`${RED}❌ ERRO: Nenhum prompt configurado para o agente!${RESET}`);
    return;
  }
  
  console.log(`${GREEN}✅ Prompt base: ${basePrompt.substring(0, 100)}...${RESET}`);
  
  // 3. Gerar prompt completo
  console.log(`\n${YELLOW}[3] GERANDO PROMPT COMPLETO COM MÍDIAS...${RESET}\n`);
  
  const mediaBlock = generateMediaPromptBlock(mediaLibrary);
  const fullPrompt = basePrompt + mediaBlock;
  
  console.log(`${CYAN}Bloco de mídias gerado (${mediaBlock.length} caracteres):${RESET}`);
  console.log(`${CYAN}${mediaBlock}${RESET}`);
  
  // 4. Testar com Mistral
  console.log(`\n${YELLOW}[4] TESTANDO COM MISTRAL API...${RESET}\n`);
  
  let passed = 0;
  let failed = 0;
  const failedTests: { name: string; message: string; expected: string; got: string; response: string }[] = [];
  
  for (const testCase of testCases) {
    try {
      const result = await testWithMistral(fullPrompt, testCase.message);
      
      let success = false;
      let details = '';
      
      if (testCase.expectedMediaType === 'none') {
        success = result.tags.length === 0;
        details = result.tags.length === 0 
          ? '✅ Corretamente não enviou mídia' 
          : `❌ Enviou mídia indevidamente: ${result.tags.join(', ')}`;
      } else {
        if (testCase.expectedMediaName) {
          success = result.tags.includes(testCase.expectedMediaName);
          details = success 
            ? `✅ Tag correta: ${testCase.expectedMediaName}` 
            : `❌ Esperava ${testCase.expectedMediaName}, recebeu: ${result.tags.join(', ') || 'nenhuma tag'}`;
        } else {
          success = result.tags.length > 0;
          details = success 
            ? `✅ Enviou mídia: ${result.tags.join(', ')}` 
            : '❌ Não enviou nenhuma mídia';
        }
      }
      
      const statusIcon = success ? `${GREEN}✅${RESET}` : `${RED}❌${RESET}`;
      console.log(`${statusIcon} ${testCase.name}: "${testCase.message}"`);
      console.log(`   ${details}`);
      console.log(`   📝 Resposta: "${result.text.substring(0, 80)}..."\n`);
      
      if (success) {
        passed++;
      } else {
        failed++;
        failedTests.push({
          name: testCase.name,
          message: testCase.message,
          expected: testCase.expectedMediaName || testCase.expectedMediaType,
          got: result.tags.join(', ') || 'nenhuma',
          response: result.text,
        });
      }
      
      // Pequeno delay entre requisições
      await new Promise(r => setTimeout(r, 500));
    } catch (error) {
      console.log(`${RED}❌ ${testCase.name}: ERRO - ${error}${RESET}\n`);
      failed++;
    }
  }
  
  // 5. Resumo
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
      console.log(`   Resposta completa: "${f.response}"`);
    }
  }
  
  if (parseFloat(rate) === 100) {
    console.log(`\n${GREEN}${BOLD}🎉 TODOS OS TESTES PASSARAM! O sistema está funcionando corretamente.${RESET}`);
  }
  
  process.exit(0);
}

runDiagnostic().catch(console.error);
