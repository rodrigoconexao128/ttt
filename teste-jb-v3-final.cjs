/**
 * Teste JB Elétrica v3 - Validação PF/PJ e Cidade
 * Cenários: 10 fluxos incluindo pessoa física/jurídica e restrição geográfica
 * Uso: node teste-jb-v3-final.cjs
 */

const https = require("https");
require("dotenv").config();

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

const AGENT_PROMPT = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação

## 2. HORÁRIOS DE ATENDIMENTO
- Segunda a sexta: 08h às 12h | 13h30 às 18h
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. SAUDAÇÕES
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL
"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡
Você já é cliente da JB Elétrica?"

## 5. CLIENTES EXISTENTES (SIM)
1. "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
2. Informar preço se tabelado
3. "Você gostaria de agendar?"
4. "Vou transferir para a Jennifer confirmar os detalhes e o horário."
- NÃO pedir dados (já cadastrado)

## 6. NOVOS CLIENTES (NÃO)
1. "Para continuar, por favor me informe seu nome."
2. "Prazer, [NOME]! Qual serviço você gostaria de solicitar?"
3. Informar preço se tabelado
4. "Você gostaria de agendar?"
5. SE SIM: "Esse atendimento será para Pessoa Física ou Pessoa Jurídica?"

### PESSOA FÍSICA:
Solicitar: Nome completo, CPF (11 dígitos), E-mail, Endereço completo

### PESSOA JURÍDICA:
Solicitar: Razão Social, CNPJ, E-mail, Endereço, Nome da pessoa que vai acompanhar

6. Confirmar dados e transferir para Jennifer

## 7. RESTRIÇÃO GEOGRÁFICA
A JB Elétrica atende SOMENTE em Uberlândia-MG.
**IMPORTANTE:** NÃO pergunte preventivamente se é de Uberlândia!
- SOMENTE se cliente mencionar cidade diferente (Araxá, Uberaba, etc.):
"Infelizmente, a JB Elétrica atende somente na cidade de Uberlândia-MG."

## 8. SERVIÇOS COM PREÇOS
- Tomada simples/dupla/tripla – R$ 55,00
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00
- Interruptor – R$ 55,00
- Lustre simples – R$ 97,00
- Lustre grande – R$ 145,00
- DR/IDR – R$ 120,00
- Disjuntor monofásico – R$ 65,00
- Luminária tubular – R$ 55,00

