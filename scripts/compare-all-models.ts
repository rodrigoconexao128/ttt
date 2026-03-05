
import { Mistral } from '@mistralai/mistralai';
import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

const RODRIGO_PROMPT = `🧠 RODRIGO - O MELHOR VENDEDOR DO MUNDO 🧠

VOCÊ É O RODRIGO DA AGENTEZAP. Não um robô, não um script. Você é uma PESSOA.
Você é aquele vendedor top performer, carismático, inteligente e extremamente humano.

═══════════════════════════════════════════════════════════════════════════════
🎙️ SUA VOZ E ESTILO (REFERÊNCIA ABSOLUTA)
═══════════════════════════════════════════════════════════════════════════════
"Boa tarde tudo bem? seja bem vindo sou o Rodrigo da AgenteZap sabe deixa eu te explicar a gente é um sistema que cria uma inteligência artificial que fala como você e vende o seu produto. É isso que é o nosso sistema. A gente quer entender se você atende, se você vai trabalhar em alguma plataforma e você quer que a inteligência conversa pra você. Ao invés de você ter que responder o cliente, a inteligência artificial vai responder o seu cliente. Vai vender, vai qualificar esse lead."

👆 LEIA ISSO E ABSORVA A ALMA DESSE TEXTO.
- É fluido, não tem pontuação perfeita.
- É acolhedor ("seja bem vindo").
- É claro sobre quem você é ("Rodrigo da AgenteZap").
- É focado na dor ("Ao invés de você ter que responder... a IA responde").
- NÃO É ROBÓTICO. Não usa "Prezado", "Por favor", "Gostaria".
- ZERO EMOTICONS: Você é uma pessoa séria. Mantenha o tom profissional e direto.

═══════════════════════════════════════════════════════════════════════════════
🎯 SEU OBJETIVO ÚNICO
═══════════════════════════════════════════════════════════════════════════════
Seu objetivo é fazer o cliente CRIAR A CONTA DE TESTE ou CONTRATAR.

═══════════════════════════════════════════════════════════════════════════════
🚫 MEMÓRIA DE CURTO PRAZO (CRÍTICO)
═══════════════════════════════════════════════════════════════════════════════
⚠️ VOCÊ JÁ CRIOU O TESTE PARA ESTE CLIENTE!
⚠️ O LINK JÁ FOI ENVIADO ANTERIORMENTE.

🚫 PROIBIDO:
- NÃO ofereça criar o teste de novo.
- NÃO pergunte "quer testar?" ou "vamos criar?".
- NÃO peça dados da empresa de novo.

✅ O QUE FAZER AGORA (Fase de Pós-Teste):
- Pergunte: "E aí, conseguiu acessar o link?"
- Se ele testou e gostou, ofereça o plano: "Bora oficializar?"
- Se tiver dúvidas, responda e reforce que no plano completo tem mais funções.

═══════════════════════════════════════════════════════════════════════════════
🧠 RECENCY BIAS (VIÉS DE RECÊNCIA)
═══════════════════════════════════════════════════════════════════════════════
ATENÇÃO EXTREMA:
Antes de responder, LEIA AS ÚLTIMAS 3 MENSAGENS DO USUÁRIO.
- Se você já perguntou algo e ele respondeu, NÃO PERGUNTE DE NOVO.
- Se você já ofereceu algo e ele recusou, NÃO OFEREÇA DE NOVO.
- Se você já se apresentou, NÃO SE APRESENTE DE NOVO.

SEJA UMA CONTINUAÇÃO FLUIDA DA CONVERSA, NÃO UM ROBÔ QUE REINICIA.
`;

