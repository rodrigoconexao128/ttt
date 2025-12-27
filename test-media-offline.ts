/**
 * Teste OFFLINE para verificar se o sistema de mídias está funcionando corretamente
 * NÃO PRECISA DE BANCO DE DADOS - usa dados mockados
 * 
 * Execute: npx tsx test-media-offline.ts
 */

// Mock de mídias como configuradas pelo usuário rodrigo4@gmail.com
const mockMedias = [
  {
    id: '1',
    userId: 'test',
    name: 'MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR',
    mediaType: 'audio' as const,
    description: 'Áudio de boas-vindas inicial',
    whenToUse: 'Na primeira mensagem quando o cliente chega para conversar',
    storageUrl: 'https://example.com/audio1.mp3',
    isActive: true,
    sendAlone: false,
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: '2',
    userId: 'test',
    name: 'COMO_FUNCIONA',
    mediaType: 'audio' as const,
    description: 'Explicação de como funciona a IA após o cliente dizer o que faz',
    whenToUse: 'Quando o cliente responder se trabalha com vendas, atendimento ou qualificação ou qualquer resposta dizendo que ele precisa para algo enviar isto',
    storageUrl: 'https://example.com/audio2.mp3',
    isActive: true,
    sendAlone: false,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

// Prompt do Rodrigo (similar ao que está configurado)
const RODRIGO_PROMPT = `# AGENTE RODRIGO - AgenteZap

## IDENTIDADE

Você é Rodrigo, atendente virtual da AgenteZap. Somos uma IA de atendimento humanizado para WhatsApp (SaaS).

## TOM DE CONVERSA

- Humano, natural, profissional
- Frases curtas, linguagem simples
- Usa "né?", "tá?", "entendeu?" naturalmente
- Tom de ajuda, não de venda

---

## 🎤 REGRA DE MÍDIAS (OBRIGATÓRIO)

### PRIMEIRA MENSAGEM (cliente manda qualquer coisa):

SEMPRE envie:
1. Texto de abertura + {{nome}} se tiver
2. Mídia: [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]

Modelo de texto:
"Oi {{nome}}, tudo bem? Rodrigo aqui da AgenteZap.
Nós somos uma inteligência artificial que responde clientes no WhatsApp, um SaaS.
Me conta: hoje você trabalha com o quê? Atender clientes, vender, ou qualificar leads?"

### SEGUNDA MENSAGEM (cliente responde para que precisa):

Quando cliente disser que trabalha com vendas, atendimento, suporte, leads, etc:
1. Responda com texto explicativo
2. Mídia: [MEDIA:COMO_FUNCIONA]

Modelo de texto:
"Perfeito, {{nome}}!
A AgenteZap funciona como um atendente seu.
Você passa todas as informações da empresa e ela atende igual você.
É como ter um funcionário treinado 24h."

---

## PROIBIÇÕES

- Nunca repetir áudio já enviado na mesma conversa
- Nunca parecer robô
- Nunca pressionar cliente
- Nunca usar termos técnicos (GPT, LLM, etc)
- NUNCA incluir o texto "[ÁUDIO ENVIADO PELO AGENTE]" na resposta
- NUNCA mencionar que está enviando áudio no texto

---

## ASSINATURA (OBRIGATÓRIO)

O FOCO É ASSINAR. NÃO sugerir reunião.`;

// Função que gera o bloco de mídias (copiada do mediaService.ts)
function generateMediaPromptBlock(mediaList: typeof mockMedias): string {
  if (!mediaList || mediaList.length === 0) {
    return '';
  }

  const allMediaNames = mediaList.map(m => m.name).join(', ');

  let mediaBlock = `

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE ENVIO DE MÍDIAS - INSTRUÇÕES OBRIGATÓRIAS
═══════════════════════════════════════════════════════════════════════════════

Você tem as seguintes mídias disponíveis para enviar: ${allMediaNames}

`;

  const audioMidias = mediaList.filter(m => m.mediaType === 'audio');
  
  if (audioMidias.length > 0) {
    mediaBlock += `🎵 ÁUDIOS DISPONÍVEIS:
`;
    for (const m of audioMidias) {
      mediaBlock += `   • ${m.name} - ${m.description || 'Áudio'}
     Enviar quando: ${m.whenToUse || 'cliente pedir áudio, explicação por voz'}
`;
    }
    mediaBlock += '\n';
  }

  mediaBlock += `
═══════════════════════════════════════════════════════════════════════════════
⚠️ REGRA CRÍTICA: COMO ENVIAR MÍDIA (OBRIGATÓRIO)
═══════════════════════════════════════════════════════════════════════════════

Quando a situação corresponder ao "Enviar quando" de uma mídia:
1. Responder normalmente com texto
2. ADICIONAR A TAG NO FINAL: [MEDIA:NOME_DA_MIDIA]

✅ EXEMPLOS CORRETOS:

CLIENTE: "Oi, tudo bem?"
VOCÊ: "Oi! Tudo bem? Rodrigo aqui da AgenteZap. Nós somos uma IA que atende clientes no WhatsApp. Me conta: hoje você trabalha com o quê? [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]"

CLIENTE: "Trabalho com vendas"
VOCÊ: "Perfeito! A AgenteZap funciona como um atendente seu. Você passa as informações e ela atende igual você. [MEDIA:COMO_FUNCIONA]"

⚠️ IMPORTANTE: 
- Use EXATAMENTE o nome da mídia listado acima na tag [MEDIA:...]
- NUNCA escreva "[ÁUDIO ENVIADO PELO AGENTE]" no texto
- NUNCA mencione que está enviando um áudio
- Apenas coloque a tag [MEDIA:...] no final e deixe o sistema enviar automaticamente

═══════════════════════════════════════════════════════════════════════════════
❌ ERROS A EVITAR:
═══════════════════════════════════════════════════════════════════════════════
- ❌ "Vou te enviar um áudio explicando [MEDIA:...]" 
- ❌ "[ÁUDIO ENVIADO PELO AGENTE]: blablabla"
- ❌ "Segue o áudio..."

✅ CORRETO:
- ✅ "Perfeito! A AgenteZap funciona como um atendente seu. [MEDIA:COMO_FUNCIONA]"
(O áudio será enviado automaticamente, você não precisa mencionar)

════════════════════════════════════════════════════════════════════════════════
`;

  return mediaBlock;
}

// Função que parseia tags de mídia (copiada do mediaService.ts)
function parseMistralResponse(responseText: string) {
  const mediaTagRegex = /\[MEDIA:([A-Z0-9_]+)\]/gi;
  
  const actions: { type: 'send_media'; media_name: string }[] = [];
  let match: RegExpExecArray | null;
  
  while ((match = mediaTagRegex.exec(responseText)) !== null) {
    const mediaName = match[1].toUpperCase();
    actions.push({
      type: 'send_media',
      media_name: mediaName,
    });
  }
  
  const cleanText = responseText.replace(/\[MEDIA:[A-Z0-9_]+\]/gi, '').trim();
  
  return {
    messages: [{ type: "text", content: cleanText }],
    actions,
  };
}

// Simular chamada à IA (mock)
async function mockMistralCall(prompt: string, userMessage: string): Promise<string> {
  // Simular o que a IA deveria responder baseado no cenário
  
  if (userMessage.toLowerCase().match(/^(oi|olá|ola|e ai|boa tarde|bom dia|boa noite).*$/)) {
    return `Oi! Tudo bem? Rodrigo aqui da AgenteZap. Nós somos uma inteligência artificial que responde clientes no WhatsApp, um SaaS. Me conta: hoje você trabalha com o quê? Atender clientes, vender, ou qualificar leads? [MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]`;
  }
  
  if (userMessage.toLowerCase().match(/(vend|atend|qualific|lead|suporte|cliente)/)) {
    return `Perfeito! A AgenteZap funciona como um atendente seu. Você passa todas as informações da empresa e ela atende igual você. É como ter um funcionário treinado 24h. [MEDIA:COMO_FUNCIONA]`;
  }
  
  return `Entendi! Como posso te ajudar?`;
}

// CORES PARA TERMINAL
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
  blue: '\x1b[34m',
};

async function runTests() {
  console.log(`\n${COLORS.cyan}╔══════════════════════════════════════════════════════════════╗`);
  console.log(`║     TESTE OFFLINE DE MÍDIAS - Sistema AgenteZap              ║`);
  console.log(`╚══════════════════════════════════════════════════════════════╝${COLORS.reset}\n`);

  // 1. Mostrar mídias configuradas
  console.log(`${COLORS.yellow}📋 1. Mídias configuradas (mock):${COLORS.reset}`);
  for (const media of mockMedias) {
    console.log(`\n   🎤 ${COLORS.cyan}${media.name}${COLORS.reset}`);
    console.log(`      Descrição: ${media.description}`);
    console.log(`      ${COLORS.magenta}Quando usar: ${media.whenToUse}${COLORS.reset}`);
  }

  // 2. Gerar bloco de mídia
  console.log(`\n${COLORS.yellow}📋 2. Bloco de mídia gerado para o prompt:${COLORS.reset}`);
  const mediaBlock = generateMediaPromptBlock(mockMedias);
  console.log(`${COLORS.blue}${mediaBlock}${COLORS.reset}`);

  // 3. Testar cenários
  console.log(`${COLORS.yellow}📋 3. Testando cenários de conversa:${COLORS.reset}\n`);

  const testCases = [
    { 
      message: "Oi, tudo bem?", 
      expectedMedia: "MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR",
      scenario: "Primeira mensagem do cliente"
    },
    { 
      message: "Vender", 
      expectedMedia: "COMO_FUNCIONA",
      scenario: "Cliente responde que trabalha com vendas"
    },
    { 
      message: "Trabalho com atendimento ao cliente", 
      expectedMedia: "COMO_FUNCIONA",
      scenario: "Cliente responde que trabalha com atendimento"
    },
    { 
      message: "Qual o preço?", 
      expectedMedia: null,
      scenario: "Cliente pergunta preço (não precisa mídia)"
    },
  ];

  let passed = 0;
  let failed = 0;

  for (const tc of testCases) {
    console.log(`${COLORS.cyan}┌─────────────────────────────────────────────────────────────${COLORS.reset}`);
    console.log(`${COLORS.cyan}│ Cenário: ${tc.scenario}${COLORS.reset}`);
    console.log(`${COLORS.cyan}│ Mensagem: "${tc.message}"${COLORS.reset}`);
    console.log(`${COLORS.cyan}│ Mídia esperada: ${tc.expectedMedia || 'Nenhuma'}${COLORS.reset}`);
    
    const fullPrompt = RODRIGO_PROMPT + '\n' + mediaBlock;
    const response = await mockMistralCall(fullPrompt, tc.message);
    
    const parsed = parseMistralResponse(response);
    const detectedMedia = parsed.actions.length > 0 ? parsed.actions[0].media_name : null;
    
    console.log(`${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│ Resposta da IA:${COLORS.reset}`);
    console.log(`${COLORS.cyan}│${COLORS.reset} "${parsed.messages[0].content}"`);
    console.log(`${COLORS.cyan}│${COLORS.reset}`);
    console.log(`${COLORS.cyan}│ Mídia detectada: ${detectedMedia || 'Nenhuma'}${COLORS.reset}`);

    // Verificar problemas
    const hasAudioEnviado = response.includes('[ÁUDIO ENVIADO') || response.includes('ÁUDIO ENVIADO');
    
    if (hasAudioEnviado) {
      console.log(`${COLORS.cyan}│${COLORS.reset}`);
      console.log(`${COLORS.cyan}│ ${COLORS.red}⚠️ PROBLEMA: Texto "[ÁUDIO ENVIADO...]" apareceu!${COLORS.reset}`);
      failed++;
    } else if (tc.expectedMedia && detectedMedia === tc.expectedMedia) {
      console.log(`${COLORS.cyan}│ ${COLORS.green}✅ PASSOU: Mídia correta detectada${COLORS.reset}`);
      passed++;
    } else if (!tc.expectedMedia && !detectedMedia) {
      console.log(`${COLORS.cyan}│ ${COLORS.green}✅ PASSOU: Corretamente sem mídia${COLORS.reset}`);
      passed++;
    } else if (tc.expectedMedia && !detectedMedia) {
      console.log(`${COLORS.cyan}│ ${COLORS.red}❌ FALHOU: Mídia esperada mas não detectada${COLORS.reset}`);
      failed++;
    } else {
      console.log(`${COLORS.cyan}│ ${COLORS.yellow}⚠️ Mídia diferente da esperada${COLORS.reset}`);
    }

    console.log(`${COLORS.cyan}└─────────────────────────────────────────────────────────────${COLORS.reset}\n`);
  }

  // 4. Resumo
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.green}                    RESUMO DOS TESTES${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`   Passou: ${COLORS.green}${passed}${COLORS.reset}`);
  console.log(`   Falhou: ${COLORS.red}${failed}${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);

  // 5. Verificar formato do prompt original
  console.log(`${COLORS.yellow}📋 4. Análise do problema identificado:${COLORS.reset}\n`);
  
  const originalPromptFragment = `
## 🎤 REGRA DE MÍDIAS (OBRIGATÓRIO)

### PRIMEIRA MENSAGEM (cliente manda qualquer coisa):

SEMPRE envie:
1. Texto de abertura + {{nome}} se tiver
2. Mídia: [SEND_MEDIA:MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR]
`;

  console.log(`   ${COLORS.red}❌ PROBLEMA ENCONTRADO:${COLORS.reset}`);
  console.log(`   O prompt original usa a tag [SEND_MEDIA:...] mas o sistema espera [MEDIA:...]`);
  console.log(`\n   ${COLORS.yellow}💡 SOLUÇÃO:${COLORS.reset}`);
  console.log(`   Alterar no prompt de:`);
  console.log(`   ${COLORS.red}[SEND_MEDIA:MENSAGEM_DE_INICIO...]${COLORS.reset}`);
  console.log(`   Para:`);
  console.log(`   ${COLORS.green}[MEDIA:MENSAGEM_DE_INICIO...]${COLORS.reset}`);
  
  console.log(`\n   ${COLORS.cyan}📝 Adicionalmente, garantir que o "whenToUse" das mídias esteja bem configurado:${COLORS.reset}`);
  console.log(`   - MENSAGEM_DE_INICIO...: "Na primeira mensagem quando o cliente chega"`);
  console.log(`   - COMO_FUNCIONA: "Quando o cliente responder se trabalha com vendas/atendimento/qualificação"`);

  console.log(`\n${COLORS.green}═══════════════════════════════════════════════════════════════`);
  console.log(`                        TESTE CONCLUÍDO!`);
  console.log(`═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);
}

runTests().catch(console.error);
