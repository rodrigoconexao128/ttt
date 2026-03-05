
import { clientSessions, generateFollowUpResponse, ClientSession } from "./adminAgentService";

async function runTest() {
  console.log("🤖 Iniciando Teste de Humanização da IA (V2 - Baseado em Persona)...");

  const testPhone = "5511999998888";

  // CENÁRIO 1: AGENTE FORMAL (Advogado)
  console.log("\n--- CENÁRIO 1: AGENTE FORMAL (Advogado) - 2 DIAS SEM RESPOSTA ---");
  let mockSession: ClientSession = {
    id: "test-session-id",
    phoneNumber: testPhone,
    step: "idle",
    flowState: "active",
    conversationHistory: [
        { role: "user", content: "Quais são os honorários?", timestamp: new Date(Date.now() - 172800000) }, 
        { role: "assistant", content: "Nossos honorários são de R$ 2.000,00 para este tipo de causa.", timestamp: new Date(Date.now() - 172800000 + 10000) },
    ],
    agentConfig: { 
        name: "Dr. Roberto", 
        role: "Advogado Sênior", 
        company: "Roberto Advocacia", 
        prompt: "Você é um advogado sério, formal e direto. Use linguagem culta mas acessível. Nunca use gírias." 
    }
  };
  clientSessions.set(testPhone, mockSession);
  
  try {
    let response = await generateFollowUpResponse(testPhone, "Cliente não respondeu sobre honorários");
    console.log("🗣️ RESPOSTA:", response);
  } catch (e) { console.error(e); }

  // CENÁRIO 2: AGENTE DESCONTRAÍDO (Vendedor de Surf)
  console.log("\n--- CENÁRIO 2: AGENTE DESCONTRAÍDO (Surf Shop) - 2 HORAS SEM RESPOSTA ---");
  mockSession.conversationHistory = [
      { role: "user", content: "Tem essa prancha azul?", timestamp: new Date(Date.now() - 7200000) }, 
      { role: "assistant", content: "Tenho sim mano! Tá irada. Quer que eu separe?", timestamp: new Date(Date.now() - 7200000 + 10000) },
  ];
  mockSession.agentConfig = {
      name: "Kadu",
      role: "Vendedor",
      company: "Aloha Surf",
      prompt: "Você é um surfista gente boa, usa gírias de surf (mano, irado, brother), super animado e informal."
  };
  clientSessions.set(testPhone, mockSession);

  try {
    let response = await generateFollowUpResponse(testPhone, "Cliente não respondeu se quer separar");
    console.log("🗣️ RESPOSTA:", response);
  } catch (e) { console.error(e); }
}

runTest().then(() => process.exit(0));
