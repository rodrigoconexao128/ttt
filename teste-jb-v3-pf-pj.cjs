/**
 * Teste JB Elétrica v3 - Validação PF/PJ e Cidade
 * Cenários: 10 fluxos diferentes incluindo pessoa física/jurídica e restrição geográfica
 */

const https = require("https");
require("dotenv").config();

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

const AGENT_PROMPT = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação (máximo 1-2 por mensagem)

## 2. HORÁRIOS DE ATENDIMENTO (HORÁRIO DE BRASÍLIA)
- Segunda a sexta: 08h às 12h | 13h30 às 18h
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. SAUDAÇÕES (usar conforme horário atual)
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL - PRIMEIRA MENSAGEM
Ao receber qualquer mensagem inicial, SEMPRE responder:
"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

## 5. FLUXO PARA CLIENTES EXISTENTES (respondeu SIM)
1. IA: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
2. Cliente informa o serviço
3. Se serviço tiver preço tabelado → informar valor
4. Perguntar: "Você gostaria de agendar esse serviço?"
5. Se SIM → "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde!"

## 6. FLUXO PARA NOVOS CLIENTES (respondeu NÃO)
### ETAPA 1 - Nome:
IA: "Para continuar, por favor me informe seu nome."

### ETAPA 2 - Serviço:
IA: "Prazer, [NOME]! Qual serviço você gostaria de solicitar?"

### ETAPA 3 - Informar preço (se tabelado) e perguntar se quer agendar

### ETAPA 4 - Tipo de pessoa (SOMENTE se cliente quiser agendar):
IA: "Esse atendimento será para Pessoa Física ou Pessoa Jurídica?"

### ETAPA 5 - Coleta de dados:
**PESSOA FÍSICA:** Nome completo, CPF (11 dígitos), E-mail, Endereço completo
**PESSOA JURÍDICA:** Razão Social, CNPJ, E-mail, Endereço, Nome da pessoa que vai acompanhar

### ETAPA 6 - Confirmação e Transferência para Jennifer

## 7. RESTRIÇÃO GEOGRÁFICA - UBERLÂNDIA
**IMPORTANTE:** A JB Elétrica atende SOMENTE em Uberlândia-MG.
**REGRA:** NÃO pergunte preventivamente se é de Uberlândia. 
- SOMENTE se o cliente mencionar uma cidade diferente, responda:
"Infelizmente, a JB Elétrica atende somente na cidade de Uberlândia-MG."

## 8. SERVIÇOS COM VALORES TABELADOS
- Tomada simples/dupla/tripla – R$ 55,00
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00
- Troca de resistência – R$ 75,00
- Interruptor simples/duplo/bipolar – R$ 55,00
- Lustre simples – R$ 97,00
- Lustre grande – R$ 145,00
- Ventilador de teto sem passagem de fio – R$ 120,00
- Ventilador de teto com passagem de fio – R$ 150,00
- IDR (DR) – R$ 120,00
- Disjuntor monofásico – R$ 65,00

## 9. DÚVIDAS TÉCNICAS
**DR desarmando:** Orientar teste de equipamentos um a um
**Falta de energia:** Perguntar se já ligou para CEMIG

