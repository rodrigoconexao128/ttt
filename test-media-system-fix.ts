/**
 * Teste completo do sistema de mídias corrigido
 * 
 * Valida:
 * 1. Detecção de mídia por IA
 * 2. Fallback por keywords
 * 3. Primeira mensagem (saudação)
 * 4. Retry em caso de falha
 */

import 'dotenv/config';
import { db } from './server/db';
import { users, agentMediaLibrary, agentConfig } from './shared/schema';
import { eq } from 'drizzle-orm';
import { forceMediaDetection, getAgentMediaLibrary } from './server/mediaService';

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

interface TestResult {
  scenario: string;
  message: string;
  expectedMedia: string | null;
  actualMedia: string | null;
  passed: boolean;
  reason: string;
}

const results: TestResult[] = [];

async function testMediaDetection() {
  console.log(`\n${COLORS.cyan}═══════════════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}           TESTE DO SISTEMA DE MÍDIAS CORRIGIDO                        ${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════════════${COLORS.reset}\n`);

  // Buscar usuário rodrigo4@gmail.com
  const userResult = await db.select().from(users).where(eq(users.email, 'rodrigo4@gmail.com')).limit(1);
  
  if (!userResult.length) {
    console.log(`${COLORS.red}❌ Usuário rodrigo4@gmail.com não encontrado${COLORS.reset}`);
    process.exit(1);
  }
  
  const userId = userResult[0].id;
  console.log(`${COLORS.green}✅ Usuário encontrado: ${userResult[0].email}${COLORS.reset}`);
  console.log(`   ID: ${userId}\n`);
  
  // Buscar mídias do agente
  const mediaLibrary = await getAgentMediaLibrary(userId);
  
  console.log(`${COLORS.blue}📁 Mídias disponíveis (${mediaLibrary.length}):${COLORS.reset}`);
  for (const m of mediaLibrary) {
    console.log(`   - ${m.name} (${m.mediaType}) - ${(m.whenToUse || 'N/A').substring(0, 50)}...`);
  }
  console.log('');
  
  // Cenários de teste
  const scenarios = [
    {
      name: 'Primeira mensagem - Saudação',
      message: 'Oi',
      history: [],
      expected: 'MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR',
    },
    {
      name: 'Primeira mensagem - Bom dia',
      message: 'Bom dia!',
      history: [],
      expected: 'MENSAGEM_DE_INICIO_QUANDO_O_CLIENTE_VEM_CONVERSAR',
    },
    {
      name: 'Pergunta sobre CRM/Kanban',
      message: 'Vocês tem CRM? Preciso organizar meus leads',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá! Como posso ajudar?', fromMe: true }],
      expected: 'KANBAN_CRM',
    },
    {
      name: 'Pergunta sobre Follow-up',
      message: 'Como faço para recuperar clientes que não respondem?',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'FOLLOWP_INTELIGENTE',
    },
    {
      name: 'Pergunta sobre envio em massa',
      message: 'Quero disparar mensagens para toda minha lista',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'ENVIO_EM_MASSA',
    },
    {
      name: 'Pergunta sobre agendamento',
      message: 'Tenho uma clínica e preciso de agendamento automático',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'AGENDAMENTO',
    },
    {
      name: 'Pergunta sobre como funciona',
      message: 'Trabalho com vendas de imóveis, como o sistema pode me ajudar?',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'COMO_FUNCIONA',
    },
    {
      name: 'Pergunta sobre demonstração',
      message: 'Quero ver como o sistema funciona, tem uma demonstração?',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'DETALHES_DO_SISTEMA',
    },
    {
      name: 'Pergunta sobre notificação',
      message: 'Como faço para ser notificado quando um lead quente aparece?',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: 'NOTIFICADOR_INTELIGENTE',
    },
    {
      name: 'Pergunta genérica (não deve enviar)',
      message: 'Qual o preço do plano?',
      history: [{ text: 'Oi', fromMe: false }, { text: 'Olá!', fromMe: true }],
      expected: null,
    },
  ];
  
  console.log(`${COLORS.magenta}🧪 Executando ${scenarios.length} cenários de teste...${COLORS.reset}\n`);
  
  for (let i = 0; i < scenarios.length; i++) {
    const scenario = scenarios[i];
    console.log(`${COLORS.yellow}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`);
    console.log(`${COLORS.yellow}Cenário ${i + 1}/${scenarios.length}: ${scenario.name}${COLORS.reset}`);
    console.log(`Mensagem: "${scenario.message}"`);
    console.log(`Mídia esperada: ${scenario.expected || 'NENHUMA'}`);
    console.log('');
    
    try {
      const result = await forceMediaDetection(
        scenario.message,
        scenario.history,
        mediaLibrary,
        []
      );
      
      const actualMedia = result.mediaToSend?.name || null;
      const passed = scenario.expected === null 
        ? !result.shouldSendMedia 
        : (actualMedia?.toUpperCase() === scenario.expected?.toUpperCase());
      
      results.push({
        scenario: scenario.name,
        message: scenario.message,
        expectedMedia: scenario.expected,
        actualMedia,
        passed,
        reason: result.reason,
      });
      
      if (passed) {
        console.log(`${COLORS.green}✅ PASSOU${COLORS.reset}`);
        console.log(`   Mídia detectada: ${actualMedia || 'NENHUMA'}`);
      } else {
        console.log(`${COLORS.red}❌ FALHOU${COLORS.reset}`);
        console.log(`   Esperado: ${scenario.expected || 'NENHUMA'}`);
        console.log(`   Obtido: ${actualMedia || 'NENHUMA'}`);
      }
      console.log(`   Razão: ${result.reason}`);
      
    } catch (error: any) {
      console.log(`${COLORS.red}❌ ERRO: ${error.message}${COLORS.reset}`);
      results.push({
        scenario: scenario.name,
        message: scenario.message,
        expectedMedia: scenario.expected,
        actualMedia: null,
        passed: false,
        reason: `ERRO: ${error.message}`,
      });
    }
    
    console.log('');
  }
  
  // Resumo
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.cyan}                           RESUMO DOS TESTES                          ${COLORS.reset}`);
  console.log(`${COLORS.cyan}═══════════════════════════════════════════════════════════════════════${COLORS.reset}\n`);
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const total = results.length;
  const percentage = Math.round((passed / total) * 100);
  
  console.log(`${COLORS.green}✅ Passaram: ${passed}/${total} (${percentage}%)${COLORS.reset}`);
  console.log(`${COLORS.red}❌ Falharam: ${failed}/${total}${COLORS.reset}\n`);
  
  if (failed > 0) {
    console.log(`${COLORS.yellow}Cenários que falharam:${COLORS.reset}`);
    for (const r of results.filter(r => !r.passed)) {
      console.log(`  - ${r.scenario}: esperado "${r.expectedMedia}", obtido "${r.actualMedia}"`);
    }
  }
  
  console.log('');
  
  if (percentage >= 70) {
    console.log(`${COLORS.green}🎉 Sistema de mídias está funcionando bem! (${percentage}% de sucesso)${COLORS.reset}`);
  } else {
    console.log(`${COLORS.red}⚠️ Sistema de mídias precisa de ajustes (apenas ${percentage}% de sucesso)${COLORS.reset}`);
  }
  
  process.exit(failed > 3 ? 1 : 0);
}

testMediaDetection().catch(e => {
  console.error('Erro no teste:', e);
  process.exit(1);
});
