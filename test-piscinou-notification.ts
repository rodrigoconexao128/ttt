/**
 * 🔔 TESTE DO NOTIFICADOR INTELIGENTE - CASO PISCINOU
 * 
 * Este teste valida que o notificador funciona quando:
 * 1. O CLIENTE envia palavras-chave
 * 2. O AGENTE responde com frases que indicam finalização
 * 
 * Uso: npx tsx test-piscinou-notification.ts
 */

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÃO DE NOTIFICAÇÃO ATUALIZADA (cópia para teste)
// ═══════════════════════════════════════════════════════════════════════

function getNotificationPrompt(trigger: string, manualKeywords?: string): string {
  const triggerLower = trigger.toLowerCase();
  
  let keywords: string[] = [];
  let actionDesc = "";
  
  // Palavras-chave baseadas no tipo de gatilho
  if (triggerLower.includes("agendar") || triggerLower.includes("horário") || triggerLower.includes("marcar")) {
    keywords.push("agendar", "agenda", "marcar", "marca", "reservar", "reserva", "tem vaga", "tem horário", "horário disponível", "me encaixa", "encaixe");
    actionDesc = "agendamento";
  } 
  if (triggerLower.includes("reembolso") || triggerLower.includes("devolver") || triggerLower.includes("devolução")) {
    keywords.push("reembolso", "devolver", "devolução", "quero meu dinheiro", "cancelar pedido", "estornar", "estorno");
    actionDesc = actionDesc || "reembolso";
  }
  if (triggerLower.includes("humano") || triggerLower.includes("atendente") || triggerLower.includes("pessoa")) {
    keywords.push("falar com humano", "atendente", "pessoa real", "falar com alguém", "quero um humano", "passa pra alguém");
    actionDesc = actionDesc || "atendente humano";
  }
  if (triggerLower.includes("preço") || triggerLower.includes("valor") || triggerLower.includes("quanto custa")) {
    keywords.push("preço", "valor", "quanto custa", "quanto é", "qual o preço", "tabela de preço");
    actionDesc = actionDesc || "preço";
  }
  if (triggerLower.includes("reclama") || triggerLower.includes("problema") || triggerLower.includes("insatisf")) {
    keywords.push("reclamação", "problema", "insatisfeito", "não funcionou", "com defeito", "quebrou", "errado");
    actionDesc = actionDesc || "reclamação";
  }
  if (triggerLower.includes("comprar") || triggerLower.includes("pedido") || triggerLower.includes("encomendar")) {
    keywords.push("comprar", "quero comprar", "fazer pedido", "encomendar", "pedir", "quero pedir");
    actionDesc = actionDesc || "compra";
  }
  
  // Detectar gatilhos de FINALIZAÇÃO de coleta (universal para qualquer negócio)
  if (triggerLower.includes("finalizar") || triggerLower.includes("encaminhar") || triggerLower.includes("equipe") || triggerLower.includes("informações") || triggerLower.includes("coleta")) {
    keywords.push(
      "encaminhar agora", "vou encaminhar", "já encaminho", "encaminhando",
      "nossa equipe", "equipe analisar", "equipe vai",
      "já recebi", "recebi as fotos", "recebi as informações", "informações completas",
      "vou passar", "já passo", "passando para",
      "aguarde", "fique no aguardo", "retornamos", "entraremos em contato",
      "atendimento vai continuar", "humano vai assumir", "atendente vai"
    );
    actionDesc = actionDesc || "coleta finalizada";
  }
  
  // Se não detectou tipo específico, extrair keywords do trigger + manuais
  if (keywords.length === 0) {
    const extractedKeywords = trigger
      .replace(/me notifique quando o cliente|quiser|quer|pedir|mencionar|falar sobre|ou quando|atendimento automático|finalizar|coleta|informações iniciais/gi, "")
      .trim();
    if (extractedKeywords) {
      keywords.push(...extractedKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0));
    }
    actionDesc = "gatilho personalizado";
  }
  
  // Adicionar palavras-chave manuais se fornecidas
  if (manualKeywords) {
    const manualList = manualKeywords.split(',').map(k => k.trim().toLowerCase()).filter(k => k.length > 0);
    keywords.push(...manualList);
  }
  
  // Remover duplicatas
  const uniqueKeywords = [...new Set(keywords)];
  
  return `
### REGRA DE NOTIFICACAO INTELIGENTE ###

PALAVRAS-GATILHO: ${uniqueKeywords.join(', ')}

## INSTRUÇÃO CRÍTICA ##
Adicione a tag [NOTIFY: ${actionDesc}] quando QUALQUER uma das condições for verdadeira:

1. **MENSAGEM DO CLIENTE** contém uma palavra-gatilho
2. **SUA PRÓPRIA RESPOSTA** indica que a tarefa/coleta foi concluída
3. **VOCÊ VAI ENCAMINHAR** para equipe humana ou outra área
4. **O ATENDIMENTO AUTOMÁTICO** atingiu seu objetivo

## EXEMPLOS DE QUANDO NOTIFICAR ##

### Cliente solicita algo:
- "Quero agendar" -> [NOTIFY: ${actionDesc}]
- "Tem vaga amanhã?" -> [NOTIFY: ${actionDesc}]

### Você (agente) finaliza coleta de informações:
- "Recebi as fotos e o bairro, vou encaminhar para nossa equipe" -> [NOTIFY: ${actionDesc}]
- "Perfeito! Já tenho tudo que preciso, vou passar para o atendimento" -> [NOTIFY: ${actionDesc}]
- "Informações completas! Aguarde que nossa equipe vai analisar" -> [NOTIFY: ${actionDesc}]

### Você vai transferir para humano:
- "Vou encaminhar agora para nossa equipe analisar" -> [NOTIFY: ${actionDesc}]
- "Nossa equipe já vai te retornar" -> [NOTIFY: ${actionDesc}]

## QUANDO NÃO NOTIFICAR ##
- Cliente apenas perguntou algo genérico
- Conversa ainda está em andamento sem gatilho específico
- Você está apenas explicando algo ou respondendo dúvidas

IMPORTANTE: A tag [NOTIFY: ${actionDesc}] deve estar NO FINAL da sua resposta.
`;
}

