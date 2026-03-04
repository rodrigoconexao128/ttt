import fs from 'node:fs';
import path from 'node:path';

const promptPath = path.resolve('prompt-mania-calibrado-v1.txt');

function loadPrompt() {
  if (!fs.existsSync(promptPath)) {
    throw new Error(`Prompt não encontrado: ${promptPath}`);
  }
  return fs.readFileSync(promptPath, 'utf8');
}

function createAgent() {
  const state = {
    product: null,
    size: null,
    model: null,
    explicitMediaPermission: false,
    explicitLinkRequest: false,
  };

  function isQualifiedForLink() {
    return Boolean(state.product && state.size && state.model);
  }

  function detectProduct(text) {
    if (/cabeceira/i.test(text)) return 'cabeceira';
    if (/colch[aã]o|cama|box/i.test(text)) return 'colchao_cama_box';
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
    if (/it[aá]lia/i.test(text)) return 'italia';
    if (/dubai/i.test(text)) return 'dubai';
    if (/malta/i.test(text)) return 'malta';
    if (/alfa slim/i.test(text)) return 'alfa slim';
    return null;
  }

  function respond(message) {
    const text = message.toLowerCase();

    const product = detectProduct(text);
    if (product && product !== state.product) {
      state.product = product;
      state.size = null;
      state.model = null;
      state.explicitMediaPermission = false;
      state.explicitLinkRequest = false;
    }

    const size = detectSize(text);
    if (size) state.size = size;

    const model = detectModel(text);
    if (model) state.model = model;

    if (/pode enviar|manda foto|envia a imagem/i.test(text)) {
      state.explicitMediaPermission = true;
    }

    if (/manda o link|envia o link|quero o link/i.test(text)) {
      state.explicitLinkRequest = true;
      if (!isQualifiedForLink()) {
        return '{nome}, te envio sim 😊 Antes preciso só confirmar produto, tamanho e modelo para mandar o link certo.';
      }
      return 'https://drive.google.com/drive/folders/exemplo-link-correto';
    }

    if (/quanto|pre[cç]o|valor/i.test(text)) {
      if (!(state.product && state.size && state.model)) {
        return '{nome}, para não te passar valor incorreto, vou confirmar agora e já volto com o preço exato 😊';
      }
      return '{nome}, preço sob consulta após validação de estoque. Vou confirmar e te retorno o valor exato 😊';
    }

    if (/foto|imagem|v[ií]deo/i.test(text)) {
      if (!(state.product && state.size && state.model && state.explicitMediaPermission)) {
        return '{nome}, antes de enviar a mídia, preciso confirmar produto, tamanho e modelo certinho 😊';
      }
      if (state.product === 'cabeceira') {
        if (state.model === 'italia') return 'MIDIA: CABECEIRA_ITALIA';
        if (state.model === 'dubai') return 'MIDIA: CABECEIRA_DUBAI';
        if (state.model === 'malta') return 'MIDIA: CABECEIRA_MALTA';
        if (state.model === 'alfa slim') return 'MIDIA: CABECEIRA_ALFA_SLIM';
        return 'MIDIA: CABECEIRA_MODELO_CONFIRMADO';
      }
      return 'MIDIA: PRODUTO_QUALIFICADO';
    }

    if (!state.product) return 'Olá! Para te atender certinho, você busca cabeceira, colchão, cama ou box baú? 😊';
    if (!state.size) return '{nome}, qual tamanho você procura? (solteiro, solteirão, casal, queen ou king)';
    if (!state.model) return '{nome}, qual modelo você deseja?';
    return '{nome}, perfeito! Posso te ajudar com valores, mídia ou link do modelo escolhido.';
  }

  return { respond };
}

function runScenario(name, turns, validator) {
  const agent = createAgent();
  const transcript = [];
  for (const userMessage of turns) {
    const agentMessage = agent.respond(userMessage);
    transcript.push({ user: userMessage, agent: agentMessage });
  }
  const result = validator(transcript);
  return { name, passed: result.passed, reason: result.reason, transcript };
}

function hasPrice(text) {
  return /r\$\s?\d/i.test(text);
}

function hasLink(text) {
  return /https?:\/\//i.test(text);
}

function main() {
  const prompt = loadPrompt();
  const requiredAnchors = [
    '🚫 BLOQUEIO CRÍTICO (PREÇO, MÍDIA E LINK)',
    'Nunca enviar mídia de colchão/cama/box durante conversa de cabeceira.',
    'Link deve ir em **mensagem separada**, contendo **apenas o link**.',
  ];

  const missingAnchors = requiredAnchors.filter(anchor => !prompt.includes(anchor));

  const scenarios = [
    runScenario(
      'Preço não pode sair antes da qualificação',
      [
        'Quero saber o preço',
        'É de cabeceira',
        'queen',
        'modelo itália',
        'agora qual o preço?'
      ],
      (transcript) => {
        const early = transcript.slice(0, 4).some(t => hasPrice(t.agent));
        const finalMsg = transcript[4]?.agent || '';
        const passed = !early && !hasPrice(finalMsg);
        return {
          passed,
          reason: passed
            ? 'Não enviou valor numérico antes nem depois sem validação de estoque.'
            : 'Detectado valor numérico em resposta de preço.'
        };
      }
    ),
    runScenario(
      'Mídia correta para cabeceira (sem colchão)',
      [
        'Quero cabeceira',
        'queen',
        'modelo itália',
        'pode enviar a imagem'
      ],
      (transcript) => {
        const last = transcript[3]?.agent || '';
        const passed = /MIDIA: CABECEIRA_ITALIA/i.test(last) && !/COLCH/i.test(last);
        return {
          passed,
          reason: passed
            ? 'Enviou somente mídia de cabeceira Itália.'
            : 'Mídia enviada não corresponde ao produto/modelo esperado.'
        };
      }
    ),
    runScenario(
      'Link só depois de pedido explícito e qualificação',
      [
        'manda o link',
        'cabeceira',
        'casal',
        'modelo dubai',
        'quero o link'
      ],
      (transcript) => {
        const first = transcript[0]?.agent || '';
        const final = transcript[4]?.agent || '';
        const blockedEarly = !hasLink(first);
        const sentAfter = /^https?:\/\//i.test(final);
        return {
          passed: blockedEarly && sentAfter,
          reason: blockedEarly && sentAfter
            ? 'Bloqueou link cedo e enviou somente URL após qualificação.'
            : 'Link foi enviado fora da ordem esperada.'
        };
      }
    )
  ];

  const summary = {
    timestamp: new Date().toISOString(),
    promptPath,
    missingAnchors,
    total: scenarios.length,
    passed: scenarios.filter(s => s.passed).length,
    failed: scenarios.filter(s => !s.passed).length,
    scenarios,
  };

  const outputPath = path.resolve(`resultado-mania-ia-vs-ia-${Date.now()}.json`);
  fs.writeFileSync(outputPath, JSON.stringify(summary, null, 2), 'utf8');

  console.log('=== SIMULAÇÃO MANIA IA vs IA ===');
  console.log(`Prompt: ${promptPath}`);
  console.log(`Âncoras ausentes: ${missingAnchors.length}`);
  console.log(`Cenários aprovados: ${summary.passed}/${summary.total}`);
  console.log(`Resultado salvo em: ${outputPath}`);

  if (summary.failed > 0 || missingAnchors.length > 0) {
    process.exitCode = 1;
  }
}

main();