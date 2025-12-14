/**
 * 🧪 TESTE COMPLETO COM SIMULADOR DO AGENTE
 * 
 * Este teste simula o fluxo REAL completo:
 * 1. Cliente conversa com Rodrigo
 * 2. Cliente manda foto/áudio com informações
 * 3. Rodrigo cria a conta e manda o link
 * 4. Cliente acessa o SIMULADOR de WhatsApp
 * 5. Cliente testa o AGENTE DELE
 * 6. Verifica se o agente funciona bem
 * 
 * ANÁLISE INDIVIDUAL de cada negócio até ficar perfeito!
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// ============================================================================
// NEGÓCIO ATUAL PARA TESTAR (muda a cada teste)
// ============================================================================

const CURRENT_BUSINESS = {
  name: "Curso Receitas Fitness",
  type: "Infoprodutor Hotmart",
  owner: "Juliana",
  description: "Curso de 47 receitas fitness, com bônus de cardápio semanal. Preço: R$ 197. Garantia 7 dias.",
  
  // Informações que o cliente vai passar para criar o agente
  agentInfo: {
    company: "Fit Receitas by Ju",
    agentName: "Bia",
    instructions: `
- Curso de 47 receitas fitness
- Preço: R$ 197 (pode parcelar em até 12x)
- Bônus: Cardápio semanal + Lista de compras
- Garantia de 7 dias
- Entrega imediata por email
- Link de compra: hotmart.com/fitreceitasbyju
`
  },
  
  // Perguntas que clientes fazem para o AGENTE (não para o Rodrigo)
  testQuestions: [
    "Oi, quero saber mais sobre o curso de receitas",
    "Quanto custa?",
    "Tem algum desconto?",
    "Como funciona a garantia?",
    "Vocês aceitam PIX?",
    "Quais receitas vem no curso?"
  ]
};

// ============================================================================
// HISTÓRICOS
// ============================================================================

let onboardingHistory: Array<{role: string, content: string}> = [];
let agentTestHistory: Array<{role: string, content: string}> = [];

// ============================================================================
// FUNÇÕES DE API
// ============================================================================

async function callMistral(systemPrompt: string, messages: any[], temperature: number = 0.8): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: systemPrompt },
        ...messages
      ],
      temperature: temperature,
      max_tokens: 600
    })
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  return data.choices[0].message.content;
}

// ============================================================================
// PROMPT DO RODRIGO (VENDEDOR)
// ============================================================================

function getRodrigoPrompt(): string {
  return `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨 VOCÊ VENDE A AGENTEZAP (sistema de IA), NÃO os produtos do cliente!

═══════════════════════════════════════════════════════════════════════════════
⚡ SEJA RÁPIDO E HUMANO!
═══════════════════════════════════════════════════════════════════════════════

PERGUNTE TUDO DE UMA VEZ quando possível:
"Me conta rapidinho: qual seu negócio, o que vende, e pode mandar foto/áudio com as infos! 🎤📸"

Ou:
"Pra criar seu agente, me manda:
📍 Nome da empresa
🤖 Nome do agente (ex: Bia, Pedro...)  
📝 O que ele precisa saber (preços, produtos, etc)
Pode mandar tudo junto ou um áudio!"

QUANDO CLIENTE MANDAR AS INFOS:
1. Extraia as informações da resposta
2. Crie a conta: [AÇÃO:CRIAR_CONTA_TESTE]
3. Explique que ele vai receber um LINK para o SIMULADOR de WhatsApp
4. No simulador ele conversa com o AGENTE DELE

EXEMPLO DE RESPOSTA APÓS RECEBER INFOS:
"Show! Já tenho tudo! 🚀

Vou criar seu agente agora...

[AÇÃO:CRIAR_CONTA_TESTE]

No link você vai ter um SIMULADOR de WhatsApp igualzinho o real!
Lá você conversa com SEU agente e vê como ele responde.
Testa e me fala o que achou! 📱"

ACEITE MÍDIAS:
- ÁUDIO: "Recebi seu áudio! Deixa eu ouvir..."
- FOTO: "Recebi a foto! Vou usar pra configurar seu agente..."

PREÇO: R$ 99/mês | Teste: 7 dias grátis

AÇÕES:
[AÇÃO:CRIAR_CONTA_TESTE] - Criar conta e enviar link do simulador
[ENVIAR_MIDIA:COMO_FUNCIONA] | [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]`;
}

// ============================================================================
// PROMPT DO CLIENTE (conversando com Rodrigo)
// ============================================================================

function getClientPrompt(): string {
  return `Você é ${CURRENT_BUSINESS.owner}, dono(a) de ${CURRENT_BUSINESS.name} (${CURRENT_BUSINESS.type}).
${CURRENT_BUSINESS.description}

Você está conversando com o Rodrigo da AgenteZap porque quer um assistente IA para seu negócio.

SEU OBJETIVO:
1. Explicar seu negócio rapidamente
2. Passar as informações para criar o agente
3. Receber o link do simulador
4. Testar se gosta

INFORMAÇÕES DO SEU AGENTE (mande quando pedirem):
- Empresa: ${CURRENT_BUSINESS.agentInfo.company}
- Nome do agente: ${CURRENT_BUSINESS.agentInfo.agentName}
- Instruções: ${CURRENT_BUSINESS.agentInfo.instructions}

COMPORTAMENTO:
- Seja direto e objetivo
- Mande as informações quando pedirem (pode ser tudo junto!)
- Se ele pedir áudio/foto, diga que vai mandar
- Quando receber o link, agradeça e diga que vai testar

FORMATO: Respostas curtas (1-3 linhas), informais (vc, tá, pra)`;
}

// ============================================================================
// PROMPT DO AGENTE CRIADO (para testar no simulador)
// ============================================================================

function getCreatedAgentPrompt(): string {
  return `Você é ${CURRENT_BUSINESS.agentInfo.agentName}, assistente virtual da ${CURRENT_BUSINESS.agentInfo.company}.

SUAS INFORMAÇÕES:
${CURRENT_BUSINESS.agentInfo.instructions}

REGRAS:
- Seja simpático e prestativo
- Responda sobre o curso/produto
- Se não souber algo, diga que vai verificar
- Ofereça ajudar com a compra
- Use linguagem informal (vc, tá, pra)

FORMATO: Respostas curtas e naturais (2-4 linhas)`;
}

// ============================================================================
// FASE 1: ONBOARDING (Cliente -> Rodrigo)
// ============================================================================

async function runOnboarding(): Promise<{success: boolean, accountCreated: boolean, conversation: any[]}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📱 FASE 1: ONBOARDING (Cliente conversando com Rodrigo)`);
  console.log(`🏪 Negócio: ${CURRENT_BUSINESS.name} (${CURRENT_BUSINESS.type})`);
  console.log(`${"═".repeat(70)}\n`);
  
  onboardingHistory = [];
  let accountCreated = false;
  
  // Mensagem inicial do cliente
  const clientMessages = [
    `Oi Rodrigo! Vi seu anúncio. Eu sou ${CURRENT_BUSINESS.owner}, tenho um ${CURRENT_BUSINESS.type}. ${CURRENT_BUSINESS.description}`,
    null, // Resposta do Rodrigo
    "DYNAMIC", // Será gerado dinamicamente
    null,
    "DYNAMIC",
    null,
    "DYNAMIC"
  ];
  
  // Primeira mensagem do cliente
  onboardingHistory.push({ role: "user", content: clientMessages[0]! });
  console.log(`👤 ${CURRENT_BUSINESS.owner}: ${clientMessages[0]}`);
  
  for (let round = 0; round < 6; round++) {
    // Resposta do Rodrigo
    const rodrigoResponse = await callMistral(
      getRodrigoPrompt(),
      onboardingHistory.map(m => ({ role: m.role, content: m.content })),
      0.8
    );
    
    onboardingHistory.push({ role: "assistant", content: rodrigoResponse });
    
    // Exibir resposta
    console.log(`\n🤖 Rodrigo: ${rodrigoResponse.substring(0, 150)}...`);
    
    // Verificar se criou conta
    if (rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      accountCreated = true;
      console.log(`   ✅ CONTA CRIADA! Link do simulador enviado!`);
    }
    
    // Verificar mídias
    if (rodrigoResponse.includes("[ENVIAR_MIDIA:")) {
      console.log(`   📁 Mídia enviada`);
    }
    
    // Se conta foi criada, cliente agradece e vai testar
    if (accountCreated) {
      const finalResponse = "Oba, recebi o link! Vou testar agora e te falo o que achei! 🚀";
      onboardingHistory.push({ role: "user", content: finalResponse });
      console.log(`\n👤 ${CURRENT_BUSINESS.owner}: ${finalResponse}`);
      break;
    }
    
    // Gerar resposta do cliente
    const clientResponse = await callMistral(
      getClientPrompt(),
      onboardingHistory.map(m => ({ 
        role: m.role === "user" ? "assistant" : "user", // Inverter perspectiva
        content: m.content 
      })),
      0.9
    );
    
    onboardingHistory.push({ role: "user", content: clientResponse });
    console.log(`\n👤 ${CURRENT_BUSINESS.owner}: ${clientResponse}`);
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  return {
    success: accountCreated,
    accountCreated,
    conversation: onboardingHistory
  };
}

// ============================================================================
// FASE 2: TESTE DO AGENTE (Cliente -> Agente criado)
// ============================================================================

async function runAgentTest(): Promise<{success: boolean, score: number, issues: string[], conversation: any[]}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📱 FASE 2: TESTE DO AGENTE NO SIMULADOR`);
  console.log(`🤖 Agente: ${CURRENT_BUSINESS.agentInfo.agentName} (${CURRENT_BUSINESS.agentInfo.company})`);
  console.log(`${"═".repeat(70)}\n`);
  
  agentTestHistory = [];
  const issues: string[] = [];
  let score = 100;
  
  for (const question of CURRENT_BUSINESS.testQuestions) {
    // Cliente pergunta
    agentTestHistory.push({ role: "user", content: question });
    console.log(`👤 Cliente: ${question}`);
    
    // Agente responde
    const agentResponse = await callMistral(
      getCreatedAgentPrompt(),
      agentTestHistory.map(m => ({ role: m.role, content: m.content })),
      0.7
    );
    
    agentTestHistory.push({ role: "assistant", content: agentResponse });
    console.log(`🤖 ${CURRENT_BUSINESS.agentInfo.agentName}: ${agentResponse}\n`);
    
    // Análise da resposta
    const questionLower = question.toLowerCase();
    const responseLower = agentResponse.toLowerCase();
    
    // Verificar se respondeu sobre preço
    if (questionLower.includes("quanto custa") || questionLower.includes("preço")) {
      if (!responseLower.includes("197") && !responseLower.includes("r$")) {
        issues.push("Não informou o preço corretamente");
        score -= 15;
      }
    }
    
    // Verificar se respondeu sobre garantia
    if (questionLower.includes("garantia")) {
      if (!responseLower.includes("7 dias") && !responseLower.includes("7dias")) {
        issues.push("Não explicou a garantia");
        score -= 15;
      }
    }
    
    // Verificar se respondeu sobre PIX
    if (questionLower.includes("pix")) {
      if (!responseLower.includes("pix") && !responseLower.includes("pagamento")) {
        issues.push("Não respondeu sobre PIX");
        score -= 10;
      }
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Score mínimo
  score = Math.max(0, score);
  
  return {
    success: score >= 70,
    score,
    issues,
    conversation: agentTestHistory
  };
}

// ============================================================================
// ANÁLISE DETALHADA
// ============================================================================

function analyzeConversation(phase: string, conversation: any[], issues: string[]): void {
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📊 ANÁLISE: ${phase}`);
  console.log(`${"─".repeat(70)}`);
  
  // Contar métricas
  const assistantMessages = conversation.filter(m => m.role === "assistant");
  let criarContaTeste = 0;
  let mediasEnviadas = 0;
  let perguntouTudoJunto = false;
  
  for (const msg of assistantMessages) {
    if (msg.content.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) criarContaTeste++;
    if (msg.content.includes("[ENVIAR_MIDIA:")) mediasEnviadas++;
    if (msg.content.match(/nome.*(empresa|agente).*instruções/i) || 
        msg.content.match(/me manda.*tudo/i)) {
      perguntouTudoJunto = true;
    }
  }
  
  console.log(`   📝 Total de mensagens: ${conversation.length}`);
  console.log(`   🎯 CRIAR_CONTA_TESTE: ${criarContaTeste}x`);
  console.log(`   📁 Mídias enviadas: ${mediasEnviadas}x`);
  console.log(`   ⚡ Perguntou tudo junto: ${perguntouTudoJunto ? "✅ SIM" : "❌ NÃO"}`);
  
  if (issues.length > 0) {
    console.log(`   ⚠️ Problemas encontrados:`);
    issues.forEach(issue => console.log(`      - ${issue}`));
  } else {
    console.log(`   ✅ Nenhum problema encontrado!`);
  }
}

// ============================================================================
// SALVAR LOG
// ============================================================================

function saveLog(onboardingResult: any, agentTestResult: any): void {
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const businessSlug = CURRENT_BUSINESS.type.replace(/\s+/g, '-').toLowerCase();
  
  const log = {
    timestamp: new Date().toISOString(),
    business: CURRENT_BUSINESS,
    onboarding: {
      success: onboardingResult.success,
      accountCreated: onboardingResult.accountCreated,
      conversation: onboardingResult.conversation
    },
    agentTest: {
      success: agentTestResult.success,
      score: agentTestResult.score,
      issues: agentTestResult.issues,
      conversation: agentTestResult.conversation
    }
  };
  
  // Salvar JSON
  const jsonFile = join(logsDir, `full-test-${businessSlug}-${timestamp}.json`);
  writeFileSync(jsonFile, JSON.stringify(log, null, 2));
  
  // Salvar TXT legível
  const txtFile = join(logsDir, `full-test-${businessSlug}-${timestamp}.txt`);
  let txtContent = `
════════════════════════════════════════════════════════════════════════════════
TESTE COMPLETO: ${CURRENT_BUSINESS.name} (${CURRENT_BUSINESS.type})
Data: ${new Date().toLocaleString('pt-BR')}
════════════════════════════════════════════════════════════════════════════════

FASE 1 - ONBOARDING (Cliente -> Rodrigo)
────────────────────────────────────────────────────────────────────────────────
`;
  
  for (const msg of onboardingResult.conversation) {
    const sender = msg.role === "user" ? CURRENT_BUSINESS.owner : "Rodrigo";
    txtContent += `\n[${sender}]\n${msg.content}\n`;
  }
  
  txtContent += `
RESULTADO ONBOARDING:
- Conta criada: ${onboardingResult.accountCreated ? "SIM" : "NÃO"}

FASE 2 - TESTE DO AGENTE (Cliente -> ${CURRENT_BUSINESS.agentInfo.agentName})
────────────────────────────────────────────────────────────────────────────────
`;
  
  for (const msg of agentTestResult.conversation) {
    const sender = msg.role === "user" ? "Cliente" : CURRENT_BUSINESS.agentInfo.agentName;
    txtContent += `\n[${sender}]\n${msg.content}\n`;
  }
  
  txtContent += `
RESULTADO TESTE DO AGENTE:
- Score: ${agentTestResult.score}/100
- Issues: ${agentTestResult.issues.length > 0 ? agentTestResult.issues.join(", ") : "Nenhum"}
`;
  
  writeFileSync(txtFile, txtContent);
  
  console.log(`\n📁 Logs salvos:`);
  console.log(`   ${jsonFile}`);
  console.log(`   ${txtFile}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE COMPLETO COM SIMULADOR DO AGENTE                           ║`);
  console.log(`║   Onboarding → Criar Conta → Testar Agente                         ║`);
  console.log(`╚${"═".repeat(68)}╝`);
  
  // FASE 1: Onboarding
  const onboardingResult = await runOnboarding();
  
  // Análise do onboarding
  const onboardingIssues: string[] = [];
  if (!onboardingResult.accountCreated) {
    onboardingIssues.push("Não criou conta de teste");
  }
  analyzeConversation("ONBOARDING", onboardingResult.conversation, onboardingIssues);
  
  // Se não criou conta, não pode testar o agente
  if (!onboardingResult.accountCreated) {
    console.log(`\n❌ FALHA: Não foi possível criar a conta de teste!`);
    console.log(`   O teste do agente não pode ser executado.`);
    
    saveLog(onboardingResult, { success: false, score: 0, issues: ["Conta não criada"], conversation: [] });
    return;
  }
  
  // FASE 2: Testar o agente criado
  const agentTestResult = await runAgentTest();
  
  // Análise do teste do agente
  analyzeConversation("TESTE DO AGENTE", agentTestResult.conversation, agentTestResult.issues);
  
  // Salvar logs
  saveLog(onboardingResult, agentTestResult);
  
  // Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}`);
  console.log(`🏪 Negócio: ${CURRENT_BUSINESS.name}`);
  console.log(`📱 Onboarding: ${onboardingResult.success ? "✅ OK" : "❌ FALHOU"}`);
  console.log(`🤖 Teste do Agente: ${agentTestResult.success ? "✅ OK" : "❌ FALHOU"} (${agentTestResult.score}/100)`);
  console.log(`\n${agentTestResult.score >= 80 ? "🎉 APROVADO!" : "⚠️ PRECISA DE AJUSTES"}`);
}

main().catch(console.error);
