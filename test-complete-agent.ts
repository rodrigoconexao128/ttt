/**
 * TESTE COMPLETO DO AGENTE IA
 * 
 * Simula várias conversas reais para verificar:
 * 1. Mídias são enviadas corretamente com [MEDIA:NOME]
 * 2. Não há vazamento de texto do prompt
 * 3. Não aparece [ÁUDIO ENVIADO PELO AGENTE]
 * 4. Não aparece "🎤 Áudio" no início
 * 5. Respostas não são truncadas incorretamente
 * 
 * Execute: npx tsx test-complete-agent.ts
 */

import { db } from "./server/db";
import { users, aiAgentConfig, agentMediaLibrary, messages, conversations, whatsappConnections } from "./shared/schema";
import { eq, desc } from "drizzle-orm";
import { generateMediaPromptBlock, parseMistralResponse } from "./server/mediaService";
import { getMistralClient } from "./server/mistralClient";

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

interface TestResult {
  scenario: string;
  passed: boolean;
  issues: string[];
  response: string;
  mediaDetected: string[];
}

// Padrões problemáticos que NÃO devem aparecer na resposta
const FORBIDDEN_PATTERNS = [
  { pattern: /🎤\s*[ÁáAa]udio/i, name: "🎤 Áudio no início" },
  { pattern: /\[ÁUDIO ENVIADO PELO AGENTE\]/i, name: "[ÁUDIO ENVIADO PELO AGENTE]" },
  { pattern: /online\/cadastro\)/i, name: "Vazamento 'online/cadastro)'" },
  { pattern: /Depois de logado, no menu do lado esquerdo/i, name: "Vazamento de instruções do prompt" },
  { pattern: /clica em \*?Ilimitado\*? e faz o pagamento/i, name: "Vazamento de instruções literais" },
  { pattern: /\[SEND_MEDIA:/i, name: "Tag errada [SEND_MEDIA:]" },
  { pattern: /\[IMAGEM ENVIADA:/i, name: "[IMAGEM ENVIADA:]" },
  { pattern: /\[VÍDEO ENVIADO:/i, name: "[VÍDEO ENVIADO:]" },
  { pattern: /Modelo de texto:/i, name: "Vazamento 'Modelo de texto:'" },
  { pattern: /^#{1,3}\s+/m, name: "Headers markdown (##)" },
];

// Cenários de teste - simulando conversas reais
const TEST_SCENARIOS = [
  {
    name: "Primeira mensagem - cliente diz 'Oi'",
    messages: [],
    newMessage: "Oi",
    expectMedia: true,
    expectedMediaName: "MENSAGEM_DE_INICIO",
  },
  {
    name: "Primeira mensagem - cliente diz 'Olá, tudo bem?'",
    messages: [],
    newMessage: "Olá, tudo bem?",
    expectMedia: true,
    expectedMediaName: "MENSAGEM_DE_INICIO",
  },
  {
    name: "Segunda mensagem - cliente diz 'vender'",
    messages: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Tudo bem? Me conta: o que você faz hoje?" },
    ],
    newMessage: "vender",
    expectMedia: true,
    expectedMediaName: "COMO_FUNCIONA",
  },
  {
    name: "Segunda mensagem - cliente diz 'trabalho com atendimento'",
    messages: [
      { fromMe: false, text: "Olá" },
      { fromMe: true, text: "Oi! Me conta: você trabalha com o quê hoje?" },
    ],
    newMessage: "trabalho com atendimento ao cliente",
    expectMedia: true,
    expectedMediaName: "COMO_FUNCIONA",
  },
  {
    name: "Cliente pergunta o preço",
    messages: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Tudo bem?" },
      { fromMe: false, text: "Quanto custa?" },
    ],
    newMessage: "Qual o valor?",
    expectMedia: false,
    expectedMediaName: null,
  },
  {
    name: "Cliente pergunta como funciona (sem mídia - já tem contexto)",
    messages: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! Sou Rodrigo da AgenteZap. [MEDIA:MENSAGEM_DE_INICIO...]" },
      { fromMe: false, text: "Legal, trabalho com vendas" },
      { fromMe: true, text: "Perfeito! A AgenteZap funciona como um atendente. [MEDIA:COMO_FUNCIONA]" },
    ],
    newMessage: "Como faço pra assinar?",
    expectMedia: false,
    expectedMediaName: null,
  },
  {
    name: "Cliente com histórico de áudio - não deve repetir",
    messages: [
      { fromMe: false, text: "Oi" },
      { fromMe: true, text: "Oi! [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]" },
      { fromMe: true, text: "[Áudio enviado]", mediaType: "audio" },
    ],
    newMessage: "Entendi, trabalho com vendas",
    expectMedia: true,
    expectedMediaName: "COMO_FUNCIONA",
  },
];

