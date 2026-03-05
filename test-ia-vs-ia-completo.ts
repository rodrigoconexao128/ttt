/**
 * 🧪 TESTE IA vs IA COMPLETO - CALIBRAÇÃO 100% HUMANA
 * 
 * Este script testa o Admin Agent fazendo chamadas HTTP
 * Simula diferentes tipos de clientes para garantir respostas humanas
 * 
 * EXECUTE EM UM TERMINAL SEPARADO DO SERVIDOR!
 */

import 'dotenv/config';

const API_URL = "http://localhost:5000/api/test/admin-chat";
const CLEAR_URL = "http://localhost:5000/api/test/admin-chat/clear";

interface TestResult {
  scenario: string;
  messages: Array<{ role: 'user' | 'agent'; text: string }>;
  humanScore: number;
  issues: string[];
}

// Padrões que indicam resposta robótica
const ROBOTIC_PATTERNS = [
  { pattern: /recebi (a |sua )?imagem/i, desc: "Recebi a imagem" },
  { pattern: /quando devo usar/i, desc: "Quando devo usar" },
  { pattern: /responda com/i, desc: "Responda com" },
  { pattern: /deseja confirmar/i, desc: "Deseja confirmar" },
  { pattern: /configurad[oa] com sucesso/i, desc: "Configurado com sucesso" },
  { pattern: /✅.*sucesso/i, desc: "✅ sucesso" },
  { pattern: /posso te ajudar/i, desc: "Posso te ajudar" },
  { pattern: /entendi!/i, desc: "Entendi!" },
  { pattern: /pronto!/i, desc: "Pronto!" },
  { pattern: /perfeito!/i, desc: "Perfeito!" },
  { pattern: /ótimo!/i, desc: "Ótimo!" },
  { pattern: /maravilha!/i, desc: "Maravilha!" },
  { pattern: /👁️/i, desc: "Emoji de olho 👁️" },
  { pattern: /❓.*quando/i, desc: "❓ Quando..." },
  { pattern: /\[imagem\]/i, desc: "[imagem]" },
  { pattern: /gatilho desejado/i, desc: "gatilho desejado" },
];

// Sinais de resposta humana
const HUMAN_SIGNALS = [
  /^(ah|opa|oi|e aí|fala|beleza|tranquilo)/i,
  /\b(né|hein|tá|tô|pra|pro)\b/i,
  /\.\.\./,
  /😊|👍|😄|🙂|😉|haha|kk/i,
  /\b(legal|massa|show|bacana|top)\b/i,
];

function analyzeResponse(text: string): { score: number; issues: string[] } {
  const issues: string[] = [];
  let roboticCount = 0;
  let humanCount = 0;
  
  // Checar padrões robóticos
  for (const { pattern, desc } of ROBOTIC_PATTERNS) {
    if (pattern.test(text)) {
      issues.push(`🤖 "${desc}"`);
      roboticCount++;
    }
  }
  
  // Checar sinais humanos
  for (const pattern of HUMAN_SIGNALS) {
    if (pattern.test(text)) {
      humanCount++;
    }
  }
  
  // Exclamações excessivas
  const exclamations = (text.match(/!/g) || []).length;
  if (exclamations > 3) {
    issues.push(`⚠️ Muitas exclamações (${exclamations})`);
    roboticCount++;
  }
  
  // Score: mais sinais humanos e menos robóticos = melhor
  const score = Math.max(0, Math.min(100, 100 - (roboticCount * 20) + (humanCount * 10)));
  
  return { score, issues };
}

async function sendMessage(phone: string, message: string, mediaType?: string, mediaUrl?: string): Promise<string> {
  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, message, mediaType, mediaUrl })
    });
    
    if (!response.ok) {
      return `ERRO HTTP ${response.status}`;
    }
    
    const data = await response.json() as any;
    return data.text || data.message || "(vazio)";
  } catch (error: any) {
    return `ERRO: ${error.message}`;
  }
}

async function clearHistory(phone: string): Promise<void> {
  try {
    await fetch(CLEAR_URL, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone })
    });
  } catch {}
}

