/**
 * Simulador IA-vs-IA — Agente Rodrigo (AgenteZap) vs Clientes
 * Testa se o prompt obedece a regra de abertura e o fluxo de vendas.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const { Pool } = pg;

let MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL   = 'https://api.mistral.ai/v1/chat/completions';
const MODEL         = 'mistral-medium-latest';
const INTER_TURN_DELAY_MS    = 7000;
const INTER_PERSONA_DELAY_MS = 18000;

const PROMPT_FILE = path.join(__dirname, 'prompt-rodrigo-calibrado-v3.txt');
const OUTPUT_FILE = path.join(__dirname, `resultado-rodrigo-sim-${Date.now()}.json`);

const REQUIRED_GREETING = 'Boa tarde, Tudo bem? Rodrigo da AgenteZap aqui. Me conta: o que você faz hoje? Vendas, atendimento ou qualificação?';

// --- Personas de clientes ---
const PERSONAS = [
  {
    id: 'p1',
    name: 'Lead Frio Objetivo',
    firstMessage: 'Olá! Tenho interesse no AgenteZap por R$49 ilimitado e gostaria de saber mais.',
    description: 'Lead frio vindo de anúncio. Quer saber preço rapidinho, sem conversa.',
    objective: 'Pular qualificação e pedir preço/link direto.',
    followUps: [
      'Quanto custa mesmo?',
      'Tem desconto?',
      'Me manda o link pra assinar.',
      'Quero confirmar: cria conta e já funciona?'
    ]
  },
  {
    id: 'p2',
    name: 'Lead Interessado em Vendas',
    firstMessage: 'Vi o anúncio do AgenteZap. Me fala mais sobre como funciona pra vendas.',
    description: 'Trabalha com vendas, quer entender o produto.',
    objective: 'Entender o produto, possivelmente converter.',
    followUps: [
      'Trabalho com vendas de imóveis.',
      'Mas isso funciona igual a um humano respondendo?',
      'Tem teste grátis?',
      'Qual o preço do plano ilimitado?'
    ]
  },
  {
    id: 'p3',
    name: 'Lead Hardcoder - Pede Link Logo',
    firstMessage: 'Oi quero saber mais sobre o AgenteZap',
    description: 'Impaciente, pede o link logo no início sem dar contexto.',
    objective: 'Receber link antes de dar qualquer informação do negócio.',
    followUps: [
      'Me manda o link direto.',
      'Não precisa de explicação, só quero o link.',
      'Atendimento mesmo.',
      'Ok me fala o preço'
    ]
  },
  {
    id: 'p4',
    name: 'Lead Desconfiado',
    firstMessage: 'Recebi uma mensagem sobre o AgenteZap por R$99. É confiável?',
    description: 'Desconfiado, faz perguntas técnicas e de suporte.',
    objective: 'Testar se o agente responde tecnicamente ou retorna ao fluxo de vendas.',
    followUps: [
      'E se eu tiver problema, tem suporte real?',
      'Quanto tempo leva pra configurar?',
      'Funciona no Instagram também?',
      'E se eu quiser cancelar?'
    ]
  },
  {
    id: 'p5',
    name: 'Lead Direto ao R$49',
    firstMessage: 'Bom dia! Quero contratar o plano de R$49 ilimitado que vi no anúncio.',
    description: 'Veio direto pedindo o plano mais barato que viu no anúncio.',
    objective: 'Ver se o agente corrige o preço e qualifica antes de vender.',
    followUps: [
      'Então qual é o preço certo?',
      'Uso pra atendimento ao cliente.',
      'Pode me mandar o link pra contratar?',
      'Precisa de cartão de crédito?'
    ]
  }
];

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function callMistral(systemPrompt, messages, temperature = 0.5, maxTokens = 400) {
  const maxRetries = 3;
  let lastError = null;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const res = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${MISTRAL_API_KEY}` },
        body: JSON.stringify({
          model: MODEL,
          messages: [{ role: 'system', content: systemPrompt }, ...messages],
          temperature,
          max_tokens: maxTokens
        })
      });
      const raw = await res.text();
      if (!res.ok) {
        const retryable = res.status === 429 || res.status >= 500;
        if (!retryable) throw new Error(`Mistral ${res.status}: ${raw.slice(0, 300)}`);
        throw new Error(`Retryable ${res.status}: ${raw.slice(0, 200)}`);
      }
      const data = JSON.parse(raw);
      const content = data?.choices?.[0]?.message?.content;
      if (!content) throw new Error('Resposta vazia');
      return String(content).trim();
    } catch (e) {
      lastError = e;
      if (attempt === maxRetries) break;
      const jitter = Math.floor(Math.random() * 2000);
      await sleep(Math.min(60000, 12000 * (2 ** (attempt - 1))) + jitter);
    }
  }
  throw lastError || new Error('Falha Mistral');
}

async function resolveMistralKey() {
  if (MISTRAL_API_KEY) return MISTRAL_API_KEY;
  const pool = new Pool({
    connectionString: 'postgresql://postgres.bnfpcuzjvycudccycqqt:Ibira2019%217678@aws-1-sa-east-1.pooler.supabase.com:5432/postgres',
    ssl: { rejectUnauthorized: false }
  });
  const client = await pool.connect();
  try {
    const res = await client.query("SELECT valor FROM system_config WHERE chave = 'mistral_api_key'");
    MISTRAL_API_KEY = res.rows?.[0]?.valor || null;
    return MISTRAL_API_KEY;
  } finally {
    client.release();
    await pool.end();
  }
}

async function generateClientMessage(persona, history, turnIndex) {
  if (turnIndex === 0) return persona.firstMessage;

  const followUp = persona.followUps[Math.min(turnIndex - 1, persona.followUps.length - 1)];

  // Try to vary via AI first, fallback to script
  const sysPrompt = `Você é um cliente real do WhatsApp. Persona: ${persona.name}. Descrição: ${persona.description}. Objetivo: ${persona.objective}.
REGRAS: Responda de forma natural e curta (1-2 frases). NÃO revele que é IA. Baseie sua próxima resposta no contexto da conversa.
Próximo passo sugerido: "${followUp}"`;
  try {
    return await callMistral(sysPrompt, history, 0.9, 100);
  } catch {
    return followUp;
  }
}

async function generateAgentMessage(promptText, history) {
  const sysPrompt = `${promptText}

---
INSTRUÇÕES DE SIMULAÇÃO (somente para este teste):
- Siga o prompt acima rigorosamente.
- Nunca invente funcionalidades ou preços.
- Responda em português.
`;
  return callMistral(sysPrompt, history, 0.25, 350);
}

// --- Avaliação ---
function normalizeText(t) {
  return t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

function evaluateFirstResponse(agentMsg) {
  const violations = [];
  const norm = normalizeText(agentMsg);
  const normRequired = normalizeText(REQUIRED_GREETING);

  // Exact match (ignoring leading/trailing whitespace)
  const hasExact = agentMsg.trim().includes(REQUIRED_GREETING.trim());
  // Near match (normalized)
  const hasNear = norm.includes(normalizeText('Rodrigo da AgenteZap aqui')) &&
                  norm.includes(normalizeText('o que você faz hoje')) &&
                  (norm.includes('vendas') || norm.includes('atendimento') || norm.includes('qualificacao'));

  if (!hasExact) {
    violations.push('saudacao_nao_exata');
  }
  if (!hasNear) {
    violations.push('saudacao_completamente_errada');
  }
  return { hasExact, hasNear, violations };
}

function evaluateTurn(agentMsg, turnIndex) {
  const violations = [];
  const norm = normalizeText(agentMsg);

  // Checando se chamou de "Visitante"
  if (/visitante/i.test(agentMsg)) {
    violations.push('chamou_de_visitante');
  }
  // Link com texto inline (deveria ser URL crua em linha separada)
  if (/\[.*\]\(https?:\/\//i.test(agentMsg)) {
    violations.push('link_markdown_nao_URL_crua');
  }
  // Inventou preço diferente dos oficiais
  const priceMatches = agentMsg.match(/r\$\s?(\d+[.,]?\d*)/gi) || [];
  for (const p of priceMatches) {
    const val = parseFloat(p.replace(/r\$\s?/i, '').replace(',', '.'));
    if (![99, 49.99, 199, 49, 599].includes(val)) {
      violations.push(`preco_inventado:${p}`);
    }
  }

  return violations;
}

async function runPersonaSimulation(persona, promptText) {
  console.log(`\n══════════════════════════════════════════`);
  console.log(`▶ Persona: ${persona.name}`);
  console.log(`══════════════════════════════════════════`);

  const history = [];
  const turns = [];
  const MAX_TURNS = 5;
  let allViolations = [];
  let firstResponseOk = null;

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    // Client message
    const clientMsg = await generateClientMessage(persona, history, turn);
    history.push({ role: 'user', content: clientMsg });
    console.log(`\n👤 Cliente (turn ${turn + 1}): ${clientMsg}`);

    await sleep(INTER_TURN_DELAY_MS);

    // Agent message
    let agentMsg;
    try {
      agentMsg = await generateAgentMessage(promptText, history);
    } catch (e) {
      agentMsg = `[ERRO: ${e.message}]`;
    }
    history.push({ role: 'assistant', content: agentMsg });
    console.log(`🤖 Agente (turn ${turn + 1}): ${agentMsg}`);

    // Evaluate
    let evaluation;
    if (turn === 0) {
      const firstEval = evaluateFirstResponse(agentMsg);
      firstResponseOk = firstEval.hasExact;
      evaluation = { firstResponse: firstEval, violations: firstEval.violations };
      if (!firstEval.hasExact) {
        console.log(`⚠️  FALHA: saudação inicial não foi exata!`);
        if (!firstEval.hasNear) console.log(`❌ CRÍTICO: nem chegou perto da saudação esperada`);
      } else {
        console.log(`✅ Saudação inicial CORRETA`);
      }
    } else {
      const turnViolations = evaluateTurn(agentMsg, turn);
      evaluation = { violations: turnViolations };
      if (turnViolations.length > 0) {
        console.log(`⚠️  Violações turno ${turn + 1}:`, turnViolations);
      }
    }

    allViolations.push(...evaluation.violations);

    turns.push({
      turn: turn + 1,
      clientMessage: clientMsg,
      agentMessage: agentMsg,
      evaluation
    });

    await sleep(INTER_TURN_DELAY_MS);
  }

  // Score
  const totalViolations = allViolations.filter(v => !v.startsWith('preco_inventado')).length;
  const priceViolations = allViolations.filter(v => v.startsWith('preco_inventado')).length;
  const score = Math.max(0, 100 - (totalViolations * 25) - (priceViolations * 10));

  console.log(`\n📊 Score ${persona.name}: ${score}/100 | Violações: ${totalViolations} | Saudação ok: ${firstResponseOk}`);

  return {
    persona: persona.name,
    firstResponseOk,
    score,
    violations: [...new Set(allViolations)],
    turns
  };
}

// =============================================================================
// MAIN
// =============================================================================
async function main() {
  const key = await resolveMistralKey();
  if (!key) {
    console.error('❌ MISTRAL_API_KEY não encontrada');
    process.exit(1);
  }
  console.log('✅ API Key ok');

  if (!fs.existsSync(PROMPT_FILE)) {
    console.error('❌ Arquivo de prompt não encontrado:', PROMPT_FILE);
    process.exit(1);
  }
  const promptText = fs.readFileSync(PROMPT_FILE, 'utf8');
  console.log(`📄 Prompt carregado: ${promptText.length} chars`);
  console.log(`🎯 Iniciando simulação com ${PERSONAS.length} personas\n`);

  const results = [];
  for (let i = 0; i < PERSONAS.length; i++) {
    if (i > 0) {
      console.log(`\n⏳ Aguardando ${INTER_PERSONA_DELAY_MS / 1000}s entre personas...`);
      await sleep(INTER_PERSONA_DELAY_MS);
    }
    try {
      const result = await runPersonaSimulation(PERSONAS[i], promptText);
      results.push(result);
    } catch (e) {
      console.error(`❌ Erro persona ${PERSONAS[i].name}:`, e.message);
      results.push({ persona: PERSONAS[i].name, error: e.message, score: 0 });
    }
  }

  // Sumário
  const totalScore = results.reduce((s, r) => s + (r.score || 0), 0) / results.length;
  const greetingOk = results.filter(r => r.firstResponseOk === true).length;
  const greetingFail = results.filter(r => r.firstResponseOk === false).length;
  const allViol = results.flatMap(r => r.violations || []);

  console.log('\n╔══════════════════════════════════╗');
  console.log('║   RESULTADO FINAL DA SIMULAÇÃO   ║');
  console.log('╚══════════════════════════════════╝');
  console.log(`Score médio  : ${totalScore.toFixed(1)}/100`);
  console.log(`Saudação ok  : ${greetingOk}/${results.length}`);
  console.log(`Saudação FAIL: ${greetingFail}/${results.length}`);
  console.log(`Violações    : ${[...new Set(allViol)].join(', ') || 'nenhuma'}`);
  results.forEach(r => {
    console.log(`  ${r.score >= 75 ? '✅' : r.score >= 50 ? '⚠️' : '❌'} ${r.persona}: ${r.score ?? 'ERR'}/100 | saudação: ${r.firstResponseOk === true ? '✅' : r.firstResponseOk === false ? '❌' : '?'}`);
  });

  const output = {
    timestamp: new Date().toISOString(),
    promptFile: PROMPT_FILE,
    totalScore: totalScore.toFixed(1),
    greetingObedience: `${greetingOk}/${results.length}`,
    results
  };
  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\n💾 Resultado salvo em: ${path.basename(OUTPUT_FILE)}`);
}

main().catch(e => {
  console.error('❌ Fatal:', e.message);
  process.exit(1);
});
