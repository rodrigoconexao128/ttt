import {
  sendWhatsAppButtonsFromUser,
  sendWhatsAppListFromUser,
  sendWhatsAppMediaFromUser,
  sendWhatsAppMessageFromUser
} from "./chunk-2UIO537T.js";
import {
  supabase
} from "./chunk-2T4MMBMB.js";
import {
  storage
} from "./chunk-TNURPL7N.js";
import {
  clearFlowCache,
  isChatbotActive,
  processChatbotMessage
} from "./chunk-JZWU2M4E.js";
import "./chunk-H42QL47H.js";
import "./chunk-HIRAYR4B.js";
import "./chunk-WF5ZUJEW.js";
import "./chunk-ONE52B4D.js";
import "./chunk-KFQGP6VL.js";

// server/chatbotIntegration.ts
async function tryProcessChatbotMessage(userId, conversationId, contactNumber, messageText, isFirstContact = false) {
  try {
    const agentConfig = await storage.getAgentConfig(userId);
    if (agentConfig?.flowModeActive === true && agentConfig?.flowScript?.trim().length > 10) {
      console.log(`\u{1F500} [CHATBOT_INTEGRATION] Modo Fluxo ativo para ${userId} \u2014 delegando para FlowScriptEngine (prioridade)`);
      return { handled: false };
    }
    const chatbotActive = await isChatbotActive(userId);
    if (!chatbotActive) {
      console.log(`\u{1F916} [CHATBOT] Chatbot n\xE3o ativo para usu\xE1rio ${userId}, delegando para IA`);
      return { handled: false };
    }
    console.log(`\u{1F916} [CHATBOT] Processando mensagem para ${contactNumber} (conversa: ${conversationId})`);
    const response = await processChatbotMessage(
      userId,
      conversationId,
      contactNumber,
      messageText,
      isFirstContact
    );
    if (!response || response.messages.length === 0) {
      console.log(`\u{1F916} [CHATBOT] Chatbot n\xE3o gerou resposta, delegando para IA`);
      return { handled: false };
    }
    for (let i = 0; i < response.messages.length; i++) {
      const msg = response.messages[i];
      if (msg.delay && i > 0) {
        await new Promise((resolve) => setTimeout(resolve, msg.delay));
      }
      try {
        switch (msg.type) {
          case "text":
            await sendWhatsAppMessageFromUser(userId, contactNumber, msg.content);
            break;
          case "buttons":
            const buttonPayload = {
              body: msg.content.body,
              buttons: msg.content.buttons.map((btn) => ({
                type: "reply",
                reply: {
                  id: btn.id,
                  title: btn.title.substring(0, 20)
                  // WhatsApp limita a 20 caracteres
                }
              }))
            };
            if (msg.content.header) {
              buttonPayload.header = { type: "text", text: msg.content.header };
            }
            if (msg.content.footer) {
              buttonPayload.footer = { text: msg.content.footer };
            }
            await sendWhatsAppButtonsFromUser(userId, contactNumber, buttonPayload);
            break;
          case "list":
            const listPayload = {
              body: msg.content.body,
              buttonText: msg.content.button_text || "Ver op\xE7\xF5es",
              sections: msg.content.sections.map((section) => ({
                title: section.title || "Op\xE7\xF5es",
                rows: section.rows.map((row) => ({
                  id: row.id,
                  title: row.title.substring(0, 24),
                  // WhatsApp limita a 24 caracteres
                  description: row.description?.substring(0, 72)
                  // WhatsApp limita a 72 caracteres
                }))
              }))
            };
            if (msg.content.header) {
              listPayload.header = { type: "text", text: msg.content.header };
            }
            if (msg.content.footer) {
              listPayload.footer = { text: msg.content.footer };
            }
            await sendWhatsAppListFromUser(userId, contactNumber, listPayload);
            break;
          case "media":
            const mediaUrl = msg.content.url;
            const mediaCaption = msg.content.caption || "";
            const mediaTypeToMime = {
              "image": "image/jpeg",
              "audio": "audio/mpeg",
              "video": "video/mp4",
              "document": "application/pdf"
            };
            const mimeType = mediaTypeToMime[msg.content.media_type] || "application/octet-stream";
            console.log(`\u{1F4E4} [CHATBOT] Enviando m\xEDdia ${msg.content.media_type}: ${mediaUrl}`);
            await sendWhatsAppMediaFromUser(
              userId,
              contactNumber,
              mediaUrl,
              mediaCaption,
              mimeType,
              "chatbot_flow"
            );
            break;
        }
        const messageId = `chatbot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await storage.createMessage({
          conversationId,
          messageId,
          text: typeof msg.content === "string" ? msg.content : msg.content.body || JSON.stringify(msg.content),
          fromMe: true,
          isFromAgent: true,
          timestamp: /* @__PURE__ */ new Date()
        });
      } catch (sendError) {
        console.error(`\u{1F916} [CHATBOT] Erro ao enviar mensagem:`, sendError);
      }
    }
    if (response.shouldTransferToHuman) {
      console.log(`\u{1F916} [CHATBOT] Transferindo conversa ${conversationId} para humano`);
      await storage.disableAgentForConversation(conversationId);
    }
    if (response.variables?.__delivery_order_pending === "true" && response.variables?.__delivery_order_data) {
      try {
        const orderData = JSON.parse(response.variables.__delivery_order_data);
        console.log(`\u{1F355} [CHATBOT] Salvando pedido de delivery na tabela delivery_pedidos`);
        const conversation = await storage.getConversation(conversationId);
        const contactName = conversation?.contactName || "Cliente";
        const { data: savedOrder, error: saveError } = await supabase.from("delivery_pedidos").insert({
          user_id: userId,
          conversation_id: conversationId,
          contact_number: contactNumber,
          contact_name: contactName,
          status: "pendente",
          items: orderData.items || [],
          subtotal: orderData.subtotal || 0,
          delivery_fee: orderData.delivery_fee || 0,
          discount: orderData.discount || 0,
          total: orderData.total || 0,
          delivery_type: orderData.delivery_type || "delivery",
          delivery_address: orderData.delivery_address || null,
          payment_method: orderData.payment_method || "dinheiro",
          payment_status: "pendente",
          notes: orderData.notes || null
        }).select().single();
        if (saveError) {
          console.error(`\u{1F355} [CHATBOT] Erro ao salvar pedido:`, saveError);
        } else {
          console.log(`\u{1F355} [CHATBOT] Pedido #${savedOrder?.id} salvo com sucesso na tabela delivery_pedidos`);
        }
      } catch (deliveryError) {
        console.error(`\u{1F355} [CHATBOT] Erro ao processar pedido de delivery:`, deliveryError);
      }
    }
    const hasPizzaVariables = response.variables?.sabor_pizza && response.variables?.pagamento;
    const hasConfirmationMessage = response.messages?.some(
      (msg) => typeof msg.content === "string" && msg.content.includes("PEDIDO CONFIRMADO")
    );
    const notAlreadySaved = response.variables?.__delivery_order_pending !== "true";
    if (hasPizzaVariables && hasConfirmationMessage && notAlreadySaved) {
      try {
        console.log(`\u{1F355} [CHATBOT] Auto-detectado pedido de pizza/delivery - salvando automaticamente`);
        const conversation = await storage.getConversation(conversationId);
        const contactName = response.variables?.nome_cliente || conversation?.contactName || "Cliente";
        const sabor = response.variables?.sabor_pizza || "";
        const tamanho = response.variables?.tamanho || "";
        const borda = response.variables?.borda || "";
        const tipoEntrega = response.variables?.tipo_entrega || "delivery";
        const endereco = response.variables?.endereco || "";
        const pagamento = response.variables?.pagamento || "dinheiro";
        const troco = response.variables?.troco || "";
        const isDelivery = tipoEntrega.toLowerCase().includes("delivery");
        const deliveryFee = isDelivery ? 8 : 0;
        let basePrice = 0;
        if (tamanho.includes("P") || tamanho.includes("Pequena")) basePrice = 35;
        else if (tamanho.includes("M") || tamanho.includes("M\xE9dia")) basePrice = 45;
        else if (tamanho.includes("G") || tamanho.includes("Grande")) basePrice = 55;
        else basePrice = 45;
        const bordaPrice = borda && !borda.toLowerCase().includes("n\xE3o") ? 10 : 0;
        const subtotal = basePrice + bordaPrice;
        const total = subtotal + deliveryFee;
        const orderItem = {
          name: `Pizza ${sabor} (${tamanho})`,
          quantity: 1,
          price: basePrice,
          extras: borda && !borda.toLowerCase().includes("n\xE3o") ? [{ name: `Borda ${borda}`, price: bordaPrice }] : [],
          notes: ""
        };
        const { data: savedOrder, error: saveError } = await supabase.from("delivery_pedidos").insert({
          user_id: userId,
          conversation_id: conversationId,
          contact_number: contactNumber,
          contact_name: contactName,
          status: "pendente",
          items: [orderItem],
          subtotal,
          delivery_fee: deliveryFee,
          discount: 0,
          total,
          delivery_type: isDelivery ? "delivery" : "pickup",
          delivery_address: endereco ? { street: endereco } : null,
          payment_method: pagamento.toLowerCase().includes("pix") ? "pix" : pagamento.toLowerCase().includes("cart\xE3o") || pagamento.toLowerCase().includes("cartao") ? "cartao" : "dinheiro",
          payment_status: "pendente",
          notes: troco && troco !== "0" ? `Troco para R$ ${troco}` : null
        }).select().single();
        if (saveError) {
          console.error(`\u{1F355} [CHATBOT] Erro ao salvar pedido de pizza:`, saveError);
        } else {
          console.log(`\u{1F355} [CHATBOT] Pedido de pizza #${savedOrder?.id} salvo com sucesso na tabela delivery_pedidos`);
          console.log(`   \u{1F4CB} Item: ${orderItem.name}`);
          console.log(`   \u{1F4B0} Total: R$ ${total} (subtotal: ${subtotal} + entrega: ${deliveryFee})`);
          console.log(`   \u{1F4CD} Tipo: ${isDelivery ? "Delivery" : "Retirada"}`);
          console.log(`   \u{1F4B3} Pagamento: ${pagamento}`);
        }
      } catch (autoSaveError) {
        console.error(`\u{1F355} [CHATBOT] Erro ao salvar pedido de pizza automaticamente:`, autoSaveError);
      }
    }
    if (response.variables?.__appointment_pending === "true" && response.variables?.__appointment_data) {
      try {
        const appointmentData = JSON.parse(response.variables.__appointment_data);
        console.log(`\u{1F4C5} [CHATBOT] Salvando agendamento na tabela appointments`);
        const conversation = await storage.getConversation(conversationId);
        const clientName = appointmentData.client_name || conversation?.contactName || "Cliente";
        const durationMinutes = appointmentData.duration_minutes || 60;
        const startTime = appointmentData.start_time || "09:00";
        const [hours, minutes] = startTime.split(":").map(Number);
        const endDate = new Date(2e3, 0, 1, hours, minutes + durationMinutes);
        const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;
        const appointmentId = `apt_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        const { data: savedAppointment, error: saveError } = await supabase.from("appointments").insert({
          id: appointmentId,
          user_id: userId,
          conversation_id: conversationId,
          client_name: clientName,
          client_phone: contactNumber,
          client_email: appointmentData.client_email || null,
          service_id: appointmentData.service_id || null,
          service_name: appointmentData.service_name || "Servi\xE7o n\xE3o especificado",
          professional_id: appointmentData.professional_id || null,
          professional_name: appointmentData.professional_name || null,
          appointment_date: appointmentData.appointment_date,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: durationMinutes,
          location: appointmentData.location || null,
          location_type: appointmentData.location_type || "presencial",
          status: "pendente",
          confirmed_by_client: false,
          confirmed_by_business: false,
          created_by_ai: true,
          ai_confirmation_pending: true,
          client_notes: appointmentData.notes || null,
          ai_conversation_context: {
            conversationId,
            createdAt: (/* @__PURE__ */ new Date()).toISOString(),
            variables: response.variables
          }
        }).select().single();
        if (saveError) {
          console.error(`\u{1F4C5} [CHATBOT] Erro ao salvar agendamento:`, saveError);
        } else {
          console.log(`\u{1F4C5} [CHATBOT] Agendamento ${savedAppointment?.id} salvo com sucesso na tabela appointments`);
        }
      } catch (appointmentError) {
        console.error(`\u{1F4C5} [CHATBOT] Erro ao processar agendamento:`, appointmentError);
      }
    }
    return {
      handled: true,
      transferToHuman: response.shouldTransferToHuman
    };
  } catch (error) {
    console.error(`\u{1F916} [CHATBOT] Erro ao processar mensagem:`, error);
    return { handled: false };
  }
}
async function isNewContact(conversationId) {
  try {
    const messages = await storage.getMessagesByConversationId(conversationId);
    return messages.length <= 1;
  } catch (error) {
    console.error(`[CHATBOT] Erro ao verificar se \xE9 novo contato:`, error);
    return false;
  }
}
export {
  clearFlowCache,
  isNewContact,
  tryProcessChatbotMessage
};