async function runTest(
  mistral: any,
  agentConfig: any,
  mediaBlock: string,
  scenario: typeof TEST_SCENARIOS[0],
  contactName: string = "Cliente Teste"
): Promise<TestResult> {
  const issues: string[] = [];
  
  // Construir histórico de mensagens
  const conversationHistory = scenario.messages.map((msg, i) => ({
    role: msg.fromMe ? "assistant" : "user",
    content: msg.text,
  }));

  // Construir prompt completo
  const systemPrompt = agentConfig.prompt + '\n\n' + mediaBlock;

  // Adicionar contexto dinâmico
  const dynamicContext = `
📋 INFORMAÇÕES DO CLIENTE:
- Nome: ${contactName}
- Horário: ${new Date().toLocaleTimeString('pt-BR')}
`;

  try {
    const response = await mistral.chat.complete({
      model: agentConfig.model || 'mistral-small-latest',
      messages: [
        { role: 'system', content: systemPrompt + dynamicContext },
        ...conversationHistory,
        { role: 'user', content: scenario.newMessage }
      ],
      temperature: 0.7,
      maxTokens: 800,
    });

    const responseText = response.choices?.[0]?.message?.content || '';
    
    // Verificar padrões proibidos
    for (const forbidden of FORBIDDEN_PATTERNS) {
      if (forbidden.pattern.test(responseText)) {
        issues.push(`❌ ${forbidden.name}`);
      }
    }

    // Verificar se resposta está truncada (termina com "..." no meio de frase)
    if (responseText.match(/\.\.\.\s*$/) && responseText.length < 200) {
      issues.push("❌ Resposta parece truncada");
    }

    // Verificar mídia
    const parsed = parseMistralResponse(responseText);
    const mediaActions = parsed?.actions || [];
    const detectedMediaNames = mediaActions.map(a => a.media_name);

    if (scenario.expectMedia && mediaActions.length === 0) {
      issues.push("❌ Mídia esperada mas não encontrada");
    }

    if (scenario.expectedMediaName && !detectedMediaNames.some(m => m.includes(scenario.expectedMediaName!))) {
      if (mediaActions.length > 0) {
        issues.push(`⚠️ Mídia diferente: esperado ${scenario.expectedMediaName}, recebido ${detectedMediaNames.join(', ')}`);
      }
    }

    // Verificar se resposta é muito curta
    const cleanResponse = responseText.replace(/\[MEDIA:[^\]]+\]/g, '').trim();
    if (cleanResponse.length < 20) {
      issues.push("⚠️ Resposta muito curta");
    }

    return {
      scenario: scenario.name,
      passed: issues.length === 0,
      issues,
      response: responseText.substring(0, 300) + (responseText.length > 300 ? '...' : ''),
      mediaDetected: detectedMediaNames,
    };

  } catch (error: any) {
    return {
      scenario: scenario.name,
      passed: false,
      issues: [`❌ Erro: ${error.message}`],
      response: '',
      mediaDetected: [],
    };
  }
}

