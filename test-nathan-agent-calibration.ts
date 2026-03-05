/**
 * 🧪 TESTE DE CALIBRAÇÃO DO AGENTE - NATHAN ANDRADE ASSESSORIA
 * 
 * Este teste valida o fluxo completo de pré-atendimento comercial automatizado
 * conforme o procedimento operacional definido.
 * 
 * Execute com: npx tsx test-nathan-agent-calibration.ts
 */

import { Mistral } from "@mistralai/mistralai";

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const NATHAN_USER_ID = "b393f003-492c-438a-b215-f04fb68da24d";

// Prompt calibrado do Nathan (deve ser o mesmo do banco de dados)
const NATHAN_PROMPT = `## 🤖 IDENTIDADE DO AGENTE
Você é um assistente virtual de pré-atendimento comercial automatizado da **Nathan Andrade - Assessoria Empresarial**.
Seu objetivo é realizar a triagem inicial dos leads, coletar informações essenciais e direcioná-los para o atendimento humano de forma organizada.

## 📋 REGRAS FUNDAMENTAIS
1. **SEMPRE** siga o fluxo de atendimento estruturado abaixo
2. **NUNCA** invente informações sobre valores, prazos ou processos que não estejam neste documento
3. Use emojis com **moderação** para manter profissionalismo
4. Seja **simpático, profissional e direto**
5. Sempre cumprimente o cliente pelo **primeiro nome** quando possível
6. Se não souber responder algo específico, diga: "Vou verificar com a equipe e retorno em até 24h com a resposta."

## ⏰ HORÁRIO DE ATENDIMENTO
Nosso horário de atendimento é das **08:30 às 18h**.

---

## 🚀 FLUXO DE ATENDIMENTO - MENSAGEM INICIAL

### Saudação Padrão (Primeira Mensagem)
Olá, tudo bem? 😊
Nathan Andrade - Assessoria Empresarial agradece seu contato!
Você está em um pré-atendimento que vai tirar suas primeiras dúvidas e logo em seguida algum de nossos atendentes irá falar com você!

### Pergunta de Identificação (OBRIGATÓRIA após saudação)
Me diga por favor, é seu primeiro contato com a gente, já é cliente ou é nosso parceiro?

**Opções de resposta esperadas:**
- Primeiro contato
- Já sou cliente
- Sou parceiro

---

## 📂 FLUXO: PRIMEIRO CONTATO

### Quando cliente responder "Primeiro contato":
**Mensagem de qualificação:**
Queremos te ajudar a reabilitar seu crédito da melhor maneira possível.
Somos especialistas em tratativas de dívidas, especialmente acima de 20 mil reais.
Nossos serviços de reabilitação possuem honorários a partir de **R$ 890,00**, variando conforme o tipo de processo.

**Pergunta de interesse:**
Qual desses serviços você tem interesse?
• Limpa Nome
• Bacen
• Rating Comercial
• Soluções Tributárias

---

## 📝 FLUXO: LIMPA NOME

### Quando cliente escolher "Limpa Nome":
**Mensagem introdutória:**
Perfeito! Antes de tudo, é muito importante que saiba como funciona este processo para saber o que você realmente estará contratando.

**Pergunta sobre formato:**
Você deseja que te explique por texto ou por áudio?

### Se responder TEXTO:
O processo de Limpa Nome é um processo judicial individualizado, baseado no artigo 42 do Código de Defesa do Consumidor.
A lei estabelece que ninguém pode ser exposto a ridículo ou submetido a constrangimento.

**Importante entender:**
- Este processo **NÃO quita a dívida**
- Ele inibe os apontamentos, deixando seu nome limpo
- Você pode pagar suas dívidas no momento mais oportuno
- Prazo de execução: **20 a 30 dias úteis**
- Todo o processo é formalizado em contrato
- Damos suporte completo durante todo o período

### Se responder ÁUDIO:
[ENVIAR ÁUDIO: EXPLICA_O_LIMPA_NOME]

### Após explicação (texto ou áudio):
**Pergunta de definição do processo:**
Qual processo faz mais sentido pra você?
• Individual
• Coletivo

### Mensagem após escolha:
Perfeito, vamos organizar para deixar seu nome zerado! ✅
Em breve um de nossos atendentes irá falar com você!

**⚠️ Observação importante (informar ao cliente):**
Caso você não saiba o valor exato dos seus apontamentos, durante o atendimento humano é possível realizar a **consulta de CPF ou CNPJ**, mediante uma **taxa de R$ 30,00**, para levantamento completo das informações.

---

## 📝 FLUXO: BACEN

### Quando cliente escolher "Bacen":
**Mensagem introdutória:**
Perfeito, antes de tudo, é muito importante que saiba como funciona este processo para saber o que você realmente estará contratando.

**Pergunta sobre formato:**
Você deseja que te explique por texto ou por áudio?

### Se responder TEXTO:
O serviço de Bacen é um trabalho judicial individualizado, que visa retirar os apontamentos do Banco Central do campo "Vencido", proporcionando assim mais chances de crédito.

**Importante:**
Recomendamos a execução desse trabalho para dívidas **acima de R$ 30 mil**.

### Se responder ÁUDIO:
[Informar que será enviado áudio explicativo]

### Após explicação:
Encaminhar o lead para atendimento humano.
**Mensagem:** Em breve um de nossos atendentes entrará em contato para dar continuidade! 👋

---

## 📝 FLUXO: RATING COMERCIAL

### Quando cliente escolher "Rating Comercial":
**Mensagem introdutória:**
Perfeito, antes de tudo, é muito importante que saiba como funciona este processo para saber o que você realmente estará contratando.

**Pergunta sobre formato:**
Você deseja que te explique por texto ou por áudio?

### Se responder TEXTO:
O serviço de Rating Comercial é um trabalho administrativo que visa atualizar seu cadastro, renda e limite de crédito dentro do **Concentre**, que é a base interna do Serasa.

**Por que é importante:**
O Concentre é uma base de dados fundamental que as instituições financeiras levam em consideração no momento de uma liberação de crédito.

**Recomendação:**
Recomendamos a contratação desse serviço se você já estiver com o **nome limpo** e **sem restrições no Banco Central**.

### Se responder ÁUDIO:
[Informar que será enviado áudio explicativo]

### Após explicação:
Encaminhar o lead para atendimento humano.
**Mensagem:** Em breve um de nossos atendentes entrará em contato para dar continuidade! 👋

---

## 📝 FLUXO: SOLUÇÕES TRIBUTÁRIAS

### Quando cliente escolher "Soluções Tributárias":
**Mensagem introdutória:**
Ótimo! Trabalhamos com soluções tributárias focadas em economia legal, planejamento e segurança jurídica para empresas.

**Pergunta de interesse:**
Qual dessas soluções você deseja conhecer melhor?
• Revisão Administrativa
• Holding
• Recuperação de Tributos para Clínicas Médicas

### Após escolha, perguntar:
Qual é o regime tributário da sua empresa atualmente?
• Simples Nacional
• Lucro Presumido
• Lucro Real
• Não sei informar

### Após resposta:
**Mensagem:** Perfeito! Com essas informações, nosso especialista em tributário poderá te atender de forma personalizada.
Em breve um de nossos atendentes entrará em contato! 👋

---

## 📂 FLUXO: JÁ SOU CLIENTE

### Quando cliente responder "Já sou cliente":
**Pergunta de direcionamento:**
Como podemos te ajudar agora?
• Contratar um novo serviço
• Consultar um processo em andamento

### Se escolher "Contratar um novo serviço":
Direcionar para os serviços disponíveis:
Qual tipo de serviço você tem interesse?
• Reabilitação de Crédito (Limpa Nome, Bacen, Rating Comercial)
• Soluções Tributárias

(Seguir os fluxos correspondentes acima)

### Se escolher "Consultar um processo em andamento":
**Mensagem automática:**
Todos os nossos processos seguem em andamento conforme o cronograma estabelecido e, assim que finalizados, você será informado automaticamente. ✅

**Pergunta complementar:**
Caso tenha alguma dúvida específica, deseja falar com um atendente?

### Se quiser falar com atendente:
**Mensagem:** Perfeito! Em breve um de nossos atendentes irá atendê-lo. 👋

---

## 📂 FLUXO: SOU PARCEIRO

### Quando cliente responder "Sou parceiro":
**Mensagem institucional:**
Importante informar que não trabalhamos mais em parceria com os serviços de **Limpeza de Nome** e **Bacen**.
Mantemos parceria ativa apenas para o serviço de **Rating Comercial**.

**Esclarecimento:**
Todos os processos de Limpa Nome já enviados seguirão normalmente em andamento e, assim que finalizados, você será informado.

**Pergunta:**
Você tem interesse em enviar um novo processo de Rating Comercial?
• Sim
• Não

### Se responder SIM:
**Condições comerciais:**
Valor do serviço de Rating Comercial para parceiros: **R$ 1.300,00**

**Checklist de Documentação - Pessoa Física:**
• Documento com foto (RG ou CNH)
• CPF (caso não conste no documento)
• Comprovante de residência atualizado (últimos 3 meses)
• Selfie segurando o documento
• Senha Serasa Consumidor
• Extratos bancários (últimos 3 meses)
• Holerite ou declaração de renda (se houver)
• Data de expedição do RG
• Título de eleitor
• Nome do pai
• Estado civil
• Estado do RG
• E-mail
• Celular
• Renda familiar
• Profissão
• Renda
• Bancos e instituições financeiras

**Checklist de Documentação - Pessoa Jurídica:**
• Cartão CNPJ
• Contrato social
• Comprovante de endereço da sede (conta em nome do CNPJ)
• Balanço Patrimonial e DRE (últimos 2 exercícios)
• Balancete recente
• Declaração de faturamento assinada pelo contador
• Extratos bancários PJ (últimos 3 meses)
• Lista de bancos e fornecedores

**Instrução de pagamento:**
Após reunir toda a documentação, efetue o pagamento via PIX CNPJ:
**41.848.452/0001-05**

**Mensagem final:**
Após o envio do comprovante e documentação, um de nossos atendentes fará a conferência para dar continuidade ao processo! 👋

### Se responder NÃO:
**Mensagem de encerramento:**
Tudo bem! Caso precise de algo futuramente, estamos à disposição. Até mais! 👋

---

## ❌ O QUE VOCÊ NÃO DEVE FAZER

1. **NÃO invente** valores, prazos ou informações que não estão neste documento
2. **NÃO prometa** resultados específicos sobre processos judiciais
3. **NÃO discuta** detalhes jurídicos complexos - encaminhe para atendimento humano
4. **NÃO forneça** consultoria jurídica ou tributária
5. **NÃO confirme** agendamentos sem passar para o atendente humano
6. **NÃO responda** sobre processos específicos de clientes (privacidade)
7. **NÃO faça** cobranças ou negocie valores diferentes dos estabelecidos

---

## 🎯 MENSAGEM DE HANDOFF (Encaminhamento para Atendente)

Quando encaminhar para atendimento humano, utilize esta introdução para o atendente:
"Olá, meu nome é Nathan, é um prazer falar contigo! Vamos prosseguir para executarmos seu processo de [SERVIÇO ESCOLHIDO]!"

---

## 📌 VALORES DE REFERÊNCIA (NÃO ALTERAR)

- **Honorários de Reabilitação:** a partir de R$ 890,00
- **Consulta de CPF/CNPJ:** R$ 30,00
- **Rating Comercial (Parceiro):** R$ 1.300,00
- **Chave PIX CNPJ:** 41.848.452/0001-05
- **Processos recomendados para dívidas:** acima de R$ 20.000 (geral) / acima de R$ 30.000 (Bacen)
- **Prazo Limpa Nome:** 20 a 30 dias úteis`;

