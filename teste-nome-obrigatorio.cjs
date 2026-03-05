/**
 * Teste CRÍTICO - Validar que agente SEMPRE pede o nome para novos clientes
 * Uso: node teste-nome-obrigatorio.cjs
 */

const https = require("https");
require("dotenv").config();

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

// Prompt atualizado com ênfase em SEMPRE pedir nome
const AGENT_PROMPT = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural

## 2. FLUXO INICIAL
"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡
Você já é cliente da JB Elétrica?"

## 3. CLIENTES EXISTENTES (SIM)
"Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"

## 4. NOVOS CLIENTES (NÃO)

**⚠️ REGRA CRÍTICA - SEMPRE PEDIR O NOME PRIMEIRO ⚠️**

Quando o cliente responder "NÃO" para a pergunta se é cliente, você DEVE OBRIGATORIAMENTE responder APENAS:

"Para continuar, por favor me informe seu nome."

**NÃO PULE ESTA ETAPA!** Mesmo que você tenha outras informações do cliente, você PRECISA pedir o nome explicitamente porque faremos um cadastro.

APÓS receber o nome:
"Prazer, [NOME]! Qual serviço você gostaria de solicitar?"

## 5. SERVIÇOS COM PREÇOS
- Tomada – R$ 55,00
- Chuveiro simples – R$ 95,00
- Chuveiro luxo – R$ 130,00

## 6. REGRAS
1. SEMPRE pedir nome quando cliente responder "NÃO"
2. NUNCA pular a pergunta do nome
3. Perguntar PF ou PJ ao agendar
4. Transferir para Jennifer`;

function callMistral(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: "mistral-small-latest",
      messages: messages,
      max_tokens: 500,
      temperature: 0.7,
    });

    const options = {
      hostname: "api.mistral.ai",
      port: 443,
      path: "/v1/chat/completions",
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MISTRAL_API_KEY}`,
        "Content-Length": Buffer.byteLength(data),
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error("Resposta inválida: " + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on("error", reject);
    req.write(data);
    req.end();
  });
}

// Teste focado em validar que SEMPRE pede o nome
const scenarios = [
  {
    name: "1. Cliente responde NÃO → DEVE pedir nome",
    messages: [
      { role: "user", content: "oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "não" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      // Deve pedir nome E não deve pedir serviço ainda
      const pedeNome = lower.includes("nome");
      const NAOPedeServico = !lower.includes("qual serviço") && !lower.includes("serviço você");
      return pedeNome && NAOPedeServico;
    },
    expected: "Pedir SOMENTE o nome, sem pular para serviço"
  },
  {
    name: "2. Cliente responde 'nao' → DEVE pedir nome",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "nao" }
    ],
    check: (r) => r.toLowerCase().includes("nome") && !r.toLowerCase().includes("qual serviço"),
    expected: "Pedir o nome"
  },
  {
    name: "3. Cliente responde 'não sou' → DEVE pedir nome",
    messages: [
      { role: "user", content: "Olá" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "não sou cliente" }
    ],
    check: (r) => r.toLowerCase().includes("nome"),
    expected: "Pedir o nome"
  },
  {
    name: "4. Após receber nome → Perguntar serviço",
    messages: [
      { role: "user", content: "oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Rodrigo" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("prazer") && lower.includes("rodrigo") && lower.includes("serviço");
    },
    expected: "Saudar com nome e perguntar serviço"
  },
  {
    name: "5. Cliente existente → NÃO pedir nome",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      const NAOPedeNome = !lower.includes("me informe seu nome") && !lower.includes("qual seu nome");
      const pedeServico = lower.includes("serviço");
      return NAOPedeNome && pedeServico;
    },
    expected: "NÃO pedir nome, apenas serviço"
  }
];

async function runTests() {
  console.log('\n╔═════════════════════════════════════════════════════════════════╗');
  console.log('║   TESTE CRÍTICO - VALIDAR QUE SEMPRE PEDE NOME (5 cenários)    ║');
  console.log('╚═════════════════════════════════════════════════════════════════╝\n');

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const systemPrompt = AGENT_PROMPT + `\n\nHoje é ${dateStr}. Horário atual: ${timeStr}.`;

  let passed = 0;
  let failed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n${"─".repeat(65)}`);
    console.log(`📋 ${scenario.name}`);
    console.log(`   Esperado: ${scenario.expected}`);
    console.log(`${"─".repeat(65)}`);

    const messages = [
      { role: "system", content: systemPrompt },
      ...scenario.messages
    ];

    const lastUserMsg = scenario.messages.filter((m) => m.role === "user").pop();
    console.log(`👤 Cliente: ${lastUserMsg.content}`);

    try {
      const response = await callMistral(messages);
      console.log(`🤖 Agente: ${response}`);

      const testPassed = scenario.check(response);
      if (testPassed) {
        console.log(`\n✅ PASSOU`);
        passed++;
      } else {
        console.log(`\n❌ FALHOU - Não está pedindo o nome corretamente`);
        failed++;
      }
    } catch (error) {
      console.log(`\n❌ ERRO: ${error.message}`);
      failed++;
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`                         RESUMO FINAL`);
  console.log(`${"═".repeat(65)}`);
  console.log(`✅ Passou: ${passed}/5`);
  console.log(`❌ Falhou: ${failed}/5`);
  console.log(`📊 Taxa de sucesso: ${Math.round((passed / 5) * 100)}%`);

  if (passed === 5) {
    console.log(`\n🎉 PERFEITO! Agente SEMPRE pede o nome para novos clientes!`);
  } else {
    console.log(`\n⚠️  ATENÇÃO: Agente ainda pula a pergunta do nome em alguns casos!`);
  }

  return { passed, failed, total: 5 };
}

runTests().catch(console.error);
