/**
 * TESTE IA vs IA - Validação do Prompt JB Elétrica
 * 
 * Cenário: Cliente pede "luz de trilho" - serviço NÃO cadastrado
 * Resultado esperado: Transferir para Jennifer SEM inventar preço
 */

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

const PROMPT_JB = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação (máximo 1-2 por mensagem)

## 2. HORÁRIOS DE ATENDIMENTO (HORÁRIO DE BRASÍLIA)
- Segunda a sexta: 08h às 12h | 13h30 às 18h
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. SAUDAÇÕES
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL - SEMPRE PERGUNTAR SE É CLIENTE
**⚠️ REGRA OBRIGATÓRIA:** Ao receber QUALQUER mensagem inicial, você DEVE SEMPRE perguntar se é cliente:

"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

## 5. CLIENTES EXISTENTES (respondeu SIM)
1. IA: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
2. Cliente informa o serviço
3. **VERIFICAR SE SERVIÇO ESTÁ NA LISTA** (ver seção 9)
4. Se SIM para agendar → "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde!"

## 6. NOVOS CLIENTES (respondeu NÃO)
### ETAPA 1: "Para continuar, por favor me informe seu nome."
### ETAPA 2: "Prazer, [NOME]! Qual serviço você gostaria de solicitar?"
### ETAPA 3: VERIFICAR SERVIÇO E RESPONDER conforme seções 9, 10, 11 ou 12

## 9. SERVIÇOS COM VALORES TABELADOS (PODEMOS FAZER)

**TOMADAS:**
- Tomada simples/dupla/tripla ➔ R$ 55,00
- Instalar/trocar/colocar tomada ➔ R$ 55,00

**CHUVEIROS:**
- Chuveiro elétrico simples ➔ R$ 95,00
- Chuveiro elétrico luxo ➔ R$ 130,00
- Troca de resistência ➔ R$ 75,00

**INTERRUPTORES:**
- Interruptor simples/duplo/bipolar ➔ R$ 55,00

**ILUMINAÇÃO:**
- Luminária tubular ➔ R$ 55,00
- Perfil de LED (1 metro) ➔ R$ 150,00
- Lustre simples ➔ R$ 97,00
- Lustre grande ➔ R$ 145,00
- Pendente simples ➔ R$ 75,00

**VENTILADORES:**
- Ventilador de parede – R$ 120,00
- Ventilador de teto sem passagem de fio ➔ R$ 120,00
- Ventilador de teto com passagem de fio ➔ R$ 150,00

**OUTROS:**
- Torneira elétrica ➔ R$ 105,00
- Disjuntor monofásico ➔ R$ 65,00
- Disjuntor bifásico ➔ R$ 85,00
- Disjuntor trifásico ➔ R$ 120,00

## 10. ⚠️ SERVIÇO NÃO LISTADO = TRANSFERIR PARA JENNIFER ⚠️

**REGRA CRÍTICA:** Se o cliente pedir um serviço que:
- NÃO está na seção 9 (valores tabelados)
- NÃO está na seção 11 (visita técnica)
- NÃO está na seção 12 (não fazemos)

Então você DEVE TRANSFERIR IMEDIATAMENTE para a Jennifer.

**EXEMPLOS de serviços que requerem transferência:**
- Luz de trilho / Spot de trilho / Trilho eletrificado
- Automação residencial
- Qualquer serviço elétrico não listado especificamente

**⚠️ ATENÇÃO:** Luz de trilho, spot de trilho, trilho eletrificado são serviços que FAZEMOS, mas o preço varia. Por isso, transfira para Jennifer dar o orçamento.

**RESPOSTA OBRIGATÓRIA:**
"Entendi! Vou transferir você para a Jennifer que vai te passar todas as informações sobre esse serviço. Aguarde um momento! 😊"

**⛔ PROIBIDO:**
- ❌ NÃO invente preços
- ❌ NÃO diga "não fazemos esse serviço" (a menos que esteja na seção 12)
- ❌ NÃO peça dados do cliente
- ❌ NÃO continue o atendimento

## 11. SERVIÇOS QUE EXIGEM VISITA TÉCNICA

