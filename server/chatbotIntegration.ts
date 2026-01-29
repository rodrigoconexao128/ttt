/**
 * Integração do Chatbot de Fluxo com o WhatsApp
 * 
 * Este módulo gerencia a integração entre o chatbot de fluxo predefinido
 * e o sistema de mensagens do WhatsApp.
 */

import { processChatbotMessage, isChatbotActive, clearFlowCache } from "./chatbotFlowEngine";
import { sendWhatsAppMessageFromUser, sendWhatsAppButtonsFromUser, sendWhatsAppListFromUser, sendWhatsAppMediaFromUser } from "./whatsappSender";
import { storage } from "./storage";
import { supabase } from "./supabaseAuth";

interface ChatbotMessageResult {
  handled: boolean;
  transferToHuman?: boolean;
}

/**
 * Tenta processar uma mensagem usando o chatbot de fluxo.
 * Se o chatbot não estiver ativo ou não processar a mensagem, retorna handled=false
 * para que o sistema de IA possa processar.
 * 
 * @param userId - ID do usuário dono do chatbot
 * @param conversationId - ID da conversa
 * @param contactNumber - Número do contato
 * @param messageText - Texto da mensagem recebida
 * @param isFirstContact - Se é o primeiro contato com este número
 * @returns Resultado indicando se o chatbot processou a mensagem
 */
