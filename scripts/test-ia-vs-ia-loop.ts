/**
 * TEST IA VS IA LOOP - HARNESS DE TESTE
 * 
 * Script que gerencia a troca de mensagens entre Agente IA e Cliente IA simulado.
 * Simula conversas completas de delivery (pedido de pizza) com múltiplas personas.
 * 
 * Uso:
 *   npx tsx scripts/test-ia-vs-ia-loop.ts
 * 
 * Funcionalidades:
 * - Importa personas do client-persona-generator.ts
 * - Simula conversa completa entre Cliente IA e Agente IA
 * - Mantém histórico da conversa
 * - Detecta quando o pedido foi finalizado
 * - Reporta resultados e estatísticas
 */

import 'dotenv/config';
import { Mistral } from '@mistralai/mistralai';
import fs from 'fs';
import path from 'path';
import { 
  generatePersona, 
  generatePersonas, 
  getPredefinedPersonas, 
  getPersonaById,
  getRandomPersona,
  ClientPersona 
} from './client-persona-generator';

// ══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO
// ══════════════════════════════════════════════════════════════════════════

interface TestConfig {
  mistralApiKey: string;
  maxTurns: number;
  timeoutMinutes: number;
  modelAgent: string;
  modelClient: string;
  baseDelay: number;
  minRequestInterval: number;
  rateLimitDelay: number;
}

const CONFIG: TestConfig = {
  // Chave API Mistral do ambiente ou fallback
  mistralApiKey: process.env.MISTRAL_API_KEY || '',
  
  // Limites da conversa
  maxTurns: 20,
  timeoutMinutes: 5,
  
  // Modelos
  modelAgent: 'mistral-medium-latest',
  modelClient: 'mistral-medium-2312',
  
  // Delays (em ms)
  baseDelay: 6000,
  minRequestInterval: 6000,
  rateLimitDelay: 15000,
};

// Validação da chave API
if (!CONFIG.mistralApiKey) {
  console.error('❌ ERRO: MISTRAL_API_KEY não configurada no ambiente');
  console.error('   Configure a variável de ambiente MISTRAL_API_KEY');
  process.exit(1);
}

// ══════════════════════════════════════════════════════════════════════════
// CARDÁPIO REAL
// ══════════════════════════════════════════════════════════════════════════

const CARDAPIO = `
🍕 **PIZZAS SALGADAS** (Tamanho único):
- Pizza Portuguesa: R$ 30,00
- Pizza Marguerita: R$ 30,00
- Pizza Frango com Milho: R$ 30,00
- Pizza Frango Catupiry: R$ 30,00
- Pizza Calabresa: R$ 30,00
- Pizza Mussarela: R$ 30,00
- Pizza Atum: R$ 35,00
- Pizza Picante: R$ 30,00
- Pizza Costela: R$ 36,00
- Pizza 4 Queijos: R$ 30,00
- Pizza Milho: R$ 30,00
- Pizza Dom Camilo: R$ 30,00

🍫 **PIZZAS DOCES**:
- Pizza Tentação: R$ 35,00
- Pizza Romeu e Julieta: R$ 55,00
- Pizza Brigadeiro: R$ 30,00
- Pizza MM Disquete: R$ 30,00
- Pizza Banana: R$ 30,00

🥟 **ESFIHAS** (Unidade):
- Esfiha de Carne: R$ 4,00
- Esfiha de Queijo: R$ 4,00
- Esfiha de Calabresa: R$ 4,00
- Esfiha de Milho: R$ 4,00
- Esfiha de Bacon: R$ 5,00
- Esfiha de Frango: R$ 5,00
- Esfiha de Atum: R$ 6,00
- Esfiha Carne c/ Queijo: R$ 6,00
- Esfiha Carne c/ Requeijão: R$ 6,00
- Esfiha Carne c/ Bacon: R$ 7,00
- Esfiha Frango c/ Queijo: R$ 7,50
- Esfiha Frango c/ Requeijão: R$ 7,50
- Esfiha de Banana: R$ 5,00
- Esfiha de Brigadeiro: R$ 5,00
- Esfiha Disquete MM: R$ 5,00
- Esfiha Romeu e Julieta: R$ 5,00

🍹 **BEBIDAS**:
- Refrigerante Lata 350ml: R$ 7,00
- Refrigerante 1 Litro: R$ 10,00
- Refrigerante 1.5 Litros: R$ 12,00
- Refrigerante 2 Litros: R$ 15,00

🧀 **BORDAS RECHEADAS** (Adicional):
- Borda de Catupiry: R$ 10,00
- Borda de Cheddar: R$ 10,00
- Borda de Chocolate: R$ 10,00
- Borda de 4 Queijos: R$ 10,00

🎁 **COMBOS**:
- Combo 6 Esfihas + Refri 1L: R$ 38,00
- Combo Pizza G + Borda + Refri 1.5L: R$ 60,00
`;

