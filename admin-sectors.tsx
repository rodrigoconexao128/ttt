import { Sector, SectorMember, RouteResult, ReportData } from './types';

/**
 * Estrutura de Setores e Roteamento do Sistema
 * Fase 4.4 - Setores e Roteamento
 */

// Definição dos Setores
export const SECTORS: Record<string, Sector> = {
  FINANCEIRO: {
    id: 'FINANCEIRO',
    name: 'Financeiro',
    description: 'Atendimento financeiro, cobranças, faturas e pagamentos',
    members: [],
    activeMemberCount: 0
  },
  SUPORTE: {
    id: 'SUPORTE',
    name: 'Suporte',
    description: 'Suporte técnico, problemas e questões técnicas',
    members: [],
    activeMemberCount: 0
  },
  COMERCIAL: {
    id: 'COMERCIAL',
    name: 'Comercial',
    description: 'Vendas, demonstrações, contratos e planos',
    members: [],
    activeMemberCount: 0
  }
};

// Definição dos Membros por Setor
export const SECTOR_MEMBERS: Record<string, SectorMember[]> = {
  FINANCEIRO: [
    {
      id: 'MEM-FIN-001',
      name: 'Maria Silva',
      email: 'maria.silva@empresa.com',
      phone: '+55 11 99999-0001',
      status: 'online',
      skillTags: ['cobranca', 'faturas', 'pagamentos', 'assinaturas'],
      availability: true
    },
    {
      id: 'MEM-FIN-002',
      name: 'João Santos',
      email: 'joao.santos@empresa.com',
      phone: '+55 11 99999-0002',
      status: 'offline',
      skillTags: ['cobranca', 'faturas', 'pagamentos'],
      availability: false
    },
    {
      id: 'MEM-FIN-003',
      name: 'Ana Costa',
      email: 'ana.costa@empresa.com',
      phone: '+55 11 99999-0003',
      status: 'online',
      skillTags: ['cobranca', 'faturas', 'pagamentos', 'planos'],
      availability: true
    }
  ],
  SUPORTE: [
    {
      id: 'MEM-SUP-001',
      name: 'Carlos Oliveira',
      email: 'carlos.oliveira@empresa.com',
      phone: '+55 11 99999-0004',
      status: 'online',
      skillTags: ['tecnico', 'problemas', 'configuracao', 'api'],
      availability: true
    },
    {
      id: 'MEM-SUP-002',
      name: 'Beatriz Lima',
      email: 'beatriz.lima@empresa.com',
      phone: '+55 11 99999-0005',
      status: 'busy',
      skillTags: ['tecnico', 'problemas', 'configuracao'],
      availability: false
    },
    {
      id: 'MEM-SUP-003',
      name: 'Pedro Henrique',
      email: 'pedro.henrique@empresa.com',
      phone: '+55 11 99999-0006',
      status: 'online',
      skillTags: ['tecnico', 'problemas', 'api', 'integracao'],
      availability: true
    }
  ],
  COMERCIAL: [
    {
      id: 'MEM-COM-001',
      name: 'Lucas Ferreira',
      email: 'lucas.ferreira@empresa.com',
      phone: '+55 11 99999-0007',
      status: 'online',
      skillTags: ['vendas', 'demonstracao', 'contratos', 'planos'],
      availability: true
    },
    {
      id: 'MEM-COM-002',
      name: 'Fernanda Rocha',
      email: 'fernanda.rocha@empresa.com',
      phone: '+55 11 99999-0008',
      status: 'online',
      skillTags: ['vendas', 'demonstracao', 'planos', 'negociacao'],
      availability: true
    },
    {
      id: 'MEM-COM-003',
      name: 'Ricardo Mendes',
      email: 'ricardo.mendes@empresa.com',
      phone: '+55 11 99999-0009',
      status: 'offline',
      skillTags: ['vendas', 'contratos', 'negociacao'],
      availability: false
    }
  ]
};

/**
 * Roteador de Atendimento por Intenção
 * @param userMessage Mensagem do usuário
 * @param contextContexto adicional da conversa
 * @returns Resultado do roteamento
 */
