/*
  Local simulation for: interpret -> flow decide -> humanize.
  Adds multi-turn calibration for missing data.
  No external calls. ASCII only.
*/


function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(message + ` (expected=${expected}, got=${actual})`);
  }
}

function assertTrue(value, message) {
  if (!value) {
    throw new Error(message);
  }
}

function selectFlowType(modules) {
  if (modules.delivery) return 'DELIVERY';
  if (modules.catalog) return 'VENDAS';
  if (modules.scheduling) return 'AGENDAMENTO';
  return 'GENERICO';
}

function parseBusinessType(prompt) {
  const text = prompt.toLowerCase();
  if (text.includes('delivery') || text.includes('cardapio')) return 'DELIVERY';
  if (text.includes('agendamento') || text.includes('agenda')) return 'AGENDAMENTO';
  if (text.includes('produto') || text.includes('catalogo')) return 'VENDAS';
  if (text.includes('curso')) return 'VENDAS';
  return 'GENERICO';
}

function buildFlow(flowType, data) {
  const base = {
    type: flowType,
    data,
    actions: {},
    states: {},
    initialState: 'START'
  };

  if (flowType === 'DELIVERY') {
    base.actions = {
      GREET: 'Ola, posso ajudar com o pedido?',
      SHOW_MENU: 'Segue o cardapio: {menu_items}',
      ASK_ADDRESS: 'Qual o endereco para entrega?',
      FINISH: 'Pedido confirmado. Tempo estimado: {delivery_time}.'
    };
    base.states.START = {
      transitions: [
        { intent: 'GREETING', action: 'GREET' },
        { intent: 'WANT_MENU', action: 'SHOW_MENU' },
        { intent: 'START_ORDER', action: 'ASK_ADDRESS' }
      ]
    };
  } else if (flowType === 'AGENDAMENTO') {
    base.actions = {
      GREET: 'Ola, quer agendar um horario?',
      ASK_DATE: 'Qual a data desejada?',
      ASK_TIME: 'Qual horario?',
      CONFIRM: 'Agendamento solicitado para {date} as {time}.'
    };
    base.states.START = {
      transitions: [
        { intent: 'GREETING', action: 'GREET' },
        { intent: 'WANT_SCHEDULE', action: 'ASK_DATE' },
        { intent: 'PROVIDE_DATE', action: 'ASK_TIME' },
        { intent: 'PROVIDE_TIME', action: 'CONFIRM' }
      ]
    };
  } else if (flowType === 'VENDAS') {
    base.actions = {
      GREET: 'Ola, posso te ajudar com nossos produtos?',
      SHOW_PRODUCTS: 'Catalogo: {products}',
      ASK_PRICE: 'O preco do item e {price}. Quer o link?',
      ASK_INFO: 'Posso explicar o conteudo: {content}.',
      SEND_LINK: 'Aqui esta o link: {link}'
    };
    base.states.START = {
      transitions: [
        { intent: 'GREETING', action: 'GREET' },
        { intent: 'WANT_CATALOG', action: 'SHOW_PRODUCTS' },
        { intent: 'ASK_PRICE', action: 'ASK_PRICE' },
        { intent: 'ASK_INFO', action: 'ASK_INFO' },
        { intent: 'ASK_LINK', action: 'SEND_LINK' }
      ]
    };
  } else {
    base.actions = {
      GREET: 'Ola, como posso ajudar?',
      FALLBACK: 'Consigo ajudar com informacoes sobre nossos servicos. O que voce precisa?'
    };
    base.states.START = {
      transitions: [
        { intent: 'GREETING', action: 'GREET' }
      ]
    };
  }

  return base;
}

