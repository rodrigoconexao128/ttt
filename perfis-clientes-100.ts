/**
 * 📋 100 PERFIS DE CLIENTES PARA TESTE IA VS IA
 * 
 * Este arquivo contém 100 perfis variados de clientes para testar
 * o agente de vendas até alcançar 100% de conversão.
 */

export interface PerfilCliente {
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

export const PERFIS_CLIENTES_100: PerfilCliente[] = [
  // ═══════════════════════════════════════════════════════════════════════
  // 🔥 1-20: LEADS QUENTES - Alta intenção de compra
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 1,
    tipo: "Lead R$49 - Interessado",
    temperatura: 'quente',
    descricao: "Viu anúncio de R$49 e mandou msg",
    segmento: "loja de roupas",
    personalidade: "Direto, quer resolver",
    mensagemInicial: "Olá! Tenho interesse no AgenteZap por R$49",
    comportamento: "Interessado no preço. Pergunta como funciona. Se gostar, quer assinar.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 2,
    tipo: "Lead Decidido",
    temperatura: 'quente',
    descricao: "Já pesquisou e quer assinar",
    segmento: "pizzaria",
    personalidade: "Objetivo, sem rodeios",
    mensagemInicial: "Quero assinar o plano de R$49, manda o link",
    comportamento: "Já decidiu. Só quer o link. Responde curto.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 3,
    tipo: "Lead Teste Primeiro",
    temperatura: 'quente',
    descricao: "Quer testar antes de pagar",
    segmento: "clínica estética",
    personalidade: "Cauteloso mas interessado",
    mensagemInicial: "Vi o anúncio de R$49, tem como testar antes?",
    comportamento: "Gostou do preço. Quer teste grátis. Se tiver, cria conta.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 4,
    tipo: "Lead Instagram",
    temperatura: 'quente',
    descricao: "Veio do Instagram Ads",
    segmento: "loja de cosméticos",
    personalidade: "Jovem, informal",
    mensagemInicial: "oi vi o anuncio no insta, como funciona?",
    comportamento: "Linguagem informal. Usa emojis. Quer ver na prática.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 5,
    tipo: "Lead Facebook",
    temperatura: 'quente',
    descricao: "Veio do Facebook Ads",
    segmento: "ótica",
    personalidade: "Curioso, faz perguntas",
    mensagemInicial: "Olá, vi a propaganda no Facebook, quero saber mais",
    comportamento: "Interessado. Pergunta preço e funcionalidades. Se gostar, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 6,
    tipo: "Lead TikTok",
    temperatura: 'quente',
    descricao: "Viu vídeo no TikTok",
    segmento: "loja de tênis",
    personalidade: "Jovem, impaciente",
    mensagemInicial: "kkkk vi no tiktok esse negocio de ia, eh bom msm?",
    comportamento: "Linguagem jovem. Usa 'kkkk', 'mano'. Quer ver funcionando.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 7,
    tipo: "Lead Google Ads",
    temperatura: 'quente',
    descricao: "Pesquisou no Google",
    segmento: "consultório odontológico",
    personalidade: "Analítico, pesquisador",
    mensagemInicial: "Boa tarde, estou pesquisando soluções de IA para atendimento",
    comportamento: "Compara opções. Pergunta diferenciais. Se convencer, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 8,
    tipo: "Lead Indicação",
    temperatura: 'quente',
    descricao: "Amigo indicou",
    segmento: "barbearia",
    personalidade: "Confiante pela indicação",
    mensagemInicial: "E aí, meu amigo usa o sistema de vocês e falou que é bom",
    comportamento: "Já vem confiando. Pergunta como usa. Quer testar logo.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 9,
    tipo: "Lead Urgente",
    temperatura: 'quente',
    descricao: "Precisa resolver HOJE",
    segmento: "e-commerce",
    personalidade: "Apressado, urgente",
    mensagemInicial: "Preciso de uma solução HOJE, vocês conseguem configurar rápido?",
    comportamento: "Urgência extrema. Paga mais por rapidez. Quer implementação.",
    metaConversao: 'implementacao'
  },
  {
    id: 10,
    tipo: "Lead Black Friday",
    temperatura: 'quente',
    descricao: "Quer preparar para Black Friday",
    segmento: "loja de eletrônicos",
    personalidade: "Planejador, preventivo",
    mensagemInicial: "Tô me preparando pra Black Friday, preciso de IA pra atender",
    comportamento: "Pensa no futuro. Quer escalar. Aceita plano maior.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 11,
    tipo: "Lead Fim de Semana",
    temperatura: 'quente',
    descricao: "Não consegue atender fim de semana",
    segmento: "floricultura",
    personalidade: "Cansado de trabalhar demais",
    mensagemInicial: "Oi, preciso de algo pra atender no domingo que não consigo mais",
    comportamento: "Quer descansar. Se funcionar 24h, fecha na hora.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 12,
    tipo: "Lead Natal",
    temperatura: 'quente',
    descricao: "Quer atender demanda de Natal",
    segmento: "loja de brinquedos",
    personalidade: "Preocupado com demanda",
    mensagemInicial: "O Natal tá chegando e preciso de ajuda pra atender",
    comportamento: "Sazonal. Urgência moderada. Se resolver, paga.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 13,
    tipo: "Lead Concorrência",
    temperatura: 'quente',
    descricao: "Concorrente usa e ele quer também",
    segmento: "açougue",
    personalidade: "Competitivo",
    mensagemInicial: "Meu concorrente tá usando IA pra atender, preciso ter também",
    comportamento: "Não quer ficar pra trás. Se funcionar igual, fecha.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 14,
    tipo: "Lead Funcionário Saiu",
    temperatura: 'quente',
    descricao: "Funcionário pediu demissão",
    segmento: "loja de materiais",
    personalidade: "Desesperado",
    mensagemInicial: "Minha atendente saiu e não tenho quem coloque no lugar",
    comportamento: "Desespero. Precisa urgente. Paga pelo problema resolvido.",
    metaConversao: 'implementacao'
  },
  {
    id: 15,
    tipo: "Lead Direto",
    temperatura: 'quente',
    descricao: "Quer link e pronto",
    segmento: "transportadora",
    personalidade: "Extremamente objetivo",
    mensagemInicial: "Quanto custa e como assino?",
    comportamento: "Só quer link. Responde 'ok' e faz. Sem conversa.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 16,
    tipo: "Lead Empreendedor",
    temperatura: 'quente',
    descricao: "Começando negócio",
    segmento: "dropshipping",
    personalidade: "Animado mas inseguro",
    mensagemInicial: "Tô começando meu negócio, vi o anúncio de R$49",
    comportamento: "Empolgado. Quer saber se é fácil. Se for, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 17,
    tipo: "Lead Empresário",
    temperatura: 'quente',
    descricao: "Empresa grande",
    segmento: "construtora",
    personalidade: "Profissional, ROI",
    mensagemInicial: "Bom dia. Recebemos 200 leads/dia, busco automação",
    comportamento: "Foco em resultados. Quer saber capacidade. Preço ok se funcionar.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 18,
    tipo: "Lead Corretor",
    temperatura: 'quente',
    descricao: "Corretor de imóveis",
    segmento: "imobiliária",
    personalidade: "Vendedor, prático",
    mensagemInicial: "Sou corretor, recebo muito lead e perco vendas por não responder rápido",
    comportamento: "Conhece o problema. Quer solução prática. Testa se funcionar.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 19,
    tipo: "Lead Médico",
    temperatura: 'quente',
    descricao: "Consultório médico",
    segmento: "clínica médica",
    personalidade: "Ocupado, formal",
    mensagemInicial: "Boa tarde. Preciso de sistema para agendamento automático",
    comportamento: "Profissional. Quer eficiência. Se funcionar, fecha.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 20,
    tipo: "Lead Advogado",
    temperatura: 'quente',
    descricao: "Escritório de advocacia",
    segmento: "advocacia",
    personalidade: "Analítico, detalhista",
    mensagemInicial: "Olá, busco solução para triagem de clientes",
    comportamento: "Quer entender bem. Se aprovar, fecha plano.",
    metaConversao: 'assinar_plano'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🌡️ 21-50: LEADS MORNOS - Interessados com dúvidas
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 21,
    tipo: "Lead Curioso",
    temperatura: 'morno',
    descricao: "Quer entender o que é",
    segmento: "academia",
    personalidade: "Curioso, perguntador",
    mensagemInicial: "Oi, vi a propaganda, como funciona?",
    comportamento: "Não sabe o que é. Faz perguntas básicas. Se gostar, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 22,
    tipo: "Lead Comparador",
    temperatura: 'morno',
    descricao: "Comparando ferramentas",
    segmento: "agência marketing",
    personalidade: "Analítico, compara",
    mensagemInicial: "Tô pesquisando ferramentas de atendimento, o que vocês tem?",
    comportamento: "Já conhece concorrentes. Quer diferenciais. Se convencer, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 23,
    tipo: "Lead Detalhista",
    temperatura: 'morno',
    descricao: "Quer saber tudo",
    segmento: "escritório contábil",
    personalidade: "Meticuloso, pergunta tudo",
    mensagemInicial: "Gostaria de informações detalhadas sobre o sistema",
    comportamento: "Pergunta cada funcionalidade. Se responder bem, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 24,
    tipo: "Lead Simples",
    temperatura: 'morno',
    descricao: "Pessoa comum",
    segmento: "padaria",
    personalidade: "Simples, direto",
    mensagemInicial: "Oi, bom dia",
    comportamento: "Não sabe termos técnicos. Quer explicação fácil.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 25,
    tipo: "Lead Técnico",
    temperatura: 'morno',
    descricao: "Entende de tecnologia",
    segmento: "startup",
    personalidade: "Técnico, programador",
    mensagemInicial: "Qual modelo de LLM vocês usam? Tem API?",
    comportamento: "Perguntas técnicas. Se a tech for boa, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 26,
    tipo: "Lead Formal",
    temperatura: 'morno',
    descricao: "Fala formal",
    segmento: "hospital",
    personalidade: "Formal, educado",
    mensagemInicial: "Boa tarde. Gostaria de obter informações sobre o serviço de automação.",
    comportamento: "Linguagem formal. Espera profissionalismo.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 27,
    tipo: "Lead Áudio",
    temperatura: 'morno',
    descricao: "Prefere áudio",
    segmento: "mecânica",
    personalidade: "Prático, não gosta de digitar",
    mensagemInicial: "[ÁUDIO] Oi, vi a propaganda aí, queria entender como funciona",
    comportamento: "Manda áudios. Espera que entenda.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 28,
    tipo: "Lead Volta",
    temperatura: 'morno',
    descricao: "Já conversou antes",
    segmento: "escola idiomas",
    personalidade: "Pensativo, ponderado",
    mensagemInicial: "Oi, conversamos semana passada sobre o sistema",
    comportamento: "Menciona conversa anterior. Quer tirar dúvida final.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 29,
    tipo: "Lead Grupo WhatsApp",
    temperatura: 'morno',
    descricao: "Viu em grupo de empreendedores",
    segmento: "freelancer",
    personalidade: "Networking, grupo",
    mensagemInicial: "Oi, vi pessoal falando do AgenteZap num grupo, é bom mesmo?",
    comportamento: "Veio por indicação indireta. Quer confirmação.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 30,
    tipo: "Lead YouTube",
    temperatura: 'morno',
    descricao: "Viu vídeo no YouTube",
    segmento: "loja virtual",
    personalidade: "Pesquisador, assistiu vídeo",
    mensagemInicial: "Vi um vídeo sobre vocês no YouTube, parece interessante",
    comportamento: "Já sabe algo. Quer confirmar o que viu.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 31,
    tipo: "Lead Podcast",
    temperatura: 'morno',
    descricao: "Ouviu em podcast",
    segmento: "consultoria",
    personalidade: "Intelectual, ouve podcasts",
    mensagemInicial: "Ouvi sobre vocês no podcast X, quero saber mais",
    comportamento: "Interessado mas precisa de mais info.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 32,
    tipo: "Lead LinkedIn",
    temperatura: 'morno',
    descricao: "Viu no LinkedIn",
    segmento: "RH empresa",
    personalidade: "Profissional, corporativo",
    mensagemInicial: "Olá, vi o post de vocês no LinkedIn. Interessante.",
    comportamento: "Corporativo. Quer entender para empresa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 33,
    tipo: "Lead Evento",
    temperatura: 'morno',
    descricao: "Conheceu em evento",
    segmento: "varejo",
    personalidade: "Networking presencial",
    mensagemInicial: "Oi, te conheci na feira semana passada",
    comportamento: "Lembra do contato presencial. Quer continuar conversa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 34,
    tipo: "Lead Email",
    temperatura: 'morno',
    descricao: "Recebeu email marketing",
    segmento: "clínica veterinária",
    personalidade: "Respondeu email",
    mensagemInicial: "Recebi o email de vocês, podem me explicar melhor?",
    comportamento: "Veio do email. Já tem interesse básico.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 35,
    tipo: "Lead SMS",
    temperatura: 'morno',
    descricao: "Recebeu SMS",
    segmento: "farmácia",
    personalidade: "Respondeu SMS",
    mensagemInicial: "Recebi a mensagem de vocês, o que é AgenteZap?",
    comportamento: "Curioso pelo SMS. Quer explicação.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 36,
    tipo: "Lead Franquia",
    temperatura: 'morno',
    descricao: "Tem várias unidades",
    segmento: "franquia fast food",
    personalidade: "Gestor de múltiplas lojas",
    mensagemInicial: "Tenho 5 lojas, vocês atendem todas?",
    comportamento: "Quer solução escalável. Pergunta preço por unidade.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 37,
    tipo: "Lead Sócio",
    temperatura: 'morno',
    descricao: "Sócio quer aprovar",
    segmento: "escritório arquitetura",
    personalidade: "Precisa de aprovação",
    mensagemInicial: "Meu sócio pediu pra eu pesquisar, como funciona?",
    comportamento: "Vai apresentar pro sócio. Precisa de material.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 38,
    tipo: "Lead Financeiro",
    temperatura: 'morno',
    descricao: "Preocupado com custo",
    segmento: "loja de móveis",
    personalidade: "Foco no financeiro",
    mensagemInicial: "Quanto custa e qual o retorno esperado?",
    comportamento: "Quer entender ROI. Se fizer sentido, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 39,
    tipo: "Lead Marido/Esposa",
    temperatura: 'morno',
    descricao: "Parceiro mandou pesquisar",
    segmento: "buffet festas",
    personalidade: "Pesquisando para o outro",
    mensagemInicial: "Minha esposa viu propaganda e pediu pra eu ver",
    comportamento: "Pesquisando para outra pessoa decidir.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 40,
    tipo: "Lead Secretária",
    temperatura: 'morno',
    descricao: "Funcionário pesquisando",
    segmento: "clínica psicologia",
    personalidade: "Funcionário, não decide",
    mensagemInicial: "Boa tarde, a doutora pediu informações sobre o sistema",
    comportamento: "Não tem poder de decisão. Vai repassar info.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 41,
    tipo: "Lead Renovação",
    temperatura: 'morno',
    descricao: "Usa concorrente, quer trocar",
    segmento: "loja de colchões",
    personalidade: "Insatisfeito com atual",
    mensagemInicial: "Uso outra ferramenta mas não tô satisfeito, vocês são melhores?",
    comportamento: "Compara com atual. Quer saber diferenciais.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 42,
    tipo: "Lead Expansão",
    temperatura: 'morno',
    descricao: "Abrindo nova loja",
    segmento: "loja de calçados",
    personalidade: "Expansão do negócio",
    mensagemInicial: "Tô abrindo outra loja e quero automatizar desde o começo",
    comportamento: "Quer começar certo. Se funcionar, usa nas duas.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 43,
    tipo: "Lead Orçamento",
    temperatura: 'morno',
    descricao: "Pedindo orçamento",
    segmento: "gráfica",
    personalidade: "Formal, pedindo orçamento",
    mensagemInicial: "Gostaria de um orçamento para automação de atendimento",
    comportamento: "Quer proposta formal. Se preço ok, avança.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 44,
    tipo: "Lead Demo",
    temperatura: 'morno',
    descricao: "Quer demonstração",
    segmento: "academia crossfit",
    personalidade: "Quer ver funcionando",
    mensagemInicial: "Vocês fazem demonstração do sistema?",
    comportamento: "Quer ver antes de decidir. Se mostrar, convence.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 45,
    tipo: "Lead Dúvida Específica",
    temperatura: 'morno',
    descricao: "Tem dúvida pontual",
    segmento: "lavanderia",
    personalidade: "Dúvida específica",
    mensagemInicial: "O sistema de vocês responde áudio?",
    comportamento: "Tem dúvida específica. Se responder, avança.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 46,
    tipo: "Lead Integração",
    temperatura: 'morno',
    descricao: "Quer saber de integração",
    segmento: "loja de informática",
    personalidade: "Preocupado com sistema atual",
    mensagemInicial: "Vocês integram com meu sistema de vendas?",
    comportamento: "Precisa de integração. Se tiver, avança.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 47,
    tipo: "Lead Multi-atendente",
    temperatura: 'morno',
    descricao: "Quer vários atendentes",
    segmento: "loja de pneus",
    personalidade: "Equipe grande",
    mensagemInicial: "Tenho 3 atendentes, o sistema funciona pra todos?",
    comportamento: "Equipe. Quer saber se escala.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 48,
    tipo: "Lead Horário",
    temperatura: 'morno',
    descricao: "Quer atender fora do horário",
    segmento: "pizzaria delivery",
    personalidade: "Horário problema",
    mensagemInicial: "Funciona de madrugada? Meus clientes pedem tarde",
    comportamento: "Precisa 24h. Se confirmar, fecha.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 49,
    tipo: "Lead Volume",
    temperatura: 'morno',
    descricao: "Alto volume de mensagens",
    segmento: "loja online grande",
    personalidade: "Alto volume",
    mensagemInicial: "Recebo 500 mensagens por dia, aguenta?",
    comportamento: "Preocupado com capacidade. Se aguenta, testa.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 50,
    tipo: "Lead Personalização",
    temperatura: 'morno',
    descricao: "Quer personalizar respostas",
    segmento: "joalheria",
    personalidade: "Quer exclusividade",
    mensagemInicial: "Consigo personalizar as respostas da IA?",
    comportamento: "Quer que pareça a empresa. Se personalizar, fecha.",
    metaConversao: 'criar_conta_gratuita'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // ❄️ 51-80: LEADS FRIOS - Objeções fortes
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 51,
    tipo: "Lead Desconfiado",
    temperatura: 'frio',
    descricao: "Acha que é golpe",
    segmento: "loja de eletrônicos",
    personalidade: "Cético, desconfia",
    mensagemInicial: "Isso é golpe?",
    comportamento: "Desconfia de tudo. Quer provas. Se provar, talvez teste.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 52,
    tipo: "Lead Preço Alto",
    temperatura: 'frio',
    descricao: "Acha caro",
    segmento: "salão de beleza",
    personalidade: "Econômico, reclama",
    mensagemInicial: "Quanto custa?",
    comportamento: "Vai achar caro. Quer desconto. Se tiver teste grátis, talvez.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 53,
    tipo: "Lead Sem Tempo",
    temperatura: 'frio',
    descricao: "Muito ocupado",
    segmento: "restaurante",
    personalidade: "Apressado, impaciente",
    mensagemInicial: "Oi",
    comportamento: "Responde curto. Não quer explicação. Quer link direto.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 54,
    tipo: "Lead Frustrado",
    temperatura: 'frio',
    descricao: "Já tentou outras IAs",
    segmento: "pet shop",
    personalidade: "Frustrado com outras",
    mensagemInicial: "Já testei várias IAs e nenhuma funciona",
    comportamento: "Conta histórias ruins. Quer saber diferencial.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 55,
    tipo: "Lead Chato",
    temperatura: 'frio',
    descricao: "Reclama de tudo",
    segmento: "loja celulares",
    personalidade: "Reclamão, exigente",
    mensagemInicial: "Isso funciona ou é mais uma enganação?",
    comportamento: "Reclama de tudo. Testa paciência.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 56,
    tipo: "Lead Negativo",
    temperatura: 'frio',
    descricao: "Pessimista",
    segmento: "loja de presentes",
    personalidade: "Negativo, pessimista",
    mensagemInicial: "Duvido que isso funcione pro meu negócio",
    comportamento: "Pessimista. Acha que não vai funcionar.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 57,
    tipo: "Lead Tradicional",
    temperatura: 'frio',
    descricao: "Não gosta de tecnologia",
    segmento: "loja de tecidos",
    personalidade: "Tradicional, anti-tech",
    mensagemInicial: "Não confio muito nessas coisas de internet",
    comportamento: "Resistente a tecnologia. Precisa convencer muito.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 58,
    tipo: "Lead Concorrente Leal",
    temperatura: 'frio',
    descricao: "Usa concorrente e gosta",
    segmento: "loja de perfumes",
    personalidade: "Leal a outra marca",
    mensagemInicial: "Já uso outra ferramenta, por que trocar?",
    comportamento: "Satisfeito com atual. Difícil convencer.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 59,
    tipo: "Lead Sem Grana",
    temperatura: 'frio',
    descricao: "Diz que não tem dinheiro",
    segmento: "loja pequena",
    personalidade: "Alega falta de verba",
    mensagemInicial: "Parece bom mas tô sem grana agora",
    comportamento: "Diz não ter dinheiro. Se tiver grátis, talvez.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 60,
    tipo: "Lead Ocupado Demais",
    temperatura: 'frio',
    descricao: "Não tem tempo de aprender",
    segmento: "food truck",
    personalidade: "Ocupado demais",
    mensagemInicial: "Não tenho tempo de aprender sistema novo",
    comportamento: "Alega falta de tempo. Se for fácil, talvez.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 61,
    tipo: "Lead Traumatizado",
    temperatura: 'frio',
    descricao: "Teve experiência ruim",
    segmento: "loja de móveis usados",
    personalidade: "Trauma com tech",
    mensagemInicial: "Última vez que contratei algo assim perdi dinheiro",
    comportamento: "Trauma anterior. Muito resistente.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 62,
    tipo: "Lead Desinteressado",
    temperatura: 'frio',
    descricao: "Não demonstra interesse",
    segmento: "papelaria",
    personalidade: "Desinteressado",
    mensagemInicial: "hmm",
    comportamento: "Respostas mínimas. Difícil engajar.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 63,
    tipo: "Lead Antipático",
    temperatura: 'frio',
    descricao: "Grosso nas respostas",
    segmento: "oficina mecânica",
    personalidade: "Grosso, antipático",
    mensagemInicial: "fala logo o que é isso",
    comportamento: "Respostas grossas. Testa paciência.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 64,
    tipo: "Lead Spam",
    temperatura: 'frio',
    descricao: "Acha que é spam",
    segmento: "loja de sapatos",
    personalidade: "Anti-spam",
    mensagemInicial: "Para de mandar mensagem, isso é spam",
    comportamento: "Acha que é spam. Precisa convencer que não é.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 65,
    tipo: "Lead Errado",
    temperatura: 'frio',
    descricao: "Não sabe o que é",
    segmento: "confeitaria",
    personalidade: "Confuso",
    mensagemInicial: "Não sei do que vocês tão falando",
    comportamento: "Confuso. Precisa explicar do zero.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 66,
    tipo: "Lead Advogado Chato",
    temperatura: 'frio',
    descricao: "Quer saber de contrato",
    segmento: "escritório advocacia",
    personalidade: "Jurídico, formal",
    mensagemInicial: "Qual a cláusula de cancelamento do contrato?",
    comportamento: "Foco em contrato e garantias. Muito detalhista.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 67,
    tipo: "Lead LGPD",
    temperatura: 'frio',
    descricao: "Preocupado com dados",
    segmento: "consultório psicologia",
    personalidade: "Privacidade first",
    mensagemInicial: "Como vocês tratam os dados dos meus clientes? LGPD?",
    comportamento: "Preocupado com privacidade. Quer garantias.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 68,
    tipo: "Lead Competidor",
    temperatura: 'frio',
    descricao: "Concorrente pesquisando",
    segmento: "tech",
    personalidade: "Pesquisando concorrência",
    mensagemInicial: "Sou da empresa X, quero entender como vocês funcionam",
    comportamento: "É concorrente. Quer saber segredos.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 69,
    tipo: "Lead Assédio",
    temperatura: 'frio',
    descricao: "Acha que vai ser pressionado",
    segmento: "loja de roupas",
    personalidade: "Anti-vendedor",
    mensagemInicial: "Não quero que fique me ligando depois",
    comportamento: "Medo de assédio comercial. Quer garantias.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 70,
    tipo: "Lead Fake",
    temperatura: 'frio',
    descricao: "Testando o sistema",
    segmento: "indefinido",
    personalidade: "Testando",
    mensagemInicial: "Tô só testando aqui",
    comportamento: "Só testando. Pode ser curioso ou competitor.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 71,
    tipo: "Lead Idoso",
    temperatura: 'frio',
    descricao: "Pessoa mais velha",
    segmento: "mercadinho",
    personalidade: "Dificuldade com tech",
    mensagemInicial: "Boa tarde, meu filho mandou eu falar com vocês",
    comportamento: "Não entende tech. Precisa explicar simples.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 72,
    tipo: "Lead Apressado Demais",
    temperatura: 'frio',
    descricao: "Não quer ler nada",
    segmento: "lanchonete",
    personalidade: "Sem paciência",
    mensagemInicial: "resume em 1 linha",
    comportamento: "Zero paciência. Quer tudo resumido.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 73,
    tipo: "Lead Sem WhatsApp Business",
    temperatura: 'frio',
    descricao: "Não usa WA Business",
    segmento: "loja de artesanato",
    personalidade: "Básico",
    mensagemInicial: "Funciona no WhatsApp normal ou precisa do business?",
    comportamento: "Não tem WA Business. Precisa orientar.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 74,
    tipo: "Lead Múltiplos Números",
    temperatura: 'frio',
    descricao: "Tem vários chips",
    segmento: "imobiliária grande",
    personalidade: "Complexo",
    mensagemInicial: "Tenho 4 números de WhatsApp, funciona em todos?",
    comportamento: "Situação complexa. Quer saber se atende.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 75,
    tipo: "Lead Medo de Perder Número",
    temperatura: 'frio',
    descricao: "Medo de bloqueio",
    segmento: "loja de roupas",
    personalidade: "Medroso",
    mensagemInicial: "Isso não vai fazer meu WhatsApp ser banido?",
    comportamento: "Medo de perder número. Quer garantias.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 76,
    tipo: "Lead Suporte 24h",
    temperatura: 'frio',
    descricao: "Quer suporte sempre",
    segmento: "clínica",
    personalidade: "Dependente",
    mensagemInicial: "Se der problema de madrugada, quem me ajuda?",
    comportamento: "Quer suporte 24h garantido.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 77,
    tipo: "Lead Descrente",
    temperatura: 'frio',
    descricao: "Não acredita em IA",
    segmento: "restaurante tradicional",
    personalidade: "Anti-IA",
    mensagemInicial: "Acho que IA nunca vai substituir atendimento humano",
    comportamento: "Descrente em IA. Precisa convencer com exemplos.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 78,
    tipo: "Lead Já Tem Funcionário",
    temperatura: 'frio',
    descricao: "Prefere humano",
    segmento: "loja de departamentos",
    personalidade: "Prefere humanos",
    mensagemInicial: "Já tenho atendente, pra que preciso de IA?",
    comportamento: "Não vê necessidade. Precisa mostrar valor adicional.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 79,
    tipo: "Lead Preguiçoso",
    temperatura: 'frio',
    descricao: "Não quer fazer nada",
    segmento: "loja de conveniência",
    personalidade: "Preguiçoso",
    mensagemInicial: "Parece complicado, vou ter que configurar?",
    comportamento: "Não quer trabalho. Se alguém fizer tudo, talvez.",
    metaConversao: 'implementacao'
  },
  {
    id: 80,
    tipo: "Lead Mau Humor",
    temperatura: 'frio',
    descricao: "Dia ruim",
    segmento: "pet shop",
    personalidade: "Mau humor",
    mensagemInicial: "Mais uma coisa pra me incomodar",
    comportamento: "Está de mau humor. Respostas ácidas.",
    metaConversao: 'criar_conta_gratuita'
  },

