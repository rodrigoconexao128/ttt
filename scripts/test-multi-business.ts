/**
 * TESTE PROFUNDO MULTI-NEGÓCIOS
 * 
 * Sistema de teste avançado:
 * - Testa 10 tipos de negócios diferentes
 * - IA Cliente agressiva que tenta "quebrar" o agente
 * - Validação rigorosa de cada resposta
 * - Análise detalhada e correções
 */

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

// ============================================================================
// CONFIGURAÇÃO DOS NEGÓCIOS PARA TESTE
// ============================================================================

interface BusinessProfile {
  name: string;
  type: string;
  owner: string;
  challenges: string[];
  objections: string[];
  specificQuestions: string[];
}

const BUSINESS_PROFILES: BusinessProfile[] = [
  {
    name: "Moda Fashion",
    type: "Loja de Roupas Online",
    owner: "Carlos",
    challenges: ["200 mensagens por dia", "perde vendas de madrugada", "não consegue responder rápido"],
    objections: ["já tentei chatbot e não funcionou", "muito caro pra minha realidade", "tenho medo de IA responder errado"],
    specificQuestions: ["funciona com catalogo de produtos?", "integra com meu sistema de estoque?", "e se cliente pedir troca?"]
  },
  {
    name: "Sabor & Arte Pizzaria",
    type: "Pizzaria Delivery",
    owner: "João",
    challenges: ["pico de pedidos no fim de semana", "cliente quer saber tempo de entrega", "muitas perguntas sobre ingredientes"],
    objections: ["meu cardápio muda toda semana", "preciso de algo que entenda pedidos complexos", "e se der erro no pedido?"],
    specificQuestions: ["consegue anotar pedido automatico?", "integra com iFood?", "e se acabar um ingrediente?"]
  },
  {
    name: "Clínica Bem Estar",
    type: "Clínica de Estética",
    owner: "Dra. Ana",
    challenges: ["muitos agendamentos por WhatsApp", "pacientes querem saber preços", "confirmação de horário"],
    objections: ["preciso de algo discreto e profissional", "pacientes são exigentes", "e dados sensíveis?"],
    specificQuestions: ["consegue agendar consulta?", "integra com minha agenda?", "envia lembrete de consulta?"]
  },
  {
    name: "Auto Peças Silva",
    type: "Loja de Autopeças",
    owner: "Silva",
    challenges: ["clientes perguntam compatibilidade", "muitas peças diferentes", "precisa saber modelo do carro"],
    objections: ["meu estoque é muito grande", "cliente precisa de ajuda técnica", "e se indicar peça errada?"],
    specificQuestions: ["entende de modelo de carro?", "consegue buscar no meu estoque?", "e garantia das peças?"]
  },
  {
    name: "Pet Love",
    type: "Pet Shop",
    owner: "Maria",
    challenges: ["agendamento de banho e tosa", "venda de ração", "emergências com pets"],
    objections: ["meus clientes são muito emotivos", "cada pet é diferente", "preciso de algo carinhoso"],
    specificQuestions: ["agenda banho automatico?", "lembra aniversário do pet?", "e se pet tiver alergia?"]
  },
  {
    name: "Fit & Strong",
    type: "Academia",
    owner: "Personal Marcos",
    challenges: ["muitos alunos perguntando horários", "renovação de plano", "dúvidas sobre treino"],
    objections: ["preciso motivar os alunos", "cada aluno tem objetivo diferente", "e se perguntar sobre dieta?"],
    specificQuestions: ["manda treino automatico?", "controla frequência?", "integra com app de treino?"]
  },
  {
    name: "Imobiliária Sonho",
    type: "Imobiliária",
    owner: "Roberto",
    challenges: ["muitos imóveis para mostrar", "clientes querem agendar visita", "perguntas sobre financiamento"],
    objections: ["imóvel é compra complexa", "preciso qualificar o lead", "cliente quer falar com corretor"],
    specificQuestions: ["mostra fotos do imóvel?", "agenda visita?", "calcula financiamento?"]
  },
  {
    name: "Tech Solutions",
    type: "Suporte de TI",
    owner: "Lucas",
    challenges: ["clientes com problemas urgentes", "muitas perguntas técnicas", "horário comercial limitado"],
    objections: ["problemas de TI são complexos", "preciso de acesso remoto", "cada caso é único"],
    specificQuestions: ["faz diagnóstico inicial?", "abre chamado automatico?", "escala para técnico?"]
  },
  {
    name: "Doce Sabor",
    type: "Confeitaria",
    owner: "Patrícia",
    challenges: ["encomendas personalizadas", "prazo de entrega", "alergias alimentares"],
    objections: ["cada bolo é único", "preciso de detalhes específicos", "cliente muda de ideia"],
    specificQuestions: ["anota encomenda detalhada?", "mostra portfólio?", "confirma pedido?"]
  },
  {
    name: "Advocacia Justiça",
    type: "Escritório de Advocacia",
    owner: "Dr. Fernando",
    challenges: ["clientes querem saber andamento", "agendamento de consulta", "sigilo profissional"],
    objections: ["cada caso é sigiloso", "não posso dar parecer por WhatsApp", "preciso qualificar o caso"],
    specificQuestions: ["agenda consulta inicial?", "filtra tipo de caso?", "mantém sigilo?"]
  }
];

