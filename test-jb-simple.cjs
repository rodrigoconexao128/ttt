/**
 * Teste Simples do Agente JB Elétrica
 * Uso: node test-jb-simple.cjs
 */

const https = require('https');
require('dotenv').config();

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;

const AGENT_PROMPT = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação

## 2. HORÁRIOS DE ATENDIMENTO (VERIFICAR SEMPRE)
- Segunda a sexta: 08h às 12h | 13h30 às 18h (Horário de Brasília)
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. SAUDAÇÕES (usar conforme horário)
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde  
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL OBRIGATÓRIO

### PRIMEIRA MENSAGEM DO CLIENTE (Olá, Oi, Bom dia, etc):
SEMPRE responder com:
"[Saudação conforme horário]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

### SE CLIENTE RESPONDER SIM (já é cliente):
"Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"

- NÃO peça dados do cliente (já está cadastrado)
- Colete informações sobre o serviço desejado
- Se o serviço tiver preço tabelado, informe o valor
- Ao finalizar: "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde um momento!"

### SE CLIENTE RESPONDER NÃO (não é cliente):
⚠️ **OBRIGATÓRIO - NÃO PULE ESTA ETAPA:**
Responder EXATAMENTE com:
"Para continuar, por favor me informe seu nome."

Aguardar o cliente informar o nome. SOMENTE DEPOIS que informar o nome:
"Prazer, [NOME]! Qual serviço você gostaria de solicitar?"

## 5. FLUXO PARA NÃO-CLIENTES

1. Perguntar o nome PRIMEIRO (obrigatório)
2. Cliente informa serviço desejado
2. **IMPORTANTE:** Se o serviço tiver preço tabelado na lista abaixo → SEMPRE informar o valor
3. Se não tiver preço na lista → "Para esse serviço, precisamos agendar uma visita técnica para avaliar."
4. Perguntar: "Você gostaria de agendar?"
5. Se SIM, coletar dados:
   - Nome completo
   - CPF (11 dígitos)
   - E-mail
   - Endereço completo
   
   Diga: "Não se preocupe, seus dados estão seguros conosco! 🔒"

6. Após coletar dados, confirmar:
   "Confirma os dados?
   - Nome: [nome]
   - CPF: [cpf]
   - E-mail: [email]
   - Endereço: [endereço]"

7. Se confirmado: "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde!"

## 6. SERVIÇOS COM VALORES TABELADOS (SEMPRE INFORMAR O PREÇO)

**INSTALAÇÃO DE TOMADAS:**
- Tomada simples – R$ 55,00
- Tomada dupla – R$ 55,00
- Tomada tripla – R$ 55,00
→ Se cliente pedir "tomada" sem especificar, informar: "A instalação de tomada simples custa R$ 55,00"

**INSTALAÇÃO DE CHUVEIROS:**
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00
- Troca de resistência de chuveiro – R$ 75,00

**OUTROS SERVIÇOS COM PREÇO:**
- Torneira elétrica – R$ 105,00
- Interruptor simples/duplo/bipolar – R$ 55,00
- Luminária tubular – R$ 55,00
- Perfil de LED (1 metro) – R$ 150,00
- Lustre simples – R$ 97,00
- Lustre grande – R$ 145,00
- Ventilador de teto sem passagem de fio – R$ 120,00
- Ventilador de teto com passagem de fio – R$ 150,00
- IDR (DR) – R$ 120,00
- Disjuntor monofásico – R$ 65,00
- Conversão de tomada 127v/220v – R$ 55,00

## 7. DÚVIDAS TÉCNICAS

**DR desarmando:**
"Pode ser problema em algum equipamento. Faça o seguinte teste:
1. Tire todos os equipamentos da tomada
2. Ligue o DR de volta
3. Se ligar, vá ligando os equipamentos um por um
4. Assim você identifica qual está causando o problema
Se continuar desarmando mesmo com tudo desligado, é melhor chamar um técnico."

**Quadro pegando fogo:**
"Por favor, mantenha a calma! Desligue a chave geral e ligue para o Corpo de Bombeiros (193)."

## 8. REGRAS IMPORTANTES

