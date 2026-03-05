/**
 * TESTE JB ELÉTRICA - CENÁRIOS CORRIGIDOS
 * Testa cenários específicos:
 * 1. Serviço cadastrado (tomada) - deve informar preço
 * 2. Serviço NÃO cadastrado (luz de trilho) - deve transferir para Jennifer
 */

import { Mistral } from '@mistralai/mistralai';

const MISTRAL_API_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

const SUPABASE_PROJECT = 'bnfpcuzjvycudccycqqt';
const USER_ID_JB = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c';

// Prompt da versão 34 (corrigida)
const PROMPT_VERSAO_34 = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação (máximo 1-2 por mensagem)

## 3. SAUDAÇÕES
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL
Ao receber mensagem inicial (Olá, Oi, Bom dia):
"[Saudação]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

## 5. CLIENTES EXISTENTES (respondeu SIM)
1. IA: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
2. Cliente informa o serviço
3. **VERIFICAR SE SERVIÇO ESTÁ NA LISTA:**
   - **Se estiver na lista de valores tabelados** → informar valor e perguntar: "Você gostaria de agendar?"
   - **Se estiver na lista de visita técnica** → "Para esse serviço, é necessário realizar uma visita técnica para avaliação e orçamento. Você gostaria de agendar?"
   - **Se NÃO estiver em NENHUMA lista** → ir para SEÇÃO 10 (SERVIÇO NÃO CADASTRADO)
4. Se cliente responder SIM para agendar → "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde!"

**REGRA:** Para clientes existentes, NÃO pedir dados (já cadastrado). Apenas coletar info sobre o serviço e transferir para Jennifer.

## 6. NOVOS CLIENTES (respondeu NÃO)

**⚠️ REGRA CRÍTICA - SEMPRE PEDIR O NOME PRIMEIRO ⚠️**

### ETAPA 1 - PEDIR NOME (OBRIGATÓRIO):
Quando o cliente responder "NÃO" para a pergunta se é cliente, você DEVE OBRIGATORIAMENTE responder APENAS:

"Para continuar, por favor me informe seu nome."

### ETAPA 2 - Serviço (SOMENTE APÓS RECEBER O NOME):
Após o cliente informar o nome, responder:
"Prazer, [NOME]! Qual serviço você gostaria de solicitar?"

### ETAPA 3 - VERIFICAR SE SERVIÇO ESTÁ NA LISTA:
- **Se estiver na lista de valores tabelados** → informar valor e perguntar: "Você gostaria de agendar?"
- **Se estiver na lista de visita técnica** → "Para esse serviço, é necessário realizar uma visita técnica para avaliação e orçamento. Você gostaria de agendar?"
- **Se NÃO estiver em NENHUMA lista** → ir para SEÇÃO 10 (SERVIÇO NÃO CADASTRADO)

## 9. SERVIÇOS COM VALORES TABELADOS

**TOMADAS:**
- Tomada simples/dupla/tripla ➔ R$ 55,00
- Instalação de tomada simples/dupla/tripla ➔ R$ 55,00  
- Trocar tomada ➔ R$ 55,00
- Colocar tomada ➔ R$ 55,00
- Tomada industrial (3P+1) ➔ R$ 85,00
- Tomada de piso ➔ R$ 65,00
- Tomada sobrepor com canaleta ➔ R$ 95,00

**IMPORTANTE:** Palavras-chave como "instalar tomada", "trocar tomada", "colocar tomada" SEM mencionar "passagem de fio" ou "puxar fio" = R$ 55,00. Se cliente mencionar "passagem de cabo/fio" ou "puxar fio novo", aí sim é visita técnica.

**ILUMINAÇÃO:**
- Luminária tubular ➔ R$ 55,00
- Perfil de LED (1 metro) ➔ R$ 150,00
- Lustre simples ➔ R$ 97,00
- Lustre grande ➔ R$ 145,00
- Pendente simples ➔ R$ 75,00

## 10. SERVIÇO NÃO CADASTRADO - TRANSFERÊNCIA IMEDIATA

**⚠️ REGRA CRÍTICA: Se o serviço solicitado NÃO estiver em NENHUMA das listas abaixo, você DEVE transferir IMEDIATAMENTE para a Jennifer**

**EXEMPLOS de serviços NÃO cadastrados que devem ser transferidos:**
- Luz de trilho
- Spot de trilho
- Trilho eletrificado
- Sistema de iluminação em trilho
- Qualquer outro serviço não mencionado nas listas

**RESPOSTA PARA SERVIÇO NÃO CADASTRADO:**
"Entendi! Para esse serviço específico, vou transferir você para a Jennifer que é a responsável e poderá te ajudar melhor com as informações e valores. Aguarde um momento! 😊"

**NÃO:**
- ❌ Não invente preços
- ❌ Não peça dados do cliente
- ❌ Não pergunte se quer agendar
- ❌ Não continue o atendimento

**SIM:**
- ✅ Transfira IMEDIATAMENTE para Jennifer
- ✅ Seja natural e educado
- ✅ Não mencione que não sabe o valor

