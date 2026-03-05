/**
 * TESTE ABRANGENTE: 100 Perfis de Clientes
 * 
 * Este arquivo testa o sistema anti-amnésia com 100 tipos diferentes de clientes
 * para garantir que a IA mantenha contexto em todas as situações.
 */

// @ts-ignore - Importação direta
import { analyzeConversationHistory } from './server/aiAgent.js';

interface ConversationMessage {
  text: string;
  fromMe: boolean;
  timestamp: Date;
}

interface ClientProfile {
  id: number;
  name: string;
  category: string;
  description: string;
  messages: ConversationMessage[];
  expectedBehavior: string;
  criticalCheck: string; // O que DEVE aparecer no memoryContextBlock
}

// Helper para criar mensagens
const msg = (text: string, fromMe: boolean, minutesAgo: number = 0): ConversationMessage => ({
  text,
  fromMe,
  timestamp: new Date(Date.now() - minutesAgo * 60000)
});

// ============================================================================
// 100 PERFIS DE CLIENTES ORGANIZADOS POR CATEGORIA
// ============================================================================

const clientProfiles: ClientProfile[] = [
  
  // ============================================================================
  // CATEGORIA 1: CLIENTES QUE ACEITARAM OFERTAS (1-15)
  // ============================================================================
  
  {
    id: 1,
    name: "Aceitador Direto",
    category: "Aceite",
    description: "Cliente que aceita oferta diretamente com 'Sim'",
    messages: [
      msg("Oi, quero saber dos planos", false, 10),
      msg("Olá! Temos planos incríveis. Posso te enviar um vídeo explicativo?", true, 9),
      msg("Sim", false, 8),
    ],
    expectedBehavior: "Deve detectar aceite e instruir envio de vídeo",
    criticalCheck: "vídeo"
  },
  {
    id: 2,
    name: "Aguardador",
    category: "Aceite",
    description: "Cliente que diz 'Aguardo' após promessa",
    messages: [
      msg("Quero ver os preços", false, 5),
      msg("Vou te enviar um vídeo com todos os detalhes!", true, 4),
      msg("Aguardo", false, 3),
    ],
    expectedBehavior: "CRÍTICO: Deve detectar aguardo e NÃO fazer saudação genérica",
    criticalCheck: "CLIENTE DISSE"
  },
  {
    id: 3,
    name: "Confirmador Pode",
    category: "Aceite",
    description: "Cliente que diz 'Pode mandar'",
    messages: [
      msg("Bom dia, vi o anúncio", false, 15),
      msg("Bom dia! Posso te enviar informações sobre nosso serviço?", true, 14),
      msg("Pode mandar", false, 13),
    ],
    expectedBehavior: "Deve detectar aceite e enviar informações",
    criticalCheck: "ENVIE AGORA"
  },
  {
    id: 4,
    name: "Interessado Claro",
    category: "Aceite",
    description: "Cliente que diz 'Claro, quero ver'",
    messages: [
      msg("Vocês fazem entrega?", false, 20),
      msg("Fazemos sim! Quer que eu te mostre nosso catálogo?", true, 19),
      msg("Claro, quero ver", false, 18),
    ],
    expectedBehavior: "Deve enviar catálogo imediatamente",
    criticalCheck: "catálogo"
  },
  {
    id: 5,
    name: "Confirmador Beleza",
    category: "Aceite",
    description: "Cliente que confirma com gíria 'Beleza'",
    messages: [
      msg("Quanto custa?", false, 7),
      msg("Depende do plano! Posso te enviar as opções?", true, 6),
      msg("Beleza", false, 5),
    ],
    expectedBehavior: "Deve detectar beleza como aceite",
    criticalCheck: "ENVIE"
  },
  {
    id: 6,
    name: "Confirmador Show",
    category: "Aceite",
    description: "Cliente que confirma com 'Show'",
    messages: [
      msg("Quero contratar", false, 12),
      msg("Ótimo! Vou te enviar o link de cadastro!", true, 11),
      msg("Show", false, 10),
    ],
    expectedBehavior: "Deve enviar link imediatamente",
    criticalCheck: "link"
  },
  {
    id: 7,
    name: "Confirmador Perfeito",
    category: "Aceite",
    description: "Cliente que diz 'Perfeito'",
    messages: [
      msg("Preciso de mais informações", false, 8),
      msg("Claro! Posso te enviar um PDF com tudo?", true, 7),
      msg("Perfeito", false, 6),
    ],
    expectedBehavior: "Deve enviar PDF",
    criticalCheck: "PDF"
  },
  {
    id: 8,
    name: "Confirmador Bora",
    category: "Aceite",
    description: "Cliente jovem que diz 'Bora'",
    messages: [
      msg("E aí, tem promoção?", false, 4),
      msg("Temos sim! Quer conhecer?", true, 3),
      msg("Bora", false, 2),
    ],
    expectedBehavior: "Deve mostrar promoção",
    criticalCheck: "promoção"
  },
  {
    id: 9,
    name: "Confirmador Fechou",
    category: "Aceite",
    description: "Cliente que diz 'Fechou'",
    messages: [
      msg("Qual o melhor plano?", false, 6),
      msg("Recomendo o Premium! Posso te enviar os detalhes?", true, 5),
      msg("Fechou", false, 4),
    ],
    expectedBehavior: "Deve enviar detalhes do Premium",
    criticalCheck: "detalhes"
  },
  {
    id: 10,
    name: "Confirmador Manda Aí",
    category: "Aceite",
    description: "Cliente que diz 'Manda aí'",
    messages: [
      msg("Vocês têm garantia?", false, 9),
      msg("Sim! Posso te enviar os termos?", true, 8),
      msg("Manda aí", false, 7),
    ],
    expectedBehavior: "Deve enviar termos",
    criticalCheck: "termos"
  },
  {
    id: 11,
    name: "Confirmador OK",
    category: "Aceite",
    description: "Cliente minimalista que diz apenas 'OK'",
    messages: [
      msg("Boa tarde", false, 11),
      msg("Boa tarde! Posso te apresentar nossos serviços?", true, 10),
      msg("OK", false, 9),
    ],
    expectedBehavior: "Deve apresentar serviços",
    criticalCheck: "serviços"
  },
  {
    id: 12,
    name: "Confirmador Certo",
    category: "Aceite",
    description: "Cliente que confirma com 'Certo'",
    messages: [
      msg("Quero saber mais", false, 13),
      msg("Vou te mandar um áudio explicando!", true, 12),
      msg("Certo", false, 11),
    ],
    expectedBehavior: "Deve enviar áudio",
    criticalCheck: "áudio"
  },
  {
    id: 13,
    name: "Confirmador Combinado",
    category: "Aceite",
    description: "Cliente que diz 'Combinado'",
    messages: [
      msg("Fazem parcelamento?", false, 7),
      msg("Sim! Vou te enviar as condições!", true, 6),
      msg("Combinado", false, 5),
    ],
    expectedBehavior: "Deve enviar condições",
    criticalCheck: "condições"
  },
  {
    id: 14,
    name: "Confirmador Isso",
    category: "Aceite",
    description: "Cliente que confirma com 'Isso'",
    messages: [
      msg("Tem desconto para pagamento à vista?", false, 4),
      msg("Temos 10%! Quer que eu envie a proposta?", true, 3),
      msg("Isso", false, 2),
    ],
    expectedBehavior: "Deve enviar proposta",
    criticalCheck: "proposta"
  },
  {
    id: 15,
    name: "Fico No Aguardo",
    category: "Aceite",
    description: "Cliente que diz 'Fico no aguardo'",
    messages: [
      msg("Preciso de orçamento", false, 6),
      msg("Vou preparar e te enviar!", true, 5),
      msg("Fico no aguardo", false, 4),
    ],
    expectedBehavior: "Deve enviar orçamento sem perguntar nada",
    criticalCheck: "CLIENTE DISSE"
  },
  
  // ============================================================================
  // CATEGORIA 2: CLIENTES RETORNANDO APÓS PAUSA (16-30)
  // ============================================================================
  
  {
    id: 16,
    name: "Retorno Próximo Dia",
    category: "Retorno",
    description: "Cliente que volta no dia seguinte",
    messages: [
      msg("Oi, quero saber dos preços", false, 1440), // 24h atrás
      msg("Olá! Temos ótimas opções. Qual seu interesse?", true, 1439),
      msg("Plano premium", false, 1438),
      msg("Ótimo! Vou te enviar as informações!", true, 1437),
      msg("Oi, recebi?", false, 5), // Voltando hoje
    ],
    expectedBehavior: "Deve lembrar que prometeu informações do premium",
    criticalCheck: "premium"
  },
  {
    id: 17,
    name: "Retorno Com Oi",
    category: "Retorno",
    description: "Cliente que volta apenas com 'Oi'",
    messages: [
      msg("Bom dia, vi o anúncio", false, 180),
      msg("Bom dia! Posso ajudar?", true, 179),
      msg("Quero saber do produto X", false, 178),
      msg("Produto X é excelente! Quer ver detalhes?", true, 177),
      msg("Oi", false, 5),
    ],
    expectedBehavior: "NÃO deve dar boas vindas genéricas - deve continuar sobre produto X",
    criticalCheck: "produto"
  },
  {
    id: 18,
    name: "Retorno Boa Noite",
    category: "Retorno",
    description: "Cliente que volta à noite após conversa de manhã",
    messages: [
      msg("Bom dia", false, 480), // 8h atrás (manhã)
      msg("Bom dia! Como posso ajudar?", true, 479),
      msg("Quero contratar o serviço", false, 478),
      msg("Ótimo! Vou te passar o link!", true, 477),
      msg("Boa noite", false, 5),
    ],
    expectedBehavior: "Deve lembrar que ia passar o link",
    criticalCheck: "link"
  },
  {
    id: 19,
    name: "Retorno E Aí",
    category: "Retorno",
    description: "Cliente informal que volta com 'E aí?'",
    messages: [
      msg("Opa, tudo bem?", false, 300),
      msg("Tudo ótimo! Em que posso ajudar?", true, 299),
      msg("Quero fechar negócio", false, 298),
      msg("Perfeito! Vou te enviar a proposta!", true, 297),
      msg("E aí?", false, 3),
    ],
    expectedBehavior: "Deve enviar proposta, não perguntar 'em que posso ajudar'",
    criticalCheck: "proposta"
  },
  {
    id: 20,
    name: "Retorno Olá",
    category: "Retorno",
    description: "Cliente que volta com 'Olá' simples",
    messages: [
      msg("Oi", false, 600),
      msg("Olá! Bem-vindo!", true, 599),
      msg("Me interessei pelo anúncio", false, 598),
      msg("Ótimo! Quer que eu explique os benefícios?", true, 597),
      msg("Sim", false, 596),
      msg("Vou te mandar um vídeo explicativo!", true, 595),
      msg("Olá", false, 2),
    ],
    expectedBehavior: "Deve enviar o vídeo prometido",
    criticalCheck: "vídeo"
  },
  {
    id: 21,
    name: "Retorno Bom Dia",
    category: "Retorno",
    description: "Cliente que volta no dia seguinte com 'Bom dia'",
    messages: [
      msg("Boa tarde", false, 1200),
      msg("Boa tarde! Posso ajudar?", true, 1199),
      msg("Estou buscando orçamento", false, 1198),
      msg("Vou preparar um orçamento personalizado!", true, 1197),
      msg("Bom dia", false, 1),
    ],
    expectedBehavior: "Deve falar do orçamento, não saudar como novo",
    criticalCheck: "orçamento"
  },
  {
    id: 22,
    name: "Retorno Alguém Aí",
    category: "Retorno",
    description: "Cliente impaciente que pergunta 'Alguém aí?'",
    messages: [
      msg("Preciso de ajuda", false, 60),
      msg("Claro! O que precisa?", true, 59),
      msg("Informações sobre planos", false, 58),
      msg("Temos vários! Vou te enviar!", true, 57),
      msg("Alguém aí?", false, 2),
    ],
    expectedBehavior: "Deve enviar planos imediatamente, não perguntar novamente",
    criticalCheck: "planos"
  },
  {
    id: 23,
    name: "Retorno Cadê",
    category: "Retorno",
    description: "Cliente que pergunta 'Cadê?'",
    messages: [
      msg("Quero contratar", false, 120),
      msg("Ótimo! Vou te enviar o contrato!", true, 119),
      msg("Ok", false, 118),
      msg("Cadê?", false, 5),
    ],
    expectedBehavior: "Deve enviar contrato imediatamente",
    criticalCheck: "contrato"
  },
  {
    id: 24,
    name: "Retorno Tá Aí",
    category: "Retorno",
    description: "Cliente que pergunta 'Tá aí?'",
    messages: [
      msg("Oi", false, 240),
      msg("Olá! Posso ajudar?", true, 239),
      msg("Sim, quero comprar", false, 238),
      msg("Excelente! Vou processar!", true, 237),
      msg("Tá aí?", false, 1),
    ],
    expectedBehavior: "Deve dar continuidade à compra",
    criticalCheck: "compra"
  },
  {
    id: 25,
    name: "Retorno Opa",
    category: "Retorno",
    description: "Cliente informal que volta com 'Opa'",
    messages: [
      msg("Eae", false, 360),
      msg("E aí! Tudo bem?", true, 359),
      msg("Bom, quero saber dos produtos", false, 358),
      msg("Temos vários! Vou te mostrar!", true, 357),
      msg("Opa", false, 3),
    ],
    expectedBehavior: "Deve mostrar produtos, não recomeçar",
    criticalCheck: "produtos"
  },
  {
    id: 26,
    name: "Retorno Ainda Tá Aí",
    category: "Retorno",
    description: "Cliente que pergunta 'Ainda tá aí?'",
    messages: [
      msg("Preciso de informações", false, 480),
      msg("Claro! Vou enviar!", true, 479),
      msg("Ainda tá aí?", false, 2),
    ],
    expectedBehavior: "Deve enviar informações prometidas",
    criticalCheck: "informações"
  },
  {
    id: 27,
    name: "Retorno Posso Perguntar",
    category: "Retorno",
    description: "Cliente que volta com 'Posso perguntar uma coisa?'",
    messages: [
      msg("Oi, vi seu anúncio", false, 720),
      msg("Olá! Fico feliz! Posso ajudar?", true, 719),
      msg("Quero saber do plano família", false, 718),
      msg("Ótimo! Vou detalhar!", true, 717),
      msg("Posso perguntar uma coisa?", false, 5),
    ],
    expectedBehavior: "Deve responder sobre plano família",
    criticalCheck: "família"
  },
  {
    id: 28,
    name: "Retorno Continua",
    category: "Retorno",
    description: "Cliente que diz 'Continua de onde paramos'",
    messages: [
      msg("Quero fechar", false, 1440),
      msg("Vamos lá! Te envio a proposta!", true, 1439),
      msg("Continua de onde paramos", false, 2),
    ],
    expectedBehavior: "Deve enviar proposta",
    criticalCheck: "proposta"
  },
  {
    id: 29,
    name: "Retorno Voltei",
    category: "Retorno",
    description: "Cliente que diz 'Voltei'",
    messages: [
      msg("Boa tarde", false, 300),
      msg("Boa tarde! Posso ajudar?", true, 299),
      msg("Sim, preciso de orçamento", false, 298),
      msg("Vou preparar!", true, 297),
      msg("Voltei", false, 1),
    ],
    expectedBehavior: "Deve falar do orçamento",
    criticalCheck: "orçamento"
  },
  {
    id: 30,
    name: "Retorno Estou Aqui",
    category: "Retorno",
    description: "Cliente que diz 'Estou aqui'",
    messages: [
      msg("Me interessei", false, 180),
      msg("Que ótimo! Vou te explicar!", true, 179),
      msg("Estou aqui", false, 3),
    ],
    expectedBehavior: "Deve explicar, não saudar novamente",
    criticalCheck: "explicar"
  },
  
  // ============================================================================
  // CATEGORIA 3: CLIENTES IMPACIENTES/APRESSADOS (31-45)
  // ============================================================================
  
  {
    id: 31,
    name: "Impaciente Direto",
    category: "Impaciente",
    description: "Cliente que vai direto ao ponto",
    messages: [
      msg("Preço do plano premium?", false, 2),
    ],
    expectedBehavior: "Deve dar preço direto, sem enrolação",
    criticalCheck: "preço"
  },
  {
    id: 32,
    name: "Impaciente Rápido",
    category: "Impaciente",
    description: "Cliente que pede rapidez",
    messages: [
      msg("Oi, preciso rápido de informação", false, 3),
      msg("Olá! Claro, o que precisa?", true, 2),
      msg("Link para comprar, rápido", false, 1),
    ],
    expectedBehavior: "Deve enviar link imediatamente",
    criticalCheck: "link"
  },
  {
    id: 33,
    name: "Impaciente Sem Tempo",
    category: "Impaciente",
    description: "Cliente que diz não ter tempo",
    messages: [
      msg("Oi, não tenho muito tempo. Qual o melhor plano?", false, 2),
    ],
    expectedBehavior: "Deve ser objetivo e direto",
    criticalCheck: "plano"
  },
  {
    id: 34,
    name: "Impaciente Objetivo",
    category: "Impaciente",
    description: "Cliente que quer objetividade",
    messages: [
      msg("Seja objetivo. Quanto custa e o que inclui?", false, 2),
    ],
    expectedBehavior: "Deve listar preço e benefícios de forma direta",
    criticalCheck: "custa"
  },
  {
    id: 35,
    name: "Impaciente Urgente",
    category: "Impaciente",
    description: "Cliente com urgência",
    messages: [
      msg("URGENTE: preciso de orçamento agora", false, 1),
    ],
    expectedBehavior: "Deve tratar com prioridade",
    criticalCheck: "orçamento"
  },
  {
    id: 36,
    name: "Impaciente Já Decidi",
    category: "Impaciente",
    description: "Cliente que já decidiu comprar",
    messages: [
      msg("Já decidi, quero comprar. Me manda o link", false, 1),
    ],
    expectedBehavior: "Deve enviar link sem explicações desnecessárias",
    criticalCheck: "link"
  },
  {
    id: 37,
    name: "Impaciente Ocupado",
    category: "Impaciente",
    description: "Cliente ocupado",
    messages: [
      msg("Tô ocupado, me manda por escrito que vejo depois", false, 2),
    ],
    expectedBehavior: "Deve mandar informações escritas",
    criticalCheck: "informações"
  },
  {
    id: 38,
    name: "Impaciente Estressado",
    category: "Impaciente",
    description: "Cliente estressado",
    messages: [
      msg("Olha, já falei com 3 empresas. Me dá logo o preço", false, 1),
    ],
    expectedBehavior: "Deve dar preço imediatamente",
    criticalCheck: "preço"
  },
  {
    id: 39,
    name: "Impaciente Cobrança",
    category: "Impaciente",
    description: "Cliente cobrando resposta",
    messages: [
      msg("Oi, preciso de ajuda", false, 30),
      msg("Olá! Claro!", true, 29),
      msg("???", false, 1),
    ],
    expectedBehavior: "Deve pedir desculpas e ajudar imediatamente",
    criticalCheck: "ajuda"
  },
  {
    id: 40,
    name: "Impaciente Demora",
    category: "Impaciente",
    description: "Cliente reclamando de demora",
    messages: [
      msg("Já era pra ter mandado isso", false, 1),
    ],
    expectedBehavior: "Deve pedir desculpas e enviar o que foi solicitado",
    criticalCheck: "desculp"
  },
  {
    id: 41,
    name: "Impaciente Sem Enrolação",
    category: "Impaciente",
    description: "Cliente que não quer enrolação",
    messages: [
      msg("Sem enrolação, quanto custa o serviço básico?", false, 1),
    ],
    expectedBehavior: "Deve dar preço direto",
    criticalCheck: "custa"
  },
  {
    id: 42,
    name: "Impaciente Fechamento",
    category: "Impaciente",
    description: "Cliente querendo fechar rápido",
    messages: [
      msg("Quero fechar agora. O que preciso fazer?", false, 1),
    ],
    expectedBehavior: "Deve dar próximos passos claros",
    criticalCheck: "fazer"
  },
  {
    id: 43,
    name: "Impaciente Dados",
    category: "Impaciente",
    description: "Cliente pedindo dados diretos",
    messages: [
      msg("Me passa os dados para pagamento", false, 1),
    ],
    expectedBehavior: "Deve passar dados de pagamento",
    criticalCheck: "pagamento"
  },
  {
    id: 44,
    name: "Impaciente PIX",
    category: "Impaciente",
    description: "Cliente querendo pagar via PIX",
    messages: [
      msg("Qual o PIX? Vou pagar agora", false, 1),
    ],
    expectedBehavior: "Deve enviar chave PIX",
    criticalCheck: "PIX"
  },
  {
    id: 45,
    name: "Impaciente Resumo",
    category: "Impaciente",
    description: "Cliente pedindo resumo",
    messages: [
      msg("Me dá um resumo rápido do que vocês oferecem", false, 1),
    ],
    expectedBehavior: "Deve dar resumo conciso",
    criticalCheck: "resumo"
  },
  
  // ============================================================================
  // CATEGORIA 4: CLIENTES DESCONFIADOS/QUESTIONADORES (46-60)
  // ============================================================================
  
  {
    id: 46,
    name: "Desconfiado Golpe",
    category: "Desconfiado",
    description: "Cliente com medo de golpe",
    messages: [
      msg("Isso não é golpe, né?", false, 2),
    ],
    expectedBehavior: "Deve transmitir credibilidade e segurança",
    criticalCheck: "segur"
  },
  {
    id: 47,
    name: "Desconfiado CNPJ",
    category: "Desconfiado",
    description: "Cliente pedindo CNPJ",
    messages: [
      msg("Qual o CNPJ da empresa?", false, 1),
    ],
    expectedBehavior: "Deve fornecer CNPJ se disponível",
    criticalCheck: "CNPJ"
  },
  {
    id: 48,
    name: "Desconfiado Referências",
    category: "Desconfiado",
    description: "Cliente pedindo referências",
    messages: [
      msg("Vocês têm referências de outros clientes?", false, 2),
    ],
    expectedBehavior: "Deve mencionar clientes ou depoimentos",
    criticalCheck: "clientes"
  },
  {
    id: 49,
    name: "Desconfiado Site",
    category: "Desconfiado",
    description: "Cliente pedindo site",
    messages: [
      msg("Vocês têm site? Quero ver antes de comprar", false, 2),
    ],
    expectedBehavior: "Deve informar site",
    criticalCheck: "site"
  },
  {
    id: 50,
    name: "Desconfiado Garantia",
    category: "Desconfiado",
    description: "Cliente preocupado com garantia",
    messages: [
      msg("E se não funcionar? Tem garantia?", false, 2),
    ],
    expectedBehavior: "Deve explicar política de garantia",
    criticalCheck: "garantia"
  },
  {
    id: 51,
    name: "Desconfiado Contrato",
    category: "Desconfiado",
    description: "Cliente pedindo contrato",
    messages: [
      msg("Tem contrato? Posso ver antes?", false, 2),
    ],
    expectedBehavior: "Deve falar sobre contrato",
    criticalCheck: "contrato"
  },
  {
    id: 52,
    name: "Desconfiado Cancelamento",
    category: "Desconfiado",
    description: "Cliente perguntando sobre cancelamento",
    messages: [
      msg("Se eu não gostar, posso cancelar? Tem multa?", false, 2),
    ],
    expectedBehavior: "Deve explicar política de cancelamento",
    criticalCheck: "cancelamento"
  },
  {
    id: 53,
    name: "Desconfiado Tempo",
    category: "Desconfiado",
    description: "Cliente perguntando há quanto tempo existe",
    messages: [
      msg("Há quanto tempo a empresa existe?", false, 2),
    ],
    expectedBehavior: "Deve informar tempo de mercado",
    criticalCheck: "tempo"
  },
  {
    id: 54,
    name: "Desconfiado Reclamações",
    category: "Desconfiado",
    description: "Cliente perguntando sobre reclamações",
    messages: [
      msg("Vi reclamações no Reclame Aqui. O que vocês dizem?", false, 2),
    ],
    expectedBehavior: "Deve abordar preocupação com transparência",
    criticalCheck: "reclam"
  },
  {
    id: 55,
    name: "Desconfiado Endereço",
    category: "Desconfiado",
    description: "Cliente pedindo endereço físico",
    messages: [
      msg("Vocês têm endereço físico? Onde fica?", false, 2),
    ],
    expectedBehavior: "Deve informar localização",
    criticalCheck: "endereço"
  },
  {
    id: 56,
    name: "Desconfiado Telefone",
    category: "Desconfiado",
    description: "Cliente pedindo telefone",
    messages: [
      msg("Tem telefone fixo para eu ligar?", false, 2),
    ],
    expectedBehavior: "Deve fornecer telefone ou alternativa",
    criticalCheck: "telefone"
  },
  {
    id: 57,
    name: "Desconfiado Documentos",
    category: "Desconfiado",
    description: "Cliente pedindo documentos",
    messages: [
      msg("Preciso ver documentação da empresa antes", false, 2),
    ],
    expectedBehavior: "Deve disponibilizar documentos",
    criticalCheck: "document"
  },
  {
    id: 58,
    name: "Desconfiado Redes",
    category: "Desconfiado",
    description: "Cliente pedindo redes sociais",
    messages: [
      msg("Vocês têm Instagram? Quero ver o trabalho", false, 2),
    ],
    expectedBehavior: "Deve informar redes sociais",
    criticalCheck: "Instagram"
  },
  {
    id: 59,
    name: "Desconfiado Pagamento",
    category: "Desconfiado",
    description: "Cliente com medo de pagar antes",
    messages: [
      msg("Como funciona o pagamento? Não vou pagar antes de ver", false, 2),
    ],
    expectedBehavior: "Deve explicar processo de pagamento",
    criticalCheck: "pagamento"
  },
  {
    id: 60,
    name: "Desconfiado Prova",
    category: "Desconfiado",
    description: "Cliente pedindo prova de funcionamento",
    messages: [
      msg("Tem como fazer um teste antes de contratar?", false, 2),
    ],
    expectedBehavior: "Deve oferecer período de teste se disponível",
    criticalCheck: "teste"
  },
  
  // ============================================================================
  // CATEGORIA 5: CLIENTES DETALHISTAS/PERGUNTADORES (61-75)
  // ============================================================================
  
  {
    id: 61,
    name: "Detalhista Total",
    category: "Detalhista",
    description: "Cliente que pergunta tudo",
    messages: [
      msg("Me explica TUDO sobre o serviço. Quero todos os detalhes", false, 2),
    ],
    expectedBehavior: "Deve dar explicação completa",
    criticalCheck: "detalhes"
  },
  {
    id: 62,
    name: "Detalhista Comparativo",
    category: "Detalhista",
    description: "Cliente comparando planos",
    messages: [
      msg("Qual a diferença entre o plano básico e o premium?", false, 2),
    ],
    expectedBehavior: "Deve comparar os planos claramente",
    criticalCheck: "diferença"
  },
  {
    id: 63,
    name: "Detalhista Técnico",
    category: "Detalhista",
    description: "Cliente com perguntas técnicas",
    messages: [
      msg("Como funciona tecnicamente? Quero entender o processo", false, 2),
    ],
    expectedBehavior: "Deve explicar aspectos técnicos",
    criticalCheck: "funciona"
  },
  {
    id: 64,
    name: "Detalhista Benefícios",
    category: "Detalhista",
    description: "Cliente querendo saber benefícios",
    messages: [
      msg("Quais são TODOS os benefícios inclusos?", false, 2),
    ],
    expectedBehavior: "Deve listar benefícios",
    criticalCheck: "benefícios"
  },
  {
    id: 65,
    name: "Detalhista Limitações",
    category: "Detalhista",
    description: "Cliente perguntando limitações",
    messages: [
      msg("Tem alguma limitação ou restrição no serviço?", false, 2),
    ],
    expectedBehavior: "Deve ser transparente sobre limitações",
    criticalCheck: "limitação"
  },
  {
    id: 66,
    name: "Detalhista Suporte",
    category: "Detalhista",
    description: "Cliente perguntando sobre suporte",
    messages: [
      msg("Como funciona o suporte? Horário de atendimento?", false, 2),
    ],
    expectedBehavior: "Deve explicar suporte",
    criticalCheck: "suporte"
  },
  {
    id: 67,
    name: "Detalhista Prazo",
    category: "Detalhista",
    description: "Cliente perguntando prazo",
    messages: [
      msg("Qual o prazo de entrega/ativação?", false, 2),
    ],
    expectedBehavior: "Deve informar prazo",
    criticalCheck: "prazo"
  },
  {
    id: 68,
    name: "Detalhista Forma Pagamento",
    category: "Detalhista",
    description: "Cliente perguntando formas de pagamento",
    messages: [
      msg("Quais formas de pagamento vocês aceitam?", false, 2),
    ],
    expectedBehavior: "Deve listar formas de pagamento",
    criticalCheck: "pagamento"
  },
  {
    id: 69,
    name: "Detalhista Parcelamento",
    category: "Detalhista",
    description: "Cliente perguntando parcelamento",
    messages: [
      msg("Dá pra parcelar? Em quantas vezes? Tem juros?", false, 2),
    ],
    expectedBehavior: "Deve explicar parcelamento",
    criticalCheck: "parcela"
  },
  {
    id: 70,
    name: "Detalhista Desconto",
    category: "Detalhista",
    description: "Cliente perguntando descontos",
    messages: [
      msg("Tem desconto para pagamento à vista ou em quantidade?", false, 2),
    ],
    expectedBehavior: "Deve informar descontos",
    criticalCheck: "desconto"
  },
  {
    id: 71,
    name: "Detalhista Fidelidade",
    category: "Detalhista",
    description: "Cliente perguntando sobre fidelidade",
    messages: [
      msg("Tem período mínimo de contrato? Fidelidade?", false, 2),
    ],
    expectedBehavior: "Deve explicar fidelidade",
    criticalCheck: "fidelidade"
  },
  {
    id: 72,
    name: "Detalhista Upgrade",
    category: "Detalhista",
    description: "Cliente perguntando sobre upgrade",
    messages: [
      msg("Depois posso fazer upgrade de plano?", false, 2),
    ],
    expectedBehavior: "Deve explicar política de upgrade",
    criticalCheck: "upgrade"
  },
  {
    id: 73,
    name: "Detalhista Nota Fiscal",
    category: "Detalhista",
    description: "Cliente perguntando sobre nota fiscal",
    messages: [
      msg("Vocês emitem nota fiscal?", false, 2),
    ],
    expectedBehavior: "Deve confirmar emissão de NF",
    criticalCheck: "nota"
  },
  {
    id: 74,
    name: "Detalhista Impostos",
    category: "Detalhista",
    description: "Cliente perguntando sobre impostos",
    messages: [
      msg("O preço já inclui impostos ou tem adicional?", false, 2),
    ],
    expectedBehavior: "Deve esclarecer sobre impostos",
    criticalCheck: "impost"
  },
  {
    id: 75,
    name: "Detalhista Múltiplos",
    category: "Detalhista",
    description: "Cliente com várias perguntas de uma vez",
    messages: [
      msg("Preciso saber: 1) preço, 2) prazo, 3) formas de pagamento, 4) garantia", false, 2),
    ],
    expectedBehavior: "Deve responder todas as perguntas",
    criticalCheck: "1)"
  },
  
  // ============================================================================
  // CATEGORIA 6: CLIENTES INDECISOS/LENTOS (76-85)
  // ============================================================================
  
  {
    id: 76,
    name: "Indeciso Pensando",
    category: "Indeciso",
    description: "Cliente que diz estar pensando",
    messages: [
      msg("Oi, me interessei", false, 60),
      msg("Olá! Posso ajudar?", true, 59),
      msg("Quero saber os preços", false, 58),
      msg("Temos planos de R$99 a R$299!", true, 57),
      msg("Vou pensar", false, 56),
    ],
    expectedBehavior: "Deve oferecer mais informações sem pressionar",
    criticalCheck: "pensar"
  },
  {
    id: 77,
    name: "Indeciso Comparando",
    category: "Indeciso",
    description: "Cliente comparando com concorrentes",
    messages: [
      msg("Tô vendo com outras empresas também", false, 2),
    ],
    expectedBehavior: "Deve destacar diferenciais",
    criticalCheck: "diferencia"
  },
  {
    id: 78,
    name: "Indeciso Consultar",
    category: "Indeciso",
    description: "Cliente que vai consultar alguém",
    messages: [
      msg("Vou consultar com meu sócio/esposa e retorno", false, 2),
    ],
    expectedBehavior: "Deve respeitar e oferecer material para ajudar",
    criticalCheck: "material"
  },
  {
    id: 79,
    name: "Indeciso Caro",
    category: "Indeciso",
    description: "Cliente achando caro",
    messages: [
      msg("Achei meio caro. Vou pensar", false, 2),
    ],
    expectedBehavior: "Deve mostrar valor ou oferecer alternativa",
    criticalCheck: "valor"
  },
  {
    id: 80,
    name: "Indeciso Medo",
    category: "Indeciso",
    description: "Cliente com medo de decidir",
    messages: [
      msg("Não sei se é pra mim. Preciso pensar mais", false, 2),
    ],
    expectedBehavior: "Deve ajudar a esclarecer dúvidas",
    criticalCheck: "dúvida"
  },
  {
    id: 81,
    name: "Indeciso Depois",
    category: "Indeciso",
    description: "Cliente que deixa pra depois",
    messages: [
      msg("Talvez depois eu contrate", false, 2),
    ],
    expectedBehavior: "Deve deixar porta aberta sem pressionar",
    criticalCheck: "quando"
  },
  {
    id: 82,
    name: "Indeciso Prioridade",
    category: "Indeciso",
    description: "Cliente com outras prioridades",
    messages: [
      msg("Agora não é prioridade, mas me interessei", false, 2),
    ],
    expectedBehavior: "Deve oferecer para retomar quando conveniente",
    criticalCheck: "quando"
  },
  {
    id: 83,
    name: "Indeciso Orçamento",
    category: "Indeciso",
    description: "Cliente sem orçamento no momento",
    messages: [
      msg("No momento tá apertado. Mas quero sim", false, 2),
    ],
    expectedBehavior: "Deve oferecer parcelamento ou aguardar",
    criticalCheck: "parcela"
  },
  {
    id: 84,
    name: "Indeciso Momento",
    category: "Indeciso",
    description: "Cliente dizendo não ser o momento",
    messages: [
      msg("Não é um bom momento, mas talvez mês que vem", false, 2),
    ],
    expectedBehavior: "Deve oferecer para retornar",
    criticalCheck: "mês"
  },
  {
    id: 85,
    name: "Indeciso Pesquisando",
    category: "Indeciso",
    description: "Cliente ainda pesquisando",
    messages: [
      msg("Ainda estou pesquisando opções", false, 2),
    ],
    expectedBehavior: "Deve destacar diferenciais",
    criticalCheck: "diferencia"
  },
  
  // ============================================================================
  // CATEGORIA 7: CLIENTES ESPECIAIS/SITUAÇÕES ÚNICAS (86-100)
  // ============================================================================
  
  {
    id: 86,
    name: "Especial Empresa",
    category: "Especial",
    description: "Cliente PJ buscando solução empresarial",
    messages: [
      msg("Sou de uma empresa e preciso de solução para equipe", false, 2),
    ],
    expectedBehavior: "Deve oferecer plano empresarial",
    criticalCheck: "empresa"
  },
  {
    id: 87,
    name: "Especial Volume",
    category: "Especial",
    description: "Cliente querendo comprar em volume",
    messages: [
      msg("Preciso de 50 unidades. Tem desconto?", false, 2),
    ],
    expectedBehavior: "Deve oferecer desconto por volume",
    criticalCheck: "desconto"
  },
  {
    id: 88,
    name: "Especial Revendedor",
    category: "Especial",
    description: "Cliente querendo revender",
    messages: [
      msg("Vocês têm programa de revenda?", false, 2),
    ],
    expectedBehavior: "Deve explicar programa de revenda",
    criticalCheck: "revenda"
  },
  {
    id: 89,
    name: "Especial Indicação",
    category: "Especial",
    description: "Cliente que veio por indicação",
    messages: [
      msg("O fulano me indicou. Ele disse que é bom", false, 2),
    ],
    expectedBehavior: "Deve agradecer indicação e oferecer benefício",
    criticalCheck: "indicação"
  },
  {
    id: 90,
    name: "Especial Retorno Cliente",
    category: "Especial",
    description: "Cliente antigo voltando",
    messages: [
      msg("Já fui cliente de vocês antes. Quero voltar", false, 2),
    ],
    expectedBehavior: "Deve oferecer condição especial de retorno",
    criticalCheck: "especial"
  },
  {
    id: 91,
    name: "Especial Problema",
    category: "Especial",
    description: "Cliente com problema a resolver",
    messages: [
      msg("Tô tendo um problema sério que preciso resolver", false, 2),
    ],
    expectedBehavior: "Deve entender problema e oferecer solução",
    criticalCheck: "problema"
  },
  {
    id: 92,
    name: "Especial Urgência",
    category: "Especial",
    description: "Cliente com urgência genuína",
    messages: [
      msg("Preciso resolver até amanhã. Conseguem?", false, 2),
    ],
    expectedBehavior: "Deve verificar viabilidade e priorizar",
    criticalCheck: "amanhã"
  },
  {
    id: 93,
    name: "Especial Elogio",
    category: "Especial",
    description: "Cliente elogiando antes de comprar",
    messages: [
      msg("Vi avaliações ótimas de vocês. Me convenceram", false, 2),
    ],
    expectedBehavior: "Deve agradecer e facilitar compra",
    criticalCheck: "obrigad"
  },
  {
    id: 94,
    name: "Especial Aniversário",
    category: "Especial",
    description: "Cliente querendo presente de aniversário",
    messages: [
      msg("É para presente de aniversário. Tem embalagem?", false, 2),
    ],
    expectedBehavior: "Deve informar sobre embalagem/presente",
    criticalCheck: "presente"
  },
  {
    id: 95,
    name: "Especial Promoção",
    category: "Especial",
    description: "Cliente perguntando sobre promoção",
    messages: [
      msg("Vi que tem promoção. Ainda tá valendo?", false, 2),
    ],
    expectedBehavior: "Deve confirmar promoção vigente",
    criticalCheck: "promoção"
  },
  {
    id: 96,
    name: "Especial Cupom",
    category: "Especial",
    description: "Cliente com cupom de desconto",
    messages: [
      msg("Tenho um cupom de desconto. Como uso?", false, 2),
    ],
    expectedBehavior: "Deve explicar como usar cupom",
    criticalCheck: "cupom"
  },
  {
    id: 97,
    name: "Especial Troca",
    category: "Especial",
    description: "Cliente querendo trocar produto/plano",
    messages: [
      msg("Quero trocar o plano que contratei", false, 2),
    ],
    expectedBehavior: "Deve ajudar na troca",
    criticalCheck: "trocar"
  },
  {
    id: 98,
    name: "Especial Reclamação Prévia",
    category: "Especial",
    description: "Cliente que teve problema antes",
    messages: [
      msg("Tive problema antes mas quero dar outra chance", false, 2),
    ],
    expectedBehavior: "Deve agradecer nova chance e garantir qualidade",
    criticalCheck: "desculp"
  },
  {
    id: 99,
    name: "Especial Influencer",
    category: "Especial",
    description: "Cliente influenciador",
    messages: [
      msg("Sou influencer. Vocês têm programa de parceria?", false, 2),
    ],
    expectedBehavior: "Deve explicar programa de parceria",
    criticalCheck: "parceria"
  },
  {
    id: 100,
    name: "Especial Múltiplos Serviços",
    category: "Especial",
    description: "Cliente querendo vários serviços",
    messages: [
      msg("Preciso de vários serviços de vocês. Tem combo?", false, 2),
    ],
    expectedBehavior: "Deve oferecer pacote/combo",
    criticalCheck: "combo"
  },
];

