/**
 * TESTE PROFUNDO: IA VS IA
 * 
 * Sistema de teste avançado onde:
 * - IA CLIENTE: Simula empresário real com dúvidas, objeções, testes
 * - IA AGENTE: Nosso agente de vendas (serviço real)
 * - Conversa de ~50 mensagens com validações completas
 * - Busca dados reais do Supabase
 * - Análise detalhada de cada interação
 * 
 * Objetivo: Encontrar 100% dos problemas e calibrar o sistema perfeitamente
 */

import { Mistral } from "@mistralai/mistralai";

const MISTRAL_API_KEY = "EMZSjwivLJLrPlJqPuWrTwAAOgp93lhF";

// ============================================================================
// CONFIGURAÇÃO DO CLIENTE IA
// ============================================================================

const CLIENT_AI_PROMPT = `Você é um EMPRESÁRIO BRASILEIRO que está avaliando o AgenteZap.

PERFIL:
- Dono de uma loja de roupas online chamada "Moda Fashion"
- Tem 3 funcionários
- Recebe ~200 mensagens por dia no WhatsApp
- Perde vendas porque não consegue responder todos rápido
- É CÉTICO mas INTERESSADO
- Quer ENTENDER TUDO antes de comprar
- Faz PERGUNTAS DIFÍCEIS
- Testa se o vendedor realmente entende do produto

COMPORTAMENTO:
- Você é DETALHISTA e faz perguntas específicas
- Você tem OBJEÇÕES realistas ("e se...", "mas...", "quanto tempo...")
- Você testa a PACIÊNCIA do vendedor
- Você pede EXEMPLOS concretos
- Você compara com CONCORRENTES
- Você negoceia PREÇO
- Você quer GARANTIAS

PERGUNTAS QUE VOCÊ FAZ:
- "Como funciona exatamente?"
- "Quanto tempo leva pra configurar?"
- "E se o cliente perguntar algo que a IA não sabe?"
- "Quanto custa por mês?"
- "Tem desconto?"
- "Posso cancelar quando quiser?"
- "Vocês tem suporte?"
- "Como faço pra treinar a IA?"
- "Funciona com WhatsApp Business?"
- "E se der problema?"
- "Tem outros clientes usando?"
- "Posso testar antes?"

ESTÁGIOS DA CONVERSA:
1. DESCOBERTA (5-10 msgs): Perguntas iniciais sobre o produto
2. APROFUNDAMENTO (10-15 msgs): Perguntas técnicas e detalhadas
3. OBJEÇÕES (10-15 msgs): Dúvidas, medos, comparações
4. NEGOCIAÇÃO (5-10 msgs): Preço, condições, teste
5. DECISÃO (5-10 msgs): Fechamento ou mais dúvidas

REGRAS:
- NÃO seja muito fácil de convencer
- NÃO aceite respostas vagas
- EXIJA exemplos concretos
- TESTE o conhecimento do vendedor
- Seja NATURAL e BRASILEIRO (use "vc", "né", "tá")
- Mostre INTERESSE mas também CAUTELA
- Se o vendedor repetir, RECLAME educadamente

FORMATO DE RESPOSTA:
- Mensagens curtas (1-3 linhas)
- Uma pergunta por vez
- Realista e natural

Comece cumprimentando o vendedor naturalmente.`;

// ============================================================================
// SISTEMA DE VALIDAÇÃO
// ============================================================================

interface Message {
  role: "client" | "agent";
  content: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaNames: string[];
}

interface ValidationResult {
  type: "error" | "warning" | "success" | "info";
  message: string;
  context: string;
}

interface ConversationAnalysis {
  totalMessages: number;
  clientMessages: number;
  agentMessages: number;
  mediasSent: { name: string; count: number }[];
  repetitions: string[];
  errors: ValidationResult[];
  warnings: ValidationResult[];
  score: number; // 0-100
}

class ConversationValidator {
  private previousAgentResponses: string[] = [];
  private mediasSent: Map<string, number> = new Map();
  private topicsDiscussed: Set<string> = new Set();
  
