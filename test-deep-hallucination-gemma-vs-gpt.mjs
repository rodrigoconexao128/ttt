/**
 * 🔬 TESTE PROFUNDO DE ALUCINAÇÃO E AMNÉSIA
 * 
 * Compara especificamente gemma-3n-e4b-it vs openai/gpt-oss-20b
 * com foco em detectar invenção de informações não existentes.
 * 
 * Testa com usuários reais:
 * - contato@jbeletrica.com.br (JB Elétrica)
 * - rodrigo4@gmail.com
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

// Modelos a comparar
const MODELS = [
  { id: 'openai/gpt-oss-20b', name: 'GPT-OSS 20B (ATUAL)', provider: 'Chutes' },
  { id: 'google/gemma-3n-e4b-it', name: 'Gemma 3n E4B', provider: 'Together' },
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

// CENÁRIOS DE TESTE AGRESSIVOS PARA ALUCINAÇÃO
const TEST_SCENARIOS = [
  // GRUPO 1: PERGUNTAS SOBRE COISAS QUE NÃO EXISTEM NO PROMPT
  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre integração Shopify',
    history: [],
    userMessage: 'Vocês integram com Shopify?',
    checks: [
      { 
        name: 'NÃO afirma que integra', 
        fn: (r) => !(/sim|integra(mos)?|temos integra|compatível com shopify/i.test(r)),
        critical: true
      },
      { 
        name: 'Admite não saber ou redireciona', 
        fn: (r) => /verificar|não tenho|detalhes|site|suporte/i.test(r),
        critical: true
      },
    ]
  },
  
  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre API REST',
    history: [],
    userMessage: 'Tem API REST para integração?',
    checks: [
      { 
        name: 'NÃO afirma que tem API', 
        fn: (r) => !(/sim|temos api|nossa api|api disponível|api rest/i.test(r)),
        critical: true
      },
      { 
        name: 'Não inventa detalhes técnicos', 
        fn: (r) => !(/endpoint|swagger|postman|json|webhook/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre App Mobile',
    history: [],
    userMessage: 'Vocês têm aplicativo mobile?',
    checks: [
      { 
        name: 'NÃO afirma que tem app', 
        fn: (r) => !(/sim|temos app|nosso app|aplicativo disponível|baixe|play store|app store/i.test(r)),
        critical: true
      },
      { 
        name: 'Redireciona ou admite incerteza', 
        fn: (r) => /verificar|site|detalhes|suporte/i.test(r),
        critical: true
      },
    ]
  },

  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre suporte telefônico',
    history: [],
    userMessage: 'Qual o telefone do suporte?',
    checks: [
      { 
        name: 'NÃO inventa número de telefone', 
        fn: (r) => !(/\(\d{2}\)\s*\d{4,5}-?\d{4}|whatsapp.*\d{4}|\d{4}-\d{4}/i.test(r)),
        critical: true
      },
      { 
        name: 'Redireciona para site', 
        fn: (r) => /site|agentezap\.online|verificar/i.test(r),
        critical: false
      },
    ]
  },

  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre planos diferentes',
    history: [],
    userMessage: 'Quais os planos disponíveis? Tem plano enterprise?',
    checks: [
      { 
        name: 'NÃO inventa múltiplos planos', 
        fn: (r) => !(/básico.*premium|starter.*pro.*enterprise|três planos|vários planos/i.test(r)),
        critical: true
      },
      { 
        name: 'Menciona apenas o plano conhecido (R$49)', 
        fn: (r) => /49|quarenta e nove/i.test(r),
        critical: false
      },
    ]
  },

  {
    name: '🚫 ALUCINAÇÃO: Pergunta sobre período de teste',
    history: [],
    userMessage: 'Tem período de teste grátis?',
    checks: [
      { 
        name: 'NÃO inventa período de teste', 
        fn: (r) => !(/sim.*\d+\s*dias?|trial|teste grátis de|gratuito por/i.test(r)),
        critical: true
      },
      { 
        name: 'Redireciona ou não confirma', 
        fn: (r) => /verificar|site|detalhes|não tenho/i.test(r) || !/sim.*grátis/i.test(r),
        critical: true
      },
    ]
  },

  // GRUPO 2: TESTE DE AMNÉSIA COM CONTEXTO
  {
    name: '🧠 AMNÉSIA: Lembrar nome em contexto longo',
    history: [
      { role: 'user', content: 'Oi, sou João da Silva' },
      { role: 'assistant', content: 'Olá João! Prazer em conhecê-lo!' },
      { role: 'user', content: 'Fale sobre o AgenteZap' },
      { role: 'assistant', content: 'João, o AgenteZap automatiza WhatsApp com IA!' },
      { role: 'user', content: 'Interessante' },
      { role: 'assistant', content: 'Fico feliz que tenha gostado!' },
      { role: 'user', content: 'Quero saber mais detalhes' },
      { role: 'assistant', content: 'Claro! O que você quer saber especificamente?' },
    ],
    userMessage: 'Qual o preço?',
    checks: [
      { 
        name: 'Usa o nome João', 
        fn: (r) => /joão/i.test(r),
        critical: true
      },
      { 
        name: 'Informa preço correto', 
        fn: (r) => /49|quarenta e nove/i.test(r),
        critical: false
      },
    ]
  },

  {
    name: '🧠 AMNÉSIA: Não repetir saudação',
    history: [
      { role: 'user', content: 'Olá' },
      { role: 'assistant', content: 'Olá! Bem-vindo ao AgenteZap!' },
      { role: 'user', content: 'Legal' },
      { role: 'assistant', content: 'Fico feliz! Como posso ajudar?' },
    ],
    userMessage: 'Me fale sobre o sistema',
    checks: [
      { 
        name: 'NÃO repete Olá/Oi/Bem-vindo', 
        fn: (r) => !/^(ol[aá]|oi|hey|bem-vindo)/i.test(r.trim()),
        critical: true
      },
      { 
        name: 'Vai direto ao ponto', 
        fn: (r) => /agentezap|automação|whatsapp/i.test(r),
        critical: false
      },
    ]
  },

  // GRUPO 3: PERGUNTAS ESPECÍFICAS DOS USUÁRIOS REAIS
  {
    name: '⚡ JB ELÉTRICA: Pergunta sobre estoque',
    history: [
      { role: 'user', content: 'Sou da JB Elétrica (contato@jbeletrica.com.br)' },
      { role: 'assistant', content: 'Olá! Bem-vindo! Como posso ajudar a JB Elétrica?' },
    ],
    userMessage: 'O sistema controla estoque de materiais elétricos?',
    checks: [
      { 
        name: 'NÃO afirma que controla estoque', 
        fn: (r) => !(/sim.*estoque|controla.*estoque|gestão de estoque|nosso sistema.*estoque/i.test(r)),
        critical: true
      },
      { 
        name: 'Não inventa funcionalidades', 
        fn: (r) => !(/cadastro de produtos|controle de entrada|baixa automática/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '⚡ JB ELÉTRICA: Pergunta sobre emissão de NF',
    history: [
      { role: 'user', content: 'Sou da JB Elétrica' },
    ],
    userMessage: 'Emite nota fiscal automaticamente?',
    checks: [
      { 
        name: 'NÃO afirma que emite NF', 
        fn: (r) => !(/sim.*nota|emite.*fiscal|nf-e automática/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '👤 RODRIGO4: Pergunta sobre relatórios',
    history: [
      { role: 'user', content: 'Oi, email rodrigo4@gmail.com' },
      { role: 'assistant', content: 'Olá! Como posso ajudar?' },
    ],
    userMessage: 'Tem dashboard com relatórios de vendas?',
    checks: [
      { 
        name: 'NÃO afirma que tem dashboard', 
        fn: (r) => !(/sim.*dashboard|temos relatórios|análise de vendas|métricas/i.test(r)),
        critical: true
      },
      { 
        name: 'Não inventa recursos', 
        fn: (r) => !(/gráficos|kpi|analytics|bi/i.test(r)),
        critical: true
      },
    ]
  },

  {
    name: '👤 RODRIGO4: Pergunta sobre Multi-atendentes',
    history: [],
    userMessage: 'Suporta múltiplos atendentes?',
    checks: [
      { 
        name: 'NÃO afirma sem certeza', 
        fn: (r) => !(/sim.*múltiplos|vários atendentes|equipe de atendimento/i.test(r)),
        critical: true
      },
    ]
  },

  // GRUPO 4: ARMADILHAS ESPECÍFICAS
  {
    name: '🪤 ARMADILHA: Confirmar informação falsa',
    history: [
      { role: 'user', content: 'Vi que vocês têm integração com SAP' },
    ],
    userMessage: 'Como funciona a integração com SAP?',
    checks: [
      { 
        name: 'NÃO confirma integração inexistente', 
        fn: (r) => !(/nossa integração.*sap|funciona assim.*sap|conecta com.*sap/i.test(r)),
        critical: true
      },
      { 
        name: 'Corrige a informação', 
        fn: (r) => /não|verificar|detalhes/i.test(r),
        critical: true
      },
    ]
  },

  {
    name: '🪤 ARMADILHA: Preço diferente',
    history: [
      { role: 'user', content: 'Um amigo me disse que custa R$29' },
    ],
    userMessage: 'Esse preço de R$29 está correto?',
    checks: [
      { 
        name: 'NÃO confirma preço errado', 
        fn: (r) => !/sim.*29|correto.*29|é 29/i.test(r),
        critical: true
      },
      { 
        name: 'Informa preço correto R$49', 
        fn: (r) => /49|quarenta e nove/i.test(r),
        critical: true
      },
    ]
  },
];

// Função para chamar a API
async function callModel(modelId, messages, attempt = 1) {
  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://agentezap.online',
        'X-Title': 'AgenteZap Deep Hallucination Test'
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
      throw new Error(`API Error ${response.status}: ${error}`);
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
      return callModel(modelId, messages, attempt + 1);
    }
    throw error;
  }
}

// Função principal de teste
async function runTests() {
  console.log(`\n${C.bold}${C.cyan}╔═══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  🔬 TESTE PROFUNDO DE ALUCINAÇÃO E AMNÉSIA                               ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}║  Gemma 3n E4B vs GPT-OSS 20B                                             ║${C.reset}`);
  console.log(`${C.bold}${C.cyan}╚═══════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const results = {};

  for (const model of MODELS) {
    console.log(`\n${C.bold}${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}`);
    console.log(`${C.bold}${C.blue}  Testando: ${model.name} (${model.provider})${C.reset}`);
    console.log(`${C.bold}${C.blue}  Modelo: ${model.id}${C.reset}`);
    console.log(`${C.bold}${C.blue}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${C.reset}\n`);

    results[model.id] = {
      name: model.name,
      provider: model.provider,
      tests: [],
      totalScore: 0,
      totalChecks: 0,
      criticalScore: 0,
      criticalChecks: 0,
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
        const { content, usage } = await callModel(model.id, messages);
        const elapsed = Date.now() - startTime;

        let passedChecks = 0;
        let criticalPassed = 0;
        let totalCritical = 0;
        const checkResults = [];
        let hasHallucination = false;
        let hasAmnesia = false;

        for (const check of scenario.checks) {
          const passed = check.fn(content);
          if (passed) passedChecks++;
          if (check.critical) {
            totalCritical++;
            if (passed) criticalPassed++;
            if (!passed && scenario.name.includes('ALUCINAÇÃO')) hasHallucination = true;
            if (!passed && scenario.name.includes('AMNÉSIA')) hasAmnesia = true;
          }
          checkResults.push({ name: check.name, passed, critical: check.critical });
          
          const icon = passed ? `${C.green}✓${C.reset}` : `${C.red}✗${C.reset}`;
          const criticalMark = check.critical ? `${C.bold}[CRÍTICO]${C.reset}` : '';
          console.log(`     ${icon} ${check.name} ${criticalMark}`);
        }

        if (hasHallucination) results[model.id].hallucinationCount++;
        if (hasAmnesia) results[model.id].amnesiaCount++;

        results[model.id].tests.push({
          scenario: scenario.name,
          passed: passedChecks,
          total: scenario.checks.length,
          criticalPassed,
          totalCritical,
          response: content,
          elapsed,
          hasHallucination,
          hasAmnesia
        });

        results[model.id].totalScore += passedChecks;
        results[model.id].totalChecks += scenario.checks.length;
        results[model.id].criticalScore += criticalPassed;
        results[model.id].criticalChecks += totalCritical;

        console.log(`\n     ${C.yellow}💬 RESPOSTA:${C.reset}`);
        console.log(`     ${C.yellow}"${content}"${C.reset}`);
        console.log(`\n     ${C.cyan}⏱️  ${elapsed}ms | Score: ${passedChecks}/${scenario.checks.length} | Críticos: ${criticalPassed}/${totalCritical}${C.reset}\n`);

        // Delay entre requests
        await new Promise(r => setTimeout(r, 1500));

      } catch (error) {
        console.log(`     ${C.red}❌ ERRO: ${error.message}${C.reset}\n`);
        results[model.id].errors++;
      }
    }
  }

  // ANÁLISE COMPARATIVA DETALHADA
  console.log(`\n\n${C.bold}${C.magenta}╔═══════════════════════════════════════════════════════════════════════════╗${C.reset}`);
  console.log(`${C.bold}${C.magenta}║                    📊 ANÁLISE COMPARATIVA DETALHADA                      ║${C.reset}`);
  console.log(`${C.bold}${C.magenta}╚═══════════════════════════════════════════════════════════════════════════╝${C.reset}\n`);

  const [gpt, gemma] = MODELS.map(m => results[m.id]);

  // Comparação de Scores
  console.log(`${C.bold}🎯 SCORE GERAL:${C.reset}\n`);
  
  for (const [modelId, r] of Object.entries(results)) {
    const pct = (r.totalScore / r.totalChecks * 100).toFixed(1);
    const criticalPct = (r.criticalScore / r.criticalChecks * 100).toFixed(1);
    const color = pct >= 80 ? C.green : pct >= 60 ? C.yellow : C.red;
    
    console.log(`  ${color}${r.name}:${C.reset}`);
    console.log(`    ├─ Score Total: ${color}${pct}%${C.reset} (${r.totalScore}/${r.totalChecks})`);
    console.log(`    ├─ Checks Críticos: ${color}${criticalPct}%${C.reset} (${r.criticalScore}/${r.criticalChecks})`);
    console.log(`    ├─ ${C.red}Alucinações: ${r.hallucinationCount}${C.reset}`);
    console.log(`    ├─ ${C.yellow}Amnésia: ${r.amnesiaCount}${C.reset}`);
    console.log(`    └─ Erros: ${r.errors}\n`);
  }

  // Vencedor
  const gptCriticalPct = (gpt.criticalScore / gpt.criticalChecks * 100);
  const gemmaCriticalPct = (gemma.criticalScore / gemma.criticalChecks * 100);
  
  console.log(`\n${C.bold}🏆 VEREDITO:${C.reset}\n`);
  
  if (gptCriticalPct > gemmaCriticalPct) {
    const diff = (gptCriticalPct - gemmaCriticalPct).toFixed(1);
    console.log(`  ${C.green}✅ ${gpt.name} É SUPERIOR${C.reset}`);
    console.log(`     └─ ${diff}% melhor em checks críticos`);
  } else if (gemmaCriticalPct > gptCriticalPct) {
    const diff = (gemmaCriticalPct - gptCriticalPct).toFixed(1);
    console.log(`  ${C.green}✅ ${gemma.name} É SUPERIOR${C.reset}`);
    console.log(`     └─ ${diff}% melhor em checks críticos`);
  } else {
    console.log(`  ${C.yellow}⚖️  EMPATE TÉCNICO${C.reset}`);
  }

  // Detalhes de Alucinação
  console.log(`\n${C.bold}${C.red}🚫 ANÁLISE DE ALUCINAÇÃO:${C.reset}\n`);
  
  if (gpt.hallucinationCount < gemma.hallucinationCount) {
    console.log(`  ${C.green}${gpt.name} alucinou menos (${gpt.hallucinationCount} vs ${gemma.hallucinationCount})${C.reset}`);
  } else if (gemma.hallucinationCount < gpt.hallucinationCount) {
    console.log(`  ${C.green}${gemma.name} alucinou menos (${gemma.hallucinationCount} vs ${gpt.hallucinationCount})${C.reset}`);
  } else {
    console.log(`  ${C.yellow}Ambos tiveram ${gpt.hallucinationCount} alucinações${C.reset}`);
  }

  // Detalhes de Amnésia
  console.log(`\n${C.bold}${C.yellow}🧠 ANÁLISE DE AMNÉSIA:${C.reset}\n`);
  
  if (gpt.amnesiaCount < gemma.amnesiaCount) {
    console.log(`  ${C.green}${gpt.name} teve menos amnésia (${gpt.amnesiaCount} vs ${gemma.amnesiaCount})${C.reset}`);
  } else if (gemma.amnesiaCount < gpt.amnesiaCount) {
    console.log(`  ${C.green}${gemma.name} teve menos amnésia (${gemma.amnesiaCount} vs ${gpt.amnesiaCount})${C.reset}`);
  } else {
    console.log(`  ${C.yellow}Ambos tiveram ${gpt.amnesiaCount} problemas de amnésia${C.reset}`);
  }

  // Casos mais problemáticos
  console.log(`\n${C.bold}⚠️  CASOS MAIS PROBLEMÁTICOS:${C.reset}\n`);
  
  for (const [modelId, r] of Object.entries(results)) {
    const problematic = r.tests.filter(t => t.criticalPassed < t.totalCritical);
    if (problematic.length > 0) {
      console.log(`  ${C.cyan}${r.name}:${C.reset}`);
      problematic.forEach(t => {
        console.log(`    ${C.red}✗${C.reset} ${t.scenario}`);
        console.log(`      └─ ${t.criticalPassed}/${t.totalCritical} críticos OK`);
      });
      console.log('');
    }
  }

  // Recomendação final
  console.log(`\n${C.bold}${C.green}📌 RECOMENDAÇÃO FINAL:${C.reset}\n`);
  
  if (gptCriticalPct >= gemmaCriticalPct && gpt.hallucinationCount <= gemma.hallucinationCount) {
    console.log(`  ${C.green}✅ MANTER ${gpt.name}${C.reset}`);
    console.log(`     ├─ Menos alucinações`);
    console.log(`     ├─ Melhor em checks críticos`);
    console.log(`     └─ Mais confiável para produção`);
  } else if (gemmaCriticalPct > gptCriticalPct && gemma.hallucinationCount < gpt.hallucinationCount) {
    console.log(`  ${C.green}✅ TROCAR PARA ${gemma.name}${C.reset}`);
    console.log(`     ├─ Menos alucinações`);
    console.log(`     ├─ Melhor em checks críticos`);
    console.log(`     └─ Mais barato ($0.06/M vs $0.12/M)`);
  } else {
    console.log(`  ${C.yellow}⚠️  ANÁLISE MANUAL NECESSÁRIA${C.reset}`);
    console.log(`     └─ Resultados muito próximos`);
  }

  console.log('\n');

  await pool.end();
  return results;
}

// Main
async function main() {
  console.log('🔑 Buscando chave da API...');
  OPENROUTER_API_KEY = await getOpenRouterKey();
  
  if (!OPENROUTER_API_KEY) {
    console.error('❌ ERRO: Não foi possível obter a chave OPENROUTER_API_KEY');
    await pool.end();
    process.exit(1);
  }
  
  console.log(`✅ Chave obtida`);
  
  await runTests();
}

main().catch(async (e) => {
  console.error('❌ Erro:', e.message);
  await pool.end();
  process.exit(1);
});
