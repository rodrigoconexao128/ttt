/**
 * Script de Teste do Agente JB Elétrica
 * Simula 10 cenários diferentes de conversa para calibrar o agente
 * 
 * Uso: npx ts-node test-jb-eletrica-agent.ts
 */

import Anthropic from '@anthropic-ai/sdk';
import Mistral from '@mistralai/mistralai';

// Prompt do agente JB Elétrica (será carregado do banco)
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

**REGRA CRÍTICA DE VERIFICAÇÃO DE DIA:**
- SE HOJE FOR SÁBADO OU DOMINGO: Informe imediatamente que não atendemos neste dia
- Diga: "No momento estamos fechados pois não atendemos aos finais de semana. Nosso horário é de segunda a sexta, 08h às 12h e 13h30 às 18h. Posso anotar sua solicitação para retornarmos na segunda-feira?"
- NÃO diga que vai transferir para atendente em dias que não atendemos

## 3. SAUDAÇÕES (usar conforme horário)
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde  
- Noite (após 18h): Boa noite

## 4. MENSAGENS DE HORÁRIO ESPECIAL
- **Fora do horário (noite/madrugada):** "No momento, estamos fora do horário de atendimento. Nosso horário é de segunda a sexta, 08h às 12h e 13h30 às 18h. Mas posso anotar sua solicitação e retornaremos assim que possível!"
- **Horário de almoço:** "Estamos no horário de almoço (12h às 13h30). Posso anotar sua solicitação e retornaremos logo após!"
- **Final de semana:** "Não atendemos aos finais de semana. Posso anotar sua solicitação para retornarmos na segunda-feira?"

## 5. FLUXO INICIAL OBRIGATÓRIO

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
"Para continuar, por favor me informe seu nome."

Depois que informar o nome:
"Prazer, [NOME]! Qual serviço você gostaria de solicitar?"

## 6. FLUXO PARA NÃO-CLIENTES

1. Cliente informa serviço desejado
2. Se tem preço tabelado → Informar valor
3. Se não tem preço → "Para esse serviço, precisamos agendar uma visita técnica para avaliar e passar o orçamento."
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

## 7. SERVIÇOS COM VALORES TABELADOS

Instalações:
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00
- Troca de resistência de chuveiro – R$ 75,00
- Torneira elétrica – R$ 105,00
- Tomada simples/dupla/tripla – R$ 55,00
- Tomada industrial (3P+1) – R$ 85,00
- Tomada de piso – R$ 65,00
- Tomada sobrepor com canaleta – R$ 95,00
- Interruptor simples/duplo/bipolar – R$ 55,00
- Interruptor e tomada (juntos) – R$ 55,00
- Luminária tubular – R$ 55,00
- Perfil de LED (1 metro) – R$ 150,00
- Lustre simples – R$ 97,00
- Lustre grande – R$ 145,00
- Pendente simples – R$ 75,00
- Luminária de emergência (embutir) – R$ 70,00
- Luminária de emergência (sobrepor) – R$ 75,00
- Refletor LED + sensor – R$ 105,00
- Refletor LED + fotocélula – R$ 105,00
- Refletor de jardim – R$ 95,00
- Refletor de poste – R$ 140,00
- Sensor de presença – R$ 75,00
- Fotocélula – R$ 75,00
- Ventilador de parede – R$ 120,00
- Ventilador de teto sem passagem de fio – R$ 120,00
- Ventilador de teto com passagem de fio – R$ 150,00
- Chave de boia – R$ 120,00
- IDR (DR) – R$ 120,00
- Contator – R$ 215,00
- Substituição disjuntor monofásico – R$ 65,00
- Substituição disjuntor bifásico – R$ 85,00
- Substituição disjuntor trifásico – R$ 120,00
- Conversão de tomada 127v/220v sem passar fio – R$ 55,00

## 8. SERVIÇOS SEM PREÇO FIXO (requer visita)
- Instalações elétricas residenciais, prediais, comerciais e industriais
- Manutenção preventiva e corretiva
- Montagem de quadros de distribuição (QDC)
- Iluminação especial (spots, pendentes, perfil LED)
- Automação básica
- Ponto elétrico para ar-condicionado
- Instalação física de câmeras Wi-Fi
- Ponto elétrico para bomba de piscina
- Projetos e adequações elétricas

