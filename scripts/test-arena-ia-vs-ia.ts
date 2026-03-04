
import 'dotenv/config';
import { db } from "../server/db";
import { users, aiAgentConfig, systemConfig } from "../shared/schema";
import { eq } from "drizzle-orm";
import { getMistralClient } from "../server/mistralClient";
import fs from 'fs';
import path from 'path';

// --- SYSTEM PROMPTS (PERSONAS) ---
const PERSONAS = [
    {
        name: "Claudio indeciso",
        prompt: "Você é Claudio. Você quer pedir uma pizza mas é muito indeciso. Você pergunta sobre sabores, preços, e muda de ideia. Você fala de forma coloquial. Seu objetivo é enrolar um pouco mas acabar pedindo uma pizza de calabresa."
    },
    {
        name: "Maria Apressada",
        prompt: "Você é Maria. Você está com fome e pressa. Você quer pedir um açaí de 500ml com banana e granola. Você é direta, responde curto e grosso. Se o atendente enrolar, você reclama."
    },
    {
        name: "João Meio a Meio",
        prompt: "Você é João. Você quer uma pizza grande meio calabresa e meio frango com catupiry. Você é detalhista. Você quer ter certeza que entenderam o 'meio a meio'. Você confirma o preço duas vezes."
    },
    {
        name: "Ana Vegana",
        prompt: "Você é Ana sem glúten/vegana. Você quer saber se tem opções veganas de açaí (sem mel, sem leite em pó). Você é educada mas firme nas suas restrições alimentares. Finalize pedindo um açaí puro com morango."
    },
    {
        name: "Pedro Tech",
        prompt: "Você é Pedro, programador. Você fala rápido, usa gírias como 'top', 'valeu', 'pix'. Você quer pedir 2 coca-colas e uma pizza 4 queijos. Você paga no pix."
    },
    {
        name: "Lucas Cancelador",
        prompt: "Você é Lucas. Você começa pedindo uma pizza de atum. No meio do pedido, você pergunta o tempo de entrega. Se for mais de 30min, você desiste e cancela. Simule que achou demorado."
    },
    {
        name: "Juliana Faminta",
        prompt: "Você é Juliana. Você quer pedir MUITA coisa. 1 Açaí 700ml, 1 Pizza Gigante Portuguesa, 2 Guaranás. Você quer saber se ganha brinde por pedir muito. Você é simpática."
    },
    {
        name: "Roberto Econômico",
        prompt: "Você é Roberto. Você quer o item mais barato do cardápio. Pergunte qual a promoção do dia. Tente negociar a taxa de entrega. Se não der desconto, peça o mais barato mesmo."
    },
    {
        name: "Fernanda Confusa",
        prompt: "Você é Fernanda. Você pede uma pizza, depois diz que é engano e queria açaí. Depois volta pra pizza. Você passa o endereço errado primeiro (Rua A), depois corrige (Rua B). Simule confusão."
    },
    {
        name: "Marcos Noturno",
        prompt: "Você é Marcos. Já é tarde. Você pergunta se ainda estão entregando. Você pede rápido uma pizza de mussarela. Você quer confirmação que chega quente."
    }
];

// --- LOGGING ---
const LOG_FILE = path.join(process.cwd(), 'relatorio-arena-ia-vs-ia.md');
let fullLog = "# RELATÓRIO: ARENA IA VS IA (MISTRAL PRODUCTION)\n\n";

function log(msg: string) {
    console.log(msg);
    fullLog += msg + "\n";
}

// --- MAIN CLASS ---
async function runArena() {
    log(`Iniciando Arena de Testes IA vs IA `);
    log(`Data: ${new Date().toISOString()}`);

    // 1. Fetch Agent Configuration
    log("--> Buscando configurações do Agente de Delivery (bigacaicuiaba@gmail.com)...");
    const userList = await db.select().from(users).where(eq(users.email, "bigacaicuiaba@gmail.com"));
    if (userList.length === 0) throw new Error("Usuário não encontrado.");
    const user = userList[0];

    const configList = await db.select().from(aiAgentConfig).where(eq(aiAgentConfig.userId, user.id));
    if (configList.length === 0) throw new Error("Configuração de IA não encontrada.");
    const agentPrompt = configList[0].prompt;
    const agentModel = configList[0].model; // Likely 'openai/gpt-oss-20b' but we use Mistral Key

    log(`--> Configuração Carregada. Modelo: ${agentModel}, Prompt Length: ${agentPrompt.length}`);

    // 2. Initialize Mistral Client
    log("--> Inicializando Cliente Mistral (usando chaves do banco)...");
    const mistral = await getMistralClient();
    if (!mistral) throw new Error("Falha ao inicializar Mistral client");

    // 3. Run Simulations
    for (const persona of PERSONAS) {
        log(`\n\n## 🥊 SIMULAÇÃO: ${persona.name}`);
        log(`**Objetivo**: ${persona.prompt}`);
        log(`---\n`);

        await runSingleSimulation(mistral, agentPrompt, persona);
        
        // Small pause between sims
        await new Promise(r => setTimeout(r, 10000));
    }

    // 4. Save Report
    fs.writeFileSync(LOG_FILE, fullLog);
    log(`\n\n✅ Relatório salvo em: ${LOG_FILE}`);
    process.exit(0);
}

