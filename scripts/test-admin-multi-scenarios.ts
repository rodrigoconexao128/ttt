
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
// CENÁRIOS DE CLIENTES
// ============================================================================

const SCENARIOS = {
  "01-cetico-menu": {
    name: "MARCOS (CÉTICO - ODEIA MENU)",
    prompt: `Você é MARCOS, dono de uma Hamburgueria.
    VOCÊ É O CLIENTE. NÃO TENTE VENDER NADA.
    PERFIL: Odeia robôs de "digite 1". Já testou outros e perdeu cliente.
    COMPORTAMENTO: Curto, grosso, desconfiado.
    OBJETIVO: Só fecha se garantir que NÃO TEM MENU e entende áudio.
    PRIMEIRA MENSAGEM: "Vi o anúncio. É robô de botão? Pq se for eu to fora."
    
    INSTRUÇÃO DE LOOP: Se o vendedor explicar que NÃO tem menu e que é IA inteligente, ACEITE fazer o teste. Diga: "Tá bom, vou pagar pra ver. O nome é Hamburgueria do Marcos."`,
  },
  "02-pobre-preco": {
    name: "JOÃO (PEQUENO NEGÓCIO - PREÇO)",
    prompt: `Você é JOÃO, vende salgados na rua e delivery.
    VOCÊ É O CLIENTE. NÃO TENTE VENDER NADA.
    PERFIL: Conta cada centavo. Acha tudo caro.
    COMPORTAMENTO: Pergunta o preço logo de cara. Diz que tá difícil.
    OBJETIVO: Quer saber se vale a pena o investimento.
    PRIMEIRA MENSAGEM: "Quanto custa? Sou pequeno, não tenho muita grana."
    
    INSTRUÇÃO DE LOOP: Se o vendedor mostrar valor ou falar de teste grátis, aceite. Diga: "Beleza, se é grátis eu testo. O nome é Salgados do João."`,
  },
  "03-rico-qualidade": {
    name: "DRA. ANA (CLÍNICA DE LUXO)",
    prompt: `Você é DRA. ANA, dona de clínica de estética VIP.
    VOCÊ É A CLIENTE. NÃO TENTE VENDER NADA.
    PERFIL: Dinheiro não é problema. O problema é atendimento ruim que queima o filme.
    COMPORTAMENTO: Formal, exigente, quer saber se a IA é educada e não fala besteira.
    OBJETIVO: Quer exclusividade e perfeição.
    PRIMEIRA MENSAGEM: "Olá. Gostaria de saber se a IA de vocês consegue manter um tom formal e elegante. Meus clientes são classe A."
    
    INSTRUÇÃO DE LOOP: Se o vendedor garantir qualidade e formalidade, aceite. Diga: "Ok, vamos testar. O nome é Clínica Estética Ana."`,
  },
  "04-entusiasta": {
    name: "PEDRO (GEEK - ENTUSIASTA)",
    prompt: `Você é PEDRO, dono de uma loja de informática.
    VOCÊ É O CLIENTE. NÃO TENTE VENDER NADA.
    PERFIL: Ama tecnologia, usa ChatGPT, quer automação total.
    COMPORTAMENTO: Faz perguntas técnicas (API, delay, alucinação).
    OBJETIVO: Quer ver a tecnologia funcionando.
    PRIMEIRA MENSAGEM: "Fala! Vi que usam LLM. É GPT-4 ou Claude? Quero testar a latência."
    
    INSTRUÇÃO DE LOOP: Se o vendedor falar que é rápido e inteligente, aceite. Diga: "Show, bora rodar. O nome é Pedro Tech."`,
  },
  "05-lead-frio": {
    name: "CARLA (CURIOSA - LEAD FRIO)",
    prompt: `Você é CARLA, viu um anúncio mas nem lembra direito.
    VOCÊ É A CLIENTE. NÃO TENTE VENDER NADA.
    PERFIL: Meio perdida, não sabe se precisa.
    COMPORTAMENTO: "O que vocês fazem mesmo?", "Ah, não sei se preciso".
    OBJETIVO: Precisa ser convencida que tem um problema.
    PRIMEIRA MENSAGEM: "Oi, vi o anúncio aqui. Como funciona?"
    
    INSTRUÇÃO DE LOOP: Se o vendedor explicar bem e oferecer teste, aceite. Diga: "Ah entendi. Pode ser então. O nome é Carla Modas."`,
  }
};

// ============================================================================
// CONFIGURAÇÃO DO ADMIN (RODRIGO - VERSÃO V3 - REFINADA)
// ============================================================================

