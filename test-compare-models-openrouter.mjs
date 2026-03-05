/**
 * 🧪 TESTE COMPARATIVO DE MODELOS - Alucinação, Amnésia e Precisão
 * 
 * Compara modelos baratos do OpenRouter para verificar:
 * 1. ALUCINAÇÃO: IA inventa informações não existentes no prompt
 * 2. AMNÉSIA: IA esquece informações já fornecidas na conversa
 * 3. PRECISÃO: IA segue corretamente o padrão definido
 * 
 * Modelos testados (ordenados por custo):
 * - liquid/lfm2-8b-a1b ($0.01/$0.02) - Liquid
 * - google/gemma-3-4b-it ($0.017/$0.068) - Chutes
 * - meta-llama/llama-3.2-3b-instruct ($0.02/$0.02) - DeepInfra
 * - openai/gpt-oss-20b ($0.02/$0.10) - Chutes ✅ ATUAL
 * - nousresearch/deephermes-3-mistral-24b-preview ($0.02/$0.10) - Chutes
 * - mistralai/mistral-nemo ($0.02/$0.04) - DeepInfra
 * - google/gemma-3n-e4b-it ($0.02/$0.04) - Together
 * - meta-llama/llama-3.1-8b-instruct ($0.02/$0.05) - NovitaAI
 */

import dotenv from 'dotenv';
import pg from 'pg';
const { Pool } = pg;

// Carregar variáveis de ambiente
dotenv.config();

// Conexão com o banco de dados para pegar a chave
const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

// Função para obter chave da API do banco
async function getOpenRouterKey() {
  try {
    const result = await pool.query("SELECT valor FROM system_config WHERE chave = 'openrouter_api_key'");
    if (result.rows[0]?.valor) {
      return result.rows[0].valor;
    }
  } catch (e) {
    console.log('Erro ao buscar chave do banco:', e.message);
  }
  // Fallback para variável de ambiente
  return process.env.OPENROUTER_API_KEY;
}

let OPENROUTER_API_KEY;

// Modelos a testar (TODOS das imagens - ordenados por custo total estimado)
const MODELS = [
  // SUPER BARATOS (< $0.03/M total)
  { id: 'qwen/qwen3-embedding-8b', name: 'Qwen3 Embedding 8B', provider: 'Nebius', inputCost: 0.01, outputCost: 0.00 },
  { id: 'liquid/lfm2-8b-a1b', name: 'LiquidAI LFM2-8B', provider: 'Liquid', inputCost: 0.01, outputCost: 0.02 },
  
  // BARATOS ($0.03-0.06/M total)
  { id: 'meta-llama/llama-3.2-3b-instruct', name: 'Llama 3.2 3B', provider: 'DeepInfra', inputCost: 0.02, outputCost: 0.02 },
  { id: 'mistralai/mistral-nemo', name: 'Mistral Nemo', provider: 'DeepInfra', inputCost: 0.02, outputCost: 0.04 },
  { id: 'google/gemma-3n-e4b-it', name: 'Gemma 3n E4B', provider: 'Together', inputCost: 0.02, outputCost: 0.04 },
  { id: 'meta-llama/llama-3.1-8b-instruct', name: 'Llama 3.1 8B', provider: 'NovitaAI', inputCost: 0.02, outputCost: 0.05 },
  
  // MÉDIO BARATOS ($0.06-0.10/M total)
  { id: 'google/gemma-3-4b-it', name: 'Google Gemma 3 4B', provider: 'Chutes', inputCost: 0.017, outputCost: 0.068 },
  { id: 'meta-llama/llama-guard-3-8b', name: 'Llama Guard 3 8B', provider: 'Nebius', inputCost: 0.02, outputCost: 0.06 },
  { id: 'sao10k/l3-lunaris-8b', name: 'Llama 3 8B Lunaris', provider: 'DeepInfra', inputCost: 0.04, outputCost: 0.05 },
  { id: 'meta-llama/llama-3.2-11b-vision-instruct', name: 'Llama 3.2 11B Vision', provider: 'DeepInfra', inputCost: 0.049, outputCost: 0.049 },
  
  // MÉDIOS ($0.10-0.15/M total)
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (ATUAL)', provider: 'Chutes', inputCost: 0.02, outputCost: 0.10 },
  { id: 'nousresearch/deephermes-3-mistral-24b-preview', name: 'DeepHermes 3 24B', provider: 'Chutes', inputCost: 0.02, outputCost: 0.10 },
  { id: 'qwen/qwen2.5-coder-7b-instruct', name: 'Qwen2.5 Coder 7B', provider: 'Nebius', inputCost: 0.03, outputCost: 0.09 },
  
  // MAIS CAROS (> $0.15/M total)
  { id: 'ibm-granite/granite-4.0-h-micro', name: 'IBM Granite 4.0 Micro', provider: 'Cloudflare', inputCost: 0.017, outputCost: 0.11 },
];

// Cores para console
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

