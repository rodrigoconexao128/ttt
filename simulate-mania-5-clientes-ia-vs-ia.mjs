import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

const { Pool } = pg;

let MISTRAL_API_KEY = process.env.MISTRAL_API_KEY;
const MISTRAL_URL = 'https://api.mistral.ai/v1/chat/completions';
// ✅ MODELO DE PRODUÇÃO - mistral-medium-latest (mesmo que o sistema usa)
// ⛔ mistral-small-latest está BLOQUEADO no sistema (100% rate limit)
const MODEL = 'mistral-medium-latest';
// mistral-medium: ~10.5 req/min → mín 6s entre chamadas
const INTER_TURN_DELAY_MS = 6500;
const INTER_PERSONA_DELAY_MS = 15000;

const PROMPT_FILE = path.resolve('prompt-mania-calibrado-v6.txt');
const OUTPUT_FILE = path.resolve(`resultado-mania-5-clientes-ia-vs-ia-${Date.now()}.json`);

const PERSONAS = [
  {
    id: 'p1',
    name: 'Cliente Objetivo',
    description: 'Quer preço rápido e tenta pular etapas.',
    objective: 'Conseguir preço sem informar tudo de primeira.'
  },
  {
    id: 'p2',
    name: 'Cliente de Cabeceira',
    description: 'Focado em cabeceira, costuma pedir imagem cedo.',
    objective: 'Forçar envio antecipado de mídia e checar se vem mídia errada.'
  },
  {
    id: 'p3',
    name: 'Cliente Link Rápido',
    description: 'Pede link logo no início.',
    objective: 'Receber link antes da qualificação.'
  },
  {
    id: 'p4',
    name: 'Cliente Confuso',
    description: 'Muda de produto no meio da conversa.',
    objective: 'Provocar mistura de contexto e erro de mídia/preço.'
  },
  {
    id: 'p5',
    name: 'Cliente Detalhista',
    description: 'Compara modelos e exige exatidão de valores.',
    objective: 'Detectar preço truncado/formatado errado e link fora de ordem.'
  }
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function callMistralWithRetry(systemPrompt, messages, temperature = 0.7, maxTokens = 350) {
  const maxRetries = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetch(MISTRAL_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${MISTRAL_API_KEY}`
        },
        body: JSON.stringify({
          model: MODEL,
          messages: [
            { role: 'system', content: systemPrompt },
            ...messages
          ],
          temperature,
          max_tokens: maxTokens
        })
      });

      const raw = await response.text();

      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500 || /rate|limit|overload|temporar/i.test(raw);
        if (!retryable) {
          throw new Error(`Mistral API ${response.status}: ${raw.slice(0, 400)}`);
        }
        throw new Error(`Retryable Mistral API ${response.status}: ${raw.slice(0, 240)}`);
      }

      const data = JSON.parse(raw);
      const content = data?.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error('Resposta vazia do Mistral');
      }
      return String(content).trim();
    } catch (error) {
      lastError = error;
      if (attempt === maxRetries) break;
      const jitter = Math.floor(Math.random() * 2000);
      // mistral-medium: delays maiores necessários (6s por req, limite ~10 req/min)
      const backoffMs = Math.min(60000, 12000 * (2 ** (attempt - 1))) + jitter;
      await sleep(backoffMs);
    }
  }

  throw lastError || new Error('Falha desconhecida ao chamar Mistral');
}

function fallbackClientMessage(personaName, turn) {
  const scripts = {
    'Cliente Objetivo': [
      'Oi, quero saber preço agora.',
      'É de cabeceira queen.',
      'Modelo itália.',
      'Pode mandar imagem?',
      'Agora me manda o link.'
    ],
    'Cliente de Cabeceira': [
      'Boa tarde, quero cabeceira.',
      'Tamanho casal.',
      'Modelo dubai.',
      'Pode enviar a foto?',
      'Tem link?'
    ],
    'Cliente Link Rápido': [
      'Me manda o link aí.',
      'É cabeceira.',
      'Queen.',
      'Modelo malta.',
      'Agora pode mandar o link.'
    ],
    'Cliente Confuso': [
      'Quero cabeceira.',
      'Na verdade colchão também, tô confuso.',
      'Voltei pra cabeceira king.',
      'Modelo alfa slim.',
      'Pode mandar imagem e link?'
    ],
    'Cliente Detalhista': [
      'Preciso de preço exato.',
      'Cabeceira casal.',
      'Modelo itália.',
      'Pode enviar mídia?',
      'Quero o link final.'
    ]
  };

  const list = scripts[personaName] || ['Oi', 'Quero cabeceira', 'Casal', 'Modelo itália', 'Manda o link'];
  return list[Math.min(turn, list.length - 1)];
}

function fallbackAgentMessage(history) {
  const lastUser = history.filter(h => h.role === 'user').at(-1)?.content || '';
  const lower = lastUser.toLowerCase();

  if (/link/.test(lower)) {
    if (!/modelo|it[aá]lia|dubai|malta|alfa slim/.test(lower) || !/solteiro|solteir[aã]o|casal|queen|king/.test(lower)) {
      return '{nome}, te envio sim 😊 Antes preciso só confirmar produto, tamanho e modelo para mandar o link certo.';
    }
    return 'https://drive.google.com/drive/folders/exemplo-link-correto';
  }

  if (/pre[cç]o|valor|quanto/.test(lower)) {
    return '{nome}, para não te passar valor incorreto, vou confirmar agora e já volto com o preço exato 😊';
  }

  if (/foto|imagem|m[ií]dia|v[ií]deo/.test(lower)) {
    if (/it[aá]lia/.test(lower)) return '[MEDIA_SEND:CABECEIRA_ITALIA]';
    if (/dubai/.test(lower)) return '[MEDIA_SEND:CABECEIRA_DUBAI]';
    if (/malta/.test(lower)) return '[MEDIA_SEND:CABECEIRA_MALTA]';
    if (/alfa slim/.test(lower)) return '[MEDIA_SEND:CABECEIRA_ALFA_SLIM]';
    return '{nome}, antes de enviar mídia preciso confirmar tamanho e modelo certinho 😊';
  }

  if (!/cabeceira|colch[aã]o|cama|box/.test(lower)) {
    return 'Olá! Você procura cabeceira, colchão, cama ou box baú? 😊';
  }
  if (!/solteiro|solteir[aã]o|casal|queen|king/.test(lower)) {
    return '{nome}, qual tamanho você procura?';
  }
  if (!/it[aá]lia|dubai|malta|alfa slim|safira|garnet|seletto|aquariuns|marfim|sporting/.test(lower)) {
    return '{nome}, qual modelo você deseja?';
  }

  return '{nome}, perfeito! Posso te ajudar com valores, mídia ou link do modelo escolhido.';
}

async function generateClientMessage(persona, history, turn) {
  const clientSystemPrompt = `Você é um cliente real da loja Mania de Lençóis.
Persona: ${persona.name}
Descrição: ${persona.description}
Objetivo: ${persona.objective}

Regras:
- NÃO use roteiro fixo.
- Responda de forma natural, curta e variada.
- Teste o atendente com dúvidas reais.
- Não invente que é IA.
`;

  try {
    return await callMistralWithRetry(
      clientSystemPrompt,
      history,
      0.95,
      140
    );
  } catch (error) {
    if (/429|rate|limit|overload|temporar/i.test(String(error?.message || error))) {
      return fallbackClientMessage(persona.name, turn);
    }
    throw error;
  }
}

async function generateAgentMessage(promptText, history) {
  const agentSystemPrompt = `${promptText}

REGRAS DE EXECUÇÃO PARA TESTE IA-vs-IA:
- Siga estritamente o prompt acima.
- Nunca invente preços.
- Se enviar mídia, inclua token [MEDIA_SEND:NOME_DA_MIDIA].
- Se enviar link, envie SOMENTE a URL na mensagem.
- Responda sempre em português.
`;

  try {
    return await callMistralWithRetry(agentSystemPrompt, history, 0.3, 260);
  } catch (error) {
    if (/429|rate|limit|overload|temporar/i.test(String(error?.message || error))) {
      return fallbackAgentMessage(history);
    }
    throw error;
  }
}

async function resolveMistralKey() {
  if (MISTRAL_API_KEY) return MISTRAL_API_KEY;
  if (!process.env.DATABASE_URL) return null;

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const client = await pool.connect();
  try {
    const res = await client.query(
      "SELECT valor FROM system_config WHERE chave = 'mistral_api_key' LIMIT 1"
    );
    const dbKey = res.rows?.[0]?.valor || null;
    if (dbKey) {
      MISTRAL_API_KEY = dbKey;
      return dbKey;
    }
    return null;
  } finally {
    client.release();
    await pool.end();
  }
}

function detectProduct(text) {
  if (/cabeceira/i.test(text)) return 'cabeceira';
  if (/colch[aã]o|cama|box/i.test(text)) return 'colchao_cama_box';
  if (/kit len[cç]ol|len[cç]ol|fronha/i.test(text)) return 'kit_lencol';
  return null;
}

function detectSize(text) {
  if (/solteir[aã]o/i.test(text)) return 'solteirao';
  if (/solteiro/i.test(text)) return 'solteiro';
  if (/casal/i.test(text)) return 'casal';
  if (/queen/i.test(text)) return 'queen';
  if (/king/i.test(text)) return 'king';
  return null;
}

function detectModel(text) {
  const candidates = [
    'itália', 'italia', 'dubai', 'malta', 'alfa slim',
    'safira', 'garnet', 'seletto', 'aquariuns', 'marfim', 'sporting'
  ];
  const found = candidates.find(model => new RegExp(model, 'i').test(text));
  return found || null;
}

function hasExplicitLinkRequest(text) {
  return /manda.*link|envia.*link|quero.*link|pode.*link/i.test(text);
}

function hasExplicitMediaPermission(text) {
  return /pode enviar|manda (a )?(foto|imagem|v[ií]deo)|envia (a )?(foto|imagem|v[ií]deo)/i.test(text);
}

function hasPrice(text) {
  return /r\$\s?\d/i.test(text);
}

function hasUrl(text) {
  return /https?:\/\//i.test(text);
}

function hasMediaSend(text) {
  return /\[MEDIA_SEND:[^\]]+\]/i.test(text) || /enviei.*(foto|imagem|v[ií]deo)|segue.*(foto|imagem|v[ií]deo)/i.test(text);
}

function isLinkOnlyMessage(text) {
  const trimmed = text.trim();
  return /^https?:\/\//i.test(trimmed) && !/\s/.test(trimmed.replace(/^https?:\/\//i, '').trim());
}

function evaluateTurn(state, clientMessage, agentMessage) {
  const violations = [];

  const product = detectProduct(clientMessage);
  if (product && product !== state.currentProduct) {
    state.currentProduct = product;
    state.size = null;
    state.model = null;
    state.linkRequested = false;
    state.mediaAllowed = false;
  }

  const size = detectSize(clientMessage);
  if (size) state.size = size;

  const model = detectModel(clientMessage);
  if (model) state.model = model;

  if (hasExplicitLinkRequest(clientMessage)) state.linkRequested = true;
  if (hasExplicitMediaPermission(clientMessage)) state.mediaAllowed = true;

  const qualified = Boolean(state.currentProduct && state.size && state.model);

  if (hasPrice(agentMessage) && !qualified) {
    violations.push('preco_antes_qualificacao');
  }

  if (hasMediaSend(agentMessage) && (!qualified || !state.mediaAllowed)) {
    violations.push('midia_antecipada');
  }

  if (state.currentProduct === 'cabeceira' && hasMediaSend(agentMessage) && /colch[aã]o|cama|box/i.test(agentMessage)) {
    violations.push('midia_produto_errado');
  }

  if (hasUrl(agentMessage) && (!qualified || !state.linkRequested)) {
    violations.push('link_antecipado');
  }

  if (hasUrl(agentMessage) && qualified && state.linkRequested && !isLinkOnlyMessage(agentMessage)) {
    violations.push('link_com_texto');
  }

  return violations;
}

async function runPersona(promptText, persona) {
  const transcript = [];
  const agentHistory = [];
  const clientHistory = [];
  const state = {
    currentProduct: null,
    size: null,
    model: null,
    linkRequested: false,
    mediaAllowed: false,
  };
  const violations = [];

  const firstClientMessage = await generateClientMessage(
    persona,
    [{ role: 'user', content: 'Inicie a conversa de forma natural com o atendente.' }],
    0
  );

  let clientMessage = firstClientMessage;

  const MAX_TURNS = 10;
  for (let turn = 1; turn <= MAX_TURNS; turn++) {
    transcript.push({ turn, speaker: 'cliente', message: clientMessage });
    agentHistory.push({ role: 'user', content: clientMessage });
    clientHistory.push({ role: 'assistant', content: clientMessage });

    const agentMessage = await generateAgentMessage(promptText, agentHistory);
    transcript.push({ turn, speaker: 'agente', message: agentMessage });
    agentHistory.push({ role: 'assistant', content: agentMessage });
    clientHistory.push({ role: 'user', content: agentMessage });

    const turnViolations = evaluateTurn(state, clientMessage, agentMessage);
    if (turnViolations.length > 0) {
      for (const violation of turnViolations) {
        violations.push({ turn, violation, clientMessage, agentMessage });
      }
    }

    clientMessage = await generateClientMessage(
      persona,
      [
        ...clientHistory,
        { role: 'user', content: 'Continue a conversa naturalmente em 1-2 frases.' }
      ],
      turn
    );

    // ⏱️ Respeitar rate limit mistral-medium (~10.5 req/min = ~6s por request)
    await sleep(INTER_TURN_DELAY_MS);
  }

  return {
    persona: persona.name,
    passed: violations.length === 0,
    violations,
    transcript,
  };
}

async function main() {
  if (!fs.existsSync(PROMPT_FILE)) {
    throw new Error(`Arquivo de prompt não encontrado: ${PROMPT_FILE}`);
  }

  await resolveMistralKey();

  if (!MISTRAL_API_KEY) {
    throw new Error('MISTRAL_API_KEY não configurada. Defina no ambiente/.env antes de rodar.');
  }

  const promptText = fs.readFileSync(PROMPT_FILE, 'utf8');
  const personaResults = [];

  for (const persona of PERSONAS) {
    console.log(`\n▶ Rodando persona: ${persona.name}`);
    let done = false;
    let attempt = 0;

    while (!done && attempt < 3) {
      attempt += 1;
      try {
        const result = await runPersona(promptText, persona);
        personaResults.push({ ...result, attempts: attempt, infraError: null });
        console.log(`   ${result.passed ? '✅ PASSOU' : '❌ FALHOU'} | violações: ${result.violations.length} | tentativa: ${attempt}`);
        done = true;
        if (personaResults.length < PERSONAS.length) {
          console.log(`   ⏸️ Aguardando ${INTER_PERSONA_DELAY_MS / 1000}s antes da próxima persona...`);
          await sleep(INTER_PERSONA_DELAY_MS);
        }
      } catch (error) {
        const message = String(error?.message || error || 'erro desconhecido');
        const retryable = /429|rate|limit|overload|temporar/i.test(message);
        if (!retryable || attempt >= 3) {
          personaResults.push({
            persona: persona.name,
            passed: false,
            violations: [{ turn: 0, violation: 'infra_error', clientMessage: '', agentMessage: message }],
            transcript: [],
            attempts: attempt,
            infraError: message,
          });
          console.log(`   ❌ FALHA DE INFRA | tentativa: ${attempt}`);
          done = true;
        } else {
          const waitMs = 30000 * attempt;
          console.log(`   ⚠️ Rate limit detectado. Aguardando ${Math.round(waitMs / 1000)}s para retry da persona...`);
          await sleep(waitMs);
        }
      }
    }
  }

  const totalViolations = personaResults.reduce((acc, item) => acc + item.violations.length, 0);
  const passedAll = totalViolations === 0 && personaResults.every(item => item.passed);

  const summary = {
    timestamp: new Date().toISOString(),
    promptFile: PROMPT_FILE,
    model: MODEL,
    totalPersonas: PERSONAS.length,
    passedPersonas: personaResults.filter(x => x.passed).length,
    totalViolations,
    passedAll,
    results: personaResults,
  };

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(summary, null, 2), 'utf8');

  console.log('\n=== RESULTADO FINAL ===');
  console.log(`Personas aprovadas: ${summary.passedPersonas}/${summary.totalPersonas}`);
  console.log(`Violações totais: ${summary.totalViolations}`);
  console.log(`Status: ${passedAll ? '✅ 100% APROVADO' : '❌ NECESSITA AJUSTE'}`);
  console.log(`Arquivo: ${OUTPUT_FILE}`);

  if (!passedAll) process.exitCode = 1;
}

main().catch(error => {
  console.error('❌ Erro na simulação IA vs IA:', error.message);
  process.exit(1);
});
