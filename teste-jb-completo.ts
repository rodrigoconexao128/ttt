/**
 * 🧪 SIMULAÇÃO DE 10 CONVERSAS COMPLETAS - JB ELÉTRICA
 * Testa conversas completas cliente → agente até conversão
 */

import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';

config();

const MISTRAL_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

const PROMPT = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
- Use emojis com moderação

### RESTRIÇÃO GEOGRÁFICA ABSOLUTA:
ATENDEMOS EXCLUSIVAMENTE EM UBERLÂNDIA-MG
- Se cliente mencionar QUALQUER outra cidade (Araxá, Araguari, Uberaba, etc.):
  - PARAR IMEDIATAMENTE qualquer atendimento
  - NÃO oferecer visita técnica
  - NÃO perguntar horário
  - NÃO verificar agenda
  - RESPONDER APENAS: "Infelizmente, a JB Elétrica atende somente na cidade de Uberlândia-MG. Agradecemos o contato!"

## 2. HORÁRIOS DE ATENDIMENTO
- Segunda a sexta: 08h às 12h | 13h30 às 18h
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. FLUXO INICIAL OBRIGATÓRIO

PRIMEIRA MENSAGEM: SEMPRE responder com:
"[Saudação]! Seja bem-vindo(a) à JB Elétrica!
Você já é cliente da JB Elétrica?"

SE SIM: "Que bom ter você de volta! Qual serviço você precisa?"
SE NÃO: "O atendimento será para Pessoa Física ou Pessoa Jurídica?"

## 4. REGRA DE AGENDAMENTO (CRÍTICO)

NUNCA pergunte ao cliente qual dia/horário prefere.
SEMPRE dizer: "Vou verificar a disponibilidade na nossa agenda e a Jennifer vai entrar em contato para confirmar o horário."

## 5. SERVIÇOS COM VALORES (SEMPRE INFORMAR):
- Tomada simples – R$ 55,00
- Chuveiro simples – R$ 95,00
- Chuveiro luxo – R$ 130,00
- Resistência (verificação) – R$ 75,00
- Ventilador teto sem fio – R$ 120,00
- Ventilador teto com fio – R$ 150,00
- Conversão voltagem tomada – R$ 55,00

## 6. FLUXO FALTA DE ENERGIA:
Primeiro perguntar: "Você já falou com a Cemig?"
Se Cemig mandou chamar eletricista: encaminhar para agenda
Se não: recomendar contato com Cemig primeiro

## 7. SERVIÇOS QUE NÃO FAZEMOS:
- Cerca elétrica, alarme, interfone, portão eletrônico

