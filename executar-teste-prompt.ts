/**
 * 🧪 TESTE PRÁTICO DO PROMPT DE VENDAS
 * 
 * Este script executa testes reais contra a API Mistral
 * para validar o prompt do agente de vendas
 */

import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';

config();

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjIzNTMzODksImV4cCI6MjA3NzkyOTM4OX0.AVDgFqn1h-00a5CzS2SZYlcXl4TxtKVrdjKDkN08kVM';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || 'EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF';
const USER_ID = 'd4a1d307-3d78-4bfe-8ab7-c4a0c3ccbb1c'; // contato@jbeletrica.com.br

console.log('Usando SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_KEY presente:', SUPABASE_KEY ? 'Sim' : 'Não');
console.log('MISTRAL_KEY presente:', MISTRAL_KEY ? 'Sim' : 'Não');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════════════════════════════════════════
// 📋 CENÁRIOS DE TESTE BASEADOS NA SOLICITAÇÃO (JB ELÉTRICA)
// ════════════════════════════════════════════════════════════════════════════

interface CenarioTeste {
  id: string;
  nome: string;
  descricao: string;
  historico: { role: 'user' | 'assistant'; content: string }[];
  novaMensagem: string;
  validacoes: {
    naoDeveConter: string[];  // Coisas que NÃO podem aparecer na resposta
    deveConter?: string[];     // Coisas que devem aparecer
    precoCorreto?: string;     // Preço que deve manter
  };
}

const CENARIOS: CenarioTeste[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 1: Localização (Fora da cidade)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T01',
    nome: 'Localização - Araxá',
    descricao: 'Verificar se nega atendimento fora de Uberlândia',
    historico: [],
    novaMensagem: 'Oi, vocês atendem em Araxá?',
    validacoes: {
        naoDeveConter: ['Sim, atendemos em Araxá', 'posso agendar'],
        deveConter: ['Uberlândia']
    }
  },
   // ═══════════════════════════════════════════════════════════════════════
  // TESTE 2: Localização (Dentro da cidade)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T02',
    nome: 'Localização - Uberlândia',
    descricao: 'Verificar se aceita atendimento em bairro de Uberlândia',
    historico: [],
    novaMensagem: 'Vocês atendem no bairro Santa Mônica em Uberlândia?',
    validacoes: {
        naoDeveConter: ['não atendemos', 'somente Uberlândia'],
        deveConter: ['JB Elétrica']
    }
  },
  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 3: Vazamento de Prompt (Primeira Mensagem)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T03',
    nome: 'Primeira Mensagem - Sem Vazamento',
    descricao: 'Verificar se não vaza instruções lógicas (Se SIM...)',
    historico: [],
    novaMensagem: 'Olá',
    validacoes: {
        naoDeveConter: ['(Se SIM:', 'Se SIM"', 'Se NÃO', 'Para continuar'],
        deveConter: ['Seja bem-vindo', 'Você já é cliente']
    }
  },
    // ═══════════════════════════════════════════════════════════════════════
  // TESTE 4: Chuveiros (Texto Específico)
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T04',
    nome: 'Serviço - Chuveiro',
    descricao: 'Verificar o texto obrigatório para chuveiros',
    historico: [{role: 'assistant', content: 'Você já é cliente da JB Elétrica?'}, {role: 'user', content: 'Sim'}],
    novaMensagem: 'Meu chuveiro queimou',
    validacoes: {
        naoDeveConter: ['R$ 75,00 para visita', 'cobramos visita', 'troca de resistência é R$ 75'],
        deveConter: ['Podemos encaminhar um técnico', 'resistência à parte', 'verificação no local']
    }
  },
     // ═══════════════════════════════════════════════════════════════════════
  // TESTE 5: Serviços Excluídos
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T05',
    nome: 'Serviço Excluído - Cerca Elétrica',
    descricao: 'Verificar se nega serviço excluído',
    historico: [{role: 'assistant', content: 'Você já é cliente da JB Elétrica?'}, {role: 'user', content: 'Sim'}],
    novaMensagem: 'Vocês instalam cerca elétrica?',
    validacoes: {
        naoDeveConter: ['Sim', 'posso agendar'],
        deveConter: ['não realizamos']
    }
  }

];

// ════════════════════════════════════════════════════════════════════════════
// 🚀 EXECUTOR DE TESTES
// ════════════════════════════════════════════════════════════════════════════