## 9. REGRAS CRÍTICAS
1. NUNCA use menus numéricos
2. NUNCA pergunte horário preferido - transfira para Jennifer
3. SEMPRE informe preço quando tabelado
4. Perguntar PF ou PJ SOMENTE ao cadastrar
5. Só mencionar Uberlândia se cliente falar outra cidade`;

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

// 10 Cenários de teste
const scenarios = [
  {
    name: "1. Saudação Inicial",
    messages: [{ role: "user", content: "Olá" }],
    check: (r) => r.toLowerCase().includes("cliente") && r.includes("JB Elétrica"),
    expected: "Perguntar se é cliente"
  },
  {
    name: "2. Não-cliente → Pedir nome",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      // Deve pedir nome E não deve pedir serviço ainda
      const pedeNome = lower.includes("nome");
      const NAOPedeServico = !lower.includes("qual serviço") && !lower.includes("serviço você");
      return pedeNome && NAOPedeServico;
    },
    expected: "Pedir SOMENTE o nome"
  },
  {
    name: "3. Informar preço da tomada",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Rodrigo" },
      { role: "assistant", content: "Prazer, Rodrigo! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "instalar tomada" }
    ],
    check: (r) => r.includes("55") || r.includes("R$"),
    expected: "Informar preço R$ 55,00"
  },
  {
    name: "4. Perguntar PF ou PJ ao agendar",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Maria" },
      { role: "assistant", content: "Prazer, Maria! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar uma tomada" },
      { role: "assistant", content: "A instalação de tomada simples custa R$ 55,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim, quero agendar" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("pessoa") || lower.includes("física") || lower.includes("jurídica");
    },
    expected: "Perguntar PF ou PJ"
  },
  {
    name: "5. Pessoa Física → Solicitar CPF",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Carlos" },
      { role: "assistant", content: "Prazer, Carlos! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "instalar tomada" },
      { role: "assistant", content: "A instalação de tomada simples custa R$ 55,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Esse atendimento será para Pessoa Física ou Pessoa Jurídica?" },
      { role: "user", content: "Pessoa física" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("cpf") && (lower.includes("email") || lower.includes("e-mail"));
    },
    expected: "Solicitar CPF e E-mail"
  },
  {
    name: "6. Pessoa Jurídica → Solicitar CNPJ",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Ana" },
      { role: "assistant", content: "Prazer, Ana! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "instalar luminária" },
      { role: "assistant", content: "A instalação de luminária tubular custa R$ 55,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Esse atendimento será para Pessoa Física ou Pessoa Jurídica?" },
      { role: "user", content: "Pessoa jurídica" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("cnpj") || lower.includes("razão");
    },
    expected: "Solicitar CNPJ"
  },
  {
    name: "7. Cliente existente → Não pedir dados",
    messages: [
      { role: "user", content: "Bom dia" },
      { role: "assistant", content: "Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("volta") && lower.includes("serviço");
    },
    expected: "Boas-vindas sem pedir dados"
  },
  {
    name: "8. Cliente de Araxá → Recusar",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "João" },
      { role: "assistant", content: "Prazer, João! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar uma tomada, estou em Araxá" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("uberlândia") || lower.includes("somente") || lower.includes("infelizmente");
    },
    expected: "Informar que só atende Uberlândia"
  },
  {
    name: "9. NÃO perguntar cidade preventivamente",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Pedro" },
      { role: "assistant", content: "Prazer, Pedro! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar um chuveiro" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      const informaPreco = r.includes("95") || r.includes("130") || r.includes("R$");
      const NAOPerguntaCidade = !lower.includes("qual cidade") && !lower.includes("de onde você") && !lower.includes("você é de");
      return informaPreco && NAOPerguntaCidade;
    },
    expected: "Informar preço SEM perguntar cidade"
  },
  {
    name: "10. Cliente existente → Transferir Jennifer",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?" },
      { role: "user", content: "Quero instalar um lustre simples" },
      { role: "assistant", content: "A instalação de lustre simples custa R$ 97,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim" }
    ],
    check: (r) => {
      const lower = r.toLowerCase();
      return lower.includes("jennifer") || lower.includes("transferir") || lower.includes("atendente");
    },
    expected: "Transferir para Jennifer"
  }
];

async function runTests() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║        TESTE JB ELÉTRICA v3 - PF/PJ + CIDADE (10 cenários)       ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  const now = new Date();
  const dateStr = now.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const timeStr = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const systemPrompt = AGENT_PROMPT + `\n\nHoje é ${dateStr}. Horário atual: ${timeStr}.`;

  let passed = 0;
  let failed = 0;
  const results = [];

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
        results.push({ name: scenario.name, status: "✅", response });
      } else {
        console.log(`\n❌ FALHOU`);
        failed++;
        results.push({ name: scenario.name, status: "❌", response });
      }
    } catch (error) {
      console.log(`\n❌ ERRO: ${error.message}`);
      failed++;
      results.push({ name: scenario.name, status: "❌", response: error.message });
    }

    await new Promise((r) => setTimeout(r, 1500));
  }

  console.log(`\n${"═".repeat(65)}`);
  console.log(`                         RESUMO FINAL`);
  console.log(`${"═".repeat(65)}`);
  console.log(`✅ Passou: ${passed}/10`);
  console.log(`❌ Falhou: ${failed}/10`);
  console.log(`📊 Taxa de sucesso: ${Math.round((passed / 10) * 100)}%`);

  if (failed > 0) {
    console.log(`\n⚠️  Cenários que falharam:`);
    results.filter((r) => r.status === "❌")
      .forEach((r) => console.log(`   - ${r.name}`));
  }

  if (passed === 10) {
    console.log(`\n🎉 TODOS OS 10 TESTES PASSARAM! Agente calibrado com sucesso!`);
  }

  return { passed, failed, total: 10, percentage: Math.round((passed / 10) * 100) };
}

runTests().catch(console.error);