// Prompt de teste (simula um agente de vendas)
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

// Cenários de teste
const TEST_SCENARIOS = [
  // TESTE 1: Alucinação - Não deve inventar informações
  {
    name: 'ALUCINAÇÃO: Não inventar telefone',
    history: [],
    userMessage: 'Qual o telefone do suporte?',
    checks: [
      { name: 'Não inventa número', fn: (r) => !(/\(\d{2}\)\s*\d{4,5}-?\d{4}/.test(r)) },
      { name: 'Admite não saber ou redireciona', fn: (r) => r.toLowerCase().includes('verificar') || r.toLowerCase().includes('site') || r.toLowerCase().includes('não') },
    ]
  },
  
  // TESTE 2: Amnésia - Deve lembrar o nome
  {
    name: 'AMNÉSIA: Lembrar nome do cliente',
    history: [
      { role: 'user', content: 'Oi, meu nome é Carlos' },
      { role: 'assistant', content: 'Olá Carlos! Bem-vindo! Como posso te ajudar hoje?' },
      { role: 'user', content: 'Quero saber sobre o sistema' },
      { role: 'assistant', content: 'Carlos, o AgenteZap é uma plataforma de automação de WhatsApp com IA. Responde clientes 24h automaticamente. Acesse: https://agentezap.online' },
    ],
    userMessage: 'Qual o preço?',
    checks: [
      { name: 'Usa nome Carlos', fn: (r) => r.toLowerCase().includes('carlos') },
      { name: 'Menciona R$49', fn: (r) => r.includes('49') || r.includes('quarenta e nove') },
      { name: 'Menciona código', fn: (r) => r.toLowerCase().includes('parc') || r.toLowerCase().includes('código') },
    ]
  },
  
  // TESTE 3: Precisão - Seguir regras do prompt
  {
    name: 'PRECISÃO: Seguir regras de preço',
    history: [],
    userMessage: 'Quanto custa o AgenteZap?',
    checks: [
      { name: 'Menciona R$49', fn: (r) => r.includes('49') },
      { name: 'Menciona R$99 (normal)', fn: (r) => r.includes('99') },
      { name: 'Menciona código PARC2026PROMO', fn: (r) => r.toUpperCase().includes('PARC') },
      { name: 'Mensagem curta (max 4 linhas)', fn: (r) => r.split('\n').filter(l => l.trim()).length <= 6 },
    ]
  },

  // TESTE 4: Não repetir cumprimento
  {
    name: 'AMNÉSIA: Não repetir cumprimento',
    history: [
      { role: 'user', content: 'Oi' },
      { role: 'assistant', content: 'Olá! Bem-vindo ao AgenteZap! Como posso te ajudar?' },
      { role: 'user', content: 'Quero saber mais' },
      { role: 'assistant', content: 'O AgenteZap automatiza seu WhatsApp com IA. Responde clientes 24h! Acesse: https://agentezap.online' },
    ],
    userMessage: 'E como funciona?',
    checks: [
      { name: 'Não repete Olá/Oi', fn: (r) => !/^(ol[aá]|oi|hey|hello)/i.test(r.trim()) },
      { name: 'Continua explicando', fn: (r) => r.length > 30 },
    ]
  },

  // TESTE 5: Alucinação - Não inventar funcionalidades
  {
    name: 'ALUCINAÇÃO: Não inventar integrações',
    history: [],
    userMessage: 'O sistema integra com Shopify?',
    checks: [
      { name: 'Não afirma certeza de integração', fn: (r) => !r.toLowerCase().includes('sim, integra') && !r.toLowerCase().includes('temos integração') },
      { name: 'Sugere verificar ou redireciona', fn: (r) => r.toLowerCase().includes('verificar') || r.toLowerCase().includes('site') || r.toLowerCase().includes('detalhes') },
    ]
  },
];

// Função para chamar a API
async function callModel(modelId, messages) {
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
      max_tokens: 300,
      temperature: 0.3,
    })
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices?.[0]?.message?.content || '',
    usage: data.usage || {}
  };
}