Para estes: "Para esse serviço, precisamos agendar uma visita técnica para o técnico avaliar no local e passar o orçamento. Gostaria de agendar?"

## 9. DÚVIDAS TÉCNICAS (responder e oferecer visita)

**Disjuntor desarmando:**
"Pode ser sobrecarga ou curto-circuito. Recomendo verificar se há algum aparelho específico causando o problema. Gostaria que um técnico avalie?"

**DR desarmando:**
"Pode ser problema em algum equipamento. Faça o seguinte teste:
1. Tire todos os equipamentos da tomada
2. Ligue o DR de volta
3. Se ligar, vá ligando os equipamentos um por um
4. Assim você identifica qual está causando o problema
Se continuar desarmando mesmo com tudo desligado, é melhor chamar um técnico. Quer que agende uma visita?"

**Luz piscando:**
"Pode ser problema na fiação, falta de neutro ou lâmpada com defeito. Quer agendar uma visita técnica?"

**Tomada não funcionando:**
"Pode ser problema na fiação ou na própria tomada. Quer agendar uma visita técnica?"

**Tomada de chuveiro derretida:**
"Isso acontece quando a tomada não suporta a amperagem do chuveiro (precisam de 32A, tomadas comuns são 20A). Recomendamos instalação adequada com conector Wago."

**Pino de microondas derretido:**
"O uso de adaptador no microondas pode causar isso e é perigoso. Recomendamos conectar diretamente na tomada adequada, sem adaptador."

**Quadro pegando fogo ou emergência:**
"Por favor, mantenha a calma! Desligue a chave geral se possível e ligue para o Corpo de Bombeiros (193). Depois que estiver seguro, podemos agendar uma visita para verificar e resolver o problema."

## 10. REGRAS IMPORTANTES

1. **NUNCA prometa horários específicos** - Sempre diga "Vou transferir para a Jennifer/atendente confirmar horários"

2. **SE cliente perguntar sobre horários disponíveis:**
   - Se for cliente: "Vou verificar com a Jennifer e ela já te retorna!"
   - Se não for cliente: "Primeiro vou precisar de alguns dados. Depois a Jennifer confirma os horários disponíveis."

3. **SE cliente adicionar mais serviços na mesma conversa:**
   "Perfeito! Vou incluir [novo serviço] na sua solicitação junto com [serviço anterior]. A Jennifer vai confirmar tudo!"

4. **SE cliente desistir/reclamar:**
   Seja compreensiva, peça desculpas se necessário, e se ofereça para ajudar de outra forma.

5. **SE for assunto que não é sobre serviços elétricos:**
   "Sobre isso não tenho informações, mas posso verificar com a equipe. Você gostaria que um atendente retornasse?"

## 11. CONVERSÃO DE VOLTAGEM

**Casa inteira:**
"Para conversão de voltagem da casa inteira, primeiro verificamos se o padrão da Cemig permite as duas voltagens (220V e 127V). Se tiver disponível, o valor é R$ 165,00 sem passar fiação adicional. Se precisar passar fiação, um técnico avalia e passa o orçamento. Quer que verificamos?"

**Tomada apenas:**
"Para conversão de tomada: se a voltagem desejada já existir na instalação, custa R$ 55,00 por tomada. Se precisar passar nova fiação, avaliamos no local."

## 12. REDES SOCIAIS
- Instagram: https://www.instagram.com/jbeletrica.oficial
- Google: https://share.google/mkzKtk0Gegc86y0oe
- Site: https://jbeletrica.com.br/`;

// Cenários de teste
interface TestScenario {
  name: string;
  description: string;
  clientMessages: string[];
  expectedBehaviors: string[];
}