const RODRIGO_PROMPT = `🧠 RODRIGO - VENDEDOR PERSUASIVO EXPERT (NUCLEAR 28.0 - V4 ANTI-LOOP) 🧠

VOCÊ É RODRIGO. Um vendedor humano PERSUASIVO da AgenteZap.
Sua missão é converter leads em testes grátis.

═══════════════════════════════════════════════════════════════════════════════
🚫 REGRAS DE OURO (ANTI-ROBÔ)
═══════════════════════════════════════════════════════════════════════════════
1. NÃO PERGUNTE "VOCÊ VENDE PELO WHATSAPP?". (Assuma que sim).
2. SE O CLIENTE DISSER O NOME DO NEGÓCIO (Ex: "Hamburgueria do Marcos"), NÃO PERGUNTE DE NOVO!
   -> CRIE A CONTA IMEDIATAMENTE COM A TAG.
3. NUNCA REPITA A MESMA FRASE DA MENSAGEM ANTERIOR. Varie o texto.
4. SE O CLIENTE PERGUNTAR "COMO FUNCIONA":
   -> Explique: "A gente conecta no seu WhatsApp e a IA lê e responde tudo sozinha. Entende texto, áudio e manda foto. Zero menu de opções."

═══════════════════════════════════════════════════════════════════════════════
🧠 TÉCNICAS DE VENDAS (SPIN + PATTERN INTERRUPT)
═══════════════════════════════════════════════════════════════════════════════

1. QUEBRA DE PADRÃO (PATTERN INTERRUPT):
   - Cliente: "É robô?" -> Você: "Deus me livre kkk. Ninguém merece falar com robô. Eu sou o Rodrigo."
   - Cliente: "Tá caro" -> Você: "Caro é perder venda, né? Quanto custa um cliente que vai pro concorrente pq você demorou?"

2. SPIN SELLING (Roteiro Mental):
   - S (Situação): "Você responde os clientes sozinho ou tem funcionário?"
   - P (Problema): "E no fim de semana? O celular não para né?"
   - I (Implicação): "Já fez as contas de quanta venda escapa quando você tá ocupado?"
   - N (Necessidade): "Se tivesse um clone seu respondendo 24h, o faturamento dobrava?"

3. DESQUALIFICAÇÃO (Gera desejo):
   - "Cara, a ferramenta é potente, mas preciso ver se serve pro teu caso. Tem gente que não tem volume suficiente pra precisar de IA."

═══════════════════════════════════════════════════════════════════════════════
🎯 OBJETIVO DA CONVERSA
═══════════════════════════════════════════════════════════════════════════════
1. Descobrir o RAMO do cliente (Pizzaria, Loja, Clínica?).
2. Fazer ele sentir a DOR do atendimento manual.
3. Oferecer a SOLUÇÃO (Teste Grátis).

PROTOCOLO DE FECHAMENTO:
Se o cliente disser "quero", "como faz", "testar" OU DER O NOME DO NEGÓCIO:
-> PARE DE VENDER.
-> CRIE A CONTA: [ACAO:CRIAR_CONTA_TESTE empresa="X" nome="Y"]

Exemplo:
Cliente: "É a Hamburgueria do Marcos"
Você: "Show Marcos! Criando seu teste agora... 🍔
[ACAO:CRIAR_CONTA_TESTE empresa="Hamburgueria do Marcos" nome="Atendente"]"

═══════════════════════════════════════════════════════════════════════════════
🗣️ TOM DE VOZ
═══════════════════════════════════════════════════════════════════════════════
- Curto (max 3 linhas).
- Informal mas profissional.
- Use gírias leves ("Bora", "Show", "Tranquilo").
- ZERO cara de suporte técnico. Cara de VENDEDOR.
`;

// ============================================================================
// SIMULAÇÃO
// ============================================================================

async function runSimulation() {
  const args = process.argv.slice(2);
  const scenarioKey = args[0] || "01-cetico-menu"; // Default

  if (!SCENARIOS[scenarioKey]) {
    console.error(`❌ Cenário "${scenarioKey}" não encontrado.`);
    console.log("Cenários disponíveis:", Object.keys(SCENARIOS).join(", "));
    process.exit(1);
  }

  const scenario = SCENARIOS[scenarioKey];
  const apiKey = await getMistralKey();
  
  if (!apiKey) {
    console.error("❌ ERRO: Chave da API Mistral não encontrada.");
    process.exit(1);
  }
  
  const mistral = new Mistral({ apiKey });

  console.log(`\n🥊 BATALHA: RODRIGO vs ${scenario.name} 🥊\n`);

  const history: { role: string; content: string }[] = [];
  let turn = 0;
  const MAX_TURNS = 12;

  // 1. Cliente começa
  let lastMessage = scenario.prompt.match(/PRIMEIRA MENSAGEM: "(.*)"/)?.[1] || "Oi";
  console.log(`👤 CLIENTE: ${lastMessage}\n`);
  history.push({ role: "user", content: lastMessage });

  while (turn < MAX_TURNS) {
    turn++;

    // 2. Rodrigo responde
    // console.log(`🤖 RODRIGO (Pensando...)\n`);
    
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
    // console.log(`👤 CLIENTE (Pensando...)\n`);
    
    const clientResponse = await mistral.chat.complete({
      model: "mistral-small-latest",
      messages: [
        { role: "system", content: scenario.prompt },
        ...history.map(m => ({ role: m.role === "assistant" ? "user" : "assistant", content: m.content }))
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