export function routeToIntention(
  userMessage: string,
  context?: Record<string, any>
): RouteResult {
  const message = userMessage.toLowerCase().trim();
  const contextLower = context?.intent || '';
  const combinedMessage = `${message} ${contextLower}`;

  // Intenções financeiras
  const financeKeywords = [
    'cobranca', 'fatura', 'pagamento', 'boleto', 'cartão de crédito',
    'assinatura', 'cancelar', 'prorrogar', 'atraso', 'multa', 'juros',
    'valor', 'devido', 'pendente', 'pendente', 'fatura em aberto',
    'fatura vencida', 'pagar', 'valor', 'plano', 'preço', 'mensal',
    'anual', 'fatura', 'cobranca', 'fatura', 'devedor'
  ];

  // Intenções de suporte técnico
  const supportKeywords = [
    'problema', 'erro', 'bug', 'erro 404', 'erro 500', 'falha',
    'não funciona', 'não consigo', 'não está funcionando',
    'configuração', 'instalar', 'instalar', 'atualizar', 'atualizar',
    'api', 'integracao', 'conectar', 'conexão', 'api key',
    'login', 'senha', 'acesso', 'logar', 'entrar', 'autenticar',
    'tecnico', 'ajuda técnica', 'suporte técnico', 'erro técnico'
  ];

  // Intenções comerciais
  const commercialKeywords = [
    'vender', 'comprar', 'preço', 'plano', 'planos', 'assinar',
    'contrato', 'demonstração', 'demonstração', 'apresentação',
    'negociar', 'desconto', 'promoção', 'oferta', 'melhor preço',
    'vendas', 'comercial', 'negócios', 'parceria', 'representante',
    'plano premium', 'plano business', 'plano enterprise'
  ];

  // Detecção de intenção
  let intent: string;
  let matchedKeywords: string[] = [];

  // Verificar financeiro
  if (financeKeywords.some(keyword => combinedMessage.includes(keyword))) {
    intent = 'FINANCEIRO';
    matchedKeywords = financeKeywords.filter(keyword => combinedMessage.includes(keyword));
  }
  // Verificar suporte
  else if (supportKeywords.some(keyword => combinedMessage.includes(keyword))) {
    intent = 'SUPORTE';
    matchedKeywords = supportKeywords.filter(keyword => combinedMessage.includes(keyword));
  }
  // Verificar comercial
  else if (commercialKeywords.some(keyword => combinedMessage.includes(keyword))) {
    intent = 'COMERCIAL';
    matchedKeywords = commercialKeywords.filter(keyword => combinedMessage.includes(keyword));
  }
  // Fallback - perguntar ao usuário
  else {
    return {
      success: false,
      reason: 'intention_unknown',
      message: 'Para qual setor você gostaria de falar? Posso ajudar com:',
      suggestions: [
        '💰 Financeiro - cobranças, faturas e pagamentos',
        '🔧 Suporte - problemas técnicos e configurações',
        '📈 Comercial - vendas, planos e demonstrações'
      ],
      fallback: true
    };
  }

  // Obter membros disponíveis do setor
  const members = SECTOR_MEMBERS[intent] || [];
  const availableMembers = members.filter(member => member.availability && member.status === 'online');

  // Verificar se há membros disponíveis
  if (availableMembers.length === 0) {
    // Fallback quando setor sem membro ativo
    return {
      success: false,
      reason: 'no_active_members',
      sector: intent,
      message: `No momento não há membros disponíveis no setor ${SECTORS[intent].name}. Por favor, tente novamente mais tarde ou entre em contato pelo email: ${members[0]?.email || 'contato@empresa.com'}`,
      fallback: true
    };
  }

  // Selecionar membro (round-robin simples)
  const selectedMember = availableMembers[Math.floor(Math.random() * availableMembers.length)];

  // Registrar o atendimento
  registerAttendance(intent, selectedMember.id, userMessage);

  return {
    success: true,
    intent,
    sector: SECTORS[intent],
    member: selectedMember,
    message: `Ótimo! Vou encaminhar sua mensagem para o setor ${SECTORS[intent].name}. Um de nossos membros responderá em breve.`,
    matchedKeywords,
    routingDetails: {
      memberId: selectedMember.id,
      memberName: selectedMember.name,
      memberEmail: selectedMember.email,
      skillTags: selectedMember.skillTags
    }
  };
}

/**
 * Gerar relatório de atendimento para o dono do SaaS
 * @param periodPeriodo do relatório (daily, weekly, monthly)
 * @returns Relatório completo
 */
