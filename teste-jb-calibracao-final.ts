/**
 * 🧪 TESTE DE CALIBRAÇÃO FINAL - JB ELÉTRICA
 * 10 cenários diferentes baseados nos requisitos do cliente
 * Foco: Conversa natural, sem menus numéricos, coleta de informações eficiente
 */

import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';

config();

const MISTRAL_KEY = 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';

// ═══════════════════════════════════════════════════════════════════════════════
// 📝 PROMPT ATUAL DO BANCO (para calibração)
// ═══════════════════════════════════════════════════════════════════════════════
const PROMPT_BANCO = `Fluxo de Atendimento JB Elétrica
1.IDENTIDADE DO AGENTE
Atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda. Atenda de forma educada, profissional, clara, objetiva e humana.


2.HORÁRIOS DE ATENDIMENTO
 - Segunda a sexta-feira: 08h às 12h | 13h30 às 18h (Horário de Brasília)
 - Horário de almoço: 12h às 13h30
 - Sábado, domingo e feriados: não atendemos.

3. VERIFICAÇÃO DE HORÁRIO (início do fluxo)
- Se fora do horário de atendimento (segunda a sexta, 08h-12h e 13h30-18h, fuso Brasília):
- Mostrar "No momento, estamos fora do horário de atendimento. Nosso horário é de segunda a sexta, 08h às 12h e 13h30 às 18h. Mas vou dar seguimento no seu atendimento."
- Se horário de almoço (12h às 13h30):
- Mostrar "Estamos no horário de almoço (12h às 13h30). Mas vou dar seguimento no seu atendimento."
- Continuar fluxo normal.

3. SAUDAÇÃO
- Manhã: Bom dia
- Tarde: Boa tarde
- Noite: Boa noite

4. FLUXO INICIAL
Seja bem-vindo à JB Elétrica. Você já é cliente da JB Elétrica?
- Sim → "Que bom ter você de volta! Qual serviço você gostaria de solicitar hoje?
Para SIM Clientes

1. Cliente informa que já é cliente.

2. IA fala: Que bom ter você de volta! Qual serviço você gostaria de solicitar hoje?

3. Cliente informa o serviço.

4. IA coleta todas as informações necessárias sobre o serviço (como tipo de serviço, detalhes, etc.).

5. Se o serviço for simples e estiver no sistema com valor:
- IA informa o valor e pergunta: Você gostaria de agendar esse serviço?

6. Se o serviço precisar de visita técnica ou orçamento:
 - IA fala: Para esse serviço, é melhor marcar uma visita para o técnico avaliar no local.
- IA pergunta: Você gostaria de agendar a visita técnica?

7. Se cliente confirmar que quer o serviço/visita:
- IA fala: Vou transferir para o atendente confirmar os detalhes e o horário. Aguarde um momento, por favor.

8. Transferir para o atendente.

Regras- Não pedir dados do cliente porque ele já é cadastrado.
- IA coleta informações sobre o serviço e repassa para o atendente.
- IA pode tirar dúvidas do cliente sobre o serviço ou processo.
- Transferir para o atendente após cliente confirmar interesse no serviço/visita.


- Não → "Para continuar, informe seu nome, por favor.

Para Não Clientes
1. Cliente informa que não é cliente.
2. IA pergunta: Para continuar, informe seu nome, por favor.
3. Cliente informa o nome.
4. IA pergunta: Qual serviço você gostaria de solicitar, [nome do cliente]?
5. Cliente informa o serviço.
6. Se o serviço for simples e estiver no sistema com valor:
   - IA informa o valor e pergunta: Você gostaria de agendar esse serviço ou precisa de uma visita técnica para orçamento?
7. Se o serviço precisar de visita técnica ou orçamento:
   - IA fala: Entendi. Para esse serviço, é melhor marcar uma visita para o técnico avaliar no local.
8. IA pergunta: Você gostaria de agendar a visita técnica/serviço?
9. Se cliente confirmar:
- IA fala: Para agendar, preciso de alguns dados para o cadastro. Por favor, informe:
- Nome completo
-  CPF (somente números, 11 dígitos)
- E-mail válido
- Endereço completo (com número do apartamento se for o caso)
 - IA fala: Não se preocupe com os dados, eles estão seguros conosco.

Validação de Dados- CPF: verificar se tem 11 dígitos numéricos
- E-mail: verificar formato válido com @ e domínio (ex: exemplo@dominio.com)

Confirmação de Dados- IA repete os dados para confirmação: Confirma os dados, por favor?
- Nome: [nome]
- CPF: [CPF]
- E-mail: [e-mail]
- Endereço: [endereço]
- Se dados confirmados:
- IA fala: Vou encaminhar para o atendente confirmar os detalhes e o horário. Aguarde um momento, por favor.
- Transferir para o atendente

Serviços com Valores
- Instalação de chuveiro elétrico simples – R$ 95,00
- Instalação de chuveiro elétrico luxo – R$ 130,00
- Troca de resistência de chuveiro – R$ 75,00
- Instalação de torneira elétrica – R$ 105,00
- Instalação de tomada simples – R$ 55,00
- Instalação de tomada dupla – R$ 55,00
- Instalação de tomada tripla – R$ 55,00
- Instalação de tomada industrial (3P+1) – R$ 85,00
- Instalação de tomada de piso – R$ 65,00
- Instalação de tomada sobrepor com canaleta – R$ 95,00
- Instalação de interruptor simples – R$ 55,00
- Instalação de interruptor duplo – R$ 55,00
- Instalação de interruptor bipolar – R$ 55,00
- Instalação de interruptor e tomada (juntos) – R$ 55,00
- Instalação de luminária tubular – R$ 55,00
- Instalação de perfil de LED (1 metro) – R$ 150,00
- Instalação de lustre simples – R$ 97,00
- Instalação de lustre grande – R$ 145,00
- Instalação de pendente simples – R$ 75,00
- Instalação de luminária de emergência (embutir) – R$ 70,00
- Instalação de luminária de emergência (sobrepor) – R$ 75,00
- Instalação de refletor LED + sensor – R$ 105,00
- Instalação de refletor LED + fotocélula – R$ 105,00
- Instalação de refletor de jardim – R$ 95,00
- Instalação de refletor de poste – R$ 140,00
- Instalação de sensor de presença – R$ 75,00
- Instalação de fotocélula – R$ 75,00
- Instalação de ventilador de parede – R$ 120,00
- Instalação de ventilador de teto sem passagem de fio – R$ 120,00
- Instalação de ventilador de teto com passagem de fio – R$ 150,00
- Instalação de chave de boia – R$ 120,00
- Instalação de IDR (DR) – R$ 120,00
- Instalação de contator – R$ 215,00
- Substituição de disjuntor monofásico – R$ 65,00
- Substituição de disjuntor bifásico – R$ 85,00
- Substituição de disjuntor trifásico – R$ 120,00
- Conversão de tomada 127v para 220v sem passagem de cabos - R$ 55,00 
- Conversão de tomada 220v para 127v sem passagem de cabos - R$ 55,00 

Serviços sem Preço Fixo
- Instalações elétricas residenciais, prediais, comerciais e industriais (dentro de Uberlândia)
- Manutenção preventiva e corretiva (diagnóstico de defeitos, disjuntores desarmando, quedas/fugas, tomadas sem funcionar, luzes piscando)
- Montagem e organização de quadros de distribuição (QDC), troca/instalação de DR/IDR e disjuntores
- Iluminação: spots, pendentes, lustres, luminárias tubulares, perfil de LED, refletores e iluminação de emergência
- Instalação de sensores (presença), fotocélulas e automação básica (quando solicitado)
- Pontos e adequações elétricas para ar-condicionado (somente ponto elétrico)
- Instalação física de câmeras Wi-Fi (configuração por conta do cliente, com possível auxílio)
- Pontos/ligação elétrica para bomba de piscina e verificação da alimentação elétrica
- Projetos e adequações elétricas sob avaliação técnica
- Atendimento e suporte para orçamentos e visitas técnicas (sem custo)

Mensagens de Horário
- Horário de almoço: "Estamos no horário de almoço (12h às 13h30). Mas vou dar seguimento no seu atendimento."
- Fora do horário: "No momento, estamos fora do horário de atendimento. Nosso horário é de segunda a sexta, 08h às 12h e 13h30 às 18h. Mas vou dar seguimento no seu atendimento."

Redes Sociais
Instagram -  https://www.instagram.com/jbeletrica.oficial 
google - https://share.google/mkzKtk0Gegc86y0oe - Veja os comentários dos nossos clientes sobre os nossos serviços!
Site - https://jbeletrica.com.br/ - Confira mais sobre a JB Elétrica!

Informações de Elétrica
- Disjuntor desarmando: pode ser sobrecarga ou curto-circuito.
- DR desarmando: pode ser problema em algum equipamento. Orientar o cliente a:
- Tirar todos os equipamentos da tomada e ligar o DR de volta.
- Se o DR ligar, ir ligando os equipamentos um por um e testar se o DR desarma (identificar o equipamento com problema).
- Se o DR continuar desarmando mesmo com tudo desligado, encaminhar um técnico.
- Luz piscando: pode ser problema na fiação, falta de neutro, ou lâmpada com problema.
- Tomada não funcionando: pode ser problema na fiação ou na tomada.
- Tomada de chuveiro derretida: pode ser porque a tomada não suporta a amperagem do chuveiro (chuveiros normalmente precisam de 32A, tomadas comuns são de 20A). Recomendamos usar conector Wago ou instalação adequada para a potência do chuveiro.
- Pino do microondas derretido/queimado: pode ser por uso de adaptador. Orientar o cliente: "O uso de adaptador no microondas pode causar danos e é perigoso. Recomendamos não usar adaptadores e conectar o microondas diretamente na tomada adequada."
- Outros problemas elétricos: se precisar, podemos agendar uma visita de um técnico para avaliar e resolver. Quer marcar uma visita?

Fluxo para Encaminhamento para Visita Técnica1. Cliente fala do problema.
2. IA explica o problema e orienta (usando "Informações de Elétrica").
3. IA pergunta: "Quer que a gente agende uma visita de um técnico para resolver o problema?"
4. Se cliente confirma que sim:
   - IA fala: "Vou transferir para o atendente confirmar os detalhes e o horário. Aguarde um momento, por favor."
5. Transferir para o atendente

Regras para IA (Ya)-
 Se cliente pergunta sobre horário (ex: "tem horário pra amanhã?", "horário pra hoje?", etc.):
- Cliente já cadastrado: IA responde "Vou verificar com o atendente. Aguarde um momento, por favor." e transfere para o atendente.
- Cliente não cadastrado: IA responde "Para confirmar o horário, preciso de alguns dados. Vou transferir para o atendente." e transfere para o atendente após pegar os dados necessários.
- Importante: IA NÃO deve oferecer ou prometer horários específicos. Apenas transferir para o atendente confirmar.

Fluxo- IA não fornece horários.
- IA transfere para atendente confirmar tudo

*CONVERSÃO DE VOLTAGEM CASA*
Para fazermos a conversão de voltagem da casa inteira, é importante verificar se o padrão elétrico da Cemig permite as duas voltagens desejadas (220V e 127V). Se tiver essas duas opções disponíveis, conseguimos fazer a mudança no *valor de R$165,00* sem a necessidade de passar fiação adicional.

No entanto, se for necessário passar fiação adicional, precisaremos encaminhar um técnico para avaliar o serviço e passar o valor do serviço de instalação e da fiação necessária.

Por favor, nos informe para que possamos avaliar a possibilidade e prosseguir

*CONVERSÃO DE VOLTAGEM TOMADA*
Para realizarmos a conversão de voltagem da sua tomada, primeiro verificamos as opções disponíveis (220V e 127V):

• Se a tomada já possuir a voltagem desejada, o valor do serviço será de R$ 55,00 por tomada.
• Se a tomada não possuir a voltagem necessária, será preciso passar uma nova fiação para adicionar a voltagem correta. Nesse caso, o custo será informado após avaliação técnica.

## REGRAS CRÍTICAS OBRIGATÓRIAS:
1. NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural
2. NUNCA pergunte ao cliente qual dia/horário prefere - sempre diga que vai verificar com atendente
3. SEMPRE transfira para atendente (Jennifer) para confirmar horários
4. SEMPRE informe preço quando o serviço tiver valor tabelado
5. Se cliente já mandar tudo junto (nome, serviço, etc), aproveite as informações
6. Se cliente quiser adicionar serviço extra durante conversa, inclua na solicitação`;

