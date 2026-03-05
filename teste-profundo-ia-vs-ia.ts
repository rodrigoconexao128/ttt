/**
 * 🧪 TESTE PROFUNDO IA VS IA - AGENTE DE VENDAS AGENTEZAP
 * 
 * Sistema completo de testes com:
 * - 100+ perfis de clientes diferentes
 * - Conversas longas (10+ turnos)
 * - Análise automática de conversão
 * - Loop de melhoria contínua
 * 
 * FOCO: Fazer cliente CRIAR CONTA GRÁTIS e TESTAR
 */

import { createClient } from '@supabase/supabase-js';
import { Mistral } from '@mistralai/mistralai';
import { config } from 'dotenv';
import * as fs from 'fs';

config();

// ════════════════════════════════════════════════════════════════════════════
// 🔧 CONFIGURAÇÃO
// ════════════════════════════════════════════════════════════════════════════

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || '';
const MISTRAL_KEY = process.env.MISTRAL_API_KEY || '';
const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const mistral = new Mistral({ apiKey: MISTRAL_KEY });

const CONFIG = {
  maxTurnos: 10,  // Máximo de turnos por conversa
  temperaturaAgente: 0.7,
  temperaturaCliente: 0.9,  // Cliente mais variado
  modelo: 'mistral-small-latest',
  timeoutMs: 30000,  // Timeout de 30s por chamada
  maxRetries: 2
};

// ════════════════════════════════════════════════════════════════════════════
// 👥 TIPOS DE CLIENTE
// ════════════════════════════════════════════════════════════════════════════

type TipoCliente = 
  | 'quente_campanha'      // Veio da campanha R$49, muito interessado
  | 'quente_organico'      // Interessado mas não viu preço
  | 'morno_curioso'        // Curioso, faz perguntas
  | 'morno_comparador'     // Compara com concorrentes
  | 'frio_desconfiado'     // Não acredita, cético
  | 'frio_ocupado'         // Sem tempo, responde pouco
  | 'simples'              // Respostas curtas, direto
  | 'detalhista'           // Quer saber TUDO
  | 'inteligente'          // Faz perguntas técnicas
  | 'culto'                // Linguagem formal
  | 'informal'             // Gírias, abreviações
  | 'chato'                // Reclama de tudo
  | 'indeciso'             // Não consegue decidir
  | 'apressado'            // Quer resolver rápido
  | 'economico'            // Foca em preço
  | 'premium'              // Quer o melhor, não liga pra preço
  | 'tecnico'              // Desenvolvedor, quer API
  | 'leigo'                // Não entende nada de tecnologia
  | 'idoso'                // Dificuldade com tecnologia
  | 'jovem';               // Nativo digital

interface PerfilCliente {
  id: string;
  nome: string;
  tipo: TipoCliente;
  segmento: string;
  personalidade: string;
  objetivos: string[];
  objecoes: string[];
  estiloFala: string;
  mensagemInicial: string;
  probabilidadeConversao: number; // 0-100
}

// ════════════════════════════════════════════════════════════════════════════
// 🎭 GERADOR DE PERFIS DE CLIENTES (100+)
// ════════════════════════════════════════════════════════════════════════════

const SEGMENTOS = [
  'loja de roupas', 'mecânica', 'clínica odontológica', 'escola', 'academia',
  'restaurante', 'salão de beleza', 'imobiliária', 'advocacia', 'contabilidade',
  'pet shop', 'farmácia', 'ótica', 'loja de celulares', 'oficina de motos',
  'estúdio de tatuagem', 'barbearia', 'floricultura', 'padaria', 'açougue',
  'material de construção', 'papelaria', 'sex shop', 'loja de games', 'autoescola',
  'clínica veterinária', 'psicóloga', 'nutricionista', 'personal trainer', 'fotógrafo',
  'agência de marketing', 'consultoria', 'corretora de seguros', 'despachante', 'gráfica',
  'loja de móveis', 'vidraçaria', 'serralheria', 'marmoraria', 'elétrica',
  'encanador', 'pintor', 'diarista', 'buffet', 'casa de festas'
];

