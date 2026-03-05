/**
 * 🧪 TESTE COMPLETO DE TODOS OS MODELOS MISTRAL
 * 
 * Testa TODOS os modelos disponíveis via API:
 * - Mistral Large 3 (mistral-large-latest)
 * - Mistral Medium 3.1 (mistral-medium-latest)
 * - Mistral Small 3.2 (mistral-small-latest)
 * - Ministral 8B (ministral-8b-latest)
 * - Ministral 3B (ministral-3b-latest)
 * - Open Mistral 7B (open-mistral-7b)
 * - Codestral (codestral-latest)
 */

import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import pg from "pg";

// Carregar .env do diretório raiz (ES module compatible)
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
config({ path: resolve(__dirname, "../.env") });

import { Mistral } from "@mistralai/mistralai";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function getMistralKey(): Promise<string> {
  try {
    const res = await pool.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
    if (res.rows.length > 0) {
      return res.rows[0].valor;
    }
  } catch (e) {
    console.error("⚠️ Erro ao buscar chave do banco:", e);
  }
  return process.env.MISTRAL_API_KEY || "";
}

const MODELS_TO_TEST = [
  // Modelos de conversação (principais)
  "mistral-large-latest",      // Mistral Large 3 - 41B ativo (675B total)
  "mistral-medium-latest",      // Mistral Medium 3.1
  "mistral-small-latest",       // Mistral Small 3.2
  
  // Família Ministral (novos modelos eficientes)
  "ministral-8b-latest",        // Ministral 8B
  "ministral-3b-latest",        // Ministral 3B
  
  // Modelos open-source
  "open-mistral-7b",            // Mistral 7B
  "open-mixtral-8x7b",          // Mixtral 8x7B
  "open-mixtral-8x22b",         // Mixtral 8x22B
  
  // Modelos especializados
  "codestral-latest",           // Codestral (código)
  "pixtral-12b-2409",           // Pixtral (visão)
];

interface TestResult {
  model: string;
  success: boolean;
  response?: string;
  timeMs?: number;
  error?: string;
  tokens?: number;
}

async function testModel(modelName: string, apiKey: string): Promise<TestResult> {
  const startTime = Date.now();
  
  try {
    console.log(`\n🧪 Testando: ${modelName}...`);
    
    const mistral = new Mistral({ apiKey });
    
    // Cenário de teste: Cliente após teste, perguntando como implementar
    const messages = [
      {
        role: "system" as const,
        content: `Você é Rodrigo, vendedor expert do AgenteZap.
O cliente JÁ TESTOU o agente e gostou.
Agora ele pergunta como implementar no WhatsApp dele.
Explique de forma simples e persuasiva.`
      },
      {
        role: "user" as const,
        content: "E aí, como eu coloco isso pra funcionar no meu WhatsApp?"
      }
    ];
    
    const response = await mistral.chat.complete({
      model: modelName,
      messages: messages,
      maxTokens: 400,
      temperature: 0.85,
    });
    
    const timeMs = Date.now() - startTime;
    const responseText = response.choices?.[0]?.message?.content || "";
    const tokens = response.usage?.total_tokens || 0;
    
    if (!responseText) {
      return {
        model: modelName,
        success: false,
        timeMs,
        error: "Resposta vazia"
      };
    }
    
    return {
      model: modelName,
      success: true,
      response: responseText.substring(0, 200) + "...",
      timeMs,
      tokens
    };
    
  } catch (error: any) {
    const timeMs = Date.now() - startTime;
    return {
      model: modelName,
      success: false,
      timeMs,
      error: error.message || String(error)
    };
  }
}

async function main() {
  const MISTRAL_API_KEY = await getMistralKey();
  
  if (!MISTRAL_API_KEY || MISTRAL_API_KEY === 'your-mistral-key') {
    console.error("❌ MISTRAL_API_KEY não configurada");
    console.error("Configure no banco (system_config) ou no .env");
    process.exit(1);
  }
  
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
🧪 TESTE COMPLETO DE TODOS OS MODELOS MISTRAL VIA API
═══════════════════════════════════════════════════════════════════════════════
Testando ${MODELS_TO_TEST.length} modelos...
`);

  const results: TestResult[] = [];
  
  // Testar todos os modelos
  for (const model of MODELS_TO_TEST) {
    const result = await testModel(model, MISTRAL_API_KEY);
    results.push(result);
    
    // Pequeno delay para não sobrecarregar a API
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  
  // Relatório final
  console.log(`\n
═══════════════════════════════════════════════════════════════════════════════
📊 RESULTADOS FINAIS
═══════════════════════════════════════════════════════════════════════════════
`);

  const successful = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ MODELOS DISPONÍVEIS (${successful.length}):
`);
  
  successful
    .sort((a, b) => (a.timeMs || 0) - (b.timeMs || 0))
    .forEach((result, index) => {
      console.log(`${index + 1}. ${result.model}`);
      console.log(`   ⏱️  Tempo: ${result.timeMs}ms`);
      console.log(`   🎫 Tokens: ${result.tokens || 'N/A'}`);
      console.log(`   💬 Resposta: "${result.response}"`);
      console.log();
    });
  
  if (failed.length > 0) {
    console.log(`\n❌ MODELOS INDISPONÍVEIS (${failed.length}):
`);
    failed.forEach((result) => {
      console.log(`- ${result.model}`);
      console.log(`  Erro: ${result.error}`);
      console.log();
    });
  }
  
  // Recomendação
  console.log(`
═══════════════════════════════════════════════════════════════════════════════
🏆 RECOMENDAÇÃO PARA VENDAS
═══════════════════════════════════════════════════════════════════════════════
`);

  if (successful.length > 0) {
    // Encontrar o mais rápido e o com melhor qualidade
    const fastest = successful.reduce((a, b) => 
      (a.timeMs || Infinity) < (b.timeMs || Infinity) ? a : b
    );
    
    const large = successful.find(r => r.model.includes('large'));
    
    console.log(`🚀 MAIS RÁPIDO: ${fastest.model} (${fastest.timeMs}ms)`);
    if (large) {
      console.log(`🧠 MAIS INTELIGENTE: ${large.model} (${large.timeMs}ms)`);
    }
    console.log(`
PARA VENDAS HUMANIZADAS:
- Priorize QUALIDADE > VELOCIDADE
- Large é ideal para conversas complexas e persuasão
- Small/Ministral são bons para respostas rápidas e simples
`);
  }
}

main().catch(console.error);
