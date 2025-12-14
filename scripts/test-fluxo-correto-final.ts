/**
 * 🧪 TESTE FLUXO CORRETO FINAL - IA vs IA
 * 
 * Este teste simula o fluxo REAL e COMPLETO:
 * 
 * 1. Cliente IA chega com dúvidas
 * 2. Rodrigo IA convence
 * 3. Cliente aceita testar
 * 4. Rodrigo pede infos + ACEITA MÍDIA (foto/áudio)
 * 5. Cliente manda foto do cardápio/catálogo
 * 6. Rodrigo cria conta com [AÇÃO:CRIAR_CONTA_TESTE]
 * 7. Rodrigo envia LINK (não email!) para SIMULADOR de WhatsApp
 * 8. Rodrigo explica que cliente conversa com SEU AGENTE no simulador
 * 
 * CRITÉRIOS:
 * - Aceitou mídia do cliente? ✅
 * - Usou [AÇÃO:CRIAR_CONTA_TESTE]? ✅
 * - Mencionou LINK (não email)? ✅
 * - Explicou SIMULADOR de WhatsApp? ✅
 * - Explicou que conversa com SEU AGENTE? ✅
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync, mkdirSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// ============================================================================
// CENÁRIO DE TESTE
// ============================================================================

const TEST_SCENARIO = {
  id: "restaurante-com-midia",
  businessType: "Restaurante",
  businessName: "Sabor Caseiro",
  owner: "Carlos"
};

// ============================================================================
// PROMPT DO RODRIGO (NOSSO AGENTE VENDEDOR)
// ============================================================================

const RODRIGO_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨 REGRAS ABSOLUTAS:

1. VOCÊ VENDE A AGENTEZAP (sistema de IA para WhatsApp)
2. NUNCA diga "vou enviar por email" - USE "vou te mandar o LINK"
3. SEMPRE use [AÇÃO:CRIAR_CONTA_TESTE] quando criar conta
4. ACEITE MÍDIAS do cliente (foto, áudio, vídeo)

═══════════════════════════════════════════════════════════════════════════════
📸 ACEITAR E PEDIR MÍDIAS DO CLIENTE
═══════════════════════════════════════════════════════════════════════════════

OFEREÇA PRO CLIENTE MANDAR MÍDIA:
- "Pode mandar foto do cardápio/catálogo! 📸"
- "Se preferir, manda um áudio explicando, é mais fácil! 🎤"
- "Pode mandar foto dos produtos que eu já configuro!"

QUANDO CLIENTE MANDAR MÍDIA, CONFIRME:
- FOTO: "Recebi a foto! Vou usar pra configurar seu agente! 📸"
- ÁUDIO: "Recebi seu áudio! Deixa eu ouvir... Show, entendi tudo!"
- VÍDEO: "Vi seu vídeo! Ótimo pra eu entender seu negócio!"

═══════════════════════════════════════════════════════════════════════════════
📋 FLUXO DE CONFIGURAÇÃO DO AGENTE
═══════════════════════════════════════════════════════════════════════════════

Quando cliente aceitar testar, peça:
"Pra criar seu agente, me manda (pode ser tudo junto ou num áudio 🎤):
📍 Nome da empresa
🤖 Nome do agente (ex: Bia, Pedro...)
📝 Infos que ele precisa saber (preços, horários, produtos...)

Pode mandar foto do cardápio/catálogo também! 📸"

═══════════════════════════════════════════════════════════════════════════════
🔗 CRIAR CONTA E ENVIAR LINK (NÃO EMAIL!)
═══════════════════════════════════════════════════════════════════════════════

QUANDO TIVER AS INFORMAÇÕES, CRIE A CONTA:

"Pronto! Criei seu agente! 🚀

[AÇÃO:CRIAR_CONTA_TESTE]

Vou te mandar o LINK agora!

Quando você abrir, vai ver um SIMULADOR de WhatsApp igualzinho o real!
Lá você conversa com SEU AGENTE e vê como ele responde.

Testa lá e me fala o que achou! Se precisar ajustar algo, a gente faz na hora! 📱"

❌ NUNCA DIGA: "vou enviar por email" ou "você vai receber um email"
✅ SEMPRE DIGA: "vou te mandar o LINK" ou "vou enviar o link"

═══════════════════════════════════════════════════════════════════════════════
💬 COMO VOCÊ FALA
═══════════════════════════════════════════════════════════════════════════════

- Informal mas profissional (vc, tá, pra)
- Empático e caloroso
- Emojis com moderação (2-3 por mensagem)
- Respostas de 3-6 linhas
- NÃO seja repetitivo!

PREÇO: R$ 99/mês | Teste: 7 dias grátis

AÇÃO: [AÇÃO:CRIAR_CONTA_TESTE]`;

// ============================================================================
// PROMPT DO CLIENTE (IA SIMULANDO CLIENTE REAL)
// ============================================================================

const CLIENT_PROMPT = `Você é o ${TEST_SCENARIO.owner}, dono de um ${TEST_SCENARIO.businessType} chamado "${TEST_SCENARIO.businessName}".

Você está conversando com o Rodrigo da AgenteZap porque quer um atendente IA pro WhatsApp.

SEU COMPORTAMENTO:
- Você é ocupado e objetivo
- Você tem algumas dúvidas iniciais
- Quando ele pedir informações, MANDE UMA FOTO DO CARDÁPIO:
  "[Foto enviada: cardápio com pratos do dia - Feijoada R$ 25, Frango R$ 18, Marmitex R$ 15]"
- Quando receber o link, agradeça e diga que vai testar

SEU NEGÓCIO:
- Restaurante Sabor Caseiro
- Prato do dia R$ 18, Marmitex R$ 15
- Abre das 11h às 22h
- Delivery grátis acima de R$ 30
- Problema: não consegue responder WhatsApp na hora do almoço

FLUXO DA CONVERSA:
1. Comece perguntando como funciona
2. Pergunte o preço
3. Aceite testar quando ele oferecer
4. Quando ele pedir infos, MANDE FOTO DO CARDÁPIO junto com as infos
5. Quando receber o link do simulador, agradeça e diga que vai testar

IMPORTANTE:
- Quando mandar foto, use o formato: [Foto enviada: descrição da foto]
- Seja natural e direto
- Respostas curtas (1-3 linhas)`;

// ============================================================================
// FUNÇÕES
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
// EXECUTAR CONVERSA IA vs IA
// ============================================================================

async function runConversation(): Promise<{
  conversation: Array<{speaker: string, content: string}>;
  metrics: {
    accountCreated: boolean;
    mediaAccepted: boolean;
    linkMentioned: boolean;
    simulatorExplained: boolean;
    ownAgentExplained: boolean;
    noEmailMentioned: boolean;
  };
}> {
  console.log(`\n${"═".repeat(70)}`);
  console.log(`🧪 TESTE IA vs IA: ${TEST_SCENARIO.businessName} (${TEST_SCENARIO.businessType})`);
  console.log(`${"═".repeat(70)}\n`);
  
  const conversation: Array<{speaker: string, content: string}> = [];
  const rodrigoHistory: Array<{role: string, content: string}> = [];
  const clientHistory: Array<{role: string, content: string}> = [];
  
  let accountCreated = false;
  let mediaAccepted = false;
  let linkMentioned = false;
  let simulatorExplained = false;
  let ownAgentExplained = false;
  let noEmailMentioned = true;
  
  // Cliente começa
  const firstMessage = await callMistral(
    CLIENT_PROMPT + "\n\nMANDE SUA PRIMEIRA MENSAGEM: Pergunte como funciona de forma curta e direta.",
    [],
    0.9
  );
  
  conversation.push({ speaker: "Cliente", content: firstMessage });
  rodrigoHistory.push({ role: "user", content: firstMessage });
  clientHistory.push({ role: "assistant", content: firstMessage });
  console.log(`👤 CLIENTE: ${firstMessage}\n`);
  
  // Loop de conversa
  const MAX_TURNS = 10;
  
  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Rodrigo responde
    const rodrigoResponse = await callMistral(RODRIGO_PROMPT, rodrigoHistory, 0.85);
    
    conversation.push({ speaker: "Rodrigo", content: rodrigoResponse });
    rodrigoHistory.push({ role: "assistant", content: rodrigoResponse });
    clientHistory.push({ role: "user", content: rodrigoResponse });
    
    console.log(`🤖 RODRIGO: ${rodrigoResponse}\n`);
    
    // Análise da resposta do Rodrigo
    const rodrigoLower = rodrigoResponse.toLowerCase();
    
    if (rodrigoResponse.includes("[AÇÃO:CRIAR_CONTA_TESTE]")) {
      accountCreated = true;
      console.log(`   ✅ CONTA CRIADA!\n`);
    }
    
    if (rodrigoLower.includes("recebi") && (rodrigoLower.includes("foto") || rodrigoLower.includes("áudio") || rodrigoLower.includes("audio"))) {
      mediaAccepted = true;
      console.log(`   ✅ MÍDIA ACEITA!\n`);
    }
    
    if (rodrigoLower.includes("link") && !rodrigoLower.includes("email")) {
      linkMentioned = true;
    }
    
    if (rodrigoLower.includes("simulador") || rodrigoLower.includes("igualzinho") || rodrigoLower.includes("igual ao real")) {
      simulatorExplained = true;
    }
    
    if (rodrigoLower.includes("seu agente") || rodrigoLower.includes("agente dele") || rodrigoLower.includes("conversa com") && rodrigoLower.includes("agente")) {
      ownAgentExplained = true;
    }
    
    if (rodrigoLower.includes("email")) {
      noEmailMentioned = false;
      console.log(`   ⚠️ MENCIONOU EMAIL (errado!)\n`);
    }
    
    // Se conta foi criada, cliente dá última resposta
    if (accountCreated) {
      const finalResponse = await callMistral(
        CLIENT_PROMPT + "\n\nO vendedor criou sua conta e enviou o link. Agradeça e diga que vai testar o simulador.",
        clientHistory,
        0.9
      );
      
      conversation.push({ speaker: "Cliente", content: finalResponse });
      console.log(`👤 CLIENTE: ${finalResponse}\n`);
      break;
    }
    
    // Cliente responde
    let clientContext = CLIENT_PROMPT;
    
    // Se Rodrigo pediu informações, cliente manda foto
    if (rodrigoLower.includes("nome da empresa") || rodrigoLower.includes("me manda") || rodrigoLower.includes("pra criar")) {
      clientContext += "\n\nIMPORTANTE: O vendedor pediu as informações. Mande as infos E uma foto do cardápio! Use [Foto enviada: ...]";
    }
    
    const clientResponse = await callMistral(clientContext, clientHistory, 0.9);
    
    conversation.push({ speaker: "Cliente", content: clientResponse });
    rodrigoHistory.push({ role: "user", content: clientResponse });
    clientHistory.push({ role: "assistant", content: clientResponse });
    
    console.log(`👤 CLIENTE: ${clientResponse}\n`);
    
    await new Promise(r => setTimeout(r, 800));
  }
  
  return {
    conversation,
    metrics: {
      accountCreated,
      mediaAccepted,
      linkMentioned,
      simulatorExplained,
      ownAgentExplained,
      noEmailMentioned
    }
  };
}

// ============================================================================
// ANÁLISE E NOTA
// ============================================================================

function analyzeAndScore(metrics: any): { score: number; details: string[] } {
  let score = 0;
  const details: string[] = [];
  
  // Critério 1: Conta criada (20 pontos)
  if (metrics.accountCreated) {
    score += 20;
    details.push("✅ Conta criada com [AÇÃO:CRIAR_CONTA_TESTE] (+20)");
  } else {
    details.push("❌ Conta NÃO foi criada (0)");
  }
  
  // Critério 2: Mídia aceita (20 pontos)
  if (metrics.mediaAccepted) {
    score += 20;
    details.push("✅ Mídia do cliente foi aceita (+20)");
  } else {
    details.push("❌ Mídia NÃO foi aceita (0)");
  }
  
  // Critério 3: Link mencionado (20 pontos)
  if (metrics.linkMentioned) {
    score += 20;
    details.push("✅ Mencionou LINK (não email!) (+20)");
  } else {
    details.push("❌ Não mencionou link corretamente (0)");
  }
  
  // Critério 4: Simulador explicado (15 pontos)
  if (metrics.simulatorExplained) {
    score += 15;
    details.push("✅ Explicou que é um SIMULADOR de WhatsApp (+15)");
  } else {
    details.push("❌ Não explicou o simulador (0)");
  }
  
  // Critério 5: Explicou que conversa com SEU AGENTE (15 pontos)
  if (metrics.ownAgentExplained) {
    score += 15;
    details.push("✅ Explicou que cliente conversa com SEU AGENTE (+15)");
  } else {
    details.push("❌ Não explicou que conversa com o agente dele (0)");
  }
  
  // Critério 6: Não mencionou email (10 pontos)
  if (metrics.noEmailMentioned) {
    score += 10;
    details.push("✅ Não mencionou email (correto!) (+10)");
  } else {
    details.push("❌ Mencionou email (errado!) (-10)");
    score -= 10;
  }
  
  return { score, details };
}

// ============================================================================
// SALVAR LOG
// ============================================================================

function saveLog(conversation: any[], metrics: any, score: number, details: string[]): void {
  const logsDir = join(__dirname, '..', 'logs');
  try { mkdirSync(logsDir, { recursive: true }); } catch {}
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `fluxo-correto-${TEST_SCENARIO.id}-${timestamp}`;
  
  // JSON
  const jsonFile = join(logsDir, `${filename}.json`);
  writeFileSync(jsonFile, JSON.stringify({
    timestamp: new Date().toISOString(),
    scenario: TEST_SCENARIO,
    conversation,
    metrics,
    score,
    details
  }, null, 2));
  
  // TXT
  const txtFile = join(logsDir, `${filename}.txt`);
  let txt = `
════════════════════════════════════════════════════════════════════════════════
TESTE FLUXO CORRETO: ${TEST_SCENARIO.businessName} (${TEST_SCENARIO.businessType})
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
NOTA FINAL: ${score}/100

CRITÉRIOS:
${details.join("\n")}
`;
  
  writeFileSync(txtFile, txt);
  
  console.log(`📁 Logs salvos:`);
  console.log(`   ${jsonFile}`);
  console.log(`   ${txtFile}`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`╔${"═".repeat(68)}╗`);
  console.log(`║   TESTE FLUXO CORRETO FINAL - IA vs IA                             ║`);
  console.log(`║   Rodrigo (vendedor) vs Cliente (com mídia!)                        ║`);
  console.log(`╚${"═".repeat(68)}╝`);
  
  // Executar conversa
  const { conversation, metrics } = await runConversation();
  
  // Analisar e dar nota
  const { score, details } = analyzeAndScore(metrics);
  
  // Mostrar resultado
  console.log(`\n${"═".repeat(70)}`);
  console.log(`📊 RESULTADO FINAL`);
  console.log(`${"═".repeat(70)}\n`);
  
  for (const detail of details) {
    console.log(`   ${detail}`);
  }
  
  console.log(`\n${"─".repeat(70)}`);
  console.log(`📈 NOTA FINAL: ${score}/100 ${score >= 80 ? "✅" : score >= 60 ? "⚠️" : "❌"}`);
  console.log(`${score >= 80 ? "🎉 APROVADO!" : score >= 60 ? "⚠️ PRECISA MELHORAR" : "❌ REPROVADO"}`);
  
  // Salvar log
  saveLog(conversation, metrics, score, details);
}

main().catch(console.error);