const NOMES = [
  'João', 'Maria', 'José', 'Ana', 'Pedro', 'Carla', 'Lucas', 'Fernanda',
  'Marcos', 'Patricia', 'Rafael', 'Juliana', 'Bruno', 'Amanda', 'Diego',
  'Camila', 'Thiago', 'Larissa', 'Felipe', 'Beatriz', 'Gustavo', 'Leticia',
  'Roberto', 'Sandra', 'Carlos', 'Adriana', 'Ricardo', 'Renata', 'Eduardo',
  'Daniela', 'Marcelo', 'Vanessa', 'Fernando', 'Cristina', 'Alexandre', 'Monica',
  'Rodrigo', 'Priscila', 'Leonardo', 'Tatiana', 'André', 'Fabiana', 'Leandro',
  'Simone', 'Henrique', 'Natalia', 'Guilherme', 'Carolina', 'Vinicius', 'Mariana'
];

function gerarPerfilCliente(index: number): PerfilCliente {
  const tipos: TipoCliente[] = [
    'quente_campanha', 'quente_campanha', 'quente_campanha', // Mais leads quentes
    'quente_organico', 'quente_organico',
    'morno_curioso', 'morno_curioso', 'morno_comparador',
    'frio_desconfiado', 'frio_ocupado',
    'simples', 'simples',
    'detalhista', 'inteligente', 'culto', 'informal',
    'chato', 'indeciso', 'apressado',
    'economico', 'premium', 'tecnico', 'leigo', 'idoso', 'jovem'
  ];
  
  const tipo = tipos[index % tipos.length];
  const nome = NOMES[index % NOMES.length];
  const segmento = SEGMENTOS[index % SEGMENTOS.length];
  
  const perfis: Record<TipoCliente, Partial<PerfilCliente>> = {
    quente_campanha: {
      personalidade: 'Animado, viu o anúncio de R$49 e quer aproveitar',
      objetivos: ['entender como funciona', 'criar conta', 'assinar barato'],
      objecoes: [],
      estiloFala: 'Direto, positivo, usa emojis às vezes',
      mensagemInicial: `Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.`,
      probabilidadeConversao: 85
    },
    quente_organico: {
      personalidade: 'Interessado, pesquisou sobre automação',
      objetivos: ['entender benefícios', 'ver demo', 'testar'],
      objecoes: ['qual o preço?'],
      estiloFala: 'Educado, faz perguntas',
      mensagemInicial: `Oi! Vi que vocês fazem automação de WhatsApp com IA. Quero saber mais!`,
      probabilidadeConversao: 70
    },
    morno_curioso: {
      personalidade: 'Curioso mas cauteloso',
      objetivos: ['entender o que é', 'ver se serve pra ele'],
      objecoes: ['preciso pensar', 'vou ver depois'],
      estiloFala: 'Pergunta bastante, neutro',
      mensagemInicial: `Boa tarde, o que exatamente vocês fazem?`,
      probabilidadeConversao: 50
    },
    morno_comparador: {
      personalidade: 'Analítico, compara tudo',
      objetivos: ['comparar com concorrentes', 'achar o melhor custo-benefício'],
      objecoes: ['já uso outra', 'qual o diferencial?', 'o outro é mais barato'],
      estiloFala: 'Técnico, menciona concorrentes',
      mensagemInicial: `Olá, já uso o ManyChat. Por que eu deveria trocar pra vocês?`,
      probabilidadeConversao: 45
    },
    frio_desconfiado: {
      personalidade: 'Cético, não acredita em promessas',
      objetivos: ['provar que funciona'],
      objecoes: ['isso é golpe?', 'funciona mesmo?', 'tem reclamação?'],
      estiloFala: 'Desconfiado, pede provas',
      mensagemInicial: `Hm, vi o anúncio. Isso funciona mesmo ou é mais um golpe?`,
      probabilidadeConversao: 30
    },
    frio_ocupado: {
      personalidade: 'Muito ocupado, sem tempo',
      objetivos: ['resolver rápido'],
      objecoes: ['não tenho tempo', 'depois vejo', 'tá corrido'],
      estiloFala: 'Respostas curtas, às vezes demora responder',
      mensagemInicial: `Oi`,
      probabilidadeConversao: 25
    },
    simples: {
      personalidade: 'Pessoa simples, direta',
      objetivos: ['entender o básico'],
      objecoes: [],
      estiloFala: 'Frases curtas, objetivo',
      mensagemInicial: `Oi, quero saber do robô de WhatsApp`,
      probabilidadeConversao: 60
    },
    detalhista: {
      personalidade: 'Quer saber cada detalhe',
      objetivos: ['entender TUDO antes de decidir'],
      objecoes: ['preciso entender melhor', 'tem mais informação?'],
      estiloFala: 'Faz muitas perguntas, pede detalhes',
      mensagemInicial: `Olá! Gostaria de entender em detalhes como funciona o sistema de vocês. Quais são todas as funcionalidades disponíveis?`,
      probabilidadeConversao: 55
    },
    inteligente: {
      personalidade: 'Esperto, pega rápido',
      objetivos: ['entender a tecnologia', 'ver se é robusto'],
      objecoes: ['qual modelo de IA usam?', 'tem API?'],
      estiloFala: 'Técnico mas acessível',
      mensagemInicial: `Oi! Vocês usam qual LLM? GPT ou Mistral? Tem webhook pra integrar?`,
      probabilidadeConversao: 65
    },
    culto: {
      personalidade: 'Formal, educado',
      objetivos: ['avaliação profissional'],
      objecoes: ['preciso avaliar', 'vou consultar minha equipe'],
      estiloFala: 'Formal, sem gírias, correto',
      mensagemInicial: `Boa tarde. Gostaria de obter informações sobre os serviços de automação que vocês oferecem para empresas.`,
      probabilidadeConversao: 50
    },
    informal: {
      personalidade: 'Descontraído, usa gírias',
      objetivos: ['ver se é daora'],
      objecoes: ['vou pensar ae'],
      estiloFala: 'Gírias, abreviações, emojis',
      mensagemInicial: `eae mano blz? vi la o negocio de vcs do robozinho kkk`,
      probabilidadeConversao: 55
    },
    chato: {
      personalidade: 'Reclama de tudo, difícil agradar',
      objetivos: ['achar defeito'],
      objecoes: ['tá caro', 'não vai funcionar', 'outros são melhores'],
      estiloFala: 'Negativo, crítico',
      mensagemInicial: `Oi. Já tentei outras ferramentas e nenhuma funciona direito. Essa deve ser igual.`,
      probabilidadeConversao: 20
    },
    indeciso: {
      personalidade: 'Não consegue decidir nada',
      objetivos: ['alguém decidir por ele'],
      objecoes: ['não sei', 'talvez', 'preciso pensar muito'],
      estiloFala: 'Hesitante, cheio de "mas"',
      mensagemInicial: `Oi... então, não sei se preciso disso, mas vi o anúncio e... não sei, talvez seja bom?`,
      probabilidadeConversao: 35
    },
    apressado: {
      personalidade: 'Quer tudo pra ontem',
      objetivos: ['resolver agora'],
      objecoes: ['demora muito', 'não tenho tempo'],
      estiloFala: 'Impaciente, quer respostas rápidas',
      mensagemInicial: `Oi! Quero assinar agora. Qual o link? Preciso resolver isso hoje!`,
      probabilidadeConversao: 80
    },
    economico: {
      personalidade: 'Foco total em preço',
      objetivos: ['pagar o mínimo possível'],
      objecoes: ['tá caro', 'tem desconto?', 'o outro é mais barato'],
      estiloFala: 'Sempre menciona preço',
      mensagemInicial: `Oi, qual o preço mais barato que vocês têm? Tem promoção?`,
      probabilidadeConversao: 60
    },
    premium: {
      personalidade: 'Quer o melhor, dinheiro não é problema',
      objetivos: ['ter a melhor solução'],
      objecoes: ['é realmente o melhor?'],
      estiloFala: 'Confiante, não pergunta preço',
      mensagemInicial: `Olá! Preciso da melhor solução de IA para minha empresa. O que vocês oferecem de mais completo?`,
      probabilidadeConversao: 75
    },
    tecnico: {
      personalidade: 'Desenvolvedor, quer detalhes técnicos',
      objetivos: ['entender arquitetura', 'ver se dá pra customizar'],
      objecoes: ['tem API REST?', 'qual o uptime?', 'tem documentação?'],
      estiloFala: 'Técnico, usa jargões',
      mensagemInicial: `E aí! Sou dev. Vocês têm API? Webhooks? Qual o rate limit?`,
      probabilidadeConversao: 50
    },
    leigo: {
      personalidade: 'Não entende nada de tecnologia',
      objetivos: ['entender o que é', 'alguém fazer por ele'],
      objecoes: ['é muito difícil', 'não vou conseguir', 'não entendo nada'],
      estiloFala: 'Simples, pede explicações',
      mensagemInicial: `Oi moço, vi o negócio de vocês mas não entendi nada. O que é isso?`,
      probabilidadeConversao: 45
    },
    idoso: {
      personalidade: 'Dificuldade com tecnologia, precisa de paciência',
      objetivos: ['alguém ajudar', 'ser guiado passo a passo'],
      objecoes: ['não sei mexer', 'é muito complicado', 'meu filho que entende'],
      estiloFala: 'Formal, educado, pede ajuda',
      mensagemInicial: `Boa tarde! Meu sobrinho me falou desse negócio de robô no WhatsApp. Eu tenho uma lojinha e queria saber se serve pra mim.`,
      probabilidadeConversao: 40
    },
    jovem: {
      personalidade: 'Nativo digital, pega rápido',
      objetivos: ['ver se é bom', 'testar logo'],
      objecoes: ['parece legal'],
      estiloFala: 'Moderno, usa emojis, gírias atuais',
      mensagemInicial: `opa! achei vocês no insta. parece mto útil pra minha loja online 🔥`,
      probabilidadeConversao: 70
    }
  };
  
  const perfilBase = perfis[tipo];
  
  return {
    id: `cliente_${index.toString().padStart(3, '0')}`,
    nome,
    tipo,
    segmento,
    personalidade: perfilBase.personalidade || '',
    objetivos: perfilBase.objetivos || [],
    objecoes: perfilBase.objecoes || [],
    estiloFala: perfilBase.estiloFala || '',
    mensagemInicial: perfilBase.mensagemInicial || 'Oi',
    probabilidadeConversao: perfilBase.probabilidadeConversao || 50
  };
}

