/**
 * 🧪 TESTE PROFUNDO - UM NEGÓCIO POR VEZ
 * 
 * Testa conversa completa com cliente difícil/pessimista
 * Gera log detalhado para análise posterior
 * Executa 30 mensagens de conversa real
 */

// ============================================================================
// CONFIGURAÇÃO
// ============================================================================

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";
const MISTRAL_URL = "https://api.mistral.ai/v1/chat/completions";

// Negócio atual sendo testado
const BUSINESS = {
  name: "Auto Peças Silva",
  type: "Loja de Auto Peças",
  owner: "Seu Silva",
  description: "Loja de auto peças com peças para carros nacionais e importados. Entrega rápida na região."
};

// ============================================================================
// CLIENTE IA (Claude) - PESSIMISTA E DIFÍCIL
// ============================================================================

const CLIENT_PROMPT = `Você é ${BUSINESS.owner}, DONO(A) da "${BUSINESS.name}" (${BUSINESS.type}).
${BUSINESS.description}

🎯 SITUAÇÃO:
Você está conversando com Rodrigo, vendedor da AgenteZap (sistema de IA para WhatsApp).
Você quer saber se vale a pena COMPRAR a AgenteZap para usar na SUA loja.

🔴 SUA PERSONALIDADE (CLIENTE DIFÍCIL):
- Você é DESCONFIADO e CÉTICO
- Você já foi enganado antes por chatbots ruins
- Você questiona TUDO sobre a AgenteZap
- Você pede explicações detalhadas
- Você levanta OBJEÇÕES constantemente
- Você às vezes repete perguntas para testar se ele repete respostas
- Você testa se ele entende seu tipo de negócio (${BUSINESS.type})
- Você menciona a concorrência ("vi outro mais barato")
- Você diz "vou pensar" para ver como ele reage
- Você pede descontos

🎯 TÁTICAS DE TESTE:
1. Pergunte "como funciona a AgenteZap" e veja se ele explica bem
2. Depois pergunte de novo "não entendi, explica de novo" - ele NÃO deve repetir igual
3. Peça preço e veja se ele responde
4. Diga que "é caro" e veja como ele lida
5. Pergunte como a IA vai ajudar especificamente sua ${BUSINESS.type}
6. Faça objeções: "já tentei chatbot e não funcionou"
7. Diga "vou pensar" para ver se ele insiste corretamente

📝 FORMATO:
- Responda APENAS como cliente interessado em COMPRAR a AgenteZap
- Use linguagem informal (vc, tá, pra, etc)
- Seja breve (1-3 linhas por mensagem)
- Às vezes demonstre interesse, às vezes desinteresse
- Varie entre positivo e negativo durante a conversa

IMPORTANTE: Você quer ser CONVENCIDO a comprar a AgenteZap, mas não facilita.`;

// ============================================================================
// AGENTE DE VENDAS (Rodrigo) - PROMPT DO SISTEMA
// ============================================================================

const AGENT_PROMPT = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

🚨🚨🚨 IMPORTANTE: VOCÊ VENDE A AGENTEZAP, NÃO ROUPAS! 🚨🚨🚨
O cliente ${BUSINESS.owner} é DONO de uma ${BUSINESS.type} e quer comprar a AgenteZap para usar NO NEGÓCIO DELE.
Você está vendendo o SISTEMA DE IA para ele usar no atendimento da loja dele.

═══════════════════════════════════════════════════════════════════════════════
🎯 CONTEXTO DO CLIENTE
═══════════════════════════════════════════════════════════════════════════════
Nome: ${BUSINESS.owner}
Empresa dele: ${BUSINESS.name}
Tipo de negócio: ${BUSINESS.type}
Descrição: ${BUSINESS.description}

🎯 O QUE VOCÊ VENDE:
- Sistema AgenteZap - IA para WhatsApp que atende clientes 24/7
- Preço: R$ 99/mês
- Teste grátis de 7 dias
- A IA vai ajudar ${BUSINESS.owner} a atender os clientes da ${BUSINESS.name}

═══════════════════════════════════════════════════════════════════════════════
📋 REGRAS CRÍTICAS (OBEDEÇA SEMPRE)
═══════════════════════════════════════════════════════════════════════════════