- Instalação elétrica completa
- Orçamento elétrico da casa inteira
- Troca ou reforma de fiação

Resposta: "Para esse serviço, é necessário realizar uma visita técnica. Você gostaria de agendar?"

## 12. SERVIÇOS QUE NÃO FAZEMOS (recusar educadamente)

SOMENTE ESTES serviços devem ser recusados:
- Portão eletrônico
- Alarme
- Cerca elétrica
- Interfone/vídeo porteiro
- Placas solares
- Padrão elétrico / Padrão CEMIG
- Instalação de TV

Resposta SOMENTE para estes: "Infelizmente, esse serviço não faz parte dos nossos atendimentos. Posso ajudar com algum serviço elétrico?"

## 14. REGRAS CRÍTICAS FINAIS

1. ✅ NUNCA use menus numéricos (digite 1, 2, 3)
2. ✅ NUNCA pergunte qual dia/horário - transfira para Jennifer
3. ✅ SEMPRE informe preço quando serviço tiver valor tabelado (seção 9)
4. ✅ SEMPRE pergunte "Você já é cliente?" no início
5. ✅ **Serviço não está em NENHUMA lista → TRANSFERIR para Jennifer**
6. ✅ **Após cliente informar serviço, NÃO pergunte serviço novamente**
7. ✅ NÃO invente preços - se não está na lista com valor, transfira`;

interface MistralResponse {
  choices: Array<{
    message: {
      content: string;
    };
  }>;
}

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function callMistral(messages: ConversationMessage[]): Promise<string> {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      temperature: 0.3,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.status} ${await response.text()}`);
  }

  const data = await response.json() as MistralResponse;
  return data.choices[0].message.content;
}

interface TestResult {
  cenario: string;
  mensagemCliente: string;
  respostaIA: string;
  passou: boolean;
  motivo: string;
}