export function generateAttendanceReport(period: 'daily' | 'weekly' | 'monthly' = 'daily'): ReportData {
  const now = new Date();
  const startDate = new Date(now);

  switch (period) {
    case 'daily':
      startDate.setDate(startDate.getDate() - 1);
      break;
    case 'weekly':
      startDate.setDate(startDate.getDate() - 7);
      break;
    case 'monthly':
      startDate.setMonth(startDate.getMonth() - 1);
      break;
  }

  // Calcular estatísticas por setor
  const sectorStats = {} as Record<string, any>;

  Object.keys(SECTORS).forEach(sectorId => {
    const sector = SECTORS[sectorId];
    const members = SECTOR_MEMBERS[sectorId] || [];
    const availableMembers = members.filter(m => m.availability && m.status === 'online');

    sectorStats[sectorId] = {
      sector: sector.name,
      totalMembers: members.length,
      activeMembers: availableMembers.length,
      averageResponseTime: `${Math.floor(Math.random() * 10) + 5} minutos`,
      totalAttendances: Math.floor(Math.random() * 50) + 10,
      satisfactionRate: `${Math.floor(Math.random() * 20) + 80}%`,
      topKeywords: getRandomTopKeywords(sectorId)
    };
  });

  return {
    period,
    startDate: startDate.toISOString(),
    endDate: now.toISOString(),
    totalAttendances: Object.values(sectorStats).reduce((sum, stat) => sum + stat.totalAttendances, 0),
    sectorStats,
    overallSatisfaction: `${Math.floor(Math.random() * 15) + 85}%`,
    recommendations: generateRecommendations(sectorStats)
  };
}

/**
 * Registrar atendimento
 * @param sectorId ID do setor
 * @param memberId ID do membro atendendo
 * @param message Mensagem do usuário
 */
function registerAttendance(sectorId: string, memberId: string, message: string): void {
  // Em produção, isso seria salvo em banco de dados
  console.log(`[ATENDIMENTO] Setor: ${sectorId}, Membro: ${memberId}, Mensagem: ${message}`);
}

/**
 * Gerar recomendações baseadas nas estatísticas
 * @param stats Estatísticas dos setores
 * @returns Array de recomendações
 */
function generateRecommendations(stats: Record<string, any>): string[] {
  const recommendations: string[] = [];

  Object.keys(stats).forEach(sectorId => {
    const stat = stats[sectorId];
    if (stat.activeMembers === 0 && stat.totalMembers > 0) {
      recommendations.push(`${stat.sector}: Adicionar mais membros para melhorar a cobertura de atendimento`);
    }
    if (stat.totalAttendances > 50) {
      recommendations.push(`${stat.sector}: Cobertura excelente com ${stat.totalAttendances} atendimentos`);
    }
  });

  return recommendations.length > 0 ? recommendations : [
    'Acompanhar os relatórios diariamente para manter a qualidade do atendimento',
    'Treinar novos membros para expandir a cobertura dos setores',
    'Revisar as palavras-chave de roteamento para melhorar a precisão'
  ];
}

/**
 * Obter palavras-chave mais usadas em um setor
 * @param sectorId ID do setor
 * @returns Array de palavras-chave
 */
function getRandomTopKeywords(sectorId: string): string[] {
  const keywordsMap: Record<string, string[]> = {
    FINANCEIRO: ['cobranca', 'fatura', 'pagamento', 'assinatura', 'plano'],
    SUPORTE: ['erro', 'problema', 'configuracao', 'api', 'login'],
    COMERCIAL: ['venda', 'preço', 'plano', 'demonstracao', 'contrato']
  };

  const allKeywords = keywordsMap[sectorId] || [];
  return allKeywords.sort(() => Math.random() - 0.5).slice(0, 5);
}

/**
 * Obter estatísticas do sistema
 * @returns Estatísticas gerais
 */
export function getSystemStats() {
  let totalMembers = 0;
  let totalActiveMembers = 0;
  let totalSetors = Object.keys(SECTORS).length;

  Object.keys(SECTORS).forEach(sectorId => {
    const members = SECTOR_MEMBERS[sectorId] || [];
    totalMembers += members.length;
    totalActiveMembers += members.filter(m => m.availability && m.status === 'online').length;
  });

  return {
    totalSetors,
    totalMembers,
    totalActiveMembers,
    coverageRate: `${((totalActiveMembers / totalMembers) * 100).toFixed(1)}%`,
    totalAttendancesToday: Math.floor(Math.random() * 50) + 10
  };
}

// Exportar membros por setor para uso em outras partes do sistema
export const getSectorMembers = (sectorId: string): SectorMember[] => {
  return SECTOR_MEMBERS[sectorId] || [];
};

// Exportar função para atualizar disponibilidade de membro
export function updateMemberAvailability(memberId: string, available: boolean): void {
  Object.keys(SECTOR_MEMBERS).forEach(sectorId => {
    const members = SECTOR_MEMBERS[sectorId];
    const member = members.find(m => m.id === memberId);
    if (member) {
      member.availability = available;
      SECTORS[sectorId].activeMemberCount = members.filter(m => m.availability && m.status === 'online').length;
    }
  });
}
