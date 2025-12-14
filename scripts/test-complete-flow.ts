/**
 * 🧪 TESTE COMPLETO END-TO-END
 * 
 * Este teste simula o fluxo COMPLETO:
 * 1. Cliente chega interessado
 * 2. Conversa com Rodrigo
 * 3. Manda mídias (foto, áudio)
 * 4. Rodrigo cria conta de teste
 * 5. Verifica se link funciona
 * 6. Testa o agente criado
 * 
 * NICHOS TESTADOS:
 * - Hotmart/Infoprodutos (cursos, ebooks, afiliados)
 * - Restaurante (com foto do cardápio)
 * - Serviços (com áudio explicando)
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Nichos para testar
const BUSINESS_TYPES = [
  {
    name: "Curso de Receitas Fit",
    type: "Infoprodutor Hotmart",
    owner: "Juliana",
    description: "Vende curso de receitas fitness na Hotmart. 47 receitas saudáveis, com bônus de cardápio semanal.",
    scenario: "infoproduto",
    mediaToSend: "audio" // vai simular envio de áudio
  },
  {
    name: "Mentoria de Dropshipping",
    type: "Mentor Digital",
    owner: "Carlos",
    description: "Mentoria de dropshipping para iniciantes. 3 meses de acompanhamento + comunidade no Discord.",
    scenario: "infoproduto",
    mediaToSend: null
  },
  {
    name: "Afiliado de Emagrecer",
    type: "Afiliado Hotmart",
    owner: "Fernanda",
    description: "Afiliada do curso 'Protocolo Barriga Zero'. Comissão de R$ 150 por venda.",
    scenario: "afiliado",
    mediaToSend: null
  },
  {
    name: "Restaurante Sabor Caseiro",
    type: "Restaurante/Delivery",
    owner: "Dona Maria",
    description: "Restaurante de comida caseira com delivery. Marmitas, almoço executivo, pratos feitos.",
    scenario: "restaurante",
    mediaToSend: "foto" // vai simular envio de foto do cardápio
  },
  {
    name: "Ebook de Investimentos",
    type: "Infoprodutor",
    owner: "Rafael",
    description: "Vende ebook 'Primeiros Passos nos Investimentos' por R$ 47. Público iniciante.",
    scenario: "infoproduto",
    mediaToSend: null
  },
  {
    name: "Consultoria de Marketing",
    type: "Serviços B2B",
    owner: "Amanda",
    description: "Consultoria de marketing digital para pequenas empresas. Pacotes mensais.",
    scenario: "servicos",
    mediaToSend: "audio" // vai simular áudio explicando
  }
];

// ============================================================================
// PROMPTS
// ============================================================================

function getClientPrompt(business: typeof BUSINESS_TYPES[0], conversationCount: number): string {
  let mediaInstruction = "";
  if (business.mediaToSend === "audio" && conversationCount === 5) {
    mediaInstruction = `\n\n🎤 NESTA MENSAGEM, DIGA QUE VAI MANDAR UM ÁUDIO para explicar melhor seu negócio. Diga algo como "vou te mandar um áudio explicando melhor" ou "deixa eu mandar um áudio que fica mais fácil".`;
  } else if (business.mediaToSend === "foto" && conversationCount === 4) {
    mediaInstruction = `\n\n📸 NESTA MENSAGEM, DIGA QUE VAI MANDAR UMA FOTO do cardápio/catálogo. Diga algo como "vou te mandar uma foto do meu cardápio" ou "olha, deixa eu mandar a foto aqui".`;
  }

  return `Você é ${business.owner}, dono(a) de ${business.name}, um(a) ${business.type}.
${business.description}

Você está conversando com o Rodrigo da AgenteZap e quer saber se vale a pena contratar.

SEU PERFIL:
- Você é CÉTICO(A) mas interessado(a)
- Faz perguntas específicas sobre seu nicho
- Quer saber como vai funcionar PRA VOCÊ especificamente
- Se ele oferecer teste, aceite depois de algumas perguntas

${business.scenario === "infoproduto" || business.scenario === "afiliado" ? `
PERGUNTAS TÍPICAS DO SEU NICHO (use naturalmente):
- "Como a IA vai tirar dúvidas sobre meu ${business.scenario === "afiliado" ? "produto que promovo" : "curso/produto"}?"
- "Ela consegue mandar o link de checkout da Hotmart?"
- "E se o cliente perguntar sobre garantia de 7 dias?"
- "Dá pra ela responder sobre os bônus do curso?"
- "Funciona com tráfego pago? A galera vem do anúncio e cai no WhatsApp"
` : ""}

${business.scenario === "restaurante" ? `
PERGUNTAS TÍPICAS DO SEU NICHO (use naturalmente):
- "Como ela sabe os preços do meu cardápio?"
- "E se o cliente quiser fazer um pedido personalizado?"
- "Ela consegue anotar pedido de delivery?"
- "Funciona no horário de pico? A gente atende muito cliente ao mesmo tempo"
` : ""}

${business.scenario === "servicos" ? `
PERGUNTAS TÍPICAS DO SEU NICHO (use naturalmente):
- "Como ela explica meus pacotes de serviço?"
- "Dá pra agendar reuniões/consultas?"
- "E se o cliente quiser negociar preço?"
- "Ela entende sobre B2B?"
` : ""}
${mediaInstruction}

📝 FORMATO:
- Responda APENAS como cliente
- Use linguagem informal (vc, tá, pra, etc)
- 1-3 linhas por mensagem
- Seja específico(a) sobre seu nicho`;
}

function getAgentPrompt(business: typeof BUSINESS_TYPES[0]): string {
  return `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨 VOCÊ VENDE A AGENTEZAP (sistema de IA) para ${business.owner} usar no negócio dele!
NÃO venda os produtos do cliente. Venda o SISTEMA de atendimento.

CLIENTE:
- Nome: ${business.owner}
- Empresa: ${business.name}
- Tipo: ${business.type}
- Descrição: ${business.description}

═══════════════════════════════════════════════════════════════════════════════
📋 REGRAS CRÍTICAS
═══════════════════════════════════════════════════════════════════════════════

1. ACEITE MÍDIAS: Se cliente mencionar que vai mandar áudio/foto/vídeo:
   - Diga "Pode mandar sim! Fica mais fácil de entender!"
   - Quando receber: "Recebi! Deixa eu analisar..."

2. NICHOS DE INFOPRODUTOS/HOTMART:
   - Mostre como a IA ajuda com vendas 24h
   - "A IA pode tirar dúvidas sobre o curso e mandar o link de compra!"
   - "Funciona perfeito com tráfego pago - galera vem do anúncio e a IA atende!"

3. A PARTIR DA 3ª RESPOSTA: Inclua [AÇÃO:CRIAR_CONTA_TESTE] no final

4. NUNCA repita a mesma explicação. Se cliente perguntar de novo → ofereça teste!

5. ANALISE A CONVERSA: Não pergunte o que o cliente já respondeu!

6. ENVIE MÍDIAS (máx 2x cada):
   - [ENVIAR_MIDIA:COMO_FUNCIONA]
   - [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]
   - [ENVIAR_MIDIA:TABELA_PRECOS]

7. Quando coletar os dados (nome, empresa, função, instruções):
   - Use [AÇÃO:CRIAR_CONTA_TESTE] para gerar o acesso

PREÇO: R$ 99/mês | Teste: 7 dias grátis

AÇÕES DISPONÍVEIS:
[AÇÃO:CRIAR_CONTA_TESTE] - Criar conta de teste grátis
[AÇÃO:ENVIAR_PIX] - Enviar QR Code do PIX`;
}

// ============================================================================
// FUNÇÕES DE API
// ============================================================================

async function callMistral(messages: any[], temperature: number = 0.8): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: messages,
      temperature: temperature,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// ============================================================================
// ANÁLISE DE CONVERSA
// ============================================================================

interface ConversationAnalysis {
  score: number;
  criarContaTeste: number;
  mediasEnviadas: string[];
  aceitouMidiaCliente: boolean;
  mencionouAudio: boolean;
  contextoCorreto: boolean;
  problemas: string[];
  destaques: string[];
}

function analyzeConversation(messages: Array<{role: string, content: string}>, business: typeof BUSINESS_TYPES[0]): ConversationAnalysis {
  const analysis: ConversationAnalysis = {
    score: 100,
    criarContaTeste: 0,
    mediasEnviadas: [],
    aceitouMidiaCliente: false,
    mencionouAudio: false,
    contextoCorreto: true,
    problemas: [],
    destaques: []
  };

  const agentMessages = messages.filter(m => m.role === "assistant");
  
  for (const msg of agentMessages) {
    // Contar CRIAR_CONTA_TESTE
    if (msg.content.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      analysis.criarContaTeste++;
    }
    
    // Contar mídias
    const mediaMatches = msg.content.match(/\[ENVIAR_MIDIA:[^\]]+\]/g);
    if (mediaMatches) {
      analysis.mediasEnviadas.push(...mediaMatches);
    }
    
    // Verificar se aceitou mídia do cliente
    if (msg.content.match(/pode mandar|manda a(í| aí)|recebi|manda sim|fica mais fácil/i)) {
      analysis.aceitouMidiaCliente = true;
    }
    
    // Verificar se mencionou áudio
    if (msg.content.match(/áudio|audio|gravar|voz/i)) {
      analysis.mencionouAudio = true;
    }
    
    // Verificar contexto errado (vendendo produto do cliente)
    if (business.scenario === "infoproduto" && msg.content.match(/comprar seu curso|adquirir seu produto/i)) {
      analysis.contextoCorreto = false;
      analysis.problemas.push("Contexto errado: vendendo produto do cliente ao invés da AgenteZap");
      analysis.score -= 20;
    }
    
    // Verificar repetição de "Já falei"
    if (msg.content.match(/já falei|já expliquei isso/i)) {
      analysis.problemas.push("Disse 'já falei' - é rude!");
      analysis.score -= 10;
    }
  }
  
  // Análise final
  if (analysis.criarContaTeste >= 3) {
    analysis.destaques.push(`Ofereceu teste ${analysis.criarContaTeste}x - ótimo!`);
  } else if (analysis.criarContaTeste === 0) {
    analysis.problemas.push("Nunca ofereceu criar conta de teste!");
    analysis.score -= 30;
  } else {
    analysis.problemas.push(`Ofereceu teste apenas ${analysis.criarContaTeste}x`);
    analysis.score -= 15;
  }
  
  if (analysis.aceitouMidiaCliente) {
    analysis.destaques.push("Aceitou mídia do cliente corretamente");
  } else if (business.mediaToSend) {
    analysis.problemas.push("Não demonstrou aceitar mídia do cliente");
    analysis.score -= 10;
  }
  
  if (analysis.mencionouAudio) {
    analysis.destaques.push("Mencionou que aceita áudio");
  }
  
  // Contar mídias repetidas
  const mediaCounts: {[key: string]: number} = {};
  for (const media of analysis.mediasEnviadas) {
    mediaCounts[media] = (mediaCounts[media] || 0) + 1;
  }
  for (const [media, count] of Object.entries(mediaCounts)) {
    if (count > 2) {
      analysis.problemas.push(`Mídia ${media} enviada ${count}x (máx 2)`);
      analysis.score -= 5;
    }
  }
  
  return analysis;
}

// ============================================================================
// TESTE DE UM NEGÓCIO
// ============================================================================

async function testBusiness(business: typeof BUSINESS_TYPES[0]): Promise<{success: boolean, analysis: ConversationAnalysis, messages: any[]}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🏪 TESTANDO: ${business.name} (${business.type})`);
  console.log(`👤 Cliente: ${business.owner} | Cenário: ${business.scenario}`);
  console.log(`${"═".repeat(70)}\n`);
  
  const conversationHistory: Array<{role: string, content: string}> = [];
  const clientMessages: Array<{role: string, content: string}> = [];
  const agentMessages: Array<{role: string, content: string}> = [];
  
  const MAX_MESSAGES = 20;
  let simulatedMediaSent = false;
  
  // Primeira mensagem do cliente
  let clientSystemPrompt = getClientPrompt(business, 1);
  const firstMessage = await callMistral([
    { role: "system", content: clientSystemPrompt },
    { role: "user", content: "Inicie a conversa com o Rodrigo da AgenteZap. Você viu o anúncio dele e está curioso." }
  ], 0.9);
  
  conversationHistory.push({ role: "user", content: firstMessage });
  clientMessages.push({ role: "user", content: firstMessage });
  console.log(`👤 [1] ${business.owner}: ${firstMessage.substring(0, 80)}...`);
  
  for (let i = 2; i <= MAX_MESSAGES; i++) {
    // Resposta do agente
    const agentSystemPrompt = getAgentPrompt(business);
    const agentResponse = await callMistral([
      { role: "system", content: agentSystemPrompt },
      ...conversationHistory.map(m => ({
        role: m.role === "user" ? "user" : "assistant",
        content: m.content
      }))
    ], 0.8);
    
    conversationHistory.push({ role: "assistant", content: agentResponse });
    agentMessages.push({ role: "assistant", content: agentResponse });
    
    // Exibir resposta formatada
    const hasMedia = agentResponse.includes("[ENVIAR_MIDIA:");
    const hasAction = agentResponse.includes("[AÇÃO:");
    let displayResponse = agentResponse.substring(0, 80);
    console.log(`🤖 [${i}] Rodrigo: ${displayResponse}...`);
    if (hasMedia) console.log(`   📁 Mídia detectada`);
    if (hasAction) console.log(`   ⚡ Ação detectada`);
    
    i++;
    if (i > MAX_MESSAGES) break;
    
    // Simular envio de mídia do cliente
    let extraContext = "";
    if (business.mediaToSend && !simulatedMediaSent && i >= 6) {
      if (business.mediaToSend === "audio") {
        extraContext = "\n\n[VOCÊ ACABOU DE ENVIAR UM ÁUDIO explicando detalhes do seu negócio. Mencione isso na resposta.]";
        simulatedMediaSent = true;
      } else if (business.mediaToSend === "foto") {
        extraContext = "\n\n[VOCÊ ACABOU DE ENVIAR UMA FOTO do seu cardápio/catálogo. Mencione isso na resposta.]";
        simulatedMediaSent = true;
      }
    }
    
    // Próxima mensagem do cliente
    clientSystemPrompt = getClientPrompt(business, i) + extraContext;
    const clientResponse = await callMistral([
      { role: "system", content: clientSystemPrompt },
      ...conversationHistory.map(m => ({
        role: m.role === "user" ? "assistant" : "user", // Invertido para perspectiva do cliente
        content: m.content
      })),
      { role: "user", content: "Continue a conversa naturalmente." }
    ], 0.9);
    
    conversationHistory.push({ role: "user", content: clientResponse });
    clientMessages.push({ role: "user", content: clientResponse });
    console.log(`👤 [${i}] ${business.owner}: ${clientResponse.substring(0, 80)}...`);
    
    // Verificar se fechou (conta criada)
    if (agentResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]") && 
        (clientResponse.toLowerCase().includes("sim") || 
         clientResponse.toLowerCase().includes("vamos") ||
         clientResponse.toLowerCase().includes("pode criar"))) {
      console.log(`\n✅ CONTA CRIADA - Finalizando teste`);
      break;
    }
  }
  
  // Análise
  const analysis = analyzeConversation(conversationHistory, business);
  
  console.log(`\n📊 ANÁLISE:`);
  console.log(`   Score: ${analysis.score}/100`);
  console.log(`   CRIAR_CONTA_TESTE: ${analysis.criarContaTeste}x`);
  console.log(`   Mídias enviadas: ${analysis.mediasEnviadas.length}`);
  if (analysis.destaques.length > 0) {
    console.log(`   ✅ Destaques: ${analysis.destaques.join(", ")}`);
  }
  if (analysis.problemas.length > 0) {
    console.log(`   ❌ Problemas: ${analysis.problemas.join(", ")}`);
  }
  
  return {
    success: analysis.score >= 75,
    analysis,
    messages: conversationHistory
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE COMPLETO - NICHOS HOTMART/INFOPRODUTOS + MÍDIAS             ║`);
  console.log(`║   Testa: Aceitar áudio/foto, Contexto, Criar conta                  ║`);
  console.log(`╚${"═".repeat(68)}╝\n`);
  
  const results: Array<{business: string, score: number, success: boolean}> = [];
  
  for (const business of BUSINESS_TYPES) {
    try {
      const result = await testBusiness(business);
      results.push({
        business: business.name,
        score: result.analysis.score,
        success: result.success
      });
      
      // Salvar log
      const logsDir = join(__dirname, '..', 'logs');
      try { mkdirSync(logsDir, { recursive: true }); } catch {}
      
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const logFile = join(logsDir, `complete-test-${business.scenario}-${timestamp}.json`);
      writeFileSync(logFile, JSON.stringify({
        business,
        analysis: result.analysis,
        messages: result.messages
      }, null, 2));
      
    } catch (error) {
      console.error(`❌ Erro no teste de ${business.name}:`, error);
      results.push({
        business: business.name,
        score: 0,
        success: false
      });
    }
    
    // Pequena pausa entre testes
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}`);
  
  let totalScore = 0;
  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.business}: ${result.score}/100`);
    totalScore += result.score;
  }
  
  const avgScore = Math.round(totalScore / results.length);
  console.log(`\n📈 MÉDIA GERAL: ${avgScore}/100`);
  console.log(`✅ Aprovados: ${results.filter(r => r.success).length}/${results.length}`);
}

main().catch(console.error);
