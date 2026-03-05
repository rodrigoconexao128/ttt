/**
 * 🧪 TESTE REAL: IA vs IA
 * 
 * Duas IAs conversando de verdade:
 * - RODRIGO (nosso agente vendedor) - deve convencer, persuadir, usar técnicas
 * - CLIENTE (simula pessoa real) - tem dúvidas, objeções, resistência
 * 
 * O cliente NÃO vem pronto! Ele precisa ser convencido!
 * 
 * ANÁLISE é feita DEPOIS da conversa, não durante!
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
// QUAL NEGÓCIO TESTAR AGORA (MUDE AQUI PARA TESTAR OUTROS)
// ============================================================================

const CURRENT_TEST = {
  id: "loja-roupas-resistente",
  businessType: "Loja de Roupas",
  businessName: "Moda Bella",
  
  // Persona do cliente (como ele se comporta)
  clientPersona: `Você é a Fernanda, 38 anos, dona de uma loja de roupas femininas.
  
VOCÊ É MUITO RESISTENTE E DESCONFIADA!
Você viu um anúncio e quer entender, mas tem MUITAS OBJEÇÕES.

SEU COMPORTAMENTO (seja BEM resistente!):
- Você diz "vou pensar" várias vezes
- Você acha CARO (R$ 99 é muito pra você)
- Você não acredita que um robô consegue vender roupa
- Você pergunta "E se meu cliente não gostar?"
- Você quer MUITAS provas antes de aceitar
- Use frases como "não sei não...", "será que funciona mesmo?", "acho melhor eu pensar"

SEU NEGÓCIO (só conta se perguntarem):
- Loja Moda Bella
- Roupas femininas P ao GG
- Problema: não consegue responder todas as clientes que mandam mensagem

COMO VOCÊ COMEÇA A CONVERSA:
"Oi, vi seu anúncio de robô pro WhatsApp. Mas não sei não... como é que um robô vai conseguir vender roupa? Minha cliente precisa de opinião, ajuda pra escolher tamanho..."
  
SEJA MUITO DIFÍCIL DE CONVENCER!
- Questione TUDO
- Diga "vou pensar" pelo menos 2 vezes
- Reclame do preço
- Mostre ceticismo

SÓ ACEITE CRIAR CONTA SE:
1. O vendedor for MUITO convincente
2. Mostrar exemplos específicos de loja de roupa
3. Você realmente sentir que vale a pena

FORMATO: Respostas curtas (1-2 linhas), céticas, com dúvidas`,

  // Critérios de avaliação (usados na análise DEPOIS)
  evaluationCriteria: [
    "Rodrigo entendeu que vender roupa é diferente?",
    "Rodrigo lidou bem com 'vou pensar'?",
    "Rodrigo lidou bem com objeção de preço?",
    "Rodrigo mostrou exemplos específicos de loja de roupa?",
    "Rodrigo usou psicologia reversa quando necessário?",
    "Rodrigo foi paciente e não desistiu?",
    "Rodrigo não foi repetitivo?",
    "Rodrigo conseguiu criar a conta de teste?",
    "A conversa fluiu mesmo com cliente difícil?",
    "O cliente foi convencido de forma genuína?"
  ]
};

// ============================================================================
// PROMPT DO RODRIGO (NOSSO AGENTE VENDEDOR)
// ============================================================================

const RODRIGO_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨 CONTEXTO: Você está conversando com um potencial cliente que viu seu anúncio.
Ele NÃO SABE como funciona, tem dúvidas e precisa ser CONVENCIDO!

═══════════════════════════════════════════════════════════════════════════════
🎯 SEU OBJETIVO: CONVENCER O CLIENTE A TESTAR A AGENTEZAP
═══════════════════════════════════════════════════════════════════════════════

VOCÊ VENDE: AgenteZap - Sistema de IA que atende clientes no WhatsApp 24h
PREÇO: R$ 99/mês (7 dias grátis para testar)

═══════════════════════════════════════════════════════════════════════════════
🚫 ANTI-REPETIÇÃO: REGRA #1 MAIS IMPORTANTE!
═══════════════════════════════════════════════════════════════════════════════

⚠️⚠️⚠️ SE VOCÊ REPETIR A MESMA FRASE, VOCÊ PERDE! ⚠️⚠️⚠️

NUNCA USE MAIS DE 1x NA CONVERSA INTEIRA:
❌ "E lembra que o teste é grátis por 7 dias"
❌ "Quanto você perde por mês com clientes que não responde"
❌ "O que acha?"
❌ "Você pode ver se funciona no seu negócio"

SE CLIENTE REPETE A MESMA OBJEÇÃO 2x:
→ NÃO explique de novo!
→ USE PSICOLOGIA REVERSA:
  "Olha, se você acha que seu negócio tá bom assim, talvez não seja pra você..."
  "Será que você realmente precisa de mais clientes?"
→ OU CRIE A CONTA DE TESTE DIRETAMENTE:
  "A melhor forma de tirar suas dúvidas é testando. Vou criar seu acesso agora!"
  [AÇÃO:CRIAR_CONTA_TESTE]

═══════════════════════════════════════════════════════════════════════════════
🧠 PSICOLOGIA REVERSA (USE COM CLIENTE RESISTENTE!)
═══════════════════════════════════════════════════════════════════════════════

Quando cliente diz "vou pensar" ou mostra resistência:

OPÇÃO 1 - REVERSA:
"Olha, talvez o AgenteZap não seja pra todo mundo mesmo... Você precisa estar pronta pra crescer. Se você acha que tá bom assim, tudo bem!"

OPÇÃO 2 - DESAFIO:
"Interessante que você diz isso, porque sua concorrente da rua de baixo começou a usar semana passada e tá vendendo de madrugada..."

OPÇÃO 3 - ESCASSEZ:
"Tudo bem, mas a oferta de 7 dias grátis não vai durar pra sempre. Depois vai ser só teste pago."

OPÇÃO 4 - FECHAMENTO DIRETO:
"Olha, você já repetiu 'vou pensar' algumas vezes. O melhor jeito de decidir é testando na prática. Vou criar seu acesso agora, tá?"
[AÇÃO:CRIAR_CONTA_TESTE]

═══════════════════════════════════════════════════════════════════════════════
🎯 REGRA DE OURO: MÁXIMO 10 MENSAGENS!
═══════════════════════════════════════════════════════════════════════════════

Após a mensagem 5, você DEVE:
- Usar psicologia reversa OU
- Criar conta de teste diretamente

NÃO fique explicando infinitamente!

═══════════════════════════════════════════════════════════════════════════════
💬 TÉCNICAS DE VENDAS:
═══════════════════════════════════════════════════════════════════════════════

1. SPIN SELLING: Pergunte situação → problema → implicação → necessidade
2. VALOR vs CUSTO: "R$ 99 é menos que 1 venda perdida por semana"
3. STORYTELLING: "Teve um cliente meu que..." (conte só 1 história!)
4. GATILHOS: Escassez, urgência, prova social

═══════════════════════════════════════════════════════════════════════════════
💬 COMO VOCÊ FALA:
═══════════════════════════════════════════════════════════════════════════════

- Informal mas profissional (vc, tá, pra)
- Empático e caloroso
- NÃO seja robótico ou repetitivo
- Emojis com moderação (2-3 por mensagem)
- Respostas de 3-6 linhas

AÇÕES:
[AÇÃO:CRIAR_CONTA_TESTE] - Use quando cliente aceitar OU quando cliente repetir mesma objeção!
[ENVIAR_MIDIA:VIDEO_DEMONSTRACAO] - Máximo 1x na conversa!`;

// ============================================================================
// FUNÇÕES
// ============================================================================

async function callMistral(systemPrompt: string, messages: any[], temperature: number = 0.9): Promise<string> {
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
// CONVERSA IA vs IA
// ============================================================================

async function runConversation(): Promise<{
  conversation: Array<{role: string, content: string, speaker: string}>;
  accountCreated: boolean;
  totalMessages: number;
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 TESTE IA vs IA: ${CURRENT_TEST.businessName}`);
  console.log(`📋 Tipo: ${CURRENT_TEST.businessType}`);
  console.log(`${"═".repeat(70)}\n`);
  
  const conversation: Array<{role: string, content: string, speaker: string}> = [];
  let accountCreated = false;
  
  // Histórico para cada IA (perspectivas diferentes)
  const rodrigoHistory: Array<{role: string, content: string}> = [];
  const clientHistory: Array<{role: string, content: string}> = [];
  
  // Cliente começa a conversa
  const clientFirstMessage = await callMistral(
    CURRENT_TEST.clientPersona + "\n\nAGORA: Mande sua PRIMEIRA mensagem para o vendedor. Seja curta e vaga.",
    [],
    0.95
  );
  
  conversation.push({ role: "user", content: clientFirstMessage, speaker: "Cliente" });
  rodrigoHistory.push({ role: "user", content: clientFirstMessage });
  clientHistory.push({ role: "assistant", content: clientFirstMessage });
  
  console.log(`👤 CLIENTE: ${clientFirstMessage}\n`);
  
  // Loop de conversa (máximo 15 turnos)
  const MAX_TURNS = 15;
  
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // RODRIGO responde
    const rodrigoResponse = await callMistral(RODRIGO_PROMPT, rodrigoHistory, 0.85);
    
    conversation.push({ role: "assistant", content: rodrigoResponse, speaker: "Rodrigo" });
    rodrigoHistory.push({ role: "assistant", content: rodrigoResponse });
    clientHistory.push({ role: "user", content: rodrigoResponse });
    
    console.log(`🤖 RODRIGO: ${rodrigoResponse}\n`);
    
    // Verificar se criou conta
    if (rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      accountCreated = true;
      console.log(`   ✅ CONTA DE TESTE CRIADA!\n`);
    }
    
    // Se criou conta, cliente dá última resposta e termina
    if (accountCreated) {
      const clientFinal = await callMistral(
        CURRENT_TEST.clientPersona + "\n\nO vendedor acabou de criar sua conta de teste. Responda agradecendo ou comentando.",
        clientHistory,
        0.9
      );
      
      conversation.push({ role: "user", content: clientFinal, speaker: "Cliente" });
      console.log(`👤 CLIENTE: ${clientFinal}\n`);
      break;
    }
    
    // CLIENTE responde
    const clientResponse = await callMistral(
      CURRENT_TEST.clientPersona + "\n\nContinue a conversa. Lembre-se: você tem dúvidas e precisa ser convencido!",
      clientHistory,
      0.95
    );
    
    conversation.push({ role: "user", content: clientResponse, speaker: "Cliente" });
    rodrigoHistory.push({ role: "user", content: clientResponse });
    clientHistory.push({ role: "assistant", content: clientResponse });
    
    console.log(`👤 CLIENTE: ${clientResponse}\n`);
    
    // Pequena pausa para não sobrecarregar API
    await new Promise(r => setTimeout(r, 800));
  }
  
  return {
    conversation,
    accountCreated,
    totalMessages: conversation.length
  };
}

// ============================================================================
// ANÁLISE DA CONVERSA (DEPOIS)
// ============================================================================

async function analyzeConversation(conversation: Array<{role: string, content: string, speaker: string}>, accountCreated: boolean): Promise<{
  score: number;
  analysis: string;
  strengths: string[];
  weaknesses: string[];
  suggestions: string[];
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 ANÁLISE DA CONVERSA`);
  console.log(`${"═".repeat(70)}\n`);
  
  // Montar conversa como texto
  const conversationText = conversation.map(m => 
    `[${m.speaker}]: ${m.content}`
  ).join("\n\n");
  
  // Usar IA para analisar
  const analysisPrompt = `Você é um especialista em vendas e atendimento ao cliente.
Analise esta conversa de vendas e dê uma nota de 0 a 100.

CRITÉRIOS DE AVALIAÇÃO:
${CURRENT_TEST.evaluationCriteria.map((c, i) => `${i+1}. ${c}`).join("\n")}

CONVERSA:
${conversationText}

RESULTADO FINAL: ${accountCreated ? "Cliente ACEITOU criar conta de teste" : "Cliente NÃO criou conta"}

RESPONDA NO FORMATO:
NOTA: [0-100]
PONTOS FORTES:
- [lista]
PONTOS FRACOS:
- [lista]
SUGESTÕES DE MELHORIA:
- [lista]
ANÁLISE GERAL:
[texto explicando a nota]`;

  const analysisResponse = await callMistral(analysisPrompt, [], 0.3);
  
  // Extrair nota
  const scoreMatch = analysisResponse.match(/NOTA:\s*(\d+)/i);
  const score = scoreMatch ? parseInt(scoreMatch[1]) : 50;
  
  // Extrair pontos fortes
  const strengthsMatch = analysisResponse.match(/PONTOS FORTES:([\s\S]*?)(?=PONTOS FRACOS:|$)/i);
  const strengths = strengthsMatch 
    ? strengthsMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace("-", "").trim())
    : [];
  
  // Extrair pontos fracos
  const weaknessesMatch = analysisResponse.match(/PONTOS FRACOS:([\s\S]*?)(?=SUGESTÕES|$)/i);
  const weaknesses = weaknessesMatch
    ? weaknessesMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace("-", "").trim())
    : [];
  
  // Extrair sugestões
  const suggestionsMatch = analysisResponse.match(/SUGESTÕES[^:]*:([\s\S]*?)(?=ANÁLISE GERAL:|$)/i);
  const suggestions = suggestionsMatch
    ? suggestionsMatch[1].split("\n").filter(l => l.trim().startsWith("-")).map(l => l.replace("-", "").trim())
    : [];
  
  // Mostrar análise
  console.log(`📈 NOTA: ${score}/100 ${score >= 80 ? "✅" : score >= 60 ? "⚠️" : "❌"}\n`);
  
  if (strengths.length > 0) {
    console.log(`💪 PONTOS FORTES:`);
    strengths.forEach(s => console.log(`   ✓ ${s}`));
    console.log();
  }
  
  if (weaknesses.length > 0) {
    console.log(`⚠️ PONTOS FRACOS:`);
    weaknesses.forEach(w => console.log(`   ✗ ${w}`));
    console.log();
  }
  
  if (suggestions.length > 0) {
    console.log(`💡 SUGESTÕES DE MELHORIA:`);
    suggestions.forEach(s => console.log(`   → ${s}`));
    console.log();
  }
  
  return {
    score,
    analysis: analysisResponse,
    strengths,
    weaknesses,
    suggestions
  };
}

// ============================================================================
// SALVAR LOG
// ============================================================================

function saveLog(conversation: any[], analysis: any, accountCreated: boolean): string {
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `ia-vs-ia-${CURRENT_TEST.id}-${timestamp}`;
  
  // Salvar JSON
  const jsonFile = join(logsDir, `${filename}.json`);
  writeFileSync(jsonFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    test: CURRENT_TEST,
    conversation,
    accountCreated,
    analysis
  }, null, 2));
  
  // Salvar TXT legível
  const txtFile = join(logsDir, `${filename}.txt`);
  let txt = `
════════════════════════════════════════════════════════════════════════════════
TESTE IA vs IA: ${CURRENT_TEST.businessName} (${CURRENT_TEST.businessType})
Data: ${new Date().toLocaleString('pt-BR')}
════════════════════════════════════════════════════════════════════════════════

CONVERSA:
────────────────────────────────────────────────────────────────────────────────
`;
  
  for (const msg of conversation) {
    txt += `\n[${msg.speaker.toUpperCase()}]\n${msg.content}\n`;
  }
  
  txt += `
────────────────────────────────────────────────────────────────────────────────
RESULTADO: ${accountCreated ? "✅ CONTA CRIADA" : "❌ CONTA NÃO CRIADA"}
NOTA: ${analysis.score}/100

PONTOS FORTES:
${analysis.strengths.map((s: string) => `  ✓ ${s}`).join("\n")}

PONTOS FRACOS:
${analysis.weaknesses.map((w: string) => `  ✗ ${w}`).join("\n")}

SUGESTÕES:
${analysis.suggestions.map((s: string) => `  → ${s}`).join("\n")}
`;
  
  writeFileSync(txtFile, txt);
  
  console.log(`\n📁 Logs salvos:`);
  console.log(`   ${jsonFile}`);
  console.log(`   ${txtFile}`);
  
  return txtFile;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE REAL: IA vs IA                                             ║`);
  console.log(`║   Rodrigo (vendedor) vs Cliente (com dúvidas e objeções)           ║`);
  console.log(`╚${"═".repeat(68)}╝`);
  
  // 1. Executar conversa
  const { conversation, accountCreated, totalMessages } = await runConversation();
  
  // 2. Analisar conversa
  const analysis = await analyzeConversation(conversation, accountCreated);
  
  // 3. Salvar log
  saveLog(conversation, analysis, accountCreated);
  
  // 4. Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}`);
  console.log(`🏪 Negócio: ${CURRENT_TEST.businessName} (${CURRENT_TEST.businessType})`);
  console.log(`💬 Total de mensagens: ${totalMessages}`);
  console.log(`📦 Conta criada: ${accountCreated ? "✅ SIM" : "❌ NÃO"}`);
  console.log(`📈 Nota final: ${analysis.score}/100`);
  console.log(`\n${analysis.score >= 80 ? "🎉 APROVADO!" : analysis.score >= 60 ? "⚠️ PRECISA MELHORAR" : "❌ REPROVADO"}`);
  
  if (analysis.score < 100) {
    console.log(`\n💡 PRÓXIMO PASSO: Ajustar o prompt do Rodrigo baseado nas sugestões acima.`);
  }
}

main().catch(console.error);
