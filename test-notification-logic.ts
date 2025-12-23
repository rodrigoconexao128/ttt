
import { Mistral } from "@mistralai/mistralai";
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Pool } from '@neondatabase/serverless';

// Load environment variables
const envPath = path.resolve(process.cwd(), 'vvvv', '.env');
if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
}

async function getApiKey() {
    // 1. Try process.env (if set by user)
    if (process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY !== 'your-mistral-key') {
        return process.env.MISTRAL_API_KEY;
    }

    // 2. Try Database
    if (process.env.DATABASE_URL) {
        try {
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
            await pool.end();
            
            if (result.rows.length > 0 && result.rows[0].valor) {
                return result.rows[0].valor;
            }
        } catch (err) {
            console.error("⚠️ Failed to fetch key from DB:", err.message);
        }
    }

    return null;
}

// ------------------------------------------------------------------
// 🔔 THE LOGIC TO TEST (Copied from server/promptTemplates.ts)
// ------------------------------------------------------------------
function getNotificationPrompt(trigger: string): string {
    return `
---
🔔 **SISTEMA DE NOTIFICAÇÃO INTELIGENTE**

Gatilho de Notificação Configurado: "${trigger}"

**INSTRUÇÃO DE ANÁLISE (Passo a Passo):**
1. Leia a mensagem do usuário.
2. Compare com o gatilho: "${trigger}".
3. A mensagem corresponde EXATAMENTE ao que o gatilho pede?
   - Se o gatilho é "Reembolso" e o usuário pede "Agendamento", a resposta é NÃO.
   - Se o gatilho é "Agendamento" e o usuário diz "Oi", a resposta é NÃO.

**REGRA FINAL:**
- Se a resposta for SIM (corresponde): Adicione "[NOTIFY: O gatilho foi atendido]" ao final.
- Se a resposta for NÃO (não corresponde): NÃO adicione nenhuma tag de notificação.
`;
}

// ------------------------------------------------------------------
// 🧪 TEST RUNNER
// ------------------------------------------------------------------
async function runTest() {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("❌ Could not find MISTRAL_API_KEY in env or DB.");
        process.exit(1);
    }
    
    const client = new Mistral({ apiKey });

    // 🧪 TESTE 1: GATILHO DE AGENDAMENTO (Já validado)
    // ...

    // 🧪 TESTE 2: GATILHO DIFERENTE (Para provar que é genérico)
    const trigger2 = "Me notifique quando o cliente pedir reembolso ou reclamar de defeito";
    console.log(`\n🎯 TRIGGER 2: "${trigger2}"`);
    console.log("---------------------------------------------------");

    const testCases2 = [
        { input: "Oi, tudo bem?", expected: false, desc: "Saudação" },
        { input: "Quero agendar um horário", expected: false, desc: "Agendamento (Irrelevante aqui)" },
        { input: "O produto chegou quebrado", expected: true, desc: "Reclamação de defeito" },
        { input: "Não gostei, quero meu dinheiro de volta", expected: true, desc: "Pedido de reembolso" },
        { input: "Quanto custa o frete?", expected: false, desc: "Dúvida geral" }
    ];

    const notificationPrompt2 = getNotificationPrompt(trigger2);
    const systemPrompt2 = `Você é um assistente de e-commerce.\n${notificationPrompt2}`;

    for (const test of testCases2) {
        process.stdout.write(`Testing: "${test.input}" (${test.desc})... `);
        try {
            const response = await client.chat.complete({
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: systemPrompt2 },
                    { role: "user", content: test.input }
                ],
                temperature: 0
            });
            const content = response.choices?.[0]?.message?.content || "";
            const hasNotify = content.includes("[NOTIFY:");
            const passed = hasNotify === test.expected;
            console.log(passed ? "✅" : `❌ (Got: ${hasNotify}, Expected: ${test.expected})`);
            if (!passed) console.log(`   Response: ${content}`);
        } catch (error) { console.error(error); }
    }
}

runTest();
