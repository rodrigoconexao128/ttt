
import "dotenv/config";
import { generateFollowUpResponse, clientSessions } from "./adminAgentService";
import { storage } from "./storage";

// Mock storage methods
storage.getAdminConversationByPhone = async (phone: string) => {
    if (phone === "5511999999999") {
        return { contactName: "Carlos" } as any;
    }
    return { contactName: null } as any;
};

storage.getSystemConfig = async (key: string) => {
    if (key === "admin_agent_model") return "mistral-small-latest";
    return null;
};

// Mock sessions
clientSessions.set("5511999999999", {
    id: "session-1",
    phoneNumber: "5511999999999",
    flowState: "active",
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    conversationHistory: [
        { role: "assistant", content: "Olá, como posso ajudar?", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48) },
        { role: "user", content: "Gostaria de saber o preço do plano.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48) },
        { role: "assistant", content: "O plano custa R$ 99,00 mensais.", timestamp: new Date(Date.now() - 1000 * 60 * 60 * 48) }
    ]
} as any);

clientSessions.set("5511888888888", {
    id: "session-2",
    phoneNumber: "5511888888888",
    flowState: "active",
    lastInteraction: new Date(Date.now() - 1000 * 60 * 60 * 5), // 5 hours ago
    conversationHistory: [
        { role: "assistant", content: "Oi!", timestamp: new Date() },
        { role: "user", content: "Oi", timestamp: new Date() }
    ]
} as any);

async function runTest() {
    console.log("--- TESTE 1: Com Nome (Carlos) ---");
    try {
        const response1 = await generateFollowUpResponse("5511999999999", "Cliente parou de responder após preço");
        console.log("RESPOSTA 1:", response1);
        
        if (response1.includes("[Nome]") || response1.includes("Opção")) {
            console.error("FALHA: Placeholder ou Opção detectada!");
        } else {
            console.log("SUCESSO: Formato limpo.");
        }
    } catch (e) {
        console.error("Erro no teste 1:", e);
    }

    console.log("\n--- TESTE 2: Sem Nome ---");
    try {
        const response2 = await generateFollowUpResponse("5511888888888", "Cliente sumiu");
        console.log("RESPOSTA 2:", response2);

        if (response2.includes("[Nome]") || response2.includes("Opção")) {
            console.error("FALHA: Placeholder ou Opção detectada!");
        } else {
            console.log("SUCESSO: Formato limpo.");
        }
    } catch (e) {
        console.error("Erro no teste 2:", e);
    }
}

runTest().then(() => process.exit(0)).catch((e) => {
    console.error(e);
    process.exit(1);
});