function interpretMessage(message) {
  const text = message.toLowerCase();
  if (/^(oi|ola|bom dia|boa tarde|boa noite)\b/.test(text)) return 'GREETING';
  if (text.includes('cardapio') || text.includes('menu')) return 'WANT_MENU';
  if (text.includes('pedido') || text.includes('pedir')) return 'START_ORDER';
  if (text.includes('agendar') || text.includes('agenda') || text.includes('horario')) return 'WANT_SCHEDULE';
  if (text.includes('dia') || text.includes('data')) return 'PROVIDE_DATE';
  if (text.match(/\d{1,2}h|\d{1,2}:\d{2}/)) return 'PROVIDE_TIME';
  if (text.includes('conteudo') || text.includes('o que tem') || text.includes('como funciona')) return 'ASK_INFO';
  if (text.includes('quais cursos') || text.includes('lista de cursos')) return 'WANT_CATALOG';
  if (text.includes('catalogo') || text.includes('produtos') || text.includes('lista') || text.includes('cursos')) return 'WANT_CATALOG';
  if (text.includes('preco') || text.includes('valor') || text.includes('custa')) return 'ASK_PRICE';
  if (text.includes('link') || text.includes('comprar') || text.includes('inscrever')) return 'ASK_LINK';
  return 'FALLBACK';
}

function renderTemplate(template, data) {
  return template
    .replace('{menu_items}', data.menu_items.join(', '))
    .replace('{delivery_time}', data.delivery_time)
    .replace('{products}', data.products.join(', '))
    .replace('{price}', data.price)
    .replace('{content}', data.content)
    .replace('{link}', data.link)
    .replace('{date}', data.date)
    .replace('{time}', data.time);
}

function respond(flow, intent) {
  const state = flow.states[flow.initialState];
  const transition = state.transitions.find(t => t.intent === intent);
  const actionKey = transition ? transition.action : 'FALLBACK';
  const template = flow.actions[actionKey] || flow.actions.FALLBACK || '';
  return renderTemplate(template, flow.data);
}

function calibrateMissing(flow) {
  const missing = [];
  if (flow.type === 'DELIVERY') {
    if (!flow.data.menu_items || flow.data.menu_items.length === 0) missing.push('menu_items');
    if (!flow.data.delivery_time) missing.push('delivery_time');
  } else if (flow.type === 'AGENDAMENTO') {
    if (!flow.data.date) missing.push('date');
    if (!flow.data.time) missing.push('time');
  } else if (flow.type === 'VENDAS') {
    if (!flow.data.products || flow.data.products.length === 0) missing.push('products');
    if (!flow.data.price) missing.push('price');
    if (!flow.data.link) missing.push('link');
  }
  return missing;
}

function applyCalibrationAnswers(flow, answers) {
  if (answers.menu_items) flow.data.menu_items = answers.menu_items;
  if (answers.delivery_time) flow.data.delivery_time = answers.delivery_time;
  if (answers.date) flow.data.date = answers.date;
  if (answers.time) flow.data.time = answers.time;
  if (answers.products) flow.data.products = answers.products;
  if (answers.price) flow.data.price = answers.price;
  if (answers.link) flow.data.link = answers.link;
  if (answers.content) flow.data.content = answers.content;
}

function runScenario(scenario) {
  const flowType = selectFlowType(scenario.modules);
  const inferred = parseBusinessType(scenario.prompt);
  const chosen = flowType !== 'GENERICO' ? flowType : inferred;
  const flow = buildFlow(chosen, scenario.data);

  const missingBefore = calibrateMissing(flow);
  if (missingBefore.length > 0 && scenario.calibrationAnswers) {
    applyCalibrationAnswers(flow, scenario.calibrationAnswers);
  }
  const missingAfter = calibrateMissing(flow);

  const results = [];
  for (const msg of scenario.messages) {
    const intent = interpretMessage(msg);
    const reply = respond(flow, intent);
    results.push({ msg, intent, reply });
  }

  const okType = chosen === scenario.expectedFlow;
  const okReplies = results.every(r => r.reply && !r.reply.includes('undefined'));

  return { okType, okReplies, chosen, results, missingBefore, missingAfter };
}

