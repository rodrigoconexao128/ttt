
process.env.DATABASE_URL = "postgres://user:pass@localhost:5432/db";

async function run() {
  const { setMockMistralClient } = await import("./server/mistralClient");
  const { processAdminMessage, getClientSession, clearClientSession, updateClientSession } = await import("./server/adminAgentService");
  const { storage } = await import("./server/storage");
  const mistral = await import("./server/mistralClient");
  const { setMockFollowUpFunctions } = await import("./server/followUpService");
  const { setMockAdminMediaStore } = await import("./server/adminMediaStore");

  // --- MOCK FOLLOW UP SERVICE ---
  setMockFollowUpFunctions({
      cancelFollowUp: async () => {},
      scheduleAutoFollowUp: async () => {},
      scheduleContact: async () => {},
      followUpService: {
          cancelFollowUpByPhone: async () => {},
          registerFollowUpCallback: () => {},
          registerScheduledContactCallback: () => {},
          start: () => {},
          stop: () => {}
      }
  });

  // --- MOCK ADMIN MEDIA STORE ---
  setMockAdminMediaStore({
      generateAdminMediaPromptBlock: async () => "MÍDIAS DISPONÍVEIS: [Nenhuma]",
      getAdminMediaByName: async () => null,
      parseAdminMediaTags: (text: string) => ({ text, media: [] })
  });

  // --- MOCK DATABASE ---
  (storage as any).getAllAdmins = async () => [{ id: "admin-test" }];
  (storage as any).createAdminMedia = async (data: any) => { return data; };
  (storage as any).getSystemConfig = async (key: string) => ({ valor: "Prompt original." });
  (storage as any).updateSystemConfig = async (k: string, v: string) => { return { chave: k, valor: v }; };
  (storage as any).findUserByPhone = async () => null;
  (storage as any).getConnectionByUserId = async () => null;
  (storage as any).getUserSubscription = async () => null;
  (storage as any).getAgentConfig = async () => null;

  // --- MOCK MISTRAL ---
  setMockMistralClient({
      chat: {
          complete: async (params: any) => {
              const messages = params.messages;
              const lastMsg = messages[messages.length - 1].content;
              
              // 1. CLASSIFICATION REQUESTS
              if (lastMsg.includes("classificador") && lastMsg.includes("intenção")) {
                  console.log(`\n🤖 [AI CLASSIFIER] Analyzing...`);
                  
                  // Check specific questions to identify scenario
                  if (lastMsg.includes("Me manda uma foto do seu cardápio?")) {
                      return { choices: [{ message: { content: "cardápio, menu, ver pratos, o que tem pra comer" } }] };
                  }
                  if (lastMsg.includes("Você tem um catálogo das roupas?")) {
                      return { choices: [{ message: { content: "catálogo, coleção, ver roupas, peças" } }] };
                  }
                  if (lastMsg.includes("Me manda fotos dos cortes que você faz?")) {
                      return { choices: [{ message: { content: "cortes, modelos, degradê, estilos" } }] };
                  }
                  
                  // Default / Random
                  return { choices: [{ message: { content: "NULL" } }] };
              }

              // 2. CHAT RESPONSES
              return {
                  choices: [{ message: { content: "Entendi! Vamos continuar." } }]
              };
          }
      },
      analyzeImageForAdmin: async (url: string) => {
          if (url.includes("menu")) return { summary: "Menu", description: "Um cardápio de restaurante" };
          if (url.includes("clothes")) return { summary: "Roupas", description: "Um catálogo de roupas femininas" };
          if (url.includes("hair")) return { summary: "Cabelo", description: "Fotos de cortes de cabelo masculino" };
          return { summary: "Random", description: "Uma foto de um cachorro" };
      },
      analyzeImageWithMistral: async (url: string) => {
          if (url.includes("menu")) return "Um cardápio de restaurante";
          if (url.includes("clothes")) return "Um catálogo de roupas femininas";
          if (url.includes("hair")) return "Fotos de cortes de cabelo masculino";
          return "Uma foto de um cachorro";
      }
  });

  // --- TEST RUNNER ---
  async function runScenario(name: string, phone: string, assistantRequest: string, imageUrl: string, expectedTrigger: string | null) {
      console.log(`\n════════════════════════════════════════════════════════════════`);
      console.log(`🧪 TEST SCENARIO: ${name}`);
      console.log(`════════════════════════════════════════════════════════════════`);
      
      clearClientSession(phone);
      
      let session = getClientSession(phone);
      if (!session) {
          console.log("⚠️ Session not found initially. Sending 'Oi'...");
          await processAdminMessage(phone, "Oi");
          session = getClientSession(phone);
      }

      if (session) {
          console.log("✅ Session found!");
          session.conversationHistory.push({ role: "assistant", content: assistantRequest, timestamp: new Date() });
          console.log(`🗣️  Assistant asked: "${assistantRequest}"`);
      } else {
          console.log("❌ Session STILL not found!");
      }

      console.log(`📤 User sends image: [${imageUrl}]`);
      await processAdminMessage(phone, "", "image", imageUrl);

      const s = getClientSession(phone);
      const uploaded = s?.uploadedMedia || [];
      const lastMedia = uploaded[uploaded.length - 1];

      if (expectedTrigger) {
          if (lastMedia && lastMedia.whenToUse.includes(expectedTrigger)) {
              console.log(`✅ PASS: Auto-detected trigger "${lastMedia.whenToUse}"`);
          } else {
              console.log(`❌ FAIL: Expected trigger "${expectedTrigger}", but got ${lastMedia?.whenToUse || "nothing"}`);
          }
      } else {
          if (uploaded.length === 0) {
              console.log(`✅ PASS: Correctly ignored (no auto-save)`);
          } else {
              console.log(`❌ FAIL: Should NOT have auto-saved, but saved as "${lastMedia?.whenToUse}"`);
          }
      }
  }

  // --- EXECUTE SCENARIOS ---
  await runScenario("RESTAURANTE (Marmitaria)", "5511999990001", "Me manda uma foto do seu cardápio?", "http://fake.url/menu.png", "cardápio");
  await runScenario("LOJA DE ROUPAS", "5511999990002", "Você tem um catálogo das roupas?", "http://fake.url/clothes.png", "catálogo");
  await runScenario("BARBEARIA", "5511999990003", "Me manda fotos dos cortes que você faz?", "http://fake.url/hair.png", "cortes");
  await runScenario("FOTO ALEATÓRIA (Não deve salvar)", "5511999990004", "Qual o endereço da loja?", "http://fake.url/dog.png", null);
}

run().catch(console.error);
