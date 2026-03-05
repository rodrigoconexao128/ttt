export interface Testimonial {
  id: string;
  nome: string;
  negocio: string;
  foto: string;
  cargo?: string;
  cidade?: string;
  depoimento: string;
  resultado?: string;
  antes?: string;
  depois?: string;
}

export const testimonialsData: Testimonial[] = [
  {
    id: "maria-clinica",
    nome: "Maria Santos",
    negocio: "Clínica de Estética",
    foto: "👩‍⚕️",
    cargo: "Dona",
    cidade: "São Paulo",
    depoimento: "A IA da plataforma revolucionou meu atendimento. Antes eu perdia 2h por dia respondendo WhatsApp. Hoje a IA agenda 80% dos clientes sozinha e eu só me preocupo com o atendimento presencial. Cresci 40% em faturamento!",
    resultado: "+40% faturamento",
    antes: "2h/dia respondendo WhatsApp",
    depois: "IA agenda 80% automaticamente"
  },
  {
    id: "joao-salao",
    nome: "João Silva",
    negocio: "Salão de Beleza",
    foto: "👨‍🎨",
    cargo: "Proprietário",
    cidade: "Rio de Janeiro",
    depoimento: "Com a automação, reduziu não comparecimento em 60%. A IA confirma agendamentos automaticamente e lembra os clientes. Consegui atender mais clientes no mesmo tempo, sem contratar secretária. Melhor investimento do ano!",
    resultado: "-60% não comparecimento",
    antes: "Alta taxa de não comparecimento",
    depois: "Confirmações automáticas + lembretes"
  },
  {
    id: "ana-consultoria",
    nome: "Ana Costa",
    negocio: "Consultoria de Marketing",
    foto: "👩‍💼",
    cargo: "Sócia",
    cidade: "Belo Horizonte",
    depoimento: "Como consultora, tempo é dinheiro. A IA qualifica meus leads 24/7 e só me avisa quando tem um prospect qualificado. Fechei 3 vendas enquanto dormia na primeira semana. Increível!",
    resultado: "+3 vendas na primeira semana",
    antes: "Perdia tempo com leads não qualificados",
    depois: "Só recebe prospects qualificados"
  }
];