// ============================================================================
// PROMPT DA IA CLIENTE (TESTADORA AGRESSIVA)
// ============================================================================

function getClientPrompt(business: BusinessProfile): string {
  return `Você é ${business.owner}, dono(a) da "${business.name}" (${business.type}).

SUA MISSÃO: TESTAR O VENDEDOR AO MÁXIMO!

PERFIL:
- Você é CÉTICO e DESCONFIADO
- Você faz PERGUNTAS DIFÍCEIS
- Você tenta CONFUNDIR o vendedor
- Você REPETE perguntas para ver se ele se perde
- Você muda de ASSUNTO de repente
- Você faz OBJEÇÕES fortes

SEUS DESAFIOS REAIS:
${business.challenges.map(c => `- ${c}`).join('\n')}

SUAS OBJEÇÕES (USE TODAS):
${business.objections.map(o => `- "${o}"`).join('\n')}

PERGUNTAS ESPECÍFICAS DO SEU NEGÓCIO:
${business.specificQuestions.map(q => `- "${q}"`).join('\n')}

TÁTICAS DE TESTE (use durante a conversa):
1. Pergunte "como funciona" e depois pergunte DE NOVO para ver se repete
2. Peça detalhes técnicos específicos
3. Compare com concorrentes ("o Chatbot X faz isso...")
4. Diga "não entendi" para forçar nova explicação
5. Peça desconto agressivamente
6. Diga que vai "pensar" e veja como ele reage
7. Faça perguntas sobre seu tipo específico de negócio
8. Teste se ele lembra informações que você deu antes
9. Pergunte coisas impossíveis para ver como ele lida
10. Seja impaciente e veja se ele mantém a calma

FORMATO:
- Mensagens CURTAS (1-3 linhas)
- NATURAL e brasileiro (vc, tá, né)
- Uma pergunta por vez
- Mostre emoções (frustração, interesse, dúvida)

IMPORTANTE: Você está testando se o vendedor:
✓ Não repete a mesma explicação
✓ Envia mídias quando relevante
✓ Entende seu tipo de negócio
✓ Responde objeções bem
✓ Mantém contexto da conversa
✓ Avança para fechamento`;
}

// ============================================================================
// PROMPT DO AGENTE (VERSÃO OTIMIZADA)
// ============================================================================

const AGENT_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

═══════════════════════════════════════════════════════════════════════════════
🚨 REGRAS CRÍTICAS - VERIFIQUE ANTES DE CADA RESPOSTA!
═══════════════════════════════════════════════════════════════════════════════

CHECKLIST OBRIGATÓRIO (faça mentalmente antes de responder):

□ MÍDIA: Se vou mencionar "como funciona" → DEVO incluir [ENVIAR_MIDIA:COMO_FUNCIONA]
□ MÍDIA: Se vou mencionar "vídeo" ou "demonstrar" → DEVO incluir [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]
□ MÍDIA: Se vou mencionar "preço" ou "quanto custa" → DEVO incluir [ENVIAR_MIDIA:TABELA_PRECOS]
□ REPETIÇÃO: Já expliquei isso antes? → NÃO REPITO, avanço para outro assunto!
□ TAMANHO: Resposta muito longa? → Encurto para 4-6 linhas máximo!