// Gerar 100+ perfis
const PERFIS_CLIENTES: PerfilCliente[] = Array.from({ length: 120 }, (_, i) => gerarPerfilCliente(i));

// ════════════════════════════════════════════════════════════════════════════
// 🤖 PROMPT DO CLIENTE SIMULADO
// ════════════════════════════════════════════════════════════════════════════

function gerarPromptCliente(perfil: PerfilCliente): string {
  return `Você é um CLIENTE simulado em uma conversa de WhatsApp com um vendedor.

═══════════════════════════════════════════════════════════════════════════════
SEU PERFIL
═══════════════════════════════════════════════════════════════════════════════
Nome: ${perfil.nome}
Tipo: ${perfil.tipo}
Seu negócio: ${perfil.segmento}
Personalidade: ${perfil.personalidade}
Seus objetivos: ${perfil.objetivos.join(', ')}
Objeções que você costuma fazer: ${perfil.objecoes.join(', ') || 'nenhuma em especial'}
Estilo de fala: ${perfil.estiloFala}

═══════════════════════════════════════════════════════════════════════════════
REGRAS IMPORTANTES
═══════════════════════════════════════════════════════════════════════════════

1. Você é um HUMANO REAL, não um robô
2. Responda como responderia no WhatsApp (mensagens curtas/médias)
3. Use seu estilo de fala definido no perfil
4. Faça as objeções do seu perfil naturalmente durante a conversa
5. Se o vendedor for convincente, vá cedendo aos poucos
6. Se mencionar R$49 ou preço baixo, mostre mais interesse
7. Se oferecer teste grátis, considere aceitar
8. Às vezes mande só "ok", "entendi", "hm" - seja humano!
9. Às vezes mande áudio: [ÁUDIO: conteúdo do áudio aqui]

═══════════════════════════════════════════════════════════════════════════════
COMPORTAMENTO POR FASE DA CONVERSA
═══════════════════════════════════════════════════════════════════════════════

INÍCIO (turnos 1-3):
- Faça suas perguntas iniciais
- Mostre seu nível de interesse inicial

MEIO (turnos 4-7):
- Faça suas objeções
- Peça mais informações se precisar
- Reaja às respostas do vendedor

FIM (turnos 8+):
- Se estiver convencido: "vou criar a conta", "vou testar", "me manda o link"
- Se não: "vou pensar", "depois vejo", "não é pra mim"

═══════════════════════════════════════════════════════════════════════════════
SINAIS DE CONVERSÃO (use quando estiver convencido)
═══════════════════════════════════════════════════════════════════════════════

- "vou criar a conta"
- "vou testar"
- "me manda o link"
- "vou acessar agora"
- "vou assinar"
- "fechado!"
- "bora!"
- "qual o link mesmo?"

IMPORTANTE: Seja REALISTA. Nem sempre você será convencido.
Baseie sua decisão na qualidade das respostas do vendedor.`;
}