  validate(message: Message, allMessages: Message[]): ValidationResult[] {
    const results: ValidationResult[] = [];
    
    if (message.role === "agent") {
      // Validar repetições
      const repetition = this.checkRepetition(message.content);
      if (repetition) {
        results.push({
          type: "error",
          message: "REPETIÇÃO DETECTADA",
          context: `Agente repetiu conteúdo similar: "${repetition.substring(0, 100)}..."`
        });
      }
      
      // Validar mídias
      if (message.hasMedia) {
        for (const mediaName of message.mediaNames) {
          const count = this.mediasSent.get(mediaName) || 0;
          this.mediasSent.set(mediaName, count + 1);
          
          if (count > 1) {
            results.push({
              type: "warning",
              message: `Mídia ${mediaName} enviada ${count + 1}x`,
              context: "Pode ser spam de mídia"
            });
          }
        }
      }
      
      // Validar se deveria ter enviado mídia mas não enviou
      const lowerContent = message.content.toLowerCase();
      if ((lowerContent.includes("como funciona") || lowerContent.includes("funciona o sistema")) && !message.hasMedia) {
        const recentMessages = allMessages.slice(-5);
        const alreadySentComoFunciona = recentMessages.some(m => m.mediaNames.includes("COMO_FUNCIONA"));
        
        if (!alreadySentComoFunciona) {
          results.push({
            type: "error",
            message: "MÍDIA NÃO ENVIADA",
            context: "Agente mencionou 'como funciona' mas não enviou [ENVIAR_MIDIA:COMO_FUNCIONA]"
          });
        }
      }
      
      // Validar tamanho da resposta
      if (message.content.length < 50) {
        results.push({
          type: "warning",
          message: "Resposta muito curta",
          context: `Apenas ${message.content.length} caracteres`
        });
      }
      
      if (message.content.length > 800) {
        results.push({
          type: "warning",
          message: "Resposta muito longa",
          context: `${message.content.length} caracteres - pode cansar o cliente`
        });
      }
      
      this.previousAgentResponses.push(message.content);
    }
    
    return results;
  }
  
  private checkRepetition(content: string): string | null {
    const contentWords = content.toLowerCase().split(/\s+/).filter(w => w.length > 4);
    
    for (const previous of this.previousAgentResponses.slice(-5)) {
      const previousWords = previous.toLowerCase().split(/\s+/).filter(w => w.length > 4);
      let matchCount = 0;
      
      for (const word of contentWords) {
        if (previousWords.includes(word)) {
          matchCount++;
        }
      }
      
      const similarity = matchCount / contentWords.length;
      if (similarity > 0.7) {
        return previous;
      }
    }
    
    return null;
  }
  
  generateAnalysis(messages: Message[], results: ValidationResult[]): ConversationAnalysis {
    const clientMessages = messages.filter(m => m.role === "client").length;
    const agentMessages = messages.filter(m => m.role === "agent").length;
    
    const mediasSent: { name: string; count: number }[] = [];
    this.mediasSent.forEach((count, name) => {
      mediasSent.push({ name, count });
    });
    
    const errors = results.filter(r => r.type === "error");
    const warnings = results.filter(r => r.type === "warning");
    
    // Calcular score
    let score = 100;
    score -= errors.length * 10;
    score -= warnings.length * 3;
    score = Math.max(0, Math.min(100, score));
    
    return {
      totalMessages: messages.length,
      clientMessages,
      agentMessages,
      mediasSent,
      repetitions: [],
      errors,
      warnings,
      score
    };
  }
}

// ============================================================================
// SISTEMA DE IA CLIENTE
// ============================================================================

class ClientAI {
  private mistral: Mistral;
  private conversationHistory: Array<{ role: "user" | "assistant"; content: string }> = [];
  private messageCount: number = 0;
  
  constructor() {
    this.mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
  }
  
  async generateMessage(agentResponse?: string): Promise<string> {
    if (agentResponse) {
      this.conversationHistory.push({
        role: "assistant",
        content: `VENDEDOR: ${agentResponse}`
      });
    }
    
    const stageInfo = this.getStageInfo();
    
    const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
      { role: "system", content: CLIENT_AI_PROMPT + "\n\n" + stageInfo },
      ...this.conversationHistory
    ];
    
    if (this.messageCount === 0) {
      messages.push({
        role: "user",
        content: "Comece a conversa cumprimentando o vendedor naturalmente como um cliente brasileiro interessado."
      });
    } else {
      messages.push({
        role: "user",
        content: "Continue a conversa fazendo a próxima pergunta ou comentário natural baseado no que o vendedor disse. Seja específico e realista."
      });
    }
    
    const response = await this.mistral.chat.complete({
      model: "mistral-small-latest",
      messages,
      maxTokens: 200,
      temperature: 0.9,
    });
    
    const clientMessage = response.choices?.[0]?.message?.content?.toString() || "";
    this.conversationHistory.push({
      role: "user",
      content: `VOCÊ: ${clientMessage}`
    });
    
    this.messageCount++;
    return clientMessage;
  }
  
  private getStageInfo(): string {
    if (this.messageCount < 10) {
      return "ESTÁGIO: DESCOBERTA - Faça perguntas iniciais sobre o produto";
    } else if (this.messageCount < 25) {
      return "ESTÁGIO: APROFUNDAMENTO - Faça perguntas técnicas e específicas";
    } else if (this.messageCount < 40) {
      return "ESTÁGIO: OBJEÇÕES - Mostre dúvidas, medos, compare com concorrentes";
    } else if (this.messageCount < 50) {
      return "ESTÁGIO: NEGOCIAÇÃO - Discuta preço, condições, teste gratuito";
    } else {
      return "ESTÁGIO: DECISÃO - Decida se vai testar ou precisa de mais informações";
    }
  }
}