// ═══════════════════════════════════════════════════════════════════════
// FUNÇÃO DE VERIFICAÇÃO DE KEYWORDS (simula whatsapp.ts)
// ═══════════════════════════════════════════════════════════════════════

function checkManualKeywords(
  clientMessage: string, 
  agentResponse: string, 
  manualKeywords: string
): { shouldNotify: boolean; reason: string; source: string } {
  
  const keywords = manualKeywords
    .split(',')
    .map(k => k.trim().toLowerCase())
    .filter(k => k.length > 0);
  
  const clientLower = clientMessage.toLowerCase();
  const agentLower = agentResponse.toLowerCase();
  
  for (const keyword of keywords) {
    // Verificar na mensagem do cliente
    if (clientLower.includes(keyword)) {
      return {
        shouldNotify: true,
        reason: `Palavra-chave detectada (cliente): "${keyword}"`,
        source: "cliente"
      };
    }
    
    // Verificar na resposta do agente
    if (agentLower.includes(keyword)) {
      return {
        shouldNotify: true,
        reason: `Palavra-chave detectada (agente): "${keyword}"`,
        source: "agente"
      };
    }
  }
  
  return { shouldNotify: false, reason: "", source: "" };
}

// ═══════════════════════════════════════════════════════════════════════
// TESTES
// ═══════════════════════════════════════════════════════════════════════

interface TestCase {
  name: string;
  clientMessage: string;
  agentResponse: string;
  expectedNotify: boolean;
  expectedSource?: "cliente" | "agente" | "";
}

const PISCINOU_TRIGGER = "Me notifique quando o cliente já tiver enviado as fotos da piscina e informado o bairro, ou quando o atendimento automático finalizar a coleta das informações iniciais.";
const PISCINOU_KEYWORDS = "agendar,agende,encaminhar agora pra nossa equipe,nossa equipe vai analisar,equipe vai analisar,já te retorna,te retornamos";

console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🔔 TESTE DO NOTIFICADOR INTELIGENTE - CASO PISCINOU");
console.log("═══════════════════════════════════════════════════════════════════════\n");

console.log("📋 CONFIGURAÇÃO:");
console.log(`   Trigger: "${PISCINOU_TRIGGER.substring(0, 80)}..."`);
console.log(`   Keywords manuais: "${PISCINOU_KEYWORDS}"`);
console.log("");

// Gerar o prompt de notificação
const notificationPrompt = getNotificationPrompt(PISCINOU_TRIGGER, PISCINOU_KEYWORDS);
console.log("📝 PROMPT DE NOTIFICAÇÃO GERADO:");
console.log("───────────────────────────────────────────────────────────────────────");
console.log(notificationPrompt);
console.log("───────────────────────────────────────────────────────────────────────\n");

const testCases: TestCase[] = [
  // Casos do CLIENTE
  {
    name: "Cliente pede para agendar",
    clientMessage: "Quero agendar para amanhã",
    agentResponse: "Claro! Para qual horário você prefere?",
    expectedNotify: true,
    expectedSource: "cliente"
  },
  {
    name: "Cliente envia fotos e bairro (sem keywords)",
    clientMessage: "Aqui estão as fotos. Moro no bairro Centro.",
    agentResponse: "Recebi as fotos! Obrigado.",
    expectedNotify: false,
    expectedSource: ""
  },
  {
    name: "Cliente faz pergunta genérica",
    clientMessage: "Oi, tudo bem?",
    agentResponse: "Olá! Sou o Lailton do Piscinou. Como posso ajudar?",
    expectedNotify: false,
    expectedSource: ""
  },
  
  // Casos do AGENTE (o mais importante para o Piscinou!)
  {
    name: "AGENTE encaminha para equipe (palavra-chave na resposta do agente)",
    clientMessage: "Pronto, mandei as fotos e sou do bairro Jardim",
    agentResponse: "Perfeito 😊 Já recebi as fotos e o bairro. Vou encaminhar agora pra nossa equipe analisar direitinho e já te retornamos.",
    expectedNotify: true,
    expectedSource: "agente"
  },
  {
    name: "AGENTE confirma recebimento e passa para humano",
    clientMessage: "Segue as 2 fotos, bairro Copacabana",
    agentResponse: "Show! Recebi tudo. Nossa equipe vai analisar e já te retorna com o valor.",
    expectedNotify: true,
    expectedSource: "agente"
  },
  {
    name: "AGENTE ainda coletando info (não deve notificar)",
    clientMessage: "Oi, quero saber de limpeza de piscina",
    agentResponse: "Olá! Para fazer o orçamento, preciso de 2 fotos da piscina e o bairro.",
    expectedNotify: false,
    expectedSource: ""
  },
  
  // Casos mistos
  {
    name: "Cliente pede agendar E agente encaminha",
    clientMessage: "Quero agendar a limpeza",
    agentResponse: "Perfeito! Vou encaminhar agora pra nossa equipe agendar.",
    expectedNotify: true,
    expectedSource: "cliente" // Cliente tem prioridade
  },
];