interface Cenario {
  id: number;
  nome: string;
  descricao: string;
  mensagens: string[];
  validar: { 
    deveConter: string[];
    naoDeveConter: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧪 10 CENÁRIOS DE TESTE BASEADOS NOS REQUISITOS DO CLIENTE
// ═══════════════════════════════════════════════════════════════════════════════
const CENARIOS: Cenario[] = [
  // 1️⃣ CLIENTE NOVO - INSTALAÇÃO DE TOMADA (simples com preço)
  {
    id: 1,
    nome: '✅ Cliente novo - Instalação de tomada simples',
    descricao: 'Cliente não cadastrado quer instalar tomada. Deve informar preço R$55 e coletar dados.',
    mensagens: [
      'Boa tarde',
      'Não, não sou cliente',
      'João Silva',
      'Quero instalar uma tomada simples',
      'Sim, pode agendar',
      'João Silva Pereira',
      '12345678901',
      'joao@email.com',
      'Rua das Flores, 100, Centro, Uberlândia',
      'Sim, confirmo'
    ],
    validar: {
      deveConter: ['55', 'r$', 'atendente'],
      naoDeveConter: ['digite 1', 'digite 2', 'opção 1', 'qual dia você', 'qual horário você']
    }
  },

  // 2️⃣ CLIENTE EXISTENTE - CHUVEIRO (simples com preço)
  {
    id: 2,
    nome: '✅ Cliente existente - Instalação de chuveiro',
    descricao: 'Cliente já cadastrado quer instalar chuveiro. Não pedir dados, só informar preço e transferir.',
    mensagens: [
      'Olá',
      'Sim, já sou cliente',
      'Quero instalar um chuveiro elétrico simples',
      'Sim, pode agendar'
    ],
    validar: {
      deveConter: ['95', 'r$', 'volta', 'atendente'],
      naoDeveConter: ['cpf', 'digite', 'qual dia você prefere']
    }
  },

  // 3️⃣ CLIENTE COM DÚVIDA - DISJUNTOR DESARMANDO
  {
    id: 3,
    nome: '✅ Cliente dúvida - Disjuntor desarmando',
    descricao: 'Cliente com problema de disjuntor. IA deve orientar e oferecer visita.',
    mensagens: [
      'Oi, boa tarde',
      'Sim',
      'Meu disjuntor fica desarmando toda hora, não sei o que é',
      'Sim, quero agendar uma visita'
    ],
    validar: {
      deveConter: ['sobrecarga', 'atendente'],
      naoDeveConter: ['digite', 'opção']
    }
  },

  // 4️⃣ CLIENTE COM DR DESARMANDO (procedimento técnico)
  {
    id: 4,
    nome: '✅ Cliente DR desarmando - Procedimento',
    descricao: 'Cliente com DR desarmando. IA deve dar procedimento de diagnóstico.',
    mensagens: [
      'Olá',
      'Sim, já sou cliente',
      'O DR da minha casa não para de desarmar',
      'Vou fazer o teste que você falou'
    ],
    validar: {
      deveConter: ['equipamento'],
      naoDeveConter: ['digite 1', 'digite 2']
    }
  },

  // 5️⃣ CLIENTE PEDINDO ORÇAMENTO COMPLEXO (visita técnica)
  {
    id: 5,
    nome: '✅ Cliente orçamento complexo - Visita técnica',
    descricao: 'Cliente quer fazer instalação elétrica completa. Precisa de visita técnica, NÃO informar preço.',
    mensagens: [
      'Bom dia',
      'Não sou cliente',
      'Carlos',
      'Preciso fazer a instalação elétrica completa da minha casa nova'
    ],
    validar: {
      deveConter: ['visita', 'técnic'],
      naoDeveConter: ['r$ 55', 'r$ 95', 'preço é', 'custa r$']
    }
  },

  // 6️⃣ CLIENTE JÁ MANDANDO TUDO JUNTO
  {
    id: 6,
    nome: '✅ Cliente mandando tudo junto',
    descricao: 'Cliente já manda nome e serviço de uma vez. IA deve aproveitar as informações.',
    mensagens: [
      'Bom dia, meu nome é Fernanda, quero instalar um ventilador de teto',
      'Não, primeira vez',
      'Sem passagem de fio',
      'Sim, pode agendar'
    ],
    validar: {
      deveConter: ['120', 'fernanda'],
      naoDeveConter: ['digite', 'opção']
    }
  },

  // 7️⃣ CLIENTE PERGUNTANDO HORÁRIO
  {
    id: 7,
    nome: '✅ Cliente perguntando horário',
    descricao: 'Cliente pergunta se tem horário. IA NÃO deve oferecer horários, só transferir.',
    mensagens: [
      'Oi',
      'Sim, sou cliente',
      'Quero instalar uma tomada',
      'Tem horário para amanhã de manhã?'
    ],
    validar: {
      deveConter: ['verificar', 'atendente'],
      naoDeveConter: ['10h', '11h', '14h', 'horário disponível']
    }
  },

  // 8️⃣ CLIENTE SEM ENERGIA (falta de luz)
  {
    id: 8,
    nome: '✅ Cliente sem energia - CEMIG',
    descricao: 'Cliente sem luz. IA deve perguntar sobre energia/companhia.',
    mensagens: [
      'Socorro, estou sem luz aqui em casa',
      'Sim, já sou cliente',
      'Sim, já liguei e disseram que o problema é interno',
      'Sim, quero agendar'
    ],
    validar: {
      deveConter: ['atendente'],
      naoDeveConter: ['digite']
    }
  },

  // 9️⃣ CLIENTE ADICIONANDO SERVIÇO EXTRA
  {
    id: 9,
    nome: '✅ Cliente adicionando serviço extra',
    descricao: 'Cliente pede tomada e depois adiciona instalação de interruptor. IA deve incluir.',
    mensagens: [
      'Olá',
      'Sim, sou cliente',
      'Quero instalar uma tomada simples',
      'Ah, esqueci, também quero instalar um interruptor',
      'Sim, pode agendar os dois'
    ],
    validar: {
      deveConter: ['55', 'atendente'],
      naoDeveConter: ['digite', 'qual dia você']
    }
  },

  // 🔟 CLIENTE NOVO - VALIDAÇÃO DE DADOS
  {
    id: 10,
    nome: '✅ Cliente novo - Validação de dados',
    descricao: 'IA deve validar CPF com 11 dígitos e e-mail válido.',
    mensagens: [
      'Boa tarde',
      'Não sou cliente',
      'Maria',
      'Quero trocar resistência do chuveiro',
      'Sim, pode agendar',
      'Maria Souza Lima',
      '123',
      '12345678901',
      'maria@gmail.com',
      'Rua dos Ipês, 50, Uberlândia',
      'Confirmo os dados'
    ],
    validar: {
      deveConter: ['atendente'],
      naoDeveConter: ['digite 1', 'opção']
    }
  }
];

// ═══════════════════════════════════════════════════════════════════════════════
// 🤖 FUNÇÃO DE CHAMADA À IA
// ═══════════════════════════════════════════════════════════════════════════════
async function chamarIA(historico: { role: string; content: string }[]): Promise<string> {
  const mistral = new Mistral({ apiKey: MISTRAL_KEY });
  
  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages: [
      { role: 'system', content: PROMPT_BANCO },
      ...historico
    ],
    temperature: 0.2,
    maxTokens: 600
  });
  
