/**
 * TESTE IA VS IA - DELIVERY COMPLETO
 * 
 * Testa 10 personas de clientes contra o agente de delivery
 * Usando MESMO modelo e chave Mistral do banco de dados
 * 
 * Objetivo: Cada cliente deve finalizar o pedido com sucesso
 */

// Capturar erros não tratados
process.on('uncaughtException', (err) => {
  console.error('❌ ERRO NÃO TRATADO:', err);
  console.error(err.stack);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ PROMISE REJEITADA:', reason);
});

import 'dotenv/config';
import { Mistral } from '@mistralai/mistralai';
import fs from 'fs';
import path from 'path';

// ══════════════════════════════════════════════════════════════════════════
// CONFIGURAÇÃO (DADOS DO BANCO - bigacaicuiaba@gmail.com)
// ══════════════════════════════════════════════════════════════════════════

// 🔥 MODELOS VALIDADOS POR STRESS TEST (mesma lógica de vvvv/server/llm.ts)
// Ordenados por taxa de sucesso
const MISTRAL_MODELS = [
  { model: 'mistral-medium-latest', delaySeconds: 6 },
  { model: 'mistral-medium-2312', delaySeconds: 10 },
  { model: 'mistral-medium', delaySeconds: 10 },
  { model: 'mistral-large-2411', delaySeconds: 20 },
  { model: 'mistral-large-latest', delaySeconds: 20 },
];

let currentModelIndex = 0;

function getNextModel(): { model: string; delay: number } {
  const modelConfig = MISTRAL_MODELS[currentModelIndex];
  currentModelIndex = (currentModelIndex + 1) % MISTRAL_MODELS.length;
  return { model: modelConfig.model, delay: modelConfig.delaySeconds * 1000 };
}

const CONFIG = {
  // Chave API Mistral (do banco system_config)
  MISTRAL_API_KEY: 'Qd1y6DSDi8SmVs4xnqYRTv77xg6eRBR4',
  
  // Modelo Mistral principal (será rotacionado automaticamente)
  MODEL: 'mistral-medium-latest',
  
  // Modelo para cliente - USANDO MODELOS DIFERENTES para evitar conflito
  CLIENT_MODEL: 'mistral-medium-2312',
  
  // Máximo de turnos por conversa
  MAX_TURNS: 15,
  
  // Delay entre chamadas (IGUAL PRODUÇÃO: 6-20s dependendo do modelo)
  // Como fazemos 2 chamadas por turno, usamos o delay base
  BASE_DELAY: 8000,
  
  // Intervalo mínimo global entre chamadas à API (PRODUÇÃO usa 6s)
  MIN_REQUEST_INTERVAL: 6000,
  
  // Delay após rate limit - PRODUÇÃO espera até 5 minutos antes de fallback
  RATE_LIMIT_DELAY: 15000,
  
  // Cooldown por modelo após rate limit (PRODUÇÃO: 30s)
  MODEL_COOLDOWN: 30000,
};

// ══════════════════════════════════════════════════════════════════════════
// CARDÁPIO REAL (DO BANCO delivery_menu_items)
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
// PROMPT DO AGENTE (SIMPLIFICADO E OTIMIZADO PARA DELIVERY)
// ══════════════════════════════════════════════════════════════════════════

const AGENT_PROMPT = `Você é o atendente virtual do **Novo Sabor Pizza e Esfihas e Açaí**.

📋 **CARDÁPIO DISPONÍVEL:**
${CARDAPIO}

🎯 **SEU OBJETIVO PRINCIPAL:**
1. Cumprimentar o cliente
2. Perguntar o que deseja (pizza, esfiha, bebida, açaí)
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
// PERSONAS DOS CLIENTES (10 TIPOS DIFERENTES)
// ══════════════════════════════════════════════════════════════════════════

const CLIENTES = [
  {
    id: 1,
    nome: "Claudio Indeciso",
    objetivo: "Pizza Calabresa + borda catupiry",
    prompt: `Você é Claudio, um cliente INDECISO. 
Você quer pedir uma pizza mas fica em dúvida entre sabores.
Pergunte sobre preços, sabores disponíveis.
Eventualmente decida por: Pizza Calabresa com borda de Catupiry.
Forneça quando pedirem: Nome: Claudio Santos, Endereço: Rua das Flores 123, Centro, Cuiabá.
Pagamento: PIX.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Simule uma conversa real, não seja robótico.`
  },
  {
    id: 2,
    nome: "Maria Apressada",
    objetivo: "6 Esfihas + Refri 1L (combo)",
    prompt: `Você é Maria, uma cliente APRESSADA e com fome.
