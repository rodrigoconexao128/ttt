
import { generateAIResponse } from "./server/aiAgent";
import { storage } from "./server/storage";
import { setMockMistralClient } from "./server/mistralClient";

// Mock storage to return our specific config
const MOCK_USER_ID = "test-user-piscinou";

// Configuração do Agente (Lailton)
const LAILTON_PROMPT = `
## IDENTIDADE DO AGENTE
Você é **Lailton**, atendimento humano do **Piscinou** no WhatsApp.
`;

const NOTIFICATION_TRIGGER = "Me notifique quando o cliente já tiver enviado as fotos da piscina e informado o bairro, ou quando o atendimento automático finalizar a coleta das informações iniciais.";

// Mock do storage
storage.getBusinessAgentConfig = async (userId: string) => {
  if (userId === MOCK_USER_ID) {
    return {
      userId: MOCK_USER_ID,
      isActive: true,
      agentName: "Lailton",
      companyName: "Piscinou",
      customPrompt: LAILTON_PROMPT,
      notificationEnabled: true,
      notificationTrigger: NOTIFICATION_TRIGGER,
      notificationMode: "both",
      modelProvider: "mistral-small-latest",
      id: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
      formalityLevel: "casual",
      emojiUsage: "moderate",
      allowedTopics: ["limpeza de piscina", "orçamento"],
      refusalMessage: "Não posso ajudar com isso.",
      welcomeMessage: "Oi!",
      notificationPhoneNumber: "5511999999999",
      notificationManualKeywords: "agendar,agende,encaminhar agora pra nossa equipe",
      maxResponseLength: 500,
      useCustomerName: true,
    } as any;
  }
  return null;
};

storage.getAgentConfig = async (userId: string) => {
    return { isActive: true, model: "mistral-small-latest" } as any;
};

storage.getAgentMediaLibrary = async () => [];

// Mock Mistral Client
const mockMistral = {
  chat: {
    complete: async (params: any) => {
      const messages = params.messages;
      const lastMessage = messages[messages.length - 1].content;
      
      console.log(`\n🤖 [MOCK MISTRAL] Recebeu mensagem: "${lastMessage.substring(0, 50)}..."`);
      
      // Simular validação de off-topic (primeira chamada geralmente)
      if (lastMessage.includes("classificador de mensagens")) {
         return {
          choices: [{
            message: {
              content: JSON.stringify({ isOffTopic: false, confidence: 1.0 })
            }
          }]
        };
      }

      // Simular respostas do agente
      if (lastMessage.includes("gostaria de um orçamento")) {
        return {
          choices: [{
            message: {
              content: "Oi! Tudo bem? 😊 Eu sou o **Lailton**, do **Piscinou**.\n\nPra gente analisar direitinho e te passar o valor correto da limpeza, você pode me mandar **2 fotos da piscina** e me dizer o **bairro**, por favor? 📸📍"
            }
          }]
        };
      }
      
      if (lastMessage.includes("FOTO DA PISCINA")) {
        return {
          choices: [{
            message: {
              content: "Perfeito 😊 Já recebi as fotos da piscina.\nAgora só me manda o bairro, por favor, pra gente concluir a análise. 📍"
            }
          }]
        };
      }
      
      if (lastMessage.includes("Jardim das Flores")) {
        // Verificar se o prompt contém as instruções de notificação
        const systemMessage = messages.find((m: any) => m.role === "system").content;
        const hasNotificationInstruction = systemMessage.includes("SISTEMA DE NOTIFICAÇÃO") && 
                                           systemMessage.includes("GATILHO ATIVO");
        
        if (hasNotificationInstruction) {
             console.log("✅ [PROMPT CHECK] O prompt contém as instruções de notificação corretas!");
        } else {
             console.log("❌ [PROMPT CHECK] O prompt NÃO contém as instruções esperadas.");
        }

        return {
          choices: [{
            message: {
              content: "Perfeito 😊 Já recebi as fotos e o bairro.\nVou encaminhar agora pra nossa equipe analisar direitinho e já te retornamos.\nFique no aguardo, por favor 👍 [NOTIFY: agendamento]"
            }
          }]
        };
      }

      return { choices: [{ message: { content: "Desculpe, não entendi." } }] };
    }
  }
};

setMockMistralClient(mockMistral);

async function runTest() {
  console.log("🏊 INICIANDO TESTE DO AGENTE PISCINOU (LAILTON)\n");

  const conversationHistory: any[] = [];

  // 1. Primeira interação
  console.log("--- PASSO 1: Cliente diz 'Oi' ---");
  const msg1 = "Oi, gostaria de um orçamento";
  const response1 = await generateAIResponse(MOCK_USER_ID, conversationHistory, msg1);
  
  if (response1) {
    console.log(`🤖 Lailton: ${response1.text}`);
    conversationHistory.push({ role: "user", content: msg1 });
    conversationHistory.push({ role: "assistant", content: response1.text || "" });
  }

  // 2. Cliente manda fotos
  console.log("\n--- PASSO 2: Cliente manda fotos ---");
  const msg2 = "[FOTO DA PISCINA 1] [FOTO DA PISCINA 2]";
  const response2 = await generateAIResponse(MOCK_USER_ID, conversationHistory, msg2);

  if (response2) {
    console.log(`🤖 Lailton: ${response2.text}`);
    conversationHistory.push({ role: "user", content: msg2 });
    conversationHistory.push({ role: "assistant", content: response2.text || "" });
  }

  // 3. Cliente manda bairro
  console.log("\n--- PASSO 3: Cliente manda bairro ---");
  const msg3 = "Moro no bairro Jardim das Flores";
  const response3 = await generateAIResponse(MOCK_USER_ID, conversationHistory, msg3);

  if (response3) {
    console.log(`🤖 Lailton: ${response3.text}`);
    
    console.log("\n--- VERIFICAÇÃO FINAL ---");
    if (response3.notification?.shouldNotify) {
        console.log(`✅ SUCESSO! Notificação disparada.`);
        console.log(`📝 Motivo: ${response3.notification.reason}`);
    } else {
        console.log(`❌ FALHA: Notificação NÃO foi disparada.`);
    }
  }
}

runTest().catch(console.error);
