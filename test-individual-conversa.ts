/**
 * 🧪 TESTE INDIVIDUAL DE CONVERSAÇÃO IA VS IA
 * 
 * Este script executa UMA conversa por vez com análise completa.
 * Permite ajustar o prompt entre testes até alcançar 100% de conversão.
 * 
 * Uso: npx tsx test-individual-conversa.ts [numero_do_perfil]
 * 
 * Exemplo: npx tsx test-individual-conversa.ts 1
 */

import 'dotenv/config';
import { db } from './server/db';
import { aiAgentConfig, systemConfig, users } from './shared/schema';
import { eq } from 'drizzle-orm';
import { Mistral } from "@mistralai/mistralai";

// ═══════════════════════════════════════════════════════════════════════
// 📋 CONFIGURAÇÃO
// ═══════════════════════════════════════════════════════════════════════

const USER_ID = 'cb9213c3-fde3-479e-a4aa-344171c59735'; // rodrigo4@gmail.com
const MAX_TURNOS = 12;
const VERBOSE = true;

// Cores para output
const CORES = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgGreen: '\x1b[42m',
  bgRed: '\x1b[41m',
  bgYellow: '\x1b[43m',
};

// ═══════════════════════════════════════════════════════════════════════
// 👥 PERFIS DE CLIENTES PARA TESTE
// ═══════════════════════════════════════════════════════════════════════

interface PerfilCliente {
  id: number;
  tipo: string;
  temperatura: 'frio' | 'morno' | 'quente';
  descricao: string;
  segmento: string;
  personalidade: string;
  mensagemInicial: string;
  comportamento: string;
  metaConversao: 'criar_conta_gratuita' | 'assinar_plano' | 'implementacao';
}