  // ═══════════════════════════════════════════════════════════════════════
  // 🎯 81-100: CENÁRIOS ESPECIAIS
  // ═══════════════════════════════════════════════════════════════════════
  {
    id: 81,
    tipo: "Lead Madrugada",
    temperatura: 'morno',
    descricao: "Mensagem às 3h da manhã",
    segmento: "bar",
    personalidade: "Noturno",
    mensagemInicial: "Oi, tô acordado aqui às 3h pensando em automatizar meu atendimento",
    comportamento: "Horário incomum. Quer resposta mesmo assim.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 82,
    tipo: "Lead Segunda-feira",
    temperatura: 'morno',
    descricao: "Início de semana, focado",
    segmento: "escritório",
    personalidade: "Produtivo início semana",
    mensagemInicial: "Bom dia! Tô organizando a semana e vi que preciso automatizar",
    comportamento: "Focado, quer resolver logo.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 83,
    tipo: "Lead Sexta-feira",
    temperatura: 'frio',
    descricao: "Fim de semana, disperso",
    segmento: "loja",
    personalidade: "Fim de semana mood",
    mensagemInicial: "Opa, to de olho nisso aí mas só depois do fds",
    comportamento: "Não quer resolver agora. Deixa pra depois.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 84,
    tipo: "Lead Férias",
    temperatura: 'morno',
    descricao: "Quer automatizar pras férias",
    segmento: "consultório",
    personalidade: "Planejando férias",
    mensagemInicial: "Vou tirar férias e preciso de algo pra responder enquanto eu não tiver",
    comportamento: "Motivação clara. Se funcionar, fecha.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 85,
    tipo: "Lead Doença",
    temperatura: 'quente',
    descricao: "Vai se afastar por saúde",
    segmento: "clínica",
    personalidade: "Situação delicada",
    mensagemInicial: "Vou precisar me afastar por motivo de saúde, preciso de algo pra continuar atendendo",
    comportamento: "Situação séria. Precisa de solução rápida.",
    metaConversao: 'implementacao'
  },
  {
    id: 86,
    tipo: "Lead Parceria",
    temperatura: 'morno',
    descricao: "Quer ser revendedor",
    segmento: "agência",
    personalidade: "Quer parceria",
    mensagemInicial: "Vocês tem programa de parceria? Quero revender",
    comportamento: "Quer ser parceiro. Diferente de cliente normal.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 87,
    tipo: "Lead Influencer",
    temperatura: 'morno',
    descricao: "Quer trocar por divulgação",
    segmento: "marketing pessoal",
    personalidade: "Influenciador",
    mensagemInicial: "Tenho 100k seguidores, trocam por divulgação?",
    comportamento: "Quer gratuito em troca de exposure.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 88,
    tipo: "Lead ONG",
    temperatura: 'morno',
    descricao: "Organização sem fins lucrativos",
    segmento: "ONG",
    personalidade: "Causa social",
    mensagemInicial: "Somos uma ONG, tem desconto especial?",
    comportamento: "Orçamento limitado. Quer desconto social.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 89,
    tipo: "Lead Estudante",
    temperatura: 'frio',
    descricao: "Estudando o mercado",
    segmento: "acadêmico",
    personalidade: "Estudante curioso",
    mensagemInicial: "Sou estudante de marketing, tô pesquisando sobre IA pra um trabalho",
    comportamento: "Só pesquisando. Provavelmente não vai comprar.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 90,
    tipo: "Lead Jornalista",
    temperatura: 'morno',
    descricao: "Fazendo matéria",
    segmento: "mídia",
    personalidade: "Jornalista",
    mensagemInicial: "Sou jornalista e tô fazendo uma matéria sobre IA no atendimento",
    comportamento: "Quer informações. Pode gerar exposição.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 91,
    tipo: "Lead Governo",
    temperatura: 'morno',
    descricao: "Setor público",
    segmento: "prefeitura",
    personalidade: "Burocrático",
    mensagemInicial: "Somos da secretaria de comunicação, buscamos solução para atendimento ao cidadão",
    comportamento: "Processo lento. Burocrático.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 92,
    tipo: "Lead Igreja",
    temperatura: 'morno',
    descricao: "Instituição religiosa",
    segmento: "igreja",
    personalidade: "Religioso, formal",
    mensagemInicial: "Boa tarde, somos uma igreja e gostaríamos de automatizar comunicação com os fiéis",
    comportamento: "Formal. Orçamento limitado.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 93,
    tipo: "Lead Político",
    temperatura: 'quente',
    descricao: "Em período eleitoral",
    segmento: "campanha política",
    personalidade: "Urgente, campanha",
    mensagemInicial: "Tô em campanha e preciso responder milhares de mensagens",
    comportamento: "Urgência. Alto volume. Paga se resolver.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 94,
    tipo: "Lead Internacional",
    temperatura: 'morno',
    descricao: "Fora do Brasil",
    segmento: "e-commerce global",
    personalidade: "Internacional",
    mensagemInicial: "Hi, I'm from Portugal, do you support multiple languages?",
    comportamento: "Internacional. Quer saber de idiomas.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 95,
    tipo: "Lead Deficiente Visual",
    temperatura: 'morno',
    descricao: "Usa leitor de tela",
    segmento: "serviços",
    personalidade: "Acessibilidade",
    mensagemInicial: "Olá, uso leitor de tela. O sistema de vocês é acessível?",
    comportamento: "Precisa de acessibilidade.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 96,
    tipo: "Lead Surdo",
    temperatura: 'quente',
    descricao: "Comunicação só por texto",
    segmento: "freelancer",
    personalidade: "Só texto",
    mensagemInicial: "Sou surdo e preciso de atendimento automático porque não consigo atender ligação",
    comportamento: "Caso de uso perfeito. Se funcionar, fecha.",
    metaConversao: 'assinar_plano'
  },
  {
    id: 97,
    tipo: "Lead Casal",
    temperatura: 'morno',
    descricao: "Negócio de casal",
    segmento: "loja de casal",
    personalidade: "Decisão conjunta",
    mensagemInicial: "Oi, eu e meu marido temos uma loja e queremos saber mais",
    comportamento: "Precisam decidir juntos.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 98,
    tipo: "Lead Aposentado",
    temperatura: 'morno',
    descricao: "Começando negócio na aposentadoria",
    segmento: "artesanato",
    personalidade: "Aposentado empreendedor",
    mensagemInicial: "Oi, me aposentei e tô começando um negócio, vi que vocês podem ajudar",
    comportamento: "Paciência necessária. Novo em tech.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 99,
    tipo: "Lead Adolescente",
    temperatura: 'quente',
    descricao: "Jovem empreendedor",
    segmento: "loja online",
    personalidade: "Jovem, digital native",
    mensagemInicial: "eae mano, vi q vcs fazem ia pro zap, quanto custa?",
    comportamento: "Jovem. Linguagem informal. Decisão rápida.",
    metaConversao: 'criar_conta_gratuita'
  },
  {
    id: 100,
    tipo: "Lead Teste Final",
    temperatura: 'quente',
    descricao: "Cliente ideal",
    segmento: "loja de sucesso",
    personalidade: "Perfeito",
    mensagemInicial: "Olá! Vi o anúncio, tenho interesse, como funciona e quanto custa?",
    comportamento: "Cliente ideal. Interessado, pergunta certo, decide rápido.",
    metaConversao: 'assinar_plano'
  }
];

export function getPerfilById(id: number): PerfilCliente | undefined {
  return PERFIS_CLIENTES_100.find(p => p.id === id);
}

export function getPerfisByTemperatura(temp: 'frio' | 'morno' | 'quente'): PerfilCliente[] {
  return PERFIS_CLIENTES_100.filter(p => p.temperatura === temp);
}
