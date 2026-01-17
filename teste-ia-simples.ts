/**
 * TESTE SIMPLIFICADO - IA AGENTE (RITA)
 * 
 * Testa o novo prompt com cenários específicos
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

// Configuração
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MISTRAL_API_KEY = process.env.MISTRAL_API_KEY || '';

// Carregar o novo prompt
const PROMPT_PATH = path.join(__dirname, 'PROMPT_ROBERTO_OLIV_NOVO.md');
const PROMPT_RITA = fs.readFileSync(PROMPT_PATH, 'utf-8');

interface TestCase {
  id: number;
  nome: string;
  mensagemCliente: string;
  criteriosEsperados: string[];
}

const TESTES: TestCase[] = [
  {
    id: 1,
    nome: 'Cliente perguntando valor de implante',
    mensagemCliente: 'Oi, quanto custa um implante?',
    criteriosEsperados: [
      'NÃO informou valor específico',
      'Explicou que valores só após avaliação',
      'Mencionou questões éticas ou segurança',
      'Ofereceu agendar avaliação'
    ]
  },
  {
    id: 2,
    nome: 'Cliente querendo agendar sábado',
    mensagemCliente: 'Quero marcar consulta para sábado de manhã',
    criteriosEsperados: [
      'Apresentou diferença entre paciente modelo e particular',
      'Mencionou que sábado/domingo = paciente modelo',
      'Mencionou que segunda-sexta = particular',
      'NÃO disse que não trabalha sábado'
    ]
  },
  {
    id: 3,
    nome: 'Primeiro contato (menu)',
    mensagemCliente: 'Olá!',
    criteriosEsperados: [
      'Apresentou menu com opções numeradas',
      'Incluiu opção de cursos',
      'Incluiu opção de paciente modelo',
      'Incluiu opção de atendimento clínico',
      'Incluiu opção de trabalho ou RH'
    ]
  },
  {
    id: 4,
    nome: 'Cliente quer enviar currículo',
    mensagemCliente: 'Vocês estão contratando? Tenho experiência como recepcionista',
    criteriosEsperados: [
      'NÃO disse que não está contratando',
      'Aceitou receber currículo',
      'Mencionou encaminhar para RH',
      'Foi receptiva'
    ]
  },
  {
    id: 5,
    nome: 'Cliente quer ser paciente modelo',
    mensagemCliente: 'Quero ser paciente modelo',
    criteriosEsperados: [
      'Explicou o que é paciente modelo',
      'Mencionou finais de semana',
      'Mencionou alunos supervisionados',
      'Solicitou dados (nome, CPF, telefone)',
      'NÃO informou valores sem avaliação'
    ]
  },
  {
    id: 6,
    nome: 'Cliente tentando marcar horário direto',
    mensagemCliente: 'Quero marcar para terça-feira às 14h',
    criteriosEsperados: [
      'NÃO confirmou horário direto',
      'Solicitou dados completos',
      'Mencionou verificar agenda',
      'Disse que profissional entrará em contato'
    ]
  },
  {
    id: 7,
    nome: 'Cliente confunde curso com tratamento',
    mensagemCliente: 'Vi que vocês têm ortodontia, quanto custa pra colocar aparelho?',
    criteriosEsperados: [
      'Identificou possível confusão',
      'Perguntou ou apresentou opções',
      'NÃO informou valor de tratamento',
      'Direcionou corretamente'
    ]
  },
  {
    id: 8,
    nome: 'Cliente insistente com valores',
    mensagemCliente: 'Meu amigo fez aí e pagou 200 reais, é esse valor mesmo?',
    criteriosEsperados: [
      'NÃO confirmou valor',
      'Manteve postura ética',
      'Explicou novamente motivo de não informar',
      'Continuou educada'
    ]
  },
  {
    id: 9,
    nome: 'Cliente interessado em curso',
    mensagemCliente: 'Sou dentista, quero saber sobre o curso de Endodontia',
    criteriosEsperados: [
      'Forneceu informações sobre o curso',
      'PODE informar valores de curso (diferente de tratamento)',
      'Ofereceu mais detalhes ou cronograma',
      'Foi profissional'
    ]
  },
  {
    id: 10,
    nome: 'Cliente com dúvida sobre horários',
    mensagemCliente: 'Vocês atendem no domingo?',
    criteriosEsperados: [
      'Explicou que domingo tem cursos (paciente modelo)',
      'Diferenciou dias úteis de finais de semana',
      'NÃO disse que não trabalha domingo',
      'Foi clara na explicação'
    ]
  }
];

async function testarComMistral(prompt: string, mensagem: string): Promise<string> {
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${MISTRAL_API_KEY}`
      },
      body: JSON.stringify({
        model: 'mistral-large-latest',
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: mensagem }
        ],
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`Mistral API error: ${response.statusText}`);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (error: any) {
    console.error('Erro ao chamar Mistral:', error.message);
    return 'Erro na resposta';
  }
}

async function avaliarResposta(
  resposta: string,
  criterios: string[]
): Promise<{ pontuacao: number; feedback: string[] }> {
  const feedback: string[] = [];
  let pontuacao = 0;

  // Avaliação manual baseada em palavras-chave
  criterios.forEach((criterio, index) => {
    const numero = index + 1;
    let atendeu = false;

    if (criterio.includes('NÃO informou valor') || criterio.includes('NÃO confirmou valor')) {
      // Verificar se NÃO tem valores específicos (R$, reais, etc)
      const temValor = /R\$\s*\d+|reais|R\s*\d+/i.test(resposta);
      atendeu = !temValor;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio} ${atendeu ? '' : '(Detectado valor na resposta)'}`);
    }
    else if (criterio.includes('Apresentou menu') || criterio.includes('opções numeradas')) {
      atendeu = /1️⃣|2️⃣|3️⃣|opção|digite.*número/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Explicou que valores só após avaliação')) {
      atendeu = /avaliação|avaliacao|após|depois.*consulta|presencial/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Mencionou questões éticas')) {
      atendeu = /ética|etica|segurança|seguranca|norma/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Ofereceu agendar')) {
      atendeu = /agendar|marcar|avaliacao|horário|horario/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('paciente modelo') && criterio.includes('particular')) {
      atendeu = /paciente modelo/i.test(resposta) && /particular/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('sábado') || criterio.includes('domingo') || criterio.includes('finais de semana')) {
      atendeu = /sábado|sabado|domingo|final.*semana|fim.*semana/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('segunda') || criterio.includes('dias úteis')) {
      atendeu = /segunda|terça|terca|quarta|quinta|sexta|dia.*útil|dia.*util/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('NÃO disse que não trabalha')) {
      const naoTrabalha = /não.*trabalha.*sábado|nao.*trabalha.*sabado|não.*atend.*sábado|nao.*atend.*sabado/i.test(resposta);
      atendeu = !naoTrabalha;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Solicitou dados')) {
      atendeu = /nome.*completo|CPF|telefone|seus dados|suas informações/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('NÃO confirmou horário')) {
      const confirmou = /confirmado|agendado para|marcado para.*terça|está marcado/i.test(resposta);
      atendeu = !confirmou;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('verificar agenda')) {
      atendeu = /verificar.*agenda|consultar.*agenda|checar.*disponibilidade/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('profissional entrará em contato')) {
      atendeu = /entrar.*contato|retornar|retorno|entrará.*contato/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('NÃO disse que não está contratando')) {
      const rejeitou = /não.*contratando|nao.*contratando|não.*precisa|nao.*precisa.*momento/i.test(resposta);
      atendeu = !rejeitou;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Aceitou receber currículo')) {
      const aceitou = /enviar.*currículo|enviar.*curriculo|encaminh|enviado.*RH|setor.*RH/i.test(resposta);
      atendeu = aceitou;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Mencionou encaminhar para RH')) {
      atendeu = /RH|recursos humanos|encaminh|enviado.*setor/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Foi receptiva')) {
      atendeu = /legal|feliz|ótimo|bom|interesse/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Explicou o que é paciente modelo')) {
      atendeu = /aluno|supervisionado|curso.*pós|pos.*graduação|graduacao/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('PODE informar valores de curso')) {
      // Neste caso, pode ter valores
      atendeu = true; // Por padrão considera OK
      feedback.push(`${numero}. ⚪ ${criterio} (Critério de permissão)`);
    }
    else if (criterio.includes('Foi profissional')) {
      atendeu = /informações|detalhes|curso|cronograma|content|pedagógica/i.test(resposta) || resposta.length > 100;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Foi clara')) {
      atendeu = /entendi|simples|domingo|sábado|finais.*semana|segunda.*sexta/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Manteve postura ética')) {
      atendeu = /ética|etica|não posso|nao posso|segurança|seguranca|garantir.*atendimento|questões.*éticas|questoes.*eticas/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Continuou educada')) {
      atendeu = /😊|entendo|posso.*ajudar|agendar|avaliation/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Identificou')) {
      atendeu = /confusão|dúvida|curso.*ortodontia|tratamento.*ortodontico|aparelho|opções|qual.*opção/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Perguntou ou apresentou opções')) {
      atendeu = /opção|opções|prefere|interessa|gostaria|qual/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else if (criterio.includes('Direcionou corretamente')) {
      atendeu = /agendar|avaliation|dados|nome.*CPF|verificar|particular|paciente modelo/i.test(resposta);
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }
    else {
      // Critério genérico
      const palavrasChave = criterio.toLowerCase().split(' ').filter(p => p.length > 4);
      const contemPalavras = palavrasChave.some(palavra => 
        resposta.toLowerCase().includes(palavra)
      );
      atendeu = contemPalavras;
      feedback.push(`${numero}. ${atendeu ? '✅' : '❌'} ${criterio}`);
    }

    if (atendeu) pontuacao++;
  });

  return { pontuacao, feedback };
}

async function executarTeste(teste: TestCase) {
  console.log('\n' + '='.repeat(80));
  console.log(`🧪 TESTE ${teste.id}: ${teste.nome}`);
  console.log('='.repeat(80));

  console.log(`\n👤 Cliente: ${teste.mensagemCliente}`);
  
  const resposta = await testarComMistral(PROMPT_RITA, teste.mensagemCliente);
  
  console.log(`\n🤖 Rita: ${resposta}`);
  console.log('\n' + '-'.repeat(80));
  console.log('📊 AVALIAÇÃO');
  console.log('-'.repeat(80));

  const { pontuacao, feedback } = await avaliarResposta(resposta, teste.criteriosEsperados);
  
  feedback.forEach(f => console.log(f));

  const percentual = (pontuacao / teste.criteriosEsperados.length) * 100;
  console.log(`\n✅ Pontuação: ${pontuacao}/${teste.criteriosEsperados.length}`);
  console.log(`🎯 Percentual: ${percentual.toFixed(1)}%`);

  if (percentual === 100) {
    console.log('✅ TESTE APROVADO! 🎉');
  } else if (percentual >= 80) {
    console.log('⚠️ TESTE QUASE APROVADO - Pequenos ajustes necessários');
  } else {
    console.log('❌ TESTE REPROVADO - Ajustes significativos necessários');
  }

  return { id: teste.id, nome: teste.nome, pontuacao, maxima: teste.criteriosEsperados.length, percentual };
}

async function main() {
  if (!MISTRAL_API_KEY) {
    console.error('❌ ERRO: MISTRAL_API_KEY não configurada!');
    console.error('Configure a variável de ambiente MISTRAL_API_KEY');
    process.exit(1);
  }

  console.log('\n🚀 INICIANDO TESTES DO PROMPT - RITA (IGNOA/FACOP)');
  console.log('📝 Total de testes: ' + TESTES.length);
  console.log('🎯 Objetivo: 100% de acerto em todos os testes\n');

  const resultados = [];

  for (const teste of TESTES) {
    const resultado = await executarTeste(teste);
    resultados.push(resultado);
    
    // Delay entre testes
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Relatório final
  console.log('\n' + '='.repeat(80));
  console.log('📊 RELATÓRIO FINAL');
  console.log('='.repeat(80));

  let totalPontos = 0;
  let totalMaximo = 0;

  resultados.forEach(r => {
    totalPontos += r.pontuacao;
    totalMaximo += r.maxima;
    const status = r.percentual === 100 ? '✅' : r.percentual >= 80 ? '⚠️' : '❌';
    console.log(`${status} Teste ${r.id}: ${r.nome.substring(0, 40).padEnd(40)} - ${r.pontuacao}/${r.maxima} (${r.percentual.toFixed(1)}%)`);
  });

  const percentualGeral = (totalPontos / totalMaximo) * 100;
  console.log('\n' + '='.repeat(80));
  console.log(`🎯 RESULTADO GERAL: ${totalPontos}/${totalMaximo} (${percentualGeral.toFixed(1)}%)`);
  console.log('='.repeat(80));

  if (percentualGeral === 100) {
    console.log('\n🎉 TODOS OS TESTES APROVADOS! PROMPT PRONTO PARA PRODUÇÃO! 🎉\n');
  } else if (percentualGeral >= 80) {
    console.log('\n⚠️ PROMPT BOM MAS PRECISA DE PEQUENOS AJUSTES\n');
  } else {
    console.log('\n❌ PROMPT PRECISA DE AJUSTES SIGNIFICATIVOS\n');
  }

  // Salvar relatório
  const relatorio = {
    data: new Date().toISOString(),
    resultados,
    pontuacaoTotal: totalPontos,
    pontuacaoMaxima: totalMaximo,
    percentualGeral
  };

  fs.writeFileSync(
    path.join(__dirname, 'relatorio-testes.json'),
    JSON.stringify(relatorio, null, 2)
  );

  console.log('📄 Relatório salvo em: relatorio-testes.json\n');
}

main().catch(console.error);
