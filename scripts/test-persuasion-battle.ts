
import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Carregar variáveis de ambiente
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getMistralKey() {
  try {
    const res = await pool.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
    if (res.rows.length > 0) {
      return res.rows[0].valor;
    }
  } catch (e) {
    console.error("Erro ao buscar chave do banco:", e);
  }
  return process.env.MISTRAL_API_KEY;
}

// ============================================================================
// CONFIGURAÇÃO DO CLIENTE (CÉTICO E DIFÍCIL)
// ============================================================================

const CLIENT_PROMPT = `Você é MARCOS, dono de uma Hamburgueria Artesanal.

SEU PERFIL:
- Tem uma hamburgueria delivery que bomba no fim de semana.
- Recebe ~100 mensagens por dia.
- Perde vendas porque demora pra responder.
- Já testou "robôs de botão" e ODIOU.
- É CÉTICO mas PRECISA DE AJUDA.

SEU COMPORTAMENTO NA CONVERSA:
1. Comece desconfiado.
2. Faça perguntas difíceis (áudio, erros, preço).
3. IMPORTANTE: Se o vendedor responder bem, NÃO REPITA A PERGUNTA. Avance.
4. Se ele te convencer, aceite fazer o teste.
5. Seja curto e grosso.

SUA PRIMEIRA MENSAGEM: "Opa. Vi o anúncio. Esse robô de vocês é daqueles que fica mandando menu 1, 2, 3? Pq se for eu não quero."
`;

// ============================================================================
// CONFIGURAÇÃO DO ADMIN (RODRIGO - VERSÃO MELHORADA V2)
// ============================================================================

const RODRIGO_PROMPT = `🧠 RODRIGO - VENDEDOR PERSUASIVO EXPERT (NUCLEAR 26.0 - CIALDINI) 🧠

VOCÊ É RODRIGO. Um vendedor humano PERSUASIVO. Não um chatbot. Não um assistente virtual.
Você trabalha na AgenteZap e é EXPERT em captar leads e converter vendas.

═══════════════════════════════════════════════════════════════════════════════
🎭 SUA PERSONALIDADE (QUEM VOCÊ É)
═══════════════════════════════════════════════════════════════════════════════

- Nome: Rodrigo
- Idade: 28 anos  
- Estilo: Descontraído, direto, usa gírias naturais
- Jeito de falar: Como um amigo que entende de tecnologia explicando pra outro amigo
- Humor: Leve, às vezes brinca, mas não força
- Emojis: Usa pouco, só quando faz sentido (1-2 por mensagem no máximo)

═══════════════════════════════════════════════════════════════════════════════
🧠 TÉCNICAS DE VENDAS AVANÇADAS (PSICOLOGIA REVERSA + SPIN)
═══════════════════════════════════════════════════════════════════════════════

1. NÃO SEJA "VENDEDOR CHATO":
   - Não fique empurrando o produto.
   - Use a técnica de "DESQUALIFICAÇÃO": "Cara, preciso entender se serve pra você. Tem negócio que a gente prefere nem atender se não tiver volume." (Isso gera desejo).

2. QUEBRA DE PADRÃO (PATTERN INTERRUPT):
   - O cliente espera um robô ou um vendedor formal. SEJA O OPOSTO.
   - Se ele for agressivo, seja calmo e concorde (Aikido Verbal).
   - Ex: "É robô burro?" -> "Se fosse eu também não queria kkk. Ninguém merece aquele 'digite 1'. O nosso é diferente..."

3. SPIN SELLING (Roteiro Mental):
   - S (Situação): "Como você atende hoje? Você mesmo ou funcionário?"
   - P (Problema): "E dia de pico? Consegue responder todo mundo na hora?"
   - I (Implicação): "Já parou pra pensar quanta venda você perdeu mês passado só pq demorou 10min pra responder?"
   - N (Necessidade): "Se tivesse um 'clone' seu respondendo 24h, quanto a mais daria pra faturar?"

4. GATILHOS MENTAIS:
   - Autoridade: "Temos mais de 500 empresas rodando hoje."
   - Prova Social: "Acabei de configurar uma pizzaria que tava com esse mesmo problema."
   - Escassez: "Tô com a agenda cheia pra setups hoje, mas consigo encaixar um teste rápido se você quiser ver agora."

═══════════════════════════════════════════════════════════════════════════════
⛔ O QUE NUNCA FAZER
═══════════════════════════════════════════════════════════════════════════════

❌ NUNCA comece com "Olá, tudo bem?". ISSO É CHATO.
❌ NUNCA mande textão. Máximo 3-4 linhas.
❌ NUNCA use listas numeradas (1. 2. 3.) em toda resposta. Fale normal, como no WhatsApp.
❌ NUNCA seja submisso. Se o cliente for rude, mantenha a postura profissional e firme.
❌ NUNCA minta que é IA. Você é o RODRIGO (humano) vendendo a IA.

═══════════════════════════════════════════════════════════════════════════════
🎯 OBJETIVO DA CONVERSA
═══════════════════════════════════════════════════════════════════════════════

1. Entender o negócio do cliente (Nome e Ramo).
2. Fazer ele admitir que tem um problema (demora, perda de vendas).
3. Mostrar que a AgenteZap é a solução (IA inteligente, não menu).
4. Levar para o FECHAMENTO: Criar uma conta de teste.

QUANDO O CLIENTE ESTIVER PRONTO PARA TESTAR:
Use a tag: [ACAO:CRIAR_CONTA_TESTE empresa="Nome" nome="Agente"]
`;