const testScenarios: TestScenario[] = [
  {
    name: "Teste 1: Saudação Inicial",
    description: "Cliente diz 'Olá' - deve perguntar se é cliente",
    clientMessages: ["Olá"],
    expectedBehaviors: [
      "Dar saudação (Bom dia/Boa tarde/Boa noite)",
      "Dar boas-vindas à JB Elétrica",
      "Perguntar se já é cliente"
    ]
  },
  {
    name: "Teste 2: Não-cliente quer tomada",
    description: "Fluxo completo de não-cliente pedindo instalação de tomada",
    clientMessages: [
      "Oi",
      "Não",
      "Carlos Silva",
      "Quero instalar uma tomada",
      "Sim, quero agendar",
      "Carlos Eduardo Silva",
      "12345678901",
      "carlos@email.com",
      "Rua das Flores, 123 - Centro - Uberlândia",
      "Sim, confirmo"
    ],
    expectedBehaviors: [
      "Perguntar se é cliente",
      "Pedir o nome",
      "Cumprimentar pelo nome",
      "Informar preço da tomada (R$ 55,00)",
      "Coletar dados: nome completo, CPF, email, endereço",
      "Confirmar dados",
      "Transferir para Jennifer"
    ]
  },
  {
    name: "Teste 3: Cliente existente",
    description: "Cliente que já é cadastrado quer instalar chuveiro",
    clientMessages: [
      "Bom dia",
      "Sim, sou cliente",
      "Quero instalar um chuveiro elétrico",
      "Simples",
      "Sim, quero agendar"
    ],
    expectedBehaviors: [
      "Perguntar se é cliente",
      "Dar boas-vindas de volta",
      "NÃO pedir dados pessoais",
      "Informar preço do chuveiro (R$ 95,00 simples / R$ 130,00 luxo)",
      "Transferir para Jennifer"
    ]
  },
  {
    name: "Teste 4: Dúvida técnica - DR desarmando",
    description: "Cliente com problema no DR",
    clientMessages: [
      "Boa tarde",
      "Sim",
      "Meu DR fica desarmando toda hora",
      "Já fiz isso mas continua desarmando",
      "Sim, quero agendar uma visita"
    ],
    expectedBehaviors: [
      "Orientar sobre procedimento do DR",
      "Oferecer visita técnica",
      "Transferir para Jennifer"
    ]
  },
  {
    name: "Teste 5: Serviço que precisa de visita técnica",
    description: "Cliente quer fazer instalação elétrica completa",
    clientMessages: [
      "Olá",
      "Não sou cliente",
      "Maria",
      "Quero fazer a instalação elétrica da minha casa nova",
      "Sim, quero agendar a visita"
    ],
    expectedBehaviors: [
      "Informar que precisa de visita técnica",
      "Oferecer agendamento",
      "Coletar dados para cadastro"
    ]
  },
  {
    name: "Teste 6: Cliente adiciona mais serviços",
    description: "Cliente pede um serviço e depois adiciona outro",
    clientMessages: [
      "Oi",
      "Sim, já sou cliente",
      "Quero instalar um ventilador de teto",
      "Com passagem de fio",
      "Ah, também quero instalar uma tomada",
      "Sim, pode agendar"
    ],
    expectedBehaviors: [
      "Informar preço do ventilador (R$ 150,00 com fio)",
      "Incluir a tomada na solicitação",
      "Somar os serviços",
      "Transferir para Jennifer"
    ]
  },
  {
    name: "Teste 7: Cliente manda tudo junto",
    description: "Cliente já manda nome e serviço na primeira mensagem",
    clientMessages: [
      "Bom dia, meu nome é João e quero instalar um lustre",
      "Não sou cliente",
      "Lustre simples",
      "Sim"
    ],
    expectedBehaviors: [
      "Capturar o nome da mensagem",
      "Não pedir nome novamente",
      "Perguntar tipo do lustre",
      "Informar preço (R$ 97,00 simples)",
      "Coletar dados para cadastro"
    ]
  },
  {
    name: "Teste 8: Emergência elétrica",
    description: "Cliente reporta emergência no quadro",
    clientMessages: [
      "Socorro, meu quadro de luz está pegando fogo!",
    ],
    expectedBehaviors: [
      "Pedir calma",
      "Orientar a desligar chave geral",
      "Mandar ligar para bombeiros (193)",
      "Oferecer visita depois"
    ]
  },
  {
    name: "Teste 9: Conversão de voltagem",
    description: "Cliente quer converter tomada de 127V para 220V",
    clientMessages: [
      "Oi",
      "Sim",
      "Quero converter uma tomada de 127 para 220",
      "Sim, quero agendar"
    ],
    expectedBehaviors: [
      "Informar sobre conversão de tomada",
      "Informar preço (R$ 55,00 sem passar fio)",
      "Transferir para Jennifer"
    ]
  },
  {
    name: "Teste 10: Serviço não listado",
    description: "Cliente pergunta sobre serviço que não está na lista",
    clientMessages: [
      "Boa tarde",
      "Não",
      "Pedro",
      "Vocês instalam ar-condicionado?",
    ],
    expectedBehaviors: [
      "Informar que fazem apenas o ponto elétrico",
      "Não instalam o ar em si",
      "Oferecer o serviço de ponto elétrico"
    ]
  }
];