Você quer pedir rápido: o Combo 6 Esfihas + Refri 1L.
Responda de forma curta e direta. Se enrolarem, reclame educadamente.
Forneça quando pedirem: Nome: Maria Silva, Endereço: Av Brasil 500, apt 202, Várzea Grande.
Pagamento: Dinheiro (tem troco para R$100).
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Pergunte quanto tempo demora a entrega.`
  },
  {
    id: 3,
    nome: "João Meio a Meio",
    objetivo: "Pizza Grande meio Calabresa meio Frango Catupiry",
    prompt: `Você é João, quer uma PIZZA MEIO A MEIO.
Você quer: Pizza Grande meio Calabresa e meio Frango Catupiry.
Seja detalhista. Confirme o preço duas vezes para ter certeza.
Forneça quando pedirem: Nome: João Pedro, Endereço: Rua 15 de Novembro 789, Boa Esperança, Cuiabá.
Pagamento: Cartão de crédito.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Pergunte se aceita cartão antes de finalizar.`
  },
  {
    id: 4,
    nome: "Ana Vegana",
    objetivo: "Pizza Marguerita + Refri 2L",
    prompt: `Você é Ana, vegetariana (não vegana).
Você quer saber quais pizzas são SEM CARNE.
Escolha a Pizza Marguerita + Refrigerante 2 Litros.
Forneça quando pedirem: Nome: Ana Carolina, Endereço: Alameda das Palmeiras 45, Jardim Imperial, Cuiabá.
Pagamento: PIX.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Seja educada e agradeça.`
  },
  {
    id: 5,
    nome: "Pedro Tech",
    objetivo: "Pizza 4 Queijos + 2 Refrigerante Lata",
    prompt: `Você é Pedro, programador que fala rápido.
Use gírias como "top", "valeu", "show", "blz".
Pedido: 1 Pizza 4 Queijos + 2 Refrigerante Lata 350ml.
Forneça quando pedirem: Nome: Pedro Henrique, Endereço: Rua dos Desenvolvedores 404, Tech Park, Cuiabá.
Pagamento: PIX (é mais rápido).
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Responda rápido e objetivo.`
  },
  {
    id: 6,
    nome: "Lucas Cancelador",
    objetivo: "Testar se consegue cancelar após pedir",
    prompt: `Você é Lucas, um cliente que VAI CANCELAR o pedido.
Comece pedindo uma Pizza Atum.
Depois pergunte o tempo de entrega.
Se for mais de 30 minutos, diga que vai cancelar porque está com muita fome.
Se o atendente oferecer alternativa, diga que prefere cancelar mesmo.
**IMPORTANTE**: Teste se o sistema aceita o cancelamento corretamente.`
  },
  {
    id: 7,
    nome: "Juliana Faminta",
    objetivo: "Pedido GRANDE: Combo + Pizza + Esfihas extras",
    prompt: `Você é Juliana, com MUITA fome e pedido grande.
Pedido: Combo Pizza G + Borda + Refri 1.5L + 4 Esfihas de Carne + 2 Esfihas de Queijo.
Pergunte se ganha algum brinde por pedir muito.
Forneça quando pedirem: Nome: Juliana Costa, Endereço: Rua Principal 1000, Centro, Várzea Grande.
Pagamento: Cartão de débito.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.
Seja simpática e animada.`
  },
  {
    id: 8,
    nome: "Roberto Econômico",
    objetivo: "Menor preço possível (combo esfihas)",
    prompt: `Você é Roberto, cliente ECONÔMICO.
Pergunte qual a opção mais barata ou a promoção do dia.
Tente negociar a taxa de entrega.
Se não conseguir desconto, peça: Combo 6 Esfihas + Refri 1L (o mais barato).
Forneça quando pedirem: Nome: Roberto Oliveira, Endereço: Rua das Economias 321, Bairro Novo, Cuiabá.
Pagamento: Dinheiro (troco pra R$50).
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.`
  },
  {
    id: 9,
    nome: "Fernanda Confusa",
    objetivo: "Mudar pedido e endereço no meio",
    prompt: `Você é Fernanda, cliente CONFUSA.
Primeiro peça uma Pizza, depois diga que se enganou e queria esfihas.
Depois volte e peça pizza mesmo (Calabresa).
Passe endereço errado primeiro (Rua A, 100), depois corrija (Rua B, 200, Centro).
Forneça quando pedirem: Nome: Fernanda Lima.
Pagamento: PIX.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo CORRETO final.`
  },
  {
    id: 10,
    nome: "Marcos Noturno",
    objetivo: "Pedido rápido tarde da noite",
    prompt: `Você é Marcos, pedindo TARDE (já é noite).
