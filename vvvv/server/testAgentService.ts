/**
 * Test Agent Service
 *
 * Centraliza a lgica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token vlido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e no o agente de vendas (Rodrigo).
 * 
 *  SIMULADOR UNIFICADO: Agora usa EXATAMENTE o mesmo fluxo do WhatsApp
 * atravs da funo testAgentResponse que internamente chama generateAIResponse.
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
  sentMedias?: string[]; //  Mdias j enviadas nesta sesso
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

function looksLikeTransientFailure(text: string): boolean {
  const normalized = String(text || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();

  if (!normalized) return true;
  return (
    normalized.includes("nao consegui processar") ||
    normalized.includes("ocorreu um erro ao processar") ||
    normalized.includes("houve um erro tecnico")
  );
}

function repairCommonMojibake(text: string): string {
  let fixed = String(text || "");
  const replacements: Array<[string, string]> = [
    ["Ã¡", "á"], ["Ã©", "é"], ["Ã­", "í"], ["Ã³", "ó"], ["Ãº", "ú"],
    ["Ã£", "ã"], ["Ãµ", "õ"], ["Ã§", "ç"], ["Ãª", "ê"], ["Ã´", "ô"], ["Ã¢", "â"],
    ["Ã€", "À"], ["Ã", "Á"], ["Ã‰", "É"], ["Ã“", "Ó"], ["Ãš", "Ú"],
    ["â€”", "—"], ["â€“", "–"], ["â€¢", "•"], ["Â ", " "],
  ];
  for (const [from, to] of replacements) {
    fixed = fixed.split(from).join(to);
  }
  return fixed;
}

export async function handleTestAgentMessage(
  params: TestAgentMessageParams,
  deps: TestAgentDeps
): Promise<TestAgentResult> {
  const { message, token, history, userId, sentMedias } = params;

  if (!message || !message.trim()) {
    throw new Error("Mensagem obrigatoria");
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

    // Se o token aponta para um usuario, NUNCA cair no Rodrigo.
    // Se nao houver prompt configurado, devolver erro amigavel.
    if (!agentConfig?.prompt) {
      return {
        response:
          "Seu agente ainda nao esta configurado para teste. Peca ao administrador para finalizar a configuracao do agente antes de usar este link.",
        mode: "client_agent",
        resolvedUserId,
      };
    }

    console.log('\n ');
    console.log(' [TestAgentService] SIMULADOR UNIFICADO - Usando mesmo fluxo do WhatsApp');
    console.log(' ');

    //  CONVERTER HISTRICO DO FRONTEND PARA FORMATO Message[]
    const conversationHistory = history?.map((msg, idx) => ({
      id: `sim-${idx}`,
      chatId: "simulator",
      text: msg.content,
      fromMe: msg.role === "assistant",
      timestamp: new Date(Date.now() - (history!.length - idx) * 60000),
      isFromAgent: msg.role === "assistant",
    })) || [];

    console.log(` [TestAgentService] Histrico: ${conversationHistory.length} msgs, Mdias enviadas: ${sentMedias?.length || 0}`);

    // USAR FUNCAO UNIFICADA - MESMO CODIGO DO WHATSAPP!
    try {
      let result = await testAgentResponse(
        resolvedUserId,
        message,
        undefined, // Nao passar customPrompt aqui - usar o do banco
        conversationHistory,
        sentMedias || []
      );

      //  RESOLVER URLs DAS MDIAS PARA O FRONTEND
      let mediaActions: any[] = [];
      if (result.mediaActions && result.mediaActions.length > 0) {
        const mediaLibrary = await getAgentMediaLibrary(resolvedUserId);
        
        for (const action of result.mediaActions) {
          if (action.type === 'send_media' && action.media_name) {
            const mediaItem = mediaLibrary.find(
              m => m.name.toUpperCase() === action.media_name.toUpperCase()
            );
            
            if (mediaItem) {
              console.log(` [TestAgentService] Mdia encontrada: ${action.media_name}`);
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

      console.log(' \n');

      let responseText = typeof result.text === "string" ? result.text : "";
      const shouldRetry = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
      if (shouldRetry) {
        console.warn(" [TestAgentService] Resposta fraca/transiente detectada, tentando 1 retry");
        result = await testAgentResponse(
          resolvedUserId,
          message,
          undefined,
          conversationHistory,
          sentMedias || []
        );
        responseText = typeof result.text === "string" ? result.text : "";
      }
      const shouldFallback = mediaActions.length === 0 && looksLikeTransientFailure(responseText);
      const safeResponse = repairCommonMojibake(responseText);

      return {
        response: shouldFallback ? "Desculpe, nao consegui processar." : safeResponse,
        mediaActions,
        deliveryOrderCreated: (result as any).deliveryOrderCreated,
        mode: "client_agent",
        resolvedUserId,
      };
    } catch (error) {
      console.error(' [TestAgentService] Erro:', error);
      return {
        response: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        mode: "client_agent",
        resolvedUserId,
      };
    }
  }

  // Fallback demo: Rodrigo (somente quando NO h token/userId de cliente).
  const sessionId = token || `test_${Date.now()}`;
  const response = await deps.processAdminMessage(sessionId, message, undefined, undefined, true);

  if (!response) {
    return {
      response: "Desculpa, nao consegui processar sua mensagem. Tenta novamente?",
      mode: "sales_demo",
    };
  }

  return {
    response: repairCommonMojibake(response.text),
    mediaActions: response.mediaActions,
    mode: "sales_demo",
  };
}
