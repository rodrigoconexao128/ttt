/**
 * 🧪 TESTE MÚLTIPLOS CENÁRIOS - CALIBRAGEM PERFEITA
 * 
 * Testa VÁRIOS tipos de clientes:
 * 1. Cliente que dá TODAS as infos logo (rápido)
 * 2. Cliente que dá infos aos poucos (normal)
 * 3. Cliente que manda áudio/foto
 * 4. Cliente resistente que precisa ser convencido
 * 
 * ANALISA CADA CONVERSA E CALIBRA!
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync, appendFileSync } from 'fs';

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
// TIPOS DE CLIENTE A TESTAR
// ============================================================================

const SCENARIOS = [
  {
    id: "hotmart-rapido",
    name: "Infoprodutor Hotmart (Rápido)",
    clientBehavior: "Cliente profissional que já sabe o que quer. Dá todas as informações logo.",
    firstMessage: "Oi! Eu tenho um curso de culinária fitness no Hotmart, R$ 197, quero um agente pra responder clientes 24h. Empresa: Fit Receitas, agente pode ser Bia, precisa saber preço, garantia de 7 dias e que entrega é imediata.",
    expectation: "Rodrigo deve criar conta IMEDIATAMENTE (1-2 mensagens)",
    agentName: "Bia",
    agentCompany: "Fit Receitas",
    agentInstructions: "Curso R$ 197, garantia 7 dias, entrega imediata"
  },
  {
    id: "restaurante-normal",
    name: "Restaurante (Normal)",
    clientBehavior: "Cliente comum que não sabe muito. Precisa de orientação.",
    firstMessage: "Oi, vi o anúncio de vocês. Tenho um restaurante aqui no bairro e tô cansado de responder WhatsApp, pode me ajudar?",
    expectation: "Rodrigo deve pedir infos de forma rápida (tudo junto) e criar conta em 3-4 mensagens",
    agentName: "Pedro",
    agentCompany: "Sabor do Bairro",
    agentInstructions: "Restaurante, prato do dia R$ 18, delivery grátis acima de R$ 30, aberto das 11h às 22h"
  },
  {
    id: "afiliado-audio",
    name: "Afiliado Hotmart (Manda Áudio)",
    clientBehavior: "Cliente que prefere mandar áudio. Quando pedido, simula que mandou um áudio.",
    firstMessage: "Ei, sou afiliado de um curso de dropshipping. Preciso de ajuda pra responder leads no zap.",
    expectation: "Rodrigo deve aceitar áudio e criar conta após receber",
    agentName: "Carol",
    agentCompany: "Drop Expert",
    agentInstructions: "Curso Dropshipping Passo a Passo, R$ 297, aprenda a vender sem estoque"
  },
  {
    id: "loja-resistente", 
    name: "Loja de Roupas (Resistente)",
    clientBehavior: "Cliente desconfiado que faz muitas perguntas antes de aceitar.",
    firstMessage: "Oi, queria entender melhor como funciona esse negócio de robô pra WhatsApp...",
    expectation: "Rodrigo deve explicar, convencer e então criar conta",
    agentName: "Luana",
    agentCompany: "Moda Bella",
    agentInstructions: "Loja de roupas femininas, tamanhos P ao GG, entrega em 3-5 dias, aceita PIX e cartão"
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
// PROMPT DO RODRIGO 
// ============================================================================

const RODRIGO_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨🚨🚨 REGRAS ABSOLUTAS - LER PRIMEIRO! 🚨🚨🚨

1. VOCÊ VENDE A AGENTEZAP (sistema de IA para WhatsApp), NÃO os produtos do cliente!

2. NÃO DIGA "Recebi seu áudio" SE O CLIENTE NÃO MENCIONOU ÁUDIO!
   ❌ ERRADO: Cliente manda texto → você diz "Recebi seu áudio"
   ✅ CERTO: Só diga "Recebi seu áudio" se o cliente disse que mandou áudio

3. SEMPRE USE A TAG [AÇÃO:CRIAR_CONTA_TESTE] QUANDO FOR CRIAR A CONTA!
   ❌ ERRADO: "Pronto! Criei seu agente!" (sem tag)
   ✅ CERTO: "Pronto! Criei seu agente! [AÇÃO:CRIAR_CONTA_TESTE]"

4. SE CLIENTE JÁ DEU NOME DA EMPRESA + O QUE FAZ → CRIE A CONTA IMEDIATAMENTE!
   Não pergunte mais nada, use [AÇÃO:CRIAR_CONTA_TESTE] direto!

═══════════════════════════════════════════════════════════════════════════════
⚡ FLUXO RÁPIDO - PERGUNTE TUDO DE UMA VEZ!
═══════════════════════════════════════════════════════════════════════════════

QUANDO CLIENTE CHEGA SEM INFOS:
"Me conta rapidinho: qual seu negócio, o que vende, e sua maior dor hoje?"

QUANDO CLIENTE EXPLICA O NEGÓCIO:
"Show! Pra criar seu agente agora, me manda (pode ser tudo junto ou num áudio 🎤):
📍 Nome da empresa
🤖 Nome do agente (ex: Bia, Pedro...)
📝 Infos que ele precisa saber (preços, horários, produtos...)

Pode mandar foto do cardápio/catálogo também! 📸"

QUANDO CLIENTE DER AS INFOS (obrigatório incluir a tag!):
"Show! Já tenho tudo que preciso! 🚀

Vou criar seu agente agora...

[AÇÃO:CRIAR_CONTA_TESTE]

Você vai receber um link com um SIMULADOR de WhatsApp!
Lá você conversa com SEU agente e vê como ele responde.
Testa e me fala o que achou! 📱"

SE CLIENTE JÁ VEIO COM TODAS AS INFOS NA PRIMEIRA MENSAGEM:
→ NÃO pergunte mais nada!
→ Use [AÇÃO:CRIAR_CONTA_TESTE] imediatamente!

ACEITE MÍDIAS (só se o cliente DISSE que mandou):
- ÁUDIO: "Recebi seu áudio! Deixa eu ouvir..." (SÓ SE ELE DISSE QUE MANDOU!)
- FOTO: "Recebi a foto! Vou usar pra configurar o agente..."

PREÇO: R$ 99/mês | Teste: 7 dias grátis

AÇÕES DISPONÍVEIS:
[AÇÃO:CRIAR_CONTA_TESTE] - OBRIGATÓRIO para criar conta! Sempre use quando criar!
[ENVIAR_MIDIA:VIDEO_DEMONSTRACAO] - Enviar vídeo explicativo`;

// ============================================================================
// TESTAR CENÁRIO
// ============================================================================

async function testScenario(scenario: typeof SCENARIOS[0]): Promise<{
  success: boolean;
  messages: number;
  accountCreated: boolean;
  askedAllAtOnce: boolean;
  acceptedMedia: boolean;
  issues: string[];
  conversation: any[];
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 CENÁRIO: ${scenario.name}`);
  console.log(`📋 Comportamento: ${scenario.clientBehavior}`);
  console.log(`🎯 Expectativa: ${scenario.expectation}`);
  console.log(`${"═".repeat(70)}\n`);

  const history: Array<{role: string, content: string}> = [];
  let accountCreated = false;
  let askedAllAtOnce = false;
  let acceptedMedia = false;
  const issues: string[] = [];

  // Primeira mensagem do cliente
  history.push({ role: "user", content: scenario.firstMessage });
  console.log(`👤 Cliente: ${scenario.firstMessage}\n`);

  // Prompt do cliente para gerar respostas
  const getClientPrompt = (sentAudio: boolean, sentInfo: boolean) => `Você é um cliente conversando com o Rodrigo da AgenteZap.

SEU COMPORTAMENTO: ${scenario.clientBehavior}

INFORMAÇÕES DO SEU NEGÓCIO (mande quando pedirem):
- Empresa: ${scenario.agentCompany}
- Nome do agente: ${scenario.agentName}
- Instruções: ${scenario.agentInstructions}

${scenario.id.includes("audio") ? `
IMPORTANTE: Quando ele pedir informações, diga que vai mandar um ÁUDIO:
"Vou mandar um áudio pra vc, é mais fácil"
Depois diga: "[Áudio enviado: ${scenario.agentInstructions}]"
` : ""}

${scenario.id.includes("resistente") ? `
IMPORTANTE: Faça algumas perguntas antes de aceitar:
- "Quanto custa isso?"
- "Funciona mesmo?"
- "Como eu sei que não é golpe?"
Depois de 2-3 perguntas, aceite e mande as infos.
` : ""}

${sentAudio ? "Você já mandou o áudio com as informações." : ""}
${sentInfo ? "Você já mandou as informações do negócio." : ""}

SE ELE DISSER QUE CRIOU A CONTA: Agradeça e diga que vai testar.

FORMATO: Respostas curtas (1-3 linhas), informais (vc, tá, pra)`;

  let sentAudio = false;
  let sentInfo = false;
  const maxRounds = 8;

  for (let round = 0; round < maxRounds; round++) {
    // Resposta do Rodrigo
    const rodrigoResponse = await callMistral(
      RODRIGO_PROMPT,
      history.map(m => ({ role: m.role, content: m.content })),
      0.8
    );

    history.push({ role: "assistant", content: rodrigoResponse });
    console.log(`🤖 Rodrigo: ${rodrigoResponse}\n`);

    // Análise da resposta
    if (rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      accountCreated = true;
      console.log(`   ✅ CONTA CRIADA!\n`);
    }

    // Verificar se perguntou tudo junto
    if (rodrigoResponse.match(/nome.*(empresa|agente).*instruções/i) ||
        rodrigoResponse.match(/me manda.*tudo/i) ||
        rodrigoResponse.match(/pode ser tudo junto/i) ||
        rodrigoResponse.match(/📍.*🤖.*📝/s)) {
      askedAllAtOnce = true;
    }

    // Verificar se aceitou mídia
    if (rodrigoResponse.match(/recebi.*áudio|recebi.*foto|vou ouvir|vou analisar/i)) {
      acceptedMedia = true;
    }

    // Se conta foi criada, cliente agradece e termina
    if (accountCreated) {
      const finalMsg = "Oba, recebi! Vou testar agora e te falo! 🚀";
      history.push({ role: "user", content: finalMsg });
      console.log(`👤 Cliente: ${finalMsg}\n`);
      break;
    }

    // Gerar resposta do cliente
    const clientResponse = await callMistral(
      getClientPrompt(sentAudio, sentInfo),
      history.map(m => ({ 
        role: m.role === "user" ? "assistant" : "user",
        content: m.content 
      })),
      0.9
    );

    // Detectar se mandou áudio
    if (clientResponse.includes("[Áudio enviado") || clientResponse.includes("mandei o áudio") || clientResponse.includes("vou mandar um áudio")) {
      sentAudio = true;
    }

    // Detectar se mandou info
    if (clientResponse.includes(scenario.agentName) || clientResponse.includes(scenario.agentCompany)) {
      sentInfo = true;
    }

    history.push({ role: "user", content: clientResponse });
    console.log(`👤 Cliente: ${clientResponse}\n`);

    await new Promise(r => setTimeout(r, 800));
  }

  // Avaliar problemas
  if (!accountCreated) {
    issues.push("Não criou conta de teste");
  }

  if (history.length > 8 && scenario.id === "hotmart-rapido") {
    issues.push("Demorou demais para cliente rápido");
  }

  if (!askedAllAtOnce && history.length > 4) {
    issues.push("Não perguntou tudo de uma vez");
  }

  if (scenario.id.includes("audio") && !acceptedMedia) {
    issues.push("Não demonstrou que recebeu áudio");
  }

  return {
    success: accountCreated && issues.length === 0,
    messages: history.length,
    accountCreated,
    askedAllAtOnce,
    acceptedMedia,
    issues,
    conversation: history
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   CALIBRAGEM PERFEITA - MÚLTIPLOS CENÁRIOS                         ║`);
  console.log(`║   Testando ${SCENARIOS.length} tipos de cliente                                      ║`);
  console.log(`╚${"═".repeat(68)}╝`);

  const results: any[] = [];
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}

  for (const scenario of SCENARIOS) {
    const result = await testScenario(scenario);
    results.push({ scenario, ...result });
    
    // Pausa entre cenários
    await new Promise(r => setTimeout(r, 2000));
  }

  // Resumo final
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESUMO FINAL`);
  console.log(`${"═".repeat(70)}\n`);

  let approved = 0;
  for (const r of results) {
    const status = r.success ? "✅" : "❌";
    console.log(`${status} ${r.scenario.name}`);
    console.log(`   📝 Mensagens: ${r.messages} | Conta: ${r.accountCreated ? "✅" : "❌"} | Tudo junto: ${r.askedAllAtOnce ? "✅" : "❌"}`);
    if (r.issues.length > 0) {
      console.log(`   ⚠️ Issues: ${r.issues.join(", ")}`);
    }
    if (r.success) approved++;
    console.log();
  }

  console.log(`${"─".repeat(70)}`);
  console.log(`🎯 APROVADOS: ${approved}/${results.length} (${Math.round(approved/results.length*100)}%)`);

  if (approved < results.length) {
    console.log(`\n⚠️ PROBLEMAS PARA RESOLVER:`);
    for (const r of results) {
      if (!r.success) {
        console.log(`   ${r.scenario.name}: ${r.issues.join(", ")}`);
      }
    }
  }

  // Salvar log completo
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const logFile = join(logsDir, `calibragem-${timestamp}.json`);
  writeFileSync(logFile, JSON.stringify(results, null, 2));
  console.log(`\n📁 Log salvo: ${logFile}`);
}

main().catch(console.error);