export async function tryProcessChatbotMessage(
  userId: string,
  conversationId: string,
  contactNumber: string,
  messageText: string,
  isFirstContact: boolean = false
): Promise<ChatbotMessageResult> {
  try {
    // Verificar se o chatbot está ativo para este usuário
    const chatbotActive = await isChatbotActive(userId);
    
    if (!chatbotActive) {
      console.log(`🤖 [CHATBOT] Chatbot não ativo para usuário ${userId}, delegando para IA`);
      return { handled: false };
    }

    console.log(`🤖 [CHATBOT] Processando mensagem para ${contactNumber} (conversa: ${conversationId})`);

    // Processar mensagem pelo chatbot
    const response = await processChatbotMessage(
      userId,
      conversationId,
      contactNumber,
      messageText,
      isFirstContact
    );

    if (!response || response.messages.length === 0) {
      console.log(`🤖 [CHATBOT] Chatbot não gerou resposta, delegando para IA`);
      return { handled: false };
    }

    // Enviar as mensagens
    for (let i = 0; i < response.messages.length; i++) {
      const msg = response.messages[i];
      
      // Aplicar delay se especificado
      if (msg.delay && i > 0) {
        await new Promise(resolve => setTimeout(resolve, msg.delay));
      }

      try {
        switch (msg.type) {
          case 'text':
            await sendWhatsAppMessageFromUser(userId, contactNumber, msg.content);
            break;

          case 'buttons':
            // Enviar mensagem interativa com botões
            const buttonPayload = {
              body: msg.content.body,
              buttons: msg.content.buttons.map((btn: any) => ({
                type: 'reply' as const,
                reply: {
                  id: btn.id,
                  title: btn.title.substring(0, 20) // WhatsApp limita a 20 caracteres
                }
              }))
            };
            
            if (msg.content.header) {
              (buttonPayload as any).header = { type: 'text', text: msg.content.header };
            }
            if (msg.content.footer) {
              (buttonPayload as any).footer = { text: msg.content.footer };
            }
            
            await sendWhatsAppButtonsFromUser(userId, contactNumber, buttonPayload);
            break;

          case 'list':
            // Enviar lista interativa
            const listPayload = {
              body: msg.content.body,
              buttonText: msg.content.button_text || 'Ver opções',
              sections: msg.content.sections.map((section: any) => ({
                title: section.title || 'Opções',
                rows: section.rows.map((row: any) => ({
                  id: row.id,
                  title: row.title.substring(0, 24), // WhatsApp limita a 24 caracteres
                  description: row.description?.substring(0, 72) // WhatsApp limita a 72 caracteres
                }))
              }))
            };
            
            if (msg.content.header) {
              (listPayload as any).header = { type: 'text', text: msg.content.header };
            }
            if (msg.content.footer) {
              (listPayload as any).footer = { text: msg.content.footer };
            }
            
            await sendWhatsAppListFromUser(userId, contactNumber, listPayload);
            break;

          case 'media':
            // Enviar mídia real via WhatsApp (imagem, áudio, vídeo ou documento)
            const mediaUrl = msg.content.url;
            const mediaCaption = msg.content.caption || '';
            const mediaTypeToMime: Record<string, string> = {
              'image': 'image/jpeg',
              'audio': 'audio/mpeg',
              'video': 'video/mp4',
              'document': 'application/pdf'
            };
            const mimeType = mediaTypeToMime[msg.content.media_type] || 'application/octet-stream';
            
            console.log(`📤 [CHATBOT] Enviando mídia ${msg.content.media_type}: ${mediaUrl}`);
            
            await sendWhatsAppMediaFromUser(
              userId, 
              contactNumber, 
              mediaUrl,
              mediaCaption,
              mimeType,
              'chatbot_flow'
            );
            break;
        }

        // Salvar mensagem no histórico
        const messageId = `chatbot_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        await storage.createMessage({
          conversationId,
          messageId,
          text: typeof msg.content === 'string' ? msg.content : msg.content.body || JSON.stringify(msg.content),
          fromMe: true,
          isFromAgent: true,
          timestamp: new Date()
        });

      } catch (sendError) {
        console.error(`🤖 [CHATBOT] Erro ao enviar mensagem:`, sendError);
      }
    }

    // Se deve transferir para humano, desativar IA para esta conversa
    if (response.shouldTransferToHuman) {
      console.log(`🤖 [CHATBOT] Transferindo conversa ${conversationId} para humano`);
      await storage.disableAgentForConversation(conversationId);
    }

    // ============================================================
    // 🍕 PROCESSAR PEDIDO DE DELIVERY SE HOUVER
    // ============================================================
    if (response.variables?.__delivery_order_pending === 'true' && response.variables?.__delivery_order_data) {
      try {
        const orderData = JSON.parse(response.variables.__delivery_order_data);
        console.log(`🍕 [CHATBOT] Salvando pedido de delivery na tabela delivery_pedidos`);
        
        // Buscar nome do contato
        const conversation = await storage.getConversation(conversationId);
        const contactName = conversation?.contactName || 'Cliente';
        
        // Salvar na tabela delivery_pedidos
        const { data: savedOrder, error: saveError } = await supabase
          .from('delivery_pedidos')
          .insert({
            user_id: userId,
            conversation_id: conversationId,
            contact_number: contactNumber,
            contact_name: contactName,
            status: 'pendente',
            items: orderData.items || [],
            subtotal: orderData.subtotal || 0,
            delivery_fee: orderData.delivery_fee || 0,
            discount: orderData.discount || 0,
            total: orderData.total || 0,
            delivery_type: orderData.delivery_type || 'delivery',
            delivery_address: orderData.delivery_address || null,
            payment_method: orderData.payment_method || 'dinheiro',
            payment_status: 'pendente',
            notes: orderData.notes || null
          })
          .select()
          .single();

        if (saveError) {
          console.error(`🍕 [CHATBOT] Erro ao salvar pedido:`, saveError);
        } else {
          console.log(`🍕 [CHATBOT] Pedido #${savedOrder?.id} salvo com sucesso na tabela delivery_pedidos`);
        }
      } catch (deliveryError) {
        console.error(`🍕 [CHATBOT] Erro ao processar pedido de delivery:`, deliveryError);
      }
    }

    return {
      handled: true,
      transferToHuman: response.shouldTransferToHuman
    };

  } catch (error) {
    console.error(`🤖 [CHATBOT] Erro ao processar mensagem:`, error);
    return { handled: false };
  }
}

/**
 * Verificar se é um novo contato (primeira mensagem desta conversa)
 */
export async function isNewContact(conversationId: string): Promise<boolean> {
  try {
    const messages = await storage.getMessagesByConversationId(conversationId);
    // É novo se tem 1 ou menos mensagens (a que acabou de chegar)
    return messages.length <= 1;
  } catch (error) {
    console.error(`[CHATBOT] Erro ao verificar se é novo contato:`, error);
    return false;
  }
}

/**
 * Limpar cache do fluxo quando o usuário salva alterações
 */
export { clearFlowCache };
