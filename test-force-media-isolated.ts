/**
 * Teste ISOLADO: Forçar envio de mídia
 * 
 * Este arquivo NÃO importa dependências do servidor para testar a lógica pura.
 */

// Definir tipos localmente para evitar imports
interface AgentMedia {
  id: string;
  userId: string;
  name: string;
  mediaType: string;
  storageUrl: string;
  mimeType: string | null;
  whenToUse: string | null;
  isActive: boolean | null;
  displayOrder: number | null;
  createdAt: Date | null;
  updatedAt: Date | null;
}

interface ForceMediaResult {
  shouldSendMedia: boolean;
  mediaToSend: AgentMedia | null;
  matchedKeywords: string[];
  reason: string;
}

/**
 * COPIA DA FUNÇÃO forceMediaDetection do mediaService.ts
 * Para testar de forma isolada sem dependências
 */
function forceMediaDetection(
  clientMessage: string,
  conversationHistory: Array<{ text?: string | null; fromMe?: boolean }>,
  mediaLibrary: AgentMedia[],
  sentMedias: string[] = []
): ForceMediaResult {
  console.log(`\n🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
  console.log(`🚨 [FORCE MEDIA] Analisando mensagem: "${clientMessage.substring(0, 100)}..."`);
  console.log(`🚨 [FORCE MEDIA] Mídias disponíveis: ${mediaLibrary.length}`);
  console.log(`🚨 [FORCE MEDIA] Mídias já enviadas: ${sentMedias.join(', ') || 'nenhuma'}`);
  
  if (!mediaLibrary || mediaLibrary.length === 0) {
    console.log(`🚨 [FORCE MEDIA] ❌ Nenhuma mídia disponível`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhuma mídia disponível' };
  }
  
  // Filtrar mídias já enviadas
  const availableMedias = mediaLibrary.filter(m => {
    const alreadySent = sentMedias.some(sent => sent.toUpperCase() === m.name.toUpperCase());
    if (alreadySent) {
      console.log(`🚨 [FORCE MEDIA] ⏭️ Mídia ${m.name} já foi enviada - pulando`);
    }
    return !alreadySent && m.isActive !== false;
  });
  
  if (availableMedias.length === 0) {
    console.log(`🚨 [FORCE MEDIA] ❌ Todas as mídias já foram enviadas`);
    return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Todas as mídias já foram enviadas' };
  }
  
  // Normalizar mensagem do cliente para comparação
  const clientMsgLower = clientMessage.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // Também verificar últimas mensagens do cliente (contexto)
  const recentClientMessages = conversationHistory
    .filter(m => !m.fromMe && m.text)
    .slice(-5)
    .map(m => (m.text || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
    .join(' ');
  
  const fullContext = `${clientMsgLower} ${recentClientMessages}`;
  
  // Detectar se é primeira mensagem (saudação)
  const isFirstMessage = conversationHistory.filter(m => !m.fromMe).length <= 1;
  const isSaudacao = /^(oi|olá|ola|bom dia|boa tarde|boa noite|e ai|eai|fala|tudo bem|opa|hey|hello|hi)[\s\?!\.]*$/i.test(clientMessage.trim());
  
  console.log(`🚨 [FORCE MEDIA] É primeira mensagem: ${isFirstMessage}`);
  console.log(`🚨 [FORCE MEDIA] É saudação: ${isSaudacao}`);
  
  // Pontuação de cada mídia baseada em keywords
  const mediaScores: Array<{ media: AgentMedia; score: number; keywords: string[]; reason: string }> = [];
  
  for (const media of availableMedias) {
    const whenToUse = (media.whenToUse || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    let score = 0;
    const matchedKeywords: string[] = [];
    let reason = '';
    
    // 1. VERIFICAR GATILHO DE PRIMEIRA MENSAGEM/SAUDAÇÃO
    if ((isFirstMessage || isSaudacao) && 
        (whenToUse.includes('primeira mensagem') || 
         whenToUse.includes('inicio') || 
         whenToUse.includes('oi') || 
         whenToUse.includes('ola') || 
         whenToUse.includes('bom dia') ||
         whenToUse.includes('boa tarde') ||
         whenToUse.includes('boa noite') ||
         media.name.toLowerCase().includes('inicio') ||
         media.name.toLowerCase().includes('welcome') ||
         media.name.toLowerCase().includes('boas_vindas'))) {
      score += 100; // PRIORIDADE MÁXIMA para primeira mensagem
      matchedKeywords.push('PRIMEIRA_MENSAGEM');
      reason = 'Gatilho de primeira mensagem/saudação';
      console.log(`🚨 [FORCE MEDIA] 🎯 Mídia ${media.name}: +100 pontos (primeira mensagem)`);
    }
    
    // 2. EXTRAIR KEYWORDS DO whenToUse E VERIFICAR MATCH
    const stopWords = ['o', 'a', 'os', 'as', 'um', 'uma', 'de', 'da', 'do', 'em', 'na', 'no', 'que', 'se', 'para', 'por', 'com', 'quando', 'cliente', 'enviar', 'apenas', 'nao', 'sobre'];
    const keywords = whenToUse
      .replace(/enviar apenas quando:|quando:|nao enviar:|gatilho:/gi, '')
      .split(/[\s,;.!?]+/)
      .filter(w => w.length > 2 && !stopWords.includes(w));
    
    for (const kw of keywords) {
      if (fullContext.includes(kw)) {
        score += 10;
        matchedKeywords.push(kw);
        console.log(`🚨 [FORCE MEDIA] 🔑 Mídia ${media.name}: +10 pontos (keyword "${kw}")`);
      }
    }
    
    // 3. VERIFICAR KEYWORDS COMUNS POR TIPO DE MÍDIA
    const commonKeywords: Record<string, string[]> = {
      'preco': ['preço', 'preco', 'valor', 'quanto', 'custa', 'custo', 'investimento', 'plano', 'mensalidade'],
      'demo': ['demonstracao', 'demonstração', 'ver', 'mostrar', 'funciona', 'sistema', 'exemplo', 'video', 'vídeo'],
      'agendamento': ['agendar', 'agenda', 'marcar', 'horario', 'horário', 'consulta', 'reuniao', 'reunião'],
      'crm': ['crm', 'kanban', 'organizar', 'pipeline', 'funil', 'leads', 'clientes'],
      'followup': ['followup', 'follow-up', 'reengajar', 'recuperar', 'sumiu', 'nao respondeu', 'não respondeu'],
      'envio': ['massa', 'disparo', 'campanha', 'broadcast', 'enviar para todos', 'promocao', 'promoção'],
      'calibrar': ['calibrar', 'treinar', 'ajustar', 'melhorar', 'configurar', 'editar', 'prompt'],
      'notificador': ['notificador', 'notificacao', 'notificação', 'alerta', 'aviso', 'lead quente'],
    };
    
    for (const [category, kwList] of Object.entries(commonKeywords)) {
      for (const kw of kwList) {
        if (fullContext.includes(kw) && (whenToUse.includes(kw) || media.name.toLowerCase().includes(category))) {
          score += 15;
          if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
          console.log(`🚨 [FORCE MEDIA] 🎯 Mídia ${media.name}: +15 pontos (categoria "${category}", keyword "${kw}")`);
        }
      }
    }
    
    // 4. VERIFICAR NOME DA MÍDIA COMO FALLBACK
    const mediaNameLower = media.name.toLowerCase().replace(/_/g, ' ');
    const mediaNameKeywords = mediaNameLower.split(' ').filter(w => w.length > 3);
    
    for (const kw of mediaNameKeywords) {
      if (fullContext.includes(kw)) {
        score += 5;
        if (!matchedKeywords.includes(kw)) matchedKeywords.push(kw);
        console.log(`🚨 [FORCE MEDIA] 🏷️ Mídia ${media.name}: +5 pontos (nome da mídia "${kw}")`);
      }
    }
    
    if (score > 0) {
      reason = reason || `Match de keywords: ${matchedKeywords.join(', ')}`;
      mediaScores.push({ media, score, keywords: matchedKeywords, reason });
    }
  }
  
  // Ordenar por pontuação (maior primeiro)
  mediaScores.sort((a, b) => b.score - a.score);
  
  if (mediaScores.length > 0) {
    const winner = mediaScores[0];
    console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════`);
    console.log(`🚨 [FORCE MEDIA] 🏆 VENCEDOR: ${winner.media.name} (${winner.score} pontos)`);
    console.log(`🚨 [FORCE MEDIA] 📋 Keywords: ${winner.keywords.join(', ')}`);
    console.log(`🚨 [FORCE MEDIA] 💡 Razão: ${winner.reason}`);
    console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
    
    if (winner.score >= 10) {
      return {
        shouldSendMedia: true,
        mediaToSend: winner.media,
        matchedKeywords: winner.keywords,
        reason: winner.reason
      };
    }
  }
  
  console.log(`🚨 [FORCE MEDIA] ❌ Nenhum match significativo encontrado`);
  console.log(`🚨 [FORCE MEDIA] ════════════════════════════════════════════════\n`);
  
  return { shouldSendMedia: false, mediaToSend: null, matchedKeywords: [], reason: 'Nenhum match significativo' };
}

