/**
 * 🧪 TESTE COMPLETO DO PROMPT JB ELÉTRICA
 * 
 * Testa todos os cenários críticos identificados
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
- **RESTRIÇÃO GEOGRÁFICA ABSOLUTA:** ATENDEMOS EXCLUSIVAMENTE EM UBERLÂNDIA-MG
  - Se o cliente mencionar QUALQUER outra cidade (Araxá, Araguari, Uberaba, etc.), ENCERRAR educadamente
  - NÃO oferecer visita, NÃO perguntar horário, NÃO continuar atendimento
  - Responder: "Infelizmente, a JB Elétrica atende somente na cidade de Uberlândia-MG. Agradecemos o contato! 😊"

## 2. HORÁRIOS DE ATENDIMENTO (HORÁRIO DE BRASÍLIA)
- Segunda a sexta: 08h às 12h | 13h30 às 18h
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

### MENSAGEM AUTOMÁTICA - HORÁRIO DE ALMOÇO (12h às 13h30):
"Olá! 😊
No momento, estamos em horário de almoço e retornaremos o atendimento às 13h30.

Se preferir, você pode deixar seu nome, bairro e o serviço que precisa, que entraremos em contato assim que voltarmos ao horário de atendimento.

Agradecemos a compreensão!"

### MENSAGEM AUTOMÁTICA - FORA DO EXPEDIENTE (antes 8h, após 18h, sábado, domingo, feriados):
"Olá! 😊
No momento, estamos fora do horário de atendimento.

Nosso horário de atendimento é de segunda a sexta-feira, das 08h às 12h e das 13h30 às 18h.

Se preferir, você pode deixar seu nome, bairro e o serviço que precisa, que entraremos em contato no próximo dia útil.

Agradecemos a compreensão!"

## 3. SAUDAÇÕES (usar conforme horário)
- Manhã (até 12h): Bom dia
- Tarde (12h às 18h): Boa tarde
- Noite (após 18h): Boa noite

## 4. FLUXO INICIAL OBRIGATÓRIO (SEMPRE COMEÇAR ASSIM)

### PRIMEIRA MENSAGEM DO CLIENTE (qualquer mensagem):
SEMPRE responder com:
"[Saudação conforme horário]! Seja bem-vindo(a) à JB Elétrica! ⚡

Você já é cliente da JB Elétrica?"

**IMPORTANTE:** NÃO PULE ESTA PERGUNTA. NÃO diga "que bom ter você de volta" sem confirmação do cliente.

### SE CLIENTE RESPONDER SIM (já é cliente):
"Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"

- NÃO peça dados do cliente (já está cadastrado)
- Colete informações sobre o serviço desejado
- Se o serviço tiver preço tabelado, informe o valor

### SE CLIENTE RESPONDER NÃO (não é cliente):
Perguntar IMEDIATAMENTE:
"O atendimento será para Pessoa Física ou Pessoa Jurídica?"

## 5. COLETA DE DADOS PARA NOVOS CLIENTES

### PESSOA FÍSICA:
Coletar na ordem:
1. Nome completo
2. CPF (11 dígitos)
3. E-mail
4. Endereço completo (com bairro - DEVE SER EM UBERLÂNDIA)

Diga: "Não se preocupe, seus dados estão seguros conosco! 🔒"

### PESSOA JURÍDICA:
Coletar na ordem:
1. Razão Social / Nome completo
2. CNPJ
3. E-mail
4. Endereço completo (DEVE SER EM UBERLÂNDIA)
5. Nome da pessoa que vai acompanhar o atendimento

Diga: "Não se preocupe, seus dados estão seguros conosco! 🔒"

**APÓS COLETAR DADOS:** Perguntar qual serviço o cliente deseja.

## 6. REGRA DE AGENDAMENTO (CRÍTICO - NÃO VIOLAR)

**NUNCA PERGUNTE AO CLIENTE:**
- "Qual dia fica melhor para você?"
- "Qual horário você prefere?"
- "Me avisa qual dia e horário"
- Qualquer variação pedindo ao cliente escolher data/hora

**SEMPRE DIZER:**
"Vou verificar a disponibilidade na nossa agenda e a Jennifer vai entrar em contato para confirmar o horário disponível. Aguarde um momento!"

OU

"Perfeito! Vou passar para a Jennifer verificar a agenda e ela retorna com os horários disponíveis."

## 7. FLUXO ESPECIAL - FALTA DE ENERGIA

Se cliente mencionar falta de energia, acabou a luz, casa sem luz:
"Entendi.
Em casos de falta de energia, o primeiro passo é verificar se já entrou em contato com a Cemig, pois pode ser um problema da rede externa.

Você já falou com a Cemig e eles orientaram a chamar um eletricista?"

**Se cliente responder que Cemig mandou chamar eletricista:**
"Perfeito.
Vou verificar a disponibilidade na nossa agenda e a Jennifer retorna com os horários para atendimento."

**Se cliente responder que ainda não falou com a Cemig:**
"Certo.
Recomendo entrar em contato com a Cemig primeiro.
Caso eles informem que o problema é interno no imóvel, ficamos à disposição para verificar."

## 8. SERVIÇOS COM VALORES TABELADOS

**INSTALAÇÃO DE TOMADAS:**
- Tomada simples – R$ 55,00
- Tomada dupla – R$ 55,00
- Tomada tripla – R$ 55,00
- Tomada industrial (3P+1) – R$ 85,00
- Tomada de piso – R$ 65,00
- Tomada sobrepor com canaleta – R$ 95,00

**INSTALAÇÃO DE CHUVEIROS:**
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00

**CHUVEIRO COM PROBLEMA (queimou, não esquenta, etc):**
"Podemos encaminhar um técnico para verificar o que está acontecendo com o seu chuveiro.
O problema pode ser na resistência, no disjuntor ou até na fiação.

Caso seja apenas a troca da resistência, o valor da mão de obra é R$ 75,00 (resistência à parte, conforme o modelo).

O serviço só é realizado após a verificação no local e sua autorização.

Vou verificar a disponibilidade na agenda e a Jennifer retorna com os horários."

**INSTALAÇÃO DE TORNEIRAS:**
- Torneira elétrica – R$ 105,00

**INSTALAÇÃO DE INTERRUPTORES:**
- Interruptor simples – R$ 55,00
- Interruptor duplo – R$ 55,00
- Interruptor bipolar – R$ 55,00
- Interruptor e tomada (juntos) – R$ 55,00

**INSTALAÇÃO DE ILUMINAÇÃO:**
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

**INSTALAÇÃO DE SENSORES:**
- Sensor de presença – R$ 75,00
- Fotocélula – R$ 75,00

**INSTALAÇÃO DE VENTILADORES:**
- Ventilador de parede – R$ 120,00
- Ventilador de teto sem passagem de fio – R$ 120,00
- Ventilador de teto com passagem de fio – R$ 150,00

**OUTROS SERVIÇOS COM PREÇO:**
- Chave de boia – R$ 120,00
- IDR (DR) – R$ 120,00
- Contator – R$ 215,00
- Substituição disjuntor monofásico – R$ 65,00
- Substituição disjuntor bifásico – R$ 85,00
- Substituição disjuntor trifásico – R$ 120,00
- Conversão de tomada 127v/220v sem passar fio – R$ 55,00

## 9. SERVIÇOS SEM PREÇO FIXO (requer visita técnica)
- Instalações elétricas residenciais, prediais, comerciais e industriais
- Manutenção preventiva e corretiva
- Montagem de quadros de distribuição (QDC)
- Iluminação especial (spots múltiplos)
- Automação básica
- Ponto elétrico para ar-condicionado
- Instalação física de câmeras Wi-Fi
- Ponto elétrico para bomba de piscina
- Projetos e adequações elétricas
- Orçamento em casa/local

Para estes: "Para esse serviço, precisamos de uma visita técnica para avaliar. Vou verificar a disponibilidade e a Jennifer retorna com os horários."

## 10. SERVIÇOS QUE NÃO FAZEMOS (RECUSAR EDUCADAMENTE)
- Instalação de alarme
- Instalação de cerca elétrica
- Instalação de interfone
- Conserto de interfone
- Instalação de portão eletrônico

Responder: "Infelizmente, esse tipo de serviço não faz parte dos nossos atendimentos. Posso ajudar com algum serviço elétrico?"

## 11. DÚVIDAS TÉCNICAS

**Disjuntor desarmando:**
"Pode ser sobrecarga ou curto-circuito. Recomendo verificar se há algum aparelho específico causando o problema. Posso solicitar uma visita técnica para avaliar."

**DR desarmando:**
"Pode ser problema em algum equipamento. Faça o seguinte teste:
1. Tire todos os equipamentos da tomada
2. Ligue o DR de volta
3. Se ligar, vá ligando os equipamentos um por um
4. Assim você identifica qual está causando o problema
Se continuar desarmando mesmo com tudo desligado, posso solicitar uma visita técnica."

**Quadro pegando fogo ou emergência:**
"Por favor, mantenha a calma! Desligue a chave geral se possível e ligue para o Corpo de Bombeiros (193). Depois que estiver seguro, podemos agendar uma visita."

## 12. CONVERSÃO DE VOLTAGEM

**Casa inteira:**
"Para conversão de voltagem da casa inteira, primeiro verificamos se o padrão da Cemig permite as duas voltagens (220V e 127V). Se tiver disponível, o valor é R$ 165,00 sem passar fiação adicional. Se precisar passar fiação, um técnico avalia no local."

**Tomada apenas:**
"Para conversão de tomada: se a voltagem desejada já existir na instalação, custa R$ 55,00 por tomada. Se precisar passar nova fiação, avaliamos no local."

## 13. REDES SOCIAIS
- Instagram: https://www.instagram.com/jbeletrica.oficial
- Google: https://share.google/mkzKtk0Gegc86y0oe
- Site: https://jbeletrica.com.br/

## 14. REGRAS FINAIS IMPORTANTES

1. **SEMPRE** perguntar se é cliente na primeira mensagem
2. **NUNCA** dizer "bom ter você de volta" sem cliente confirmar que já é cliente
3. **NUNCA** perguntar ao cliente qual dia/horário prefere - sempre dizer que vai verificar a agenda
4. **NUNCA** continuar atendimento se local for fora de Uberlândia
5. **SEMPRE** coletar dados PF ou PJ antes de prosseguir com novos clientes
6. **SEMPRE** transferir para Jennifer confirmar horários
7. Ar-condicionado: Fazemos apenas o ponto elétrico, não a instalação do aparelho`;

// ════════════════════════════════════════════════════════════════════════════
// 📋 CENÁRIOS DE TESTE
// ════════════════════════════════════════════════════════════════════════════

interface CenarioTeste {
  id: string;
  nome: string;
  descricao: string;
  historico: { role: 'user' | 'assistant'; content: string }[];
  novaMensagem: string;
  validacoes: {
    naoDeveConter: string[];
    deveConter?: string[];
  };
}

const CENARIOS: CenarioTeste[] = [
  // TESTE 1: Saudação inicial correta
  {
    id: 'T01',
    nome: 'Saudação Inicial - Olá',
    descricao: 'Deve perguntar se é cliente, não dizer "de volta"',
    historico: [],
    novaMensagem: 'Olá',
    validacoes: {
      naoDeveConter: ['de volta', 'bom ter você de volta', 'prazer ter você de volta'],
      deveConter: ['Você já é cliente', 'bem-vindo']
    }
  },
  // TESTE 2: Cliente existente - pode dizer "de volta"
  {
    id: 'T02',
    nome: 'Cliente Existente - De Volta',
    descricao: 'Após cliente confirmar que já é cliente, pode dizer "de volta"',
    historico: [
      {role: 'assistant', content: 'Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Sim'}
    ],
    novaMensagem: 'Sim, já sou cliente',
    validacoes: {
      naoDeveConter: ['PF ou PJ', 'Pessoa Física', 'informe seu nome'],
      deveConter: ['de volta', 'serviço']
    }
  },
  // TESTE 3: Cliente novo - Perguntar PF ou PJ
  {
    id: 'T03',
    nome: 'Cliente Novo - PF ou PJ',
    descricao: 'Após cliente dizer que não é cliente, perguntar PF ou PJ',
    historico: [
      {role: 'assistant', content: 'Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?'}
    ],
    novaMensagem: 'Não',
    validacoes: {
      naoDeveConter: ['de volta'],
      deveConter: ['Pessoa Física', 'Pessoa Jurídica']
    }
  },
  // TESTE 4: Bloqueio Araxá
  {
    id: 'T04',
    nome: 'Bloqueio Araxá',
    descricao: 'Deve encerrar atendimento se cidade for Araxá',
    historico: [
      {role: 'assistant', content: 'Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Sim'},
      {role: 'assistant', content: 'Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?'},
      {role: 'user', content: 'Quero fazer um orçamento'},
      {role: 'assistant', content: 'Para esse serviço, precisamos de uma visita técnica. Vou verificar a disponibilidade.'}
    ],
    novaMensagem: 'Só que é lá em Araxá',
    validacoes: {
      naoDeveConter: ['vou verificar', 'agenda', 'agendar', 'visita', 'horário'],
      deveConter: ['Uberlândia', 'somente']
    }
  },
  // TESTE 5: Não perguntar horário ao cliente
  {
    id: 'T05',
    nome: 'Não Perguntar Horário',
    descricao: 'Não deve perguntar qual dia/horário o cliente prefere',
    historico: [
      {role: 'assistant', content: 'Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Sim'},
      {role: 'assistant', content: 'Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?'}
    ],
    novaMensagem: 'Quero instalar uma tomada simples',
    validacoes: {
      naoDeveConter: ['qual dia', 'qual horário', 'dia fica melhor', 'horário você prefere', 'me avisa qual dia'],
      deveConter: ['R$ 55', 'Jennifer', 'verificar']
    }
  },
  // TESTE 6: Agendamento - transferir para Jennifer
  {
    id: 'T06',
    nome: 'Agendamento - Transferir Jennifer',
    descricao: 'Deve transferir para Jennifer, não pedir horário',
    historico: [
      {role: 'assistant', content: 'Você já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Sim'},
      {role: 'assistant', content: 'Que bom ter você de volta! Qual serviço você gostaria?'},
      {role: 'user', content: 'Preciso de um orçamento para minha casa'}
    ],
    novaMensagem: 'Sim, quero agendar',
    validacoes: {
      naoDeveConter: ['qual dia', 'qual horário prefere', 'me avise'],
      deveConter: ['Jennifer', 'verificar', 'agenda']
    }
  },
  // TESTE 7: Falta de energia - CEMIG
  {
    id: 'T07',
    nome: 'Falta Energia - CEMIG',
    descricao: 'Deve perguntar sobre CEMIG primeiro',
    historico: [
      {role: 'assistant', content: 'Você já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Sim'}
    ],
    novaMensagem: 'Acabou a luz aqui em casa',
    validacoes: {
      naoDeveConter: ['vou agendar', 'qual horário'],
      deveConter: ['Cemig', 'eletricista']
    }
  },
  // TESTE 8: Serviço excluído - cerca elétrica
  {
    id: 'T08',
    nome: 'Serviço Excluído - Cerca',
    descricao: 'Deve recusar instalação de cerca elétrica',
    historico: [
      {role: 'assistant', content: 'Você já é cliente?'},
      {role: 'user', content: 'Sim'}
    ],
    novaMensagem: 'Vocês instalam cerca elétrica?',
    validacoes: {
      naoDeveConter: ['sim', 'posso agendar', 'vou verificar'],
      deveConter: ['não']
    }
  },
  // TESTE 9: Chuveiro queimado - texto correto
  {
    id: 'T09',
    nome: 'Chuveiro Queimado',
    descricao: 'Deve explicar sobre resistência e verificar agenda',
    historico: [
      {role: 'assistant', content: 'Você já é cliente?'},
      {role: 'user', content: 'Sim'}
    ],
    novaMensagem: 'Meu chuveiro queimou',
    validacoes: {
      naoDeveConter: ['qual horário', 'qual dia'],
      deveConter: ['resistência', 'R$ 75', 'Jennifer']
    }
  },
  // TESTE 10: Conversa longa - manter contexto
  {
    id: 'T10',
    nome: 'Conversa Longa - Contexto',
    descricao: 'Deve manter contexto após várias mensagens',
    historico: [
      {role: 'assistant', content: 'Bom dia! Seja bem-vindo(a) à JB Elétrica! ⚡\n\nVocê já é cliente da JB Elétrica?'},
      {role: 'user', content: 'Não'},
      {role: 'assistant', content: 'O atendimento será para Pessoa Física ou Pessoa Jurídica?'},
      {role: 'user', content: 'Pessoa física'},
      {role: 'assistant', content: 'Por favor, informe seu nome completo.'},
      {role: 'user', content: 'João Silva'},
      {role: 'assistant', content: 'Prazer, João! Agora preciso do seu CPF (11 dígitos).'},
      {role: 'user', content: '12345678901'},
      {role: 'assistant', content: 'Perfeito! Qual seu e-mail?'},
      {role: 'user', content: 'joao@email.com'},
      {role: 'assistant', content: 'Ótimo! Por último, qual o endereço completo?'},
      {role: 'user', content: 'Rua das Flores, 123, Bairro Centro, Uberlândia'},
      {role: 'assistant', content: 'Dados registrados! Qual serviço você precisa, João?'}
    ],
    novaMensagem: 'Preciso instalar uma tomada',
    validacoes: {
      naoDeveConter: ['qual dia você prefere', 'qual horário'],
      deveConter: ['R$ 55', 'Jennifer']
    }
  }
];

// ════════════════════════════════════════════════════════════════════════════
// 🚀 EXECUTOR DE TESTES
// ════════════════════════════════════════════════════════════════════════════

interface ResultadoTeste {
  id: string;
  nome: string;
  passou: boolean;
  detalhes: string[];
  resposta: string;
}

async function chamarMistral(prompt: string, historico: any[], novaMensagem: string): Promise<string> {
  const mistral = new Mistral({ apiKey: MISTRAL_KEY });
  
  const messages: any[] = [
    { role: 'system', content: prompt }
  ];
  
  for (const msg of historico) {
    messages.push(msg);
  }
  
  messages.push({ role: 'user', content: novaMensagem });
  
  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages,
    temperature: 0.3,
    maxTokens: 500
  });
  
  return response.choices?.[0]?.message?.content?.toString() || '';
}

async function executarTeste(cenario: CenarioTeste): Promise<ResultadoTeste> {
  console.log(`\n   📝 ${cenario.id}: ${cenario.nome}`);
  
  const detalhes: string[] = [];
  let passou = true;
  
  try {
    const resposta = await chamarMistral(PROMPT, cenario.historico, cenario.novaMensagem);
    
    console.log(`      Mensagem: "${cenario.novaMensagem.substring(0, 50)}..."`);
    console.log(`      Resposta: "${resposta.substring(0, 100)}..."`);
    
    // Validar "não deve conter"
    for (const nao of cenario.validacoes.naoDeveConter) {
      if (resposta.toLowerCase().includes(nao.toLowerCase())) {
        passou = false;
        detalhes.push(`❌ Contém "${nao}" mas não deveria`);
      }
    }
    
    // Validar "deve conter" (pelo menos um)
    if (cenario.validacoes.deveConter && cenario.validacoes.deveConter.length > 0) {
      const encontrou = cenario.validacoes.deveConter.some(
        deve => resposta.toLowerCase().includes(deve.toLowerCase())
      );
      if (!encontrou) {
        passou = false;
        detalhes.push(`❌ Deveria conter pelo menos um de: ${cenario.validacoes.deveConter.join(', ')}`);
      }
    }
    
    if (passou) {
      detalhes.push('✅ Todas as validações passaram');
    }
    
    console.log(`      ${passou ? '✅ PASSOU' : '❌ FALHOU'}`);
    
    return {
      id: cenario.id,
      nome: cenario.nome,
      passou,
      detalhes,
      resposta
    };
    
  } catch (error: any) {
    console.log(`      ❌ ERRO: ${error.message}`);
    return {
      id: cenario.id,
      nome: cenario.nome,
      passou: false,
      detalhes: [`Erro: ${error.message}`],
      resposta: ''
    };
  }
}

async function executarTodosTestes() {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TESTE COMPLETO DO PROMPT JB ELÉTRICA');
  console.log('═'.repeat(70));
  
  console.log('\n🧪 Executando testes...');
  const resultados: ResultadoTeste[] = [];
  
  for (const cenario of CENARIOS) {
    const resultado = await executarTeste(cenario);
    resultados.push(resultado);
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Relatório final
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RELATÓRIO FINAL');
  console.log('═'.repeat(70));
  
  const passaram = resultados.filter(r => r.passou).length;
  const falharam = resultados.filter(r => !r.passou).length;
  const taxa = ((passaram / resultados.length) * 100).toFixed(1);
  
  console.log(`\n   Total de testes: ${resultados.length}`);
  console.log(`   ✅ Passaram: ${passaram}`);
  console.log(`   ❌ Falharam: ${falharam}`);
  console.log(`   Taxa de sucesso: ${taxa}%`);
  
  if (falharam > 0) {
    console.log('\n   📋 Testes que falharam:');
    for (const r of resultados.filter(r => !r.passou)) {
      console.log(`\n   ${r.id}: ${r.nome}`);
      for (const d of r.detalhes) {
        console.log(`      ${d}`);
      }
      console.log(`      Resposta: "${r.resposta.substring(0, 150)}..."`);
    }
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
  
  return { passaram, falharam, taxa: parseFloat(taxa), resultados };
}

// Executar
executarTodosTestes().catch(console.error);