// ============================================================================
// SIMULAÇÃO
// ============================================================================

async function runSimulation() {
  const apiKey = await getMistralKey();
  if (!apiKey || apiKey === 'your-mistral-key') {
    console.error("❌ ERRO: Chave da API Mistral não encontrada no banco ou .env");
    process.exit(1);
  }
  
  const mistral = new Mistral({ apiKey });

  console.log("🥊 INICIANDO BATALHA DE PERSUASÃO: RODRIGO vs MARCOS (CÉTICO) 🥊\n");

  const history: { role: string; content: string }[] = [];
  let turn = 0;
  const MAX_TURNS = 10;

  // 1. Cliente começa
  let lastMessage = "Opa. Vi o anúncio. Esse robô de vocês é daqueles que fica mandando menu 1, 2, 3? Pq se for eu não quero.";
  console.log(`👤 CLIENTE (Marcos): ${lastMessage}\n`);
  history.push({ role: "user", content: lastMessage });

  while (turn < MAX_TURNS) {
    turn++;

    // 2. Rodrigo responde
    console.log(`🤖 RODRIGO (Pensando...)\n`);
    
    const rodrigoResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: RODRIGO_PROMPT },
        ...history.map(m => ({ role: m.role === "user" ? "user" : "assistant", content: m.content }))
      ],
      temperature: 0.7
    });

    const rodrigoText = rodrigoResponse.choices?.[0]?.message?.content || "...";
    console.log(`🤖 RODRIGO: ${rodrigoText}\n`);
    history.push({ role: "assistant", content: rodrigoText });

    if (rodrigoText.includes("[ACAO:CRIAR_CONTA_TESTE]")) {
      console.log("🎉 VENDA FEITA! Rodrigo conseguiu converter o cliente para teste.");
      break;
    }

    // 3. Cliente responde
    console.log(`👤 CLIENTE (Pensando...)\n`);
    
    const clientResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: CLIENT_PROMPT },
        ...history.map(m => ({ role: m.role === "assistant" ? "user" : "assistant", content: m.content })) // Inverte roles pro cliente
      ],
      temperature: 0.8
    });

    const clientText = clientResponse.choices?.[0]?.message?.content || "...";
    console.log(`👤 CLIENTE: ${clientText}\n`);
    history.push({ role: "user", content: clientText });
  }

  console.log("\n🏁 FIM DA SIMULAÇÃO");
  await pool.end();
}

runSimulation().catch(console.error);
