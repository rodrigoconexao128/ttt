/**
 * 🧪 TESTE FINAL COMPLETO - MÚLTIPLOS NEGÓCIOS
 * 
 * Testa o fluxo COMPLETO para vários tipos de negócio:
 * 1. Onboarding com Rodrigo
 * 2. Criação de conta
 * 3. Teste do agente no simulador
 * 
 * Gera logs detalhados de cada conversa!
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

// ============================================================================
// NEGÓCIOS PARA TESTAR
// ============================================================================

const BUSINESSES = [
  {
    id: "hotmart-curso",
    name: "Curso de Receitas Fit",
    type: "Infoprodutor Hotmart",
    owner: "Juliana",
    firstMessage: "Oi! Tenho um curso de receitas fitness no Hotmart, R$ 197, 47 receitas com bônus. Empresa: Fit Receitas by Ju, agente: Bia. Quero 24h de atendimento!",
    agentInstructions: "Curso R$ 197, 47 receitas fitness, garantia 7 dias, entrega imediata por email, bônus cardápio semanal",
    testQuestions: [
      "Quanto custa o curso?",
      "Tem garantia?",
      "Aceita PIX?"
    ]
  },
  {
    id: "restaurante",
    name: "Restaurante Sabor do Bairro",
    type: "Restaurante/Delivery",
    owner: "Carlos",
    firstMessage: "Oi, tenho um restaurante aqui no bairro, prato do dia R$ 18, delivery grátis acima de R$ 30. Preciso de ajuda pra responder pedidos 24h!",
    agentInstructions: "Restaurante Sabor do Bairro, prato do dia R$ 18, delivery grátis acima de R$ 30, aberto 11h às 22h, aceita PIX e cartão",
    testQuestions: [
      "Qual o prato de hoje?",
      "Vocês fazem delivery?",
      "Até que horas vocês ficam abertos?"
    ]
  },
  {
    id: "afiliado",
    name: "Afiliado Drop Expert",
    type: "Afiliado Hotmart",
    owner: "Pedro",
    firstMessage: "E aí! Sou afiliado de um curso de dropshipping, R$ 297. Empresa: Drop Expert, agente: Carol. Preciso de IA pra converter leads!",
    agentInstructions: "Curso Dropshipping Passo a Passo, R$ 297, aprenda a vender sem estoque, suporte por WhatsApp, garantia 7 dias",
    testQuestions: [
      "Como funciona o curso?",
      "Posso parcelar?",
      "Funciona mesmo?"
    ]
  },
  {
    id: "loja-roupas",
    name: "Moda Bella",
    type: "Loja de Roupas",
    owner: "Ana",
    firstMessage: "Oi, tenho uma loja de roupas femininas, P ao GG. Empresa: Moda Bella, agente: Luana. Entrega 3-5 dias, aceito PIX e cartão.",
    agentInstructions: "Loja Moda Bella, roupas femininas P ao GG, entrega 3-5 dias, PIX e cartão, trocas em até 7 dias",
    testQuestions: [
      "Quais tamanhos vocês têm?",
      "Quanto tempo pra entregar?",
      "Posso trocar se não servir?"
    ]
  },
  {
    id: "clinica-estetica",
    name: "Clínica Bela Vida",
    type: "Clínica Estética",
    owner: "Dra. Mariana",
    firstMessage: "Olá! Sou a Dra. Mariana da Clínica Bela Vida. Fazemos botox, preenchimento, limpeza de pele. Preciso de agente pra agendar consultas!",
    agentInstructions: "Clínica Bela Vida, botox a partir de R$ 800, preenchimento R$ 1.200, limpeza de pele R$ 150, agendamentos seg-sex 9h-18h",
    testQuestions: [
      "Quanto custa botox?",
      "Vocês fazem preenchimento?",
      "Como faço pra agendar?"
    ]
  }
];

// ============================================================================
// FUNÇÕES
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
// PROMPTS
// ============================================================================

const RODRIGO_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨🚨🚨 REGRAS ABSOLUTAS 🚨🚨🚨

1. VOCÊ VENDE A AGENTEZAP, NÃO os produtos do cliente!
2. NÃO diga "Recebi seu áudio" se o cliente NÃO mandou áudio!
3. SEMPRE use [AÇÃO:CRIAR_CONTA_TESTE] quando criar conta!
4. SE cliente já deu nome + o que faz → CRIE A CONTA JÁ!

FLUXO RÁPIDO:
- Cliente chega com infos completas → [AÇÃO:CRIAR_CONTA_TESTE] imediato!
- Cliente precisa de mais infos → Pergunte TUDO DE UMA VEZ:
  "Me manda: nome da empresa, nome do agente, e o que ele precisa saber!"

RESPOSTA AO CRIAR CONTA:
"Show! Já tenho tudo! 🚀

[AÇÃO:CRIAR_CONTA_TESTE]

Você vai receber um link com SIMULADOR de WhatsApp!
Lá você conversa com SEU agente e vê como ele responde.
Testa e me fala! 📱"

AÇÕES: [AÇÃO:CRIAR_CONTA_TESTE]`;

function getAgentPrompt(business: typeof BUSINESSES[0]): string {
  return `Você é um assistente virtual do ${business.name}.

INFORMAÇÕES:
${business.agentInstructions}

REGRAS:
- Seja simpático e prestativo
- Responda sobre os produtos/serviços
- Use linguagem informal (vc, tá, pra)
- Respostas curtas (2-4 linhas)`;
}

// ============================================================================
// TESTAR UM NEGÓCIO COMPLETO
// ============================================================================

async function testBusiness(business: typeof BUSINESSES[0]): Promise<{
  success: boolean;
  onboardingScore: number;
  agentScore: number;
  onboardingMessages: number;
  agentMessages: number;
  accountCreated: boolean;
  issues: string[];
  logs: any;
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 TESTANDO: ${business.name} (${business.type})`);
  console.log(`${"═".repeat(70)}`);
  
  const issues: string[] = [];
  let accountCreated = false;
  let onboardingScore = 100;
  let agentScore = 100;
  
  // =========================================================================
  // FASE 1: ONBOARDING
  // =========================================================================
  
  console.log(`\n📱 FASE 1: Onboarding com Rodrigo`);
  console.log(`${"─".repeat(50)}`);
  
  const onboardingHistory: any[] = [];
  
  // Primeira mensagem do cliente
  onboardingHistory.push({ role: "user", content: business.firstMessage });
  console.log(`👤 ${business.owner}: ${business.firstMessage.substring(0, 80)}...`);
  
  // Loop de conversa
  for (let round = 0; round < 6; round++) {
    const rodrigoResponse = await callMistral(
      RODRIGO_PROMPT,
      onboardingHistory,
      0.8
    );
    
    onboardingHistory.push({ role: "assistant", content: rodrigoResponse });
    console.log(`🤖 Rodrigo: ${rodrigoResponse.substring(0, 100)}...`);
    
    if (rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      accountCreated = true;
      console.log(`   ✅ CONTA CRIADA!`);
      
      // Cliente agradece
      onboardingHistory.push({ role: "user", content: "Oba, recebi! Vou testar! 🚀" });
      break;
    }
    
    // Se não criou conta ainda, cliente responde
    if (round < 5) {
      const clientResponse = "Ah sim, as infos são essas mesmo que eu mandei! Pode criar?";
      onboardingHistory.push({ role: "user", content: clientResponse });
      console.log(`👤 ${business.owner}: ${clientResponse}`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Avaliar onboarding
  if (!accountCreated) {
    issues.push("Não criou conta de teste");
    onboardingScore -= 50;
  }
  if (onboardingHistory.length > 6) {
    issues.push("Demorou muito para criar conta");
    onboardingScore -= 20;
  }
  
  // =========================================================================
  // FASE 2: TESTE DO AGENTE
  // =========================================================================
  
  if (!accountCreated) {
    console.log(`\n⚠️ Pulando teste do agente (conta não criada)`);
    return {
      success: false,
      onboardingScore,
      agentScore: 0,
      onboardingMessages: onboardingHistory.length,
      agentMessages: 0,
      accountCreated,
      issues,
      logs: { onboarding: onboardingHistory, agent: [] }
    };
  }
  
  console.log(`\n📱 FASE 2: Testando o agente no simulador`);
  console.log(`${"─".repeat(50)}`);
  
  const agentHistory: any[] = [];
  
  for (const question of business.testQuestions) {
    agentHistory.push({ role: "user", content: question });
    console.log(`👤 Cliente: ${question}`);
    
    const agentResponse = await callMistral(
      getAgentPrompt(business),
      agentHistory,
      0.7
    );
    
    agentHistory.push({ role: "assistant", content: agentResponse });
    console.log(`🤖 Agente: ${agentResponse.substring(0, 80)}...`);
    
    // Verificar qualidade da resposta
    if (agentResponse.length < 20) {
      issues.push(`Resposta muito curta para: "${question}"`);
      agentScore -= 10;
    }
    
    await new Promise(r => setTimeout(r, 400));
  }
  
  // =========================================================================
  // RESULTADO
  // =========================================================================
  
  const success = accountCreated && onboardingScore >= 70 && agentScore >= 70;
  
  console.log(`\n📊 Resultado: ${success ? "✅ APROVADO" : "❌ REPROVADO"}`);
  console.log(`   Onboarding: ${onboardingScore}/100 | Agente: ${agentScore}/100`);
  if (issues.length > 0) {
    console.log(`   Issues: ${issues.join(", ")}`);
  }
  
  return {
    success,
    onboardingScore,
    agentScore,
    onboardingMessages: onboardingHistory.length,
    agentMessages: agentHistory.length,
    accountCreated,
    issues,
    logs: { onboarding: onboardingHistory, agent: agentHistory }
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE FINAL COMPLETO - ${BUSINESSES.length} NEGÓCIOS                             ║`);
  console.log(`║   Onboarding + Criação de Conta + Teste do Agente                  ║`);
  console.log(`╚${"═".repeat(68)}╝`);
  
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const results: any[] = [];
  
  for (const business of BUSINESSES) {
    const result = await testBusiness(business);
    results.push({ business: business.name, ...result });
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}\n`);
  
  let approved = 0;
  let totalOnboarding = 0;
  let totalAgent = 0;
  
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(`${status} ${r.business}`);
    console.log(`   📝 Onboarding: ${r.onboardingScore}/100 (${r.onboardingMessages} msgs)`);
    console.log(`   🤖 Agente: ${r.agentScore}/100 (${r.agentMessages} msgs)`);
    console.log(`   📦 Conta criada: ${r.accountCreated ? "SIM" : "NÃO"}`);
    if (r.issues.length > 0) {
      console.log(`   ⚠️ Issues: ${r.issues.join(", ")}`);
    }
    console.log();
    
    if (r.success) approved++;
    totalOnboarding += r.onboardingScore;
    totalAgent += r.agentScore;
  }
  
  const avgOnboarding = Math.round(totalOnboarding / results.length);
  const avgAgent = Math.round(totalAgent / results.length);
  
  console.log(`${"─".repeat(70)}`);
  console.log(`🎯 APROVADOS: ${approved}/${results.length} (${Math.round(approved/results.length*100)}%)`);
  console.log(`📊 MÉDIA ONBOARDING: ${avgOnboarding}/100`);
  console.log(`📊 MÉDIA AGENTE: ${avgAgent}/100`);
  console.log(`📊 MÉDIA GERAL: ${Math.round((avgOnboarding + avgAgent) / 2)}/100`);
  
  // Salvar log
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = join(logsDir, `final-test-${timestamp}.json`);
  writeFileSync(logFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary: { approved, total: results.length, avgOnboarding, avgAgent },
    results
  }, null, 2));
  
  console.log(`\n📁 Log salvo: ${logFile}`);
}

main().catch(console.error);
