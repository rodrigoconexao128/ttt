
import 'dotenv/config';
import { processAdminMessage, clearClientSession } from "./server/adminAgentService";

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

async function runTest(scenarioName: string, messages: string[], expectedOutput: string[], forbiddenOutput: string[]) {
    console.log(`\n\n═══════════════════════════════════════════════════════════`);
    console.log(`🧪 ${scenarioName}`);
    console.log(`═══════════════════════════════════════════════════════════`);

    const phone = `55119999${Math.floor(Math.random() * 10000).toString().padStart(4, '0')}`;
    clearClientSession(phone);

    for (const msg of messages) {
        console.log(`👤 USER: ${msg}`);
        // Simulate message processing
        const res = await processAdminMessage(phone, msg);
        
        let responseText = "";
        if (typeof res === 'string') {
            responseText = res;
        } else if (res && res.text) {
            responseText = res.text;
        }

        console.log(`🤖 BOT: ${responseText}`);

        // Only validate on the last message for now, or accumulate validation?
        // Let's validate every response just in case the key info comes early.
        
        for (const forbidden of forbiddenOutput) {
            if (responseText.includes(forbidden)) {
                console.error(`❌ FALHA: Encontrou texto proibido "${forbidden}"`);
            }
        }
    }
    
    // Check if the FINAL response contains expected keywords? 
    // Or check if ANY response in the flow contained them.
    // For simplicity, I'll visually inspect the logs, but add simple checks.
}

async function main() {
    // 1. Teste Preço R$49 (Promoção)
    await runTest(
        "Cenário 1: Cliente quer plano de R$49",
        ["Olá, vi o AgenteZap e tenho interesse no plano de 49 reais"],
        ["PARC2026PROMO", "R$49"],
        ["Se o cliente perguntar", "1.", "2.", "3."]
    );

    await sleep(2000);

    // 2. Teste Preço Padrão R$99
    await runTest(
        "Cenário 2: Cliente pergunta preço (Geral)",
        ["Quanto custa o AgenteZap?"],
        ["R$99", "teste grátis"],
        ["Se o cliente perguntar", "1.", "2.", "3."]
    );

    await sleep(2000);

    // 3. Teste Implementação
    await runTest(
        "Cenário 3: Implementação",
        ["Como funciona a implementação do AgenteZap?", "Quanto é pra vocês configurarem?"],
        ["R$199", "único", "pagamento único"],
        ["mensal"] // Should not say implementation is monthly
    );

     await sleep(2000);

    // 4. Teste Chatbot Like (Filtrar listas)
    await runTest(
        "Cenário 4: Evitar Listas",
        ["Quais são as funcionalidades do AgenteZap?"],
        [],
        ["1.", "2.", "3.", "4."]
    );
}

main().catch(console.error);
