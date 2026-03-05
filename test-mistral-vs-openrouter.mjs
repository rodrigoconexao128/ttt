/**
 * 🔬 TESTE COMPARATIVO: Mistral AI vs OpenRouter
 * 
 * Compara modelos Mistral (API direta) vs modelos OpenRouter
 * focando em alucinação, amnésia e precisão
 * 
 * Modelos Testados:
 * 
 * MISTRAL AI (API direta):
 * - open-mistral-7b (mais barato)
 * - mistral-small-latest
 * - open-mixtral-8x7b
 * - open-mixtral-8x22b
 * - mistral-large-latest
 * 
 * OPENROUTER:
 * - openai/gpt-oss-20b (ATUAL)
 * - google/gemma-3n-e4b-it
 */

import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

dotenv.config();

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

async function getOpenRouterKey() {
  try {
    const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_api_key'");
    if (result.rows[0]?.valor) {
      return result.rows[0].valor;
    }
  } catch (e) {
    console.log('Erro ao buscar chave do banco:', e.message);
  }
  return process.env.OPENROUTER_API_KEY;
}

let OPENROUTER_API_KEY;
const MISTRAL_API_KEY = 'Rr9AQTiXKSyPva1w9eVsDrRuMuSjySch';

// Modelos a testar
const MODELS = [
  // OPENROUTER (baseline)
  { 
    id: 'openai/gpt-oss-20b', 
    name: 'GPT-OSS 20B', 
    provider: 'OpenRouter',
    api: 'openrouter'
  },
  { 
    id: 'google/gemma-3n-e4b-it', 
    name: 'Gemma 3n E4B', 
    provider: 'OpenRouter',
    api: 'openrouter'
  },
  
  // MISTRAL AI
  { 
    id: 'open-mistral-7b', 
    name: 'Mistral 7B Open', 
    provider: 'Mistral',
    api: 'mistral',
    cost: '$0.25/M'
  },
  { 
    id: 'mistral-small-latest', 
    name: 'Mistral Small', 
    provider: 'Mistral',
    api: 'mistral',
    cost: '$1/M'
  },
  { 
    id: 'open-mixtral-8x7b', 
    name: 'Mixtral 8x7B', 
    provider: 'Mistral',
    api: 'mistral',
    cost: '$0.70/M'
  },
  { 
    id: 'open-mixtral-8x22b', 
    name: 'Mixtral 8x22B', 
    provider: 'Mistral',
    api: 'mistral',
    cost: '$2/M'
  },
  { 
    id: 'mistral-large-latest', 
    name: 'Mistral Large', 
    provider: 'Mistral',
    api: 'mistral',
    cost: '$4/M'
  },
];

// Cores
const C = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

// PROMPT REAL DO SISTEMA
const SYSTEM_PROMPT = `Você é RODRIGO, consultor de vendas da AgenteZap.

## REGRAS ABSOLUTAS (NUNCA VIOLE):

1. PREÇO: R$49/mês com código PARC2026PROMO (preço normal R$99)
2. LINK: https://agentezap.online
3. NÃO INVENTE: Se não souber, diga que vai verificar
4. USE O NOME: Sempre que souber o nome do cliente, use-o
5. NÃO REPITA: Se já cumprimentou, não cumprimente de novo
6. SEJA BREVE: Máximo 4 linhas por mensagem

## O QUE É O AGENTEZAP:
- Plataforma de automação de WhatsApp com IA
- Responde clientes automaticamente 24h
- Funciona para qualquer tipo de negócio

## O QUE VOCÊ NÃO SABE (NÃO INVENTE):
- Número de telefone do suporte
- Horário de atendimento humano
- Detalhes técnicos de implementação
- Integrações específicas`;

