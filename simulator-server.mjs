/**
 * 🚀 SERVIDOR DO SIMULADOR DE TESTES
 * 
 * Servidor Express que:
 * - Serve a página HTML do simulador
 * - Busca prompts do Supabase
 * - Testa todos os modelos (Mistral + OpenRouter)
 * - Retorna resultados comparativos
 */

import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = 3456;

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// Conexão com banco de dados local (único pool)
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Chaves de API
let OPENROUTER_API_KEY;
const MISTRAL_API_KEY = 'Rr9AQTiXKSyPva1w9eVsDrRuMuSjySch';

// Buscar chave OpenRouter
async function getOpenRouterKey() {
  try {
    const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_api_key'");
    if (result.rows[0]?.valor) {
      return result.rows[0].valor;
    }
  } catch (e) {
    console.log('Erro ao buscar chave:', e.message);
  }
  return process.env.OPENROUTER_API_KEY;
}

// Modelos disponíveis
const MODELS = [
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B', api: 'openrouter', cost: '$0.12/M' },
  { id: 'google/gemma-3n-e4b-it', name: 'Gemma 3n E4B', api: 'openrouter', cost: '$0.06/M' },
  { id: 'open-mistral-7b', name: 'Mistral 7B', api: 'mistral', cost: '$0.25/M' },
  { id: 'mistral-small-latest', name: 'Mistral Small', api: 'mistral', cost: '$1/M' },
  { id: 'open-mixtral-8x7b', name: 'Mixtral 8x7B', api: 'mistral', cost: '$0.70/M' },
  { id: 'open-mixtral-8x22b', name: 'Mixtral 8x22B', api: 'mistral', cost: '$2/M' },
  { id: 'mistral-large-latest', name: 'Mistral Large', api: 'mistral', cost: '$4/M' },
  { id: 'meta-llama/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', api: 'openrouter', cost: '$0.06/M' },
  { id: 'google/gemma-3-4b-it', name: 'Gemma 3 4B', api: 'openrouter', cost: '$0.08/M' },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo', api: 'openrouter', cost: '$0.13/M' },
  { id: 'meta-llama/llama-guard-3-8b', name: 'Llama Guard 3 8B', api: 'openrouter', cost: '$0.20/M' },
  { id: 'mistralai/ministral-3b', name: 'Ministral 3B', api: 'openrouter', cost: '$0.04/M' },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision', api: 'openrouter', cost: '$0.18/M' },
];

// Função para chamar OpenRouter
async function callOpenRouter(modelId, systemPrompt, messages) {
  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://agentezap.online',
      'X-Title': 'AgenteZap Simulator'
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      max_tokens: 400,
      temperature: 0.3,
    })
  });

  if (!response.ok) {
    throw new Error(`OpenRouter error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {}
  };
}

// Função para chamar Mistral
async function callMistral(modelId, systemPrompt, messages) {
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${MISTRAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: modelId,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages
      ],
      max_tokens: 400,
      temperature: 0.3,
    })
  });

  if (!response.ok) {
    throw new Error(`Mistral error: ${response.status}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {}
  };
}

// Verificar qualidade da resposta
function analyzeResponse(response) {
  let score = 100;
  let hallucinations = 0;

  // Verifica alucinações comuns
  const hallucinationPatterns = [
    /sim.*integra|temos integra|compatível com shopify/i,
    /sim.*api|temos api|nossa api|api disponível/i,
    /sim.*dashboard|temos relatórios|análise de vendas/i,
    /sim.*estoque|controla.*estoque|gestão de estoque/i,
    /\(\d{2}\)\s*\d{4,5}-?\d{4}/,  // Telefone inventado
    /nossa integração.*sap|funciona assim.*sap/i,
  ];

  for (const pattern of hallucinationPatterns) {
    if (pattern.test(response)) {
      score -= 20;
      hallucinations++;
    }
  }

  // Verifica se menciona verificar (bom sinal)
  if (/verificar|não tenho|detalhes no site/i.test(response)) {
    score += 10;
  }

  // Verifica se é muito longo (pode ser chato)
  const lines = response.split('\n').filter(l => l.trim()).length;
  if (lines > 6) {
    score -= 10;
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    hallucinations
  };
}

// ROTAS

// Servir página principal
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'simulator.html'));
});

// Prompts de teste (caso banco não esteja disponível)
const TEST_PROMPTS = {
  'rodrigo4@gmail.com': `Você é RODRIGO, consultor de vendas da AgenteZap.

## REGRAS ABSOLUTAS:
1. PREÇO: R$49/mês com código PARC2026PROMO (normal R$99)
2. LINK: https://agentezap.online
3. NÃO INVENTE: Se não souber, diga que vai verificar
4. SEJA BREVE: Máximo 4 linhas

## O QUE É O AGENTEZAP:
- Plataforma de automação de WhatsApp com IA
- Responde clientes automaticamente 24h`,

  'contato@jbeletrica.com.br': `Você é JOYCE, atendente virtual da JB Elétrica.

## REGRAS:
- Empresa: JB Elétrica - materiais elétricos
- NÃO INVENTE preços ou estoque
- Se não souber algo, diga que vai verificar
- SEJA BREVE e profissional`
};