// Dados das mídias do rodrigo4@gmail.com
const mockMediaLibrary: AgentMedia[] = [
  {
    id: "cc67c81e-098b-430c-a45e-013fe6556d4f",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR",
    mediaType: "audio",
    storageUrl: "https://example.com/audio.ogg",
    mimeType: "audio/ogg",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente envia a PRIMEIRA mensagem da conversa (oi, olá, bom dia, boa tarde, boa noite, e aí). NÃO ENVIAR: se já conversou antes, se cliente perguntou algo específico, se já existe histórico.",
    isActive: true,
    displayOrder: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "e2a243ad-155c-42f0-8cb0-f0f676b84f8b",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "NOTIFICADOR_INTELIGENTE",
    mediaType: "video",
    storageUrl: "https://example.com/video.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pergunta sobre QUALIFICAÇÃO de leads, quer ser NOTIFICADO quando cliente quente, pergunta \"como sei quando cliente quer comprar?\", \"tem notificação?\", \"avisa quando lead interessado?\". NÃO ENVIAR: pergunta geral.",
    isActive: true,
    displayOrder: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "2603ecf0-788f-419f-a50d-cdb2371ecd52",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "DETALHES_DO_SISTEMA",
    mediaType: "video",
    storageUrl: "https://example.com/video.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pede para VER o sistema, quer uma DEMONSTRAÇÃO, quer ver COMO FUNCIONA visualmente, diz \"mostra o sistema\", \"quero ver\", \"tem vídeo?\", \"como é a interface?\". NÃO ENVIAR: apenas por curiosidade geral ou pergunta sobre preço.",
    isActive: true,
    displayOrder: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "1f19b4f9-643c-4a59-a12a-6ff1405ff828",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "COMO_FUNCIONA",
    mediaType: "audio",
    storageUrl: "https://example.com/audio.ogg",
    mimeType: "audio/ogg",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente explica qual é o NEGÓCIO dele (trabalho com vendas, tenho loja, sou corretor, tenho clínica). É a resposta à pergunta \"o que você vende/faz?\". NÃO ENVIAR: se cliente só disse oi, se já enviou antes.",
    isActive: true,
    displayOrder: 4,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "d3e1a878-e47e-4baa-8b31-234b26aa35f6",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "FOLLOWP_INTELIGENTE",
    mediaType: "video",
    storageUrl: "https://example.com/video.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pergunta sobre FOLLOW-UP, recuperar leads, clientes que não responderam, \"se o cliente sumir?\", \"e quem não responde?\", \"reengajar\", \"aquecer lead\". NÃO ENVIAR: pergunta geral sobre o sistema.",
    isActive: true,
    displayOrder: 5,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "669a4144-c515-4b20-9c75-26d43986f237",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "KANBAN_CRM",
    mediaType: "video",
    storageUrl: "https://example.com/video.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pergunta sobre CRM, KANBAN, organizar leads, pipeline, funil de vendas, \"tem crm?\", \"como organizo meus clientes?\", \"etapas de venda\". NÃO ENVIAR: pergunta geral.",
    isActive: true,
    displayOrder: 7,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  {
    id: "9fdaa45a-9d6f-4cd1-a016-110c16704f2a",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "ENVIO_EM_MASSA",
    mediaType: "video",
    storageUrl: "https://example.com/video.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pergunta sobre ENVIO EM MASSA, disparos, campanhas, broadcast, \"posso enviar para todos?\", \"tem disparo?\", \"enviar promoção?\", \"campanha de marketing\", \"mensagem em massa\". NÃO ENVIAR: pergunta geral.",
    isActive: true,
    displayOrder: 9,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 TESTE ISOLADO: Sistema de Forçar Envio de Mídia");
console.log("═══════════════════════════════════════════════════════════════════════\n");

console.log(`📧 Testando com mídias do rodrigo4@gmail.com`);
console.log(`📁 Mídias disponíveis: ${mockMediaLibrary.length}\n`);

for (const media of mockMediaLibrary) {
  console.log(`   - ${media.name} (${media.mediaType})`);
}

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 1: Primeira mensagem (saudação)");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test1 = forceMediaDetection(
  "Oi, tudo bem?",
  [],
  mockMediaLibrary,
  []
);

console.log(`\n📊 Resultado Cenário 1:`);
console.log(`   Deve enviar mídia: ${test1.shouldSendMedia}`);
console.log(`   Mídia: ${test1.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test1.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test1.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 2: Cliente pergunta sobre CRM/Kanban");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test2 = forceMediaDetection(
  "Vocês tem CRM? Como funciona o kanban?",
  [
    { text: "Oi", fromMe: false },
    { text: "Olá! Como posso ajudar?", fromMe: true },
  ],
  mockMediaLibrary,
  []
);

console.log(`\n📊 Resultado Cenário 2:`);
console.log(`   Deve enviar mídia: ${test2.shouldSendMedia}`);
console.log(`   Mídia: ${test2.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test2.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test2.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 3: Cliente pergunta sobre envio em massa");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test3 = forceMediaDetection(
  "Posso fazer disparo em massa? Campanha de marketing?",
  [
    { text: "Oi", fromMe: false },
    { text: "Olá! Como posso ajudar?", fromMe: true },
  ],
  mockMediaLibrary,
  []
);

console.log(`\n📊 Resultado Cenário 3:`);
console.log(`   Deve enviar mídia: ${test3.shouldSendMedia}`);
console.log(`   Mídia: ${test3.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test3.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test3.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 4: Cliente explica o negócio (trabalho com vendas)");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test4 = forceMediaDetection(
  "Trabalho com vendas de imóveis. Quero automatizar meu atendimento.",
  [
    { text: "Oi, tudo bem?", fromMe: false },
    { text: "Olá! Tudo sim! Você pode me contar sobre seu negócio?", fromMe: true },
  ],
  mockMediaLibrary,
  ["MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR"]
);

console.log(`\n📊 Resultado Cenário 4:`);
console.log(`   Deve enviar mídia: ${test4.shouldSendMedia}`);
console.log(`   Mídia: ${test4.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test4.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test4.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 5: Cliente quer ver o sistema/demonstração");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test5 = forceMediaDetection(
  "Quero ver como funciona o sistema. Tem demonstração?",
  [],
  mockMediaLibrary,
  []
);

console.log(`\n📊 Resultado Cenário 5:`);
console.log(`   Deve enviar mídia: ${test5.shouldSendMedia}`);
console.log(`   Mídia: ${test5.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test5.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test5.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("🧪 CENÁRIO 6: Cliente pergunta sobre follow-up/reengajar");
console.log("═══════════════════════════════════════════════════════════════════════\n");

const test6 = forceMediaDetection(
  "E se o cliente sumir? Tem como reengajar ele?",
  [],
  mockMediaLibrary,
  []
);

console.log(`\n📊 Resultado Cenário 6:`);
console.log(`   Deve enviar mídia: ${test6.shouldSendMedia}`);
console.log(`   Mídia: ${test6.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Keywords: ${test6.matchedKeywords.join(', ') || 'nenhuma'}`);
console.log(`   Razão: ${test6.reason}`);

console.log("\n");
console.log("═══════════════════════════════════════════════════════════════════════");
console.log("✅ TESTE CONCLUÍDO!");
console.log("═══════════════════════════════════════════════════════════════════════\n");

// Resumo
console.log("📊 RESUMO:");
console.log(`   Cenário 1 (saudação):     ${test1.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test1.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Cenário 2 (CRM):          ${test2.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test2.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Cenário 3 (massa):        ${test3.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test3.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Cenário 4 (negócio):      ${test4.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test4.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Cenário 5 (demo):         ${test5.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test5.mediaToSend?.name || 'nenhuma'}`);
console.log(`   Cenário 6 (follow-up):    ${test6.shouldSendMedia ? '✅ PASS' : '❌ FAIL'} - ${test6.mediaToSend?.name || 'nenhuma'}`);

const passCount = [test1, test2, test3, test4, test5, test6].filter(t => t.shouldSendMedia).length;
console.log(`\n🏆 Total: ${passCount}/6 cenários detectaram mídia corretamente!`);

process.exit(passCount >= 4 ? 0 : 1);
