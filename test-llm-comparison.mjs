/**
 * 🧪 TESTE COMPARATIVO: Groq vs Mistral
 * 
 * Compara qualidade de respostas entre provedores LLM
 * usando o prompt real do rodrigo4@gmail.com
 */

import Anthropic from '@anthropic-ai/sdk'; // Para avaliação
import fetch from 'node-fetch';
import { createClient } from '@supabase/supabase-js';

// Cores para console
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bold: '\x1b[1m',
};

// Configuração Supabase
const SUPABASE_URL = 'https://bnfpcuzjvycudccycqqt.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJuZnBjdXpqdnljdWRjY3ljcXF0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczNTQwMDY1NCwiZXhwIjoyMDUwOTc2NjU0fQ.kNnZz8CfPLfolHEM7fEwlGxJH1m3C71CxC3UXrOERPI';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

// Cenários de teste
const TEST_SCENARIOS = [
  { 
    id: 'greeting',
    name: 'Saudação inicial',
    message: 'Olá, tudo bem?',
    expectation: 'Resposta amigável, persuasiva, com menção ao teste grátis'
  },
  {
    id: 'price_49',
    name: 'Preço R$49',
    message: 'Vi o anúncio de 49 reais, como funciona?',
    expectation: 'Deve enviar o link direto sem mencionar cupom/código'
  },
  {
    id: 'how_it_works',
    name: 'Como funciona',
    message: 'Como funciona essa IA de vocês?',
    expectation: 'Explicação persuasiva, com foco em benefícios e CTA'
  },
  {
    id: 'implementation',
    name: 'Implementação',
    message: 'E essa implementação de 199?',
    expectation: 'Explicar que é pagamento ÚNICO, não mensal'
  },
  {
    id: 'instagram',
    name: 'Instagram/Facebook',
    message: 'Dá pra conectar meu Instagram e Facebook?',
    expectation: 'Focar no WhatsApp como principal, sem termos negativos'
  }
];

// Modelos Groq disponíveis
const GROQ_MODELS = [
  'openai/gpt-oss-20b',           // Modelo atual
  'llama-3.3-70b-versatile',      // Alternativa recomendada
  'llama-3.1-8b-instant',         // Rápido
  'mixtral-8x7b-32768',           // Equilíbrio
];

async function getConfig() {
  const { data, error } = await supabase
    .from('system_config')
    .select('chave, valor')
    .in('chave', ['groq_api_key', 'mistral_api_key', 'groq_model']);
  
  if (error) throw error;
  
  const config = {};
  for (const row of data) {
    config[row.chave] = row.valor;
  }
  return config;
}

async function getPrompt() {
  const { data, error } = await supabase
    .from('ai_agent_config')
    .select('prompt')
    .eq('user_id', 'cb9213c3-fde3-479e-a4aa-344171c59735')
    .single();
  
  if (error) throw error;
  return data.prompt;
}

async function callGroq(apiKey, model, messages) {
  const startTime = Date.now();
  
  const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  const elapsed = Date.now() - startTime;
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    elapsed,
    tokens: data.usage
  };
}

