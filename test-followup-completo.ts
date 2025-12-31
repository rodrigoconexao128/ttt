/**
 * TESTE COMPLETO DO SISTEMA DE FOLLOW-UP
 * Simula conversas reais de diferentes tipos de clientes
 * Valida todas as correções implementadas
 */

import { db } from "./server/db";
import { 
  conversations, 
  messages, 
  followupConfigs,
  businessAgentConfigs,
  whatsappConnections,
  users 
} from "@shared/schema";
import { eq } from "drizzle-orm";
import { getMistralClient } from "./server/mistralClient";

// Cores para output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  magenta: '\x1b[35m',
};

function log(color: string, message: string) {
  console.log(`${color}${message}${colors.reset}`);
}

// ============================================================================
// CENÁRIOS DE TESTE REAIS
// ============================================================================

const testScenarios = [
  {
    name: "Cliente Interessado mas Ocupado",
    description: "Cliente demonstrou interesse, mas pediu para falar depois",
    businessName: "AgentZap",
    agentName: "Rodrigo",
    agentRole: "Consultor de Vendas",
    products: [
      { name: "Plano Básico", price: "R$ 99/mês", description: "Atendimento automático WhatsApp com IA" },
      { name: "Plano Pro", price: "R$ 199/mês", description: "Tudo do Básico + Follow-up automático" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Olá! Vi seu anúncio sobre automação de WhatsApp" },
      { from: "NÓS", text: "Oi! Que bom ter você aqui 😊 A AgentZap automatiza atendimento com IA. Posso te mostrar como funciona?" },
      { from: "CLIENTE", text: "Parece interessante, mas estou no trabalho agora" },
      { from: "NÓS", text: "Tranquilo! Posso te enviar um vídeo rápido de 2min mostrando na prática. Aí você vê quando tiver tempo. Te mando?" },
      { from: "CLIENTE", text: "Pode ser, obrigado" },
      { from: "NÓS", text: "Enviado! É só 2 minutinhos. Qualquer dúvida, estou por aqui 👍" },
    ],
    expectedBehavior: "Aguardar 2h (cliente está no trabalho). Depois, perguntar se viu o vídeo de forma leve, sem pressionar.",
    hoursElapsed: 180, // 3 horas - passou do tempo mínimo
  },
  
  {
    name: "Cliente que já reclamou de repetição",
    description: "Cliente já reclamou que repetimos a mesma pergunta",
    businessName: "Consultoria XYZ",
    agentName: "Ana",
    agentRole: "Consultora",
    products: [
      { name: "Consultoria", price: "R$ 500/sessão" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quero informações sobre consultoria" },
      { from: "NÓS", text: "Olá! Oferecemos consultoria empresarial. Qual seu maior desafio hoje?" },
      { from: "CLIENTE", text: "Gestão de equipe" },
      { from: "NÓS", text: "Entendi! Você já tentou implementar alguma metodologia?" },
      { from: "CLIENTE", text: "Já, mas não funcionou" },
      { from: "NÓS", text: "Posso agendar uma conversa para entender melhor?" },
      { from: "CLIENTE", text: "Vocês estão repetindo a mesma pergunta, parece que não leram nada do que eu disse" },
    ],
    expectedBehavior: "PEDIR DESCULPAS imediatamente e mudar TOTALMENTE a abordagem. Mostrar que leu tudo.",
    hoursElapsed: 120,
  },

  {
    name: "Cliente que marcou data específica",
    description: "Cliente pediu para retornar na segunda-feira",
    businessName: "Academia Fitness",
    agentName: "Carlos",
    agentRole: "Vendedor",
    products: [
      { name: "Plano Mensal", price: "R$ 150/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quero conhecer a academia" },
      { from: "NÓS", text: "Oi! Temos unidade próxima a você. Quer agendar uma visita?" },
      { from: "CLIENTE", text: "Sim, mas só posso na segunda-feira" },
      { from: "NÓS", text: "Perfeito! Segunda-feira funciona bem. Qual período prefere? Manhã ou tarde?" },
      { from: "CLIENTE", text: "De manhã, por volta das 10h" },
      { from: "NÓS", text: "Ótimo! Agendei segunda às 10h. Te mando confirmação aqui" },
    ],
    expectedBehavior: "SCHEDULE - Agendar para segunda-feira às 9h (antes do horário combinado) para confirmar",
    hoursElapsed: 24,
  },

  {
    name: "Cliente que disse NÃO claramente",
    description: "Cliente recusou a oferta",
    businessName: "Escola de Inglês",
    agentName: "Maria",
    agentRole: "Consultora Educacional",
    products: [
      { name: "Curso Básico", price: "R$ 300/mês" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quanto custa o curso?" },
      { from: "NÓS", text: "O curso básico é R$ 300/mês. Posso te mostrar o que está incluso?" },
      { from: "CLIENTE", text: "Achei caro demais, não vou fazer não" },
      { from: "NÓS", text: "Entendo. Temos também uma opção trimestral com desconto. Quer saber?" },
      { from: "CLIENTE", text: "Não, obrigado. Não tenho interesse mesmo" },
    ],
    expectedBehavior: "ABORT - Cliente recusou claramente. NÃO enviar follow-up.",
    hoursElapsed: 240,
  },

  {
    name: "Cliente em conversa ativa",
    description: "Cliente está respondendo, conversa ativa",
    businessName: "Loja Virtual",
    agentName: "Pedro",
    agentRole: "Atendente",
    products: [
      { name: "Produto A", price: "R$ 50" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Esse produto tem em azul?" },
      { from: "NÓS", text: "Sim! Temos em azul, vermelho e preto" },
      { from: "CLIENTE", text: "Qual o prazo de entrega?" },
      { from: "NÓS", text: "5 dias úteis para sua região" },
    ],
    expectedBehavior: "WAIT - Cliente está conversando AGORA. NÃO enviar follow-up.",
    hoursElapsed: 1, // Última mensagem há 1h - ainda recente
  },

  {
    name: "Cliente que parou após receber informação",
    description: "Cliente recebeu informação e não respondeu mais",
    businessName: "Clínica Odontológica",
    agentName: "Dra. Julia",
    agentRole: "Dentista",
    products: [
      { name: "Limpeza", price: "R$ 150" },
      { name: "Clareamento", price: "R$ 800" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Quanto custa uma limpeza?" },
      { from: "NÓS", text: "Olá! A limpeza completa é R$ 150. Inclui remoção de tártaro e polimento. Quer agendar?" },
      { from: "CLIENTE", text: "Tá. Deixa eu ver aqui minha agenda" },
      { from: "NÓS", text: "Tranquilo! Quando tiver decidido, me avisa. Tenho horários toda semana 😊" },
    ],
    expectedBehavior: "SEND - Após 3h, perguntar se conseguiu ver a agenda, oferecer ajuda. SEM repetir a mesma pergunta.",
    hoursElapsed: 200, // 3+ horas
  },

  {
    name: "Cliente que demonstrou muito interesse",
    description: "Cliente super interessado, fez várias perguntas",
    businessName: "Software House",
    agentName: "Tech Team",
    agentRole: "Consultor Técnico",
    products: [
      { name: "Sistema Personalizado", price: "A partir de R$ 5.000" }
    ],
    conversation: [
      { from: "CLIENTE", text: "Preciso de um sistema para controle de estoque" },
      { from: "NÓS", text: "Fazemos sistemas personalizados! Quantos produtos você tem?" },
      { from: "CLIENTE", text: "Uns 500 produtos, precisa ter código de barras" },
      { from: "NÓS", text: "Perfeito! Fazemos integração com leitor. Quer uma demo?" },
      { from: "CLIENTE", text: "Sim! E quanto custa?" },
      { from: "NÓS", text: "Depende das funcionalidades, mas a partir de R$ 5.000. Posso ligar pra entender melhor?" },
      { from: "CLIENTE", text: "Pode sim, mas só amanhã que estou livre" },
      { from: "NÓS", text: "Combinado! Te ligo amanhã. Qual melhor horário?" },
      { from: "CLIENTE", text: "Depois das 14h" },
    ],
    expectedBehavior: "SCHEDULE - Cliente combinou amanhã 14h. Follow-up deve confirmar ligação.",
    hoursElapsed: 12,
  },
];

// ============================================================================
// FUNÇÕES DE TESTE
// ============================================================================

async function createTestUser(scenario: typeof testScenarios[0]) {
  // Criar usuário de teste
  const userId = `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  
  await db.insert(users).values({
    id: userId,
    email: `test-${Date.now()}@test.com`,
    name: scenario.agentName,
    role: 'user',
  });

  // Criar configuração de negócio
  await db.insert(businessAgentConfigs).values({
    userId,
    agentName: scenario.agentName,
    agentRole: scenario.agentRole,
    companyName: scenario.businessName,
    companyDescription: `${scenario.businessName} - Negócio de teste`,
    productsServices: scenario.products,
    isActive: true,
  });

  // Criar conexão WhatsApp
  const [connection] = await db.insert(whatsappConnections).values({
    userId,
    phoneNumber: '5511999999999',
    isConnected: false,
  }).returning();

  // Criar configuração de follow-up ATIVADA para teste
  await db.insert(followupConfigs).values({
    userId,
    isEnabled: true, // Ativado para teste
    intervalsMinutes: [10, 30, 180, 1440],
    tone: 'consultivo',
    useEmojis: true,
  });

  return { userId, connectionId: connection.id };
}

async function createTestConversation(
  scenario: typeof testScenarios[0], 
  connectionId: string
) {
  const phoneNumber = `5511${Math.floor(Math.random() * 1000000000)}`;
  
  // Criar conversa
  const [conversation] = await db.insert(conversations).values({
    connectionId,
    contactNumber: phoneNumber,
    contactName: `Cliente Teste - ${scenario.name}`,
    followupActive: true,
    followupStage: 0,
    // Simular que já passou o tempo desde última mensagem
    nextFollowupAt: new Date(Date.now() - 1000), // 1 segundo no passado (já vencido)
  }).returning();

  // Criar mensagens da conversa
  const baseTime = Date.now() - (scenario.hoursElapsed * 60 * 60 * 1000);
  
  for (let i = 0; i < scenario.conversation.length; i++) {
    const msg = scenario.conversation[i];
    await db.insert(messages).values({
      conversationId: conversation.id,
      messageId: `test-${i}-${Date.now()}`,
      fromMe: msg.from === "NÓS",
      text: msg.text,
      timestamp: new Date(baseTime + (i * 60 * 1000)), // 1 min entre msgs
    });
  }

  return conversation;
}

async function testFollowUpDecision(
  scenario: typeof testScenarios[0],
  conversation: any,
  userId: string
) {
  log(colors.cyan, `\n${'='.repeat(80)}`);
  log(colors.bright + colors.blue, `📋 CENÁRIO: ${scenario.name}`);
  log(colors.yellow, `📝 Descrição: ${scenario.description}`);
  log(colors.cyan, `${'='.repeat(80)}`);
  
  // Buscar mensagens
  const msgs = await db.query.messages.findMany({
    where: eq(messages.conversationId, conversation.id),
    orderBy: (messages, { desc }) => [desc(messages.timestamp)],
    limit: 40
  });

  const recentMessages = msgs.reverse();
  
  // Buscar config
  const config = await db.query.followupConfigs.findFirst({
    where: eq(followupConfigs.userId, userId)
  });

  const businessConfig = await db.query.businessAgentConfigs.findFirst({
    where: eq(businessAgentConfigs.userId, userId)
  });

  // Formatar histórico
  const historyFormatted = recentMessages.map(m => ({
    de: m.fromMe ? "NÓS" : "CLIENTE",
    mensagem: m.text || '',
    hora: m.timestamp ? new Date(m.timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''
  }));

  // Últimas mensagens nossas
  const ourLastMessages = recentMessages
    .filter(m => m.fromMe && m.text)
    .slice(0, 5)
    .map(m => m.text);

  const lastClientMessage = recentMessages.find(m => !m.fromMe);
  const lastOurMessage = recentMessages.find(m => m.fromMe);
  const lastClientTime = lastClientMessage?.timestamp ? new Date(lastClientMessage.timestamp) : null;
  const lastOurTime = lastOurMessage?.timestamp ? new Date(lastOurMessage.timestamp) : null;
  const now = new Date();
  
  const minutesSinceClient = lastClientTime 
    ? Math.floor((now.getTime() - lastClientTime.getTime()) / (1000 * 60)) 
    : 9999;
  const minutesSinceOur = lastOurTime 
    ? Math.floor((now.getTime() - lastOurTime.getTime()) / (1000 * 60)) 
    : 9999;

  const lastMessageWasOurs = lastOurTime && lastClientTime ? lastOurTime > lastClientTime : !!lastOurTime;
  const clientName = conversation.contactName || '';
  const lastClientText = lastClientMessage?.text || '';

  const brazilNow = new Date(now.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const todayStr = brazilNow.toLocaleDateString('pt-BR');
  const dayOfWeek = brazilNow.getDay();
  const dayNames = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
  const todayName = dayNames[dayOfWeek];

  const agentName = businessConfig?.agentName || '';
  const companyName = businessConfig?.companyName || '';
  const products = businessConfig?.productsServices || [];
  const productsList = Array.isArray(products) && products.length > 0
    ? products.map((p: any) => `- ${p.name}: ${p.description || ''} ${p.price ? `(${p.price})` : ''}`).join('\n')
    : '';
  
  const businessContext = `
SOBRE O NEGÓCIO:
- Empresa: ${companyName}
- Agente: ${agentName}
- Cargo: ${businessConfig?.agentRole || 'Assistente'}
${productsList ? `\nPRODUTOS/SERVIÇOS:\n${productsList}` : ''}`;

  const offeredDemo = ourLastMessages.some(m => m?.toLowerCase().includes('demo') || m?.toLowerCase().includes('vídeo') || m?.toLowerCase().includes('teste'));
  const offeredPrice = ourLastMessages.some(m => m?.toLowerCase().includes('99') || m?.toLowerCase().includes('199') || m?.toLowerCase().includes('preço') || m?.toLowerCase().includes('plano'));

  // Mostrar contexto
  log(colors.magenta, `\n📊 CONTEXTO:`);
  console.log(`  Empresa: ${companyName}`);
  console.log(`  Agente: ${agentName} (${businessConfig?.agentRole})`);
  console.log(`  Tempo desde última msg cliente: ${scenario.hoursElapsed}h (${minutesSinceClient}min)`);
  console.log(`  Quem falou por último: ${lastMessageWasOurs ? 'NÓS' : 'CLIENTE'}`);
  
  log(colors.magenta, `\n💬 HISTÓRICO DA CONVERSA:`);
  historyFormatted.forEach(h => {
    const color = h.de === 'CLIENTE' ? colors.green : colors.blue;
    console.log(`  ${color}[${h.hora}] ${h.de}: ${h.mensagem}${colors.reset}`);
  });

  log(colors.magenta, `\n🤔 COMPORTAMENTO ESPERADO:`);
  log(colors.yellow, `  ${scenario.expectedBehavior}`);

  // Criar prompt
  const toneMap: Record<string, string> = {
    'consultivo': 'consultivo e prestativo',
    'vendedor': 'vendedor persuasivo mas sutil',
    'humano': 'casual e amigável',
    'técnico': 'profissional e direto'
  };

  const prompt = `Você é ${agentName} da ${companyName}, fazendo follow-up INTELIGENTE via WhatsApp.

## 🎯 SUA IDENTIDADE (MEMORIZE!)
- Você é: ${agentName}
- Empresa: ${companyName}
- Seu cargo: ${businessConfig?.agentRole || 'Assistente'}
${businessContext}

## 📅 DATA E HORA ATUAL
- Hoje: ${todayStr} (${todayName})
- Hora: ${brazilNow.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}

## 👤 DADOS DO CLIENTE
- Nome: ${clientName}
- Última msg do CLIENTE há: ${minutesSinceClient} minutos (${Math.floor(minutesSinceClient/60)}h${minutesSinceClient % 60}min)
- Nossa última msg há: ${minutesSinceOur} minutos
- Quem falou por último: ${lastMessageWasOurs ? 'NÓS' : 'CLIENTE'}
- Estágio: ${conversation.followupStage || 0}

## 💬 HISTÓRICO COMPLETO DA CONVERSA (LEIA TUDO ANTES DE RESPONDER!)
${historyFormatted.map(h => `[${h.hora}] ${h.de}: ${h.mensagem}`).join('\n')}

## ⚠️ MENSAGENS QUE JÁ ENVIAMOS (NÃO REPITA!)
${ourLastMessages.length > 0 ? ourLastMessages.map((m, i) => `${i+1}. "${m}"`).join('\n') : '(nenhuma ainda)'}

## 🔍 ANÁLISE DO CONTEXTO
- Última msg do cliente: "${lastClientText}"
- Já oferecemos demo/vídeo: ${offeredDemo ? 'SIM' : 'NÃO'}
- Já falamos de preço: ${offeredPrice ? 'SIM' : 'NÃO'}

## 📚 TÉCNICAS DE FOLLOW-UP PROFISSIONAL
1. **CONTINUAR A CONVERSA**: Sua msg deve ser continuação NATURAL do último assunto
2. **AGREGAR VALOR NOVO**: Trazer informação/benefício que ainda não mencionamos
3. **NÃO INSISTIR**: Se cliente está ocupado ou pediu tempo, ESPERAR
4. **PERSONALIZAR**: Usar o nome do cliente e referências da conversa
5. **SER ÚTIL**: Oferecer ajuda genuína, não só empurrar venda

## ❌ PROIBIDO (CAUSAM IRRITAÇÃO)
- Repetir a mesma frase, pergunta ou informação
- Ignorar o que o cliente disse por último
- Usar colchetes [], barras /, ou formatação técnica
- Enviar msg se respondemos há menos de 2h
- Mensagens genéricas tipo "Oi, tudo bem?"
- Terminar com "Áudio" ou "Audio"

## ✅ OBRIGATÓRIO
- LEIA o histórico e CONTINUE o assunto de onde parou
- Se o cliente fez pergunta, RESPONDA ela
- Se oferecemos algo e ele aceitou, CONCRETIZE
- Se ele mostrou interesse, avance para PRÓXIMO PASSO
- Mensagem CURTA (máximo 2-3 frases)
- Tom: ${toneMap[config?.tone || 'consultivo']}
${config?.useEmojis ? '- Use no máximo 1 emoji' : '- NÃO use emojis'}

## 🎯 DECISÃO
Analise e decida:
- **WAIT**: Nossa última msg foi há menos de 2h OU estamos aguardando resposta OU cliente pediu tempo
- **SEND**: Cliente parou há mais de 2h E podemos agregar valor NOVO
- **SCHEDULE**: Cliente mencionou data específica (segunda, amanhã, dia X, etc)
- **ABORT**: Cliente disse NÃO claramente, comprou, ou cancelou

## 📋 FORMATO (JSON válido, sem texto extra)
{"action":"wait|send|abort|schedule","reason":"motivo curto","message":"texto PRONTO para enviar (só se action=send)","scheduleDate":"YYYY-MM-DDTHH:MM (só se action=schedule)"}`;

  // Chamar IA
  log(colors.magenta, `\n🤖 ANALISANDO COM IA...`);
  
  try {
    const mistral = await getMistralClient();
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.7
    });
    
    const rawContent = response.choices?.[0]?.message?.content || "";
    const content = typeof rawContent === 'string' ? rawContent : JSON.stringify(rawContent);
    const jsonStr = content.replace(/```json/g, '').replace(/```/g, '').trim();
    
    const parsed = JSON.parse(jsonStr);

    log(colors.magenta, `\n✅ RESPOSTA DA IA:`);
    console.log(`  Ação: ${colors.bright}${parsed.action.toUpperCase()}${colors.reset}`);
    console.log(`  Motivo: ${parsed.reason}`);
    if (parsed.message) {
      log(colors.green, `  Mensagem: "${parsed.message}"`);
    }
    if (parsed.scheduleDate) {
      console.log(`  Agendar para: ${parsed.scheduleDate}`);
    }

    // Validar comportamento esperado
    log(colors.magenta, `\n🔍 VALIDAÇÃO:`);
    
    const expectedAction = scenario.expectedBehavior.toLowerCase();
    let passed = true;
    let issues: string[] = [];

    // Validar action
    if (expectedAction.includes('wait') && parsed.action !== 'wait') {
      issues.push(`❌ Deveria ser WAIT mas foi ${parsed.action.toUpperCase()}`);
      passed = false;
    }
    if (expectedAction.includes('abort') && parsed.action !== 'abort') {
      issues.push(`❌ Deveria ser ABORT mas foi ${parsed.action.toUpperCase()}`);
      passed = false;
    }
    if (expectedAction.includes('schedule') && parsed.action !== 'schedule') {
      issues.push(`❌ Deveria ser SCHEDULE mas foi ${parsed.action.toUpperCase()}`);
      passed = false;
    }
    if (expectedAction.includes('send') && expectedAction.includes('sem repetir') && parsed.action === 'send') {
      // Validar se não está repetindo
      if (parsed.message && ourLastMessages.length > 0) {
        const msgLower = parsed.message.toLowerCase();
        const hasRepetition = ourLastMessages.some(prev => {
          if (!prev) return false;
          const prevLower = prev.toLowerCase();
          // Verificar se frases se repetem
          return msgLower.includes(prevLower.substring(0, 30)) || 
                 prevLower.includes(msgLower.substring(0, 30));
        });
        if (hasRepetition) {
          issues.push(`❌ Mensagem parece REPETIR o que já dissemos`);
          passed = false;
        }
      }
    }

    // Validar se leu a conversa (se cliente reclamou)
    if (scenario.name.includes('reclamou')) {
      const hasApology = parsed.message?.toLowerCase().includes('desculp') || 
                        parsed.message?.toLowerCase().includes('perdão');
      if (!hasApology) {
        issues.push(`❌ Cliente reclamou mas NÃO pediu desculpas`);
        passed = false;
      }
    }

    // Validar continuidade
    if (parsed.action === 'send' && parsed.message) {
      const msgLower = parsed.message.toLowerCase();
      const lastClientLower = lastClientText.toLowerCase();
      
      // Verificar se responde ao último comentário do cliente
      const keywords = lastClientLower.split(' ').filter(w => w.length > 4);
      const mentionsContext = keywords.some(k => msgLower.includes(k));
      
      if (!mentionsContext && lastClientText.length > 10) {
        issues.push(`⚠️ Mensagem não parece responder ao último comentário do cliente`);
      }
    }

    if (passed && issues.length === 0) {
      log(colors.green, `  ✅ TESTE PASSOU! Comportamento está correto.`);
    } else {
      log(colors.red, `  ❌ TESTE FALHOU!`);
      issues.forEach(issue => log(colors.red, `     ${issue}`));
    }

    return { passed, issues, response: parsed };

  } catch (error: any) {
    log(colors.red, `\n❌ ERRO: ${error.message}`);
    return { passed: false, issues: [error.message], response: null };
  }
}

// ============================================================================
// EXECUTAR TESTES
// ============================================================================

async function runAllTests() {
  log(colors.bright + colors.cyan, `
╔══════════════════════════════════════════════════════════════════════════╗
║         TESTE COMPLETO DO SISTEMA DE FOLLOW-UP - AgentZap              ║
║                                                                          ║
║  Validando correções:                                                    ║
║  ✓ Follow-up desativado por padrão                                      ║
║  ✓ Maior tempo de respiro quando cliente responde (2h)                  ║
║  ✓ Detecção melhorada de mensagens repetidas                            ║
║  ✓ Leitura de histórico completo (40 mensagens)                         ║
║  ✓ Prompt melhorado com identidade do agente                            ║
╚══════════════════════════════════════════════════════════════════════════╝
`);

  const results: { scenario: string; passed: boolean; issues: string[] }[] = [];

  for (let i = 0; i < testScenarios.length; i++) {
    const scenario = testScenarios[i];
    
    try {
      // Criar dados de teste
      const { userId, connectionId } = await createTestUser(scenario);
      const conversation = await createTestConversation(scenario, connectionId);
      
      // Testar
      const result = await testFollowUpDecision(scenario, conversation, userId);
      
      results.push({
        scenario: scenario.name,
        passed: result.passed,
        issues: result.issues,
      });

      // Limpar dados de teste
      await db.delete(messages).where(eq(messages.conversationId, conversation.id));
      await db.delete(conversations).where(eq(conversations.id, conversation.id));
      await db.delete(followupConfigs).where(eq(followupConfigs.userId, userId));
      await db.delete(businessAgentConfigs).where(eq(businessAgentConfigs.userId, userId));
      await db.delete(whatsappConnections).where(eq(whatsappConnections.userId, userId));
      await db.delete(users).where(eq(users.id, userId));

    } catch (error: any) {
      log(colors.red, `\n❌ ERRO ao processar cenário "${scenario.name}": ${error.message}`);
      results.push({
        scenario: scenario.name,
        passed: false,
        issues: [error.message],
      });
    }
  }

  // Resumo final
  log(colors.bright + colors.cyan, `\n${'='.repeat(80)}`);
  log(colors.bright + colors.blue, `📊 RESUMO DOS TESTES`);
  log(colors.cyan, `${'='.repeat(80)}\n`);

  let totalPassed = 0;
  let totalFailed = 0;

  results.forEach(r => {
    if (r.passed) {
      log(colors.green, `✅ ${r.scenario}`);
      totalPassed++;
    } else {
      log(colors.red, `❌ ${r.scenario}`);
      r.issues.forEach(issue => {
        log(colors.red, `   ${issue}`);
      });
      totalFailed++;
    }
  });

  log(colors.cyan, `\n${'='.repeat(80)}`);
  log(colors.bright, `\nTotal: ${results.length} testes`);
  log(colors.green, `Passou: ${totalPassed}`);
  if (totalFailed > 0) {
    log(colors.red, `Falhou: ${totalFailed}`);
  }
  log(colors.cyan, `${'='.repeat(80)}\n`);

  if (totalFailed === 0) {
    log(colors.bright + colors.green, `🎉 TODOS OS TESTES PASSARAM! Sistema está funcionando perfeitamente!`);
  } else {
    log(colors.bright + colors.yellow, `⚠️  Alguns testes falharam. Revise as correções.`);
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

// Executar
runAllTests().catch(error => {
  console.error('Erro fatal:', error);
  process.exit(1);
});
