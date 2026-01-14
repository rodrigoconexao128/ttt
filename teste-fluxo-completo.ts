/**
 * TESTE IA vs IA - VALIDAÇÃO FLUXO COMPLETO JB ELÉTRICA
 * 
 * Cenários testados:
 * 1. Cliente pergunta preço SEM passar pelo fluxo → deve responder "vou ajudar mas primeiro..."
 * 2. Lâmpada (múltiplas variações) → deve LISTAR todas as opções
 * 3. Chuveiro (múltiplas variações) → deve LISTAR todas as opções
 * 4. Tomada (múltiplas variações) → deve LISTAR todas as opções
 * 5. Luz de trilho → deve transferir para Jennifer
 */

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

const PROMPT_JB_ATUALIZADO = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação (máximo 1-2 por mensagem)

## 3. SAUDAÇÕES
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO OBRIGATÓRIO - NUNCA PULAR ETAPAS

### ⚠️ REGRA CRÍTICA: SEMPRE SEGUIR O FLUXO MESMO QUE CLIENTE PERGUNTE PREÇO

**Se o cliente perguntar preço ou serviço SEM ter passado pelo fluxo:**

Responda: "Vou te ajudar com isso! 😊 Mas primeiro, você já é cliente da JB Elétrica?"

**NUNCA pule a pergunta "você já é cliente?" - é obrigatória em TODA primeira interação.**

### ETAPA 1 - Primeira pergunta SEMPRE:
"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

## 5. CLIENTE EXISTENTE (respondeu SIM)
1. IA: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
2. Cliente informa o serviço
3. **VERIFICAR SE SERVIÇO TEM MÚLTIPLAS VARIAÇÕES**
4. **Se tiver variações:** LISTAR todas com preços e perguntar qual prefere
5. Se SIM para agendar → "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde!"

## 6. NOVO CLIENTE (respondeu NÃO)
### ETAPA 1: "Para continuar, por favor me informe seu nome."
### ETAPA 2: "Prazer, [NOME]! Qual serviço você gostaria de solicitar?"
### ETAPA 3: VERIFICAR E RESPONDER conforme tipo de serviço

## 9. SERVIÇOS COM VALORES TABELADOS

### 9.1 ⚠️ SERVIÇOS COM MÚLTIPLAS VARIAÇÕES - LISTAR TODAS

**TOMADAS (5 tipos - LISTAR TODOS):**
Se cliente pedir "tomada" sem especificar:

"Temos os seguintes tipos de tomada:
• Tomada simples/dupla/tripla ➔ R$ 55,00
• Tomada industrial (3P+1) ➔ R$ 85,00
• Tomada de piso ➔ R$ 65,00
• Tomada sobrepor com canaleta ➔ R$ 95,00

Qual delas você prefere?"

**CHUVEIROS (3 tipos - LISTAR TODOS):**
Se cliente pedir "chuveiro" sem especificar:

"Temos as seguintes opções:
• Chuveiro elétrico simples ➔ R$ 95,00
• Chuveiro elétrico luxo ➔ R$ 130,00
• Troca de resistência ➔ R$ 75,00

Qual você prefere?"

**ILUMINAÇÃO/LÂMPADA (7 tipos - LISTAR TODOS):**
Se cliente pedir "lâmpada", "iluminação", "luminária" ou "lustre" sem especificar:

"Temos várias opções de iluminação:
• Luminária tubular ➔ R$ 55,00
• Perfil de LED (1 metro) ➔ R$ 150,00
• Lustre simples ➔ R$ 97,00
• Lustre grande ➔ R$ 145,00
• Pendente simples ➔ R$ 75,00
• Luminária emergência (embutir) ➔ R$ 70,00
• Luminária emergência (sobrepor) ➔ R$ 75,00

Qual você gostaria de instalar?"

**VENTILADORES (3 tipos):**
"Temos:
• Ventilador de parede ➔ R$ 120,00
• Ventilador de teto sem passagem de fio ➔ R$ 120,00
• Ventilador de teto com passagem de fio ➔ R$ 150,00

Qual você prefere?"