🚫 REGRA #1 - NUNCA REPETIR:
- Se o cliente perguntar algo que você JÁ RESPONDEU → NÃO repita a mesma explicação
- ⛔ NUNCA diga "Já falei sobre isso!" - é rude!
- Quando cliente repete pergunta → OFEREÇA O TESTE como solução!
- Diga: "A melhor forma de entender é testando! Posso criar seu acesso?" [AÇÃO:CRIAR_CONTA_TESTE]
- Se sua resposta ficar parecida com uma anterior → MUDE COMPLETAMENTE
- VARIE as palavras, exemplos e abordagem a cada mensagem

� REGRA #2 - NUNCA REPETIR A PERGUNTA FINAL:
CADA MENSAGEM DEVE TER UMA PERGUNTA/CTA DIFERENTE! Use estas variações:
• "O que acha de testar por 7 dias sem compromisso?"
• "Posso criar seu acesso agora mesmo?"
• "Qual sua maior dúvida ainda?"
• "Quantos clientes vocês atendem por dia no WhatsApp?"
• "Qual horário mais pega fogo aí na loja?"
• "Bora começar o teste?"
• "Me conta mais sobre seu negócio..."
• "O que te impede de testar agora?"
• "Quer que eu explique algum detalhe?"
• "Ficou alguma dúvida?"
• "Faz sentido pra você?"
• "Tá pronto pra dar esse passo?"

📁 REGRA #3 - MÍDIAS:
- Quando mencionar "como funciona" → ADICIONE: [ENVIAR_MIDIA:COMO_FUNCIONA]
- Quando mencionar "vídeo" ou "demonstração" → ADICIONE: [ENVIAR_MIDIA:VIDEO_DEMONSTRACAO]
- Quando mencionar "preço" ou "valor" → ADICIONE: [ENVIAR_MIDIA:TABELA_PRECOS]
- A tag vai NO FINAL da sua resposta
- NÃO envie a mesma mídia várias vezes - MÁXIMO 2x cada na conversa toda!

📏 REGRA #4 - TAMANHO:
- Respostas entre 3-5 linhas (nem muito curta, nem muito longa)
- Sempre termine com uma PERGUNTA ou CHAMADA PARA AÇÃO (mas DIFERENTE da anterior!)

🎯 REGRA #5 - FOCO:
- Você vende AgenteZap (sistema de IA) PARA o cliente usar no negócio dele
- NÃO venda os produtos do cliente (roupas, comida, etc)
- Fale sobre como a AgenteZap vai ajudar a ${BUSINESS.type} do cliente

🚨 REGRA #6 - CRIAR CONTA TESTE (OBRIGATÓRIO!):
A PARTIR DA SUA 3ª RESPOSTA, você DEVE incluir [AÇÃO:CRIAR_CONTA_TESTE] no final!
Exemplos de como usar:
• "...vamos criar seu teste agora?" [AÇÃO:CRIAR_CONTA_TESTE]
• "...posso gerar seu acesso?" [AÇÃO:CRIAR_CONTA_TESTE]
• "...que tal testar na prática?" [AÇÃO:CRIAR_CONTA_TESTE]
Se o cliente perguntar a mesma coisa 2x → PARE de explicar e ofereça o teste!

═══════════════════════════════════════════════════════════════════════════════
💰 SOBRE A AGENTEZAP (o que você vende)
═══════════════════════════════════════════════════════════════════════════════
- Agente de IA para WhatsApp que atende 24/7
- Responde clientes, fecha vendas, agenda serviços
- Preço: R$ 99/mês
- Teste grátis de 7 dias
- Atende igual humano

EXEMPLO DE PITCH para ${BUSINESS.type}:
"Imagina a AgenteZap respondendo seus clientes que querem saber sobre as roupas, 
enviando fotos do catálogo, tirando dúvidas de tamanho e até fechando vendas pelo 
WhatsApp enquanto você dorme!"

═══════════════════════════════════════════════════════════════════════════════
⚡ AÇÕES DISPONÍVEIS (use no final da resposta)
═══════════════════════════════════════════════════════════════════════════════
[AÇÃO:CRIAR_CONTA_TESTE] - Criar conta de teste grátis
[AÇÃO:ENVIAR_PIX] - Enviar QR Code do PIX`;

// ============================================================================
// FUNÇÕES DE API
// ============================================================================

async function callMistral(messages: any[], temperature: number = 0.8): Promise<string> {
  const response = await fetch(MISTRAL_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${MISTRAL_API_KEY}`
    },
    body: JSON.stringify({
      model: "mistral-small-latest",
      messages: messages,
      temperature: temperature,
      max_tokens: 500
    })
  });

  if (!response.ok) {
    throw new Error(`Mistral API error: ${response.status}`);
  }

  const data = await response.json();
  return data.choices[0].message.content;
}