1. **NUNCA prometa horários específicos** - Sempre transfira para Jennifer
2. **SE cliente adicionar mais serviços:** "Perfeito! Vou incluir [novo serviço] na sua solicitação."
3. **SE for assunto que não é sobre serviços elétricos:** "Sobre isso não tenho informações, mas posso verificar com a equipe."
4. **Ar-condicionado:** Fazemos apenas o ponto elétrico, não a instalação do aparelho em si.`;

// Função para chamar a API Mistral
function callMistral(messages) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      model: 'mistral-small-latest',
      messages: messages,
      max_tokens: 500,
      temperature: 0.7
    });

    const options = {
      hostname: 'api.mistral.ai',
      port: 443,
      path: '/v1/chat/completions',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Length': Buffer.byteLength(data)
      }
    };

    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(body);
          if (json.choices && json.choices[0]) {
            resolve(json.choices[0].message.content);
          } else {
            reject(new Error('Resposta inválida: ' + body));
          }
        } catch (e) {
          reject(e);
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

// Cenários de teste
const scenarios = [
  {
    name: "Teste 1: Saudação Inicial",
    messages: [
      { role: "user", content: "Olá" }
    ],
    check: (r) => r.includes("cliente") && (r.includes("JB Elétrica") || r.includes("bem-vindo"))
  },
  {
    name: "Teste 2: Não-cliente responde Não",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" }
    ],
    check: (r) => r.toLowerCase().includes("nome")
  },
  {
    name: "Teste 3: Cliente existente",
    messages: [
      { role: "user", content: "Bom dia" },
      { role: "assistant", content: "Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" }
    ],
    check: (r) => r.includes("volta") && r.toLowerCase().includes("serviço")
  },
  {
    name: "Teste 4: Preço de tomada",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Carlos" },
      { role: "assistant", content: "Prazer, Carlos! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero instalar uma tomada" }
    ],
    check: (r) => r.includes("55") || r.includes("R$")
  },
  {
    name: "Teste 5: DR desarmando",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?" },
      { role: "user", content: "Meu DR fica desarmando toda hora" }
    ],
    check: (r) => r.toLowerCase().includes("equipamento") || r.toLowerCase().includes("teste") || r.toLowerCase().includes("deslig")
  },
  {
    name: "Teste 6: Cliente adiciona serviço",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim" },
      { role: "assistant", content: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?" },
      { role: "user", content: "Quero instalar um chuveiro" },
      { role: "assistant", content: "Perfeito! A instalação de chuveiro elétrico simples custa R$ 95,00 e a versão luxo R$ 130,00. Qual você prefere?" },
      { role: "user", content: "Simples. Ah, também quero uma tomada" }
    ],
    check: (r) => r.toLowerCase().includes("inclui") || r.toLowerCase().includes("junto") || r.toLowerCase().includes("também")
  },
  {
    name: "Teste 7: Emergência",
    messages: [
      { role: "user", content: "Socorro, meu quadro de luz está pegando fogo!" }
    ],
    check: (r) => r.includes("193") || r.toLowerCase().includes("bombeiro") || r.toLowerCase().includes("calma")
  },
  {
    name: "Teste 8: Transferir para Jennifer (cliente existente)",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Sim, já sou cliente" },
      { role: "assistant", content: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?" },
      { role: "user", content: "Quero instalar um lustre simples" },
      { role: "assistant", content: "Ótimo! A instalação de lustre simples custa R$ 97,00. Você gostaria de agendar?" },
      { role: "user", content: "Sim, quero agendar" }
    ],
    check: (r) => r.toLowerCase().includes("jennifer") || r.toLowerCase().includes("atendente") || r.toLowerCase().includes("transferir")
  },
  {
    name: "Teste 9: Visita técnica",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Maria" },
      { role: "assistant", content: "Prazer, Maria! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Quero fazer a instalação elétrica completa da minha casa" }
    ],
    check: (r) => r.toLowerCase().includes("visita") || r.toLowerCase().includes("técnic") || r.toLowerCase().includes("avaliar")
  },
  {
    name: "Teste 10: Serviço não listado",
    messages: [
      { role: "user", content: "Oi" },
      { role: "assistant", content: "Boa tarde! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?" },
      { role: "user", content: "Não" },
      { role: "assistant", content: "Para continuar, por favor me informe seu nome." },
      { role: "user", content: "Pedro" },
      { role: "assistant", content: "Prazer, Pedro! Qual serviço você gostaria de solicitar?" },
      { role: "user", content: "Vocês instalam ar-condicionado?" }
    ],
    check: (r) => r.toLowerCase().includes("ponto") || r.toLowerCase().includes("elétric") || r.toLowerCase().includes("verificar")
  }
];

async function runTests() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║         TESTE DO AGENTE JB ELÉTRICA - 10 CENÁRIOS            ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  
  const systemPrompt = AGENT_PROMPT + `\n\nHoje é ${dateStr}. Horário atual: ${timeStr}.`;
  
  let passed = 0;
  let failed = 0;

  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`\n${'─'.repeat(60)}`);
    console.log(`📋 ${scenario.name}`);
    console.log(`${'─'.repeat(60)}`);

    const messages = [
      { role: 'system', content: systemPrompt },
      ...scenario.messages
    ];

    // Mostra última mensagem do cliente
    const lastUserMsg = scenario.messages.filter(m => m.role === 'user').pop();
    console.log(`👤 Cliente: ${lastUserMsg.content}`);

    try {
      const response = await callMistral(messages);
      console.log(`🤖 Agente: ${response}`);

      const testPassed = scenario.check(response);
      if (testPassed) {
        console.log(`\n✅ PASSOU`);
        passed++;
      } else {
        console.log(`\n❌ FALHOU - Resposta não atende ao esperado`);
        failed++;
      }
    } catch (error) {
      console.log(`\n❌ ERRO: ${error.message}`);
      failed++;
    }

    // Pausa entre testes
    await new Promise(r => setTimeout(r, 1500));
  }

  console.log(`\n${'═'.repeat(60)}`);
  console.log(`                      RESUMO FINAL`);
  console.log(`${'═'.repeat(60)}`);
  console.log(`✅ Passou: ${passed}/10`);
  console.log(`❌ Falhou: ${failed}/10`);
  console.log(`📊 Taxa de sucesso: ${Math.round(passed/10*100)}%`);
  
  if (passed === 10) {
    console.log(`\n🎉 TODOS OS TESTES PASSARAM! Agente calibrado com sucesso!`);
  } else {
    console.log(`\n⚠️  Alguns testes falharam. Revise o prompt.`);
  }
}

runTests().catch(console.error);