async function testarCenario(
  cenario: string,
  conversa: string[],
  validacao: (resposta: string) => { passou: boolean; motivo: string }
): Promise<TestResult> {
  const messages: ConversationMessage[] = [
    { role: 'system', content: PROMPT_JB },
  ];

  let ultimaResposta = '';
  
  // Simular conversa
  for (let i = 0; i < conversa.length; i++) {
    messages.push({ role: 'user', content: conversa[i] });
    ultimaResposta = await callMistral(messages);
    messages.push({ role: 'assistant', content: ultimaResposta });
    console.log(`\n[Cliente]: ${conversa[i]}`);
    console.log(`[IA]: ${ultimaResposta}`);
  }

  const resultado = validacao(ultimaResposta);
  
  return {
    cenario,
    mensagemCliente: conversa[conversa.length - 1],
    respostaIA: ultimaResposta,
    ...resultado,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    TESTE IA vs IA - VALIDAÇÃO PROMPT JB ELÉTRICA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const resultados: TestResult[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 1: LUZ DE TRILHO - deve transferir sem inventar preço
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 1: LUZ DE TRILHO');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado1 = await testarCenario(
    'Luz de trilho - Transferência imediata',
    [
      'Oi, preciso de um orçamento',
      'Sim, já sou cliente',
      'Quero instalar luz de trilho na minha loja'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const temJennifer = respostaLower.includes('jennifer');
      const temTransferir = respostaLower.includes('transferir') || respostaLower.includes('transferindo') || respostaLower.includes('passar');
      const temPrecoInventado = /r\$\s*\d+/.test(respostaLower) || /\d+\s*reais/.test(respostaLower) || /por\s*metro/.test(respostaLower);
      const temPerguntaAgendar = respostaLower.includes('gostaria de agendar') || respostaLower.includes('quer agendar');
      
      if (temPrecoInventado) {
        return { passou: false, motivo: '❌ INVENTOU PREÇO! Não deveria informar valor para serviço não cadastrado' };
      }
      if (temPerguntaAgendar) {
        return { passou: false, motivo: '❌ Perguntou se quer agendar - deveria transferir direto' };
      }
      if (!temJennifer) {
        return { passou: false, motivo: '❌ Não mencionou Jennifer para transferência' };
      }
      if (!temTransferir) {
        return { passou: false, motivo: '❌ Não indicou transferência' };
      }
      return { passou: true, motivo: '✅ Transferiu para Jennifer sem inventar preço' };
    }
  );
  resultados.push(resultado1);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 2: SPOT DE TRILHO (variação) - deve transferir sem inventar preço
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 2: SPOT DE TRILHO (variação)');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado2 = await testarCenario(
    'Spot de trilho - Transferência imediata',
    [
      'Boa tarde',
      'Sim',
      'Preciso de instalação de spot de trilho, quanto fica?'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const temJennifer = respostaLower.includes('jennifer');
      const temPrecoInventado = /r\$\s*\d+/.test(respostaLower) || /\d+\s*reais/.test(respostaLower);
      
      if (temPrecoInventado) {
        return { passou: false, motivo: '❌ INVENTOU PREÇO! Não deveria informar valor para serviço não cadastrado' };
      }
      if (!temJennifer) {
        return { passou: false, motivo: '❌ Não mencionou Jennifer para transferência' };
      }
      return { passou: true, motivo: '✅ Transferiu para Jennifer sem inventar preço' };
    }
  );
  resultados.push(resultado2);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 3: TOMADA - deve informar preço para NOVO cliente
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 3: TOMADA (NOVO cliente - deve informar preço)');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado3 = await testarCenario(
    'Tomada - Deve informar preço para NOVO cliente',
    [
      'Olá',
      'Não, sou novo cliente',
      'João Silva',
      'Quero instalar uma tomada nova'
    ],
    (resposta: string) => {
      const temPreco55 = resposta.includes('55') || resposta.includes('R$ 55');
      
      if (!temPreco55) {
        return { passou: false, motivo: '❌ Não informou o preço R$ 55,00 para tomada' };
      }
      return { passou: true, motivo: '✅ Informou corretamente o preço R$ 55,00' };
    }
  );
  resultados.push(resultado3);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 4: Cliente já disse que quer chuveiro - não perguntar de novo
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 4: NÃO REPETIR PERGUNTA DE SERVIÇO');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado4 = await testarCenario(
    'Não repetir pergunta de serviço',
    [
      'Oi, quero instalar um chuveiro',
      'Sim, sou cliente',
      'Sim, quero agendar o chuveiro'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const repetePergunta = 
        respostaLower.includes('qual serviço') || 
        respostaLower.includes('que serviço') ||
        respostaLower.includes('qual tipo de serviço') ||
        respostaLower.includes('gostaria de solicitar');
      
      if (repetePergunta) {
        return { passou: false, motivo: '❌ Repetiu pergunta sobre qual serviço!' };
      }
      return { passou: true, motivo: '✅ Não repetiu pergunta de serviço' };
    }
  );
  resultados.push(resultado4);

  // ══════════════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n\n═══════════════════════════════════════════════════════════════');
  console.log('                    📊 RESUMO FINAL');
  console.log('═══════════════════════════════════════════════════════════════\n');

  let passou = 0;
  let falhou = 0;

  for (const r of resultados) {
    const status = r.passou ? '✅ PASSOU' : '❌ FALHOU';
    console.log(`${status} | ${r.cenario}`);
    console.log(`   └─ ${r.motivo}\n`);
    if (r.passou) passou++;
    else falhou++;
  }

  console.log('───────────────────────────────────────────────────────────────');
  console.log(`TOTAL: ${passou} passou | ${falhou} falhou de ${resultados.length} testes`);
  console.log('═══════════════════════════════════════════════════════════════');

  // Verificações críticas
  const luzDeTrilhoPassed = resultados[0].passou && resultados[1].passou;
  const naoRepetePergunta = resultados[3].passou;

  console.log('\n🎯 VERIFICAÇÕES CRÍTICAS:');
  console.log(`   ${luzDeTrilhoPassed ? '✅' : '❌'} Luz de trilho → Transfere sem inventar preço`);
  console.log(`   ${naoRepetePergunta ? '✅' : '❌'} Não repete pergunta de serviço`);
}

main().catch(console.error);
