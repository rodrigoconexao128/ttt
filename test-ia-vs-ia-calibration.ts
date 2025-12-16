/**
 * 🧪 TESTE IA vs IA - CALIBRAÇÃO DO ADMIN AGENT
 * 
 * Este script simula uma conversa entre:
 * - IA CLIENTE: Simula diferentes tipos de clientes (exigente, desconfiado, direto, etc.)
 * - IA AGENTE (Rodrigo): O agente admin que estamos testando
 * 
 * O objetivo é calibrar até que o agente responda de forma 100% humana.
 */

import 'dotenv/config';
import { Mistral } from "@mistralai/mistralai";

const API_URL = "http://localhost:5000/api/test/admin-chat";

// Cliente Mistral standalone (não importa do servidor)
async function getMistralClient() {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY não configurada");
  return new Mistral({ apiKey });
}

// Tipos de clientes para testar
const CLIENT_PERSONAS = [
  {
    name: "Cliente Direto",
    description: "Vai direto ao ponto, não perde tempo",
    systemPrompt: `Você é um cliente que quer testar o AgenteZap. Você é DIRETO e OBJETIVO.
    Você tem uma loja de roupas femininas chamada "Moda Feminina Bella".
    - Não enrola, vai direto ao ponto
    - Responde de forma curta
    - Quer ver resultado rápido
    Simule a conversa de forma realista. Comece cumprimentando.`
  },
  {
    name: "Cliente Desconfiado", 
    description: "Desconfia de tudo, faz muitas perguntas",
    systemPrompt: `Você é um cliente DESCONFIADO que quer testar o AgenteZap.
    Você tem uma pizzaria chamada "Pizza Express".
    - Faz perguntas sobre segurança, preço, como funciona
    - Desconfia se é golpe
    - Quer garantias antes de avançar
    - Pergunta se tem contrato
    Simule a conversa de forma realista. Comece perguntando se é confiável.`
  },
  {
    name: "Cliente Confuso",
    description: "Não entende bem tecnologia, precisa de ajuda",
    systemPrompt: `Você é um cliente CONFUSO que não entende bem de tecnologia.
    Você tem uma padaria chamada "Padaria do Seu Zé".
    - Não entende termos técnicos
    - Pergunta coisas básicas
    - Precisa que explique de forma simples
    - Erra nomes e termos
    Simule a conversa de forma realista. Comece dizendo que não entende muito de internet.`
  },
  {
    name: "Cliente com Mídia",
    description: "Quer configurar imagens e catálogo",
    systemPrompt: `Você é um cliente que quer configurar MÍDIAS no agente.
    Você tem uma loja de móveis planejados.
    - Primeiro diz que vende móveis planejados
    - Depois pergunta como adicionar foto do catálogo
    - Quer saber como o agente vai usar as imagens
    Simule a conversa de forma realista.`
  },
  {
    name: "Cliente Exigente",
    description: "Quer tudo perfeito, reclama de detalhes",
    systemPrompt: `Você é um cliente EXIGENTE e detalhista.
    Você tem uma clínica de estética chamada "Clínica Beleza Pura".
    - Quer que o agente fale de forma específica
    - Reclama se algo não está certo
    - Pede para mudar nome, instruções, etc.
    - Quer ver como ficou antes de aprovar
    Simule a conversa de forma realista.`
  }
];

interface ConversationTurn {
  role: "cliente" | "agente";
  message: string;
}

async function simulateClient(
  mistral: any, 
  persona: typeof CLIENT_PERSONAS[0], 
  agentResponse: string,
  history: ConversationTurn[]
): Promise<string> {
  // Montar histórico para contexto
  const historyText = history.map(h => 
    `${h.role === 'cliente' ? 'VOCÊ' : 'RODRIGO'}: ${h.message}`
  ).join('\n');

  const prompt = `${persona.systemPrompt}

HISTÓRICO DA CONVERSA:
${historyText}

ÚLTIMA MENSAGEM DO RODRIGO (vendedor):
"${agentResponse}"

Responda como cliente. Seja natural e realista. Apenas a resposta, sem prefixos.`;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    maxTokens: 200,
    temperature: 0.9,
  });

  return response.choices?.[0]?.message?.content?.toString() || "ok";
}