// ══════════════════════════════════════════════════════════════════════════
// PROMPT DO AGENTE
// ══════════════════════════════════════════════════════════════════════════

const AGENT_PROMPT = `Você é o atendente virtual do **Novo Sabor Pizza e Esfihas**.

📋 **CARDÁPIO DISPONÍVEL:**
${CARDAPIO}

🎯 **SEU OBJETIVO PRINCIPAL:**
1. Cumprimentar o cliente
2. Perguntar o que deseja (pizza, esfiha, bebida)
3. Anotar o pedido completo (itens, quantidades)
4. Sugerir adicionais (borda, bebida)
5. **COLETAR OBRIGATORIAMENTE**: Nome, Endereço completo, Forma de pagamento
6. Mostrar resumo do pedido com valores
7. **FINALIZAR com confirmação do pedido**

📝 **REGRAS CRÍTICAS:**
- Sempre use os preços EXATOS do cardápio acima
- Para PIZZA MEIO A MEIO: o preço é o da pizza mais cara
- Frete GRÁTIS para pedidos acima de R$ 50
- Frete R$ 8 para pedidos abaixo de R$ 50
- Entrega em Cuiabá e Várzea Grande
- Pagamento: PIX, Dinheiro ou Cartão

✅ **FLUXO DE FINALIZAÇÃO:**
Quando tiver TODOS os dados (itens + nome + endereço + pagamento):
1. Mostre o RESUMO DO PEDIDO com todos os itens e valores
2. Pergunte: "Confirma o pedido?"
3. Se o cliente confirmar, diga: "✅ PEDIDO CONFIRMADO! Número #[número]. Previsão de entrega: 45 minutos."

❌ **NUNCA:**
- Invente preços ou itens que não existem no cardápio
- Finalize sem ter NOME, ENDEREÇO e PAGAMENTO
- Ignore pedidos de meio a meio

🗣️ **TOM:** Cordial, eficiente, use emojis com moderação (1-2 por mensagem).
`;

// ══════════════════════════════════════════════════════════════════════════
// TIPOS E INTERFACES
// ══════════════════════════════════════════════════════════════════════════

interface ConversationMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface ConversationResult {
  personaId: string;
  personaName: string;
  personaObjective: string;
  success: boolean;
  orderConfirmed: boolean;
  orderCancelled: boolean;
  turnCount: number;
  durationMs: number;
  orderNumber?: string;
  errors: string[];
  conversationHistory: ConversationMessage[];
  finalOrder?: {
    items: string[];
    total?: number;
    payment?: string;
    address?: string;
  };
}

interface BatchResult {
  timestamp: string;
  totalConversations: number;
  successfulConversations: number;
  failedConversations: number;
  confirmedOrders: number;
  cancelledOrders: number;
  averageTurns: number;
  averageDurationMs: number;
  results: ConversationResult[];
}

// ══════════════════════════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════════════════════════

class Logger {
  private logs: string[] = [];
  private logFile: string;