async function callClient(systemPrompt: string, userMessage: string): Promise<string> {
  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage }
  ];
  return callMistral(messages, 0.9);
}

// ============================================================================
// CONVERSA E LOG
// ============================================================================

interface ConversationLog {
  business: typeof BUSINESS;
  startTime: string;
  messages: Array<{
    msgNum: number;
    role: "client" | "agent";
    content: string;
    mediaTagsFound: string[];
    actionsFound: string[];
    timestamp: string;
  }>;
  analysis: {
    totalMessages: number;
    mediaTagsUsed: string[];
    actionsUsed: string[];
    potentialRepetitions: string[];
    clientConvinced: boolean;
    observations: string[];
  };
}

async function runConversation(): Promise<ConversationLog> {
  console.log("\n" + "═".repeat(70));
  console.log(`🏪 TESTANDO: ${BUSINESS.name} (${BUSINESS.type})`);
  console.log(`👤 Cliente: ${BUSINESS.owner} (PESSIMISTA/DIFÍCIL)`);
  console.log("═".repeat(70) + "\n");

  const log: ConversationLog = {
    business: BUSINESS,
    startTime: new Date().toISOString(),
    messages: [],
    analysis: {
      totalMessages: 0,
      mediaTagsUsed: [],
      actionsUsed: [],
      potentialRepetitions: [],
      clientConvinced: false,
      observations: []
    }
  };

  // Histórico para cada IA
  const clientHistory: any[] = [];
  const agentHistory: any[] = [
    { role: "system", content: AGENT_PROMPT }
  ];

  // Primeira mensagem do cliente
  let clientMessage = await callClient(CLIENT_PROMPT, "Inicie a conversa como cliente interessado mas desconfiado. Primeira mensagem curta.");

  const NUM_EXCHANGES = 15; // 30 mensagens total (15 de cada lado)

  for (let i = 0; i < NUM_EXCHANGES; i++) {
    const msgNumClient = i * 2 + 1;
    const msgNumAgent = i * 2 + 2;

    // Log mensagem do cliente
    console.log(`👤 [${msgNumClient}] ${BUSINESS.owner}: ${clientMessage.substring(0, 100)}${clientMessage.length > 100 ? '...' : ''}`);
    
    log.messages.push({
      msgNum: msgNumClient,
      role: "client",
      content: clientMessage,
      mediaTagsFound: [],
      actionsFound: [],
      timestamp: new Date().toISOString()
    });

    // Adiciona ao histórico do agente
    agentHistory.push({ role: "user", content: clientMessage });

    // Resposta do agente (Rodrigo)
    const agentResponse = await callMistral(agentHistory);
    
    // Extrair tags de mídia e ações
    const mediaTags = agentResponse.match(/\[ENVIAR_MIDIA:[A-Z0-9_]+\]/gi) || [];
    const actions = agentResponse.match(/\[AÇÃO:[^\]]+\]/gi) || [];
    
    // Log mensagem do agente
    console.log(`🤖 [${msgNumAgent}] Rodrigo: ${agentResponse.substring(0, 100)}${agentResponse.length > 100 ? '...' : ''}`);
    if (mediaTags.length > 0) console.log(`   📁 Mídias: ${mediaTags.join(', ')}`);
    if (actions.length > 0) console.log(`   ⚡ Ações: ${actions.join(', ')}`);

    log.messages.push({
      msgNum: msgNumAgent,
      role: "agent",
      content: agentResponse,
      mediaTagsFound: mediaTags,
      actionsFound: actions,
      timestamp: new Date().toISOString()
    });

    // Atualizar análise
    log.analysis.mediaTagsUsed.push(...mediaTags);
    log.analysis.actionsUsed.push(...actions);

    // Adiciona ao histórico
    agentHistory.push({ role: "assistant", content: agentResponse });

    // Próxima mensagem do cliente (se não for a última)
    if (i < NUM_EXCHANGES - 1) {
      const clientContext = `Você está em uma conversa de vendas. O vendedor acabou de dizer:
"${agentResponse}"

Continue a conversa como cliente. Baseado na resposta do vendedor:
- Se ele repetiu algo que já disse antes, reclame
- Se ele não respondeu sua dúvida, insista
- Se ele está te convencendo, mostre um pouco mais de interesse (mas ainda desconfiado)
- Às vezes faça objeções como "é caro", "vou pensar", "já tentei chatbot"
- Seja breve (1-3 linhas)`;
      
      clientMessage = await callClient(CLIENT_PROMPT, clientContext);
    }

    // Pequena pausa
    await new Promise(r => setTimeout(r, 1000));
  }

  log.analysis.totalMessages = log.messages.length;
  
  console.log("\n" + "═".repeat(70));
  console.log("✅ CONVERSA FINALIZADA - GERANDO LOG");
  console.log("═".repeat(70));

  return log;
}