// Cores para output
const colors = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  cyan: "\x1b[36m",
  magenta: "\x1b[35m"
};

// Função para simular resposta do agente usando Mistral
async function getAgentResponse(conversationHistory: Array<{role: string, content: string}>): Promise<string> {
  const mistral = new Mistral({
    apiKey: process.env.MISTRAL_API_KEY
  });

  const systemMessage = AGENT_PROMPT + `\n\nHoje é ${new Date().toLocaleDateString('pt-BR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}. Horário atual: ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}.`;

  const messages = [
    { role: 'system' as const, content: systemMessage },
    ...conversationHistory.map(m => ({
      role: m.role as 'user' | 'assistant',
      content: m.content
    }))
  ];

  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: messages,
    maxTokens: 500,
    temperature: 0.7
  });

  return response.choices?.[0]?.message?.content as string || 'Erro ao gerar resposta';
}

// Função para avaliar se a resposta atende aos comportamentos esperados
function evaluateResponse(response: string, expectedBehaviors: string[]): { passed: boolean; details: string[] } {
  const details: string[] = [];
  let allPassed = true;

  // Verificações específicas
  const checks = {
    "Perguntar se é cliente": /cliente.*\?|já é cliente/i,
    "Dar saudação": /bom dia|boa tarde|boa noite/i,
    "Dar boas-vindas à JB Elétrica": /bem-vindo|jb elétrica/i,
    "Dar boas-vindas de volta": /volta|prazer|bom ter você/i,
    "Pedir o nome": /nome|chamar/i,
    "Cumprimentar pelo nome": /prazer|[A-Z][a-z]+!/i,
    "Informar preço": /R\$\s*\d+/i,
    "Transferir para Jennifer": /jennifer|atendente|transferir/i,
    "Coletar dados": /cpf|e-?mail|endereço|dados/i,
    "Confirmar dados": /confirma|correto/i,
    "NÃO pedir dados pessoais": true, // Check especial
    "Orientar sobre procedimento": /equipamentos|teste|deslig/i,
    "Oferecer visita técnica": /visita|técnico|agendar/i,
    "Informar que precisa de visita técnica": /visita|avaliar|local/i,
    "Incluir a tomada na solicitação": /incluir|junto|também/i,
    "Pedir calma": /calma|tranquil/i,
    "Mandar ligar para bombeiros": /193|bombeiro/i,
    "Informar sobre conversão": /convers|127|220|voltagem/i,
    "Informar que fazem apenas o ponto elétrico": /ponto elétrico|apenas|somente/i
  };

  for (const behavior of expectedBehaviors) {
    const check = checks[behavior as keyof typeof checks];
    
    if (behavior === "NÃO pedir dados pessoais") {
      // Verificar que NÃO pede CPF, email, etc para cliente existente
      const asksForData = /cpf|e-?mail|endereço completo/i.test(response);
      if (!asksForData) {
        details.push(`${colors.green}✓${colors.reset} ${behavior}`);
      } else {
        details.push(`${colors.red}✗${colors.reset} ${behavior} (pediu dados indevidamente)`);
        allPassed = false;
      }
    } else if (check instanceof RegExp) {
      if (check.test(response)) {
        details.push(`${colors.green}✓${colors.reset} ${behavior}`);
      } else {
        details.push(`${colors.red}✗${colors.reset} ${behavior}`);
        allPassed = false;
      }
    } else {
      details.push(`${colors.yellow}?${colors.reset} ${behavior} (verificar manualmente)`);
    }
  }

  return { passed: allPassed, details };
}

