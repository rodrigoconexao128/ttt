/**
 * Teste: Forçar envio de mídia para rodrigo4@gmail.com
 * 
 * Este teste verifica se o sistema de forçar mídia funciona corretamente
 * para todos os agentes, independente do prompt.
 */

import { forceMediaDetection } from "./server/mediaService";
import type { AgentMedia } from "@shared/schema";

// Dados das mídias do rodrigo4@gmail.com (copiados do Supabase)
const mockMediaLibrary: AgentMedia[] = [
  {
    id: "cc67c81e-098b-430c-a45e-013fe6556d4f",
    userId: "cb9213c3-fde3-479e-a4aa-344171c59735",
    name: "MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR",
    mediaType: "audio",
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1766786299410_atendimento_mensagem_de_inicio.ogg",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1768107900146_notificadorinteligente.mp4",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1767126092792_cadastro.mp4",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1766786362688_como_funciona_apos__cliente_responder.ogg",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1768107951867_followpinteligente.mp4",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1768108031991_kabancrm.mp4",
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
    storageUrl: "https://bnfpcuzjvycudccycqqt.supabase.co/storage/v1/object/public/agent-media/media/cb9213c3-fde3-479e-a4aa-344171c59735/1768108134035_envioemmasacampanha.mp4",
    mimeType: "video/mp4",
    whenToUse: "ENVIAR APENAS QUANDO: Cliente pergunta sobre ENVIO EM MASSA, disparos, campanhas, broadcast, \"posso enviar para todos?\", \"tem disparo?\", \"enviar promoção?\", \"campanha de marketing\", \"mensagem em massa\". NÃO ENVIAR: pergunta geral.",
    isActive: true,
    displayOrder: 9,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
];

async function testForceMedia() {
  console.log("\n");
  console.log("═══════════════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE: Sistema de Forçar Envio de Mídia");
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
    [], // Sem histórico - primeira mensagem
    mockMediaLibrary,
    [] // Nenhuma mídia enviada
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
    [] // Nenhuma mídia enviada ainda
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
    ["MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR"] // Já enviou a primeira
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
}

testForceMedia().catch(err => {
  console.error("❌ Erro no teste:", err);
  process.exit(1);
});