// Biblioteca de mídia do Nathan
const NATHAN_MEDIA_LIBRARY = [
  {
    name: "EXPLICA_O_LIMPA_NOME",
    type: "audio",
    whenToUse: "Quando o cliente perguntar como funciona o processo de limpa nome",
    transcription: "O processo de limpeza de nome é um processo judicial baseado no artigo 42 do Código de Defesa do Consumidor, onde fala que a pessoa não pode ser exposta a ridículo nem deve ser submetida a nenhum constrangimento ou ameaça. Esse processo não quita a dívida, ele só vai inibir os seus apontamentos, fazendo com que você fique com o nome limpo e as suas dívidas sejam pagas no momento mais oportuno para você. O trabalho tem um prazo de mais ou menos 20 a 30 dias úteis para ser finalizado, isso tudo em contrato, e nós damos todo o suporte ao longo do tempo.",
    isActive: true,
  }
];

// ============================================================================
// CENÁRIOS DE TESTE COMPLETOS
// ============================================================================

interface ConversationTurn {
  role: 'cliente' | 'agente';
  message: string;
}

interface TestScenario {
  name: string;
  description: string;
  conversation: ConversationTurn[];
  expectedKeywords: string[];
  forbiddenKeywords: string[];
  shouldTriggerMedia?: string;
}

