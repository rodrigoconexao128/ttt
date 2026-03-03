import {
  getAgentMediaLibrary,
  testAgentResponse
} from "./chunk-YFM4WXLJ.js";
import "./chunk-XLKSR4VF.js";
import "./chunk-AQMUA4G4.js";
import "./chunk-2UIO537T.js";
import "./chunk-ONE52B4D.js";
import "./chunk-KRYA7EJ3.js";
import "./chunk-JZWU2M4E.js";
import "./chunk-MLBLYAZR.js";
import "./chunk-FYBACEOC.js";
import "./chunk-DODS5FYQ.js";
import "./chunk-YCIPFGXJ.js";
import "./chunk-HIRAYR4B.js";
import "./chunk-WF5ZUJEW.js";
import "./chunk-KFQGP6VL.js";

// server/testAgentService.ts
async function handleTestAgentMessage(params, deps) {
  const { message, token, history, userId, sentMedias } = params;
  if (!message || !message.trim()) {
    throw new Error("Mensagem obrigat\xF3ria");
  }
  let resolvedUserId = userId;
  if (!resolvedUserId && token && token !== "demo") {
    const tokenInfo = await deps.getTestToken(token);
    if (tokenInfo?.userId) {
      resolvedUserId = tokenInfo.userId;
    }
  }
  if (resolvedUserId) {
    const agentConfig = await deps.getAgentConfig(resolvedUserId);
    if (!agentConfig?.prompt) {
      return {
        response: "Seu agente ainda n\xE3o est\xE1 configurado para teste. Pe\xE7a ao administrador para finalizar a configura\xE7\xE3o do agente antes de usar este link.",
        mode: "client_agent",
        resolvedUserId
      };
    }
    console.log("\n\u{1F9EA} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    console.log("\u{1F9EA} [TestAgentService] SIMULADOR UNIFICADO - Usando mesmo fluxo do WhatsApp");
    console.log("\u{1F9EA} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550");
    const conversationHistory = history?.map((msg, idx) => ({
      id: `sim-${idx}`,
      chatId: "simulator",
      text: msg.content,
      fromMe: msg.role === "assistant",
      timestamp: new Date(Date.now() - (history.length - idx) * 6e4),
      isFromAgent: msg.role === "assistant"
    })) || [];
    console.log(`\u{1F9EA} [TestAgentService] Hist\xF3rico: ${conversationHistory.length} msgs, M\xEDdias enviadas: ${sentMedias?.length || 0}`);
    try {
      const result = await testAgentResponse(
        resolvedUserId,
        message,
        void 0,
        // Não passar customPrompt aqui - usar o do banco
        conversationHistory,
        sentMedias || []
      );
      let mediaActions = [];
      if (result.mediaActions && result.mediaActions.length > 0) {
        const mediaLibrary = await getAgentMediaLibrary(resolvedUserId);
        for (const action of result.mediaActions) {
          if (action.type === "send_media" && action.media_name) {
            const mediaItem = mediaLibrary.find(
              (m) => m.name.toUpperCase() === action.media_name.toUpperCase()
            );
            if (mediaItem) {
              console.log(`\u{1F4C1} [TestAgentService] M\xEDdia encontrada: ${action.media_name}`);
              mediaActions.push({
                type: "send_media",
                media_name: action.media_name,
                media_url: mediaItem.storageUrl,
                media_type: mediaItem.mediaType,
                caption: mediaItem.caption || mediaItem.description
              });
            }
          } else if (action.type === "send_media_url" && action.media_url) {
            mediaActions.push({
              type: "send_media_url",
              media_url: action.media_url,
              media_type: action.media_type || "image",
              caption: action.caption
            });
          }
        }
      }
      console.log("\u{1F9EA} \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\n");
      const responseText = typeof result.text === "string" ? result.text : "";
      const shouldFallback = responseText.length === 0 && mediaActions.length === 0;
      return {
        response: shouldFallback ? "Desculpe, n\xE3o consegui processar." : responseText,
        mediaActions,
        deliveryOrderCreated: result.deliveryOrderCreated,
        mode: "client_agent",
        resolvedUserId
      };
    } catch (error) {
      console.error("\u{1F9EA} [TestAgentService] Erro:", error);
      return {
        response: "Desculpe, ocorreu um erro ao processar sua mensagem. Tente novamente.",
        mode: "client_agent",
        resolvedUserId
      };
    }
  }
  const sessionId = token || `test_${Date.now()}`;
  const response = await deps.processAdminMessage(sessionId, message, void 0, void 0, true);
  if (!response) {
    return {
      response: "Desculpa, n\xE3o consegui processar sua mensagem. Tenta novamente?",
      mode: "sales_demo"
    };
  }
  return {
    response: response.text,
    mediaActions: response.mediaActions,
    mode: "sales_demo"
  };
}
export {
  handleTestAgentMessage
};