Pergunte primeiro se ainda estão entregando.
Depois peça: Pizza Mussarela simples.
Peça confirmação de que chega quente.
Forneça quando pedirem: Nome: Marcos Nogueira, Endereço: Av das Américas 999, apt 505, Cuiabá.
Pagamento: PIX.
**IMPORTANTE**: Você DEVE confirmar o pedido quando mostrarem o resumo final.`
  }
];

// ══════════════════════════════════════════════════════════════════════════
// LOGGER
// ══════════════════════════════════════════════════════════════════════════

const LOG_FILE = path.join(process.cwd(), 'relatorio-ia-vs-ia-delivery.md');
let fullLog = `# RELATÓRIO: TESTE IA VS IA - DELIVERY COMPLETO\n\n`;
fullLog += `📅 Data: ${new Date().toLocaleString('pt-BR')}\n`;
fullLog += `🤖 Modelo Agente: ${CONFIG.MODEL}\n`;
fullLog += `👤 Modelo Cliente: ${CONFIG.CLIENT_MODEL}\n`;
fullLog += `🔑 API Key: ${CONFIG.MISTRAL_API_KEY.substring(0, 8)}...***\n\n`;
fullLog += `---\n\n`;

function log(msg: string) {
  console.log(msg);
  fullLog += msg + '\n';
}

function saveLog() {
  fs.writeFileSync(LOG_FILE, fullLog);
  console.log(`\n💾 Relatório salvo em: ${LOG_FILE}`);
}

// ══════════════════════════════════════════════════════════════════════════
// THROTTLE GLOBAL COM ROTAÇÃO DE MODELOS (IGUAL PRODUÇÃO)
// ══════════════════════════════════════════════════════════════════════════

// Cooldown por modelo (como na produção)
const modelCooldowns: Map<string, number> = new Map();

function isModelAvailable(model: string): boolean {
  const cooldownUntil = modelCooldowns.get(model);
  if (!cooldownUntil) return true;
  return Date.now() >= cooldownUntil;
}

function markModelRateLimited(model: string) {
  modelCooldowns.set(model, Date.now() + CONFIG.MODEL_COOLDOWN);
  log(`🚫 Modelo ${model} em cooldown por ${CONFIG.MODEL_COOLDOWN/1000}s`);
}

function getAvailableModel(): { model: string; delay: number } {
  // Tenta encontrar um modelo disponível
  for (let i = 0; i < MISTRAL_MODELS.length; i++) {
    const { model, delay } = getNextModel();
    if (isModelAvailable(model)) {
      return { model, delay };
    }
  }
  // Todos em cooldown - usa o primeiro e espera
  const fallback = MISTRAL_MODELS[0];
  return { model: fallback.model, delay: fallback.delaySeconds * 1000 };
}

let nextAllowedAt = 0;
async function throttleGlobal(extraDelay = 0) {
  const now = Date.now();
  const waitUntil = Math.max(nextAllowedAt, now) + extraDelay;
  if (now < waitUntil) {
    const waitMs = waitUntil - now;
    await new Promise(r => setTimeout(r, waitMs));
  }
  nextAllowedAt = Date.now() + CONFIG.MIN_REQUEST_INTERVAL;
}

// ══════════════════════════════════════════════════════════════════════════
// FUNÇÃO DE CHAMADA COM ROTAÇÃO (IGUAL PRODUÇÃO llm.ts)
// ══════════════════════════════════════════════════════════════════════════