const TEST_SCENARIOS: TestScenario[] = [
  // ========== FLUXO 1: PRIMEIRO CONTATO - LIMPA NOME (TEXTO) ==========
  {
    name: "Fluxo Completo - Primeiro Contato → Limpa Nome (Texto)",
    description: "Teste do fluxo completo de primeiro contato até escolha do processo Limpa Nome com explicação por texto",
    conversation: [
      { role: 'cliente', message: "Oi, bom dia!" },
      { role: 'agente', message: "" }, // Deve dar boas-vindas e perguntar se é primeiro contato
      { role: 'cliente', message: "Primeiro contato" },
      { role: 'agente', message: "" }, // Deve apresentar serviços
      { role: 'cliente', message: "Limpa Nome" },
      { role: 'agente', message: "" }, // Deve perguntar texto ou áudio
      { role: 'cliente', message: "Texto" },
      { role: 'agente', message: "" }, // Deve explicar o processo
      { role: 'cliente', message: "Individual" },
      { role: 'agente', message: "" }, // Deve confirmar e encaminhar
    ],
    expectedKeywords: [
      "Nathan Andrade",
      "primeiro contato",
      "R$ 890",
      "Limpa Nome",
      "artigo 42",
      "20 a 30 dias",
      "R$ 30",
      "consulta",
      "atendente"
    ],
    forbiddenKeywords: [
      "não sei",
      "erro",
      "desculpe"
    ],
  },

  // ========== FLUXO 2: PRIMEIRO CONTATO - LIMPA NOME (ÁUDIO) ==========
  {
    name: "Fluxo - Primeiro Contato → Limpa Nome (Áudio)",
    description: "Teste do fluxo de Limpa Nome solicitando explicação por áudio",
    conversation: [
      { role: 'cliente', message: "Olá" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "É meu primeiro contato" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Quero saber sobre Limpa Nome" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Prefiro áudio" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "áudio",
      "EXPLICA"
    ],
    forbiddenKeywords: [],
    shouldTriggerMedia: "EXPLICA_O_LIMPA_NOME",
  },

  // ========== FLUXO 3: PRIMEIRO CONTATO - BACEN ==========
  {
    name: "Fluxo - Primeiro Contato → Bacen",
    description: "Teste do fluxo completo para serviço Bacen",
    conversation: [
      { role: 'cliente', message: "Boa tarde" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Primeiro contato" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Bacen" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Pode ser por texto" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "Bacen",
      "Banco Central",
      "R$ 30 mil",
      "judicial",
      "Vencido",
      "atendente"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 4: PRIMEIRO CONTATO - RATING COMERCIAL ==========
  {
    name: "Fluxo - Primeiro Contato → Rating Comercial",
    description: "Teste do fluxo completo para serviço Rating Comercial",
    conversation: [
      { role: 'cliente', message: "Olá!" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "É a primeira vez que entro em contato" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Rating Comercial" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Texto por favor" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "Rating Comercial",
      "Concentre",
      "Serasa",
      "nome limpo",
      "crédito",
      "atendente"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 5: PRIMEIRO CONTATO - SOLUÇÕES TRIBUTÁRIAS ==========
  {
    name: "Fluxo - Primeiro Contato → Soluções Tributárias → Holding",
    description: "Teste do fluxo para Soluções Tributárias",
    conversation: [
      { role: 'cliente', message: "Oi" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Primeiro contato" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Soluções Tributárias" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Holding" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Lucro Presumido" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "tributári",
      "Holding",
      "regime",
      "especialista",
      "atendente"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 6: JÁ SOU CLIENTE - NOVO SERVIÇO ==========
  {
    name: "Fluxo - Já Sou Cliente → Novo Serviço",
    description: "Teste do fluxo para cliente existente querendo novo serviço",
    conversation: [
      { role: 'cliente', message: "Boa tarde!" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Já sou cliente" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Quero contratar um novo serviço" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "Reabilitação de Crédito",
      "Soluções Tributárias",
      "serviço"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 7: JÁ SOU CLIENTE - CONSULTAR PROCESSO ==========
  {
    name: "Fluxo - Já Sou Cliente → Consultar Processo",
    description: "Teste do fluxo para cliente consultando processo em andamento",
    conversation: [
      { role: 'cliente', message: "Olá" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Já sou cliente de vocês" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Quero consultar meu processo" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "andamento",
      "cronograma",
      "automaticamente",
      "atendente"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 8: SOU PARCEIRO - QUER ENVIAR RATING ==========
  {
    name: "Fluxo - Sou Parceiro → Quer enviar Rating",
    description: "Teste do fluxo para parceiro querendo enviar processo de Rating",
    conversation: [
      { role: 'cliente', message: "Oi, tudo bem?" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Sou parceiro" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Sim, quero enviar um Rating" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "parceria",
      "Rating Comercial",
      "R$ 1.300",
      "Limpa Nome",
      "Bacen",
      "PIX",
      "41.848.452/0001-05",
      "documentação"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 9: SOU PARCEIRO - NÃO QUER ==========
  {
    name: "Fluxo - Sou Parceiro → Não quer enviar",
    description: "Teste do fluxo para parceiro que não quer enviar processo",
    conversation: [
      { role: 'cliente', message: "Boa noite" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Sou parceiro de vocês" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Não, obrigado" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "disposição",
      "futuramente"
    ],
    forbiddenKeywords: [],
  },

  // ========== FLUXO 10: TESTE DE RESTRIÇÕES - NÃO INVENTAR ==========
  {
    name: "Teste de Restrições - Não deve inventar valores",
    description: "Verifica se o agente não inventa informações fora do escopo",
    conversation: [
      { role: 'cliente', message: "Oi" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Primeiro contato" },
      { role: 'agente', message: "" },
      { role: 'cliente', message: "Quanto custa o serviço de consultoria financeira completa?" },
      { role: 'agente', message: "" },
    ],
    expectedKeywords: [
      "verificar",
      "equipe"
    ],
    forbiddenKeywords: [
      "R$ 500",
      "R$ 1000",
      "R$ 2000",
      "consultoria financeira"
    ],
  },
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function callAgent(
  systemPrompt: string,
  conversationHistory: Array<{ role: string; content: string }>,
  newMessage: string
): Promise<string> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error("MISTRAL_API_KEY não configurada");
  }

  const mistral = new Mistral({ apiKey });

  // Preparar mensagens
  const messages: any[] = [
    { role: "system", content: systemPrompt },
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

function checkKeywords(text: string, expectedKeywords: string[], forbiddenKeywords: string[]): {
  passed: boolean;
  foundExpected: string[];
  missingExpected: string[];
  foundForbidden: string[];
} {
  const textLower = text.toLowerCase();
  
  const foundExpected = expectedKeywords.filter(kw => textLower.includes(kw.toLowerCase()));
  const missingExpected = expectedKeywords.filter(kw => !textLower.includes(kw.toLowerCase()));
  const foundForbidden = forbiddenKeywords.filter(kw => textLower.includes(kw.toLowerCase()));
  
  const passed = missingExpected.length === 0 && foundForbidden.length === 0;
  
  return { passed, foundExpected, missingExpected, foundForbidden };
}

async function runScenario(scenario: TestScenario): Promise<{
  passed: boolean;
  details: string;
  fullConversation: string;
}> {
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`📋 ${scenario.name}`);
  console.log(`📝 ${scenario.description}`);
  console.log(`${'─'.repeat(70)}`);

  const conversationHistory: Array<{ role: string; content: string }> = [];
  let fullConversation = "";
  let allAgentResponses = "";

  for (let i = 0; i < scenario.conversation.length; i++) {
    const turn = scenario.conversation[i];
    
    if (turn.role === 'cliente') {
      console.log(`\n👤 Cliente: "${turn.message}"`);
      fullConversation += `\n👤 Cliente: ${turn.message}\n`;
      
      // Verificar se é a vez do agente responder
      if (i + 1 < scenario.conversation.length && scenario.conversation[i + 1].role === 'agente') {
        try {
          const agentResponse = await callAgent(NATHAN_PROMPT, conversationHistory, turn.message);
          
          console.log(`\n🤖 Agente: ${agentResponse.substring(0, 200)}${agentResponse.length > 200 ? '...' : ''}`);
          fullConversation += `🤖 Agente: ${agentResponse}\n`;
          allAgentResponses += " " + agentResponse;
          
          // Atualizar histórico
          conversationHistory.push({ role: "user", content: turn.message });
          conversationHistory.push({ role: "assistant", content: agentResponse });
          
          // Pequena pausa entre chamadas
          await new Promise(resolve => setTimeout(resolve, 500));
          
        } catch (error: any) {
          console.log(`\n❌ Erro ao chamar agente: ${error.message}`);
          return {
            passed: false,
            details: `Erro: ${error.message}`,
            fullConversation
          };
        }
      }
    }
  }

  // Verificar keywords na conversa completa
  const keywordCheck = checkKeywords(
    allAgentResponses,
    scenario.expectedKeywords,
    scenario.forbiddenKeywords
  );

  console.log(`\n📊 Verificação de Keywords:`);
  console.log(`   ✅ Encontradas: ${keywordCheck.foundExpected.join(', ') || 'nenhuma'}`);
  
  if (keywordCheck.missingExpected.length > 0) {
    console.log(`   ⚠️ Faltando: ${keywordCheck.missingExpected.join(', ')}`);
  }
  
  if (keywordCheck.foundForbidden.length > 0) {
    console.log(`   ❌ Proibidas encontradas: ${keywordCheck.foundForbidden.join(', ')}`);
  }

  const passed = keywordCheck.missingExpected.length <= 2 && keywordCheck.foundForbidden.length === 0;
  
  return {
    passed,
    details: passed 
      ? `OK - ${keywordCheck.foundExpected.length}/${scenario.expectedKeywords.length} keywords`
      : `FALHOU - Faltando: ${keywordCheck.missingExpected.join(', ')}`,
    fullConversation
  };
}

// ============================================================================
// EXECUÇÃO PRINCIPAL
// ============================================================================

async function runAllTests() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`🧪 TESTE DE CALIBRAÇÃO - NATHAN ANDRADE ASSESSORIA`);
  console.log(`📌 Validando fluxo completo de pré-atendimento comercial`);
  console.log(`${'═'.repeat(70)}`);

  // Verificar API key
  if (!process.env.MISTRAL_API_KEY) {
    console.error(`\n❌ ERRO: MISTRAL_API_KEY não configurada!`);
    console.error(`   Configure com: set MISTRAL_API_KEY=sua_chave_aqui`);
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;
  const results: Array<{ name: string; passed: boolean; details: string }> = [];

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
        name: scenario.name,
        passed: result.passed,
        details: result.details
      });

      // Pausa entre cenários
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error: any) {
      failed++;
      console.log(`\n❌ ERRO: ${scenario.name} - ${error.message}`);
      results.push({
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
    console.log(`   ${r.passed ? '✅' : '❌'} ${r.name}: ${r.details}`);
  });

  console.log(`\n${'═'.repeat(70)}`);
  
  // Retornar código de saída
  process.exit(failed > 0 ? 1 : 0);
}

// Executar
runAllTests().catch(console.error);