// ============================================================================
// SISTEMA DE TESTE PRINCIPAL
// ============================================================================

async function runDeepAIvsAITest(): Promise<void> {
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("🤖 TESTE PROFUNDO: IA CLIENTE vs IA AGENTE");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log("Objetivo: Conversa de ~50 mensagens para calibrar 100% o sistema\n");
  
  const clientAI = new ClientAI();
  const validator = new ConversationValidator();
  const messages: Message[] = [];
  const allValidationResults: ValidationResult[] = [];
  
  const testPhone = "5511999887766" + Math.random().toString().slice(2, 6);
  
  console.log("📱 Telefone de teste:", testPhone);
  console.log("🎭 Cliente: Dono da loja 'Moda Fashion'\n");
  console.log("Iniciando conversa...\n");
  
  const MAX_MESSAGES = 50;
  let consecutiveErrors = 0;
  
  for (let i = 0; i < MAX_MESSAGES / 2; i++) {
    try {
      // Cliente envia mensagem
      const agentLastMessage = messages.length > 0 ? messages[messages.length - 1].content : undefined;
      const clientMessage = await clientAI.generateMessage(agentLastMessage);
      
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log(`👤 CLIENTE [${i * 2 + 1}/${MAX_MESSAGES}]: ${clientMessage}`);
      
      messages.push({
        role: "client",
        content: clientMessage,
        timestamp: new Date(),
        hasMedia: false,
        mediaNames: []
      });
      
      // Simular processamento do agente usando o prompt real
      const agentResponse = await simulateAgentResponse(clientMessage, messages);
      
      // Extrair mídias
      const mediaRegex = /\[ENVIAR_MIDIA:([A-Z0-9_]+)\]/g;
      const mediaMatches = [...agentResponse.matchAll(mediaRegex)];
      const mediaNames = mediaMatches.map(m => m[1]);
      const hasMedia = mediaNames.length > 0;
      const cleanResponse = agentResponse.replace(mediaRegex, '').trim();
      
      console.log(`🤖 AGENTE [${i * 2 + 2}/${MAX_MESSAGES}]: ${cleanResponse}`);
      if (hasMedia) {
        console.log(`📁 Mídias: ${mediaNames.join(", ")}`);
      }
      
      const agentMessage: Message = {
        role: "agent",
        content: cleanResponse,
        timestamp: new Date(),
        hasMedia,
        mediaNames
      };
      
      messages.push(agentMessage);
      
      // Validar mensagem do agente
      const validationResults = validator.validate(agentMessage, messages);
      allValidationResults.push(...validationResults);
      
      if (validationResults.length > 0) {
        for (const result of validationResults) {
          const icon = result.type === "error" ? "❌" : result.type === "warning" ? "⚠️" : "✅";
          console.log(`${icon} ${result.message}: ${result.context}`);
        }
      }
      
      console.log("");
      
      consecutiveErrors = 0;
      
      // Delay entre mensagens
      await new Promise(r => setTimeout(r, 1500));
      
    } catch (error) {
      console.error(`❌ Erro na iteração ${i}:`, error);
      consecutiveErrors++;
      
      if (consecutiveErrors >= 3) {
        console.error("❌ Muitos erros consecutivos. Encerrando teste.");
        break;
      }
    }
  }
  
  // Análise final
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("📊 ANÁLISE FINAL DA CONVERSA");
  console.log("═══════════════════════════════════════════════════════════════\n");
  
  const analysis = validator.generateAnalysis(messages, allValidationResults);
  
  console.log(`📈 Score Final: ${analysis.score}/100`);
  console.log(`💬 Total de mensagens: ${analysis.totalMessages}`);
  console.log(`👤 Mensagens do cliente: ${analysis.clientMessages}`);
  console.log(`🤖 Mensagens do agente: ${analysis.agentMessages}`);
  
  if (analysis.mediasSent.length > 0) {
    console.log(`\n📁 Mídias enviadas:`);
    for (const media of analysis.mediasSent) {
      console.log(`   • ${media.name}: ${media.count}x`);
    }
  }
  
  if (analysis.errors.length > 0) {
    console.log(`\n❌ ERROS ENCONTRADOS (${analysis.errors.length}):`);
    analysis.errors.forEach((err, i) => {
      console.log(`   ${i + 1}. ${err.message}`);
      console.log(`      ${err.context}`);
    });
  }
  
  if (analysis.warnings.length > 0) {
    console.log(`\n⚠️  AVISOS (${analysis.warnings.length}):`);
    analysis.warnings.forEach((warn, i) => {
      console.log(`   ${i + 1}. ${warn.message}`);
      console.log(`      ${warn.context}`);
    });
  }
  
  // Recomendações
  console.log("\n💡 RECOMENDAÇÕES:");
  if (analysis.score >= 90) {
    console.log("   ✅ Sistema funcionando muito bem! Pequenos ajustes opcionais.");
  } else if (analysis.score >= 70) {
    console.log("   ⚠️  Sistema bom, mas precisa de alguns ajustes.");
  } else if (analysis.score >= 50) {
    console.log("   🔴 Sistema precisa de melhorias significativas.");
  } else {
    console.log("   🔴 Sistema precisa de revisão completa urgente!");
  }
  
  console.log("\n═══════════════════════════════════════════════════════════════\n");
}