## 8. REGRAS FINAIS:
1. SEMPRE perguntar se é cliente na primeira mensagem
2. NUNCA dizer "de volta" sem cliente confirmar que já é cliente
3. NUNCA perguntar horário ao cliente
4. NUNCA continuar se for fora de Uberlândia
5. SEMPRE informar preço quando tabelado
6. SEMPRE transferir para Jennifer confirmar horários`;

interface ConversaSimulada {
  id: number;
  nome: string;
  descricao: string;
  mensagensCliente: string[];
  validacaoFinal: {
    deveConter: string[];
    naoDeveConter: string[];
  };
}

const CONVERSAS: ConversaSimulada[] = [
  {
    id: 1,
    nome: 'Cliente Existente - Tomada',
    descricao: 'Cliente já cadastrado quer instalar tomada',
    mensagensCliente: ['Olá', 'Sim, já sou cliente', 'Quero instalar uma tomada simples', 'Sim, quero agendar'],
    validacaoFinal: { deveConter: ['Jennifer', '55'], naoDeveConter: ['qual dia você prefere', 'qual horário prefere'] }
  },
  {
    id: 2,
    nome: 'Cliente Novo PF - Chuveiro',
    descricao: 'Cliente novo pessoa física quer chuveiro',
    mensagensCliente: ['Boa tarde', 'Não', 'Pessoa física', 'Maria Silva', '12345678901', 'maria@email.com', 'Rua A, 100, Uberlândia', 'Quero instalar um chuveiro simples'],
    validacaoFinal: { deveConter: ['Jennifer', '95'], naoDeveConter: ['qual dia você prefere'] }
  },
  {
    id: 3,
    nome: 'Cliente Novo PJ',
    descricao: 'Empresa quer orçamento',
    mensagensCliente: ['Olá', 'Não', 'Pessoa jurídica', 'Empresa XYZ Ltda', '12345678000199', 'empresa@xyz.com', 'Av. Brasil 500, Uberlândia', 'Carlos', 'Quero um orçamento'],
    validacaoFinal: { deveConter: ['Jennifer'], naoDeveConter: ['qual dia', 'qual horário'] }
  },
  {
    id: 4,
    nome: 'Bloqueio - Araxá',
    descricao: 'Cliente de Araxá deve ser bloqueado',
    mensagensCliente: ['Oi', 'Sim', 'Preciso de um orçamento em Araxá'],
    validacaoFinal: { deveConter: ['Uberlândia', 'somente'], naoDeveConter: [] }
  },
  {
    id: 5,
    nome: 'Falta de Energia - CEMIG',
    descricao: 'Cliente sem luz, verificar CEMIG',
    mensagensCliente: ['Oi', 'Sim', 'Estou sem luz em casa', 'Sim, a Cemig disse para chamar eletricista'],
    validacaoFinal: { deveConter: ['Jennifer'], naoDeveConter: ['qual dia prefere'] }
  },
  {
    id: 6,
    nome: 'Serviço Negado - Cerca',
    descricao: 'Cliente pede cerca elétrica',
    mensagensCliente: ['Olá', 'Sim', 'Vocês fazem cerca elétrica?'],
    validacaoFinal: { deveConter: ['não'], naoDeveConter: [] }
  },
  {
    id: 7,
    nome: 'Chuveiro Queimado',
    descricao: 'Chuveiro não esquenta',
    mensagensCliente: ['Oi', 'Sim sou cliente', 'Meu chuveiro não esquenta'],
    validacaoFinal: { deveConter: ['resistência', '75', 'Jennifer'], naoDeveConter: ['qual dia'] }
  },
  {
    id: 8,
    nome: 'Ventilador de Teto',
    descricao: 'Instalar ventilador',
    mensagensCliente: ['Bom dia', 'Sim', 'Quero instalar ventilador de teto', 'Sem passagem de fio'],
    validacaoFinal: { deveConter: ['120', 'Jennifer'], naoDeveConter: ['qual horário você'] }
  },
  {
    id: 9,
    nome: 'Disjuntor Desarmando',
    descricao: 'Problema elétrico',
    mensagensCliente: ['Olá', 'Sim', 'Meu disjuntor fica desarmando'],
    validacaoFinal: { deveConter: ['sobrecarga'], naoDeveConter: [] }
  },
  {
    id: 10,
    nome: 'Conversão Voltagem',
    descricao: 'Converter tomada',
    mensagensCliente: ['Boa tarde', 'Sim', 'Quero converter a voltagem de uma tomada'],
    validacaoFinal: { deveConter: ['55', 'Jennifer'], naoDeveConter: ['qual dia você prefere'] }
  }
];

async function chamarMistral(historico: any[]): Promise<string> {
  const mistral = new Mistral({ apiKey: MISTRAL_KEY });
  
  const messages: any[] = [
    { role: 'system', content: PROMPT },
    ...historico
  ];
  
  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages,
    temperature: 0.3,
    maxTokens: 500
  });
  
  return response.choices?.[0]?.message?.content?.toString() || '';
}

async function executarConversa(conversa: ConversaSimulada): Promise<{sucesso: boolean, problemas: string[]}> {
  console.log(`\n   💬 Conversa ${conversa.id}: ${conversa.nome}`);
  console.log(`      ${conversa.descricao}`);
  
  const historico: any[] = [];
  const problemas: string[] = [];
  
  for (const msgCliente of conversa.mensagensCliente) {
    historico.push({ role: 'user', content: msgCliente });
    
    try {
      const resposta = await chamarMistral(historico);
      historico.push({ role: 'assistant', content: resposta });
      
      // Verificar problemas em cada resposta
      if (resposta.toLowerCase().includes('qual dia você prefere') || 
          resposta.toLowerCase().includes('qual horário você prefere')) {
        problemas.push('Perguntou horário ao cliente');
      }
      
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (e: any) {
      problemas.push(`Erro: ${e.message}`);
      break;
    }
  }
  
  // Validação final - verificar em TODO o histórico
  const todasRespostas = historico
    .filter((h: any) => h.role === 'assistant')
    .map((h: any) => h.content)
    .join('\n');
  
  for (const deve of conversa.validacaoFinal.deveConter) {
    if (!todasRespostas.toLowerCase().includes(deve.toLowerCase())) {
      problemas.push(`Deveria conter "${deve}"`);
    }
  }
  
  for (const naoDeve of conversa.validacaoFinal.naoDeveConter) {
    if (todasRespostas.toLowerCase().includes(naoDeve.toLowerCase())) {
      problemas.push(`Contém "${naoDeve}" (proibido)`);
    }
  }
  
  const sucesso = problemas.length === 0;
  console.log(`      ${sucesso ? '✅ SUCESSO' : '❌ PROBLEMAS: ' + problemas.join(', ')}`);
  
  return { sucesso, problemas };
}

async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 SIMULAÇÃO DE 10 CONVERSAS COMPLETAS - JB ELÉTRICA');
  console.log('═'.repeat(70));
  
  let sucessos = 0;
  let falhas = 0;
  
  for (const conversa of CONVERSAS) {
    const resultado = await executarConversa(conversa);
    if (resultado.sucesso) {
      sucessos++;
    } else {
      falhas++;
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RESULTADO FINAL');
  console.log('═'.repeat(70));
  console.log(`   ✅ Sucessos: ${sucessos}/10`);
  console.log(`   ❌ Falhas: ${falhas}/10`);
  console.log(`   Taxa: ${((sucessos/10)*100).toFixed(1)}%`);
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
