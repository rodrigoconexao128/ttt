/**
 * 🧪 TESTE PRÁTICO DO PROMPT DE VENDAS
 * 
 * Este script executa testes reais contra a API Mistral
 * para validar o prompt do agente de vendas Rodrigo
 */

import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';

config();

// Configurações
const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

console.log('Usando SUPABASE_URL:', SUPABASE_URL);
console.log('SUPABASE_KEY presente:', SUPABASE_KEY ? 'Sim' : 'Não');
console.log('MISTRAL_KEY presente:', MISTRAL_KEY ? 'Sim' : 'Não');

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// ════════════════════════════════════════════════════════════════════════════
// 📋 CENÁRIOS DE TESTE BASEADOS EM CONVERSAS REAIS
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
  // TESTE 1: Primeira mensagem - cliente quente com preço
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T01',
    nome: 'Primeira Mensagem - Cliente Quente',
    descricao: 'Cliente chega mencionando R$49 da campanha',
    historico: [],
    novaMensagem: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    validacoes: {
      naoDeveConter: ['R$99', 'R$149'],
      precoCorreto: 'R$49'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 2: Continuidade - NÃO deve cumprimentar novamente
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T02',
    nome: 'Continuidade - Sem Recumprimentar',
    descricao: 'Após várias mensagens, agente não deve dizer Olá novamente',
    historico: [
      { role: 'user', content: 'Olá! Tenho interesse no AgenteZap por R$49' },
      { role: 'assistant', content: 'Opa! Tudo bem? Me conta: o que você faz hoje? Vendas, atendimento ou qualificação de leads?' },
      { role: 'user', content: 'Trabalho com escola, supletivo online' },
      { role: 'assistant', content: 'Perfeito! Pra quem trabalha com educação, o AgenteZap é uma mão na roda! A IA pode responder dúvidas de alunos 24h, qualificar interessados e até fazer follow-up. Quer que eu te mostre como funciona?' },
      { role: 'user', content: '[Áudio transcrito] Então, eu preciso de algo que responda automaticamente quando aluno pergunta sobre matrícula' }
    ],
    novaMensagem: 'Então me explica melhor como configuro essa IA',
    validacoes: {
      naoDeveConter: ['Olá', 'Oi!', 'Bom dia', 'Boa tarde', 'Rodrigo da AgenteZap aqui', 'o que você faz'],
      deveConter: ['configura']  // Pode ser "configura" ou "configurar"
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 3: Responder a pergunta do cliente
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T03',
    nome: 'Resposta Direta - Pergunta Técnica',
    descricao: 'Cliente pergunta se precisa PC ligado - deve responder SIM/NÃO',
    historico: [
      { role: 'user', content: 'Oi, tudo bem?' },
      { role: 'assistant', content: 'Tudo ótimo! Me conta: você trabalha com vendas, atendimento ou qualificação?' },
      { role: 'user', content: 'Vendas de seguros' }
    ],
    novaMensagem: 'Mas preciso deixar o computador ligado o tempo todo?',
    validacoes: {
      naoDeveConter: ['Olá'],
      deveConter: ['não', 'servidor', '24']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 4: Objeção de preço
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T04',
    nome: 'Objeção - Preço Caro',
    descricao: 'Cliente diz que está caro - deve rebater com valor',
    historico: [
      { role: 'user', content: 'Olá! Tenho interesse no AgenteZap' },
      { role: 'assistant', content: 'Opa! Tudo bem? Me conta: o que você faz hoje?' },
      { role: 'user', content: 'Loja de roupas' },
      { role: 'assistant', content: 'Show! O AgenteZap é perfeito pra varejo. A IA responde 24h, faz follow-up, qualifica. Tudo por R$99/mês.' }
    ],
    novaMensagem: 'Hmm, tá caro. Vou pensar.',
    validacoes: {
      naoDeveConter: ['Olá', 'Oi!', 'Entendo que não é pra você'],
      deveConter: ['R$', 'cliente', 'paga']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 5: Não repetir mídia já enviada
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T05',
    nome: 'Não Repetir Informação',
    descricao: 'Não deve repetir o que já disse',
    historico: [
      { role: 'user', content: 'Me manda um vídeo mostrando o sistema' },
      { role: 'assistant', content: 'Claro! Olha esse vídeo mostrando o sistema funcionando: [MEDIA:DETALHES_DO_SISTEMA]' }
    ],
    novaMensagem: 'Legal! Quero ver mais',
    validacoes: {
      naoDeveConter: ['DETALHES_DO_SISTEMA']  // Não deve enviar a mesma mídia
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 6: Manter contexto de preço promocional
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T06',
    nome: 'Manter Preço Promocional',
    descricao: 'Após cliente mencionar R$49, não mudar para R$99',
    historico: [
      { role: 'user', content: 'Vi o anúncio de R$49/mês, é real?' },
      { role: 'assistant', content: 'Sim! O R$49/mês é real. Plano ilimitado! Me conta: você trabalha com o quê?' },
      { role: 'user', content: 'Clínica odontológica' },
      { role: 'assistant', content: 'Perfeito! Pra clínica, a IA pode agendar consultas, responder dúvidas, fazer confirmação de retorno...' }
    ],
    novaMensagem: 'Quanto fica por mês mesmo?',
    validacoes: {
      naoDeveConter: ['R$99', 'R$149'],
      deveConter: ['R$49'],
      precoCorreto: 'R$49'
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 7: Cliente com dificuldade - oferecer implementação
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T07',
    nome: 'Dificuldade → Oferecer Implementação',
    descricao: 'Quando cliente diz que não consegue configurar, oferecer R$199',
    historico: [
      { role: 'user', content: 'Oi, já criei conta mas não consegui configurar' },
      { role: 'assistant', content: 'Sem problemas! Me conta: onde você travou?' },
      { role: 'user', content: 'Na parte do prompt, não sei escrever' }
    ],
    novaMensagem: 'É muito difícil pra mim, não tenho tempo',
    validacoes: {
      naoDeveConter: ['Olá'],
      deveConter: ['implementação', 'R$199']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 8: Responder a áudio transcrito
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T08',
    nome: 'Responder Áudio Transcrito',
    descricao: 'Quando cliente manda áudio, deve ler a transcrição e responder',
    historico: [
      { role: 'user', content: 'Oi, posso mandar áudio?' },
      { role: 'assistant', content: 'Claro! Pode mandar!' }
    ],
    novaMensagem: '[Áudio transcrito] Olha, eu trabalho com venda de piscinas né, e meu problema é que os clientes ficam perguntando preço toda hora e eu não consigo responder rápido',
    validacoes: {
      naoDeveConter: ['não entendi', 'pode repetir'],
      deveConter: ['piscina']  // Deve mencionar o segmento
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 9: Lidar com resposta monossilábica
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T09',
    nome: 'Resposta Monossilábica',
    descricao: 'Quando cliente responde só "ok", deve avançar conversa',
    historico: [
      { role: 'user', content: 'Olá! Quero saber sobre o AgenteZap' },
      { role: 'assistant', content: 'Opa! Me conta: você trabalha com vendas, atendimento ou qualificação?' },
      { role: 'user', content: 'Vendas' },
      { role: 'assistant', content: 'Show! O AgenteZap é perfeito pra quem vende. A IA qualifica leads, faz follow-up automático...' }
    ],
    novaMensagem: 'Ok',
    validacoes: {
      naoDeveConter: ['Olá', 'Oi!'],
      deveConter: ['?']  // Deve fazer pergunta para avançar
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 10: Não dar informação redundante
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T10',
    nome: 'Não Repetir Link Já Dado',
    descricao: 'Se já deu o link, não deve dar novamente sem ser pedido',
    historico: [
      { role: 'user', content: 'Como faço pra criar conta?' },
      { role: 'assistant', content: 'É simples! Acessa https://agentezap.online/, cria conta e conecta seu WhatsApp.' },
      { role: 'user', content: 'Entendi, vou ver' },
      { role: 'assistant', content: 'Perfeito! Qualquer dúvida, é só chamar!' }
    ],
    novaMensagem: 'Voltei! Criei a conta',
    validacoes: {
      naoDeveConter: ['https://agentezap.online'],  // Não precisa dar o link de novo
      deveConter: ['?']  // Deve perguntar algo para ajudar
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 11: Responder sobre IA entender áudio
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T11',
    nome: 'IA Entende Áudio - Pergunta Direta',
    descricao: 'Cliente pergunta se a IA entende áudio',
    historico: [
      { role: 'user', content: 'Oi, tenho interesse' },
      { role: 'assistant', content: 'Opa! Me conta: você trabalha com o quê?' },
      { role: 'user', content: 'Loja de celulares' }
    ],
    novaMensagem: 'A IA entende áudio? Porque meus clientes mandam muito áudio',
    validacoes: {
      naoDeveConter: ['Olá', 'não entende'],
      deveConter: ['sim', 'áudio']
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 12: Cliente fala que já usa outra ferramenta
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T12',
    nome: 'Objeção - Já Usa Concorrente',
    descricao: 'Cliente menciona que já usa outra ferramenta',
    historico: [
      { role: 'user', content: 'Oi, vi o anúncio de vocês' },
      { role: 'assistant', content: 'Opa! Me conta: você trabalha com vendas, atendimento?' },
      { role: 'user', content: 'Vendas de imóveis' }
    ],
    novaMensagem: 'Já uso o Z-API e a ManyChat, não sei se preciso de mais uma ferramenta',
    validacoes: {
      naoDeveConter: ['Olá', 'tchau', 'entendo que não é pra você'],
      deveConter: ['?']  // Deve perguntar ou rebater
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 13: Cliente pede para voltar depois
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T13',
    nome: 'Objeção - Depois Eu Vejo',
    descricao: 'Cliente diz que vai ver depois',
    historico: [
      { role: 'user', content: 'Oi, tudo bem?' },
      { role: 'assistant', content: 'Tudo ótimo! Me conta: o que você faz?' },
      { role: 'user', content: 'Academia de ginástica' },
      { role: 'assistant', content: 'Show! Pra academia, a IA pode agendar aulas, responder sobre planos, fazer follow-up com quem parou de ir...' }
    ],
    novaMensagem: 'Legal, depois eu vejo isso melhor',
    validacoes: {
      naoDeveConter: ['Olá', 'tchau então'],
      deveConter: ['teste', 'grátis']  // Deve lembrar que é grátis para testar
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 14: Cliente com segmento específico - Mecânica
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T14',
    nome: 'Segmento Específico - Mecânica',
    descricao: 'Personalizar resposta para mecânica',
    historico: [
      { role: 'user', content: 'Olá! Tenho interesse no AgenteZap por R$49' }
    ],
    novaMensagem: 'Trabalho com mecânica de carros, oficina',
    validacoes: {
      naoDeveConter: ['R$99'],
      deveConter: ['mecânica']  // Pode ser mecânica OU oficina
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 15: Cliente quer saber do código promocional
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T15',
    nome: 'Código Promocional - Explicar',
    descricao: 'Cliente pergunta como usar o código',
    historico: [
      { role: 'user', content: 'Vi que tem um código promocional, como uso?' }
    ],
    novaMensagem: 'Onde coloco o código?',
    validacoes: {
      naoDeveConter: [],
      deveConter: ['PARC2026PROMO', 'Planos']  // Deve explicar onde usar
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 16: Cliente voltando após ghost
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T16',
    nome: 'Cliente Voltando Após Sumir',
    descricao: 'Cliente some e volta depois',
    historico: [
      { role: 'user', content: 'Oi, quero saber do AgenteZap' },
      { role: 'assistant', content: 'Opa! Me conta: você trabalha com o quê?' },
      { role: 'user', content: 'Loja de materiais de construção' },
      { role: 'assistant', content: 'Show! O AgenteZap é perfeito pra varejo. A IA responde preços, tira dúvidas, faz orçamento inicial...' },
      { role: 'assistant', content: '[Follow-up] Oi! Sumiu? 😄 Tava pensando aqui... pra loja de materiais, o AgenteZap ia ajudar muito no orçamento automático. Quer que eu te explique melhor?' }
    ],
    novaMensagem: 'Oi, desculpa, tava corrido aqui',
    validacoes: {
      naoDeveConter: ['Olá', 'Oi!', 'o que você faz'],  // NÃO deve recomeçar a conversa
      deveConter: ['?']  // Deve fazer pergunta para retomar
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 17: Cliente com múltiplas dúvidas
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T17',
    nome: 'Múltiplas Perguntas',
    descricao: 'Cliente faz várias perguntas de uma vez',
    historico: [
      { role: 'user', content: 'Oi, vi a propaganda' },
      { role: 'assistant', content: 'Opa! Me conta: você trabalha com o quê?' },
      { role: 'user', content: 'Consultoria' }
    ],
    novaMensagem: 'Quanto custa? Funciona sem internet? Preciso pagar todo mês?',
    validacoes: {
      naoDeveConter: ['Olá'],
      deveConter: ['R$', 'mês']  // Deve responder pelo menos sobre preço
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 18: Cliente quer garantias
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T18',
    nome: 'Garantia e Suporte',
    descricao: 'Cliente pergunta sobre garantia',
    historico: [
      { role: 'user', content: 'Oi, tenho interesse por R$49' },
      { role: 'assistant', content: 'Opa! O plano de R$49 é uma ótima opção. Me conta: você trabalha com o quê?' },
      { role: 'user', content: 'E-commerce de roupas' }
    ],
    novaMensagem: 'Se não gostar posso cancelar? Tem garantia?',
    validacoes: {
      naoDeveConter: ['Olá', 'não temos'],
      deveConter: ['cancelar', 'teste']  // Deve falar sobre cancelamento ou teste grátis
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 19: Cliente técnico - perguntas avançadas
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T19',
    nome: 'Perguntas Técnicas Avançadas',
    descricao: 'Cliente faz pergunta técnica',
    historico: [
      { role: 'user', content: 'Olá, sou desenvolvedor e quero saber mais' },
      { role: 'assistant', content: 'Opa! Legal que você é da área! Me conta: é pra automatizar atendimento de algum negócio seu?' },
      { role: 'user', content: 'Sim, tenho uma agência de marketing' }
    ],
    novaMensagem: 'Vocês usam qual modelo de IA? GPT? Tem API?',
    validacoes: {
      naoDeveConter: ['Olá'],
      deveConter: ['IA']  // Deve responder sobre a IA
    }
  },

  // ═══════════════════════════════════════════════════════════════════════
  // TESTE 20: Fechamento - cliente pronto para comprar
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 'T20',
    nome: 'Fechamento - Cliente Quente',
    descricao: 'Cliente sinalizou que vai assinar',
    historico: [
      { role: 'user', content: 'Olá! Quero assinar o AgenteZap por R$49' },
      { role: 'assistant', content: 'Perfeito! É só acessar https://agentezap.online/, criar conta e usar o código PARC2026PROMO.' },
      { role: 'user', content: 'Criei a conta, tô no painel' }
    ],
    novaMensagem: 'Onde coloco o código pra pagar R$49?',
    validacoes: {
      naoDeveConter: ['Olá', 'R$99'],
      deveConter: ['Planos', 'código', 'PARC2026PROMO']
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

async function buscarPrompt(): Promise<string> {
  const { data, error } = await supabase
    .from('ai_agent_config')
    .select('prompt')
    .eq('user_id', USER_ID)
    .single();
  
  if (error || !data) {
    throw new Error('Não foi possível buscar o prompt: ' + error?.message);
  }
  
  return data.prompt;
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