## 14. REGRAS CRÍTICAS FINAIS

1. ✅ NUNCA use menus numéricos (digite 1, 2, 3)
2. ✅ NUNCA pergunte qual dia/horário o cliente prefere - sempre transfira para Jennifer
3. ✅ SEMPRE informe preço quando o serviço tiver valor tabelado
12. ✅ **Se serviço NÃO estiver em NENHUMA lista, transferir IMEDIATAMENTE para Jennifer - NÃO invente preços!**
13. ✅ **Após cliente confirmar que quer agendar, NÃO pergunte novamente qual serviço - prossiga com a coleta de dados ou transferência**
`;

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

async function testCenario(nome: string, mensagens: string[]): Promise<void> {
  console.log('\n' + '═'.repeat(80));
  console.log(`🧪 CENÁRIO: ${nome}`);
  console.log('═'.repeat(80));

  const client = new Mistral({
    apiKey: MISTRAL_API_KEY
  });

  const history: Message[] = [];

  for (let i = 0; i < mensagens.length; i++) {
    const userMsg = mensagens[i];
    
    console.log(`\n👤 CLIENTE: ${userMsg}`);
    
    history.push({ role: 'user', content: userMsg });

    try {
      const response = await client.chat.complete({
        model: 'mistral-small-latest',
        maxTokens: 500,
        messages: [
          { role: 'system', content: PROMPT_VERSAO_34 },
          ...history
        ]
      });

      const assistantMsg = response.choices?.[0]?.message?.content || '';

      history.push({ role: 'assistant', content: assistantMsg });
      
      console.log(`🤖 AGENTE: ${assistantMsg}`);
      
      // Análise da resposta
      if (i === mensagens.length - 1) {
        console.log('\n📊 ANÁLISE:');
        analyzeResponse(nome, userMsg, assistantMsg);
      }
      
      // Pequena pausa
      await new Promise(resolve => setTimeout(resolve, 1000));
      
    } catch (error) {
      console.error(`❌ ERRO:`, error);
      break;
    }
  }
}

function analyzeResponse(cenario: string, pergunta: string, resposta: string): void {
  const respostaLower = resposta.toLowerCase();
  
  if (cenario.includes('LUZ DE TRILHO')) {
    // Cenário de serviço NÃO cadastrado
    if (respostaLower.includes('jennifer') || respostaLower.includes('jenifer')) {
      console.log('✅ CORRETO: Transferiu para Jennifer');
    } else {
      console.log('❌ ERRO: NÃO transferiu para Jennifer');
    }
    
    if (respostaLower.includes('r$') || respostaLower.includes('150')) {
      console.log('❌ ERRO: Inventou preço (não deveria)');
    } else {
      console.log('✅ CORRETO: Não inventou preço');
    }
    
    if (respostaLower.includes('agendar')) {
      console.log('❌ ERRO: Perguntou sobre agendamento (não deveria)');
    } else {
      console.log('✅ CORRETO: Não perguntou sobre agendamento');
    }
  }
  
  if (cenario.includes('TOMADA')) {
    // Cenário de serviço cadastrado
    if (respostaLower.includes('r$') && respostaLower.includes('55')) {
      console.log('✅ CORRETO: Informou preço correto (R$ 55,00)');
    } else {
      console.log('❌ ERRO: Não informou preço ou informou errado');
    }
    
    if (pergunta.toLowerCase().includes('sim') && respostaLower.includes('qual serviço')) {
      console.log('❌ ERRO: Perguntou serviço novamente após confirmação');
    }
  }
}

async function runAllTests() {
  console.log('🚀 INICIANDO TESTES - JB ELÉTRICA');
  console.log(`📦 Projeto Supabase: ${SUPABASE_PROJECT}`);
  console.log(`👤 User ID: ${USER_ID_JB}`);
  console.log(`📝 Prompt: Versão 34 (corrigida)`);
  
  // CENÁRIO 1: Serviço cadastrado (TOMADA)
  await testCenario('CENÁRIO 1 - TOMADA (SERVIÇO CADASTRADO)', [
    'Olá! Tenho interesse e queria mais informações, por favor.',
    'Qual o valor para instalar uma tomada simples?',
    'sim'
  ]);
  
  // CENÁRIO 2: Serviço NÃO cadastrado (LUZ DE TRILHO)
  await testCenario('CENÁRIO 2 - LUZ DE TRILHO (SERVIÇO NÃO CADASTRADO)', [
    'Oi, bom dia!',
    'Qual o valor para trocar essa luz comum para uma luz de trilho?'
  ]);
  
  // CENÁRIO 3: Cliente novo pedindo serviço cadastrado
  await testCenario('CENÁRIO 3 - NOVO CLIENTE + TOMADA', [
    'Olá',
    'não',
    'Rodrigo',
    'Preciso instalar uma tomada'
  ]);
  
  console.log('\n' + '═'.repeat(80));
  console.log('✅ TESTES CONCLUÍDOS');
  console.log('═'.repeat(80));
}

// Executar
runAllTests().catch(console.error);