async function sendToAgent(message: string, phone: string): Promise<string> {
  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: message, phone }),
  });

  const data = await response.json() as any;
  return data.text || data.response || "Erro na resposta";
}

async function runConversation(persona: typeof CLIENT_PERSONAS[0], maxTurns: number = 8): Promise<{
  persona: string;
  conversation: ConversationTurn[];
  analysis: string;
}> {
  const mistral = await getMistralClient();
  const phone = `551199${Math.floor(Math.random() * 9000000 + 1000000)}`;
  const conversation: ConversationTurn[] = [];

  console.log(`\n${"=".repeat(80)}`);
  console.log(`🎭 TESTANDO: ${persona.name}`);
  console.log(`📝 ${persona.description}`);
  console.log(`📱 Telefone simulado: ${phone}`);
  console.log("=".repeat(80));

  // Limpar sessão antes
  await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text: "#limpar", phone }),
  });

  // Primeira mensagem do cliente
  let clientMessage = await simulateClient(mistral, persona, "Comece a conversa", []);
  console.log(`\n👤 CLIENTE: ${clientMessage}`);
  conversation.push({ role: "cliente", message: clientMessage });

  for (let i = 0; i < maxTurns; i++) {
    // Agente responde
    const agentResponse = await sendToAgent(clientMessage, phone);
    console.log(`\n🤖 RODRIGO: ${agentResponse}`);
    conversation.push({ role: "agente", message: agentResponse });

    // Verificar se conversa chegou a um fim natural
    if (agentResponse.includes("SIMULADOR") || agentResponse.includes("/test/")) {
      console.log("\n✅ Link do simulador gerado - conversa concluída!");
      break;
    }

    if (i < maxTurns - 1) {
      // Cliente responde
      await new Promise(r => setTimeout(r, 1000)); // Rate limiting
      clientMessage = await simulateClient(mistral, persona, agentResponse, conversation);
      console.log(`\n👤 CLIENTE: ${clientMessage}`);
      conversation.push({ role: "cliente", message: clientMessage });
    }
  }

  // Analisar a conversa
  const analysisPrompt = `Analise esta conversa entre um vendedor (Rodrigo) e um cliente.

CONVERSA:
${conversation.map(c => `${c.role.toUpperCase()}: ${c.message}`).join('\n\n')}

Avalie de 1 a 10:
1. NATURALIDADE: O Rodrigo parece humano ou robô? Usa frases decoradas?
2. EFICIÊNCIA: Conseguiu ajudar o cliente rapidamente?
3. EMPATIA: Demonstrou entender o cliente?
4. CLAREZA: As explicações foram claras?

Dê uma nota geral e sugira melhorias específicas.`;

  const analysisResponse = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: analysisPrompt }],
    maxTokens: 500,
    temperature: 0.3,
  });

  const analysis = analysisResponse.choices?.[0]?.message?.content?.toString() || "Sem análise";

  console.log(`\n${"─".repeat(80)}`);
  console.log("📊 ANÁLISE DA CONVERSA:");
  console.log(analysis);

  return { persona: persona.name, conversation, analysis };
}

async function main() {
  console.log("\n" + "█".repeat(80));
  console.log("█  🧪 TESTE IA vs IA - CALIBRAÇÃO DO ADMIN AGENT");
  console.log("█  Testando múltiplos tipos de clientes para garantir respostas humanas");
  console.log("█".repeat(80));

  const results: Array<{ persona: string; conversation: ConversationTurn[]; analysis: string }> = [];

  // Testar cada persona
  for (const persona of CLIENT_PERSONAS) {
    try {
      const result = await runConversation(persona, 6);
      results.push(result);
      await new Promise(r => setTimeout(r, 2000)); // Pausa entre testes
    } catch (error) {
      console.error(`❌ Erro no teste ${persona.name}:`, error);
    }
  }

  // Resumo final
  console.log("\n\n" + "█".repeat(80));
  console.log("█  📊 RESUMO FINAL DOS TESTES");
  console.log("█".repeat(80));

  for (const result of results) {
    console.log(`\n🎭 ${result.persona}:`);
    console.log(`   Turnos: ${result.conversation.length}`);
    console.log(`   Análise resumida: ${result.analysis.substring(0, 200)}...`);
  }

  console.log("\n✅ Testes concluídos!");
}

main().catch(console.error);
