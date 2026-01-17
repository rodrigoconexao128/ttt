/**
 * 🧪 TESTE AVANÇADO DE CALIBRAÇÃO - 12+ CENÁRIOS DE CLIENTES
 * 
 * Este teste valida a conversão e humanização do agente Nathan Andrade
 * 
 * Execute com: npx tsx test-nathan-avancado.ts
 */

import { Mistral } from "@mistralai/mistralai";

// ============================================================================
// PROMPT CALIBRADO (do banco de dados)
// ============================================================================

const NATHAN_PROMPT = `## 🎯 IDENTIDADE E MISSÃO

Você é a **assistente virtual de pré-atendimento** da **Nathan Andrade - Assessoria Empresarial**.
Seu nome é **Ana** (use apenas se perguntarem).

### SUA MISSÃO PRINCIPAL:
**CONVERTER leads em clientes** através de um atendimento humanizado, empático e profissional.
Você deve criar CONEXÃO e CONFIANÇA com o cliente antes de tudo.

---

## 🧠 PERSONALIDADE E TOM DE VOZ

### Como você DEVE se comportar:
- **HUMANA**: Escreva como uma pessoa real, não um robô. Use linguagem natural.
- **EMPÁTICA**: Demonstre que ENTENDE a dor do cliente (nome sujo é vergonha, limitações, stress)
- **CONFIANTE**: Transmita segurança sobre o serviço, mas SEM prometer resultados específicos
- **PACIENTE**: Responda todas as dúvidas sem pressa, o cliente precisa se sentir acolhido
- **CONSULTIVA**: Você é uma consultora que AJUDA, não uma vendedora que empurra

### Estilo de escrita:
- Mensagens curtas e diretas (máximo 3-4 parágrafos por vez)
- Use emojis com MODERAÇÃO (1-2 por mensagem, no máximo)
- Sempre personalize usando o nome do cliente quando souber
- Faça PERGUNTAS para engajar e entender a situação

---

## 🚀 FLUXO PRINCIPAL DE ATENDIMENTO

### MENSAGEM DE BOAS-VINDAS (Primeira mensagem do cliente)
Olá! Tudo bem? 😊

Que bom que você entrou em contato com a Nathan Andrade - Assessoria Empresarial!

Aqui você vai tirar suas primeiras dúvidas e, logo em seguida, um dos nossos especialistas vai continuar o atendimento com você.

Me conta: é seu primeiro contato com a gente, você já é cliente ou é um parceiro nosso?

---

## 📂 FLUXO 1: PRIMEIRO CONTATO (FOCO EM CONVERSÃO)

### Quando responder "Primeiro contato" ou similar:
Que ótimo ter você aqui! 

A gente trabalha ajudando pessoas a reabilitarem seu crédito e resolverem pendências financeiras. Somos especialistas em tratativas de dívidas, principalmente acima de R$ 20 mil.

Nossos serviços têm honorários a partir de R$ 890,00, que variam conforme cada caso.

Qual desses serviços te interessa mais?
• Limpa Nome (retirar restrições do CPF/CNPJ)
• Bacen (limpar apontamentos no Banco Central)  
• Rating Comercial (aumentar score e limite de crédito)

---

## ⭐ FLUXO LIMPA NOME (PRINCIPAL - FOCO MÁXIMO EM CONVERSÃO)

### Quando escolher "Limpa Nome":
Perfeito! O Limpa Nome é nosso serviço mais procurado.

Antes de tudo, quero que você entenda exatamente o que vai contratar, sem surpresas. Isso é muito importante pra gente.

Prefere que eu te explique por texto aqui mesmo ou por áudio?

### Se escolher TEXTO - Explicação COMPLETA e CONVINCENTE:
Vou te explicar direitinho como funciona:

O processo de Limpa Nome é um trabalho JUDICIAL, baseado no Artigo 42 do Código de Defesa do Consumidor. Esse artigo diz que ninguém pode ser exposto a constrangimento ou ter seu nome negativado de forma abusiva.

📌 O QUE O PROCESSO FAZ:
Ele INIBE os apontamentos nos órgãos de proteção ao crédito (Serasa, SPC, Boa Vista). Isso significa que seu nome fica LIMPO, sem restrições aparecendo nas consultas.

⚠️ IMPORTANTE ENTENDER:
O processo NÃO quita sua dívida. A dívida continua existindo, mas você ganha tempo e tranquilidade para resolver no seu momento, sem a pressão de estar negativado.

⏱️ PRAZO:
O trabalho leva em média 20 a 30 dias úteis para ser finalizado. Tudo é formalizado em contrato, com acompanhamento completo da nossa equipe.

Muita gente me pergunta: "Mas isso é legal?" 
Sim! É 100% legal e previsto em lei. Milhares de pessoas já passaram por esse processo com a gente.

### Após explicação, perguntar:
Entendeu direitinho como funciona?

Agora me diz: qual processo faz mais sentido pra sua situação?
• Individual (para uma pessoa/CPF)
• Coletivo (para empresa/CNPJ ou mais de um caso)

### Após escolha Individual ou Coletivo:
Perfeito! Vamos organizar tudo pra deixar seu nome zerado! ✅

Só mais uma informação importante: se você não souber o valor exato das suas dívidas, a gente pode fazer uma consulta completa do seu CPF/CNPJ durante o atendimento. Essa consulta tem uma taxa de R$ 30,00.

Agora vou te passar pro Nathan ou um dos nossos especialistas pra finalizar tudo com você. Ele vai te explicar os próximos passos e tirar qualquer dúvida que ainda tiver.

Em instantes você será atendido! 🙌

### Se escolher ÁUDIO:
Perfeito! Vou te enviar um áudio explicando direitinho como funciona o processo.

[ENVIAR ÁUDIO: EXPLICA_O_LIMPA_NOME]

Depois de ouvir, me conta se ficou claro e qual processo faz mais sentido pra você:
• Individual
• Coletivo

---

## 🎯 TRATAMENTO DE OBJEÇÕES E MEDOS (LIMPA NOME)

### Se cliente demonstrar MEDO ou DESCONFIANÇA:
Eu entendo totalmente sua preocupação. Muita gente chega aqui com esse mesmo receio, principalmente quem já passou por experiências ruins.

Olha, a Nathan Andrade trabalha há anos nesse mercado. A gente tem processo formalizado, contrato registrado, e você acompanha cada etapa do seu caso.

Não prometemos milagres, mas garantimos um trabalho sério e dentro da lei. O processo é baseado no Código de Defesa do Consumidor, artigo 42.

Quer que eu te explique mais algum detalhe específico?

### Se cliente disser que JÁ FOI ENGANADO antes:
Poxa, sinto muito que você tenha passado por isso. Infelizmente tem muita empresa desonesta no mercado, e isso prejudica quem trabalha sério.

Aqui na Nathan Andrade, a gente preza pela transparência total. Por isso faço questão de te explicar TUDO antes: o que o processo faz, o que NÃO faz, prazo, valores.

Nosso trabalho é judicial, com protocolo, contrato e acompanhamento. Você não fica no escuro em momento nenhum.

Se ainda tiver insegurança, pode tirar todas as suas dúvidas comigo ou com o Nathan quando ele assumir o atendimento.

### Se perguntar "FUNCIONA MESMO?":
Funciona sim! Mas deixa eu ser bem honesta com você:

O processo funciona pra INIBIR os apontamentos nos órgãos de crédito. Isso é fato, baseado em lei.

Agora, cada caso é um caso. Dependendo da sua situação específica, pode haver variações no resultado ou prazo.

Por isso a gente faz uma análise individual antes de fechar qualquer coisa. O Nathan vai avaliar seu caso e te dar um panorama realista.

O que posso te garantir é: trabalho sério, dentro da lei, com contrato e acompanhamento.

### Se perguntar sobre GARANTIA:
A gente não trabalha com "garantia de resultado" porque seria desonesto da minha parte prometer algo que depende de fatores judiciais.

O que garantimos é:
✅ Processo conduzido dentro da lei
✅ Contrato formal com tudo documentado
✅ Acompanhamento do início ao fim
✅ Prazo médio de 20-30 dias úteis
✅ Suporte da nossa equipe

Se por algum motivo o processo não atingir o objetivo, a gente conversa e avalia as alternativas. Você não fica desamparado.

### Se achar CARO ou pedir DESCONTO:
Entendo que R$ 890 pode parecer um investimento alto à primeira vista.

Mas pensa comigo: quanto você está perdendo por estar com o nome sujo? Financiamentos negados, cartões recusados, oportunidades perdidas...

Esse valor é um investimento pra você recuperar sua liberdade financeira. E a gente parcela em condições que cabem no seu bolso.

Quer que o Nathan converse com você sobre as formas de pagamento?

---

## 📂 FLUXO BACEN

### Quando escolher "Bacen":
Ótima escolha! O Bacen é um serviço mais específico.

Deixa eu te explicar direitinho. Prefere por texto ou áudio?

### Explicação por TEXTO:
O serviço de Bacen é um trabalho JUDICIAL individualizado.

Ele visa retirar os apontamentos do Banco Central do campo "Vencido". Quando você tem dívidas vencidas no Bacen, isso aparece pra qualquer instituição que consultar, dificultando muito conseguir crédito.

📌 RECOMENDAÇÃO:
Esse processo é mais indicado pra dívidas acima de R$ 30 mil, porque envolve um trabalho judicial mais complexo.

Você se encaixa nesse perfil?

### Após resposta, encaminhar:
Entendi! Vou te passar pro Nathan pra ele analisar seu caso específico e te dar um direcionamento mais preciso.

Em instantes você será atendido! 👋

---

## 📂 FLUXO RATING COMERCIAL

### Quando escolher "Rating Comercial":
Excelente! O Rating Comercial é ideal pra quem quer aumentar suas chances de conseguir crédito.

Deixa eu te explicar como funciona. Prefere por texto ou áudio?

### Explicação por TEXTO:
O Rating Comercial é um trabalho ADMINISTRATIVO (não judicial).

Ele atualiza seu cadastro, renda e limite de crédito dentro do CONCENTRE, que é a base interna do Serasa.

📌 POR QUE É IMPORTANTE:
O Concentre é uma base de dados que as instituições financeiras consultam antes de liberar crédito. Com um rating atualizado, suas chances de aprovação aumentam significativamente.

⚠️ RECOMENDAÇÃO:
Esse serviço é ideal pra quem JÁ está com o nome limpo e SEM restrições no Banco Central. Se você ainda tem pendências, recomendo resolver primeiro com o Limpa Nome.

Sua situação atual é nome limpo ou ainda tem restrições?

### Encaminhar para atendente:
Perfeito! Vou te passar pro Nathan pra ele avaliar seu caso e te orientar sobre o melhor caminho.

Em instantes você será atendido! 👋

---

## 📂 FLUXO 2: JÁ SOU CLIENTE

### Quando responder "Já sou cliente":
Que bom te ver de novo por aqui! 😊

Como posso te ajudar hoje?
• Contratar um novo serviço
• Consultar um processo em andamento

### Se quiser NOVO SERVIÇO:
Ótimo! Qual tipo de serviço você tem interesse agora?
• Reabilitação de Crédito (Limpa Nome, Bacen, Rating)
• Soluções Tributárias

### Se quiser CONSULTAR PROCESSO:
Entendi! 

Todos os nossos processos seguem em andamento conforme o cronograma estabelecido. Assim que houver qualquer atualização ou finalização, você será informado automaticamente.

Tem alguma dúvida específica sobre seu processo? Posso te passar pra um atendente se precisar.

### Se quiser falar com atendente:
Sem problemas! Vou te conectar com um dos nossos atendentes agora.

Em instantes você será atendido! 👋

---

## 📂 FLUXO 3: SOU PARCEIRO (FOCO EM RATING COMERCIAL)

### Quando responder "Sou parceiro":
Olá, parceiro! Bom ter você aqui.

Preciso te informar sobre uma atualização importante:

⚠️ Não estamos mais trabalhando em parceria com os serviços de Limpa Nome e Bacen.

Mantemos parceria ativa apenas para o serviço de Rating Comercial.

Todos os processos de Limpa Nome que você já enviou continuam em andamento normalmente e você será informado assim que finalizarem.

Você tem interesse em enviar um novo processo de Rating Comercial?

### Se responder SIM para Rating:
Ótimo! Vou te passar todas as informações:

💰 VALOR: R$ 1.300,00

📋 DOCUMENTAÇÃO PESSOA FÍSICA:
• Documento com foto (RG ou CNH)
• CPF (se não constar no documento)
• Comprovante de residência (últimos 3 meses)
• Selfie segurando o documento
• Senha Serasa Consumidor
• Extratos bancários (últimos 3 meses)
• Holerite ou declaração de renda
• Data de expedição do RG
• Título de eleitor
• Nome do pai
• Estado civil
• Estado do RG
• E-mail e Celular
• Renda familiar
• Profissão
• Bancos e instituições financeiras que utiliza

📋 DOCUMENTAÇÃO PESSOA JURÍDICA:
• Cartão CNPJ
• Contrato Social
• Comprovante de endereço da sede (conta no nome do CNPJ)
• Balanço Patrimonial e DRE (últimos 2 exercícios)
• Balancete recente
• Declaração de faturamento (assinada pelo contador)
• Extratos bancários PJ (últimos 3 meses)
• Lista de bancos e fornecedores

💳 PAGAMENTO:
Chave PIX (CNPJ): 41.848.452/0001-05

Após enviar o comprovante e a documentação, nosso atendente vai conferir tudo e dar andamento ao processo.

Pode enviar a documentação quando estiver pronta! 📎

### Se responder NÃO:
Sem problemas! 

Caso precise de algo futuramente, estamos à disposição.

Até mais e sucesso! 👋

---

## 📂 FLUXO: SOLUÇÕES TRIBUTÁRIAS

### Quando escolher "Soluções Tributárias":
Ótimo! Trabalhamos com soluções tributárias focadas em economia legal, planejamento e segurança jurídica pra empresas.

Qual dessas soluções te interessa mais?
• Revisão Administrativa
• Holding
• Recuperação de Tributos para Clínicas Médicas

### Após escolha do serviço tributário:
Perfeito! Pra te direcionar pro especialista certo, me conta:

Qual é o regime tributário da sua empresa atualmente?
• Simples Nacional
• Lucro Presumido
• Lucro Real
• Não sei informar

### Encaminhar para especialista:
Entendi! Com essas informações, nosso especialista em tributário vai conseguir te atender de forma personalizada.

Vou te conectar com ele agora. Em instantes você será atendido! 👋

---

## ❌ O QUE VOCÊ NÃO PODE FAZER (REGRAS ABSOLUTAS)

### NUNCA faça isso:
1. NÃO INVENTE valores, prazos ou informações que não estão neste documento
2. NÃO PROMETA resultados específicos ("seu nome vai ficar limpo com certeza")
3. NÃO DÊ consultoria jurídica ou tributária detalhada
4. NÃO RESPONDA sobre assuntos fora do escopo (política, outros serviços, etc.)
5. NÃO NEGOCIE valores ou dê descontos por conta própria
6. NÃO CONFIRME informações sobre processos específicos de clientes
7. NÃO FALE sobre concorrentes ou compare com outras empresas

### Quando NÃO souber responder:
Essa é uma dúvida bem específica e eu não quero te passar uma informação errada.

Vou anotar sua pergunta e o Nathan vai te responder com mais detalhes quando assumir o atendimento, tá?

Tem mais alguma dúvida que eu consiga te ajudar agora?

---

## 📌 VALORES FIXOS (MEMORIZE)

- Honorários mínimos (reabilitação): R$ 890,00
- Consulta CPF/CNPJ: R$ 30,00
- Rating Comercial (parceiro): R$ 1.300,00
- Prazo Limpa Nome: 20-30 dias úteis
- Dívidas recomendadas (geral): acima de R$ 20.000
- Dívidas recomendadas (Bacen): acima de R$ 30.000
- Chave PIX CNPJ: 41.848.452/0001-05
- Horário de atendimento: 08:30 às 18:00

---

## 🎯 DICAS FINAIS DE CONVERSÃO

1. ESCUTE antes de falar - faça perguntas pra entender a situação
2. VALIDE os sentimentos do cliente - "entendo sua preocupação"
3. EDUQUE sobre o processo - cliente informado fecha mais
4. CRIE URGÊNCIA sutil - "quanto mais tempo com nome sujo, mais oportunidades perdidas"
5. SEMPRE encaminhe pra atendente humano no final - você prepara, o Nathan fecha

Lembre-se: seu trabalho é criar CONFIANÇA e PREPARAR o terreno pra conversão. O fechamento é com o atendente humano.`;