// --- RETRY HELPER (INFINITO PARA RATE LIMIT) ---
async function withRetry(fn: () => Promise<any>, maxRetries = 100, baseDelay = 5000) {
    let attempt = 0;
    while (true) {
        attempt++;
        try {
            return await fn();
        } catch (e: any) {
            if (e?.message?.includes('429') || e?.status === 429) {
                // Rate limit - espera com backoff exponencial e continua tentando
                const waitTime = Math.min(baseDelay * Math.pow(1.5, attempt - 1), 60000); // Max 60s
                log(`⏳ Rate Limit (429). Esperando ${(waitTime/1000).toFixed(0)}s... (Tentativa ${attempt} - continuando indefinidamente)`);
                await new Promise(r => setTimeout(r, waitTime));
                // NÃO PARA - continua o loop
            } else if (e?.message?.includes('503') || e?.status === 503) {
                // Service unavailable - espera e tenta novamente
                log(`⏳ Serviço indisponível (503). Esperando 10s... (Tentativa ${attempt})`);
                await new Promise(r => setTimeout(r, 10000));
            } else if (attempt >= maxRetries) {
                log(`❌ Erro após ${maxRetries} tentativas: ${e?.message}`);
                throw e;
            } else {
                // Outro erro - tenta mais algumas vezes
                log(`⚠️ Erro (tentativa ${attempt}): ${e?.message}. Tentando novamente em 5s...`);
                await new Promise(r => setTimeout(r, 5000));
            }
        }
    }
}

// --- SIMULATION ENGINE ---
async function runSingleSimulation(client: any, agentSystemPrompt: string, persona: {name: string, prompt: string}) {
    let history: {role: string, content: string}[] = [];
    // Start with empty history.
    // Client speaks first (usually "Oi")
    
    // Conversation Setup
    const maxTurns = 8; // Reduced turns to save quota
    let turn = 0;
    let isFinished = false;

    // Initial message from Client
    let currentSpeaker = 'user'; // 'user' (Persona) vs 'assistant' (Agent)
    
    // We need separate history tracking for each AI's context window
    // Agent History: Standard [System, User, Assistant, User...]
    // Client History: [System (Persona), Assistant, User (Self), Assistant...]

    const agentHistory = [
        { role: 'system', content: agentSystemPrompt }
    ];
    const clientHistory = [
        { role: 'system', content: persona.prompt } 
    ];

    // Seed: Client starts
    let lastMessageContent = "Oi, gostaria de fazer um pedido.";
    log(`🧑 **${persona.name}**: ${lastMessageContent}`);
    
    // Push to histories
    agentHistory.push({ role: 'user', content: lastMessageContent });
    clientHistory.push({ role: 'assistant', content: lastMessageContent }); 

    while (turn < maxTurns && !isFinished) {
        turn++;
        
        // --- 1. AGENT TURN (Delivery Bot) ---
        // Agent responds to the last user message
        try {
             await new Promise(r => setTimeout(r, 3000)); // Delay before Agent speaks
             const agentResponse = await withRetry(() => client.chat.complete({
                model: 'mistral-medium-latest', 
                messages: agentHistory
            }));
            const agentText = agentResponse.choices[0].message.content;
            
            log(`🤖 **Agente**: ${agentText}`);
            
            // Update Histories
            agentHistory.push({ role: 'assistant', content: agentText });
            clientHistory.push({ role: 'user', content: agentText }); // For client, Agent is "User"

            // Check Agent Termination
            if (agentText.toLowerCase().includes("pedido confirmado") || agentText.toLowerCase().includes("obrigado")) {
                log(`🏁 **Fim da Conversa (Agente Finalizou)**`);
                isFinished = true;
                break;
            }

        } catch (e) {
            log(`❌ Erro Agente: ${e}`);
            break;
        }

        // --- 2. CLIENT TURN (Persona) ---
        // Client responds to Agent
        try {
            await new Promise(r => setTimeout(r, 3000)); // Delay before Client speaks
            const clientResponse = await withRetry(() => client.chat.complete({
                model: 'mistral-small-latest', 
                messages: clientHistory
            }));
            const clientText = clientResponse.choices[0].message.content;

            log(`🧑 **${persona.name}**: ${clientText}`);

            // Update Histories
            agentHistory.push({ role: 'user', content: clientText });
            clientHistory.push({ role: 'assistant', content: clientText });

            // Check Client Termination
            if (clientText.toLowerCase().includes("tchau") || clientText.toLowerCase().includes("cancelar")) {
                 // But wait, Agent usually wraps up.
            }

        } catch (e) {
             log(`❌ Erro Cliente: ${e}`);
             break;
        }
    }
}

runArena().catch(console.error);