async function runComparison() {
  const apiKey = await getMistralKey();
  if (!apiKey) {
    console.error("❌ ERRO: Chave da API Mistral não encontrada!");
    process.exit(1);
  }

  const mistral = new Mistral({ apiKey });

  // Modelos para testar (apenas aqueles disponíveis via API)
  const modelsToTest = [
    "mistral-large-latest",      // Latest Large
    "mistral-medium-latest",     // Latest Medium
    "mistral-small-latest",      // Latest Small
  ];

  // Histórico simulado onde o teste JÁ FOI CRIADO
  const baseHistory = [
    { role: "user", content: "agentezap" },
    { role: "assistant", content: "Oi! Sou o Rodrigo da AgenteZap. A gente cria uma IA que fala como você e vende seu produto." },
    { role: "user", content: "Tenho uma imobiliária" },
    { role: "assistant", content: "Top! Criando o agente para a Imobiliária Silva agora mesmo... [ACAO:CRIAR_CONTA_TESTE empresa='Imobiliária Silva' nome='Corretor']\n\nTá aí o teste! https://agentezap.online/login\n\nTesta aí e me diz o que achou!" }
  ];

  const clienteMsg = "Oi Rodrigo! Testei o link e achei bem interessante! 😊 Mas e agora? Como eu faço pra colocar essa IA no meu número? E tem contrato?";

  console.log("\n🤖 COMPARATIVO DE MODELOS MISTRAL");
  console.log("══════════════════════════════════════════════════════════════════════════════");
  console.log(`\n📌 CENÁRIO: Cliente em fase pós-teste, quer saber como contratar`);
  console.log(`👤 CLIENTE: "${clienteMsg}"\n`);

  const results: Array<{ model: string; success: boolean; quality: string; text: string }> = [];

  for (const model of modelsToTest) {
    console.log(`\n🧪 TESTANDO: ${model}`);
    console.log("─".repeat(80));

    const history = JSON.parse(JSON.stringify(baseHistory));
    history.push({ role: "user", content: clienteMsg });

    try {
      const startTime = Date.now();
      const response = await mistral.chat.complete({
        model: model,
        messages: [
          { role: "system", content: RODRIGO_PROMPT },
          ...history
        ],
        temperature: 0.8,
        maxTokens: 400
      });
      const endTime = Date.now();

      const text = response.choices?.[0]?.message?.content || "...";
      
      // Análise de qualidade
      let quality = "⚠️ RUIM";
      let success = false;

      if (text.includes("CRIAR_CONTA_TESTE") || text.toLowerCase().includes("vamos criar um teste")) {
        quality = "❌ FALHA CRÍTICA";
        success = false;
      } else if (text.length < 50) {
        quality = "⚠️ RESPOSTA MUITO CURTA";
        success = false;
      } else if (
        (text.toLowerCase().includes("oficializar") || 
         text.toLowerCase().includes("colocar") || 
         text.toLowerCase().includes("r$ 99") ||
         text.toLowerCase().includes("contratar")) &&
        !text.includes("CRIAR_CONTA_TESTE")
      ) {
        quality = "✅ EXCELENTE";
        success = true;
      } else if (text.toLowerCase().includes("perfeito") || text.toLowerCase().includes("ótimo")) {
        quality = "👍 BOM";
        success = true;
      }

      console.log(`${quality}`);
      console.log(`⏱️  Tempo: ${endTime - startTime}ms`);
      console.log(`📝 Resposta: ${text.substring(0, 200)}...`);
      
      results.push({ model, success, quality, text });

    } catch (error: any) {
      console.log(`❌ ERRO: ${error.message}`);
      results.push({ model, success: false, quality: "❌ ERRO NA API", text: "" });
    }
  }

  // Resumo final
  console.log("\n\n📊 RESUMO FINAL");
  console.log("══════════════════════════════════════════════════════════════════════════════");
  
  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);

  console.log(`\n✅ MODELOS EXCELENTES (${successful.length}):`);
  successful.forEach(r => {
    console.log(`   • ${r.model}`);
  });

  console.log(`\n❌ MODELOS COM PROBLEMAS (${failed.length}):`);
  failed.forEach(r => {
    console.log(`   • ${r.model} - ${r.quality}`);
  });

  if (successful.length > 0) {
    console.log(`\n🏆 RECOMENDAÇÃO: Use ${successful[0].model}`);
    console.log(`\nRazão: ${successful[0].quality}`);
    console.log("\n📝 Resposta (preview):");
    console.log(successful[0].text);
  } else {
    console.log("\n⚠️ NENHUM MODELO PASSOU! Revisar os testes.");
  }
}

runComparison().catch(console.error);
