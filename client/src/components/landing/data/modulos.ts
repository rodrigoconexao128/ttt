export interface Modulo {
  id: string;
  titulo: string;
  descricao: string;
  icone: string;
  cor: string;
  detalhes?: string[];
}

export const modulosData: Modulo[] = [
  {
    id: "ia-whatsapp",
    titulo: "IA no WhatsApp",
    descricao: "Respostas automáticas 24/7 com IA treinada no seu negócio",
    icone: "🤖",
    cor: "from-info to-info-600",
    detalhes: [
      "Atendimento automático 24/7 com agente de IA conectado",
      "Uso de contexto das últimas mensagens para respostas inteligentes",
      "Ativação por contato/conversa (override por conversa específica)",
      "Painel de histórico de respostas da IA",
      "Configuração de prompts personalizados por usuário"
    ]
  },
  {
    id: "crm-funil",
    titulo: "CRM & Funil de Vendas",
    descricao: "Kanban visual, qualificação de leads e métricas por etapa",
    icone: "📊",
    cor: "from-success to-success-600",
    detalhes: [
      "Kanban visual com etapas personalizáveis",
      "Qualificação de leads com IA (score, tags, oportunidades)",
      "Histórico de interações centralizado por contato",
      "Métricas por etapa (quantos estão em cada fase, conversão)",
      "Drag and drop para mover leads entre etapas"
    ]
  },
  {
    id: "marketing-massa",
    titulo: "Marketing & Envios em Massa",
    descricao: "Campanhas, listas segmentadas e personalização com variáveis",
    icone: "📢",
    cor: "from-warning to-warning-600",
    detalhes: [
      "Importação de contatos via CSV",
      "Segmentação por tags e filtros",
      "Personalização com variáveis (nome, produto, etc.)",
      "Agendamento de envios e campanhas sequenciais",
      "Métricas por campanha (envios, respostas, conversão)"
    ]
  },
  {
    id: "agenda-reservas",
    titulo: "Agenda & Reservas",
    descricao: "Agendamentos, confirmações e lembretes por WhatsApp",
    icone: "📅",
    cor: "from-purple-500 to-purple-600",
    detalhes: [
      "Sistema de agendamentos integrado ao WhatsApp",
      "Confirmações automáticas via mensagem",
      "Lembretes antes do horário",
      "Gestão de capacidade, reagendamentos e cancelamentos",
      "Sincronização com calendários externos"
    ]
  },
  {
    id: "assinaturas-pagamentos",
    titulo: "Assinaturas & Pagamentos",
    descricao: "Planos, cobranças recorrentes e PIX integrado",
    icone: "💳",
    cor: "from-pink-500 to-pink-600",
    detalhes: [
      "Planos configuráveis (limites, periodicidade, status)",
      "Pagamentos via PIX com QR Code e copia-e-cola",
      "Status de assinatura (pending, active, expired, cancelled)",
      "Upgrade/downgrade de planos com controle em painel admin",
      "Notificações automáticas de vencimento"
    ]
  },
  {
    id: "admin-seguranca",
    titulo: "Admin & Segurança",
    descricao: "Dashboard, gestão de usuários, limitações e monitoramento",
    icone: "🔒",
    cor: "from-red-500 to-red-600",
    detalhes: [
      "Dashboard geral (usuários, receita, assinaturas, sessões)",
      "Gestão de usuários e permissões",
      "Aprovação manual de pagamentos",
      "Rate limiting, logs, backups e monitoramento de erros",
      "Autenticação de dois fatores e sessões seguras"
    ]
  }
];