  constructor(filename?: string) {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    this.logFile = filename || path.join(process.cwd(), `logs`, `test-ia-vs-ia-${timestamp}.json`);
    
    // Criar diretório de logs se não existir
    const logDir = path.dirname(this.logFile);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
  }

  log(message: string, level: 'info' | 'warn' | 'error' = 'info'): void {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    const formatted = `[${timestamp}] [${level.toUpperCase()}] ${message}`;
    
    this.logs.push(formatted);
    
    if (level === 'error') {
      console.error(formatted);
    } else if (level === 'warn') {
      console.warn(formatted);
    } else {
      console.log(formatted);
    }
  }

  saveBatchResult(result: BatchResult): void {
    const outputPath = this.logFile.replace('.json', '-batch-result.json');
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
    this.log(`📁 Resultado do batch salvo em: ${outputPath}`);
  }

  saveConversation(result: ConversationResult): void {
    const outputPath = this.logFile.replace('.json', `-conversation-${result.personaId}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));
  }
}

const logger = new Logger();

// ══════════════════════════════════════════════════════════════════════════
// THROTTLING E CONTROLE DE REQUISIÇÕES
// ══════════════════════════════════════════════════════════════════════════

let lastRequestTime = 0;

async function throttleRequest(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;
  
  if (timeSinceLastRequest < CONFIG.minRequestInterval) {
    const waitTime = CONFIG.minRequestInterval - timeSinceLastRequest;
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }
  
  lastRequestTime = Date.now();
}

// ══════════════════════════════════════════════════════════════════════════
// FUNÇÕES DE CHAMADA À API MISTRAL
// ══════════════════════════════════════════════════════════════════════════

async function callMistralAPI(
  client: Mistral,
  messages: Array<{ role: string; content: string }>,
  model: string,
  role: 'agent' | 'client'
): Promise<string> {
  await throttleRequest();
  
  try {
    logger.log(`🤖 Chamando Mistral API [${role}] com modelo ${model}...`);
    
    const response = await client.chat.complete({
      model,
      messages: messages as any,
      temperature: 0.7,
      maxTokens: 500,
    });
    
    const content = response.choices?.[0]?.message?.content;
    const text = typeof content === 'string' ? content : (content?.[0] as any)?.text || '';
    
    logger.log(`✅ Resposta recebida [${role}]: ${text.substring(0, 50)}...`);
    return text;
    
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    logger.log(`❌ Erro na API Mistral [${role}]: ${errorMsg}`, 'error');
    
    // Se for rate limit, aguarda e tenta novamente
    if (errorMsg.includes('429') || errorMsg.toLowerCase().includes('rate limit')) {
      logger.log(`⏳ Rate limit detectado. Aguardando ${CONFIG.rateLimitDelay}ms...`, 'warn');
      await new Promise(resolve => setTimeout(resolve, CONFIG.rateLimitDelay));
      return callMistralAPI(client, messages, model, role);
    }
    
    throw error;
  }
}

// ══════════════════════════════════════════════════════════════════════════
// FUNÇÃO PRINCIPAL: EXECUTAR CONVERSA
// ══════════════════════════════════════════════════════════════════════════

export async function runConversation(
  persona?: ClientPersona,
  maxTurns: number = CONFIG.maxTurns
): Promise<ConversationResult> {
  const startTime = Date.now();
  const selectedPersona = persona || getRandomPersona();
  
  logger.log(`\n${'='.repeat(60)}`);
  logger.log(`🎭 INICIANDO CONVERSA: ${selectedPersona.name}`);
  logger.log(`📝 Objetivo: ${selectedPersona.objective}`);
  logger.log(`🏷️  Traits: ${selectedPersona.traits.join(', ')}`);
  logger.log(`${'='.repeat(60)}\n`);
  
  const result: ConversationResult = {
    personaId: selectedPersona.id,
    personaName: selectedPersona.name,
    personaObjective: selectedPersona.objective,
    success: false,
    orderConfirmed: false,
    orderCancelled: false,
    turnCount: 0,
    durationMs: 0,
    errors: [],
    conversationHistory: [],
  };
  
  // Inicializar cliente Mistral
  const mistral = new Mistral({ apiKey: CONFIG.mistralApiKey });
  
  // Históricos de conversa separados
  const agentHistory: Array<{ role: string; content: string }> = [
    { role: 'system', content: AGENT_PROMPT }
  ];
  
  const clientHistory: Array<{ role: string; content: string }> = [
    { role: 'system', content: selectedPersona.prompt }
  ];
  
  // Cliente inicia a conversa
  const firstMessage = 'Oi, gostaria de fazer um pedido.';
  logger.log(`🧑 [CLIENTE] ${firstMessage}`);
  
  agentHistory.push({ role: 'user', content: firstMessage });
  clientHistory.push({ role: 'assistant', content: firstMessage });
  
  result.conversationHistory.push({
    role: 'user',
    content: firstMessage,
    timestamp: Date.now()
  });
  
  let isFinished = false;
  const timeoutMs = CONFIG.timeoutMinutes * 60 * 1000;
  
  while (result.turnCount < maxTurns && !isFinished) {
    // Verificar timeout
    if (Date.now() - startTime > timeoutMs) {
      logger.log(`⏰ Timeout após ${CONFIG.timeoutMinutes} minutos`, 'warn');
      result.errors.push(`Timeout: conversa excedeu ${CONFIG.timeoutMinutes} minutos`);
      break;
    }
    
    result.turnCount++;
    logger.log(`\n--- Turno ${result.turnCount}/${maxTurns} ---`);
    
    // --- TURNO DO AGENTE ---
    try {
      const agentResponse = await callMistralAPI(mistral, agentHistory, CONFIG.modelAgent, 'agent');
      
      logger.log(`🤖 [AGENTE] ${agentResponse}`);
      
      agentHistory.push({ role: 'assistant', content: agentResponse });
      clientHistory.push({ role: 'user', content: agentResponse });
      
      result.conversationHistory.push({
        role: 'assistant',
        content: agentResponse,
        timestamp: Date.now()
      });
      
      // Verificar se pedido foi confirmado
      const agentLower = agentResponse.toLowerCase();
      const confirmedPatterns = [
        'pedido confirmado',
        'pedido #',
        'número do pedido',
        'confirmado com sucesso',
        '✅ pedido'
      ];
      
      if (confirmedPatterns.some(pattern => agentLower.includes(pattern))) {
        logger.log(`🎉 PEDIDO CONFIRMADO!`);
        result.orderConfirmed = true;
        result.success = true;
        
        // Extrair número do pedido
        const numMatch = agentResponse.match(/#(\d+)/);
        if (numMatch) {
          result.orderNumber = numMatch[1];
        }
        
        isFinished = true;
        break;
      }
      
    } catch (error: any) {
      const errorMsg = `Erro no Agente: ${error?.message}`;
      logger.log(`❌ ${errorMsg}`, 'error');
      result.errors.push(errorMsg);
      break;
    }
    
    // --- TURNO DO CLIENTE ---
    try {
      const clientResponse = await callMistralAPI(mistral, clientHistory, CONFIG.modelClient, 'client');
      
      logger.log(`🧑 [CLIENTE] ${clientResponse}`);
      
      agentHistory.push({ role: 'user', content: clientResponse });
      clientHistory.push({ role: 'assistant', content: clientResponse });
      
      result.conversationHistory.push({
        role: 'user',
        content: clientResponse,
        timestamp: Date.now()
      });
      
      // Verificar se cliente cancelou
      const clientLower = clientResponse.toLowerCase();
      const cancelPatterns = [
        'cancelar',
        'desistir',
        'não quero mais',
        'desisto',
        'pode cancelar'
      ];
      
      if (cancelPatterns.some(pattern => clientLower.includes(pattern))) {
        if (selectedPersona.expectedBehavior === 'cancel') {
          logger.log(`🚫 Pedido cancelado (comportamento esperado)`);
          result.orderCancelled = true;
          result.success = true;
        } else {
          logger.log(`🚫 Pedido cancelado (NÃO esperado)`, 'warn');
          result.orderCancelled = true;
          result.success = false;
          result.errors.push('Cliente cancelou inesperadamente');
        }
        isFinished = true;
        break;
      }
      
    } catch (error: any) {
      const errorMsg = `Erro no Cliente: ${error?.message}`;
      logger.log(`❌ ${errorMsg}`, 'error');
      result.errors.push(errorMsg);
      break;
    }
  }
  
  // Verificar se excedeu turnos
  if (!isFinished && result.turnCount >= maxTurns) {
    logger.log(`⚠️ Conversa excedeu o limite de ${maxTurns} turnos`, 'warn');
    result.errors.push(`Excedeu limite de ${maxTurns} turnos sem finalizar`);
  }
  
  // Calcular duração
  result.durationMs = Date.now() - startTime;
  
  logger.log(`\n${'='.repeat(60)}`);
  logger.log(`📊 RESULTADO DA CONVERSA:`);
  logger.log(`   ✅ Sucesso: ${result.success ? 'SIM' : 'NÃO'}`);
  logger.log(`   📦 Confirmado: ${result.orderConfirmed ? 'SIM' : 'NÃO'}`);
  logger.log(`   🚫 Cancelado: ${result.orderCancelled ? 'SIM' : 'NÃO'}`);
  logger.log(`   💬 Turnos: ${result.turnCount}`);
  logger.log(`   ⏱️  Duração: ${(result.durationMs / 1000).toFixed(1)}s`);
  if (result.orderNumber) {
    logger.log(`   🎫 Número: #${result.orderNumber}`);
  }
  if (result.errors.length > 0) {
    logger.log(`   ❌ Erros: ${result.errors.join(', ')}`);
  }
  logger.log(`${'='.repeat(60)}\n`);
  
  // Salvar conversa individual
  logger.saveConversation(result);
  
  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// FUNÇÃO: EXECUTAR BATCH DE CONVERSAS
// ══════════════════════════════════════════════════════════════════════════

export async function runBatch(count: number = 10): Promise<BatchResult> {
  logger.log(`\n🚀 INICIANDO BATCH DE ${count} CONVERSAS\n`);
  
  const personas = generatePersonas(count);
  const results: ConversationResult[] = [];
  
  for (let i = 0; i < count; i++) {
    logger.log(`\n📌 Teste ${i + 1}/${count}`);
    
    try {
      const result = await runConversation(personas[i], CONFIG.maxTurns);
      results.push(result);
      
      // Pausa entre conversas
      if (i < count - 1) {
        logger.log(`⏳ Aguardando 5s antes da próxima conversa...`);
        await new Promise(resolve => setTimeout(resolve, 5000));
      }
      
    } catch (error: any) {
      logger.log(`❌ Erro fatal no teste ${i + 1}: ${error?.message}`, 'error');
      results.push({
        personaId: personas[i].id,
        personaName: personas[i].name,
        personaObjective: personas[i].objective,
        success: false,
        orderConfirmed: false,
        orderCancelled: false,
        turnCount: 0,
        durationMs: 0,
        errors: [error?.message || 'Erro desconhecido'],
        conversationHistory: []
      });
    }
  }
  
  // Calcular estatísticas
  const successfulConversations = results.filter(r => r.success).length;
  const confirmedOrders = results.filter(r => r.orderConfirmed).length;
  const cancelledOrders = results.filter(r => r.orderCancelled).length;
  const averageTurns = results.reduce((sum, r) => sum + r.turnCount, 0) / results.length;
  const averageDurationMs = results.reduce((sum, r) => sum + r.durationMs, 0) / results.length;
  
  const batchResult: BatchResult = {
    timestamp: new Date().toISOString(),
    totalConversations: count,
    successfulConversations,
    failedConversations: count - successfulConversations,
    confirmedOrders,
    cancelledOrders,
    averageTurns: Math.round(averageTurns * 10) / 10,
    averageDurationMs: Math.round(averageDurationMs),
    results
  };
  
  // Log do resumo
  logger.log(`\n${'='.repeat(60)}`);
  logger.log(`📊 RESUMO DO BATCH`);
  logger.log(`${'='.repeat(60)}`);
  logger.log(`   Total: ${count}`);
  logger.log(`   ✅ Sucessos: ${successfulConversations}/${count} (${((successfulConversations/count)*100).toFixed(0)}%)`);
  logger.log(`   📦 Confirmados: ${confirmedOrders}`);
  logger.log(`   🚫 Cancelados: ${cancelledOrders}`);
  logger.log(`   💬 Média de turnos: ${batchResult.averageTurns.toFixed(1)}`);
  logger.log(`   ⏱️  Média de duração: ${(batchResult.averageDurationMs/1000).toFixed(1)}s`);
  
  if (successfulConversations === count) {
    logger.log(`\n🎉 TODOS OS TESTES PASSARAM!`);
  } else {
    logger.log(`\n⚠️ ${count - successfulConversations} testes falharam`);
  }
  logger.log(`${'='.repeat(60)}\n`);
  
  // Salvar resultado do batch
  logger.saveBatchResult(batchResult);
  
  return batchResult;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN - EXECUÇÃO DO SCRIPT
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'batch';
  
  logger.log(`\n🤖 TEST IA VS IA LOOP - HARNESS DE TESTE`);
  logger.log(`   API Key: ${CONFIG.mistralApiKey.substring(0, 8)}...***`);
  logger.log(`   Modelo Agente: ${CONFIG.modelAgent}`);
  logger.log(`   Modelo Cliente: ${CONFIG.modelClient}`);
  logger.log(`   Max Turnos: ${CONFIG.maxTurns}`);
  logger.log(`   Timeout: ${CONFIG.timeoutMinutes} minutos\n`);
  
  try {
    switch (command) {
      case 'single':
        // Executa uma única conversa
        const personaId = args[1];
        const persona = personaId ? getPersonaById(personaId) : undefined;
        await runConversation(persona);
        break;
        
      case 'batch':
        // Executa batch de conversas
        const count = parseInt(args[1]) || 10;
        await runBatch(count);
        break;
        
      case 'list-personas':
        // Lista todas as personas disponíveis
        logger.log('\n📋 PERSONAS DISPONÍVEIS:\n');
        const predefined = getPredefinedPersonas();
        predefined.forEach((p, i) => {
          logger.log(`   ${i + 1}. ${p.name}`);
          logger.log(`      Objetivo: ${p.objective}`);
          logger.log(`      Traits: ${p.traits.join(', ')}`);
          logger.log(`      Comportamento: ${p.expectedBehavior}`);
          logger.log('');
        });
        break;
        
      default:
        logger.log('Uso: npx tsx scripts/test-ia-vs-ia-loop.ts [comando] [opções]');
        logger.log('');
        logger.log('Comandos:');
        logger.log('  single [personaId]     - Executa uma conversa única');
        logger.log('  batch [count]          - Executa batch de conversas (padrão: 10)');
        logger.log('  list-personas          - Lista todas as personas disponíveis');
        logger.log('');
        logger.log('Exemplos:');
        logger.log('  npx tsx scripts/test-ia-vs-ia-loop.ts single');
        logger.log('  npx tsx scripts/test-ia-vs-ia-loop.ts batch 5');
        process.exit(1);
    }
    
    process.exit(0);
    
  } catch (error: any) {
    logger.log(`❌ Erro fatal: ${error?.message}`, 'error');
    process.exit(1);
  }
}

// Executar se for chamado diretamente
if (require.main === module) {
  main();
}

// Exportar funções para uso como módulo
export {
  ClientPersona,
  ConversationResult,
  BatchResult,
  TestConfig,
  CONFIG
};
