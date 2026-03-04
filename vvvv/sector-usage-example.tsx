/**
 * Exemplo de Uso da Estrutura de Setores
 * Fase 4.4 - Setores e Roteamento
 */

import {
  routeToIntention,
  generateAttendanceReport,
  getSystemStats,
  updateMemberAvailability,
  getSectorMembers,
  SECTORS,
  SECTOR_MEMBERS
} from './admin-sectors';
import { ReportData } from './types';

/**
 * Exemplo 1: Rotear uma mensagem para o setor correto
 */
export function exampleRouteMessage() {
  const messages = [
    'Quero pagar minha fatura vencida',
    'Estou com problemas para fazer login no sistema',
    'Quero saber o preço do plano premium',
    'Meu boleto venceu e não consigo pagar',
    'Estou tendo erro 500 no sistema'
  ];

  messages.forEach(message => {
    console.log('\n--- Mensagem: ---');
    console.log(message);
    console.log('\n--- Roteamento: ---');

    const result = routeToIntention(message);

    if (result.success) {
      console.log(`✅ Setor: ${result.sector?.name}`);
      console.log(`👤 Membro: ${result.member?.name}`);
      console.log(`📧 Email: ${result.routingDetails?.memberEmail}`);
      console.log(`🎯 Palavras-chave: ${result.matchedKeywords?.join(', ')}`);
    } else {
      console.log(`❌ ${result.message}`);
    }
  });
}

/**
 * Exemplo 2: Gerar relatório de atendimento
 */
export function exampleGenerateReport() {
  console.log('\n--- Relatório Diário de Atendimento ---\n');

  const report: ReportData = generateAttendanceReport('daily');

  console.log(`📅 Período: ${report.startDate.split('T')[0]} até ${report.endDate.split('T')[0]}`);
  console.log(`📊 Total de atendimentos: ${report.totalAttendances}\n`);

  console.log('🏢 Estatísticas por Setor:\n');

  Object.keys(report.sectorStats).forEach(sectorId => {
    const stat = report.sectorStats[sectorId];
    console.log(`  ${stat.sector}:`);
    console.log(`    - Membros: ${stat.totalMembers} (ativos: ${stat.activeMembers})`);
    console.log(`    - Atendimentos: ${stat.totalAttendances}`);
    console.log(`    - Satisfação: ${stat.satisfactionRate}`);
    console.log(`    - Palavras-chave: ${stat.topKeywords.join(', ')}\n`);
  });

  console.log(`✅ Satisfação Geral: ${report.overallSatisfaction}\n`);

  console.log('💡 Recomendações:\n');
  report.recommendations.forEach(rec => {
    console.log(`  • ${rec}`);
  });
}

/**
 * Exemplo 3: Verificar estatísticas do sistema
 */
export function exampleGetSystemStats() {
  const stats = getSystemStats();

  console.log('\n--- Estatísticas do Sistema ---\n');
  console.log(`🏢 Setores: ${stats.totalSetors}`);
  console.log(`👥 Membros Totais: ${stats.totalMembers}`);
  console.log(`✅ Membros Ativos: ${stats.totalActiveMembers}`);
  console.log(`📈 Cobertura: ${stats.coverageRate}`);
  console.log(`📱 Atendimentos Hoje: ${stats.totalAttendancesToday}\n`);
}

/**
 * Exemplo 4: Atualizar disponibilidade de membro
 */
export function exampleUpdateAvailability() {
  console.log('\n--- Atualizar Disponibilidade ---\n');

  // Simular que um membro está indo para almoço
  updateMemberAvailability('MEM-SUP-001', false);
  console.log('❌ Carlos Oliveira agora está offline (almoço)');

  // Simular que voltou do almoço
  updateMemberAvailability('MEM-SUP-001', true);
  console.log('✅ Carlos Oliveira agora está online');

  const members = getSectorMembers('SUPORTE');
  console.log(`\nMembros disponíveis no Suporte: ${members.filter(m => m.availability).length}/${members.length}`);
}

/**
 * Exemplo 5: Consultar membros de um setor específico
 */
export function exampleGetSectorMembers() {
  console.log('\n--- Membros do Setor Financeiro ---\n');

  const members = getSectorMembers('FINANCEIRO');

  members.forEach(member => {
    console.log(`👤 ${member.name}`);
    console.log(`   ID: ${member.id}`);
    console.log(`   Status: ${member.status}`);
    console.log(`   Disponível: ${member.availability ? '✅' : '❌'}`);
    console.log(`   Skills: ${member.skillTags.join(', ')}`);
    console.log(`   Email: ${member.email}`);
    console.log('');
  });
}

/**
 * Exemplo 6: Exemplo de fallback (setor sem membro ativo)
 */
export function exampleFallback() {
  console.log('\n--- Teste de Fallback ---\n');

  // Simular que todos os membros do setor estão offline
  updateMemberAvailability('MEM-FIN-001', false);
  updateMemberAvailability('MEM-FIN-002', false);
  updateMemberAvailability('MEM-FIN-003', false);

  const result = routeToIntention('Quero pagar minha fatura');

  if (!result.success && result.fallback) {
    console.log('❌ Fallback acionado!');
    console.log(`Motivo: ${result.reason}`);
    console.log(`Mensagem: ${result.message}`);
  }
}

/**
 * Exemplo 7: Roteamento complexo com contexto
 */
export function exampleWithContext() {
  console.log('\n--- Roteamento com Contexto ---\n');

  const messagesWithContext = [
    {
      message: 'preciso de ajuda',
      context: { intent: 'financeiro' }
    },
    {
      message: 'estou com problema',
      context: { intent: 'tecnico' }
    }
  ];

  messagesWithContext.forEach(({ message, context }) => {
    console.log(`\nMensagem: "${message}"`);
    console.log(`Contexto: ${JSON.stringify(context)}`);

    const result = routeToIntention(message, context);

    if (result.success) {
      console.log(`✅ Roteado para: ${result.sector?.name}`);
    } else {
      console.log(`❌ ${result.message}`);
    }
  });
}

/**
 * Função principal para executar todos os exemplos
 */
export function runAllExamples() {
  console.log('='.repeat(60));
  console.log('EXEMPLOS DE USO - SETORES E ROTEAMENTO');
  console.log('='.repeat(60));

  exampleRouteMessage();
  exampleGetSectorMembers();
  exampleGenerateReport();
  exampleGetSystemStats();
  exampleUpdateAvailability();
  exampleFallback();
  exampleWithContext();

  console.log('\n' + '='.repeat(60));
  console.log('Todos os exemplos foram executados!');
  console.log('='.repeat(60) + '\n');
}

// Se este arquivo for executado diretamente
if (require.main === module) {
  runAllExamples();
}

export { runAllExamples };
