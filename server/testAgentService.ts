/**
 * Test Agent Service
 *
 * Centraliza a lógica do simulador (/api/test-agent/*) para garantir que,
 * quando houver token válido, o atendimento use o agente do CLIENTE (aiAgentConfig)
 * e não o agente de vendas (Rodrigo).
 */

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
  const { message, token, history, userId } = params;

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

    const mistral = await deps.getMistralClient();

    // 📁 CARREGAR BIBLIOTECA DE MÍDIA
    const mediaLibrary = await deps.getAgentMediaLibrary(resolvedUserId);
    const hasMedia = mediaLibrary && mediaLibrary.length > 0;
    const mediaPromptBlock = hasMedia ? deps.generateMediaPromptBlock(mediaLibrary) : '';

    console.log('\n🔍 === DEBUG MÍDIA ===');
    console.log('📚 Media Library:', JSON.stringify(mediaLibrary, null, 2));
    console.log('📝 Media Prompt Block:', mediaPromptBlock);

    let systemPrompt = agentConfig.prompt || "";
    if (mediaPromptBlock) {
      systemPrompt += mediaPromptBlock;
    }

    console.log('📋 System Prompt completo:', systemPrompt);

    const messages: Array<{ role: ChatRole; content: string }> = [
      { role: "system", content: systemPrompt },
    ];

    if (history && Array.isArray(history)) {
      for (const msg of history.slice(-10)) {
        messages.push({
          role: msg.role === "user" ? "user" : "assistant",
          content: msg.content,
        });
      }
    }

    messages.push({ role: "user", content: message });

    console.log('📤 Mensagens enviadas para Mistral:', JSON.stringify(messages, null, 2));

    const aiResponse = await mistral.chat.complete({
      model: agentConfig.model || "mistral-small-latest",
      messages,
      maxTokens: 600,
      temperature: 0.85,
    });

    const responseText = normalizeAiContent(aiResponse.choices?.[0]?.message?.content);
    console.log('📥 Resposta da Mistral:', responseText);
    console.log('🔍 === FIM DEBUG ===\n');

    // 📁 DETECTAR AÇÕES DE MÍDIA NA RESPOSTA
    let mediaActions: any[] = [];
    let cleanedText = responseText;
    
    if (responseText && hasMedia) {
      const parseResult = deps.parseMistralResponse(responseText);
      cleanedText = parseResult?.messages?.[0]?.content || responseText;
      const rawActions = parseResult?.actions || [];
      
      // Resolver as URLs das mídias para o frontend poder exibir
      if (rawActions.length > 0) {
        console.log(`📁 [TestAgent] ${rawActions.length} mídias detectadas, resolvendo URLs...`);
        for (const action of rawActions) {
          if (action.type === 'send_media' && action.media_name) {
            // Buscar a mídia no banco para pegar a URL
            const mediaName = action.media_name;
            const mediaItem = mediaLibrary.find(m => m.name.toUpperCase() === mediaName.toUpperCase());
            
            if (mediaItem) {
              console.log(`📁 [TestAgent] Mídia encontrada: ${mediaName} -> ${mediaItem.storageUrl}`);
              mediaActions.push({
                type: 'send_media',
                media_name: mediaName,
                media_url: mediaItem.storageUrl,
                media_type: mediaItem.mediaType,
                caption: mediaItem.caption || mediaItem.description,
              });
            } else {
              console.warn(`⚠️ [TestAgent] Mídia não encontrada: ${mediaName}`);
            }
          }
        }
      }
    }

    return {
      response: cleanedText || "Desculpe, não consegui processar.",
      mediaActions,
      mode: "client_agent",
      resolvedUserId,
    };
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
