/**
 * 🧪 TESTE SIMPLES DO HUMANIZADOR COM MISTRAL
 * Execute: node test-mistral-simple.mjs
 */

import Mistral from "@mistralai/mistralai";

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';
const mistral = new Mistral.default({ apiKey: MISTRAL_API_KEY });

async function humanize(original, type = 'followup') {
  const prompt = `## TAREFA: HUMANIZAR MENSAGEM

Reescreva a mensagem abaixo mantendo 100% do sentido original, mas variando palavras e estrutura.
- Use sinônimos naturais
- Mantenha o tom
- NÃO adicione/remova informações

${type === 'bulk' ? '📢 Mensagem de envio em massa - varie bastante.' : ''}

## MENSAGEM ORIGINAL:
"${original}"

## RESPONDA APENAS COM A MENSAGEM REESCRITA:`;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.8,
    maxTokens: 500,
  });

  let result = response.choices?.[0]?.message?.content || original;
  result = result.replace(/^["']|["']$/g, '').replace(/^(Aqui está|Mensagem reescrita)[:\s]*/gi, '').trim();
  return result;
}

// Testes
const tests = [
  { msg: "Olá! Gostaria de saber se você ainda tem interesse em nosso produto.", type: 'followup' },
  { msg: "Bom dia! Temos uma promoção especial com 30% de desconto!", type: 'bulk' },
  { msg: "Obrigado pelo seu contato! Entrarei em contato em breve.", type: 'response' },
];

console.log("\n🧪 TESTE DO HUMANIZADOR COM IA MISTRAL\n");
console.log("═".repeat(60) + "\n");

for (let i = 0; i < tests.length; i++) {
  const { msg, type } = tests[i];
  console.log(`[${i+1}/${tests.length}] Tipo: ${type}`);
  console.log(`📝 Original:   "${msg}"`);
  
  try {
    const humanized = await humanize(msg, type);
    const isDiff = humanized !== msg;
    console.log(`✨ Humanizada: "${humanized}"`);
    console.log(`${isDiff ? '✅ PASSOU' : '❌ FALHOU - não variou'}\n`);
  } catch (err) {
    console.log(`❌ ERRO: ${err.message}\n`);
  }
  
  // Delay entre testes
  await new Promise(r => setTimeout(r, 1000));
}

console.log("═".repeat(60));
console.log("🎉 Testes concluídos!\n");
