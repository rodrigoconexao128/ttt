
import { Mistral } from "@mistralai/mistralai";
import * as fs from 'fs';
import * as path from 'path';
import * as dotenv from 'dotenv';
import { Pool } from '@neondatabase/serverless';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables - try multiple paths
const possiblePaths = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), 'vvvv', '.env'),
    path.resolve(__dirname, '.env'),
];

for (const envPath of possiblePaths) {
    if (fs.existsSync(envPath)) {
        console.log(`📂 Loading env from: ${envPath}`);
        dotenv.config({ path: envPath });
        break;
    }
}

async function getApiKey() {
    if (process.env.MISTRAL_API_KEY && process.env.MISTRAL_API_KEY !== 'your-mistral-key') {
        return process.env.MISTRAL_API_KEY;
    }
    if (process.env.DATABASE_URL) {
        try {
            const pool = new Pool({ connectionString: process.env.DATABASE_URL });
            const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
            await pool.end();
            if (result.rows.length > 0 && result.rows[0].valor) {
                return result.rows[0].valor;
            }
        } catch (err: any) {
            console.error("⚠️ Failed to fetch key from DB:", err.message);
        }
    }
    return null;
}

// ------------------------------------------------------------------
// 🔔 NOTIFICATION PROMPT FUNCTION
// ------------------------------------------------------------------
function getNotificationPrompt(trigger: string): string {
    const triggerLower = trigger.toLowerCase();
    
    let keywords = "";
    let actionDesc = "";
    
    if (triggerLower.includes("agendar") || triggerLower.includes("horário") || triggerLower.includes("marcar")) {
        keywords = "agendar, agenda, marcar, marca, reservar, reserva, tem vaga, tem horário, horário disponível, me encaixa, encaixe";
        actionDesc = "agendamento";
    } else if (triggerLower.includes("reembolso") || triggerLower.includes("devolver") || triggerLower.includes("devolução")) {
        keywords = "reembolso, devolver, devolução, quero meu dinheiro, cancelar pedido, estornar, estorno";
        actionDesc = "reembolso";
    } else if (triggerLower.includes("humano") || triggerLower.includes("atendente") || triggerLower.includes("pessoa")) {
        keywords = "falar com humano, atendente, pessoa real, falar com alguém, quero um humano, passa pra alguém";
        actionDesc = "atendente humano";
    } else if (triggerLower.includes("preço") || triggerLower.includes("valor") || triggerLower.includes("quanto custa")) {
        keywords = "preço, valor, quanto custa, quanto é, qual o preço, tabela de preço";
        actionDesc = "preço";
    } else if (triggerLower.includes("reclama") || triggerLower.includes("problema") || triggerLower.includes("insatisf")) {
        keywords = "reclamação, problema, insatisfeito, não funcionou, com defeito, quebrou, errado";
        actionDesc = "reclamação";
    } else if (triggerLower.includes("comprar") || triggerLower.includes("pedido") || triggerLower.includes("encomendar")) {
        keywords = "comprar, quero comprar, fazer pedido, encomendar, pedir, quero pedir";
        actionDesc = "compra";
    } else {
        keywords = trigger.replace(/me notifique quando o cliente|quiser|quer|pedir|mencionar|falar sobre/gi, "").trim();
        actionDesc = keywords || "gatilho";
    }
    
    const keywordList = keywords.split(',').map(k => k.trim().toLowerCase());
    
    const prompt = `
### REGRA DE NOTIFICACAO ###

PALAVRAS-GATILHO EXATAS: ${keywordList.join(', ')}

INSTRUCAO: Adicione [NOTIFY: ${actionDesc}] APENAS se a mensagem do cliente contiver uma palavra-gatilho listada acima.

### QUANDO ADICIONAR TAG ###
"Agenda hoje as 19" -> Contem "agenda" -> ADICIONAR [NOTIFY: ${actionDesc}]
"Quero agendar" -> Contem "agendar" -> ADICIONAR [NOTIFY: ${actionDesc}]
"Tem vaga?" -> Contem "tem vaga" -> ADICIONAR [NOTIFY: ${actionDesc}]
"Quero marcar" -> Contem "marcar" -> ADICIONAR [NOTIFY: ${actionDesc}]

### QUANDO NAO ADICIONAR TAG ###
"Oi tudo bem" -> NAO contem palavra-gatilho -> SEM TAG
"Qual o valor?" -> NAO contem palavra-gatilho -> SEM TAG
"Onde fica?" -> NAO contem palavra-gatilho -> SEM TAG
"Voces trabalham sabado?" -> NAO contem palavra-gatilho -> SEM TAG
"Ta caro" -> NAO contem palavra-gatilho -> SEM TAG
"Obrigado" -> NAO contem palavra-gatilho -> SEM TAG

REGRA: Se nenhuma palavra-gatilho aparece na mensagem, NAO adicione a tag.
`;
    return prompt;
}