async function callWithRotation(
  client: Mistral,
  messages: any[],
  role: 'agent' | 'client'
): Promise<string> {
  const maxModelAttempts = MISTRAL_MODELS.length * 2; // Tenta cada modelo 2x
  const triedModels: string[] = [];
  
  for (let attempt = 1; attempt <= maxModelAttempts; attempt++) {
    const { model, delay } = getAvailableModel();
    
    // Throttle global + delay específico do modelo
    await throttleGlobal(delay);
    
    log(`🔄 [${role.toUpperCase()}] Tentando modelo ${model} (tentativa ${attempt}/${maxModelAttempts})`);
    
    try {
      const response = await client.chat.complete({
        model,
        messages,
      });
      
      const rawContent = response.choices?.[0]?.message?.content;
      const content = typeof rawContent === 'string' ? rawContent : (rawContent?.[0] as any)?.text || '';
      log(`✅ [${role.toUpperCase()}] Modelo ${model} respondeu`);
      return content;
      
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      const statusCode = e?.status || e?.statusCode;
      
      // Rate limit - marca cooldown e tenta próximo modelo
      if (errorMsg.includes('429') || statusCode === 429 || errorMsg.toLowerCase().includes('rate limit')) {
        log(`⚠️ Rate limit no modelo ${model}`);
        markModelRateLimited(model);
        triedModels.push(model);
        
        // Espera extra antes de tentar próximo
        await new Promise(r => setTimeout(r, CONFIG.RATE_LIMIT_DELAY));
        continue;
      }
      
      // Outros erros - tenta próximo modelo
      if (statusCode === 503 || statusCode === 502 || errorMsg.includes('timeout')) {
        log(`⚠️ Erro temporário no modelo ${model}: ${statusCode}`);
        await new Promise(r => setTimeout(r, 10000));
        continue;
      }
      
      // Erro fatal
      throw e;
    }
  }
  
  throw new Error(`Todos os modelos falharam após ${maxModelAttempts} tentativas`);
}

// ══════════════════════════════════════════════════════════════════════════
// SIMULAÇÃO DE CONVERSA
// ══════════════════════════════════════════════════════════════════════════

interface ConversationResult {
  clienteId: number;
  clienteNome: string;
  objetivo: string;
  sucesso: boolean;
  pedidoConfirmado: boolean;
  numeroPedido?: string;
  turnos: number;
  erros: string[];
  conversaCompleta: string[];
}