═══════════════════════════════════════════════════════════════════════════════
📁 MÍDIAS DISPONÍVEIS
═══════════════════════════════════════════════════════════════════════════════

SEMPRE que mencionar estes assuntos, INCLUA a tag correspondente:

| Assunto | Tag OBRIGATÓRIA |
|---------|-----------------|
| como funciona, explicar | [ENVIAR_MIDIA:COMO_FUNCIONA] |
| vídeo, demonstração | [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO] |
| preço, valor, quanto custa | [ENVIAR_MIDIA:TABELA_PRECOS] |
| contrato, termos | [ENVIAR_MIDIA:PDF_CONTRATO] |

EXEMPLO CORRETO:
"Vou te explicar como funciona! [ENVIAR_MIDIA:COMO_FUNCIONA]"

EXEMPLO ERRADO (NÃO FAÇA):
"Vou te explicar como funciona!" (faltou a tag!)

═══════════════════════════════════════════════════════════════════════════════
🧠 REGRAS DE OURO
═══════════════════════════════════════════════════════════════════════════════

1. NUNCA REPITA: Se já explicou algo, AVANCE para outro assunto
2. SEJA CONCISO: Máximo 4-6 linhas por resposta
3. PERSONALIZE: Use o nome do cliente e tipo de negócio
4. AVANCE: Sempre guie para o próximo passo (teste, fechamento)
5. ADAPTE: Entenda o negócio do cliente e dê exemplos específicos

═══════════════════════════════════════════════════════════════════════════════
🚀 SOBRE A AGENTEZAP
═══════════════════════════════════════════════════════════════════════════════

• Agente de IA que atende WhatsApp 24/7
• R$ 99/mês - conversas ilimitadas
• Teste GRÁTIS de 7 dias
• Personaliza para qualquer tipo de negócio

═══════════════════════════════════════════════════════════════════════════════
⚡ AÇÕES DISPONÍVEIS
═══════════════════════════════════════════════════════════════════════════════

