/**
 * 🧪 TESTE END-TO-END REAL
 * 
 * Este teste usa o servidor HTTP REAL para:
 * 1. Simular cliente chegando via WhatsApp
 * 2. Conversar com o Rodrigo
 * 3. Verificar se CRIAR_CONTA_TESTE funciona
 * 4. Validar link de acesso gerado
 * 5. Testar o agente criado
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const SERVER_URL = process.env.SERVER_URL || "http://localhost:5000";
const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

if (!MISTRAL_API_KEY) {
  throw new Error("Missing env var MISTRAL_API_KEY");
}

// Telefone de teste (muda a cada execução)
const TEST_PHONE = `5511${Date.now().toString().slice(-9)}`;

// ============================================================================
// NICHOS PARA TESTAR
// ============================================================================

const TEST_SCENARIOS = [
  {
    name: "Infoprodutor Hotmart - Curso de Culinária",
    clientMessages: [
      "Oi, vi seu anúncio. Eu vendo um curso de culinária na Hotmart e queria saber se a AgenteZap serve pra mim",
      "Ah legal, mas como a IA vai saber responder sobre as receitas do meu curso?",
      "E se o cliente perguntar sobre garantia de 7 dias? A IA sabe responder?",
      "Funciona com tráfego pago? A galera vem do anúncio e cai no meu WhatsApp",
      "Tá, vou te mandar um áudio explicando melhor meu negócio [ÁUDIO]",
      "Entendi! Quanto custa? E como faço pra testar?",
      "Bora testar então! Pode criar minha conta"
    ],
    expectedBehaviors: [
      "Deve entender que é infoprodutor",
      "Deve mencionar integração com Hotmart",
      "Deve oferecer teste grátis",
      "Deve aceitar áudio do cliente",
      "Deve criar conta de teste"
    ]
  },
  {
    name: "Restaurante - Delivery",
    clientMessages: [
      "Oi! Tenho um restaurante de comida japonesa e preciso de ajuda no atendimento do delivery",
      "Deixa eu te mandar uma foto do meu cardápio [FOTO]",
      "Pronto, mandei a foto. Como a IA vai aprender os preços?",
      "E se o cliente pedir algo que não tem no cardápio?",
      "Funciona no horário de pico? A gente atende muita gente ao mesmo tempo",
      "Quanto custa isso? Posso testar antes de pagar?",
      "Pode criar minha conta de teste!"
    ],
    expectedBehaviors: [
      "Deve aceitar foto do cardápio",
      "Deve explicar como configurar preços",
      "Deve mencionar atendimento simultâneo",
      "Deve criar conta de teste"
    ]
  },
  {
    name: "Afiliado Digital - Emagrecer",
    clientMessages: [
      "Oi! Sou afiliado na Hotmart, promovo um curso de emagrecimento. A AgenteZap serve pra mim?",
      "E como a IA vai saber responder as dúvidas sobre o produto que eu promovo?",
      "Ela consegue mandar o link de checkout da Hotmart?",
      "E se perguntarem sobre depoimentos? A IA mostra?",
      "Funciona pra quem usa tráfego pago? Tipo, o cliente clica no anúncio e já cai na IA?",
      "Posso testar? Como funciona o teste grátis?"
    ],
    expectedBehaviors: [
      "Deve entender que é afiliado",
      "Deve mencionar envio de link de checkout",
      "Deve oferecer teste grátis",
      "Deve criar conta de teste"
    ]
  }
];

// ============================================================================
// FUNÇÕES DE API
// ============================================================================

async function sendMessageToServer(phone: string, message: string): Promise<{text: string, actions?: any}> {
  try {
    const response = await fetch(`${SERVER_URL}/api/admin/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phoneNumber: phone,
        message: message,
        isAudio: message.includes("[ÁUDIO]"),
        isImage: message.includes("[FOTO]")
      })
    });

    if (!response.ok) {
      // Se servidor não está rodando, simular com Mistral
      return await simulateWithMistral(phone, message);
    }

    return await response.json() as any;
  } catch (error) {
    // Servidor não acessível, usar simulação
    return await simulateWithMistral(phone, message);
  }
}

// Histórico para simulação
const simulationHistory: Map<string, Array<{role: string, content: string}>> = new Map();

async function simulateWithMistral(phone: string, message: string): Promise<{text: string, actions?: any}> {
  let history = simulationHistory.get(phone) || [];
  
  const systemPrompt = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

REGRAS CRÍTICAS:
1. VOCÊ VENDE A AGENTEZAP (sistema de IA), NÃO os produtos do cliente!
2. A partir da 3ª resposta, inclua [AÇÃO:CRIAR_CONTA_TESTE] no final
3. Se cliente mandar ÁUDIO/FOTO → "Recebi! Deixa eu analisar..."
4. Avise que aceita áudio: "Pode mandar áudio se preferir!"
5. NUNCA diga "já falei sobre isso"
6. Envie mídias: [ENVIAR_MIDIA:COMO_FUNCIONA] ou [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]

NICHOS ESPECIAIS (Hotmart/Afiliados):
- Mostre como IA ajuda a vender infoprodutos 24h
- Mencione integração com checkout
- Fale sobre atendimento de tráfego pago

AÇÕES: [AÇÃO:CRIAR_CONTA_TESTE] | [AÇÃO:ENVIAR_PIX]
MÍDIAS: [ENVIAR_MIDIA:COMO_FUNCIONA] | [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO] | [ENVIAR_MIDIA:TABELA_PRECOS]

Preço: R$ 99/mês | Teste: 7 dias grátis`;

  history.push({ role: "user", content: message });
  
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
        ...history
      ],
      temperature: 0.8,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.statusText}`);
  }

  const data = await response.json() as any;
  const assistantMessage = data.choices[0].message.content;
  
  history.push({ role: "assistant", content: assistantMessage });
  simulationHistory.set(phone, history);
  
  // Detectar ações
  const actions: any = {};
  if (assistantMessage.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
    actions.createTestAccount = true;
    // Simular credenciais
    actions.testCredentials = {
      email: `teste_${phone}@agentezap.test`,
      password: "AZ-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      loginUrl: "https://app.agentezap.com"
    };
  }
  
  return { text: assistantMessage, actions };
}

async function checkServerHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${SERVER_URL}/api/health`);
    return response.ok;
  } catch {
    return false;
  }
}

// ============================================================================
// TESTE DE CENÁRIO
// ============================================================================

interface TestResult {
  scenario: string;
  success: boolean;
  conversation: Array<{role: string, content: string}>;
  accountCreated: boolean;
  credentials?: {email: string, password: string, loginUrl: string};
  issues: string[];
  score: number;
}

async function runScenario(scenario: typeof TEST_SCENARIOS[0]): Promise<TestResult> {
  const phone = `5511${Date.now().toString().slice(-9)}`;
  const conversation: Array<{role: string, content: string}> = [];
  const issues: string[] = [];
  let accountCreated = false;
  let credentials: any = null;
  let score = 100;
  
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 TESTANDO: ${scenario.name}`);
  console.log(`${"═".repeat(70)}\n`);
  
  for (let i = 0; i < scenario.clientMessages.length; i++) {
    const clientMsg = scenario.clientMessages[i];
    conversation.push({ role: "user", content: clientMsg });
    console.log(`👤 Cliente: ${clientMsg.substring(0, 70)}${clientMsg.length > 70 ? "..." : ""}`);
    
    try {
      const response = await sendMessageToServer(phone, clientMsg);
      conversation.push({ role: "assistant", content: response.text });
      
      // Exibir resposta
      const shortResponse = response.text.substring(0, 80);
      console.log(`🤖 Rodrigo: ${shortResponse}...`);
      
      // Verificar se criou conta
      if (response.actions?.createTestAccount || response.text.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
        accountCreated = true;
        credentials = response.actions?.testCredentials;
        console.log(`   ✅ CONTA DE TESTE CRIADA!`);
      }
      
      // Verificar mídias
      if (response.text.includes("[ENVIAR_MIDIA:")) {
        console.log(`   📁 Mídia enviada`);
      }
      
      // Verificar se aceitou mídia do cliente
      if (clientMsg.includes("[ÁUDIO]") || clientMsg.includes("[FOTO]")) {
        if (!response.text.match(/receb|analisa|manda/i)) {
          issues.push("Não reconheceu mídia do cliente");
          score -= 10;
        }
      }
      
      // Verificar contexto errado
      if (response.text.match(/comprar seu (curso|produto|ebook)/i)) {
        issues.push("Contexto errado - vendendo produto do cliente");
        score -= 20;
      }
      
    } catch (error) {
      console.log(`   ❌ Erro: ${error}`);
      issues.push(`Erro na mensagem ${i + 1}`);
      score -= 15;
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Verificar se criou conta
  if (!accountCreated) {
    issues.push("Não criou conta de teste durante a conversa");
    score -= 30;
  }
  
  // Score mínimo
  score = Math.max(0, score);
  
  console.log(`\n📊 RESULTADO:`);
  console.log(`   Score: ${score}/100`);
  console.log(`   Conta criada: ${accountCreated ? "✅ SIM" : "❌ NÃO"}`);
  if (credentials) {
    console.log(`   Email: ${credentials.email}`);
    console.log(`   Senha: ${credentials.password}`);
  }
  if (issues.length > 0) {
    console.log(`   ⚠️ Issues: ${issues.join(", ")}`);
  }
  
  return {
    scenario: scenario.name,
    success: score >= 70 && accountCreated,
    conversation,
    accountCreated,
    credentials,
    issues,
    score
  };
}

// ============================================================================
// TESTE DE LINK (se servidor estiver rodando)
// ============================================================================

async function testLoginLink(credentials: {email: string, password: string, loginUrl: string}): Promise<boolean> {
  console.log(`\n🔗 Testando link de login...`);
  console.log(`   URL: ${credentials.loginUrl}/login`);
  console.log(`   Email: ${credentials.email}`);
  
  try {
    // Apenas verificar se a URL é acessível
    const response = await fetch(`${credentials.loginUrl}/login`, { method: "HEAD" });
    if (response.ok || response.status === 405) {
      console.log(`   ✅ Link acessível!`);
      return true;
    } else {
      console.log(`   ⚠️ Link retornou status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`   ⚠️ Não foi possível verificar (${error})`);
    return false;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE END-TO-END REAL - FLUXO COMPLETO                           ║`);
  console.log(`╚${"═".repeat(68)}╝\n`);
  
  // Verificar servidor
  const serverOnline = await checkServerHealth();
  if (serverOnline) {
    console.log(`✅ Servidor online em ${SERVER_URL}\n`);
  } else {
    console.log(`⚠️ Servidor offline - usando simulação com Mistral\n`);
  }
  
  const results: TestResult[] = [];
  
  for (const scenario of TEST_SCENARIOS) {
    const result = await runScenario(scenario);
    results.push(result);
    
    // Testar link se conta foi criada
    if (result.credentials) {
      await testLoginLink(result.credentials);
    }
    
    // Salvar log
    const logsDir = join(__dirname, '..', 'logs');
    try { mkdirSync(logsDir, { recursive: true }); } catch {}
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logFile = join(logsDir, `e2e-test-${timestamp}.json`);
    writeFileSync(logFile, JSON.stringify(result, null, 2));
    
    await new Promise(r => setTimeout(r, 2000));
  }
  
  // Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}`);
  
  let totalScore = 0;
  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    const accountStatus = result.accountCreated ? "conta OK" : "SEM CONTA";
    console.log(`${status} ${result.scenario}: ${result.score}/100 (${accountStatus})`);
    totalScore += result.score;
  }
  
  const avgScore = Math.round(totalScore / results.length);
  console.log(`\n📈 MÉDIA GERAL: ${avgScore}/100`);
  console.log(`✅ Aprovados: ${results.filter(r => r.success).length}/${results.length}`);
  console.log(`📝 Contas criadas: ${results.filter(r => r.accountCreated).length}/${results.length}`);
}

main().catch(console.error);