const PROMPT_TESTE = `# AGENTE JB ELÉTRICA - INSTRUÇÕES OBRIGATÓRIAS

## 1. IDENTIDADE
Você é a atendente virtual oficial da JB Elétrica Produtos e Serviços Ltda.
- Seja educada, profissional, clara, objetiva e humana.
- NUNCA use menus numéricos (digite 1, 2, 3) - use conversa natural.
- Use emojis com moderação.
- **RESTRIÇÃO GEOGRÁFICA:** ATENDEMOS EXCLUSIVAMENTE DENTRO DA CIDADE DE UBERLÂNDIA-MG.
  - Se o cliente perguntar se atende em outra cidade (ex: Araxá, Araguari, qualquer outra), diga educadamente que atendemos APENAS em Uberlândia, inclusive em todos os bairros da cidade.
  - Se perguntar se atende em um bairro de Uberlândia, confirme que sim.

## 2. HORÁRIOS DE ATENDIMENTO
- Segunda a sexta: 08h às 12h | 13h30 às 18h (Horário de Brasília)
- Horário de almoço: 12h às 13h30
- SÁBADO, DOMINGO E FERIADOS: NÃO ATENDEMOS

## 3. SAUDAÇÕES E FLUXO INICIAL (CRÍTICO)

### PRIMEIRA MENSAGEM DO CLIENTE:
Responda sempre com:
"[Saudação conforme horário]! Seja bem-vindo(a) à JB Elétrica! ⚡
Você já é cliente da JB Elétrica?"

---
**REGRA DE FLUXO (LÓGICA INTERNA - NÃO IMPRIMA ESTE TEXTO):**

1. **SE O CLIENTE RESPONDER "SIM" (que já é cliente):**
   Responda com: "Que bom ter você de volta! 😊 Qual serviço você gostaria de solicitar hoje?"
   (Não peça nome/dados novamente, pois já temos. Prossiga perguntando o serviço).

2. **SE O CLIENTE RESPONDER "NÃO" (que não é cliente):**
   Responda EXATAMENTE com: "Para continuar, por favor me informe seu nome."
   (Aguarde o cliente enviar o nome. SÓ DEPOIS que ele enviar o nome, diga: "Prazer, [NOME]! Qual serviço você gostaria de solicitar?")

---

## 4. FLUXO DE ATENDIMENTO E SERVIÇOS

### SERVIÇOS ESPECÍFICOS:

**CHUVEIROS (Reparo/Manutenção/Troca):**
Se o cliente mencionar chuveiro queimado, troca de resistência ou conserto, USE EXATAMENTE O TEXTO ABAIXO:
"Podemos encaminhar um técnico para verificar o que está acontecendo com o seu chuveiro.
O problema pode ser na resistência, no disjuntor ou até na fiação.

Caso seja apenas a troca da resistência, o valor da mão de obra é R$ 75,00 (resistência à parte, conforme o modelo).

O serviço só é realizado após a verificação no local e sua autorização.

Posso verificar um horário disponível para você?"

### SERVIÇOS QUE NÃO REALIZAMOS (NEGAR EDUCADAMENTE):
NÃO fazemos os seguintes serviços. Se o cliente pedir, informe que a empresa não realiza este tipo de trabalho:
- Instalação de alarme
- Instalação de cerca elétrica
- Instalação de interfone
- Conserto de interfone
- Instalação de portão eletrônico

### SERVIÇOS COM VALORES TABELADOS (INFORME SE O CLIENTE SOLICITAR):

**INSTALAÇÃO DE TOMADAS:**
- Tomada simples/dupla/tripla – R$ 55,00
- Tomada industrial (3P+1) – R$ 85,00
- Tomada de piso – R$ 65,00
- Tomada sobrepor com canaleta – R$ 95,00

**INSTALAÇÃO DE CHUVEIROS (Instalação nova):**
- Chuveiro elétrico simples – R$ 95,00
- Chuveiro elétrico luxo – R$ 130,00
(Para conserto/manutenção, use a regra específica de CHUVEIROS acima).

**INSTALAÇÃO DE TORNEIRAS:**
- Torneira elétrica – R$ 105,00

**INSTALAÇÃO DE INTERRUPTORES:**
- Interruptor simples/duplo/bipolar – R$ 55,00
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

**OUTROS SERVIÇOS:**
- Chave de boia – R$ 120,00
- IDR (DR) – R$ 120,00
- Contator – R$ 215,00
- Substituição disjuntor monofásico – R$ 65,00
- Substituição disjuntor bifásico – R$ 85,00
- Substituição disjuntor trifásico – R$ 120,00
- Conversão de tomada 127v/220v sem passar fio – R$ 55,00

## 5. REGRAS GERAIS E AGENDAMENTO
- Se o serviço não tem preço fixo acima: "Para esse serviço, precisamos agendar uma visita técnica para avaliar. Gostaria de agendar?"
- Ao coletar dados para agendamento (novos clientes):
  1. Nome completo
  2. CPF (11 dígitos)
  3. E-mail
  4. Endereço completo
  Diga: "Não se preocupe, seus dados estão seguros conosco! 🔒"
- DÚVIDAS TÉCNICAS: Use bom senso, ofereça visita técnica para diagnóstico.
- EMERGÊNCIAS (FOGO/RISCO): Instrua desligar chave geral e chamar bombeiros (193).
- **FINALIZAÇÃO**: Ao confirmar interesse, diga: "Vou transferir para a Jennifer confirmar os detalhes e o horário. Aguarde um momento!"
- Ar-condicionado: Fazemos apenas ponto elétrico, não instalamos o aparelho.
- Conversão de voltagem: Se o padrão permitir, R$ 165,00 a casa toda (sem fiação nova). Se precisar de fiação, visita técnica.
`;

