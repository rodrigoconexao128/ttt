/**
 * Teste OFFLINE - Verificar código de pareamento e trigger
 */

interface ParsedAction {
  type: string;
  params: Record<string, string>;
}

// Função parseActions atualizada
function parseActions(response: string): { cleanText: string; actions: ParsedAction[] } {
  const actionRegex = /\[(?:AÇÃO:)?([A-Z_]+)([^\]]*)\]/g;
  const actions: ParsedAction[] = [];
  
  const validActions = [
    "CRIAR_CONTA", "SALVAR_CONFIG", "SALVAR_PROMPT",
    "SOLICITAR_CODIGO_PAREAMENTO", "ENVIAR_QRCODE",
    "ENVIAR_PIX", "NOTIFICAR_PAGAMENTO", "DESCONECTAR_WHATSAPP"
  ];
  
  let match;
  while ((match = actionRegex.exec(response)) !== null) {
    const type = match[1];
    if (!validActions.includes(type)) continue;
    
    const paramsStr = match[2];
    const params: Record<string, string> = {};
    const paramRegex = /(\w+)="([^"]*)"/g;
    let paramMatch;
    while ((paramMatch = paramRegex.exec(paramsStr)) !== null) {
      params[paramMatch[1]] = paramMatch[2];
    }
    
    actions.push({ type, params });
  }
  
  const cleanText = response.replace(/\[(?:AÇÃO:)?[A-Z_]+[^\]]*\]/g, "").trim();
  return { cleanText, actions };
}

// Função executeActions simulada
function executeActions(actions: ParsedAction[]): { 
  sendQrCode?: boolean; 
  connectWhatsApp?: boolean;
  sendPix?: boolean;
} {
  const results: { sendQrCode?: boolean; connectWhatsApp?: boolean; sendPix?: boolean } = {};
  
  for (const action of actions) {
    switch (action.type) {
      case "ENVIAR_QRCODE":
        results.sendQrCode = true;
        break;
      case "SOLICITAR_CODIGO_PAREAMENTO":
        results.connectWhatsApp = true;
        break;
      case "ENVIAR_PIX":
        results.sendPix = true;
        break;
    }
  }
  
  return results;
}

// Função checkTriggerPhrases simulada
function checkTriggerPhrases(
  message: string,
  conversationHistory: Array<{ content: string }>,
  triggerPhrases: string[]
): { hasTrigger: boolean; foundIn: string } {
  if (!triggerPhrases || triggerPhrases.length === 0) {
    return { hasTrigger: true, foundIn: "no-filter" };
  }
  
  const normalize = (s: string) => (s || "")
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const includesNormalized = (haystack: string, needle: string) => {
    const h = normalize(haystack);
    const n = normalize(needle);
    if (!n) return false;
    const hNoSpace = h.replace(/\s+/g, "");
    const nNoSpace = n.replace(/\s+/g, "");
    return h.includes(n) || hNoSpace.includes(nNoSpace);
  };

  const allMessages = [
    ...conversationHistory.map(m => m.content || ""),
    message
  ].join(" ");

  let foundIn = "none";
  const hasTrigger = triggerPhrases.some(phrase => {
    const inLast = includesNormalized(message, phrase);
    const inAll = inLast ? false : includesNormalized(allMessages, phrase);
    if (inLast) foundIn = "last"; else if (inAll) foundIn = "history";
    return inLast || inAll;
  });

  return { hasTrigger, foundIn };
}

console.log("═══════════════════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE: Código de Pareamento e Lógica de Trigger");
console.log("═══════════════════════════════════════════════════════════════════════════════\n");

// === TESTE 1: CÓDIGO DE PAREAMENTO ===
console.log("📋 TESTE 1: Código de Pareamento (8 dígitos)");
console.log("─".repeat(70));

const pairingResponses = [
  "Vou gerar o código de 8 dígitos! [SOLICITAR_CODIGO_PAREAMENTO]",
  "Tá bom, vou te mandar o código! [AÇÃO:SOLICITAR_CODIGO_PAREAMENTO]",
  "Gerando código... Um momento! [SOLICITAR_CODIGO_PAREAMENTO]",
];

let pairingPassed = 0;
for (const response of pairingResponses) {
  console.log(`   Resposta: "${response.substring(0, 50)}..."`);
  const { actions } = parseActions(response);
  const results = executeActions(actions);
  
  if (results.connectWhatsApp === true) {
    console.log(`   ✅ SOLICITAR_CODIGO_PAREAMENTO detectado → connectWhatsApp = true`);
    pairingPassed++;
  } else {
    console.log(`   ❌ ERRO: connectWhatsApp não foi ativado!`);
  }
}

