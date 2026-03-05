/**
 * 🧪 TESTE DE CALIBRAÇÃO IA vs IA - SEM ROTEIRO
 * 
 * Este teste é REAL - o cliente IA NÃO tem roteiro!
 * 
 * OBJETIVO:
 * - Calibrar o Rodrigo (vendedor) até conseguir 100% de conversão
 * - Cliente IA age naturalmente (cético, com objeções reais)
 * - SEM instruções de "aceite no final" ou "siga estes passos"
 * 
 * PROCESSO:
 * 1. Rodar 4 nichos diferentes
 * 2. Analisar quais convertem e quais não
 * 3. Identificar padrões de falha
 * 4. Ajustar prompt do Rodrigo
 * 5. Repetir até 100%
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || "";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

if (!MISTRAL_API_KEY) {
  console.error("❌ MISTRAL_API_KEY não encontrada!");
  process.exit(1);
}

// ============================================================================
// CENÁRIOS DE TESTE (COM PERSONALIDADES VARIADAS)
// ============================================================================

const BASE_SCENARIOS = [
  {
    id: "restaurante",
    owner: "Dona Rosa",
    business: "Restaurante Sabor Caseiro",
    type: "Restaurante",
    realPains: ["Não consigo responder WhatsApp no almoço", "Perco pedidos de madrugada"],
    skepticism: "Já tentei chatbot e era horrível",
    budget: "R$ 99 tá caro"
  },
  {
    id: "hotmart",
    owner: "João",
    business: "Curso de Receitas Fit",
    type: "Hotmart/Infoprodutor",
    realPains: ["Afiliados me enchem de perguntas", "Perco vendas por demora"],
    skepticism: "Não sei se IA entende de receitas fit",
    budget: "Pago R$ 300 em tráfego, tem que valer a pena"
  },
  {
    id: "loja",
    owner: "Ana",
    business: "Fashion Store",
    type: "Loja de Roupas Online",
    realPains: ["Clientes pedem fotos e medidas toda hora", "Perco vendas à noite"],
    skepticism: "Preciso mostrar fotos, IA faz isso?",
    budget: "Se vender 2 peças a mais já paga"
  },
  {
    id: "clinica",
    owner: "Dr. Paulo",
    business: "Clínica Vida",
    type: "Clínica Médica",
    realPains: ["Pacientes ligam fora do horário", "Secretária sobrecarregada"],
    skepticism: "É área de saúde, precisa ser seguro",
    budget: "Vale a pena se economizar tempo"
  }
];

const PERSONALITIES = [
  {
    type: "ENTUSIASTA",
    desc: "Adora novidade, quer começar logo, usa emojis, mas pode ser impulsivo e não ler detalhes.",
    behavior: "Mostre empolgação, faça perguntas curtas, queira ver funcionando AGORA."
  },
  {
    type: "CÉTICO/CHATO",
    desc: "Duvida de tudo, acha que é golpe, faz perguntas técnicas difíceis, não gosta de papo de vendedor.",
    behavior: "Seja seco, peça provas, pergunte 'como garante?', diga 'não acredito nisso'."
  },
  {
    type: "COMPARADOR",
    desc: "Diz que viu mais barato no concorrente, cita o ChatGPT, diz que o sobrinho faz de graça.",
    behavior: "Diga 'vi um outro por R$ 29', 'o ChatGPT faz de graça', 'meu sobrinho instala bot'."
  },
  {
    type: "BARGANHADOR",
    desc: "Quer desconto, quer teste de 30 dias, quer vantagem, diz que tá caro só pra baixar preço.",
    behavior: "Peça desconto, peça 30 dias grátis, diga 'se fizer por R$ 50 eu fecho'."
  },
  {
    type: "INDECISO",
    desc: "Tem medo de errar, diz 'vou pensar', 'preciso falar com sócio', enrola pra decidir.",
    behavior: "Diga 'vou ver com minha esposa', 'me manda por email que eu vejo', 'não sei se é hora'."
  }
];

// Gerar cenários misturando bases e personalidades
const SCENARIOS = [
  { ...BASE_SCENARIOS[0], ...PERSONALITIES[3], id: "restaurante-barganhador" }, // Restaurante + Barganhador
  { ...BASE_SCENARIOS[1], ...PERSONALITIES[0], id: "hotmart-entusiasta" },    // Hotmart + Entusiasta
  { ...BASE_SCENARIOS[2], ...PERSONALITIES[2], id: "loja-comparador" },       // Loja + Comparador
  { ...BASE_SCENARIOS[3], ...PERSONALITIES[1], id: "clinica-cetico" },        // Clínica + Cético
  { ...BASE_SCENARIOS[0], ...PERSONALITIES[4], id: "restaurante-indeciso" }   // Restaurante + Indeciso
].map(s => ({
  ...s,
  personality: `${s.desc}\nCOMPORTAMENTO: ${s.behavior}`
}));

// ============================================================================
// PROMPTS
// ============================================================================

function buildClientPrompt(scenario: typeof SCENARIOS[0]): string {
  return `Você é ${scenario.owner}, dono(a) de ${scenario.business} (${scenario.type}).
Você está conversando no WhatsApp com Rodrigo, um vendedor da AgenteZap.

SEU PERFIL:
- Dores: ${scenario.realPains.join(", ")}
- Ceticismo: "${scenario.skepticism}"
- Orçamento: ${scenario.budget}
- Personalidade: ${scenario.personality}

REGRAS DE COMPORTAMENTO:
1. AJA COMO UM CLIENTE REAL. Não seja um robô.
2. Mantenha suas respostas curtas (máximo 3 linhas).
3. Se o vendedor pedir seus dados (Nome, Nicho, Detalhes), INVENTE E FORNEÇA IMEDIATAMENTE.
4. NÃO escreva notas explicativas como "(Nota: ...)". Apenas responda.
5. Se o vendedor for convincente, aceite o teste. Se não, recuse.

Lembre-se: Você é o CLIENTE. O usuário que fala com você é o VENDEDOR.`;
}

// Prompt do Rodrigo - usar o mesmo do sistema
const RODRIGO_PROMPT_REFERENCE = `O prompt do Rodrigo está em server/adminAgentService.ts (função getMasterPrompt)`;

// ============================================================================
// FUNÇÕES DE API
// ============================================================================

async function callMistral(systemPrompt: string, messages: any[], temperature: number = 0.85): Promise<string> {
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
      temperature,
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
// BUSCAR PROMPT DO RODRIGO DO SERVIDOR
// ============================================================================

async function getRodrigoPrompt(): Promise<string> {
  // Prompt OTIMIZADO e SINCRONIZADO com adminAgentService.ts
  // Inclui correções para Loops e Falhas de Detecção de Intenção
  return `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

╔═══════════════════════════════════════════════════════════════════════════════╗
║  ⛔ REGRAS DE OURO - LEIA ANTES DE RESPONDER ⛔                               ║
╠═══════════════════════════════════════════════════════════════════════════════╣
║ 1. DETECÇÃO DE COMPRA (CRÍTICO):                                              ║
║    Se o cliente disser: "manda o link", "quero testar", "como começo",        ║
║    "tá bom", "ok", "pode ser", "vamos lá" OU concordar de qualquer forma:     ║
║    👉 VERIFIQUE SE JÁ TEM: 1. Nome do Negócio, 2. Nicho, 3. Detalhes.         ║
║    👉 SE TEM TUDO: USE [AÇÃO:CRIAR_CONTA_TESTE] IMEDIATAMENTE!                ║
║    👉 SE FALTA QUALQUER UM: NÃO CRIE AINDA! PEÇA OS DADOS FALTANTES!          ║
║                                                                               ║
║ 2. ANTI-LOOPING (OBJEÇÕES E PERGUNTAS REPETIDAS):                             ║
║    Se o cliente repetir a MESMA objeção ou fizer perguntas em série (trolling):║
║    👉 NÃO RESPONDA MAIS PERGUNTAS! Diga: "Para te responder melhor, vamos     ║
║       testar na prática?" e USE [AÇÃO:CRIAR_CONTA_TESTE] (se tiver dados).    ║
║    👉 Se ele insistir em algo fora do escopo (ex: Google, Email), ENCERRE.    ║
║                                                                               ║
║ 3. PÓS-CRIAÇÃO (FIM DA CONVERSA):                                             ║
║    Se você já mandou o link de teste:                                         ║
║    👉 Apenas se despeça educadamente ("Qualquer dúvida estou aqui!").         ║
║    👉 NÃO FAÇA MAIS PERGUNTAS. NÃO PUXE MAIS ASSUNTO.                         ║
║                                                                               ║
║ 4. VOCÊ VENDE AGENTEZAP, NÃO OS PRODUTOS DO CLIENTE!                          ║
╚═══════════════════════════════════════════════════════════════════════════════╝

🚨 CONTEXTO:
Você está falando com um DONO DE NEGÓCIO.
Ele quer saber se a AgenteZap resolve os problemas DELE.
NÃO venda "IA", venda "DORMIR TRANQUILO", "VENDER MAIS", "ECONOMIZAR TEMPO".

═══════════════════════════════════════════════════════════════════════════════
💎 NICHOS ESPECIAIS: HOTMART/INFOPRODUTOS/AFILIADOS
═══════════════════════════════════════════════════════════════════════════════

Se o cliente vende CURSOS, EBOOKS, RECEITAS, INFOPRODUTOS:

ARGUMENTOS MATADORES:
• "Lead de infoproduto esfria rápido. Se não responder na hora, perdeu."
• "A IA faz o pré-venda e manda o checkout. Você só vê o dinheiro cair."
• "Atende 200 alunos ao mesmo tempo sem você digitar nada."

🚨 CÁLCULO DE ROI (USE SE O CLIENTE ACHAR CARO):
"Olha só: você investe R$ 300 em tráfego, certo? Se você perder só 5 vendas por mês porque demorou pra responder, quanto isso custa? Se seu curso é R$ 97, são R$ 485 perdidos! O R$ 99 da IA se paga sozinho e ainda sobra!"

OBJEÇÃO: "IA entende do meu nicho?"
RESPOSTA: "Você ensina ela! Você passa as infos do seu curso e ela aprende. Ela NUNCA inventa, só responde o que VOCÊ ensinou."

═══════════════════════════════════════════════════════════════════════════════
🏥 NICHO: CLÍNICA/MÉDICO
═══════════════════════════════════════════════════════════════════════════════
• Foco em: "Não perder paciente", "Agenda cheia", "Confirmação automática".
• Segurança: "Ela só agenda nos horários livres", "Transfere urgências pra você".

═══════════════════════════════════════════════════════════════════════════════
🛍️ NICHO: LOJA/VAREJO
═══════════════════════════════════════════════════════════════════════════════
• Foco em: "Responder preço/tamanho rápido", "Vender enquanto dorme".
• "Ela manda fotos, explica medidas e fecha o pedido."

═══════════════════════════════════════════════════════════════════════════════
🧠 TÉCNICAS DE FECHAMENTO
═══════════════════════════════════════════════════════════════════════════════

NÃO PERGUNTE "O QUE ACHA?".
PERGUNTE "VAMOS COMEÇAR?".

EXEMPLOS DE FECHAMENTO:
• "O teste é grátis e sem compromisso. Vou gerar seu link agora, pode ser?"
• "Bora colocar essa IA pra trabalhar pra você hoje mesmo?"
• "Me dá um ok que eu já crio seu acesso de teste!"

🚨🚨🚨 ATENÇÃO MÁXIMA: CLIENTE QUE JÁ VEM PRONTO 🚨🚨🚨

SE O CLIENTE JÁ DISSE:
- Nome da empresa OU negócio dele
- O que ele vende/faz
- Nome do agente OU qualquer detalhe

👉 CRIE A CONTA IMEDIATAMENTE! NÃO PERGUNTE MAIS NADA!

SE O CLIENTE AINDA NÃO DISSE O NOME DO NEGÓCIO OU O QUE VENDE:
👉 É PROIBIDO CRIAR A CONTA! PEÇA TUDO EM UMA ÚNICA MENSAGEM!

RESPOSTA OBRIGATÓRIA PARA COLETAR DADOS (SE FALTAR):
"Ótimo! Para eu criar seu agente de teste agora mesmo, só preciso que você me mande em uma única mensagem:

1. Nome do seu negócio
2. O que você vende (nicho)
3. Algum detalhe importante (preço, link, ou diferencial)

Assim que você mandar, eu configuro e te mando o link!"`;
}

// ============================================================================
// EXECUTAR TESTE DE UM CENÁRIO
// ============================================================================

interface TestResult {
  scenario: typeof SCENARIOS[0];
  converted: boolean;
  turns: number;
  conversation: Array<{speaker: string, content: string}>;
  failureReason?: string;
  lastClientMessage?: string;
}

async function runScenarioTest(scenario: typeof SCENARIOS[0], maxTurns: number = 15): Promise<TestResult> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 TESTANDO: ${scenario.business} (${scenario.type})`);
  console.log(`${"═".repeat(70)}\n`);
  
  const conversation: Array<{speaker: string, content: string}> = [];
  const rodrigoHistory: Array<{role: string, content: string}> = [];
  const clientHistory: Array<{role: string, content: string}> = [];
  
  const clientPrompt = buildClientPrompt(scenario);
  const rodrigoPrompt = await getRodrigoPrompt();
  
  let converted = false;
  let turn = 0;
  let lastClientMessage = "";
  
  // Cliente começa a conversa
  const firstMessage = await callMistral(
    clientPrompt + "\n\nINICIE A CONVERSA: Mande a primeira mensagem perguntando sobre o serviço de IA. Seja breve (1-2 linhas).",
    [],
    0.9
  );
  
  conversation.push({ speaker: "Cliente", content: firstMessage });
  rodrigoHistory.push({ role: "user", content: firstMessage });
  clientHistory.push({ role: "assistant", content: firstMessage });
  lastClientMessage = firstMessage;
  console.log(`👤 CLIENTE: ${firstMessage}\n`);
  
  // Loop de conversa
  while (turn < maxTurns && !converted) {
    turn++;
    
    // Rodrigo responde
    const rodrigoResponse = await callMistral(rodrigoPrompt, rodrigoHistory, 0.85);
    
    conversation.push({ speaker: "Rodrigo", content: rodrigoResponse });
    rodrigoHistory.push({ role: "assistant", content: rodrigoResponse });
    clientHistory.push({ role: "user", content: rodrigoResponse });
    
    console.log(`🤖 RODRIGO: ${rodrigoResponse}\n`);
    
    // Verificar se Rodrigo criou a conta
    if (rodrigoResponse.includes("[ACAO:CRIAR_CONTA_TESTE]") || rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      converted = true;
      console.log(`   ✅ CONTA CRIADA! Conversão em ${turn} mensagens!\n`);
      
      // Cliente responde agradecendo
      const finalClientMsg = await callMistral(
        clientPrompt + "\n\nO vendedor criou sua conta de teste. Responda brevemente agradecendo.",
        clientHistory,
        0.9
      );
      
      conversation.push({ speaker: "Cliente", content: finalClientMsg });
      console.log(`👤 CLIENTE: ${finalClientMsg}\n`);
      break;
    }
    
    // Cliente responde
    const clientResponse = await callMistral(clientPrompt, clientHistory, 0.9);
    
    conversation.push({ speaker: "Cliente", content: clientResponse });
    rodrigoHistory.push({ role: "user", content: clientResponse });
    clientHistory.push({ role: "assistant", content: clientResponse });
    lastClientMessage = clientResponse;
    
    console.log(`👤 CLIENTE: ${clientResponse}\n`);

    // DETECÇÃO DE LOOP (Cliente repetindo a mesma mensagem 3x)
    const last3Messages = conversation.filter(m => m.speaker === "Cliente").slice(-3);
    if (last3Messages.length === 3 && last3Messages.every(m => m.content === clientResponse)) {
      console.log(`   ❌ LOOP DETECTADO! Cliente repetiu a mesma mensagem 3x.\n`);
      break;
    }

    // DETECÇÃO DE FIM DE CONVERSA (Despedidas)
    const lowerClient = clientResponse.toLowerCase();
    if (lowerClient.includes("tchau") || lowerClient.includes("até mais") || lowerClient.includes("boa sorte") || lowerClient.includes("obrigado")) {
       // Se já passou de 5 turnos e o cliente está se despedindo sem converter, é falha
       if (turn > 5) {
         console.log(`   ❌ CLIENTE ENCERROU A CONVERSA.\n`);
         break;
       }
    }
    
    await new Promise(r => setTimeout(r, 800));
  }
  
  // Analisar falha
  let failureReason = "";
  if (!converted) {
    if (turn >= maxTurns) {
      failureReason = "Conversão demorou demais (15+ mensagens)";
    } else {
      failureReason = analyzeFailure(lastClientMessage, conversation);
    }
  }
  
  return {
    scenario,
    converted,
    turns: turn,
    conversation,
    failureReason,
    lastClientMessage
  };
}

// ============================================================================
// ANALISAR FALHA
// ============================================================================

function analyzeFailure(lastClientMsg: string, conversation: any[]): string {
  const msg = lastClientMsg.toLowerCase();
  
  // Objeção de preço
  if (msg.includes("caro") || msg.includes("preço") || msg.includes("r$")) {
    return "Cliente achou caro - Rodrigo não demonstrou ROI suficiente";
  }
  
  // Desconfiança
  if (msg.includes("não confio") || msg.includes("não acredito") || msg.includes("será que")) {
    return "Cliente desconfiado - Rodrigo não deu garantias/provas suficientes";
  }
  
  // Não entendeu
  if (msg.includes("não entendi") || msg.includes("como funciona") || msg.includes("explica")) {
    return "Cliente não entendeu - Rodrigo explicou de forma confusa";
  }
  
  // Vou pensar
  if (msg.includes("vou pensar") || msg.includes("depois eu vejo")) {
    return "Cliente adiou - Rodrigo não criou urgência/facilidade suficiente";
  }
  
  // Objeção de nicho específico
  if (msg.includes("meu negócio é diferente") || msg.includes("específico")) {
    return "Cliente não viu aplicação no negócio dele - Faltou personalização";
  }
  
  return "Cliente desistiu por motivo não identificado";
}

// ============================================================================
// GERAR RELATÓRIO
// ============================================================================

function generateReport(results: TestResult[]): string {
  const converted = results.filter(r => r.converted).length;
  const total = results.length;
  const conversionRate = Math.round((converted / total) * 100);
  
  let report = `
═══════════════════════════════════════════════════════════════════════════════
📊 RELATÓRIO DE CALIBRAÇÃO - RODRIGO (AGENTE VENDEDOR)
═══════════════════════════════════════════════════════════════════════════════

DATA: ${new Date().toLocaleString('pt-BR')}
TESTE: IA vs IA SEM ROTEIRO (Cliente age naturalmente)

═══════════════════════════════════════════════════════════════════════════════
📈 RESULTADOS GERAIS
═══════════════════════════════════════════════════════════════════════════════

TAXA DE CONVERSÃO: ${conversionRate}% (${converted}/${total} nichos)
${conversionRate === 100 ? "🎉 PERFEITO!" : conversionRate >= 75 ? "⚠️ BOM, MAS PODE MELHORAR" : "❌ PRECISA CALIBRAR"}

═══════════════════════════════════════════════════════════════════════════════
📋 RESULTADOS POR NICHO
═══════════════════════════════════════════════════════════════════════════════

`;
  
  for (const result of results) {
    const icon = result.converted ? "✅" : "❌";
    const status = result.converted ? "CONVERTEU" : "NÃO CONVERTEU";
    const turns = result.converted ? `(${result.turns} mensagens)` : "";
    
    report += `${icon} ${result.scenario.type}: ${status} ${turns}\n`;
    
    if (!result.converted) {
      report += `   📌 Motivo: ${result.failureReason}\n`;
      report += `   💬 Última msg cliente: "${result.lastClientMessage?.substring(0, 100)}..."\n`;
    }
    
    report += `\n`;
  }
  
  // Sugestões de ajuste
  if (conversionRate < 100) {
    report += `
═══════════════════════════════════════════════════════════════════════════════
🔧 SUGESTÕES DE AJUSTE
═══════════════════════════════════════════════════════════════════════════════

`;
    
    const failures = results.filter(r => !r.converted);
    const failureReasons = failures.map(f => f.failureReason || "").join(" | ");
    
    if (failureReasons.includes("ROI")) {
      report += `1. MELHORAR DEMONSTRAÇÃO DE ROI:\n`;
      report += `   - Adicionar comparação com custo de funcionário\n`;
      report += `   - Enfatizar economia de tempo\n`;
      report += `   - Dar exemplos de quanto cliente pode ganhar\n\n`;
    }
    
    if (failureReasons.includes("garantias")) {
      report += `2. DAR MAIS GARANTIAS:\n`;
      report += `   - Enfatizar teste grátis de 7 dias\n`;
      report += `   - Mencionar que cancela quando quiser\n`;
      report += `   - Dar casos de sucesso específicos\n\n`;
    }
    
    if (failureReasons.includes("confusa")) {
      report += `3. SIMPLIFICAR EXPLICAÇÃO:\n`;
      report += `   - Usar linguagem mais simples\n`;
      report += `   - Dar exemplos práticos logo\n`;
      report += `   - Evitar jargão técnico\n\n`;
    }
    
    if (failureReasons.includes("personalização")) {
      report += `4. AUMENTAR PERSONALIZAÇÃO:\n`;
      report += `   - Fazer mais perguntas sobre o negócio\n`;
      report += `   - Dar exemplos específicos do nicho\n`;
      report += `   - Mostrar como resolve as dores específicas\n\n`;
    }
  } else {
    report += `
═══════════════════════════════════════════════════════════════════════════════
🎉 CALIBRAÇÃO PERFEITA!
═══════════════════════════════════════════════════════════════════════════════

Rodrigo conseguiu converter TODOS os nichos!
Nenhum ajuste necessário no momento.

MÉDIA DE MENSAGENS ATÉ CONVERSÃO: ${Math.round(results.reduce((sum, r) => sum + r.turns, 0) / results.length)}

`;
  }
  
  report += `
═══════════════════════════════════════════════════════════════════════════════
📁 LOGS DETALHADOS
═══════════════════════════════════════════════════════════════════════════════

Conversas completas salvas em: logs/calibration-{timestamp}.json

`;
  
  return report;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE DE CALIBRAÇÃO IA vs IA - SEM ROTEIRO                      ║`);
  console.log(`║   Cliente IA age NATURALMENTE (pode aceitar OU recusar!)          ║`);
  console.log(`╚${"═".repeat(68)}╝`);
  
  const results: TestResult[] = [];
  
  // Rodar todos os cenários
  for (const scenario of SCENARIOS) {
    const result = await runScenarioTest(scenario);
    results.push(result);
  }
  
  // Gerar relatório
  const report = generateReport(results);
  console.log(report);
  
  // Salvar logs
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `calibration-${timestamp}`;
  
  // JSON detalhado
  const jsonFile = join(logsDir, `${filename}.json`);
  writeFileSync(jsonFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    results,
    summary: {
      total: results.length,
      converted: results.filter(r => r.converted).length,
      conversionRate: Math.round((results.filter(r => r.converted).length / results.length) * 100)
    }
  }, null, 2));
  
  // Relatório TXT
  const txtFile = join(logsDir, `${filename}.txt`);
  writeFileSync(txtFile, report);
  
  console.log(`📁 Logs salvos:`);
  console.log(`   ${jsonFile}`);
  console.log(`   ${txtFile}`);
  
  // Resultado final
  const conversionRate = Math.round((results.filter(r => r.converted).length / results.length) * 100);
  
  if (conversionRate === 100) {
    console.log(`\n🎉 SUCESSO! 100% de conversão! Rodrigo está PERFEITO!`);
  } else {
    console.log(`\n⚠️ ATENÇÃO! ${conversionRate}% de conversão. Ajustes necessários!`);
    console.log(`\nPRÓXIMOS PASSOS:`);
    console.log(`1. Analisar logs das conversas que falharam`);
    console.log(`2. Identificar padrões (objeções não superadas, etc)`);
    console.log(`3. Ajustar prompt do Rodrigo em server/adminAgentService.ts`);
    console.log(`4. Rodar este teste novamente`);
    console.log(`5. Repetir até 100%`);
  }
}

main().catch(console.error);