async function runConversation(
  scenarioName: string,
  messages: Array<{ msg: string; mediaType?: string; mediaUrl?: string }>
): Promise<TestResult> {
  const phone = `5511${Math.floor(Math.random() * 900000000 + 100000000)}`;
  await clearHistory(phone);
  
  const conversation: Array<{ role: 'user' | 'agent'; text: string }> = [];
  let totalScore = 0;
  const allIssues: string[] = [];
  
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🎭 ${scenarioName}`);
  console.log(`${'═'.repeat(70)}`);
  
  for (const { msg, mediaType, mediaUrl } of messages) {
    console.log(`\n👤 Cliente: ${msg}${mediaType ? ` [${mediaType}]` : ''}`);
    conversation.push({ role: 'user', text: msg });
    
    const response = await sendMessage(phone, msg, mediaType, mediaUrl);
    console.log(`🤖 Agente: ${response.substring(0, 150)}${response.length > 150 ? '...' : ''}`);
    conversation.push({ role: 'agent', text: response });
    
    const analysis = analyzeResponse(response);
    totalScore += analysis.score;
    
    if (analysis.issues.length > 0) {
      console.log(`   ⚠️ Problemas: ${analysis.issues.join(', ')}`);
      allIssues.push(...analysis.issues);
    } else {
      console.log(`   ✅ Resposta natural (${analysis.score}%)`);
    }
    
    await new Promise(r => setTimeout(r, 500));
  }
  
  const avgScore = Math.round(totalScore / messages.length);
  console.log(`\n📊 Score médio: ${avgScore}%`);
  
  return {
    scenario: scenarioName,
    messages: conversation,
    humanScore: avgScore,
    issues: [...new Set(allIssues)]
  };
}

// Cenários de teste
const TEST_SCENARIOS = [
  {
    name: "🍕 Cliente Direto - Pizzaria com Imagem",
    messages: [
      { msg: "agentezap" },
      { msg: "oi, tenho uma pizzaria" },
      { msg: "quero configurar meu cardápio", mediaType: "image", mediaUrl: "https://example.com/cardapio.jpg" },
      { msg: "isso, manda quando pedir cardápio" },
      { msg: "sim" },
    ]
  },
  {
    name: "🤔 Cliente Desconfiado",
    messages: [
      { msg: "agentezap" },
      { msg: "isso é golpe?" },
      { msg: "como funciona?" },
      { msg: "quanto custa?" },
      { msg: "ah tá, tenho uma loja de roupas" },
    ]
  },
  {
    name: "💰 Cliente Perguntando Preço",
    messages: [
      { msg: "agentezap" },
      { msg: "oi" },
      { msg: "quanto custa o serviço?" },
      { msg: "tem teste grátis?" },
      { msg: "sou dono de restaurante" },
    ]
  },
  {
    name: "📸 Cliente Envia Imagem Logo de Cara",
    messages: [
      { msg: "agentezap" },
      { msg: "oi", mediaType: "image", mediaUrl: "https://example.com/produto.jpg" },
      { msg: "é foto do meu produto" },
      { msg: "vendo eletrônicos" },
    ]
  },
  {
    name: "🏃 Cliente Apressado",
    messages: [
      { msg: "agentezap" },
      { msg: "preciso de algo rápido, tenho oficina mecânica" },
      { msg: "me manda o link pra testar" },
    ]
  },
  {
    name: "🧓 Cliente Confuso (Menos Tech)",
    messages: [
      { msg: "agentezap" },
      { msg: "oi não entendi muito bem" },
      { msg: "como assim atendimento automático?" },
      { msg: "funciona no zap mesmo?" },
      { msg: "tenho uma padaria" },
    ]
  },
  {
    name: "📱 Fluxo Completo com Múltiplas Imagens",
    messages: [
      { msg: "agentezap" },
      { msg: "oi, tenho salão de beleza" },
      { msg: "vou mandar foto dos serviços", mediaType: "image", mediaUrl: "https://example.com/servicos.jpg" },
      { msg: "quando perguntarem dos serviços" },
      { msg: "pode" },
      { msg: "vou mandar a tabela de preços também", mediaType: "image", mediaUrl: "https://example.com/precos.jpg" },
      { msg: "quando perguntarem preço" },
      { msg: "isso" },
    ]
  },
];

async function main() {
  console.log(`
${'█'.repeat(70)}
   🧪 TESTE IA vs IA - CALIBRAÇÃO PARA 100% HUMANO
   
   Este teste verifica se o Admin Agent responde de forma natural
   Vamos rodar ${TEST_SCENARIOS.length} cenários diferentes
${'█'.repeat(70)}
`);

  // Verificar se servidor está rodando
  try {
    await fetch("http://localhost:5000/api/health");
  } catch {
    console.error("❌ ERRO: Servidor não está rodando em http://localhost:5000");
    console.error("   Inicie o servidor em outro terminal: npm run dev");
    process.exit(1);
  }

  const results: TestResult[] = [];
  
  for (const scenario of TEST_SCENARIOS) {
    try {
      const result = await runConversation(scenario.name, scenario.messages);
      results.push(result);
    } catch (error: any) {
      console.error(`❌ Erro no cenário "${scenario.name}": ${error.message}`);
    }
    
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Resumo final
  console.log(`\n${'█'.repeat(70)}`);
  console.log(`   📊 RESUMO FINAL`);
  console.log(`${'█'.repeat(70)}\n`);
  
  let totalScore = 0;
  let passedCount = 0;
  
  for (const result of results) {
    const status = result.humanScore >= 70 ? '✅' : result.humanScore >= 50 ? '⚠️' : '❌';
    console.log(`${status} ${result.scenario}: ${result.humanScore}%`);
    
    if (result.issues.length > 0) {
      console.log(`   Problemas: ${result.issues.slice(0, 3).join(', ')}`);
    }
    
    totalScore += result.humanScore;
    if (result.humanScore >= 70) passedCount++;
  }
  
  const avgScore = Math.round(totalScore / results.length);
  
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📈 SCORE GERAL: ${avgScore}%`);
  console.log(`✅ Cenários aprovados: ${passedCount}/${results.length}`);
  console.log(`${'─'.repeat(70)}`);
  
  if (avgScore >= 80) {
    console.log(`\n🎉 EXCELENTE! O agente está respondendo de forma humana!`);
  } else if (avgScore >= 60) {
    console.log(`\n⚠️ BOM, mas precisa de ajustes. Verifique os problemas acima.`);
  } else {
    console.log(`\n❌ PRECISA MELHORAR. Muitas respostas robóticas detectadas.`);
  }
  
  console.log(`\n💡 Dica: Use o simulador em http://localhost:5000/admin-simulator para testar manualmente\n`);
}

main().catch(console.error);