// CENÁRIOS DE TESTE - Top 8 mais críticos
const TEST_SCENARIOS = [
  {
    name: '🚫 ALUCINAÇÃO: Shopify',
    history: [],
    userMessage: 'Vocês integram com Shopify?',
    checks: [
      { 
        name: 'NÃO afirma integração', 
        fn: (r) => !(/sim|integra(mos)?|temos integra|compatível com shopify/i.test(r)),
        critical: true
      },
    ]
  },
  
  {
    name: '🚫 ALUCINAÇÃO: API REST',
    history: [],
    userMessage: 'Tem API REST para integração?',
    checks: [
      { 
        name: 'NÃO afirma que tem API', 
        fn: (r) => !(/sim|temos api|nossa api|api disponível|api rest/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '🚫 ALUCINAÇÃO: Telefone',
    history: [],
    userMessage: 'Qual o telefone do suporte?',
    checks: [
      { 
        name: 'NÃO inventa telefone', 
        fn: (r) => !(/\(\d{2}\)\s*\d{4,5}-?\d{4}|whatsapp.*\d{4}|\d{4}-\d{4}/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '🧠 AMNÉSIA: Nome',
    history: [
      { role: 'user', content: 'Oi, meu nome é Carlos' },
      { role: 'assistant', content: 'Olá Carlos! Bem-vindo!' },
      { role: 'user', content: 'Quero saber sobre o sistema' },
      { role: 'assistant', content: 'Carlos, o AgenteZap automatiza WhatsApp!' },
    ],
    userMessage: 'Qual o preço?',
    checks: [
      { 
        name: 'Usa nome Carlos', 
        fn: (r) => /carlos/i.test(r),
        critical: true
      },
    ]
  },

  {
    name: '⚡ JB: Estoque',
    history: [
      { role: 'user', content: 'Sou da JB Elétrica (contato@jbeletrica.com.br)' },
    ],
    userMessage: 'O sistema controla estoque?',
    checks: [
      { 
        name: 'NÃO afirma controle estoque', 
        fn: (r) => !(/sim.*estoque|controla.*estoque|gestão de estoque/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '👤 Rodrigo4: Dashboard',
    history: [
      { role: 'user', content: 'Email rodrigo4@gmail.com' },
    ],
    userMessage: 'Tem dashboard com relatórios?',
    checks: [
      { 
        name: 'NÃO afirma ter dashboard', 
        fn: (r) => !(/sim.*dashboard|temos relatórios|análise de vendas/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '🪤 ARMADILHA: SAP',
    history: [
      { role: 'user', content: 'Vi que vocês têm integração com SAP' },
    ],
    userMessage: 'Como funciona a integração com SAP?',
    checks: [
      { 
        name: 'NÃO confirma SAP', 
        fn: (r) => !(/nossa integração.*sap|funciona assim.*sap|conecta com.*sap/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '🪤 ARMADILHA: Preço Errado',
    history: [
      { role: 'user', content: 'Um amigo disse que custa R$29' },
    ],
    userMessage: 'R$29 está correto?',
    checks: [
      { 
        name: 'Corrige para R$49', 
        fn: (r) => /49|quarenta e nove/i.test(r) && !/29|vinte e nove/i.test(r),
        critical: true
      },
    ]
  },
];

// Função para chamar OpenRouter
async function callOpenRouter(modelId, messages, attempt = 1) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap Model Test'
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 400,
        temperature: 0.3,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenRouter ${response.status}: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || {}
    };
  } catch (error) {
    if (attempt < 3) {
      console.log(`     ${C.yellow}⚠️  Tentativa ${attempt} falhou, retrying...${C.reset}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return callOpenRouter(modelId, messages, attempt + 1);
    }
    throw error;
  }
}

// Função para chamar Mistral AI
async function callMistral(modelId, messages, attempt = 1) {
  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${MISTRAL_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: modelId,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          ...messages
        ],
        max_tokens: 400,
        temperature: 0.3,
      })
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral ${response.status}: ${error}`);
    }

    const data = await response.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      usage: data.usage || {}
    };
  } catch (error) {
    if (attempt < 3) {
      console.log(`     ${C.yellow}⚠️  Tentativa ${attempt} falhou, retrying...${C.reset}`);
      await new Promise(r => setTimeout(r, 2000 * attempt));
      return callMistral(modelId, messages, attempt + 1);
    }
    throw error;
  }
}

// Função unificada
async function callModel(model, messages) {
  if (model.api === 'mistral') {
    return await callMistral(model.id, messages);
  } else {
    return await callOpenRouter(model.id, messages);
  }
}

// Função principal de teste
async function runTests() {
  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║          🔬 TESTE: Mistral AI vs OpenRouter (Alucinação)                ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚═══════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const results = {};

  for (const model of MODELS) {
    console.log(`\n${C.bold}${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.bold}${C.blue}  ${model.name} (${model.provider})${C.reset}`);
    if (model.cost) console.log(`${C.bold}${C.blue}  Custo: ${model.cost}${C.reset}`);
    console.log(`${C.bold}${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);

    results[model.id] = {
      name: model.name,
      provider: model.provider,
      api: model.api,
      cost: model.cost || 'N/A',
      tests: [],
      totalScore: 0,
      totalChecks: 0,
      hallucinationCount: 0,
      amnesiaCount: 0,
      errors: 0,
    };

    for (const scenario of TEST_SCENARIOS) {
      console.log(`  ${C.cyan}${scenario.name}${C.reset}`);
      
      try {
        const messages = [
          ...scenario.history,
          { role: 'user', content: scenario.userMessage }
        ];

        const startTime = Date.now();
        const { content, usage } = await callModel(model, messages);
        const elapsed = Date.now() - startTime;

        let passedChecks = 0;
        let hasHallucination = false;
        let hasAmnesia = false;

        for (const check of scenario.checks) {
          const passed = check.fn(content);
          if (passed) passedChecks++;
          
          if (!passed && scenario.name.includes('ALUCINAÇÃO')) hasHallucination = true;
          if (!passed && scenario.name.includes('AMNÉSIA')) hasAmnesia = true;
          
          const icon = passed ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
          console.log(`     ${icon} ${check.name}`);
        }

        if (hasHallucination) results[model.id].hallucinationCount++;
        if (hasAmnesia) results[model.id].amnesiaCount++;

        results[model.id].tests.push({
          scenario: scenario.name,
          passed: passedChecks,
          total: scenario.checks.length,
          response: content,
          elapsed,
          hasHallucination,
          hasAmnesia
        });

        results[model.id].totalScore += passedChecks;
        results[model.id].totalChecks += scenario.checks.length;

        const preview = content.length > 120 ? content.substring(0, 120) + '...' : content;
        console.log(`     ${C.yellow}💬 "${preview}"${C.reset}`);
        console.log(`     ${C.cyan}⏱️  ${elapsed}ms${C.reset}\n`);

        // Delay entre requests
        await new Promise(r => setTimeout(r, 1200));

      } catch (error) {
        console.log(`     ${C.red}❌ ERRO: ${error.message}${C.reset}\n`);
        results[model.id].errors++;
      }
    }
  }

  // RANKING
  console.log(`\n\n${C.bold}${C.magenta}╔═══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║                         📊 RANKING FINAL                                 ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚═══════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const ranking = Object.entries(results)
    .map(([id, r]) => ({
      id,
      ...r,
      percentage: r.totalChecks > 0 ? (r.totalScore / r.totalChecks * 100) : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  console.log(`${C.bold}🏆 Ranking por Precisão:${C.reset}\n`);
  
  ranking.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const pct = r.percentage.toFixed(1);
    const color = r.percentage >= 80 ? C.green : r.percentage >= 60 ? C.yellow : C.red;
    
    console.log(`${medal} ${color}${pct}%${C.reset} ${r.name} (${r.provider})`);
    console.log(`   ├─ Score: ${r.totalScore}/${r.totalChecks}`);
    console.log(`   ├─ ${C.red}Alucinações: ${r.hallucinationCount}${C.reset}`);
    console.log(`   ├─ ${C.yellow}Amnésia: ${r.amnesiaCount}${C.reset}`);
    console.log(`   ├─ Custo: ${r.cost}`);
    console.log(`   └─ Erros: ${r.errors}\n`);
  });

  // Melhor Mistral
  const bestMistral = ranking.find(r => r.api === 'mistral');
  const currentGPT = ranking.find(r => r.id === 'openai/gpt-oss-20b');

  console.log(`\n${C.bold}${C.green}📌 ANÁLISE:${C.reset}\n`);
  
  if (bestMistral && currentGPT) {
    console.log(`  Melhor Mistral: ${bestMistral.name} (${bestMistral.percentage.toFixed(1)}%)`);
    console.log(`  GPT-OSS Atual:  ${currentGPT.name} (${currentGPT.percentage.toFixed(1)}%)`);
    
    if (bestMistral.percentage > currentGPT.percentage) {
      const diff = (bestMistral.percentage - currentGPT.percentage).toFixed(1);
      console.log(`\n  ${C.green}✅ ${bestMistral.name} É MELHOR (+${diff}%)${C.reset}`);
      console.log(`     └─ Custo: ${bestMistral.cost}`);
    } else {
      const diff = (currentGPT.percentage - bestMistral.percentage).toFixed(1);
      console.log(`\n  ${C.yellow}⚠️  GPT-OSS ainda é melhor (+${diff}%)${C.reset}`);
    }
  }

  // Top 3 com menos alucinações
  console.log(`\n${C.bold}🚫 Top 3 Menos Alucinações:${C.reset}\n`);
  
  const byHallucination = [...ranking].sort((a, b) => a.hallucinationCount - b.hallucinationCount);
  byHallucination.slice(0, 3).forEach((r, i) => {
    console.log(`  ${i+1}. ${r.name}: ${r.hallucinationCount} alucinações`);
  });

  console.log('\n');

  await pool.end();
  return ranking;
}

// Main
async function main() {
  console.log('🔑 Buscando chave OpenRouter...');
  OPENROUTER_API_KEY = await getOpenRouterKey();
  
  if (!OPENROUTER_API_KEY) {
    console.error('❌ ERRO: Não foi possível obter a chave OpenRouter');
    await pool.end();
    process.exit(1);
  }
  
  console.log(`✅ Chaves configuradas`);
  
  await runTests();
}

main().catch(async (e) => {
  console.error('❌ Erro:', e.message);
  await pool.end();
  process.exit(1);
});
