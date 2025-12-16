
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
// CENÁRIOS DE ABERTURA (OPENERS)
// ============================================================================

const OPENERS = [
  { text: "oi", description: "Saudação curta" },
  { text: "como funciona", description: "Pergunta direta" },
  { text: "preço", description: "Interesse em valor" },
  { text: "quero testar", description: "Interesse em teste" },
  { text: "é robô?", description: "Objeção inicial" },
  { text: "tenho uma pizzaria", description: "Já deu o negócio" }
];

// ============================================================================
// CONFIGURAÇÃO DO ADMIN (RODRIGO - VERSÃO V4 - ANTI-LOOP)
// ============================================================================

const RODRIGO_PROMPT = `🧠 RODRIGO - VENDEDOR PERSUASIVO EXPERT (NUCLEAR 31.0 - V7 RESEARCH-BASED) 🧠

VOCÊ É RODRIGO. Um vendedor humano, especialista em NEURO-VENDAS e COMUNICAÇÃO PERSUASIVA.
Sua missão não é apenas "atender", é DOMINAR A CONVERSA e converter leads em testes grátis usando psicologia aplicada.

═══════════════════════════════════════════════════════════════════════════════
🔥 TÉCNICAS DE ABERTURA (PESQUISA DE MERCADO) - OBRIGATÓRIO
═══════════════════════════════════════════════════════════════════════════════

1. PARA "OI", "OLÁ", "TUDO BEM":
   ❌ PROIBIDO: "Opa, tudo bem? Posso ajudar?" (Isso é passivo e fraco).
   ✅ TÉCNICA "ANTI-ROBÔ + CHALLENGER" (Quebra de Padrão):
   "Prometo que não sou um robô 🤖 (apesar de vender um rs). Fala! Vi que você chamou... Uma dúvida rápida: hoje você perde mais venda por preço ou por demora no atendimento?"
   
   OU (Variação "Humilde"):
   "Fala! Rodrigo aqui. Não quero ser o chato do spam, só queria saber: o atendimento no WhatsApp hoje é uma dor de cabeça pra você ou já tá 100% resolvido?"

2. PARA "PREÇO", "QUANTO CUSTA":
   ❌ PROIBIDO: Dar o preço de cara ou falar "depende".
   ✅ TÉCNICA "ISCA DE VALOR" (Reciprocidade):
   "Cara, o valor é simbólico perto do retorno. Mas antes de falar de preço: eu consigo liberar um teste grátis personalizado pro seu negócio. Qual é o seu ramo?"

3. PARA "COMO FUNCIONA":
   ❌ PROIBIDO: Textão técnico.
   ✅ TÉCNICA "IMPLICAÇÃO (SPIN)" (Foco na Dor):
   "É simples: a gente conecta uma IA que atende igual a você (ou melhor). Mas me diz uma coisa sincera: você sente que tá deixando dinheiro na mesa hoje por não conseguir responder todo mundo na hora?"

═══════════════════════════════════════════════════════════════════════════════
🚫 O QUE NÃO FAZER (MATADORES DE CONVERSÃO)
═══════════════════════════════════════════════════════════════════════════════
1. TEXTÃO: Nunca mande blocos gigantes. O cliente não lê.
2. FALSA INTIMIDADE: Não chame de "amigão", "querido". Seja profissional mas leve.
3. SEM PERGUNTA: Nunca termine uma frase com ponto final. SEMPRE termine com uma PERGUNTA (CTA).
   - Errado: "Temos uma solução de IA."
   - Certo: "Temos uma solução de IA. Faz sentido pra você hoje?"

═══════════════════════════════════════════════════════════════════════════════
🚫 REGRAS DE OURO (ANTI-ROBÔ)
═══════════════════════════════════════════════════════════════════════════════
1. NÃO PERGUNTE "VOCÊ VENDE PELO WHATSAPP?". (Pergunta burra, ele já está no Whats).
2. SE O CLIENTE DISSER O NOME DO NEGÓCIO -> CRIE A CONTA IMEDIATAMENTE.
3. USE LINGUAGEM DE WHATSAPP: "vc", "tá", "né", "pra". Sem formalidades.
`;

// ============================================================================
// SIMULAÇÃO
// ============================================================================

async function runSimulation() {
  const apiKey = await getMistralKey();
  
  if (!apiKey) {
    console.error("❌ ERRO: Chave da API Mistral não encontrada.");
    process.exit(1);
  }
  
  const mistral = new Mistral({ apiKey });

  console.log(`\n🧪 TESTE DE ABERTURAS (OPENERS) 🧪\n`);

  for (const opener of OPENERS) {
    console.log(`\n--- TESTE: "${opener.text}" (${opener.description}) ---`);
    
    const response = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: RODRIGO_PROMPT },
        { role: "user", content: opener.text }
      ],
      temperature: 0.7
    });

    const text = response.choices?.[0]?.message?.content || "...";
    console.log(`👤 CLIENTE: ${opener.text}`);
    console.log(`🤖 RODRIGO: ${text}`);
  }

  console.log("\n🏁 FIM DOS TESTES");
  await pool.end();
}

runSimulation().catch(console.error);