// ------------------------------------------------------------------
// 🧪 TEST RUNNER
// ------------------------------------------------------------------

interface TestCase {
    input: string;
    expected: boolean;
    desc: string;
}

interface TriggerTestSet {
    trigger: string;
    businessContext: string;
    tests: TestCase[];
}

const ALL_TRIGGER_TESTS: TriggerTestSet[] = [
    {
        trigger: "Me notifique quando o cliente quiser agendar",
        businessContext: "Você é um assistente virtual de uma barbearia. Responda de forma natural e curta.",
        tests: [
            { input: "Oi, tudo bem?", expected: false, desc: "Saudação simples" },
            { input: "A paz de Deus", expected: false, desc: "Saudação religiosa" },
            { input: "Bom dia!", expected: false, desc: "Saudação bom dia" },
            { input: "Olá, boa tarde", expected: false, desc: "Saudação boa tarde" },
            { input: "Qual o valor do corte?", expected: false, desc: "Pergunta de preço" },
            { input: "Onde fica a barbearia?", expected: false, desc: "Pergunta de localização" },
            { input: "Vocês trabalham no sábado?", expected: false, desc: "Pergunta sobre funcionamento" },
            { input: "Obrigado pela ajuda", expected: false, desc: "Agradecimento" },
            { input: "Tá caro isso aí", expected: false, desc: "Reclamação de preço" },
            { input: "Gostaria de marcar um horário", expected: true, desc: "Marcar horário" },
            { input: "Quero agendar para amanhã", expected: true, desc: "Agendar amanhã" },
            { input: "Tem vaga para hoje?", expected: true, desc: "Pergunta vaga" },
            { input: "Agenda para mim hoje as 18", expected: true, desc: "Agenda direto" },
            { input: "Quero reservar para as 14h", expected: true, desc: "Reservar horário" },
            { input: "Tem horário disponível?", expected: true, desc: "Disponibilidade" },
            { input: "Posso marcar para sexta?", expected: true, desc: "Marcar dia" },
            { input: "Me encaixa hoje?", expected: true, desc: "Encaixe" },
            { input: "Consigo um horário agora?", expected: true, desc: "Horário agora" },
        ]
    },
    {
        trigger: "Me notifique quando o cliente pedir reembolso",
        businessContext: "Você é um assistente virtual de uma loja online. Responda de forma natural e curta.",
        tests: [
            { input: "Oi, tudo bem?", expected: false, desc: "Saudação simples" },
            { input: "Qual o prazo de entrega?", expected: false, desc: "Pergunta sobre entrega" },
            { input: "Vocês têm promoção?", expected: false, desc: "Pergunta promoção" },
            { input: "Onde está meu pedido?", expected: false, desc: "Rastreio" },
            { input: "Quanto custa o frete?", expected: false, desc: "Pergunta frete" },
            { input: "Obrigado!", expected: false, desc: "Agradecimento" },
            { input: "Quero meu dinheiro de volta", expected: true, desc: "Dinheiro de volta" },
            { input: "Preciso de reembolso", expected: true, desc: "Reembolso direto" },
            { input: "Gostaria de devolver o produto", expected: true, desc: "Devolver produto" },
            { input: "Como faço para cancelar e receber o estorno?", expected: true, desc: "Estorno" },
            { input: "Quero a devolução do valor", expected: true, desc: "Devolução valor" },
        ]
    },
    {
        trigger: "Me notifique quando o cliente quiser falar com humano",
        businessContext: "Você é um assistente virtual de suporte técnico. Responda de forma natural e curta.",
        tests: [
            { input: "Oi, preciso de ajuda", expected: false, desc: "Pedido de ajuda genérico" },
            { input: "Como reseto a senha?", expected: false, desc: "Pergunta técnica" },
            { input: "Onde vejo meu histórico?", expected: false, desc: "Pergunta navegação" },
            { input: "Obrigado pela informação", expected: false, desc: "Agradecimento" },
            { input: "O sistema está lento", expected: false, desc: "Reclamação técnica" },
            { input: "Quero falar com um atendente", expected: true, desc: "Atendente direto" },
            { input: "Passa para uma pessoa real", expected: true, desc: "Pessoa real" },
            { input: "Quero um humano", expected: true, desc: "Humano direto" },
            { input: "Falar com alguém de verdade", expected: true, desc: "Alguém de verdade" },
            { input: "Me transfere para um funcionário", expected: true, desc: "Funcionário" },
        ]
    },
    {
        trigger: "Me notifique quando o cliente fizer reclamação",
        businessContext: "Você é um assistente virtual de uma empresa de serviços. Responda de forma natural e curta.",
        tests: [
            { input: "Oi, bom dia", expected: false, desc: "Saudação" },
            { input: "Quanto custa o serviço?", expected: false, desc: "Pergunta preço" },
            { input: "Vocês fazem entrega?", expected: false, desc: "Pergunta serviço" },
            { input: "Obrigado", expected: false, desc: "Agradecimento" },
            { input: "Tenho uma reclamação a fazer", expected: true, desc: "Reclamação direta" },
            { input: "O serviço não funcionou direito", expected: true, desc: "Não funcionou" },
            { input: "Estou muito insatisfeito", expected: true, desc: "Insatisfeito" },
            { input: "Isso está com defeito", expected: true, desc: "Defeito" },
            { input: "O produto veio errado", expected: true, desc: "Errado" },
            { input: "Isso é um problema sério", expected: true, desc: "Problema" },
        ]
    },
    {
        trigger: "Me notifique quando o cliente quiser comprar",
        businessContext: "Você é um assistente virtual de uma loja. Responda de forma natural e curta.",
        tests: [
            { input: "Oi, boa tarde", expected: false, desc: "Saudação" },
            { input: "Qual o horário de funcionamento?", expected: false, desc: "Horário" },
            { input: "Vocês têm estacionamento?", expected: false, desc: "Pergunta infraestrutura" },
            { input: "Quanto custa esse produto?", expected: false, desc: "Pergunta preço (não é compra)" },
            { input: "Quero comprar esse produto", expected: true, desc: "Comprar direto" },
            { input: "Vou fazer o pedido", expected: true, desc: "Fazer pedido" },
            { input: "Quero encomendar 3 unidades", expected: true, desc: "Encomendar" },
            { input: "Vou pedir esse aqui", expected: true, desc: "Pedir" },
        ]
    }
];