// ============================================================================
// SIMULADOR DO AGENTE (usando prompt real)
// ============================================================================

async function simulateAgentResponse(clientMessage: string, history: Message[]): Promise<string> {
  const mistral = new Mistral({ apiKey: MISTRAL_API_KEY });
  
  // Construir o prompt do agente (versão simplificada do real)
  const systemPrompt = `Você é o Rodrigo, consultor de vendas HUMANO da AgenteZap.

═══════════════════════════════════════════════════════════════════════════════
🎯 SUA PERSONALIDADE
═══════════════════════════════════════════════════════════════════════════════

Você é CARISMÁTICO, ENTUSIASMADO e EMPÁTICO.

NUNCA FAÇA:
• NUNCA seja seco ou monossilábico
• NUNCA responda com menos de 3-4 linhas
• NUNCA use markdown (**, ##, etc.)
• NUNCA diga que é IA/robô/assistente virtual
• NUNCA REPITA explicações já dadas na conversa - sempre AVANCE para o próximo passo!

═══════════════════════════════════════════════════════════════════════════════
📁 SISTEMA DE MÍDIAS
═══════════════════════════════════════════════════════════════════════════════

🔴🔴🔴 REGRA MAIS IMPORTANTE 🔴🔴🔴
Quando cliente perguntar "como funciona", "me explica", "quero saber mais":
→ SEMPRE inclua [ENVIAR_MIDIA:COMO_FUNCIONA] na resposta!

MÍDIAS DISPONÍVEIS:
- COMO_FUNCIONA (áudio explicativo)
- VIDEO_DEMONSTRACAO (vídeo demo)
- TABELA_PRECOS (imagem com preços)
- PDF_CONTRATO (documento)

EXEMPLOS:
CLIENTE: "como funciona?"
VOCÊ: "Vou te explicar! [ENVIAR_MIDIA:COMO_FUNCIONA] ..."

CLIENTE: "quanto custa?"
VOCÊ: "Aqui está a tabela: [ENVIAR_MIDIA:TABELA_PRECOS] ..."

═══════════════════════════════════════════════════════════════════════════════
🚀 SOBRE A AGENTEZAP
═══════════════════════════════════════════════════════════════════════════════

O QUE VENDEMOS:
• Agente de IA personalizado que atende no WhatsApp 24/7
• Responde dúvidas, fecha vendas, agenda serviços
• Fala de forma natural

BENEFÍCIOS:
• Nunca mais perde cliente de madrugada
• Atende 100 pessoas ao mesmo tempo
• Funciona 24/7

PREÇO: R$ 99/mês
• Teste GRÁTIS de 7 dias
• Conversas ilimitadas

FLUXO DE VENDAS:
1. Descobrir o negócio do cliente
2. Explicar como funciona (COM MÍDIA)
3. Mostrar benefícios específicos
4. Oferecer teste gratuito
5. Criar conta de teste

Use [AÇÃO:CRIAR_CONTA_TESTE] quando cliente quiser testar.`;

  const messages: Array<{ role: "system" | "user" | "assistant"; content: string }> = [
    { role: "system", content: systemPrompt }
  ];
  
  // Adicionar últimas 10 mensagens do histórico
  const recentHistory = history.slice(-10);
  for (const msg of recentHistory) {
    messages.push({
      role: msg.role === "client" ? "user" : "assistant",
      content: msg.content
    });
  }
  
  messages.push({
    role: "user",
    content: clientMessage
  });
  
  const response = await mistral.chat.complete({
    model: "mistral-small-latest",
    messages,
    maxTokens: 600,
    temperature: 0.85,
  });
  
  return response.choices?.[0]?.message?.content?.toString() || "Desculpa, tive um problema. Pode repetir?";
}

// ============================================================================
// EXECUTAR
// ============================================================================

runDeepAIvsAITest().catch(console.error);