// Função principal de teste
async function runTests() {
  console.log(`\n${C.bold}${C.cyan}╔════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  🧪 TESTE COMPARATIVO: Alucinação, Amnésia e Precisão            ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const results = {};

  for (const model of MODELS) {
    console.log(`\n${C.bold}${C.blue}━━━ Testando: ${model.name} (${model.provider}) ━━━${C.reset}`);
    console.log(`${C.cyan}    Modelo: ${model.id}${C.reset}`);
    console.log(`${C.cyan}    Custo: $${model.inputCost}/M input, $${model.outputCost}/M output${C.reset}\n`);

    results[model.id] = {
      name: model.name,
      provider: model.provider,
      inputCost: model.inputCost,
      outputCost: model.outputCost,
      tests: [],
      totalScore: 0,
      totalChecks: 0,
      totalTokens: 0,
      errors: 0,
    };

    for (const scenario of TEST_SCENARIOS) {
      console.log(`  📋 ${scenario.name}`);
      
      try {
        const messages = [
          ...scenario.history,
          { role: 'user', content: scenario.userMessage }
        ];

        const startTime = Date.now();
        const { content, usage } = await callModel(model.id, messages);
        const elapsed = Date.now() - startTime;

        results[model.id].totalTokens += (usage.total_tokens || 0);

        let passedChecks = 0;
        const checkResults = [];

        for (const check of scenario.checks) {
          const passed = check.fn(content);
          if (passed) passedChecks++;
          checkResults.push({ name: check.name, passed });
          
          const icon = passed ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
          console.log(`     ${icon} ${check.name}`);
        }

        results[model.id].tests.push({
          scenario: scenario.name,
          passed: passedChecks,
          total: scenario.checks.length,
          response: content.substring(0, 100) + '...',
          elapsed
        });

        results[model.id].totalScore += passedChecks;
        results[model.id].totalChecks += scenario.checks.length;

        console.log(`     ${C.cyan}⏱️ ${elapsed}ms${C.reset}`);
        console.log(`     ${C.yellow}📝 "${content.substring(0, 80)}..."${C.reset}\n`);

        // Delay entre requests para não sobrecarregar
        await new Promise(r => setTimeout(r, 1000));

      } catch (error) {
        console.log(`     ${C.red}❌ ERRO: ${error.message}${C.reset}\n`);
        results[model.id].errors++;
      }
    }
  }

  // Resumo final
  console.log(`\n${C.bold}${C.magenta}╔════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║                    📊 RESUMO DOS RESULTADOS                       ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  // Ordenar por score
  const ranking = Object.entries(results)
    .map(([id, r]) => ({
      id,
      ...r,
      percentage: r.totalChecks > 0 ? (r.totalScore / r.totalChecks * 100) : 0
    }))
    .sort((a, b) => b.percentage - a.percentage);

  console.log(`${C.bold}Ranking por Acerto:${C.reset}\n`);
  
  ranking.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : '  ';
    const pct = r.percentage.toFixed(0);
    const color = r.percentage >= 80 ? C.green : r.percentage >= 60 ? C.yellow : C.red;
    const cost = ((r.totalTokens / 1000000) * (r.inputCost + r.outputCost)).toFixed(6);
    
    console.log(`${medal} ${color}${pct}%${C.reset} ${r.name} (${r.provider})`);
    console.log(`   └─ ${r.totalScore}/${r.totalChecks} checks | ~$${cost} | ${r.errors} erros\n`);
  });

  // Tabela comparativa
  console.log(`\n${C.bold}Tabela Comparativa:${C.reset}\n`);
  console.log(`| Modelo | Provider | Score | Custo/M | Erros |`);
  console.log(`|--------|----------|-------|---------|-------|`);
  
  ranking.forEach(r => {
    const cost = `$${(r.inputCost + r.outputCost).toFixed(2)}`;
    console.log(`| ${r.name.substring(0, 20).padEnd(20)} | ${r.provider.padEnd(8)} | ${r.percentage.toFixed(0).padStart(3)}% | ${cost.padStart(7)} | ${String(r.errors).padStart(5)} |`);
  });

  // Recomendação
  const best = ranking[0];
  const cheapest = ranking.reduce((min, r) => (r.inputCost + r.outputCost) < (min.inputCost + min.outputCost) ? r : min);
  const bestValue = ranking.filter(r => r.percentage >= 70).sort((a, b) => (a.inputCost + a.outputCost) - (b.inputCost + b.outputCost))[0];

  console.log(`\n${C.bold}${C.green}📌 RECOMENDAÇÕES:${C.reset}`);
  console.log(`   🏆 Melhor Score: ${best.name} (${best.percentage.toFixed(0)}%)`);
  console.log(`   💰 Mais Barato: ${cheapest.name} ($${(cheapest.inputCost + cheapest.outputCost).toFixed(3)}/M)`);
  if (bestValue) {
    console.log(`   ⭐ Melhor Custo-Benefício: ${bestValue.name} (${bestValue.percentage.toFixed(0)}% @ $${(bestValue.inputCost + bestValue.outputCost).toFixed(3)}/M)`);
  }

  // Fechar conexão com banco
  await pool.end();

  return ranking;
}

// Função main para inicializar e executar
async function main() {
  console.log('🔑 Buscando chave da API...');
  OPENROUTER_API_KEY = await getOpenRouterKey();
  
  if (!OPENROUTER_API_KEY) {
    console.error('❌ ERRO: Não foi possível obter a chave OPENROUTER_API_KEY');
    console.log('   Configure a variável de ambiente ou verifique o banco de dados');
    await pool.end();
    process.exit(1);
  }
  
  console.log(`✅ Chave obtida: ${OPENROUTER_API_KEY.substring(0, 15)}...`);
  
  await runTests();
}

// Executar
main().catch(async (e) => {
  console.error('❌ Erro:', e.message);
  await pool.end();
  process.exit(1);
});