// ============================================================================
// SALVAR LOG
// ============================================================================

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function saveLog(log: ConversationLog): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `conversation-log-${BUSINESS.type.replace(/\s+/g, '-')}-${timestamp}.json`;
  const filepath = path.join(__dirname, '..', 'logs', filename);
  
  // Criar pasta logs se não existir
  const logsDir = path.join(__dirname, '..', 'logs');
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  fs.writeFileSync(filepath, JSON.stringify(log, null, 2), 'utf-8');
  
  // Também criar versão legível em texto
  const textFilename = filename.replace('.json', '.txt');
  const textFilepath = path.join(logsDir, textFilename);
  
  let textContent = `
════════════════════════════════════════════════════════════════════════════════
📋 LOG DE CONVERSA - ${BUSINESS.name} (${BUSINESS.type})
════════════════════════════════════════════════════════════════════════════════
Data: ${log.startTime}
Cliente: ${BUSINESS.owner}
Total de Mensagens: ${log.analysis.totalMessages}

════════════════════════════════════════════════════════════════════════════════
💬 CONVERSA COMPLETA
════════════════════════════════════════════════════════════════════════════════

`;

  for (const msg of log.messages) {
    const icon = msg.role === 'client' ? '👤' : '🤖';
    const name = msg.role === 'client' ? BUSINESS.owner : 'Rodrigo';
    textContent += `${icon} [${msg.msgNum}] ${name}:\n${msg.content}\n`;
    if (msg.mediaTagsFound.length > 0) {
      textContent += `   📁 Mídias: ${msg.mediaTagsFound.join(', ')}\n`;
    }
    if (msg.actionsFound.length > 0) {
      textContent += `   ⚡ Ações: ${msg.actionsFound.join(', ')}\n`;
    }
    textContent += '\n' + '─'.repeat(60) + '\n\n';
  }

  textContent += `
════════════════════════════════════════════════════════════════════════════════
📊 ESTATÍSTICAS
════════════════════════════════════════════════════════════════════════════════
Mídias Usadas: ${[...new Set(log.analysis.mediaTagsUsed)].join(', ') || 'Nenhuma'}
Ações Usadas: ${[...new Set(log.analysis.actionsUsed)].join(', ') || 'Nenhuma'}
Total de Tags de Mídia: ${log.analysis.mediaTagsUsed.length}
Total de Ações: ${log.analysis.actionsUsed.length}

════════════════════════════════════════════════════════════════════════════════
🔍 ANÁLISE PENDENTE
════════════════════════════════════════════════════════════════════════════════
(Análise será feita pelo agente após revisão do log)
`;

  fs.writeFileSync(textFilepath, textContent, 'utf-8');

  console.log(`\n📁 Log JSON salvo em: ${filepath}`);
  console.log(`📄 Log TXT salvo em: ${textFilepath}`);
  
  return textFilepath;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════════════╗
║   TESTE PROFUNDO - UM NEGÓCIO POR VEZ                            ║
║   Cliente Pessimista • 30 mensagens • Log Detalhado              ║
╚══════════════════════════════════════════════════════════════════╝
`);

  try {
    const log = await runConversation();
    const logPath = saveLog(log);
    
    console.log(`
════════════════════════════════════════════════════════════════════════════════
✅ TESTE CONCLUÍDO

📋 PRÓXIMO PASSO: Analisar o log gerado em:
   ${logPath}

🔍 O agente irá:
   1. Ler o log completo
   2. Identificar problemas (repetições, mídias faltando, etc)
   3. Corrigir no código
   4. Testar novamente
   5. Repetir até score 100
════════════════════════════════════════════════════════════════════════════════
`);
  } catch (error) {
    console.error("❌ ERRO:", error);
  }
}

main();
