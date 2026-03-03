/**
 * Test Agent Service
 *
 * Centraliza a lógica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token válido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e não o agente de vendas (Rodrigo).
 * 
 * 🆕 SIMULADOR UNIFICADO: Agora usa EXATAMENTE o mesmo fluxo do WhatsApp
 * através da função testAgentResponse que internamente chama generateAIResponse.
 */

import { testAgentResponse } from "./aiAgent";
import { getAgentMediaLibrary } from "./mediaService";

export type ChatRole = "system" | "user" | "assistant";

export type TestAgentHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

export type TestAgentMessageParams = {
  message: string;
  token?: string;
  history?: TestAgentHistoryItem[];
  userId?: string;
  sentMedias?: string[]; // 🆕 Mídias já enviadas nesta sessão
};

export type TestTokenInfo = {
  userId: string;
  agentName?: string;
  company?: string;
};

export type AgentConfig = {
  prompt?: string | null;
  model?: string | null;
};

export type MistralClient = {
  chat: {
    complete: (args: {
      model: string;
      messages: Array<{ role: ChatRole; content: string }>;
      maxTokens?: number;
      temperature?: number;
    }) => Promise<{ choices?: Array<{ message?: { content?: unknown } }> }>;
  };
};

export type TestAgentDeps = {
  getTestToken: (token: string) => Promise<TestTokenInfo | undefined>;
  getAgentConfig: (userId: string) => Promise<AgentConfig | undefined>;
  getMistralClient: () => Promise<MistralClient>;
  processAdminMessage: (
    sessionId: string,
    message: string,
    mediaType?: string,
    mediaUrl?: string,
    skipTriggerCheck?: boolean
  ) => Promise<{ text: string; mediaActions?: unknown } | null>;
  getAgentMediaLibrary: (userId: string) => Promise<any[]>;
  generateMediaPromptBlock: (media: any[]) => string;
  parseMistralResponse: (text: string) => { messages: any[], actions: any[] } | null;
};

export type TestAgentResult = {
  response: string;
  mediaActions?: unknown;
  deliveryOrderCreated?: any;
  mode: "client_agent" | "sales_demo";
  resolvedUserId?: string;
};

function normalizeAiContent(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  return String(value);
}

export async function handleTestAgentMessage(
  params: TestAgentMessageParams,
  deps: TestAgentDeps
): Promise<TestAgentResult> {
  const { message, token, history, userId, sentMedias } = params;

  if (!message || !message.trim()) {
    throw new Error("Mensagem obrigatória");
  }

  // Resolver userId do lado do servidor para evitar race do frontend.
  let resolvedUserId: string | undefined = userId;

  if (!resolvedUserId && token && token !== "demo") {
    const tokenInfo = await deps.getTestToken(token);
    if (tokenInfo?.userId) {
      resolvedUserId = tokenInfo.userId;
    }
  }

  if (!resolvedUserId && token && token !== "demo") {
    return {
      response:
        "Esse link de teste e invalido ou expirou. Peca um novo link para o administrador e tente novamente.",
      mode: "client_agent",
    };
  }

  if (resolvedUserId) {
    const agentConfig = await deps.getAgentConfig(resolvedUserId);

    // Se o token aponta para um usuário, NUNCA cair no Rodrigo.
    // Se não houver prompt configurado, devolver erro amigável.
    if (!agentConfig?.prompt) {
      return {
        response:
          "Seu agente ainda não está configurado para teste. Peça ao administrador para finalizar a configuração do agente antes de usar este link.",
        mode: "client_agent",
        resolvedUserId,
      };
    }

    console.log('\n🧪 ═══════════════════════════════════════════════════════════════');
    console.log('🧪 [TestAgentService] SIMULADOR UNIFICADO - Usando mesmo fluxo do WhatsApp');
    console.log('🧪 ═══════════════════════════════════════════════════════════════');

    // 🆕 CONVERTER HISTÓRICO DO FRONTEND PARA FORMATO Message[]
    const conversationHistory = history?.map((msg, idx) => ({
      id: `sim-${idx}`,
      chatId: "simulator",
      text: msg.content,
      fromMe: msg.role === "assistant",
      timestamp: new Date(Date.now() - (history!.length - idx) * 60000),
      isFromAgent: msg.role === "assistant",
    })) || [];

    console.log(`🧪 [TestAgentService] Histórico: ${conversationHistory.length} msgs, Mídias enviadas: ${sentMedias?.length || 0}`);

    // 🎯 USAR FUNÇÃO UNIFICADA - MESMO CÓDIGO DO WHATSAPP!
    try {
      const result = await testAgentResponse(
        resolvedUserId,
        message,
        undefined, // Não passar customPrompt aqui - usar o do banco
        conversationHistory,
        sentMedias || []
      );

      // 📁 RESOLVER URLs DAS MÍDIAS PARA O FRONTEND
      let mediaActions: any[] = [];
      if (result.mediaActions && result.mediaActions.length > 0) {
        const mediaLibrary = await getAgentMediaLibrary(resolvedUserId);
        
        for (const action of result.mediaActions) {
          if (action.type === 'send_media' && action.media_name) {
            const mediaItem = mediaLibrary.find(
              m => m.name.toUpperCase() === action.media_name.toUpperCase()
            );
            
            if (mediaItem) {
              console.log(`📁 [TestAgentService] Mídia encontrada: ${action.media_name}`);
              mediaActions.push({
                type: 'send_media',
                media_name: action.media_name,
                media_url: mediaItem.storageUrl,
                media_type: mediaItem.mediaType,
                caption: mediaItem.caption || mediaItem.description,
              });
            }
          } else if (action.type === 'send_media_url' && action.media_url) {
            mediaActions.push({
              type: 'send_media_url',
              media_url: action.media_url,
              media_type: action.media_type || 'image',
              caption: action.caption,
            });
          }
        }
      }

      console.log('🧪 ═══════════════════════════════════════════════════════════════\n');

      const responseText = typeof result.text === "string" ? result.text : "";
      const shouldFallback = responseText.length === 0 && mediaActions.length === 0;

      return {
        response: shouldFallback ? "Desculpe, não consegui processar." : responseText,
        mediaActions,
        deliveryOrderCreated: (result as any).deliveryOrderCreated,
        mode: "client_agent",
        resolvedUserId,
      };
    } catch (error) {
      console.error('🧪 [TestAgentService] Erro:', error);
      return {
        response: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        mode: "client_agent",
        resolvedUserId,
      };
    }
  }

  // Fallback demo: Rodrigo (somente quando NÃO há token/userId de cliente).
  const sessionId = token || `test_${Date.now()}`;
  const response = await deps.processAdminMessage(sessionId, message, undefined, undefined, true);

  if (!response) {
    return {
      response: "Desculpa, não consegui processar sua mensagem. Tenta novamente?",
      mode: "sales_demo",
    };
  }

  return {
    response: response.text,
    mediaActions: response.mediaActions,
    mode: "sales_demo",
  };
}