## 10. REGRAS CRÍTICAS
1. NUNCA use menus numéricos
2. NUNCA pergunte horário preferido - transfira para Jennifer
3. SEMPRE informe preço quando tabelado
4. Perguntar PF ou PJ SOMENTE quando for cadastrar
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
    check: (r: string) => r.toLowerCase().includes("cliente") && r.includes("JB Elétrica"),
    expected: "Perguntar se é cliente da JB Elétrica"
  },
  {
    name: "2. Não-cliente → Pedir nome",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" }
    ],
    check: (r: string) => r.toLowerCase().includes("nome"),
    expected: "Pedir o nome do cliente"
  },
  {
    name: "3. Não-cliente → Informar serviço e preço",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Rodrigo" },
      { role: "assistant", content: "Prazer, Rodrigo! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "instalar tomada" }
    ],
    check: (r: string) => r.includes("55") || r.includes("R$"),
    expected: "Informar preço R$ 55,00"
  },
  {
    name: "4. Não-cliente → Perguntar PF ou PJ ao agendar",
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
    check: (r: string) => {
      const lower = r.toLowerCase();
      return lower.includes("pessoa física") || lower.includes("pessoa jurídica") || 
             lower.includes("pf") || lower.includes("pj") ||
             lower.includes("física") || lower.includes("jurídica");
    },
    expected: "Perguntar se é Pessoa Física ou Jurídica"
  },
  {
    name: "5. Pessoa Física → Solicitar dados PF",
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
    check: (r: string) => {
      const lower = r.toLowerCase();
      return (lower.includes("cpf") || lower.includes("nome completo")) && 
             (lower.includes("email") || lower.includes("e-mail"));
    },
    expected: "Solicitar CPF, Nome completo, E-mail, Endereço"
  },
  {
    name: "6. Pessoa Jurídica → Solicitar dados PJ",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Ana" },
      { role: "assistant", content: "Prazer, Ana! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "instalar luminária" },
      { role: "assistant", content: "A instalação de luminária tubular custa R$ 55,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim, quero agendar" },
      { role: "assistant", content: "Esse atendimento será para Pessoa Física ou Pessoa Jurídica?" },
      { role: "user", content: "Pessoa jurídica" }
    ],
    check: (r: string) => {
      const lower = r.toLowerCase();
      return lower.includes("cnpj") || lower.includes("razão social");
    },
    expected: "Solicitar CNPJ, Razão Social"
  },
  {
    name: "7. Cliente existente → Fluxo simples",
    messages: [
      { role: "user", content: "Bom dia" },
      { role: "assistant", content: "Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim, já sou cliente" }
    ],
    check: (r: string) => {
      const lower = r.toLowerCase();
      return lower.includes("volta") && lower.includes("serviço");
    },
    expected: "Dar boas-vindas e perguntar qual serviço"
  },
  {
    name: "8. Cliente fora de Uberlândia → Recusar educadamente",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "João" },
      { role: "assistant", content: "Prazer, João! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar uma tomada, estou em Araxá" }
    ],
    check: (r: string) => {
      const lower = r.toLowerCase();
      return lower.includes("uberlândia") || lower.includes("somente") || lower.includes("apenas");
    },
    expected: "Informar que atende somente Uberlândia"
  },
  {
    name: "9. Cliente de Uberlândia → NÃO perguntar cidade",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Pedro" },
      { role: "assistant", content: "Prazer, Pedro! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar um chuveiro" }
    ],
    check: (r: string) => {
      const lower = r.toLowerCase();
      // Deve informar preço SEM perguntar se é de Uberlândia
      const informaPreco = r.includes("95") || r.includes("130") || r.includes("R$");
      const NAOPerguntaCidade = !lower.includes("qual cidade") && !lower.includes("de onde") && !lower.includes("você é de");
      return informaPreco && NAOPerguntaCidade;
    },
    expected: "Informar preço sem perguntar cidade"
  },
  {
    name: "10. Cliente existente → Transferir para Jennifer",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa noite! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?" },
      { role: "user", content: "Quero instalar um lustre" },
      { role: "assistant", content: "A instalação de lustre simples custa R$ 97,00 e lustre grande R$ 145,00. Qual você gostaria?" },
      { role: "user", content: "Simples" },
      { role: "assistant", content: "Perfeito! Lustre simples por R$ 97,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim" }
    ],
    check: (r: string) => {
      const lower = r.toLowerCase();
      return lower.includes("jennifer") || lower.includes("transferir") || lower.includes("atendente");
    },
    expected: "Transferir para Jennifer (não pedir dados)"
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
  const results: { name: string; status: string; response: string }[] = [];

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n${"─".repeat(65)}`);
    console.log(`📋 ${scenario.name}`);
    console.log(`   Esperado: ${scenario.expected}`);
    console.log(`${"─".repeat(65)}`);

    const messages = [
      { role: "system" as const, content: systemPrompt },
      ...scenario.messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
    ];

    const lastUserMsg = scenario.messages.filter((m) => m.role === "user").pop();
    console.log(`👤 Cliente: ${lastUserMsg?.content}`);

    try {
      const response = await callMistral(messages);
      console.log(`🤖 Agente: ${response}`);

      const testPassed = scenario.check(response);
      if (testPassed) {
        console.log(`\n✅ PASSOU`);
        passed++;
        results.push({ name: scenario.name, status: "✅ PASSOU", response });
      } else {
        console.log(`\n❌ FALHOU`);
        failed++;
        results.push({ name: scenario.name, status: "❌ FALHOU", response });
      }
    } catch (error: any) {
      console.log(`\n❌ ERRO: ${error.message}`);
      failed++;
      results.push({ name: scenario.name, status: "❌ ERRO", response: error.message });
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
    results.filter((r) => r.status.includes("FALHOU") || r.status.includes("ERRO"))
      .forEach((r) => console.log(`   - ${r.name}`));
  }

  if (passed === 10) {
    console.log(`\n🎉 TODOS OS 10 TESTES PASSARAM! Agente calibrado com sucesso!`);
  }

  return { passed, failed, total: 10, percentage: Math.round((passed / 10) * 100) };
}

runTests().catch(console.error);