const bigProductList = Array.from({ length: 500 }, (_, i) => `Item${i + 1}`);

const scenarios = [
  {
    name: 'Delivery',
    modules: { delivery: true, catalog: false, scheduling: false },
    prompt: 'Restaurante com delivery e cardapio',
    data: { menu_items: ['Pizza', 'Lanche'], delivery_time: '40-60 min', products: [], price: '', content: '', link: '', date: '', time: '' },
    messages: ['Oi', 'Me manda o cardapio', 'Quero fazer um pedido'],
    expectedFlow: 'DELIVERY'
  },
  {
    name: 'Agendamento clinica',
    modules: { delivery: false, catalog: false, scheduling: true },
    prompt: 'Clinica com agendamento',
    data: { menu_items: [], delivery_time: '', products: [], price: '', content: '', link: '', date: 'amanha', time: '14:00' },
    messages: ['Ola', 'Quero agendar', 'data amanha', '14:00'],
    expectedFlow: 'AGENDAMENTO'
  },
  {
    name: 'Produto unico com link',
    modules: { delivery: false, catalog: true, scheduling: false },
    prompt: 'Produto unico com pagina de compra',
    data: { menu_items: [], delivery_time: '', products: ['Produto X'], price: '197', content: 'Beneficios do Produto X', link: 'https://exemplo.com/compra', date: '', time: '' },
    messages: ['Oi', 'Quanto custa?', 'Me manda o link'],
    expectedFlow: 'VENDAS'
  },
  {
    name: 'Curso com escolha e calibracao',
    modules: { delivery: false, catalog: true, scheduling: false },
    prompt: 'Cursos online com catalogo',
    data: { menu_items: [], delivery_time: '', products: [], price: '', content: 'Aulas gravadas e suporte', link: '', date: '', time: '' },
    calibrationAnswers: {
      products: ['Curso A', 'Curso B', 'Curso C'],
      price: '497',
      link: 'https://exemplo.com/curso'
    },
    messages: ['Ola', 'Quais cursos tem?', 'O que tem no curso?', 'Quanto custa?', 'Me manda o link'],
    expectedFlow: 'VENDAS'
  },
  {
    name: 'Distribuidora 500 produtos',
    modules: { delivery: false, catalog: true, scheduling: false },
    prompt: 'Distribuidora com lista grande de produtos',
    data: { menu_items: [], delivery_time: '', products: bigProductList, price: 'sob consulta', content: 'Lista completa disponivel', link: 'https://exemplo.com/catalogo', date: '', time: '' },
    messages: ['Oi', 'Quero a lista de produtos', 'Me manda o link'],
    expectedFlow: 'VENDAS'
  }
];

let failed = 0;
for (const scenario of scenarios) {
  const result = runScenario(scenario);
  console.log('---');
  console.log('Scenario:', scenario.name);
  console.log('Flow expected:', scenario.expectedFlow, 'got:', result.chosen);
  console.log('Missing before:', result.missingBefore.join(', ') || 'none');
  console.log('Missing after:', result.missingAfter.join(', ') || 'none');
  console.log('Replies ok:', result.okReplies);
  for (const r of result.results) {
    console.log('User:', r.msg);
    console.log('Intent:', r.intent);
    console.log('Reply:', r.reply);
  }

  try {
    assertEqual(result.chosen, scenario.expectedFlow, `Flow mismatch in ${scenario.name}`);
    assertTrue(result.okReplies, `Empty reply in ${scenario.name}`);
    assertTrue(result.missingAfter.length === 0, `Calibration incomplete in ${scenario.name}`);
  } catch (err) {
    failed += 1;
    console.log('ASSERT FAIL:', err.message);
  }
}

if (failed > 0) {
  console.log('FAILED:', failed, 'scenarios');
  process.exit(1);
}

console.log('All scenarios passed.');
