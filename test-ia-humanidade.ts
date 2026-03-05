/**
 * 🧪 TESTE DE HUMANIDADE DO ADMIN AGENT
 * 
 * Este script testa a API do Admin Agent diretamente
 * Simula diferentes cenários e verifica se as respostas são humanas
 * 
 * Usa apenas HTTP para testar o servidor rodando
 */

import 'dotenv/config';
import fetch from "node-fetch";

const API_URL = "http://localhost:5000";

interface TestResult {
  scenario: string;
  message: string;
  response: string;
  isHuman: boolean;
  issues: string[];
}

// Lista de padrões que indicam resposta robótica
const ROBOTIC_PATTERNS = [
  /recebi a imagem/i,
  /parece ser/i,
  /em qual momento/i,
  /posso te ajudar/i,
  /entendi!/i,
  /pronto!/i,
  /configurado com sucesso/i,
  /perfeito!/i,
  /certo!/i,
  /ótimo!/i,
  /\[imagem\]/i,
  /\[mídia\]/i,
  /base64/i,
];

// Lista de sinais que indicam resposta humana
const HUMAN_SIGNALS = [
  /hmm/i,
  /ahh/i,
  /bom/i,
  /olha/i,
  /então/i,
  /veja/i,
  /beleza/i,
  /show/i,
  /massa/i,
  /legal/i,
  /tranquilo/i,
  /😊|👍|😄|🙌|✨|💪/,
];

function analyzeResponse(response: string): { isHuman: boolean; issues: string[] } {
  const issues: string[] = [];
  let humanScore = 0;
  let roboticScore = 0;
  
  // Verificar padrões robóticos
  for (const pattern of ROBOTIC_PATTERNS) {
    if (pattern.test(response)) {
      issues.push(`Padrão robótico detectado: ${pattern.toString()}`);
      roboticScore++;
    }
  }
  
  // Verificar sinais humanos
  for (const pattern of HUMAN_SIGNALS) {
    if (pattern.test(response)) {
      humanScore++;
    }
  }
  
  // Verificar comprimento (respostas muito padronizadas)
  if (response.length < 10) {
    issues.push("Resposta muito curta");
  }
  
  // Verificar estrutura de template
  if (response.includes("!") && response.split("!").length > 3) {
    issues.push("Uso excessivo de exclamações (parece template)");
    roboticScore++;
  }
  
  // Verificar capitalização de início de frase típica de templates
  const sentences = response.split(/[.!?]/);
  const capitalizedSentences = sentences.filter(s => s.trim() && /^[A-Z]/.test(s.trim()));
  if (capitalizedSentences.length === sentences.filter(s => s.trim()).length && sentences.length > 2) {
    issues.push("Todas as frases começam com maiúscula (muito formal)");
  }
  
  const isHuman = humanScore >= roboticScore && issues.length < 3;
  
  return { isHuman, issues };
}

async function testAdminChat(phone: string, message: string): Promise<string> {
  try {
    const response = await fetch(`${API_URL}/api/test/admin-chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        phone,
        message,
        instanceId: "test-instance"
      })
    });
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${await response.text()}`);
    }
    
    const data = await response.json() as any;
    
    // Se não houve trigger, retorna a mensagem de aviso
    if (data.noTrigger) {
      return data.message || "Sem trigger";
    }
    
    // Retorna o texto da resposta ou mensagem
    return data.text || data.response || data.message || "(resposta vazia)";
  } catch (error: any) {
    return `ERRO: ${error.message}`;
  }
}

async function runTests() {
  console.log(`
████████████████████████████████████████████████████████████████████████
█  🧪 TESTE DE HUMANIDADE DO ADMIN AGENT
█  Verificando se as respostas são naturais e não robóticas
████████████████████████████████████████████████████████████████████████
`);

  const results: TestResult[] = [];
  const testPhone = `5511${Math.floor(Math.random() * 900000000 + 100000000)}`;
  
  // Cenários de teste - primeiro precisa do gatilho "agentezap"
  const scenarios = [
    { name: "Iniciar conversa", message: "agentezap" },
    { name: "Apresentação", message: "oi, sou o João da Pizzaria Express" },
    { name: "Interesse", message: "quero testar o sistema de atendimento" },
    { name: "Pergunta sobre preço", message: "quanto custa?" },
    { name: "Pergunta sobre funcionamento", message: "como funciona o atendimento automático?" },
    { name: "Cliente desconfiado", message: "isso não é golpe né? como sei que é seguro?" },
    { name: "Pedindo demo", message: "posso ver uma demonstração?" },
    { name: "Pergunta técnica", message: "funciona em grupo ou só conversa privada?" },
    { name: "Pergunta sobre suporte", message: "e se eu tiver problema, tem suporte?" },
    { name: "Encerrando", message: "ok vou pensar, obrigado pela atenção" },
  ];
  
  for (const scenario of scenarios) {
    console.log(`\n📝 Testando: ${scenario.name}`);
    console.log(`   Mensagem: "${scenario.message}"`);
    
    const response = await testAdminChat(testPhone, scenario.message);
    const analysis = analyzeResponse(response);
    
    console.log(`   Resposta: "${response.substring(0, 100)}${response.length > 100 ? '...' : ''}"`);
    console.log(`   ${analysis.isHuman ? '✅ HUMANO' : '❌ ROBÓTICO'}`);
    
    if (analysis.issues.length > 0) {
      console.log(`   Problemas: ${analysis.issues.join(', ')}`);
    }
    
    results.push({
      scenario: scenario.name,
      message: scenario.message,
      response,
      isHuman: analysis.isHuman,
      issues: analysis.issues
    });
    
    // Esperar um pouco entre requisições
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Resumo
  const humanCount = results.filter(r => r.isHuman).length;
  const totalCount = results.length;
  const percentage = Math.round((humanCount / totalCount) * 100);
  
  console.log(`

████████████████████████████████████████████████████████████████████████
█  📊 RESUMO DO TESTE
████████████████████████████████████████████████████████████████████████

✅ Respostas humanas: ${humanCount}/${totalCount} (${percentage}%)
❌ Respostas robóticas: ${totalCount - humanCount}/${totalCount}

${percentage >= 80 ? '🎉 APROVADO - O agente está respondendo de forma humana!' : 
  percentage >= 50 ? '⚠️ PARCIAL - Precisa de mais calibração' :
  '❌ REPROVADO - Muitas respostas robóticas detectadas'}

PROBLEMAS MAIS COMUNS:
${results
  .filter(r => !r.isHuman)
  .map(r => `  - ${r.scenario}: ${r.issues.join(', ')}`)
  .join('\n') || '  Nenhum problema detectado!'}

DICA: Use o simulador em ${API_URL}/admin-simulator para testar manualmente
`);
}

// Executar
runTests().catch(console.error);