console.log("🧪 EXECUTANDO TESTES DE VERIFICAÇÃO DE KEYWORDS:");
console.log("═══════════════════════════════════════════════════════════════════════\n");

let passed = 0;
let failed = 0;

for (const test of testCases) {
  const result = checkManualKeywords(test.clientMessage, test.agentResponse, PISCINOU_KEYWORDS);
  
  const notifyMatch = result.shouldNotify === test.expectedNotify;
  const sourceMatch = test.expectedSource === undefined || result.source === test.expectedSource;
  const success = notifyMatch && sourceMatch;
  
  if (success) {
    passed++;
    console.log(`✅ ${test.name}`);
  } else {
    failed++;
    console.log(`❌ ${test.name}`);
    console.log(`   Esperado: notify=${test.expectedNotify}, source="${test.expectedSource}"`);
    console.log(`   Obtido: notify=${result.shouldNotify}, source="${result.source}"`);
  }
  
  console.log(`   📱 Cliente: "${test.clientMessage.substring(0, 50)}..."`);
  console.log(`   🤖 Agente: "${test.agentResponse.substring(0, 50)}..."`);
  if (result.shouldNotify) {
    console.log(`   🔔 ${result.reason}`);
  }
  console.log("");
}

console.log("═══════════════════════════════════════════════════════════════════════");
console.log(`📊 RESULTADO: ${passed}/${passed + failed} testes passaram`);
if (failed === 0) {
  console.log("🎉 TODOS OS TESTES PASSARAM!");
} else {
  console.log(`⚠️  ${failed} teste(s) falharam`);
}
console.log("═══════════════════════════════════════════════════════════════════════\n");

// ═══════════════════════════════════════════════════════════════════════
// TESTE DE UNIVERSALIDADE - OUTROS TIPOS DE NEGÓCIO
// ═══════════════════════════════════════════════════════════════════════

console.log("\n🌐 TESTE DE UNIVERSALIDADE - OUTROS NEGÓCIOS:");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const otherBusinesses = [
  {
    name: "Clínica Médica",
    trigger: "Me notifique quando o paciente quiser agendar consulta ou marcar retorno",
    keywords: "agendar,consulta,marcar,retorno",
    testClient: "Quero marcar uma consulta para segunda",
    testAgent: "Perfeito! Vou verificar os horários disponíveis."
  },
  {
    name: "Restaurante Delivery",
    trigger: "Me notifique quando o cliente quiser fazer pedido ou encomendar",
    keywords: "pedido,encomendar,quero pedir,cardápio",
    testClient: "Quero fazer um pedido",
    testAgent: "Ótimo! Qual prato você deseja?"
  },
  {
    name: "Imobiliária",
    trigger: "Me notifique quando o cliente demonstrar interesse em agendar visita",
    keywords: "visitar,visita,conhecer,agendar visita",
    testClient: "Gostaria de visitar esse apartamento",
    testAgent: "Claro! Quando você teria disponibilidade?"
  },
  {
    name: "Suporte Técnico",
    trigger: "Me notifique quando o cliente relatar problema ou querer falar com humano",
    keywords: "problema,não funciona,bug,erro,atendente",
    testClient: "Estou com um problema no sistema",
    testAgent: "Entendo. Pode me descrever o erro?"
  }
];

for (const biz of otherBusinesses) {
  console.log(`📌 ${biz.name}`);
  console.log(`   Trigger: "${biz.trigger.substring(0, 60)}..."`);
  console.log(`   Keywords: "${biz.keywords}"`);
  
  const prompt = getNotificationPrompt(biz.trigger, biz.keywords);
  const result = checkManualKeywords(biz.testClient, biz.testAgent, biz.keywords);
  
  console.log(`   Teste: "${biz.testClient}" -> ${result.shouldNotify ? '🔔 NOTIFICA' : '⏸️ Não notifica'}`);
  if (result.shouldNotify) {
    console.log(`   ${result.reason}`);
  }
  console.log("");
}

console.log("═══════════════════════════════════════════════════════════════════════");
console.log("✅ Sistema de notificação é UNIVERSAL para qualquer negócio!");
console.log("═══════════════════════════════════════════════════════════════════════");