  return response.choices?.[0]?.message?.content?.toString() || '';
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🧪 FUNÇÃO DE TESTE
// ═══════════════════════════════════════════════════════════════════════════════
async function testarCenario(cenario: Cenario): Promise<{ sucesso: boolean; detalhes: string; conversa: string }> {
  console.log(`\n🔄 [${cenario.id}] ${cenario.nome}`);
  console.log(`   📋 ${cenario.descricao}`);
  
  const historico: { role: string; content: string }[] = [];
  const erros: string[] = [];
  let conversaCompleta = '';
  
  // Simular conversa
  for (const mensagem of cenario.mensagens) {
    historico.push({ role: 'user', content: mensagem });
    conversaCompleta += `\n👤 Cliente: ${mensagem}`;
    
    try {
      const resposta = await chamarIA(historico);
      historico.push({ role: 'assistant', content: resposta });
      conversaCompleta += `\n🤖 IA: ${resposta.substring(0, 200)}${resposta.length > 200 ? '...' : ''}`;
      
      // Verificação inline de erros graves
      const respostaLower = resposta.toLowerCase();
      if (respostaLower.includes('digite 1') || respostaLower.includes('digite 2') || respostaLower.includes('opção 1')) {
        erros.push('⚠️ Usou menu numérico (PROIBIDO)');
      }
      if (respostaLower.includes('qual dia você prefere') || respostaLower.includes('qual horário você prefere')) {
        erros.push('⚠️ Perguntou dia/horário ao cliente (PROIBIDO)');
      }
      
      await new Promise(r => setTimeout(r, 500)); // Rate limiting
    } catch (error: any) {
      erros.push(`❌ Erro API: ${error.message}`);
      break;
    }
  }
  
  // Validar resultado final
  const todasRespostas = historico
    .filter(h => h.role === 'assistant')
    .map(h => h.content)
    .join(' ')
    .toLowerCase();
  
  // Verificar o que DEVE conter
  for (const termo of cenario.validar.deveConter) {
    if (!todasRespostas.includes(termo.toLowerCase())) {
      erros.push(`❌ Faltou: "${termo}"`);
    }
  }
  
  // Verificar o que NÃO DEVE conter
  for (const termo of cenario.validar.naoDeveConter) {
    if (todasRespostas.includes(termo.toLowerCase())) {
      erros.push(`❌ Contém proibido: "${termo}"`);
    }
  }
  
  const sucesso = erros.length === 0;
  
  if (sucesso) {
    console.log(`   ✅ PASSOU!`);
  } else {
    console.log(`   ❌ FALHOU: ${erros.join(', ')}`);
  }
  
  return {
    sucesso,
    detalhes: erros.join('; ') || 'OK',
    conversa: conversaCompleta
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO PRINCIPAL
// ═══════════════════════════════════════════════════════════════════════════════
async function main() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TESTE DE CALIBRAÇÃO FINAL - JB ELÉTRICA');
  console.log('   10 CENÁRIOS BASEADOS NOS REQUISITOS DO CLIENTE');
  console.log('═'.repeat(70));
  
  const resultados: { id: number; nome: string; sucesso: boolean; detalhes: string }[] = [];
  
  for (const cenario of CENARIOS) {
    const resultado = await testarCenario(cenario);
    resultados.push({
      id: cenario.id,
      nome: cenario.nome,
      sucesso: resultado.sucesso,
      detalhes: resultado.detalhes
    });
  }
  
  // Relatório final
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(70));
  
  const sucessos = resultados.filter(r => r.sucesso).length;
  const total = resultados.length;
  const percentual = ((sucessos / total) * 100).toFixed(0);
  
  console.log(`\n📈 RESULTADO: ${sucessos}/${total} (${percentual}%)\n`);
  
  // Mostrar falhas
  const falhas = resultados.filter(r => !r.sucesso);
  if (falhas.length > 0) {
    console.log('❌ CENÁRIOS COM FALHA:');
    for (const f of falhas) {
      console.log(`   [${f.id}] ${f.nome}`);
      console.log(`       → ${f.detalhes}`);
    }
  }
  
  // Mostrar sucessos
  const passaram = resultados.filter(r => r.sucesso);
  if (passaram.length > 0) {
    console.log('\n✅ CENÁRIOS QUE PASSARAM:');
    for (const p of passaram) {
      console.log(`   [${p.id}] ${p.nome}`);
    }
  }
  
  console.log('\n' + '═'.repeat(70));
  
  if (parseInt(percentual) === 100) {
    console.log('🎉 CALIBRAÇÃO 100% COMPLETA! Agente pronto para produção.');
  } else {
    console.log(`⚠️  CALIBRAÇÃO ${percentual}% - Ajustes necessários no prompt.`);
  }
  console.log('═'.repeat(70) + '\n');
}

main().catch(console.error);