const PERFIS_CLIENTES: PerfilCliente[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // 🔥 LEADS QUENTES - Vieram da campanha R$49
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 1,
    tipo: "Lead Quente - Campanha R$49",
    temperatura: 'quente',
    descricao: "Viu o anúncio de R$49/mês e mandou mensagem interessado",
    segmento: "loja de roupas",
    personalidade: "Direto, quer entender rápido e decidir",
    mensagemInicial: "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.",
    comportamento: `
    - Está interessado no preço de R$49
    - Quer entender se é mensal
    - Vai perguntar como funciona
    - Se convencer, quer criar conta ou assinar
    - Usa linguagem informal de WhatsApp
    `,
    metaConversao: 'assinar_plano'
  },
  {
    id: 2,
    tipo: "Lead Quente - Decidido",
    temperatura: 'quente',
    descricao: "Já pesquisou, quer assinar agora",
    segmento: "pizzaria",
    personalidade: "Objetivo, não quer enrolação",
    mensagemInicial: "Quero assinar o plano de R$49, como faço?",
    comportamento: `
    - Já decidiu que quer
    - Só quer saber como pagar
    - Quer link direto
    - Não precisa convencer
    - Responde curto: "ok", "entendi", "vou fazer"
    `,
    metaConversao: 'assinar_plano'
  },
  {
    id: 3,
    tipo: "Lead Quente - Teste Primeiro",
    temperatura: 'quente',
    descricao: "Interessado mas quer testar antes de pagar",
    segmento: "clínica de estética",
    personalidade: "Cauteloso mas interessado",
    mensagemInicial: "Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.",
    comportamento: `
    - Gostou do preço
    - Mas quer ver funcionando primeiro
    - Vai perguntar se tem teste grátis
    - Se tiver teste, vai querer criar conta
    - Faz perguntas: "posso testar?", "tem demonstração?"
    `,
    metaConversao: 'criar_conta_gratuita'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🌡️ LEADS MORNOS - Interessados mas com dúvidas
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 4,
    tipo: "Lead Morno - Curioso",
    temperatura: 'morno',
    descricao: "Viu algo e quer entender melhor",
    segmento: "academia",
    personalidade: "Curioso, faz várias perguntas",
    mensagemInicial: "Oi, vi a propaganda de vocês, como funciona?",
    comportamento: `
    - Não sabe exatamente o que é
    - Vai fazer perguntas básicas
    - Quer entender antes de decidir
    - Perguntas como: "o que faz?", "como usa?", "funciona sozinho?"
    - Se gostar, pergunta sobre teste grátis
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 5,
    tipo: "Lead Morno - Comparando",
    temperatura: 'morno',
    descricao: "Está comparando com outras ferramentas",
    segmento: "imobiliária",
    personalidade: "Analítico, compara muito",
    mensagemInicial: "Oi, tudo bem? Estou pesquisando ferramentas de atendimento",
    comportamento: `
    - Já conhece concorrentes
    - Vai comparar preços e funcionalidades
    - Perguntas: "o que tem de diferente?", "por que escolher vocês?"
    - Quer saber diferenciais
    - Se convencer dos diferenciais, quer testar
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 6,
    tipo: "Lead Morno - Detalhista",
    temperatura: 'morno',
    descricao: "Quer entender cada funcionalidade",
    segmento: "escritório de advocacia",
    personalidade: "Meticuloso, pergunta muito",
    mensagemInicial: "Boa tarde, gostaria de informações detalhadas sobre o sistema",
    comportamento: `
    - Quer saber TUDO antes de decidir
    - Perguntas: "responde áudio?", "envia imagem?", "integra com agenda?"
    - Não aceita respostas vagas
    - Quer ver cada funcionalidade
    - Se satisfeito com respostas, quer criar conta para testar
    `,
    metaConversao: 'criar_conta_gratuita'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ❄️ LEADS FRIOS - Objeções fortes
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 7,
    tipo: "Lead Frio - Desconfiado",
    temperatura: 'frio',
    descricao: "Não confia em nada, acha que é golpe",
    segmento: "loja de eletrônicos",
    personalidade: "Cético, desconfiado",
    mensagemInicial: "Isso é golpe?",
    comportamento: `
    - Desconfia de TUDO
    - Perguntas: "é golpe?", "como sei que funciona?", "tem CNPJ?"
    - Quer provas de que é real
    - Se conseguir provas, ainda quer testar grátis antes
    - Não vai pagar sem ter certeza absoluta
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 8,
    tipo: "Lead Frio - Preço Alto",
    temperatura: 'frio',
    descricao: "Acha tudo caro",
    segmento: "salão de beleza",
    personalidade: "Econômico, reclama de preço",
    mensagemInicial: "Quanto custa isso aí?",
    comportamento: `
    - Primeira reação: "tá caro!"
    - Compara com outras coisas: "por isso pago a funcionária"
    - Quer desconto
    - Perguntas: "tem desconto?", "plano mais barato?", "teste grátis?"
    - Só aceita se ver valor ou tiver teste grátis
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 9,
    tipo: "Lead Frio - Sem Tempo",
    temperatura: 'frio',
    descricao: "Muito ocupado, não quer conversa longa",
    segmento: "restaurante",
    personalidade: "Impaciente, apressado",
    mensagemInicial: "Oi",
    comportamento: `
    - Responde monossilábico: "ok", "hmm", "entendi"
    - Diz que está ocupado
    - Não quer explicação longa
    - Quer link direto para ver sozinho
    - Se forçar conversa, desiste
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 10,
    tipo: "Lead Frio - Já Tentou Outras",
    temperatura: 'frio',
    descricao: "Frustrado com outras ferramentas",
    segmento: "pet shop",
    personalidade: "Frustrado, cético",
    mensagemInicial: "Já testei várias IAs e nenhuma funcionou direito",
    comportamento: `
    - Conta histórias ruins de outras ferramentas
    - "A outra não respondia direito"
    - "Perdi clientes por causa da IA"
    - Quer saber: "o que vocês tem de diferente?"
    - Se convencer dos diferenciais, aceita testar
    `,
    metaConversao: 'criar_conta_gratuita'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🎯 CLIENTES ESPECÍFICOS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 11,
    tipo: "Cliente Simples",
    temperatura: 'morno',
    descricao: "Pessoa comum, não entende tecnologia",
    segmento: "padaria",
    personalidade: "Simples, direto",
    mensagemInicial: "Oi, bom dia",
    comportamento: `
    - Não sabe termos técnicos
    - Quer saber o básico: "o que isso faz?"
    - Precisa de explicação simples
    - Se entender, pergunta "como testa?"
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 12,
    tipo: "Cliente Inteligente",
    temperatura: 'morno',
    descricao: "Entende de tecnologia, faz perguntas técnicas",
    segmento: "agência de marketing",
    personalidade: "Técnico, objetivo",
    mensagemInicial: "Olá! Vocês usam qual modelo de LLM? GPT ou outro?",
    comportamento: `
    - Faz perguntas técnicas sobre a IA
    - Quer saber sobre API, integração, modelo usado
    - Avalia se a tecnologia é boa
    - Se aprovar a tecnologia, quer testar
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 13,
    tipo: "Cliente Culto",
    temperatura: 'morno',
    descricao: "Fala formal, espera atendimento de qualidade",
    segmento: "consultório médico",
    personalidade: "Formal, educado",
    mensagemInicial: "Boa tarde. Gostaria de obter informações sobre o serviço de automação de atendimento.",
    comportamento: `
    - Usa linguagem formal
    - Espera respostas educadas e completas
    - Não gosta de gírias ou informalidade excessiva
    - Quer profissionalismo
    - Se satisfeito, solicita teste
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 14,
    tipo: "Cliente Chato",
    temperatura: 'frio',
    descricao: "Reclama de tudo, difícil de agradar",
    segmento: "loja de celulares",
    personalidade: "Reclamão, exigente",
    mensagemInicial: "Isso funciona mesmo ou é mais uma enganação?",
    comportamento: `
    - Reclama de TUDO
    - "Demorou pra responder", "Isso não é claro"
    - Faz objeções constantes
    - Testa paciência do atendente
    - Se não desistir e mostrar valor, pode testar
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 15,
    tipo: "Cliente Direto",
    temperatura: 'quente',
    descricao: "Sem rodeios, quer resolver rápido",
    segmento: "transportadora",
    personalidade: "Direto, sem paciência para enrolação",
    mensagemInicial: "Quanto custa e como assino?",
    comportamento: `
    - Vai direto ao ponto
    - Não quer explicação, quer fazer
    - Responde: "ok, manda o link"
    - Se enrolar muito, desiste
    `,
    metaConversao: 'assinar_plano'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🔄 MAIS PERFIS VARIADOS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 16,
    tipo: "Empreendedor Iniciante",
    temperatura: 'quente',
    descricao: "Começando negócio, quer economizar tempo",
    segmento: "dropshipping",
    personalidade: "Animado mas inseguro",
    mensagemInicial: "Oi! Tô começando meu negócio e vi o anúncio de R$49",
    comportamento: `
    - Empolgado com a oportunidade
    - Preocupado com ser fácil de usar
    - Perguntas: "é difícil?", "consigo sozinho?"
    - Quer suporte se precisar
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 17,
    tipo: "Empresário Experiente",
    temperatura: 'morno',
    descricao: "Tem empresa grande, quer escalar",
    segmento: "construtora",
    personalidade: "Profissional, focado em ROI",
    mensagemInicial: "Bom dia. Busco solução para automatizar atendimento. Recebemos cerca de 200 leads/dia.",
    comportamento: `
    - Foca em resultados e ROI
    - Perguntas: "qual capacidade?", "tem relatórios?"
    - Quer saber se escala
    - Preço não é problema se funcionar
    `,
    metaConversao: 'assinar_plano'
  },
  {
    id: 18,
    tipo: "Vendedor Autônomo",
    temperatura: 'quente',
    descricao: "Trabalha sozinho, precisa de ajuda",
    segmento: "corretor de imóveis",
    personalidade: "Prático, mão na massa",
    mensagemInicial: "E aí! Sou corretor, recebo muito lead e não dou conta de responder tudo",
    comportamento: `
    - Conta o problema real
    - Quer solução prática
    - Perguntas: "resolve meu problema?", "é automático mesmo?"
    - Se resolver, quer testar na hora
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 19,
    tipo: "Cliente que Envia Áudio",
    temperatura: 'morno',
    descricao: "Prefere falar que digitar",
    segmento: "mecânica",
    personalidade: "Prático, prefere áudio",
    mensagemInicial: "[ÁUDIO] Olá, eu vi a propaganda de vocês aí... queria entender melhor como funciona isso aí de atendimento automático",
    comportamento: `
    - Manda áudios em vez de digitar
    - Espera que a IA entenda áudio
    - Se não entender áudio, fica frustrado
    - Perguntas por áudio: "[ÁUDIO] E quanto custa?"
    `,
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 20,
    tipo: "Cliente que Volta",
    temperatura: 'morno',
    descricao: "Já conversou antes, voltou para decidir",
    segmento: "escola de idiomas",
    personalidade: "Pensativo, ponderado",
    mensagemInicial: "Oi, conversamos semana passada sobre o sistema de vocês",
    comportamento: `
    - Menciona conversa anterior
    - Já sabe o básico
    - Quer tirar dúvida específica que ficou
    - Perguntas: "lembra?", "posso fechar agora?"
    `,
    metaConversao: 'assinar_plano'
  }
];

// ═══════════════════════════════════════════════════════════════════════
// 🤖 FUNÇÕES DE SIMULAÇÃO
// ═══════════════════════════════════════════════════════════════════════

async function getMistralClient(): Promise<Mistral> {
  const config = await db.select().from(systemConfig).where(eq(systemConfig.chave, 'mistral_api_key')).limit(1);
  const apiKey = config[0]?.valor;
  if (!apiKey) throw new Error("MISTRAL_API_KEY não encontrada no banco");
  return new Mistral({ apiKey });
}

async function getPromptAgente(): Promise<string> {
  const config = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, USER_ID)).limit(1);
  return config[0]?.prompt || 'Você é um assistente de vendas.';
}

function criarPromptCliente(perfil: PerfilCliente): string {
  return `Você é um CLIENTE simulado para teste de vendas. NUNCA diga que é uma IA ou simulação.

SEU PERFIL:
- Tipo: ${perfil.tipo}
- Temperatura: ${perfil.temperatura}
- Segmento: ${perfil.segmento}
- Personalidade: ${perfil.personalidade}
- Comportamento: ${perfil.comportamento}

REGRAS IMPORTANTES:
1. Aja EXATAMENTE como esse tipo de cliente agiria
2. Use linguagem de WhatsApp (informal, com erros de digitação às vezes)
3. Responda de forma curta como no WhatsApp (não escreva parágrafos)
4. Se for lead quente, seja mais receptivo
5. Se for lead frio, dê mais objeções
6. Às vezes mande só "ok", "entendi", "tá"
7. Se o vendedor convencer, diga que quer testar ou assinar
8. Se não convencer, continue com objeções
9. NUNCA mencione que é teste ou simulação

OBJETIVO FINAL: ${perfil.metaConversao === 'criar_conta_gratuita' ? 'Ser convencido a criar conta gratuita e testar' : perfil.metaConversao === 'assinar_plano' ? 'Ser convencido a assinar o plano' : 'Aceitar implementação'}

Responda APENAS como o cliente, sem explicações ou prefixos.`;
}

async function simularRespostaCliente(
  mistral: Mistral,
  perfil: PerfilCliente,
  historico: Array<{ role: 'cliente' | 'agente'; mensagem: string }>,
  ultimaMensagemAgente: string
): Promise<string> {
  const historicoFormatado = historico.map(h => 
    `${h.role === 'cliente' ? 'VOCÊ (cliente)' : 'VENDEDOR'}: ${h.mensagem}`
  ).join('\n');

  const promptCompleto = `${criarPromptCliente(perfil)}

HISTÓRICO DA CONVERSA:
${historicoFormatado}

ÚLTIMA MENSAGEM DO VENDEDOR:
"${ultimaMensagemAgente}"

Responda como o cliente:`;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: promptCompleto }],
    maxTokens: 150,
    temperature: 0.8,
  });

  return response.choices?.[0]?.message?.content?.toString()?.trim() || "ok";
}

async function obterRespostaAgente(
  mistral: Mistral,
  promptAgente: string,
  historico: Array<{ role: 'cliente' | 'agente'; mensagem: string }>,
  mensagemCliente: string
): Promise<string> {
  const historicoFormatado = historico.map(h => 
    `${h.role === 'cliente' ? 'CLIENTE' : 'VOCÊ (Rodrigo)'}: ${h.mensagem}`
  ).join('\n');

  const promptCompleto = `${promptAgente}

HISTÓRICO DA CONVERSA:
${historicoFormatado}

MENSAGEM DO CLIENTE:
"${mensagemCliente}"

Responda como o Rodrigo:`;

  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages: [{ role: "user", content: promptCompleto }],
    maxTokens: 300,
    temperature: 0.7,
  });

  return response.choices?.[0]?.message?.content?.toString()?.trim() || "Oi! Como posso ajudar?";
}

// ═══════════════════════════════════════════════════════════════════════
// 📊 ANÁLISE DE CONVERSÃO
// ═══════════════════════════════════════════════════════════════════════

interface ResultadoAnalise {
  converteu: boolean;
  tipoConversao: string | null;
  pontuacao: number;
  observacoes: string[];
  melhorias: string[];
}

function analisarConversa(
  historico: Array<{ role: 'cliente' | 'agente'; mensagem: string }>,
  perfil: PerfilCliente
): ResultadoAnalise {
  const conversaCompleta = historico.map(h => h.mensagem.toLowerCase()).join(' ');
  const respostasCliente = historico.filter(h => h.role === 'cliente').map(h => h.mensagem.toLowerCase());
  const respostasAgente = historico.filter(h => h.role === 'agente').map(h => h.mensagem.toLowerCase());
  
  const observacoes: string[] = [];
  const melhorias: string[] = [];
  let pontuacao = 50;
  let converteu = false;
  let tipoConversao: string | null = null;

  // Indicadores positivos de conversão
  const indicadoresConversao = [
    { padrao: /vou (assinar|criar|fazer|testar)/i, tipo: 'intenção de ação', pontos: 15 },
    { padrao: /quero (assinar|criar|fazer|testar)/i, tipo: 'desejo de ação', pontos: 15 },
    { padrao: /como (assino|crio|faço|testo)/i, tipo: 'pergunta de como fazer', pontos: 10 },
    { padrao: /manda o link/i, tipo: 'pediu link', pontos: 20 },
    { padrao: /vou fazer (o teste|cadastro)/i, tipo: 'confirmou teste', pontos: 20 },
    { padrao: /pode mandar/i, tipo: 'aceitou receber link', pontos: 15 },
    { padrao: /interessante|gostei|legal/i, tipo: 'interesse positivo', pontos: 5 },
    { padrao: /perfeito|ótimo|show/i, tipo: 'aprovação', pontos: 10 },
  ];

  // Indicadores negativos
  const indicadoresNegativos = [
    { padrao: /não (quero|preciso|tenho interesse)/i, tipo: 'rejeição', pontos: -20 },
    { padrao: /muito caro|caro demais/i, tipo: 'objeção preço', pontos: -10 },
    { padrao: /depois (eu )?vejo/i, tipo: 'adiamento', pontos: -5 },
    { padrao: /não sei/i, tipo: 'incerteza', pontos: -3 },
    { padrao: /obrigad(o|a)/i, tipo: 'despedida sem ação', pontos: -5 },
  ];

  // Analisar respostas do cliente
  for (const resposta of respostasCliente) {
    for (const ind of indicadoresConversao) {
      if (ind.padrao.test(resposta)) {
        pontuacao += ind.pontos;
        observacoes.push(`✅ Cliente: ${ind.tipo}`);
        
        // Detectar tipo de conversão
        if (resposta.includes('assinar') || resposta.includes('pagar')) {
          tipoConversao = 'assinatura';
          converteu = true;
        } else if (resposta.includes('teste') || resposta.includes('criar conta') || resposta.includes('cadastr')) {
          tipoConversao = 'conta_gratuita';
          converteu = true;
        }
      }
    }
    
    for (const ind of indicadoresNegativos) {
      if (ind.padrao.test(resposta)) {
        pontuacao += ind.pontos;
        observacoes.push(`❌ Cliente: ${ind.tipo}`);
      }
    }
  }

  // Analisar qualidade das respostas do agente
  let mencionouTesteGratis = false;
  let mencionouPreco = false;
  let mencionouLink = false;
  let fezPerguntaEngajadora = false;

  for (const resposta of respostasAgente) {
    if (/teste gr[aá]tis|testar gr[aá]tis/i.test(resposta)) {
      mencionouTesteGratis = true;
      pontuacao += 5;
    }
    if (/r\$|49|99|199/i.test(resposta)) {
      mencionouPreco = true;
    }
    if (/agentezap\.com|link|cadastr/i.test(resposta)) {
      mencionouLink = true;
      pontuacao += 5;
    }
    if (/\?/.test(resposta)) {
      fezPerguntaEngajadora = true;
      pontuacao += 3;
    }
  }

  // Sugestões de melhoria baseadas na análise
  if (!mencionouTesteGratis && perfil.temperatura !== 'quente') {
    melhorias.push("Mencionar TESTE GRÁTIS mais cedo para leads frios/mornos");
  }
  if (!mencionouLink && converteu) {
    melhorias.push("Enviar link de cadastro quando cliente demonstra interesse");
  }
  if (!fezPerguntaEngajadora) {
    melhorias.push("Fazer mais perguntas engajadoras para manter conversa");
  }
  if (perfil.temperatura === 'quente' && !converteu) {
    melhorias.push("Lead quente não converteu - verificar se está sendo muito lento ou enrolando");
  }
  if (perfil.temperatura === 'frio' && !mencionouTesteGratis) {
    melhorias.push("Para leads frios, SEMPRE oferecer teste grátis sem compromisso");
  }

  // Garantir que pontuação está entre 0 e 100
  pontuacao = Math.max(0, Math.min(100, pontuacao));

  return {
    converteu,
    tipoConversao,
    pontuacao,
    observacoes,
    melhorias
  };
}

// ═══════════════════════════════════════════════════════════════════════
// 🚀 EXECUÇÃO DO TESTE INDIVIDUAL
// ═══════════════════════════════════════════════════════════════════════

async function executarTesteIndividual(numeroPerfil: number): Promise<void> {
  const perfil = PERFIS_CLIENTES.find(p => p.id === numeroPerfil);
  
  if (!perfil) {
    console.log(`${CORES.red}❌ Perfil ${numeroPerfil} não encontrado!${CORES.reset}`);
    console.log(`\nPerfis disponíveis (1-${PERFIS_CLIENTES.length}):`);
    PERFIS_CLIENTES.forEach(p => {
      console.log(`  ${p.id}. ${p.tipo} (${p.temperatura})`);
    });
    return;
  }

  console.log('\n' + '═'.repeat(80));
  console.log(`${CORES.bgYellow}${CORES.white} 🧪 TESTE #${perfil.id}: ${perfil.tipo} ${CORES.reset}`);
  console.log('═'.repeat(80));
  console.log(`${CORES.cyan}📋 Perfil:${CORES.reset}`);
  console.log(`   Temperatura: ${perfil.temperatura === 'quente' ? '🔥 QUENTE' : perfil.temperatura === 'morno' ? '🌡️ MORNO' : '❄️ FRIO'}`);
  console.log(`   Segmento: ${perfil.segmento}`);
  console.log(`   Personalidade: ${perfil.personalidade}`);
  console.log(`   Meta: ${perfil.metaConversao}`);
  console.log('─'.repeat(80));

  try {
    const mistral = await getMistralClient();
    const promptAgente = await getPromptAgente();
    
    const historico: Array<{ role: 'cliente' | 'agente'; mensagem: string }> = [];
    let turnoAtual = 0;

    // Primeira mensagem do cliente
    let mensagemCliente = perfil.mensagemInicial;
    
    console.log(`\n${CORES.yellow}📱 CONVERSA:${CORES.reset}\n`);

    while (turnoAtual < MAX_TURNOS) {
      turnoAtual++;
      
      // Mostrar mensagem do cliente
      console.log(`${CORES.blue}👤 CLIENTE:${CORES.reset} ${mensagemCliente}`);
      historico.push({ role: 'cliente', mensagem: mensagemCliente });

      // Obter resposta do agente
      const respostaAgente = await obterRespostaAgente(mistral, promptAgente, historico, mensagemCliente);
      console.log(`${CORES.green}🤖 RODRIGO:${CORES.reset} ${respostaAgente}`);
      historico.push({ role: 'agente', mensagem: respostaAgente });
      console.log('');

      // Verificar se conversa deve terminar
      const respostaLower = respostaAgente.toLowerCase();
      const ultimaClienteLower = mensagemCliente.toLowerCase();
      
      // Condições de fim de conversa
      if (
        (respostaLower.includes('agentezap.com') && ultimaClienteLower.includes('vou')) ||
        (ultimaClienteLower.includes('obrigad') && !ultimaClienteLower.includes('?')) ||
        turnoAtual >= MAX_TURNOS
      ) {
        break;
      }

      // Gerar próxima resposta do cliente
      mensagemCliente = await simularRespostaCliente(mistral, perfil, historico, respostaAgente);
      
      // Pequeno delay para não sobrecarregar API
      await new Promise(r => setTimeout(r, 500));
    }

    // Análise da conversa
    console.log('─'.repeat(80));
    console.log(`${CORES.magenta}📊 ANÁLISE:${CORES.reset}\n`);
    
    const analise = analisarConversa(historico, perfil);
    
    // Resultado
    if (analise.converteu) {
      console.log(`${CORES.bgGreen}${CORES.white} ✅ CONVERTEU! ${CORES.reset} Tipo: ${analise.tipoConversao}`);
    } else {
      console.log(`${CORES.bgRed}${CORES.white} ❌ NÃO CONVERTEU ${CORES.reset}`);
    }
    
    console.log(`\n📈 Pontuação: ${analise.pontuacao}/100`);
    
    if (analise.observacoes.length > 0) {
      console.log(`\n📝 Observações:`);
      analise.observacoes.forEach(o => console.log(`   ${o}`));
    }
    
    if (analise.melhorias.length > 0) {
      console.log(`\n💡 Melhorias sugeridas:`);
      analise.melhorias.forEach(m => console.log(`   • ${m}`));
    }

    console.log('\n' + '═'.repeat(80));
    console.log(`${CORES.cyan}Próximo teste: npx tsx test-individual-conversa.ts ${numeroPerfil + 1}${CORES.reset}`);
    console.log('═'.repeat(80) + '\n');

  } catch (error) {
    console.error(`${CORES.red}Erro no teste:${CORES.reset}`, error);
  }
}

// Executar
const args = process.argv.slice(2);
const numeroPerfil = parseInt(args[0]) || 1;

executarTesteIndividual(numeroPerfil);