async function main() {
  console.log(`\n${COLORS.cyan}${COLORS.bold}╔══════════════════════════════════════════════════════════════════╗`);
  console.log(`║       TESTE COMPLETO DO AGENTE IA - AgenteZap                    ║`);
  console.log(`╚══════════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  try {
    // 1. Buscar usuário rodrigo4@gmail.com
    console.log(`${COLORS.yellow}📋 1. Buscando configurações do agente...${COLORS.reset}`);
    
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, 'rodrigo4@gmail.com'))
      .limit(1);

    if (!user) {
      console.log(`${COLORS.red}❌ Usuário rodrigo4@gmail.com não encontrado!${COLORS.reset}`);
      process.exit(1);
    }

    // 2. Buscar config do agente
    const [agentConfig] = await db
      .select()
      .from(aiAgentConfig)
      .where(eq(aiAgentConfig.userId, user.id))
      .limit(1);

    if (!agentConfig) {
      console.log(`${COLORS.red}❌ Agente não configurado!${COLORS.reset}`);
      process.exit(1);
    }

    console.log(`${COLORS.green}✅ Agente encontrado: ${agentConfig.model}${COLORS.reset}`);
    console.log(`   Prompt: ${agentConfig.prompt?.substring(0, 100)}...`);

    // 3. Buscar mídias
    const medias = await db
      .select()
      .from(agentMediaLibrary)
      .where(eq(agentMediaLibrary.userId, user.id));

    console.log(`${COLORS.green}✅ ${medias.length} mídias encontradas${COLORS.reset}`);
    for (const m of medias) {
      console.log(`   - ${m.name} (${m.mediaType})`);
    }

    // 4. Gerar bloco de mídia
    const mediaBlock = generateMediaPromptBlock(medias);
    console.log(`${COLORS.green}✅ Bloco de mídia gerado (${mediaBlock.length} chars)${COLORS.reset}\n`);

    // 5. Verificar prompt
    console.log(`${COLORS.yellow}📋 2. Verificando prompt...${COLORS.reset}`);
    
    const promptIssues: string[] = [];
    if (agentConfig.prompt?.includes('[SEND_MEDIA:')) {
      promptIssues.push("❌ Usa [SEND_MEDIA:] ao invés de [MEDIA:]");
    }
    if (!agentConfig.prompt?.includes('[MEDIA:')) {
      promptIssues.push("⚠️ Não tem exemplos de [MEDIA:]");
    }
    
    if (promptIssues.length === 0) {
      console.log(`${COLORS.green}✅ Prompt OK${COLORS.reset}\n`);
    } else {
      for (const issue of promptIssues) {
        console.log(`   ${COLORS.red}${issue}${COLORS.reset}`);
      }
      console.log('');
    }

    // 6. Executar testes
    console.log(`${COLORS.yellow}📋 3. Executando ${TEST_SCENARIOS.length} cenários de teste...${COLORS.reset}\n`);
    
    const mistral = await getMistralClient();
    const results: TestResult[] = [];

    for (let i = 0; i < TEST_SCENARIOS.length; i++) {
      const scenario = TEST_SCENARIOS[i];
      console.log(`${COLORS.cyan}┌─ Teste ${i + 1}/${TEST_SCENARIOS.length}: ${scenario.name}${COLORS.reset}`);
      console.log(`${COLORS.cyan}│  Mensagem: "${scenario.newMessage}"${COLORS.reset}`);
      
      const result = await runTest(mistral, agentConfig, mediaBlock, scenario);
      results.push(result);

      if (result.passed) {
        console.log(`${COLORS.cyan}│  ${COLORS.green}✅ PASSOU${COLORS.reset}`);
      } else {
        console.log(`${COLORS.cyan}│  ${COLORS.red}❌ FALHOU${COLORS.reset}`);
        for (const issue of result.issues) {
          console.log(`${COLORS.cyan}│  ${COLORS.red}   ${issue}${COLORS.reset}`);
        }
      }

      console.log(`${COLORS.cyan}│  Resposta: ${result.response.substring(0, 150)}...${COLORS.reset}`);
      
      if (result.mediaDetected.length > 0) {
        console.log(`${COLORS.cyan}│  ${COLORS.magenta}📁 Mídia: ${result.mediaDetected.join(', ')}${COLORS.reset}`);
      }

      console.log(`${COLORS.cyan}└─────────────────────────────────────────────────────${COLORS.reset}\n`);

      // Delay entre testes para não exceder rate limit
      await new Promise(r => setTimeout(r, 1500));
    }

    // 7. Resumo
    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\n${COLORS.cyan}${COLORS.bold}═══════════════════════════════════════════════════════════════════`);
    console.log(`                         RESUMO DOS TESTES`);
    console.log(`═══════════════════════════════════════════════════════════════════${COLORS.reset}`);
    console.log(`   ${COLORS.green}✅ Passou: ${passed}${COLORS.reset}`);
    console.log(`   ${COLORS.red}❌ Falhou: ${failed}${COLORS.reset}`);
    console.log(`   Total: ${results.length}`);
    console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════════${COLORS.reset}\n`);

    if (failed > 0) {
      console.log(`${COLORS.yellow}📋 Testes que falharam:${COLORS.reset}`);
      for (const r of results.filter(r => !r.passed)) {
        console.log(`   - ${r.scenario}`);
        for (const issue of r.issues) {
          console.log(`     ${issue}`);
        }
      }
      console.log('');
    }

    // 8. Verificar últimas mensagens reais do banco
    console.log(`${COLORS.yellow}📋 4. Verificando últimas mensagens reais do banco...${COLORS.reset}`);
    
    const [connection] = await db
      .select()
      .from(whatsappConnections)
      .where(eq(whatsappConnections.userId, user.id))
      .limit(1);

    if (connection) {
      const recentConvs = await db
        .select()
        .from(conversations)
        .where(eq(conversations.connectionId, connection.id))
        .orderBy(desc(conversations.lastMessageTime))
        .limit(3);

      for (const conv of recentConvs) {
        const recentMsgs = await db
          .select()
          .from(messages)
          .where(eq(messages.conversationId, conv.id))
          .orderBy(desc(messages.createdAt))
          .limit(5);

        console.log(`\n   📱 Conversa: ${conv.contactName || conv.contactNumber}`);
        for (const msg of recentMsgs.reverse()) {
          const prefix = msg.fromMe ? (msg.isFromAgent ? '🤖' : '👤') : '💬';
          const text = (msg.text || '').substring(0, 80);
          
          // Verificar problemas
          let hasIssue = false;
          for (const forbidden of FORBIDDEN_PATTERNS) {
            if (forbidden.pattern.test(msg.text || '')) {
              hasIssue = true;
              break;
            }
          }
          
          const color = hasIssue ? COLORS.red : COLORS.white;
          console.log(`      ${prefix} ${color}${text}${text.length >= 80 ? '...' : ''}${COLORS.reset}`);
        }
      }
    }

    console.log(`\n${COLORS.green}${COLORS.bold}═══════════════════════════════════════════════════════════════════`);
    console.log(`                        TESTE CONCLUÍDO!`);
    console.log(`═══════════════════════════════════════════════════════════════════${COLORS.reset}\n`);

    process.exit(failed > 0 ? 1 : 0);

  } catch (error) {
    console.error(`${COLORS.red}❌ Erro geral: ${error}${COLORS.reset}`);
    process.exit(1);
  }
}

main();
