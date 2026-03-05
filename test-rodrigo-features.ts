
import 'dotenv/config';
import { processAdminMessage, clearClientSession } from "./server/adminAgentService";

async function runTest(scenarioName: string, messages: string[], expectedKeywords: string[], expectedMediaTag?: string) {
    console.log(`\n\n═══════════════════════════════════════════════════════════`);
    console.log(`🧪 ${scenarioName}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    const phone = `55119999${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    clearClientSession(phone);

    for (const msg of messages) {
        console.log(`👤 USER: ${msg}`);
        // Simulate message processing
        const res = await processAdminMessage(phone, msg, undefined, undefined, true); // skipTriggerCheck=true to bypass trigger phrases
        
        // Wait for response (simulated).
        // Since processAdminMessage returns result immediately or promise.
        
        let responseText = "";
        let mediaActions: any[] = [];
        
        // The return type of processAdminMessage might be { text: string, mediaActions: ... } or just string?
        // Let's assume it returns object based on previous read of code, or string.
        // Looking at test-pricing:
        // if (typeof res === 'string') responseText = res; else responseText = res.text;
        
        if (typeof res === 'string') {
            responseText = res;
        } else if (res && typeof res === 'object') {
            responseText = (res as any).text || "";
            mediaActions = (res as any).mediaActions || [];
        }

        console.log(`🤖 BOT: ${responseText}`);
        
        // Check for Media Tag in text (common fallback)
        if (expectedMediaTag) {
            if (responseText.includes(`[ENVIAR_MIDIA:${expectedMediaTag}]`)) {
                 console.log(`✅ SUCESSO: Tag de mídia ${expectedMediaTag} encontrada no texto!!`);
            } else if (mediaActions.some((m: any) => m.media_name == expectedMediaTag)) {
                 console.log(`✅ SUCESSO: Mídia ${expectedMediaTag} enviada via Action!`);
            } else {
                 console.log(`⚠️ AVISO: Mídia ${expectedMediaTag} NÃO encontrada na resposta.`);
            }
        }

        // Check keywords
        const missing = expectedKeywords.filter(k => !responseText.toLowerCase().includes(k.toLowerCase()));
        if (missing.length === 0) {
            console.log(`✅ Keywords OK: ${expectedKeywords.join(", ")}`);
        } else {
            console.log(`⚠️ Keywords faltando: ${missing.join(", ")}`);
        }
    }
}

async function main() {
    await runTest(
        "Cenário 1: Envio em Massa",
        ["Quero saber se dá pra mandar mensagem pra todo mundo da minha lista de uma vez só"],
        ["campanhas", "massa", "disparar"],
        "ENVIO_EM_MASSA"
    );

    await runTest(
        "Cenário 2: Notificador",
        ["O sistema avisa quando o cliente agenda horário ou eu tenho que ficar olhando?"],
        ["Notificador", "agenda", "avisa"],
        "NOTIFICADOR_INTELIGENTE"
    );

    await runTest(
        "Cenário 3: Follow-up",
        ["E se o cliente visualiza e não responde? Perco a venda?"],
        ["recupera", "responder", "follow"], // keywords from the prompt I added
        "FOLLOW_UP_INTELIGENTE"
    );

    await runTest(
        "Cenário 4: Suporte/Como Fazer",
        ["Como eu faço pra configurar o sistema?"],
        ["vídeo", "configur"],
        "COMO_FUNCIONA" // Or potentially a support video if I had defined SUPORTE_VIDEO
    );
}

main().catch(console.error).finally(() => process.exit(0));