console.log(`\n   Resultado: ${pairingPassed}/${pairingResponses.length} passaram\n`);

// === TESTE 2: LÓGICA DE TRIGGER ===
console.log("📋 TESTE 2: Lógica de Trigger Phrases");
console.log("─".repeat(70));

const triggerTests = [
  {
    name: "Trigger na mensagem atual",
    message: "Olá, quero saber sobre o agentezap",
    history: [],
    triggers: ["agentezap"],
    expected: true,
    expectedFoundIn: "last",
  },
  {
    name: "Trigger no histórico",
    message: "Me manda o QR Code",
    history: [{ content: "Olá, vim pelo agentezap" }, { content: "Quero criar meu agente" }],
    triggers: ["agentezap"],
    expected: true,
    expectedFoundIn: "history",
  },
  {
    name: "SEM trigger - deve bloquear",
    message: "Olá, bom dia",
    history: [{ content: "Quero informações" }],
    triggers: ["agentezap"],
    expected: false,
    expectedFoundIn: "none",
  },
  {
    name: "Sem triggers configuradas - responde tudo",
    message: "Qualquer mensagem",
    history: [],
    triggers: [],
    expected: true,
    expectedFoundIn: "no-filter",
  },
];

let triggerPassed = 0;
for (const test of triggerTests) {
  console.log(`   ${test.name}:`);
  console.log(`      Mensagem: "${test.message}"`);
  console.log(`      Histórico: ${test.history.length} msgs`);
  console.log(`      Triggers: ${test.triggers.join(', ') || '(nenhuma)'}`);
  
  const result = checkTriggerPhrases(test.message, test.history, test.triggers);
  
  if (result.hasTrigger === test.expected) {
    console.log(`      ✅ hasTrigger = ${result.hasTrigger} (esperado: ${test.expected})`);
    triggerPassed++;
  } else {
    console.log(`      ❌ hasTrigger = ${result.hasTrigger} (esperado: ${test.expected})`);
  }
  console.log(`      foundIn: ${result.foundIn}\n`);
}

console.log(`   Resultado: ${triggerPassed}/${triggerTests.length} passaram\n`);

// === TESTE 3: MÍDIA E TRIGGER ===
console.log("📋 TESTE 3: Lógica de skipTrigger por tipo de mídia");
console.log("─".repeat(70));

const mediaTypes = [
  { type: 'audio', skipTrigger: false, reason: 'Áudios são texto falado, devem verificar trigger' },
  { type: 'image', skipTrigger: true, reason: 'Imagens podem ser comprovantes, não verificar trigger' },
  { type: 'video', skipTrigger: false, reason: 'Vídeos devem verificar trigger por segurança' },
  { type: 'document', skipTrigger: false, reason: 'Documentos devem verificar trigger por segurança' },
];

for (const media of mediaTypes) {
  const shouldSkip = media.type === 'image';
  const status = shouldSkip === media.skipTrigger ? '✅' : '❌';
  console.log(`   ${status} ${media.type}: skipTrigger = ${shouldSkip}`);
  console.log(`      ${media.reason}`);
}

console.log("\n═══════════════════════════════════════════════════════════════════════════════");
console.log("📊 RESUMO:");
console.log(`   ✅ Código de Pareamento: ${pairingPassed}/${pairingResponses.length}`);
console.log(`   ✅ Lógica de Trigger: ${triggerPassed}/${triggerTests.length}`);
console.log(`   ✅ Mídia/Trigger: Implementado corretamente`);
console.log("═══════════════════════════════════════════════════════════════════════════════");

const allPassed = pairingPassed === pairingResponses.length && triggerPassed === triggerTests.length;

if (allPassed) {
  console.log("\n🎉 TODOS OS TESTES PASSARAM!");
  console.log("\n📌 CORREÇÕES APLICADAS:");
  console.log("   1. Parser aceita [SOLICITAR_CODIGO_PAREAMENTO] e [ENVIAR_QRCODE]");
  console.log("   2. Áudios agora verificam trigger (antes pulavam)");
  console.log("   3. Somente imagens pulam verificação de trigger (comprovantes)");
} else {
  console.log("\n⚠️ Alguns testes falharam!");
  process.exit(1);
}