[AÇÃO:CRIAR_CONTA_TESTE] - Cria conta de teste gratuito
[AÇÃO:ENVIAR_PIX] - Envia dados do PIX
[ENVIAR_MIDIA:NOME] - Envia mídia específica`;

// ============================================================================
// VALIDADOR
// ============================================================================

interface ValidationError {
  type: "error" | "warning";
  message: string;
  suggestion: string;
}

function validateResponse(
  response: string, 
  previousResponses: string[],
  expectedMedia: string | null
): ValidationError[] {
  const errors: ValidationError[] = [];
  
  // 1. Verificar se mencionou "como funciona" mas não enviou mídia
  const mentionsHowItWorks = /como funciona|funciona o sistema|explicar|demonstr/i.test(response);
  const hasMidiaTag = /\[ENVIAR_MIDIA:[A-Z_]+\]/i.test(response);
  
  if (mentionsHowItWorks && !hasMidiaTag) {
    errors.push({
      type: "error",
      message: "Mencionou 'como funciona' mas NÃO enviou mídia",
      suggestion: "Adicionar [ENVIAR_MIDIA:COMO_FUNCIONA] ou [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]"
    });
  }
  
  // 2. Verificar repetição
  for (const prev of previousResponses.slice(-5)) {
    const prevWords = prev.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    const currWords = response.toLowerCase().split(/\s+/).filter(w => w.length > 5);
    
    let matches = 0;
    for (const word of currWords) {
      if (prevWords.includes(word)) matches++;
    }
    
    if (currWords.length > 0 && matches / currWords.length > 0.6) {
      errors.push({
        type: "error",
        message: "REPETIÇÃO: Resposta muito similar a uma anterior",
        suggestion: "Avançar para novo assunto, não repetir explicação"
      });
      break;
    }
  }
  
  // 3. Verificar tamanho
  if (response.length > 600) {
    errors.push({
      type: "warning",
      message: `Resposta muito longa (${response.length} chars)`,
      suggestion: "Encurtar para 4-6 linhas (máx 400 chars)"
    });
  }
  
  if (response.length < 80) {
    errors.push({
      type: "warning",
      message: `Resposta muito curta (${response.length} chars)`,
      suggestion: "Desenvolver mais a resposta"
    });
  }
  
  // 4. Verificar se mencionou preço sem mídia
  if (/preço|custa|valor|plano|R\$/i.test(response) && !response.includes("TABELA_PRECOS")) {
    errors.push({
      type: "warning",
      message: "Mencionou preço mas não enviou TABELA_PRECOS",
      suggestion: "Adicionar [ENVIAR_MIDIA:TABELA_PRECOS]"
    });
  }
  
  return errors;
}

// ============================================================================
// GERADOR DE RESPOSTAS
// ============================================================================

class ConversationEngine {
  private mistral: Mistral;
  private clientHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  private agentHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  private agentResponses: string[] = [];
  
  constructor() {
    this.mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
  }
  
  reset() {
    this.clientHistory = [];
    this.agentHistory = [];
    this.agentResponses = [];
  }
  
  async generateClientMessage(business: BusinessProfile, agentResponse?: string): Promise<string> {
    if (agentResponse) {
      this.clientHistory.push({ role: "assistant", content: agentResponse });
    }
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: getClientPrompt(business) },
      ...this.clientHistory,
      { role: "user", content: "Continue a conversa com uma pergunta ou comentário natural." }
    ];
    
    const response = await this.mistral.chat.complete({
      model: "mistral-small-latest",
      messages,
      maxTokens: 150,
      temperature: 0.9,
    });
    
    const clientMsg = response.choices?.[0]?.message?.content?.toString() || "";
    this.clientHistory.push({ role: "user", content: clientMsg });
    
    return clientMsg;
  }
  
  async generateAgentResponse(clientMessage: string): Promise<string> {
    this.agentHistory.push({ role: "user", content: clientMessage });
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: AGENT_PROMPT },
      ...this.agentHistory.slice(-15)
    ];
    
    const response = await this.mistral.chat.complete({
      model: "mistral-small-latest",
      messages,
      maxTokens: 400,
      temperature: 0.8,
    });
    
    const agentMsg = response.choices?.[0]?.message?.content?.toString() || "";
    this.agentHistory.push({ role: "assistant", content: agentMsg });
    this.agentResponses.push(agentMsg);
    
    return agentMsg;
  }
  
  getAgentResponses(): string[] {
    return this.agentResponses;
  }
}

// ============================================================================
// EXECUTOR DE TESTES
// ============================================================================

interface TestResult {
  business: BusinessProfile;
  totalMessages: number;
  errors: number;
  warnings: number;
  score: number;
  details: string[];
}

async function testBusiness(business: BusinessProfile, messagesCount: number = 20): Promise<TestResult> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🏪 TESTANDO: ${business.name} (${business.type})`);
  console.log(`👤 Dono: ${business.owner}`);
  console.log(`${"═".repeat(70)}\n`);
  
  const engine = new ConversationEngine();
  const errors: ValidationError[] = [];
  const details: string[] = [];
  
  let clientMsg = await engine.generateClientMessage(business);
  
  for (let i = 0; i < messagesCount; i++) {
    // Cliente fala
    console.log(`👤 [${i*2+1}] ${business.owner}: ${clientMsg}`);
    
    // Agente responde
    const agentResponse = await engine.generateAgentResponse(clientMsg);
    
    // Extrair mídias para log
    const mediaMatches = agentResponse.match(/\[ENVIAR_MIDIA:[A-Z_]+\]/g) || [];
    const cleanResponse = agentResponse.replace(/\[ENVIAR_MIDIA:[A-Z_]+\]/g, '').replace(/\[AÇÃO:[^\]]+\]/g, '').trim();
    
    console.log(`🤖 [${i*2+2}] Rodrigo: ${cleanResponse.substring(0, 150)}...`);
    if (mediaMatches.length > 0) {
      console.log(`   📁 Mídias: ${mediaMatches.join(", ")}`);
    }
    
    // Validar
    const validation = validateResponse(agentResponse, engine.getAgentResponses().slice(0, -1), null);
    errors.push(...validation);
    
    if (validation.length > 0) {
      for (const err of validation) {
        const icon = err.type === "error" ? "❌" : "⚠️";
        console.log(`   ${icon} ${err.message}`);
        details.push(`Msg ${i*2+2}: ${err.message}`);
      }
    }
    
    // Próxima mensagem do cliente
    if (i < messagesCount - 1) {
      clientMsg = await engine.generateClientMessage(business, agentResponse);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  const errorCount = errors.filter(e => e.type === "error").length;
  const warningCount = errors.filter(e => e.type === "warning").length;
  const score = Math.max(0, 100 - errorCount * 10 - warningCount * 3);
  
  return {
    business,
    totalMessages: messagesCount * 2,
    errors: errorCount,
    warnings: warningCount,
    score,
    details
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main(): Promise<void> {
  console.log("╔══════════════════════════════════════════════════════════════════╗");
  console.log("║   TESTE PROFUNDO MULTI-NEGÓCIOS - IA vs IA                       ║");
  console.log("║   10 tipos de negócios • 20 mensagens cada • Validação rigorosa  ║");
  console.log("╚══════════════════════════════════════════════════════════════════╝\n");
  
  const results: TestResult[] = [];
  
  for (const business of BUSINESS_PROFILES) {
    try {
      const result = await testBusiness(business, 10); // 10 interações = 20 mensagens
      results.push(result);
      
      console.log(`\n📊 Score ${business.name}: ${result.score}/100`);
      console.log(`   ❌ Erros: ${result.errors} | ⚠️ Avisos: ${result.warnings}`);
      
    } catch (error) {
      console.error(`❌ Erro testando ${business.name}:`, error);
    }
    
    // Intervalo entre negócios
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Relatório final
  console.log("\n" + "═".repeat(70));
  console.log("📊 RELATÓRIO FINAL");
  console.log("═".repeat(70) + "\n");
  
  let totalScore = 0;
  let totalErrors = 0;
  let totalWarnings = 0;
  
  console.log("| Negócio | Score | Erros | Avisos |");
  console.log("|---------|-------|-------|--------|");
  
  for (const result of results) {
    console.log(`| ${result.business.name.padEnd(20)} | ${result.score.toString().padStart(3)}/100 | ${result.errors.toString().padStart(5)} | ${result.warnings.toString().padStart(6)} |`);
    totalScore += result.score;
    totalErrors += result.errors;
    totalWarnings += result.warnings;
  }
  
  const avgScore = Math.round(totalScore / results.length);
  
  console.log("|---------|-------|-------|--------|");
  console.log(`| MÉDIA   | ${avgScore.toString().padStart(3)}/100 | ${totalErrors.toString().padStart(5)} | ${totalWarnings.toString().padStart(6)} |`);
  
  console.log("\n" + "═".repeat(70));
  
  if (avgScore >= 90) {
    console.log("✅ EXCELENTE! Sistema funcionando muito bem!");
  } else if (avgScore >= 70) {
    console.log("⚠️ BOM, mas precisa de ajustes.");
  } else if (avgScore >= 50) {
    console.log("🔴 REGULAR - precisa de melhorias significativas.");
  } else {
    console.log("🔴 CRÍTICO - revisão urgente necessária!");
  }
  
  // Detalhes dos erros mais comuns
  if (totalErrors > 0 || totalWarnings > 0) {
    console.log("\n📋 PROBLEMAS MAIS COMUNS:");
    
    const allDetails = results.flatMap(r => r.details);
    const problemCounts = new Map<string, number>();
    
    for (const detail of allDetails) {
      const key = detail.includes("REPETIÇÃO") ? "REPETIÇÃO" :
                  detail.includes("mídia") ? "MÍDIA NÃO ENVIADA" :
                  detail.includes("longa") ? "RESPOSTA LONGA" :
                  detail.includes("curta") ? "RESPOSTA CURTA" : detail;
      problemCounts.set(key, (problemCounts.get(key) || 0) + 1);
    }
    
    const sorted = [...problemCounts.entries()].sort((a, b) => b[1] - a[1]);
    for (const [problem, count] of sorted.slice(0, 5)) {
      console.log(`   • ${problem}: ${count}x`);
    }
  }
  
  console.log("\n" + "═".repeat(70) + "\n");
}

main().catch(console.error);
