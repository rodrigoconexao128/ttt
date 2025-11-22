import { storage } from "./storage";
import type { Message } from "@shared/schema";
import { getMistralClient } from "./mistralClient";

export async function generateAIResponse(
  userId: string,
  conversationHistory: Message[],
  newMessageText: string
): Promise<string | null> {
  try {
    const agentConfig = await storage.getAgentConfig(userId);

    if (!agentConfig || !agentConfig.isActive) {
      console.log(`[AI Agent] Config not found or inactive for user ${userId}`);
      return null;
    }

    // 📝 DEBUG: Log do config do agente para verificar se prompt está correto
    console.log(`🤖 [AI Agent] Config encontrado para user ${userId}:`);
    console.log(`   Model: ${agentConfig.model}`);
    console.log(`   Active: ${agentConfig.isActive}`);
    console.log(`   Trigger phrases: ${agentConfig.triggerPhrases?.length || 0}`);
    console.log(`   Prompt (primeiros 100 chars): ${agentConfig.prompt?.substring(0, 100) || 'N/A'}...`);

    // Validação de trigger phrases: se configuradas, verifica se alguma aparece na conversa
    if (agentConfig.triggerPhrases && agentConfig.triggerPhrases.length > 0) {
      // Concatena todas as mensagens da conversa (histórico + nova mensagem)
      const allMessages = [
        ...conversationHistory.map(m => m.text || ""),
        newMessageText
      ].join(" ").toLowerCase();

      // Verifica se alguma trigger phrase está presente
      const hasTrigger = agentConfig.triggerPhrases.some(phrase => 
        allMessages.includes(phrase.toLowerCase())
      );

      if (!hasTrigger) {
        console.log(`[AI Agent] Skipping response - no trigger phrase found for user ${userId}`);
        return null;
      }

      console.log(`[AI Agent] Trigger phrase detected for user ${userId}, proceeding with response`);
    }

    const messages: Array<{ role: string; content: string }> = [
      {
        role: "system",
        content: agentConfig.prompt,
      },
    ];

    // 🚫 FIX: Usar apenas últimas 5 mensagens (contexto focado)
    // Não adicionar newMessageText separadamente pois JÁ está no conversationHistory!
    const recentMessages = conversationHistory.slice(-5);
    
    // 🧹 REMOVER DUPLICATAS: Mensagens idênticas confundem a IA
    const uniqueMessages: Message[] = [];
    const seenTexts = new Set<string>();
    
    for (const msg of recentMessages) {
      const textKey = `${msg.fromMe ? 'me' : 'user'}:${msg.text || ''}`;
      if (!seenTexts.has(textKey)) {
        seenTexts.add(textKey);
        uniqueMessages.push(msg);
      } else {
        console.log(`⚠️ [AI Agent] Mensagem duplicada removida: ${(msg.text || '').substring(0, 30)}...`);
      }
    }
    
    console.log(`📋 [AI Agent] Enviando ${uniqueMessages.length} mensagens de contexto (${recentMessages.length - uniqueMessages.length} duplicatas removidas):`);
    uniqueMessages.forEach((msg, index) => {
      const role = msg.fromMe ? "assistant" : "user";
      const preview = (msg.text || "").substring(0, 50);
      console.log(`   ${index + 1}. [${role}] ${preview}...`);
      
      messages.push({
        role,
        content: msg.text || "",
      });
    });

    const mistral = await getMistralClient();
    const chatResponse = await mistral.chat.complete({
      model: agentConfig.model,
      messages: messages as any,
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    let responseText = typeof content === 'string' ? content : null;
    
    if (responseText) {
      // 🚫 FIX: Detectar e remover duplicação na resposta do Mistral
      // As vezes a API retorna texto 2x separado por \n\n
      const paragraphs = responseText.split('\n\n');
      const halfLength = Math.floor(paragraphs.length / 2);
      
      if (paragraphs.length > 2 && paragraphs.length % 2 === 0) {
        const firstHalf = paragraphs.slice(0, halfLength).join('\n\n');
        const secondHalf = paragraphs.slice(halfLength).join('\n\n');
        
        if (firstHalf === secondHalf) {
          console.log(`⚠️ [AI Agent] Resposta duplicada detectada do Mistral, usando apenas primeira metade`);
          console.log(`   Original length: ${responseText.length} chars`);
          responseText = firstHalf;
          console.log(`   Fixed length: ${responseText.length} chars`);
        }
      }
      
      console.log(`✅ [AI Agent] Resposta gerada: ${responseText.substring(0, 100)}...`);
    }
    
    return responseText;
  } catch (error) {
    console.error("Error generating AI response:", error);
    return null;
  }
}

export async function testAgentResponse(
  userId: string,
  testMessage: string
): Promise<string | null> {
  try {
    const agentConfig = await storage.getAgentConfig(userId);

    if (!agentConfig) {
      throw new Error("Agent not configured");
    }

    const messages = [
      {
        role: "system",
        content: agentConfig.prompt,
      },
      {
        role: "user",
        content: testMessage,
      },
    ];

    const mistral = await getMistralClient();
    const chatResponse = await mistral.chat.complete({
      model: agentConfig.model,
      messages: messages as any,
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    const responseText = typeof content === 'string' ? content : null;
    return responseText;
  } catch (error) {
    console.error("Error testing agent:", error);
    throw error;
  }
}