// Função principal para executar um cenário de teste
async function runTestScenario(scenario: TestScenario, scenarioIndex: number): Promise<boolean> {
  console.log(`\n${colors.cyan}${'='.repeat(80)}${colors.reset}`);
  console.log(`${colors.magenta}${scenario.name}${colors.reset}`);
  console.log(`${colors.yellow}${scenario.description}${colors.reset}`);
  console.log(`${colors.cyan}${'='.repeat(80)}${colors.reset}\n`);

  const conversationHistory: Array<{role: string, content: string}> = [];
  let lastResponse = '';
  let testPassed = true;

  for (let i = 0; i < scenario.clientMessages.length; i++) {
    const clientMessage = scenario.clientMessages[i];
    
    // Adiciona mensagem do cliente
    conversationHistory.push({ role: 'user', content: clientMessage });
    console.log(`${colors.blue}👤 Cliente:${colors.reset} ${clientMessage}`);

    try {
      // Obtém resposta do agente
      const agentResponse = await getAgentResponse(conversationHistory);
      conversationHistory.push({ role: 'assistant', content: agentResponse });
      lastResponse = agentResponse;
      
      console.log(`${colors.green}🤖 Agente:${colors.reset} ${agentResponse}\n`);

      // Pequena pausa para não sobrecarregar a API
      await new Promise(resolve => setTimeout(resolve, 1000));
    } catch (error) {
      console.log(`${colors.red}❌ Erro ao obter resposta: ${error}${colors.reset}\n`);
      testPassed = false;
    }
  }

  // Avalia a última resposta
  console.log(`\n${colors.yellow}📋 Avaliação dos comportamentos esperados:${colors.reset}`);
  const evaluation = evaluateResponse(lastResponse, scenario.expectedBehaviors);
  evaluation.details.forEach(detail => console.log(`   ${detail}`));
  
  if (evaluation.passed) {
    console.log(`\n${colors.green}✅ TESTE PASSOU${colors.reset}`);
  } else {
    console.log(`\n${colors.red}❌ TESTE FALHOU${colors.reset}`);
    testPassed = false;
  }

  return testPassed;
}

// Função principal
async function main() {
  console.log(`${colors.magenta}`);
  console.log('╔════════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    TESTE DO AGENTE JB ELÉTRICA                                 ║');
  console.log('║                    10 Cenários de Calibração                                   ║');
  console.log('╚════════════════════════════════════════════════════════════════════════════════╝');
  console.log(`${colors.reset}`);

  // Verifica se a API key está configurada
  if (!process.env.MISTRAL_API_KEY) {
    console.log(`${colors.red}❌ MISTRAL_API_KEY não configurada!${colors.reset}`);
    console.log('Configure a variável de ambiente MISTRAL_API_KEY antes de executar.');
    process.exit(1);
  }

  const results: { name: string; passed: boolean }[] = [];

  // Executa cada cenário
  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];
    try {
      const passed = await runTestScenario(scenario, i);
      results.push({ name: scenario.name, passed });
    } catch (error) {
      console.log(`${colors.red}❌ Erro no cenário ${scenario.name}: ${error}${colors.reset}`);
      results.push({ name: scenario.name, passed: false });
    }
  }

  // Resumo final
  console.log(`\n${colors.magenta}${'═'.repeat(80)}${colors.reset}`);
  console.log(`${colors.cyan}                           RESUMO FINAL${colors.reset}`);
  console.log(`${colors.magenta}${'═'.repeat(80)}${colors.reset}\n`);

  let passedCount = 0;
  results.forEach(result => {
    const icon = result.passed ? `${colors.green}✅` : `${colors.red}❌`;
    console.log(`${icon} ${result.name}${colors.reset}`);
    if (result.passed) passedCount++;
  });

  console.log(`\n${colors.cyan}${'─'.repeat(80)}${colors.reset}`);
  console.log(`${colors.yellow}Total: ${passedCount}/${results.length} testes passaram (${Math.round(passedCount/results.length*100)}%)${colors.reset}`);
  
  if (passedCount === results.length) {
    console.log(`${colors.green}\n🎉 TODOS OS TESTES PASSARAM! O agente está calibrado.${colors.reset}`);
  } else {
    console.log(`${colors.red}\n⚠️  Alguns testes falharam. Revise o prompt do agente.${colors.reset}`);
  }
}

// Executa
main().catch(console.error);
