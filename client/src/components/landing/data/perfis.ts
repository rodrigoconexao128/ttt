export interface Perfil {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  cor: string;
  avatar?: string;
  foto?: string;
  exemplos: string[];
}

export const perfisData: Perfil[] = [
  {
    id: "negocios-locais",
    titulo: "Negócios Locais",
    descricao: "Clínicas, salões, restaurantes, academias",
    icone: "🏪",
    cor: "from-blue-500 to-blue-600",
    avatar: "👩‍⚕️",
    foto: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&h=150&fit=crop&crop=face&auto=format",
    exemplos: [
      "Automatize agendamentos, confirmações e lembretes",
      "Reduza não comparecimento em 40%",
      "Atenda clientes 24/7 sem esforço manual"
    ]
  },
  {
    id: "prestadores-servico",
    titulo: "Prestadores de Serviço & Consultorias",
    descricao: "Consultores, coaches, profissionais liberais",
    icone: "💼",
    cor: "from-purple-500 to-purple-600", 
    avatar: "👨‍💼",
    foto: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&h=150&fit=crop&crop=face&auto=format",
    exemplos: [
      "Deixe a IA qualificar leads e agendar chamadas",
      "Foque em atendimentos de alto valor",
      "Converta prospects automaticamente"
    ]
  },
  {
    id: "infoprodutores",
    titulo: "Infoprodutores e Vendas Online",
    descricao: "Cursos digitais, ebooks, mentorias",
    icone: "💻",
    cor: "from-pink-500 to-pink-600",
    avatar: "👩‍💻",
    foto: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=150&h=150&fit=crop&crop=face&auto=format",
    exemplos: [
      "Fluxos prontos de lançamento, funil e recuperação",
      "Venda enquanto dorme com automação",
      "Segmentação avançada de leads"
    ]
  },
  {
    id: "times-comerciais",
    titulo: "Times Comerciais B2B",
    descricao: "Equipes de vendas, SDRs, closers",
    icone: "🏢",
    cor: "from-green-500 to-green-600",
    avatar: "👥‍👥‍👥",
    foto: "https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&h=150&fit=crop&crop=face&auto=format",
    exemplos: [
      "WhatsApp + CRM + funil com toda a equipe no mesmo lugar",
      "Gestão unificada de leads e oportunidades",
      "Métricas em tempo real para tomada de decisão"
    ]
  }
];