// ════════════════════════════════════════════════════════════════════════════
// 🎯 EXECUTOR DE CONVERSA
// ════════════════════════════════════════════════════════════════════════════

interface Mensagem {
  role: 'user' | 'assistant';
  content: string;
}

interface ResultadoConversa {
  perfilId: string;
  perfilNome: string;
  tipo: TipoCliente;
  segmento: string;
  turnos: number;
  converteu: boolean;
  tipoConversao: 'conta_gratis' | 'assinatura' | 'interesse' | 'nenhuma';
  motivoConversao: string;
  conversa: Mensagem[];
  pontuacao: number;  // 0-100
  analise: string;
}

async function buscarPromptAgente(): Promise<string> {
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

async function chamarAgente(
  promptAgente: string, 
  conversa: Mensagem[]
): Promise<string> {
  // Agente: conversa está na perspectiva correta (user = cliente, assistant = agente)
  for (let tentativa = 0; tentativa < CONFIG.maxRetries; tentativa++) {
    try {
      const response = await mistral.chat.complete({
        model: CONFIG.modelo,
        messages: [
          { role: 'system', content: promptAgente },
          ...conversa
        ],
        temperature: CONFIG.temperaturaAgente,
        maxTokens: 400
      });
      
      return response.choices?.[0]?.message?.content?.toString() || '';
    } catch (error: any) {
      if (tentativa === CONFIG.maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return '';
}

async function chamarCliente(
  promptCliente: string, 
  conversa: Mensagem[]
): Promise<string> {
  // Cliente: inverter perspectiva (o que era assistant vira user, e vice-versa)
  const conversaInvertida = conversa.map(m => ({
    role: (m.role === 'user' ? 'assistant' : 'user') as 'user' | 'assistant',
    content: m.content
  }));
  
  for (let tentativa = 0; tentativa < CONFIG.maxRetries; tentativa++) {
    try {
      const response = await mistral.chat.complete({
        model: CONFIG.modelo,
        messages: [
          { role: 'system', content: promptCliente },
          ...conversaInvertida
        ],
        temperature: CONFIG.temperaturaCliente,
        maxTokens: 200
      });
      
      return response.choices?.[0]?.message?.content?.toString() || '';
    } catch (error: any) {
      if (tentativa === CONFIG.maxRetries - 1) throw error;
      await new Promise(r => setTimeout(r, 2000));
    }
  }
  return '';
}

async function executarConversa(
  perfil: PerfilCliente, 
  promptAgente: string
): Promise<ResultadoConversa> {
  const conversa: Mensagem[] = [];
  const promptCliente = gerarPromptCliente(perfil);
  
  // Mensagem inicial do cliente
  conversa.push({ role: 'user', content: perfil.mensagemInicial });
  
  let converteu = false;
  let tipoConversao: 'conta_gratis' | 'assinatura' | 'interesse' | 'nenhuma' = 'nenhuma';
  let motivoConversao = '';
  
  // Executar turnos da conversa
  for (let turno = 0; turno < CONFIG.maxTurnos; turno++) {
    // Resposta do agente
    const respostaAgente = await chamarAgente(promptAgente, conversa);
    conversa.push({ role: 'assistant', content: respostaAgente });
    
    // Verificar se é o último turno
    if (turno >= CONFIG.maxTurnos - 1) break;
    
    // Resposta do cliente
    const respostaCliente = await chamarCliente(promptCliente, conversa);
    conversa.push({ role: 'user', content: respostaCliente });
    
    // Verificar conversão
    const textoCliente = respostaCliente.toLowerCase();
    
    if (textoCliente.includes('vou criar') || textoCliente.includes('vou testar') || 
        textoCliente.includes('me manda o link') || textoCliente.includes('vou acessar') ||
        textoCliente.includes('qual o link') || textoCliente.includes('bora') ||
        textoCliente.includes('fechado')) {
      converteu = true;
      tipoConversao = 'conta_gratis';
      motivoConversao = 'Cliente aceitou criar conta/testar';
      break;
    }
    
    if (textoCliente.includes('vou assinar') || textoCliente.includes('quero assinar') ||
        textoCliente.includes('vou pagar') || textoCliente.includes('aceito')) {
      converteu = true;
      tipoConversao = 'assinatura';
      motivoConversao = 'Cliente aceitou assinar';
      break;
    }
    
    // Pequeno delay para não sobrecarregar API
    await new Promise(r => setTimeout(r, 500));
  }
  
  // Calcular pontuação
  let pontuacao = 0;
  if (converteu) {
    pontuacao = tipoConversao === 'assinatura' ? 100 : 80;
  } else {
    // Verificar se houve interesse
    const ultimasMensagens = conversa.slice(-4).map(m => m.content.toLowerCase()).join(' ');
    if (ultimasMensagens.includes('interessante') || ultimasMensagens.includes('legal') ||
        ultimasMensagens.includes('vou pensar') || ultimasMensagens.includes('talvez')) {
      pontuacao = 40;
      tipoConversao = 'interesse';
      motivoConversao = 'Cliente mostrou interesse mas não converteu';
    }
  }
  
  return {
    perfilId: perfil.id,
    perfilNome: perfil.nome,
    tipo: perfil.tipo,
    segmento: perfil.segmento,
    turnos: Math.floor(conversa.length / 2),
    converteu,
    tipoConversao,
    motivoConversao,
    conversa,
    pontuacao,
    analise: ''
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 📊 ANÁLISE DE RESULTADOS
// ════════════════════════════════════════════════════════════════════════════

interface RelatorioTeste {
  dataHora: string;
  totalTestes: number;
  conversoes: number;
  taxaConversao: number;
  porTipo: Record<string, { total: number; conversoes: number; taxa: number }>;
  conversasProblematicas: ResultadoConversa[];
  recomendacoes: string[];
}

function analisarResultados(resultados: ResultadoConversa[]): RelatorioTeste {
  const total = resultados.length;
  const conversoes = resultados.filter(r => r.converteu).length;
  
  // Agrupar por tipo
  const porTipo: Record<string, { total: number; conversoes: number; taxa: number }> = {};
  
  for (const r of resultados) {
    if (!porTipo[r.tipo]) {
      porTipo[r.tipo] = { total: 0, conversoes: 0, taxa: 0 };
    }
    porTipo[r.tipo].total++;
    if (r.converteu) porTipo[r.tipo].conversoes++;
  }
  
  // Calcular taxas
  for (const tipo in porTipo) {
    porTipo[tipo].taxa = Math.round((porTipo[tipo].conversoes / porTipo[tipo].total) * 100);
  }
  
  // Identificar conversas problemáticas
  const conversasProblematicas = resultados
    .filter(r => !r.converteu && r.pontuacao < 40)
    .slice(0, 10);
  
  // Gerar recomendações
  const recomendacoes: string[] = [];
  
  for (const [tipo, stats] of Object.entries(porTipo)) {
    if (stats.taxa < 50) {
      recomendacoes.push(`⚠️ Taxa baixa em "${tipo}" (${stats.taxa}%) - revisar abordagem para este perfil`);
    }
  }
  
  if (conversoes / total < 0.7) {
    recomendacoes.push('❌ Taxa geral abaixo de 70% - prompt precisa de ajustes significativos');
  }
  
  return {
    dataHora: new Date().toISOString(),
    totalTestes: total,
    conversoes,
    taxaConversao: Math.round((conversoes / total) * 100),
    porTipo,
    conversasProblematicas,
    recomendacoes
  };
}

// ════════════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO PRINCIPAL
// ════════════════════════════════════════════════════════════════════════════

async function executarTodosTestes(quantidade: number = 20): Promise<RelatorioTeste> {
  console.log('\n' + '═'.repeat(70));
  console.log('🧪 TESTE PROFUNDO IA VS IA - AGENTEZAP');
  console.log('═'.repeat(70));
  
  // Buscar prompt
  console.log('\n📋 Carregando prompt do agente...');
  const promptAgente = await buscarPromptAgente();
  console.log(`   ✅ Prompt carregado (${promptAgente.length} caracteres)`);
  
  // Selecionar perfis para teste
  const perfisParaTestar = PERFIS_CLIENTES.slice(0, quantidade);
  console.log(`\n🎭 Testando ${perfisParaTestar.length} perfis de clientes...\n`);
  
  const resultados: ResultadoConversa[] = [];
  
  for (let i = 0; i < perfisParaTestar.length; i++) {
    const perfil = perfisParaTestar[i];
    const progresso = `[${(i + 1).toString().padStart(3)}/${perfisParaTestar.length}]`;
    
    process.stdout.write(`   ${progresso} ${perfil.nome} (${perfil.tipo})... `);
    
    try {
      const resultado = await executarConversa(perfil, promptAgente);
      resultados.push(resultado);
      
      const status = resultado.converteu ? '✅' : (resultado.pontuacao >= 40 ? '🔸' : '❌');
      console.log(`${status} ${resultado.turnos} turnos - ${resultado.tipoConversao}`);
    } catch (error: any) {
      console.log(`❌ ERRO: ${error.message}`);
      resultados.push({
        perfilId: perfil.id,
        perfilNome: perfil.nome,
        tipo: perfil.tipo,
        segmento: perfil.segmento,
        turnos: 0,
        converteu: false,
        tipoConversao: 'nenhuma',
        motivoConversao: `Erro: ${error.message}`,
        conversa: [],
        pontuacao: 0,
        analise: ''
      });
    }
    
    // Delay entre testes
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Analisar resultados
  const relatorio = analisarResultados(resultados);
  
  // Exibir relatório
  console.log('\n' + '═'.repeat(70));
  console.log('📊 RELATÓRIO DE RESULTADOS');
  console.log('═'.repeat(70));
  
  console.log(`\n📈 RESUMO GERAL:`);
  console.log(`   Total de testes: ${relatorio.totalTestes}`);
  console.log(`   Conversões: ${relatorio.conversoes}`);
  console.log(`   Taxa de conversão: ${relatorio.taxaConversao}%`);
  
  console.log(`\n📊 POR TIPO DE CLIENTE:`);
  for (const [tipo, stats] of Object.entries(relatorio.porTipo)) {
    const bar = '█'.repeat(Math.floor(stats.taxa / 10)) + '░'.repeat(10 - Math.floor(stats.taxa / 10));
    console.log(`   ${tipo.padEnd(20)} ${bar} ${stats.taxa}% (${stats.conversoes}/${stats.total})`);
  }
  
  if (relatorio.recomendacoes.length > 0) {
    console.log(`\n💡 RECOMENDAÇÕES:`);
    for (const rec of relatorio.recomendacoes) {
      console.log(`   ${rec}`);
    }
  }
  
  if (relatorio.conversasProblematicas.length > 0) {
    console.log(`\n🔴 CONVERSAS PROBLEMÁTICAS (para análise):`);
    for (const conv of relatorio.conversasProblematicas.slice(0, 5)) {
      console.log(`   - ${conv.perfilNome} (${conv.tipo}): ${conv.motivoConversao || 'não converteu'}`);
    }
  }
  
  // Salvar resultados em arquivo
  const nomeArquivo = `teste-resultados-${Date.now()}.json`;
  fs.writeFileSync(nomeArquivo, JSON.stringify({ relatorio, resultados }, null, 2));
  console.log(`\n💾 Resultados salvos em: ${nomeArquivo}`);
  
  console.log('\n' + '═'.repeat(70) + '\n');
  
  return relatorio;
}

// ════════════════════════════════════════════════════════════════════════════
// 🔄 LOOP DE MELHORIA CONTÍNUA
// ════════════════════════════════════════════════════════════════════════════

async function loopMelhoria(iteracoes: number = 3, testesPoIteracao: number = 25): Promise<void> {
  console.log('\n🔄 INICIANDO LOOP DE MELHORIA CONTÍNUA');
  console.log(`   Iterações: ${iteracoes}`);
  console.log(`   Testes por iteração: ${testesPoIteracao}`);
  
  for (let i = 1; i <= iteracoes; i++) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`🔄 ITERAÇÃO ${i}/${iteracoes}`);
    console.log('═'.repeat(70));
    
    const relatorio = await executarTodosTestes(testesPoIteracao);
    
    if (relatorio.taxaConversao >= 95) {
      console.log('\n🎉 META ATINGIDA! Taxa de conversão >= 95%');
      break;
    }
    
    if (i < iteracoes) {
      console.log('\n⏳ Aguardando 5 segundos antes da próxima iteração...');
      await new Promise(r => setTimeout(r, 5000));
    }
  }
  
  console.log('\n✅ LOOP DE MELHORIA CONCLUÍDO');
}

// Exportar funções
export { 
  executarTodosTestes, 
  loopMelhoria, 
  PERFIS_CLIENTES,
  analisarResultados 
};

// Executar se chamado diretamente
const args = process.argv.slice(2);
const quantidade = parseInt(args[0]) || 30;

executarTodosTestes(quantidade).catch(console.error);