interface ResultadoTeste {
  id: string;
  nome: string;
  passou: boolean;
  detalhes: string[];
  resposta: string;
}

async function buscarPrompt(): Promise<string> {
  // Retornar prompt hardcoded para garantir teste da versão nova
  return PROMPT_TESTE;
}

async function chamarMistral(prompt: string, historico: any[], novaMensagem: string): Promise<string> {
  const mistral = new Mistral({ apiKey: MISTRAL_KEY });
  
  const messages: any[] = [
    { role: 'system', content: prompt }
  ];
  
  // Adicionar histórico
  for (const msg of historico) {
    messages.push(msg);
  }
  
  // Adicionar nova mensagem
  messages.push({ role: 'user', content: novaMensagem });
  
  const response = await mistral.chat.complete({
    model: 'mistral-small-latest',
    messages,
    temperature: 0.7,
    maxTokens: 500
  });
  
  return response.choices?.[0]?.message?.content?.toString() || '';
}

async function executarTeste(cenario: CenarioTeste, prompt: string): Promise<ResultadoTeste> {
  console.log(`\n   📝 ${cenario.id}: ${cenario.nome}`);
  
  const detalhes: string[] = [];
  let passou = true;
  
  try {
    const resposta = await chamarMistral(prompt, cenario.historico, cenario.novaMensagem);
    
    console.log(`      Mensagem: "${cenario.novaMensagem.substring(0, 50)}..."`);
    console.log(`      Resposta: "${resposta.substring(0, 80)}..."`);
    
    // Validar "não deve conter"
    for (const nao of cenario.validacoes.naoDeveConter) {
      if (resposta.toLowerCase().includes(nao.toLowerCase())) {
        passou = false;
        detalhes.push(`❌ Contém "${nao}" mas não deveria`);
      }
    }
    
    // Validar "deve conter"
    if (cenario.validacoes.deveConter) {
      for (const deve of cenario.validacoes.deveConter) {
        if (!resposta.toLowerCase().includes(deve.toLowerCase())) {
          passou = false;
          detalhes.push(`❌ Não contém "${deve}" mas deveria`);
        }
      }
    }
    
    // Validar preço
    if (cenario.validacoes.precoCorreto) {
      const precoIncorretos = ['R$99', 'R$149', 'R$199'].filter(
        p => p !== cenario.validacoes.precoCorreto && resposta.includes(p)
      );
      if (precoIncorretos.length > 0) {
        passou = false;
        detalhes.push(`❌ Usou preço incorreto: ${precoIncorretos.join(', ')}`);
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
  console.log('🧪 TESTE PRÁTICO DO PROMPT DE VENDAS - AGENTEZAP');
  console.log('═'.repeat(70));
  
  // Verificar API key
  if (!MISTRAL_KEY) {
    console.log('\n❌ ERRO: MISTRAL_API_KEY não configurada');
    console.log('   Configure a variável de ambiente e rode novamente');
    return;
  }
  
  // Buscar prompt atual
  console.log('\n📋 Buscando prompt atual do banco...');
  let prompt: string;
  try {
    prompt = await buscarPrompt();
    console.log(`   ✅ Prompt carregado (${prompt.length} caracteres)`);
  } catch (error: any) {
    console.log(`   ❌ Erro ao buscar prompt: ${error.message}`);
    return;
  }
  
  // Executar testes
  console.log('\n🧪 Executando testes...');
  const resultados: ResultadoTeste[] = [];
  
  for (const cenario of CENARIOS) {
    const resultado = await executarTeste(cenario, prompt);
    resultados.push(resultado);
    
    // Pequeno delay para não sobrecarregar a API
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
      console.log(`      Resposta: "${r.resposta.substring(0, 100)}..."`);
    }
  }
  
  // Recomendações
  console.log('\n' + '═'.repeat(70));
  console.log('💡 RECOMENDAÇÕES');
  console.log('═'.repeat(70));
  
  if (parseFloat(taxa) >= 90) {
    console.log('\n   ✅ Prompt está excelente! Taxa acima de 90%.');
  } else if (parseFloat(taxa) >= 70) {
    console.log('\n   ⚠️ Prompt precisa de ajustes. Analise os testes que falharam.');
  } else {
    console.log('\n   ❌ Prompt precisa de revisão significativa.');
  }
  
  console.log('\n' + '═'.repeat(70) + '\n');
}

// Executar
executarTodosTestes().catch(console.error);