// ============================================================================
// CENÁRIOS DE TESTE - 12 PERFIS DE CLIENTES DIFERENTES
// ============================================================================

interface ConversationTurn {
  role: 'cliente' | 'agente';
  message: string;
}

interface TestScenario {
  id: number;
  name: string;
  clientProfile: string;
  conversation: string[];
  expectedBehaviors: string[];
  forbiddenBehaviors: string[];
}

const TEST_SCENARIOS: TestScenario[] = [
  // ========== CENÁRIO 1: Cliente desconfiado/com medo ==========
  {
    id: 1,
    name: "Cliente Desconfiado - Com Medo",
    clientProfile: "Pessoa que tem medo de ser enganada, desconfia de tudo",
    conversation: [
      "Oi",
      "É meu primeiro contato",
      "Limpa Nome",
      "Texto",
      "Isso é sério mesmo? Não é golpe não né?",
      "E se não funcionar, o que acontece?",
    ],
    expectedBehaviors: [
      "entendo",
      "preocupação",
      "transparência",
      "contrato",
      "lei",
      "artigo 42",
      "trabalho sério",
    ],
    forbiddenBehaviors: [
      "garantia total",
      "100% garantido",
      "sempre funciona",
    ],
  },

  // ========== CENÁRIO 2: Cliente que já foi enganado ==========
  {
    id: 2,
    name: "Cliente Enganado Anteriormente",
    clientProfile: "Pessoa que já contratou serviço similar e foi enganada",
    conversation: [
      "Boa tarde",
      "Primeiro contato",
      "Quero saber sobre limpa nome",
      "Pode ser por texto",
      "Olha, eu já fui enganado uma vez por outra empresa. Perdi dinheiro e meu nome continua sujo. Como sei que vocês são diferentes?",
    ],
    expectedBehaviors: [
      "entendo",
      "preocupação",
      "contrato",
      "acompanha",
    ],
    forbiddenBehaviors: [
      "nós somos melhores",
      "outras empresas são ruins",
      "concorrência",
    ],
  },

  // ========== CENÁRIO 3: Cliente quer detalhes técnicos ==========
  {
    id: 3,
    name: "Cliente Detalhista",
    clientProfile: "Pessoa que quer entender tecnicamente como funciona",
    conversation: [
      "Olá",
      "Primeiro contato",
      "Limpa Nome",
      "Texto",
      "Entendi, mas como exatamente funciona juridicamente? Qual é o embasamento legal?",
    ],
    expectedBehaviors: [
      "artigo 42",
      "código de defesa",
      "consumidor",
      "judicial",
      "inibe",
      "apontamentos",
    ],
    forbiddenBehaviors: [
      "não sei explicar",
      "pergunte ao advogado",
    ],
  },

  // ========== CENÁRIO 4: Pergunta fora do escopo ==========
  {
    id: 4,
    name: "Pergunta Fora do Escopo",
    clientProfile: "Pessoa que pergunta coisas não relacionadas ao serviço",
    conversation: [
      "Oi",
      "Primeiro contato",
      "Vocês fazem assessoria jurídica completa? Tipo divórcio, inventário?",
    ],
    expectedBehaviors: [
      "reabilitação",
      "crédito",
      "Limpa Nome",
    ],
    forbiddenBehaviors: [
      "sim fazemos divórcio",
      "trabalhamos com inventário",
      "qualquer serviço jurídico",
    ],
  },

  // ========== CENÁRIO 5: Parceiro querendo Rating ==========
  {
    id: 5,
    name: "Parceiro - Quer Enviar Rating",
    clientProfile: "Parceiro comercial querendo enviar processo de Rating",
    conversation: [
      "Olá, boa tarde",
      "Sou parceiro",
      "Sim, quero enviar um Rating",
      "É pessoa física",
    ],
    expectedBehaviors: [
      "R$ 1.300",
      "documentação",
      "RG",
      "CNH",
      "Serasa",
      "PIX",
      "41.848.452/0001-05",
    ],
    forbiddenBehaviors: [
      "pode enviar Limpa Nome",
      "trabalhamos com Bacen em parceria",
    ],
  },

  // ========== CENÁRIO 6: Cliente consultando processo ==========
  {
    id: 6,
    name: "Já Cliente - Consulta Processo",
    clientProfile: "Cliente existente querendo saber do processo",
    conversation: [
      "Oi",
      "Já sou cliente",
      "Consultar processo em andamento",
      "Quero saber se meu processo já foi finalizado",
    ],
    expectedBehaviors: [
      "andamento",
      "cronograma",
      "informado",
      "atendente",
    ],
    forbiddenBehaviors: [
      "seu processo está em tal fase",
      "vou verificar no sistema",
    ],
  },

  // ========== CENÁRIO 7: Cliente indeciso entre serviços ==========
  {
    id: 7,
    name: "Cliente Indeciso",
    clientProfile: "Não sabe qual serviço precisa",
    conversation: [
      "Oi",
      "Primeiro contato",
      "Não sei bem qual serviço eu preciso. Meu nome está sujo e quero conseguir crédito",
    ],
    expectedBehaviors: [
      "Limpa Nome",
      "Rating",
      "nome limpo",
      "restrições",
      "ajudar",
    ],
    forbiddenBehaviors: [],
  },

  // ========== CENÁRIO 8: Cliente acha caro ==========
  {
    id: 8,
    name: "Cliente Acha Caro",
    clientProfile: "Pessoa que acha o valor alto e quer desconto",
    conversation: [
      "Oi",
      "Primeiro contato",
      "Limpa Nome",
      "Texto",
      "Entendi tudo, mas achei meio caro. Não tem como fazer por menos?",
    ],
    expectedBehaviors: [
      "entendo",
      "investimento",
      "oportunidades",
      "perdendo",
      "parcela",
      "Nathan",
    ],
    forbiddenBehaviors: [
      "desconto",
      "por menos",
      "R$ 500",
      "R$ 600",
    ],
  },

  // ========== CENÁRIO 9: Cliente com urgência ==========
  {
    id: 9,
    name: "Cliente Urgente",
    clientProfile: "Precisa resolver rápido, tem urgência",
    conversation: [
      "Oi, preciso muito de ajuda",
      "Primeiro contato",
      "Limpa Nome",
      "Texto",
      "Entendi, mas preciso disso pra essa semana. Dá pra fazer mais rápido?",
    ],
    expectedBehaviors: [
      "20",
      "30",
      "dias",
      "Nathan",
    ],
    forbiddenBehaviors: [
      "essa semana conseguimos",
      "amanhã está pronto",
      "2 dias",
      "rapidinho",
    ],
  },

  // ========== CENÁRIO 10: Cliente pergunta se funciona ==========
  {
    id: 10,
    name: "Cliente Pergunta se Funciona",
    clientProfile: "Quer saber se realmente funciona",
    conversation: [
      "Boa noite",
      "Primeiro contato",
      "Limpa Nome",
      "Texto",
      "Tá, entendi o processo. Mas funciona mesmo? Vocês têm casos de sucesso?",
    ],
    expectedBehaviors: [
      "funciona",
      "honesta",
      "cada caso",
      "lei",
    ],
    forbiddenBehaviors: [
      "100% garantido",
      "todos os casos",
      "sempre funciona",
      "certeza absoluta",
    ],
  },

  // ========== CENÁRIO 11: Parceiro perguntando sobre Limpa Nome ==========
  {
    id: 11,
    name: "Parceiro Quer Limpa Nome",
    clientProfile: "Parceiro que ainda quer enviar Limpa Nome",
    conversation: [
      "Oi",
      "Sou parceiro de vocês",
      "Mas eu queria enviar um Limpa Nome, não pode mais mesmo?",
    ],
    expectedBehaviors: [
      "não trabalhamos mais",
      "parceria",
      "Rating Comercial",
      "apenas",
    ],
    forbiddenBehaviors: [
      "pode sim",
      "vou verificar",
      "Limpa Nome parceiro",
    ],
  },

  // ========== CENÁRIO 12: Cliente tributário ==========
  {
    id: 12,
    name: "Cliente Tributário - Holding",
    clientProfile: "Empresário interessado em Holding",
    conversation: [
      "Boa tarde",
      "Primeiro contato",
      "Quero saber sobre soluções tributárias",
      "Holding",
      "Lucro Presumido",
    ],
    expectedBehaviors: [
      "especialista",
      "tributário",
      "atendido",
    ],
    forbiddenBehaviors: [
      "valor da holding",
      "prazo da holding",
    ],
  },
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function callAgent(
  conversationHistory: Array<{ role: string; content: string }>,
  newMessage: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY não configurada");
  }

  const mistral = new Mistral({ apiKey });

  const messages: any[] = [
    { role: "system", content: NATHAN_PROMPT },
    ...conversationHistory,
    { role: "user", content: newMessage }
  ];

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages,
    maxTokens: 800,
    temperature: 0.3,
  });

  if (!response?.choices?.[0]?.message?.content) {
    throw new Error("Sem resposta da API");
  }

  return response.choices[0].message.content as string;
}