// Buscar lista de negócios
app.get('/api/businesses', async (req, res) => {
  try {
    let businesses = [];
    
    try {
      const result = await pool.query(
        `SELECT email, nome 
         FROM negocios 
         WHERE email IN ('rodrigo4@gmail.com', 'contato@jbeletrica.com.br')
         ORDER BY email`
      );

      if (result && result.rows && result.rows.length > 0) {
        businesses = result.rows.map(row => ({
          email: row.email,
          name: `${row.nome} (${row.email})`
        }));
      }
    } catch (dbError) {
      console.log('Banco não disponível, usando dados de teste');
    }
    
    // Se não encontrou no banco, usar dados de teste
    if (businesses.length === 0) {
      businesses = [
        {
          email: 'rodrigo4@gmail.com',
          name: 'Rodrigo4 (Teste Geral)'
        },
        {
          email: 'contato@jbeletrica.com.br',
          name: 'JB Elétrica'
        }
      ];
    }

    res.json(businesses);
  } catch (error) {
    console.error('Erro ao buscar negócios:', error.message);
    res.json([]);
  }
});

// Buscar prompt de um negócio específico
app.get('/api/prompt/:email', async (req, res) => {
  try {
    const { email } = req.params;
    let prompt = null;
    
    try {
      const result = await pool.query(
        'SELECT prompt_sistema FROM negocios WHERE email = $1',
        [email]
      );

      if (result.rows.length > 0) {
        prompt = result.rows[0].prompt_sistema;
      }
    } catch (dbError) {
      console.log('Banco não disponível, usando prompt de teste');
    }
    
    // Se não encontrou no banco, usar prompt de teste
    if (!prompt && TEST_PROMPTS[email]) {
      prompt = TEST_PROMPTS[email];
    }
    
    if (!prompt) {
      return res.status(404).json({ error: 'Negócio não encontrado' });
    }

    res.json({ prompt });
  } catch (error) {
    console.error('Erro ao buscar prompt:', error);
    res.status(500).json({ error: error.message });
  }
});

// Testar todos os modelos
app.post('/api/test-models', async (req, res) => {
  try {
    const { business, userMessage, history = [] } = req.body;
    let systemPrompt = null;

    // Buscar prompt do negócio
    try {
      const promptResult = await pool.query(
        'SELECT prompt_sistema FROM negocios WHERE email = $1',
        [business]
      );

      if (promptResult.rows.length > 0) {
        systemPrompt = promptResult.rows[0].prompt_sistema;
      }
    } catch (dbError) {
      console.log('Banco não disponível, usando prompt de teste');
    }
    
    // Se não encontrou no banco, usar prompt de teste
    if (!systemPrompt && TEST_PROMPTS[business]) {
      systemPrompt = TEST_PROMPTS[business];
    }

    if (!systemPrompt) {
      return res.status(404).json({ error: 'Negócio não encontrado' });
    }

    // Preparar mensagens
    const messages = [
      ...history,
      { role: 'user', content: userMessage }
    ];

    // Testar todos os modelos em paralelo
    const results = await Promise.all(
      MODELS.map(async (model) => {
        try {
          const startTime = Date.now();
          
          let response, usage;
          if (model.api === 'mistral') {
            ({ content: response, usage } = await callMistral(model.id, systemPrompt, messages));
          } else {
            ({ content: response, usage } = await callOpenRouter(model.id, systemPrompt, messages));
          }
          
          const elapsed = Date.now() - startTime;
          const analysis = analyzeResponse(response);

          return {
            modelId: model.id,
            modelName: model.name,
            api: model.api,
            cost: model.cost,
            response,
            elapsed,
            tokens: usage.total_tokens,
            score: analysis.score,
            hallucinations: analysis.hallucinations,
          };
        } catch (error) {
          console.error(`Erro no modelo ${model.name}:`, error.message);
          return {
            modelId: model.id,
            modelName: model.name,
            api: model.api,
            cost: model.cost,
            response: `ERRO: ${error.message}`,
            elapsed: 0,
            tokens: 0,
            score: 0,
            hallucinations: 99,
          };
        }
      })
    );

    // Ordenar por score (melhor primeiro)
    results.sort((a, b) => b.score - a.score);

    res.json(results);
  } catch (error) {
    console.error('Erro ao testar modelos:', error);
    res.status(500).json({ error: error.message });
  }
});

// Inicializar servidor
async function startServer() {
  try {
    OPENROUTER_API_KEY = await getOpenRouterKey();
    
    if (!OPENROUTER_API_KEY) {
      console.error('❌ ERRO: Chave OpenRouter não encontrada');
      process.exit(1);
    }

    app.listen(PORT, () => {
      console.log(`\n🚀 Simulador rodando em: http://localhost:${PORT}`);
      console.log(`\n📝 Abra no navegador para testar os modelos!`);
      console.log(`\n✅ Conectado ao banco local`);
      console.log(`✅ Modelos disponíveis: ${MODELS.length}`);
      console.log(`\n⏳ Aguardando requisições...\n`);
    });
  } catch (error) {
    console.error('❌ Erro ao iniciar servidor:', error);
    process.exit(1);
  }
}

startServer().catch(error => {
  console.error('❌ Erro fatal:', error);
  process.exit(1);
});