async function runTest() {
    const apiKey = await getApiKey();
    if (!apiKey) {
        console.error("❌ Could not find MISTRAL_API_KEY in env or DB.");
        process.exit(1);
    }
    
    const client = new Mistral({ apiKey });
    const triggerIndex = parseInt(process.argv[2] || "0", 10);
    
    if (triggerIndex < 0 || triggerIndex >= ALL_TRIGGER_TESTS.length) {
        console.log("📋 GATILHOS DISPONÍVEIS:");
        ALL_TRIGGER_TESTS.forEach((t, i) => {
            console.log(`   ${i}: ${t.trigger}`);
        });
        console.log(`\nUso: npx tsx test-notification-logic.ts [número]`);
        return;
    }

    const testSet = ALL_TRIGGER_TESTS[triggerIndex];
    
    console.log(`\n🎯 TRIGGER ${triggerIndex + 1}/${ALL_TRIGGER_TESTS.length}: "${testSet.trigger}"`);
    console.log("---------------------------------------------------");

    const notificationPrompt = getNotificationPrompt(testSet.trigger);
    const systemPrompt = `${testSet.businessContext}\n${notificationPrompt}`;

    let passed = 0;
    let failed = 0;

    for (const test of testSet.tests) {
        process.stdout.write(`Testing: "${test.input}" (${test.desc})... `);
        
        try {
            const response = await client.chat.complete({
                model: "mistral-small-latest",
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: test.input }
                ],
                temperature: 0
            });

            const content = response.choices?.[0]?.message?.content || "";
            const hasNotify = content.includes("[NOTIFY:");
            
            if (hasNotify === test.expected) {
                console.log("✅");
                passed++;
            } else {
                console.log(`❌ (Expected: ${test.expected}, Got: ${hasNotify})`);
                console.log(`   Response: ${content.substring(0, 100)}...`);
                failed++;
            }

        } catch (error: any) {
            console.error("Error:", error?.message || error);
            failed++;
        }
        
        await new Promise(resolve => setTimeout(resolve, 500));
    }

    console.log("\n---------------------------------------------------");
    console.log(`📊 RESULTADO: ${passed}/${testSet.tests.length} (${Math.round(passed/testSet.tests.length*100)}%)`);
    if (failed > 0) {
        console.log(`❌ FALHAS: ${failed}`);
        console.log(`\n💡 Próximo passo: Ajustar o prompt e rodar novamente`);
    } else {
        console.log("🎉 TODOS OS TESTES PASSARAM!");
        if (triggerIndex < ALL_TRIGGER_TESTS.length - 1) {
            console.log(`\n➡️  Próximo gatilho: npx tsx test-notification-logic.ts ${triggerIndex + 1}`);
        } else {
            console.log("\n🏆 TODOS OS GATILHOS TESTADOS COM SUCESSO!");
        }
    }
}

runTest();