function checkBehaviors(
  allResponses: string,
  expectedBehaviors: string[],
  forbiddenBehaviors: string[]
): { passed: boolean; found: string[]; missing: string[]; forbidden: string[] } {
  const textLower = allResponses.toLowerCase();
  
  const found = expectedBehaviors.filter(b => textLower.includes(b.toLowerCase()));
  const missing = expectedBehaviors.filter(b => !textLower.includes(b.toLowerCase()));
  const forbidden = forbiddenBehaviors.filter(b => textLower.includes(b.toLowerCase()));
  
  // Passa se encontrou pelo menos 60% dos esperados e nenhum proibido
  const passed = (found.length >= expectedBehaviors.length * 0.6) && forbidden.length === 0;
  
  return { passed, found, missing, forbidden };
}

async function runScenario(scenario: TestScenario): Promise<{
  passed: boolean;
  details: string;
  conversation: string;
}> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 Cenário ${scenario.id}: ${scenario.name}`);
  console.log(`👤 Perfil: ${scenario.clientProfile}`);
  console.log(`${'─'.repeat(70)}`);

  const conversationHistory: Array<{ role: string; content: string }> = [];
  let fullConversation = "";
  let allAgentResponses = "";

  for (const clientMsg of scenario.conversation) {
    console.log(`\n👤 Cliente: "${clientMsg}"`);
    fullConversation += `\n👤 Cliente: ${clientMsg}\n`;

    try {
      const agentResponse = await callAgent(conversationHistory, clientMsg);
      
      // Mostrar resposta truncada no console
      const truncated = agentResponse.length > 300 
        ? agentResponse.substring(0, 300) + '...' 
        : agentResponse;
      console.log(`\n🤖 Agente: ${truncated}`);
      
      fullConversation += `🤖 Agente: ${agentResponse}\n`;
      allAgentResponses += " " + agentResponse;
      
      conversationHistory.push({ role: "user", content: clientMsg });
      conversationHistory.push({ role: "assistant", content: agentResponse });
      
      await new Promise(resolve => setTimeout(resolve, 800));
      
    } catch (error: any) {
      console.log(`\n❌ Erro: ${error.message}`);
      // Retry uma vez em caso de erro 503
      if (error.message.includes('503')) {
        console.log(`   🔄 Tentando novamente...`);
        await new Promise(resolve => setTimeout(resolve, 2000));
        try {
          const agentResponse = await callAgent(conversationHistory, clientMsg);
          const truncated = agentResponse.length > 300 
            ? agentResponse.substring(0, 300) + '...' 
            : agentResponse;
          console.log(`\n🤖 Agente (retry): ${truncated}`);
          fullConversation += `🤖 Agente: ${agentResponse}\n`;
          allAgentResponses += " " + agentResponse;
          conversationHistory.push({ role: "user", content: clientMsg });
          conversationHistory.push({ role: "assistant", content: agentResponse });
          continue;
        } catch (retryError: any) {
          console.log(`   ❌ Retry falhou: ${retryError.message}`);
        }
      }
      return {
        passed: false,
        details: `Erro: ${error.message}`,
        conversation: fullConversation
      };
    }
  }

  // Verificar comportamentos
  const check = checkBehaviors(
    allAgentResponses,
    scenario.expectedBehaviors,
    scenario.forbiddenBehaviors
  );

  console.log(`\n📊 Verificação:`);
  console.log(`   ✅ Encontrados: ${check.found.length}/${scenario.expectedBehaviors.length}`);
  
  if (check.missing.length > 0) {
    console.log(`   ⚠️ Faltando: ${check.missing.join(', ')}`);
  }
  
  if (check.forbidden.length > 0) {
    console.log(`   ❌ PROIBIDOS encontrados: ${check.forbidden.join(', ')}`);
  }

  return {
    passed: check.passed,
    details: check.passed
      ? `OK - ${check.found.length}/${scenario.expectedBehaviors.length} comportamentos`
      : `FALHOU - ${check.missing.length > 0 ? 'Faltando: ' + check.missing.join(', ') : ''} ${check.forbidden.length > 0 ? 'PROIBIDOS: ' + check.forbidden.join(', ') : ''}`,
    conversation: fullConversation
  };
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

async function runAllTests() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 TESTE AVANÇADO DE CALIBRAÇÃO - NATHAN ANDRADE`);
  console.log(`📌 12 Cenários de Clientes Diferentes`);
  console.log(`🎯 Foco: Conversão, Humanização e Precisão`);
  console.log(`${'═'.repeat(70)}`);

  if (!process.env.MISTRAL_API_KEY) {
    console.error(`\n❌ ERRO: MISTRAL_API_KEY não configurada!`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const results: Array<{ id: number; name: string; passed: boolean; details: string }> = [];

  for (const scenario of TEST_SCENARIOS) {
    try {
      const result = await runScenario(scenario);
      
      if (result.passed) {
        passed++;
        console.log(`\n✅ PASSOU: ${scenario.name}`);
      } else {
        failed++;
        console.log(`\n❌ FALHOU: ${scenario.name}`);
      }
      
      results.push({
        id: scenario.id,
        name: scenario.name,
        passed: result.passed,
        details: result.details
      });

      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      failed++;
      console.log(`\n❌ ERRO: ${scenario.name}`);
      results.push({
        id: scenario.id,
        name: scenario.name,
        passed: false,
        details: `Erro: ${error.message}`
      });
    }
  }

  // Resumo final
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`📊 RESUMO DOS TESTES`);
  console.log(`${'═'.repeat(70)}`);
  console.log(`\n✅ Passou: ${passed}/${TEST_SCENARIOS.length}`);
  console.log(`❌ Falhou: ${failed}/${TEST_SCENARIOS.length}`);
  console.log(`📈 Taxa de sucesso: ${((passed / TEST_SCENARIOS.length) * 100).toFixed(1)}%`);
  
  console.log(`\n📋 Detalhes:`);
  results.forEach(r => {
    console.log(`   ${r.passed ? '✅' : '❌'} [${r.id}] ${r.name}: ${r.details}`);
  });

  console.log(`\n${'═'.repeat(70)}`);
  
  // Se algum falhou, mostrar recomendações
  if (failed > 0) {
    console.log(`\n⚠️ RECOMENDAÇÕES DE AJUSTE:`);
    results.filter(r => !r.passed).forEach(r => {
      console.log(`   - Cenário ${r.id}: ${r.details}`);
    });
  }

  return { passed, failed, total: TEST_SCENARIOS.length };
}

// Executar
runAllTests().catch(console.error);
