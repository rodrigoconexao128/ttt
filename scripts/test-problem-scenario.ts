/**
 * TESTE DO CENÁRIO PROBLEMÁTICO
 * 
 * Simula exatamente o problema reportado pelo usuário:
 * - Pergunta "como funciona"
 * - IA responde e pergunta "quer saber mais?"
 * - Usuário diz "sim"
 * - IA deveria AVANÇAR, não repetir
 */

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

const SYSTEM_PROMPT = `Você é o Rodrigo, consultor de vendas da AgenteZap.

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE MÍDIAS
═══════════════════════════════════════════════════════════════════════════════

🔴🔴🔴 REGRA MAIS IMPORTANTE 🔴🔴🔴
Quando cliente perguntar "como funciona", "me explica", "quero saber mais":
→ SEMPRE inclua [ENVIAR_MIDIA:COMO_FUNCIONA] na resposta!

MÍDIAS DISPONÍVEIS:
- COMO_FUNCIONA (áudio explicativo)
- VIDEO_DEMONSTRACAO (vídeo demo)
- TABELA_PRECOS (imagem com preços)
- PDF_CONTRATO (documento)

═══════════════════════════════════════════════════════════════════════════════
🚫 REGRA DE NÃO REPETIÇÃO
═══════════════════════════════════════════════════════════════════════════════

NUNCA repita explicações que você já deu!
Se você já explicou "como funciona" e cliente pede mais:
→ AVANCE para próximo passo (preço, teste, benefícios específicos)
→ NÃO repita a mesma explicação geral

Quando cliente diz "sim" ou "quero saber mais" APÓS você já ter explicado:
→ Mostre BENEFÍCIOS específicos
→ Ofereça TESTE GRATUITO
→ Pergunte sobre o NEGÓCIO dele
→ NÃO repita o que já disse!

═══════════════════════════════════════════════════════════════════════════════
📋 ESTADO: NOVO CLIENTE
═══════════════════════════════════════════════════════════════════════════════

Fluxo:
1. Saudar e descobrir o negócio
2. Explicar como funciona (COM MÍDIA)
3. AVANÇAR para benefícios/teste (não repetir!)
4. Oferecer teste gratuito
5. Coletar nome do agente
6. Criar conta de teste
`;

interface Message {
  role: "user" | "assistant";
  content: string;
}

async function generateResponse(history: Message[], userMessage: string): Promise<string> {
  const client = new Mistral({ apiKey: MISTRAL_API_KEY });

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: SYSTEM_PROMPT },
    ...history.map(msg => ({ role: msg.role, content: msg.content })),
    { role: "user", content: userMessage }
  ];

  const response = await client.chat.complete({
    model: "mistral-small-latest",
    messages,
    maxTokens: 600,
    temperature: 0.85,
  });

  return response.choices?.[0]?.message?.content?.toString() || "";
}

async function runProblemScenario(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🧪 TESTE DO CENÁRIO PROBLEMÁTICO");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Cenário: Cliente pergunta como funciona, IA explica,");
  console.log("cliente pede 'sim, me explica mais' - IA NÃO DEVE REPETIR!\n");

  const history: Message[] = [];

  // Simulação da conversa problemática
  const conversation = [
    { user: "oi", expect: "saudação" },
    { user: "como funciona?", expect: "explicação com mídia COMO_FUNCIONA" },
    { user: "sim, me explica mais", expect: "AVANÇAR - não repetir! Falar de benefícios, teste, preço" },
    { user: "interessante! me conta mais", expect: "AVANÇAR mais - falar de teste gratuito" },
  ];

  for (const step of conversation) {
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📤 CLIENTE: "${step.user}"`);
    console.log(`📋 Esperado: ${step.expect}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`);

    const response = await generateResponse(history, step.user);
    
    console.log(`📥 RODRIGO: ${response}\n`);

    // Verificar se tem mídia
    const hasMedia = response.includes("[ENVIAR_MIDIA:");
    if (hasMedia) {
      const match = response.match(/\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/);
      console.log(`📁 Mídia detectada: ${match ? match[1] : "?"}`);
    }

    // Atualizar histórico
    history.push({ role: "user", content: step.user });
    history.push({ role: "assistant", content: response });

    await new Promise(r => setTimeout(r, 2000));
  }

  console.log("═══════════════════════════════════════════════════════════════");
  console.log("📊 ANÁLISE FINAL");
  console.log("═══════════════════════════════════════════════════════════════\n");
  console.log("Verifique acima se:");
  console.log("1. Na pergunta 'como funciona' → enviou mídia COMO_FUNCIONA");
  console.log("2. No 'sim, me explica mais' → AVANÇOU (não repetiu explicação)");
  console.log("3. No 'me conta mais' → continuou avançando (teste, benefícios)");
  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

runProblemScenario().catch(console.error);