async function runConversation(
  client: Mistral,
  persona: typeof CLIENTES[0]
): Promise<ConversationResult> {
  const result: ConversationResult = {
    clienteId: persona.id,
    clienteNome: persona.nome,
    objetivo: persona.objetivo,
    sucesso: false,
    pedidoConfirmado: false,
    turnos: 0,
    erros: [],
    conversaCompleta: [],
  };

  // Históricos separados para cada IA
  const agentHistory: { role: string; content: string }[] = [
    { role: 'system', content: AGENT_PROMPT }
  ];
  
  const clientHistory: { role: string; content: string }[] = [
    { role: 'system', content: persona.prompt }
  ];

  // Cliente inicia a conversa
  let lastMessage = 'Oi, gostaria de fazer um pedido.';
  log(`🧑 **${persona.nome}**: ${lastMessage}`);
  result.conversaCompleta.push(`[CLIENTE] ${lastMessage}`);
  
  agentHistory.push({ role: 'user', content: lastMessage });
  clientHistory.push({ role: 'assistant', content: lastMessage });

  let isFinished = false;

  while (result.turnos < CONFIG.MAX_TURNS && !isFinished) {
    result.turnos++;

    // --- TURNO DO AGENTE (usando rotação de modelos) ---
    try {
      const agentText = await callWithRotation(client, agentHistory as any, 'agent');
      
      log(`🤖 **Agente**: ${agentText}`);
      result.conversaCompleta.push(`[AGENTE] ${agentText}`);
      
      agentHistory.push({ role: 'assistant', content: agentText });
      clientHistory.push({ role: 'user', content: agentText });

      // Verificar se pedido foi confirmado
      const agentLower = agentText.toLowerCase();
      if (agentLower.includes('pedido confirmado') || 
          agentLower.includes('pedido #') ||
          agentLower.includes('número do pedido') ||
          agentLower.includes('confirmado com sucesso')) {
        log(`🏁 **PEDIDO CONFIRMADO!**`);
        result.pedidoConfirmado = true;
        result.sucesso = true;
        
        // Extrair número do pedido se houver
        const numMatch = agentText.match(/#(\d+)/);
        if (numMatch) {
          result.numeroPedido = numMatch[1];
        }
        
        isFinished = true;
        break;
      }

    } catch (e: any) {
      result.erros.push(`Erro Agente: ${e?.message}`);
      log(`❌ Erro Agente: ${e?.message}`);
      break;
    }

    // --- TURNO DO CLIENTE (usando rotação de modelos) ---
    try {
      const clientText = await callWithRotation(client, clientHistory as any, 'client');
      
      log(`🧑 **${persona.nome}**: ${clientText}`);
      result.conversaCompleta.push(`[CLIENTE] ${clientText}`);
      
      agentHistory.push({ role: 'user', content: clientText });
      clientHistory.push({ role: 'assistant', content: clientText });

      // Verificar se cliente cancelou
      const clientLower = clientText.toLowerCase();
      if (clientLower.includes('cancelar') || 
          clientLower.includes('desisto') ||
          clientLower.includes('não quero mais')) {
        if (persona.id === 6) { // Lucas Cancelador - esperado cancelar
          log(`🚫 **PEDIDO CANCELADO (esperado para este teste)**`);
          result.sucesso = true; // Sucesso porque era o objetivo
          isFinished = true;
        }
      }

    } catch (e: any) {
      result.erros.push(`Erro Cliente: ${e?.message}`);
      log(`❌ Erro Cliente: ${e?.message}`);
      break;
    }
  }

  if (!isFinished && result.turnos >= CONFIG.MAX_TURNS) {
    result.erros.push('Excedeu máximo de turnos sem finalizar');
    log(`⚠️ **Conversa excedeu limite de ${CONFIG.MAX_TURNS} turnos**`);
  }

  return result;
}

// ══════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════

async function main() {
  log(`# 🚀 INICIANDO TESTES IA VS IA - DELIVERY\n`);
  log(`Testando ${CLIENTES.length} clientes diferentes\n`);
  log(`${'═'.repeat(60)}\n`);

  // Inicializar cliente Mistral
  const mistral = new Mistral({ apiKey: CONFIG.MISTRAL_API_KEY });
  
  const resultados: ConversationResult[] = [];
  
  for (const cliente of CLIENTES) {
    log(`\n## 🎭 TESTE ${cliente.id}: ${cliente.nome}`);
    log(`**Objetivo**: ${cliente.objetivo}`);
    log(`${'─'.repeat(50)}\n`);
    
    try {
      const resultado = await runConversation(mistral, cliente);
      resultados.push(resultado);
      
      log(`\n### Resultado:`);
      log(`- ✅ Sucesso: ${resultado.sucesso ? 'SIM' : 'NÃO'}`);
      log(`- 📦 Pedido Confirmado: ${resultado.pedidoConfirmado ? 'SIM' : 'NÃO'}`);
      if (resultado.numeroPedido) {
        log(`- 🎫 Número: #${resultado.numeroPedido}`);
      }
      log(`- 💬 Turnos: ${resultado.turnos}`);
      if (resultado.erros.length > 0) {
        log(`- ❌ Erros: ${resultado.erros.join(', ')}`);
      }
      log(`\n${'═'.repeat(60)}`);
      
    } catch (e: any) {
      log(`❌ ERRO FATAL no teste ${cliente.id}: ${e?.message}`);
      resultados.push({
        clienteId: cliente.id,
        clienteNome: cliente.nome,
        objetivo: cliente.objetivo,
        sucesso: false,
        pedidoConfirmado: false,
        turnos: 0,
        erros: [e?.message],
        conversaCompleta: [],
      });
    }
    
    // Pausa entre testes para evitar rate limit
    log(`\n⏳ Aguardando 10s antes do próximo teste...\n`);
    await new Promise(r => setTimeout(r, 10000));
  }

  // ══════════════════════════════════════════════════════════════════════════
  // RESUMO FINAL
  // ══════════════════════════════════════════════════════════════════════════
  
  log(`\n\n# 📊 RESUMO FINAL\n`);
  log(`| # | Cliente | Objetivo | Sucesso | Confirmado | Turnos |`);
  log(`|---|---------|----------|---------|------------|--------|`);
  
  let sucessos = 0;
  let confirmados = 0;
  
  for (const r of resultados) {
    if (r.sucesso) sucessos++;
    if (r.pedidoConfirmado) confirmados++;
    
    const statusIcon = r.sucesso ? '✅' : '❌';
    const confirmIcon = r.pedidoConfirmado ? '✅' : '❌';
    log(`| ${r.clienteId} | ${r.clienteNome} | ${r.objetivo.substring(0, 30)}... | ${statusIcon} | ${confirmIcon} | ${r.turnos} |`);
  }
  
  log(`\n## 📈 ESTATÍSTICAS`);
  log(`- Total de Testes: ${resultados.length}`);
  log(`- Sucessos: ${sucessos}/${resultados.length} (${((sucessos/resultados.length)*100).toFixed(0)}%)`);
  log(`- Pedidos Confirmados: ${confirmados}/${resultados.length}`);
  
  if (sucessos === resultados.length) {
    log(`\n🎉 **TODOS OS TESTES PASSARAM!** O sistema está pronto para produção.`);
  } else {
    log(`\n⚠️ **${resultados.length - sucessos} testes falharam.** Revisar prompt e tentar novamente.`);
  }

  saveLog();
  process.exit(sucessos === resultados.length ? 0 : 1);
}

main().catch(e => {
  console.error('Erro fatal:', e);
  saveLog();
  process.exit(1);
});
