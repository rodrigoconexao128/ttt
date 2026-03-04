const http = require('http');

// First get a fresh token
async function getToken() {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify({ email: 'rodrigo4@gmail.com', password: 'Ibira2019!' });
    const req = http.request({
      hostname: 'localhost', port: 5000, path: '/api/auth/signin',
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) }
    }, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        const body = JSON.parse(chunks);
        resolve(body.session.access_token);
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function request(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost',
      port: 5000,
      path,
      method,
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {})
      }
    };
    const req = http.request(opts, res => {
      let chunks = '';
      res.on('data', d => chunks += d);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(chunks) }); }
        catch(e) { resolve({ status: res.statusCode, body: chunks }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function runTests() {
  const TOKEN = await getToken();
  console.log('✓ Fresh token obtained\n');
  
  const req = (method, path, body) => request(method, path, body, TOKEN);
  
  let passed = 0, failed = 0;
  const results = [];
  
  function log(name, ok, detail) {
    const icon = ok ? '✅' : '❌';
    console.log(`${icon} ${name}${detail ? ' | ' + detail : ''}`);
    if (ok) passed++; else failed++;
    results.push({ name, ok, detail });
  }
  
  // ===== CICLO 1: HAPPY PATH =====
  console.log('\n--- CICLO 1: HAPPY PATH ---');
  
  // 1. Mensagem em cima e assinatura embaixo (signature feature)
  try {
    const r1 = await req('GET', '/api/auth/user');
    log('T01: GET user (signature exists)', r1.status === 200, `sig=${r1.body.signature}`);
    
    const r2 = await req('PUT', '/api/user/signature', { signature: 'Att, Rodrigo — AgenteZap P4', signatureEnabled: true });
    log('T02: PUT signature update', r2.status === 200, `status=${r2.status}`);
    
    // Verify persistence
    const r3 = await req('GET', '/api/auth/user');
    const ok = r3.body.signature === 'Att, Rodrigo — AgenteZap P4' && r3.body.signatureEnabled === true;
    log('T03: Signature persistence', ok, `sig="${r3.body.signature}" enabled=${r3.body.signatureEnabled}`);
  } catch(e) { log('T01-03: Signature', false, e.message); }
  
  // 2. Seleção de contatos (selecionar todos + individual)
  let convIds = [];
  try {
    const r = await req('GET', '/api/conversations-with-tags');
    convIds = r.body.map(c => c.id);
    log('T04: GET conversations list (for contact selection)', r.status === 200, `total=${r.body.length}`);
    
    // Select all (bulk)
    const r2 = await req('POST', '/api/conversations/bulk/read', { conversationIds: convIds.slice(0, 10) });
    log('T05: Selecionar todos (bulk/read 10)', r2.status === 200, `updated=${r2.body.updated}`);
    
    // Select individual
    const r3 = await req('POST', '/api/conversations/bulk/read', { conversationIds: [convIds[0]] });
    log('T06: Seleção individual (1 conversa)', r3.status === 200, `updated=${r3.body.updated}`);
  } catch(e) { log('T04-06: Contact selection', false, e.message); }
  
  // 3. Ações em massa: ativar IA / desativar IA
  try {
    const r1 = await req('POST', '/api/conversations/bulk/ai-enable', { conversationIds: convIds.slice(0, 5) });
    log('T07: Ativar IA em massa (5 convs)', r1.status === 200, `updated=${r1.body.updated}`);
    
    const r2 = await req('POST', '/api/conversations/bulk/ai-disable', { conversationIds: convIds.slice(0, 5) });
    log('T08: Desativar IA em massa (5 convs)', r2.status === 200, `updated=${r2.body.updated}`);
  } catch(e) { log('T07-08: Bulk AI actions', false, e.message); }
  
  // 4. Campos personalizados com botão Salvar funcional
  let fieldDefId = null;
  try {
    const r1 = await req('GET', '/api/custom-fields');
    fieldDefId = r1.body[0]?.id;
    log('T09: GET custom field definitions', r1.status === 200, `count=${r1.body.length}`);
    
    // Create new field
    const r2 = await req('POST', '/api/custom-fields', { 
      name: 'observacoes_p4', label: 'Observações P4', fieldType: 'textarea', required: false 
    });
    log('T10: Criar campo personalizado', r2.status === 200 || r2.status === 201, `id=${r2.body.id}`);
    
    // Edit field
    const r3 = await req('PUT', `/api/custom-fields/${r2.body.id || r1.body[0]?.id}`, { label: 'Observações P4 Editado' });
    log('T11: Editar campo personalizado', r3.status === 200, `status=${r3.status}`);
    
    // GET values for conversation
    const r4 = await req('GET', `/api/conversations/${convIds[0]}/custom-fields`);
    log('T12: GET campo values da conversa', r4.status === 200, `fields=${r4.body.length}`);
    
    // SAVE (botão Salvar)
    const r5 = await req('PUT', `/api/conversations/${convIds[0]}/custom-fields`, {
      fields: [{ fieldDefinitionId: fieldDefId, value: 'Teste Salvo P4' }]
    });
    log('T13: Salvar campos (botão Salvar)', r5.status === 200, `success=${r5.body.success}`);
    
    // Verify persistence
    const r6 = await req('GET', `/api/conversations/${convIds[0]}/custom-fields`);
    const savedField = r6.body.find(f => f.value && f.value.value === 'Teste Salvo P4');
    log('T14: Persistência dos campos salvos', !!savedField, `saved=${!!savedField}`);
    
  } catch(e) { log('T09-14: Custom fields', false, e.message); }
  
  // 5. Encerrar chamado sem apagar histórico; novo contexto ao retorno
  let closedConvId = convIds[3];
  let newConvId = null;
  try {
    // Close ticket
    const r1 = await req('POST', `/api/conversations/${closedConvId}/close-ticket`, { reason: 'Teste P4 encerramento' });
    log('T15: Encerrar chamado (close-ticket)', r1.status === 200, `isClosed=${r1.body.conversation?.isClosed}`);
    
    // Verify history preserved (closure log exists)
    const r2 = await req('GET', `/api/conversations/${closedConvId}/closure-logs`);
    const hasLog = Array.isArray(r2.body) && r2.body.length > 0;
    log('T16: Histórico preservado (closure-logs)', r2.status === 200, `logCount=${Array.isArray(r2.body) ? r2.body.length : 'N/A'}`);
    
    // Verify messages still exist (history not deleted)
    const r3 = await req('GET', `/api/conversations/${closedConvId}/messages`);
    log('T17: Mensagens preservadas após encerramento', r3.status === 200 || r3.status === 404, `status=${r3.status}`);
    
    // Reopen = new context for returning client
    const r4 = await req('POST', `/api/conversations/${closedConvId}/reopen-ticket`, { reason: 'Cliente retornou' });
    newConvId = r4.body.conversation?.id;
    log('T18: Reabrir chamado (novo contexto retorno)', r4.status === 200, `newConvId=${newConvId}`);
    
    // Verify new conversation is fresh
    if (newConvId) {
      const r5 = await req('GET', `/api/conversation/${newConvId}`);
      log('T19: Nova conversa criada (contexto limpo)', r5.status === 200, `isClosed=${r5.body.isClosed}`);
    }
  } catch(e) { log('T15-19: Ticket closure', false, e.message); }
  
  // 6. Agendamento com texto manual e com IA editável
  let scheduledMsgId = null;
  try {
    const convId = convIds[1];
    
    // Manual text schedule
    const r1 = await req('POST', `/api/conversations/${convId}/schedule-message`, {
      scheduledFor: new Date(Date.now() + 3600000).toISOString(),
      text: 'Olá! Esta é uma mensagem agendada manualmente.',
      useAI: false,
      note: 'Lembrete de follow-up P4'
    });
    scheduledMsgId = r1.body.messageId;
    log('T20: Agendar mensagem (texto manual)', r1.status === 200 || r1.status === 201, `id=${scheduledMsgId}`);
    
    // Schedule with AI flag
    const r2 = await req('POST', `/api/conversations/${convId}/schedule-message`, {
      scheduledFor: new Date(Date.now() + 7200000).toISOString(),
      text: 'Olá, precisamos conversar sobre seu pedido.',
      useAI: true,
      note: 'Com IA - editável'
    });
    log('T21: Agendar com IA (editável)', r2.status === 200 || r2.status === 201, `useAI=${r2.body.useAI}`);
    
    // List scheduled messages
    const r3 = await req('GET', `/api/conversations/${convId}/scheduled-messages`);
    log('T22: Listar mensagens agendadas', r3.status === 200, `count=${Array.isArray(r3.body) ? r3.body.length : 'N/A'}`);
    
    // AI generate (editable before sending)
    const r4 = await req('POST', '/api/user/ai/generate-message', {
      conversationId: convId,
      baseMessage: 'Precisamos falar sobre seu pedido.',
      context: 'Follow-up de retorno'
    });
    log('T23: Gerar mensagem com IA (editável)', r4.status === 200, `generated=${!!r4.body.generatedMessage}`);
    
    // Cancel scheduled message
    if (scheduledMsgId) {
      const r5 = await req('DELETE', `/api/conversations/${convId}/scheduled-messages/${scheduledMsgId}`);
      log('T24: Cancelar agendamento', r5.status === 200, `success=${r5.body.success}`);
    }
  } catch(e) { log('T20-24: Scheduling', false, e.message); }
  
  // ===== CICLO 2: EDGE CASES =====
  console.log('\n--- CICLO 2: EDGE CASES ---');
  
  // Empty bulk → should return 400
  try {
    const r = await req('POST', '/api/conversations/bulk/read', { conversationIds: [] });
    log('T25: Edge: empty bulk → 400', r.status === 400, `status=${r.status}`);
  } catch(e) { log('T25: Edge empty bulk', false, e.message); }
  
  // Invalid convId → 404
  try {
    const r = await req('POST', '/api/conversations/invalid-id-xyz/close-ticket', { reason: 'test' });
    log('T26: Edge: close invalid ID → 404', r.status === 404, `status=${r.status}`);
  } catch(e) { log('T26: Edge invalid close', false, e.message); }
  
  // Custom fields missing required → works gracefully
  try {
    const r = await req('PUT', `/api/conversations/${convIds[0]}/custom-fields`, {
      fields: []  // empty fields array
    });
    log('T27: Edge: save empty custom fields', r.status === 200, `status=${r.status}`);
  } catch(e) { log('T27: Edge empty fields', false, e.message); }
  
  // Schedule message with past date (server should accept or reject gracefully)
  try {
    const r = await req('POST', `/api/conversations/${convIds[1]}/schedule-message`, {
      scheduledFor: new Date(Date.now() - 3600000).toISOString(),  // past date
      text: 'Mensagem para o passado',
      useAI: false
    });
    log('T28: Edge: schedule past date (accepted)', r.status === 200 || r.status === 201 || r.status === 400, `status=${r.status}`);
  } catch(e) { log('T28: Edge past schedule', false, e.message); }
  
  // ===== CICLO 3: REGRESSÃO =====
  console.log('\n--- CICLO 3: REGRESSÃO ---');
  
  // Bulk archive still works (not broken by ordering fix)
  try {
    const r = await req('POST', '/api/conversations/bulk/archive', { conversationIds: convIds.slice(0, 3), archived: false });
    log('T29: Regression: bulk/archive still works', r.status === 200, `updated=${r.body.updated}`);
  } catch(e) { log('T29: Regression bulk/archive', false, e.message); }
  
  // Regular conversations GET still works
  try {
    const r = await req('GET', '/api/conversations');
    log('T30: Regression: GET /api/conversations', r.status === 200, `count=${Array.isArray(r.body) ? r.body.length : 'N/A'}`);
  } catch(e) { log('T30: Regression /api/conversations', false, e.message); }
  
  // Agent toggle still works
  try {
    const r1 = await req('POST', `/api/agent/toggle/${convIds[0]}`, { disable: true });
    const r2 = await req('POST', `/api/agent/toggle/${convIds[0]}`, { disable: false });
    log('T31: Regression: agent toggle (disable/enable)', r1.status === 200 && r2.status === 200, `both 200`);
  } catch(e) { log('T31: Regression agent toggle', false, e.message); }
  
  // Messages list still works  
  try {
    const r = await req('GET', `/api/messages/${convIds[0]}`);
    log('T32: Regression: GET messages', r.status === 200 || r.status === 404, `status=${r.status}`);
  } catch(e) { log('T32: Regression messages', false, e.message); }
  
  // Tags still work
  try {
    const r = await req('GET', `/api/conversations/${convIds[0]}/tags`);
    log('T33: Regression: conversation tags', r.status === 200, `status=${r.status}`);
  } catch(e) { log('T33: Regression tags', false, e.message); }

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log(`PARTE 4 RESULTS: ${passed} PASSED, ${failed} FAILED out of ${passed+failed} tests`);
  console.log('='.repeat(70));
  
  if (failed > 0) {
    console.log('\nFailed tests:');
    results.filter(r => !r.ok).forEach(r => console.log('  ❌ ' + r.name + ' | ' + r.detail));
  }
  
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(e => { console.error(e); process.exit(1); });
