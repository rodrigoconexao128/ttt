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

    conversationHistory.slice(-10).forEach((msg) => {
      messages.push({
        role: msg.fromMe ? "assistant" : "user",
        content: msg.text || "",
      });
    });

    messages.push({
      role: "user",
      content: newMessageText,
    });

    const mistral = await getMistralClient();
    const chatResponse = await mistral.chat.complete({
      model: agentConfig.model,
      messages: messages as any,
    });

    const content = chatResponse.choices?.[0]?.message?.content;
    const responseText = typeof content === 'string' ? content : null;
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