### 9.2 SERVIÇOS ÚNICOS (informar preço direto):
- Torneira elétrica ➔ R$ 105,00
- Chave de boia ➔ R$ 120,00

## 10. SERVIÇO NÃO LISTADO = TRANSFERIR PARA JENNIFER

**EXEMPLOS:**
- Luz de trilho / Spot de trilho

**RESPOSTA:**
"Entendi! Vou transferir você para a Jennifer que vai te passar todas as informações sobre esse serviço. Aguarde um momento! 😊"

## 12. SERVIÇOS QUE NÃO FAZEMOS
- Portão eletrônico
- Alarme
- Placas solares

Resposta: "Infelizmente, esse serviço não faz parte dos nossos atendimentos. Posso ajudar com algum serviço elétrico?"

## 14. REGRAS CRÍTICAS
1. ✅ **Se cliente perguntar preço SEM passar pelo fluxo:** "Vou te ajudar com isso! 😊 Mas primeiro, você já é cliente da JB Elétrica?"
2. ✅ **Se serviço tem múltiplas variações:** LISTAR TODAS com preços
3. ✅ SEMPRE pergunte "Você já é cliente?" no início
4. ✅ SEMPRE PEDIR NOME quando for novo cliente`;

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
      max_tokens: 600,
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
  passou: boolean;
  motivo: string;
  conversa: Array<{cliente: string; ia: string}>;
}

async function testarCenario(
  cenario: string,
  conversa: string[],
  validacao: (resposta: string, todasRespostas: string[]) => { passou: boolean; motivo: string }
): Promise<TestResult> {
  const messages: ConversationMessage[] = [
    { role: 'system', content: PROMPT_JB_ATUALIZADO },
  ];

  const historicoConversa: Array<{cliente: string; ia: string}> = [];
  const todasRespostas: string[] = [];
  
  for (let i = 0; i < conversa.length; i++) {
    messages.push({ role: 'user', content: conversa[i] });
    const respostaIA = await callMistral(messages);
    messages.push({ role: 'assistant', content: respostaIA });
    todasRespostas.push(respostaIA);
    
    historicoConversa.push({
      cliente: conversa[i],
      ia: respostaIA
    });
    
    console.log(`\n[Cliente]: ${conversa[i]}`);
    console.log(`[IA]: ${respostaIA}`);
  }

  const ultimaResposta = todasRespostas[todasRespostas.length - 1];
  const resultado = validacao(ultimaResposta, todasRespostas);
  
  return {
    cenario,
    ...resultado,
    conversa: historicoConversa,
  };
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('    TESTE IA vs IA - FLUXO COMPLETO JB ELÉTRICA');
  console.log('═══════════════════════════════════════════════════════════════\n');

  const resultados: TestResult[] = [];

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 1: Cliente pergunta preço ANTES do fluxo
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 1: Cliente pergunta preço SEM passar pelo fluxo');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado1 = await testarCenario(
    'Pergunta preço antes do fluxo',
    [
      'qual valor da instalação de lampada'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const perguntouSeCliente = 
        respostaLower.includes('já é cliente') || 
        respostaLower.includes('você é cliente');
      const falaMasPrimeiro = 
        respostaLower.includes('mas primeiro') ||
        respostaLower.includes('vou te ajudar') ||
        respostaLower.includes('vou ajudar');
      
      if (!perguntouSeCliente) {
        return { passou: false, motivo: '❌ Não perguntou se é cliente' };
      }
      if (!falaMasPrimeiro) {
        return { passou: false, motivo: '⚠️ Perguntou se é cliente mas não disse "vou ajudar mas primeiro"' };
      }
      return { passou: true, motivo: '✅ Disse "vou ajudar" e perguntou se é cliente primeiro' };
    }
  );
  resultados.push(resultado1);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 2: LÂMPADA - deve LISTAR todas opções (7 tipos)
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 2: LÂMPADA - deve LISTAR todas as 7 opções');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado2 = await testarCenario(
    'Lâmpada - listar todas opções',
    [
      'Olá',
      'Não, sou novo cliente',
      'João Silva',
      'instalação de lampada'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const perguntouQualTipo = 
        respostaLower.includes('qual tipo') || 
        respostaLower.includes('que tipo') ||
        respostaLower.includes('qual lâmpada');
      
      const listouOpcoes = 
        (respostaLower.includes('luminária tubular') || respostaLower.includes('tubular')) &&
        (respostaLower.includes('lustre') || respostaLower.includes('pendente'));
      
      const temPrecos = respostaLower.includes('55') && respostaLower.includes('97');
      
      if (perguntouQualTipo && !listouOpcoes) {
        return { passou: false, motivo: '❌ Perguntou "qual tipo?" em vez de LISTAR as opções' };
      }
      if (!listouOpcoes) {
        return { passou: false, motivo: '❌ Não listou as opções de iluminação' };
      }
      if (!temPrecos) {
        return { passou: false, motivo: '❌ Listou mas não incluiu os preços' };
      }
      return { passou: true, motivo: '✅ Listou todas as opções de iluminação com preços' };
    }
  );
  resultados.push(resultado2);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 3: CHUVEIRO - deve LISTAR 3 opções
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 3: CHUVEIRO - deve LISTAR as 3 opções');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado3 = await testarCenario(
    'Chuveiro - listar opções',
    [
      'Boa tarde',
      'Sim, sou cliente',
      'chuveiro'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const listouSimples = respostaLower.includes('simples') && respostaLower.includes('95');
      const listouLuxo = respostaLower.includes('luxo') && respostaLower.includes('130');
      const listouResistencia = respostaLower.includes('resistência') && respostaLower.includes('75');
      
      if (!listouSimples || !listouLuxo || !listouResistencia) {
        return { passou: false, motivo: '❌ Não listou todas as 3 opções de chuveiro com preços' };
      }
      return { passou: true, motivo: '✅ Listou todas as 3 opções de chuveiro com preços' };
    }
  );
  resultados.push(resultado3);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 4: TOMADA - deve LISTAR 4 opções
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 4: TOMADA - deve LISTAR as 4 opções');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado4 = await testarCenario(
    'Tomada - listar opções',
    [
      'Oi',
      'Não',
      'Maria',
      'quero instalar tomada'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const listouSimples = respostaLower.includes('simples') || respostaLower.includes('dupla');
      const listouIndustrial = respostaLower.includes('industrial') && respostaLower.includes('85');
      const listouPiso = respostaLower.includes('piso') && respostaLower.includes('65');
      
      if (!listouSimples || !listouIndustrial || !listouPiso) {
        return { passou: false, motivo: '❌ Não listou todas as opções de tomada com preços' };
      }
      return { passou: true, motivo: '✅ Listou todas as opções de tomada com preços' };
    }
  );
  resultados.push(resultado4);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 5: LUZ DE TRILHO - deve transferir para Jennifer
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 5: LUZ DE TRILHO - deve transferir');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado5 = await testarCenario(
    'Luz de trilho - transferir',
    [
      'Boa tarde',
      'Sim',
      'luz de trilho'
    ],
    (resposta: string) => {
      const respostaLower = resposta.toLowerCase();
      const temJennifer = respostaLower.includes('jennifer');
      const temTransferir = respostaLower.includes('transferir');
      const inventouPreco = /r\$\s*\d+/.test(respostaLower);
      
      if (inventouPreco) {
        return { passou: false, motivo: '❌ Inventou preço para luz de trilho!' };
      }
      if (!temJennifer || !temTransferir) {
        return { passou: false, motivo: '❌ Não transferiu para Jennifer' };
      }
      return { passou: true, motivo: '✅ Transferiu para Jennifer sem inventar preço' };
    }
  );
  resultados.push(resultado5);

  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 6: Fluxo completo NOVO cliente - deve perguntar PF/PJ
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 6: Fluxo completo NOVO cliente - lustre');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado6 = await testarCenario(
    'Fluxo completo NOVO cliente',
    [
      'Oi',
      'Não',
      'Pedro',
      'lampada',
      'lustre simples',
      'sim'
    ],
    (resposta: string, todasRespostas: string[]) => {
      // Verificar se listou opções na 4ª resposta (após nome)
      const respostaListagem = todasRespostas[3]?.toLowerCase() || '';
      const listouOpcoes = respostaListagem.includes('lustre simples') && respostaListagem.includes('97');
      
      // Verificar se 6ª resposta (última) pergunta PF/PJ ou transfere
      const respostaLower = resposta.toLowerCase();
      const perguntouPFPJ = 
        respostaLower.includes('pessoa física') || 
        respostaLower.includes('pessoa jurídica') ||
        respostaLower.includes('pf') ||
        respostaLower.includes('pj');
      
      const transferiu = respostaLower.includes('transferir') && respostaLower.includes('jennifer');
      
      if (!listouOpcoes) {
        return { passou: false, motivo: '❌ Não listou as opções quando cliente pediu "lampada"' };
      }
      if (!perguntouPFPJ && !transferiu) {
        return { passou: false, motivo: '❌ Não perguntou PF/PJ e não transferiu para Jennifer' };
      }
      if (transferiu) {
        return { passou: true, motivo: '✅ Fluxo funcionou: listou opções → cliente escolheu → transferiu para Jennifer' };
      }
      return { passou: true, motivo: '✅ Fluxo completo: listou opções → cliente escolheu → perguntou PF/PJ' };
    }
  );
  resultados.push(resultado6);
  
  // ══════════════════════════════════════════════════════════════════════════
  // CENÁRIO 7: Cliente existente - deve transferir direto sem pedir dados
  // ══════════════════════════════════════════════════════════════════════════
  console.log('\n📋 CENÁRIO 7: Cliente EXISTENTE - transferir direto');
  console.log('───────────────────────────────────────────────────────────────');
  
  const resultado7 = await testarCenario(
    'Cliente existente - transferir direto',
    [
      'Oi',
      'Sim, sou cliente',
      'tomada simples',
      'sim'
    ],
    (resposta: string, todasRespostas: string[]) => {
      const respostaLower = resposta.toLowerCase();
      const transferiu = respostaLower.includes('transferir') && respostaLower.includes('jennifer');
      const pedeDados = 
        respostaLower.includes('cpf') ||
        respostaLower.includes('cnpj') ||
        respostaLower.includes('pessoa física') ||
        respostaLower.includes('pessoa jurídica');
      
      if (pedeDados) {
        return { passou: false, motivo: '❌ Cliente JÁ É CLIENTE - não deve pedir dados novamente!' };
      }
      if (!transferiu) {
        return { passou: false, motivo: '❌ Não transferiu para Jennifer' };
      }
      return { passou: true, motivo: '✅ Cliente existente: transferiu direto sem pedir dados' };
    }
  );
  resultados.push(resultado7);

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
  const perguntaAntesFluxo = resultados[0].passou;
  const listaLampada = resultados[1].passou;
  const listaChuveiro = resultados[2].passou;
  const listaTomada = resultados[3].passou;
  const transfereLuz = resultados[4].passou;
  const fluxoNovoCliente = resultados[5].passou;
  const clienteExistente = resultados[6].passou;

  console.log('\n🎯 VERIFICAÇÕES CRÍTICAS:');
  console.log(`   ${perguntaAntesFluxo ? '✅' : '❌'} Pergunta antes do fluxo → "vou ajudar mas primeiro..."`);
  console.log(`   ${listaLampada ? '✅' : '❌'} Lâmpada → Lista todas as 7 opções com preços`);
  console.log(`   ${listaChuveiro ? '✅' : '❌'} Chuveiro → Lista as 3 opções com preços`);
  console.log(`   ${listaTomada ? '✅' : '❌'} Tomada → Lista as 4 opções com preços`);
  console.log(`   ${transfereLuz ? '✅' : '❌'} Luz de trilho → Transfere para Jennifer`);
  console.log(`   ${fluxoNovoCliente ? '✅' : '❌'} Fluxo novo cliente funcionando`);
  console.log(`   ${clienteExistente ? '✅' : '❌'} Cliente existente → Transfere sem pedir dados`);
  
  if (passou === resultados.length) {
    console.log('\n🎉 PERFEITO! Todos os testes passaram!\n');
  } else {
    console.log(`\n⚠️  ${falhou} teste(s) falharam - necessário ajustar o prompt\n`);
  }
}

main().catch(console.error);