async function callMistral(apiKey, messages) {
  const startTime = Date.now();
  
  const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'mistral-small-latest',
      messages,
      max_tokens: 1500,
      temperature: 0.7,
    }),
  });
  
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Mistral API error: ${response.status} - ${text}`);
  }
  
  const data = await response.json();
  const elapsed = Date.now() - startTime;
  
  return {
    content: data.choices?.[0]?.message?.content || '',
    elapsed,
    tokens: data.usage
  };
}

function evaluateResponse(response, expectation) {
  // Critérios de avaliação
  const criteria = {
    length: response.length,
    hasLink: response.includes('agentezap.online') ? 1 : 0,
    hasEmoji: /[😀-🙏🚀✅💡🎯📱💬🤖]/u.test(response) ? 1 : 0,
    isNatural: /tá\?|né\?|entendeu\?|você|gente/i.test(response) ? 1 : 0,
    hasCallToAction: /criar.*conta|testar.*grátis|começar|acessar/i.test(response) ? 1 : 0,
  };
  
  // Score simples baseado em critérios
  let score = 0;
  if (criteria.length > 200) score += 20;
  if (criteria.length > 400) score += 10;
  if (criteria.hasLink) score += 20;
  if (criteria.hasEmoji) score += 10;
  if (criteria.isNatural) score += 20;
  if (criteria.hasCallToAction) score += 20;
  
  return { score, criteria };
}

async function runTest() {
  console.log(`\n${COLORS.bold}${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}   🧪 TESTE COMPARATIVO: Groq vs Mistral${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);
  
  // Carregar configurações
  console.log(`${COLORS.yellow}📥 Carregando configurações...${COLORS.reset}`);
  const config = await getConfig();
  const prompt = await getPrompt();
  
  console.log(`${COLORS.green}✅ Configurações carregadas${COLORS.reset}`);
  console.log(`   - Groq model atual: ${config.groq_model}`);
  console.log(`   - Prompt length: ${prompt.length} caracteres\n`);
  
  // Resultados
  const results = {
    groq: {},
    mistral: {},
  };
  
  // Testar cada cenário
  for (const scenario of TEST_SCENARIOS) {
    console.log(`\n${COLORS.bold}${COLORS.blue}┌─────────────────────────────────────────────────────────────────┐${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.blue}│ Cenário: ${scenario.name}${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.blue}│ Mensagem: "${scenario.message}"${COLORS.reset}`);
    console.log(`${COLORS.bold}${COLORS.blue}└─────────────────────────────────────────────────────────────────┘${COLORS.reset}`);
    
    const messages = [
      { role: 'system', content: prompt },
      { role: 'user', content: scenario.message }
    ];
    
    // Testar Groq (modelo atual)
    console.log(`\n${COLORS.magenta}🔵 GROQ (${config.groq_model})${COLORS.reset}`);
    try {
      const groqResult = await callGroq(config.groq_api_key, config.groq_model, messages);
      const groqEval = evaluateResponse(groqResult.content, scenario.expectation);
      
      results.groq[scenario.id] = { ...groqResult, eval: groqEval };
      
      console.log(`   ⏱️ Tempo: ${groqResult.elapsed}ms`);
      console.log(`   📏 Tamanho: ${groqResult.content.length} chars`);
      console.log(`   📊 Score: ${groqEval.score}/100`);
      console.log(`   ${COLORS.white}Resposta:${COLORS.reset}`);
      console.log(`   ${COLORS.cyan}${groqResult.content.substring(0, 300)}...${COLORS.reset}`);
    } catch (err) {
      console.log(`   ${COLORS.red}❌ Erro: ${err.message}${COLORS.reset}`);
      results.groq[scenario.id] = { error: err.message };
    }
    
    // Testar Groq com llama-3.3-70b-versatile
    console.log(`\n${COLORS.magenta}🔵 GROQ (llama-3.3-70b-versatile)${COLORS.reset}`);
    try {
      const groq70bResult = await callGroq(config.groq_api_key, 'llama-3.3-70b-versatile', messages);
      const groq70bEval = evaluateResponse(groq70bResult.content, scenario.expectation);
      
      results.groq[scenario.id + '_70b'] = { ...groq70bResult, eval: groq70bEval };
      
      console.log(`   ⏱️ Tempo: ${groq70bResult.elapsed}ms`);
      console.log(`   📏 Tamanho: ${groq70bResult.content.length} chars`);
      console.log(`   📊 Score: ${groq70bEval.score}/100`);
      console.log(`   ${COLORS.white}Resposta:${COLORS.reset}`);
      console.log(`   ${COLORS.cyan}${groq70bResult.content.substring(0, 300)}...${COLORS.reset}`);
    } catch (err) {
      console.log(`   ${COLORS.red}❌ Erro: ${err.message}${COLORS.reset}`);
    }
    
    // Testar Mistral
    console.log(`\n${COLORS.yellow}🟡 MISTRAL (mistral-small-latest)${COLORS.reset}`);
    try {
      const mistralResult = await callMistral(config.mistral_api_key, messages);
      const mistralEval = evaluateResponse(mistralResult.content, scenario.expectation);
      
      results.mistral[scenario.id] = { ...mistralResult, eval: mistralEval };
      
      console.log(`   ⏱️ Tempo: ${mistralResult.elapsed}ms`);
      console.log(`   📏 Tamanho: ${mistralResult.content.length} chars`);
      console.log(`   📊 Score: ${mistralEval.score}/100`);
      console.log(`   ${COLORS.white}Resposta:${COLORS.reset}`);
      console.log(`   ${COLORS.green}${mistralResult.content.substring(0, 300)}...${COLORS.reset}`);
    } catch (err) {
      console.log(`   ${COLORS.red}❌ Erro: ${err.message}${COLORS.reset}`);
      results.mistral[scenario.id] = { error: err.message };
    }
    
    // Aguardar entre requests para evitar rate limit
    await new Promise(r => setTimeout(r, 1000));
  }
  
  // Resumo final
  console.log(`\n${COLORS.bold}${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}   📊 RESUMO COMPARATIVO${COLORS.reset}`);
  console.log(`${COLORS.bold}${COLORS.cyan}═══════════════════════════════════════════════════════════════${COLORS.reset}\n`);
  
  let groqTotalScore = 0;
  let groq70bTotalScore = 0;
  let mistralTotalScore = 0;
  let count = 0;
  
  for (const scenario of TEST_SCENARIOS) {
    const groq = results.groq[scenario.id];
    const groq70b = results.groq[scenario.id + '_70b'];
    const mistral = results.mistral[scenario.id];
    
    if (groq?.eval && mistral?.eval) {
      groqTotalScore += groq.eval.score;
      groq70bTotalScore += groq70b?.eval?.score || 0;
      mistralTotalScore += mistral.eval.score;
      count++;
      
      console.log(`${scenario.name}:`);
      console.log(`  Groq (${config.groq_model}): ${groq.eval.score}/100 | ${groq.content.length} chars | ${groq.elapsed}ms`);
      if (groq70b?.eval) {
        console.log(`  Groq (llama-3.3-70b): ${groq70b.eval.score}/100 | ${groq70b.content.length} chars | ${groq70b.elapsed}ms`);
      }
      console.log(`  Mistral: ${mistral.eval.score}/100 | ${mistral.content.length} chars | ${mistral.elapsed}ms`);
    }
  }
  
  console.log(`\n${COLORS.bold}MÉDIA GERAL:${COLORS.reset}`);
  console.log(`  🔵 Groq (${config.groq_model}): ${(groqTotalScore / count).toFixed(1)}/100`);
  console.log(`  🔵 Groq (llama-3.3-70b): ${(groq70bTotalScore / count).toFixed(1)}/100`);
  console.log(`  🟡 Mistral: ${(mistralTotalScore / count).toFixed(1)}/100`);
  
  // Recomendação
  console.log(`\n${COLORS.bold}${COLORS.green}💡 RECOMENDAÇÃO:${COLORS.reset}`);
  if (groq70bTotalScore > groqTotalScore && groq70bTotalScore >= mistralTotalScore * 0.9) {
    console.log(`  ✅ Usar llama-3.3-70b-versatile no Groq (melhor custo-benefício)`);
  } else if (mistralTotalScore > groqTotalScore) {
    console.log(`  ⚠️ Mistral está gerando respostas melhores. Considere:`);
    console.log(`     1. Trocar modelo Groq para llama-3.3-70b-versatile`);
    console.log(`     2. Ou voltar para Mistral como provider principal`);
  } else {
    console.log(`  ✅ Groq está OK. Modelo atual está funcionando bem.`);
  }
}

// Executar
runTest().catch(console.error);