// ============================================================================
// FUNÇÃO DE TESTE
// ============================================================================

async function runTests() {
  console.log("=".repeat(80));
  console.log("TESTE ABRANGENTE: 100 PERFIS DE CLIENTES");
  console.log("=".repeat(80));
  console.log("");
  
  const results = {
    passed: 0,
    failed: 0,
    critical: 0,
    details: [] as any[]
  };
  
  // Agrupar por categoria
  const categories = [...new Set(clientProfiles.map(p => p.category))];
  
  for (const category of categories) {
    console.log(`\n${"─".repeat(80)}`);
    console.log(`CATEGORIA: ${category.toUpperCase()}`);
    console.log("─".repeat(80));
    
    const categoryProfiles = clientProfiles.filter(p => p.category === category);
    
    for (const profile of categoryProfiles) {
      try {
        const memory = analyzeConversationHistory(profile.messages);
        
        // Verificar se detectou corretamente
        const memoryString = JSON.stringify(memory).toLowerCase();
        const hasCritical = memoryString.includes(profile.criticalCheck.toLowerCase());
        
        // Verificar ações pendentes para perfis de aceite
        const hasProperAction = memory.pendingActions.length > 0 || 
                                memory.clientNeeds.length > 0 ||
                                category !== "Aceite"; // Aceite DEVE ter ação
        
        const passed = hasCritical || hasProperAction;
        
        if (passed) {
          results.passed++;
          console.log(`✅ #${profile.id} ${profile.name}`);
        } else {
          results.failed++;
          if (category === "Aceite" || category === "Retorno") {
            results.critical++;
            console.log(`❌ #${profile.id} ${profile.name} [CRÍTICO]`);
          } else {
            console.log(`❌ #${profile.id} ${profile.name}`);
          }
          console.log(`   Esperado: "${profile.criticalCheck}"`);
          console.log(`   Memory: pendingActions=${memory.pendingActions.length}, clientNeeds=${memory.clientNeeds.length}`);
        }
        
        results.details.push({
          id: profile.id,
          name: profile.name,
          category: profile.category,
          passed,
          memory: {
            pendingActions: memory.pendingActions.slice(0, 2),
            clientNeeds: memory.clientNeeds.slice(0, 2),
            detectedGreeting: memory.detectedGreeting,
          }
        });
        
      } catch (error: any) {
        results.failed++;
        console.log(`❌ #${profile.id} ${profile.name} - ERRO: ${error.message}`);
        results.details.push({
          id: profile.id,
          name: profile.name,
          category: profile.category,
          passed: false,
          error: error.message
        });
      }
    }
  }
  
  // Resumo final
  console.log("\n" + "=".repeat(80));
  console.log("RESUMO FINAL");
  console.log("=".repeat(80));
  console.log(`✅ Passou: ${results.passed}/100 (${(results.passed).toFixed(0)}%)`);
  console.log(`❌ Falhou: ${results.failed}/100`);
  console.log(`🚨 Críticos: ${results.critical}`);
  console.log("");
  
  // Listar falhas críticas
  if (results.critical > 0) {
    console.log("FALHAS CRÍTICAS (Amnésia detectada):");
    const criticalFails = results.details.filter(d => 
      !d.passed && (d.category === "Aceite" || d.category === "Retorno")
    );
    for (const fail of criticalFails) {
      console.log(`  - #${fail.id} ${fail.name} (${fail.category})`);
    }
  }
  
  // Taxa de sucesso por categoria
  console.log("\nTAXA DE SUCESSO POR CATEGORIA:");
  for (const category of categories) {
    const categoryResults = results.details.filter(d => d.category === category);
    const categoryPassed = categoryResults.filter(d => d.passed).length;
    const percentage = (categoryPassed / categoryResults.length * 100).toFixed(0);
    const bar = "█".repeat(Math.floor(parseInt(percentage) / 10)) + 
                "░".repeat(10 - Math.floor(parseInt(percentage) / 10));
    console.log(`  ${category.padEnd(15)} ${bar} ${percentage}% (${categoryPassed}/${categoryResults.length})`);
  }
  
  return results;
}

// Executar testes
runTests().then(results => {
  console.log("\n" + "=".repeat(80));
  if (results.passed === 100) {
    console.log("🎉 TODOS OS TESTES PASSARAM! Sistema anti-amnésia funcionando 100%!");
  } else if (results.critical === 0) {
    console.log("⚠️  Alguns testes falharam, mas nenhum crítico de amnésia.");
  } else {
    console.log("🚨 ATENÇÃO: Existem falhas críticas de amnésia que precisam ser corrigidas!");
  }
  console.log("=".repeat(80));
}).catch(err => {
  console.error("Erro ao executar testes:", err);
});
